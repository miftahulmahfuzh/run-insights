import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * **`runPhotoshopJobAction`'s crop boundary** — the untrusted edge of R1's aspect-ratio crop step.
 *
 * There is no test file for `lib/admin/photoshopActions.ts` on `main` and none for
 * `lib/nina/photoshopPresets.ts` either, so this suite is written from first principles rather
 * than extended. It asserts the one thing only execution pins: WHAT REACHES THE ROW. The crop
 * coercer is module-private (a `'use server'` file may export nothing but async functions), so it
 * is proven through the action, by reading `openNinaPhotoshopJob`'s argument.
 *
 * The load-bearing cases, in order of what would hurt most in production:
 *   - a run with NO crop writes four explicit nulls and is otherwise identical to `main`'s row;
 *   - a PARTIAL crop is refused wholesale, never completed with defaults;
 *   - an uncatalogued ratio label cannot reach a job row, so `aspect_ratio` on the wire can only
 *     ever be a value the provider documents;
 *   - a rejected crop still RUNS the job, uncropped — the "skipped the crop step" path;
 *   - the crop never rides on `firePhotoshopJob`'s payload: Phase 3 reads it off the row.
 */

const USER = 'abc123XYZ_-9'
const SOURCE_ID = 'photo123XYZ_'
const JOB_ID = 'job123XYZ_-9'

const requireAdmin = vi.fn()
const revalidatePath = vi.fn()
const openNinaPhotoshopJob = vi.fn()
const getNinaPhotoshopJob = vi.fn()
const isNinaPhotoshopJobStale = vi.fn()
const getPhotoshopSourcePhoto = vi.fn()
const resolvePhotoshopAdd = vi.fn()
const resolvePhotoshopDiscard = vi.fn()
const resolvePhotoshopReplace = vi.fn()
const firePhotoshopJob = vi.fn()
const scheduleReplacedThumbnail = vi.fn()

vi.mock('@/lib/admin/requireAdmin', () => ({ requireAdmin: () => requireAdmin() }))
vi.mock('next/cache', () => ({ revalidatePath: (path: string) => revalidatePath(path) }))
vi.mock('@/lib/nina/photoshopJobs', () => ({
  openNinaPhotoshopJob: (...args: unknown[]) => openNinaPhotoshopJob(...args),
  getNinaPhotoshopJob: (...args: unknown[]) => getNinaPhotoshopJob(...args),
  isNinaPhotoshopJobStale: (...args: unknown[]) => isNinaPhotoshopJobStale(...args),
}))
vi.mock('@/lib/nina/photoshopResolve', () => ({
  getPhotoshopSourcePhoto: (...args: unknown[]) => getPhotoshopSourcePhoto(...args),
  resolvePhotoshopAdd: (...args: unknown[]) => resolvePhotoshopAdd(...args),
  resolvePhotoshopDiscard: (...args: unknown[]) => resolvePhotoshopDiscard(...args),
  resolvePhotoshopReplace: (...args: unknown[]) => resolvePhotoshopReplace(...args),
}))
vi.mock('@/lib/nina/photoshopRun', () => ({
  firePhotoshopJob: (...args: unknown[]) => firePhotoshopJob(...args),
}))
/* The Replace regression's `after()` pass. Mocked at the module, not through `next/server`: the
 * real scheduler opens a database connection and a Blob GET, and what this file owns is the
 * WIRING — whether the replace arm schedules it and the other two arms do not. Its behaviour is
 * `tests/admin.chatPhotos.test.ts`'s. */
vi.mock('@/lib/admin/ninaReplacedThumbnail', () => ({
  scheduleReplacedThumbnail: (...args: unknown[]) => scheduleReplacedThumbnail(...args),
}))

type Actions = typeof import('@/lib/admin/photoshopActions')
type RunInput = Parameters<Actions['runPhotoshopJobAction']>[0]
let actions: Actions

/** A complete, valid run with no crop — what the panel sends on `main` today. */
function runInput(overrides: Partial<RunInput> = {}): RunInput {
  return {
    sourceKind: 'message_image',
    sourceId: SOURCE_ID,
    mode: 'edit',
    model: 'bytedance-seed/seedream-4.5',
    presetKey: null,
    instruction: 'Same woman, same photo — fix her eyes.',
    ...overrides,
  }
}

/** The four crop columns as `openNinaPhotoshopJob` received them. */
function writtenCrop(): Record<string, unknown> {
  expect(openNinaPhotoshopJob).toHaveBeenCalledTimes(1)
  const [, args] = openNinaPhotoshopJob.mock.calls[0] as [string, Record<string, unknown>]
  return {
    cropRatioLabel: args.cropRatioLabel,
    cropScale: args.cropScale,
    cropX: args.cropX,
    cropY: args.cropY,
  }
}

const NO_CROP = { cropRatioLabel: null, cropScale: null, cropX: null, cropY: null }

beforeEach(async () => {
  vi.resetModules()
  requireAdmin.mockReset().mockResolvedValue({ userId: USER, email: 'ops@example.com' })
  revalidatePath.mockReset()
  openNinaPhotoshopJob.mockReset().mockResolvedValue(JOB_ID)
  getNinaPhotoshopJob.mockReset().mockResolvedValue(null)
  isNinaPhotoshopJobStale.mockReset().mockReturnValue(false)
  getPhotoshopSourcePhoto.mockReset().mockResolvedValue({
    blobUrl: 'https://blob.example/shots/source.png',
    contentHash: 'hash-abc',
    folder: null,
    width: 832,
    height: 732,
  })
  resolvePhotoshopAdd.mockReset()
  resolvePhotoshopDiscard.mockReset()
  resolvePhotoshopReplace.mockReset()
  firePhotoshopJob.mockReset()
  scheduleReplacedThumbnail.mockReset()
  actions = await import('@/lib/admin/photoshopActions')
})

describe('runPhotoshopJobAction — no crop supplied', () => {
  it('writes four explicit nulls, and the rest of the row exactly as before', async () => {
    const result = await actions.runPhotoshopJobAction(runInput())

    expect(result).toEqual({ ok: true, jobId: JOB_ID })
    const [userArg, args] = openNinaPhotoshopJob.mock.calls[0] as [string, Record<string, unknown>]
    expect(userArg).toBe(USER)
    expect(args).toEqual({
      sourceKind: 'message_image',
      sourceId: SOURCE_ID,
      sourceContentHash: 'hash-abc',
      mode: 'edit',
      model: 'bytedance-seed/seedream-4.5',
      presetKey: null,
      promptText: 'Same woman, same photo — fix her eyes.',
      ...NO_CROP,
    })
  })

  it('never puts the crop on firePhotoshopJob — Phase 3 reads it off the row', async () => {
    await actions.runPhotoshopJobAction(
      runInput({ cropRatioLabel: '5:4', cropScale: 1.25, cropX: 40, cropY: -60 }),
    )

    expect(firePhotoshopJob).toHaveBeenCalledTimes(1)
    const [fired] = firePhotoshopJob.mock.calls[0] as [Record<string, unknown>]
    expect(Object.keys(fired).sort()).toEqual([
      'jobId',
      'sourceHeight',
      'sourceUrl',
      'sourceWidth',
      'userId',
    ])
  })
})

describe('runPhotoshopJobAction — a well-formed crop', () => {
  it('writes all four through, rounding the scale to the column’s three decimals', async () => {
    const result = await actions.runPhotoshopJobAction(
      runInput({ cropRatioLabel: '5:4', cropScale: 1.23456, cropX: 120, cropY: -85 }),
    )

    expect(result).toEqual({ ok: true, jobId: JOB_ID })
    expect(writtenCrop()).toEqual({
      cropRatioLabel: '5:4',
      cropScale: 1.235,
      cropX: 120,
      cropY: -85,
    })
  })

  it('rounds fractional offsets and normalises negative zero', async () => {
    await actions.runPhotoshopJobAction(
      runInput({ cropRatioLabel: '9:16', cropScale: 1, cropX: 12.4, cropY: -0.2 }),
    )

    const crop = writtenCrop()
    expect(crop.cropX).toBe(12)
    expect(crop.cropY).toBe(0)
    expect(Object.is(crop.cropY, -0)).toBe(false)
  })

  it('accepts every label in the catalogue, and nothing else', async () => {
    const { NINA_IMAGE_ASPECT_RATIOS } = await import('@/lib/nina/imagerecipe')

    for (const entry of NINA_IMAGE_ASPECT_RATIOS) {
      openNinaPhotoshopJob.mockClear()
      await actions.runPhotoshopJobAction(
        runInput({ cropRatioLabel: entry.label, cropScale: 1, cropX: 0, cropY: 0 }),
      )
      expect(writtenCrop().cropRatioLabel).toBe(entry.label)
    }
  })
})

describe('runPhotoshopJobAction — a crop that cannot be trusted', () => {
  /** Each case is a payload only a hand-crafted request can produce. Every one of them must land
   * on "no crop" — never a partial row, never a guessed default. */
  const rejected: ReadonlyArray<[string, Partial<RunInput>]> = [
    ['an uncatalogued ratio label', { cropRatioLabel: '7:3', cropScale: 1, cropX: 0, cropY: 0 }],
    [
      '`auto`, which the catalogue deliberately omits',
      { cropRatioLabel: 'auto', cropScale: 1, cropX: 0, cropY: 0 },
    ],
    ['a label with no crop numbers', { cropRatioLabel: '5:4' }],
    ['numbers with no label', { cropScale: 1.2, cropX: 10, cropY: 10 }],
    ['a partial set — y missing', { cropRatioLabel: '5:4', cropScale: 1.2, cropX: 10 }],
    [
      'an explicit null inside an otherwise complete set',
      { cropRatioLabel: '5:4', cropScale: 1.2, cropX: null, cropY: 10 },
    ],
    [
      'a scale below the cover floor',
      { cropRatioLabel: '5:4', cropScale: 0.4, cropX: 0, cropY: 0 },
    ],
    ['a scale past the ceiling', { cropRatioLabel: '5:4', cropScale: 99, cropX: 0, cropY: 0 }],
    ['a NaN scale', { cropRatioLabel: '5:4', cropScale: Number.NaN, cropX: 0, cropY: 0 }],
    [
      'an infinite offset',
      { cropRatioLabel: '5:4', cropScale: 1, cropX: Number.POSITIVE_INFINITY, cropY: 0 },
    ],
    [
      'an x offset past the hard cap',
      { cropRatioLabel: '5:4', cropScale: 1, cropX: 500_000, cropY: 0 },
    ],
    [
      'a y offset past the hard cap',
      { cropRatioLabel: '5:4', cropScale: 1, cropX: 0, cropY: -500_000 },
    ],
  ]

  for (const [name, overrides] of rejected) {
    it(`coerces ${name} to no crop, and still runs the job`, async () => {
      const result = await actions.runPhotoshopJobAction(runInput(overrides))

      expect(result).toEqual({ ok: true, jobId: JOB_ID })
      expect(writtenCrop()).toEqual(NO_CROP)
      expect(firePhotoshopJob).toHaveBeenCalledTimes(1)
    })
  }
})

/* ── resolvePhotoshopJobAction — the Replace regression's third caller (2026-10-14) ────────────
 * A photoshop replace swaps bytes under an existing row exactly as the Media and album Replaces
 * do, so it retracts that row's thumbnail pair exactly as they do, and owes a new tile exactly as
 * they do. It was the one of the three left out when the fix first landed: the row rendered its
 * full-size original until the next `thumbs:backfill`. */
describe('resolvePhotoshopJobAction schedules a tile for the row a replace rewrote', () => {
  it('passes the row the resolver named, for an album source', async () => {
    resolvePhotoshopReplace.mockResolvedValue({
      ok: true,
      replacedKind: 'avatar',
      replacedId: 'ava123XYZ_-9',
    })

    await expect(
      actions.resolvePhotoshopJobAction({ jobId: JOB_ID, action: 'replace' }),
    ).resolves.toEqual({ ok: true })
    expect(scheduleReplacedThumbnail).toHaveBeenCalledWith(USER, {
      kind: 'avatar',
      id: 'ava123XYZ_-9',
    })
  })

  it('passes the row the resolver named, for a Media source', async () => {
    resolvePhotoshopReplace.mockResolvedValue({
      ok: true,
      replacedKind: 'image',
      replacedId: SOURCE_ID,
    })

    await actions.resolvePhotoshopJobAction({ jobId: JOB_ID, action: 'replace' })
    expect(scheduleReplacedThumbnail).toHaveBeenCalledWith(USER, { kind: 'image', id: SOURCE_ID })
  })

  it('schedules nothing for add or discard — neither retracts a tile', async () => {
    resolvePhotoshopAdd.mockResolvedValue({ ok: true })
    resolvePhotoshopDiscard.mockResolvedValue({ ok: true })

    await actions.resolvePhotoshopJobAction({ jobId: JOB_ID, action: 'add' })
    await actions.resolvePhotoshopJobAction({ jobId: JOB_ID, action: 'discard' })

    expect(scheduleReplacedThumbnail).not.toHaveBeenCalled()
  })

  it('schedules nothing when the replace itself was refused', async () => {
    resolvePhotoshopReplace.mockResolvedValue({ ok: false, reason: 'source-unavailable' })

    await expect(
      actions.resolvePhotoshopJobAction({ jobId: JOB_ID, action: 'replace' }),
    ).resolves.toEqual({
      ok: false,
      message: 'The original photo is gone, so nothing was written.',
    })
    expect(scheduleReplacedThumbnail).not.toHaveBeenCalled()
  })

  it('refuses a malformed job id above everything, scheduling nothing', async () => {
    await expect(
      actions.resolvePhotoshopJobAction({ jobId: 'not a job', action: 'replace' }),
    ).resolves.toEqual({ ok: false, message: 'Unknown job.' })
    expect(resolvePhotoshopReplace).not.toHaveBeenCalled()
    expect(scheduleReplacedThumbnail).not.toHaveBeenCalled()
  })
})
