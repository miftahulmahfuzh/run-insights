/**
 * **The perceptual twin question, as pure functions** — the write-time half of the sweep's
 * perceptual pass (media-dedupe follow-up, 2026-09-10's recurring defect).
 *
 * `content_hash` answers "these exact bytes are already stored". A photograph downloaded out of
 * the collection and re-uploaded fails that question BY DESIGN: the download re-encodes on its
 * journey back — the phone's save, then `compressForNina` on pick — so the returned bytes differ
 * from the original's while the pixels are the same photograph. Measured on the production pair
 * that kept coming back (`bjNniaR6_0dY` + `IGwGhWzPNmaR`, both 736x981): 45,619 vs 51,336 bytes,
 * sha-256 worlds apart, dHash 0/64, 16x16 mean-abs 0.043. THESE functions decide "same pixels",
 * over signatures `lib/nina/perceptualSign.ts` measured and the columns
 * `nina_message_images.perceptual_hash` / `.perceptual_sig` stored.
 *
 * ── ZERO IMPORTS, THE `imageDedupe.ts` CONTRACT ───────────────────────────────────────────────
 * `scripts/nina-image-worker.ts` strips types and runs on a runner that installs runtime
 * dependencies only; everything it can reach must survive that. Nothing here needs anything — the
 * gate is arithmetic over ints, bigints and byte arrays, which is also what lets
 * `tests/nina.perceptual.test.ts` assert it with no database, no sharp and no mock.
 *
 * ── THE GATES ARE THE SWEEP'S, VERBATIM, AND MUST STAY THAT WAY ───────────────────────────────
 * `PERCEPTUAL_MAX_DHASH` and `PERCEPTUAL_MAX_SIG16` mirror `scripts/nina-dedupe-plan.mjs`'s
 * constants of the same names. The sweep is `.mjs` and cannot import this file, so the two copies
 * stand next to each other with this paragraph between them: if one number moves, move BOTH, and
 * re-read the sweep's header first — the gates were measured (0 and 0.1 on a real re-encode pair)
 * and pinned one step above the measurement, because a perceptual merge can destroy a near-miss
 * (two shots of the same court are not duplicates). A write-time twin that only the sweep's gates
 * would reject is a row the sweep would refuse to merge; the two answers must not disagree.
 */

/** dHash distance allowed for a twin, of 64 bits. Sweep-pinned; see the header before touching. */
export const PERCEPTUAL_MAX_DHASH = 1

/** 16x16 grayscale mean absolute difference allowed, of 255. Sweep-pinned; see the header. */
export const PERCEPTUAL_MAX_SIG16 = 2

const DHASH_HEX_RE = /^[0-9a-f]{16}$/

/**
 * The stored form of a 64-bit difference hash: 16 lowercase hex characters, zero-padded — the
 * formatting `bigint.toString(16)` alone would not give (a leading-zero hash would come back
 * shorter, and the sweep writes zero-padded hex).
 */
export function dhashHexOf(dhash: bigint): string {
  return dhash.toString(16).padStart(16, '0')
}

/**
 * The one parser for `perceptual_hash`. Anything that is not exactly 16 lowercase hex characters
 * is null — the same trust shape `isValidContentHash` gives `content_hash`: a bad value never
 * throws, it just means "this row cannot participate", and no caller may invent a default.
 */
export function parseDhashHex(raw: unknown): bigint | null {
  if (typeof raw !== 'string' || !DHASH_HEX_RE.test(raw)) return null
  return BigInt(`0x${raw}`)
}

/**
 * The one encoder for `perceptual_sig`: the 256-byte 16x16 grayscale thumbnail as base64 — compact
 * enough to sit in a text column, decodable without a dependency.
 */
export function sig16ToBase64(sig16: Uint8Array): string {
  return Buffer.from(sig16).toString('base64')
}

/**
 * The one parser for `perceptual_sig`. Null for anything that does not decode to exactly 256
 * bytes — a signature of some other width cannot be compared, and comparing it would be a lie.
 */
export function sig16FromBase64(raw: unknown): Uint8Array | null {
  if (typeof raw !== 'string' || raw.length === 0) return null
  const bytes = Buffer.from(raw, 'base64')
  return bytes.length === 256 ? new Uint8Array(bytes) : null
}

/**
 * A claimed signature, as the insert door may store it — the `normalizeClaimedContentHash` shape
 * (`lib/nina/dedupe.ts`), moved next to the format it polices. Valid in, canonical form out;
 * anything else is null and NULL means dedup-inactive for that row, never an error. Re-formatting
 * through `dhashHexOf` keeps ONE spelling of the column — the sweep compares literals against it.
 */
export function normalizeClaimedPerceptualHash(raw: unknown): string | null {
  const parsed = parseDhashHex(raw)
  return parsed === null ? null : dhashHexOf(parsed)
}

/** The sig half of the same door: decode and re-encode, or null. */
export function normalizeClaimedPerceptualSig(raw: unknown): string | null {
  const sig = sig16FromBase64(raw)
  return sig === null ? null : sig16ToBase64(sig)
}

/** Hamming distance between two 64-bit difference hashes. The sweep's `dhashHamming`, typed. */
export function dhashHamming(a: bigint, b: bigint): number {
  let count = 0
  let diff = a ^ b
  while (diff !== 0n) {
    if (diff & 1n) count++
    diff >>= 1n
  }
  return count
}

/**
 * Mean absolute difference over two equal-length grayscale signatures. Mismatched lengths (and
 * empty inputs) are `Infinity`, never an estimate: a signature of some other size is not a weaker
 * match, it is no match.
 */
export function sig16MeanAbs(a: Uint8Array, b: Uint8Array): number {
  if (a.length === 0 || a.length !== b.length) return Number.POSITIVE_INFINITY
  let total = 0
  for (let i = 0; i < a.length; i++) total += Math.abs(a[i]! - b[i]!) // length-guarded above
  return total / a.length
}

/** One side of a twin comparison: the dimensions and signature of ONE photograph's bytes. */
export interface PerceptualCandidate {
  width: number | null
  height: number | null
  dhash: bigint
  sig16: Uint8Array
}

/**
 * The sweep's three gates as one predicate, ALL required:
 *
 *   1. same `width` AND `height`, both non-null — a recode passes through at its own size, and a
 *      resized one (the phone downscaled during save) is honestly a different entry here: the
 *      sweep would not merge it either, and a write-time check stricter than the sweep is how a
 *      "conservative" layer stops being conservative;
 *   2. dHash distance ≤ `PERCEPTUAL_MAX_DHASH`;
 *   3. 16x16 mean-abs ≤ `PERCEPTUAL_MAX_SIG16`.
 *
 * `false` is also the answer for anything unsigned or undimensioned — this predicate is never
 * reached with those by the write-time caller, but a pure function answers for its whole domain.
 */
export function isPerceptualTwin(a: PerceptualCandidate, b: PerceptualCandidate): boolean {
  if (a.width == null || a.height == null || b.width == null || b.height == null) return false
  if (a.width !== b.width || a.height !== b.height) return false
  if (dhashHamming(a.dhash, b.dhash) > PERCEPTUAL_MAX_DHASH) return false
  return sig16MeanAbs(a.sig16, b.sig16) <= PERCEPTUAL_MAX_SIG16
}
