/**
 * The pure half of `scripts/nina-dedupe-media.mjs`: how duplicates are grouped, which row keeps
 * the bytes, what gets repointed, and when a Blob object may be released. No database, no Blob
 * client, no env — every function here takes its inputs as arguments, which is what lets
 * `tests/nina.dedupeMedia.test.ts` hold the merge rules against the measured production groups
 * without touching production.
 *
 * The ops script (`.mjs`, same directory) builds rows from a raw SQL read, calls `buildMergePlan`,
 * and executes the returned ops in order. It owns every side effect; this file owns every
 * judgment.
 *
 * ── THE SEMANTICS OF `content_hash` (plan invariant 4) ────────────────────────────────────────
 * sha256 hex over the bytes the ROW names — per-row stored bytes, not the file the user picked.
 * A reference row names bytes too (it copied `blob_url`/`pathname` from its source), so hashing a
 * reference is not a category error: it is the same statement about a different row. Two rows
 * with equal hashes therefore always name equal bytes, which is the ONLY fact this script acts
 * on. It never infers "same photograph" from metadata, filename, or provenance.
 *
 * ── WHY HASHING REFERENCES IS REQUIRED, NOT JUST HONEST ───────────────────────────────────────
 * The measured production group `70a49180…` is an original (`W-hhpnGxV0SI`) plus a REFERENCE
 * (`1dMy2Zs5V1MJ`, `source_image_id` → the original) whose `blob_url` names a SECOND object with
 * identical bytes. A sweep that only hashed originals could not see that the reference's private
 * copy is redundant; it could only repoint the reference on faith that "a reference's URL holds
 * the source's bytes" — which is precisely the claim this row falsifies. The hash is what turns
 * "repoint it" from a guess into a measurement: group membership IS the proof that the
 * reference's divergent URL holds the keeper's bytes. So every row is hashed, and a row whose
 * bytes cannot be fetched is reported and excluded from every decision.
 */
import { createHash } from 'node:crypto'

/** `--apply` is the only flag. Anything else is a typo the operator wants to hear about. */
export function parseArgs(argv) {
  const unknown = argv.filter((a) => a !== '--apply')
  if (unknown.length > 0) {
    throw new Error(`unknown flag ${unknown[0]} — the only flag this script takes is --apply`)
  }
  return { apply: argv.includes('--apply') }
}

const SHA256_HEX_RE = /^[0-9a-f]{64}$/

/** Plan invariant 9's shape rule, re-stated for the script's own writes. */
export function isSha256Hex(value) {
  return typeof value === 'string' && SHA256_HEX_RE.test(value)
}

/**
 * `node:crypto`, not `crypto.subtle`: this script hashes whole buffers (the largest measured
 * object is 110 KB; nothing streams), `createHash` is synchronous so an update→digest pair cannot
 * interleave, and `lib/llm/factsHash.ts:48` is the repo's standing precedent for a content hash.
 * P1's `lib/photos/contentHash.ts` uses `crypto.subtle` because the BROWSER needs it to; the two
 * implementations agree by construction (same algorithm, same hex encoding), and
 * `tests/nina.dedupeMedia.test.ts` asserts the agreement on a known-answer vector rather than
 * trusting it.
 */
export function sha256Hex(bytes) {
  return createHash('sha256').update(bytes).digest('hex')
}

/**
 * A Blob object lives at `https://<store>.public.blob.vercel-storage.com/<pathname>`. The script
 * GETs these URLs plainly (they are public) and deletes them with `del(url, { token })`; this
 * check is what keeps a `del` pointed at anything that is not the store it was configured for.
 */
const STORE_URL_RE = /^https:\/\/[^/]+\.public\.blob\.vercel-storage\.com\/./

export function isStoreUrl(url) {
  return typeof url === 'string' && STORE_URL_RE.test(url)
}

/** F37's predicate, verbatim: `isOriginalPhoto()` in `lib/nina/queries.ts:1812`. */
export function isOriginalRow(row) {
  return row.sourceAvatarId == null && row.sourceImageId == null
}

/** `created_at` arrives as a Date from neon (timestamptz); tests pass ISO strings. Both allowed. */
export function createdMs(row) {
  const t =
    row.createdAt instanceof Date ? row.createdAt.getTime() : new Date(row.createdAt).getTime()
  if (!Number.isFinite(t)) throw new Error(`row ${row.id} carries an unreadable created_at`)
  return t
}

/**
 * Keeper election, as a total order so the winner never depends on input order.
 *   1. `message_id` NOT NULL wins — the photograph is anchored in the conversation, so hiding a
 *      loser that is NOT anchored (the measured `ywNnXvpnnKSi` case: `message_id` went NULL via
 *      SET NULL) can never blank a bubble.
 *   2. `description` NOT NULL wins — `glm-4.6v`'s prose already lives on it (an empty string is
 *      "not described", which is what NULL means).
 *   3. Oldest `created_at` wins — the first arrival is the canonical copy.
 *   4. `id` ascending — the same final tiebreak `getNinaMessageImagesForMessages` documents for
 *      rows written in one statement (`lib/nina/queries.ts:1757`), and the only step that makes
 *      the order total.
 * Returns < 0 when `a` is the better keeper. Pure and unit-testable by contract.
 *
 * RECONCILED — this is the SWEEP's election only. The write-time paths elect their attach target
 * with `findNinaImageByContentHash`'s rule instead (newest original — phase 1's finder, chosen
 * because the newest row is the least likely to be deleted between the read and the write). The
 * two answer different questions at different times (which row should a NEW write point at vs
 * which row should OWN bytes several rows already point at) and are deliberately not unified —
 * do not port this order into the finder or the finder's order into a future sweep.
 */
export function compareKeeperCandidates(a, b) {
  const aMessaged = a.messageId != null ? 1 : 0
  const bMessaged = b.messageId != null ? 1 : 0
  if (aMessaged !== bMessaged) return bMessaged - aMessaged

  const aDescribed = a.description != null && a.description !== '' ? 1 : 0
  const bDescribed = b.description != null && b.description !== '' ? 1 : 0
  if (aDescribed !== bDescribed) return bDescribed - aDescribed

  const byAge = createdMs(a) - createdMs(b)
  if (byAge !== 0) return byAge

  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
}

/** The single original of a group. Throws on an empty list — the caller partitions first. */
export function electKeeper(originals) {
  if (originals.length === 0) throw new Error('no original to elect a keeper from')
  let keeper = originals[0]
  for (const candidate of originals.slice(1)) {
    if (compareKeeperCandidates(candidate, keeper) < 0) keeper = candidate
  }
  return keeper
}

/** Plan invariant 5, as a function: the dedup key is (user_id, content_hash), never hash alone. */
export function groupKeyOf(row) {
  return `${row.userId}|${row.contentHash}`
}

/**
 * Provenance partition of one group. Three classes, with one rule each:
 *   - originals   → keeper candidates (and merge losers when they lose);
 *   - chatRefs    → `source_image_id` set — already references to a chat image; they may be
 *                   REPOINTED to the keeper when their `blob_url` diverges (the `1dMy2Zs5V1MJ`
 *                   measured case). Repointing keeps their provenance class intact.
 *   - avatarRefs  → `source_avatar_id` set — references into `nina_avatars`. NEVER repointed: a
 *                   repoint to a chat-image keeper would falsify provenance ("I am this album
 *                   face") for a storage saving no measured group needs. Reported only.
 */
export function partitionGroup(rows) {
  const originals = []
  const avatarRefs = []
  const chatRefs = []
  for (const row of rows) {
    if (row.sourceAvatarId != null) avatarRefs.push(row)
    else if (row.sourceImageId != null) chatRefs.push(row)
    else originals.push(row)
  }
  return { originals, avatarRefs, chatRefs }
}

/**
 * rows (+ hashes) → the ordered operation list. THE product of this module.
 *
 * Ops, in the exact order they are returned (and executed):
 *   { op: 'hash-repair', id, from, to }            — stored hash contradicted by a fresh GET:
 *                                                    write the measured value (plan invariant 4),
 *                                                    and the group is SKIPPED this run so the
 *                                                    next run regroups on honest keys.
 *   { op: 'merge-row', id, keeperId, blobUrl, pathname }
 *                                                  — ROW FIRST: repoint the loser to the
 *                                                    keeper's object and mark it a reference.
 *   { op: 'release-blob', userId, pathname, blobUrl, bytes }
 *                                                  — BLOB SECOND: release the loser's old object,
 *                                                    gated at execution time by `releaseDecision`
 *                                                    against live counts this module cannot know.
 * All of a group's `merge-row`s precede that group's `release-blob`s — two losers sharing one old
 * URL must BOTH have stopped naming it before the refCount is asked, or the first loser's gate
 * would see the second and keep shared bytes forever.
 *
 * A group is a finding when it needs a mutation: ≥2 originals, or a chatRef whose URL differs
 * from the keeper's. A group of one original + references that already share the keeper's URL is
 * reported as `tidy` and produces no ops — the three measured same-URL groups must land here, or
 * the sweep is not idempotent.
 *
 * THE VERIFY GATE: a multi-row group is only actionable when EVERY member is hash-verified this
 * run (`verifiedHash === contentHash`, no `hashFailed`). One unverified member skips the whole
 * group — a group is a claim about bytes, and one unproven byte breaks the claim.
 */
export function buildMergePlan(rows) {
  const byKey = new Map()
  for (const row of rows) {
    if (!isSha256Hex(row.contentHash)) {
      throw new Error(`row ${row.id} reached the planner without a 64-hex content_hash`)
    }
    const key = groupKeyOf(row)
    const members = byKey.get(key)
    if (members) members.push(row)
    else byKey.set(key, [row])
  }

  const multi = [...byKey.values()].filter((m) => m.length > 1)
  multi.sort((a, b) => groupKeyOf(a[0]).localeCompare(groupKeyOf(b[0])))

  const repairs = []
  const groups = []
  const mutations = []

  for (const members of multi) {
    const head = members[0]
    /* The verify gate, stated as its two failure classes: a stored hash a fresh GET contradicted
     * (drift — repair it, and do not act on the group this run), and a member nobody measured
     * (failed GET, or never re-verified). Either one makes the group's shared claim unproven. */
    const stale = members.filter(
      (m) => !m.hashFailed && m.verifiedHash != null && m.verifiedHash !== m.contentHash,
    )
    const unverified = members.filter((m) => m.hashFailed || m.verifiedHash == null)

    if (stale.length > 0 || unverified.length > 0) {
      for (const row of stale) {
        repairs.push({ op: 'hash-repair', id: row.id, from: row.contentHash, to: row.verifiedHash })
      }
      const reason =
        stale.length > 0
          ? `hash drift on ${stale.map((m) => m.id).join(', ')} — repaired, regrouped next run`
          : `unverified bytes on ${unverified.map((m) => m.id).join(', ')}`
      groups.push({
        userId: head.userId,
        contentHash: head.contentHash,
        action: 'skipped',
        reason,
        ids: members.map((m) => m.id),
      })
      continue
    }

    const { originals, avatarRefs, chatRefs } = partitionGroup(members)
    if (originals.length === 0) {
      groups.push({
        userId: head.userId,
        contentHash: head.contentHash,
        action: 'skipped',
        reason: 'no original in the group — a reference is never elected keeper',
        ids: members.map((m) => m.id),
      })
      continue
    }

    const keeper = electKeeper(originals)
    const losers = [
      ...originals.filter((row) => row.id !== keeper.id),
      ...chatRefs.filter((row) => row.blobUrl !== keeper.blobUrl),
    ]
    const released = []
    for (const loser of losers) {
      mutations.push({
        op: 'merge-row',
        id: loser.id,
        keeperId: keeper.id,
        blobUrl: keeper.blobUrl,
        pathname: keeper.pathname,
      })
      if (!released.some((r) => r.pathname === loser.pathname && r.blobUrl === loser.blobUrl)) {
        released.push({ pathname: loser.pathname, blobUrl: loser.blobUrl, bytes: loser.bytes })
      }
    }
    for (const r of released) {
      mutations.push({ op: 'release-blob', userId: keeper.userId, ...r })
    }
    groups.push({
      userId: head.userId,
      contentHash: head.contentHash,
      action: losers.length > 0 ? 'merge' : 'tidy',
      keeperId: keeper.id,
      loserIds: losers.map((l) => l.id),
      releaseCount: released.length,
      avatarRefIds: avatarRefs.map((a) => a.id),
      ids: members.map((m) => m.id),
    })
  }

  return { ops: [...repairs, ...mutations], groups }
}

/**
 * PASS 1's write, as ops. The ops script measures every row whose `content_hash` column is NULL
 * and hands the loaded rows here; each measured row becomes one `fill-hash` op, so the dry run
 * prints the fill and `--apply` executes it like any other op.
 *
 * WHY THIS IS OPS AT ALL: the first landing of this sweep computed pass 1's fills for the report
 * and never wrote them — 27 production rows stayed NULL under a header that claimed "UPDATE
 * content_hash", the first post-deploy upload of the kartu kedatangan photograph matched nothing,
 * and the post-apply idempotence re-run read green because the op list never carried the fills.
 * A fill is a WRITE, and only ops get written.
 *
 * A row qualifies when the column was NULL entering this run (`hadNullHash`), the run measured
 * its bytes (`hashFailed` false, `verifiedHash` set), and the measurement is a well-formed hash —
 * the same paranoia `buildMergePlan` applies to stored hashes, applied to measured ones. Rows
 * that already carried a hash qualify for nothing: the second run writes nothing, which is the
 * idempotence the ops script's header promises.
 *
 * ORDER: the script executes `[...buildFillOps(rows), ...plan.ops]` — fills land before any
 * repair/repoint/release, so by the time a merge moves a row, every row already carries the hash
 * this run measured for it.
 */
export function buildFillOps(rows) {
  return rows
    .map((row) => {
      if (row.hadNullHash !== true) return null
      if (row.hashFailed || row.verifiedHash == null) return null
      if (!isSha256Hex(row.contentHash)) {
        throw new Error(`row ${row.id}'s measured hash is not 64-hex — refusing to write it`)
      }
      return { op: 'fill-hash', id: row.id, hash: row.contentHash }
    })
    .filter(Boolean)
}

/* ── THE PERCEPTUAL SIGNATURE COLUMNS (media-dedupe follow-up, 2026-09-10) ──────────────────────
 * `nina_message_images.perceptual_hash` (64-bit dHash, 16 lowercase hex) and `.perceptual_sig`
 * (the 16x16 grayscale thumbnail, base64) are now WRITTEN-TIME columns: the send-time twin check
 * (`lib/nina/actions.ts` STEP 1b) and the generated store sign the rows they create, and the twin
 * gates they answer live in `lib/nina/perceptual.ts`. The sweep's part is narrower and changed:
 *   · a row that already carries a stored signature is DECODED, not re-signed — no GET, no sharp;
 *   · a row the sweep signs fresh gets a `fill-perceptual` op, so the measurement outlives the
 *     run (the first landing computed signatures and wrote nothing — the exact defect the hash
 *     fills already lived once; a signature that exists only in a console is not a signature);
 *   · the executor writes with an `is null` guard, the same idempotence `fill-hash` has.
 * These parsers mirror `lib/nina/perceptual.ts`'s `parseDhashHex` / `sig16FromBase64` — .mjs
 * cannot import it, so the two stand next to each other and MUST agree: same 16-hex form, same
 * 256-byte expectation, null and never a throw for anything else.
 */

const DHASH_HEX_RE = /^[0-9a-f]{16}$/

/** The stored hex form of a 64-bit difference hash, zero-padded to 16. */
export function dhashHexOf(dhash) {
  return dhash.toString(16).padStart(16, '0')
}

/** `lib/nina/perceptual.ts`'s `parseDhashHex`, for the sweep's own reads. Null, never a throw. */
export function parseDhashHex(raw) {
  if (typeof raw !== 'string' || !DHASH_HEX_RE.test(raw)) return null
  return BigInt(`0x${raw}`)
}

/** `lib/nina/perceptual.ts`'s `sig16FromBase64`: exactly 256 bytes, or null. */
export function sig16FromBase64(raw) {
  if (typeof raw !== 'string' || raw.length === 0) return null
  const bytes = Buffer.from(raw, 'base64')
  return bytes.length === 256 ? new Uint8Array(bytes) : null
}

/**
 * A row's stored signature, decoded for planning. `null` for absent or malformed values — an
 * unsigned (or unreadably signed) row simply does not participate in the perceptual pass.
 */
export function decodeStoredSignature(row) {
  const dhash = parseDhashHex(row.perceptualHash)
  const sig16 = sig16FromBase64(row.perceptualSig)
  if (dhash == null || sig16 == null) return null
  return { dhash, sig16 }
}

/**
 * One op per row the sweep signed THIS run whose stored column was NULL at load — the
 * measurement, persisted. Guarded by the executor's `is null`, so a row a concurrent writer
 * signed between plan and execute keeps THEIR measurement, never ours over it.
 */
export function buildFillPerceptualOps(rows) {
  return rows
    .map((row) => {
      if (row.perceptualSource !== 'measured' || row.sig == null) return null
      if (!DHASH_HEX_RE.test(dhashHexOf(row.sig.dhash))) {
        throw new Error(`row ${row.id}'s measured dHash is not 16-hex — refusing to write it`)
      }
      return {
        op: 'fill-perceptual',
        id: row.id,
        dhash: dhashHexOf(row.sig.dhash),
        sig: Buffer.from(row.sig.sig16).toString('base64'),
      }
    })
    .filter(Boolean)
}

/**
 * The release gate, as a pure decision over live counts the ops script measures AFTER the group's
 * rows have been repointed. Counts are numbers; `null` means "the query could not answer" —
 * which must never mean "no references". Every non-zero count keeps the object; the reason is
 * reported so the operator knows which reference site to look at.
 *
 *   imageRefs — rows in `nina_message_images(user_id)` naming the pathname or the URL
 *   avatarRefs — rows in `nina_avatars(user_id)` naming the pathname, thumb pathname, URL or
 *                thumb URL (the rail: an avatar match alone refuses the delete)
 *   jsonbRefs — `nina_turns.args` / `nina_memory_slots.value` mention either name (the reaper's
 *               defensive sweep, `scripts/blob-reap.mjs:204-231`, applied per-release)
 */
export function releaseDecision(counts) {
  const n = (v) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null)
  const imageRefs = n(counts.imageRefs)
  const avatarRefs = n(counts.avatarRefs)
  const jsonbRefs = n(counts.jsonbRefs)
  if (imageRefs == null || avatarRefs == null || jsonbRefs == null) return 'kept-unknown'
  if (avatarRefs > 0) return 'kept-avatar'
  if (jsonbRefs > 0) return 'kept-jsonb'
  if (imageRefs > 0) return 'kept-shared'
  return 'released'
}

/* ── THE PERCEPTUAL PASS (2026-09-10's measured defect) ────────────────────────────────────────
 * Everything above groups by `content_hash` — the byte-exact question the column can answer. The
 * measured production pair `DfeYafysbVAe` + `zGGxRerRI_jS` is the class that question cannot see:
 * a photograph downloaded out of the collection and re-uploaded RE-ENCODES on pick
 * (`compressForNina`, 1024 px / q0.75), so the new row's bytes — and hash — differ from the
 * original's, while the pixels are the same photograph. Measured on that pair: 64-bit difference
 * hash 0/64, 16x16 grayscale mean-abs 0.1/255. A recode is perceptually the SAME image.
 *
 * The pass is deliberately CONSERVATIVE, because a perceptual merge can destroy a near-miss
 * (two shots of the same court are not duplicates). TWO paths, every gate on a path required:
 *
 *   SAME DIMENSIONS — the recode case above (`DfeYafysbVAe` + `zGGxRerRI_jS`, 0/64 and 0.1/255):
 *     1. dHash distance ≤ `PERCEPTUAL_MAX_DHASH` (of 64);
 *     2. 16x16 mean-abs ≤ `PERCEPTUAL_MAX_SIG16` (of 255).
 *
 *   CROSS-RESOLUTION (dimensions differ) — 2026-09-11's measured defect: the SAME photograph
 *   reaching the collection twice through two pipelines that each resize to their own target.
 *   Measured on `QbZH2v65ZeKE` (714x1270, upload) + `VW04cyH9omoX` (576x1024, generated): aspect
 *   ratios 0.5622 vs 0.5625, dHash 2/64, 16x16 mean-abs 1.52/255 — the same picture, and the old
 *   dimension-equality gate rejected the pair before ever reading how close the hashes were.
 *     1. relative aspect-ratio difference ≤ `PERCEPTUAL_ASPECT_TOLERANCE`;
 *     2. BOTH per-dimension size ratios ≥ `PERCEPTUAL_MIN_SIZE_RATIO` (no thumbnail twins);
 *     3. dHash distance ≤ `PERCEPTUAL_CROSS_RES_MAX_DHASH` — its OWN ceiling; the
 *        same-dimensions ceiling stays 1;
 *     4. 16x16 mean-abs ≤ `PERCEPTUAL_MAX_SIG16` — the same ceiling both paths use.
 *
 * Only ORIGINALS participate — a reference is already hidden from the collection reads, so it is
 * not a tile anybody sees twice. Merges never cross users. A row whose bytes were never signed
 * (failed GET, undecodable file) simply does not participate.
 *
 * ── THE LOSER CARRIES THE KEEPER'S BYTE-FACTS ─────────────────────────────────────────────────
 * The byte pass's `merge-row` needs no hash/dimension fields: hash equality is what PUT the pair
 * in one group, so the repointed row's columns stay true as they are. Here they DIFFER, and after
 * the repoint the row renders the keeper's object — so the op carries the keeper's
 * `content_hash`/`width`/`height`/`bytes` and the executor writes them, or the repointed row
 * describes bytes it no longer serves (the exact lie a row's columns must never tell).
 *
 * ── IDEMPOTENCE ────────────────────────────────────────────────────────────────────────────────
 * After a perceptual merge the loser is a reference (excluded here) whose copied hash puts it in
 * the byte pass's `tidy` bucket. A second run proposes nothing — same contract as the byte pass.
 */

/** Measured 2026-09-10 on `DfeYafysbVAe` + `zGGxRerRI_jS`: 0 and 0.1. Pinned one step above. */
export const PERCEPTUAL_MAX_DHASH = 1
export const PERCEPTUAL_MAX_SIG16 = 2

/* ── THE CROSS-RESOLUTION GATES ────────────────────────────────────────────────────────────────
 * Measured 2026-09-11 on `QbZH2v65ZeKE` (714x1270) + `VW04cyH9omoX` (576x1024): aspect ratios
 * 0.5622 vs 0.5625 (0.05% apart), size ratios 0.807 / 0.806, dHash 2/64, mean-abs 1.52/255.
 * Each is pinned above its measurement the way the two gates above were. These five constants
 * are mirrored VERBATIM in `lib/nina/perceptual.ts` — if one number moves, move BOTH.
 */
export const PERCEPTUAL_ASPECT_TOLERANCE = 0.01
export const PERCEPTUAL_MIN_SIZE_RATIO = 0.5
export const PERCEPTUAL_CROSS_RES_MAX_DHASH = 3

/** Hamming distance between two 64-bit difference hashes (bigints). */
export function dhashHamming(a, b) {
  let count = 0
  let diff = a ^ b
  while (diff !== 0n) {
    if (diff & 1n) count++
    diff >>= 1n
  }
  return count
}

/** Mean absolute difference over two equal-length grayscale signatures. Mismatched → Infinity. */
export function sig16MeanAbs(a, b) {
  if (a == null || b == null || a.length !== b.length || a.length === 0)
    return Number.POSITIVE_INFINITY
  let total = 0
  for (let i = 0; i < a.length; i++) total += Math.abs(a[i] - b[i])
  return total / a.length
}

/** The two paths of the header, as one predicate. `false` for anything unsigned or undimensioned. */
export function isPerceptualTwin(a, b) {
  if (a?.width == null || a?.height == null || b?.width == null || b?.height == null) return false
  const sameDims = a.width === b.width && a.height === b.height
  let maxDhash
  if (sameDims) {
    maxDhash = PERCEPTUAL_MAX_DHASH
  } else {
    const ratioA = a.width / a.height
    const ratioB = b.width / b.height
    const aspectDelta = Math.abs(ratioA - ratioB) / Math.max(ratioA, ratioB)
    if (aspectDelta > PERCEPTUAL_ASPECT_TOLERANCE) return false
    const widthRatio = Math.min(a.width, b.width) / Math.max(a.width, b.width)
    const heightRatio = Math.min(a.height, b.height) / Math.max(a.height, b.height)
    if (widthRatio < PERCEPTUAL_MIN_SIZE_RATIO || heightRatio < PERCEPTUAL_MIN_SIZE_RATIO) {
      return false
    }
    maxDhash = PERCEPTUAL_CROSS_RES_MAX_DHASH
  }
  const asig = a.sig
  const bsig = b.sig
  if (asig == null || bsig == null) return false
  if (typeof asig.dhash !== 'bigint' || typeof bsig.dhash !== 'bigint') return false
  if (dhashHamming(asig.dhash, bsig.dhash) > maxDhash) return false
  return sig16MeanAbs(asig.sig16, bsig.sig16) <= PERCEPTUAL_MAX_SIG16
}

/* ── PERCEPTUAL-REPAIR (2026-09-11's measured defect) ────────────────────────────────────────────
 * `decodeStoredSignature`'s own comment calls a stored signature "the signature", never
 * re-measured — correct for cost, wrong for trust: measured on production, `I1v6qeHJBMwv`'s stored
 * `perceptual_hash` (`74749c8c8e9a9c98`) was 26/64 bits from its true re-upload twin
 * `YnIGDDwYH4HT` (`f0c29c64c4060604`), while a fresh GET + sign of the SAME live blob measured
 * `f0c69c64c4060604` — 1 bit from the twin, inside the gate. STEP 1b compared a genuinely matching
 * re-upload against a corrupted stored value and silently let a duplicate through. Nothing before
 * this pass ever asked "is the stored value still true" — `fill-perceptual`'s `is null` guard
 * protects a value from being CLOBBERED, it does not protect against one that was wrong from the
 * moment it was written (an old buggy run, a partial fetch, anything).
 *
 * `perceptualVerifyCandidates` names the population worth a re-GET: a row sharing (user, width,
 * height) with another original has a same-dimensions candidate twin it may have silently missed.
 * NARROWED 2026-09-11: `isPerceptualTwin` now also matches CROSS-RESOLUTION pairs, so this
 * shortlist no longer covers every possible twin — a stale signature on a cross-resolution pair
 * is not surfaced here. That is a known, separate gap (aspect-ratio bucketing would close it),
 * deliberately out of scope for the cross-resolution fix: neither production row involved carries
 * a stale signature. What this pass DOES cover is unchanged. Only a row that
 * shares dimensions with another original, AND whose signature came from storage rather than this
 * run's own measurement (`perceptualSource === 'stored'` — a value `fill-perceptual` just wrote
 * cannot yet be stale), is a candidate. The ops script GETs and re-signs each candidate into
 * `row.verifiedSig`; `buildPerceptualMergePlan` below is what acts on the comparison.
 */
export function perceptualVerifyCandidates(rows) {
  const byDims = new Map()
  for (const row of rows) {
    if (!isOriginalRow(row) || row.width == null || row.height == null) continue
    const key = `${row.userId}|${row.width}x${row.height}`
    const members = byDims.get(key)
    if (members) members.push(row)
    else byDims.set(key, [row])
  }
  const candidates = []
  for (const members of byDims.values()) {
    if (members.length < 2) continue
    for (const row of members) {
      if (row.perceptualSource === 'stored') candidates.push(row)
    }
  }
  return candidates
}

/**
 * rows (+ `sig` where the ops script measured one, + `verifiedSig` where the verify gate
 * re-measured a stored one) → `{ ops, groups }`, the byte pass's shape. `excludeIds` — ids the
 * byte plan is already repointing THIS run; a row must never be repointed twice in one run.
 *
 * A `verifiedSig` that disagrees with the decoded `sig` is a `perceptual-repair` op — the stored
 * column was wrong, so the corrected value (never the stale one) is what clusters this run. A
 * `verifiedSig` that agrees confirms the stored value and writes nothing. Clusters are per-user
 * components over `isPerceptualTwin` edges; the keeper is `electKeeper`'s standing order; ops are
 * `merge-row`s (with the keeper's byte-facts) before `release-blob`s, releases deduplicated by
 * pathname+URL — all as `buildMergePlan` does it.
 */
export function buildPerceptualMergePlan(rows, excludeIds) {
  const excluded = excludeIds ?? new Set()

  const repairs = []
  for (const row of rows) {
    if (row.verifiedSig == null) continue
    const confirmed =
      row.sig != null &&
      row.sig.dhash === row.verifiedSig.dhash &&
      sig16MeanAbs(row.sig.sig16, row.verifiedSig.sig16) === 0
    if (!confirmed) {
      repairs.push({
        op: 'perceptual-repair',
        id: row.id,
        dhash: dhashHexOf(row.verifiedSig.dhash),
        sig: Buffer.from(row.verifiedSig.sig16).toString('base64'),
      })
    }
  }
  const effectiveSig = (row) => row.verifiedSig ?? row.sig
  const eligible = rows
    .filter((r) => !excluded.has(r.id) && isOriginalRow(r) && effectiveSig(r) != null)
    .map((r) => (r.verifiedSig != null ? { ...r, sig: effectiveSig(r) } : r))

  /* Per-user union over twin edges — small n, so growth-by-scan beats a real union-find. */
  const byUser = new Map()
  for (const r of eligible) {
    const members = byUser.get(r.userId)
    if (members) members.push(r)
    else byUser.set(r.userId, [r])
  }

  const mutations = []
  const groups = []
  for (const [userId, members] of byUser) {
    const unclustered = [...members].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    while (unclustered.length > 0) {
      const cluster = [unclustered.shift()]
      let grew = true
      while (grew) {
        grew = false
        for (let i = unclustered.length - 1; i >= 0; i--) {
          if (cluster.some((m) => isPerceptualTwin(m, unclustered[i]))) {
            cluster.push(unclustered.splice(i, 1)[0])
            grew = true
          }
        }
      }
      if (cluster.length < 2) continue

      const keeper = electKeeper(cluster)
      const losers = cluster
        .filter((r) => r.id !== keeper.id)
        .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
      const released = []
      const pairs = []
      for (const loser of losers) {
        mutations.push({
          op: 'merge-row',
          id: loser.id,
          keeperId: keeper.id,
          blobUrl: keeper.blobUrl,
          pathname: keeper.pathname,
          contentHash: keeper.contentHash,
          width: keeper.width,
          height: keeper.height,
          bytes: keeper.bytes,
        })
        pairs.push({
          loserId: loser.id,
          dhash: dhashHamming(loser.sig.dhash, keeper.sig.dhash),
          sig16: Math.round(sig16MeanAbs(loser.sig.sig16, keeper.sig.sig16) * 100) / 100,
        })
        if (!released.some((r) => r.pathname === loser.pathname && r.blobUrl === loser.blobUrl)) {
          released.push({ pathname: loser.pathname, blobUrl: loser.blobUrl, bytes: loser.bytes })
        }
      }
      for (const r of released) {
        mutations.push({ op: 'release-blob', userId, ...r })
      }
      groups.push({
        userId,
        action: 'merge',
        perceptual: true,
        keeperId: keeper.id,
        loserIds: losers.map((l) => l.id),
        releaseCount: released.length,
        ids: cluster.map((m) => m.id),
        pairs,
      })
    }
  }

  groups.sort((a, b) => a.keeperId.localeCompare(b.keeperId))
  return { ops: [...repairs, ...mutations], groups }
}
