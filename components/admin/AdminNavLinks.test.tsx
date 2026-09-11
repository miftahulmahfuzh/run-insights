// @vitest-environment happy-dom
import { render } from '@testing-library/react'
import { usePathname } from 'next/navigation'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { AdminNavLinks } from './AdminNavLinks'

/*
 * The active-cell rule is the whole point of this file (the owner's own ruling, replacing the
 * old no-highlight rule): `/admin` matches EXACT — a prefix match there would light every cell —
 * every other href by `startsWith`, the mobile highlight is `text-accent` on the GLYPH (not the
 * link, so it cannot leak into the sidebar), the desktop highlight is the pill with explicit
 * `lg:hover:` twins so the hover variant cannot repaint the active cell, and `aria-current="page"`
 * carries it to the screen reader. `usePathname` is mocked; the routes and classes are real.
 */
vi.mock('next/navigation', () => ({
  usePathname: vi.fn(),
}))

const pathnameMock = vi.mocked(usePathname)

function at(path: string) {
  pathnameMock.mockReturnValue(path)
  return render(<AdminNavLinks />).container
}

const HREFS = [
  '/admin',
  '/admin/nina',
  '/admin/personality',
  '/admin/image-generation',
  '/admin/memory',
  '/admin/shortcuts',
]

beforeEach(() => {
  vi.clearAllMocks()
  pathnameMock.mockReturnValue('/admin')
})

describe('AdminNavLinks', () => {
  it('renders the six admin routes, in bar order', () => {
    const { container } = render(<AdminNavLinks />)
    expect([...container.querySelectorAll('a')].map((a) => a.getAttribute('href'))).toEqual(HREFS)
  })

  it('gives every link exactly one name below lg: the sr-only short, with the glyph as decor', () => {
    const container = at('/admin')
    const short = container.querySelector('a[href="/admin/nina"] span.sr-only')!
    expect(short).toHaveTextContent('Photos')
    const glyph = container.querySelector('a[href="/admin/nina"] svg')!
    expect(glyph).toHaveAttribute('aria-hidden', 'true')
    // The sidebar label is present in the DOM but classed for lg only.
    const label = container.querySelector('a[href="/admin/nina"] span.hidden')!
    expect(label).toHaveTextContent('Image collection')
  })

  it('keeps the label PAIR together — the phone name and the sidebar name for the same route', () => {
    // The pairs exist so the two renditions cannot drift: "Photos" and "Image collection" are
    // one route, edited together. Pin both strings per row.
    const container = at('/admin')
    const pairs: Array<[string, string, string]> = [
      ['/admin', 'Overview', 'Overview'],
      ['/admin/nina', 'Photos', 'Image collection'],
      ['/admin/personality', 'Persona', 'Personality'],
      ['/admin/image-generation', 'Images', 'Image Generation'],
      ['/admin/memory', 'Memory', 'Memory'],
      ['/admin/shortcuts', 'Shortcut', 'Shortcuts'],
    ]
    for (const [href, short, label] of pairs) {
      const a = container.querySelector(`a[href="${href}"]`)!
      expect(a.querySelector('.sr-only')).toHaveTextContent(short)
      expect(a.querySelector('.hidden')).toHaveTextContent(label)
    }
  })

  it('marks the current route with aria-current="page" and leaves the others without the attribute', () => {
    const container = at('/admin/memory')
    for (const a of container.querySelectorAll('a')) {
      if (a.getAttribute('href') === '/admin/memory') {
        expect(a).toHaveAttribute('aria-current', 'page')
      } else {
        // Absent entirely — not aria-current="false", which a screen reader would still announce.
        expect(a).not.toHaveAttribute('aria-current')
      }
    }
  })

  it('matches /admin EXACTLY — on the admin home only Overview is lit', () => {
    const container = at('/admin')
    const currents = container.querySelectorAll('a[aria-current="page"]')
    expect(currents).toHaveLength(1)
    expect(currents[0]!.getAttribute('href')).toBe('/admin')
  })

  it('keeps a route’s cell active through nested paths — the forward-safe startsWith', () => {
    const container = at('/admin/nina/album/42')
    const currents = container.querySelectorAll('a[aria-current="page"]')
    expect(currents).toHaveLength(1)
    expect(currents[0]!.getAttribute('href')).toBe('/admin/nina')
  })

  it('goes dark on a path that merely starts with /admin as a string', () => {
    // "/adminx" startsWith("/admin") is TRUE as a string — which is exactly why /admin is
    // compared exactly. No cell may claim it.
    const container = at('/adminx')
    expect(container.querySelectorAll('a[aria-current="page"]')).toHaveLength(0)
  })

  it('paints the active GLYPH accent — on the icon, not the link, below lg', () => {
    const container = at('/admin/personality')
    const activeGlyph = container.querySelector('a[href="/admin/personality"] svg')!
    expect(activeGlyph).toHaveClass('text-accent', 'lg:hidden')
    const idleGlyph = container.querySelector('a[href="/admin/memory"] svg')!
    expect(idleGlyph).not.toHaveClass('text-accent')
    // The active LINK does not carry text-accent — the glyph paints itself.
    const activeLink = container.querySelector('a[href="/admin/personality"]')!
    expect(activeLink.className).not.toContain('text-accent')
  })

  it('fills the desktop pill with the hover twins that stop hover repainting the active cell', () => {
    const container = at('/admin/shortcuts')
    const active = container.querySelector('a[href="/admin/shortcuts"]')!
    expect(active).toHaveClass('lg:bg-accent-soft', 'lg:text-ink')
    // The explicit twins: `lg:hover:bg-card` (the inactive hover) would otherwise outrank the
    // plain active pill under the pointer.
    expect(active).toHaveClass('lg:hover:bg-accent-soft', 'lg:hover:text-ink')

    const idle = container.querySelector('a[href="/admin/nina"]')!
    expect(idle).not.toHaveClass('lg:bg-accent-soft')
    expect(idle).toHaveClass('lg:hover:bg-card')
  })

  it('is one row of six 56px cells below lg, and the grid goes inert at lg', () => {
    // The bar is one row of cells for its six routes (`grid-cols-6`, h-14); at lg the list
    // becomes a plain stacked block and the grid stops mattering.
    const { container } = render(<AdminNavLinks />)
    const list = container.querySelector('ul')!
    expect(list).toHaveClass('grid', 'grid-cols-6', 'h-14')
    expect(list).toHaveClass('lg:block')
    expect(container.querySelectorAll('li')).toHaveLength(6)
  })

  it('keeps the 470px TabBar row cap and the one-pixel row padding the owner prescribed', () => {
    const { container } = render(<AdminNavLinks />)
    const list = container.querySelector('ul')!
    expect(list).toHaveClass('max-w-[470px]', 'mx-auto', 'px-[7px]', 'lg:px-0')
  })
})
