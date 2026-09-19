# Phase 3: Server-side crop execution

**Plan set:** `PHOTOSHOP_ASPECT_RATIO_CROP_PLAN.md`
**Analysis:** `20260919-134412-K7Q2_code_analyzer.md`
**Satisfies:** R1 — the model actually receives real pixels cropped to the admin's exact chosen
`aspect_ratio` enum value, in both anchor and edit mode
**Depends on:** Phase 1 (`lib/nina/photoshopCrop.ts`'s `photoshopCropBox`, and
`ninaImageAspectRatioValue` from `lib/nina/imagerecipe.ts`),
Phase 2 (`NinaPhotoshopJobArgs`'s four new crop fields)
**Difficulty:** HARD
**Package:** `lib/nina`

---

## Goal

After this phase a `nina_photoshop_jobs` row that carries all four crop fields makes
`attemptPhotoshopOnce` compute a pixel crop box, hand it to `callNinaImageModel`, and send
OpenRouter the source photo's bytes **already cropped** to that box, with `aspect_ratio` set to the
exact stored label — bypassing `nearestNinaImageAspectRatio` identically in anchor and edit mode. A
row with any of the four fields NULL takes exactly the path `main` takes today, byte for byte, and
that equality is asserted rather than assumed. No schema, no Server Action, no UI is touched.

## Interface Contract

The reconciler reads this section to detect cross-phase conflicts. Be exact and exhaustive.

**Deletes:** none.

**Renames:** none.

**Creates:**
- `NinaImageCropBox` — exported interface (`lib/nina/imagecall.ts`), `{ left, top, width, height }`,
  all integers, all pixels, origin top-left of the SOURCE image.
- `cropImageReferenceBytes` — module-private async helper (`lib/nina/imagecall.ts`).
- `photoshopCropFor` — module-private helper (`lib/nina/photoshopRun.ts`).
- `tests/nina.photoshopRun.test.ts` — new file (confirmed absent: `ls tests/ | grep photoshop`
  returns nothing today).

**Signature changes:**
- `fetchNinaImageReference(url: string)` -> `fetchNinaImageReference(url: string, cropBox: NinaImageCropBox | null = null)`
  (module-private; no external caller).
- `callNinaImageModel(prompt, seed, referenceUrl?, model?, resolution?, aspectRatio?)` ->
  `callNinaImageModel(prompt, seed, referenceUrl?, model?, resolution?, aspectRatio?, cropBox?: NinaImageCropBox | null)`.
  **Purely additive, 7th positional, defaulted to `undefined`.** The two existing call sites
  (`lib/nina/imagerun.ts:743` passes 4 args; `lib/nina/photoshopRun.ts:99` passes 6) compile and
  behave unchanged.

**Requires (from earlier phases) — READ THIS FIRST, RECONCILER:**

1. **Phase 2** — `NinaPhotoshopJobArgs` (`lib/nina/photoshopJobs.ts`) carries exactly these four
   optional fields, and `claimNinaPhotoshopJob` reads them back into `claim.args`:
   ```ts
   cropRatioLabel: string | null
   cropScale: number | null
   cropX: number | null
   cropY: number | null
   ```
   This phase reads them by these names only. If Phase 2 spells any of them differently, or types
   them `?: T | undefined` rather than `: T | null`, the only edit needed here is the destructure
   and the null-guard inside `photoshopCropFor` (Step 4) — nothing else in this phase names them.

2. **Phase 1** — `lib/nina/imagerecipe.ts` exports `NINA_IMAGE_ASPECT_RATIOS`
   (`ReadonlyArray<{ label: string; ratio: number }>`). **This phase no longer reads it directly**
   after round-1 reconciliation — see item 4 — but Phase 5's `<select>` and Phase 4's test sweep do,
   so the export is still load-bearing for the plan set.

3. **Phase 1** — `lib/nina/photoshopCrop.ts` exports **one pixel-crop-box function**.
   **RECONCILED (round 1):** this phase was drafted against an assumed signature
   `photoshopCropBox(natural, crop, targetRatio) -> {left,top,width,height}`. Phase 1's actual,
   committed signature is **source-first, ratio-second, crop-third, and NULLABLE**:
   ```ts
   export function photoshopCropBox(
     source: NinaPhotoshopSourceSize,   // { width: number | null; height: number | null }
     targetRatio: number,
     crop: NinaPhotoshopCrop,           // { scale: number; x: number; y: number }
   ): NinaPhotoshopCropBox | null       // { left, top, width, height }, or null
   ```
   Step 4's `photoshopCropFor` below has been rewritten to this signature, including the
   **`null` return**: Phase 1 returns `null` when the source/ratio pair cannot express an integer
   rectangle (a 3x2 thumbnail asked for 1:8), and Phase 1's own handoff states the contract —
   *"treat that as 'no crop' — fall back to today's `nearestNinaImageAspectRatio` path rather than
   failing the job."* That is exactly `photoshopCropFor`'s existing "crop cannot be applied -> drop
   the crop" design, so the null lands on the same `return null` the out-of-bounds checks already
   take.

   **The whole dependency is still confined to one function body** — `photoshopCropFor` (Step 4) —
   plus one `vi.mock` key and one `toHaveBeenCalledWith` in `tests/nina.photoshopRun.test.ts`.
   **The return type is NOT imported by name anywhere in this phase** — `photoshopRun.ts` assigns
   it to `NinaImageCropBox` structurally, so Phase 1's `NinaPhotoshopCropBox` assigns cleanly.

4. **Phase 1** — `lib/nina/imagerecipe.ts` also exports
   `ninaImageAspectRatioValue(label: string): number | null` — the label -> numeric-ratio lookup,
   `null` doubling as the closed-set membership test. **RECONCILED (round 1):** this phase's
   original three-line `NINA_IMAGE_ASPECT_RATIOS.find(...)` inside `photoshopCropFor` has been
   collapsed onto it, per Phase 1's own handoff and this phase's own "Not taken, deliberately"
   note. `photoshopRun.ts` therefore no longer imports `NINA_IMAGE_ASPECT_RATIOS` at all.

**Leaves alone (owned by others):**
- `lib/db/schema/nina/photoshop.ts`, `drizzle/*.sql`, `lib/nina/photoshopJobs.ts`,
  `scripts/photoshop.ts` (Phase 2)
- `lib/nina/photoshopCrop.ts`, `lib/nina/imagerecipe.ts`, `tests/nina.photoshopCrop.test.ts` (Phase 1)
- `lib/admin/photoshopActions.ts`, `app/admin/photoshop/[source]/[id]/page.tsx` (Phase 4)
- `components/admin/*` (Phase 5)
- `lib/nina/crop.ts` — square-frame-only and display-only, out of scope by the plan index's own
  Scope section.

## Files

| File | Action | What changes |
|---|---|---|
| `lib/nina/imagecall.ts` | modify | `import sharp` (:1-14); new exported `NinaImageCropBox` + module-private `cropImageReferenceBytes` (before :118); `fetchNinaImageReference` gains a `cropBox` parameter and crops between "bytes read" and "base64 encoded" (:133-196); `callNinaImageModel` gains a 7th optional parameter (:198-220) threaded at :252-255 |
| `lib/nina/photoshopRun.ts` | modify | imports (:11-25); new module-private `photoshopCropFor` (before :80); `attemptPhotoshopOnce`'s aspect-ratio block and `callNinaImageModel` call (:92-106); one warn on the success path (:139) |
| `tests/nina.imagecall.test.ts` | modify | four new cases in the existing `describe`, plus two fixture helpers (after :43) |
| `tests/nina.photoshopRun.test.ts` | create | new suite: `attemptPhotoshopOnce`'s crop-vs-no-crop branching, both modes |

## Implementation Steps

### Step 1: `lib/nina/imagecall.ts` — import `sharp` and declare the crop box

**File:** `lib/nina/imagecall.ts:1-14`
**Change:** Add the `sharp` import in its own external-package group, matching
`lib/nina/photoshopRun.ts:1-25`'s existing grouping (side-effect import, blank line, external
packages, blank line, `@/` internal, blank line, relative).

`sharp` is safe to add here: `next.config.ts` declares `serverExternalPackages: ['sharp']`, so it is
`require`d rather than traced into the server bundle, and `lib/nina/photoshopRun.ts` — which imports
this very file — already pulls it into the same server graph. `tests/nina.imagerun.test.ts` mocks
`@/lib/nina/imagecall` whole, so the one non-photoshop consumer's suite never loads it.

**Code:** replacement for lines 1-14:

```ts
import 'server-only'

import sharp from 'sharp'

import { ninaEnv } from '@/lib/env'

import { classifyImageFailure, type NinaImageFailure } from './imagefail'
import {
  buildImageReferenceDataUrl,
  buildImageRequestBody,
  NINA_IMAGE_REFERENCE_FETCH_TIMEOUT_MS,
  NINA_IMAGE_REFERENCE_MAX_BYTES,
  ninaImageCallTimeoutMs,
  OPENROUTER_IMAGE_URL,
  readReportedCostMicroUsd,
} from './imagerecipe'
```

**Impact:** `sharp` enters `lib/nina/imagecall.ts`'s graph, and therefore
`tests/nina.imagecall.test.ts`'s. Verified loadable and functional on this repo's `sharp@0.35.3`
(create -> `extract` -> `metadata` round-trip, and an out-of-bounds `extract` throwing
`Error: extract_area: bad extract area`).

---

### Step 2: `lib/nina/imagecall.ts` — the crop box type and the cropper

**File:** `lib/nina/imagecall.ts` — insert immediately **before** the
`fetchNinaImageReference` docblock at :118 (i.e. after the `NinaImageCallResult` union ends at :116).
**Change:** Add the exported crop-box interface and the module-private cropper.

Two decisions inside this helper carry the phase, and both are load-bearing:

- **`toBuffer()` is called with no format method.** `sharp` then re-encodes in the *input's* format
  (verified on 0.35.3: a PNG in comes back `format: 'png'`, a JPEG in comes back `format: 'jpeg'`).
  Forcing `.png()` would be the obvious move and is wrong: an 8 MiB JPEG cropped and re-encoded as
  PNG can come out LARGER than `NINA_IMAGE_REFERENCE_MAX_BYTES` and would silently lose the anchor
  on exactly the biggest, most valuable sources. Keeping the input format also keeps the served
  `content-type` header honest, so `buildImageReferenceDataUrl` still gets the truth and nothing in
  `imagerecipe.ts` has to change.
- **The box is validated against `sharp`'s own `metadata()` before `extract` runs, and a box that
  does not fit returns null rather than being clamped.** Clamping would quietly change the crop's
  aspect ratio, which is the *exact* silent stretch this whole feature exists to eliminate — a
  cropped-but-wrong-shape reference sent under an exact `aspect_ratio` label is worse than no
  reference, because nothing anywhere would report it. The pixel dimensions being compared come
  from the same `sharp().metadata()` convention that `measureImageBytes` (`photoshopRun.ts:50`)
  used to record `width`/`height` in the first place, so EXIF orientation cannot make the stored
  numbers and these numbers disagree.

**Code:**

```ts
/**
 * **A pixel rectangle inside the SOURCE image, for `sharp().extract(...)`.** Origin is the source's
 * top-left, every field is an integer count of pixels, and the rectangle is required to lie wholly
 * within the source — this type is the wire between `lib/nina/photoshopCrop.ts`'s pure arithmetic
 * (which computes it) and `sharp` (which applies it).
 *
 * Declared HERE rather than imported from the crop module so that `imagecall.ts` — the one file
 * that actually touches the bytes — owns the shape it consumes, and so this file keeps no
 * dependency on a module whose only other consumer is the admin UI. The crop module's own return
 * type assigns to it structurally.
 */
export interface NinaImageCropBox {
  left: number
  top: number
  width: number
  height: number
}

/**
 * **The crop, applied to real bytes. It never throws, and it never guesses.**
 *
 * Returns null — which costs the caller its anchor and nothing else — on every way this can go
 * wrong: a non-integer or negative box, a degenerate box, bytes `sharp` cannot decode, or a box
 * that does not fit the pixels that actually arrived.
 *
 * **It deliberately does NOT clamp a box that overhangs.** The box came from the admin's chosen
 * ratio; trimming it to fit changes its aspect ratio, and a reference at the wrong ratio sent under
 * an exact `aspect_ratio` label reproduces the very stretch this feature removes, invisibly. The
 * job losing its anchor is loud (`anchored: false`, and `photoshopRun.ts` warns on it); a silently
 * mis-shaped anchor is not.
 *
 * **No format method before `toBuffer()`, on purpose.** `sharp` re-encodes in the input's own
 * format, so a JPEG source stays a JPEG and the served `content-type` that
 * `buildImageReferenceDataUrl` is about to vouch for stays true. Forcing PNG here would let a
 * cropped 8 MiB JPEG come back bigger than `NINA_IMAGE_REFERENCE_MAX_BYTES`.
 */
async function cropImageReferenceBytes(
  bytes: Buffer,
  box: NinaImageCropBox,
): Promise<Buffer | null> {
  if (
    !Number.isInteger(box.left) ||
    !Number.isInteger(box.top) ||
    !Number.isInteger(box.width) ||
    !Number.isInteger(box.height) ||
    box.left < 0 ||
    box.top < 0 ||
    box.width < 1 ||
    box.height < 1
  ) {
    return null
  }

  try {
    /* One instance, read then extracted. `metadata()` does not consume the pipeline, so the same
     * object serves both — and `failOn: 'none'` is `measureImageBytes`'s posture in
     * `lib/nina/photoshopRun.ts`, for the same reason: a warning-level defect in an album photo
     * must not cost the operator the job. */
    const image = sharp(bytes, { failOn: 'none' })
    const meta = await image.metadata()
    const width = meta.width ?? 0
    const height = meta.height ?? 0
    if (width < 1 || height < 1) return null
    if (box.left + box.width > width) return null
    if (box.top + box.height > height) return null

    return await image
      .extract({ left: box.left, top: box.top, width: box.width, height: box.height })
      .toBuffer()
  } catch {
    return null
  }
}
```

**Impact:** New module-private surface only. Nothing calls it yet after this step.

---

### Step 3: `lib/nina/imagecall.ts` — `fetchNinaImageReference` takes the box, `callNinaImageModel` threads it

**File:** `lib/nina/imagecall.ts:133-196` (the function) and `:198-220` / `:250-255` (the caller)
**Change:** One new defaulted parameter on the private fetcher; the crop applied between the size
checks and `buildImageReferenceDataUrl`; one new defaulted 7th parameter on the public entry point.

Note what does **not** change: the crop runs inside `fetchNinaImageReference`, which already
happens before `postTimeoutMs` is computed at :263-266 — so the crop's elapsed time is already
subtracted from the POST's abort budget by the existing arithmetic, and the docblock's promise that
"the chosen ceiling bounds this whole function" still holds with no edit.

**Code:** full replacement for `fetchNinaImageReference`'s docblock and body (:118-196). Only the
docblock's new third bullet, the signature, and the block marked below are new; every other line is
today's, unchanged.

```ts
/**
 * **The anchor, off Blob and into a `data:` URL. It never throws and it never blocks a job.**
 *
 * Modelled on `lib/nina/vision.ts`'s `toDataUri` (`:253-286`) — a `data:` URL rather than the
 * hosted URL, and the media type READ BACK from the object's own `content-type` and allow-listed
 * rather than assumed — with three differences that matter here:
 *
 *   1. **It returns null instead of throwing.** `vision.ts` throws because a description with no
 *      image is worthless; a photograph with no anchor is still a photograph.
 *   2. **It is BOUNDED.** `vision.ts` fetches chat photos, which are ≤ 900 KB by construction.
 *      This fetches whatever the operator picked out of the album, which is ≤ 8 MiB by
 *      construction — so `NINA_IMAGE_REFERENCE_MAX_BYTES` is a belt-and-braces guard on a set that
 *      every writer already bounds, checked twice: once against the declared `content-length`
 *      (cheap, and Vercel Blob serves one) and once against the bytes actually read.
 *   3. **It may CROP.** `cropBox` is the photoshop aspect-ratio crop's one execution site: the
 *      admin's rectangle is stored on the job row as parameters, never as a derived blob, and it is
 *      applied HERE — to bytes fetched fresh on this attempt — in the one gap between "the object
 *      arrived" and "it became a `data:` URL". A third check against
 *      `NINA_IMAGE_REFERENCE_MAX_BYTES` follows the crop, because a re-encode is new bytes and a
 *      ceiling that is only checked on the input is a ceiling with a hole in it.
 */
async function fetchNinaImageReference(
  url: string,
  /**
   * The photoshop crop, in source pixels, or null for every other caller. Defaulted so that the
   * only call site that does not supply it reads exactly as it did before this parameter existed.
   */
  cropBox: NinaImageCropBox | null = null,
): Promise<string | null> {
  const startedAt = Date.now()
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(NINA_IMAGE_REFERENCE_FETCH_TIMEOUT_MS),
      cache: 'no-store',
    })

    if (!res.ok) {
      console.warn('[nina] image reference dropped — blob fetch failed', {
        url,
        status: res.status,
      })
      return null
    }

    const declared = res.headers.get('content-length')
    const declaredBytes = declared == null ? null : Number.parseInt(declared, 10)
    if (
      declaredBytes != null &&
      Number.isFinite(declaredBytes) &&
      declaredBytes > NINA_IMAGE_REFERENCE_MAX_BYTES
    ) {
      console.warn('[nina] image reference dropped — declared too large', {
        url,
        declaredBytes,
        maxBytes: NINA_IMAGE_REFERENCE_MAX_BYTES,
      })
      return null
    }

    const bytes = Buffer.from(await res.arrayBuffer())
    if (bytes.byteLength === 0 || bytes.byteLength > NINA_IMAGE_REFERENCE_MAX_BYTES) {
      console.warn('[nina] image reference dropped — bad size', {
        url,
        bytes: bytes.byteLength,
        maxBytes: NINA_IMAGE_REFERENCE_MAX_BYTES,
      })
      return null
    }

    const served = res.headers.get('content-type') ?? ''

    /* ── THE CROP ───────────────────────────────────────────────────────────────────────────────
     * Skipped entirely when no box was supplied, so every non-photoshop caller and every
     * skipped-the-crop-step photoshop job runs the same instructions it ran before this block
     * existed. When a box IS supplied and cannot be applied, the anchor is dropped rather than the
     * uncropped bytes being sent: uncropped bytes under an exact `aspect_ratio` label is the
     * stretch this feature exists to remove, and it would go unreported.
     *
     * `served` is read above rather than below so this warning can name the content type even when
     * the reason `sharp` refused the bytes is that they were never an image. */
    let payload = bytes
    if (cropBox != null) {
      const cropped = await cropImageReferenceBytes(bytes, cropBox)
      if (cropped == null) {
        console.warn('[nina] image reference dropped — crop could not be applied', {
          url,
          contentType: served,
          cropBox,
        })
        return null
      }
      if (cropped.byteLength === 0 || cropped.byteLength > NINA_IMAGE_REFERENCE_MAX_BYTES) {
        console.warn('[nina] image reference dropped — cropped bytes too large', {
          url,
          bytes: cropped.byteLength,
          maxBytes: NINA_IMAGE_REFERENCE_MAX_BYTES,
        })
        return null
      }
      payload = cropped
    }

    const dataUrl = buildImageReferenceDataUrl(served, payload.toString('base64'))
    if (dataUrl == null) {
      console.warn('[nina] image reference dropped — content type not vouched for', {
        url,
        served,
      })
      return null
    }

    console.info('[nina] image reference attached', {
      bytes: payload.byteLength,
      contentType: served,
      cropped: cropBox != null,
      fetchMs: Date.now() - startedAt,
    })
    return dataUrl
  } catch (cause) {
    /* A timeout, a DNS failure, a truncated body — all of them cost the anchor and none of them
     * costs the job. */
    console.warn('[nina] image reference dropped — fetch threw', { url, cause: String(cause) })
    return null
  }
}
```

**Code:** replacement for `callNinaImageModel`'s parameter list (:198-220) — only the new 7th
parameter is added:

```ts
export async function callNinaImageModel(
  prompt: string,
  seed: number,
  /**
   * The job's `args.referenceUrl`, already normalised by `ninaImageReferenceUrl`. Optional and
   * defaulted so every existing caller — and `tests/nina.imagecall.test.ts`'s four positional
   * calls — is unchanged.
   */
  referenceUrl: string | null = null,
  /**
   * The job's chosen camera, already normalised by `coerceNinaImageModel`. Optional and defaulted
   * to the module constant for the same reason `referenceUrl` is defaulted — the payload builder
   * owns the fallback, so a caller that never heard of the dropdown builds the body it always
   * built.
   */
  model?: string,
  /** Passed straight to `buildImageRequestBody`'s own `resolution` — see that field's header.
   * Optional and defaulted (there, not here) so every existing positional call is unchanged. */
  resolution?: string,
  /** Passed straight to `buildImageRequestBody`'s own `aspectRatio` — see that field's header.
   * Optional and defaulted (there, not here) so every existing positional call is unchanged. */
  aspectRatio?: string,
  /**
   * **The photoshop aspect-ratio crop, in SOURCE pixels.** Absent for every caller but
   * `attemptPhotoshopOnce` on a job whose admin used the crop step — and absent there too when they
   * skipped it. Threaded straight to `fetchNinaImageReference` and applied to the reference bytes
   * before they are encoded; it changes nothing about the request body, which is
   * `aspectRatio`'s job. Passing a box without also passing the matching `aspectRatio` label is a
   * caller bug this function does not police: `photoshopRun.ts` derives both from one place so the
   * pair cannot drift.
   */
  cropBox?: NinaImageCropBox | null,
): Promise<NinaImageCallResult> {
```

**Code:** replacement for :250-255 (the one line that consumes it):

```ts
  /* The anchor, if this job asked for one. BEFORE the key check would have been wrong: a job with
   * no key must not spend ten seconds pulling bytes it will never send. */
  const referenceDataUrl =
    referenceUrl == null || referenceUrl.length === 0
      ? null
      : await fetchNinaImageReference(referenceUrl, cropBox ?? null)
```

**Impact:** `lib/nina/imagerun.ts:743` (4 positional args) and `lib/nina/photoshopRun.ts:99` (6
positional args, until Step 4) both compile untouched and take the `cropBox === undefined` path,
where `cropBox ?? null` is `null` and the crop block is skipped — the same instruction sequence as
`main`. Asserted, not assumed, by the regression case in Step 5.

---

### Step 4: `lib/nina/photoshopRun.ts` — read the job's crop and use it in both modes

**File:** `lib/nina/photoshopRun.ts:11-25` (imports), a new helper before `:80`, and `:92-106` +
`:139` inside `attemptPhotoshopOnce`.
**Change:** A crop supplied on the job row overrides *both* modes' aspect-ratio fallback and travels
with a pixel box; a crop that is absent, partial, dimension-less or names an unknown label leaves
today's two-branch fallback exactly as it is.

The helper exists so that the whole of this phase's dependency on Phase 1 and Phase 2 sits in one
function body. `attemptPhotoshopOnce` itself names no crop field and no crop-math symbol.

**Code:** replacement for the import block (:11-25):

```ts
import { logNinaError } from './errorlogs'
import { callNinaImageModel, type NinaImageCropBox } from './imagecall'
import {
  NINA_IMAGE_CACHE_MAX_AGE,
  NINA_IMAGE_CONTENT_TYPE,
  nearestNinaImageAspectRatio,
  ninaImageAspectRatioValue,
} from './imagerecipe'
import { photoshopCropBox } from './photoshopCrop'
import {
  claimNinaPhotoshopJob,
  completeNinaPhotoshopJob,
  failNinaPhotoshopJob,
  requeueNinaPhotoshopJob,
  NINA_PHOTOSHOP_MAX_ATTEMPTS,
  type NinaPhotoshopJobArgs,
} from './photoshopJobs'
import { photoshopModelResolution } from './photoshopPresets'
```

**Code:** new module-private helper, inserted immediately before `attemptPhotoshopOnce`'s docblock
at `:75`:

```ts
/**
 * **The job row's crop, turned into something `sharp` can apply — or nothing at all.**
 *
 * The all-or-nothing convention is `nina_avatars`' own, widened by one field: four NULLs (or any
 * one of the four NULL) means "the admin skipped the crop step", and this returns null, and
 * `attemptPhotoshopOnce` runs the code it ran before this feature existed. A partial set is
 * treated as absent rather than as a crop with defaults — a half-written crop is not a crop the
 * admin ever looked at, and guessing the missing half is how a photo gets cropped somewhere nobody
 * chose. (`runPhotoshopJobAction` coerces partials away at the boundary too, in Phase 4; this is
 * the second of the two, because the row can also be written by a future caller.)
 *
 * **This function is the ONLY place in this phase that names a Phase 1 or Phase 2 symbol** —
 * `photoshopCropBox`, `ninaImageAspectRatioValue`, and the four `args.crop*` fields. If either
 * phase landed a different spelling, this body is the whole edit.
 *
 * `photoshopCropBox` itself returns `null` for a source/ratio pair no integer rectangle can express
 * (a 3x2 thumbnail asked for 1:8) — Phase 1's documented contract, and it means exactly what the
 * bounds checks below mean: no crop, today's behaviour, not a failed job.
 *
 * The bounds re-check after `photoshopCropBox` is not distrust of Phase 1's clamping; it is the
 * difference between two failure modes. A box that overhangs makes `sharp` refuse and the job lose
 * its anchor entirely; returning null here instead degrades to "no crop", which is today's shipped
 * behaviour and a photograph the operator can use. The cheaper failure is the better one, and the
 * expensive one is still reachable (the stored `sourceWidth`/`sourceHeight` can, in principle,
 * disagree with the bytes that actually arrive) — `imagecall.ts` warns loudly when it happens.
 */
function photoshopCropFor(
  args: NinaPhotoshopJobArgs,
  sourceWidth: number | null,
  sourceHeight: number | null,
): { ratioLabel: string; box: NinaImageCropBox } | null {
  const { cropRatioLabel, cropScale, cropX, cropY } = args
  if (cropRatioLabel == null || cropScale == null || cropX == null || cropY == null) return null
  if (sourceWidth == null || sourceHeight == null) return null
  if (!(sourceWidth > 0) || !(sourceHeight > 0)) return null
  if (!Number.isFinite(cropScale) || !Number.isFinite(cropX) || !Number.isFinite(cropY)) return null

  /* The stored label must still be one the provider accepts. A label that fell out of the enum
   * between the click and the run is not a ratio we may send, and it is not worth failing a job
   * over either — the nearest-bucket fallback below is exactly what a job with no crop gets.
   * `ninaImageAspectRatioValue` answers "is it catalogued" and "what is it numerically" in one
   * call: `null` is the miss, and it is the same closed set Phase 4's boundary check reads. */
  const targetRatio = ninaImageAspectRatioValue(cropRatioLabel)
  if (targetRatio == null) return null

  /* Argument order is Phase 1's: SOURCE, then TARGET RATIO, then the crop. */
  const box = photoshopCropBox(
    { width: sourceWidth, height: sourceHeight },
    targetRatio,
    { scale: cropScale, x: cropX, y: cropY },
  )
  if (box == null) return null
  if (box.width < 1 || box.height < 1) return null
  if (box.left < 0 || box.top < 0) return null
  if (box.left + box.width > sourceWidth) return null
  if (box.top + box.height > sourceHeight) return null

  return { ratioLabel: cropRatioLabel, box }
}
```

**Code:** replacement for `attemptPhotoshopOnce`'s head, :80-106 (the docblock at :75-79 is
unchanged and sits above this):

```ts
async function attemptPhotoshopOnce(
  userId: string,
  jobId: string,
  sourceUrl: string,
  sourceWidth: number | null,
  sourceHeight: number | null,
): Promise<'ok' | 'retry' | 'gave-up'> {
  const claim = await claimNinaPhotoshopJob(userId, jobId)
  if (claim == null) return 'gave-up'

  const seed = Math.floor(Math.random() * PHOTOSHOP_SEED_MAX)
  const resolution = photoshopModelResolution(claim.args.model)

  /* **The admin's aspect-ratio crop, when they used it.** It overrides BOTH modes' fallback and it
   * overrides them identically, because it needs no guessing: the rectangle IS one of the
   * provider's exact `aspect_ratio` values, so the label below is the truth about the bytes rather
   * than the nearest bucket to them. Anchor mode's fixed `NINA_IMAGE_ASPECT` default and edit
   * mode's `nearestNinaImageAspectRatio` both survive UNCHANGED as the no-crop path. */
  const crop = photoshopCropFor(claim.args, sourceWidth, sourceHeight)

  /* **The 2026-09-19 edit-mode aspect fix** (`nearestNinaImageAspectRatio`'s own header), now the
   * middle branch. Anchor mode with no crop keeps `buildImageRequestBody`'s fixed
   * `NINA_IMAGE_ASPECT` default — a deliberate stylistic choice for a fresh generation — by
   * passing `undefined` here. */
  const aspectRatio =
    crop != null
      ? crop.ratioLabel
      : claim.args.mode === 'edit' && sourceWidth != null && sourceHeight != null
        ? nearestNinaImageAspectRatio(sourceWidth, sourceHeight)
        : undefined

  const outcome = await callNinaImageModel(
    claim.args.promptText,
    seed,
    sourceUrl,
    claim.args.model,
    resolution,
    aspectRatio,
    crop?.box,
  )
```

**Code:** the one new block on the success path, inserted at `:139` — between the `if (!outcome.ok)`
block's closing brace and the `try {` that stores the result:

```ts
  /* A crop that was asked for and did not happen is the one failure this feature can have that
   * costs money and looks like success: the picture comes back, billed, composed onto the ratio the
   * label promised, from bytes that were never cropped to it. `fetchNinaImageReference` refuses to
   * send uncropped bytes under an exact label — it drops the anchor instead — so the symptom is
   * always `anchored: false`, and this is where the job log says so. */
  if (crop != null && !outcome.anchored) {
    console.warn('[photoshop] crop requested but the reference was dropped — nothing was cropped', {
      jobId,
      ratioLabel: crop.ratioLabel,
      box: crop.box,
    })
  }
```

**Impact:** A job with no crop calls `callNinaImageModel` with a 7th argument of `undefined`, which
is identical to not passing it. A job with a crop gets the exact label and the box. Both modes take
the same override. Nothing about failure handling, retry, blob storage or completion changes.

---

### Step 5: `tests/nina.imagecall.test.ts` — the crop parameter, and the regression

**File:** `tests/nina.imagecall.test.ts` — two helpers after `:43`, four cases at the end of the
existing `describe` (after `:264`).
**Change:** Add coverage using the file's existing injected-`fetch` pattern (`stubTwoHostFetch`),
with a REAL PNG built by `sharp` so the assertion reads the actual cropped pixels back rather than
trusting a mock.

**Code:** add to the import block at the top (external-package group, before the relative imports):

```ts
import sharp from 'sharp'
```

**Code:** the two helpers, placed after `blobPng` at `:43`:

```ts
/**
 * A REAL PNG of a known size. The crop cases decode what went on the wire and read its dimensions
 * back with `sharp`, so the fixture has to be an image a decoder will accept — `Buffer.alloc` (what
 * `blobPng` serves, and all the pre-crop cases need) is not.
 */
async function pngOf(width: number, height: number): Promise<Buffer> {
  return await sharp({
    create: { width, height, channels: 3, background: { r: 12, g: 34, b: 56 } },
  })
    .png()
    .toBuffer()
}

/** The one `input_references` entry's `data:` URL, off the POST this call made. Null when the call
 * went out unanchored. */
function referenceDataUrl(fn: ReturnType<typeof stubTwoHostFetch>): string | null {
  const init = fn.mock.calls[1]?.[1] as RequestInit
  const body = JSON.parse(String(init.body)) as {
    input_references?: Array<{ image_url: { url: string } }>
  }
  return body.input_references?.[0]?.image_url.url ?? null
}
```

**Code:** the four cases, appended inside the `describe` block:

```ts
  it('R1: a crop box crops the reference bytes before they are encoded', async () => {
    process.env.OPENROUTER_API_KEY = 'sk-or-unit-test-never-sent'
    const source = await pngOf(120, 90)
    const fn = stubTwoHostFetch(
      new Response(source, {
        status: 200,
        headers: { 'content-type': 'image/png', 'content-length': String(source.byteLength) },
      }),
      okImage(),
    )

    const result = await callNinaImageModel(
      'a photograph',
      42,
      'https://blob.test/nina/a.png',
      undefined,
      undefined,
      '3:2',
      { left: 10, top: 20, width: 60, height: 40 },
    )

    expect(result.ok).toBe(true)
    if (result.ok) expect(result.anchored).toBe(true)

    const url = referenceDataUrl(fn)
    expect(url?.startsWith('data:image/png;base64,')).toBe(true)

    /* The bytes that actually went on the wire, decoded. Not "a crop was requested" — the picture
     * the model received is 60x40, which is the whole claim this feature makes. */
    const sent = Buffer.from(String(url).slice('data:image/png;base64,'.length), 'base64')
    const meta = await sharp(sent).metadata()
    expect(meta.width).toBe(60)
    expect(meta.height).toBe(40)

    /* The label rides the body untouched — cropping the bytes and naming the ratio are two
     * separate jobs and this call does both. */
    const init = fn.mock.calls[1]?.[1] as RequestInit
    const body = JSON.parse(String(init.body)) as Record<string, unknown>
    expect(body.aspect_ratio).toBe('3:2')
  })

  it('R1 regression: NO crop box leaves the reference byte-identical to the fetched object', async () => {
    process.env.OPENROUTER_API_KEY = 'sk-or-unit-test-never-sent'
    const source = await pngOf(120, 90)
    const fn = stubTwoHostFetch(
      new Response(source, {
        status: 200,
        headers: { 'content-type': 'image/png', 'content-length': String(source.byteLength) },
      }),
      okImage(),
    )

    /* Six positional arguments — the call `lib/nina/photoshopRun.ts` made before this phase, and
     * the call it still makes for a job whose admin skipped the crop step. */
    const result = await callNinaImageModel(
      'a photograph',
      42,
      'https://blob.test/nina/a.png',
      undefined,
      undefined,
      '4:3',
    )

    expect(result.ok).toBe(true)
    if (result.ok) expect(result.anchored).toBe(true)
    expect(referenceDataUrl(fn)).toBe(`data:image/png;base64,${source.toString('base64')}`)
  })

  it('R1: a crop box that does not fit the fetched bytes drops the anchor — never the wrong pixels', async () => {
    process.env.OPENROUTER_API_KEY = 'sk-or-unit-test-never-sent'
    const source = await pngOf(120, 90)
    const fn = stubTwoHostFetch(
      new Response(source, {
        status: 200,
        headers: { 'content-type': 'image/png', 'content-length': String(source.byteLength) },
      }),
      okImage(),
    )

    /* 100 + 60 overhangs a 120px-wide source. Clamping it would silently change the crop's aspect
     * ratio while `aspect_ratio: '3:2'` still promised otherwise — the exact stretch this feature
     * exists to remove. Dropping the anchor is the loud answer. */
    const result = await callNinaImageModel(
      'a photograph',
      42,
      'https://blob.test/nina/a.png',
      undefined,
      undefined,
      '3:2',
      { left: 100, top: 20, width: 60, height: 40 },
    )

    expect(result.ok).toBe(true)
    if (result.ok) expect(result.anchored).toBe(false)
    expect(referenceDataUrl(fn)).toBeNull()
  })

  it('R1: a crop box on an UNANCHORED call is inert — no reference, no fetch, no throw', async () => {
    process.env.OPENROUTER_API_KEY = 'sk-or-unit-test-never-sent'
    const fn = stubTwoHostFetch(blobPng(), okImage())

    const result = await callNinaImageModel('a photograph', 42, null, undefined, undefined, '1:1', {
      left: 0,
      top: 0,
      width: 10,
      height: 10,
    })

    expect(result.ok).toBe(true)
    if (result.ok) expect(result.anchored).toBe(false)
    /* One fetch: the generation. A box with nothing to crop must not invent a reference. */
    expect(fn.mock.calls.length).toBe(1)
    expect(String(fn.mock.calls[0]?.[0])).toBe(OPENROUTER_IMAGE_URL)
  })
```

**Impact:** The existing seven cases are untouched and still pass — none of them passes a 7th
argument, and the crop block is skipped when `cropBox` is null.

---

### Step 6: `tests/nina.photoshopRun.test.ts` — the branching, both modes

**File:** `tests/nina.photoshopRun.test.ts` (new; confirmed no photoshop-focused suite exists today)
**Change:** New suite driving the module-private `attemptPhotoshopOnce` through its only door,
`runPhotoshopJob` — the shape `tests/nina.imagerun.test.ts` established for `finishSelfie`.

`@/lib/nina/photoshopCrop` is mocked **on purpose**: Phase 1's own suite
(`tests/nina.photoshopCrop.test.ts`) owns the crop arithmetic, and this suite owns the branching
around it. Mocking it also means this file cannot fail for a reason that belongs to another phase.
`@/lib/nina/imagerecipe` is deliberately NOT mocked — `nearestNinaImageAspectRatio` and
`ninaImageAspectRatioValue` are the real ones, so the "a crop bypasses the nearest bucket" claim is
compared against the bucket that would really have been picked. `sharp` is not mocked either;
`measureImageBytes` runs it on the three bytes of `'ABC'`, throws, and returns `{0, 0}`, which is the
shipped degradation and costs this suite nothing.

**Code:**

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { callNinaImageModel } from '@/lib/nina/imagecall'
import { nearestNinaImageAspectRatio } from '@/lib/nina/imagerecipe'
import { photoshopCropBox } from '@/lib/nina/photoshopCrop'
import { claimNinaPhotoshopJob, completeNinaPhotoshopJob } from '@/lib/nina/photoshopJobs'
import type { NinaPhotoshopJobArgs } from '@/lib/nina/photoshopJobs'
import { runPhotoshopJob } from '@/lib/nina/photoshopRun'

/**
 * **`attemptPhotoshopOnce`'s crop branch, in both modes.**
 *
 * The claim this suite pins: a job carrying all four crop fields sends the model a pixel box AND
 * the exact stored `aspect_ratio` label — in ANCHOR mode as well as EDIT mode — while a job
 * carrying none of them makes byte-identically the call `main` made, which is the plan's
 * Invariant 2 in its only executable form.
 *
 * `attemptPhotoshopOnce` is module-private, so every case drives it through `runPhotoshopJob`, its
 * only door — `tests/nina.imagerun.test.ts`'s own shape for `finishSelfie`. Everything that leaves
 * the process is mocked: `@vercel/blob`, `lib/env`, the job store, the error log, and the image
 * model. `lib/nina/photoshopRun.ts` opens with `import 'server-only'`, aliased by
 * `vitest.config.ts`, so importing it is safe.
 *
 * `@/lib/nina/photoshopCrop` is mocked and `@/lib/nina/imagerecipe` is not, deliberately: the crop
 * arithmetic has its own suite, and the point of this one is that a crop OVERRIDES the ratio the
 * real `nearestNinaImageAspectRatio` would otherwise have picked. The mocked
 * `photoshopCropBox` returns `NinaPhotoshopCropBox | null` in Phase 1's real contract, so one case
 * below drives the `null` branch explicitly.
 *
 * `sharp` is left real. `measureImageBytes` runs it over the three bytes behind `'QUJD'`, fails to
 * decode, and returns `{ width: 0, height: 0 }` — the shipped fallback, exercised for free.
 */

vi.mock('next/server', () => ({ after: (task: () => unknown) => void task }))

const { putBlob } = vi.hoisted(() => ({ putBlob: vi.fn() }))

vi.mock('@vercel/blob', () => ({ put: putBlob }))
vi.mock('@/lib/env', () => ({ blobEnv: () => ({ BLOB_READ_WRITE_TOKEN: 'test-token' }) }))
vi.mock('@/lib/nina/errorlogs', () => ({ logNinaError: vi.fn() }))
vi.mock('@/lib/nina/imagecall', () => ({ callNinaImageModel: vi.fn() }))
vi.mock('@/lib/nina/photoshopCrop', () => ({ photoshopCropBox: vi.fn() }))
/* A `vi.mock` factory REPLACES the module, so every runtime export this file's subject reads has
 * to be named here — including the CONSTANT, whose absence would make the retry comparison
 * `attempts < undefined` and silently turn every failure into a give-up. */
vi.mock('@/lib/nina/photoshopJobs', () => ({
  claimNinaPhotoshopJob: vi.fn(),
  completeNinaPhotoshopJob: vi.fn(),
  failNinaPhotoshopJob: vi.fn(),
  requeueNinaPhotoshopJob: vi.fn(),
  NINA_PHOTOSHOP_MAX_ATTEMPTS: 2,
}))

const claim = vi.mocked(claimNinaPhotoshopJob)
const complete = vi.mocked(completeNinaPhotoshopJob)
const call = vi.mocked(callNinaImageModel)
const cropBoxOf = vi.mocked(photoshopCropBox)

const USER_ID = 'usrAAAAAAAAA'
const JOB_ID = 'psjAAAAAAAAA'
const SOURCE_URL = 'https://blob.test/nina/source.png'

/** 832x732, ratio 1.137 — the live source from the plan's own repro. Its nearest bucket is `5:4`,
 * which is exactly the ~10%-wide result the crop step exists to make impossible. */
const SOURCE_WIDTH = 832
const SOURCE_HEIGHT = 732

const BOX = { left: 40, top: 0, width: 585, height: 732 }

function argsOf(overrides: Partial<NinaPhotoshopJobArgs> = {}): NinaPhotoshopJobArgs {
  return {
    sourceKind: 'avatar',
    sourceId: 'avaAAAAAAAAA',
    sourceContentHash: null,
    mode: 'edit',
    model: 'bytedance-seed/seedream-4.5',
    presetKey: null,
    promptText: 'bigger smile',
    cropRatioLabel: null,
    cropScale: null,
    cropX: null,
    cropY: null,
    ...overrides,
  } as NinaPhotoshopJobArgs
}

/** The seven arguments `callNinaImageModel` was handed, named. */
function lastCall() {
  const args = call.mock.calls[0] as unknown as [
    string,
    number,
    string | null,
    string | undefined,
    string | undefined,
    string | undefined,
    { left: number; top: number; width: number; height: number } | undefined,
  ]
  return { aspectRatio: args[5], cropBox: args[6] }
}

describe('attemptPhotoshopOnce — the aspect-ratio crop', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    putBlob.mockResolvedValue({ url: 'https://blob.test/nina/out.png', pathname: 'nina/out.png' })
    complete.mockResolvedValue(undefined)
    call.mockResolvedValue({
      ok: true,
      b64: 'QUJD',
      costMicroUsd: 40_000,
      latencyMs: 1,
      anchored: true,
    })
    cropBoxOf.mockReturnValue(BOX)
  })

  it('no crop, EDIT mode: the nearest bucket and no box — byte-identical to main', async () => {
    claim.mockResolvedValue({ jobId: JOB_ID, attempts: 1, args: argsOf({ mode: 'edit' }) })

    const outcome = await runPhotoshopJob(USER_ID, JOB_ID, SOURCE_URL, SOURCE_WIDTH, SOURCE_HEIGHT)

    expect(outcome).toBe('ok')
    expect(lastCall().aspectRatio).toBe(nearestNinaImageAspectRatio(SOURCE_WIDTH, SOURCE_HEIGHT))
    expect(lastCall().cropBox).toBeUndefined()
    expect(cropBoxOf).not.toHaveBeenCalled()
  })

  it('no crop, ANCHOR mode: undefined ratio and no box — the fixed default, unchanged', async () => {
    claim.mockResolvedValue({ jobId: JOB_ID, attempts: 1, args: argsOf({ mode: 'anchor' }) })

    await runPhotoshopJob(USER_ID, JOB_ID, SOURCE_URL, SOURCE_WIDTH, SOURCE_HEIGHT)

    expect(lastCall().aspectRatio).toBeUndefined()
    expect(lastCall().cropBox).toBeUndefined()
  })

  it('no crop, EDIT mode, dimensions unknown: undefined ratio — unchanged', async () => {
    claim.mockResolvedValue({ jobId: JOB_ID, attempts: 1, args: argsOf({ mode: 'edit' }) })

    await runPhotoshopJob(USER_ID, JOB_ID, SOURCE_URL, null, null)

    expect(lastCall().aspectRatio).toBeUndefined()
    expect(lastCall().cropBox).toBeUndefined()
  })

  it('a crop OVERRIDES edit mode’s nearest bucket, exactly', async () => {
    /* `4:5` is deliberately NOT what the real `nearestNinaImageAspectRatio` picks for 832x732
     * (`5:4`). If the bypass ever regressed to the fallback, this assertion is the one that says
     * so rather than passing by coincidence. */
    expect(nearestNinaImageAspectRatio(SOURCE_WIDTH, SOURCE_HEIGHT)).not.toBe('4:5')
    claim.mockResolvedValue({
      jobId: JOB_ID,
      attempts: 1,
      args: argsOf({ mode: 'edit', cropRatioLabel: '4:5', cropScale: 1.2, cropX: -30, cropY: 15 }),
    })

    await runPhotoshopJob(USER_ID, JOB_ID, SOURCE_URL, SOURCE_WIDTH, SOURCE_HEIGHT)

    expect(lastCall().aspectRatio).toBe('4:5')
    expect(lastCall().cropBox).toEqual(BOX)
    /* Phase 1's argument order: SOURCE, TARGET RATIO, CROP. Asserted positionally on purpose —
     * getting this order wrong typechecks nowhere but would crop a plausible-looking wrong box. */
    expect(cropBoxOf).toHaveBeenCalledWith(
      { width: SOURCE_WIDTH, height: SOURCE_HEIGHT },
      4 / 5,
      { scale: 1.2, x: -30, y: 15 },
    )
  })

  it('a crop OVERRIDES anchor mode’s fixed default, identically', async () => {
    claim.mockResolvedValue({
      jobId: JOB_ID,
      attempts: 1,
      args: argsOf({ mode: 'anchor', cropRatioLabel: '4:5', cropScale: 1.2, cropX: -30, cropY: 15 }),
    })

    await runPhotoshopJob(USER_ID, JOB_ID, SOURCE_URL, SOURCE_WIDTH, SOURCE_HEIGHT)

    /* R1's "both modes" instruction, as one assertion: the same four stored fields produce the same
     * label and the same box whichever mode the job is in. */
    expect(lastCall().aspectRatio).toBe('4:5')
    expect(lastCall().cropBox).toEqual(BOX)
  })

  it('a PARTIAL crop is not a crop: today’s behaviour, and the crop module is never asked', async () => {
    claim.mockResolvedValue({
      jobId: JOB_ID,
      attempts: 1,
      args: argsOf({ mode: 'edit', cropRatioLabel: '4:5', cropScale: 1.2, cropX: -30, cropY: null }),
    })

    await runPhotoshopJob(USER_ID, JOB_ID, SOURCE_URL, SOURCE_WIDTH, SOURCE_HEIGHT)

    expect(lastCall().aspectRatio).toBe(nearestNinaImageAspectRatio(SOURCE_WIDTH, SOURCE_HEIGHT))
    expect(lastCall().cropBox).toBeUndefined()
    expect(cropBoxOf).not.toHaveBeenCalled()
  })

  it('a label the provider does not accept is not a crop', async () => {
    claim.mockResolvedValue({
      jobId: JOB_ID,
      attempts: 1,
      args: argsOf({ mode: 'edit', cropRatioLabel: '7:3', cropScale: 1, cropX: 0, cropY: 0 }),
    })

    await runPhotoshopJob(USER_ID, JOB_ID, SOURCE_URL, SOURCE_WIDTH, SOURCE_HEIGHT)

    expect(lastCall().aspectRatio).toBe(nearestNinaImageAspectRatio(SOURCE_WIDTH, SOURCE_HEIGHT))
    expect(lastCall().cropBox).toBeUndefined()
    expect(cropBoxOf).not.toHaveBeenCalled()
  })

  it('a crop with no source dimensions is not a crop', async () => {
    claim.mockResolvedValue({
      jobId: JOB_ID,
      attempts: 1,
      args: argsOf({ mode: 'edit', cropRatioLabel: '4:5', cropScale: 1, cropX: 0, cropY: 0 }),
    })

    await runPhotoshopJob(USER_ID, JOB_ID, SOURCE_URL, null, null)

    expect(lastCall().aspectRatio).toBeUndefined()
    expect(lastCall().cropBox).toBeUndefined()
    expect(cropBoxOf).not.toHaveBeenCalled()
  })

  it('a NULL box from the crop module is "no crop", not a failed job', async () => {
    /* Phase 1 returns `null` when no integer rectangle at the chosen ratio exists for this source
     * (its documented case: a 3x2 thumbnail asked for 1:8). Phase 1's handoff is explicit that this
     * must fall back to the no-crop path rather than fail the job, and this is that assertion. */
    cropBoxOf.mockReturnValue(null)
    claim.mockResolvedValue({
      jobId: JOB_ID,
      attempts: 1,
      args: argsOf({ mode: 'edit', cropRatioLabel: '1:8', cropScale: 1, cropX: 0, cropY: 0 }),
    })

    const outcome = await runPhotoshopJob(USER_ID, JOB_ID, SOURCE_URL, SOURCE_WIDTH, SOURCE_HEIGHT)

    expect(outcome).toBe('ok')
    expect(lastCall().aspectRatio).toBe(nearestNinaImageAspectRatio(SOURCE_WIDTH, SOURCE_HEIGHT))
    expect(lastCall().cropBox).toBeUndefined()
  })

  it('a box that overhangs the source degrades to no crop rather than to a lost anchor', async () => {
    cropBoxOf.mockReturnValue({ left: 800, top: 0, width: 585, height: 732 })
    claim.mockResolvedValue({
      jobId: JOB_ID,
      attempts: 1,
      args: argsOf({ mode: 'edit', cropRatioLabel: '4:5', cropScale: 1, cropX: 0, cropY: 0 }),
    })

    await runPhotoshopJob(USER_ID, JOB_ID, SOURCE_URL, SOURCE_WIDTH, SOURCE_HEIGHT)

    expect(lastCall().aspectRatio).toBe(nearestNinaImageAspectRatio(SOURCE_WIDTH, SOURCE_HEIGHT))
    expect(lastCall().cropBox).toBeUndefined()
  })

  it('a crop that lost its anchor is warned about, not swallowed', async () => {
    call.mockResolvedValue({
      ok: true,
      b64: 'QUJD',
      costMicroUsd: 40_000,
      latencyMs: 1,
      anchored: false,
    })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    claim.mockResolvedValue({
      jobId: JOB_ID,
      attempts: 1,
      args: argsOf({ mode: 'edit', cropRatioLabel: '4:5', cropScale: 1, cropX: 0, cropY: 0 }),
    })

    await runPhotoshopJob(USER_ID, JOB_ID, SOURCE_URL, SOURCE_WIDTH, SOURCE_HEIGHT)

    expect(
      warn.mock.calls.some(([message]) => String(message).includes('crop requested')),
    ).toBe(true)
    warn.mockRestore()
  })
})
```

**Impact:** New file only.

## Verification

**Build:** `npm run build`
**Typecheck (the real gate):** `npm run typecheck`
**Tests:**
```
npx vitest run tests/nina.imagecall.test.ts tests/nina.photoshopRun.test.ts
npm test
```
**Lint/format:** `npm run lint && npm run format:check`
**Guards:** `npm run ci:openrouter-guard && npm run ci:llm-payload-guard && npm run ci:data-layer-guard`

> **Environment note:** the worktree at
> `/home/miftah/.worktrees/run-insights/photoshop-aspect-ratio-crop` has **no `node_modules`** and
> the shell's active Node is **v20.11.1**, below `package.json`'s `"engines": { "node": ">=22" }` —
> Vitest 4 fails to boot on it (`node:util` does not export `styleText`). Run `npm ci` in the
> worktree under Node 22 before any of the above. `sharp@0.35.3` itself was verified working on
> this machine (create -> `extract` -> `metadata`; input format preserved through `toBuffer()`;
> out-of-bounds `extract` throws `extract_area: bad extract area`).

**Manual check:** none required — this phase ships no UI and no reachable behaviour change until
Phase 4/5 can write the four fields. A row can be exercised by hand with a direct
`UPDATE nina_photoshop_jobs SET crop_ratio_label=…` against a `pending` row, but **that writes
production** (`CLAUDE.md`: one database) and is not part of this phase's verification.

**Exit criteria:**
- `attemptPhotoshopOnce` on a job with all four crop fields calls `callNinaImageModel` with the
  stored label as `aspectRatio` and a pixel box as the 7th argument, in **anchor and edit mode
  alike**, and `fetchNinaImageReference` sends bytes whose decoded dimensions equal that box.
- `attemptPhotoshopOnce` on a job with any of the four NULL produces the same `callNinaImageModel`
  arguments `main` produces today (the 7th being `undefined`), asserted in
  `tests/nina.photoshopRun.test.ts`, and `callNinaImageModel` with no `cropBox` sends a reference
  data URL byte-identical to the fetched object, asserted in `tests/nina.imagecall.test.ts`.
- `lib/nina/imagerun.ts:743` is untouched and its suite passes unchanged.
- `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm test`, and the three guards all
  pass.

## Handoffs

- **Phase 2 (R1) — `scripts/photoshop.ts` and `NinaPhotoshopJobArgs`.** This phase reads four fields
  it does not create. It writes nothing to the job row and does not touch the CLI. A CLI-run job
  reaches `photoshopCropFor` with four NULLs and takes the no-crop path by construction, which is
  the plan index's stated CLI resolution; no CLI-side crop logic is needed in any phase.
- **Phase 4 (R1) — Server Action validation.** `photoshopCropFor` treats a partial/unknown/
  out-of-bounds crop as "no crop", but that is a second line of defence, not the boundary check.
  The closed-set label check and the numeric bounds on scale/x/y belong at
  `runPhotoshopJobAction`, which Phase 4 owns. This phase does not validate on behalf of the
  Server Action and does not import `lib/admin/*`.
- **Phase 5 (R1) — the UI's default.** The crop step's default ratio should be
  `nearestNinaImageAspectRatio(sourceWidth, sourceHeight)` so that opening the step and running
  immediately matches not opening it. This phase makes that equality *possible* (the label path and
  the fallback path send the same label) but asserts it only for the job row, not for the UI.
- **Not taken, deliberately (scope creep):** `attemptPhotoshopOnce` still does not record on the job
  row whether the crop actually applied. A `crop_applied` boolean column would make the
  `anchored: false` warn queryable instead of grep-able, but it is a new column and a new migration
  against the one production database for an operator convenience nobody asked for. The
  `console.warn` plus `nina_error_logs`' existing rows are enough for now.
- **RECONCILED (round 1):** `lib/nina/imagerecipe.ts` gains no label->ratio lookup from this phase —
  Phase 1 ships `ninaImageAspectRatioValue` there, and `photoshopCropFor` now calls it instead of
  doing its own three-line `.find(...)`. `imagerecipe.ts` is Phase 1's file in this plan set; this
  phase only imports from it.

## Rollback

Revert this phase's commits. The two modified source files return to their `main` shapes and the two
test changes go with them:

- `lib/nina/imagecall.ts` — the `sharp` import, `NinaImageCropBox`, `cropImageReferenceBytes`, the
  `cropBox` parameter on `fetchNinaImageReference` and the 7th parameter on `callNinaImageModel`.
  Nothing outside this file names any of them except `photoshopRun.ts`, which reverts in the same
  commit.
- `lib/nina/photoshopRun.ts` — `photoshopCropFor`, the three-branch `aspectRatio`, the 7th argument,
  and the one `console.warn`.
- `tests/nina.photoshopRun.test.ts` — deleted.
- `tests/nina.imagecall.test.ts` — the `sharp` import, two helpers and four cases removed.

No database row, no Blob object and no migration is written by this phase, so there is nothing to
undo outside the tree. A job row that already carries crop columns (written by Phase 4/5) simply
goes back to being ignored — i.e. to today's nearest-bucket behaviour — which is a correct,
non-failing state. Reverting this phase alone leaves Phases 1, 2, 4 and 5 building and passing:
nothing they own imports anything this phase creates.
