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
 * would put a 40 px settle into the first paint of every conversation.
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
 * When `NinaSidebar`'s panel re-asserts the focused field's visibility, in ms after the field
 * gained focus inside the open panel — the schedule half of the fix whose box half is
 * `NINA_KEYBOARD_OVERLAP_VAR` above.
 *
 * ── WHY ASSERT AT ALL, WHEN THE PANEL ALREADY ENDS AT THE KEYBOARD ────────────────────────────
 * `bottom: var(--nina-kb-overlap, 0px)` ends the panel's BOX at the keyboard's measured top edge,
 * and the owner's report survived it, because the search field sits at the top of a tall content
 * block inside the panel's OWN `overflow-y-auto` container — and when the keyboard opens over a
 * field inside a scrollable container, iOS Safari scrolls THAT CONTAINER as its "reveal": a
 * `scrollTop` the panel's box geometry says nothing about. The var then shrinks the panel a beat
 * later (visualViewport resize → React state → effect → style), the container keeps its scrolled
 * offset, and the field rides up out of the container's top edge with the keyboard holding the
 * bottom of the glass. The composer never lifts, and it is the one fixed element on this screen
 * that is inside no scroll container at all — the distinguishing fact.
 *
 * So the panel ASSERTS rather than measures: on each focus into one of its text fields, it calls
 * `scrollIntoView({ block: 'nearest', behavior: 'instant' })` on that field — which walks EVERY
 * scrollable ancestor at once (the panel's own container and the document) and corrects whichever
 * one Safari scrolled, without needing to know which fired. It is idempotent: `nearest` on an
 * already-visible element computes zero scroll, so an assert with nothing to correct costs
 * nothing, keyboard or no keyboard.
 *
 * ── WHY A SCHEDULE, AND WHY THESE NUMBERS ────────────────────────────────────────────────────
 * The frame in which Safari performs its reveal is not observable from here — there is no event
 * for "a container was scrolled by the reveal", and a second `visualViewport` subscription is the
 * thing `ChatChrome`'s docstring forbids. Asserting repeatedly across the window in which the
 * keyboard and the panel's box are still settling turns "catch the one right moment" into "be
 * right at every moment", and the whole rule is five numbers:
 *
 *   - `0` — the same frame as the focus. Whatever the reveal scrolled, it scrolled it
 *     synchronously with the focus event, before any keyboard animation began.
 *   - `120` — mid-rise. The iOS keyboard animation runs ~300 ms and the visual viewport moves
 *     most of its total in its first half.
 *   - `300` — at the animation's end, where the reveal's second pass often fires: the layout has
 *     settled but the panel's `bottom` var is still one React commit behind.
 *   - `600` — clear of the whole chain, not just the animation: the `visualViewport` resize →
 *     `setOverlap` → style-write round trip that finally shrinks the panel, and any re-reveal
 *     Safari performs against the new box.
 *   - `1000` — the tail, for a slow first dispatch on an overloaded phone. And it is the END, on
 *     purpose: after one second the scroll position is the runner's own act, and an assert that
 *     kept firing would drag the panel back every time he scrolled the focused field away to
 *     read beside it.
 *
 * `readonly number[]` because the component must not be able to mutate the schedule it runs on.
 * The component measures (focus landed, focus still held); this decides when.
 */
export const KEYBOARD_REASSERT_DELAYS_MS: readonly number[] = [0, 120, 300, 600, 1000]

/**
 * The composer's `bottom`, as a CSS length. Its partner is `composerPadBottomCss` below, and
 * neither is correct without the other.
 *
 * With no keyboard it clears the fixed chrome below it — but only when there IS chrome below it.
 * On `/nina` the tab bar is hidden by default, so `chromeClearancePx` is the clearance to apply
 * **while the bar is showing**, and the whole term is multiplied by `NINA_BAR_VISIBLE_VAR`, which
 * is `1` only then. The terms are the bar's own grid, the 1 px `border-t` the grid sits under —
 * the two together are the bar's outer height, and the border is its real top edge — and the
 * home-indicator inset the bar pads itself by.
 *
 * ── THE INSET IS INSIDE THE MULTIPLICATION NOW, AND THAT IS R1 ────────────────────────────────
 * This used to read `calc(59px * var(--nina-bar-visible, 0) + var(--safe-bottom))`: the clearance
 * was gated on the flag and the inset was not, "because the inset is the phone's, not the bar's,
 * and it is there whether or not the bar is". That is true of the phone and false of this
 * element's offset. With the flag at 0 — the resting state of this very screen — the bar's bottom
 * edge sat one inset ABOVE the bottom of the viewport and the conversation showed through the
 * strip underneath it. That strip is the gap the repo owner reported: *"ada gap diantara chat
 * query field dengan bagian bawah"* — the bottom of the screen, not the tab-bar seam.
 *
 * So the inset moves inside the gate and out into the element's own `padding-bottom`, where
 * `composerPadBottomCss` picks it up with the complementary gate. The two gates sum to exactly
 * one inset in every state, which is the rule the old docstring was defending and the state it
 * did not cover — though the hidden state's padding is the resting floor now, not the bare
 * inset: see `composerPadBottomCss` for that number's own history.
 *
 * | bar     | flag | `bottom`             | `padding-bottom`  | inset counted |
 * |---------|------|----------------------|-------------------|---------------|
 * | hidden  | 0    | `0`                  | the resting floor | once, as padding |
 * | shown   | 1    | `40px + safe-bottom` | `0`               | once, in the offset |
 * | keyboard| —    | `<overlap>px`        | `0`               | not at all — it is behind the keyboard |
 *
 * With a keyboard, the keyboard's top edge is the floor and every one of those terms is behind
 * it. A bar behind the keyboard clears nothing either way.
 *
 * The border term is worth saying why it was once missing: a clearance of the grid alone (39) puts
 * this bar's bottom edge one pixel BELOW the bar's top border, so the conversation shows through
 * the seam. The caller passes the outer height (40) and the two are flush.
 *
 * ── WHY A MULTIPLIER AND NOT A LENGTH ────────────────────────────────────────────────────────
 * `calc(<length> * <number>)` keeps the number 59 in this function, where the caller already
 * passes it, instead of moving it into whichever component writes the variable. The flag then says
 * one thing only — is the bar on screen — and cannot disagree with `TAB_BAR_OUTER_HEIGHT_PX` about
 * how tall the bar is. A `var(--nina-bar-clearance, 0px)` form would make this argument dead and
 * put the geometry in two places. `calc((<length> + <length>) * <number>)` is the same rule with
 * two lengths in the sum, and is valid CSS: a sum of lengths times a plain number is a length.
 *
 * Returns a string because that is what the style attribute takes, and because `var(--safe-bottom)`
 * cannot be resolved in JavaScript — `env(safe-area-inset-bottom)` is only readable to CSS.
 */
export function composerBottomCss(overlapPx: number, chromeClearancePx: number): string {
  if (Number.isFinite(overlapPx) && overlapPx > 0) return `${Math.round(overlapPx)}px`
  const clearance = Number.isFinite(chromeClearancePx) ? Math.round(chromeClearancePx) : 0
  return `calc((${clearance}px + var(--safe-bottom)) * var(${NINA_BAR_VISIBLE_VAR}, 0))`
}

/**
 * The composer's own `padding-bottom`, as a CSS length. The other half of `composerBottomCss`.
 *
 * It is the resting floor under the input row in exactly the one state where this bar is the
 * bottom-most painted thing on the screen — the tab bar hidden, no keyboard — and nothing in the
 * other two. `1 - var(--nina-bar-visible, 0)` is the complement of the gate the offset uses, so
 * the floor is added by precisely one of the two terms and the composer's painted box always
 * reaches the bottom of whatever is beneath it without ever double-counting the phone's inset.
 *
 * ── THE FLOOR IS THE TAB CAPTIONS' FLOOR, VERBATIM ───────────────────────────────────────────
 * The gap under the field's bottom line used to be this bar's own `py-2` (8 px) plus the whole
 * home-indicator inset — 42 px on an XS Max, most of it frosted glass with nothing in it. The
 * owner cut it to "just 30% of the original", asked for a pixel back, and then — with the tab
 * bar's captions settled at a distance he had just called right — asked for "the same value that
 * no 1 use": the captions' 21.75 px. That number is `inset / 2 + 4.75` (R4's halving, in
 * `components/ui/TabBar.tsx`), so with the 8 px of `py-2` staying — the top of this bar and the
 * keyboard state's floor share it — the padding carries `inset / 2 + 4.75px - 8px = inset / 2 -
 * 3.25px`, floored at zero. On glass with no inset (a desktop window, a home-button phone) the
 * floor was already the bare 8 px of `py-2` and it stays exactly that — the reported gap never
 * existed there. The `max()` is also what keeps R1's own rule intact: the padding can never go
 * negative, so the painted box still reaches the bottom of the viewport and no strip of
 * conversation reopens underneath.
 *
 * ── WHY IT TAKES THE OVERLAP AND NOT JUST THE FLAG ───────────────────────────────────────────
 * Because engaging the composer HIDES the bar (`nextBarState`'s `'composer-engaged'`), so the flag
 * is 0 with the keyboard up and a flag-only rule would pad by the inset there. The keyboard is
 * already the floor; the home indicator is behind it. Padding by the inset would lift the textarea
 * ~34 px off the keyboard's top edge, which is the same class of mistake as the unpainted strip,
 * one state over. The overlap is the only signal that tells the two apart, and `composerBottomCss`
 * already takes it — one argument, same first parameter, same branch.
 *
 * `'0px'` rather than `'0'`: this is a length going into `style.paddingBottom`, and a unitless
 * zero read back out of `getComputedStyle` is a different string than the one written in. The
 * one place that reads this element's box is `ChatChrome`'s `ResizeObserver`, which measures
 * pixels rather than parsing the declaration, but a length-typed function should return a length.
 *
 * A string, for the same two reasons `composerBottomCss` returns one.
 */
export function composerPadBottomCss(overlapPx: number): string {
  if (Number.isFinite(overlapPx) && overlapPx > 0) return '0px'
  return `calc(max(0px, var(--safe-bottom) / 2 - 3.25px) * (1 - var(${NINA_BAR_VISIBLE_VAR}, 0)))`
}
