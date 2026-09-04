import { describe, expect, it } from 'vitest'

import { chooseSaveStrategy, saveFilenameFor } from './save'

/**
 * R10's download, as the two rules it reduces to. No DOM is involved and that is the point:
 * `vitest.config.ts` runs `environment: 'node'`, so `navigator.canShare`, `File` and a download
 * bar are all out of reach — but every rule the component obeys is here, because the component
 * holds none of its own. It probes the platform and asks these two functions.
 */

const CHAT_PHOTO = 'https://store.public.blob.vercel-storage.com/nina/u-1/chat/aBcD1234wXyZ-Qw9.jpg'

describe('chooseSaveStrategy', () => {
  it('hands a phone the share sheet, because that is the branch that reaches Photos', () => {
    expect(chooseSaveStrategy({ canShareFiles: true, coarsePointer: true })).toBe('share')
  })

  it('hands a mouse a file, even when the platform could share', () => {
    // Windows Chrome and macOS Safari both report canShare({files}), and the Windows sheet has no
    // save action at all — an app picker is not what someone who clicked a download icon asked for.
    expect(chooseSaveStrategy({ canShareFiles: true, coarsePointer: false })).toBe('download')
  })

  it('falls back to the anchor on a touch device that cannot share files', () => {
    expect(chooseSaveStrategy({ canShareFiles: false, coarsePointer: true })).toBe('download')
  })

  it('is the anchor by default', () => {
    expect(chooseSaveStrategy({ canShareFiles: false, coarsePointer: false })).toBe('download')
  })
})

describe('saveFilenameFor', () => {
  it('keeps the blob segment, which is what makes two saves not collide', () => {
    expect(saveFilenameFor(CHAT_PHOTO, 'nina')).toBe('nina-aBcD1234wXyZ-Qw9.jpg')
  })

  it('never carries the user id out of the pathname', () => {
    expect(saveFilenameFor(CHAT_PHOTO, 'nina')).not.toContain('u-1')
  })

  it('drops a query string rather than putting it in the name', () => {
    expect(saveFilenameFor(`${CHAT_PHOTO}?download=1`, 'nina')).toBe('nina-aBcD1234wXyZ-Qw9.jpg')
  })

  it('normalises .jpeg to .jpg and preserves the extensions worth preserving', () => {
    expect(saveFilenameFor('https://x.example/a/b.jpeg', 'nina')).toBe('nina-b.jpg')
    expect(saveFilenameFor('https://x.example/a/b.png', 'nina')).toBe('nina-b.png')
    expect(saveFilenameFor('https://x.example/a/b.webp', 'nina')).toBe('nina-b.webp')
  })

  it('treats an unknown extension as a JPEG, because the compressor only emits one', () => {
    expect(saveFilenameFor('https://x.example/a/b.bin', 'nina')).toBe('nina-b.jpg')
  })

  it('degrades instead of throwing on a URL that is not one', () => {
    expect(saveFilenameFor('not a url', 'nina')).toBe('nina.jpg')
    expect(saveFilenameFor('https://x.example/', 'nina')).toBe('nina.jpg')
    expect(saveFilenameFor('', 'nina')).toBe('nina.jpg')
  })

  it('truncates a long stem and leaves no trailing separator behind', () => {
    const long = `https://x.example/${'a'.repeat(80)}.jpg`
    const name = saveFilenameFor(long, 'nina')
    expect(name).toBe(`nina-${'a'.repeat(40)}.jpg`)
    expect(name).not.toContain('-.')
  })

  it('sanitises the prefix too, and never returns a bare extension', () => {
    expect(saveFilenameFor(CHAT_PHOTO, '../..')).toBe('foto-aBcD1234wXyZ-Qw9.jpg')
  })
})
