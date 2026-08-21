import { describe, expect, it } from 'vitest'

import { onRunCommitted, type RunChangeEvent } from '@/lib/derived/invalidate'

/**
 * The invalidation contract is a no-op today (F06/F07/F09 fill in its body as each lands), so
 * there is exactly one behaviour worth pinning: **it must not throw.**
 *
 * That is not a trivial assertion. `commitReview` calls this after the run transaction has already
 * committed, and plan §7.3 forbids invalidation failure from touching a human's confirmed save. A
 * future author replacing the body with `throw new Error('not implemented')` — the reflex when
 * stubbing an unfinished function — would make every commit log an error nobody can act on. This
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

describe('onRunCommitted', () => {
  it('resolves rather than throwing, for every phase', async () => {
    await expect(onRunCommitted(EVENT)).resolves.toBeUndefined()
    await expect(onRunCommitted({ ...EVENT, phase: 'post-review-edit' })).resolves.toBeUndefined()
    await expect(onRunCommitted({ ...EVENT, phase: 'manual' })).resolves.toBeUndefined()
  })

  it('accepts a moved date, which is the case F07 and F09 have to sweep twice', async () => {
    await expect(
      onRunCommitted({ ...EVENT, occurredOn: '2026-08-18', previousOccurredOn: '2026-08-20' }),
    ).resolves.toBeUndefined()
  })
})
