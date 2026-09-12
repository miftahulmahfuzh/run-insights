import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { GET } from '@/app/api/health/route'
import { neon } from '@neondatabase/serverless'

/**
 * `GET /api/health` is the one route with no auth by design — its payload is the deploy's
 * self-description (model ids and base URLs, never a key or a DSN). These tests pin the
 * contract a monitor actually consumes: ok+db+latency on a live database, an honest 500 with
 * the failure message when the `select 1` does not answer, the `local` commit fallback outside
 * Vercel, and the deployed commit SHA when it is provided.
 *
 * `@/lib/env` is mocked wholesale because `env.DATABASE_URL` is what the route hands
 * `neon()` — the real module's eager parse is exercised by every other suite that imports it,
 * and a unit test that constructed a real Neon client would hold a socket it never uses.
 * The mocked `sql` template resolves instantly, so `latencyMs` is a real (near-zero) measure.
 */

vi.mock('@/lib/env', () => ({
  env: {
    DATABASE_URL: 'postgresql://unit:test@ep-unit-test-pooler.ap-southeast-1.aws.neon.tech/neondb',
    LLM_VISION_BASE_URL: 'https://api.z.ai/api/paas/v4',
    LLM_VISION_MODEL: 'glm-4.6v',
    LLM_BASE_URL: 'https://api.z.ai/api/anthropic',
    LLM_MODEL: 'glm-5.3',
  },
}))
vi.mock('@neondatabase/serverless', () => ({ neon: vi.fn() }))

const neonMock = vi.mocked(neon)

/** What `neon()` returns: a tagged-template function whose resolution each test controls. */
function makeSql(impl: () => Promise<unknown>) {
  const sql = vi.fn(impl) as unknown as ReturnType<typeof neon>
  return sql
}

const COMMIT_ENV = 'VERCEL_GIT_COMMIT_SHA'

beforeEach(() => {
  vi.clearAllMocks()
  delete process.env[COMMIT_ENV]
})

afterEach(() => {
  delete process.env[COMMIT_ENV]
})

describe('GET /api/health', () => {
  it('reports ok with the db latency and the model endpoints', async () => {
    neonMock.mockReturnValue(makeSql(() => Promise.resolve([{ '?column?': 1 }])))

    const response = await GET()

    expect(response.status).toBe(200)
    const body = (await response.json()) as Record<string, unknown>
    expect(body).toMatchObject({
      ok: true,
      db: true,
      vision: { baseUrl: 'https://api.z.ai/api/paas/v4', model: 'glm-4.6v' },
      narrative: { baseUrl: 'https://api.z.ai/api/anthropic', envModel: 'glm-5.3' },
    })
    expect(body.latencyMs).toBeTypeOf('number')
    // The client was built from the env the route actually holds.
    expect(neonMock).toHaveBeenCalledWith(
      'postgresql://unit:test@ep-unit-test-pooler.ap-southeast-1.aws.neon.tech/neondb',
    )
  })

  it('reports `local` as the commit outside Vercel', async () => {
    neonMock.mockReturnValue(makeSql(() => Promise.resolve([])))

    const body = (await (await GET()).json()) as Record<string, unknown>

    expect(body.commit).toBe('local')
  })

  it('reports the deployed commit when Vercel provides one', async () => {
    process.env[COMMIT_ENV] = 'abc1234def5678'
    neonMock.mockReturnValue(makeSql(() => Promise.resolve([])))

    const body = (await (await GET()).json()) as Record<string, unknown>

    expect(body.commit).toBe('abc1234def5678')
  })

  it('answers 500 with the failure message when the database does not answer', async () => {
    neonMock.mockReturnValue(makeSql(() => Promise.reject(new Error('connection refused'))))

    const response = await GET()

    expect(response.status).toBe(500)
    const body = (await response.json()) as Record<string, unknown>
    expect(body).toMatchObject({ ok: false, error: 'connection refused' })
    expect(body.latencyMs).toBeTypeOf('number')
  })
})
