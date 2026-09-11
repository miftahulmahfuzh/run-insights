// @vitest-environment happy-dom
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

// Pure render: one component for the album AND the gallery (F33 R17's own unification), so the
// tests below pin what both surfaces share — three square columns, a named button per cell, and
// the current-photo ring as the only thing the album adds.
import { NinaPhotoGrid, type NinaGridCell } from './NinaPhotoGrid'

function cell(overrides?: Partial<NinaGridCell>): NinaGridCell {
  return {
    id: 'img-1',
    url: 'https://blob.example/photo.jpg',
    label: 'Foto kamu',
    ...overrides,
  }
}

function cells(n: number, overrides?: Partial<NinaGridCell>): NinaGridCell[] {
  return Array.from({ length: n }, (_, i) => cell({ id: `img-${i}`, ...overrides }))
}

describe('NinaPhotoGrid', () => {
  it('renders nothing for an empty album or gallery', () => {
    const { container } = render(<NinaPhotoGrid cells={[]} onOpen={() => {}} />)
    expect(container.firstElementChild).toBeNull()
  })

  it('is a three-column grid of square cells, one button per photo', () => {
    const { container } = render(<NinaPhotoGrid cells={cells(4)} onOpen={() => {}} />)
    expect(container.querySelector('ul')?.className).toContain('grid-cols-3')
    expect(screen.getAllByRole('button').length).toBe(4)
    for (const img of container.querySelectorAll('img')) {
      expect(img.className).toContain('aspect-square')
      expect(img.getAttribute('alt')).toBe('')
    }
  })

  it('each button carries its cell’s label as its accessible name', () => {
    render(
      <NinaPhotoGrid
        cells={[cell({ label: 'Foto kamu' }), cell({ id: 'img-9', label: 'Foto Nina' })]}
        onOpen={() => {}}
      />,
    )
    // Invariant 5: the name says whose photograph it is, and nothing about what is in it.
    expect(screen.getByRole('button', { name: 'Foto kamu' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Foto Nina' })).toBeInTheDocument()
  })

  it('a tap reports the tapped cell’s index', async () => {
    const user = userEvent.setup()
    const onOpen = vi.fn()
    render(<NinaPhotoGrid cells={cells(3)} onOpen={onOpen} />)

    await user.click(screen.getAllByRole('button')[2] as HTMLElement)
    expect(onOpen).toHaveBeenCalledTimes(1)
    expect(onOpen).toHaveBeenCalledWith(2)
  })

  it('only the current photo wears the ring — the album’s one addition', () => {
    const { container } = render(
      <NinaPhotoGrid
        cells={[cell({ isCurrent: true }), cell({ id: 'img-2' })]}
        onOpen={() => {}}
      />,
    )
    const [current, other] = container.querySelectorAll('button')
    expect(current?.className).toContain('ring-2')
    expect(current?.className).toContain('ring-inset')
    expect(other?.className).not.toContain('ring-')
  })

  it('the gallery’s cells (isCurrent unset) never ring', () => {
    const { container } = render(<NinaPhotoGrid cells={cells(3)} onOpen={() => {}} />)
    for (const button of container.querySelectorAll('button')) {
      expect(button.className).not.toContain('ring-')
    }
  })
})
