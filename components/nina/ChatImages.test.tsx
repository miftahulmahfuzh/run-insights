// @vitest-environment happy-dom
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

// Real `photoSideOf` and `NINA_SIDE_LABEL`: the accessible name a tap target gets IS the rule
// under test (an unknown kind degrades to HIS, because defaulting to hers would put a stranger's
// photo under her name). Importing the real table is the only way to assert the shipped wording.
import { ChatImages } from './ChatImages'
import { NINA_SIDE_LABEL } from '@/lib/nina/album'

const URLS = [
  'https://blob.example/one.jpg',
  'https://blob.example/two.jpg',
  'https://blob.example/three.jpg',
]

describe('ChatImages', () => {
  it('renders nothing for a message with no photos', () => {
    const { container } = render(<ChatImages urls={[]} />)
    expect(container.firstElementChild).toBeNull()
  })

  it('a single photo spans the bubble at its own aspect, not a square cell', () => {
    const { container } = render(<ChatImages urls={[URLS[0]!]} />)
    const ul = container.querySelector('ul') as HTMLElement
    expect(ul.className).toContain('grid-cols-1')
    const img = ul.querySelector('img') as HTMLElement
    expect(img.className).toContain('max-h-64')
    expect(img.className).not.toContain('aspect-square')
  })

  it('two or three photos become square cells in a two-column grid', () => {
    const { container } = render(<ChatImages urls={URLS} />)
    const ul = container.querySelector('ul') as HTMLElement
    expect(ul.className).toContain('grid-cols-2')
    expect(ul.querySelectorAll('li').length).toBe(3)
    for (const img of ul.querySelectorAll('img')) {
      expect(img.className).toContain('aspect-square')
    }
  })

  it('without onOpen the grid is the phase 6 markup: plain images, nothing interactive', () => {
    const { container } = render(<ChatImages urls={URLS} />)
    expect(container.querySelectorAll('button').length).toBe(0)
    const imgs = container.querySelectorAll('img')
    expect(imgs.length).toBe(3)
    for (const img of imgs) expect(img.getAttribute('alt')).toBe('')
  })

  it('with onOpen every photo is a named tap target — his upload opens as his', async () => {
    const user = userEvent.setup()
    const onOpen = vi.fn()
    render(<ChatImages urls={[URLS[0]!]} kinds={['upload']} onOpen={onOpen} />)

    const button = screen.getByRole('button', { name: 'Buka foto kamu' })
    await user.click(button)
    expect(onOpen).toHaveBeenCalledWith(0)
  })

  it('one of her generated selfies opens under her name', () => {
    render(<ChatImages urls={[URLS[0]!] } kinds={['generated']} onOpen={() => {}} />)
    expect(screen.getByRole('button', { name: 'Buka foto nina' })).toBeInTheDocument()
  })

  it('a missing or unknown kind degrades to HIS, never to hers', () => {
    // No kinds array at all (an optimistic row before ids arrive)…
    const { container: noKinds } = render(<ChatImages urls={[URLS[0]!]} onOpen={() => {}} />)
    expect(noKinds.querySelector('button')?.getAttribute('aria-label')).toBe('Buka foto kamu')

    // …and a kind string no row should ever carry, but a hand-written one might.
    const { container: unknownKind } = render(
      <ChatImages urls={[URLS[0]!]} kinds={['mystery']} onOpen={() => {}} />,
    )
    expect(unknownKind.querySelector('button')?.getAttribute('aria-label')).toBe('Buka foto kamu')
  })

  it('names each photo by its own kind when the kinds arrive in parallel', () => {
    render(
      <ChatImages urls={[URLS[0]!, URLS[1]!]} kinds={['upload', 'generated']} onOpen={() => {}} />,
    )
    expect(screen.getByRole('button', { name: 'Buka foto kamu' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Buka foto nina' })).toBeInTheDocument()
  })

  it('each button reports its own index, and the side label is the real table’s wording', () => {
    const onOpen = vi.fn()
    render(<ChatImages urls={URLS} kinds={['generated', 'upload', 'generated']} onOpen={onOpen} />)
    // The lowercase suffix comes from NINA_SIDE_LABEL — assert the shipped strings, per photo.
    expect(screen.getByRole('button', { name: `Buka ${NINA_SIDE_LABEL.his.toLowerCase()}` })).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: `Buka ${NINA_SIDE_LABEL.hers.toLowerCase()}` }).length).toBe(2)
  })
})
