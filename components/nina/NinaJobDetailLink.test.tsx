// @vitest-environment happy-dom
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { ninaImageJobExists } = vi.hoisted(() => ({ ninaImageJobExists: vi.fn() }))
vi.mock('@/lib/nina/jobActions', () => ({ ninaImageJobExists }))

const { push } = vi.hoisted(() => ({ push: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }))

import { NinaJobDetailLink, NINA_JOB_DETAIL_LINK_LABEL } from './NinaJobDetailLink'
// Real: the sentence and the href are the two things this control must not invent locally.
import { NINA_JOB_GONE_NOTE, ninaJobHref } from '@/lib/nina/jobview'

const JOB_ID = 'job000000001'

function control() {
  return screen.getByRole('link', { name: NINA_JOB_DETAIL_LINK_LABEL })
}

/** `resetAllMocks`, not `clearAllMocks`: a `mockResolvedValueOnce` left unconsumed by a failing
 *  test would otherwise ghost into the next one. */
beforeEach(() => {
  vi.resetAllMocks()
  ninaImageJobExists.mockResolvedValue({ exists: true })
})

describe('NinaJobDetailLink — the pre-flight', () => {
  it('navigates, and runs onNavigate first, when the job page would render', async () => {
    const onNavigate = vi.fn()
    render(<NinaJobDetailLink jobId={JOB_ID} onNavigate={onNavigate} />)

    fireEvent.click(control())

    await waitFor(() => expect(push).toHaveBeenCalledWith(ninaJobHref(JOB_ID)))
    expect(ninaImageJobExists).toHaveBeenCalledWith({ jobId: JOB_ID })
    expect(onNavigate).toHaveBeenCalledTimes(1)
    expect(screen.queryByText(NINA_JOB_GONE_NOTE)).not.toBeInTheDocument()
  })

  it('shows one line and navigates NOWHERE when the job is gone', async () => {
    // The bug report, in one test: "if the page does not exist (has been deleted, etc) we do not
    // redirect after pressing the button, user only got a 2sec one-line notification popup".
    const onNavigate = vi.fn()
    ninaImageJobExists.mockResolvedValue({ exists: false })
    render(<NinaJobDetailLink jobId={JOB_ID} onNavigate={onNavigate} />)

    fireEvent.click(control())

    expect(await screen.findByText(NINA_JOB_GONE_NOTE)).toBeInTheDocument()
    expect(push).not.toHaveBeenCalled()
    // `onNavigate` is a NAVIGATION callback, and on this branch there was none. ChatScreen passes
    // `closeViewer` through it, so firing it here would take down the photograph the runner is
    // looking at — the exact thing the fix exists to stop.
    expect(onNavigate).not.toHaveBeenCalled()
  })

  it('says the same line when the action itself throws', async () => {
    // Offline, or a server error. "I could not open it" is what both mean to the runner, and
    // pushing anyway would be guessing in the direction the bug report asked us to stop guessing.
    ninaImageJobExists.mockRejectedValue(new Error('offline'))
    render(<NinaJobDetailLink jobId={JOB_ID} />)

    fireEvent.click(control())

    expect(await screen.findByText(NINA_JOB_GONE_NOTE)).toBeInTheDocument()
    expect(push).not.toHaveBeenCalled()
  })

  it('still carries the real href, so ⌘-click opens the job page in a new tab', () => {
    // The anchor is not decoration. A modified click is the BROWSER's to handle: our handler bails
    // before `preventDefault`, no action runs, and the platform opens `href` in a background tab.
    render(<NinaJobDetailLink jobId={JOB_ID} />)
    expect(control()).toHaveAttribute('href', ninaJobHref(JOB_ID))

    // happy-dom follows an un-prevented anchor for real; this neutralises only the navigation, so
    // the assertion below is about what our own handler did (nothing).
    const stopNativeNav = (event: Event) => event.preventDefault()
    document.addEventListener('click', stopNativeNav, { capture: true })
    try {
      fireEvent.click(control(), { metaKey: true })
    } finally {
      document.removeEventListener('click', stopNativeNav, { capture: true })
    }

    expect(ninaImageJobExists).not.toHaveBeenCalled()
    expect(push).not.toHaveBeenCalled()
  })

  it('ignores a second tap while the first is still in flight', async () => {
    let settle!: (value: { exists: boolean }) => void
    ninaImageJobExists.mockReturnValue(
      new Promise<{ exists: boolean }>((resolve) => (settle = resolve)),
    )
    render(<NinaJobDetailLink jobId={JOB_ID} />)

    fireEvent.click(control())
    await waitFor(() => expect(control()).toHaveAttribute('aria-busy', 'true'))
    fireEvent.click(control())

    expect(ninaImageJobExists).toHaveBeenCalledTimes(1)

    await act(async () => settle({ exists: true }))
    expect(push).toHaveBeenCalledTimes(1)
  })
})

describe('NinaJobDetailLink — the line is transient', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('clears itself after two seconds', async () => {
    // `fireEvent` and an act-wrapped `advanceTimersByTimeAsync`, never `userEvent`: userEvent's own
    // internal delay never resolves under vitest's fake timers.
    ninaImageJobExists.mockResolvedValue({ exists: false })
    render(<NinaJobDetailLink jobId={JOB_ID} />)

    fireEvent.click(control())
    await act(async () => {})
    expect(screen.getByText(NINA_JOB_GONE_NOTE)).toBeInTheDocument()

    await act(async () => void (await vi.advanceTimersByTimeAsync(1999)))
    expect(screen.getByText(NINA_JOB_GONE_NOTE)).toBeInTheDocument()

    await act(async () => void (await vi.advanceTimersByTimeAsync(1)))
    expect(screen.queryByText(NINA_JOB_GONE_NOTE)).not.toBeInTheDocument()
  })

  it('a second refused tap restarts the two seconds rather than inheriting the first clock', async () => {
    ninaImageJobExists.mockResolvedValue({ exists: false })
    render(<NinaJobDetailLink jobId={JOB_ID} />)

    fireEvent.click(control())
    await act(async () => {})
    await act(async () => void (await vi.advanceTimersByTimeAsync(1500)))

    fireEvent.click(control())
    await act(async () => {})
    // 1500 + 1000 is past the first tap's deadline and short of the second's.
    await act(async () => void (await vi.advanceTimersByTimeAsync(1000)))
    expect(screen.getByText(NINA_JOB_GONE_NOTE)).toBeInTheDocument()

    await act(async () => void (await vi.advanceTimersByTimeAsync(1000)))
    expect(screen.queryByText(NINA_JOB_GONE_NOTE)).not.toBeInTheDocument()
  })
})
