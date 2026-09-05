/**
 * Reap blobs that nothing in the database references, under every prefix this script knows.
 *
 *   node --env-file=.env.local scripts/blob-reap.mjs                    # dry run, always
 *   node --env-file=.env.local scripts/blob-reap.mjs --delete
 *   node --env-file=.env.local scripts/blob-reap.mjs --prefix nina/     # one prefix only
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
 * double-fire. `nina/` has the same shape: `lib/nina/imageTicket.ts` signs an upload, the browser
 * PUTs, and only then does a `nina_message_images` row name the bytes. None of it is reachable
 * from the app, and none of it is ever cleaned up on its own.
 *
 * ── COUNTING REFERENCES, NOT ROWS (P1-RI-A014) ────────────────────────────────────────────────
 * F35 phase 9's `attachExisting` pins an ALREADY UPLOADED photo to a new message without
 * re-uploading a byte, so one blob is legitimately reachable from TWO `nina_message_images` rows.
 * A reaper that asked "did a row disappear?" would delete a photo another message still shows.
 * So this script never reacts to a row disappearing. It reads the whole store and the whole
 * database and asks, per blob, **how many rows name it** — deleting only at zero. The count is
 * kept and reported rather than collapsed to a boolean, because the `reused` line — one blob named
 * by two rows OF THE SAME TABLE — is the visible proof that the attach path is being counted
 * rather than guessed at. It is deliberately not the same number as `named by 2+ rows`, which for
 * `shots/` is every screenshot in the store: `run_photos` and the `extractions` snapshot that
 * preceded it both name those, and that has never meant reuse.
 *
 * ── WHAT COUNTS AS A LIVE REFERENCE ───────────────────────────────────────────────────────────
 * The UNION of every site in `PREFIXES` below, and every half is load-bearing:
 *
 *   shots/
 *   - `run_photos.pathname` / `run_photos.blob_url` — the mutable photo lifecycle. This is the
 *     authority after a share revocation, because `lib/share/rotateBlobs.ts` renames the blob to a
 *     fresh random pathname and writes the new location to this row (R-15).
 *   - `extractions.blob_urls` — an immutable upload-time snapshot. It can be the ONLY reference to
 *     an extraction that has not been committed to a run yet, so it cannot be skipped. It can also
 *     be STALE after a rotation, naming bytes that no longer exist; that direction is harmless,
 *     since a reference to nothing never protects anything.
 *
 *   nina/
 *   - `nina_message_images.pathname` / `.blob_url` — chat photos, `nina/<userId>/chat/<id>.jpg`.
 *   - `nina_avatars.pathname` / `.blob_url` — the album, `nina/<userId>/avatar-<id>.<ext>`.
 *   - `nina_avatars.thumb_pathname` / `.thumb_url` — the DERIVED grid thumbnail, a second object
 *     under the same prefix. Omitting these two columns would have deleted every thumbnail in the
 *     album on the first run, which is why the card that asked for `nina_message_images` alone was
 *     not the whole job. `thumb_pathname` is nullable; a NULL means no thumbnail, not no reference.
 *
 * Both `pathname` and `url` are collected from each, and a blob survives if either of its own names
 * appears. Matching on one field alone would delete a photo whose row stores the other spelling.
 *
 * ── THE DEFENSIVE SWEEP ───────────────────────────────────────────────────────────────────────
 * `nina_turns.args` and `nina_memory_slots.value` are untyped `jsonb` that hold no blob references
 * today. Rather than assert that and be wrong later — `args` exists precisely so phase 12 can put
 * its own job shape there — the sweep walks both columns for strings that look like a known
 * prefix, adds anything it finds to `live`, and SAYS SO LOUDLY. A name that only the sweep found
 * is a reference site missing from `PREFIXES`, and the script tells you to add it instead of
 * quietly deleting a live blob on the next run.
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
const str = (flag, fallback) => {
  const i = argv.indexOf(flag)
  return i === -1 ? fallback : argv[i + 1]
}

const DELETE = has('--delete')
const MIN_AGE_HOURS = num('--min-age-hours', 24)
const ALLOW_EMPTY_DB = has('--allow-empty-db')
const ONLY_PREFIX = str('--prefix', null)

/**
 * The registry. A prefix that is not here is never touched — an unknown prefix with no known
 * reference sites is indistinguishable from pure garbage, which is the interlock's whole subject.
 * `nina/` mirrors `NINA_BLOB_PREFIX` in `lib/nina/images.ts`; this is a .mjs script and cannot
 * import the TypeScript, so the two are kept in step by hand.
 */
const PREFIXES = [
  { prefix: 'shots/', label: 'run screenshots' },
  { prefix: 'nina/', label: 'Nina chat photos and album' },
]

if (ONLY_PREFIX && !PREFIXES.some((p) => p.prefix === ONLY_PREFIX)) {
  console.error(
    `--prefix ${ONLY_PREFIX} is not a known prefix. Known: ${PREFIXES.map((p) => p.prefix).join(', ')}\n` +
      `Teach this script that prefix's reference sites before pointing it at them.`,
  )
  process.exit(2)
}
const active = PREFIXES.filter((p) => !ONLY_PREFIX || p.prefix === ONLY_PREFIX)

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

/**
 * A blob URL is `https://<store>.public.blob.vercel-storage.com/<pathname>`, so a stored URL
 * carries its prefix behind a slash while a stored pathname carries it at the start.
 */
const namedUnder = (name, prefix) =>
  typeof name === 'string' && (name.startsWith(prefix) || name.includes(`/${prefix}`))
const anyKnownPrefix = (name) => PREFIXES.some((p) => namedUnder(name, p.prefix))

/* ── 1. every name the database holds, and how many ROWS hold it ────────────────────────────── */

/**
 * `live` maps a name to the set of rows naming it, not to a boolean. Two rows naming one blob is
 * the `attachExisting` case, and it must survive the deletion of either one of them.
 */
const live = new Map()
const ref = (name, rowToken) => {
  if (typeof name !== 'string' || name === '') return
  let rows = live.get(name)
  if (!rows) live.set(name, (rows = new Set()))
  rows.add(rowToken)
}
/** Every row naming this blob, by either of its spellings. */
const refRows = (b) => {
  const rows = new Set()
  for (const name of [b.pathname, b.url]) for (const t of live.get(name) ?? []) rows.add(t)
  return rows
}
/** How many distinct rows name this blob. Zero is the only number that permits a delete. */
const refCount = (b) => refRows(b).size
/**
 * Named more than once BY THE SAME TABLE — the `attachExisting` shape, and the one this card
 * exists for. Two DIFFERENT tables naming one blob is the ordinary `shots/` case (`run_photos`
 * plus the `extractions` snapshot that preceded it) and says nothing about reuse, which is why
 * a plain `refCount > 1` would report every screenshot in the store as shared.
 */
const reusedWithinTable = (b) => {
  const perTable = new Map()
  for (const t of refRows(b)) {
    const table = t.slice(0, t.indexOf('#'))
    perTable.set(table, (perTable.get(table) ?? 0) + 1)
  }
  return [...perTable.values()].some((n) => n > 1)
}

const siteCounts = {}
const readSite = async (site, query, fields) => {
  let n = 0
  for (const r of await query()) {
    const rowToken = `${site}#${n++}`
    for (const f of fields) ref(r[f], rowToken)
  }
  siteCounts[site] = n
  return n
}

if (active.some((p) => p.prefix === 'shots/')) {
  await readSite('run_photos', () => sql`select pathname, blob_url from run_photos`, [
    'pathname',
    'blob_url',
  ])
  let n = 0
  for (const r of await sql`select blob_urls from extractions`) {
    const rowToken = `extractions#${n++}`
    for (const b of Array.isArray(r.blob_urls) ? r.blob_urls : []) {
      ref(b?.pathname, rowToken)
      ref(b?.url, rowToken)
    }
  }
  siteCounts['extractions'] = n
}

if (active.some((p) => p.prefix === 'nina/')) {
  await readSite(
    'nina_message_images',
    () => sql`select pathname, blob_url from nina_message_images`,
    ['pathname', 'blob_url'],
  )
  await readSite(
    'nina_avatars',
    () => sql`select pathname, blob_url, thumb_pathname, thumb_url from nina_avatars`,
    ['pathname', 'blob_url', 'thumb_pathname', 'thumb_url'],
  )
}

/* ── 1b. the defensive sweep over untyped jsonb ─────────────────────────────────────────────── */
const beforeSweep = new Set(live.keys())
const sweepFound = new Set()
const walk = (value, rowToken) => {
  if (typeof value === 'string') {
    if (anyKnownPrefix(value)) {
      ref(value, rowToken)
      sweepFound.add(value)
    }
    return
  }
  if (Array.isArray(value)) return value.forEach((v) => walk(v, rowToken))
  if (value && typeof value === 'object')
    return Object.values(value).forEach((v) => walk(v, rowToken))
}
let sweptRows = 0
try {
  for (const r of await sql`select args from nina_turns where args is not null`) {
    walk(r.args, `nina_turns.args#${sweptRows++}`)
  }
  for (const r of await sql`select value from nina_memory_slots`) {
    walk(r.value, `nina_memory_slots.value#${sweptRows++}`)
  }
} catch (error) {
  /* The sweep is a backstop, not a reference site: a branch without these tables still reaps. */
  console.log(`(jsonb sweep skipped: ${error.message})`)
}
const sweepOnly = [...sweepFound].filter((n) => !beforeSweep.has(n))

/* ── 2. every blob in the store ─────────────────────────────────────────────────────────────── */
const all = []
let cursor
do {
  const page = await list({ token, cursor, limit: 1000 })
  all.push(...page.blobs)
  cursor = page.hasMore ? page.cursor : undefined
} while (cursor)

/* ── 3. classify, per prefix ────────────────────────────────────────────────────────────────── */
const cutoff = Date.now() - MIN_AGE_HOURS * 3600_000
const inStore = new Set(all.map((b) => b.pathname))
const known = new Set(PREFIXES.map((p) => p.prefix))
const elsewhere = all.filter((b) => ![...known].some((p) => b.pathname.startsWith(p)))

const sites = Object.entries(siteCounts)
  .map(([s, n]) => `${s}: ${n}`)
  .join(', ')
console.log(`db live names        ${live.size}  (${sites || 'no sites read'})`)
console.log(
  `blobs in store       ${all.length}  (${elsewhere.length} under no known prefix — never touched)`,
)
if (sweepOnly.length > 0) {
  console.log(
    `\n!! the jsonb sweep found ${sweepOnly.length} blob name(s) NO declared reference site holds.\n` +
      `   A writer this script does not know about is naming blobs. Add its column to PREFIXES\n` +
      `   before the next --delete. They are protected for now:`,
  )
  for (const n of sweepOnly.slice(0, 10)) console.log(`     ${n}`)
}

const plans = []
for (const { prefix, label } of active) {
  const mine = all.filter((b) => b.pathname.startsWith(prefix))
  const referenced = mine.filter((b) => refCount(b) > 0)
  const shared = referenced.filter((b) => refCount(b) > 1)
  const reused = referenced.filter(reusedWithinTable)
  const unreferenced = mine.filter((b) => refCount(b) === 0)
  const tooNew = unreferenced.filter((b) => new Date(b.uploadedAt).getTime() > cutoff)
  const orphans = unreferenced.filter((b) => new Date(b.uploadedAt).getTime() <= cutoff)
  const liveNames = [...live.keys()].filter((n) => namedUnder(n, prefix))
  const dangling = liveNames.filter((n) => n.startsWith(prefix) && !inStore.has(n))

  console.log(`\n${prefix}  ${label}`)
  console.log(`  in store           ${mine.length}  (${kb(bytesOf(mine))})`)
  console.log(`  db names here      ${liveNames.length}`)
  console.log(`  referenced         ${referenced.length}  (${kb(bytesOf(referenced))})`)
  if (shared.length > 0) {
    console.log(`    named by 2+ rows ${shared.length}`)
  }
  if (reused.length > 0) {
    console.log(
      `    reused           ${reused.length}  one blob, 2+ rows of ONE table — attachExisting`,
    )
  }
  console.log(`  unreferenced       ${unreferenced.length}  (${kb(bytesOf(unreferenced))})`)
  console.log(
    `    younger than ${MIN_AGE_HOURS}h ${tooNew.length}  kept — could be an upload still in flight`,
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
  console.log(`  db rows naming missing bytes: ${dangling.length}`)

  plans.push({ prefix, label, mine, liveNames, orphans })
}

/**
 * THE INTERLOCK, and the reason this script is safe to hand to a future session. It is PER PREFIX
 * on purpose: a single global check passes as soon as `run_photos` has one row, which would let a
 * database missing the whole `nina_*` schema delete every chat photo and every album thumbnail
 * while the arithmetic still looked healthy. The failure this guards against is per-prefix, so the
 * guard is too.
 *
 * Every blob looks unreferenced when the database says nothing — which is exactly what a
 * `DATABASE_URL` pointing at the wrong branch, an empty local Postgres, or a typo'd env file
 * produces. Without this check the happy path of a misconfiguration is "delete the entire store",
 * and the failure is silent because the arithmetic is internally consistent. So: no live names plus
 * a non-empty store is a configuration error until a human says otherwise.
 */
const refused = plans.filter((p) => p.liveNames.length === 0 && p.mine.length > 0)
if (refused.length > 0 && !ALLOW_EMPTY_DB) {
  for (const p of refused) {
    console.error(
      `\nREFUSING: the database named 0 live blobs under ${p.prefix} while the store holds ${p.mine.length}.`,
    )
  }
  console.error(
    `That is what a wrong DATABASE_URL, or a branch missing those tables, looks like.\n` +
      `If the store really is all garbage, re-run with --allow-empty-db.`,
  )
  process.exit(1)
}

const orphans = plans.flatMap((p) => p.orphans)
if (!DELETE) {
  console.log(`\nDRY RUN — nothing deleted. ${orphans.length} orphan(s). Re-run with --delete.`)
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
