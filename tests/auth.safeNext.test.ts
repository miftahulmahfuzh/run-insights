import { describe, expect, it } from 'vitest'

import { safeNext } from '@/lib/auth/safeNext'

/**
 * An open redirect on a sign-in path is a phishing primitive, not a cosmetic bug: a link on
 * runins.site that deposits the visitor on someone else's login form in the same breath as they
 * typed a Google password. `next` is attacker-controlled — `proxy.ts` writes it, but anyone can
 * type it.
 */
describe('safeNext', () => {
  it('keeps a same-origin path, with its query string', () => {
    expect(safeNext('/trends')).toBe('/trends')
    expect(safeNext('/r/abc123def456')).toBe('/r/abc123def456')
    expect(safeNext('/x/abc123def456?tab=splits')).toBe('/x/abc123def456?tab=splits')
  })

  it('rejects an absolute URL', () => {
    expect(safeNext('https://evil.com')).toBe('/')
    expect(safeNext('http://evil.com/me')).toBe('/')
  })

  it('rejects a protocol-relative URL — a browser reads // as a host, not a path', () => {
    expect(safeNext('//evil.com')).toBe('/')
    expect(safeNext('//evil.com/upload')).toBe('/')
  })

  it('rejects a backslash, which some URL parsers fold into a slash', () => {
    expect(safeNext('/\\evil.com')).toBe('/')
    expect(safeNext('\\\\evil.com')).toBe('/')
  })

  it('rejects anything that is not a string', () => {
    expect(safeNext(null)).toBe('/')
    expect(safeNext(undefined)).toBe('/')
    expect(safeNext(42)).toBe('/')
    // FormData.get() returns a File for a file input; it must not survive either.
    expect(safeNext(new Blob())).toBe('/')
  })

  it('rejects a relative path with no leading slash', () => {
    expect(safeNext('me')).toBe('/')
    expect(safeNext('evil.com')).toBe('/')
  })
})
