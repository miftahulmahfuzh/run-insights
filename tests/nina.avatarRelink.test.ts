import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { installFakeDb, projectedRow, uninstallFakeDb, type FakeDb } from './support/fakeDb'
import type { NinaAvatarRow } from '@/lib/nina/queries'
import { clampCrop } from '@/lib/nina/crop'

/**
 * **A re-adoption lands on the Media photo's CURRENT bytes.** `profpic-pointer-sync` Phase 1, R1/R2.
 *
 * The production report: `jWWu8vkl09fT` was replaced (v1 → v2) and then set as her profile
 * picture, and `/nina/about` still showed v1. The `source_key` lookup found `Daofejusg4Xa`, a
 * 2026-09-14 legacy COPY (`source_image_id NULL`, its own `avatar-…` object holding v1), and
 * re-currented it untouched. These tests pin, in the order they would hurt if they were wrong:
 *
 *   1. **A stale hit is rewritten into a pointer at the Media row's current bytes**: url, pathname,
 *      dimensions, size and `source_image_id`. Prose, keywords, embedding, content hash and
 *      thumbnail go NULL. The crop goes NULL only when the dimensions change.
 *   2. **`id`, `folder`, `source_key` and `is_current` are not in the SET.**
 *   3. **Row first, blob second.** Every `del` happens after the relink UPDATE has been issued, and
 *      only for an object no row still names.
 *   4. **A fresh hit is untouched.** No relink UPDATE, no `del`.
 *   5. **A lost race re-reads and releases nothing.**
 */

const USER = 'abc123XYZ_-9'
const IMAGE_ID = 'img123XYZ_-9'
const MESSAGE_ID = 'msg123XYZ_-9'
const AVATAR_ID = 'ava123XYZ_-9'
const STORE = 'https://abc123store.public.blob.vercel-storage.com'

/** v2: what the Media row holds after the Replace. 576×1024, the production row's dimensions. */
const V2_PATHNAME = `nina/${USER}/selfie-V2xxxxxxxxxx-${IMAGE_ID}.jpg`
const V2_URL = `${STORE}/${V2_PATHNAME}`
/** v1: what a stale POINTER still names. Same dimensions as v2. */
const V1_PATHNAME = `nina/${USER}/selfie-V1xxxxxxxxxx-${IMAGE_ID}.jpg`
const V1_URL = `${STORE}/${V1_PATHNAME}`
/** The legacy COPY's own object, minted by the pre-R3 fetch+put. 768×1024. */
const COPY_PATHNAME = `nina/${USER}/avatar-JjBL3efzVE8q-${AVATAR_ID}.jpg`
const COPY_URL = `${STORE}/${COPY_PATHNAME}`
const THUMB_PATHNAME = `nina/${USER}/thumb-${AVATAR_ID}.webp`
const THUMB_URL = `${STORE}/${THUMB_PATHNAME}`

const del = vi.hoisted(() => vi.fn())
const put = vi.hoisted(() => vi.fn())
const requireAdmin = vi.fn()
const revalidatePath = vi.fn()
const afterCallbacks: Array<() => Promise<void>> = []

vi.mock('@vercel/blob', () => ({ put, del }))
vi.mock('@/lib/admin/requireAdmin', () => ({ requireAdmin: () => requireAdmin() }))
vi.mock('next/server', () => ({
  after: (cb: () => Promise<void>) => {
    afterCallbacks.push(cb)
  },
}))
vi.mock('next/cache', () => ({ revalidatePath: (path: string) => revalidatePath(path) }))
vi.mock('@/lib/nina/vision', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/nina/vision')>()
  return { ...actual, describeNinaImages: vi.fn() }
})
vi.mock('@/lib/nina/embedding', () => ({ embedNinaText: vi.fn() }))

let fake: FakeDb
let queries: typeof import('@/lib/nina/queries')
let avatarAdopt: typeof import('@/lib/nina/avatarAdopt')
let actions: typeof import('@/lib/admin/ninaAlbumActions')
/** `fake.queries.length` at the moment of each `del`, so "row first, blob second" is assertable. */
let queriesAtDel: number[]

/** An override that can express NULL — `in`, not `??`. */
function pick<T>(overrides: Record<string, unknown>, key: string, fallback: T): T {
  return (key in overrides ? overrides[key] : fallback) as T
}

/** `imageColumns` in projection order — the first 17 values. Defaults to the v2 Media row. */
function imageRow(overrides: Record<string, unknown> = {}): unknown[] {
  return projectedRow(
    pick(overrides, 'id', IMAGE_ID),
    pick(overrides, 'messageId', MESSAGE_ID),
    pick(overrides, 'kind', 'generated'),
    pick(overrides, 'blobUrl', V2_URL),
    pick(overrides, 'pathname', V2_PATHNAME),
    pick(overrides, 'width', 576),
    pick(overrides, 'height', 1024),
    pick(overrides, 'bytes', 180_000),
    pick(overrides, 'description', null),
    pick(overrides, 'prompt', null),
    pick(overrides, 'sourceAvatarId', null),
    pick(overrides, 'sourceImageId', null),
    pick(overrides, 'contentHash', null),
    pick(overrides, 'perceptualHash', null),
    pick(overrides, 'perceptualSig', null),
    pick(overrides, 'sortOrder', 0),
    pick(overrides, 'createdAt', '2026-09-14 09:00:00+00'),
  )
}

/** `avatarColumns` in projection order — 21 values. Defaults to a FRESH pointer at v2. */
function avatarRow(overrides: Record<string, unknown> = {}): unknown[] {
  return projectedRow(
    pick(overrides, 'id', AVATAR_ID),
    pick(overrides, 'blobUrl', V2_URL),
    pick(overrides, 'pathname', V2_PATHNAME),
    pick(overrides, 'folder', 'faces'),
    pick(overrides, 'filename', null),
    pick(overrides, 'thumbUrl', null),
    pick(overrides, 'thumbPathname', null),
    pick(overrides, 'width', 576),
    pick(overrides, 'height', 1024),
    pick(overrides, 'bytes', 180_000),
    pick(overrides, 'source', 'admin'),
    pick(overrides, 'cropScale', null),
    pick(overrides, 'cropX', null),
    pick(overrides, 'cropY', null),
    pick(overrides, 'description', null),
    pick(overrides, 'searchKeywords', null),
    pick(overrides, 'negativeSearchKeywords', null),
    pick(overrides, 'isCurrent', false),
    pick(overrides, 'announcedAt', null),
    pick(overrides, 'createdAt', '2026-09-14 09:05:00+00'),
    pick(overrides, 'sourceImageId', IMAGE_ID),
  )
}

/** The production shape of `Daofejusg4Xa`: a current legacy copy with prose, a crop and a thumb. */
const LEGACY_COPY = {
  blobUrl: COPY_URL,
  pathname: COPY_PATHNAME,
  thumbUrl: THUMB_URL,
  thumbPathname: THUMB_PATHNAME,
  width: 768,
  height: 1024,
  bytes: 420_000,
  cropScale: '1.500',
  cropX: 40,
  cropY: -20,
  description: 'the copy’s own stale prose',
  searchKeywords: 'pantai',
  negativeSearchKeywords: 'malam',
  isCurrent: true,
  sourceImageId: null,
}

/** A pointer left on v1 by a Replace. Same dimensions as v2, so its crop survives. */
const STALE_POINTER = {
  blobUrl: V1_URL,
  pathname: V1_PATHNAME,
  cropScale: '1.200',
  cropX: 10,
  cropY: 0,
}

/** The same rows as TS objects, for calling the query directly. */
function avatarObject(overrides: Partial<NinaAvatarRow> = {}): NinaAvatarRow {
  return {
    id: AVATAR_ID,
    blobUrl: V2_URL,
    pathname: V2_PATHNAME,
    folder: 'faces',
    filename: null,
    thumbUrl: null,
    thumbPathname: null,
    width: 576,
    height: 1024,
    bytes: 180_000,
    source: 'admin',
    cropScale: null,
    cropX: null,
    cropY: null,
    description: null,
    searchKeywords: null,
    negativeSearchKeywords: null,
    isCurrent: false,
    announcedAt: null,
    createdAt: new Date('2026-09-14T09:05:00Z'),
    sourceImageId: IMAGE_ID,
    ...overrides,
  }
}

const MEDIA_V2 = {
  id: IMAGE_ID,
  blobUrl: V2_URL,
  pathname: V2_PATHNAME,
  width: 576,
  height: 1024,
  bytes: 180_000,
}

function relinkStatement() {
  return fake.queries.find(
    (query) =>
      query.sql.startsWith('update "nina_avatars"') && query.sql.includes('"source_image_id" = $'),
  )
}

function setClauseOf(sql: string): string {
  return sql.slice(sql.indexOf(' set '), sql.indexOf(' where '))
}

beforeEach(async () => {
  afterCallbacks.length = 0
  queriesAtDel = []
  vi.resetModules()
  del.mockReset().mockImplementation(async () => {
    queriesAtDel.push(fake.queries.length)
    return {}
  })
  put.mockReset()
  requireAdmin.mockReset().mockResolvedValue({ userId: USER })
  revalidatePath.mockReset()
  fake = installFakeDb()
  queries = await import('@/lib/nina/queries')
  avatarAdopt = await import('@/lib/nina/avatarAdopt')
  actions = await import('@/lib/admin/ninaAlbumActions')
})

afterEach(() => {
  uninstallFakeDb()
  vi.resetModules()
})

describe('relinkNinaAvatarToImage — the statement', () => {
  it('rewrites a legacy copy into a pointer at the Media row’s current bytes', async () => {
    fake.enqueue([avatarRow({ isCurrent: true })]) // RETURNING

    const legacy = avatarObject({
      ...LEGACY_COPY,
      cropScale: 1.5,
      createdAt: new Date('2026-09-14T09:05:00Z'),
    })
    const result = await queries.relinkNinaAvatarToImage(USER, legacy, MEDIA_V2)

    const update = fake.only()
    expect(update.sql.startsWith('update "nina_avatars"')).toBe(true)
    const set = setClauseOf(update.sql)
    for (const column of [
      '"blob_url" = $',
      '"pathname" = $',
      '"width" = $',
      '"height" = $',
      '"bytes" = $',
      '"source_image_id" = $',
      '"description" = $',
      '"search_keywords" = $',
      '"negative_search_keywords" = $',
      '"description_embedding" = $',
      '"content_hash" = $',
      '"thumb_url" = $',
      '"thumb_pathname" = $',
      // 768×1024 → 576×1024: the old crop may not cover the circle any more.
      '"crop_scale" = $',
      '"crop_x" = $',
      '"crop_y" = $',
    ]) {
      expect(set).toContain(column)
    }
    // Invariant 6: the row is the same album entry, in the same place, still current.
    for (const kept of ['"id"', '"folder"', '"source_key"', '"is_current"', '"announced_at"']) {
      expect(set).not.toContain(kept)
    }
    expect(update.params).toEqual(
      expect.arrayContaining([V2_URL, V2_PATHNAME, IMAGE_ID, 576, 1024, 180_000]),
    )
    // The WHERE pins what the caller read: owner, id, old pathname, old thumbnail.
    expect(update.params).toEqual(
      expect.arrayContaining([USER, AVATAR_ID, COPY_PATHNAME, THUMB_URL, THUMB_PATHNAME]),
    )
    expect(update.params).not.toContain(LEGACY_COPY.description)
    expect(update.sql).toContain('returning')

    expect(result?.row.id).toBe(AVATAR_ID)
    expect(result?.droppedOriginal).toEqual({ blobUrl: COPY_URL, pathname: COPY_PATHNAME })
    expect(result?.droppedThumb).toEqual({ blobUrl: THUMB_URL, pathname: THUMB_PATHNAME })
  })

  it('keeps the crop when the dimensions are unchanged, and drops no thumbnail it never had', async () => {
    fake.enqueue([avatarRow({ cropScale: '1.200', cropX: 10, cropY: 0 })])

    const stale = avatarObject({ ...STALE_POINTER, cropScale: 1.2 })
    const result = await queries.relinkNinaAvatarToImage(USER, stale, MEDIA_V2)

    const update = fake.only()
    expect(setClauseOf(update.sql)).not.toContain('"crop_')
    expect(update.sql).toContain('"thumb_url" is null')
    expect(update.sql).toContain('"thumb_pathname" is null')
    expect(result?.droppedOriginal).toEqual({ blobUrl: V1_URL, pathname: V1_PATHNAME })
    expect(result?.droppedThumb).toBeNull()
  })

  it('reports no dropped original when the old pathname already IS the Media row’s', async () => {
    fake.enqueue([avatarRow()])

    const sameObjectCopy = avatarObject({ sourceImageId: null })
    const result = await queries.relinkNinaAvatarToImage(USER, sameObjectCopy, MEDIA_V2)

    expect(result?.droppedOriginal).toBeNull()
    expect(result?.droppedThumb).toBeNull()
  })

  it('answers null when the WHERE pin misses (another writer won, or not yours)', async () => {
    fake.enqueue([])

    const result = await queries.relinkNinaAvatarToImage(
      USER,
      avatarObject({ ...STALE_POINTER, cropScale: 1.2 }),
      MEDIA_V2,
    )

    expect(result).toBeNull()
  })
})

describe('adoptNinaChatPhotoAsAvatar — a stale hit is refreshed before it is promoted', () => {
  it('relinks the current legacy copy to v2, releases the copy and its thumbnail, reports changed', async () => {
    fake.enqueue([imageRow()]) // getNinaMessageImage — v2
    fake.enqueue([avatarRow(LEGACY_COPY)]) // getNinaAvatarBySourceKey — the 2026-09-14 copy
    fake.enqueue([avatarRow({ isCurrent: true })]) // relink RETURNING — now a v2 pointer
    fake.enqueue([], []) // isBlobPathnameReferenced(copy) — nothing names it
    fake.enqueue([], []) // isBlobPathnameReferenced(thumb) — nothing names it
    fake.enqueue([avatarRow({ isCurrent: true })]) // setCurrentNinaAvatar's pre-read → idempotent

    const result = await avatarAdopt.adoptNinaChatPhotoAsAvatar(USER, IMAGE_ID)

    // Already current, but her face just changed — she must not say "it already was".
    expect(result).toEqual({ ok: true, avatarId: AVATAR_ID, changed: true })

    const relink = relinkStatement()
    expect(relink).toBeDefined()
    expect(relink?.params).toEqual(expect.arrayContaining([V2_URL, V2_PATHNAME, IMAGE_ID]))
    expect(fake.queries.some((query) => query.sql.startsWith('insert into'))).toBe(false)

    expect(del).toHaveBeenCalledTimes(2)
    expect(del).toHaveBeenNthCalledWith(1, COPY_URL)
    expect(del).toHaveBeenNthCalledWith(2, THUMB_URL)
    // Row first, blob second.
    const relinkIndex = fake.queries.indexOf(relink!)
    for (const seen of queriesAtDel) expect(seen).toBeGreaterThan(relinkIndex)
    expect(put).not.toHaveBeenCalled()
  })

  it('refreshes a stale pointer but KEEPS v1 while another row still names it', async () => {
    fake.enqueue([imageRow()])
    fake.enqueue([avatarRow(STALE_POINTER)])
    fake.enqueue([avatarRow({ cropScale: '1.200', cropX: 10, cropY: 0 })]) // relink RETURNING
    fake.enqueue([{ id: 'refRow000001' }], []) // a stale chat reference still names v1 → 'shared'
    fake.enqueue([avatarRow()]) // setCurrentNinaAvatar's pre-read — not current yet

    const result = await avatarAdopt.adoptNinaChatPhotoAsAvatar(USER, IMAGE_ID)

    expect(result).toEqual({ ok: true, avatarId: AVATAR_ID, changed: true })
    expect(setClauseOf(relinkStatement()!.sql)).not.toContain('"crop_')
    expect(del).not.toHaveBeenCalled()
  })

  it('leaves a fresh pointer untouched: no relink, no release', async () => {
    fake.enqueue([imageRow()])
    fake.enqueue([avatarRow({ isCurrent: true })])
    fake.enqueue([avatarRow({ isCurrent: true })])

    const result = await avatarAdopt.adoptNinaChatPhotoAsAvatar(USER, IMAGE_ID)

    expect(result).toEqual({ ok: true, avatarId: AVATAR_ID, changed: false })
    expect(relinkStatement()).toBeUndefined()
    expect(del).not.toHaveBeenCalled()
  })

  it('a lost relink race re-reads by key and releases nothing', async () => {
    fake.enqueue([imageRow()])
    fake.enqueue([avatarRow(LEGACY_COPY)])
    fake.enqueue([]) // relink RETURNING — the WHERE pin missed
    fake.enqueue([avatarRow({ isCurrent: true })]) // the re-read: the winner's v2 pointer
    fake.enqueue([avatarRow({ isCurrent: true })]) // setCurrentNinaAvatar's pre-read

    const result = await avatarAdopt.adoptNinaChatPhotoAsAvatar(USER, IMAGE_ID)

    expect(result).toEqual({ ok: true, avatarId: AVATAR_ID, changed: true })
    expect(del).not.toHaveBeenCalled()
    const reread = fake.queries[3]
    expect(reread?.sql).toContain('"source_key"')
    expect(reread?.params).toContain(`chat-photo:${IMAGE_ID}`)
  })
})

describe('setChatPhotoAsAvatarAction — a stale hit is refreshed before crop and current', () => {
  it('relinks the legacy copy, releases both objects, then writes the crop clamped to v2', async () => {
    fake.enqueue([imageRow()]) // getNinaMessageImage — v2, 576×1024
    fake.enqueue([avatarRow(LEGACY_COPY)]) // getNinaAvatarBySourceKey — the copy
    fake.enqueue([avatarRow({ isCurrent: true })]) // relink RETURNING
    fake.enqueue([], []) // release copy
    fake.enqueue([], []) // release thumb
    fake.enqueue([{ id: AVATAR_ID }]) // updateNinaAvatarCrop RETURNING
    fake.enqueue([avatarRow({ isCurrent: true })]) // setCurrentNinaAvatar's pre-read

    const result = await actions.setChatPhotoAsAvatarAction({
      id: IMAGE_ID,
      scale: 2,
      x: 120,
      y: -80,
    })

    expect(result).toEqual({ ok: true, id: AVATAR_ID })
    expect(put).not.toHaveBeenCalled()
    expect(fake.queries.some((query) => query.sql.startsWith('insert into'))).toBe(false)

    const relink = relinkStatement()
    expect(relink).toBeDefined()
    expect(setClauseOf(relink!.sql)).toContain('"crop_scale" = $') // 768×1024 → 576×1024

    const cropWrite = fake.queries.find((query) =>
      query.sql.startsWith('update "nina_avatars" set "crop_scale"'),
    )
    expect(cropWrite).toBeDefined()
    expect(fake.queries.indexOf(cropWrite!)).toBeGreaterThan(fake.queries.indexOf(relink!))
    const expected = clampCrop({ width: 576, height: 1024 }, { scale: 2, x: 120, y: -80 })
    expect(cropWrite?.params.slice(0, 3)).toEqual([String(expected.scale), expected.x, expected.y])

    expect(del).toHaveBeenCalledTimes(2)
    expect(del).toHaveBeenCalledWith(COPY_URL)
    expect(del).toHaveBeenCalledWith(THUMB_URL)
    for (const seen of queriesAtDel) {
      expect(seen).toBeGreaterThan(fake.queries.indexOf(relink!))
    }
  })

  it('refreshes a stale pointer on an identity draft without touching its crop', async () => {
    fake.enqueue([imageRow()])
    fake.enqueue([avatarRow(STALE_POINTER)])
    fake.enqueue([avatarRow({ cropScale: '1.200', cropX: 10, cropY: 0 })]) // relink RETURNING
    fake.enqueue([], []) // release v1 — nothing else names it
    fake.enqueue([avatarRow()]) // setCurrentNinaAvatar's pre-read

    const result = await actions.setChatPhotoAsAvatarAction({ id: IMAGE_ID, scale: 1, x: 0, y: 0 })

    expect(result).toEqual({ ok: true, id: AVATAR_ID })
    expect(setClauseOf(relinkStatement()!.sql)).not.toContain('"crop_')
    expect(
      fake.queries.some((query) => query.sql.startsWith('update "nina_avatars" set "crop_scale"')),
    ).toBe(false)
    expect(del).toHaveBeenCalledTimes(1)
    expect(del).toHaveBeenCalledWith(V1_URL)
  })
})
