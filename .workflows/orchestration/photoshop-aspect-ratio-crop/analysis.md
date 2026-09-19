# Code Analysis: Photoshop Aspect-Ratio Crop

**Type:** Feature Implementation
**Date:** 2026-09-19 13:44:12
**Session ID:** 20260919-134412-K7Q2
**Plan:** `PHOTOSHOP_ASPECT_RATIO_CROP_PLAN.md` (5 phases)
**Worktree:** `/home/miftah/.worktrees/run-insights/photoshop-aspect-ratio-crop` (branch `feature/photoshop-aspect-ratio-crop`, base `origin/main` @ `b88d5bc`)

---

## User Input

### Original User Request

> Add an optional "aspect ratio crop" step to Nina's Photoshop feature (both anchor and edit
> modes), for /admin/photoshop/[source]/[id] (components/admin/PhotoshopDetail.tsx).
>
> Background: lib/nina/imagerecipe.ts's buildImageRequestBody always sends a fixed `aspect_ratio`
> to OpenRouter's /api/v1/images/generations endpoint (used by every model, anchor and edit
> alike). A recent fix (nearestNinaImageAspectRatio, already shipped) picks the closest of
> OpenRouter's ~23 discrete aspect_ratio enum values to the source photo's real width/height
> instead of a hardcoded '3:4' — but for source photos whose ratio falls between two enum
> buckets, the output is still visibly stretched/squeezed relative to the source (confirmed
> live: an 832x732 source, ratio 1.137, nearest bucket is 5:4=1.25, and the result read ~10%
> wider than the source).
>
> Requested fix: let the admin manually crop the source photo, BEFORE the job runs, to a
> rectangle whose aspect ratio exactly matches one of OpenRouter's supported aspect_ratio enum
> values (no more nearest-bucket guessing — the crop IS one of the exact values). The admin
> should be able to pick which of the supported ratios to crop to (defaulting to
> nearestNinaImageAspectRatio's pick), then pan/zoom the source photo within that fixed-aspect
> rectangle to choose what part of the photo survives the crop, similar to the existing
> avatar-framing UX in components/admin/CropStudio.tsx + lib/nina/crop.ts (drag/pinch/wheel/
> arrow-key pan and zoom) — but NOT reusable as-is, because that module is hardcoded to a
> square frame and only ever produces a CSS object-cover transform for on-screen display; it
> never touches actual pixel bytes. This new feature needs the crop to produce REAL cropped
> pixels (via `sharp`, already used in lib/nina/photoshopRun.ts) that get sent to the model as
> the reference image, with the exact matching aspect_ratio value — guaranteeing zero stretch,
> by construction.
>
> This is an OPTIONAL step: if the admin skips it, the job behaves exactly as it does today
> (full uncropped source, nearestNinaImageAspectRatio's best-guess ratio). Applies to BOTH
> anchor and edit mode (user's explicit instruction this turn).
>
> [Relevant files list — reproduced in Analysis Scope below.]
>
> Please analyze and produce the plan-set for the most robust architecture: where the crop
> should actually execute (client canvas + a new "cropped" blob upload before the job runs, vs.
> storing normalized crop-rect parameters on the job row and cropping server-side with sharp at
> run time using the always-freshly-fetched original bytes, matching this codebase's existing
> "resolve the source fresh, never cache a URL" invariant), the new pure crop-math module's
> shape (analogous to lib/nina/crop.ts but rectangle/aspect-ratio-locked instead of square, and
> producing real crop-box pixel coordinates instead of a CSS style object), schema changes
> needed, the new UI component, and how scripts/photoshop.ts's hand-duplication obligation is
> satisfied for a CLI run that has no browser to crop in (does the CLI just skip cropping and
> always use the auto-picked nearest ratio? that seems like the natural answer given a terminal
> has no rectangle to drag, but confirm/call it out explicitly in the plan rather than leaving
> it implicit).

A prior conversation turn (not part of this /analyze call, already shipped on `main` before this
worktree was cut) added `nearestNinaImageAspectRatio` to `lib/nina/imagerecipe.ts` and wired it
into `attemptPhotoshopOnce` (edit mode only) and `scripts/photoshop.ts`. That work also widened
`getPhotoshopSourcePhoto` to return the source photo's `width`/`height`, and threaded them through
`firePhotoshopJob`/`runPhotoshopJob`/`attemptPhotoshopOnce`. All of that is **already on `main`**
and is treated as given infrastructure by this analysis, not as work this plan re-does.

The user then asked, in this session, to extend the crop step to **both** anchor and edit mode
(this /analyze call's one instruction beyond the pasted background above).

### User-Provided Context

- Live repro already gathered in the parent conversation: source photo `LUgZXQFfGPxN` (832×732,
  ratio 1.137), edited with `bytedance-seed/seedream-4.5` in edit mode, preset "bigger boobs".
  `nearestNinaImageAspectRatio` picked `5:4` (ratio 1.25) — the closest available OpenRouter
  enum value — and the result (`EToDPAwFQ1Jn`, 2146×1720, ratio 1.248) still read visibly wider
  than the source. Both images were fetched and visually inspected in the parent conversation.

### User-Provided Files

None marked with `@`; the prompt named files by path inline (see Analysis Scope).

### Requirement IDs

| ID | What the user asked for |
|---|---|
| R1 | Add an optional "aspect ratio crop" step to the Photoshop admin panel, for **both** anchor and edit mode: admin picks one of OpenRouter's exact supported `aspect_ratio` values (defaulting to `nearestNinaImageAspectRatio`'s pick), pans/zooms the source photo within that fixed-aspect rectangle, and on running the job the model receives REAL cropped pixels at that exact ratio (not a nearest-bucket guess) — while remaining fully optional: skipping it must leave today's behavior (full uncropped source, `nearestNinaImageAspectRatio`'s best guess) unchanged. Produce the plan-set for the most robust architecture, resolving explicitly: (a) client-upload-a-cropped-blob vs. server-side-crop-from-stored-parameters; (b) the new pure crop-math module's shape; (c) schema changes; (d) the new UI component; (e) `scripts/photoshop.ts`'s CLI behavior when there is no browser to crop in. |

---

## Detailed Requirements Understanding

**Problem/Requirement Statement**: `buildImageRequestBody` can only ever pick the *closest*
available `aspect_ratio` enum value to a source photo's real shape — OpenRouter's `aspect_ratio`
field is a fixed ~23-value enum (`lib/nina/imagerecipe.ts`'s `NINA_IMAGE_ASPECT_RATIOS`, currently
module-private), not a continuous value, so any source photo whose ratio falls between two enum
buckets is sent to the model on a canvas shape it never had, and the model composes to fill that
canvas — visible as a stretch or squeeze in the result. The already-shipped
`nearestNinaImageAspectRatio` fix minimizes this error but cannot eliminate it. The only way to
guarantee zero mismatch is to make the SOURCE match an exact enum value before it is ever sent —
i.e. crop it to that ratio ourselves, under the admin's control (so they choose what survives the
crop, since cropping to a different ratio necessarily discards part of the frame).

**Success Criteria**:
1. On `/admin/photoshop/[source]/[id]`, in both Anchor and Edit mode, the admin has an optional UI
   step to pick a target aspect ratio (from OpenRouter's real enum, defaulting to the auto-pick)
   and interactively choose a crop window at that exact ratio.
2. When used, the job sends the model bytes that were actually cropped to that exact ratio (via
   `sharp`, server-side) and sets `aspect_ratio` to that exact enum value — not a nearest-bucket
   guess.
3. When NOT used (the admin runs the job without opening/confirming the crop step), the job
   behaves byte-for-byte as it does on `main` today: full uncropped source,
   `nearestNinaImageAspectRatio`'s best-guess ratio for edit mode, the fixed `NINA_IMAGE_ASPECT`
   default for anchor mode.
4. `scripts/photoshop.ts` (the `/photoshop` CLI skill) keeps working exactly as it does today —
   it has no browser and cannot offer a crop UI, so every CLI-run job is, by construction, a
   "skipped the crop step" job.
5. The crop parameters are resolved fresh from the ORIGINAL source bytes at job-run time (never a
   separately-uploaded "pre-cropped" blob that could drift from the source, or that needs its own
   Blob-storage/garbage-collection lifecycle) — this is the same "resolve the source fresh, never
   cache a URL" posture `photoshopResolve.ts`'s own header already states for `sourceUrl` itself.

**Key Considerations / Constraints**:
- **`lib/nina/imagerecipe.ts` must stay zero-import.** `scripts/photoshop.ts` and
  `scripts/nina-image-worker/generate.ts` import it under `--experimental-strip-types`, which
  cannot resolve `server-only` or `@/lib/env`. Any new pure crop-math module used by both the app
  and (potentially) the CLI must hold to the same rule — or, if the CLI never actually calls into
  it (see below), it still must not import anything the app-only files import, so a future CLI
  caller is never blocked by an accidental dependency.
- **`lib/nina/crop.ts` is explicitly, repeatedly documented as square-frame-only and
  display-only** (never produces pixel bytes, only a CSS transform). Reusing it directly is not
  possible without breaking its own stated invariant (`ninaCropStyle`'s frame-must-be-square
  contract, depended on by the avatar preview, the chat header avatar, and the typing-row
  avatar). A new, sibling module is the given-and-accepted approach per the user's own framing
  of the problem; this plan treats "generalize `crop.ts` in place" as explicitly OUT of scope.
- **The `nina_photoshop_jobs` table is the one durable record of a job's inputs**
  (`lib/db/schema/nina/photoshop.ts`) — `mode`, `model`, `presetKey`, `promptText` all live there
  and are read back by `claimNinaPhotoshopJob`. Any crop parameters the admin picks must survive
  the same way (the job can be claimed and run in the background via `after()`, arbitrarily later
  than the moment the admin clicked "Run" — nothing about the crop selection can live only in
  React state).
- **This app's ONE database is production** (`CLAUDE.md`): any schema migration this plan
  requires must be called out explicitly as a step the user runs deliberately
  (`npm run db:generate` then `npm run db:migrate`), never as something a phase's own automated
  verification silently applies.
- **`callNinaImageModel`/`buildImageRequestBody` are shared by every image-generation caller in
  the app** (`lib/nina/imagerun.ts`'s ordinary avatar/selfie generation, not just photoshop). Any
  change to thread a crop box through this call chain must be purely additive — an optional,
  undefined-by-default parameter — so every existing non-photoshop caller is provably unchanged.
- **Two hosts, one hand-kept duplicate vocabulary.** `scripts/photoshop.ts` cannot import
  `server-only` files (`photoshopRun.ts`, `photoshopResolve.ts`, `imagecall.ts`) and hand-copies
  the pieces it needs (`MODEL_RESOLUTION`, the model id lists, and — as of the aspect-ratio fix —
  `nearestNinaImageAspectRatio` via a direct import, since that lives in the zero-import
  `imagerecipe.ts`). This plan's resolution (crop is admin-UI-only, CLI never supplies crop
  params) means `scripts/photoshop.ts` needs **no hand-duplicated crop logic at all** — only
  parity in its raw `INSERT INTO nina_photoshop_jobs` statement once new nullable columns exist,
  so the insert's column list and the table's actual columns do not drift.

**Assumptions this analysis makes, stated explicitly**:
- The admin can be shown the full ~23-entry `aspect_ratio` enum in a picker; no curation to a
  "common ratios" subset is requested, and building one would be an unrequested feature per the
  project's YAGNI posture. (Callable out as a follow-up if the full list proves unwieldy in
  practice — the picker's data source will be the single exported enum either way.)
- "Both anchor and edit mode" means the SAME crop mechanism is offered in both, not two different
  UIs — `buildImageRequestBody` sends `aspect_ratio` (and `input_references`) identically
  regardless of mode, so nothing about the request-building differs by mode once a crop box is in
  hand. The only mode-specific behavior that survives is what already exists today: edit mode
  falls back to `nearestNinaImageAspectRatio` when no crop is supplied, anchor mode falls back to
  the fixed `NINA_IMAGE_ASPECT` default — a crop, when supplied, overrides BOTH fallbacks
  identically, because it is exact and needs no guessing.

---

## Analysis Scope

### Explicitly Mentioned Files (by path, in the user's prompt)

- `lib/nina/imagerecipe.ts`
- `lib/nina/imagecall.ts`
- `lib/nina/photoshopRun.ts`
- `lib/nina/photoshopResolve.ts`
- `lib/admin/photoshopActions.ts`
- `lib/db/schema/nina/photoshop.ts`
- `components/admin/PhotoshopDetail.tsx`
- `scripts/photoshop.ts`
- `components/admin/CropStudio.tsx`
- `lib/nina/crop.ts`

### Discovered Related Files

- `lib/nina/photoshopJobs.ts` — `NinaPhotoshopJobArgs`, `openNinaPhotoshopJob`,
  `claimNinaPhotoshopJob`; the args shape a crop must be added to.
- `lib/nina/photoshopPresets.ts` — `coercePhotoshopMode`, `coercePhotoshopModel`,
  `coercePhotoshopInstruction`; the existing "coerce untrusted input to a safe default" pattern a
  new `coercePhotoshopCrop`-shaped validator should follow.
- `app/admin/photoshop/[source]/[id]/page.tsx` — the Server Component that calls
  `getPhotoshopSourcePhoto` and renders `<PhotoshopDetail>`; currently passes only `sourceUrl`,
  will need to also pass `sourceWidth`/`sourceHeight` (already available on `photo.width`/
  `photo.height` as of the shipped aspect-ratio fix).
- `lib/db/schema/nina/avatars.ts:315-324` — the PRECEDENT column shapes for a stored crop triple:
  `cropScale: numeric('crop_scale', { precision: 5, scale: 3, mode: 'number' })`,
  `cropX: integer('crop_x')`, `cropY: integer('crop_y')`, all nullable, "all-three-null = no
  transform."
- `drizzle.config.ts`, `drizzle/*.sql`, `npm run db:generate` / `db:migrate` — this repo's
  migration tooling; `drizzle/` currently ends at `0034_previous_iron_monger.sql`.
- `components/admin/CropStudio.test.tsx` — the only precedent for testing a pointer/pinch/wheel
  crop UI component in this repo (23 cases: accessible name, CSS mapping, wheel zoom + passive
  listener, arrow-key nudge/zoom, pointer pan, pinch start/zoom/end, disabled state). No
  dedicated unit-test file exists for `lib/nina/crop.ts`'s pure functions themselves (confirmed
  by search — `NinaCrop`/`resolveCrop`/`clampCrop`/`zoomCrop`/`ninaCropStyle` appear only in
  `admin.chatPhotoAdoption.test.ts` and `nina.chatAvatar.test.ts`, incidentally, not as a focused
  suite). The new module's tests (Phase 1) have no sibling file to mirror line-for-line and
  should be written from first principles at the same rigor `tests/nina.imagerecipe.test.ts`
  already demonstrates for this codebase's other pure `lib/nina/` modules.

---

## Current Dataflow

### Entry Point: `POST` via Server Action `runPhotoshopJobAction`

**Location:** `lib/admin/photoshopActions.ts:35-85`
**Trigger:** `PhotoshopDetail.tsx`'s `execute()` (a client button click), or the standalone
`scripts/photoshop.ts` CLI (which does not call this action at all — it hand-duplicates the same
steps directly against Postgres and OpenRouter under `--experimental-strip-types`).
**Input Schema (app path):** `{ sourceKind, sourceId, mode, model, presetKey, instruction }` — no
Zod schema; five scalar fields checked inline (file's own header comment explains why: "cheap
enough to check inline without a second file to keep in step with this one").
**Validation:** `requireAdmin()` (session gate) → `sourceKind` is one of the two literals →
`isValidId(sourceId)` → `coercePhotoshopInstruction` (trim/collapse/length-cap, empty ⇒ refusal)
→ `getPhotoshopSourcePhoto` (404 ⇒ refusal) → `coercePhotoshopMode`/`coercePhotoshopModel`
(closed-set coercion, never throws, defaults on anything unrecognised).
**Next Step:** `openNinaPhotoshopJob` inserts a `pending` row, then `firePhotoshopJob` registers
the actual run on `after()` (fire-and-forget from the Action's perspective — the Action returns
`{ ok: true, jobId }` immediately, and the client polls `readPhotoshopJobAction` every 3 s).

### Processing Chain

1. **`firePhotoshopJob`** — `lib/nina/photoshopRun.ts:165-186`
   - **Input:** `{ userId, jobId, sourceUrl, sourceWidth?, sourceHeight? }` (width/height already
     optional/nullable, from the shipped aspect-ratio fix).
   - **Calls:** `runPhotoshopJob` inside `after()`.

2. **`runPhotoshopJob`** — `photoshopRun.ts:151-161`
   - Loops `attemptPhotoshopOnce` until it stops returning `'retry'` (max 2 attempts, from
     `NINA_PHOTOSHOP_MAX_ATTEMPTS` in `photoshopJobs.ts`).

3. **`attemptPhotoshopOnce`** — `photoshopRun.ts:76-149`
   - `claimNinaPhotoshopJob(userId, jobId)` — one conditional `UPDATE ... RETURNING`, the sole
     lock; returns `{ jobId, args: NinaPhotoshopJobArgs, attempts }` or `null` if already
     claimed/exhausted.
   - `photoshopModelResolution(claim.args.model)` — per-model `resolution` override (today: only
     `bytedance-seed/seedream-4.5` → `'2K'`).
   - **Aspect ratio (as shipped today):**
     ```ts
     const aspectRatio =
       claim.args.mode === 'edit' && sourceWidth != null && sourceHeight != null
         ? nearestNinaImageAspectRatio(sourceWidth, sourceHeight)
         : undefined
     ```
     Anchor mode always gets `undefined` (⇒ `buildImageRequestBody`'s fixed `NINA_IMAGE_ASPECT`
     default) — **this is the one behavior R1 asks to widen to include anchor mode's crop path,
     though anchor mode's own no-crop fallback stays the fixed default, unchanged.**
   - `callNinaImageModel(promptText, seed, sourceUrl, model, resolution, aspectRatio)` — the
     single call site that will need a crop-box parameter.
   - On success: `measureImageBytes` (via `sharp`, already imported here) + `putPhotoshopBlob` +
     `completeNinaPhotoshopJob`. On failure: `logNinaError` + `requeueNinaPhotoshopJob` or
     `failNinaPhotoshopJob`, mirroring `imagerun.ts`'s failure handling.

4. **`callNinaImageModel`** — `lib/nina/imagecall.ts:198-...`
   - **Input:** `(prompt, seed, referenceUrl?, model?, resolution?, aspectRatio?)`, all but
     `prompt`/`seed` optional and defaulted downstream.
   - Reads `OPENROUTER_API_KEY` via `ninaEnv()`.
   - `fetchNinaImageReference(referenceUrl)` — module-private (not exported) — fetches the
     reference photo's raw bytes with a declared-and-actual size ceiling
     (`NINA_IMAGE_REFERENCE_MAX_BYTES`) and a content-type allow-list, base64-encodes them into
     a `data:` URL via `buildImageReferenceDataUrl` (from `imagerecipe.ts`). Returns `null` on
     any failure (oversized, wrong type, non-200, timeout) — a reference that cannot be fetched
     degrades the call to unanchored rather than failing the job. **This is the one place a crop
     would need to intercept the bytes between "fetched" and "base64-encoded."**
   - POSTs `buildImageRequestBody({ prompt, seed, referenceDataUrl, model, resolution,
     aspectRatio })` to `OPENROUTER_IMAGE_URL`, under a timeout budget that already accounts for
     whichever kind of fetch happened first (`ninaImageCallTimeoutMs(anchored)`).

5. **`buildImageRequestBody`** — `lib/nina/imagerecipe.ts:536-...`
   - Builds `{ model, prompt, resolution, aspect_ratio, n, seed, input_references? }` — the
     **only** place any of these fields are assembled, for every caller in the app (ordinary
     generation via `imagerun.ts`, photoshop via `photoshopRun.ts`, and the CLI via
     `scripts/photoshop.ts`'s own hand-copy of this exact function, imported directly since it is
     zero-import).

### Data Persistence

**`nina_photoshop_jobs`** (`lib/db/schema/nina/photoshop.ts:31-67`) — one row per attempt-cycle.
Written by: `openNinaPhotoshopJob` (insert, `pending`), `claimNinaPhotoshopJob` (claim +
attempts++), `completeNinaPhotoshopJob`/`requeueNinaPhotoshopJob`/`failNinaPhotoshopJob`
(terminal/retry updates), `resolveNinaPhotoshopJob` (admin's Replace/Add/Cancel choice, a
SEPARATE later action — out of scope for this feature; the crop only affects what gets SENT to
the model, not how the result is resolved afterward).

**Vercel Blob** — the source photo's existing blob (`nina_avatars`/`nina_message_images`, read
fresh every attempt) and the RESULT photo's new blob (`putPhotoshopBlob`, written once on
success). **No intermediate "cropped source" blob exists today, and this plan's chosen approach
(server-side crop from stored parameters, Option B below) does not introduce one.**

### Exit Points

- **Success:** `nina_photoshop_jobs.status = 'ok'`, `result_blob_url`/`result_width`/
  `result_height`/`result_content_hash`/`result_bytes` set. The admin later resolves it
  (Replace/Add/Discard) via `resolvePhotoshopJobAction` — unaffected by this feature.
- **Failure:** `status = 'failed'`, `error_code` set to the classified `NinaImageFailure`, and a
  row in `nina_error_logs` via `logNinaError`.

---

## Key Data Structures

### `NinaPhotoshopJobArgs` — `lib/nina/photoshopJobs.ts:27-35`
```ts
export interface NinaPhotoshopJobArgs {
  sourceKind: NinaPhotoshopSourceKind
  sourceId: string
  sourceContentHash: string | null
  mode: NinaPhotoshopMode
  model: string
  presetKey: string | null
  promptText: string
}
```
**Used in:** `openNinaPhotoshopJob` (write), `claimNinaPhotoshopJob` (read back, becomes
`claim.args` in `attemptPhotoshopOnce`). **This is the shape any new crop fields must join** —
whatever the admin picked must survive from the moment `runPhotoshopJobAction` opens the job to
the moment `attemptPhotoshopOnce` (possibly much later, possibly after a retry) reads it back.

### `ninaPhotoshopJobs` table — `lib/db/schema/nina/photoshop.ts:31-67`
Full column list already reproduced in Discovered Related Files. No `crop_*` columns exist today.

### `NinaCrop` / `NinaCropInput` / `NinaNaturalSize` — `lib/nina/crop.ts:40-60`
```ts
export interface NinaCrop { scale: number; x: number; y: number }
export interface NinaCropInput { scale: number | null; x: number | null; y: number | null }
export interface NinaNaturalSize { width: number | null; height: number | null }
```
The stored convention (documented at length in the module header, lines 15-36): `scale` is a
multiple of the COVER fit for a **square** frame; `x`/`y` are the image centre's offset from the
frame centre, in thousandths of the frame's WIDTH — and that unit choice is only valid **because**
the frame is asserted square everywhere (`top: N%` and `left: N%` would otherwise resolve against
different axis lengths). `ninaCropStyle` (lines 293-305) is the one function that turns a resolved
`NinaCrop` into a CSS style object — **it produces percentages for on-screen positioning, never
pixel coordinates, and never touches file bytes.** This is the exact gap R1's crop-box pixel
requirement falls into.

### `NINA_IMAGE_ASPECT_RATIOS` — `lib/nina/imagerecipe.ts` (already shipped, module-private)
```ts
const NINA_IMAGE_ASPECT_RATIOS: ReadonlyArray<{ label: string; ratio: number }> = [ /* 23 entries */ ]
```
Not exported. `nearestNinaImageAspectRatio(width, height)` is the only current reader. **A crop
ratio picker needs this same list as its single source of truth** — exporting it (or exporting a
derived read-only accessor) avoids a second, driftable copy of the enum.

---

## Dependencies

### Configuration / Environment / External Services
- `OPENROUTER_API_KEY` (`lib/env.ts`'s `ninaEnv()`) — unaffected by this feature.
- `BLOB_READ_WRITE_TOKEN` — unaffected; no new Blob writes are introduced by the chosen
  architecture (see Detailed Requirements Understanding).
- `DATABASE_URL` (pooled, app) / `DATABASE_URL_UNPOOLED` (direct, `drizzle-kit`) — the schema
  change this feature needs must be migrated through the normal `db:generate` → `db:migrate`
  flow against the one production Neon database.
- `sharp` — already a dependency (`lib/nina/photoshopRun.ts`'s `measureImageBytes`,
  `scripts/photoshop.ts`'s own `require('sharp')` under `createRequire`). No new package
  dependency is introduced.

---

## Reference List

| Symbol / key | File:line | Kind | Package |
|---|---|---|---|
| `buildImageRequestBody` | `lib/nina/imagerecipe.ts:536` | def | `lib/nina` |
| `NINA_IMAGE_ASPECT_RATIOS` | `lib/nina/imagerecipe.ts` (module-private const) | def | `lib/nina` |
| `nearestNinaImageAspectRatio` | `lib/nina/imagerecipe.ts` | def | `lib/nina` |
| `callNinaImageModel` | `lib/nina/imagecall.ts:198` | def | `lib/nina` |
| `fetchNinaImageReference` | `lib/nina/imagecall.ts:133` (module-private) | def | `lib/nina` |
| `callNinaImageModel(...)` | `lib/nina/imagerun.ts:743` | call (non-photoshop; must stay behaviorally unchanged) | `lib/nina` |
| `callNinaImageModel(...)` | `lib/nina/photoshopRun.ts:86` | call (photoshop; the one call site this feature extends) | `lib/nina` |
| `attemptPhotoshopOnce` | `lib/nina/photoshopRun.ts:76` | def | `lib/nina` |
| `runPhotoshopJob` / `firePhotoshopJob` | `lib/nina/photoshopRun.ts:151,165` | def | `lib/nina` |
| `NinaPhotoshopJobArgs` | `lib/nina/photoshopJobs.ts:27` | def | `lib/nina` |
| `openNinaPhotoshopJob` / `claimNinaPhotoshopJob` | `lib/nina/photoshopJobs.ts:37,67` | def | `lib/nina` |
| `getPhotoshopSourcePhoto` | `lib/nina/photoshopResolve.ts:21` | def (already returns width/height) | `lib/nina` |
| `runPhotoshopJobAction` | `lib/admin/photoshopActions.ts:35` | def | `lib/admin` |
| `coercePhotoshopMode` / `coercePhotoshopModel` / `coercePhotoshopInstruction` | `lib/nina/photoshopPresets.ts` | def (pattern precedent) | `lib/nina` |
| `ninaPhotoshopJobs` table | `lib/db/schema/nina/photoshop.ts:31` | def | `lib/db/schema/nina` |
| `nina_avatars.crop_scale/crop_x/crop_y` | `lib/db/schema/nina/avatars.ts:315-324` | def (precedent column shapes) | `lib/db/schema/nina` |
| `NinaCrop`, `resolveCrop`, `clampCrop`, `panCrop`, `zoomCrop`, `zoomFactorForWheel`, `nudgeCrop`, `ninaCropStyle`, `cropForWrite` | `lib/nina/crop.ts` | def (square-only, display-only; pattern precedent, not directly reusable) | `lib/nina` |
| `CropStudio` | `components/admin/CropStudio.tsx:72` | def (pointer/pinch/wheel UX precedent) | `components/admin` |
| `PhotoshopDetail` | `components/admin/PhotoshopDetail.tsx:33` | def | `components/admin` |
| `app/admin/photoshop/[source]/[id]/page.tsx` | (page) | call site of `getPhotoshopSourcePhoto`/`<PhotoshopDetail>` | `app/admin` |
| `scripts/photoshop.ts` | whole file | hand-duplicate of `photoshopRun.ts`+`photoshopPresets.ts`, cannot import server-only files | `scripts` |

---

## Impact Points (files that WILL need changes)

1. `lib/nina/imagerecipe.ts` — export `NINA_IMAGE_ASPECT_RATIOS` (or an accessor). **Phase 1.**
2. `lib/nina/photoshopCrop.ts` (new) — the rectangle/ratio-aware pure crop-math module,
   including the new pixel-crop-box function `crop.ts` never needed. **Phase 1.**
3. `lib/db/schema/nina/photoshop.ts` + a new `drizzle/NNNN_*.sql` migration — new nullable
   `crop_*` columns on `nina_photoshop_jobs`. **Phase 2.**
4. `lib/nina/photoshopJobs.ts` — `NinaPhotoshopJobArgs`, `openNinaPhotoshopJob`,
   `claimNinaPhotoshopJob` thread the new fields through. **Phase 2.**
5. `scripts/photoshop.ts` — its raw `INSERT INTO nina_photoshop_jobs` column list gains the new
   columns (explicit `NULL`s), for parity with the real table shape. **Phase 2.**
6. `lib/nina/imagecall.ts` — `fetchNinaImageReference`/`callNinaImageModel` gain an optional
   crop-box parameter; every existing caller (`imagerun.ts`, `photoshopRun.ts`'s own no-crop
   calls) passes nothing and is provably unaffected. **Phase 3.**
7. `lib/nina/photoshopRun.ts` — `attemptPhotoshopOnce` computes a pixel crop box from the job's
   stored crop fields (when present) and passes it, plus the EXACT chosen ratio (bypassing
   `nearestNinaImageAspectRatio`), into `callNinaImageModel`. **Phase 3.**
8. `lib/admin/photoshopActions.ts` — `runPhotoshopJobAction` accepts and validates the new crop
   fields (closed-set ratio-label check against the exported enum, numeric bounds on
   scale/x/y), passing them to `openNinaPhotoshopJob`. **Phase 4.**
9. `app/admin/photoshop/[source]/[id]/page.tsx` — passes `sourceWidth`/`sourceHeight` (already on
   `getPhotoshopSourcePhoto`'s return) down to `<PhotoshopDetail>`. **Phase 4.**
10. `components/admin/PhotoshopDetail.tsx` — accepts the new width/height props, gains the
    optional crop step's toggle/state, and includes the crop fields in `execute()`'s call to
    `runPhotoshopJobAction` when used. **Phase 5.**
11. `components/admin/PhotoshopCropStudio.tsx` (new) — the rectangle-frame pan/zoom UI, built on
    `CropStudio.tsx`'s pointer/pinch/wheel/keyboard pattern but driven by the new pure module and
    a ratio picker sourced from the exported enum. **Phase 5.**
12. New test files: `tests/nina.photoshopCrop.test.ts` (Phase 1),
    `tests/nina.photoshopJobs.test.ts` additions or equivalent (Phase 2, if such a file exists —
    to be located by that phase's planner), `tests/nina.imagecall.test.ts` additions (Phase 3),
    `tests/admin.photoshopActions.test.ts` additions if such a file exists, else inline coverage
    (Phase 4 — note: earlier investigation in this session found **no** dedicated
    `admin.photoshopActions.test.ts`/`nina.photoshopRun.test.ts` files exist today; each phase
    planner must confirm this independently for its own files rather than assume), and
    `components/admin/PhotoshopCropStudio.test.tsx` (Phase 5, mirroring
    `CropStudio.test.tsx`'s structure).

**This document describes. The plan files prescribe.**
