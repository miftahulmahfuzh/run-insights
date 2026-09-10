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
  contentHash: HASH,
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

  it('a reference row carries the KEEPER hash, never this encode’s claim', () => {
    // The source-key skip (2026-09-10's measured defect): the pre-check matched on the PICKED
    // file's bytes, so the claim describes an encode nobody stored — while the row is about to
    // render the keeper's bytes. A row's content_hash describes the bytes its blob_url serves.
    const plan = planChatPhotoAddWrite({
      claims: {
        ...CLAIMS,
        contentHash: '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08',
      },
      pinned: FLAT_KEEPER,
      hit: null,
    })
    expect(plan.contentHash).toBe(HASH)
  })

  it('a keeper that never had a hash keeps the reference’s hash NULL — never the claim', () => {
    const plan = planChatPhotoAddWrite({
      claims: CLAIMS,
      pinned: { ...FLAT_KEEPER, contentHash: null },
      hit: null,
    })
    expect(plan.contentHash).toBeNull()
  })

  it('an original still writes the claim as its own hash', () => {
    const plan = planChatPhotoAddWrite({
      claims: { ...CLAIMS, contentHash: null },
      pinned: null,
      hit: null,
    })
    expect(plan.contentHash).toBeNull()
    expect(planChatPhotoAddWrite({ claims: CLAIMS, pinned: null, hit: null }).contentHash).toBe(
      HASH,
    )
  })
})
