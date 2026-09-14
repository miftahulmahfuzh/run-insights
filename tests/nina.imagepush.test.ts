import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ninaImageApology } from '@/lib/nina/imagefail'
import { insertNinaMessages } from '@/lib/nina/queries'
import { resolveNinaSessionForMessage } from '@/lib/nina/sessionResolve'
import { notifyNinaPush } from '@/lib/push/send'
import { installFakeDb, uninstallFakeDb, type FakeDb } from './support/fakeDb'

/**
 * **R1's second half: the apology buzzes the phone too.**
 *
 * Twenty minutes is a long time to wait for a photograph that is not coming, and until this phase
 * R22's sentence reached the runner only if he happened to open `/nina`. The notification lives in
 * `postNinaApologyMessage`, which is module-private and is reached from BOTH terminal paths —
 * `failNinaImageJob` (the give-up, when the retry budget is spent) and `sweepStaleNinaImageJobs`
 * (the 20-minute deadline). One site, two callers, and — the reason it is in the helper at all —
 * **both callers' gates inherited rather than restated**: an avatar job never reaches it, and
 * neither does a job the runner hid.
 *
 * ── WHY A THIRD FILE, AND NOT ONE OF THE TWO NEIGHBOURS ──────────────────────────────────────
 *   · `tests/nina.imagerun.test.ts` mocks `@/lib/nina/imagejobs` wholesale, so the helper under
 *     test here does not exist in that file's module graph at all.
 *   · `tests/nina.softDelete.test.ts` runs `imagejobs.ts` for real, but its whole method is
 *     counting `fake.queries` — and its own comment records that it uses `purpose: 'avatar'`
 *     precisely to *sidestep* the apology plumbing. Adding message inserts to that file would
 *     fight every length assertion in it. That file's header gives this same reasoning for not
 *     living inside `tests/nina.jobActions.test.ts`; this is the next rung of it.
 *
 * ── THE HARNESS ───────────────────────────────────────────────────────────────────────────────
 * `installFakeDb()` for `imagejobs.ts`'s own two statements (the terminal `UPDATE … RETURNING` and
 * the sweep's `SELECT`), because those are real drizzle SQL and the module builds them itself.
 * Everything past the job row is mocked at the module boundary: `@/lib/nina/queries` (Neon),
 * `@/lib/nina/sessionResolve` (Neon), and `@/lib/push/send` — the last so these cases can assert
 * the arguments, and so plan invariant 7 holds by construction rather than because nobody
 * remembered to set `VAPID_*`.
 *
 * `vi.resetAllMocks()` and not `clearAllMocks`: `clearAllMocks` leaves implementations and any
 * unconsumed `mockResolvedValueOnce` in place, so one failing case's queue ghosts into the next.
 */

vi.mock('@/lib/nina/queries', () => ({
  countNinaTurnsSince: vi.fn(),
  insertNinaMessages: vi.fn(),
  insertNinaTurn: vi.fn(),
}))
vi.mock('@/lib/nina/sessionResolve', () => ({ resolveNinaSessionForMessage: vi.fn() }))
/* All three runtime exports, not just the one this file calls: a factory REPLACES the module for
 * every importer in the graph, and an omitted name fails as a module-resolution error somewhere
 * else entirely. Phases 2 and 4 write the same three keys. */
vi.mock('@/lib/push/send', () => ({
  notifyNinaPush: vi.fn(),
  pushNotifier: vi.fn(),
  sendNinaPush: vi.fn(),
}))

type ImageJobs = typeof import('@/lib/nina/imagejobs')

/** 12 chars, so `isValidId` would accept it and `newId()` could have produced it. */
const JOB = 'jobAAAAAAAAA'
const USER = 'u1'
const SESSION = 'sessionAAAAA'
const APOLOGY_ID = 'msgAAAAAAAAA'
const ASKED = 'askedAAAAAAA'

const insertMessages = vi.mocked(insertNinaMessages)
const resolveSession = vi.mocked(resolveNinaSessionForMessage)
const notify = vi.mocked(notifyNinaPush)

let fake: FakeDb
let jobs: ImageJobs

beforeEach(async () => {
  vi.resetModules()
  vi.resetAllMocks()
  fake = installFakeDb()
  resolveSession.mockResolvedValue(SESSION)
  insertMessages.mockResolvedValue([{ id: APOLOGY_ID }] as never)
  notify.mockResolvedValue(undefined)
  jobs = await import('@/lib/nina/imagejobs')
})

afterEach(() => {
  uninstallFakeDb()
  vi.resetModules()
})

/** `args` as the sweep's SELECT hands them back — a jsonb column, so one value, not a row. */
function selfieArgs(overrides: Record<string, unknown> = {}) {
  return { purpose: 'selfie', prompt: 'p', seed: 1, replyToId: ASKED, ...overrides }
}

describe('failNinaImageJob — the give-up apologises AND buzzes', () => {
  it('sends one push carrying her apology, verbatim, for a visible selfie job', async () => {
    fake.enqueue([[null]]) // the UPDATE...RETURNING: deletedAt is null — never hidden

    await jobs.failNinaImageJob({
      userId: USER,
      jobId: JOB,
      kind: 'timeout',
      purpose: 'selfie',
      replyToId: ASKED,
    })

    const body = ninaImageApology('timeout', JOB)
    /* The row and the notification say the same sentence because the function computes it once —
     * asserted against the real deterministic draw, not against a spy's own argument. */
    expect(insertMessages.mock.calls[0]?.[1][0]?.body).toBe(body)
    expect(notify).toHaveBeenCalledTimes(1)
    expect(notify).toHaveBeenCalledWith(USER, [{ id: APOLOGY_ID, body }], 'photo_apology')
  })

  it('pushes nothing for an AVATAR job — nobody asked for one in the chat', async () => {
    fake.enqueue([[null]])

    await jobs.failNinaImageJob({ userId: USER, jobId: JOB, kind: 'policy', purpose: 'avatar' })

    /* The gate is inherited, not restated: the caller never reaches the helper, so there is
     * neither an apology nor a notification, and that is one decision rather than two. */
    expect(insertMessages).not.toHaveBeenCalled()
    expect(notify).not.toHaveBeenCalled()
  })

  it('pushes nothing for a job the runner hid mid-flight (R2)', async () => {
    fake.enqueue([['2026-09-13 00:05:00+00']]) // the UPDATE...RETURNING: deletedAt is set

    await jobs.failNinaImageJob({
      userId: USER,
      jobId: JOB,
      kind: 'timeout',
      purpose: 'selfie',
      replyToId: ASKED,
    })

    /* A sentence in a chat he had just tidied away would be bad; a notification about it would be
     * worse — it reaches a locked phone. Same gate, same answer. */
    expect(insertMessages).not.toHaveBeenCalled()
    expect(notify).not.toHaveBeenCalled()
  })

  it('a notify failure never fails the job, reopens it, or loses the apology row', async () => {
    fake.enqueue([[null]])
    notify.mockRejectedValue(new Error('push: bookkeeping failed'))

    await expect(
      jobs.failNinaImageJob({
        userId: USER,
        jobId: JOB,
        kind: 'timeout',
        purpose: 'selfie',
        replyToId: ASKED,
      }),
    ).resolves.toBeUndefined()

    /* The terminal UPDATE ran, the apology landed, and nothing was re-attempted. Plan invariant 2:
     * the push is the only thing a push failure is allowed to cost. */
    expect(fake.queries).toHaveLength(1)
    expect(fake.only().sql).toMatch(/^update "nina_turns" set/)
    expect(insertMessages).toHaveBeenCalledTimes(1)
  })

  it('pushes nothing when the insert wrote no row at all', async () => {
    /* `insertNinaMessages` returns `[]` rather than throwing for a session that is not his. No row
     * means no message, and a notification about a message that does not exist is the worst
     * outcome available here. */
    fake.enqueue([[null]])
    insertMessages.mockResolvedValue([] as never)

    await jobs.failNinaImageJob({
      userId: USER,
      jobId: JOB,
      kind: 'timeout',
      purpose: 'selfie',
      replyToId: ASKED,
    })

    expect(notify).not.toHaveBeenCalled()
  })
})

describe('sweepStaleNinaImageJobs — the 20-minute deadline buzzes through the same helper', () => {
  it('sends one push for a swept visible selfie job', async () => {
    fake.enqueue([[JOB, selfieArgs()]]) // the SELECT
    fake.enqueue([[JOB, null]]) // the UPDATE...RETURNING: deletedAt is null

    await expect(jobs.sweepStaleNinaImageJobs(USER)).resolves.toBe(1)

    expect(notify).toHaveBeenCalledTimes(1)
    expect(notify).toHaveBeenCalledWith(
      USER,
      [{ id: APOLOGY_ID, body: ninaImageApology('stale', JOB) }],
      'photo_apology',
    )
  })

  it('pushes nothing for a swept HIDDEN job, matching the apology it already withholds', async () => {
    fake.enqueue([[JOB, selfieArgs()]])
    fake.enqueue([[JOB, '2026-09-13 00:20:00+00']]) // still hidden

    await expect(jobs.sweepStaleNinaImageJobs(USER)).resolves.toBe(1)

    expect(insertMessages).not.toHaveBeenCalled()
    expect(notify).not.toHaveBeenCalled()
  })

  it('pushes nothing for a swept AVATAR job', async () => {
    fake.enqueue([[JOB, selfieArgs({ purpose: 'avatar', replyToId: null })]])
    fake.enqueue([[JOB, null]])

    await expect(jobs.sweepStaleNinaImageJobs(USER)).resolves.toBe(1)

    expect(notify).not.toHaveBeenCalled()
  })

  it('a notify failure still counts the job as swept', async () => {
    /* The reason the `try` is INSIDE the helper and not left to the caller's. The sweep's per-row
     * catch sits around this call and `swept += 1` sits AFTER it, so an escaping notify failure
     * would under-count the sweep and log a job that was in fact closed as one that failed to
     * close. */
    fake.enqueue([[JOB, selfieArgs()]])
    fake.enqueue([[JOB, null]])
    notify.mockRejectedValue(new Error('push: bookkeeping failed'))

    await expect(jobs.sweepStaleNinaImageJobs(USER)).resolves.toBe(1)

    expect(insertMessages).toHaveBeenCalledTimes(1)
  })
})
