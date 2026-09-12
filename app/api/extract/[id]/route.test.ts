import { beforeEach, describe, expect, it, vi } from 'vitest'

import { GET } from '@/app/api/extract/[id]/route'
import { UnauthorizedError, requireUserIdApi } from '@/lib/auth/requireUserId'
import { readExtractionResult } from '@/lib/extract/readExtraction'
import type { ExtractionResult } from '@/lib/schema/extractionResult'

/**
 * `GET /api/extract/[id]` — the poll. Three refusals in a strict order, then one header that
 * the whole polling design rests on:
 *
 *   1. 401 signed out, before anything else;
 *   2. 404 for an id that cannot be one of ours — answered WITHOUT a query, so a scanner's
 *      probe costs no database round trip;
 *   3. 404 for a real id that belongs to someone else — ownership is baked into the read
 *      (`readExtractionResult` filters on user_id), and the route answers a stranger
 *      identically to a missing row so the response cannot be used to learn which ids exist;
 *   4. a found extraction is answered `Cache-Control: no-store` — a cached poll would serve
 *      `pending` after the job finished.
 *
 * The route's ctx is Next's generated `RouteContext` — at runtime nothing more than
 * `{ params: Promise<{ id: string }> }`, which is what these tests hand it (Next 16 params
 * are async; awaiting them is the route's own job).
 */

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
vi.mock('@/lib/extract/readExtraction', () => ({ readExtractionResult: vi.fn() }))

const requireUserIdApiMock = vi.mocked(requireUserIdApi)
const readExtractionResultMock = vi.mocked(readExtractionResult)

const USER_ID = 'u12345678901'
const EXTRACTION_ID = 'ext123456789'

type Ctx = Parameters<typeof GET>[1]

function ctx(id: string): Ctx {
  return { params: Promise.resolve({ id }) } as unknown as Ctx
}

function get(id: string): Promise<Response> {
  return GET(new Request(`https://runins.site/api/extract/${id}`), ctx(id))
}

beforeEach(() => {
  vi.clearAllMocks()
  requireUserIdApiMock.mockResolvedValue(USER_ID)
})

describe('GET /api/extract/[id]', () => {
  it('answers 401 when signed out, before any read', async () => {
    requireUserIdApiMock.mockRejectedValue(new UnauthorizedError())

    const response = await get(EXTRACTION_ID)

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' })
    expect(readExtractionResultMock).not.toHaveBeenCalled()
  })

  it('rethrows a non-auth failure from the auth layer', async () => {
    requireUserIdApiMock.mockRejectedValue(new Error('session store unreachable'))

    await expect(get(EXTRACTION_ID)).rejects.toThrow('session store unreachable')
    expect(readExtractionResultMock).not.toHaveBeenCalled()
  })

  it('answers 404 for an id that cannot be one of ours — without a query', async () => {
    const response = await get('not-an-id')

    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toEqual({ error: 'Not found' })
    expect(readExtractionResultMock).not.toHaveBeenCalled()
  })

  it('answers 404 for another user extraction, through the same body as a missing row', async () => {
    // Ownership is baked into the read, so the route's own answer is the null case. It must
    // be indistinguishable from "no such id" — a 403 would confirm the id exists.
    readExtractionResultMock.mockResolvedValue(null)

    const response = await get(EXTRACTION_ID)

    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toEqual({ error: 'Not found' })
    expect(readExtractionResultMock).toHaveBeenCalledWith(USER_ID, EXTRACTION_ID)
  })

  it('answers a found extraction with no-store', async () => {
    const result: ExtractionResult = {
      extractionId: EXTRACTION_ID,
      status: 'pending',
      session: null,
      errorCode: null,
      kinds: [],
      photos: [],
      promptTokens: null,
      createdAt: '2026-09-12T10:00:00.000Z',
      completedAt: null,
    }
    readExtractionResultMock.mockResolvedValue(result)

    const response = await get(EXTRACTION_ID)

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual(result)
    // The one header the polling design rests on: a cached poll would serve `pending` after
    // the job finished, in every cache between here and the browser.
    expect(response.headers.get('cache-control')).toBe('no-store')
  })
})
