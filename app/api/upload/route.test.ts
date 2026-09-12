import { beforeEach, describe, expect, it, vi } from 'vitest'

import { POST } from '@/app/api/upload/route'
import { getUserId } from '@/lib/auth/requireUserId'
import {
  ALLOWED_UPLOAD_CONTENT_TYPES,
  BLOB_CACHE_MAX_AGE,
  MAX_UPLOAD_BYTES,
  SCREEN_KINDS,
  UPLOAD_TOKEN_TTL_MS,
} from '@/lib/extract/constants'
import { blobEnv } from '@/lib/env'
import { NINA_CHAT_ALLOWED_CONTENT_TYPES, NINA_CHAT_MAX_UPLOAD_BYTES } from '@/lib/nina/images'
import { handleUpload } from '@vercel/blob/client'

/**
 * `POST /api/upload` is a security boundary in its own right: `proxy.ts` deliberately does not
 * match `/api/*`, so the `getUserId()` check inside `onBeforeGenerateToken` is the only thing
 * between the open internet and a writable blob store. These tests pin the boundary, not the
 * SDK: `@vercel/blob/client`'s `handleUpload` is mocked with the thinnest possible fake and the
 * route's own mint callback is driven directly, so what is under test is the WIRING — which
 * pathname predicate admits which branch, which constants each branch hands the SDK, and what
 * the session's user id is allowed to reach.
 *
 * The pathname predicates themselves are real (`lib/extract/constants.ts` and
 * `lib/nina/images.ts` are pure modules), so a pathname that passes here passed the production
 * regex. Asserting against the IMPORTED constants rather than restated numbers is what lets
 * this suite catch a cap that silently drifts — the exact mistake both route headers argue
 * against.
 */

vi.mock('@/lib/auth/requireUserId', () => ({ getUserId: vi.fn() }))
vi.mock('@/lib/env', () => ({ blobEnv: vi.fn() }))
vi.mock('@vercel/blob/client', () => ({ handleUpload: vi.fn() }))

const getUserIdMock = vi.mocked(getUserId)
const blobEnvMock = vi.mocked(blobEnv)
const handleUploadMock = vi.mocked(handleUpload)

const USER_ID = 'u12345678901'
const SHOT_PATHNAME = 'shots/abcdefghijkl.jpg'
const CHAT_PATHNAME = `nina/${USER_ID}/chat/abcdefghijkl.jpg`

/** The SDK's mint result, reduced to the fields the route passes through. */
const SDK_RESPONSE = { type: 'generate-client-token', clientToken: 'unit-test-token' }

/** The body `UploadPicker.tsx` actually sends for a shot upload. */
function shotBody(pathname = SHOT_PATHNAME, clientPayload = '{"kind":"summary"}') {
  return { type: 'generate-client-token', pathname, clientPayload }
}

function post(body: unknown): Promise<Response> {
  return POST(
    new Request('https://runins.site/api/upload', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }),
  )
}

type MintOptions = Parameters<typeof handleUpload>[0]
type MintCallback = NonNullable<MintOptions['onBeforeGenerateToken']>

/** The options POST handed the SDK, so a test can drive `onBeforeGenerateToken` directly. */
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

beforeEach(() => {
  vi.clearAllMocks()
  getUserIdMock.mockResolvedValue(USER_ID)
  handleUploadMock.mockResolvedValue(SDK_RESPONSE as Awaited<ReturnType<typeof handleUpload>>)
})

describe('POST /api/upload — framing', () => {
  it('checks the blob env before it does anything else', async () => {
    await post(shotBody())

    expect(blobEnvMock).toHaveBeenCalledTimes(1)
    expect(blobEnvMock.mock.invocationCallOrder[0]).toBeLessThan(
      handleUploadMock.mock.invocationCallOrder[0]!,
    )
  })

  it('answers a non-JSON body with 400 and never reaches the SDK', async () => {
    const response = await post('not json at all')

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({ error: 'Invalid JSON body' })
    expect(handleUploadMock).not.toHaveBeenCalled()
  })

  it('passes the SDK response straight through', async () => {
    const response = await post(shotBody())

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual(SDK_RESPONSE)
  })
})

describe('the shots branch', () => {
  it('mints a shot token with the shot ceiling and a signed kind', async () => {
    await post(shotBody())

    const before = Date.now()
    const token = await mint(SHOT_PATHNAME, '{"kind":"splits"}')
    const after = Date.now()

    expect(token.allowedContentTypes).toEqual([...ALLOWED_UPLOAD_CONTENT_TYPES])
    expect(token.maximumSizeInBytes).toBe(MAX_UPLOAD_BYTES)
    expect(token.addRandomSuffix).toBe(true)
    expect(token.allowOverwrite).toBe(false)
    expect(token.cacheControlMaxAge).toBe(BLOB_CACHE_MAX_AGE)
    // The TTL window: validUntil is now + UPLOAD_TOKEN_TTL_MS, evaluated between the two stamps.
    expect(token.validUntil).toBeGreaterThanOrEqual(before + UPLOAD_TOKEN_TTL_MS)
    expect(token.validUntil).toBeLessThanOrEqual(after + UPLOAD_TOKEN_TTL_MS)
    // The kind rides in the SIGNED payload so the completion webhook cannot be spoofed.
    expect(JSON.parse(token.tokenPayload ?? '{}')).toEqual({ userId: USER_ID, kind: 'splits' })
  })

  it('accepts every screen kind the schema knows', async () => {
    await post(shotBody())

    for (const kind of SCREEN_KINDS) {
      const token = await mint(SHOT_PATHNAME, JSON.stringify({ kind }))
      expect(JSON.parse(token.tokenPayload ?? '{}')).toMatchObject({ kind })
    }
  })

  it('refuses a kind the client payload schema does not know', async () => {
    await post(shotBody())

    await expect(mint(SHOT_PATHNAME, '{"kind":"other"}')).rejects.toThrow()
  })

  it('refuses a missing client payload on the shots branch', async () => {
    await post(shotBody())

    await expect(mint(SHOT_PATHNAME, '')).rejects.toThrow()
  })

  it('refuses pathnames outside the shot alphabet', async () => {
    await post(shotBody())

    // Prefix, extension, id length and traversal are all the same refusal: the regex is the
    // path-traversal defence, so every escape hatch must be closed.
    await expect(mint('photos/abcdefghijkl.jpg', '{"kind":"summary"}')).rejects.toThrow(
      'Invalid pathname',
    )
    await expect(mint('shots/abcdefghijkl.png', '{"kind":"summary"}')).rejects.toThrow(
      'Invalid pathname',
    )
    await expect(mint('shots/abc.jpg', '{"kind":"summary"}')).rejects.toThrow('Invalid pathname')
    await expect(mint('shots/../../abcdefghijkl.jpg', '{"kind":"summary"}')).rejects.toThrow(
      'Invalid pathname',
    )
    await expect(mint('shots/abcdefghijkl.jpg/extra', '{"kind":"summary"}')).rejects.toThrow(
      'Invalid pathname',
    )
  })
})

describe('the nina-chat branch', () => {
  it('mints a chat token with the chat ceiling and no client payload needed', async () => {
    await post(shotBody(CHAT_PATHNAME))

    const token = await mint(CHAT_PATHNAME, '')

    expect(token.allowedContentTypes).toEqual([...NINA_CHAT_ALLOWED_CONTENT_TYPES])
    expect(token.maximumSizeInBytes).toBe(NINA_CHAT_MAX_UPLOAD_BYTES)
    expect(token.addRandomSuffix).toBe(true)
    expect(token.allowOverwrite).toBe(false)
    expect(token.cacheControlMaxAge).toBe(BLOB_CACHE_MAX_AGE)
    // A chat photo declares nothing: the owner is in the pathname and re-derived from the session.
    expect(JSON.parse(token.tokenPayload ?? '{}')).toEqual({
      userId: USER_ID,
      target: 'nina-chat',
    })
  })

  it('accepts the stored pathname window as well as the requested one', async () => {
    await post(shotBody(CHAT_PATHNAME))

    const stored = `nina/${USER_ID}/chat/abcdefghijkl-abcdefghijklmnop.jpg`
    const token = await mint(stored, '')

    expect(token.maximumSizeInBytes).toBe(NINA_CHAT_MAX_UPLOAD_BYTES)
  })

  it('binds the chat folder to the session user', async () => {
    await post(shotBody(CHAT_PATHNAME))

    // The owner segment names someone else: the chat predicate refuses, the pathname then fails
    // the shots regex too, and the mint is refused. This is the check that stops a signed-in
    // runner from minting a token into ANOTHER user's chat folder.
    const foreign = 'nina/victim123456789/chat/abcdefghijkl.jpg'
    await expect(mint(foreign, '')).rejects.toThrow('Invalid pathname')
  })
})

describe('auth at the mint', () => {
  it('refuses an anonymous caller at token-mint time', async () => {
    getUserIdMock.mockResolvedValue(null)
    await post(shotBody())

    await expect(mint(SHOT_PATHNAME, '{"kind":"summary"}')).rejects.toThrow('Not authenticated')
  })

  it('the route maps a refused mint to a readable 400', async () => {
    // End to end this time: a faithful mini-SDK invokes the callback INSIDE POST, so the
    // throw travels the route's real catch. `getUserId()`, not `requireUserId()`, is the
    // deliberate choice — a 400 the fetch caller can read, not a redirect.
    getUserIdMock.mockResolvedValue(null)
    handleUploadMock.mockImplementationOnce(async (options) => {
      await options.onBeforeGenerateToken?.(SHOT_PATHNAME, '{"kind":"summary"}', false)
      return SDK_RESPONSE as Awaited<ReturnType<typeof handleUpload>>
    })

    const response = await post(shotBody())

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({ error: 'Not authenticated' })
  })
})
