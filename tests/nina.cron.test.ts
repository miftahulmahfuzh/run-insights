import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { GET } from '@/app/api/cron/nina/route'
import { listActiveUserIds } from '@/lib/db/queries'
import { evaluateAndEmitForUser, type EmitResult } from '@/lib/nina/proactive'

/**
 * F33 phase 10 — the evening proactivity route.
 *
 * Three properties, in the order they would hurt if they were wrong:
 *
 *   1. **the `CRON_SECRET` guard is real.** This route walks every active user and makes model
 *      calls that write rows into their conversation; an unauthenticated caller must not reach the
 *      user list, let alone the loop;
 *   2. **one user's failure stops nothing.** The worst failure mode available to a background job
 *      is the silent one that only affects the tail of the list;
 *   3. **it stops itself before the platform does.** A turn is 13-16 s against a 60 s ceiling, so
 *      the loop declines to start one it cannot finish and reports how many users it did not
 *      reach, rather than being killed mid-call with a truncated log and no message.
 *
 * `evaluateAndEmitForUser` and `listActiveUserIds` are mocked, as `tests/insights.cron.test.ts`
 * mocks the rollup's: the real ones reach Neon and z.ai, and a cron test that quietly did network
 * I/O to prove the loop works would be worse than no cron test. §4.9's "no test may call a live
 * LLM" is the rule this keeps.
 */

process.env.CRON_SECRET = 'cron-secret-for-tests'

vi.mock('@/lib/db/queries', () => ({ listActiveUserIds: vi.fn() }))
vi.mock('@/lib/nina/proactive', () => ({ evaluateAndEmitForUser: vi.fn() }))
/*
 * F33 phase 13. The route now sweeps promises before the triggers, and the real sweep reads
 * `nina_memory_slots` and can call `generateNinaAvatar` — both of which this suite exists to stay
 * away from (§4.9). Same reason `evaluateAndEmitForUser` is mocked above, and the mock is a
 * resolved no-op because none of the three properties asserted here is about the sweep.
 */
vi.mock('@/lib/nina/promises', () => ({
  resolveNinaPromises: vi
    .fn()
    .mockResolvedValue({ verdicts: [], fired: 0, settled: 0, expired: 0, wrote: false }),
}))

const listUsers = vi.mocked(listActiveUserIds)
const evaluate = vi.mocked(evaluateAndEmitForUser)

function request(authorization?: string): Request {
  return new Request('https://runins.site/api/cron/nina', {
    headers: authorization === undefined ? {} : { authorization },
  })
}

const authorized = () => request('Bearer cron-secret-for-tests')

const quiet = (reason = 'nothing to say'): EmitResult => ({
  emitted: false,
  kind: null,
  messageIds: [],
  reason,
})

const spoke = (kind: NonNullable<EmitResult['kind']>): EmitResult => ({
  emitted: true,
  kind,
  messageIds: ['msg_1'],
  reason: 'emitted',
})

beforeEach(() => {
  vi.clearAllMocks()
  listUsers.mockResolvedValue([])
  evaluate.mockResolvedValue(quiet())
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('the CRON_SECRET guard', () => {
  it('refuses a request with no Authorization header, before reading the user list', async () => {
    const response = await GET(request())
    expect(response.status).toBe(401)
    expect(listUsers).not.toHaveBeenCalled()
  })

  it('refuses a wrong bearer', async () => {
    const response = await GET(request('Bearer not-the-secret'))
    expect(response.status).toBe(401)
    expect(listUsers).not.toHaveBeenCalled()
  })

  it('accepts the right bearer', async () => {
    const response = await GET(authorized())
    expect(response.status).toBe(200)
    expect(listUsers).toHaveBeenCalledOnce()
  })
})

describe('the loop', () => {
  it('visits every active user and reports a quiet evening as quiet', async () => {
    listUsers.mockResolvedValue(['u1', 'u2', 'u3'])

    const body = await (await GET(authorized())).json()
    expect(body).toMatchObject({ ok: true, users: 3, emitted: 0, quiet: 3, failed: 0, skipped: 0 })
    expect(evaluate).toHaveBeenCalledTimes(3)
  })

  it('one user throwing does not cost every user after them their evening', async () => {
    listUsers.mockResolvedValue(['u1', 'u2', 'u3'])
    evaluate.mockImplementation(async (userId: string) => {
      if (userId === 'u2') throw new Error('a bad memory row')
      return quiet()
    })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const body = await (await GET(authorized())).json()
    expect(body).toMatchObject({ users: 3, failed: 1, quiet: 2, skipped: 0 })
    // u3 was reached, which is the whole point.
    expect(evaluate).toHaveBeenCalledWith('u3')
    warn.mockRestore()
  })

  it('tallies by trigger kind, so four messages are distinguishable from one said four times', async () => {
    listUsers.mockResolvedValue(['u1', 'u2', 'u3'])
    evaluate
      .mockResolvedValueOnce(spoke('avatar_changed'))
      .mockResolvedValueOnce(spoke('silence'))
      .mockResolvedValueOnce(spoke('silence'))

    const body = await (await GET(authorized())).json()
    expect(body).toMatchObject({ emitted: 3, quiet: 0 })
    expect(body.kinds).toEqual({ avatar_changed: 1, silence: 2 })
  })
})

describe('the soft deadline', () => {
  it('stops before the platform does, and says how many it did not reach', async () => {
    // 50 s of budget, and a turn is declined with less than 20 s left — so the loop stops once
    // 30 s have gone, whatever the wall clock is really doing. `Date.now` is driven rather than
    // faked with timers: the route calls it directly and the loop is `await`-driven, so a
    // controlled counter is both simpler and closer to what actually happens.
    listUsers.mockResolvedValue(['u1', 'u2', 'u3', 'u4', 'u5'])

    const started = 1_800_000_000_000
    let elapsed = 0
    vi.spyOn(Date, 'now').mockImplementation(() => started + elapsed)
    evaluate.mockImplementation(async () => {
      elapsed += 16_000 // a measured turn
      return spoke('silence')
    })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const body = await (await GET(authorized())).json()

    // u1 at 0 ms and u2 at 16 s both had room; at 32 s only 18 s remained, so u3 was declined.
    expect(body.emitted).toBe(2)
    expect(body.skipped).toBe(3)
    expect(evaluate).toHaveBeenCalledTimes(2)
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })

  it('does not skip anybody when every user is cheap', async () => {
    listUsers.mockResolvedValue(['u1', 'u2', 'u3'])
    const body = await (await GET(authorized())).json()
    expect(body.skipped).toBe(0)
  })
})
