import { describe, expect, it } from 'vitest'

import {
  NINA_SESSION_TITLE_MAX_CHARS,
  SESSION_UNTITLED_TITLE,
  compareNinaSessionActivity,
  compareNinaSessions,
  mostRecentNinaSession,
  orderNinaSessions,
  sessionActivityAt,
  sessionTitleFor,
  type NinaSessionOrderable,
} from './sessions'

const at = (iso: string): Date => new Date(iso)

function session(over: Partial<NinaSessionOrderable> & { id: string }): NinaSessionOrderable {
  return {
    pinnedAt: null,
    lastUserMessageAt: null,
    createdAt: at('2026-01-01T00:00:00Z'),
    ...over,
  }
}

/* ── sessionActivityAt ─────────────────────────────────────────────────────────────────────── */

describe('sessionActivityAt', () => {
  it('is his newest message in the session when there is one', () => {
    const row = session({
      id: 'aaaaaaaaaaaa',
      createdAt: at('2026-03-01T00:00:00Z'),
      lastUserMessageAt: at('2026-03-05T10:00:00Z'),
    })
    expect(sessionActivityAt(row).toISOString()).toBe('2026-03-05T10:00:00.000Z')
  })

  it('falls back to createdAt for a session he made and has not written in', () => {
    const row = session({ id: 'bbbbbbbbbbbb', createdAt: at('2026-03-09T08:00:00Z') })
    expect(sessionActivityAt(row).toISOString()).toBe('2026-03-09T08:00:00.000Z')
  })
})

/* ── R5: the activity order ────────────────────────────────────────────────────────────────── */

describe('compareNinaSessionActivity', () => {
  it('puts the most recent user message first', () => {
    const older = session({ id: 'aaaaaaaaaaaa', lastUserMessageAt: at('2026-03-01T00:00:00Z') })
    const newer = session({ id: 'bbbbbbbbbbbb', lastUserMessageAt: at('2026-03-02T00:00:00Z') })
    expect(compareNinaSessionActivity(newer, older)).toBeLessThan(0)
    expect(compareNinaSessionActivity(older, newer)).toBeGreaterThan(0)
  })

  it('ignores the pin — this is the resolution order, not the display order', () => {
    const pinnedOld = session({
      id: 'aaaaaaaaaaaa',
      pinnedAt: at('2026-03-09T00:00:00Z'),
      lastUserMessageAt: at('2026-01-01T00:00:00Z'),
    })
    const freshUnpinned = session({
      id: 'bbbbbbbbbbbb',
      lastUserMessageAt: at('2026-03-08T00:00:00Z'),
    })
    expect(compareNinaSessionActivity(freshUnpinned, pinnedOld)).toBeLessThan(0)
  })

  it('sorts a brand-new empty session above an older conversation', () => {
    const empty = session({ id: 'aaaaaaaaaaaa', createdAt: at('2026-03-09T09:00:00Z') })
    const old = session({
      id: 'bbbbbbbbbbbb',
      createdAt: at('2026-01-01T00:00:00Z'),
      lastUserMessageAt: at('2026-02-01T00:00:00Z'),
    })
    expect(compareNinaSessionActivity(empty, old)).toBeLessThan(0)
  })

  it('is a total order: equal instants tie-break on id and never return 0 for two rows', () => {
    const same = at('2026-03-05T10:00:00Z')
    const a = session({ id: 'aaaaaaaaaaaa', lastUserMessageAt: same })
    const b = session({ id: 'bbbbbbbbbbbb', lastUserMessageAt: same })
    expect(compareNinaSessionActivity(a, b)).not.toBe(0)
    expect(compareNinaSessionActivity(a, b)).toBe(-compareNinaSessionActivity(b, a))
    expect(compareNinaSessionActivity(a, a)).toBe(0)
  })
})

/* ── R4 + R5: the display order ────────────────────────────────────────────────────────────── */

describe('compareNinaSessions', () => {
  it('puts every pinned session above every unpinned one, however stale', () => {
    const pinnedStale = session({
      id: 'aaaaaaaaaaaa',
      pinnedAt: at('2026-03-09T00:00:00Z'),
      lastUserMessageAt: at('2025-06-01T00:00:00Z'),
    })
    const activeUnpinned = session({
      id: 'bbbbbbbbbbbb',
      lastUserMessageAt: at('2026-03-09T12:00:00Z'),
    })
    expect(compareNinaSessions(pinnedStale, activeUnpinned)).toBeLessThan(0)
  })

  it('applies R5 inside the pinned block, not the pin time', () => {
    const pinnedFirstButQuiet = session({
      id: 'aaaaaaaaaaaa',
      pinnedAt: at('2026-01-01T00:00:00Z'),
      lastUserMessageAt: at('2026-02-01T00:00:00Z'),
    })
    const pinnedLaterAndBusy = session({
      id: 'bbbbbbbbbbbb',
      pinnedAt: at('2026-03-01T00:00:00Z'),
      lastUserMessageAt: at('2026-03-08T00:00:00Z'),
    })
    expect(compareNinaSessions(pinnedLaterAndBusy, pinnedFirstButQuiet)).toBeLessThan(0)
  })
})

describe('orderNinaSessions', () => {
  const march = session({ id: 'ccccccccccc1', lastUserMessageAt: at('2026-03-08T00:00:00Z') })
  const february = session({ id: 'ccccccccccc2', lastUserMessageAt: at('2026-02-08T00:00:00Z') })
  const pinnedJanuary = session({
    id: 'ccccccccccc3',
    pinnedAt: at('2026-03-01T00:00:00Z'),
    lastUserMessageAt: at('2026-01-08T00:00:00Z'),
  })
  const emptyToday = session({ id: 'ccccccccccc4', createdAt: at('2026-03-09T07:00:00Z') })

  it('is pinned first, then most-recent-user-message descending', () => {
    const ordered = orderNinaSessions([february, march, pinnedJanuary, emptyToday])
    expect(ordered.map((row) => row.id)).toEqual([
      'ccccccccccc3',
      'ccccccccccc4',
      'ccccccccccc1',
      'ccccccccccc2',
    ])
  })

  it('does not mutate its input', () => {
    const input = [february, march]
    orderNinaSessions(input)
    expect(input.map((row) => row.id)).toEqual(['ccccccccccc2', 'ccccccccccc1'])
  })

  it('handles an empty list', () => {
    expect(orderNinaSessions([])).toEqual([])
  })
})

/* ── "the most recent session" ─────────────────────────────────────────────────────────────── */

describe('mostRecentNinaSession', () => {
  it('is null when he has no sessions — a new account, or the one he just removed his last from', () => {
    expect(mostRecentNinaSession([])).toBeNull()
  })

  it('is the most active session, NOT the top of the display list', () => {
    const pinnedOld = session({
      id: 'ddddddddddd1',
      pinnedAt: at('2026-03-09T00:00:00Z'),
      lastUserMessageAt: at('2026-01-01T00:00:00Z'),
    })
    const activeToday = session({
      id: 'ddddddddddd2',
      lastUserMessageAt: at('2026-03-09T06:00:00Z'),
    })
    const rows = [pinnedOld, activeToday]

    expect(orderNinaSessions(rows)[0]?.id).toBe('ddddddddddd1')
    expect(mostRecentNinaSession(rows)?.id).toBe('ddddddddddd2')
  })

  it('picks a freshly created empty session over an older conversation', () => {
    const empty = session({ id: 'ddddddddddd3', createdAt: at('2026-03-09T09:00:00Z') })
    const old = session({ id: 'ddddddddddd4', lastUserMessageAt: at('2026-03-08T00:00:00Z') })
    expect(mostRecentNinaSession([old, empty])?.id).toBe('ddddddddddd3')
  })
})

/* ── the title fallback ────────────────────────────────────────────────────────────────────── */

describe('sessionTitleFor', () => {
  it('returns the stored title when there is one', () => {
    expect(sessionTitleFor({ title: 'Latihan half marathon' })).toBe('Latihan half marathon')
  })

  it('trims it', () => {
    expect(sessionTitleFor({ title: '  Latihan pagi  ' })).toBe('Latihan pagi')
  })

  it('falls back for NULL, for empty, and for whitespace-only', () => {
    expect(sessionTitleFor({ title: null })).toBe(SESSION_UNTITLED_TITLE)
    expect(sessionTitleFor({ title: '' })).toBe(SESSION_UNTITLED_TITLE)
    expect(sessionTitleFor({ title: '   \n\t ' })).toBe(SESSION_UNTITLED_TITLE)
  })

  it('does not truncate — the cap belongs to the writer, not the reader', () => {
    const long = 'a'.repeat(NINA_SESSION_TITLE_MAX_CHARS + 20)
    expect(sessionTitleFor({ title: long })).toBe(long)
  })
})
