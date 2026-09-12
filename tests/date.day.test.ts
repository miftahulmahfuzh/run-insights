import { describe, expect, it } from 'vitest'

import {
  addDays,
  daysBetween,
  isValidDateISO,
  jakartaDayOf,
  todayInJakarta,
} from '@/lib/date/ranges'

describe('lib/date/ranges — day half', () => {
  it('validates date strings by shape AND field range', () => {
    expect(isValidDateISO('2026-08-20')).toBe(true)
    // Shape-legal even in a common year: realness (does Feb 29 exist HERE?) is utcDay's job,
    // because a regex cannot know it and Date normalization cannot be trusted to report it.
    expect(isValidDateISO('2026-02-29')).toBe(true)
    expect(isValidDateISO('2026-12-31')).toBe(true)
    // The siblings (MONTH_RE, WEEK_RE) range-check their fields; the date validator does too.
    expect(isValidDateISO('2026-13-01')).toBe(false)
    expect(isValidDateISO('2026-00-10')).toBe(false)
    expect(isValidDateISO('2026-01-32')).toBe(false)
    expect(isValidDateISO('2026-99-99')).toBe(false)
    expect(isValidDateISO('2026-8-20')).toBe(false)
    expect(isValidDateISO('2026-08-2')).toBe(false)
    expect(isValidDateISO('2026-08-201')).toBe(false)
    expect(isValidDateISO('')).toBe(false)
    expect(isValidDateISO(null)).toBe(false)
    expect(isValidDateISO(20260820)).toBe(false)
  })

  it('addDays walks across month, year and leap boundaries', () => {
    expect(addDays('2026-08-20', 0)).toBe('2026-08-20')
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01') // a common year skips the 29th
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29')
    expect(addDays('2028-02-29', 1)).toBe('2028-03-01')
    expect(addDays('2028-03-01', -1)).toBe('2028-02-29')
  })

  it('addDays throws RangeError on an impossible calendar day rather than emitting garbage', () => {
    // '2026-99-99' passes a shape-only check; `new Date` calls it Invalid Date and the naive
    // path renders that as the string 'NaN-NaN-NaN'.
    expect(() => addDays('2026-99-99', 1)).toThrow(RangeError)
    // Worse: Node NORMALISES '2026-02-30' to 2026-03-02 — no NaN, just a silently shifted day
    // that looks perfectly plausible downstream. Both must throw.
    expect(() => addDays('2026-02-30', 0)).toThrow(RangeError)
    expect(() => addDays('2023-02-29', 1)).toThrow(RangeError) // 2023 is not a leap year
  })

  it('daysBetween is whole days, b - a, and antisymmetric', () => {
    expect(daysBetween('2026-08-20', '2026-08-20')).toBe(0)
    expect(daysBetween('2026-08-20', '2026-08-21')).toBe(1)
    expect(daysBetween('2026-08-21', '2026-08-20')).toBe(-1)
    expect(daysBetween('2025-12-31', '2026-01-01')).toBe(1)
    expect(daysBetween('2026-01-01', '2025-12-31')).toBe(-1)
    expect(daysBetween('2028-02-28', '2028-03-01')).toBe(2) // the leap day counts
    // F09's badge streaks read this sign; the antisymmetry is the property they rely on.
    expect(daysBetween('2026-08-20', '2026-08-25')).toBe(-daysBetween('2026-08-25', '2026-08-20'))
  })

  it('daysBetween throws on an impossible calendar day', () => {
    expect(() => daysBetween('2026-02-30', '2026-03-01')).toThrow(RangeError)
    expect(() => daysBetween('2026-03-01', '2026-02-30')).toThrow(RangeError)
  })

  it('jakartaDayOf spends the timezone decision at the UTC+7 midnight boundary', () => {
    // 23:59:59 Jakarta on the 20th is still the 20th...
    expect(jakartaDayOf(new Date('2026-08-20T16:59:59Z'))).toBe('2026-08-20')
    // ...and 00:00:00 Jakarta on the 21st is the 21st — UTC's own midnight is irrelevant.
    expect(jakartaDayOf(new Date('2026-08-20T17:00:00Z'))).toBe('2026-08-21')
    // The file's own worked example: 06:00 Jakarta on the 21st is 23:00Z on the 20th.
    expect(jakartaDayOf(new Date('2026-08-20T23:00:00Z'))).toBe('2026-08-21')
  })

  it('todayInJakarta pins through its parameter; the default reads the live clock once', () => {
    expect(todayInJakarta(new Date('2026-08-20T23:00:00Z'))).toBe('2026-08-21')
    // The parameterless form exists so production needs no argument; asserting only its shape
    // avoids racing the Jakarta midnight between two separate `new Date()` reads.
    expect(isValidDateISO(todayInJakarta())).toBe(true)
  })
})
