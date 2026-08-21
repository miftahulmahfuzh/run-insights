/**
 * Reap blobs under `shots/` that nothing in the database references.
 *
 *   node --env-file=.env.local scripts/blob-reap.mjs                 # dry run, always
 *   node --env-file=.env.local scripts/blob-reap.mjs --delete
 *   node --env-file=.env.local scripts/blob-reap.mjs --min-age-hours 2 --delete
 *
 * NOT A TEST, and never part of `npm test`: it reads the real Blob store and the real database, and
 * with `--delete` it destroys bytes irreversibly. Same line `scripts/f04-e2e-probe.mjs` draws.
 *
 * ── WHY ORPHANS EXIST AT ALL ──────────────────────────────────────────────────────────────────
 * A blob is written before any row points at it: the browser PUTs straight to Blob (F04 §10) and
 * only then does `POST /api/extract` insert the `extractions` row that names it. Anything that
 * interrupts that gap leaves bytes nobody references — a pick the runner abandoned, a failed
 * extraction, a kind change that re-uploaded from the original bytes, a dev session, an F17-style
 * double-fire. None of it is reachable from the app, and none of it is ever cleaned up on its own.
 *
 * ── WHAT COUNTS AS A LIVE REFERENCE ───────────────────────────────────────────────────────────
 * The UNION of two places, and both halves are load-bearing:
 *
 *   - `run_photos.pathname` / `run_photos.blob_url` — the mutable photo lifecycle. This is the
 *     authority after a share revocation, because `lib/share/rotateBlobs.ts` renames the blob to a
 *     fresh random pathname and writes the new location to this row (R-15).
 *   - `extractions.blob_urls` — an immutable upload-time snapshot. It can be the ONLY reference to
 *     an extraction that has not been committed to a run yet, so it cannot be skipped. It can also
 *     be STALE after a rotation, naming bytes that no longer exist; that direction is harmless,
 *     since a reference to nothing never protects anything.
 *
 * Both `pathname` and `url` are collected from each, and a blob survives if either of its own names
 * appears. Matching on one field alone would delete a photo whose row stores the other spelling.
 */
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { list, del } = require('@vercel/blob')
const { neon } = require('@neondatabase/serverless')

const argv = process.argv.slice(2)
const has = (flag) => argv.includes(flag)
const num = (flag, fallback) => {
  const i = argv.indexOf(flag)
  return i === -1 ? fallback : Number(argv[i + 1])
}

const DELETE = has('--delete')
const MIN_AGE_HOURS = num('--min-age-hours', 24)
const ALLOW_EMPTY_DB = has('--allow-empty-db')
const PREFIX = 'shots/'

if (!process.env.DATABASE_URL || !process.env.BLOB_READ_WRITE_TOKEN) {
  console.error('needs DATABASE_URL and BLOB_READ_WRITE_TOKEN — run with --env-file=.env.local')
  process.exit(2)
}
if (!Number.isFinite(MIN_AGE_HOURS) || MIN_AGE_HOURS < 0) {
  console.error('--min-age-hours must be a non-negative number')
  process.exit(2)
}

const sql = neon(process.env.DATABASE_URL)
const token = process.env.BLOB_READ_WRITE_TOKEN
const kb = (n) => `${(n / 1000).toFixed(0)} KB`
const bytesOf = (bs) => bs.reduce((n, b) => n + (b.size ?? 0), 0)

/* ── 1. every name the database holds ──────────────────────────────────────────────────────── */
const live = new Set()
let photoRows = 0
for (const r of await sql`select pathname, blob_url from run_photos`) {
  photoRows++
  if (r.pathname) live.add(r.pathname)
  if (r.blob_url) live.add(r.blob_url)
}
let extractionRefs = 0
for (const r of await sql`select blob_urls from extractions`) {
  for (const b of Array.isArray(r.blob_urls) ? r.blob_urls : []) {
    extractionRefs++
    if (b?.pathname) live.add(b.pathname)
    if (b?.url) live.add(b.url)
  }
}

/* ── 2. every blob in the store ─────────────────────────────────────────────────────────────── */
const all = []
let cursor
do {
  const page = await list({ token, cursor, limit: 1000 })
  all.push(...page.blobs)
  cursor = page.hasMore ? page.cursor : undefined
} while (cursor)

/* ── 3. classify ────────────────────────────────────────────────────────────────────────────── */
const cutoff = Date.now() - MIN_AGE_HOURS * 3600_000
const shots = all.filter((b) => b.pathname.startsWith(PREFIX))
const other = all.length - shots.length
const referenced = shots.filter((b) => live.has(b.pathname) || live.has(b.url))
const unreferenced = shots.filter((b) => !live.has(b.pathname) && !live.has(b.url))
const tooNew = unreferenced.filter((b) => new Date(b.uploadedAt).getTime() > cutoff)
const orphans = unreferenced.filter((b) => new Date(b.uploadedAt).getTime() <= cutoff)

console.log(
  `db live names        ${live.size}  (run_photos rows: ${photoRows}, extraction refs: ${extractionRefs})`,
)
console.log(
  `blobs in store       ${all.length}  (${shots.length} under ${PREFIX}, ${other} elsewhere — never touched)`,
)
console.log(`  referenced         ${referenced.length}  (${kb(bytesOf(referenced))})`)
console.log(`  unreferenced       ${unreferenced.length}  (${kb(bytesOf(unreferenced))})`)
console.log(
  `    younger than ${MIN_AGE_HOURS}h ${tooNew.length}  kept — could be a pick still on someone's screen`,
)
console.log(`    ORPHANS          ${orphans.length}  (${kb(bytesOf(orphans))})`)

for (const b of [...orphans]
  .sort((a, z) => new Date(a.uploadedAt) - new Date(z.uploadedAt))
  .slice(0, 10)) {
  console.log(
    `      ${new Date(b.uploadedAt).toISOString()}  ${String(b.size).padStart(7)}  ${b.pathname}`,
  )
}
if (orphans.length > 10) console.log(`      … and ${orphans.length - 10} more`)

/**
 * A row naming bytes the store does not have. Not this script's job to repair — deleting nothing
 * is always the safe response — but it is the one signal that something upstream lost a photo, and
 * it costs one Set lookup to say so.
 */
const inStore = new Set(all.map((b) => b.pathname))
const dangling = [...live].filter((s) => s.startsWith(PREFIX) && !inStore.has(s))
console.log(`db rows naming missing bytes: ${dangling.length}`)

/**
 * THE INTERLOCK, and the reason this script is safe to hand to a future session.
 *
 * Every blob looks unreferenced when the database says nothing — which is exactly what a
 * `DATABASE_URL` pointing at the wrong branch, an empty local Postgres, or a typo'd env file
 * produces. Without this check the happy path of a misconfiguration is "delete the entire store",
 * and the failure is silent because the arithmetic is internally consistent. So: no live names plus
 * a non-empty store is a configuration error until a human says otherwise.
 */
if (live.size === 0 && shots.length > 0 && !ALLOW_EMPTY_DB) {
  console.error(
    `\nREFUSING: the database named 0 live blobs while the store holds ${shots.length}.\n` +
      `That is what a wrong DATABASE_URL looks like. If the store really is all garbage,\n` +
      `re-run with --allow-empty-db.`,
  )
  process.exit(1)
}

if (!DELETE) {
  console.log('\nDRY RUN — nothing deleted. Re-run with --delete.')
  process.exit(0)
}

let done = 0
for (const b of orphans) {
  try {
    await del(b.url, { token })
    done++
  } catch (error) {
    console.error(`  failed to delete ${b.pathname}:`, error.message)
  }
}
console.log(`\nDELETED ${done} of ${orphans.length} orphans (${kb(bytesOf(orphans))} reclaimed).`)
if (done !== orphans.length) process.exit(1)
