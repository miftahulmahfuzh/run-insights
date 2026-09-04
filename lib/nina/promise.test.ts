import { describe, expect, it } from 'vitest'

import type { NinaPendingPromise, NinaPendingPromisesSlot } from '@/lib/db/schema'
import {
  conditionMet,
  evaluatePromise,
  evaluatePromises,
  promiseWindow,
  PROMISE_EXPIRY_GRACE_DAYS,
  PROMISE_MAX_ATTEMPTS,
  PROMISE_OPEN_ENDED_TTL_DAYS,
  resolvePromiseSlot,
  type PromiseEvalInput,
  type PromiseFacts,
} from './promise'

/** The user's own example, verbatim from R19: promised on 3 Sep, due 4 Sep, 10 km. */
function promise(over: Partial<NinaPendingPromise> = {}): NinaPendingPromise {
  return {
    id: 'pr0000000001',
    text: 'oke, kalo lo beneran lari 10k besok gw ganti foto profil',
    condition: 'kalau lo lari 10km besok',
    metric: 'distance_km_total',
    target: 10,
    targetKey: null,
    byDate: '2026-09-04',
    promisedOn: '2026-09-03',
    sourceMessageId: 'ms0000000001',
    status: 'pending',
    resolvedOn: null,
    ...over,
  }
}

const NO_FACTS: PromiseFacts = { runs: [], records: [], badges: [] }

function input(over: Partial<PromiseEvalInput> = {}): PromiseEvalInput {
  return {
    todayISO: '2026-09-04',
    facts: NO_FACTS,
    avatarLandedOnOrAfter: () => false,
    ...over,
  }
}

function runs(...specs: Array<[string, number]>): PromiseFacts {
  return {
    runs: specs.map(([occurredOn, distanceM]) => ({ occurredOn, distanceM })),
    records: [],
    badges: [],
  }
}

describe('promiseWindow', () => {
  it('runs from the promise day through the deadline, inclusive', () => {
    expect(promiseWindow(promise(), '2026-09-04')).toEqual({
      startISO: '2026-09-03',
      endExclusiveISO: '2026-09-05',
    })
  })

  it('an open-ended promise ends today, so it grows as the days pass', () => {
    expect(promiseWindow(promise({ byDate: null }), '2026-09-20')).toEqual({
      startISO: '2026-09-03',
      endExclusiveISO: '2026-09-21',
    })
  })

  it('a deadline BEFORE the promise day collapses to the promise day, never inverts', () => {
    expect(promiseWindow(promise({ byDate: '2026-09-01' }), '2026-09-04')).toEqual({
      startISO: '2026-09-03',
      endExclusiveISO: '2026-09-04',
    })
  })
})

describe('conditionMet — distance', () => {
  it('R19s own case: 10 km on 4 Sep meets it', () => {
    expect(conditionMet(promise(), input({ facts: runs(['2026-09-04', 10_100]) }))).toBe(true)
  })

  it('9.5 km on 4 Sep does not', () => {
    expect(conditionMet(promise(), input({ facts: runs(['2026-09-04', 9_500]) }))).toBe(false)
  })

  it('TWO RUNS IN A DAY SUM — 7 km plus 5 km meets a 10 km promise', () => {
    const facts = runs(['2026-09-04', 7_000], ['2026-09-04', 5_000])
    expect(conditionMet(promise(), input({ facts }))).toBe(true)
  })

  it('a run on the promise day itself counts — it is usually the run she meant', () => {
    expect(conditionMet(promise(), input({ facts: runs(['2026-09-03', 10_200]) }))).toBe(true)
  })

  it('a run BEFORE the promise does not count', () => {
    expect(conditionMet(promise(), input({ facts: runs(['2026-09-02', 21_000]) }))).toBe(false)
  })

  it('a run AFTER the deadline does not count', () => {
    expect(conditionMet(promise(), input({ facts: runs(['2026-09-05', 21_000]) }))).toBe(false)
  })

  it('a GPS trace one metre short still counts', () => {
    expect(conditionMet(promise(), input({ facts: runs(['2026-09-04', 9_999.5]) }))).toBe(true)
  })

  it('a null target is never met, however far he ran', () => {
    const p = promise({ target: null })
    expect(conditionMet(p, input({ facts: runs(['2026-09-04', 42_195]) }))).toBe(false)
  })
})

describe('conditionMet — the other metrics', () => {
  it('run_count counts runs in the window', () => {
    const p = promise({ metric: 'run_count', target: 3, byDate: '2026-09-09' })
    const facts = runs(['2026-09-04', 5_000], ['2026-09-06', 5_000], ['2026-09-08', 5_000])
    expect(conditionMet(p, input({ todayISO: '2026-09-09', facts }))).toBe(true)
  })

  it('record is met by a marker with that key earned inside the window', () => {
    const p = promise({ metric: 'record', target: null, targetKey: 'longest_distance' })
    const facts: PromiseFacts = {
      runs: [],
      records: [{ key: 'longest_distance', earnedOn: '2026-09-04' }],
      badges: [],
    }
    expect(conditionMet(p, input({ facts }))).toBe(true)
  })

  it('a record earned before the promise does not count — he already had it', () => {
    const p = promise({ metric: 'record', target: null, targetKey: 'longest_distance' })
    const facts: PromiseFacts = {
      runs: [],
      records: [{ key: 'longest_distance', earnedOn: '2026-08-30' }],
      badges: [],
    }
    expect(conditionMet(p, input({ facts }))).toBe(false)
  })

  it('badge works the same way, against the badge markers', () => {
    const p = promise({ metric: 'badge', target: null, targetKey: 'early_bird' })
    const facts: PromiseFacts = {
      runs: [],
      records: [],
      badges: [{ key: 'early_bird', earnedOn: '2026-09-04' }],
    }
    expect(conditionMet(p, input({ facts }))).toBe(true)
  })

  it('free is NEVER met — phase 5s escape hatch stays an escape hatch', () => {
    const p = promise({ metric: 'free', target: null })
    expect(conditionMet(p, input({ facts: runs(['2026-09-04', 42_195]) }))).toBe(false)
  })

  it('an unknown metric is not met and does not throw', () => {
    const p = promise({ metric: 'phase_16_typo' as NinaPendingPromise['metric'] })
    expect(() => conditionMet(p, input({ facts: runs(['2026-09-04', 42_195]) }))).not.toThrow()
    expect(conditionMet(p, input({ facts: runs(['2026-09-04', 42_195]) }))).toBe(false)
  })
})

describe('evaluatePromise — stage A', () => {
  it('not met and the deadline is still ahead: wait', () => {
    const v = evaluatePromise(promise(), input({ todayISO: '2026-09-04' }))
    expect(v.kind).toBe('wait')
  })

  it('met: fire', () => {
    const v = evaluatePromise(promise(), input({ facts: runs(['2026-09-04', 10_500]) }))
    expect(v.kind).toBe('fire')
  })

  it('A RUN COMMITTED LATE still fires, inside the grace window', () => {
    /* He ran on the 4th; he reviewed the extraction on the 6th, so the row only became visible
     * to `getRunsBetween` then. `reviewed_at` is invariant 9 and this is its consequence. */
    const late = '2026-09-06'
    expect(late <= addDaysLocal('2026-09-04', PROMISE_EXPIRY_GRACE_DAYS)).toBe(true)
    const v = evaluatePromise(
      promise(),
      input({ todayISO: late, facts: runs(['2026-09-04', 10_500]) }),
    )
    expect(v.kind).toBe('fire')
  })

  it('A DEADLINE THAT PASSED UNFULFILLED expires, once the grace is over', () => {
    const v = evaluatePromise(promise(), input({ todayISO: '2026-09-07' }))
    expect(v.kind).toBe('expire')
    expect(v.reason).toContain('deadline')
  })

  it('the grace day itself is not yet expiry', () => {
    const v = evaluatePromise(promise(), input({ todayISO: '2026-09-06' }))
    expect(v.kind).toBe('wait')
  })

  it('an open-ended promise expires only after the TTL', () => {
    const p = promise({ byDate: null })
    const inside = evaluatePromise(p, input({ todayISO: '2026-10-30' }))
    expect(inside.kind).toBe('wait')
    const outside = evaluatePromise(p, input({ todayISO: '2027-01-01' }))
    expect(outside.kind).toBe('expire')
    expect(PROMISE_OPEN_ENDED_TTL_DAYS).toBe(60)
  })

  it('an open-ended FREE promise never expires — phase 5s instruction, taken literally', () => {
    const p = promise({ metric: 'free', target: null, byDate: null })
    expect(evaluatePromise(p, input({ todayISO: '2030-01-01' })).kind).toBe('wait')
  })

  it('a free promise WITH a deadline does expire, on the calendars authority', () => {
    const p = promise({ metric: 'free', target: null })
    expect(evaluatePromise(p, input({ todayISO: '2026-09-07' })).kind).toBe('expire')
  })

  it('one attempt per Jakarta day, even when the last one was refused', () => {
    const p = promise({ ...({ firedOn: '2026-09-04', attempts: 1 } as object) })
    const v = evaluatePromise(p, input({ facts: runs(['2026-09-04', 10_500]) }))
    expect(v.kind).toBe('wait')
    expect(v.reason).toContain('attempted today')
  })

  it('a new day allows the next attempt', () => {
    const p = promise({ ...({ firedOn: '2026-09-04', attempts: 1 } as object) })
    const v = evaluatePromise(
      p,
      input({ todayISO: '2026-09-05', facts: runs(['2026-09-04', 10_500]) }),
    )
    expect(v.kind).toBe('fire')
  })

  it('the attempt ceiling expires it rather than firing forever', () => {
    const p = promise({
      ...({ firedOn: '2026-09-04', attempts: PROMISE_MAX_ATTEMPTS } as object),
    })
    const v = evaluatePromise(
      p,
      input({ todayISO: '2026-09-05', facts: runs(['2026-09-04', 10_500]) }),
    )
    expect(v.kind).toBe('expire')
  })
})

describe('evaluatePromise — stage B, the RU-20 cases', () => {
  const fired = promise({
    ...({ jobId: 'jb0000000001', firedOn: '2026-09-04', attempts: 1 } as object),
  })

  it('a job in flight on the same day waits — a runner takes minutes', () => {
    const v = evaluatePromise(fired, input({ facts: runs(['2026-09-04', 10_500]) }))
    expect(v.kind).toBe('wait')
    expect(v.reason).toContain('in flight')
  })

  it('THE AVATAR LANDED: settle. This is the only path to met', () => {
    const v = evaluatePromise(
      fired,
      input({
        todayISO: '2026-09-04',
        facts: runs(['2026-09-04', 10_500]),
        avatarLandedOnOrAfter: (day) => day === '2026-09-04',
      }),
    )
    expect(v.kind).toBe('settle')
  })

  it('A GENERATION THAT NEVER COMPLETES is retried, not consumed', () => {
    const v = evaluatePromise(
      fired,
      input({ todayISO: '2026-09-05', facts: runs(['2026-09-04', 10_500]) }),
    )
    expect(v.kind).toBe('retry')
  })

  it('and at the ceiling it expires rather than haunting the slot', () => {
    const spent = promise({
      ...({
        jobId: 'jb0000000001',
        firedOn: '2026-09-04',
        attempts: PROMISE_MAX_ATTEMPTS,
      } as object),
    })
    const v = evaluatePromise(
      spent,
      input({ todayISO: '2026-09-05', facts: runs(['2026-09-04', 10_500]) }),
    )
    expect(v.kind).toBe('expire')
  })

  it('an already-resolved promise is never re-examined', () => {
    const met = promise({ status: 'met', resolvedOn: '2026-09-04' })
    expect(evaluatePromise(met, input({ todayISO: '2026-12-01' })).kind).toBe('wait')
    const expired = promise({ status: 'expired', resolvedOn: '2026-09-07' })
    expect(evaluatePromise(expired, input({ todayISO: '2026-12-01' })).kind).toBe('wait')
  })
})

describe('resolvePromiseSlot', () => {
  const slot: NinaPendingPromisesSlot = {
    promises: [promise({ id: 'a' }), promise({ id: 'b' }), promise({ id: 'c' })],
  }

  it('every verdict wait means no write at all', () => {
    const decisions = evaluatePromises(slot.promises, input()).map((verdict) => ({ verdict }))
    const out = resolvePromiseSlot(slot, decisions, '2026-09-04')
    expect(out.changed).toBe(false)
    expect(out.slot.promises).toHaveLength(3)
  })

  it('NEVER REMOVES AN ENTRY, whatever happened to it', () => {
    const out = resolvePromiseSlot(
      slot,
      [
        { verdict: { id: 'a', kind: 'settle', reason: '' } },
        { verdict: { id: 'b', kind: 'expire', reason: '' } },
      ],
      '2026-09-04',
    )
    expect(out.slot.promises.map((p) => p.id)).toEqual(['a', 'b', 'c'])
  })

  it('settle writes met and resolvedOn, in place', () => {
    const out = resolvePromiseSlot(
      slot,
      [{ verdict: { id: 'a', kind: 'settle', reason: '' } }],
      '2026-09-04',
    )
    const a = out.slot.promises.find((p) => p.id === 'a')!
    expect(a.status).toBe('met')
    expect(a.resolvedOn).toBe('2026-09-04')
    /* Everything phase 5 owns is byte-identical. */
    expect(a.text).toBe(slot.promises[0]!.text)
    expect(a.condition).toBe(slot.promises[0]!.condition)
    expect(a.metric).toBe(slot.promises[0]!.metric)
    expect(a.byDate).toBe(slot.promises[0]!.byDate)
    expect(a.promisedOn).toBe(slot.promises[0]!.promisedOn)
    expect(a.sourceMessageId).toBe(slot.promises[0]!.sourceMessageId)
  })

  it('fire records the job and the attempt but NOT the status', () => {
    const out = resolvePromiseSlot(
      slot,
      [{ verdict: { id: 'a', kind: 'fire', reason: '' }, jobId: 'jb1' }],
      '2026-09-04',
    )
    const a = out.slot.promises.find((p) => p.id === 'a')! as NinaPendingPromise & {
      jobId?: string | null
      firedOn?: string | null
      attempts?: number
    }
    expect(a.status).toBe('pending')
    expect(a.resolvedOn).toBeNull()
    expect(a.jobId).toBe('jb1')
    expect(a.firedOn).toBe('2026-09-04')
    expect(a.attempts).toBe(1)
  })

  it('A REFUSED GENERATION CONSUMES NOTHING: no status, no job, only the cooldown', () => {
    const out = resolvePromiseSlot(
      slot,
      [{ verdict: { id: 'a', kind: 'fire', reason: '' }, jobId: null }],
      '2026-09-04',
    )
    const a = out.slot.promises.find((p) => p.id === 'a')! as NinaPendingPromise & {
      jobId?: string | null
      attempts?: number
    }
    expect(a.status).toBe('pending')
    expect(a.jobId).toBeNull()
    expect(a.attempts).toBe(1)
  })

  it('retry clears the job and KEEPS firedOn, so the next sweep is not the very next one', () => {
    const pending: NinaPendingPromisesSlot = {
      promises: [
        promise({ id: 'a', ...({ jobId: 'jb1', firedOn: '2026-09-04', attempts: 1 } as object) }),
      ],
    }
    const out = resolvePromiseSlot(
      pending,
      [{ verdict: { id: 'a', kind: 'retry', reason: '' } }],
      '2026-09-05',
    )
    const a = out.slot.promises[0]! as NinaPendingPromise & {
      jobId?: string | null
      firedOn?: string | null
    }
    expect(a.jobId).toBeNull()
    expect(a.firedOn).toBe('2026-09-04')
    expect(a.status).toBe('pending')
  })

  it('a null slot resolves to an empty slot rather than throwing', () => {
    expect(resolvePromiseSlot(null, [], '2026-09-04')).toEqual({
      slot: { promises: [] },
      changed: false,
    })
  })
})

/** Local, so the late-commit case asserts its own arithmetic instead of trusting the constant. */
function addDaysLocal(dayISO: string, delta: number): string {
  const [y, m, d] = dayISO.split('-').map(Number) as [number, number, number]
  const t = Date.UTC(y, m - 1, d) + delta * 86_400_000
  return new Date(t).toISOString().slice(0, 10)
}
