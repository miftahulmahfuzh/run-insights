'use server'

import { requireUserId } from '@/lib/auth/requireUserId'
import { authEnv } from '@/lib/env'

import { isNinaChatRequestPathname } from '../images'
import { signNinaImageTicket } from '../imageTicket'
import { NinaVisionTokenFloorError, describeNinaImages } from '../vision'

export type NinaDescribeFailureReason =
  /** The floor tripped. The endpoint dropped the image and may have invented a description. */
  | 'dropped'
  /** Network, timeout, non-JSON, empty completion, or a blob that would not fetch. */
  | 'transport'
  /** The pathname did not belong to this user, or was not a chat pathname at all. */
  | 'rejected'

export interface NinaDescribeImageInput {
  /** From the browser's `upload()` result. */
  blobUrl: string
  /** The STORED pathname, after Vercel's random suffix. */
  pathname: string
  width: number
  height: number
  bytes: number
}

export interface NinaDescribeImageResult {
  ok: boolean
  /**
   * Opaque and signed. The composer holds it and hands it back to `sendNinaMessage`. On failure
   * it is **still issued** — carrying `description: null` — so that an image whose description
   * failed can still be SENT, with Nina told honestly that she could not see it.
   */
  ticket: string | null
  reason: NinaDescribeFailureReason | null
}

/**
 * **The describe pre-pass, in its own invocation. RU-12 and invariant 5.**
 *
 * ── WHY THIS IS NOT PART OF `sendNinaMessage` ────────────────────────────────────────────────
 * Arithmetic, not taste. `NINA_TURN_BUDGET.overall` is 45 s and phase 3 forbids raising it past
 * 50 s because the remaining 10 s of the 60 s segment is page overhead plus up to four inserts. A
 * describe call costs ~8-11 s for one image (F04 measured ~26-33 ms per completion token plus
 * ~2-3 s fixed). 45 + 11 = 56 s, and three images would be ~67 s. It does not fit, and no timeout
 * tuning makes it fit. So it runs here, alone, while the runner is still typing his caption — and
 * `sendNinaMessage` adds zero model calls. Do not move it.
 *
 * ── AND THE COMPOSER CANNOT PARALLELISE THESE, WHICH IS FINE ─────────────────────────────────
 * Corrected against Next 16.3.1's own guide, which the phase-6 plan predated:
 * *"Next.js dispatches Server Actions one at a time per client… do not rely on `Promise.all` to
 * parallelize Server Actions from the client."* So three picked photos compress and PUT in
 * parallel (that half goes through `/api/upload`, a Route Handler, which is not serialised) and
 * then describe **one after another** — ~24-33 s for three, not the ~11 s the plan's latency
 * section claimed.
 *
 * Nothing load-bearing moves. Each call still gets its own invocation and its own 25 s budget, so
 * serialisation cannot cause a timeout; the wait is client-side, behind a visible per-tile
 * spinner, while he types; and the send path still carries zero model calls. The single-photo
 * case — which is what R10 is actually about — is unaffected. Batching all three into one call is
 * the obvious repair and is deliberately NOT taken: it would weaken the per-image token floor at
 * exactly the count the multiplication exists to guard, and it needs a paragraph splitter with no
 * fixture behind it. `describeNinaImagesWithFetch` already accepts an array if that trade ever
 * changes.
 *
 * ── AND WHY A FAILURE STILL RETURNS A TICKET ─────────────────────────────────────────────────
 * R10 is "he sends a photo and she responds to what is in it". When the eyes fail, the honest
 * outcome is not a blocked send — it is her asking what the picture is, which is what a person
 * does when an image will not load. `NINA_DESCRIPTION_UNAVAILABLE` is that instruction, and the
 * `description: null` ticket is how it gets there. What must never happen is Nina describing a
 * photo she did not receive; that is what the token floor is for, one layer down.
 */
export async function describeNinaImage(
  input: NinaDescribeImageInput,
): Promise<NinaDescribeImageResult> {
  const userId = await requireUserId()
  const secret = authEnv().AUTH_SECRET

  const blobUrl = typeof input?.blobUrl === 'string' ? input.blobUrl : ''
  const pathname = typeof input?.pathname === 'string' ? input.pathname : ''

  /*
   * The pathname arrives from the client, so it is re-checked here even though the upload route
   * already checked it: this action's own INSERT-shaped claims (pathname, blobUrl) are about to be
   * signed, and signing something unvalidated is how a signature becomes a laundering service.
   * The stored pathname carries Vercel's random suffix, so the id segment is longer than the
   * requested one — 12 + 1 + 30 = 43, measured — which `NINA_CHAT_STORED_ID_RE` admits as its own
   * group. `NINA_CHAT_ID_RE` is the requested half only and is `{12}` exactly; a single range
   * covering both is what refused every upload this route ever saw.
   */
  if (!isNinaChatRequestPathname(pathname, userId) || !blobUrl.startsWith('https://')) {
    return { ok: false, ticket: null, reason: 'rejected' }
  }

  const claims = {
    userId,
    pathname,
    blobUrl,
    width: Number.isFinite(input.width) ? Math.round(input.width) : 0,
    height: Number.isFinite(input.height) ? Math.round(input.height) : 0,
    bytes: Number.isFinite(input.bytes) ? Math.round(input.bytes) : 0,
  }

  try {
    const result = await describeNinaImages([{ blobUrl, pathname }])
    console.log('[nina] described an image', {
      pathname,
      promptTokens: result.promptTokens,
      completionTokens: result.completionTokens,
      floor: result.floor,
      chars: result.description.length,
    })
    return {
      ok: true,
      ticket: signNinaImageTicket({ ...claims, description: result.description }, secret),
      reason: null,
    }
  } catch (cause) {
    /*
     * The floor tripping is logged LOUDLY and separately from a transport failure. It is the one
     * class that means "the vendor lied to us", and the day it starts happening the log line has
     * to say which one it was — F04's whole §1.1 lesson in one `if`.
     */
    const dropped = cause instanceof NinaVisionTokenFloorError
    if (dropped) {
      console.error('[nina] TOKEN FLOOR TRIPPED on a chat image', {
        pathname,
        message: cause.message,
      })
    } else {
      console.warn('[nina] could not describe a chat image', { pathname, error: String(cause) })
    }
    return {
      ok: false,
      ticket: signNinaImageTicket({ ...claims, description: null }, secret),
      reason: dropped ? 'dropped' : 'transport',
    }
  }
}
