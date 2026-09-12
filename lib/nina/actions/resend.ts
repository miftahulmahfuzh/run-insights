'use server'

import { requireUserId } from '@/lib/auth/requireUserId'
import { isValidId } from '@/lib/id'

import { NINA_DESCRIPTION_UNAVAILABLE } from '../prompts/describe'
import {
  getNinaMessageImagesForMessages,
  getNinaMessagesByIds,
  listNinaMessages,
  type NinaMessageRow,
} from '../queries'
import { openNinaChatTurn, sweepStaleNinaChatTurns } from '../chatturn'
import { startNinaBackgroundTurn } from './startTurn'

/**
 * **R5: re-run the turn for a message that is already on the server.**
 *
 * > *"sometimes, user chat message is left unanswered. add option to resend as well (just for
 * > user's bubble)"*
 *
 * A turn can die silently — the invocation is killed, the segment's ceiling cuts it off — and
 * `sweepStaleNinaChatTurns` closes the claim ninety seconds later. What is left is a persisted
 * runner row with no answer, and until this action there was no way to ask again except retyping
 * the sentence, which writes a second copy of it into the conversation Nina reads as context.
 *
 * ── IT IS `sendNinaMessage` FROM STEP 1c ONWARD, AND NOTHING BEFORE IT ────────────────────────
 * Sweep, open a claim, hand the turn to `after()`. Every step above STEP 1c on the send path exists
 * to turn an untrusted request into a persisted row — validation, ticket verification, the reply
 * target, the run, the session, the INSERT — and all of it has already happened for this message.
 * So this action re-derives the turn's INPUT from the row instead of from a request, and writes
 * nothing.
 *
 * ── INVARIANT 7 IS THE WHOLE POINT: THERE IS NO `insertNinaMessages` HERE ─────────────────────
 * Not a nearly-empty one, not a conditional one. A second copy of his sentence on screen — and in
 * the 40-row window `getNinaMessageWindow` hands her on every later turn — is a failed feature, and
 * it is the one failure the user would notice immediately. `tests/nina.resend.test.ts` asserts the
 * two insert functions are never reached by this action's own body.
 *
 * ── NO MODEL CALL IS ADDED (INVARIANT 5) ─────────────────────────────────────────────────────
 * The descriptions this hands her were paid for once, by `describeNinaImage` on the composer's
 * upload path or by `describeNinaImages` in `after()`. Nothing is re-described, nothing is
 * re-uploaded, and `scripts/check-llm-payload-boundary.mjs` gains no entry: this action calls no
 * model symbol — the background turn's model calls stay sanctioned inside `lib/nina/turnrun.ts`
 * and below it.
 *
 * ── THE BUDGET PAIRING IS INHERITED, NOT RE-ARGUED ───────────────────────────────────────────
 * This calls `startNinaBackgroundTurn`, whose docstring carries it: a Server Action's timeout is
 * the invoking page segment's, `after()` runs for that same budget, and `app/nina/page.tsx` carries
 * `export const maxDuration = 300`. This action ships in the same action layer and is reached from
 * the same segment, so `NINA_BACKGROUND_BUDGET_MS` means here exactly what it means on the send
 * path. Do not relocate it into a route handler that does not carry 300 — that is a silent
 * truncation.
 */
export type NinaResendRefusal =
  /** Malformed id, not his, or gone. "Not his" and "not there" are one answer, by this file's rule. */
  | 'not-found'
  /** It is one of HER bubbles. The sheet never offers it; a control is not a guard. */
  | 'not-mine'
  /** No text, no photo, no run — nothing for her to answer. See the guard below for how that happens. */
  | 'empty'
  /**
   * A turn already owns this conversation, so the message is going to be answered anyway.
   *
   * **This is where a resend and a send part company.** On the send path a null `turnId` is the
   * ordinary burst case and reporting it as a failure would mark a perfectly persisted message as
   * failed. Here there is nothing new to persist, so a null is the only thing that happened, and
   * saying so is the difference between a runner who waits and a runner who taps again.
   */
  | 'turn-live'
  /** The claim could not be opened. The row is untouched; one more tap is the whole recovery. */
  | 'failed'

export interface ResendNinaMessageResult {
  ok: boolean
  /** The `nina_turns.id` this resend opened. Null on every refusal. */
  turnId: string | null
  /**
   * **`nina_messages.seq` of the newest row in this conversation when the resend was accepted** —
   * where `pollNinaReply` must resume from. Null on every refusal.
   *
   * NOT the resent row's own `seq`, and the difference is a duplicated bubble.
   * `listNinaMessagesAfter`'s predicate is `seq > afterSeq`, and `pollNinaReply` returns HER rows
   * from that set — so a cursor pointing at the resent message would re-deliver every bubble of
   * hers that already sits between it and the client's real position, and the reveal would repaint
   * them. The newest `seq` is `>=` everything the client can be holding, and her answer to this
   * resend is inserted strictly above it, so the first poll asks for exactly the new set.
   *
   * The client applies it as `Math.max(cursorRef.current, cursor)`, which is not belt-and-braces:
   * a poll can legitimately be in flight when a resend is accepted, and the fallback below can
   * return a value behind the client's position.
   */
  cursor: number | null
  reason: NinaResendRefusal | null
}

/** One shape for every refusal, so a caller has one branch and no `undefined`. */
function resendRefused(reason: NinaResendRefusal): ResendNinaMessageResult {
  return { ok: false, turnId: null, cursor: null, reason }
}

export async function resendNinaMessage(input: {
  messageId: string
}): Promise<ResendNinaMessageResult> {
  /* FIRST, above any use of an argument. A Server Action is an untrusted POST endpoint whether or
   * not a button exists for it — `messageActions.ts`'s four-line rule, unchanged. */
  const userId = await requireUserId()

  /* A `/nina` id that cannot be one of ours should never reach the database. An optimistic
   * `local-…` id lands here too, and `canResendMessage` has already refused it on the client; this
   * is the server half of the same rule, not a substitute for it. */
  if (!isValidId(input?.messageId)) return resendRefused('not-found')

  /*
   * OWNER-SCOPED, so a foreign id comes back as `[]` and "not his" is indistinguishable from "not
   * there" — invariant 4, and the same read `editNinaMessage` opens with. It also hands over
   * everything the turn input needs: `sessionId`, `body`, `replyToId`, `runId` and `seq` are all in
   * `messageColumns`.
   */
  const [row] = await getNinaMessagesByIds(userId, [input.messageId])
  if (row === undefined) return resendRefused('not-found')
  /* R5 is "just for user's bubble". Re-running a turn for one of HER rows would ask her to answer
   * herself, and `runNinaBackgroundTurn` would stamp the reply's `reply_to_id` at a bubble of her
   * own. The sheet does not offer it; this refuses it anyway. */
  if (row.role !== 'runner') return resendRefused('not-mine')

  /*
   * HIS PHOTOS, AND WHY THEY ARE READ RATHER THAN ASSUMED ABSENT.
   *
   * The window now carries descriptions for the rows inside it (R3, 2026-09-10:
   * `dbNinaSourceGateway.readMessageWindow` reads `nina_message_images.description`), but this
   * path still reads the photographs itself, exactly as `sendNinaMessage` does: a resent row can
   * be OLDER than the 40-row window, and a turn rebuilt from THE ROW must not depend on window
   * membership to know what he sent. The substitution is the same one: a row whose description is
   * null becomes `NINA_DESCRIPTION_UNAVAILABLE`, which tells her honestly that her eyes failed on
   * that one rather than letting her invent what was in it (invariant 5: text, never an image
   * part).
   *
   * `getNinaMessageImagesForMessages` is ordered by `sort_order`, which is the order the bubble
   * renders them in, so she is told about them in the order he sees them.
   */
  const images = await getNinaMessageImagesForMessages(userId, [row.id])

  /*
   * `sendNinaMessage`'s floor, asked of the ROW instead of of the request. `null` for an empty body
   * is what the send path passes and what `runNinaTurn` expects; the empty string would read as a
   * message he sent with no words when in fact he sent a photograph.
   *
   * The refusal below is REACHABLE, and not by any client bug: `removeChatPhotoAction` deletes only
   * the image row when `isNinaPhotoCarrierMessage` is false, and that predicate is false for every
   * runner row — so an operator removing the photo from a caption-less message of his leaves
   * exactly this state. Handing `glm-5.3` a turn with nothing in it would spend money to be told
   * nothing; refusing names the state instead.
   */
  const runnerText = row.body.trim().length > 0 ? row.body : null
  if (runnerText === null && images.length === 0 && row.runId === null) {
    return resendRefused('empty')
  }

  /*
   * The quote, re-resolved. Same shape and same degradation as STEP 0b of the send path: a target
   * that has since been deleted (`reply_to_id` is `ON DELETE SET NULL`, so this is already null in
   * that case) or that a scoped read cannot see becomes "no quote", and the resend still happens.
   * The alternative — refusing because the message he was answering is gone — would withhold the
   * answer to his message over a missing quote header.
   */
  let quotedRow: NinaMessageRow | null = null
  if (row.replyToId !== null) {
    try {
      const found = await getNinaMessagesByIds(userId, [row.replyToId])
      quotedRow = found[0] ?? null
    } catch (cause) {
      console.warn('[nina] could not resolve the reply target for a resend', {
        error: String(cause),
      })
    }
  }

  /*
   * THE SWEEP, and on this path it is closer to the point than it is on the send path. The most
   * common reason a message is sitting unanswered is a turn that died; its claim stands until
   * something closes it, and `openNinaChatTurn` below is what needs it gone. It can never cost the
   * caller: `openNinaChatTurn` applies `NINA_TURN_STALE_MS` itself, so an expired claim does not
   * block a new one even when this fails — the sweep is what makes the LEDGER honest about it.
   */
  try {
    await sweepStaleNinaChatTurns(userId)
  } catch (cause) {
    console.warn('[nina] chat turn sweep failed on a resend', { error: String(cause) })
  }

  let turnId: string | null = null
  try {
    turnId = await openNinaChatTurn(userId, {
      /* HIS row's session, read off the row. Never a client-supplied one: she answers in the
       * conversation she was asked in, and there is no case in which a reply belongs anywhere
       * else. */
      sessionId: row.sessionId,
      runnerMessageId: row.id,
      /* 0 — this is a turn a runner asked for, not a chained follow-up. The chain's own bound is
       * `NINA_TURN_CHAIN_MAX` and it is measured from here, exactly as a send's is. */
      depth: 0,
    })
  } catch (cause) {
    console.warn('[nina] could not open a chat turn for a resend', { error: String(cause) })
    return resendRefused('failed')
  }
  /* See `NinaResendRefusal['turn-live']`: on a send this is the ordinary outcome, here it is the
   * only thing that happened. */
  if (turnId === null) return resendRefused('turn-live')

  /*
   * THE CURSOR. One indexed single-row read — the same one `pollNinaReply` issues — and it is read
   * AFTER the claim is open on purpose: from here to the end of this function nothing writes to
   * `nina_messages`, because `startNinaBackgroundTurn` only REGISTERS the turn and `after()` does
   * not run until the response has gone out. So the newest row now is the newest row the client can
   * be holding, and her answer will sit strictly above it.
   *
   * A failed read degrades to the resent row's own `seq` rather than refusing: his turn is already
   * claimed and about to run, and losing that over a cursor read would be the worse outcome. The
   * client's `Math.max` is what makes the degradation harmless.
   */
  let cursor: number
  try {
    const [newest] = await listNinaMessages(userId, { limit: 1, sessionId: row.sessionId })
    cursor = newest?.seq ?? row.seq
  } catch (cause) {
    console.warn('[nina] could not read the resend cursor', { error: String(cause) })
    cursor = row.seq
  }

  /*
   * The turn, rebuilt field by field from the row. Spelled out rather than spread from anything,
   * because every field has a reason and `tsc` should be what notices if `NinaBackgroundTurnInput`
   * ever gains one this path forgot.
   */
  startNinaBackgroundTurn({
    userId,
    sessionId: row.sessionId,
    turnId,
    runnerMessageId: row.id,
    runnerText,
    imageDescriptions: images.map((image) => image.description ?? NINA_DESCRIPTION_UNAVAILABLE),
    quotedRow,
    attachedRunId: row.runId,
    depth: 0,
    /* NOW, not the message's `created_at`. This is the wall clock the chain and the background
     * budget are measured against, and the message may be a day old — dating the budget from it
     * would exhaust it before the first link ran. */
    startedAtMs: Date.now(),
  })

  return { ok: true, turnId, cursor, reason: null }
}
