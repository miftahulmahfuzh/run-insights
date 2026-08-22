import { describe, expect, it } from 'vitest'

import {
  breakSplitOne,
  buildSession,
  canonicalFixtureSession,
  RUNS,
} from '@/scripts/capture/dataset.mjs'
import { isoWeekKeyOf } from '@/lib/date/ranges'
import { runAllChecks } from '@/lib/review/checks'
import { resolveOccurredOn } from '@/lib/review/draft'
import { ReviewDraftSchema } from '@/lib/review/schema'
import { RawExtractedSession } from '@/lib/schema/extractedSession'

/**
 * The guard on F19's seeded dataset.
 *
 * `scripts/capture/dataset.mjs` exists so `shoot.mjs` can commit 26 runs by clicking **Confirm &
 * save** 26 times, and that only works while every generated payload leaves the consistency banner
 * green. Nothing about the capture run would *say* if that stopped being true: a payload that
 * trips a check produces a screenshot of an unconfirmed run, and the failure looks like a bad
 * screenshot rather than a bad fixture.
 *
 * So the four checks are asserted here, against the real `runAllChecks` — never a second copy of
 * the arithmetic — and this file runs inside `npm test`, which is inside the CI gate. It also pins
 * the dataset's *designed* properties (§7), because those are promises the README's screenshots
 * make on the app's behalf: a `/trends` page with four weeks of data, a visible gap, a month over
 * 100 km. If someone edits the table, this test names which promise they broke.
 */

const sessions = RUNS.map((spec) => ({ spec, session: buildSession(spec) }))

describe('the seeded dataset satisfies the four review checks', () => {
  it.each(sessions.map(({ spec }, i) => [i, spec.date, spec.km] as const))(
    'run %i (%s, %s km) passes all four',
    (i) => {
      const session = sessions[i]!.session
      const failures = runAllChecks(session).filter((c) => !c.ok)
      expect(failures.map((f) => `${f.id}: ${f.message}`)).toEqual([])
    },
  )

  it('is a valid draft, not merely a consistent one', () => {
    for (const { spec, session } of sessions) {
      const occurredOn = resolveOccurredOn(session.dateLabel)
      const parsed = ReviewDraftSchema.safeParse({
        ...session,
        occurredOn,
        intent: null,
        note: null,
      })
      expect(parsed.success, `${spec.date}: ${JSON.stringify(parsed.error?.issues)}`).toBe(true)
    }
  })

  it('is what the extractor would have produced', () => {
    for (const { session } of sessions) {
      expect(RawExtractedSession.safeParse(session).success).toBe(true)
    }
  })

  it('resolves every dateLabel to the date the spec asked for', () => {
    for (const { spec, session } of sessions) {
      expect(resolveOccurredOn(session.dateLabel)).toBe(spec.date)
    }
  })
})

describe('the flagged run is the canonical fixture, with its real misread', () => {
  it('passes all four checks before the break — it is a correct transcription', () => {
    const clean = canonicalFixtureSession()
    expect(runAllChecks(clean).filter((c) => !c.ok)).toEqual([])
  })

  /**
   * These four numbers are quoted in `lib/review/checks.ts` as the reason each tolerance is what it
   * is. Pinning them here means the fixture and the tolerances cannot drift apart silently: if the
   * fixture is ever re-transcribed, this test names which band it moved under.
   */
  it('sits where the tolerances were calibrated', () => {
    const f = canonicalFixtureSession()
    const splitSum = f.splits.reduce((t: number, s: { timeSec: number }) => t + s.timeSec, 0)
    const zoneSum = f.hrZones.reduce(
      (t: number, z: { durationSec: number }) => t + z.durationSec,
      0,
    )
    expect(f.durationSec).toBe(4716)
    expect(f.durationSec - splitSum).toBe(6) //  CHK-1's "real slack is 6 s over 4,716 s"
    expect(f.durationSec - zoneSum).toBe(121) // CHK-2's "the fixture is 121 s short"
    expect(Math.abs(f.distanceKm * f.avgPaceSecPerKm - f.durationSec)).toBeLessThan(0.2) // CHK-3's 0.14
    const last = f.splits[f.splits.length - 1]
    expect(Math.abs(Math.round(last.timeSec / 0.67) - last.paceSecPerKm)).toBe(1) // CHK-4's 1 s
  })

  it('fails exactly the split-sum check once km 1 is misread', () => {
    const flagged = breakSplitOne(canonicalFixtureSession())
    const failing = runAllChecks(flagged).filter((c) => !c.ok)
    expect(failing.map((c) => c.id)).toEqual(['splits_sum_vs_duration'])
  })

  /**
   * The magnitude is the point. 396 -> 436 is 40 s, and CHK-1's band on this run is
   * max(10, 0.5% x 4716) = 23.6 s. A fixture broken by 5 s would leave the banner green and the
   * review screenshot would show nothing happening.
   */
  it('breaks km 1 by the 40 seconds the real miss was worth', () => {
    const flagged = breakSplitOne(canonicalFixtureSession())
    const row = flagged.splits.find((s: { km: number }) => s.km === 1)
    expect(row?.timeSec).toBe(436)
    expect(row?.paceSecPerKm).toBe(436)
    const sum = flagged.splits.reduce((t: number, s: { timeSec: number }) => t + s.timeSec, 0)
    expect(sum - flagged.durationSec).toBe(34)
  })

  it('refuses to break a fixture that has moved', () => {
    const moved = canonicalFixtureSession()
    moved.splits[0].timeSec = 400
    expect(() => breakSplitOne(moved)).toThrow(/the fixture moved/)
  })

  it('is a valid draft and a valid extraction', () => {
    const f = canonicalFixtureSession()
    expect(RawExtractedSession.safeParse(f).success).toBe(true)
    const parsed = ReviewDraftSchema.safeParse({
      ...f,
      occurredOn: resolveOccurredOn(f.dateLabel, new Date('2026-08-22T00:00:00+07:00')),
      intent: null,
      note: null,
    })
    expect(parsed.success, JSON.stringify(parsed.error?.issues)).toBe(true)
  })

  /** No year on the screen, so `resolveOccurredOn` must not read it as next year. */
  it('resolves its year-less date label to the most recent past match', () => {
    const f = canonicalFixtureSession()
    expect(f.dateLabel).toBe('Thu, 20 Aug')
    expect(resolveOccurredOn(f.dateLabel, new Date('2026-08-22T00:00:00+07:00'))).toBe('2026-08-20')
  })
})

describe('the dataset keeps the promises the screenshots make', () => {
  const weeks = new Set(RUNS.map((r) => isoWeekKeyOf(r.date)))

  it('spans enough weeks for the pace regression to be drawn at all', () => {
    // /trends withholds the regression until four weeks exist (F08). Four is the floor, not the aim.
    expect(weeks.size).toBeGreaterThanOrEqual(8)
  })

  it('leaves one week empty, so the rolling mean has a visible gap to draw', () => {
    expect(weeks.has('2026-W28')).toBe(false)
    expect(weeks.has('2026-W27')).toBe(true)
    expect(weeks.has('2026-W29')).toBe(true)
  })

  it('clears 100 km inside August, which is what century_club reads', () => {
    const august = RUNS.filter((r) => r.date.startsWith('2026-08'))
    const metres = august.reduce((total, r) => total + Math.round(r.km * 1000), 0)
    expect(metres).toBeGreaterThanOrEqual(100_000)
  })

  it('has a run over the half-marathon bar and one over 1,000 kcal', () => {
    expect(RUNS.some((r) => Math.round(r.km * 1000) >= 21_100)).toBe(true)
    expect(RUNS.some((r) => r.kcal >= 1000)).toBe(true)
  })

  it('has two runs on one day, at different start times', () => {
    const byDate = new Map<string, string[]>()
    for (const r of RUNS) byDate.set(r.date, [...(byDate.get(r.date) ?? []), r.start])
    const doubles = [...byDate.values()].filter((starts) => starts.length > 1)
    expect(doubles.length).toBeGreaterThanOrEqual(1)
    // `runs_user_occurred_started_unq` is UNIQUE(user_id, occurred_on, started_at): a second run
    // on a day is legal, a second run at the same minute is not.
    for (const starts of doubles) expect(new Set(starts).size).toBe(starts.length)
  })

  it('visits a second location, so `tourist` is earned rather than assumed', () => {
    expect(new Set(RUNS.map((r) => r.location)).size).toBeGreaterThanOrEqual(2)
  })

  it('holds three consecutive runs within 100 m, for groundhog_day', () => {
    const metres = RUNS.map((r) => Math.round(r.km * 1000))
    const windows = metres.slice(2).map((_, i) => metres.slice(i, i + 3))
    expect(windows.some((w) => Math.max(...w) - Math.min(...w) <= 100)).toBe(true)
  })

  it('starts ten runs before 06:00, which is dawn_patrol’s bar', () => {
    expect(RUNS.filter((r) => r.start < '06:00').length).toBeGreaterThanOrEqual(10)
  })
})
