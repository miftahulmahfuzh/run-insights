import 'server-only'

import { findRunPhotoByContentHash } from '@/lib/db/queries'
import { findNinaAvatarByContentHash, findNinaImageByContentHash } from '@/lib/nina/queries'
import { isValidContentHash } from '@/lib/photos/contentHash'
import type { PhotoPointer, ResolvedPhotoPointer } from '@/lib/photos/pointer'

/**
 * **"Do these bytes already exist anywhere in this user's image collection?"**
 *
 * The one question R1 needs and the one nothing in this codebase could ask before: there is no
 * single image table, there are three (`nina_message_images`, `nina_avatars`, `run_photos`), each
 * with its own dedup mechanism or none, and not one of them ever looked at another.
 *
 * ── IT IS READ-ONLY, AND THAT IS THE WHOLE DESIGN ────────────────────────────────────────────
 * `lib/nina/dedupe.ts:36-43` states the invariant this file is built around: the three write-time
 * DECISION modules (`dedupe.ts`, `imageDedupe.ts`, `lib/admin/chatPhotos.ts`) must not be merged
 * and a fourth must not be grown. So this is not a fourth. It decides nothing, writes nothing,
 * releases no blob and never changes which row is a keeper and which is a reference. It runs
 * AFTER whichever of those three has already decided, reads what they wrote, and answers a
 * question none of them was asked: "is there a duplicate worth telling the runner about?"
 *
 * ── EXACT BYTES ONLY. NO PERCEPTUAL MATCHING. ────────────────────────────────────────────────
 * `lib/nina/perceptual.ts:9-10,39-42,58-62` carries constants measured on one production pair and
 * paired with `scripts/nina-dedupe-plan.mjs` ("if one number moves, move BOTH"), scoped to the
 * chat-photo download-then-reupload case. Widening that gate to shots and album faces is a
 * distinct tuning effort with its own measurements, and "already exists" does not ask for it. A
 * re-encode is two objects that are honestly different at the only level storage can see — the
 * same sentence `nina_message_images.content_hash`'s header opens with.
 *
 * ── PER-USER, NEVER GLOBAL ───────────────────────────────────────────────────────────────────
 * Every arm is `user_id`-scoped (`run_photos` through `runPhotoOwnedBy`'s correlated EXISTS,
 * since that table has no owner column). Matching across users would be a new, unstated,
 * security-relevant capability, and the blob-release path is user-scoped too — a cross-user
 * pointer would let one user's delete free bytes another still renders.
 *
 * ── `server-only`, UNLIKE THE QUERY LAYER IT CALLS ───────────────────────────────────────────
 * `lib/db/queries.ts` and `lib/nina/queries.ts` both decline `server-only` deliberately, so that
 * `scripts/*.mjs` can import them. This module has no script consumer and sits in `lib/photos/`,
 * a directory whose other modules (`contentHash.ts`, `compressForNina.ts`, `pointer.ts`) are
 * imported BY THE BROWSER. `server-only` is what makes an accidental client import a build error
 * instead of a database client in a bundle. `vitest.config.ts` aliases it to a stub, so the test
 * below runs as shipped.
 */

/** Which of the three tables is consulted first. See the header of `findGlobalDuplicatePhoto`. */
const LOOKUP_ORDER = ['image', 'avatar', 'shot'] as const

export interface GlobalDuplicateOptions {
  /**
   * Rows to ignore — **normally every row the caller has just written.** Every caller runs this
   * AFTER its own insert, so without this a genuinely-new upload finds itself and notifies.
   *
   * ── ONE POINTER OR A LIST, AND THE LIST IS THE LOAD-BEARING FORM ──────────────────────────
   * Three of the five upload routes write MORE THAN ONE row per gesture: `/api/extract` writes up
   * to three `run_photos` rows, `sendNinaMessage` writes N `nina_message_images` rows, and one
   * folder drop registers up to fifty `nina_avatars` rows. Two files in one gesture can carry
   * identical bytes, so excluding only the asking row makes each of them find the other and
   * announce a photograph this very gesture created. "Already" means before now — which is the
   * whole gesture, not one row of it. The two admin chat routes write exactly one row each and
   * pass a single pointer, which is why both spellings are accepted rather than one imposed.
   *
   * For `'shot'` and `'avatar'` the exclusion is pushed into SQL, so a second, older row with the
   * same bytes is still found. For `'image'` it is applied after the read, and the case that
   * would lose — two ORIGINALS in `nina_message_images` carrying the same hash — is unreachable
   * by construction: the chat write path turns the later one into a REFERENCE
   * (`lib/nina/dedupe.ts:212-231`), and `findNinaImageByContentHash` filters references out with
   * `isOriginalPhoto()`. Stated rather than defended in code, because defending it would mean
   * changing that query's signature, which this phase may not do.
   */
  exclude?: PhotoPointer | readonly PhotoPointer[] | null
}

/**
 * `null` for "no duplicate", for "not yours" and for "no usable hash" alike — every arm's own
 * rule, and here they collapse into the one thing the caller does next: nothing.
 *
 * ── THE HASHES ARE VALIDATED HERE, ONCE ──────────────────────────────────────────────────────
 * `isValidContentHash` is the gate on a value that may have come from a browser
 * (`lib/photos/contentHash.ts`'s header). Invalid claims are DROPPED, not rejected: an upload
 * whose hash claim is malformed gets no notification, which is the honest reading of "dedup is
 * inactive for this row" — never an error on a write that already succeeded. If nothing survives
 * the gate the function returns `null` without a single round trip.
 *
 * ── PRIORITY, NOT CHRONOLOGY ─────────────────────────────────────────────────────────────────
 * `image` -> `avatar` -> `shot`, first hit wins, because (a) `nina_message_images` is the only
 * table whose `content_hash` is populated for historical rows, so it is the only one that can
 * match anything written before this feature; (b) it reuses `findNinaImageByContentHash`
 * VERBATIM, including its `isOriginalPhoto()` filter, which is the one arm that knows the
 * difference between an original and a reference; and (c) electing "the oldest row across three
 * tables" would need a fourth chat finder with the opposite sort order — an edit to a shared,
 * tested query for a cosmetic gain. Sequential with an early return rather than `Promise.all`:
 * the contract is "the first match", the hit case costs one round trip, and this never runs in a
 * render path.
 */
export async function findGlobalDuplicatePhoto(
  userId: string,
  contentHash: string | readonly string[],
  options: GlobalDuplicateOptions = {},
): Promise<ResolvedPhotoPointer | null> {
  const claimed = typeof contentHash === 'string' ? [contentHash] : [...contentHash]
  const hashes = claimed.filter((hash) => isValidContentHash(hash))
  if (hashes.length === 0) return null

  /* One pointer and a list of pointers are the same fact with different punctuation; normalised
   * once, here, so the three arms below each see a plain array of ids for their own kind. */
  const excluded =
    options.exclude == null
      ? []
      : Array.isArray(options.exclude)
        ? [...(options.exclude as readonly PhotoPointer[])]
        : [options.exclude as PhotoPointer]

  for (const kind of LOOKUP_ORDER) {
    const excludeIds = excluded.filter((pointer) => pointer.kind === kind).map((p) => p.id)

    if (kind === 'image') {
      const row = await findNinaImageByContentHash(userId, hashes)
      /* Post-filtered rather than pushed into SQL — see `GlobalDuplicateOptions.exclude` for why
       * the case this cannot see is unreachable in the chat write path. */
      if (row !== null && !excludeIds.includes(row.id)) {
        return { kind: 'image', id: row.id, url: row.blobUrl }
      }
      continue
    }

    if (kind === 'avatar') {
      const row = await findNinaAvatarByContentHash(userId, hashes, excludeIds)
      if (row !== null) return { kind: 'avatar', id: row.id, url: row.blobUrl }
      continue
    }

    const row = await findRunPhotoByContentHash(userId, hashes, excludeIds)
    if (row !== null) return { kind: 'shot', id: row.id, url: row.blobUrl }
  }

  return null
}
