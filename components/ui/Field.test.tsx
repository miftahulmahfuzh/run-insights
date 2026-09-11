// @vitest-environment happy-dom
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { CONTROL_CLASS, Field, Input, NumberInput } from './Field'

/**
 * The a11y wiring is the product here: `Field` owns label/id/hint/error/aria-describedby so a
 * feature cannot ship an unlabelled input. Each test pins one wiring contract, by the visible
 * outcome of it — the label's `for` pointing at a real input, an error reaching the input through
 * `aria-invalid`, not just a red paragraph.
 */

function renderField(overrides: { hint?: string; error?: string } = {}) {
  return render(
    <Field label="Resting HR" hint={overrides.hint} error={overrides.error}>
      <Input />
    </Field>,
  )
}

describe('Field + Input wiring', () => {
  it('labels its input: the label’s for points at the input’s generated id', () => {
    renderField()

    const input = screen.getByRole('textbox', { name: 'Resting HR' })
    const label = screen.getByText('Resting HR')
    expect(label.tagName).toBe('LABEL')
    expect(label).toHaveAttribute('for', input.id)
    expect(input.id).toMatch(/-input$/)
  })

  it('the control wears the shared control look', () => {
    renderField()

    const input = screen.getByRole('textbox', { name: 'Resting HR' })
    expect(input).toHaveClass('h-[52px]', 'bg-paper-2', 'text-base', 'tabular-nums')
    expect(input).toHaveClass(CONTROL_CLASS)
  })

  it('a hint is rendered and described: aria-describedby points at it', () => {
    renderField({ hint: 'Beats per minute, at rest' })

    const input = screen.getByRole('textbox', { name: 'Resting HR' })
    const hint = screen.getByText('Beats per minute, at rest')
    expect(hint).toHaveAttribute('id')
    expect(input).toHaveAttribute('aria-describedby', hint.id)
  })

  it('an error renders in its own id and marks the input aria-invalid', () => {
    renderField({ error: 'Enter a number between 30 and 220' })

    const input = screen.getByRole('textbox', { name: 'Resting HR' })
    const error = screen.getByText('Enter a number between 30 and 220')
    expect(input).toHaveAttribute('aria-describedby', error.id)
    expect(input).toHaveAttribute('aria-invalid', 'true')
  })

  it('an error supersedes the hint that failed to prevent it: the hint text goes, the error id stays described', () => {
    renderField({ hint: 'Beats per minute, at rest', error: 'That is not a number' })

    // Only the error sentence renders…
    expect(screen.getByText('That is not a number')).toBeInTheDocument()
    expect(screen.queryByText('Beats per minute, at rest')).not.toBeInTheDocument()
    // …and the input still describes the thing that IS on screen.
    const input = screen.getByRole('textbox', { name: 'Resting HR' })
    expect(input.getAttribute('aria-describedby')).toContain(
      screen.getByText('That is not a number').id,
    )
    expect(input).toHaveAttribute('aria-invalid', 'true')
  })

  it('a valid field carries no aria-invalid at all', () => {
    renderField()

    expect(screen.getByRole('textbox', { name: 'Resting HR' })).not.toHaveAttribute('aria-invalid')
  })

  it('a suffix label renders inside the control’s box, hidden from the accessibility tree', () => {
    render(
      <Field label="Height" suffix="cm">
        <Input />
      </Field>,
    )

    const suffix = screen.getByText('cm')
    expect(suffix).toHaveAttribute('aria-hidden', 'true')
    expect(suffix.parentElement).toContainElement(screen.getByRole('textbox', { name: 'Height' }))
  })

  it('merges a caller className onto the field wrapper', () => {
    render(
      <Field label="Height" className="mb-4">
        <Input />
      </Field>,
    )

    expect(screen.getByText('Height').parentElement).toHaveClass('mb-4')
  })
})

describe('Input overrides', () => {
  it('an explicit id wins over the generated one — leaving the label pointing at an id that no longer exists', () => {
    render(
      <Field label="Height">
        <Input id="custom-height" />
      </Field>,
    )

    const input = screen.getByRole('textbox')
    const label = screen.getByText('Height')
    expect(input).toHaveAttribute('id', 'custom-height')
    // The consequence is real and it is the caller's wiring to own: the label's for no longer
    // names the input, so the label association is gone with the generated id.
    expect(label).toHaveAttribute('for')
    expect(label.getAttribute('for')).not.toBe(input.id)
  })

  it('explicit aria attributes win over the field context, in both directions', () => {
    render(
      <>
        <Field label="A" error="Bad">
          <Input aria-invalid={false} />
        </Field>
        <Field label="B" hint="Fine">
          <Input aria-describedby="caller-owned" />
        </Field>
      </>,
    )

    // The field says invalid; the caller said otherwise — the caller wins…
    expect(screen.getByRole('textbox', { name: 'A' })).toHaveAttribute('aria-invalid', 'false')
    // …and the same for describeby, which a caller with its own help text needs.
    expect(screen.getByRole('textbox', { name: 'B' })).toHaveAttribute(
      'aria-describedby',
      'caller-owned',
    )
  })
})

describe('Input outside a Field', () => {
  it('renders bare: no id, no describedby, no invalid — the context simply is not there', () => {
    render(<Input />)

    const input = screen.getByRole('textbox')
    expect(input).not.toHaveAttribute('id')
    expect(input).not.toHaveAttribute('aria-describedby')
    expect(input).not.toHaveAttribute('aria-invalid')
  })

  it('still wears the control look and takes a caller className', () => {
    render(<Input className="w-32" />)

    expect(screen.getByRole('textbox')).toHaveClass(CONTROL_CLASS, 'w-32')
  })
})

describe('NumberInput', () => {
  it('is a text input wearing the numeric keypad — not type="number", on purpose', () => {
    render(
      <Field label="Height">
        <NumberInput />
      </Field>,
    )

    const input = screen.getByRole('textbox', { name: 'Height' })
    expect(input).toHaveAttribute('type', 'text')
    expect(input).toHaveAttribute('inputMode', 'numeric')
    expect(input).toHaveAttribute('autoComplete', 'off')
    expect(input).toHaveAttribute('enterKeyHint', 'next')
  })

  it('decimal=true asks for the decimal keypad instead', () => {
    render(
      <Field label="Weight">
        <NumberInput decimal />
      </Field>,
    )

    expect(screen.getByRole('textbox', { name: 'Weight' })).toHaveAttribute('inputMode', 'decimal')
  })

  it('keeps every Input wiring — the field still labels and describes it', () => {
    render(
      <Field label="Resting HR" error="Too low">
        <NumberInput />
      </Field>,
    )

    const input = screen.getByRole('textbox', { name: 'Resting HR' })
    expect(input.id).toMatch(/-input$/)
    expect(input).toHaveAttribute('aria-invalid', 'true')
  })
})
