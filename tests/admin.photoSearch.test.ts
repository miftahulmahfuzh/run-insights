import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import { repoRoot } from './support/importGraph'

/**
 * The album search UI, pinned where it landed.
 *
 * `tests/admin.photoGrid.test.ts` pins `PhotoGrid`'s borderless sheet and is deliberately scoped to
 * that file by its `read()` paths; this suite is its sibling for the SEARCH grid, which mirrors the
 * same recipe and must be able to do so without either file editing the other. Vitest runs
 * `environment: 'node'` here with no DOM, so a class list, an absent import and a JSX ordering are
 * asserted here or not at all — the behaviours live in the two co-located `.test.tsx` files.
 *
 * Class ORDER is never asserted: `prettier-plugin-tailwindcss` owns it.
 */

const ROOT = repoRoot
const read = (path: string) => readFileSync(`${ROOT}${path}`, 'utf8')

const bar = read('components/admin/explorer/PhotoSearchBar.tsx')
const grid = read('components/admin/explorer/SearchResultsGrid.tsx')
const encode = read('components/admin/explorer/searchQueryImage.ts')
const explorer = read('components/admin/FileExplorer.tsx')

/**
 * Executable lines only — `tests/admin.photoGrid.test.ts`'s rule, copied: `scripts/
 * check-client-secret-boundary.mjs`'s `isComment` plus `{/*` for a JSX comment's opening line,
 * which is why every continuation line inside a JSX comment in these components starts with `*`.
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

describe('the search row sits above "Album" (R1)', () => {
  it('is the first element of what FileExplorer returns', () => {
    const body = codeLines(explorer)
    const returned = body.indexOf('return (')
    const searchBar = body.indexOf('<PhotoSearchBar', returned)
    // The toolbar `div` holds the breadcrumb whose first crumb is the word the requirement names.
    const toolbar = body.indexOf('lg:flex lg:flex-wrap lg:items-center', returned)
    expect(searchBar).toBeGreaterThan(returned)
    expect(toolbar).toBeGreaterThan(searchBar)
  })

  it('is absent on the Media arm rather than disabled', () => {
    expect(codeLines(explorer)).toContain('{!isMediaView && (')
  })

  it('is a client component with a search landmark', () => {
    expect(bar.startsWith("'use client'")).toBe(true)
    expect(codeLines(bar)).toContain('role="search"')
  })
})

describe('the query photograph is a question, never an upload (invariant: no orphan blobs)', () => {
  it('never reaches Blob from the encode module', () => {
    expect(codeLines(encode)).not.toContain('@vercel/blob')
    expect(codeLines(encode)).not.toContain('handleUploadUrl')
    expect(codeLines(encode)).toContain('readAsDataURL')
  })

  it('never reaches Blob from the bar either', () => {
    expect(bar).not.toContain('@vercel/blob')
    expect(bar).not.toContain('handleUploadUrl')
  })

  it('pins the measured re-encode envelope: 768 px short edge, q0.75, JPEG', () => {
    expect(encode).toContain('SEARCH_QUERY_SHORT_EDGE_PX = 768')
    expect(encode).toContain('SEARCH_QUERY_QUALITY = 0.75')
    expect(encode).toContain("SEARCH_QUERY_CONTENT_TYPE = 'image/jpeg'")
    expect(encode).toContain('SEARCH_QUERY_MAX_DATA_URI_CHARS = 700_000')
  })
})

describe('the results sheet mirrors the borderless recipe (R4 of the album set)', () => {
  const sheet = grid.slice(grid.indexOf('<ul'), grid.indexOf('</ul>'))
  const tile = codeLines(grid.slice(grid.indexOf('<li key={hit.id}'), grid.indexOf('</li>')))

  it('draws one sheet: hairline gutters, one rounded clipped surface', () => {
    expect(sheet).toContain('gap-[3px]')
    expect(sheet).toContain('overflow-hidden rounded-field')
    expect(tile).toContain('aspect-square')
    expect(tile).toContain('bg-ink-3/20')
    expect(tile).toContain('object-cover')
  })

  it('keeps no card chrome on a tile', () => {
    expect(tile).not.toContain('border')
    expect(tile).not.toContain('rounded-chip')
    expect(tile).not.toMatch(/\bp-1\b/)
  })

  it('keeps the Hers badge convention', () => {
    expect(tile).toContain('rounded-pill bg-ink')
    expect(tile).toContain('Hers')
  })

  it('loads the derived thumbnail and never next/image', () => {
    expect(tile).toContain('hit.thumbUrl ?? hit.url')
    expect(tile).toContain('loading="lazy"')
    expect(grid).not.toContain("from 'next/image'")
  })

  it('has no pager: a ranked list has no page two', () => {
    expect(codeLines(grid)).not.toContain('Newer')
    expect(codeLines(grid)).not.toContain('Older')
    expect(codeLines(grid)).not.toContain('hrefForPage')
  })

  it('opens the shared overlay rather than a second one', () => {
    expect(grid).toContain("from '@/components/ui/PhotoViewer'")
    expect(grid).toContain('<PhotoViewer')
    expect(grid).not.toContain('function PhotoViewer')
    // The guard that keeps `photos[index]!` from ever seeing an undefined row.
    expect(codeLines(grid)).toContain('photos[viewerIndex] != null')
  })

  it('opens no selection pane and plants no pane focus hook', () => {
    expect(codeLines(grid)).not.toContain('SelectionPane')
    expect(codeLines(grid)).not.toContain('data-photo-id')
  })
})

describe('normal folder browsing is untouched', () => {
  it('still selects a tile into the details rail', () => {
    const body = codeLines(explorer)
    expect(body).toContain('onSelect={select}')
    expect(body).toContain('<SelectionPane')
  })

  it('calls the search layer as a black box — no lib/nina query reaches a component', () => {
    for (const source of [bar, grid, encode]) {
      expect(source).not.toContain('lib/nina/queries')
      expect(source).not.toContain('drizzle')
    }
  })

  it('reads no row description into the browser (invariant 5)', () => {
    expect(codeLines(grid)).not.toContain('hit.description')
    expect(codeLines(bar)).not.toContain('.description')
  })
})
