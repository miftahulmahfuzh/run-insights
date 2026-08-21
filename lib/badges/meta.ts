import {
  formatCadence,
  formatClock,
  formatDistanceCompact,
  formatDistanceM,
  formatElevation,
  formatKcal,
} from '@/lib/format'
import { BADGE_THRESHOLDS as T } from './catalog'
import type { BadgeKey } from './types'

/**
 * The shelf's copy — one condition sentence and one gloss per badge, all 22.
 *
 * ── A SEPARATE MODULE FROM `catalog.ts`, ON PURPOSE ─────────────────────────────────────────
 * `catalog.ts` is imported by the review-commit path, which runs on every single save;
 * 22 condition sentences plus 22 glosses have no business riding along on that request. This file
 * is imported by `/me` and by the tests, and by nothing else. (`daily-words` splits
 * `badge-meta.ts` from `badges.ts` for exactly this reason.)
 *
 * ── THE REGISTER, AND WHY IT IS ENFORCED ────────────────────────────────────────────────────
 * Impersonal, present tense, no second person, no exclamation mark, no flattery. That is not a
 * style preference — it is what lets **one string describe both the earned and the locked state**
 * on `/me` (§10.2), and it is what keeps the funny ones on the right side of §4.6's tone rule: a
 * sentence stating a fact about *the run's data* cannot accidentally become a sentence judging the
 * runner, because it never grammatically has a "you" to aim at. `cadence_collapse` and
 * `fast_start_fool` were written against that rule specifically — "the legs clocked out before the
 * watch did" and "kilometre two filed a disagreement" put the comedy in the data's own
 * self-contradiction. The run is funny; the runner is not mentioned.
 *
 * ── F12: HALVED, ON INSTRUCTION ──────────────────────────────────────────────────────────────
 * The first cut of this file spent 3330 characters on 22 badges — a paragraph per patch, most of
 * it restating in a gloss what the condition above it had already said. It now spends under 1700,
 * and `tests/badges.catalog.test.ts` holds a **per-string budget** so it cannot creep back: a
 * condition is one clause, a gloss is one line. The budget is the enforcement mechanism, because
 * every other rule in this block is a rule about *voice* and none of them is a rule about length.
 *
 * What the cut deliberately did NOT do: drop a threshold, drop a unit, or soften a condition into
 * something a reader could misread as a different rule. Every interpolation below survived; what
 * went was the second sentence of each gloss and the qualifiers around each condition. The one
 * long condition left is `boring_excellence`, which genuinely names three separate numbers.
 *
 * ── EVERY NUMBER COMES FROM `BADGE_THRESHOLDS`, EVERY UNIT FROM `lib/format.ts` ──────────────
 * R-42 caught the design shipping *"Century Club — 200 km in a calendar month"* against a catalog
 * that says 100 km, and ruled that copy restating a threshold is a second source of truth for it.
 * So no sentence below contains a literal threshold: each interpolates `T`, through a
 * `lib/format.ts` formatter wherever a unit is involved (R-23). Move a threshold and the sentence
 * moves with it — the failure R-42 describes is not expressible here.
 */
export interface BadgeMeta {
  /** The rule, one sentence, present tense, impersonal. Renders earned AND locked. */
  condition: string
  /** Colour, and where the badge is a joke, the joke — about the run, never the runner. */
  gloss: string
}

/**
 * A **total** `Record`, deliberately: a 23rd key with no entry here is a build-time type error,
 * which is a stronger and earlier guard than any test could be.
 */
export const BADGE_META: Record<BadgeKey, BadgeMeta> = {
  early_bird: {
    condition: `A start between ${formatClock(T.earlyBirdFrom)} and ${formatClock(T.earlyBirdTo)}.`,
    gloss: 'Before the world had an opinion yet.',
  },
  late_start: {
    condition: `A start after ${formatClock(T.lateStartAfter)}.`,
    gloss: 'The morning had other plans.',
  },
  self_reward: {
    condition: `${T.weekRunTarget} runs in one Monday-to-Sunday week.`,
    gloss: 'A real week, not a fluke.',
  },
  negative_split: {
    condition: 'The second half is faster than the first.',
    gloss: 'Most runs fade. This one saved something.',
  },
  metronome: {
    condition: `Every kilometre's pace within about ${T.metronomeSdSec} seconds.`,
    gloss: 'The splits look machine-made.',
  },
  fast_start_fool: {
    condition: `Kilometre one beats the average by ${T.fastStartLeadSec} seconds; nothing after it is faster.`,
    gloss: 'Kilometre two filed a disagreement.',
  },
  redline_republic: {
    condition: `Zone 5 holds ${T.redlineZone5Pct} percent or more of the run.`,
    gloss: 'A redline held, not brushed past.',
  },
  sandbagger: {
    condition: 'The whole run stays in heart-rate zones 1 and 2.',
    gloss: 'Sensible to the last minute.',
  },
  cadence_collapse: {
    condition: `Cadence falls ${formatCadence(T.cadenceFadeSpm)} or more across the run.`,
    gloss: 'The legs clocked out before the watch did.',
  },
  warmup_who: {
    condition: 'The first kilometre is already in zone 4 or above.',
    gloss: 'No warm-up on record.',
  },
  groundhog_day: {
    condition: `The last ${T.windowRuns} runs land within ${formatElevation(T.groundhogToleranceM)} of each other.`,
    gloss: 'Same loop, same number, three times.',
  },
  tourist: {
    condition: 'A location new to this log.',
    gloss: 'The map got one point wider.',
  },
  century_club: {
    condition: `${formatDistanceCompact(T.centuryM)} or more inside one calendar month.`,
    gloss: 'However many runs it took.',
  },
  double_century: {
    condition: `${formatDistanceCompact(T.doubleCenturyM)} or more inside one calendar month.`,
    gloss: 'The month asked twice.',
  },
  half_ish: {
    condition: `A single run of ${formatDistanceM(T.halfIshM)} or more.`,
    gloss: "It didn't ask permission.",
  },
  sweat_equity: {
    condition: `${formatKcal(T.sweatEquityKcal)} of active energy in one run.`,
    gloss: 'The legs paid the bill.',
  },
  new_ceiling: {
    condition: 'A higher maximum heart rate than any run before.',
    gloss: "The heart doesn't take suggestions.",
  },
  consistency_gremlin: {
    condition: `${T.weekRunTarget} or more runs a week, ${T.gremlinWeeks} weeks running.`,
    gloss: 'Four weeks that happened to look alike.',
  },
  dawn_patrol: {
    condition: `${T.dawnRunCount} runs started before ${formatClock(T.dawnBefore)}, all-time.`,
    gloss: 'They add up, one dark morning at a time.',
  },
  long_way_home: {
    condition: 'Now the longest run on record.',
    gloss: 'A new farthest point, found on foot.',
  },
  two_a_days: {
    condition: `${T.twoADayRuns} reviewed runs on the same calendar day.`,
    gloss: 'One day, two entries.',
  },
  boring_excellence: {
    condition: `${T.windowRuns} consecutive runs within ${T.boringPaceSpreadSec} seconds a kilometre of each other, none decoupling past ${T.boringDecouplingPct} percent.`,
    gloss: 'Three interchangeable runs. Harder than it sounds.',
  },
}
