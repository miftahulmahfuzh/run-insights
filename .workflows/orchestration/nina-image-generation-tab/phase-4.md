# Phase 4: The route, the sixth nav cell, and the form

**Plan set:** `NINA_IMAGE_GENERATION_TAB_PLAN.md`
**Analysis:** `20260907-124015-IMGN_code_analyzer.md`
**Satisfies:** R2 (a new admin tab: Image Generation), R4 (prompt-length slider), R5 (the six focus options), R6 (wardrobe), R7 (venue), R8 (time), R9 (notes) — the UI half of each
**Depends on:** Phase 1
**Difficulty:** HARD
**Package:** `app/admin`, `components/admin`, `lib/admin`

> ### ⚠ THE BASE MOVED AFTER THIS PLAN WAS WRITTEN — READ THIS FIRST
>
> This plan was written against `b0e492a`, which was local `main` and **30 commits behind
> `origin/main`**. `origin/main` has since been merged into the branch and the worktree is now at
> **`4a7588e`**. That is the tree this plan must be applied to.
>
> Two feature sets landed in that merge and both changed facts this plan set depends on:
> **`nina-photo-caption-from-image`** (migration `0009_nina_message_photo_only.sql` — `nina_messages.photo_only`)
> and **`nina-photo-refs-and-bubble-actions`** (migration `0010_nina_image_provenance.sql` —
> `nina_message_images.source_avatar_id` / `source_image_id`).
>
> **Consequences for every plan in this set:**
>
> 1. **The migration watermark is `0010`**, not `0008`. The journal has eleven entries (`idx` 0-10).
>    Phase 1 generates **`0011`**; phase 7 generates **`0012`**. No other phase generates one.
> 2. **Hand-written backfill SQL is appended AFTER `npm run db:generate`, and regeneration silently
>    drops it.** Both landed migrations say so in banner comments. Never hand-name, never rename, and
>    if a migration is ever regenerated, diff the old file against the new one and re-append before
>    deleting anything.
> 3. **A row in `nina_message_images` is a *reference* when `source_avatar_id` OR `source_image_id`
>    is non-null** — see plan invariant 13. The three collection reads already exclude them through
>    `isOriginalPhoto()` (`lib/nina/queries.ts:1616-1618`).
> 4. **`lib/nina/prompts/` now exists** (`caption.ts`, `describe.ts`, `distill.ts`, `index.ts`,
>    `system.ts`, `tools.ts`) and `lib/nina/persona.ts` gained the Instructor character
>    (`isInstructor` :730, `INSTRUCTOR_COACHING` :813, `ninaInstructorCoachingBlock` :839).
>    **Image-prompt assembly did NOT move** — `buildNinaImagePrompt` and `sidecarText` are still in
>    `lib/nina/imagegen.ts`, and `ninaAppearance` / `NINA_FACE` / `NINA_APPEARANCE` are still in
>    `persona.ts`. Nothing under `lib/nina/prompts/` imports any of them.
> 5. **`scripts/check-llm-payload-boundary.mjs` now guards NINE symbols, not eight** — the ninth is
>    `captionNinaPhoto`, sanctioned in `lib/nina/caption.ts`, `lib/admin/chatPhotoActions.ts` and
>    `lib/nina/imagerun.ts`. Three of the nine are image symbols (`runNinaImageJob`,
>    `describeNinaImage`, `captionNinaPhoto`). The guard is a name allowlist over `app/`, `lib/`,
>    `components/`; `buildNinaImagePrompt` is not in it, so a pure preview in a render still passes
>    (plan invariant 5 re-verified against the guard as it now stands).
> 6. **EVERY `file:line` CITATION BELOW IS ADVISORY.** Line numbers shifted in `persona.ts` (+~13 to
>    +139), `queries.ts` (+~130), `tuning.ts` (+~22), `schema.ts` (+~64), `CharacterPanel.tsx` (+13),
>    `app/admin/layout.tsx` (+31) and `imagegen.ts` (-7). The reconciler corrected the load-bearing
>    ones in place; **grep for the symbol before editing, never `sed -n` a line range.**

---

## Goal

`/admin/image-generation` exists: a sixth admin route with a sixth nav cell, carrying the
prompt-length slider, the six focus checkboxes and the four free-text fields, all persisted by
**one** save action into phase 1's `nina_image_prefs` row and previewed with phase 2's real
assembler. After this phase the operator can set every parameter the user asked for except the
photo-reference grid itself (phase 5 fills a labelled seam) and the test-prompt button (phase 6
fills a second one) — and the *selected reference* already round-trips through this phase's save,
so phase 5 adds no action and no schema of its own.

`/admin/personality` still renders its old Wardrobe field after this phase. That is correct:
phase 7 retires it, and it needs this phase's field to exist first.

---

## Interface Contract

**Deletes:** nothing.

**Renames:** nothing.

**Creates:**

- `app/admin/image-generation/page.tsx` — `AdminImageGenerationPage` (default), `dynamic`
- `components/admin/ImageGenPanel.tsx` — `ImageGenPanel`, `ImageGenPanelProps`
- `lib/admin/imageGenModel.ts` — `ImageGenDraft`, `ImageGenCopy`, `ImageReferenceOption`,
  `IMAGE_REFERENCE_NONE`, `ADMIN_IMAGE_PREVIEW_SCENE`, `toImageGenDraft`,
  `toImageReferenceOption`, `referenceKey`, **`parseReferenceKey`** (added by the reconciler — the
  decode half of the picker's opaque-string contract, see Step 1), `focusOnKeys`,
  `prettifyFocusKey`, `imageFocusCopy`, `hasImageFocusCopy`, `promptLengthCopy`,
  `changedImageGenFields`, `imageGenDraftEquals`
- `lib/admin/imageGenActions.ts` — `AdminImageGenResult`, `saveNinaImagePrefsAction`,
  `resetNinaImagePrefsAction` (**exactly two exported async functions**)
- `lib/admin/schema.ts` (appended) — `ninaImageReferenceSchema` (module-private),
  `ninaImagePrefsWriteSchema`, `NinaImagePrefsWriteInput`, `ninaImagePrefsResetSchema`,
  `NinaImagePrefsResetInput`
- `tests/admin.imagegen.test.ts`

**Signature changes:**

- `components/admin/AdminNav.tsx` — `LINKS` gains a fourth entry
  `{ href: '/admin/image-generation', label: 'Image Generation', short: 'Images' }`, inserted
  **after** `/admin/personality`; the `<ul>` class becomes
  `mx-auto grid h-28 w-full max-w-[470px] grid-cols-3 grid-rows-2 lg:mx-0 lg:block lg:h-auto lg:max-w-none lg:space-y-1`
  (was `... grid h-14 ... grid-cols-5 ...`). The `lg` sidebar is byte-identical.
- `app/admin/layout.tsx` — `pb-[calc(5rem+var(--safe-bottom))]` -> `pb-[calc(8rem+var(--safe-bottom))]`.
  The `lg:pb-8` beside it is unchanged.
- `app/admin/page.tsx` — one more read in the existing `Promise.all`, one more `<Card>`.
- `tests/admin.shell.test.ts` — the nav href list, the `short:` count, and the whole
  `the bar and the padding that clears it` describe.

**Requires (from earlier phases):**

- **Phase 1** — `lib/nina/imageprefs.ts` (zero-import) exporting the vocabulary and the bounds, and
  `readNinaImagePrefs` / `writeNinaImagePrefs` / `listNinaPhotoReferences` in `lib/nina/queries.ts`.
  The exact shape this phase codes against is spelled out under **Assumptions**; every name is
  imported at exactly three sites (`lib/admin/schema.ts`, `lib/admin/imageGenModel.ts`,
  `components/admin/ImageGenPanel.tsx`), and the field-name knowledge is confined to
  `toImageGenDraft` / `toImagePrefsWrite`.
- **Phase 2** — `buildNinaImagePrompt` accepts an additional optional `prefs` member.
  Assumed signature under **Assumptions**. This phase does not edit `lib/nina/imagegen.ts`.

**Leaves alone (owned by others):**

- `components/admin/PhotoReferencePicker.tsx`, `components/admin/photoReferenceModel.ts` (Phase 5)
- `lib/nina/imagetest.ts`, `components/admin/ImageGenTestPanel.tsx`, and the `maxDuration` on
  `app/admin/image-generation/page.tsx` (Phase 6)
- `components/admin/CharacterPanel.tsx`, `lib/admin/tuningModel.ts`, `lib/admin/tuningActions.ts`,
  `app/admin/personality/page.tsx`, `ninaTuningWriteSchema`, `lib/nina/tuning.ts` (Phase 7)
- `lib/nina/*` in its entirety (Phases 1-3), `lib/db/schema.ts`, `drizzle/*`
- `scripts/check-llm-payload-boundary.mjs` — its own header says no other phase edits it, and
  nothing here is a model call, so no entry is needed.

---

## Files

| File | Action | What changes |
|---|---|---|
| `lib/admin/imageGenModel.ts` | create | the draft type, the two adaptation-seam mappers' read half, the copy accessors, the preview scene |
| `lib/admin/schema.ts` | modify (append after `:481`) | `ninaImagePrefsWriteSchema` + `ninaImagePrefsResetSchema`, every bound imported |
| `lib/admin/imageGenActions.ts` | create | `saveNinaImagePrefsAction`, `resetNinaImagePrefsAction`, and nothing else |
| `components/admin/ImageGenPanel.tsx` | create | the slider, six checkboxes, four fields, the reference row, the preview, two seams, one save |
| `app/admin/image-generation/page.tsx` | create | `requireAdmin()` first, three reads, the pure preview |
| `components/admin/AdminNav.tsx` | modify (`:59-87` `LINKS`, `:121` the `<ul>` class) | the sixth cell and the 3x2 phone grid |
| `app/admin/layout.tsx` | modify (`:109`) | the bottom reserve, paired with the bar's new height |
| `app/admin/page.tsx` | modify (`:36-58` the `Promise.all`, `:155` after the last `<Card>`) | a fifth hub card |
| `tests/admin.imagegen.test.ts` | create | the model, the Zod boundary, and the structural half |
| `tests/admin.shell.test.ts` | modify (`:103-129`, `:158-197`) | six cells, `grid-cols-3 grid-rows-2`, `8rem` |

---

## Assumptions — **RECONCILED. These are no longer assumptions.**

Phase 1's and phase 2's plans are now written and the reconciler has read them. Every shape below is
**phase 1's or phase 2's actual declared contract**, not a guess, and the names phase 4's planner
guessed have been corrected throughout this file. Where the guess was wrong the correction is called
out, because a reader who saw the draft will otherwise think this file drifted.

### A1 — `lib/nina/imageprefs.ts` (Phase 1) — LANDED CONTRACT

```ts
/* §1 — the scale and the five-rung ladder. NOTE THE NAMES: they are PROMPT_LENGTH, not LENGTH. */
export const NINA_IMAGE_PROMPT_LENGTH_MIN = 0
export const NINA_IMAGE_PROMPT_LENGTH_MAX = 100
export const NINA_IMAGE_PROMPT_LENGTH_DEFAULT = 50

export interface NinaPromptLengthRung {
  readonly index: number          // 0-4, the BAND index, which is also the array position
  readonly label: string          // 'Terse' | 'Short' | 'Standard' | 'Detailed' | 'Exhaustive'
  readonly axis: string           // one line of operator copy about what the rung is
  readonly detailSentences: number
}
export const NINA_PROMPT_LENGTH_RUNGS: readonly NinaPromptLengthRung[]
/** Takes a BAND INDEX (0-4), not a 0-100 score. See the note under A1b. */
export function ninaPromptLengthRungFor(bandIndex: unknown): NinaPromptLengthRung
export function coerceNinaImagePromptLength(value: unknown): number
export function clampNinaImageScore(value: unknown, fallback: number): number

/* §2 — the six focus keys, in the user's own order. SHORT keys: they become column names. */
export const NINA_IMAGE_FOCUS_KEYS: readonly ['face', 'skin', 'boobs', 'butt', 'thighs', 'calves']
export type NinaImageFocusKey = (typeof NINA_IMAGE_FOCUS_KEYS)[number]
export function isNinaImageFocusKey(key: string): key is NinaImageFocusKey

export interface NinaImageFocusSpec {
  readonly key: NinaImageFocusKey
  readonly label: string      // 'Face' | 'Skin' | 'Big boobs' | 'Bubble butt' | 'Big thighs' | 'Very long calves'
  readonly userSaid: string   // the user's own fragment, verbatim and lower case
}
export const NINA_IMAGE_FOCUS_SPECS: Readonly<Record<NinaImageFocusKey, NinaImageFocusSpec>>
export const NINA_IMAGE_FOCUS_DEFAULTS: Readonly<Record<NinaImageFocusKey, boolean>>  // all false
export function ninaImageFocusKeysOn(prefs: NinaImagePrefs): NinaImageFocusKey[]

/* §3 — the four text bounds, and their specs */
export const NINA_IMAGE_WARDROBE_MAX = 200
export const NINA_IMAGE_VENUE_MAX = 200
export const NINA_IMAGE_TIME_MAX = 120
export const NINA_IMAGE_NOTES_MAX = 600
export const NINA_IMAGE_TEXT_KEYS: readonly ['wardrobe', 'venue', 'time', 'notes']
export type NinaImageTextKey = (typeof NINA_IMAGE_TEXT_KEYS)[number]
export interface NinaImageTextSpec { /* label, hint, max, … */ }
export const NINA_IMAGE_TEXT_SPECS: Readonly<Record<NinaImageTextKey, NinaImageTextSpec>>
export function coerceNinaImageText(key: NinaImageTextKey, value: unknown): string

/* §4 — the reference. NOTE: `source`, not `kind`. And `id` is `string`, never `null`. */
export const NINA_IMAGE_REFERENCE_SOURCES: readonly ['none', 'album', 'chat']   // `as const`
export type NinaImageReferenceSource = (typeof NINA_IMAGE_REFERENCE_SOURCES)[number]
export const NINA_IMAGE_REFERENCE_ID_MAX = 64
export const NINA_IMAGE_REFERENCE_ID_RE = /^[0-9A-Za-z_-]{1,64}$/
export interface NinaImageReference {
  readonly source: NinaImageReferenceSource
  /** `''` EXACTLY when `source === 'none'`. Otherwise the row's id in that set. */
  readonly id: string
}
export const NINA_IMAGE_REFERENCE_NONE: NinaImageReference   // { source: 'none', id: '' }, frozen
export function coerceNinaImageReference(value: unknown): NinaImageReference

/* §5 — the picker's page */
export const NINA_PHOTO_REF_PAGE_SIZE = 48
export const NINA_PHOTO_REF_SCAN_MAX = 480
export type NinaPhotoRefSource = Exclude<NinaImageReferenceSource, 'none'>
export interface NinaPhotoRef {
  readonly source: NinaPhotoRefSource
  readonly id: string
  readonly blobUrl: string
  readonly thumbUrl: string | null
  readonly width: number | null
  readonly height: number | null
  readonly createdAt: Date
}
export interface NinaPhotoRefPage {
  readonly rows: NinaPhotoRef[]
  readonly total: number
  readonly offset: number
  readonly limit: number
}

/* §6 — the prefs */
export interface NinaImagePrefs {
  readonly promptLength: number
  readonly focus: Readonly<Record<NinaImageFocusKey, boolean>>
  readonly wardrobe: string
  readonly venue: string
  readonly time: string
  readonly notes: string
  readonly reference: NinaImageReference
  readonly revision: number
}
export type NinaImagePrefsWrite = Omit<NinaImagePrefs, 'revision'>
export const NINA_IMAGE_PREFS_DEFAULTS: NinaImagePrefs   // frozen, `promptLength: 50`
export function coerceNinaImagePrefs(input: NinaImagePrefsInput, …): NinaImagePrefs
```

**Four corrections the reconciler made to this file**, each because phase 1 owns the spelling and
phase 1 is the earlier phase (resolution rule 3 — one owner per file region):

| This plan's draft guessed | Phase 1 actually declares |
|---|---|
| `NINA_IMAGE_LENGTH_MIN` / `_MAX`, `NINA_IMAGE_LENGTH_BAND_NAMES`, `ninaImageLengthBand`, `NinaImageLengthBand` | `NINA_IMAGE_PROMPT_LENGTH_MIN` / `_MAX`, `NINA_PROMPT_LENGTH_RUNGS`, `ninaPromptLengthRungFor`, `NinaPromptLengthRung` |
| focus keys `bigBoobs`, `bubbleButt`, `bigThighs`, `veryLongCalves` | `boobs`, `butt`, `thighs`, `calves` — short, because they become the column names `focus_boobs` … |
| `NINA_IMAGE_REFERENCE_KINDS`, and `NinaImageReference { kind: string; id: string \| null }` | `NINA_IMAGE_REFERENCE_SOURCES`, and `NinaImageReference { source; id: string }` where `''` is the empty id |
| `NinaImageFocusSpec { label, axis }` | `NinaImageFocusSpec { key, label, userSaid }` — the copy accessor reads `userSaid`, not `axis` |

### A1b — **`imageGenModel.ts` imports TWO modules, not one, and that is phase 1's instruction**

`ninaPromptLengthRungFor` takes a **band index**, and the band mapping is `ninaBand` in
`lib/nina/tuning.ts:121-124` — which `lib/nina/imageprefs.ts` deliberately does **not** re-declare
(its own header refuses to keep a second copy of the band vocabulary). Phase 1's Handoffs say so
directly: *"It must render the band caption via `ninaPromptLengthRungFor(ninaBand(value).index)` and
never re-derive a band from a score."*

So `lib/admin/imageGenModel.ts` imports from **both** `@/lib/nina/imageprefs` and
`@/lib/nina/tuning`, and the "exactly one import" assertion in `tests/admin.imagegen.test.ts`
becomes **"exactly these two, and both are zero-import `lib/nina` vocabulary modules."** That is
safe for the client bundle for the reason `lib/admin/tuningModel.ts` already relies on: it imports
`@/lib/nina/tuning` today, and `tuning.ts` is the zero-import precedent `imageprefs.ts` was written
from. Re-deriving the five band boundaries locally is forbidden — a private scale is a slider the
operator cannot predict, and the index settled that the scale is the repo's five bands.

### A2 — `lib/nina/queries.ts` (Phase 1) — LANDED CONTRACT

```ts
export async function readNinaImagePrefs(userId: string): Promise<NinaImagePrefs>
export async function writeNinaImagePrefs(
  userId: string,
  prefs: NinaImagePrefsWrite,
): Promise<NinaImagePrefs>

/**
 * The picker union, newest first, one bounded page. Album rows and `kind='generated'` chat rows,
 * and **no reference rows** — plan invariant 13.
 */
export async function listNinaPhotoReferences(
  userId: string,
  opts?: { limit?: number; offset?: number },
): Promise<NinaPhotoRefPage>

/** The stored `{ source, id }` resolved to a photograph, or `null`. Phase 6's bridge. */
export async function resolveNinaPhotoReference(
  userId: string,
  reference: NinaImageReference,
): Promise<NinaPhotoRef | null>
```

**Correction: the union read is `listNinaPhotoReferences`, not `listNinaImageReferences`, and it
returns a `NinaPhotoRefPage` rather than an array.** So `app/admin/image-generation/page.tsx` reads
`const photos = await listNinaPhotoReferences(userId)` and passes **two** props to the panel:
`references={photos.rows.map(toImageReferenceOption)}` and `photoTotal={photos.total}`. The second
one is what phase 5's footer needs in order to say *"Showing 48 of 142"* truthfully, and it is on
this phase's prop list because phase 5 does not edit the prop list.

`writeNinaImagePrefs` returns the whole stored row including the bumped `revision`, exactly as
`writeNinaTuning` does. `NinaPhotoRef.thumbUrl` is `null` for **every** chat row, because
`nina_message_images` has no `thumb_url` column (`lib/db/schema.ts:1057-1131`) while `nina_avatars`
does (`:1531`).
### A3 — `buildNinaImagePrompt` (Phase 2)

```ts
export function buildNinaImagePrompt(input: {
  purpose: NinaImagePurpose
  scene: string
  mood?: string | null
  tuning?: NinaTuning | null
  /** Phase 2's new member. */
  prefs?: NinaImagePrefs | null
}): string
```

Additive: today's four members keep their names and meanings (`lib/nina/imagegen.ts:127-133`).
`app/admin/image-generation/page.tsx` is the only site in this phase that calls it. The page reads
the tuning **as well as** the prefs, because `ninaPhotoPresence` still reads `steamy` / `flirty`
off the tuning (`lib/nina/imagegen.ts:93`) and a preview missing that is a preview that lies.

### A4 — Phase 7 has not run

`nina_tuning.wardrobe` still exists, `CharacterPanel` still renders it, and
`/admin/personality`'s header still says "the wardrobe the camera reads". Nothing in this phase
touches any of it, and the tree builds with two wardrobe fields on two routes. That is the state
phase 7 is written to resolve.

---

## Implementation Steps

### Step 1: `lib/admin/imageGenModel.ts`

**File:** `lib/admin/imageGenModel.ts` (new)
**Change:** The client-safe half of the surface: the draft type, the read-side adaptation seam, the
copy accessors, and the one scene the preview stands in with. Its only import is phase 1's
zero-import module — `lib/admin/tuningModel.ts:20-28`'s rule, and a test asserts it.

**Code:**

```ts
import {
  NINA_IMAGE_FOCUS_KEYS,
  NINA_IMAGE_FOCUS_SPECS,
  ninaPromptLengthRungFor,
  type NinaImagePrefs,
} from '@/lib/nina/imageprefs'

/**
 * `/admin/image-generation`'s panel, as data and pure functions — the client-safe half.
 *
 * ── WHY THIS FILE EXISTS AT ALL ──────────────────────────────────────────────────────────────
 * `lib/admin/tuningModel.ts`'s reasoning, one feature over and unchanged: `app/admin/page.tsx` and
 * `app/admin/image-generation/page.tsx` are Server Components and `components/admin/ImageGenPanel.tsx`
 * is `'use client'`. A Server Component cannot read a plain export out of a `'use client'` module,
 * so the copy and the diffing cannot live in the panel.
 *
 * **This file imports exactly one module, `@/lib/nina/imageprefs`, and `tests/admin.imagegen.test.ts`
 * asserts that.** Values as well as types, because the labels, the hints and the bounds all come
 * from there — safe, and checked, precisely because phase 1's module has zero imports of its own.
 *
 * ── THE READ-SIDE ADAPTATION SEAM ────────────────────────────────────────────────────────────
 * `toImageGenDraft` is ONE of exactly TWO functions in this phase that know phase 1's field names
 * (`lib/admin/imageGenActions.ts`'s `toImagePrefsWrite` is the other). Everything above the seam
 * works in `ImageGenDraft`, whose focus map is a plain `Record<string, boolean>` and whose
 * reference `kind` is a plain `string` — so if phase 1 named or grouped its fields differently, two
 * small functions change and no component does.
 *
 * ── EVERY LABEL, HINT AND BOUND IS PHASE 1'S ─────────────────────────────────────────────────
 * There is no copy table in this file, for `tuningModel.ts`'s three recorded reasons, and the
 * third is the one that decides it here: **the six focus options are the user's own words** — face,
 * skin, big boobs, bubble butt, big thighs, very long calves. They are prompt text, not copy. They
 * live in `NINA_IMAGE_FOCUS_SPECS[key].label`, the prompt composes from the same specs, and this
 * file only reads them, so the panel cannot promise an emphasis the prompt does not add. A label
 * typed into the JSX would be a second source of truth for a vocabulary the user dictated.
 *
 * What IS local is genuinely local: `LENGTH_BAND_NOTE` below is editorial about the SURFACE
 * ("read the assembled prompt underneath") and makes no claim about what a rung adds, which is
 * phase 2's business and is visible in the preview rather than described here.
 */

/** What a browser edits: phase 1's row, minus the revision the database mints. */
export interface ImageGenDraft {
  /** R4. 0-100 on phase 1's scale, read through its five bands. */
  promptLength: number
  /**
   * R5, keyed by `NINA_IMAGE_FOCUS_KEYS`. `Record<string, boolean>` rather than the key union for
   * the same reason `TuningDraft.enabled` is loose: this is the adaptation seam, and a component
   * that reads `draft.focus[key] ?? false` survives a key the model has and the panel has not
   * caught up with.
   *
   * **Absent means OFF here, and that is the opposite of `TuningDraft.enabled`.** The difference is
   * deliberate and it is R1's: a focus option adds an EMPHASIS clause on top of a body canon that
   * ships unconditionally, so an unknown key defaulting to "on" would add emphasis nobody asked
   * for, whereas an unknown tuning parameter defaulting to "off" would silently delete text.
   */
  focus: Record<string, boolean>
  /** R6. */
  wardrobe: string
  /** R7. */
  venue: string
  /** R8. */
  time: string
  /** R9. */
  notes: string
  /**
   * R10's selection, persisted by THIS phase's save so that phase 5 only has to supply the grid.
   *
   * **`source`, not `kind`, and `id` is `string` with `''` as the one empty value** — phase 1's
   * `NinaImageReference` exactly (`lib/nina/imageprefs.ts` §4). `''`-is-empty rather than `null` is
   * `nina_tuning.wardrobe`'s convention and `nina_image_prefs` is that table's sibling.
   * `source` is loose (`string`) for the same seam reason as everything else here;
   * `ninaImagePrefsWriteSchema` narrows it to `NINA_IMAGE_REFERENCE_SOURCES` at the boundary.
   */
  reference: { source: string; id: string }
}

/** One control's user-facing text. The label goes beside the control; the hint goes under it. */
export interface ImageGenCopy {
  label: string
  hint: string
  /**
   * The band name for a slider's current value, `''` for a control that has no scale.
   *
   * It is a MEMBER and not something a caller digs out of `hint` with a `split('.')`, because two
   * surfaces read it — the slider's hint here and `/admin`'s hub card — and string surgery on a
   * sentence one of them owns is the kind of coupling that breaks when the sentence is reworded.
   */
  band: string
}

/**
 * "Nothing selected", spelled ONCE.
 *
 * This is the only string literal in the whole phase that names a member of phase 1's
 * `NINA_IMAGE_REFERENCE_SOURCES`, and `tests/admin.imagegen.test.ts` asserts that phase 1 still
 * declares it — so a rename over there fails a test here instead of silently producing a reference
 * kind the Zod boundary rejects at save time.
 */
export const IMAGE_REFERENCE_NONE: ImageGenDraft['reference'] = { source: 'none', id: '' }

/**
 * The `SCENE:` line the PREVIEW and the test dispatch stand in with.
 *
 * The prefs are the operator's standing opinion about how she is photographed; the SCENE is still
 * hers per photograph, chosen by the chat model's `generate_image` argument (the plan's Scope keeps
 * `scene` and `mood` on that tool for exactly this reason). So the operator has not chosen one, and
 * the preview needs one, because `buildNinaImagePrompt` takes a scene and this phase calls the REAL
 * assembler rather than a reconstruction of it.
 *
 * Three candidates, and the choice matters because whatever goes here is what the operator judges
 * the prompt by:
 *
 *   `''`                     — REJECTED. Phase 2's assembler emits `SCENE: ` with nothing after it,
 *                              which is a malformed line the real path never produces, so the
 *                              preview would be unrepresentative in exactly the place it is meant
 *                              to be authoritative.
 *   the venue pref           — REJECTED. The venue already has its own `VENUE:` block. Splicing it
 *                              into the scene as well would double it and make the preview show a
 *                              prompt no real generation sends.
 *   a plain literal          — CHOSEN. One neutral sentence, deliberately saying nothing about
 *                              where or when she is, so that every word the operator reads under
 *                              `VENUE:`, `TIME:` and `NOTES:` came from a field he filled in.
 *
 * **Phase 6's test dispatch must send this same constant**, or the verdict it reports would be a
 * verdict on a prompt the operator never read. It is exported for that.
 */
export const ADMIN_IMAGE_PREVIEW_SCENE = 'a phone photograph she is taking of herself right now'

/**
 * What the reference grid needs per photograph, and **nothing more.**
 *
 * There is no `createdAt` and no filename here on purpose. R10 is *"a simple photos grid without
 * any captions (just like ios album app)"*, and phase 5's exit criterion is *"no caption, no
 * filename and no date on any tile"*. A field that is not serialized to the client cannot be
 * rendered onto a tile by a later edit, so the requirement holds by construction rather than by
 * review. Ordering is the query's (newest first) and is carried by array position.
 *
 * ── THREE FIELDS, AND THE SET IS NOT ONE OF THEM ─────────────────────────────────────────────
 * **RECONCILED against phase 5.** This type is deliberately made *structurally identical* to phase
 * 5's `PhotoReferenceItem` — `{ key, url, thumbUrl }` and nothing else — so phase 5's mount is
 * `items={references}` and typechecks **without this phase importing from phase 5's file**, which
 * it cannot do: phase 5 lands after this one and the module would not exist.
 *
 * There is no `kind` and no `source` on the tile, and that is phase 5's exit criterion held
 * structurally rather than by discipline: *nothing in the grid announces which set a photograph
 * came from*. A tile that has no `source` **cannot** render a set badge. Phase 5's test asserts the
 * field list is exactly `['key', 'thumbUrl', 'url']`, so this shape is load-bearing on both sides.
 *
 * The set survives inside `key`, which is `` `${source}:${id}` `` — enough to address the row for a
 * save, and opaque to the component, which never parses it.
 */
export interface ImageReferenceOption {
  /** `referenceKey(...)` of this photograph. The exact string the save persists. */
  key: string
  url: string
  /** `null` for a chat photograph — `nina_message_images` has no `thumb_url` column. */
  thumbUrl: string | null
}

/**
 * Phase 1's `NinaPhotoRef` -> what a browser can hold. Structural in its parameter, so the row
 * type's *name* does not matter; only these four members do.
 *
 * Note `blobUrl`, not `url`: that is `NinaPhotoRef`'s spelling (phase 1 §5).
 */
export function toImageReferenceOption(row: {
  source: string
  id: string
  blobUrl: string
  thumbUrl?: string | null
}): ImageReferenceOption {
  return {
    key: referenceKey({ source: row.source, id: row.id }),
    url: row.blobUrl,
    thumbUrl: row.thumbUrl ?? null,
  }
}

/**
 * A stable identity for one photograph across the two tables. React keys, equality, and the
 * picker's `value`/`onChange` currency.
 *
 * **`''` for no reference**, which is phase 5's `PHOTO_REFERENCE_NONE` and phase 1's
 * `NINA_IMAGE_REFERENCE_NONE` agreeing on one empty value.
 */
export function referenceKey(reference: { source: string; id: string }): string {
  if (reference.source === IMAGE_REFERENCE_NONE.source || reference.id === '') return ''
  return `${reference.source}:${reference.id}`
}

/**
 * The other direction — **the second half of the adaptation seam, and the reason phase 5 never has
 * to know what a reference is.**
 *
 * The picker hands back an opaque `string`; this turns it into the `{ source, id }` the draft and
 * the Zod boundary want. It is total and never throws: anything it cannot read is no reference at
 * all, because a half-selection is not representable (phase 1's `coerceNinaImageReference` makes
 * the same choice at the store, and this is the client-side mirror of it, not a second authority).
 *
 * `indexOf` rather than `split(':')`: an id containing a colon would make `split` produce three
 * parts and drop the tail, whereas the first colon is unambiguously the separator.
 * `NINA_IMAGE_REFERENCE_ID_RE` forbids a colon in an id anyway, so this is belt and braces on a
 * string that arrives from a component.
 */
export function parseReferenceKey(key: string): ImageGenDraft['reference'] {
  const cut = key.indexOf(':')
  if (cut <= 0) return IMAGE_REFERENCE_NONE
  const source = key.slice(0, cut)
  const id = key.slice(cut + 1)
  if (id === '' || source === IMAGE_REFERENCE_NONE.source) return IMAGE_REFERENCE_NONE
  if (!(NINA_IMAGE_REFERENCE_SOURCES as readonly string[]).includes(source)) {
    return IMAGE_REFERENCE_NONE
  }
  return { source, id }
}

/**
 * Phase 1's row -> what a browser edits. **Adaptation seam, half one of two.**
 *
 * The focus record is COPIED rather than aliased, and so is the reference: the panel holds the
 * result in `useState` and mutates a draft off it, so sharing an object with a prop would make
 * "unsaved" undetectable — and `NINA_IMAGE_PREFS_DEFAULTS` is frozen, so a draft spread off the
 * singleton would throw on the first checkbox.
 */
export function toImageGenDraft(prefs: NinaImagePrefs): ImageGenDraft {
  return {
    promptLength: prefs.promptLength,
    focus: { ...prefs.focus },
    wardrobe: prefs.wardrobe,
    venue: prefs.venue,
    time: prefs.time,
    notes: prefs.notes,
    reference: { source: prefs.reference.source, id: prefs.reference.id },
  }
}

/** Which of the six the operator has switched on, in phase 1's declared order. */
export function focusOnKeys(draft: ImageGenDraft): string[] {
  return NINA_IMAGE_FOCUS_KEYS.filter((key) => draft.focus[key] === true)
}

/** `big_boobs` -> `Big boobs`. The last resort when a key has no spec of its own. */
export function prettifyFocusKey(key: string): string {
  const words = key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/[_\-\s]+/)
    .filter((word) => word.length > 0)
    .map((word) => word.toLowerCase())
  if (words.length === 0) return key
  /* `charAt` rather than `word[0]`: `noUncheckedIndexedAccess` types the index access as
   * `string | undefined` even behind the `length > 0` filter above, and `charAt` is total. */
  const first = words[0] ?? ''
  return [first.charAt(0).toUpperCase() + first.slice(1), ...words.slice(1)].join(' ')
}

/** Whether a key is one phase 1 actually declares. The test reads this. */
export function hasImageFocusCopy(key: string): boolean {
  return (NINA_IMAGE_FOCUS_KEYS as readonly string[]).includes(key)
}

/**
 * Copy for one of the six focus options, **read off phase 1's specs.**
 *
 * The fallback exists so a running page degrades to a readable label rather than crashing on a key
 * phase 1 adds, and `tests/admin.imagegen.test.ts` fails on any key in `NINA_IMAGE_FOCUS_KEYS`
 * that reaches it — the net is for a running page, never a licence to ship an unlabelled checkbox.
 */
export function imageFocusCopy(key: string): ImageGenCopy {
  if (hasImageFocusCopy(key)) {
    const spec = NINA_IMAGE_FOCUS_SPECS[key as keyof typeof NINA_IMAGE_FOCUS_SPECS]
    /* `userSaid`, not `axis` — phase 1's `NinaImageFocusSpec` is `{ key, label, userSaid }`, and
     * `userSaid` is the user's own fragment verbatim and lower case ("big boobs", "bubble butt").
     * Rendering it as the hint is the honest thing: the checkbox promises exactly the words the
     * prompt will emphasise, and nothing in this file may rephrase them (phase 1's own rule). */
    return { label: spec.label, hint: spec.userSaid, band: '' }
  }
  return { label: prettifyFocusKey(key), hint: '', band: '' }
}

/**
 * What the operator reads beside the length slider.
 *
 * The RUNG is phase 1's (`ninaPromptLengthRungFor(ninaBand(value).index)`), because the whole point of putting the slider
 * on the repo's existing five-band scale was that the operator can predict it — `/admin`'s other
 * sliders are read in bands and a private scale would be a control nobody can report back.
 *
 * The note is this file's own and is deliberately editorial about the SURFACE rather than
 * descriptive of the prompt. A sentence here claiming what a rung adds would be a promise phase 2
 * has to keep forever, and a stale one is the panel lying about text the operator can already read:
 * the assembled prompt is rendered a few centimetres below the slider, from the same assembler the
 * camera is handed, so the honest hint points at it.
 */
const LENGTH_BAND_NOTE = 'The assembled prompt below is what this rung actually produces.'

export function promptLengthCopy(value: number): ImageGenCopy {
  /* PHASE 1'S HANDOFF, VERBATIM: "It must render the band caption via
   * `ninaPromptLengthRungFor(ninaBand(value).index)` and never re-derive a band from a score."
   * `ninaBand` comes from `@/lib/nina/tuning` — the second of this file's two imports (A1b), and
   * the reason `imageprefs.ts` does not carry a private copy of the five band boundaries. */
  const rung = ninaPromptLengthRungFor(ninaBand(value).index)
  return {
    label: 'Prompt length',
    hint: `${rung.label}. ${rung.axis} ${LENGTH_BAND_NOTE}`,
    band: rung.label,
  }
}

/**
 * Which fields differ, as stable dotted paths (`promptLength`, `wardrobe`, `venue`, `time`,
 * `notes`, `reference`, `focus.boobs`).
 *
 * One function serves three jobs, which is why it returns names instead of a boolean: the header
 * counts them, each control asks whether its own path is in the set, and `imageGenDraftEquals` is
 * `length === 0`. `focus.*` is appended LAST, after the scalars, so R5's paths are visibly a group —
 * `changedTuningFields` puts `enabled.*` last for the same reason.
 *
 * The focus key union is taken from BOTH sides, so a key present in one and absent in the other
 * counts as a difference rather than being silently skipped. `?? false` on both sides, because
 * absent means OFF in this feature (see `ImageGenDraft.focus`).
 *
 * The reference is ONE path and not two. The operator picks a photograph, not a table name, so two
 * dots on one row would be him wondering which of two identical marks meant what.
 */
export function changedImageGenFields(next: ImageGenDraft, saved: ImageGenDraft): string[] {
  const changed: string[] = []

  if (next.promptLength !== saved.promptLength) changed.push('promptLength')
  if (next.wardrobe !== saved.wardrobe) changed.push('wardrobe')
  if (next.venue !== saved.venue) changed.push('venue')
  if (next.time !== saved.time) changed.push('time')
  if (next.notes !== saved.notes) changed.push('notes')
  if (referenceKey(next.reference) !== referenceKey(saved.reference)) changed.push('reference')

  for (const key of Object.keys({ ...saved.focus, ...next.focus }).sort()) {
    if ((next.focus[key] ?? false) !== (saved.focus[key] ?? false)) changed.push(`focus.${key}`)
  }

  return changed
}

export function imageGenDraftEquals(a: ImageGenDraft, b: ImageGenDraft): boolean {
  return changedImageGenFields(a, b).length === 0
}
```

**Impact:** New module, no caller yet. Client-safe: no `server-only`, no `@/lib/db`, no drizzle
type and no Zod schema crosses into it (invariant 9).

---

### Step 2: the prefs Zod boundary, appended to `lib/admin/schema.ts`

**File:** `lib/admin/schema.ts` — a new import block after the existing `@/lib/nina/tuning` block
(`:29-38`), and a new section appended after `ninaTuningResetSchema` (`:481`, end of file)
**Change:** One whole-prefs write schema and one reset schema, with **every** bound imported from
`lib/nina/imageprefs.ts`. Nothing above the append point changes except the added import block.

**Code — the import block, inserted immediately after the existing `@/lib/nina/tuning` import
(after line 38):**

```ts
import {
  NINA_IMAGE_FOCUS_KEYS,
  NINA_IMAGE_PROMPT_LENGTH_MAX,
  NINA_IMAGE_PROMPT_LENGTH_MIN,
  NINA_IMAGE_NOTES_MAX,
  NINA_IMAGE_REFERENCE_ID_MAX,
  NINA_IMAGE_REFERENCE_SOURCES,
  NINA_IMAGE_TIME_MAX,
  NINA_IMAGE_VENUE_MAX,
  NINA_IMAGE_WARDROBE_MAX,
} from '@/lib/nina/imageprefs'
```

**Code — appended at the end of the file:**

```ts
/* ============================================================================
 * nina-image-generation-tab phase 4 — ONE whole-prefs write.
 * Appended; nothing above this line changed.
 * ==========================================================================*/

/**
 * What `/admin/image-generation`'s panel may write. R4 through R9 — and R10's *selection* — arrive
 * as **one object**, and that is plan invariant 7 rather than a preference.
 *
 * ── ONE SAVE, NOT ELEVEN ────────────────────────────────────────────────────────────────────
 * A slider, six checkboxes, four text fields and a photograph is eleven controls. Next dispatches
 * Server Actions ONE AT A TIME PER CLIENT — the fact `avatarBatchRegisterSchema` above is built
 * around and `ninaTuningWriteSchema` restates — so eleven actions is not a design, it is a stall.
 * The whole prefs object is well under a kilobyte against a 1 MB action body cap
 * (`next.config.ts` sets no `serverActions.bodySizeLimit`), so there is nothing to batch and
 * nothing to chunk: it is one write of one row.
 *
 * ── TWO LAYERS OF BOUNDS, THE SAME DIVISION AS `cropWriteSchema` ────────────────────────────
 * This schema enforces the SHAPE — an integer inside phase 1's advertised range, a focus key that
 * exists, strings under a length that cannot crowd out the canon they sit beside, a reference whose
 * kind and id agree. Phase 1's coercion (inside `writeNinaImagePrefs`) is what GUARANTEES the
 * range, because it is on every path into the row and this schema is only on the path from a
 * browser.
 *
 * ── STRICT, AND THEREFORE REFUSE-DON'T-REPAIR ───────────────────────────────────────────────
 * `z.strictObject` on the focus map, so an unknown or misspelled focus key FAILS rather than being
 * silently stripped — `ninaTuningWriteSchema`'s argument verbatim: a stripped `bigThighss` would
 * save five options and report success, and the operator would watch one checkbox refuse to take.
 *
 * Every bound is IMPORTED. `lib/admin/avatars.ts`'s rule holds here too: *"a constant that is
 * agreed rather than shared is a constant that will one day disagree."*
 */
const promptLengthSchema = z
  .number()
  .int()
  .min(NINA_IMAGE_PROMPT_LENGTH_MIN)
  .max(NINA_IMAGE_PROMPT_LENGTH_MAX)

/** R5's option. A boolean and nothing else — no `"true"`, no `1`. The browser we wrote sends one. */
const focusValueSchema = z.boolean()

/**
 * One `focusValueSchema` per key phase 1 declares, built from the array rather than spelled out.
 * Spelling the six keys here would put the user's own vocabulary in a second place, and a seventh
 * option would then pass typecheck and fail validation.
 */
function focusShape<K extends string>(keys: readonly K[]): Record<K, typeof focusValueSchema> {
  const shape = {} as Record<K, typeof focusValueSchema>
  for (const key of keys) shape[key] = focusValueSchema
  return shape
}

/**
 * R10's selection as the row holds it: a table discriminator and an id.
 *
 * The `refine` is the whole value of this schema and it refuses exactly the two shapes that would
 * fail invisibly: `{ source: 'album', id: '' }`, which is a reference that names a set and no
 * photograph, and `{ source: 'none', id: 'av_1' }`, which is an unselected reference still carrying
 * one. Either would round-trip through the panel looking fine and then hand phase 6 a job it cannot
 * anchor. The URL is deliberately NOT stored — a Blob URL can be re-minted, and the id is what
 * survives it.
 */
const ninaImageReferenceSchema = z
  .object({
    source: z.enum(NINA_IMAGE_REFERENCE_SOURCES),
    id: z.string().trim().min(1).max(NINA_IMAGE_REFERENCE_ID_MAX).nullable(),
  })
  .refine(
    /* `''` is the empty id, not `null` — phase 1's `NinaImageReference.id` is `string`. */
    (reference) => (reference.id === '') === (reference.source === 'none'),
    'A reference names a photograph, or it names nothing at all',
  )

export const ninaImagePrefsWriteSchema = z.object({
  userId: userIdSchema,
  /** R4. */
  promptLength: promptLengthSchema,
  /**
   * R5. `strictObject` like the tuning's toggles and for the same reason. Every key is REQUIRED —
   * the panel always sends a complete map, and an absent key here would be an ambiguity between
   * "off" and "the client is old".
   */
  focus: z.strictObject(focusShape(NINA_IMAGE_FOCUS_KEYS)),
  /** R6. Empty is valid and means "the anchor outfit". */
  wardrobe: z.string().trim().max(NINA_IMAGE_WARDROBE_MAX),
  /** R7. Empty is valid and means "wherever the scene puts her". */
  venue: z.string().trim().max(NINA_IMAGE_VENUE_MAX),
  /** R8. Empty is valid. */
  time: z.string().trim().max(NINA_IMAGE_TIME_MAX),
  /** R9. Empty is valid. Free text, handed to the camera verbatim. */
  notes: z.string().trim().max(NINA_IMAGE_NOTES_MAX),
  /** R10's selection. Phase 5 supplies the grid; the round trip is already here. */
  reference: ninaImageReferenceSchema,
})
export type NinaImagePrefsWriteInput = z.infer<typeof ninaImagePrefsWriteSchema>

/**
 * The reset takes no prefs at all — deliberately, for `ninaTuningResetSchema`'s reason: the
 * defaults it writes are phase 1's module constant, so accepting them from the client would be
 * accepting a client's opinion of what "default" means.
 */
export const ninaImagePrefsResetSchema = z.object({
  userId: userIdSchema,
})
export type NinaImagePrefsResetInput = z.infer<typeof ninaImagePrefsResetSchema>
```

**Impact:** `lib/admin/schema.ts` gains one import block and one section. No existing export
changes. `'none'` appears once here, inside the `refine`, and is checked against
`NINA_IMAGE_REFERENCE_SOURCES` by `z.enum` on the line above it and by a test in step 9.

---

### Step 3: `lib/admin/imageGenActions.ts`

**File:** `lib/admin/imageGenActions.ts` (new)
**Change:** Exactly two Server Actions — save and reset. Phase 6 appends the third.

**Code:**

```ts
'use server'

import { revalidatePath } from 'next/cache'

import { requireAdmin } from '@/lib/admin/requireAdmin'
import {
  ninaImagePrefsResetSchema,
  ninaImagePrefsWriteSchema,
  type NinaImagePrefsWriteInput,
} from '@/lib/admin/schema'
import { NINA_IMAGE_PREFS_DEFAULTS, type NinaImagePrefsWrite } from '@/lib/nina/imageprefs'
import { writeNinaImagePrefs } from '@/lib/nina/queries'

/**
 * `/admin/image-generation`'s panel, write side — R4 through R9, and R10's selection.
 *
 * Both actions follow `lib/admin/tuningActions.ts`'s four lines, in this order and for these
 * reasons:
 *
 *   1. `await requireAdmin()`   — FIRST, above any use of an argument. A Server Action is a POST
 *                                 endpoint whether or not a button exists, and `proxy.ts` matches
 *                                 neither `/admin` nor `/api/*` (`lib/admin/requireAdmin.ts:13-16`),
 *                                 so this call is the only gate on this endpoint. Plan invariant 6.
 *   2. Zod                      — every field, every time. The client is not a source of truth.
 *   3. the write                — one row, through phase 1's `writeNinaImagePrefs`, which owns the
 *                                 clamp and the revision bump.
 *   4. `revalidatePath`         — re-renders THIS page, so the panel and the prompt preview show
 *                                 the row that was just written.
 *
 * ── `revalidatePath` IS NOT HOW THE EDIT REACHES THE CAMERA ─────────────────────────────────
 * `tuningActions.ts` records this about the tuning and it holds verbatim for the prefs: there is no
 * cache anywhere on the image path, so a committed row is in the next generation's prompt with no
 * invalidation step at all. The revalidation is for the PREVIEW, which is server-assembled from the
 * saved row and would otherwise show the pre-save prompt beside a "saved as revision 5" line.
 *
 * ── ONE SAVE, NOT ELEVEN ────────────────────────────────────────────────────────────────────
 * Plan invariant 7, and `ninaImagePrefsWriteSchema`'s docstring has the mechanism. There are
 * exactly two exported functions in this file today and `tests/admin.imagegen.test.ts` asserts the
 * count, because "add one action per field" is the obvious-looking change that would reintroduce
 * the stall.
 *
 * **Phase 6 appends the test-prompt action to this file and raises that asserted count to three.**
 * It is a deliberate speed bump: the count is what makes a per-field action an explicit decision
 * somebody has to write down, and phase 6's addition is a different KIND of action — it spends
 * money — rather than one more field.
 *
 * ── A RESULT OBJECT, NEVER A THROW ──────────────────────────────────────────────────────────
 * The panel is a `useTransition` client with plain-argument actions. A throw from a Server Action
 * reaches the browser as an opaque digest; a sentence reaches the operator.
 */

export interface AdminImageGenResult {
  ok: boolean
  error?: string
  /** One sentence about what was written. */
  note?: string
  /** The revision the row now carries, so the panel can name it without a refetch. */
  revision?: number
}

/** Every action's catch-all. A stack trace goes to the log; a sentence goes to the admin. */
function failed(where: string, cause: unknown): AdminImageGenResult {
  console.error(`[imgn] admin image prefs ${where} failed`, cause)
  return { ok: false, error: 'The write failed and nothing was changed. Try again.' }
}

/**
 * The validated payload -> phase 1's write shape. **Adaptation seam, half two of two**
 * (`lib/admin/imageGenModel.ts`'s `toImageGenDraft` is half one).
 *
 * It reads like a no-op and is not: the fields are picked EXPLICITLY so that `userId` cannot ride
 * into the row, and so that a change to phase 1's field names is a compiler error in one function
 * instead of a silently dropped control. If phase 1 landed the reference as two flat members
 * (`referenceKind` / `referenceId`), THIS is the function that un-groups it and the only one.
 *
 * `NinaImagePrefsWrite` is IMPORTED rather than re-declared as a local `Omit<NinaImagePrefs,
 * 'revision'>`, for `toTuningWrite`'s reason: *"a constant that is agreed rather than shared is a
 * constant that will one day disagree."*
 */
function toImagePrefsWrite(input: NinaImagePrefsWriteInput): NinaImagePrefsWrite {
  return {
    promptLength: input.promptLength,
    focus: input.focus,
    wardrobe: input.wardrobe,
    venue: input.venue,
    time: input.time,
    notes: input.notes,
    reference: { source: input.reference.source, id: input.reference.id },
  }
}

/**
 * Save the whole prefs row. One action, one row, one revision bump.
 *
 * The argument types are deliberately loose (`Record<string, boolean>`, `source: string`) and Zod
 * does the narrowing, which is `saveNinaTuningAction`'s convention: a Server Action's declared
 * parameter type is a comment as far as the runtime is concerned, so the schema has to be the
 * check, and pretending otherwise at the signature invites a caller to skip it.
 */
export async function saveNinaImagePrefsAction(input: {
  userId: string
  promptLength: number
  focus: Record<string, boolean>
  wardrobe: string
  venue: string
  time: string
  notes: string
  reference: { source: string; id: string }
}): Promise<AdminImageGenResult> {
  await requireAdmin()

  const parsed = ninaImagePrefsWriteSchema.safeParse(input)
  if (!parsed.success) {
    return {
      ok: false,
      error: 'That is not a set of image parameters this panel can save, so nothing was written.',
    }
  }

  try {
    /* `writeNinaImagePrefs` returns the whole stored row, already coerced, so reading the revision
     * off it is reading the truth rather than a hope — `writeNinaTuning`'s landed contract. */
    const { revision } = await writeNinaImagePrefs(parsed.data.userId, toImagePrefsWrite(parsed.data))
    revalidatePath('/admin/image-generation')
    return {
      ok: true,
      revision,
      note: `Saved as revision ${revision}. The next photograph she takes is assembled from it — there is no cache on the image path.`,
    }
  } catch (cause) {
    return failed('save', cause)
  }
}

/**
 * Reset every image parameter to `NINA_IMAGE_PREFS_DEFAULTS`.
 *
 * It **writes** the defaults rather than deleting the row, and so it bumps the revision like any
 * other save. That is the honest record, for `resetNinaTuningAction`'s reason: a reset is a thing
 * that happened at a revision, not a hole where one used to be.
 *
 * The defaults do NOT go through Zod. They are phase 1's module constant, not client input, and
 * validating a constant against a schema derived from the same module would only assert that phase
 * 1 agrees with itself. The focus record and the reference ARE copied, though —
 * `NINA_IMAGE_PREFS_DEFAULTS` is frozen, and `writeNinaImagePrefs` should never be handed the
 * singleton itself.
 *
 * **Reset clears the photo reference.** R1's body canon is unconditional, so a defaulted row still
 * produces a prompt naming the body; a defaulted row that kept pointing at a photograph would be a
 * "reset" that left the single most influential input in place.
 */
export async function resetNinaImagePrefsAction(input: {
  userId: string
}): Promise<AdminImageGenResult> {
  await requireAdmin()

  const parsed = ninaImagePrefsResetSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: 'That is not an account this panel can reset.' }
  }

  const defaults: NinaImagePrefsWrite = {
    promptLength: NINA_IMAGE_PREFS_DEFAULTS.promptLength,
    focus: { ...NINA_IMAGE_PREFS_DEFAULTS.focus },
    wardrobe: NINA_IMAGE_PREFS_DEFAULTS.wardrobe,
    venue: NINA_IMAGE_PREFS_DEFAULTS.venue,
    time: NINA_IMAGE_PREFS_DEFAULTS.time,
    notes: NINA_IMAGE_PREFS_DEFAULTS.notes,
    reference: {
      source: NINA_IMAGE_PREFS_DEFAULTS.reference.source,
      id: NINA_IMAGE_PREFS_DEFAULTS.reference.id,
    },
  }

  try {
    const { revision } = await writeNinaImagePrefs(parsed.data.userId, defaults)
    revalidatePath('/admin/image-generation')
    return {
      ok: true,
      revision,
      note: `Every image parameter is back at its default, as revision ${revision}. The body canon is unchanged — it never was a setting.`,
    }
  } catch (cause) {
    return failed('reset', cause)
  }
}
```

**Impact:** Two POST endpoints, both gated. `tests/admin.imagegen.test.ts` asserts the exported
count is 2 and that `await requireAdmin()` precedes `.safeParse(` in every exported body.

---

### Step 4: `components/admin/ImageGenPanel.tsx`

**File:** `components/admin/ImageGenPanel.tsx` (new)
**Change:** The form. `CharacterPanel.tsx` is the same surface one feature over and this follows it
line for line: local draft, nothing writes on change, one Save, `useTransition`, a result object,
`DialSlider` for the slider, `CONTROL_CLASS` for the fields, `TOUCH_TARGET` on every label that is
a hit target, and the draft re-synced from the prop when the revision changes.

Two seams are rendered as visible placeholders with a comment naming the exact props their
component will receive, so phase 5 and phase 6 each make one edit to one place.

**Code:**

```tsx
'use client'

import * as React from 'react'

import { DialSlider } from '@/components/admin/DialSlider'
import { TOUCH_TARGET } from '@/components/admin/touch'
import { Button, CONTROL_CLASS } from '@/components/ui'
import {
  resetNinaImagePrefsAction,
  saveNinaImagePrefsAction,
  type AdminImageGenResult,
} from '@/lib/admin/imageGenActions'
import {
  ADMIN_IMAGE_PREVIEW_SCENE,
  changedImageGenFields,
  focusOnKeys,
  IMAGE_REFERENCE_NONE,
  imageFocusCopy,
  promptLengthCopy,
  referenceKey,
  type ImageGenDraft,
  type ImageReferenceOption,
} from '@/lib/admin/imageGenModel'
import { cn } from '@/lib/cn'
import {
  NINA_IMAGE_FOCUS_KEYS,
  NINA_IMAGE_PROMPT_LENGTH_MAX,
  NINA_IMAGE_PROMPT_LENGTH_MIN,
  NINA_IMAGE_NOTES_MAX,
  NINA_IMAGE_TIME_MAX,
  NINA_IMAGE_VENUE_MAX,
  NINA_IMAGE_WARDROBE_MAX,
} from '@/lib/nina/imageprefs'

/**
 * **How she is photographed** — R2's *"make a new tab in admin: Image Generation"*, and the UI half
 * of R4 through R9.
 *
 * ── WHAT THIS PANEL IS, AND WHAT IT DELIBERATELY IS NOT ─────────────────────────────────────
 * It is the operator's STANDING OPINION about her photographs: how much detail to spend, which of
 * six things to emphasise, what she is wearing, where she is, when it is, and anything else. It is
 * NOT the scene. The scene is still hers per photograph — the chat model's `generate_image`
 * argument — which is why the preview stands one in from `ADMIN_IMAGE_PREVIEW_SCENE` and says so
 * out loud rather than pretending the operator chose it.
 *
 * ── THE BODY CANON IS NOT ON THIS PAGE, AND THAT IS R1 ──────────────────────────────────────
 * *"i care a lot about her voluptuous body: big boobs, bubble butt, big thighs, very long calves.
 * always explicitly instruct these in the prompt."* **Always** is the requirement, so the four body
 * facts are unconditional text in phase 2's subject paragraph and there is no control here that can
 * remove them (plan invariant 4). The six checkboxes below add EMPHASIS on top; clearing all six
 * still yields a prompt naming all four, and the operator can see that in the preview because the
 * preview is the real assembler.
 *
 * ── `useTransition`, NOT `<form action={…}>` ────────────────────────────────────────────────
 * `CharacterPanel.tsx` states the reason and it is unchanged here: the plain-argument +
 * result-object convention on the sibling admin pages, and an operator-only tool gains nothing from
 * progressive enhancement that it does not lose in consistency. Validation is Zod on the server for
 * every field, either way.
 *
 * ── ONE SAVE (PLAN INVARIANT 7) ─────────────────────────────────────────────────────────────
 * A slider, six checkboxes, four text fields and a photograph is eleven controls. Every one of them
 * edits a local draft; nothing writes on change; one button sends the whole object. Next dispatches
 * Server Actions one at a time per client, so eleven actions would stall behind each other.
 *
 * **The photo reference is part of that same one save**, which is why the selection lives in this
 * draft even though phase 4 ships no grid to pick it with. Phase 5's picker is a control that calls
 * `onSelect` and nothing else — no action of its own, no schema of its own, no round trip of its
 * own.
 *
 * ── EVERY WORD BESIDE A CONTROL COMES FROM `lib/nina/imageprefs.ts` ─────────────────────────
 * Labels, hints and bounds are `imageFocusCopy` / `promptLengthCopy` and the four `*_MAX`
 * constants, which read phase 1's specs. There is no copy table in this package, so the panel
 * cannot promise an emphasis the prompt does not add — and, specifically, so that the six option
 * names stay the user's own words instead of somebody's clinical synonyms for them.
 *
 * ── WHAT THIS FILE MAY NOT IMPORT ───────────────────────────────────────────────────────────
 * Nothing `server-only`, and nothing that reaches drizzle or `lib/env.ts`. `lib/nina/imageprefs.ts`
 * is guaranteed client-importable by phase 1 (types and plain data only, zero imports of its own);
 * the VALUES arrive as a plain `ImageGenDraft` the page mapped, so no part of phase 1's row shape
 * crosses the serialization boundary (plan invariant 9). `tests/admin.imagegen.test.ts` asserts
 * both.
 */

export interface ImageGenPanelProps {
  userId: string
  /** The prefs as the row holds them right now — the baseline for "unsaved". */
  prefs: ImageGenDraft
  /** `NINA_IMAGE_PREFS_DEFAULTS`, mapped — the baseline for "no longer the shipping default". */
  defaults: ImageGenDraft
  revision: number
  /**
   * `buildNinaImagePrompt(...)`, assembled on the SERVER from the SAVED prefs.
   *
   * It is not recomputed as the sliders move, and that is deliberate rather than a limitation: the
   * assembler reaches the whole persona, and shipping that into the browser to preview a string
   * would put Nina's canon in a client bundle to save one round trip. The preview's own summary
   * line says which revision it is showing.
   */
  promptPreview: string
  /**
   * Every photograph the reference grid may offer, newest first, already mapped to a plain
   * serializable shape on the server. Phase 4 renders the count and the selected tile; phase 5
   * renders the grid from the same array.
   *
   * **RECONCILED:** mapped from `listNinaPhotoReferences(userId).rows` with
   * `toImageReferenceOption`, and structurally identical to phase 5's `PhotoReferenceItem`, so
   * phase 5's mount is `items={references}` with no cross-phase import.
   */
  references: ImageReferenceOption[]
  /**
   * How many photographs the union holds **in total**, not just on this page — i.e.
   * `listNinaPhotoReferences(userId).total`.
   *
   * **RECONCILED: this prop is on phase 4's list because phase 5 needs it and phase 5 does not edit
   * this prop list.** Phase 5's footer says *"Showing 48 of 142 (94 older not on this page)"*, which
   * it cannot do from `references.length` alone. Phase 4's own seam placeholder renders it too, so
   * the number is verifiable before the grid exists.
   */
  photoTotal: number
}

export function ImageGenPanel({
  userId,
  prefs,
  defaults,
  revision,
  promptPreview,
  references,
  photoTotal,
}: ImageGenPanelProps) {
  const [draft, setDraft] = React.useState<ImageGenDraft>(prefs)
  const [result, setResult] = React.useState<AdminImageGenResult | null>(null)
  const [confirmingReset, setConfirmingReset] = React.useState(false)
  const [pending, startTransition] = React.useTransition()

  // The server re-renders with the canonical row after every action, so the draft follows the prop
  // rather than diverging from it — a stale field next to "saved as revision 5" is how a second
  // save writes the pre-canonical value back.
  //
  // Keyed on `revision` and not on the object, and adjusted DURING RENDER rather than in an effect:
  // `CharacterPanel.tsx:131-147` has the full argument, including why
  // `react-hooks/set-state-in-effect` rejects the alternative.
  const [lastRevision, setLastRevision] = React.useState(revision)
  if (revision !== lastRevision) {
    setLastRevision(revision)
    setDraft(prefs)
    setConfirmingReset(false)
  }

  const unsaved = React.useMemo(() => new Set(changedImageGenFields(draft, prefs)), [draft, prefs])
  const dirty = unsaved.size > 0
  const on = focusOnKeys(draft)
  const length = promptLengthCopy(draft.promptLength)

  /** The photograph the draft points at, if it is still in either set. */
  const selected = React.useMemo(() => {
    if (draft.reference.id === null) return null
    const key = referenceKey(draft.reference)
    return references.find((option) => referenceKey(option) === key) ?? null
  }, [draft.reference, references])

  function setFocus(key: string, next: boolean) {
    setDraft((current) => ({ ...current, focus: { ...current.focus, [key]: next } }))
  }

  /** Absent means OFF, everywhere in this feature. One reader for that rule in this file. */
  function isOn(key: string): boolean {
    return draft.focus[key] ?? false
  }

  /**
   * R10's selection, into the same local draft as every other control (plan invariant 7).
   * **This is the function phase 5's picker calls.** It is the whole of the contract.
   */
  function setReference(next: ImageGenDraft['reference']) {
    setDraft((current) => ({ ...current, reference: next }))
  }

  function run(action: () => Promise<AdminImageGenResult>) {
    startTransition(async () => {
      setResult(await action())
    })
  }

  return (
    <section id="image-generation" className="mb-8 rounded-card border border-rule bg-card px-5">
      <div className="flex items-center justify-between gap-4 py-5">
        <h2 className="text-[15px] font-semibold text-ink">
          How she is photographed
          {dirty && (
            <span className="ml-2 text-[12px] font-semibold text-accent">
              {unsaved.size} unsaved
            </span>
          )}
        </h2>
        <span className="text-right text-[12px] font-medium text-ink-3">
          prompt length {draft.promptLength} &middot; {on.length} of {NINA_IMAGE_FOCUS_KEYS.length}{' '}
          emphasised
          {draft.reference.id !== null && ' · one reference'} &middot; revision {revision}
        </span>
      </div>

      <div className="pb-6">
        <p className="mb-6 max-w-[70ch] text-[13px] font-medium text-ink-2">
          Everything on this page goes into the <strong>image</strong> prompt, not into her voice.{' '}
          <strong>There is no cache on the image path</strong>, so a saved row is in the next
          photograph she takes with no invalidation step and no deploy. What this page does{' '}
          <strong>not</strong> control is the scene — she still chooses that per photograph, and the
          preview below stands one in so the rest of the prompt is readable.
        </p>

        <section className="mb-6">
          <h3 className="text-[13px] font-semibold text-ink">Prompt length</h3>
          <p className="mb-1 max-w-[70ch] text-[11px] font-medium text-ink-3">
            One dial, 0 to {NINA_IMAGE_PROMPT_LENGTH_MAX}, read in the same five bands as every other
            slider in here.
          </p>
          {/*
           * No `onEnabledChange`, so `DialSlider` renders no checkbox — its own docstring names
           * this case: *"A caller with a parameter that has no off switch … passes neither prop and
           * gets the control as it was before R4."* There is no "off" for prompt length; the
           * bottom of the scale is the shortest prompt, not the absence of one.
           */}
          <DialSlider
            label={length.label}
            hint={length.hint}
            value={draft.promptLength}
            defaultValue={defaults.promptLength}
            min={NINA_IMAGE_PROMPT_LENGTH_MIN}
            max={NINA_IMAGE_PROMPT_LENGTH_MAX}
            disabled={pending}
            unsaved={unsaved.has('promptLength')}
            onChange={(value) => setDraft((current) => ({ ...current, promptLength: value }))}
          />
        </section>

        <fieldset className="mb-6">
          <legend className="mb-2 text-[12px] font-semibold tracking-[0.02em] text-ink-2">
            Focus on
          </legend>
          {/*
           * The leading `*` on every line of this comment is load-bearing and not tidy:
           * `ci:client-secret-guard` recognises a comment line only when it is trimmed-prefixed by
           * `//`, `*` or `/*`, so a JSX comment with bare prose continuation lines is scanned as
           * code. Both existing admin pages record the same trap.
           *
           * These six are ADDITIVE. R1's four body facts are in every prompt whatever is ticked
           * here — plan invariant 4 — so clearing all six shortens the emphasis and does not
           * undress the subject paragraph. The sentence below says so, and the preview proves it.
           */}
          <p className="mb-3 max-w-[70ch] text-[11px] font-medium text-ink-3">
            These add emphasis on top of the prompt. They cannot take anything out of it: her body
            is described in every photograph whether or not anything here is ticked. Read the
            assembled prompt below to see what each one adds.
          </p>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {NINA_IMAGE_FOCUS_KEYS.map((key) => {
              const copy = imageFocusCopy(key)
              const ticked = isOn(key)
              return (
                <label
                  key={key}
                  className={cn(
                    TOUCH_TARGET,
                    'flex cursor-pointer items-start gap-2 rounded-card bg-paper-2 p-3',
                    ticked && 'ring-2 ring-accent',
                  )}
                >
                  <input
                    type="checkbox"
                    checked={ticked}
                    disabled={pending}
                    onChange={(event) => setFocus(key, event.target.checked)}
                    className="mt-0.5 size-4 shrink-0 accent-accent disabled:opacity-50"
                  />
                  <span>
                    <span className="block text-[13px] font-semibold text-ink">
                      {copy.label}
                      {unsaved.has(`focus.${key}`) && (
                        <span className="ml-2 text-[11px] font-semibold text-accent">unsaved</span>
                      )}
                    </span>
                    <span className="block text-[11px] font-medium text-ink-3">{copy.hint}</span>
                  </span>
                </label>
              )
            })}
          </div>
        </fieldset>

        <div className="mb-6 grid gap-5 xl:grid-cols-2">
          <label className="block">
            <span className="mb-1.5 block text-[12px] font-semibold tracking-[0.02em] text-ink-2">
              Wardrobe
              {unsaved.has('wardrobe') && (
                <span className="ml-2 font-semibold text-accent">unsaved</span>
              )}
            </span>
            <input
              className={CONTROL_CLASS}
              value={draft.wardrobe}
              maxLength={NINA_IMAGE_WARDROBE_MAX}
              disabled={pending}
              placeholder="long hugging leggings with string bra"
              onChange={(event) =>
                setDraft((current) => ({ ...current, wardrobe: event.target.value }))
              }
            />
            <span className="mt-1.5 block max-w-[46ch] text-[11px] font-medium text-ink-3">
              What she is wearing. Leave it empty and she wears what the canon says.
            </span>
          </label>

          <label className="block">
            <span className="mb-1.5 block text-[12px] font-semibold tracking-[0.02em] text-ink-2">
              Venue
              {unsaved.has('venue') && (
                <span className="ml-2 font-semibold text-accent">unsaved</span>
              )}
            </span>
            <input
              className={CONTROL_CLASS}
              value={draft.venue}
              maxLength={NINA_IMAGE_VENUE_MAX}
              disabled={pending}
              placeholder="Kuta streets in Bali"
              onChange={(event) =>
                setDraft((current) => ({ ...current, venue: event.target.value }))
              }
            />
            <span className="mt-1.5 block max-w-[46ch] text-[11px] font-medium text-ink-3">
              Where she is. This is a standing preference; the scene she picks per photograph still
              sits above it.
            </span>
          </label>

          <label className="block">
            <span className="mb-1.5 block text-[12px] font-semibold tracking-[0.02em] text-ink-2">
              Time
              {unsaved.has('time') && (
                <span className="ml-2 font-semibold text-accent">unsaved</span>
              )}
            </span>
            <input
              className={CONTROL_CLASS}
              value={draft.time}
              maxLength={NINA_IMAGE_TIME_MAX}
              disabled={pending}
              placeholder="sunny day, rainy night, cold afternoon"
              onChange={(event) => setDraft((current) => ({ ...current, time: event.target.value }))}
            />
            <span className="mt-1.5 block max-w-[46ch] text-[11px] font-medium text-ink-3">
              Time of day and weather, in your own words.
            </span>
          </label>

          <label className="block">
            <span className="mb-1.5 block text-[12px] font-semibold tracking-[0.02em] text-ink-2">
              Notes
              {unsaved.has('notes') && (
                <span className="ml-2 font-semibold text-accent">unsaved</span>
              )}
            </span>
            <textarea
              className={cn(CONTROL_CLASS, 'min-h-[76px] resize-y py-2 leading-snug')}
              value={draft.notes}
              maxLength={NINA_IMAGE_NOTES_MAX}
              disabled={pending}
              placeholder="nina is full of sweat"
              onChange={(event) =>
                setDraft((current) => ({ ...current, notes: event.target.value }))
              }
            />
            <span className="mt-1.5 block max-w-[46ch] text-[11px] font-medium text-ink-3">
              Anything no other field can say. Handed to the camera verbatim — this is the image
              prompt, not her system prompt.
            </span>
          </label>
        </div>

        {/*
         * ── SEAM — PHASE 5: the photo-reference picker ────────────────────────────────────────
         *
         * **THE MARKER STRING IS `SEAM — PHASE 5`, EXACTLY, EM DASH INCLUDED.** Phase 5 greps for
         * it and its test asserts `expect(panel).not.toContain('SEAM — PHASE 5')` once the mount
         * has landed. Phase 4's draft spelled it "PHASE 5 SEAM" and phase 5 and phase 6 both
         * spelled it "SEAM — PHASE n"; the reconciler settled on the latter because it is the form
         * two of the three plans use AND the only form a test asserts. Do not re-word it.
         *
         * Phase 5 replaces the `<section>` below with exactly this, plus one import:
         *
         *     <PhotoReferencePicker
         *       items={references}
         *       total={photoTotal}
         *       value={referenceKey(draft.reference)}
         *       onChange={(next) => setDraft({ ...draft, reference: parseReferenceKey(next) })}
         *       disabled={pending}
         *     />
         *
         * It adds NO action, NO schema and NO page prop, because the four things a picker would
         * otherwise need are already here: `references` and `photoTotal` are mapped on the server
         * by `app/admin/image-generation/page.tsx`, `draft.reference` is the selection, and the
         * draft the one Save sends is the one `onChange` writes into.
         *
         * **The currency across the seam is an opaque `string`, not an object.** `referenceKey`
         * encodes `{ source, id }` into `` `${source}:${id}` `` (`''` = nothing selected) and
         * `parseReferenceKey` decodes it. That is phase 5's own contract — its `PhotoReferenceItem`
         * carries `key`, `url` and `thumbUrl` and *nothing else*, so the picker cannot know what a
         * set is, which is what makes its "no tile announces its set" exit criterion structural.
         * Both functions live in `lib/admin/imageGenModel.ts` (this phase's adaptation seam), so
         * phase 5 decides neither the encoding nor how equality works.
         *
         * The placeholder is not a stub for its own sake: it renders the two facts phase 4 can
         * honestly report — how many photographs the grid will have, and which one is selected —
         * so the round trip is verifiable before the grid exists, and a save that dropped the
         * reference would be visible here rather than in phase 6.
         */}
        <section className="mb-6">
          <h3 className="text-[13px] font-semibold text-ink">
            Photo reference
            {unsaved.has('reference') && (
              <span className="ml-2 text-[11px] font-semibold text-accent">unsaved</span>
            )}
          </h3>
          <p className="mb-3 max-w-[70ch] text-[11px] font-medium text-ink-3">
            One photograph from Nina&rsquo;s album or the chat photos, used to anchor her face and
            body. {photoTotal === 0
              ? 'There is nothing to choose from yet.'
              : `${references.length} of ${photoTotal} photograph${photoTotal === 1 ? '' : 's'} on this page.`}
          </p>
          <div className="flex flex-wrap items-center gap-3 rounded-card bg-paper-2 p-4">
            {selected === null ? (
              <p className="text-[12px] font-medium text-ink-2">
                {draft.reference.id === null
                  ? 'No reference. She is drawn from the canon alone.'
                  : 'The saved reference is no longer in either set. Clear it or pick another.'}
              </p>
            ) : (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element -- a Blob URL of unknown
                    dimensions in an operator-only tool; `ChatPhotoGrid` makes the same call. */}
                <img
                  src={selected.thumbUrl ?? selected.url}
                  alt="The selected photo reference"
                  loading="lazy"
                  className="size-16 shrink-0 rounded-field object-cover"
                />
                <p className="text-[12px] font-medium text-ink-2">
                  One photograph selected. The grid to change it lands with the picker.
                </p>
              </>
            )}
            {draft.reference.id !== null && (
              <Button
                variant="ghost"
                disabled={pending}
                onClick={() => setReference(IMAGE_REFERENCE_NONE)}
              >
                Use no reference
              </Button>
            )}
          </div>
        </section>

        <details className="mb-6 rounded-card bg-paper-2 p-4">
          <summary className="cursor-pointer list-none text-[12px] font-semibold text-ink [&::-webkit-details-marker]:hidden">
            The assembled image prompt &middot; revision {revision}
            {dirty && (
              <span className="ml-2 font-medium text-ink-3">
                (as saved — the edits above are not in it yet)
              </span>
            )}
          </summary>
          <p className="mt-3 max-w-[70ch] text-[11px] font-medium text-ink-3">
            Assembled by the same function the camera is handed, so this is the prompt and not a
            reconstruction of it. The <code>SCENE:</code> line is a stand-in —{' '}
            <em>{ADMIN_IMAGE_PREVIEW_SCENE}</em> — because she chooses the scene per photograph.
          </p>
          <pre className="mt-3 max-h-[420px] overflow-auto text-[12px] leading-relaxed whitespace-pre-wrap text-ink-2">
            {promptPreview}
          </pre>
        </details>

        {/*
         * ── SEAM — PHASE 6: the test-prompt button and its verdict ────────────────────────────
         *
         * **THE MARKER STRING IS `SEAM — PHASE 6`, EXACTLY.** Phase 6 greps for it and its test
         * asserts `expect(source).not.toContain('SEAM — PHASE 6')`. See the phase 5 seam above for
         * why this spelling won.
         *
         * Phase 6 replaces the `<p>` below with exactly this, plus one import:
         *
         *     <ImageGenTestPanel dirty={dirty} />
         *
         * **RECONCILED: `dirty` only.** Phase 4's draft predicted
         * `<ImageGenTestPanel userId={userId} dirty={dirty} revision={revision} />`, but phase 6
         * owns that component and declares its props as `{ dirty?: boolean }` — no `userId`
         * (`runNinaImageTestAction` takes no arguments and reads `requireAdmin()` server-side, so a
         * client-supplied user id would be a payload to forge) and no `revision` (the panel polls a
         * Server Action rather than re-rendering this page, so it needs nothing from the form's
         * render). The component that declares a prop list owns it. Passing `dirty` also closes
         * phase 6's Handoff 4, which left the flag optional so neither phase would block the other.
         *
         * `dirty` is in scope here as `unsaved.size > 0`, declared beside `unsaved` above.
         *
         * It goes HERE — after the assembled prompt, before the Save
         * row — for two reasons. The verdict is about the prompt printed immediately above it, so
         * the two read as one block; and the button spends money against
         * `NINA_IMAGE_DAILY_CAP`, so it must not sit where a hand aiming for Save can land on it.
         *
         * `dirty` is passed because the test runs the SAVED row, not the draft: a test fired with
         * unsaved edits would return a verdict on a prompt the operator is not looking at, and the
         * panel has to be able to say so.
         */}
        <p className="mb-6 max-w-[70ch] text-[12px] font-medium text-ink-3">
          The test-prompt button lands here: it runs the prompt above at the provider and reports
          whether it was refused.
        </p>

        {result?.ok === false && (
          <p className="mb-3 text-[12px] font-semibold text-red">{result.error}</p>
        )}
        {result?.ok === true && result.note && (
          <p className="mb-3 text-[12px] font-semibold text-accent">{result.note}</p>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <Button
            disabled={pending || !dirty}
            loading={pending}
            onClick={() =>
              run(() =>
                saveNinaImagePrefsAction({
                  userId,
                  promptLength: draft.promptLength,
                  focus: draft.focus,
                  wardrobe: draft.wardrobe,
                  venue: draft.venue,
                  time: draft.time,
                  notes: draft.notes,
                  reference: draft.reference,
                }),
              )
            }
          >
            Save every parameter
          </Button>

          <Button
            variant="ghost"
            disabled={pending || !dirty}
            onClick={() => {
              setDraft(prefs)
              setResult(null)
            }}
          >
            Discard changes
          </Button>

          {!confirmingReset && (
            <Button
              variant="destructive"
              disabled={pending}
              onClick={() => setConfirmingReset(true)}
            >
              Reset to defaults
            </Button>
          )}
        </div>

        {confirmingReset && (
          <div className="mt-3 rounded-card border border-rule bg-paper-2 p-3">
            <p className="mb-2 max-w-[70ch] text-[12px] font-medium text-ink-2">
              This writes <strong>every</strong> parameter on this page back to its default, clears
              the photo reference, and bumps the revision so the row records that it happened. It
              does not touch her body canon — that was never a setting.
            </p>
            <div className="flex gap-2">
              <Button
                disabled={pending}
                onClick={() => {
                  run(() => resetNinaImagePrefsAction({ userId }))
                  setConfirmingReset(false)
                }}
              >
                Reset the image parameters
              </Button>
              <Button variant="ghost" disabled={pending} onClick={() => setConfirmingReset(false)}>
                Cancel
              </Button>
            </div>
          </div>
        )}
      </div>
    </section>
  )
}
```

**Impact:** One new client component, one mount site. `userId` is read by the two action calls and
will be read by phase 6's seam; nothing else in the file is unused.

---

### Step 5: `app/admin/image-generation/page.tsx`

**File:** `app/admin/image-generation/page.tsx` (new)
**Change:** The route. `requireAdmin()` first, three reads in one `Promise.all`, the pure preview,
one panel.

**Code:**

```tsx
import { ImageGenPanel } from '@/components/admin/ImageGenPanel'
import {
  ADMIN_IMAGE_PREVIEW_SCENE,
  toImageGenDraft,
  toImageReferenceOption,
} from '@/lib/admin/imageGenModel'
import { requireAdmin } from '@/lib/admin/requireAdmin'
import { buildNinaImagePrompt } from '@/lib/nina/imagegen'
import { NINA_IMAGE_PREFS_DEFAULTS } from '@/lib/nina/imageprefs'
import { listNinaPhotoReferences, readNinaImagePrefs, readNinaTuning } from '@/lib/nina/queries'

/**
 * `/admin/image-generation` — R2 of this set, in the user's own words: *"we need to change image
 * generation prompt. in fact: make a new tab in admin: Image Generation."*
 *
 * ── WHY A ROUTE, AND WHY A FLAT SIBLING ─────────────────────────────────────────────────────
 * `/admin` has no in-page tab component anywhere. What it has is `components/admin/AdminNav.tsx`,
 * whose cells are the admin counterpart of the runner's tab bar — so "a new tab in admin" is a
 * SIXTH NAV CELL and a sixth route, and this file is it. Flat, like the other five, and named for
 * the thing it configures rather than nested under `/admin/nina`: the album is `nina_avatars` and
 * this page is not about a photograph, it is about how the next one is made.
 *
 * It sits beside `/admin/personality` in the nav on purpose. Those two are the configuration
 * surfaces — who she is, and how she is photographed — and phase 7 moves the Wardrobe field from
 * one to the other, which is a move nobody can find if the two tabs are at opposite ends of a bar.
 *
 * ── THE GATE IS HERE, AS IT IS ON EVERY SIBLING ─────────────────────────────────────────────
 * `requireAdmin()` is the FIRST statement, above every read. `proxy.ts` matches neither `/admin`
 * nor `/api/*` (`lib/admin/requireAdmin.ts:13-16`), so this call and the layout's and each
 * action's are the only gates on this route — a new segment under `/admin` inherits no matcher
 * change and needs none. Plan invariant 6, and `tests/admin.imagegen.test.ts` asserts the ordering
 * on this file structurally.
 *
 * ── `force-dynamic`, AND WHY IT IS NOT ABOUT `searchParams` ─────────────────────────────────
 * This page reads no `searchParams` and therefore takes no props — the shape `app/admin/page.tsx`
 * and `app/admin/personality/page.tsx` both already have. Verified against this repo's own Next
 * (16.3.1) rather than remembered:
 * `node_modules/next/dist/docs/01-app/02-guides/caching-without-cache-components.md:96-99` is where
 * `'auto' | 'force-dynamic' | 'error' | 'force-static'` is defined, and `'auto'` caches as much as
 * it can.
 *
 * The reason it is declared is the sibling pages' reason verbatim: these prefs are per-request
 * state that must reflect the action that just ran, and `revalidatePath('/admin/image-generation')`
 * in both actions is what makes that immediate. `requireAdmin()` awaits `auth()`, which reads a
 * cookie and would opt this route in implicitly — but a route's caching decided by the internals
 * of a module three levels down is a route that loses it the day that module is refactored.
 *
 * ── THE PREVIEW IS A PURE FUNCTION, WHICH IS WHAT MAKES IT LEGAL HERE ───────────────────────
 * `buildNinaImagePrompt(...)` assembles a string. It is not a model call, it awaits nothing, and it
 * is the SAME function `lib/nina/selfiegen.ts` uses to build the prompt the camera is handed —
 * which is the whole value of the preview: what the panel shows is what the provider gets, not a
 * reconstruction of it. Plan invariant 5 / `ci:llm-payload-guard` Rule 2 forbids awaiting a MODEL
 * CALL from a page render, by function name; nothing on this page appears in that table and
 * nothing on this page may.
 *
 * ── WHY THE TUNING IS READ HERE TOO ─────────────────────────────────────────────────────────
 * The prompt is not assembled from the prefs alone. `ninaPhotoPresence` still reads `steamy` and
 * `flirty` off `NinaTuning` (`lib/nina/imagegen.ts:93`), so a preview built with the prefs and no
 * tuning would be a preview missing a paragraph the real path has. Three indexed reads of three
 * rows, in one `Promise.all` so they do not run in sequence.
 *
 * ── PHASE 6 ADDS `maxDuration` TO THIS FILE ─────────────────────────────────────────────────
 * A Server Action's timeout is the page segment's, and phase 6's test dispatch opens an image job.
 * That constant is deliberately NOT declared here: this phase awaits nothing longer than three
 * indexed reads, and a `maxDuration` with no expensive call under it is a number nobody can justify
 * when they find it.
 */

export const dynamic = 'force-dynamic'

export default async function AdminImageGenerationPage() {
  const { userId } = await requireAdmin()

  /* `listNinaPhotoReferences` returns a `NinaPhotoRefPage` — `{ rows, total, offset, limit }` —
   * not an array. `total` counts BOTH sets and is what phase 5's footer needs to say "Showing 48 of
   * 142" truthfully, so it is threaded to the panel as its own prop. */
  const [prefs, tuning, referencePage] = await Promise.all([
    readNinaImagePrefs(userId),
    readNinaTuning(userId),
    listNinaPhotoReferences(userId),
  ])

  return (
    <div>
      <header className="mb-5 lg:mb-6">
        <h1 className="text-[22px] font-bold tracking-[-0.02em] text-ink">Image generation</h1>
        <p className="mt-1 max-w-[70ch] text-[13px] font-medium text-ink-2">
          What she looks like in a photograph, not who she is. How much detail to spend, what to
          emphasise, what she is wearing, where she is and when. Her character stayed on the
          Personality tab; this page is the row every image prompt is assembled from.
        </p>
      </header>

      {/*
       * The prefs cross to the client as a plain `ImageGenDraft` and the reference rows as plain
       * `ImageReferenceOption`s — `toImageGenDraft` and `toImageReferenceOption` are the only two
       * places on the read side that know phase 1's field names, so no drizzle row shape and no Zod
       * schema reaches a component (plan invariant 9).
       *
       * `promptPreview` is a pure string assembly, never a model call: see the header, and plan
       * invariant 5. `mood` is `null` because a mood is a per-photograph note the operator has no
       * field for, and passing a made-up one would put a word in the preview that no real
       * generation sends.
       *
       * The leading `*` on every line of this comment is the same load-bearing detail both sibling
       * admin pages record: `ci:client-secret-guard` recognises a comment line only when it is
       * trimmed-prefixed by `//`, `*` or `/*`, so a JSX comment with bare prose continuation lines
       * is scanned as code.
       */}
      <ImageGenPanel
        userId={userId}
        prefs={toImageGenDraft(prefs)}
        defaults={toImageGenDraft(NINA_IMAGE_PREFS_DEFAULTS)}
        revision={prefs.revision}
        promptPreview={buildNinaImagePrompt({
          purpose: 'selfie',
          scene: ADMIN_IMAGE_PREVIEW_SCENE,
          mood: null,
          tuning,
          prefs,
        })}
        references={referencePage.rows.map(toImageReferenceOption)}
        photoTotal={referencePage.total}
      />
    </div>
  )
}
```

**Impact:** A sixth route. `tests/admin.shell.test.ts`'s `existsSync(app/admin/image-generation/page.tsx)`
now passes for the new nav href, so this step must land in the same commit as step 6.

---

### Step 6: the sixth nav cell

**File:** `components/admin/AdminNav.tsx` — `LINKS` (`:59-87`) and the `<ul>` class (`:121`)
**Change:** One entry inserted after `/admin/personality`, and the phone row becomes a 3x2 grid at
`h-28`. The `lg` sidebar is untouched: every `lg:` utility on both elements is byte-identical.

**Code — replace the `LINKS` docstring and array (lines 50-87) with:**

```ts
/**
 * The six routes, longest label first in each pair.
 *
 * `short` is the phone label and is not an abbreviation for its own sake. **The arithmetic behind
 * the ceiling changed with the sixth cell and it changed in our favour**: the bar below `lg` is a
 * 3x2 grid now, not a six-across row, so a cell is 414 / 3 = 138 px rather than 414 / 6 = 69 px.
 * The 8-character ceiling `tests/admin.shell.test.ts` holds is kept anyway — it was tightened from
 * 10 when the fifth cell landed, every entry clears it (Overview 8, Album 5, Persona 7, Images 6,
 * Photos 6, Memory 6), and a label that needs more than eight characters at `text-[11px]` is a
 * label that wants a shorter true form rather than a wider cell.
 *
 * Six across was the alternative and it was rejected on measurement, not taste: 69 px at
 * `text-[11px]` clips or wraps every one of these words, and it is below `docs/design-brief.md`'s
 * 44 pt minimum on the horizontal axis of a tap target.
 */
const LINKS = [
  { href: '/admin', label: 'Overview', short: 'Overview' },
  { href: '/admin/nina', label: "Nina's album", short: 'Album' },
  /*
   * The character tuning, which used to be a shut disclosure on the album route until the user
   * asked for it as its own tab: *"move it as a new tab with name: Personality"*. It sits between
   * the album and the chat photos because it is the third thing about HER, and the two photo
   * routes stay adjacent below it.
   *
   * The phone label is "Persona" and not "Personality": eleven characters do not fit at
   * `text-[11px]`, and this pair of strings exists for exactly that. It is a true short form of
   * the word rather than an invented abbreviation — `docs/nina/persona.md` is what this page edits.
   */
  { href: '/admin/personality', label: 'Personality', short: 'Persona' },
  /*
   * *"make a new tab in admin: Image Generation."* It is placed HERE, directly after the
   * personality tab, rather than appended at the end, and the reason is a move that has to be
   * findable: the Wardrobe field leaves `/admin/personality` and arrives on this page, so the two
   * tabs are neighbours. They are the pair of configuration surfaces — who she is, and how she is
   * photographed — and the three routes above and below them are the things you look AT.
   *
   * `short` is "Images" (6). Note that it is adjacent to "Photos", and that the two are not the
   * same word by accident: this page is how a photograph is MADE, and `/admin/photos` is the
   * photographs that were. The full labels at `lg` carry the distinction outright.
   */
  { href: '/admin/image-generation', label: 'Image Generation', short: 'Images' },
  /*
   * Deliberately named for the CONVERSATION and not for the person: `/admin/nina` is
   * `nina_avatars` (her profile album) and this one is `nina_message_images` (the photographs in
   * the chat). Two different tables, near each other in the nav so the distinction is legible, and
   * the labels are the only thing carrying it.
   */
  { href: '/admin/photos', label: 'Chat photos', short: 'Photos' },
  { href: '/admin/memory', label: 'Memory', short: 'Memory' },
] as const
```

**Code — replace the `<ul>` comment and opening tag (lines 107-121) with:**

```tsx
      {/*
       * `h-28 grid-cols-3 grid-rows-2` — **two rows of 56 px, not one row of six cells.** The
       * sixth route is where a single row runs out: 414 px / 6 = 69 px, which clips every one of
       * these labels at `text-[11px]` and is under `docs/design-brief.md`'s 44 pt minimum on the
       * horizontal axis. A 3x2 grid keeps the CELL exactly the 56 px tall it has always been —
       * `h-28` is 112 px over two rows — and widens it to 138 px, which is more room per label
       * than the five-across row ever had.
       *
       * **If this class changes, change `app/admin/layout.tsx`'s
       * `pb-[calc(8rem+var(--safe-bottom))]` with it**: Tailwind cannot read a constant, so the
       * geometry is spelled in two files by necessity and `tests/admin.shell.test.ts` is what
       * stops them drifting apart. `components/ui/AppShell.tsx` cites `TAB_BAR_HEIGHT_PX` in a
       * comment for exactly this reason. 128 px of reserve against a 113 px border box (112 px of
       * rows plus `border-t`) leaves 15 px of breathing room.
       *
       * `max-w-[470px] mx-auto` is `TabBar`'s row, borrowed: it is a no-op at 414 px and it is
       * what stops three cells stretching to 300 px each on a landscape phone or a small tablet,
       * both of which are still below `lg`. At the cap each cell is 156 px; at 414 px, 138 px.
       *
       * `grid-rows-2` is inert at `lg`, where `lg:block` takes the list out of grid layout
       * entirely — the same way `grid-cols-5` was inert there before it.
       */}
      <ul className="mx-auto grid h-28 w-full max-w-[470px] grid-cols-3 grid-rows-2 lg:mx-0 lg:block lg:h-auto lg:max-w-none lg:space-y-1">
```

Also update the file's own header prose, `:33-39` and `:26-27`, which say "five" three times:

- `:27` — `this bar carries the five admin routes and nothing else` -> `this bar carries the six
  admin routes and nothing else`
- `:33` — the section title `STILL PLAIN TEXT, STILL FIVE WORDS, NO ICONS` -> `STILL PLAIN TEXT,
  STILL ONE WORD A CELL, NO ICONS`
- `:36-39` — replace `What a 414 px viewport does force is length: five cells share 414 px, so each
  gets ~82.8 px — down from ~103 px at four — and neither "Nina's album" nor "Personality" fits.`
  with `What a 414 px viewport forces is length. It forced a 3x2 grid at the sixth route (see the
  \`<ul>\` below), which pushed a cell back out to 138 px — but the two-string pair stays, because
  neither "Nina's album" nor "Personality" nor "Image Generation" fits a phone cell at
  \`text-[11px]\` and the pair is what stops the two lists drifting.`
- `:50` (the `LINKS` docstring's first line) is replaced wholesale above.
- `:101-102` — the eyebrow comment `a 56 px bar has room for five words and no room for a line
  above them` -> `a 112 px bar is two rows of cells and has no room for a line above them`
- `:137-140` — the desktop footnote `The workshop behind the runner's five tabs` refers to the
  RUNNER's five tabs and is still true. Leave it.

**Impact:** `AdminNav` stays a Server Component with no active-link highlighting — no `'use client'`
and no `next/navigation` import is added, which is the package readme's rule and which
`tests/admin.shell.test.ts:144-155` asserts. Do not write the literal `href: '/…'` inside any
comment in this file: `tests/admin.shell.test.ts:102` matches `href: '(\/admin[^']*)'` over the
whole source and a commented example would be read as a seventh route.

---

### Step 7: the paired bottom reserve

**File:** `app/admin/layout.tsx:109`
**Change:** `pb-[calc(5rem+var(--safe-bottom))]` -> `pb-[calc(8rem+var(--safe-bottom))]`, and the
docstring bullet at `:41-46` that spells the old number.

**Code — the one class change on line 78:**

```tsx
      <div className="mx-auto grid w-full max-w-[1400px] grid-cols-1 gap-6 pt-[calc(1rem+var(--safe-top))] pr-[calc(1rem+var(--safe-right))] pb-[calc(8rem+var(--safe-bottom))] pl-[calc(1rem+var(--safe-left))] lg:grid-cols-[224px_minmax(0,1fr)] lg:gap-8 lg:pt-[calc(2rem+var(--safe-top))] lg:pr-[calc(2rem+var(--safe-right))] lg:pb-8 lg:pl-[calc(2rem+var(--safe-left))]">
```

**Code — replace bullet 3 of the docstring (lines 41-46) with:**

```
 *   3. **`<main>` reserves `calc(8rem + var(--safe-bottom))` below `lg`.** `AdminNav` is `fixed`
 *      there, so it is out of flow and contributes no grid row; without this the last card of
 *      every page sits under the bar. The number moved from `5rem` to `8rem` with the sixth admin
 *      route, which turned the bar from one 56 px row into two: 128 px against the bar's 113 px
 *      border box (112 px of rows plus `border-t`) leaves 15 px of breathing room, the same shape
 *      as `AppShell`'s `BOTTOM_GAP`. **The two numbers are spelled in two files** — see
 *      `AdminNav`'s `h-28` comment — and `tests/admin.shell.test.ts` is what keeps them in step.
```

**Impact:** 48 px more empty space under every admin page below `lg`; nothing at `lg` and above.
The layout's variant set stays `['lg']`, which `tests/admin.shell.test.ts:92-97` asserts.

---

### Step 8: the hub card

**File:** `app/admin/page.tsx` — the `Promise.all` (`:36-58`) and after the last `<Card>` (`:155`)
**Change:** One more read and one more card. A fact and a link, like the four beside it.

**Code — the import additions:**

```ts
import { focusOnKeys, promptLengthCopy, toImageGenDraft } from '@/lib/admin/imageGenModel'
```

and add `readNinaImagePrefs` to the existing `@/lib/nina/queries` import list, which becomes:

```ts
import {
  countNinaAvatars,
  countNinaChatPhotos,
  getCurrentNinaAvatar,
  readNinaImagePrefs,
  readNinaTuning,
} from '@/lib/nina/queries'
```

**Code — the destructuring and the read, replacing lines 36 and 52-58:**

```tsx
  const [albumCount, current, me, chatPhotoCount, tuning, imagePrefs] = await Promise.all([
```

...and, after the `readNinaTuning(userId)` element, one more:

```tsx
    /*
     * The image-generation prefs, for the card below. It joins the existing `Promise.all` rather
     * than adding a further sequential await, and it is a single indexed read of one row — the
     * same trade the tuning read above makes.
     */
    readNinaImagePrefs(userId),
  ])
```

**Code — after the `loud` computation, one more derivation:**

```tsx
  /* The two facts the image card prints. `focusOnKeys` is phase 1's declared order, so the count
   * is over the six options the user named and not over whatever keys the row happens to hold. */
  const imageDraft = toImageGenDraft(imagePrefs)
  const focused = focusOnKeys(imageDraft)
```

**Code — the fifth card, inserted after the "Her character" card and before the closing `</div>`:**

```tsx
        <Card className="p-5">
          <h2 className="text-[15px] font-semibold text-ink">Image generation</h2>
          <p className="mt-1 mb-3 text-[13px] font-medium text-ink-2">
            Prompt length {promptLengthCopy(imagePrefs.promptLength).band}
            {focused.length === 0
              ? ', nothing emphasised'
              : `, ${focused.length} of ${NINA_IMAGE_FOCUS_KEYS.length} emphasised`}
            {imageDraft.reference.id === null ? ', no reference' : ', one photo reference'}.
            Revision {imagePrefs.revision}.
          </p>
          <Link
            href="/admin/image-generation"
            className="inline-flex min-h-11 items-center text-[13px] font-semibold text-accent"
          >
            Set how she is photographed &rarr;
          </Link>
        </Card>
```

**Impact:** `grid gap-4 sm:grid-cols-2` now lays five cards out as 2/2/1. That is the same shape the
grid already produced when there were three, and no class changes.

The card also needs `NINA_IMAGE_FOCUS_KEYS` for the denominator, so the import list gains one more
line:

```ts
import { NINA_IMAGE_FOCUS_KEYS } from '@/lib/nina/imageprefs'
```

The band comes off `ImageGenCopy.band` (step 1) rather than out of the hint with a `split('.')`:
two surfaces read that band, and string surgery on a sentence one of them owns is coupling that
breaks the day the sentence is reworded.

---

### Step 9: `tests/admin.imagegen.test.ts`

**File:** `tests/admin.imagegen.test.ts` (new)
**Change:** The testable surface: the model's pure functions, the Zod boundary, and the structural
half that `vitest`'s `node` environment cannot render.

**Code:**

```ts
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import {
  ADMIN_IMAGE_PREVIEW_SCENE,
  changedImageGenFields,
  focusOnKeys,
  hasImageFocusCopy,
  IMAGE_REFERENCE_NONE,
  imageFocusCopy,
  imageGenDraftEquals,
  prettifyFocusKey,
  promptLengthCopy,
  referenceKey,
  toImageGenDraft,
  toImageReferenceOption,
  type ImageGenDraft,
} from '@/lib/admin/imageGenModel'
import { ninaImagePrefsResetSchema, ninaImagePrefsWriteSchema } from '@/lib/admin/schema'
import {
  NINA_IMAGE_FOCUS_KEYS,
  NINA_PROMPT_LENGTH_RUNGS,
  NINA_IMAGE_PROMPT_LENGTH_MAX,
  NINA_IMAGE_PROMPT_LENGTH_MIN,
  NINA_IMAGE_NOTES_MAX,
  NINA_IMAGE_PREFS_DEFAULTS,
  NINA_IMAGE_REFERENCE_ID_MAX,
  NINA_IMAGE_REFERENCE_SOURCES,
  NINA_IMAGE_TIME_MAX,
  NINA_IMAGE_VENUE_MAX,
  NINA_IMAGE_WARDROBE_MAX,
} from '@/lib/nina/imageprefs'

/**
 * `/admin/image-generation`'s panel — the testable surface. `tests/admin.tuning.test.ts` is the
 * sibling this file borrows its shape from, for the reason that file states: `vitest.config.ts`
 * runs `environment: 'node'` and includes no `.tsx`, so there is no render here, and that is not a
 * gap — everything about this panel that could be wrong in a way a human would not notice is a pure
 * function in `lib/admin/imageGenModel.ts` or a Zod shape in `lib/admin/schema.ts`.
 *
 * Every bound is imported from `@/lib/nina/imageprefs` rather than restated, so a test cannot
 * quietly become a second source of truth for a number the panel's `maxLength` also reads.
 */

const DEFAULTS: ImageGenDraft = toImageGenDraft(NINA_IMAGE_PREFS_DEFAULTS)

/** A valid save payload, with whatever overrides a case needs. */
function payload(overrides: Partial<ImageGenDraft> = {}) {
  return { userId: 'user_1', ...DEFAULTS, ...overrides }
}

describe('toImageGenDraft — the read-side seam', () => {
  it('carries every field phase 1 declares', () => {
    expect(DEFAULTS.promptLength).toBe(NINA_IMAGE_PREFS_DEFAULTS.promptLength)
    for (const key of NINA_IMAGE_FOCUS_KEYS) {
      expect(DEFAULTS.focus[key]).toBe(NINA_IMAGE_PREFS_DEFAULTS.focus[key])
    }
    expect(DEFAULTS.wardrobe).toBe(NINA_IMAGE_PREFS_DEFAULTS.wardrobe)
    expect(DEFAULTS.venue).toBe(NINA_IMAGE_PREFS_DEFAULTS.venue)
    expect(DEFAULTS.time).toBe(NINA_IMAGE_PREFS_DEFAULTS.time)
    expect(DEFAULTS.notes).toBe(NINA_IMAGE_PREFS_DEFAULTS.notes)
    expect(DEFAULTS.reference.source).toBe(NINA_IMAGE_PREFS_DEFAULTS.reference.source)
    expect(DEFAULTS.reference.id).toBe(NINA_IMAGE_PREFS_DEFAULTS.reference.id)
  })

  it('copies the focus record, so a draft edit cannot reach into the row it came from', () => {
    const draft = toImageGenDraft(NINA_IMAGE_PREFS_DEFAULTS)
    const key = NINA_IMAGE_FOCUS_KEYS[0]
    const before = NINA_IMAGE_PREFS_DEFAULTS.focus[key]
    draft.focus[key] = !before
    expect(NINA_IMAGE_PREFS_DEFAULTS.focus[key]).toBe(before)
  })

  it('does not carry the revision — the panel takes that as its own prop', () => {
    expect('revision' in DEFAULTS).toBe(false)
  })
})

describe('the vocabulary is phase 1s, and is complete', () => {
  it('has exactly the six options the user named', () => {
    /* The literal stays a literal rather than becoming `NINA_IMAGE_FOCUS_KEYS.length`, which would
     * be a tautology. The number is here to make adding a seventh an explicit decision. */
    expect(NINA_IMAGE_FOCUS_KEYS).toHaveLength(6)
  })

  it('has a real label and hint for every one of them', () => {
    for (const key of NINA_IMAGE_FOCUS_KEYS) {
      expect(hasImageFocusCopy(key), `no copy for focus option ${key}`).toBe(true)
      expect(imageFocusCopy(key).label.length).toBeGreaterThan(0)
      expect(imageFocusCopy(key).hint.length).toBeGreaterThan(0)
    }
  })

  /*
   * The one thing about this vocabulary that could ship wrong without anybody noticing. The user
   * gave these six as prompt text — *"big boobs, bubble butt, big thighs, very long calves"* — and
   * a well-meaning edit that replaced them with clinical synonyms would change what the camera is
   * asked for while leaving the page looking finished. This is a NEGATIVE assertion on purpose:
   * phase 1 owns the spelling and asserts the words in `tests/nina.imageprefs.test.ts`, so
   * restating them here would be a second source of truth for the same requirement.
   */
  it('has not sanitised the option names into clinical synonyms', () => {
    const labels = NINA_IMAGE_FOCUS_KEYS.map((key) => imageFocusCopy(key).label)
      .join(' ')
      .toLowerCase()
    for (const clinical of ['mammary', 'gluteal', 'gluteus', 'adipose', 'posterior', 'bust']) {
      expect(labels, `a focus label says "${clinical}"`).not.toContain(clinical)
    }
  })

  it('reads the length band off phase 1 and names it beside the slider', () => {
    for (const value of [NINA_IMAGE_PROMPT_LENGTH_MIN, 50, NINA_IMAGE_PROMPT_LENGTH_MAX]) {
      const copy = promptLengthCopy(value)
      expect(copy.label.length).toBeGreaterThan(0)
      expect(copy.hint.length).toBeGreaterThan(0)
    }
    /* The bottom and the top of the scale must not read as the same band, or the slider is a
     * control the operator cannot predict — the fork the index settled by putting it on the repo's
     * five-band scale. */
    expect(promptLengthCopy(NINA_IMAGE_PROMPT_LENGTH_MIN).band).not.toBe(
      promptLengthCopy(NINA_IMAGE_PROMPT_LENGTH_MAX).band,
    )
    /* And the band the hub card prints is one phase 1 declares, not a string this file invented. */
    for (const value of [NINA_IMAGE_PROMPT_LENGTH_MIN, 50, NINA_IMAGE_PROMPT_LENGTH_MAX]) {
      expect(NINA_PROMPT_LENGTH_RUNGS.map((rung) => rung.label)).toContain(
        promptLengthCopy(value).band,
      )
    }
  })

  it('falls back to a readable label for a key it has never heard of', () => {
    expect(hasImageFocusCopy('some_new_option')).toBe(false)
    expect(imageFocusCopy('some_new_option').label).toBe('Some new option')
    expect(imageFocusCopy('some_new_option').hint).toBe('')
    expect(prettifyFocusKey('butt')).toBe('Bubble butt')
  })

  it("spells the none-reference kind with a value phase 1 still declares", () => {
    /* `IMAGE_REFERENCE_NONE` is the ONE literal in this phase that names a member of phase 1's
     * reference vocabulary. If phase 1 renames it, this fails here rather than at save time. */
    expect(NINA_IMAGE_REFERENCE_SOURCES).toContain(IMAGE_REFERENCE_NONE.source)
    expect(IMAGE_REFERENCE_NONE.id).toBeNull()
  })

  it('stands the preview scene in with a real sentence', () => {
    expect(ADMIN_IMAGE_PREVIEW_SCENE.trim().length).toBeGreaterThan(0)
    expect(ADMIN_IMAGE_PREVIEW_SCENE).toBe(ADMIN_IMAGE_PREVIEW_SCENE.trim())
  })
})

describe('the reference option — what a tile may know', () => {
  it('maps a row to url and thumbUrl, defaulting a missing thumb to null', () => {
    expect(
      toImageReferenceOption({ source: 'chat', id: 'img_1', blobUrl: 'https://b/1.png' }),
    ).toEqual({ key: 'chat:img_1', url: 'https://b/1.png', thumbUrl: null })
    expect(
      toImageReferenceOption({
        source: 'album',
        id: 'av_1',
        url: 'https://b/2.png',
        thumbUrl: 'https://b/2t.png',
      }).thumbUrl,
    ).toBe('https://b/2t.png')
  })

  it('carries no caption, no filename and no date — R10s whole point', () => {
    const option = toImageReferenceOption({
      source: 'album',
      id: 'av_1',
      blobUrl: 'https://b/2.png',
    })
    /* PHASE 5 DEPENDS ON THIS EXACT FIELD LIST. `ImageReferenceOption` is structurally identical to
     * phase 5's `PhotoReferenceItem`, which is what lets phase 5 write `items={references}` without
     * importing anything from this phase — and the absence of `source` is what makes phase 5's
     * "no tile announces its set" exit criterion structural rather than a promise. */
    expect(Object.keys(option).sort()).toEqual(['key', 'thumbUrl', 'url'])
  })

  it('identifies one photograph across the two sets', () => {
    expect(referenceKey({ source: 'album', id: 'x' })).not.toBe(
      referenceKey({ source: 'chat', id: 'x' }),
    )
    /* Round-trips, which is what the picker's opaque-string contract rests on. */
    expect(parseReferenceKey(referenceKey({ source: 'album', id: 'av_1' }))).toEqual({
      source: 'album',
      id: 'av_1',
    })
    expect(referenceKey(IMAGE_REFERENCE_NONE)).toBe('')
    expect(parseReferenceKey('')).toEqual(IMAGE_REFERENCE_NONE)
    expect(parseReferenceKey('shots:x')).toEqual(IMAGE_REFERENCE_NONE)
    expect(parseReferenceKey('album:')).toEqual(IMAGE_REFERENCE_NONE)
    expect(referenceKey(IMAGE_REFERENCE_NONE)).toBe(referenceKey({ ...IMAGE_REFERENCE_NONE }))
  })
})

describe('changedImageGenFields — what the operator sees as unsaved', () => {
  it('is empty for two identical drafts', () => {
    expect(changedImageGenFields(DEFAULTS, DEFAULTS)).toEqual([])
    expect(imageGenDraftEquals(DEFAULTS, toImageGenDraft(NINA_IMAGE_PREFS_DEFAULTS))).toBe(true)
  })

  it('names the five scalar fields in a fixed order', () => {
    const edited: ImageGenDraft = {
      ...DEFAULTS,
      promptLength: DEFAULTS.promptLength === NINA_IMAGE_PROMPT_LENGTH_MAX ? 0 : NINA_IMAGE_PROMPT_LENGTH_MAX,
      wardrobe: 'long hugging leggings with string bra',
      venue: 'Kuta streets in Bali',
      time: 'rainy night',
      notes: 'nina is full of sweat',
    }
    expect(changedImageGenFields(edited, DEFAULTS)).toEqual([
      'promptLength',
      'wardrobe',
      'venue',
      'time',
      'notes',
    ])
    expect(imageGenDraftEquals(edited, DEFAULTS)).toBe(false)
  })

  it('names a flipped focus option by its own dotted path, after the scalars', () => {
    const key = NINA_IMAGE_FOCUS_KEYS[0]
    const flipped: ImageGenDraft = {
      ...DEFAULTS,
      focus: { ...DEFAULTS.focus, [key]: !(DEFAULTS.focus[key] ?? false) },
    }
    expect(changedImageGenFields(flipped, DEFAULTS)).toEqual([`focus.${key}`])
  })

  it('treats an absent focus key as OFF on both sides, so it is not a spurious difference', () => {
    const bare: ImageGenDraft = { ...DEFAULTS, focus: {} }
    const allOff: ImageGenDraft = {
      ...DEFAULTS,
      focus: Object.fromEntries(NINA_IMAGE_FOCUS_KEYS.map((key) => [key, false])),
    }
    expect(changedImageGenFields(bare, allOff)).toEqual([])
  })

  it('names the reference as ONE path, so a picked photo reads as one unsaved change', () => {
    const picked: ImageGenDraft = { ...DEFAULTS, reference: { source: 'album', id: 'av_1' } }
    expect(changedImageGenFields(picked, DEFAULTS)).toEqual(['reference'])
    expect(changedImageGenFields(DEFAULTS, picked)).toEqual(['reference'])
  })

  it('counts a focus key that exists on one side only', () => {
    const missing: ImageGenDraft = { ...DEFAULTS, focus: {} }
    const on: ImageGenDraft = {
      ...DEFAULTS,
      focus: Object.fromEntries(NINA_IMAGE_FOCUS_KEYS.map((key) => [key, true])),
    }
    expect(changedImageGenFields(missing, on)).toHaveLength(NINA_IMAGE_FOCUS_KEYS.length)
  })
})

describe('focusOnKeys — what the header counts', () => {
  it('returns phase 1s declared order and nothing else', () => {
    const all: ImageGenDraft = {
      ...DEFAULTS,
      focus: Object.fromEntries(NINA_IMAGE_FOCUS_KEYS.map((key) => [key, true])),
    }
    expect(focusOnKeys(all)).toEqual([...NINA_IMAGE_FOCUS_KEYS])
    expect(focusOnKeys({ ...DEFAULTS, focus: {} })).toEqual([])
    /* A key the row holds and phase 1 does not declare is not counted: the six the user named are
     * the six the header is about. */
    expect(focusOnKeys({ ...DEFAULTS, focus: { invented: true } })).toEqual([])
  })
})

describe('ninaImagePrefsWriteSchema — the boundary', () => {
  it('accepts the default prefs as a payload', () => {
    expect(ninaImagePrefsWriteSchema.safeParse(payload()).success).toBe(true)
  })

  it('refuses a missing focus option rather than defaulting it', () => {
    const rest = { ...DEFAULTS.focus }
    delete rest[NINA_IMAGE_FOCUS_KEYS[0]]
    expect(ninaImagePrefsWriteSchema.safeParse(payload({ focus: rest })).success).toBe(false)
  })

  it('refuses a focus key nobody declared, instead of stripping it', () => {
    const focus = { ...DEFAULTS.focus, bigThighss: true }
    expect(ninaImagePrefsWriteSchema.safeParse(payload({ focus })).success).toBe(false)
  })

  it('refuses a non-boolean toggle', () => {
    /* Cast because the point of the case is a value the DRAFT type forbids and a browser could
     * still send: Zod is the runtime check. */
    const stringly = { ...DEFAULTS.focus, [NINA_IMAGE_FOCUS_KEYS[0]]: 'true' } as unknown as Record<
      string,
      boolean
    >
    expect(ninaImagePrefsWriteSchema.safeParse(payload({ focus: stringly })).success).toBe(false)
  })

  it('refuses a prompt length outside phase 1s own range, and a fractional one', () => {
    for (const bad of [NINA_IMAGE_PROMPT_LENGTH_MIN - 1, NINA_IMAGE_PROMPT_LENGTH_MAX + 1, 42.5, Number.NaN]) {
      expect(
        ninaImagePrefsWriteSchema.safeParse(payload({ promptLength: bad })).success,
        `${bad}`,
      ).toBe(false)
    }
    for (const good of [NINA_IMAGE_PROMPT_LENGTH_MIN, NINA_IMAGE_PROMPT_LENGTH_MAX]) {
      expect(ninaImagePrefsWriteSchema.safeParse(payload({ promptLength: good })).success).toBe(true)
    }
  })

  it('bounds all four free-text fields, and accepts each empty', () => {
    expect(
      ninaImagePrefsWriteSchema.safeParse(payload({ wardrobe: '', venue: '', time: '', notes: '' }))
        .success,
    ).toBe(true)
    const bounds: [keyof ImageGenDraft, number][] = [
      ['wardrobe', NINA_IMAGE_WARDROBE_MAX],
      ['venue', NINA_IMAGE_VENUE_MAX],
      ['time', NINA_IMAGE_TIME_MAX],
      ['notes', NINA_IMAGE_NOTES_MAX],
    ]
    for (const [field, max] of bounds) {
      /* The panel's `maxLength` and this schema must be the SAME number, or the field refuses a
       * keystroke the action would have accepted. One home, two readers. */
      expect(
        ninaImagePrefsWriteSchema.safeParse(payload({ [field]: 'x'.repeat(max) })).success,
        `${field} at exactly ${max}`,
      ).toBe(true)
      expect(
        ninaImagePrefsWriteSchema.safeParse(payload({ [field]: 'x'.repeat(max + 1) })).success,
        `${field} at ${max + 1}`,
      ).toBe(false)
    }
  })

  it('accepts a reference that names a photograph, and the none reference', () => {
    for (const source of NINA_IMAGE_REFERENCE_SOURCES.filter(
      (value) => value !== IMAGE_REFERENCE_NONE.source,
    )) {
      expect(
        ninaImagePrefsWriteSchema.safeParse(payload({ reference: { source, id: 'av_1' } })).success,
        kind,
      ).toBe(true)
    }
    expect(
      ninaImagePrefsWriteSchema.safeParse(payload({ reference: IMAGE_REFERENCE_NONE })).success,
    ).toBe(true)
  })

  it('refuses the two references that would fail invisibly', () => {
    /* A kind with no id names a SET and no photograph; an id under the none kind is an unselected
     * reference still carrying one. Either round-trips through the panel looking fine and then
     * hands phase 6 a job it cannot anchor. */
    expect(
      ninaImagePrefsWriteSchema.safeParse(payload({ reference: { source: 'album', id: '' } }))
        .success,
    ).toBe(false)
    expect(
      ninaImagePrefsWriteSchema.safeParse(
        payload({ reference: { source: IMAGE_REFERENCE_NONE.source, id: 'av_1' } }),
      ).success,
    ).toBe(false)
  })

  it('refuses a reference kind nobody declared, and an over-long id', () => {
    expect(
      ninaImagePrefsWriteSchema.safeParse(payload({ reference: { source: 'shots', id: 'x' } }))
        .success,
    ).toBe(false)
    expect(
      ninaImagePrefsWriteSchema.safeParse(
        payload({ reference: { source: 'album', id: 'x'.repeat(NINA_IMAGE_REFERENCE_ID_MAX + 1) } }),
      ).success,
    ).toBe(false)
  })

  it('refuses an empty userId, which requireAdmin would never produce', () => {
    expect(ninaImagePrefsWriteSchema.safeParse(payload({ userId: '' } as never)).success).toBe(false)
    expect(ninaImagePrefsResetSchema.safeParse({ userId: '' }).success).toBe(false)
    expect(ninaImagePrefsResetSchema.safeParse({ userId: 'user_1' }).success).toBe(true)
  })
})

/* ── the structural half ─────────────────────────────────────────────────────────────────────── */

const ACTIONS = 'lib/admin/imageGenActions.ts'
const MODEL = 'lib/admin/imageGenModel.ts'
const PANEL = 'components/admin/ImageGenPanel.tsx'
const PAGE = 'app/admin/image-generation/page.tsx'

/**
 * A source file with its block comments removed. `tests/admin.tuning.test.ts`'s `codeOnly` and its
 * argument verbatim: these files must CARRY docstrings that name `server-only` and the guarded
 * entry points in order to explain the boundary, and a raw `String.contains` cannot tell a boundary
 * being documented from one being crossed. Scanning code only is strictly stronger, because it
 * cannot be satisfied by a rewording.
 */
function codeOnly(path: string): string {
  return readFileSync(path, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
}

describe('the gate cannot be forgotten — plan invariant 6', () => {
  /*
   * ── RECONCILED: THIS TEST IS SPLIT IN TWO, AND PHASE 6 IS WHY ────────────────────────────────
   * `tests/admin.tuning.test.ts:308-321` is the template, and it loops over EVERY
   * `export async function` in the action file asserting both `await requireAdmin()` AND
   * `.safeParse(`, with the gate first. Copied verbatim, that loop **fails once phase 6 lands**,
   * because phase 6 appends two more actions to THIS file and neither of them parses with Zod:
   *
   *   - `runNinaImageTestAction()` takes **no arguments at all** — that is the design, not an
   *     oversight: there is no payload to forge, so there is nothing to parse, and an empty
   *     `z.object({})` added to satisfy a grep would be cargo cult.
   *   - `readNinaImageTestAction(jobId)` shape-checks its one argument with `isValidId`, which is
   *     `parseNinaJumpParam`'s and `/nina/jobs/[id]`'s precedent. A nanoid is not a shape Zod adds
   *     anything to.
   *
   * Phase 6 raised this as its Handoff 5 — *"the one concrete cross-phase collision found"* — and
   * offered two resolutions. **The reconciler took its option (b), the stronger one:** the
   * `requireAdmin`-is-first half keeps looping over every export, forever, including the two phase 6
   * has not written yet; the `.safeParse` half applies only to the actions that actually take a
   * payload, named explicitly. Option (a) — scoping the whole loop to this phase's two names —
   * would have silently stopped asserting invariant 6 over phase 6's actions, which is the half
   * that matters and the half that must not be narrowed.
   *
   * **Phase 6 does not edit this file.** It is not on its Owns list and it must not become so.
   */
  it('opens EVERY action with requireAdmin(), including ones later phases append', () => {
    const bodies = readFileSync(ACTIONS, 'utf8').split('export async function ').slice(1)
    expect(bodies.length).toBeGreaterThan(0)
    for (const body of bodies) {
      const name = body.slice(0, body.indexOf('('))
      const gate = body.indexOf('await requireAdmin()')
      expect(gate, `${name} does not gate`).toBeGreaterThan(-1)
      /* First statement, so nothing above it can read a client-supplied argument. `requireAdmin`
       * exits by throwing framework control flow (`redirect('/')` / `notFound()`), which is why it
       * must never be wrapped in a bare try/catch either. */
      const bodyStart = body.indexOf('{')
      expect(body.slice(bodyStart, gate)).not.toMatch(/\bawait\b(?!\s+requireAdmin)/)
    }
  })

  it('parses the payload with Zod, after the gate, in the two actions that take one', () => {
    /* Named rather than looped, for the reason above. When phase 6 lands, its two actions are
     * covered by the requireAdmin loop and by its own `tests/admin.imagegenTest.test.ts`. */
    const source = readFileSync(ACTIONS, 'utf8')
    for (const name of ['saveNinaImagePrefsAction', 'resetNinaImagePrefsAction']) {
      const body = source.slice(source.indexOf(`export async function ${name}`))
      const gate = body.indexOf('await requireAdmin()')
      const zod = body.indexOf('.safeParse(')
      expect(gate, `${name} does not gate`).toBeGreaterThan(-1)
      expect(zod, `${name} does not parse`).toBeGreaterThan(-1)
      expect(gate, `${name} parses before it gates`).toBeLessThan(zod)
    }
  })

  it('gates the page before it reads anything', () => {
    const source = readFileSync(PAGE, 'utf8')
    const gate = source.indexOf('await requireAdmin()')
    expect(gate).toBeGreaterThan(-1)
    for (const read of ['readNinaImagePrefs(', 'readNinaTuning(', 'listNinaPhotoReferences(']) {
      expect(gate, `${read} runs before the gate`).toBeLessThan(source.indexOf(read))
    }
  })

  it('declares force-dynamic for the recorded reason', () => {
    expect(readFileSync(PAGE, 'utf8')).toContain("export const dynamic = 'force-dynamic'")
  })
})

describe('one save, not eleven — plan invariant 7', () => {
  /*
   * ── RECONCILED: AN ALLOWLIST, NOT A COUNT ───────────────────────────────────────────────────
   * The draft of this test asserted `toHaveLength(2)` and this plan's Handoffs told phase 6 to
   * raise it "to 3". **Both numbers were wrong and the mechanism was worse than the numbers.**
   *
   *   - Phase 6 appends **two** actions to this file, not one — `runNinaImageTestAction` and
   *     `readNinaImageTestAction` (its Interface Contract lists both) — so the count would go to
   *     four.
   *   - `tests/admin.imagegen.test.ts` is **this phase's file**. It is on no other phase's Owns
   *     list, and phase 6's Files table does not include it. So a count that has to be edited when
   *     phase 6 lands is a change **nobody owns**: phase 6 would be editing a test it was told to
   *     leave alone, in the same wave, to make it pass. That is how a green suite becomes a merge
   *     conflict.
   *
   * So the invariant is expressed as an ALLOWLIST that is already correct for both phases. It is
   * strictly stronger than a count: a count says "how many", which nobody can check the meaning
   * of, while this says WHICH — and it still fails loudly if anyone adds an action neither phase
   * planned, which is the speed bump the count was reaching for.
   *
   * Plan invariant 7 is *"one save per surface, not one per field"*, and that is what the second
   * assertion below pins: the two prefs actions are a save and a reset, and phase 6's two are a
   * different KIND of action — one spends money, one polls a job — not one more field.
   */
  it('exports only planned actions: this phase\'s two, plus phase 6\'s two', () => {
    const source = readFileSync(ACTIONS, 'utf8')
    const exported = (source.match(/^export async function (\w+)/gm) ?? []).map((line) =>
      line.replace('export async function ', ''),
    )
    const planned = [
      /* Phase 4 — R4-R10's UI half. One whole-prefs save, one reset. */
      'saveNinaImagePrefsAction',
      'resetNinaImagePrefsAction',
      /* Phase 6 — R11/R12. Named here so this file needs no edit when phase 6 lands. */
      'runNinaImageTestAction',
      'readNinaImageTestAction',
    ]
    for (const name of exported) {
      expect(planned, `unplanned action ${name} — add it to a plan before adding it here`).toContain(
        name,
      )
    }
    expect(exported).toContain('saveNinaImagePrefsAction')
    expect(exported).toContain('resetNinaImagePrefsAction')
  })

  it('sends every control in the one save call', () => {
    /* The panel must not gain a second action for the picker or for any field. Read the call site:
     * every member of the draft has to appear in the one payload. */
    const source = codeOnly(PANEL)
    const call = source.slice(source.indexOf('saveNinaImagePrefsAction({'))
    for (const field of [
      'promptLength',
      'focus',
      'wardrobe',
      'venue',
      'time',
      'notes',
      'reference',
    ]) {
      expect(call, `the save call omits ${field}`).toContain(field)
    }
  })

  it('writes through phase 1s query and revalidates this page', () => {
    const source = readFileSync(ACTIONS, 'utf8')
    expect(source).toContain('writeNinaImagePrefs(')
    expect(source).toContain("revalidatePath('/admin/image-generation')")
  })
})

describe('the client half stays client-safe — plan invariant 9', () => {
  it('keeps imageGenModel client-safe: its only import is phase 1s zero-import module', () => {
    const source = codeOnly(MODEL)
    const imports = source.match(/^import[\s\S]*?from '([^']+)'/gm) ?? []
    expect(imports.length).toBeGreaterThan(0)
    for (const line of imports) expect(line).toContain("from '@/lib/nina/imageprefs'")
    expect(source).not.toContain('server-only')
    expect(source).not.toContain('@/lib/db')
    expect(source).not.toContain('zod')
  })

  it("declares 'use client' and reaches nothing server-only", () => {
    expect(readFileSync(PANEL, 'utf8').startsWith("'use client'")).toBe(true)
    const source = codeOnly(PANEL)
    for (const forbidden of [
      'server-only',
      '@/lib/nina/queries',
      '@/lib/db/',
      '@/lib/env',
      '@/lib/admin/requireAdmin',
      '@/lib/admin/schema',
      '@/components/ui/AppShell',
    ]) {
      expect(source, `${PANEL} reaches ${forbidden}`).not.toContain(forbidden)
    }
  })
})

describe('the preview is an assembly, not a call — plan invariant 5', () => {
  it('assembles the prompt with phase 2s builder and awaits no model entry point', () => {
    const source = codeOnly(PAGE)
    expect(source).toContain('buildNinaImagePrompt(')
    /* `scripts/check-llm-payload-boundary.mjs` Rule 2's table, in full. A page that names one of
     * these has either become a model caller or is about to. */
    for (const guarded of [
      'runNinaTurn',
      'distillNinaMemory',
      'describeNinaImage',
      'resolveNinaPromises',
      'getOrCreateInsight',
      'titleNinaSessionIfNeeded',
      'rankNinaSearchHits',
      'runNinaImageJob',
    ]) {
      expect(source, `the image-generation page names ${guarded}`).not.toContain(guarded)
    }
  })

  it('stands the scene in from the one exported constant, so phase 6 can send the same one', () => {
    expect(codeOnly(PAGE)).toContain('ADMIN_IMAGE_PREVIEW_SCENE')
  })
})

describe('the photo reference round-trips before the picker exists (R10)', () => {
  it('keeps the selection in the same draft as every other control', () => {
    const picked: ImageGenDraft = { ...DEFAULTS, reference: { source: 'album', id: 'av_9' } }
    expect(changedImageGenFields(picked, DEFAULTS)).toEqual(['reference'])
    expect(ninaImagePrefsWriteSchema.safeParse(payload(picked)).success).toBe(true)
  })

  it('hands the panel the options mapped on the server, not a row', () => {
    /* Invariant 9: the page maps, the panel receives plain objects. If the page ever passed
     * `referenceRows` straight through, a drizzle row shape would cross into a client component. */
    const source = codeOnly(PAGE)
    expect(source).toContain('referenceRows.map(toImageReferenceOption)')
  })
})
```

**Impact:** One new test file. It reads source paths relative to the repo root, which is `vitest`'s
cwd — the convention `tests/admin.tuning.test.ts` already relies on.

---

### Step 10: `tests/admin.shell.test.ts`

**File:** `tests/admin.shell.test.ts` — the nav describe (`:100-156`) and the geometry describe
(`:158-197`)
**Change:** Six cells, `grid-cols-3 grid-rows-2`, `8rem`. The two numbers must change together,
which is what this file exists for.

**Code — replace lines 101-129 (the two nav cases) with:**

```ts
  it('points every entry at a route that exists', () => {
    const hrefs = [...adminNav.matchAll(/href: '(\/admin[^']*)'/g)].map((m) => m[1])
    expect(hrefs).toEqual([
      '/admin',
      '/admin/nina',
      '/admin/personality',
      '/admin/image-generation',
      '/admin/photos',
      '/admin/memory',
    ])
    for (const href of hrefs) {
      expect(existsSync(`${ROOT}app${href}/page.tsx`), `${href} has no page.tsx`).toBe(true)
    }
  })

  it('carries a phone label short enough for its cell', () => {
    // The bar is a 3x2 grid since the sixth route, so a cell is 414px / 3 = 138px — up from
    // 82.8px at five across. The 8-character ceiling is KEPT anyway: it was tightened from 10 when
    // the fifth cell landed, all six clear it (Overview 8, Album 5, Persona 7, Images 6, Photos 6,
    // Memory 6), and a label past eight characters at text-[11px] wants a shorter true form rather
    // than a wider cell. `the bar and the padding that clears it` below is what asserts that the
    // grid really is 3x2 and not six across, where 69px would clip every one of these.
    // `m[1]!` per `tests/tabbar.geometry.test.ts:86`, the sibling guard this file borrows its
    // shape from: a capture group that matched is a string, and `noUncheckedIndexedAccess`
    // cannot see that.
    const shorts = [...adminNav.matchAll(/short: '([^']*)'/g)].map((m) => m[1]!)
    expect(shorts).toHaveLength(6)
    for (const short of shorts) {
      expect(short.length, `"${short}" will not fit a nav cell`).toBeLessThanOrEqual(8)
    }
  })
```

**Code — replace the whole `describe('the bar and the padding that clears it', ...)` block
(lines 158-197) with:**

```ts
describe('the bar and the padding that clears it', () => {
  /*
   * THE CASE THIS FILE EXISTS FOR. The bar's height lives in `AdminNav`'s `h-28` and the clearance
   * under `<main>` lives in the layout's `pb-[calc(8rem+var(--safe-bottom))]`; Tailwind can read
   * neither from a TypeScript constant, so the geometry is spelled twice by necessity —
   * `components/ui/AppShell.tsx` cites `TAB_BAR_HEIGHT_PX` in a comment for the same reason. If the
   * bar grows and the padding does not, the last card of every admin page sits under it, on the one
   * device this phase was written for.
   *
   * The ROW COUNT joined the matched shape when the sixth admin route landed. Six single-row cells
   * would have been 69px wide at 414px — under the 8-character ceiling above and under
   * `docs/design-brief.md`'s 44pt target on the horizontal axis — so the bar became
   * `grid-cols-3 grid-rows-2` at `h-28`, which keeps a 56px-tall cell and widens it to 138px. Both
   * numbers are captured, because a cell's tap target is now the height DIVIDED by the row count
   * and a guard that read `h-28` as one cell would pass a bar with four rows of 28px.
   *
   * The matched shape is `TabBar`'s own formatted row with this bar's numbers in it, so the class
   * sorter produces it rather than breaking it — verified against `prettier-plugin-tailwindcss`
   * 0.8.1 / `tailwindcss` 4.3.3, which sorts `grid-rows-*` immediately after `grid-cols-*`.
   */
  const bar = navClasses.match(/grid h-(\d+) w-full max-w-\[470px\] grid-cols-(\d+) grid-rows-(\d+)/)
  const clearance = layoutClasses.match(/pb-\[calc\((\d+(?:\.\d+)?)rem\+var\(--safe-bottom\)\)\]/)
  const cellCount = [...adminNav.matchAll(/short: '([^']*)'/g)].length

  it('spells both halves in the shape this case can read', () => {
    expect(
      bar,
      'AdminNav lost its `grid h-<n> w-full max-w-[470px] grid-cols-<n> grid-rows-<n>` row',
    ).not.toBeNull()
    expect(clearance, 'the admin layout lost its --safe-bottom clearance on <main>').not.toBeNull()
  })

  it('has exactly one cell per route, with no empty cell and no overflow row', () => {
    expect(Number(bar![2]) * Number(bar![3])).toBe(cellCount)
  })

  it('reserves more room than the bar occupies', () => {
    // Tailwind spacing: --spacing is 0.25rem, so `h-28` is 28 * 4 = 112px. The +1 is the
    // `border-t`, which is part of the nav's border box and therefore part of what has to be
    // cleared.
    const barPx = Number(bar![1]) * 4 + 1
    const clearancePx = Number(clearance![1]) * 16
    expect(clearancePx).toBeGreaterThan(barPx)
  })

  it('gives every cell a tap target past the 44pt minimum, on both axes', () => {
    // docs/design-brief.md:175 — "Minimum 44 × 44pt tap targets", and the iOS constraints win over
    // any conflicting design output (line 18). A row is the bar's height over its row count; a
    // column is 414px — the XS Max portrait width — over its column count.
    expect((Number(bar![1]) * 4) / Number(bar![3])).toBeGreaterThanOrEqual(44)
    expect(414 / Number(bar![2])).toBeGreaterThanOrEqual(44)
  })

  it('keeps a cell wide enough for an eight-character label at text-[11px]', () => {
    // 82.8px is the five-across width the 8-character ceiling above was calibrated against. A
    // narrower cell than that is a cell those labels no longer fit, whatever the row count says.
    expect(414 / Number(bar![2])).toBeGreaterThanOrEqual(82.8)
  })
})
```

**Impact:** Every other case in the file is untouched, including
`changes shape at exactly one breakpoint, and it is lg` — the layout gains no new variant.

---

## Verification

**Precondition:** the worktree has no `node_modules`. Run these two first or every command below
fails at module resolution, and `lib/env.ts` validates 14 variables at load so the `.env.local`
copy is not optional either:

```
cd /home/miftah/.worktrees/run-insights/nina-image-generation-tab
cp /home/miftah/run-insights/.env.local .env.local
npm install
```

**Build:**

```
npm run typecheck
npm run lint
npm run format:check
npm run build
```

`npm run format:check` is not optional in this phase. Two of its assertions —
`tests/admin.shell.test.ts`'s `grid h-(\d+) w-full max-w-\[470px\] grid-cols-(\d+) grid-rows-(\d+)`
and the clearance regex — match a class string in the order `prettier-plugin-tailwindcss` produces.
If the formatter reorders the `<ul>` class, the guard silently stops matching and
`spells both halves in the shape this case can read` fails. The sorted order was measured against
this repo's own `prettier` 3.9.6 + `prettier-plugin-tailwindcss` 0.8.1 + `tailwindcss` 4.3.3 and is:

```
mx-auto grid h-28 w-full max-w-[470px] grid-cols-3 grid-rows-2 lg:mx-0 lg:block lg:h-auto lg:max-w-none lg:space-y-1
```

**Tests:**

```
npm test -- tests/admin.imagegen.test.ts tests/admin.shell.test.ts tests/admin.tuning.test.ts
npm test
npm run ci:client-secret-guard
npm run ci:llm-payload-guard
npm run ci:data-layer-guard
npm run ci:openrouter-guard
```

`tests/admin.tuning.test.ts` is in the first list although this phase does not edit it: it reads
`lib/admin/schema.ts` through `ninaTuningWriteSchema`, and step 2 appends to that file.

**Manual check** (needs a database; `/admin` will not serve from a Vercel preview — `ADMIN_EMAILS`,
`AUTH_URL` and `VAPID_*` are Production-scope only, so probe a local production build):

```
npm run build && npx next start -p 3123
```

Port 3000 is held by a stranger that 302s everything to `/login`; use another port.

1. `/admin` — five cards; the new one prints the length band, the emphasis count and the reference
   state.
2. `/admin/image-generation` — the slider, six checkboxes with the user's own words on them, four
   fields, the reference block, and the assembled prompt in the disclosure.
3. At 414 px wide (device toolbar, iPhone XS Max): the bar is two rows of three cells, every label
   is on one line and uncut, and the bottom card of the page is fully scrollable clear of the bar.
4. Tick two focus options, type in all four fields, Save. The header says `saved as revision N`,
   the disclosure's prompt changes, and the four body facts are in it. Untick all six, Save again:
   the four body facts are still in it (plan invariant 4, verified through the real assembler).
5. Reset to defaults, confirm. Every control returns to its shipping value and the revision bumps.
6. `/admin/personality` still shows its Wardrobe field. That is correct until phase 7.

**Exit criteria:**

- `/admin/image-generation` renders the prompt-length slider, six focus checkboxes and four
  free-text fields; one save writes one row and reports the returned revision.
- Every label, hint and bound on the page comes from `lib/nina/imageprefs.ts` — `grep -n "'big " components/admin/ImageGenPanel.tsx`
  returns nothing.
- `lib/admin/imageGenActions.ts` exports exactly two async functions and each opens with
  `await requireAdmin()`.
- The nav shows six cells; `tests/admin.shell.test.ts` passes, with the bar's height and the
  layout's reserve asserted against each other.
- The preview is `buildNinaImagePrompt` and no guarded model entry point is named on the page;
  `npm run ci:llm-payload-guard` is green.
- The selected photo reference survives a save and a reload with no picker in the tree.
- `npm test` is green in full, and `/admin/personality` is byte-identical to its pre-phase state.

---

## Handoffs

**Phase 5 — the photo-reference picker.** The seam is a `<section>` in `ImageGenPanel.tsx` marked
with the literal `SEAM — PHASE 5`. It replaces that `<section>` with

```tsx
<PhotoReferencePicker
  items={references}
  total={photoTotal}
  value={referenceKey(draft.reference)}
  onChange={(next) => setDraft({ ...draft, reference: parseReferenceKey(next) })}
  disabled={pending}
/>
```

plus one import, and nothing else in this phase changes: `references` and `photoTotal` are already
mapped on the server, `draft.reference` is already the selection, and `referenceKey` /
`parseReferenceKey` are already the encode/decode pair.

`ImageReferenceOption` lives in `lib/admin/imageGenModel.ts` because the page that maps it is mine,
and it **must stay structurally identical to phase 5's `PhotoReferenceItem`** — exactly
`{ key, url, thumbUrl }`, with **no** `source`, `createdAt`, filename or caption. That is what lets
phase 5 write `items={references}` without importing from a module this phase cannot see, and it is
what makes phase 5's *"nothing in the grid announces which set a photograph came from"* exit
criterion true by construction rather than by discipline. Both phases' tests assert the field list.

**Phase 6 — the test prompt.** The seam is a `<p>` in `ImageGenPanel.tsx` marked with the literal
`SEAM — PHASE 6`, placed after the assembled-prompt disclosure and before the Save row. It becomes
`<ImageGenTestPanel dirty={dirty} />` — `dirty` and nothing else; the component's prop list is
phase 6's and it declares `{ dirty?: boolean }`. Three things are left for it deliberately:

- `export const maxDuration` on `app/admin/image-generation/page.tsx`. Not declared here: this
  phase awaits three indexed reads and a `maxDuration` with nothing expensive under it is a number
  nobody can justify when they find it.
- The **two** further exported actions in `lib/admin/imageGenActions.ts` —
  `runNinaImageTestAction` and `readNinaImageTestAction`. **RECONCILED: phase 6 edits no test of
  mine.** `tests/admin.imagegen.test.ts` names both of phase 6's actions in its allowlist already,
  and its `requireAdmin`-is-first loop covers them the moment they exist while its `.safeParse` half
  is scoped to the two actions that take a payload. Phase 6's `runNinaImageTestAction` takes no
  arguments and `readNinaImageTestAction` shape-checks a nanoid with `isValidId`, so neither parses
  with Zod and neither should. Phase 6's Handoff 5 raised exactly this collision; this is the
  resolution, and it lives on my side of the seam because the test is my file.
- `ADMIN_IMAGE_PREVIEW_SCENE` is exported from `lib/admin/imageGenModel.ts` for phase 6 to send.
  **Send that constant, not a new one**: a verdict on a prompt the operator never read is not a
  verdict on R11's question.

**Phase 7 — the wardrobe's retirement.** `/admin/personality`'s Wardrobe input, `TuningDraft.wardrobe`,
`ninaTuningWriteSchema.wardrobe` and `NINA_WARDROBE_MAX` are all untouched here. This phase's
`wardrobe` field is the destination; the two coexist until phase 7, and the tree builds with both.
`ImageGenPanel`'s wardrobe hint deliberately does not say "moved from the Personality tab", because
that sentence is only true after phase 7 lands and a hint that anticipates a phase is a hint that
lies for a week.

**Phase 2 — the length ladder's visible half.** `promptLengthCopy`'s hint says only which band the
slider is in and points at the preview. It makes no claim about what a rung adds, because that is
phase 2's and a hint that described the ladder would be the panel promising behaviour the assembler
owns. If phase 2 lands a per-band `axis` string on its ladder, `promptLengthCopy` should read it —
one line, and it makes the hint strictly better.

**Not done, deliberately (no phase owns these; open a card if wanted):**

- `components/admin/.workflows/package_readme.md` is not updated for `ImageGenPanel`. The set's
  phase 7 owns the two affected package readmes and touching one from here would collide.
- `docs/design-brief.md` is not amended for the 3x2 admin bar. The brief describes the runner's
  app; the admin shell's geometry is documented in the two files that spell it and in the test that
  pairs them.
- The `<img>` in the reference block uses a raw tag with an eslint disable, as `ChatPhotoGrid`
  already does for Blob URLs of unknown dimensions. Migrating the admin surface's images to
  `next/image` is a separate piece of work.

---

## Rollback

This phase is one commit on `feature/nina-image-generation-tab`; `git revert` is the unit and no
database step is involved — it writes to `nina_image_prefs`, which phase 1 created, and it adds no
column and no migration.

Reverting alone is safe while phases 5 and 6 are unmerged. After either has landed, revert those
first: phase 5 mounts a component inside `ImageGenPanel.tsx` and phase 6 appends an action to
`lib/admin/imageGenActions.ts`, so both would leave a dangling import.

The two-file geometry pair is the only thing that can be half-reverted into a visible bug: if
`components/admin/AdminNav.tsx` goes back to `grid-cols-5 h-14` while `app/admin/layout.tsx` keeps
`8rem`, every admin page gains 48 px of dead space at the bottom; the other way round, the last
card sits under the bar. `tests/admin.shell.test.ts` fails in the second case and not the first, so
after any partial revert run `npm test -- tests/admin.shell.test.ts` and read the bar's height and
the clearance out of the two files by hand.

Rows already written to `nina_image_prefs` by this phase's save survive the revert and are read by
phase 2's assembler, so an unanchored generation continues to use them. Nothing has to be undone in
the database.
