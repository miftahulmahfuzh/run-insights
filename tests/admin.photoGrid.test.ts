import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

/**
 * R4's borderless sheet, pinned where it landed: `components/admin/explorer/PhotoGrid.tsx`.
 *
 * `tests/admin.photoReference.test.ts` pins the same recipe over `PhotoReferencePicker.tsx` and is
 * the reason THIS file exists rather than an extension of that one: that suite is scoped to the
 * picker by its `read()` paths, deliberately, so the explorer could mirror the recipe without
 * ever editing the picker (the image-collection set's invariant 9). The mirror is therefore pinned
 * here, with the same helpers and the same reasons — a class list and an absent caption are
 * invisible to `tsc` and to `eslint`, vitest runs `environment: 'node'` with no jsdom, so it is
 * asserted here or not at all.
 *
 * Class ORDER is never asserted as such — `prettier-plugin-tailwindcss` owns it and a test that
 * fights the formatter is a test that gets deleted (`tests/admin.shell.test.ts:20-27`). Where two
 * utilities must be adjacent to be matchable (`rounded-pill bg-ink`), the shape asserted is one
 * `PhotoReferencePicker.tsx` already ships in its formatted form, so the sorter produces it rather
 * than breaking it.
 */

const ROOT = fileURLToPath(new URL('../', import.meta.url))
const read = (path: string) => readFileSync(`${ROOT}${path}`, 'utf8')

const grid = read('components/admin/explorer/PhotoGrid.tsx')

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

/** One tile of the sheet, raw and comment-stripped. */
const tileRaw = grid.slice(grid.indexOf('<li key={photo.id}'), grid.indexOf('</li>'))
const tile = codeLines(tileRaw)

/** The whole sheet, `<ul>` through `</ul>`. */
const sheet = grid.slice(grid.indexOf('<ul'), grid.indexOf('</ul>'))

describe('the explorer grid is the Photo-reference idiom (R4)', () => {
  it('is a client component', () => {
    expect(grid.startsWith("'use client'")).toBe(true)
  })

  it('draws one borderless sheet: near-zero gutters, one rounded clipped surface', () => {
    // The picker's recipe: the sheet carries the rounding and the clipping ONCE, the gutters are
    // hairlines cut into it, and a tile is a square on a mid-grey bed that shows while bytes load.
    expect(sheet).toContain('gap-[3px]')
    expect(sheet).toContain('overflow-hidden rounded-field')
    expect(tile).toContain('aspect-square')
    expect(tile).toContain('bg-ink-3/20')
    expect(tile).toContain('object-cover')
  })

  it('keeps no card chrome on a tile: no border, no chip, no padding, no accent wash', () => {
    // Scoped to the tile, NOT the file: the pager below the sheet keeps its `border-t` rule and
    // the empty state keeps its padded button, so the picker's whole-file `not.toContain('border')`
    // is not available here.
    expect(tile).not.toContain('border')
    expect(tile).not.toContain('rounded-chip')
    // `\b`-bounded, `tests/admin.shell.test.ts`'s pattern for the same trap: a bare substring
    // `'p-1'` would match the corner badge's `top-1`, which is a position, not a padding.
    expect(tile).not.toMatch(/\bp-1\b/)
    expect(tile).not.toContain('bg-accent-soft')
    expect(tile).not.toContain('hover:')
  })

  it('selects by scale-down plus a check badge, not a coloured frame', () => {
    expect(tile).toContain('transition-transform')
    expect(tile).toContain('scale-[0.9]')
    expect(tile).toContain('rounded-pill bg-ink')
    expect(tile).toContain('text-card')
    expect(tile).toContain('&#10003;')
    expect(tile).toContain('aria-hidden="true"')
    expect(tile).toContain('aria-pressed={selected}')
  })

  it('still names every tile, announces its pressed state, and keeps the ring visible', () => {
    // The filename moved OFF the tile and into the accessible name; the ring is inset because the
    // sheet's own `overflow-hidden` would clip an outset ring.
    expect(tile).toMatch(/aria-label=\{/)
    expect(tile).toContain('photo.filename')
    expect(tile).toContain('title={photo.filename}')
    expect(tile).toContain(
      'focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-inset',
    )
  })

  it('says "Hers" only as the corner badge, and spells it into the announcement', () => {
    // An aria-label overrides a button's subtree text, so the visible badge alone would be silent.
    expect(tile).toContain('Hers')
    expect(tile).toContain('her current profile picture')
  })

  it('loads lazily and un-optimised, and the byte source is untouched', () => {
    expect(tile).toContain('loading="lazy"')
    expect(tile).toContain('decoding="async"')
    expect(tile).toContain('draggable={false}')
    expect(tile).toContain('photo.thumbUrl ?? photo.url')
    // `tileRaw`, not `tile`: the disable IS a comment, and the reason must travel with it.
    expect(tileRaw).toContain('eslint-disable-next-line @next/next/no-img-element')
    // `codeLines`, not the whole file: the header CITES `next/image` in order to record that this
    // repo has already ruled against it for Blob-hosted photographs; the property asserted is that
    // nothing IMPORTS it. Same rule as the picker's suite.
    expect(codeLines(grid)).not.toContain('next/image')
  })

  it('carries no visible caption in the tile', () => {
    // The old tile ended with a truncated `{photo.filename}` text node under the image. The match
    // is `> {photo.filename}` — a text CHILD — so the `aria-label={photo.filename}` expression,
    // which is `= {photo.filename}`, cannot satisfy or trip it.
    expect(tileRaw).not.toMatch(/>\s*\{photo\.filename\}/)
  })

  it('reads nothing and writes nothing', () => {
    const code = codeLines(grid)
    expect(code).not.toContain('@/lib/db')
    expect(code).not.toContain('@/lib/nina/queries')
    expect(code).not.toContain("'use server'")
    expect(code).not.toContain('Action(')
    expect(code).not.toContain('useEffect')
  })

  it('keeps the pager and the empty state working', () => {
    expect(grid).toContain('rel="prev"')
    expect(grid).toContain('rel="next"')
    expect(grid).toContain('<EmptyState')
    expect(grid).toContain('<ButtonLink')
  })
})
