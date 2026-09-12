# Phase 3: Messages module (§4b + §4c)

**Plan set:** `NINA_QUERIES_SPLIT_PLAN.md`
**Analysis:** `20260912-201916_code_analyzer.md`
**Satisfies:** R1, R2, R4, R6, R11
**Depends on:** Phase 2 (Sessions module)
**Difficulty:** NORMAL
**Package:** `lib/nina`

---

## Goal

`lib/nina/queries.ts`'s §4b The messages (nine top-level symbols: 8 functions + private
`messageScope`) and §4c Message mutation (2 exports + the load-bearing-order banners) move into
the new `lib/nina/queries/messages.ts`, byte-identical apart from two §-pointer rewrites and a
short provenance header. `lib/nina/queries.ts` replaces the moved span with
`export * from './queries/messages'` and prunes the four imports only the moved code used. The
barrel's public surface does not change: the 9 functions were already exported, and
`messageScope` stays module-private, so no new names appear and none disappear.

**Correction to the task brief, verified against the code @ `2c823eb`:** §4b has **7** exports
(`listNinaMessages`, `listNinaMessagesAfter`, `getNinaMessageWindow`, `insertNinaMessages`,
`getNinaMessagesByIds`, `countUnreadNinaMessages`, `markNinaMessagesRead`) — **8 total with the
private `messageScope`**. `hasProactiveMessageForRun` is NOT in §4b: it is defined at
`queries.ts:1581`, inside §5 Images (banner at 1567), and moves with phase 4. The analysis doc's
"8 exports (`listNinaMessages` … `hasProactiveMessageForRun`)" line is wrong on the same point.
This phase moves 9 exported functions (7 + §4c's 2) and does not touch §5.

## Interface Contract

The reconciler reads this section to detect cross-phase conflicts. Be exact and exhaustive.

**Deletes (from `lib/nina/queries.ts` only — all survive in `messages.ts`):**
- definitions of `listNinaMessages`, `listNinaMessagesAfter`, `getNinaMessageWindow`,
  `insertNinaMessages`, `getNinaMessagesByIds`, `countUnreadNinaMessages`, `markNinaMessagesRead`
  (§4b, `queries.ts:1192–1427` @ 2c823eb) and `updateNinaMessage`, `deleteNinaMessage` (§4c,
  `queries.ts:1475–1565` @ 2c823eb); private `messageScope` (`queries.ts:1166–1170`)
- the moved span's source lines `queries.ts:1133–1565` (@ 2c823eb)
- import `gt` from `drizzle-orm` (sole use in the whole file is `queries.ts:1237`, moved)
- import-back name `messageColumns` from `./queries/columns` (sole remaining user was §4b/§4c;
  zero uses in §5+, verified)
- import-back names `NinaMessageInsert`, `NinaMessageRow` from `./queries/shapes` (zero uses in
  §5+, verified)
- the import-back line `import { getNinaSession } from './queries/sessions'` (phase 2 added it
  for §4b's `insertNinaMessages`; zero code-level calls remain in §5+, verified — the only
  post-1565 hit is a prose mention at `queries.ts:2068`)

**Renames:** none.

**Creates:**
- `pkg.NinaMessagesModule` — no. Concretely: `lib/nina/queries/messages.ts` exporting exactly
  `listNinaMessages`, `listNinaMessagesAfter`, `getNinaMessageWindow`, `insertNinaMessages`,
  `getNinaMessagesByIds`, `countUnreadNinaMessages`, `markNinaMessagesRead`, `updateNinaMessage`,
  `deleteNinaMessage`. `messageScope` is NOT exported (module-private, as today).
- one line in `lib/nina/queries.ts`: `export * from './queries/messages'`

**Signature changes:** none. SQL, return shapes, defaults, and error behavior are byte-identical
(R11).

**Requires (from earlier phases):**
- Phase 1: `lib/nina/queries/shapes.ts` exports `NinaMessageInsert`, `NinaMessageRow`;
  `lib/nina/queries/columns.ts` exports `messageColumns`; `lib/nina/queries.test.ts` (barrel
  snapshot) exists and is green; real `node_modules` install done.
- Phase 2: `lib/nina/queries/sessions.ts` exports `getNinaSession`; `lib/nina/queries.ts`
  contains `export * from './queries/sessions'` and an explicit `getNinaSession` import-back
  (this phase removes that import-back — nothing after §4c calls it).
- Phases 1–2 left their `export *` lines IN PLACE OF the removed sections (in-place conversion).
  If they consolidated the re-export block elsewhere, E1 below is unchanged — E6 becomes "add the
  line next to the others" instead of "replace the span".

**Leaves alone (owned by others):**
- §5 onward of `queries.ts` (@ 2c823eb lines 1567–4573) — phases 4–7. In particular
  `hasProactiveMessageForRun` (`queries.ts:1581`) is phase 4's.
- `lib/nina/*.ts` sibling modules (memory.ts, sessions.ts, shortcuts.ts, tuning.ts, imageprefs.ts)
  — never touched by this set.
- The 14 importers, the 4 operator scripts (phase 4 repoints script comments), both
  package_readmes (phase 8), everything under `*/.workflows/plan/**` and `docs/plans/archive/**`.
- The banner titles `§4b The messages` / `§4c Message mutation` keep their § numbers inside
  `messages.ts` (invariant 5: banner prose byte-identical). Phase 8's module map explains the
  numbering; phase 8's §-ref audit must not flag those two banner titles as stale.

**Import-backs `queries.ts` needs after this phase: NONE.** Verified by grep over §5–§12
(@ 2c823eb lines 1568–4573): zero code-level references to any moved symbol. The four comment
mentions (`queries.ts:911`, `:952`, `:970` in §4a docstrings — they move to `sessions.ts` in
phase 2 — and `:2303` in §5b) are prose, don't create imports, and stay true through the barrel.

**Barrel surface delta: zero names.** The 9 moved functions were already `export`ed from
`queries.ts`; `export *` re-exports the same set. Phase 1's `queries.test.ts` snapshot stays
green with no edit.

## Files

| File | Action | What changes |
|---|---|---|
| `lib/nina/queries/messages.ts` | create | provenance header + import block + §4b/§4c moved byte-identical from `queries.ts:1133–1565` (@ 2c823eb), two §-pointer rewrites applied |
| `lib/nina/queries.ts` | modify | moved span → `export * from './queries/messages'`; prune `gt`, `messageColumns`, `NinaMessageInsert`, `NinaMessageRow`, `getNinaSession` from imports |

Diff surface is exactly these 2 files. No test file changes.

## Assumptions (expected from earlier phases)

- Phase 1 created `lib/nina/queries/shapes.ts` (27 §1 types) and `lib/nina/queries/columns.ts`
  (the four column lists, module-exported), replaced §1/§2 in place with the barrel
  `export * from './queries/shapes'` line plus explicit import-backs of the names the remaining
  code uses (a `./queries/shapes` type back-import and a `./queries/columns` value back-import —
  columns is imported, never re-exported), and added `lib/nina/queries.test.ts`.
- Phase 2 moved §3 + the §4 group banner + §4a into `lib/nina/queries/sessions.ts`, replaced that
  span in place with `export * from './queries/sessions'`, imported `getNinaSession` back into
  `queries.ts` (needed by §4b's `insertNinaMessages` — this phase removes it), and pruned the
  header imports only §3/§4a used (`ne`, `users`, `ninaChatSessions`,
  `NINA_SESSION_TITLE_MAX_CHARS`, `mostRecentNinaSession`, `orderNinaSessions`, …).
- Line numbers in this plan are identifiers from `2c823eb` (the analysis baseline). After phases
  1–2 the moved span sits higher in the file; every edit below anchors on quoted text, not line
  numbers.

## Implementation Steps

### Step 1: Create `lib/nina/queries/messages.ts` — header and imports
**File:** `lib/nina/queries/messages.ts` (new)
**Change:** write the provenance header and the complete import block. Every import below is
exhaustive for the moved body — verified against `2c823eb` uses inside 1133–1565 (`and` 1169,
1237, 1277, 1366, 1388, 1419, 1483, 1553, 1560; `asc` 1238, 1367; `desc` 1200, 1278; `eq`
throughout; `gt` 1237; `inArray` 1366; `isNull` 1391, 1422; `sql` 1283, 1385; `SQL` 1166; `db`
1196 et al.; `ninaMessages` throughout; `ninaMessageImages` 1552; `newId` 1335; `NinaMessageInsert`
1322; `NinaMessageRow` 1195, 1233, 1272, 1359, 1479, 1548; `messageColumns` 1197, 1235, 1275,
1349, 1364, 1484, 1561; `getNinaSession` 1327). Nothing else in the moved range touches any other
import (`PgColumn`, `ne`, `max`, `or`, `notExists`, `isNotNull`, `gte` are all absent — checked).
**Code:**

```ts
/**
 * Nina's messages — every read, write and mutation over `nina_messages`.
 *
 * Split from `lib/nina/queries.ts` on 2026-09-12 (nina-queries-split): this file is that file's
 * §4b The messages and §4c Message mutation, moved byte-identical apart from two §-pointers
 * rewritten to module names. The layer-wide invariants — userId scoping on every statement,
 * `db.batch` never `db.transaction`, no `server-only` — live on the barrel header.
 */

import { and, asc, desc, eq, gt, inArray, isNull, sql, type SQL } from 'drizzle-orm'

import { db } from '@/lib/db'
import { ninaMessageImages, ninaMessages } from '@/lib/db/schema'
import { newId } from '@/lib/id'
import { messageColumns } from './columns'
import { getNinaSession } from './sessions'
import type { NinaMessageInsert, NinaMessageRow } from './shapes'
```

**Impact:** the cycle rule holds — `./columns` and `./shapes` are phase 1 foundations, `./sessions`
is the already-landed phase 2 sibling. `messages.ts` never imports `@/lib/nina/queries`. The
relative imports sort `columns` < `sessions` < `shapes`; `getNinaSession`/`messageColumns` are
values (plain import), the two shapes are types (`import type`, required by
`verbatimModuleSyntax`).

### Step 2: Append the moved body, byte-identical
**File:** `lib/nina/queries/messages.ts`
**Change:** append `2c823eb`'s `queries.ts` lines 1133–1565 verbatim (§4b banner opener 1133
through `deleteNinaMessage`'s closing brace 1565, including the blank line 1428 between the
sections; the trailing blank 1566 is dropped at EOF). Mechanical extraction, not hand-copying:

```bash
cd /home/miftah/.worktrees/run-insights/tokenmax-2026-09-12-nina-queries-split
git show 2c823eb:lib/nina/queries.ts | sed -n '1133,1565p' >> lib/nina/queries/messages.ts
```

(If phases 1–2 have landed as commits, replace `2c823eb` with the phase-2 commit's parent that
still contains the body — or any pre-phase-1 rev such as `2c823eb` itself; the bytes are
identical either way. `git show 2c823eb:...` works regardless of later commits.)

Anchor check — the appended body must start with these two lines and end with this line:

```
/* ---------------------------------------------------------------------------
 * §4b The messages
```
… and end with:
```
  return deleted[0] ?? null
}
```

**Impact:** 433 lines land. Byte-identity with the source is proven in Verification.

### Step 3: Rewrite the two §-pointers (R6)
**File:** `lib/nina/queries/messages.ts`
**Change:** exactly two hunks. Banner titles (`§4b The messages`, `§4c Message mutation`) are NOT
rewritten — they travel byte-identical (invariant 5). Everything else in the moved body is
untouched, including "THIS FILE" prose (see Handoffs).

**Rewrite A** — the §4b self-reference inside `messageScope`'s docstring (source line 1158;
"§4b" now names this module):

Before (as extracted from 1158–1159):
```ts
 * both ways (see §4b's header), and `getNinaMessageWindow` no longer uses this helper at all
 * because its two statements deliberately disagree about scope (F35 phase 3, D4).
```
After:
```ts
 * both ways (see the messages module's header), and `getNinaMessageWindow` no longer uses this
 * helper at all because its two statements deliberately disagree about scope (F35 phase 3, D4).
```
(The substitution lengthens the sentence past the 100-column house width, so the two lines
reflow; wording beyond the pointer itself is unchanged.)

**Rewrite B** — the §5 forward reference inside §4c's banner (source line 1433; §5 becomes the
images module in phase 4, and it is no longer "below" in this file):

Before (as extracted from 1433):
```ts
 * between `markNinaMessagesRead` above and the `§5 Images` banner below. Phase 7 writes them,
```
After:
```ts
 * between `markNinaMessagesRead` above and the images module. Phase 7 writes them,
```

**Impact:** after these two edits the moved range contains no §-pointer that crosses a module
boundary. The file's remaining §-mentions are the two banner titles.

### Step 4: Replace the moved span in `lib/nina/queries.ts` with the barrel line
**File:** `lib/nina/queries.ts`
**Change:** delete the whole span from the line

```
/* ---------------------------------------------------------------------------
 * §4b The messages
```

through the `}` that closes `deleteNinaMessage` (the line ending `return deleted[0] ?? null`,
immediately before the blank line and the `§5 Images` banner), and put this single line where the
span was:

```ts
export * from './queries/messages'
```

Keep one blank line between the preceding re-export/section boundary and this line, and one blank
line between this line and the `§5 Images` banner. Modeled result (assuming phases 1–2 converted
in place):

```ts
export * from './queries/sessions'
export * from './queries/messages'

/* ============================================================================
 * §5 Images
 * ==========================================================================*/
```

**Impact:** `queries.ts` keeps exporting the 9 names (surface unchanged, R2); §5 onward is
untouched.

### Step 5: Prune the imports only the moved code used
**File:** `lib/nina/queries.ts`
**Change:** four name-level edits, each anchored by content (post-phase-2 line numbers differ
from `2c823eb`):

1. Remove `gt,` from the `drizzle-orm` import block (was line 7 @ 2c823eb). Sole use in the
   entire file was `queries.ts:1237` (`listNinaMessagesAfter`), now moved. Do NOT remove `ne` —
   its only use (@ 2c823eb `:1064`) is §4a and phase 2 owns that prune.
2. Remove `messageColumns` from the `import { … } from './queries/columns'` line; `avatarColumns`
   and `imageColumns` remain (used by §5+ / §9+).
3. Remove `NinaMessageInsert` and `NinaMessageRow` from the
   `import type { … } from './queries/shapes'` line, if present (phase 1's back-import list
   would have included them because §4b/§4c were still in the file then; §5+ never references
   either — verified).
4. Delete `import { getNinaSession } from './queries/sessions'` outright if that line names only
   `getNinaSession` (the index says phase 2's minimum is exactly this); if the line carries other
   names, remove only `getNinaSession`.

Safety valve: `npm run typecheck` with `noUnusedLocals`/eslint is the net on this step. If tsc
flags any other name as unused after Step 4, that name's last remaining user moved in this phase
too — grep it, prune it, and record the extra prune in the phase report. Do not prune anything
tsc does not flag.

**Impact:** `queries.ts` compiles with no unused imports; its non-barrel import surface now
serves §5–§12 only.

## Verification

**Build/typecheck:**
```bash
npm run typecheck        # next typegen && tsc --noEmit
```
**Tests:**
```bash
npx vitest run lib/nina components/nina
```
This includes phase 1's `lib/nina/queries.test.ts` barrel snapshot — it must pass with NO edit
(the value-export name set is unchanged).
**Lint and format:**
```bash
npx eslint lib/nina
npx prettier --check lib/nina/queries.ts lib/nina/queries/messages.ts
```
**Manual check — byte-identity of the move (R4/R11):** the body of `messages.ts` from the §4b
banner opener to EOF must differ from source lines 1133–1565 in exactly the two rewrite hunks:
```bash
cd /home/miftah/.worktrees/run-insights/tokenmax-2026-09-12-nina-queries-split
diff <(git show 2c823eb:lib/nina/queries.ts | sed -n '1133,1565p') \
     <(sed -n '/^\/\* -\{10,\}/,$p' lib/nina/queries/messages.ts)
```
Expected diff: exactly Rewrite A (2 lines replaced by 2 lines) and Rewrite B (1 line replaced by
1 line). Nothing else.
**Manual check — cycle rule and diff surface:**
```bash
grep -n "@/lib/nina/queries" lib/nina/queries/messages.ts   # must print nothing
git status --porcelain                                      # exactly the 2 files
git diff --stat                                             # 1 file modified, 1 created
```
**Exit criteria:** all four gates green; the byte-identity diff shows only the two rewrites;
`queries.ts` contains no definition of any of the 9 moved functions and one
`export * from './queries/messages'` line; `messages.ts` imports no barrel path; the barrel
snapshot test passes unmodified; §5 onward of `queries.ts` is untouched (`git diff` shows no
hunk below the new export line's section).

## Handoffs

- **Phase 4 (Images module):** `hasProactiveMessageForRun` (`queries.ts:1581` @ 2c823eb) moves
  with §5 — the task brief's "8 exports … hasProactiveMessageForRun" miscount is corrected in
  this plan's Goal; the reconciler should treat §4b's inventory as 7 exports + `messageScope`.
  Also: `queries.ts:2303` (§5b docstring) still claims `deleteNinaMessage`'s image cleanup works
  by `ON DELETE CASCADE` — stale since R1 changed it to the explicit statement this phase moves
  (`messages.ts`, `deleteNinaMessage`). Pre-existing staleness inside §5's bytes: phase 4 moves
  it byte-identical; flagged for phase 8's live-prose sweep, not fixable here without violating
  invariant 5.
- **Phase 8 (final sweep):** two "THIS FILE" locators inside moved prose become inexact once the
  layer is multi-file, and are outside this phase's sanctioned rewrite class (§-pointers only):
  (1) `insertNinaMessages`'s docstring banner "THE SECOND PLACE IN THIS FILE THAT VALIDATES AN FK
  BY HAND" (@ 2c823eb `:1312`, now in `messages.ts`) — the first place (`insertNinaMessageImages`)
  will live in `queries/images.ts`; (2) none other found — `listNinaMessages`'s "every statement
  in this file scopes on the owner" (@ `:1188`) stays true within `messages.ts`. Phase 8's
  live-prose sweep adjudicates (1); the module map should record that §4b/§4c banner titles
  persist inside `messages.ts` by design.
- **Phase 2:** owns the `ne` drizzle-import prune (sole use `:1064`, §4a). This phase deliberately
  does not prune it; the Step 5 safety valve covers the case where phase 2 missed it.

## Rollback

- `git revert <phase-commit>` — the phase is one commit whose diff is exactly the new file plus
  the `queries.ts` edits, so the revert restores the pre-phase tree exactly.
- Manual, without git: delete `lib/nina/queries/messages.ts`; restore
  `git show 2c823eb:lib/nina/queries.ts` lines 1133–1565 in place of the
  `export * from './queries/messages'` line; re-add `gt,` to the drizzle import and
  `messageColumns` / `NinaMessageInsert` / `NinaMessageRow` / `getNinaSession` to their
  import-back lines.
