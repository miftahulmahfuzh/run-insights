/**
 * The four decisions the chat screen makes that are not markup, as pure functions.
 *
 * Same argument as `lib/nina/reveal.ts` and `lib/photos/gallery.ts` before it: `vitest.config.ts`
 * runs `environment: 'node'` with an `include` matching `*.test.ts`, so there is no jsdom, no
 * `visualViewport` and no scroll container. Every one of these is a rule, and a rule can be
 * asserted; a rendered scenario could only demonstrate one instance of it.
 *
 * Deliberately NOT named `scroll.ts`: phase 8 owns `lib/nina/scroll.ts`, which is the *restoration*
 * arithmetic for returning from a run detail page to the exact prior offset. That is a different
 * question from "should this new bubble move the page", and two files named for the same word
 * would be read as one.
 *
 * No DOM types appear in any signature here. The component measures; this decides.
 */

/* ── day grouping ──────────────────────────────────────────────────────────────────────────── */

export interface DayGroup<T> {
  /** 'YYYY-MM-DD', the Asia/Jakarta calendar day (D6). */
  dayISO: string
  messages: T[]
}

/**
 * Consecutive runs of messages that share a calendar day, in the order given.
 *
 * Generic over `{ dayISO }` rather than typed against `components/nina/types.ts`, so that a
 * module under `lib/` never imports from `components/`. It also means phases 6, 7 and 8 can widen
 * `ChatMessage` freely without touching this.
 *
 * **Consecutive runs, not a keyed bucket.** A `Map` keyed by day would silently merge two
 * separated stretches of the same day if the rows ever arrived out of order, which would put a
 * "Today" divider above yesterday's messages. Grouping adjacently makes a mis-ordered read look
 * wrong instead of looking plausible.
 */
export function groupIntoDays<T extends { dayISO: string }>(
  messages: readonly T[],
): Array<DayGroup<T>> {
  const groups: Array<DayGroup<T>> = []
  for (const message of messages) {
    const last = groups[groups.length - 1]
    if (last !== undefined && last.dayISO === message.dayISO) last.messages.push(message)
    else groups.push({ dayISO: message.dayISO, messages: [message] })
  }
  return groups
}

/* ── following the conversation down ───────────────────────────────────────────────────────── */

/**
 * How close to the bottom counts as "the reader is following along".
 *
 * 96 px is a little over one bubble's height. Tighter and a reader who nudged the page a
 * thumb-width stops receiving new messages in view; looser and a reader two bubbles up gets
 * yanked away from the line he was re-reading.
 */
export const STICK_TO_BOTTOM_PX = 96

/** What the component measures, with no DOM types in the signature. */
export interface ScrollGeometry {
  /** `window.scrollY`, or a container's `scrollTop`. */
  scrollTop: number
  /** `document.documentElement.scrollHeight`. */
  scrollHeight: number
  /** `window.innerHeight`, or a container's `clientHeight`. */
  clientHeight: number
}

/** Non-finite geometry reads as "at the bottom": the safe answer is to keep following. */
export function isNearBottom(
  geometry: ScrollGeometry,
  threshold: number = STICK_TO_BOTTOM_PX,
): boolean {
  const { scrollTop, scrollHeight, clientHeight } = geometry
  if (![scrollTop, scrollHeight, clientHeight].every(Number.isFinite)) return true
  return scrollHeight - (scrollTop + clientHeight) <= threshold
}

export type ScrollCause =
  /** First paint of the screen. */
  | 'mount'
  /** The runner just sent something. */
  | 'own-message'
  /** A bubble from Nina, or the typing indicator appearing. */
  | 'incoming'
  /** The software keyboard opened or closed and the visible area changed size. */
  | 'viewport'

export type ScrollDecision = 'jump' | 'smooth' | 'none'

/**
 * Whether, and how, a change should move the page to the newest message.
 *
 * ── THE FOUR RULES ───────────────────────────────────────────────────────────────────────────
 *   1. `mount` always jumps, never animates. A conversation opens at its newest line, and an
 *      animated scroll on first paint is motion in place of an instant result.
 *   2. `own-message` always follows. The runner just acted; going with him is not an
 *      interruption, it is the acknowledgement.
 *   3. `incoming` follows only a reader who was already at the bottom. This is the whole rule
 *      that separates a chat screen from a hostile one: never take the page away from someone
 *      reading history because Nina had a fourth thought.
 *   4. `viewport` — the keyboard opening — follows only a reader at the bottom, and jumps rather
 *      than animates, because the layout has already moved underneath him and a 300 ms smooth
 *      scroll chasing it reads as a glitch.
 *
 * ── REDUCED MOTION ───────────────────────────────────────────────────────────────────────────
 * `prefers-reduced-motion: reduce` turns every 'smooth' into 'jump'. A smooth scroll is sustained
 * motion the user did not ask for, which is the thing that setting exists to suppress — the same
 * line `app/globals.css` draws when it exempts `active:scale-[0.985]` (discrete tap feedback) but
 * neutralises `ri-pulse` (sustained oscillation). The destination never changes; only the journey.
 */
export function decideAutoScroll(input: {
  cause: ScrollCause
  readerNearBottom: boolean
  reducedMotion: boolean
}): ScrollDecision {
  const { cause, readerNearBottom, reducedMotion } = input
  if (cause === 'mount') return 'jump'
  if (cause === 'viewport') return readerNearBottom ? 'jump' : 'none'
  if (cause === 'incoming' && !readerNearBottom) return 'none'
  return reducedMotion ? 'jump' : 'smooth'
}

/* ── the iOS keyboard ──────────────────────────────────────────────────────────────────────── */

/**
 * The smallest overlap that is allowed to count as a keyboard.
 *
 * iOS does **not** resize the layout viewport when the software keyboard opens, so a
 * `position: fixed` composer sits behind it and Safari will not scroll fixed chrome into view.
 * `window.visualViewport` is the only honest measurement of what is actually visible, and moving
 * the composer by that overlap is the fix.
 *
 * But the visual viewport shrinks for other reasons too — a collapsing URL bar is 60-90 px, a
 * pinch-zoom is arbitrary. 120 px is below every iOS keyboard and above every URL-bar delta, so
 * the composer does not twitch while the runner scrolls.
 */
export const KEYBOARD_MIN_PX = 120

/**
 * How many CSS pixels of the layout viewport's bottom are covered by the software keyboard.
 *
 * `innerHeight - (visualHeight + visualOffsetTop)`. The `offsetTop` term cancels a *scroll inside*
 * the visual viewport, so a page the runner has panned around while zoomed reports the same
 * overlap as an unpanned one.
 *
 * ── WHY `scale` IS AN INPUT, AND NOT AN OVER-SPECIFIED ONE ───────────────────────────────────
 * The offset term alone cannot tell a zoom from a keyboard, because a pinch *shrinks*
 * `visualHeight` as well as offsetting it: a 2x pinch on an 812 px layout leaves a 400 px visual
 * viewport, and 812 - 400 - 200 = 212 px reads as a keyboard-sized overlap when there is no
 * keyboard. No arrangement of those three numbers separates the two cases — the shrink is real and
 * it is the same shrink a keyboard causes. `visualViewport.scale` is the one value that does, it
 * is free at the only call site, and without it this function cannot answer the question its own
 * name asks.
 *
 * So a zoomed viewport (`scale > 1`) is "no keyboard", full stop. If a keyboard is genuinely open
 * *while* the page is pinched, the composer stays where the CSS put it rather than chasing a
 * measurement that might be either thing — which is the same safe answer every other degenerate
 * input here gets, and Safari's fixed-position behaviour under zoom is already unreliable enough
 * that guessing would not improve it.
 *
 * Returns 0 for anything non-finite, anything negative, anything under `KEYBOARD_MIN_PX`, and
 * anything measured while zoomed — five different ways of saying "there is no keyboard", all of
 * which must mean "leave the composer where the CSS put it".
 */
export function keyboardOverlapPx(viewport: {
  innerHeight: number
  visualHeight: number
  visualOffsetTop: number
  /** `visualViewport.scale`. 1 is unzoomed; anything above it is a pinch. */
  scale: number
}): number {
  const { innerHeight, visualHeight, visualOffsetTop, scale } = viewport
  if (![innerHeight, visualHeight, visualOffsetTop, scale].every(Number.isFinite)) return 0
  if (scale > 1) return 0
  const overlap = Math.round(innerHeight - visualHeight - visualOffsetTop)
  if (overlap < KEYBOARD_MIN_PX) return 0
  return Math.min(overlap, Math.round(innerHeight))
}

/**
 * The composer's `bottom`, as a CSS length.
 *
 * With no keyboard it clears the fixed chrome below it: the tab bar's own height, the FAB's
 * overhang above the bar's top edge, and the home-indicator inset the bar pads itself by. The
 * inset is honoured **here and not as the composer's own padding** — the composer sits above
 * chrome that already pads by `--safe-bottom`, so padding it a second time would open a gap.
 *
 * With a keyboard, the keyboard's top edge is the floor and every one of those terms is behind it.
 *
 * Returns a string because that is what the style attribute takes, and because `var(--safe-bottom)`
 * cannot be resolved in JavaScript — `env(safe-area-inset-bottom)` is only readable to CSS.
 */
export function composerBottomCss(overlapPx: number, chromeClearancePx: number): string {
  if (Number.isFinite(overlapPx) && overlapPx > 0) return `${Math.round(overlapPx)}px`
  const clearance = Number.isFinite(chromeClearancePx) ? Math.round(chromeClearancePx) : 0
  return `calc(${clearance}px + var(--safe-bottom))`
}
