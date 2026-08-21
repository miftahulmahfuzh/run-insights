import type { DateISO, IsoWeekKey, MonthKey } from '@/lib/date/ranges'
import type { SessionMetrics, SplitRow, ZoneRow } from '@/lib/metrics/types'
import { BADGE_KEYS, BADGE_THRESHOLDS as T } from './catalog'
import type { BadgeKey } from './types'

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════
 *  The 22 predicates. **Pure: no database, no `new Date()`, no import of the gateway.**
 * ════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Every `evaluate*Badges` function takes a fully-built context and returns `BadgeKey[]` in catalog
 * order. That contract is the point of the file, not a stylistic nicety: the live award path
 * (`evaluate.ts`, called from the review commit) and the nightly cron sweep call the *same*
 * functions with contexts built by the same code, so a replay can never disagree with what was
 * awarded live. `evaluate.ts` is the only module allowed to import both this file and the gateway.
 *
 * ── WHAT IS NOT HERE, AND WHY ────────────────────────────────────────────────────────────────
 *
 * **No arithmetic that F06 already owns.** `metronome` reads `metrics.paceSdSec`,
 * `cadence_collapse` reads `metrics.cadenceFadeSpm`, `negative_split` reads
 * `metrics.splitDriftSecPerKm`. D2's warning about two implementations of one number applies to
 * badges exactly as it does to metrics, and D14's partial-kilometre exclusion is already baked
 * into every one of those fields — re-deriving them from `splits` here would silently re-admit
 * km 11 and turn an 18 spm fade into a 9 spm one.
 *
 * **No record comparison.** `new_ceiling` and `long_way_home` arrive as booleans computed from
 * F06's `RecomputeResult.changed` — "did a record just move to this run" — rather than as
 * `run.maxHr > previousMax`. Two answers to "is this the longest run" that can disagree is worse
 * than one slow answer (§6).
 *
 * **No clock.** Nothing here asks what time it is. `earnedOn` comes from the run's own
 * `occurred_on`, so a backfilled run's badge is dated to the run rather than to the evening it was
 * typed in, and a test never has to mock global time.
 */

/** One run in a trailing window, newest first. `decouplingPct` is F06's, never re-derived. */
export interface WindowRun {
  runId: string
  distanceM: number
  /** `runs.avg_pace_sec` as stored (D5). */
  avgPaceSec: number
  /** `SessionMetrics.decouplingPct`. null when the run had too few full-km splits to compute it. */
  decouplingPct: number | null
}

export interface SessionBadgeContext {
  run: {
    runId: string
    occurredOn: DateISO
    /** Postgres `time`, 'HH:MM:SS'. null when the screenshot had no start time. */
    startedAt: string | null
    distanceM: number
    activeKcal: number | null
  }
  splits: readonly SplitRow[]
  zones: readonly ZoneRow[]
  metrics: SessionMetrics
  /**
   * Whether this run's `location` has appeared on another reviewed run. **null when the run has no
   * location at all** — which is a different thing from "a location never seen before" and must not
   * earn `tourist`. A blank field is missing data, not a new town.
   */
  locationSeenBefore: boolean | null
  /** Reviewed runs sharing this run's `occurred_on`, including this one. */
  runsOnThisDay: number
  /** `records.longest_distance` moved to this run on this commit (§6). */
  isNewLongestDistance: boolean
  /** `records.highest_max_hr` moved to this run on this commit (§6). */
  isNewHighestMaxHr: boolean
  /**
   * This run and the reviewed runs immediately before it, newest first, at most
   * `windowRuns + 1` long. The extra entry is read purely to edge-detect: see `windowEdgeFires`.
   */
  window: readonly WindowRun[]
}

export interface WeekBadgeContext {
  weekKey: IsoWeekKey
  /** Reviewed runs inside `weekKey`. */
  runsThisWeek: number
  /** Consecutive weeks ending at `weekKey` with `weekRunTarget`+ reviewed runs each. */
  consecutiveQualifyingWeeks: number
}

export interface MonthBadgeContext {
  monthKey: MonthKey
  /** Summed `distance_m` of reviewed runs inside `monthKey`. */
  monthDistanceM: number
}

export interface LifetimeBadgeContext {
  /** Reviewed runs whose `started_at` is before `dawnBefore`, across the whole account. */
  dawnRunCount: number
}

/* ============================================================================
 * Session — 18 of the 22 keys
 * ==========================================================================*/

export function evaluateSessionBadges(ctx: SessionBadgeContext): BadgeKey[] {
  const earned: BadgeKey[] = []
  const { run, metrics } = ctx
  const started = startTimeOf(run.startedAt)
  const full = ctx.splits.filter((s) => !s.partial)
  const kmOne = full.find((s) => s.km === 1) ?? null

  /* String comparison on 'HH:MM:SS', which is what `runs.started_at` already is. Parsing it into a
   * Date would need a date and a timezone to attach it to, and both would be inventions — the
   * column deliberately carries no day. Fixed-width fields make lexical order clock order. */
  if (started != null && started >= T.earlyBirdFrom && started <= T.earlyBirdTo) {
    earned.push('early_bird')
  }
  if (started != null && started > T.lateStartAfter) earned.push('late_start')

  /* Negative split and `fast_start_fool` read the same field from opposite sides, so they can never
   * both fire. A drift of exactly 0 fires neither, which is the honest answer for a run that came
   * back even. */
  const drift = metrics.splitDriftSecPerKm
  if (drift != null && drift < 0) earned.push('negative_split')

  if (metrics.paceSdSec != null && metrics.paceSdSec < T.metronomeSdSec) earned.push('metronome')

  /* §4's worked figure, reproduced: the fixture's ten full kms mean 442.2 s and km 1 ran 396, so
   * the lead is 46.2 s ≥ 30 — and the run positively split, so km 1's optimism was not vindicated.
   * Both halves are required: a fast first km on a run that then held its pace is a good run, and
   * this badge is not about that. */
  const fullMeanPace = mean(full.map((s) => s.paceSec))
  if (
    kmOne != null &&
    fullMeanPace != null &&
    fullMeanPace - kmOne.paceSec >= T.fastStartLeadSec &&
    drift != null &&
    drift > 0
  ) {
    earned.push('fast_start_fool')
  }

  const zone5Pct = metrics.zonePct.find((z) => z.zone === 5)?.pct ?? null
  if (zone5Pct != null && zone5Pct >= T.redlineZone5Pct) earned.push('redline_republic')

  /* Zones 3, 4 and 5 all empty — read off the raw rows rather than the rounded shares, because a
   * share rounded to 0% is not the same claim as a duration of 0 s. An empty zone table fires
   * nothing: "no heart-rate data" must never read as "the entire run was easy". */
  const zoneTotal = ctx.zones.reduce((a, z) => a + z.durationSec, 0)
  const hardSec = ctx.zones.filter((z) => z.zone >= 3).reduce((a, z) => a + z.durationSec, 0)
  if (zoneTotal > 0 && hardSec === 0) earned.push('sandbagger')

  if (metrics.cadenceFadeSpm != null && metrics.cadenceFadeSpm <= -T.cadenceFadeSpm) {
    earned.push('cadence_collapse')
  }

  /**
   * R-26, and the one predicate worth reading the reasoning for. `run_splits` stores one **average**
   * HR per kilometre, not a stream, so the only question this schema can answer is "did km 1's
   * average land in zone 4 or above" — and it is answered against **this run's own** `run_zones`
   * bounds, not a fixed bpm and not a %HRmax band.
   *
   * The alternatives both looked better on the fixture and are both worse. A fixed cutoff (≥164)
   * works for this run by coincidence and breaks the moment two runners have different zone tables.
   * A %HRmax band (154/189 ≈ 81%, which a textbook "zone 4 = 80–90%" would catch) fires a badge
   * that disagrees with the zone chart the runner is looking at on the same screen.
   *
   * On the canonical fixture this correctly does NOT fire: km 1 averaged 154 bpm and this run's
   * zone 4 starts at 164, putting km 1 in zone 3. The badge is exactly as rare as its name implies.
   * A future change that makes it fire here by loosening the threshold is a regression, and
   * `tests/badges.rules.fixture.test.ts` asserts the non-firing to catch it.
   */
  const zone4Floor = ctx.zones.find((z) => z.zone === 4)?.minBpm ?? null
  if (kmOne?.hr != null && zone4Floor != null && kmOne.hr >= zone4Floor) earned.push('warmup_who')

  if (
    windowEdgeFires(
      ctx.window,
      T.windowRuns,
      (w) => spread(w.map((r) => r.distanceM)) <= T.groundhogToleranceM,
    )
  ) {
    earned.push('groundhog_day')
  }

  if (ctx.locationSeenBefore === false) earned.push('tourist')

  if (run.distanceM >= T.halfIshM) earned.push('half_ish')

  if (run.activeKcal != null && run.activeKcal >= T.sweatEquityKcal) earned.push('sweat_equity')

  if (ctx.isNewHighestMaxHr) earned.push('new_ceiling')

  if (ctx.isNewLongestDistance) earned.push('long_way_home')

  if (ctx.runsOnThisDay >= T.twoADayRuns) earned.push('two_a_days')

  /* The sincere counterweight to the joke badges (R-33), and the strictest rule in the catalog:
   * three runs a stranger could not tell apart, none of them drifting. A run whose decoupling could
   * not be computed disqualifies the window rather than being treated as 0 — "we don't know" is not
   * evidence of steadiness. */
  if (
    windowEdgeFires(
      ctx.window,
      T.windowRuns,
      (w) =>
        spread(w.map((r) => r.avgPaceSec)) <= T.boringPaceSpreadSec &&
        w.every(
          (r) => r.decouplingPct != null && Math.abs(r.decouplingPct) < T.boringDecouplingPct,
        ),
    )
  ) {
    earned.push('boring_excellence')
  }

  return inCatalogOrder(earned)
}

/* ============================================================================
 * Week, month, lifetime
 *
 * ── WHY THESE ARE "QUALIFIES NOW", NOT "CROSSED A THRESHOLD" ─────────────────
 * The plan describes these as crossings — `self_reward` fires as a week's count goes 3→4 and does
 * not re-fire at 5. That behaviour is exactly what ships; the *mechanism* is one step simpler than
 * threading a before-and-after count through every context. A period badge's `badges.scope_key`
 * already records **which** week or month earned it, so `evaluate.ts` skips a key whose row already
 * names this scope. "Fires once per qualifying week" falls out of the row that is already there,
 * and the same call is then idempotent — which is what makes the nightly sweep (§8.2) safe to run
 * against periods that have already been awarded, and what makes a post-review edit of an existing
 * run stop being a way to inflate a count.
 * ==========================================================================*/

export function evaluateWeekBadges(ctx: WeekBadgeContext): BadgeKey[] {
  const earned: BadgeKey[] = []
  if (ctx.runsThisWeek >= T.weekRunTarget) earned.push('self_reward')

  /* Fires at 4, 8, 12 consecutive qualifying weeks — `daily-words`' `crossedMultipleOf` convention.
   * A streak that breaks and rebuilds re-fires at 4 again, because `scope_key` is the week the
   * streak ended in and that week is a new one. */
  if (
    ctx.consecutiveQualifyingWeeks >= T.gremlinWeeks &&
    ctx.consecutiveQualifyingWeeks % T.gremlinWeeks === 0
  ) {
    earned.push('consistency_gremlin')
  }
  return inCatalogOrder(earned)
}

export function evaluateMonthBadges(ctx: MonthBadgeContext): BadgeKey[] {
  const earned: BadgeKey[] = []
  // Independent, not nested: a month that lands past 200 km in one commit earns both, and the
  // shelf should say so.
  if (ctx.monthDistanceM >= T.centuryM) earned.push('century_club')
  if (ctx.monthDistanceM >= T.doubleCenturyM) earned.push('double_century')
  return inCatalogOrder(earned)
}

/**
 * `dawn_patrol` is the one badge that never re-earns, and §7 is where the asymmetry is argued: every
 * other crossing rule has a period to re-cross within — a new week, a new month, a rebuilt streak —
 * and a lifetime count has none. Letting it re-fire at 20 and 30 turns "the early mornings add up"
 * into a running scoreboard, which is the streak-pressure mechanic the roadmap's core tenet rules
 * out. The `lifetime` scope in the catalog is what enforces it: `evaluate.ts` skips a lifetime key
 * whose row already exists, whatever the count has since become.
 */
export function evaluateLifetimeBadges(ctx: LifetimeBadgeContext): BadgeKey[] {
  const earned: BadgeKey[] = []
  if (ctx.dawnRunCount >= T.dawnRunCount) earned.push('dawn_patrol')
  return inCatalogOrder(earned)
}

/* ============================================================================
 * Helpers — all pure, all exported for their own tests
 * ==========================================================================*/

/**
 * A trailing-window rule with **edge detection**: the window ending at this run qualifies, and the
 * window ending one run earlier did not.
 *
 * Without the second half, a five-run stretch of identical loops earns `groundhog_day` three times
 * — on runs 3, 4 and 5 — and the count column then reads as if the runner did something new twice.
 * With it, the badge fires on the run that *completes* the pattern and stays quiet while the
 * pattern merely continues. The `size + 1`-th entry in `ctx.window` exists for exactly this check
 * and for nothing else.
 */
export function windowEdgeFires(
  window: readonly WindowRun[],
  size: number,
  qualifies: (runs: readonly WindowRun[]) => boolean,
): boolean {
  if (window.length < size) return false
  if (!qualifies(window.slice(0, size))) return false
  if (window.length > size && qualifies(window.slice(1, size + 1))) return false
  return true
}

/** max − min. `0` for a single value, which is what makes a one-run window trivially "tight". */
function spread(values: readonly number[]): number {
  if (values.length === 0) return Number.POSITIVE_INFINITY
  return Math.max(...values) - Math.min(...values)
}

function mean(values: readonly number[]): number | null {
  if (values.length === 0) return null
  return values.reduce((a, b) => a + b, 0) / values.length
}

/** 'HH:MM:SS' or 'HH:MM' → a comparable 'HH:MM:SS'. Anything else is treated as no start time. */
function startTimeOf(value: string | null): string | null {
  if (!value) return null
  const m = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value)
  return m ? `${m[1]}:${m[2]}:${m[3] ?? '00'}` : null
}

/**
 * Catalog order, applied once at every exit. §2 makes catalog order, shelf order and
 * evaluator-return order the same order on purpose: a caller rendering "you earned X and Y" reads
 * the same sequence the shelf shows, and a test can assert an array rather than a set.
 *
 * `BADGE_KEYS` is imported rather than re-listed here. A second copy of the order would compile
 * fine and then drift the day a key is added, which is the failure this whole feature is built to
 * avoid — and `catalog.ts` does not import this file, so there is no cycle to dodge.
 */
function inCatalogOrder(keys: readonly BadgeKey[]): BadgeKey[] {
  return [...keys].sort((a, b) => BADGE_KEYS.indexOf(a) - BADGE_KEYS.indexOf(b))
}
