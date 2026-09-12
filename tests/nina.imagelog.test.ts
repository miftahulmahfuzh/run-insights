import { beforeEach, describe, expect, it, vi } from 'vitest'

import { logNinaError } from '@/lib/nina/errorlogs'
import { callNinaImageModel } from '@/lib/nina/imagecall'
import { claimNinaImageJob, failNinaImageJob, requeueNinaImageJob } from '@/lib/nina/imagejobs'
import {
  NINA_IMAGE_ANCHORED_CALL_TIMEOUT_MS,
  NINA_IMAGE_CALL_TIMEOUT_MS,
  NINA_IMAGE_MAX_ATTEMPTS,
  NINA_IMAGE_MODEL,
} from '@/lib/nina/imagerecipe'
import { runNinaImageJob } from '@/lib/nina/imagerun'

/**
 * **Phase 4: every failed image-generation call leaves a row.**
 *
 * The defect this suite pins shut is that `callNinaImageModel`'s `detail` — the raw provider text,
 * the only thing that says WHY a generation failed — reached `closeFailed` and `failNinaImageJob`
 * and was `console.warn`'d into a Vercel log that expires. `nina_turns.error_code` kept four words.
 *
 * `recordImageCallFailure` is module-private, so every case here drives it through
 * `runNinaImageJob`, which is the only door it has. Everything that leaves the process is mocked:
 * `@vercel/blob`, the job store, the image model, `lib/nina/queries.ts` and — the point of this
 * suite — `lib/nina/errorlogs.ts`.
 */

vi.mock('next/server', () => ({ after: (task: () => unknown) => void task }))

const { putBlob } = vi.hoisted(() => ({ putBlob: vi.fn() }))

vi.mock('@vercel/blob', () => ({ put: putBlob }))
vi.mock('@/lib/env', () => ({ blobEnv: () => ({ BLOB_READ_WRITE_TOKEN: 'test-token' }) }))
vi.mock('@/lib/nina/blobRelease', () => ({ releaseBlobIfUnreferenced: vi.fn() }))
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
  findNinaImageByContentHash: vi.fn(),
  getNinaMessagesByIds: vi.fn(),
  insertNinaAvatarAsCurrent: vi.fn(),
  insertNinaMessageImages: vi.fn(),
  insertNinaMessages: vi.fn(),
  readNinaTuning: vi.fn(),
}))
vi.mock('@/lib/nina/sessionResolve', () => ({ resolveNinaWriteSession: vi.fn() }))

const call = vi.mocked(callNinaImageModel)
const claim = vi.mocked(claimNinaImageJob)
const fail = vi.mocked(failNinaImageJob)
const requeue = vi.mocked(requeueNinaImageJob)
const log = vi.mocked(logNinaError)

const USER = 'user-1'
const JOB_ID = 'job-abc'
const REFERENCE = 'https://blob.test/nina/anchor.png'
const PROMPT = 'a photograph of Nina on the seawall at dusk, 35mm, golden hour'

const ARGS = {
  purpose: 'selfie' as const,
  scene: 'nina on the seawall at dusk',
  mood: 'santai',
  prompt: PROMPT,
  seed: 7,
  replyToId: null,
  source: 'chat' as const,
  attempts: 1,
  sidecar: '{"model":"qwen/qwen-image-3","seed":7}',
}

/** A timed-out unanchored call, with the ceiling `imagecall.ts` would have reported. */
const TIMED_OUT = {
  ok: false as const,
  kind: 'timeout' as const,
  latencyMs: 150_000,
  costMicroUsd: null,
  detail: 'TimeoutError: The operation was aborted due to timeout',
  timeoutMs: NINA_IMAGE_CALL_TIMEOUT_MS,
}

/**
 * Claim the job at its LAST attempt, so `closeFailed` gives up instead of requeuing — a requeue
 * would spin `runNinaImageJob`'s loop forever against a mock that always returns the same claim.
 */
function claimLastAttempt(args: Record<string, unknown> = ARGS) {
  claim.mockResolvedValue({
    jobId: JOB_ID,
    args: { ...args, attempts: NINA_IMAGE_MAX_ATTEMPTS },
    attempts: NINA_IMAGE_MAX_ATTEMPTS,
  } as never)
}

beforeEach(() => {
  vi.clearAllMocks()
  log.mockResolvedValue(undefined)
  putBlob.mockResolvedValue({ url: 'https://blob.test/nina/x.png', pathname: 'nina/x.png' })
  call.mockResolvedValue(TIMED_OUT)
})

describe('image-generation failures land in nina_error_logs', () => {
  it('writes the raw provider detail, the prompt, the camera and the timeout', async () => {
    claimLastAttempt()

    await runNinaImageJob(USER, JOB_ID)

    expect(log).toHaveBeenCalledTimes(1)
    expect(log).toHaveBeenCalledWith({
      userId: USER,
      category: 'image_generation',
      provider: 'openrouter',
      model: NINA_IMAGE_MODEL,
      fullInput: PROMPT,
      /* The classification, then the provider's words verbatim. */
      errorMessage: '[timeout] TimeoutError: The operation was aborted due to timeout',
      timeoutMs: NINA_IMAGE_CALL_TIMEOUT_MS,
      /* No anchor on this job, so no image link — matching `planJobPhoto`'s "never a link the
       * server has not proved". */
      imageUrl: null,
    })
  })

  it('logs EVERY failed call, including one that is requeued and retried in budget', async () => {
    /* Attempt 1 has budget left -> requeue; attempt 2 is terminal -> failNinaImageJob. */
    claim.mockResolvedValueOnce({ jobId: JOB_ID, args: ARGS, attempts: 1 } as never)
    claim.mockResolvedValueOnce({
      jobId: JOB_ID,
      args: { ...ARGS, attempts: NINA_IMAGE_MAX_ATTEMPTS },
      attempts: NINA_IMAGE_MAX_ATTEMPTS,
    } as never)

    const outcome = await runNinaImageJob(USER, JOB_ID)

    expect(outcome).toBe('gave-up')
    expect(requeue).toHaveBeenCalledTimes(1)
    expect(fail).toHaveBeenCalledTimes(1)
    /* The whole decision, in one number: a failed CALL is a row, not a failed JOB. */
    expect(log).toHaveBeenCalledTimes(2)
  })

  it("an anchored job logs the anchor's URL and the anchored ceiling", async () => {
    claimLastAttempt({ ...ARGS, referenceUrl: REFERENCE })
    call.mockResolvedValue({
      ok: false,
      kind: 'transport',
      latencyMs: 900,
      costMicroUsd: null,
      detail: 'HTTP 502 upstream connect error',
      timeoutMs: NINA_IMAGE_ANCHORED_CALL_TIMEOUT_MS,
    })

    await runNinaImageJob(USER, JOB_ID)

    expect(log.mock.calls[0]?.[0]).toMatchObject({
      imageUrl: REFERENCE,
      timeoutMs: NINA_IMAGE_ANCHORED_CALL_TIMEOUT_MS,
      errorMessage: '[transport] HTTP 502 upstream connect error',
    })
  })

  it("names the job's own camera, and coerces an unknown one the way the call does", async () => {
    claimLastAttempt({ ...ARGS, model: 'qwen/qwen-image-3-pro' })
    await runNinaImageJob(USER, JOB_ID)
    expect(log.mock.calls[0]?.[0]).toMatchObject({ model: 'qwen/qwen-image-3-pro' })

    vi.clearAllMocks()
    log.mockResolvedValue(undefined)
    call.mockResolvedValue(TIMED_OUT)
    claimLastAttempt({ ...ARGS, model: 'a-camera-that-was-retired' })
    await runNinaImageJob(USER, JOB_ID)
    expect(log.mock.calls[0]?.[0]).toMatchObject({ model: NINA_IMAGE_MODEL })
  })

  it('does NOT log a Blob store failure: the model call succeeded and was billed', async () => {
    claimLastAttempt()
    call.mockResolvedValue({
      ok: true,
      b64: 'QUJD',
      costMicroUsd: 40_000,
      latencyMs: 78_200,
      anchored: false,
    })
    putBlob.mockRejectedValue(new Error('blob: 503'))

    const outcome = await runNinaImageJob(USER, JOB_ID)

    /* The job still closes as a failure, with `transport` in `nina_turns` as it always did... */
    expect(outcome).toBe('gave-up')
    expect(fail).toHaveBeenCalledTimes(1)
    /* ...and the Error-logs tab does not claim the image model failed, because it did not. */
    expect(log).not.toHaveBeenCalled()
  })

  it('a log write that throws cannot cost the job its apology', async () => {
    claimLastAttempt()
    log.mockRejectedValue(new Error('neon: connection reset'))

    await expect(runNinaImageJob(USER, JOB_ID)).resolves.toBe('gave-up')

    expect(log).toHaveBeenCalledTimes(1)
    expect(fail).toHaveBeenCalledTimes(1)
  })
})
