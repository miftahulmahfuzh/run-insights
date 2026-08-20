import { describe, expect, it } from 'vitest'

import { addMonths, isValidMonthKey, monthKey, monthRange } from '@/lib/date/ranges'

describe('lib/date/ranges — month half', () => {
  it('validates month keys', () => {
    expect(isValidMonthKey('2026-08')).toBe(true)
    expect(isValidMonthKey('2026-01')).toBe(true)
    expect(isValidMonthKey('2026-12')).toBe(true)
    expect(isValidMonthKey('2026-00')).toBe(false)
    expect(isValidMonthKey('2026-13')).toBe(false)
    expect(isValidMonthKey('2026-8')).toBe(false)
    expect(isValidMonthKey('2026-08-01')).toBe(false)
    expect(isValidMonthKey('')).toBe(false)
    expect(isValidMonthKey(null)).toBe(false)
    expect(isValidMonthKey(202608)).toBe(false)
  })

  it('addMonths walks forward and back across year boundaries', () => {
    expect(addMonths('2026-08', 0)).toBe('2026-08')
    expect(addMonths('2026-08', 1)).toBe('2026-09')
    expect(addMonths('2026-12', 1)).toBe('2027-01')
    expect(addMonths('2026-01', -1)).toBe('2025-12')
    expect(addMonths('2026-01', -13)).toBe('2024-12')
    expect(addMonths('2026-03', -14)).toBe('2025-01')
    expect(addMonths('2026-08', 12)).toBe('2027-08')
    expect(addMonths('2026-08', -12)).toBe('2025-08')
  })

  it('addMonths is total over a two-year sweep (no NaN, no month 00 or 13)', () => {
    for (let d = -24; d <= 24; d++) {
      const m = addMonths('2026-08', d)
      expect(isValidMonthKey(m)).toBe(true)
    }
  })

  it('monthRange is a half-open interval, including February and December', () => {
    expect(monthRange('2026-08')).toEqual({
      startISO: '2026-08-01',
      endExclusiveISO: '2026-09-01',
    })
    expect(monthRange('2026-02')).toEqual({
      startISO: '2026-02-01',
      endExclusiveISO: '2026-03-01',
    })
    expect(monthRange('2026-12')).toEqual({
      startISO: '2026-12-01',
      endExclusiveISO: '2027-01-01',
    })
    // A leap February: the END is still the 1st of March. Half-open ranges make leap years
    // a non-event, which is exactly why the queries use >= / < instead of a day count.
    expect(monthRange('2028-02')).toEqual({
      startISO: '2028-02-01',
      endExclusiveISO: '2028-03-01',
    })
  })

  it('throws RangeError on a malformed month key rather than returning nonsense', () => {
    expect(() => addMonths('2026-13', 1)).toThrow(RangeError)
    expect(() => monthRange('garbage')).toThrow(RangeError)
    expect(() => monthRange('2026-8')).toThrow(RangeError)
  })

  it('monthKey slices a date without constructing a Date', () => {
    expect(monthKey('2026-08-20')).toBe('2026-08')
    expect(monthKey('2025-12-31')).toBe('2025-12')
  })
})
