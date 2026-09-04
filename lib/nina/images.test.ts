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
})

describe('isNinaChatRequestPathname', () => {
  const mine = 'nina/user_abc123/chat/aaaaaaaaaaaa.jpg'

  it("refuses another user's prefix — the whole point of binding the path to the session", () => {
    expect(isNinaChatRequestPathname(mine, 'user_someoneelse')).toBe(false)
  })

  it('accepts the stored pathname, which carries Vercel’s random suffix', () => {
    expect(
      isNinaChatRequestPathname('nina/user_abc123/chat/aaaaaaaaaaaa-Xy7.jpg', 'user_abc123'),
    ).toBe(true)
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
