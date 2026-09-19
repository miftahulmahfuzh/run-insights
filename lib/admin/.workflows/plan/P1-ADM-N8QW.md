> Adopted from `photoshop-aspect-ratio-crop_PLAN.md` phase 4. Source: `.workflows/plan/photoshop-aspect-ratio-crop/phase-4.md`.
> Written and reconciled by /analyze — edit the source, not this copy.

# Phase 4: Server Action + page wiring

**Plan set:** `PHOTOSHOP_ASPECT_RATIO_CROP_PLAN.md`
**Analysis:** `20260919-134412-K7Q2_code_analyzer.md`
**Satisfies:** R1 — the admin's chosen crop must survive the trip from the browser to the job row,
and the page that will host the crop UI must know the source photo's real pixel size.
**Depends on:** Phase 1 (`ninaImageAspectRatioValue` from `lib/nina/imagerecipe.ts` +
`lib/nina/photoshopCrop.ts`'s bound constants), Phase 2 (`NinaPhotoshopJobArgs`' four crop fields)
**Difficulty:** NORMAL
**Package:** `lib/admin` (secondary: `app/admin/photoshop/[source]/[id]`)

---

## Goal

After this phase `runPhotoshopJobAction` accepts four optional crop fields, validates them at the
untrusted boundary (closed-set ratio label, coarse numeric bounds, all-four-or-none), and writes
them onto the job row through `openNinaPhotoshopJob`. `/admin/photoshop/[source]/[id]` passes the
source photo's natural `width`/`height` down to `<PhotoshopDetail>`, so Phase 5's crop studio has
the numbers it needs. A caller that sends no crop — every caller that exists today — produces a
byte-identical job row plus four explicit `null`s, which is the schema's own "no crop" value.

## Interface Contract

**Deletes:** none
**Renames:** none
**Creates:**
- `lib/admin/photoshopActions.ts` module-private `PhotoshopCropFields` interface,
  `PHOTOSHOP_NO_CROP` const, `PHOTOSHOP_CROP_SCALE_DECIMALS` const, `isCataloguedAspectRatio()`,
  `coercePhotoshopCrop()` — **all module-private on purpose**: this is a `'use server'` file, and
  Next.js only permits `async` function exports from one. The validation is asserted through the
  action that calls it, not exported for a unit test.
- `tests/admin.photoshopActions.test.ts` (new file — no photoshop test file of any kind exists on
  `main`; confirmed by `grep -rln 'runPhotoshopJobAction\|coercePhotoshopMode' tests/` returning
  nothing).

**Signature changes:**
- `runPhotoshopJobAction(input)` — `input` gains four OPTIONAL fields:
  `cropRatioLabel?: string | null`, `cropScale?: number | null`, `cropX?: number | null`,
  `cropY?: number | null`. Purely additive; today's six-field call still typechecks unchanged.
- `PhotoshopDetail`'s props type gains `sourceWidth: number | null` and
  `sourceHeight: number | null` — **type only.** See "Leaves alone" below; this is the one line of
  Phase 5's file this phase must touch, and it touches nothing else in it.

**Requires (from earlier phases):**
- **Phase 1 — `ninaImageAspectRatioValue(label: string): number | null`** exported from
  `@/lib/nina/imagerecipe`. **RECONCILED (round 1):** this phase's draft used
  `NINA_IMAGE_ASPECT_RATIOS.some(...)`; Phase 1 ships a purpose-built lookup whose `null` is the
  closed-set miss and whose docstring names this very check as its first consumer, so
  `isCataloguedAspectRatio()` calls it and this file no longer imports the table itself. (The table
  is still exported and is still what Phase 5's `<select>` renders and what
  `tests/admin.photoshopActions.test.ts` sweeps.)
- **Phase 1 —** `@/lib/nina/photoshopCrop` exports `NINA_PHOTOSHOP_CROP_MIN_SCALE` (1),
  `NINA_PHOTOSHOP_CROP_MAX_SCALE` (4), `NINA_PHOTOSHOP_CROP_MAX_ABS_OFFSET` (200_000) — **confirmed
  verbatim against Phase 1's Interface Contract (round 1); no rename needed.** Do NOT re-declare
  the numbers here: duplicating them as literals in `lib/admin/` is the exact drift this plan set's
  Phase 1 exists to prevent. Note the ceiling is deliberately loose (Phase 1 derives 200_000 from
  the worst realistic panorama-vs-1:8 mismatch); `photoshopCropBox` re-clamps exactly at run time,
  so this boundary only has to reject absurdity.
- **Phase 2 —** `NinaPhotoshopJobArgs` (`lib/nina/photoshopJobs.ts:27-35`) gains
  `cropRatioLabel`, `cropScale`, `cropX`, `cropY`, each of which **must accept `null`** (i.e.
  `cropScale?: number | null`, not `cropScale?: number`) — this phase writes all four explicitly
  on every call, four `null`s meaning "no crop", which is the schema's own all-or-nothing
  convention and the one Phase 3 reads back.

**Leaves alone (owned by others):**
- `lib/nina/imagecall.ts`, `lib/nina/photoshopRun.ts` — Phase 3 consumes what this phase writes.
  In particular `firePhotoshopJob(...)`'s argument object is left exactly as it is today: the
  crop reaches the runner through `claimNinaPhotoshopJob`'s `args`, never through the fire
  payload. A test below pins that.
- `components/admin/PhotoshopCropStudio.tsx` (does not exist yet) and every line of
  `components/admin/PhotoshopDetail.tsx`'s BODY — Phase 5. This phase adds two members to that
  component's inline props type and deliberately does not destructure or render them, so the file
  compiles today and Phase 5 has a prop to read tomorrow.
- `lib/db/schema/nina/photoshop.ts`, `scripts/photoshop.ts` — Phase 2.

## Files

| File | Action | What changes |
|---|---|---|
| `lib/admin/photoshopActions.ts` | modify | imports (`:1-24`), new crop-coercion block after the header comment (`:31`), `runPhotoshopJobAction`'s input type and `openNinaPhotoshopJob` call (`:35-85`) |
| `app/admin/photoshop/[source]/[id]/page.tsx` | modify | `:26` — pass `photo.width`/`photo.height` to `<PhotoshopDetail>` |
| `components/admin/PhotoshopDetail.tsx` | modify | `:36-40` — two members added to the inline props type, nothing else |
| `tests/admin.photoshopActions.test.ts` | create | execution-level coverage of the new validation branch |

## Implementation Steps

### Step 1: Import Phase 1's ratio catalogue and crop bounds

**File:** `lib/admin/photoshopActions.ts:1-24`
**Change:** Add two imports, placed to keep the file's existing `@/lib/...` alphabetical grouping
(`imagerecipe` < `photoshopCrop` < `photoshopJobs` < `photoshopPresets` < `photoshopResolve` <
`photoshopRun`). Replace the whole import block.
**Code:**

```ts
'use server'

import { revalidatePath } from 'next/cache'

import { requireAdmin } from '@/lib/admin/requireAdmin'
import type { NinaPhotoshopResolution, NinaPhotoshopSourceKind } from '@/lib/db/schema'
import { isValidId } from '@/lib/id'
import { ninaImageAspectRatioValue } from '@/lib/nina/imagerecipe'
import {
  NINA_PHOTOSHOP_CROP_MAX_ABS_OFFSET,
  NINA_PHOTOSHOP_CROP_MAX_SCALE,
  NINA_PHOTOSHOP_CROP_MIN_SCALE,
} from '@/lib/nina/photoshopCrop'
import {
  getNinaPhotoshopJob,
  isNinaPhotoshopJobStale,
  openNinaPhotoshopJob,
} from '@/lib/nina/photoshopJobs'
import {
  coercePhotoshopInstruction,
  coercePhotoshopMode,
  coercePhotoshopModel,
} from '@/lib/nina/photoshopPresets'
import {
  getPhotoshopSourcePhoto,
  resolvePhotoshopAdd,
  resolvePhotoshopDiscard,
  resolvePhotoshopReplace,
} from '@/lib/nina/photoshopResolve'
import { firePhotoshopJob } from '@/lib/nina/photoshopRun'
```

**Impact:** `lib/admin/` now depends on two `lib/nina/` modules it did not before. Both are
zero-import pure modules (Invariant 3), so nothing server-only or client-hostile crosses the
boundary, and `ci:openrouter-guard` is unaffected — it greps only for the literal
`OPENROUTER_API_KEY` (`scripts/check-openrouter-boundary.mjs:57`), which appears nowhere here.

### Step 2: The crop coercion, module-private

**File:** `lib/admin/photoshopActions.ts` — inserted between the file header comment (ends `:31`)
and `export type PhotoshopRunResult` (`:33`).
**Change:** Add the whole block below, verbatim.
**Code:**

```ts
/* ── The crop step's untrusted input ──────────────────────────────────────────────────────────
 *
 * The four columns are all-or-nothing: all four set, or all four NULL. A PARTIAL set is coerced
 * to "no crop" rather than completed with defaults — a crop rectangle missing its ratio (or its
 * offsets) is not a crop, and inventing the missing member is how a job silently sends the model
 * the wrong region of the photo with nothing failing anywhere.
 *
 * The bounds here are a COARSE sanity gate, not the real clamp. The exact, dimension-aware clamp
 * lives in `lib/nina/photoshopCrop.ts` — the browser applies it on every drag, and the pixel
 * crop-box function applies it again against the source's own bounds when the job actually runs.
 * This boundary only has to refuse nonsense before it reaches a `numeric(5,3)` column.
 *
 * A rejected crop does NOT fail the run: it degrades to today's uncropped behaviour, which is
 * exactly what "the admin skipped the crop step" already means. Only a hand-crafted request can
 * land here — the picker can emit nothing but catalogued labels — so refusing the whole job would
 * trade a working photoshop run for a scolding nobody is present to read. */

/** `numeric(5,3)`: the column holds three decimals, so a scale that survives this boundary is
 * already the number the row will store. Rounding here, not at read time, keeps the value the
 * admin chose and the value Phase 3 crops with identical. */
const PHOTOSHOP_CROP_SCALE_DECIMALS = 3

/** The four crop columns as the job row holds them. */
interface PhotoshopCropFields {
  cropRatioLabel: string | null
  cropScale: number | null
  cropX: number | null
  cropY: number | null
}

/** "No crop, behave as today" — the value every pre-crop job row already reads back. */
const PHOTOSHOP_NO_CROP: PhotoshopCropFields = {
  cropRatioLabel: null,
  cropScale: null,
  cropX: null,
  cropY: null,
}

/** The closed set is `NINA_IMAGE_ASPECT_RATIOS` itself — the same table `nearestNinaImageAspectRatio`
 * picks from and the same one Phase 5's `<select>` renders, so the picker and this check can never
 * disagree about which labels exist. Asked through Phase 1's `ninaImageAspectRatioValue`, whose
 * `null` IS the membership miss: "is this one of the provider's 23 values" and "what is it
 * numerically" are one question asked twice, and one function answering both is one place to be
 * wrong. Exact string match, no trimming, no case folding — the label goes on the wire verbatim as
 * `aspect_ratio`, so a value this accepts must be a value the provider accepts. */
function isCataloguedAspectRatio(label: string): boolean {
  return ninaImageAspectRatioValue(label) != null
}

function coercePhotoshopCrop(input: {
  cropRatioLabel?: string | null
  cropScale?: number | null
  cropX?: number | null
  cropY?: number | null
}): PhotoshopCropFields {
  const label = input.cropRatioLabel
  const scale = input.cropScale
  const x = input.cropX
  const y = input.cropY

  if (
    typeof label !== 'string' ||
    typeof scale !== 'number' ||
    typeof x !== 'number' ||
    typeof y !== 'number'
  ) {
    return PHOTOSHOP_NO_CROP
  }

  if (!isCataloguedAspectRatio(label)) return PHOTOSHOP_NO_CROP

  if (
    !Number.isFinite(scale) ||
    scale < NINA_PHOTOSHOP_CROP_MIN_SCALE ||
    scale > NINA_PHOTOSHOP_CROP_MAX_SCALE
  ) {
    return PHOTOSHOP_NO_CROP
  }

  if (!Number.isFinite(x) || Math.abs(x) > NINA_PHOTOSHOP_CROP_MAX_ABS_OFFSET) {
    return PHOTOSHOP_NO_CROP
  }
  if (!Number.isFinite(y) || Math.abs(y) > NINA_PHOTOSHOP_CROP_MAX_ABS_OFFSET) {
    return PHOTOSHOP_NO_CROP
  }

  const factor = 10 ** PHOTOSHOP_CROP_SCALE_DECIMALS
  /* `+ 0` normalises negative zero, `lib/nina/crop.ts:210`'s own reason: `Math.round(-0)` is `-0`,
   * it compares equal to `0` everywhere but `Object.is` (and so `toEqual`) tells them apart, and
   * `integer` round-trips it as `0` anyway. One sign, always. */
  return {
    cropRatioLabel: label,
    cropScale: Math.round(scale * factor) / factor,
    cropX: Math.round(x) + 0,
    cropY: Math.round(y) + 0,
  }
}
```

**Impact:** No exported surface changes. `'use server'`'s export rule is respected — every one of
these is module-private.

### Step 3: Accept and write the crop in `runPhotoshopJobAction`

**File:** `lib/admin/photoshopActions.ts:35-85`
**Change:** Replace the whole function. Two edits: four optional fields on `input`, and the
coerced crop spread onto `openNinaPhotoshopJob`'s args. `firePhotoshopJob`'s payload is untouched.
**Code:**

```ts
export async function runPhotoshopJobAction(input: {
  sourceKind: NinaPhotoshopSourceKind
  sourceId: string
  mode: string
  model: string
  presetKey: string | null
  instruction: string
  /** The optional aspect-ratio crop step (R1). All four together, or all four absent — a partial
   * set is coerced to "no crop". Absent on every call that predates the crop UI, and on every
   * `scripts/photoshop.ts` run, which has no rectangle to drag. */
  cropRatioLabel?: string | null
  cropScale?: number | null
  cropX?: number | null
  cropY?: number | null
}): Promise<PhotoshopRunResult> {
  const { userId } = await requireAdmin()

  if (input.sourceKind !== 'avatar' && input.sourceKind !== 'message_image') {
    return { ok: false, message: 'Unknown photo source.' }
  }
  if (!isValidId(input.sourceId)) return { ok: false, message: 'Unknown photo.' }

  const instruction = coercePhotoshopInstruction(input.instruction)
  if (instruction === '') {
    return {
      ok: false,
      message: 'Type what should change, or pick a preset, before running photoshop.',
    }
  }

  const source = await getPhotoshopSourcePhoto(userId, input.sourceKind, input.sourceId)
  if (source == null) return { ok: false, message: 'That photo could not be found.' }

  const mode = coercePhotoshopMode(input.mode)
  const model = coercePhotoshopModel(mode, input.model)
  const presetKey =
    typeof input.presetKey === 'string' && input.presetKey !== '' ? input.presetKey : null
  const crop = coercePhotoshopCrop(input)

  const jobId = await openNinaPhotoshopJob(userId, {
    sourceKind: input.sourceKind,
    sourceId: input.sourceId,
    sourceContentHash: source.contentHash,
    mode,
    model,
    presetKey,
    promptText: instruction,
    cropRatioLabel: crop.cropRatioLabel,
    cropScale: crop.cropScale,
    cropX: crop.cropX,
    cropY: crop.cropY,
  })

  /* The crop is NOT passed here. `attemptPhotoshopOnce` reads it back off the row through
   * `claimNinaPhotoshopJob` (Phase 3), the same way it reads mode, model and prompt — one source
   * of truth for what the job is, and the retry path gets it for free. */
  firePhotoshopJob({
    userId,
    jobId,
    sourceUrl: source.blobUrl,
    sourceWidth: source.width,
    sourceHeight: source.height,
  })

  return { ok: true, jobId }
}
```

**Impact:** Every existing caller (`PhotoshopDetail.tsx`'s `execute()`, line 87) still typechecks
unchanged and now writes four explicit `null`s — which is what the columns already default to, so
the row is identical to `main`'s. This is the step that depends on Phase 2's args accepting
`null`.

### Step 4: Hand the page's natural size to the component

**File:** `app/admin/photoshop/[source]/[id]/page.tsx:26`
**Change:** Replace the returned element. `photo.width`/`photo.height` are already fetched by
`getPhotoshopSourcePhoto` (`lib/nina/photoshopResolve.ts:32-33`) and discarded by this page today;
they are `number | null` for rows that predate dimension tracking, and the null case is passed
through honestly rather than defaulted — Phase 5 decides what a crop studio with no known source
size does (its own documented degradation, mirroring `cropSpanPct`'s).
**Code:**

```tsx
  return (
    <PhotoshopDetail
      sourceKind={source}
      sourceId={id}
      sourceUrl={photo.blobUrl}
      sourceWidth={photo.width}
      sourceHeight={photo.height}
    />
  )
```

**Impact:** This is the only render site of `<PhotoshopDetail>` in the repo (verified:
`grep -rn 'PhotoshopDetail' app components lib tests scripts` returns this file and the component
itself, nothing else), so Step 5's props change breaks no other call site and no test.

### Step 5: Two members on `PhotoshopDetail`'s props type — and nothing else

**File:** `components/admin/PhotoshopDetail.tsx:32-40`
**Change:** Replace the function signature's inline props type. The two new members are **not
destructured**: the component body is Phase 5's, and an unread member of a props type is neither
an eslint error (no `no-unused-vars` fires on a type member) nor a `knip` finding (it reports
unused files/exports/dependencies, not interface members). Without this, Step 4 does not typecheck
and this phase would leave the tree red — which the plan set's Invariant 1 forbids.
**Code:**

```tsx
export function PhotoshopDetail({
  sourceKind,
  sourceId,
  sourceUrl,
}: {
  sourceKind: NinaPhotoshopSourceKind
  sourceId: string
  sourceUrl: string
  /** The source photo's intrinsic pixel size, `null` for a row that predates dimension tracking.
   * Accepted here so `app/admin/photoshop/[source]/[id]/page.tsx` can hand it over; READ by the
   * aspect-ratio crop step (Phase 5), which needs the source's own shape to fit a rectangle to it. */
  sourceWidth: number | null
  sourceHeight: number | null
}) {
```

**Impact:** The component's runtime behaviour is byte-identical. Phase 5 destructures these two
and builds the crop studio on them.

### Step 6: The validation suite

**File:** `tests/admin.photoshopActions.test.ts` (new)
**Change:** Create the file. Convention followed: `tests/admin.imageGenActions.test.ts` — `vi.mock`
each dependency, `vi.resetModules()` + `await import(...)` of the action module in `beforeEach`,
and assert on what the mocked writer RECEIVED rather than on an exported helper. That is the only
way to test this validation anyway: `'use server'` forbids exporting the sync coercer.

Plain mock factories (not `importOriginal`) are used deliberately — the action imports exactly the
names listed from each module, and a plain factory keeps this suite from loading
`lib/nina/photoshopRun.ts`'s whole provider stack, which Phase 3 is editing in parallel.

**Code:**

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * **`runPhotoshopJobAction`'s crop boundary** — the untrusted edge of R1's aspect-ratio crop step.
 *
 * There is no test file for `lib/admin/photoshopActions.ts` on `main` and none for
 * `lib/nina/photoshopPresets.ts` either, so this suite is written from first principles rather
 * than extended. It asserts the one thing only execution pins: WHAT REACHES THE ROW. The crop
 * coercer is module-private (a `'use server'` file may export nothing but async functions), so it
 * is proven through the action, by reading `openNinaPhotoshopJob`'s argument.
 *
 * The load-bearing cases, in order of what would hurt most in production:
 *   - a run with NO crop writes four explicit nulls and is otherwise identical to `main`'s row;
 *   - a PARTIAL crop is refused wholesale, never completed with defaults;
 *   - an uncatalogued ratio label cannot reach a job row, so `aspect_ratio` on the wire can only
 *     ever be a value the provider documents;
 *   - a rejected crop still RUNS the job, uncropped — the "skipped the crop step" path;
 *   - the crop never rides on `firePhotoshopJob`'s payload: Phase 3 reads it off the row.
 */

const USER = 'abc123XYZ_-9'
const SOURCE_ID = 'photo123XYZ_'
const JOB_ID = 'job123XYZ_-9'

const requireAdmin = vi.fn()
const revalidatePath = vi.fn()
const openNinaPhotoshopJob = vi.fn()
const getNinaPhotoshopJob = vi.fn()
const isNinaPhotoshopJobStale = vi.fn()
const getPhotoshopSourcePhoto = vi.fn()
const resolvePhotoshopAdd = vi.fn()
const resolvePhotoshopDiscard = vi.fn()
const resolvePhotoshopReplace = vi.fn()
const firePhotoshopJob = vi.fn()

vi.mock('@/lib/admin/requireAdmin', () => ({ requireAdmin: () => requireAdmin() }))
vi.mock('next/cache', () => ({ revalidatePath: (path: string) => revalidatePath(path) }))
vi.mock('@/lib/nina/photoshopJobs', () => ({
  openNinaPhotoshopJob: (...args: unknown[]) => openNinaPhotoshopJob(...args),
  getNinaPhotoshopJob: (...args: unknown[]) => getNinaPhotoshopJob(...args),
  isNinaPhotoshopJobStale: (...args: unknown[]) => isNinaPhotoshopJobStale(...args),
}))
vi.mock('@/lib/nina/photoshopResolve', () => ({
  getPhotoshopSourcePhoto: (...args: unknown[]) => getPhotoshopSourcePhoto(...args),
  resolvePhotoshopAdd: (...args: unknown[]) => resolvePhotoshopAdd(...args),
  resolvePhotoshopDiscard: (...args: unknown[]) => resolvePhotoshopDiscard(...args),
  resolvePhotoshopReplace: (...args: unknown[]) => resolvePhotoshopReplace(...args),
}))
vi.mock('@/lib/nina/photoshopRun', () => ({
  firePhotoshopJob: (...args: unknown[]) => firePhotoshopJob(...args),
}))

type Actions = typeof import('@/lib/admin/photoshopActions')
type RunInput = Parameters<Actions['runPhotoshopJobAction']>[0]
let actions: Actions

/** A complete, valid run with no crop — what the panel sends on `main` today. */
function runInput(overrides: Partial<RunInput> = {}): RunInput {
  return {
    sourceKind: 'message_image',
    sourceId: SOURCE_ID,
    mode: 'edit',
    model: 'bytedance-seed/seedream-4.5',
    presetKey: null,
    instruction: 'Same woman, same photo — fix her eyes.',
    ...overrides,
  }
}

/** The four crop columns as `openNinaPhotoshopJob` received them. */
function writtenCrop(): Record<string, unknown> {
  expect(openNinaPhotoshopJob).toHaveBeenCalledTimes(1)
  const [, args] = openNinaPhotoshopJob.mock.calls[0] as [string, Record<string, unknown>]
  return {
    cropRatioLabel: args.cropRatioLabel,
    cropScale: args.cropScale,
    cropX: args.cropX,
    cropY: args.cropY,
  }
}

const NO_CROP = { cropRatioLabel: null, cropScale: null, cropX: null, cropY: null }

beforeEach(async () => {
  vi.resetModules()
  requireAdmin.mockReset().mockResolvedValue({ userId: USER, email: 'ops@example.com' })
  revalidatePath.mockReset()
  openNinaPhotoshopJob.mockReset().mockResolvedValue(JOB_ID)
  getNinaPhotoshopJob.mockReset().mockResolvedValue(null)
  isNinaPhotoshopJobStale.mockReset().mockReturnValue(false)
  getPhotoshopSourcePhoto.mockReset().mockResolvedValue({
    blobUrl: 'https://blob.example/shots/source.png',
    contentHash: 'hash-abc',
    folder: null,
    width: 832,
    height: 732,
  })
  resolvePhotoshopAdd.mockReset()
  resolvePhotoshopDiscard.mockReset()
  resolvePhotoshopReplace.mockReset()
  firePhotoshopJob.mockReset()
  actions = await import('@/lib/admin/photoshopActions')
})

describe('runPhotoshopJobAction — no crop supplied', () => {
  it('writes four explicit nulls, and the rest of the row exactly as before', async () => {
    const result = await actions.runPhotoshopJobAction(runInput())

    expect(result).toEqual({ ok: true, jobId: JOB_ID })
    const [userArg, args] = openNinaPhotoshopJob.mock.calls[0] as [
      string,
      Record<string, unknown>,
    ]
    expect(userArg).toBe(USER)
    expect(args).toEqual({
      sourceKind: 'message_image',
      sourceId: SOURCE_ID,
      sourceContentHash: 'hash-abc',
      mode: 'edit',
      model: 'bytedance-seed/seedream-4.5',
      presetKey: null,
      promptText: 'Same woman, same photo — fix her eyes.',
      ...NO_CROP,
    })
  })

  it('never puts the crop on firePhotoshopJob — Phase 3 reads it off the row', async () => {
    await actions.runPhotoshopJobAction(
      runInput({ cropRatioLabel: '5:4', cropScale: 1.25, cropX: 40, cropY: -60 }),
    )

    expect(firePhotoshopJob).toHaveBeenCalledTimes(1)
    const [fired] = firePhotoshopJob.mock.calls[0] as [Record<string, unknown>]
    expect(Object.keys(fired).sort()).toEqual([
      'jobId',
      'sourceHeight',
      'sourceUrl',
      'sourceWidth',
      'userId',
    ])
  })
})

describe('runPhotoshopJobAction — a well-formed crop', () => {
  it('writes all four through, rounding the scale to the column’s three decimals', async () => {
    const result = await actions.runPhotoshopJobAction(
      runInput({ cropRatioLabel: '5:4', cropScale: 1.23456, cropX: 120, cropY: -85 }),
    )

    expect(result).toEqual({ ok: true, jobId: JOB_ID })
    expect(writtenCrop()).toEqual({
      cropRatioLabel: '5:4',
      cropScale: 1.235,
      cropX: 120,
      cropY: -85,
    })
  })

  it('rounds fractional offsets and normalises negative zero', async () => {
    await actions.runPhotoshopJobAction(
      runInput({ cropRatioLabel: '9:16', cropScale: 1, cropX: 12.4, cropY: -0.2 }),
    )

    const crop = writtenCrop()
    expect(crop.cropX).toBe(12)
    expect(crop.cropY).toBe(0)
    expect(Object.is(crop.cropY, -0)).toBe(false)
  })

  it('accepts every label in the catalogue, and nothing else', async () => {
    const { NINA_IMAGE_ASPECT_RATIOS } = await import('@/lib/nina/imagerecipe')

    for (const entry of NINA_IMAGE_ASPECT_RATIOS) {
      openNinaPhotoshopJob.mockClear()
      await actions.runPhotoshopJobAction(
        runInput({ cropRatioLabel: entry.label, cropScale: 1, cropX: 0, cropY: 0 }),
      )
      expect(writtenCrop().cropRatioLabel).toBe(entry.label)
    }
  })
})

describe('runPhotoshopJobAction — a crop that cannot be trusted', () => {
  /** Each case is a payload only a hand-crafted request can produce. Every one of them must land
   * on "no crop" — never a partial row, never a guessed default. */
  const rejected: ReadonlyArray<[string, Partial<RunInput>]> = [
    ['an uncatalogued ratio label', { cropRatioLabel: '7:3', cropScale: 1, cropX: 0, cropY: 0 }],
    ['`auto`, which the catalogue deliberately omits', { cropRatioLabel: 'auto', cropScale: 1, cropX: 0, cropY: 0 }],
    ['a label with no crop numbers', { cropRatioLabel: '5:4' }],
    ['numbers with no label', { cropScale: 1.2, cropX: 10, cropY: 10 }],
    ['a partial set — y missing', { cropRatioLabel: '5:4', cropScale: 1.2, cropX: 10 }],
    ['an explicit null inside an otherwise complete set', { cropRatioLabel: '5:4', cropScale: 1.2, cropX: null, cropY: 10 }],
    ['a scale below the cover floor', { cropRatioLabel: '5:4', cropScale: 0.4, cropX: 0, cropY: 0 }],
    ['a scale past the ceiling', { cropRatioLabel: '5:4', cropScale: 99, cropX: 0, cropY: 0 }],
    ['a NaN scale', { cropRatioLabel: '5:4', cropScale: Number.NaN, cropX: 0, cropY: 0 }],
    ['an infinite offset', { cropRatioLabel: '5:4', cropScale: 1, cropX: Number.POSITIVE_INFINITY, cropY: 0 }],
    ['an x offset past the hard cap', { cropRatioLabel: '5:4', cropScale: 1, cropX: 500_000, cropY: 0 }],
    ['a y offset past the hard cap', { cropRatioLabel: '5:4', cropScale: 1, cropX: 0, cropY: -500_000 }],
  ]

  for (const [name, overrides] of rejected) {
    it(`coerces ${name} to no crop, and still runs the job`, async () => {
      const result = await actions.runPhotoshopJobAction(runInput(overrides))

      expect(result).toEqual({ ok: true, jobId: JOB_ID })
      expect(writtenCrop()).toEqual(NO_CROP)
      expect(firePhotoshopJob).toHaveBeenCalledTimes(1)
    })
  }
})
```

**Impact:** The suite pins the boundary's whole contract, including the two regressions that
matter to Invariant 2 (no-crop row identical to `main`; crop absent from the fire payload).

## Verification

> **Environment note (reconciler, round 1):** this worktree has **no `node_modules`** and the
> shell's default Node is **v20.11.1**, below `package.json`'s `"engines": { "node": ">=22" }` —
> Vitest 4 cannot boot on it (`node:util` has no `styleText`). Run `npm ci` in the worktree under a
> Node >= 22 binary before any command below. One-off setup for the whole plan set, not this
> phase's work.

**Build:** `npm run build`
**Typecheck (the real gate):** `npm run typecheck`
**Tests:** `npx vitest run tests/admin.photoshopActions.test.ts`, then `npm test`
**Lint/format:** `npm run lint && npm run format:check`
**Guards:** `npm run ci:openrouter-guard && npm run ci:data-layer-guard && npm run ci:client-secret-guard`
(none of the three should notice this phase; run them because the phase touches a `lib/admin/`
Server Action that now imports from `lib/nina/`)
**Manual check:** load `/admin/photoshop/message_image/<id>` and run a job with the existing UI —
the panel must behave exactly as before, and the new job row must show all four `crop_*` columns
`NULL`.
**Exit criteria:** `runPhotoshopJobAction` writes a well-formed crop onto the job row, coerces a
malformed or partial one to four `NULL`s without failing the run, `<PhotoshopDetail>` receives the
source's natural width/height from the page, and typecheck/lint/tests are green with no behaviour
change for any caller that sends no crop.

## Handoffs

- **Phase 5 (R1)** — reading `sourceWidth`/`sourceHeight` in `PhotoshopDetail`'s body, deciding
  what the crop step does when both are `null` (a source row that predates dimension tracking),
  building `PhotoshopCropStudio.tsx`, and sending the four fields from `execute()`.
  **RECONCILED (round 1) — ownership of the two prop-type lines is THIS phase's, settled:** both
  phases touch `components/admin/PhotoshopDetail.tsx`, at disjoint regions. **Phase 4 writes the
  two type-only members (Step 5) and nothing else in that file**; Phase 5 destructures them, adds
  the state, the toggle, the JSX and the `execute()` payload. Phase 4 must own them because Step 4
  of this phase makes `page.tsx` pass both props, and without the type members THIS phase would end
  red — which the plan set's Invariant 1 forbids. Phase 5's Step 2 rewrites the whole
  signature/props block wholesale, reproducing these two members verbatim; that is a rewrite of a
  region Phase 4 already changed, not a second, conflicting write, and Phase 5's plan quotes the
  post-Phase-4 shape.
- **Phase 3 (R1)** — reading the four fields back off the claim and turning them into a pixel crop
  box. This phase deliberately does not pass them to `firePhotoshopJob`; if Phase 3 concludes it
  needs them on the fire payload instead of the claim, that is a Phase 3 change to
  `photoshopRun.ts` plus one line here, and the reconciler should say which.
- **Not done, deliberately:** no test for `coercePhotoshopMode`/`coercePhotoshopModel`/
  `coercePhotoshopInstruction`. They are untested on `main` and this phase does not change them —
  covering them is a drive-by cleanup, not this phase's work. Worth its own card.
- **Not done, deliberately:** `runPhotoshopJobAction` still returns a generic `ok: true` when it
  discards a malformed crop. Surfacing "your crop was ignored" to the admin needs a new field on
  `PhotoshopRunResult` and a place in the UI to render it — that is a UI decision, and the payload
  can only be malformed if something other than the UI sent it.

## Rollback

Revert this phase's commit(s). The four action fields are optional, the coercer is module-private,
and the two props-type members are unread — nothing outside this phase depends on any of them
until Phase 5 lands. Jobs already written with crop values simply keep them on the row; with this
phase reverted no new job row gets them, and Phase 3 (if present) sees all-`NULL` and runs the
uncropped path, which is today's behaviour. Delete `tests/admin.photoshopActions.test.ts` with the
revert; nothing else imports it.
