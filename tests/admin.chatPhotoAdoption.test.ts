import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { installFakeDb, projectedRow, uninstallFakeDb, type FakeDb } from './support/fakeDb'
import { clampCrop, NINA_CROP_MAX_ABS_OFFSET } from '@/lib/nina/crop'
import { chatPhotoSetAvatarSchema, type ChatPhotoSetAvatarInput } from '@/lib/admin/chatPhotoSchema'

/**
 * **Chat photo → her profile picture, across the two tables — as a LINK, not a copy.**
 * `media-album-unified-search` R3.
 *
 * `setChatPhotoAsAvatarAction` used to `fetch` the chat photograph and `put` it into a fresh
 * `avatar-` object. That decision is reversed: the album row now points at the SAME Blob object
 * the Media row already names (`sourceImageId`), and carries no prose of its own — the Media row
 * is the one place the description, keywords and embedding live, and every edit made in either
 * place is automatically visible in the other (`lib/nina/queries/avatarPointer.ts`).
 *
 * The properties, in the order they would hurt if they were wrong:
 *
 *   1. **Every guard fires before any row write.** `requireAdmin` first; then the owner-scoped
 *      re-read; then the reference-row refusal (the kind refusal is lifted with the merge — his
 *      uploads are adoptable now).
 *   2. **No `fetch`, no `put`, no second Blob object.** The whole of R3's storage claim.
 *   3. **Re-adoption does not re-link.** The album row carries `source_key =
 *      'chat-photo:<imageId>'`, the same constraint-backed idempotence the folder upload uses: a
 *      second "Set as her profile picture" finds the existing row BEFORE any insert and just
 *      makes it current again.
 *   4. **The crop is clamped server-side against the chat row's real dimensions** — the
 *      `saveNinaAvatarCropAction` guarantee, since the Zod schema can only reject nonsense, not
 *      prove the circle covered.
 *   5. **No description is seeded.** The pointer row's own `description` is never written; only
 *      the MEDIA row's is ever earned, and the scheduler that earns it is `scheduleMediaDescribe`.
 *
 * Posture: the REAL queries run against the recording driver (`tests/nina.chatPhotoAdoption.test.ts`
 *'s stance — generated SQL, not spies), with only the edges mocked: `requireAdmin`, `after()`,
 * `revalidatePath` and the vision/embedding clients. `@vercel/blob`'s `put` and `fetch` are still
 * mocked so this file can assert NEITHER is ever called.
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

const requireAdmin = vi.fn()
const put = vi.fn()
const del = vi.fn()
const fetchMock = vi.fn()
const describeNinaImages = vi.fn()
const embedNinaText = vi.fn()
const revalidatePath = vi.fn()
const afterCallbacks: Array<() => Promise<void>> = []

/** A stand-in vector. Its length is irrelevant to these tests; only its identity is asserted. */
const EMBEDDING = [0.1, 0.2, 0.3]

vi.mock('@vercel/blob', () => ({ put: (...args: unknown[]) => put(...args), del }))
vi.mock('@/lib/admin/requireAdmin', () => ({ requireAdmin: () => requireAdmin() }))
vi.mock('next/server', () => ({
  after: (cb: () => Promise<void>) => {
    afterCallbacks.push(cb)
  },
}))
vi.mock('next/cache', () => ({ revalidatePath: (path: string) => revalidatePath(path) }))
vi.mock('@/lib/nina/vision', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/nina/vision')>()
  return { ...actual, describeNinaImages: (...args: unknown[]) => describeNinaImages(...args) }
})
vi.mock('@/lib/nina/embedding', () => ({
  embedNinaText: (...args: unknown[]) => embedNinaText(...args),
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

/** `imageColumns` in projection order, as an arrayMode row — 14 values. The two keyword columns
 *  Step 1 appended sit past these 14, so this fixture costs nothing from that widening. */
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

/** `avatarColumns` in projection order — 21 values (Step 1 appended `sourceImageId` after
 *  `createdAt`; every positional fixture gains one trailing value). */
function avatarRow(overrides: Record<string, unknown> = {}): unknown[] {
  return projectedRow(
    pick(overrides, 'id', AVATAR_ID),
    pick(overrides, 'blobUrl', sourceUrl),
    pick(overrides, 'pathname', sourcePathname),
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
    pick(overrides, 'description', null),
    pick(overrides, 'searchKeywords', null),
    pick(overrides, 'negativeSearchKeywords', null),
    pick(overrides, 'isCurrent', false),
    pick(overrides, 'announcedAt', null),
    '2026-09-01 09:00:00+00',
    pick(overrides, 'sourceImageId', IMAGE_ID),
  )
}

/** `imageDescribeTargetColumns` in projection order — seven values, the MEDIA deferred worker's
 *  own read (`kind`, the one field the album twin's target shape does not carry). */
function mediaDescribeTargetRow(overrides: Record<string, unknown> = {}): unknown[] {
  return projectedRow(
    pick(overrides, 'id', IMAGE_ID),
    pick(overrides, 'blobUrl', sourceUrl),
    pick(overrides, 'pathname', sourcePathname),
    pick(overrides, 'kind', 'generated'),
    pick(overrides, 'description', SOURCE_DESCRIPTION),
    pick(overrides, 'searchKeywords', null),
    pick(overrides, 'embedded', 0),
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
  put.mockReset()
  del.mockReset()
  fetchMock.mockReset()
  describeNinaImages
    .mockReset()
    .mockResolvedValue({ description: 'fresh prose', completionTokens: 60 })
  embedNinaText.mockReset()
  embedNinaText.mockResolvedValue(EMBEDDING)
  revalidatePath.mockReset()
  fake = installFakeDb()
  actions = await import('@/lib/admin/ninaAlbumActions')
})

afterEach(() => {
  vi.unstubAllGlobals()
  uninstallFakeDb()
  vi.resetModules()
})

/** Queue for the FRESH-LINK path with a non-identity crop: read, sourceKey miss, insert, crop,
 * setCurrent pre-read, then the two batched UPDATEs. */
function enqueueFreshLink(): void {
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

describe('setChatPhotoAsAvatarAction — the fresh link', () => {
  it('links to the Media row’s own bytes — no fetch, no put, no second object', async () => {
    enqueueFreshLink()

    const result = await actions.setChatPhotoAsAvatarAction(FRAMED)

    expect(result).toEqual({ ok: true, id: AVATAR_ID })
    /* R3's whole storage claim: zero vendor calls, zero new Blob objects. */
    expect(fetchMock).not.toHaveBeenCalled()
    expect(put).not.toHaveBeenCalled()

    // The INSERT carries the MEDIA row's own blob_url/pathname verbatim, the link itself, and the
    // album-side defaults — and NOT a copied description.
    const insert = fake.queries.find((query) => query.sql.startsWith('insert into "nina_avatars"'))
    expect(insert).toBeDefined()
    expect(insert?.params).toContain(sourceUrl)
    expect(insert?.params).toContain(sourcePathname)
    expect(insert?.params).toContain('admin')
    expect(insert?.params).toContain(sourceKeyOf(IMAGE_ID))
    expect(insert?.params).toContain(IMAGE_ID) // sourceImageId — the link
    expect(insert?.params).toContain(768)
    expect(insert?.params).toContain(240_000)
    /* Never a copied description: the source row's own prose (`SOURCE_DESCRIPTION`) must not
     * appear among the insert's bound params. */
    expect(insert?.params).not.toContain(SOURCE_DESCRIPTION)
  })

  it("clamps the crop server-side against the chat row's real dimensions", async () => {
    enqueueFreshLink()

    await actions.setChatPhotoAsAvatarAction({ ...FRAMED, x: 5000, y: -5000 })

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
    enqueueFreshLink()

    await actions.setChatPhotoAsAvatarAction(FRAMED)

    // Drizzle parameterises the SET values, so the booleans live in `params`, not in the SQL.
    const batched = fake.queries.filter((query) => query.batched)
    expect(batched).toHaveLength(2)
    expect(batched[0]?.params).toEqual([false, USER, true]) // un-current, WHERE is_current
    expect(batched[1]?.params).toEqual([true, null, USER, AVATAR_ID]) // current + re-arm
  })

  it('revalidates both surfaces the adoption changed', async () => {
    enqueueFreshLink()

    await actions.setChatPhotoAsAvatarAction(FRAMED)

    // One revalidate: the constant and the page route are the same path since the merge.
    expect(revalidatePath).toHaveBeenCalledWith('/admin/nina')
  })

  it('schedules the MEDIA describe, for the IMAGE id — not the album one for the avatar id', async () => {
    enqueueFreshLink()

    await actions.setChatPhotoAsAvatarAction(FRAMED)

    expect(afterCallbacks).toHaveLength(1)
    expect(describeNinaImages).not.toHaveBeenCalled() // not on the action's clock

    // The scheduler re-reads the MEDIA row inside its `after()` — already described, unembedded.
    fake.enqueue([mediaDescribeTargetRow({ description: SOURCE_DESCRIPTION, embedded: 0 })])
    fake.enqueue([{ id: IMAGE_ID }]) // setNinaMessageImageDescriptionAndEmbedding RETURNING
    await afterCallbacks[0]?.()

    expect(describeNinaImages).not.toHaveBeenCalled() // prose already exists
    expect(embedNinaText).toHaveBeenCalledTimes(1)
    expect(embedNinaText).toHaveBeenCalledWith(SOURCE_DESCRIPTION, { userId: USER })
    const update = fake.queries.find((query) => query.sql.startsWith('update "nina_message_images"'))
    expect(update).toBeDefined()
  })

  it('an undescribed source row is described THROUGH THE LINK, against the ORIGINAL object', async () => {
    fake.enqueue([imageRow({ description: null })])
    fake.enqueue([])
    fake.enqueue([avatarRow({ description: null })])
    fake.enqueue([{ id: AVATAR_ID }])
    fake.enqueue([avatarRow({ description: null })])

    await actions.setChatPhotoAsAvatarAction(FRAMED)

    expect(afterCallbacks).toHaveLength(1)
    expect(describeNinaImages).not.toHaveBeenCalled() // not on the action's clock

    fake.enqueue([mediaDescribeTargetRow({ description: null, embedded: 0 })]) // the callback's own re-read
    fake.enqueue([{ id: IMAGE_ID }]) // setNinaMessageImageDescriptionAndEmbedding RETURNING
    await afterCallbacks[0]?.()

    /* The photograph is hers, so the deferred describe carries the self witness —
     * `describeSubjectForSide('hers')` via `photoSideOf('generated')`. And it describes the
     * ORIGINAL object — there is no second object to describe. */
    expect(describeNinaImages).toHaveBeenCalledWith(
      [{ blobUrl: sourceUrl, pathname: sourcePathname }],
      { subject: 'self' },
    )
    expect(
      fake.queries.some(
        (query) => query.sql.startsWith('update "nina_message_images"') && query.sql.includes('"description"'),
      ),
    ).toBe(true)
  })
})

describe('setChatPhotoAsAvatarAction — re-adoption is not a second link', () => {
  it('finds the existing row by source_key and inserts nothing', async () => {
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

describe('setChatPhotoAsAvatarAction — the guards, before any row is written', () => {
  it('gates on requireAdmin before anything else', async () => {
    requireAdmin.mockRejectedValue(new Error('not an admin'))

    await expect(actions.setChatPhotoAsAvatarAction(FRAMED)).rejects.toThrow('not an admin')
    expect(fake.queries).toHaveLength(0)
    expect(put).not.toHaveBeenCalled()
  })

  it('refuses a row that is not in the collection, before any write', async () => {
    fake.enqueue([]) // getNinaMessageImage → null

    const result = await actions.setChatPhotoAsAvatarAction(FRAMED)

    expect(result.ok).toBe(false)
    expect(fake.queries).toHaveLength(1)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('adopts one of HIS uploads — the kind refusal is lifted (R1)', async () => {
    // Same fresh-link sequence as the generated fixture, one column different: kind. The link is
    // kind-blind — nothing reads the side to decide whether to link.
    fake.enqueue([imageRow({ kind: 'upload' })]) // getNinaMessageImage
    fake.enqueue([]) // getNinaAvatarBySourceKey — not adopted yet
    fake.enqueue([avatarRow()]) // insertNinaAvatars RETURNING
    fake.enqueue([{ id: AVATAR_ID }]) // updateNinaAvatarCrop RETURNING
    fake.enqueue([avatarRow()]) // setCurrentNinaAvatar's pre-read

    const result = await actions.setChatPhotoAsAvatarAction(FRAMED)

    expect(result).toEqual({ ok: true, id: AVATAR_ID })
    expect(put).not.toHaveBeenCalled()
    expect(fetchMock).not.toHaveBeenCalled()
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
})
