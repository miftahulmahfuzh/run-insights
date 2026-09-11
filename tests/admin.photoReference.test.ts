import { readFileSync } from 'node:fs'
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
 * R10's model half — `photoReferenceModel.ts`'s pure functions, exercised directly — plus the
 * handful of the picker's properties that no render, no type, and no lint rule can see: the
 * `'use client'` boundary (erases before runtime), the `eslint-disable` comment's reason (a
 * comment compiles away), and the absence of certain imports (`next/image`, `@/lib/db`, a Server
 * Action — nothing a render can observe the lack of).
 *
 * This file used to also assert the picker's rendered markup — classes, `aria-*`, `loading`,
 * visible text — as JSX source text, on the reasoning that `environment: 'node'` vitest has no
 * DOM. That reasoning no longer holds: happy-dom and React Testing Library are wired in (see
 * `tests/admin.file-explorer` and this component's own `PhotoReferencePicker.test.tsx`), and 29
 * `readFileSync`/`toContain` assertions that never rendered anything were exposed as a second
 * "string-matching stood in for coverage" case, after `admin.mediaPane.test.ts`. Every one of
 * those assertions now has a real DOM equivalent in `PhotoReferencePicker.test.tsx`; only what a
 * render genuinely cannot express remains here. `tests/admin.shell.test.ts` is the precedent for
 * reading only the parts of a source that are code: this file's components carry docstrings that
 * QUOTE the very field names they must not render, and a whole-file `not.toContain` would fail on
 * the explanation of the property it is asserting.
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
    // here and there must never be one. A tile that never receives a date cannot render one. This
    // is a TS-interface check, invisible to any render — the interface erases before runtime, so
    // there is no DOM equivalent to move it to.
    const body = /export interface PhotoReferenceItem \{([\s\S]*?)\n\}/.exec(model)?.[1] ?? ''
    const fields = [...codeLines(body).matchAll(/^\s*(\w+)\??:/gm)].map((m) => m[1])
    expect(fields).toEqual(['key', 'url', 'thumbUrl'])
  })

  it('names no caption field anywhere in the tile markup', () => {
    // A source-text check, deliberately kept alongside the type check above: the interface having
    // only three fields makes referencing a fourth a compile error, so this mostly restates that
    // guarantee — but it is cheap and it is the only thing that would also catch an `as any` cast.
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

  it('names PHOTO_REFERENCE_TILE_LABEL and photoReferenceLabel — pure functions, not markup', () => {
    expect(PHOTO_REFERENCE_TILE_LABEL).toBe('Nina photo')
    // The same phrase for both sets, so the announcement carries no provenance either.
    expect(photoReferenceLabel(0)).toBe('Nina photo 1')
  })
})

/*
 * The tile's rendered text, its `aria-label`/`aria-pressed` wiring, `loading="lazy"`, and its
 * Tailwind classes (`aspect-square`, `object-cover`, `gap-[3px]`, the `minmax()` tap-target floor,
 * no `border`, no `bg-accent-soft`) used to be asserted here as JSX source text — 29
 * `readFileSync`/`toContain` assertions that never rendered anything, so a conditional that only
 * LOOKED like it applied a class or stripped a string would still have passed. They are now
 * asserted on the actual rendered DOM in `PhotoReferencePicker.test.tsx`, which is the only place
 * they can catch that failure mode. What remains below is only what a render genuinely cannot
 * express: the `'use client'` boundary (a build-time-only marker, invisible to any runtime
 * render), the `eslint-disable` comment's reason, and the absence of imports.
 */

describe('the grid is the iOS idiom, and it is bounded', () => {
  it('is a client component whose model is not', () => {
    // A directive is invisible to a runtime render — Vitest never sees the RSC/client boundary
    // either way — so this stays a source-text check; there is no DOM equivalent.
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

  it('cannot draw a tile below the app minimum tap target', () => {
    // The constant itself, not the class it produces — `PhotoReferencePicker.test.tsx` renders the
    // grid and asserts the class literally carries this number.
    expect(PHOTO_REFERENCE_MIN_TILE_PX).toBeGreaterThanOrEqual(44)
  })

  it('carries the eslint-disable reason for the plain <img>, and imports no next/image', () => {
    // The DISABLE COMMENT and the IMPORT LIST are both invisible at runtime — a comment compiles
    // away and an unused import can't be observed by rendering — so these stay source-text checks.
    // `loading="lazy"` itself moved to `PhotoReferencePicker.test.tsx`, which can observe it.
    expect(tileRaw).toContain('eslint-disable-next-line @next/next/no-img-element')
    expect(tileRaw).toContain('no thumbnail')
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

describe('the mount in ImageGenPanel', () => {
  it('mounts the picker, unconditionally — phases 4 and 5 have both long since landed', () => {
    const panel = read('components/admin/ImageGenPanel.tsx')
    expect(panel).toContain('<PhotoReferencePicker')
    expect(panel).toContain("from '@/components/admin/PhotoReferencePicker'")
    expect(panel).not.toContain('SEAM — PHASE 5')
  })
})
