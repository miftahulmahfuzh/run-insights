'use client'

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

import { EmptyState } from '@/components/ui/EmptyState'
import { PhotoViewer } from '@/components/ui/PhotoViewer'
import { TAB_BAR_OUTER_HEIGHT_PX } from '@/components/ui/TabBar'
import { todayInJakarta } from '@/lib/date/ranges'
import { isValidId } from '@/lib/id'
import {
  pollNinaReply,
  resendNinaMessage,
  sendNinaMessage,
  type NinaResendRefusal,
  type SentBubble,
} from '@/lib/nina/actions'
import {
  ATTACH_PARAM,
  PHOTO_PARAM,
  type NinaExistingPhoto,
  type RunAttachment,
} from '@/lib/nina/attach'
import { attachableIdAt, chatViewerPhotos, viewerIndex } from '@/lib/nina/chatphotos'
import { composerBottomCss, composerPadBottomCss } from '@/lib/nina/chatview'
import {
  applyMessageDeletion,
  applyMessageEdit,
  canActOnMessage,
  type EditTarget,
} from '@/lib/nina/edit'
import { appendNewBubbles, SW_MESSAGE_TYPE, mergeServerMessages } from '@/lib/nina/live'
import { editNinaMessage, removeNinaMessage } from '@/lib/nina/messageActions'
import { JOB_JUMP_PARAM, nextSoftNavJump, parseNinaJumpParam } from '@/lib/nina/jobview'
import {
  buildQuote,
  flashHoldMs,
  planQuoteScroll,
  type QuoteScroll,
  type QuoteView,
} from '@/lib/nina/reply'
import { planReveal } from '@/lib/nina/reveal'
import {
  NINA_TURN_POLL_GIVE_UP_MS,
  ninaPollDelayFor,
  type NinaFlightView,
} from '@/lib/nina/turnflight'
import { ChatPhotoActions } from './ChatPhotoActions'
import { Composer, type ComposerDraftImage } from './Composer'
import { KeyboardOverlapPublisher } from './KeyboardOverlapPublisher'
import { MessageActionsSheet } from './MessageActionsSheet'
import { MessageList } from './MessageList'
import type { ChatAvatar, ChatMessage } from './types'
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

type Notice =
  | 'send-failed'
  | 'no-reply'
  | 'quote-missing'
  | 'edit-failed'
  | 'delete-failed'
  | 'edit-unavailable'

const NOTICE_TEXT: Record<Notice, string> = {
  'send-failed': 'That didn’t send. Check your connection and try it again.',
  /* Raised by the POLL, not by the send (F36 R6). Three states read the same to the runner and are
   * deliberately not told apart in the copy: she answered with nothing, the model was unavailable,
   * or the background turn died and the sweep closed it. He does not care which; he cares that his
   * message is safe and that one more tap gets him an answer. Both halves are now literally true. */
  'no-reply':
    'Nina went quiet on that one. Your message is saved — send another and she will pick it up.',
  /* R12's honest end of the degradation. The quote rendered, so the target existed when the page
   * loaded; it is simply not among the rows on screen — deleted since, or further back than this
   * screen goes. Saying so beats a tap that does nothing. */
  'quote-missing': 'That message isn’t on this screen any more, so there’s nowhere to jump to.',
  /* R8. Both of these mean the WRITE did not happen, so the bubble on screen is still the truth.
   * They are told apart because a failed edit leaves something to try again and a failed delete
   * leaves the message where it was — different next actions, different sentences. */
  'edit-failed': 'That edit didn’t save. The message is unchanged — try it again.',
  'delete-failed': 'That message could not be deleted. It is still here, and still in her context.',
  /* The one refusal that is not a failure: an optimistic row has no database row behind it yet. */
  'edit-unavailable':
    'Give that one a moment to send — there is nothing to edit until Nina has it.',
}

/**
 * R5's five refusals, in the runner's language.
 *
 * ── WHY THIS IS NOT A `Notice` ────────────────────────────────────────────────────────────────
 * `Notice` gains no member, and that is a decision rather than an omission. Every sentence here is
 * read while the actions sheet is covering the screen, and the notice strip renders underneath it —
 * a notice raised from a sheet interaction is a sentence delivered to nobody until the sheet
 * closes. So these go back to the sheet, through `handleResendMessage`'s return value, and land in
 * the `refusal` line the sheet already had for locally-decided refusals.
 *
 * The COPY lives here rather than in the sheet for the reason `NOTICE_TEXT` lives here: the sheet
 * must not learn the action's vocabulary, and this file already owns every sentence this screen
 * says.
 *
 * 'turn-live' is the one that is not a failure, and its wording says so: nothing went wrong, and
 * the message he is looking at is going to be answered without him doing anything else.
 */
const RESEND_REFUSAL_TEXT: Record<NinaResendRefusal, string> = {
  'not-found': 'That message isn’t on the server any more, so there’s nothing to resend.',
  'not-mine': 'Only your own messages can be resent.',
  empty: 'There’s nothing left in that message for her to answer.',
  'turn-live': 'She’s already working on this chat — that one is next, give her a moment.',
  failed: 'That couldn’t be resent just now. Try it again in a moment.',
}

/**
 * The chrome the composer sits above: the bar's **outer** height — its 39 px grid plus the 1 px
 * `border-t` the grid sits under, which is the bar's actual top edge.
 *
 * MEASURED (R2): the border was never in this sum, so the composer's bottom edge landed a pixel
 * below the bar's top border and the scrolling conversation showed through the seam between them.
 * `ChatChrome`'s `BAR_CLEARANCE_PX` is the same constant for the same reason.
 */
const COMPOSER_CLEARANCE_PX = TAB_BAR_OUTER_HEIGHT_PX

/**
 * Fallback for `obstructedBottomPx` if `#nina-composer` cannot be measured — the clearance plus
 * one composer row. Only reachable if the composer has not mounted, which it always has by the
 * time a quote is tappable.
 *
 * 60 is `COMPOSER_RESTING_PX` in `lib/nina/chrome.ts`, written again here because this module
 * cannot import a `lib/nina/chrome` constant without pulling the chrome state machine into the
 * screen's module graph for one number. It is one of four sites that hand-copy it — the markup in
 * `Composer.tsx` (`py-2` + `min-h-11`), that constant, this literal, and `BOTTOM_GAP.chat` in
 * `components/ui/AppShell.tsx` — and a change to any of them changes all four. It was 68, from
 * `py-3`, until the repo owner asked for the query field to take less space.
 */
const COMPOSER_FALLBACK_PX = COMPOSER_CLEARANCE_PX + 60

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
   * Computed on the server by `ninaFlightView` from the rows `app/nina/page.tsx` has ALREADY read —
   * zero extra queries, which is why it is a pure function over `listNinaMessages`'s output and not
   * a fifth read in that page's `Promise.all`.
   *
   * It is what makes "the app does not care whether user close the app" true for the case that
   * actually happens: he sends, locks his phone, comes back forty seconds later. Without it the
   * reopened screen would show his message with no indicator and no poll, and her reply would only
   * appear if he happened to reload again. With it, the screen mounts already awaiting.
   *
   * `awaiting` is a HEURISTIC here — a cold load has no claim row in hand, so it is "the newest row
   * is his and it is younger than `NINA_TURN_STALE_MS`". The first poll's answer is authoritative
   * and corrects it inside two seconds. `ninaAwaitingByMessage`'s docstring carries the argument
   * for why that direction of error is the safe one.
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
  /** Mid-reveal: the pause between two of her bubbles. Distinct from `awaiting`; see the render. */
  const [typing, setTyping] = useState(false)
  /**
   * F36 R6. She has a message of his that she has not answered, so the poll is running and the
   * indicator is up. Seeded from the server so a cold load mid-turn already shows it.
   */
  const [awaiting, setAwaiting] = useState(flight.awaiting)
  /**
   * F36 R6. The conversation the poll asks about. Seeded from the prop and REPLACED by the send's
   * answer, because `sessionId` may legitimately be `null` — "he has no sessions at all" — and the
   * ACTION is what resolves or creates one. Without adopting it, the first message of a brand-new
   * runner would send fine and then be polled for in a conversation the client cannot name.
   */
  const [liveSessionId, setLiveSessionId] = useState(sessionId)
  /**
   * F36 R6. `nina_messages.seq` of the newest row this screen holds — the poll's cursor. A REF and
   * not state: it is read inside the poll loop and written by both the send and the poll, and a
   * stale closure over it would re-read the same rows for ever. Nothing renders from it.
   */
  const cursorRef = useRef(flight.cursor)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<Notice | null>(null)
  /**
   * The keyboard's overlap in px, measured by `KeyboardOverlapPublisher` below. The publisher owns
   * the subscription and the `:root` broadcast; this is a MIRROR of the number, kept because this
   * screen's own consumers want the number and not the var — `MessageList`'s bottom pad and the
   * composer's two CSS strings (`composerBottomCss` / `composerPadBottomCss`).
   */
  const [overlap, setOverlap] = useState(0)
  /** Phase 7 (R12). The message being replied to, or null for an ordinary send. */
  const [draftQuote, setDraftQuote] = useState<QuoteView | null>(null)
  /** Phase 7. The message a jump just landed on. Held for `QUOTE_FLASH_MS`, then cleared. */
  const [flashId, setFlashId] = useState<string | null>(null)
  /**
   * R8. The message whose action sheet is open, or null.
   *
   * The `ChatMessage` itself and not an id, so the sheet can render the text being acted on and
   * disclose the photo count without a second lookup — and so that a row that vanishes from
   * `messages` under it (a push-driven refresh, a delete in another tab) does not leave the sheet
   * pointing at nothing it can describe.
   */
  const [acting, setActing] = useState<ChatMessage | null>(null)
  /** Phase 8 (R13). The run the next message will carry. Seeded from the server's `?attach=`. */
  const [attachment, setAttachment] = useState<RunAttachment | null>(pending)
  /**
   * F34 R2. The already-owned photo the next message will carry. Seeded from the server's
   * `?photo=`, and held BESIDE `attachment` rather than in a union with it: a run and a photo can
   * legitimately be pinned to the same message, and `sendNinaMessage` takes both fields in one
   * call.
   */
  const [photo, setPhoto] = useState<NinaExistingPhoto | null>(pendingPhoto)

  /**
   * R10. Which bubble's photographs the full-screen overlay is showing, and which of them is on
   * screen. `null` is closed.
   *
   * ── A MESSAGE ID AND AN INDEX, NOT A SNAPSHOT OF THE PHOTO LIST ──────────────────────────────
   * Because `messages` changes underneath an open overlay, in two ways that both really happen: a
   * service-worker push calls `router.refresh()` and the server hands down a new list, and R8's
   * delete takes a bubble and its photo rows with it. A snapshot would keep showing a photo whose
   * row is gone; a derived list plus `viewerIndex` closes or clamps, which is the only shape that
   * does not end in `PhotoViewer`'s `photos[index]!` throwing.
   */
  const [viewer, setViewer] = useState<{ messageId: string; index: number } | null>(null)

  const handleOpenImage = useCallback((messageId: string, index: number) => {
    setNotice(null)
    setViewer({ messageId, index })
  }, [])

  /* R14's mark on this history entry, decoded from `?at=`. Passed down; the arithmetic is in
   * `lib/nina/scroll.ts` and the DOM half is in `MessageList`. */
  const { mark } = useChatScrollMark()

  /*
   * ── R1's DEEP LINK: `?jump=<messageId>` ───────────────────────────────────────────────────
   * `/nina/jobs/[id]`'s "Buka chat-nya" lands here with `?s=<session>&jump=<message>`. The session
   * opened the right conversation on the server; this is the bubble to pinpoint.
   *
   * **READ ON THE FIRST RENDER AND HELD IN A REF**, for two reasons that both bite:
   *
   *   - the layout effect below CONSUMES the parameter (see its header), so by the time the jump
   *     runs `useSearchParams()` no longer has it. `useRef`'s initialiser is evaluated on every
   *     render and React keeps only the first result, which is precisely the one-shot semantics
   *     this needs;
   *   - `useSearchParams()` resolves during the SERVER render on this dynamically rendered route,
   *     so the first client render agrees with it and nothing here is a hydration hazard.
   *
   * The ref is cleared inside the animation frame rather than in the effect body. StrictMode
   * double-invokes effects in development: clearing it up front would let the first (immediately
   * torn down) run consume the target and the second run find nothing — the jump would work in
   * production and never in dev, which is the worst of the two ways to be wrong.
   */
  const searchParams = useSearchParams()
  const jumpRef = useRef<string | null>(parseNinaJumpParam(searchParams.get(JOB_JUMP_PARAM)))

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
  /*
   * Its own handle, on `flashTimer`'s exact reasoning. The poll's backoff wait and the reveal's
   * `sleep` never overlap — the loop awaits one then the other — but sharing `timer` would mean the
   * next person to add a cancel path silently cancels the wrong one.
   */
  const pollTimer = useRef<number | null>(null)
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
      if (timer.current !== null) window.clearTimeout(timer.current)
      if (flashTimer.current !== null) window.clearTimeout(flashTimer.current)
      if (pollTimer.current !== null) window.clearTimeout(pollTimer.current)
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
   * R10's overlay, derived rather than stored — see `viewer` above.
   *
   * `useMemo` on the message identity, not on `messages`: this component re-renders on every state
   * change the screen makes (typing, keyboard, reveal, flash), and the overlay's list only depends
   * on the one row it is showing.
   */
  const viewerMessage =
    viewer === null
      ? null
      : (messages.find((candidate) => candidate.id === viewer.messageId) ?? null)
  const viewerPhotos = useMemo(() => chatViewerPhotos(viewerMessage), [viewerMessage])
  const shownIndex = viewer === null ? null : viewerIndex(viewer.index, viewerPhotos.length)
  /*
   * The message went away under the open overlay — deleted, or gone from a refreshed window. Close
   * it DURING RENDER rather than in an effect, for the reason the `seenInitial` block above gives
   * at length: `react-hooks/set-state-in-effect` rejects the effect form, correctly, and React
   * discards this render and restarts with the new state before committing, so nothing is painted
   * twice. It terminates immediately: `viewer === null` makes the condition false.
   */
  if (viewer !== null && shownIndex === null) setViewer(null)
  /*
   * R10's attach. `null` when the id never reached the client, which is exactly the optimistic row
   * — and `ChatPhotoActions` renders no attach control for it rather than one that cannot work.
   */
  const viewerAttachId =
    shownIndex === null ? null : attachableIdAt(viewerMessage?.imageIds, shownIndex)

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
   * Where the page has to move so `targetId` is comfortably readable — or `null` when that message
   * is not in the document.
   *
   * The DOM read is deliberate and is the only DOM read on this screen besides the keyboard's.
   * `getElementById` on phase 4's `nina-msg-${id}` anchor is the one honest source for where a
   * message actually is: React knows the order of the rows, not their pixel heights, which depend
   * on wrapping, on a quote stub, and on an image. A missing element is the degradation path, not
   * an error — the row was on screen when the page rendered and is not now, or (F35 phase 4's deep
   * link) it is further back than `CHAT_HISTORY_LIMIT` reaches.
   *
   * `getBoundingClientRect().top` on the composer, rather than a constant, because the obstruction
   * is the composer's height (which the reply strip, a tile row and a multi-line draft all change)
   * plus its offset (clearance, or the keyboard).
   *
   * **Extracted from `handleJumpToQuote` so R1's deep link reuses the same arithmetic rather than
   * inventing a second scroll-and-flash.** `planQuoteScroll` stays the one decision function.
   */
  const measureQuoteScroll = useCallback((targetId: string): QuoteScroll | null => {
    const element = document.getElementById(`nina-msg-${targetId}`)
    if (element === null) return null

    const composer = document.getElementById('nina-composer')
    const obstructedBottomPx =
      composer === null
        ? COMPOSER_FALLBACK_PX
        : Math.max(0, window.innerHeight - composer.getBoundingClientRect().top)

    const rect = element.getBoundingClientRect()
    return planQuoteScroll({
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
  }, [])

  /**
   * The landing flash, held for `flashHoldMs(flashBlinks)`.
   *
   * It runs whether or not the page moved: `kind: 'none'` means the target was already on screen,
   * which is exactly the case where a scroll alone would identify nothing. Since 2026-09-09 the
   * visible effect is `nina-flash-blink` in `MessageBubble` — hard blinks of a 2px ring, the
   * count owner-tuned through `NINA_FLASH_BLINKS` — with a still redefinition under
   * `@media (prefers-reduced-motion: reduce)` that `tests/motion.reducedMotion.test.ts` guards.
   * The timer outlives the blink train by one full cycle on purpose: it is what bounds the state,
   * so a second landing inside its window restarts the flash rather than racing a clearing timer.
   *
   * `flashBlinks` is a dep and that is safe rather than incidental: it is constant per mount (a
   * server-resolved number), and the effects that key on this callback's identity re-run to
   * no-ops — the mount path returns on the cleared `jumpRef`, the watcher on the stripped URL.
   */
  const flashMessage = useCallback(
    (targetId: string) => {
      setNotice(null)
      setFlashId(targetId)
      if (flashTimer.current !== null) window.clearTimeout(flashTimer.current)
      flashTimer.current = window.setTimeout(() => {
        if (alive.current) setFlashId(null)
      }, flashHoldMs(flashBlinks))
    },
    [flashBlinks],
  )

  /**
   * R12's second half: tapping a quote scrolls to the message it names, and says which one it
   * landed on.
   */
  const handleJumpToQuote = useCallback(
    (targetId: string) => {
      const plan = measureQuoteScroll(targetId)
      if (plan === null) {
        setNotice('quote-missing')
        return
      }
      if (plan.kind === 'scroll') window.scrollTo({ top: plan.top, behavior: plan.behavior })
      flashMessage(targetId)
    },
    [measureQuoteScroll, flashMessage],
  )

  /**
   * **The landing: something said "this bubble", so pinpoint it.** One callback so the two ways a
   * `?jump=` can arrive — a MOUNT (`/nina/jobs/[id]`'s "Buka chat-nya", or a search hit for a
   * different conversation) and a same-session SOFT NAVIGATION (a search hit for the conversation
   * already on screen, handled by the watcher below) — cannot drift into two
   * scroll-and-flash arithmetics. The extraction follows `measureQuoteScroll`'s own precedent one
   * position up: that one was pulled out of `handleJumpToQuote` so the mount landing would reuse
   * the quote tap's arithmetic rather than invent a second one, and this callback now sits under
   * both arrivals for the same reason.
   *
   * ── WHY IT REUSES `planQuoteScroll` ───────────────────────────────────────────────────────
   * The user asked for it in those words — "just like how we can click and directly pinpoint
   * reply_to message". A second scroll-and-flash would be a second set of rules about the band the
   * composer leaves over, and the two would drift the first time the composer's geometry changed.
   *
   * ── WHY `'instant'`, OVERRIDING THE PLAN'S OWN `behavior` ─────────────────────────────────
   * `planQuoteScroll` chooses `'smooth'` because a quote tap is a movement WITHIN a screen the
   * runner is already reading, and watching the page travel is what tells them they went backwards.
   * This is an ARRIVAL: the runner navigated here from elsewhere and has not seen this
   * conversation yet, so there is no "from" to animate out of — smooth-scrolling a screen that
   * just painted only shows them the bottom of the chat on the way past. `MessageList`'s R14
   * restore takes `'instant'` for the same reason and says so. (`handleJumpToQuote` keeps the
   * plan's `'smooth'` on purpose: it is the within-screen case.)
   *
   * ── WHY AN ANIMATION FRAME, AND WHY TWICE ─────────────────────────────────────────────────
   * The callers schedule this inside one `requestAnimationFrame` so layout has settled; the second
   * application below is `MessageList`'s restore idiom, verbatim and for its reason: a web font
   * settling or an image finishing decode moves the target after the first measurement, and
   * re-deriving the same pure number from the element's new position is cheap. When nothing moved,
   * `planQuoteScroll` returns `'none'` under its 8px tolerance and the second call is a no-op.
   *
   * ── IT MUST NOT CALL `revealBubbles` ──────────────────────────────────────────────────────
   * That callback is phase 3's staggered reveal of rows Nina has just sent, and it is the SOLE
   * appender of her bubbles. This callback appends nothing: every row it can land on was already
   * rendered. Scrolling is not arriving.
   *
   * A missing element is the `'quote-missing'` notice, which is already the right sentence: the
   * message is real (the job page resolved it against the database; the search SQL read it) but it
   * is not among the `CHAT_HISTORY_LIMIT` rows this screen renders.
   */
  const landOn = useCallback(
    (targetId: string) => {
      const plan = measureQuoteScroll(targetId)
      if (plan === null) {
        setNotice('quote-missing')
        return
      }
      if (plan.kind === 'scroll') window.scrollTo({ top: plan.top, behavior: 'instant' })
      flashMessage(targetId)

      window.requestAnimationFrame(() => {
        if (!alive.current) return
        const again = measureQuoteScroll(targetId)
        if (again !== null && again.kind === 'scroll') {
          window.scrollTo({ top: again.top, behavior: 'instant' })
        }
      })
    },
    [measureQuoteScroll, flashMessage],
  )

  /* R1's mount landing. `jumpRef`'s block above states the one-shot reasoning; the short version:
   * the ref is cleared inside the frame rather than the effect body so StrictMode's first,
   * immediately torn-down run leaves the target for the second run, and the frame is cancelled on
   * cleanup so a navigation away mid-flight lands on nothing. The landing itself is `landOn`'s —
   * this effect only decides WHEN, never HOW. */
  useEffect(() => {
    if (jumpRef.current === null) return

    const frame = window.requestAnimationFrame(() => {
      const targetId = jumpRef.current
      if (targetId === null || !alive.current) return
      jumpRef.current = null
      landOn(targetId)
    })

    return () => window.cancelAnimationFrame(frame)
  }, [landOn])

  /*
   * ── R1's OTHER ARRIVAL: A `?jump=` THAT DOES NOT REMOUNT ─────────────────────────────────
   * `app/nina/page.tsx` keys this component by the session id, so a jump naming a DIFFERENT
   * conversation remounts and the effect above delivers it. A jump naming the one already open —
   * a search hit tapped while its own session is on screen — is a soft navigation: same key, no
   * remount, `jumpRef`'s initialiser never runs, and the strip effect at the top of this file
   * (deps `[]`) never re-runs. Before search switched onto `?jump=`, `?at=` covered this case
   * through `MessageList`'s restore, so leaving it unhandled would be a regression, not a gap.
   *
   * ── WHY THE GUARD REF IS INITIALISED TO THE MOUNT VALUE ────────────────────────────────────
   * On a mount that CARRIES a `?jump=`, this effect's first run sees the same raw string its ref
   * was initialised to, `nextSoftNavJump` answers "already seen", and the landing belongs to the
   * mount path above. Without the initialised ref, a deep-linked mount would scroll and flash
   * TWICE. `nextSoftNavJump` (in `lib/nina/jobview.ts`, tested there because `vitest` has no
   * jsdom) owns the rest of the rule: the ref records the raw value after every run, and a `null`
   * raw resets it — so once the strip has consumed the parameter, a FRESH navigation to the same
   * id still counts as new (a genuine second tap on the same hit lands again).
   *
   * ── WHY THE STRIP RUNS BEFORE THE FRAME ───────────────────────────────────────────────────
   * The landing reads the DOM (`measureQuoteScroll` → `getElementById`), never the URL, so
   * removing the parameter first cannot starve it — and stripping in the same tick closes the
   * re-arm window a frame earlier. It deletes BY NAME on a `URLSearchParams` copy of
   * `window.location.search`, the idiom of the mount-time strip above, so `?s=` and `?at=`
   * survive; it reads `window.location.search` rather than the `searchParams` snapshot for the
   * reason `saveMark` states ("the write has to be against whatever the URL is at the moment");
   * and it skips itself when the key is already gone, which is the case where the mount-time
   * strip won the race on a freshly mounted screen. `replaceState`, not a navigation, for the
   * reason that header gives — this entry is where we already are — and Next 16 patches it so
   * `useSearchParams` stays in sync afterwards, which is what delivers the `null` render that
   * resets the guard.
   *
   * RESIDUAL EDGE, accepted: a second tap of the SAME hit re-navigates to a byte-identical URL,
   * which the router may deduplicate into no render at all — no re-land. The first tap landed,
   * so nothing is lost; telling a repeat tap from a repeat render is not worth a nonce in the URL.
   *
   * ── WHY THE LANDING FRAME IS NEVER CANCELLED (measured in production, 2026-09-09) ─────────
   * This effect has no cleanup, and that is load-bearing. The strip ABOVE schedules its own
   * teardown: Next's patched `replaceState` dispatches an `ACTION_RESTORE` in a transition, which
   * re-renders this component with `jumpRaw === null` and re-runs this effect — the very
   * re-run that resets `softNavSeen`. With a `return () => cancelAnimationFrame(frame)` cleanup,
   * that second run first tore down the frame the FIRST run had just scheduled, and whether the
   * landing survived was a race between the rAF and the transition: a cold navigation (the first
   * tap of a hit — RSC over the wire, slow commit) usually landed; a warm one (the same hit
   * tapped again, payload already in the segment cache, fast commit) reliably did not. The owner
   * measured it as "search ↔ chat ↔ search, the second and third tap never flash". The frame
   * therefore guards itself and nothing else: `alive.current` inside it is the unmount
   * protection, and a newer arrival re-lands on top of an older frame's landing, which is the
   * correct final state. The MOUNT landing above keeps its cleanup — its deps are `[landOn]`,
   * a stable callback, so nothing in this file can re-run it mid-frame; only unmount can, and
   * StrictMode's dev double-run is exactly what its `jumpRef`-cleared-inside-the-frame shape is
   * written against. Do not "symmetrise" this file onto one shape: the two effects have
   * different re-run surfaces, and each cleanup policy is load-bearing for its own.
   */
  const jumpRaw = searchParams.get(JOB_JUMP_PARAM)
  const softNavSeen = useRef<string | null>(jumpRaw)
  useEffect(() => {
    const targetId = nextSoftNavJump(softNavSeen.current, jumpRaw)
    softNavSeen.current = jumpRaw
    if (targetId === null) return

    const params = new URLSearchParams(window.location.search)
    if (params.has(JOB_JUMP_PARAM)) {
      params.delete(JOB_JUMP_PARAM)
      const query = params.toString()
      window.history.replaceState(null, '', query ? `?${query}` : window.location.pathname)
    }

    /* Deliberately NOT cancelled — see the header paragraph above. `alive` is the unmount
     * guard; a second run of this effect with a fresh target supersedes rather than cancels. */
    window.requestAnimationFrame(() => {
      if (alive.current) landOn(targetId)
    })
  }, [jumpRaw, landOn])

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
  const handleRequestActions = useCallback((message: ChatMessage) => {
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
  }, [])

  /**
   * R8, editing. Returns true when the row was written, which is the sheet's cue to close.
   *
   * ── THE LIST IS PATCHED FROM THE RETURN VALUE, AND NOT BY A REFRESH ───────────────────────────
   * This component's header explains why it does not `router.refresh()` after a send. An edit has a
   * second, sharper reason: `mergeServerMessages` is "server order, LOCAL content", so for any id
   * this component already holds, the local copy WINS over the server's. A refresh literally cannot
   * deliver an edited body — it would re-render the page and then be discarded. So the action
   * returns the canonical text and it is mapped onto local state here, exactly as this file already
   * adopts `result.userMessageId` after a send. Two mechanisms, not three.
   *
   * `applyMessageEdit` returns the same array reference when nothing changed, so the `'unchanged'`
   * case costs no render.
   */
  const handleEditMessage = useCallback(async (id: string, body: string): Promise<boolean> => {
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
  }, [])

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
  const handleDeleteMessage = useCallback(async (id: string): Promise<boolean> => {
    /* A client-minted `local-` id names a row the server has never heard of — a failed send, or
     * one still in flight. There is nothing to call: `removeNinaMessage` would refuse the id, and
     * the honest outcome of deleting a message that was never delivered is that it stops being on
     * screen. Local state only, same cleanup as the confirmed path. */
    if (!isValidId(id)) {
      setNotice(null)
      setMessages((current) => applyMessageDeletion(current, id) as ChatMessage[])
      setDraftQuote((current) => (current?.targetId === id ? null : current))
      setFlashId((current) => (current === id ? null : current))
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
    setFlashId((current) => (current === deletedId ? null : current))
    return true
  }, [])

  /**
   * R5, resending. Resolves `null` when the turn was claimed — the sheet's cue to close — and
   * otherwise the sentence for the sheet to show.
   *
   * ── IT PRODUCES THE SAME AWAITING STATE A SEND PRODUCES, AND THAT IS THE WHOLE UI ─────────────
   * `handleSend`'s last three lines are `setLiveSessionId` / `cursorRef.current = result.cursor` /
   * `setAwaiting(true)`, and everything after that is machinery this phase reuses untouched: the
   * arrival loop starts on `awaiting`, `showTyping` raises the indicator, and `revealBubbles` runs
   * `planReveal` on whatever the poll returns. So a resend adds no poll, no timer and no second
   * rhythm — it just tells the shipped one that something is coming.
   *
   * `liveSessionId` is deliberately NOT adopted from the result: the message being resent is on
   * this screen, so it is in the conversation this screen is already polling. A resend cannot
   * create a session the way a first send can.
   *
   * ── THE CURSOR IS TAKEN AS A MAXIMUM ─────────────────────────────────────────────────────────
   * `result.cursor` is the newest `seq` the server saw when it accepted the resend, which is `>=`
   * every row this screen holds — so resuming there asks for exactly the rows the resent turn
   * produces and cannot re-deliver a bubble of hers that is already on screen. `Math.max` covers
   * the two ways it could still arrive stale: the action degrades to the resent row's own `seq` if
   * its cursor read fails, and a poll may legitimately land between the server's read and this
   * assignment, because `awaiting` can be true while a resend is accepted.
   *
   * `setNotice(null)` matters more here than it looks: the notice on screen when he taps Resend is
   * almost always 'no-reply', which is exactly the sentence that sent him here. Leaving it up while
   * she is answering again would contradict the indicator.
   */
  const handleResendMessage = useCallback(async (id: string): Promise<string | null> => {
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
    if (result.cursor !== null) {
      cursorRef.current = Math.max(cursorRef.current, result.cursor)
    }
    setAwaiting(true)
    return null
  }, [])

  /**
   * RU-5's staggered reveal, lifted verbatim out of `handleSend` so the SEND path and the POLL path
   * cannot drift into two different rhythms. It is the only writer of `typing` besides the poll's
   * own start and stop.
   *
   * It guards on `alive.current` at every timed step, and on `id` presence at the append — the one
   * other guard it has, and the reason it can share a list with `mergeServerMessages`. Callers are
   * sequential by construction — the poll loop awaits this before deciding whether to keep polling
   * — so there is no second reveal to interleave with, and the single `timer` handle stays safe.
   *
   * ── WHY THE APPEND SKIPS IDS ALREADY ON SCREEN (prod "gj", 2026-09-11: 4 rows, 7 bubbles) ────
   * Every bubble here used to be appended unconditionally, and on prod session "gj" that rendered
   * seven bubbles from the four rows the database holds. A full-route RSC delivery of `/nina` had
   * landed mid-reveal — its `read_at` sits 14 ms after the turn's INSERT, so its payload carried
   * all four committed rows — and `mergeServerMessages`, correctly by its own rule, delivered the
   * three bubbles the reveal had not reached yet. The reveal then appended its own copies of the
   * same `nina_messages.id`s: two channels into one list, and only the merge deduped. The guard
   * sits INSIDE the updater (`appendNewBubbles`), so the check reads the list as React will commit
   * it — a merge that lands in any gap between two sleeps is already on screen for the next
   * iteration.
   *
   * ── WHY THE GUARD LIVES HERE AND NOT IN THE MERGE ────────────────────────────────────────────
   * Because the merge is already correct: server order, local content, id-deduped — the sanctioned
   * ONE-FRAME delivery for a refresh, whose contract the header above documents for a COMPLETED
   * list. The defect was the other writer holding no contract at all, and that defect is one
   * missing `id` check wide. Making the merge reveal-aware (routing new nina rows through the
   * stagger) would put a second writer on the reveal's rhythm to fix it. What a mid-reveal merge
   * still does — collapse the remaining stagger into one frame — is cosmetic, and explicitly
   * accepted (invariant 4 of `NINA_DUP_BUBBLE_REVEAL_PLAN.md`); what it can no longer do is render
   * an id twice.
   */
  const revealBubbles = useCallback(async (bubbles: readonly SentBubble[]) => {
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
      /*
       * The APPEND alone is idempotent — `appendNewBubbles` returns the list untouched when the
       * merge has already delivered this id. The SLEEP above is not skipped: the stagger is keyed
       * to the batch as the poll received it, and pruning the plan for ids already on screen would
       * need a synchronous read of `messages` that this updater-only shape deliberately refuses as
       * a second source of truth. So a mid-reveal merge can leave a gap where a bubble already
       * sits — the accepted collapse — while the id itself can no longer appear twice.
       */
      setMessages((current) => appendNewBubbles(current, [bubble], todayInJakarta()))
    }
    setTyping(false)
  }, [])

  /**
   * **The arrival loop (F36 R6).** Runs while `awaiting` is true and stops itself the moment the
   * server says there is nothing outstanding.
   *
   * ── ONE SEQUENTIAL ASYNC LOOP, NOT A `setInterval` ───────────────────────────────────────────
   * Because a tick must not fire while the previous request is in flight, and — the part that
   * matters — because a tick must not fire while a REVEAL is in progress. An interval would race
   * the reveal's own `sleep` for the shared timer handle and could deliver a second batch of
   * bubbles into the middle of the first batch's stagger. Awaiting each step in order makes both
   * impossible by construction rather than by a guard someone has to remember.
   *
   * ── WHY IT DOES NOT STOP ON THE FIRST BUBBLES ────────────────────────────────────────────────
   * Because a burst chains: the server may answer his first message, then open a second turn for
   * the two he sent while she was typing. The stop condition is the server's `awaiting`, which is
   * "is anything of his unanswered", not "did I just receive something".
   *
   * ── THE GIVE-UP ─────────────────────────────────────────────────────────────────────────────
   * `NINA_TURN_POLL_GIVE_UP_MS` is the same number as the server's `NINA_TURN_STALE_MS`, asserted
   * in `lib/nina/turnflight.test.ts`. By the time it fires, the server has already closed the row
   * as dead, so the notice it raises is a fact. It exists for the case where the poll ITSELF cannot
   * reach the server — an offline phone — where no server answer is coming at all.
   */
  useEffect(() => {
    if (!awaiting) return
    let cancelled = false

    const wait = (ms: number) =>
      new Promise<void>((resolve) => {
        pollTimer.current = window.setTimeout(resolve, ms)
      })

    const stop = (raised: Notice | null) => {
      setAwaiting(false)
      setTyping(false)
      if (raised !== null) setNotice(raised)
    }

    const run = async () => {
      const startedAt = Date.now()
      let attempts = 0

      while (!cancelled && alive.current) {
        await wait(ninaPollDelayFor(attempts))
        if (cancelled || !alive.current) return
        attempts += 1

        let result: Awaited<ReturnType<typeof pollNinaReply>> | null = null
        try {
          result = await pollNinaReply({
            sessionId: liveSessionId,
            afterSeq: cursorRef.current,
          })
        } catch {
          result = null
        }
        if (cancelled || !alive.current) return

        const expired = Date.now() - startedAt >= NINA_TURN_POLL_GIVE_UP_MS

        if (result === null || !result.ok) {
          /* The poll itself failed. It has learned nothing, so it says nothing and tries again —
           * until the give-up, which is the only thing that ends an offline wait. */
          if (expired) {
            stop('no-reply')
            return
          }
          continue
        }

        cursorRef.current = result.cursor

        if (result.bubbles.length > 0) {
          setNotice(null)
          /*
           * `setAwaiting(false)` BEFORE the reveal when the server says nothing is outstanding, so
           * the indicator is owned by `typing` alone for the duration of the stagger. Flipping it
           * re-runs this effect's cleanup and sets `cancelled`, which is harmless: `revealBubbles`
           * guards on `alive.current`, and this iteration returns immediately afterwards.
           */
          if (!result.awaiting) setAwaiting(false)
          await revealBubbles(result.bubbles)
          if (cancelled || !alive.current) return
          if (!result.awaiting) return
          continue
        }

        if (!result.awaiting) {
          /* Nothing outstanding and nothing new: she said nothing, or the turn is dead and the
           * server has closed it. One notice covers all of it — see NOTICE_TEXT's comment. */
          stop('no-reply')
          return
        }
        if (expired) {
          stop('no-reply')
          return
        }
      }
    }

    void run()
    return () => {
      cancelled = true
      if (pollTimer.current !== null) window.clearTimeout(pollTimer.current)
    }
  }, [awaiting, liveSessionId, revealBubbles])

  /*
   * The send itself: optimistic row, busy window, failure marking, id adoption. Factored out of
   * `handleSend` so a RETRY of a failed row runs byte-for-byte the same path a typed send does
   * rather than a second copy of it drifting — the failure marking and the id adoption are the
   * halves a copy would get subtly wrong, and both are what makes a retried row behave identically
   * to a fresh one afterwards (the poll, a quote, the actions sheet).
   *
   * What it deliberately does NOT own is the composer's armed state. Unpinning a reply chip, a run
   * chip or a pinned album photo is right for a typed send — the optimistic row now carries them —
   * and wrong for a retry, which must leave whatever is armed NOW alone: a runner can be mid-draft
   * on his next message while he retries the last one.
   */
  const sendAndTrack = useCallback(
    async (input: {
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
    }): Promise<boolean> => {
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
      /* No `setTyping(true)` here (F36 R6): `awaiting` drives the indicator from the moment the
       * action RETURNS, and raising it before the round trip would show Nina typing in response to
       * a message that had not been accepted yet. */
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
           * written, exactly as it does for the pinned album photo below. The `url` this
           * component holds is for the optimistic bubble; it is not sent.
           */
          dedupedImageIds: deduped.map((image) => image.imageId),
          replyToMessageId: input.replyToMessageId,
          runId: input.runAttachment?.runId ?? null,
          /*
           * F34 R2, and the whole of "we dont actually reupload the photo into the chat, but just
           * some kind of pointer to the existing file". An id and a kind, never a URL: the field
           * has existed since F33 phase 13 and `resolveAttachment` proves ownership against
           * `user_id` before a row is written, which is strictly more than a signed ticket could
           * prove. The `url` this component holds is for the chip and for the optimistic bubble;
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
        setAwaiting(false)
        setTyping(false)
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
       * The three things the poll needs, all of them facts the server just established.
       *
       * `sessionId` is adopted because the prop may have been `null` — "he has no sessions at all"
       * is a real state and the ACTION resolves or creates one. `cursor` is his row's `seq`, so the
       * first poll asks for everything strictly after his own message. `awaiting` goes true
       * unconditionally on a successful send, INCLUDING when `result.turnId` is null: a null turn
       * id means a turn was already running and will chain onto this message, so something is very
       * much still coming.
       */
      if (result.sessionId !== null) setLiveSessionId(result.sessionId)
      if (result.cursor !== null) cursorRef.current = result.cursor
      setAwaiting(true)
      return true
    },
    [sessionId],
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
    [busy, draftQuote, attachment, photo, sendAndTrack],
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

  /*
   * F36 R6. The indicator is up while the SERVER owes an answer (`awaiting`) and between two of her
   * bubbles mid-reveal (`typing`). Two pieces of state and one derived flag, rather than one
   * overloaded boolean, because the poll and the reveal legitimately own different stretches of the
   * same wait and each must be able to end its own without ending the other's.
   *
   * This is the honest signal R6 asks for: it means "she is answering", where the grey bubble it
   * replaces meant "your message has not been saved yet" — which was never what the runner read it
   * as, and is no longer true for even a second.
   */
  const showTyping = awaiting || typing

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
        onClose={() => setActing(null)}
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
          onIndex={(next) => setViewer({ messageId: viewer.messageId, index: next })}
          onClose={() => setViewer(null)}
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
                      setViewer(null)
                    }
              }
            />
          }
        />
      )}
    </>
  )
}
