import { describe, expect, it } from 'vitest'

import {
  NINA_SESSION_TITLE_MAX_CHARS,
  SESSION_PARAM,
  chooseActiveSession,
  mostRecentSessionId,
  parseNinaSessionParam,
  sanitizeNinaSessionTitle,
  type SessionActivity,
} from '@/lib/nina/active'

/**
 * Phase 3's pure rules (invariant 7). The interesting ones are not the happy paths: they are the
 * coalesce onto `createdAt` (without it a session created by "new chat" sorts last and the runner
 * is sent back to the topic he just left), the deliberate blindness to `pinnedAt` (a pinned session
 * may be months old and must not become the default screen), and the silent fallback on a bad
 * `?s=` (R11 lets him delete the session a bookmark names).
 *
 * The ordering assertions here are deliberately not a second copy of `tests/nina.sessions.test.ts`:
 * `mostRecentSessionId` delegates to phase 1's `mostRecentNinaSession`, and what these cases pin
 * down is that the delegation preserves the three properties `/nina`'s routing depends on.
 */
function session(over: Partial<SessionActivity> & { id: string }): SessionActivity {
  return {
    pinnedAt: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    lastUserMessageAt: null,
    ...over,
  }
}

describe('SESSION_PARAM', () => {
  it('is the single letter the plan fixed', () => {
    expect(SESSION_PARAM).toBe('s')
  })
})

describe('parseNinaSessionParam', () => {
  it('accepts a well-formed id', () => {
    expect(parseNinaSessionParam('abcDEF012_-')).toBeNull()
    expect(parseNinaSessionParam('abcDEF012_-x')).toBe('abcDEF012_-x')
  })

  it('refuses the wrong shape rather than guessing', () => {
    expect(parseNinaSessionParam(undefined)).toBeNull()
    expect(parseNinaSessionParam(null)).toBeNull()
    expect(parseNinaSessionParam('')).toBeNull()
    expect(parseNinaSessionParam('too-short')).toBeNull()
    expect(parseNinaSessionParam('waaaaaaaaaaaaaaaaay-too-long')).toBeNull()
    expect(parseNinaSessionParam('has spaces!!')).toBeNull()
  })

  it('refuses a repeated parameter, which arrives as an array', () => {
    expect(parseNinaSessionParam(['abcDEF012_-x', 'abcDEF012_-y'])).toBeNull()
  })
})

describe('mostRecentSessionId', () => {
  it('is null when he has no sessions', () => {
    expect(mostRecentSessionId([])).toBeNull()
  })

  it('orders on the last user message', () => {
    const rows = [
      session({ id: 'aaaaaaaaaaaa', lastUserMessageAt: new Date('2026-03-01T00:00:00Z') }),
      session({ id: 'bbbbbbbbbbbb', lastUserMessageAt: new Date('2026-05-01T00:00:00Z') }),
      session({ id: 'cccccccccccc', lastUserMessageAt: new Date('2026-04-01T00:00:00Z') }),
    ]
    expect(mostRecentSessionId(rows)).toBe('bbbbbbbbbbbb')
  })

  it('falls back to createdAt for a session nobody has spoken in yet', () => {
    const rows = [
      session({ id: 'aaaaaaaaaaaa', lastUserMessageAt: new Date('2026-05-01T00:00:00Z') }),
      /* "New chat", tapped one second ago. It has no user message; without the coalesce this row
       * would rank oldest and `/nina` would reopen the conversation he just left. */
      session({ id: 'bbbbbbbbbbbb', createdAt: new Date('2026-06-01T00:00:00Z') }),
    ]
    expect(mostRecentSessionId(rows)).toBe('bbbbbbbbbbbb')
  })

  it('ignores pinnedAt — a pinned session is not the default screen', () => {
    const rows = [
      session({
        id: 'aaaaaaaaaaaa',
        pinnedAt: new Date('2026-01-01T00:00:00Z'),
        lastUserMessageAt: new Date('2025-01-01T00:00:00Z'),
      }),
      session({ id: 'bbbbbbbbbbbb', lastUserMessageAt: new Date('2026-06-01T00:00:00Z') }),
    ]
    expect(mostRecentSessionId(rows)).toBe('bbbbbbbbbbbb')
  })

  it('breaks a tie deterministically, not by array order', () => {
    const at = new Date('2026-06-01T00:00:00Z')
    const a = session({ id: 'aaaaaaaaaaaa', lastUserMessageAt: at, createdAt: at })
    const b = session({ id: 'bbbbbbbbbbbb', lastUserMessageAt: at, createdAt: at })
    expect(mostRecentSessionId([a, b])).toBe('bbbbbbbbbbbb')
    expect(mostRecentSessionId([b, a])).toBe('bbbbbbbbbbbb')
  })
})

describe('chooseActiveSession', () => {
  const rows = [
    session({ id: 'aaaaaaaaaaaa', lastUserMessageAt: new Date('2026-03-01T00:00:00Z') }),
    session({ id: 'bbbbbbbbbbbb', lastUserMessageAt: new Date('2026-05-01T00:00:00Z') }),
  ]

  it('honours a requested session he owns', () => {
    expect(chooseActiveSession(rows, 'aaaaaaaaaaaa')).toBe('aaaaaaaaaaaa')
  })

  it('degrades silently to the newest for a forged, foreign or deleted id', () => {
    expect(chooseActiveSession(rows, 'zzzzzzzzzzzz')).toBe('bbbbbbbbbbbb')
  })

  it('defaults to the newest with no parameter at all', () => {
    expect(chooseActiveSession(rows, null)).toBe('bbbbbbbbbbbb')
  })

  it('is null when he has removed every session (R11)', () => {
    expect(chooseActiveSession([], 'aaaaaaaaaaaa')).toBeNull()
    expect(chooseActiveSession([], null)).toBeNull()
  })
})

describe('sanitizeNinaSessionTitle', () => {
  it('trims and collapses whitespace', () => {
    expect(sanitizeNinaSessionTitle('  tempo   run   plan  ')).toBe('tempo run plan')
  })

  it('flattens a pasted multi-line title into one line', () => {
    expect(sanitizeNinaSessionTitle('tempo\nrun\tplan')).toBe('tempo run plan')
  })

  it('clamps to the exported maximum', () => {
    const long = 'x'.repeat(NINA_SESSION_TITLE_MAX_CHARS + 40)
    expect(sanitizeNinaSessionTitle(long)).toHaveLength(NINA_SESSION_TITLE_MAX_CHARS)
  })

  it('refuses a blank rename rather than writing an empty row', () => {
    expect(sanitizeNinaSessionTitle('')).toBeNull()
    expect(sanitizeNinaSessionTitle('   ')).toBeNull()
    expect(sanitizeNinaSessionTitle('\n\t')).toBeNull()
    expect(sanitizeNinaSessionTitle(undefined)).toBeNull()
    expect(sanitizeNinaSessionTitle(42)).toBeNull()
  })
})
