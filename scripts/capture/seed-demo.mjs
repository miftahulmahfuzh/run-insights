/**
 * F19 — seed the demo account the README's screenshots are taken from, and purge it afterwards.
 *
 *   node --env-file=.env.local scripts/capture/seed-demo.mjs           # seed
 *   node --env-file=.env.local scripts/capture/seed-demo.mjs --purge   # delete it again
 *   node --env-file=.env.local scripts/capture/seed-demo.mjs --status  # what exists right now
 *
 * WHAT IT WRITES, AND WHAT IT DELIBERATELY DOES NOT.
 *
 * It writes one `user`, one `profiles` row, three Blob objects, and 27 `extractions` rows with
 * their `run_photos`. It writes **no `runs` row, no split, no zone, no record and no badge** —
 * `shoot.mjs` clicks "Confirm & save" on each extraction and the app's own `commitReviewAction`
 * writes all of those, exactly as it would for a real upload.
 *
 * That split is F19-D2 and it is not a convenience. `lib/derived/invalidate.ts`,
 * `lib/records/gateway.ts` and `lib/badges/evaluate.ts` all open with `import 'server-only'`, so a
 * plain node script cannot import them — `scripts/f04-e2e-probe.mjs` documents the same wall. The
 * alternative to driving the browser is a second copy of the ten record keys and the twenty-two
 * badge rules living in this file, drifting silently from the ones the app ships. A shelf of
 * badges nothing earned is also just a picture of a database, which is precisely what the README
 * should not be publishing.
 *
 * NOT A TEST. It writes to the real database and the real Blob store. Run it on purpose.
 *
 * The safety property that makes seeding into the live database acceptable is roadmap §4.3: 15 of
 * the 17 foreign keys cascade, and every row this script creates is reachable only through its one
 * `user` row. `--purge` deletes that row and prints the counts back, so cleanup is verified rather
 * than assumed.
 */
import { readFileSync } from 'node:fs'
import { writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { neon } from '@neondatabase/serverless'
import { del, put } from '@vercel/blob'

import {
  breakSplitOne,
  buildSession,
  canonicalFixtureSession,
  canonicalFixtureVendor,
  RUNS,
} from './dataset.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(HERE, '../..')
export const MANIFEST_PATH = path.join(HERE, '.manifest.json')

/** The prefix every demo user id carries. It is the only handle `--purge` needs. */
const DEMO_PREFIX = 'demo-'

const ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-_'
/** `lib/id.ts` newId(12), reimplemented rather than imported: that module is TypeScript behind
 *  the `@/` alias, and ids must match `/^[0-9A-Za-z_-]{12}$/` or `isValidId` 404s the route. */
function newId(size = 12) {
  const bytes = new Uint8Array(size)
  crypto.getRandomValues(bytes)
  let out = ''
  for (let i = 0; i < size; i++) out += ALPHABET[bytes[i] & 63]
  return out
}

const sql = neon(requireEnv('DATABASE_URL'))

function requireEnv(name) {
  const value = process.env[name]
  if (!value) {
    console.error(
      `FAIL  ${name} is not set. Run with: node --env-file=.env.local ${process.argv[1]}`,
    )
    process.exit(2)
  }
  return value
}

const step = (n, message) => console.log(`\n[${n}] ${message}`)

/* ============================================================================
 * The three screenshots. Uploaded once and shared by every run: the review strip and the share
 * page each need *a* photo, and 81 uploads of the same three files is a bill, a slower purge and
 * no extra pixel on any screenshot.
 * ==========================================================================*/

const SHOTS = [
  { file: 'research/fixtures/screenshots/shipped/1.jpg', kind: 'summary' },
  { file: 'research/fixtures/screenshots/shipped/2.jpg', kind: 'splits' },
  { file: 'research/fixtures/screenshots/shipped/3.jpg', kind: 'heartrate' },
]
/** The 560w/q80 recipe the browser actually uploads — `research/fixtures/README.md`. */
const SHOT_WIDTH = 560
const SHOT_HEIGHT = 1212

/* ============================================================================
 * Status
 * ==========================================================================*/

async function findDemoUsers() {
  return sql.query(`select id, name, email from "user" where id like $1 order by id`, [
    `${DEMO_PREFIX}%`,
  ])
}

async function status() {
  const users = await findDemoUsers()
  if (users.length === 0) {
    console.log('no demo user in the database')
  }
  for (const user of users) {
    const [{ extractions }] = await sql.query(
      `select count(*)::int as extractions from extractions where user_id = $1`,
      [user.id],
    )
    const [{ runs }] = await sql.query(
      `select count(*)::int as runs from runs where user_id = $1`,
      [user.id],
    )
    const [{ badges }] = await sql.query(
      `select count(*)::int as badges from badges where user_id = $1`,
      [user.id],
    )
    const [{ records }] = await sql.query(
      `select count(*)::int as records from records where user_id = $1`,
      [user.id],
    )
    console.log(
      `${user.id}  ${user.name}  extractions=${extractions} runs=${runs} ` +
        `badges=${badges} records=${records}`,
    )
  }
  const [{ total }] = await sql.query(`select count(*)::int as total from "user"`)
  console.log(`\n"user" rows in total: ${total}`)
}

/* ============================================================================
 * Purge
 * ==========================================================================*/

/**
 * Blobs first, then the row.
 *
 * The Blob pathnames live in `extractions.blob_urls`, so they are only readable while the user
 * still exists — deleting the row first would strand three objects with nothing left in the
 * database pointing at them, which is exactly the orphan the `reap-orphaned-blobs` skill exists to
 * clean up after. Doing it in this order means there is nothing to reap.
 */
async function purge() {
  const users = await findDemoUsers()
  if (users.length === 0) {
    console.log('nothing to purge — no demo user found')
    return
  }

  for (const user of users) {
    step(1, `reading the Blob pathnames still reachable from ${user.id}`)
    const rows = await sql.query(`select blob_urls from extractions where user_id = $1`, [user.id])
    const urls = new Set()
    for (const row of rows) for (const ref of row.blob_urls ?? []) urls.add(ref.url)
    console.log(`    ${urls.size} distinct blob url(s)`)

    step(2, 'deleting them')
    for (const url of urls) {
      try {
        await del(url)
        console.log(`    deleted ${url.split('/').pop()}`)
      } catch (err) {
        console.warn(`    WARN  could not delete ${url}: ${err.message}`)
      }
    }

    step(3, `deleting user ${user.id} — the cascade takes everything else`)
    await sql.query(`delete from "user" where id = $1`, [user.id])
  }

  step(4, 'verifying')
  /* Two shapes of check, because the schema has two shapes of ownership. Seven tables carry
   * `user_id` directly; the three child tables of a run reach it only through `runs`, and those
   * are the ones a partial cascade would strand. */
  const owned = ['extractions', 'runs', 'insights', 'records', 'badges', 'shares', 'profiles']
  const leftovers = {}
  for (const table of owned) {
    const [{ n }] = await sql.query(
      `select count(*)::int as n from ${table} where user_id like $1`,
      [`${DEMO_PREFIX}%`],
    )
    leftovers[table] = n
  }
  for (const table of ['run_splits', 'run_zones']) {
    const [{ n }] = await sql.query(
      `select count(*)::int as n from ${table} t
         join runs r on r.id = t.run_id where r.user_id like $1`,
      [`${DEMO_PREFIX}%`],
    )
    leftovers[table] = n
  }
  const [{ n: photos }] = await sql.query(
    `select count(*)::int as n from run_photos p
       left join extractions e on e.id = p.extraction_id
      where e.user_id like $1`,
    [`${DEMO_PREFIX}%`],
  )
  leftovers.run_photos = photos

  console.log(`    ${JSON.stringify(leftovers)}`)
  const dirty = Object.entries(leftovers).filter(([, n]) => n > 0)
  if (dirty.length > 0) {
    console.error(`FAIL  rows survived the cascade: ${JSON.stringify(dirty)}`)
    process.exit(1)
  }
  const [{ total }] = await sql.query(`select count(*)::int as total from "user"`)
  console.log(`OK    purged. "user" rows remaining: ${total}`)
}

/* ============================================================================
 * Reset the hero upload
 * ==========================================================================*/

/** Committed runs for a user. `shoot.mjs` polls this to know the hero's commit has actually landed. */
export async function countRuns(userId) {
  const [{ n }] = await sql.query(`select count(*)::int as n from runs where user_id = $1`, [
    userId,
  ])
  return n
}

/**
 * Delete whatever a previous hero recording uploaded and committed, so the recording is repeatable.
 *
 * WHY THIS IS NEEDED AT ALL — and it is R-5 working, not failing. The hero GIF uploads the three
 * canonical screenshots for real, which extract to a run on the fixture's own date. The second time
 * that recording runs, `runs_user_occurred_started_unq` (UNIQUE on user_id, occurred_on,
 * started_at) refuses the commit and the review screen says *"You have already logged a run on that
 * date at that time"* — which is precisely the duplicate-upload guard D2 asked for, arriving
 * exactly when it should. The recording then sits on that warning for the rest of its length,
 * which is how an 8.4 MB GIF of a stalled screen got made.
 *
 * So the fix belongs here rather than in the guard: clear the previous attempt first.
 *
 * It is scoped by exclusion, not by date: everything the seed created is in the manifest, so
 * anything else belonging to this user was uploaded by a hero run. That is narrower than matching
 * on `occurred_on`, which would also catch the seeded run if the dataset ever grew one on the
 * fixture's date.
 *
 * THE RUN GOES FIRST, and this is the one place the roadmap's "15 of 17 FKs cascade" matters
 * directly: `runs.extraction_id` is one of the two that do NOT. It is declared
 * `.references(() => extractions.id)` with no `onDelete`, so Postgres refuses to delete an
 * extraction a run still points at — deliberately, since §4.3's note says the run references the
 * audit trail and never the reverse. Deleting the extraction first fails with
 * `runs_extraction_id_extractions_id_fk`, which is exactly what the first version of this function
 * did.
 */
export async function resetHeroUpload(userId, seededExtractionIds) {
  const rows = await sql.query(
    `select id, blob_urls from extractions where user_id = $1 and id <> all($2::text[])`,
    [userId, seededExtractionIds],
  )
  if (rows.length === 0) return { extractions: 0, blobs: 0 }

  let blobs = 0
  for (const row of rows) {
    for (const ref of row.blob_urls ?? []) {
      try {
        await del(ref.url)
        blobs++
      } catch {
        /* Already gone is the same outcome we wanted. */
      }
    }
  }
  const ids = rows.map((r) => r.id)
  /* Runs first (see above), which cascades their splits, zones, photos and badge awards. */
  const runs = await sql.query(
    `delete from runs where user_id = $1 and extraction_id = any($2::text[]) returning id`,
    [userId, ids],
  )
  await sql.query(`delete from extractions where user_id = $1 and id = any($2::text[])`, [
    userId,
    ids,
  ])
  return { extractions: rows.length, runs: runs.length, blobs }
}

/* ============================================================================
 * Seed
 * ==========================================================================*/

async function seed() {
  const existing = await findDemoUsers()
  if (existing.length > 0) {
    console.error(
      `FAIL  ${existing[0].id} already exists. Run --purge first; two demo users would both ` +
        `show up in the screenshots' account switcher and in every count.`,
    )
    process.exit(1)
  }

  const suffix = Math.floor(Date.now() / 1000).toString(36)
  const userId = `${DEMO_PREFIX}${suffix}`

  step(1, `creating ${userId}`)
  await sql.query(
    `insert into "user" (id, name, email, "emailVerified") values ($1, $2, $3, now())`,
    [userId, 'Demo Runner', `${userId}@demo.invalid`],
  )
  /**
   * `max_hr` is set because D11 says a stored value means a human or a watch measured one, and the
   * alternative is every %HRmax figure on these screenshots being labelled `estimated` off a
   * Tanaka formula the README already records as disproved for this runner. A demo whose headline
   * numbers are all hedged is a demo of the hedge.
   */
  await sql.query(
    `insert into profiles (user_id, birth_year, height_cm, weight_kg, resting_hr, max_hr, onboarded_at)
     values ($1, 1996, 173, 64.5, 52, 196, now())`,
    [userId],
  )

  step(2, `uploading ${SHOTS.length} screenshots to Blob`)
  const refs = []
  for (const shot of SHOTS) {
    const bytes = readFileSync(path.join(REPO, shot.file))
    const blob = await put(`shots/${newId()}.jpg`, bytes, {
      access: 'public',
      addRandomSuffix: true,
      contentType: 'image/jpeg',
    })
    refs.push({
      url: blob.url,
      pathname: blob.pathname,
      kind: shot.kind,
      width: SHOT_WIDTH,
      height: SHOT_HEIGHT,
      bytes: bytes.length,
    })
    console.log(`    ${shot.kind}: ${(bytes.length / 1024).toFixed(0)} KB -> ${blob.pathname}`)
  }

  step(3, `inserting ${RUNS.length + 1} extractions and their photo rows`)
  const model = process.env.LLM_VISION_MODEL ?? 'glm-4.6v'
  const manifest = { userId, createdAt: new Date().toISOString(), refs, runs: [], flagged: null }

  /* The flagged row is the canonical fixture with its real misread injected, so its spec is read
   * off the fixture rather than written here. `dateLabel` carries no year — which is the point:
   * the review screen has to guess the date and says so. */
  const fixture = canonicalFixtureSession()
  const specs = [
    ...RUNS.map((spec) => ({ spec, flagged: false })),
    {
      spec: {
        date: '2026-08-20',
        start: fixture.startTime,
        km: fixture.distanceKm,
        shape: 'fixture',
      },
      flagged: true,
    },
  ]

  for (const { spec, flagged } of specs) {
    const session = flagged ? breakSplitOne(canonicalFixtureSession()) : buildSession(spec)
    const extractionId = newId()
    /* The extraction is dated when the run happened, not when this script ran: the runs list, the
     * `/x` history and `extractions_user_created_idx` all read this column, and 27 rows stamped
     * with the same second would order arbitrarily. */
    const createdAt = `${spec.date}T${spec.start}:00+07:00`

    const rawResponse = {
      /* `vendor` is the immutable audit record of what the model returned. For the flagged row that
       * is a genuine reply — the committed golden response — so the review screen's raw-response
       * disclosure shows real vendor JSON. For the generated rows there was no model, and saying so
       * is cheaper than a future reader inferring it from the round numbers. */
      vendor: flagged
        ? canonicalFixtureVendor()
        : { seeded: true, note: 'F19 demo seed — no vision call was made for this row.' },
      parsedSession: session,
      attempts: 1,
    }

    await sql.query(
      `insert into extractions
         (id, user_id, blob_urls, model, prompt_tokens, raw_response, status, created_at, completed_at)
       values ($1, $2, $3::jsonb, $4, $5, $6::jsonb, 'ok', $7, $7::timestamptz + interval '38 seconds')`,
      [
        extractionId,
        userId,
        JSON.stringify(refs),
        model,
        3628,
        JSON.stringify(rawResponse),
        createdAt,
      ],
    )

    for (const [i, ref] of refs.entries()) {
      await sql.query(
        `insert into run_photos
           (id, extraction_id, blob_url, pathname, kind, width, height, bytes, sort_order, created_at)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          newId(),
          extractionId,
          ref.url,
          ref.pathname,
          ref.kind,
          ref.width,
          ref.height,
          ref.bytes,
          i,
          createdAt,
        ],
      )
    }

    const entry = {
      extractionId,
      date: spec.date,
      start: spec.start,
      km: spec.km,
      shape: spec.shape,
    }
    if (flagged) manifest.flagged = entry
    else manifest.runs.push(entry)
    process.stdout.write(flagged ? '  !' : '  .')
  }
  console.log('')

  writeFileSync(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`)

  step(4, 'done')
  console.log(`    user        ${userId}`)
  console.log(`    to commit   ${manifest.runs.length} extractions`)
  console.log(
    `    flagged     ${manifest.flagged.extractionId} ` +
      `(the canonical fixture, uncommitted, split 1 reads 436 where the cell says 396)`,
  )
  console.log(`    manifest    ${path.relative(REPO, MANIFEST_PATH)}`)
  console.log(`\n    next: node --env-file=.env.local scripts/capture/shoot.mjs`)
}

/* ============================================================================
 * main
 * ==========================================================================*/

/* Guarded, because `shoot.mjs` imports MANIFEST_PATH from this module. Without the guard, asking
 * this file where the manifest lives would re-run the seed. */
if (import.meta.url === `file://${process.argv[1]}`) {
  const mode = process.argv.includes('--purge')
    ? 'purge'
    : process.argv.includes('--status')
      ? 'status'
      : 'seed'

  try {
    if (mode === 'purge') await purge()
    else if (mode === 'status') await status()
    else await seed()
  } catch (err) {
    console.error(`\nFAIL  ${err.stack ?? err.message}`)
    process.exit(1)
  }
}
