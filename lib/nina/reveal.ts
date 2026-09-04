/**
 * The reveal schedule for a multi-bubble turn (RU-5), as one pure function.
 *
 * Extracted from `components/nina/ChatScreen.tsx` for the reason `lib/photos/gallery.ts` was
 * extracted from `PhotoViewer.tsx`, and the argument is that file's verbatim: `vitest.config.ts`
 * runs `environment: 'node'` with an `include` that matches `*.test.ts` only, so there is no
 * jsdom, no testing library and no timer to advance inside a rendered component. **This is the
 * whole of the behaviour**, and a pure function is the only version of it this repo can prove.
 *
 * ── WHY THE FIRST GAP IS ZERO ─────────────────────────────────────────────────────────────────
 * The client has all of Nina's bubbles the moment the Server Action resolves — RU-5 chose
 * staggered multi-bubble over SSE precisely so there is no stream to wait on. And resolving takes
 * a while: the analysis records fifteen live `glm-5.3` calls at 10.2–16.4 s, clustering at 13–16.
 * The runner has therefore already watched a typing indicator for that long. Making him wait
 * another 700 ms for the first line would be a lie told for atmosphere. The stagger exists to
 * separate her second, third and fourth thoughts from her first, and that is all it does.
 *
 * ── WHY THERE IS A TOTAL CEILING AND NOT JUST A PER-BUBBLE ONE ────────────────────────────────
 * Four bubbles at the per-bubble ceiling is 4.2 s of pure delay on top of a 16 s turn. That is a
 * fifth of the interaction spent on a typing animation. `REVEAL_TOTAL_CEILING_MS` scales the whole
 * schedule down proportionally when it would exceed the budget, so the *rhythm* survives (a long
 * bubble still gets a longer pause than a short one) while the total stays honest.
 *
 * ── WHY THE SCALED FLOOR CANNOT FIGHT THE CEILING, FOR THE COUNTS THAT MATTER ─────────────────
 * With `REVEAL_MAX_BUBBLES = 4` there are at most three non-zero gaps, each at least
 * `REVEAL_FLOOR_MS` (450) and at most `REVEAL_CEILING_MS` (1400). The worst total before scaling
 * is 3 x 1400 = 4200, so the smallest scale factor is 3200/4200 = 0.762, and the smallest scaled
 * gap is 450 x 0.762 = 343 ms — comfortably above `REVEAL_SCALED_FLOOR_MS` (150). So for every
 * schedule RU-5 permits, the floor never binds and the ceiling holds exactly. Above four bubbles
 * the floor wins instead, deliberately: a gap of 40 ms is not a reveal, it is a flicker, and a
 * caller that ignored the clamp has a bug that should look like one.
 *
 * ── WHY THE SCALED GAPS FLOOR RATHER THAN ROUND ───────────────────────────────────────────────
 * `Math.round` on each scaled gap can round every one of them *up*, and the ceiling is then missed
 * by the sum of those roundings: three gaps of `round(1400 x 3200/4200)` = 1067 total 3201, one
 * millisecond over a budget this module promises to hold exactly. `Math.floor` cannot overshoot,
 * costs at most one millisecond per gap in the other direction, and makes "the total stays honest"
 * true as written rather than nearly true. The unscaled gaps still round, because they are not
 * summing against a budget.
 */

/** The pause before a bubble whose body is empty — she still had to press send. */
export const REVEAL_FLOOR_MS = 450

/**
 * Per code point of trimmed body. 11 ms is not a typing speed — a real mobile typist is nearer
 * 300 ms per character and a 120-character bubble would take half a minute. It is the coefficient
 * that puts a short bubble near the floor and a long one near the ceiling, which is the only
 * signal the pause is carrying.
 */
export const REVEAL_MS_PER_CHAR = 11

/** No single pause exceeds this, however long the bubble. */
export const REVEAL_CEILING_MS = 1400

/** The whole schedule's budget. Exceeding it scales every gap down proportionally. */
export const REVEAL_TOTAL_CEILING_MS = 3200

/** After scaling, no gap drops below this. See the header for why it never binds at n <= 4. */
export const REVEAL_SCALED_FLOOR_MS = 150

/** RU-5's clamp, restated here because the ceiling arithmetic above depends on it. */
export const REVEAL_MAX_BUBBLES = 4

/**
 * The gap, in milliseconds, to wait after bubble `i - 1` has appeared before showing bubble `i`.
 *
 * Element 0 is always exactly 0. The returned array has the same length as `bodies`, so a caller
 * can zip it against the bubbles without a second thought. An empty input returns an empty array.
 *
 * Code points rather than UTF-16 units (`[...body]`, not `body.length`): an emoji is one thing she
 * typed, not two, and Jakarta slang carries plenty of them.
 */
export function planReveal(bodies: readonly string[]): number[] {
  if (!Array.isArray(bodies) || bodies.length === 0) return []

  const gaps = bodies.map((body, index) => (index === 0 ? 0 : gapFor(body)))
  const total = gaps.reduce((sum, gap) => sum + gap, 0)
  if (total <= REVEAL_TOTAL_CEILING_MS) return gaps

  const factor = REVEAL_TOTAL_CEILING_MS / total
  return gaps.map((gap, index) =>
    index === 0 ? 0 : Math.max(REVEAL_SCALED_FLOOR_MS, Math.floor(gap * factor)),
  )
}

function gapFor(body: string): number {
  const chars = typeof body === 'string' ? [...body.trim()].length : 0
  const raw = REVEAL_FLOOR_MS + chars * REVEAL_MS_PER_CHAR
  if (!Number.isFinite(raw)) return REVEAL_FLOOR_MS
  return Math.min(REVEAL_CEILING_MS, Math.max(REVEAL_FLOOR_MS, Math.round(raw)))
}
