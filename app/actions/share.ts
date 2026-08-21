'use server'

import { revalidatePath } from 'next/cache'

import { requireUserId } from '@/lib/auth/requireUserId'
import {
  createShare,
  getActiveShareForRun,
  getRunDetail,
  revokeShare,
  setPhotoExcludedFromShare,
} from '@/lib/db/queries'
import { isValidId } from '@/lib/id'
import { shareUrl } from '@/lib/share/origin'
import { rotateRunPhotoBlobs } from '@/lib/share/rotateBlobs'

/**
 * The three mutations F11 owns. Every one of them opens with `requireUserId()` — INVARIANT A, line
 * one, above any use of an argument — and every one of them reaches the database only through a
 * `userId`-scoped query. `proxy.ts` does not protect these: a Server Action POSTs to the page it is
 * used on, so the matcher governs it incidentally at best (see `proxy.ts`'s own note). This file is
 * the boundary.
 *
 * They return result objects rather than throwing, because all three are called from Client
 * Components where a thrown error is a red screen and the honest outcome is a sentence next to the
 * button.
 */

export type ShareResult =
  { ok: true; token: string; url: string } | { ok: false; error: 'unknown-run' | 'failed' }

/**
 * Mint, or return the live token.
 *
 * **Pressing Share twice must return the same token.** The link the runner already sent has to keep
 * working, so a second tap is a read, not a write. `createShare` (queries.ts) implements the
 * get-or-create; the partial unique index (`shares_run_id_active_unq`, `WHERE revoked_at IS NULL`)
 * is the backstop that makes a genuine race impossible to resolve wrongly.
 *
 * Re-sharing after a revoke is not a special case here and needs no code: because the unique index
 * covers only live rows, the revoked row does not block a new one, and `createShare` simply inserts
 * a fresh token. `shares` becomes a per-run share history for free.
 */
export async function createShareLinkAction(runId: string): Promise<ShareResult> {
  const userId = await requireUserId()
  if (!isValidId(runId)) return { ok: false, error: 'unknown-run' }

  try {
    const { token } = await createShare(userId, runId)
    revalidatePath(`/r/${runId}`)
    return { ok: true, token, url: shareUrl(token) }
  } catch {
    // A run that is not yours, a run that does not exist, and a database hiccup are the same
    // outcome to this caller: no link. Distinguishing them would be an ownership oracle.
    return { ok: false, error: 'failed' }
  }
}

export type RevokeResult =
  { ok: true; photosRotated: number; photosStillLive: number } | { ok: false; error: 'failed' }

/**
 * Kill the link, then rotate the photos — **in that order, and the order is the whole design.**
 *
 * The promise the button makes is "the page stops working". That is one `UPDATE`, so it happens
 * first and it happens on its own: if the blob store is unreachable, the runner still gets the thing
 * they asked for rather than an error and a live page. R-15's rotation is the second half — a sweep
 * that makes the old *image* URLs 404 too — and it is best-effort by construction, which is why the
 * result carries a count instead of a boolean and why `REVOKE_PARTIAL` exists as copy.
 *
 * Rotating first would invert that: a store failure would abort before the revoke and leave the
 * page live, having promised nothing and delivered nothing.
 *
 * Idempotent. Revoking a run with no live share is not an error — it is a runner who tapped twice,
 * and the state they wanted is already the state they have.
 */
export async function revokeShareLinkAction(runId: string): Promise<RevokeResult> {
  const userId = await requireUserId()
  if (!isValidId(runId)) return { ok: false, error: 'failed' }

  try {
    const active = await getActiveShareForRun(userId, runId)
    if (active) await revokeShare(userId, active.token)

    // Read the photos AFTER the revoke: the page is already dead, so nothing here is racing a
    // viewer. `getRunDetail` is userId-scoped, which is also the ownership check for the rotation.
    const run = await getRunDetail(userId, runId)
    const photos = (run?.photos ?? []).map((p) => ({
      id: p.id,
      blobUrl: p.blobUrl,
      pathname: p.pathname,
    }))
    const { rotated, failed } = await rotateRunPhotoBlobs(userId, photos)

    revalidatePath(`/r/${runId}`)
    return { ok: true, photosRotated: rotated, photosStillLive: failed.length }
  } catch {
    return { ok: false, error: 'failed' }
  }
}

/**
 * Per-photo inclusion (§3.3.2).
 *
 * The flag lives on the photo, not on a share event, so it survives revoke-and-re-share with no
 * extra bookkeeping: *"I don't want the summary screenshot going out"* is a property of that
 * screenshot, not of one link. This also means it can be set before a link has ever existed, which
 * is why the control sits on `/r/[id]` rather than inside the share panel.
 *
 * `setPhotoExcludedFromShare` joins `run_photos → runs` on `user_id`, so ownership is proven inside
 * the same statement that writes. There is no window between the check and the update.
 */
export async function setPhotoSharingAction(
  photoId: string,
  included: boolean,
  runId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const userId = await requireUserId()
  if (!isValidId(photoId) || !isValidId(runId)) return { ok: false, error: 'Unknown photo' }

  try {
    await setPhotoExcludedFromShare(userId, photoId, !included)
  } catch {
    return { ok: false, error: 'Could not save that just now' }
  }

  revalidatePath(`/r/${runId}`)
  return { ok: true }
}
