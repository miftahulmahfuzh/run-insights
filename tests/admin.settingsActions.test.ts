import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { toTuningDraft } from '@/lib/admin/tuningModel'
import type { NinaTuning } from '@/lib/nina/tuning'

/**
 * **The two whole-row saves on `/admin/personality`, executing for the first time.**
 *
 * `saveNinaTuningAction` (`lib/admin/tuningActions.ts`) and `saveNarrativeTextModelAction`
 * (`lib/admin/textModelActions.ts`) had only structural coverage — an export-count assertion and
 * a gate-count assertion respectively. One suite runs both because they are the same SHAPE of
 * action (gate → Zod → one-row write → revalidate, the four lines both file headers spell out),
 * while staying two MODULES for the reason `textModelActions.ts` itself records: the tuning is
 * one row and the character panel's only write, the text model is a different store
 * (`app_settings` vs `nina_tuning`) with a different blast radius (every text call in the app).
 * The structural tests pin the module split; this suite pins the runtime.
 *
 * What only execution can see:
 *   - the result carries the row AS STORED (`toTuningDraft` over the write's return — the coerce
 *     happened below this action), so the panel's `mergeTuningAfterSave` adopts the truth;
 *   - `userId` cannot ride into the written tuning row: `toTuningWrite` picks fields explicitly;
 *   - the strict shapes refuse a forged or half-sent map (`flirtyy` saves nothing, not fifteen
 *     toggles and a success);
 *   - the text model is a closed two-id enum on the wire — a stale client's model id is refused,
 *     not written.
 */

const USER = 'abc123XYZ_-9'

const requireAdmin = vi.fn()
const revalidatePath = vi.fn()
const writeNinaTuning = vi.fn()
const writeNarrativeTextModel = vi.fn()

vi.mock('@/lib/admin/requireAdmin', () => ({ requireAdmin: () => requireAdmin() }))
vi.mock('next/cache', () => ({ revalidatePath: (path: string) => revalidatePath(path) }))
vi.mock('@/lib/nina/queries', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  writeNinaTuning: (...args: unknown[]) => writeNinaTuning(...args),
}))
vi.mock('@/lib/llm/textModel', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  writeNarrativeTextModel: (...args: unknown[]) => writeNarrativeTextModel(...args),
}))

type Tuning = typeof import('@/lib/admin/tuningActions')
type Text = typeof import('@/lib/admin/textModelActions')
type TuningInput = Parameters<Tuning['saveNinaTuningAction']>[0]
let tuning: Tuning
let text: Text

const TRAIT_KEYS = [
  'anger',
  'chill',
  'sad',
  'flirty',
  'steamy',
  'wise',
  'annoying',
  'funny',
  'happy',
  'anxious',
  'concerned',
  'horny',
] as const
const DIAL_KEYS = ['profanity', 'clinginess', 'photoEagerness', 'verbosity'] as const
const TUNING_KEYS = ['relationship', ...TRAIT_KEYS, ...DIAL_KEYS] as const

/** The stored `NinaTuning` the write hands back, already coerced below this action. */
const STORED_TUNING = {
  traits: Object.fromEntries(
    TRAIT_KEYS.map((key) => [key, key === 'flirty' ? 80 : 20]),
  ) as NinaTuning['traits'],
  dials: Object.fromEntries(
    DIAL_KEYS.map((key) => [key, key === 'profanity' ? 70 : 30]),
  ) as NinaTuning['dials'],
  enabled: Object.fromEntries(
    TUNING_KEYS.map((key) => [key, key !== 'horny']),
  ) as NinaTuning['enabled'],
  relationship: 'girlfriend' as const,
  // `coerceNinaTuning` lives in the real write below this action — so the STORED fixture carries
  // the coerced notes, while the INPUT below sends the raw keystrokes. The result must carry
  // this, not the input.
  notes: 'collapse these',
} satisfies NinaTuning

function tuningInput(overrides: Partial<TuningInput> = {}): TuningInput {
  return {
    userId: USER,
    traits: Object.fromEntries(TRAIT_KEYS.map((key) => [key, 50])),
    dials: Object.fromEntries(DIAL_KEYS.map((key) => [key, 50])),
    enabled: Object.fromEntries(TUNING_KEYS.map((key) => [key, true])),
    relationship: 'girlfriend',
    notes: '  collapse   these  ', // raw keystrokes; the store coerces below this action
    ...overrides,
  }
}

beforeEach(async () => {
  vi.resetModules()
  requireAdmin.mockReset().mockResolvedValue({ userId: USER, email: 'ops@example.com' })
  revalidatePath.mockReset()
  writeNinaTuning.mockReset().mockResolvedValue(STORED_TUNING)
  writeNarrativeTextModel.mockReset().mockResolvedValue(undefined)
  tuning = await import('@/lib/admin/tuningActions')
  text = await import('@/lib/admin/textModelActions')
})

afterEach(() => {
  vi.resetModules()
})

describe('saveNinaTuningAction', () => {
  it('writes the adapted row and returns the STORED draft — the coerce already happened', async () => {
    const result = await tuning.saveNinaTuningAction(tuningInput())

    expect(result.ok).toBe(true)
    expect(result.tuning).toEqual(toTuningDraft(STORED_TUNING))
    expect(result.tuning?.notes).toBe('collapse these') // what the DATABASE holds, not what was sent
    expect(result.note).toContain('very next message')
    expect(revalidatePath).toHaveBeenCalledWith('/admin/personality')
  })

  it('picks the five fields explicitly — userId cannot ride into the row', async () => {
    await tuning.saveNinaTuningAction(tuningInput())

    expect(writeNinaTuning).toHaveBeenCalledTimes(1)
    const [writeUser, write] = writeNinaTuning.mock.calls[0] as [string, Record<string, unknown>]
    expect(writeUser).toBe(USER)
    expect(Object.keys(write).sort()).toEqual([
      'dials',
      'enabled',
      'notes',
      'relationship',
      'traits',
    ])
  })

  it('a forged trait or dial key saves NOTHING, not fifteen keys and a success', async () => {
    const result = await tuning.saveNinaTuningAction(
      tuningInput({
        traits: { ...Object.fromEntries(TRAIT_KEYS.map((key) => [key, 50])), flirtyy: 90 },
      }),
    )

    expect(result).toEqual({
      ok: false,
      error: 'That is not a tuning this panel can save, so nothing was written.',
    })
    expect(writeNinaTuning).not.toHaveBeenCalled()
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('a stripped toggle key is refused the same way — an absent key is not "off"', async () => {
    const enabled = Object.fromEntries(TUNING_KEYS.map((key) => [key, true])) as Record<
      string,
      boolean
    >
    delete enabled.anger

    const result = await tuning.saveNinaTuningAction(tuningInput({ enabled }))

    expect(result.ok).toBe(false)
    expect(writeNinaTuning).not.toHaveBeenCalled()
  })

  it('a relationship outside the closed list is refused', async () => {
    const result = await tuning.saveNinaTuningAction(tuningInput({ relationship: 'soulmate' }))

    expect(result.ok).toBe(false)
    expect(writeNinaTuning).not.toHaveBeenCalled()
  })

  it('a write fault becomes the sentence that names the retry', async () => {
    writeNinaTuning.mockRejectedValue(new Error('connection reset'))

    const result = await tuning.saveNinaTuningAction(tuningInput())

    expect(result).toEqual({
      ok: false,
      error: 'The write failed and nothing was changed — move any control to try again.',
    })
  })

  it('gates on requireAdmin before anything else', async () => {
    requireAdmin.mockRejectedValue(new Error('not an admin'))

    await expect(tuning.saveNinaTuningAction(tuningInput())).rejects.toThrow('not an admin')
    expect(writeNinaTuning).not.toHaveBeenCalled()
  })
})

describe('saveNarrativeTextModelAction', () => {
  it('writes a model the catalogue names, with no userId and no cache to bust', async () => {
    const result = await text.saveNarrativeTextModelAction({ model: 'glm-5.3-flash' })

    expect(result).toEqual({ ok: true })
    expect(writeNarrativeTextModel).toHaveBeenCalledWith('glm-5.3-flash')
    expect(revalidatePath).toHaveBeenCalledWith('/admin/personality')
  })

  it('a model outside the two-id enum is refused before any write', async () => {
    const result = await text.saveNarrativeTextModelAction({ model: 'gpt-4o' })

    expect(result).toEqual({
      ok: false,
      error: 'That is not one of the models this app can write with, so nothing was changed.',
    })
    expect(writeNarrativeTextModel).not.toHaveBeenCalled()
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('a write fault becomes the sentence that names its own retry', async () => {
    writeNarrativeTextModel.mockRejectedValue(new Error('connection reset'))

    const result = await text.saveNarrativeTextModelAction({ model: 'glm-5.3' })

    expect(result).toEqual({
      ok: false,
      error: 'The write failed and nothing was changed — pick the model again to retry.',
    })
  })

  it('gates on requireAdmin before anything else', async () => {
    requireAdmin.mockRejectedValue(new Error('not an admin'))

    await expect(text.saveNarrativeTextModelAction({ model: 'glm-5.3' })).rejects.toThrow(
      'not an admin',
    )
    expect(writeNarrativeTextModel).not.toHaveBeenCalled()
  })
})
