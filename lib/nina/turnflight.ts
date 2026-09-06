/**
 * **When is Nina still answering, how often do we ask, and when do we stop asking.**
 *
 * ── WHY THIS IS A ZERO-IMPORT MODULE ──────────────────────────────────────────────────────────
 * Three runtimes read these numbers and they must not drift: `lib/nina/actions.ts` (the server's
 * deadline and its sweep), `components/nina/ChatScreen.tsx` (the client's poll schedule and its
 * give-up), and `app/nina/page.tsx` (the cold-load heuristic that decides whether a freshly
 * rendered screen should start polling at all). `lib/nina/imagerecipe.ts` is the precedent — the
 * same reasoning, one feature over — and it is why nothing here imports a database, an env reader
 * or `server-only`.
 *
 * ── THE ONE PROPERTY EVERY NUMBER BELOW SERVES ────────────────────────────────────────────────
 * `NINA_TURN_BUDGET.overall` is 45 s (`lib/nina/turn.ts:76`). A turn also costs one context load,
 * one history load and one tuning read up front and up to four row inserts at the end — call it
 * 5 s of slack, so a healthy turn is done inside 50 s. `NINA_TURN_STALE_MS` is 90 s: 1.8x that,
 * which is the same ratio and the same literal `lib/extract/constants.ts`'s `STALE_PENDING_MS`
 * chose against a 34 s median. A turn still `pending` at 90 s is dead, not slow.
 */

/**
 * A `nina_turns` chat row still `pending` after this long is a turn whose process died — killed
 * mid-flight, or cut off by the segment's ceiling. `sweepStaleNinaChatTurns` closes it, and both
 * the client and the poll stop waiting for it.
 *
 * **It is also the client's give-up**, deliberately: the poll that gives up is the poll that has
 * already been told the row is dead, so the runner's last request is the one that makes the screen
 * honest. `lib/extract/constants.ts` states the identity for the extraction path in the same words.
 */
export const NINA_TURN_STALE_MS = 90_000

/** The client's give-up. Identical to the server's deadline, on purpose — see above. */
export const NINA_TURN_POLL_GIVE_UP_MS = NINA_TURN_STALE_MS

/**
 * The backoff. Fifteen live `glm-5.3` calls measured 10.2–16.4 s (the reveal module's own note), so
 * the first six polls are close together — a 1.5 s lag on a 13 s wait is invisible — and then it
 * relaxes, because a turn still running at 30 s is a turn running long and will not finish in the
 * next second either.
 */
export const NINA_TURN_POLL_INTERVALS_MS = { initial: 1_500, mid: 2_500, late: 4_000 } as const
export const NINA_TURN_POLL_MID_AFTER_ATTEMPTS = 6
export const NINA_TURN_POLL_LATE_AFTER_ATTEMPTS = 14

/**
 * **The background task's own wall-clock budget, and the one literal phase 2's outcome moves.**
 *
 * A Server Action's timeout is the PAGE SEGMENT's (`app/nina/page.tsx`), and `after()` runs for
 * that same budget — Next 16.3.1's `after` reference: *"`after` will run for the platform's default
 * or configured max duration of your route."* Phase 2 raises that segment from 60 to 300 after its
 * Fluid-compute probe.
 *
 *   probe PASSED (300 s ceiling)  -> 240_000 here, `NINA_TURN_CHAIN_MAX` 2. One turn is ~50 s and a
 *                                    distillation is ~20 s, so three chained links are ~210 s and
 *                                    fit with 90 s of margin.
 *   probe FAILED  (60 s ceiling)  -> change this to 45_000 and `NINA_TURN_CHAIN_MAX` to 0. The
 *                                    split still works and is still strictly better than today,
 *                                    because the 60 s is no longer partly spent with the runner
 *                                    watching a grey bubble. He simply has to send again to get a
 *                                    burst answered, which is what the 'no-reply' notice tells him.
 *
 * **THE PROBE PASSED.** Phase 2 measured it on 2026-09-06: `GET /nina/probe?inline=1` returned
 * HTTP 200 after 90.418 s, and an `after()` callback registered by a request that returned in
 * 1.25 s went on ticking server-side for a further 90 s — crossing 60 s with the connection already
 * closed — on a preview served from `sin1`, production's own region, on a segment carrying
 * `maxDuration = 300`. So the values below are the Branch A pair and stay as written.
 *
 * **THE TWO LITERALS MOVE TOGETHER, AND THE SUITE ENFORCES THE HALF THAT BITES.** The inequality
 * `lib/nina/turnflight.test.ts` asserts is about the FOLLOW-UP links, not the first one:
 *
 *     NINA_TURN_CHAIN_MAX * (NINA_TURN_BUDGET.overall + 25_000)
 *       <= NINA_BACKGROUND_BUDGET_MS - NINA_TURN_BUDGET.overall
 *
 * which is exactly `runNinaBackgroundTurn`'s own wall-clock guard, written as arithmetic. Branch A:
 * `2 * 70_000 = 140_000 <= 240_000 - 45_000 = 195_000`. Branch B: `0 <= 45_000 - 45_000 = 0`. Both
 * hold. Lower this to 45_000 and leave the chain at 2 and it reads `140_000 <= 0` and fails, which
 * is the dangerous direction and the one worth failing on: a chain that starts links the invocation
 * cannot finish spends money on turns that get killed mid-flight.
 *
 * (An earlier draft asserted `(CHAIN_MAX + 1) * perLink <= BUDGET`, which counted the FIRST link
 * against a budget that does not bound it — `runNinaTurn` bounds itself with `NINA_TURN_BUDGET`,
 * and the response has already gone out. That formulation is arithmetically false on Branch B —
 * `70_000 <= 45_000` — so the documented Branch B values would have failed the suite the moment
 * anyone took that branch. Corrected during reconciliation.)
 *
 * Nothing else in this phase depends on which of the two it is.
 */
export const NINA_BACKGROUND_BUDGET_MS = 240_000

/**
 * How many FOLLOW-UP turns one background task may run for messages that arrived while it was
 * working. See `runNinaBackgroundTurn`'s chain, and `NINA_BACKGROUND_BUDGET_MS` above for why the
 * number is 2 and when it must be 0.
 */
export const NINA_TURN_CHAIN_MAX = 2

/** The delay before poll number `attempts` (0-based). Pure; `pollDelayFor` one feature over. */
export function ninaPollDelayFor(attempts: number): number {
  if (attempts >= NINA_TURN_POLL_LATE_AFTER_ATTEMPTS) return NINA_TURN_POLL_INTERVALS_MS.late
  if (attempts >= NINA_TURN_POLL_MID_AFTER_ATTEMPTS) return NINA_TURN_POLL_INTERVALS_MS.mid
  return NINA_TURN_POLL_INTERVALS_MS.initial
}

/** The two fields the awaiting question needs off the newest row of a conversation. */
export interface NinaFlightRow {
  role: 'runner' | 'nina'
  seq: number
  createdAt: Date
}

/**
 * **"Is there a message of his that has not been answered yet?"** — from the messages alone.
 *
 * TRUE iff the newest row in the session is HIS and it is younger than the deadline. Both halves
 * matter. Without the first, a screen would wait for a reply that already arrived. Without the
 * second, a message she never answered a week ago would put a typing indicator on the screen
 * forever and start a poll on every page load for the rest of time.
 *
 * This is a HEURISTIC where `app/nina/page.tsx` uses it (a cold load has no claim row in hand) and
 * it is exactly right where `pollNinaReply` uses it (the poll ORs it with the live claim). The two
 * can disagree for at most one poll interval: a turn that died at 5 s leaves the heuristic saying
 * "awaiting" until 90 s, and the first poll's authoritative answer corrects the screen inside two
 * seconds. That direction of error is the safe one — it starts a poll that finds the truth, rather
 * than hiding a reply that is already on the way.
 */
export function ninaAwaitingByMessage(newest: NinaFlightRow | null, nowMs: number): boolean {
  if (newest === null) return false
  if (newest.role !== 'runner') return false
  return nowMs - newest.createdAt.getTime() < NINA_TURN_STALE_MS
}

/** What `app/nina/page.tsx` hands `ChatScreen`. */
export interface NinaFlightView {
  /** Start the typing indicator and the poll on mount. */
  awaiting: boolean
  /** `nina_messages.seq` of the newest row on screen — where the poll resumes from. */
  cursor: number
}

/**
 * The cold-load view, computed from rows the page has already read. **Zero extra queries** — the
 * whole reason this is a pure function over `listNinaMessages`'s output rather than a fifth read in
 * the page's `Promise.all`.
 *
 * `rows` is OLDEST FIRST, which is what `listNinaMessages` returns and what the page renders
 * straight down; the newest row is therefore the last one.
 *
 * `cursor: 0` for an empty conversation. `nina_messages.seq` is a `bigserial` starting at 1, so 0 is
 * below every row that can exist and "everything after 0" is "everything" — which is the correct
 * answer for a screen holding nothing.
 */
export function ninaFlightView(rows: readonly NinaFlightRow[], nowMs: number): NinaFlightView {
  const newest = rows.length === 0 ? null : (rows[rows.length - 1] ?? null)
  return {
    awaiting: ninaAwaitingByMessage(newest, nowMs),
    cursor: newest?.seq ?? 0,
  }
}
