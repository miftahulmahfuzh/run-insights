'use server'

import { revalidatePath } from 'next/cache'

import { sendNinaMessage, type SendNinaMessageResult } from './actions'
import { SESSION_PARAM } from './active'
import { NINA_ATTACH_MAX_CHARS } from './album'
import { releaseBlobIfUnreferenced } from './blobRelease'
import { deleteNinaMessageImage, getNinaMessageImage } from './queries'
import { createNinaChatSession } from './sessionActions'
import { requireUserId } from '@/lib/auth/requireUserId'
import { isValidId } from '@/lib/id'

/**
 * "Attach to chat", from the album's zoomed-photo state — F33 R26; the two targets are the strip's
 * two icon sends (photo-send-chat-icons R1/R2).
 *
 * ── WHY THIS FILE EXISTS AT ALL, GIVEN IT IS ONE CALL ─────────────────────────────────────────
 * Isolation. `lib/nina/actions.ts` is phase 3's file and phases 5, 6, 12 and 13 all edit it; the
 * album importing from here instead means the only thing this phase asks of that file is one
 * optional input field and one word of tool set. If the reconciler moves `sendNinaMessage`, this
 * is the single call site that follows it.
 *
 * ── TWO TARGETS, ONE ACTION ───────────────────────────────────────────────────────────────────
 * `target: 'recent'` is the send that shipped with R26 and stays byte-identical on the server:
 * `sessionId: null`, so `sendNinaMessage`'s own resolution — his most recently active
 * conversation, created if he has none (assumption A3) — picks the destination. `target: 'new'`
 * is the second icon: the photo must land in a conversation with no prior content, and the
 * sanctioned way to get one is the sidebar rail's own `createNinaChatSession` — eager, and
 * reusing the newest EMPTY session rather than minting a second one (its recorded anti-litter
 * rule; an empty newest session IS the new chat, which is the plan index's reading of "always a
 * new chat session"). Calling it from here is a plain server-side call between two `'use server'`
 * modules: `requireUserId` runs a second time for the same user, and its create branch's
 * `revalidatePath('/nina')` is harmless — the caller refreshes anyway.
 *
 * Anything that is not `'new'` reads as `'recent'`: a value this file does not recognise
 * coalesces to the behaviour that shipped first rather than inventing a third one, which is
 * `setNinaChatSessionPinned`'s posture to a boolean from the same boundary.
 *
 * ── WHY THE DESTINATION COMES BACK AS `next` ──────────────────────────────────────────────────
 * `sendNinaMessage` already returns `sessionId` (F36 R6), and THAT id — not the caller's claim,
 * not the id the create minted — is where the row actually landed, ownership re-proved on the
 * way in. The URL is built here from it, on the server, for the reason `NewChatButton` records
 * for `next`: which URL opens a conversation is the server's rule, decided from an id it proved.
 * For `target: 'new'` the string equals the `next` `createNinaChatSession` returned by
 * construction — same `SESSION_PARAM`, same id — but the copy that ships is spelled from the
 * landed id, which is what lets the rule below be absolute: `next` is null iff `!ok`, so a
 * refused send can never navigate anywhere.
 *
 * ── THE ONE COST OF 'new', STATED RATHER THAN DISCOVERED ──────────────────────────────────────
 * The session is created BEFORE the send, because the send has to name it. So a send that then
 * REFUSES — the photograph is no longer his, mostly — leaves the created-or-reused empty session
 * behind. That is the same state one tap of the sidebar's `+` leaves; it is deletable from the
 * list (R11); and the reuse branch means a retry of the same button re-enters THAT session rather
 * than minting another. Ordering it the other way would need a send that can name a session that
 * does not exist yet, which is `sendNinaMessage`'s refusal case, not a capability.
 *
 * ── WHY THERE IS NO REVEAL ANIMATION ON THIS PATH ─────────────────────────────────────────────
 * `ChatScreen`'s staggered reveal (RU-5) is for bubbles arriving while he is watching the
 * conversation. Here he is on `/nina/about`, and the WhatsApp behaviour he described is that
 * attaching takes you to the chat. So the action persists everything and the caller navigates:
 * `/nina` is a Server Component reading `listNinaMessages`, so her reply is simply there when it
 * paints, with no client state to hand across a route change.
 *
 * ── AND WHY `unavailable` IS GONE (F36 R6) ────────────────────────────────────────────────────
 * `sendNinaMessage` no longer waits for the model, so at the moment this returns there is no
 * answer to the question "could she reply". The field could only ever have been `false`. What the
 * caller does instead is unchanged and was already right: it navigates to the conversation that
 * received the photo, whose Server Component reads `listNinaMessages` — so his photo is on screen
 * immediately, and her reply appears through `ChatScreen`'s poll, which that page starts because
 * the newest row is his.
 *
 * ── WHY THE CLAMP IS IMPORTED AND NOT DECLARED ────────────────────────────────────────────────
 * A `'use server'` module may export only async functions, so `NINA_ATTACH_MAX_CHARS` cannot be a
 * `const` in this file. It lives in `lib/nina/album.ts`, which is the pure module the screen
 * already imports for its `maxLength` — so the input's cap and the server's clamp are one number,
 * which is the only arrangement in which they cannot disagree. `SESSION_PARAM` imports the same
 * way for the same reason: `lib/nina/active.ts` is the pure module that owns the parameter's name.
 */

/** Which conversation receives the photo — the strip's two icons, in row order. */
export type NinaAttachTarget = 'recent' | 'new'

export interface NinaAttachInput {
  kind: 'avatar' | 'image'
  id: string
  /** May be empty — a text-free attach is a valid send, exactly as phase 8's run attachment is. */
  body: string
  /**
   * Which button fired. **Required, so `tsc` is the thing that notices a caller that forgot to
   * decide** — the required-nullable shape `sendNinaMessage` gives `sessionId`. There is no
   * default: which conversation receives the photo is the whole question the two icons exist to
   * answer, and a silent default would answer it wrong exactly once, invisibly.
   */
  target: NinaAttachTarget
}

export interface NinaAttachResult {
  ok: boolean
  userMessageId: string | null
  /**
   * The conversation the photograph actually landed in — `sendNinaMessage`'s own answer, null iff
   * `!ok`. `target: 'new'` lands in the session `createNinaChatSession` minted or reused;
   * `target: 'recent'` lands wherever the `sessionId: null` resolution pointed.
   */
  sessionId: string | null
  /**
   * The ready-to-push destination, `/nina?${SESSION_PARAM}=<sessionId>` — null iff `!ok`. The
   * caller pushes THIS and never spells a URL of its own, so the screen cannot drift from the
   * page's parameter grammar.
   */
  next: string | null
}

const REFUSED: NinaAttachResult = { ok: false, userMessageId: null, sessionId: null, next: null }

export async function attachNinaPhotoToChat(input: NinaAttachInput): Promise<NinaAttachResult> {
  const body = input.body.trim().slice(0, NINA_ATTACH_MAX_CHARS)
  const attachExisting = { kind: input.kind, id: input.id }

  let result: SendNinaMessageResult
  if (input.target === 'new') {
    /* The eager create FIRST: the send has to name the session, so the session has to exist. What
     * comes back is either a freshly minted id or the newest empty session's — "always a new chat
     * session" reads as "never a conversation that already has content", and that is exactly what
     * the reuse branch returns. */
    const created = await createNinaChatSession()
    if (!created.ok || created.sessionId === null) return REFUSED
    result = await sendNinaMessage({
      body,
      attachExisting,
      /* EXPLICIT, and the whole point of the button: `null` would re-resolve to his most recent,
       * which is the conversation he was possibly trying to leave. */
      sessionId: created.sessionId,
    })
  } else {
    result = await sendNinaMessage({
      body,
      attachExisting,
      /*
       * F35 phase 3 (R2). `null`, and it is the right answer rather than a placeholder: he is on
       * `/nina/about` with the album open, there is no session in view, and "no session in view"
       * resolves to his most recent conversation (assumption A3). The caller then navigates to
       * `/nina?${SESSION_PARAM}=<that id>` — the SAME session by that resolution — so the photo he
       * just sent is on the screen he lands on. Naming a session here would mean the album knowing
       * about a parameter that belongs to the chat. R1 keeps this branch byte-identical to what
       * shipped: same field values, same resolution; only the caller's URL gained the explicit id.
       */
      sessionId: null,
    })
  }

  if (!result.ok || result.sessionId === null) return REFUSED
  return {
    ok: true,
    userMessageId: result.userMessageId,
    sessionId: result.sessionId,
    next: `/nina?${SESSION_PARAM}=${result.sessionId}`,
  }
}

/**
 * Delete one of HIS photographs, from the Media viewer's own delete control — the row and, when
 * nothing else needs them, the Blob bytes the ask ("user bisa menghapus foto nya sendiri, dan
 * tidak memenuhi-memuhi storage di production") is really about.
 *
 * ── WHY THIS FILE, AND WHY THE ACTION IS THIS SMALL ───────────────────────────────────────────
 * Isolation, the same reason `attachNinaPhotoToChat` above gives: `lib/nina/actions.ts` is another
 * phase's file, and this is the screen's own action module. The rule worth the storage — "row
 * first, blob second, and only if nothing else points at it" — is not re-implemented here at all;
 * it is `releaseBlobIfUnreferenced` (`lib/nina/blobRelease.ts`), the ONE shared implementation the
 * admin surface already deletes through. An action that copies a delete rule is how the copy
 * becomes the one that forgot the check.
 *
 * ── ONLY HIS PHOTOGRAPHS, AND THE GUARD IS THE PRODUCT RULE ───────────────────────────────────
 * `kind === 'generated'` is refused: hers are the operator's collection (`/admin/photos`), whose
 * Remove already carries the carrier-message logic a generated row needs. The Media grid shows her
 * photographs too, so the CLIENT hides the control on them — but a hidden control is not an
 * authorization, and a hand-typed claim for one of her rows lands here and is refused, exactly as
 * the admin actions refuse a stale link rather than degrade.
 *
 * ── THE BUBBLE IS NOT TOUCHED, AND THAT IS A RECORDED RULE ────────────────────────────────────
 * `removeChatPhotoAction`'s header argues it twice: the photo path must NOT delete a runner
 * message, because the message is his and may carry his text (the R26 re-attach path writes rows
 * like these onto messages that are mostly words). His uploads attach to HIS rows
 * (`lib/nina/actions.ts` STEP 1b) and `isNinaPhotoCarrierMessage` is false for every one of them,
 * so there is no photo-only-carrier case to handle and none is handled. A bubble left empty by the
 * removal of its last photograph still has its own delete, in the chat's message menu.
 *
 * ── NO CONFIRMATION, NO REASON FIELD, ON PURPOSE ──────────────────────────────────────────────
 * The runner's own recorded overrule — "remove the confirmation message when user delete his own
 * message" — is a posture, not a paragraph, and a destructive control that ships with a dialog
 * re-litigates it one tap at a time. And the refusal shape is `{ ok: false }` without a reason,
 * `attachNinaPhotoToChat`'s shape: every refusal path on this screen shows the same sentence,
 * because "not his" and "not there" are deliberately indistinguishable across this boundary
 * (`getNinaMessageImage`'s standing rule), and which one it was is worth a log line, not a field a
 * client can render.
 *
 * ── WHY `revalidatePath` HERE WHEN `messageActions.ts` REFUSES ONE ────────────────────────────
 * `removeNinaMessage` patches client state from the return value because `ChatScreen` owns the
 * list it renders. This screen's Media grid is props from a Server Component — there is no client
 * copy to patch, so the refresh must reach the server render, and
 * `revalidatePath('/nina/about')` is what turns `router.refresh()` into a fresh read rather than a
 * replay of the router cache.
 */
export async function deleteNinaChatPhoto(input: { id: string }): Promise<{ ok: boolean }> {
  const userId = await requireUserId()

  /* Shape before ownership: an id that cannot be one of ours never reaches the database, and the
   * read below is the only query this refusal spends nothing on. */
  if (!isValidId(input?.id)) return { ok: false }

  const row = await getNinaMessageImage(userId, input.id)
  if (row == null) return { ok: false }
  if (row.kind === 'generated') return { ok: false }

  const deleted = await deleteNinaMessageImage(userId, input.id)
  if (deleted == null) return { ok: false }

  /* The row is gone; the row's own return value is the reference handed to the release, so the
   * bytes leave the store unless another row — a re-attach copy, her album — still points at them.
   * `'shared'` and `'failed'` are logged there and are NOT failures here: the ask was the
   * photograph's removal from the collection, and that happened. */
  await releaseBlobIfUnreferenced(userId, { blobUrl: deleted.blobUrl, pathname: deleted.pathname })

  revalidatePath('/nina/about')
  return { ok: true }
}
