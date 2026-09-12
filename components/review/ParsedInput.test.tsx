// @vitest-environment happy-dom
import { act } from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import {
  parseIntInput,
  parseDurationInput,
  toDurationInput,
  toIntInput,
} from '@/lib/review/inputs'

import { ParsedInput } from './ParsedInput'

/**
 * The component the whole review screen types into, and the reason a 55-input table is
 * correctable at all. Its doc comment states the contract; these tests hold it to each clause:
 *
 *  - the string is LOCAL and the number is LIFTED — intermediate unparseable states render, are
 *    flagged, and push nothing;
 *  - a parse failure never collapses into `null` (a typo must not erase a real number);
 *  - re-seeding happens only when the external value stops agreeing with what is typed, so the
 *    reviewer's own spelling of the same number survives an unrelated re-render;
 *  - `deferError` holds the message until blur but never changes the value contract;
 *  - a server-side `error` outranks the local state and is never deferred;
 *  - a masked field pins the caret to the end while focused.
 *
 * The REAL parsers and spellers from `lib/review/inputs` run underneath — the same rule
 * `tests/capture/dataset.test.ts` states from the other side: never a second copy of the
 * arithmetic, or the test passes while the contract the two copies encode has already drifted.
 */

/** Focus as a real .focus(), never fireEvent.focus: the caret pin and `touched` both read
 * `document.activeElement`, and a synthetic focus event does not move focus in happy-dom any
 * more than it does in a browser. */
function focusInput(input: HTMLInputElement) {
  act(() => input.focus())
}

function renderInt(props: Partial<Parameters<typeof ParsedInput<number | null>>[0]> = {}) {
  const onChange = vi.fn()
  render(
    <ParsedInput<number | null>
      value={null}
      toText={toIntInput}
      parse={(t) => parseIntInput(t)}
      onChange={onChange}
      aria-label="field"
      {...props}
    />,
  )
  return { onChange, input: screen.getByLabelText('field') as HTMLInputElement }
}

function renderDuration(
  props: Partial<Parameters<typeof ParsedInput<number | null>>[0]> = {},
) {
  const onChange = vi.fn()
  render(
    <ParsedInput<number | null>
      value={null}
      toText={toDurationInput}
      parse={parseDurationInput}
      onChange={onChange}
      aria-label="field"
      {...props}
    />,
  )
  return { onChange, input: screen.getByLabelText('field') as HTMLInputElement }
}

describe('ParsedInput — the value contract', () => {
  it('seeds an integer field with the stored integer', () => {
    renderInt({ value: 288 })

    expect(screen.getByLabelText('field')).toHaveValue('288')
  })

  it('seeds a duration field the way the splits table prints it', () => {
    renderDuration({ value: 288 })

    expect(screen.getByLabelText('field')).toHaveValue('4:48')
  })

  it('pushes the parsed number up on every parseable keystroke', () => {
    const { onChange, input } = renderInt()

    fireEvent.change(input, { target: { value: '1' } })
    fireEvent.change(input, { target: { value: '12' } })

    expect(onChange).toHaveBeenCalledTimes(2)
    expect(onChange).toHaveBeenNthCalledWith(1, 1)
    expect(onChange).toHaveBeenNthCalledWith(2, 12)
  })

  it('a cleared field pushes null — blank is a value, not a failure', () => {
    const { onChange, input } = renderInt({ value: 288 })

    fireEvent.change(input, { target: { value: '' } })

    expect(input).toHaveValue('')
    expect(onChange).toHaveBeenCalledWith(null)
    expect(input).not.toHaveAttribute('aria-invalid')
  })

  it('an unparseable entry renders, is marked invalid, and pushes NOTHING', () => {
    const { onChange, input } = renderInt({ value: 288 })

    fireEvent.change(input, { target: { value: '28o' } })

    // The text stays — refusing the keystroke would make the destination unreachable…
    expect(input).toHaveValue('28o')
    expect(input).toHaveAttribute('aria-invalid', 'true')
    // …and null is a legitimate value, so the failure is never collapsed into one.
    expect(onChange).not.toHaveBeenCalled()
  })

  it('the local error names itself and is wired to the input by aria-describedby', () => {
    const { input } = renderInt({ value: 288 })

    fireEvent.change(input, { target: { value: 'x' } })

    const message = screen.getByText('That does not read as a number.')
    expect(message).toHaveAttribute('id', input.getAttribute('aria-describedby'))
  })

  it('recovering from a typo clears the error and resumes pushing values', () => {
    const { onChange, input } = renderInt({ value: 288 })

    fireEvent.change(input, { target: { value: '28o' } })
    fireEvent.change(input, { target: { value: '288' } })

    expect(screen.queryByText('That does not read as a number.')).not.toBeInTheDocument()
    expect(input).not.toHaveAttribute('aria-invalid')
    expect(onChange).toHaveBeenLastCalledWith(288)
  })
})

describe('ParsedInput — re-seeding', () => {
  function renderIntAt(value: number | null) {
    render(
      <ParsedInput<number | null>
        value={value}
        toText={toIntInput}
        parse={(t) => parseIntInput(t)}
        onChange={() => {}}
        aria-label="field"
      />,
    )
    return screen.getByLabelText('field') as HTMLInputElement
  }

  const rerenderAt = (value: number | null) => (
    <ParsedInput<number | null>
      value={value}
      toText={toIntInput}
      parse={(t) => parseIntInput(t)}
      onChange={() => {}}
      aria-label="field"
    />
  )

  it('an external value change re-seeds the text when the typed text disagrees', () => {
    const { rerender } = render(rerenderAt(288))
    const input = screen.getByLabelText('field') as HTMLInputElement
    expect(input).toHaveValue('288')

    // The partial toggle rewriting a pace is the doc comment's own programmatic case.
    rerender(rerenderAt(430))

    expect(input).toHaveValue('430')
  })

  it('the reviewer’s own spelling survives a re-render that carries the same value', () => {
    const { rerender } = render(rerenderAt(288))
    const input = screen.getByLabelText('field') as HTMLInputElement

    // `0288` parses to 288 — it agrees with the external value, so an unrelated re-render
    // (a sibling keystroke, a check recomputation) must not rewrite it to `288`.
    fireEvent.change(input, { target: { value: '0288' } })

    rerender(rerenderAt(288))

    expect(input).toHaveValue('0288')
  })

  it('re-seeding also clears a stale invalid flag', () => {
    const { rerender } = render(rerenderAt(288))
    const input = screen.getByLabelText('field') as HTMLInputElement

    fireEvent.change(input, { target: { value: '28o' } })
    expect(input).toHaveAttribute('aria-invalid', 'true')

    rerender(rerenderAt(430))

    expect(input).toHaveValue('430')
    expect(input).not.toHaveAttribute('aria-invalid')
  })
})

describe('ParsedInput — the mask', () => {
  it('lays digits right-to-left and draws the colons itself', () => {
    const { onChange, input } = renderDuration({ mask: 'mm:ss' })

    fireEvent.change(input, { target: { value: '448' } })

    expect(input).toHaveValue('4:48')
    expect(onChange).toHaveBeenLastCalledWith(288)
  })

  it('typing the colon anyway is idempotent — desktop keyboards still work', () => {
    const { onChange, input } = renderDuration({ mask: 'mm:ss' })

    fireEvent.change(input, { target: { value: '4:48' } })

    expect(input).toHaveValue('4:48')
    expect(onChange).toHaveBeenLastCalledWith(288)
  })

  it('is clearable — backspacing out of 0:01 reaches blank, not a sticky 0:00', async () => {
    const user = userEvent.setup()
    const { onChange, input } = renderDuration({ value: 1, mask: 'mm:ss' })
    focusInput(input)

    await user.keyboard('{Backspace}')

    expect(input).toHaveValue('')
    expect(onChange).toHaveBeenLastCalledWith(null)
  })

  it('pins the caret to the end after each keystroke while focused', () => {
    const { input } = renderDuration({ value: 288, mask: 'mm:ss' })
    focusInput(input)
    // Start from a mid-string caret so the assertion cannot pass trivially: happy-dom's own
    // value setter also lands selection at the end, so only a deliberate 0 first makes the pin
    // observable.
    act(() => input.setSelectionRange(0, 0))

    fireEvent.change(input, { target: { value: '448' } })

    // The mask re-lays the whole string, so a caret left mid-string would edit digits the
    // reviewer is not looking at. Right-to-left entry is the entire gesture.
    expect(input.selectionStart).toBe(input.value.length)
    expect(input.selectionEnd).toBe(input.value.length)
  })

  it('the hh:mm:ss shape holds the fixture’s own 1:18:36 and a bare ninety minutes', () => {
    const { onChange, input } = renderDuration({ mask: 'hh:mm:ss' })

    fireEvent.change(input, { target: { value: '11836' } })
    expect(input).toHaveValue('1:18:36')
    expect(onChange).toHaveBeenLastCalledWith(4716)

    fireEvent.change(input, { target: { value: '9000' } })
    expect(input).toHaveValue('90:00')
    // Only the LEADING field may exceed 59 — '90:00' is a legitimate ninety minutes.
    expect(onChange).toHaveBeenLastCalledWith(5400)
  })
})

describe('ParsedInput — deferError', () => {
  /**
   * `aria-invalid` is gated on the MESSAGE, not on the internal invalid flag — so while the
   * message is deferred, the input shows no failure signal at all. That is the component's
   * documented bargain ("only the red text is deferred"), pinned here in all three phases:
   * typing, blurring, and returning. If the signal ever fires while typing, these flip
   * deliberately.
   */

  it('holds the invalid message through intermediate mask states until blur', () => {
    const { input } = renderDuration({ value: 288, mask: 'mm:ss', deferError: true })

    // '1:83' — the fourth keystroke on the way to 1:18:36. The mask cannot refuse it without
    // making the destination unreachable, so the message waits instead — and with it,
    // aria-invalid, which rides the message.
    fireEvent.change(input, { target: { value: '183' } })
    expect(input).toHaveValue('1:83')
    expect(input).not.toHaveAttribute('aria-invalid')
    expect(screen.queryByText('That does not read as a number.')).not.toBeInTheDocument()

    fireEvent.blur(input)

    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByText('That does not read as a number.')).toBeInTheDocument()
  })

  it('returning to the field resets the touched flag, so a held error is held again', () => {
    const { input } = renderDuration({ value: 288, mask: 'mm:ss', deferError: true })

    fireEvent.change(input, { target: { value: '183' } })
    fireEvent.blur(input)
    expect(screen.getByText('That does not read as a number.')).toBeInTheDocument()

    fireEvent.focus(input)

    expect(screen.queryByText('That does not read as a number.')).not.toBeInTheDocument()
    expect(input).not.toHaveAttribute('aria-invalid')
  })

  it('a valid entry at blur leaves no error and the value already pushed', () => {
    const { onChange, input } = renderDuration({ value: 288, mask: 'mm:ss', deferError: true })

    fireEvent.change(input, { target: { value: '448' } })
    fireEvent.blur(input)

    expect(screen.queryByText(/does not read as a number/)).not.toBeInTheDocument()
    expect(onChange).toHaveBeenLastCalledWith(288)
  })

  it('WITHOUT deferError the same intermediate state is red immediately', () => {
    // Thirteen of the call sites are integer fields with no intermediate states to defer —
    // this is what those get: the message on the very keystroke that goes wrong.
    const { input } = renderDuration({ value: 288, mask: 'mm:ss' })

    fireEvent.change(input, { target: { value: '183' } })

    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByText('That does not read as a number.')).toBeInTheDocument()
  })
})

describe('ParsedInput — server-side error', () => {
  it('outranks the local parse state and replaces the local message', () => {
    renderInt({ value: 288, error: 'Duration must be at least one minute.' })

    // No local failure has even happened — the server error shows on its own.
    const message = screen.getByText('Duration must be at least one minute.')
    expect(screen.queryByText('That does not read as a number.')).not.toBeInTheDocument()
    expect(screen.getByLabelText('field')).toHaveAttribute(
      'aria-describedby',
      message.getAttribute('id'),
    )
  })

  it('still shows when deferError would have held the local one', () => {
    const { input } = renderDuration({
      value: 288,
      mask: 'mm:ss',
      deferError: true,
      error: 'Duration must be at least one minute.',
    })

    // An unparseable intermediate state under a deferred local error: the server message shows
    // regardless, because it did not arrive from the keystroke under the reviewer's thumb.
    fireEvent.change(input, { target: { value: '183' } })

    expect(screen.getByText('Duration must be at least one minute.')).toBeInTheDocument()
    expect(screen.queryByText('That does not read as a number.')).not.toBeInTheDocument()
  })
})

describe('ParsedInput — passthrough', () => {
  it('forwards placeholder, inputMode override, className and an external ref', async () => {
    const ref = { current: null as HTMLInputElement | null }
    const { input } = renderInt({
      placeholder: '10.67',
      inputMode: 'decimal',
      className: 'pr-10',
      ref,
    })

    expect(input).toHaveAttribute('placeholder', '10.67')
    expect(input).toHaveAttribute('inputmode', 'decimal')
    // `numeric` is the default — HeroFields' distance field opts into `decimal`.
    expect(input).toHaveClass('pr-10')
    await waitFor(() => expect(ref.current).toBe(input))
  })

  it('defaults to inputmode=numeric — the digits-only keypad the colon fields mask around', () => {
    const { input } = renderInt()

    expect(input).toHaveAttribute('inputmode', 'numeric')
    expect(input).toHaveAttribute('autocomplete', 'off')
    expect(input).toHaveAttribute('type', 'text')
  })

  it('typing end-to-end through userEvent lands the same as synthetic changes', async () => {
    const user = userEvent.setup()
    const { onChange, input } = renderInt()

    await user.click(input)
    await user.keyboard('173')

    expect(input).toHaveValue('173')
    expect(onChange).toHaveBeenLastCalledWith(173)
  })
})
