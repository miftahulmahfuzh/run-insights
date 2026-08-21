import type { BadgeDefinition, BadgeKey, BadgeProgressMetric, BadgeScope } from './types'

/**
 * **The 22 badges. AUTHORITATIVE — roadmap §4.6 as amended by R-33.**
 *
 * F10's `gen_badge_art.py` refuses to start unless `BADGE_KEYS` below equals the key set inside
 * its `style.md` `<!-- SCENES -->` block. This array is a hard interface, not an implementation
 * detail: the order below IS shelf order and IS the order every evaluator returns keys in, so a
 * reader can diff §4.6's table against this file line by line.
 *
 * R-33 grew this list from 20 to 22: `sandbagger`, `warmup_who` and `double_century` were restored
 * after the design pull dropped them, `two_a_days` and `boring_excellence` were adopted from what
 * the design invented, and `rain_tax` was **cut** — Apple Fitness screenshots carry no weather
 * data, so it could never have fired.
 *
 * Do not delete a key. Retire it in place: remove it from this array and leave its `badges` rows
 * inert. `badgeTitle()` returns null for an unknown key precisely so the shelf drops a retired
 * badge instead of throwing on it.
 *
 * ── WHY THE THRESHOLDS LIVE HERE AND NOWHERE ELSE ───────────────────────────────────────────
 * R-42: *"Copy that restates a threshold is a second source of truth for that threshold; F09 must
 * render badge conditions from `lib/badges/catalog.ts`, never from hand-written strings."* So
 * `BADGE_THRESHOLDS` is the only place a number appears — `rules.ts` compares against it,
 * `meta.ts` interpolates it into the condition sentence, and the locked-tile progress line in
 * `progress.ts` measures distance from it. Change 100 km to 120 km in one place and the rule, the
 * copy and the progress bar all move together, which is the property the ruling is asking for.
 */
export const BADGE_THRESHOLDS = {
  /** `early_bird` fires on a start inside this closed interval. Postgres `time` strings. */
  earlyBirdFrom: '05:00:00',
  earlyBirdTo: '05:30:00',
  /** `late_start` fires strictly after this. */
  lateStartAfter: '07:00:00',
  /** `self_reward`: runs inside one ISO week. Also the per-week bar `consistency_gremlin` counts. */
  weekRunTarget: 4,
  /** `consistency_gremlin`: consecutive qualifying weeks, and the multiple it re-fires on. */
  gremlinWeeks: 4,
  /** `metronome`: population sd of full-km paces, seconds. */
  metronomeSdSec: 10,
  /** `fast_start_fool`: how far km 1 must beat the run's own full-km mean pace, seconds. */
  fastStartLeadSec: 30,
  /** `redline_republic`: share of zoned time in zone 5, percent (0–100, matching F06). */
  redlineZone5Pct: 40,
  /** `cadence_collapse`: magnitude of the km-1 → last-full-km cadence drop. */
  cadenceFadeSpm: 15,
  /** `groundhog_day`: how close three consecutive distances must be, metres. */
  groundhogToleranceM: 100,
  /** `groundhog_day` / `boring_excellence`: how many consecutive runs the window holds. */
  windowRuns: 3,
  /** `boring_excellence`: max spread of the window's average paces, s/km. */
  boringPaceSpreadSec: 10,
  /** `boring_excellence`: every run in the window must decouple less than this, percent. */
  boringDecouplingPct: 5,
  /** `century_club` / `double_century`: metres inside one calendar month. */
  centuryM: 100_000,
  doubleCenturyM: 200_000,
  /** `half_ish`: a single run's distance, metres. 21.1 km. */
  halfIshM: 21_100,
  /** `sweat_equity`: active kcal in one run. */
  sweatEquityKcal: 1000,
  /** `dawn_patrol`: starts strictly before this time, and how many of them it takes. */
  dawnBefore: '06:00:00',
  dawnRunCount: 10,
  /** `two_a_days`: reviewed runs sharing one calendar day. */
  twoADayRuns: 2,
} as const

/**
 * ── R-44: LOCKED TILES SHOW PROGRESS, BUT ONLY WHERE PROGRESS IS A NUMBER ───────────────────
 *
 * Five badges genuinely accumulate toward a threshold, so a locked tile can honestly say *"200 km
 * in a calendar month — you're at 116"*. The other seventeen cannot: "second half faster than
 * first" is not 60% done, and `tourist` either fires or does not. R-44 is explicit that inventing
 * a percentage for those would be the same dishonesty R-41 removed from the extraction screen, so
 * `progress` is **absent** on them and their tiles render condition-only.
 *
 * The tone rule from §4.6 still binds: a locked tile is an invitation, not a nag. `redline_republic`
 * must never render as "you're 12% of the way to spending 40% of a run in zone 5" — which is
 * exactly what the absence of a descriptor here guarantees.
 */
const PROGRESS: Partial<Record<BadgeKey, { metric: BadgeProgressMetric; target: number }>> = {
  self_reward: { metric: 'weekRunCount', target: BADGE_THRESHOLDS.weekRunTarget },
  consistency_gremlin: { metric: 'qualifyingWeekStreak', target: BADGE_THRESHOLDS.gremlinWeeks },
  century_club: { metric: 'monthDistanceM', target: BADGE_THRESHOLDS.centuryM },
  double_century: { metric: 'monthDistanceM', target: BADGE_THRESHOLDS.doubleCenturyM },
  dawn_patrol: { metric: 'dawnRunCount', target: BADGE_THRESHOLDS.dawnRunCount },
}

function badge(key: BadgeKey, title: string, scope: BadgeScope): BadgeDefinition {
  const progress = PROGRESS[key]
  return progress ? { key, title, scope, progress } : { key, title, scope }
}

/** Roadmap §4.6's table, in its order. 22 rows. */
export const BADGE_CATALOG: readonly BadgeDefinition[] = [
  badge('early_bird', 'Early Bird', 'session'),
  badge('late_start', 'Fashionably Late', 'session'),
  badge('self_reward', 'Self-Reward Achieved', 'week'),
  badge('negative_split', 'Finished the Job', 'session'),
  badge('metronome', 'Metronome', 'session'),
  badge('fast_start_fool', 'Went Out Like a Hero', 'session'),
  badge('redline_republic', 'Citizen of Redline Republic', 'session'),
  badge('sandbagger', 'Suspiciously Sensible', 'session'),
  badge('cadence_collapse', 'Legs Have Left the Chat', 'session'),
  badge('warmup_who', 'Warm-Up? Never Met Her', 'session'),
  badge('groundhog_day', 'Groundhog Day', 'session'),
  badge('tourist', 'Tourist', 'session'),
  badge('century_club', 'Century Club', 'month'),
  badge('double_century', 'Double Century', 'month'),
  badge('half_ish', 'Half-ish', 'session'),
  badge('sweat_equity', 'Sweat Equity', 'session'),
  badge('new_ceiling', 'New Ceiling', 'session'),
  badge('consistency_gremlin', 'Consistency Gremlin', 'week'),
  badge('dawn_patrol', 'Dawn Patrol', 'lifetime'),
  badge('long_way_home', 'The Long Way Home', 'session'),
  badge('two_a_days', 'Two-a-Days', 'session'),
  badge('boring_excellence', 'Boring Excellence', 'session'),
]

/** The interface F10's `gen_badge_art.py` diffs against `style.md`. Order is shelf order. */
export const BADGE_KEYS: readonly BadgeKey[] = BADGE_CATALOG.map((b) => b.key)

const BY_KEY = new Map<string, BadgeDefinition>(BADGE_CATALOG.map((b) => [b.key, b]))

export function isBadgeKey(value: unknown): value is BadgeKey {
  return typeof value === 'string' && BY_KEY.has(value)
}

/**
 * The full definition, or null for a retired or unrecognised key.
 *
 * Null rather than a throw, deliberately: a `badges` row written by a key this catalog no longer
 * defines must drop quietly out of the shelf, never take the whole `/me` page down with it.
 */
export function badgeDefinition(key: string): BadgeDefinition | null {
  return BY_KEY.get(key) ?? null
}

export function badgeTitle(key: string): string | null {
  return BY_KEY.get(key)?.title ?? null
}

export function badgeScope(key: BadgeKey): BadgeScope {
  return BY_KEY.get(key)!.scope
}

/** Sorts anything keyed by badge into catalog order — §10.2's shelf order, applied in TypeScript. */
export function catalogIndex(key: string): number {
  const index = BADGE_KEYS.indexOf(key as BadgeKey)
  return index === -1 ? Number.MAX_SAFE_INTEGER : index
}
