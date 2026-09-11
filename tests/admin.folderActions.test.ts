import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { installFakeDb, projectedRow, uninstallFakeDb, type FakeDb } from './support/fakeDb'

/**
 * **The folder-maintenance actions, wired to a real database for the first time.**
 *
 * `tests/admin.folderOps.test.ts` proves the six actions' PLANNERS — `planFolderCreate`,
 * `planFolderRename`, `planFolderMove`, `currentPhotoRefusal` — pure, no database, every refusal
 * argued in writing (a merge that cannot be undone, a subtree re-rooted inside itself, her face
 * deleted). `tests/admin.filetree.test.ts` proves the path arithmetic under them. Between those two
 * suites and this repo's whole test run, not one test called `createNinaAlbumFolderAction`,
 * `renameNinaAlbumFolderAction`, `moveNinaAlbumFolderAction`, `moveNinaAvatarsAction`,
 * `deleteNinaAlbumFolderAction` or `removeNinaAvatarsAction` — the six `'use server'` functions in
 * `lib/admin/ninaAlbumActions.ts` that actually CALL those planners and turn an `ok: true` into rows
 * written, or an `ok: false` into nothing touched. A planner that refuses correctly is not the same
 * claim as an action that reads its `ok` field before writing, undeclares a folder only when it is
 * actually empty, or reaps a blob only after its row is gone — and this file is the one that checks
 * the wiring, not the arithmetic underneath it.
 *
 * Posture: the same one `tests/admin.chatPhotoAdoption.test.ts` set for this file — real generated
 * SQL against the fake Neon driver (`installFakeDb`), with only the edges mocked: `@vercel/blob`'s
 * `del`, `requireAdmin`, `revalidatePath`. No `put` and no `after` here — none of these six actions
 * write a new blob or defer a vendor call, unlike the avatar-adoption path in the sibling file.
 */

const USER = 'usr123XYZ_-9'
const AVATAR_A = 'avaAAAAAAAAA'
const AVATAR_B = 'avaBBBBBBBBB'
const AVATAR_C = 'avaCCCCCCCCC'

const requireAdmin = vi.fn()
const del = vi.fn()
const revalidatePath = vi.fn()

vi.mock('@vercel/blob', () => ({ put: vi.fn(), del: (...args: unknown[]) => del(...args) }))
vi.mock('@/lib/admin/requireAdmin', () => ({ requireAdmin: () => requireAdmin() }))
vi.mock('next/server', () => ({ after: (cb: () => Promise<void>) => cb() }))
vi.mock('next/cache', () => ({ revalidatePath: (path: string) => revalidatePath(path) }))

type Actions = typeof import('@/lib/admin/ninaAlbumActions')
let actions: Actions
let fake: FakeDb

beforeEach(async () => {
  vi.resetModules()
  requireAdmin.mockReset().mockResolvedValue({ userId: USER })
  del.mockReset().mockResolvedValue(undefined)
  revalidatePath.mockReset()
  fake = installFakeDb()
  actions = await import('@/lib/admin/ninaAlbumActions')
})

afterEach(() => {
  uninstallFakeDb()
  vi.resetModules()
})

/** `listNinaAvatarFolders`'s `db.batch`: populated (folder, count) then declared (folder). */
function enqueueExistingFolders(
  populated: Array<{ folder: string; photos: number }>,
  declared: string[] = [],
): void {
  fake.enqueue(
    populated.map((row) => projectedRow(row.folder, row.photos)),
    declared.map((folder) => projectedRow(folder)),
  )
}

/** `getCurrentNinaAvatar`'s full `avatarColumns` projection, 18 values. */
function currentAvatarRow(over: {
  id: string
  folder: string
  filename?: string | null
}): unknown[] {
  return projectedRow(
    over.id,
    `https://blob.example/nina/${USER}/avatar-${over.id}.jpg`,
    `nina/${USER}/avatar-${over.id}.jpg`,
    over.folder,
    over.filename ?? null,
    null,
    null,
    768,
    1024,
    240_000,
    'admin',
    null,
    null,
    null,
    'a photo of her',
    true,
    '2026-09-01 09:00:00+00',
    '2026-09-01 09:00:00+00',
  )
}

/** A blob-ref row, `{ id, blobUrl, pathname, thumbUrl, thumbPathname }` in that order. */
function blobRefRow(id: string, thumb = false): unknown[] {
  return projectedRow(
    id,
    `https://blob.example/nina/${USER}/avatar-${id}.jpg`,
    `nina/${USER}/avatar-${id}.jpg`,
    thumb ? `https://blob.example/nina/${USER}/thumb-${id}.jpg` : null,
    thumb ? `nina/${USER}/thumb-${id}.jpg` : null,
  )
}

describe('createNinaAlbumFolderAction', () => {
  it('gates on requireAdmin before reading or writing anything', async () => {
    requireAdmin.mockRejectedValue(new Error('not an admin'))

    await expect(actions.createNinaAlbumFolderAction({ parent: '', name: 'Bali' })).rejects.toThrow(
      'not an admin',
    )
    expect(fake.queries).toHaveLength(0)
  })

  it('refuses a malformed payload without reading the folder list', async () => {
    const result = await actions.createNinaAlbumFolderAction({ parent: '', name: '' })

    expect(result.ok).toBe(false)
    expect(fake.queries).toHaveLength(0)
  })

  it('declares the new folder AND every strict ancestor, then revalidates', async () => {
    enqueueExistingFolders([{ folder: 'Trips', photos: 3 }])
    fake.enqueue([projectedRow('Trips/Bali')]) // declareNinaFolders RETURNING

    const result = await actions.createNinaAlbumFolderAction({ parent: 'Trips', name: 'Bali' })

    expect(result).toEqual({ ok: true, folder: 'Trips/Bali', count: 0 })
    const insert = fake.queries.find((q) => q.sql.startsWith('insert into "nina_folders"'))
    expect(insert).toBeDefined()
    // One row per declared path: the ancestor ('Trips') and the leaf ('Trips/Bali') both land.
    expect(insert?.params).toContain('Trips')
    expect(insert?.params).toContain('Trips/Bali')
    expect(revalidatePath).toHaveBeenCalledWith('/admin/nina')
  })

  it('refuses a collision against the folders that exist right now, before any insert', async () => {
    enqueueExistingFolders([{ folder: 'Trips/Bali', photos: 12 }])

    const result = await actions.createNinaAlbumFolderAction({ parent: 'Trips', name: 'Bali' })

    expect(result.ok).toBe(false)
    expect(fake.queries.some((q) => q.sql.startsWith('insert into'))).toBe(false)
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('refuses past the depth bound, before any insert', async () => {
    enqueueExistingFolders([])

    const result = await actions.createNinaAlbumFolderAction({
      parent: 'a/b/c/d/e/f/g/h',
      name: 'i',
    })

    expect(result.ok).toBe(false)
    expect(fake.queries.some((q) => q.sql.startsWith('insert into'))).toBe(false)
  })
})

describe('renameNinaAlbumFolderAction', () => {
  it('rewrites the rows, then the declarations, in that order', async () => {
    enqueueExistingFolders([{ folder: 'Trips/Bali', photos: 40 }])
    fake.enqueue([projectedRow(AVATAR_A), projectedRow(AVATAR_B)]) // renameNinaAvatarFolder RETURNING
    fake.enqueue([projectedRow('Trips/Ubud')]) // renameNinaFolderSubtree RETURNING

    const result = await actions.renameNinaAlbumFolderAction({ folder: 'Trips/Bali', name: 'Ubud' })

    expect(result).toEqual({ ok: true, folder: 'Trips/Ubud', count: 2 })
    const rowsUpdate = fake.queries.find(
      (q) => q.sql.startsWith('update "nina_avatars"') && q.sql.includes('"folder"'),
    )
    const declUpdate = fake.queries.find((q) => q.sql.startsWith('update "nina_folders"'))
    expect(rowsUpdate).toBeDefined()
    expect(declUpdate).toBeDefined()
    // Rows before declarations: the rows statement is earlier in execution order.
    expect(fake.queries.indexOf(rowsUpdate!)).toBeLessThan(fake.queries.indexOf(declUpdate!))
    expect(revalidatePath).toHaveBeenCalledWith('/admin/nina')
  })

  it('is a no-op for an identity rename: no UPDATE runs at all', async () => {
    enqueueExistingFolders([{ folder: 'Trips/Bali', photos: 40 }])

    const result = await actions.renameNinaAlbumFolderAction({ folder: 'Trips/Bali', name: 'Bali' })

    expect(result).toEqual({ ok: true, folder: 'Trips/Bali', count: 0 })
    expect(fake.queries.some((q) => q.sql.startsWith('update'))).toBe(false)
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('reports moved: 0 as success for a folder holding only empty subfolders', async () => {
    enqueueExistingFolders([{ folder: 'Trips/Bali', photos: 0 }])
    fake.enqueue([]) // renameNinaAvatarFolder RETURNING — nothing to move
    fake.enqueue([projectedRow('Trips/Ubud')])

    const result = await actions.renameNinaAlbumFolderAction({ folder: 'Trips/Bali', name: 'Ubud' })

    expect(result).toEqual({ ok: true, folder: 'Trips/Ubud', count: 0 })
  })

  it("refuses a rename onto an occupied path — a merge planFolderRename won't allow", async () => {
    enqueueExistingFolders([
      { folder: 'Trips/Bali', photos: 40 },
      { folder: 'Trips/Ubud', photos: 5 },
    ])

    const result = await actions.renameNinaAlbumFolderAction({ folder: 'Trips/Bali', name: 'Ubud' })

    expect(result.ok).toBe(false)
    expect(fake.queries.some((q) => q.sql.startsWith('update'))).toBe(false)
    expect(revalidatePath).not.toHaveBeenCalled()
  })
})

describe('moveNinaAlbumFolderAction', () => {
  it('moves the subtree under a new parent and rewrites both halves', async () => {
    enqueueExistingFolders([{ folder: 'Trips/Bali', photos: 40 }])
    fake.enqueue([projectedRow(AVATAR_A)])
    fake.enqueue([projectedRow('Archive/Bali')])

    const result = await actions.moveNinaAlbumFolderAction({
      folder: 'Trips/Bali',
      parent: 'Archive',
    })

    expect(result).toEqual({ ok: true, folder: 'Archive/Bali', count: 1 })
    expect(revalidatePath).toHaveBeenCalledWith('/admin/nina')
  })

  it('is a no-op moving a folder onto its own parent', async () => {
    enqueueExistingFolders([{ folder: 'Trips/Bali', photos: 40 }])

    const result = await actions.moveNinaAlbumFolderAction({
      folder: 'Trips/Bali',
      parent: 'Trips',
    })

    expect(result).toEqual({ ok: true, folder: 'Trips/Bali', count: 0 })
    expect(fake.queries.some((q) => q.sql.startsWith('update'))).toBe(false)
  })

  it('refuses moving a folder inside itself, before any write', async () => {
    enqueueExistingFolders([{ folder: 'Trips/Bali', photos: 40 }])

    const result = await actions.moveNinaAlbumFolderAction({
      folder: 'Trips',
      parent: 'Trips/Bali',
    })

    expect(result.ok).toBe(false)
    expect(fake.queries.some((q) => q.sql.startsWith('update'))).toBe(false)
  })
})

describe('moveNinaAvatarsAction', () => {
  it('refuses a malformed payload without touching the database', async () => {
    const result = await actions.moveNinaAvatarsAction({ ids: [], folder: 'Trips' })

    expect(result.ok).toBe(false)
    expect(fake.queries).toHaveLength(0)
  })

  it('moves the selected photos in one statement and reports what actually moved', async () => {
    fake.enqueue([projectedRow(AVATAR_A), projectedRow(AVATAR_B)])

    const result = await actions.moveNinaAvatarsAction({
      ids: [AVATAR_A, AVATAR_B, AVATAR_C],
      folder: 'Trips/Bali',
    })

    expect(result).toEqual({ ok: true, folder: 'Trips/Bali', count: 2 })
    const update = fake.only()
    expect(update.sql.startsWith('update "nina_avatars"')).toBe(true)
    expect(update.params).toContain('Trips/Bali')
    expect(update.params).toEqual(expect.arrayContaining([AVATAR_A, AVATAR_B, AVATAR_C]))
    expect(revalidatePath).toHaveBeenCalledWith('/admin/nina')
  })
})

describe('deleteNinaAlbumFolderAction', () => {
  it('refuses the album root outright, before any query', async () => {
    const result = await actions.deleteNinaAlbumFolderAction({ folder: '', keepCurrent: false })

    expect(result.ok).toBe(false)
    expect(fake.queries).toHaveLength(0)
  })

  it('refuses when her current photo is in the subtree and keepCurrent is false', async () => {
    fake.enqueue([currentAvatarRow({ id: AVATAR_A, folder: 'Trips/Bali', filename: 'her.jpg' })])

    const result = await actions.deleteNinaAlbumFolderAction({
      folder: 'Trips/Bali',
      keepCurrent: false,
    })

    expect(result.ok).toBe(false)
    expect(result.error).toContain('her.jpg')
    expect(fake.queries).toHaveLength(1) // only the current-photo read; nothing deleted
    expect(del).not.toHaveBeenCalled()
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('leaves her current photo behind under keepCurrent, and stays in the folder', async () => {
    fake.enqueue([currentAvatarRow({ id: AVATAR_A, folder: 'Trips/Bali', filename: 'her.jpg' })])
    fake.enqueue([blobRefRow(AVATAR_B), blobRefRow(AVATAR_C, true)])

    const result = await actions.deleteNinaAlbumFolderAction({
      folder: 'Trips/Bali',
      keepCurrent: true,
    })

    expect(result.ok).toBe(true)
    expect(result.folder).toBe('Trips/Bali') // stays: the folder still holds her current photo
    expect(result.count).toBe(2)
    expect(result.note).toContain('her.jpg')
    // Undeclare must NOT run — the subtree is not actually empty.
    expect(fake.queries.some((q) => q.sql.startsWith('delete from "nina_folders"'))).toBe(false)
    expect(del).toHaveBeenCalledTimes(1)
    expect(del).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.stringContaining(AVATAR_B),
        expect.stringContaining(AVATAR_C),
      ]),
    )
  })

  it('deletes rows, reaps both original and thumbnail blobs, and undeclares the empty subtree', async () => {
    fake.enqueue([]) // getCurrentNinaAvatar — her current photo is not in this subtree
    fake.enqueue([blobRefRow(AVATAR_A), blobRefRow(AVATAR_B, true)])
    fake.enqueue([projectedRow('Trips/Bali')]) // deleteNinaFolderSubtree RETURNING

    const result = await actions.deleteNinaAlbumFolderAction({
      folder: 'Trips/Bali',
      keepCurrent: false,
    })

    expect(result).toEqual({ ok: true, folder: 'Trips', count: 2, note: undefined })
    expect(fake.queries.some((q) => q.sql.startsWith('delete from "nina_folders"'))).toBe(true)
    // Row A has no thumbnail (1 url); row B has both (2 urls) — 3 urls, one del() call.
    expect(del).toHaveBeenCalledTimes(1)
    expect(del.mock.calls[0]?.[0]).toHaveLength(3)
    expect(revalidatePath).toHaveBeenCalledWith('/admin/nina')
  })

  it('does not fail the action when the blob store rejects the delete', async () => {
    fake.enqueue([])
    fake.enqueue([blobRefRow(AVATAR_A)])
    fake.enqueue([])
    del.mockRejectedValue(new Error('blob store unreachable'))

    const result = await actions.deleteNinaAlbumFolderAction({
      folder: 'Trips/Bali',
      keepCurrent: false,
    })

    expect(result.ok).toBe(true) // rows are already gone; the orphaned blob is a recoverable follow-up
  })
})

describe('removeNinaAvatarsAction', () => {
  it('refuses a malformed payload without touching the database', async () => {
    const result = await actions.removeNinaAvatarsAction({ ids: [], keepCurrent: false })

    expect(result.ok).toBe(false)
    expect(fake.queries).toHaveLength(0)
  })

  it('refuses when the selection includes her current photo and keepCurrent is false', async () => {
    fake.enqueue([currentAvatarRow({ id: AVATAR_A, folder: 'Trips/Bali' })])

    const result = await actions.removeNinaAvatarsAction({
      ids: [AVATAR_A, AVATAR_B],
      keepCurrent: false,
    })

    expect(result.ok).toBe(false)
    expect(fake.queries).toHaveLength(1)
    expect(del).not.toHaveBeenCalled()
  })

  it('keeps her current photo and removes the rest, when told to', async () => {
    fake.enqueue([currentAvatarRow({ id: AVATAR_A, folder: 'Trips/Bali', filename: 'her.jpg' })])
    fake.enqueue([blobRefRow(AVATAR_B)])

    const result = await actions.removeNinaAvatarsAction({
      ids: [AVATAR_A, AVATAR_B],
      keepCurrent: true,
    })

    expect(result.ok).toBe(true)
    expect(result.count).toBe(1)
    expect(result.note).toContain('her.jpg')
  })

  it('removes an ordinary selection with no note and reaps the blobs', async () => {
    fake.enqueue([]) // her current photo is not among the ids
    fake.enqueue([blobRefRow(AVATAR_A), blobRefRow(AVATAR_B)])

    const result = await actions.removeNinaAvatarsAction({
      ids: [AVATAR_A, AVATAR_B],
      keepCurrent: false,
    })

    expect(result).toEqual({ ok: true, count: 2, note: undefined })
    expect(del).toHaveBeenCalledTimes(1)
    expect(revalidatePath).toHaveBeenCalledWith('/admin/nina')
  })
})
