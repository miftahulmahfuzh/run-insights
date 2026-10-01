import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * **Deleting a bubble must release the bytes nothing else names — and only those (card #94).**
 *
 * `removeNinaMessage` used to end at a `console.warn` listing the pathnames it was about to
 * strand. Its image rows go inside `deleteNinaMessage`'s own transaction, so the objects behind
 * them were paid for forever, and the two helpers that answer "is anyone still pointing at these
 * bytes" did not exist when that log was written.
 *
 * They do now, and this suite pins the sequence rather than the log:
 *
 *   · the rows are READ before the delete — the only order in which the pathnames survive, and
 *     the handle both steps below use, since `deleteNinaMessage` deliberately does not surface
 *     its image delete's rows;
 *   · `promoteNinaImageDependents` runs BEFORE the delete, or `source_image_id`'s
 *     `ON DELETE SET NULL` leaves an unmeasured ghost original no dedup pass can match;
 *   · `releaseBlobIfUnreferenced` runs AFTER it, once per distinct object, which is the only
 *     moment the question is honest — the rows naming them are gone by then;
 *   · and nothing in step 3 can change what the caller is told. The message IS deleted.
 *
 * The collaborators mock at the edges whole, `tests/nina.galleryDelete.test.ts`'s setup for the
 * sibling action on the same table — which keeps `requireUserId` and the database client out of
 * the suite and leaves exactly this action's branching.
 */

const spies = vi.hoisted(() => ({
  requireUserId: vi.fn(),
  getNinaMessageImagesForMessages: vi.fn(),
  deleteNinaMessage: vi.fn(),
  getNinaMessagesByIds: vi.fn(),
  updateNinaMessage: vi.fn(),
  promoteNinaImageDependents: vi.fn(),
  releaseBlobIfUnreferenced: vi.fn(),
}))

vi.mock('@/lib/auth/requireUserId', () => ({ requireUserId: spies.requireUserId }))
vi.mock('@/lib/nina/queries', () => ({
  deleteNinaMessage: spies.deleteNinaMessage,
  getNinaMessageImagesForMessages: spies.getNinaMessageImagesForMessages,
  getNinaMessagesByIds: spies.getNinaMessagesByIds,
  updateNinaMessage: spies.updateNinaMessage,
}))
vi.mock('@/lib/nina/provenancePromotion', () => ({
  promoteNinaImageDependents: spies.promoteNinaImageDependents,
  promoteNinaAvatarDependents: vi.fn(),
}))
vi.mock('@/lib/nina/blobRelease', () => ({
  releaseBlobIfUnreferenced: spies.releaseBlobIfUnreferenced,
}))

const USER = 'abc123XYZ_-9'
const MESSAGE_ID = 'msgRUNNER001'
const STORE = 'https://abc123store.public.blob.vercel-storage.com'

/** One `nina_message_images` row, as `imageColumns` projects it — only the fields this action reads. */
function image(id: string, pathname: string) {
  return { id, messageId: MESSAGE_ID, pathname, blobUrl: `${STORE}/${pathname}` }
}

const SOLO = image('im0000000001', `nina/${USER}/chat-im0000000001.jpg`)
const TWIN = image('im0000000002', `nina/${USER}/chat-im0000000002.jpg`)

type MessageActions = typeof import('@/lib/nina/messageActions')

let messageActions: MessageActions

beforeEach(async () => {
  vi.resetModules()
  /* `mockReset`, not `mockClear`: an unconsumed `mockResolvedValueOnce` left by a failed test
   * otherwise ghosts into the next one. */
  for (const spy of Object.values(spies)) spy.mockReset()

  spies.requireUserId.mockResolvedValue(USER)
  spies.getNinaMessageImagesForMessages.mockResolvedValue([])
  spies.deleteNinaMessage.mockResolvedValue({ id: MESSAGE_ID })
  spies.promoteNinaImageDependents.mockResolvedValue({ found: 0, fetched: 0, promoted: 0 })
  spies.releaseBlobIfUnreferenced.mockResolvedValue('deleted')

  messageActions = await import('@/lib/nina/messageActions')
})

afterEach(() => {
  vi.resetModules()
})

describe('removeNinaMessage — the three-step delete', () => {
  it('promotes, deletes, then releases — in that order', async () => {
    spies.getNinaMessageImagesForMessages.mockResolvedValue([SOLO])

    await expect(messageActions.removeNinaMessage({ messageId: MESSAGE_ID })).resolves.toEqual({
      ok: true,
      deletedId: MESSAGE_ID,
      reason: null,
    })

    expect(spies.promoteNinaImageDependents).toHaveBeenCalledWith(USER, [SOLO.id])
    expect(spies.releaseBlobIfUnreferenced).toHaveBeenCalledWith(USER, {
      blobUrl: SOLO.blobUrl,
      pathname: SOLO.pathname,
    })

    /* The ORDER is the correctness, in both directions: `source_image_id` stops naming these rows
     * inside the DELETE's own transaction, so a promotion afterwards has nothing left to find —
     * and a release BEFORE it would be asked while this message's own rows still answered. */
    const promoteAt = spies.promoteNinaImageDependents.mock.invocationCallOrder[0] ?? Infinity
    const deleteAt = spies.deleteNinaMessage.mock.invocationCallOrder[0] ?? -Infinity
    const releaseAt = spies.releaseBlobIfUnreferenced.mock.invocationCallOrder[0] ?? -Infinity
    expect(promoteAt).toBeLessThan(deleteAt)
    expect(deleteAt).toBeLessThan(releaseAt)
  })

  it('reads the image rows BEFORE the delete, which is the only order that works', async () => {
    spies.getNinaMessageImagesForMessages.mockResolvedValue([SOLO])

    await messageActions.removeNinaMessage({ messageId: MESSAGE_ID })

    expect(spies.getNinaMessageImagesForMessages).toHaveBeenCalledWith(USER, [MESSAGE_ID])
    const readAt = spies.getNinaMessageImagesForMessages.mock.invocationCallOrder[0] ?? Infinity
    const deleteAt = spies.deleteNinaMessage.mock.invocationCallOrder[0] ?? -Infinity
    expect(readAt).toBeLessThan(deleteAt)
  })

  it('promotes every row in one call, and asks about every distinct object', async () => {
    spies.getNinaMessageImagesForMessages.mockResolvedValue([SOLO, TWIN])

    await messageActions.removeNinaMessage({ messageId: MESSAGE_ID })

    expect(spies.promoteNinaImageDependents).toHaveBeenCalledTimes(1)
    expect(spies.promoteNinaImageDependents).toHaveBeenCalledWith(USER, [SOLO.id, TWIN.id])
    expect(spies.releaseBlobIfUnreferenced).toHaveBeenCalledTimes(2)
  })

  it('asks ONCE per object when a bubble shows the same photograph twice', async () => {
    /* A re-attach copy can ride the same bubble as its keeper: two rows, one pathname, one object.
     * Without the grouping the second release asks about bytes the first just deleted. */
    const copy = { ...image('im0000000003', SOLO.pathname) }
    spies.getNinaMessageImagesForMessages.mockResolvedValue([SOLO, copy])

    await messageActions.removeNinaMessage({ messageId: MESSAGE_ID })

    expect(spies.promoteNinaImageDependents).toHaveBeenCalledWith(USER, [SOLO.id, copy.id])
    expect(spies.releaseBlobIfUnreferenced).toHaveBeenCalledTimes(1)
    expect(spies.releaseBlobIfUnreferenced).toHaveBeenCalledWith(USER, {
      blobUrl: SOLO.blobUrl,
      pathname: SOLO.pathname,
    })
  })

  it('does not reach for either helper when the bubble carried no photograph', async () => {
    await expect(messageActions.removeNinaMessage({ messageId: MESSAGE_ID })).resolves.toEqual({
      ok: true,
      deletedId: MESSAGE_ID,
      reason: null,
    })

    expect(spies.promoteNinaImageDependents).not.toHaveBeenCalled()
    expect(spies.releaseBlobIfUnreferenced).not.toHaveBeenCalled()
  })
})

describe('removeNinaMessage — what the release can never do', () => {
  it("succeeds when the object is shared — keeping someone else's bytes is the point", async () => {
    spies.getNinaMessageImagesForMessages.mockResolvedValue([SOLO])
    spies.releaseBlobIfUnreferenced.mockResolvedValue('shared')

    await expect(messageActions.removeNinaMessage({ messageId: MESSAGE_ID })).resolves.toEqual({
      ok: true,
      deletedId: MESSAGE_ID,
      reason: null,
    })
  })

  it('succeeds when the object could not be released at all', async () => {
    spies.getNinaMessageImagesForMessages.mockResolvedValue([SOLO])
    spies.releaseBlobIfUnreferenced.mockResolvedValue('failed')

    await expect(messageActions.removeNinaMessage({ messageId: MESSAGE_ID })).resolves.toEqual({
      ok: true,
      deletedId: MESSAGE_ID,
      reason: null,
    })
  })
})

describe('removeNinaMessage — the refusals still refuse before anything destructive', () => {
  it('refuses a malformed id before any query runs', async () => {
    await expect(messageActions.removeNinaMessage({ messageId: '../etc/passwd' })).resolves.toEqual(
      { ok: false, deletedId: null, reason: 'not-found' },
    )

    expect(spies.getNinaMessageImagesForMessages).not.toHaveBeenCalled()
    expect(spies.promoteNinaImageDependents).not.toHaveBeenCalled()
    expect(spies.releaseBlobIfUnreferenced).not.toHaveBeenCalled()
  })

  it('releases nothing when the message was not his, or already gone', async () => {
    spies.getNinaMessageImagesForMessages.mockResolvedValue([SOLO])
    spies.deleteNinaMessage.mockResolvedValue(null)

    await expect(messageActions.removeNinaMessage({ messageId: MESSAGE_ID })).resolves.toEqual({
      ok: false,
      deletedId: null,
      reason: 'not-found',
    })

    /* Nothing was deleted, so nothing stopped pointing at those bytes. Releasing here would be the
     * card's own bug, reintroduced from the other end. */
    expect(spies.releaseBlobIfUnreferenced).not.toHaveBeenCalled()
  })

  it('reports the failure, and releases nothing, when the delete itself throws', async () => {
    spies.getNinaMessageImagesForMessages.mockResolvedValue([SOLO])
    spies.deleteNinaMessage.mockRejectedValue(new Error('connection closed'))

    await expect(messageActions.removeNinaMessage({ messageId: MESSAGE_ID })).resolves.toEqual({
      ok: false,
      deletedId: null,
      reason: 'failed',
    })

    expect(spies.releaseBlobIfUnreferenced).not.toHaveBeenCalled()
  })
})
