import { describe, expect, it } from 'vitest'

import { isValidIsoWeekKey, isoWeekKeyOf, isoWeekRange } from '@/lib/date/ranges'

describe('lib/date/ranges — ISO week half', () => {
  it('validates ISO week keys', () => {
    expect(isValidIsoWeekKey('2026-W34')).toBe(true)
    expect(isValidIsoWeekKey('2026-W01')).toBe(true)
    expect(isValidIsoWeekKey('2026-W53')).toBe(true)
    expect(isValidIsoWeekKey('2026-W00')).toBe(false)
    expect(isValidIsoWeekKey('2026-W54')).toBe(false)
    expect(isValidIsoWeekKey('2026-W1')).toBe(false)
    expect(isValidIsoWeekKey('2026-34')).toBe(false)
    expect(isValidIsoWeekKey(null)).toBe(false)
  })

  it('the canonical fixture 2026-08-20 lives in 2026-W34', () => {
    expect(isoWeekKeyOf('2026-08-20')).toBe('2026-W34')
    expect(isoWeekRange('2026-W34')).toEqual({
      startISO: '2026-08-17', // Monday
      endExclusiveISO: '2026-08-24', // the next Monday
    })
  })

  it('2026-W01 starts on 2025-12-29 — the late-December-belongs-to-next-year case', () => {
    // 2026-01-01 is a Thursday, so ISO week 1 of 2026 contains it and starts the Monday before.
    expect(isoWeekRange('2026-W01')).toEqual({
      startISO: '2025-12-29',
      endExclusiveISO: '2026-01-05',
    })
    expect(isoWeekKeyOf('2025-12-29')).toBe('2026-W01')
    expect(isoWeekKeyOf('2025-12-28')).toBe('2025-W52')
  })

  it('a 53-week ISO year is handled (2026 has 53 weeks; 2027-W01 starts 2027-01-04)', () => {
    expect(isoWeekRange('2026-W53')).toEqual({
      startISO: '2026-12-28',
      endExclusiveISO: '2027-01-04',
    })
    expect(isoWeekKeyOf('2026-12-31')).toBe('2026-W53')
    expect(isoWeekKeyOf('2027-01-03')).toBe('2026-W53')
    expect(isoWeekKeyOf('2027-01-04')).toBe('2027-W01')
  })

  it('round-trips isoWeekKeyOf(isoWeekRange(w).startISO) === w across three years', () => {
    const weeks = [
      '2025-W01',
      '2025-W09',
      '2025-W52',
      '2026-W01',
      '2026-W12',
      '2026-W34',
      '2026-W53',
      '2027-W01',
      '2027-W26',
      '2027-W52',
    ]
    for (const w of weeks) {
      const { startISO, endExclusiveISO } = isoWeekRange(w)
      expect(isoWeekKeyOf(startISO), `${w} start`).toBe(w)
      // The last day of the week is endExclusive - 1; it must still report the same key.
      const lastDay = new Date(`${endExclusiveISO}T00:00:00Z`)
      lastDay.setUTCDate(lastDay.getUTCDate() - 1)
      expect(isoWeekKeyOf(lastDay.toISOString().slice(0, 10)), `${w} end`).toBe(w)
    }
  })

  it('every range is exactly seven days and starts on a Monday', () => {
    for (let n = 1; n <= 52; n++) {
      const key = `2026-W${String(n).padStart(2, '0')}`
      const { startISO, endExclusiveISO } = isoWeekRange(key)
      const start = new Date(`${startISO}T00:00:00Z`)
      const end = new Date(`${endExclusiveISO}T00:00:00Z`)
      expect(start.getUTCDay()).toBe(1) // Monday
      expect(+end - +start).toBe(7 * 86_400_000)
    }
  })

  it('throws RangeError on a malformed week key', () => {
    expect(() => isoWeekRange('2026-W54')).toThrow(RangeError)
    expect(() => isoWeekRange('nope')).toThrow(RangeError)
  })

  it('is timezone-independent: every answer is computed in UTC', () => {
    // The module must never read the ambient TZ. Asserted for real by running the integration
    // suite under TZ=America/New_York (plan §9.11); here we pin the pure functions.
    const previous = process.env.TZ
    try {
      process.env.TZ = 'America/New_York'
      expect(isoWeekKeyOf('2026-08-20')).toBe('2026-W34')
      expect(isoWeekRange('2026-W34').startISO).toBe('2026-08-17')
    } finally {
      process.env.TZ = previous
    }
  })
})
