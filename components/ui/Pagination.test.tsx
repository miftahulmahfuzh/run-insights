// @vitest-environment happy-dom
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { Pagination } from './Pagination'

/**
 * Component tests for the one numbered pager. What is pinned here is the *contract* phases 2-5
 * consume — every number rendered, the active cell non-interactive, the two mechanism arms — and
 * the two class tokens that were argued for rather than picked (`bg-ink text-card`, `min-h-11
 * min-w-11`). The rest of the class list is not asserted, which would make this a snapshot of the
 * string rather than a test of the choice.
 */

/** Every number in the row, in document order, as the user reads them. */
function cellLabels(): string[] {
  const nav = screen.getByRole('navigation')
  return Array.from(nav.querySelectorAll('li')).map((li) => li.textContent ?? '')
}

describe('Pagination', () => {
  it('renders nothing at all when there is one page or fewer', () => {
    const { container, rerender } = render(
      <Pagination page={1} pageCount={1} label="Album pages" hrefForPage={(n) => `?page=${n}`} />,
    )
    expect(container).toBeEmptyDOMElement()

    rerender(
      <Pagination page={1} pageCount={0} label="Album pages" hrefForPage={(n) => `?page=${n}`} />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('names the nav with the required label', () => {
    render(
      <Pagination page={2} pageCount={6} label="Album pages" hrefForPage={(n) => `?page=${n}`} />,
    )

    expect(screen.getByRole('navigation', { name: 'Album pages' })).toBeInTheDocument()
  })

  it('renders every page number in ascending order, with no ellipsis', () => {
    render(
      <Pagination page={3} pageCount={6} label="Album pages" hrefForPage={(n) => `?page=${n}`} />,
    )

    expect(cellLabels()).toEqual(['1', '2', '3', '4', '5', '6'])
    expect(screen.getByRole('navigation').textContent).not.toContain('…')
    expect(screen.getByRole('navigation').textContent).not.toContain('...')
  })

  it('still renders every number for a long range — no window, no truncation', () => {
    // 37 pages is past where a windowed pager would have collapsed. The row wraps instead.
    render(
      <Pagination page={19} pageCount={37} label="Media pages" hrefForPage={(n) => `?page=${n}`} />,
    )

    const labels = cellLabels()
    expect(labels).toHaveLength(37)
    expect(labels[0]).toBe('1')
    expect(labels[36]).toBe('37')
    expect(screen.getByRole('navigation').querySelector('ul')).toHaveClass('flex-wrap')
  })

  it('the active page is a non-interactive span carrying aria-current, not a link or a button', () => {
    render(
      <Pagination page={3} pageCount={6} label="Album pages" hrefForPage={(n) => `?page=${n}`} />,
    )

    const active = screen.getByText('3')
    expect(active.tagName).toBe('SPAN')
    expect(active).toHaveAttribute('aria-current', 'page')
    expect(screen.queryByRole('link', { name: '3' })).toBeNull()
    expect(screen.queryByRole('button', { name: '3' })).toBeNull()
    // Exactly one cell is current, whichever arm is mounted.
    expect(screen.getByRole('navigation').querySelectorAll('[aria-current]')).toHaveLength(1)
  })

  it('styles the active cell bg-ink/text-card — the measured contrast choice over bg-accent', () => {
    render(
      <Pagination page={2} pageCount={4} label="Album pages" hrefForPage={(n) => `?page=${n}`} />,
    )

    const active = screen.getByText('2')
    expect(active).toHaveClass('bg-ink', 'text-card')
    expect(active).not.toHaveClass('bg-accent')
  })

  it('gives every cell a 44px tap-target floor', () => {
    render(
      <Pagination page={1} pageCount={3} label="Album pages" hrefForPage={(n) => `?page=${n}`} />,
    )

    for (const label of ['1', '2', '3']) {
      expect(screen.getByText(label)).toHaveClass('min-h-11', 'min-w-11')
    }
  })

  describe('hrefForPage mount', () => {
    it('renders one link per inactive page at exactly the href the callback returns', () => {
      render(
        <Pagination
          page={2}
          pageCount={4}
          label="Error log pages"
          hrefForPage={(n) => `/admin/error-logs?category=vision&page=${n}`}
        />,
      )

      const links = screen.getAllByRole('link')
      expect(links.map((a) => a.textContent)).toEqual(['1', '3', '4'])
      expect(links.map((a) => a.getAttribute('href'))).toEqual([
        '/admin/error-logs?category=vision&page=1',
        '/admin/error-logs?category=vision&page=3',
        '/admin/error-logs?category=vision&page=4',
      ])
    })

    it('renders no button at all — this arm never calls back', () => {
      render(
        <Pagination page={1} pageCount={4} label="Album pages" hrefForPage={(n) => `?page=${n}`} />,
      )

      expect(screen.queryAllByRole('button')).toHaveLength(0)
    })

    it('accepts scroll={false} and still renders the hrefs — the picker mount', () => {
      // `scroll` leaves no DOM trace; what this pins is that the prop is accepted and the row
      // still renders, which is the mount `PhotoReferencePicker` makes.
      render(
        <Pagination
          page={1}
          pageCount={3}
          label="Reference pages"
          hrefForPage={(n) => `?page=${n}`}
          scroll={false}
        />,
      )

      expect(screen.getAllByRole('link').map((a) => a.getAttribute('href'))).toEqual([
        '?page=2',
        '?page=3',
      ])
    })

    it('ignores busy — it disables buttons, and this arm has none', () => {
      render(
        <Pagination
          page={1}
          pageCount={3}
          label="Album pages"
          hrefForPage={(n) => `?page=${n}`}
          busy
        />,
      )

      expect(screen.getAllByRole('link')).toHaveLength(2)
    })
  })

  describe('onPage mount', () => {
    it('calls back with the clicked page number — a jump of more than one page', async () => {
      const user = userEvent.setup()
      const onPage = vi.fn()
      render(<Pagination page={1} pageCount={6} label="Halaman album" onPage={onPage} />)

      await user.click(screen.getByRole('button', { name: '5' }))

      expect(onPage).toHaveBeenCalledTimes(1)
      expect(onPage).toHaveBeenCalledWith(5)
    })

    it('renders buttons of type="button" and no links', () => {
      render(<Pagination page={2} pageCount={4} label="Halaman album" onPage={vi.fn()} />)

      const buttons = screen.getAllByRole('button')
      expect(buttons.map((b) => b.textContent)).toEqual(['1', '3', '4'])
      for (const button of buttons) {
        expect(button).toHaveAttribute('type', 'button')
      }
      expect(screen.queryAllByRole('link')).toHaveLength(0)
    })

    it('busy disables every button', () => {
      render(<Pagination page={2} pageCount={4} label="Halaman album" onPage={vi.fn()} busy />)

      for (const button of screen.getAllByRole('button')) {
        expect(button).toBeDisabled()
      }
    })

    it('a disabled button does not call back', async () => {
      const user = userEvent.setup()
      const onPage = vi.fn()
      render(<Pagination page={1} pageCount={4} label="Halaman album" onPage={onPage} busy />)

      await user.click(screen.getByRole('button', { name: '3' }))

      expect(onPage).not.toHaveBeenCalled()
    })

    it('is enabled by default — busy is opt-in', () => {
      render(<Pagination page={1} pageCount={3} label="Halaman album" onPage={vi.fn()} />)

      for (const button of screen.getAllByRole('button')) {
        expect(button).toBeEnabled()
      }
    })
  })

  it('applies a caller className to the nav', () => {
    render(
      <Pagination
        page={1}
        pageCount={3}
        label="Album pages"
        hrefForPage={(n) => `?page=${n}`}
        className="mt-4 border-t border-rule pt-3"
      />,
    )

    expect(screen.getByRole('navigation')).toHaveClass('mt-4', 'border-t', 'pt-3')
  })
})
