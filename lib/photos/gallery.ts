/**
 * The two decisions a swipeable photo overlay has to get right, as pure functions.
 *
 * Split out of `components/ui/PhotoViewer.tsx` for the same reason `resizeTarget.ts` is split out
 * of the compressor: **this is the whole of the behaviour**, and a pure function is the only
 * version of it this repo's test runner can prove. `vitest.config.ts` runs `environment: 'node'`
 * with an `include` that matches `*.test.ts` only — there is no jsdom, no testing library, and no
 * `TouchEvent`. See `tests/ui.sheetFocus.test.ts` for the fuller argument; the short version is
 * that a rendered-scenario test would prove one gesture and this proves the rule.
 *
 * Two callers, one for each function, and that is deliberate:
 *
 *   - `stepIndex` is called by BOTH the swipe handler and the arrow-key handler. Before F18 the
 *     arrows clamped (`Math.min(index + 1, photos.length - 1)`) while the swipe did not exist, so
 *     "circular" had exactly one implementation to disagree with. Routing both through one
 *     function is what stops the swipe wrapping while the keyboard silently does not.
 *   - `decideSwipe` is the gate that keeps the native pinch-zoom alive. Rules 1–3 below are the
 *     entire protection, and they are here rather than in the component so they can be asserted
 *     without a browser.
 */

/**
 * The next index, wrapping in both directions. `count <= 0` returns 0 rather than `NaN`.
 *
 * ── WHY THE DOUBLE MODULO ────────────────────────────────────────────────────────────────────
 * JavaScript's `%` keeps the sign of the *dividend*, so `(0 - 1) % 3` is `-1`, not `2`. A single
 * `%` therefore wraps forward and not backward — which is precisely the case F18 was asked for:
 * a swipe backwards off the FIRST photo must land on the last. `((n % c) + c) % c` normalises the
 * negative branch, and is correct for `|delta| > count` as well, so a future two-photo jump needs
 * no second thought.
 */
export function stepIndex(current: number, delta: number, count: number): number {
  if (!Number.isFinite(count) || count <= 0) return 0
  return (((current + delta) % count) + count) % count
}

/**
 * The minimum horizontal travel, in CSS px, before a drag counts as a page turn.
 *
 * 48 px is a deliberate ~2× the 24 px iOS treats as the end of a tap: the overlay's other gesture
 * is a vertical scroll through a 1600 px-tall screenshot, and a thumb dragging down a phone
 * screen wanders sideways by more than a tap's worth on the way.
 */
export const SWIPE_MIN_DISTANCE = 48

/**
 * How much more horizontal than vertical a drag must be to count as a page turn.
 *
 * Above 1, so a drag that is genuinely diagonal loses to the scroll container rather than doing
 * both. Kept low (1.2 rather than 2) because the overlay's images are portrait and near-vertical
 * drags are already rejected by the ratio; a stricter value starts refusing real swipes made with
 * a thumb, which arc.
 */
export const SWIPE_DOMINANCE = 1.2

/** What the component measures from a `touchend`, with no DOM types in the signature. */
export interface SwipeGesture {
  /** `end.clientX - start.clientX`. Negative when the finger moved left. */
  dx: number
  /** `end.clientY - start.clientY`. */
  dy: number
  /** The MAXIMUM concurrent touches seen at any point in the gesture, not the count at the end. */
  touches: number
  /** Whether the pan container could scroll on x — i.e. the image overflows its box. */
  canPanHorizontally: boolean
  /** `visualViewport.scale` at the end of the gesture; 1 when the page is not zoomed. */
  zoomScale: number
}

export type SwipeDecision = 'next' | 'prev' | 'none'

/**
 * `visualViewport.scale` is a float and lands on 1.0000000000000002-style values after a
 * pinch-and-release, so "is the page zoomed" cannot be `> 1`.
 */
const ZOOM_EPSILON = 0.01

/**
 * Whether a finished drag should turn the page, and which way.
 *
 * ── THE THREE RULES THAT PROTECT THE NATIVE ZOOM ─────────────────────────────────────────────
 * The overlay's pan container is `touch-action: pinch-zoom` on purpose — the browser's own
 * two-finger zoom and momentum panning, which a JS pinch handler could only imitate worse and
 * would fight VoiceOver doing it. A page-turn handler that swallowed those gestures would be a
 * regression, so:
 *
 *   1. more than one finger is a pinch, never a page turn — and the count is the MAXIMUM seen
 *      during the gesture, because a pinch that begins with one finger down still has to lose;
 *   2. a zoomed page means a horizontal drag is the user panning around the enlarged image;
 *   3. so does an image wider than its box, which is the same situation without the viewport
 *      itself being scaled.
 *
 * Rules 4 and 5 then separate a swipe from a tap and from a vertical scroll of a tall screenshot.
 *
 * ── THE DIRECTION MAPPING ────────────────────────────────────────────────────────────────────
 * Finger left (`dx < 0`) brings the NEXT photo in from the right, as in iOS Photos, and reads
 * correctly against the left-to-right dot row at the bottom of the overlay. Card #8's wording
 * ("swipe left on first → last") describes travel through the list rather than finger direction;
 * the circular property is identical under either mapping, only which gesture goes which way
 * differs. Confirmed with the author before this shipped.
 */
export function decideSwipe(gesture: SwipeGesture): SwipeDecision {
  const { dx, dy, touches, canPanHorizontally, zoomScale } = gesture
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return 'none'
  if (touches > 1) return 'none'
  if (zoomScale > 1 + ZOOM_EPSILON) return 'none'
  if (canPanHorizontally) return 'none'
  if (Math.abs(dx) < SWIPE_MIN_DISTANCE) return 'none'
  if (Math.abs(dx) < Math.abs(dy) * SWIPE_DOMINANCE) return 'none'
  return dx < 0 ? 'next' : 'prev'
}
