// @vitest-environment happy-dom
import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type { DraftZone } from '@/lib/review/draft'
import { hydrateDraftFromExtraction } from '@/lib/review/draft'
import { TRUTH } from '../../research/schema.mjs'

import { ZoneBar } from './ZoneBar'

/**
 * The stacked bar whose shape IS the finding (the canonical run is 90.6% in zones 4–5), one tap
 * per segment. The tests pin the three promises its doc comment makes:
 *
 *  - the bar announces itself as a single image with every zone's duration and percentage —
 *    the shape must be legible without seeing it;
 *  - zone 1 has NO floor and zone 5 NO ceiling, and the sheet says so in words rather than
 *    showing a blank input that invites a reviewer to invent a bound;
 *  - a zones-less extraction is one deliberate tap away from a five-row blank scaffold.
 */

const NOW = new Date('2026-08-21T02:00:00Z')

function baselineZones(): DraftZone[] {
  return hydrateDraftFromExtraction(JSON.parse(JSON.stringify(TRUTH)) as never, NOW).hrZones
}

function renderZones(
  overrides: {
    zones?: DraftZone[]
    flagged?: boolean
    editedPaths?: ReadonlySet<string>
    errors?: Record<string, string>
  } = {},
) {
  const onChange = vi.fn()
  let zones = overrides.zones ?? baselineZones()
  const base = {
    photos: [] as never[],
    flagged: overrides.flagged ?? false,
    editedPaths: overrides.editedPaths ?? new Set<string>(),
    errors: overrides.errors ?? {},
  }
  const view = render(<ZoneBar {...base} zones={zones} onChange={handleChange} />)
  function handleChange(next: DraftZone[]) {
    zones = next
    onChange(next)
    view.rerender(<ZoneBar {...base} zones={zones} onChange={handleChange} />)
  }
  return { onChange }
}

describe('ZoneBar — the bar and its rows', () => {
  it('the bar is one image whose label reads every zone’s duration and share', () => {
    renderZones()

    const bar = screen.getByRole('img')
    // The canonical run: z4+z5 dominate, and the label says the whole shape out loud.
    expect(bar).toHaveAttribute(
      'aria-label',
      'Zone 1, 1:44, 2 percent. Zone 2, 0:25, 1 percent. Zone 3, 5:03, 7 percent. ' +
        'Zone 4, 36:05, 47 percent. Zone 5, 33:18, 43 percent',
    )
    // One segment per zone inside it.
    expect(bar.children).toHaveLength(5)
  })

  it('rows carry zone number, bounds, duration, share — and the edited chip when earned', () => {
    renderZones({ editedPaths: new Set(['hrZones.3.durationSec']) })

    const rows = screen.getAllByRole('button')
    expect(rows).toHaveLength(5)
    expect(rows[0]).toHaveAttribute(
      'aria-label',
      'Edit zone 1, 1:44, 2 percent, under 140 bpm',
    )
    expect(within(rows[1]!).getByText('141–151 bpm')).toBeInTheDocument()
    expect(within(rows[4]!).getByText('175 bpm and up')).toBeInTheDocument()
    expect(within(rows[3]!).getByText('47%')).toBeInTheDocument()
    expect(within(rows[3]!).getByText('edited')).toBeInTheDocument()
  })

  it('a flagged block wears the check chip by its heading', () => {
    renderZones({ flagged: true })

    expect(screen.getByText('check')).toBeInTheDocument()
  })

  it('a block-level server error renders above the bar', () => {
    renderZones({ errors: { hrZones: 'The zones do not fit inside this run.' } })

    expect(screen.getByText('The zones do not fit inside this run.')).toBeInTheDocument()
  })

  it('all durations zero draws no bar — a division by a zero total is not a percentage', () => {
    const zones = baselineZones().map((z) => ({ ...z, durationSec: 0 }))
    renderZones({ zones })

    expect(screen.queryByRole('img')).not.toBeInTheDocument()
    // And the share column says so in the only honest spelling.
    expect(screen.getAllByText('—')).toHaveLength(5)
  })
})

describe('ZoneBar — the zones-less extraction', () => {
  it('says why there are no zones and offers the five-row scaffold', () => {
    renderZones({ zones: [] })

    expect(
      screen.getByText(/No zones — either the heart-rate screenshot was not uploaded/),
    ).toBeInTheDocument()
  })

  it('the scaffold is five zeroed rows, with no bar while their total is still zero', () => {
    renderZones({ zones: [] })

    fireEvent.click(screen.getByRole('button', { name: 'Enter the five zones by hand' }))

    const rows = screen.getAllByRole('button').filter((el) => el.textContent!.startsWith('Z'))
    expect(rows).toHaveLength(5)
    // Zero total draws no bar and every share column reads an em dash.
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
    expect(screen.getAllByText('—')).toHaveLength(5)
  })
})

describe('ZoneBar — the zone sheet', () => {
  it('opens from a row, titled and bounded', () => {
    renderZones()

    fireEvent.click(screen.getByRole('button', { name: /Edit zone 3/ }))

    const dialog = screen.getByRole('dialog', { name: 'Zone 3' })
    expect(within(dialog).getByText('152–163 bpm')).toBeInTheDocument() // subtitle
  })

  it('zone 1 has no floor and says so in words — never a blank box inviting a bound', () => {
    renderZones()

    fireEvent.click(screen.getByRole('button', { name: /Edit zone 1/ }))

    const dialog = screen.getByRole('dialog', { name: 'Zone 1' })
    expect(within(dialog).getByText('No lower bound')).toBeInTheDocument()
    expect(within(dialog).getByLabelText('Zone 1 upper bound in beats per minute')).toHaveValue(
      '140',
    )
  })

  it('zone 5 has no ceiling for the same reason', () => {
    renderZones()

    fireEvent.click(screen.getByRole('button', { name: /Edit zone 5/ }))

    const dialog = screen.getByRole('dialog', { name: 'Zone 5' })
    expect(within(dialog).getByText('No upper bound')).toBeInTheDocument()
    expect(within(dialog).getByLabelText('Zone 5 lower bound in beats per minute')).toHaveValue(
      '175',
    )
  })

  it('time in zone is masked h:mm:ss and lifts seconds into the row', () => {
    renderZones()
    fireEvent.click(screen.getByRole('button', { name: /Edit zone 4/ }))

    // 36:06 is typed 3-6-0-6 under the right-to-left mask; zone 4 already holds 36:05, and a
    // controlled change to the value a field already shows would be suppressed outright.
    fireEvent.change(screen.getByLabelText('Time in zone 4'), { target: { value: '3606' } })

    const row = screen.getAllByRole('button').find((el) => el.textContent!.startsWith('Z4'))!
    expect(within(row).getByText('36:06')).toBeInTheDocument()
  })

  it('a path-scoped server error renders under time in zone', () => {
    renderZones({ errors: { 'hrZones.3.durationSec': 'Longer than the run itself.' } })
    fireEvent.click(screen.getByRole('button', { name: /Edit zone 4/ }))

    expect(screen.getByText('Longer than the run itself.')).toBeInTheDocument()
  })

  it('Done closes the sheet', () => {
    renderZones()
    fireEvent.click(screen.getByRole('button', { name: /Edit zone 2/ }))

    fireEvent.click(screen.getByRole('button', { name: 'Done' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
