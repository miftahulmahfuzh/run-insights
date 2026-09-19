# Plan: Photoshop Aspect-Ratio Crop

**Slug:** photoshop-aspect-ratio-crop
**Date:** 2026-09-19 13:44:12
**Analysis:** `20260919-134412-K7Q2_code_analyzer.md`
**Worktree:** `/home/miftah/.worktrees/run-insights/photoshop-aspect-ratio-crop`
**Branch:** `feature/photoshop-aspect-ratio-crop` (base: `origin/main` @ `b88d5bc`)
**Phases:** 5
**Status:** complete — all 5 of 5 phases landed on `feature/photoshop-aspect-ratio-crop`
(the authoritative per-phase state remains
`.workflows/orchestration/photoshop-aspect-ratio-crop/ledger.json`; merging the branch to `main`
is the swarm coordinator's step, not any phase session's)

---

## Why

The user, verbatim (this session): *"hey, what if we add a new optional button after admin
select an image, called it aspect ratio crop. so here admin can zoom in/out, and move a
rectangle that satisfies seedream 4.5 aspect ratio. wdyt? otherwise, this width squeeze /
stretch will always resurfaces in the future"* — followed, after discussion of what already
exists to reuse (`CropStudio.tsx`/`lib/nina/crop.ts`, both square-frame-only and display-only),
by the explicit instruction: *"put this feature to both mode. do /analyze on this requirement so
we can implement the most robust architecture."*

The already-shipped `nearestNinaImageAspectRatio` fix (on `main` before this worktree was cut)
picks the CLOSEST of OpenRouter's ~23 discrete `aspect_ratio` values to a source photo's real
shape, but cannot make it EXACT — a source whose ratio falls between two enum buckets still gets
visibly stretched, confirmed live (832×732 source, ratio 1.137 → nearest bucket 5:4 = 1.25 →
result read ~10% wider than the source). The only way to guarantee zero mismatch is to crop the
SOURCE to an exact enum ratio before it is ever sent — under the admin's control, since cropping
away part of the frame is a real trade-off only a person should make.

## Requirements

| ID | What the user asked for | Phases |
|---|---|---|
| R1 | Add an optional "aspect ratio crop" step to `/admin/photoshop/[source]/[id]`, for BOTH anchor and edit mode: pick one of OpenRouter's exact `aspect_ratio` values (default: `nearestNinaImageAspectRatio`'s pick), pan/zoom the source within that fixed-aspect rectangle, and on running the job the model receives real cropped pixels at that exact ratio — fully optional, skipping it leaves today's behavior unchanged. Most robust architecture, explicitly resolving: execution site (client-upload vs. server-side-from-stored-params), the new pure crop-math module's shape, schema changes, the new UI component, and `scripts/photoshop.ts`'s CLI behavior. | 1, 2, 3, 4, 5 |

## Scope

**In scope:**
- A new pure, zero-import crop-math module producing both an on-screen CSS preview (pan/zoom, in
  the same mental model as `lib/nina/crop.ts`) and — the capability `crop.ts` has never needed —
  actual pixel crop-box coordinates for `sharp.extract()`.
- New nullable columns on `nina_photoshop_jobs` (a migration against the one production
  database, run explicitly by the user, never silently by an agent) carrying the admin's chosen
  ratio label + pan/zoom state, all-null meaning "no crop, behave as today."
- Server-side pixel cropping, from the ORIGINAL source bytes fetched fresh at job-run time
  (never a separately-stored "pre-cropped" blob) — matching `photoshopResolve.ts`'s own stated
  "resolve fresh, never cache a URL" posture.
- A new admin UI component (rectangle pan/zoom, ratio picker) wired into `PhotoshopDetail.tsx`
  as an optional, collapsible step, offered identically in both anchor and edit mode.
- `scripts/photoshop.ts`'s raw SQL `INSERT` kept in column-list parity with the real table.

**Out of scope, and why:**
- **Generalizing `lib/nina/crop.ts` itself.** It is explicitly documented as square-frame-only
  and display-only, depended on by the avatar preview, chat header avatar, and typing-row avatar
  — widening its contract risks all three for a feature that needs a fundamentally different
  capability (real pixel bytes, not a CSS transform). A sibling module is the given approach.
- **A curated "common ratios" subset in the picker.** The full ~23-value enum is the picker's
  single source of truth (the same exported constant `nearestNinaImageAspectRatio` already
  reads) — curating a shorter list is an unrequested feature (YAGNI) and can follow later if the
  full list proves unwieldy in practice.
- **`scripts/photoshop.ts` offering a crop UI.** A terminal has no rectangle to drag. Every
  CLI-run job supplies no crop parameters, by construction — the same "skipped the crop step"
  path the app already needs for admins who don't use it.
- **Changing how a finished job is resolved** (Replace / Add as new / Cancel,
  `resolvePhotoshopJobAction`) — the crop only changes what is SENT to the model, not what
  happens to the result afterward.

## Invariants

Rules every phase must hold:

1. **The tree builds, typechecks, lints, and passes `npm test` at the end of every phase.**
2. **No behavior change when a job supplies no crop.** Every existing caller of
   `callNinaImageModel`/`buildImageRequestBody`/`attemptPhotoshopOnce` that does not know about
   crops (in particular `lib/nina/imagerun.ts`'s ordinary generation, and every CLI-run
   `scripts/photoshop.ts` job) must be provably byte-identical in behavior to `main` today — every
   new parameter is optional and additive, defaulted to `undefined`/`null`.
3. **`lib/nina/imagerecipe.ts` and the new crop-math module stay zero-import** (no `server-only`,
   no `@/lib/env`, no relative import of anything that isn't itself zero-import) — both are
   loaded by `scripts/photoshop.ts` and `scripts/nina-image-worker/generate.ts` under
   `--experimental-strip-types`, which cannot resolve those.
4. **The crop is resolved from freshly-fetched original bytes at job-run time, never from a
   separately-stored derived blob.** No new Blob writes are introduced by this feature.
5. **A schema migration is a step the user runs deliberately** (`npm run db:generate` then
   `npm run db:migrate`), never something a phase's own verification applies automatically — this
   app's one database is production (`CLAUDE.md`).

   **AND THE DEPLOY ORDER IS: MIGRATE FIRST, THEN SHIP. This is an outage, not a nicety.**
   Drizzle's query builder names **every declared schema column** in every INSERT / UPDATE /
   SELECT / `.returning()` on a table — a column with no supplied value is emitted as the literal
   `default` keyword but is still *named in the SQL* (`drizzle-orm/pg-core/dialect.js`'s
   `buildInsertQuery`; `claimNinaPhotoshopJob`'s unprojected `.returning()` and
   `getNinaPhotoshopJob`'s `db.select()` likewise expand to every column). So the instant
   `lib/db/schema/nina/photoshop.ts` declares the four `crop_*` columns **and that code is
   deployed**, Postgres answers `column "crop_ratio_label" of relation "nina_photoshop_jobs" does
   not exist` and **every photoshop job fails — cropped or not, app and `scripts/photoshop.ts`
   alike**. There is no nullable-column grace period here.

   Therefore: `npm run db:migrate` must be **applied to production and confirmed applied BEFORE**
   the code from Phase 2 onward is deployed. Not after. Not "at the same time". Generating and
   reviewing the SQL does not satisfy this. Between merging this branch and running the migration,
   `/admin/photoshop` is down.
6. **`ci:data-layer-guard`, `ci:openrouter-guard`, `ci:llm-payload-guard`, and the other CI
   guards must still pass** — no new code should trip any of the source-scan guards (e.g. no
   secret literal outside `lib/nina/`+`lib/env.ts`, no new unguarded OpenRouter caller).
7. **Formatting/lint clean** (`npm run format:check`, `npm run lint`) and **`npx tsc --noEmit`
   clean** at the end of every phase — this codebase's real typecheck gate.

## Phases

| # | Title | Satisfies | Package | Files | Depends on | Difficulty | Plan | TaskID | Card |
|---|-------|-----------|---------|-------|-----------|------------|------|--------|------|
| 1 | ✅ Pure crop-math module + exported ratio enum | R1 | `lib/nina` | 3 | — | HARD | `.workflows/plan/photoshop-aspect-ratio-crop/phase-1.md` | `P1-NIN-A055` | — |
| 2 | ✅ Schema + job-args plumbing | R1 | `lib/db/schema/nina`, `drizzle`, `lib/nina`, `scripts` | 5 | — | NORMAL | `.workflows/plan/photoshop-aspect-ratio-crop/phase-2.md` | `P1-DB-A008` | — |
| 3 | ✅ Server-side crop execution | R1 | `lib/nina` | 4 | 1, 2 | HARD | `.workflows/plan/photoshop-aspect-ratio-crop/phase-3.md` | `P1-NIN-A056` | — |
| 4 | ✅ Server Action + page wiring | R1 | `lib/admin`, `app/admin`, `components/admin` (2 type-only lines) | 4 | 1, 2 | NORMAL | `.workflows/plan/photoshop-aspect-ratio-crop/phase-4.md` | `P1-ADM-N8QW` | — |
| 5 | ✅ Crop UI + PhotoshopDetail wiring | R1 | `components/admin` | 4 | 1, 4 | HARD | `.workflows/plan/photoshop-aspect-ratio-crop/phase-5.md` | `P1-CA-A007` | — |

Phases 1 and 2 have no dependency on each other and may be built/reviewed in either order.
Phases 3 and 4 both depend only on 1 and 2 (not on each other) and may likewise be built in
either order. Phase 5 depends on 1 (client-side pan/zoom math) and 4 (the Server Action's
accepted input shape **and** the two `PhotoshopDetail` prop-type members, which Phase 4 owns) —
NOT on 3, since the UI never calls the server-side pixel-crop path directly; it only ever supplies
the same stored parameters Phase 3 later reads back.

Every dependency points strictly backward. The only file two phases both touch is
`components/admin/PhotoshopDetail.tsx`: **Phase 4 writes the two prop-type members and nothing
else in it; Phase 5 owns every other line.** Phase 5's plan quotes that file as Phase 4 leaves it,
not as `main` has it.

### Phase 1 — Pure crop-math module + exported ratio enum
**Satisfies:** R1
**Owns:**
- `lib/nina/imagerecipe.ts`: export `NINA_IMAGE_ASPECT_RATIOS` (currently module-private) as the
  one source of truth for every ratio picker/lookup, app and future CLI alike.
- New file `lib/nina/photoshopCrop.ts` (zero-import): the rectangle/ratio-aware analogue of
  `lib/nina/crop.ts`, covering:
  - A resolved crop shape (reuse `{ scale, x, y }`'s meaning from `NinaCrop`, but every function
    here additionally takes the TARGET aspect ratio, since the frame is no longer assumed
    square). **Argument order throughout is `(source, targetRatio, crop, …)`.** And the one
    convention `crop.ts` cannot be copied on: **`x` is thousandths of the frame's WIDTH, `y` is
    thousandths of the frame's HEIGHT** — per-axis, because the frame is a rectangle.
  - Pan/zoom/clamp functions mirroring `crop.ts`'s `resolveCrop`/`clampCrop`/`panCrop`/
    `zoomCrop`/`nudgeCrop` — generalized so `cropSpanPct`'s "short edge fits the frame" logic
    compares the SOURCE's own aspect to the TARGET aspect instead of assuming a square target.
    `zoomFactorForWheel` is ratio-agnostic (pure `deltaY → factor`) and is **NOT re-exported
    here** — re-exporting it would cost this module its zero-import property, which is what decides
    where it can be loaded from. Phase 5 imports it directly from `@/lib/nina/crop`, which is never
    modified by this plan set.
  - A CSS-preview function analogous to `ninaCropStyle`, named `ninaPhotoshopCropStyle`, for the
    browser-side crop frame.
  - `ninaImageAspectRatioValue(label)` (in `imagerecipe.ts`, beside the enum) as the ONE
    label→ratio lookup — its `null` doubling as the closed-set membership test. Phases 3, 4 and 5
    all call it rather than each writing their own `.find()`/`.some()` over the table.
  - **The new capability `crop.ts` never needed:** `photoshopCropBox(source, targetRatio, crop)`,
    which turns a resolved crop + the source's natural pixel dimensions + the target ratio into an
    actual INTEGER pixel rectangle (`{ left, top, width, height }`) suitable for
    `sharp().extract(...)` — correctly rounded and clamped so it can never fall outside the source
    image's own bounds (an off-by-one here silently crops the wrong region in production). It
    returns **`NinaPhotoshopCropBox | null`**: `null` when no integer rectangle at that ratio exists
    for that source (a 3×2 thumbnail asked for 1:8), which every consumer treats as "no crop, run
    as today" rather than as a job failure.
- `tests/nina.photoshopCrop.test.ts` (new): full coverage of every exported function, at the same
  rigor `tests/nina.imagerecipe.test.ts` already demonstrates for this codebase's other pure
  `lib/nina/` modules — there is no existing `lib/nina/crop.ts` test file to mirror (confirmed:
  none exists), so this suite is written from first principles. Must include: identity crop at
  every target ratio, zoom/pan clamping at scale extremes, and — with the most scrutiny —
  pixel-crop-box correctness (exact expected `{left,top,width,height}` for known
  natural-size/ratio/crop combinations, including odd/non-square sources and ratios that require
  cropping either axis).

**Does not touch:** the DB schema, `photoshopRun.ts`, `imagecall.ts`, any Server Action, any UI
component. This phase is pure, self-contained, and independently testable/reviewable.
**Exit criteria:** `NINA_IMAGE_ASPECT_RATIOS` is exported; `lib/nina/photoshopCrop.ts` exists with
a pixel-crop-box function and passes a thorough, from-first-principles test suite; `npx tsc
--noEmit`, `npm run lint`, `npm test` all pass; the module has zero non-relative, non-zero-import
imports (spot-checked against `imagerecipe.ts`'s own "THIS FILE MUST NEVER IMPORT ANYTHING" rule).

### Phase 2 — Schema + job-args plumbing
**Satisfies:** R1
**Owns:**
- `lib/db/schema/nina/photoshop.ts`: new NULLABLE columns on `ninaPhotoshopJobs`, following the
  exact precedent shape at `lib/db/schema/nina/avatars.ts:315-324`
  (`cropScale: numeric('crop_scale', { precision: 5, scale: 3, mode: 'number' })`,
  `cropX: integer('crop_x')`, `cropY: integer('crop_y')`) plus a new `cropRatioLabel: text('crop_ratio_label')`
  column (nullable) naming which of `NINA_IMAGE_ASPECT_RATIOS`' labels was chosen. All-four-null
  = "no crop, behave as today" — the same all-or-nothing convention the avatar crop triple
  already uses. **The column comments must say `crop_x` is per-mille of the frame's WIDTH and
  `crop_y` per-mille of its HEIGHT** — per-axis, unlike `nina_avatars`' square-frame triple, per
  Phase 1's convention.
- A new Drizzle migration (`npm run db:generate`, reviewed by this phase, but **NOT migrated
  against production by this phase or any automated step** — call out explicitly in the plan
  file that `npm run db:migrate` is a step the user runs deliberately, per this plan's own
  Invariant 5). The phase's hand-off must state the **migrate-before-deploy** hazard in
  Invariant 5's own words: declaring these columns breaks every photoshop job against an
  unmigrated database, cropped or not.
- `lib/nina/photoshopJobs.ts`: `NinaPhotoshopJobArgs` gains the four new optional fields;
  `openNinaPhotoshopJob` writes them; `claimNinaPhotoshopJob` reads them back into `claim.args`.
- `scripts/photoshop.ts`: its raw `INSERT INTO nina_photoshop_jobs (...)` column list gains the
  four new columns as explicit `NULL` literals (the CLI never supplies a crop — Invariant 2/
  Scope's explicit "no CLI crop UI" decision) so the insert's column list and the table's real
  shape never silently drift apart.
- Confirm (by search, not assumption) whether a dedicated test file already covers
  `openNinaPhotoshopJob`/`claimNinaPhotoshopJob`; if none exists (as this analysis's own search
  found), add focused coverage of the new fields' round-trip (open → claim reads back exactly
  what was written, including all four null when omitted) rather than skipping tests for lack of
  a file to extend.

**Does not touch:** `imagecall.ts`, `photoshopRun.ts`'s aspect-ratio/crop-box computation logic
(Phase 3 owns consuming these new fields), any Server Action or UI (Phase 4/5 own writing them).
**Exit criteria:** migration file generated and reviewed (not applied), committed together with its
`drizzle/meta/` snapshot and journal entry (the static drift guard gates `npm test` on the
bijection); schema/args/CLI insert all agree on the four new nullable columns; a fresh
`openNinaPhotoshopJob` call with no crop fields round-trips through `claimNinaPhotoshopJob` exactly
as it does on `main` today (regression check); the hand-off names `npm run db:migrate` as a
**required pre-deploy** step in Invariant 5's words; `npx tsc --noEmit`, `npm run lint`, `npm test`
all pass.

### Phase 3 — Server-side crop execution
**Satisfies:** R1
**Owns:**
- `lib/nina/imagecall.ts`: `fetchNinaImageReference` (module-private) gains an optional pixel
  crop-box parameter; when present, crops the fetched bytes with `sharp().extract(...)` before
  base64-encoding them into the reference data URL. `callNinaImageModel`'s own signature gains
  the matching optional parameter, threaded straight through — additive only, every existing
  positional call (`imagerun.ts:743`, and `photoshopRun.ts`'s own no-crop calls) is unaffected
  because the new parameter defaults to absent.
- `lib/nina/photoshopRun.ts`: `attemptPhotoshopOnce` reads the job's new crop fields
  (`claim.args`); when present (all four non-null), computes the pixel crop box via Phase 1's
  `photoshopCropBox(source, targetRatio, crop)` — resolving the label through
  `ninaImageAspectRatioValue`, and treating **both** a `null` label and a `null` box as "no crop,
  today's path" rather than a failed job — using the job's already-threaded
  `sourceWidth`/`sourceHeight`, and calls
  `callNinaImageModel` with that crop box AND the exact `cropRatioLabel` as `aspectRatio` —
  bypassing `nearestNinaImageAspectRatio` entirely for that call, in BOTH anchor and edit mode
  (today's `mode === 'edit'` gate on `nearestNinaImageAspectRatio` stays as the NO-CROP fallback
  only; a supplied crop overrides both modes' fallback identically, since it needs no guessing).
- Test coverage: `tests/nina.imagecall.test.ts` additions for the crop-box parameter (a crop-box
  present crops before encoding; absent leaves today's behavior byte-identical — reusing that
  file's existing injected-`fetch` pattern), and a new `tests/nina.photoshopRun.test.ts` (confirmed
  absent today) covering `attemptPhotoshopOnce`'s crop-vs-no-crop branching for both modes,
  including the `photoshopCropBox → null` branch.

**Does not touch:** the DB schema (Phase 2 already landed it), any Server Action, any UI.
**Exit criteria:** a job with all four crop fields set sends the model bytes cropped to the exact
pixel box, with `aspect_ratio` set to the exact chosen label, in BOTH modes; a job with all four
null is byte-identical to `main`'s current request body and reference-fetch behavior (regression
asserted, not assumed); `npx tsc --noEmit`, `npm run lint`, `npm test` all pass;
`ci:openrouter-guard`/`ci:llm-payload-guard` still pass.

### Phase 4 — Server Action + page wiring
**Satisfies:** R1
**Owns:**
- `lib/admin/photoshopActions.ts`: `runPhotoshopJobAction`'s input gains the four optional crop
  fields; validated inline (this file's own established pattern — no new Zod schema file,
  matching its header comment's stated reasoning), with a closed-set check on the ratio label via
  Phase 1's `ninaImageAspectRatioValue(label) != null` and numeric bounds on scale/x/y taken from
  Phase 1's own exported constants (`NINA_PHOTOSHOP_CROP_MIN_SCALE` / `_MAX_SCALE` /
  `_MAX_ABS_OFFSET`) — **never re-declared as literals in `lib/admin/`**.
  All four fields present together, or all four absent — a partial set is coerced to "no crop"
  rather than trusted, since a partial crop from an untrusted client is not a valid crop.
- `app/admin/photoshop/[source]/[id]/page.tsx`: passes `photo.width`/`photo.height` (already
  returned by `getPhotoshopSourcePhoto`, unused by this page today) down to `<PhotoshopDetail>`
  as new props.
- `components/admin/PhotoshopDetail.tsx` — **the two prop-type members `sourceWidth: number | null`
  and `sourceHeight: number | null`, and NOTHING else in that file.** Type-only: they are not
  destructured and not read here. This phase owns them because the page edit above cannot typecheck
  without them, and Invariant 1 requires this phase to end green on its own. Phase 5 owns every
  other line of the file.
- Test coverage: confirm whether a dedicated `photoshopActions` test file exists (this analysis
  found none); add focused coverage of the new validation branch (closed-set ratio check,
  numeric bounds, all-or-nothing coercion) either in a new focused file or wherever this phase's
  planner determines the codebase's convention points (check how `photoshopPresets.ts`'s
  `coercePhotoshopMode`/`coercePhotoshopModel` are tested, and follow that file's pattern).

**Does not touch:** `imagecall.ts`/`photoshopRun.ts`'s consumption of the fields (Phase 3), the
new UI component and every line of `PhotoshopDetail.tsx`'s BODY (Phase 5) — this phase only makes
the fields acceptable and validated at the Server Action boundary, and makes the source's natural
size available to the page and the component that will render the crop UI.
**Exit criteria:** `runPhotoshopJobAction` accepts a well-formed crop, rejects/coerces a
malformed or partial one to "no crop" rather than trusting it (and still runs the job), the admin
page passes the source's natural width/height, and `PhotoshopDetail` declares the two new props so
the tree typechecks at the end of THIS phase; `npx tsc --noEmit`, `npm run lint`, `npm test` all
pass.

### Phase 5 — Crop UI + PhotoshopDetail wiring
**Satisfies:** R1
**Owns:**
- New file `components/admin/PhotoshopCropStudio.tsx`: the rectangle-frame pan/zoom crop UI,
  built on `CropStudio.tsx`'s pointer/pinch/wheel/arrow-key interaction PATTERN (drag to pan,
  pinch/wheel/slider to zoom, arrow keys to nudge — the same accessibility posture, `role`,
  `aria-label`, and 44px touch-target conventions) but rendering a rectangle at the CHOSEN target
  ratio instead of `CropStudio`'s hardcoded `aspect-square rounded-pill`, and calling into Phase
  1's new pure module instead of `lib/nina/crop.ts` — from which it imports exactly one thing,
  `zoomFactorForWheel`, directly (Phase 1 deliberately does not re-export it). Includes a ratio
  `<select>` sourced from
  Phase 1's exported `NINA_IMAGE_ASPECT_RATIOS`, defaulting to whatever
  `nearestNinaImageAspectRatio(sourceWidth, sourceHeight)` picks when the crop step is first
  opened (mirroring the already-shipped auto-pick, so opening the crop step and immediately
  running the job with no further adjustment is a no-op relative to not opening it at all).
- `components/admin/PhotoshopDetail.tsx` — **every line except the two prop-type members Phase 4
  already wrote.** Destructures and reads `sourceWidth`/`sourceHeight` (hiding the step entirely
  when either is `null`, since there is then no source aspect to fit a frame to);
  adds the optional, collapsible/toggleable crop step (offered identically for both `mode`
  values, per R1's explicit "both modes" instruction — no mode-conditional rendering of the crop
  step itself); `execute()` includes the four crop fields in its call to `runPhotoshopJobAction`
  only when the admin actually opened/used the step, and omits them (or sends explicit nulls)
  when skipped — preserving the "skip = today's behavior" contract end to end.
- `components/admin/PhotoshopCropStudio.test.tsx` (new): mirrors `CropStudio.test.tsx`'s
  structure and rigor (accessible name, CSS/pixel mapping, wheel zoom + passive listener,
  arrow-key nudge/zoom, pointer pan, pinch start/zoom/end, disabled state) adapted for a
  non-square, ratio-selectable frame.
- `components/admin/PhotoshopDetail.test.tsx` (new — confirmed absent today) covering: the crop step
  is offered in both modes, is hidden when the source's dimensions are unknown, skipping it sends
  four nulls, opening it sends the auto-picked ratio at the identity crop, adjusting it sends all
  four, and closing it again drops back to four nulls.

**Does not touch:** the DB schema, the Server Action's validation logic (Phase 4 already owns
it), `app/admin/photoshop/[source]/[id]/page.tsx` and `PhotoshopDetail`'s two prop-type members
(Phase 4), `imagecall.ts`/`photoshopRun.ts` (Phase 3), `lib/nina/crop.ts` and
`components/admin/CropStudio.tsx` (untouched by the whole plan set).
**Exit criteria:** the crop step renders identically in Anchor and Edit mode; skipping it leaves
`execute()`'s payload unchanged from `main` today (regression-asserted); using it produces a
well-formed four-field payload that Phase 4's validation accepts; `npx tsc --noEmit`, `npm run
lint`, `npm test` all pass.

## Reconciliation Log

Round 1, all 5 phase plans read in full against each other, against the analysis's Reference List
and Impact Points, and against the real source in this worktree. **Phase 1 is the definer of every
contested symbol and was not changed; the consuming plans were edited to match it.**

| # | Conflict | Class | Resolution (plans edited) |
|---|---|---|---|
| 1 | `photoshopCropBox`'s argument order: Phase 3 called `(natural, crop, targetRatio)`; Phase 1 defines `(source, targetRatio, crop)` | Contract drift | **phase-3.md** — `photoshopCropFor`'s call reordered; its Requires block rewritten to Phase 1's real signature; the `toHaveBeenCalledWith` assertion in `tests/nina.photoshopRun.test.ts` reordered, with a comment saying why it is asserted positionally. |
| 2 | `photoshopCropBox` returns `NinaPhotoshopCropBox \| null`; Phase 3 assumed non-nullable and dereferenced `box.width` immediately | Contract drift / latent crash | **phase-3.md** — explicit `if (box == null) return null` added ahead of the bounds checks (the same "cannot be applied → no crop" path the plan already had), the helper's docstring states the `null` contract, and a new suite case (`'a NULL box from the crop module is "no crop", not a failed job'`) drives that branch with `cropBoxOf.mockReturnValue(null)`. |
| 3 | Three separate label→ratio lookups: Phase 3's `.find()`, Phase 4's `.some()`, Phase 5's `ratioFor`'s `.find()` — while Phase 1 ships `ninaImageAspectRatioValue` whose docstring names Phases 4 and 5 as its consumers | Duplicate work / contract drift | **phase-3.md, phase-4.md, phase-5.md** — all three collapsed onto `ninaImageAspectRatioValue`. `photoshopRun.ts` and `photoshopActions.ts` no longer import `NINA_IMAGE_ASPECT_RATIOS` at all (Phase 5 still does, for the `<select>`; Phase 4's test still does, for its 23-label sweep). Both phases' **Depends on** lines updated. |
| 4 | `ninaPhotoshopCropStyle` (Phase 1) vs `photoshopCropStyle` (Phase 5's assumed name) | Contract drift | **phase-5.md** — import and the one JSX call site renamed. |
| 5 | Every `photoshopCrop.ts` mutator: Phase 5 called `(natural, crop, ratio, …)`; Phase 1 defines `(source, targetRatio, crop, …)` | Contract drift | **phase-5.md** — all ten call sites reordered (wheel zoom, pinch zoom, pan, four arrow nudges, two keyboard zooms, the slider zoom, the ratio-change clamp, the `<img>` style). A new header paragraph states the order once. The Requires block now quotes Phase 1's real signatures. **All expected test values in Steps 5 and 6 were re-derived against Phase 1's actual implementation and hold unchanged** (spans, offset limits, per-axis pan divisors, the 2:1→3:4 re-clamp to ±500, the pinch asymmetry, the 1.818/91 keyboard zoom). |
| 6 | Phase 5 assumed `zoomFactorForWheel` might be re-exported from `photoshopCrop.ts` | Unmet assumption (none, as written) | **No edit needed** — Phase 5's draft already imported it from `@/lib/nina/crop`, which is Phase 1's requirement (re-exporting it would cost `photoshopCrop.ts` its zero-import property). A comment was added at the import site recording why, and Phase 5's Requires block now states it explicitly so a later editor cannot "tidy" it into the wrong module. |
| 7 | `crop_y`'s unit: Phase 2's column comment said per-mille of the frame's **width** for both axes (copied from `nina_avatars`' square-frame triple); Phase 1 defines `y` as per-mille of the frame's **height** | Contract drift (would silently crop the wrong region on every non-square ratio) | **phase-2.md** — both column comments rewritten, with the reason (`crop.ts`'s one-unit rule is only legal for a square frame); the Assumptions section's two bullets replaced with the confirmed per-axis convention. No column TYPE changes — `integer` holds either unit. |
| 8 | `components/admin/PhotoshopDetail.tsx` touched by both Phase 4 and Phase 5; Phase 5 offered the reconciler options (a) and (b) for who writes the two prop-type lines | File collision / ordering | **Resolved as (a); phase-4.md and phase-5.md both edited to say so explicitly.** Phase 4 writes the two type-only members and nothing else in that file, in the same commit as its `page.tsx` edit — it must, or Phase 4 ends red, violating Invariant 1. Phase 5 owns every other line; its Step 2 rewrites the signature block reproducing those two members verbatim, and it no longer edits `page.tsx`. Phase 5's discarded option-(b) fallback snippet was demoted to "the state to build ON". |
| 9 | Phase 5 quoted `PhotoshopDetail.tsx` line numbers from `main`, though Phase 4 lands first and inserts ~6 lines into the props literal | File collision (stale quoting) | **phase-5.md** — Files table and Step 2 header now say the numbers are `main`'s and the file must be read as Phase 4 leaves it, with the shift named. |
| 10 | Phase 5's Rollback said Phase 4's two props "must come off in the same revert" | Contract drift with #8 | **phase-5.md** — Rollback rewritten: reverting Phase 5 returns the file to Phase 4's state (props declared, unread); backing the props out entirely means reverting Phase 4 too, in reverse phase order. |
| 11 | Phase 5 required `runPhotoshopJobAction`'s four fields to be `?: T \| null` and asked the reconciler to widen Phase 4 if not | Unmet assumption (none, as written) | **No edit needed** — Phase 4 already typed all four `?: T \| null` and coerces on `typeof`. **phase-5.md**'s bullet changed from a request to a CONFIRMED statement. |
| 12 | Phase 4 required Phase 1's bound constants by name and flagged a possible rename | Unmet assumption (none, as written) | **No edit needed** — `NINA_PHOTOSHOP_CROP_MIN_SCALE` (1) / `_MAX_SCALE` (4) / `_MAX_ABS_OFFSET` (200_000) match verbatim. **phase-4.md**'s bullet changed to CONFIRMED, and Phase 4's rejection case `cropX: 500_000` was checked against the real 200_000 ceiling (still rejected). |
| 13 | The migrate-before-deploy outage risk lived only in phase-2.md's prose | Escalation | **phase-2.md** (deploy-order wording sharpened to "not after, not at the same time"; exit criterion 5 now states the failure mode) **and the index's Invariant 5**, which now carries the mechanism (Drizzle names every declared column in every statement) and the consequence (every photoshop job fails, cropped or not) in the words a person about to merge needs. |
| 14 | Three phases' verification steps assume a working toolchain the worktree does not have | Gap (environment, not a phase) | **phase-1.md, phase-4.md, phase-5.md** gained the environment note phase-2.md and phase-3.md already carried, and it is recorded in **Next** below: `npm ci` under Node >= 22 before any phase's tests can run. |
| 15 | Index draft: file counts, packages, and several per-phase Owns/Exit bullets predated the plans | Index drift | **This file** — Phases table file counts corrected (2: 4→5, 3: 3→4, 4: 3→4, 5: 3→4), packages widened, and the Phase 1/2/3/4/5 sections updated to the reconciled contracts (argument order, the per-axis offset units, the `null` box, `ninaImageAspectRatioValue`, `zoomFactorForWheel`'s non-re-export, Phase 4's two prop-type lines). |

**Checked and clean, no edit required:** every one of the analysis's 12 Impact Points has exactly
one owning phase (1→P1, 2→P1, 3→P2, 4→P2, 5→P2, 6→P3, 7→P3, 8→P4, 9→P4, 10→P5, 11→P5, 12→P1/P2/P3/
P4/P5's own suites). No phase deletes or renames anything, so there is no deleted-then-used class of
conflict in this plan set at all. No phase's **Satisfies** line changed — every step in every phase
serves R1 and nothing else, so no requirement id moved, and R1 is served by all five phases exactly
as the draft said. Every dependency points backward (1,2 → 3,4 → 5). Each phase still builds and
typechecks on its own: Phase 1 and 2 are additive and unimported; Phase 3's parameters are defaulted;
Phase 4 carries the prop-type members its own page edit needs; Phase 5 only reads what 1 and 4 left.

## Open Questions

None. Every conflict found in round 1 was resolved by editing the plan files; no contradiction
survives, and no decision was left for the implementer to guess. Two things are deliberately
deferred and are not open questions but recorded scope decisions (see **Scope**): a curated short
list of common ratios in the picker, and a `crop_applied` column to make the "crop requested but the
anchor was dropped" warning queryable rather than grep-able.

## Rollback

- **Per phase:** each phase is additive (new file, new optional parameter, new nullable column) —
  reverting any single phase's commit(s) leaves the tree in the same working state the previous
  phase left it in, since no phase repurposes or removes an existing field, function, or column.
  **The one coupling to respect: Phase 4 owns `page.tsx`'s two new props AND the matching two
  members on `PhotoshopDetail`'s prop type.** Reverting Phase 5 alone is safe and returns the
  component to Phase 4's state (props declared, unread). Reverting Phase 4 while Phase 5 is still
  in the tree is not — go in reverse phase order.
- **Schema:** the new columns are nullable with no default-value backfill required, so the
  migration itself needs no down-migration data recovery — `drizzle-kit`'s generated down path
  (or a hand-written `ALTER TABLE ... DROP COLUMN`) is sufficient if the columns need removing,
  and no existing row is ever written to by this feature (every pre-existing job row simply reads
  back `NULL` for all four new columns, which is exactly "no crop").
- **As a whole:** revert the merge commit (or the feature branch's commits) on `main`; no
  production data migration is irreversible, since nothing is backfilled and nothing is deleted.

## Next

**Environment setup first — this is not a phase, and no phase's exit criteria can be verified
without it.** This worktree has **no `node_modules`**, and the shell's default Node is **v20.11.1**,
below `package.json`'s `"engines": { "node": ">=22" }` — Vitest 4 cannot even boot on it
(`node:util` does not export `styleText`). Every phase planner verified its plan by reading source
rather than by running anything, for exactly this reason. So, before Phase 1:

```bash
# in /home/miftah/.worktrees/run-insights/photoshop-aspect-ratio-crop, under a Node >= 22 binary
node --version        # must be >= 22
npm ci
npm test              # confirm the tree is green BEFORE any phase changes it
```

Then:

    /implement -f PHOTOSHOP_ASPECT_RATIO_CROP_PLAN.md          # execute the phases

**And before this branch is deployed:** `npm run db:migrate` against production, per Invariant 5 —
applied and confirmed applied *first*, not alongside the deploy.
