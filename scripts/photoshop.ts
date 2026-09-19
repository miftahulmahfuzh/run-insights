/**
 * **Run a photoshop job on an existing Nina photo, headlessly, and add the result to her album.**
 *
 *   node --experimental-strip-types --no-warnings --env-file=.env.local \
 *     scripts/photoshop.ts 36dgjXXXXXXX edit bytedance-seed/seedream-4.5 'much bigger breasts'
 *
 * The FIRST argument is a fragment of the source photo's id (`nina_avatars.id` or
 * `nina_message_images.id` — the "image id" printed under the photo on `/admin/photoshop/[source]/
 * [id]` and in the Photoshop tab of `/admin/error-logs`). The SECOND is the mode, `anchor` or
 * `edit`. The THIRD is the exact provider model id (see `ANCHOR_MODEL_IDS`/`EDIT_MODEL_IDS`
 * below — the SKILL resolves a runner's words like "seedream 4.5" to one of these closed ids
 * BEFORE invoking this script; the script only validates, it does not guess). EVERYTHING after
 * that is the instruction, joined with spaces.
 *
 * ── WHY THIS DUPLICATES RATHER THAN IMPORTS `lib/nina/photoshop*.ts` ──────────────────────────
 * `lib/nina/photoshopRun.ts` opens with `import 'server-only'` and reaches `@/lib/env`, neither of
 * which survives `--experimental-strip-types` — the exact constraint `scripts/nina-image-worker/
 * generate.ts`'s header states for `lib/nina/imagecall.ts`. This script is that worker's own
 * pattern applied to a fourth job kind: `.ts`-suffixed relative imports only (zero-import files:
 * `lib/id.ts`, `lib/nina/imagerecipe.ts`, `lib/nina/imagefail.ts`, `lib/photos/contentHash.ts`),
 * CJS packages through `createRequire`, and the small vocabulary that has no zero-import home
 * (the seven presets, the two model lists, the per-model resolution override) copied verbatim —
 * kept in lockstep with `lib/nina/photoshopPresets.ts` by hand, `redo-image-gen-job.ts`'s own
 * precedent for `replaceSidecarPrompt`/`isRedoableArgs`.
 *
 * ── WHY IT DOES NOT USE `after()` OR `firePhotoshopJob` ───────────────────────────────────────
 * There is no HTTP request here to attach a background task to — this process's own event loop
 * IS the whole budget, so the model call is simply awaited like any other line, the same call
 * `redo-image-gen-job.ts` makes for `runOneJob`.
 *
 * ── WHY A SUCCESSFUL RUN AUTO-ADDS, WITH NO CONFIRMATION STEP ─────────────────────────────────
 * The runner's own words: *"when we have successfully execute this skill, the image result must
 * be added as a new image in directory Photoshop in Album."* Unlike the web UI's before/after
 * review (Replace / Add as new / Cancel), a CLI run has no screen to show a before/after on, so
 * this script performs the ADD half of `resolvePhotoshopAdd` (`lib/nina/photoshopResolve.ts`)
 * itself, in the same folder (`Photoshop`) and with the same `source: 'admin'`,
 * `source_key: 'photoshop:<jobId>'` shape — never the REPLACE half, which overwrites an existing
 * row and was never asked for here.
 */
const failureDetails: string[] = []
const realWarn = console.warn.bind(console)
console.warn = (...args: unknown[]) => {
  realWarn(...args)
}
console.info = console.error

import { createRequire } from 'node:module'

import { newId } from '../lib/id.ts'
import { contentHashOf } from '../lib/photos/contentHash.ts'
import { classifyImageFailure } from '../lib/nina/imagefail.ts'
import type { NinaImageFailure } from '../lib/nina/imagefail.ts'
import {
  buildImageReferenceDataUrl,
  buildImageRequestBody,
  nearestNinaImageAspectRatio,
  NINA_IMAGE_CACHE_MAX_AGE,
  NINA_IMAGE_CONTENT_TYPE,
  NINA_IMAGE_REFERENCE_FETCH_TIMEOUT_MS,
  NINA_IMAGE_REFERENCE_MAX_BYTES,
  NINA_WORKER_CALL_TIMEOUT_MS,
  OPENROUTER_IMAGE_URL,
  readReportedCostMicroUsd,
} from '../lib/nina/imagerecipe.ts'

/* ── the small vocabulary, hand-kept in lockstep with lib/nina/photoshopPresets.ts ────────────── */

const ANCHOR_MODEL_IDS = [
  'qwen/qwen-image-3',
  'qwen/qwen-image-3-pro',
  'recraft/recraft-v4.1',
  'bytedance-seed/seedream-4.5',
  'bytedance-seed/seedream-5-0-pro',
]
const EDIT_MODEL_IDS = [
  'google/gemini-3.1-flash-image',
  'google/gemini-2.5-flash-image',
  'bytedance-seed/seedream-4.5',
  'black-forest-labs/flux.2-pro',
  'openai/gpt-image-2',
]
/** `bytedance-seed/seedream-4.5` 400s on the shared 1K default — see `lib/nina/imagerecipe.ts`'s
 * `resolution` field header for the measured error. */
const MODEL_RESOLUTION: Record<string, string> = {
  'bytedance-seed/seedream-4.5': '2K',
}
const INSTRUCTION_MAX = 300
const MAX_ATTEMPTS = 2
const ALBUM_FOLDER = 'Photoshop'
const ID_FRAGMENT_RE = /^[0-9A-Za-z_-]{1,12}$/
const MAX_LISTED_MATCHES = 25

function emit(payload: Record<string, unknown>, exitCode: number): never {
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`)
  process.exit(exitCode)
}
function fail(exitCode: number, error: string, extra: Record<string, unknown> = {}): never {
  console.error(`FAIL  ${error}`)
  return emit({ ok: false, error, ...extra }, exitCode)
}

/* ── 1. Arguments ───────────────────────────────────────────────────────────────────────────── */

const argv = process.argv.slice(2)
if (argv.length < 4) {
  fail(
    2,
    'usage: photoshop.ts <image-id-fragment> <anchor|edit> <model-id> <instruction…>\n' +
      `  anchor models: ${ANCHOR_MODEL_IDS.join(', ')}\n` +
      `  edit models:   ${EDIT_MODEL_IDS.join(', ')}`,
  )
}

const fragment = argv[0]!.replace(/^#/, '').trim()
const mode = argv[1]!.toLowerCase()
const model = argv[2]!
const instruction = argv.slice(3).join(' ').trim().replace(/\s+/g, ' ').slice(0, INSTRUCTION_MAX)

if (!ID_FRAGMENT_RE.test(fragment)) {
  fail(
    2,
    `${JSON.stringify(fragment)} is not a fragment of an id: ids are 1-12 symbols from [0-9A-Za-z_-]`,
  )
}
if (mode !== 'anchor' && mode !== 'edit') {
  fail(2, `mode must be "anchor" or "edit", got ${JSON.stringify(argv[1])}`)
}
const validModels = mode === 'anchor' ? ANCHOR_MODEL_IDS : EDIT_MODEL_IDS
if (!validModels.includes(model)) {
  fail(2, `${JSON.stringify(model)} is not a ${mode} model — valid ids: ${validModels.join(', ')}`)
}
if (instruction === '') {
  fail(2, 'the instruction is empty after trimming — say what should change')
}

/* ── 2. Environment ─────────────────────────────────────────────────────────────────────────── */

const url = process.env.DATABASE_URL
if (!url) fail(2, 'needs DATABASE_URL — run with --env-file=.env.local')
const parsedUrl = new URL(url)
if (!parsedUrl.host.endsWith('neon.tech')) {
  fail(2, `DATABASE_URL does not point at Neon (host: ${parsedUrl.host})`)
}
if (!process.env.OPENROUTER_API_KEY)
  fail(2, 'needs OPENROUTER_API_KEY — run with --env-file=.env.local')
if (!process.env.BLOB_READ_WRITE_TOKEN)
  fail(2, 'needs BLOB_READ_WRITE_TOKEN — run with --env-file=.env.local')

const require = createRequire(import.meta.url)
const { neon } = require('@neondatabase/serverless') as { neon: (u: string) => NeonSql }
type NeonSql = (strings: TemplateStringsArray, ...values: unknown[]) => Promise<unknown[]>
const sql = neon(url)

/* ── 3. The fragment → exactly one photo, across both collections ────────────────────────────── */

const avatarMatches = (await sql`
  select id, user_id, blob_url, content_hash, folder, width, height
  from nina_avatars
  where strpos(id, ${fragment}::text) > 0
`) as Array<{
  id: string
  user_id: string
  blob_url: string
  content_hash: string | null
  folder: string
  width: number | null
  height: number | null
}>

const mediaMatches = (await sql`
  select id, user_id, blob_url, content_hash, width, height
  from nina_message_images
  where strpos(id, ${fragment}::text) > 0
`) as Array<{
  id: string
  user_id: string
  blob_url: string
  content_hash: string | null
  width: number | null
  height: number | null
}>

const matches = [
  ...avatarMatches.map((row) => ({ ...row, sourceKind: 'avatar' as const })),
  ...mediaMatches.map((row) => ({ ...row, sourceKind: 'message_image' as const })),
]

if (matches.length === 0) {
  fail(3, `no photo (album or chat) has an id containing ${JSON.stringify(fragment)}`, { fragment })
}
if (matches.length > 1) {
  fail(4, `${JSON.stringify(fragment)} names ${matches.length} photos — give more of the id`, {
    fragment,
    matches: matches
      .slice(0, MAX_LISTED_MATCHES)
      .map((m) => ({ id: m.id, sourceKind: m.sourceKind })),
  })
}

const source = matches[0]!
const userId = source.user_id

/* ── 4. Open the job row ──────────────────────────────────────────────────────────────────────── */

const jobId = newId()
await sql`
  insert into nina_photoshop_jobs
    (id, user_id, source_kind, source_id, source_content_hash, mode, model, preset_key, prompt_text,
     crop_ratio_label, crop_scale, crop_x, crop_y,
     status, error_code, attempts, created_at)
  values (
    ${jobId}, ${userId}, ${source.sourceKind}, ${source.id}, ${source.content_hash}, ${mode}, ${model},
    null, ${instruction},
    -- A CLI run never crops: there is no browser to drag a rectangle in, so every CLI job is a
    -- "skipped the crop step" job and falls back to nearestNinaImageAspectRatio exactly as before.
    -- Spelled out rather than omitted so this list stays readable against the real table.
    null, null, null, null,
    'pending', 'queued', 0, now()
  )
`
console.error(`[photoshop] opened ${jobId} on ${source.sourceKind}:${source.id}, running now…`)

/* ── 5. The reference fetch, `generate.ts`'s own duplicate of `fetchNinaImageReference` ──────── */

async function fetchReference(refUrl: string): Promise<string | null> {
  try {
    const res = await fetch(refUrl, {
      signal: AbortSignal.timeout(NINA_IMAGE_REFERENCE_FETCH_TIMEOUT_MS),
      cache: 'no-store',
    })
    if (!res.ok) return null
    const declared = res.headers.get('content-length')
    const declaredBytes = declared == null ? null : Number.parseInt(declared, 10)
    if (
      declaredBytes != null &&
      Number.isFinite(declaredBytes) &&
      declaredBytes > NINA_IMAGE_REFERENCE_MAX_BYTES
    ) {
      return null
    }
    const bytes = Buffer.from(await res.arrayBuffer())
    if (bytes.byteLength === 0 || bytes.byteLength > NINA_IMAGE_REFERENCE_MAX_BYTES) return null
    const served = res.headers.get('content-type') ?? ''
    return buildImageReferenceDataUrl(served, bytes.toString('base64'))
  } catch (cause) {
    console.warn('[photoshop] reference fetch failed', { refUrl, cause: String(cause) })
    return null
  }
}

/* ── 6. One OpenRouter call, `generate.ts`'s own shape plus the resolution override ──────────── */

type CallOutcome =
  | { ok: true; b64: string; costMicroUsd: number }
  | { ok: false; kind: NinaImageFailure; detail: string; costMicroUsd: number | null }

async function callModel(
  prompt: string,
  seed: number,
  referenceUrl: string,
  modelId: string,
  aspectRatio: string | undefined,
): Promise<CallOutcome> {
  const startedAt = Date.now()
  const referenceDataUrl = await fetchReference(referenceUrl)
  const resolution = MODEL_RESOLUTION[modelId]

  let res: Response
  try {
    res = await fetch(OPENROUTER_IMAGE_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(
        buildImageRequestBody({
          prompt,
          seed,
          referenceDataUrl,
          model: modelId,
          resolution,
          aspectRatio,
        }),
      ),
      signal: AbortSignal.timeout(
        Math.max(1_000, NINA_WORKER_CALL_TIMEOUT_MS - (Date.now() - startedAt)),
      ),
      cache: 'no-store',
    })
  } catch (cause) {
    return {
      ok: false,
      kind: classifyImageFailure({ cause }),
      detail: String(cause),
      costMicroUsd: null,
    }
  }

  const raw = await res.text()
  if (!res.ok) {
    return {
      ok: false,
      kind: classifyImageFailure({ httpStatus: res.status, body: raw }),
      detail: `HTTP ${res.status} ${raw.slice(0, 500)}`,
      costMicroUsd: null,
    }
  }

  let b64: string | null = null
  let reportedCost: number | null = null
  try {
    const parsed = JSON.parse(raw) as { data?: Array<{ b64_json?: string }>; usage?: unknown }
    b64 = parsed.data?.[0]?.b64_json ?? null
    reportedCost = readReportedCostMicroUsd(parsed.usage)
  } catch {
    b64 = null
  }
  if (b64 == null || b64.length === 0) {
    return {
      ok: false,
      kind: classifyImageFailure({ httpStatus: 200, body: raw }),
      detail: raw.slice(0, 500),
      costMicroUsd: reportedCost,
    }
  }
  return { ok: true, b64, costMicroUsd: reportedCost ?? 40_000 }
}

/* ── 7. The blob put and the pixel measurement ────────────────────────────────────────────────── */

const { put } = require('@vercel/blob') as {
  put: (
    pathname: string,
    body: Buffer,
    options: Record<string, unknown>,
  ) => Promise<{ url: string; pathname: string }>
}
const sharpRequire = require('sharp') as (
  input: Buffer,
  opts: Record<string, unknown>,
) => { metadata: () => Promise<{ width?: number; height?: number }> }

async function storeResult(bytes: Buffer): Promise<{
  blobUrl: string
  pathname: string
  contentHash: string
  width: number
  height: number
}> {
  const contentHash = await contentHashOf(bytes)
  const blob = await put(`nina/${userId}/photoshop-${newId()}.png`, bytes, {
    access: 'public',
    contentType: NINA_IMAGE_CONTENT_TYPE,
    addRandomSuffix: true,
    allowOverwrite: false,
    cacheControlMaxAge: NINA_IMAGE_CACHE_MAX_AGE,
    token: process.env.BLOB_READ_WRITE_TOKEN,
  })
  let width = 0
  let height = 0
  try {
    const meta = await sharpRequire(bytes, { failOn: 'none' }).metadata()
    width = meta.width ?? 0
    height = meta.height ?? 0
  } catch {
    /* dimensions stay 0x0 — never a lost photograph over a measurement nobody will act on */
  }
  return { blobUrl: blob.url, pathname: blob.pathname, contentHash, width, height }
}

/* ── 8. Run it — draining the same retry budget the app's own loop would ─────────────────────── */

/* **The 2026-09-19 edit-mode aspect fix** — `nearestNinaImageAspectRatio`'s own header in
 * `lib/nina/imagerecipe.ts`. Anchor mode keeps `buildImageRequestBody`'s fixed `NINA_IMAGE_ASPECT`
 * default by getting `undefined` here. Hand-kept in lockstep with `photoshopRun.ts`'s own
 * `attemptPhotoshopOnce`, this file's header explains why. */
const aspectRatio =
  mode === 'edit' && source.width != null && source.height != null
    ? nearestNinaImageAspectRatio(source.width, source.height)
    : undefined

let attempts = 0
let outcome: 'ok' | 'retry' | 'gave-up' = 'retry'
let lastDetail: string | null = null
let result: {
  blobUrl: string
  pathname: string
  contentHash: string
  width: number
  height: number
  bytes: number
} | null = null

while (outcome === 'retry' && attempts < MAX_ATTEMPTS) {
  attempts += 1
  await sql`update nina_photoshop_jobs set error_code = 'running', attempts = ${attempts} where id = ${jobId}`

  const seed = Math.floor(Math.random() * 2_147_483_647)
  const call = await callModel(instruction, seed, source.blob_url, model, aspectRatio)

  if (!call.ok) {
    lastDetail = `[${call.kind}] ${call.detail}`
    failureDetails.push(lastDetail)
    await sql`
      insert into nina_error_logs
        (id, user_id, category, provider, model, full_input, error_message, timeout_ms, image_url, job_id, source_id, created_at)
      values (
        ${newId()}, ${userId}, 'photoshop', 'openrouter', ${model}, ${instruction}, ${lastDetail},
        null, ${source.blob_url}, ${jobId}, ${source.id}, now()
      )
    `
    if (attempts < MAX_ATTEMPTS) {
      await sql`update nina_photoshop_jobs set error_code = 'queued' where id = ${jobId}`
      outcome = 'retry'
      continue
    }
    await sql`update nina_photoshop_jobs set status = 'failed', error_code = ${call.kind} where id = ${jobId}`
    outcome = 'gave-up'
    break
  }

  const bytes = Buffer.from(call.b64, 'base64')
  const stored = await storeResult(bytes)
  result = { ...stored, bytes: bytes.byteLength }
  await sql`
    update nina_photoshop_jobs
    set status = 'ok', error_code = null, cost_micro_usd = coalesce(cost_micro_usd, 0) + ${call.costMicroUsd},
        result_blob_url = ${result.blobUrl}, result_pathname = ${result.pathname},
        result_content_hash = ${result.contentHash}, result_width = ${result.width},
        result_height = ${result.height}, result_bytes = ${result.bytes}
    where id = ${jobId}
  `
  outcome = 'ok'
}

/* ── 9. Auto-add on success — the runner's own ask, no confirmation step for a CLI run ────────── */

let newAvatarId: string | null = null
if (outcome === 'ok' && result != null) {
  newAvatarId = newId()
  await sql`
    insert into nina_avatars
      (id, user_id, blob_url, pathname, folder, filename, source_key, width, height, bytes, source,
       content_hash, is_current)
    values (
      ${newAvatarId}, ${userId}, ${result.blobUrl}, ${result.pathname}, ${ALBUM_FOLDER}, null,
      ${`photoshop:${jobId}`}, ${result.width}, ${result.height}, ${result.bytes}, 'admin',
      ${result.contentHash}, false
    )
    on conflict (user_id, source_key) do nothing
  `
  await sql`
    update nina_photoshop_jobs set resolved_action = 'added', resolved_at = now() where id = ${jobId}
  `
}

/* ── 10. The report ────────────────────────────────────────────────────────────────────────────── */

emit(
  {
    ok: outcome === 'ok',
    jobId,
    sourceId: source.id,
    sourceKind: source.sourceKind,
    mode,
    model,
    instruction,
    attempts,
    outcome,
    result:
      result == null
        ? null
        : {
            blobUrl: result.blobUrl,
            width: result.width,
            height: result.height,
            newAvatarId,
            folder: ALBUM_FOLDER,
          },
    rawProviderError: lastDetail,
  },
  outcome === 'ok' ? 0 : 1,
)
