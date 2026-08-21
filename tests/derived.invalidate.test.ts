import { describe, expect, it, vi } from 'vitest'

import { onRunCommitted, type RunChangeEvent } from '@/lib/derived/invalidate'
import type { RecomputeResult } from '@/lib/records/recompute'

/**
 * The invalidation contract. F06 has filled in the records half of its body; F07 and F09 fill in
 * theirs. The behaviour that must hold whatever lands here: **it must not throw.**
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

describe('onRunCommitted', () => {
  it('resolves rather than throwing, for every phase', async () => {
    const deps = { recomputeRecordsFor: noopRecompute }
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
        { recomputeRecordsFor: noopRecompute },
      ),
    ).resolves.toBeUndefined()
  })
})

describe('the F06 section — records are recomputed on every commit', () => {
  it('recomputes for the committing user, exactly once', async () => {
    // Synchronously, in this request. F09's badge evaluation runs after it and reads what it
    // wrote, so a queued job here would let `new_ceiling` fire against a stale shelf.
    const recomputeRecordsFor = vi.fn(noopRecompute)
    await onRunCommitted(EVENT, { recomputeRecordsFor })
    expect(recomputeRecordsFor).toHaveBeenCalledTimes(1)
    expect(recomputeRecordsFor).toHaveBeenCalledWith('user_1')
  })

  it('recomputes on a post-review correction too, not only on the first review', async () => {
    // The rarer path, and therefore the less-tested one — a correction can invalidate a record
    // just as easily as a first commit can set one.
    const recomputeRecordsFor = vi.fn(noopRecompute)
    await onRunCommitted({ ...EVENT, phase: 'post-review-edit' }, { recomputeRecordsFor })
    expect(recomputeRecordsFor).toHaveBeenCalledWith('user_1')
  })

  it('swallows and logs a recompute failure rather than losing the save', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      await expect(
        onRunCommitted(EVENT, {
          recomputeRecordsFor: () => Promise.reject(new Error('neon is down')),
        }),
      ).resolves.toBeUndefined()
      expect(error).toHaveBeenCalledOnce()
    } finally {
      error.mockRestore()
    }
  })
})
