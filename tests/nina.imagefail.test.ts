import { describe, expect, it } from 'vitest'

import {
  classifyImageFailure,
  NINA_IMAGE_APOLOGIES,
  NINA_IMAGE_CAPPED_NOTE,
  NINA_IMAGE_CAPTIONS,
  NINA_IMAGE_FAILURES,
  ninaImageApology,
  ninaImageCaption,
  pickLine,
} from '@/lib/nina/imagefail'

/**
 * Anything that would betray the machine to the runner. R22 in one array.
 *
 * Matched on WORD BOUNDARIES, not as substrings, and that is a measured correction rather than a
 * loosening: `'tapi'` — the most ordinary word in her register — contains `'api'`, so a substring
 * check fails a line that says nothing technical at all. What R22 forbids is the word `api` in her
 * mouth, and `\b` is what says so.
 */
const TECHNICAL = [
  'error',
  'failed',
  'timeout',
  'timed out',
  'http',
  'api',
  'server',
  'openrouter',
  'qwen',
  'policy',
  'quota',
  'limit',
  'retry',
  'try again',
  'null',
  'undefined',
  'exception',
  'status',
  'request',
  'github',
  'sistem',
]

describe('classifyImageFailure', () => {
  it('an abort is a timeout', () => {
    expect(classifyImageFailure({ aborted: true })).toBe('timeout')
  })

  it("AbortSignal.timeout's own error is a timeout", () => {
    const cause = new Error('The operation was aborted due to timeout')
    cause.name = 'TimeoutError'
    expect(classifyImageFailure({ cause })).toBe('timeout')
  })

  it('a 400 whose body names a content policy is a refusal', () => {
    expect(
      classifyImageFailure({
        httpStatus: 400,
        body: '{"error":{"message":"Image rejected by content policy"}}',
      }),
    ).toBe('policy')
  })

  it('a 400 whose body is OUR bug is transport, not a refusal', () => {
    // She must not imply she was refused when we sent a malformed payload.
    expect(
      classifyImageFailure({ httpStatus: 400, body: '{"error":{"message":"unknown field n2"}}' }),
    ).toBe('transport')
  })

  it('a 429 is transport, never policy', () => {
    expect(classifyImageFailure({ httpStatus: 429, body: 'rate limit exceeded' })).toBe('transport')
  })

  it('a 500 is transport', () => {
    expect(classifyImageFailure({ httpStatus: 500, body: 'upstream error' })).toBe('transport')
  })

  it('a 200 with no image and a refusal in the body is a refusal', () => {
    expect(classifyImageFailure({ httpStatus: 200, body: '{"data":[],"message":"flagged"}' })).toBe(
      'policy',
    )
  })

  it('a 200 with no image and no refusal is transport', () => {
    expect(classifyImageFailure({ httpStatus: 200, body: '{"data":[]}' })).toBe('transport')
  })

  it('a refused workflow_dispatch is transport', () => {
    // RU-20's new failure mode, classified through the same function.
    expect(
      classifyImageFailure({ cause: new Error('dispatch HTTP 404 {"message":"Not Found"}') }),
    ).toBe('transport')
  })
})

describe('the apologies', () => {
  it('every failure kind has at least one line', () => {
    for (const kind of NINA_IMAGE_FAILURES) {
      expect(NINA_IMAGE_APOLOGIES[kind].length).toBeGreaterThan(0)
    }
  })

  it('the three forced kinds say three DISTINCT things', () => {
    // The exit criterion, literally. `stale` is allowed to read like `timeout` to the runner — it is
    // the same experience — but the three we can force must not collapse into one shrug.
    const lines = (['timeout', 'policy', 'transport'] as const).map((kind) =>
      ninaImageApology(kind, 'JOB000000001'),
    )
    expect(new Set(lines).size).toBe(3)
  })

  it('no apology contains a technical word', () => {
    for (const kind of NINA_IMAGE_FAILURES) {
      for (const line of NINA_IMAGE_APOLOGIES[kind]) {
        const haystack = line.toLowerCase()
        for (const word of TECHNICAL) {
          expect(haystack).not.toMatch(new RegExp(`\\b${word}\\b`))
        }
      }
    }
  })

  it('no apology offers a retry button or names a system', () => {
    for (const kind of NINA_IMAGE_FAILURES) {
      for (const line of NINA_IMAGE_APOLOGIES[kind]) {
        expect(line).not.toMatch(/\b(coba lagi|refresh|reload|klik|tombol|button)\b/i)
      }
    }
  })

  it('every apology is short and lower-case, like a chat message', () => {
    for (const kind of NINA_IMAGE_FAILURES) {
      for (const line of NINA_IMAGE_APOLOGIES[kind]) {
        expect(line.length).toBeLessThanOrEqual(90)
        expect(line[0]).toBe(line[0]!.toLowerCase())
      }
    }
  })

  it('is deterministic per job id', () => {
    expect(ninaImageApology('timeout', 'abc123abc123')).toBe(
      ninaImageApology('timeout', 'abc123abc123'),
    )
  })

  it('spreads across the available lines', () => {
    const ids = Array.from({ length: 200 }, (_, i) => `job${String(i).padStart(8, '0')}`)
    const seen = new Set(ids.map((id) => ninaImageApology('timeout', id)))
    expect(seen.size).toBe(NINA_IMAGE_APOLOGIES.timeout.length)
  })
})

describe('the captions and the cap note', () => {
  it('a caption is never empty — an empty bubble is not a message', () => {
    for (const caption of NINA_IMAGE_CAPTIONS) expect(caption.trim().length).toBeGreaterThan(0)
    expect(ninaImageCaption('zzzzzzzzzzzz').trim().length).toBeGreaterThan(0)
  })

  it('the cap note never gives her a number to quote', () => {
    // Invariant 2: a configuration constant is not a fact about him.
    expect(NINA_IMAGE_CAPPED_NOTE).not.toMatch(/\d/)
    expect(NINA_IMAGE_CAPPED_NOTE.toLowerCase()).toContain('do not mention a limit')
  })
})

describe('pickLine', () => {
  it('throws on an empty list rather than returning undefined', () => {
    expect(() => pickLine([], 'k')).toThrow()
  })
})
