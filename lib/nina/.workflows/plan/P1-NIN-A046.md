> Adopted from `NINA_QUERIES_SPLIT_PLAN.md` phase 7. Source: `.workflows/plan/nina-queries-split/phase-7.md`.
> Written and reconciled by /analyze — edit the source, not this copy.

# Phase 7: Tuning, imageprefs, jobphotos modules (§10, §10b, §11, §12)

**Plan set:** `NINA_QUERIES_SPLIT_PLAN.md`
**Analysis:** `20260912-201916_code_analyzer.md`
**Satisfies:** R1, R2, R4, R6, R11 — the last three sections move; the split completes and `lib/nina/queries.ts` becomes header + re-exports only
**Depends on:** Phase 6 (which depends transitively on 1–5)
**Difficulty:** NORMAL
**Package:** `lib/nina`

---

## Goal

§10, §10b, §11 and §12 — the last code left in `lib/nina/queries.ts` — move verbatim into
three new modules (`queries/tuning.ts`, `queries/imageprefs.ts`, `queries/jobphotos.ts`),
and the barrel becomes its final shape: the layer-invariant header plus 12 `export *` lines
and nothing else. After this phase `lib/nina/queries.ts` contains no SQL, no function bodies,
and no imports.

## FACT CORRECTION to the phase brief (read before implementing)

The brief and the analysis doc's code-level DAG both say `jobphotos.ts` "imports
`imageColumns` from `./columns`". **That edge does not exist in code.** The only
`imageColumns` mention in §11/§12 is a docstring title at `queries.ts:4448`
("WHY THE PROJECTION IS `{ id }` AND NOT `imageColumns`") — the read deliberately selects
`{ id }` and `{ sessionId, messageId }`. Verified against the live tree at `2c823eb`:
`imageColumns` is used in code only at lines ≤ 2488 (all inside §5/§5a-2/§5b, which phase 4
moved). **`jobphotos.ts` imports nothing from `./columns`.** The code wins on facts; the
reconciler should correct the index's Phase-7 row and the analysis DAG line
`§12 → §2 (imageColumns)`.

## Interface Contract

The reconciler reads this section to detect cross-phase conflicts. Be exact and exhaustive.

**Creates:**
- `lib/nina/queries/tuning.ts` — exports `readNinaTuning(userId)`, `writeNinaTuning(userId, tuning)` (both `async`, unchanged signatures); private `tuningFromRow`, `tuningToColumns`. A code-level LEAF: no imports from sibling `./` query modules. Imports: `eq` (`drizzle-orm`); `db` (`@/lib/db`); `ninaTuning`, `type NinaTuningRow` (`@/lib/db/schema`); `coerceNinaTuning`, `NINA_TUNING_DEFAULTS`, `type NinaTuning` (`@/lib/nina/tuning`).
- `lib/nina/queries/imageprefs.ts` — exports `readNinaImagePrefs(userId)`, `writeNinaImagePrefs(userId, prefs)`, `listNinaPhotoReferences(userId, opts?)`, `resolveNinaPhotoReference(userId, reference)`; private `imagePrefsFromRow`, `imagePrefsToColumns`. Imports: `and`, `desc`, `eq` (`drizzle-orm`); `db`; `ninaAvatars`, `ninaImagePrefs`, `ninaMessageImages`, `type NinaImagePrefsRow` (`@/lib/db/schema`); `coerceNinaImagePrefs`, `mergeNinaPhotoRefs`, `NINA_IMAGE_PREFS_DEFAULTS`, `ninaPhotoRefBounds`, `type NinaImagePrefs`, `type NinaImagePrefsWrite`, `type NinaImageReference`, `type NinaPhotoRef`, `type NinaPhotoRefPage` (`@/lib/nina/imageprefs`); **`countNinaAvatars` from `./avatars`**; **`countNinaChatPhotos`, `generatedChatPhotoScope` from `./images`** — the DAG's two cross edges.
- `lib/nina/queries/jobphotos.ts` — exports `listNinaSelfieJobIdsSince(userId, since)`, `getNinaJobPhoto(userId, jobId)`, `getNinaJobPhotoBubble(userId, imageId)` (values) and `NinaJobPhotoRow`, `NinaJobPhotoBubbleRow` (`export interface`, type-only). Imports: `and`, `asc`, `desc`, `eq`, `gte`, `isNotNull`, `or` (`drizzle-orm`); `db`; `ninaMessageImages`, `ninaMessages` (`@/lib/db/schema`). Nothing from `./columns` (see fact correction), nothing from siblings; §11→§12's `listNinaSelfieJobIdsSince` mention is intra-module.

**Deletes (from `lib/nina/queries.ts`):**
- Source lines 3845–4573 of the pre-phase file: §10 (3845–4018), blank 4019, §10b (4020–4335), blank 4336, §11 (4337–4385), blank 4386, §12 (4387–4573 = EOF).
- The barrel's ENTIRE residual import block — whatever phases 1–6 left of the pre-split statements (`drizzle-orm`, `drizzle-orm/pg-core`, `@/lib/db`, `@/lib/db/schema`, `@/lib/id`, `@/lib/nina/{album,imageprefs,shortcuts,tuning,perceptual}`, `@/lib/photos/contentHash`) plus the two fixup import-backs phase 6's wholesale replacement pinned the block to (pre-phase-7 state: `import { countNinaChatPhotos, generatedChatPhotoScope } from './queries/images'` and `import { countNinaAvatars } from './queries/avatars'`) — no code remains that uses any of it.
- Any residual fixup imports phases 2–6 left anywhere (`import { getNinaSession } from './queries/sessions'` was phase 3's to delete and is long gone) — their last callers move out this phase. The final barrel has ZERO import statements.
- Config keys: none. Behavior: none.

**Renames:** none (every symbol keeps its exact name; the barrel surface is unchanged — no
name is added or removed by this phase, unlike phase 4's internal-shared exports).

**Signature changes:** none.

**Requires (from earlier phases):**
- Phase 1: `lib/nina/queries/` directory exists; `shapes.ts` + `columns.ts` landed; `lib/nina/queries.test.ts` (barrel value-export snapshot test) exists and is green.
- Phase 4: `queries/images.ts` exports `countNinaChatPhotos` and `generatedChatPhotoScope` under today's exact names; phase 4 has ALREADY repointed the `generatedChatPhotoScope` source-slice test — `tests/nina.imageprefs.test.ts:566` — from `readSource('lib/nina/queries.ts')` to `readSource('lib/nina/queries/images.ts')`, and adjusted its slice anchor for the `export` keyword phase 4 added (`'\nfunction generatedChatPhotoScope(userId: string) {'` → `'\nexport function generatedChatPhotoScope(userId: string) {'`). If phase 4 did not do this, that test breaks in phase 4, not here — flag to the reconciler, do not fix it here.
- Phase 6: `queries/avatars.ts` exports `countNinaAvatars` (today `queries.ts:3752`, `export async function`).
- Phases 2–6: the barrel already carries nine `export * from './queries/<m>'` lines (shapes, sessions, messages, images, memory, shortcuts, nags, turns, avatars) in that order, after the byte-identical header block (pre-split lines 85–120) — `./queries/columns` is phase-1-imported, never re-exported, so it is not one of them.

**Leaves alone (owned by others):**
- Flat sibling model layers `lib/nina/tuning.ts` and `lib/nina/imageprefs.ts` (distinct paths; the mirror naming is deliberate and gets a header note here, not a rename).
- All 14 importers, `components/nina/NinaUnreadBadge.test.tsx`'s `vi.mock`, every other `vi.mock('@/lib/nina/queries')` factory (all runtime, all satisfied by the barrel).
- `tests/nina.photoRefs.test.ts` — imports through the barrel and asserts generated SQL; untouched and green.
- The barrel header comment block (pre-split lines 85–120) — byte-identical through phase 7; phase 8 adds the module map.
- `scripts/*` comments — phase 4 owned those repoints.
- Historical records under `*/.workflows/plan/**` and `docs/plans/archive/**` (R7).

**Prose dispositions in the moved text (R4/R6/R7 boundaries, decided here):**
- The one `§`-ref in the whole range — `queries.ts:4408`, "`listNinaSelfieJobIdsSince` (§11)" — lands INTRA-MODULE (both sections are in `jobphotos.ts`) and moves byte-identical; the provenance header preserves the section names, so the reference stays resolvable. No `§`-ref in §10–§12 points across modules, so this phase rewrites zero of them.
- Six stale-on-arrival line pointers travel byte-identical inside §10b's docstring (`:2314`, `:1713` twice, `:1649`, `:1616-1618`, `:1642-1647`, and `lib/nina/queries.ts:1649-1655`) — see Handoffs; phase 8's sweep decides, per invariant 5 (rewording WHY notes is out of scope here).
- `queries.ts:1978` (inside §5, phase 4's module) names `getNinaJobPhoto` in prose — stays true via the barrel; no action.

## Files

| File | Action | What changes |
|---|---|---|
| `lib/nina/queries/tuning.ts` | create | provenance header + imports + §10 (queries.ts 3845–4018) verbatim |
| `lib/nina/queries/imageprefs.ts` | create | provenance header + imports + §10b (queries.ts 4020–4335) verbatim |
| `lib/nina/queries/jobphotos.ts` | create | provenance header + imports + §11+§12 (queries.ts 4337–4573) verbatim |
| `lib/nina/queries.ts` | rewrite to final barrel | delete lines 1–84 and 3845–4573 of the pre-phase file; append three `export *` lines |
| `tests/nina.imageprefs.test.ts` | modify | line 546: source path → `lib/nina/queries/imageprefs.ts` |
| `tests/db.schema.nina.test.ts` | modify | line 525: path → `lib/nina/queries/tuning.ts`; line 705: path → `lib/nina/queries/imageprefs.ts` |

## Implementation Steps

All line numbers below refer to `lib/nina/queries.ts` as it stands at branch base `2c823eb` —
i.e. the pre-split file. Phases 1–6 only ever REMOVE whole sections from below line 3845's
neighborhood and append barrel lines after line 120, so §10–§12's content and the header block
are byte-identical to these numbers when this phase starts. After phase 6, locate the blocks by
their banner text, not by number.

### Step 1: Create `lib/nina/queries/tuning.ts`
**File:** `lib/nina/queries/tuning.ts` (new)
**Change:** import block + provenance header + the §10 block (queries.ts lines 3845–4018)
copied verbatim, in order, after the header. Imports FIRST, provenance doc second — the
pattern phases 2–4 set for the new modules (reconciler-aligned; the draft had doc-first).

The new file's complete header and imports (everything down to where the verbatim block
starts):

```ts
import { eq } from 'drizzle-orm'

import { db } from '@/lib/db'
import { ninaTuning, type NinaTuningRow } from '@/lib/db/schema'
import { coerceNinaTuning, NINA_TUNING_DEFAULTS, type NinaTuning } from '@/lib/nina/tuning'

/**
 * Split from `lib/nina/queries.ts` on 2026-09-12: this file carries that barrel's §10
 * "The character tuning — F35 R1/R2/R3", moved byte-identical; `lib/nina/queries.ts` remains
 * the public barrel and re-exports everything here.
 *
 * The flat name `lib/nina/tuning.ts` is the MODEL layer — the vocabulary and coercion, zero
 * imports, client-safe. This is its persistence module; the mirror naming is deliberate.
 */
```

Then paste queries.ts lines 3845–4018 unchanged — the §10 banner (`/* ====…§10 The character
tuning — F35 R1/R2/R3…*/`), the `tuningFromRow` doc-comment and function, `tuningToColumns`
with its doc-comment, and the `readNinaTuning` / `writeNinaTuning` doc-comments and functions.
The `export` keywords on `readNinaTuning`/`writeNinaTuning` are already in the source text;
`tuningFromRow`/`tuningToColumns` stay private (nothing outside §10 references them — verified
by grep over the whole file).

**Impact:** barrel's `export * from './queries/tuning'` (Step 4) makes both functions
importable from `@/lib/nina/queries` exactly as before. No other module imports this file
directly.

### Step 2: Create `lib/nina/queries/imageprefs.ts`
**File:** `lib/nina/queries/imageprefs.ts` (new)
**Change:** import block + provenance header + the §10b block (queries.ts lines 4020–4335)
verbatim. Imports first, doc second (as in Step 1).

Complete header and imports:

```ts
import { and, desc, eq } from 'drizzle-orm'

import { db } from '@/lib/db'
import {
  ninaAvatars,
  ninaImagePrefs,
  ninaMessageImages,
  type NinaImagePrefsRow,
} from '@/lib/db/schema'
import {
  coerceNinaImagePrefs,
  mergeNinaPhotoRefs,
  NINA_IMAGE_PREFS_DEFAULTS,
  ninaPhotoRefBounds,
  type NinaImagePrefs,
  type NinaImagePrefsWrite,
  type NinaImageReference,
  type NinaPhotoRef,
  type NinaPhotoRefPage,
} from '@/lib/nina/imageprefs'
import { countNinaAvatars } from './avatars'
import { countNinaChatPhotos, generatedChatPhotoScope } from './images'

/**
 * Split from `lib/nina/queries.ts` on 2026-09-12: this file carries that barrel's §10b
 * "The image-generation preferences, and the photographs a reference can be chosen from —
 * R4-R10, storage only", moved byte-identical; `lib/nina/queries.ts` remains the public
 * barrel and re-exports everything here.
 *
 * The flat name `lib/nina/imageprefs.ts` is the MODEL layer — zero imports, client-safe.
 * This is its persistence module; the mirror naming is deliberate. Its only cross-module
 * imports are `countNinaChatPhotos` + `generatedChatPhotoScope` from `./images` and
 * `countNinaAvatars` from `./avatars`.
 */
```

Then paste queries.ts lines 4020–4335 unchanged: the §10b banner, `imagePrefsFromRow`,
`imagePrefsToColumns` (both stay private), `readNinaImagePrefs`, `writeNinaImagePrefs`,
`listNinaPhotoReferences`, `resolveNinaPhotoReference`. Function order stays exactly as in
the source file — `tests/nina.imageprefs.test.ts`'s source slice assumes
`listNinaPhotoReferences` is followed by the next `\nexport ` occurrence.

**Impact:** this is the module the test at `tests/nina.imageprefs.test.ts:546` will read
(Step 5). The moved body still satisfies all three of its assertions: it calls
`generatedChatPhotoScope(userId)` and `countNinaChatPhotos(userId)`, and contains no
`ninaMessageImages.kind` anywhere in the sliced range (verified: the slice spans this
function plus `resolveNinaPhotoReference`'s doc-comment, neither of which spells it).

### Step 3: Create `lib/nina/queries/jobphotos.ts`
**File:** `lib/nina/queries/jobphotos.ts` (new)
**Change:** import block + provenance header + the §11 and §12 blocks (queries.ts lines
4337–4573) verbatim, in order, including the blank line between the two sections. Imports
first, doc second (as in Step 1).

Complete header and imports:

```ts
import { and, asc, desc, eq, gte, isNotNull, or } from 'drizzle-orm'

import { db } from '@/lib/db'
import { ninaMessageImages, ninaMessages } from '@/lib/db/schema'

/**
 * Split from `lib/nina/queries.ts` on 2026-09-12: this file carries that barrel's §11
 * "The promise reward's landing test (R5, phase 4)" and §12 "The job → photograph link
 * (this set's R2/R3/R4)", both moved byte-identical; `lib/nina/queries.ts` remains the
 * public barrel and re-exports everything here. §12's mention of §11 is intra-module by
 * construction — both sections landed here together.
 */
```

Then paste queries.ts lines 4337–4573 unchanged: §11's banner + `listNinaSelfieJobIdsSince`,
then §12's banner + `NinaJobPhotoRow`, `getNinaJobPhoto`, `NinaJobPhotoBubbleRow`,
`getNinaJobPhotoBubble`. Do NOT add an `imageColumns` import — see the fact correction
above; the read deliberately projects `{ id }` / `{ sessionId, messageId }`.

**Impact:** `tests/nina.photoRefs.test.ts` exercises all three functions through the barrel
with the fake-db SQL recorder; every asserted SQL fragment (`inner join`, both `user_id`
predicates, `turn_id`, `kind`, order-by, projections) is untouched because the code is
untouched.

### Step 4: Rewrite `lib/nina/queries.ts` to its final barrel shape
**File:** `lib/nina/queries.ts`
**Change:** delete the whole residual import block (whatever phases 1–6 maintain above the
header — after phase 6 it ends with the `./queries/images` and `./queries/avatars`
import-backs) and lines 3845–4573 (§10 through EOF), delete any fixup imports phases 2–6 left
behind anywhere, and append the last three re-export lines. The complete final file:

```ts
/**
 * Every Nina read and write, in one module — `lib/db/queries.ts` for `lib/nina/`.
 *
 * ## The two invariants it inherits
 *
 * **1. userId scoping (roadmap D8, plan invariant 7).** Every exported function takes `userId`
 * as its first parameter and that value is in the `WHERE` of every statement it runs. There is
 * NO exception in this file — `lib/db/queries.ts` has exactly one (`getRunByShareToken`, where a
 * 96-bit token is the credential) and nothing here is credential-addressed. `userId` comes from
 * the session via `requireUserId()`, never from a Server Action argument or a URL segment.
 *
 * A row that exists but is not yours and a row that does not exist are the same outcome. These
 * functions return `null`, `[]` or `false` rather than throwing a `NotFoundError`, because every
 * caller is either Nina's own turn loop (which must degrade, not 500) or an admin screen (which
 * shows "gone" rather than an error page). Nothing here distinguishes absent from forbidden.
 *
 * **2. She never writes her own SQL against `runs` (plan invariant 9).** There is not one
 * reference to `runs`, `records`, `badges` or `insights` below. Nina's view of the training
 * history comes from `lib/db/queries.ts` through `lib/nina/load.ts`, so `reviewed_at IS NOT NULL`
 * keeps gating every aggregate she sees without this file having to remember to.
 *
 * ## Why `db.batch` and never `db.transaction`
 *
 * `db.transaction()` throws on the neon-http driver. `db.batch([...])` is one HTTP request that
 * Postgres runs inside one transaction. Same rule as `lib/db/queries.ts`, same reason.
 *
 * ## Ordering
 *
 * `nina_messages.seq` is a `bigserial`, so `ORDER BY seq` is the emission order of the whole
 * conversation and nothing in this file needs a composite sort or a tiebreak. See that table's
 * header for why a timestamp could not do the job.
 *
 * **No `import 'server-only'`.** `lib/db/queries.ts` does not have it either, deliberately:
 * adding it would make this module unimportable from Vitest and from `scripts/*.mjs`, and phase
 * 14's operator script is a `scripts/*.mjs`.
 */

export * from './queries/shapes'
export * from './queries/sessions'
export * from './queries/messages'
export * from './queries/images'
export * from './queries/memory'
export * from './queries/shortcuts'
export * from './queries/nags'
export * from './queries/turns'
export * from './queries/avatars'
export * from './queries/tuning'
export * from './queries/imageprefs'
export * from './queries/jobphotos'
```

TWELVE `export *` lines, zero imports — `./queries/columns` is NOT among them: phase 1
imports the four column lists, never re-exports them, and the 85-name snapshot test enforces
that. The header block (the `/** … */` comment) is byte-identical to pre-split lines 85–120 —
copy it from the live file, do not retype it. The import block and everything from the
§10 banner to EOF are deleted. The nine lines for shapes…avatars are expected to be present
from phases 1–6; if their order or presence differs, preserve what phases 1–6 wrote and
append only the last three lines in the order shown. `export *` is immune to
`verbatimModuleSyntax`/`isolatedModules` (the plan's Decision 2) and re-exports the two
type-only interfaces from `jobphotos.ts` correctly.

**Impact:** the barrel's public surface is unchanged — every symbol importable before is
importable after, and this phase adds no new name to it (unlike phase 4). Phase 1's
`lib/nina/queries.test.ts` snapshot must pass with NO edit — it is the machine check of that
claim (85 names, the column lists still absent). The file ends at
the last `export *` line; there is no code after the header.

### Step 5: Repoint the three source-reading tests
**File:** `tests/nina.imageprefs.test.ts:546`
**Change:** the picker-union test slices `listNinaPhotoReferences` out of the barrel by
path; the function now lives in the new module.

```ts
    const source = readSource('lib/nina/queries/imageprefs.ts')
```

(replacing `readSource('lib/nina/queries.ts')`). Nothing else in the test changes — the
slice anchors (`'export async function listNinaPhotoReferences'`, `'\nexport '`) and all
three assertions hold verbatim against the moved code (verified against the source text).
The sibling test at line 566 (`generatedChatPhotoScope`) is NOT this phase's to touch —
phase 4 repointed it (see Requires).

**File:** `tests/db.schema.nina.test.ts:525`
**Change:** the `nina_tuning` enable-column round-trip guard reads the source to assert
`${key}: row.${key}Enabled` (from `tuningFromRow`) and `${key}Enabled: tuning.enabled.${key}`
(from `tuningToColumns`); both spellings moved to the tuning module.

```ts
    const source = readFileSync('lib/nina/queries/tuning.ts', 'utf8')
```

**File:** `tests/db.schema.nina.test.ts:705`
**Change:** the `nina_image_prefs` focus-column read-side guard asserts
`${key}: row.focus${pascal}` / `focus${pascal}: prefs.focus.${key}`, which moved to the
imageprefs module.

```ts
    const source = readFileSync('lib/nina/queries/imageprefs.ts', 'utf8')
```

All four asserted substring families exist verbatim in the new modules (checked against
source: `relationship: row.relationshipEnabled` at new tuning.ts; `face: row.focusFace` /
`focusFace: prefs.focus.face` at new imageprefs.ts), so only the path literals change. The
comments around these tests stay as-is: they describe the mapping, not the file.

**Impact:** without this step the phase's own gates fail — the three tests read a barrel
that no longer contains the mappings.

### Step 6: Gates
Run, in order:

```
npx vitest run lib/nina components/nina tests
npm run typecheck
npx eslint lib/nina
npx prettier --check lib/nina/queries.ts lib/nina/queries/tuning.ts lib/nina/queries/imageprefs.ts lib/nina/queries/jobphotos.ts tests/nina.imageprefs.test.ts tests/db.schema.nina.test.ts
```

(`npm run typecheck` = `next typegen && tsc --noEmit` — phase 1's real `node_modules` makes
typegen work in this worktree. The vitest line is the phase brief's gate; it covers
`tests/nina.imageprefs.test.ts`, `tests/nina.photoRefs.test.ts`,
`tests/db.schema.nina.test.ts`, `lib/nina/queries.test.ts` and the admin suites that
`importOriginal`-spread the barrel.)

## Verification

**Build:** `npm run typecheck` (tsc against the 14 live importers is what proves the type
surface — `NinaJobPhotoRow`, `NinaJobPhotoBubbleRow` — survived; vitest does not typecheck).
**Tests:** `npx vitest run lib/nina components/nina tests`
**Manual check:**
- `grep -c "^export \*" lib/nina/queries.ts` → `12`
- `grep -c "^import\|^export async function\|^export function\|await db\." lib/nina/queries.ts` → `0` (no imports, no function bodies, no SQL)
- `grep -n "lib/nina/queries.ts" tests/nina.imageprefs.test.ts tests/db.schema.nina.test.ts` → no hits outside comments
- `git diff --stat` shows no change under `lib/nina/tuning.ts`, `lib/nina/imageprefs.ts`, or any `*/.workflows/plan/` / `docs/plans/archive/` path
- `lib/nina/queries.test.ts` passes UNMODIFIED (the barrel snapshot — 85 names, the four column lists still absent): the explicit machine check that the split ended without moving a single public name
**Exit criteria:** the phase is done when the barrel has exactly 12 `export *` lines, zero
imports and zero function bodies; the four named suites pass green — phase 1's barrel
snapshot among them, unmodified; `tsc --noEmit` and eslint
are clean on `lib/nina`; prettier is clean on all six touched files. `lib/nina/queries.ts`
contains no SQL.

## Handoffs

- **Phase 8 — stale line pointers now living in moved prose.** §10b's docstring landed in
  `lib/nina/queries/imageprefs.ts` carrying six pointers that no longer resolve:
  `:2314` (`listNinaAvatars` → now `queries/avatars.ts`), `:1713` twice
  (`countNinaChatPhotos` → now `queries/images.ts`), `:1649` (`generatedChatPhotoScope` →
  `queries/images.ts`), `:1616-1618` (`isOriginalPhoto` → `queries/images.ts`),
  `:1642-1647`, and `lib/nina/queries.ts:1649-1655`. Invariant 5 (byte-identical prose)
  kept them; phase 8's live-prose sweep should repoint or annotate them by the same rule it
  applies to `lib/nina/searchActions.ts:40` — argument prose untouched. Every phase 2–6
  module has the same class of pointer; sweep them together.
- **Phase 8 — barrel header module map.** The final barrel is ready for it; the header stays
  byte-identical until then (R3).
- **Phase 8 — package_readmes** in `lib/nina/.workflows/` and `lib/.workflows/` can now state
  the completed layout with date-stamped counts.
- **Reconciler — index corrections (actioned 2026-09-12).** (a) Phase 7's "Files: 4"
  undercounts; six files are touched (3 new modules, the barrel, 2 test files). (b) The
  Phase-7 row and the analysis DAG's `§12 → §2 (imageColumns)` edge are wrong — the edge is
  deleted in the analysis doc and the index; `jobphotos.ts` imports nothing from `./columns`.
  (c) The analysis DAG's `§12 → §11` note ("comment-only") is half-right at the old file
  granularity but wrong for the new one: inside `jobphotos.ts`
  §12's prose names §11, which is why both sections share one module. (d) The barrel count is
  TWELVE `export *` lines (no columns line), matching phase 1's binding contract.

## Rollback

`git revert <phase-commit>` — the phase is one commit whose diff is exactly: three new files,
the barrel rewrite, three test path literals. Reverting restores the post-phase-6 tree
byte-for-byte. If the commit is not yet made: `git checkout HEAD -- lib/nina/queries.ts lib/nina/queries/ tests/nina.imageprefs.test.ts tests/db.schema.nina.test.ts` and delete the
three new modules.
