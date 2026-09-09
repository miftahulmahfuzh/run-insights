import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { readRepoCode } from './support/importGraph'

/**
 * **The Media viewer's delete control, as the server action actually composes it.**
 *
 * The runner can delete HIS OWN photographs ("Foto kamu") from `/nina/about`'s Media section, and
 * the storage the ask names is the Blob object, not just the row. So the assertions that matter:
 *
 *   · ONLY an upload (`kind !== 'generated'`) is deletable here — hers stay behind
 *     `/admin/photos`, which is the screen built for them.
 *   · The row is READ owner-scoped before anything else, and the delete's own WHERE carries
 *     `user_id` again (`deleteNinaMessageImage`) — invariant 3's two agreeing checks.
 *   · The Blob is released through the ONE shared helper (`releaseBlobIfUnreferenced`), fed from
 *     the DELETED row's return value, so "row first, blob second" is a data flow and not a
 *     convention.
 *   · The message bubble is never touched — the recorded rule that the photo path never deletes a
 *     runner message (the admin file argues it twice). The suite asserts the ABSENCE as a source
 *     claim, because a whole-module mock cannot prove a call that would be `undefined` was never
 *     wanted.
 *
 * Mocking a `'use server'` module is ordinary `vi.mock`, and the collaborators are mocked at the
 * edges whole (`tests/nina.attachTargets.test.ts`'s setup, same subject file) — that keeps
 * `requireUserId`, `next/cache` and the database client out of this suite, and what is left is
 * exactly the action's branching.
 */

const spies = vi.hoisted(() => ({
  requireUserId: vi.fn(),
  getNinaMessageImage: vi.fn(),
  deleteNinaMessageImage: vi.fn(),
  releaseBlobIfUnreferenced: vi.fn(),
  revalidatePath: vi.fn(),
  sendNinaMessage: vi.fn(),
  createNinaChatSession: vi.fn(),
}))

vi.mock('@/lib/auth/requireUserId', () => ({ requireUserId: spies.requireUserId }))
vi.mock('@/lib/nina/queries', () => ({
  getNinaMessageImage: spies.getNinaMessageImage,
  deleteNinaMessageImage: spies.deleteNinaMessageImage,
}))
vi.mock('@/lib/nina/blobRelease', () => ({
  releaseBlobIfUnreferenced: spies.releaseBlobIfUnreferenced,
}))
vi.mock('next/cache', () => ({ revalidatePath: spies.revalidatePath }))
vi.mock('@/lib/nina/actions', () => ({ sendNinaMessage: spies.sendNinaMessage }))
vi.mock('@/lib/nina/sessionActions', () => ({
  createNinaChatSession: spies.createNinaChatSession,
}))

const USER = 'abc123XYZ_-9'
const ID = 'aB3_dEf-hI9k'
const MESSAGE_ID = 'msgRUNNER001'
const STORE = 'https://abc123store.public.blob.vercel-storage.com'
const PATHNAME = `nina/${USER}/chat-${ID}.jpg`
const BLOB_URL = `${STORE}/${PATHNAME}`

/** The uploaded row, as `imageColumns` projects it — only the fields the action reads. */
const UPLOAD_ROW = {
  id: ID,
  messageId: MESSAGE_ID,
  kind: 'upload',
  blobUrl: BLOB_URL,
  pathname: PATHNAME,
  createdAt: new Date(),
}

type AlbumActions = typeof import('@/lib/nina/albumActions')

let albumActions: AlbumActions

beforeEach(async () => {
  vi.resetModules()
  for (const spy of Object.values(spies)) spy.mockReset()

  spies.requireUserId.mockResolvedValue(USER)
  spies.getNinaMessageImage.mockResolvedValue({ ...UPLOAD_ROW })

  albumActions = await import('@/lib/nina/albumActions')
})

afterEach(() => {
  vi.resetModules()
})

describe('deleteNinaChatPhoto', () => {
  it('deletes an upload row and releases its Blob through the shared helper', async () => {
    const deletedRow = { ...UPLOAD_ROW }
    spies.deleteNinaMessageImage.mockResolvedValue(deletedRow)
    spies.releaseBlobIfUnreferenced.mockResolvedValue('deleted')

    await expect(albumActions.deleteNinaChatPhoto({ id: ID })).resolves.toEqual({ ok: true })

    expect(spies.deleteNinaMessageImage).toHaveBeenCalledWith(USER, ID)
    /* Fed from the DELETE's return value, not from the earlier read: the release proving it is
     * holding the row the delete removed is what makes "row first, blob second" a data flow. */
    expect(spies.releaseBlobIfUnreferenced).toHaveBeenCalledWith(USER, {
      blobUrl: BLOB_URL,
      pathname: PATHNAME,
    })
    const deleteReturn = spies.deleteNinaMessageImage.mock.results[0]?.value
    expect(await deleteReturn).toBe(deletedRow)
    expect(spies.revalidatePath).toHaveBeenCalledWith('/nina/about')
  })

  it('refuses HER photograph — a generated row is not deletable from this screen', async () => {
    spies.getNinaMessageImage.mockResolvedValue({ ...UPLOAD_ROW, kind: 'generated' })

    await expect(albumActions.deleteNinaChatPhoto({ id: ID })).resolves.toEqual({ ok: false })

    expect(spies.deleteNinaMessageImage).not.toHaveBeenCalled()
    expect(spies.releaseBlobIfUnreferenced).not.toHaveBeenCalled()
    expect(spies.revalidatePath).not.toHaveBeenCalled()
  })

  it('refuses an id that is not his — a foreign or gone row reads as not-found', async () => {
    spies.getNinaMessageImage.mockResolvedValue(null)

    await expect(albumActions.deleteNinaChatPhoto({ id: ID })).resolves.toEqual({ ok: false })

    expect(spies.deleteNinaMessageImage).not.toHaveBeenCalled()
    expect(spies.releaseBlobIfUnreferenced).not.toHaveBeenCalled()
  })

  it('refuses a malformed id before any query runs', async () => {
    await expect(albumActions.deleteNinaChatPhoto({ id: '../etc/passwd' })).resolves.toEqual({
      ok: false,
    })

    expect(spies.getNinaMessageImage).not.toHaveBeenCalled()
    expect(spies.deleteNinaMessageImage).not.toHaveBeenCalled()
  })

  it('refuses when the row vanished between the read and the delete', async () => {
    spies.deleteNinaMessageImage.mockResolvedValue(null)

    await expect(albumActions.deleteNinaChatPhoto({ id: ID })).resolves.toEqual({ ok: false })

    /* Nothing was deleted, so there is nothing to release and nothing to revalidate. */
    expect(spies.releaseBlobIfUnreferenced).not.toHaveBeenCalled()
    expect(spies.revalidatePath).not.toHaveBeenCalled()
  })

  it('succeeds even when the Blob was shared or the delete failed — the row is the ask', async () => {
    spies.deleteNinaMessageImage.mockResolvedValue({ ...UPLOAD_ROW })
    spies.releaseBlobIfUnreferenced.mockResolvedValue('shared')

    await expect(albumActions.deleteNinaChatPhoto({ id: ID })).resolves.toEqual({ ok: true })

    spies.releaseBlobIfUnreferenced.mockResolvedValue('failed')
    await expect(albumActions.deleteNinaChatPhoto({ id: ID })).resolves.toEqual({ ok: true })

    /* The row left the collection twice; the screen revalidates either way. */
    expect(spies.revalidatePath).toHaveBeenCalledTimes(2)
  })
})

describe('the photo path never deletes a runner message (the recorded admin rule)', () => {
  it('albumActions does not reach for the message delete at all', () => {
    const source = readRepoCode('lib/nina/albumActions.ts')
    /* `deleteNinaMessageImage` is the row delete and must appear; its message-level sibling must
     * not — a runner bubble survives the removal of a photograph from the Media grid. */
    expect(source).toContain('deleteNinaMessageImage')
    expect(source).not.toMatch(/deleteNinaMessage(?!Image)/)
  })
})

/**
 * The screen half, as source claims — `environment: 'node'` cannot render a client component, so
 * what is testable is the shape (`tests/nina.attachTargets.test.ts` part 2, whose precedent this
 * follows). The claims are worded to rot loudly: each one is a design decision someone could
 * silently undo, and each is asserted on the exact spelling that decision ships as.
 */
describe('the Media viewer strip wires the delete control', () => {
  const SCREEN = 'components/nina/NinaAboutScreen.tsx'

  it('calls the action with the open photo and refreshes into the derived close', () => {
    const source = readRepoCode(SCREEN)
    expect(source).toContain('deleteNinaChatPhoto({ id: openChatPhoto.id })')
    expect(source).toContain('router.refresh()')
  })

  it('renders only for HIS chat photographs — never the album, never hers', () => {
    const source = readRepoCode(SCREEN)
    expect(source).toContain("open?.section === 'chat'")
    expect(source).toMatch(/side === 'his'/)
  })

  it('is named for deletion, shows no confirmation, and hides no button behind a dialog', () => {
    const source = readRepoCode(SCREEN)
    expect(source).toContain('aria-label="Hapus foto"')
    expect(source).not.toContain('window.confirm')
  })

  it('shares one flight with the two sends — nothing else is reachable mid-delete', () => {
    const source = readRepoCode(SCREEN)
    expect(source).toMatch(/disabled=\{sending !== null \|\| deleting\}/)
    expect(source).toMatch(/loading=\{deleting\}/)
  })
})
