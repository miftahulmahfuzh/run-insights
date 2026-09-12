import { beforeEach, describe, expect, it, vi } from 'vitest'

import { POST } from '@/app/api/admin/nina/upload/route'
import {
  ADMIN_AVATAR_CACHE_MAX_AGE,
  ADMIN_AVATAR_MAX_UPLOAD_BYTES,
  ADMIN_AVATAR_THUMB_MAX_UPLOAD_BYTES,
  ADMIN_AVATAR_TOKEN_TTL_MS,
} from '@/lib/admin/avatars'
import {
  ADMIN_CHAT_PHOTO_CONTENT_TYPE,
  ADMIN_CHAT_PHOTO_MAX_UPLOAD_BYTES,
} from '@/lib/admin/chatPhotos'
import { requireAdminApi, type AdminIdentity } from '@/lib/admin/requireAdmin'
import { UnauthorizedError } from '@/lib/auth/requireUserId'
import { blobEnv } from '@/lib/env'
import { handleUpload } from '@vercel/blob/client'

/**
 * The second upload handshake, and the sharper of the two boundaries: `requireAdminApi()` runs
 * BEFORE the SDK, so a signed-in NON-admin is refused with the same 404 the pages give, and the
 * pathname is accepted in three shapes, each with its own size cap. The route header argues
 * both points at length; these tests make the arguments enforceable.
 *
 * Mocking mirrors `app/api/upload/route.test.ts`: `handleUpload` is a thin fake whose mint
 * callback the tests drive directly. The two auth modules are mocked wholesale so the heavy
 * `@/auth` graph never loads, with the mock's `unauthorizedJson`/`forbiddenJson` kept byte-for-
 * byte identical to the real helpers (401 'Unauthorized' / 404 'Not found') — the route's own
 * branching (UnauthorizedError → 401, anything else → 404) is what is under test, and a fake
 * helper with different numbers would silently bless the wrong status. The caps are asserted
 * against the IMPORTED constants, so a cap that silently widens fails here.
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
vi.mock('@/lib/admin/requireAdmin', () => {
  const forbiddenJson = (): Response => Response.json({ error: 'Not found' }, { status: 404 })
  return { requireAdminApi: vi.fn(), forbiddenJson, getAdminIdentity: vi.fn() }
})
vi.mock('@/lib/env', () => ({ blobEnv: vi.fn() }))
vi.mock('@vercel/blob/client', () => ({ handleUpload: vi.fn() }))

const blobEnvMock = vi.mocked(blobEnv)
const handleUploadMock = vi.mocked(handleUpload)
const requireAdminApiMock = vi.mocked(requireAdminApi)

const ADMIN_ID = 'adminuser12345'
const ADMIN_EMAIL = 'admin@example.com'

const ALBUM_PATHNAME = `nina/${ADMIN_ID}/avatar-abcdefghijkl.jpg`
const THUMB_PATHNAME = `nina/${ADMIN_ID}/thumb-abcdefghijkl.webp`
const CHAT_PHOTO_PATHNAME = `nina/${ADMIN_ID}/selfie-abcdefghijkl.jpg`

const SDK_RESPONSE = { type: 'generate-client-token', clientToken: 'unit-test-token' }

function adminBody(pathname: string, contentType: string) {
  return {
    type: 'generate-client-token',
    pathname,
    clientPayload: JSON.stringify({ contentType }),
  }
}

function post(body: unknown): Promise<Response> {
  return POST(
    new Request('https://runins.site/api/admin/nina/upload', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }),
  )
}

type MintOptions = Parameters<typeof handleUpload>[0]
type MintCallback = NonNullable<MintOptions['onBeforeGenerateToken']>

function lastMintOptions(): MintOptions {
  const call = handleUploadMock.mock.calls.at(-1)
  if (call == null) throw new Error('handleUpload was never called')
  return call[0]!
}

async function mint(
  pathname: string,
  clientPayload: string,
): Promise<Awaited<ReturnType<MintCallback>>> {
  const onBeforeGenerateToken = lastMintOptions().onBeforeGenerateToken
  if (onBeforeGenerateToken == null) {
    throw new Error('route did not register onBeforeGenerateToken')
  }
  // The SDK's third argument: `multipart`, false for every browser PUT this repo makes.
  return onBeforeGenerateToken(pathname, clientPayload, false)
}

function expectAdmin() {
  const identity: AdminIdentity = { userId: ADMIN_ID, email: ADMIN_EMAIL }
  requireAdminApiMock.mockResolvedValue(identity)
}

beforeEach(() => {
  vi.clearAllMocks()
  expectAdmin()
  handleUploadMock.mockResolvedValue(SDK_RESPONSE as Awaited<ReturnType<typeof handleUpload>>)
})

describe('POST /api/admin/nina/upload — the gate', () => {
  it('answers a signed-out caller with 401 and never reaches the SDK', async () => {
    requireAdminApiMock.mockRejectedValue(new UnauthorizedError())

    const response = await post(adminBody(ALBUM_PATHNAME, 'image/jpeg'))

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' })
    expect(handleUploadMock).not.toHaveBeenCalled()
  })

  it('answers a non-admin with the same 404 the pages give', async () => {
    // Any non-UnauthorizedError refusal maps to forbiddenJson(): `/admin/nina` and
    // `/admin/nonsense` answer identically, so the admin surface's existence is not confirmed.
    requireAdminApiMock.mockRejectedValue(new Error('Not an admin'))

    const response = await post(adminBody(ALBUM_PATHNAME, 'image/jpeg'))

    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toEqual({ error: 'Not found' })
  })

  it('checks the blob env, then the gate, then the SDK — in that order', async () => {
    await post(adminBody(ALBUM_PATHNAME, 'image/jpeg'))

    expect(blobEnvMock).toHaveBeenCalledTimes(1)
    expect(requireAdminApiMock).toHaveBeenCalledTimes(1)
    const [envAt, gateAt, sdkAt] = [
      blobEnvMock.mock.invocationCallOrder[0]!,
      requireAdminApiMock.mock.invocationCallOrder[0]!,
      handleUploadMock.mock.invocationCallOrder[0]!,
    ]
    expect(envAt).toBeLessThan(gateAt)
    expect(gateAt).toBeLessThan(sdkAt)
  })

  it('answers a non-JSON body with 400 after the gate', async () => {
    const response = await post('not json at all')

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({ error: 'Invalid JSON body' })
    expect(handleUploadMock).not.toHaveBeenCalled()
  })
})

describe('the three pathname shapes, each with its own cap', () => {
  it('mints an album original at 8 MB', async () => {
    await post(adminBody(ALBUM_PATHNAME, 'image/jpeg'))

    const before = Date.now()
    const token = await mint(ALBUM_PATHNAME, '{"contentType":"image/jpeg"}')
    const afterNow = Date.now()

    expect(token.allowedContentTypes).toEqual(['image/jpeg'])
    expect(token.maximumSizeInBytes).toBe(ADMIN_AVATAR_MAX_UPLOAD_BYTES)
    expect(token.addRandomSuffix).toBe(true)
    expect(token.allowOverwrite).toBe(false)
    expect(token.cacheControlMaxAge).toBe(ADMIN_AVATAR_CACHE_MAX_AGE)
    expect(token.validUntil).toBeGreaterThanOrEqual(before + ADMIN_AVATAR_TOKEN_TTL_MS)
    expect(token.validUntil).toBeLessThanOrEqual(afterNow + ADMIN_AVATAR_TOKEN_TTL_MS)
    expect(JSON.parse(token.tokenPayload ?? '{}')).toEqual({ userId: ADMIN_ID })
  })

  it('mints a derived thumbnail at 512 KB, not the album cap', async () => {
    await post(adminBody(THUMB_PATHNAME, 'image/webp'))

    const token = await mint(THUMB_PATHNAME, '{"contentType":"image/webp"}')

    expect(token.allowedContentTypes).toEqual(['image/webp'])
    expect(token.maximumSizeInBytes).toBe(ADMIN_AVATAR_THUMB_MAX_UPLOAD_BYTES)
  })

  it('mints a chat photo at 2 MB, JPEG only', async () => {
    await post(adminBody(CHAT_PHOTO_PATHNAME, 'image/jpeg'))

    const token = await mint(
      CHAT_PHOTO_PATHNAME,
      `{"contentType":"${ADMIN_CHAT_PHOTO_CONTENT_TYPE}"}`,
    )

    expect(token.allowedContentTypes).toEqual([ADMIN_CHAT_PHOTO_CONTENT_TYPE])
    expect(token.maximumSizeInBytes).toBe(ADMIN_CHAT_PHOTO_MAX_UPLOAD_BYTES)
  })
})

describe('mislabel and foreign-owner refusals', () => {
  it('refuses a chat photo that does not declare JPEG', async () => {
    await post(adminBody(CHAT_PHOTO_PATHNAME, 'image/jpeg'))

    // The shape stores JPEG and nothing else: the branch check fires before the extension
    // cross-check, and both refuse with the same terse message.
    await expect(mint(CHAT_PHOTO_PATHNAME, '{"contentType":"image/png"}')).rejects.toThrow(
      'Invalid pathname',
    )
  })

  it('refuses a pathname whose extension disagrees with the declared type', async () => {
    await post(adminBody(ALBUM_PATHNAME, 'image/jpeg'))

    // "a .webp name over JPEG bytes" is the reachable lie the cross-check exists to close.
    await expect(mint(THUMB_PATHNAME, '{"contentType":"image/jpeg"}')).rejects.toThrow(
      'Invalid pathname',
    )
  })

  it('refuses a content type the client payload schema does not know', async () => {
    await post(adminBody(ALBUM_PATHNAME, 'image/jpeg'))

    await expect(mint(ALBUM_PATHNAME, '{"contentType":"image/gif"}')).rejects.toThrow()
  })

  it('refuses a pathname for another user', async () => {
    await post(adminBody(ALBUM_PATHNAME, 'image/jpeg'))

    // All three predicates interpolate the id from the SESSION, so a folder that is not the
    // admin's matches nothing and the mint is refused.
    const foreign = 'nina/victim123456789/avatar-abcdefghijkl.jpg'
    await expect(mint(foreign, '{"contentType":"image/jpeg"}')).rejects.toThrow('Invalid pathname')
  })

  it('refuses the runner composer shape this route deliberately does not mint', async () => {
    await post(adminBody(ALBUM_PATHNAME, 'image/jpeg'))

    // `nina/<id>/chat/<id>.jpg` belongs to `/api/upload`; admitting it here would give an
    // admin-only route the runner's 900 KB branch.
    const runnerChat = `nina/${ADMIN_ID}/chat/abcdefghijkl.jpg`
    await expect(mint(runnerChat, '{"contentType":"image/jpeg"}')).rejects.toThrow(
      'Invalid pathname',
    )
  })
})

describe('the refused mint maps to a readable 400', () => {
  it('end to end, through the real catch', async () => {
    handleUploadMock.mockImplementationOnce(async (options) => {
      await options.onBeforeGenerateToken?.(
        'nina/elsewhere/avatar-abcdefghijkl.jpg',
        '{"contentType":"image/jpeg"}',
        false,
      )
      return SDK_RESPONSE as Awaited<ReturnType<typeof handleUpload>>
    })

    const response = await post(adminBody(ALBUM_PATHNAME, 'image/jpeg'))

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({ error: 'Invalid pathname' })
  })
})
