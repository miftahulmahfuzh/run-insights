'use client'

import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react'

import { sendNinaMessage } from '@/lib/nina/actions'
import { todayInJakarta } from '@/lib/date/ranges'
import type { NinaExistingPhoto, RunAttachment } from '@/lib/nina/attach'
import type { QuoteView } from '@/lib/nina/reply'

import type { ComposerDraftImage } from './Composer'
import type { Notice } from './chatScreenCopy'
import type { ChatMessage } from './types'

/**
 * The resolved input one send runs with — the typed send's draft plus the composer arms, or a
 * retry's row contents. `useMessageActions`'s retry passes the same shape so the typed send and
 * the retry cannot drift into two send paths.
 */
export type SendAndTrackInput = {
  body: string
  images: readonly ComposerDraftImage[]
  replyToMessageId: string | null
  runAttachment: RunAttachment | null
  existingPhoto: NinaExistingPhoto | null
  /**
   * The failed row a retry replaces, IN PLACE — a retried message keeps its position in the
   * conversation and its day divider, because it is the same message tried again, not a new
   * one at the bottom of a conversation that has moved on. Null appends, which is what a
   * typed send is.
   */
  replacesId: string | null
  dayISO: string
}

/**
 * The send: the optimistic row, the busy window, the failure marking and the id adoption.
 *
 * `sendAndTrack` is factored out of `handleSend` (and was out of the screen before this file
 * existed) so a RETRY of a failed row runs byte-for-byte the same path a typed send does rather
 * than a second copy of it drifting — the failure marking and the id adoption are the halves a
 * copy would get subtly wrong, and both are what makes a retried row behave identically to a fresh
 * one afterwards (the poll, a quote, the actions sheet).
 *
 * What it deliberately does NOT own is the composer's armed state. Unpinning a reply chip, a run
 * chip or a pinned album photo is right for a typed send — the optimistic row now carries them —
 * and wrong for a retry, which must leave whatever is armed NOW alone: a runner can be mid-draft
 * on his next message while he retries the last one. `handleSend` unpins through the setters the
 * screen passes in; the retry path (on the actions sheet) never touches them.
 */
export function useNinaSend({
  sessionId,
  setMessages,
  setNotice,
  adoptSession,
  takeCursor,
  beginAwaiting,
  endTurn,
  draftQuote,
  setDraftQuote,
  attachment,
  setAttachment,
  photo,
  setPhoto,
}: {
  /** F35 R2. The conversation the send joins; `null` passes through — the action resolves-or-creates. */
  sessionId: string | null
  /** The conversation list the optimistic row joins, and the failed/confirmed marks land on. */
  setMessages: Dispatch<SetStateAction<ChatMessage[]>>
  setNotice: (notice: Notice | null) => void
  /** The arrival machinery the send drives once the action answers — see `useTurnArrival`. */
  adoptSession: (adopted: string | null) => void
  takeCursor: (seq: number | null) => void
  beginAwaiting: () => void
  endTurn: () => void
  /** The armed reply, read once by `handleSend` and unpinned the moment it joins the row. */
  draftQuote: QuoteView | null
  setDraftQuote: Dispatch<SetStateAction<QuoteView | null>>
  /** The armed run attachment, same shape as the reply. */
  attachment: RunAttachment | null
  setAttachment: Dispatch<SetStateAction<RunAttachment | null>>
  /** The armed album photo, same shape as the reply. */
  photo: NinaExistingPhoto | null
  setPhoto: Dispatch<SetStateAction<NinaExistingPhoto | null>>
}) {
  const [busy, setBusy] = useState(false)

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

  const sendAndTrack = useCallback(
    async (input: SendAndTrackInput): Promise<boolean> => {
      /*
       * The client half of RULING B1's ONE refusal rule, restated against the resolved input — the
       * same four disjuncts `sendNinaMessage` checks, in the same order. A retry re-runs it because
       * a failed row can legitimately be run-only (R13: a run with no words is a message) and this
       * guard must not be the thing that refuses it.
       */
      if (
        input.body.length === 0 &&
        input.images.length === 0 &&
        input.runAttachment === null &&
        input.existingPhoto === null
      ) {
        return false
      }

      const body = input.body
      const localId = `local-${crypto.randomUUID()}`
      setNotice(null)
      /*
       * Bubble order, client and server, is the same three-part order: the fresh uploads he
       * picked, then the tiles the pre-check deduplicated (each a reference the server writes
       * after the originals, at `sortOrder: images.length + position`), then the pinned album
       * photo, which keeps the LAST position it has always had. One array, so the optimistic
       * bubble and every later server render of the same message agree about the order inside it.
       * Already on the CDN in every case — the describe pre-pass uploaded the picked ones before
       * send was possible, and the deduplicated and pinned ones have been in Blob since their
       * first upload — so there is no object URL to revoke and no flicker when the real row lands.
       */
      const uploads = input.images.filter(
        (image): image is Extract<ComposerDraftImage, { source: 'upload' }> =>
          image.source === 'upload',
      )
      const deduped = input.images.filter(
        (image): image is Extract<ComposerDraftImage, { source: 'deduped' }> =>
          image.source === 'deduped',
      )
      const optimisticUrls = [
        ...uploads.map((image) => image.url),
        ...deduped.map((image) => image.url),
        ...(input.existingPhoto === null ? [] : [input.existingPhoto.url]),
      ]
      setMessages((current) => {
        const row: ChatMessage = {
          id: localId,
          role: 'user',
          body,
          dayISO: input.dayISO,
          state: 'sending',
          replyToId: input.replyToMessageId,
          imageUrls: optimisticUrls.length > 0 ? optimisticUrls : undefined,
          /* R13. The card renders from client state on this row and from `nina_messages.run_id` on
           * every later load; both go through the same `RunAttachment`, so there is no lag and no
           * second shape. */
          attachment: input.runAttachment,
        }
        if (input.replacesId !== null) {
          return current.map((m) => (m.id === input.replacesId ? row : m))
        }
        return [...current, row]
      })
      /* No typing indicator here (F36 R6): `awaiting` drives it from the moment the action
       * RETURNS, and raising it before the round trip would show Nina typing in response to a
       * message that had not been accepted yet. */
      setBusy(true)

      let result: Awaited<ReturnType<typeof sendNinaMessage>> | null = null
      try {
        result = await sendNinaMessage({
          body,
          imageTickets: uploads.map((image) => image.ticket),
          /*
           * media-dedupe P2. The hash of the exact bytes behind each ticket, keyed by the STORED
           * pathname the ticket itself carries — so the pairing survives the server's
           * dedupe-by-pathname in STEP 0 whatever order the claims arrive in. A claim with no
           * entry dedups as NULL (inactive), which is the honest state for a hash that could not
           * be computed.
           */
          contentHashes: Object.fromEntries(
            uploads.flatMap((image): Array<[string, string]> =>
              image.contentHash === null ? [] : [[image.pathname, image.contentHash]],
            ),
          ),
          /*
           * media-dedupe P2. Tiles whose bytes the pre-check proved are already in the
           * collection: ids, never URLs — `resolveAttachment` proves ownership before a row is
           * written, exactly as it does for the pinned album photo below. The `url` this hook
           * holds is for the optimistic bubble; it is not sent.
           */
          dedupedImageIds: deduped.map((image) => image.imageId),
          replyToMessageId: input.replyToMessageId,
          runId: input.runAttachment?.runId ?? null,
          /*
           * F34 R2, and the whole of "we dont actually reupload the photo into the chat, but just
           * some kind of pointer to the existing file". An id and a kind, never a URL: the field
           * has existed since F33 phase 13 and `resolveAttachment` proves ownership against
           * `user_id` before a row is written, which is strictly more than a signed ticket could
           * prove. The `url` this hook holds is for the chip and for the optimistic bubble;
           * it is not sent, and a tampered one buys nothing.
           */
          attachExisting:
            input.existingPhoto === null
              ? null
              : { kind: input.existingPhoto.kind, id: input.existingPhoto.id },
          /*
           * F35 R2. The conversation this message joins. Read from the prop rather than from the
           * URL, because the server already proved this session is his — re-reading `?s=` here
           * would re-introduce an untrusted claim the page has already resolved. `null` passes
           * through deliberately: it means he has no sessions, and the action resolves-or-creates;
           * refusing on the client instead would leave the composer enabled with nowhere to send.
           */
          sessionId,
        })
      } catch {
        result = null
      }
      if (!alive.current) return false

      /*
       * **`busy` is released HERE (F36 R6).** It used to be held for the whole 13-45 s turn, and
       * that is the grey composer R6 is about. The action's own round trip is one insert and one
       * conditional insert, so this is well under a second and the Send button is live again while
       * she is still answering — which is what WhatsApp does. The server's claim on `nina_turns` is
       * what stops the next message becoming a second concurrent model call.
       */
      setBusy(false)

      if (result === null || !result.ok) {
        endTurn()
        setMessages((current) =>
          current.map((m) => (m.id === localId ? { ...m, state: 'failed' } : m)),
        )
        setNotice('send-failed')
        return false
      }

      // Adopt the server's id for the runner's own row, so a quote can name it and the actions
      // sheet can act on it. Until this point it carried a client-minted `local-` id.
      const confirmedId = result.userMessageId
      setMessages((current) =>
        current.map((m) =>
          m.id === localId ? { ...m, id: confirmedId ?? m.id, state: 'sent' } : m,
        ),
      )

      /*
       * The three things the poll needs, all of them facts the server just established, driven
       * through `useTurnArrival`'s verbs.
       *
       * The session is adopted because the prop may have been `null` — "he has no sessions at
       * all" is a real state and the ACTION resolves or creates one. The cursor is his row's
       * `seq`, so the first poll asks for everything strictly after his own message. `awaiting`
       * goes true unconditionally on a successful send, INCLUDING when `result.turnId` is null: a
       * null turn id means a turn was already running and will chain onto this message, so
       * something is very much still coming.
       */
      adoptSession(result.sessionId)
      takeCursor(result.cursor)
      beginAwaiting()
      return true
    },
    [sessionId, setMessages, setNotice, adoptSession, takeCursor, beginAwaiting, endTurn],
  )

  const handleSend = useCallback(
    async (draft: { body: string; images: readonly ComposerDraftImage[] }) => {
      if (busy) return
      /* R13's floor, and the client half of RULING B1's ONE refusal rule: a message with no words,
       * no photo, no run and no pinned album photo is a mis-tap. `canSend` already refuses it; this
       * is the guard that means the action can trust its own input. The four disjuncts here are the
       * same four `sendNinaMessage` checks, in the same order, and they must stay that way — a
       * fifth on one side only is an enabled Send button that silently refuses. */
      if (
        draft.body.length === 0 &&
        draft.images.length === 0 &&
        attachment === null &&
        photo === null
      ) {
        return
      }

      /* Read once, then unpinned below — the same shape `draftQuote` uses, and for the same
       * reason: the optimistic row has to carry what the action will persist. */
      const replyToMessageId = draftQuote?.targetId ?? null
      setDraftQuote(null)
      /*
       * Unpinned the moment it joins the conversation, even though the send may still fail. The
       * failed bubble keeps its card — that is where the run is now — and showing the chip as well
       * would put the same run on screen twice and invite a second send of it.
       */
      setAttachment(null)
      /* The same argument, and it is stronger here: the photo is in the album either way, so a
       * chip left armed after a failed send is an invitation to attach it twice. */
      setPhoto(null)
      await sendAndTrack({
        body: draft.body,
        images: draft.images,
        replyToMessageId,
        runAttachment: attachment,
        existingPhoto: photo,
        replacesId: null,
        dayISO: todayInJakarta(),
      })
    },
    [busy, draftQuote, attachment, photo, sendAndTrack, setDraftQuote, setAttachment, setPhoto],
  )

  return { busy, handleSend, sendAndTrack }
}
