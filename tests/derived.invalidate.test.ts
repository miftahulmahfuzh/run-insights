import { describe, expect, it, vi } from 'vitest'

import {
  insightScopesFor,
  onRunCommitted,
  type InvalidateDeps,
  type RunChangeEvent,
} from '@/lib/derived/invalidate'
import type { BadgeAwardResult } from '@/lib/badges/evaluate'
import type { RecomputeResult } from '@/lib/records/recompute'
import type { StoredRecord } from '@/lib/records/types'

/**
 * The invalidation contract. F06 filled in the records half of its body, F07 the insights half and
 * F09 the badges half. The behaviour that must hold whatever lands here: **it must not throw.**
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
const NO_BADGES: BadgeAwardResult = { newlyEarned: [], qualified: [] }
const noopRecompute = () => Promise.resolve(EMPTY)
const noopSweep: NonNullable<InvalidateDeps['sweepInsights']> = () => Promise.resolve()
const noopBadges: NonNullable<InvalidateDeps['evaluateBadgesFor']> = () =>
  Promise.resolve(NO_BADGES)
/**
 * ALL THREE must be injected in every test. Left out, the real implementations reach Neon through
 * the dummy connection string `tests/support/setup.ts` installs — the assertion would still pass
 * (failures are swallowed by design) while the suite quietly did network I/O to prove it.
 */
const NOOP_DEPS = {
  recomputeRecordsFor: noopRecompute,
  sweepInsights: noopSweep,
  evaluateBadgesFor: noopBadges,
}

describe('onRunCommitted', () => {
  it('resolves rather than throwing, for every phase', async () => {
    const deps = NOOP_DEPS
    const nothing = { newlyEarned: [], recordsMovedToThisRun: [] }
    await expect(onRunCommitted(EVENT, deps)).resolves.toEqual(nothing)
    await expect(onRunCommitted({ ...EVENT, phase: 'post-review-edit' }, deps)).resolves.toEqual(
      nothing,
    )
    await expect(onRunCommitted({ ...EVENT, phase: 'manual' }, deps)).resolves.toEqual(nothing)
  })

  it('accepts a moved date, which is the case F07 and F09 have to sweep twice', async () => {
    await expect(
      onRunCommitted(
        { ...EVENT, occurredOn: '2026-08-18', previousOccurredOn: '2026-08-20' },
        NOOP_DEPS,
      ),
    ).resolves.toEqual({ newlyEarned: [], recordsMovedToThisRun: [] })
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
      ).resolves.toEqual({ newlyEarned: [], recordsMovedToThisRun: [] })
      expect(error).toHaveBeenCalledOnce()
    } finally {
      error.mockRestore()
    }
  })
})

describe('the F07 section — stale insights are swept', () => {
  it('sweeps the session, its week and its month', async () => {
    const sweepInsights = vi.fn(noopSweep)
    await onRunCommitted(EVENT, { ...NOOP_DEPS, sweepInsights })

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
      { ...NOOP_DEPS, sweepInsights },
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
      { ...NOOP_DEPS, sweepInsights },
    )

    expect(sweepInsights).toHaveBeenCalledTimes(3)
  })

  it('swallows and logs a sweep failure rather than losing the save', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      await expect(
        onRunCommitted(EVENT, {
          ...NOOP_DEPS,
          sweepInsights: () => Promise.reject(new Error('neon is down')),
        }),
      ).resolves.toEqual({ newlyEarned: [], recordsMovedToThisRun: [] })
      // One log per scope, and the loop kept going — a failed session sweep must not skip the
      // week and month, which are the two a reader is most likely to open next.
      expect(error).toHaveBeenCalledTimes(3)
    } finally {
      error.mockRestore()
    }
  })
})

describe('the F09 section — badges are evaluated after records, never before', () => {
  const held = (key: StoredRecord['key'], runId: string): StoredRecord => ({
    key,
    runId,
    value: 10_670,
    achievedOn: '2026-08-20',
    previousValue: null,
  })

  it('evaluates once for the committed run', async () => {
    const evaluateBadgesFor = vi.fn(noopBadges)
    await onRunCommitted(EVENT, { ...NOOP_DEPS, evaluateBadgesFor })
    expect(evaluateBadgesFor).toHaveBeenCalledTimes(1)
    expect(evaluateBadgesFor).toHaveBeenCalledWith('user_1', 'run123456789', [])
  })

  it('hands over exactly the record keys that just moved TO this run', async () => {
    // §6: `new_ceiling` and `long_way_home` are reads of this list, not a second
    // `distance > previousLongest` comparison. A record that moved to a DIFFERENT run on the same
    // recompute — which happens when a correction demotes this one — must not appear here.
    const evaluateBadgesFor = vi.fn(noopBadges)
    await onRunCommitted(EVENT, {
      ...NOOP_DEPS,
      recomputeRecordsFor: () =>
        Promise.resolve({
          rows: [],
          changed: [
            held('longest_distance', 'run123456789'),
            held('highest_max_hr', 'someone_elses_run'),
          ],
          removed: [],
        }),
      evaluateBadgesFor,
    })
    expect(evaluateBadgesFor).toHaveBeenCalledWith('user_1', 'run123456789', ['longest_distance'])
  })

  it('reports the same moved keys back to the commit path — F33 phase 10 reacts to them', async () => {
    // The list badges are evaluated against is also the list Nina names, and it is reported rather
    // than recomputed: `changed` is only true at this instant, so after the redirect the answer is
    // unrecoverable. One computation, two consumers.
    const outcome = await onRunCommitted(EVENT, {
      ...NOOP_DEPS,
      recomputeRecordsFor: () =>
        Promise.resolve({
          rows: [],
          changed: [
            held('longest_distance', 'run123456789'),
            held('highest_max_hr', 'someone_elses_run'),
          ],
          removed: [],
        }),
    })
    expect(outcome.recordsMovedToThisRun).toEqual(['longest_distance'])
  })

  it('still reports the moved records when the badge evaluation failed', async () => {
    // The records DID move even though the badge write did not save. Reporting them is what lets
    // Nina congratulate a record whose badge row is missing, which is the honest thing to do.
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const outcome = await onRunCommitted(EVENT, {
        ...NOOP_DEPS,
        recomputeRecordsFor: () =>
          Promise.resolve({
            rows: [],
            changed: [held('longest_distance', 'run123456789')],
            removed: [],
          }),
        evaluateBadgesFor: () => Promise.reject(new Error('neon is down')),
      })
      expect(outcome).toEqual({ newlyEarned: [], recordsMovedToThisRun: ['longest_distance'] })
    } finally {
      error.mockRestore()
    }
  })

  it('runs on a post-review correction too — a correction can newly EARN a badge', async () => {
    // §1.2: a `redline_republic` percentage corrected upward past 40% is a real earn, because the
    // data is still human-reviewed, just reviewed twice. What it can never do is remove a row.
    const evaluateBadgesFor = vi.fn(noopBadges)
    await onRunCommitted(
      { ...EVENT, phase: 'post-review-edit' },
      { ...NOOP_DEPS, evaluateBadgesFor },
    )
    expect(evaluateBadgesFor).toHaveBeenCalledTimes(1)
  })

  it('reports what was earned back to the commit path', async () => {
    const outcome = await onRunCommitted(EVENT, {
      ...NOOP_DEPS,
      evaluateBadgesFor: () =>
        Promise.resolve({
          newlyEarned: ['late_start', 'tourist'],
          qualified: ['late_start', 'tourist'],
        }),
    })
    expect(outcome).toEqual({ newlyEarned: ['late_start', 'tourist'], recordsMovedToThisRun: [] })
  })

  it('evaluates badges AFTER the record recompute, not concurrently with it', async () => {
    // The ordering §1.1 fixes, asserted rather than assumed: badges read the shelf records just
    // wrote, so an interleaving would evaluate `long_way_home` against yesterday's answer.
    const order: string[] = []
    await onRunCommitted(EVENT, {
      ...NOOP_DEPS,
      recomputeRecordsFor: () => {
        order.push('records')
        return Promise.resolve(EMPTY)
      },
      evaluateBadgesFor: () => {
        order.push('badges')
        return Promise.resolve(NO_BADGES)
      },
    })
    expect(order).toEqual(['records', 'badges'])
  })

  it('swallows and logs a badge failure rather than losing the save', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      await expect(
        onRunCommitted(EVENT, {
          ...NOOP_DEPS,
          evaluateBadgesFor: () => Promise.reject(new Error('neon is down')),
        }),
      ).resolves.toEqual({ newlyEarned: [], recordsMovedToThisRun: [] })
      expect(error).toHaveBeenCalledOnce()
    } finally {
      error.mockRestore()
    }
  })

  it('still evaluates badges when the record recompute failed', async () => {
    // Degraded, not skipped: without the recompute there is no "a record moved" signal, so
    // `new_ceiling` and `long_way_home` cannot fire — but `late_start` and `redline_republic` are
    // facts about the run itself and have no reason to be lost too.
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const evaluateBadgesFor = vi.fn(noopBadges)
    try {
      await onRunCommitted(EVENT, {
        ...NOOP_DEPS,
        recomputeRecordsFor: () => Promise.reject(new Error('neon is down')),
        evaluateBadgesFor,
      })
      expect(evaluateBadgesFor).toHaveBeenCalledWith('user_1', 'run123456789', [])
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
