import 'server-only'

import { fireNinaImageDispatch } from './imagedispatch'
import type { NinaImageFailure } from './imagefail'
import { buildNinaImagePrompt, sidecarText } from './imagegen'
import { ninaImageQuotaLeft, openNinaImageJob } from './imagejobs'
import { SEED_MAX } from './imagerecipe'

/**
 * **The avatar-generation entry point. Phases 13, 14 and 15 all call this and nothing else.**
 *
 * ── IT ACCEPTS, IT DOES NOT DELIVER (RU-19) ───────────────────────────────────────────────────
 * `{ ok: true, state: 'dispatched' }` means the job exists and GitHub has been rung — NOT that an
 * avatar exists. The row appears in `nina_avatars` 1-3 minutes later, written by the worker, with
 * `is_current: true`, `announced_at: null` and `description` set to the scene prose.
 *
 * **This is good for phase 13 rather than merely tolerable.** Phase 10's `avatar_changed` trigger
 * already fires on `announced_at IS NULL` at the next cron tick, so the announcement path needs no
 * change at all — the promise evaluator dispatches, the worker generates, and the next tick has her
 * announce it. What phase 13 must NOT do is read the new avatar back in the same invocation.
 * `getNinaImageJob(userId, jobId)` is provided for polling and `listOpenNinaImageJobs(userId)`
 * reports what is in flight; RULING C3 put `jobId`, `firedOn` and `attempts` on
 * `NinaPendingPromise` for exactly this.
 *
 * `source` is the caller's own provenance and it goes onto `nina_avatars.source`: `'generated'` for
 * phase 13's promise evaluator, `'admin'` for phase 15's album manager. (`'operator'` is phase 14's
 * script, which uploads a file rather than generating one and so never reaches this function;
 * `'seed'` is phase 1's committed `nina.png`.)
 *
 * It is capped and logged on the same `nina_turns` ledger as a chat selfie, because it is the same
 * camera and the same bill — `kind = 'image'`, one row, `cost_micro_usd` filled in. An avatar
 * generation therefore consumes one of the six, which is correct: the cap is a money cap, not a
 * feature cap.
 *
 * **It never throws and it never posts a message.**
 *
 * ── WHY IT IS A DIFFERENT FUNCTION FROM THE CHAT SELFIE, NOT A FLAG ON IT ─────────────────────
 * Three differences survive, and each changes the code path.
 *
 *   1. **It writes `nina_avatars`, not `nina_messages`.** A different table, a different lifecycle,
 *      and `is_current` has a partial unique index that makes the statement order load-bearing. The
 *      *worker* performs that write; this function is what records the intent in `args.purpose`.
 *   2. **It writes `description`.** R25 needs prose about what the photograph shows so she can
 *      invent where she was. For a *generated* avatar that prose is our own scene text — we wrote
 *      the picture. For a *hand-uploaded* one (phases 14 and 15) there is no prompt, so those two
 *      run phase 6's `glm-4.6v` describe pre-pass instead. That is the whole answer to "which path
 *      writes `description`".
 *   3. **On failure it says nothing.** No apology, no announcement. `announced_at IS NULL` is phase
 *      10's `avatar_changed` trigger, so a row written for a failed generation would make her
 *      announce a photograph that does not exist — and the worker only inserts the row on success,
 *      which is the structural half of that guarantee. Only the caller knows whether anyone was
 *      waiting: a promise coming due (phase 13) may deserve an apology; an admin clicking Generate
 *      (phase 15) deserves a red toast, not a chat message. `failNinaImageJob` and both sweeps
 *      therefore skip the chat message for `purpose === 'avatar'`, and `ninaImageApology(kind,
 *      jobId)` is exported for whoever decides to use it.
 */
export interface NinaAvatarRequest {
  userId: string
  /** What the photograph shows. Becomes `nina_avatars.description` verbatim (R25). */
  scene: string
  mood?: string | null
  source: 'generated' | 'admin'
}

export type NinaAvatarResult =
  | { ok: true; jobId: string; state: 'dispatched' }
  | { ok: false; jobId: string | null; kind: NinaImageFailure | 'capped' }

export async function generateNinaAvatar(request: NinaAvatarRequest): Promise<NinaAvatarResult> {
  const { userId } = request

  /*
   * The cap, checked the same way the chat tool checks it — `openNinaImageJob` writes the row that
   * makes the check meaningful, so the order is quota-then-open and never the reverse.
   */
  if ((await ninaImageQuotaLeft(userId)) <= 0) {
    return { ok: false, jobId: null, kind: 'capped' }
  }

  const scene = request.scene.trim()
  const mood = request.mood?.trim() ?? null
  const seed = Math.floor(Math.random() * SEED_MAX)
  const prompt = buildNinaImagePrompt({ purpose: 'avatar', scene, mood })

  const jobId = await openNinaImageJob(userId, {
    purpose: 'avatar',
    scene,
    mood,
    prompt,
    seed,
    /* Nobody asked in chat, so there is nothing to quote and nothing to apologise into. */
    replyToId: null,
    source: request.source,
    attempts: 0,
    sidecar: sidecarText({ prompt, seed, purpose: 'avatar' }),
  })

  fireNinaImageDispatch({ userId, jobId, purpose: 'avatar', replyToId: null })

  return { ok: true, jobId, state: 'dispatched' }
}
