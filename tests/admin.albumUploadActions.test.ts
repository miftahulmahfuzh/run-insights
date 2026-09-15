import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * **`registerNinaAvatarsAction`'s new cross-table duplicate scan (dup-image-push-notify R1).**
 *
 * A real behavioural suite for this action already exists
 * (`tests/admin.albumAvatarActions.test.ts`, real DB via `fakeDb`) — the plan that asked for this
 * file believed none did. It does not touch the new duplicate-scan behaviour at all (its
 * `batchRecord()` fixture carries no `contentHash`, so `scheduleAvatarDuplicateScan` never
 * schedules anything there), so this file is not redundant with it: it is the first suite that
 * exercises hash threading, the exclusion list, and the one-push-per-batch cap. Posture here is
 * fully mocked rather than `fakeDb`, so the `after()` scan's three collaborators
 * (`insertNinaAvatars`, `findGlobalDuplicatePhoto`, `notifyDuplicateImagePush`) can be asserted on
 * directly without composing SQL fixtures for a scan that reads no column back through
 * `avatarColumns`.
 */

const requireAdmin = vi.fn()
const declareNinaFolders = vi.fn()
const getCurrentNinaAvatar = vi.fn()
const insertNinaAvatars = vi.fn()
const findGlobalDuplicatePhoto = vi.fn()
const notifyDuplicateImagePush = vi.fn()
const revalidatePath = vi.fn()

/**
 * `after()` is captured rather than executed, because the thing under test is precisely that the
 * action does NOT wait for the scan. `tests/admin.chatPhotos.test.ts`'s `runTheAfterCallback` is
 * the precedent for this shape.
 */
const afterCallbacks: Array<() => Promise<void>> = []

vi.mock('next/cache', () => ({ revalidatePath: (path: string) => revalidatePath(path) }))
vi.mock('next/server', () => ({
  after: (cb: () => Promise<void>) => {
    afterCallbacks.push(cb)
  },
}))
vi.mock('@/lib/admin/requireAdmin', () => ({ requireAdmin: () => requireAdmin() }))
vi.mock('@/lib/admin/ninaAlbumDeferredDescribe', () => ({ scheduleDescribe: vi.fn() }))
vi.mock('@/lib/nina/queries', () => ({
  declareNinaFolders: (...args: unknown[]) => declareNinaFolders(...args),
  getCurrentNinaAvatar: (...args: unknown[]) => getCurrentNinaAvatar(...args),
  insertNinaAvatars: (...args: unknown[]) => insertNinaAvatars(...args),
  listNinaAvatarManifest: vi.fn(),
  setCurrentNinaAvatar: vi.fn(),
}))
vi.mock('@/lib/photos/globalDuplicate', () => ({
  findGlobalDuplicatePhoto: (...args: unknown[]) => findGlobalDuplicatePhoto(...args),
}))
vi.mock('@/lib/push/duplicateImage', () => ({
  notifyDuplicateImagePush: (...args: unknown[]) => notifyDuplicateImagePush(...args),
}))

const USER = 'abc123XYZ_-9'
const STORE = 'https://abc123store.public.blob.vercel-storage.com'
const HASH_A = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
const HASH_B = '3608bd867b0b8ae90ceac35913ecdfe70dad186a7a7ff05a0be1b8d3d13ac4d4'
const AVATAR_HIT = {
  kind: 'avatar' as const,
  id: 'other123XYZ_',
  url: `${STORE}/nina/${USER}/avatar-other123XYZ_-suffix.jpg`,
}

type Actions = typeof import('@/lib/admin/ninaAlbumUploadActions')
let actions: Actions

/** One file in a folder-upload batch, bounded by `avatarBatchRegisterSchema`. */
function batchRecord(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const id = ('id' in overrides ? overrides.id : 'rowIdXYZ_-9') as string
  return {
    folder: 'Pictures/2026',
    filename: 'IMG_20260817_101112.jpg',
    sourceKey: `v1|2481003|1723881072|Pictures/2026/img_20260817_101112_${id}.jpg`,
    blobUrl: `${STORE}/nina/${USER}/avatar-${id}-suffix.jpg`,
    pathname: `nina/${USER}/avatar-${id}-suffix.jpg`,
    contentType: 'image/jpeg',
    width: 1792,
    height: 2400,
    bytes: 2_481_003,
    thumb: null,
    ...overrides,
  }
}

/** `insertNinaAvatars`'s `avatarColumns`-projected row shape, minimal for this suite's purposes. */
function avatarRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'rowIdXYZ_-9',
    blobUrl: `${STORE}/nina/${USER}/avatar-rowIdXYZ_-9-suffix.jpg`,
    pathname: `nina/${USER}/avatar-rowIdXYZ_-9-suffix.jpg`,
    folder: 'Pictures/2026',
    filename: 'IMG_20260817_101112.jpg',
    thumbUrl: null,
    thumbPathname: null,
    width: 1792,
    height: 2400,
    bytes: 2_481_003,
    source: 'admin',
    description: null,
    isCurrent: false,
    createdAt: new Date(0),
    ...overrides,
  }
}

beforeEach(async () => {
  vi.spyOn(console, 'info').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  afterCallbacks.length = 0

  requireAdmin.mockResolvedValue({ userId: USER })
  declareNinaFolders.mockResolvedValue(undefined)
  getCurrentNinaAvatar.mockResolvedValue({ id: 'current123XYZ' }) // a face already exists, no promotion
  insertNinaAvatars.mockResolvedValue([])
  findGlobalDuplicatePhoto.mockResolvedValue(null)
  notifyDuplicateImagePush.mockResolvedValue(undefined)

  actions = await import('@/lib/admin/ninaAlbumUploadActions')
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.clearAllMocks()
})

describe('registerNinaAvatarsAction — the cross-table duplicate scan', () => {
  it('a valid hash claim reaches the insert; a malformed one is NULLed there, not refused', async () => {
    const good = batchRecord({ id: 'goodRow123X', contentHash: HASH_A })
    const bad = batchRecord({ id: 'badRow456XY', contentHash: 'not-a-hash' })
    insertNinaAvatars.mockResolvedValue([
      avatarRow({ id: 'goodRow123X', pathname: good.pathname as string }),
      avatarRow({ id: 'badRow456XY', pathname: bad.pathname as string }),
    ])

    const result = await actions.registerNinaAvatarsAction({ records: [good, bad] })

    expect(result).toMatchObject({ ok: true, skipped: 0 })
    const [, inserts] = insertNinaAvatars.mock.calls[0] as [string, Array<{ contentHash: unknown }>]
    expect(inserts[0]?.contentHash).toBe(HASH_A)
    expect(inserts[1]?.contentHash).toBeNull()
  })

  it('a record with no hash at all still registers', async () => {
    const record = batchRecord({ id: 'noHash123XY' })
    delete record.contentHash
    insertNinaAvatars.mockResolvedValue([avatarRow({ id: 'noHash123XY', pathname: record.pathname })])

    const result = await actions.registerNinaAvatarsAction({ records: [record] })

    expect(result.ok).toBe(true)
    const [, inserts] = insertNinaAvatars.mock.calls[0] as [string, Array<{ contentHash: unknown }>]
    expect(inserts[0]?.contentHash).toBeNull()
  })

  it('the scan runs AFTER the response, on the rows that actually landed', async () => {
    const landed = batchRecord({ id: 'landedRow1X', contentHash: HASH_A })
    const skipped = batchRecord({ id: 'skippedRow2', contentHash: HASH_B })
    // Only the first record's row comes back — the ON CONFLICT skip for the second.
    insertNinaAvatars.mockResolvedValue([
      avatarRow({ id: 'landedRow1X', pathname: landed.pathname }),
    ])

    const result = await actions.registerNinaAvatarsAction({ records: [landed, skipped] })

    expect(result.ok).toBe(true)
    expect(findGlobalDuplicatePhoto).not.toHaveBeenCalled()
    expect(afterCallbacks).toHaveLength(1)

    await afterCallbacks[0]?.()
    expect(findGlobalDuplicatePhoto).toHaveBeenCalledTimes(1)
    expect(findGlobalDuplicatePhoto).toHaveBeenCalledWith(
      USER,
      HASH_A,
      expect.objectContaining({ exclude: [{ kind: 'avatar', id: 'landedRow1X' }] }),
    )
  })

  it('the whole chunk is excluded from every lookup, not just the row asking', async () => {
    const first = batchRecord({ id: 'chunkRowOne', contentHash: HASH_A })
    const second = batchRecord({ id: 'chunkRowTwo', contentHash: HASH_B })
    insertNinaAvatars.mockResolvedValue([
      avatarRow({ id: 'chunkRowOne', pathname: first.pathname }),
      avatarRow({ id: 'chunkRowTwo', pathname: second.pathname }),
    ])

    await actions.registerNinaAvatarsAction({ records: [first, second] })
    await afterCallbacks[0]?.()

    const expectedExclude = {
      exclude: [
        { kind: 'avatar', id: 'chunkRowOne' },
        { kind: 'avatar', id: 'chunkRowTwo' },
      ],
    }
    expect(findGlobalDuplicatePhoto).toHaveBeenCalledTimes(2)
    expect(findGlobalDuplicatePhoto).toHaveBeenNthCalledWith(1, USER, HASH_A, expectedExclude)
    expect(findGlobalDuplicatePhoto).toHaveBeenNthCalledWith(2, USER, HASH_B, expectedExclude)
  })

  it('a whole batch of duplicates buzzes the phone ONCE', async () => {
    const hashes = [
      '3c831eb5a23962a50dbffc0d4f37facd0f1171844d08d1a5cc93a04426f02393',
      '0f719b1f3a428a4dd53c61b3bdc5c2ec279c2e6139f160b3bbb8df8e7efdead8',
      '4568437f50f4fba02636d5b089556984a0544019977a130c7fdc2fce24bb4fa0',
      '766c7c97fa4a41fc32bccde2c0eb263fb65fe0968ad7720fa7b85daaa36f7ebd',
      '06a209481b6514ffb31c68934c50c632071277055b16ad18bbf00253e697699c',
    ]
    const records = ['rowA12345XY', 'rowB12345XY', 'rowC12345XY', 'rowD12345XY', 'rowE12345XY'].map(
      (id, i) => batchRecord({ id, contentHash: hashes[i] }),
    )
    insertNinaAvatars.mockResolvedValue(
      records.map((record) => avatarRow({ id: record.id, pathname: record.pathname })),
    )
    findGlobalDuplicatePhoto.mockResolvedValue(AVATAR_HIT)

    await actions.registerNinaAvatarsAction({ records })
    await afterCallbacks[0]?.()

    expect(findGlobalDuplicatePhoto).toHaveBeenCalledTimes(5)
    expect(notifyDuplicateImagePush).toHaveBeenCalledTimes(1)
    expect(notifyDuplicateImagePush).toHaveBeenCalledWith(USER, AVATAR_HIT)
  })

  it('a re-dropped folder schedules nothing', async () => {
    const record = batchRecord({ id: 'redropRow1X', contentHash: HASH_A })
    insertNinaAvatars.mockResolvedValue([]) // ON CONFLICT DO NOTHING — nothing landed

    const result = await actions.registerNinaAvatarsAction({ records: [record] })

    expect(result).toMatchObject({ ok: true, skipped: 1 })
    expect(afterCallbacks).toHaveLength(0)
  })

  it('one row whose lookup throws does not cost the other rows their check', async () => {
    const first = batchRecord({ id: 'throwsRow1X', contentHash: HASH_A })
    const second = batchRecord({ id: 'okRow2XYZab', contentHash: HASH_B })
    insertNinaAvatars.mockResolvedValue([
      avatarRow({ id: 'throwsRow1X', pathname: first.pathname }),
      avatarRow({ id: 'okRow2XYZab', pathname: second.pathname }),
    ])
    findGlobalDuplicatePhoto.mockRejectedValueOnce(new Error('the replica is down'))
    findGlobalDuplicatePhoto.mockResolvedValueOnce(AVATAR_HIT)

    await actions.registerNinaAvatarsAction({ records: [first, second] })
    await afterCallbacks[0]?.()

    expect(notifyDuplicateImagePush).toHaveBeenCalledTimes(1)
    expect(notifyDuplicateImagePush).toHaveBeenCalledWith(USER, AVATAR_HIT)
  })

  it('a row that landed without a hash is never scanned', async () => {
    const record = batchRecord({ id: 'noHashRow1X' })
    delete record.contentHash
    insertNinaAvatars.mockResolvedValue([avatarRow({ id: 'noHashRow1X', pathname: record.pathname })])

    await actions.registerNinaAvatarsAction({ records: [record] })

    expect(afterCallbacks).toHaveLength(0)
  })
})
