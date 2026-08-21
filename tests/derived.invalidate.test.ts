import { describe, expect, it, vi } from 'vitest'

import {
  insightScopesFor,
  onRunCommitted,
  type InvalidateDeps,
  type RunChangeEvent,
} from '@/lib/derived/invalidate'
import type { RecomputeResult } from '@/lib/records/recompute'

/**
 * The invalidation contract. F06 filled in the records half of its body and F07 the insights
 * half; F09 fills in badges. The behaviour that must hold whatever lands here: **it must not
 * throw.**
 *
 * That is not a trivial assertion. `commitReview` calls this after the run transaction has already
 * committed, and plan §7.3 forbids invalidation failure from touching a human's confirmed save. A
 * future author replacing a section with `throw new Error('not implemented')` — the reflex when
 * stubbing an unfinished feature — would make every commit log an error nobody can act on. This
 * test is what stops that reflex, and the message here is where they will read why.
 */

const EVENT: RunChangeEvent = {
  runId: 'run123456789',
  userId: 'user_1',
  changedFieldPaths: ['splits.0.timeSec'],
  occurredOn: '2026-08-20',
  previousOccurredOn: null,
  phase: 'review',
}

const EMPTY: RecomputeResult = { rows: [], changed: [], removed: [] }
const noopRecompute = () => Promise.resolve(EMPTY)
const noopSweep: NonNullable<InvalidateDeps['sweepInsights']> = () => Promise.resolve()
/**
 * BOTH must be injected in every test. Left out, the real implementations reach Neon through the
 * dummy connection string `tests/support/setup.ts` installs — the assertion would still pass
 * (failures are swallowed by design) while the suite quietly did network I/O to prove it.
 */
const NOOP_DEPS = { recomputeRecordsFor: noopRecompute, sweepInsights: noopSweep }

describe('onRunCommitted', () => {
  it('resolves rather than throwing, for every phase', async () => {
    const deps = NOOP_DEPS
    await expect(onRunCommitted(EVENT, deps)).resolves.toBeUndefined()
    await expect(
      onRunCommitted({ ...EVENT, phase: 'post-review-edit' }, deps),
    ).resolves.toBeUndefined()
    await expect(onRunCommitted({ ...EVENT, phase: 'manual' }, deps)).resolves.toBeUndefined()
  })

  it('accepts a moved date, which is the case F07 and F09 have to sweep twice', async () => {
    await expect(
      onRunCommitted(
        { ...EVENT, occurredOn: '2026-08-18', previousOccurredOn: '2026-08-20' },
        NOOP_DEPS,
      ),
    ).resolves.toBeUndefined()
  })
})

describe('the F06 section — records are recomputed on every commit', () => {
  it('recomputes for the committing user, exactly once', async () => {
    // Synchronously, in this request. F09's badge evaluation runs after it and reads what it
    // wrote, so a queued job here would let `new_ceiling` fire against a stale shelf.
    const recomputeRecordsFor = vi.fn(noopRecompute)
    await onRunCommitted(EVENT, { ...NOOP_DEPS, recomputeRecordsFor })
    expect(recomputeRecordsFor).toHaveBeenCalledTimes(1)
    expect(recomputeRecordsFor).toHaveBeenCalledWith('user_1')
  })

  it('recomputes on a post-review correction too, not only on the first review', async () => {
    // The rarer path, and therefore the less-tested one — a correction can invalidate a record
    // just as easily as a first commit can set one.
    const recomputeRecordsFor = vi.fn(noopRecompute)
    await onRunCommitted(
      { ...EVENT, phase: 'post-review-edit' },
      { ...NOOP_DEPS, recomputeRecordsFor },
    )
    expect(recomputeRecordsFor).toHaveBeenCalledWith('user_1')
  })

  it('swallows and logs a recompute failure rather than losing the save', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      await expect(
        onRunCommitted(EVENT, {
          ...NOOP_DEPS,
          recomputeRecordsFor: () => Promise.reject(new Error('neon is down')),
        }),
      ).resolves.toBeUndefined()
      expect(error).toHaveBeenCalledOnce()
    } finally {
      error.mockRestore()
    }
  })
})

describe('the F07 section — stale insights are swept', () => {
  it('sweeps the session, its week and its month', async () => {
    const sweepInsights = vi.fn(noopSweep)
    await onRunCommitted(EVENT, { recomputeRecordsFor: noopRecompute, sweepInsights })

    expect(sweepInsights.mock.calls).toEqual([
      ['user_1', 'session', 'run123456789'],
      ['user_1', 'week', '2026-W34'],
      ['user_1', 'month', '2026-08'],
    ])
  })

  it('sweeps BOTH periods when the date moved — the week it left is wrong too', async () => {
    // 2026-08-20 is in 2026-W34; 2026-07-30 is in 2026-W31 and a different month. A correction
    // that moves a run backwards leaves a rollup behind it that still counts the run.
    const sweepInsights = vi.fn(noopSweep)
    await onRunCommitted(
      { ...EVENT, occurredOn: '2026-07-30', previousOccurredOn: '2026-08-20' },
      { recomputeRecordsFor: noopRecompute, sweepInsights },
    )

    expect(sweepInsights.mock.calls.map((c) => `${c[1]}:${c[2]}`)).toEqual([
      'session:run123456789',
      'week:2026-W31',
      'month:2026-07',
      'week:2026-W34',
      'month:2026-08',
    ])
  })

  it('does not sweep the same scope twice when a date moves within one week', async () => {
    const sweepInsights = vi.fn(noopSweep)
    await onRunCommitted(
      { ...EVENT, occurredOn: '2026-08-20', previousOccurredOn: '2026-08-18' },
      { recomputeRecordsFor: noopRecompute, sweepInsights },
    )

    expect(sweepInsights).toHaveBeenCalledTimes(3)
  })

  it('swallows and logs a sweep failure rather than losing the save', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      await expect(
        onRunCommitted(EVENT, {
          recomputeRecordsFor: noopRecompute,
          sweepInsights: () => Promise.reject(new Error('neon is down')),
        }),
      ).resolves.toBeUndefined()
      // One log per scope, and the loop kept going — a failed session sweep must not skip the
      // week and month, which are the two a reader is most likely to open next.
      expect(error).toHaveBeenCalledTimes(3)
    } finally {
      error.mockRestore()
    }
  })
})

describe('insightScopesFor', () => {
  it('is the whole rule, in one readable list', () => {
    expect(insightScopesFor(EVENT)).toEqual([
      ['session', 'run123456789'],
      ['week', '2026-W34'],
      ['month', '2026-08'],
    ])
  })
})
