import { describe, expect, it } from 'vitest'

import {
  NINA_CHAT_MAX_SOURCE_BYTES,
  NINA_MAX_CHAT_IMAGES,
  isNinaChatRequestPathname,
  ninaChatPathname,
  planNinaPicked,
} from './images'

describe('ninaChatPathname', () => {
  it('round-trips through its own validator', () => {
    const p = ninaChatPathname('user_abc123', 'aaaaaaaaaaaa')
    expect(p).toBe('nina/user_abc123/chat/aaaaaaaaaaaa.jpg')
    expect(isNinaChatRequestPathname(p, 'user_abc123')).toBe(true)
  })

  it('refuses a user id that is not a single safe path segment', () => {
    expect(() => ninaChatPathname('../evil', 'aaaaaaaaaaaa')).toThrow()
    expect(() => ninaChatPathname('a/b', 'aaaaaaaaaaaa')).toThrow()
  })

  it('refuses a bad image id', () => {
    expect(() => ninaChatPathname('user_abc123', 'short')).toThrow()
    expect(() => ninaChatPathname('user_abc123', 'has.a.dot12')).toThrow()
  })

  it('refuses an id longer than newId() — `{12}` exactly, so the mint cannot drift', () => {
    // The window this replaced was `{12,24}` and would have built a pathname from any of these.
    for (const n of [13, 18, 24]) {
      expect(() => ninaChatPathname('user_abc123', 'a'.repeat(n))).toThrow()
    }
  })

  it('refuses a STORED-form id: this builds the pathname we ASK for', () => {
    expect(() =>
      ninaChatPathname('user_abc123', 'aaaaaaaaaaaa-Pikq5mB56ZG2mBjkWsSpNVIn8M8oyw'),
    ).toThrow()
  })
})

describe('isNinaChatRequestPathname', () => {
  const mine = 'nina/user_abc123/chat/aaaaaaaaaaaa.jpg'

  it("refuses another user's prefix — the whole point of binding the path to the session", () => {
    expect(isNinaChatRequestPathname(mine, 'user_someoneelse')).toBe(false)
  })

  /**
   * A REAL suffix, copied out of the prod store (`nina/…/avatar-DlA2teEDtOPP-Pikq5mB…oyw.jpg`)
   * rather than invented. This case used to assert `chat/aaaaaaaaaaaa-Xy7.jpg` — a 3-symbol suffix,
   * id segment 16, comfortably inside the old `{12,24}` — while every actual camera upload, id
   * segment 43, was being refused and orphaning its blob.
   */
  const SUFFIX = 'Pikq5mB56ZG2mBjkWsSpNVIn8M8oyw'

  it('accepts the stored pathname, which carries Vercel’s random suffix', () => {
    expect(SUFFIX).toHaveLength(30)
    const stored = `nina/user_abc123/chat/aaaaaaaaaaaa-${SUFFIX}.jpg`
    expect(stored.slice('nina/user_abc123/chat/'.length, -'.jpg'.length)).toHaveLength(43)
    expect(isNinaChatRequestPathname(stored, 'user_abc123')).toBe(true)
  })

  it('accepts a stored id whose requested half ends in a dash', () => {
    // `newId()`'s alphabet includes `-`, so the separator cannot be found by splitting. Real
    // object: `shots/Ve394_KsZZ7--Rb9EznPf5OE150rEwy1evUqr6Hbixd.jpg`.
    expect(
      isNinaChatRequestPathname(`nina/user_abc123/chat/Ve394_KsZZ7--${SUFFIX}.jpg`, 'user_abc123'),
    ).toBe(true)
  })

  it('refuses a requested id that is not exactly 12 — the mint check stays tight', () => {
    for (const n of [11, 13, 18, 24, 25]) {
      expect(
        isNinaChatRequestPathname(`nina/user_abc123/chat/${'a'.repeat(n)}.jpg`, 'user_abc123'),
      ).toBe(false)
    }
  })

  it('refuses a suffix outside the recorded 16-64 bound', () => {
    // 3 is what this suite used to assert as a stored suffix. It never was one.
    for (const n of [3, 15, 65]) {
      expect(
        isNinaChatRequestPathname(
          `nina/user_abc123/chat/aaaaaaaaaaaa-${'b'.repeat(n)}.jpg`,
          'user_abc123',
        ),
      ).toBe(false)
    }
  })

  it('refuses traversal, extra segments, other prefixes and other extensions', () => {
    for (const bad of [
      'nina/user_abc123/chat/../../shots/x.jpg',
      'nina/user_abc123/chat/sub/aaaaaaaaaaaa.jpg',
      'nina/user_abc123/avatars/aaaaaaaaaaaa.jpg',
      'shots/aaaaaaaaaaaa.jpg',
      'nina/user_abc123/chat/aaaaaaaaaaaa.png',
      'nina/user_abc123/chat/.jpg',
      '/nina/user_abc123/chat/aaaaaaaaaaaa.jpg',
    ]) {
      expect(isNinaChatRequestPathname(bad, 'user_abc123')).toBe(false)
    }
  })

  it('refuses a malformed user id rather than throwing', () => {
    expect(isNinaChatRequestPathname(mine, '../evil')).toBe(false)
  })

  it('accepts an Auth.js uuid, which is what a real user id actually is', () => {
    const uuid = '3f2504e0-4f89-11d3-9a0c-0305e82c3301'
    const p = ninaChatPathname(uuid, 'aaaaaaaaaaaa')
    expect(isNinaChatRequestPathname(p, uuid)).toBe(true)
  })
})

describe('planNinaPicked', () => {
  const jpeg = (name: string, size = 1_000) => ({ name, type: 'image/jpeg', size })

  it('accepts up to the cap and rejects the rest as too_many', () => {
    const plan = planNinaPicked([jpeg('a'), jpeg('b'), jpeg('c'), jpeg('d')], { alreadyHeld: 0 })
    expect(plan.accepted).toHaveLength(NINA_MAX_CHAT_IMAGES)
    expect(plan.rejected).toEqual([{ name: 'd', reason: 'too_many' }])
  })

  it('counts what the composer already holds', () => {
    const plan = planNinaPicked([jpeg('a'), jpeg('b')], { alreadyHeld: 2 })
    expect(plan.accepted.map((f) => f.name)).toEqual(['a'])
    expect(plan.rejected).toEqual([{ name: 'b', reason: 'too_many' }])
  })

  it('rejects a non-image and an oversized source without spending a slot on them', () => {
    const plan = planNinaPicked(
      [
        { name: 'notes.pdf', type: 'application/pdf', size: 10 },
        jpeg('huge', NINA_CHAT_MAX_SOURCE_BYTES + 1),
        jpeg('fine'),
      ],
      { alreadyHeld: 0 },
    )
    expect(plan.accepted.map((f) => f.name)).toEqual(['fine'])
    expect(plan.rejected).toEqual([
      { name: 'notes.pdf', reason: 'not_an_image' },
      { name: 'huge', reason: 'too_large' },
    ])
  })

  it('is a no-op on an empty pick', () => {
    expect(planNinaPicked([], { alreadyHeld: 0 })).toEqual({ accepted: [], rejected: [] })
  })
})
