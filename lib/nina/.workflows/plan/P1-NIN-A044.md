> Adopted from `NINA_QUERIES_SPLIT_PLAN.md` phase 5. Source: `.workflows/plan/nina-queries-split/phase-5.md`.
> Written and reconciled by /analyze — edit the source, not this copy.

# Phase 5: Memory, shortcuts, nags, turns modules (§6, §6b, §7, §8)

**Plan set:** `NINA_QUERIES_SPLIT_PLAN.md`
**Analysis:** `20260912-201916_code_analyzer.md`
**Satisfies:** R1, R2, R4, R6, R11
**Depends on:** Phase 4 (transitively 1–3)
**Difficulty:** NORMAL
**Package:** `lib/nina`

---

## Goal

Four new modules under `lib/nina/queries/` — `memory.ts`, `shortcuts.ts`, `nags.ts`,
`turns.ts` — own Nina's memory-slot/ledger statements, the shortcut registry's statements,
the nag ledger, and the turn audit trail (current `queries.ts:2493–2989`, 497 lines, 17
exports + 4 private helpers), moved byte-identical with **zero** prose rewrites (measured:
the span's only `§` occurrences are the four banner titles themselves). `lib/nina/queries.ts`
shrinks by exactly that span, prunes 9 now-unused `@/lib/db/schema` members and the entire
`@/lib/nina/shortcuts` import, adds four `export *` lines, and needs **no import-backs** —
no remaining section calls any moved symbol at code level (verified by comment-stripped
scan). Zero behavior change: same SQL, same signatures, same return shapes.

## FACT CORRECTION to the phase brief (read before implementing)

1. **Line ranges.** The brief/analysis cite §6 as 2494–2676, §6b 2677–2880, §7 2881–2928,
   §8 2929–2991. Measured on HEAD `2c823eb`, each range starts one line late (at the title,
   not the banner's opening `/* ====` line) and ends one line late (at the NEXT banner's
   opening line, swallowing the separating blank). The blocks as moved here, base-measured:
   §6 = **2493–2674** (banner 2493–2495, blank 2496), §6b = **2676–2878** (banner 2676–2683,
   blank 2684), §7 = **2880–2926** (banner 2880–2882, blank 2883), §8 = **2928–2989**
   (banner 2928–2930, blank 2931); separating blanks at 2675 / 2879 / 2927, trailing blank
   2990, §9's banner opens at 2991. Total moved content = 497 lines; the queries.ts deletion
   = 498 lines (content + trailing blank 2990), leaving base line 2492's blank as the single
   separator above §9's banner.
2. **Export counts.** The brief says "9 exports" (§6) and "8 exports" (§6b). Measured: §6
   has **8** exports + private `renderSlotValue`; §6b has **5** exports + private
   `shortcutColumns` / `toShortcutRecord` / `derivedTrigger`. Totals for the phase: **17
   exports + 4 private helpers = 21 top-level definitions**.
3. **R6 work is zero here.** The span contains no `§N` pointer into another section (grep
   proof in Verification). Four prose mentions of sibling-section symbols travel
   byte-identical because they name symbols, not sections: `listNinaMemoryFacts`
   (`:2737`, memory symbol in §6b prose), `updateNinaMemoryFact` (`:2795`),
   `upsertNinaMemorySlot` (`:2803`), `upsertNinaNag` (`:2865`) — all stay true via the
   barrel. Same for the five mentions of my symbols that live OUTSIDE the span and move with
   earlier phases: `renderSlotValue` + `getNinaMemorySlot` (`:334`, §1 → shapes.ts, P1),
   `insertNinaShortcut` (`:397`, §1 → shapes.ts, P1), `upsertNinaMemorySlot` (`:1072`,
   `:1108`, §4a → sessions.ts, P2), `countNinaTurnsSince` (`:1983`, §5 → images.ts, P4).

## Interface Contract

The reconciler reads this section to detect cross-phase conflicts. Be exact and exhaustive.

**Deletes:** from `lib/nina/queries.ts` — (1) the contiguous span from the `/* ============…`
line directly above ` * §6 Memory — slots and the ledger (RU-6)` through the blank line
directly above the `/* ============…` line above ` * §9 Avatars — her album (RU-7, R19, R23,
R25)` — 498 lines at base `2c823eb` (2493–2990); (2) nine members of the `@/lib/db/schema`
import: `ninaMemoryFacts`, `ninaMemorySlots`, `ninaNags`, `ninaShortcuts`, `ninaTurns`,
`type NinaFactCategory`, `type NinaMemorySource`, `type NinaSlotValue`, `type NinaTurnKind`
(code uses all inside the deleted span — measured, comment-stripped); (3) the entire
`@/lib/nina/shortcuts` import statement (base lines 73–77: `classifyNinaTrigger`,
`normalizeNinaTrigger`, `type NinaShortcutKind` — all three used only in the deleted span);
(4) ten members of phase 1's `import type { … } from './queries/shapes'` back-import:
`NinaFactInsert`, `NinaFactRow`, `NinaSlotRow`, `NinaSlotUpsert`, `NinaShortcutInsert`,
`NinaShortcutPatch`, `NinaShortcutRecord`, `NinaNagRow`, `NinaNagUpsert`, `NinaTurnInsert` —
the deleted span held their last users (after phases 2–4 pruned the session/message/image
members, the line carries exactly these 10 + the 9 avatar types; this phase leaves the 9
avatar types, which phase 6's wholesale import-block replacement deletes).
No config keys. No symbol ceases to exist — every deleted line reappears in a new module.

**Renames:** none. Every symbol keeps its exact name; the barrel surface is unchanged —
unlike phase 4, this phase surfaces no new name (all four private helpers stay private, so
`export *` re-exports exactly the same 17 names that queries.ts exported directly before).

**Creates:**
- `lib/nina/queries/memory.ts` — exports exactly 8 async functions: `getNinaMemorySlots`,
  `getNinaMemorySlot`, `upsertNinaMemorySlot`, `deleteNinaMemorySlot`, `listNinaMemoryFacts`,
  `appendNinaMemoryFacts`, `updateNinaMemoryFact`, `deleteNinaMemoryFact`;
  `renderSlotValue` moves module-PRIVATE. Imports: `and, asc, desc, eq` (`drizzle-orm`); `db`
  (`@/lib/db`); `ninaMemoryFacts, ninaMemorySlots, type NinaFactCategory,
  type NinaMemorySource, type NinaSlotValue` (`@/lib/db/schema`); `newId` (`@/lib/id`);
  `type NinaFactInsert, NinaFactRow, NinaSlotRow, NinaSlotUpsert` (`./shapes`, `import type`
  — `verbatimModuleSyntax`, tsconfig.json:16–17).
- `lib/nina/queries/shortcuts.ts` — exports exactly 5 async functions: `listNinaShortcuts`,
  `insertNinaShortcut`, `updateNinaShortcut`, `deleteNinaShortcut`, `bumpNinaShortcutUses`;
  `shortcutColumns`, `toShortcutRecord`, `derivedTrigger` move module-PRIVATE. Imports:
  `and, asc, eq, inArray, sql` (`drizzle-orm`); `db`; `ninaShortcuts` (`@/lib/db/schema`);
  `newId`; `classifyNinaTrigger, normalizeNinaTrigger, type NinaShortcutKind`
  (`@/lib/nina/shortcuts` — the flat model layer); `type NinaShortcutInsert,
  NinaShortcutPatch, NinaShortcutRecord` (`./shapes`, `import type`).
- `lib/nina/queries/nags.ts` — exports exactly 2 async functions: `getNinaNags`,
  `upsertNinaNag`. Imports: `asc, eq, sql` (`drizzle-orm`); `db`; `ninaNags`
  (`@/lib/db/schema`); `type NinaNagRow, NinaNagUpsert` (`./shapes`, `import type`).
  No `newId` (the nag PK is `(user_id, code)`; the insert generates no id).
- `lib/nina/queries/turns.ts` — exports exactly 2 async functions: `insertNinaTurn`,
  `countNinaTurnsSince`. Imports: `and, eq, gte, sql` (`drizzle-orm`); `db`;
  `ninaTurns, type NinaTurnKind` (`@/lib/db/schema`); `newId`; `type NinaTurnInsert`
  (`./shapes`, `import type`).

All four import lists were machine-verified against comment-stripped code-position usage in
their exact blocks: every planned import is used, nothing else from the old header is used
(`db` excepted — always imported). `memory.ts` uses no `sql`/`gte`/`inArray`; `nags.ts` uses
no `and`/`newId`; no module uses `PgColumn`, `type SQL`, or any `@/lib/nina/{album,imageprefs,tuning,perceptual}`
or `@/lib/photos/contentHash` member.

**Signature changes:** none.

**Requires (from Phase 1):** `lib/nina/queries/shapes.ts` exports the 10 types the moved
code names (base `queries.ts` lines 336–431: `NinaSlotRow`, `NinaSlotUpsert`, `NinaFactRow`,
`NinaFactInsert`, `NinaShortcutRecord`, `NinaShortcutInsert`, `NinaShortcutPatch`,
`NinaNagRow`, `NinaNagUpsert`, `NinaTurnInsert` — all verified present in §1).

**Requires (from Phases 2–4):** `queries/sessions.ts`, `queries/messages.ts`,
`queries/images.ts` landed; `lib/nina/queries.ts`'s barrel block ends with
`export * from './queries/images'` (four `export *` lines: shapes, sessions, messages,
images — `./queries/columns` is imported, never re-exported) and the foundation line precedes
them; `lib/nina/queries.test.ts` (the barrel value-export name-set snapshot) exists and passes
unmodified after this phase. Phases 2–4 have also pruned every import member whose last use
was in §3–§5b (e.g. `ne`, `exists`, `max`, `gt`, `notExists` from drizzle-orm;
`isValidContentHash`; the perceptual pair; `NINA_CHAT_PHOTO_PAGE_SIZE`; `type NinaImageKind`)
— this phase does not depend on that pruning's details and touches none of it.

**Adds (to `lib/nina/queries.ts`):** exactly four re-export lines, between
`export * from './queries/images'` and (phase 6's) `export * from './queries/avatars'`, in
this order — the order phase 7's contract already expects:

```ts
export * from './queries/memory'
export * from './queries/shortcuts'
export * from './queries/nags'
export * from './queries/turns'
```

**Adds NO import-backs.** Proof: comment-stripped scan of the surviving §9–§12 span (base
2991–4573) finds zero code-position uses of any of the 17 moved exports and zero of the 4
private helpers; the only mentions anywhere outside the moved span are the five prose lines
listed in the fact correction, all true by symbol name via the barrel. `export *` brings the
17 names into the barrel's EXPORT surface but not its local scope — with no local caller,
nothing to import.

**Leaves alone (owned by others):**
- The barrel's header doc-comment (base 85–120) and every import statement except the schema
  member prune and the shortcuts-model statement delete — in particular the `drizzle-orm`
  import is UNTOUCHED (every remaining member — `and asc desc eq gte inArray isNotNull
  isNull max or sql`, `type SQL` — still has code uses in §9–§12, measured: 24/2/5/44/1/2/2/2/3/1/4/1),
  as are `PgColumn` (1 use in §9–§12), `newId` (2), the album constants (2/2/1),
  the imageprefs members, the tuning members.
- §9–§12 bodies (phases 6–7).
- Every test file — verified one by one below (Verification): the four source-text readers
  of `queries.ts` (`tests/db.schema.nina.test.ts:525` tuning, `:705` imageprefs,
  `tests/nina.imageprefs.test.ts:546` §10b, `:566` §5) anchor in phases 4/7 territory;
  `tests/admin.memory.test.ts` and `tests/admin.shortcuts.test.ts` walk `lib/admin`
  non-recursively plus `lib/nina` NON-recursively (`isFile` filter — `lib/nina/queries/*.ts`
  are invisible to both walks); `tests/nina.distill.test.ts` reads only flat
  `lib/nina/memory.ts`/`distill.ts`; `tests/nina.softDelete.test.ts`,
  `tests/nina.photoOrphans.test.ts`, `tests/nina.chatPhotoAdoption.test.ts`,
  `tests/nina.turnrevive.test.ts` exercise my symbols at RUNTIME through the barrel
  (fakeDb recorder / `vi.mock` factory) — all green unmodified.
- `scripts/*` — the only line pointers (`nina-dedupe-media.mjs:60`, `nina-dedupe-plan.mjs:71,93`)
  cite §5 lines 1757/1812/2073; none lands in 2493–2989. Phase 4 owned those repoints.
- The flat sibling modules `lib/nina/memory.ts`, `lib/nina/shortcuts.ts`, `lib/nina/nags.ts`,
  `lib/nina/turn*.ts` — distinct paths, different layers; the mirror naming is deliberate and
  is documented in each new module's header, not by renaming anything.
- Historical records under `*/.workflows/plan/**` and `docs/plans/archive/**` (R7).
- Cycle rule honored: none of the four modules imports `@/lib/nina/queries`.

## Files

| File | Action | What changes |
|---|---|---|
| `lib/nina/queries/memory.ts` | create | provenance header + 12 import/header lines + base lines 2493–2674 verbatim (30 header lines + 182 body = 212 lines) |
| `lib/nina/queries/shortcuts.ts` | create | provenance header + imports + base lines 2676–2878 verbatim (28 header lines + 203 body = 231 lines) |
| `lib/nina/queries/nags.ts` | create | provenance header + imports + base lines 2880–2926 verbatim (20 header lines + 47 body = 67 lines) |
| `lib/nina/queries/turns.ts` | create | provenance header + imports + base lines 2928–2989 verbatim (21 header lines + 62 body = 83 lines) |
| `lib/nina/queries.ts` | modify | delete the 498-line span; prune 9 schema-import members; delete the `@/lib/nina/shortcuts` import statement (5 lines); prune the 10 moved types from the `./queries/shapes` back-import; add 4 re-export lines |

## Implementation Steps

All base line numbers refer to `lib/nina/queries.ts` at branch base `2c823eb`. Phases 1–4
only ever edit ABOVE the §6 banner (§1/§2 conversion, §3–§5b removal, header untouched), so
the moved span is byte-identical to these numbers when this phase starts — only its absolute
line numbers have shifted up. Steps 1–4 therefore locate the span at implementation time by
its banner text (exact commands below), not by base numbers.

### Step 0: Measure the span in the live (post-phase-4) file

```sh
T6=$(grep -nF ' * §6 Memory — slots and the ledger (RU-6)' lib/nina/queries.ts | head -1 | cut -d: -f1) || exit 1
T9=$(grep -nF ' * §9 Avatars — her album (RU-7, R19, R23, R25)' lib/nina/queries.ts | head -1 | cut -d: -f1) || exit 1
[ "$(($T9 - $T6))" -eq 498 ] || { echo "span drifted from 498 lines — re-measure before moving" >&2; exit 1; }
```

`T6` is the §6 TITLE line (base 2494); the banner opens one line above it. Offsets from
`T6` (invariant because the span is contiguous and byte-identical): §6 block = `T6-1 …
T6+180` (182 lines), §6b = `T6+182 … T6+384` (203), §7 = `T6+386 … T6+432` (47), §8 =
`T6+434 … T6+495` (62), deletion = `T6-1 … T6+496` (498). The `T9−T6 == 498` guard makes any
drift loud instead of silent. Each module's body must be extracted (Steps 1–4) BEFORE the
span is deleted (Step 5) — the extraction reads the live file.

### Step 1: Create `lib/nina/queries/memory.ts`

**File:** `lib/nina/queries/memory.ts` (new; must not already exist)
**Change:** write the complete header below (lines 1–30), then append base lines 2493–2674
verbatim, in order — the §6 banner (`/* ====…` 2493, title 2494, close 2495), blank 2496,
the `renderSlotValue` doc + function, and the eight exported functions through
`deleteNinaMemoryFact`'s closing brace at 2674.

**Code (the only authored lines of this file — everything below line 30 is moved):**

```ts
import { and, asc, desc, eq } from 'drizzle-orm'

import { db } from '@/lib/db'
import {
  ninaMemoryFacts,
  ninaMemorySlots,
  type NinaFactCategory,
  type NinaMemorySource,
  type NinaSlotValue,
} from '@/lib/db/schema'
import { newId } from '@/lib/id'
import type { NinaFactInsert, NinaFactRow, NinaSlotRow, NinaSlotUpsert } from './shapes'

/**
 * Nina's memory statements — the slots carried into every prompt and the append-only ledger of
 * distilled facts (queries.ts §6 "Memory — slots and the ledger (RU-6)"), plus the private
 * `renderSlotValue` conversion.
 *
 * Split out of `lib/nina/queries.ts` on 2026-09-12; that file remains the public barrel and
 * re-exports everything here, so no importer changes. Banner prose below moved byte-identical.
 *
 * The flat module `lib/nina/memory.ts` is a DIFFERENT file — the distiller's pure planning half
 * (zod schemas, the write-plan, no SQL). This is the persistence half that reads and writes
 * `nina_memory_slots` / `nina_memory_facts`. The mirror naming is deliberate.
 *
 * Imports foundation-wards only (`./shapes`, `@/lib/db*`) — never the barrel
 * `@/lib/nina/queries`. The layer-wide rules (userId scoping, never writing `runs`/`records`/
 * `badges`/`insights`, `db.batch` over `db.transaction`, no `server-only`) live on the barrel's
 * header; this module inherits them and does not restate them.
 */
```

Extraction:

```sh
sed -n "$((T6-1)),$((T6+180))p" lib/nina/queries.ts >> lib/nina/queries/memory.ts
```

(`import type` for the four shapes is required by `verbatimModuleSyntax` — types only;
`shapes.ts` has no runtime bindings. `NinaSlotValue`/`NinaMemorySource`/`NinaFactCategory`
come from `@/lib/db/schema`, exactly as queries.ts imported them — they are schema types,
not §1 shapes.)

**Impact:** none yet (file unreferenced). `renderSlotValue` stays private — nothing outside
§6 references it in code (its only outside mention, `queries.ts:334`, is prose in §1 and
moves with shapes.ts in phase 1, where it stays true by name).

### Step 2: Create `lib/nina/queries/shortcuts.ts`

**File:** `lib/nina/queries/shortcuts.ts` (new)
**Change:** write the complete header below (lines 1–28), then append base lines 2676–2878
verbatim — the dashed §6b banner (`/* ----…` 2676, title 2677, prose 2678–2682, close 2683),
blank 2684, private `shortcutColumns` / `toShortcutRecord` / `derivedTrigger`, and the five
exported functions through `bumpNinaShortcutUses`' closing brace at 2878.

**Code:**

```ts
import { and, asc, eq, inArray, sql } from 'drizzle-orm'

import { db } from '@/lib/db'
import { ninaShortcuts } from '@/lib/db/schema'
import { newId } from '@/lib/id'
import {
  classifyNinaTrigger,
  normalizeNinaTrigger,
  type NinaShortcutKind,
} from '@/lib/nina/shortcuts'
import type { NinaShortcutInsert, NinaShortcutPatch, NinaShortcutRecord } from './shapes'

/**
 * The shortcut registry's statements (queries.ts §6b "Shortcuts — the trigger -> expansion
 * registry (F36)"): the list/insert/update/delete reads and writes plus the fire-and-forget
 * uses bump, with the private `shortcutColumns`, `toShortcutRecord` and `derivedTrigger`.
 *
 * Split out of `lib/nina/queries.ts` on 2026-09-12; that file remains the public barrel and
 * re-exports everything here, so no importer changes. Banner prose below moved byte-identical.
 *
 * The flat module `lib/nina/shortcuts.ts` is a DIFFERENT file — the zero-import, client-safe
 * matcher and vocabulary (`classifyNinaTrigger`, `normalizeNinaTrigger`, the length caps).
 * This is the persistence half; it imports the matcher from there. The mirror naming is
 * deliberate.
 *
 * Imports foundation-wards only — never the barrel `@/lib/nina/queries`. The layer-wide rules
 * on the barrel's header apply here unchanged.
 */
```

Extraction:

```sh
sed -n "$((T6+182)),$((T6+384))p" lib/nina/queries.ts >> lib/nina/queries/shortcuts.ts
```

(`shortcutColumns` is §6b's own private column list — NOT one of phase 1's four §2 lists in
`columns.ts`; it stays private here, so the barrel surfaces no new `*Columns` name and there
is no collision with `columns.ts`'s exports. The §6b prose that names memory/nag symbols —
`:2737`, `:2795`, `:2803`, `:2865` — travels untouched: symbol names, still true via the
barrel.)

**Impact:** none yet.

### Step 3: Create `lib/nina/queries/nags.ts`

**File:** `lib/nina/queries/nags.ts` (new)
**Change:** write the complete header below (lines 1–20), then append base lines 2880–2926
verbatim — the §7 banner (2880–2882), blank 2883, `getNinaNags` and `upsertNinaNag` with
their doc comments, through `upsertNinaNag`'s closing brace at 2926.

**Code:**

```ts
import { asc, eq, sql } from 'drizzle-orm'

import { db } from '@/lib/db'
import { ninaNags } from '@/lib/db/schema'
import type { NinaNagRow, NinaNagUpsert } from './shapes'

/**
 * The nag ledger's two statements (queries.ts §7 "Nags — the escalation ledger (RU-9)"):
 * `getNinaNags` and `upsertNinaNag`.
 *
 * Split out of `lib/nina/queries.ts` on 2026-09-12; that file remains the public barrel and
 * re-exports everything here, so no importer changes. Banner prose below moved byte-identical.
 *
 * The flat module `lib/nina/nags.ts` is a DIFFERENT file — the escalation DECISIONS (which
 * level a repeat mention climbs to, when to stop). This is the persistence half that reads and
 * writes `nina_nags`. The mirror naming is deliberate.
 *
 * Imports foundation-wards only — never the barrel `@/lib/nina/queries`. The layer-wide rules
 * on the barrel's header apply here unchanged.
 */
```

Extraction:

```sh
sed -n "$((T6+386)),$((T6+432))p" lib/nina/queries.ts >> lib/nina/queries/nags.ts
```

**Impact:** none yet.

### Step 4: Create `lib/nina/queries/turns.ts`

**File:** `lib/nina/queries/turns.ts` (new)
**Change:** write the complete header below (lines 1–21), then append base lines 2928–2989
verbatim — the §8 banner (2928–2930), blank 2931, `insertNinaTurn` and `countNinaTurnsSince`
with their doc comments, through `countNinaTurnsSince`'s closing brace at 2989.

**Code:**

```ts
import { and, eq, gte, sql } from 'drizzle-orm'

import { db } from '@/lib/db'
import { ninaTurns, type NinaTurnKind } from '@/lib/db/schema'
import { newId } from '@/lib/id'
import type { NinaTurnInsert } from './shapes'

/**
 * The turn audit trail's two statements (queries.ts §8 "Turns — the audit trail"):
 * `insertNinaTurn` and `countNinaTurnsSince`.
 *
 * Split out of `lib/nina/queries.ts` on 2026-09-12; that file remains the public barrel and
 * re-exports everything here, so no importer changes. Banner prose below moved byte-identical.
 *
 * The flat `lib/nina/turn*.ts` modules (`turn.ts`, `turnrun.ts`, `turnflight.ts`,
 * `turnrevive.ts`) are a DIFFERENT layer — the turn runner and its LLM machinery. This is the
 * persistence half that writes and counts `nina_turns`. The near-mirror naming is deliberate.
 *
 * Imports foundation-wards only — never the barrel `@/lib/nina/queries`. The layer-wide rules
 * on the barrel's header apply here unchanged.
 */
```

Extraction:

```sh
sed -n "$((T6+434)),$((T6+495))p" lib/nina/queries.ts >> lib/nina/queries/turns.ts
```

**Impact:** none yet.

### Step 5: Delete the moved span from `lib/nina/queries.ts`

**File:** `lib/nina/queries.ts` (post-phase-4 numbering; anchored by content)
**Change:** delete the contiguous span from the `/* ============…` line directly above the
§6 Memory title through the blank line directly above §9 Avatars' banner-open line — the
`T6-1 … T6+496` range from Step 0 (498 lines: §6 2493–2674, blank 2675, §6b 2676–2878,
blank 2879, §7 2880–2926, blank 2927, §8 2928–2989, trailing blank 2990, base-measured).
Afterwards exactly one blank line separates the last §5b line from §9's banner, matching
house spacing. Mechanical form (after re-checking the Step 0 guard):

```sh
sed -i "$((T6-1)),$((T6+496))d" lib/nina/queries.ts
sed -n "$((T6-2)),$((T6-1))p" lib/nina/queries.ts   # expect: '}' line, then ONE blank, then §9's banner next
```

**Impact:** `queries.ts` loses 498 lines. Nothing in the surviving §9–§12 references the
span at code level (comment-stripped scan, see Interface Contract).

### Step 6: Prune `lib/nina/queries.ts`'s import list

**File:** `lib/nina/queries.ts` (import block)
**Change:** exactly two statements change; every other import is untouched.

**(i) `@/lib/db/schema`** — remove the nine members `ninaMemoryFacts`, `ninaMemorySlots`,
`ninaNags`, `ninaShortcuts`, `ninaTurns`, `type NinaFactCategory`, `type NinaMemorySource`,
`type NinaSlotValue`, `type NinaTurnKind` (each of whose last code uses was inside the
deleted span; the §9–§12 survivors keep the statement's other members in their existing
order). The statement's surviving member list, in the order phases 1–4 leave it, is expected
to be exactly:

```ts
import {
  ninaAvatars,
  ninaFolders,
  ninaImagePrefs,
  ninaMessageImages,
  ninaMessages,
  ninaTuning,
  type NinaImagePrefsRow,
  type NinaTuningRow,
} from '@/lib/db/schema'
```

(`NinaImagePrefsRow`/`NinaTuningRow` still have one code use each in §10/§10b — phase 7
prunes them when those sections move. The five §1-only schema types (`NinaAvatarSource`,
`NinaMessageSource`, `NinaRole`, `NinaSessionTitleSource`, `NinaTurnStatus`) were pruned by
phase 1 (its contract; its Step 0 script proved zero post-684 refs) and phase 2's post-state
quote reflects that — if any of them is still present, phase 1's prune was skipped; delete
the members here in phase 1's spirit and note it in the commit body. Do not re-add them
anywhere.)

**(ii) `@/lib/nina/shortcuts`** — delete the whole statement (base lines 73–77):

```ts
import {
  classifyNinaTrigger,
  normalizeNinaTrigger,
  type NinaShortcutKind,
} from '@/lib/nina/shortcuts'
```

**(iii) drizzle-orm — NO change.** Every remaining member still has code uses in §9–§12 —
anchors: `asc` :3403/:4570, `gte` :4380, `or` :4567, `type SQL` :3290, `PgColumn` :3290;
`and`/`desc`/`eq`/`inArray`/`isNotNull`/`isNull`/`sql` throughout — as does `newId`
(:3061, :3541). (`max` is NOT in the statement anymore: phase 2 pruned it alongside
`ne`/`exists` when §4a moved. Its apparent later "uses" are `Math.max` property accesses,
which do not touch the imported binding.)

**(iv) Phase 1's `./queries/shapes` back-import** — remove the ten members whose last users
just moved: `NinaFactInsert`, `NinaFactRow`, `NinaSlotRow`, `NinaSlotUpsert`,
`NinaShortcutInsert`, `NinaShortcutPatch`, `NinaShortcutRecord`, `NinaNagRow`,
`NinaNagUpsert`, `NinaTurnInsert`. The line should end this phase carrying exactly the nine
avatar types — phases 2–4 already pruned the session/message/image members, and phase 6's
wholesale import-block replacement deletes the line outright. Without this prune the line's
ten dead members trip eslint's unused-vars and the phase's own gate goes red.

**Impact:** `tsc` fails if any prune is wrong in either direction — a kept-but-unused name
trips eslint's unused-vars, a wrongly-pruned name trips tsc. That symmetry is the gate.

### Step 7: Add the four barrel re-export lines

**File:** `lib/nina/queries.ts`
**Change:** append four lines to the re-export block, directly after
`export * from './queries/images'` (phase 4's last line) and before phase 6's avatars line
when it arrives:

```ts
export * from './queries/memory'
export * from './queries/shortcuts'
export * from './queries/nags'
export * from './queries/turns'
```

This matches phase 7's recorded expectation of the barrel order (shapes, sessions, messages,
images, **memory, shortcuts, nags, turns**, avatars, tuning, imageprefs, jobphotos — twelve
`export *` lines at the end; `./queries/columns` is imported, never re-exported). No
import-back line is added anywhere — see the Interface Contract's proof.

**Impact:** the barrel's export surface is unchanged — the same 17 names, now re-exported
instead of defined locally, verified by `lib/nina/queries.test.ts` (phase 1's snapshot)
passing unmodified. `export *` is immune to `verbatimModuleSyntax`/`isolatedModules`
(plan Decision 2).

### Step 8: Gates

Run, in order:

```sh
npm run typecheck
npx vitest run lib/nina components/nina tests/admin.memory.test.ts tests/admin.shortcuts.test.ts tests/nina.softDelete.test.ts tests/nina.distill.test.ts tests/nina.turnrevive.test.ts tests/nina.photoOrphans.test.ts tests/nina.chatPhotoAdoption.test.ts tests/db.schema.nina.test.ts
npx eslint lib/nina
npx prettier --check lib/nina/queries.ts lib/nina/queries/memory.ts lib/nina/queries/shortcuts.ts lib/nina/queries/nags.ts lib/nina/queries/turns.ts
```

(`npm run typecheck` = `next typegen && tsc --noEmit` — vitest does not typecheck; this is
the net that catches every wrong prune. The `tests/` list is every suite that executes or
string-guards territory touched by this phase, named in Verification below. Do NOT run
`npm run format` — it is repo-wide.)

## Verification

**Byte-proof of the move (R4/R11 evidence)** — all four diffs must be EMPTY (zero rewrites,
unlike phase 2's three):

```sh
git show 2c823eb:lib/nina/queries.ts | sed -n '2493,2674p' | diff - <(tail -n +31 lib/nina/queries/memory.ts)
git show 2c823eb:lib/nina/queries.ts | sed -n '2676,2878p' | diff - <(tail -n +29 lib/nina/queries/shortcuts.ts)
git show 2c823eb:lib/nina/queries.ts | sed -n '2880,2926p' | diff - <(tail -n +21 lib/nina/queries/nags.ts)
git show 2c823eb:lib/nina/queries.ts | sed -n '2928,2989p' | diff - <(tail -n +22 lib/nina/queries/turns.ts)
```

(`31/29/21/22` = the authored header line counts of Steps 1–4; if an implementer's header
differs by a line, adjust the offset — the diff must still come back empty.)

**Structural greps:**

```sh
grep -c "from '@/lib/nina/queries'" lib/nina/queries/memory.ts lib/nina/queries/shortcuts.ts lib/nina/queries/nags.ts lib/nina/queries/turns.ts   # 0 0 0 0 (cycle rule)
grep -n '§' lib/nina/queries.ts | grep -v '§9\|§9b\|§10\|§11\|§12'    # no hits — §6/§6b/§7/§8 banners gone from the barrel
grep -n 'renderSlotValue\|shortcutColumns\|toShortcutRecord\|derivedTrigger' lib/nina/queries/memory.ts lib/nina/queries/shortcuts.ts | grep export   # no hits — helpers stayed private
grep -n 'ninaMemory\|ninaNags\|ninaShortcuts\|ninaTurns\|NinaSlotValue\|NinaTurnKind' lib/nina/queries.ts   # no hits (import members pruned, code moved)
grep -c '^export \*' lib/nina/queries.ts    # 8 after this phase (4 `export *` lines from phases 1–4 — shapes, sessions, messages, images — plus these 4; columns is imported, not re-exported)
grep -n 'NinaFactInsert\|NinaShortcutRecord\|NinaNagUpsert\|NinaTurnInsert' lib/nina/queries.ts   # no hits (Step 6 (iv) pruned the shapes back-import members)
```

The zero-§-pointer claim about the moved span, provable before moving:

```sh
git show 2c823eb:lib/nina/queries.ts | sed -n '2493,2989p' | grep -n '§'
# expect exactly four lines: 2 (§6 title), 185 (§6b title), 389 (§7 title), 437 (§8 title) — banner titles only
```

**Why every existing test passes unmodified (verified against the live tree, suite by
suite):**
- `tests/db.schema.nina.test.ts` reads `lib/nina/queries.ts` source at exactly two points
  (`:525` the `nina_tuning` enable-column round-trip, `:705` the `nina_image_prefs`
  focus-column guard) — both assert strings living in §10/§10b, phase 7 repoints them. Its
  other nina mentions are drizzle schema-config introspection (`cfg(schema.ninaMemorySlots)`
  etc.), not source text. Nothing in it cites §6/§6b/§7/§8 source.
- `tests/nina.imageprefs.test.ts:546,566` slice `listNinaPhotoReferences` (§10b) and
  `generatedChatPhotoScope` (§5) — phases 7 and 4 own those repoints. No anchor in 2493–2989.
- `tests/admin.memory.test.ts` — the structural half reads `lib/admin/memory*` files and
  walks `lib/admin` non-recursively; the `lib/nina` walk (`:381–383`) skips directories via
  its `isFile` filter, so `lib/nina/queries/*.ts` are invisible to it either way. The moved
  code contains no `admin/memoryStore` / `admin/memoryActions` string (the only `admin/…`
  text in the span is the route name `/admin/shortcuts` in §6b prose, which matches neither
  banned specifier). The behavioral half drives `adminReadMemory*` through the barrel.
- `tests/admin.shortcuts.test.ts` — reads `lib/admin/shortcut{Actions,Store}.ts`,
  `lib/admin/schema.ts`, the ShortcutTable component, flat `lib/nina/shortcuts.ts`, and
  walks `lib/admin` non-recursively. It never reads `queries.ts`; its comments naming
  `lib/nina/queries.ts` (`:127`, `:187`, `:210`) stay true via the barrel.
- `tests/nina.distill.test.ts` (`:350–362`) — asserts flat `lib/nina/memory.ts` and
  `lib/nina/distill.ts` never NAME the mutating fact/slot writers. My new
  `lib/nina/queries/memory.ts` DEFINES them but is not in that test's explicit path list,
  and the guarantee (the distiller cannot reach them) is unaffected.
- `tests/nina.softDelete.test.ts` — `countNinaTurnsSince`'s no-`deleted_at` ruling is
  exercised at runtime (`:130`, barrel + fakeDb); its source reads target `imagejobs.ts`/
  `jobActions.ts` only. §8's doc-comment citing this test travels byte-identical and stays
  true.
- `tests/nina.photoOrphans.test.ts`, `tests/nina.chatPhotoAdoption.test.ts`,
  `tests/nina.turnrevive.test.ts` (`vi.mock('@/lib/nina/queries', …)` factory at `:83`
  listing `bumpNinaShortcutUses`/`listNinaShortcuts`), `components/nina/NinaUnreadBadge.test.tsx`
  — all runtime barrel consumers; the mock/snapshot surface is unchanged.
- `lib/nina/queries.test.ts` (phase 1's barrel value-export snapshot) — must pass with NO
  edit; it is the machine check of the R2 claim.
- `lib/nina/shortcuts.test.ts:64` / `lib/nina/unread.test.ts:6` — prose mentions only; both
  stay true via the barrel.

**Manual check:** none beyond the greps and diffs above; behavior is covered by the fakeDb
suites (sessionPurge/photoOrphans/chatPhotoAdoption/softDelete) and typecheck against the
14 live importers.

**Exit criteria:** all commands green; the four byte-proofs empty; `lib/nina/queries.test.ts`
passes unmodified; `queries.ts` contains no §6/§6b/§7/§8 code and no reference to the pruned
members; the four modules export exactly the 17 functions with the 4 helpers private. Commit
once, pathspec limited to `lib/nina/queries.ts lib/nina/queries/memory.ts
lib/nina/queries/shortcuts.ts lib/nina/queries/nags.ts lib/nina/queries/turns.ts`, and read
the `--stat` (5 files, ~600 insertions / ~512 deletions).

## Handoffs

- **Phase 6 (avatars):** appends `export * from './queries/avatars'` directly after this
  phase's four lines; `queries.ts`'s drizzle/schema/album import state it inherits is exactly
  the post-Step-6 state (schema members: `ninaAvatars, ninaFolders, ninaImagePrefs,
  ninaMessageImages, ninaMessages, ninaTuning, type NinaImagePrefsRow, type NinaTuningRow`),
  and the `./queries/shapes` back-import carries exactly the nine avatar types (phase 6's
  wholesale import-block replacement deletes the line).
  No script pointer or test anchor moves with §9/§9b except what phase 6 measures itself.
- **Phase 7 (tuning/imageprefs/jobphotos):** its contract's expectation — "phases 2–6 leave
  the barrel with nine `export *` lines (shapes, sessions, messages, images, memory,
  shortcuts, nags, turns, avatars) in that order" — is satisfied by Steps 1–7; nothing
  further needed from this phase.
- **Phase 8 (final sweep):** (1) the stale-pointer sweep should also check the four new
  modules for now-unresolvable line pointers — measured: the moved prose contains NO
  `queries.ts:` line pointers (the span's pointers, if any, are the §10b-style ones phase 7
  catalogued; a quick `grep -n 'queries\.ts:' lib/nina/queries/*.ts` confirms for the
  reconciler). (2) package_readme counts: `queries.ts` shrinks by 498 lines this phase;
  four new modules of 212/231/67/83 lines; date-stamp. (3) The readme rule about
  `lib/nina/queries/<m>.ts` mirroring flat `lib/nina/<m>.ts` (memory, shortcuts, nags) is
  worth one sentence — the header notes here are the source. (4) The two non-recursive
  `lib/nina` walks (admin.memory, and admin.shortcuts' `lib/admin` analogue) stay blind to
  `queries/*.ts` — phase 2 already handed this coverage note; it applies to four more files
  now.
- **Reconciler — index corrections:** the Phase-5 row's "9 exports"/"8 exports" reading of
  the analysis table overcounts by counting private helpers as exports (measured: 17 exports,
  4 private); the §-ranges in the brief are off by one on each end (fact correction above);
  the analysis DAG's `§6→§1, §6b→§1, §7→§1, §8→§1` edges are confirmed exact, and no new
  cross-module import edge exists between the four new modules (they are mutually
  independent; §6b's prose mentions of §6/§7 symbols are name-only).

## Rollback

One commit contains the whole phase. `git revert <phase-commit>` restores `queries.ts` and
deletes the four modules exactly. Without the commit:

```sh
git checkout HEAD~1 -- lib/nina/queries.ts
rm lib/nina/queries/memory.ts lib/nina/queries/shortcuts.ts lib/nina/queries/nags.ts lib/nina/queries/turns.ts
```

No migrations, no data, no other files touched.
