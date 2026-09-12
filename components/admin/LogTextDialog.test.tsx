// @vitest-environment happy-dom
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { LogTextDialog } from './LogTextDialog'

/**
 * The read-only popup's mechanics, which are the only hard part of it —
 * `components/ui/DetailPanel.test.tsx` is the suite this one borrows its shape from, minus every
 * case about a picture band this component does not have.
 *
 * The redundant-ARIA rule is asserted NEGATIVELY, as it is there: a native `<dialog>` with an
 * explicit `role="dialog"` is a known screen-reader hazard.
 */

function renderDialog(props: { open?: boolean; onClose?: () => void } = {}) {
  const onClose = props.onClose ?? vi.fn()
  const view = render(
    <LogTextDialog
      open={props.open ?? true}
      title="Full error · 12/09 07:31 · zai · glm-5.3-flash"
      body="Timeout: 300s\n\n504 Gateway Timeout"
      onClose={onClose}
    />,
  )
  return { ...view, onClose }
}

describe('LogTextDialog', () => {
  it('opens the dialog modally and names it from its own heading', () => {
    renderDialog()
    const dialog = screen.getByRole('dialog', {
      name: 'Full error · 12/09 07:31 · zai · glm-5.3-flash',
    })
    expect((dialog as HTMLDialogElement).open).toBe(true)
    expect(dialog.getAttribute('role')).toBeNull()
  })

  it('renders NOTHING while shut, so a kilobyte of error is not in the reading order', () => {
    renderDialog({ open: false })
    expect(screen.queryByText(/504 Gateway Timeout/)).toBeNull()
    expect(screen.queryByRole('button', { name: 'Close' })).toBeNull()
  })

  it('focuses Close rather than letting the scroll container take initial focus', () => {
    renderDialog()
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Close' }))
  })

  it('closes through the caller on the Close button', () => {
    const { onClose } = renderDialog()
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('closes through the caller on Escape, so DOM state and component state cannot diverge', () => {
    const { onClose } = renderDialog()
    fireEvent(screen.getByRole('dialog'), new Event('cancel', { cancelable: true }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('closes on a backdrop click — the click that targets the dialog ITSELF', () => {
    const { onClose } = renderDialog()
    const dialog = screen.getByRole('dialog')
    fireEvent.click(dialog)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('does not close on a click inside the panel', () => {
    const { onClose } = renderDialog()
    fireEvent.click(screen.getByText(/504 Gateway Timeout/))
    expect(onClose).not.toHaveBeenCalled()
  })

  it('wraps the body rather than clipping it, and keeps its newlines', () => {
    renderDialog()
    const body = screen.getByText(/504 Gateway Timeout/)
    expect(body.tagName).toBe('PRE')
    expect(body.className).toContain('whitespace-pre-wrap')
    expect(body.className).toContain('break-words')
    expect(body.className).toContain('overflow-auto')
  })
})
