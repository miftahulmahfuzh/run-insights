#!/usr/bin/env node
/**
 * Backfill sweep for Nina's Media collection: fill `content_hash` for every row that lacks it,
 * then merge the duplicates that are ALREADY in production.
 *
 *   npm run nina:dedupe-media                 # dry run, always — reads production, writes nothing
 *   npm run nina:dedupe-media -- --apply      # writes: hash fills, row repoints, blob releases
 *
 * NOT A TEST, and never part of `npm test`: it reads the real Blob store through the rows' public
 * URLs and, with `--apply`, it repoints rows and DESTROYS Blob objects. Same line
 * `scripts/blob-reap.mjs` and `scripts/nina-profpic.mjs` draw.
 *
 * DATABASE_URL IS PRODUCTION. There is one database in this repo (`.env.local`'s DATABASE_URL is
 * the instance production reads); every number in this run is a production number and every
 * `--apply` write is a production write. Read the dry run before applying. Always.
 *
 * ── WHAT IT DOES, IN ORDER ────────────────────────────────────────────────────────────────────
 *  1. pre-flight: args, env, migration presence, non-empty table
 *  2. load every row of `nina_message_images` (raw SQL — this script cannot import `lib/db`)
 *  3. PASS 1 (hash-fill): GET each row's public blob URL, sha256 the bytes, and queue a
 *     `fill-hash` op writing the column for rows whose `content_hash` is NULL. All rows are
 *     hashed — originals AND references — because the merge's safety argument needs the
 *     reference's own bytes measured (see `scripts/nina-dedupe-plan.mjs`'s header). Rows whose
 *     GET fails: skipped and reported, never guessed.
 *  3b. VERIFY GATE: every member of a multi-row group that did NOT just get filled is re-fetched
 *      and re-hashed. A stored hash a fresh GET contradicts is a `hash-repair` op plus a skipped
 *      group. `scripts/nina-dedupe-media.mjs` trusts a hash it did not just measure for nothing.
 *  4. PASS 2 (merge): `buildMergePlan` groups by (user_id, content_hash), elects keepers among
 *      originals, and returns the ordered ops.
 *  5. report — every op printed (`fill-hash` first, then the merge plan's). DRY RUN STOPS HERE.
 *  6. `--apply` executes ops in order — fills, repairs, repoints, then releases; each
 *      `release-blob` re-asks the live reference gate first
 *      (ROW FIRST, BLOB SECOND — the group's rows are already repointed by the time the gate
 *      runs) and deletes only at zero references.
 *
 * ── WHY THE REFERENCE GATE IS RE-IMPLEMENTED IN SQL ───────────────────────────────────────────
 * `isBlobPathnameReferenced` (`lib/nina/queries.ts:2073`) is the one reference-checked delete in
 * the app, but it lives behind `server-only`/alias imports a `.mjs` script cannot reach. The
 * mirror below counts ROWS over the same six columns the reaper counts
 * (`nina_message_images.pathname/blob_url`, `nina_avatars.pathname/blob_url/thumb_pathname/
 * thumb_url`), user-scoped, plus the reaper's jsonb sweep applied to exactly the two names this
 * run is about to release. An error anywhere in that query counts as UNKNOWN, and UNKNOWN keeps
 * the object — the same err-toward-keep `releaseBlobIfUnreferenced` argues
 * (`lib/nina/blobRelease.ts:53`).
 *
 * ── IDEMPOTENCE ───────────────────────────────────────────────────────────────────────────────
 * A second run: pass 1 finds nothing to fill (its UPDATE guards `content_hash is null`), the
 * previously-merged groups are now one-original-plus-same-URL-references = `tidy` (no ops), and
 * releases only exist for rows that were merged this run. Summary says 0 findings, 0 writes.
 */
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

import {
  buildFillOps,
  buildMergePlan,
  isOriginalRow,
  isStoreUrl,
  parseArgs,
  releaseDecision,
  sha256Hex,
} from './nina-dedupe-plan.mjs'

const require = createRequire(import.meta.url)
const { del } = require('@vercel/blob')
const { neon } = require('@neondatabase/serverless')

const kb = (n) => (n == null ? '?' : `${(n / 1000).toFixed(1)} KB`)

async function main() {
  /* ── 1. pre-flight ─────────────────────────────────────────────────────────────────────────── */
  const { apply } = parseArgs(process.argv.slice(2))

  if (!process.env.DATABASE_URL) {
    console.error('needs DATABASE_URL — run with --env-file=.env.local')
    process.exit(2)
  }
  if (apply && !process.env.BLOB_READ_WRITE_TOKEN) {
    console.error('--apply needs BLOB_READ_WRITE_TOKEN (only `del` uses it; a dry run does not)')
    process.exit(2)
  }
  const sql = neon(process.env.DATABASE_URL)
  const token = process.env.BLOB_READ_WRITE_TOKEN

  try {
    await sql`select content_hash from nina_message_images limit 1`
  } catch (error) {
    if (
      error.code === '42P01' ||
      error.code === '42703' ||
      /column.*content_hash/i.test(error.message)
    ) {
      console.error(
        'nina_message_images.content_hash is missing — phase 1 of media-dedupe (migration 0018)',
      )
      console.error('has not been applied to THIS database. Run its migration first.')
      process.exit(2)
    }
    throw error
  }

  /* ── 2. load every row ─────────────────────────────────────────────────────────────────────── */
  const raw = await sql`
    select id, user_id, message_id, kind, blob_url, pathname, bytes, width, height,
           description, prompt, source_avatar_id, source_image_id, sort_order,
           created_at, content_hash
    from nina_message_images
    order by user_id, created_at, id
  `
  if (raw.length === 0) {
    console.error(
      'nina_message_images holds 0 rows. That is what a DATABASE_URL pointed at the wrong',
    )
    console.error(
      'Neon branch looks like — the same refusal scripts/blob-reap.mjs makes. Refusing.',
    )
    process.exit(2)
  }
  const rows = raw.map((r) => ({
    id: r.id,
    userId: r.user_id,
    messageId: r.message_id,
    kind: r.kind,
    blobUrl: r.blob_url,
    pathname: r.pathname,
    bytes: r.bytes,
    description: r.description,
    sourceAvatarId: r.source_avatar_id,
    sourceImageId: r.source_image_id,
    createdAt: r.created_at,
    contentHash: r.content_hash,
    verifiedHash: null,
    hashFailed: false,
  }))
  const rowById = new Map(rows.map((r) => [r.id, r]))

  /* ── 3. PASS 1 — hash-fill ─────────────────────────────────────────────────────────────────── */
  const fills = []
  const failed = []
  for (const row of rows) {
    if (row.contentHash != null) continue
    const got = await fetchRowBytes(row)
    if (!got.ok) {
      row.hashFailed = true
      failed.push({ id: row.id, reason: got.reason })
      continue
    }
    row.hadNullHash = true // the column was NULL entering this run — pass 1 owns filling it
    row.contentHash = got.hash
    row.verifiedHash = got.hash // measured this run — no re-fetch needed for the verify gate
    row.bytesMismatch = row.bytes != null && got.size !== row.bytes
    fills.push({ id: row.id, hash: got.hash })
  }

  /* ── 3b. VERIFY GATE — re-hash every stored hash that sits in a multi-row group ────────────── */
  const storedCount = rows.filter((r) => r.contentHash != null && r.verifiedHash == null).length
  const groupCounts = new Map()
  for (const r of rows) {
    if (r.contentHash == null) continue
    const key = `${r.userId}|${r.contentHash}`
    groupCounts.set(key, (groupCounts.get(key) ?? 0) + 1)
  }
  for (const row of rows) {
    if (row.contentHash == null || row.verifiedHash != null) continue // just filled, or already failed
    if ((groupCounts.get(`${row.userId}|${row.contentHash}`) ?? 0) < 2) continue // cannot be a finding
    const got = await fetchRowBytes(row)
    if (!got.ok) {
      row.hashFailed = true
      failed.push({ id: row.id, reason: got.reason })
      continue
    }
    row.verifiedHash = got.hash
    if (got.hash !== row.contentHash) row.staleHash = true
  }

  /* ── 4. PASS 2 — the merge plan ────────────────────────────────────────────────────────────── */
  const plannable = rows.filter((r) => r.contentHash != null)
  const plan = buildMergePlan(plannable)
  /* Pass 1's fills are WRITES, not report lines: they join the op list ahead of every
   * repair/repoint/release, so the dry run prints them and --apply executes them. The first
   * landing computed them and wrote nothing — the bug this line exists to keep dead. */
  const ops = [...buildFillOps(rows), ...plan.ops]
  const findings = plan.groups.filter((g) => g.action === 'merge')
  const tidy = plan.groups.filter((g) => g.action === 'tidy')
  const skipped = plan.groups.filter((g) => g.action === 'skipped')

  /* ── 5. report ─────────────────────────────────────────────────────────────────────────────── */
  const mismatchedIds = rows.filter((r) => r.bytesMismatch).map((r) => r.id)
  console.log(`nina dedupe — media          ${apply ? 'APPLY' : 'dry run'}`)
  console.log(`db rows                      ${rows.length}`)
  console.log(
    `hash filled                  ${fills.length}   (content_hash was null — written on --apply)`,
  )
  console.log(`stored hashes re-verified    ${storedCount}`)
  console.log(
    `hash fetch failures          ${failed.length}${failed.length ? '  ← groups containing these are SKIPPED' : ''}`,
  )
  for (const f of failed) console.log(`  ! ${f.id}  ${f.reason}`)
  if (mismatchedIds.length > 0) {
    console.log(
      `bytes metadata mismatches    ${mismatchedIds.length}  (reported only: ${mismatchedIds.join(', ')})`,
    )
  }
  console.log(
    `groups                       ${findings.length} finding(s) / ${tidy.length} tidy / ${skipped.length} skipped`,
  )

  for (const g of findings) {
    const keeper = rowById.get(g.keeperId)
    console.log('')
    console.log(
      `FINDING ${g.contentHash.slice(0, 16)}…  ${g.ids.length} rows  keeper ${g.keeperId}`,
    )
    console.log(
      `  keeper   ${keeper.pathname}  message=${keeper.messageId ?? 'null'} ${
        keeper.description ? 'described' : 'undescribed'
      }  ${kb(keeper.bytes)}`,
    )
    for (const loserId of g.loserIds) {
      const loser = rowById.get(loserId)
      console.log(
        `  loser    ${loser.pathname}  message=${loser.messageId ?? 'null'} ${
          isOriginalRow(loser) ? 'original' : 'reference'
        }  ${kb(loser.bytes)}`,
      )
      console.log(
        `    → merge-row  ${loser.id}: blob_url/pathname → keeper, source_image_id = ${g.keeperId}`,
      )
      console.log(`    → release    ${loser.pathname} (${kb(loser.bytes)}) if live refs = 0`)
    }
  }
  for (const g of tidy) {
    console.log(
      `tidy    ${g.contentHash.slice(0, 16)}…  ${g.ids.length} rows share one object — no action`,
    )
  }
  for (const g of skipped) {
    console.log(`skipped ${g.contentHash.slice(0, 16)}…  ${g.ids.length} rows — ${g.reason}`)
  }

  console.log('')
  for (const op of ops) {
    if (op.op === 'fill-hash')
      console.log(
        `UPDATE nina_message_images SET content_hash = '${op.hash}' WHERE id = '${op.id}'  (fill — column was null)`,
      )
    if (op.op === 'hash-repair')
      console.log(
        `UPDATE nina_message_images SET content_hash = '${op.to}' WHERE id = '${op.id}'  (was '${op.from}')`,
      )
    if (op.op === 'merge-row')
      console.log(
        `UPDATE nina_message_images SET blob_url = '${op.blobUrl}', pathname = '${op.pathname}', source_image_id = '${op.keeperId}' WHERE id = '${op.id}'`,
      )
    if (op.op === 'release-blob')
      console.log(
        `del ${op.blobUrl}  (${op.pathname}, ${kb(op.bytes)}) — only if the live gate says 0 references`,
      )
  }
  const counts = ops.reduce((acc, op) => ((acc[op.op] = (acc[op.op] ?? 0) + 1), acc), {})
  console.log('')
  if (!apply) {
    console.log(
      `DRY RUN — nothing written. ${ops.length} op(s) ` +
        `(${
          Object.entries(counts)
            .map(([k, v]) => `${k} ${v}`)
            .join(', ') || 'none'
        }). Re-run with --apply.`,
    )
    process.exit(0)
  }

  /* ── 6. execute ────────────────────────────────────────────────────────────────────────────── */
  let done = 0
  let errored = 0
  for (const op of ops) {
    try {
      if (op.op === 'fill-hash') {
        /* The `is null` guard is the idempotence the header promises: if another writer filled
         * the column between plan and execute, their measurement stands, never ours over it. */
        await sql`update nina_message_images set content_hash = ${op.hash} where id = ${op.id} and content_hash is null`
      } else if (op.op === 'hash-repair') {
        await sql`update nina_message_images set content_hash = ${op.to} where id = ${op.id}`
      } else if (op.op === 'merge-row') {
        await sql`
          update nina_message_images
             set blob_url = ${op.blobUrl}, pathname = ${op.pathname}, source_image_id = ${op.keeperId}
           where id = ${op.id}
        `
      } else if (op.op === 'release-blob') {
        if (!isStoreUrl(op.blobUrl))
          throw new Error(`refusing to release a non-store URL: ${op.blobUrl}`)
        const gate = await sql`
          select
            (select count(*)::int from nina_message_images
              where user_id = ${op.userId}
                and (pathname = ${op.pathname} or blob_url = ${op.blobUrl})) as image_refs,
            (select count(*)::int from nina_avatars
              where user_id = ${op.userId}
                and (pathname = ${op.pathname} or thumb_pathname = ${op.pathname}
                     or blob_url = ${op.blobUrl} or thumb_url = ${op.blobUrl})) as avatar_refs,
            ((select count(*) from nina_turns
               where args is not null
                 and (args::text like ${`%${op.pathname}%`} or args::text like ${`%${op.blobUrl}%`}))
             + (select count(*) from nina_memory_slots
                 where value is not null
                 and (value::text like ${`%${op.pathname}%`} or value::text like ${`%${op.blobUrl}%`})))::int
              as jsonb_refs
        `
        const counts_ = gate[0] ?? {}
        const verdict = releaseDecision({
          imageRefs: counts_.image_refs,
          avatarRefs: counts_.avatar_refs,
          jsonbRefs: counts_.jsonb_refs,
        })
        if (verdict !== 'released') {
          console.log(`kept (${verdict}) ${op.pathname}`)
          continue
        }
        await del(op.blobUrl, { token })
      } else {
        throw new Error(`unknown op ${op.op}`)
      }
      done++
    } catch (error) {
      errored++
      console.error(`FAILED ${op.op} ${op.id ?? op.pathname}:`, error.message)
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
    return { ok: true, hash: sha256Hex(bytes), size: bytes.byteLength }
  } catch (error) {
    return { ok: false, reason: `GET failed: ${error.message}` }
  }
}

/* Run only as the process entry point, so `tests/nina.dedupeMedia.test.ts` can import the pure
 * module without executing any of this. `scripts/nina-profpic.mjs:580` is the precedent. */
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main()
}
