import { beforeEach, describe, expect, it, vi } from 'vitest'

import { callNinaImageModel } from '@/lib/nina/imagecall'
import { nearestNinaImageAspectRatio } from '@/lib/nina/imagerecipe'
import { photoshopCropBox } from '@/lib/nina/photoshopCrop'
import { claimNinaPhotoshopJob, completeNinaPhotoshopJob } from '@/lib/nina/photoshopJobs'
import type { NinaPhotoshopJobArgs } from '@/lib/nina/photoshopJobs'
import { runPhotoshopJob } from '@/lib/nina/photoshopRun'

/**
 * **`attemptPhotoshopOnce`'s crop branch, in both modes.**
 *
 * The claim this suite pins: a job carrying all four crop fields sends the model a pixel box AND
 * the exact stored `aspect_ratio` label — in ANCHOR mode as well as EDIT mode — while a job
 * carrying none of them makes byte-identically the call `main` made, which is the plan's
 * Invariant 2 in its only executable form.
 *
 * `attemptPhotoshopOnce` is module-private, so every case drives it through `runPhotoshopJob`, its
 * only door — `tests/nina.imagerun.test.ts`'s own shape for `finishSelfie`. Everything that leaves
 * the process is mocked: `@vercel/blob`, `lib/env`, the job store, the error log, and the image
 * model. `lib/nina/photoshopRun.ts` opens with `import 'server-only'`, aliased by
 * `vitest.config.ts`, so importing it is safe.
 *
 * `@/lib/nina/photoshopCrop` is mocked and `@/lib/nina/imagerecipe` is not, deliberately: the crop
 * arithmetic has its own suite, and the point of this one is that a crop OVERRIDES the ratio the
 * real `nearestNinaImageAspectRatio` would otherwise have picked. The mocked
 * `photoshopCropBox` returns `NinaPhotoshopCropBox | null` in Phase 1's real contract, so one case
 * below drives the `null` branch explicitly.
 *
 * `sharp` is left real. `measureImageBytes` runs it over the three bytes behind `'QUJD'`, fails to
 * decode, and returns `{ width: 0, height: 0 }` — the shipped fallback, exercised for free.
 */

vi.mock('next/server', () => ({ after: (task: () => unknown) => void task }))

const { putBlob } = vi.hoisted(() => ({ putBlob: vi.fn() }))

vi.mock('@vercel/blob', () => ({ put: putBlob }))
vi.mock('@/lib/env', () => ({ blobEnv: () => ({ BLOB_READ_WRITE_TOKEN: 'test-token' }) }))
vi.mock('@/lib/nina/errorlogs', () => ({ logNinaError: vi.fn() }))
vi.mock('@/lib/nina/imagecall', () => ({ callNinaImageModel: vi.fn() }))
vi.mock('@/lib/nina/photoshopCrop', () => ({ photoshopCropBox: vi.fn() }))
/* A `vi.mock` factory REPLACES the module, so every runtime export this file's subject reads has
 * to be named here — including the CONSTANT, whose absence would make the retry comparison
 * `attempts < undefined` and silently turn every failure into a give-up. */
vi.mock('@/lib/nina/photoshopJobs', () => ({
  claimNinaPhotoshopJob: vi.fn(),
  completeNinaPhotoshopJob: vi.fn(),
  failNinaPhotoshopJob: vi.fn(),
  requeueNinaPhotoshopJob: vi.fn(),
  NINA_PHOTOSHOP_MAX_ATTEMPTS: 2,
}))

const claim = vi.mocked(claimNinaPhotoshopJob)
const complete = vi.mocked(completeNinaPhotoshopJob)
const call = vi.mocked(callNinaImageModel)
const cropBoxOf = vi.mocked(photoshopCropBox)

const USER_ID = 'usrAAAAAAAAA'
const JOB_ID = 'psjAAAAAAAAA'
const SOURCE_URL = 'https://blob.test/nina/source.png'

/** 832x732, ratio 1.137 — the live source from the plan's own repro. Its nearest bucket is `5:4`,
 * which is exactly the ~10%-wide result the crop step exists to make impossible. */
const SOURCE_WIDTH = 832
const SOURCE_HEIGHT = 732

const BOX = { left: 40, top: 0, width: 585, height: 732 }

function argsOf(overrides: Partial<NinaPhotoshopJobArgs> = {}): NinaPhotoshopJobArgs {
  return {
    sourceKind: 'avatar',
    sourceId: 'avaAAAAAAAAA',
    sourceContentHash: null,
    mode: 'edit',
    model: 'bytedance-seed/seedream-4.5',
    presetKey: null,
    promptText: 'bigger smile',
    cropRatioLabel: null,
    cropScale: null,
    cropX: null,
    cropY: null,
    ...overrides,
  } as NinaPhotoshopJobArgs
}

/** The seven arguments `callNinaImageModel` was handed, named. */
function lastCall() {
  const args = call.mock.calls[0] as unknown as [
    string,
    number,
    string | null,
    string | undefined,
    string | undefined,
    string | undefined,
    { left: number; top: number; width: number; height: number } | undefined,
  ]
  return { aspectRatio: args[5], cropBox: args[6] }
}

describe('attemptPhotoshopOnce — the aspect-ratio crop', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    putBlob.mockResolvedValue({ url: 'https://blob.test/nina/out.png', pathname: 'nina/out.png' })
    complete.mockResolvedValue(undefined)
    call.mockResolvedValue({
      ok: true,
      b64: 'QUJD',
      costMicroUsd: 40_000,
      latencyMs: 1,
      anchored: true,
    })
    cropBoxOf.mockReturnValue(BOX)
  })

  it('no crop, EDIT mode: the nearest bucket and no box — byte-identical to main', async () => {
    claim.mockResolvedValue({ jobId: JOB_ID, attempts: 1, args: argsOf({ mode: 'edit' }) })

    const outcome = await runPhotoshopJob(USER_ID, JOB_ID, SOURCE_URL, SOURCE_WIDTH, SOURCE_HEIGHT)

    expect(outcome).toBe('ok')
    expect(lastCall().aspectRatio).toBe(nearestNinaImageAspectRatio(SOURCE_WIDTH, SOURCE_HEIGHT))
    expect(lastCall().cropBox).toBeUndefined()
    expect(cropBoxOf).not.toHaveBeenCalled()
  })

  it('no crop, ANCHOR mode: undefined ratio and no box — the fixed default, unchanged', async () => {
    claim.mockResolvedValue({ jobId: JOB_ID, attempts: 1, args: argsOf({ mode: 'anchor' }) })

    await runPhotoshopJob(USER_ID, JOB_ID, SOURCE_URL, SOURCE_WIDTH, SOURCE_HEIGHT)

    expect(lastCall().aspectRatio).toBeUndefined()
    expect(lastCall().cropBox).toBeUndefined()
  })

  it('no crop, EDIT mode, dimensions unknown: undefined ratio — unchanged', async () => {
    claim.mockResolvedValue({ jobId: JOB_ID, attempts: 1, args: argsOf({ mode: 'edit' }) })

    await runPhotoshopJob(USER_ID, JOB_ID, SOURCE_URL, null, null)

    expect(lastCall().aspectRatio).toBeUndefined()
    expect(lastCall().cropBox).toBeUndefined()
  })

  it('a crop OVERRIDES edit mode’s nearest bucket, exactly', async () => {
    /* `4:5` is deliberately NOT what the real `nearestNinaImageAspectRatio` picks for 832x732
     * (`5:4`). If the bypass ever regressed to the fallback, this assertion is the one that says
     * so rather than passing by coincidence. */
    expect(nearestNinaImageAspectRatio(SOURCE_WIDTH, SOURCE_HEIGHT)).not.toBe('4:5')
    claim.mockResolvedValue({
      jobId: JOB_ID,
      attempts: 1,
      args: argsOf({ mode: 'edit', cropRatioLabel: '4:5', cropScale: 1.2, cropX: -30, cropY: 15 }),
    })

    await runPhotoshopJob(USER_ID, JOB_ID, SOURCE_URL, SOURCE_WIDTH, SOURCE_HEIGHT)

    expect(lastCall().aspectRatio).toBe('4:5')
    expect(lastCall().cropBox).toEqual(BOX)
    /* Phase 1's argument order: SOURCE, TARGET RATIO, CROP. Asserted positionally on purpose —
     * getting this order wrong typechecks nowhere but would crop a plausible-looking wrong box. */
    expect(cropBoxOf).toHaveBeenCalledWith({ width: SOURCE_WIDTH, height: SOURCE_HEIGHT }, 4 / 5, {
      scale: 1.2,
      x: -30,
      y: 15,
    })
  })

  it('a crop OVERRIDES anchor mode’s fixed default, identically', async () => {
    claim.mockResolvedValue({
      jobId: JOB_ID,
      attempts: 1,
      args: argsOf({
        mode: 'anchor',
        cropRatioLabel: '4:5',
        cropScale: 1.2,
        cropX: -30,
        cropY: 15,
      }),
    })

    await runPhotoshopJob(USER_ID, JOB_ID, SOURCE_URL, SOURCE_WIDTH, SOURCE_HEIGHT)

    /* R1's "both modes" instruction, as one assertion: the same four stored fields produce the same
     * label and the same box whichever mode the job is in. */
    expect(lastCall().aspectRatio).toBe('4:5')
    expect(lastCall().cropBox).toEqual(BOX)
  })

  it('a PARTIAL crop is not a crop: today’s behaviour, and the crop module is never asked', async () => {
    claim.mockResolvedValue({
      jobId: JOB_ID,
      attempts: 1,
      args: argsOf({
        mode: 'edit',
        cropRatioLabel: '4:5',
        cropScale: 1.2,
        cropX: -30,
        cropY: null,
      }),
    })

    await runPhotoshopJob(USER_ID, JOB_ID, SOURCE_URL, SOURCE_WIDTH, SOURCE_HEIGHT)

    expect(lastCall().aspectRatio).toBe(nearestNinaImageAspectRatio(SOURCE_WIDTH, SOURCE_HEIGHT))
    expect(lastCall().cropBox).toBeUndefined()
    expect(cropBoxOf).not.toHaveBeenCalled()
  })

  it('a label the provider does not accept is not a crop', async () => {
    claim.mockResolvedValue({
      jobId: JOB_ID,
      attempts: 1,
      args: argsOf({ mode: 'edit', cropRatioLabel: '7:3', cropScale: 1, cropX: 0, cropY: 0 }),
    })

    await runPhotoshopJob(USER_ID, JOB_ID, SOURCE_URL, SOURCE_WIDTH, SOURCE_HEIGHT)

    expect(lastCall().aspectRatio).toBe(nearestNinaImageAspectRatio(SOURCE_WIDTH, SOURCE_HEIGHT))
    expect(lastCall().cropBox).toBeUndefined()
    expect(cropBoxOf).not.toHaveBeenCalled()
  })

  it('a crop with no source dimensions is not a crop', async () => {
    claim.mockResolvedValue({
      jobId: JOB_ID,
      attempts: 1,
      args: argsOf({ mode: 'edit', cropRatioLabel: '4:5', cropScale: 1, cropX: 0, cropY: 0 }),
    })

    await runPhotoshopJob(USER_ID, JOB_ID, SOURCE_URL, null, null)

    expect(lastCall().aspectRatio).toBeUndefined()
    expect(lastCall().cropBox).toBeUndefined()
    expect(cropBoxOf).not.toHaveBeenCalled()
  })

  it('a NULL box from the crop module is "no crop", not a failed job', async () => {
    /* Phase 1 returns `null` when no integer rectangle at the chosen ratio exists for this source
     * (its documented case: a 3x2 thumbnail asked for 1:8). Phase 1's handoff is explicit that this
     * must fall back to the no-crop path rather than fail the job, and this is that assertion. */
    cropBoxOf.mockReturnValue(null)
    claim.mockResolvedValue({
      jobId: JOB_ID,
      attempts: 1,
      args: argsOf({ mode: 'edit', cropRatioLabel: '1:8', cropScale: 1, cropX: 0, cropY: 0 }),
    })

    const outcome = await runPhotoshopJob(USER_ID, JOB_ID, SOURCE_URL, SOURCE_WIDTH, SOURCE_HEIGHT)

    expect(outcome).toBe('ok')
    expect(lastCall().aspectRatio).toBe(nearestNinaImageAspectRatio(SOURCE_WIDTH, SOURCE_HEIGHT))
    expect(lastCall().cropBox).toBeUndefined()
  })

  it('a box that overhangs the source degrades to no crop rather than to a lost anchor', async () => {
    cropBoxOf.mockReturnValue({ left: 800, top: 0, width: 585, height: 732 })
    claim.mockResolvedValue({
      jobId: JOB_ID,
      attempts: 1,
      args: argsOf({ mode: 'edit', cropRatioLabel: '4:5', cropScale: 1, cropX: 0, cropY: 0 }),
    })

    await runPhotoshopJob(USER_ID, JOB_ID, SOURCE_URL, SOURCE_WIDTH, SOURCE_HEIGHT)

    expect(lastCall().aspectRatio).toBe(nearestNinaImageAspectRatio(SOURCE_WIDTH, SOURCE_HEIGHT))
    expect(lastCall().cropBox).toBeUndefined()
  })

  it('a crop that lost its anchor is warned about, not swallowed', async () => {
    call.mockResolvedValue({
      ok: true,
      b64: 'QUJD',
      costMicroUsd: 40_000,
      latencyMs: 1,
      anchored: false,
    })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    claim.mockResolvedValue({
      jobId: JOB_ID,
      attempts: 1,
      args: argsOf({ mode: 'edit', cropRatioLabel: '4:5', cropScale: 1, cropX: 0, cropY: 0 }),
    })

    await runPhotoshopJob(USER_ID, JOB_ID, SOURCE_URL, SOURCE_WIDTH, SOURCE_HEIGHT)

    expect(warn.mock.calls.some(([message]) => String(message).includes('crop requested'))).toBe(
      true,
    )
    warn.mockRestore()
  })
})
