import { describe, expect, it } from 'vitest'

import { readFileSync } from 'node:fs'

import { extractJson } from '../../research/score.mjs'
import { extractJsonObject } from './extractJson'

/**
 * `extractJsonObject` is a port of `research/score.mjs`'s `extractJson`, so the first thing this
 * suite asserts is that it is still a port — same input, same answer. The rest covers the
 * `null`-instead-of-throw contract the orchestrator depends on.
 */
describe('parity with the proven research implementation', () => {
  const cases = [
    '{"distanceKm": 10.67}',
    '```json\n{"distanceKm": 10.67}\n```',
    '```\n{"distanceKm": 10.67}\n```',
    'Here is the JSON:\n{"distanceKm": 10.67}\nLet me know if you need anything else.',
    '{"nested": {"deep": {"value": 1}}}',
    'no braces at all',
    '',
  ]

  it.each(cases)('agrees with score.mjs on %j', (input) => {
    expect(extractJsonObject(input)).toEqual(extractJson(input))
  })
})

describe('the null-instead-of-throw contract', () => {
  it('returns null for malformed JSON rather than throwing', () => {
    // The orchestrator treats "no parseable object" and "parsed but failed Zod" identically —
    // both are a repairable `validation` failure — so a throw here would only buy a try/catch.
    expect(extractJsonObject('{"distanceKm": 10.67,}')).toBeNull()
    expect(extractJsonObject('{unquoted: 1}')).toBeNull()
  })

  it('returns null for null and undefined', () => {
    expect(extractJsonObject(null)).toBeNull()
    expect(extractJsonObject(undefined)).toBeNull()
  })

  it('refuses a bare array, even between braces', () => {
    // `[1,2]` is valid JSON and is not a session. Letting it through would hand Zod an array
    // where it expects an object, producing a confusing issue list on the repair note.
    expect(extractJsonObject('[{"km": 1}]')).toEqual({ km: 1 }) // outermost braces win
    expect(extractJsonObject('[1, 2, 3]')).toBeNull()
  })

  it('takes the outermost braces, so trailing chatter cannot truncate the object', () => {
    const text = 'Sure!\n{"a": {"b": 1}}\n\nHope that helps.'
    expect(extractJsonObject(text)).toEqual({ a: { b: 1 } })
  })
})

describe('the committed golden fixture', () => {
  it('parses the real response envelope’s content through the production extractor', () => {
    // Acceptance criterion 1's first hop: whatever the fixture holds must survive this function.
    const fixture = JSON.parse(readFileSync('research/fixtures/golden-response.json', 'utf8')) as {
      choices: Array<{ message: { content: string } }>
    }

    const parsed = extractJsonObject(fixture.choices[0]!.message.content)
    expect(parsed).not.toBeNull()
    expect((parsed as { distanceKm: number }).distanceKm).toBe(10.67)
  })
})
