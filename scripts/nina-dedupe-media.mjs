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
 *  3c. PERCEPTUAL SIGNATURES: every ORIGINAL that does not already carry one (the write paths
 *      sign rows now — migration 0019's columns, `lib/nina/perceptualSign.ts`'s one signer) is
 *      fetched once more and signed (64-bit dHash + 16x16 grayscale mean-abs, via sharp — the
 *      pass goes quiet, not the sweep, without it). This is what sees the pass the byte keys
 *      cannot: a photograph downloaded out of the collection and re-uploaded RE-ENCODES on pick,
 *      so its hash differs from the original's while the pixels are the same photograph
 *      (measured 2026-09-10: `DfeYafysbVAe` + `zGGxRerRI_jS`, dHash 0/64, mean-abs 0.1/255; the
 *      pair that kept coming back after the write paths shipped was `bjNniaR6_0dY` +
 *      `IGwGhWzPNmaR`, same gates). A signature measured THIS RUN gets a `fill-perceptual` op —
 *      the measurement is persisted, not left in the console: the first landing computed fills
 *      and wrote nothing, and this script has been down that road before.
 *  3d. PERCEPTUAL VERIFY GATE: every stored signature on an original is re-fetched and re-signed.
 *      A stored value a fresh GET contradicts is a `perceptual-repair` op — measured 2026-09-11 on
 *      production `I1v6qeHJBMwv`: its stored dHash was 26/64 from its true re-upload twin
 *      `YnIGDDwYH4HT`, while a fresh sign of the same live blob measured 1/64 (inside the gate).
 *      A stored signature was never re-verified before this pass, so a value that was wrong from
 *      the moment it was written — an old buggy run, a partial fetch, anything — stayed wrong
 *      forever and silently defeated STEP 1b for that photograph. WIDENED 2026-09-15 from
 *      "shares dimensions with another original" to EVERY stored-signed original: that day
 *      measured 49 of 71 signed originals 23-42/64 from their OWN live bytes (the Replace flow's
 *      byte swaps left the perceptual pair standing — fixed in `updateNinaChatPhotoBlob`), and a
 *      singleton's stale signature defeats every FUTURE match with no group required. See the
 *      plan module's `perceptualVerifyCandidates` header for the full argument.
 *  3e. PHANTOM ORIGINALS: a row that is an ORIGINAL by `isOriginalRow` yet arrived with
 *      `content_hash` NULL. It is a reference row whose parent was hard-deleted: the FK's
 *      deliberate `ON DELETE SET NULL` (`lib/db/schema/nina/chat.ts:614-618`) blanked its
 *      provenance and silently reclassified it, while it had never been given the measurements an
 *      original needs. Measured on production 2026-09-16: one such row, `Tdw_AkrJT0ks`, whose blob
 *      already 404s — UNRECOVERABLE, so it is named in the report and left exactly where it is
 *      (removing a ghost row is a human decision this script does not make under any flag). A
 *      phantom whose object survives is promoted instead: pass 1 hashes it, pass 3c signs it, and
 *      the NEW `fill-dimensions` op writes the `width`/`height` (+ `bytes` under `coalesce`) that
 *      nothing in this family ever filled — without which `isPerceptualTwin` refuses the row on its
 *      first line and the phantom stays a permanently invisible duplicate even with live bytes.
 *      The perceptual pass is the only pass that can ever match one, because a phantom names the
 *      avatar object's bytes while its twin names a separately-encoded selfie object.
 *  4. PASS 2 (merge): `buildMergePlan` groups by (user_id, content_hash), elects keepers among
 *      originals, and returns the ordered ops; `buildPerceptualMergePlan` then clusters the
 *      remaining originals at conservative gates (same dimensions, dHash ≤ 1, mean-abs ≤ 2 —
 *      read `scripts/nina-dedupe-plan.mjs`'s header before loosening either number). A row the
 *      byte plan repoints is excluded from the perceptual plan — no row is repointed twice.
 *  5. report — every op printed (`fill-hash` first, then the merge plan's). DRY RUN STOPS HERE.
 *  6. `--apply` executes ops in order — fills, repairs, repoints, then releases; each
 *      `release-blob` re-asks the live reference gate first
 *      (ROW FIRST, BLOB SECOND — the group's rows are already repointed by the time the gate
 *      runs) and deletes only at zero references.
 *
 * ── WHY THE REFERENCE GATE IS RE-IMPLEMENTED IN SQL ───────────────────────────────────────────
 * `isBlobPathnameReferenced` (`lib/nina/queries/images.ts:864`) is the one reference-checked delete in
 * the app, but it lives behind `server-only`/alias imports a `.mjs` script cannot reach. The
 * mirror below counts ROWS over the same six columns the reaper counts
 * (`nina_message_images.pathname/blob_url`, `nina_avatars.pathname/blob_url/thumb_pathname/
 * thumb_url`), user-scoped, plus the reaper's jsonb sweep applied to exactly the two names this
 * run is about to release. An error anywhere in that query counts as UNKNOWN, and UNKNOWN keeps
 * the object — the same err-toward-keep `releaseBlobIfUnreferenced` argues
 * (`lib/nina/blobRelease.ts:53`).
 *
 * ── IDEMPOTENCE ───────────────────────────────────────────────────────────────────────────────
 * A second run: pass 1 finds nothing to fill (its UPDATE guards `content_hash is null`), pass 3c
 * re-signs nothing (stored signatures are decoded, never re-measured; `fill-perceptual` guards
 * `perceptual_hash is null` the same way), pass 3d re-verifies the same dimension-sharing rows
 * again and finds them confirmed (a `perceptual-repair` writes the true value, so the next run's
 * GET agrees with it and proposes nothing), the previously-merged groups are now
 * one-original-plus-same-URL-references = `tidy` (no ops), and releases only exist for rows that
 * were merged this run. Summary says 0 findings, 0 writes.
 * `fill-dimensions` guards `width is null and height is null` (its OWN columns — a `content_hash
 * is null` guard would never fire, since `fill-hash` fills that column earlier in the same op
 * list), so a second run measures the same pixels and writes nothing.
 */
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

import {
  buildFillDimensionOps,
  buildFillOps,
  buildFillPerceptualOps,
  buildMergePlan,
  buildPerceptualMergePlan,
  classifyPhantomOriginals,
  decodeStoredSignature,
  isOriginalRow,
  isStoreUrl,
  parseArgs,
  perceptualVerifyCandidates,
  releaseDecision,
  sha256Hex,
} from './nina-dedupe-plan.mjs'

const require = createRequire(import.meta.url)
const { del } = require('@vercel/blob')
const { neon } = require('@neondatabase/serverless')
/* sharp signs the originals for the perceptual pass. If it is missing the sweep still runs —
 * only the perceptual half goes quiet; the byte passes never needed it. */
let sharp = null
try {
  sharp = require('sharp')
} catch {
  sharp = null
}

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
  try {
    await sql`select perceptual_hash, perceptual_sig from nina_message_images limit 1`
  } catch (error) {
    if (
      error.code === '42P01' ||
      error.code === '42703' ||
      /column.*(perceptual_hash|perceptual_sig)/i.test(error.message)
    ) {
      console.error(
        'nina_message_images.perceptual_hash/perceptual_sig are missing — migration 0019',
      )
      console.error('of the media-dedupe follow-up has not been applied to THIS database.')
      console.error('Run its migration first: the sweep now persists the signatures it measures.')
      process.exit(2)
    }
    throw error
  }

  /* ── 2. load every row ─────────────────────────────────────────────────────────────────────── */
  const raw = await sql`
    select id, user_id, message_id, kind, blob_url, pathname, bytes, width, height,
           description, prompt, source_avatar_id, source_image_id, sort_order,
           created_at, content_hash, perceptual_hash, perceptual_sig
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
    width: r.width,
    height: r.height,
    description: r.description,
    sourceAvatarId: r.source_avatar_id,
    sourceImageId: r.source_image_id,
    createdAt: r.created_at,
    contentHash: r.content_hash,
    perceptualHash: r.perceptual_hash,
    perceptualSig: r.perceptual_sig,
    verifiedHash: null,
    hashFailed: false,
    /* The load-time shape, captured before any pass writes to this object. `hadNullHashAtLoad` is
     * deliberately NOT `hadNullHash`: pass 1 sets that one only after a SUCCESSFUL GET, and a
     * phantom whose object is gone is precisely the row the census must not lose. `hadNullDims`
     * drives `fill-dimensions`; `bytes` rides along under `coalesce` rather than gating the op,
     * because a row may honestly carry a size without ever having been measured for pixels. */
    hadNullHashAtLoad: r.content_hash == null,
    hadNullDims: r.width == null && r.height == null,
  }))
  const rowById = new Map(rows.map((r) => [r.id, r]))

  /* A stored signature IS the signature — decode it for planning and never re-measure it. The
   * write paths signed these rows with the same pipeline this script's `signBytes` runs, so a
   * re-fetch would spend a GET per original to recompute a fact the row already holds. Null
   * (absent or malformed) leaves the row to pass 3c, which may measure it fresh. */
  for (const row of rows) {
    const stored = decodeStoredSignature(row)
    if (stored != null) {
      row.sig = stored
      row.perceptualSource = 'stored'
    }
  }

  /* ── 3. PASS 1 — hash-fill ─────────────────────────────────────────────────────────────────── */
  const fills = []
  const failed = []
  for (const row of rows) {
    if (row.contentHash != null) continue
    const got = await fetchRowBytes(row)
    if (!got.ok) {
      row.hashFailed = true
      /* Kept on the row, not only in `failed`: the phantom census reports the reason verbatim, and
       * "GET 404" vs "not a store URL" is the difference between a deleted object and a malformed
       * row — an operator needs to know which one they are looking at. */
      row.fetchFailure = got.reason
      failed.push({ id: row.id, reason: got.reason })
      continue
    }
    row.hadNullHash = true // the column was NULL entering this run — pass 1 owns filling it
    row.contentHash = got.hash
    row.verifiedHash = got.hash // measured this run — no re-fetch needed for the verify gate
    row.bytesMismatch = row.bytes != null && got.size !== row.bytes
    adoptMeasuredDimensions(row, null, got.size)
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

  /* ── 3c. PERCEPTUAL SIGNATURES — sign every original, so re-encode twins are visible ───────── */
  const originalCount = rows.filter((r) => isOriginalRow(r)).length
  let unsigned = 0
  if (sharp == null) {
    console.log('perceptual signatures        skipped — sharp is not installed')
  } else {
    for (const row of rows) {
      /* A stored signature was decoded at load; only rows WITHOUT one are measured here, and a
       * measurement is queued for persistence (`fill-perceptual`) rather than left in this run's
       * memory — the first landing computed signatures and wrote nothing, and pass-1's fills were
       * the same lesson once already. */
      if (!isOriginalRow(row) || row.sig != null || row.hashFailed) continue
      const got = await fetchRowBytes(row)
      if (!got.ok) {
        unsigned++
        continue
      }
      try {
        row.sig = await signBytes(got.bytes)
        row.perceptualSource = 'measured'
        /* The dimensions ride the signature's own `metadata()` read. Adopting them onto the row
         * NOW — not only into a `fill-dimensions` op — is what lets a phantom cluster in THIS run:
         * `isPerceptualTwin` refuses any row with a NULL width/height, so a phantom that had to
         * wait for the next run would stay a visible duplicate until somebody ran the sweep twice. */
        adoptMeasuredDimensions(row, row.sig, got.size)
      } catch {
        unsigned++ // undecodable bytes — the row simply does not participate in the perceptual pass
      }
    }
  }

  /* ── 3d. PERCEPTUAL VERIFY GATE — re-sign EVERY stored signature (widened 2026-09-15: a stale
   * signature on a singleton row defeats every future match with no group required — 49/71
   * production originals were ghosted that day; see the plan module's header for the argument
   * and the 2026-09-11 `I1v6qeHJBMwv` measurement for the origin of the gate). */
  const verifyCandidates = perceptualVerifyCandidates(rows)
  let verifyFailed = 0
  for (const row of verifyCandidates) {
    const got = await fetchRowBytes(row)
    if (!got.ok) {
      verifyFailed++
      continue
    }
    try {
      row.verifiedSig = await signBytes(got.bytes)
      /* The rare shape pass 3c cannot reach: a row that already carried a STORED signature (so 3c
       * skipped it) but whose dimensions are NULL. The verify GET measures them anyway; adopt them
       * rather than throw the measurement away. */
      adoptMeasuredDimensions(row, row.verifiedSig, got.size)
    } catch {
      verifyFailed++ // undecodable bytes — the stored value stands, no worse than before this gate
    }
  }

  /* ── 4. PASS 2 — the merge plan (byte-exact first, then the perceptual pass on the remainder) ─ */
  const plannable = rows.filter((r) => r.contentHash != null)
  const plan = buildMergePlan(plannable)
  /* A row the byte pass repoints is a reference by the time the perceptual plan would run — and
   * no row may be repointed twice in one run. Excluded, not skipped: its own merge already lands. */
  const byteLoserIds = new Set(plan.ops.filter((o) => o.op === 'merge-row').map((o) => o.id))
  const perceptual = buildPerceptualMergePlan(rows, byteLoserIds)
  /* Pass 1's fills are WRITES, not report lines: they join the op list ahead of every
   * repair/repoint/release, so the dry run prints them and --apply executes them. The first
   * landing computed them and wrote nothing — the bug this line exists to keep dead. The
   * perceptual fills ride the same lesson: a signature measured this run is written this run. */
  const ops = [
    ...buildFillOps(rows),
    ...buildFillPerceptualOps(rows),
    ...buildFillDimensionOps(rows),
    ...plan.ops,
    ...perceptual.ops,
  ]
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
    `groups                       ${findings.length} byte finding(s) / ${perceptual.groups.length} perceptual / ${tidy.length} tidy / ${skipped.length} skipped`,
  )
  if (sharp != null) {
    const signedCount = rows.filter((r) => r.sig != null).length
    console.log(
      `perceptual signatures        ${signedCount} of ${originalCount} originals${
        unsigned ? ` (${unsigned} unsigned — they do not participate)` : ''
      }`,
    )
    const repairedCount = perceptual.ops.filter((o) => o.op === 'perceptual-repair').length
    console.log(
      `stored signatures re-verified ${verifyCandidates.length}` +
        `${repairedCount ? `  (${repairedCount} contradicted by a fresh GET — repaired)` : ''}` +
        `${verifyFailed ? `  (${verifyFailed} fetch/decode failures — stored value stands)` : ''}`,
    )
  }

  /* ── PHANTOM ORIGINALS — the 2026-09-16 defect's census, row by row ────────────────────────── */
  const phantoms = classifyPhantomOriginals(rows)
  const phantomTotal =
    phantoms.recovered.length + phantoms.partial.length + phantoms.unrecoverable.length
  console.log(
    `phantom originals            ${phantoms.recovered.length} recovered / ` +
      `${phantoms.partial.length} partial / ${phantoms.unrecoverable.length} unrecoverable` +
      (phantomTotal === 0 ? '   (none — every original carries its own measurements)' : ''),
  )
  for (const p of phantoms.recovered) {
    console.log(
      `  + ${p.id}  ${p.pathname}  ${p.contentHash.slice(0, 16)}…  ` +
        `${p.width}x${p.height}  ${kb(p.bytes)}  — promoted, fills queued`,
    )
  }
  for (const p of phantoms.partial) {
    console.log(
      `  ~ ${p.id}  ${p.pathname}  hash recovered; still missing: ${p.missing.join(' + ')}`,
    )
  }
  for (const p of phantoms.unrecoverable) {
    console.log(`  ! ${p.id}  ${p.pathname}`)
    console.log(`      ${p.reason} — UNRECOVERABLE: the object is gone, so no measurement of these`)
    console.log(`      bytes can ever be taken. Reported, never removed: deleting the row is a`)
    console.log(`      separate human decision this sweep does not make under any flag.`)
  }

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
  for (const g of perceptual.groups) {
    const keeper = rowById.get(g.keeperId)
    console.log('')
    console.log(
      `PERCEPTUAL FINDING  keeper ${g.keeperId}  ${g.ids.length} rows  (same pixels, different bytes)`,
    )
    console.log(
      `  keeper   ${keeper.pathname}  message=${keeper.messageId ?? 'null'} ${
        keeper.description ? 'described' : 'undescribed'
      }  ${kb(keeper.bytes)}`,
    )
    for (const p of g.pairs) {
      const loser = rowById.get(p.loserId)
      console.log(
        `  loser    ${loser.pathname}  message=${loser.messageId ?? 'null'} ${
          isOriginalRow(loser) ? 'original' : 'reference'
        }  ${kb(loser.bytes)}`,
      )
      console.log(
        `    measured  dHash ${p.dhash}/64, 16x16 mean-abs ${p.sig16}/255  (gates: ≤1, ≤2)`,
      )
      console.log(
        `    → merge-row  ${p.loserId}: blob_url/pathname → keeper, source_image_id = ${g.keeperId}, byte-facts → keeper's`,
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
    if (op.op === 'fill-perceptual')
      console.log(
        `UPDATE nina_message_images SET perceptual_hash = '${op.dhash}', perceptual_sig = '<${op.sig.length} chars base64>' WHERE id = '${op.id}'  (perceptual fill — signature measured this run)`,
      )
    if (op.op === 'fill-dimensions')
      console.log(
        `UPDATE nina_message_images SET width = ${op.width}, height = ${op.height}, ` +
          `bytes = coalesce(bytes, ${op.bytes ?? 'null'}) WHERE id = '${op.id}'` +
          `  (dimension fill — the columns were null; a phantom original cannot enter the` +
          ` perceptual pass without them)`,
      )
    if (op.op === 'hash-repair')
      console.log(
        `UPDATE nina_message_images SET content_hash = '${op.to}' WHERE id = '${op.id}'  (was '${op.from}')`,
      )
    if (op.op === 'perceptual-repair')
      console.log(
        `UPDATE nina_message_images SET perceptual_hash = '${op.dhash}', perceptual_sig = '<${op.sig.length} chars base64>' WHERE id = '${op.id}'  (perceptual repair — stored signature contradicted by a fresh GET)`,
      )
    if (op.op === 'merge-row')
      console.log(
        `UPDATE nina_message_images SET blob_url = '${op.blobUrl}', pathname = '${op.pathname}', source_image_id = '${op.keeperId}' WHERE id = '${op.id}'`,
      )
    if (op.op === 'merge-row' && op.contentHash != null)
      console.log(
        `UPDATE nina_message_images SET content_hash = '${op.contentHash}', width = ${op.width}, height = ${op.height}, bytes = ${op.bytes} WHERE id = '${op.id}'  (perceptual — the row now serves the keeper's bytes)`,
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
      } else if (op.op === 'fill-perceptual') {
        /* The same guard, over the signature pair the write paths now also write: a row signed
         * between plan and execute keeps ITS signature, never this run's over it. */
        await sql`update nina_message_images set perceptual_hash = ${op.dhash}, perceptual_sig = ${op.sig} where id = ${op.id} and perceptual_hash is null`
      } else if (op.op === 'fill-dimensions') {
        /* The guard is on the columns being FILLED, not on `content_hash`: `fill-hash` has already
         * run in this same op list and filled that column, so a `content_hash is null` guard here
         * would write nothing at all. `bytes` under `coalesce` — a stored size is never clobbered;
         * a size that disagrees with the bytes stays a reported `bytes metadata mismatch`, which is
         * a different finding this op must not quietly erase. */
        await sql`
          update nina_message_images
             set width = ${op.width}, height = ${op.height},
                 bytes = coalesce(bytes, ${op.bytes})
           where id = ${op.id} and width is null and height is null
        `
      } else if (op.op === 'hash-repair') {
        await sql`update nina_message_images set content_hash = ${op.to} where id = ${op.id}`
      } else if (op.op === 'perceptual-repair') {
        /* No `is null` guard, same as `hash-repair`: this is a deliberate overwrite of a value
         * this run measured and found wrong, not a fill racing a concurrent writer. */
        await sql`update nina_message_images set perceptual_hash = ${op.dhash}, perceptual_sig = ${op.sig} where id = ${op.id}`
      } else if (op.op === 'merge-row') {
        await sql`
          update nina_message_images
             set blob_url = ${op.blobUrl}, pathname = ${op.pathname}, source_image_id = ${op.keeperId}
           where id = ${op.id}
        `
        /* The perceptual pass's byte-facts: the repointed row now serves the keeper's object, so
         * its hash/dimensions/size must describe THOSE bytes, not the ones it just stopped
         * naming. Absent on the byte pass's ops — there, hash equality already holds. */
        if (op.contentHash != null) {
          await sql`
            update nina_message_images
               set content_hash = ${op.contentHash}, width = ${op.width},
                   height = ${op.height}, bytes = ${op.bytes}
             where id = ${op.id}
          `
        }
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
    return { ok: true, hash: sha256Hex(bytes), size: bytes.byteLength, bytes }
  } catch (error) {
    return { ok: false, reason: `GET failed: ${error.message}` }
  }
}

/**
 * Move a measurement this run took onto the row object, for the report and for the perceptual
 * pass, and remember it separately so `buildFillDimensionOps` can persist it.
 *
 * NEVER overwrites a stored value. A stored dimension or size that disagrees with the bytes is a
 * DIFFERENT finding (the sweep's `bytes metadata mismatches` line, reported only) and is not this
 * function's business — silently correcting one here would hide it.
 */
function adoptMeasuredDimensions(row, sig, size) {
  if (
    sig != null &&
    typeof sig.width === 'number' &&
    typeof sig.height === 'number' &&
    row.width == null &&
    row.height == null
  ) {
    row.width = sig.width
    row.height = sig.height
    row.measuredWidth = sig.width
    row.measuredHeight = sig.height
  }
  if (typeof size === 'number' && Number.isFinite(size)) {
    row.measuredBytes = size
    if (row.bytes == null) row.bytes = size
  }
}

/**
 * The perceptual pass's only inputs, measured off the same GET that hashed the row: a 64-bit
 * difference hash over a 9x8 grayscale thumbnail and the 16x16 grayscale signature itself — plus
 * the pixel dimensions, which `lib/nina/perceptualSign.ts:51-56` already reads from the same
 * `metadata()` call and which `isPerceptualTwin` hard-requires. The three resize passes are
 * unchanged and independent clones, so the signature values are byte-for-byte what they were
 * before this read was added. Constant memory — the buffer is dropped the moment all three are
 * computed.
 */
async function signBytes(bytes) {
  const img = sharp(bytes, { failOn: 'none' })
  const [meta, sig16, dh] = await Promise.all([
    img.metadata(),
    img.clone().resize(16, 16, { fit: 'fill' }).grayscale().raw().toBuffer(),
    img.clone().resize(9, 8, { fit: 'fill' }).grayscale().raw().toBuffer(),
  ])
  let dhash = 0n
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      if (dh[y * 9 + x] > dh[y * 9 + x + 1]) dhash |= 1n << BigInt(y * 8 + x)
    }
  }
  return {
    dhash,
    sig16: new Uint8Array(sig16),
    width: typeof meta.width === 'number' ? meta.width : null,
    height: typeof meta.height === 'number' ? meta.height : null,
  }
}

/* Run only as the process entry point, so `tests/nina.dedupeMedia.test.ts` can import the pure
 * module without executing any of this. `scripts/nina-profpic.mjs:580` is the precedent. */
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main()
}
