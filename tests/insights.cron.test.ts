import { beforeEach, describe, expect, it, vi } from 'vitest'

import { GET } from '@/app/api/cron/rollup/route'
import { listActiveUserIds } from '@/lib/db/queries'
import { loadMonthFacts, loadWeekFacts } from '@/lib/insights/load'
import { getOrCreateInsight } from '@/lib/llm/narrate'

/**
 * Task 12. The three properties the nightly job's whole cost argument rests on:
 *
 *   1. the `CRON_SECRET` check is real — this route enumerates every active user and writes rows;
 *   2. one user's failure does not stop the loop for everyone after them in the list — the worst
 *      failure mode available to a background job is the silent one that only affects the tail;
 *   3. **a repeat run against unchanged data makes ZERO model calls.** §8's steady-state claim is
 *      an assertion here rather than a sentence in a document, because "the cron is cheap" is
 *      exactly the kind of belief that quietly stops being true.
 */

process.env.CRON_SECRET = 'cron-secret-for-tests'

vi.mock('@/lib/db/queries', () => ({ listActiveUserIds: vi.fn() }))
vi.mock('@/lib/insights/load', () => ({ loadWeekFacts: vi.fn(), loadMonthFacts: vi.fn() }))
vi.mock('@/lib/llm/narrate', () => ({ getOrCreateInsight: vi.fn() }))

const listUsers = vi.mocked(listActiveUserIds)
const week = vi.mocked(loadWeekFacts)
const month = vi.mocked(loadMonthFacts)
const generate = vi.mocked(getOrCreateInsight)

function request(authorization?: string): Request {
  return new Request('https://runins.site/api/cron/rollup', {
    headers: authorization === undefined ? {} : { authorization },
  })
}

/** What `getOrCreateInsight` returns on a real generation, reduced to the fields the route reads. */
function generated() {
  return {
    payload: { headline: 'x' },
    source: 'llm',
    factsHash: 'h',
    cached: false,
    usage: null,
  } as unknown as Awaited<ReturnType<typeof getOrCreateInsight>>
}

function cacheHit() {
  return {
    payload: { headline: 'x' },
    source: 'llm',
    factsHash: 'h',
    cached: true,
    usage: null,
  } as unknown as Awaited<ReturnType<typeof getOrCreateInsight>>
}

beforeEach(() => {
  vi.clearAllMocks()
  week.mockResolvedValue({} as never)
  month.mockResolvedValue({} as never)
})

describe('GET /api/cron/rollup — the guard', () => {
  it('401s with no authorization header, and reads nothing', async () => {
    const response = await GET(request())

    expect(response.status).toBe(401)
    expect(listUsers).not.toHaveBeenCalled()
  })

  it('401s on the wrong secret', async () => {
    expect((await GET(request('Bearer nope'))).status).toBe(401)
    expect(listUsers).not.toHaveBeenCalled()
  })

  it('401s on the right secret sent without the Bearer scheme', async () => {
    expect((await GET(request('cron-secret-for-tests'))).status).toBe(401)
  })

  it('runs on the right secret', async () => {
    listUsers.mockResolvedValue([])
    const response = await GET(request('Bearer cron-secret-for-tests'))

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ ok: true, users: 0, generated: 0, failed: 0 })
  })
})

describe('GET /api/cron/rollup — the loop', () => {
  const authorized = () => request('Bearer cron-secret-for-tests')

  it('generates the current week and month for every active user', async () => {
    listUsers.mockResolvedValue(['u1', 'u2'])
    generate.mockResolvedValue(generated())

    const body = (await (await GET(authorized())).json()) as { generated: number }

    expect(generate).toHaveBeenCalledTimes(4)
    expect(generate.mock.calls.map((c) => c[1])).toEqual(['week', 'month', 'week', 'month'])
    expect(body.generated).toBe(4)
  })

  it('carries on to the next user when one throws', async () => {
    listUsers.mockResolvedValue(['broken', 'fine'])
    week.mockImplementation(async (userId: string) => {
      if (userId === 'broken') throw new Error('no history')
      return {} as never
    })
    generate.mockResolvedValue(generated())

    const body = (await (await GET(authorized())).json()) as {
      users: number
      generated: number
      failed: number
    }

    expect(body).toMatchObject({ users: 2, failed: 1 })
    // The healthy user still got both scopes: the failure cost exactly one user, not the tail.
    expect(body.generated).toBe(2)
    expect(generate.mock.calls.map((c) => c[0])).toEqual(['fine', 'fine'])
  })

  it('makes ZERO model generations on a repeat run with no new data', async () => {
    listUsers.mockResolvedValue(['u1'])
    generate.mockResolvedValue(cacheHit())

    const body = (await (await GET(authorized())).json()) as { generated: number }

    // `getOrCreateInsight` is still CALLED — that is the hash comparison, one indexed read — but
    // it reports `cached: true` and reaches no model. This is the steady state and it is free.
    expect(generate).toHaveBeenCalledTimes(2)
    expect(body.generated).toBe(0)
  })

  it('asks for the current week and month only — no back-fill', async () => {
    listUsers.mockResolvedValue(['u1'])
    generate.mockResolvedValue(generated())

    const body = (await (await GET(authorized())).json()) as {
      weekKey: string
      monthKey: string
    }

    expect(body.weekKey).toMatch(/^\d{4}-W\d{2}$/)
    expect(body.monthKey).toMatch(/^\d{4}-\d{2}$/)
    expect(generate.mock.calls[0]?.[2]).toBe(body.weekKey)
    expect(generate.mock.calls[1]?.[2]).toBe(body.monthKey)
  })
})
