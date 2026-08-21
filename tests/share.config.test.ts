import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { SHARE_TOKEN_LENGTH, isValidShareToken, newShareToken } from '@/lib/id'
import { SHARE_OG_IMAGE, SHARE_OG_IMAGE_HEIGHT, SHARE_OG_IMAGE_WIDTH } from '@/lib/share/config'
import { REVOKE_BODY } from '@/lib/share/copy'

/**
 * The credential, the origin, and the one sentence R-38 wrote by hand.
 *
 * These are small assertions about constants, which is usually a smell — but each one here is a
 * property somebody could quietly weaken with a plausible-looking edit, and none of them is covered
 * anywhere else: a token shortened "because 16 is a lot", an origin resolved from
 * `window.location`, a revoke confirmation reworded to sound less alarming.
 */

describe('the share token is the credential', () => {
  it('is 16 symbols — 96 bits, per roadmap D9', () => {
    expect(SHARE_TOKEN_LENGTH).toBe(16)
    // 64^16 = 2^96 ≈ 7.9 × 10^28. At one guess per millisecond that is ~10^21 years to a 50% chance
    // of hitting ANY live token. This is the number the roadmap chose because the payload is health
    // data; it is not a knob.
    expect(Math.log2(64) * SHARE_TOKEN_LENGTH).toBe(96)
  })

  it('draws only from the URL-safe 64-symbol alphabet', () => {
    for (let i = 0; i < 200; i++) {
      const token = newShareToken()
      expect(token).toHaveLength(16)
      expect(token).toMatch(/^[0-9A-Za-z_-]{16}$/)
      expect(isValidShareToken(token)).toBe(true)
    }
  })

  it('produces no duplicates across a thousand mints', () => {
    // Not a statistical proof of anything — a collision at 2^96 would be a broken RNG, not bad luck,
    // and this is the cheapest possible check that the generator is not returning a constant.
    const seen = new Set(Array.from({ length: 1000 }, () => newShareToken()))
    expect(seen.size).toBe(1000)
  })

  it('rejects a token of the wrong length or alphabet before any query runs', () => {
    // `/s/xxx` from a crawler must 404 without a database round trip.
    for (const bad of ['', 'short', 'x'.repeat(17), 'sixteen.chars!!!', 'aaaa aaaa aaaa aa']) {
      expect(isValidShareToken(bad)).toBe(false)
    }
  })
})

describe('the preview image is static and committed', () => {
  it('points at one file, at the OG standard size', () => {
    // A per-run image would be cached on Meta CDN for days, beyond the reach of revocation. One
    // numberless thumbnail for every link — see lib/share/config.ts for the full argument.
    expect(SHARE_OG_IMAGE).toBe('/og-default.png')
    expect([SHARE_OG_IMAGE_WIDTH, SHARE_OG_IMAGE_HEIGHT]).toEqual([1200, 630])
  })
})

describe('the revoke copy says the thing that is hard to say — R-38', () => {
  it('states what revocation does AND what it cannot do', () => {
    // Verbatim from RECONCILIATION_v0.1.0.md R-38. Three properties it must keep: the link dies, the
    // photos are replaced so old image links break too, and a copy somebody already saved is beyond
    // reach. A reword that drops the third one is the regression this test exists for.
    expect(REVOKE_BODY).toContain('The link stops working')
    expect(REVOKE_BODY).toContain('the photos are replaced')
    expect(REVOKE_BODY).toContain('may have saved what they saw')
    expect(REVOKE_BODY).toContain('no revocation can reach')
  })

  it('does not apologise and does not hedge', () => {
    expect(REVOKE_BODY.toLowerCase()).not.toContain('sorry')
    expect(REVOKE_BODY.toLowerCase()).not.toContain('unfortunately')
  })
})

describe('shareUrl is built server-side, from the canonical origin', () => {
  const saved = { ...process.env }

  beforeEach(() => {
    vi.resetModules()
    // `authEnv()` memoises, so each case needs a fresh module registry as well as fresh env.
    process.env.AUTH_SECRET = 'unit-secret'
    process.env.AUTH_GOOGLE_ID = 'unit-id'
    process.env.AUTH_GOOGLE_SECRET = 'unit-secret'
  })

  afterEach(() => {
    process.env = { ...saved }
    vi.resetModules()
  })

  it('prefers AUTH_URL — the canonical apex from roadmap §4.8', async () => {
    process.env.AUTH_URL = 'https://runins.site'
    const { shareUrl } = await import('@/lib/share/origin')
    expect(shareUrl('abcdefgh12345678')).toBe('https://runins.site/s/abcdefgh12345678')
  })

  it('tolerates a trailing slash on AUTH_URL rather than emitting a double one', async () => {
    process.env.AUTH_URL = 'https://runins.site/'
    const { shareUrl } = await import('@/lib/share/origin')
    expect(shareUrl('abcdefgh12345678')).toBe('https://runins.site/s/abcdefgh12345678')
  })

  it("falls back to the project's STABLE production host, never the per-deployment one", async () => {
    process.env.AUTH_URL = ''
    process.env.VERCEL_PROJECT_PRODUCTION_URL = 'runins.site'
    // Set deliberately: if this ever wins, links minted on a preview die at the next deploy. That is
    // the exact bug roadmap §4.8 names, so the wrong variable is present in the env for this case.
    process.env.VERCEL_URL = 'run-insights-git-abc123.vercel.app'
    const { shareUrl } = await import('@/lib/share/origin')
    const url = shareUrl('abcdefgh12345678')
    expect(url).toBe('https://runins.site/s/abcdefgh12345678')
    expect(url).not.toContain('abc123')
  })

  it('falls back to localhost in development', async () => {
    process.env.AUTH_URL = ''
    delete process.env.VERCEL_PROJECT_PRODUCTION_URL
    delete process.env.VERCEL_URL
    process.env.PORT = '3000'
    const { shareUrl } = await import('@/lib/share/origin')
    expect(shareUrl('abcdefgh12345678')).toBe('http://localhost:3000/s/abcdefgh12345678')
  })
})
