// @vitest-environment happy-dom
import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { setRunIntentAction } = vi.hoisted(() => ({ setRunIntentAction: vi.fn() }))
// The one collaborator is a Server Action (cookies + Postgres behind it). Everything these tests
// pin is the chips' own contract: four outline chips when unset, the chosen chip alone when set,
// optimistic fill on tap, tap-to-clear, and the two-commit settle where React hands the answer back
// to whatever the server says the run is.
vi.mock('@/lib/runs/actions', () => ({ setRunIntentAction }))

import { IntentChips } from './IntentChips'

/**
 * Flush helper, spelled out: React 19 settles a transition over TWO commits — the optimistic value
 * (and `aria-busy`) land in the first, and `isPending` flips in a second commit after the awaited
 * action resolves. One `act` per commit; asserting between them is how the mid-flight state is
 * observed deterministically instead of by race.
 */
async function flushTransition() {
  await act(async () => {})
  await act(async () => {})
}

describe('IntentChips', () => {
  beforeEach(() => {
    setRunIntentAction.mockReset()
  })

  it('an unset run offers four outline chips and asks the question', () => {
    render(<IntentChips runId="r1" intent={null} />)

    for (const label of ['Easy', 'Tempo', 'Long', 'Race']) {
      expect(screen.getByRole('button', { name: label })).toHaveAttribute('aria-pressed', 'false')
    }
    expect(
      screen.getByText('What was this run meant to be? It changes how the analysis reads it.'),
    ).toBeInTheDocument()
    expect(setRunIntentAction).not.toHaveBeenCalled()
  })

  it('a run with an intent shows the chosen chip alone, filled — no greyed alternatives to second-guess', () => {
    render(<IntentChips runId="r1" intent="race" />)

    expect(screen.getByRole('button', { name: 'Race' })).toHaveAttribute('aria-pressed', 'true')
    for (const label of ['Easy', 'Tempo', 'Long']) {
      expect(screen.queryByRole('button', { name: label })).not.toBeInTheDocument()
    }
    expect(screen.getByText('Tap again to clear.')).toBeInTheDocument()
  })

  it('the fill is optimistic: the chip answers before the server does, then the row busy-marks', async () => {
    let resolve!: (value: { ok: true }) => void
    setRunIntentAction.mockImplementation(
      () => new Promise<{ ok: true }>((res) => (resolve = res)),
    )
    const { container } = render(<IntentChips runId="r1" intent={null} />)
    const row = container.firstElementChild as HTMLElement

    fireEvent.click(screen.getByRole('button', { name: 'Easy' }))
    await act(async () => {}) // first commit: the optimistic value

    expect(screen.getByRole('button', { name: 'Easy' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.queryByRole('button', { name: 'Tempo' })).not.toBeInTheDocument()
    expect(setRunIntentAction).toHaveBeenCalledWith('r1', 'easy')

    await act(async () => {
      resolve({ ok: true })
    })
    await act(async () => {}) // second commit: isPending flips
    expect(row).not.toHaveAttribute('aria-busy')
  })

  it('the server’s answer wins when the transition ends — the prop did not change, so the fill reverts', async () => {
    // The docstring's contract, both halves: the chip fills the instant it is tapped, and reverts
    // when the action settles. (On the real page a successful action re-renders the server
    // component with the new intent, so the revert is invisible; here, where nothing re-renders
    // the prop, the revert is exactly what a runner would see if the write failed.)
    let resolve!: (value: { ok: true }) => void
    setRunIntentAction.mockImplementation(
      () => new Promise<{ ok: true }>((res) => (resolve = res)),
    )
    render(<IntentChips runId="r1" intent={null} />)

    fireEvent.click(screen.getByRole('button', { name: 'Easy' }))
    await act(async () => {})
    expect(screen.getByRole('button', { name: 'Easy' })).toHaveAttribute('aria-pressed', 'true')

    await act(async () => {
      resolve({ ok: true })
    })
    await flushTransition()

    expect(screen.getByRole('button', { name: 'Easy' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: 'Tempo' })).toBeInTheDocument()
  })

  it('chips are disabled and the row announces busy for the whole flight, and only the flight', async () => {
    let resolve!: (value: { ok: true }) => void
    setRunIntentAction.mockImplementation(
      () => new Promise<{ ok: true }>((res) => (resolve = res)),
    )
    const { container } = render(<IntentChips runId="r1" intent={null} />)
    // aria-busy sits on the chip row (the inner div), not the component's outer wrapper.
    const chipRow = container.firstElementChild?.firstElementChild as HTMLElement

    fireEvent.click(screen.getByRole('button', { name: 'Easy' }))
    await act(async () => {})

    expect(chipRow).toHaveAttribute('aria-busy', 'true')
    expect(screen.getByRole('button', { name: 'Easy' })).toBeDisabled()

    await act(async () => {
      resolve({ ok: true })
    })
    await flushTransition()

    expect(screen.getByRole('button', { name: 'Easy' })).toBeEnabled()
    expect(chipRow).not.toHaveAttribute('aria-busy')
  })

  it('tapping the filled chip clears the intent — a mis-tap on a phone must be undoable', async () => {
    // Controlled promise, resolved inside act: the settle only lands when the action resolves
    // inside React's own flush (a pre-resolved mock leaves the optimistic value stuck).
    let resolve!: (value: { ok: true }) => void
    setRunIntentAction.mockImplementation(
      () => new Promise<{ ok: true }>((res) => (resolve = res)),
    )
    render(<IntentChips runId="r1" intent="race" />)

    fireEvent.click(screen.getByRole('button', { name: 'Race' }))
    await act(async () => {}) // optimistic null: all four chips come back at once

    expect(screen.getByRole('button', { name: 'Easy' })).toBeInTheDocument()
    expect(setRunIntentAction).toHaveBeenCalledWith('r1', null)

    await act(async () => {
      resolve({ ok: true })
    })
    await flushTransition()
    // The prop still says "race" — the revert is the server's answer, the same contract as above.
    expect(screen.getByRole('button', { name: 'Race' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.queryByRole('button', { name: 'Easy' })).not.toBeInTheDocument()
  })

  it('a failed write shows the action’s error sentence and nothing else changes', async () => {
    let resolve!: (value: { ok: false; error: string }) => void
    setRunIntentAction.mockImplementation(
      () => new Promise<{ ok: false; error: string }>((res) => (resolve = res)),
    )
    render(<IntentChips runId="r1" intent={null} />)

    fireEvent.click(screen.getByRole('button', { name: 'Race' }))
    await act(async () => {}) // optimistic fill

    await act(async () => {
      resolve({ ok: false, error: 'Unknown run' })
    })
    await flushTransition()

    expect(screen.getByText('Unknown run')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Race' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: 'Race' })).toBeEnabled()
  })
})
