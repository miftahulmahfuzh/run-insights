import { describe, expect, it } from 'vitest'

import { NINA_TICKET_TTL_MS, signNinaImageTicket, verifyNinaImageTicket } from './imageTicket'

/**
 * `AUTH_SECRET` is deliberately NOT seeded by `tests/support/setup.ts`, which is exactly why the
 * signing pair takes the secret as an argument (invariant 6).
 */
const SECRET = 'unit-test-secret'
const CLAIMS = {
  userId: 'user_abc123',
  pathname: 'nina/user_abc123/chat/aaaaaaaaaaaa-Xy7.jpg',
  blobUrl: 'https://blob.example/nina/user_abc123/chat/aaaaaaaaaaaa-Xy7.jpg',
  width: 1024,
  height: 768,
  bytes: 150_000,
  description: 'Soaked through, grinning, low sun behind him.',
}

describe('the image ticket', () => {
  it('round-trips every claim', () => {
    const ticket = signNinaImageTicket(CLAIMS, SECRET, 1_000)
    const verdict = verifyNinaImageTicket(ticket, { userId: CLAIMS.userId, now: 2_000 }, SECRET)
    expect(verdict.ok).toBe(true)
    if (verdict.ok) {
      expect(verdict.claims.description).toBe(CLAIMS.description)
      expect(verdict.claims.pathname).toBe(CLAIMS.pathname)
      expect(verdict.claims.exp).toBe(1_000 + NINA_TICKET_TTL_MS)
    }
  })

  it('carries a null description, so a failed describe is still sendable', () => {
    const ticket = signNinaImageTicket({ ...CLAIMS, description: null }, SECRET)
    const verdict = verifyNinaImageTicket(ticket, { userId: CLAIMS.userId }, SECRET)
    expect(verdict.ok).toBe(true)
    if (verdict.ok) expect(verdict.claims.description).toBeNull()
  })

  it('refuses a tampered description — the reason this exists', () => {
    const ticket = signNinaImageTicket(CLAIMS, SECRET)
    const [payload, signature] = ticket.split('.')
    const forged = JSON.parse(Buffer.from(payload as string, 'base64url').toString('utf8'))
    forged.description = 'He set a new personal best of 3 minutes per kilometre.'
    const rewritten = `${Buffer.from(JSON.stringify(forged), 'utf8').toString('base64url')}.${signature}`
    expect(verifyNinaImageTicket(rewritten, { userId: CLAIMS.userId }, SECRET)).toEqual({
      ok: false,
      reason: 'bad_signature',
    })
  })

  it('refuses another secret, another user, and an expired ticket', () => {
    const ticket = signNinaImageTicket(CLAIMS, SECRET, 1_000)
    expect(verifyNinaImageTicket(ticket, { userId: CLAIMS.userId }, 'other').ok).toBe(false)
    expect(verifyNinaImageTicket(ticket, { userId: 'user_other' }, SECRET)).toEqual({
      ok: false,
      reason: 'wrong_user',
    })
    expect(
      verifyNinaImageTicket(
        ticket,
        { userId: CLAIMS.userId, now: 1_000 + NINA_TICKET_TTL_MS + 1 },
        SECRET,
      ),
    ).toEqual({ ok: false, reason: 'expired' })
  })

  it('returns a verdict, never throws, on garbage', () => {
    for (const bad of ['', '.', 'nodot', 'a.', '.b', 'x'.repeat(5_000)]) {
      expect(verifyNinaImageTicket(bad, { userId: CLAIMS.userId }, SECRET).ok).toBe(false)
    }
  })
})
