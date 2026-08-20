import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  installFakeDb,
  projectedRow,
  tableRow,
  uninstallFakeDb,
  type FakeDb,
} from './support/fakeDb'

/**
 * ██ THE ONE FUNCTION EVERY LATER FEATURE'S HONESTY DEPENDS ON ██
 *
 * Roadmap §4.4: "No feature may compute HRmax any other way." Every %HRmax figure, every zone-
 * relative badge, every `VERY_HIGH_AVG_HR` flag and every narrative sentence about effort traces
 * back here. The failure mode is silent — a wrong denominator produces a plausible number, not an
 * error — so these nine cases are the only thing standing between D11 and a quietly dishonest app.
 *
 * The dates are pinned rather than mocked at the global level so the Tanaka branch keeps giving 187
 * for the fixture runner in 2027 and beyond.
 */

const FIXTURE_NOW = new Date('2026-08-20T05:12:00+07:00')
/** The canonical fixture runner: 30 on 2026-08-20, so Tanaka gives 208 − 0.7 × 30 = 187. */
const FIXTURE_BIRTH_YEAR = 1996
const TANAKA = 187
/** What the watch actually recorded on the fixture run — legible on the heart-rate screenshot. */
const OBSERVED = 189

type HrMaxModule = typeof import('@/lib/metrics/hrMax')

let fake: FakeDb
let hrMax: HrMaxModule

beforeEach(async () => {
  vi.resetModules()
  vi.useFakeTimers()
  vi.setSystemTime(FIXTURE_NOW)
  fake = installFakeDb()
  hrMax = await import('@/lib/metrics/hrMax')
})

afterEach(() => {
  uninstallFakeDb()
  vi.useRealTimers()
  vi.resetModules()
})

/** One `SELECT * FROM profiles` row. */
async function profileRow(over: Record<string, unknown>) {
  const { profiles } = await import('@/lib/db/schema')
  return [tableRow(profiles, { userId: 'u1', ...over })]
}

/** One `SELECT id, max_hr, occurred_on FROM runs` row, in the projection's key order. */
const observedRow = (id: string, maxHr: number, occurredOn: string) => [
  projectedRow(id, maxHr, occurredOn),
]

describe('resolveHrMax — the resolution order (roadmap §4.4)', () => {
  it('1. profiles.max_hr wins, even when it is LOWER than an observed reading', async () => {
    // The deliberate asymmetry (plan §6.2): a runner can measure a real max in a controlled test a
    // training run never approached, and a number they typed is assumed intentional until they
    // change it. It does not auto-upgrade to a fresher watch reading.
    fake.enqueue(await profileRow({ maxHr: 172, birthYear: FIXTURE_BIRTH_YEAR }))

    expect(await hrMax.resolveHrMax('u1')).toEqual({ bpm: 172, source: 'measured' })
    // And it short-circuits: no point asking the database for an observation it will ignore.
    expect(fake.queries).toHaveLength(1)
  })

  it('2. an observation that EXCEEDS the estimate wins, and names the run it came from', async () => {
    fake.enqueue(
      await profileRow({ maxHr: null, birthYear: FIXTURE_BIRTH_YEAR }),
      observedRow('run_fixture', OBSERVED, '2026-08-20'),
    )

    expect(await hrMax.resolveHrMax('u1')).toEqual({
      bpm: OBSERVED,
      source: 'observed',
      observedRunId: 'run_fixture',
      observedOn: '2026-08-20',
    })
  })

  it('3. an observation BELOW the estimate does not win — the comparison is load-bearing', async () => {
    // 180 is a genuinely easy run's peak, not a new ceiling. The SQL filters it out; if this ever
    // returns 180 the app has started preferring "whichever number happened to load".
    fake.enqueue(await profileRow({ maxHr: null, birthYear: FIXTURE_BIRTH_YEAR }), [])

    expect(await hrMax.resolveHrMax('u1')).toEqual({ bpm: TANAKA, source: 'estimated' })
    expect(fake.sqlAt(1)).toContain('"runs"."max_hr" > $')
    expect(fake.queries[1]?.params).toContain(TANAKA)
  })

  it('4. birth year alone, zero runs -> the labelled Tanaka estimate', async () => {
    fake.enqueue(await profileRow({ maxHr: null, birthYear: FIXTURE_BIRTH_YEAR }), [])

    expect(await hrMax.resolveHrMax('u1')).toEqual({ bpm: TANAKA, source: 'estimated' })
  })

  it('5. nothing at all -> null, NEVER a fallback constant', async () => {
    // The acceptance criterion for D11. A hardcoded "assume 190" would make a %HRmax figure look
    // authoritative when the app has zero evidence for it; silence is more honest than a wrong
    // number that looks exactly like a right one.
    fake.enqueue(await profileRow({ maxHr: null, birthYear: null }), [])

    expect(await hrMax.resolveHrMax('u1')).toBeNull()
  })

  it('6. no birth year but a real watch reading -> observed, because 0 is the floor', async () => {
    // Deliberate: age is unknown, but a real measurement still beats nothing.
    fake.enqueue(
      await profileRow({ maxHr: null, birthYear: null }),
      observedRow('run_fixture', OBSERVED, '2026-08-20'),
    )

    expect(await hrMax.resolveHrMax('u1')).toMatchObject({ bpm: OBSERVED, source: 'observed' })
    expect(fake.queries[1]?.params).toContain(0)
  })

  it('there is no profile row at all -> null, not a crash', async () => {
    fake.enqueue([], [])
    expect(await hrMax.resolveHrMax('u1')).toBeNull()
  })
})

describe('resolveHrMax — the query it emits', () => {
  it('is ownership-scoped, reviewed-only, indexed, and reads exactly one row', async () => {
    fake.enqueue(await profileRow({ maxHr: null, birthYear: FIXTURE_BIRTH_YEAR }), [])
    await hrMax.resolveHrMax('u1')

    const sql = fake.sqlAt(1)
    expect(sql).toContain('"runs"."user_id" = $') // D8
    expect(sql).toContain('"reviewed_at" is not null') // D16 — an unreviewed max is a hallucination
    expect(sql).toContain('order by "runs"."max_hr" desc') // reads runs_user_maxhr_idx (R-12)
    expect(sql).toContain('limit $')
  })

  it('is two statements, never an N+1 and never a reduce in TypeScript', async () => {
    fake.enqueue(await profileRow({ maxHr: null, birthYear: FIXTURE_BIRTH_YEAR }), [])
    await hrMax.resolveHrMax('u1')
    expect(fake.queries).toHaveLength(2)
  })

  it('resolveHrMaxAsOf adds a cutoff and changes nothing else', async () => {
    fake.enqueue(await profileRow({ maxHr: null, birthYear: FIXTURE_BIRTH_YEAR }), [])
    await hrMax.resolveHrMaxAsOf('u1', '2026-08-19')

    expect(fake.sqlAt(1)).toContain('"runs"."occurred_on" <= $')
    expect(fake.queries[1]?.params).toContain('2026-08-19')
  })
})

describe('tanakaEstimate', () => {
  it('gives 187 for the fixture runner — the number the watch went on to disprove (R-3)', () => {
    expect(hrMax.tanakaEstimate(FIXTURE_BIRTH_YEAR)).toBe(TANAKA)
  })

  it('rounds, so the estimate is always an integer bpm', () => {
    expect(hrMax.tanakaEstimate(1996, new Date('2027-08-20T00:00:00+07:00'))).toBe(186) // age 31
    expect(Number.isInteger(hrMax.tanakaEstimate(1999))).toBe(true)
  })
})

describe('hrMaxTransitionAt — telling the runner when the denominator moved', () => {
  /**
   * Five statements, in a deterministic order: getRun, getPreviousReviewedRun, then two
   * resolutions of two statements each. Sequential rather than a Promise.all precisely so this
   * enqueue order is assertable without a database.
   */
  async function enqueueTransition(previousObserved: unknown[][], currentObserved: unknown[][]) {
    const { runs, profiles } = await import('@/lib/db/schema')
    const profile = [
      tableRow(profiles, { userId: 'u1', maxHr: null, birthYear: FIXTURE_BIRTH_YEAR }),
    ]
    fake.enqueue(
      [tableRow(runs, { id: 'run_fixture', userId: 'u1', occurredOn: '2026-08-20' })],
      [tableRow(runs, { id: 'run_prev', userId: 'u1', occurredOn: '2026-08-18' })],
      profile,
      previousObserved,
      profile,
      currentObserved,
    )
  }

  it('7. fires on the run where observed first overtakes estimated', async () => {
    await enqueueTransition([], observedRow('run_fixture', OBSERVED, '2026-08-20'))

    expect(await hrMax.hrMaxTransitionAt('u1', 'run_fixture')).toEqual({
      from: { bpm: TANAKA, source: 'estimated' },
      to: {
        bpm: OBSERVED,
        source: 'observed',
        observedRunId: 'run_fixture',
        observedOn: '2026-08-20',
      },
    })
  })

  it('8. stays quiet when nothing changed — the overwhelmingly common case', async () => {
    await enqueueTransition([], [])
    expect(await hrMax.hrMaxTransitionAt('u1', 'run_fixture')).toBeNull()
  })

  it('8b. stays quiet when the same observed value holds on both sides', async () => {
    const rows = observedRow('run_earlier', OBSERVED, '2026-08-10')
    await enqueueTransition(rows, rows)
    expect(await hrMax.hrMaxTransitionAt('u1', 'run_fixture')).toBeNull()
  })

  it('9. returns null on the runner’s very first run — nothing to transition FROM', async () => {
    const { runs } = await import('@/lib/db/schema')
    fake.enqueue(
      [tableRow(runs, { id: 'run_first', userId: 'u1', occurredOn: '2026-08-20' })],
      [], // no predecessor
    )

    expect(await hrMax.hrMaxTransitionAt('u1', 'run_first')).toBeNull()
    expect(fake.queries).toHaveLength(2) // and it stops there
  })

  it('returns null for a run that is not this user’s — the ownership predicate is in the query', async () => {
    fake.enqueue([])
    expect(await hrMax.hrMaxTransitionAt('u1', 'someone_elses_run')).toBeNull()
    expect(fake.only().sql).toContain('"runs"."user_id" = $')
  })
})
