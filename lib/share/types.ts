import type { HrMaxSource } from '@/lib/metrics/hrMax'

/**
 * The shapes that actually reach `/s/[token]`'s JSX — and, for the chart props below, the shapes
 * that cross a `'use client'` boundary and therefore get serialised into the page's RSC flight
 * payload **verbatim, whether they are rendered or not**.
 *
 * ── WHY THESE ARE HAND-WRITTEN AND NOT `Pick<SharedRun, …>` ────────────────────────────────────
 * A `Pick` widens silently. Add a column to `getRunByShareToken`'s projection and every `Pick` of
 * it that happens to list a field by name keeps compiling while the *object* it describes grows.
 * An independent interface has to be hand-edited, which is the entire point: a new field reaching
 * the public page should cost somebody a decision, not zero keystrokes.
 *
 * ── WHY `HrMaxSource` IS A TYPE-ONLY IMPORT ────────────────────────────────────────────────────
 * `import type` erases at compile time, so this file's import graph does **not** contain
 * `lib/metrics/hrMax.ts` at runtime — F02's INVARIANT B says `/s/[token]` must never be able to
 * resolve HRmax live, and `tests/share.bundle.test.ts` asserts the module never appears in the
 * page's runtime graph. Naming the union here would duplicate a contract; importing its *type*
 * costs nothing at runtime. Do not turn this into a value import.
 */

/** One screenshot the owner left included. `blob_url` is its own bearer secret — see §3.4/R-15. */
export interface SharedPhotoView {
  blobUrl: string
  /** 'summary' | 'splits' | 'heartrate' | 'other' — the label under the thumbnail. */
  kind: string
  width: number | null
  height: number | null
}

/**
 * The insight, after R-27 has taken `doNext` and `questionForRunner` out.
 *
 * `hrMaxUsed` / `hrMaxSource` are **frozen values** read off `insights.payload` (R-11), computed
 * once inside the authenticated path at generation time. `avgHrPctMax` below is a division of two
 * already-stored integers, which is the only arithmetic this feature performs — never a resolver
 * call, never a formula, never a default denominator.
 */
export interface SharedInsightView {
  headline: string | null
  verdict: string | null
  whatHappened: string | null
  observations: Array<{ title: string | null; detail: string | null; metric: string | null }>
  hrMaxUsed: number | null
  hrMaxSource: HrMaxSource | null
}

/** One `run_splits` row as the public table and chart read it. */
export interface SharedSplitView {
  km: number
  timeSec: number
  paceSec: number
  hr: number | null
  cadence: number | null
  partial: boolean
}

/** One `run_zones` row. */
export interface SharedZoneView {
  zone: 1 | 2 | 3 | 4 | 5
  durationSec: number
  minBpm: number | null
  maxBpm: number | null
}

/**
 * Everything the public page has, and nothing else.
 *
 * Absent by construction, each for its own reason: `userId` and the owner's name (a shared run is a
 * run, not a profile), `note` (§3.3.1), `startedAt` / `endedAt` and `location` (behind
 * `SHARE_SHOWS_*`, and stripped here rather than merely unrendered so an accidental `{...run}`
 * spread into a client component cannot leak them), `reviewedAt` / `correctedAt` / `extractionId`
 * (provenance metadata with no product use in front of a stranger), and every badge, record and
 * rollup (§3.8 — a claim about this runner's history is not a claim about this session).
 */
export interface SharedRunView {
  occurredOn: string
  activityType: string
  distanceM: number
  durationSec: number
  avgPaceSec: number
  avgHr: number | null
  maxHr: number | null
  avgCadence: number | null
  activeKcal: number | null
  elevationM: number | null
  /**
   * **`intent` is deliberately absent, against F11 §5's own include table.**
   *
   * That table lists it as shown, and the argument for it is reasonable — the runner's one-word
   * label for what the session was FOR is cheap context that discloses nothing the distance and
   * pace do not already imply. F03 disagreed and shipped `getRunByShareToken` without it, with the
   * key list pinned closed by `tests/db.queries.shares.test.ts` ("never selects note, user_id or
   * extraction internals", which names `intent` among the forbidden keys).
   *
   * **F03 wins.** A tested exclusion in the one unscoped read in the application is a stronger
   * position than a nice-to-have in a plan's table, and widening that projection to gain a chip is
   * a bad trade at any price. Recorded here rather than silently dropped, so nobody re-derives the
   * question.
   */
  /** Present only when `SHARE_SHOWS_LOCATION`. Null in the shipped default. */
  location: string | null
  /** Present only when `SHARE_SHOWS_TIME_OF_DAY`. Null in the shipped default. */
  startedAt: string | null
  splits: SharedSplitView[]
  zones: SharedZoneView[]
  photos: SharedPhotoView[]
  insight: SharedInsightView | null
  /** `avgHr / insight.hrMaxUsed × 100`, or null when either half is missing. Never a fallback. */
  avgHrPctMax: number | null
}
