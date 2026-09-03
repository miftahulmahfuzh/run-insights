import type { StoredBadge } from '@/lib/badges/types'
import { computeSessionMetrics, evaluateSessionFlags, type HrMax } from '@/lib/metrics'
import type {
  BuildNinaContextInput,
  FiredPattern,
  MessageInput,
  NagState,
  NinaRunInput,
} from '@/lib/nina/context'
import { canonicalRecordRun, canonicalSession } from './canonicalRun'

/**
 * **The Jakarta boundary, on purpose.** 17:03 UTC on 3 Sep 2026 is 00:03 on 4 Sep in Jakarta — a
 * Friday, `malam`. A builder that reached for UTC would say Thursday 3 Sep, `sore`, and every
 * `daysAgo` in the payload would be one short. UTC+7 has no DST, so this instant is the only kind
 * of boundary this app has and it is the one worth pinning.
 */
export const NINA_FIXTURE_NOW = new Date('2026-09-03T17:03:00Z')
export const NINA_FIXTURE_TODAY = '2026-09-04'

/** The fixture's own denominator: Tanaka on a 30-year-old is 208 − 0.7 × 30 = 187. */
const ESTIMATED_HR_MAX: HrMax = { bpm: 187, source: 'estimated' }

function canonicalRunInput(): NinaRunInput {
  const metrics = computeSessionMetrics(canonicalSession, ESTIMATED_HR_MAX)
  return {
    runId: canonicalSession.runId,
    occurredOn: canonicalSession.occurredOn,
    startedAt: '07:07:00',
    location: 'Tangerang',
    distanceM: canonicalSession.distanceM,
    durationSec: canonicalSession.durationSec,
    avgPaceSec: canonicalRecordRun.avgPaceSec,
    avgHr: canonicalSession.avgHrBpm,
    maxHr: canonicalRecordRun.maxHr,
    avgCadence: canonicalRecordRun.avgCadence,
    activeKcal: canonicalRecordRun.activeKcal,
    elevationM: canonicalRecordRun.elevationM,
    intent: null,
    /* HIS OWN WORDS, and deliberately WRONG: the reviewed record says 10.67 km. The prompt has a
     * rule for exactly this and the test asserts the note survives unaltered. */
    note: 'easy 12k, felt fine',
    metrics,
    flags: evaluateSessionFlags(metrics, canonicalSession.splits.find((s) => !s.partial) ?? null),
  }
}

const MESSAGES: MessageInput[] = [
  {
    id: 'msg_1',
    role: 'nina',
    text: 'halo, gw nina. nama lo siapa?',
    sentAt: new Date('2026-08-20T00:14:00Z'),
    replyToId: null,
    runId: null,
    imageDescriptions: [],
  },
  {
    id: 'msg_2',
    role: 'runner',
    text: 'miftah',
    sentAt: new Date('2026-08-20T00:15:00Z'),
    replyToId: 'msg_1',
    runId: null,
    imageDescriptions: [],
  },
  {
    id: 'msg_3',
    role: 'runner',
    text: 'gw biasanya lari selasa kamis sabtu minggu',
    sentAt: new Date('2026-09-01T00:20:00Z'),
    replyToId: null,
    runId: null,
    imageDescriptions: [],
  },
]

const HELD_BADGES: StoredBadge[] = [
  {
    key: 'late_start',
    runId: canonicalSession.runId,
    scopeKey: null,
    firstEarnedOn: '2026-08-04',
    earnedOn: '2026-08-20',
    /* count 5 against 2 dated earnings — the pre-F13 aggregate case, so the test can prove
     * `earnedDaysOnRecord` is carried separately and she cannot invent three dates. */
    count: 5,
    earnedDays: [
      { earnedOn: '2026-08-20', runId: canonicalSession.runId },
      { earnedOn: '2026-08-04', runId: null },
    ],
  },
  {
    key: 'redline_republic',
    runId: canonicalSession.runId,
    scopeKey: null,
    firstEarnedOn: '2026-08-20',
    earnedOn: '2026-08-20',
    count: 1,
    earnedDays: [{ earnedOn: '2026-08-20', runId: canonicalSession.runId }],
  },
]

const FIRED_PATTERNS: FiredPattern[] = [
  {
    code: 'REPEATED_LATE_START',
    severity: 'warn',
    /* 07:22, as seconds past midnight. `clock` spells it, never `formatDuration`. */
    value: 26_520,
    unit: 'clock',
    occurrences: 4,
    windowRuns: 5,
  },
  {
    code: 'REPEATED_HIGH_AVG_HR',
    severity: 'warn',
    value: 91.5,
    unit: 'percent',
    occurrences: 3,
    windowRuns: 5,
  },
]

const NAGS: NagState[] = [
  { code: 'REPEATED_LATE_START', level: 3, lastMentionedOn: '2026-08-31' },
  /* No row for REPEATED_HIGH_AVG_HR — she has never raised it, so its nagLevel must default to 0. */
]

/** One complete input. Overridable, so a case can null a field without rebuilding the world. */
export function ninaFixtureInput(
  overrides: Partial<BuildNinaContextInput> = {},
): BuildNinaContextInput {
  return {
    now: NINA_FIXTURE_NOW,
    fullName: 'Miftahul Mahfuzh',
    nickname: 'mif',
    profile: {
      birthYear: 1996,
      heightCm: 169,
      /* RU-1. The whole point of this fixture. */
      weightKg: 63.5,
      sex: 'male',
      restingHr: 54,
    },
    hrMax: ESTIMATED_HR_MAX,
    recentRuns: [canonicalRunInput()],
    records: [
      {
        key: 'longest_distance',
        value: 10_670,
        previousValue: 9_800,
        achievedOn: '2026-08-20',
        runId: canonicalSession.runId,
      },
      {
        key: 'earliest_start',
        value: 25_620,
        previousValue: null,
        achievedOn: '2026-08-04',
        runId: 'run_early',
      },
      /* A key the catalog does not define — must be dropped, not formatted as `String(value)`. */
      { key: 'retired_key', value: 1, previousValue: null, achievedOn: '2026-08-01', runId: 'r' },
    ],
    badges: HELD_BADGES,
    slots: [
      {
        key: 'usual_running_days',
        value: 'Tuesday, Thursday, Saturday, Sunday',
        updatedAt: new Date('2026-09-01T00:20:00Z'),
      },
    ],
    facts: [
      {
        id: 'fact_1',
        text: 'He starts work at 09:00 and is late if he sets off after 07:00.',
        sourceMessageId: 'msg_3',
        createdAt: new Date('2026-09-01T00:20:00Z'),
      },
    ],
    messages: MESSAGES,
    olderMessageCount: 12,
    firedPatterns: FIRED_PATTERNS,
    nags: NAGS,
    promptVersion: 1,
    ...overrides,
  }
}
