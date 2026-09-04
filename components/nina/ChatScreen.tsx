'use client'

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

import { EmptyState } from '@/components/ui/EmptyState'
import { TAB_BAR_FAB_OVERHANG_PX, TAB_BAR_HEIGHT_PX } from '@/components/ui/TabBar'
import { todayInJakarta } from '@/lib/date/ranges'
import { sendNinaMessage } from '@/lib/nina/actions'
import {
  ATTACH_PARAM,
  PHOTO_PARAM,
  type NinaExistingPhoto,
  type RunAttachment,
} from '@/lib/nina/attach'
import { composerBottomCss, keyboardOverlapPx } from '@/lib/nina/chatview'
import { SW_MESSAGE_TYPE, mergeServerMessages } from '@/lib/nina/live'
import { QUOTE_FLASH_MS, buildQuote, planQuoteScroll, type QuoteView } from '@/lib/nina/reply'
import { planReveal } from '@/lib/nina/reveal'
import { Composer, type ComposerDraftImage } from './Composer'
import { MessageList } from './MessageList'
import type { ChatMessage } from './types'
import { useChatScrollMark } from './useChatScroll'

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
 * A thrown action is a send that did not happen; a returned `unavailable` or an empty `bubbles`
 * array is phase 3's documented silence after a repair also failed. They are told apart because
 * they call for different things — try again, versus she has nothing to say. Neither is rendered
 * as a bubble. Putting app-authored words in her mouth would be the fabrication `lib/llm/narrate.ts`
 * refuses ("the only safe fallback for prose is the absence of prose"), and it would teach the
 * runner to distrust every other bubble on the screen. R22's in-character apology is a genuinely
 * different case — a *tool* failing mid-turn, which phase 12 owns, and where Nina really is the one
 * who should speak.
 */

type Notice = 'send-failed' | 'no-reply' | 'quote-missing'

const NOTICE_TEXT: Record<Notice, string> = {
  'send-failed': 'That didn’t send. Check your connection and try it again.',
  'no-reply':
    'Nina went quiet on that one. Your message is saved — send another and she will pick it up.',
  /* R12's honest end of the degradation. The quote rendered, so the target existed when the page
   * loaded; it is simply not among the rows on screen — deleted since, or further back than this
   * screen goes. Saying so beats a tap that does nothing. */
  'quote-missing': 'That message isn’t on this screen any more, so there’s nowhere to jump to.',
}

/** The chrome the composer sits above: the bar, plus the FAB's overhang past the bar's top edge. */
const COMPOSER_CLEARANCE_PX = TAB_BAR_HEIGHT_PX + TAB_BAR_FAB_OVERHANG_PX

/**
 * Fallback for `obstructedBottomPx` if `#nina-composer` cannot be measured — the clearance plus
 * one composer row. Only reachable if the composer has not mounted, which it always has by the
 * time a quote is tappable.
 */
const COMPOSER_FALLBACK_PX = COMPOSER_CLEARANCE_PX + 68

export function ChatScreen({
  initial,
  todayISO,
  userId,
  sessionId,
  pending,
  pendingPhoto,
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
}) {
  const [messages, setMessages] = useState<ChatMessage[]>(() => [...initial])
  const [typing, setTyping] = useState(false)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<Notice | null>(null)
  const [overlap, setOverlap] = useState(0)
  /** Phase 7 (R12). The message being replied to, or null for an ordinary send. */
  const [draftQuote, setDraftQuote] = useState<QuoteView | null>(null)
  /** Phase 7. The message a jump just landed on. Held for `QUOTE_FLASH_MS`, then cleared. */
  const [flashId, setFlashId] = useState<string | null>(null)
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
   * **`?attach=` AND `?photo=` are consumed, not left lying on the entry.** They have done their
   * job the moment they are in state, and leaving them would re-arm the composer on the way back:
   * send the message, tap its card, come back with the back-swipe, and the POP would re-render this
   * page from a URL still asking for the same run — pinning a run the runner already sent. `?photo=`
   * has the sharper version of the same problem, because the tab it opened in stays open: a reload
   * of that tab would re-arm the same album photo and invite a second send of it.
   *
   * ONE effect deleting both, not two: `replaceState` on a `URLSearchParams` copy so R14's `at`
   * (which may be written onto this same entry later, or may already be on it) survives untouched,
   * and two independent `replaceState` calls in the same commit would race to decide which of them
   * wrote the surviving URL. The F24 idiom, and the reason it is `replace`: this entry is where we
   * already are.
   *
   * ── AND SINCE F35 PHASE 3, `?s=` SURVIVES IT FOR EXACTLY THE SAME REASON ────────────────────
   * The session parameter (R2, assumption A4) names the open conversation and MUST outlive this
   * effect: deleting it would drop him back to his newest chat one frame after the page painted. It
   * survives because this effect copies the query and deletes two keys BY NAME rather than
   * rebuilding it — the property `useChatScroll.ts`'s header already anticipated when it wrote that
   * its own copy exists "so a future parameter on `/nina` survives". `?s=` is that parameter. **So
   * do not "simplify" the two `delete` calls into a freshly built `URLSearchParams`**, and do not
   * add a third `replaceState` to this component: phase 3 deliberately writes `?s=` by NAVIGATION
   * only — a `<Link>` or a `router.push` from a user gesture — so there is never a second writer of
   * this URL in the same commit as this effect, which is the race the paragraph above is about.
   */
  useLayoutEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (!params.has(ATTACH_PARAM) && !params.has(PHOTO_PARAM)) return
    params.delete(ATTACH_PARAM)
    params.delete(PHOTO_PARAM)
    const query = params.toString()
    window.history.replaceState(null, '', query ? `?${query}` : window.location.pathname)
  }, [])

  // Every timed step checks this before touching state. StrictMode double-invokes effects in
  // development and a runner can navigate away mid-reveal; both would otherwise set state on an
  // unmounted tree. `InsightTrigger` uses the same guard for the same reason.
  const alive = useRef(true)
  const timer = useRef<number | null>(null)
  /*
   * Separate from `timer` on purpose. `timer` is the reveal's `setTimeout` handle; sharing it
   * would mean a quote tap mid-reveal cancels the reveal's `sleep` and strands the remaining
   * bubbles behind a typing indicator that never resolves.
   */
  const flashTimer = useRef<number | null>(null)
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
      if (timer.current !== null) window.clearTimeout(timer.current)
      if (flashTimer.current !== null) window.clearTimeout(flashTimer.current)
    }
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
   * The iOS keyboard. Safari does not resize the layout viewport when it opens, so a fixed
   * composer would sit behind it and Safari will not scroll fixed chrome into view. `visualViewport`
   * is the only honest measurement; `keyboardOverlapPx` turns it into a number and filters out the
   * URL bar and pinch-zoom. Empty deps, so a keystroke never re-subscribes.
   */
  useEffect(() => {
    const vv = window.visualViewport
    if (vv == null) return
    const sync = () => {
      setOverlap(
        keyboardOverlapPx({
          innerHeight: window.innerHeight,
          visualHeight: vv.height,
          visualOffsetTop: vv.offsetTop,
          scale: vv.scale,
        }),
      )
    }
    sync()
    vv.addEventListener('resize', sync)
    vv.addEventListener('scroll', sync)
    return () => {
      vv.removeEventListener('resize', sync)
      vv.removeEventListener('scroll', sync)
    }
  }, [])

  const sleep = (ms: number) =>
    new Promise<void>((resolve) => {
      timer.current = window.setTimeout(resolve, ms)
    })

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

  /**
   * R12's second half: tapping a quote scrolls to the message it names, and says which one it
   * landed on.
   *
   * The DOM read is deliberate and is the only DOM read on this screen besides the keyboard's.
   * `getElementById` on phase 4's `nina-msg-${id}` anchor is the one honest source for where a
   * message actually is: React knows the order of the rows, not their pixel heights, which depend
   * on wrapping, on a quote stub, and on an image. A missing element is the degradation path, not
   * an error — the row was on screen when the page rendered and is not now.
   *
   * `getBoundingClientRect().top` on the composer, rather than a constant, because the obstruction
   * is the composer's height (which the reply strip, a tile row and a multi-line draft all change)
   * plus its offset (clearance, or the keyboard).
   */
  const handleJumpToQuote = useCallback((targetId: string) => {
    const element = document.getElementById(`nina-msg-${targetId}`)
    if (element === null) {
      setNotice('quote-missing')
      return
    }

    const composer = document.getElementById('nina-composer')
    const obstructedBottomPx =
      composer === null
        ? COMPOSER_FALLBACK_PX
        : Math.max(0, window.innerHeight - composer.getBoundingClientRect().top)

    const rect = element.getBoundingClientRect()
    const plan = planQuoteScroll({
      targetTop: rect.top + window.scrollY,
      targetHeight: rect.height,
      scrollTop: window.scrollY,
      scrollHeight: document.documentElement.scrollHeight,
      clientHeight: window.innerHeight,
      /* This screen's header scrolls away with the document; nothing is fixed at the top. */
      obstructedTopPx: 0,
      obstructedBottomPx,
      reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    })
    if (plan.kind === 'scroll') window.scrollTo({ top: plan.top, behavior: plan.behavior })

    /* The tint runs whether or not the page moved: `kind: 'none'` means the target was already on
     * screen, which is exactly the case where a scroll alone would identify nothing. */
    setNotice(null)
    setFlashId(targetId)
    if (flashTimer.current !== null) window.clearTimeout(flashTimer.current)
    flashTimer.current = window.setTimeout(() => {
      if (alive.current) setFlashId(null)
    }, QUOTE_FLASH_MS)
  }, [])

  const handleSend = useCallback(
    async (draft: { body: string; images: readonly ComposerDraftImage[] }) => {
      if (busy) return
      /* R13's floor, and the client half of RULING B1's ONE refusal rule: a message with no words,
       * no photo, no run and no pinned album photo is a mis-tap. `canSend` already refuses it; this
       * is the guard that means the action can trust its own input. The four disjuncts here are the
       * same four `sendNinaMessage` checks at `lib/nina/actions.ts:277`, in the same order, and
       * they must stay that way — a fifth on one side only is an enabled Send button that silently
       * refuses. */
      if (
        draft.body.length === 0 &&
        draft.images.length === 0 &&
        attachment === null &&
        photo === null
      ) {
        return
      }

      const body = draft.body
      const imageUrls = draft.images.map((image) => image.url)
      /* Read once, then unpinned below — the same shape `draftQuote` uses, and for the same
       * reason: the optimistic row has to carry what the action will persist. */
      const sending = attachment
      const sendingPhoto = photo
      const localId = `local-${crypto.randomUUID()}`
      const dayISO = todayInJakarta()
      /* Read once and cleared immediately: the strip must disappear the moment the message is in
       * the log, and the optimistic row has to carry the same pointer the action will persist. */
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
      setNotice(null)
      /*
       * The already-owned photo goes AFTER anything he picked, because that is where the server
       * puts it: `lib/nina/actions.ts:451` inserts its row at `sortOrder: images.length`. One
       * array, so the optimistic bubble and every later server render of the same message agree
       * about the order inside it.
       */
      const optimisticUrls = sendingPhoto === null ? imageUrls : [...imageUrls, sendingPhoto.url]
      setMessages((current) => [
        ...current,
        {
          id: localId,
          role: 'user',
          body,
          dayISO,
          state: 'sending',
          replyToId: replyToMessageId,
          /* Already on the CDN — the describe pre-pass uploaded the picked ones before send was
           * possible, and the pinned one has been in Blob since it was uploaded to the album — so
           * the optimistic row shows the same URLs the server row will carry. No object URL to
           * revoke, and no flicker when the real row lands. */
          imageUrls: optimisticUrls.length > 0 ? optimisticUrls : undefined,
          /* R13. The card renders from client state on this row and from `nina_messages.run_id` on
           * every later load; both go through the same `RunAttachment`, so there is no lag and no
           * second shape. */
          attachment: sending,
        },
      ])
      setBusy(true)
      setTyping(true)

      let result: Awaited<ReturnType<typeof sendNinaMessage>> | null = null
      try {
        result = await sendNinaMessage({
          body,
          imageTickets: draft.images.map((image) => image.ticket),
          replyToMessageId,
          runId: sending?.runId ?? null,
          /*
           * F34 R2, and the whole of "we dont actually reupload the photo into the chat, but just
           * some kind of pointer to the existing file". An id and a kind, never a URL: the field
           * has existed since F33 phase 13 and `resolveAttachment` proves ownership against
           * `user_id` before a row is written, which is strictly more than a signed ticket could
           * prove. The `url` this component holds is for the chip and for the optimistic bubble;
           * it is not sent, and a tampered one buys nothing.
           */
          attachExisting:
            sendingPhoto === null ? null : { kind: sendingPhoto.kind, id: sendingPhoto.id },
          /*
           * F35 R2. The conversation this message joins. Read from the prop rather than from the
           * URL, because the server already proved this session is his — re-reading `?s=` here
           * would re-introduce an untrusted claim the page has already resolved.
           *
           * `null` is passed through deliberately: it means he has no sessions, and the action
           * resolves-or-creates. Refusing on the client instead would leave the composer enabled
           * with nowhere to send, which is the "enabled Send button that silently refuses" the
           * refusal-parity comment above warns about.
           */
          sessionId,
        })
      } catch {
        result = null
      }
      if (!alive.current) return

      if (result === null || !result.ok) {
        setTyping(false)
        setBusy(false)
        setMessages((current) =>
          current.map((m) => (m.id === localId ? { ...m, state: 'failed' } : m)),
        )
        setNotice('send-failed')
        return
      }

      // Adopt the server's id for the runner's own row, so phase 7 can quote it and phase 8 can
      // anchor to it. Until this point it carried a client-minted `local-` id.
      const confirmedId = result.userMessageId
      setMessages((current) =>
        current.map((m) =>
          m.id === localId ? { ...m, id: confirmedId ?? m.id, state: 'sent' } : m,
        ),
      )

      const bubbles = result.bubbles
      if (bubbles.length === 0) {
        // `unavailable` and a merely empty reply read the same to the runner — he does not care
        // *why* she said nothing. The distinction stays in the result type, not in the copy.
        setTyping(false)
        setBusy(false)
        setNotice('no-reply')
        return
      }

      const plan = planReveal(bubbles.map((b) => b.body))
      for (const [index, bubble] of bubbles.entries()) {
        const gap = plan[index] ?? 0
        if (gap > 0) {
          setTyping(true)
          await sleep(gap)
          if (!alive.current) return
        }
        // The indicator stays up while there is another thought coming, and drops with the last.
        setTyping(index < bubbles.length - 1)
        setMessages((current) => [
          ...current,
          {
            id: bubble.id,
            role: 'nina',
            body: bubble.body,
            dayISO: todayInJakarta(),
            state: 'sent',
            /*
             * HER OWN QUOTE, ON THE OPTIMISTIC REVEAL. She may have replied to a specific message,
             * and phase 3 puts her `reply_to_id` on the FIRST bubble only ("a four-bubble reply is
             * one answer to one message"). A hard `null` here would mean the quote only appeared on
             * the next server render of `/nina` — R12's UI lagging the database by a page load, for
             * two lines. RULING B1 assigned those two lines to phase 7, which already edits
             * `lib/nina/actions.ts` where `SentBubble` is declared.
             */
            replyToId: bubble.replyToId,
          },
        ])
      }

      setTyping(false)
      setBusy(false)
    },
    [busy, draftQuote, attachment, photo, sessionId],
  )

  return (
    <>
      {messages.length === 0 && !typing ? (
        <EmptyState
          title="Nina has not started yet"
          description="Say something and she will answer. She has read every run you have logged, so she already has opinions."
        />
      ) : (
        <MessageList
          messages={messages}
          typing={typing}
          todayISO={todayISO}
          keyboardOverlapPx={overlap}
          restoreMark={mark}
          flashId={flashId}
          onReply={handleReply}
          onJumpToQuote={handleJumpToQuote}
        />
      )}

      {notice !== null && (
        <p className="mt-4 text-[12px] font-medium text-ink-3">{NOTICE_TEXT[notice]}</p>
      )}

      {/* The spoken half of the typing indicator. The dots themselves are `aria-hidden`. */}
      <p className="sr-only" role="status" aria-live="polite">
        {typing ? 'Nina is typing' : ''}
      </p>

      <Composer
        onSend={handleSend}
        busy={busy}
        bottomCss={composerBottomCss(overlap, COMPOSER_CLEARANCE_PX)}
        userId={userId}
        reply={draftQuote}
        onCancelReply={() => setDraftQuote(null)}
        attachment={attachment}
        onClearAttachment={() => setAttachment(null)}
        photo={photo}
        onClearPhoto={() => setPhoto(null)}
      />
    </>
  )
}
