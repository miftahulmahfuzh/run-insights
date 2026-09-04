import { describe, expect, it } from 'vitest'

import { hasUnreadFromNina, shouldRefreshUnreadDot, type ReadableMessage } from './unread'

/**
 * Rows are built structurally rather than imported from `lib/nina/queries.ts`, matching
 * `lib/nina/live.test.ts`'s reasoning: phase 1 widened `NinaMessageRow` with a session and phase 7
 * may widen it again, and neither should be able to break the rule this file is about.
 */
const hers = (readAt: Date | null): ReadableMessage => ({ role: 'nina', readAt })
const his = (readAt: Date | null): ReadableMessage => ({ role: 'runner', readAt })

const READ_AT = new Date('2026-09-04T12:00:00.000Z')

describe('hasUnreadFromNina', () => {
  it('is false for an empty conversation', () => {
    expect(hasUnreadFromNina([])).toBe(false)
  })

  it('is false when everything of hers is already read — the ordinary second visit', () => {
    /* The property that keeps this cheap: a visit with nothing to clear must ask for no extra
     * render at all, which is what makes the fix not-a-poll. */
    expect(hasUnreadFromNina([his(null), hers(READ_AT), his(null), hers(READ_AT)])).toBe(false)
  })

  it('IGNORES the runner’s own unread rows', () => {
    /* `read_at` is only ever stamped on hers, so his rows are null forever. Counting them would
     * make every render refreshable and turn this into an infinite loop on the first visit. */
    expect(hasUnreadFromNina([his(null), his(null)])).toBe(false)
  })

  it('is true when one message of hers is unread', () => {
    expect(hasUnreadFromNina([his(READ_AT), hers(READ_AT), hers(null)])).toBe(true)
  })

  it('matches the dot’s own predicate: role nina AND read_at IS NULL', () => {
    expect(hasUnreadFromNina([hers(null)])).toBe(true)
    expect(hasUnreadFromNina([hers(READ_AT)])).toBe(false)
  })
})

describe('shouldRefreshUnreadDot', () => {
  it('refreshes once on the render that delivered unread messages', () => {
    expect(shouldRefreshUnreadDot({ hadUnread: true, syncedFor: null })).toBe(true)
  })

  it('does NOT refresh when nothing was unread', () => {
    expect(shouldRefreshUnreadDot({ hadUnread: false, syncedFor: null })).toBe(false)
    expect(shouldRefreshUnreadDot({ hadUnread: false, syncedFor: true })).toBe(false)
    expect(shouldRefreshUnreadDot({ hadUnread: false, syncedFor: false })).toBe(false)
  })

  it('does NOT refresh twice for the same flag — the lost-race case, and the loop guard', () => {
    /* If the refresh arrived before `after()` committed the UPDATE, the refreshed render still says
     * `true`. Retrying here is what would turn one stale dot into an unbounded loop of server
     * renders; the dot instead clears on the next navigation, exactly as it did before R9. */
    expect(shouldRefreshUnreadDot({ hadUnread: true, syncedFor: true })).toBe(false)
  })

  it('refreshes again when a LATER arrival flips the flag back on', () => {
    /* A service worker calling `router.refresh()` on a push can deliver a new unread message of
     * hers. `false -> true` is a new fact and gets its own single refresh. */
    expect(shouldRefreshUnreadDot({ hadUnread: true, syncedFor: false })).toBe(true)
  })
})
