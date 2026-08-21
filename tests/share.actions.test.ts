import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * **The mutation surface. Three actions, and the same question asked of all three: is ownership
 * proven before anything is written?**
 *
 * `proxy.ts` does not protect these. A Server Action POSTs to the page it is used on, so the
 * matcher governs it incidentally at best, and a refactor that moves a component to another route
 * silently removes even that. `requireUserId()` plus a `userId`-scoped query IS the boundary
 * (INVARIANT A), which makes "line one is the auth call" a property worth asserting rather than
 * reviewing.
 *
 * The second thing this file exists for is the **order inside `revokeShareLinkAction`**: kill the
 * link first, rotate the blobs second. That order is the feature's promise (`the page stops
 * working`) taking precedence over its sweep (`old image links break too`), and it is invisible in
 * any diff that reorders two awaits.
 */

const requireUserId = vi.fn<() => Promise<string>>()
const createShare = vi.fn()
const getActiveShareForRun = vi.fn()
const revokeShare = vi.fn()
const getRunDetail = vi.fn()
const setPhotoExcludedFromShare = vi.fn()
const rotateRunPhotoBlobs = vi.fn()
const revalidatePath = vi.fn()

/** Call order across ALL mocks, so "revoke before rotate" is assertable. */
const calls: string[] = []
const track =
  <T extends (...args: never[]) => unknown>(name: string, fn: T) =>
  (...args: Parameters<T>) => {
    calls.push(name)
    return fn(...args)
  }

vi.mock('@/lib/auth/requireUserId', () => ({ requireUserId: () => requireUserId() }))
vi.mock('next/cache', () => ({ revalidatePath: (p: string) => revalidatePath(p) }))
vi.mock('@/lib/db/queries', () => ({
  createShare: track('createShare', createShare),
  getActiveShareForRun: track('getActiveShareForRun', getActiveShareForRun),
  revokeShare: track('revokeShare', revokeShare),
  getRunDetail: track('getRunDetail', getRunDetail),
  setPhotoExcludedFromShare: track('setPhotoExcludedFromShare', setPhotoExcludedFromShare),
}))
vi.mock('@/lib/share/rotateBlobs', () => ({
  rotateRunPhotoBlobs: track('rotateRunPhotoBlobs', rotateRunPhotoBlobs),
}))
vi.mock('@/lib/share/origin', () => ({ shareUrl: (t: string) => `https://runins.site/s/${t}` }))

type Actions = typeof import('@/app/actions/share')
let actions: Actions

const RUN = 'runCanonic12' // 12 chars, so isValidId passes
const PHOTO = 'photoCanoni1'

beforeEach(async () => {
  calls.length = 0
  requireUserId.mockResolvedValue('u1')
  createShare.mockResolvedValue({ token: 'abcdefgh12345678' })
  getActiveShareForRun.mockResolvedValue(null)
  revokeShare.mockResolvedValue(undefined)
  getRunDetail.mockResolvedValue({ photos: [] })
  setPhotoExcludedFromShare.mockResolvedValue(undefined)
  rotateRunPhotoBlobs.mockResolvedValue({ rotated: 0, failed: [] })
  actions = await import('@/app/actions/share')
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('every action authenticates before it does anything else', () => {
  it('createShareLinkAction refuses a malformed run id without touching the database', async () => {
    const result = await actions.createShareLinkAction('not-a-valid-id-at-all')
    expect(result).toEqual({ ok: false, error: 'unknown-run' })
    // requireUserId still ran — it is line one, ABOVE the argument check, so a signed-out caller is
    // bounced to sign-in rather than told their id was malformed.
    expect(requireUserId).toHaveBeenCalledOnce()
    expect(createShare).not.toHaveBeenCalled()
  })

  it('setPhotoSharingAction refuses a malformed photo id without writing', async () => {
    const result = await actions.setPhotoSharingAction('nope', true, RUN)
    expect(result.ok).toBe(false)
    expect(setPhotoExcludedFromShare).not.toHaveBeenCalled()
  })

  it('passes the authenticated userId — never a client-supplied one — into every query', async () => {
    await actions.createShareLinkAction(RUN)
    expect(createShare).toHaveBeenCalledWith('u1', RUN)

    await actions.setPhotoSharingAction(PHOTO, false, RUN)
    // `included: false` becomes `excluded: true` — the DB column is the negative of the checkbox.
    expect(setPhotoExcludedFromShare).toHaveBeenCalledWith('u1', PHOTO, true)
  })
})

describe('minting is idempotent and returns an absolute URL', () => {
  it('returns the token and its server-built URL', async () => {
    const result = await actions.createShareLinkAction(RUN)
    expect(result).toEqual({
      ok: true,
      token: 'abcdefgh12345678',
      url: 'https://runins.site/s/abcdefgh12345678',
    })
    expect(revalidatePath).toHaveBeenCalledWith(`/r/${RUN}`)
  })

  it('a second tap returns the SAME token — the link already sent must keep working', async () => {
    const first = await actions.createShareLinkAction(RUN)
    const second = await actions.createShareLinkAction(RUN)
    expect(second).toEqual(first)
  })

  it('reports failure without distinguishing "not yours" from "does not exist"', async () => {
    // Distinguishing them would be an ownership oracle: a probe could enumerate which run ids exist.
    createShare.mockRejectedValue(new Error('NotFound'))
    expect(await actions.createShareLinkAction(RUN)).toEqual({ ok: false, error: 'failed' })
  })
})

describe('revocation kills the link BEFORE it rotates the photos', () => {
  it('revokes first, rotates second — R-15 order of operations', async () => {
    getActiveShareForRun.mockResolvedValue({ token: 'abcdefgh12345678' })
    getRunDetail.mockResolvedValue({
      photos: [{ id: PHOTO, blobUrl: 'https://x.blob/shots/a-1.jpg', pathname: 'shots/a-1.jpg' }],
    })
    rotateRunPhotoBlobs.mockResolvedValue({ rotated: 1, failed: [] })

    const result = await actions.revokeShareLinkAction(RUN)

    expect(result).toEqual({ ok: true, photosRotated: 1, photosStillLive: 0 })
    expect(calls.indexOf('revokeShare')).toBeGreaterThanOrEqual(0)
    expect(calls.indexOf('revokeShare')).toBeLessThan(calls.indexOf('rotateRunPhotoBlobs'))
  })

  it('hands the rotation the pathname as well as the URL, so a failed row write can be undone', async () => {
    getActiveShareForRun.mockResolvedValue({ token: 'abcdefgh12345678' })
    getRunDetail.mockResolvedValue({
      photos: [{ id: PHOTO, blobUrl: 'https://x.blob/shots/a-1.jpg', pathname: 'shots/a-1.jpg' }],
    })
    await actions.revokeShareLinkAction(RUN)
    expect(rotateRunPhotoBlobs).toHaveBeenCalledWith('u1', [
      { id: PHOTO, blobUrl: 'https://x.blob/shots/a-1.jpg', pathname: 'shots/a-1.jpg' },
    ])
  })

  it('reports the photos whose old URL is still live, rather than claiming success', async () => {
    getActiveShareForRun.mockResolvedValue({ token: 'abcdefgh12345678' })
    getRunDetail.mockResolvedValue({
      photos: [{ id: PHOTO, blobUrl: 'https://x.blob/shots/a-1.jpg', pathname: 'shots/a-1.jpg' }],
    })
    rotateRunPhotoBlobs.mockResolvedValue({ rotated: 0, failed: [PHOTO] })

    // The link is dead either way — that is the promise, and it was already kept before the rotation
    // ran. What the runner is owed is the truth about the second half.
    const result = await actions.revokeShareLinkAction(RUN)
    expect(result).toEqual({ ok: true, photosRotated: 0, photosStillLive: 1 })
  })

  it('is idempotent: revoking a run with no live share is not an error', async () => {
    getActiveShareForRun.mockResolvedValue(null)
    const result = await actions.revokeShareLinkAction(RUN)
    expect(result).toEqual({ ok: true, photosRotated: 0, photosStillLive: 0 })
    expect(revokeShare).not.toHaveBeenCalled()
  })
})

describe('per-photo inclusion', () => {
  it('maps included → excluded_from_share = false', async () => {
    expect(await actions.setPhotoSharingAction(PHOTO, true, RUN)).toEqual({ ok: true })
    expect(setPhotoExcludedFromShare).toHaveBeenCalledWith('u1', PHOTO, false)
    expect(revalidatePath).toHaveBeenCalledWith(`/r/${RUN}`)
  })

  it('reports a failed write so the optimistic checkbox can flip back', async () => {
    setPhotoExcludedFromShare.mockRejectedValue(new Error('nope'))
    const result = await actions.setPhotoSharingAction(PHOTO, false, RUN)
    expect(result.ok).toBe(false)
  })
})
