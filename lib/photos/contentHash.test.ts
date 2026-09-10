import { describe, expect, it } from 'vitest'

import { contentHashOf, isValidContentHash } from './contentHash'

/**
 * Known-answer + shape-agreement tests for the one string all three dedup hosts must agree on.
 *
 * `crypto.subtle` IS available in Vitest's `node` environment (Node ≥22 exposes it globally), so
 * the real algorithm runs here — no stubbing, no browser. What is NOT reachable in `node` is a
 * real image decode; that is fine, because the function's only inputs are bytes and its only
 * decision is the digest.
 */

// NIST FIPS 180-4 test vectors for SHA-256.
const EMPTY_SHA256 = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
const ABC_SHA256 = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'

describe('contentHashOf', () => {
  it('reproduces the FIPS 180-4 vectors', async () => {
    await expect(contentHashOf(new ArrayBuffer(0))).resolves.toBe(EMPTY_SHA256)
    await expect(contentHashOf(new TextEncoder().encode('abc'))).resolves.toBe(ABC_SHA256)
  })

  it('is the same hash whatever host shape carried the bytes', async () => {
    // The whole mechanism rests on this: a hash the browser computed for the bytes it PUT must
    // equal the hash the sweep computes later by GETting those bytes back. If Blob, view,
    // ArrayBuffer or a copy ever disagreed, dedup would silently never match.
    const bytes = new TextEncoder().encode('kartu kedatangan 2608160020321')
    const fromView = await contentHashOf(bytes)
    const fromCopy = await contentHashOf(bytes.slice())
    const fromWholeBuffer = await contentHashOf(bytes.buffer)
    const fromBlob = await contentHashOf(new Blob([bytes]))
    expect(new Set([fromView, fromCopy, fromWholeBuffer, fromBlob]).size).toBe(1)
    expect(fromView).toMatch(/^[0-9a-f]{64}$/)
  })

  it('hashes the VIEW, not the buffer behind it — the offset pitfall', async () => {
    // A Node Buffer is pooled and a subarray view shares its parent's allocation. Hashing
    // `view.buffer` would fold unrelated heap into the digest. The contract is the view's bytes
    // and only the view's bytes.
    const whole = new Uint8Array([1, 2, 3, 4, 5])
    const view = whole.subarray(2, 4) // [3, 4], offset 2 into a 5-byte buffer
    await expect(contentHashOf(view)).resolves.toBe(await contentHashOf(new Uint8Array([3, 4])))
    await expect(contentHashOf(view)).resolves.not.toBe(await contentHashOf(whole))
  })

  it('reads a Blob — and a File, which is the shape the composer holds — by its bytes', async () => {
    const bytes = new TextEncoder().encode('abc')
    await expect(contentHashOf(new Blob([bytes]))).resolves.toBe(ABC_SHA256)
    await expect(contentHashOf(new File([bytes], 'a.jpg'))).resolves.toBe(ABC_SHA256)
  })
})

describe('isValidContentHash', () => {
  it('accepts what contentHashOf produces', async () => {
    expect(isValidContentHash(await contentHashOf(new TextEncoder().encode('abc')))).toBe(true)
    expect(isValidContentHash(ABC_SHA256)).toBe(true)
  })

  it('rejects every spelling we do not produce', () => {
    // Uppercase is the SAME hash mathematically and still rejected: the column holds one
    // spelling, the only client is ours, and a claim not in our spelling is a claim we did not
    // make — it stores as NULL (dedup inactive), it is not rewritten.
    expect(isValidContentHash(ABC_SHA256.toUpperCase())).toBe(false)
    expect(isValidContentHash(ABC_SHA256.slice(1))).toBe(false) // 63 chars
    expect(isValidContentHash(`${ABC_SHA256}0`)).toBe(false) // 65 chars
    expect(isValidContentHash('g'.repeat(64))).toBe(false) // hex-adjacent, not hex
    expect(isValidContentHash('')).toBe(false)
    expect(isValidContentHash(null)).toBe(false)
    expect(isValidContentHash(undefined)).toBe(false)
    expect(isValidContentHash(123)).toBe(false)
    expect(isValidContentHash({ hash: ABC_SHA256 })).toBe(false)
  })
})
