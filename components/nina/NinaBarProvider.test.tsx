// @vitest-environment happy-dom
import { act, fireEvent, render, screen } from '@testing-library/react'
import { useEffect } from 'react'
import { describe, expect, it } from 'vitest'

// Real `nextBarState`: the provider's whole job is to hold ONE state and forward the machine's own
// events to it — mocking the machine would test that the provider forwards a function name.
import { NinaBarProvider, useNinaBar } from './NinaBarProvider'
import { nextBarState } from '@/lib/nina/chrome'

let latest: ReturnType<typeof useNinaBar> | null = null

/** Reads the context every render, so assertions see the provider's state as consumers do. */
function Probe({ id }: { id?: string }) {
  const ctx = useNinaBar()
  useEffect(() => {
    latest = ctx
  })
  return (
    <button type="button" data-testid={id ?? 'probe'} onClick={() => ctx?.dispatch('toggle')}>
      {ctx?.bar ?? 'null'}
    </button>
  )
}

function toggle() {
  return screen.getByTestId('probe')
}

describe('NinaBarProvider', () => {
  it('rests hidden — the resting geometry is the default, before any writer speaks', () => {
    render(
      <NinaBarProvider>
        <Probe />
      </NinaBarProvider>,
    )
    expect(toggle().textContent).toBe('hidden')
  })

  it('toggle is the machine’s two-way door: hidden → shown → hidden', () => {
    render(
      <NinaBarProvider>
        <Probe />
      </NinaBarProvider>,
    )
    expect(nextBarState('hidden', 'toggle')).toBe('shown')

    fireEvent.click(toggle())
    expect(toggle().textContent).toBe('shown')
    fireEvent.click(toggle())
    expect(toggle().textContent).toBe('hidden')
  })

  it('the other events are one-way doors into hidden, forwarded verbatim', () => {
    render(
      <NinaBarProvider>
        <Probe />
      </NinaBarProvider>,
    )
    fireEvent.click(toggle())
    expect(toggle().textContent).toBe('shown')

    // `dispatch` exposes the machine's own event, so the test forwards the same vocabulary
    // ChatChrome's effects do — no `hideBar()` wrapper to test instead. Direct dispatches need
    // act, since no fireEvent is carrying them.
    act(() => {
      latest?.dispatch('autohide')
    })
    expect(toggle().textContent).toBe('hidden')

    fireEvent.click(toggle())
    act(() => {
      latest?.dispatch('composer-engaged')
    })
    expect(toggle().textContent).toBe('hidden')

    // A release never SHOWS a bar — it only stops forcing it hidden.
    act(() => {
      latest?.dispatch('composer-released')
    })
    expect(toggle().textContent).toBe('hidden')
  })

  it('dispatch keeps a stable identity across state changes', () => {
    render(
      <NinaBarProvider>
        <Probe />
      </NinaBarProvider>,
    )
    const first = latest?.dispatch
    fireEvent.click(toggle())
    expect(latest?.dispatch).toBe(first)
  })

  it('two consumers hold ONE state — the reason this is a provider and not two useStates', () => {
    render(
      <NinaBarProvider>
        <Probe id="probe-a" />
        <Probe id="probe-b" />
      </NinaBarProvider>,
    )
    fireEvent.click(screen.getByTestId('probe-a'))
    expect(screen.getByTestId('probe-b').textContent).toBe('shown')
  })

  it('outside a provider the hook is null — degrade, never crash', () => {
    render(<Probe />)
    expect(toggle().textContent).toBe('null')
    // Clicking with no dispatch is a no-op, not an error.
    expect(() => fireEvent.click(toggle())).not.toThrow()
  })
})
