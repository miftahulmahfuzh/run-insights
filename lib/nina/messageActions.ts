'use server'

import { requireUserId } from '@/lib/auth/requireUserId'
import { isValidId } from '@/lib/id'

import { releaseBlobIfUnreferenced } from './blobRelease'
import { planMessageEdit, type EditTarget } from './edit'
import { promoteNinaImageDependents } from './provenancePromotion'
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
 * ── WHY THIS FILE AND NOT `lib/nina/actions/` ──────────────────────────────────────────────────
 * `lib/nina/albumActions.ts`'s argument, verbatim in spirit: isolation. `lib/nina/actions/` is another
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
 *      `resolveAttachment` in `lib/nina/actions/send.ts` is the pattern: prove ownership before the write, and
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
 * `deleteNinaMessage` deletes this message's `nina_message_images` rows in its own transaction (it
 * used to be `message_id`'s cascade; R1 made the column `ON DELETE SET NULL` so a deleted SESSION
 * stops taking the photographs, and that function's header argues the split). Either way, after
 * the delete those rows do not exist and their `pathname`s — the reaper's future handle, per that
 * column's own note — are unrecoverable. So the read happens first, and it is the handle for both
 * steps below. This is the one order that works, and it is forced rather than chosen:
 * `deleteNinaMessage` deliberately does not surface the image delete's rows (*"a return value
 * nothing consumes is a promise this set has not made"*), so unlike `deleteNinaChatPhoto` the
 * release here cannot be fed from the DELETE's own return value.
 *
 * ── PROMOTE, THEN DELETE, THEN RELEASE — THIS TABLE'S THREE-STEP RULE (card #94) ──────────────
 * The sequence is `deleteNinaChatPhoto`'s (`lib/nina/albumActions.ts`) and
 * `removeChatPhotoAction`'s (`lib/admin/chatPhotoActions.ts`), not a fourth spelling of it. This
 * path used to do neither half and log the pathnames instead — written when the two helpers did
 * not exist and `reap-orphaned-blobs` did not know the `nina/` prefix. Both are now false, so the
 * log has been replaced by the rule it was standing in for.
 *
 *   1. **Promote.** Another chat row can re-show one of these photographs via `source_image_id`,
 *      and that FK is `ON DELETE SET NULL`: without this the dependent survives as an unmeasured
 *      "original" that neither dedup mechanism can ever match — the ghost-photo bug
 *      `lib/nina/provenancePromotion.ts` exists to bury, whose docstring names THIS caller in
 *      advance (*"or before the `deleteNinaMessage` that takes the row with it"*). Best effort by
 *      construction: it cannot throw and cannot refuse the delete.
 *   2. **Delete.** The statement inside which both `ON DELETE SET NULL`s fire.
 *   3. **Release**, per distinct object and only once the rows naming it are gone — which is the
 *      only moment `releaseBlobIfUnreferenced` can be asked honestly. It answers `'shared'` and
 *      keeps the bytes whenever another chat row or her album still points at them, which is the
 *      whole of the card's hazard: `resolveAttachment` copies `blob_url`/`pathname` onto a new row
 *      without copying bytes, so one object can sit behind this bubble AND her current profile
 *      picture.
 *
 * Grouped by `pathname` because a bubble can show the same photograph more than once (the
 * promotion pass groups for the same reason); without it the second release would ask about bytes
 * the first just deleted. Every object is asked about, a pointer row's included — it owns no bytes,
 * its keeper still names the pathname, and the answer is `'shared'`. `deleteNinaAvatarAction` skips
 * that question as a measured optimisation over hundreds of album objects; a bubble holds a
 * handful, and `deleteNinaChatPhoto`'s unconditional ask is the closer sibling.
 *
 * None of step 3 can fail the delete. `releaseBlobIfUnreferenced` catches both its reference check
 * and its `del`, logging `'shared'` and `'failed'` itself, so no path through it rejects — and the
 * message is already gone by then. Reporting `'failed'` for a message that WAS deleted is the one
 * genuinely wrong outcome available here.
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
    /* STEP 1 — while the rows below still link their dependents. Never throws; see the header. */
    if (images.length > 0) {
      await promoteNinaImageDependents(
        userId,
        images.map((image) => image.id),
      )
    }

    /* STEP 2 — the message, and its image rows with it, in one transaction. */
    const removed = await deleteNinaMessage(userId, input.messageId)
    if (removed === null) return { ok: false, deletedId: null, reason: 'not-found' }

    /* STEP 3 — the bytes, one question per object, and only where nothing else names them. The
     * rows that pointed at these objects are gone as of the statement above, which is what makes
     * the question answerable; two rows naming one pathname are one object and one question. */
    const objects = new Map(images.map((image) => [image.pathname, image.blobUrl]))
    for (const [pathname, blobUrl] of objects) {
      await releaseBlobIfUnreferenced(userId, { blobUrl, pathname })
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
