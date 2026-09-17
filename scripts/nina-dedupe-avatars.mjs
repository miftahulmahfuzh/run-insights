#!/usr/bin/env node
/**
 * Backfill sweep for Nina's album: fill `content_hash` for every `nina_avatars` row that lacks it.
 *
 *   npm run nina:dedupe-avatars                # dry run, always — reads production, writes nothing
 *   npm run nina:dedupe-avatars -- --apply     # writes: hash fills only
 *
 * NOT A TEST, and never part of `npm test`: it reads the real Blob store through the rows' public
 * URLs. Unlike `scripts/nina-dedupe-media.mjs`, `--apply` here writes ONE column and deletes
 * nothing, so it needs no `BLOB_READ_WRITE_TOKEN`.
 *
 * DATABASE_URL IS PRODUCTION. There is one database in this repo (`.env.local`'s DATABASE_URL is
 * the instance production reads); every number in this run is a production number and every
 * `--apply` write is a production write. Read the dry run before applying. Always.
 *
 * ── WHY THIS EXISTS, AND WHY IT IS NARROWER THAN THE MEDIA SWEEP ─────────────────────────────
 * The picker's dedup (`dedupeNinaPhotoRefs`, `lib/nina/imageprefs.ts`) can only collapse two rows
 * that BOTH carry a `content_hash` — a `null` is never treated as a duplicate of anything, because
 * there is nothing to prove it against. Measured on production 2026-09-17: the same photograph
 * (a red running track, pink bikini) appeared on two different pages of the reference picker as
 * `2n75t4F7YazN` (2026-09-05, `content_hash` NULL) and `XjpoDg9QY_zo` (2026-09-17, hashed) — a
 * byte-for-byte identical PNG confirmed by downloading both and comparing sha256. The newer row was
 * hashed at write time; the older one predates whenever that started, and nothing ever backfilled
 * it. This script is that backfill, and NOTHING ELSE: no merge, no repoint, no blob release, no
 * perceptual pass. `nina_avatars` has no provenance columns (`source_avatar_id`/`source_image_id`)
 * the way `nina_message_images` does — a duplicate album row is not a "reference" to merge, it is
 * two plain rows that happen to share bytes — and the picker's own read-time dedup is already the
 * right place to hide one from the operator. Filling the hash is enough to let it do that; this
 * script does not touch which row is shown or delete either one.
 *
 * ── WHAT IT DOES, IN ORDER ────────────────────────────────────────────────────────────────────
 *  1. pre-flight: args, env, migration presence, non-empty table
 *  2. load every row of `nina_avatars` (raw SQL — this script cannot import `lib/db`, the same
 *     reason `nina-dedupe-media.mjs`'s header gives: a `.mjs` run under plain `node` cannot resolve
 *     the `@/` path alias or load anything coupled to `next/*`)
 *  3. for every row whose `content_hash` is NULL: GET its public blob URL, sha256 the bytes, queue
 *     a `fill-hash` op. A GET failure is reported and skipped — never guessed.
 *  4. report — every fill printed. DRY RUN STOPS HERE.
 *  5. `--apply` executes the fills, guarded `content_hash is null` so a concurrent writer's value
 *     is never clobbered (`scripts/nina-dedupe-media.mjs`'s own guard, unchanged).
 *
 * ── IDEMPOTENCE ───────────────────────────────────────────────────────────────────────────────
 * A second run finds nothing to fill — the UPDATE's own `content_hash is null` guard, read back:
 * every row this run wrote no longer qualifies. 0 findings, 0 writes.
 *
 * ── REUSES THE MEDIA SWEEP'S PURE PRIMITIVES, DELIBERATELY ───────────────────────────────────
 * `parseArgs`, `isStoreUrl`, `sha256Hex` and `buildFillOps` (`./nina-dedupe-plan.mjs`) take no
 * `nina_message_images`-specific shape — a plain `{ id, contentHash, hadNullHash, hashFailed,
 * verifiedHash }` row is all `buildFillOps` reads. Importing them rather than re-deriving the same
 * four functions is what keeps "a fill-hash op is exactly this" ONE definition across both sweeps.
 */
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

import { buildFillOps, isStoreUrl, parseArgs, sha256Hex } from './nina-dedupe-plan.mjs'

const require = createRequire(import.meta.url)
const { neon } = require('@neondatabase/serverless')

async function main() {
  /* ── 1. pre-flight ─────────────────────────────────────────────────────────────────────────── */
  const { apply } = parseArgs(process.argv.slice(2))

  if (!process.env.DATABASE_URL) {
    console.error('needs DATABASE_URL — run with --env-file=.env.local')
    process.exit(2)
  }
  const sql = neon(process.env.DATABASE_URL)

  try {
    await sql`select content_hash from nina_avatars limit 1`
  } catch (error) {
    if (
      error.code === '42P01' ||
      error.code === '42703' ||
      /column.*content_hash/i.test(error.message)
    ) {
      console.error('nina_avatars.content_hash is missing on THIS database.')
      console.error('Run its migration first.')
      process.exit(2)
    }
    throw error
  }

  /* ── 2. load every row ─────────────────────────────────────────────────────────────────────── */
  const raw = await sql`
    select id, user_id, blob_url, content_hash
    from nina_avatars
    order by user_id, created_at, id
  `
  if (raw.length === 0) {
    console.error(
      'nina_avatars holds 0 rows. That is what a DATABASE_URL pointed at the wrong Neon',
    )
    console.error('branch looks like — the same refusal scripts/blob-reap.mjs makes. Refusing.')
    process.exit(2)
  }
  const rows = raw.map((r) => ({
    id: r.id,
    userId: r.user_id,
    blobUrl: r.blob_url,
    contentHash: r.content_hash,
    verifiedHash: null,
    hashFailed: false,
  }))

  /* ── 3. hash-fill ──────────────────────────────────────────────────────────────────────────── */
  const failed = []
  for (const row of rows) {
    if (row.contentHash != null) continue
    const got = await fetchRowBytes(row)
    if (!got.ok) {
      row.hashFailed = true
      row.fetchFailure = got.reason
      failed.push({ id: row.id, reason: got.reason })
      continue
    }
    row.hadNullHash = true // the column was NULL entering this run
    row.contentHash = got.hash
    row.verifiedHash = got.hash
  }

  /* ── 4. report ─────────────────────────────────────────────────────────────────────────────── */
  const ops = buildFillOps(rows)
  console.log(`nina dedupe — avatars         ${apply ? 'APPLY' : 'dry run'}`)
  console.log(`db rows                       ${rows.length}`)
  console.log(
    `hash filled                   ${ops.length}   (content_hash was null — written on --apply)`,
  )
  console.log(
    `hash fetch failures           ${failed.length}${
      failed.length ? '  ← these rows stay null and unreachable to dedup' : ''
    }`,
  )
  for (const f of failed) console.log(`  ! ${f.id}  ${f.reason}`)

  console.log('')
  for (const op of ops) {
    console.log(
      `UPDATE nina_avatars SET content_hash = '${op.hash}' WHERE id = '${op.id}'  (fill — column was null)`,
    )
  }

  console.log('')
  if (!apply) {
    console.log(`DRY RUN — nothing written. ${ops.length} fill-hash op(s). Re-run with --apply.`)
    process.exit(0)
  }

  /* ── 5. execute ────────────────────────────────────────────────────────────────────────────── */
  let done = 0
  let errored = 0
  for (const op of ops) {
    try {
      /* The `is null` guard is the idempotence this script promises: if another writer filled the
       * column between plan and execute, their measurement stands, never ours over it. */
      await sql`update nina_avatars set content_hash = ${op.hash} where id = ${op.id} and content_hash is null`
      done++
    } catch (error) {
      errored++
      console.error(`FAILED fill-hash ${op.id}:`, error.message)
    }
  }
  console.log(
    `DONE. ${done} of ${ops.length} op(s) applied.` +
      (errored ? ` ${errored} FAILED — re-run to retry; rows are never harmed by a retry.` : ''),
  )
  process.exit(errored > 0 ? 1 : 0)
}

/** GET a row's public blob URL. The store is public; no token, no SDK. Never guess on failure. */
async function fetchRowBytes(row) {
  if (!isStoreUrl(row.blobUrl)) return { ok: false, reason: `not a store URL: ${row.blobUrl}` }
  try {
    const res = await fetch(row.blobUrl)
    if (!res.ok) return { ok: false, reason: `GET ${res.status}` }
    const bytes = new Uint8Array(await res.arrayBuffer())
    return { ok: true, hash: sha256Hex(bytes) }
  } catch (error) {
    return { ok: false, reason: `GET failed: ${error.message}` }
  }
}

/* Run only as the process entry point — `scripts/nina-dedupe-media.mjs:698`'s precedent, so a
 * future test could import this module's internals without executing any of it. */
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main()
}
