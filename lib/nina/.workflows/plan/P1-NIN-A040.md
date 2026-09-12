> Adopted from `NINA_QUERIES_SPLIT_PLAN.md` phase 1. Source: `.workflows/plan/nina-queries-split/phase-1.md`.
> Written and reconciled by /analyze — edit the source, not this copy.

# Phase 1: Foundations — shapes + columns modules, barrel contract test, real install + build smoke

**Plan set:** `NINA_QUERIES_SPLIT_PLAN.md`
**Analysis:** `20260912-201916_code_analyzer.md`
**Satisfies:** R1 (first two modules exist under `lib/nina/queries/`), R2 (barrel surface frozen and enforced by a test), R3 (layer header stays on the barrel, untouched), R5 (§1/§2 become the shared foundation modules), R9 (`lib/nina/queries/` directory established), R10 (scoped gates + the set's real-install/`next build` prerequisite retired here), R11 (zero behavior change, byte-identity verified by diff)
**Depends on:** none
**Difficulty:** NORMAL
**Package:** `lib/nina`

---

## Goal

`lib/nina/queries.ts` stops hosting §1 Shapes and §2 Column lists: the 27 §1 row/insert/result
types move byte-identical to a new pure-leaf `lib/nina/queries/shapes.ts` (the file's three
other type exports — `NinaChatPhotoBlobPatch` in §5b, `NinaJobPhotoRow`/`NinaJobPhotoBubbleRow`
in §12 — stay with their sections and move in phases 4/7), and the four
drizzle column lists move to a new `lib/nina/queries/columns.ts`, exported only for sibling
query modules and deliberately NOT re-exported by the barrel. `queries.ts` keeps every line
of §3+ and its layer-invariant header, gains the barrel block (`export * from
'./queries/shapes'`) under the header plus import-backs in the import block's relative group —
the four column lists (imported, never re-exported) and a `import type` back-import of the 27
§1 names §3+ still references (`export *` re-exports names to OTHER modules but does not
create local bindings, so §3+'s annotations need the explicit type import) — and its runtime
export surface stays exactly the 83 names it has today — now enforced by a new
`lib/nina/queries.test.ts`. This phase also
replaces the worktree's symlinked `node_modules` with a real install and proves a green
`next build`, retiring the Turbopack/new-directory-resolution risk in phase 1, not phase 8.

All line numbers below refer to `lib/nina/queries.ts` as of `HEAD` = `2c823eb` (4573 lines),
measured 2026-09-12 by AST walk. If `HEAD` differs when this phase runs, re-run the Step 0
derivation and update the frozen list before touching anything.

## Interface Contract

The reconciler reads this section to detect cross-phase conflicts. Be exact and exhaustive.

**Deletes:** nothing public. Inside `queries.ts`'s import block, five type-only imports become
unused and are pruned: `NinaAvatarSource`, `NinaMessageSource`, `NinaRole`,
`NinaSessionTitleSource`, `NinaTurnStatus` (all from `@/lib/db/schema`; all referenced only in
§1 — proven by AST usage counts: 3, 2, 2, 1, 1 refs inside lines 122–611, 0 refs after line
684). The types themselves survive in `shapes.ts`. No config keys, no files deleted.

**Renames:** none. Every symbol keeps its exact name and import path (`@/lib/nina/queries`).

**Creates:**
- `lib/nina/queries/shapes.ts` — declares the 27 §1 type exports (the old lines 122–611 span;
  measured by `grep -c '^export '` over that range): `NinaAvatarBatchInsert`,
  `NinaAvatarBlobRef`, `NinaAvatarCrop`, `NinaAvatarFolderCount`, `NinaAvatarFolderPage`,
  `NinaAvatarInsert`, `NinaAvatarManifestEntry`, `NinaAvatarRow`,
  `NinaFactInsert`, `NinaFactRow`, `NinaFolderRenameResult`, `NinaIdentity`,
  `NinaImageInsert`, `NinaImageRow`,
  `NinaMediaPage`, `NinaMessageInsert`, `NinaMessageRow`, `NinaNagRow`, `NinaNagUpsert`,
  `NinaSessionListRow`, `NinaSessionRow`, `NinaShortcutInsert`, `NinaShortcutPatch`,
  `NinaShortcutRecord`, `NinaSlotRow`, `NinaSlotUpsert`, `NinaTurnInsert`. All are type-only
  (`interface`/`type`), so this module contributes **zero** runtime keys to the barrel. The
  file's three OTHER type exports are not in this span and do not move here:
  `NinaChatPhotoBlobPatch` (§5b, phase 4 → `images.ts`) and `NinaJobPhotoRow` /
  `NinaJobPhotoBubbleRow` (§12, phase 7 → `jobphotos.ts`); the file-wide type surface stays 30.
- `lib/nina/queries/columns.ts` — exports exactly four values: `sessionColumns`,
  `messageColumns`, `imageColumns`, `avatarColumns` (today private `const`s at
  `queries.ts:621, 629, 644, 664`, now module exports marked "internal — shared with sibling
  query modules").
- `lib/nina/queries.test.ts` — the barrel contract test freezing the 83-name runtime export
  list (full list in Step 7).

**Signature changes:** none.

**Requires (from earlier phases):** none — this is the first phase.

**Leaves alone (owned by others):**
- §3–§12 bodies (today `queries.ts:685–4573`) — byte-identical; Phases 2–7 move them.
- The layer-invariant header (`queries.ts:85–120`) — untouched here (R3; Phase 8 adds the
  module map to it).
- All 14 source importers, the 4 operator scripts, both package_readmes, every
  `.workflows/plan/**` and `docs/plans/archive/**` file (R7).
- The flat sibling modules `lib/nina/{memory,sessions,shortcuts,tuning,imageprefs,images}.ts`
  — distinct paths from the new `lib/nina/queries/*.ts`; nothing collides.

**Binding statements this phase adds to `queries.ts` (the only new code there):**

In the import block's relative-import group, directly after the last `@/` import
(old line 83, the perceptual import's closing line):

```ts
import type {
  NinaAvatarBatchInsert,
  NinaAvatarBlobRef,
  NinaAvatarCrop,
  NinaAvatarFolderCount,
  NinaAvatarFolderPage,
  NinaAvatarInsert,
  NinaAvatarManifestEntry,
  NinaAvatarRow,
  NinaFactInsert,
  NinaFactRow,
  NinaFolderRenameResult,
  NinaIdentity,
  NinaImageInsert,
  NinaImageRow,
  NinaMediaPage,
  NinaMessageInsert,
  NinaMessageRow,
  NinaNagRow,
  NinaNagUpsert,
  NinaSessionListRow,
  NinaSessionRow,
  NinaShortcutInsert,
  NinaShortcutPatch,
  NinaShortcutRecord,
  NinaSlotRow,
  NinaSlotUpsert,
  NinaTurnInsert,
} from './queries/shapes'
import { avatarColumns, imageColumns, messageColumns, sessionColumns } from './queries/columns'
```

All 27 §1 names are in the back-import because every one of them is referenced by some §3+
signature at `2c823eb` (3 session + 2 message + 3 image + 10 memory/shortcut/nag/turn +
9 avatar = 27; the Step 0 refs-after-684 column is the check, and tsc/eslint are the net on
both sides — an unused member trips eslint, a missing one trips tsc). These import-backs are
pruned member-by-member as the sections move: phase 2 removes the 3 session types +
`sessionColumns`; phase 3 the 2 message types + `messageColumns`; phase 4 the 3 image types +
`imageColumns`; phase 5 the 10 memory/shortcut/nag/turn types; phase 6 deletes what remains.

And the contiguous "barrel block" replacing old lines 122–684 (details in Step 5):

```ts
/* ============================================================================
 * The barrel — the public surface, assembled from ./queries/
 *
 * Each domain module under `lib/nina/queries/` is re-exported here with `export *`, one
 * line per module, added by the phase that creates it. `export *` rather than an explicit
 * list, because verbatimModuleSyntax would force `export type` on every interface and no
 * two modules declare the same name. The header above is still the layer's contract and
 * governs every module listed.
 *
 * The four column lists of `./queries/columns` are imported at the top of this file, never
 * re-exported: they were private before the split and stay internal — shared between
 * sibling query modules only.
 * ==========================================================================*/

export * from './queries/shapes'
```

The columns import feeds the local scope only — `export *` is deliberately NOT used for
`./queries/columns`, so the barrel's runtime surface stays frozen at 83 names. The block at
new `queries.ts:148–163` is the designated append point for Phases 2–7's `export * from
'./queries/<m>'` lines (their fixup import-backs go in the import block's relative group,
where this phase put the foundation ones).

**Frozen-surface rule for later phases (binding):** `lib/nina/queries.test.ts` fails on ANY
runtime export added to or removed from `@/lib/nina/queries`. One documented exception will
land later, updating the test's list in the same commit:
- Phase 4 adds exactly `generatedChatPhotoScope` and `isOriginalPhoto` (plan-index Decision 3:
  they become module exports of `queries/images.ts` and surface via that module's barrel line)
  — 83 → 85, the set's only growth.
- Nothing else. If a later phase's move grows the list by any other name (e.g. someone adds
  `export * from './queries/columns'`), that contradicts this phase's scope and the test is
  designed to catch it — resolve in the plan set, not by weakening the assertion.

## Files

| File | Action | What changes |
|---|---|---|
| `lib/nina/queries/shapes.ts` | create | new module: header (lines 1–28, new prose + 2 type-only imports) + old `queries.ts:122–611` byte-identical (§1 banner incl. ruling A1 + all 27 §1 types) |
| `lib/nina/queries/columns.ts` | create | new module: header (lines 1–16, new prose + 1 value import) + old `613–619` banner byte-identical + old `621–683` with exactly four `const`→`export const` changes and four one-line internal markers |
| `lib/nina/queries.ts` | modify | five dead type imports pruned from the schema import block (old lines 37, 42, 43, 44, 48); two import-backs added to the import block's relative group (27-name `import type` from `./queries/shapes` + the `./queries/columns` value import); old lines 122–684 (§1+§2) replaced by the 16-line barrel block (comment + `export * from './queries/shapes'` + trailing blank); §3+ shifts from 685–4573 to 164–4052, byte-identical; the header (old 85–120) shifts to 111–146 byte-identical; file goes 4573 → 4052 lines |
| `lib/nina/queries.test.ts` | create | barrel contract test: `import * as barrel from '@/lib/nina/queries'`, asserts `Object.keys(barrel).sort()` deep-equals the frozen 83-name list, and that every runtime export is a function |
| `node_modules` (worktree) | env only | symlink replaced by a real `npm ci` install; gitignored, never committed |

## Implementation Steps

Run everything from the worktree root:
`/home/miftah/.worktrees/run-insights/tokenmax-2026-09-12-nina-queries-split`.

### Step 0: Preconditions + capture the byte sources and the frozen list

**Change:** Verify the tree is at the expected state, capture the exact byte ranges this phase
moves (so later verification never depends on `HEAD` shifting), and derive the barrel's value
exports mechanically.

```bash
# preconditions: clean source file, expected shape
git status --porcelain            # only the plan/analysis .md files may be untracked; lib/nina untouched
wc -l lib/nina/queries.ts         # expect 4573
git show HEAD:lib/nina/queries.ts | wc -l   # expect 4573
ls lib/nina/queries 2>/dev/null   # expect: does not exist yet

# capture the byte sources this phase redistributes
git show HEAD:lib/nina/queries.ts | sed -n '122,611p' > /tmp/p1-section1.txt   # §1 banner + body (490 lines)
git show HEAD:lib/nina/queries.ts | sed -n '613,619p' > /tmp/p1-section2-banner.txt
git show HEAD:lib/nina/queries.ts | sed -n '621,683p' > /tmp/p1-section2-lists.txt  # 63 lines
git show HEAD:lib/nina/queries.ts | sed -n '685,4573p' > /tmp/p1-rest.txt           # 3889 lines
wc -l /tmp/p1-*.txt
# (the head is captured in two parts in Step 5 — /tmp/p1-head-a.txt 1–83 and
#  /tmp/p1-head-b.txt 84–121 — because the import-backs insert between them)
```

Then write the derivation script to `/tmp/p1-derive.cjs` (complete file below) and run it.
It walks `queries.ts` with the TypeScript compiler API (types are in `node_modules`), prints
the sorted value-export list (expect the 83 names in Step 7, count 83) and the 30 type
exports, and proves the five-import prune: every import binding is classified by whether it
is referenced after line 684.

```js
// /tmp/p1-derive.cjs — mechanical export derivation for lib/nina/queries.ts.
// Run: NODE_PATH=$PWD/node_modules node /tmp/p1-derive.cjs   (from the worktree root)
const fs = require('fs')
const ts = require('typescript')

const src = fs.readFileSync('lib/nina/queries.ts', 'utf8')
const sf = ts.createSourceFile('queries.ts', src, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS)
const lineOf = (node) => sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1

const values = []
const types = []
const importNames = []

for (const st of sf.statements) {
  if (ts.isImportDeclaration(st)) {
    const clause = st.importClause
    if (!clause) continue
    if (clause.name) importNames.push(clause.name.text)
    if (clause.namedBindings && ts.isNamedImports(clause.namedBindings))
      for (const el of clause.namedBindings.elements) importNames.push(el.name.text)
    continue
  }
  const mods = st.modifiers || []
  if (!mods.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)) continue
  if (ts.isInterfaceDeclaration(st) || ts.isTypeAliasDeclaration(st)) {
    types.push(st.name.text)
  } else if (ts.isVariableStatement(st)) {
    for (const d of st.declarationList.declarations)
      if (ts.isIdentifier(d.name)) values.push(d.name.text)
  } else if ((ts.isFunctionDeclaration(st) || ts.isClassDeclaration(st)) && st.name) {
    values.push(st.name.text)
  }
}

console.log('VALUE_EXPORTS', values.length)
console.log(JSON.stringify(values.sort()))
console.log('TYPE_EXPORTS', types.length)
console.log(JSON.stringify(types.sort()))

// Which imports are referenced only inside the moved §1/§2 region (lines 122–684)?
// Those die in queries.ts and must be re-homed in shapes.ts / columns.ts.
const refs = new Map(importNames.map((n) => [n, []]))
const visit = (node) => {
  if (ts.isImportDeclaration(node)) return // skip the whole import subtree
  if (ts.isIdentifier(node)) {
    const p = node.parent
    const skip =
      (p && ts.isPropertyAccessExpression(p) && p.name === node) || // .name of an access
      (p &&
        (ts.isPropertySignature(p) ||
          ts.isMethodSignature(p) ||
          ts.isPropertyAssignment(p) ||
          ts.isMethodDeclaration(p)) &&
        p.name === node) || // object/type member KEY (shorthand still counts — see below)
      (p &&
        (ts.isFunctionDeclaration(p) ||
          ts.isClassDeclaration(p) ||
          ts.isInterfaceDeclaration(p) ||
          ts.isTypeAliasDeclaration(p) ||
          ts.isVariableDeclaration(p) ||
          ts.isParameter(p) ||
          ts.isEnumMember(p)) &&
        p.name === node) // a local declaration's own name
    if (!skip) {
      const set = refs.get(node.text)
      if (set) set.push(lineOf(node))
    }
  }
  ts.forEachChild(node, visit)
}
visit(sf)

console.log('\nIMPORT name: refs_in_122-611  refs_after_684')
for (const [name, lines] of [...refs.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
  const moved = lines.filter((l) => l >= 122 && l <= 684).length
  const rest = lines.filter((l) => l > 684).length
  console.log(name + ': ' + moved + ' ' + rest + (rest === 0 ? '   <-- prune from queries.ts' : ''))
}
```

**Check:** the script's `VALUE_EXPORTS` JSON equals exactly the 83-name array in Step 7 and
its count is 83; the prune list is exactly `NinaAvatarSource`, `NinaMessageSource`,
`NinaRole`, `NinaSessionTitleSource`, `NinaTurnStatus`. If anything differs, the file moved
since planning — stop, re-derive, and adjust this plan's numbers before editing.

Also derive the shapes import-back member list (feeds the binding block above): for each of
the 27 §1 type names, count code references after old line 684 — all 27 have at least one at
`2c823eb` (3 session + 2 message + 3 image + 10 memory/shortcut/nag/turn + 9 avatar), so the
back-import carries all 27 sorted. If a name comes back with zero post-684 refs, drop it from
the back-import (an unused import trips eslint) and note it in the commit body.

**Impact:** none yet — this step only reads.

### Step 1: Replace the symlinked node_modules with a real install

**Change:** The worktree's `node_modules` is a symlink to the main checkout's
(`/home/miftah/run-insights/node_modules`). Vitest and tsc pass through it; Turbopack
(`next build`) rejects it. Replace it with a real install so the Step 9 build gate is
meaningful and later phases inherit a buildable tree.

```bash
ls -l node_modules    # confirm it is a symlink BEFORE touching it
rm node_modules       # unlink ONLY the link — never `rm -rf node_modules/` (trailing slash
                      # or -rf risks the MAIN checkout's install; plain `rm` cannot follow it)
ls /home/miftah/run-insights/node_modules   # MUST still exist — abort if not
npm ci                # real install from the committed package-lock.json (~2–5 min)
test -d node_modules && ! test -L node_modules && echo "real install OK"
```

**Impact:** env-only; `node_modules` is gitignored (`/node_modules` in `.gitignore`), so the
commit stays 4 source files. The install stays in this worktree for phases 2–8.

### Step 2: Baseline build on the untouched tree

**Change:** Run the build BEFORE any edit, so a later failure is attributable: if Step 9's
build fails where Step 2 passed, the phase's diff did it; if Step 2 already fails, it is the
environment (and the phase must stop and fix the environment, not edit code).

```bash
npm run build         # Turbopack; prebuild copies the compression worker; expect a clean compile
```

**Impact:** none (no edits yet). If this fails, STOP — do not proceed on a red baseline.

### Step 3: Create lib/nina/queries/shapes.ts

**File:** `lib/nina/queries/shapes.ts:1–28` (new header), `:29–518` (old `queries.ts:122–611`)

**Change:** Header first — imports (exactly what §1's bodies reference: ten schema types and
one shortcut type, all type-only under `verbatimModuleSyntax`), then the provenance doc.
Then append old lines 122–611 byte-identical: the §1 banner (`/* === * §1 Shapes === */`),
the blank line, and all 27 declarations including the THREE-LAYER BOUNDARY ruling A1 inside
`NinaMessageRow`'s doc comment (old line 136).

```bash
mkdir -p lib/nina/queries
cat > lib/nina/queries/shapes.ts << 'EOF'
import type {
  NinaAvatarSource,
  NinaFactCategory,
  NinaImageKind,
  NinaMemorySource,
  NinaMessageSource,
  NinaRole,
  NinaSessionTitleSource,
  NinaSlotValue,
  NinaTurnKind,
  NinaTurnStatus,
} from '@/lib/db/schema'

import type { NinaShortcutKind } from '@/lib/nina/shortcuts'

/**
 * §1 Shapes — every row, insert and result type of the Nina query layer's §1, in one leaf
 * module. (The layer's three other exported types — `NinaChatPhotoBlobPatch` in §5b and
 * `NinaJobPhotoRow`/`NinaJobPhotoBubbleRow` in §12 — travel with their sections, not here.)
 *
 * These types are the foundation every domain module under `lib/nina/queries/` imports, so
 * they live together in a module that imports nothing but schema types — a pure leaf of the
 * dependency graph. No runtime code lives here, so this module contributes nothing to the
 * barrel's runtime surface; `lib/nina/queries.test.ts` freezes that surface either way.
 *
 * Provenance: everything from the section banner below to the end of the file is
 * `lib/nina/queries.ts` §1 (its lines 122–611) moved byte-identical by the queries-split
 * (2026-09-12) — the THREE-LAYER BOUNDARY ruling A1 inside `NinaMessageRow`'s note included.
 */

EOF
cat /tmp/p1-section1.txt >> lib/nina/queries/shapes.ts
wc -l lib/nina/queries/shapes.ts   # expect 518 (28 header + 490 moved)
```

**Verify (byte identity):**
```bash
diff /tmp/p1-section1.txt <(tail -n +29 lib/nina/queries/shapes.ts) && echo "shapes body byte-identical"
```

**Impact:** none on the build yet — nothing imports the new module until Step 6.

### Step 4: Create lib/nina/queries/columns.ts

**File:** `lib/nina/queries/columns.ts:1–16` (new header), `:17–23` (old banner `613–619`),
`:25–91` (old lists `621–683`, four `export` prefixes + four markers)

**Change:** The four column lists were private; they become module exports because sibling
query modules need them (the analysis DAG: `sessionColumns` → sessions; `messageColumns` →
messages + images; `imageColumns` → images + jobphotos; `avatarColumns` → avatars). The
banner moves verbatim; each list gets `export` and a one-line internal marker. The barrel
will import — never re-export — this module.

```bash
cat > lib/nina/queries/columns.ts << 'EOF'
import { ninaAvatars, ninaChatSessions, ninaMessageImages, ninaMessages } from '@/lib/db/schema'

/**
 * §2 Column lists — the four drizzle projections every SELECT in the Nina query layer
 * spells out. The section banner below (moved verbatim) carries the WHY.
 *
 * **Internal — shared with sibling query modules.** These four lists were private inside
 * `lib/nina/queries.ts`; they are exported here only so sibling modules under
 * `lib/nina/queries/` can import them from `./columns`. The barrel deliberately does NOT
 * re-export them, and `lib/nina/queries.test.ts` freezes the public surface without them.
 *
 * Provenance: `lib/nina/queries.ts` §2 (its lines 613–683) moved by the queries-split
 * (2026-09-12); the banner below is byte-identical, and the only change to the four lists
 * is `export` plus the one-line marker above each.
 */

EOF
{
  cat /tmp/p1-section2-banner.txt
  echo ''
  echo '/** Internal — shared with sibling query modules; never re-exported by the barrel. */'
  sed 's/^const /export const /' /tmp/p1-section2-lists.txt | sed -n '1,7p'
  echo ''
  echo '/** Internal — shared with sibling query modules; never re-exported by the barrel. */'
  sed 's/^const /export const /' /tmp/p1-section2-lists.txt | sed -n '9,22p'
  echo ''
  echo '/** Internal — shared with sibling query modules; never re-exported by the barrel. */'
  sed 's/^const /export const /' /tmp/p1-section2-lists.txt | sed -n '24,42p'
  echo ''
  echo '/** Internal — shared with sibling query modules; never re-exported by the barrel. */'
  sed 's/^const /export const /' /tmp/p1-section2-lists.txt | sed -n '44,63p'
} >> lib/nina/queries/columns.ts
wc -l lib/nina/queries/columns.ts   # expect 91
```

(The `sed -n` ranges slice the captured 63-line list file around its blank separator lines:
`sessionColumns` = lines 1–7, blank 8, `messageColumns` = 9–22, blank 23, `imageColumns` =
24–42, blank 43, `avatarColumns` = 44–63.)

**Verify (byte identity of banner and lists, with only the sanctioned transform):**
```bash
diff /tmp/p1-section2-banner.txt <(sed -n '17,23p' lib/nina/queries/columns.ts) \
  && echo "banner byte-identical"
diff <(sed 's/^const /export const /' /tmp/p1-section2-lists.txt) \
     <(sed -n '25,91p' lib/nina/queries/columns.ts | grep -v '/\*\* Internal') \
  && echo "lists byte-identical modulo the 4 export prefixes"
```

**Impact:** none yet — same as Step 3.

### Step 5: Rewrite queries.ts — prune dead imports, replace §1/§2 with the barrel block

**File:** `lib/nina/queries.ts:37,42,43,44,48` (prune) and `:122–684` (replace)

**Change:** One atomic assembly builds the whole new file from the captured sources, so there
is no intermediate broken state. Four parts: the import section (old 1–83, five pruned type
lines) + the two import-backs + the header span (old 84–121: blank + the layer-invariant
header, R3, untouched + trailing blank) + the barrel block (comment + `export *`, replacing
old 122–684) + the §3+ tail (old 685–4573) byte-identical. The import-backs live in the
import block — house style, and where phases 2–6 expect them ("the import block's
relative-import group") — NOT in the barrel block; the barrel block stays re-exports only,
so the final barrel (phase 7) is zero imports.

The five lines removed from the schema import block (they read exactly, one per line):

```ts
  type NinaAvatarSource,
  type NinaMessageSource,
  type NinaRole,
  type NinaSessionTitleSource,
  type NinaTurnStatus,
```

Capture the head in two parts (Step 0 captured only `1,121p`; split it now):

```bash
git show HEAD:lib/nina/queries.ts | sed -n '1,83p'   > /tmp/p1-head-a.txt
git show HEAD:lib/nina/queries.ts | sed -n '84,121p' > /tmp/p1-head-b.txt
```

Assembly:

```bash
{
  grep -v -e '^  type NinaAvatarSource,$' \
          -e '^  type NinaMessageSource,$' \
          -e '^  type NinaRole,$' \
          -e '^  type NinaSessionTitleSource,$' \
          -e '^  type NinaTurnStatus,$' /tmp/p1-head-a.txt
  cat << 'EOF'
import type {
  NinaAvatarBatchInsert,
  NinaAvatarBlobRef,
  NinaAvatarCrop,
  NinaAvatarFolderCount,
  NinaAvatarFolderPage,
  NinaAvatarInsert,
  NinaAvatarManifestEntry,
  NinaAvatarRow,
  NinaFactInsert,
  NinaFactRow,
  NinaFolderRenameResult,
  NinaIdentity,
  NinaImageInsert,
  NinaImageRow,
  NinaMediaPage,
  NinaMessageInsert,
  NinaMessageRow,
  NinaNagRow,
  NinaNagUpsert,
  NinaSessionListRow,
  NinaSessionRow,
  NinaShortcutInsert,
  NinaShortcutPatch,
  NinaShortcutRecord,
  NinaSlotRow,
  NinaSlotUpsert,
  NinaTurnInsert,
} from './queries/shapes'
import { avatarColumns, imageColumns, messageColumns, sessionColumns } from './queries/columns'

EOF
  cat /tmp/p1-head-b.txt
  cat << 'EOF'
/* ============================================================================
 * The barrel — the public surface, assembled from ./queries/
 *
 * Each domain module under `lib/nina/queries/` is re-exported here with `export *`, one
 * line per module, added by the phase that creates it. `export *` rather than an explicit
 * list, because verbatimModuleSyntax would force `export type` on every interface and no
 * two modules declare the same name. The header above is still the layer's contract and
 * governs every module listed.
 *
 * The four column lists of `./queries/columns` are imported at the top of this file, never
 * re-exported: they were private before the split and stay internal — shared between
 * sibling query modules only.
 * ==========================================================================*/

export * from './queries/shapes'

EOF
  cat /tmp/p1-rest.txt
} > lib/nina/queries.ts.new && mv lib/nina/queries.ts.new lib/nina/queries.ts
wc -l lib/nina/queries.ts   # expect 4052
#   = 78 (old 1–83 minus 5) + 31 (import-backs + trailing blank) + 38 (old 84–121)
#     + 16 (barrel block incl. trailing blank) + 3889 (rest)
```

If anything was committed mid-phase, replace the `/tmp/p1-*.txt` sources (captured from
`HEAD` in Step 0) before running this — they must describe the PRE-phase file.

**Verify (three byte-identity diffs):**
```bash
# 1. the import section differs from the original ONLY by the five pruned lines
diff <(grep -v -e '^  type NinaAvatarSource,$' -e '^  type NinaMessageSource,$' \
        -e '^  type NinaRole,$' -e '^  type NinaSessionTitleSource,$' \
        -e '^  type NinaTurnStatus,$' /tmp/p1-head-a.txt) \
     <(sed -n '1,78p' lib/nina/queries.ts) && echo "pruned import section byte-identical"

# 2. §3+ is byte-identical, shifted from 685–4573 to 164–4052
diff /tmp/p1-rest.txt <(sed -n '164,4052p' lib/nina/queries.ts) && echo "rest byte-identical"

# 3. the layer-invariant header prose (old 85–120) is untouched, at its new offset 111–146
#    (78 pruned-part lines + 31 import-back lines sit above it)
diff <(git show HEAD:lib/nina/queries.ts | sed -n '85,120p') <(sed -n '111,146p' lib/nina/queries.ts) \
  && echo "R3 header untouched"
```

**Impact:** `queries.ts` now imports from `./queries/shapes` and `./queries/columns`; the §3+
code's references to `sessionColumns`/`messageColumns`/`imageColumns`/`avatarColumns` resolve
through the new import; every §1 type referenced in a §3+ annotation resolves through the
`import type` back-import (`export *` alone re-exports names to other modules but creates no
local bindings — without the back-import tsc fails on the first §3 signature). No importer
changes.

### Step 6: Sanity-compile before writing the test

```bash
npm run typecheck   # next typegen && tsc --noEmit — proves shapes/columns resolve, no unused-import errors
```

Expected failure mode if a prune was wrong or a range off: TS2305/TS2724 ("has no exported
member") — go back to the offending Step, do not improvise.

### Step 7: Create lib/nina/queries.test.ts — the barrel contract test

**File:** `lib/nina/queries.test.ts` (new, whole file below)

**Change:** Freezes the barrel's runtime surface. The list was derived in Step 0 from the
PRE-move file; it is asserted here against the POST-move barrel — equal because §1's types
contribute no runtime keys and `./queries/columns` is never re-exported. The second test
pins "every runtime export is a function", so any future `export const` that leaks through
`export *` (e.g. a column list) fails loudly by name.

```ts
import { describe, expect, it } from 'vitest'

import * as barrel from '@/lib/nina/queries'

/**
 * The barrel contract (queries-split phase 1, 2026-09-12 @ 2c823eb).
 *
 * Every consumer of the Nina layer imports from `@/lib/nina/queries`, and the split into
 * `lib/nina/queries/*` must not change what that import exposes: the 14 source importers and
 * `NinaUnreadBadge.test.tsx`'s `vi.mock` keep working untouched. This test freezes the exact
 * RUNTIME surface — the 83 exported functions below, sorted — derived mechanically from
 * `queries.ts` by a TypeScript-AST walk BEFORE any section moved. Type-only exports (the
 * file's 30 — 27 of them §1 interfaces, three riding in §5b/§12) are invisible here by
 * nature and are covered by `npm run typecheck` against the live importers.
 *
 * The four column lists in `./queries/columns` were private before the split and are
 * deliberately NOT re-exported, so they must not appear here either. The second test keeps
 * that honest from the other side: everything the barrel exposes at runtime is a function.
 *
 * If this fails because a name was ADDED, the barrel grew. That is legitimate only as a
 * documented decision — plan-index Decision 3's internal-shared helpers (phase 4 adds
 * `generatedChatPhotoScope` and `isOriginalPhoto`) being the known case — and the list is
 * updated in the same commit, sorted, with a pointer to that decision. Never weaken this to
 * a `toContain`, and never let `export *` change the surface by accident.
 */
const BARREL_VALUE_EXPORTS = [
  'adoptNinaMessageImage',
  'appendNinaMemoryFacts',
  'bumpNinaShortcutUses',
  'countNinaAvatars',
  'countNinaChatPhotos',
  'countNinaMediaPhotos',
  'countNinaTurnsSince',
  'countUnreadNinaMessages',
  'createNinaSession',
  'declareNinaFolders',
  'deleteNinaAvatar',
  'deleteNinaAvatars',
  'deleteNinaAvatarsInFolderTree',
  'deleteNinaFolderSubtree',
  'deleteNinaMemoryFact',
  'deleteNinaMemorySlot',
  'deleteNinaMessage',
  'deleteNinaMessageImage',
  'deleteNinaShortcut',
  'ensureNinaSession',
  'findNinaImageByContentHash',
  'findNinaSignedOriginals',
  'getCurrentNinaAvatar',
  'getNinaAvatar',
  'getNinaAvatarBySourceKey',
  'getNinaIdentity',
  'getNinaJobPhoto',
  'getNinaJobPhotoBubble',
  'getNinaMemorySlot',
  'getNinaMemorySlots',
  'getNinaMessageImage',
  'getNinaMessageImagesForMessages',
  'getNinaMessageWindow',
  'getNinaMessagesByIds',
  'getNinaNags',
  'getNinaSession',
  'getUnannouncedCurrentNinaAvatar',
  'hasProactiveMessageForRun',
  'insertNinaAvatarAsCurrent',
  'insertNinaAvatars',
  'insertNinaMessageImages',
  'insertNinaMessages',
  'insertNinaShortcut',
  'insertNinaTurn',
  'isBlobPathnameReferenced',
  'listNinaAvatarFolders',
  'listNinaAvatarManifest',
  'listNinaAvatars',
  'listNinaAvatarsInFolder',
  'listNinaMediaPhotos',
  'listNinaMemoryFacts',
  'listNinaMessageImages',
  'listNinaMessages',
  'listNinaMessagesAfter',
  'listNinaPhotoReferences',
  'listNinaSelfieJobIdsSince',
  'listNinaSessions',
  'listNinaShortcuts',
  'markNinaAvatarAnnounced',
  'markNinaMessagesRead',
  'moveNinaAvatarsToFolder',
  'readNinaImagePrefs',
  'readNinaTuning',
  'removeNinaSession',
  'renameNinaAvatarFolder',
  'renameNinaFolderSubtree',
  'renameNinaSession',
  'resolveNinaPhotoReference',
  'setCurrentNinaAvatar',
  'setNinaAvatarDescription',
  'setNinaMessageImageDescription',
  'setNinaSessionPinned',
  'setNinaSessionTitleIfUntitled',
  'updateNinaAvatarCrop',
  'updateNinaChatPhotoBlob',
  'updateNinaChatPhotoDescription',
  'updateNinaMemoryFact',
  'updateNinaMessage',
  'updateNinaShortcut',
  'upsertNinaMemorySlot',
  'upsertNinaNag',
  'writeNinaImagePrefs',
  'writeNinaTuning',
]

describe('lib/nina/queries barrel contract', () => {
  it('exposes exactly the frozen public surface — nothing more, nothing less', () => {
    expect(Object.keys(barrel).sort()).toEqual(BARREL_VALUE_EXPORTS)
  })

  it('exposes nothing at runtime except functions (the §1 shapes are types only)', () => {
    for (const name of Object.keys(barrel).sort()) {
      expect(typeof (barrel as unknown as Record<string, unknown>)[name]).toBe('function')
    }
  })
})
```

Runtime notes: importing the real barrel constructs the Neon client against the dummy
`DATABASE_URL` that `tests/support/setup.ts` seeds before test modules load — no network,
which is exactly what that setup file says it is for. The test runs in vitest's default
`node` environment; `@/` resolves via the alias in `vitest.config.ts`; `lib/**/*.test.ts` is
already in the include list.

### Step 8: Scoped gates

```bash
npx vitest run lib/nina components/nina   # existing suites + the new contract test
npm run typecheck                          # next typegen && tsc --noEmit (type surface vs 14 importers)
npx eslint lib/nina                        # no new errors or warnings
npx prettier --check lib/nina/queries.ts lib/nina/queries.test.ts lib/nina/queries/shapes.ts lib/nina/queries/columns.ts
```

If prettier flags anything, fix the formatting by hand to match — never `prettier --write`
over `shapes.ts`/`columns.ts` blindly; the moved bodies are already prettier-clean, so only a
header typo can be at fault. All four commands must be clean before the commit.

### Step 9: Build smoke on the moved tree

```bash
npm run build    # the phase's real gate: Turbopack resolving the new lib/nina/queries/ directory
```

Step 2 proved the toolchain; this proves the new directory. Compare against Step 2: same
route count, no new warnings about module resolution.

### Step 10: Commit — one commit, four files

```bash
git status --porcelain                 # expect ONLY: M lib/nina/queries.ts, ?? the three new files
                                       # (node_modules is gitignored; plan .md files are not in this pathspec)
git add lib/nina/queries.ts lib/nina/queries.test.ts lib/nina/queries/shapes.ts lib/nina/queries/columns.ts
git commit -m "refactor(nina): move §1 Shapes + §2 Column lists into lib/nina/queries/{shapes,columns}.ts behind the barrel" -m "queries.ts keeps §3+ and the layer-invariant header; it gains export * from './queries/shapes' and a local import of the four column lists (imported, never re-exported). The four lists become module exports of columns.ts, marked internal — shared with sibling query modules. Adds lib/nina/queries.test.ts, freezing the barrel's 83-name runtime export surface (derived by AST walk pre-move). No behavior change: moved bytes verified identical by diff; §3–§12 byte-identical at their new offsets. node_modules in this worktree re-installed for real so next build gates run under Turbopack." -m "Co-Authored-By: Claude Code <noreply@anthropic.com>"
git show --stat HEAD                   # READ it: exactly 4 files, ~563 deletions + ~660 insertions in queries.ts region terms
```

(Per the shared-worktree rule: add-by-name, commit-by-pathspec, and read the `--stat` — a
directory pathspec here would be wrong anyway since `lib/nina/queries/` is entirely new.)

## Verification

**Build:** `npm run build` — green on the moved tree (Step 9), with Step 2's pre-move run as
the attribution baseline.

**Tests:** `npx vitest run lib/nina components/nina` — all pre-existing suites green plus the
new contract test's two assertions.

**Type/lint:** `npm run typecheck` (includes `next typegen`) and `npx eslint lib/nina` —
clean; prettier check on the four touched files — clean.

**Manual check (byte identity, the phase's R11 proof):**
```bash
diff /tmp/p1-section1.txt <(tail -n +29 lib/nina/queries/shapes.ts)
diff /tmp/p1-section2-banner.txt <(sed -n '17,23p' lib/nina/queries/columns.ts)
diff <(sed 's/^const /export const /' /tmp/p1-section2-lists.txt) \
     <(sed -n '25,91p' lib/nina/queries/columns.ts | grep -v '/\*\* Internal')
diff /tmp/p1-rest.txt <(sed -n '164,4052p' lib/nina/queries.ts)
sed -n '148,163p' lib/nina/queries.ts    # eyeball: the barrel block sits between header and §3 banner
```
All four diffs exit empty.

**Exit criteria:** every command above green on a tree whose only diff is the four source
files; `lib/nina/queries.test.ts` proves `import * as barrel from '@/lib/nina/queries'`
exposes exactly the same 83 runtime names as before the phase; `npm run build` passes under
Turbopack with the new `lib/nina/queries/` directory present, from a real (non-symlink)
`node_modules`.

## Handoffs

- **Phase 2 (sessions):** append `export * from './queries/sessions'` inside the barrel block
  (`queries.ts:148–163`), and add the fixup import(s) the remaining §3+ code needs (at
  minimum `import { getNinaSession } from './queries/sessions'`) in the import block's
  relative-import group, after this phase's two back-import lines. Prune the shapes
  back-import to drop `NinaIdentity`, `NinaSessionRow`, `NinaSessionListRow` and the columns
  back-import to drop `sessionColumns`. Moves old §3/§4a; the §4b+ region shifts again —
  recompute offsets from the live file.
- **Phase 4 (images):** when `isOriginalPhoto` and `generatedChatPhotoScope` become module
  exports, they surface through `export *` and grow the frozen list by exactly those two
  names — update `BARREL_VALUE_EXPORTS` (sorted) in the same commit, citing plan-index
  Decision 3 (the test's header already names this). Also owns the two script comment
  pointer fixes.
- **Phase 8 (sweep):** two prose §-refs ride inside `shapes.ts` byte-identically per this
  phase's scope and are this phase's known residue: the §1 banner line itself (now the
  module's own banner — consider whether the split makes it redundant) and ruling A1's
  "`messageColumns` (§2)" mention (`old queries.ts:140`, now `shapes.ts:38` area). Repoint
  live prose only, never reword the argument (R6/R7).
- **Reconciler:** plan-index Decision 3 currently reads as if the four column lists also
  "surface through the barrel's `export *`". This phase's scope (binding) says the opposite:
  they are imported by the barrel, never re-exported, and the contract test enforces that.
  Align Decision 3's wording to "exported from their owning module for sibling import;
  `columns.ts` members stay off the barrel; `isOriginalPhoto`/`generatedChatPhotoScope`
  (phase 4) do surface and grow the frozen list by two".

## Assumptions

- Phases 2–7 append their barrel lines to the block this phase establishes, keeping
  `queries.ts`'s split-related statements in one contiguous region; the header comment
  (R3) stays above it untouched until Phase 8 adds the module map.
- The scope's "~86 names" is exactly 83 value exports at `2c823eb` (83 + 30 type exports =
  the analysis's 113). The test freezes 83; the plan's Step 0 script re-derives it so drift
  cannot be typed in by hand.
- `npm ci` has network access in this worktree; if it does not, Step 1 fails loudly and the
  phase stops before any edit (the symlink is only removed after confirming it is one).
- `npm run build` is green on the untouched tree in this environment (it is on the main
  checkout; Step 2 verifies rather than assumes).

## Rollback

`git revert <phase-commit>` — the phase is exactly one commit whose diff is the move plus the
barrel edit plus the new test, so the revert restores `queries.ts` to 4573 lines and deletes
the three new files with no orphaned state. `node_modules` needs no rollback (gitignored;
leaving the real install is strictly an improvement for later phases). If the phase never
committed: `rm -rf lib/nina/queries lib/nina/queries.test.ts && git checkout -- lib/nina/queries.ts`
(then re-check `git status --porcelain`).
