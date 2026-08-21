import { FLAG_THRESHOLDS, type Flag, type FlagCode } from '@/lib/metrics/flags'
import { formatBpm, formatCadence, formatPaceDelta, formatPercent } from '@/lib/format'

/**
 * The English sentence for every flag F06 can fire. **One sentence per code, written once, here.**
 *
 * Why this lives in `lib/` and not beside the component that renders it: the copy is the part most
 * likely to be got wrong, and the wrongness is a tone failure rather than a type error. A pure
 * module gets a test that walks the whole `FlagCode` union and asserts that a sentence exists for
 * each — so a code added to F06 tomorrow fails CI instead of rendering as a blank chip.
 *
 * ── THE TONE RULE, MADE OPERATIONAL ────────────────────────────────────────────────────────────
 * Roadmap §4.6's rule for badges — "funny about the run, never about the runner" — applies with
 * the humour removed here: these are **statements about the data**, never verdicts on the person.
 * F08's plan §1: a flag reads `Positive split — the second half was 41 s/km slower than the first`,
 * never `⚠️ You're fading!`. Three concrete consequences, all of them checkable in review:
 *
 *   - No second person as an accusation. "The second half was slower", not "you slowed down".
 *   - No exclamation marks, no emoji, no "Great job", no "Careful".
 *   - The number is the emphasis. If a sentence would work without its figure, it is the wrong
 *     sentence — the point of a flag is to name the measurement that fired it.
 *
 * `detail` quotes the value F06 measured; `title` names the phenomenon. Both are rendered, because
 * the title alone is jargon and the detail alone is a number with no handle.
 */

export interface FlagCopy {
  title: string
  detail: string
}

export function flagCopy(flag: Flag): FlagCopy {
  const t = FLAG_THRESHOLDS

  switch (flag.code) {
    case 'HIGH_DECOUPLING':
      return {
        title: 'Aerobic drift',
        // Positive decoupling = speed per heartbeat fell. Said in plain words, because "Pa:Hr
        // decoupling of 12.3%" is meaningless to anyone who has not read a training textbook.
        detail: `Pace per heartbeat fell ${formatPercent(flag.value, 1)} between the first half and the second — above ${formatPercent(t.HIGH_DECOUPLING)}, the same effort was buying less speed by the end.`,
      }

    case 'TOO_MUCH_HARD':
      return {
        title: 'Mostly hard',
        detail: `${formatPercent(flag.value, 1)} of this run was in zones 4 and 5.`,
      }

    case 'POSITIVE_SPLIT':
      return {
        title: 'Positive split',
        detail: `The second half averaged ${formatPaceDelta(flag.value)} slower than the first.`,
      }

    case 'CADENCE_FADE':
      return {
        title: 'Cadence fade',
        detail: `Steps per minute dropped ${formatCadence(Math.abs(flag.value))} from the first full kilometre to the last.`,
      }

    case 'VERY_HIGH_AVG_HR':
      return {
        title: 'High average heart rate',
        detail: `Average heart rate was ${formatPercent(flag.value, 1)} of your maximum for the whole run.`,
      }

    case 'SLOW_HR_RECOVERY':
      return {
        title: 'Slow one-minute recovery',
        detail: `Heart rate came down ${formatBpm(flag.value)} in the minute after finishing.`,
      }

    case 'FAST_START':
      return {
        title: 'Fast first kilometre',
        detail: 'The first kilometre was the fastest of the run.',
      }
  }
}

/**
 * Every code, for the exhaustiveness test. Kept next to the switch above rather than derived from
 * it: a list a test can iterate is the only way to catch a code F06 adds and this file forgets.
 */
export const FLAG_CODES: readonly FlagCode[] = [
  'HIGH_DECOUPLING',
  'TOO_MUCH_HARD',
  'POSITIVE_SPLIT',
  'CADENCE_FADE',
  'VERY_HIGH_AVG_HR',
  'SLOW_HR_RECOVERY',
  'FAST_START',
]
