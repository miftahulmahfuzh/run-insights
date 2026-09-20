// @vitest-environment happy-dom
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { PhotoReferencePicker } from './PhotoReferencePicker'
import {
  PHOTO_REFERENCE_MIN_TILE_PX,
  PHOTO_REFERENCE_NONE,
  type PhotoReferenceItem,
} from './photoReferenceModel'

/**
 * `tests/admin.photoReference.test.ts` already pins the MODEL and the picker's source text — but
 * it never renders anything, which is exactly the "string-matching stood in for coverage" pattern
 * the 2026-09-11 explorer session documented elsewhere. This file renders the picker and drives
 * the interaction the component exists for: one, or none, by re-tap; the check badge; the
 * missing-reference sentence with NO self-heal; the bounded reveal and its clamp-up.
 */

function item(key: string, thumbUrl: string | null = null): PhotoReferenceItem {
  return { key, url: `https://blob.example/${key}.jpg`, thumbUrl }
}

function picker(props?: Partial<Parameters<typeof PhotoReferencePicker>[0]>) {
  const onChange = vi.fn()
  render(
    <PhotoReferencePicker
      items={[item('a'), item('b', 'https://blob.example/b_thumb.jpg'), item('c')]}
      total={3}
      page={1}
      pageCount={1}
      preloadUrls={[]}
      value={PHOTO_REFERENCE_NONE}
      selectedId=""
      onChange={onChange}
      fullViewHref={null}
      collapsible
      {...props}
    />,
  )
  return { onChange }
}

describe('PhotoReferencePicker', () => {
  it('renders one labelled tile per photograph, 1-based, with no visible text on the tile', () => {
    picker()
    expect(screen.getByRole('button', { name: 'Nina photo 1' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Nina photo 2' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Nina photo 3' })).toBeInTheDocument()
  })

  it('loads the thumbnail when the row has one and the original when it does not', () => {
    picker()
    const thumb = screen.getByRole('button', { name: 'Nina photo 2' }).querySelector('img')
    expect(thumb).toHaveAttribute('src', 'https://blob.example/b_thumb.jpg')
    const chatOriginal = screen.getByRole('button', { name: 'Nina photo 1' }).querySelector('img')
    expect(chatOriginal).toHaveAttribute('src', 'https://blob.example/a.jpg')
  })

  it('treats an empty-string thumbnail as absent — the chat half after a serialization round trip', () => {
    pickerRender({ items: [item('e', '')], total: 1, value: PHOTO_REFERENCE_NONE })
    expect(
      screen.getByRole('button', { name: 'Nina photo 1' }).querySelector('img'),
    ).toHaveAttribute('src', 'https://blob.example/e.jpg')
  })

  it('says "No reference" in the status line when nothing is chosen', () => {
    picker()
    expect(screen.getByText('No reference')).toBeInTheDocument()
  })

  it('names the current selection in the status line', () => {
    picker({ value: 'b' })
    expect(screen.getByText('Nina photo 2 selected')).toBeInTheDocument()
    expect(screen.queryByText('No reference')).not.toBeInTheDocument()
  })

  it('marks exactly one tile aria-pressed and draws the check badge only there', () => {
    picker({ value: 'b' })
    expect(screen.getByRole('button', { name: 'Nina photo 2' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(screen.getByRole('button', { name: 'Nina photo 1' })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
    const badges = screen.getAllByText('✓')
    expect(badges).toHaveLength(1)
    expect(badges[0]).toHaveAttribute('aria-hidden', 'true')
    // The badge is ink-on-card, not accent — the contrast measurement Button.tsx recorded.
    expect(badges[0]).toHaveClass('bg-ink', 'text-card')
  })

  it('selects on the first tap — handing onChange the tile’s key untouched', async () => {
    const user = userEvent.setup()
    const { onChange } = picker()
    await user.click(screen.getByRole('button', { name: 'Nina photo 3' }))
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith('c')
  })

  it('clears on the second tap of the same tile — the gesture a radio group cannot express', async () => {
    const user = userEvent.setup()
    const { onChange } = picker({ value: 'c' })
    await user.click(screen.getByRole('button', { name: 'Nina photo 3' }))
    expect(onChange).toHaveBeenCalledWith(PHOTO_REFERENCE_NONE)
  })

  it('switches rather than accumulates — tapping another tile hands over the single choice', async () => {
    const user = userEvent.setup()
    const { onChange } = picker({ value: 'a' })
    await user.click(screen.getByRole('button', { name: 'Nina photo 2' }))
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith('b')
  })

  it('reports a missing saved reference without drawing anything as selected — and never self-heals', () => {
    // The value points at a deleted row (or an older-than-page one). The sentence renders,
    // nothing is pressed, and — the Decisions entry's point — onChange is NOT called on mount;
    // an effect that "fixed" this would mark a clean draft dirty.
    const { onChange } = picker({ value: 'gone' })
    expect(
      screen.getByText(
        /The saved reference is not on this page — it was deleted, or it is on a different page/,
      ),
    ).toBeInTheDocument()
    expect(screen.queryByText('✓')).not.toBeInTheDocument()
    expect(onChange).not.toHaveBeenCalled()
    // "Clear reference" is the reachable way back even though no tile looks chosen.
    expect(screen.getByRole('button', { name: 'Clear reference' })).toBeInTheDocument()
  })

  it('does not say "No reference" in the always-visible status line when the saved reference is only off this page', () => {
    // The 2026-09-20 bug: an admin anchors a photo from Image collection, then opens Image
    // generation on a page that doesn't happen to contain it, and the closed <details>'s summary
    // line — the only thing visible before expanding — claimed "No reference" even though a
    // reference genuinely was saved (the full-view button, built independently of `items`, still
    // linked straight to it). The status line must say the reference is set, not that it's absent.
    picker({ value: 'gone' })
    expect(screen.queryByText('No reference')).not.toBeInTheDocument()
    expect(screen.getByText('Reference set — not shown on this page')).toBeInTheDocument()
  })

  it('renders the empty state and no grid when the union has no photographs', () => {
    render(
      <PhotoReferencePicker
        items={[]}
        total={0}
        page={1}
        pageCount={1}
        preloadUrls={[]}
        value={PHOTO_REFERENCE_NONE}
        selectedId=""
        onChange={vi.fn()}
        fullViewHref={null}
        collapsible
      />,
    )
    expect(screen.getByText('No photos to choose from')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Nina photo/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Clear reference' })).not.toBeInTheDocument()
  })

  it('draws every tile on the page — there is no reveal step any more', () => {
    // The server hands over one real `?page=` window, at most NINA_PHOTO_REF_PAGE_SIZE rows; the
    // component draws all of it rather than staging it behind a "Show more" button.
    const items = Array.from({ length: 50 }, (_, i) => item(`k${i}`))
    picker({ items, total: 120, page: 1, pageCount: 3 })
    expect(screen.getAllByRole('button', { name: /Nina photo/ })).toHaveLength(50)
    expect(screen.getByText(/Showing 50 of 120/)).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Show more' })).not.toBeInTheDocument()
  })

  it('offers Next but no Previous on the first page of several', () => {
    const items = Array.from({ length: 50 }, (_, i) => item(`k${i}`))
    picker({ items, total: 120, page: 1, pageCount: 3 })
    expect(screen.getByText(/page 1 of 3/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Next' })).toHaveAttribute('href', '?page=2')
    expect(screen.queryByRole('link', { name: 'Previous' })).not.toBeInTheDocument()
  })

  it('offers Previous but no Next on the last page', () => {
    const items = Array.from({ length: 20 }, (_, i) => item(`k${i}`))
    picker({ items, total: 120, page: 3, pageCount: 3 })
    expect(screen.getByRole('link', { name: 'Previous' })).toHaveAttribute('href', '?page=2')
    expect(screen.queryByRole('link', { name: 'Next' })).not.toBeInTheDocument()
  })

  it('offers neither Previous nor Next when the whole collection is one page', () => {
    picker()
    expect(screen.getByText(/Showing 3 of 3/)).toBeInTheDocument()
    expect(screen.getByText(/page 1 of 1/)).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Previous' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Next' })).not.toBeInTheDocument()
  })

  it('prints the selected id in the footer, to tell two same-looking tiles apart', () => {
    picker({ value: 'b', selectedId: '87sdf34r' })
    expect(screen.getByText(/selected #87sdf34r/)).toBeInTheDocument()
  })

  it('omits the "selected #" segment entirely when nothing is selected', () => {
    picker({ value: PHOTO_REFERENCE_NONE, selectedId: '' })
    expect(screen.queryByText(/selected #/)).not.toBeInTheDocument()
  })

  it('still prints the selected id when the reference is not on this page (the "missing" case)', () => {
    // The whole point: a duplicate reachable from two pages is identified by id from EITHER one,
    // whether or not the saved selection happens to be drawn on the current page.
    picker({ value: 'gone', selectedId: 'gone' })
    expect(screen.getByText(/selected #gone/)).toBeInTheDocument()
  })

  it('renders a prefetch hint for every preload URL, hoisted into <head>', () => {
    picker({ preloadUrls: ['https://blob.example/next1.jpg', 'https://blob.example/next2.jpg'] })
    const links = document.head.querySelectorAll('link[rel="prefetch"]')
    const hrefs = [...links].map((link) => link.getAttribute('href'))
    expect(hrefs).toContain('https://blob.example/next1.jpg')
    expect(hrefs).toContain('https://blob.example/next2.jpg')
    for (const link of links) expect(link).toHaveAttribute('as', 'image')
  })

  it('renders no prefetch hints when there is nothing to warm', () => {
    picker({ preloadUrls: [] })
    expect(document.head.querySelectorAll('link[rel="prefetch"]')).toHaveLength(0)
  })

  it('offers "Clear reference" only when something is chosen, and clearing hands back the empty value', async () => {
    const user = userEvent.setup()
    const { onChange } = picker({ value: 'a' })
    await user.click(screen.getByRole('button', { name: 'Clear reference' }))
    expect(onChange).toHaveBeenCalledWith(PHOTO_REFERENCE_NONE)
  })

  it('renders as a <details> element, collapsed on mount — compacted like the placeholder reference', () => {
    const { container } = render(
      <PhotoReferencePicker
        items={[item('a')]}
        total={1}
        page={1}
        pageCount={1}
        preloadUrls={[]}
        value={PHOTO_REFERENCE_NONE}
        selectedId=""
        onChange={vi.fn()}
        fullViewHref={null}
        collapsible
      />,
    )
    const details = container.querySelector('details')
    expect(details).not.toBeNull()
    expect(details).not.toHaveAttribute('open')
    expect(container.querySelector('summary')?.textContent).toContain('Photo reference')
  })

  it('offers a full-view link to the current anchor only when fullViewHref is given', () => {
    const { rerender } = render(
      <PhotoReferencePicker
        items={[item('a')]}
        total={1}
        page={1}
        pageCount={1}
        preloadUrls={[]}
        value="a"
        selectedId="a"
        onChange={vi.fn()}
        fullViewHref={null}
        collapsible
      />,
    )
    expect(
      screen.queryByRole('link', { name: 'Lihat foto referensi ukuran penuh' }),
    ).not.toBeInTheDocument()

    rerender(
      <PhotoReferencePicker
        items={[item('a')]}
        total={1}
        page={1}
        pageCount={1}
        preloadUrls={[]}
        value="a"
        selectedId="a"
        onChange={vi.fn()}
        fullViewHref="/nina/about?photo=album.a"
        collapsible
      />,
    )
    expect(screen.getByRole('link', { name: 'Lihat foto referensi ukuran penuh' })).toHaveAttribute(
      'href',
      '/nina/about?photo=album.a',
    )
  })

  it('keeps the full-view link OUTSIDE the <details>, so a closed disclosure still reaches it', () => {
    // The whole point of the 2026-09-21 fix: the button used to live in the footer, below the
    // grid, which a closed `<details>` hides along with everything else after its `<summary>`.
    render(
      <PhotoReferencePicker
        items={[item('a')]}
        total={1}
        page={1}
        pageCount={1}
        preloadUrls={[]}
        value="a"
        selectedId="a"
        onChange={vi.fn()}
        fullViewHref="/nina/about?photo=album.a"
        collapsible
      />,
    )
    const link = screen.getByRole('link', { name: 'Lihat foto referensi ukuran penuh' })
    expect(link.closest('details')).toBeNull()
  })

  it('names no caption and no provenance anywhere in a tile — only the check glyph when selected', () => {
    // `tests/admin.photoReference.test.ts` asserted this by grepping the JSX source; that never
    // renders, so a conditional that only LOOKS like it strips this text would still pass. This
    // renders the real tile and reads its accessible text and img alt directly.
    picker({ value: 'a' })
    const unselected = screen.getByRole('button', { name: 'Nina photo 2' })
    expect(unselected).toHaveTextContent('')
    const selected = screen.getByRole('button', { name: 'Nina photo 1' })
    expect(selected).toHaveTextContent('✓')
    expect(selected.querySelector('img')).toHaveAttribute('alt', '')
    for (const tile of [unselected, selected]) {
      for (const word of ['album', 'Album', 'chat', 'Chat', 'Hers']) {
        expect(tile.textContent ?? '', `the tile must not announce ${word}`).not.toContain(word)
      }
    }
  })

  it('loads every tile image lazily, un-optimised', () => {
    picker()
    for (const tile of screen.getAllByRole('button', { name: /Nina photo/ })) {
      const img = tile.querySelector('img')
      expect(img).toHaveAttribute('loading', 'lazy')
    }
  })

  it('draws a touching sheet of square tiles with no card chrome, at the 92px tap-target floor', () => {
    // The Tailwind classes are asserted on the rendered elements, not grepped from source — a
    // class assigned to the wrong element, or gated behind a condition that never fires, would
    // read identically to source text but would fail here.
    picker()
    const grid = screen.getByRole('button', { name: 'Nina photo 1' }).closest('ul')
    expect(grid).toHaveClass('gap-[3px]')
    expect(grid?.className).toContain(`minmax(${PHOTO_REFERENCE_MIN_TILE_PX}px,1fr)`)
    expect(grid).not.toHaveClass('border')

    // The rounded, clipped frame — and the desktop-only horizontal scroll for the fixed-width
    // 33-column track — live one level up, on the wrapper whose edges are now the visible sheet.
    const wrapper = grid?.parentElement
    expect(wrapper).toHaveClass('overflow-hidden', 'rounded-field', 'lg:overflow-x-auto')

    const cell = screen.getByRole('button', { name: 'Nina photo 1' }).closest('li')
    expect(cell).toHaveClass('aspect-square')
    expect(cell).not.toHaveClass('border', 'bg-accent-soft')

    const img = screen.getByRole('button', { name: 'Nina photo 1' }).querySelector('img')
    expect(img).toHaveClass('object-cover')
  })
})

/** Second render surface for one-off assertions; cleanup runs between tests, not between renders. */
function pickerRender(props: Partial<Parameters<typeof PhotoReferencePicker>[0]>): HTMLElement {
  const { container } = render(
    <PhotoReferencePicker
      items={[]}
      total={0}
      page={1}
      pageCount={1}
      preloadUrls={[]}
      value={PHOTO_REFERENCE_NONE}
      selectedId=""
      onChange={vi.fn()}
      fullViewHref={null}
      collapsible
      {...props}
    />,
  )
  return container
}
