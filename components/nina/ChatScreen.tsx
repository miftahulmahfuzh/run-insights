'use client'

import { useCallback, useEffect, useLayoutEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

import { EmptyState } from '@/components/ui/EmptyState'
import { PhotoViewer } from '@/components/ui/PhotoViewer'
import {
  ATTACH_PARAM,
  PHOTO_PARAM,
  type NinaExistingPhoto,
  type RunAttachment,
} from '@/lib/nina/attach'
import { composerBottomCss, composerPadBottomCss } from '@/lib/nina/chatview'
import { SW_MESSAGE_TYPE, mergeServerMessages } from '@/lib/nina/live'
import { JOB_JUMP_PARAM } from '@/lib/nina/jobview'
import { buildQuote, type QuoteView } from '@/lib/nina/reply'
import { type NinaFlightView } from '@/lib/nina/turnflight'
import { ChatPhotoActions } from './ChatPhotoActions'
import { Composer } from './Composer'
import { NOTICE_TEXT, type Notice } from './chatScreenCopy'
import { KeyboardOverlapPublisher } from './KeyboardOverlapPublisher'
import { MessageActionsSheet } from './MessageActionsSheet'
import { MessageList } from './MessageList'
import type { ChatAvatar, ChatMessage } from './types'
import { useChatScrollMark } from './useChatScroll'
import { useMessageActions } from './useMessageActions'
import { useNinaSend } from './useNinaSend'
import { usePhotoViewer } from './usePhotoViewer'
import { COMPOSER_CLEARANCE_PX, useQuoteLanding } from './useQuoteLanding'
import { useTurnArrival } from './useTurnArrival'

/**
 * The interactive half of `/nina`: one turn, from the runner pressing send to Nina's last bubble.
 *
 * ── WHY THIS IS NOT INSIDE A TRANSITION ───────────────────────────────────────────────────────
 * Next 16's own interactive-apps guide is explicit that "inside a transition, `useState` setters
 * are deferred until the transition completes". A staggered reveal is a sequence of `setState`
 * calls separated by real time, so wrapping the turn in `startTransition` or `useActionState`
 * would batch all four bubbles to the end and deliver them in one frame — RU-5, inverted. For the
 * same reason the guide's `useOptimistic` pattern is wrong here: optimistic state is discarded
 * when the transition ends, and that is exactly the frame the first bubble is supposed to appear
 * in. Plain `useState` and a plain async handler are the correct tools, not the lazy ones.
 *
 * ── WHY NOTHING IS REFRESHED AFTERWARDS ───────────────────────────────────────────────────────
 * Phase 3 persists the runner's message and every bubble before the action returns, so a reload
 * renders exactly what is on screen. Calling `router.refresh()` would re-render the server list
 * underneath a reveal still in progress and make her bubbles blink out and back. The rows this
 * component appends are the same rows the server would send.
 *
 * ── WHY THE PAGE DID NOT AWAIT THE MODEL ──────────────────────────────────────────────────────
 * The same boundary that guards `getOrCreateInsight`, and now guards Nina's turn (invariant 4,
 * enforced by `scripts/check-llm-payload-boundary.mjs`): a turn is a 13-16 s model call. The page
 * renders the stored conversation from indexed reads, and the model is only ever reached from
 * here, on an event, after the screen is already useful. `components/insights/InsightTrigger.tsx`
 * is the same shape one interaction earlier.
 *
 * ── THE TWO FAILURE STATES, AND WHY NEITHER IS A FAKE NINA MESSAGE ────────────────────────────
 * A thrown or refused action is a send that did not happen. A turn that produced nothing — she
 * declined, the model was unavailable, or the background task died and the sweep closed it — is
 * learned from `pollNinaReply` returning `awaiting: false` with no new bubbles, because after the
 * split the action returns long before she has said anything. They are told apart because
 * they call for different things — try again, versus she has nothing to say. Neither is rendered
 * as a bubble. Putting app-authored words in her mouth would be the fabrication `lib/llm/narrate.ts`
 * refuses ("the only safe fallback for prose is the absence of prose"), and it would teach the
 * runner to distrust every other bubble on the screen. R22's in-character apology is a genuinely
 * different case — a *tool* failing mid-turn, which phase 12 owns, and where Nina really is the one
 * who should speak.
 *
 * ── WHAT THE SPLIT CHANGED, AND WHAT IT DELIBERATELY DID NOT (F36 R6) ─────────────────────────
 * `sendNinaMessage` no longer waits for the model. It persists his message and returns, so the
 * bubble goes `sent` on the ACTION'S RETURN rather than on Nina's reply — which is the whole of
 * R6's "i send the message, it quickly shown that the message is sent". Her bubbles arrive
 * afterwards, through `pollNinaReply`, and the staggered reveal above runs on ARRIVAL instead of on
 * return.
 *
 * **Every word of the transition argument above still holds, and the poll is why it holds harder.**
 * The reveal is still a sequence of `setState` calls separated by real time, so it is still outside
 * `startTransition` / `useActionState` / `useOptimistic` for exactly the reasons given — and the
 * arrival path had to be a poll returning DATA rather than a `router.refresh()`, precisely because
 * a refresh delivers all four bubbles through `mergeServerMessages` in one frame. See
 * `pollNinaReply`'s own header for the two reasons the push seam is not used here.
 *
 * **`busy` now covers the ACTION, not the turn.** It used to be held for the whole 13-45 s, which
 * is the grey state R6 is about. It is released the moment the action returns, so a second message
 * can be sent while she is still answering — WhatsApp's actual behaviour. The server's claim on
 * `nina_turns` is what stops that becoming a second concurrent model call.
 *
 * **The failure states are unchanged and neither is still a fake Nina message.** A thrown or
 * refused action is 'send-failed'. A turn that produced nothing — she declined, or the background
 * task died and the sweep closed it — is 'no-reply', raised by the poll rather than by the send.
 * Its existing copy is now more true than it was: his message really was persisted before the model
 * was called, and `loadNinaContext` reads the session window, so "send another and she will pick it
 * up" describes a mechanism rather than a hope.
 */

export function ChatScreen({
  initial,
  todayISO,
  userId,
  sessionId,
  pending,
  pendingPhoto,
  flight,
  avatar,
  flashBlinks,
}: {
  /** The stored conversation, oldest first, mapped on the server. */
  initial: readonly ChatMessage[]
  /** From the server, so "Today" cannot differ between render and hydration. */
  todayISO: string
  /**
   * Phase 6. Passed straight through to `Composer`, which needs it to build
   * `nina/<userId>/chat/<id>.jpg`. Not a secret and not a capability: `/api/upload` re-derives the
   * owner from the session and refuses any pathname that does not match it.
   */
  userId: string
  /**
   * **F35 R2. The conversation this screen is reading, and the one a send writes into.**
   *
   * Resolved on the server from `?s=` against an owner-scoped list, so by the time it is here it is
   * a session he owns — see `chooseActiveSession`. It is passed straight through to
   * `sendNinaMessage` and read by nothing else in this component; the screen does not need to know a
   * session's title, its pin state or its position in the list, and phase 5's sidebar is where all
   * three live.
   *
   * `null` means he has NO sessions at all — a runner who has never messaged, or R11's runner who
   * just removed his last one. The send carries the `null` through, and the ACTION resolves it (or
   * creates a session), because a render must not write. Nothing on this screen branches on it:
   * `messages` is `[]` in that state, so the existing `EmptyState` already renders.
   *
   * REQUIRED rather than optional, on RULING E2b's habit and the same reasoning `pendingPhoto`
   * carries: `app/nina/page.tsx` is the one caller and `tsc` should be the thing that notices if it
   * stops passing it. An optional prop defaulting to `null` would turn a broken route into a chat
   * that quietly wrote every message into whichever session happened to be newest.
   *
   * **`app/nina/page.tsx` also keys this component on it** (`key={activeSessionId ?? 'none'}`), so a
   * session switch remounts rather than merging the previous conversation's local state into this
   * one. That key is not decoration — see the comment at the call site.
   */
  sessionId: string | null
  /**
   * Phase 8 (R13). The run `/r/[id]`'s icon just handed over, resolved and formatted on the server
   * from `?attach=<runId>`, or null. It becomes composer state immediately — see the cleanup
   * below.
   */
  pending: RunAttachment | null
  /**
   * F34 R2. The album photo `/admin/nina` handed over on `?photo=avatar:<id>`, resolved
   * OWNER-SCOPED on the server to `{ kind, id, url }`, or null. It becomes composer state
   * immediately, exactly as `pending` does, and it is cleared off the URL by the same effect.
   *
   * REQUIRED rather than optional, on RULING E2b's habit: `app/nina/page.tsx` is the one caller,
   * and `tsc` should be the thing that notices if it stops passing it — an optional prop that
   * silently defaults to `null` would turn a broken deep link into a composer that just never arms
   * and never says why.
   *
   * The `url` is all the client gets. `description` stays on the server, where the send copies it
   * onto the new row (invariant 5).
   */
  pendingPhoto: NinaExistingPhoto | null
  /**
   * **F36 R6. Whether a turn is already in flight when this screen mounts, and where the poll
   * resumes from.**
   *
   * Computed on the server by `ninaFlightView` from the rows `app/nina/page.tsx` has ALREADY read
   * plus the session's pending `nina_turns` claim — the same indexed read the poll itself makes.
   *
   * It is what makes "the app does not care whether user close the app" true for the case that
   * actually happens: he sends, locks his phone, comes back forty seconds later. Without it the
   * reopened screen would show his message with no indicator and no poll, and her reply would only
   * appear if he happened to reload again. With it, the screen mounts already awaiting.
   *
   * `awaiting` is the POLL'S OWN disjunct — a fresh live claim OR "the newest row is his and it is
   * younger than `NINA_TURN_STALE_MS`" — so a turn honestly still running past the 90 s window (a
   * chained burst runs to ~210 s) starts the poll on a cold load, and a dead turn (claim swept,
   * message old) starts nothing. The first poll's answer remains authoritative and corrects either
   * seed inside two seconds.
   *
   * REQUIRED rather than optional, on RULING E2b's habit and for the reason `sessionId` and
   * `pendingPhoto` are: `app/nina/page.tsx` is the one caller and `tsc` should be what notices if
   * it stops passing it. An optional prop defaulting to "not awaiting" would turn a broken page
   * into a chat that silently never polled.
   */
  flight: NinaFlightView
  /**
   * **R1. Her face as the profile settings currently have it** — the current album row's blob URL,
   * its natural size, and its saved crop triple; or the committed `/nina/avatar-001.png` with a
   * null crop when there is no album row.
   *
   * Resolved on the server by `ninaAvatarView(getCurrentNinaAvatar(userId))` — the SAME call whose
   * result `app/nina/page.tsx` hands to `<NinaSidebar>`, which is the whole point: the 28 px
   * circle beside the typing dots and the 44 px circle in the sidebar read one row and therefore
   * cannot show two different faces or two different framings.
   *
   * This screen renders no avatar itself. The prop exists to reach `TypingIndicator` through
   * `MessageList`, and it stops there.
   *
   * `description` is NOT part of the shape (`ChatAvatar` omits it) and the call site destructures
   * field by field, so `glm-4.6v`'s private prose cannot ride into a client component — invariant
   * 5, the same care `pendingPhoto` takes above.
   *
   * REQUIRED rather than optional, on RULING E2b's habit and for the reason `sessionId`,
   * `pendingPhoto` and `flight` are: `app/nina/page.tsx` is the one caller and `tsc` should be what
   * notices if it stops passing it. An optional prop defaulting to the fallback is exactly how the
   * typing row came to ignore the album for as long as it did.
   */
  avatar: ChatAvatar
  /**
   * **How many times the landing flash blinks** — resolved on the server by `flashBlinkCount`
   * from `process.env.NINA_FLASH_BLINKS` (the owner's Vercel tuning knob, 2026-09-09: "bikin
   * jadi vercel env aja biar tuning nilainya gampang"). This screen does not render it; it
   * reaches the bubbles two ways, and both are here so neither can drift: as
   * `--nina-flash-count` through `MessageList` (the keyframe's iteration count), and as the
   * blink train's length through `flashHoldMs` in `flashMessage` (the state hold) — so a
   * retune changes what the eye sees and what bounds it by the same number.
   *
   * REQUIRED rather than optional, on RULING E2b's habit: `app/nina/page.tsx` is the one caller
   * and `tsc` should be what notices if it stops passing it. The keyframe's `, 4` fallback is
   * for a CSS var that stopped arriving, never for a caller that did not send the number.
   */
  flashBlinks: number
}) {
  const [messages, setMessages] = useState<ChatMessage[]>(() => [...initial])
  /*
   * `awaiting` (the poll runs), `typing` (mid-reveal), the live conversation id, the poll cursor
   * and `showTyping` all live in `useTurnArrival`, below. The send and resend reach into it
   * through its five verbs and never touch the machinery itself.
   */
  /* `busy` — the send's action window — and both send handlers live in `useNinaSend`. */
  const [notice, setNotice] = useState<Notice | null>(null)
  /* `flashId`, the landing tint a jump leaves on one bubble, lives in `useQuoteLanding` — R8's
   * delete un-tints through the hook's `clearFlashId`. */
  /**
   * The keyboard's overlap in px, measured by `KeyboardOverlapPublisher` below. The publisher owns
   * the subscription and the `:root` broadcast; this is a MIRROR of the number, kept because this
   * screen's own consumers want the number and not the var — `MessageList`'s bottom pad and the
   * composer's two CSS strings (`composerBottomCss` / `composerPadBottomCss`).
   */
  const [overlap, setOverlap] = useState(0)
  /** Phase 7 (R12). The message being replied to, or null for an ordinary send. */
  const [draftQuote, setDraftQuote] = useState<QuoteView | null>(null)
  /* `acting`, the row whose actions sheet is open, and every gesture the sheet offers live in `useMessageActions`. */
  /** Phase 8 (R13). The run the next message will carry. Seeded from the server's `?attach=`. */
  const [attachment, setAttachment] = useState<RunAttachment | null>(pending)
  /**
   * F34 R2. The already-owned photo the next message will carry. Seeded from the server's
   * `?photo=`, and held BESIDE `attachment` rather than in a union with it: a run and a photo can
   * legitimately be pinned to the same message, and `sendNinaMessage` takes both fields in one
   * call.
   */
  const [photo, setPhoto] = useState<NinaExistingPhoto | null>(pendingPhoto)

  /* R14's mark on this history entry, decoded from `?at=`. Passed down; the arithmetic is in
   * `lib/nina/scroll.ts` and the DOM half is in `MessageList`. */
  const { mark } = useChatScrollMark()

  /*
   * R1's deep link, R12's quote tap and the landing flash, in `useQuoteLanding`. The hook calls
   * `useSearchParams` itself — the jump parameter is read on the first render and held in the
   * hook's ref, one-shot by `useRef`'s keep-the-first-initialiser semantics.
   */
  const { flashId, handleJumpToQuote, clearFlashId } = useQuoteLanding({ flashBlinks, setNotice })

  /*
   * The arrival loop, the staggered reveal and the typing indicator, in `useTurnArrival`. Seeded
   * from the server's `flight` so a cold load mid-turn already polls; the send and resend drive it
   * through `adoptSession` / cursor writes / `beginAwaiting` after the action answers.
   */
  const { showTyping, adoptSession, takeCursor, raiseCursor, beginAwaiting, endTurn } =
    useTurnArrival({ flight, sessionId, setMessages, setNotice })

  /*
   * The send: optimistic row, busy window, id adoption, and the composer arms it reads and
   * unpins, in `useNinaSend`. The retry path (below, on the actions sheet) reuses the same
   * `sendAndTrack` with `replacesId` set, so a retried row and a typed send cannot drift.
   */
  const { busy, handleSend, sendAndTrack } = useNinaSend({
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
  })

  /*
   * R8's surface, in `useMessageActions`: which row the sheet is open on and every gesture it
   * offers. The retry re-runs the send hook's `sendAndTrack` with `replacesId` set, so a retried
   * row and a typed send share one path by construction.
   */
  const {
    acting,
    closeSheet,
    handleRequestActions,
    handleEditMessage,
    handleDeleteMessage,
    handleResendMessage,
    handleRetrySendMessage,
  } = useMessageActions({
    setMessages,
    setNotice,
    setDraftQuote,
    clearFlashId,
    busy,
    sendAndTrack,
    raiseCursor,
    beginAwaiting,
  })

  /*
   * **`?attach=`, `?photo=` AND `?jump=` are consumed, not left lying on the entry.** They have done their
   * job the moment they are in state, and leaving them would re-arm the composer on the way back:
   * send the message, tap its card, come back with the back-swipe, and the POP would re-render this
   * page from a URL still asking for the same run — pinning a run the runner already sent. `?photo=`
   * has the sharper version of the same problem, because the tab it opened in stays open: a reload
   * of that tab would re-arm the same album photo and invite a second send of it.
   *
   * ONE effect deleting all three, not three: `replaceState` on a `URLSearchParams` copy so R14's `at`
   * (which may be written onto this same entry later, or may already be on it) survives untouched,
   * and two independent `replaceState` calls in the same commit would race to decide which of them
   * wrote the surviving URL. The F24 idiom, and the reason it is `replace`: this entry is where we
   * already are.
   *
   * ── AND SINCE F35 PHASE 3, `?s=` SURVIVES IT FOR EXACTLY THE SAME REASON ────────────────────
   * The session parameter (R2, assumption A4) names the open conversation and MUST outlive this
   * effect: deleting it would drop him back to his newest chat one frame after the page painted. It
   * survives because this effect copies the query and deletes three keys BY NAME rather than
   * rebuilding it — the property `useChatScroll.ts`'s header already anticipated when it wrote that
   * its own copy exists "so a future parameter on `/nina` survives". `?s=` is that parameter. **So
   * do not "simplify" the three `delete` calls into a freshly built `URLSearchParams`**, and do not
   * add a third `replaceState` to this component: phase 3 deliberately writes `?s=` by NAVIGATION
   * only — a `<Link>` or a `router.push` from a user gesture — so there is never a second writer of
   * this URL in the same commit as this effect, which is the race the paragraph above is about.
   *
   * ── AND SINCE F35 PHASE 4, `?jump=` IS THE THIRD KEY THIS EFFECT DELETES ────────────────────
   * R1's deep link from `/nina/jobs/[id]`. **The deletes are BY NAME so that `?s=` and `?at=`
   * survive; a fourth parameter belongs in this same list, never in a new effect** — which is the
   * general form of the rule the two paragraphs above state about `?s=` in particular. Phase 4
   * added a `delete`, not a `replaceState`, and that is precisely why its change went inside this
   * effect rather than beside it.
   *
   * ── AND THE ONE SANCTIONED SECOND WRITER: THE SOFT-NAV WATCHER BELOW ────────────────────────
   * "Do not add a third `replaceState`" keeps its exact meaning: never TWO writers in ONE commit,
   * because two writers in one commit race to decide which URL survives. The watcher that lands a
   * same-session `?jump=` (search hit for the open conversation — see its own header) also deletes
   * the key by name, but in the commit where the navigation arrived, a commit this effect does not
   * run in (its deps are `[]`), and in which the only other writer of the URL was the navigation
   * itself. Same idiom, same by-name rule, still one writer per commit.
   */
  useLayoutEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (!params.has(ATTACH_PARAM) && !params.has(PHOTO_PARAM) && !params.has(JOB_JUMP_PARAM)) {
      return
    }
    params.delete(ATTACH_PARAM)
    params.delete(PHOTO_PARAM)
    /*
     * R1's `?jump=` is consumed here for the same reason as the other two, and for one more that
     * is specific to it: it is a ONE-SHOT INSTRUCTION, not state. Leaving it on the entry would
     * mean every back-swipe into this chat re-scrolls and re-flashes a bubble the runner has
     * already read. That is exactly the property `?at=` must NOT have — which is why the two are
     * different keys; see `lib/nina/jobview.ts`.
     */
    params.delete(JOB_JUMP_PARAM)
    const query = params.toString()
    window.history.replaceState(null, '', query ? `?${query}` : window.location.pathname)
  }, [])

  const router = useRouter()

  /*
   * ── LIVE ARRIVAL, HALF ONE: hear the service worker ────────────────────────────────────────
   * F33 phase 11. `lib/service-worker.js`'s `push` handler posts `{ type: 'nina:new' }` to every
   * open window. `router.refresh()` re-renders `app/nina/page.tsx` on the server, which re-reads
   * `listNinaMessages` and hands this component a NEW `initial` — and, because the page's
   * `after(() => markNinaMessagesRead(userId))` runs again, clears the unread dot at the same time.
   *
   * `navigator.serviceWorker.addEventListener('message', …)` listens on the CONTAINER, so it works
   * whether or not this page is controlled by the worker and whether or not a registration exists
   * yet — which is why this component registers nothing. Registration is
   * `components/push/PushSetupCard.tsx`'s job and happens on `/me`.
   *
   * **Not polling.** Phase 10 rejected it and this is the alternative it named. Nothing here runs
   * on a timer; without a push there is no refresh, and a runner with no subscription sees a cron
   * message on the next load exactly as before. That limitation is the trade, not a gap: the
   * alternative is every open tab hitting the server forever for a message that arrives a few
   * times a day.
   */
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return
    const onMessage = (event: MessageEvent) => {
      const data = event.data as { type?: unknown } | null
      if (data !== null && typeof data === 'object' && data.type === SW_MESSAGE_TYPE) {
        router.refresh()
      }
    }
    navigator.serviceWorker.addEventListener('message', onMessage)
    return () => navigator.serviceWorker.removeEventListener('message', onMessage)
  }, [router])

  /*
   * ── LIVE ARRIVAL, HALF TWO: notice that `initial` changed ──────────────────────────────────
   * Without this, half one is useless: `useState(() => [...initial])` runs its initialiser exactly
   * once, so a new `initial` prop from `router.refresh()` would be ignored forever.
   *
   * `mergeServerMessages` is server order + local content, so a bubble mid-reveal keeps its local
   * state and an optimistic row the server has not seen yet is not dropped. It returns the same
   * array reference when nothing changed, so React bails out and a refresh that brought nothing
   * new costs no render.
   *
   * ── WHY THIS IS NOT A `useEffect` ──────────────────────────────────────────────────────────
   * It was, and `react-hooks/set-state-in-effect` rejected it — correctly. Adjusting state when a
   * prop changes is React's own documented during-render pattern ("You Might Not Need an Effect"):
   * React discards the in-progress render and restarts with the new state BEFORE committing, so
   * the DOM is painted once. An effect would commit the stale list first and cascade a second
   * render on top of it, which is exactly the flicker a chat screen must not have.
   *
   * `seenInitial` holds the prop identity we have already merged. `router.refresh()` always hands
   * down a fresh array, so the guard fires once per refresh and `mergeServerMessages`'s identity
   * bail-out is what makes a refresh that brought nothing new free.
   *
   * The docstring above says this component deliberately does not refresh after a send, and that
   * is still true — this is not on the send path. It runs when the SERVER hands down a different
   * list, which after this phase happens for exactly one reason: Nina spoke first.
   */
  const [seenInitial, setSeenInitial] = useState(initial)
  if (seenInitial !== initial) {
    setSeenInitial(initial)
    setMessages((current) => mergeServerMessages(current, initial) as ChatMessage[])
  }

  /*
   * R10's overlay state and its derivations, in `usePhotoViewer`. The attach action a photo's
   * overlay offers stays below, in the render — it arms THIS screen's `photo` slot.
   */
  const {
    viewer,
    viewerPhotos,
    shownIndex,
    viewerAttachId,
    openViewer,
    setViewerIndex,
    closeViewer,
  } = usePhotoViewer(messages)

  /** R10's open gesture. Clearing the notice travels with the gesture, not with the overlay. */
  const handleOpenImage = useCallback(
    (messageId: string, index: number) => {
      setNotice(null)
      openViewer(messageId, index)
    },
    [openViewer],
  )

  /**
   * Arm a reply (R12). `buildQuote` rather than `resolveQuote`, because the target is the message
   * in hand — there is nothing to look up.
   */
  const handleReply = useCallback((message: ChatMessage) => {
    setNotice(null)
    setDraftQuote(
      buildQuote({
        id: message.id,
        mine: message.role === 'user',
        text: message.body,
        /* The same two booleans `MessageList` computes, for the same reason (RULING E2b), and
         * spelled the same way so the strip in the composer and the stub in the bubble cannot
         * disagree about whether the target was a photo. */
        hasImage: (message.imageUrls?.length ?? 0) > 0,
        hasRun: message.attachment != null, // phase 8, wired here
      }),
    )
  }, [])

  return (
    <>
      {/*
        The keyboard's ONE subscription and ONE broadcast, extracted from the two effects this
        component used to carry (the semantics' docstring lives on the component).
        `setOverlap` mirrors the number into this screen's state for `MessageList` and the
        composer; the `:root` var is how the sidebar panel — this component's SIBLING, rendered by
        the page beside it — reads the same measurement without a second subscription.
      */}
      <KeyboardOverlapPublisher onOverlap={setOverlap} />

      {messages.length === 0 && !showTyping ? (
        <EmptyState
          title="Nina has not started yet"
          description="Say something and she will answer. She has read every run you have logged, so she already has opinions."
        />
      ) : (
        <MessageList
          messages={messages}
          typing={showTyping}
          todayISO={todayISO}
          keyboardOverlapPx={overlap}
          restoreMark={mark}
          flashId={flashId}
          flashBlinks={flashBlinks}
          avatar={avatar}
          onReply={handleReply}
          onJumpToQuote={handleJumpToQuote}
          onRequestActions={handleRequestActions}
          onOpenImage={handleOpenImage}
        />
      )}

      {notice !== null && (
        <p className="mt-4 text-[12px] font-medium text-ink-3">{NOTICE_TEXT[notice]}</p>
      )}

      {/* The spoken half of the typing indicator. The dots themselves are `aria-hidden`. */}
      <p className="sr-only" role="status" aria-live="polite">
        {showTyping ? 'Nina is typing' : ''}
      </p>

      <Composer
        onSend={handleSend}
        busy={busy}
        bottomCss={composerBottomCss(overlap, COMPOSER_CLEARANCE_PX)}
        padBottomCss={composerPadBottomCss(overlap)}
        userId={userId}
        reply={draftQuote}
        onCancelReply={() => setDraftQuote(null)}
        attachment={attachment}
        onClearAttachment={() => setAttachment(null)}
        photo={photo}
        onClearPhoto={() => setPhoto(null)}
      />

      {/*
        R8's surface. Rendered LAST, after the composer, so nothing about the composer's `fixed`
        geometry or its `id="nina-composer"` measurement changes — `Sheet` is `z-50` and the
        composer `z-40`, which is the stacking this app already uses for "a sheet covers the
        second fixed bar".

        `key` is the target's id, and that is load-bearing rather than a lint appeasement: the
        sheet holds its own textarea draft (the `Sheet` focus-loss lesson), so picking a DIFFERENT
        message must reset that draft. Remounting on the id is how. It is the deliberate inverse of
        `Composer`'s "never given a `key` that changes", where a reset would have been the bug.

        `retryable` is the failed-own-row case `handleRequestActions` now opens the sheet for: the
        row is red-outlined, unconfirmed, and — crucially — carries no photos, because photo
        tickets do not survive a failed send (see `handleRetrySendMessage`). Everything else goes in
        as a plain `target` and gets the confirmed menu, R5's Resend included.
      */}
      <MessageActionsSheet
        key={acting?.id ?? 'none'}
        target={
          acting === null
            ? null
            : {
                id: acting.id,
                mine: acting.role === 'user',
                body: acting.body,
                hasImage: (acting.imageUrls?.length ?? 0) > 0,
                hasRun: acting.attachment != null,
                confirmed: acting.state === 'sent',
              }
        }
        retryable={
          acting != null &&
          acting.role === 'user' &&
          acting.state === 'failed' &&
          (acting.imageUrls?.length ?? 0) === 0
        }
        onRetry={handleRetrySendMessage}
        onClose={closeSheet}
        onSubmitEdit={handleEditMessage}
        onDelete={handleDeleteMessage}
        onResend={handleResendMessage}
      />

      {/*
        R10. `z-60` on the overlay clears R8's sheet at `z-50`, the composer's `z-40` and phase 2's
        floating chrome at `z-30`, so nothing has to move for it. Rendered last for the same reason
        the sheet above is: a full-screen overlay is the last thing in the tree, and the composer's
        `fixed` geometry and its `id="nina-composer"` measurement stay untouched by it.
      */}
      {viewer !== null && shownIndex !== null && (
        <PhotoViewer
          photos={viewerPhotos}
          index={shownIndex}
          onIndex={(next) => setViewerIndex(viewer.messageId, next)}
          onClose={closeViewer}
          /* `'foto'`, as the album passes — "upload screenshot" is not a thing. */
          subject="foto"
          actions={
            <ChatPhotoActions
              url={viewerPhotos[shownIndex]!.url}
              label={viewerPhotos[shownIndex]!.label}
              onAttach={
                viewerAttachId === null
                  ? null
                  : () => {
                      /*
                       * ── THE WHOLE OF "ATTACH THIS IMAGE TO HIS NEW CHAT" ─────────────────────
                       * Arming the state this component ALREADY holds, not a navigation. `photo`
                       * is the same slot `?photo=avatar:<id>` seeds from the admin surface,
                       * `Composer` already renders `PhotoAttachmentChip` from it, and `handleSend`
                       * already forwards it as `attachExisting: { kind, id }` — where
                       * `resolveAttachment` proves ownership against `user_id` and copies the
                       * image's private prose across server-side. No re-upload, no second blob,
                       * no new action.
                       *
                       * A `router.push('/nina?photo=…')` would have cost a full server round trip,
                       * remounted this component under the runner, and — the real objection — put
                       * a SECOND writer on a URL whose one writer is deliberately one: the
                       * `useLayoutEffect` above is one effect deleting all three parameters because
                       * "two independent `replaceState` calls in the same commit would race".
                       * This phase adds no URL writer at all.
                       *
                       * `kind: 'image'` is the TABLE (`NinaPhotoKind`), not the photo's own kind
                       * column. A chat photo is always `'image'` here, including one of her
                       * selfies whose column reads `'generated'` — passing the column value would
                       * resolve against `nina_avatars` and find nothing.
                       *
                       * Closing the overlay is part of the action: the chip it arms sits above the
                       * composer, BEHIND this overlay, so leaving it open would hide the entire
                       * effect of the tap. It replaces any photo already pinned, because there is
                       * one `photo` slot by design.
                       */
                      setPhoto({
                        kind: 'image',
                        id: viewerAttachId,
                        url: viewerPhotos[shownIndex]!.url,
                      })
                      setNotice(null)
                      closeViewer()
                    }
              }
            />
          }
        />
      )}
    </>
  )
}
