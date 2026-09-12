'use client'

import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react'

import { isValidId } from '@/lib/id'
import { resendNinaMessage } from '@/lib/nina/actions'
import {
  applyMessageDeletion,
  applyMessageEdit,
  canActOnMessage,
  type EditTarget,
} from '@/lib/nina/edit'
import { editNinaMessage, removeNinaMessage } from '@/lib/nina/messageActions'
import type { QuoteView } from '@/lib/nina/reply'

import { RESEND_REFUSAL_TEXT, type Notice } from './chatScreenCopy'
import type { SendAndTrackInput } from './useNinaSend'
import type { ChatMessage } from './types'

/**
 * R8's surface: the message whose actions sheet is open, and the five gestures the sheet offers —
 * open, edit, delete, resend, retry. Everything here returns a fact the sheet reacts to (did the
 * write happen; what sentence to show) rather than touching the sheet itself; the copy is
 * `chatScreenCopy`'s, and the conversation list, the notice strip, the armed reply and the landing
 * tint are patched through the setters the screen passes in.
 */
export function useMessageActions({
  setMessages,
  setNotice,
  setDraftQuote,
  clearFlashId,
  busy,
  sendAndTrack,
  raiseCursor,
  beginAwaiting,
}: {
  /** The conversation list an edit rewrites and a delete removes from. */
  setMessages: Dispatch<SetStateAction<ChatMessage[]>>
  setNotice: (notice: Notice | null) => void
  /** A delete un-arms the reply strip if it pointed at the deleted row. */
  setDraftQuote: Dispatch<SetStateAction<QuoteView | null>>
  /** A delete also drops the landing tint if it named the deleted row — see `useQuoteLanding`. */
  clearFlashId: (targetId: string) => void
  /** The send's action window; a retry is refused while one is in flight. */
  busy: boolean
  /** The retry runs the SAME send path a typed send runs, with `replacesId` set. */
  sendAndTrack: (input: SendAndTrackInput) => Promise<boolean>
  /** The resend's cursor is taken as a maximum — see `useTurnArrival`. */
  raiseCursor: (seq: number | null) => void
  /** A claimed resend re-starts the arrival loop — the whole UI a resend produces. */
  beginAwaiting: () => void
}) {
  const [acting, setActing] = useState<ChatMessage | null>(null)

  // Reads of this flag happen only after an `await`, where the component may already be gone;
  // see the owners' shared reasoning on `ChatScreen`. A `useRef` created HERE — not a flag
  // returned by a custom hook — is what keeps both react-hooks rules content.
  const alive = useRef(true)
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])

  /**
   * R8, arming. The gesture (or the focus-revealed button) picked a message; decide whether it can
   * be acted on at all, and open the sheet if it can.
   *
   * `canActOnMessage` is the gate and it is in `lib/`, because "which messages are editable" is a
   * rule with two real exclusions — an optimistic row whose id is client-minted, and a row whose
   * send threw — and both of them are states this screen produces and no other screen does. A
   * refusal here is a NOTICE rather than silence: the runner performed a deliberate gesture and a
   * gesture that does nothing reads as a broken screen.
   */
  const handleRequestActions = useCallback(
    (message: ChatMessage) => {
      /* A FAILED own row opens the sheet as a retry surface rather than being refused. The gate
       * below lumps it with 'sending' rows (neither is confirmed), and the notice it answers with —
       * "nothing to edit until Nina has it" — is true of EDIT and false of RETRY, which is the
       * thing the owner was actually reaching for on a red-outlined bubble. A row still in
       * 'sending' keeps the notice: its send is in flight, and offering a retry of an in-flight
       * send is how two sends of one message happen. */
      if (message.role === 'user' && message.state === 'failed') {
        setNotice(null)
        setActing(message)
        return
      }
      const target: EditTarget = {
        id: message.id,
        mine: message.role === 'user',
        body: message.body,
        hasImage: (message.imageUrls?.length ?? 0) > 0,
        hasRun: message.attachment != null,
        confirmed: message.state === 'sent',
      }
      if (!canActOnMessage(target)) {
        setNotice('edit-unavailable')
        return
      }
      setNotice(null)
      setActing(message)
    },
    [setNotice],
  )

  /**
   * R8, editing. Returns true when the row was written, which is the sheet's cue to close.
   *
   * ── THE LIST IS PATCHED FROM THE RETURN VALUE, AND NOT BY A REFRESH ───────────────────────────
   * The screen's header explains why it does not `router.refresh()` after a send. An edit has a
   * second, sharper reason: `mergeServerMessages` is "server order, LOCAL content", so for any id
   * the screen already holds, the local copy WINS over the server's. A refresh literally cannot
   * deliver an edited body — it would re-render the page and then be discarded. So the action
   * returns the canonical text and it is mapped onto local state here, exactly as the send adopts
   * `result.userMessageId`. Two mechanisms, not three.
   *
   * `applyMessageEdit` returns the same array reference when nothing changed, so the `'unchanged'`
   * case costs no render.
   */
  const handleEditMessage = useCallback(
    async (id: string, body: string): Promise<boolean> => {
      let result: Awaited<ReturnType<typeof editNinaMessage>> | null = null
      try {
        result = await editNinaMessage({ messageId: id, body })
      } catch {
        result = null
      }
      if (!alive.current) return false

      if (result === null || !result.ok || result.body === null) {
        setNotice('edit-failed')
        return false
      }

      const written = result.body
      setNotice(null)
      setMessages((current) => applyMessageEdit(current, id, written) as ChatMessage[])
      return true
    },
    [setMessages, setNotice],
  )

  /**
   * R8, deleting. Returns true when the row is gone.
   *
   * `applyMessageDeletion` does both halves in one pass: it drops the row AND nulls every
   * `replyToId` that pointed at it — which is the client-side expression of the database's
   * `ON DELETE SET NULL` on `nina_messages.reply_to_id`. Without the second half the screen would
   * still look right (`resolveQuote` resolves against the rows on screen, and the target is gone),
   * but the local rows would carry a pointer the database no longer has, and `mergeServerMessages`
   * keeps local content — so that stale pointer would survive every later refresh.
   *
   * A quote whose target was deleted therefore renders as a plain message rather than throwing,
   * which `resolveQuote` documents as the designed outcome and which is this phase's exit test.
   */
  const handleDeleteMessage = useCallback(
    async (id: string): Promise<boolean> => {
      /* A client-minted `local-` id names a row the server has never heard of — a failed send, or
       * one still in flight. There is nothing to call: `removeNinaMessage` would refuse the id, and
       * the honest outcome of deleting a message that was never delivered is that it stops being on
       * screen. Local state only, same cleanup as the confirmed path. */
      if (!isValidId(id)) {
        setNotice(null)
        setMessages((current) => applyMessageDeletion(current, id) as ChatMessage[])
        setDraftQuote((current) => (current?.targetId === id ? null : current))
        clearFlashId(id)
        return true
      }

      let result: Awaited<ReturnType<typeof removeNinaMessage>> | null = null
      try {
        result = await removeNinaMessage({ messageId: id })
      } catch {
        result = null
      }
      if (!alive.current) return false

      if (result === null || !result.ok || result.deletedId === null) {
        setNotice('delete-failed')
        return false
      }

      const deletedId = result.deletedId
      setNotice(null)
      setMessages((current) => applyMessageDeletion(current, deletedId) as ChatMessage[])
      /* If the deleted message was the one a reply was armed against, the draft strip in the
       * composer now points at something that does not exist. Unpin it rather than let a send write
       * a `reply_to_id` the database would immediately null. */
      setDraftQuote((current) => (current?.targetId === deletedId ? null : current))
      /* Same argument for the landing tint: nothing left to flash. */
      clearFlashId(deletedId)
      return true
    },
    [setMessages, setNotice, setDraftQuote, clearFlashId],
  )

  /**
   * R5, resending. Resolves `null` when the turn was claimed — the sheet's cue to close — and
   * otherwise the sentence for the sheet to show.
   *
   * ── IT PRODUCES THE SAME AWAITING STATE A SEND PRODUCES, AND THAT IS THE WHOLE UI ─────────────
   * The send's last three calls — `adoptSession` / `takeCursor` / `beginAwaiting`, in
   * `useNinaSend` — are exactly the arrival machinery this phase reuses untouched: the arrival loop
   * starts on `awaiting`, `showTyping` raises the indicator, and `revealBubbles` runs `planReveal`
   * on whatever the poll returns. So a resend adds no poll, no timer and no second rhythm — it just
   * tells the shipped one that something is coming.
   *
   * `liveSessionId` is deliberately NOT adopted from the result: the message being resent is on
   * this screen, so it is in the conversation this screen is already polling. A resend cannot
   * create a session the way a first send can.
   *
   * The cursor is taken as a MAXIMUM — see `raiseCursor` on `useTurnArrival`.
   *
   * `setNotice(null)` matters more here than it looks: the notice on screen when he taps Resend is
   * almost always 'no-reply', which is exactly the sentence that sent him here. Leaving it up while
   * she is answering again would contradict the indicator.
   */
  const handleResendMessage = useCallback(
    async (id: string): Promise<string | null> => {
      let result: Awaited<ReturnType<typeof resendNinaMessage>> | null = null
      try {
        result = await resendNinaMessage({ messageId: id })
      } catch {
        result = null
      }
      if (!alive.current) return null

      if (result === null || !result.ok) {
        /* A thrown action has no reason to report, and 'failed' is what it means: the row is
         * untouched and one more tap is the whole recovery. */
        return RESEND_REFUSAL_TEXT[result?.reason ?? 'failed']
      }

      setNotice(null)
      raiseCursor(result.cursor)
      beginAwaiting()
      return null
    },
    [setNotice, raiseCursor, beginAwaiting],
  )

  /*
   * The RETRY of a failed send — not R5's resend, which is `handleResendMessage` above and acts on
   * a row that DID reach the server. The owner's report: a typed message failed (the red
   * hairline), and the actions sheet answered "there is nothing to edit until Nina has it" —
   * which was true of EDIT and false of RETRY, the thing he actually wanted.
   *
   * What a retry can honestly carry: the body, the reply pointer and the run card, because all
   * three are still on the row. What it cannot: the PHOTOS. Their tickets were signed server-side
   * by `describeNinaImage`, held in `Composer`'s tiles, and spent or lost the moment `submit()`
   * cleared them; a Blob URL is neither a ticket nor a re-attachable pointer — `attachExisting`
   * needs a `nina_message_images` id, and a failed send never wrote one. So a failed row with
   * photos is offered no retry at all rather than one that silently drops them, and the sheet says
   * so in words.
   */
  const handleRetrySendMessage = useCallback(async (): Promise<boolean> => {
    const row = acting
    if (row == null) return false
    if (busy) return false
    if (row.role !== 'user' || row.state !== 'failed') return false
    if ((row.imageUrls?.length ?? 0) > 0) return false
    return sendAndTrack({
      body: row.body,
      images: [],
      replyToMessageId: row.replyToId,
      runAttachment: row.attachment ?? null,
      existingPhoto: null,
      replacesId: row.id,
      dayISO: row.dayISO,
    })
  }, [acting, busy, sendAndTrack])

  /** The sheet's own close gesture. Remounting by `key` resets its draft; this only unsets. */
  const closeSheet = useCallback(() => setActing(null), [])

  return {
    acting,
    closeSheet,
    handleRequestActions,
    handleEditMessage,
    handleDeleteMessage,
    handleResendMessage,
    handleRetrySendMessage,
  }
}
