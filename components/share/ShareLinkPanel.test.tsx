// @vitest-environment happy-dom
import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { revokeShareLinkAction } = vi.hoisted(() => ({ revokeShareLinkAction: vi.fn() }))
// The revoke is a Server Action (auth + database + blob rotation behind it). This panel's own
// contract is what wraps it: the R-38 confirm is shown verbatim at the moment of decision, the
// partial-rotation outcome is reported honestly, and a failed revoke leaves the confirm OPEN
// (the link is still live — pretending otherwise would be the one lie this file must not tell).
vi.mock('@/app/actions/share', () => ({ revokeShareLinkAction }))

import { ShareLinkPanel } from './ShareLinkPanel'
import {
  REVOKE_ACTION,
  REVOKE_BODY,
  REVOKE_CANCEL,
  REVOKE_CONFIRM,
  REVOKE_DONE,
  REVOKE_FAILED,
  REVOKE_PARTIAL,
  REVOKE_TITLE,
  SHARE_LINK_LIVE,
  SHARE_LINK_NONE,
} from '@/lib/share/copy'

const clipboardWrite = vi.fn()

const LIVE = { runId: 'run-1', token: 'tok-1', url: 'https://runinsights.example/s/tok-1' }

beforeEach(() => {
  revokeShareLinkAction.mockReset()
  clipboardWrite.mockReset()
  Object.defineProperty(window.navigator, 'clipboard', {
    value: { writeText: clipboardWrite },
    configurable: true,
  })
})

async function click(label: string) {
  fireEvent.click(screen.getByRole('button', { name: label }))
  await act(async () => {})
  await act(async () => {})
}

describe('ShareLinkPanel', () => {
  it('an unshared run says so, points at the header glyph, and offers no revoke', () => {
    render(<ShareLinkPanel runId="run-1" token={null} url={null} />)

    expect(screen.getByText(SHARE_LINK_NONE)).toBeInTheDocument()
    expect(screen.queryByText(SHARE_LINK_LIVE)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: REVOKE_ACTION })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Copy link' })).not.toBeInTheDocument()
  })

  it('a live link shows the URL, who can see it, the copy control, and the way out', () => {
    render(<ShareLinkPanel {...LIVE} />)

    expect(screen.getByText(SHARE_LINK_LIVE)).toBeInTheDocument()
    expect(screen.getByLabelText('Share link')).toHaveValue(LIVE.url)
    expect(screen.getByRole('button', { name: 'Copy link' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: REVOKE_ACTION })).toBeInTheDocument()
    expect(screen.getByText(/Anyone with the link can see this run/)).toBeInTheDocument()
  })

  it('copying succeeds into the clipboard and the button says Copied', async () => {
    clipboardWrite.mockResolvedValue(undefined)
    render(<ShareLinkPanel {...LIVE} />)

    await click('Copy link')

    expect(clipboardWrite).toHaveBeenCalledWith(LIVE.url)
    expect(screen.getByRole('button', { name: 'Copied' })).toBeInTheDocument()
  })

  it('a refused clipboard keeps the Copy link label — no crash, no lie', async () => {
    clipboardWrite.mockRejectedValue(new Error('denied'))
    render(<ShareLinkPanel {...LIVE} />)

    await click('Copy link')

    expect(screen.getByRole('button', { name: 'Copy link' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Copied' })).not.toBeInTheDocument()
  })

  it('Stop sharing swaps for the inline confirm — R-38’s text, verbatim, beside the buttons', async () => {
    // Opening the confirm is pure client state — the action is not called until REVOKE_CONFIRM.
    render(<ShareLinkPanel {...LIVE} />)

    fireEvent.click(screen.getByRole('button', { name: REVOKE_ACTION }))
    await act(async () => {})

    // The entry button is gone while confirming — one destructive control at a time.
    expect(screen.getByText(REVOKE_TITLE)).toBeInTheDocument()
    expect(screen.getByText(REVOKE_BODY)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: REVOKE_CONFIRM })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: REVOKE_CANCEL })).toBeInTheDocument()
    expect(screen.queryByText(SHARE_LINK_LIVE)).toBeInTheDocument() // the state stays readable
    expect(revokeShareLinkAction).not.toHaveBeenCalled()
  })

  it('a completed revoke reports "Sharing stopped." and folds the confirm away', async () => {
    revokeShareLinkAction.mockResolvedValue({ ok: true, photosRotated: 3, photosStillLive: 0 })
    render(<ShareLinkPanel {...LIVE} />)

    await click(REVOKE_ACTION)
    await click(REVOKE_CONFIRM)

    expect(screen.getByText(REVOKE_DONE)).toBeInTheDocument()
    expect(screen.queryByText(REVOKE_TITLE)).not.toBeInTheDocument()
    expect(revokeShareLinkAction).toHaveBeenCalledWith('run-1')
  })

  it('a partial rotation is reported as partial — the link is dead AND old image links may live', async () => {
    revokeShareLinkAction.mockResolvedValue({ ok: true, photosRotated: 1, photosStillLive: 2 })
    render(<ShareLinkPanel {...LIVE} />)

    await click(REVOKE_ACTION)
    await click(REVOKE_CONFIRM)

    expect(screen.getByText(REVOKE_PARTIAL)).toBeInTheDocument()
    expect(screen.queryByText(REVOKE_DONE)).not.toBeInTheDocument()
  })

  it('a failed revoke says the link is STILL LIVE — and leaves the confirm open', async () => {
    revokeShareLinkAction.mockResolvedValue({ ok: false, error: 'failed' })
    render(<ShareLinkPanel {...LIVE} />)

    await click(REVOKE_ACTION)
    await click(REVOKE_CONFIRM)

    expect(screen.getByText(REVOKE_FAILED)).toBeInTheDocument()
    // Still confirming: the decision was made but nothing happened, so the buttons stay.
    expect(screen.getByRole('button', { name: REVOKE_CONFIRM })).toBeInTheDocument()
  })

  it('Keep sharing backs out with nothing called and no notice left behind', async () => {
    revokeShareLinkAction.mockResolvedValue({ ok: true, photosRotated: 0, photosStillLive: 0 })
    render(<ShareLinkPanel {...LIVE} />)

    await click(REVOKE_ACTION)
    await click(REVOKE_CANCEL)

    expect(revokeShareLinkAction).not.toHaveBeenCalled()
    expect(screen.queryByText(REVOKE_TITLE)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: REVOKE_ACTION })).toBeInTheDocument()
    expect(screen.queryByText(REVOKE_DONE)).not.toBeInTheDocument()
  })
})
