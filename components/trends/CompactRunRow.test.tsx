// @vitest-environment happy-dom
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { CompactRunRow } from './CompactRunRow'

/**
 * §6's comparative row: day, distance, pace — three fixed columns a reader scans DOWN to spot the
 * outlier. The assertions pin the whole row is one link to the run (the list's tap target is the
 * row, not a "view" affordance) and the three numbers in their fixed left-to-right order; they do
 * not pin the class list, which is the design tokens' business.
 */

const RUN = { runId: 'run-1', occurredOn: '2026-08-18', distanceM: 10000, avgPaceSec: 442 }

describe('CompactRunRow', () => {
  it('is one link to the run carrying day, distance and pace in column order', () => {
    render(
      <ul>
        <CompactRunRow run={RUN} />
      </ul>,
    )

    const link = screen.getByRole('link')
    expect(link).toHaveAttribute('href', '/r/run-1')
    // Order matters — the columns only read as columns if the text lines up in this order.
    const text = link.textContent ?? ''
    expect(text).toBe("Tue 18 Aug10.00 km7'22\"/km")
  })

  it('formats through the shared formatters — metres to two decimals, pace with its unit', () => {
    render(
      <ul>
        <CompactRunRow run={{ ...RUN, distanceM: 42195, avgPaceSec: 360 }} />
      </ul>,
    )

    const text = screen.getByRole('link').textContent ?? ''
    expect(text).toContain('42.20 km') // formatDistanceM: metres → '42.20 km'
    expect(text).toContain("6'00\"/km") // formatPace: sec/km → minutes'seconds"/km
  })

  it('lives inside a list item — it is a row of the week’s runs, not a standalone card', () => {
    const { container } = render(
      <ul>
        <CompactRunRow run={RUN} />
      </ul>,
    )

    expect(container.querySelector('li')).not.toBeNull()
  })
})
