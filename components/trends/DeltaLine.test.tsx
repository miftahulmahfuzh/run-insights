// @vitest-environment happy-dom
import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import type { VolumeDelta } from '@/lib/metrics'

import { DeltaLine } from './DeltaLine'

/**
 * One line, three kinds, and the point of the split: `none` renders no comparison at all (a fake
 * "0%" would imply there was something to compare), `first` says in words what a percentage cannot
 * (last period was zero — the real number is +∞), and `pct` carries the arrow. The line must never
 * divide by zero, never invent a percent, and never carry direction by colour alone — so every
 * assertion below reads the sentence, not a class.
 */

function lineFor(delta: VolumeDelta, runCount = 4, periodNoun = 'week') {
  const { container } = render(
    <DeltaLine delta={delta} runCount={runCount} periodNoun={periodNoun} />,
  )
  return container.querySelector('p')!.textContent ?? ''
}

describe('DeltaLine', () => {
  it('a pct delta reads "N runs · ↑ X% vs last <period>"', () => {
    expect(
      lineFor({ kind: 'pct', pct: 12, direction: 'up', currentM: 10000, previousM: 8900 }),
    ).toBe('4 runs · ↑ 12% vs last week')
  })

  it('a small delta keeps one decimal — "↑ 4.6%" rounds honestly instead of to a lie', () => {
    // |pct| < 10 renders at one decimal: 4.56 → "4.6". At ≥10 the decimal is noise. The sign —
    // not `direction` — picks the arrow, so a down delta is a negative pct.
    expect(
      lineFor({ kind: 'pct', pct: -4.56, direction: 'down', currentM: 9000, previousM: 9500 }),
    ).toBe('4 runs · ↓ 4.6% vs last week')
  })

  it('a large delta drops the decimal — "↓ 15%", not "↓ 15.0%"', () => {
    expect(
      lineFor({ kind: 'pct', pct: -15, direction: 'down', currentM: 8000, previousM: 9500 }),
    ).toBe('4 runs · ↓ 15% vs last week')
  })

  it('near-zero volume is "flat", not a rounded "0%" that hides two real numbers', () => {
    expect(
      lineFor(
        { kind: 'pct', pct: 0.3, direction: 'flat', currentM: 10000, previousM: 10001 },
        4,
        'month',
      ),
    ).toBe('4 runs · flat vs last month')
  })

  it('the period noun comes from the caller — the same line serves week and month', () => {
    expect(
      lineFor(
        { kind: 'pct', pct: 12, direction: 'up', currentM: 10000, previousM: 8900 },
        4,
        'month',
      ),
    ).toBe('4 runs · ↑ 12% vs last month')
  })

  it('the first tracked period says what happened instead of a divide-by-zero percent', () => {
    expect(lineFor({ kind: 'first', currentM: 21000 }, 1)).toBe(
      '1 run · first tracked week — no comparison yet',
    )
  })

  it('both empty periods render the count alone — no "· 0%" ghost', () => {
    expect(lineFor({ kind: 'none' }, 0)).toBe('0 runs')
    expect(lineFor({ kind: 'none' }, 3)).toBe('3 runs')
  })

  it('singularises the run count — "1 run", never "1 runs"', () => {
    expect(lineFor({ kind: 'none' }, 1)).toBe('1 run')
    expect(lineFor({ kind: 'first', currentM: 5000 }, 1)).toContain('1 run ·')
    expect(
      lineFor({ kind: 'pct', pct: 5, direction: 'up', currentM: 5000, previousM: 4000 }, 1),
    ).toContain('1 run ·')
  })
})
