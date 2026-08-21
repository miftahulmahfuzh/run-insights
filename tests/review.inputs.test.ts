import { describe, expect, it } from 'vitest'

import {
  maskTimeInput,
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

/**
 * The mask is what makes five fields typeable on a phone at all: `inputMode="numeric"` has no
 * colon key, so the separator is drawn rather than accepted.
 *
 * `typeInto` is the test that matters. It folds the digits one character at a time through
 * `maskTimeInput(previous + character, shape)` — which is **exactly** what `ParsedInput`'s change
 * handler does — so it exercises the real path without a DOM. That matters here more than usual:
 * `vitest.config.ts` runs `environment: 'node'` and matches `*.test.ts` only, so there is no
 * component test to fall back on and this is the whole safety net.
 */
function typeInto(digits: string, shape: 'mm:ss' | 'hh:mm:ss'): string[] {
  const seen: string[] = []
  let text = ''
  for (const character of digits) {
    text = maskTimeInput(text + character, shape)
    seen.push(text)
  }
  return seen
}

describe('maskTimeInput', () => {
  it('shifts digits in from the right as they are typed', () => {
    expect(typeInto('11836', 'hh:mm:ss')).toEqual(['0:01', '0:11', '1:18', '11:83', '1:18:36'])
    expect(typeInto('448', 'mm:ss')).toEqual(['0:04', '0:44', '4:48'])
  })

  it('shifts them back out again on backspace, symmetrically', () => {
    // The last character of every masked shape is a digit, never a colon, so deleting one
    // character and re-masking walks the typing sequence backwards.
    let text = '1:18:36'
    const seen: string[] = []
    while (text !== '') {
      text = maskTimeInput(text.slice(0, -1), 'hh:mm:ss')
      seen.push(text)
    }
    expect(seen).toEqual(['11:83', '1:18', '0:11', '0:01', ''])
  })

  it('is idempotent over its own output', () => {
    // This is what lets ParsedInput re-seed through the mask without the text drifting.
    for (const text of ['', '1', '11', '448', '1183', '11836', '0:01', '11:83:60', '0:00:11']) {
      const once = maskTimeInput(text, 'hh:mm:ss')
      expect(maskTimeInput(once, 'hh:mm:ss')).toBe(once)
    }
  })

  it('accepts a colon typed on a real keyboard, because it drops it', () => {
    expect(maskTimeInput('4:48', 'mm:ss')).toBe('4:48')
    expect(maskTimeInput('448', 'mm:ss')).toBe('4:48')
    expect(maskTimeInput('1:18:36', 'hh:mm:ss')).toBe('1:18:36')
  })

  it('caps the digits, which is the guardrail and not just a bound', () => {
    // A pace field that cannot hold six digits cannot hold `436` for a `6'36"` split.
    expect(maskTimeInput('11836', 'mm:ss')).toBe('11:83')
    expect(maskTimeInput('1183699', 'hh:mm:ss')).toBe('11:83:69')
  })

  it('drops leading zeros, which is what lets the field be cleared at all', () => {
    expect(maskTimeInput('0011', 'mm:ss')).toBe('0:11')
    expect(maskTimeInput('000011', 'hh:mm:ss')).toBe('0:11')
    // Without dropping them, padding inflates the digit count and `00` re-pads to `0:00`
    // forever — a masked field you cannot empty, on fields where null is a legitimate value.
    expect(maskTimeInput('00', 'hh:mm:ss')).toBe('')
    expect(maskTimeInput('0:0', 'hh:mm:ss')).toBe('')
  })

  it('round-trips whatever the formatters print', () => {
    for (const seconds of [1, 288, 429, 4716, 5999]) {
      expect(maskTimeInput(toDurationInput(seconds), 'hh:mm:ss')).toBe(toDurationInput(seconds))
    }
    // `mm:ss` stops at 59:59: `toDurationInput(3600)` is `1:00:00`, which four digits cannot
    // hold. A kilometre slower than an hour is outside this shape by design.
    for (const seconds of [1, 288, 429, 3599]) {
      expect(maskTimeInput(toPaceInput(seconds), 'mm:ss')).toBe(toPaceInput(seconds))
    }
  })

  it('hands the parser something it already knows how to read', () => {
    expect(parseDurationInput(maskTimeInput('11836', 'hh:mm:ss')).value).toBe(4716)
    expect(parsePaceInput(maskTimeInput('448', 'mm:ss')).value).toBe(288)
    // The intermediate state is invalid, which is why the error is deferred rather than the
    // keystroke refused: `1:18:36` is only reachable through `11:83`.
    expect(parseDurationInput(maskTimeInput('1183', 'hh:mm:ss')).invalid).toBe(true)
  })

  it('a cleared field is empty, which the parsers read as null', () => {
    expect(maskTimeInput('', 'mm:ss')).toBe('')
    expect(parseDurationInput(maskTimeInput('', 'mm:ss'))).toEqual({ value: null })
  })
})
