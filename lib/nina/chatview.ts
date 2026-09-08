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
 * The CSS custom property that says whether `/nina`'s tab bar is currently on screen.
 *
 * `'1'` while the bar is shown; **absent** otherwise, which is the load-bearing half. `/nina`'s
 * resting state is a hidden bar, so the default has to be the hidden geometry: an absent variable
 * substitutes `0`, the composer paints on the home-indicator inset, and there is no reposition
 * between the server's HTML and the first client frame. Setting the variable on *hide* instead
 * would put a 59 px settle into the first paint of every conversation.
 *
 * Set by `components/nina/ChatChrome.tsx` on `document.documentElement`, and removed by that
 * effect's cleanup — so hiding the bar and navigating off `/nina` both restore the default and
 * nothing leaks onto another route.
 *
 * A custom property rather than a prop, because the composer is not a descendant of the component
 * that owns the reveal state: `AppShell` renders `<main>` (which contains `ChatScreen`, which
 * renders `Composer`) and the chrome as siblings. `:root` is the nearest thing both inherit from,
 * and a custom property is the one channel that crosses that gap without threading a boolean
 * through three components that have no other use for it.
 */
export const NINA_BAR_VISIBLE_VAR = '--nina-bar-visible'

/**
 * The CSS custom property carrying the software keyboard's current overlap in px — the same number
 * `keyboardOverlapPx` hands the composer — published on `document.documentElement` by
 * `components/nina/ChatScreen.tsx`, whose `visualViewport` subscription is the ONE on this screen
 * (`ChatChrome`'s docstring records why there must not be a second). The reader is the one fixed
 * overlay that is neither ChatScreen's descendant nor the composer's: `NinaSidebar`'s panel, which
 * sets its `bottom` to `var(--nina-kb-overlap, 0px)` so the panel ENDS at the keyboard's top edge.
 *
 * **Absent is the resting geometry**, on `NINA_BAR_VISIBLE_VAR`'s exact reasoning. The keyboard-less
 * state must be what the server's HTML and the first client frame already say (`inset-0`), so the
 * property is removed the moment the overlap reads zero and on unmount, and a reader that has not
 * heard from the subscription substitutes `0px` — no settle, no flash, and nothing leaks onto
 * another route. Android never sets it at all: `keyboardOverlapPx` returns 0 there because the
 * layout viewport really does shrink, and the panel needs no help.
 *
 * Why the panel needs it: iOS does not resize the layout viewport when the keyboard opens, so a
 * `fixed inset-0` panel runs on behind it, and Safari's focus reveal answers by lifting the whole
 * fixed overlay — the search field exits the top of the glass while the keyboard holds the bottom,
 * which is the bug the repo owner reported as the keyboard "mengangkat UI keatas". Ending the panel
 * at the keyboard's top edge puts the field inside the visible region, which is the same fix the
 * composer already ships: move the fixed chrome by the measured overlap, never trust Safari to
 * scroll it into view.
 */
export const NINA_KEYBOARD_OVERLAP_VAR = '--nina-kb-overlap'

/**
 * How far above the physical glass the home-indicator pill's TOP edge sits: 8 px of gap plus a
 * 5 px pill, the same on every notched iPhone Apple has shipped.
 *
 * Both bottom-of-the-screen gaps the repo owner asked to be equalised are measured TO THE PILL,
 * not to the safe area's top line — and the two are 21 px apart on a 34 px inset, which is the
 * whole of both mismatches. This constant is what lets CSS measure to the pill at all: the inset
 * is readable (`env(safe-area-inset-bottom)`) but the pill's position within it is not, so the
 * pill's edge is carried as the physical constant it is.
 *
 * **ONE VOCABULARY, TWO DECLARATIONS.** `components/ui/TabBar.tsx` declares its own
 * `HOME_INDICATOR_TOP_PX` for the tab bar's content drop, because `lib/` never imports from
 * `components/`. `tests/tabbar.geometry.test.ts` pins the two spellings together — the same
 * device `lib/nina/edit.ts` uses for `EDIT_MAX_CHARS_MINE` and `MAX_RUNNER_MESSAGE_CHARS`.
 */
export const HOME_INDICATOR_TOP_PX = 13

/**
 * The composer's `bottom`, as a CSS length.
 *
 * With no keyboard there are two floors, and the flag decides between them. While the bar is
 * showing, the composer sits on the bar's top edge: the clearance is the bar's own grid, the 1 px
 * `border-t` the grid sits under — the two together are its outer height, and the border is its
 * real top edge — plus the home-indicator inset the bar pads itself by. That is R2's sum, and
 * landing anywhere else paints `bg-paper/90` over the bar or opens the seam under it.
 *
 * At rest — `/nina`'s default, the bar hidden (R1) — the floor is the home-indicator pill's top
 * line, `min(var(--safe-bottom), 13px)`. The owner asked for the two gaps around the query field
 * to be equal: the top line of the field to the top line of the bar (the 12 px of `py-3`) and the
 * bottom line of the field to the pill. Resting the bar's own bottom edge ON the pill's top is
 * what makes the second gap the same 12 px — the old floor, the inset's top line, left a 21 px
 * band of raw page under the bar that the pill floated in. The `min()` half is for everything
 * that is not a notched iPhone: with no inset both floors are 0 and the geometry is the old one
 * (which was already balanced, desktop having no pill to measure to), and with a shallow inset
 * the inset itself is the honest floor — no device's composer may sit inside its system inset.
 *
 * With a keyboard, the keyboard's top edge is the floor and every one of those terms is behind it.
 * That branch is unchanged by R1: a bar behind the keyboard clears nothing either way.
 *
 * ── WHY A MULTIPLIER AND NOT A LENGTH ────────────────────────────────────────────────────────
 * `calc(<length> * <number>)` keeps the number 59 in this function, where the caller already
 * passes it, instead of moving it into whichever component writes the variable. The flag then says
 * one thing only — is the bar on screen — and cannot disagree with `TAB_BAR_OUTER_HEIGHT_PX` about
 * how tall the bar is. A `var(--nina-bar-clearance, 0px)` form would make this argument dead and
 * put the geometry in two places. The rest-state floor rides inside the same multiplication,
 * weighted by the flag's complement, because the composer cannot be told the bar state — the CSS
 * variable is its only channel (see `NINA_BAR_VISIBLE_VAR`) — and a second `bottom` rule in the
 * component would be exactly the second spelling of one position this function exists to prevent.
 *
 * Returns a string because that is what the style attribute takes, and because `var(--safe-bottom)`
 * cannot be resolved in JavaScript — `env(safe-area-inset-bottom)` is only readable to CSS.
 */
export function composerBottomCss(overlapPx: number, chromeClearancePx: number): string {
  if (Number.isFinite(overlapPx) && overlapPx > 0) return `${Math.round(overlapPx)}px`
  const clearance = Number.isFinite(chromeClearancePx) ? Math.round(chromeClearancePx) : 0
  return (
    `calc(var(${NINA_BAR_VISIBLE_VAR}, 0) * (${clearance}px + var(--safe-bottom)) + ` +
    `(1 - var(${NINA_BAR_VISIBLE_VAR}, 0)) * min(var(--safe-bottom), ${HOME_INDICATOR_TOP_PX}px))`
  )
}
