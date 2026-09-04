import { describe, expect, it } from 'vitest'

import { SW_MESSAGE_TYPE, mergeServerMessages } from './live'

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
