import { formatDistanceCompact } from '@/lib/format'
import type { PeriodFacts } from './evaluate'
import type { BadgeProgressSpec } from './types'

/**
 * ── R-44's locked-tile line ──────────────────────────────────────────────────────────────────
 *
 * *"200 km in a calendar month — you're at 116"*, described in the design as **an invitation, not
 * a nag**, and adopted on those terms. Only the five badges carrying a `progress` descriptor in
 * `catalog.ts` reach this function; the other seventeen render condition-only, because inventing a
 * percentage for "second half faster than first" would be the same dishonesty R-41 stripped out of
 * the extraction screen.
 *
 * **The register deliberately differs from `meta.ts`.** Conditions are impersonal so that one
 * string serves both the earned and the locked state. A progress line only exists in the locked
 * state and is only ever about the reader's own current standing, so second person is the honest
 * voice for it — and it is the voice the design wrote it in.
 */
export interface ProgressReading {
  value: number
  target: number
  /** One sentence. Never a percentage, never a bar. */
  sentence: string
}

export function readProgress(spec: BadgeProgressSpec, facts: PeriodFacts): ProgressReading {
  const { target } = spec
  switch (spec.metric) {
    case 'monthDistanceM':
      return {
        value: facts.month.monthDistanceM,
        target,
        sentence: `You're at ${formatDistanceCompact(facts.month.monthDistanceM)} this month.`,
      }
    case 'weekRunCount':
      return {
        value: facts.week.runsThisWeek,
        target,
        sentence: `You're at ${facts.week.runsThisWeek} of ${target} this week.`,
      }
    case 'qualifyingWeekStreak':
      return {
        value: facts.week.consecutiveQualifyingWeeks,
        target,
        sentence: `${facts.week.consecutiveQualifyingWeeks} of ${target} weeks so far.`,
      }
    case 'dawnRunCount':
      return {
        value: facts.lifetime.dawnRunCount,
        target,
        sentence: `You're at ${facts.lifetime.dawnRunCount} of ${target} so far.`,
      }
  }
}
