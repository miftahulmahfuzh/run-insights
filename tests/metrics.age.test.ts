import { describe, expect, it } from 'vitest'

import { ageFromBirthYear, birthYearFromAge } from '@/lib/metrics/age'

/** The canonical fixture's date. Every test pins it rather than mocking global time. */
const TODAY = new Date('2026-08-20T05:12:00+07:00')

describe('ageFromBirthYear', () => {
  it('gives the fixture runner 30 on the fixture date', () => {
    expect(ageFromBirthYear(1996, TODAY)).toBe(30)
  })

  it('is a whole-year subtraction, because the input is a year', () => {
    expect(ageFromBirthYear(2006, TODAY)).toBe(20)
    expect(ageFromBirthYear(1966, TODAY)).toBe(60)
  })

  it('shifts by exactly one on 1 January, with no write anywhere', () => {
    // This is the whole reason the column stores a year: the number is correct on every date it is
    // read, and nothing has to remember to update it.
    expect(ageFromBirthYear(1996, new Date('2026-12-31T23:00:00+07:00'))).toBe(30)
    expect(ageFromBirthYear(1996, new Date('2027-01-01T09:00:00+07:00'))).toBe(31)
  })
})

describe('birthYearFromAge', () => {
  it('round-trips through ageFromBirthYear for a spread of ages', () => {
    for (const age of [10, 18, 30, 47, 64, 100]) {
      expect(ageFromBirthYear(birthYearFromAge(age, TODAY), TODAY)).toBe(age)
    }
  })

  it('gives 1996 for the fixture runner', () => {
    expect(birthYearFromAge(30, TODAY)).toBe(1996)
  })
})
