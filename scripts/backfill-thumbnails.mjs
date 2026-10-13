/**
 * Derive the missing grid thumbnails — media-thumbnails phase 5.
 *
 *   node --experimental-strip-types --no-warnings --env-file=.env.local \
 *     scripts/backfill-thumbnails.mjs                        # DRY RUN, always
 *   … scripts/backfill-thumbnails.mjs --apply
 *   … scripts/backfill-thumbnails.mjs --table media --limit 50 --apply
 *
 * NOT A TEST, and never part of `npm test`: it reads the real database and the real Blob store,
 * and with `--apply` it writes new objects and updates rows. Same line `scripts/blob-reap.mjs` and
 * `scripts/f04-e2e-probe.mjs` draw. **Dry run is the default** because `.env.local`'s
 * `DATABASE_URL` is production — there is no second database.
 *
 * ── WHAT IT IS FOR ───────────────────────────────────────────────────────────────────────────
 * Phase 1 added `thumb_url`/`thumb_pathname` to `nina_message_images` and `run_photos`, and both
 * are NULL on every row that predates it — which on 2026-10-13 was every row. A NULL renders the
 * ORIGINAL, so until this script runs the feature saves nothing at all. This is the half that
 * turns it on for photographs that already exist; the write paths handle the ones that do not yet.
 *
 * `nina_avatars` is swept too, even though F34 R1 has filled it at upload time since it shipped:
 * its columns are nullable for the same reasons, pre-F34 rows carry NULL, and any row whose
 * browser-side derivation failed carries NULL permanently. An operator asking "is the album
 * fully covered?" should not have to answer it from two places.
 *
 * ── THE SPEC IS IMPORTED, THE PIPELINE IS LOCAL, AND THAT SPLIT IS DELIBERATE ────────────────
 * `lib/photos/thumbnailSpec.ts` is imported directly (hence its `./resizeTarget.ts` extension —
 * see that file's note), so the short edge, the quality and the box arithmetic here are the SAME
 * VALUES the two encoders use. They cannot drift, because there is only one of them.
 *
 * What is NOT imported is `lib/photos/deriveThumbnail.ts`: it opens with `import 'server-only'`,
 * which throws under raw node (measured — *"This module cannot be imported from a Client
 * Component module"*), so a script cannot have it at any price. The four chained sharp calls
 * below are therefore a second copy of that module's pipeline, and the precedent for that is
 * `scripts/nina-dedupe-media.mjs`'s `signBytes` against `lib/nina/perceptualSign.ts`, which
 * carries the rule this one inherits verbatim: **if one changes, the other changes in the same
 * commit, and the reverse.** Copying four lines of sharp chaining is a known, written-down cost;
 * copying the three constants would have been the unwritten one.
 *
 * ── A 403 FILLS NOTHING, AND THAT IS THE CORRECT ANSWER ──────────────────────────────────────
 * A suspended Blob store answers every GET with `403 Your store is blocked`. Every such row is
 * reported as a failure and nothing is written. A run against a blocked store is therefore a
 * no-op with an honest report, not a table full of stamped NULLs — which matters because the
 * suspension is the thing that motivated this script.
 *
 * ── IT IS RESUMABLE BY CONSTRUCTION ─────────────────────────────────────────────────────────
 * The work set is `WHERE thumb_url IS NULL`, so a run that dies half way leaves the rows it
 * finished out of the next run's set. There is no cursor to keep and no state outside the table.
 * `--limit` exists for exactly this: take a bite, look at the report, take another.
 */
import { createRequire } from 'node:module'

import {
  PHOTO_THUMB_CONTENT_TYPE,
  PHOTO_THUMB_EXT,
  PHOTO_THUMB_JPEG_QUALITY_PERCENT,
  thumbnailTargetFor,
} from '../lib/photos/thumbnailSpec.ts'

const require = createRequire(import.meta.url)
const { put } = require('@vercel/blob')
const { neon } = require('@neondatabase/serverless')
const sharp = require('sharp')

const argv = process.argv.slice(2)
const has = (flag) => argv.includes(flag)
const str = (flag, fallback) => {
  const i = argv.indexOf(flag)
  return i === -1 ? fallback : argv[i + 1]
}
const num = (flag, fallback) => {
  const i = argv.indexOf(flag)
  return i === -1 ? fallback : Number(argv[i + 1])
}

const APPLY = has('--apply')
const LIMIT = num('--limit', Infinity)
const ONLY_TABLE = str('--table', 'all')
const CONCURRENCY = num('--concurrency', 4)

/**
 * The three reference sites, as a registry rather than as three copies of the loop.
 *
 * `thumbPathnameFor` puts `thumb-` on the ORIGINAL's basename, which keeps the derivative under
 * the same prefix and the same `nina/<userId>/` subtree (RU-7) as the object it belongs to. That
 * is what makes it visible to `scripts/blob-reap.mjs` under a prefix the reaper already walks, and
 * what makes an orphan attributable to a user. The stored pathname still differs — `put` runs with
 * `addRandomSuffix`, so Blob appends its own — which is exactly why `thumb_pathname` is a column
 * and not a computation. See the column's header.
 */
const TABLES = [
  {
    key: 'media',
    table: 'nina_message_images',
    label: 'Nina chat + Media photographs',
    /* The table this plan exists for: 768x1024 PNGs, ~1 MB each, 48 to a page. */
  },
  { key: 'shots', table: 'run_photos', label: 'run screenshots' },
  { key: 'avatars', table: 'nina_avatars', label: 'her album' },
]

if (ONLY_TABLE !== 'all' && !TABLES.some((t) => t.key === ONLY_TABLE)) {
  console.error(
    `--table ${ONLY_TABLE} is not known. Known: all, ${TABLES.map((t) => t.key).join(', ')}`,
  )
  process.exit(2)
}
if (!process.env.DATABASE_URL || !process.env.BLOB_READ_WRITE_TOKEN) {
  console.error('needs DATABASE_URL and BLOB_READ_WRITE_TOKEN — run with --env-file=.env.local')
  process.exit(2)
}
if (!Number.isFinite(CONCURRENCY) || CONCURRENCY < 1 || CONCURRENCY > 16) {
  console.error('--concurrency must be between 1 and 16')
  process.exit(2)
}

const sql = neon(process.env.DATABASE_URL)
const active = TABLES.filter((t) => ONLY_TABLE === 'all' || t.key === ONLY_TABLE)

/** `nina/u1/chat/abc.jpg` → `nina/u1/chat/thumb-abc.jpg`; `shots/x.jpg` → `shots/thumb-x.jpg`. */
function thumbPathnameFor(pathname) {
  const cut = pathname.lastIndexOf('/')
  const dir = cut === -1 ? '' : pathname.slice(0, cut + 1)
  const base = pathname.slice(cut + 1).replace(/\.[^.]+$/, '')
  return `${dir}thumb-${base}.${PHOTO_THUMB_EXT}`
}

/**
 * The pipeline. `lib/photos/deriveThumbnail.ts`'s `deriveThumbnailBytes`, line for line — see the
 * header for why there are two of it and what that obliges.
 *
 * `flatten` is not cosmetic: her originals are PNGs with an alpha channel, and alpha flattens to
 * BLACK under a JPEG encoder unless a ground is painted first, which on a portrait is a black
 * halo around her hair.
 */
async function deriveThumb(bytes) {
  const img = sharp(bytes, { failOn: 'none' })
  const meta = await img.metadata()
  if (meta.width == null || meta.height == null) return null
  const target = thumbnailTargetFor(meta.width, meta.height)
  const out = await img
    .resize(target.width, target.height, { fit: 'fill' })
    .flatten({ background: '#ffffff' })
    .jpeg({ quality: PHOTO_THUMB_JPEG_QUALITY_PERCENT })
    .toBuffer()
  return { bytes: out, width: target.width, height: target.height }
}

async function fetchOriginal(url) {
  const parsed = new URL(url)
  if (parsed.protocol !== 'https:') return { ok: false, reason: 'not an https URL' }
  const res = await fetch(parsed, { redirect: 'follow' })
  if (!res.ok) {
    /* `403 Your store is blocked` is the suspension, and it is worth naming rather than counting:
     * an operator seeing it has a billing problem, not a data problem. */
    return { ok: false, reason: `GET ${res.status}` }
  }
  return { ok: true, bytes: Buffer.from(await res.arrayBuffer()) }
}

/**
 * **One OBJECT, not one row — and the difference is 267 rows out of 1,304.**
 *
 * `resolveAttachment` (`lib/nina/actions/send.ts`) implements R26 by copying `blob_url` and
 * `pathname` onto a NEW row without copying a byte, so one Blob object is legitimately named by
 * several rows — across tables, including the one that IS her current profile picture. That is
 * the same fact `isBlobPathnameReferenced` and `scripts/blob-reap.mjs` are both built around.
 *
 * Measured on this database before the first run: 1,304 rows needed a thumbnail and they named
 * only 1,037 distinct objects. A row-keyed sweep would therefore have fetched, derived and PUT
 * 267 redundant copies — spending Blob Data Transfer and Advanced Operations, the exact meters
 * this whole plan exists to protect, to create 267 duplicate objects that the reaper would then
 * have to carry forever.
 *
 * So the unit of work is the OBJECT: derive once, then point every row that names it at the one
 * thumbnail. Rows sharing bytes share a derivative, exactly as they already share the original.
 */
async function fillObject(job) {
  try {
    const got = await fetchOriginal(job.blobUrl)
    if (!got.ok) return { ...job, ok: false, reason: got.reason }

    const thumb = await deriveThumb(got.bytes)
    if (thumb == null) return { ...job, ok: false, reason: 'undecodable' }

    const measured = { original: got.bytes.length, thumb: thumb.bytes.length }
    if (!APPLY) return { ...job, ok: true, ...measured }

    const blob = await put(thumbPathnameFor(job.pathname), thumb.bytes, {
      access: 'public',
      contentType: PHOTO_THUMB_CONTENT_TYPE,
      addRandomSuffix: true,
      allowOverwrite: false,
      token: process.env.BLOB_READ_WRITE_TOKEN,
    })

    /* ROW AFTER BLOB — the opposite of the delete rule, and correct for the same reason. A blob
     * written before its row is an orphan `blob-reap` finds and removes; a row pointing at an
     * object that was never written is a broken <img> for every viewer. Err toward recoverable.
     *
     * `and thumb_url is null` makes the update idempotent and makes a concurrent writer win: if
     * the live write path filled this row while the sweep was deriving, the sweep's object is
     * left unreferenced (an orphan the reaper collects) rather than overwriting a pointer the
     * app just published. Losing that race costs bytes; winning it wrongly costs correctness. */
    for (const row of job.rows) {
      await sql`
        update ${sql.unsafe(row.table)}
        set thumb_url = ${blob.url}, thumb_pathname = ${blob.pathname}
        where id = ${row.id} and thumb_url is null
      `
    }
    return { ...job, ok: true, ...measured }
  } catch (cause) {
    return { ...job, ok: false, reason: String(cause?.message ?? cause).slice(0, 120) }
  }
}

/** Bounded parallelism. Pro allows 120 simple / 75 advanced operations a second; 4 is polite. */
async function mapLimit(items, limit, fn) {
  const out = []
  let next = 0
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      for (;;) {
        const i = next++
        if (i >= items.length) return
        out[i] = await fn(items[i])
      }
    }),
  )
  return out
}

const fmt = (n) => `${(n / 1_048_576).toFixed(1)} MB`

console.log(
  `backfill-thumbnails — ${APPLY ? 'APPLY (writes blobs and rows)' : 'DRY RUN, nothing will be written'}` +
    `${Number.isFinite(LIMIT) ? `, limit ${LIMIT} objects` : ''}, concurrency ${CONCURRENCY}\n`,
)

/* ── 1. the work set, keyed by object ──────────────────────────────────────────────────────── */
const byObject = new Map()
const siteStats = []

for (const site of active) {
  const [{ total }] = await sql`select count(*)::int as total from ${sql.unsafe(site.table)}`
  const rows = await sql`
    select id, blob_url, pathname from ${sql.unsafe(site.table)} where thumb_url is null
  `
  siteStats.push({ site, total, missing: rows.length })
  for (const r of rows) {
    const existing = byObject.get(r.blob_url)
    if (existing == null) {
      byObject.set(r.blob_url, {
        blobUrl: r.blob_url,
        pathname: r.pathname,
        rows: [{ table: site.table, id: r.id }],
      })
    } else {
      existing.rows.push({ table: site.table, id: r.id })
    }
  }
}

for (const { site, total, missing } of siteStats) {
  console.log(
    `${site.table.padEnd(21)} rows ${String(total).padStart(5)}   without a thumbnail ${missing}`,
  )
}

const jobs = [...byObject.values()]
const rowsNeeding = jobs.reduce((a, j) => a + j.rows.length, 0)
console.log(
  `\n${rowsNeeding} rows name ${jobs.length} distinct objects` +
    `${rowsNeeding > jobs.length ? ` — ${rowsNeeding - jobs.length} share bytes with another row and will share one thumbnail` : ''}\n`,
)

if (jobs.length === 0) {
  console.log('nothing to do')
  process.exit(0)
}

/* ── 2. derive ─────────────────────────────────────────────────────────────────────────────── */
const todo = Number.isFinite(LIMIT) ? jobs.slice(0, LIMIT) : jobs
const results = await mapLimit(todo, CONCURRENCY, fillObject)
const ok = results.filter((r) => r.ok)
const failed = results.filter((r) => !r.ok)
const originalBytes = ok.reduce((a, r) => a + r.original, 0)
const thumbBytes = ok.reduce((a, r) => a + r.thumb, 0)
const rowsCovered = ok.reduce((a, r) => a + r.rows.length, 0)

console.log(
  `${APPLY ? 'filled' : 'would fill'} ${ok.length} objects covering ${rowsCovered} rows, failed ${failed.length}`,
)
if (ok.length > 0) {
  console.log(
    `originals ${fmt(originalBytes)} → thumbnails ${fmt(thumbBytes)}` +
      `  (${(100 - (thumbBytes / originalBytes) * 100).toFixed(1)}% smaller per tile)`,
  )
}

/* Grouped, because 1,037 objects failing one way is ONE fact and not 1,037 of them. A store-wide
 * `GET 403` in particular must read as a single line saying the store is blocked. */
const byReason = new Map()
for (const f of failed) byReason.set(f.reason, (byReason.get(f.reason) ?? 0) + 1)
for (const [reason, n] of [...byReason].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(n).padStart(5)}  ${reason}`)
}

if (!APPLY && ok.length > 0) console.log('\nre-run with --apply to write them.')
