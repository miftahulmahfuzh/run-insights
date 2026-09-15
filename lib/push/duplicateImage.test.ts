import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The seam this file guards is the one nothing else can see: the notification's `url` has to be a
 * path `app/photo/[kind]/[id]` actually serves, and the only thing standing between a wrong value
 * and a notification that opens a 404 is this function. `lib/service-worker.js` navigates to
 * whatever string arrives, with no type system and possibly a week-old copy of its own code.
 */
vi.mock('./send', () => ({ notifyNinaPush: vi.fn() }))

const { notifyNinaPush } = await import('./send')
const { DUPLICATE_IMAGE_PUSH_BODY, DUPLICATE_IMAGE_PUSH_KIND, notifyDuplicateImagePush } =
  await import('./duplicateImage')
const { NINA_PUSH_KINDS } = await import('./payload')

const USER = 'user-1'
const ID = 'aB3_xYz01234'
const notify = vi.mocked(notifyNinaPush)

beforeEach(() => {
  vi.resetAllMocks()
})

describe('notifyDuplicateImagePush', () => {
  it('sends /photo/<kind>/<id> as the tap target, for each of the three kinds', async () => {
    for (const kind of ['shot', 'avatar', 'image'] as const) {
      notify.mockClear()
      await notifyDuplicateImagePush(USER, { kind, id: ID })
      expect(notify).toHaveBeenCalledWith(
        USER,
        [{ id: ID, body: DUPLICATE_IMAGE_PUSH_BODY[kind] }],
        'duplicate_image',
        `/photo/${kind}/${ID}`,
      )
    }
  })

  it('NEVER sends the blob URL as the tap target', async () => {
    /* The resolved pointer carries a public Blob URL. Shipping it would take the runner out of
     * the app and onto raw bytes, which is not what R2 asked for. */
    await notifyDuplicateImagePush(USER, {
      kind: 'image',
      id: ID,
      url: 'https://store.public.blob.vercel-storage.com/nina/x.jpg',
    } as never)
    const target = notify.mock.calls[0]?.[3]
    expect(target).toBe(`/photo/image/${ID}`)
    expect(target).not.toContain('blob.vercel-storage.com')
  })

  it('uses a kind that is actually in the vocabulary', async () => {
    expect(NINA_PUSH_KINDS).toContain(DUPLICATE_IMAGE_PUSH_KIND)
    expect(DUPLICATE_IMAGE_PUSH_KIND).toBe('duplicate_image')
  })

  it('writes an Indonesian body that names WHERE the copy already lives, within the cap', async () => {
    const { PUSH_BODY_MAX_CHARS } = await import('./payload')
    expect(DUPLICATE_IMAGE_PUSH_BODY.shot).toContain('galeri lari')
    expect(DUPLICATE_IMAGE_PUSH_BODY.avatar).toContain('album')
    expect(DUPLICATE_IMAGE_PUSH_BODY.image).toContain('chat')
    for (const body of Object.values(DUPLICATE_IMAGE_PUSH_BODY)) {
      expect(body.length).toBeLessThanOrEqual(PUSH_BODY_MAX_CHARS)
    }
  })

  it('adds no catch of its own — a bookkeeping failure propagates to the call site that wraps it', async () => {
    notify.mockRejectedValue(new Error('push service down'))
    await expect(notifyDuplicateImagePush(USER, { kind: 'shot', id: ID })).rejects.toThrow()
    /* Documented deliberately: this helper does NOT add a third catch. `notifyNinaPush` already
     * swallows everything a push can do wrong, and every call site wraps it in its own `try` (the
     * `lib/nina/proactive.ts:702` shape). A rejection reaching here means the bookkeeping itself
     * failed, and phases 3/4's own try/catch is where that is absorbed — one place, not three. */
  })
})
