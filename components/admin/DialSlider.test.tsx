// @vitest-environment happy-dom
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { DialSlider } from './DialSlider'

/**
 * One dial, and the header's real claim: **three different kinds of "changed", all visible.**
 * `defaultValue` deviation is the per-dial undo; accent is "no longer the Nina who shipped";
 * `unsaved` is "not what the row says yet"; `enabled` (R4) is "reaches her prompt at all". They
 * differ for exactly one state — parked away with the toggle OFF — which is accent-free but still
 * offers the undo, and that state is its own test below. The rest pins the a11y wiring (useId
 * label/output/describedby), the native range's attributes, and the Number() coercion on change.
 */

function dial(props?: Partial<Parameters<typeof DialSlider>[0]>) {
  const onChange = vi.fn()
  const view = render(
    <DialSlider
      label="Playfulness"
      value={40}
      defaultValue={60}
      min={0}
      max={100}
      onChange={onChange}
      {...props}
    />,
  )
  return { onChange, ...view }
}

describe('DialSlider', () => {
  it('is a native range input, labelled by the dial’s label', () => {
    const { container } = render(
      <DialSlider
        label="Playfulness"
        value={40}
        defaultValue={60}
        min={0}
        max={100}
        onChange={vi.fn()}
      />,
    )
    const input = container.querySelector('input[type="range"]')
    expect(input).not.toBeNull()
    const label = screen.getByText('Playfulness')
    expect(label).toHaveAttribute('for', input?.id)
  })

  it('passes min, max and the current value to the native control', () => {
    const { container } = dial({ min: 10, max: 90, value: 45 })
    const input = container.querySelector('input[type="range"]')!
    expect(input).toHaveAttribute('min', '10')
    expect(input).toHaveAttribute('max', '90')
    expect(input).toHaveValue('45')
  })

  it('steps in whole integers — hardcoded, not a prop (no caller ever wanted otherwise)', () => {
    const { container } = dial()
    expect(container.querySelector('input[type="range"]')).toHaveAttribute('step', '1')
  })

  it('reports the value in an <output>, wired to the input', () => {
    const { container } = dial({ value: 72 })
    const input = container.querySelector('input[type="range"]')!
    const output = container.querySelector('output')!
    expect(output).toHaveTextContent('72')
    expect(output).toHaveAttribute('for', input.id)
  })

  it('hands onChange a NUMBER, not the DOM’s string', () => {
    const { container, onChange } = dial()
    fireEvent.change(container.querySelector('input[type="range"]')!, { target: { value: '42' } })
    expect(onChange).toHaveBeenCalledWith(42)
    expect(onChange.mock.calls[0]![0]!).toBeTypeOf('number')
  })

  it('wires the hint through aria-describedby, and omits the attribute when there is no hint', () => {
    const withHint = dial({ hint: 'Higher is sillier.' })
    const hintedInput = withHint.container.querySelector('input[type="range"]')!
    const hint = screen.getByText('Higher is sillier.')
    expect(hintedInput).toHaveAttribute('aria-describedby', hint.id)

    const withoutHint = dial({ label: 'Bare', hint: undefined })
    expect(withoutHint.container.querySelector('input[type="range"]')).not.toHaveAttribute(
      'aria-describedby',
    )
  })

  it('offers the per-dial undo, labelled with the default, when parked away from it', async () => {
    const user = userEvent.setup()
    const { onChange } = dial({ value: 40, defaultValue: 60 })
    await user.click(screen.getByRole('button', { name: 'default 60' }))
    expect(onChange).toHaveBeenCalledWith(60)
  })

  it('has no undo button when the dial sits at its default', () => {
    dial({ value: 60, defaultValue: 60 })
    expect(screen.queryByRole('button', { name: /default/ })).not.toBeInTheDocument()
  })

  it('still offers the undo for a dial parked away with its toggle OFF — but never in accent', () => {
    // R4's exact state, the one the header calls out: `deviates` and `moved` differ here. The
    // dial contributes zero bytes, so she IS the shipping Nina on this axis — no accent — yet the
    // operator may still want to clear the parked value without re-enabling first.
    dial({ value: 40, defaultValue: 60, enabled: false, onEnabledChange: vi.fn() })
    expect(screen.getByRole('button', { name: 'default 60' })).toBeInTheDocument()
    const output = screen.getByText('40').closest('output')!
    expect(output).not.toHaveClass('text-accent')
    expect(output).toHaveClass('text-ink-3')
  })

  it('shows the value in accent only when it deviates AND the dial is enabled', () => {
    const moved = dial({ value: 40, defaultValue: 60 })
    expect(moved.container.querySelector('output')).toHaveClass('text-accent')

    const atDefault = dial({ label: 'B', value: 60, defaultValue: 60 })
    expect(atDefault.container.querySelector('output')).not.toHaveClass('text-accent')
  })

  it('marks unsaved drafts with a "Unsaved" dot before the number', () => {
    dial({ unsaved: true })
    expect(screen.getByTitle('Unsaved')).toBeInTheDocument()
    const noDot = dial({ label: 'B', unsaved: false })
    expect(noDot.container.querySelector('[title="Unsaved"]')).toBeNull()
  })

  it('renders the "off" suffix, a struck label and dimmed container when the dial is disabled by its toggle', () => {
    const { container } = dial({ enabled: false, onEnabledChange: vi.fn() })
    expect(screen.getByText('off')).toBeInTheDocument()
    expect(screen.getByText('Playfulness')).toHaveClass('line-through')
    expect(container.firstElementChild).toHaveClass('opacity-70')
  })

  it('omits the "off" suffix for an enabled dial even at a non-default value', () => {
    dial({ enabled: true })
    expect(screen.queryByText('off')).not.toBeInTheDocument()
  })

  it('renders the R4 toggle with a 44px-box label and an sr-only accessible name', () => {
    dial({ onEnabledChange: vi.fn() })
    const checkbox = screen.getByRole('checkbox', { name: 'Include Playfulness in her prompt' })
    expect(checkbox).toBeChecked()
    // The 44px hit area is the wrapping label, not the 16px glyph.
    expect(checkbox.closest('label')).toHaveClass('min-h-11', 'min-w-11')
  })

  it('reports the checkbox’s next boolean, not an event, to onEnabledChange', async () => {
    const user = userEvent.setup()
    const onEnabledChange = vi.fn()
    dial({ enabled: true, onEnabledChange })
    await user.click(screen.getByRole('checkbox', { name: 'Include Playfulness in her prompt' }))
    expect(onEnabledChange).toHaveBeenCalledWith(false)
  })

  it('renders NO toggle when onEnabledChange is omitted — absent means "no toggle", not "always on"', () => {
    dial()
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
  })

  it('keeps the 44px floor on the track and the undo (the touch contract, do not shrink)', () => {
    const { container } = dial({ value: 40 })
    expect(container.querySelector('input[type="range"]')).toHaveClass('h-11')
    expect(screen.getByRole('button', { name: 'default 60' })).toHaveClass('min-h-11')
  })
})
