// @vitest-environment happy-dom
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type { ReviewDraft } from '@/lib/review/draft'
import { hydrateDraftFromExtraction } from '@/lib/review/draft'
import { TRUTH } from '../../research/schema.mjs'

import { HeroFields } from './HeroFields'

/**
 * The always-open section, and the only place all three CHK-3 inputs are visible at once —
 * which is why it is edited in place and not behind a sheet. The tests pin what a glance at
 * this section promises:
 *
 *  - every field is reachable by its own name (VoiceOver on a grid of seven);
 *  - the `scan` chip is SUPPRESSED on individual fields — eighteen identical pills is noise —
 *    and the `hint` takes the freed slot, so a clean section shows no chips at all;
 *  - `check` outranks `edited`, and either one appears the moment it is earned;
 *  - the date guess carries its evidence: the year-less label sits under the input.
 */

const NOW = new Date('2026-08-21T02:00:00Z')

function baseline(): ReviewDraft {
  return hydrateDraftFromExtraction(JSON.parse(JSON.stringify(TRUTH)) as never, NOW)
}

function renderFields(
  overrides: {
    draft?: ReviewDraft
    flaggedPaths?: ReadonlySet<string>
    editedPaths?: ReadonlySet<string>
    errors?: Record<string, string>
  } = {},
) {
  const onChange = vi.fn()
  render(
    <HeroFields
      draft={overrides.draft ?? baseline()}
      flaggedPaths={overrides.flaggedPaths ?? new Set()}
      editedPaths={overrides.editedPaths ?? new Set()}
      errors={overrides.errors ?? {}}
      onChange={onChange}
    />,
  )
  return { onChange }
}

describe('HeroFields — the seven fields', () => {
  it('renders every field reachable by its own accessible name', () => {
    renderFields()

    expect(screen.getByLabelText('Distance in kilometres')).toHaveValue('10.67')
    expect(screen.getByLabelText('Duration')).toHaveValue('1:18:36')
    expect(screen.getByLabelText('Average pace, minutes and seconds per kilometre')).toHaveValue(
      '7:22',
    )
    expect(screen.getByLabelText('The day this run happened')).toHaveValue('2026-08-20')
    expect(screen.getByLabelText('Start time')).toHaveValue('07:07')
    expect(screen.getByLabelText('End time')).toHaveValue('08:26')
    expect(screen.getByLabelText('Where this run happened')).toHaveValue('Tangerang')
  })

  it('a clean draft draws NO chip — the scan state is suppressed and the hint takes the slot', () => {
    renderFields()

    // The hints live exactly where the chips would, and only while the field is unmarked:
    expect(screen.getByText('h:mm:ss')).toBeInTheDocument()
    expect(screen.getByText('mm:ss / km')).toBeInTheDocument()
    expect(screen.queryByText('scan')).not.toBeInTheDocument()
    expect(screen.queryByText('check')).not.toBeInTheDocument()
    expect(screen.queryByText('edited')).not.toBeInTheDocument()
  })

  it('a flagged path earns its check chip on its own field only', () => {
    renderFields({ flaggedPaths: new Set(['durationSec']) })

    // Exactly one chip, and it sits in the Duration cell — scoped by the section's own
    // chipFor, not sprayed across the grid. (A chip's direct text is its word; the
    // description lives in the sr-only child.)
    expect(screen.getAllByText('check')).toHaveLength(1)
    expect(screen.queryByText('edited')).not.toBeInTheDocument()
  })

  it('an edited path earns its edited chip, and check outranks edited on the same field', () => {
    const { rerender } = render(
      <HeroFields
        draft={baseline()}
        flaggedPaths={new Set<string>()}
        editedPaths={new Set(['distanceKm'])}
        errors={{}}
        onChange={() => {}}
      />,
    )
    expect(screen.getByText('edited')).toBeInTheDocument()

    // CHK-3 fires while the value is also hand-edited: the check wins the slot.
    rerender(
      <HeroFields
        draft={baseline()}
        flaggedPaths={new Set(['distanceKm'])}
        editedPaths={new Set(['distanceKm'])}
        errors={{}}
        onChange={() => {}}
      />,
    )
    expect(screen.getByText('check')).toBeInTheDocument()
    expect(screen.queryByText('edited')).not.toBeInTheDocument()
  })

  it('a server-side error renders under its own field', () => {
    renderFields({ errors: { occurredOn: 'That date is in the future.' } })

    expect(screen.getByText('That date is in the future.')).toBeInTheDocument()
  })

  it('the pace field shows its human spelling under the masked input', () => {
    renderFields()

    // formatPace(442, true) — the number the reviewer can read without doing arithmetic.
    expect(screen.getByText(`7'22"/km`)).toBeInTheDocument()
  })

  it('the pace spelling disappears with the value', () => {
    const draft = baseline()
    draft.avgPaceSecPerKm = null
    renderFields({ draft })

    expect(screen.queryByText(/\/km/)).not.toBeInTheDocument()
  })

  it('the date guess carries its evidence — the year-less label the guess came from', () => {
    renderFields()

    expect(
      screen.getByText(/The screenshot says “Thu, 20 Aug” — no year/),
    ).toBeInTheDocument()
  })

  it('no evidence, no claim — the date line is absent when there is no label', () => {
    const draft = baseline()
    draft.dateLabel = null
    renderFields({ draft })

    expect(screen.queryByText(/no year/)).not.toBeInTheDocument()
  })
})

describe('HeroFields — the editing wiring', () => {
  it('distance parses through the real input parser, comma included', () => {
    const { onChange } = renderFields()
    const input = screen.getByLabelText('Distance in kilometres')

    fireEvent.change(input, { target: { value: '10,67' } })

    expect(onChange).toHaveBeenCalledWith({ distanceKm: 10.67 })
  })

  it('duration is masked hh:mm:ss and lifts seconds', () => {
    const { onChange } = renderFields()
    const input = screen.getByLabelText('Duration')

    fireEvent.change(input, { target: { value: '11836' } })

    expect(input).toHaveValue('1:18:36')
    expect(onChange).toHaveBeenCalledWith({ durationSec: 4716 })
  })

  it('pace is masked mm:ss', () => {
    const { onChange } = renderFields()
    const input = screen.getByLabelText('Average pace, minutes and seconds per kilometre')

    fireEvent.change(input, { target: { value: '802' } })

    expect(input).toHaveValue('8:02')
    expect(onChange).toHaveBeenCalledWith({ avgPaceSecPerKm: 482 })
  })

  it('the date input edits occurredOn directly — no parse step, the control emits ISO', () => {
    const { onChange } = renderFields()
    const input = screen.getByLabelText('The day this run happened')

    fireEvent.change(input, { target: { value: '2025-08-20' } })

    expect(onChange).toHaveBeenCalledWith({ occurredOn: '2025-08-20' })
  })

  it('a cleared clock pushes null, not an empty string', () => {
    const { onChange } = renderFields()
    const input = screen.getByLabelText('Start time')

    fireEvent.change(input, { target: { value: '' } })

    expect(onChange).toHaveBeenCalledWith({ startTime: null })
  })

  it('a typed clock lifts the control’s own zero-padded HH:mm', () => {
    const { onChange } = renderFields()
    const input = screen.getByLabelText('End time')

    fireEvent.change(input, { target: { value: '09:15' } })

    expect(onChange).toHaveBeenCalledWith({ endTime: '09:15' })
  })

  it('an emptied location collapses to null so the column stores absent, not blank', () => {
    const { onChange } = renderFields()
    const input = screen.getByLabelText('Where this run happened')

    fireEvent.change(input, { target: { value: '' } })

    expect(onChange).toHaveBeenCalledWith({ location: null })
  })

  it('forwards distanceRef to the distance input — jump-to-distance lands on the field', () => {
    const ref = { current: null as HTMLInputElement | null }
    render(
      <HeroFields
        draft={baseline()}
        flaggedPaths={new Set()}
        editedPaths={new Set()}
        errors={{}}
        onChange={() => {}}
        distanceRef={ref}
      />,
    )

    expect(ref.current).toBe(screen.getByLabelText('Distance in kilometres'))
  })
})
