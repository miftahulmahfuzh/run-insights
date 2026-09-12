import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import {
  ADMIN_IMAGE_PREVIEW_SCENE,
  changedImageGenFields,
  focusOnKeys,
  hasImageFocusCopy,
  hasImageModelCopy,
  IMAGE_REFERENCE_NONE,
  imageFocusCopy,
  imageGenDraftEquals,
  IMAGEGEN_DIAL_COMMIT_DEBOUNCE_MS,
  imageModelHint,
  imageModelLabel,
  mergeImageGenAfterSave,
  parseReferenceKey,
  prettifyFocusKey,
  promptLengthCopy,
  referenceKey,
  toImageGenDraft,
  toImageReferenceOption,
  type ImageGenDraft,
} from '@/lib/admin/imageGenModel'
import { ninaImagePrefsWriteSchema } from '@/lib/admin/schema'
import {
  NINA_IMAGE_FOCUS_KEYS,
  NINA_IMAGE_MODEL_IDS,
  NINA_PROMPT_LENGTH_RUNGS,
  NINA_IMAGE_PROMPT_LENGTH_MAX,
  NINA_IMAGE_PROMPT_LENGTH_MIN,
  NINA_IMAGE_NOTES_MAX,
  NINA_IMAGE_PREFS_DEFAULTS,
  NINA_IMAGE_REFERENCE_ID_MAX,
  NINA_IMAGE_REFERENCE_SOURCES,
  NINA_IMAGE_TIME_MAX,
  NINA_IMAGE_VENUE_MAX,
  NINA_IMAGE_WARDROBE_MAX,
  NINA_PROMPT_TEMPLATE_MAX,
} from '@/lib/nina/imageprefs'

/**
 * `/admin/image-generation`'s panel — the testable surface. `tests/admin.tuning.test.ts` is the
 * sibling this file borrows its shape from, for the reason that file states: `vitest.config.ts`
 * runs `environment: 'node'` and includes no `.tsx`, so there is no render here, and that is not a
 * gap — everything about this panel that could be wrong in a way a human would not notice is a pure
 * function in `lib/admin/imageGenModel.ts` or a Zod shape in `lib/admin/schema.ts`.
 *
 * Every bound is imported from `@/lib/nina/imageprefs` rather than restated, so a test cannot
 * quietly become a second source of truth for a number the panel's `maxLength` also reads.
 */

const DEFAULTS: ImageGenDraft = toImageGenDraft(NINA_IMAGE_PREFS_DEFAULTS)

/** A valid save payload, with whatever overrides a case needs. */
function payload(overrides: Partial<ImageGenDraft> = {}) {
  return { userId: 'user_1', ...DEFAULTS, ...overrides }
}

describe('toImageGenDraft — the read-side seam', () => {
  it('carries every field phase 1 declares', () => {
    expect(DEFAULTS.promptLength).toBe(NINA_IMAGE_PREFS_DEFAULTS.promptLength)
    for (const key of NINA_IMAGE_FOCUS_KEYS) {
      expect(DEFAULTS.focus[key]).toBe(NINA_IMAGE_PREFS_DEFAULTS.focus[key])
    }
    expect(DEFAULTS.wardrobe).toBe(NINA_IMAGE_PREFS_DEFAULTS.wardrobe)
    expect(DEFAULTS.venue).toBe(NINA_IMAGE_PREFS_DEFAULTS.venue)
    expect(DEFAULTS.time).toBe(NINA_IMAGE_PREFS_DEFAULTS.time)
    expect(DEFAULTS.notes).toBe(NINA_IMAGE_PREFS_DEFAULTS.notes)
    expect(DEFAULTS.promptTemplate).toBe(NINA_IMAGE_PREFS_DEFAULTS.promptTemplate)
    expect(DEFAULTS.reference.source).toBe(NINA_IMAGE_PREFS_DEFAULTS.reference.source)
    expect(DEFAULTS.reference.id).toBe(NINA_IMAGE_PREFS_DEFAULTS.reference.id)
  })

  it('copies the focus record, so a draft edit cannot reach into the row it came from', () => {
    const draft = toImageGenDraft(NINA_IMAGE_PREFS_DEFAULTS)
    const key = NINA_IMAGE_FOCUS_KEYS[0]
    const before = NINA_IMAGE_PREFS_DEFAULTS.focus[key]
    draft.focus[key] = !before
    expect(NINA_IMAGE_PREFS_DEFAULTS.focus[key]).toBe(before)
  })
})

describe('the vocabulary is phase 1s, and is complete', () => {
  it('has exactly the six options the user named', () => {
    /* The literal stays a literal rather than becoming `NINA_IMAGE_FOCUS_KEYS.length`, which would
     * be a tautology. The number is here to make adding a seventh an explicit decision. */
    expect(NINA_IMAGE_FOCUS_KEYS).toHaveLength(6)
  })

  it('has a real label for every one of them', () => {
    for (const key of NINA_IMAGE_FOCUS_KEYS) {
      expect(hasImageFocusCopy(key), `no copy for focus option ${key}`).toBe(true)
      expect(imageFocusCopy(key).length).toBeGreaterThan(0)
    }
  })

  /*
   * The one thing about this vocabulary that could ship wrong without anybody noticing. The user
   * gave these six as prompt text — *"big boobs, bubble butt, big thighs, very long calves"* — and
   * a well-meaning edit that replaced them with clinical synonyms would change what the camera is
   * asked for while leaving the page looking finished. This is a NEGATIVE assertion on purpose:
   * phase 1 owns the spelling and asserts the words in `tests/nina.imageprefs.test.ts`, so
   * restating them here would be a second source of truth for the same requirement.
   */
  it('has not sanitised the option names into clinical synonyms', () => {
    const labels = NINA_IMAGE_FOCUS_KEYS.map((key) => imageFocusCopy(key))
      .join(' ')
      .toLowerCase()
    for (const clinical of ['mammary', 'gluteal', 'gluteus', 'adipose', 'posterior', 'bust']) {
      expect(labels, `a focus label says "${clinical}"`).not.toContain(clinical)
    }
  })

  it('reads the length band off phase 1 and names it beside the slider', () => {
    for (const value of [NINA_IMAGE_PROMPT_LENGTH_MIN, 50, NINA_IMAGE_PROMPT_LENGTH_MAX]) {
      const copy = promptLengthCopy(value)
      expect(copy.label.length).toBeGreaterThan(0)
      expect(copy.hint.length).toBeGreaterThan(0)
    }
    /* The bottom and the top of the scale must not read as the same band, or the slider is a
     * control the operator cannot predict — the fork the index settled by putting it on the repo's
     * five-band scale. */
    expect(promptLengthCopy(NINA_IMAGE_PROMPT_LENGTH_MIN).band).not.toBe(
      promptLengthCopy(NINA_IMAGE_PROMPT_LENGTH_MAX).band,
    )
    /* And the band the hub card prints is one phase 1 declares, not a string this file invented. */
    for (const value of [NINA_IMAGE_PROMPT_LENGTH_MIN, 50, NINA_IMAGE_PROMPT_LENGTH_MAX]) {
      expect(NINA_PROMPT_LENGTH_RUNGS.map((rung) => rung.label)).toContain(
        promptLengthCopy(value).band,
      )
    }
  })

  it('falls back to a readable label for a key it has never heard of', () => {
    expect(hasImageFocusCopy('some_new_option')).toBe(false)
    expect(imageFocusCopy('some_new_option')).toBe('Some new option')
    /* And a key phase 1 DOES declare keeps its declared label rather than the prettified key:
     * `prettifyFocusKey('butt')` is "Butt", and the user's word is "bubble butt". */
    expect(prettifyFocusKey('butt')).toBe('Butt')
    expect(imageFocusCopy('butt')).toBe('Bubble butt')
  })

  it('spells the none-reference source with a value phase 1 still declares', () => {
    /* `IMAGE_REFERENCE_NONE` is the ONE literal in this phase that names a member of phase 1's
     * reference vocabulary. If phase 1 renames it, this fails here rather than at save time. */
    expect(NINA_IMAGE_REFERENCE_SOURCES).toContain(IMAGE_REFERENCE_NONE.source)
    /* `''`, not `null` — phase 1's `NinaImageReference.id` is `string`, and the whole
     * encode/decode pair below rests on there being exactly one empty value. */
    expect(IMAGE_REFERENCE_NONE.id).toBe('')
    expect(NINA_IMAGE_PREFS_DEFAULTS.reference.id).toBe('')
  })

  it('stands the preview scene in with a real sentence', () => {
    expect(ADMIN_IMAGE_PREVIEW_SCENE.trim().length).toBeGreaterThan(0)
    expect(ADMIN_IMAGE_PREVIEW_SCENE).toBe(ADMIN_IMAGE_PREVIEW_SCENE.trim())
  })
})

describe('the reference option — what a tile may know', () => {
  it('maps a row to url and thumbUrl, defaulting a missing thumb to null', () => {
    expect(
      toImageReferenceOption({ source: 'chat', id: 'img_1', blobUrl: 'https://b/1.png' }),
    ).toEqual({ key: 'chat:img_1', url: 'https://b/1.png', thumbUrl: null })
    expect(
      toImageReferenceOption({
        source: 'album',
        id: 'av_1',
        blobUrl: 'https://b/2.png',
        thumbUrl: 'https://b/2t.png',
      }).thumbUrl,
    ).toBe('https://b/2t.png')
  })

  it('carries no caption, no filename and no date — R10s whole point', () => {
    const option = toImageReferenceOption({
      source: 'album',
      id: 'av_1',
      blobUrl: 'https://b/2.png',
    })
    /* PHASE 5 DEPENDS ON THIS EXACT FIELD LIST. `ImageReferenceOption` is structurally identical to
     * phase 5's `PhotoReferenceItem`, which is what lets phase 5 write `items={references}` without
     * importing anything from this phase — and the absence of `source` is what makes phase 5's
     * "no tile announces its set" exit criterion structural rather than a promise. */
    expect(Object.keys(option).sort()).toEqual(['key', 'thumbUrl', 'url'])
  })

  it('identifies one photograph across the two sets', () => {
    expect(referenceKey({ source: 'album', id: 'x' })).not.toBe(
      referenceKey({ source: 'chat', id: 'x' }),
    )
    /* Round-trips, which is what the picker's opaque-string contract rests on. */
    expect(parseReferenceKey(referenceKey({ source: 'album', id: 'av_1' }))).toEqual({
      source: 'album',
      id: 'av_1',
    })
    expect(referenceKey(IMAGE_REFERENCE_NONE)).toBe('')
    expect(parseReferenceKey('')).toEqual(IMAGE_REFERENCE_NONE)
    expect(parseReferenceKey('shots:x')).toEqual(IMAGE_REFERENCE_NONE)
    expect(parseReferenceKey('album:')).toEqual(IMAGE_REFERENCE_NONE)
    expect(referenceKey(IMAGE_REFERENCE_NONE)).toBe(referenceKey({ ...IMAGE_REFERENCE_NONE }))
  })
})

describe('changedImageGenFields — what the operator sees as unsaved', () => {
  it('is empty for two identical drafts', () => {
    expect(changedImageGenFields(DEFAULTS, DEFAULTS)).toEqual([])
    expect(imageGenDraftEquals(DEFAULTS, toImageGenDraft(NINA_IMAGE_PREFS_DEFAULTS))).toBe(true)
  })

  it('names the seven scalar fields in a fixed order', () => {
    const edited: ImageGenDraft = {
      ...DEFAULTS,
      promptLength:
        DEFAULTS.promptLength === NINA_IMAGE_PROMPT_LENGTH_MAX ? 0 : NINA_IMAGE_PROMPT_LENGTH_MAX,
      wardrobe: 'long hugging leggings with string bra',
      venue: 'Kuta streets in Bali',
      time: 'rainy night',
      notes: 'nina is full of sweat',
      promptTemplate: '{{scene}}\n\nHer outfit: {{wardrobe}}',
      /* The id that is NOT the default — DEFAULTS.model rides NINA_IMAGE_MODEL_DEFAULT, so an
       * edit equal to the default is by definition not a changed field. */
      model: 'qwen/qwen-image-3-pro',
    }
    expect(changedImageGenFields(edited, DEFAULTS)).toEqual([
      'promptLength',
      'wardrobe',
      'venue',
      'time',
      'notes',
      'promptTemplate',
      'model',
    ])
    expect(imageGenDraftEquals(edited, DEFAULTS)).toBe(false)
  })

  it('names a flipped focus option by its own dotted path, after the scalars', () => {
    const key = NINA_IMAGE_FOCUS_KEYS[0]
    const flipped: ImageGenDraft = {
      ...DEFAULTS,
      focus: { ...DEFAULTS.focus, [key]: !(DEFAULTS.focus[key] ?? false) },
    }
    expect(changedImageGenFields(flipped, DEFAULTS)).toEqual([`focus.${key}`])
  })

  it('treats an absent focus key as OFF on both sides, so it is not a spurious difference', () => {
    const bare: ImageGenDraft = { ...DEFAULTS, focus: {} }
    const allOff: ImageGenDraft = {
      ...DEFAULTS,
      focus: Object.fromEntries(NINA_IMAGE_FOCUS_KEYS.map((key) => [key, false])),
    }
    expect(changedImageGenFields(bare, allOff)).toEqual([])
  })

  it('names the reference as ONE path, so a picked photo reads as one unsaved change', () => {
    const picked: ImageGenDraft = { ...DEFAULTS, reference: { source: 'album', id: 'av_1' } }
    expect(changedImageGenFields(picked, DEFAULTS)).toEqual(['reference'])
    expect(changedImageGenFields(DEFAULTS, picked)).toEqual(['reference'])
  })

  it('counts a focus key that exists on one side only', () => {
    const missing: ImageGenDraft = { ...DEFAULTS, focus: {} }
    const on: ImageGenDraft = {
      ...DEFAULTS,
      focus: Object.fromEntries(NINA_IMAGE_FOCUS_KEYS.map((key) => [key, true])),
    }
    expect(changedImageGenFields(missing, on)).toHaveLength(NINA_IMAGE_FOCUS_KEYS.length)
  })
})

describe('IMAGEGEN_DIAL_COMMIT_DEBOUNCE_MS — the settle window', () => {
  it('is 600ms: long enough that one drag is one save, short enough that Saved lands while you watch', () => {
    /* Pinned as a literal for the same reason the tuning window is: recalibrating the window is a
     * product decision, and this line is where it becomes an explicit one. */
    expect(IMAGEGEN_DIAL_COMMIT_DEBOUNCE_MS).toBe(600)
  })
})

describe('mergeImageGenAfterSave — the post-save canonical merge', () => {
  it('adopts the stored row for every field untouched since the dispatch', () => {
    /* `coerceNinaImageText` collapses whitespace runs and trims, so the stored form is not always
     * the typed string — the merge must show the stored form, not keep the pre-coercion text the
     * operator can no longer get back to. */
    const sent: ImageGenDraft = { ...DEFAULTS, wardrobe: '  long  hugging  leggings  ' }
    const canonical: ImageGenDraft = { ...sent, wardrobe: 'long hugging leggings' }
    const merged = mergeImageGenAfterSave(sent, sent, canonical)
    expect(merged.wardrobe).toBe('long hugging leggings')
    expect(imageGenDraftEquals(merged, canonical)).toBe(true)
  })

  it('keeps a dial moved after the dispatch, and leaves exactly that field pending', () => {
    const sent: ImageGenDraft = { ...DEFAULTS, promptLength: 40 }
    const movedSince: ImageGenDraft = { ...sent, promptLength: 90 }
    const merged = mergeImageGenAfterSave(movedSince, sent, sent)
    expect(merged.promptLength).toBe(90)
    expect(changedImageGenFields(merged, sent)).toEqual(['promptLength'])
  })

  it('does not clobber notes typed after the dispatch with the coerced stored value', () => {
    const sent: ImageGenDraft = { ...DEFAULTS, notes: '  nina is full of sweat  ' }
    const canonical: ImageGenDraft = { ...sent, notes: 'nina is full of sweat' }
    const typedSince: ImageGenDraft = { ...sent, notes: 'nina is full of sweat and glowing' }
    const merged = mergeImageGenAfterSave(typedSince, sent, canonical)
    expect(merged.notes).toBe('nina is full of sweat and glowing')
    expect(changedImageGenFields(merged, canonical)).toEqual(['notes'])
  })

  it('carries the focus map through the same per-key rule', () => {
    const key = NINA_IMAGE_FOCUS_KEYS[0]
    const sent: ImageGenDraft = { ...DEFAULTS, focus: { ...DEFAULTS.focus, [key]: true } }
    /* The operator un-ticks after dispatch; the stored row still says on. */
    const untickedSince: ImageGenDraft = { ...sent, focus: { ...sent.focus, [key]: false } }
    const merged = mergeImageGenAfterSave(untickedSince, sent, sent)
    expect(merged.focus[key]).toBe(false)
    expect(changedImageGenFields(merged, sent)).toEqual([`focus.${key}`])
  })

  it('decides the reference by its key — the same measure the pending mark uses', () => {
    const sent: ImageGenDraft = { ...DEFAULTS, reference: { source: 'album', id: 'av_1' } }
    /* Untouched since dispatch: canonical is adopted even where coercion rewrote it (an
     * unresolvable reference coerces to none at the store). */
    const canonical: ImageGenDraft = { ...sent, reference: IMAGE_REFERENCE_NONE }
    expect(mergeImageGenAfterSave(sent, sent, canonical).reference).toEqual(IMAGE_REFERENCE_NONE)
    /* Re-picked since dispatch: the newer local value stays, whatever it points at. */
    const pickedSince: ImageGenDraft = { ...sent, reference: { source: 'chat', id: 'img_2' } }
    const merged = mergeImageGenAfterSave(pickedSince, sent, sent)
    expect(merged.reference).toEqual({ source: 'chat', id: 'img_2' })
    expect(changedImageGenFields(merged, sent)).toEqual(['reference'])
  })
})

describe('focusOnKeys — what the header counts', () => {
  it('returns phase 1s declared order and nothing else', () => {
    const all: ImageGenDraft = {
      ...DEFAULTS,
      focus: Object.fromEntries(NINA_IMAGE_FOCUS_KEYS.map((key) => [key, true])),
    }
    expect(focusOnKeys(all)).toEqual([...NINA_IMAGE_FOCUS_KEYS])
    expect(focusOnKeys({ ...DEFAULTS, focus: {} })).toEqual([])
    /* A key the row holds and phase 1 does not declare is not counted: the six the user named are
     * the six the header is about. */
    expect(focusOnKeys({ ...DEFAULTS, focus: { invented: true } })).toEqual([])
  })
})

describe('ninaImagePrefsWriteSchema — the boundary', () => {
  it('accepts the default prefs as a payload', () => {
    expect(ninaImagePrefsWriteSchema.safeParse(payload()).success).toBe(true)
  })

  it('refuses a missing focus option rather than defaulting it', () => {
    const rest = { ...DEFAULTS.focus }
    delete rest[NINA_IMAGE_FOCUS_KEYS[0]]
    expect(ninaImagePrefsWriteSchema.safeParse(payload({ focus: rest })).success).toBe(false)
  })

  it('refuses a focus key nobody declared, instead of stripping it', () => {
    const focus = { ...DEFAULTS.focus, bigThighss: true }
    expect(ninaImagePrefsWriteSchema.safeParse(payload({ focus })).success).toBe(false)
  })

  it('refuses a non-boolean toggle', () => {
    /* Cast because the point of the case is a value the DRAFT type forbids and a browser could
     * still send: Zod is the runtime check. */
    const stringly = { ...DEFAULTS.focus, [NINA_IMAGE_FOCUS_KEYS[0]]: 'true' } as unknown as Record<
      string,
      boolean
    >
    expect(ninaImagePrefsWriteSchema.safeParse(payload({ focus: stringly })).success).toBe(false)
  })

  it('refuses a prompt length outside phase 1s own range, and a fractional one', () => {
    for (const bad of [
      NINA_IMAGE_PROMPT_LENGTH_MIN - 1,
      NINA_IMAGE_PROMPT_LENGTH_MAX + 1,
      42.5,
      Number.NaN,
    ]) {
      expect(
        ninaImagePrefsWriteSchema.safeParse(payload({ promptLength: bad })).success,
        `${bad}`,
      ).toBe(false)
    }
    for (const good of [NINA_IMAGE_PROMPT_LENGTH_MIN, NINA_IMAGE_PROMPT_LENGTH_MAX]) {
      expect(ninaImagePrefsWriteSchema.safeParse(payload({ promptLength: good })).success).toBe(
        true,
      )
    }
  })

  it('bounds all four free-text fields, and accepts each empty', () => {
    expect(
      ninaImagePrefsWriteSchema.safeParse(payload({ wardrobe: '', venue: '', time: '', notes: '' }))
        .success,
    ).toBe(true)
    const bounds: [keyof ImageGenDraft, number][] = [
      ['wardrobe', NINA_IMAGE_WARDROBE_MAX],
      ['venue', NINA_IMAGE_VENUE_MAX],
      ['time', NINA_IMAGE_TIME_MAX],
      ['notes', NINA_IMAGE_NOTES_MAX],
    ]
    for (const [field, max] of bounds) {
      /* The panel's `maxLength` and this schema must be the SAME number, or the field refuses a
       * keystroke the action would have accepted. One home, two readers.
       *
       * The cast is a TypeScript limitation and not a loosening: a computed key whose type is a
       * union widens the literal to `{ [x: string]: string }`, which `Partial<ImageGenDraft>` will
       * not accept even though every member of the union is a `string` field. */
      expect(
        ninaImagePrefsWriteSchema.safeParse(
          payload({ [field]: 'x'.repeat(max) } as Partial<ImageGenDraft>),
        ).success,
        `${field} at exactly ${max}`,
      ).toBe(true)
      expect(
        ninaImagePrefsWriteSchema.safeParse(
          payload({ [field]: 'x'.repeat(max + 1) } as Partial<ImageGenDraft>),
        ).success,
        `${field} at ${max + 1}`,
      ).toBe(false)
    }
  })

  it('§8: the model is a closed enum — every declared id in, everything else out', () => {
    for (const id of NINA_IMAGE_MODEL_IDS) {
      expect(ninaImagePrefsWriteSchema.safeParse(payload({ model: id })).success, id).toBe(true)
    }
    for (const forged of ['gpt-image-1', 'qwen/qwen-image-3-ultra', '', null, 42]) {
      expect(
        ninaImagePrefsWriteSchema.safeParse(payload({ model: forged as never })).success,
        String(forged),
      ).toBe(false)
    }
  })

  it('bounds the template at the same number the textarea spells, and accepts a valid shell', () => {
    expect(ninaImagePrefsWriteSchema.safeParse(payload({ promptTemplate: '' })).success).toBe(true)
    expect(
      ninaImagePrefsWriteSchema.safeParse(
        payload({ promptTemplate: 'Her outfit: {{wardrobe}}\n\n{{scene}}' }),
      ).success,
    ).toBe(true)
    /* The boundary cases must be VALID templates — prose padding around the required tokens, not
     * bare filler, which the validator refuses for its own (missing-placeholder) reason. */
    const validAt = (n: number): string => {
      const base = '{{scene}}'
      return base + 'p'.repeat(n - base.length)
    }
    expect(
      ninaImagePrefsWriteSchema.safeParse(
        payload({ promptTemplate: validAt(NINA_PROMPT_TEMPLATE_MAX) }),
      ).success,
    ).toBe(true)
    expect(
      ninaImagePrefsWriteSchema.safeParse(
        payload({ promptTemplate: validAt(NINA_PROMPT_TEMPLATE_MAX + 1) }),
      ).success,
    ).toBe(false)
  })

  it('refuses a template that would break the placeholder wiring — the user’s stated requirement', () => {
    for (const broken of [
      '{{camera}}\n\n{{scene}}\n\n{{wordrobe}}', // a typo'd placeholder
      '{{camera}}\n\n{{subject}}', // missing the required {{scene}}
      '{{wardrobe}}', // missing the required {{scene}}
      '{camera}', // a stray single brace
      '{{camera}\n\n{{scene}}\n\n{{subject}}', // an unbalanced closer
    ]) {
      const verdict = ninaImagePrefsWriteSchema.safeParse(payload({ promptTemplate: broken }))
      expect(verdict.success, broken).toBe(false)
      /* The refusal is SPECIFIC — the action surfaces the validator's own sentence, which names
       * the offending placeholder, so the operator can fix it in one pass. */
      if (!verdict.success) {
        const issue = verdict.error.issues.find((candidate) =>
          candidate.path.includes('promptTemplate'),
        )
        expect(issue?.message.length ?? 0, broken).toBeGreaterThan(0)
      }
    }
    /* Reordered, duplicated and prose-decorated shells are all FINE — that is the control. */
    expect(
      ninaImagePrefsWriteSchema.safeParse(
        payload({
          promptTemplate: '{{scene}}\n\nSHOT ON FILM.\n\n{{wardrobe}}\n\n{{scene}}',
        }),
      ).success,
    ).toBe(true)
  })

  it('accepts a reference that names a photograph, and the none reference', () => {
    for (const source of NINA_IMAGE_REFERENCE_SOURCES.filter(
      (value) => value !== IMAGE_REFERENCE_NONE.source,
    )) {
      expect(
        ninaImagePrefsWriteSchema.safeParse(payload({ reference: { source, id: 'av_1' } })).success,
        source,
      ).toBe(true)
    }
    expect(
      ninaImagePrefsWriteSchema.safeParse(payload({ reference: IMAGE_REFERENCE_NONE })).success,
    ).toBe(true)
  })

  it('refuses the two references that would fail invisibly', () => {
    /* A source with no id names a SET and no photograph; an id under the none source is an
     * unselected reference still carrying one. Either round-trips through the panel looking fine
     * and then hands phase 6 a job it cannot anchor. */
    expect(
      ninaImagePrefsWriteSchema.safeParse(payload({ reference: { source: 'album', id: '' } }))
        .success,
    ).toBe(false)
    expect(
      ninaImagePrefsWriteSchema.safeParse(
        payload({ reference: { source: IMAGE_REFERENCE_NONE.source, id: 'av_1' } }),
      ).success,
    ).toBe(false)
  })

  it('refuses a reference source nobody declared, and an over-long id', () => {
    expect(
      ninaImagePrefsWriteSchema.safeParse(payload({ reference: { source: 'shots', id: 'x' } }))
        .success,
    ).toBe(false)
    expect(
      ninaImagePrefsWriteSchema.safeParse(
        payload({
          reference: { source: 'album', id: 'x'.repeat(NINA_IMAGE_REFERENCE_ID_MAX + 1) },
        }),
      ).success,
    ).toBe(false)
  })

  it('refuses an empty userId, which requireAdmin would never produce', () => {
    expect(ninaImagePrefsWriteSchema.safeParse(payload({ userId: '' } as never)).success).toBe(
      false,
    )
  })
})

/* ── the structural half ─────────────────────────────────────────────────────────────────────── */

const ACTIONS = 'lib/admin/imageGenActions.ts'
const MODEL = 'lib/admin/imageGenModel.ts'
const PANEL = 'components/admin/ImageGenPanel.tsx'
const PAGE = 'app/admin/image-generation/page.tsx'

/**
 * A source file with its block comments removed. `tests/admin.tuning.test.ts`'s `codeOnly` and its
 * argument verbatim: these files must CARRY docstrings that name `server-only` and the guarded
 * entry points in order to explain the boundary, and a raw `String.contains` cannot tell a boundary
 * being documented from one being crossed. Scanning code only is strictly stronger, because it
 * cannot be satisfied by a rewording.
 */
function codeOnly(path: string): string {
  return readFileSync(path, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
}

describe('the gate cannot be forgotten — plan invariant 6', () => {
  it('opens EVERY action with requireAdmin(), including ones later phases append', () => {
    const bodies = readFileSync(ACTIONS, 'utf8').split('export async function ').slice(1)
    expect(bodies.length).toBeGreaterThan(0)
    for (const body of bodies) {
      const name = body.slice(0, body.indexOf('('))
      const gate = body.indexOf('await requireAdmin()')
      expect(gate, `${name} does not gate`).toBeGreaterThan(-1)
      /* First statement, so nothing above it can read a client-supplied argument. `requireAdmin`
       * exits by throwing framework control flow (`redirect('/')` / `notFound()`), which is why it
       * must never be wrapped in a bare try/catch either. */
      const bodyStart = body.indexOf('{')
      expect(body.slice(bodyStart, gate)).not.toMatch(/\bawait\b(?!\s+requireAdmin)/)
    }
  })

  /*
   * ── THE SPLIT THAT SURVIVED RECONCILIATION ──────────────────────────────────────────────────
   * The `requireAdmin`-is-first half above keeps looping over EVERY `export async function` in the
   * action file, forever. This `.safeParse` half does not loop, because exactly ONE action in the
   * file takes a payload worth validating: `saveNinaImagePrefsAction`. The two test-prompt actions
   * deliberately take none — `runNinaImageTestAction` has no arguments at all (there is no shape to
   * forge, so an empty `z.object({})` would be cargo cult) and `readNinaImageTestAction`
   * shape-checks its one id with `isValidId` plus an owner-scoped `WHERE`. Zod on those would be a
   * schema asserting nothing.
   */
  it('parses the payload with Zod, after the gate, in the one action that takes one', () => {
    const source = readFileSync(ACTIONS, 'utf8')
    for (const name of ['saveNinaImagePrefsAction']) {
      const body = source.slice(source.indexOf(`export async function ${name}`))
      const gate = body.indexOf('await requireAdmin()')
      const zod = body.indexOf('.safeParse(')
      expect(gate, `${name} does not gate`).toBeGreaterThan(-1)
      expect(zod, `${name} does not parse`).toBeGreaterThan(-1)
      expect(gate, `${name} parses before it gates`).toBeLessThan(zod)
    }
  })

  it('gates the page before it reads anything', () => {
    const source = readFileSync(PAGE, 'utf8')
    const gate = source.indexOf('await requireAdmin()')
    expect(gate).toBeGreaterThan(-1)
    for (const read of ['readNinaImagePrefs(', 'readNinaTuning(', 'listNinaPhotoReferences(']) {
      expect(gate, `${read} runs before the gate`).toBeLessThan(source.indexOf(read))
    }
  })

  it('declares force-dynamic for the recorded reason', () => {
    expect(readFileSync(PAGE, 'utf8')).toContain("export const dynamic = 'force-dynamic'")
  })
})

describe('one save, not eleven — plan invariant 7', () => {
  /*
   * ── RECONCILED: AN ALLOWLIST, NOT A COUNT ───────────────────────────────────────────────────
   * The prefs half of the action file is ONE action — the whole-row save every control rides on.
   * The two prompt-test actions are a different KIND of action (one spends money, one polls a
   * job), not one more field. The allowlist fails loudly if anyone adds an action nobody planned —
   * and, since the simplify set, if anyone re-adds the reset the panel no longer offers: the
   * `codeOnly` negative below fires on the identifier even though the file's header discusses the
   * deletion in prose (comments may document what code may not do).
   */
  it('exports only planned actions: the prefs save plus the two test actions', () => {
    const source = readFileSync(ACTIONS, 'utf8')
    const exported = (source.match(/^export async function (\w+)/gm) ?? []).map((line) =>
      line.replace('export async function ', ''),
    )
    const planned = [
      /* R4-R10's write half, auto-saved since the simplify set. One whole-prefs save. */
      'saveNinaImagePrefsAction',
      /* R11/R12 — the prompt test. */
      'runNinaImageTestAction',
      'readNinaImageTestAction',
    ]
    for (const name of exported) {
      expect(
        planned,
        `unplanned action ${name} — add it to a plan before adding it here`,
      ).toContain(name)
    }
    expect(exported).toContain('saveNinaImagePrefsAction')
    expect(codeOnly(ACTIONS)).not.toContain('resetNinaImagePrefsAction')
  })

  it('sends every control in the one save call', () => {
    /* The panel must not gain a second action for the picker or for any field. Read the call site:
     * every member of the draft has to appear in the one payload — and there is exactly one call
     * site, so no control grew a side channel. */
    const source = codeOnly(PANEL)
    expect((source.match(/saveNinaImagePrefsAction\(/g) ?? []).length).toBe(1)
    const call = source.slice(source.indexOf('saveNinaImagePrefsAction({'))
    for (const field of [
      'promptLength',
      'focus',
      'wardrobe',
      'venue',
      'time',
      'notes',
      'promptTemplate',
      'model',
      'reference',
    ]) {
      expect(call, `the save call omits ${field}`).toContain(field)
    }
  })

  it('writes through phase 1s query and revalidates this page', () => {
    const source = readFileSync(ACTIONS, 'utf8')
    expect(source).toContain('writeNinaImagePrefs(')
    expect(source).toContain("revalidatePath('/admin/image-generation')")
  })
})

describe('the panel commits itself — no staged-commit row', () => {
  it('renders none of the removed controls or the removed action', () => {
    /* The raw file for the user-facing labels, codeOnly for the identifiers — the same split the
     * `codeOnly` docstring argues for: a comment may DISCUSS the boundary, only code may cross it.
     * The panel's header names the removed row in prose, which is exactly why the label assertions
     * must not match prose the header is free to write. */
    const source = readFileSync(PANEL, 'utf8')
    for (const gone of ['Save every parameter', 'Discard changes', 'Reset to defaults']) {
      expect(source, `the panel still offers "${gone}"`).not.toContain(gone)
    }
    const code = codeOnly(PANEL)
    expect(code).not.toContain('confirmingReset')
    expect(code).not.toContain('resetNinaImagePrefsAction')
  })

  it('debounces the dial on the named settle window and clears the timer', () => {
    const code = codeOnly(PANEL)
    expect(code).toContain('IMAGEGEN_DIAL_COMMIT_DEBOUNCE_MS')
    expect(code).toContain('setTimeout(')
    /* Cleared on re-arm, on subsumption, and on unmount — the ImageGenTestPanel hygiene. */
    expect(code).toContain('clearTimeout(')
  })

  it('commits the five text controls on blur, and never on a keystroke timer', () => {
    const code = codeOnly(PANEL)
    expect((code.match(/onBlur=\{commitText\}/g) ?? []).length).toBe(5)
    /* The blur path itself: typing touches only setDraft, so the commit reads the draft the
     * keystrokes already landed — no timer anywhere on this path. `commitText` is the LAST handler
     * before the JSX, so the slice is its body alone. */
    const fn = code.slice(code.indexOf('function commitText()'), code.indexOf('return ('))
    expect(fn).not.toContain('setTimeout')
  })

  it('commits the six focus options and the reference pick immediately on change', () => {
    const code = codeOnly(PANEL)
    expect(code).toContain('setFocus(key, event.target.checked)')
    expect(code).toContain('setReference(parseReferenceKey(next))')
    /* Each name appears once as the definition and once per call site that rides it: five
     * `commitImmediate` (definition, setFocus, setReference, the template reset, the model
     * select) and two `scheduleDialCommit` (definition, the dial's onChange). Nothing else may
     * route to either. */
    expect((code.match(/commitImmediate\(/g) ?? []).length).toBe(5)
    expect((code.match(/scheduleDialCommit\(/g) ?? []).length).toBe(2)
  })

  it('does not fire a save for a draft identical to the saved row', () => {
    const code = codeOnly(PANEL)
    /* Both paths guard with the same equality — immediate at :commitImmediate, fire-time inside
     * the debounce callback against the live ref mirror. */
    expect((code.match(/imageGenDraftEquals\(/g) ?? []).length).toBeGreaterThanOrEqual(3)
    expect(code).toContain('mergeImageGenAfterSave(')
  })

  it('does not lock the controls while a commit is in flight', () => {
    /* Editing during a save is safe (sequential dispatch + the guarded merge); locking on every
     * settle would flicker the panel uneditable for a round trip each time. */
    expect(codeOnly(PANEL)).not.toContain('disabled={pending}')
  })

  it('shows the save-status surface where the counter used to be', () => {
    const source = readFileSync(PANEL, 'utf8')
    expect(source).toContain('Saving…')
    expect(source).toContain("'Saved'")
    expect(source).toContain("'Unsaved edits'")
    expect(source).toContain('aria-live="polite"')
    /* The staged-commit counter is gone; the per-control "unsaved" marks stay. */
    expect(codeOnly(PANEL)).not.toContain('unsaved.size')
  })
})

describe('the client half stays client-safe — plan invariant 9', () => {
  /*
   * ── RECONCILED: TWO IMPORTS, NOT ONE ────────────────────────────────────────────────────────
   * The draft of this case asserted a single import of `@/lib/nina/imageprefs`. It is TWO, and the
   * second one is phase 1's own instruction rather than a convenience: `ninaPromptLengthRungFor`
   * takes a BAND INDEX, `imageprefs.ts` deliberately keeps no second copy of the band vocabulary,
   * and phase 1's Handoff says *"render the band caption via
   * `ninaPromptLengthRungFor(ninaBand(value).index)` and never re-derive a band from a score."*
   * So `ninaBand` comes from `@/lib/nina/tuning`.
   *
   * The property that actually matters is unchanged and is what this asserts: BOTH are zero-import
   * `lib/nina` vocabulary modules, loadable in a browser bundle and in a vitest `node`
   * environment. `lib/admin/tuningModel.ts` imports `@/lib/nina/tuning` today on the same footing.
   */
  it('keeps imageGenModel client-safe: it imports only phase 1s zero-import vocabulary', () => {
    const source = codeOnly(MODEL)
    const imports = source.match(/^import[\s\S]*?from '([^']+)'/gm) ?? []
    expect(imports.length).toBeGreaterThan(0)
    const allowed = ["from '@/lib/nina/imageprefs'", "from '@/lib/nina/tuning'"]
    for (const line of imports) {
      expect(
        allowed.some((from) => line.includes(from)),
        `imageGenModel imports something outside phase 1s vocabulary: ${line}`,
      ).toBe(true)
    }
    expect(source).not.toContain('server-only')
    expect(source).not.toContain('@/lib/db')
    expect(source).not.toContain('zod')
  })

  it("declares 'use client' and reaches nothing server-only", () => {
    expect(readFileSync(PANEL, 'utf8').startsWith("'use client'")).toBe(true)
    const source = codeOnly(PANEL)
    for (const forbidden of [
      'server-only',
      '@/lib/nina/queries',
      '@/lib/db/',
      '@/lib/env',
      '@/lib/admin/requireAdmin',
      '@/lib/admin/schema',
      '@/components/ui/AppShell',
    ]) {
      expect(source, `${PANEL} reaches ${forbidden}`).not.toContain(forbidden)
    }
  })
})

describe('the preview is an assembly, not a call — plan invariant 5', () => {
  it('assembles the prompt with phase 2s builder and awaits no model entry point', () => {
    const source = codeOnly(PAGE)
    expect(source).toContain('buildNinaImagePrompt(')
    /* `scripts/check-llm-payload-boundary.mjs` Rule 2's table, in full. A page that names one of
     * these has either become a model caller or is about to. */
    for (const guarded of [
      'runNinaTurn',
      'distillNinaMemory',
      'describeNinaImage',
      'resolveNinaPromises',
      'getOrCreateInsight',
      'titleNinaSessionIfNeeded',
      'rankNinaSearchHits',
      'runNinaImageJob',
    ]) {
      expect(source, `the image-generation page names ${guarded}`).not.toContain(guarded)
    }
  })

  it('stands the scene in from the one exported constant, so phase 6 can send the same one', () => {
    expect(codeOnly(PAGE)).toContain('ADMIN_IMAGE_PREVIEW_SCENE')
  })
})

describe('the photo reference round-trips before the picker exists (R10)', () => {
  it('keeps the selection in the same draft as every other control', () => {
    const picked: ImageGenDraft = { ...DEFAULTS, reference: { source: 'album', id: 'av_9' } }
    expect(changedImageGenFields(picked, DEFAULTS)).toEqual(['reference'])
    expect(ninaImagePrefsWriteSchema.safeParse(payload(picked)).success).toBe(true)
  })

  it('hands the panel the options mapped on the server, not a row', () => {
    /* Invariant 9: the page maps, the panel receives plain objects. If the page ever passed the
     * page's `rows` straight through, a drizzle row shape would cross into a client component.
     *
     * RECONCILED: `listNinaPhotoReferences` returns a `NinaPhotoRefPage`, not an array, so the
     * mapped expression is `referencePage.rows.map(...)`. The draft of this case asserted
     * `referenceRows.map(...)`, which was the pre-reconciliation name for a read that returned an
     * array. The mapper is what the assertion is about; the local's name is not. */
    const source = codeOnly(PAGE)
    expect(source).toContain('.rows.map(toImageReferenceOption)')
  })
})

/* ── the model picker's copy pair — the half the panel renders from ─────────────────────────── */

describe('hasImageModelCopy / imageModelLabel / imageModelHint', () => {
  it('answers the closed two-id enum and nothing else', () => {
    expect(hasImageModelCopy('qwen/qwen-image-3')).toBe(true)
    expect(hasImageModelCopy('qwen/qwen-image-3-pro')).toBe(true)
    expect(hasImageModelCopy('qwen/qwen-image-4')).toBe(false)
    expect(hasImageModelCopy('')).toBe(false)
  })

  it('labels the two cameras and degrades an unknown id to the prettified fallback', () => {
    expect(imageModelLabel('qwen/qwen-image-3')).toBe('Qwen Image 3')
    expect(imageModelLabel('qwen/qwen-image-3-pro')).toBe('Qwen Image 3 Pro')
    // The degrade path is `prettifyFocusKey`'s — a stale client's model id still renders as a
    // word, never as raw `provider/slash-name`.
    expect(imageModelLabel('mystery/model')).toBe(prettifyFocusKey('mystery/model'))
  })

  it('hints only where there is measured copy, and the two cameras say different things', () => {
    const base = imageModelHint('qwen/qwen-image-3')
    const pro = imageModelHint('qwen/qwen-image-3-pro')
    expect(base).not.toBe('')
    expect(pro).not.toBe('')
    expect(base).not.toBe(pro) // the pro hint exists because its latency story is different
    expect(imageModelHint('mystery/model')).toBe('')
  })
})
