import { describe, expect, it, vi } from 'vitest'

import { generate, parseArgv } from '../scripts/nina-image-worker.ts'

/**
 * The worker's two pure decisions: how it reads its argv, and how it turns an OpenRouter response
 * into an outcome. **No network, no database, no key.**
 *
 * Why this file can exist at all: the worker's `main()` is guarded by an
 * `import.meta.url === process.argv[1]` check, so importing it runs nothing — no `neon()` call, no
 * connection. That guard is the only reason the worker is testable, and it must not be removed.
 */

const PNG_B64 = Buffer.from([0x89, 0x50, 0x4e, 0x47]).toString('base64')

/**
 * `vi.fn<typeof fetch>` rather than a bare `vi.fn`: the implementation takes no arguments, so an
 * untyped mock types its own `mock.calls` as `[]` and reading `calls[0][1]` to inspect the request
 * body becomes a type error instead of the assertion it looks like. Naming the parameters would fix
 * that too, at the price of two unused-variable warnings.
 */
function stubFetch(response: Response | Error) {
  const fn = vi.fn<typeof fetch>(async () => {
    if (response instanceof Error) throw response
    return response
  })
  vi.stubGlobal('fetch', fn)
  return fn
}

describe('parseArgv', () => {
  it('reads --job', () => {
    expect(parseArgv(['--job', 'abcdefghijkl'])).toEqual({ jobId: 'abcdefghijkl', dryRun: false })
  })

  it('treats an EMPTY --job as a sweep, which is what a scheduled run sends', () => {
    // `${{ inputs.job_id }}` interpolates to '' on a `schedule` event. This is the line that makes
    // one `run:` expression serve both triggers.
    expect(parseArgv(['--job', '']).jobId).toBeNull()
    expect(parseArgv([]).jobId).toBeNull()
  })

  it('refuses a job id that is not an id', () => {
    expect(parseArgv(['--job', "'; drop table nina_turns; --"]).jobId).toBeNull()
    expect(parseArgv(['--job', 'x'.repeat(200)]).jobId).toBeNull()
  })

  it('reads --dry-run', () => {
    expect(parseArgv(['--dry-run']).dryRun).toBe(true)
  })
})

describe('generate', () => {
  it('returns the image and the reported cost', async () => {
    process.env.OPENROUTER_API_KEY = 'test-key'
    stubFetch(
      new Response(JSON.stringify({ data: [{ b64_json: PNG_B64 }], usage: { cost: 0.04 } }), {
        status: 200,
      }),
    )
    const outcome = await generate('a photograph', 42)
    expect(outcome.ok).toBe(true)
    if (outcome.ok) {
      expect(outcome.b64).toBe(PNG_B64)
      expect(outcome.costMicroUsd).toBe(40_000)
    }
  })

  it('sends exactly the recipe body, and no reference image', async () => {
    process.env.OPENROUTER_API_KEY = 'test-key'
    const fn = stubFetch(
      new Response(JSON.stringify({ data: [{ b64_json: PNG_B64 }] }), { status: 200 }),
    )
    await generate('a photograph', 42)
    const init = fn.mock.calls[0]?.[1]
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>
    expect(body.resolution).toBe('1K')
    expect(body.aspect_ratio).toBe('3:4')
    expect(body.input_references).toBeUndefined()
  })

  it('a forced TIMEOUT never throws and reports timeout', async () => {
    process.env.OPENROUTER_API_KEY = 'test-key'
    const err = new Error('aborted')
    err.name = 'TimeoutError'
    stubFetch(err)
    expect(await generate('p', 1)).toMatchObject({ ok: false, kind: 'timeout' })
  })

  it('a forced POLICY refusal reports policy', async () => {
    process.env.OPENROUTER_API_KEY = 'test-key'
    stubFetch(new Response('{"error":{"message":"blocked by safety policy"}}', { status: 400 }))
    expect(await generate('p', 1)).toMatchObject({ ok: false, kind: 'policy' })
  })

  it('a forced HTTP error reports transport', async () => {
    process.env.OPENROUTER_API_KEY = 'test-key'
    stubFetch(new Response('bad gateway', { status: 502 }))
    expect(await generate('p', 1)).toMatchObject({ ok: false, kind: 'transport' })
  })

  it('a 200 with no image is not a success', async () => {
    process.env.OPENROUTER_API_KEY = 'test-key'
    stubFetch(new Response('{"data":[]}', { status: 200 }))
    expect(await generate('p', 1)).toMatchObject({ ok: false, kind: 'transport' })
  })

  it('falls back to the cost constant when the provider omits usage', async () => {
    process.env.OPENROUTER_API_KEY = 'test-key'
    stubFetch(new Response(JSON.stringify({ data: [{ b64_json: PNG_B64 }] }), { status: 200 }))
    const outcome = await generate('p', 1)
    if (outcome.ok) expect(outcome.costMicroUsd).toBe(40_000)
  })
})
