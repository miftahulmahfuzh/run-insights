import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { installFakeDb, projectedRow, uninstallFakeDb, type FakeDb } from './support/fakeDb'
import { clampCrop, NINA_CROP_MAX_ABS_OFFSET } from '@/lib/nina/crop'
import { chatPhotoSetAvatarSchema, type ChatPhotoSetAvatarInput } from '@/lib/admin/chatPhotoSchema'

/**
 * **Chat photo → her profile picture, across the two tables.**
 *
 * `setChatPhotoAsAvatarAction` is the reverse of F37's share: a `nina_message_images` row becomes
 * a `nina_avatars` row, with its bytes COPIED into a new `avatar-` object rather than shared — the
 * album-side deletes (`deleteNinaAvatarAction`, `reapAvatarBlobs`) call `del` with no reference
 * check, so a shared object would break the chat photo the day the album row went away.
 *
 * The properties, in the order they would hurt if they were wrong:
 *
 *   1. **Every guard fires before any blob call and before any row write.** `requireAdmin` first;
 *      then the owner-scoped re-read; then the `kind = 'generated'` and reference-row refusals —
 *      the same two guards Replace and Remove enforce, because an id for one of HIS uploads or for
 *      a re-share reaches this action exactly as it reaches those.
 *   2. **Re-adoption does not re-copy.** The album row carries `source_key =
 *      'chat-photo:<imageId>'`, the same constraint-backed idempotence the folder upload uses: a
 *      second "Set as her profile picture" finds the existing row BEFORE any bytes move and just
 *      makes it current again. The constraint is the backstop for a race; the lookup is the policy.
 *   3. **The stored refs come from `put`'s return, not from the request.** `addRandomSuffix: true`
 *      rewrites the pathname; a row that recorded the requested form would point at an object that
 *      does not exist.
 *   4. **The crop is clamped server-side against the chat row's real dimensions** — the
 *      `saveNinaAvatarCropAction` guarantee, since the Zod schema can only reject nonsense, not
 *      prove the circle covered.
 *   5. **The description is seeded from the chat row's, and only a NULL earns a vendor call.**
 *      Same bytes the vision model already described; `scheduleDescribe` fills the gap afterwards.
 *
 * Posture: the REAL queries run against the recording driver (`tests/nina.chatPhotoAdoption.test.ts`
 *'s stance — generated SQL, not spies), with only the edges mocked: `@vercel/blob`'s `put`,
 * `fetch`, `requireAdmin`, `after()`, `revalidatePath` and the vision client.
 */

const USER = 'abc123XYZ_-9'
const IMAGE_ID = 'img123XYZ_-9'
const MESSAGE_ID = 'msg123XYZ_-9'
const AVATAR_ID = 'ava123XYZ_-9'
const STORE = 'https://abc123store.public.blob.vercel-storage.com'
const SOURCE_DESCRIPTION = 'A woman underwater in a black swimsuit and fins, mid-kick.'

/** The worker's own selfie shape — `.png` is what `finishSelfie` stores. */
const sourcePathname = `nina/${USER}/selfie-${IMAGE_ID}.png`
const sourceUrl = `${STORE}/${sourcePathname}`

/** What `put` hands back: the requested `avatar-` pathname plus Blob's random suffix. */
const adoptedPathname = `nina/${USER}/avatar-${AVATAR_ID}-yUFwuTN7o1ZNWvKU9FonuesJQKHQcQ.png`
const adoptedUrl = `${STORE}/${adoptedPathname}`

const requireAdmin = vi.fn()
const put = vi.fn()
const del = vi.fn()
const fetchMock = vi.fn()
const describeNinaImages = vi.fn()
const revalidatePath = vi.fn()
const afterCallbacks: Array<() => Promise<void>> = []

vi.mock('@vercel/blob', () => ({ put: (...args: unknown[]) => put(...args), del }))
vi.mock('@/lib/admin/requireAdmin', () => ({ requireAdmin: () => requireAdmin() }))
vi.mock('next/server', () => ({
  after: (cb: () => Promise<void>) => {
    afterCallbacks.push(cb)
  },
}))
vi.mock('next/cache', () => ({ revalidatePath: (path: string) => revalidatePath(path) }))
vi.mock('@/lib/nina/vision', () => ({
  describeNinaImages: (...args: unknown[]) => describeNinaImages(...args),
}))

type Actions = typeof import('@/lib/admin/ninaAlbumActions')
let actions: Actions
let fake: FakeDb

/**
 * An override that can express NULL. `overrides.key ?? fallback` would read a deliberate
 * `{ description: null }` as "no opinion" and substitute the default — which is exactly the bug
 * this fixture once had: the describe-scheduling case tested a DESCRIBED row and passed for the
 * wrong reason. `in` is the only honest test.
 */
function pick<T>(overrides: Record<string, unknown>, key: string, fallback: T): T {
  return (key in overrides ? overrides[key] : fallback) as T
}

/** `imageColumns` in projection order, as an arrayMode row — 14 values. */
function imageRow(overrides: Record<string, unknown> = {}): unknown[] {
  return projectedRow(
    pick(overrides, 'id', IMAGE_ID),
    pick(overrides, 'messageId', MESSAGE_ID),
    pick(overrides, 'kind', 'generated'),
    pick(overrides, 'blobUrl', sourceUrl),
    pick(overrides, 'pathname', sourcePathname),
    pick(overrides, 'width', 768),
    pick(overrides, 'height', 1024),
    pick(overrides, 'bytes', 240_000),
    pick(overrides, 'description', SOURCE_DESCRIPTION),
    pick(overrides, 'prompt', 'a selfie underwater'),
    pick(overrides, 'sourceAvatarId', null),
    pick(overrides, 'sourceImageId', null),
    0,
    '2026-09-01 09:00:00+00',
  )
}

/** `avatarColumns` in projection order — 18 values. */
function avatarRow(overrides: Record<string, unknown> = {}): unknown[] {
  return projectedRow(
    pick(overrides, 'id', AVATAR_ID),
    pick(overrides, 'blobUrl', adoptedUrl),
    pick(overrides, 'pathname', adoptedPathname),
    pick(overrides, 'folder', ''),
    pick(overrides, 'filename', null),
    pick(overrides, 'thumbUrl', null),
    pick(overrides, 'thumbPathname', null),
    pick(overrides, 'width', 768),
    pick(overrides, 'height', 1024),
    pick(overrides, 'bytes', 240_000),
    pick(overrides, 'source', 'admin'),
    pick(overrides, 'cropScale', null),
    pick(overrides, 'cropX', null),
    pick(overrides, 'cropY', null),
    pick(overrides, 'description', SOURCE_DESCRIPTION),
    pick(overrides, 'isCurrent', false),
    pick(overrides, 'announcedAt', null),
    '2026-09-01 09:00:00+00',
  )
}

function sourceKeyOf(imageId: string): string {
  return `chat-photo:${imageId}`
}

/** Drafts the UI sends: the framing panel always knows its whole crop. */
const FRAMED: ChatPhotoSetAvatarInput = { id: IMAGE_ID, scale: 2, x: 120, y: -80 }
const IDENTITY: ChatPhotoSetAvatarInput = { id: IMAGE_ID, scale: 1, x: 0, y: 0 }

beforeEach(async () => {
  afterCallbacks.length = 0
  vi.resetModules()
  vi.stubGlobal('fetch', fetchMock)
  requireAdmin.mockReset().mockResolvedValue({ userId: USER })
  put.mockReset().mockResolvedValue({ url: adoptedUrl, pathname: adoptedPathname })
  del.mockReset()
  fetchMock.mockReset().mockResolvedValue({
    ok: true,
    arrayBuffer: async () => new ArrayBuffer(8),
  })
  describeNinaImages
    .mockReset()
    .mockResolvedValue({ description: 'fresh prose', completionTokens: 60 })
  revalidatePath.mockReset()
  fake = installFakeDb()
  actions = await import('@/lib/admin/ninaAlbumActions')
})

afterEach(() => {
  vi.unstubAllGlobals()
  uninstallFakeDb()
  vi.resetModules()
})

/** Queue for the FRESH-ADOPT path with a non-identity crop: read, sourceKey miss, insert, crop,
 * setCurrent pre-read, then the two batched UPDATEs. */
function enqueueFreshAdopt(): void {
  fake.enqueue([imageRow()]) // getNinaMessageImage
  fake.enqueue([]) // getNinaAvatarBySourceKey — not adopted yet
  fake.enqueue([avatarRow()]) // insertNinaAvatars RETURNING
  fake.enqueue([{ id: AVATAR_ID }]) // updateNinaAvatarCrop RETURNING
  fake.enqueue([avatarRow()]) // setCurrentNinaAvatar's pre-read
  // the db.batch members record but consume no queued rows
}

describe('chatPhotoSetAvatarSchema', () => {
  it('accepts the framed crop the panel always sends', () => {
    expect(chatPhotoSetAvatarSchema.safeParse(FRAMED).success).toBe(true)
    expect(chatPhotoSetAvatarSchema.safeParse(IDENTITY).success).toBe(true)
  })

  it('refuses an id that is not nanoid(12) and offsets outside the crop bounds', () => {
    expect(chatPhotoSetAvatarSchema.safeParse({ ...FRAMED, id: 'short' }).success).toBe(false)
    expect(chatPhotoSetAvatarSchema.safeParse({ ...FRAMED, scale: 5 }).success).toBe(false)
    expect(chatPhotoSetAvatarSchema.safeParse({ ...FRAMED, scale: 0.5 }).success).toBe(false)
    expect(
      chatPhotoSetAvatarSchema.safeParse({ ...FRAMED, x: NINA_CROP_MAX_ABS_OFFSET + 1 }).success,
    ).toBe(false)
    expect(chatPhotoSetAvatarSchema.safeParse({ ...FRAMED, y: 1.5 }).success).toBe(false)
  })
})

describe('setChatPhotoAsAvatarAction — the fresh adoption', () => {
  it('copies the bytes into a new avatar- object and records the STORED refs', async () => {
    enqueueFreshAdopt()

    const result = await actions.setChatPhotoAsAvatarAction(FRAMED)

    expect(result).toEqual({ ok: true, id: AVATAR_ID })
    expect(fetchMock).toHaveBeenCalledWith(sourceUrl)
    expect(put).toHaveBeenCalledTimes(1)
    const [pathname, body, options] = put.mock.calls[0] as unknown as [
      string,
      ArrayBuffer,
      Record<string, unknown>,
    ]
    expect(pathname).toMatch(/^nina\/abc123XYZ_-9\/avatar-[A-Za-z0-9_-]{12}\.png$/)
    expect(body).toBeInstanceOf(ArrayBuffer)
    expect(options).toEqual({
      access: 'public',
      addRandomSuffix: true,
      contentType: 'image/png',
    })

    // The INSERT carries put's RETURN, not the requested pathname, plus the seeded description
    // and the album-side defaults.
    const insert = fake.queries.find((query) => query.sql.startsWith('insert into "nina_avatars"'))
    expect(insert).toBeDefined()
    expect(insert?.params).toContain(adoptedUrl)
    expect(insert?.params).toContain(adoptedPathname)
    expect(insert?.params).toContain('admin')
    expect(insert?.params).toContain(SOURCE_DESCRIPTION)
    expect(insert?.params).toContain(sourceKeyOf(IMAGE_ID))
    expect(insert?.params).toContain(768)
    expect(insert?.params).toContain(240_000)
    expect(insert?.params).toContain(null) // filename, thumbs
  })

  it('derives the container from the SOURCE pathname, not a hard-coded jpg', async () => {
    fake.enqueue([imageRow({ pathname: `nina/${USER}/selfie-${IMAGE_ID}.jpg` })])
    fake.enqueue([])
    fake.enqueue([
      avatarRow({
        blobUrl: adoptedUrl.replace('.png', '.jpg'),
        pathname: adoptedPathname.replace('.png', '.jpg'),
      }),
    ])
    fake.enqueue([{ id: AVATAR_ID }])
    fake.enqueue([avatarRow()])

    await actions.setChatPhotoAsAvatarAction(FRAMED)

    const options = put.mock.calls[0]?.[2] as Record<string, unknown>
    expect(options.contentType).toBe('image/jpeg')
    expect(String(put.mock.calls[0]?.[0])).toMatch(/\.jpg$/)
  })

  it("clamps the crop server-side against the chat row's real dimensions", async () => {
    enqueueFreshAdopt()

    await actions.setChatPhotoAsAvatarAction({ ...FRAMED, x: 5000, y: -5000 })

    // The INSERT's column list also names crop_scale — the match is the UPDATE, not the insert.
    const update = fake.queries.find(
      (query) =>
        query.sql.startsWith('update "nina_avatars"') && query.sql.includes('"crop_scale"'),
    )
    expect(update).toBeDefined()
    const expected = clampCrop({ width: 768, height: 1024 }, { scale: 2, x: 5000, y: -5000 })
    // `numeric(5,3)` binds as a string — the clamp is what is under test, not the column's wire type.
    expect(update?.params.slice(0, 3)).toEqual([String(expected.scale), expected.x, expected.y])
    expect(update?.sql).toContain('"user_id"')
  })

  it('skips the crop UPDATE for an identity draft', async () => {
    fake.enqueue([imageRow()])
    fake.enqueue([])
    fake.enqueue([avatarRow()])
    fake.enqueue([avatarRow()])

    await actions.setChatPhotoAsAvatarAction(IDENTITY)

    expect(
      fake.queries.some(
        (query) =>
          query.sql.startsWith('update "nina_avatars"') && query.sql.includes('"crop_scale"'),
      ),
    ).toBe(false)
  })

  it('un-currents the album then currents the new row, in one batch', async () => {
    enqueueFreshAdopt()

    await actions.setChatPhotoAsAvatarAction(FRAMED)

    // Drizzle parameterises the SET values, so the booleans live in `params`, not in the SQL.
    const batched = fake.queries.filter((query) => query.batched)
    expect(batched).toHaveLength(2)
    expect(batched[0]?.params).toEqual([false, USER, true]) // un-current, WHERE is_current
    expect(batched[1]?.params).toEqual([true, null, USER, AVATAR_ID]) // current + re-arm
  })

  it('revalidates both surfaces the adoption changed', async () => {
    enqueueFreshAdopt()

    await actions.setChatPhotoAsAvatarAction(FRAMED)

    expect(revalidatePath).toHaveBeenCalledWith('/admin/photos')
    expect(revalidatePath).toHaveBeenCalledWith('/admin/nina')
  })

  it('seeds no vendor call when the chat row is already described', async () => {
    enqueueFreshAdopt()

    await actions.setChatPhotoAsAvatarAction(FRAMED)

    expect(afterCallbacks).toHaveLength(0)
    expect(describeNinaImages).not.toHaveBeenCalled()
  })

  it('schedules the describe for an undescribed row, pointing at the NEW object', async () => {
    fake.enqueue([imageRow({ description: null })])
    fake.enqueue([])
    fake.enqueue([avatarRow({ description: null })])
    fake.enqueue([{ id: AVATAR_ID }])
    fake.enqueue([avatarRow({ description: null })])

    await actions.setChatPhotoAsAvatarAction(FRAMED)

    expect(afterCallbacks).toHaveLength(1)
    expect(describeNinaImages).not.toHaveBeenCalled() // not on the action's clock

    fake.enqueue([avatarRow({ description: null })]) // the callback's own re-read
    fake.enqueue([{ id: AVATAR_ID }]) // setNinaAvatarDescription RETURNING
    await afterCallbacks[0]?.()

    expect(describeNinaImages).toHaveBeenCalledWith([
      { blobUrl: adoptedUrl, pathname: adoptedPathname },
    ])
    expect(fake.queries.some((query) => query.sql.includes('set "description"'))).toBe(true)
  })
})

describe('setChatPhotoAsAvatarAction — re-adoption is not a second copy', () => {
  it('finds the existing row by source_key and never touches the store', async () => {
    fake.enqueue([imageRow()]) // getNinaMessageImage
    fake.enqueue([avatarRow()]) // getNinaAvatarBySourceKey — already adopted
    fake.enqueue([{ id: AVATAR_ID }]) // updateNinaAvatarCrop RETURNING
    fake.enqueue([avatarRow()]) // setCurrentNinaAvatar's pre-read

    const result = await actions.setChatPhotoAsAvatarAction({ ...FRAMED, x: 40 })

    expect(result).toEqual({ ok: true, id: AVATAR_ID })
    expect(fetchMock).not.toHaveBeenCalled()
    expect(put).not.toHaveBeenCalled()
    expect(fake.queries.some((query) => query.sql.startsWith('insert into'))).toBe(false)

    const byKey = fake.queries[1]
    expect(byKey?.sql).toContain('from "nina_avatars"')
    expect(byKey?.sql).toContain('"source_key"')
    expect(byKey?.params).toContain(sourceKeyOf(IMAGE_ID))
  })
})

describe('setChatPhotoAsAvatarAction — the guards, before any bytes move', () => {
  it('gates on requireAdmin before anything else', async () => {
    requireAdmin.mockRejectedValue(new Error('not an admin'))

    await expect(actions.setChatPhotoAsAvatarAction(FRAMED)).rejects.toThrow('not an admin')
    expect(fake.queries).toHaveLength(0)
    expect(put).not.toHaveBeenCalled()
  })

  it('refuses a row that is not in the collection, before any blob call', async () => {
    fake.enqueue([]) // getNinaMessageImage → null

    const result = await actions.setChatPhotoAsAvatarAction(FRAMED)

    expect(result.ok).toBe(false)
    expect(fake.queries).toHaveLength(1)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('refuses HIS upload with the same sentence family as Replace', async () => {
    fake.enqueue([imageRow({ kind: 'upload' })])

    const result = await actions.setChatPhotoAsAvatarAction(FRAMED)

    expect(result.ok).toBe(false)
    expect(fake.queries).toHaveLength(1)
    expect(put).not.toHaveBeenCalled()
  })

  it('refuses a reference row — a re-share is not a photograph of its own', async () => {
    fake.enqueue([imageRow({ sourceAvatarId: 'avaOriginal1' })])

    const result = await actions.setChatPhotoAsAvatarAction(FRAMED)

    expect(result.ok).toBe(false)
    expect(fake.queries).toHaveLength(1)
    expect(put).not.toHaveBeenCalled()
  })

  it('refuses a malformed payload without reading anything', async () => {
    const result = await actions.setChatPhotoAsAvatarAction({ id: 'nope', scale: 1, x: 0, y: 0 })

    expect(result.ok).toBe(false)
    expect(fake.queries).toHaveLength(0)
  })

  it('reports a failed copy and writes nothing', async () => {
    fake.enqueue([imageRow()])
    fake.enqueue([])
    fetchMock.mockRejectedValue(new Error('blob store unreachable'))

    const result = await actions.setChatPhotoAsAvatarAction(FRAMED)

    expect(result.ok).toBe(false)
    expect(put).not.toHaveBeenCalled()
    expect(fake.queries.some((query) => query.sql.startsWith('insert into'))).toBe(false)
    expect(revalidatePath).not.toHaveBeenCalled()
  })
})
