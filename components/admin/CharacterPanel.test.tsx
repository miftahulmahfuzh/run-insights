// @vitest-environment happy-dom
import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { CharacterPanel } from './CharacterPanel'
import { saveNinaTuningAction } from '@/lib/admin/tuningActions'
import { TUNING_DIAL_COMMIT_DEBOUNCE_MS, type TuningDraft } from '@/lib/admin/tuningModel'
import {
  NINA_DIALS,
  NINA_RELATIONSHIPS,
  NINA_NOTES_MAX,
  NINA_SCORE_MAX,
  NINA_SCORE_MIN,
  NINA_TRAITS,
  type NinaDial,
  type NinaTrait,
} from '@/lib/nina/tuning'

/*
 * The one save action is mocked; everything else — the debounce pipeline, the merge, the copy — is
 * real. The commit-moment matrix from the header is what is under test: notes on BLUR, radios and
 * toggles on CHANGE, dials DEBOUNCED (600 ms), an immediate commit subsuming whatever the debounce
 * was holding, and a settled debounce firing from the LIVE draft via the ref mirror. Every value
 * that leaves is the WHOLE tuning row, every time (plan invariant 3).
 *
 * All interaction is `fireEvent`: measured in this repo's setup, `userEvent` never returns under
 * fake timers, and the debounce tests need them.
 */
vi.mock('@/lib/admin/tuningActions', () => ({
  saveNinaTuningAction: vi.fn(),
}))

const saveAction = vi.mocked(saveNinaTuningAction)

function draft(overrides?: Partial<TuningDraft>): TuningDraft {
  const traits = Object.fromEntries(NINA_TRAITS.map((k) => [k, 50])) as Record<NinaTrait, number>
  const dials = Object.fromEntries(NINA_DIALS.map((k) => [k, 50])) as Record<NinaDial, number>
  return {
    traits,
    dials,
    enabled: {},
    relationship: 'best_friend',
    notes: '',
    ...overrides,
  }
}

function panel(tuning: TuningDraft = draft(), defaults: TuningDraft = draft()) {
  render(
    <CharacterPanel
      userId="u1"
      tuning={tuning}
      defaults={defaults}
      promptPreview="THE ASSEMBLED PROMPT"
    />,
  )
}

/** The sliders render in order: all twelve traits, then the four dials. */
function sliders(): HTMLInputElement[] {
  return screen.getAllByRole('slider') as HTMLInputElement[]
}

const traitSlider = (key: NinaTrait) => sliders()[NINA_TRAITS.indexOf(key)]!

async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers()
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('CharacterPanel — chrome', () => {
  it('keeps the #character anchor on the section root — the old bookmark must still land', () => {
    panel()
    expect(document.getElementById('character')).not.toBeNull()
  })

  it('opens reading "Saved", every dial at its default, with no off count', () => {
    panel()
    expect(screen.getByText('Saved')).toBeInTheDocument()
    expect(screen.getByText(/every dial at its default/)).toBeInTheDocument()
    expect(screen.queryByText(/ · \d+ off/)).not.toBeInTheDocument()
  })

  it('renders every trait and dial, bounded 0..100', () => {
    panel()
    const sliders = screen.getAllByRole('slider')
    expect(sliders).toHaveLength(NINA_TRAITS.length + NINA_DIALS.length)
    for (const slider of sliders) {
      expect(slider).toHaveAttribute('min', String(NINA_SCORE_MIN))
      expect(slider).toHaveAttribute('max', String(NINA_SCORE_MAX))
    }
  })

  it('offers every relationship as a radio', () => {
    panel()
    const radios = screen.getAllByRole('radio', { name: /./ })
    expect(radios).toHaveLength(NINA_RELATIONSHIPS.length)
  })

  it('caps the notes at the model bound', () => {
    panel()
    expect(screen.getByRole('textbox')).toHaveAttribute('maxLength', String(NINA_NOTES_MAX))
  })
})

describe('CharacterPanel — the commit moments', () => {
  it('typing in the notes commits NOTHING; leaving the field commits the WHOLE row', async () => {
    saveAction.mockResolvedValue({ ok: true, tuning: draft({ notes: 'She laughs at 6am.' }) })
    panel()
    const notes = screen.getByRole('textbox')

    fireEvent.change(notes, { target: { value: 'She laughs at 6am.' } })
    await advance(2_000) // far past any debounce
    expect(saveAction).not.toHaveBeenCalled()
    expect(screen.getByText('Unsaved edits')).toBeInTheDocument()

    fireEvent.blur(notes)
    await advance(0)
    expect(saveAction).toHaveBeenCalledTimes(1)
    // The whole tuning, every time: traits, dials, enabled map, relationship, notes together.
    expect(saveAction.mock.calls[0]![0]!).toEqual({
      userId: 'u1',
      traits: draft().traits,
      dials: draft().dials,
      enabled: {},
      relationship: 'best_friend',
      notes: 'She laughs at 6am.',
    })
    await advance(0)
    expect(screen.getByText('Saved')).toBeInTheDocument()
  })

  it('a no-op notes blur sends nothing', async () => {
    panel()
    fireEvent.blur(screen.getByRole('textbox'))
    await advance(1_000)
    expect(saveAction).not.toHaveBeenCalled()
  })

  it('a dial waits for the settle window, then sends once', async () => {
    saveAction.mockResolvedValue({
      ok: true,
      tuning: draft({ traits: { ...draft().traits, anger: 55 } }),
    })
    panel()
    const anger = traitSlider('anger')
    fireEvent.change(anger, { target: { value: '55' } })

    // The armed window shows as saving; the network is quiet.
    expect(screen.getByText('Saving…')).toBeInTheDocument()
    expect(saveAction).not.toHaveBeenCalled()

    await advance(TUNING_DIAL_COMMIT_DEBOUNCE_MS)
    expect(saveAction).toHaveBeenCalledTimes(1)
    expect(saveAction.mock.calls[0]![0]!.traits.anger).toBe(55)
    await advance(0)
    expect(screen.getByText('Saved')).toBeInTheDocument()
  })

  it('one continuous drag is ONE save — the window re-arms on every change', async () => {
    saveAction.mockResolvedValue({ ok: true, tuning: draft() })
    panel()
    const anger = traitSlider('anger')
    fireEvent.change(anger, { target: { value: '55' } })
    await advance(TUNING_DIAL_COMMIT_DEBOUNCE_MS - 100)
    fireEvent.change(anger, { target: { value: '60' } }) // re-arms inside the window
    await advance(TUNING_DIAL_COMMIT_DEBOUNCE_MS)

    expect(saveAction).toHaveBeenCalledTimes(1)
    expect(saveAction.mock.calls[0]![0]!.traits.anger).toBe(60)
  })

  it('an immediate commit carries the dial still waiting and DISARMS the timer', async () => {
    saveAction.mockResolvedValue({ ok: true, tuning: draft() })
    panel()
    fireEvent.change(traitSlider('anger'), { target: { value: '55' } })
    // Before the window matures, flip a toggle — the immediate commit takes the whole draft.
    fireEvent.click(screen.getByLabelText('Include Anger in her prompt'))
    await advance(0)

    expect(saveAction).toHaveBeenCalledTimes(1)
    expect(saveAction.mock.calls[0]![0]!.traits.anger).toBe(55) // subsumed, not lost
    expect(saveAction.mock.calls[0]![0]!.enabled.anger).toBe(false)

    await advance(TUNING_DIAL_COMMIT_DEBOUNCE_MS * 2)
    expect(saveAction).toHaveBeenCalledTimes(1) // and not double-sent
  })

  it('a toggle commits on change and leaves the parked score alone', async () => {
    saveAction.mockResolvedValue({ ok: true, tuning: draft() })
    panel()
    const flirty = screen.getByLabelText('Include Flirty in her prompt') as HTMLInputElement
    expect(flirty).toBeChecked()

    fireEvent.click(flirty)
    await advance(0)
    expect(saveAction).toHaveBeenCalledTimes(1)
    expect(saveAction.mock.calls[0]![0]!.enabled.flirty).toBe(false)
    expect(saveAction.mock.calls[0]![0]!.traits.flirty).toBe(50) // parked, not cleared
    // The toggle renders the draft immediately: off means the parameter is out of the prompt.
    expect(flirty).not.toBeChecked()
  })

  it('a relationship radio commits on change — the discrete control’s change IS the edit', async () => {
    saveAction.mockResolvedValue({ ok: true, tuning: draft({ relationship: 'nobody' }) })
    panel()
    const radios = screen.getAllByRole('radio')
    fireEvent.click(radios[0]!) // 'nobody', the first in NINA_RELATIONSHIPS order
    await advance(0)
    expect(saveAction).toHaveBeenCalledTimes(1)
    expect(saveAction.mock.calls[0]![0]!.relationship).toBe('nobody')
  })

  it('a dial dragged back to the saved value disarms and never saves', async () => {
    // The saved row holds 70. Dragging to 80 arms the window; dragging back to 70 re-enters
    // scheduleDialCommit with a draft equal to saved — which disarms instead of firing.
    const tuning = draft({ traits: { ...draft().traits, anger: 70 } })
    panel(tuning, draft())
    fireEvent.change(traitSlider('anger'), { target: { value: '80' } })
    fireEvent.change(traitSlider('anger'), { target: { value: '70' } })
    await advance(TUNING_DIAL_COMMIT_DEBOUNCE_MS * 2)
    expect(saveAction).not.toHaveBeenCalled()
    expect(screen.getByText('Saved')).toBeInTheDocument()
  })

  it('unmount inside the settle window fires no save into the dead component', async () => {
    const view = render(
      <CharacterPanel userId="u1" tuning={draft()} defaults={draft()} promptPreview="P" />,
    )
    fireEvent.change(traitSlider('anger'), { target: { value: '55' } })
    view.unmount()
    await advance(TUNING_DIAL_COMMIT_DEBOUNCE_MS * 2)
    expect(saveAction).not.toHaveBeenCalled()
  })
})

describe('CharacterPanel — the pipeline’s answers', () => {
  it('keeps the panel editable and shows Unsaved edits when a save is refused', async () => {
    saveAction.mockResolvedValue({ ok: false, error: 'The write failed. Nothing was changed.' })
    panel()
    fireEvent.change(traitSlider('anger'), { target: { value: '55' } })
    await advance(TUNING_DIAL_COMMIT_DEBOUNCE_MS)

    await advance(0)
    expect(screen.getByText('The write failed. Nothing was changed.')).toBeInTheDocument()
    expect(screen.getByText('Unsaved edits')).toBeInTheDocument()
    // Nothing was locked: the sliders and the notes still accept edits.
    expect(traitSlider('anger')).not.toBeDisabled()
    expect(screen.getByRole('textbox')).not.toBeDisabled()
  })

  it('marks the edited row with the unsaved dot while the field differs from the saved row', async () => {
    saveAction.mockResolvedValue({
      ok: true,
      tuning: draft({ traits: { ...draft().traits, anger: 55 } }),
    })
    panel()
    fireEvent.change(traitSlider('anger'), { target: { value: '55' } })
    // Inside the window the draft differs from saved — the row carries its dot.
    expect(screen.getAllByTitle('Unsaved').length).toBeGreaterThan(0)

    await advance(TUNING_DIAL_COMMIT_DEBOUNCE_MS)
    await advance(0)
    // Adopted: the dot is gone and the header says Saved.
    expect(screen.queryByTitle('Unsaved')).not.toBeInTheDocument()
    expect(screen.getByText('Saved')).toBeInTheDocument()
  })

  it('counts the parameters switched off in the section header', async () => {
    saveAction.mockResolvedValue({ ok: true, tuning: draft() })
    panel()
    fireEvent.click(screen.getByLabelText('Include Verbosity in her prompt'))
    await advance(0)
    expect(screen.getByText(/1 off/)).toBeInTheDocument()
  })

  it('says the relationship is off in the words the feature shipped with', async () => {
    saveAction.mockResolvedValue({ ok: true, tuning: draft() })
    panel()
    fireEvent.click(screen.getByLabelText('Include the relationship in her prompt'))
    await advance(0)
    expect(screen.getByText('off — she is the best friend who shipped')).toBeInTheDocument()
    expect(screen.getByText(/1 off/)).toBeInTheDocument()
  })

  it('shows the prompt preview as the SAVED row while edits are pending', async () => {
    saveAction.mockResolvedValue({ ok: true, tuning: draft() })
    panel()
    expect(
      screen.queryByText(/as saved — the edits above are not in it yet/),
    ).not.toBeInTheDocument()

    fireEvent.change(traitSlider('anger'), { target: { value: '55' } })
    expect(screen.getByText(/as saved — the edits above are not in it yet/)).toBeInTheDocument()
    expect(screen.getByText('THE ASSEMBLED PROMPT')).toBeInTheDocument()

    await advance(TUNING_DIAL_COMMIT_DEBOUNCE_MS)
    await advance(0)
    expect(screen.queryByText(/as saved/)).not.toBeInTheDocument()
  })
})
