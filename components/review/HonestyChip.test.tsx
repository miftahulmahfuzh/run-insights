// @vitest-environment happy-dom
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { HonestyChip } from './HonestyChip'

/**
 * The R-46 honesty marks. The assertions that matter here are the ones the design brief's
 * honesty rule buys: each chip carries its own WORD (so a screen reader and a colour-blind
 * reader get the same information the colour does), and each state carries its own `title`
 * (the hover/long-press explanation, which is also what the `sr-only` span announces).
 *
 * What is deliberately NOT asserted: the per-state colour tokens beyond their presence — the
 * chip's look is `STYLES`'s business, and a test that pins the whole class list is a snapshot
 * of a string, not a test of the choice (see `components/ui/Button.test.tsx` for the same
 * stance).
 */

describe('HonestyChip', () => {
  it.each([
    ['scan', 'scan', 'Read from a screenshot'],
    ['check', 'check', 'Worth checking'],
    ['edited', 'edited', 'Corrected by hand'],
  ] as const)(
    'state %s shows its word and its explanation twice — title and sr-only',
    (state, word, description) => {
      render(<HonestyChip state={state} />)

      const chip = screen.getByText(word)
      expect(chip).toHaveAttribute('title', description)
      // The announced reading is the description first, then the word — "Worth checking: check" —
      // so the state is explained even when the bare word alone would be cryptic.
      expect(chip.textContent).toBe(`${description}: ${word}`)
    },
  )

  it('a `label` override replaces the word but not the explanation', () => {
    // The docstring's own example: a section header's chip reads "from Splits", and the
    // explanation stays the state's, not the override's.
    render(<HonestyChip state="edited" label="from Splits" />)

    const chip = screen.getByText('from Splits')
    expect(chip).toHaveAttribute('title', 'Corrected by hand')
    expect(chip.textContent).toBe('Corrected by hand: from Splits')
    expect(screen.queryByText('edited')).not.toBeInTheDocument()
  })

  it.each([
    ['scan', 'bg-rule-2'],
    ['check', 'bg-warn-soft'],
    ['edited', 'bg-accent-soft'],
  ] as const)('state %s carries its own fill', (state, fill) => {
    render(<HonestyChip state={state} />)

    expect(screen.getByText(state === 'scan' ? 'scan' : state)).toHaveClass(fill)
  })

  it('merges a caller className after the state classes', () => {
    render(<HonestyChip state="check" className="mt-1" />)

    expect(screen.getByText(/^check/)).toHaveClass('bg-warn-soft', 'mt-1')
  })
})
