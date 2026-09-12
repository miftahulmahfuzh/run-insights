import { afterEach, describe, expect, it, vi } from 'vitest'

import { callNinaImageModel } from '../lib/nina/imagecall.ts'
import {
  NINA_IMAGE_ANCHORED_CALL_TIMEOUT_MS,
  NINA_IMAGE_CALL_TIMEOUT_MS,
  NINA_IMAGE_MODEL,
  OPENROUTER_IMAGE_URL,
} from '../lib/nina/imagerecipe.ts'

/**
 * A `fetch` stub that answers by URL: the Blob GET and the OpenRouter POST are two different calls
 * inside one `callNinaImageModel`, so a single-response stub cannot express an anchored call.
 *
 * **`vi.fn<typeof fetch>` and not a bare `vi.fn`** — the same trap
 * `tests/nina.imageworker.test.ts:30-35` documents: an untyped mock types its own `mock.calls` as
 * `[]`, so reading `calls[1][1]` to inspect the request body becomes a type error rather than the
 * assertion it looks like.
 */
function stubTwoHostFetch(blob: Response | Error, openrouter: Response) {
  const fn = vi.fn<typeof fetch>(async (input) => {
    if (String(input).startsWith(OPENROUTER_IMAGE_URL)) return openrouter
    if (blob instanceof Error) throw blob
    return blob
  })
  vi.stubGlobal('fetch', fn)
  return fn
}

/** 200 OK from OpenRouter with one image, reusable because each case builds its own. */
function okImage() {
  return new Response(JSON.stringify({ data: [{ b64_json: 'QUJD' }], usage: { cost: 0.04 } }), {
    status: 200,
  })
}

/** What Vercel Blob serves for a generated selfie: PNG bytes with both headers set. */
function blobPng(bytes = 4) {
  return new Response(Buffer.alloc(bytes, 1), {
    status: 200,
    headers: { 'content-type': 'image/png', 'content-length': String(bytes) },
  })
}

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

  it('R10: a reference is fetched from Blob and rides as input_references', async () => {
    process.env.OPENROUTER_API_KEY = 'sk-or-unit-test-never-sent'
    const fn = stubTwoHostFetch(blobPng(), okImage())

    const result = await callNinaImageModel('a photograph', 42, 'https://blob.test/nina/a.png')

    expect(result.ok).toBe(true)
    if (result.ok) expect(result.anchored).toBe(true)

    /* Two calls, in this order: the anchor, then the generation. */
    expect(fn.mock.calls.length).toBe(2)
    expect(String(fn.mock.calls[0]?.[0])).toBe('https://blob.test/nina/a.png')
    const init = fn.mock.calls[1]?.[1] as RequestInit
    const body = JSON.parse(String(init.body)) as {
      input_references?: Array<{ type: string; image_url: { url: string } }>
    }
    expect(body.input_references?.length).toBe(1)
    expect(body.input_references?.[0]?.type).toBe('image_url')
    expect(body.input_references?.[0]?.image_url.url.startsWith('data:image/png;base64,')).toBe(
      true,
    )
  })

  it('R10: a reference that cannot be fetched degrades to unanchored — never a failed job', async () => {
    process.env.OPENROUTER_API_KEY = 'sk-or-unit-test-never-sent'

    /* Four ways to lose an anchor: a 404, an oversized object, a type we will not vouch for, and a
     * thrown fetch. All four must produce a PHOTOGRAPH. */
    const losses: Array<Response | Error> = [
      new Response('nope', { status: 404 }),
      new Response(Buffer.alloc(8), {
        status: 200,
        headers: { 'content-type': 'image/png', 'content-length': '999999999' },
      }),
      new Response(Buffer.alloc(8), {
        status: 200,
        headers: { 'content-type': 'text/html', 'content-length': '8' },
      }),
      new Error('ECONNRESET'),
    ]

    for (const loss of losses) {
      const fn = stubTwoHostFetch(loss, okImage())
      const result = await callNinaImageModel('a photograph', 42, 'https://blob.test/nina/a.png')

      expect(result.ok).toBe(true)
      if (result.ok) expect(result.anchored).toBe(false)

      const init = fn.mock.calls[1]?.[1] as RequestInit
      const body = JSON.parse(String(init.body)) as Record<string, unknown>
      expect(body.input_references).toBeUndefined()
      vi.unstubAllGlobals()
    }
  })

  it('R10: an unanchored call is unchanged — one fetch, no reference', async () => {
    process.env.OPENROUTER_API_KEY = 'sk-or-unit-test-never-sent'
    const fn = stubTwoHostFetch(blobPng(), okImage())

    const result = await callNinaImageModel('a photograph', 42)

    expect(result.ok).toBe(true)
    if (result.ok) expect(result.anchored).toBe(false)
    /* The Blob is not even asked for: a job with no reference does no extra I/O. */
    expect(fn.mock.calls.length).toBe(1)
    expect(String(fn.mock.calls[0]?.[0])).toBe(OPENROUTER_IMAGE_URL)
  })

  it('R2: a failure reports the abort budget that actually applied', async () => {
    /* `ninaEnv()` MEMOIZES its parse (`ninaCache ??=` in `lib/env.ts`), and the cases above have
     * already warmed it with a key — so within this file's registry the key is never really
     * absent, and the unsent path is unreachable by unsetting the env var alone. A fresh module
     * registry gives this case the cold cache the 2026-09-04 incident actually had. */
    vi.resetModules()
    const { callNinaImageModel: cold } = await import('../lib/nina/imagecall.ts')

    /* No key: nothing was sent, so there is no ceiling to report. */
    vi.stubGlobal('fetch', vi.fn())
    const unsent = await cold('x', 1)
    expect(unsent.ok).toBe(false)
    if (!unsent.ok) expect(unsent.timeoutMs).toBeNull()
    vi.unstubAllGlobals()

    process.env.OPENROUTER_API_KEY = 'sk-or-unit-test-never-sent'

    /* Unanchored: the 150 s ceiling, minus whatever the (absent) reference fetch spent. */
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('upstream exploded', { status: 500 })),
    )
    const plain = await cold('x', 1)
    expect(plain.ok).toBe(false)
    if (!plain.ok) {
      expect(plain.timeoutMs).toBeLessThanOrEqual(NINA_IMAGE_CALL_TIMEOUT_MS)
      expect(plain.timeoutMs).toBeGreaterThan(NINA_IMAGE_CALL_TIMEOUT_MS - 5_000)
    }
    vi.unstubAllGlobals()

    /* Anchored: the 235 s ceiling, because the reference really went on the wire. */
    stubTwoHostFetch(blobPng(), new Response('upstream exploded', { status: 500 }))
    const anchored = await cold('x', 1, 'https://blob.test/nina/a.png')
    expect(anchored.ok).toBe(false)
    if (!anchored.ok) {
      expect(anchored.timeoutMs).toBeLessThanOrEqual(NINA_IMAGE_ANCHORED_CALL_TIMEOUT_MS)
      expect(anchored.timeoutMs).toBeGreaterThan(NINA_IMAGE_ANCHORED_CALL_TIMEOUT_MS - 5_000)
    }

    /* An anchor that could NOT be fetched is an unanchored call, and gets the unanchored ceiling —
     * which is exactly why the number is reported from inside the call and not re-derived by
     * `imagerun.ts`, whose `anchored` flag means "did the JOB request one". */
    vi.unstubAllGlobals()
    stubTwoHostFetch(new Response('nope', { status: 404 }), new Response('boom', { status: 500 }))
    const degraded = await cold('x', 1, 'https://blob.test/nina/a.png')
    expect(degraded.ok).toBe(false)
    if (!degraded.ok) expect(degraded.timeoutMs).toBeLessThanOrEqual(NINA_IMAGE_CALL_TIMEOUT_MS)
  })
})
