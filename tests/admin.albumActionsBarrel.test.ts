import { expect, it, vi } from 'vitest'

/**
 * The export surface of the admin album action layer, pinned.
 *
 * `lib/admin/ninaAlbumActions.ts` is the one path every client component and every action-level
 * test imports (`typeof import('@/lib/admin/ninaAlbumActions')` in three of them), so a re-export
 * that goes missing fails here as a diff of names instead of as a runtime
 * "undefined is not a function" inside a component. The per-module pins hold the split itself
 * honest: each module behind the barrel exports exactly its own actions and nothing else — an
 * action that moved between modules is a deliberate architectural statement that updates this
 * file, not something that happens in a drive-by edit.
 *
 * `AdminActionResult` is an interface and erases at compile time, so it has no runtime key; it is
 * pinned by the compiler (both client importers do `import { type AdminActionResult }`), not here.
 *
 * This is a structural test — `Object.keys`, nothing else — but importing a real action module
 * still executes its import graph, so the same edges the action-level suites mock are mocked here:
 * `requireAdmin` above all, which is the one import that would drag `next-auth` into the graph.
 * No behaviour is exercised, so the doubles are bare `vi.fn()`s in the factories.
 */
vi.mock('@vercel/blob', () => ({ put: vi.fn(), del: vi.fn() }))
vi.mock('next/server', () => ({ after: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/admin/requireAdmin', () => ({ requireAdmin: vi.fn() }))
vi.mock('@/lib/nina/vision', () => ({ describeNinaImages: vi.fn() }))

const BARREL_ACTIONS = [
  'createNinaAlbumFolderAction',
  'deleteNinaAlbumFolderAction',
  'deleteNinaAvatarAction',
  'describeNinaAvatarAction',
  'editNinaAvatarDescriptionAction',
  'ensureNinaAvatarDescriptionAction',
  'listNinaAlbumManifestAction',
  'moveNinaAlbumFolderAction',
  'moveNinaAvatarsAction',
  'registerNinaAvatarsAction',
  'removeNinaAvatarsAction',
  'renameNinaAlbumFolderAction',
  'saveNinaAvatarCropAction',
  'setChatPhotoAsAvatarAction',
  'setCurrentNinaAvatarAction',
]

it('the barrel exports exactly the album action surface', async () => {
  const barrel = await import('@/lib/admin/ninaAlbumActions')
  expect(Object.keys(barrel).sort()).toEqual(BARREL_ACTIONS)
})

it('the describe module exports exactly its three describe actions', async () => {
  const mod = await import('@/lib/admin/ninaAlbumDescribeActions')
  expect(Object.keys(mod).sort()).toEqual([
    'describeNinaAvatarAction',
    'editNinaAvatarDescriptionAction',
    'ensureNinaAvatarDescriptionAction',
  ])
})

it('the avatar module exports exactly its four face actions', async () => {
  const mod = await import('@/lib/admin/ninaAlbumAvatarActions')
  expect(Object.keys(mod).sort()).toEqual([
    'deleteNinaAvatarAction',
    'saveNinaAvatarCropAction',
    'setChatPhotoAsAvatarAction',
    'setCurrentNinaAvatarAction',
  ])
})

it('the upload module exports exactly its two batch actions', async () => {
  const mod = await import('@/lib/admin/ninaAlbumUploadActions')
  expect(Object.keys(mod).sort()).toEqual([
    'listNinaAlbumManifestAction',
    'registerNinaAvatarsAction',
  ])
})

it('the folder module exports exactly its six maintenance actions', async () => {
  const mod = await import('@/lib/admin/ninaAlbumFolderActions')
  expect(Object.keys(mod).sort()).toEqual([
    'createNinaAlbumFolderAction',
    'deleteNinaAlbumFolderAction',
    'moveNinaAlbumFolderAction',
    'moveNinaAvatarsAction',
    'removeNinaAvatarsAction',
    'renameNinaAlbumFolderAction',
  ])
})
