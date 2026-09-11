# Phase 1: Cross-resolution perceptual twin gate + production merge

**Plan set:** `FIX_CROSS_RESOLUTION_PERCEPTUAL_DEDUPE_PLAN.md`
**Analysis:** `20260911-153427-B7K2_code_analyzer.md`
**Satisfies:** R1 — same photograph at two different final resolutions is recognized as a
duplicate (write-time and sweep), and the two live production rows are actually merged
**Depends on:** none
**Difficulty:** NORMAL
**Package:** `lib/nina` (with mirrored changes in `scripts`, tests in `tests`)

---

## Goal

`isPerceptualTwin` — the one predicate every dedup layer below `content_hash` asks — gains a
second, strictly more conservative comparison path for pairs whose pixel dimensions differ but
whose aspect ratios are nearly identical. The same-dimensions path is byte-for-byte unchanged
(`PERCEPTUAL_MAX_DHASH = 1`, `PERCEPTUAL_MAX_SIG16 = 2`), so the case the layer was originally
measured against carries zero regression risk. After this phase the production pair
`QbZH2v65ZeKE` (714x1270) / `VW04cyH9omoX` (576x1024) is recognized as one photograph by both the
write-time check and the sweep, and has been merged in production.

## Interface Contract

**Deletes:** (none)
**Renames:** (none)
**Creates:**
- `PERCEPTUAL_ASPECT_TOLERANCE` (`lib/nina/perceptual.ts`, exported const)
- `PERCEPTUAL_MIN_SIZE_RATIO` (`lib/nina/perceptual.ts`, exported const)
- `PERCEPTUAL_CROSS_RES_MAX_DHASH` (`lib/nina/perceptual.ts`, exported const)
- `PERCEPTUAL_ASPECT_TOLERANCE` (`scripts/nina-dedupe-plan.mjs`, exported const — mirror)
- `PERCEPTUAL_MIN_SIZE_RATIO` (`scripts/nina-dedupe-plan.mjs`, exported const — mirror)
- `PERCEPTUAL_CROSS_RES_MAX_DHASH` (`scripts/nina-dedupe-plan.mjs`, exported const — mirror)

**Signature changes:** none. `isPerceptualTwin(a, b) -> boolean` keeps its signature in both
copies; only its body and docstring change. `PerceptualCandidate` is unchanged.

**Behavior change (the only one):** `isPerceptualTwin` returns `true` for some pairs it previously
returned `false` for — exactly those where both sides are dimensioned, dimensions differ, aspect
ratios are within `PERCEPTUAL_ASPECT_TOLERANCE` relative, both per-dimension size ratios are at
least `PERCEPTUAL_MIN_SIZE_RATIO`, dHash distance is at most `PERCEPTUAL_CROSS_RES_MAX_DHASH`, and
16x16 mean-abs is at most the unchanged `PERCEPTUAL_MAX_SIG16`. No pair that was `true` becomes
`false`.

**Requires (from earlier phases):** none — this is the only phase in the set.

**Leaves alone (owned by nobody in this set, deliberately untouched):**
- `lib/nina/perceptualSign.ts` — the signer. Its `fit:'fill'` resize to a fixed grid is *why* this
  fix is sound (signatures are already resolution-independent); nothing to change.
- `scripts/nina-dedupe-plan.mjs`'s `perceptualVerifyCandidates` (`:489-506`) and its header
  (`:470-488`) — the stale-signature repair pass. Different question, and both production rows
  carry freshly-correct signatures. One clarifying comment line only (Step 4); no logic change.
- `lib/nina/actions.ts:1099-1113` and `lib/nina/queries.ts` (`findNinaSignedOriginals`) — the
  write-time call site already passes every signed original with no dimension pre-filter in SQL,
  so the gate function change alone reaches it.
- `scripts/nina-dedupe-media.mjs` — used (run), never edited.
- Any schema or migration file. `content_hash` / `perceptual_hash` / `perceptual_sig` formats are
  untouched; this is comparison logic only.

## Files

| File | Action | What changes |
|---|---|---|
| `lib/nina/perceptual.ts` | modify | header comment (`:20-28`), three new exported consts after `:34`, `isPerceptualTwin` docstring + body (`:123-141`) |
| `scripts/nina-dedupe-plan.mjs` | modify | "THE PERCEPTUAL PASS" header (`:413-420`), three new exported consts after `:436`, `isPerceptualTwin` (`:458-468`), one clarifying line in the repair-pass header (`:482`) |
| `tests/nina.perceptual.test.ts` | modify | import the three consts (`:11-23`), retitle + comment the existing describe (`:98`, `:117-120`), add a new cross-resolution describe after `:132` |
| `tests/nina.dedupeMedia.test.ts` | modify | import the three consts (`:4-29`), comment the existing dimension test (`:503-508`), add a new cross-resolution describe after `:512` |

---

## Implementation Steps

### Step 1: Replace `lib/nina/perceptual.ts`'s file header cross-file-sync paragraph

**File:** `lib/nina/perceptual.ts:20-28` (the `── THE GATES ARE THE SWEEP'S ──` block through the
closing `*/` of the file-level comment)

**Change:** the paragraph currently names only the two constants. Extend it to cover all five, and
keep the "if one number moves, move BOTH" rule intact.

**Code:** replace lines 20-28 with:

```ts
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
```

**Impact:** comment only. No behavior change.

---

### Step 2: Add the three cross-resolution constants to `lib/nina/perceptual.ts`

**File:** `lib/nina/perceptual.ts:34` (immediately after the `PERCEPTUAL_MAX_SIG16` line, before
`const DHASH_HEX_RE` on line 36)

**Change:** insert three exported constants with their measurement provenance.

**Code:** after

```ts
/** 16x16 grayscale mean absolute difference allowed, of 255. Sweep-pinned; see the header. */
export const PERCEPTUAL_MAX_SIG16 = 2
```

insert:

```ts
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
```

**Impact:** three new exports. Nothing reads them yet until Step 3.

---

### Step 3: Rewrite `isPerceptualTwin` in `lib/nina/perceptual.ts`

**File:** `lib/nina/perceptual.ts:123-141` (the docstring starting `/**\n * The sweep's three
gates...` through the closing `}` of the function — the end of the file)

**Change:** replace the docstring and the function body with the two-path form. Note the
`PERCEPTUAL_MAX_SIG16` gate is shared by BOTH paths and unchanged — it already has headroom over
the measured cross-res value (1.52 vs the ceiling of 2) and is a stronger content-similarity
signal than dHash, so it gets no separate cross-res constant. No new import (the file's ZERO
IMPORTS contract holds: `Math.abs`/`Math.max`/`Math.min` are intrinsics).

**Code:** replace lines 123-141 with:

```ts
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
```

**Impact:** the write-time caller (`lib/nina/actions.ts:1113`) now finds cross-resolution twins
without any edit of its own. A new `upload` whose pixels match an existing `generated` original at
a different resolution lands as a REFERENCE instead of a fresh row.

---

### Step 4: Mirror everything into `scripts/nina-dedupe-plan.mjs`

**File:** `scripts/nina-dedupe-plan.mjs:413-420` (header), `:434-436` (constants), `:458-468`
(function), `:482` (one clarifying line in the repair-pass header)

**Change 4a — the "THE PERCEPTUAL PASS" header.** Replace lines 413-420 (from `* The pass is
deliberately CONSERVATIVE` through `* not a tile anybody sees twice. Merges never cross users. A
row whose bytes were never signed` … keep going to the end of that sentence) with:

```js
 * The pass is deliberately CONSERVATIVE, because a perceptual merge can destroy a near-miss
 * (two shots of the same court are not duplicates). TWO paths, every gate on a path required:
 *
 *   SAME DIMENSIONS — the recode case above (`DfeYafysbVAe` + `zGGxRerRI_jS`, 0/64 and 0.1/255):
 *     1. dHash distance ≤ `PERCEPTUAL_MAX_DHASH` (of 64);
 *     2. 16x16 mean-abs ≤ `PERCEPTUAL_MAX_SIG16` (of 255).
 *
 *   CROSS-RESOLUTION (dimensions differ) — 2026-09-11's measured defect: the SAME photograph
 *   reaching the collection twice through two pipelines that each resize to their own target.
 *   Measured on `QbZH2v65ZeKE` (714x1270, upload) + `VW04cyH9omoX` (576x1024, generated): aspect
 *   ratios 0.5622 vs 0.5625, dHash 2/64, 16x16 mean-abs 1.52/255 — the same picture, and the old
 *   dimension-equality gate rejected the pair before ever reading how close the hashes were.
 *     1. relative aspect-ratio difference ≤ `PERCEPTUAL_ASPECT_TOLERANCE`;
 *     2. BOTH per-dimension size ratios ≥ `PERCEPTUAL_MIN_SIZE_RATIO` (no thumbnail twins);
 *     3. dHash distance ≤ `PERCEPTUAL_CROSS_RES_MAX_DHASH` — its OWN ceiling; the
 *        same-dimensions ceiling stays 1;
 *     4. 16x16 mean-abs ≤ `PERCEPTUAL_MAX_SIG16` — the same ceiling both paths use.
 *
 * Only ORIGINALS participate — a reference is already hidden from the collection reads, so it is
 * not a tile anybody sees twice. Merges never cross users. A row whose bytes were never signed
 * (failed GET, undecodable file) simply does not participate.
```

**Change 4b — the constants.** Replace lines 434-436:

```js
/** Measured 2026-09-10 on `DfeYafysbVAe` + `zGGxRerRI_jS`: 0 and 0.1. Pinned one step above. */
export const PERCEPTUAL_MAX_DHASH = 1
export const PERCEPTUAL_MAX_SIG16 = 2
```

with:

```js
/** Measured 2026-09-10 on `DfeYafysbVAe` + `zGGxRerRI_jS`: 0 and 0.1. Pinned one step above. */
export const PERCEPTUAL_MAX_DHASH = 1
export const PERCEPTUAL_MAX_SIG16 = 2

/* ── THE CROSS-RESOLUTION GATES ────────────────────────────────────────────────────────────────
 * Measured 2026-09-11 on `QbZH2v65ZeKE` (714x1270) + `VW04cyH9omoX` (576x1024): aspect ratios
 * 0.5622 vs 0.5625 (0.05% apart), size ratios 0.807 / 0.806, dHash 2/64, mean-abs 1.52/255.
 * Each is pinned above its measurement the way the two gates above were. These five constants
 * are mirrored VERBATIM in `lib/nina/perceptual.ts` — if one number moves, move BOTH.
 */
export const PERCEPTUAL_ASPECT_TOLERANCE = 0.01
export const PERCEPTUAL_MIN_SIZE_RATIO = 0.5
export const PERCEPTUAL_CROSS_RES_MAX_DHASH = 3
```

**Change 4c — the predicate.** Replace lines 458-468:

```js
/** The three gates of the header, as one predicate. `false` for anything unsigned or undimensioned. */
export function isPerceptualTwin(a, b) {
  if (a?.width == null || a?.height == null || b?.width == null || b?.height == null) return false
  if (a.width !== b.width || a.height !== b.height) return false
  const asig = a.sig
  const bsig = b.sig
  if (asig == null || bsig == null) return false
  if (typeof asig.dhash !== 'bigint' || typeof bsig.dhash !== 'bigint') return false
  if (dhashHamming(asig.dhash, bsig.dhash) > PERCEPTUAL_MAX_DHASH) return false
  return sig16MeanAbs(asig.sig16, bsig.sig16) <= PERCEPTUAL_MAX_SIG16
}
```

with:

```js
/** The two paths of the header, as one predicate. `false` for anything unsigned or undimensioned. */
export function isPerceptualTwin(a, b) {
  if (a?.width == null || a?.height == null || b?.width == null || b?.height == null) return false
  const sameDims = a.width === b.width && a.height === b.height
  let maxDhash
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
  const asig = a.sig
  const bsig = b.sig
  if (asig == null || bsig == null) return false
  if (typeof asig.dhash !== 'bigint' || typeof bsig.dhash !== 'bigint') return false
  if (dhashHamming(asig.dhash, bsig.dhash) > maxDhash) return false
  return sig16MeanAbs(asig.sig16, bsig.sig16) <= PERCEPTUAL_MAX_SIG16
}
```

Note the `.mjs` copy keeps its own null-guard style (`a?.width`, `asig`/`bsig`, the `typeof
… === 'bigint'` checks) — those guards are unchanged and stay where they were, after the
dimension decision and before the hash comparison. The logic the two files share is identical.

**Change 4d — one clarifying line in the repair-pass header.** `perceptualVerifyCandidates`'s
header (line 482) claims "perceptual twins MUST share (user, width, height) (gate 1)", which this
phase makes narrower than the truth. The function is deliberately NOT changed (see Interface
Contract); its comment must stop asserting something false. Replace line 482:

```js
 * `perceptualVerifyCandidates` names the population worth a re-GET: perceptual twins MUST share
 * (user, width, height) (gate 1), so a row whose dimensions are unique among its user's originals
 * has no candidate twin to have silently missed — re-verifying it buys nothing. Only a row that
```

with:

```js
 * `perceptualVerifyCandidates` names the population worth a re-GET: a row sharing (user, width,
 * height) with another original has a same-dimensions candidate twin it may have silently missed.
 * NARROWED 2026-09-11: `isPerceptualTwin` now also matches CROSS-RESOLUTION pairs, so this
 * shortlist no longer covers every possible twin — a stale signature on a cross-resolution pair
 * is not surfaced here. That is a known, separate gap (aspect-ratio bucketing would close it),
 * deliberately out of scope for the cross-resolution fix: neither production row involved carries
 * a stale signature. What this pass DOES cover is unchanged. Only a row that
```

**Impact:** the sweep (`npm run nina:dedupe-media`) now clusters cross-resolution pairs in
`buildPerceptualMergePlan`. No other sweep code changes — clustering, `electKeeper` and the
`merge-row` op shape are already dimension-agnostic (the op carries the KEEPER's
`width`/`height`/`bytes` onto the loser row regardless of what the loser's own dimensions were).

---

### Step 5: Extend `tests/nina.perceptual.test.ts`

**File:** `tests/nina.perceptual.test.ts:11-23` (imports), `:98`, `:117-120` (existing block),
after `:132` (new block)

**Change 5a — imports.** Replace the `@/lib/nina/perceptual` import block (lines 11-23) with:

```ts
import {
  dhashHamming,
  dhashHexOf,
  isPerceptualTwin,
  normalizeClaimedPerceptualHash,
  normalizeClaimedPerceptualSig,
  parseDhashHex,
  PERCEPTUAL_ASPECT_TOLERANCE,
  PERCEPTUAL_CROSS_RES_MAX_DHASH,
  PERCEPTUAL_MAX_DHASH,
  PERCEPTUAL_MAX_SIG16,
  PERCEPTUAL_MIN_SIZE_RATIO,
  sig16FromBase64,
  sig16MeanAbs,
  sig16ToBase64,
} from '@/lib/nina/perceptual'
```

**Change 5b — retitle the existing describe and explain why its dimension cases still hold.**
Replace line 98:

```ts
describe('isPerceptualTwin — the three gates, ALL required', () => {
```

with:

```ts
describe('isPerceptualTwin — the same-dimensions path, unchanged', () => {
```

and replace lines 117-120:

```ts
  it('different dimensions — the same pixels at another size are NOT a twin', () => {
    expect(isPerceptualTwin(candidate({}), candidate({ width: 576 }))).toBe(false)
    expect(isPerceptualTwin(candidate({}), candidate({ height: 800 }))).toBe(false)
  })
```

with:

```ts
  it('different dimensions AND a different aspect ratio — not a twin', () => {
    // These two were "different dimensions ⇒ false" before the cross-resolution path existed and
    // are STILL false after it: the default is 736x981 (ratio 0.750), so 576x981 is 0.587 and
    // 736x800 is 0.920 — 21% and 18% off, far beyond PERCEPTUAL_ASPECT_TOLERANCE (1%). A
    // different aspect ratio is a different crop, not a resize.
    expect(isPerceptualTwin(candidate({}), candidate({ width: 576 }))).toBe(false)
    expect(isPerceptualTwin(candidate({}), candidate({ height: 800 }))).toBe(false)
  })
```

**Change 5c — the new cross-resolution block.** Insert after the existing describe's closing
`})` (line 132), before the `/* ── applyPerceptualKeepers ── */` banner on line 134:

```ts
describe('isPerceptualTwin — the cross-resolution path', () => {
  const uniform = (n: number) => new Uint8Array(256).fill(n)

  /* The measured production pair (2026-09-11): `QbZH2v65ZeKE` 714x1270 (upload) and
   * `VW04cyH9omoX` 576x1024 (generated) — the same photograph at two final resolutions. Ratios
   * 0.5622 vs 0.5625; dHash Hamming 2 of 64; 16x16 mean-abs 1.52 of 255. The dHash pair below
   * spells that distance by flipping the low two bits of the upload's stored hash; the signature
   * pair spells 1.52 as 133 cells two levels apart and 123 one level apart (389/256 = 1.5195). */
  const UPLOAD_DHASH = 0x9f9f3b4a8e0f5333n
  const GENERATED_DHASH = 0x9f9f3b4a8e0f5330n // two bits from UPLOAD_DHASH
  const CROSS_RES_SIG = Uint8Array.from({ length: 256 }, (_, i) => (i < 133 ? 102 : 101))

  const upload = {
    width: 714,
    height: 1270,
    dhash: UPLOAD_DHASH,
    sig16: uniform(100),
  }
  const generated = {
    width: 576,
    height: 1024,
    dhash: GENERATED_DHASH,
    sig16: CROSS_RES_SIG,
  }

  it('pins the vector it is built from: dHash 2 of 64, mean-abs 1.52 of 255', () => {
    expect(dhashHamming(UPLOAD_DHASH, GENERATED_DHASH)).toBe(2)
    expect(sig16MeanAbs(uniform(100), CROSS_RES_SIG)).toBeCloseTo(1.52, 2)
  })

  it('the measured production pair is a twin — same photograph, two resolutions', () => {
    expect(isPerceptualTwin(upload, generated)).toBe(true)
    expect(isPerceptualTwin(generated, upload)).toBe(true) // the predicate is symmetric
  })

  it('the cross-resolution dHash ceiling is its own, and stricter than "anything close"', () => {
    // 3 bits apart (0x…5333 ^ 0x…5334 = 0b0111) — at PERCEPTUAL_CROSS_RES_MAX_DHASH, inclusive.
    const atGate = { ...generated, dhash: 0x9f9f3b4a8e0f5334n, sig16: uniform(100) }
    // 4 bits apart (0x…5333 ^ 0x…533c = 0b1111) — one past it.
    const pastGate = { ...generated, dhash: 0x9f9f3b4a8e0f533cn, sig16: uniform(100) }
    expect(PERCEPTUAL_CROSS_RES_MAX_DHASH).toBe(3)
    expect(dhashHamming(UPLOAD_DHASH, atGate.dhash)).toBe(3)
    expect(dhashHamming(UPLOAD_DHASH, pastGate.dhash)).toBe(4)
    expect(isPerceptualTwin(upload, atGate)).toBe(true)
    expect(isPerceptualTwin(upload, pastGate)).toBe(false)
  })

  it('the same-dimensions path keeps ITS ceiling — 2 bits is a twin only across resolutions', () => {
    // The exact vector that passes at 714x1270-vs-576x1024 is refused when both sides are 576x1024:
    // PERCEPTUAL_MAX_DHASH is still 1, and the cross-res ceiling never reaches the same-dims path.
    const sameDims = { ...upload, width: 576, height: 1024 }
    expect(PERCEPTUAL_MAX_DHASH).toBe(1)
    expect(isPerceptualTwin(sameDims, generated)).toBe(false)
  })

  it('a thumbnail is not a twin of the photo it was cut from, however identical the pixels', () => {
    // 144x256 is EXACTLY the 0.5625 ratio of 576x1024 and carries an identical signature — the
    // aspect gate has nothing to object to. The size-ratio guard is the only thing refusing it.
    const thumbnail = { width: 144, height: 256, dhash: GENERATED_DHASH, sig16: CROSS_RES_SIG }
    expect(144 / 256).toBe(576 / 1024) // same ratio, so this is the size guard talking
    expect(isPerceptualTwin(generated, thumbnail)).toBe(false)
  })

  it('the size-ratio guard is inclusive at exactly PERCEPTUAL_MIN_SIZE_RATIO', () => {
    const half = { width: 288, height: 512, dhash: GENERATED_DHASH, sig16: CROSS_RES_SIG }
    expect(PERCEPTUAL_MIN_SIZE_RATIO).toBe(0.5)
    expect(288 / 576).toBe(PERCEPTUAL_MIN_SIZE_RATIO)
    expect(isPerceptualTwin(generated, half)).toBe(true)
  })

  it('a different aspect ratio is a different crop — refused before any hash is read', () => {
    // Identical signature, rotated dimensions: 1270x714 is ratio 1.778 against 0.562.
    const rotated = { width: 1270, height: 714, dhash: UPLOAD_DHASH, sig16: uniform(100) }
    expect(PERCEPTUAL_ASPECT_TOLERANCE).toBe(0.01)
    expect(isPerceptualTwin(upload, rotated)).toBe(false)
  })

  it('a null dimension still refuses before the aspect ratio is computable', () => {
    expect(isPerceptualTwin(upload, { ...generated, width: null })).toBe(false)
    expect(isPerceptualTwin({ ...upload, height: null }, generated)).toBe(false)
  })
})
```

**Impact:** the pure-function suite pins both paths and both of the new guards. The existing
same-dimensions assertions are untouched in behavior.

---

### Step 6: Extend `tests/nina.dedupeMedia.test.ts`

**File:** `tests/nina.dedupeMedia.test.ts:4-29` (imports), `:503-508` (existing test), after
`:512` (new block)

**Change 6a — imports.** In the `@/scripts/nina-dedupe-plan.mjs` import list (lines 4-29), add the
three new names in the existing alphabetical-ish ordering — after `perceptualVerifyCandidates`
and around the two existing `PERCEPTUAL_*` entries:

```ts
  perceptualVerifyCandidates,
  PERCEPTUAL_ASPECT_TOLERANCE,
  PERCEPTUAL_CROSS_RES_MAX_DHASH,
  PERCEPTUAL_MAX_DHASH,
  PERCEPTUAL_MAX_SIG16,
  PERCEPTUAL_MIN_SIZE_RATIO,
  releaseDecision,
```

**Change 6b — explain why the existing dimension test still passes.** Replace lines 503-508:

```ts
  it('refuses different or missing dimensions — a recode keeps dims, a different crop does not', () => {
    const a = prow({ id: 'a' })
    expect(isPerceptualTwin(a, prow({ id: 'b', width: 768 }))).toBe(false)
    expect(isPerceptualTwin(a, prow({ id: 'b', height: 1152 }))).toBe(false)
    expect(isPerceptualTwin(a, prow({ id: 'b', width: null }))).toBe(false)
  })
```

with:

```ts
  it('refuses a different aspect ratio or a missing dimension — a different crop is not a twin', () => {
    // `prow`'s default is 679x1024 (ratio 0.663). These stay false after the cross-resolution
    // path landed: 768x1024 is 0.750 (12% off) and 679x1152 is 0.589 (11% off), both far beyond
    // PERCEPTUAL_ASPECT_TOLERANCE's 1%. Different dimensions alone no longer refuses a pair —
    // a different SHAPE does.
    const a = prow({ id: 'a' })
    expect(isPerceptualTwin(a, prow({ id: 'b', width: 768 }))).toBe(false)
    expect(isPerceptualTwin(a, prow({ id: 'b', height: 1152 }))).toBe(false)
    expect(isPerceptualTwin(a, prow({ id: 'b', width: null }))).toBe(false)
  })
```

**Change 6c — the new sweep-side cross-resolution block.** Insert after the `describe('isPerceptual
Twin', …)` block's closing `})` (line 512), before `describe('buildPerceptualMergePlan', …)` on
line 514:

```ts
/* ── the cross-resolution path (2026-09-11's measured defect) ──────────────────────────────────
 * `QbZH2v65ZeKE` (714x1270, upload) and `VW04cyH9omoX` (576x1024, generated) are the same
 * photograph at two final resolutions: aspect 0.5622 vs 0.5625, dHash 2/64, 16x16 mean-abs
 * 1.52/255. The old gate 1 (exact width/height equality) rejected the pair before ever reading
 * how close the hashes were, which is why it survived every dedup layer. CROSS_RES_SIG16 spells
 * 1.52 as 133 cells two levels apart and 123 one level apart: 389/256 = 1.5195.
 */
const CROSS_RES_UPLOAD_DHASH = 0x9f9f3b4a8e0f5333n
const CROSS_RES_GENERATED_DHASH = 0x9f9f3b4a8e0f5330n // two bits away
const CROSS_RES_SIG16 = Uint8Array.from({ length: 256 }, (_, i) => (i < 133 ? 102 : 101))

type ProwOver = Parameters<typeof prow>[0]

const crossResUpload = (over: Partial<ProwOver> = {}) =>
  prow({
    id: 'QbZH2v65ZeKE',
    width: 714,
    height: 1270,
    sig: sigOf(CROSS_RES_UPLOAD_DHASH, uniform16(100)),
    ...over,
  })
const crossResGenerated = (over: Partial<ProwOver> = {}) =>
  prow({
    id: 'VW04cyH9omoX',
    kind: 'generated',
    width: 576,
    height: 1024,
    sig: sigOf(CROSS_RES_GENERATED_DHASH, CROSS_RES_SIG16),
    contentHash: H_SELFIE,
    createdAt: '2026-09-11T07:18:19.280Z',
    ...over,
  })

describe('isPerceptualTwin — the cross-resolution path', () => {
  it('pins the vector: dHash 2 of 64, 16x16 mean-abs 1.52 of 255', () => {
    expect(dhashHamming(CROSS_RES_UPLOAD_DHASH, CROSS_RES_GENERATED_DHASH)).toBe(2)
    expect(sig16MeanAbs(uniform16(100), CROSS_RES_SIG16)).toBeCloseTo(1.52, 2)
  })
  it('accepts the measured production pair — same photograph, 714x1270 vs 576x1024', () => {
    expect(isPerceptualTwin(crossResUpload(), crossResGenerated())).toBe(true)
    expect(isPerceptualTwin(crossResGenerated(), crossResUpload())).toBe(true)
  })
  it('has its own dHash ceiling, inclusive at 3 and refusing at 4', () => {
    expect(PERCEPTUAL_CROSS_RES_MAX_DHASH).toBe(3)
    const atGate = crossResGenerated({
      id: 'atGate',
      sig: sigOf(0x9f9f3b4a8e0f5334n, uniform16(100)), // 0b0111 from the upload — 3 bits
    })
    const pastGate = crossResGenerated({
      id: 'pastGate',
      sig: sigOf(0x9f9f3b4a8e0f533cn, uniform16(100)), // 0b1111 from the upload — 4 bits
    })
    expect(isPerceptualTwin(crossResUpload(), atGate)).toBe(true)
    expect(isPerceptualTwin(crossResUpload(), pastGate)).toBe(false)
  })
  it('never loosens the same-dimensions path — 2 bits at one size is still not a twin', () => {
    expect(PERCEPTUAL_MAX_DHASH).toBe(1)
    const sameSize = crossResUpload({ id: 'sameSize', width: 576, height: 1024 })
    expect(isPerceptualTwin(sameSize, crossResGenerated())).toBe(false)
  })
  it('refuses a thumbnail of the same ratio — the size-ratio guard, not the aspect gate', () => {
    expect(PERCEPTUAL_MIN_SIZE_RATIO).toBe(0.5)
    expect(144 / 256).toBe(576 / 1024) // identical ratio, so only the size guard can refuse
    const thumb = crossResGenerated({ id: 'thumb', width: 144, height: 256 })
    expect(isPerceptualTwin(crossResGenerated(), thumb)).toBe(false)
  })
  it('is inclusive at exactly PERCEPTUAL_MIN_SIZE_RATIO', () => {
    const half = crossResGenerated({ id: 'half', width: 288, height: 512 })
    expect(isPerceptualTwin(crossResGenerated(), half)).toBe(true)
  })
  it('refuses a different aspect ratio however identical the signature', () => {
    expect(PERCEPTUAL_ASPECT_TOLERANCE).toBe(0.01)
    const rotated = crossResUpload({ id: 'rotated', width: 1270, height: 714 })
    expect(isPerceptualTwin(crossResUpload(), rotated)).toBe(false)
  })
})

describe('buildPerceptualMergePlan — the cross-resolution pair', () => {
  it('clusters the two production rows into one merge group', () => {
    // The offline proxy of this phase's production step: if the sweep does not cluster these two
    // here, the dry run against production will not propose them either.
    const { groups, ops } = buildPerceptualMergePlan([crossResUpload(), crossResGenerated()])
    expect(groups).toHaveLength(1)
    expect(groups[0]?.perceptual).toBe(true)
    expect([...(groups[0]?.ids ?? [])].sort()).toEqual(['QbZH2v65ZeKE', 'VW04cyH9omoX'])
    expect(groups[0]?.loserIds).toHaveLength(1)
    // One merge-row for the loser, one release-blob for its object — rows first, blob second.
    expect(ops.map((o) => o.op)).toEqual(['merge-row', 'release-blob'])
  })
})
```

Note the assertion deliberately does NOT pin WHICH of the two is keeper: both fixture rows are
`messageId: null` with no description, so `electKeeper`'s standing order resolves them by its
final tie-break, and pinning that would be pinning an accident rather than a decision. Production
keeper election is verified by reading the dry-run report in Step 8.

**Impact:** the sweep-side suite pins the same two paths and, additionally, that the plan builder
actually emits a merge for the pair.

---

### Step 7: Format, typecheck, and run the suites

**File:** none — verification gate before any production action.

**Change:** run, in this order, from the worktree root
(`/home/miftah/.worktrees/run-insights/fix-cross-resolution-perceptual-dedupe`):

```bash
cd /home/miftah/.worktrees/run-insights/fix-cross-resolution-perceptual-dedupe
npx prettier --write lib/nina/perceptual.ts scripts/nina-dedupe-plan.mjs \
  tests/nina.perceptual.test.ts tests/nina.dedupeMedia.test.ts
npx tsc --noEmit
npx vitest run tests/nina.perceptual.test.ts tests/nina.dedupeMedia.test.ts
```

Then the whole suite, because `isPerceptualTwin` is reachable from `lib/nina/actions.ts`:

```bash
cd /home/miftah/.worktrees/run-insights/fix-cross-resolution-perceptual-dedupe && npx vitest run
```

`npx prettier --write` is scoped to the four files by name deliberately — `npm run format` is
repo-wide and would sweep unrelated files into this phase's diff.

**Impact:** nothing ships until all three commands are clean. If `npx tsc --noEmit` reports
missing `PageProps` types, that is the worktree missing Next typegen and is unrelated to this
change — run `npx next typegen` once and re-run.

---

### Step 8: Production dry run — the gate, not a formality

**File:** none — a read-only production run.

**Change:** run the sweep with NO `--apply` and confirm it now proposes the pair.

```bash
cd /home/miftah/.worktrees/run-insights/fix-cross-resolution-perceptual-dedupe
npm run nina:dedupe-media 2>&1 | tee /tmp/nina-dedupe-dryrun.txt
grep -n "PERCEPTUAL FINDING" -A 8 /tmp/nina-dedupe-dryrun.txt
grep -n "QbZH2v65ZeKE\|VW04cyH9omoX" /tmp/nina-dedupe-dryrun.txt
```

Context for whoever runs this: `.env.local` is present in this worktree and its `DATABASE_URL` is
the production database — this repo has exactly ONE database, so a run here reads the same rows
the deployed app serves. `node_modules` here is a symlink to the main checkout's, which `npm run`
and `vitest`/`tsc` are fine with. The dry run performs no writes (`parseArgs([])` →
`{ apply: false }`) but it DOES GET blobs over the network, so it is slow; do not interrupt it.

**GATE — read before proceeding:**
1. A `PERCEPTUAL FINDING` block must exist whose row list contains BOTH `QbZH2v65ZeKE` and
   `VW04cyH9omoX`. If no such block appears, **STOP — do not run `--apply`.** The code fix did not
   reach production's data and needs re-checking (most likely causes: one of the two rows is no
   longer an original, its stored signature failed to decode, or `sharp` is missing in the
   worktree — the report prints `perceptual signatures … skipped — sharp is not installed` in that
   last case).
2. Read which id the block names as `keeper`. Confirm it is the side you are willing to keep —
   per the plan index's Rollback section, the loser's Blob object is DELETED by the `release-blob`
   op and is not recoverable. If the keeper is the wrong side, **STOP** and raise it rather than
   applying.
3. Note every OTHER `PERCEPTUAL FINDING` and `FINDING` block in the report. `--apply` executes the
   whole plan, not just this pair. If the report proposes merges you did not expect, **STOP** and
   review them before applying.

**Impact:** read-only. This step's only product is a decision.

---

### Step 9: Production apply

**File:** none — a production write, gated on Step 8.

**Change:** only if Step 8's three gate conditions all held:

```bash
cd /home/miftah/.worktrees/run-insights/fix-cross-resolution-perceptual-dedupe
npm run nina:dedupe-media -- --apply 2>&1 | tee /tmp/nina-dedupe-apply.txt
```

**Impact:** `nina_message_images` rows are repointed (`source_image_id`, `blob_url`, `pathname`,
`content_hash`, `width`, `height`, `bytes` ← the keeper's) and the loser's Blob object is deleted
if nothing else references it. Irreversible for the blob.

---

### Step 10: Verify the write from the database, not the script's summary

**File:** none.

**Change:** query the two rows directly. The script's printed summary is NOT the verification —
per this repo's standing lesson, a sweep is verified with a DB read, never its own report.

```bash
cd /home/miftah/.worktrees/run-insights/fix-cross-resolution-perceptual-dedupe
node --env-file=.env.local -e '
const { neon } = require("@neondatabase/serverless");
const sql = neon(process.env.DATABASE_URL);
sql`select id, kind, source_image_id, blob_url, width, height, bytes, content_hash
     from nina_message_images
     where id in ('"'"'QbZH2v65ZeKE'"'"', '"'"'VW04cyH9omoX'"'"')
     order by id`
  .then((rows) => console.log(JSON.stringify(rows, null, 2)));
'
```

If `@neondatabase/serverless` does not resolve as CJS from that one-liner, use the same driver
import `scripts/nina-dedupe-media.mjs` itself uses (read its top-of-file import) in a throwaway
`.mjs` under the scratchpad rather than adapting the query.

**GATE:** exactly one of the two rows must now carry a non-null `source_image_id` equal to the
other's `id`, and that same row's `blob_url` / `width` / `height` / `bytes` must equal the
keeper's. If both rows still show `source_image_id: null`, the apply did not take — re-read
`/tmp/nina-dedupe-apply.txt` for the failure rather than re-running `--apply`.

**Manual confirmation:** load `/nina/about` in production and confirm the Media section no longer
shows the same photograph at positions 3/20 and 4/20 (the reference row is hidden from the
collection read by `isOriginalPhoto()`).

**Impact:** the user-visible duplicate is gone. R1 is satisfied end to end.

---

## Verification

**Format:** `npx prettier --check lib/nina/perceptual.ts scripts/nina-dedupe-plan.mjs tests/nina.perceptual.test.ts tests/nina.dedupeMedia.test.ts`
**Build:** `npx tsc --noEmit` (run from the worktree root; vitest does not typecheck)
**Tests:** `npx vitest run` — full suite, since `isPerceptualTwin` is reachable from
`lib/nina/actions.ts`. Minimum targeted set:
`npx vitest run tests/nina.perceptual.test.ts tests/nina.dedupeMedia.test.ts`
**Manual check:** the production dry-run report (Step 8) names both ids in one
`PERCEPTUAL FINDING`; after the apply, the direct DB query (Step 10) shows one row pointing at the
other; `/nina/about` Media no longer shows the pair.

**Exit criteria:**
1. `npx tsc --noEmit` clean and `npx vitest run` green, including the new cross-resolution
   known-answer vector in both test files.
2. `PERCEPTUAL_MAX_DHASH === 1` and `PERCEPTUAL_MAX_SIG16 === 2` still asserted and still passing
   in both suites — the same-dimensions path did not move.
3. `lib/nina/perceptual.ts` and `scripts/nina-dedupe-plan.mjs` declare the same five constants
   with the same values and implement the same gate order.
4. `select source_image_id from nina_message_images where id in ('QbZH2v65ZeKE','VW04cyH9omoX')`
   returns exactly one non-null value, and it is the other row's id.

## Handoffs

- **`perceptualVerifyCandidates`'s aspect-ratio bucketing** (`scripts/nina-dedupe-plan.mjs:489`).
  Its `(userId, width, height)` shortlist cannot surface a cross-resolution pair whose STORED
  signature is stale. Not this bug (both production rows carry freshly-correct signatures,
  verified during the root-cause trace) and out of this phase's `satisfies`. This phase only
  narrows that function's comment so it stops asserting something the code no longer makes true;
  widening the shortlist to aspect-ratio buckets is separate follow-up work.
- **Nothing else.** No drive-by cleanup of the surrounding sweep code is in scope.

## Rollback

**Code:** `git revert` the single commit (or `git checkout origin/main -- lib/nina/perceptual.ts
scripts/nina-dedupe-plan.mjs tests/nina.perceptual.test.ts tests/nina.dedupeMedia.test.ts`). The
change has no schema, no migration, no config and no import-boundary component, so reverting it
restores the exact prior predicate.

**Production merge:** harder, and asymmetric — this is why Step 8 is a hard STOP gate.
- The row repoint is reversible from the DB: set the loser's `source_image_id` back to `null` and
  restore its `blob_url`/`pathname`/`content_hash`/`width`/`height`/`bytes`. The pre-apply values
  are in `/tmp/nina-dedupe-dryrun.txt` (the dry run prints the loser's pathname and byte size) and
  in Neon's point-in-time history.
- The loser's **Blob object is deleted** by `release-blob` and is NOT recoverable. If the wrong
  keeper was elected, the surviving bytes are the other side's — the row can be repointed but the
  deleted object cannot be brought back. Confirm the keeper in Step 8 before applying; that is the
  only real mitigation.
