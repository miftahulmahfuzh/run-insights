import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { installFakeDb, projectedRow, uninstallFakeDb, type FakeDb } from './support/fakeDb'
import { NINA_ADMIN_MANIFEST_MAX } from '@/lib/nina/album'

/**
 * **The five album actions nothing had ever executed** — the 2026-09-11 follow-up three
 * token-maxxing sessions flagged and none picked up.
 *
 * `tests/admin.folderActions.test.ts` runs the six folder actions and
 * `tests/admin.chatPhotoAdoption.test.ts` runs the adoption; the five below had only STRUCTURAL
 * coverage (export lists, `requireAdmin` counts — `tests/admin.shortcuts.test.ts`'s technique) and
 * mock-only cameos in component tests. Five real, side-effecting boundaries a signed-in stranger
 * could POST at, whose runtime behaviour no test had ever observed:
 *
 *   - `describeNinaAvatarAction`      — the vendor call, the write, the R3 overwrite semantics
 *   - `setCurrentNinaAvatarAction`    — "set as her profile photo", plus the deferred describe
 *   - `ensureNinaAvatarDescriptionAction` — share-to-Nina's pre-pass, fast path and slow path
 *   - `registerNinaAvatarsAction`     — the folder-upload batch register, dedupe and promotion
 *   - `listNinaAlbumManifestAction`   — the pre-drop manifest, and its deliberate `>=` truncation
 *
 * Posture is `admin.chatPhotoAdoption.test.ts`'s: the REAL query functions run against the
 * recording driver (`tests/support/fakeDb.ts` — generated SQL, not spies), with only the edges
 * mocked: `requireAdmin`, `@vercel/blob`, `next/server`'s `after`, `next/cache`'s `revalidatePath`
 * and the vision client. Every guard is asserted to fire BEFORE the first statement, because
 * `proxy.ts` matches neither `/admin` nor `/api/*` (`lib/admin/requireAdmin.ts`'s header) — the
 * `requireAdmin()` line is the whole authorization, and a refactor that moves it after the read
 * must fail here and not in production.
 */

const USER = 'abc123XYZ_-9'
const ID = 'ava123XYZ_-9'
const STORE = 'https://abc123store.public.blob.vercel-storage.com'
const PATHNAME = `nina/${USER}/avatar-${ID}-Tu6HvWq2m0k3rB8nQ1zXeRfYdGjL.jpg`
const BLOB_URL = `${STORE}/${PATHNAME}`
const THUMB_PATHNAME = `nina/${USER}/thumb-${ID}-Tu6HvWq2m0k3rB8nQ1zXeRfYdGjL.webp`
const THUMB_URL = `${STORE}/${THUMB_PATHNAME}`
const DESCRIPTION = 'A woman in a black swimsuit fins-deep in a pool, mid-lap.'

const requireAdmin = vi.fn()
const del = vi.fn()
const put = vi.fn()
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
 * The `avatarColumns` projection in order — 18 values, the same discipline as
 * `admin.chatPhotoAdoption.test.ts`'s `pick()`: `overrides.key ?? fallback` would read a
 * deliberate `{ description: null }` as "no opinion", which is exactly the bug that once made a
 * describe test pass for the wrong reason. `in` is the only honest test.
 */
function avatarRow(overrides: Record<string, unknown> = {}): unknown[] {
  return projectedRow(
    'id' in overrides ? overrides.id : ID,
    'blobUrl' in overrides ? overrides.blobUrl : BLOB_URL,
    'pathname' in overrides ? overrides.pathname : PATHNAME,
    'folder' in overrides ? overrides.folder : '',
    'filename' in overrides ? overrides.filename : 'pool-laps.jpg',
    'thumbUrl' in overrides ? overrides.thumbUrl : THUMB_URL,
    'thumbPathname' in overrides ? overrides.thumbPathname : THUMB_PATHNAME,
    'width' in overrides ? overrides.width : 1792,
    'height' in overrides ? overrides.height : 2400,
    'bytes' in overrides ? overrides.bytes : 1_500_000,
    'source' in overrides ? overrides.source : 'admin',
    'cropScale' in overrides ? overrides.cropScale : null,
    'cropX' in overrides ? overrides.cropX : null,
    'cropY' in overrides ? overrides.cropY : null,
    'description' in overrides ? overrides.description : null,
    'isCurrent' in overrides ? overrides.isCurrent : false,
    'announcedAt' in overrides ? overrides.announcedAt : null,
    '2026-09-01 09:00:00+00',
  )
}

/** The manifest projection: `{ id, folder, sourceKey }`, as an arrayMode row in key order. */
function manifestRow(overrides: Record<string, unknown> = {}): unknown[] {
  return projectedRow(
    'id' in overrides ? overrides.id : ID,
    'folder' in overrides ? overrides.folder : 'Pictures/2026',
    'sourceKey' in overrides ? overrides.sourceKey : 'v1|2481003|1723881072|pics.jpg',
  )
}

beforeEach(async () => {
  afterCallbacks.length = 0
  vi.resetModules()
  vi.stubGlobal('fetch', fetchMock)
  requireAdmin.mockReset().mockResolvedValue({ userId: USER, email: 'ops@example.com' })
  put.mockReset()
  del.mockReset()
  fetchMock.mockReset()
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

/* ── describeNinaAvatarAction — the vendor call, the write, and the overwrite ──────────────── */

describe('describeNinaAvatarAction', () => {
  it('describes with the SELF subject, stamps the row, and revalidates the album', async () => {
    fake.enqueue([avatarRow()]) // getNinaAvatar
    fake.enqueue([{ id: ID }]) // setNinaAvatarDescription RETURNING

    const result = await actions.describeNinaAvatarAction(ID)

    expect(result).toEqual({ ok: true, description: 'fresh prose' })
    // R3's subject rule: every `nina_avatars` row is a photograph of HERS, so the prompt is the
    // self witness — `describeSubjectForSide('hers')` — and never the runner default this action
    // originally shipped with.
    expect(describeNinaImages).toHaveBeenCalledTimes(1)
    expect(describeNinaImages).toHaveBeenCalledWith([{ blobUrl: BLOB_URL, pathname: PATHNAME }], {
      subject: 'self',
    })
    const update = fake.last()
    expect(update.sql).toContain('update "nina_avatars"')
    expect(update.sql).toContain('"description"')
    expect(update.params).toEqual(['fresh prose', USER, ID])
    expect(revalidatePath).toHaveBeenCalledTimes(1)
    expect(revalidatePath).toHaveBeenCalledWith('/admin/nina')
    expect(afterCallbacks).toHaveLength(0) // the prose is in-band; nothing is deferred
  })

  it('overwrites a hand-written description — the R3 button re-earns the prose', async () => {
    fake.enqueue([avatarRow({ description: 'the human wrote this' })])
    fake.enqueue([{ id: ID }])

    const result = await actions.describeNinaAvatarAction(ID)

    expect(result).toEqual({ ok: true, description: 'fresh prose' })
    expect(describeNinaImages).toHaveBeenCalledTimes(1)
    expect(fake.last().params).toEqual(['fresh prose', USER, ID])
  })

  it('refuses a malformed id before reading anything', async () => {
    const result = await actions.describeNinaAvatarAction('short')

    expect(result).toEqual({ ok: false, error: 'Not an avatar id.' })
    expect(fake.queries).toHaveLength(0)
    expect(describeNinaImages).not.toHaveBeenCalled()
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('refuses a photo that is not in the album, after exactly one owner-scoped read', async () => {
    fake.enqueue([]) // getNinaAvatar → null

    const result = await actions.describeNinaAvatarAction(ID)

    expect(result).toEqual({ ok: false, error: 'That photo is not in the album.' })
    expect(fake.queries).toHaveLength(1)
    expect(fake.only().sql).toContain('from "nina_avatars"')
    expect(fake.only().params).toContain(USER)
    expect(fake.only().params).toContain(ID)
    expect(describeNinaImages).not.toHaveBeenCalled()
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('contains a vendor failure: no write, no revalidate, one retryable sentence', async () => {
    fake.enqueue([avatarRow()])
    describeNinaImages.mockRejectedValue(new Error('glm-4.6v overloaded'))

    const result = await actions.describeNinaAvatarAction(ID)

    expect(result).toEqual({ ok: false, error: 'The description call failed. Try again.' })
    expect(fake.queries).toHaveLength(1) // the read only; the UPDATE never ran
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('gates on requireAdmin before any statement', async () => {
    requireAdmin.mockRejectedValue(new Error('not an admin'))

    await expect(actions.describeNinaAvatarAction(ID)).rejects.toThrow('not an admin')
    expect(fake.queries).toHaveLength(0)
  })
})

/* ── setCurrentNinaAvatarAction — the crown, plus the deferred describe ────────────────────── */

describe('setCurrentNinaAvatarAction', () => {
  /** The pre-read plus the two batched UPDATEs `setCurrentNinaAvatar` always is. */
  function enqueuePromote(): void {
    fake.enqueue([avatarRow({ isCurrent: false })]) // setCurrentNinaAvatar's pre-read
    // the two batch members record but need no queued rows
  }

  it('un-currents the old face and currents the new one in one batch, then revalidates', async () => {
    enqueuePromote()

    const result = await actions.setCurrentNinaAvatarAction(ID)

    expect(result).toEqual({ ok: true })
    expect(fake.queries).toHaveLength(3) // pre-read + 2 batch members
    const batched = fake.queries.filter((query) => query.batched)
    expect(batched).toHaveLength(2)
    // Drizzle parameterises the SET values, so the booleans live in `params`. Statement order is
    // load-bearing against the partial unique index: un-current EVERYWHERE first, then current.
    expect(batched[0]?.sql).toContain('update "nina_avatars"')
    expect(batched[0]?.params).toEqual([false, USER, true])
    expect(batched[1]?.params).toEqual([true, null, USER, ID]) // `announced_at` re-armed → RU-17
    expect(revalidatePath).toHaveBeenCalledWith('/admin/nina')
  })

  it('schedules a deferred describe, which pays the vendor only for a NULL description', async () => {
    enqueuePromote()

    await actions.setCurrentNinaAvatarAction(ID)
    expect(afterCallbacks).toHaveLength(1)
    expect(describeNinaImages).not.toHaveBeenCalled() // not on the action's clock

    fake.enqueue([avatarRow({ description: null })]) // the callback's own re-read
    fake.enqueue([{ id: ID }]) // setNinaAvatarDescription RETURNING
    await afterCallbacks[0]?.()

    expect(describeNinaImages).toHaveBeenCalledTimes(1)
    expect(describeNinaImages).toHaveBeenCalledWith([{ blobUrl: BLOB_URL, pathname: PATHNAME }], {
      subject: 'self',
    })
    expect(fake.last().sql).toContain('update "nina_avatars"')
    expect(fake.last().params).toEqual(['fresh prose', USER, ID])
  })

  it('promoting an already-described photo costs one indexed read and no vendor call', async () => {
    enqueuePromote()
    fake.enqueue([avatarRow({ description: 'already hers', isCurrent: false })])

    await actions.setCurrentNinaAvatarAction(ID)
    await afterCallbacks[0]?.()

    expect(describeNinaImages).not.toHaveBeenCalled()
  })

  it('is idempotent when the row is already current: no un-currenting, no re-arm', async () => {
    fake.enqueue([avatarRow({ isCurrent: true, description: 'already hers' })])

    const result = await actions.setCurrentNinaAvatarAction(ID)

    expect(result).toEqual({ ok: true })
    expect(fake.batches).toHaveLength(0) // `setCurrentNinaAvatar` returned before the batch
    expect(fake.queries).toHaveLength(1) // the pre-read only
    expect(revalidatePath).toHaveBeenCalledWith('/admin/nina')

    // The describe pre-pass still arms — and immediately no-ops on a described row.
    expect(afterCallbacks).toHaveLength(1)
    fake.enqueue([avatarRow({ isCurrent: true, description: 'already hers' })])
    await afterCallbacks[0]?.()
    expect(describeNinaImages).not.toHaveBeenCalled()
  })

  it('refuses an id that is not in the album, before any write and without arming the describe', async () => {
    fake.enqueue([]) // setCurrentNinaAvatar's pre-read → null

    const result = await actions.setCurrentNinaAvatarAction(ID)

    expect(result).toEqual({ ok: false, error: 'That photo is not in the album.' })
    expect(fake.batches).toHaveLength(0)
    expect(revalidatePath).not.toHaveBeenCalled()
    expect(afterCallbacks).toHaveLength(0)
  })

  it('refuses a malformed id without reading anything', async () => {
    const result = await actions.setCurrentNinaAvatarAction('nope-nope-nope')

    expect(result).toEqual({ ok: false, error: 'Not an avatar id.' })
    expect(fake.queries).toHaveLength(0)
  })

  it('gates on requireAdmin before any statement', async () => {
    requireAdmin.mockRejectedValue(new Error('not an admin'))

    await expect(actions.setCurrentNinaAvatarAction(ID)).rejects.toThrow('not an admin')
    expect(fake.queries).toHaveLength(0)
  })
})

/* ── ensureNinaAvatarDescriptionAction — share-to-Nina's describe pre-pass ─────────────────── */

describe('ensureNinaAvatarDescriptionAction', () => {
  it('returns the stored prose in band after ONE read — the fast path pays no vendor', async () => {
    fake.enqueue([avatarRow({ description: DESCRIPTION })])

    const result = await actions.ensureNinaAvatarDescriptionAction(ID)

    expect(result).toEqual({ ok: true, id: ID, description: DESCRIPTION })
    expect(fake.queries).toHaveLength(1)
    expect(describeNinaImages).not.toHaveBeenCalled()
    expect(revalidatePath).not.toHaveBeenCalled() // the deferred variant has nothing to re-render
    expect(afterCallbacks).toHaveLength(0)
  })

  it('delegates to the describe action for a NULL description, and returns the fresh prose', async () => {
    fake.enqueue([avatarRow({ description: null })]) // ensure's own read
    fake.enqueue([avatarRow({ description: null })]) // describeNinaAvatarAction's re-read
    fake.enqueue([{ id: ID }]) // setNinaAvatarDescription RETURNING

    const result = await actions.ensureNinaAvatarDescriptionAction(ID)

    expect(result).toEqual({ ok: true, description: 'fresh prose' })
    expect(describeNinaImages).toHaveBeenCalledTimes(1)
    expect(describeNinaImages).toHaveBeenCalledWith([{ blobUrl: BLOB_URL, pathname: PATHNAME }], {
      subject: 'self',
    })
    expect(revalidatePath).toHaveBeenCalledWith('/admin/nina')
  })

  it('mirrors the describe refusals: malformed id reads nothing', async () => {
    const result = await actions.ensureNinaAvatarDescriptionAction('way-too-long-for-an-id')

    expect(result).toEqual({ ok: false, error: 'Not an avatar id.' })
    expect(fake.queries).toHaveLength(0)
    expect(describeNinaImages).not.toHaveBeenCalled()
  })

  it('mirrors the describe refusals: an absent photo reads exactly once', async () => {
    fake.enqueue([]) // ensure's read → null; the delegation never happens

    const result = await actions.ensureNinaAvatarDescriptionAction(ID)

    expect(result).toEqual({ ok: false, error: 'That photo is not in the album.' })
    expect(fake.queries).toHaveLength(1)
  })

  it('gates on requireAdmin before any statement', async () => {
    requireAdmin.mockRejectedValue(new Error('not an admin'))

    await expect(actions.ensureNinaAvatarDescriptionAction(ID)).rejects.toThrow('not an admin')
    expect(fake.queries).toHaveLength(0)
  })
})

/* ── registerNinaAvatarsAction — the folder-upload batch register ──────────────────────────── */

/** The record phase 5's planner sends per uploaded file, bounded by `avatarBatchRegisterSchema`. */
function batchRecord(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const id = ('id' in overrides ? overrides.id : ID) as string
  const folder = ('folder' in overrides ? overrides.folder : 'Pictures/2026') as string
  const leaf = folder === '' ? '' : `${folder}/`
  return {
    folder,
    filename: 'IMG_20240817_101112.jpg',
    sourceKey: `v1|2481003|1723881072|${leaf}img_20240817_101112.jpg`,
    blobUrl: BLOB_URL,
    pathname: `nina/${USER}/avatar-${id}-Tu6HvWq2m0k3rB8nQ1zXeRfYdGjL.jpg`,
    contentType: 'image/jpeg',
    width: 1792,
    height: 2400,
    bytes: 2_481_003,
    thumb: {
      url: THUMB_URL,
      pathname: THUMB_PATHNAME,
    },
    ...overrides,
  }
}

describe('registerNinaAvatarsAction', () => {
  it('inserts the batch and reports exactly the inserted rows, keyed by the client sent key', async () => {
    fake.enqueue([avatarRow()]) // getCurrentNinaAvatar — a current face already exists
    fake.enqueue([{ folder: 'Pictures/2026' }]) // declareNinaFolders RETURNING
    fake.enqueue([avatarRow()]) // insertNinaAvatars RETURNING

    const result = await actions.registerNinaAvatarsAction({ records: [batchRecord()] })

    expect(result.ok).toBe(true)
    expect(result.inserted).toEqual([
      {
        sourceKey: 'v1|2481003|1723881072|Pictures/2026/img_20240817_101112.jpg',
        id: ID,
      },
    ])
    expect(result.skipped).toBe(0)
    expect(revalidatePath).toHaveBeenCalledWith('/admin/nina')
    expect(afterCallbacks).toHaveLength(0) // a face already wears the crown; no promotion
  })

  it('writes the admin source, the folder, the dedupe key and the thumbnail pair', async () => {
    fake.enqueue([avatarRow()])
    fake.enqueue([{ folder: 'Pictures/2026' }])
    fake.enqueue([avatarRow()])

    await actions.registerNinaAvatarsAction({ records: [batchRecord()] })

    const insert = fake.queries.find((query) => query.sql.startsWith('insert into "nina_avatars"'))
    expect(insert).toBeDefined()
    expect(insert?.params).toContain('admin')
    expect(insert?.params).toContain('Pictures/2026')
    expect(insert?.params).toContain('v1|2481003|1723881072|Pictures/2026/img_20240817_101112.jpg')
    expect(insert?.params).toContain(THUMB_URL)
    expect(insert?.params).toContain(THUMB_PATHNAME)
    expect(insert?.sql).toContain('on conflict')
  })

  it('declares the dropped folder in nina_folders BEFORE the insert', async () => {
    fake.enqueue([avatarRow()])
    fake.enqueue([{ folder: 'Pictures/2026' }])
    fake.enqueue([avatarRow()])

    await actions.registerNinaAvatarsAction({ records: [batchRecord()] })

    const declare = fake.queries.find((query) => query.sql.startsWith('insert into "nina_folders"'))
    const insert = fake.queries.find((query) => query.sql.startsWith('insert into "nina_avatars"'))
    expect(declare).toBeDefined()
    expect(insert).toBeDefined()
    expect(fake.queries.indexOf(declare!)).toBeLessThan(fake.queries.indexOf(insert!))
    expect(declare?.params).toEqual([USER, 'Pictures/2026'])
  })

  it('declares nothing for a root-level batch — the folder filter makes it a no-op, not a statement', async () => {
    fake.enqueue([avatarRow()]) // getCurrentNinaAvatar
    fake.enqueue([avatarRow()]) // insertNinaAvatars RETURNING

    const result = await actions.registerNinaAvatarsAction({
      records: [batchRecord({ folder: '' })],
    })

    expect(result.ok).toBe(true)
    expect(fake.queries.some((query) => query.sql.startsWith('insert into "nina_folders"'))).toBe(
      false,
    )
  })

  it('dedupes a repeated sourceKey inside one batch: first writer wins, second counts as skipped', async () => {
    fake.enqueue([avatarRow()]) // getCurrentNinaAvatar
    fake.enqueue([{ folder: 'Pictures/2026' }])
    fake.enqueue([avatarRow()]) // insertNinaAvatars RETURNING — ONE row

    const record = batchRecord()
    const result = await actions.registerNinaAvatarsAction({ records: [record, { ...record }] })

    expect(result.ok).toBe(true)
    expect(result.inserted).toHaveLength(1)
    // `skipped` is `submitted - rows.length`: the intra-batch twin is dropped BEFORE the INSERT,
    // so the arithmetic the client diffs against still balances.
    expect(result.skipped).toBe(1)
    const insert = fake.queries.find((query) => query.sql.startsWith('insert into "nina_avatars"'))
    expect(insert?.params.filter((param) => param === record.sourceKey)).toHaveLength(1)
  })

  it('promotes the first face on an empty album — once, through the ordering-owning function', async () => {
    fake.enqueue([]) // getCurrentNinaAvatar → no current row at all
    fake.enqueue([{ folder: 'Pictures/2026' }])
    fake.enqueue([avatarRow({ id: ID })]) // insertNinaAvatars RETURNING
    fake.enqueue([avatarRow({ id: ID })]) // setCurrentNinaAvatar's pre-read

    const result = await actions.registerNinaAvatarsAction({ records: [batchRecord()] })

    expect(result.ok).toBe(true)
    expect(fake.batches).toHaveLength(1) // the un-current/current pair, via setCurrentNinaAvatar
    expect(afterCallbacks).toHaveLength(1) // and the fresh face earns its description

    fake.enqueue([avatarRow({ description: null })]) // the callback's own re-read
    fake.enqueue([{ id: ID }])
    await afterCallbacks[0]?.()
    expect(describeNinaImages).toHaveBeenCalledWith([{ blobUrl: BLOB_URL, pathname: PATHNAME }], {
      subject: 'self',
    })
  })

  it('re-sent batches write nothing and skip everything — the constraint is the idempotence', async () => {
    fake.enqueue([avatarRow()]) // getCurrentNinaAvatar
    fake.enqueue([]) // declareNinaFolders RETURNING (folder already declared → conflict → [])
    fake.enqueue([]) // insertNinaAvatars ON CONFLICT DO NOTHING → []

    const result = await actions.registerNinaAvatarsAction({ records: [batchRecord()] })

    expect(result.ok).toBe(true)
    expect(result.inserted).toEqual([])
    expect(result.skipped).toBe(1)
    expect(afterCallbacks).toHaveLength(0) // nothing inserted → no promotion, no describe
  })

  it('drops a returned row no record claims from `inserted` — the join never guesses', async () => {
    fake.enqueue([avatarRow()]) // getCurrentNinaAvatar
    fake.enqueue([{ folder: 'Pictures/2026' }])
    // The RETURNING row's pathname matches NO submitted record. The pathname join has nothing to
    // say about it, so it is absent from `inserted` — array position would have "worked", and the
    // design deliberately refuses to guess. `skipped` stays `submitted - rows.length` = 0: it
    // counts storage-level conflicts, not join misses, and in practice a RETURNING pathname can
    // only diverge from the request if the row was rewritten underneath the action. Pinned as it
    // behaves, not as a tidier story would have it.
    fake.enqueue([avatarRow({ pathname: `nina/${USER}/avatar-otherself123-Tu6HvWq2m0.jpg` })])

    const result = await actions.registerNinaAvatarsAction({ records: [batchRecord()] })

    expect(result.ok).toBe(true)
    expect(result.inserted).toEqual([])
    expect(result.skipped).toBe(0)
  })

  it('refuses a payload that does not describe itself, before any statement', async () => {
    const result = await actions.registerNinaAvatarsAction({ records: [] })

    expect(result).toEqual({ ok: false, error: 'That batch did not describe itself properly.' })
    expect(fake.queries).toHaveLength(0)
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('refuses a record with a non-canonical folder the same way', async () => {
    const result = await actions.registerNinaAvatarsAction({
      records: [batchRecord({ folder: '/Nina' })],
    })

    expect(result.ok).toBe(false)
    expect(fake.queries).toHaveLength(0)
  })

  it('gates on requireAdmin before any statement', async () => {
    requireAdmin.mockRejectedValue(new Error('not an admin'))

    await expect(actions.registerNinaAvatarsAction({ records: [batchRecord()] })).rejects.toThrow(
      'not an admin',
    )
    expect(fake.queries).toHaveLength(0)
  })
})

/* ── listNinaAlbumManifestAction — the pre-drop diff input ─────────────────────────────────── */

describe('listNinaAlbumManifestAction', () => {
  it('answers with the view model — exactly id, folder and sourceKey, nothing rowish', async () => {
    fake.enqueue([manifestRow(), manifestRow({ id: 'secondId12345', folder: '' })])

    const result = await actions.listNinaAlbumManifestAction({ folder: 'Pictures/2026' })

    expect(result).toEqual({
      ok: true,
      entries: [
        {
          id: ID,
          folder: 'Pictures/2026',
          sourceKey: 'v1|2481003|1723881072|pics.jpg',
        },
        {
          id: 'secondId12345',
          folder: '',
          sourceKey: 'v1|2481003|1723881072|pics.jpg',
        },
      ],
      truncated: false,
    })
    const read = fake.only()
    expect(read.sql).toContain('from "nina_avatars"')
    expect(read.sql).toContain('"source_key"')
    expect(read.params).toContain(USER)
    expect(read.sql).toContain('limit')
  })

  it('accepts the empty folder — a drop on the album root asks for the whole album', async () => {
    fake.enqueue([]) // nothing stored yet

    const result = await actions.listNinaAlbumManifestAction({ folder: '' })

    expect(result).toEqual({ ok: true, entries: [], truncated: false })
    expect(fake.only().sql).toContain('from "nina_avatars"')
  })

  it('reports truncated at EXACTLY the cap — the deliberate `>=`, documented as not a bug', async () => {
    // `listNinaAvatarManifest` clamps its own limit, so there is no "one more than the cap" probe;
    // a subtree holding exactly NINA_ADMIN_MANIFEST_MAX photos answers `truncated: true` although
    // it may not be over. The error is in the safe direction: the diff over-reports, the re-PUTs
    // are discarded by ON CONFLICT DO NOTHING — slower, never wrong. Pinning it here is what
    // stops a "fix" from turning the safe error into an unsafe one.
    expect(NINA_ADMIN_MANIFEST_MAX).toBe(2000)
    fake.enqueue(
      Array.from({ length: NINA_ADMIN_MANIFEST_MAX }, (_, index) =>
        manifestRow({ id: `id${String(index).padStart(10, '0')}` }),
      ),
    )

    const result = await actions.listNinaAlbumManifestAction({ folder: 'Pictures/2026' })

    expect(result.ok).toBe(true)
    expect(result.entries).toHaveLength(NINA_ADMIN_MANIFEST_MAX)
    expect(result.truncated).toBe(true)
  })

  it('refuses a folder the album does not accept, before reading anything', async () => {
    for (const folder of ['/Nina', 'Nina/', 'Nina//2026', '../etc', 'trip ']) {
      const result = await actions.listNinaAlbumManifestAction({ folder })
      expect(result.ok, `${JSON.stringify(folder)} must be refused`).toBe(false)
    }
    expect(fake.queries).toHaveLength(0)
  })

  it('gates on requireAdmin before any statement', async () => {
    requireAdmin.mockRejectedValue(new Error('not an admin'))

    await expect(actions.listNinaAlbumManifestAction({ folder: '' })).rejects.toThrow(
      'not an admin',
    )
    expect(fake.queries).toHaveLength(0)
  })
})
