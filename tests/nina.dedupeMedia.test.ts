import { describe, expect, it } from 'vitest'

import { contentHashOf } from '@/lib/photos/contentHash'
import {
  buildFillOps,
  buildFillPerceptualOps,
  buildMergePlan,
  buildPerceptualMergePlan,
  compareKeeperCandidates,
  decodeStoredSignature,
  dhashHamming,
  dhashHexOf,
  electKeeper,
  groupKeyOf,
  isOriginalRow,
  isPerceptualTwin,
  isSha256Hex,
  isStoreUrl,
  parseArgs,
  parseDhashHex,
  partitionGroup,
  perceptualVerifyCandidates,
  PERCEPTUAL_MAX_DHASH,
  PERCEPTUAL_MAX_SIG16,
  releaseDecision,
  sha256Hex,
  sig16FromBase64,
  sig16MeanAbs,
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

describe('buildFillOps — pass 1 writes what it measured', () => {
  /**
   * The first landing computed pass 1's fills for the report and never wrote them: 27 production
   * rows stayed NULL while the header claimed "UPDATE content_hash", and the first post-deploy
   * upload of the kartu kedatangan photograph matched nothing. These tests pin the seam — a fill
   * is an OP, and only ops get written.
   */
  it('turns each null-column row the run measured into a fill-hash op', () => {
    const h1 = 'd'.repeat(64)
    const h2 = 'e'.repeat(64)
    const ops = buildFillOps([
      row({ id: 'measured1', contentHash: h1, verifiedHash: h1, hadNullHash: true }),
      row({ id: 'measured2', contentHash: h2, verifiedHash: h2, hadNullHash: true }),
    ])
    expect(ops).toEqual([
      { op: 'fill-hash', id: 'measured1', hash: h1 },
      { op: 'fill-hash', id: 'measured2', hash: h2 },
    ])
  })

  it('leaves rows that already carried a hash alone — a second run writes nothing (idempotence)', () => {
    expect(buildFillOps([row({ id: 'preset' })])).toEqual([])
    expect(buildFillOps([])).toEqual([])
  })

  it('never fills from a failed GET — an unmeasured hash is not written', () => {
    expect(
      buildFillOps([
        row({
          id: 'gone',
          contentHash: null,
          verifiedHash: null,
          hashFailed: true,
          hadNullHash: true,
        }),
      ]),
    ).toEqual([])
  })

  it('refuses to emit a measurement that is not 64-hex', () => {
    expect(() =>
      buildFillOps([
        row({ id: 'odd', contentHash: 'nope', verifiedHash: 'nope', hadNullHash: true }),
      ]),
    ).toThrow(/64-hex/)
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

/* ── the perceptual pass (2026-09-10's measured defect) ───────────────────────────────────────
 * A photograph downloaded out of the collection and re-uploaded re-encodes on pick, so its bytes
 * — and therefore its content_hash — differ from the original's, and the byte pass can never see
 * the pair. The measured production pair `DfeYafysbVAe` + `zGGxRerRI_jS` (a q0.75 re-encode of
 * the same 679x1024 pixels) measured dHash 0/64 and a 16x16 mean-abs of 0.1/255: a re-encode is
 * perceptually the SAME photograph. The thresholds pin THAT, and nothing looser.
 */
const uniform16 = (v: number): Uint8Array => Uint8Array.from({ length: 256 }, () => v)
const sigOf = (dhash: bigint, sig16: Uint8Array) => ({ dhash, sig16 })

/** A minimal verified original WITH the byte-facts and signature the perceptual pass reads. */
const prow = (
  over: Partial<Row> &
    Pick<Row, 'id'> & {
      width?: number | null
      height?: number | null
      sig?: unknown
      verifiedSig?: unknown
      perceptualSource?: string
    },
): Row =>
  row({
    width: 679,
    height: 1024,
    sig: sigOf(0n, uniform16(100)),
    createdAt: '2026-09-08T02:00:00Z',
    ...over,
  } as Parameters<typeof row>[0]) as Row

describe('perceptual thresholds', () => {
  it('pins the measured gates — dHash ≤ 1 of 64, 16x16 mean-abs ≤ 2 of 255', () => {
    expect(PERCEPTUAL_MAX_DHASH).toBe(1)
    expect(PERCEPTUAL_MAX_SIG16).toBe(2)
  })
  it('dhashHamming counts differing bits', () => {
    expect(dhashHamming(0n, 0n)).toBe(0)
    expect(dhashHamming(0b1n, 0b0n)).toBe(1)
    expect(dhashHamming(0b1011n, 0b0000n)).toBe(3)
    expect(dhashHamming(0xffn << 56n, 0n)).toBe(8)
  })
  it('sig16MeanAbs is the mean absolute difference over the 256 cells', () => {
    expect(sig16MeanAbs(uniform16(100), uniform16(100))).toBe(0)
    expect(sig16MeanAbs(uniform16(100), uniform16(101))).toBe(1)
    expect(sig16MeanAbs(uniform16(100), uniform16(103))).toBe(3)
  })
})

describe('isPerceptualTwin', () => {
  it('accepts the measured pair — same dims, dHash 0, mean-abs 0.1', () => {
    const a = prow({ id: 'DfeYafysbVAe' })
    const b = prow({
      id: 'zGGxRerRI_jS',
      createdAt: '2026-09-10T08:11:00Z',
      sig: sigOf(
        0n,
        Uint8Array.from({ length: 256 }, (_, i) => 100 + (i % 2)),
      ),
    })
    expect(isPerceptualTwin(a, b)).toBe(true)
  })
  it('is inclusive at both gates', () => {
    const a = prow({ id: 'a' })
    const dhashAtGate = prow({ id: 'b', sig: sigOf(BigInt(PERCEPTUAL_MAX_DHASH), uniform16(100)) })
    const sigAtGate = prow({
      id: 'c',
      sig: sigOf(
        0n,
        Uint8Array.from({ length: 256 }, (_, i) => (i < 128 ? 104 : 100)),
      ),
    }) // mean-abs = (128*4 + 128*0)/256 = 2 — exactly at the gate
    expect(isPerceptualTwin(a, dhashAtGate)).toBe(true)
    expect(isPerceptualTwin(a, sigAtGate)).toBe(true)
  })
  it('refuses beyond either gate', () => {
    const a = prow({ id: 'a' })
    expect(isPerceptualTwin(a, prow({ id: 'b', sig: sigOf(0b11n, uniform16(100)) }))).toBe(false) // two differing bits — one past the dHash gate
    expect(isPerceptualTwin(a, prow({ id: 'b', sig: sigOf(0n, uniform16(103)) }))).toBe(false)
  })
  it('refuses different or missing dimensions — a recode keeps dims, a different crop does not', () => {
    const a = prow({ id: 'a' })
    expect(isPerceptualTwin(a, prow({ id: 'b', width: 768 }))).toBe(false)
    expect(isPerceptualTwin(a, prow({ id: 'b', height: 1152 }))).toBe(false)
    expect(isPerceptualTwin(a, prow({ id: 'b', width: null }))).toBe(false)
  })
  it('refuses a row whose bytes were never signed', () => {
    expect(isPerceptualTwin(prow({ id: 'a' }), prow({ id: 'b', sig: undefined }))).toBe(false)
  })
})

describe('buildPerceptualMergePlan', () => {
  it('merges the measured pair: repoint + byte-facts, then release — rows first, blob second', () => {
    const keeper = prow({ id: 'DfeYafysbVAe', contentHash: H_SELFIE, messageId: 'msgA' })
    const loser = prow({
      id: 'zGGxRerRI_jS',
      contentHash: H_KARTU,
      createdAt: '2026-09-10T08:11:00Z',
      messageId: 'msgB',
    })
    const { ops, groups } = buildPerceptualMergePlan([keeper, loser])
    expect(groups).toHaveLength(1)
    expect(groups[0]).toMatchObject({ action: 'merge', perceptual: true, keeperId: keeper.id })
    expect(ops).toHaveLength(2)
    expect(ops[0]).toEqual({
      op: 'merge-row',
      id: 'zGGxRerRI_jS',
      keeperId: 'DfeYafysbVAe',
      blobUrl: keeper.blobUrl,
      pathname: keeper.pathname,
      contentHash: H_SELFIE,
      width: 679,
      height: 1024,
      bytes: 1000,
    })
    expect(ops[1]).toMatchObject({
      op: 'release-blob',
      pathname: loser.pathname,
      blobUrl: loser.blobUrl,
    })
  })
  it('elects the keeper with the standing order (message-anchored, described, oldest)', () => {
    const old = prow({ id: 'old', createdAt: '2026-09-07T00:00:00Z' })
    const newer = prow({ id: 'new', createdAt: '2026-09-10T00:00:00Z', messageId: 'm' })
    const { groups } = buildPerceptualMergePlan([old, newer])
    expect(groups[0]?.keeperId).toBe('new')
  })
  it('never merges across dimensions', () => {
    const a = prow({ id: 'a' })
    const b = prow({ id: 'b', width: 768 })
    const { ops, groups } = buildPerceptualMergePlan([a, b])
    expect(ops).toEqual([])
    expect(groups).toEqual([])
  })
  it('never merges across users', () => {
    const a = prow({ id: 'a' })
    const b = prow({ id: 'b', userId: 'another-user' })
    expect(buildPerceptualMergePlan([a, b]).ops).toEqual([])
  })
  it('a reference is not a tile — only originals participate', () => {
    const a = prow({ id: 'a' })
    const ref = prow({ id: 'ref', sourceImageId: 'a' })
    const { ops, groups } = buildPerceptualMergePlan([a, ref])
    expect(ops).toEqual([])
    expect(groups).toEqual([])
  })
  it('unsigned rows are skipped, and a lone original produces nothing (idempotence)', () => {
    const a = prow({ id: 'a' })
    const unsigned = prow({ id: 'b', sig: undefined })
    expect(buildPerceptualMergePlan([a, unsigned]).ops).toEqual([])
    expect(buildPerceptualMergePlan([a]).ops).toEqual([])
    expect(buildPerceptualMergePlan([a]).groups).toEqual([])
  })
  it('honours excludeIds — a row the byte pass already repointed this run is not touched twice', () => {
    const a = prow({ id: 'a' })
    const b = prow({ id: 'b', createdAt: '2026-09-10T00:00:00Z' })
    expect(buildPerceptualMergePlan([a, b], new Set(['b'])).groups).toEqual([])
  })
  it('two losers sharing one old object release it once, after both repoints', () => {
    const keeper = prow({ id: 'k', createdAt: '2026-09-07T00:00:00Z' })
    const sharedUrl = `https://store.public.blob.vercel-storage.com/nina/${USER}/chat/shared.jpg`
    const l1 = prow({ id: 'l1', blobUrl: sharedUrl, pathname: `nina/${USER}/chat/shared.jpg` })
    const l2 = prow({ id: 'l2', blobUrl: sharedUrl, pathname: `nina/${USER}/chat/shared.jpg` })
    const { ops } = buildPerceptualMergePlan([keeper, l1, l2])
    const mergeIdx = ops.map((o) => o.op).lastIndexOf('merge-row')
    const releaseIdx = ops.map((o) => o.op).indexOf('release-blob')
    expect(ops.filter((o) => o.op === 'merge-row')).toHaveLength(2)
    expect(ops.filter((o) => o.op === 'release-blob')).toHaveLength(1)
    expect(mergeIdx).toBeLessThan(releaseIdx)
  })
})

/* ── perceptual-repair (2026-09-11's measured defect) ────────────────────────────────────────────
 * `I1v6qeHJBMwv` (production) carried a stored `perceptual_hash` of `74749c8c8e9a9c98` — 26/64
 * bits from its true re-upload twin `YnIGDDwYH4HT` (`f0c29c64c4060604`), so STEP 1b rejected a
 * pixel-identical re-upload as a stranger. A fresh GET + sign of `I1v6qeHJBMwv`'s own live blob
 * measured `f0c69c64c4060604` — 1 bit from the twin, inside the gate. The stored value was simply
 * wrong; nothing before this pass ever re-measured a signature once it was decoded from storage.
 */
describe('perceptualVerifyCandidates — which stored signatures get re-verified', () => {
  it('selects rows sharing (user, width, height) with another original, only when stored', () => {
    const a = prow({ id: 'a', perceptualSource: 'stored' })
    const b = prow({ id: 'b', perceptualSource: 'stored' })
    expect(
      perceptualVerifyCandidates([a, b])
        .map((r) => r.id)
        .sort(),
    ).toEqual(['a', 'b'])
  })
  it("excludes a row whose dimensions are unique among its user's originals", () => {
    const a = prow({ id: 'a', perceptualSource: 'stored' })
    const b = prow({ id: 'b', width: 768, perceptualSource: 'stored' })
    expect(perceptualVerifyCandidates([a, b])).toEqual([])
  })
  it('excludes a row this run already measured fresh — nothing could have written it since', () => {
    const a = prow({ id: 'a', perceptualSource: 'measured' })
    const b = prow({ id: 'b', perceptualSource: 'stored' })
    expect(perceptualVerifyCandidates([a, b]).map((r) => r.id)).toEqual(['b'])
  })
  it('excludes a reference — only originals participate', () => {
    const a = prow({ id: 'a', perceptualSource: 'stored' })
    const ref = prow({ id: 'ref', sourceImageId: 'a', perceptualSource: 'stored' })
    expect(perceptualVerifyCandidates([a, ref])).toEqual([])
  })
  it('never crosses users', () => {
    const a = prow({ id: 'a', perceptualSource: 'stored' })
    const b = prow({ id: 'b', userId: 'another-user', perceptualSource: 'stored' })
    expect(perceptualVerifyCandidates([a, b])).toEqual([])
  })
})

describe('buildPerceptualMergePlan — perceptual-repair', () => {
  it('emits a repair when a fresh GET contradicts the stored signature, and merges on the corrected value', () => {
    const stale = prow({
      id: 'I1v6qeHJBMwv',
      sig: sigOf(BigInt('0x' + '7'.repeat(16)), uniform16(200)), // the wrong, stored value
      verifiedSig: sigOf(0n, uniform16(100)), // the true, freshly-measured value
      perceptualSource: 'stored',
      createdAt: '2026-09-11T04:34:00Z',
    })
    const upload = prow({
      id: 'YnIGDDwYH4HT',
      sig: sigOf(0n, uniform16(100)), // the twin's own (correct) signature
      createdAt: '2026-09-11T06:29:00Z',
      messageId: 'm',
    })

    const { ops, groups } = buildPerceptualMergePlan([stale, upload])

    expect(ops[0]).toEqual({
      op: 'perceptual-repair',
      id: 'I1v6qeHJBMwv',
      dhash: dhashHexOf(0n),
      sig: Buffer.from(uniform16(100)).toString('base64'),
    })
    expect(groups).toHaveLength(1)
    expect(groups[0]).toMatchObject({ action: 'merge', perceptual: true })
  })
  it('writes nothing when the fresh GET confirms the stored signature', () => {
    const a = prow({ id: 'a', verifiedSig: sigOf(0n, uniform16(100)) })
    expect(buildPerceptualMergePlan([a]).ops).toEqual([])
  })
  it('a row nobody re-verified this run is trusted exactly as before', () => {
    const a = prow({ id: 'a' })
    const b = prow({ id: 'b', createdAt: '2026-09-10T00:00:00Z' })
    const { ops } = buildPerceptualMergePlan([a, b])
    expect(ops.some((o) => o.op === 'perceptual-repair')).toBe(false)
  })
})

/* ── The stored-signature columns (media-dedupe follow-up, 2026-09-10) ──────────────────────────
 * The write paths sign rows now; the sweep's job is to DECODE what is stored, MEASURE only what
 * is not, and PERSIST what it measured. These describe blocks hold the parsers and the two op
 * builders to the same contracts `lib/nina/perceptual.ts`'s tests hold the app-side copies — the
 * .mjs mirror cannot import them, so agreement here is the only thing keeping the two spellings
 * one spelling. */

describe('dhashHexOf / parseDhashHex — the stored perceptual_hash form', () => {
  it('round-trips zero-padded 16-hex, both directions', () => {
    expect(dhashHexOf(0n)).toBe('0000000000000000')
    expect(dhashHexOf(0x484c6c62414e7e5fn)).toBe('484c6c62414e7e5f')
    expect(parseDhashHex('484c6c62414e7e5f')).toBe(0x484c6c62414e7e5fn)
    expect(parseDhashHex(dhashHexOf(0xabcdef0123456789n))).toBe(0xabcdef0123456789n)
  })
  it('rejects anything that is not exactly 16 lowercase hex — null, never a throw', () => {
    expect(parseDhashHex('484C6C62414E7E5F')).toBe(null) // uppercase never comes from the signer
    expect(parseDhashHex('484c6c62414e7e5')).toBe(null) // 15 chars
    expect(parseDhashHex('484c6c62414e7e5ff')).toBe(null) // 17 chars
    expect(parseDhashHex('0x484c6c62414e7e5f')).toBe(null)
    expect(parseDhashHex(1234)).toBe(null)
    expect(parseDhashHex(null)).toBe(null)
    expect(parseDhashHex(undefined)).toBe(null)
  })
})

describe('sig16FromBase64 — the stored perceptual_sig form', () => {
  it('decodes exactly 256 bytes and nothing else', () => {
    const sig = new Uint8Array(256).map((_, i) => i % 251)
    const encoded = Buffer.from(sig).toString('base64')
    expect(sig16FromBase64(encoded)).toEqual(sig)
    expect(sig16FromBase64(Buffer.from(new Uint8Array(255)).toString('base64'))).toBe(null)
    expect(sig16FromBase64(Buffer.from(new Uint8Array(257)).toString('base64'))).toBe(null)
    expect(sig16FromBase64('')).toBe(null)
    expect(sig16FromBase64(null)).toBe(null)
    expect(sig16FromBase64(42)).toBe(null)
  })
})

describe('decodeStoredSignature — a stored pair is the signature, never re-measured', () => {
  const HEX = '484c6c62414e7e5f'
  const SIG = Buffer.from(new Uint8Array(256).fill(7)).toString('base64')

  it('decodes a stored pair into the planning shape', () => {
    const decoded = decodeStoredSignature(row({ id: 'a', perceptualHash: HEX, perceptualSig: SIG }))
    expect(decoded).toEqual({ dhash: 0x484c6c62414e7e5fn, sig16: new Uint8Array(256).fill(7) })
  })
  it('an unsigned row does not participate', () => {
    expect(decodeStoredSignature(row({ id: 'a', perceptualHash: null, perceptualSig: null }))).toBe(
      null,
    )
  })
  it('a half-signed row does not either — both halves or neither', () => {
    expect(decodeStoredSignature(row({ id: 'a', perceptualHash: HEX, perceptualSig: null }))).toBe(
      null,
    )
    expect(decodeStoredSignature(row({ id: 'a', perceptualHash: null, perceptualSig: SIG }))).toBe(
      null,
    )
  })
})

describe('buildFillPerceptualOps — pass 3c writes what it measured', () => {
  const HEX = '484c6c62414e7e5f'
  const sig16 = new Uint8Array(256).fill(9)

  it('ops a row this run measured, with the canonical hex and base64 forms', () => {
    const measured = row({
      id: 'measured',
      perceptualHash: null,
      perceptualSig: null,
      sig: sigOf(0x484c6c62414e7e5fn, sig16),
      perceptualSource: 'measured',
    } as Parameters<typeof row>[0])
    expect(buildFillPerceptualOps([measured])).toEqual([
      {
        op: 'fill-perceptual',
        id: 'measured',
        dhash: HEX,
        sig: Buffer.from(sig16).toString('base64'),
      },
    ])
  })
  it('never ops a row whose signature came from the store — decode, not re-write', () => {
    const stored = row({
      id: 'stored',
      perceptualHash: HEX,
      perceptualSig: Buffer.from(sig16).toString('base64'),
      sig: sigOf(0x484c6c62414e7e5fn, sig16),
      perceptualSource: 'stored',
    } as Parameters<typeof row>[0])
    expect(buildFillPerceptualOps([stored])).toEqual([])
  })
  it('never ops an unsigned or unmeasured row', () => {
    expect(buildFillPerceptualOps([row({ id: 'plain' })])).toEqual([])
    expect(
      buildFillPerceptualOps([
        row({ id: 'nosource', sig: sigOf(0n, sig16) } as Parameters<typeof row>[0]),
      ]),
    ).toEqual([])
  })
})
