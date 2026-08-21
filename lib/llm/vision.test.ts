import { describe, expect, it, vi } from 'vitest'

import { TRUTH } from '../../research/schema.mjs'
import type { PromptImage } from './prompts/extraction'
import {
  callVisionPrimaryWithFetch,
  callVisionRepairWithFetch,
  TOKEN_FLOOR_PER_IMAGE,
  VisionTokenFloorError,
  VisionTransportError,
} from './vision'

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════
 *  THE REGRESSION GUARD FOR THE TOKEN-FLOOR CHECK (D3, plan §1).
 *
 *  Acceptance criteria 3, 4, 5 and 6 live in this file. Criteria 1 and 3 block merge outright —
 *  this is criterion 3. No network call happens anywhere below: every case injects `fetch`.
 * ════════════════════════════════════════════════════════════════════════════════════════════
 */

const IMG = (kind: PromptImage['kind']): PromptImage => ({
  kind,
  // A 1×1 JPEG is enough: nothing under test looks at the pixels. The token count is what the
  // guard reads, and the token count comes from the mocked `usage` block.
  dataUri: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAA==',
})

const THREE = [IMG('summary'), IMG('splits'), IMG('heartrate')]
const TWO = [IMG('summary'), IMG('splits')]

const VALID_EXTRACTION_JSON = JSON.stringify(TRUTH)

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function fakeFetch(body: unknown, status = 200) {
  return vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(body, status))
}

/** The measured drop signature: HTTP 200, a confident wrong answer, 141 prompt tokens. */
const DROPPED_IMAGE_RESPONSE = {
  choices: [
    {
      // Verbatim from the probe in IMPLEMENTATION_PLAN §1.1: the true values are 10.67 km at
      // 7'22"/km. This is what a naive integration would have written into a training log.
      message: { content: '{"distanceKm": 5.00, "avgPaceSecPerKm": 300}' },
      finish_reason: 'stop',
    },
  ],
  usage: { prompt_tokens: 141, completion_tokens: 12 },
}

describe('the token-floor guard', () => {
  it('throws VisionTokenFloorError when prompt_tokens collapses to the measured drop signature', async () => {
    const doFetch = fakeFetch(DROPPED_IMAGE_RESPONSE)

    await expect(callVisionPrimaryWithFetch(doFetch, THREE, { timeoutMs: 5_000 })).rejects.toThrow(
      VisionTokenFloorError,
    )

    // The strongest form of the assertion: the fabricated 5.00 km never left the response body.
    // If this ever fails while the throw above still passes, the guard has been moved BELOW the
    // point where `choices` is read, and it is no longer gating anything.
    expect(doFetch).toHaveBeenCalledOnce()
  })

  it('carries the diagnosis on the error, so a failed row is readable months later', async () => {
    const doFetch = fakeFetch(DROPPED_IMAGE_RESPONSE)
    const error = await callVisionPrimaryWithFetch(doFetch, THREE, { timeoutMs: 5_000 }).catch(
      (e: unknown) => e,
    )

    expect(error).toBeInstanceOf(VisionTokenFloorError)
    const floorError = error as VisionTokenFloorError
    expect(floorError.promptTokens).toBe(141)
    expect(floorError.imageCount).toBe(3)
    expect(floorError.message).toContain('1500') // 3 × 500, the floor it needed to clear
  })

  it('does NOT throw at the measured real-image token cost (3277 for three images)', async () => {
    const doFetch = fakeFetch({
      choices: [{ message: { content: VALID_EXTRACTION_JSON }, finish_reason: 'stop' }],
      // research/downscale.mjs, "jpeg q80 560w": the variant that ships.
      usage: { prompt_tokens: 3277, completion_tokens: 940 },
    })

    const result = await callVisionPrimaryWithFetch(doFetch, THREE, { timeoutMs: 5_000 })
    expect(result.promptTokens).toBe(3277)
    expect(result.text).toBe(VALID_EXTRACTION_JSON)
  })

  it('scales with image count — two images at one image’s cost still trips', async () => {
    const doFetch = fakeFetch({
      choices: [{ message: { content: '{}' }, finish_reason: 'stop' }],
      // 900 clears 1 × 500 and fails 2 × 500. A FLAT floor of 800 would have let this through
      // with one of the two images silently missing, which is the whole reason it is per-image.
      usage: { prompt_tokens: 900, completion_tokens: 5 },
    })

    await expect(callVisionPrimaryWithFetch(doFetch, TWO, { timeoutMs: 5_000 })).rejects.toThrow(
      VisionTokenFloorError,
    )
  })

  it('accepts a single-image upload at its own floor — a 1-image run is first-class', async () => {
    const doFetch = fakeFetch({
      choices: [{ message: { content: '{}' }, finish_reason: 'stop' }],
      usage: { prompt_tokens: TOKEN_FLOOR_PER_IMAGE, completion_tokens: 5 },
    })
    await expect(
      callVisionPrimaryWithFetch(doFetch, [IMG('summary')], { timeoutMs: 5_000 }),
    ).resolves.toBeDefined()
  })

  it('treats a missing usage block as zero, not as "no opinion"', async () => {
    // A response shape we have never seen. It must fail closed: no usage means no evidence the
    // images arrived, and this guard's entire job is refusing to parse unevidenced numbers.
    const doFetch = fakeFetch({
      choices: [{ message: { content: '{"distanceKm": 42}' }, finish_reason: 'stop' }],
    })
    await expect(callVisionPrimaryWithFetch(doFetch, THREE, { timeoutMs: 5_000 })).rejects.toThrow(
      VisionTokenFloorError,
    )
  })

  it('prefers the floor diagnosis over the status code when a response is both', async () => {
    const doFetch = fakeFetch(DROPPED_IMAGE_RESPONSE, 500)
    // Not VisionTransportError: the floor is the more actionable diagnosis, and the measured
    // failure was itself a 200 — a low-token 500 is far more likely to be the same bug.
    await expect(callVisionPrimaryWithFetch(doFetch, THREE, { timeoutMs: 5_000 })).rejects.toThrow(
      VisionTokenFloorError,
    )
  })

  it('R-2 corollary: the TEXT-ONLY repair is not floored at all', async () => {
    // A text-only repair legitimately reports a few hundred prompt tokens — there are no images
    // in it, by ruling. Asserting the image floor here would fail EVERY repair. The floor is
    // `500 × imageCount`, and the repair path passes `imageCount: 0`.
    const doFetch = fakeFetch({
      choices: [{ message: { content: VALID_EXTRACTION_JSON }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 141, completion_tokens: 900 },
    })

    await expect(
      callVisionRepairWithFetch(
        doFetch,
        { kinds: ['summary', 'splits', 'heartrate'], malformedText: '{', issues: '- x' },
        { timeoutMs: 5_000 },
      ),
    ).resolves.toMatchObject({ promptTokens: 141 })
  })
})

describe('the request body', () => {
  function bodyOf(doFetch: ReturnType<typeof fakeFetch>): Record<string, unknown> {
    const init = doFetch.mock.calls[0]?.[1] as RequestInit
    return JSON.parse(String(init.body)) as Record<string, unknown>
  }

  it('always sends thinking: disabled — acceptance criterion 5', async () => {
    const doFetch = fakeFetch({
      choices: [{ message: { content: '{}' }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 3277 },
    })
    await callVisionPrimaryWithFetch(doFetch, THREE, { timeoutMs: 5_000 })

    // MEASURED: thinking mode doubles latency (73 s vs 33.7 s) for an identical 108/108 score.
    // If this assertion ever fails, someone has doubled every extraction's latency for nothing.
    expect(bodyOf(doFetch).thinking).toEqual({ type: 'disabled' })
  })

  it('sends one call with all three images in a single user turn — criterion 6', async () => {
    const doFetch = fakeFetch({
      choices: [{ message: { content: '{}' }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 3277 },
    })
    await callVisionPrimaryWithFetch(doFetch, THREE, { timeoutMs: 5_000 })

    // ONE fetch, never three parallel ones. The parallel variant is twice as fast and scored
    // 94.4%, misreading split 1's pace as 436 s where the screenshot says 396 s.
    expect(doFetch).toHaveBeenCalledOnce()

    const messages = bodyOf(doFetch).messages as Array<{ role: string; content: unknown }>
    expect(messages).toHaveLength(2)
    expect(messages[0]!.role).toBe('system')
    const parts = messages[1]!.content as Array<{ type: string }>
    expect(parts.filter((p) => p.type === 'image_url')).toHaveLength(3)
  })

  it('labels every image with its kind, so a partial or reordered upload is unambiguous', async () => {
    const doFetch = fakeFetch({
      choices: [{ message: { content: '{}' }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 2200 },
    })
    // Reverse order, two images — the production case the measured fixed-order test never covered.
    await callVisionPrimaryWithFetch(doFetch, [IMG('heartrate'), IMG('summary')], {
      timeoutMs: 5_000,
    })

    const messages = bodyOf(doFetch).messages as Array<{ content: unknown }>
    const parts = messages[1]!.content as Array<{ type: string; text?: string }>
    const labels = parts.filter((p) => p.type === 'text').map((p) => p.text ?? '')
    expect(labels[0]).toContain('HEART RATE')
    expect(labels[1]).toContain('SUMMARY screen')
    // And the model is told the absent screen does not exist, so rule 8 can bind.
    expect(labels.at(-1)).toContain('No other screen exists')
  })

  it('sends NO image parts on the repair — R-2 / D17, an image is never sent twice', async () => {
    const doFetch = fakeFetch({
      choices: [{ message: { content: '{}' }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 800 },
    })
    await callVisionRepairWithFetch(
      doFetch,
      {
        kinds: ['summary', 'splits'],
        malformedText: '{"distanceKm":',
        issues: '- splits: required',
      },
      { timeoutMs: 5_000 },
    )

    const raw = String((doFetch.mock.calls[0]?.[1] as RequestInit).body)
    expect(raw).not.toContain('image_url')
    expect(raw).not.toContain('data:image')
    // Three images resent would be ~70–80 s, straight through the 60 s ceiling — and the measured
    // failure is structural, not perceptual: the model saw the image and emitted the wrong shape.
    const messages = bodyOf(doFetch).messages as Array<{ role: string }>
    expect(messages.map((m) => m.role)).toEqual(['system', 'user', 'assistant', 'user'])
  })

  it('refuses an out-of-range image count before it spends a request', async () => {
    const doFetch = fakeFetch({})
    expect(() => callVisionPrimaryWithFetch(doFetch, [], { timeoutMs: 1_000 })).toThrow(/1-3/)
    expect(doFetch).not.toHaveBeenCalled()
  })
})

describe('transport failures', () => {
  it('wraps a network throw', async () => {
    const doFetch = vi.fn<typeof fetch>().mockRejectedValue(new Error('ECONNRESET'))
    await expect(callVisionPrimaryWithFetch(doFetch, THREE, { timeoutMs: 5_000 })).rejects.toThrow(
      VisionTransportError,
    )
  })

  it('wraps a non-JSON body', async () => {
    const doFetch = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response('<html>502 Bad Gateway</html>', { status: 502 }))
    await expect(callVisionPrimaryWithFetch(doFetch, THREE, { timeoutMs: 5_000 })).rejects.toThrow(
      VisionTransportError,
    )
  })

  it('reports a non-200 that CLEARED the floor as a transport error', async () => {
    const doFetch = fakeFetch({ error: 'rate limited', usage: { prompt_tokens: 3277 } }, 429)
    await expect(callVisionPrimaryWithFetch(doFetch, THREE, { timeoutMs: 5_000 })).rejects.toThrow(
      /429/,
    )
  })

  it('preserves the timeout cause, so extract.ts can tell slow from unreachable', async () => {
    const timeout = new Error('timed out')
    timeout.name = 'TimeoutError'
    const doFetch = vi.fn<typeof fetch>().mockRejectedValue(timeout)
    const error = (await callVisionPrimaryWithFetch(doFetch, THREE, { timeoutMs: 5 }).catch(
      (e: unknown) => e,
    )) as VisionTransportError
    expect((error.detail as Error).name).toBe('TimeoutError')
  })
})
