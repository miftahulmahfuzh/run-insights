import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { captionNinaPhoto } from '@/lib/nina/caption'
import { callNinaImageModel } from '@/lib/nina/imagecall'
import { ninaImageCaption } from '@/lib/nina/imagefail'
import { claimNinaImageJob, completeNinaImageJob, failNinaImageJob } from '@/lib/nina/imagejobs'
import { NINA_IMAGE_MAX_ATTEMPTS } from '@/lib/nina/imagerecipe'
import { runNinaImageJob } from '@/lib/nina/imagerun'
import {
  getNinaMessagesByIds,
  insertNinaAvatarAsCurrent,
  insertNinaMessageImages,
  insertNinaMessages,
  readNinaTuning,
} from '@/lib/nina/queries'
import { resolveNinaWriteSession } from '@/lib/nina/sessionResolve'
import { NINA_TUNING_DEFAULTS } from '@/lib/nina/tuning'

/**
 * **Phase 4: `finishSelfie` captions from the scene she asked for.**
 *
 * The bug this suite pins shut is the selfie half of the reported one. `finishSelfie` wrote
 * `body: ninaImageCaption(jobId)` — a hash-picked draw from a five-string array — under a
 * photograph whose content the app *already knew*, because `args.scene` is the prose the
 * `generate_image` tool was told to draw and is written to `nina_message_images.description` six
 * lines later. The truth about the picture was one field away from the caption, and the caption
 * ignored it.
 *
 * `finishSelfie` is module-private, so every case here drives it through `runNinaImageJob`, which
 * is the only door it has. Everything that leaves the process is mocked: `@vercel/blob`, the job
 * store, the image model, and `lib/nina/queries.ts` (which reaches Neon). `lib/nina/imagerun.ts`
 * opens with `import 'server-only'` — aliased by `vitest.config.ts`, so importing it is safe.
 *
 * `ninaImageCaption` is deliberately NOT mocked: the fallback assertions are only worth anything
 * if they compare against the real deterministic draw for the real job id.
 */

vi.mock('next/server', () => ({ after: (task: () => unknown) => void task }))

/** Hoisted so the factory below can name it and the tests can assert on it. */
const { putBlob, findDuplicate, releaseLoser } = vi.hoisted(() => ({
  putBlob: vi.fn(),
  findDuplicate: vi.fn(),
  releaseLoser: vi.fn(),
}))

vi.mock('@vercel/blob', () => ({ put: putBlob }))
vi.mock('@/lib/env', () => ({ blobEnv: () => ({ BLOB_READ_WRITE_TOKEN: 'test-token' }) }))
vi.mock('@/lib/nina/blobRelease', () => ({ releaseBlobIfUnreferenced: releaseLoser }))
vi.mock('@/lib/nina/caption', () => ({ captionNinaPhoto: vi.fn() }))
vi.mock('@/lib/nina/errorlogs', () => ({ logNinaError: vi.fn() }))
vi.mock('@/lib/nina/imagecall', () => ({ callNinaImageModel: vi.fn() }))
vi.mock('@/lib/nina/imagejobs', () => ({
  claimNinaImageJob: vi.fn(),
  completeNinaImageJob: vi.fn(),
  failNinaImageJob: vi.fn(),
  listRevivableNinaImageJobs: vi.fn(),
  requeueNinaImageJob: vi.fn(),
}))
vi.mock('@/lib/nina/queries', () => ({
  findNinaImageByContentHash: findDuplicate,
  getNinaMessagesByIds: vi.fn(),
  insertNinaAvatarAsCurrent: vi.fn(),
  insertNinaMessageImages: vi.fn(),
  insertNinaMessages: vi.fn(),
  readNinaTuning: vi.fn(),
}))
vi.mock('@/lib/nina/sessionResolve', () => ({ resolveNinaWriteSession: vi.fn() }))

const caption = vi.mocked(captionNinaPhoto)
const claim = vi.mocked(claimNinaImageJob)
const complete = vi.mocked(completeNinaImageJob)
const fail = vi.mocked(failNinaImageJob)
const call = vi.mocked(callNinaImageModel)
const quotedRows = vi.mocked(getNinaMessagesByIds)
const insertImages = vi.mocked(insertNinaMessageImages)
const insertMessages = vi.mocked(insertNinaMessages)
const insertAvatar = vi.mocked(insertNinaAvatarAsCurrent)
const tuning = vi.mocked(readNinaTuning)
const writeSession = vi.mocked(resolveNinaWriteSession)

const USER = 'user-1'
const JOB_ID = 'job-abc'
const SESSION = 'session-1'

/** The scene she asked for, verbatim — the string the caption must be derived from. */
const SCENE = 'nina at the beach at sunset, sitting on the sand, wind in her hair'

const ARGS = {
  purpose: 'selfie' as const,
  scene: SCENE,
  mood: 'santai',
  prompt: 'a photo of Nina, beach, sunset',
  seed: 7,
  replyToId: null,
  source: 'chat' as const,
  attempts: 1,
  sidecar: '{"model":"x","seed":7}',
}

beforeEach(() => {
  vi.clearAllMocks()
  claim.mockResolvedValue({ args: ARGS, attempts: 1 } as never)
  /* `anchored: false` — this suite's jobs carry no `args.referenceUrl`, so R10's reference never
   * goes on the wire. The field is required on the `ok: true` branch, not optional, so that a
   * caller cannot silently forget to log whether the anchor was actually sent. */
  call.mockResolvedValue({
    ok: true,
    b64: 'AAAA',
    costMicroUsd: 1200,
    latencyMs: 78_200,
    anchored: false,
  })
  quotedRows.mockResolvedValue([] as never)
  writeSession.mockResolvedValue(SESSION as never)
  tuning.mockResolvedValue(NINA_TUNING_DEFAULTS)
  insertMessages.mockResolvedValue([{ id: 'msg-1' }] as never)
  insertImages.mockResolvedValue(undefined as never)
  complete.mockResolvedValue(undefined as never)
  caption.mockResolvedValue('nih, di pantai')
  putBlob.mockResolvedValue({
    url: 'https://blob.test/nina/u1/selfie-x.png',
    pathname: 'nina/u1/selfie-x.png',
  })
  findDuplicate.mockResolvedValue(null)
  releaseLoser.mockResolvedValue('deleted')
})

describe('finishSelfie captions from the scene', () => {
  it('writes the caption the model returned, not a canned line', async () => {
    await expect(runNinaImageJob(USER, JOB_ID)).resolves.toBe('ok')

    expect(caption).toHaveBeenCalledWith(
      expect.objectContaining({ seen: SCENE, seenKind: 'requested' }),
    )
    expect(insertMessages).toHaveBeenCalledWith(
      USER,
      [expect.objectContaining({ body: 'nih, di pantai', photoOnly: true })],
      SESSION,
    )
    /* The whole point: the canned draw is not what landed. */
    expect(insertMessages.mock.calls[0]?.[1][0]?.body).not.toBe(ninaImageCaption(JOB_ID))
  })

  it('hands the caption the live tuning, not a cached or default one', async () => {
    const loud = { ...NINA_TUNING_DEFAULTS, notes: 'fotonya di taman, pagi ini' }
    tuning.mockResolvedValue(loud)

    await runNinaImageJob(USER, JOB_ID)

    expect(tuning).toHaveBeenCalledWith(USER)
    expect(caption).toHaveBeenCalledWith(expect.objectContaining({ tuning: loud }))
  })

  it('makes no vision call, ever', async () => {
    await runNinaImageJob(USER, JOB_ID)

    /*
     * "we wrote the picture, so paying a vision call to be told back our own prompt would be
     * absurd" — `finishSelfie`'s own docstring. Asserted against the SOURCE rather than against a
     * spy, because a spy on a module this one never imports can only ever pass: the guarantee is
     * that `lib/nina/vision.ts` is absent from the import graph, and that is a fact about the text.
     * `tests/nina.tuning.test.ts` reads its subject's source for the same reason.
     */
    const source = readFileSync(
      fileURLToPath(new URL('../lib/nina/imagerun.ts', import.meta.url)),
      'utf8',
    )
    expect(source).not.toMatch(/from '\.\/vision'/)
    expect(source).not.toMatch(/describeNinaImages/)
  })

  it('falls back to the deterministic canned line when the caption is refused', async () => {
    caption.mockResolvedValue(null)

    await expect(runNinaImageJob(USER, JOB_ID)).resolves.toBe('ok')

    expect(insertMessages).toHaveBeenCalledWith(
      USER,
      [expect.objectContaining({ body: ninaImageCaption(JOB_ID), photoOnly: true })],
      SESSION,
    )
  })

  it('never lets a caption problem cost the photograph', async () => {
    caption.mockResolvedValue(null)

    await expect(runNinaImageJob(USER, JOB_ID)).resolves.toBe('ok')

    expect(insertImages).toHaveBeenCalled()
    expect(complete).toHaveBeenCalled()
  })

  it('degrades to default tuning when the tuning read throws, and still lands the photograph', async () => {
    /* The one read wrapped in `finishSelfie`, and the reason it is wrapped: it exists only to
     * dress the caption, so its failure is a caption problem and must not fail the job. */
    tuning.mockRejectedValue(new Error('neon: connection reset'))

    await expect(runNinaImageJob(USER, JOB_ID)).resolves.toBe('ok')

    expect(caption).toHaveBeenCalledWith(
      expect.objectContaining({ tuning: NINA_TUNING_DEFAULTS, seen: SCENE }),
    )
    expect(insertImages).toHaveBeenCalled()
    expect(complete).toHaveBeenCalled()
  })

  it('still throws only for a missing message row', async () => {
    insertMessages.mockResolvedValue([] as never)
    /* On the LAST attempt, so `closeFailed` gives up instead of requeuing — a requeue would spin
     * this loop against a mock that fails instantly, for the whole wall-clock budget. */
    claim.mockResolvedValue({ args: ARGS, attempts: NINA_IMAGE_MAX_ATTEMPTS } as never)

    /* `runNinaImageJob` catches what `finishSelfie` throws and closes the job, so the throw is
     * observed in the failure detail rather than as a rejection here. */
    await expect(runNinaImageJob(USER, JOB_ID)).resolves.toBe('gave-up')
    expect(complete).not.toHaveBeenCalled()
    expect(fail).toHaveBeenCalledWith(
      expect.objectContaining({
        detail: expect.stringContaining('finishSelfie: no message row was written'),
      }),
    )
  })

  it('writes the scene to description unchanged', async () => {
    await runNinaImageJob(USER, JOB_ID)

    /* The caption is derived FROM it; it does not replace it. /admin's detail panel reads this. */
    expect(insertImages).toHaveBeenCalledWith(USER, [
      expect.objectContaining({ description: SCENE, prompt: ARGS.sidecar }),
    ])
  })
})

describe('write-time dedup (media-dedupe P3)', () => {
  const KEEPER = {
    id: 'keeper000001',
    blobUrl: 'https://blob.test/nina/u1/selfie-keeper.png',
    pathname: 'nina/u1/selfie-keeper.png',
  }
  const FRESH = {
    url: 'https://blob.test/nina/u1/selfie-fresh.png',
    pathname: 'nina/u1/selfie-fresh.png',
  }

  it('skips the put and writes a REFERENCE when an original already holds the bytes', async () => {
    findDuplicate.mockResolvedValue(KEEPER)

    await expect(runNinaImageJob(USER, JOB_ID)).resolves.toBe('ok')

    /* The whole point: no second object exists. */
    expect(putBlob).not.toHaveBeenCalled()
    expect(insertImages).toHaveBeenCalledWith(USER, [
      expect.objectContaining({
        blobUrl: KEEPER.blobUrl,
        pathname: KEEPER.pathname,
        sourceImageId: KEEPER.id,
        /* The scene and sidecar stay THIS generation's — argued at the insert. */
        description: SCENE,
        prompt: ARGS.sidecar,
      }),
    ])
    /* Nothing was put, so there is nothing to release. */
    expect(releaseLoser).not.toHaveBeenCalled()
    /* A deduped photograph is a delivered photograph. */
    expect(complete).toHaveBeenCalled()
  })

  it('hashes the bytes and writes the hash on a fresh original', async () => {
    putBlob.mockResolvedValue(FRESH)

    await runNinaImageJob(USER, JOB_ID)

    expect(putBlob).toHaveBeenCalledOnce()
    const [row] = insertImages.mock.calls[0]?.[1] ?? []
    expect(row?.sourceImageId ?? null).toBeNull()
    expect(row?.contentHash).toMatch(/^[0-9a-f]{64}$/)
    expect(releaseLoser).not.toHaveBeenCalled()
  })

  it('loses a race at insert time: the row becomes a reference and the fresh bytes are released', async () => {
    // Two hosts both answered "no duplicate" before their puts; the re-check at insert is what
    // keeps the second object from surviving. ROW FIRST, BLOB SECOND.
    findDuplicate.mockResolvedValueOnce(null).mockResolvedValueOnce(KEEPER)
    putBlob.mockResolvedValue(FRESH)

    await expect(runNinaImageJob(USER, JOB_ID)).resolves.toBe('ok')

    expect(putBlob).toHaveBeenCalledOnce()
    expect(insertImages).toHaveBeenCalledWith(USER, [
      expect.objectContaining({ blobUrl: KEEPER.blobUrl, sourceImageId: KEEPER.id }),
    ])
    expect(releaseLoser).toHaveBeenCalledWith(USER, {
      blobUrl: FRESH.url,
      pathname: FRESH.pathname,
    })
  })

  it('a dedup lookup fault degrades to a normal store; the photograph is never lost to it', async () => {
    // The generation was already paid for. Dedup is an optimization on top of that spend.
    findDuplicate.mockRejectedValue(new Error('neon: connection reset'))

    await expect(runNinaImageJob(USER, JOB_ID)).resolves.toBe('ok')

    expect(putBlob).toHaveBeenCalledOnce()
    expect(insertImages).toHaveBeenCalled()
    expect(complete).toHaveBeenCalled()
  })

  it('an avatar generation is out of dedup scope: no lookup, no hash, album write as before', async () => {
    claim.mockResolvedValue({ args: { ...ARGS, purpose: 'avatar' }, attempts: 1 } as never)

    await expect(runNinaImageJob(USER, JOB_ID)).resolves.toBe('ok')

    expect(findDuplicate).not.toHaveBeenCalled()
    expect(insertAvatar).toHaveBeenCalled()
  })
})
