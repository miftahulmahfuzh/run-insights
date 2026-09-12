// @vitest-environment happy-dom
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type { CheckResult } from '@/lib/review/checks'
import { ConsistencyBanner } from './ConsistencyBanner'

/**
 * The arithmetic's one channel to the reviewer, so the tests pin the two things its doc comment
 * claims about itself:
 *
 *  - **The all-clear is announced too.** `role="status"` on the clean state is the only feedback
 *    that the checks RAN — without it "no banner" and "no checking happened" are
 *    indistinguishable. Losing that role in a refactor would look like pure markup churn and
 *    silently regress the screen-reader experience.
 *  - **Jump never overclaims.** A check with no `fieldPaths` gets no Jump button, and a Jump
 *    carries the check's own path — never a row the arithmetic cannot name (CHK-1's honesty
 *    constraint lives exactly here).
 */

function check(overrides: Partial<CheckResult> & { id: CheckResult['id'] }): CheckResult {
  return { ok: false, message: '', fieldPaths: [], ...overrides }
}

const CLEAN: CheckResult[] = [
  check({ id: 'splits_sum_vs_duration', ok: true }),
  check({ id: 'zones_sum_vs_duration', ok: true }),
  check({ id: 'distance_pace_vs_duration', ok: true }),
  check({ id: 'partial_consistency', ok: true }),
]

const CHK1_MESSAGE =
  'Splits total 47:30, the run is 1:18:36 (31:06 off) — one of the 11 splits below looks off.'

describe('ConsistencyBanner — the all-clear', () => {
  it('announces politely that the numbers agree, as status rather than alert', () => {
    render(<ConsistencyBanner checks={CLEAN} onJump={vi.fn()} />)

    const status = screen.getByRole('status')
    expect(status).toHaveAttribute('aria-live', 'polite')
    expect(status).toHaveTextContent('The numbers agree with each other')
    // Nothing failed, so there is nothing to jump to and nothing listed.
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('passing checks are not listed even when a sibling fails', () => {
    render(
      <ConsistencyBanner
        checks={[...CLEAN, check({ id: 'splits_sum_vs_duration', message: CHK1_MESSAGE, fieldPaths: ['splits'] })]}
        onJump={vi.fn()}
      />,
    )

    expect(screen.getByRole('alert')).toHaveTextContent('1 thing worth checking')
    expect(screen.getByText(CHK1_MESSAGE)).toBeInTheDocument()
    // The three passes contribute no rows — the banner counts failures, not checks.
    expect(screen.getAllByRole('listitem')).toHaveLength(1)
  })
})

describe('ConsistencyBanner — failures', () => {
  it('singular: one failing check reads as one thing, as an interrupting alert', () => {
    render(
      <ConsistencyBanner
        checks={[check({ id: 'splits_sum_vs_duration', message: CHK1_MESSAGE, fieldPaths: ['splits'] })]}
        onJump={vi.fn()}
      />,
    )

    const alert = screen.getByRole('alert')
    expect(alert).toHaveAttribute('aria-live', 'polite')
    expect(alert).toHaveTextContent('1 thing worth checking')
  })

  it('plural: the count grammar survives two failures', () => {
    render(
      <ConsistencyBanner
        checks={[
          check({ id: 'splits_sum_vs_duration', message: CHK1_MESSAGE, fieldPaths: ['splits'] }),
          check({ id: 'zones_sum_vs_duration', message: 'Zones total 4595 — looks off.', fieldPaths: ['hrZones'] }),
        ]}
        onJump={vi.fn()}
      />,
    )

    expect(screen.getByRole('alert')).toHaveTextContent('2 things worth checking')
    expect(screen.getAllByRole('listitem')).toHaveLength(2)
  })

  it('Jump resolves the check’s first field path and only exists when there is one', async () => {
    const onJump = vi.fn()
    render(
      <ConsistencyBanner
        checks={[
          check({ id: 'splits_sum_vs_duration', message: CHK1_MESSAGE, fieldPaths: ['splits'] }),
          // A check that can name no field gets no Jump — pointing at nothing is the honest state.
          check({ id: 'distance_pace_vs_duration', message: 'Check the numbers above.', fieldPaths: [] }),
        ]}
        onJump={onJump}
      />,
    )

    const jumps = screen.getAllByRole('button', { name: 'Jump' })
    expect(jumps).toHaveLength(1)

    fireEvent.click(jumps[0]!)

    expect(onJump).toHaveBeenCalledTimes(1)
    expect(onJump).toHaveBeenCalledWith('splits')
  })

  it('the save-anyway posture is stated on the failing state, not just the clean one', () => {
    render(
      <ConsistencyBanner
        checks={[check({ id: 'splits_sum_vs_duration', message: CHK1_MESSAGE, fieldPaths: ['splits'] })]}
        onJump={vi.fn()}
      />,
    )

    // F05's whole stance: the checks are hints from arithmetic, not rules. This sentence is the
    // permission the sticky bar's never-disabled button relies on.
    expect(
      screen.getByText(/These are hints from arithmetic, not rules/),
    ).toBeInTheDocument()
  })
})
