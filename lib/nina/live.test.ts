import { describe, expect, it } from 'vitest'

import { appendNewBubbles, SW_MESSAGE_TYPE, mergeServerMessages } from './live'

/**
 * Rows are shaped `{ id, state }` structurally rather than imported from `components/nina/types`,
 * so widening `ChatMessage` (phases 6, 7, 8 all did) cannot break this file — and so the merge is
 * tested as the rule it is rather than as a component detail.
 */
interface Row {
  id: string
  state: string
}

const row = (id: string, state = 'sent'): Row => ({ id, state })

describe('SW_MESSAGE_TYPE', () => {
  it('matches the literal `lib/service-worker.js` posts', () => {
    /* The worker is plain JS outside `tsc`'s reach, so nothing but this assertion connects the two
     * halves of the signal. If you change one, this fails — which is the point. */
    expect(SW_MESSAGE_TYPE).toBe('nina:new')
  })
})

describe('mergeServerMessages', () => {
  it('returns the SAME REFERENCE when nothing changed, so React bails out of the render', () => {
    /* The render-avoidance claim, and the one nobody would notice was broken: every push would
     * cost a full re-render of the conversation even when it brought nothing new. */
    const local = [row('a'), row('b')]
    expect(mergeServerMessages(local, [row('a'), row('b')])).toBe(local)
  })

  it('appends a row the server has and the client does not — the point of the refresh', () => {
    const local = [row('a')]
    const merged = mergeServerMessages(local, [row('a'), row('b')])
    expect(merged.map((m) => m.id)).toEqual(['a', 'b'])
  })

  it('KEEPS THE LOCAL OBJECT for a row present in both — the mid-reveal case', () => {
    /* The server says `sent`; the client says `revealing`; the client wins. Re-seeding from the
     * server here is what would make all four of Nina's bubbles appear at once. */
    const local = [row('a', 'revealing')]
    const merged = mergeServerMessages(local, [row('a', 'sent')])
    expect(merged[0]).toBe(local[0])
    expect(merged[0]?.state).toBe('revealing')
  })

  it('keeps a local-only optimistic row, and puts it AFTER the server rows', () => {
    const local = [row('a'), row('local-1', 'sending')]
    const merged = mergeServerMessages(local, [row('a'), row('b')])
    expect(merged.map((m) => m.id)).toEqual(['a', 'b', 'local-1'])
  })

  it('takes the server ORDER when the two disagree', () => {
    const merged = mergeServerMessages([row('b'), row('a')], [row('a'), row('b')])
    expect(merged.map((m) => m.id)).toEqual(['a', 'b'])
  })

  it('takes the server list wholesale when local is empty — the first-load path', () => {
    const server = [row('a'), row('b')]
    expect(mergeServerMessages([], server).map((m) => m.id)).toEqual(['a', 'b'])
  })

  it('does not blank the screen when the server list comes back empty', () => {
    /* A refresh that raced a truncation, or a read that returned nothing. Whatever the cause, the
     * conversation on screen is not the thing to throw away. */
    const local = [row('a'), row('b')]
    expect(mergeServerMessages(local, []).map((m) => m.id)).toEqual(['a', 'b'])
  })
})

describe('appendNewBubbles', () => {
  /**
   * The poll's DTO (`SentBubble` in `lib/nina/actions.ts`), restated structurally for the same
   * reason `Row` above is: the real one lives in a `'use server'` module, and a test of a pure
   * rule needs none of it.
   */
  const bubble = (id: string, body = `body of ${id}`, replyToId: string | null = null) => ({
    id,
    body,
    replyToId,
  })

  it('appends every bubble when none of their ids are on screen — the happy poll path', () => {
    const current = [row('user-1')]
    const appended = appendNewBubbles(
      current,
      [bubble('b1'), bubble('b2'), bubble('b3'), bubble('b4')],
      '2026-09-11',
    )
    expect(appended.map((m) => m.id)).toEqual(['user-1', 'b1', 'b2', 'b3', 'b4'])
  })

  it('returns the SAME REFERENCE for an empty batch, so React bails out of the update', () => {
    /* The poll that heard nothing. Without the bail-out, every poll tick that brought nothing
     * would still re-render the whole conversation for a list that did not change. */
    const current = [row('user-1')]
    expect(appendNewBubbles(current, [], '2026-09-11')).toBe(current)
  })

  it('returns the SAME REFERENCE when the merge already delivered every id — the merge-won case', () => {
    /* A refresh whose payload carried the whole turn: the reveal's batch is spent before its first
     * `sleep` resolves, and the only correct answer is to append nothing at all. */
    const current = [row('user-1'), row('b1'), row('b2'), row('b3'), row('b4')]
    const batch = [bubble('b1'), bubble('b2'), bubble('b3'), bubble('b4')]
    expect(appendNewBubbles(current, batch, '2026-09-11')).toBe(current)
  })

  it('skips only the ids already present, and appends the rest IN ORDER — the measured interleaving', () => {
    /* prod session "gj", 2026-09-11, the shape that produced the report: the merge pre-delivered
     * b1's three siblings after the reveal had appended b1, so the list held b1 and the batch
     * [b1..b4] had exactly [b2, b3, b4] left to add. The old unconditional append added all four
     * instead — that is where the 7-bubble screen came from. */
    const current = [row('user-1'), row('b1')]
    const appended = appendNewBubbles(
      current,
      [bubble('b1'), bubble('b2'), bubble('b3'), bubble('b4')],
      '2026-09-11',
    )
    expect(appended.map((m) => m.id)).toEqual(['user-1', 'b1', 'b2', 'b3', 'b4'])
    // Something WAS appended, so the reference must have changed — the bail-out is for the
    // nothing-new cases the two tests above pin, not a blanket identity.
    expect(appended).not.toBe(current)
  })

  it('builds the exact row shape `revealBubbles` has always appended — nothing more, nothing less', () => {
    /* The construction moved here from the inline literal in `ChatScreen`; this is the assertion
     * that it did not change on the way. A field gained or renamed here desyncs the reveal from
     * what the merge builds for the same row. */
    const appended = appendNewBubbles([], [bubble('b1', 'she replied', 'user-1')], '2026-09-11')
    expect(appended[0]).toEqual({
      id: 'b1',
      role: 'nina',
      body: 'she replied',
      dayISO: '2026-09-11',
      state: 'sent',
      replyToId: 'user-1',
    })
  })

  it('appends an id the batch itself repeats exactly once', () => {
    /* `listNinaMessagesAfter` cannot return one row twice today — ids are unique — but the promise
     * is about ids, so the batch feeds the same seen-set the list does. */
    const appended = appendNewBubbles([row('user-1')], [bubble('b1'), bubble('b1')], '2026-09-11')
    expect(appended.map((m) => m.id)).toEqual(['user-1', 'b1'])
  })
})
