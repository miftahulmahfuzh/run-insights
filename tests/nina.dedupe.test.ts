import { describe, expect, it } from 'vitest'

import {
  normalizeClaimedContentHash,
  ninaUploadInsertRow,
  partitionNinaUploadClaims,
  planNinaPickUpload,
  type NinaUploadClaim,
  type NinaUploadKeeper,
} from '@/lib/nina/dedupe'

/** sha256("test") — a known-answer vector, and a legal 64-hex string. */
const HASH = '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08'

function claim(overrides: Partial<NinaUploadClaim> = {}): NinaUploadClaim {
  return {
    pathname: 'nina/u1/chat/aaaaaaaaaaaa-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb.jpg',
    blobUrl: 'https://blob.example/nina/u1/chat/aaaaaaaaaaaa-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb.jpg',
    width: 768,
    height: 1024,
    bytes: 150_000,
    description: 'an arrival card',
    sortOrder: 0,
    contentHash: HASH,
    ...overrides,
  }
}

function keeper(overrides: Partial<NinaUploadKeeper> = {}): NinaUploadKeeper {
  return {
    id: 'imgKEEPER001',
    kind: 'upload',
    blobUrl: 'https://blob.example/nina/u1/chat/zzzzzzzzzzzz-yyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyy.jpg',
    pathname: 'nina/u1/chat/zzzzzzzzzzzz-yyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyy.jpg',
    description: 'the keeper description',
    sourceAvatarId: null,
    sourceImageId: null,
    ...overrides,
  }
}

describe('normalizeClaimedContentHash', () => {
  it('passes an exact 64-hex string through untouched', () => {
    expect(normalizeClaimedContentHash(HASH)).toBe(HASH)
  })

  it('trims surrounding whitespace before validating', () => {
    expect(normalizeClaimedContentHash(`  ${HASH}\n`)).toBe(HASH)
  })

  it('rejects uppercase hex rather than folding it', () => {
    expect(normalizeClaimedContentHash(HASH.toUpperCase())).toBeNull()
  })

  it('rejects wrong lengths, non-hex, and non-strings', () => {
    expect(normalizeClaimedContentHash(HASH.slice(1))).toBeNull()
    expect(normalizeClaimedContentHash(`${HASH}0`)).toBeNull()
    expect(normalizeClaimedContentHash(`${HASH.slice(0, 63)}g`)).toBeNull()
    expect(normalizeClaimedContentHash(undefined)).toBeNull()
    expect(normalizeClaimedContentHash(null)).toBeNull()
    expect(normalizeClaimedContentHash(123)).toBeNull()
    expect(normalizeClaimedContentHash({})).toBeNull()
  })
})

describe('planNinaPickUpload — dup -> skip upload + attach pointer', () => {
  const existing = { kind: 'image' as const, id: 'imgKEEPER001', url: 'https://blob.example/k.jpg' }

  it('attaches the existing photograph when the pre-check matched', () => {
    const plan = planNinaPickUpload({ contentHash: HASH, duplicate: existing })
    expect(plan).toEqual({ outcome: 'attach-existing', existing })
  })

  it('uploads when there is no duplicate', () => {
    expect(planNinaPickUpload({ contentHash: HASH, duplicate: null })).toEqual({
      outcome: 'upload',
      contentHash: HASH,
    })
  })

  it('uploads when neither hash could be computed — dedup inactive, pick never blocked', () => {
    expect(planNinaPickUpload({ contentHash: null, duplicate: null })).toEqual({
      outcome: 'upload',
      contentHash: null,
    })
  })

  it('attaches on a SOURCE-only hit: the encode missed, but the picked file itself is stored', () => {
    // The downloaded-then-re-uploaded photograph (2026-09-10's measured defect): the composer
    // re-encoded the pick into bytes nobody stored, so the encode's hash missed — but the pick's
    // own bytes ARE a row's stored bytes, the pre-check matched on that key, and a duplicate in
    // hand is the collection's answer regardless of which key matched.
    expect(planNinaPickUpload({ contentHash: null, duplicate: existing })).toEqual({
      outcome: 'attach-existing',
      existing,
    })
  })
})

describe('ninaUploadInsertRow — the fresh arm', () => {
  it('carries the claim as-is, hash included, provenance absent', () => {
    const decision = ninaUploadInsertRow({
      messageId: 'msgROW000001',
      claim: claim(),
      keeper: null,
    })
    expect(decision.outcome).toBe('fresh')
    expect(decision.keeperId).toBeNull()
    expect(decision.row).toEqual({
      messageId: 'msgROW000001',
      kind: 'upload',
      blobUrl: claim().blobUrl,
      pathname: claim().pathname,
      width: 768,
      height: 1024,
      bytes: 150_000,
      description: 'an arrival card',
      contentHash: HASH,
      // the perceptual pair, unsigned by default — the claim carries a signature only when the
      // send-time race-close measured one (media-dedupe follow-up, 2026-09-10)
      perceptualHash: null,
      perceptualSig: null,
      sortOrder: 0,
    })
    expect('sourceAvatarId' in decision.row).toBe(false)
    expect('sourceImageId' in decision.row).toBe(false)
  })
})

describe('ninaUploadInsertRow — the race branch: reference + the fields a reference carries', () => {
  it('copies the keeper, keeps the claim sortOrder, writes NO hash', () => {
    const decision = ninaUploadInsertRow({
      messageId: 'msgROW000001',
      claim: claim({ sortOrder: 2 }),
      keeper: keeper(),
    })
    expect(decision.outcome).toBe('reference')
    expect(decision.keeperId).toBe('imgKEEPER001')
    expect(decision.row).toMatchObject({
      messageId: 'msgROW000001',
      kind: 'upload',
      blobUrl: keeper().blobUrl,
      pathname: keeper().pathname,
      sortOrder: 2,
      sourceAvatarId: null,
      sourceImageId: 'imgKEEPER001',
    })
    expect(decision.row.contentHash).toBeUndefined()
    expect(decision.row.width).toBeUndefined()
    expect(decision.row.bytes).toBeUndefined()
  })

  it('flattens a reference keeper to the ORIGINAL via ninaPhotoProvenance', () => {
    const decision = ninaUploadInsertRow({
      messageId: 'msgROW000001',
      claim: claim(),
      keeper: keeper({ kind: 'generated', sourceImageId: 'imgORIGINA01' }),
    })
    expect(decision.row.kind).toBe('generated')
    expect(decision.row.sourceImageId).toBe('imgORIGINA01')
  })

  it('prefers the keeper description but falls back to the paid-for claim description', () => {
    const withKeeperText = ninaUploadInsertRow({
      messageId: 'msgROW000001',
      claim: claim({ description: 'freshly described' }),
      keeper: keeper({ description: 'operator words' }),
    })
    expect(withKeeperText.row.description).toBe('operator words')

    const keeperSilent = ninaUploadInsertRow({
      messageId: 'msgROW000001',
      claim: claim({ description: 'freshly described' }),
      keeper: keeper({ description: null }),
    })
    expect(keeperSilent.row.description).toBe('freshly described')

    const bothSilent = ninaUploadInsertRow({
      messageId: 'msgROW000001',
      claim: claim({ description: null }),
      keeper: keeper({ description: null }),
    })
    expect(bothSilent.row.description).toBeNull()
  })
})

describe('partitionNinaUploadClaims — the same-send split and the race-close split', () => {
  it('sends hash-less claims fresh and never groups them', () => {
    const partition = partitionNinaUploadClaims([claim({ contentHash: null })], new Map())
    expect(partition.fresh).toHaveLength(1)
    expect(partition.references).toHaveLength(0)
  })

  it('references the DB keeper for EVERY claim with that hash, first included', () => {
    const k = keeper()
    const partition = partitionNinaUploadClaims(
      [claim(), claim({ sortOrder: 1 })],
      new Map([[HASH, k]]),
    )
    expect(partition.fresh).toHaveLength(0)
    expect(partition.references).toHaveLength(2)
    for (const reference of partition.references) {
      expect(reference.keeper).toBe(k)
    }
  })

  it('splits same-send twins: first fresh, later ones reference the same-send original', () => {
    const partition = partitionNinaUploadClaims(
      [
        claim(),
        claim({
          sortOrder: 1,
          pathname: 'nina/u1/chat/bbbbbbbbbbbb-cccccccccccccccccccccccccccccccc.jpg',
        }),
      ],
      new Map(),
    )
    expect(partition.fresh).toHaveLength(1)
    expect(partition.references).toHaveLength(1)
    expect(partition.references[0]?.keeper).toBeNull()
    expect(partition.references[0]?.claim.sortOrder).toBe(1)
  })

  it('three twins -> one original, two references, in order', () => {
    const partition = partitionNinaUploadClaims(
      [claim(), claim({ sortOrder: 1 }), claim({ sortOrder: 2 })],
      new Map(),
    )
    expect(partition.fresh).toHaveLength(1)
    expect(partition.references.map((r) => r.claim.sortOrder)).toEqual([1, 2])
  })

  it('a DB keeper wins over the same-send split', () => {
    const k = keeper()
    const partition = partitionNinaUploadClaims(
      [claim(), claim({ sortOrder: 1 })],
      new Map([[HASH, k]]),
    )
    expect(partition.fresh).toHaveLength(0)
    expect(partition.references.every((r) => r.keeper === k)).toBe(true)
  })
})
