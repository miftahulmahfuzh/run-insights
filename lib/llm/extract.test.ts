import { describe, expect, it, vi } from 'vitest'

import { TRUTH } from '../../research/schema.mjs'
import { MIN_REPAIR_BUDGET_MS, type ScreenKind } from '@/lib/extract/constants'
import { extractSession, type ExtractDeps } from './extract'
import type { PromptImage } from './prompts/extraction'
import { VisionTokenFloorError, VisionTransportError, type VisionResult } from './vision'

/**
 * The orchestrator, end to end, with both vision calls and the clock injected. No network, no real
 * timers, so the budget gate is exercised deterministically rather than by waiting 45 seconds.
 *
 * Covers Task 8's six required cases plus the two rulings that are easiest to break silently:
 * the token floor never triggers a repair (D3), and the repair never carries an image (R-2).
 */

const IMAGES: PromptImage[] = [
  { kind: 'summary', dataUri: 'data:image/jpeg;base64,AAA' },
  { kind: 'splits', dataUri: 'data:image/jpeg;base64,BBB' },
  { kind: 'heartrate', dataUri: 'data:image/jpeg;base64,CCC' },
]
const ALL_KINDS: ReadonlySet<ScreenKind> = new Set(['summary', 'splits', 'heartrate'])
const BUDGET = 50_000

function visionResult(text: string, over: Partial<VisionResult> = {}): VisionResult {
  return {
    text,
    promptTokens: 3277,
    completionTokens: 940,
    finishReason: 'stop',
    raw: { choices: [{ message: { content: text } }], usage: { prompt_tokens: 3277 } },
    ...over,
  }
}

const GOOD_JSON = JSON.stringify(TRUTH)
/** The measured vendor failure: a required field simply absent from a split row (§1.6). */
const BAD_JSON = JSON.stringify({
  ...TRUTH,
  splits: TRUTH.splits.map((s, i) => (i === 0 ? { ...s, hrBpm: undefined } : s)),
})

/**
 * Deps with a fake clock that advances by `elapsePerCall` on every vision call, so the budget gate
 * is testable without waiting 45 seconds for anything.
 *
 * Both calls are WRAPPED rather than replaced, so an override still advances the clock and still
 * increments the counter. Getting this wrong the first time produced two failures that looked like
 * orchestrator bugs and were entirely the harness's — worth the extra indirection.
 */
function deps(
  over: {
    callPrimary?: ExtractDeps['callPrimary']
    callRepair?: ExtractDeps['callRepair']
    elapsePerCall?: number
  } = {},
): ExtractDeps & { calls: { primary: number; repair: number } } {
  const calls = { primary: 0, repair: 0 }
  let clock = 1_000_000
  const elapse = over.elapsePerCall ?? 0

  const primary = over.callPrimary ?? (async () => visionResult(GOOD_JSON))
  const repair = over.callRepair ?? (async () => visionResult(GOOD_JSON))

  return {
    callPrimary: vi.fn(async (...args: Parameters<ExtractDeps['callPrimary']>) => {
      calls.primary += 1
      clock += elapse
      return primary(...args)
    }),
    callRepair: vi.fn(async (...args: Parameters<ExtractDeps['callRepair']>) => {
      calls.repair += 1
      clock += elapse
      return repair(...args)
    }),
    now: () => clock,
    calls,
  }
}

describe('the happy path', () => {
  it('validates on the first attempt → ok, one call, no repair', async () => {
    const d = deps()
    const outcome = await extractSession(d, IMAGES, ALL_KINDS, BUDGET)

    expect(outcome.status).toBe('ok')
    expect(outcome.errorCode).toBeNull()
    expect(outcome.attempts).toBe(1)
    expect(outcome.promptTokens).toBe(3277)
    expect(outcome.session?.distanceKm).toBe(10.67)
    expect(outcome.session?.splits).toHaveLength(11)
    expect(d.calls).toEqual({ primary: 1, repair: 0 })
  })

  it('applies the provenance guard to the validated result, not just to the raw JSON', async () => {
    // Acceptance criterion 12, at the orchestrator level: the model returns a full heart-rate
    // section for an upload that had no heart-rate screenshot, and the caller never sees it.
    const d = deps()
    const outcome = await extractSession(
      d,
      IMAGES.slice(0, 2),
      new Set(['summary', 'splits']),
      BUDGET,
    )

    expect(outcome.status).toBe('ok')
    expect(outcome.session?.hrZones).toEqual([])
    expect(outcome.session?.maxHrBpm).toBeNull()
    expect(outcome.session?.distanceKm).toBe(10.67)
  })

  it('strips markdown fences the model was told not to emit', async () => {
    const d = deps({
      callPrimary: vi.fn(async () => visionResult('```json\n' + GOOD_JSON + '\n```')),
    })
    const outcome = await extractSession(d, IMAGES, ALL_KINDS, BUDGET)
    expect(outcome.status).toBe('ok')
  })
})

describe('the one repair round-trip', () => {
  it('Zod fails, the text-only repair validates → repaired', async () => {
    const d = deps({ callPrimary: vi.fn(async () => visionResult(BAD_JSON)) })
    const outcome = await extractSession(d, IMAGES, ALL_KINDS, BUDGET)

    expect(outcome.status).toBe('repaired')
    expect(outcome.attempts).toBe(2)
    expect(outcome.errorCode).toBeNull()
    expect(outcome.session?.splits).toHaveLength(11)
    expect(d.calls).toEqual({ primary: 1, repair: 1 })
  })

  it('hands the repair the model’s own malformed text and the Zod issue list', async () => {
    const callRepair = vi.fn(async () => visionResult(GOOD_JSON))
    const d = deps({ callPrimary: vi.fn(async () => visionResult(BAD_JSON)), callRepair })
    await extractSession(d, IMAGES, ALL_KINDS, BUDGET)

    const [input] = (
      d.callRepair as unknown as { mock: { calls: Array<Parameters<ExtractDeps['callRepair']>> } }
    ).mock.calls[0]!
    expect(input.malformedText).toBe(BAD_JSON)
    // A model that is told WHICH field failed fixes that field; one told "invalid" re-guesses
    // everything, which is how a good value becomes a bad one on the second attempt.
    expect(input.issues).toContain('splits.0.hrBpm')
    // R-2: the repair knows which screens existed, without a single byte of image data.
    expect(input.kinds).toEqual(['summary', 'splits', 'heartrate'])
  })

  it('repair also fails Zod → failed / validation, and the repair’s raw body is kept', async () => {
    const d = deps({
      callPrimary: vi.fn(async () => visionResult(BAD_JSON)),
      callRepair: vi.fn(async () => visionResult(BAD_JSON, { promptTokens: 900 })),
    })
    const outcome = await extractSession(d, IMAGES, ALL_KINDS, BUDGET)

    expect(outcome.status).toBe('failed')
    expect(outcome.errorCode).toBe('validation')
    expect(outcome.session).toBeNull()
    expect(outcome.attempts).toBe(2)
    expect(outcome.promptTokens).toBe(900)
  })

  it('repairs a reply that contained no JSON object at all', async () => {
    const d = deps({
      callPrimary: vi.fn(async () => visionResult('I cannot read these images, sorry.')),
    })
    const outcome = await extractSession(d, IMAGES, ALL_KINDS, BUDGET)
    expect(outcome.status).toBe('repaired')
  })

  it('tells a no-JSON reply what was wrong, rather than passing an empty issue list', async () => {
    const callRepair = vi.fn(async () => visionResult(GOOD_JSON))
    const d = deps({
      callPrimary: vi.fn(async () => visionResult('Sure, one moment!')),
      callRepair,
    })
    await extractSession(d, IMAGES, ALL_KINDS, BUDGET)
    expect(
      (d.callRepair as unknown as { mock: { calls: Array<Parameters<ExtractDeps['callRepair']>> } })
        .mock.calls[0]![0].issues,
    ).toContain('no JSON object')
  })
})

describe('when a repair must NOT be attempted', () => {
  it('a token-floor trip skips the repair entirely → failed / token_floor', async () => {
    // D3, and the single most important branch in this file. A repair resends the same request
    // shape to the same misbehaving endpoint; it would fail identically, and the text-only form
    // has no image data to recover from in the first place.
    const callRepair = vi.fn(async () => visionResult(GOOD_JSON))
    const d = deps({
      callPrimary: vi.fn(async () => {
        throw new VisionTokenFloorError(141, 3)
      }),
      callRepair,
    })
    const outcome = await extractSession(d, IMAGES, ALL_KINDS, BUDGET)

    expect(outcome.status).toBe('failed')
    expect(outcome.errorCode).toBe('token_floor')
    expect(outcome.session).toBeNull()
    // The canary is carried onto the row, so a `token_floor` failure is diagnosable later.
    expect(outcome.promptTokens).toBe(141)
    expect(d.calls.repair).toBe(0)
  })

  it('a truncated response (finish_reason: length) skips the repair', async () => {
    // Same max_tokens, same prompt, same output length: it would truncate identically.
    const callRepair = vi.fn(async () => visionResult(GOOD_JSON))
    const d = deps({
      callPrimary: vi.fn(async () =>
        visionResult(BAD_JSON.slice(0, 400), { finishReason: 'length' }),
      ),
      callRepair,
    })
    const outcome = await extractSession(d, IMAGES, ALL_KINDS, BUDGET)

    expect(outcome.status).toBe('failed')
    expect(outcome.errorCode).toBe('validation')
    expect(d.calls.repair).toBe(0)
  })

  it('insufficient remaining budget skips the repair', async () => {
    // Starting a round-trip we cannot finish risks the whole invocation dying mid-flight and
    // leaving the row `pending` — strictly worse than failing cleanly now with a reason.
    const callRepair = vi.fn(async () => visionResult(GOOD_JSON))
    const d = deps({
      callPrimary: vi.fn(async () => visionResult(BAD_JSON)),
      callRepair,
      elapsePerCall: 44_000, // the primary all but used the envelope up
    })
    const outcome = await extractSession(d, IMAGES, ALL_KINDS, MIN_REPAIR_BUDGET_MS + 20_000)

    expect(outcome.status).toBe('failed')
    expect(outcome.errorCode).toBe('validation')
    expect(d.calls.repair).toBe(0)
  })

  it('measures the gate against ELAPSED time, so a fast primary still gets its repair', async () => {
    // The plan subtracted the primary's 45 s TIMEOUT from the budget rather than the time it
    // actually took. With a 28 s gate (the measured repair minimum) that arithmetic would refuse
    // every repair: 50 s budget - 45 s timeout = 5 s, well under the gate, even when the primary
    // in fact took 8 s and left 42 s. Elapsed time is the only honest input here.
    const callRepair = vi.fn(async () => visionResult(GOOD_JSON))
    const d = deps({
      callPrimary: vi.fn(async () => visionResult(BAD_JSON)),
      callRepair,
      elapsePerCall: 8_000, // a quick primary
    })
    const outcome = await extractSession(d, IMAGES, ALL_KINDS, 50_000)

    expect(outcome.status).toBe('repaired')
    expect(d.calls.repair).toBe(1)
    // The counterfactual, stated: the plan's formula would have skipped this.
    expect(50_000 - 45_000).toBeLessThan(MIN_REPAIR_BUDGET_MS)
  })
})

describe('transport failures', () => {
  it('maps a transport error on the primary to failed / transport, with no repair', async () => {
    const callRepair = vi.fn(async () => visionResult(GOOD_JSON))
    const d = deps({
      callPrimary: vi.fn(async () => {
        throw new VisionTransportError('ECONNRESET')
      }),
      callRepair,
    })
    const outcome = await extractSession(d, IMAGES, ALL_KINDS, BUDGET)

    expect(outcome).toMatchObject({ status: 'failed', errorCode: 'transport', session: null })
    expect(d.calls.repair).toBe(0)
  })

  it('distinguishes a timeout from an unreachable endpoint', async () => {
    const timeout = new Error('The operation was aborted due to timeout')
    timeout.name = 'TimeoutError'
    const d = deps({
      callPrimary: vi.fn(async () => {
        throw new VisionTransportError('vision request failed or timed out', timeout)
      }),
    })
    const outcome = await extractSession(d, IMAGES, ALL_KINDS, BUDGET)
    expect(outcome.errorCode).toBe('timeout')
  })

  it('a transport error on the REPAIR keeps the primary’s body as the audit record', async () => {
    const d = deps({
      callPrimary: vi.fn(async () => visionResult(BAD_JSON, { promptTokens: 3277 })),
      callRepair: vi.fn(async () => {
        throw new VisionTransportError('gateway')
      }),
    })
    const outcome = await extractSession(d, IMAGES, ALL_KINDS, BUDGET)

    expect(outcome).toMatchObject({ status: 'failed', errorCode: 'transport', attempts: 2 })
    expect(outcome.promptTokens).toBe(3277)
    expect(outcome.rawVendorResponse).not.toBeNull()
  })

  it('a token-floor trip on the REPAIR is reported as such, not as validation', async () => {
    const d = deps({
      callPrimary: vi.fn(async () => visionResult(BAD_JSON)),
      callRepair: vi.fn(async () => {
        throw new VisionTokenFloorError(4, 0)
      }),
    })
    const outcome = await extractSession(d, IMAGES, ALL_KINDS, BUDGET)
    expect(outcome.errorCode).toBe('token_floor')
  })

  it('re-throws a genuinely unexpected error instead of mislabelling it', async () => {
    // A TypeError here is a bug in our code, not a vendor failure. Swallowing it as `transport`
    // would hide it forever behind a plausible-looking failed row.
    const d = deps({
      callPrimary: vi.fn(async () => {
        throw new TypeError('images.map is not a function')
      }),
    })
    await expect(extractSession(d, IMAGES, ALL_KINDS, BUDGET)).rejects.toThrow(TypeError)
  })
})
