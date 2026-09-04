'use server'

import { requireUserId } from '@/lib/auth/requireUserId'
import { isValidId } from '@/lib/id'

import { planMessageEdit, type EditTarget } from './edit'
import {
  deleteNinaMessage,
  getNinaMessageImagesForMessages,
  getNinaMessagesByIds,
  updateNinaMessage,
} from './queries'

/**
 * R8's write path: rewrite a message, or remove one. His or hers.
 *
 * ── THE ACCEPTANCE CRITERION IS THE PROMPT, NOT THE BUBBLE ────────────────────────────────────
 * `loadNinaContext` calls `gateway.readMessageWindow(userId, CONTEXT_MESSAGE_WINDOW)` on **every**
 * turn, which is `getNinaMessageWindow`'s `ORDER BY seq DESC LIMIT 40` straight out of
 * `nina_messages`, and `conversationFacts` puts each row's `text` verbatim into
 * `ConversationTurn.text`. There is no cache anywhere on that path. So the moment either statement
 * below commits, the next thing Nina reads has changed — with no invalidation step at all, which is
 * the same property the admin memory writers spell out for the memory tables.
 *
 * Said plainly, because it is the capability being requested and not an accident: **editing one of
 * Nina's messages makes the edited text what she said**, as far as every later turn is concerned.
 * The user asked for exactly this — "nina will keep using previous history as context, so we need
 * to give user the capability to make this context more 'accurate'".
 *
 * ── WHY THIS FILE AND NOT `lib/nina/actions.ts` ───────────────────────────────────────────────
 * `lib/nina/albumActions.ts`'s argument, verbatim in spirit: isolation. `actions.ts` is another
 * phase's file with another phase's `after()` hook going into it. These two functions share
 * nothing with `sendNinaMessage` except `requireUserId`.
 *
 * ── FOUR LINES, IN THIS ORDER, EVERY TIME ─────────────────────────────────────────────────────
 * The admin memory writers' shape, minus the admin gate:
 *   1. `requireUserId()` FIRST, above any use of an argument. A Server Action is an untrusted POST
 *      endpoint whether or not a button exists for it.
 *   2. shape-check the id (`isValidId`) — a `/nina` id that cannot be one of ours should never
 *      reach the database.
 *   3. an OWNER-SCOPED read, then a mutation whose own WHERE carries `user_id` again.
 *      `resolveAttachment` in `actions.ts` is the pattern: prove ownership before the write, and
 *      **refuse rather than degrade** on a miss, because an edit of a message he cannot see is not
 *      a mistake to absorb quietly. Invariant 3: a message id from a client is a claim.
 *   4. **NO `revalidatePath`, and that is a considered choice rather than an omission.**
 *      `ChatScreen` reconciles a server-driven list change through `mergeServerMessages`, which is
 *      "server order, LOCAL content" — for any id the client already holds, the local copy wins. A
 *      revalidation would therefore re-render the page and then be discarded, costing a server
 *      render and changing nothing on screen. The client patches its own state from the return
 *      value below, exactly as it already adopts `result.userMessageId` after a send. That keeps
 *      this feature on the two mechanisms `ChatScreen` already documents instead of adding a third.
 *
 * Neither function calls a model, so neither has an entry to add to
 * `scripts/check-llm-payload-boundary.mjs` (which only phase 4 may edit anyway).
 */

/** What an edit reports. `body` is the canonical text the bubble must now show. */
export interface NinaMessageMutationResult {
  ok: boolean
  /** The row's text after the write, or the unchanged text. Null on every refusal. */
  body: string | null
  reason: 'not-found' | 'unchanged' | 'too-long' | 'delete-instead' | 'failed' | null
}

/** What a delete reports. `deletedId` is what the client drops and un-quotes. */
export interface NinaMessageDeletionResult {
  ok: boolean
  deletedId: string | null
  reason: 'not-found' | 'failed' | null
}

/**
 * Rewrite one message's text — his or hers.
 *
 * The row is READ before it is written, and the read is what makes the rule correct rather than
 * merely safe: `planMessageEdit` needs to know whether the message carries a photo or a run,
 * because clearing the caption of an image-only message is a legitimate edit and clearing a
 * text-only message is not (it is `'delete-instead'`). Those two facts live in
 * `nina_message_images` and `nina_messages.run_id`, so they have to be read. Both reads are
 * owner-scoped, so a foreign id yields nothing and the refusal below is a refusal.
 */
export async function editNinaMessage(input: {
  messageId: string
  body: string
}): Promise<NinaMessageMutationResult> {
  const userId = await requireUserId()

  if (!isValidId(input?.messageId)) return { ok: false, body: null, reason: 'not-found' }
  const requested = typeof input?.body === 'string' ? input.body : ''

  const [row] = await getNinaMessagesByIds(userId, [input.messageId])
  if (row === undefined) return { ok: false, body: null, reason: 'not-found' }

  const images = await getNinaMessageImagesForMessages(userId, [row.id])

  const target: EditTarget = {
    id: row.id,
    /* The DB says `'runner' | 'nina'` and the pure module takes a boolean, on
     * `QuoteCandidate.mine`'s pattern — one translation point, here. */
    mine: row.role === 'runner',
    body: row.body,
    hasImage: images.length > 0,
    hasRun: row.runId != null,
    /* It came back from an owner-scoped read of `nina_messages`, so it is a row. */
    confirmed: true,
  }

  const plan = planMessageEdit(target, requested)
  switch (plan.kind) {
    case 'unchanged':
      /* `ok: true` — nothing failed, and the bubble already shows the right text. */
      return { ok: true, body: row.body, reason: 'unchanged' }
    case 'too-long':
      return { ok: false, body: null, reason: 'too-long' }
    case 'delete-instead':
      return { ok: false, body: null, reason: 'delete-instead' }
    case 'not-editable':
      return { ok: false, body: null, reason: 'not-found' }
    case 'edit':
      break
  }

  try {
    const updated = await updateNinaMessage(userId, row.id, plan.body)
    if (updated === null) return { ok: false, body: null, reason: 'not-found' }
    return { ok: true, body: updated.body, reason: null }
  } catch (cause) {
    console.error('[nina] could not edit a message', { messageId: row.id, error: String(cause) })
    return { ok: false, body: null, reason: 'failed' }
  }
}

/**
 * Remove one message — his or hers. **One message, not a whole turn.**
 *
 * She answers in up to four bubbles, so "delete Nina's message" could have meant her whole answer.
 * It does not, for two reasons. The grouping key does not exist: `nina_messages.turn_id` is NULL on
 * every chat and proactive row (no caller of `insertNinaMessages` passes one), so
 * `WHERE turn_id = $1` cannot select "her answer", and the only alternative grouping — a contiguous
 * run of her rows — would sweep up a proactive message written hours later. And one row is the
 * better product regardless: the runner is the judge of which sentence embarrassed him, and the
 * window she reads is a flat list of messages rather than of turns, so a removed line reads as a
 * line she never said. Four taps for four bubbles is a fair price for not choosing on his behalf.
 *
 * ── THE IMAGE ROWS ARE READ BEFORE THE DELETE, AND THE ORDER IS THE WHOLE POINT ───────────────
 * `nina_message_images.message_id` cascades, so after the delete those rows do not exist and their
 * `pathname`s — the reaper's future handle, per that column's own note — are unrecoverable. The
 * Blob bytes are left behind (assumption A5, accepted and out of scope: `reap-orphaned-blobs` does
 * not cover `nina/` yet, and extending it is its own card). Logging the pathnames costs one indexed
 * read on a rare destructive action and turns silent orphans into findable ones. It is not a
 * cleanup and does not pretend to be.
 */
export async function removeNinaMessage(input: {
  messageId: string
}): Promise<NinaMessageDeletionResult> {
  const userId = await requireUserId()

  if (!isValidId(input?.messageId)) return { ok: false, deletedId: null, reason: 'not-found' }

  /* Owner-scoped, so a foreign id returns `[]` here and `null` from the delete below — the two
   * together mean "not his" and "not there" are the same outcome, which is this file's rule. */
  const images = await getNinaMessageImagesForMessages(userId, [input.messageId])

  try {
    const removed = await deleteNinaMessage(userId, input.messageId)
    if (removed === null) return { ok: false, deletedId: null, reason: 'not-found' }

    if (images.length > 0) {
      console.warn('[nina] a deleted message left blobs with no row pointing at them', {
        messageId: removed.id,
        count: images.length,
        pathnames: images.map((image) => image.pathname),
      })
    }

    return { ok: true, deletedId: removed.id, reason: null }
  } catch (cause) {
    console.error('[nina] could not delete a message', {
      messageId: input.messageId,
      error: String(cause),
    })
    return { ok: false, deletedId: null, reason: 'failed' }
  }
}
