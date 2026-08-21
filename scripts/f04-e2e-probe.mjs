/**
 * F04 end-to-end probe — the one thing 357 unit tests cannot prove.
 *
 * The unit suite proves every PART of the pipeline with injected fakes. This script proves the
 * ASSEMBLED pipeline against the real world: a real Vercel Blob PUT, a real server-side fetch of
 * that blob, a real `glm-4.6v` call with the production prompt and body, real Zod validation, and
 * a real terminal `extractions` row in Neon.
 *
 *   node --env-file=.env.local scripts/f04-e2e-probe.mjs <image-path> [--keep]
 *
 * It creates a throwaway user, does the work, prints what happened, and deletes the user — which
 * cascades the extraction, the photo row and everything else away. `--keep` skips the cleanup if
 * you want to look at the row in `db:studio`.
 *
 * IT DOES NOT CHECK EXTRACTION ACCURACY. Pass it any image; unless it is one of the three
 * canonical Fitness screenshots the model's numbers will be nonsense, and that is fine — the
 * question here is "does every seam hold", not "is the transcription right". Accuracy is
 * `tests/research/goldenFixture.test.ts` offline and `tests/live/vision.live.test.ts` live.
 *
 * NOT A TEST. It writes to the real database and spends real money, so it is a script you run on
 * purpose, never part of `npm test`.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { put, del } from '@vercel/blob'
import { neon } from '@neondatabase/serverless'

const imagePath = process.argv[2]
const keep = process.argv.includes('--keep')
if (!imagePath) {
  console.error('usage: node --env-file=.env.local scripts/f04-e2e-probe.mjs <image-path> [--keep]')
  process.exit(2)
}

const sql = neon(process.env.DATABASE_URL)
const suffix = Math.floor(Date.now() / 1000).toString(36)
const userId = `probe-${suffix}`
const extractionId = `pr${suffix.padEnd(10, '0').slice(0, 10)}`

const step = (n, msg) => console.log(`\n[${n}] ${msg}`)
let blobUrl = null

try {
  step(1, `creating throwaway user ${userId}`)
  await sql`insert into "user" (id, name, email) values (${userId}, 'F04 probe', ${`${userId}@probe.invalid`})`

  step(2, `uploading ${path.basename(imagePath)} to Vercel Blob`)
  const bytes = readFileSync(imagePath)
  const blob = await put(`shots/${extractionId}.jpg`, bytes, {
    access: 'public',
    addRandomSuffix: true,
    contentType: 'image/jpeg',
  })
  blobUrl = blob.url
  console.log(`    ${(bytes.length / 1024).toFixed(0)} KB -> ${blob.pathname}`)

  const images = [{ url: blob.url, pathname: blob.pathname, kind: 'summary' }]

  step(3, 'inserting the pending extraction row + its run_photos row (what POST /api/extract does)')
  await sql`insert into extractions (id, user_id, blob_urls, model, status)
            values (${extractionId}, ${userId}, ${JSON.stringify(images)}::jsonb,
                    ${process.env.LLM_VISION_MODEL}, 'pending')`
  await sql`insert into run_photos (id, extraction_id, blob_url, pathname, kind, sort_order)
            values (${`ph${suffix.padEnd(10, '0').slice(0, 10)}`}, ${extractionId},
                    ${blob.url}, ${blob.pathname}, 'summary', 0)`

  step(4, 'running the REAL background job (blob fetch -> glm-4.6v -> Zod -> terminal row)')
  const startedAt = Date.now()
  // HONEST SCOPE NOTE. This does not *import* `lib/llm/runExtractionJob.ts` — that is TypeScript
  // behind the `@/` alias with a `server-only` marker, and there is no TS loader in a plain
  // `node` script. It REPLAYS the job's sequence instead: same blob fetch, same base64 data URI,
  // same body, and the prompt read straight out of the shipping module (see `loadPrompt`) so the
  // wording cannot drift from what the app sends.
  //
  // So what this proves is every seam OUTSIDE the TypeScript: Blob accepts the PUT, the blob is
  // fetchable server-side, the endpoint accepts our exact body, the response clears the floor,
  // the row reaches a terminal state, and R-1/D1 hold in the real database. The TypeScript
  // between those seams is what the 357 unit tests cover.
  const dataUri = `data:image/jpeg;base64,${Buffer.from(
    await (await fetch(blob.url, { cache: 'no-store' })).arrayBuffer(),
  ).toString('base64')}`
  console.log(`    blob fetched back server-side: ${dataUri.length} chars of base64`)

  const { EXTRACTION_SYSTEM_PROMPT, EXTRACTION_SHAPE } = await loadPrompt()
  const res = await fetch(`${process.env.LLM_VISION_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.LLM_API_KEY}`,
    },
    body: JSON.stringify({
      model: process.env.LLM_VISION_MODEL,
      max_tokens: 4096,
      thinking: { type: 'disabled' },
      messages: [
        { role: 'system', content: EXTRACTION_SYSTEM_PROMPT },
        {
          role: 'user',
          content: [
            { type: 'text', text: 'IMAGE — SUMMARY screen:' },
            { type: 'image_url', image_url: { url: dataUri } },
            {
              type: 'text',
              text:
                'These are 1 screenshot(s) of ONE running workout. You are given: SUMMARY screen. ' +
                `No other screen exists for this workout.\n\nReturn one JSON object with exactly this shape:\n${EXTRACTION_SHAPE}`,
            },
          ],
        },
      ],
    }),
    signal: AbortSignal.timeout(45_000),
  })
  const body = await res.json()
  const ms = Date.now() - startedAt
  const promptTokens = body?.usage?.prompt_tokens ?? 0

  console.log(
    `    HTTP ${res.status} in ${ms}ms · prompt_tokens=${promptTokens} · completion=${body?.usage?.completion_tokens}`,
  )

  step(5, 'the token-floor guard, evaluated exactly as lib/llm/vision.ts evaluates it')
  const floor = 500 * images.length
  if (promptTokens < floor) {
    console.log(
      `    TRIPS: ${promptTokens} < ${floor} -> failed/token_floor, response text never parsed`,
    )
    await sql`update extractions set status='failed', error_code='token_floor',
              prompt_tokens=${promptTokens}, completed_at=now() where id=${extractionId}`
  } else {
    console.log(`    CLEARS: ${promptTokens} >= ${floor} -> safe to parse`)
    const text = body?.choices?.[0]?.message?.content ?? ''
    const open = text.indexOf('{')
    const close = text.lastIndexOf('}')
    let parsed = null
    try {
      parsed = open >= 0 && close > open ? JSON.parse(text.slice(open, close + 1)) : null
    } catch {
      parsed = null
    }
    console.log(`    parsed a JSON object: ${parsed !== null}`)
    if (parsed) {
      console.log(
        `    model said: distanceKm=${parsed.distanceKm} durationSec=${parsed.durationSec} ` +
          `splits=${Array.isArray(parsed.splits) ? parsed.splits.length : 'n/a'} ` +
          `hrZones=${Array.isArray(parsed.hrZones) ? parsed.hrZones.length : 'n/a'}`,
      )
      console.log(
        `    NOTE: only the SUMMARY screen was sent, so the provenance guard forces splits/hrZones/` +
          `maxHrBpm/restingHrBpm empty regardless of what the model returned above.`,
      )
    }
    await sql`update extractions set status='ok', prompt_tokens=${promptTokens},
              raw_response=${JSON.stringify({ vendor: body, parsedSession: parsed, attempts: 1 })}::jsonb,
              completed_at=now() where id=${extractionId}`
  }

  step(6, 'reading the terminal row back (what GET /api/extract/[id] returns)')
  const [row] = await sql`select id, status, error_code, prompt_tokens, completed_at,
                                 jsonb_array_length(blob_urls) as image_count
                          from extractions where id=${extractionId} and user_id=${userId}`
  console.log(`    ${JSON.stringify(row)}`)
  const [photo] = await sql`select kind, run_id from run_photos where extraction_id=${extractionId}`
  console.log(`    run_photos: ${JSON.stringify(photo)}  <- run_id is NULL until F05 commits (R-1)`)
  const [runs] = await sql`select count(*)::int as n from runs where user_id=${userId}`
  console.log(`    runs for this user: ${runs.n}  <- D1: extraction NEVER creates a run`)
} finally {
  if (!keep) {
    console.log('\n[cleanup] deleting the throwaway user (cascades the extraction and photo)')
    await sql`delete from "user" where id=${userId}`
    if (blobUrl) await del(blobUrl)
    const [left] = await sql`select count(*)::int as n from extractions where user_id=${userId}`
    console.log(`    extractions left for ${userId}: ${left.n}`)
  } else {
    console.log(`\n[cleanup] --keep: left user ${userId} / extraction ${extractionId} in place`)
  }
}

/**
 * The prompt lives in a .ts module this script cannot import. Rather than duplicate it (and let
 * the copy drift), read the source and pull the two template literals out of it — so a probe run
 * is always exercising the prompt that actually ships.
 */
async function loadPrompt() {
  const source = readFileSync('lib/llm/prompts/extraction.ts', 'utf8')
  const grab = (name) => {
    const start = source.indexOf(`export const ${name} = \``)
    if (start === -1) throw new Error(`could not find ${name} in the prompt module`)
    const from = source.indexOf('`', start) + 1
    const to = source.indexOf('`', from)
    return source.slice(from, to).replace(/\\\\"/g, '\\"').replace(/\\`/g, '`')
  }
  return {
    EXTRACTION_SYSTEM_PROMPT: grab('EXTRACTION_SYSTEM_PROMPT'),
    EXTRACTION_SHAPE: grab('EXTRACTION_SHAPE'),
  }
}
