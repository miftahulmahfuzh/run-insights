// @vitest-environment happy-dom
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { DetailPanel } from './DetailPanel'

/**
 * `/me`'s detail panel: a native `<dialog>` driven declaratively, and deliberately NOT a `Sheet`.
 * The contracts here are the ones the component's header argues for: `showModal()`/`close()` are
 * reconciled by exactly one effect with both `el.open` guards, the Close button is focused
 * explicitly (through a ref, not a positional query — #26), the backdrop is a click on the dialog
 * ITSELF, Escape fires `onCancel` so the caller's state follows, and nothing is rendered while
 * closed so a screen reader can't reach the prose behind a shut panel.
 *
 * The redundant-ARIA rule is also load-bearing and negative: **no** `role="dialog"` is asserted
 * present — a native dialog with an explicit role is a known screen-reader hazard.
 */

vi.mock('next/image', () => ({
  default: ({
    src,
    alt,
    width,
    height,
    className,
  }: {
    src: string
    alt: string
    width: number
    height: number
    className?: string
  }) => (
    // eslint-disable-next-line @next/next/no-img-element -- the mock, not a caller
    <img src={src} alt={alt} width={width} height={height} className={className} data-testid="panel-art" />
  ),
}))

const ART = {
  src: 'https://blob.example/badges/early_bird_768x576.jpg',
  twill: '#1a2436',
  width: 768,
  height: 576,
}

function renderPanel(props: {
  open?: boolean
  art?: typeof ART | null
  onClose?: () => void
  children?: (titleId: string) => React.ReactNode
} = {}) {
  const onClose = props.onClose ?? vi.fn()
  const utils = render(
    <DetailPanel
      open={props.open ?? true}
      art={props.art === undefined ? ART : props.art}
      onClose={onClose}
    >
      {(titleId) => (
        <h2 id={titleId} data-testid="panel-title">
          Early bird
        </h2>
      )}
    </DetailPanel>,
  )
  return { ...utils, onClose, dialog: utils.container.querySelector('dialog')! }
}

describe('DetailPanel', () => {
  it('renders the dialog element always, but nothing inside it while closed', () => {
    renderPanel({ open: false })

    const dialog = screen.getByRole('dialog', { hidden: true })
    expect(dialog).toBeInTheDocument()
    // Screen readers cannot reach the prose behind a shut panel.
    expect(screen.queryByTestId('panel-title')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Close' })).not.toBeInTheDocument()
  })

  it('open: showModal has run, the body renders, and the dialog is labelled by the title the render prop was handed', () => {
    const { dialog } = renderPanel()

    expect(dialog.open).toBe(true)
    const title = screen.getByTestId('panel-title')
    expect(dialog).toHaveAttribute('aria-labelledby', title.id)
  })

  it('the UA supplies the modality, and the file adds NO redundant role or aria-modal', () => {
    renderPanel()

    const dialog = screen.getByRole('dialog', { hidden: true })
    expect(dialog.tagName).toBe('DIALOG')
    expect(dialog).not.toHaveAttribute('role')
    expect(dialog).not.toHaveAttribute('aria-modal')
  })

  it('the Close button is focused explicitly after showModal — never the scroll container', () => {
    renderPanel()

    expect(screen.getByRole('button', { name: 'Close' })).toHaveFocus()
  })

  it('the art band carries the twill fill, the intrinsic size and an EMPTY alt', () => {
    renderPanel()

    const img = screen.getByTestId('panel-art')
    expect(img).toHaveAttribute('src', ART.src)
    expect(img).toHaveAttribute('alt', '')
    expect(img).toHaveAttribute('width', '768')
    expect(img).toHaveAttribute('height', '576')
    const band = img.parentElement!
    expect(band.getAttribute('style')).toContain(ART.twill.toLowerCase())
    expect(band).toHaveClass('aspect-[4/3]', 'overflow-hidden')
  })

  it('a locked badge dims and greys its art; a held record never does', () => {
    const { unmount } = renderPanel({ art: { ...ART, dimmed: true } })
    expect(screen.getByTestId('panel-art')).toHaveClass('opacity-50', 'grayscale')
    unmount()

    renderPanel({ art: { ...ART, dimmed: false } })
    const img = screen.getByTestId('panel-art')
    expect(img).not.toHaveClass('opacity-50')
    expect(img).not.toHaveClass('grayscale')
  })

  it('art is optional: a panel with no picture renders none', () => {
    renderPanel({ art: null })

    expect(screen.queryByTestId('panel-art')).not.toBeInTheDocument()
    expect(screen.getByTestId('panel-title')).toBeInTheDocument()
  })

  it('the Close button closes through the caller', async () => {
    const user = userEvent.setup()
    const { onClose } = renderPanel()

    await user.click(screen.getByRole('button', { name: 'Close' }))

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('Escape fires the cancel path — the caller’s state follows the DOM’s', () => {
    const { onClose, dialog } = renderPanel()

    fireEvent(dialog, new Event('cancel'))

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('a click on the backdrop targets the dialog itself and closes; a click inside does not', async () => {
    const user = userEvent.setup()
    const { onClose, dialog } = renderPanel()

    // A click on the body content: the target is the <h2>, not the dialog — no close.
    await user.click(screen.getByTestId('panel-title'))
    expect(onClose).not.toHaveBeenCalled()

    // The backdrop click's target IS the dialog (the panel is its child).
    fireEvent.click(dialog)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('the declarative reconciliation runs both ways: open → close removes the body and shuts the element', () => {
    const { rerender } = renderPanel({ open: true })
    expect(screen.getByTestId('panel-title')).toBeInTheDocument()

    rerender(
      <DetailPanel open={false} art={ART} onClose={vi.fn()}>
        {(titleId) => (
          <h2 id={titleId} data-testid="panel-title">
            Early bird
          </h2>
        )}
      </DetailPanel>,
    )

    const dialog = screen.getByRole('dialog', { hidden: true })
    expect(dialog.open).toBe(false)
    expect(screen.queryByTestId('panel-title')).not.toBeInTheDocument()
  })
})
