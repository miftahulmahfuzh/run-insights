// @vitest-environment happy-dom
import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ImageGenPanel } from './ImageGenPanel'
import {
  generateAllImageFieldValuesAction,
  generateImageFieldValueAction,
  saveNinaImagePrefsAction,
} from '@/lib/admin/imageGenActions'
import { type ImageGenDraft } from '@/lib/admin/imageGenModel'
import {
  NINA_HAIRSTYLE_KEYS,
  NINA_IMAGE_FOCUS_KEYS,
  NINA_IMAGE_MODEL_IDS,
  NINA_PROMPT_TEMPLATE_MAX,
} from '@/lib/nina/imageprefs'

/*
 * The save action is mocked. `PhotoReferencePicker` and `ImageGenTestPanel` are stubbed at their
 * import boundary — each has its own suite from earlier in this session — with the picker reduced
 * to a button that fires its onChange contract and the test panel reduced to a dirty-flag lamp.
 * What is under test here is the PANEL: the commit-moment matrix it shares with CharacterPanel
 * (checkboxes/selects/reference immediate, five text controls on blur), the ✕ buttons that clear
 * without a second write path, the template reset that stores the default itself, and whole-row
 * payloads on every dispatch.
 */
vi.mock('@/lib/admin/imageGenActions', () => ({
  saveNinaImagePrefsAction: vi.fn(),
  /* Never exercised by name in this suite — the generate icon has its own coverage — but every
   * render mounts five of them, so a resolved default keeps a stray click from anyone's test
   * (a Tab-through, a broad `getAllByRole('button')`) from surfacing an unhandled rejection. */
  generateImageFieldValueAction: vi.fn().mockResolvedValue({ ok: false }),
  /* The "regenerate all five" control, above the photo reference section — the batch action's
   * own default, same reasoning. */
  generateAllImageFieldValuesAction: vi.fn().mockResolvedValue({ ok: false }),
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
const generateAction = vi.mocked(generateImageFieldValueAction)
const generateAllAction = vi.mocked(generateAllImageFieldValuesAction)

function prefs(overrides?: Partial<ImageGenDraft>): ImageGenDraft {
  return {
    focus: {},
    wardrobe: '',
    venue: '',
    time: '',
    notes: '',
    expression: '',
    promptTemplate: 'SHELL {{scene}}',
    model: 'qwen/qwen-image-3',
    reference: { source: 'none', id: '' },
    hairstyle: 'ponytail',
    cameraAngle: 'eye_level',
    ...overrides,
  }
}

function panel(p: ImageGenDraft = prefs()) {
  render(
    <ImageGenPanel
      userId="u1"
      prefs={p}
      promptPreview="THE ASSEMBLED IMAGE PROMPT"
      defaultTemplate="SHELL {{scene}}"
      references={[]}
      photoTotal={0}
      photoPage={1}
      photoPageCount={1}
      photoPreloadUrls={[]}
    />,
  )
}

/*
 * The five text controls in DOM order: wardrobe, venue, time, notes, template. Each of the four
 * fields' `<label>` wraps ONLY its field-name text (paired to the control by `htmlFor`/`id`) — the
 * generate button, the control itself and the ✕ are deliberately NOT inside it, so this suite
 * indexes rather than names them, but for a different reason than a wide label used to give: see
 * "the ✕ and typing never wake the generate button" below for what wrapping more than the text
 * used to do.
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
    expect(screen.getByText(/0 of 6 emphasised/)).toBeInTheDocument()
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
    // Two selects now share the page (the camera, and the 2026-09-18 hairstyle preset); the
    // camera is the first in DOM order.
    const select = screen.getAllByRole('combobox')[0] as HTMLSelectElement
    expect([...select.querySelectorAll('option')].map((o) => o.getAttribute('value'))).toEqual([
      ...NINA_IMAGE_MODEL_IDS,
    ])
    expect(select).toHaveValue('qwen/qwen-image-3')
  })

  it('renders the hairstyle as a closed select of the preset keys', () => {
    panel()
    const select = screen.getAllByRole('combobox')[1] as HTMLSelectElement
    expect([...select.querySelectorAll('option')].map((o) => o.getAttribute('value'))).toEqual([
      ...NINA_HAIRSTYLE_KEYS,
    ])
    expect(select).toHaveValue('ponytail')
  })

  it('names the template textarea — the one control whose heading is not a label', () => {
    panel()
    // The five fields above it sit inside wrapping <label>s; the template's <h3> labels nothing.
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
    fireEvent.change(screen.getAllByRole('combobox')[0]!, {
      target: { value: NINA_IMAGE_MODEL_IDS[1] },
    })
    await advance(0)
    expect(saveAction).toHaveBeenCalledTimes(1)
    expect(saveAction.mock.calls[0]![0]!.model).toBe(NINA_IMAGE_MODEL_IDS[1]!)
  })

  it('switching the hairstyle commits on CHANGE', async () => {
    saveAction.mockResolvedValue({ ok: true, prefs: prefs() })
    panel()
    fireEvent.change(screen.getAllByRole('combobox')[1]!, {
      target: { value: NINA_HAIRSTYLE_KEYS[1] },
    })
    await advance(0)
    expect(saveAction).toHaveBeenCalledTimes(1)
    expect(saveAction.mock.calls[0]![0]!.hairstyle).toBe(NINA_HAIRSTYLE_KEYS[1]!)
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
    await advance(1000)
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

  it('clicking ✕ never wakes the generate button — a bare click runs a real <label> click element', async () => {
    // Regression: the generate button, the input and the ✕ used to share ONE wrapping `<label>`.
    // A `<label>` with more than one labelable descendant resolves its "labeled control" to the
    // FIRST one in tree order — the ↻ button, since it sits in the header row above the input —
    // and `fireEvent.click` (unlike a bare `dispatchEvent`) runs the click's default action, which
    // for a `<label>` is to forward a synthetic click to that resolved control. So clicking ✕
    // silently fired the generate action too. `generateAction` is mocked to resolve `{ ok: false }`
    // by default (see the top-of-file mock), so this asserts it is never even asked.
    panel(prefs({ wardrobe: 'hoodie' }))
    fireEvent.click(screen.getByRole('button', { name: 'Kosongkan wardrobe' }))
    await advance(0)
    expect(generateAction).not.toHaveBeenCalled()
  })

  it('the generate icon fills the draft and rides the ordinary blur — no direct write', async () => {
    generateAction.mockResolvedValueOnce({ ok: true, value: 'sequined bikini' })
    panel()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Buat wardrobe baru' }))
    })
    expect(generateAction).toHaveBeenCalledWith(expect.objectContaining({ field: 'wardrobe' }))
    expect(wardrobeBox()).toHaveValue('sequined bikini')
    expect(document.activeElement).toBe(wardrobeBox())
    expect(saveAction).not.toHaveBeenCalled() // a suggestion is a draft, not a commit

    fireEvent.blur(wardrobeBox())
    await advance(0)
    expect(saveAction).toHaveBeenCalledTimes(1)
    expect(saveAction.mock.calls[0]![0]!.wardrobe).toBe('sequined bikini')
  })

  it('shows an inline error and leaves the field untouched when generation fails', async () => {
    generateAction.mockResolvedValueOnce({ ok: false })
    panel()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Buat wardrobe baru' }))
    })
    expect(screen.getByText(/Gagal membuat nilai baru/)).toBeInTheDocument()
    expect(wardrobeBox()).toHaveValue('')
    expect(saveAction).not.toHaveBeenCalled()
  })

  it('the "regenerate all" icon fills and SAVES all five fields in one call — unlike the per-field icons', async () => {
    const batchValues = {
      wardrobe: 'silk robe',
      venue: 'rooftop bar',
      time: 'blue hour',
      notes: 'windy',
      expression: 'She is smiling warmly.',
    }
    // The action returns the row AS STORED — with the batch values in it — so the merge adopts
    // cleanly, `a focus checkbox commits on CHANGE, immediately`'s own reasoning.
    saveAction.mockResolvedValue({ ok: true, prefs: prefs(batchValues) })
    generateAllAction.mockResolvedValueOnce({ ok: true, values: batchValues })
    panel()
    fireEvent.click(screen.getByRole('button', { name: 'Regenerate all five' }))
    await advance(0)
    await advance(0) // second flush: the save's own promise chain settles here

    expect(generateAllAction).toHaveBeenCalledWith({ adminRequest: '' })
    expect(wardrobeBox()).toHaveValue('silk robe')
    // A whole-row save, exactly like a dropdown pick — no extra blur needed.
    expect(saveAction).toHaveBeenCalledTimes(1)
    const sent = saveAction.mock.calls[0]![0]!
    expect(sent.wardrobe).toBe('silk robe')
    expect(sent.venue).toBe('rooftop bar')
    expect(sent.time).toBe('blue hour')
    expect(sent.notes).toBe('windy')
    expect(sent.expression).toBe('She is smiling warmly.')
  })

  it('sends the "Admin request" box as the batch call\'s starting point', async () => {
    generateAllAction.mockResolvedValueOnce({ ok: false })
    panel()
    fireEvent.change(screen.getByLabelText('Admin request'), { target: { value: 'pool table' } })
    fireEvent.click(screen.getByRole('button', { name: 'Regenerate all five' }))
    await advance(0)

    expect(generateAllAction).toHaveBeenCalledWith({ adminRequest: 'pool table' })
  })

  it('shows an inline error and saves nothing when the batch call fails', async () => {
    generateAllAction.mockResolvedValueOnce({ ok: false })
    panel()
    fireEvent.click(screen.getByRole('button', { name: 'Regenerate all five' }))
    await advance(0)

    expect(screen.getByText(/Gagal membuat nilai baru untuk kelima kolom/)).toBeInTheDocument()
    expect(wardrobeBox()).toHaveValue('')
    expect(saveAction).not.toHaveBeenCalled()
  })

  it('an immediate commit carries an unsent text edit along with it', async () => {
    saveAction.mockResolvedValue({ ok: true, prefs: prefs() })
    panel()
    fireEvent.change(wardrobeBox(), { target: { value: 'oversized hoodie' } })
    fireEvent.click(screen.getAllByRole('checkbox')[1]!)
    await advance(0)

    expect(saveAction).toHaveBeenCalledTimes(1)
    expect(saveAction.mock.calls[0]![0]!.wardrobe).toBe('oversized hoodie') // subsumed
    expect(saveAction.mock.calls[0]![0]!.focus[NINA_IMAGE_FOCUS_KEYS[1]]).toBe(true)
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
  })

  it('adopts the canonical row on success and returns to Saved', async () => {
    const canonical = prefs({ wardrobe: 'Hoodie' })
    saveAction.mockResolvedValue({ ok: true, prefs: canonical })
    panel()
    fireEvent.change(wardrobeBox(), { target: { value: '  Hoodie  ' } })
    fireEvent.blur(wardrobeBox())
    await advance(0)

    expect(screen.getByText('Saved')).toBeInTheDocument()
    expect(screen.queryByTitle('Unsaved')).not.toBeInTheDocument()
    expect(screen.queryByText(/as saved/)).not.toBeInTheDocument()
  })
})
