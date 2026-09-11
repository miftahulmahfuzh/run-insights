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
 * `PERCEPTUAL_MAX_DHASH`, `PERCEPTUAL_MAX_SIG16`, `PERCEPTUAL_ASPECT_TOLERANCE`,
 * `PERCEPTUAL_MIN_SIZE_RATIO` and `PERCEPTUAL_CROSS_RES_MAX_DHASH` mirror
 * `scripts/nina-dedupe-plan.mjs`'s constants of the same names. The sweep is `.mjs` and cannot
 * import this file, so the two copies stand next to each other with this paragraph between them:
 * if one number moves, move BOTH, and re-read the sweep's header first — every gate here was
 * measured on a real production pair and pinned one step above the measurement, because a
 * perceptual merge can destroy a near-miss (two shots of the same court are not duplicates). A
 * write-time twin that only the sweep's gates would reject is a row the sweep would refuse to
 * merge; the two answers must not disagree.
 */

/** dHash distance allowed for a twin, of 64 bits. Sweep-pinned; see the header before touching. */
export const PERCEPTUAL_MAX_DHASH = 1

/** 16x16 grayscale mean absolute difference allowed, of 255. Sweep-pinned; see the header. */
export const PERCEPTUAL_MAX_SIG16 = 2

/**
 * Relative aspect-ratio tolerance for the CROSS-RESOLUTION path. Measured 2026-09-11 on the
 * production pair `QbZH2v65ZeKE` (714x1270, upload) + `VW04cyH9omoX` (576x1024, generated): the
 * same photograph at two final resolutions, ratios 0.5622 vs 0.5625 — 0.05% apart. Pinned with
 * roughly 20x headroom over that measurement. Aspect-ratio closeness, not dimension equality, is
 * the real precondition: `lib/nina/perceptualSign.ts` resizes with `fit:'fill'` to a FIXED grid,
 * so the signatures are resolution-independent by construction but NOT ratio-independent.
 */
export const PERCEPTUAL_ASPECT_TOLERANCE = 0.01

/**
 * Minimum size ratio (smaller/larger, per dimension) required for the cross-resolution path —
 * the guard that stops a small thumbnail from spuriously matching a much larger photo of the same
 * aspect ratio. Measured on the same pair: 576/714 = 0.807 (width), 1024/1270 = 0.806 (height).
 * No production row has ever needed this guard; it exists because the aspect relaxation would
 * otherwise admit that case unbounded.
 */
export const PERCEPTUAL_MIN_SIZE_RATIO = 0.5

/**
 * dHash distance allowed on the cross-resolution path ONLY, of 64 — looser than
 * `PERCEPTUAL_MAX_DHASH` (which stays 1 for the same-dimensions path) because two independent
 * resize passes carry more resampling noise than a recode at one size. Measured on
 * `QbZH2v65ZeKE` + `VW04cyH9omoX`: 2/64. Pinned one step above, the same methodology
 * `PERCEPTUAL_MAX_DHASH` itself was set by (measured 0 → pinned 1).
 */
export const PERCEPTUAL_CROSS_RES_MAX_DHASH = 3

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
 * The sweep's gates as one predicate. Two paths, and a pair must clear EVERY gate on its path:
 *
 *   0. both sides dimensioned — a null `width`/`height` on either side is `false`, always.
 *
 *   SAME DIMENSIONS (`width === width && height === height`) — the recode case the layer was
 *   built for (`bjNniaR6_0dY` + `IGwGhWzPNmaR`, both 736x981, dHash 0/64, mean-abs 0.043):
 *     1. dHash distance ≤ `PERCEPTUAL_MAX_DHASH`;
 *     2. 16x16 mean-abs ≤ `PERCEPTUAL_MAX_SIG16`.
 *
 *   CROSS-RESOLUTION (dimensions differ) — the same photograph reaching the collection twice
 *   through two paths that each resize to their OWN target (`QbZH2v65ZeKE` 714x1270 upload +
 *   `VW04cyH9omoX` 576x1024 generated, measured 2026-09-11: aspect 0.5622 vs 0.5625, dHash 2/64,
 *   mean-abs 1.52/255). Strictly more conservative than "the ratios match":
 *     1. relative aspect-ratio difference ≤ `PERCEPTUAL_ASPECT_TOLERANCE` — `fit:'fill'` makes a
 *        signature resolution-independent but not ratio-independent, so this is the precondition
 *        the hash comparison actually needs;
 *     2. BOTH per-dimension size ratios ≥ `PERCEPTUAL_MIN_SIZE_RATIO` — a thumbnail is not a twin
 *        of the photo it was cut from;
 *     3. dHash distance ≤ `PERCEPTUAL_CROSS_RES_MAX_DHASH` (a separate, measured ceiling — the
 *        same-dimensions ceiling is untouched at 1);
 *     4. 16x16 mean-abs ≤ `PERCEPTUAL_MAX_SIG16` — the SAME ceiling both paths use. It already
 *        clears the measured cross-res value (1.52 of 2) and is the stronger signal of the two,
 *        so it needs no cross-res variant.
 *
 * `false` is also the answer for anything unsigned or undimensioned — this predicate is never
 * reached with those by the write-time caller, but a pure function answers for its whole domain.
 */
export function isPerceptualTwin(a: PerceptualCandidate, b: PerceptualCandidate): boolean {
  if (a.width == null || a.height == null || b.width == null || b.height == null) return false
  const sameDims = a.width === b.width && a.height === b.height
  let maxDhash: number
  if (sameDims) {
    maxDhash = PERCEPTUAL_MAX_DHASH
  } else {
    const ratioA = a.width / a.height
    const ratioB = b.width / b.height
    const aspectDelta = Math.abs(ratioA - ratioB) / Math.max(ratioA, ratioB)
    if (aspectDelta > PERCEPTUAL_ASPECT_TOLERANCE) return false
    const widthRatio = Math.min(a.width, b.width) / Math.max(a.width, b.width)
    const heightRatio = Math.min(a.height, b.height) / Math.max(a.height, b.height)
    if (widthRatio < PERCEPTUAL_MIN_SIZE_RATIO || heightRatio < PERCEPTUAL_MIN_SIZE_RATIO) {
      return false
    }
    maxDhash = PERCEPTUAL_CROSS_RES_MAX_DHASH
  }
  if (dhashHamming(a.dhash, b.dhash) > maxDhash) return false
  return sig16MeanAbs(a.sig16, b.sig16) <= PERCEPTUAL_MAX_SIG16
}
