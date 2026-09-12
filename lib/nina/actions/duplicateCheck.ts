'use server'

import { requireUserId } from '@/lib/auth/requireUserId'

import type { NinaExistingPhoto } from '../attach'
import { normalizeClaimedContentHash } from '../dedupe'
import { findNinaImageByContentHash } from '../queries'

/**
 * **media-dedupe P2: the composer's pre-check.** "Do my bytes already exist in my collection?"
 * asked BEFORE a picked photograph is PUT, so a duplicate pick costs no token mint, no upload and
 * no describe at all — the one part of the dedup that saves the round trip and not just the
 * storage (R2). Its own module since the 2026-09-12 split of `lib/nina/actions.ts`: it is the
 * upload-time half of the dedupe concern, while the insert-time half (the race-close and its
 * perceptual pass) stays inside `./send` where the writes are.
 *
 * ── WHY THE ANSWER IS `{ kind: 'image', id, url }` AND NOT THE ROW ─────────────────────────────
 * It is exactly `NinaExistingPhoto` (`lib/nina/attach.ts`), the type the composer already holds
 * for `?photo=`-armed photographs: an id the SEND can carry through `dedupedImageIds` into
 * `resolveAttachment`'s ownership check, plus the URL the tile's optimistic bubble renders. A URL
 * is never the payload — an id resolved against `user_id` is a fact, and this action does the
 * resolving.
 *
 * ── TWO KEYS, ONE QUESTION ─────────────────────────────────────────────────────────────────────
 * Since 2026-09-10's measured defect the input carries a SECOND hash: the picked file's own
 * (`sourceHash`), next to the encode's. A downloaded-then-reuploaded photograph is re-encoded by
 * `compressForNina` into bytes nobody has ever stored, so its encode hash can never match — but
 * the picked file's bytes ARE a stored row's object byte-for-byte, and `content_hash` holds
 * "sha-256 over a row's stored bytes" either way. Both claims are normalized independently and
 * the misses drop out; asking with only one valid key is the same question it always was.
 *
 * ── FAILURE IS `null`, AND `null` MEANS "UPLOAD" ───────────────────────────────────────────────
 * An invalid hash (the 64-hex check is the whole of the trust this claim gets — invariant 9), a
 * miss, and a failed lookup are all the same answer: nothing matched, so the composer uploads.
 * The race-close at STEP 1b re-asks the question at insert time regardless, so a false "no" here
 * is corrected there — pre-check and race-close are two windows on one decision, not two
 * decisions that must agree.
 */
export async function findNinaDuplicateChatImage(input: {
  contentHash: string | null
  sourceHash: string | null
}): Promise<NinaExistingPhoto | null> {
  const userId = await requireUserId()

  /* Both keys, normalized separately (invariant 9 is per-claim, never per-request); a key that
   * failed its own check contributes nothing rather than poisoning the other one. */
  const keys = [input?.contentHash, input?.sourceHash]
    .map((value) => normalizeClaimedContentHash(value))
    .filter((value): value is string => value !== null)
  if (keys.length === 0) return null

  try {
    const keeper = await findNinaImageByContentHash(userId, keys)
    if (keeper === null) return null
    return { kind: 'image', id: keeper.id, url: keeper.blobUrl }
  } catch (cause) {
    console.warn('[nina] duplicate pre-check failed; the pick will upload', {
      error: String(cause),
    })
    return null
  }
}
