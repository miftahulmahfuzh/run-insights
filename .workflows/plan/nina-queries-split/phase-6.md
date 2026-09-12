# Phase 6: Avatars module (§9 + §9b)

**Plan set:** `NINA_QUERIES_SPLIT_PLAN.md`
**Analysis:** `20260912-201916_code_analyzer.md`
**Satisfies:** R1, R2, R4, R6, R11 — the user-facing thing this phase serves
**Depends on:** Phase 5 (phases 1–4 land before 5; their contracts are assumed below)
**Difficulty:** HARD
**Package:** `lib/nina`

---

## Goal

`lib/nina/queries.ts` loses its two avatar sections — §9 Avatars (11 exports) and §9b The
album as a file manager (12 exports + the private `folderSubtree` predicate) — to a new
`lib/nina/queries/avatars.ts` (~900 lines, the second largest module of the split). The
barrel re-exports the module, its public surface is unchanged, and the one remaining
code-level caller of a moved symbol (§10b's `countNinaAvatars(userId)`) is kept compiling by
an explicit import-back. Zero behavior change: identical SQL, every existing test green.

## Line-number note (measure-first, per the set's convention)

All ranges below are **measured on the analysis base commit `2c823eb`** (the tree the
analysis and the sibling plans cite). They drift from the phase brief's numbers (2992–3254 /
3255–3845) the same ±1–2 way the brief drifted for phases 2 and 3: the brief cites banner
TEXT lines; the banners OPEN one line earlier, and each section ends one or two lines before
the next banner opens. Measured boundaries:

| Thing | Lines @ `2c823eb` |
|---|---|
| §8 body ends / blank | 2989 / 2990 |
| §9 banner (`/* ====` / text / `*/`) | 2991–2993 (text :2992) |
| §9 body (11 exports) | 2995–3252 |
| blank | 3253 |
| §9b banner (`/* ---` … `---*/`, 8 lines) | 3254–3261 (text :3255) |
| blank | 3262 |
| §9b body (`folderSubtree` doc 3263–3289, fn 3290–3296; 12 exports) | 3263–3843 |
| blank | 3844 |
| §10 banner opens | 3845 (text :3846) |

**Span moved this phase: HEAD `2c823eb` lines 2991–3843 (853 lines).** Line 3844 (blank) is
consumed by the deletion, not moved.

Because phases 1–5 will already have removed ~2 300 lines above this span by the time this
phase runs, **do not extract from the branch tip** — the byte source is the base commit:

```sh
git show 2c823eb:lib/nina/queries.ts
```

Every edit below is given both as a `2c823eb` range and as a grep anchor that resolves at
phase-6 runtime.

## Correction to the task brief, verified against the code @ `2c823eb`

**§9b's "six calls into §9" are prose, not code.** `deleteNinaAvatar`,
`getCurrentNinaAvatar`, `insertNinaAvatarAsCurrent`, `listNinaAvatars`,
`setCurrentNinaAvatar` and `updateNinaAvatarCrop` appear in §9b only inside doc comments
(e.g. :3310, :3498–3499, :3505, :3578, :3657, :3667, :3702, :3741). A comment-stripped scan
of 3254–3843 finds **zero** calls into §9 functions — §9b's bodies call only `db`,
`folderSubtree`, `Math.*`, `sql` and drizzle builders. The analysis DAG's edge
`§9b → §9 (six symbols)` is therefore prose-only, and the phase outcome is the one the brief
names anyway: **intra-module, no import statement created or needed**. The reconciler should
correct the DAG line.

Also verified: §9 has **11** exports and §9b **12** (its own banner says "Twelve
statements") + 1 private helper — 23 exported functions total, matching phase 1's barrel
snapshot list.

## Interface Contract

The reconciler reads this section to detect cross-phase conflicts. Be exact and exhaustive.

**Creates:**
- `lib/nina/queries/avatars.ts` — exports exactly these 23 async functions, unchanged
  signatures, in this file order:
  `getCurrentNinaAvatar`, `listNinaAvatars`, `getUnannouncedCurrentNinaAvatar`,
  `insertNinaAvatarAsCurrent`, `markNinaAvatarAnnounced`, `updateNinaAvatarCrop`,
  `setNinaAvatarDescription`, `getNinaAvatar`, `getNinaAvatarBySourceKey`,
  `setCurrentNinaAvatar`, `deleteNinaAvatar` (§9);
  `listNinaAvatarsInFolder`, `listNinaAvatarManifest`, `listNinaAvatarFolders`,
  `insertNinaAvatars`, `moveNinaAvatarsToFolder`, `renameNinaAvatarFolder`,
  `deleteNinaAvatarsInFolderTree`, `deleteNinaAvatars`, `countNinaAvatars`,
  `declareNinaFolders`, `renameNinaFolderSubtree`, `deleteNinaFolderSubtree` (§9b).
  Private (NOT exported): `folderSubtree` — its five call sites (:3400, :3646, :3689, :3819,
  :3840) are all intra-module.
  Import block (exhaustive, verbatimModuleSyntax-correct — the 9 shapes names are types
  only, so `import type`): `and, asc, desc, eq, inArray, isNotNull, isNull, sql, type SQL`
  (`drizzle-orm`); `type PgColumn` (`drizzle-orm/pg-core`); `db` (`@/lib/db`);
  `ninaAvatars, ninaFolders` (`@/lib/db/schema`); `newId` (`@/lib/id`);
  `NINA_ADMIN_BATCH_MAX, NINA_ADMIN_MANIFEST_MAX, NINA_ADMIN_PAGE_SIZE`
  (`@/lib/nina/album`); `avatarColumns` (`./columns`); 9 types `NinaAvatarBatchInsert,
  NinaAvatarBlobRef, NinaAvatarCrop, NinaAvatarFolderCount, NinaAvatarFolderPage,
  NinaAvatarInsert, NinaAvatarManifestEntry, NinaAvatarRow, NinaFolderRenameResult`
  (`./shapes`). Nothing from any sibling query module; never the barrel.

**Deletes (from `lib/nina/queries.ts`):** the span `2c823eb` 2991–3844 (§9 banner through
the blank line preceding the §10 banner). No symbol ceases to exist — all 23 names return
through `export * from './queries/avatars'`. Import prunes (what only the moved code used,
measured against §10–§12's remaining code-level usage): `inArray`, `isNull`, `sql`,
`type SQL` (drizzle); the whole `type PgColumn` statement; `ninaFolders` (schema);
the whole `newId` statement; the whole `@/lib/nina/album` statement (all three
`NINA_ADMIN_*` names); the foundation import-backs `from './queries/shapes'` (all 9 avatar
types were the last users — §10–§12 use ZERO shapes types) and `from './queries/columns'`
(`avatarColumns` was the last user). `ninaAvatars` STAYS (§10b reads it directly at
`2c823eb` :4233–4242, :4307–4315). Phase 4's `import {
countNinaChatPhotos, generatedChatPhotoScope } from './queries/images'` back-import is NOT
deleted here — §10b still calls both (the new import block above preserves it); phase 7
deletes it. Config keys: none. Behavior: none.

**Renames:** none.

**Signature changes:** none.

**Requires (from earlier phases):**
- Phase 1: `lib/nina/queries/shapes.ts` exports the 9 avatar types under today's exact
  names; `lib/nina/queries/columns.ts` exports `avatarColumns`;
  `lib/nina/queries.test.ts` (barrel value-export snapshot — 83 names at phase 1, grown to
  exactly 85 by phase 4's two documented additions; the 23 avatar names above are among
  them) exists and must stay green UNMODIFIED.
- Phases 2–5: the barrel's block already carries, in order, `shapes, sessions, messages,
  images, memory, shortcuts, nags, turns` (eight `export *` lines; `./queries/columns` is
  imported, never re-exported); phases 2–5 pruned their own
  orphaned imports and import-backs; §3–§8 are gone from `queries.ts`.
- Phase 7 (forward): `imageprefs.ts` imports `countNinaAvatars` from `./avatars` — hence the
  internal-shared marker on it (Step 2c) and the module's provenance header.

**Leaves alone (owned by others):**
- §10, §10b, §11, §12 bodies (`2c823eb` 3845–4573) — Phase 7 moves them. This phase only
  swaps the barrel's import block around them and adds the re-export line.
- `tests/db.schema.nina.test.ts:525,705` — the two `readFileSync('lib/nina/queries.ts')`
  source-text assertions. Both cite §10 tuning / §10b imageprefs mapping text
  (`${key}: row.${key}Enabled`, `${key}: row.focus${pascal}`), which STAYS in the barrel
  until phase 7 — this phase leaves both green without touching the test. No test cites
  §9/§9b source text anywhere (grepped `tests/` for every moved symbol: only runtime tests
  through the barrel).
- `tests/admin.memory.test.ts:381–386` — walks `readdirSync('lib/nina')` but skips
  directories (`entry.isFile()`), so `lib/nina/queries/` is unscanned; and the new module
  imports nothing from `admin/` regardless. Unaffected.
- The 14 importers, `NinaUnreadBadge.test.tsx`'s `vi.mock`, every script (`scripts/**`) —
  no script line-pointer lands in 2991–3844 (the dedupe pointers cite §5 lines; phase 4's).
- The barrel header doc (`2c823eb` 85–120) — byte-identical until phase 8 (R3).
- `lib/nina/album.ts`, `lib/nina/avatargen.ts`, `lib/nina/avatartools.ts`, `lib/nina/crop.ts`
  and every other flat `lib/nina/*.ts` sibling.

## Files

| File | Action | What changes |
|---|---|---|
| `lib/nina/queries/avatars.ts` | create | header doc + 22-line import block (Step 1) + `2c823eb` 2991–3843 moved, of which 851 lines byte-identical, 2 one-line R6 rewrites (Step 2a/2b), 2 marker lines added (Step 2c) ≈ 900 lines total |
| `lib/nina/queries.ts` | modify | delete moved span (Step 3); replace import block with the exact post-phase block (Step 4); append `export * from './queries/avatars'` after the turns line (Step 5) |

Diff surface is exactly these 2 files. No test file changes.

## Implementation Steps

### Step 1: Create `lib/nina/queries/avatars.ts` — header and imports

**File:** `lib/nina/queries/avatars.ts:1` (new)
**Change:** write the file header and import block. This is the only new prose in the phase
apart from the two marker lines of Step 2c; everything else is moved.

**Code:**

```ts
import { and, asc, desc, eq, inArray, isNotNull, isNull, sql, type SQL } from 'drizzle-orm'
import type { PgColumn } from 'drizzle-orm/pg-core'

import { db } from '@/lib/db'
import { ninaAvatars, ninaFolders } from '@/lib/db/schema'
import { newId } from '@/lib/id'
import {
  NINA_ADMIN_BATCH_MAX,
  NINA_ADMIN_MANIFEST_MAX,
  NINA_ADMIN_PAGE_SIZE,
} from '@/lib/nina/album'
import type {
  NinaAvatarBatchInsert,
  NinaAvatarBlobRef,
  NinaAvatarCrop,
  NinaAvatarFolderCount,
  NinaAvatarFolderPage,
  NinaAvatarInsert,
  NinaAvatarManifestEntry,
  NinaAvatarRow,
  NinaFolderRenameResult,
} from './shapes'
import { avatarColumns } from './columns'

/**
 * Nina's avatar album — her face, and the album as a file manager.
 *
 * Split out of `lib/nina/queries.ts` on 2026-09-12. Origin sections, in file order:
 *   - §9 Avatars — her album (RU-7, R19, R23, R25) — `getCurrentNinaAvatar` …
 *     `deleteNinaAvatar`, 11 exports
 *   - §9b The album as a file manager — F34 R1 — `listNinaAvatarsInFolder` …
 *     `deleteNinaFolderSubtree`, 12 exports, plus the private `folderSubtree` predicate
 *
 * Banner prose moved byte-identical apart from two pointer rewrites where the prose said
 * "this module's rule 1": rule 1 — the userId-scoping, return-`null`-not-throw rule those
 * lines cite — stays on `lib/nina/queries.ts`'s header. This module inherits those rules;
 * it does not restate them.
 *
 * §9b's prose speaks of six §9 functions (`deleteNinaAvatar`, `getCurrentNinaAvatar`,
 * `insertNinaAvatarAsCurrent`, `listNinaAvatars`, `setCurrentNinaAvatar`,
 * `updateNinaAvatarCrop`); both sections live in this module now, so those mentions are
 * intra-module prose and no import between the halves exists or is needed.
 *
 * `folderSubtree` stays module-private: its five callers are all in this file. It is the one
 * private top-level symbol here; everything else is exported and re-exported through the
 * barrel.
 *
 * Imports foundation-wards only (`./shapes`, `./columns`) plus `db`, the two album tables,
 * `newId` and the album constants — never the barrel `@/lib/nina/queries`, which re-exports
 * this module.
 */
```

**Impact:** none yet (file unreferenced). Every import above is exhaustive for the moved
body — verified against `2c823eb` uses inside 2991–3843 (`and` :3000 et al.; `asc` :3403;
`desc` :3011, :3345; `eq` throughout; `inArray` :3594, :3725; `isNotNull` :3399; `isNull`
:3029, :3094; `sql` :3291–3295, :3349, :3469, :3644, :3817; `SQL` :3290; `PgColumn` :3290;
`db` throughout; `ninaAvatars` throughout; `ninaFolders` :3477, :3815, :3819, :3840;
`newId` :3061, :3541; the three `NINA_ADMIN_*` at :3336, :3387, :3404, :3531–3533;
`avatarColumns` :2998 et al.; the 9 types at their signatures). `tsc` proves sufficiency;
eslint's unused-vars proves nothing more.

### Step 2: Move the §9 + §9b span into `avatars.ts`

**File:** `lib/nina/queries/avatars.ts` (body, directly after the header doc comment)
**Change:** append base-commit lines 2991–3843 verbatim, in order:

```sh
git show 2c823eb:lib/nina/queries.ts | sed -n '2991,3843p' >> lib/nina/queries/avatars.ts
```

(853 lines: the §9 banner, all eleven §9 functions, the §9b banner, `folderSubtree`, all
twelve §9b functions. The blank separators at 2994/3253/3262 travel inside the block;
3844 does not travel.) Then apply exactly three edits — the complete list of prose changes
inside the moved block (grep proof: the span contains exactly two `§` occurrences, the
banner titles at :2992 and :3255, which travel byte-identical as origin markers; there are
ZERO §-pointers from this span into other sections, and ZERO `:NNNN` line pointers and ZERO
`queries.ts` mentions, so R6's work here is only the adjacent self-reference class):

**(a) `2c823eb` :3260** — the §9b banner cites "this module's rule 1"; rule 1 lives on the
barrel header post-split. One line, replaced in place (same class as phase 2's rewrite a):

- Before: ` * statements. Every one of them is \`userId\`-scoped in its WHERE, per this module's rule 1.`
- After: ` * statements. Every one of them is \`userId\`-scoped in its WHERE, per \`lib/nina/queries.ts\`'s rule 1.`

**(b) `2c823eb` :3583** — `moveNinaAvatarsToFolder`'s doc cites "this module's rule 1". One
line, replaced in place:

- Before: ` * yours or are already gone", per this module's rule 1.`
- After: ` * yours or are already gone", per \`lib/nina/queries.ts\`'s rule 1.`

**(c) `2c823eb` :3750/3751** — the internal-shared marker phase 7 depends on
(plan-set Decision 3's class, the same treatment phase 4 gives `isOriginalPhoto` /
`generatedChatPhotoScope`). `countNinaAvatars` is ALREADY `export`ed — no signature or
surface change; this only documents the cross-module consumer. Two lines inserted after
` * \`listNinaAvatarsInFolder\` cannot answer.` and before the closing ` */`:

```ts
 * Internal — shared with sibling query modules: `queries/imageprefs.ts` imports this count
 * for the photo-reference grid (the one cross-module edge into avatars, 2026-09-12 split).
```

The moved body is therefore **855 lines** (853 − 0 + 2). Everything else — both banners, all
23 functions, `folderSubtree` and its docstring — is byte-identical to `2c823eb`.

**Considered and left unchanged (do not touch):** `2c823eb` :3287 "Not exported: six callers
in this file" (measured call sites: five — a pre-existing count, not falsified by the move;
see Handoffs); :3303 "NOT a filter over `listNinaAvatars`" (intra-module post-move);
:3459 "the one album read in this file that is" (pre-existing tension with `listNinaAvatars`,
same two functions on both sides of the move); :3450 "(invariant 6: …)" (a roadmap citation,
not a section pointer); :3499 "the ONLY insert this module exposed before F34" (historical,
still true of this module); :3515–3516 "A DEPARTURE FROM THIS MODULE'S CONVENTION" +
bare "Rule 1's …" (the convention is inherited via the header sentence; the bare citation
takes its antecedent from it, phase 2's :1007 precedent); :3520 `lib/nina/images.ts`
(external path, still true); every "phase 6 drives" / "phase 15" / "phase 4's" mention
(HISTORICAL plan-phase references — R7: not rewritten, and NOT this refactor's phase
numbers despite the coincidence with this phase's number); every §9-function mention inside
§9b prose and vice versa (intra-module).

**Impact:** `avatars.ts` compiles standalone against the Step 1 imports; `tsc` proves the
import list is exactly sufficient.

### Step 3: Delete the moved span from `lib/nina/queries.ts`

**File:** `lib/nina/queries.ts`
**Change:** delete the span from the §9 banner's opening line through the blank line that
precedes the §10 banner — `2c823eb` 2991–3844 inclusive. At phase-6 runtime the numbers have
shifted (phases 1–5 removed the lines above); resolve by anchor:

- `A` = line of `grep -n '§9 Avatars — her album' lib/nina/queries.ts` (the banner text)
- `B` = line of `grep -n '§10 The character tuning' lib/nina/queries.ts` (the §10 banner text)
- delete lines `A-1` through `B-2` inclusive.

(`@ 2c823eb`: A=2992, B=3846 → delete 2991–3844.) The blank that separated the re-export
block from the §9 banner (2990-equivalent) survives and becomes the single separator between
the barrel block and the §10 banner. Nothing else in the file moves.

### Step 4: Replace the barrel's import block with the exact post-phase-6 block

**File:** `lib/nina/queries.ts` (import region, `2c823eb` lines 1–84 as maintained by
phases 1–5)
**Change:** replace the ENTIRE import block with exactly this — the complete measured
requirement of the remaining §10–§12 code (comment-stripped scan of `2c823eb` 3845–4573:
`and`×5, `asc`×1, `desc`×3, `eq`×17, `gte`×1, `isNotNull`×1, `or`×1; `ninaAvatars`,
`ninaImagePrefs`, `ninaMessageImages`, `ninaMessages`, `ninaTuning`, `type NinaImagePrefsRow`,
`type NinaTuningRow`; the imageprefs and tuning lib helpers/types; `db`. Zero uses of
`sql`/`SQL`/`PgColumn`/`inArray`/`isNull`/`newId`/`NINA_ADMIN_*`/`ninaFolders`/column
lists/shapes types). This wholesale replacement is deliberately robust to whatever residue
phases 2–5 left: the end state is minimal and exact regardless.

```ts
import { and, asc, desc, eq, gte, isNotNull, or } from 'drizzle-orm'

import { db } from '@/lib/db'
import {
  ninaAvatars,
  ninaImagePrefs,
  ninaMessageImages,
  ninaMessages,
  ninaTuning,
  type NinaImagePrefsRow,
  type NinaTuningRow,
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
import { coerceNinaTuning, NINA_TUNING_DEFAULTS, type NinaTuning } from '@/lib/nina/tuning'
import { countNinaChatPhotos, generatedChatPhotoScope } from './queries/images'
import { countNinaAvatars } from './queries/avatars'
```

The last TWO lines are import-backs: `export *` brings names into the barrel's EXPORT surface
but not its local scope, and §10b — still in the barrel — calls
`generatedChatPhotoScope(userId)` at `2c823eb` :4253/:4331, `countNinaChatPhotos(userId)` at
:4257 (the `./queries/images` line phase 4 added — it SURVIVES this phase; deleting it here
would break the build on §10b's own calls) and `countNinaAvatars(userId)` at :4256 (added by
this phase; the only code-level reference from remaining code into moved §9/§9b symbols —
grep-verified across all 23 names + `folderSubtree` + `avatarColumns` over 3845–4573; the
other hits at :4154/:4161/:4222 are prose). Phase 7 deletes both lines when §10b moves,
exactly as phase 3 pruned phase 2's `getNinaSession` back-import.

**Impact:** `tsc` fails if any prune is wrong in either direction — a kept-but-unused name
trips eslint's unused-vars, a wrongly-pruned name trips `tsc`. That symmetry is the gate.

### Step 5: Add the barrel re-export line

**File:** `lib/nina/queries.ts`
**Change:** join the barrel block (directly under the byte-identical header doc that ends
at `2c823eb` :120), appending the ninth `export *` line in section order after phase 5's
`turns` line:

```ts
export * from './queries/avatars'
```

The block then reads, in order: `shapes, sessions, messages, images, memory,
shortcuts, nags, turns, avatars` — exactly the nine-line state phase 7's plan requires as its
entry condition.

**Impact:** the barrel's export surface gains nothing and loses nothing — the 23 moved names
were already exported and return through `export *`; `folderSubtree` stays private, so no new
name appears and none disappears. Verified by phase 1's `lib/nina/queries.test.ts` name-set
snapshot, which must pass unmodified.

## Verification

**Build:** `npm run typecheck` (`next typegen && tsc --noEmit` — tsc against the 14 live
importers is what proves the type surface moved intact; vitest does not typecheck).

**Tests:** `npx vitest run lib/nina components/nina` (the phase's scoped gate). Add the
avatar-adjacent `tests/` canaries, which exercise moved code through the barrel and are
cheap:

```sh
npx vitest run lib/nina components/nina \
  tests/nina.photoRefs.test.ts tests/admin.folderActions.test.ts \
  tests/admin.albumAvatarActions.test.ts tests/db.schema.nina.test.ts
```

(`nina.photoRefs.test.ts` drives `listNinaPhotoReferences` → the `countNinaAvatars` edge;
`admin.folderActions.test.ts` / `admin.albumAvatarActions.test.ts` drive §9b through the
admin actions; `db.schema.nina.test.ts` proves the two source-text assertions still find
their §10/§10b text in the barrel.)

**Lint/format:**

```sh
npx eslint lib/nina
npx prettier --check lib/nina/queries.ts lib/nina/queries/avatars.ts
```

**Manual checks:**

- `grep -c "^export \*" lib/nina/queries.ts` → `9` (shapes, sessions, messages, images,
  memory, shortcuts, nags, turns, avatars — columns is imported, not re-exported)
- `grep -n "§9" lib/nina/queries.ts` → no hits (§10–§12 remain; no §9 pointers exist in
  them — verified: their mentions of avatar symbols are prose, left to phase 8's sweep only
  if they become false, which they do not: every one names a symbol the barrel still exports)
- `grep -c "await db\." lib/nina/queries.ts` → unchanged from before this phase minus the
  moved statements' share (§10–§12's SQL is untouched)
- `lib/nina/queries.test.ts` passes with NO modification (barrel name-set snapshot)
- `git diff --stat` shows exactly two files; no change under `*/.workflows/plan/`,
  `docs/plans/archive/`, `tests/`, or `scripts/`

**Exit criteria:** the phase is done when `avatars.ts` holds the 23 exports + private
`folderSubtree` with the moved bodies byte-identical apart from rewrites (a)/(b) and marker
(c); the barrel has exactly 9 `export *` lines, the Step 4 import block (both import-backs
included), and §10–§12
untouched; the scoped vitest run, the four canary suites, `npm run typecheck`, eslint and
prettier are all green on the touched scope.

## Handoffs

- **Phase 7** — prunes BOTH import-backs this phase's import block ends with —
  `import { countNinaChatPhotos, generatedChatPhotoScope } from './queries/images'` (phase
  4's, preserved here) and `import { countNinaAvatars } from './queries/avatars'` — when §10b
  moves (its plan already says so); moves the §10/§10b source-text assertions'
  target text out of the barrel (its plan owns repointing
  `tests/db.schema.nina.test.ts` / `tests/nina.imageprefs.test.ts` readers).
- **Phase 8** — two pre-existing prose quirks now living in `queries/avatars.ts`, recorded
  for the live-prose sweep (repoint/annotate by the `searchActions.ts:40` rule; never reword
  here): `:3287` "six callers in this file" (five call sites measured at `2c823eb` — the
  count was already off before the split) and `:3459` "the one album read in this file that
  is" (`listNinaAvatars` is equally unbounded — pre-existing tension, not falsified by the
  move). Neither line changed this phase (invariant 5).
- **Phase 8** — the barrel header module map lands on the byte-identical header doc; the
  barrel is now 9/12 `export *` lines of the way there.
- **Reconciler** — (a) the analysis DAG's `§9b → §9 (deleteNinaAvatar, …)` edge is
  comment-only; zero code-level calls; correct the DAG and the phase brief's "six calls
  become intra-module" phrasing (outcome unchanged: no import). (b) The phase brief's §9/
  §9b ranges (2992–3254 / 3255–3845) are text-line-cited; measured banner-open ranges are
  2991–3252 / 3254–3843 (this file's Line-number note). (c) `countNinaAvatars` needed no
  export change — it was already public; only the Decision-3 marker was added, so unlike
  phase 4 this phase alters no barrel name.

## Assumptions (expected from earlier phases)

- Phases 1–5 landed as their plans state: `shapes.ts`/`columns.ts` exist with the avatar
  types and `avatarColumns` exported; the barrel carries the nine re-export lines through
  `turns`; phases 2–5 pruned their own imports and import-backs; phase 1's snapshot test is
  green. If phase 5's pruning leaves residue beyond my Step 4 block, Step 4's wholesale
  replacement still yields the exact minimal end state — no coordination needed.
- Extraction always reads `2c823eb` (the base commit), never the moving branch tip, so
  sibling phases' line shifts cannot corrupt the byte source.

## Rollback

Single commit reverting to the post-phase-5 tree: the diff is exactly the new
`lib/nina/queries/avatars.ts`, the deleted span, the swapped import block, and one re-export
line — `git revert <phase-6-commit>` restores it exactly. No migration, no config, no data.
