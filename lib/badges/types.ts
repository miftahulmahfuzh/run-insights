import type { DateISO, IsoWeekKey, MonthKey } from '@/lib/date/ranges'

/**
 * F09's boundary types. Split from `catalog.ts` for the same reason `lib/records/types.ts` is split
 * from its catalog: the type-only import is free at runtime, so a client component that only needs
 * `BadgeKey` does not pull the 22-row table and its threshold block along with it.
 *
 * The union is written out by hand rather than derived from `BADGE_CATALOG` with
 * `(typeof BADGE_CATALOG)[number]['key']`. That derivation needs the array to be `as const`, which
 * in turn makes every `scope` a literal type — and then `Record<BadgeKey, BadgeMeta>` in `meta.ts`
 * can no longer be checked for exhaustiveness against a *narrower* array if a key is ever
 * commented out. Written out, adding a key is two edits and forgetting either one is a compile
 * error; derived, forgetting is silent.
 */
export type BadgeKey =
  | 'early_bird'
  | 'late_start'
  | 'self_reward'
  | 'negative_split'
  | 'metronome'
  | 'fast_start_fool'
  | 'redline_republic'
  | 'sandbagger'
  | 'cadence_collapse'
  | 'warmup_who'
  | 'groundhog_day'
  | 'tourist'
  | 'century_club'
  | 'double_century'
  | 'half_ish'
  | 'sweat_equity'
  | 'new_ceiling'
  | 'consistency_gremlin'
  | 'dawn_patrol'
  | 'long_way_home'
  | 'two_a_days'
  | 'boring_excellence'

/**
 * When a rule is evaluated, and therefore what its `badges` row points at.
 *
 *   `session`   one run's own shape. `run_id` set, `scope_key` null.
 *   `week`      an ISO week's worth of runs. `scope_key` is '2026-W34'.
 *   `month`     a calendar month's worth. `scope_key` is '2026-08'.
 *   `lifetime`  the whole account. Both null — there is no period to name.
 */
export type BadgeScope = 'session' | 'week' | 'month' | 'lifetime'

/** The accumulating quantities a locked tile may honestly measure itself against (R-44). */
export type BadgeProgressMetric =
  'weekRunCount' | 'qualifyingWeekStreak' | 'monthDistanceM' | 'dawnRunCount'

export interface BadgeProgressSpec {
  metric: BadgeProgressMetric
  target: number
}

export interface BadgeDefinition {
  key: BadgeKey
  title: string
  scope: BadgeScope
  /** Present on exactly the five badges that accumulate. See R-44 in `catalog.ts`. */
  progress?: BadgeProgressSpec
}

/**
 * One earn, as `evaluate.ts` hands it to the gateway. `scopeKey` and `runId` follow the scope table
 * above; `earnedOn` is the calendar day the earning run happened on, never the wall clock, so a
 * backfilled run's badge is dated to the run and not to the evening it was typed in.
 */
export interface BadgeEarn {
  key: BadgeKey
  runId: string | null
  scopeKey: IsoWeekKey | MonthKey | null
  earnedOn: DateISO
}

/**
 * One row of the award ledger, as read back.
 *
 * F13 made `badges` one row per EARN rather than one row per key, so this is the raw shape and
 * `StoredBadge` below is what a key's rows fold to. `createdAt` is here for one reason: it is the
 * tie-break in `foldAwards`, so that two awards dated the same day still resolve to a single
 * deterministic "latest".
 */
export interface BadgeAward {
  key: string
  runId: string | null
  scopeKey: string | null
  dedupeKey: string
  earnedOn: DateISO
  createdAt: Date
  /** Earnings folded into this row: 1, except on rows predating F13. See `schema.ts`. */
  count: number
}

/** The per-key fold of a user's awards — what the shelf and the panel read. */
export interface StoredBadge {
  key: string
  /** From the LATEST award. Null for a period badge, or a session badge whose run was deleted. */
  runId: string | null
  scopeKey: string | null
  /** The earliest award's day. Equal to `earnedOn` when the badge was earned once. */
  firstEarnedOn: DateISO
  /** The latest award's day — what "most recently" means on the shelf and in the panel. */
  earnedOn: DateISO
  count: number
}
