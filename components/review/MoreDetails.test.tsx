// @vitest-environment happy-dom
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { emptyDraft, type ReviewDraft } from '@/lib/review/draft'
import { hydrateDraftFromExtraction } from '@/lib/review/draft'
import { TRUTH } from '../../research/schema.mjs'

import { MoreDetails } from './MoreDetails'

/**
 * The only section that is collapsed by default — and the tests hold it to the rule that earns
 * that: nothing in here is implicated by any check, so nothing in here may fake urgency either.
 * The subtle half is `withHr`'s positional contract (R-9): `[0]` and `[1]` become two named
 * columns, so clearing the first reading must leave a HOLE rather than promote the second into
 * its place — and two cleared readings must collapse to nothing rather than store two empty rows.
 */

const NOW = new Date('2026-08-21T02:00:00Z')

function baseline(): ReviewDraft {
  return hydrateDraftFromExtraction(JSON.parse(JSON.stringify(TRUTH)) as never, NOW)
}

function renderDetails(
  overrides: {
    draft?: ReviewDraft
    open?: boolean
    editedPaths?: ReadonlySet<string>
    errors?: Record<string, string>
  } = {},
) {
  const onOpenChange = vi.fn()
  /**
   * The section is controlled by the draft, so a test that only records `onChange` lies to the
   * component: React suppresses a change whose DOM value already equals the rendered one, and
   * every later keystroke replays against a stale draft. So the mock does what `ReviewClient`'s
   * `patch` does — merge and re-render — and records what it fed back.
   */
  let draft = overrides.draft ?? baseline()
  const onChange = vi.fn((patch: Partial<ReviewDraft>) => {
    draft = { ...draft, ...patch }
    rerenderProps.draft = draft
    rerender()
  })
  const rerenderProps = {
    draft,
    open: overrides.open ?? false,
    editedPaths: overrides.editedPaths ?? new Set<string>(),
    errors: overrides.errors ?? {},
  }
  const view = render(
    <MoreDetails
      draft={rerenderProps.draft}
      open={rerenderProps.open}
      onOpenChange={onOpenChange}
      editedPaths={rerenderProps.editedPaths}
      errors={rerenderProps.errors}
      onChange={onChange}
    />,
  )
  const rerender = () =>
    view.rerender(
      <MoreDetails
        draft={rerenderProps.draft}
        open={rerenderProps.open}
        onOpenChange={onOpenChange}
        editedPaths={rerenderProps.editedPaths}
        errors={rerenderProps.errors}
        onChange={onChange}
      />,
    )
  return { onOpenChange, onChange }
}

describe('MoreDetails — open and closed', () => {
  it('is closed by default: the summary reads, the fields wait hidden', () => {
    renderDetails({ open: false })

    expect(screen.getByText('More details')).toBeInTheDocument()
    expect(screen.getByText('cadence · calories · elevation · HR')).toBeInTheDocument()
    // The body is in the DOM but not shown — a closed <details> renders its children unseen.
    expect(screen.getByLabelText('Average cadence in steps per minute')).not.toBeVisible()
  })

  it('the controlled `open` prop shows the body', () => {
    renderDetails({ open: true })

    expect(screen.getByLabelText('Average cadence in steps per minute')).toBeVisible()
    expect(screen.getByLabelText('Heart rate at the end of the run')).toBeVisible()
  })

  it('toggling the summary reports the new state through onOpenChange', () => {
    const { onOpenChange } = renderDetails({ open: false })

    fireEvent.click(screen.getByText('More details'))

    expect(onOpenChange).toHaveBeenCalledWith(true)
  })

  it('the seven small fields plus the two post-workout readings are all reachable by name', () => {
    renderDetails({ open: true })

    for (const label of [
      'Average cadence in steps per minute',
      'Elevation gain in metres',
      'Active calories',
      'Total calories',
      'Average heart rate',
      'Maximum heart rate',
      'Resting heart rate',
      'Heart rate at the end of the run',
      'Heart rate one minute after the run',
    ]) {
      expect(screen.getByLabelText(label)).toBeInTheDocument()
    }
  })

  it('seeds from the fixture’s real values, TRUTH’s third reading intentionally unseen', () => {
    renderDetails({ open: true })

    // R-9 keeps exactly two named columns; the fixture's +2 min entry has no home here.
    expect(screen.getByLabelText('Heart rate at the end of the run')).toHaveValue('185')
    expect(screen.getByLabelText('Heart rate one minute after the run')).toHaveValue('162')
  })

  it('an edited path draws its chip next to its own label', () => {
    renderDetails({ open: true, editedPaths: new Set(['elevationGainM']) })

    expect(screen.getAllByText('edited')).toHaveLength(1)
  })

  it('a server-side error renders under its field', () => {
    renderDetails({ open: true, errors: { maxHrBpm: 'That max is below the average.' } })

    expect(screen.getByText('That max is below the average.')).toBeInTheDocument()
  })

  it('the recovery copy is stated where the two readings live', () => {
    renderDetails({ open: true })

    expect(
      screen.getByText(/The gap between these two is your one-minute heart-rate recovery/),
    ).toBeInTheDocument()
  })
})

describe('MoreDetails — the intent pills', () => {
  it('renders all five intents with aria-pressed reflecting the draft', () => {
    renderDetails({ open: true })

    expect(screen.getByRole('button', { name: 'Easy' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: 'Tempo' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: 'Long' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: 'Race' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: 'Not sure' })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
  })

  it('the draft’s own intent is pressed', () => {
    const draft = baseline()
    draft.intent = 'long'
    renderDetails({ draft, open: true })

    expect(screen.getByRole('button', { name: 'Long' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('picking an intent lifts it; picking the pressed one clears it back to null', () => {
    const draft = baseline()
    draft.intent = 'race'
    const { onChange } = renderDetails({ draft, open: true })

    fireEvent.click(screen.getByRole('button', { name: 'Tempo' }))
    expect(onChange).toHaveBeenLastCalledWith({ intent: 'tempo' })

    // The harness fed the patch back, so Tempo is now the pressed pill — pressing a pressed
    // pill is how a reviewer says "none of these".
    fireEvent.click(screen.getByRole('button', { name: 'Tempo' }))
    expect(onChange).toHaveBeenLastCalledWith({ intent: null })
  })
})

describe('MoreDetails — the note', () => {
  it('lifts the typed note and collapses an empty one to null', () => {
    const { onChange } = renderDetails({ open: true })
    const note = screen.getByLabelText('Note')

    fireEvent.change(note, { target: { value: 'Humid, legs still heavy' } })
    expect(onChange).toHaveBeenLastCalledWith({ note: 'Humid, legs still heavy' })

    fireEvent.change(note, { target: { value: '' } })
    expect(onChange).toHaveBeenLastCalledWith({ note: null })
  })
})

describe('MoreDetails — the small-field parsers', () => {
  it('each field parses through its own range — max HR refuses 300, cadence accepts it', () => {
    const { onChange } = renderDetails({ open: true })

    // Max HR: 40–230. A typo of 300 is invalid, so nothing is pushed.
    fireEvent.change(screen.getByLabelText('Maximum heart rate'), { target: { value: '300' } })
    expect(screen.getByLabelText('Maximum heart rate')).toHaveAttribute('aria-invalid', 'true')
    expect(onChange).not.toHaveBeenCalled()

    // Cadence: 0–300. The same digits are a legitimate cadence.
    fireEvent.change(screen.getByLabelText('Average cadence in steps per minute'), {
      target: { value: '300' },
    })
    expect(onChange).toHaveBeenLastCalledWith({ avgCadenceSpm: 300 })
  })

  it('max HR lifts a corrected value through the same 40–230 window (R-3: it is the %HRmax denominator)', () => {
    const { onChange } = renderDetails({ open: true })
    // The fixture already holds 189, and a controlled input change to the value it already
    // shows is a no-op by React's own contract — the correction has to move the number.
    expect(screen.getByLabelText('Maximum heart rate')).toHaveValue('189')

    fireEvent.change(screen.getByLabelText('Maximum heart rate'), { target: { value: '188' } })
    expect(onChange).toHaveBeenLastCalledWith({ maxHrBpm: 188 })
  })
})

describe('MoreDetails — the positional post-workout slots (R-9)', () => {
  it('typing into the one-minute slot of an EMPTY draft holds a hole at [0]', () => {
    const draft = emptyDraft(NOW)
    const { onChange } = renderDetails({ draft, open: true })

    fireEvent.change(screen.getByLabelText('Heart rate one minute after the run'), {
      target: { value: '162' },
    })

    // [1] must stay [1]: a compacted array would mislabel the one-minute reading as End.
    expect(onChange).toHaveBeenLastCalledWith({
      postWorkoutHr: [
        { label: 'End', bpm: null },
        { label: '1 MIN', bpm: 162 },
      ],
    })
  })

  it('clearing the end reading leaves a hole, not a promotion', () => {
    const draft = baseline() // [8.26/185, 1 MIN/162, 2 MIN/169]
    draft.postWorkoutHr = [
      { label: 'End', bpm: 185 },
      { label: '1 MIN', bpm: 162 },
    ]
    const { onChange } = renderDetails({ draft, open: true })

    fireEvent.change(screen.getByLabelText('Heart rate at the end of the run'), {
      target: { value: '' },
    })

    // The 1 MIN reading stays at index 1 with a hole at [0] — R-9's two named columns hold.
    expect(onChange).toHaveBeenLastCalledWith({
      postWorkoutHr: [
        { label: 'End', bpm: null },
        { label: '1 MIN', bpm: 162 },
      ],
    })
  })

  it('both readings cleared collapses the array — two empty rows are not data', () => {
    const draft = baseline()
    draft.postWorkoutHr = [
      { label: 'End', bpm: 185 },
      { label: '1 MIN', bpm: 162 },
    ]
    const { onChange } = renderDetails({ draft, open: true })

    fireEvent.change(screen.getByLabelText('Heart rate at the end of the run'), {
      target: { value: '' },
    })
    expect(onChange).toHaveBeenLastCalledWith({
      postWorkoutHr: [
        { label: 'End', bpm: null },
        { label: '1 MIN', bpm: 162 },
      ],
    })

    fireEvent.change(screen.getByLabelText('Heart rate one minute after the run'), {
      target: { value: '' },
    })
    expect(onChange).toHaveBeenLastCalledWith({ postWorkoutHr: [] })
  })

  it('the end slot of an empty draft writes itself as End, with nothing behind it', () => {
    const draft = emptyDraft(NOW)
    const { onChange } = renderDetails({ draft, open: true })

    fireEvent.change(screen.getByLabelText('Heart rate at the end of the run'), {
      target: { value: '185' },
    })

    expect(onChange).toHaveBeenLastCalledWith({ postWorkoutHr: [{ label: 'End', bpm: 185 }] })
  })
})
