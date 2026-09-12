// @vitest-environment happy-dom
import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ImageGenPanel } from './ImageGenPanel'
import { saveNinaImagePrefsAction } from '@/lib/admin/imageGenActions'
import { IMAGEGEN_DIAL_COMMIT_DEBOUNCE_MS, type ImageGenDraft } from '@/lib/admin/imageGenModel'
import {
  NINA_IMAGE_FOCUS_KEYS,
  NINA_IMAGE_MODEL_IDS,
  NINA_PROMPT_TEMPLATE_MAX,
} from '@/lib/nina/imageprefs'

/*
 * The save action is mocked. `PhotoReferencePicker` and `ImageGenTestPanel` are stubbed at their
 * import boundary — each has its own suite from earlier in this session — with the picker reduced
 * to a button that fires its onChange contract and the test panel reduced to a dirty-flag lamp.
 * What is under test here is the PANEL: the commit-moment matrix it shares with CharacterPanel
 * (dial debounced, checkboxes/select/reference immediate, five text controls on blur), the ✕
 * buttons that clear without a second write path, the template reset that stores the default
 * itself, and whole-row payloads on every dispatch.
 */
vi.mock('@/lib/admin/imageGenActions', () => ({
  saveNinaImagePrefsAction: vi.fn(),
}))

vi.mock('./PhotoReferencePicker', async () => {
  const React = await import('react')
  return {
    PhotoReferencePicker: (props: { value: string; onChange: (next: string) => void }) =>
      React.createElement(
        'button',
        { 'data-testid': 'ref-pick', onClick: () => props.onChange('album:abc') },
        props.value === '' ? 'no-reference' : props.value,
      ),
  }
})

vi.mock('@/components/admin/ImageGenTestPanel', async () => {
  const React = await import('react')
  return {
    ImageGenTestPanel: (props: { dirty: boolean }) =>
      React.createElement('div', null, props.dirty ? 'test-panel-dirty' : 'test-panel-clean'),
  }
})

const saveAction = vi.mocked(saveNinaImagePrefsAction)

function prefs(overrides?: Partial<ImageGenDraft>): ImageGenDraft {
  return {
    promptLength: 50,
    focus: {},
    wardrobe: '',
    venue: '',
    time: '',
    notes: '',
    promptTemplate: 'SHELL {{scene}}',
    model: 'qwen/qwen-image-3',
    reference: { source: 'none', id: '' },
    ...overrides,
  }
}

function panel(p: ImageGenDraft = prefs(), defaults: ImageGenDraft = prefs()) {
  render(
    <ImageGenPanel
      userId="u1"
      prefs={p}
      defaults={defaults}
      promptPreview="THE ASSEMBLED IMAGE PROMPT"
      defaultTemplate="SHELL {{scene}}"
      references={[]}
      photoTotal={0}
    />,
  )
}

/*
 * The five text controls in DOM order: wardrobe, venue, time, notes, template. Their wrapping
 * labels carry hint sentences, so accessible names are the whole label — index, not name.
 */
const textboxes = () => screen.getAllByRole('textbox') as HTMLInputElement[]
const wardrobeBox = () => textboxes()[0]!
const templateBox = () => textboxes()[textboxes().length - 1]!

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

describe('ImageGenPanel — chrome', () => {
  it('keeps the #image-generation anchor and opens clean', () => {
    panel()
    expect(document.getElementById('image-generation')).not.toBeNull()
    expect(screen.getByText('Saved')).toBeInTheDocument()
    expect(screen.getByText(/prompt length 50 · 0 of 6 emphasised/)).toBeInTheDocument()
  })

  it('carries a live reference into the header summary', () => {
    panel(prefs({ reference: { source: 'avatar', id: 'x1' } }))
    expect(screen.getByText(/· one reference/)).toBeInTheDocument()
  })

  it('renders the six focus checkboxes, none ticked — absent means OFF here', () => {
    panel()
    const boxes = screen.getAllByRole('checkbox') as HTMLInputElement[]
    expect(boxes).toHaveLength(NINA_IMAGE_FOCUS_KEYS.length)
    for (const box of boxes) expect(box).not.toBeChecked()
  })

  it('renders the camera as a closed select of the model ids', () => {
    panel()
    const select = screen.getByRole('combobox') as HTMLSelectElement
    expect([...select.querySelectorAll('option')].map((o) => o.getAttribute('value'))).toEqual([
      ...NINA_IMAGE_MODEL_IDS,
    ])
    expect(select).toHaveValue('qwen/qwen-image-3')
  })

  it('names the template textarea — the one control whose heading is not a label', () => {
    panel()
    // The four fields above it sit inside wrapping <label>s; the template's <h3> labels nothing.
    // Without an explicit accessible name it is the panel's one anonymous control.
    expect(screen.getByRole('textbox', { name: 'Prompt template' })).toBe(templateBox())
  })

  it('shows the template with its char counter and the placeholder legend', () => {
    panel()
    expect(templateBox()).toHaveValue('SHELL {{scene}}')
    expect(
      screen.getByText(`${'SHELL {{scene}}'.length} / ${NINA_PROMPT_TEMPLATE_MAX}`),
    ).toBeInTheDocument()
    expect(screen.getByText('{{scene}}')).toBeInTheDocument()
    expect(screen.getByText('Reset to default template')).toBeInTheDocument()
  })
})

describe('ImageGenPanel — the commit moments', () => {
  it('the prompt-length dial commits DEBOUNCED with the whole row', async () => {
    saveAction.mockResolvedValue({ ok: true, prefs: prefs({ promptLength: 70 }) })
    panel()
    const slider = screen.getByRole('slider')
    expect(slider).toHaveAttribute('min', '0')
    expect(slider).toHaveAttribute('max', '100')

    fireEvent.change(slider, { target: { value: '70' } })
    expect(screen.getByText('Saving…')).toBeInTheDocument()
    await advance(IMAGEGEN_DIAL_COMMIT_DEBOUNCE_MS)

    expect(saveAction).toHaveBeenCalledTimes(1)
    expect(saveAction.mock.calls[0]![0]!.promptLength).toBe(70)
    // The length dial has no toggle: the control count above already proves the checkbox absence.
    await advance(0)
    expect(screen.getByText('Saved')).toBeInTheDocument()
  })

  it('a focus checkbox commits on CHANGE, immediately', async () => {
    // The action returns the row AS STORED — with the tick in it — so the merge adopts cleanly.
    const stored = prefs({ focus: { [NINA_IMAGE_FOCUS_KEYS[0]]: true } })
    saveAction.mockResolvedValue({ ok: true, prefs: stored })
    panel()
    fireEvent.click(screen.getAllByRole('checkbox')[0]!)
    await advance(0)
    await advance(0) // second flush: the save's own promise chain settles here

    expect(saveAction).toHaveBeenCalledTimes(1)
    expect(saveAction.mock.calls[0]![0]!.focus[NINA_IMAGE_FOCUS_KEYS[0]]).toBe(true)
    // No settle window was needed: the dispatch happened without advancing the timer.
    expect(screen.getByText('Saved')).toBeInTheDocument()
    expect(screen.getByText(/1 of 6 emphasised/)).toBeInTheDocument()
  })

  it('switching the camera commits on CHANGE', async () => {
    saveAction.mockResolvedValue({ ok: true, prefs: prefs() })
    panel()
    fireEvent.change(screen.getByRole('combobox'), { target: { value: NINA_IMAGE_MODEL_IDS[1] } })
    await advance(0)
    expect(saveAction).toHaveBeenCalledTimes(1)
    expect(saveAction.mock.calls[0]![0]!.model).toBe(NINA_IMAGE_MODEL_IDS[1]!)
  })

  it('the reference pick commits on CHANGE through the picker’s opaque key', async () => {
    saveAction.mockResolvedValue({ ok: true, prefs: prefs() })
    panel()
    fireEvent.click(screen.getByTestId('ref-pick'))
    await advance(0)
    expect(saveAction).toHaveBeenCalledTimes(1)
    expect(saveAction.mock.calls[0]![0]!.reference).toEqual({ source: 'album', id: 'abc' })
  })

  it('text fields commit on BLUR only — typing sends nothing', async () => {
    saveAction.mockResolvedValue({ ok: true, prefs: prefs() })
    panel()
    const box = wardrobeBox()
    fireEvent.change(box, { target: { value: 'oversized hoodie' } })
    await advance(IMAGEGEN_DIAL_COMMIT_DEBOUNCE_MS * 2)
    expect(saveAction).not.toHaveBeenCalled()
    expect(screen.getByText('Unsaved edits')).toBeInTheDocument()

    fireEvent.blur(box)
    await advance(0)
    expect(saveAction).toHaveBeenCalledTimes(1)
    expect(saveAction.mock.calls[0]![0]!.wardrobe).toBe('oversized hoodie')
  })

  it('the ✕ clears the field, refocuses it, and rides the ordinary blur — no second write path', async () => {
    saveAction.mockResolvedValue({ ok: true, prefs: prefs() })
    panel(prefs({ wardrobe: 'hoodie' }))
    const cross = screen.getByRole('button', { name: 'Kosongkan wardrobe' })
    fireEvent.click(cross)

    expect(wardrobeBox()).toHaveValue('')
    expect(document.activeElement).toBe(wardrobeBox())
    expect(saveAction).not.toHaveBeenCalled() // clearing alone is an edit, not a commit

    fireEvent.blur(wardrobeBox())
    await advance(0)
    // The blur persists the clearing: the SAVED row still holds 'hoodie', so the cleared draft
    // differs from it and the ordinary blur commit is what writes the empty value.
    expect(saveAction).toHaveBeenCalledTimes(1)
    expect(saveAction.mock.calls[0]![0]!.wardrobe).toBe('')
  })

  it('the ✕ buttons only exist for non-empty fields', () => {
    panel()
    expect(screen.queryByRole('button', { name: 'Kosongkan wardrobe' })).not.toBeInTheDocument()
  })

  it('an immediate commit carries the dial still waiting and disarms the timer', async () => {
    saveAction.mockResolvedValue({ ok: true, prefs: prefs() })
    panel()
    fireEvent.change(screen.getByRole('slider'), { target: { value: '80' } })
    fireEvent.click(screen.getAllByRole('checkbox')[1]!)
    await advance(0)

    expect(saveAction).toHaveBeenCalledTimes(1)
    expect(saveAction.mock.calls[0]![0]!.promptLength).toBe(80) // subsumed
    expect(saveAction.mock.calls[0]![0]!.focus[NINA_IMAGE_FOCUS_KEYS[1]]).toBe(true)
    await advance(IMAGEGEN_DIAL_COMMIT_DEBOUNCE_MS * 2)
    expect(saveAction).toHaveBeenCalledTimes(1) // and not double-sent
  })

  it('unmount inside the settle window fires no save', async () => {
    const view = render(
      <ImageGenPanel
        userId="u1"
        prefs={prefs()}
        defaults={prefs()}
        promptPreview="P"
        defaultTemplate="SHELL {{scene}}"
        references={[]}
        photoTotal={0}
      />,
    )
    fireEvent.change(screen.getByRole('slider'), { target: { value: '80' } })
    view.unmount()
    await advance(IMAGEGEN_DIAL_COMMIT_DEBOUNCE_MS * 2)
    expect(saveAction).not.toHaveBeenCalled()
  })
})

describe('ImageGenPanel — template and pipeline answers', () => {
  it('Reset stores the default TEMPLATE itself — an immediate commit, not a clear', async () => {
    saveAction.mockResolvedValue({ ok: true, prefs: prefs() })
    // The saved row holds a CUSTOM template, so resetting differs from saved and dispatches.
    // (When saved already IS the default, the equality check makes the click free.)
    panel(prefs({ promptTemplate: 'CUSTOM {{scene}}' }))
    fireEvent.click(screen.getByRole('button', { name: 'Reset to default template' }))
    await advance(0)
    await advance(0)

    expect(saveAction).toHaveBeenCalledTimes(1)
    expect(saveAction.mock.calls[0]![0]!.promptTemplate).toBe('SHELL {{scene}}')
    expect(templateBox()).toHaveValue('SHELL {{scene}}')
  })

  it('shows the prompt preview as the SAVED row while edits are pending, and warns the test panel', async () => {
    saveAction.mockResolvedValue({ ok: true, prefs: prefs() })
    panel()
    expect(screen.getByText('test-panel-clean')).toBeInTheDocument()

    fireEvent.change(wardrobeBox(), { target: { value: 'hoodie' } })
    expect(screen.getByText('test-panel-dirty')).toBeInTheDocument()
    expect(screen.getByText(/as saved — the edits above are not in it yet/)).toBeInTheDocument()
    expect(screen.getByText('THE ASSEMBLED IMAGE PROMPT')).toBeInTheDocument()

    fireEvent.blur(wardrobeBox())
    await advance(0)
    expect(screen.queryByText(/as saved/)).not.toBeInTheDocument()
    expect(screen.getByText('test-panel-clean')).toBeInTheDocument()
  })

  it('refuses without locking: the sentence shows, saved stays, controls stay live', async () => {
    saveAction.mockResolvedValue({ ok: false, error: 'The template has an unknown placeholder.' })
    panel()
    fireEvent.change(templateBox(), { target: { value: 'BROKEN {{nope}}' } })
    fireEvent.blur(templateBox())
    await advance(0)

    expect(screen.getByText('The template has an unknown placeholder.')).toBeInTheDocument()
    expect(screen.getByText('Unsaved edits')).toBeInTheDocument()
    expect(wardrobeBox()).not.toBeDisabled()
    expect(screen.getByRole('slider')).not.toBeDisabled()
  })

  it('adopts the canonical row on success and returns to Saved', async () => {
    const canonical = prefs({ promptLength: 70, wardrobe: 'Hoodie ' })
    saveAction.mockResolvedValue({ ok: true, prefs: canonical })
    panel()
    fireEvent.change(screen.getByRole('slider'), { target: { value: '70' } })
    await advance(IMAGEGEN_DIAL_COMMIT_DEBOUNCE_MS)
    await advance(0)

    expect(screen.getByText('Saved')).toBeInTheDocument()
    expect(screen.queryByTitle('Unsaved')).not.toBeInTheDocument()
    expect(screen.queryByText(/as saved/)).not.toBeInTheDocument()
  })
})
