import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import { REPORT_TOOL } from '@/lib/llm/prompts/narrate'
import { describeInsightIssues, InsightPayloadSchema } from '@/lib/llm/schema'

/**
 * Task 2. **The fixture is a real captured failure, not a hand-written one.**
 *
 * `research/results-narrative.json` is what z.ai actually returned for the canonical run: a 200,
 * a well-formed `report` tool call, sensible prose — and **two independent contract violations**:
 *
 *   1. `title` missing from every single entry of `observations`, despite `title` sitting in the
 *      tool schema's `required` array. The server did not check it, and said 200.
 *   2. an 87-character `headline`, against a rule the prompt states in words and the tool schema
 *      states again as `maxLength: 70`. Neither was enforced either.
 *
 * Both were found by writing this test against the committed capture rather than against a
 * hand-written "malformed" object — the second one was not in F07's plan, which had only noticed
 * the missing titles. That is the argument for testing against a real capture: a fixture invented
 * to fail in the way you expect can only ever confirm what you already knew.
 */

interface CapturedNarrative {
  out: Record<string, unknown>
}

const captured = JSON.parse(
  readFileSync(new URL('../research/results-narrative.json', import.meta.url), 'utf8'),
) as CapturedNarrative

describe('InsightPayload — the measured response', () => {
  it('REJECTS it: every observation is missing its title', () => {
    const parsed = InsightPayloadSchema.safeParse(captured.out)

    expect(parsed.success).toBe(false)
    if (parsed.success) return

    // Not "some error happened" — the specific field, on every entry. If a future capture has
    // titles present, this test is the thing that notices the fixture changed under the feature.
    const paths = parsed.error.issues.map((i) => i.path.join('.'))
    expect(paths).toContain('observations.0.title')
    expect(paths).toContain('observations.1.title')
    expect(paths).toContain('observations.2.title')
    expect(paths).toContain('observations.3.title')
  })

  it('REJECTS it a second time over: the headline is 87 characters against a stated 70', () => {
    expect((captured.out.headline as string).length).toBe(87)

    const parsed = InsightPayloadSchema.safeParse(captured.out)
    expect(parsed.success).toBe(false)
    if (parsed.success) return
    expect(parsed.error.issues.map((i) => i.path.join('.'))).toContain('headline')
  })

  it('accepts it once both violations are repaired', () => {
    const repaired = {
      ...captured.out,
      headline: 'Almost entirely zone 4-5 — too hard to be easy',
      observations: (captured.out.observations as Array<Record<string, unknown>>).map((o, i) => ({
        ...o,
        title: `Observation ${i + 1}`,
      })),
    }

    const parsed = InsightPayloadSchema.safeParse(repaired)
    expect(parsed.success).toBe(true)
    if (!parsed.success) return

    expect(parsed.data.verdict).toBe('hard')
    expect(parsed.data.headline.length).toBeLessThanOrEqual(70)
    // The prose the model wrote survives untouched — only the two defects were patched.
    expect(parsed.data.whatHappened).toContain('90.6%')
    expect(parsed.data.observations).toHaveLength(4)
    expect(parsed.data.doNext).toHaveLength(3)
  })
})

describe('InsightPayload — the caps that protect the card', () => {
  const valid = {
    headline: 'A short headline',
    verdict: 'hard' as const,
    whatHappened: 'It happened.',
    observations: [
      { title: 'One', detail: 'a', metric: 'b' },
      { title: 'Two', detail: 'c', metric: 'd' },
    ],
    doNext: ['Rest'],
    questionForRunner: 'Why?',
  }

  it('accepts the minimum shape', () => {
    expect(InsightPayloadSchema.safeParse(valid).success).toBe(true)
  })

  it('rejects a headline past 70 characters — the hero slot is one line', () => {
    const long = { ...valid, headline: 'x'.repeat(71) }
    expect(InsightPayloadSchema.safeParse(long).success).toBe(false)
  })

  it('rejects a single observation and a fifth one', () => {
    expect(
      InsightPayloadSchema.safeParse({ ...valid, observations: valid.observations.slice(0, 1) })
        .success,
    ).toBe(false)
    expect(
      InsightPayloadSchema.safeParse({
        ...valid,
        observations: [...valid.observations, ...valid.observations, valid.observations[0]],
      }).success,
    ).toBe(false)
  })

  it('rejects an unknown verdict — the UI renders four pills and only four', () => {
    expect(InsightPayloadSchema.safeParse({ ...valid, verdict: 'brutal' }).success).toBe(false)
  })

  it('rejects an empty doNext — "1-3 items" means at least one', () => {
    expect(InsightPayloadSchema.safeParse({ ...valid, doNext: [] }).success).toBe(false)
  })

  it('trims rather than rejects surrounding whitespace', () => {
    const parsed = InsightPayloadSchema.safeParse({ ...valid, headline: '  spaced  ' })
    expect(parsed.success && parsed.data.headline).toBe('spaced')
  })
})

describe('the tool schema and the Zod schema describe the same object', () => {
  it('names the same six required fields', () => {
    const toolRequired = [...((REPORT_TOOL.input_schema.required as string[]) ?? [])].sort()
    const zodKeys = Object.keys(InsightPayloadSchema.shape).sort()
    expect(toolRequired).toEqual(zodKeys)
  })

  it('names the same three observation fields', () => {
    const properties = REPORT_TOOL.input_schema.properties as Record<
      string,
      { items?: { required?: string[] } }
    >
    expect([...(properties.observations?.items?.required ?? [])].sort()).toEqual([
      'detail',
      'metric',
      'title',
    ])
  })
})

describe('the tool property descriptions are load-bearing, not decoration', () => {
  /*
   * MEASURED 2026-08-21 against live glm-5.3: with no property descriptions this schema failed
   * validation on 3 of 3 first attempts, every time because `title` was absent from all four
   * observations. With them, 5 of 6 first attempts validated. That is the difference between one
   * model call at ~14 s and two at ~19 s, on every insight the app ever generates.
   *
   * This test exists because the descriptions look exactly like the kind of verbosity a tidying
   * pass deletes. See the block comment on REPORT_TOOL for the full measurement.
   */
  const properties = REPORT_TOOL.input_schema.properties as Record<
    string,
    { description?: string; items?: { properties?: Record<string, { description?: string }> } }
  >

  it('describes every top-level property', () => {
    for (const key of Object.keys(InsightPayloadSchema.shape)) {
      expect(properties[key]?.description, `${key} has no description`).toBeTruthy()
    }
  })

  it('marks all three observation fields REQUIRED in their own descriptions', () => {
    const observation = properties.observations?.items?.properties ?? {}
    for (const key of ['title', 'detail', 'metric']) {
      expect(observation[key]?.description ?? '').toContain('REQUIRED')
    }
  })

  it('shows the model what a metric looks like, so it stops echoing JSON field names', () => {
    // Without an example it wrote `percentTimeInZone4And5: 90.6`. With one it writes
    // `90.6% in zone 4-5, avg HR 173`.
    const metric = properties.observations?.items?.properties?.metric?.description ?? ''
    expect(metric).toContain('e.g.')
    expect(metric).toContain('zone 4-5')
  })
})

describe('describeInsightIssues', () => {
  it('renders one bullet per issue, path first', () => {
    const parsed = InsightPayloadSchema.safeParse({ headline: '' })
    expect(parsed.success).toBe(false)
    if (parsed.success) return

    const text = describeInsightIssues(parsed.error)
    expect(text).toContain('- headline:')
    expect(text.split('\n').length).toBeGreaterThan(1)
  })

  it('degrades to a string for a non-Zod error rather than throwing inside a repair', () => {
    expect(describeInsightIssues(new Error('boom'))).toBe('Error: boom')
  })
})
