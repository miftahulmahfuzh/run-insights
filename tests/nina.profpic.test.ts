import { describe, expect, it } from 'vitest'

import { ID_LENGTH } from '@/lib/id'
import { NINA_BLOB_PREFIX } from '@/lib/nina/images'
import { NINA_IMAGE_PATHNAME_RE, ninaImagePathname } from '@/lib/nina/imagerecipe'
import {
  ALLOWED_FORMATS,
  ANCHOR_MAX_EDGE_PX,
  AVATAR_MAX_EDGE_PX,
  MAX_DESCRIPTION_CHARS,
  MIN_SHORT_EDGE_PX,
  assertUsableImage,
  avatarPathname,
  fitInside,
  parseArgs,
} from '@/scripts/nina-profpic.mjs'

/**
 * The four pure halves of `scripts/nina-profpic.mjs`: what it will accept, what size it will
 * produce, where it will put it, and how it reads its own arguments. The upload, the transaction
 * and the poke are not testable without writing production — the phase plan's Verification section
 * says so rather than pretending otherwise.
 *
 * The last block is RULING A6's guard: this script and phase 12's worker are the two writers under
 * `nina/<userId>/`, they build their pathnames in different files, and the only thing keeping them
 * from drifting is that both are asserted against `NINA_IMAGE_PATHNAME_RE` here and in
 * `tests/nina.imagerecipe.test.ts`.
 */

describe('parseArgs', () => {
  it('takes one path and defaults to a dry run', () => {
    const args = parseArgs(['/tmp/nina.png'])
    expect(args.imagePath).toBe('/tmp/nina.png')
    expect(args.apply).toBe(false)
    expect(args.user).toBeNull()
    expect(args.description).toBeNull()
    expect(args.appUrl).toBe('https://runins.site')
  })

  it('reads --apply, --user and --app-url in any order', () => {
    const args = parseArgs(['--user', 'u1', '/tmp/n.png', '--app-url', 'http://x.test/', '--apply'])
    expect(args).toEqual({
      apply: true,
      user: 'u1',
      appUrl: 'http://x.test',
      description: null,
      imagePath: '/tmp/n.png',
    })
  })

  it('takes prose for --description, trimmed', () => {
    const args = parseArgs(['/tmp/n.png', '--description', '  di track rawamangun, abis 10k  '])
    expect(args.description).toBe('di track rawamangun, abis 10k')
  })

  it('refuses no path, two paths, an unknown flag and a valueless flag', () => {
    expect(() => parseArgs([])).toThrow(/usage/)
    expect(() => parseArgs(['a.png', 'b.png'])).toThrow(/one image at a time/)
    expect(() => parseArgs(['a.png', '--force'])).toThrow(/unknown flag --force/)
    expect(() => parseArgs(['a.png', '--user'])).toThrow(/--user needs a user id/)
    expect(() => parseArgs(['a.png', '--user', '--apply'])).toThrow(/--user needs a user id/)
  })

  it('refuses an empty or oversized --description', () => {
    expect(() => parseArgs(['a.png', '--description'])).toThrow(/needs some prose/)
    expect(() => parseArgs(['a.png', '--description', '   '])).toThrow(/needs some prose/)
    expect(() =>
      parseArgs(['a.png', '--description', 'x'.repeat(MAX_DESCRIPTION_CHARS + 1)]),
    ).toThrow(/ceiling is/)
  })
})

describe('assertUsableImage', () => {
  const ok = { format: 'png', width: 1792, height: 2400, pages: 1, bytes: 6_400_000 }

  it('accepts a real photograph', () => {
    expect(() => assertUsableImage(ok)).not.toThrow()
  })

  it('refuses a file no decoder recognised', () => {
    expect(() => assertUsableImage({ ...ok, format: undefined })).toThrow(/not an image/)
  })

  it('refuses SVG by name, not by allow-list accident', () => {
    expect(() => assertUsableImage({ ...ok, format: 'svg' })).toThrow(/SVG is refused/)
    expect(ALLOWED_FORMATS.has('svg')).toBe(false)
  })

  it('refuses an unlisted format', () => {
    expect(() => assertUsableImage({ ...ok, format: 'pdf' })).toThrow(/unsupported format "pdf"/)
  })

  it('refuses an animated image', () => {
    expect(() => assertUsableImage({ ...ok, format: 'webp', pages: 12 })).toThrow(/animated/)
  })

  it('refuses anything whose short edge is under the floor', () => {
    const short = MIN_SHORT_EDGE_PX - 1
    expect(() => assertUsableImage({ ...ok, width: short, height: 4000 })).toThrow(/too small/)
    expect(() => assertUsableImage({ ...ok, width: 4000, height: MIN_SHORT_EDGE_PX })).not.toThrow()
  })

  it('refuses an absurd input size', () => {
    expect(() => assertUsableImage({ ...ok, bytes: 40_000_000 })).toThrow(/ceiling/)
  })
})

describe('fitInside', () => {
  it('puts the long edge on the target and keeps the aspect ratio', () => {
    expect(fitInside(1792, 2400, AVATAR_MAX_EDGE_PX)).toEqual({ width: 1195, height: 1600 })
    expect(fitInside(2400, 1792, AVATAR_MAX_EDGE_PX)).toEqual({ width: 1600, height: 1195 })
  })

  it('never upscales', () => {
    expect(fitInside(800, 600, AVATAR_MAX_EDGE_PX)).toEqual({ width: 800, height: 600 })
    expect(fitInside(1792, 2400, ANCHOR_MAX_EDGE_PX)).toEqual({ width: 1529, height: 2048 })
  })

  it('refuses implausible input', () => {
    expect(() => fitInside(0, 10, 100)).toThrow(/implausible source dimensions/)
    expect(() => fitInside(10, 10, 0)).toThrow(/implausible maxEdge/)
  })
})

describe('avatarPathname', () => {
  const USER = 'e6f1a0c2-1111-4222-8333-444455556666'
  const ID = 'Ab3-_9xYz012'

  it('writes under the RU-7 prefix, keyed by user', () => {
    expect(avatarPathname(USER, ID)).toBe(`${NINA_BLOB_PREFIX}${USER}/avatar-${ID}.jpg`)
  })

  it('refuses to build a path out of anything that could traverse', () => {
    expect(() => avatarPathname('../../etc', ID)).toThrow(/refusing to build/)
    expect(() => avatarPathname('u1', 'a/b')).toThrow(/refusing to build/)
  })

  it('refuses an id that is not exactly lib/id.ts length', () => {
    expect(() => avatarPathname(USER, 'short')).toThrow(/refusing to build/)
    expect(() => avatarPathname(USER, 'A'.repeat(ID_LENGTH + 1))).toThrow(/refusing to build/)
  })

  /**
   * RULING A6. Two writers under one prefix, in two files: phase 12's `ninaImagePathname` (`.png`)
   * and this script's `avatarPathname` (`.jpg`). The shared regex is what makes them one
   * convention rather than two that happen to agree today.
   */
  it('agrees with the shared pathname regex, alongside phase 12s writer', () => {
    expect(NINA_IMAGE_PATHNAME_RE.test(avatarPathname(USER, ID))).toBe(true)
    expect(NINA_IMAGE_PATHNAME_RE.test(ninaImagePathname(USER, 'selfie', ID))).toBe(true)
    expect(avatarPathname(USER, ID).startsWith(NINA_BLOB_PREFIX)).toBe(true)
  })
})
