import type { ScrollGeometry } from './chatview'

/**
 * Reply-to (R12), as the four decisions it actually is: what a quote says, which message it
 * points at, whether a drag was a reply gesture, and where the page has to move to show the
 * target.
 *
 * ── WHY THIS FILE EXISTS AT ALL ───────────────────────────────────────────────────────────────
 * `vitest.config.ts` is `environment: 'node'` with an `include` matching `*.test.ts` only: there
 * is no jsdom, no `TouchEvent`, no `scrollHeight`. `lib/photos/gallery.ts` was split out of
 * `PhotoViewer.tsx` for exactly this reason and its header states it; `lib/nina/reveal.ts` and
 * `lib/nina/chatview.ts` did the same for phase 4's timing and auto-scroll. A rendered-scenario
 * test would prove one gesture; these prove the rules.
 *
 * `ScrollGeometry` is IMPORTED from `chatview.ts` rather than re-declared. The two modules answer
 * different questions — "should this new bubble move the page" versus "move the page to this old
 * one" — but they measure the same three numbers off the same document, and two structurally
 * identical interfaces would eventually disagree.
 *
 * No `import 'server-only'`, deliberately: `lib/nina/actions.ts` (a Server Action) and
 * `components/nina/*` (client) both import this, which is only safe because there is nothing in
 * here but arithmetic and string handling — no db, no env, no DOM types in any signature.
 */

/* ── what a quote says ─────────────────────────────────────────────────────────────────────── */

/**
 * How much of the quoted message the stub carries into the DOM.
 *
 * 120 characters is about two lines at the stub's 13px, which is what `line-clamp-2` will show,
 * and the cap exists so a 700-character bubble (`MAX_RUNNER_MESSAGE_CHARS`) is not shipped four
 * times over in a conversation full of replies. The clamp is the visual truth and this is the
 * payload truth; they agree at two lines, and if they ever disagree the clamp wins, which is the
 * safe direction.
 */
export const QUOTE_PREVIEW_MAX_CHARS = 120

/**
 * The cap on the same text when it goes to `glm-5.3` instead of to the screen. Equal to phase 3's
 * `MAX_RUNNER_MESSAGE_CHARS`, i.e. a whole bubble, because the model needs the message and not a
 * taste of it — this is the difference between "reply as context" and reply as decoration.
 */
export const QUOTE_CONTEXT_MAX_CHARS = 700

/**
 * What the quoted message carries besides text.
 *
 * **Both members survive this phase (RULING E2b).** `'photo'` ships LIVE — phase 6 landed first,
 * so a quote whose target is an image-only message says "Photo" the day this phase lands. `'run'`
 * ships REACHABLE — nothing sets `hasRun` yet, and phase 8 flips one boolean at its call site in
 * `MessageList`. Shipping the dead branch now is what buys the guarantee below: **no later phase
 * edits `lib/nina/reply.ts`.**
 */
export type QuoteMedia = 'none' | 'photo' | 'run'

/**
 * The word the stub shows for a target whose own text is empty — an image-only message (phase 6)
 * or a bare run attachment (phase 8).
 *
 * **This is the coordination point with phases 6, 8, 12 and 13**, and it is a WORD rather than a
 * thumbnail on purpose. A 28px image thumbnail inside a quote inside a bubble needs the blob URL,
 * a second `next/image` sizing decision and a fallback for a dead blob — all of which belong to
 * the phase that owns images. A quote that reads "You · Photo" is honest, costs nothing, and
 * needs no edit when those phases land: `MessageList` computes `hasImage` / `hasRun` off
 * `ChatMessage.imageUrls` (phase 6) and `.attachment` (phase 8), and this stub starts saying so by
 * itself. If phase 6 later wants the thumbnail, `QuoteStub` takes one optional prop and this
 * constant stays as its fallback.
 */
export const QUOTE_MEDIA_LABEL: Record<Exclude<QuoteMedia, 'none'>, string> = {
  photo: 'Photo',
  run: 'Run',
}

/** The last-resort label: a target with no text and no media. Should not exist; is not a crash. */
export const QUOTE_EMPTY_LABEL = 'Message'

/** Whose message is being quoted, from the runner's point of view. */
export type QuoteAuthor = 'you' | 'nina'

/**
 * A message a quote could point at. Structural, so `lib/` never imports from `components/` — the
 * same rule `groupIntoDays` follows.
 *
 * **`hasImage` and `hasRun` are BOOLEANS THE CALLER COMPUTES, and that is RULING E2b's whole
 * mechanism.** This phase lands before phase 8, so it cannot name `RunAttachment`; and phase 6
 * owns `ChatMessage.imageUrls` (plural), so naming a URL field here would be this file declaring
 * another phase's type. `MessageList` fills both — `hasImage: (m.imageUrls?.length ?? 0) > 0`,
 * `hasRun: m.attachment != null` — and this module never learns what a blob URL or a run is.
 * Nothing crosses backwards from a later phase, and no later phase edits this file.
 */
export interface QuoteCandidate {
  id: string
  /** True when the quoted message is the runner's own. */
  mine: boolean
  text: string
  /** Phase 6's `imageUrls`, collapsed by the caller. */
  hasImage: boolean
  /** Phase 8's `attachment`, collapsed by the caller. `false` until phase 8 lands. */
  hasRun: boolean
}

/** What the stub renders. Everything it needs, nothing it does not. */
export interface QuoteView {
  /** The `nina_messages.id` to scroll to. Also the DOM anchor: `nina-msg-${targetId}`. */
  targetId: string
  author: QuoteAuthor
  /** Never empty — see `buildQuote`. */
  preview: string
  media: QuoteMedia
}

/**
 * One line of text, whatever the source did with whitespace.
 *
 * ── WHY THE NEWLINES GO ───────────────────────────────────────────────────────────────────────
 * The bubble itself is `whitespace-pre-wrap`, because her line breaks are part of how she talks.
 * A quote is not the message, it is a reference to it, and a two-line stub that spends both lines
 * on a blank line and a "hm" is useless. Collapsing first also makes the character cap mean
 * something: 120 characters of prose, not 120 characters of `\n`.
 *
 * ── WHY IT CUTS AT A WORD ─────────────────────────────────────────────────────────────────────
 * `slice(0, 120)` lands mid-word four times out of five and reads as a rendering fault. The cut
 * retreats to the last space, but only if that space is in the final 40% of the budget — for a
 * pasted URL or an Indonesian compound with no spaces there is no good break, and losing 70% of
 * the preview to find one is worse than cutting cleanly.
 */
export function quotePreview(text: string, max: number = QUOTE_PREVIEW_MAX_CHARS): string {
  if (typeof text !== 'string') return ''
  if (!Number.isFinite(max) || max <= 0) return ''
  const flat = text.replace(/\s+/g, ' ').trim()
  if (flat.length <= max) return flat

  const hard = flat.slice(0, max)
  const lastSpace = hard.lastIndexOf(' ')
  const body = lastSpace >= Math.floor(max * 0.6) ? hard.slice(0, lastSpace) : hard
  return `${body.trimEnd()}…`
}

/**
 * Which media word a message earns. **A photo wins over a run**, and the case that decides it is
 * phase 13's: a message can carry both a generated photo and the run it is about, and the photo
 * is the thing a reader recognises in a one-line quote.
 *
 * Takes two BOOLEANS and not a `ChatMessage`, per RULING E2b. The caller — `MessageList`, the one
 * module that already imports `ChatMessage` — does the collapsing, so phase 6 owns the plural
 * `imageUrls` and phase 8 owns `attachment` and neither field name appears in this file. That is
 * what makes it true that no later phase edits `lib/nina/reply.ts`.
 */
export function quoteMediaOf(message: { hasImage: boolean; hasRun: boolean }): QuoteMedia {
  if (message.hasImage) return 'photo'
  if (message.hasRun) return 'run'
  return 'none'
}

/**
 * The view model for one candidate. `preview` is guaranteed non-empty: text if there is text, the
 * media word if there is not, and `QUOTE_EMPTY_LABEL` if there is neither — because a stub that
 * renders an empty string is a 44px tap target with nothing in it, which reads as a bug rather
 * than as a quote.
 *
 * The media word is derived HERE, from the candidate's two booleans, rather than passed in — one
 * fewer thing for the two call sites (`MessageList`'s candidate map and `ChatScreen`'s
 * `handleReply`) to get inconsistently right.
 */
export function buildQuote(candidate: QuoteCandidate): QuoteView {
  const preview = quotePreview(candidate.text)
  const media = quoteMediaOf(candidate)
  const fallback = media === 'none' ? QUOTE_EMPTY_LABEL : QUOTE_MEDIA_LABEL[media]
  return {
    targetId: candidate.id,
    author: candidate.mine ? 'you' : 'nina',
    preview: preview.length > 0 ? preview : fallback,
    media,
  }
}

/**
 * The quote a message shows, or `null` for "render it as a plain message".
 *
 * ── NULL IS A FEATURE, AND IT IS THE PHASE'S EXIT CRITERION ───────────────────────────────────
 * Three real cases end here. `reply_to_id` was nulled by the database when its target was deleted
 * (phase 1's `ON DELETE SET NULL`, decision D-5). The target is alive but older than the 200 rows
 * `app/nina/page.tsx` renders, so there is nothing on this screen to point at. Or a client-side
 * optimistic row referenced an id that the send failed to confirm. In all three the message itself
 * is intact and gets rendered exactly as it would have been without a reply — no empty stub, no
 * "message unavailable" placeholder, and above all no thrown render.
 *
 * A linear `find` over at most 200 candidates, called once per quoted message. Building a `Map`
 * would be faster asymptotically and slower in practice at this size; if the history window ever
 * grows past a few thousand, index it at the call site and pass the lookup in.
 */
export function resolveQuote(
  replyToId: string | null | undefined,
  candidates: readonly QuoteCandidate[],
): QuoteView | null {
  if (replyToId == null || replyToId.length === 0) return null
  const target = candidates.find((candidate) => candidate.id === replyToId)
  return target === undefined ? null : buildQuote(target)
}

/* ── the quoted message, as Nina reads it ──────────────────────────────────────────────────── */

/**
 * What the action hands the turn. Deliberately not `QuoteCandidate`: the model needs the whole
 * message and a time, and does not need a media enum it cannot see. `sentAtLabel` is phase 2's
 * `'Tue 2 Sep 07:14'` spelling — the same string `ConversationTurn.sentAtLabel` carries, so the
 * quoted message is timestamped the way every other message in the payload is (invariant 3).
 */
export interface QuotedMessageInput {
  id: string
  /** True when the quoted message is the RUNNER's. False when it is one of Nina's own. */
  mine: boolean
  text: string
  sentAtLabel: string | null
}

/**
 * The block that makes `reply_to_id` mean something to `glm-5.3`.
 *
 * Rendered into the user turn immediately BEFORE `'HE JUST SAID:'`, so she reads the thing being
 * answered before she reads the answer — which is the order he saw it in, and the order the screen
 * shows it in.
 *
 * The last line is an instruction and not a fact, which is the one liberty this block takes.
 * Without it the measured failure mode of a quoted turn is a full re-answer of the quoted message
 * as though it had just arrived; naming the relationship is what turns it into a reply.
 */
export function quoteContextBlock(quoted: QuotedMessageInput): string {
  const whose = quoted.mine ? 'one of HIS earlier messages' : 'one of YOUR earlier messages'
  const when = quoted.sentAtLabel == null ? '' : `, sent ${quoted.sentAtLabel}`
  const text = quotePreview(quoted.text, QUOTE_CONTEXT_MAX_CHARS)
  return [
    `HE IS REPLYING TO A SPECIFIC MESSAGE — ${whose}${when}. This is it:`,
    `"${text}"`,
    'Answer what he says next AS A REPLY TO THAT MESSAGE. Do not answer that message again from scratch.',
  ].join('\n')
}

/* ── the gesture ───────────────────────────────────────────────────────────────────────────── */

/**
 * The minimum rightward travel, in CSS px, before a drag counts as a reply.
 *
 * 44 rather than `gallery.ts`'s 48, and the difference is the competing gesture. There, the other
 * gesture was a vertical scroll through a 1600px screenshot inside a fixed overlay; here it is the
 * document scroll of the whole conversation, which the dominance ratio below rejects far more
 * aggressively — so the distance itself can sit at the 44pt tap floor the design brief makes
 * non-negotiable, which is also about the width of a thumb's comfortable drag on a 414px screen.
 */
export const REPLY_SWIPE_MIN_DISTANCE = 44

/**
 * How much more horizontal than vertical the drag must be.
 *
 * 1.6, deliberately stricter than `gallery.ts`'s 1.2. That file was protecting a pan container;
 * this is protecting **the primary interaction of the screen** — scrolling a conversation. A
 * thumb-flick up the chat log arcs sideways, and every false positive here is a reply draft the
 * runner did not ask for while he was trying to read. The failure directions are not symmetric: a
 * rejected swipe costs one more swipe, an accepted scroll costs a dismissal and a lost scroll
 * position.
 */
export const REPLY_SWIPE_DOMINANCE = 1.6

/**
 * `visualViewport.scale` is a float and settles on 1.0000000000000002-style values after a
 * pinch-and-release, so "is the page zoomed" cannot be `> 1`. Same value and same reason as
 * `gallery.ts`'s `ZOOM_EPSILON`.
 */
const ZOOM_EPSILON = 0.01

/** What the bubble measures from a `touchend`, with no DOM types in the signature. */
export interface ReplySwipeGesture {
  /** `end.clientX - start.clientX`. Positive when the finger moved right. */
  dx: number
  /** `end.clientY - start.clientY`. */
  dy: number
  /** The MAXIMUM concurrent touches seen at any point in the gesture, not the count at the end. */
  touches: number
  /** `visualViewport.scale` at the end of the gesture; 1 when the page is not zoomed. */
  zoomScale: number
}

export type ReplySwipeDecision = 'reply' | 'none'

/**
 * Whether a finished drag on a bubble should arm a reply.
 *
 * ── THE FOUR RULES, IN THE ORDER THEY MATTER ──────────────────────────────────────────────────
 *   1. more than one finger is a pinch, never a reply — and the count is the MAXIMUM seen during
 *      the gesture, because a pinch that begins with one finger down still has to lose;
 *   2. a zoomed page means a horizontal drag is the reader panning around;
 *   3. RIGHTWARD ONLY. `dx <= 0` is never a reply: a leftward drag from near the screen edge is
 *      how iOS Safari does forward navigation, and WhatsApp's own reply gesture is rightward on
 *      both sides of the conversation, so this is muscle memory rather than a preference;
 *   4. far enough, and dominantly horizontal, or the chat log keeps its scroll.
 *
 * There is no live drag-follow transform, and that is a decision rather than an omission. It would
 * be the first sustained animation in the codebase outside `ri-pulse`, whose reduced-motion escape
 * `tests/motion.reducedMotion.test.ts` guards; and the feedback a swipe actually needs is
 * confirmation that the reply was armed, which is the draft strip appearing in the composer, 44px
 * from the thumb that did it.
 */
export function decideReplySwipe(gesture: ReplySwipeGesture): ReplySwipeDecision {
  const { dx, dy, touches, zoomScale } = gesture
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return 'none'
  if (touches > 1) return 'none'
  if (Number.isFinite(zoomScale) && zoomScale > 1 + ZOOM_EPSILON) return 'none'
  if (dx < REPLY_SWIPE_MIN_DISTANCE) return 'none'
  if (dx < Math.abs(dy) * REPLY_SWIPE_DOMINANCE) return 'none'
  return 'reply'
}

/* ── the scroll target ─────────────────────────────────────────────────────────────────────── */

/** Under this much movement the page is left alone; the flash alone identifies the target. */
export const QUOTE_SCROLL_TOLERANCE_PX = 8

/** The gap above a target too tall to centre. One 4pt step up from the bubble gap. */
export const QUOTE_SCROLL_TOP_MARGIN_PX = 16

/** How long the tint holds on the message a quote landed on. See `MessageBubble` for why 1600ms. */
export const QUOTE_FLASH_MS = 1600

/**
 * What the component measures, extending phase 4's three document numbers with the target's own
 * geometry and the chrome that is covering the viewport.
 */
export interface QuoteScrollGeometry extends ScrollGeometry {
  /** Document-space top of the target element: `rect.top + scrollTop`. */
  targetTop: number
  /** `rect.height`. */
  targetHeight: number
  /** Fixed chrome eating the TOP of the viewport. 0 on this screen — its header scrolls away. */
  obstructedTopPx: number
  /** Composer + tab bar + FAB overhang + software keyboard. Measured, not assumed. */
  obstructedBottomPx: number
  /** `matchMedia('(prefers-reduced-motion: reduce)').matches`. */
  reducedMotion: boolean
}

export type QuoteScroll =
  { kind: 'none' } | { kind: 'scroll'; top: number; behavior: 'smooth' | 'instant' }

/**
 * Where the document has to be so the quoted message is comfortably readable.
 *
 * ── THE BAND, NOT THE VIEWPORT ────────────────────────────────────────────────────────────────
 * `scrollIntoView({ block: 'center' })` would be one line and would be wrong here, because on this
 * screen the bottom ~150px of the viewport is a fixed composer over a fixed tab bar with a raised
 * FAB, and up to another 300px is the software keyboard when it is open. Centring in the *viewport*
 * therefore centres in a strip that is partly under the chrome. The readable band is
 * `clientHeight - obstructedTop - obstructedBottom`, and the target is centred in THAT.
 *
 * ── THE THREE CASES ───────────────────────────────────────────────────────────────────────────
 *   - a target shorter than the band is centred in it, which is what a reader jumping backwards
 *     wants: the quoted message plus some of what surrounded it;
 *   - a target taller than the band is aligned to the band's top with a 16px margin, because
 *     centring a tall bubble hides its beginning, and the beginning is the part being quoted;
 *   - a band of zero or less — the keyboard open on a short viewport — degrades to "put the target
 *     at the top of the document viewport", which is the only remaining honest answer.
 *
 * Then it is CLAMPED to `[0, scrollHeight - clientHeight]`, so a quote near either end of the
 * conversation lands at the end rather than asking for a scroll position that does not exist. A
 * move smaller than the tolerance returns `'none'`: the target is already on screen, and the
 * caller's flash is what identifies it. `'instant'` under reduced motion, matching
 * `decideAutoScroll`'s treatment of the same setting.
 */
export function planQuoteScroll(geometry: QuoteScrollGeometry): QuoteScroll {
  const {
    targetTop,
    targetHeight,
    scrollTop,
    scrollHeight,
    clientHeight,
    obstructedTopPx,
    obstructedBottomPx,
    reducedMotion,
  } = geometry

  const measured = [
    targetTop,
    targetHeight,
    scrollTop,
    scrollHeight,
    clientHeight,
    obstructedTopPx,
    obstructedBottomPx,
  ]
  if (!measured.every(Number.isFinite)) return { kind: 'none' }

  const top = Math.max(0, obstructedTopPx)
  const bottom = Math.max(0, obstructedBottomPx)
  const band = clientHeight - top - bottom

  let desired: number
  if (band <= 0) desired = targetTop - QUOTE_SCROLL_TOP_MARGIN_PX
  else if (targetHeight >= band) desired = targetTop - top - QUOTE_SCROLL_TOP_MARGIN_PX
  else desired = targetTop - top - (band - targetHeight) / 2

  const maxTop = Math.max(0, scrollHeight - clientHeight)
  const next = Math.round(Math.min(Math.max(desired, 0), maxTop))

  if (Math.abs(next - scrollTop) <= QUOTE_SCROLL_TOLERANCE_PX) return { kind: 'none' }
  return { kind: 'scroll', top: next, behavior: reducedMotion ? 'instant' : 'smooth' }
}
