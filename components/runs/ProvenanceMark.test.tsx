// @vitest-environment happy-dom
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { ProvenanceMark } from './ProvenanceMark'

/**
 * The saved-screen honesty line. What the tests pin, in the order the docstring argues it:
 *
 *  - the source is a WORD, spelled out ("Entered by hand" / "Read from screenshot") — provenance,
 *    not a warning, and never colour (the glyph is aria-hidden; the words carry everything);
 *  - a correction is a count with its plural, not an amber tint;
 *  - `reviewed_at` and `corrected_at` are two different questions and both print when both exist;
 *  - the dates are JAKARTA days — a run reviewed at 03:30 Jakarta prints that day, not the UTC day
 *    the server's clock saw. This is `jakartaDayOf`'s whole reason to exist, so the fixture
 *    deliberately crosses the midnight boundary.
 */

describe('ProvenanceMark', () => {
  it('spells the source: screenshot reads as read, manual reads as entered by hand', () => {
    const scanned = render(<ProvenanceMark source="screenshot" reviewedAt={null} correctedAt={null} correctedFieldCount={0} />).container
    expect(scanned.textContent).toContain('Read from screenshot')
    expect(scanned.textContent).not.toContain('Entered by hand')

    const manual = render(<ProvenanceMark source="manual" reviewedAt={null} correctedAt={null} correctedFieldCount={0} />).container
    expect(manual.textContent).toContain('Entered by hand')
  })

  it('no corrections, no corrections clause — 0 renders nothing between the words', () => {
    render(<ProvenanceMark source="screenshot" reviewedAt={null} correctedAt={null} correctedFieldCount={0} />)

    expect(screen.queryByText(/corrected/)).not.toBeInTheDocument()
  })

  it.each([
    [1, '1 field corrected'],
    [3, '3 fields corrected'],
  ])('counts %i corrected field(s) with the plural the count demands', (count, phrase) => {
    render(<ProvenanceMark source="screenshot" reviewedAt={null} correctedAt={null} correctedFieldCount={count} />)

    expect(screen.getByText(new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))).toBeInTheDocument()
  })

  it('prints the reviewed day in Jakarta time', () => {
    // 02:00 in Jakarta on the 20th — an hour that only a UTC reading would move to the 19th.
    render(
      <ProvenanceMark
        source="screenshot"
        reviewedAt={new Date('2026-08-20T02:00:00+07:00')}
        correctedAt={null}
        correctedFieldCount={0}
      />,
    )

    expect(screen.getByText(/reviewed 20 Aug/)).toBeInTheDocument()
  })

  it('an instant late UTC evening is the NEXT Jakarta day — "edited 21 Aug", not "20 Aug"', () => {
    // 2026-08-20T20:30Z is 03:30 on the 21st in Jakarta. A naive `toISOString().slice(0, 10)`
    // would print the 20th and quietly lie about when the edit happened.
    render(
      <ProvenanceMark
        source="screenshot"
        reviewedAt={null}
        correctedAt={new Date('2026-08-20T20:30:00Z')}
        correctedFieldCount={0}
      />,
    )

    expect(screen.getByText(/edited 21 Aug/)).toBeInTheDocument()
    expect(screen.queryByText(/edited 20 Aug/)).not.toBeInTheDocument()
  })

  it('reviewed and edited are two different facts — both print, reviewed first', () => {
    const { container } = render(
      <ProvenanceMark
        source="screenshot"
        reviewedAt={new Date('2026-08-20T02:00:00+07:00')}
        correctedAt={new Date('2026-08-22T10:00:00+07:00')}
        correctedFieldCount={2}
      />,
    )

    // The docstring's own shape: source · corrections · reviewed · edited.
    expect(container.textContent).toBe(
      '⌁ Read from screenshot · 2 fields corrected · reviewed 20 Aug · edited 22 Aug',
    )
  })

  it('the ⌁ glyph is aria-hidden — the words are the whole announcement', () => {
    render(<ProvenanceMark source="manual" reviewedAt={null} correctedAt={null} correctedFieldCount={0} />)

    const glyph = screen.getByText('⌁', { exact: false })
    expect(glyph).toHaveAttribute('aria-hidden', 'true')
  })
})
