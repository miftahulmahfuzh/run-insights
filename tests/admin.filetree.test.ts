import { describe, expect, it } from 'vitest'

import {
  ADMIN_AVATAR_CONTENT_TYPES,
  ADMIN_AVATAR_EXTS,
  ADMIN_AVATAR_MAX_UPLOAD_BYTES,
} from '@/lib/admin/avatars'
import {
  buildTree,
  classifyFile,
  fileExtension,
  findFolderNode,
  folderAncestors,
  folderBreadcrumbs,
  folderCounts,
  folderDepth,
  folderName,
  folderParent,
  foldFolderPath,
  isFolderAncestorOf,
  isInFolderTree,
  joinFolderPath,
  normaliseFolderPath,
  NINA_FILENAME_MAX_CHARS,
  NINA_FOLDER_MAX_DEPTH,
  NINA_FOLDER_MAX_PATH_CHARS,
  NINA_FOLDER_MAX_SEGMENT_CHARS,
  NINA_FOLDER_ROOT,
  NINA_FOLDER_ROOT_LABEL,
  NINA_SOURCE_KEY_MAX_CHARS,
  NINA_SOURCE_KEY_VERSION,
  planFolderUpload,
  sanitiseFolderSegment,
  sourceKeyFor,
  splitFolderPath,
  validateFolderPath,
  type FolderCount,
  type LocalFileLike,
  type ManifestEntryLike,
} from '@/lib/admin/filetree'

/**
 * Phase 2 of the album-as-a-file-manager plan set: everything `/admin/nina`'s uploader decides
 * before it touches the network. R1.
 *
 * These are unit tests for logic that would otherwise live in a drop handler, and that is not a
 * style choice: `vitest.config.ts` is `environment: 'node'` with no jsdom, so logic inside a `.tsx`
 * is logic this repo cannot assert at all — and F17 measured what that costs on an upload path
 * (one picked file, two token mints, two blobs, one orphaned for good). The rules below are small
 * and total, so they are proved case by case rather than by example, the way
 * `tests/extract.planPicked.test.ts` proves `planPicked`.
 *
 * Nothing here constructs a `File`. `planFolderUpload` takes five plain fields precisely so the
 * whole diff is testable with literals and no doubles.
 */

/** One walked file. `tag` rides along to prove the plan hands the caller's own object back. */
interface Walked extends LocalFileLike {
  tag?: string
}

function walked(relativePath: string, over: Partial<Walked> = {}): Walked {
  const name = relativePath.split('/').at(-1) ?? relativePath
  return {
    relativePath,
    name,
    type: 'image/jpeg',
    size: 1024,
    lastModified: 1_700_000_000_000,
    ...over,
  }
}

function manifestOf(...keys: string[]): ManifestEntryLike[] {
  return keys.map((sourceKey) => ({ sourceKey }))
}

function plan(base: string, files: readonly Walked[], manifest: readonly ManifestEntryLike[] = []) {
  return planFolderUpload({ base, files, manifest, maxBytes: ADMIN_AVATAR_MAX_UPLOAD_BYTES })
}

const path = (depth: number, chars = 4) =>
  Array.from({ length: depth }, (_, i) => `${String(i).padStart(chars, 'd')}`).join('/')

/* ── The image filter ─────────────────────────────────────────────────────────────────────── */

describe('fileExtension', () => {
  it('lowercases, and takes the last dot only', () => {
    expect(fileExtension('a.JPG')).toBe('jpg')
    expect(fileExtension('holiday.2024.jpeg')).toBe('jpeg')
    expect(fileExtension('archive.tar.gz')).toBe('gz')
  })

  it('treats a leading dot as part of the name, not as a separator', () => {
    expect(fileExtension('.DS_Store')).toBe('')
    expect(fileExtension('.gitignore')).toBe('')
  })

  it('has no extension when there is no dot', () => {
    expect(fileExtension('README')).toBe('')
    expect(fileExtension('')).toBe('')
  })

  it('accepts a whole relative path, in either separator style', () => {
    expect(fileExtension('Faces/2026/a.png')).toBe('png')
    expect(fileExtension('Faces\\2026\\a.WEBP')).toBe('webp')
  })
})

describe('classifyFile — MIME first', () => {
  it('accepts the three content types the upload path can take', () => {
    expect(classifyFile({ name: 'a', type: 'image/jpeg' })).toEqual({
      ok: true,
      ext: 'jpg',
      contentType: 'image/jpeg',
      decidedBy: 'mime',
    })
    expect(classifyFile({ name: 'a', type: 'image/png' })).toEqual({
      ok: true,
      ext: 'png',
      contentType: 'image/png',
      decidedBy: 'mime',
    })
    expect(classifyFile({ name: 'a', type: 'image/webp' })).toEqual({
      ok: true,
      ext: 'webp',
      contentType: 'image/webp',
      decidedBy: 'mime',
    })
  })

  it('accepts the spellings a Windows shell actually emits', () => {
    for (const type of ['image/jpg', 'image/pjpeg', 'IMAGE/JPEG', 'image/jpeg; charset=binary']) {
      expect(classifyFile({ name: 'a.jpg', type })).toMatchObject({ ok: true, ext: 'jpg' })
    }
    expect(classifyFile({ name: 'a.png', type: 'image/x-png' })).toMatchObject({
      ok: true,
      ext: 'png',
    })
  })

  it('derives the extension from the content type, never from the name', () => {
    expect(classifyFile({ name: 'mislabelled.png', type: 'image/jpeg' })).toMatchObject({
      ext: 'jpg',
      contentType: 'image/jpeg',
    })
  })

  it('lets a decisive non-image MIME override a promising extension', () => {
    expect(classifyFile({ name: 'photo.jpg', type: 'text/plain' })).toEqual({
      ok: false,
      reason: 'not_an_image',
    })
  })

  it('names an image format it cannot take, so the UI can say why', () => {
    expect(classifyFile({ name: 'a.gif', type: 'image/gif' })).toEqual({
      ok: false,
      reason: 'unsupported_image',
    })
    expect(classifyFile({ name: 'a.svg', type: 'image/svg+xml' })).toEqual({
      ok: false,
      reason: 'unsupported_image',
    })
  })
})

describe('classifyFile — the empty-MIME fallback', () => {
  it('falls back to the extension when the shell said nothing', () => {
    for (const type of ['', 'application/octet-stream', 'binary/octet-stream']) {
      expect(classifyFile({ name: 'IMG_0042.JPEG', type })).toEqual({
        ok: true,
        ext: 'jpg',
        contentType: 'image/jpeg',
        decidedBy: 'extension',
      })
      expect(classifyFile({ name: 'shot.webp', type })).toMatchObject({
        ok: true,
        ext: 'webp',
        decidedBy: 'extension',
      })
    }
  })

  it('takes the old JPEG spellings by extension too', () => {
    for (const name of ['a.jpg', 'a.jpeg', 'a.jpe', 'a.jfif']) {
      expect(classifyFile({ name, type: '' })).toMatchObject({ ok: true, ext: 'jpg' })
    }
  })

  it('separates a recognised-but-unsupported image from a non-image', () => {
    for (const name of ['a.heic', 'a.HEIF', 'a.tiff', 'a.dng', 'a.cr2', 'a.avif']) {
      expect(classifyFile({ name, type: '' })).toEqual({ ok: false, reason: 'unsupported_image' })
    }
  })

  it('rejects the litter a Windows folder is full of', () => {
    for (const name of ['Thumbs.db', 'desktop.ini', '.DS_Store', 'notes.txt', 'README', 'a.zip']) {
      expect(classifyFile({ name, type: '' })).toEqual({ ok: false, reason: 'not_an_image' })
    }
  })
})

describe('the ext/content-type unions agree with lib/admin/avatars.ts (ruling A6)', () => {
  it('has exactly the extensions the blob pathname builder accepts', () => {
    const mine = new Set<string>()
    for (const name of ['a.jpg', 'a.png', 'a.webp']) {
      const verdict = classifyFile({ name, type: '' })
      if (verdict.ok) mine.add(verdict.ext)
    }
    expect([...mine].sort()).toEqual([...ADMIN_AVATAR_EXTS].sort())
  })

  it('has exactly the content types the upload token accepts', () => {
    const mine = new Set<string>()
    for (const type of ADMIN_AVATAR_CONTENT_TYPES) {
      const verdict = classifyFile({ name: 'a', type })
      if (verdict.ok) mine.add(verdict.contentType)
    }
    expect([...mine].sort()).toEqual([...ADMIN_AVATAR_CONTENT_TYPES].sort())
  })
})

/* ── The path grammar ─────────────────────────────────────────────────────────────────────── */

describe('normaliseFolderPath', () => {
  it('folds Windows separators, because that is where the folders come from', () => {
    expect(normaliseFolderPath('Faces\\2026\\studio')).toBe('Faces/2026/studio')
    expect(normaliseFolderPath('Faces\\2026/studio')).toBe('Faces/2026/studio')
    expect(normaliseFolderPath('Faces\\')).toBe('Faces')
  })

  it('drops leading, trailing, doubled and empty separators', () => {
    expect(normaliseFolderPath('/a//b/')).toBe('a/b')
    expect(normaliseFolderPath('///')).toBe(NINA_FOLDER_ROOT)
    expect(normaliseFolderPath('')).toBe(NINA_FOLDER_ROOT)
  })

  it('drops "." segments and trims whitespace around every segment', () => {
    expect(normaliseFolderPath('a/./b')).toBe('a/b')
    expect(normaliseFolderPath('  a  /  b  ')).toBe('a/b')
  })

  it('strips the trailing dots and spaces Windows itself cannot represent', () => {
    expect(normaliseFolderPath('Trip 2024. ')).toBe('Trip 2024')
    expect(normaliseFolderPath('a/b.../c')).toBe('a/b/c')
    expect(normaliseFolderPath('a/.../b')).toBe('a/b')
  })

  it('PRESERVES ".." so exactly one function decides its fate', () => {
    expect(normaliseFolderPath('a/../b')).toBe('a/../b')
    expect(normaliseFolderPath('..\\..\\secrets')).toBe('../../secrets')
  })
})

describe('validateFolderPath', () => {
  it('accepts the root and an ordinary path unchanged', () => {
    expect(validateFolderPath('')).toEqual({ ok: true, path: NINA_FOLDER_ROOT })
    expect(validateFolderPath('/Faces/2026/')).toEqual({ ok: true, path: 'Faces/2026' })
    expect(validateFolderPath('Race & Recovery')).toEqual({ ok: true, path: 'Race & Recovery' })
  })

  it('refuses a traversal by its own name', () => {
    expect(validateFolderPath('a/../b')).toEqual({ ok: false, reason: 'traversal', segment: '..' })
    expect(validateFolderPath('../secrets')).toEqual({
      ok: false,
      reason: 'traversal',
      segment: '..',
    })
  })

  it('refuses a pasted absolute Windows path rather than storing its drive letter', () => {
    expect(validateFolderPath('C:\\Users\\me\\Pics')).toEqual({
      ok: false,
      reason: 'bad_segment',
      segment: 'C:',
    })
  })

  it('refuses the reserved characters and control characters', () => {
    for (const bad of ['a<b', 'a>b', 'a"b', 'a|b', 'a?b', 'a*b', 'a\u0000b', 'a\u001fb']) {
      expect(validateFolderPath(bad)).toMatchObject({ ok: false, reason: 'bad_segment' })
    }
  })

  it('accepts exactly MAX_DEPTH and refuses one more', () => {
    expect(validateFolderPath(path(NINA_FOLDER_MAX_DEPTH))).toMatchObject({ ok: true })
    expect(validateFolderPath(path(NINA_FOLDER_MAX_DEPTH + 1))).toEqual({
      ok: false,
      reason: 'too_deep',
      segment: null,
    })
  })

  it('accepts exactly MAX_SEGMENT_CHARS and refuses one more', () => {
    const ok = 'x'.repeat(NINA_FOLDER_MAX_SEGMENT_CHARS)
    expect(validateFolderPath(ok)).toEqual({ ok: true, path: ok })
    const tooLong = 'x'.repeat(NINA_FOLDER_MAX_SEGMENT_CHARS + 1)
    expect(validateFolderPath(tooLong)).toEqual({
      ok: false,
      reason: 'segment_too_long',
      segment: tooLong,
    })
  })

  it('makes the total length the binding bound at full depth', () => {
    const segment = 'x'.repeat(NINA_FOLDER_MAX_SEGMENT_CHARS)
    const maximal = Array.from({ length: NINA_FOLDER_MAX_DEPTH }, () => segment).join('/')
    expect(maximal.length).toBeGreaterThan(NINA_FOLDER_MAX_PATH_CHARS)
    expect(validateFolderPath(maximal)).toEqual({
      ok: false,
      reason: 'path_too_long',
      segment: null,
    })

    const short = 'x'.repeat(NINA_FOLDER_MAX_SEGMENT_CHARS - 1)
    const fits = Array.from({ length: NINA_FOLDER_MAX_DEPTH }, () => short).join('/')
    expect(fits.length).toBeLessThanOrEqual(NINA_FOLDER_MAX_PATH_CHARS)
    expect(validateFolderPath(fits)).toMatchObject({ ok: true })
  })
})

describe('folding and the path helpers', () => {
  it('folds case-insensitively and locale-independently', () => {
    expect(foldFolderPath('Faces/NINA')).toBe('faces/nina')
    expect(foldFolderPath(normaliseFolderPath('Faces\\NINA'))).toBe(
      foldFolderPath(normaliseFolderPath('faces/nina')),
    )
  })

  it('splits, measures and names', () => {
    expect(splitFolderPath('')).toEqual([])
    expect(splitFolderPath('a/b')).toEqual(['a', 'b'])
    expect(folderDepth('')).toBe(0)
    expect(folderDepth('a/b/c')).toBe(3)
    expect(folderName('')).toBe(NINA_FOLDER_ROOT_LABEL)
    expect(folderName('a/b')).toBe('b')
  })

  it('walks up, and stops at the root instead of erroring', () => {
    expect(folderParent('a/b/c')).toBe('a/b')
    expect(folderParent('a')).toBe(NINA_FOLDER_ROOT)
    expect(folderParent(NINA_FOLDER_ROOT)).toBe(NINA_FOLDER_ROOT)
  })

  it('joins with no special case for the root', () => {
    expect(joinFolderPath('', 'a')).toBe('a')
    expect(joinFolderPath('Faces', '')).toBe('Faces')
    expect(joinFolderPath('Faces', '2026\\studio')).toBe('Faces/2026/studio')
    expect(joinFolderPath('', '')).toBe(NINA_FOLDER_ROOT)
  })

  it('lists strict ancestors, shallowest first, root included', () => {
    expect(folderAncestors('a/b/c')).toEqual(['', 'a', 'a/b'])
    expect(folderAncestors('a')).toEqual([''])
    expect(folderAncestors('')).toEqual([])
  })

  it('builds a breadcrumb whose root is a crumb like any other', () => {
    expect(folderBreadcrumbs('Faces/2026')).toEqual([
      { path: '', name: NINA_FOLDER_ROOT_LABEL, depth: 0, isCurrent: false },
      { path: 'Faces', name: 'Faces', depth: 1, isCurrent: false },
      { path: 'Faces/2026', name: '2026', depth: 2, isCurrent: true },
    ])
    expect(folderBreadcrumbs('')).toEqual([
      { path: '', name: NINA_FOLDER_ROOT_LABEL, depth: 0, isCurrent: true },
    ])
  })

  it('does not mistake a name prefix for an ancestor', () => {
    expect(isFolderAncestorOf('a', 'a/b')).toBe(true)
    expect(isFolderAncestorOf('a', 'ab/c')).toBe(false)
    expect(isFolderAncestorOf('A', 'a/b')).toBe(true)
    expect(isFolderAncestorOf('a', 'a')).toBe(false)
    expect(isFolderAncestorOf('', 'a')).toBe(true)
    expect(isFolderAncestorOf('', '')).toBe(false)
    expect(isFolderAncestorOf('a/b', 'a')).toBe(false)
  })

  it('includes the root of the tree in isInFolderTree, unlike the ancestor test', () => {
    // The asymmetry is the whole reason both exist. A recursive delete of `Bali` must take a
    // photo filed exactly at `Bali`; a move of `Bali` into `Bali` is a no-op and not a cycle.
    expect(isInFolderTree('Bali', 'Bali')).toBe(true)
    expect(isFolderAncestorOf('Bali', 'Bali')).toBe(false)
    expect(isInFolderTree('Bali/2024', 'Bali')).toBe(true)
    expect(isInFolderTree('Bali2024', 'Bali')).toBe(false)
    expect(isInFolderTree('Trips', 'Bali')).toBe(false)
    expect(isInFolderTree('BALI\\2024', 'bali')).toBe(true)
  })

  it('makes the album root contain everything, itself included', () => {
    expect(isInFolderTree('', '')).toBe(true)
    expect(isInFolderTree('Trips/Bali', '')).toBe(true)
    expect(isInFolderTree('', 'Trips')).toBe(false)
  })

  it('sanitises one typed segment, and says null when nothing survives', () => {
    expect(sanitiseFolderSegment('  Bali  ')).toBe('Bali')
    expect(sanitiseFolderSegment('Trip 2024. ')).toBe('Trip 2024')
    // A pasted path keeps only its last piece: someone typing `Trips/Bali` into a "folder name"
    // box means `Bali` inside the parent they were on.
    expect(sanitiseFolderSegment('Trips\\Bali')).toBe('Bali')
    for (const nothing of ['', '   ', '.', '..', '...', '. . ']) {
      expect(sanitiseFolderSegment(nothing)).toBeNull()
    }
  })
})

/* ── The dedupe key ───────────────────────────────────────────────────────────────────────── */

describe('sourceKeyFor', () => {
  it('is stable across separator style and casing, because the source is Windows', () => {
    const a = sourceKeyFor({
      folder: 'Faces/Nina',
      filename: 'A.JPG',
      size: 100,
      lastModified: 5000,
    })
    const b = sourceKeyFor({
      folder: 'faces\\nina\\',
      filename: 'a.jpg',
      size: 100,
      lastModified: 5000,
    })
    expect(a).toBe(b)
  })

  it('quantises the timestamp to whole seconds', () => {
    const base = { folder: '', filename: 'a.jpg', size: 100 }
    expect(sourceKeyFor({ ...base, lastModified: 1_700_000_123_000 })).toBe(
      sourceKeyFor({ ...base, lastModified: 1_700_000_123_999 }),
    )
    expect(sourceKeyFor({ ...base, lastModified: 1_700_000_123_000 })).not.toBe(
      sourceKeyFor({ ...base, lastModified: 1_700_000_124_000 }),
    )
  })

  it('distinguishes size, path and folder', () => {
    const base = { folder: 'a', filename: 'x.jpg', size: 100, lastModified: 5000 }
    expect(sourceKeyFor(base)).not.toBe(sourceKeyFor({ ...base, size: 101 }))
    expect(sourceKeyFor(base)).not.toBe(sourceKeyFor({ ...base, filename: 'y.jpg' }))
    expect(sourceKeyFor(base)).not.toBe(sourceKeyFor({ ...base, folder: 'b' }))
  })

  it('puts the path last, so a separator inside a name cannot shift a field', () => {
    const key = sourceKeyFor({ folder: '', filename: 'a|b.jpg', size: 10, lastModified: 5000 })
    expect(key.startsWith(`${NINA_SOURCE_KEY_VERSION}|10|5|`)).toBe(true)
    expect(key.slice(`${NINA_SOURCE_KEY_VERSION}|10|5|`.length)).toBe('a|b.jpg')
  })

  it('never emits NaN, and stays inside the declared bound', () => {
    expect(
      sourceKeyFor({ folder: '', filename: 'a.jpg', size: Number.NaN, lastModified: Number.NaN }),
    ).toBe(`${NINA_SOURCE_KEY_VERSION}|0|0|a.jpg`)
    expect(sourceKeyFor({ folder: '', filename: 'a.jpg', size: -5, lastModified: -5 })).toBe(
      `${NINA_SOURCE_KEY_VERSION}|0|0|a.jpg`,
    )

    const worst = sourceKeyFor({
      folder: 'x'.repeat(NINA_FOLDER_MAX_PATH_CHARS),
      filename: 'y'.repeat(NINA_FILENAME_MAX_CHARS),
      size: Number.MAX_SAFE_INTEGER,
      lastModified: Number.MAX_SAFE_INTEGER,
    })
    expect(worst.length).toBeLessThanOrEqual(NINA_SOURCE_KEY_MAX_CHARS)
  })
})

/* ── The diff: "upload only the new folders and files" ────────────────────────────────────── */

describe('planFolderUpload — the requirement', () => {
  const dropped = [
    walked('Faces/a.jpg'),
    walked('Faces/2026/b.png', { type: 'image/png' }),
    walked('Faces/2026/c.webp', { type: '' }),
  ]

  it('uploads everything the first time, and names the folders it creates', () => {
    const result = plan(NINA_FOLDER_ROOT, dropped)
    expect(result.upload.map((u) => `${u.folder}/${u.filename}`)).toEqual([
      'Faces/a.jpg',
      'Faces/2026/b.png',
      'Faces/2026/c.webp',
    ])
    expect(result.folders).toEqual(['Faces', 'Faces/2026'])
    expect(result.counts).toEqual({ total: 3, upload: 3, existing: 0, rejected: 0, refused: 0 })
  })

  it('uploads NOTHING when the same folder is dropped again', () => {
    const first = plan(NINA_FOLDER_ROOT, dropped)
    const again = plan(
      NINA_FOLDER_ROOT,
      dropped,
      manifestOf(...first.upload.map((u) => u.sourceKey)),
    )
    expect(again.upload).toEqual([])
    expect(again.folders).toEqual([])
    expect(again.existing.map((e) => e.reason)).toEqual([
      'already_uploaded',
      'already_uploaded',
      'already_uploaded',
    ])
    expect(again.counts).toEqual({ total: 3, upload: 0, existing: 3, rejected: 0, refused: 0 })
  })

  it('uploads exactly the new files when the folder grew, and declares the whole chain', () => {
    const first = plan(NINA_FOLDER_ROOT, dropped)
    const grown = [
      ...dropped,
      walked('Faces/2027/d.jpg'),
      walked('Faces/2027/e.jpg'),
      walked('Faces/f.jpg'),
    ]
    const result = plan(
      NINA_FOLDER_ROOT,
      grown,
      manifestOf(...first.upload.map((u) => u.sourceKey)),
    )
    expect(result.upload.map((u) => u.filename)).toEqual(['d.jpg', 'e.jpg', 'f.jpg'])
    // `Faces` is named again even though it already holds photographs. `ManifestEntryLike` is
    // `{ sourceKey }` and nothing else, so this function is never told which folders exist — and
    // it reports the full ancestor chain of every row it uploads on purpose (handoff 5: declaring
    // `a/b` alongside `a/b/c` is what stops `a/b` vanishing when `c` is deleted). Declaring a
    // folder that already exists is idempotent, so a superset here is correct, not sloppy.
    expect(result.folders).toEqual(['Faces', 'Faces/2027'])
    expect(result.counts.existing).toBe(3)
  })

  it('treats an edited file as new, because its timestamp moved', () => {
    const first = plan(NINA_FOLDER_ROOT, dropped)
    const edited = [walked('Faces/a.jpg', { lastModified: 1_800_000_000_000 })]
    const result = plan(
      NINA_FOLDER_ROOT,
      edited,
      manifestOf(...first.upload.map((u) => u.sourceKey)),
    )
    expect(result.upload).toHaveLength(1)
  })

  it('ignores manifest rows that predate the dedupe key instead of matching them', () => {
    const result = planFolderUpload({
      base: NINA_FOLDER_ROOT,
      files: dropped,
      manifest: [{ sourceKey: null }, { sourceKey: '' }],
      maxBytes: ADMIN_AVATAR_MAX_UPLOAD_BYTES,
    })
    expect(result.upload).toHaveLength(3)
  })

  it('folds a file dropped twice in one gesture, and says which reason it was', () => {
    const result = plan(NINA_FOLDER_ROOT, [walked('Faces/a.jpg'), walked('Faces/a.jpg')])
    expect(result.upload).toHaveLength(1)
    expect(result.existing.map((e) => e.reason)).toEqual(['duplicate_in_batch'])
  })

  it('files the drop under the folder it landed in', () => {
    const result = plan('Album 2026', [walked('Faces\\2026\\b.png', { type: 'image/png' })])
    expect(result.upload[0]?.folder).toBe('Album 2026/Faces/2026')
    expect(result.folders).toEqual(['Album 2026/Faces', 'Album 2026/Faces/2026'])
  })

  it('does not confuse the same folder dropped at two different bases', () => {
    const atRoot = plan(NINA_FOLDER_ROOT, dropped)
    const nested = plan('Archive', dropped, manifestOf(...atRoot.upload.map((u) => u.sourceKey)))
    expect(nested.upload).toHaveLength(3)
  })

  it('handles a bare picked file with no relative path at all', () => {
    const result = plan('Faces', [{ ...walked('a.jpg'), relativePath: '' }])
    expect(result.upload[0]?.folder).toBe('Faces')
    expect(result.folders).toEqual([])
  })

  it('hands the caller its own object back, so the File can ride along', () => {
    const result = plan(NINA_FOLDER_ROOT, [walked('a.jpg', { tag: 'the-file' })])
    expect(result.upload[0]?.source.tag).toBe('the-file')
  })
})

describe('planFolderUpload — "only image files", and the refusals', () => {
  it('rejects the non-images silently and by kind, ahead of every other check', () => {
    const result = plan(NINA_FOLDER_ROOT, [
      walked('Faces/a.jpg'),
      walked('Faces/Thumbs.db', { type: '' }),
      walked('Faces/desktop.ini', { type: '' }),
      walked('Faces/.DS_Store', { type: '' }),
      walked('Faces/notes.txt', { type: 'text/plain' }),
      walked('Faces/old.gif', { type: 'image/gif' }),
      walked('Faces/phone.heic', { type: '' }),
    ])
    expect(result.upload.map((u) => u.filename)).toEqual(['a.jpg'])
    expect(result.rejected.map((r) => [r.name, r.reason])).toEqual([
      ['Thumbs.db', 'not_an_image'],
      ['desktop.ini', 'not_an_image'],
      ['.DS_Store', 'not_an_image'],
      ['notes.txt', 'not_an_image'],
      ['old.gif', 'unsupported_image'],
      ['phone.heic', 'unsupported_image'],
    ])
    expect(result.refused).toEqual([])
  })

  it('reads a non-image as "not an image" even when its folder is unusable', () => {
    const deep = `${path(NINA_FOLDER_MAX_DEPTH + 2)}/Thumbs.db`
    const result = plan(NINA_FOLDER_ROOT, [walked(deep, { type: '' })])
    expect(result.rejected.map((r) => r.reason)).toEqual(['not_an_image'])
    expect(result.refused).toEqual([])
  })

  it('refuses an image whose destination breaks the grammar, with the grammar reason', () => {
    const tooDeep = plan(NINA_FOLDER_ROOT, [walked(`${path(NINA_FOLDER_MAX_DEPTH + 1)}/a.jpg`)])
    expect(tooDeep.refused.map((r) => r.reason)).toEqual(['too_deep'])

    const traversal = plan(NINA_FOLDER_ROOT, [walked('a/../b/c.jpg')])
    expect(traversal.refused.map((r) => r.reason)).toEqual(['traversal'])

    const longSegment = plan(NINA_FOLDER_ROOT, [
      walked(`${'x'.repeat(NINA_FOLDER_MAX_SEGMENT_CHARS + 1)}/a.jpg`),
    ])
    expect(longSegment.refused.map((r) => r.reason)).toEqual(['segment_too_long'])
  })

  it('accepts a destination at exactly MAX_DEPTH', () => {
    const result = plan(NINA_FOLDER_ROOT, [walked(`${path(NINA_FOLDER_MAX_DEPTH)}/a.jpg`)])
    expect(result.upload).toHaveLength(1)
    expect(folderDepth(result.upload[0]?.folder ?? '')).toBe(NINA_FOLDER_MAX_DEPTH)
  })

  it('refuses a zero-byte file, which would upload a blob nothing can decode', () => {
    const result = plan(NINA_FOLDER_ROOT, [walked('a.jpg', { size: 0 })])
    expect(result.refused.map((r) => r.reason)).toEqual(['empty_file'])
  })

  it('refuses over the cap it was given, and accepts exactly the cap', () => {
    const over = plan(NINA_FOLDER_ROOT, [
      walked('big.jpg', { size: ADMIN_AVATAR_MAX_UPLOAD_BYTES + 1 }),
    ])
    expect(over.refused.map((r) => r.reason)).toEqual(['too_large'])

    const exact = plan(NINA_FOLDER_ROOT, [
      walked('big.jpg', { size: ADMIN_AVATAR_MAX_UPLOAD_BYTES }),
    ])
    expect(exact.upload).toHaveLength(1)
  })

  it('refuses an unnamed file and a name that is only dots', () => {
    const result = plan(NINA_FOLDER_ROOT, [
      { relativePath: '', name: '', type: 'image/jpeg', size: 10, lastModified: 1 },
      { relativePath: '', name: '..', type: 'image/jpeg', size: 10, lastModified: 1 },
    ])
    expect(result.refused.map((r) => r.reason)).toEqual(['unnamed', 'unnamed'])
  })

  it('refuses a name that is too long or carries a reserved character', () => {
    const long = plan(NINA_FOLDER_ROOT, [walked(`${'x'.repeat(NINA_FILENAME_MAX_CHARS + 1)}.jpg`)])
    expect(long.refused.map((r) => r.reason)).toEqual(['name_too_long'])

    const bad = plan(NINA_FOLDER_ROOT, [{ ...walked('a.jpg'), name: 'a|b.jpg' }])
    expect(bad.refused.map((r) => r.reason)).toEqual(['bad_segment'])
  })

  it('recovers the name from the walked path when the entry has none', () => {
    const result = plan(NINA_FOLDER_ROOT, [
      {
        relativePath: 'Faces\\2026\\b.png',
        name: '',
        type: 'image/png',
        size: 10,
        lastModified: 1,
      },
    ])
    expect(result.upload[0]).toMatchObject({ folder: 'Faces/2026', filename: 'b.png' })
  })

  it('says so when a whole drop uploads nothing', () => {
    const result = plan(NINA_FOLDER_ROOT, [walked('Thumbs.db', { type: '' })])
    expect(result.counts).toEqual({ total: 1, upload: 0, existing: 0, rejected: 1, refused: 0 })
  })
})

/* ── The tree ─────────────────────────────────────────────────────────────────────────────── */

describe('folderCounts', () => {
  it('merges casings, keeps the first spelling, and folds null to the root', () => {
    const rows = [
      { folder: 'Faces' },
      { folder: 'faces' },
      { folder: null },
      { folder: 'FACES' },
      { folder: 'Faces\\2026\\' },
    ]
    expect(folderCounts(rows)).toEqual([
      { folder: 'Faces', count: 3 },
      { folder: NINA_FOLDER_ROOT, count: 1 },
      { folder: 'Faces/2026', count: 1 },
    ])
  })
})

describe('buildTree', () => {
  const entries: FolderCount[] = [
    { folder: 'Faces/2026', count: 3 },
    { folder: 'faces/2027', count: 2 },
    { folder: null, count: 1 },
  ]

  it('returns a single root that is a folder like any other', () => {
    const root = buildTree(entries)
    expect(root.path).toBe(NINA_FOLDER_ROOT)
    expect(root.name).toBe(NINA_FOLDER_ROOT_LABEL)
    expect(root.depth).toBe(0)
    expect(root.ownCount).toBe(1)
  })

  it('synthesizes the intermediate folder the query never returned', () => {
    const root = buildTree(entries)
    expect(root.children.map((c) => c.path)).toEqual(['Faces'])
    const faces = root.children[0]
    expect(faces?.ownCount).toBe(0)
    expect(faces?.depth).toBe(1)
    expect(faces?.children.map((c) => c.path)).toEqual(['Faces/2026', 'Faces/2027'])
  })

  it('counts descendants, so a collapsed folder does not read as empty', () => {
    const root = buildTree(entries)
    expect(root.totalCount).toBe(6)
    expect(root.children[0]?.totalCount).toBe(5)
    expect(root.children[0]?.children[0]?.totalCount).toBe(3)
  })

  it('keeps the first casing, for the folder and for every child path', () => {
    const root = buildTree(entries)
    const grown = root.children[0]?.children.map((c) => c.path)
    expect(grown).toEqual(['Faces/2026', 'Faces/2027'])
  })

  it('orders children deterministically and case-insensitively', () => {
    const root = buildTree([
      { folder: 'zeta', count: 1 },
      { folder: 'Alpha', count: 1 },
      { folder: 'beta', count: 1 },
    ])
    expect(root.children.map((c) => c.name)).toEqual(['Alpha', 'beta', 'zeta'])
  })

  it('adds up two entries that differ only in casing', () => {
    const root = buildTree([
      { folder: 'Faces', count: 2 },
      { folder: 'faces', count: 3 },
    ])
    expect(root.children).toHaveLength(1)
    expect(root.children[0]).toMatchObject({ path: 'Faces', ownCount: 5, totalCount: 5 })
  })

  it('builds an empty album as a bare root', () => {
    const root = buildTree([])
    expect(root.children).toEqual([])
    expect(root.totalCount).toBe(0)
  })
})

describe('findFolderNode', () => {
  const root = buildTree([
    { folder: 'Faces/2026', count: 3 },
    { folder: 'Faces/2027', count: 2 },
  ])

  it('finds the root, a branch and a leaf, ignoring casing and separator style', () => {
    expect(findFolderNode(root, '')?.path).toBe(NINA_FOLDER_ROOT)
    expect(findFolderNode(root, 'faces')?.path).toBe('Faces')
    expect(findFolderNode(root, 'FACES\\2027')?.path).toBe('Faces/2027')
  })

  it('returns null for a folder that is not in the tree', () => {
    expect(findFolderNode(root, 'Faces/2028')).toBeNull()
  })
})
