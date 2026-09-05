import 'server-only'

import { fireNinaImageDispatch } from './imagedispatch'
import type { NinaImageFailure } from './imagefail'
import { buildNinaImagePrompt, sidecarText } from './imagegen'
import { ninaImageQuotaLeft, openNinaImageJob } from './imagejobs'
import { SEED_MAX } from './imagerecipe'
import { readNinaTuning } from './queries'

/**
 * **The chat-selfie entry point.** The `generate_image` tool calls this, and so does the promise
 * sweep when the reward is a photograph she sends him (R5).
 *
 * ── IT ACCEPTS, IT DOES NOT DELIVER ───────────────────────────────────────────────────────────
 * `{ ok: true, state: 'dispatched' }` means the job row exists and GitHub has been rung — NOT that
 * a photograph exists. `scripts/nina-image-worker.ts` writes the `nina_messages` +
 * `nina_message_images` pair 1-3 minutes later (`finishSelfie`), with `turn_id` set to the job id.
 * That `turn_id` is what the promise evaluator matches on, and it is the whole reason the settle
 * test can be exact instead of same-day.
 *
 * **It never throws and it never posts a message.** The worker posts — the caption on success
 * (`ninaImageCaption`), the apology on a spent retry budget (`closeFailed`). Same guarantee
 * `generateNinaAvatar` gives, for the same reason: a caller that could dispatch without saying
 * anything is a caller that will eventually do so.
 *
 * ── WHY IT IS A DIFFERENT FUNCTION FROM `generateNinaAvatar` AND NOT A FLAG ON IT ─────────────
 * `avatargen.ts` already argues this at length and nothing here weakens it: a selfie writes
 * `nina_messages`, an avatar writes `nina_avatars` under a partial unique index; a selfie's failure
 * is apologised for because somebody is waiting, an avatar's is silent because nobody asked; and
 * `announced_at IS NULL` is a trigger only the avatar path arms. Two purposes, two functions, one
 * prompt builder.
 *
 * ── WHY IT READS THE TUNING ITSELF ────────────────────────────────────────────────────────────
 * One indexed primary-key read on a path that already does one (`ninaImageQuotaLeft`) and then
 * makes an HTTP call to GitHub. The alternative was a `tuning` field on `NinaToolContext`, which is
 * built in `lib/nina/turn.ts` — another phase's file — and which would still have left the promise
 * sweep to fetch the row itself. Reading it here means every caller is dressed without being
 * changed.
 */
export interface NinaSelfieRequest {
  userId: string
  /** What the photograph shows. Becomes `nina_message_images.description` verbatim. */
  scene: string
  mood?: string | null
  /**
   * The message this photograph answers, so it quotes it when it lands (phase 7's `reply_to_id`).
   * The chat tool passes the runner's message; the promise sweep passes the message she made the
   * promise in. Null is fine, and a message that has since been deleted is fine too — the worker
   * writes this through an ownership subselect rather than trusting it.
   */
  replyToId?: string | null
}

export type NinaSelfieResult =
  | { ok: true; jobId: string; state: 'dispatched' }
  | { ok: false; jobId: string | null; kind: NinaImageFailure | 'capped' }

export async function generateNinaSelfie(request: NinaSelfieRequest): Promise<NinaSelfieResult> {
  const { userId } = request

  /*
   * THE CAP, first — before the row is opened and therefore before a cent is spent. It counts
   * failed generations too, because every attempt cost either money or a runner minute.
   * `NINA_IMAGE_DAILY_CAP` is a money cap and not a feature cap: the photo dial changes how eagerly
   * she offers, never how much the operator spends.
   */
  if ((await ninaImageQuotaLeft(userId)) <= 0) {
    return { ok: false, jobId: null, kind: 'capped' }
  }

  const scene = request.scene.trim()
  const mood = request.mood?.trim() ?? null
  const replyToId = request.replyToId ?? null
  const seed = Math.floor(Math.random() * SEED_MAX)

  /* Read live, no cache. A wardrobe saved on /admin/nina thirty seconds ago is in this prompt. */
  const tuning = await readNinaTuning(userId)
  const prompt = buildNinaImagePrompt({ purpose: 'selfie', scene, mood, tuning })

  const jobId = await openNinaImageJob(userId, {
    purpose: 'selfie',
    scene,
    mood,
    prompt,
    seed,
    replyToId,
    source: 'chat',
    attempts: 0,
    sidecar: sidecarText({ prompt, seed, purpose: 'selfie' }),
  })

  fireNinaImageDispatch({ userId, jobId, purpose: 'selfie', replyToId })

  return { ok: true, jobId, state: 'dispatched' }
}
