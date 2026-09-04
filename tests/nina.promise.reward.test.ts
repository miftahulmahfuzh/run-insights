import { describe, expect, it } from 'vitest'

import type { NinaPendingPromise, NinaPendingPromisesSlot } from '@/lib/db/schema'
import {
  evaluatePromise,
  promiseJobId,
  promiseReward,
  promiseRewardFor,
  PROMISE_MAX_ATTEMPTS,
  resolvePromiseSlot,
  type PromiseEvalInput,
  type PromiseFacts,
} from '@/lib/nina/promise'

/**
 * R5 — the photo-reward exploit, on the promise side.
 *
 * `lib/nina/promise.test.ts` already proves the state machine for the avatar reward and every one
 * of its cases still passes untouched; this file proves only what the second reward added. The one
 * property worth stating twice is the one `evaluatePromise`'s docstring is built around: **a failed
 * generation can never consume a promise**, and generalising the landing test from one reward to
 * two must not have opened a second door to `status: 'met'`.
 */

/** The user's own example from R19, plus a selfie reward and a job already on record. */
function promise(over: Partial<NinaPendingPromise> = {}): NinaPendingPromise {
  return {
    id: 'pr0000000001',
    text: 'kalo lo lari konsisten seminggu ini, gw kirim foto',
    condition: 'kalau lo lari 5x minggu ini',
    metric: 'run_count',
    target: 5,
    targetKey: null,
    byDate: '2026-09-06',
    promisedOn: '2026-09-01',
    sourceMessageId: 'ms0000000001',
    status: 'pending',
    resolvedOn: null,
    ...over,
  }
}

const FIVE_RUNS: PromiseFacts = {
  runs: [
    { occurredOn: '2026-09-01', distanceM: 5_000 },
    { occurredOn: '2026-09-02', distanceM: 5_000 },
    { occurredOn: '2026-09-03', distanceM: 5_000 },
    { occurredOn: '2026-09-04', distanceM: 5_000 },
    { occurredOn: '2026-09-05', distanceM: 5_000 },
  ],
  records: [],
  badges: [],
}

function input(over: Partial<PromiseEvalInput> = {}): PromiseEvalInput {
  return {
    todayISO: '2026-09-05',
    facts: FIVE_RUNS,
    avatarLandedOnOrAfter: () => false,
    ...over,
  }
}

/** Fired yesterday, so the same-day "in flight" branch is not what answers. */
const firedSelfie = promise({
  reward: 'selfie',
  jobId: 'jb0000000001',
  firedOn: '2026-09-04',
  attempts: 1,
})

describe('promiseReward — absent means the avatar, forever', () => {
  it('a promise written before R5 reads as the avatar reward', () => {
    expect(promiseReward(promise())).toBe('avatar')
  })

  it('an explicit selfie reads as a selfie', () => {
    expect(promiseReward(promise({ reward: 'selfie' }))).toBe('selfie')
  })

  it('a hand-edited slot with nonsense in the field reads as the avatar, and does not throw', () => {
    const junk = { ...promise(), reward: 'polaroid' } as unknown as NinaPendingPromise
    expect(promiseReward(junk)).toBe('avatar')
  })

  it('promiseJobId is the same tolerant reader it always was', () => {
    expect(promiseJobId(promise())).toBeNull()
    expect(promiseJobId(promise({ jobId: '' }))).toBeNull()
    expect(promiseJobId(firedSelfie)).toBe('jb0000000001')
  })
})

describe('promiseRewardFor — the steamy dial decides', () => {
  it('a default-ish dial keeps the avatar reward, so nothing changes until a slider moves', () => {
    /* `steamy` defaults to 0, and band `high` starts at 60 — the ONE band vocabulary, phase 1's. */
    expect(promiseRewardFor(0)).toBe('avatar')
    expect(promiseRewardFor(59)).toBe('avatar')
  })

  it('at band high and above, she sends him the photograph instead', () => {
    expect(promiseRewardFor(60)).toBe('selfie')
    expect(promiseRewardFor(100)).toBe('selfie')
  })

  it('a non-number degrades to the avatar rather than throwing', () => {
    expect(promiseRewardFor(Number.NaN)).toBe('avatar')
  })
})

describe('evaluatePromise — stage B for a selfie reward', () => {
  it('THE PHOTOGRAPH LANDED IN THE CHAT: settle. R5, end to end', () => {
    const v = evaluatePromise(
      firedSelfie,
      input({ selfieLandedForJob: (jobId) => jobId === 'jb0000000001' }),
    )
    expect(v.kind).toBe('settle')
    expect(v.reason).toContain('selfie')
  })

  it('A DIFFERENT job landing settles NOTHING — she takes six selfies a day', () => {
    /*
     * The whole reason the selfie landing test matches a job id instead of counting photographs
     * since a day: `generate_image` is a tool he can ask her to use, and a photo he asked for must
     * not pay out a promise he did not keep.
     */
    const v = evaluatePromise(
      firedSelfie,
      input({ selfieLandedForJob: (jobId) => jobId === 'some-other-job' }),
    )
    expect(v.kind).toBe('retry')
  })

  it('AN AVATAR LANDING CANNOT SETTLE A SELFIE PROMISE, and vice versa', () => {
    const selfieVerdict = evaluatePromise(
      firedSelfie,
      input({ avatarLandedOnOrAfter: () => true, selfieLandedForJob: () => false }),
    )
    expect(selfieVerdict.kind).not.toBe('settle')

    const firedAvatar = promise({ jobId: 'jb0000000002', firedOn: '2026-09-04', attempts: 1 })
    const avatarVerdict = evaluatePromise(
      firedAvatar,
      input({ avatarLandedOnOrAfter: () => false, selfieLandedForJob: () => true }),
    )
    expect(avatarVerdict.kind).not.toBe('settle')
  })

  it('THE INVARIANT: with no selfie port at all, a selfie promise never reaches met', () => {
    /*
     * `evaluatePromise`'s docstring: "settle is reachable only through the landing test, and
     * nothing else in this function writes status: 'met'". A caller that knows nothing about
     * selfies must wait, retry and expire — never settle. This is the failure direction a wrong
     * answer here would flip.
     */
    for (const todayISO of ['2026-09-04', '2026-09-05', '2026-09-30']) {
      expect(evaluatePromise(firedSelfie, input({ todayISO })).kind).not.toBe('settle')
    }
    const spent = promise({
      reward: 'selfie',
      jobId: 'jb0000000001',
      firedOn: '2026-09-04',
      attempts: PROMISE_MAX_ATTEMPTS,
    })
    const v = evaluatePromise(spent, input({ todayISO: '2026-09-06' }))
    expect(v.kind).toBe('expire')
    expect(v.reason).toContain('selfie')
  })

  it('a job dispatched TODAY still waits, whatever the reward', () => {
    const today = promise({ reward: 'selfie', jobId: 'jb1', firedOn: '2026-09-05', attempts: 1 })
    expect(evaluatePromise(today, input({ selfieLandedForJob: () => false })).kind).toBe('wait')
  })
})

describe('resolvePromiseSlot — the fire records which camera it asked', () => {
  const slot: NinaPendingPromisesSlot = { promises: [promise({ id: 'a' })] }

  it('a selfie fire writes reward beside jobId, firedOn and attempts', () => {
    const out = resolvePromiseSlot(
      slot,
      [{ verdict: { id: 'a', kind: 'fire', reason: '' }, reward: 'selfie', jobId: 'jb1' }],
      '2026-09-05',
    )
    const a = out.slot.promises[0]!
    expect(promiseReward(a)).toBe('selfie')
    expect(promiseJobId(a)).toBe('jb1')
    expect(a.firedOn).toBe('2026-09-05')
    expect(a.attempts).toBe(1)
    expect(a.status).toBe('pending')
  })

  it('a fire that names NO reward writes the avatar, which is what every caller meant before R5', () => {
    const out = resolvePromiseSlot(
      slot,
      [{ verdict: { id: 'a', kind: 'fire', reason: '' }, jobId: 'jb1' }],
      '2026-09-05',
    )
    expect(promiseReward(out.slot.promises[0]!)).toBe('avatar')
  })

  it('A REFUSED SELFIE CONSUMES NOTHING: the reward and the cooldown, no job, no status', () => {
    const out = resolvePromiseSlot(
      slot,
      [{ verdict: { id: 'a', kind: 'fire', reason: '' }, reward: 'selfie', jobId: null }],
      '2026-09-05',
    )
    const a = out.slot.promises[0]!
    expect(a.status).toBe('pending')
    expect(promiseJobId(a)).toBeNull()
    expect(a.attempts).toBe(1)
  })

  it('a retry leaves the reward alone, so the same camera is asked again', () => {
    const fired: NinaPendingPromisesSlot = {
      promises: [promise({ id: 'a', reward: 'selfie', jobId: 'jb1', firedOn: '2026-09-04' })],
    }
    const out = resolvePromiseSlot(
      fired,
      [{ verdict: { id: 'a', kind: 'retry', reason: '' } }],
      '2026-09-05',
    )
    const a = out.slot.promises[0]!
    expect(promiseJobId(a)).toBeNull()
    expect(promiseReward(a)).toBe('selfie')
    expect(a.firedOn).toBe('2026-09-04')
  })
})
