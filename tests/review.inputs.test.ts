import { describe, expect, it } from 'vitest'

import {
  parseClockInput,
  parseDistanceInput,
  parseDurationInput,
  parseIntInput,
  parsePaceInput,
  toDistanceInput,
  toDurationInput,
  toIntInput,
  toPaceInput,
} from '@/lib/review/inputs'

/**
 * The edge between what a reviewer types and what the draft holds.
 *
 * The contract worth defending is the three-way one: **blank is null, nonsense is `invalid`, and
 * the two are never conflated.** `null` is a legitimate value for most fields on this screen — a
 * blank cadence cell is normal — so a typo that collapses into `null` erases a number the
 * screenshot plainly shows, with no error and no trace. Every "invalid, not null" case below is
 * guarding that.
 */

describe('parseDurationInput', () => {
  it('reads the shapes a splits table prints', () => {
    expect(parseDurationInput('4:48').value).toBe(288)
    expect(parseDurationInput('04:48').value).toBe(288)
    expect(parseDurationInput('1:18:36').value).toBe(4716)
  })

  it('reads a bare number as seconds — the stored unit, entered deliberately', () => {
    expect(parseDurationInput('288').value).toBe(288)
  })

  it('allows a leading field over 59: 90:00 is ninety minutes', () => {
    expect(parseDurationInput('90:00').value).toBe(5400)
  })

  it('refuses a non-leading field over 59', () => {
    expect(parseDurationInput('4:99')).toEqual({ value: null, invalid: true })
  })

  it('blank is null, not zero', () => {
    expect(parseDurationInput('')).toEqual({ value: null })
    expect(parseDurationInput('   ')).toEqual({ value: null })
  })

  it('nonsense is invalid, NOT null', () => {
    expect(parseDurationInput('abc')).toEqual({ value: null, invalid: true })
    expect(parseDurationInput('1:2:3:4')).toEqual({ value: null, invalid: true })
    expect(parseDurationInput('4:')).toEqual({ value: null, invalid: true })
  })

  it('round-trips through toDurationInput', () => {
    expect(toDurationInput(288)).toBe('4:48')
    expect(toDurationInput(4716)).toBe('1:18:36')
    expect(toDurationInput(null)).toBe('')
    expect(parseDurationInput(toDurationInput(4716)).value).toBe(4716)
  })
})

describe('parsePaceInput', () => {
  it("reads the screenshot's own spelling", () => {
    expect(parsePaceInput('7\'09"').value).toBe(429)
    expect(parsePaceInput('7’09”').value).toBe(429)
    expect(parsePaceInput('7:09').value).toBe(429)
  })

  it('tolerates the /km suffix a reviewer may copy along with the number', () => {
    expect(parsePaceInput('7\'22"/KM').value).toBe(442)
  })

  it('round-trips through toPaceInput', () => {
    expect(toPaceInput(442)).toBe('7:22')
    expect(parsePaceInput(toPaceInput(442)).value).toBe(442)
  })
})

describe('parseDistanceInput', () => {
  it('reads two decimals', () => {
    expect(parseDistanceInput('10.67').value).toBe(10.67)
  })

  it("accepts Apple's comma, because that is what is on the screen being copied", () => {
    // We RENDER a period (roadmap §4.2, D10). Reading a comma is free and is not the same
    // decision as rendering one.
    expect(parseDistanceInput('10,67').value).toBe(10.67)
  })

  it('rounds to the stored resolution, so what is shown is what is saved', () => {
    expect(parseDistanceInput('10.678').value).toBe(10.68)
  })

  it('rejects text and stray symbols as invalid rather than null', () => {
    expect(parseDistanceInput('10.67km')).toEqual({ value: null, invalid: true })
    expect(parseDistanceInput('ten')).toEqual({ value: null, invalid: true })
  })

  it('renders two decimals always', () => {
    expect(toDistanceInput(10.6)).toBe('10.60')
    expect(toDistanceInput(null)).toBe('')
  })
})

describe('parseIntInput', () => {
  it('reads a whole number inside its range', () => {
    expect(parseIntInput('173', 40, 230).value).toBe(173)
  })

  it('refuses out of range rather than clamping — clamping hides a typo', () => {
    expect(parseIntInput('1890', 40, 230)).toEqual({ value: null, invalid: true })
    expect(parseIntInput('19', 40, 230)).toEqual({ value: null, invalid: true })
  })

  it('blank clears the field', () => {
    expect(parseIntInput('', 40, 230)).toEqual({ value: null })
  })

  it('refuses a decimal in an integer field', () => {
    expect(parseIntInput('173.5', 40, 230)).toEqual({ value: null, invalid: true })
  })

  it('round-trips', () => {
    expect(toIntInput(173)).toBe('173')
    expect(toIntInput(null)).toBe('')
  })
})

describe('parseClockInput', () => {
  it('inserts the colon a numeric keypad cannot type', () => {
    expect(parseClockInput('0707').value).toBe('07:07')
    expect(parseClockInput('707').value).toBe('07:07')
    expect(parseClockInput('7:07').value).toBe('07:07')
    expect(parseClockInput('23:59').value).toBe('23:59')
  })

  it('refuses an impossible clock time', () => {
    expect(parseClockInput('2560')).toEqual({ value: null, invalid: true })
    expect(parseClockInput('0799')).toEqual({ value: null, invalid: true })
  })

  it('blank clears the field', () => {
    expect(parseClockInput('')).toEqual({ value: null })
  })

  it('treats a half-typed entry as invalid so the value is not pushed up early', () => {
    expect(parseClockInput('7')).toEqual({ value: null, invalid: true })
  })
})
