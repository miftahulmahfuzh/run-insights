// @vitest-environment happy-dom
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { PhotoReferencePicker } from './PhotoReferencePicker'
import {
  PHOTO_REFERENCE_MIN_TILE_PX,
  PHOTO_REFERENCE_NONE,
  PHOTO_REFERENCE_REVEAL_STEP,
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
      value={PHOTO_REFERENCE_NONE}
      onChange={onChange}
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
        /The saved reference is not in this grid — it was deleted, or it is older than the photographs shown here/,
      ),
    ).toBeInTheDocument()
    expect(screen.queryByText('✓')).not.toBeInTheDocument()
    expect(onChange).not.toHaveBeenCalled()
    // "Clear reference" is the reachable way back even though no tile looks chosen.
    expect(screen.getByRole('button', { name: 'Clear reference' })).toBeInTheDocument()
  })

  it('renders the empty state and no grid when the union has no photographs', () => {
    render(
      <PhotoReferencePicker items={[]} total={0} value={PHOTO_REFERENCE_NONE} onChange={vi.fn()} />,
    )
    expect(screen.getByText('No photos to choose from')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Nina photo/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Clear reference' })).not.toBeInTheDocument()
  })

  it('reveals the first page and grows by a step on "Show more"', async () => {
    const user = userEvent.setup()
    const items = Array.from({ length: 120 }, (_, i) => item(`k${i}`))
    // total is the union's full count; 192 against a 120-row page leaves 72 for the footer to own.
    picker({ items, total: 192 })
    expect(screen.getAllByRole('button', { name: /Nina photo/ })).toHaveLength(
      PHOTO_REFERENCE_REVEAL_STEP,
    )
    expect(screen.getByText(/Showing 48 of 120/)).toBeInTheDocument()
    // The count and the parenthetical are owned by the same <p>, so the tail matches by regex.
    expect(screen.getByText(/72 older not on this page/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Show more' }))
    expect(screen.getAllByRole('button', { name: /Nina photo/ })).toHaveLength(
      PHOTO_REFERENCE_REVEAL_STEP * 2,
    )
  })

  it('clamps the reveal UP so a saved selection beyond the page is never invisible', () => {
    // The rule that keeps the check badge visible: a selection at index 50 with only 48 tiles
    // asked for must still be drawn, or the grid would look like nothing was chosen while the
    // form said otherwise.
    const items = Array.from({ length: 120 }, (_, i) => item(`k${i}`))
    picker({ items, total: 120, value: 'k50' })
    const selected = screen.getByRole('button', { name: 'Nina photo 51' })
    expect(selected).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getAllByRole('button', { name: /Nina photo/ })).toHaveLength(51)
  })

  it('offers no "Show more" when the whole page fits inside one reveal', () => {
    picker()
    expect(screen.queryByRole('button', { name: 'Show more' })).not.toBeInTheDocument()
    expect(screen.getByText('Showing 3 of 3')).toBeInTheDocument()
  })

  it('offers "Clear reference" only when something is chosen, and clearing hands back the empty value', async () => {
    const user = userEvent.setup()
    const { onChange } = picker({ value: 'a' })
    await user.click(screen.getByRole('button', { name: 'Clear reference' }))
    expect(onChange).toHaveBeenCalledWith(PHOTO_REFERENCE_NONE)
  })

  it('disables every tile and both buttons while the save transition runs', () => {
    picker({ value: 'a', disabled: true })
    for (const tile of screen.getAllByRole('button', { name: /Nina photo/ })) {
      expect(tile).toBeDisabled()
    }
    expect(screen.getByRole('button', { name: 'Clear reference' })).toBeDisabled()
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
    expect(grid).toHaveClass('gap-[3px]', 'overflow-hidden', 'rounded-field')
    expect(grid?.className).toContain(`minmax(${PHOTO_REFERENCE_MIN_TILE_PX}px,1fr)`)
    expect(grid).not.toHaveClass('border')

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
      value={PHOTO_REFERENCE_NONE}
      onChange={vi.fn()}
      {...props}
    />,
  )
  return container
}
