import { describe, expect, it } from 'vitest'

import { planChatPhotoAddWrite } from '@/lib/admin/chatPhotos'

/**
 * **The add path's dedup decision, pinned.** Pure — no database, no store, no mocks. The three
 * answers (original / race reference / pinned reference) and the two invariants the action
 * depends on the function for: the skip path releases NOTHING, and a merged keeper is flattened.
 */

const HASH = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'

const CLAIMS = {
  blobUrl: 'https://store.test/nina/u1/selfie-AbCdEf123456-suffixsuffixsuffix.jpg',
  pathname: 'nina/u1/selfie-AbCdEf123456-suffixsuffixsuffix.jpg',
  contentHash: HASH as string | null,
}

const FLAT_KEEPER = {
  id: 'keep123XYZ_9',
  blobUrl: 'https://store.test/nina/u1/selfie-keeper000000.jpg',
  pathname: 'nina/u1/selfie-keeper000000.jpg',
  description: 'Keeper prose, already paid for.',
  sourceAvatarId: null,
  sourceImageId: null,
}

describe('planChatPhotoAddWrite', () => {
  it('writes an original with the hash claim when nothing shares the bytes', () => {
    expect(planChatPhotoAddWrite({ claims: CLAIMS, pinned: null, hit: null })).toEqual({
      blobUrl: CLAIMS.blobUrl,
      pathname: CLAIMS.pathname,
      sourceAvatarId: null,
      sourceImageId: null,
      contentHash: HASH,
      description: null,
      release: null,
    })
  })

  it('race: references the keeper and releases the fresh loser bytes', () => {
    const plan = planChatPhotoAddWrite({ claims: CLAIMS, pinned: null, hit: FLAT_KEEPER })
    expect(plan.blobUrl).toBe(FLAT_KEEPER.blobUrl)
    expect(plan.sourceImageId).toBe(FLAT_KEEPER.id)
    expect(plan.description).toBe(FLAT_KEEPER.description)
    expect(plan.release).toEqual({ blobUrl: CLAIMS.blobUrl, pathname: CLAIMS.pathname })
  })

  it('skip: the payload echoes the keeper, so NOTHING is released', () => {
    // The pathname comparison is what keeps one function honest about both paths.
    const plan = planChatPhotoAddWrite({
      claims: { ...CLAIMS, blobUrl: FLAT_KEEPER.blobUrl, pathname: FLAT_KEEPER.pathname },
      pinned: FLAT_KEEPER,
      hit: null,
    })
    expect(plan.release).toBeNull()
    expect(plan.sourceImageId).toBe(FLAT_KEEPER.id)
  })

  it('a pinned row that is itself a reference flattens to its own original', () => {
    const plan = planChatPhotoAddWrite({
      claims: CLAIMS,
      pinned: { ...FLAT_KEEPER, sourceImageId: 'origin12XYZ_' },
      hit: null,
    })
    // `ninaPhotoProvenance`'s rule, inherited: the column always names the ORIGINAL.
    expect(plan.sourceImageId).toBe('origin12XYZ_')
    expect(plan.sourceAvatarId).toBeNull()
  })

  it('a pinned row that came from the album INHERITS the avatar id', () => {
    // The album face stays hidden even after the intermediate chat row is deleted.
    const plan = planChatPhotoAddWrite({
      claims: CLAIMS,
      pinned: { ...FLAT_KEEPER, sourceAvatarId: 'avatarAAAAAA', sourceImageId: null },
      hit: null,
    })
    expect(plan.sourceAvatarId).toBe('avatarAAAAAA')
    expect(plan.sourceImageId).toBe('keep123XYZ_9')
  })

  it('a null hash claim stays null on a reference row: NULL means no claim, not a lie', () => {
    const plan = planChatPhotoAddWrite({
      claims: { ...CLAIMS, contentHash: null },
      pinned: null,
      hit: FLAT_KEEPER,
    })
    expect(plan.contentHash).toBeNull()
  })
})
