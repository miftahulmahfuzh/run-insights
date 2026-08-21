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
 * `fast_start_fool` were written against that rule specifically — "the legs clocked out" and
 * "kilometres two through ten filed a formal disagreement" put the comedy in the data's own
 * self-contradiction. The run is funny; the runner is not mentioned.
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
    condition: `Started between ${formatClock(T.earlyBirdFrom)} and ${formatClock(T.earlyBirdTo)} in the morning.`,
    gloss:
      'Before the world has much of an opinion about anything, this run already had legs moving.',
  },
  late_start: {
    condition: `Started after ${formatClock(T.lateStartAfter)} in the morning.`,
    gloss: 'The morning had other plans. The run happened anyway, fashionably late to itself.',
  },
  self_reward: {
    condition: `${T.weekRunTarget} runs land inside the same Monday-to-Sunday week.`,
    gloss: 'Four is a real week of running, not a coincidence of the calendar.',
  },
  negative_split: {
    condition: 'The second half of the run, kilometre for kilometre, is faster than the first.',
    gloss:
      'Most runs start strong and fade. This one saved something for later and actually spent it.',
  },
  metronome: {
    condition: `Every full kilometre's pace lands within about ${T.metronomeSdSec} seconds of the others.`,
    gloss:
      'A pacing plan, or an extraordinarily consistent watch. Either way, the splits look machine-made.',
  },
  fast_start_fool: {
    condition: `Kilometre one beats the run's own average pace by ${T.fastStartLeadSec} seconds or more, and every kilometre after it is slower.`,
    gloss:
      'Whatever kilometre one believed about the pace, kilometres two through ten filed a formal disagreement.',
  },
  redline_republic: {
    condition: `${T.redlineZone5Pct} percent or more of the run sits in heart-rate zone 5.`,
    gloss: 'Not a redline touched in passing — a redline held, for the better part of an hour.',
  },
  sandbagger: {
    condition: 'The entire run stays inside heart-rate zones 1 and 2.',
    gloss:
      'Every minute of this one played it sensible. Either a deliberate easy day, or the most disciplined run on file.',
  },
  cadence_collapse: {
    condition: `Cadence drops by ${formatCadence(T.cadenceFadeSpm)} or more from the first kilometre to the last.`,
    gloss:
      'The legs clocked out well before the watch did, and kept moving anyway on muscle memory alone.',
  },
  warmup_who: {
    condition: 'The first kilometre is already in heart-rate zone 4 or above.',
    gloss: 'No warm-up on record — this run opened at what should have been its cruising effort.',
  },
  groundhog_day: {
    condition: `The last ${T.windowRuns} runs land within about ${formatElevation(T.groundhogToleranceM)} of each other's distance.`,
    gloss:
      'Same loop, same number, three times running. The route knows the way even when nothing else does.',
  },
  tourist: {
    condition: "The run's location has never appeared in this log before.",
    gloss: 'New ground, first entry. The map just got one point wider.',
  },
  century_club: {
    condition: `${formatDistanceCompact(T.centuryM)} or more logged inside one calendar month.`,
    gloss: 'A hundred kilometres is a hundred kilometres, however many runs it took to add up.',
  },
  double_century: {
    condition: `${formatDistanceCompact(T.doubleCenturyM)} or more logged inside one calendar month.`,
    gloss: 'Century Club, but the month asked for it twice.',
  },
  half_ish: {
    condition: `A single run of ${formatDistanceM(T.halfIshM)} or more.`,
    gloss: "Whether or not it was meant to be a half marathon, the distance didn't ask permission.",
  },
  sweat_equity: {
    condition: `${formatKcal(T.sweatEquityKcal)} of active energy or more burned in one run.`,
    gloss: 'The watch counted every one of them. The legs are the ones who paid the bill.',
  },
  new_ceiling: {
    condition: 'The watch records a higher maximum heart rate than any run before it.',
    gloss: "The ceiling just moved, and nobody voted on it — the heart doesn't take suggestions.",
  },
  consistency_gremlin: {
    condition: `${T.weekRunTarget} or more runs a week, ${T.gremlinWeeks} consecutive weeks running.`,
    gloss:
      'Not a streak that demands anything of the next week — just four that happened to look the same.',
  },
  dawn_patrol: {
    condition: `${T.dawnRunCount} runs, across this account's whole history, started before ${formatClock(T.dawnBefore)}.`,
    gloss:
      'The early ones don’t feel like much on their own. They add up eventually, one dark morning at a time.',
  },
  long_way_home: {
    condition: 'This run is now the longest on record for this account.',
    gloss:
      "Somewhere past the old marker there's a new farthest point, and this run is the one that found it.",
  },
  two_a_days: {
    condition: `${T.twoADayRuns} reviewed runs land on the same calendar day.`,
    gloss:
      'One day, two entries. Whatever the second one was for, the legs went out and did it twice.',
  },
  boring_excellence: {
    condition: `${T.windowRuns} consecutive runs whose average paces sit within ${T.boringPaceSpreadSec} seconds a kilometre of each other, none of them decoupling by more than ${T.boringDecouplingPct} percent.`,
    gloss:
      'Three runs that could be swapped for one another without anyone noticing. That is harder than it sounds, and it is what every training plan is quietly asking for.',
  },
}
