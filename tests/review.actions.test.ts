import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { CommitReviewState } from '@/lib/review/schema'

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════
 *  **`commitReviewAction` — the boundary.**
 *
 *  Everything real happens in `commit.ts` (its own suite asserts the orchestration of the write);
 *  this file tests the wrapper's four responsibilities and the ORDER between them:
 *
 *    1. identity — `requireUserId()` is line one, above any look at the payload (INVARIANT A)
 *    2. pass-through — a failure state from `commitReview` reaches the screen untouched, and
 *       nothing else in the action runs: no reaction, no revalidate, no redirect
 *    3. F33 R8 — a run BECOMING REAL schedules exactly one `after()` callback for Nina; a
 *       post-review edit schedules none
 *    4. cache + navigation — the four `revalidatePath` calls, then the redirect
 *
 *  Both `requireUserId` and `redirect` signal by throwing (`NEXT_REDIRECT`; the Next docs are
 *  explicit that redirect must sit outside any `try`). Neither may ever be caught here —
 *  asserted by letting the mocks throw and requiring the action's own promise to reject.
 *
 *  `after` is mocked as pure registration: the test decides when (and whether) the scheduled
 *  callback runs, which is what makes "scheduled, not awaited" an observed property rather than
 *  a reading of the code.
 * ════════════════════════════════════════════════════════════════════════════════════════════
 */

const requireUserId = vi.fn()
const commitReview = vi.fn()
const emitRunCommitted = vi.fn()
const revalidatePath = vi.fn()
const redirect = vi.fn()
const after = vi.fn()

vi.mock('@/lib/auth/requireUserId', () => ({ requireUserId: () => requireUserId() }))
vi.mock('@/lib/review/commit', () => ({ commitReview: (...a: unknown[]) => commitReview(...a) }))
vi.mock('@/lib/nina/proactive', () => ({
  emitRunCommitted: (...a: unknown[]) => emitRunCommitted(...a),
}))
vi.mock('next/cache', () => ({ revalidatePath: (p: string) => revalidatePath(p) }))
vi.mock('next/navigation', () => ({ redirect: (p: string) => redirect(p) }))
vi.mock('next/server', () => ({ after: (cb: () => void) => after(cb) }))

type Actions = typeof import('@/lib/review/actions')
let actions: Actions

const USER = 'user_1'
const RUN_ID = 'run123456789'
const EXTRACTION_ID = 'extract12345'

/** The real `redirect()` never returns — it throws NEXT_REDIRECT (next docs: functions/redirect). */
function throwNextRedirect(url: string): never {
  throw Object.assign(new Error('NEXT_REDIRECT'), { digest: `NEXT_REDIRECT;replace;${url};` })
}

const PREVIOUS: CommitReviewState = { status: 'error', message: 'previous', fieldErrors: {} }

function payloadWith(occurredOn: unknown) {
  return { extractionId: EXTRACTION_ID, runId: null, draft: { occurredOn } }
}

const OK_NEW_RUN = {
  ok: true as const,
  runId: RUN_ID,
  newlyEarned: ['late_start'],
  recordsMoved: ['longest_distance'],
  isNewRun: true,
}
const OK_EDIT = {
  ok: true as const,
  runId: RUN_ID,
  newlyEarned: [],
  recordsMoved: [],
  isNewRun: false,
}
const FAILED_STATE: CommitReviewState = {
  status: 'error',
  message: 'Some of these numbers cannot be saved as they are.',
  fieldErrors: { durationSec: 'Must be at least one second' },
}

/** The single callback `after()` was given — F33's scheduled Nina reaction. */
function scheduledReaction(): () => Promise<void> {
  expect(after).toHaveBeenCalledTimes(1)
  return after.mock.calls[0]![0] as () => Promise<void>
}

beforeEach(async () => {
  vi.clearAllMocks()
  requireUserId.mockResolvedValue(USER)
  emitRunCommitted.mockResolvedValue({ emitted: true })
  redirect.mockImplementation(throwNextRedirect)
  actions = await import('@/lib/review/actions')
})

describe('INVARIANT A — identity before anything', () => {
  it('authenticates before the payload is even looked at, then hands the payload through raw', async () => {
    commitReview.mockResolvedValue({ ok: false, state: FAILED_STATE })

    // `undefined` is not a payload any schema would accept — if the action peeked at it before
    // the auth call, the order assertion below plus the raw passthrough would catch it.
    const result = await actions.commitReviewAction(PREVIOUS, undefined)

    expect(result).toEqual(FAILED_STATE)
    expect(commitReview).toHaveBeenCalledWith(USER, undefined)
    expect(requireUserId).toHaveBeenCalledOnce()
    expect(requireUserId.mock.invocationCallOrder[0]).toBeLessThan(
      commitReview.mock.invocationCallOrder[0]!,
    )
  })

  it('a thrown auth failure aborts the action before commitReview runs', async () => {
    requireUserId.mockRejectedValue(new Error('session expired'))

    await expect(actions.commitReviewAction(PREVIOUS, payloadWith('2026-08-20'))).rejects.toThrow(
      'session expired',
    )
    expect(commitReview).not.toHaveBeenCalled()
    expect(after).not.toHaveBeenCalled()
    expect(revalidatePath).not.toHaveBeenCalled()
    expect(redirect).not.toHaveBeenCalled()
  })
})

describe('the failure path — a validation error is a rendered state, not a navigation', () => {
  it('returns the failure state untouched and does nothing else', async () => {
    commitReview.mockResolvedValue({ ok: false, state: FAILED_STATE })

    const result = await actions.commitReviewAction(PREVIOUS, payloadWith('2026-08-20'))

    // Identity, not a copy: the screen renders exactly the object commitReview produced.
    expect(result).toBe(FAILED_STATE)
    expect(after).not.toHaveBeenCalled()
    expect(emitRunCommitted).not.toHaveBeenCalled()
    expect(revalidatePath).not.toHaveBeenCalled()
    expect(redirect).not.toHaveBeenCalled()
  })
})

describe('the golden path — F33 R8: a run becoming real is the event', () => {
  beforeEach(() => {
    commitReview.mockResolvedValue(OK_NEW_RUN)
  })

  it('schedules exactly one after() callback — registered, never awaited', async () => {
    await expect(actions.commitReviewAction(PREVIOUS, payloadWith('2026-08-20'))).rejects.toThrow(
      'NEXT_REDIRECT',
    )

    expect(after).toHaveBeenCalledTimes(1)
    // The scheduling happened before the redirect, and the reaction itself has NOT run —
    // emitRunCommitted untouched at action-return time is the "runner must not wait" contract,
    // observed rather than assumed.
    expect(emitRunCommitted).not.toHaveBeenCalled()
    expect(after.mock.invocationCallOrder[0]).toBeLessThan(redirect.mock.invocationCallOrder[0]!)
    expect(redirect).toHaveBeenCalledWith(`/r/${RUN_ID}`)
  })

  it('revalidates every surface a commit changes, then redirects to the run', async () => {
    await expect(actions.commitReviewAction(PREVIOUS, payloadWith('2026-08-20'))).rejects.toThrow(
      'NEXT_REDIRECT',
    )

    expect(revalidatePath.mock.calls).toEqual([['/'], ['/trends'], ['/me'], [`/r/${RUN_ID}`]])
  })

  it('the scheduled reaction names the run, the user, and what it earned and moved', async () => {
    await actions.commitReviewAction(PREVIOUS, payloadWith('2026-08-20')).catch(() => {})

    await scheduledReaction()()

    expect(emitRunCommitted).toHaveBeenCalledExactlyOnceWith({
      userId: USER,
      runId: RUN_ID,
      occurredOn: '2026-08-20',
      recordKeys: ['longest_distance'],
      badgeKeys: ['late_start'],
    })
  })

  it('a successful reaction is logged with the run it reacted to', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {})
    try {
      await actions.commitReviewAction(PREVIOUS, payloadWith('2026-08-20')).catch(() => {})
      await scheduledReaction()()

      expect(info).toHaveBeenCalledWith(
        '[review] nina reacted',
        expect.objectContaining({ runId: RUN_ID }),
      )
    } finally {
      info.mockRestore()
    }
  })

  it('a failed reaction is logged and never thrown into the response', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      emitRunCommitted.mockRejectedValue(new Error('glm is down'))

      await actions.commitReviewAction(PREVIOUS, payloadWith('2026-08-20')).catch(() => {})
      // Must resolve: an unhandled rejection inside `after` is a logged crash for a message
      // nobody was promised — the backstop catch is the contract.
      await scheduledReaction()()

      expect(error).toHaveBeenCalledWith(
        '[review] nina reaction failed; the run itself is saved',
        expect.objectContaining({ runId: RUN_ID }),
      )
    } finally {
      error.mockRestore()
    }
  })

  it.each([
    ['a null payload', null],
    ['a draft without occurredOn', { extractionId: EXTRACTION_ID, draft: {} }],
    ['a non-string occurredOn', payloadWith(123)],
  ])('%s reads as an empty date, not a throw inside after', async (_name, badPayload) => {
    await actions.commitReviewAction(PREVIOUS, badPayload).catch(() => {})
    await scheduledReaction()()

    // The trigger block says nothing about the date rather than lying about it.
    expect(emitRunCommitted).toHaveBeenCalledWith(expect.objectContaining({ occurredOn: '' }))
  })
})

describe('the post-review edit — a correction is not a run coming home', () => {
  it('schedules no reaction, but still revalidates and redirects', async () => {
    commitReview.mockResolvedValue(OK_EDIT)

    await expect(actions.commitReviewAction(PREVIOUS, payloadWith('2026-08-20'))).rejects.toThrow(
      'NEXT_REDIRECT',
    )

    // Two tabs on one /x/[id] is not two runs coming home — F33's trigger is gated on isNewRun,
    // and the already-committed short-circuit inside commitReview reports the same false.
    expect(after).not.toHaveBeenCalled()
    expect(emitRunCommitted).not.toHaveBeenCalled()

    // The cache and navigation halves of the wrapper are unconditional.
    expect(revalidatePath).toHaveBeenCalledTimes(4)
    expect(redirect).toHaveBeenCalledWith(`/r/${RUN_ID}`)
  })
})
