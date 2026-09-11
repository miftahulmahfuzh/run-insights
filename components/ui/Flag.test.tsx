// @vitest-environment happy-dom
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import type { Flag as FlagData } from '@/lib/metrics/flags'

import { Flag, FlagList } from './Flag'

/**
 * F08's rendering half of F06's flags: the sentence comes from `lib/flags/copy.ts` and this
 * component contains no copy of its own. The tests here therefore pin the *presentation* rules —
 * severity carried three ways (glyph, tint, and the accessible name), copy quoted verbatim from
 * the copy module — and never the sentences themselves, which `lib/flags/copy.ts`'s own
 * exhaustiveness test owns.
 */

const WARN: FlagData = { code: 'HIGH_DECOUPLING', severity: 'warn', value: 7.2 }
const INFO: FlagData = { code: 'POSITIVE_SPLIT', severity: 'info', value: 41 }

describe('Flag', () => {
  it('a warn flag: ▲ glyph, the warn tint, and "Worth attention" in the accessible name', () => {
    const { container } = render(<Flag flag={WARN} />)

    const item = container.firstElementChild!
    expect(item.tagName).toBe('LI')
    expect(item).toHaveClass('bg-warn-soft')

    const glyph = item.firstElementChild!
    expect(glyph).toHaveTextContent('▲')
    expect(glyph).toHaveAttribute('aria-hidden', 'true')

    // The severity is in the accessible name too, not only in the glyph.
    expect(screen.getByText('Worth attention:')).toHaveClass('sr-only')
  })

  it('an info flag: • glyph, no tint, "Note" in the accessible name', () => {
    const { container } = render(<Flag flag={INFO} />)

    const item = container.firstElementChild!
    expect(item).not.toHaveClass('bg-warn-soft')
    expect(item.firstElementChild).toHaveTextContent('•')
    expect(screen.getByText('Note:')).toHaveClass('sr-only')
  })

  it('renders the copy module’s sentence verbatim — the number quoted, not re-worded', () => {
    render(<Flag flag={INFO} />)

    expect(screen.getByText('Positive split')).toBeInTheDocument()
    expect(
      screen.getByText('The second half averaged +41 s/km slower than the first.'),
    ).toBeInTheDocument()
  })

  it('the copy for a warn flag quotes its value through the format authority', () => {
    render(<Flag flag={WARN} />)

    expect(screen.getByText('Aerobic drift')).toBeInTheDocument()
    // formatPercent(7.2, 1) — one decimal, from lib/format.ts.
    expect(
      screen.getByText(
        'Pace per heartbeat fell 7.2% between the first half and the second — above 5%, the same effort was buying less speed by the end.',
      ),
    ).toBeInTheDocument()
  })

  it('greyscale survives: the glyph and the word both differ between severities', () => {
    const warn = render(<Flag flag={WARN} />).container.firstElementChild!
    const info = render(<Flag flag={INFO} />).container.firstElementChild!

    expect(warn.firstElementChild!.textContent).not.toBe(info.firstElementChild!.textContent)
    expect(warn.className).not.toBe(info.className)
  })
})

describe('FlagList', () => {
  it('renders one list item per flag, in the order it was handed', () => {
    render(<FlagList flags={[WARN, INFO]} />)

    const items = screen.getAllByRole('listitem')
    expect(items).toHaveLength(2)
    expect(items[0]).toHaveTextContent('Aerobic drift')
    expect(items[1]).toHaveTextContent('Positive split')
  })

  it('one ul holds them all', () => {
    render(<FlagList flags={[WARN, INFO]} />)

    expect(screen.getByRole('list').tagName).toBe('UL')
    expect(screen.getByRole('list').children).toHaveLength(2)
  })

  it('no flags renders nothing at all — not an empty list, not a reassuring sentence', () => {
    const { container } = render(<FlagList flags={[]} />)

    expect(container).toBeEmptyDOMElement()
  })
})
