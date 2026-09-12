// @vitest-environment happy-dom
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  IDLE_PROFILE_FORM_STATE,
  type ProfileFormState,
  type ProfileFormValues,
} from '@/lib/profile/schema'

import { ProfileForm } from './ProfileForm'

/**
 * The profile form over the REAL component tree. The component is documented as "one form, two
 * modes" over `useActionState`, so the Server Action is the one mock — handed in as a PROP (no
 * module seam), which is what lets every branch of the contract be driven from here: what a
 * submit PUTS on the wire (typed values, the idle prev, an untouched sex posting no key at all),
 * what comes back and where it lands (field errors under their field with the input invalid,
 * the summary as an alert, "Saved." as a status), the pending treatment on the button, and the
 * two-mode split — "Save and start" with a Skip for now that posts its OWN form, against an edit
 * form that renders no Skip even if handed one.
 *
 * NOTHING here re-tests `lib/profile/schema.ts`'s validation: the mocked action returns
 * hand-built states, and the only claim under test is that the form renders what the action
 * hands back and posts what the runner typed.
 *
 * The beforeEach resolves the action by default, and every test resolves its own gate before
 * ending: an action left pending across an RTL cleanup poisons the NEXT useActionState mount in
 * this file (its state never lands, and the failure shows up later in someone else's findBy).
 * Nothing may leave a transition in flight.
 */

const action = vi.fn<(prev: ProfileFormState, formData: FormData) => Promise<ProfileFormState>>()
const skipAction = vi.fn<() => Promise<void>>()

beforeEach(() => {
  action.mockReset()
  skipAction.mockReset()
  action.mockImplementation(async () => ({ status: 'saved' }))
})

const VALUES: ProfileFormValues = {
  age: 34,
  heightCm: 172,
  weightKg: 55.5,
  sex: null,
  restingHr: 52,
  maxHr: 189,
}

function renderForm(
  mode: 'onboarding' | 'edit',
  values: ProfileFormValues = VALUES,
): { skipAction: typeof skipAction } {
  render(<ProfileForm mode={mode} values={values} action={action} skipAction={skipAction} />)
  return { skipAction }
}

describe('ProfileForm — the fields', () => {
  it('renders the six answers, blank for null, suffixes and all', () => {
    renderForm('edit')

    expect(screen.getByLabelText('Age')).toHaveValue('34')
    expect(screen.getByLabelText('Height')).toHaveValue('172')
    expect(screen.getByLabelText('Weight')).toHaveValue('55.5')
    expect(screen.getByLabelText('Resting heart rate')).toHaveValue('52')
    expect(screen.getByLabelText('Measured max heart rate')).toHaveValue('189')
    // The de-emphasised half is told why it is optional — the copy, not a required marker.
    expect(
      screen.getByText('Only if you happen to know them. Both are safe to leave blank.'),
    ).toBeInTheDocument()
  })

  it('no sex is preselected — the column’s NULL means "never asked", and the app does not guess', () => {
    renderForm('edit')

    for (const label of ['Male', 'Female', 'Other', 'Rather not say']) {
      expect(screen.getByRole('radio', { name: label })).not.toBeChecked()
    }
  })

  it('a stored sex checks exactly its own radio', () => {
    renderForm('edit', { ...VALUES, sex: 'female' })

    expect(screen.getByRole('radio', { name: 'Female' })).toBeChecked()
    expect(screen.getByRole('radio', { name: 'Male' })).not.toBeChecked()
    expect(screen.getByRole('radio', { name: 'Rather not say' })).not.toBeChecked()
  })
})

describe('ProfileForm — the two modes', () => {
  it('onboarding says "Save and start", and Skip for now posts its OWN form', () => {
    renderForm('onboarding')

    expect(screen.getByRole('button', { name: 'Save and start' })).toBeInTheDocument()
    // Two <form>s: skipping must not carry the typed values along, and a nested form would be
    // invalid HTML — that is why Skip is a sibling, not a button inside the main form.
    expect(document.querySelectorAll('form')).toHaveLength(2)
    expect(screen.getByRole('button', { name: 'Skip for now' })).toBeInTheDocument()
  })

  it('edit says "Save", and renders no Skip even when handed a skip action', () => {
    renderForm('edit')

    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Skip for now' })).not.toBeInTheDocument()
    expect(document.querySelectorAll('form')).toHaveLength(1)
  })
})

describe('ProfileForm — the submit', () => {
  it('the action receives the typed values on the wire, and the idle state as prev', async () => {
    renderForm('edit')

    // Retype over the prefilled defaults: what is asserted is what the RUNNER typed, not what
    // the form was born with.
    fireEvent.change(screen.getByLabelText('Age'), { target: { value: '41' } })
    fireEvent.change(screen.getByLabelText('Weight'), { target: { value: '56.8' } })
    fireEvent.click(screen.getByRole('radio', { name: 'Female' }))

    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(action).toHaveBeenCalledTimes(1))
    const [prev, formData] = action.mock.calls[0]!
    expect(prev).toEqual(IDLE_PROFILE_FORM_STATE)
    expect(formData.get('age')).toBe('41')
    expect(formData.get('heightCm')).toBe('172') // untouched fields still post their default
    expect(formData.get('weightKg')).toBe('56.8')
    expect(formData.get('sex')).toBe('female')
    expect(formData.get('restingHr')).toBe('52')
  })

  it('everything blank is still a submission — every field is optional (D11), and an untouched sex posts no key at all', async () => {
    renderForm('edit', {
      age: null,
      heightCm: null,
      weightKg: null,
      sex: null,
      restingHr: null,
      maxHr: null,
    })

    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(action).toHaveBeenCalledTimes(1))
    const [, formData] = action.mock.calls[0]!
    expect(formData.get('age')).toBe('')
    expect(formData.get('sex')).toBeNull()
  })

  it('while the action is in flight the button names its state; the saved status lands, and the button comes back', async () => {
    // A gate the test opens before ending — see the file header on why nothing may stay pending.
    let openGate!: () => void
    const gate = new Promise<void>((resolve) => (openGate = resolve))
    action.mockImplementation(() => gate.then(async () => ({ status: 'saved' as const })))
    renderForm('edit')

    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled())
    expect(screen.getByRole('button', { name: 'Save' })).toHaveAttribute('aria-busy', 'true')

    openGate()
    expect(await screen.findByText('Saved.')).toBeInTheDocument()
    // The two-commit settle: the saved line can render one commit before isPending flips, so
    // the enabled half is waited for, never assumed alongside the status.
    await waitFor(() => expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled())
  })

  it('field errors land under their field with the input invalid; the summary lands as an alert', async () => {
    action.mockImplementation(async () => ({
      status: 'error',
      message: 'Fix the highlighted field.',
      fieldErrors: { age: 'Enter a whole number between 10 and 100.' },
    }))
    renderForm('edit')

    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Fix the highlighted field.')
    const age = screen.getByLabelText('Age')
    expect(age).toBeInvalid()
    const describedBy = age.getAttribute('aria-describedby')
    expect(describedBy).toBeTruthy()
    expect(document.getElementById(describedBy!)).toHaveTextContent(
      'Enter a whole number between 10 and 100.',
    )
    // The hint yielded its place: an error supersedes the instruction that failed to prevent it.
    expect(screen.queryByText('Used for the heart-rate estimate only.')).not.toBeInTheDocument()
  })

  it('Skip for now posts its own action and leaves the main one alone', async () => {
    renderForm('onboarding')

    fireEvent.click(screen.getByRole('button', { name: 'Skip for now' }))

    await waitFor(() => expect(skipAction).toHaveBeenCalledTimes(1))
    expect(action).not.toHaveBeenCalled()
  })
})
