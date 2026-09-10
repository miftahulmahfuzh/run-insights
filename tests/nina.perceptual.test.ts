import { describe, expect, it } from 'vitest'

import {
  applyPerceptualKeepers,
  ninaUploadInsertRow,
  partitionNinaUploadClaims,
  type NinaUploadClaim,
  type NinaUploadKeeper,
  type NinaUploadPartition,
} from '@/lib/nina/dedupe'
import {
  dhashHamming,
  dhashHexOf,
  isPerceptualTwin,
  normalizeClaimedPerceptualHash,
  normalizeClaimedPerceptualSig,
  parseDhashHex,
  PERCEPTUAL_MAX_DHASH,
  PERCEPTUAL_MAX_SIG16,
  sig16FromBase64,
  sig16MeanAbs,
  sig16ToBase64,
} from '@/lib/nina/perceptual'

/**
 * The perceptual twin layer as pure decisions (media-dedupe follow-up, 2026-09-10). The signer
 * (`lib/nina/perceptualSign.ts`) is sharp over real bytes and is pinned to the sweep's pipeline by
 * its header, not by a test — what CAN be held without a database, a decoder or a mock is held
 * here: the stored forms, the gates, and the partition conversion that turns a twin match into a
 * reference row.
 *
 * The known-answer vector is the measured production pair (`bjNniaR6_0dY` + `IGwGhWzPNmaR`, both
 * 736x981): identical 64-bit dHashes, mean-abs 0.043 — a real re-encode, not a constructed one.
 */

describe('the pinned gates match the sweep', () => {
  it('dHash ≤ 1 of 64, 16x16 mean-abs ≤ 2 of 255', () => {
    expect(PERCEPTUAL_MAX_DHASH).toBe(1)
    expect(PERCEPTUAL_MAX_SIG16).toBe(2)
  })
})

describe('dhashHexOf / parseDhashHex — the stored form of the dHash', () => {
  it('zero-pads to 16 and round-trips', () => {
    expect(dhashHexOf(0n)).toBe('0000000000000000')
    expect(dhashHexOf(0x484c6c62414e7e5fn)).toBe('484c6c62414e7e5f')
    expect(parseDhashHex(dhashHexOf(0xffffffffffffffffn))).toBe(0xffffffffffffffffn)
  })
  it('rejects non-canonical claims as null — the column keeps ONE spelling', () => {
    expect(parseDhashHex('484C6C62414E7E5F')).toBe(null)
    expect(parseDhashHex(' 484c6c62414e7e5f')).toBe(null)
    expect(parseDhashHex('484c6c62414e7e5f '.trim() + '0')).toBe(null)
    expect(parseDhashHex('')).toBe(null)
    expect(parseDhashHex(7)).toBe(null)
  })
})

describe('sig16 round trips', () => {
  it('base64 encodes and decodes 256 bytes exactly', () => {
    const sig = new Uint8Array(256)
    for (let i = 0; i < 256; i++) sig[i] = (i * 7) % 256
    const decoded = sig16FromBase64(sig16ToBase64(sig))
    expect(decoded).not.toBe(null)
    expect(Array.from(decoded!)).toEqual(Array.from(sig))
  })
  it('a signature of any other size is no signature', () => {
    expect(sig16FromBase64(sig16ToBase64(new Uint8Array(255)))).toBe(null)
    expect(sig16FromBase64(sig16ToBase64(new Uint8Array(0)))).toBe(null)
    expect(sig16FromBase64('eA')).toBe(null)
  })
  it('the claim normalizers re-format or null, never throw', () => {
    expect(normalizeClaimedPerceptualHash('484c6c62414e7e5f')).toBe('484c6c62414e7e5f')
    expect(normalizeClaimedPerceptualHash('zz')).toBe(null)
    expect(normalizeClaimedPerceptualSig(sig16ToBase64(new Uint8Array(256).fill(1)))).toBe(
      sig16ToBase64(new Uint8Array(256).fill(1)),
    )
    expect(normalizeClaimedPerceptualSig('eA')).toBe(null)
  })
})

describe('dhashHamming / sig16MeanAbs', () => {
  it('counts differing bits', () => {
    expect(dhashHamming(0n, 0n)).toBe(0)
    expect(dhashHamming(1n, 0n)).toBe(1)
    expect(dhashHamming(0b1011n, 0n)).toBe(3)
    expect(dhashHamming(0n, 0xffffffffffffffffn)).toBe(64)
  })
  it('mean-abs over two 16x16 signatures', () => {
    expect(sig16MeanAbs(new Uint8Array(256).fill(10), new Uint8Array(256).fill(10))).toBe(0)
    expect(sig16MeanAbs(new Uint8Array(256).fill(10), new Uint8Array(256).fill(11))).toBeCloseTo(1)
  })
  it('mismatched or empty signatures are Infinity, not an estimate', () => {
    expect(sig16MeanAbs(new Uint8Array(256), new Uint8Array(255))).toBe(Number.POSITIVE_INFINITY)
    expect(sig16MeanAbs(new Uint8Array(0), new Uint8Array(0))).toBe(Number.POSITIVE_INFINITY)
  })
})

describe('isPerceptualTwin — the three gates, ALL required', () => {
  const uniform = (n: number) => new Uint8Array(256).fill(n)
  const candidate = (over: {
    width?: number | null
    height?: number | null
    dhash?: bigint
    sig16?: Uint8Array
  }) => ({
    width: 736,
    height: 981,
    dhash: 0x484c6c62414e7e5fn,
    sig16: uniform(100),
    ...over,
  })

  it('the measured production pair: identical dHash, mean-abs 0.043 — a twin', () => {
    // both signatures measured integral here; the real pair differed by 0.043 — comfortably in
    expect(isPerceptualTwin(candidate({}), candidate({}))).toBe(true)
  })
  it('different dimensions — the same pixels at another size are NOT a twin', () => {
    expect(isPerceptualTwin(candidate({}), candidate({ width: 576 }))).toBe(false)
    expect(isPerceptualTwin(candidate({}), candidate({ height: 800 }))).toBe(false)
  })
  it('null dimensions — an undimensioned row never matches', () => {
    expect(isPerceptualTwin(candidate({ width: null }), candidate({}))).toBe(false)
  })
  it('dHash distance 1 passes the gate, 2 does not', () => {
    expect(isPerceptualTwin(candidate({}), candidate({ dhash: 0x484c6c62414e7e5en }))).toBe(true)
    expect(isPerceptualTwin(candidate({}), candidate({ dhash: 0x484c6c62414e7e5cn }))).toBe(false)
  })
  it('mean-abs exactly at the gate passes, beyond it fails', () => {
    expect(isPerceptualTwin(candidate({}), candidate({ sig16: uniform(102) }))).toBe(true)
    expect(isPerceptualTwin(candidate({}), candidate({ sig16: uniform(103) }))).toBe(false)
  })
})

/* ── applyPerceptualKeepers: the conversion, and what it must not touch ───────────────────────── */

const claim = (
  over: Partial<NinaUploadClaim> & Pick<NinaUploadClaim, 'pathname'>,
): NinaUploadClaim => ({
  blobUrl: `https://blob.example/${over.pathname}`,
  width: 736,
  height: 981,
  bytes: 50_000,
  description: 'same pixels, new bytes',
  sortOrder: 0,
  contentHash: null,
  perceptual: null,
  ...over,
})

const keeper: NinaUploadKeeper = {
  id: 'imgTWIN000001',
  kind: 'generated',
  blobUrl: 'https://blob.example/nina/u1/selfie-keeper.png',
  pathname: 'nina/u1/selfie-keeper.png',
  description: 'her selfie, described',
  sourceAvatarId: null,
  sourceImageId: null,
}

const partitionOf = (claims: NinaUploadClaim[]): NinaUploadPartition =>
  partitionNinaUploadClaims(claims, new Map())

describe('applyPerceptualKeepers', () => {
  it('converts a fresh claim with a twin into a reference to that keeper', () => {
    const p = partitionOf([claim({ pathname: 'p1' })])
    const converted = applyPerceptualKeepers(p, new Map([['p1', keeper]]))
    expect(converted.fresh).toEqual([])
    expect(converted.references).toEqual([{ claim: expect.anything(), keeper }])
  })
  it('leaves every other arm exactly as the byte partition answered', () => {
    const twinClaim = claim({ pathname: 'twin', contentHash: 'a'.repeat(64) })
    const byteKeeper: NinaUploadKeeper = { ...keeper, id: 'imgBYTE00001' }
    const bytePartition = partitionNinaUploadClaims(
      [twinClaim],
      new Map([['a'.repeat(64), byteKeeper]]),
    )
    const untouched = applyPerceptualKeepers(
      bytePartition,
      new Map([['twin', keeper]]), // a perceptual answer for a claim the bytes already settled
    )
    expect(untouched.references).toHaveLength(1)
    expect(untouched.references[0]!.keeper).toBe(byteKeeper)
    expect(untouched.fresh).toEqual([])
  })
  it('a same-send twin follows its byte set: when the fresh claim converts, the twin converts too', () => {
    // The hazard this pins: the same file picked twice, and the collection holds a perceptual
    // twin of it. If the twin claim stayed same-send, it would resolve its keeper from the fresh
    // insert — find that claim CONVERTED AWAY — degrade to a fresh row of its own, and stand in
    // Media as the duplicate the conversion exists to prevent.
    const first = claim({ pathname: 'first', contentHash: 'b'.repeat(64) })
    const twin = claim({ pathname: 'second', contentHash: 'b'.repeat(64), sortOrder: 1 })
    const p = partitionOf([first, twin])
    expect(p.fresh).toHaveLength(1)
    expect(p.references).toEqual([{ claim: expect.anything(), keeper: null }])

    const bothConverted = applyPerceptualKeepers(
      p,
      new Map([
        ['first', keeper],
        ['second', keeper],
      ]),
    )
    expect(bothConverted.fresh).toEqual([])
    expect(bothConverted.references).toEqual([
      { claim: expect.anything(), keeper },
      { claim: expect.anything(), keeper },
    ])
  })
  it('a same-send twin whose byte set did not convert keeps the byte answer', () => {
    const first = claim({ pathname: 'first', contentHash: 'b'.repeat(64) })
    const twin = claim({ pathname: 'second', contentHash: 'b'.repeat(64) })
    const p = partitionOf([first, twin])
    const untouched = applyPerceptualKeepers(p, new Map())
    expect(untouched.references).toEqual([{ claim: expect.anything(), keeper: null }])
    expect(untouched.fresh).toHaveLength(1)
  })
  it('two claims that are twins of the same keeper both convert', () => {
    const p = partitionOf([claim({ pathname: 'p1' }), claim({ pathname: 'p2', sortOrder: 1 })])
    const converted = applyPerceptualKeepers(
      p,
      new Map([
        ['p1', keeper],
        ['p2', keeper],
      ]),
    )
    expect(converted.fresh).toEqual([])
    expect(converted.references).toHaveLength(2)
    expect(converted.references.every((r) => r.keeper === keeper)).toBe(true)
  })
  it('an empty keeper map returns the partition untouched', () => {
    const p = partitionOf([claim({ pathname: 'p1' })])
    expect(applyPerceptualKeepers(p, new Map())).toBe(p)
  })
})

describe('ninaUploadInsertRow — a signed fresh claim writes its signature; a reference does not', () => {
  it('the fresh arm carries the server-measured signature pair', () => {
    const { row } = ninaUploadInsertRow({
      messageId: 'msg1',
      claim: claim({
        pathname: 'p1',
        perceptual: {
          dhashHex: '484c6c62414e7e5f',
          sig16Base64: sig16ToBase64(new Uint8Array(256)),
        },
      }),
      keeper: null,
    })
    expect(row.perceptualHash).toBe('484c6c62414e7e5f')
    expect(row.perceptualSig).toBe(sig16ToBase64(new Uint8Array(256)))
    expect(row.contentHash).toBe(null)
  })
  it('the reference arm binds no signature — a pointer owns none of the bytes it renders', () => {
    const { outcome, row } = ninaUploadInsertRow({
      messageId: 'msg1',
      claim: claim({
        pathname: 'p1',
        perceptual: {
          dhashHex: '484c6c62414e7e5f',
          sig16Base64: sig16ToBase64(new Uint8Array(256)),
        },
      }),
      keeper,
    })
    expect(outcome).toBe('reference')
    expect(row.perceptualHash).toBeUndefined()
    expect(row.perceptualSig).toBeUndefined()
    expect(row.blobUrl).toBe(keeper.blobUrl)
    expect(row.sourceImageId).toBe(keeper.id)
  })
})
