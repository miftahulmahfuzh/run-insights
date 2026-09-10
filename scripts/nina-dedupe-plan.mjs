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
