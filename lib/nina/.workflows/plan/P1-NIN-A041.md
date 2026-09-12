> Adopted from `NINA_QUERIES_SPLIT_PLAN.md` phase 2. Source: `.workflows/plan/nina-queries-split/phase-2.md`.
> Written and reconciled by /analyze — edit the source, not this copy.

# Phase 2: Sessions module (§3 Identity + §4a)

**Plan set:** `NINA_QUERIES_SPLIT_PLAN.md`
**Analysis:** `20260912-201916_code_analyzer.md`
**Satisfies:** R1, R2, R4, R6, R11
**Depends on:** Phase 1
**Difficulty:** NORMAL
**Package:** `lib/nina`

---

## Goal

`lib/nina/queries/sessions.ts` exists and owns Nina's identity read and every conversation-session
statement (§3 + §4 group banner + §4a, current `queries.ts:685–1131`, 447 lines), moved
byte-identical except three quoted pointer rewrites. `lib/nina/queries.ts` is smaller by exactly
that span, still exports every symbol it did before (via `export * from './queries/sessions'` plus
one explicit `getNinaSession` import-back), and its import list carries nothing the remaining
sections no longer use. Zero behavior change: same SQL, same signatures, same return shapes.

## Interface Contract

The reconciler reads this section to detect cross-phase conflicts. Be exact and exhaustive.

**Deletes:** from `lib/nina/queries.ts` — the contiguous span "§3 Identity" banner through
`removeNinaSession`'s closing brace (HEAD lines 685–1131, plus surrounding blanks 684 and 1132);
the `ne`, `exists` and `max` members of the `drizzle-orm` import (all three have their only
code-level calls inside the moved span: `ne(` :1064, `exists(` :1118, `max(` :791; every other
match in the file is `Math.max` or prose); the `NINA_SLOT_PENDING_PROMISES`, `ninaChatSessions`
and `users` members of the `@/lib/db/schema` import; the entire `@/lib/nina/sessions` import
statement (HEAD 68–72); the `NinaIdentity`, `NinaSessionRow`, `NinaSessionListRow` members of
Phase 1's type import-back from `./queries/shapes`; the `sessionColumns` member of Phase 1's
import-back from `./queries/columns`. No config keys. No symbols cease to exist — every deleted
line reappears in the new module.

**Renames:** none.

**Creates:** `lib/nina/queries/sessions.ts` exporting exactly 9 functions:
`getNinaIdentity`, `createNinaSession`, `getNinaSession`, `listNinaSessions`,
`ensureNinaSession`, `renameNinaSession`, `setNinaSessionTitleIfUntitled`,
`setNinaSessionPinned`, `removeNinaSession`. `readNinaSessionsWithActivity` moves
module-private (it is private at HEAD `queries.ts:780` and stays private).

**Signature changes:** none.

**Requires (from Phase 1):** `lib/nina/queries/shapes.ts` exports `NinaIdentity`,
`NinaSessionListRow`, `NinaSessionRow`; `lib/nina/queries/columns.ts` exports `sessionColumns`;
`lib/nina/queries.ts` contains the barrel `export * from './queries/shapes'` (the block under
the header — `./queries/columns` is deliberately NOT re-exported) and, in the import block's
relative group, the foundation import-backs: the 27-name `import type { … } from
'./queries/shapes'` line and the `import { … } from './queries/columns'` line. Of those this
phase prunes exactly `NinaIdentity`, `NinaSessionRow`, `NinaSessionListRow`, `sessionColumns`
(measured: zero remaining uses in §4b+).

**Adds (to `lib/nina/queries.ts`):** `export * from './queries/sessions'` (joins Phase 1's
re-export block, third in dependency order) and
`import { getNinaSession } from './queries/sessions'` — the single code-level back-reference
(HEAD `queries.ts:1327`, `insertNinaMessages`). `export *` does not bring names into local
scope; without the explicit import, `tsc` fails on :1327.

**sessions.ts's exact import list** (nothing more — eslint flags unused):

```ts
import { and, desc, eq, exists, inArray, isNull, max, ne, sql } from 'drizzle-orm'
import type { NinaIdentity, NinaSessionListRow, NinaSessionRow } from './shapes'
import { db } from '@/lib/db'
import {
  NINA_SLOT_PENDING_PROMISES,
  ninaChatSessions,
  ninaMemoryFacts,
  ninaMemorySlots,
  ninaMessages,
  users,
} from '@/lib/db/schema'
import { newId } from '@/lib/id'
import {
  NINA_SESSION_TITLE_MAX_CHARS,
  mostRecentNinaSession,
  orderNinaSessions,
} from '@/lib/nina/sessions'
import { sessionColumns } from './columns'
```

(Grouping/order per house style: externals, blank line, `@/` aliases, relative last. The
grouped form is the contract; exact physical grouping may follow whatever Phase 1 established.)

**Leaves alone (owned by others):** every line of §4b onward (HEAD 1133–4573 — Phase 3+),
including the five §4b+ PROSE mentions of moved symbols at HEAD `:1188` (`listNinaSessions`),
`:1304` (`ensureNinaSession`), `:1502`/`:1535`/`:2068` (`removeNinaSession`) — all stay true via
the barrel; `tests/**` (no test reads `queries.ts`'s text — `nina.sessionPurge.test.ts` and
`nina.photoOrphans.test.ts` import the barrel and assert generated SQL through `fakeDb`;
`admin.memory.test.ts:381–386` walks only direct `lib/nina/*.ts` files, see Verification);
`scripts/**` (no script line-pointer lands in 685–1131 — the dedupe pointers cite §5 lines
1757/1812/2073, Phase 4's); `lib/nina/queries.test.ts` (Phase 1's barrel snapshot — must stay
green unmodified); `components/nina/NinaUnreadBadge.test.tsx`'s `vi.mock` (barrel path
unchanged). **Cycle rule honored:** `sessions.ts` never imports `@/lib/nina/queries`.

**Line-number note:** the task brief cites §3 as 686–712, the group banner as 713–716, §4a as
717–1133. Measured on HEAD `2c823eb`, the §3 banner comment starts at **685** and §4b's banner
at **1133**; §3 block = 685–710, blank 711, group banner 712–714, blank 715, §4a block 716–1131,
blank 1132. The code wins; all ranges below are HEAD-measured.

## Files

| File | Action | What changes |
|---|---|---|
| `lib/nina/queries/sessions.ts` | create | provenance header + 9 imports + HEAD lines 685–1131 moved verbatim except 3 quoted line rewrites (448 body lines after the rewrites) |
| `lib/nina/queries.ts` | modify | delete the moved span (684–1132); prune 4 import statements (3 drizzle members + 3 schema members + 1 whole statement + 2 Phase-1 import-back member groups); add 1 re-export line + 1 import-back |

## Implementation Steps

### Step 1: Create `lib/nina/queries/sessions.ts` — header and imports

**File:** `lib/nina/queries/sessions.ts:1` (new)
**Change:** write the file header and import block. This is the only new prose in the phase;
everything else is moved.

**Code:**

```ts
import { and, desc, eq, exists, inArray, isNull, max, ne, sql } from 'drizzle-orm'

import { db } from '@/lib/db'
import {
  NINA_SLOT_PENDING_PROMISES,
  ninaChatSessions,
  ninaMemoryFacts,
  ninaMemorySlots,
  ninaMessages,
  users,
} from '@/lib/db/schema'
import { newId } from '@/lib/id'
import {
  NINA_SESSION_TITLE_MAX_CHARS,
  mostRecentNinaSession,
  orderNinaSessions,
} from '@/lib/nina/sessions'
import type { NinaIdentity, NinaSessionListRow, NinaSessionRow } from './shapes'
import { sessionColumns } from './columns'

/**
 * Nina's identity read and her conversation-session statements.
 *
 * Split out of `lib/nina/queries.ts` on 2026-09-12. Origin sections, in file order:
 *   - §3 Identity — `getNinaIdentity`
 *   - §4 The conversation — the group banner over the conversation sections; its other
 *     children (§4b messages, §4c message mutation) move to `lib/nina/queries/messages.ts`
 *     later in the same split
 *   - §4a Sessions — `createNinaSession` … `removeNinaSession`, plus the private
 *     `readNinaSessionsWithActivity`
 *
 * Banner prose moved byte-identical apart from three pointer rewrites where the prose said
 * "this module": the module header those lines cite — the userId-scoping rule, the
 * never-writes-`runs` rule, `db.batch` over `db.transaction`, the `ORDER BY seq` note, the
 * deliberate lack of `server-only` — stays on `lib/nina/queries.ts`'s header. This module
 * inherits those rules; it does not restate them.
 *
 * Imports foundation-wards only (`./shapes`, `./columns`, `@/lib/nina/sessions`) — never the
 * barrel `@/lib/nina/queries`, which re-exports this module.
 */
```

**Impact:** none yet (file unreferenced). `import type` for the three shapes is required by
`verbatimModuleSyntax` — they are types only, and `shapes.ts` has no runtime bindings.

### Step 2: Move the §3 + §4-banner + §4a span into `sessions.ts`

**File:** `lib/nina/queries/sessions.ts` (body, directly after the header doc comment)
**Change:** append HEAD `queries.ts` lines **685–1131** verbatim, in order, then apply exactly
three line rewrites. Extraction (run from the worktree root):

```sh
git show HEAD:lib/nina/queries.ts | sed -n '685,1131p' >> lib/nina/queries/sessions.ts
```

Then apply these three replacements — the complete list of prose changes inside the moved
block (grep proof: the span contains exactly three `§` occurrences, at HEAD :686, :713, :717 —
the banner titles themselves, which travel byte-identical as origin markers; there are **zero**
§-pointers from this span into other sections, so R6's rewrite work here is the adjacent
self-reference class only):

**(a) HEAD :721** — the §4a banner cites "this module's rule 1"; rule 1 lives on the barrel
header post-split. One line, replaced in place:

- Before: ` * Every one is `userId`-scoped in its WHERE, per this module's rule 1 — a session id arriving from`
- After: ` * Every one is `userId`-scoped in its WHERE, per `lib/nina/queries.ts`'s rule 1 — a session id arriving from`

**(b) HEAD :750** — `getNinaSession`'s doc cites "this module's header". One line, replaced
in place:

- Before: ` * `null` means "not yours, or gone" — deliberately one outcome, per this module's header. A screen`
- After: ` * `null` means "not yours, or gone" — deliberately one outcome, per `lib/nina/queries.ts`'s header. A screen`

**(c) HEAD :873** — `setNinaSessionTitleIfUntitled`'s doc justifies "here" by "`lib/nina/queries.ts`
is phase 1's file", which the move falsifies ("here" is now `sessions.ts`). One line becomes two:

- Before: ` * Written here because `lib/nina/queries.ts` is phase 1's file, not because phase 1 needs it. Phase 4`
- After (2 lines):
  ` * Written in the query layer — `lib/nina/queries/sessions.ts` since the 2026-09-12 split of phase`
  ` * 1's `lib/nina/queries.ts` — not because phase 1 needs it. Phase 4`

The moved body is therefore **448 lines** (447 − 1 + 2). Everything else — both `====` banners,
the §4 group banner (712–714), the §4a banner (716–723), all nine functions,
`readNinaSessionsWithActivity`, the R8 subquery banner and the why-no-FK-cascade banner — is
byte-identical to HEAD.

**Considered and left unchanged (do not touch):** HEAD :766 "the `getNinaIdentity` idiom"
(intra-module post-move — both in `sessions.ts`); HEAD :776 "Not exported … the two exported
readers below" (still true — `readNinaSessionsWithActivity` stays private, both readers still
follow); HEAD :808–813 "(invariant 7)" (a roadmap citation, not a section pointer); HEAD :848–851
(`lib/nina/sessions.ts` / `lib/nina/title.ts` — external paths, still true); HEAD :1007 bare
"(rule 1)" (antecedent supplied by the new provenance header's "inherits those rules" sentence);
HEAD :986 and :1031 citations of `tests/nina.photoOrphans.test.ts` / `tests/admin.memory.test.ts`
(both still accurate — verified those tests' mechanisms).

**Impact:** `sessions.ts` compiles standalone against the Step 1 imports; `tsc` proves the
import list is exactly sufficient.

### Step 3: Delete the moved span from `lib/nina/queries.ts`

**File:** `lib/nina/queries.ts` (post-Phase-1 coordinates; anchored by content, not numbers)
**Change:** delete the contiguous span from the `§3 Identity` banner's opening `/* ============`
line through the closing brace of `removeNinaSession` **and the blank line after it** — at HEAD,
lines 684–1132 (leading blank 684, §3 685–710, blank 711, §4 group banner 712–714, blank 715,
§4a 716–1131, trailing blank 1132). After Phase 1 landed, these anchors still identify the span
unambiguously: it begins at the line ` * §3 Identity` (with its `====` borders) and ends at the
line before `/* ---------------------------------------------------------------------------` /
` * §4b The messages`. Exactly one blank line separates the last surviving line above the span
from the `§4b` banner afterwards, matching house spacing.

**Impact:** `queries.ts` loses 449 lines. Nothing else in §4b+ references the span at code level
(measured: the only code-level use of any moved symbol in 1134–4573 is `getNinaSession` at :1327).

### Step 4: Prune `lib/nina/queries.ts`'s import list

**File:** `lib/nina/queries.ts:1–83` (import block; HEAD numbering)
**Change:** four statements change; every other import is untouched.

**(i) drizzle-orm** — remove `ne`, `exists` and `max` (measured: §1–§2 don't use them; the
only code-level calls are the moved §4a statements — `ne(` :1064, `exists(` :1118, `max(` :791
— and every other file-wide match is `Math.max` or prose). The statement becomes exactly:

```ts
import {
  and,
  asc,
  desc,
  eq,
  gt,
  gte,
  inArray,
  isNotNull,
  isNull,
  notExists,
  or,
  sql,
  type SQL,
} from 'drizzle-orm'
```

(`gt`'s last use is §4b's :1237 — phase 3 prunes it; `notExists`'s is §5's :2084 — phase 4.)

**(ii) `@/lib/db/schema`** — remove `NINA_SLOT_PENDING_PROMISES` (code uses only at HEAD :1064
and :1116, both moved; :2536 is prose), `ninaChatSessions` (only §4a + Phase-1-moved §2 used it),
and `users` (only code use at HEAD :696, §3 — the §4b+ count is zero; the `user` alias join lives
in `messageColumns`, which Phase 1 moved to `columns.ts`). All other members keep their order.
This is the POST-Phase-1 statement: the five §1-only types phase 1 pruned (`NinaAvatarSource`,
`NinaMessageSource`, `NinaRole`, `NinaSessionTitleSource`, `NinaTurnStatus`) are already gone
and must NOT reappear here; `ninaMessageImages` was in the statement all along and stays.

```ts
import {
  ninaAvatars,
  ninaFolders,
  ninaImagePrefs,
  ninaMemoryFacts,
  ninaMemorySlots,
  ninaMessageImages,
  ninaMessages,
  ninaNags,
  ninaShortcuts,
  ninaTuning,
  ninaTurns,
  type NinaFactCategory,
  type NinaImageKind,
  type NinaImagePrefsRow,
  type NinaMemorySource,
  type NinaSlotValue,
  type NinaTuningRow,
  type NinaTurnKind,
} from '@/lib/db/schema'
```

**(iii) `@/lib/nina/sessions`** — delete the whole statement (HEAD 68–72; all three members are
§4a-only).

**(iv) Phase 1's foundation import-backs** — remove `NinaIdentity`, `NinaSessionRow`,
`NinaSessionListRow` from the `./queries/shapes` type import-back and `sessionColumns` from the
`./queries/columns` import-back (measured: zero occurrences of any of the four in HEAD
1134–4573; their last users just moved). Whatever members Phase 1's lines carry for §4b+ —
at minimum `NinaMessageInsert`, `NinaMessageRow`, `messageColumns` — stay. Do not otherwise
restructure Phase 1's lines.

**Impact:** `tsc` fails if any pruning is wrong in either direction — a kept-but-unused name
trips eslint's unused-vars, a wrongly-pruned name trips tsc. That symmetry is the gate.

### Step 5: Add the barrel re-export and the `getNinaSession` import-back

**File:** `lib/nina/queries.ts`
**Change:** two additions.

(1) Join Phase 1's barrel block (the `export * from './queries/shapes'` line under the header
doc comment, `queries.ts:148–163` at phase-1 exit — `./queries/columns` is imported by phase 1,
never re-exported, so it is not a block line), adding the second `export *` line in dependency
order:

```ts
export * from './queries/sessions'
```

(2) In the import block's relative-import group (after the `./queries/…` foundation imports
Phase 1 added):

```ts
import { getNinaSession } from './queries/sessions'
```

**Impact:** `insertNinaMessages`'s call at (post-move) `queries.ts` resolves; the barrel's
export surface gains nothing and loses nothing — the 9 moved names are re-exported through
`export *`, verified by Phase 1's `lib/nina/queries.test.ts` name-set snapshot, which must pass
unmodified.

## Verification

**Build/typecheck:**

```sh
npm run typecheck
```

(`next typegen && tsc --noEmit` — vitest does not typecheck; this is the net that catches every
missed import-back or wrong prune.)

**Tests (scoped):**

```sh
npx vitest run lib/nina components/nina tests/nina.sessionPurge.test.ts tests/nina.photoOrphans.test.ts tests/admin.memory.test.ts
```

The three `tests/` files are included deliberately: they are the suites that execute
`removeNinaSession`/`deleteNinaMessage` against the fakeDb recorder, and they import the barrel,
so they exercise the new module hop end to end.

**Lint/format:**

```sh
npx eslint lib/nina
npx prettier --check lib/nina/queries.ts lib/nina/queries/sessions.ts
```

(Do NOT run `npm run format` — it is repo-wide.)

**Byte-proof of the move (R4/R11 evidence):**

```sh
git show HEAD:lib/nina/queries.ts | sed -n '685,1131p' | diff - <(tail -n +39 lib/nina/queries/sessions.ts)
```

(`39` = the 38 header/import lines of Step 1's block + 1; adjust to the actual first body line
if the import block's physical grouping was aligned with Phase 1's.) The expected diff is
exactly rewrites (a), (b) and the two-line replacement (c) — nothing else. Additionally:

```sh
grep -c "from '@/lib/nina/queries'" lib/nina/queries.ts lib/nina/queries/sessions.ts  # queries.ts: hits ok; sessions.ts: 0 (cycle rule)
grep -n 'sessionColumns\|NinaIdentity\|readNinaSessionsWithActivity' lib/nina/queries.ts  # no hits
grep -n '§3 Identity\|§4a Sessions' lib/nina/queries.ts  # no hits
grep -nE '(^|[^a-zA-Z.])(ne|exists|max)\(' lib/nina/queries.ts  # no hits (Math.max excluded — the `.` guard)
grep -n 'NinaAvatarSource\|NinaMessageSource\|NinaRole\|NinaSessionTitleSource\|NinaTurnStatus' lib/nina/queries.ts  # no hits (phase 1's prune held)
```

**admin.memory.test.ts — why the new directory cannot break it (verified, no change needed):**
the walker at `tests/admin.memory.test.ts:381–386` iterates `readdirSync('lib/nina',
{ withFileTypes: true })` but skips non-files at :382 (`if (!entry.isFile() ||
!entry.name.endsWith('.ts')) continue`), so the `queries/` subdirectory (created by Phase 1,
populated further here) is neither read (no EISDIR) nor scanned. The assertion is absence of
`admin/memoryStore` / `admin/memoryActions` in direct `lib/nina/*.ts` files; the moved prose
(HEAD :974) says `lib/admin/` but never either banned specifier, and after the move it is not
under a scanned path at all. The test passes unmodified.

**Manual check:** none beyond the greps above; behavior is covered by the fakeDb suites.

**Exit criteria:** all commands above green; `lib/nina/queries.test.ts` (Phase 1's barrel
snapshot) passes with no edit, proving the export-name set is unchanged; `queries.ts` contains
no §3/§4a code; `sessions.ts` exports exactly the 9 functions. Commit once, pathspec limited to
`lib/nina/queries.ts lib/nina/queries/sessions.ts`, and read the `--stat` (2 files, ~460
insertions / ~455 deletions).

## Handoffs

- **Phase 3 (messages):** when §4b moves, the `import { getNinaSession } from './queries/sessions'`
  fixup line added in Step 5 leaves `queries.ts` with the §4b code; `messages.ts` imports
  `getNinaSession` from `./sessions` directly. The HEAD `:1188`/`:1304` prose mentions travel
  with §4b and remain true (symbol names, not section pointers).
- **Phase 4 (images):** no script line-pointer lands in 685–1131 (verified — `:1757`, `:1812`,
  `:2073` are all §5), so this phase creates no script work for it.
- **Phase 8 (final sweep):** (1) `admin.memory.test.ts`'s lib/nina walk is non-recursive by its
  `isFile` filter, so `lib/nina/queries/*.ts` are outside its scan — a coverage narrowing worth
  one sentence in the readme (or a recursive walk, if phase 8 wants it); NOT changed here.
  (2) package_readme counts: `queries.ts` shrinks by ~449 lines this phase; date-stamp any
  stated counts. (3) The §-ref audit will find zero §-pointers originated by this span (proven
  above by grep), so phase 8's audit starts from a clean §3/§4a slate.

## Rollback

One commit contains the whole phase. `git revert <phase-commit>` restores `queries.ts` exactly
and removes `sessions.ts` (a revert of a pure file-create + file-edit pair is exact). Without
the commit: `git checkout HEAD~1 -- lib/nina/queries.ts && rm lib/nina/queries/sessions.ts`.
No migrations, no data, no other files touched.
