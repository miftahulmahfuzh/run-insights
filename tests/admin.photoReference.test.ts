import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import {
  nextPhotoReferenceValue,
  PHOTO_REFERENCE_MIN_TILE_PX,
  PHOTO_REFERENCE_NONE,
  PHOTO_REFERENCE_REVEAL_STEP,
  PHOTO_REFERENCE_TILE_LABEL,
  photoReferenceIndex,
  photoReferenceLabel,
  photoReferenceReveal,
  photoReferenceTileSrc,
  photoReferenceView,
} from '@/components/admin/photoReferenceModel'
import type { PhotoReferenceItem } from '@/components/admin/photoReferenceModel'

/**
 * R10's UI half: the picker's rules, and the two properties of its markup that no type and no lint
 * rule can see — that a tile carries no caption, and that a tile is never smaller than the app's
 * minimum tap target.
 *
 * `tests/admin.shell.test.ts` is the precedent for asserting a component's markup as text and
 * states the reason: a media query and an absent `<span>` are invisible to `tsc` and to `eslint`,
 * vitest runs `environment: 'node'` with no jsdom, and so it is asserted here or not at all. It is
 * also the precedent for reading only the parts of a source that are code: this file's components
 * carry docstrings that QUOTE the very field names they must not render, and a whole-file
 * `not.toContain` would fail on the explanation of the property it is asserting.
 */

const ROOT = fileURLToPath(new URL('../', import.meta.url))
const read = (path: string) => readFileSync(`${ROOT}${path}`, 'utf8')

const model = read('components/admin/photoReferenceModel.ts')
const picker = read('components/admin/PhotoReferencePicker.tsx')

/**
 * Executable lines only. The rule is `scripts/check-client-secret-boundary.mjs`'s `isComment`, plus
 * `{/*` for a JSX comment's opening line — which is why every continuation line inside a JSX
 * comment in this component starts with `*`.
 */
function codeLines(source: string): string {
  return source
    .split('\n')
    .filter((line) => {
      const trimmed = line.trim()
      return !(
        trimmed.startsWith('//') ||
        trimmed.startsWith('*') ||
        trimmed.startsWith('/*') ||
        trimmed.startsWith('{/*')
      )
    })
    .join('\n')
}

/**
 * Every class this component asks for: the `className="…"` literals and the string literals inside
 * `className={cn(…)}`. Class ORDER is never asserted — `prettier-plugin-tailwindcss` owns it and a
 * test that fights the formatter is a test that gets deleted (`tests/admin.shell.test.ts:20-27`).
 */
function classNames(source: string): string {
  const attrs = [...source.matchAll(/className="([^"]*)"/g)].map((m) => m[1] ?? '')
  const dynamic = [...source.matchAll(/className=\{cn\(([\s\S]*?)\)\}/g)].map((m) => m[1] ?? '')
  return [...attrs, ...dynamic].join(' ')
}

/**
 * The tile: one `<li>`, which is the whole of what R10 says must carry no caption.
 *
 * Two forms on purpose. `tileRaw` is what is written, and is what the two assertions ABOUT a
 * comment read (`eslint-disable-next-line` is itself a comment, so stripping comments would strip
 * the thing being asserted). `tile` is the executable half, and is what every "must not name a
 * caption field" assertion reads — the docstrings above deliberately quote those field names in
 * order to forbid them, and `tests/admin.shell.test.ts:36-46` records what happens to a guard that
 * fails on its own explanation.
 */
const tileRaw = picker.slice(picker.indexOf('<li key={tile.key}'), picker.indexOf('</li>'))
const tile = codeLines(tileRaw)

const items: PhotoReferenceItem[] = [
  { key: 'album:a1', url: 'https://blob/a1.png', thumbUrl: 'https://blob/a1-thumb.jpg' },
  { key: 'chat:c1', url: 'https://blob/c1.png', thumbUrl: null },
  { key: 'chat:c2', url: 'https://blob/c2.png', thumbUrl: '' },
]

describe('photoReferenceTileSrc — the album has thumbnails and the chat set has none', () => {
  it('prefers the derived thumbnail when the row has one', () => {
    expect(photoReferenceTileSrc(items[0]!)).toBe('https://blob/a1-thumb.jpg')
  })

  it('falls back to the original for a chat photograph, which never has one', () => {
    expect(photoReferenceTileSrc(items[1]!)).toBe('https://blob/c1.png')
  })

  it('treats an empty string as absent, not as a URL', () => {
    // A `''` column crossing the serialization boundary would otherwise render a broken image.
    expect(photoReferenceTileSrc(items[2]!)).toBe('https://blob/c2.png')
  })
})

describe('photoReferenceIndex / nextPhotoReferenceValue — one, or none', () => {
  it('finds the stored selection by key and never parses it', () => {
    expect(photoReferenceIndex(items, 'chat:c1')).toBe(1)
  })

  it('reads the empty value as nothing chosen', () => {
    expect(PHOTO_REFERENCE_NONE).toBe('')
    expect(photoReferenceIndex(items, PHOTO_REFERENCE_NONE)).toBeNull()
  })

  it('reads a key that is not in the list as nothing chosen', () => {
    expect(photoReferenceIndex(items, 'album:deleted')).toBeNull()
  })

  it('selects on the first tap and clears on the second', () => {
    expect(nextPhotoReferenceValue(PHOTO_REFERENCE_NONE, 'chat:c1')).toBe('chat:c1')
    expect(nextPhotoReferenceValue('chat:c1', 'chat:c1')).toBe(PHOTO_REFERENCE_NONE)
  })

  it('switches rather than accumulates — selection is single', () => {
    expect(nextPhotoReferenceValue('chat:c1', 'album:a1')).toBe('album:a1')
  })
})

describe('photoReferenceReveal — bounded, and never hiding the selection', () => {
  it('never draws more tiles than there are rows', () => {
    expect(photoReferenceReveal(PHOTO_REFERENCE_REVEAL_STEP, 3, null)).toBe(3)
  })

  it('clamps UP so the selected photograph is always on screen', () => {
    // The bug this prevents: a saved selection at index 60 of a 120-row page would be invisible
    // until "Show more", and the grid would look unset while the form said otherwise.
    expect(photoReferenceReveal(10, 120, 60)).toBe(61)
  })

  it('grows by a step and stops at the end', () => {
    expect(photoReferenceReveal(PHOTO_REFERENCE_REVEAL_STEP * 2, 60, null)).toBe(60)
  })

  it('answers 0 for an empty list and survives garbage', () => {
    expect(photoReferenceReveal(PHOTO_REFERENCE_REVEAL_STEP, 0, null)).toBe(0)
    expect(photoReferenceReveal(Number.NaN, 10, null)).toBe(10)
    expect(photoReferenceReveal(-5, 10, null)).toBe(1)
  })
})

describe('photoReferenceView', () => {
  it('labels tiles 1-based and marks exactly one selected', () => {
    const view = photoReferenceView({ items, value: 'chat:c1', reveal: 48, total: 3 })
    expect(view.tiles.map((t) => t.label)).toEqual([
      `${PHOTO_REFERENCE_TILE_LABEL} 1`,
      `${PHOTO_REFERENCE_TILE_LABEL} 2`,
      `${PHOTO_REFERENCE_TILE_LABEL} 3`,
    ])
    expect(view.tiles.filter((t) => t.selected)).toHaveLength(1)
    expect(view.selectedIndex).toBe(1)
    expect(view.selectedLabel).toBe(photoReferenceLabel(1))
    expect(view.missing).toBe(false)
  })

  it('says nothing is selected, and says nothing is missing, when nothing was chosen', () => {
    const view = photoReferenceView({ items, value: PHOTO_REFERENCE_NONE, reveal: 48, total: 3 })
    expect(view.selectedIndex).toBeNull()
    expect(view.selectedLabel).toBeNull()
    expect(view.missing).toBe(false)
    expect(view.tiles.some((t) => t.selected)).toBe(false)
  })

  it('reports a saved selection that is no longer in the list, and selects nothing', () => {
    // `/admin/photos` can remove a chat photograph and the album manager can delete an album row;
    // the same state also occurs with nothing deleted, when the photograph is older than this page.
    const view = photoReferenceView({ items, value: 'chat:gone', reveal: 48, total: 3 })
    expect(view.missing).toBe(true)
    expect(view.selectedIndex).toBeNull()
    expect(view.tiles.some((t) => t.selected)).toBe(false)
  })

  it('counts what the union holds beyond this page, and never goes negative', () => {
    expect(photoReferenceView({ items, value: '', reveal: 48, total: 300 }).hidden).toBe(297)
    expect(photoReferenceView({ items, value: '', reveal: 48, total: 0 }).hidden).toBe(0)
    expect(photoReferenceView({ items, value: '', reveal: 48, total: Number.NaN }).hidden).toBe(0)
  })

  it('carries the thumbnail-or-original decision into the tile', () => {
    const view = photoReferenceView({ items, value: '', reveal: 48, total: 3 })
    expect(view.tiles.map((t) => t.src)).toEqual([
      'https://blob/a1-thumb.jpg',
      'https://blob/c1.png',
      'https://blob/c2.png',
    ])
  })

  it('renders an empty list as an empty view rather than throwing', () => {
    const view = photoReferenceView({ items: [], value: 'chat:c1', reveal: 48, total: 0 })
    expect(view.tiles).toEqual([])
    expect(view.revealed).toBe(0)
    expect(view.missing).toBe(true)
  })
})

describe('invariant 5 — "without any captions", enforced by the shape', () => {
  it('gives PhotoReferenceItem exactly three fields', () => {
    // The rule `lib/nina/chatphotos.ts:13-17` states for its own type: there is no caption field
    // here and there must never be one. A tile that never receives a date cannot render one.
    const body = /export interface PhotoReferenceItem \{([\s\S]*?)\n\}/.exec(model)?.[1] ?? ''
    const fields = [...codeLines(body).matchAll(/^\s*(\w+)\??:/gm)].map((m) => m[1])
    expect(fields).toEqual(['key', 'url', 'thumbUrl'])
  })

  it('names no caption field anywhere in the tile markup', () => {
    for (const forbidden of [
      'createdAt',
      'filename',
      'description',
      'folder',
      'pathname',
      'prompt',
      'sortOrder',
      'isCurrent',
      'side',
    ]) {
      expect(tile, `the tile must not reach for ${forbidden}`).not.toContain(forbidden)
    }
  })

  it('renders no text and no provenance badge in the tile — only the check glyph', () => {
    // `ChatPhotoGrid`'s tile ends with `{photo.createdAt.slice(0, 10)}`; this one has no text node
    // at all beyond the aria-hidden check, and nothing says "album" or "chat" or "hers".
    expect(tile).not.toContain('slice(0, 10)')
    expect(tile).not.toContain('Hers')
    for (const word of ['album', 'Album', 'chat', 'Chat']) {
      expect(tile, `the tile must not announce the set (${word})`).not.toContain(word)
    }
    expect(tile).toContain('alt=""')
  })

  it('names the tile without describing it, and announces its pressed state', () => {
    expect(tile).toContain('aria-label={tile.label}')
    expect(tile).toContain('aria-pressed={tile.selected}')
    expect(PHOTO_REFERENCE_TILE_LABEL).toBe('Nina photo')
    // The same phrase for both sets, so the announcement carries no provenance either.
    expect(photoReferenceLabel(0)).toBe('Nina photo 1')
  })
})

describe('the grid is the iOS idiom, and it is bounded', () => {
  const classes = classNames(picker)

  it('is a client component whose model is not', () => {
    expect(picker.startsWith("'use client'")).toBe(true)
    /*
     * No directive on the model, so a Server Component can import its type while mapping rows.
     *
     * Asserted over `codeLines` and over the first line, NOT over the whole file: the model's
     * header explains at length why it carries no directive, so it quotes the literal, and this
     * file's own header records what happens to a guard that fails on its own explanation. Both
     * halves together are stricter than the whole-file substring they replace — a directive is
     * only a directive as the leading statement, and `codeLines` covers every other position.
     */
    expect(model.startsWith("'use client'")).toBe(false)
    expect(codeLines(model)).not.toContain("'use client'")
  })

  it('draws square tiles with no card chrome and near-zero gutters', () => {
    expect(classes).toContain('aspect-square')
    expect(classes).toContain('object-cover')
    expect(classes).toContain('gap-[3px]')
    // No per-tile border and no padded card — `ChatPhotoGrid`'s tile is deliberately not reused.
    expect(classes).not.toContain('border')
    expect(classes).not.toContain('bg-accent-soft')
  })

  it('cannot draw a tile below the app minimum tap target', () => {
    // `docs/design-brief.md`'s 44 pt floor, on a grid that is dense by requirement: `auto-fill`
    // drops a column rather than shrink a tile past this number.
    expect(PHOTO_REFERENCE_MIN_TILE_PX).toBeGreaterThanOrEqual(44)
    expect(classes).toContain(`minmax(${PHOTO_REFERENCE_MIN_TILE_PX}px,1fr)`)
  })

  it('loads lazily and un-optimised, as this repo has already ruled for Blob photos', () => {
    expect(tile).toContain('loading="lazy"')
    // `tileRaw`, not `tile`: the disable IS a comment, and the reason must travel with it.
    expect(tileRaw).toContain('eslint-disable-next-line @next/next/no-img-element')
    expect(tileRaw).toContain('no thumbnail')
    /*
     * `codeLines`, not the whole file: the header CITES `next/image` in order to record that this
     * repo has already ruled against it for Blob-hosted photographs, and the property being
     * asserted is that nothing IMPORTS it. Same rule as the directive assertion above.
     */
    expect(codeLines(picker)).not.toContain('next/image')
  })

  it('reads nothing and writes nothing', () => {
    const code = codeLines(picker)
    expect(code).not.toContain('@/lib/db')
    expect(code).not.toContain('@/lib/nina/queries')
    expect(code).not.toContain("'use server'")
    expect(code).not.toContain('Action(')
    expect(code).not.toContain('useEffect')
  })
})

describe('the mount at phase 4 seam', () => {
  it('replaces the seam with the picker once ImageGenPanel exists', () => {
    /*
     * Phases 4 and 5 run in the same wave, so this file may be read before the panel exists. The
     * guard is the concurrency, not the requirement: when the panel is there it must mount the
     * picker and must no longer carry this phase's seam marker. Once phase 4 has landed the
     * reconciler may drop the `existsSync` and assert unconditionally.
     */
    const path = 'components/admin/ImageGenPanel.tsx'
    if (!existsSync(`${ROOT}${path}`)) return
    const panel = read(path)
    expect(panel).toContain('<PhotoReferencePicker')
    expect(panel).toContain("from '@/components/admin/PhotoReferencePicker'")
    expect(panel).not.toContain('SEAM — PHASE 5')
  })
})
