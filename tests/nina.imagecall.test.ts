import { afterEach, describe, expect, it, vi } from 'vitest'

import { callNinaImageModel } from '../lib/nina/imagecall.ts'
import { NINA_IMAGE_MODEL, OPENROUTER_IMAGE_URL } from '../lib/nina/imagerecipe.ts'

/**
 * **The shutter's contract.** `callNinaImageModel`'s docblock promises "it never throws — every
 * failure comes back as a `NinaImageFailure`", and the previous generation of this pipeline
 * falsified exactly that promise in the only environment that mattered: on 2026-09-04 Vercel
 * production carried no `OPENROUTER_API_KEY`, the lazy zod group threw before the network, and
 * image jobs sat `pending` with `cost_micro_usd` null while Nina said nothing for twenty minutes.
 *
 * **`tests/support/setup.ts` stubs the core and LLM groups and deliberately does not stub the nina
 * group** — so the unset case below is that failure, reproduced for free. Do not "fix" this suite
 * by adding `OPENROUTER_API_KEY` to those defaults; that would delete the only test that
 * reproduces the bug.
 *
 * This file replaces `tests/nina.imagedispatch.test.ts`, which tested the GitHub doorbell that no
 * longer exists.
 */
describe('callNinaImageModel', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    delete process.env.OPENROUTER_API_KEY
  })

  it('resolves { ok: false } instead of throwing when the key is absent, and bills nothing', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)

    const result = await callNinaImageModel('a photograph', 42)

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(typeof result.detail).toBe('string')
      expect(result.detail).toContain('OPENROUTER_API_KEY')
      /* PLAN INVARIANT 9, in its other direction: a request that never left bills nothing, and
       * recording the $0.04 constant here would put an imaginary charge in the ledger. */
      expect(result.costMicroUsd).toBe(0)
    }
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('sends the shared payload to the shared endpoint', async () => {
    process.env.OPENROUTER_API_KEY = 'sk-or-unit-test-never-sent'
    const fetchSpy = vi.fn(
      async () =>
        new Response(JSON.stringify({ data: [{ b64_json: 'QUJD' }], usage: { cost: 0.04 } }), {
          status: 200,
        }),
    )
    vi.stubGlobal('fetch', fetchSpy)

    const result = await callNinaImageModel('a photograph on the track', 4242)

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.b64).toBe('QUJD')
      /* `usage.cost` is preferred over the constant — the price must not go stale silently. */
      expect(result.costMicroUsd).toBe(40_000)
    }

    const [url, init] = fetchSpy.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(OPENROUTER_IMAGE_URL)
    const body = JSON.parse(String(init.body)) as Record<string, unknown>
    /* buildImageRequestBody is the ONE payload definition and both hosts use it. */
    expect(body.model).toBe(NINA_IMAGE_MODEL)
    expect(body.seed).toBe(4242)
    expect(body.size).toBeUndefined()
  })

  it('classifies a refusal as policy and a 500 as transport, and guesses the cost high', async () => {
    process.env.OPENROUTER_API_KEY = 'sk-or-unit-test-never-sent'

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('blocked by the content policy', { status: 403 })),
    )
    const refused = await callNinaImageModel('x', 1)
    expect(refused.ok).toBe(false)
    if (!refused.ok) {
      expect(refused.kind).toBe('policy')
      /* `null` = unknown, and the caller substitutes the measured price. Guessing high is the
       * honest direction for a cost log. */
      expect(refused.costMicroUsd).toBeNull()
    }

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('upstream exploded', { status: 500 })),
    )
    const broken = await callNinaImageModel('x', 1)
    expect(broken.ok).toBe(false)
    if (!broken.ok) expect(broken.kind).toBe('transport')
  })

  it('a 200 with no image is a failure, not a success with an empty photograph', async () => {
    process.env.OPENROUTER_API_KEY = 'sk-or-unit-test-never-sent'
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ data: [] }), { status: 200 })),
    )

    const result = await callNinaImageModel('x', 1)

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.kind).toBe('transport')
  })
})
