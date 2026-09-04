import { detailedRunsFixture } from '@/tests/fixtures/ninaTurn'
import { describe, expect, it } from 'vitest'

import { indexRunsByDate, isRealCalendarDate, resolveDate, resolveDates } from './dates'

/**
 * **The user's own two sentences, pinned.** Given today is 2026-09-03:
 *
 *   "na, coba compare run gw tanggal 3 vs 1 bulan ini"  -> 2026-09-03 vs 2026-09-01
 *   "lari gw kemaren gimana menurut lo?"                -> 2026-09-02
 *
 * The Indonesian -> ISO step is HERS (RU-13) and was measured live on 2026-09-03: given only
 * "Today is Wednesday 2026-09-03", *"na, lari gw kemaren gimana?"* produced
 * `lookup_runs({dates:["2026-09-02"]})` with no date-parsing machinery on our side at all.
 * `tests/live/nina.live.test.ts` guards that against regression.
 *
 * What is pinned here is the half this module owns: that those exact ISO strings resolve to the
 * right day, the right weekday, the right `daysAgo`, and an EXPLICIT absence when nothing ran.
 *
 * `TODAY` is a local constant and deliberately not `NINA_FIXTURE_TODAY` — phase 2's fixture clock
 * is 2026-09-04 in Jakarta, chosen to exercise the UTC+7 boundary, and these cases are the user's,
 * anchored on 2026-09-03.
 */
const TODAY = '2026-09-03'

describe('isRealCalendarDate', () => {
  it('accepts a real day', () => {
    expect(isRealCalendarDate('2026-09-01')).toBe(true)
  })

  it('rejects a day that does not exist, which the ranges.ts regex accepts', () => {
    // The finding this function exists for: `isValidDateISO` is a SHAPE check.
    expect(isRealCalendarDate('2026-02-30')).toBe(false)
    expect(isRealCalendarDate('2026-13-01')).toBe(false)
    expect(isRealCalendarDate('2026-09-31')).toBe(false)
  })

  it('rejects non-strings and free text', () => {
    expect(isRealCalendarDate('kemaren')).toBe(false)
    expect(isRealCalendarDate(null)).toBe(false)
    expect(isRealCalendarDate(20260901)).toBe(false)
  })
})

describe('resolveDate', () => {
  const runs = detailedRunsFixture()
  const index = indexRunsByDate(runs)
  const ranDay = runs[0]!.occurredOn

  it('resolves a day that has a run, with the weekday in both languages', () => {
    const resolved = resolveDate(ranDay, index, TODAY)
    expect(resolved.kind).toBe('runs')
    if (resolved.kind !== 'runs') return
    expect(resolved.runs).toHaveLength(1)
    expect(resolved.dateISO).toBe(ranDay)
    expect(resolved.weekday).toMatch(/^[A-Z][a-z]+day$/)
    expect(resolved.weekdayId).toMatch(/^(Senin|Selasa|Rabu|Kamis|Jumat|Sabtu|Minggu)$/)
    expect(resolved.daysAgo).toBeGreaterThanOrEqual(0)
  })

  it('pins Monday and Sunday, so the weekday arithmetic cannot drift silently', () => {
    // 2026-08-31 is a Monday and 2026-08-30 a Sunday — the two ends of WEEKDAY_EN / WEEKDAY_ID.
    const monday = resolveDate('2026-08-31', new Map(), TODAY)
    const sunday = resolveDate('2026-08-30', new Map(), TODAY)
    expect(monday.kind === 'no_run' && monday.weekday).toBe('Monday')
    expect(monday.kind === 'no_run' && monday.weekdayId).toBe('Senin')
    expect(sunday.kind === 'no_run' && sunday.weekday).toBe('Sunday')
    expect(sunday.kind === 'no_run' && sunday.weekdayId).toBe('Minggu')
  })

  it('answers "no run that day" EXPLICITLY, not with an empty object — R15', () => {
    const resolved = resolveDate('2026-09-01', new Map(), TODAY)
    expect(resolved.kind).toBe('no_run')
    if (resolved.kind !== 'no_run') return
    /* `'Sept'`, not `'Sep'` — that is what `formatDay`'s `en-GB` ICU short month actually
     * produces for September, and therefore what every screen in the app shows. Invariant 3 says
     * she spells a day the way the screen spells it, so this assertion follows `lib/format.ts`
     * rather than the plan's hand-written guess. Do not "correct" it. */
    expect(resolved.dayLabel).toBe('Tue, 1 Sept 2026')
    expect(resolved.weekdayId).toBe('Selasa')
    expect(resolved.daysAgo).toBe(2)
  })

  it('resolves "kemaren" — 2026-09-02 — to exactly one day ago', () => {
    const resolved = resolveDate('2026-09-02', new Map(), TODAY)
    expect(resolved.kind).toBe('no_run')
    if (resolved.kind !== 'no_run') return
    expect(resolved.daysAgo).toBe(1)
  })

  it('resolves today to daysAgo 0', () => {
    const resolved = resolveDate(TODAY, new Map(), TODAY)
    expect(resolved.kind === 'no_run' && resolved.daysAgo).toBe(0)
  })

  it('refuses a future day rather than reporting no run', () => {
    const resolved = resolveDate('2026-09-10', new Map(), TODAY)
    expect(resolved.kind).toBe('future')
    if (resolved.kind !== 'future') return
    expect(resolved.daysAhead).toBe(7)
  })

  it('names the bad input back when the string is not a day', () => {
    const resolved = resolveDate('2026-02-30', new Map(), TODAY)
    expect(resolved.kind).toBe('invalid')
    if (resolved.kind !== 'invalid') return
    expect(resolved.input).toBe('2026-02-30')
  })

  it('returns BOTH runs on a two-a-days date, earliest start first', () => {
    const day = '2026-08-30'
    const base = detailedRunsFixture()[0]!
    const morning = { ...base, runId: 'aaaaaaaaaaaa', occurredOn: day, startedAt: '06:10:00' }
    const evening = { ...base, runId: 'bbbbbbbbbbbb', occurredOn: day, startedAt: '18:40:00' }
    const resolved = resolveDate(day, indexRunsByDate([evening, morning]), TODAY)
    expect(resolved.kind).toBe('runs')
    if (resolved.kind !== 'runs') return
    expect(resolved.runs.map((run) => run.runId)).toEqual(['aaaaaaaaaaaa', 'bbbbbbbbbbbb'])
  })

  it('sorts a run with no started_at LAST — an unknown time is not the morning one', () => {
    const day = '2026-08-30'
    const base = detailedRunsFixture()[0]!
    const unknown = { ...base, runId: 'cccccccccccc', occurredOn: day, startedAt: null }
    const evening = { ...base, runId: 'bbbbbbbbbbbb', occurredOn: day, startedAt: '18:40:00' }
    const resolved = resolveDate(day, indexRunsByDate([unknown, evening]), TODAY)
    expect(resolved.kind === 'runs' && resolved.runs.map((r) => r.runId)).toEqual([
      'bbbbbbbbbbbb',
      'cccccccccccc',
    ])
  })
})

describe('resolveDates', () => {
  it('resolves the compare pair from "tanggal 3 vs 1 bulan ini"', () => {
    const resolved = resolveDates(['2026-09-03', '2026-09-01'], new Map(), TODAY)
    expect(resolved.map((r) => r.kind)).toEqual(['no_run', 'no_run'])
  })

  it('collapses duplicates and caps at five', () => {
    const inputs = [
      '2026-09-01',
      '2026-09-01',
      '2026-09-02',
      '2026-08-30',
      '2026-08-29',
      '2026-08-28',
      '2026-08-27',
    ]
    expect(resolveDates(inputs, new Map(), TODAY)).toHaveLength(5)
  })
})
