import { beforeEach, describe, expect, it, vi } from 'vitest'

import { POST } from '@/app/api/extract/route'
import { UnauthorizedError, requireUserIdApi } from '@/lib/auth/requireUserId'
import { attachExtractionPhotos, createExtraction } from '@/lib/db/queries'
import { runExtractionJob } from '@/lib/llm/runExtractionJob'
import { after } from 'next/server'

/**
 * `POST /api/extract` — the 202-and-schedule contract. The handler's whole job is four steps in
 * an order that must not drift: auth → validate → two scoped writes → schedule the job via
 * `after()` and answer 202 with the extraction id. These tests pin the order and each step's
 * failure shape: a 401 that never touches the database, a non-auth auth failure that is
 * RETHROWN rather than laundered into a 4xx, the schema's issues surfaced verbatim, and the
 * `after()` callback carrying exactly what `runExtractionJob` needs.
 *
 * `after` is mocked because the real one throws outside a request context — precisely the
 * property that makes the route unit-testable with a fake. The schema itself is real: a body
 * these tests accept went through `ExtractRequestSchema`, not a test-local stand-in for it.
 */

vi.mock('next/server', () => ({ after: vi.fn() }))
vi.mock('@/lib/auth/requireUserId', () => {
  class UnauthorizedError extends Error {
    readonly status = 401
    constructor(message = 'Unauthorized') {
      super(message)
      this.name = 'UnauthorizedError'
    }
  }
  const unauthorizedJson = (): Response => Response.json({ error: 'Unauthorized' }, { status: 401 })
  return { getUserId: vi.fn(), requireUserIdApi: vi.fn(), UnauthorizedError, unauthorizedJson }
})
vi.mock('@/lib/db/queries', () => ({
  createExtraction: vi.fn(),
  attachExtractionPhotos: vi.fn(),
}))
vi.mock('@/lib/llm/runExtractionJob', () => ({ runExtractionJob: vi.fn() }))

const requireUserIdApiMock = vi.mocked(requireUserIdApi)
const createExtractionMock = vi.mocked(createExtraction)
const attachExtractionPhotosMock = vi.mocked(attachExtractionPhotos)
const runExtractionJobMock = vi.mocked(runExtractionJob)
const afterMock = vi.mocked(after)

const USER_ID = 'u12345678901'
const EXTRACTION_ID = 'ext123456789'

/** A blob ref that satisfies the real `ExtractionBlobRefSchema`, for one `kind`. */
function image(kind: 'summary' | 'splits' | 'heartrate') {
  const pathname = 'shots/abcdefghijkl-abcdefghijklmnop.jpg'
  return {
    url: `https://xyz.public.blob.vercel-storage.com/${pathname}`,
    pathname,
    kind,
    width: 560,
    height: 1200,
    bytes: 58_000,
  }
}

function post(body: unknown): Promise<Response> {
  return POST(
    new Request('https://runins.site/api/extract', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }),
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  requireUserIdApiMock.mockResolvedValue(USER_ID)
  createExtractionMock.mockResolvedValue({ id: EXTRACTION_ID })
  attachExtractionPhotosMock.mockResolvedValue({ ids: [] })
})

describe('POST /api/extract — refusals', () => {
  it('answers 401 when signed out, before any database work', async () => {
    requireUserIdApiMock.mockRejectedValue(new UnauthorizedError())

    const response = await post({ images: [image('summary')] })

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' })
    expect(createExtractionMock).not.toHaveBeenCalled()
    expect(afterMock).not.toHaveBeenCalled()
  })

  it('rethrows a non-auth failure from the auth layer', async () => {
    // Only UnauthorizedError is the 401; anything else is a real fault and must surface as
    // such — laundering it into a 4xx would tell the client to fix a request that is fine.
    requireUserIdApiMock.mockRejectedValue(new Error('session store unreachable'))

    await expect(post({ images: [image('summary')] })).rejects.toThrow('session store unreachable')
    expect(createExtractionMock).not.toHaveBeenCalled()
  })

  it('answers 400 for a non-JSON body', async () => {
    const response = await post('not json')

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({ error: 'Invalid JSON body' })
    expect(createExtractionMock).not.toHaveBeenCalled()
  })

  it('answers 400 with the schema issues for a schema-invalid body', async () => {
    const response = await post({ images: [] })

    expect(response.status).toBe(400)
    const body = (await response.json()) as { error: string; issues: string[] }
    expect(body.error).toBe('Invalid request')
    expect(body.issues.length).toBeGreaterThan(0)
    expect(createExtractionMock).not.toHaveBeenCalled()
  })

  it('refuses duplicate kinds — two of one screenshot never scored', async () => {
    const response = await post({ images: [image('summary'), image('summary')] })

    expect(response.status).toBe(400)
    const body = (await response.json()) as { issues: string[] }
    expect(body.issues).toContain('each screenshot must have a different kind')
    expect(createExtractionMock).not.toHaveBeenCalled()
  })
})

describe('POST /api/extract — the happy path', () => {
  it('opens a pending extraction, attaches photos, schedules the job, answers 202', async () => {
    const images = [image('summary')]
    const response = await post({ images })

    expect(response.status).toBe(202)
    await expect(response.json()).resolves.toEqual({ extractionId: EXTRACTION_ID })
    // The audit row carries the vision model the session was opened with.
    expect(createExtractionMock).toHaveBeenCalledWith(USER_ID, images, 'glm-4.6v')
    expect(afterMock).toHaveBeenCalledTimes(1)
  })

  it('attaches the photos with their sort order, scoped to the user', async () => {
    const images = [image('summary'), image('splits'), image('heartrate')]
    await post({ images })

    expect(attachExtractionPhotosMock).toHaveBeenCalledTimes(1)
    const [userId, extractionId, photos] = attachExtractionPhotosMock.mock.calls[0]!
    expect(userId).toBe(USER_ID)
    expect(extractionId).toBe(EXTRACTION_ID)
    expect(photos).toEqual(
      images.map((img, index) => ({
        blobUrl: img.url,
        pathname: img.pathname,
        kind: img.kind,
        width: img.width,
        height: img.height,
        bytes: img.bytes,
        sortOrder: index,
      })),
    )
  })

  it('the scheduled job carries user, extraction id, images and the invocation clock', async () => {
    const images = [image('heartrate')]
    await post({ images })

    const callback = afterMock.mock.calls[0]![0] as () => Promise<void>
    await callback()

    expect(runExtractionJobMock).toHaveBeenCalledTimes(1)
    const jobInput = runExtractionJobMock.mock.calls[0]![0]!
    expect(jobInput.userId).toBe(USER_ID)
    expect(jobInput.extractionId).toBe(EXTRACTION_ID)
    expect(jobInput.images).toEqual(images)
    // The invocation clock is stamped in the handler, not inside the job — the job's soft
    // deadline must be measured against the same origin as the request.
    expect(typeof jobInput.invocationStartedAt).toBe('number')
  })
})
