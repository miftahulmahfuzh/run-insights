import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import { score } from '../../research/score.mjs'
import { extractJsonObject } from '@/lib/llm/extractJson'
import {
  makeExtractedSessionSchema,
  type ScreenKind,
} from '@/lib/schema/extractedSession'
import { TOKEN_FLOOR_PER_IMAGE } from '@/lib/llm/vision'

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════
 *  **F04's OFFLINE REGRESSION TEST — acceptance criterion 1, which blocks merge outright.**
 *
 *  D13 and §4.9 require `research/score.mjs` to run in CI against the committed fixture and stay
 *  green at 108/108. `tests/research/score.test.ts` (F01) proves the *instrument* still works by
 *  scoring the ground truth against itself. THIS file proves the *pipeline* still works: a real
 *  response envelope goes in one end, and 108/108 comes out the other after passing through
 *  every production module between them.
 *
 *  No network call, no API key, every PR. See `research/fixtures/README.md` for the fixture's
 *  provenance and the two things it deliberately does not prove.
 * ════════════════════════════════════════════════════════════════════════════════════════════
 */

interface GoldenResponse {
  choices: Array<{ message: { content: string }; finish_reason: string }>
  usage: { prompt_tokens: number; completion_tokens: number }
  model: string
}

const golden = JSON.parse(
  readFileSync('research/fixtures/golden-response.json', 'utf8'),
) as GoldenResponse

const ALL_KINDS: ReadonlySet<ScreenKind> = new Set(['summary', 'splits', 'heartrate'])
const CONTENT = golden.choices[0]!.message.content

describe('the committed golden response, through the production pipeline', () => {
  it('scores 108/108 after extractJsonObject → Zod → score()', () => {
    // The exact chain the background job runs, minus the network. A regression in the fence
    // stripper, in a Zod range, in the provenance guard or in the field set lands here.
    const parsed = extractJsonObject(CONTENT)
    expect(parsed).not.toBeNull()

    const validated = makeExtractedSessionSchema(ALL_KINDS).safeParse(parsed)
    expect(validated.success).toBe(true)
    if (!validated.success) return

    const result = score(validated.data)
    expect(result.errs).toEqual([])
    expect(result.pass).toBe(result.total)
    expect(result.total).toBe(108)
    expect(result.pct).toBe('100.0')
  })

  it('survives the messy wrappers a real model sometimes adds', () => {
    // The fixture content is clean, so on its own it does not exercise the fence stripper. These
    // three wrappers are the shapes actually observed across `research/`'s runs.
    const wrappers = [
      '```json\n' + CONTENT + '\n```',
      '```\n' + CONTENT + '\n```',
      'Here is the workout data:\n\n' + CONTENT + '\n\nLet me know if you need anything else.',
    ]
    for (const wrapped of wrappers) {
      const validated = makeExtractedSessionSchema(ALL_KINDS).safeParse(extractJsonObject(wrapped))
      expect(validated.success).toBe(true)
      if (validated.success) expect(score(validated.data).pass).toBe(108)
    }
  })

  it('the fixture’s usage block would clear the token floor for three images', () => {
    // Criterion 4, tied to the fixture rather than to a hand-written number: whatever `usage` this
    // file carries must be a value the guard accepts, or the fixture is describing a response the
    // pipeline would have refused to parse.
    expect(golden.usage.prompt_tokens).toBeGreaterThanOrEqual(TOKEN_FLOOR_PER_IMAGE * 3)

    // MEASURED: this fixture is a real capture at the shipped 560w/q80 recipe and reports **3,628**
    // prompt tokens. `research/downscale.mjs` recorded 3,277 for the same image variant; the ~350
    // difference is the production prompt's RULES 6a/8/9, not the pixels.
    //
    // The band is wide because it guards a category, not a digit: roughly half this would mean the
    // §3.1 long-edge trap reopened and the images shrank, and roughly 5,500 would mean someone
    // recaptured from the 739x1600 originals instead of the shipped recipe.
    expect(golden.usage.prompt_tokens).toBeGreaterThan(3_000)
    expect(golden.usage.prompt_tokens).toBeLessThan(4_200)
  })

  it('the fixture is a complete response envelope, not just a JSON blob', () => {
    // If someone replaces this with a real capture, these are the fields the test reads.
    expect(golden.model).toBe('glm-4.6v')
    expect(golden.choices[0]!.finish_reason).toBe('stop')
    expect(typeof CONTENT).toBe('string')
  })

  it('a truncated splits table in the fixture would fail, not pass quietly', () => {
    // Proof the assertion above has teeth: the scorer's 108 includes `splits.length`, so a
    // fixture that lost rows cannot score 108/108 by accident.
    const parsed = extractJsonObject(CONTENT) as { splits: unknown[] }
    const truncated = { ...parsed, splits: parsed.splits.slice(0, 5) }
    const validated = makeExtractedSessionSchema(ALL_KINDS).parse(truncated)
    const result = score(validated)
    expect(result.pass).toBeLessThan(108)
    expect(result.errs.some((e: string) => e.includes('splits.length'))).toBe(true)
  })
})
