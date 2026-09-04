import 'server-only'

import { z } from 'zod'

import { GENERATE_IMAGE_TOOL } from '@/lib/nina/prompts'
import {
  extendToolSet,
  NINA_CORE_TOOL_SET,
  type NinaToolAnswer,
  type NinaToolContext,
  type NinaToolHandler,
  type NinaToolSet,
} from '@/lib/nina/tools'

import { fireNinaImageDispatch } from './imagedispatch'
import { NINA_IMAGE_CAPPED_NOTE } from './imagefail'
import { buildNinaImagePrompt, sidecarText } from './imagegen'
import { ninaImageQuotaLeft, openNinaImageJob } from './imagejobs'
import { SEED_MAX } from './imagerecipe'

/**
 * **`generate_image`, dispatched.** Phase 2 wrote the schema, phase 3 wrote the dispatch table, and
 * this is the meaning.
 *
 * ── WHAT THE HANDLER DOES *NOT* DO ────────────────────────────────────────────────────────────
 * It does not call OpenRouter, and after RU-19 it could not: a chat turn is budgeted at 45 s against
 * a 60 s ceiling and the shipping generation is 78.2 s measured. Awaiting the camera inside the turn
 * would kill the turn, and the runner would lose her whole reply to get no photograph. So the
 * handler does four cheap things — validate, check the cap, write the job row with its finished
 * prompt, ring the doorbell — and returns in single-digit milliseconds. Her reply goes out
 * immediately with a bubble that says she is taking the photo. RU-2's "queued" is this function.
 *
 * ── THE PROMPT AND THE SEED ARE MINTED HERE ───────────────────────────────────────────────────
 * Both go into `nina_turns.args`. That is what makes the worker dependency-free of phase 2's
 * persona, what makes a retry reproduce the same photograph rather than a different one, and what
 * lets the backstop schedule work on a job nobody told it about.
 *
 * ── AND IF THE DOORBELL NEVER RINGS ───────────────────────────────────────────────────────────
 * The job row is already written. `fireNinaImageDispatch` fails it with an apology if the GitHub
 * call is refused; the backstop schedule retries it if the call succeeded but no runner ran; the
 * on-read sweep gives up and apologises at 20 minutes if GitHub is dead. So the failure mode of the
 * doorbell is "she says sorry" or "it happens anyway", never "the bubble spins forever".
 */

/**
 * Phase 2's schema, in Zod, so a hallucinated argument shape is a `tool_result` rather than a crash.
 * Phase 3's `lib/nina/schema.ts` does the same for the other three tools; this one is declared here
 * rather than there because phase 3 must stay revertable without this phase.
 */
const GenerateImageArgsSchema = z.object({
  scene: z.string().trim().min(3).max(600),
  mood: z.string().trim().max(200).optional(),
})

export const handleGenerateImage: NinaToolHandler = async (
  args: unknown,
  ctx: NinaToolContext,
): Promise<NinaToolAnswer> => {
  const parsed = GenerateImageArgsSchema.safeParse(args)
  if (!parsed.success) {
    return {
      answer: { error: 'Describe the photo in a sentence or two as `scene`, and try again.' },
      isError: true,
    }
  }

  /*
   * THE CAP. Checked before the row is opened and therefore before a cent is spent. It counts failed
   * generations too (`countNinaTurnsSince` does), because every attempt cost either money or a
   * runner minute.
   *
   * **The refusal is HERS.** We hand the model `NINA_IMAGE_CAPPED_NOTE` — an instruction to say she
   * is out of photos, in her own words, with no number and no mention of a system — and she writes
   * the bubble in the same turn. That is what "refuses the n+1th politely and in character" means: a
   * canned refusal string would be us talking, and the one thing this feature cannot afford is Nina
   * sounding like an API.
   *
   * `isError: false` on purpose. This is not a malformed call; it is a true answer to a legitimate
   * request, and phase 3's ruling (g) reserves `isError` for "you asked for something I cannot
   * answer".
   */
  if ((await ninaImageQuotaLeft(ctx.userId)) <= 0) {
    return { answer: { taken: false, instruction: NINA_IMAGE_CAPPED_NOTE }, isError: false }
  }

  const scene = parsed.data.scene
  const mood = parsed.data.mood ?? null
  const seed = Math.floor(Math.random() * SEED_MAX)
  const prompt = buildNinaImagePrompt({ purpose: 'selfie', scene, mood })

  const jobId = await openNinaImageJob(ctx.userId, {
    purpose: 'selfie',
    scene,
    mood,
    prompt,
    seed,
    /*
     * The photograph quotes the message that asked for it (phase 7's `reply_to_id`), which is what
     * makes the answer legible when it lands two minutes after four other bubbles. Null on a
     * proactive turn, where nobody asked.
     */
    replyToId: ctx.sourceMessageId,
    source: 'chat',
    attempts: 0,
    sidecar: sidecarText({ prompt, seed, purpose: 'selfie' }),
  })

  fireNinaImageDispatch({
    userId: ctx.userId,
    jobId,
    purpose: 'selfie',
    replyToId: ctx.sourceMessageId,
  })

  /*
   * What she is told. Deliberately spare: she must say she is taking the photo NOW, in one short
   * bubble, and must not describe the photo she has not seen yet — a bubble that narrates the
   * picture would be a fact the app never computed, and it would read absurdly if the generation
   * then failed and she apologised for a photo she had already described.
   *
   * "in a moment" and not "in two minutes": a specific duration is a promise about a GitHub queue,
   * and she does not know about GitHub queues.
   */
  return {
    answer: {
      taken: true,
      instruction:
        'The camera is running. Say — in one short message, in your own voice — that you are ' +
        'taking the photo right now and it is coming in a moment. Do NOT describe the photo: you ' +
        'have not seen it yet. Do not mention systems, jobs, queues or waiting times.',
    },
    isError: false,
  }
}

/**
 * **The tool set the chat turn actually uses.** `NINA_CORE_TOOL_SET` plus `generate_image`.
 *
 * PHASE 13: extend **THIS**, not the core set —
 * `extendToolSet(NINA_CHAT_TOOL_SET, [{ tool: SET_AVATAR_TOOL, handler: handleSetAvatar }])` — and
 * update the same one line in `lib/nina/actions.ts`. Extending the core set instead would produce a
 * second set without `generate_image`, and whichever of the two phases wired `actions.ts` last would
 * silently delete the other's tool.
 */
export const NINA_CHAT_TOOL_SET: NinaToolSet = extendToolSet(NINA_CORE_TOOL_SET, [
  { tool: GENERATE_IMAGE_TOOL, handler: handleGenerateImage },
])
