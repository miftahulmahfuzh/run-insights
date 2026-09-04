import { afterEach, describe, expect, it, vi } from 'vitest'

import { dispatchNinaImageJob } from '../lib/nina/imagedispatch.ts'

/**
 * **The doorbell's contract, which production falsified.** `dispatchNinaImageJob`'s docblock
 * promises "it never throws — a dispatch that fails is a `{ ok: false, detail }` so the caller can
 * turn it into one of her sentences". Nothing tested that promise, and on 2026-09-04 it was false
 * in the only environment that mattered: Vercel production carried neither `GITHUB_DISPATCH_TOKEN`
 * nor `OPENROUTER_API_KEY`, `ninaEnv()` threw before the POST, and three image jobs sat
 * `pending`/`dispatched` in `nina_turns` with `cost_micro_usd` null while Nina said nothing for
 * twenty minutes.
 *
 * **`tests/support/setup.ts` stubs the core and LLM groups and deliberately does not stub the nina
 * group** — so the unset case below is production's exact failure, reproduced for free. Do not
 * "fix" this suite by adding `OPENROUTER_API_KEY` to those defaults; that would delete the only
 * test that reproduces the bug.
 */
describe('dispatchNinaImageJob', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    delete process.env.GITHUB_DISPATCH_TOKEN
    delete process.env.OPENROUTER_API_KEY
  })

  it('resolves { ok: false } instead of throwing when the nina env group is incomplete', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)

    const result = await dispatchNinaImageJob('k03hKdxUp-5n')

    expect(result.ok).toBe(false)
    /* The caller turns `detail` into her apology, so it must survive as a string, not a throw. */
    if (!result.ok) expect(typeof result.detail).toBe('string')
    /* And it must never have reached GitHub — there was no credential to reach it with. */
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  /**
   * **The assertion that a passing test almost cost us.** The first draft of the fix let a missing
   * variable become an ordinary `{ ok: false }`, which sends `fireNinaImageDispatch` into
   * `failNinaImageJob` — and a failed row is closed, so `claimJob` in
   * `scripts/nina-image-worker.ts` can never re-claim it. Measured there: the sweep DOES claim
   * `error_code = 'dispatched'` rows once `created_at < now - NINA_IMAGE_DISPATCH_GRACE_MS`. So the
   * every-ten-minutes backstop delivers a photograph whose doorbell never rang — unless we close
   * the row first. `leaveForBackstop` is what keeps that door open, and this is the test that
   * fails if someone collapses the two failure kinds back together.
   */
  it('flags a config failure as leaveForBackstop, so the sweep can still deliver the photo', async () => {
    vi.stubGlobal('fetch', vi.fn())

    const result = await dispatchNinaImageJob('k03hKdxUp-5n')

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.leaveForBackstop).toBe(true)
  })

  it('names the variable that is missing, so the fix is one line and not a bisect', async () => {
    vi.stubGlobal('fetch', vi.fn())

    const result = await dispatchNinaImageJob('d2oIWrFwWjnA')

    expect(result.ok).toBe(false)
    if (!result.ok) {
      /*
       * `lib/env.ts`'s `fail()` builds a message listing every absent member of the group. Both
       * are asserted because the group's coupling is the non-obvious half of the bug: the dispatch
       * never reads OPENROUTER_API_KEY, but zod validates the whole group, so that key's absence
       * alone is enough to break the doorbell.
       */
      expect(result.detail).toContain('GITHUB_DISPATCH_TOKEN')
      expect(result.detail).toContain('OPENROUTER_API_KEY')
    }
  })

  it('POSTs a workflow_dispatch and reports ok on GitHub 204', async () => {
    process.env.GITHUB_DISPATCH_TOKEN = 'ghp-unit-test-never-sent'
    process.env.OPENROUTER_API_KEY = 'sk-or-unit-test-never-sent'

    const fetchSpy = vi.fn(async () => new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', fetchSpy)

    const result = await dispatchNinaImageJob('0b_QeEN7C46C')

    expect(result).toEqual({ ok: true })
    expect(fetchSpy).toHaveBeenCalledTimes(1)

    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit]
    /* The repo coordinates are module constants on purpose (lib/env.ts:112) — assert them. */
    expect(url).toContain('/repos/miftahulmahfuzh/run-insights/actions/workflows/')
    expect(url).toContain('/dispatches')
    expect(JSON.parse(String(init.body))).toMatchObject({ inputs: { job_id: '0b_QeEN7C46C' } })
    /* GitHub rejects an API request with no User-Agent; the header is load-bearing, not decor. */
    expect((init.headers as Record<string, string>)['User-Agent']).toBeTruthy()
  })

  it('reports the HTTP status on a refusal, because each one has a different one-time fix', async () => {
    process.env.GITHUB_DISPATCH_TOKEN = 'ghp-unit-test-never-sent'
    process.env.OPENROUTER_API_KEY = 'sk-or-unit-test-never-sent'

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('workflow not found', { status: 404 })),
    )

    const result = await dispatchNinaImageJob('k03hKdxUp-5n')

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.detail).toContain('404')
      /*
       * GitHub SPOKE. Re-ringing the doorbell every ten minutes would only re-learn the same 404,
       * so this failure is closed immediately and she apologises — the opposite of the config case
       * above, and the distinction the design's "the ONE failure we learn about within a second"
       * comment is about.
       */
      expect(result.leaveForBackstop).toBeUndefined()
    }
  })
})
