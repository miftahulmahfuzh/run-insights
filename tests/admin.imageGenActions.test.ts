import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { toImageGenDraft } from '@/lib/admin/imageGenModel'

/**
 * **`/admin/image-generation`'s write side, executing for the first time** — the whole-row prefs
 * save and the two prompt-test actions.
 *
 * `tests/admin.imagegen.test.ts` and `tests/admin.imagegenTest.test.ts` cover the pure model and
 * view layers and assert these actions STRUCTURALLY (an export allowlist — the guard against
 * "one action per field" coming back). What only execution pins:
 *
 *   - the template pre-verdict surfaces the VALIDATOR'S OWN SENTENCE before the generic parse —
 *     `{{subject}}` is not one of the nine real placeholders, and the operator is told so
 *     verbatim, before any write and before the round trip is wasted on "try again";
 *   - `userId` cannot ride into the written row: `toImagePrefsWrite` picks fields explicitly, and
 *     the test asserts the write's argument has no such key;
 *   - the result carries the row AS STORED (`toImageGenDraft` over the write's return), which is
 *     what the panel's `mergeImageGenAfterSave` adopts — asserted by identity of shape, not by
 *     trusting the action echoed the input;
 *   - the test dispatch is money: capped and failed dispatches become sentences with the cap
 *     number in them, the happy path reads the quota AFTER the dispatch, and NOTHING here
 *     revalidates `/admin/image-generation` — only a finished job's poll revalidates, and it
 *     revalidates the COLLECTION (`/admin/nina`), where the photograph lands.
 */

const USER = 'abc123XYZ_-9'
const JOB_ID = 'job123XYZ_-9'

const requireAdmin = vi.fn()
const revalidatePath = vi.fn()
const writeNinaImagePrefs = vi.fn()
const readNinaTuning = vi.fn()
const readNinaImagePrefs = vi.fn()
const resolveNinaPhotoReference = vi.fn()
const ninaImageQuotaLeft = vi.fn()
const getNinaImageJobDetail = vi.fn()
const dispatchNinaImageTest = vi.fn()
const assembleNinaImageTestPrompt = vi.fn()

vi.mock('@/lib/admin/requireAdmin', () => ({ requireAdmin: () => requireAdmin() }))
vi.mock('next/cache', () => ({ revalidatePath: (path: string) => revalidatePath(path) }))
vi.mock('@/lib/nina/queries', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  readNinaTuning: (...args: unknown[]) => readNinaTuning(...args),
  readNinaImagePrefs: (...args: unknown[]) => readNinaImagePrefs(...args),
  resolveNinaPhotoReference: (...args: unknown[]) => resolveNinaPhotoReference(...args),
  writeNinaImagePrefs: (...args: unknown[]) => writeNinaImagePrefs(...args),
}))
vi.mock('@/lib/nina/imagejobs', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  ninaImageQuotaLeft: (...args: unknown[]) => ninaImageQuotaLeft(...args),
  getNinaImageJobDetail: (...args: unknown[]) => getNinaImageJobDetail(...args),
}))
vi.mock('@/lib/nina/imagetest', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  dispatchNinaImageTest: (...args: unknown[]) => dispatchNinaImageTest(...args),
  assembleNinaImageTestPrompt: (...args: unknown[]) => assembleNinaImageTestPrompt(...args),
}))

type Actions = typeof import('@/lib/admin/imageGenActions')
let actions: Actions

/** The stored row shape `NinaImagePrefs` and `toImageGenDraft` agree on. */
const STORED_PREFS = {
  promptLength: 50,
  focus: { face: true, skin: false, boobs: false, butt: false, thighs: false, calves: false },
  wardrobe: 'black swimsuit',
  venue: '',
  time: 'golden hour',
  notes: '',
  promptTemplate: '',
  model: 'qwen/qwen-image-3' as const,
  reference: { source: 'chat' as const, id: 'photo123XYZ_-' },
}

/** A complete, valid payload — what the panel sends on every commit. */
function prefsInput(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    userId: USER,
    promptLength: 50,
    focus: { face: true, skin: false, boobs: false, butt: false, thighs: false, calves: false },
    wardrobe: 'black swimsuit',
    venue: '',
    time: 'golden hour',
    notes: '',
    promptTemplate: '',
    model: 'qwen/qwen-image-3',
    reference: { source: 'chat', id: 'photo123XYZ_-' },
    ...overrides,
  }
}

const TUNING = { relationship: 'girlfriend' } as never // opaque: the assembly is mocked

beforeEach(async () => {
  vi.resetModules()
  requireAdmin.mockReset().mockResolvedValue({ userId: USER, email: 'ops@example.com' })
  revalidatePath.mockReset()
  writeNinaImagePrefs.mockReset().mockResolvedValue(STORED_PREFS)
  readNinaTuning.mockReset().mockResolvedValue(TUNING)
  readNinaImagePrefs.mockReset().mockResolvedValue(STORED_PREFS)
  resolveNinaPhotoReference.mockReset().mockResolvedValue(null)
  ninaImageQuotaLeft.mockReset().mockResolvedValue(3)
  getNinaImageJobDetail.mockReset().mockResolvedValue(null)
  dispatchNinaImageTest.mockReset()
  assembleNinaImageTestPrompt.mockReset().mockReturnValue('THE PROMPT')
  actions = await import('@/lib/admin/imageGenActions')
})

afterEach(() => {
  vi.resetModules()
})

describe('saveNinaImagePrefsAction', () => {
  it('writes the adapted row, and returns the STORED draft — not the input', async () => {
    const stored = { ...STORED_PREFS, wardrobe: 'one-piece', time: '' } // the coerce is the db's
    writeNinaImagePrefs.mockResolvedValue(stored)

    const result = await actions.saveNinaImagePrefsAction(prefsInput())

    expect(result.ok).toBe(true)
    expect(result.prefs).toEqual(toImageGenDraft(stored))
    expect(result.prefs?.wardrobe).toBe('one-piece')
    expect(result.note).toContain('Saved.')
    expect(revalidatePath).toHaveBeenCalledWith('/admin/image-generation')
    // The adaptation seam: exactly the nine fields, picked explicitly — `userId` cannot ride.
    expect(writeNinaImagePrefs).toHaveBeenCalledTimes(1)
    const [writeUser, write] = writeNinaImagePrefs.mock.calls[0] as [string, Record<string, unknown>]
    expect(writeUser).toBe(USER)
    expect(Object.keys(write).sort()).toEqual([
      'focus',
      'model',
      'notes',
      'promptLength',
      'promptTemplate',
      'reference',
      'time',
      'venue',
      'wardrobe',
    ])
  })

  it('surfaces the template validator sentence BEFORE the generic parse and before any write', async () => {
    const result = await actions.saveNinaImagePrefsAction(
      prefsInput({ promptTemplate: '{{subject}} alone' }),
    )

    // Not "That is not a set of image parameters…": the pre-verdict names the exact violation,
    // which is the difference between a refusal and a usable one.
    expect(result.ok).toBe(false)
    expect(result.error).toContain('Unknown placeholder {{subject}}')
    expect(writeNinaImagePrefs).not.toHaveBeenCalled()
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('refuses a payload outside the schema without writing', async () => {
    const result = await actions.saveNinaImagePrefsAction(prefsInput({ promptLength: 101 }))

    expect(result).toEqual({
      ok: false,
      error: 'That is not a set of image parameters this panel can save, so nothing was written.',
    })
    expect(writeNinaImagePrefs).not.toHaveBeenCalled()
  })

  it('refuses a focus map with an unknown key — strict, so an old client cannot half-send', async () => {
    const result = await actions.saveNinaImagePrefsAction(
      prefsInput({ focus: { face: true, skin: false, boobs: false, butt: false, thighs: false } }),
    )

    expect(result.ok).toBe(false)
    expect(writeNinaImagePrefs).not.toHaveBeenCalled()
  })

  it('a write fault becomes the catch-all sentence that names the retry', async () => {
    writeNinaImagePrefs.mockRejectedValue(new Error('connection reset'))

    const result = await actions.saveNinaImagePrefsAction(prefsInput())

    expect(result).toEqual({
      ok: false,
      error: 'The write failed and nothing was changed — move any control to try again.',
    })
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('gates on requireAdmin before anything else', async () => {
    requireAdmin.mockRejectedValue(new Error('not an admin'))

    await expect(actions.saveNinaImagePrefsAction(prefsInput())).rejects.toThrow('not an admin')
    expect(writeNinaImagePrefs).not.toHaveBeenCalled()
  })
})

describe('runNinaImageTestAction — spending one generation', () => {
  it('dispatches with no payload to forge, and reads the quota AFTER the dispatch', async () => {
    dispatchNinaImageTest.mockResolvedValue({ ok: true, jobId: JOB_ID })

    const result = await actions.runNinaImageTestAction()

    expect(result).toEqual({ ok: true, jobId: JOB_ID, quotaLeft: 3 })
    expect(dispatchNinaImageTest).toHaveBeenCalledWith(USER)
    expect(ninaImageQuotaLeft).toHaveBeenCalledTimes(1)
    expect(revalidatePath).not.toHaveBeenCalled() // nothing has landed; the quota rides the result
  })

  it('the cap is a sentence with the cap number in it, and no quota is read', async () => {
    dispatchNinaImageTest.mockResolvedValue({ ok: false, jobId: null, kind: 'capped' })

    const result = await actions.runNinaImageTestAction()

    expect(result.ok).toBe(false)
    expect((result as { message: string }).message).toContain('generations are spent')
    expect((result as { message: string }).message).toContain('midnight in Jakarta')
    expect(ninaImageQuotaLeft).not.toHaveBeenCalled()
  })

  it('a dispatch that could not open the job is not a refusal, and says what to do', async () => {
    dispatchNinaImageTest.mockResolvedValue({ ok: false, jobId: null, kind: 'unavailable' })

    const result = await actions.runNinaImageTestAction()

    expect((result as { message: string }).message).toContain('could not be opened')
    expect((result as { message: string }).message).toContain('nothing was billed')
  })

  it('gates on requireAdmin before dispatching', async () => {
    requireAdmin.mockRejectedValue(new Error('not an admin'))

    await expect(actions.runNinaImageTestAction()).rejects.toThrow('not an admin')
    expect(dispatchNinaImageTest).not.toHaveBeenCalled()
  })
})

/** `NinaImageJobRecord`, as `getNinaImageJobDetail` would return it. */
function jobDetail(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: JOB_ID,
    source: 'admin',
    status: 'ok',
    errorCode: null,
    attempts: 1,
    latencyMs: 95_000,
    costMicroUsd: 1200,
    prompt: 'THE PROMPT',
    createdAt: new Date('2026-09-11T08:00:00Z'),
    ...overrides,
  }
}

describe('readNinaImageTestAction — the poll', () => {
  it('answers the mount case: quota, preview and anchor, with no job and no revalidate', async () => {
    const result = await actions.readNinaImageTestAction(null)

    expect(result).toEqual({
      quotaLeft: 3,
      promptPreview: 'THE PROMPT',
      referenceUrl: null,
      job: null,
    })
    expect(getNinaImageJobDetail).not.toHaveBeenCalled()
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('resolves the anchor through the owner-scoped resolver, null for none and for deleted', async () => {
    resolveNinaPhotoReference.mockResolvedValue({ blobUrl: 'https://store/x.jpg' })
    expect((await actions.readNinaImageTestAction(null)).referenceUrl).toBe(
      'https://store/x.jpg',
    )
    expect(resolveNinaPhotoReference).toHaveBeenCalledWith(USER, STORED_PREFS.reference)

    resolveNinaPhotoReference.mockResolvedValue(null)
    expect((await actions.readNinaImageTestAction(null)).referenceUrl).toBeNull()
  })

  it('a malformed job id never reaches the read — the claim is not a fact', async () => {
    const result = await actions.readNinaImageTestAction('short')

    expect(result.job).toBeNull()
    expect(getNinaImageJobDetail).not.toHaveBeenCalled()
  })

  it('a finished admin job becomes the view — epoch ms, and the COLLECTION revalidates', async () => {
    getNinaImageJobDetail.mockResolvedValue(jobDetail())

    const result = await actions.readNinaImageTestAction(JOB_ID)

    expect(result.job).toEqual({
      jobId: JOB_ID,
      status: 'ok',
      errorCode: null,
      attempts: 1,
      latencyMs: 95_000,
      costMicroUsd: 1200,
      prompt: 'THE PROMPT',
      createdAtMs: Date.parse('2026-09-11T08:00:00Z'),
    })
    // R12's "automatically": the poll that first sees the photograph revalidates where it lands,
    // NOT the panel — `/admin/nina` is the collection, `ADMIN_CHAT_PHOTOS_PATH`.
    expect(revalidatePath).toHaveBeenCalledTimes(1)
    expect(revalidatePath).toHaveBeenCalledWith('/admin/nina')
  })

  it('a chat selfie polled here is reported as no job of ours — the source filter', async () => {
    getNinaImageJobDetail.mockResolvedValue(jobDetail({ source: 'chat' }))

    const result = await actions.readNinaImageTestAction(JOB_ID)

    // A true row described by a false sentence is what the filter exists to prevent; a hidden
    // job and a chat job are the same words on screen.
    expect(result.job).toBeNull()
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('an unknown or missing job is null, and revalidates nothing', async () => {
    getNinaImageJobDetail.mockResolvedValue(null)
    expect((await actions.readNinaImageTestAction(JOB_ID)).job).toBeNull()

    getNinaImageJobDetail.mockResolvedValue(jobDetail({ status: 'queued' }))
    expect((await actions.readNinaImageTestAction(JOB_ID)).job).not.toBeNull()
    expect(revalidatePath).not.toHaveBeenCalled() // still open; nothing has landed
  })

  it('gates on requireAdmin before any read', async () => {
    requireAdmin.mockRejectedValue(new Error('not an admin'))

    await expect(actions.readNinaImageTestAction(null)).rejects.toThrow('not an admin')
    expect(ninaImageQuotaLeft).not.toHaveBeenCalled()
    expect(readNinaImagePrefs).not.toHaveBeenCalled()
  })
})
