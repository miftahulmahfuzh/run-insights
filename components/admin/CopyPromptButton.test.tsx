// @vitest-environment happy-dom
import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { CopyPromptButton } from './CopyPromptButton'

/*
 * `ShareButton.test.tsx`'s clipboard harness, minus the share rungs this control deliberately does
 * not have: `navigator.clipboard` is not implemented by happy-dom, so it is defined per test and
 * deleted after, and `configurable: true` is what makes the second `defineProperty` legal.
 *
 * Fake timers drive the one piece of time in this component — the tick's revert after
 * `COPY_HOLD_MS`. Interactions are `fireEvent` for the reason this repo records everywhere:
 * `userEvent` never returns under faked timers, because its internal waits are `setTimeout`s
 * nothing advances.
 */
const writeText = vi.fn()

async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
}

const button = (name: string) => screen.getByRole('button', { name })

beforeEach(() => {
  vi.useFakeTimers()
  writeText.mockReset().mockResolvedValue(undefined)
  Object.defineProperty(window.navigator, 'clipboard', {
    value: { writeText },
    configurable: true,
  })
})

afterEach(() => {
  delete (window.navigator as { clipboard?: unknown }).clipboard
  vi.useRealTimers()
})

describe('CopyPromptButton', () => {
  it('writes the exact text and shows the tick, which then reverts to the copy glyph', async () => {
    render(<CopyPromptButton text="PROMPT TEXT" label="Copy the assembled image prompt" />)

    fireEvent.click(button('Copy the assembled image prompt'))
    await advance(0)

    expect(writeText).toHaveBeenCalledWith('PROMPT TEXT')
    expect(button('Copied')).toBeInTheDocument()

    // A permanently-ticked button has stopped reading as a copy button.
    await advance(2_000)
    expect(button('Copy the assembled image prompt')).toBeInTheDocument()
  })

  it('says the copy out loud: a clipboard write moves nothing on screen but the glyph', async () => {
    render(<CopyPromptButton text="PROMPT TEXT" label="Copy it" />)
    fireEvent.click(button('Copy it'))
    await advance(0)

    const live = screen.getByRole('status')
    expect(live).toHaveTextContent('Copied')
    expect(live).toHaveClass('sr-only')
  })

  it('a refused clipboard says so, and never claims a copy that did not happen', async () => {
    writeText.mockRejectedValue(new Error('insecure context'))
    render(<CopyPromptButton text="PROMPT TEXT" label="Copy it" />)

    fireEvent.click(button('Copy it'))
    await advance(0)

    expect(screen.queryByRole('button', { name: 'Copied' })).not.toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Could not copy')
    expect(button('Copy it')).toBeInTheDocument()
  })

  it('is dead rather than lying when there is no prompt to copy', () => {
    render(<CopyPromptButton text="" label="Copy it" />)

    expect(button('Copy it')).toBeDisabled()
    fireEvent.click(button('Copy it'))
    expect(writeText).not.toHaveBeenCalled()
  })

  it('takes its position from the caller and keeps its own behaviour classes', () => {
    render(<CopyPromptButton text="x" label="Copy it" className="absolute top-2.5 right-2.5" />)

    const el = button('Copy it')
    expect(el).toHaveClass('absolute', 'top-2.5', 'right-2.5')
    expect(el).toHaveClass('text-accent')
    // The glyph is hidden from the accessible tree: the name is the control's, never the picture's.
    expect(el.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
  })
})
