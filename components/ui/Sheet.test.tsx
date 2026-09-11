// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { Sheet } from './Sheet'

/**
 * The app's one modal surface, at DOM level. `tests/ui.sheetFocus.test.ts` proves the
 * focus-stealing bug's *cause* as a property of the dependency list; the tests at the bottom of
 * this file prove its *absence* in a rendered scenario — a keyboard-equivalent of the exact
 * sequence the reviewer lived: sheet open, field focused, parent re-renders, focus stays put.
 */

function renderSheet(props: Partial<React.ComponentProps<typeof Sheet>> = {}) {
  const onClose = props.onClose ?? vi.fn()
  const utils = render(
    <Sheet open={true} onClose={onClose} title="Edit km 11" {...props}>
      {props.children ?? <input aria-label="Pace" />}
    </Sheet>,
  )
  return { ...utils, onClose }
}

describe('Sheet', () => {
  afterEach(() => {
    // Hooks run in reverse registration order: this runs BEFORE the setup file's cleanup(),
    // so release this test's sheet by hand first — otherwise its own lock is still held and
    // the assert below reports the test's own mount as a leak, and the throw then skips
    // cleanup entirely, cascading every later test.
    cleanup()
    // A leaking scroll lock from any test would chase every test after it.
    expect(document.body.style.overflow).not.toBe('hidden')
  })

  it('closed renders nothing at all', () => {
    render(<Sheet open={false} onClose={vi.fn()} title="Edit">Body</Sheet>)

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.queryByText('Body')).not.toBeInTheDocument()
  })

  it('open: the panel is a modal dialog named by its title', () => {
    renderSheet()

    const dialog = screen.getByRole('dialog', { name: 'Edit km 11' })
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(dialog).toHaveAttribute('tabindex', '-1')
  })

  it('renders a subtitle under the title and a body', () => {
    renderSheet({ subtitle: 'Screenshot 2 of 3', children: <p>Body lives here</p> })

    expect(screen.getByText('Screenshot 2 of 3')).toBeInTheDocument()
    expect(screen.getByText('Body lives here')).toBeInTheDocument()
  })

  it('renders the pinned footer only when one is given', () => {
    const { rerender } = renderSheet({ footer: <button type="button">Save</button> })

    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument()

    rerender(<Sheet open={true} onClose={vi.fn()} title="Edit km 11"><input aria-label="Pace" /></Sheet>)
    expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument()
  })

  it('both the backdrop and the ✕ are real Close controls', async () => {
    const user = userEvent.setup()
    const { onClose } = renderSheet()

    // Two buttons named Close: the backdrop surface and the header ✕.
    const closes = screen.getAllByRole('button', { name: 'Close' })
    expect(closes).toHaveLength(2)

    await user.click(closes[1]!) // the ✕ in the header
    expect(onClose).toHaveBeenCalledTimes(1)

    await user.click(closes[0]!) // the backdrop
    expect(onClose).toHaveBeenCalledTimes(2)
  })

  it('Escape closes the sheet', () => {
    const { onClose } = renderSheet()

    fireEvent.keyDown(document, { key: 'Escape' })

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  describe('the scroll lock', () => {
    it('locks the body while open and restores what was there before', () => {
      document.body.style.overflow = 'scroll'
      const { onClose, unmount } = renderSheet()

      expect(document.body.style.overflow).toBe('hidden')

      fireEvent.keyDown(document, { key: 'Escape' })
      expect(onClose).toHaveBeenCalledTimes(1)
      // The sheet is still open — the caller decides when to unmount it…
      expect(document.body.style.overflow).toBe('hidden')
      // …and the lock is released when it goes away.
      unmount()
      expect(document.body.style.overflow).toBe('scroll')
    })

    it('a closed sheet leaves the body alone', () => {
      render(<Sheet open={false} onClose={vi.fn()} title="Edit">Body</Sheet>)

      expect(document.body.style.overflow).not.toBe('hidden')
    })
  })

  describe('focus', () => {
    it('moves into the panel on open — not into the first input — and back out on close', async () => {
      const user = userEvent.setup()
      const outside = document.createElement('button')
      document.body.append(outside)
      outside.focus()

      const { onClose, unmount } = renderSheet({ children: <input aria-label="Pace" /> })
      const dialog = screen.getByRole('dialog')
      expect(dialog).toHaveFocus()
      // …and the field was NOT raised before the reviewer chose it.
      expect(screen.getByRole('textbox', { name: 'Pace' })).not.toHaveFocus()

      await user.click(screen.getByRole('textbox', { name: 'Pace' }))
      expect(screen.getByRole('textbox', { name: 'Pace' })).toHaveFocus()

      fireEvent.keyDown(document, { key: 'Escape' })
      expect(onClose).toHaveBeenCalledTimes(1)
      unmount()
      // Focus went back to the thing that opened the sheet.
      expect(outside).toHaveFocus()

      outside.remove()
    })

    it('a parent re-render that mints a new onClose does NOT steal focus from the field', () => {
      // The iOS keyboard bug, as a rendered sequence: a keystroke below pushes a draft up,
      // the parent re-renders, `onClose` is a new arrow every time — and the effect that
      // focuses the panel must not re-run, or the field (and with it the keyboard) is lost.
      const first = vi.fn()
      const { rerender } = render(
        <Sheet open={true} onClose={first} title="Edit km 11">
          <input aria-label="Pace" />
        </Sheet>,
      )
      screen.getByRole('textbox', { name: 'Pace' }).focus()
      expect(screen.getByRole('textbox', { name: 'Pace' })).toHaveFocus()

      rerender(
        <Sheet open={true} onClose={vi.fn()} title="Edit km 11">
          <input aria-label="Pace" />
        </Sheet>,
      )

      expect(screen.getByRole('textbox', { name: 'Pace' })).toHaveFocus()
    })

    it('Escape reaches the LATEST onClose, not the one from when the sheet opened', () => {
      const stale = vi.fn()
      const fresh = vi.fn()
      const { rerender } = render(
        <Sheet open={true} onClose={stale} title="Edit km 11">
          Body
        </Sheet>,
      )
      rerender(
        <Sheet open={true} onClose={fresh} title="Edit km 11">
          Body
        </Sheet>,
      )

      fireEvent.keyDown(document, { key: 'Escape' })

      expect(stale).not.toHaveBeenCalled()
      expect(fresh).toHaveBeenCalledTimes(1)
    })
  })
})
