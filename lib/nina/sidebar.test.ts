import { describe, expect, it } from 'vitest'

import { formatDayCompact } from '@/lib/format'
import {
  isSidebarOpen,
  NINA_CHAT_HREF,
  planSessionList,
  planSessionRemoval,
  sessionDayLabel,
  SIDEBAR_OPEN_VALUE,
  SIDEBAR_PARAM,
  withSidebarParam,
  type SidebarSession,
} from './sidebar'

function session(id: string, over: Partial<SidebarSession> = {}): SidebarSession {
  return {
    id,
    title: `Chat ${id}`,
    href: `/nina?s=${id}`,
    pinned: false,
    dayLabel: 'Today',
    ...over,
  }
}

describe('isSidebarOpen', () => {
  it('opens only on the exact value', () => {
    expect(isSidebarOpen(SIDEBAR_OPEN_VALUE)).toBe(true)
  })

  it('is closed for a missing parameter', () => {
    expect(isSidebarOpen(null)).toBe(false)
    expect(isSidebarOpen(undefined)).toBe(false)
  })

  it('is closed for anything else, including truthy spellings', () => {
    // A loose grammar is a parameter two writers disagree about. `?sidebar=true` is not ours.
    for (const raw of ['', '0', 'true', 'yes', 'on', '1 ', '01']) {
      expect(isSidebarOpen(raw), raw).toBe(false)
    }
  })
})

describe('withSidebarParam', () => {
  it('adds the flag to an empty query', () => {
    expect(withSidebarParam('', true)).toBe(`?${SIDEBAR_PARAM}=${SIDEBAR_OPEN_VALUE}`)
  })

  it('keeps the active session and any other parameter', () => {
    // The regression this exists for: phase 3's ?s= is what the panel is layered over, and losing
    // it would navigate the runner out of the conversation he opened the list from.
    expect(withSidebarParam('?s=abc&attach=42', true)).toBe('?s=abc&attach=42&sidebar=1')
  })

  it('accepts a search string with or without the leading question mark', () => {
    expect(withSidebarParam('s=abc', true)).toBe('?s=abc&sidebar=1')
  })

  it('is idempotent — opening twice does not duplicate the flag', () => {
    const once = withSidebarParam('?s=abc', true)
    expect(withSidebarParam(once, true)).toBe(once)
  })

  it('removes the flag in place, leaving the other parameters alone', () => {
    expect(withSidebarParam('?s=abc&sidebar=1&attach=42', false)).toBe('?s=abc&attach=42')
  })

  it('returns the empty string when closing leaves nothing', () => {
    // The caller spells this as the bare pathname, so /nina never keeps a stray "?".
    expect(withSidebarParam('?sidebar=1', false)).toBe('')
    expect(withSidebarParam('', false)).toBe('')
  })
})

describe('sessionDayLabel', () => {
  it('says Today for today', () => {
    expect(sessionDayLabel('2026-09-04', '2026-09-04')).toBe('Today')
  })

  it('uses the compact day for anything else', () => {
    // `tests/format.test.ts` pins this exact pair, and August is used for the same reason it is
    // there: ICU abbreviates September as "Sept" in en-GB and the month's spelling is not what
    // this rule is about.
    expect(sessionDayLabel('2026-08-18', '2026-09-04')).toBe('18 Aug')
  })

  it('is `formatDayCompact` and not a second opinion about how a day reads', () => {
    // The property that matters, asserted without hardcoding a month abbreviation: the list and
    // `MessageList`'s day divider must name a day the same way.
    for (const dayISO of ['2026-09-01', '2026-01-31', '2025-12-25']) {
      expect(sessionDayLabel(dayISO, '2026-09-04'), dayISO).toBe(formatDayCompact(dayISO))
    }
  })

  it('renders nothing for a chat with no runner message yet', () => {
    // Not lib/format.ts's missing marker: beside a live chat that reads as a fault.
    expect(sessionDayLabel(null, '2026-09-04')).toBeNull()
  })
})

describe('planSessionList', () => {
  it('is empty for no sessions', () => {
    expect(planSessionList({ sessions: [], activeSessionId: null })).toEqual({ kind: 'empty' })
  })

  it('preserves the order it was given', () => {
    // THE GUARD. listNinaSessions already applied R4 (pinned first) and R5 (most recent runner
    // message descending). A re-sort here would be a second opinion about the ordering living
    // where no test could see it — which is exactly what this phase promised not to write.
    const sessions = [
      session('c', { pinned: true, dayLabel: '1 Sep' }),
      session('a', { dayLabel: 'Today' }),
      session('b', { dayLabel: '3 Sep' }),
    ]
    const plan = planSessionList({ sessions, activeSessionId: null })
    expect(plan.kind).toBe('rows')
    if (plan.kind !== 'rows') return
    expect(plan.rows.map((row) => row.session.id)).toEqual(['c', 'a', 'b'])
  })

  it('marks exactly the open session', () => {
    const plan = planSessionList({
      sessions: [session('a'), session('b'), session('c')],
      activeSessionId: 'b',
    })
    expect(plan.kind).toBe('rows')
    if (plan.kind !== 'rows') return
    expect(plan.rows.filter((row) => row.active).map((row) => row.session.id)).toEqual(['b'])
  })

  it('marks nothing when no session is active', () => {
    const plan = planSessionList({ sessions: [session('a')], activeSessionId: null })
    expect(plan.kind).toBe('rows')
    if (plan.kind !== 'rows') return
    expect(plan.rows.every((row) => !row.active)).toBe(true)
  })

  it('marks nothing when the active id is not in the list', () => {
    // A forged or since-deleted ?s= degrades silently, exactly as ?attach= and ?photo= do.
    const plan = planSessionList({ sessions: [session('a')], activeSessionId: 'gone' })
    expect(plan.kind).toBe('rows')
    if (plan.kind !== 'rows') return
    expect(plan.rows.every((row) => !row.active)).toBe(true)
  })

  it('does not alias the input array', () => {
    const sessions = [session('a')]
    const plan = planSessionList({ sessions, activeSessionId: 'a' })
    expect(plan.kind).toBe('rows')
    if (plan.kind !== 'rows') return
    expect(plan.rows[0]?.session).toBe(sessions[0])
    expect(plan.rows).not.toBe(sessions)
  })
})

describe('planSessionRemoval', () => {
  it('refreshes when phase 3 says to stay', () => {
    expect(planSessionRemoval({ next: null })).toEqual({ kind: 'refresh' })
  })

  it('navigates where phase 3 says, which for the open chat is the BARE /nina', () => {
    // The agreement with phase 3, written down. No ?s=: which session opens when none is named is
    // phase 3's rule, and it is also the answer when the runner just removed his last session.
    // The href arrives in the action's `next`, so this asserts the pass-through AND pins the
    // contract's value.
    expect(planSessionRemoval({ next: NINA_CHAT_HREF })).toEqual({
      kind: 'navigate',
      href: NINA_CHAT_HREF,
    })
    expect(NINA_CHAT_HREF).toBe('/nina')
    expect(NINA_CHAT_HREF).not.toContain('?')
  })
})
