import 'server-only'

import { buildNinaImagePrompt, sidecarText } from './imagegen'
import type { NinaImageFailure } from './imagefail'
import type { NinaImagePrefs } from './imageprefs'
import { ninaImageQuotaLeft, openNinaImageJob } from './imagejobs'
import { SEED_MAX } from './imagerecipe'
import { fireNinaImageGeneration } from './imagerun'
import { readNinaImagePrefs, readNinaTuning, resolveNinaPhotoReference } from './queries'
import type { NinaTuning } from './tuning'

/**
 * **R11: the prompt test.** `/admin/image-generation` asks the provider whether it will draw the
 * prompt the saved prefs assemble, and the answer is one generation off the daily cap.
 *
 * The user's words: *"add a test prompt button, so we can see if this prompt is actually allowed by
 * Alibaba (qwen 3 devs) guardrails. and the photo result will automatically be added to Chat
 * photos"*. Both halves are answered by reusing the shipped pipeline rather than by building a
 * second one:
 *
 *   · "allowed by the guardrails" is `classifyImageFailure`'s `'policy'`
 *     (`lib/nina/imagefail.ts`), which already lands in `nina_turns.error_code` via
 *     `failNinaImageJob`. This phase SURFACES it; it does not compute it a second time.
 *   · "added to Chat photos" is the selfie finisher in `lib/nina/imagerun.ts`, which writes the
 *     `nina_messages` + generated-image pair that `/admin/photos` lists. So `purpose` is
 *     `'selfie'` and R12 needs no new writer at all. A second writer of that pair would violate
 *     plan invariant 12.
 *
 * ── IT IS `selfiegen.ts`'s SIBLING, AND NOT A FLAG ON IT ──────────────────────────────────────
 * `avatargen.ts` argues the shape and `selfiegen.ts` repeats it: a different caller with a
 * different provenance and a different failure meaning is a different function. Concretely, this
 * one takes no `scene` and no `mood` (the operator has no per-photograph opinion — that is what the
 * prefs replaced), stamps `source: 'admin'`, and returns the prompt and the seed to its caller so
 * the panel can show what was sent without a second read.
 *
 * ── IT ACCEPTS, IT DOES NOT DELIVER ──────────────────────────────────────────────────────────
 * `{ ok: true }` means the job row exists and the generation has been scheduled on this server's
 * remaining wall clock — NOT that a photograph exists. `app/admin/image-generation/page.tsx`
 * declares `maxDuration = 300` for that reason: `after()` inherits the route segment's ceiling.
 *
 * **It never throws and it never posts a message.** A database that will not open the row comes
 * back as `kind: 'transport'`, because a Server Action that threw would reach the browser as an
 * opaque digest and the operator would be told nothing at all.
 */

/**
 * The `scene` slot, for a photograph nobody asked for in a chat.
 *
 * ── WHY IT IS NOT THE WORD "TEST" ────────────────────────────────────────────────────────────
 * `buildNinaImagePrompt` renders `SCENE: <this>` into the prompt the provider actually reads.
 * `SCENE: a test photograph` invites the model to draw a test card, which would corrupt the exact
 * thing being measured. It is also the string the selfie finisher writes verbatim into the image
 * row's `description`, which is what `/admin/photos` shows under the picture — so it has to read as
 * a sentence a human wrote.
 *
 * ── WHY IT IS NOT THE PREFS' VENUE / TIME / NOTES ────────────────────────────────────────────
 * Phase 2 already emits those as their own `VENUE:` / `TIME:` / `NOTES:` blocks from the same prefs
 * row. Splicing them in here too would double every one of them in the one prompt whose whole
 * purpose is to be representative of the real thing.
 *
 * Full body in frame, deliberately: R1's body canon is what this test is testing.
 */
export const NINA_IMAGE_TEST_SCENE =
  'Nina taking a photograph of herself at arm’s length, standing, her whole body in frame, ' +
  'the phone visible in one hand.'

/**
 * **The prompt, assembled and nothing else. Pure: no await, no I/O, no provider.**
 *
 * This exists as its own export so that the preview the operator reads and the prompt the provider
 * gets are produced by ONE function. A preview computed a second way is a preview that will
 * eventually disagree with the thing it previews, and the operator would be rewriting a prompt he
 * was never shown.
 *
 * It is `assemble…` and not `run…`/`generate…` on purpose. `scripts/check-llm-payload-boundary.mjs`
 * Rule 2 forbids awaiting a MODEL CALL from a render, matching by function name over nine guarded
 * symbols; this function awaits nothing and reaches no provider, and its name says so. Plan
 * invariant 5 is satisfied structurally rather than by exemption — see `buildNinaSystemPrompt` on
 * `/admin/personality`, which is the same move.
 */
export function assembleNinaImageTestPrompt(input: {
  tuning: NinaTuning
  prefs: NinaImagePrefs
}): string {
  return buildNinaImagePrompt({
    /*
     * `'selfie'` and NOT `'avatar'`. An avatar job writes `nina_avatars` through the avatar
     * finisher and would change her face — and it writes no `nina_messages` row, so R12 would go
     * unsatisfied. A prompt test is not a re-anchoring of who she is.
     */
    purpose: 'selfie',
    scene: NINA_IMAGE_TEST_SCENE,
    /* No per-photograph mood. `EXPRESSION AND ENERGY` is the chat model's line, and an operator
     * testing his standing settings has not been asked for one. `buildNinaImagePrompt` omits the
     * block entirely for null. */
    mood: null,
    tuning: input.tuning,
    prefs: input.prefs,
  })
}

export type NinaImageTestDispatch =
  | { ok: true; jobId: string; prompt: string; seed: number }
  | { ok: false; jobId: null; kind: NinaImageFailure | 'capped' }

export async function dispatchNinaImageTest(userId: string): Promise<NinaImageTestDispatch> {
  /*
   * THE CAP, FIRST — before the row is opened and therefore before a cent is spent.
   * `generateNinaSelfie` states the rule and `NINA_IMAGE_DAILY_CAP` counts FAILURES, which is
   * exactly why a test costs one: every attempt cost either money or a runner minute
   * (`lib/nina/imagerecipe.ts`, plan invariant 8). The order is not cosmetic — refusing
   * after the insert would leave a `queued` row nobody will ever run.
   */
  if ((await ninaImageQuotaLeft(userId)) <= 0) {
    return { ok: false, jobId: null, kind: 'capped' }
  }

  const seed = Math.floor(Math.random() * SEED_MAX)

  /* Read live, no cache — `generateNinaSelfie`'s comment, and it matters more here: a wardrobe
   * saved on this very page thirty seconds ago is the thing being tested. This is also why the
   * operator must SAVE before testing: an unsaved draft is not in this row. */
  const [tuning, prefs] = await Promise.all([readNinaTuning(userId), readNinaImagePrefs(userId)])

  const prompt = assembleNinaImageTestPrompt({ tuning, prefs })

  /*
   * ── THE SAVED PHOTO REFERENCE, THREADED ONTO PHASE 3'S FIELD ──────────────────────────────
   * **RECONCILED.** Phase 1 stores an id plus a set (`prefs.reference: { source, id }`), NOT a
   * Blob URL — `updateNinaChatPhotoBlob` changes a chat photograph's `blob_url` and keeps its
   * `id`, so a stored URL would point at a deleted Blob object while the picker still drew the
   * chosen tile. So it is resolved here, owner-scoped, and only once the cap has been cleared.
   *
   * `null` is the ORDINARY answer, not an error: there is no foreign key on the two reference
   * columns — two possible parents, and a cascade would delete a whole prefs row because one
   * photograph was deleted — so a photograph the operator later deleted leaves an id pointing at
   * nothing. Phase 3 degrades an unfetchable reference to an unanchored generation, and this is
   * the same degrade one layer earlier. It must never throw and must never block the test; the
   * `'none'` case returns on a branch with no query, so the ordinary unanchored path costs no
   * round trip.
   *
   * `blobUrl` and not a URL from a request body: phase 3's contract requires *"the `blob_url` of a
   * `nina_avatars` row or a chat-photo row — resolved server-side from the operator's selection —
   * never a string that came off a request body."* `resolveNinaPhotoReference` is exactly that
   * resolution, and it is owner-scoped.
   *
   * The URL is captured at OPEN and stored in `args`, so a retry uses the URL the job was opened
   * with — which is phase 1's own Handoff instruction and what keeps `reopenNinaImageJob`'s
   * `{ ...args, attempts: 0 }` correct for an anchored job.
   */
  const reference = await resolveNinaPhotoReference(userId, prefs.reference)

  try {
    const jobId = await openNinaImageJob(userId, {
      purpose: 'selfie',
      scene: NINA_IMAGE_TEST_SCENE,
      mood: null,
      prompt,
      seed,
      /* Nobody asked in chat. The selfie finisher falls through to `resolveNinaWriteSession`, so
       * the photograph and its caption land in his most recent conversation (or a fresh one). The
       * bubble is the price of the image row's `message_id` being NOT NULL — see the plan index's
       * Decisions table and this phase's D7. */
      replyToId: null,
      /* Already in the union and already used by `lib/admin/ninaAlbumActions.ts`. No fourth source
       * value. */
      source: 'admin',
      attempts: 0,
      referenceUrl: reference?.blobUrl ?? null,
      sidecar: sidecarText({ prompt, seed, purpose: 'selfie' }),
    })

    /*
     * The generation, on this server, in `after()`. Identical handoff to `generateNinaSelfie`'s,
     * and the reason the button can return immediately: 78-220 s inside a browser POST is what
     * `after()` exists to avoid, and a Server Action's ceiling is the PAGE SEGMENT's.
     *
     * `purpose: 'selfie'` and `replyToId: null` are passed as they are stored, so the run path
     * cannot disagree with the row about what it is doing.
     */
    fireNinaImageGeneration({ userId, jobId, purpose: 'selfie', replyToId: null })

    return { ok: true, jobId, prompt, seed }
  } catch (cause) {
    /*
     * The row could not be opened, so nothing was dispatched and nothing was billed. `'transport'`
     * is the honest kind: `lib/nina/imagefail.ts` reserves `'policy'` for "the provider looked at
     * this and said no", and reporting our own database failure as a refusal would send the
     * operator rewriting a prompt that was never seen by anybody.
     */
    console.error('[nina] image test could not be opened', { userId, error: String(cause) })
    return { ok: false, jobId: null, kind: 'transport' }
  }
}
