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

/**
 * One earning, as a day and the run that produced it — F27's list, the smallest shape the panel's
 * date list needs.
 *
 * Not a whole `BadgeAward`. `dedupeKey`, `count` and `createdAt` are all about *how the ledger keeps
 * the row*: the first two are the fold's own arithmetic and the third only ever matters as its
 * same-day tie-break. None of the three is a fact about the earning that a reader of the panel could
 * do anything with, and a list of full ledger rows crossing the RSC boundary for 22 badges would
 * ship all three per earning to be ignored.
 */
export interface BadgeEarnedDay {
  earnedOn: DateISO
  /** The run to open, or null — a period badge's day, or a session badge whose run was deleted. */
  runId: string | null
  /**
   * The period this earning was *about*, per the scope table above — F27 round 2.
   *
   * It is the discriminator between the two reasons `runId` is null, and the panel needs it to be
   * honest about which one it is looking at. A **week or month** badge never had a run: nothing
   * earned `self_reward` except four runs inside one ISO week, so its date is a period's date and
   * the panel labels it as one. A **session** badge with a null `runId` is a run that was deleted
   * (R-22) — the day is still a real day, and it renders as one.
   *
   * Null for both a session award and a lifetime one, which need no distinguishing: neither has a
   * period to name, and both render as a plain day.
   *
   * The report that made this necessary: `self_reward` and `tourist` both read "Earned once", one
   * date opened a run and the other silently did nothing, and the only way to tell why was to read
   * `catalog.ts`.
   */
  scopeKey: string | null
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
  /**
   * Every award of this key, **latest first** — F27, so the panel can list the earn dates instead
   * of summarising them. Never empty: the fold does not emit a key with no rows.
   *
   * **`earnedDays.length` is not `count`, and must not be used as it.** `count` sums the `count`
   * column, and a row predating F13 carries the aggregate it had then — so a single row folding to
   * 5 has one day to list and four earnings with no date on record. The panel is what says so out
   * loud; see `components/profile/BadgeDialog.tsx`. Inventing days to make the two agree would put
   * dates in front of the runner that nothing ever recorded.
   *
   * `runId` / `scopeKey` / `earnedOn` above are the head of this list and `firstEarnedOn` the tail's
   * day — the same derived conveniences they always were, now visibly derived from something.
   */
  earnedDays: BadgeEarnedDay[]
}
