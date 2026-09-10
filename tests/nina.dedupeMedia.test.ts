import { describe, expect, it } from 'vitest'

import { contentHashOf } from '@/lib/photos/contentHash'
import {
  buildMergePlan,
  compareKeeperCandidates,
  electKeeper,
  groupKeyOf,
  isOriginalRow,
  isSha256Hex,
  isStoreUrl,
  parseArgs,
  partitionGroup,
  releaseDecision,
  sha256Hex,
} from '@/scripts/nina-dedupe-plan.mjs'

/**
 * The pure half of `scripts/nina-dedupe-media.mjs`. The script's own I/O — GETting blobs,
 * writing production, deleting Blob objects — is prod-only by construction and is covered by the
 * phase plan's Verification section (a dry run against production, then a post-apply query set),
 * exactly as `tests/nina.profpic.test.ts:18-23` argues for its script.
 *
 * The merge fixtures are the two measured production groups (`20260910-103604_code_analyzer.md`,
 * "Measured Evidence"), shrunk to their load-bearing fields. If the keeper for the kartu
 * kedatangan pair ever stops being `sbTuT8NKXL24`, the sweep's output on production has changed
 * meaning — that is what these tests are for.
 */

const USER = 'e6f1a0c2-1111-4222-8333-444455556666'
const H_KARTU = 'a'.repeat(64)
const H_SELFIE = 'b'.repeat(64)
const H_TIDY = 'c'.repeat(64)

type Row = Parameters<typeof buildMergePlan>[0][number]

/** A minimal verified original; tests override the fields that matter. */
const row = (over: Partial<Row> & Pick<Row, 'id'>): Row => ({
  userId: USER,
  messageId: null,
  kind: 'upload',
  blobUrl: `https://store.public.blob.vercel-storage.com/nina/${USER}/chat/${over.id}.jpg`,
  pathname: `nina/${USER}/chat/${over.id}.jpg`,
  bytes: 1000,
  description: null,
  sourceAvatarId: null,
  sourceImageId: null,
  createdAt: '2026-09-09T02:00:00Z',
  contentHash: H_KARTU,
  verifiedHash: H_KARTU,
  hashFailed: false,
  ...over,
})

describe('parseArgs', () => {
  it('defaults to a dry run', () => {
    expect(parseArgs([])).toEqual({ apply: false })
  })
  it('reads --apply', () => {
    expect(parseArgs(['--apply']).apply).toBe(true)
  })
  it('refuses any other flag', () => {
    expect(() => parseArgs(['--delete'])).toThrow(/unknown flag --delete/)
    expect(() => parseArgs(['--apply', '--force'])).toThrow(/unknown flag --force/)
  })
})

describe('sha256Hex', () => {
  it('answers the FIPS 180-4 vector', () => {
    expect(sha256Hex(new TextEncoder().encode('abc'))).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    )
  })
  it('agrees with phase 1s browser-side crypto.subtle implementation', async () => {
    const bytes = new Uint8Array([1, 2, 3, 4, 250, 251, 252, 253, 254, 255])
    expect(sha256Hex(bytes)).toBe(await contentHashOf(bytes))
  })
})

describe('isSha256Hex / isStoreUrl / isOriginalRow', () => {
  it('accepts only 64 lowercase hex', () => {
    expect(isSha256Hex('a'.repeat(64))).toBe(true)
    expect(isSha256Hex('A'.repeat(64))).toBe(false)
    expect(isSha256Hex('a'.repeat(63))).toBe(false)
    expect(isSha256Hex(null)).toBe(false)
  })
  it('accepts only public blob store URLs', () => {
    expect(isStoreUrl('https://abc123.public.blob.vercel-storage.com/nina/u/chat/x.jpg')).toBe(true)
    expect(isStoreUrl('http://abc123.public.blob.vercel-storage.com/x.jpg')).toBe(false)
    expect(isStoreUrl('https://evil.example.com/x.jpg')).toBe(false)
    expect(isStoreUrl(undefined)).toBe(false)
  })
  it('defines original as both provenance columns null', () => {
    expect(isOriginalRow(row({ id: 'r1' }))).toBe(true)
    expect(isOriginalRow(row({ id: 'r2', sourceImageId: 'k' }))).toBe(false)
    expect(isOriginalRow(row({ id: 'r3', sourceAvatarId: 'a' }))).toBe(false)
  })
})

describe('keeper election', () => {
  it('prefers a message-anchored row over an older undescribed orphan (the measured kartu pair)', () => {
    const keeper = row({
      id: 'sbTuT8NKXL24',
      messageId: 'VNu9upqvtK5X',
      description: 'kartu',
      createdAt: '2026-09-10T02:00:00Z',
    })
    const loser = row({ id: 'ywNnXvpnnKSi', createdAt: '2026-09-09T02:00:00Z' })
    expect(compareKeeperCandidates(keeper, loser)).toBeLessThan(0)
    expect(electKeeper([loser, keeper]).id).toBe('sbTuT8NKXL24')
  })
  it('prefers a described row when neither has a message', () => {
    const a = row({ id: 'aaa', description: 'seen', createdAt: '2026-09-10T02:00:00Z' })
    const b = row({ id: 'bbb', createdAt: '2026-09-09T02:00:00Z' })
    expect(electKeeper([b, a]).id).toBe('aaa')
  })
  it('treats an empty description as undescribed', () => {
    const a = row({ id: 'aaa', description: '', createdAt: '2026-09-10T02:00:00Z' })
    const b = row({ id: 'bbb', createdAt: '2026-09-09T02:00:00Z' })
    expect(electKeeper([a, b]).id).toBe('bbb')
  })
  it('breaks metadata ties by oldest created_at', () => {
    const older = row({ id: 'zzz', createdAt: '2026-09-07T02:00:00Z' })
    const newer = row({ id: 'aaa', createdAt: '2026-09-10T02:00:00Z' })
    expect(electKeeper([newer, older]).id).toBe('zzz')
  })
  it('breaks a full tie by id ascending, so the order is total', () => {
    const a = row({ id: 'aaa', createdAt: '2026-09-09T02:00:00Z' })
    const z = row({ id: 'zzz', createdAt: '2026-09-09T02:00:00Z' })
    expect(electKeeper([z, a]).id).toBe('aaa')
    expect(electKeeper([a, z]).id).toBe('aaa')
  })
  it('is order-independent over a larger field', () => {
    const field = [
      row({ id: 'm1', messageId: 'x' }),
      row({ id: 'm2', messageId: 'y', description: 'd' }),
      row({ id: 'r3', createdAt: '2026-09-01T00:00:00Z' }),
      row({ id: 'r4', description: 'd' }),
    ]
    expect(electKeeper(field).id).toBe('m2')
    expect(electKeeper([...field].reverse()).id).toBe('m2')
  })
  it('refuses an empty candidate list', () => {
    expect(() => electKeeper([])).toThrow(/no original/)
  })
})

describe('buildMergePlan — the measured production groups', () => {
  it('merges the kartu kedatangan pair: repoint the loser, release its object, keeper untouched', () => {
    const keeper = row({
      id: 'sbTuT8NKXL24',
      messageId: 'VNu9upqvtK5X',
      description: 'kartu kedatangan',
      createdAt: '2026-09-10T02:00:00Z',
      bytes: 66_823,
    })
    const loser = row({ id: 'ywNnXvpnnKSi', createdAt: '2026-09-09T02:00:00Z', bytes: 66_823 })
    const plan = buildMergePlan([loser, keeper])
    expect(plan.groups).toHaveLength(1)
    expect(plan.groups[0]).toMatchObject({
      action: 'merge',
      keeperId: 'sbTuT8NKXL24',
      loserIds: ['ywNnXvpnnKSi'],
    })
    expect(plan.ops).toEqual([
      {
        op: 'merge-row',
        id: 'ywNnXvpnnKSi',
        keeperId: 'sbTuT8NKXL24',
        blobUrl: keeper.blobUrl,
        pathname: keeper.pathname,
      },
      {
        op: 'release-blob',
        userId: USER,
        pathname: loser.pathname,
        blobUrl: loser.blobUrl,
        bytes: 66_823,
      },
    ])
  })

  it('repoints the measured selfie reference whose URL diverges from its keeper (1dMy2Zs5V1MJ)', () => {
    const original = row({
      id: 'W-hhpnGxV0SI',
      kind: 'generated',
      createdAt: '2026-09-07T02:00:00Z',
      bytes: 110_068,
      contentHash: H_SELFIE,
      verifiedHash: H_SELFIE,
      blobUrl: 'https://s.public.blob.vercel-storage.com/nina/u/chat/W-hhpnGxV0SI.png',
      pathname: 'nina/u/chat/W-hhpnGxV0SI.png',
    })
    const ref = row({
      id: '1dMy2Zs5V1MJ',
      kind: 'generated',
      createdAt: '2026-09-09T02:00:00Z',
      bytes: 110_068,
      sourceImageId: 'W-hhpnGxV0SI',
      contentHash: H_SELFIE,
      verifiedHash: H_SELFIE,
      blobUrl: 'https://s.public.blob.vercel-storage.com/nina/u/chat/1dMy2Zs5V1MJ.png',
      pathname: 'nina/u/chat/1dMy2Zs5V1MJ.png',
    })
    const plan = buildMergePlan([ref, original])
    expect(plan.groups[0]).toMatchObject({
      action: 'merge',
      keeperId: 'W-hhpnGxV0SI',
      loserIds: ['1dMy2Zs5V1MJ'],
    })
    expect(plan.ops).toEqual([
      {
        op: 'merge-row',
        id: '1dMy2Zs5V1MJ',
        keeperId: 'W-hhpnGxV0SI',
        blobUrl: original.blobUrl,
        pathname: original.pathname,
      },
      {
        op: 'release-blob',
        userId: USER,
        pathname: ref.pathname,
        blobUrl: ref.blobUrl,
        bytes: 110_068,
      },
    ])
  })

  it('leaves the three same-URL groups untouched — the idempotence shape', () => {
    const original = row({
      id: 'kCeZri0edZ0n',
      createdAt: '2026-09-05T02:00:00Z',
      contentHash: H_TIDY,
      verifiedHash: H_TIDY,
    })
    const ref = row({
      id: 'aTZIezVAGhIU',
      createdAt: '2026-09-06T02:00:00Z',
      sourceImageId: 'kCeZri0edZ0n',
      contentHash: H_TIDY,
      verifiedHash: H_TIDY,
      blobUrl: original.blobUrl,
      pathname: original.pathname,
    })
    const plan = buildMergePlan([original, ref])
    expect(plan.groups[0]).toMatchObject({ action: 'tidy', keeperId: 'kCeZri0edZ0n' })
    expect(plan.ops).toEqual([])
  })

  it('never repoints an avatar reference; reports it instead', () => {
    const original = row({ id: 'orig1', contentHash: H_TIDY, verifiedHash: H_TIDY })
    const avatarRef = row({
      id: 'avref1',
      sourceAvatarId: 'avatar1',
      contentHash: H_TIDY,
      verifiedHash: H_TIDY,
      blobUrl: 'https://s.public.blob.vercel-storage.com/other.png',
      pathname: 'nina/u/chat/other.png',
    })
    const plan = buildMergePlan([original, avatarRef])
    expect(partitionGroup([original, avatarRef]).avatarRefs.map((r) => r.id)).toEqual(['avref1'])
    expect(plan.groups[0]).toMatchObject({
      action: 'tidy',
      keeperId: 'orig1',
      avatarRefIds: ['avref1'],
    })
    expect(plan.ops).toEqual([])
  })

  it('skips a group when any member is unverified, and repairs a drifted hash instead of trusting it', () => {
    const keeper = row({ id: 'k1', messageId: 'm1' })
    const drifted = row({ id: 'd1', verifiedHash: 'f'.repeat(64) })
    const plan = buildMergePlan([keeper, drifted])
    expect(plan.groups[0]).toMatchObject({ action: 'skipped' })
    expect(plan.ops).toEqual([{ op: 'hash-repair', id: 'd1', from: H_KARTU, to: 'f'.repeat(64) }])
    expect(plan.groups[0]?.ids).toContain('k1')
  })

  it('skips a group when any member GET failed — never merge on unproven bytes', () => {
    const keeper = row({ id: 'k1' })
    const broken = row({ id: 'b1', hashFailed: true, verifiedHash: null })
    const plan = buildMergePlan([keeper, broken])
    expect(plan.groups[0]).toMatchObject({ action: 'skipped' })
    expect(plan.ops).toEqual([])
  })

  it('skips a group with no original — a reference is never elected keeper', () => {
    const refs = [
      row({ id: 'r1', sourceImageId: 'gone', contentHash: H_SELFIE, verifiedHash: H_SELFIE }),
      row({ id: 'r2', sourceImageId: 'gone', contentHash: H_SELFIE, verifiedHash: H_SELFIE }),
    ]
    const plan = buildMergePlan(refs)
    expect(plan.groups[0]).toMatchObject({ action: 'skipped' })
    expect(plan.ops).toEqual([])
  })

  it('emits one release per distinct old URL even when two losers shared it', () => {
    const keeper = row({ id: 'k1', messageId: 'm1' })
    const shared = 'https://s.public.blob.vercel-storage.com/nina/u/chat/twin.jpg'
    const l1 = row({ id: 'l1', blobUrl: shared, pathname: 'nina/u/chat/twin.jpg' })
    const l2 = row({ id: 'l2', blobUrl: shared, pathname: 'nina/u/chat/twin.jpg' })
    const plan = buildMergePlan([keeper, l1, l2])
    expect(plan.ops.filter((o) => o.op === 'merge-row')).toHaveLength(2)
    expect(plan.ops.filter((o) => o.op === 'release-blob')).toHaveLength(1)
    const firstReleaseIdx = plan.ops.findIndex((o) => o.op === 'release-blob')
    const lastMergeIdx = plan.ops.reduce((last, o, i) => (o.op === 'merge-row' ? i : last), -1)
    expect(firstReleaseIdx).toBeGreaterThanOrEqual(0)
    expect(firstReleaseIdx).toBeGreaterThan(lastMergeIdx)
  })

  it('scopes groups by user — identical bytes across users never merge (invariant 5)', () => {
    const other = row({ id: 'o1', userId: '00000000-0000-4000-8000-000000000000' })
    const mine = row({ id: 'm1' })
    const plan = buildMergePlan([other, mine])
    expect(plan.groups).toHaveLength(0)
    expect(plan.ops).toEqual([])
    expect(groupKeyOf(other)).not.toBe(groupKeyOf(mine))
  })

  it('sorts groups deterministically by (user, hash)', () => {
    // Both hash classes need ≥2 members — singleton keys never become groups (the test above).
    const a1 = row({ id: 'a1', contentHash: H_SELFIE, verifiedHash: H_SELFIE })
    const a2 = row({ id: 'a2', contentHash: H_SELFIE, verifiedHash: H_SELFIE })
    const b = row({ id: 'b1', contentHash: H_KARTU })
    const c = row({ id: 'c1', contentHash: H_KARTU })
    const plan = buildMergePlan([a1, a2, b, c])
    expect(plan.groups.map((g) => g.contentHash)).toEqual([H_KARTU, H_SELFIE])
  })

  it('refuses a row that arrives without a hash', () => {
    expect(() =>
      buildMergePlan([row({ id: 'x', contentHash: 'nope', verifiedHash: null })]),
    ).toThrow(/64-hex/)
  })

  it('ignores singleton rows entirely', () => {
    const plan = buildMergePlan([row({ id: 'solo' })])
    expect(plan.groups).toEqual([])
    expect(plan.ops).toEqual([])
  })
})

describe('releaseDecision', () => {
  it('releases only at zero references everywhere', () => {
    expect(releaseDecision({ imageRefs: 0, avatarRefs: 0, jsonbRefs: 0 })).toBe('released')
  })
  it('keeps when another image row still names it', () => {
    expect(releaseDecision({ imageRefs: 1, avatarRefs: 0, jsonbRefs: 0 })).toBe('kept-shared')
  })
  it('an avatar match alone refuses the delete', () => {
    expect(releaseDecision({ imageRefs: 0, avatarRefs: 1, jsonbRefs: 0 })).toBe('kept-avatar')
    expect(releaseDecision({ imageRefs: 0, avatarRefs: 2, jsonbRefs: 1 })).toBe('kept-avatar')
  })
  it('a jsonb mention refuses the delete', () => {
    expect(releaseDecision({ imageRefs: 0, avatarRefs: 0, jsonbRefs: 1 })).toBe('kept-jsonb')
  })
  it('an unreadable count keeps the object — never delete on unknown', () => {
    expect(releaseDecision({ imageRefs: null, avatarRefs: 0, jsonbRefs: 0 })).toBe('kept-unknown')
    expect(releaseDecision({})).toBe('kept-unknown')
    expect(releaseDecision({ imageRefs: 0, avatarRefs: -1, jsonbRefs: 0 })).toBe('kept-unknown')
  })
})
