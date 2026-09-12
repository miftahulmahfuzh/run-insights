# Token-Maxxing Session — 2026-09-12: Admin Filetree Split

## 🎯 Achievement / End Result
- **Goal of the burn:** A WORKER session (slug `admin-filetree-split`) pre-assigned one idea by
  the coordinator (`tokenmax-orch-2026-09-12`, spawned via `/token-maxxing` Coordinator Mode —
  no idea menu was generated for this session; the idea was assigned centrally): **split
  `lib/admin/filetree.ts` (1,151 lines) into cohesive modules behind a re-export barrel**. The
  coordinator's Why: it was the second-largest untouched admin file, and the work is **disjoint
  from the sibling `ninaAlbumActions` split** (a peer worker splitting `ninaAlbumActions.ts` in
  another worktree — filetree imports ninaAlbumActions' sibling module, but the two diffs share
  no files, so both can run and land in parallel without a merge conflict between them).
- **Concrete changes:** 2 commits. `51aa457` — the split itself: `lib/admin/filetree.ts` becomes
  a 138-line explicit re-export barrel over **7 cohesive modules** under `lib/admin/filetree/`
  (bounds, classify, pathGrammar, sourceKey, uploadPlan, folderTree, mediaView — 1,234 lines
  across the seven), plus a new `tests/admin.filetreeBarrel.test.ts` (163 lines) that pins the
  public surface and enforces the directory's import purity. `720c640` — the surgical
  `lib/admin/.workflows/package_readme.md` update (section retitled, the zero-import invariant
  restated as the enforced import-purity rule, the zero-import precedent claim corrected).
  Net: +1,534/−1,134 across 10 files. **Every importer of `@/lib/admin/filetree` is untouched —
  zero importer files changed.**
- **Real value delivered:**
  - **The import path survived, by design, with proof.** `@/lib/admin/filetree` resolves to the
    barrel exactly as it always did; the ~20 importer files and the in-code comments naming
    `lib/admin/filetree.ts` stay valid without a single edit riding this refactor. The
    file-over-directory resolution claim was not assumed — `next build` (Turbopack) passing on
    the split tree is the empirical proof the bundler resolves the barrel and only the barrel.
  - **A compatibility contract the next editor cannot silently break.** The new barrel test
    pins (a) the exact runtime surface — **35 exports: 13 constants + 22 functions, written out
    as a full sorted key list** so a surface change IS a test diff — plus the 7 type names via
    `expectTypeOf` (which compiles away at runtime but fails `tsc` if a re-export goes
    missing), and (b) the purity rule — every module file may import only `./` siblings; the
    barrel only `./filetree/`. The pin was **mutation-proven to bite** before it was trusted:
    temporarily dropping one export from the barrel turned the test red, then the export was
    restored.
  - **The dead-exports audit survived the split exactly.** The 2026-09-11 dead-exports session
    un-exported 12 zero-caller types from this very module; a lazy barrel that re-exported
    `*` from every child would have resurrected module-internal helpers
    (`sanitiseSegment`, `compareFolded`, `FolderPathRejection`, `FileRejection`) through the
    back door. The barrel is an explicit re-export shell instead, and knip confirms it: **zero
    filetree findings** on the split tree (knip's listed findings all pre-exist on untouched
    files like `lib/metrics` and `components/admin/explorer`).
  - **TDD that earned its keep: two real bugs caught mid-split by the tests.** The purity/
    runtime tests failed first and drove the split; along the way they caught (1)
    `sanitiseSegment` imported by `uploadPlan.ts` but not exported from `pathGrammar.ts` —
    which vitest/esbuild does NOT typecheck, so the missing export arrived as `undefined` at
    runtime ("sanitiseSegment is not a function"), and (2) `isFolderAncestorOf` missing from
    `uploadPlan.ts`'s import list — a plain ReferenceError that `tsc` enumerated authoritatively
    once the first fix surfaced the next one. Both are exactly the failure class a "just move
    the code" refactor silently ships.
  - **The zero-import invariant became a measurable rule instead of a memory.** The old file's
    "no imports at all" header (its readers are a `'use client'` explorer, `'use server'`
    actions, and a Route Handler) cannot survive a seven-file split verbatim, so it was
    restated as the per-file rule the test enforces against the directory **as it is** — an
    eighth module added tomorrow inherits the rule automatically, with no hand-maintained list.
- **Branch:** `token-maxxing-2026-09-12-admin-filetree-split`
- **Merge status:** on branch — **NOT merged**; the coordinator owns all merges and will land
  this worker branch (alongside the sibling ninaAlbumActions worker's branch, whose diff shares
  no files with this one).
- **Approx token burn:** high (est. ~0.6M, input-dominated) — the burn went into writing the
  surface pin against the UNCHANGED single file first, the mutation proof, the split itself,
  and the full gate battery including a real `npm install` + `next build` (Turbopack) that a
  symlinked node_modules could not run. 🔥

## Context & Motivation
The 2026-09-12 token-maxxing day ran as an orchestrated fan-out: a coordinator session
(`tokenmax-orch-2026-09-12`) spawning worker sessions on per-session branches in per-session
worktrees, each handed a pre-assigned idea with its Why. This worker's assignment was a
structural refactor rather than a deletion sweep: `lib/admin/filetree.ts` was, at 1,151 lines,
the second-largest untouched admin file — a single pure module holding the file manager's
decisions (path grammar, folder limits, classification, dedupe keys, upload planning, tree
building, the media view) that had accreted across the explorer's phases.

The coordinator's disjointness argument is what made the assignment parallelizable, and it is
worth recording because it shaped the design: a sibling worker was splitting
`ninaAlbumActions.ts` in another worktree at the same time. `filetree.ts` imports
ninaAlbumActions' sibling module, so the two refactors touch adjacent graph nodes — but the two
DIFFS share no files, which means the coordinator can union-merge both branches with no
conflict between them, provided this worker changes nothing outside its own file boundary. That
constraint is the direct reason the barrel is a real file at the old path rather than a
`filetree/index.ts` (see Decisions): turning the path itself into a directory would have made
the two diffs collide through the module graph's file layout, and would have invalidated every
in-code comment naming `lib/admin/filetree.ts`.

The safety precondition was already in place: the module's consumers were tested the day before
(`2026-09-11-admin-file-explorer-tests.md`, `2026-09-11-admin-explorer-upload-tests.md`), and
the module's own surface had been audited by `2026-09-11-lib-admin-dead-exports.md`, which
un-exported 12 zero-caller types and left the surviving surface on the record. A split that
accidentally widened that surface would have undone a landed session's work — so the surface
pin is not bureaucratic, it is the guard against this refactor's most likely silent failure.

## What We Did (blow-by-blow)
1. **Wrote the test FIRST, against the unchanged single file (TDD).** Before touching
   `lib/admin/filetree.ts`, the new `tests/admin.filetreeBarrel.test.ts` was written and made
   green against the file as it stood:
   - **The surface pin:** `Object.keys(import * as filetree).sort()` must equal the exact
     35-name list — 13 constants + 22 functions — spelled out in full, plus the 7 type names
     (`ExplorerView`, `FolderCount`, `FolderNode`, `LocalFileLike`, `ManifestEntryLike`,
     `PlannedUpload`, `UploadRefusal`) asserted with `expectTypeOf` on structurally meaningful
     sub-fields, since types cannot appear in `Object.keys` and compile away at runtime (a
     missing type re-export then fails `tsc`, not vitest — which is why BOTH gates matter).
   - **The mutation proof:** a characterization test proves nothing the day it is written, so
     the pin was proven to bite — one export was temporarily renamed/dropped from the module,
     the test went red, and the export was restored. Only then was the pin trusted to guard
     the split.
2. **Added the purity rule test, and let it fail first.** The test asserts
   `lib/admin/filetree/` exists, and its first failure was literally "lib/admin/filetree/ has
   not been created yet" — the failing test IS the work order. The rule: every file in the
   module directory may import only `./` siblings (regex anchored to line start so prose in
   doc comments cannot impersonate an import — the same trap the openrouter-guard history
   records — and the `export … from` arm requires a `from` clause so `export const X = '…'`
   doesn't read as re-exporting `'…'`, which the first regex draft actually did), and the
   barrel may re-export only from `./filetree/`.
3. **Executed the split into 7 cohesive modules under `lib/admin/filetree/`:**
   - `bounds.ts` (93 lines) — the limits and names; imports nothing.
   - `classify.ts` (190) — "only upload image files": the MIME/extension verdict.
   - `pathGrammar.ts` (308) — normalise, validate, fold, split, join, ancestors, breadcrumbs,
     plus the shared helpers `sanitiseSegment` and `compareFolded`.
   - `sourceKey.ts` (61) — the stored dedupe key.
   - `uploadPlan.ts` (299) — `planFolderUpload`, the four-bucket diff of a walked folder.
   - `folderTree.ts` (187) — `buildTree` and the nested folder model.
   - `mediaView.ts` (96) — the `?view=media` virtual collection; imports nothing.
4. **Kept `filetree.ts` as a real file — the barrel — instead of deleting it for
   `filetree/index.ts`** (see Decisions for the full argument), as an explicit re-export shell
   with the module map written into its header docstring, and the module-internal helpers
   (`sanitiseSegment`, `compareFolded`, `FolderPathRejection`, `FileRejection`) exported
   sibling-only from their modules and NEVER through the barrel.
5. **Caught and fixed the two real bugs the tests exposed mid-split:**
   - `sanitiseSegment` was imported by `uploadPlan.ts` but not exported from `pathGrammar.ts`.
     The failure was a runtime "sanitiseSegment is not a function", not a compile error —
     vitest's esbuild transform does not typecheck, so the missing export arrived as
     `undefined`. This is the sharpest lesson of the session: the green-sweep habit cannot
     catch a missing export; only the type gate or a test exercising the path can.
   - `isFolderAncestorOf` was missing from `uploadPlan.ts`'s import list — a plain
     ReferenceError this time. Fixing the first bug only surfaced the second; `tsc` then
     enumerated the complete import list authoritatively and the module compiled clean.
6. **Ran the full gate battery on the committed tree, all green:** full vitest sweep
   **293 files / 5,390 tests**; `next typegen` + `npx tsc --noEmit` exit 0; eslint clean on the
   touched paths; **knip: zero filetree findings** (its listed findings all pre-exist on
   untouched files — `lib/metrics`, `components/admin/explorer` — verified as pre-existing);
   prettier clean; and `next build` (Turbopack) **passed** — which required first replacing the
   worktree's node_modules SYMLINK with a real `npm install` (Turbopack rejects symlinked
   node_modules, the known fresh-worktree trap). The passing build is the empirical proof of
   the file-over-directory resolution claim: the bundler resolves `@/lib/admin/filetree` to the
   barrel and every consumer compiles against it.
7. **Updated `lib/admin/.workflows/package_readme.md` surgically** (commit `720c640`, +28/−12):
   the filetree section retitled, the zero-import invariant restated as the per-file
   import-purity rule the barrel test now enforces, and the zero-import precedent claim
   corrected (`errorLogModel` remains the import-nothing case; `filetree/` is now the
   sibling-only case). Deliberately tight edits: the sibling ninaAlbumActions worker edits
   OTHER sections of the same readme, and the coordinator union-merges — the smaller this
   diff, the cleaner that merge. Claims that remain true through the barrel (schema.ts's
   imported bounds, the import census row `filetree | 17`) were left alone.
8. **Committed both pieces on the worker branch and stopped** — no merge, no push; the
   coordinator lands worker branches.

## Code / Design Details

**The module map, as written into the barrel's own header** (`lib/admin/filetree.ts`) — the
barrel's docstring is the directory's README, so no separate doc was needed:

```
 * | file              | what it owns                                                            |
 * | ----------------- | ----------------------------------------------------------------------- |
 * | `bounds.ts`       | the limits and names; imports nothing                                    |
 * | `classify.ts`     | "only upload image files" — the MIME/extension verdict                   |
 * | `pathGrammar.ts`  | normalise, validate, fold, split, join, ancestors, breadcrumbs           |
 * | `sourceKey.ts`    | the stored dedupe key                                                    |
 * | `uploadPlan.ts`   | `planFolderUpload` — the four-bucket diff of a walked folder             |
 * | `folderTree.ts`   | `buildTree` and the nested folder model                                  |
 * | `mediaView.ts`    | the `?view=media` virtual collection; imports nothing                    |
```

**The surface pin, in its essential shape** (`tests/admin.filetreeBarrel.test.ts`) — the full
35-name list is spelled out in the test (13 constants from `NINA_FILENAME_MAX_CHARS` through
`NINA_SOURCE_KEY_VERSION`, 22 functions from `buildTree` through `validateFolderPath`) so a
surface change is a diff to this list, not something a wildcard hides:

```ts
it('re-exports exactly the historical runtime surface', () => {
  expect(Object.keys(filetree).sort()).toEqual([...EXPECTED_RUNTIME_EXPORTS].sort())
})
```

**The purity rule, enforced against the directory as it is** — the regex extracts every static
import/export-`from` specifier from every module file and demands `./`-siblings; the barrel
gets the mirror-image check (`./filetree/` only). Because it reads the directory with
`readdirSync`, an eighth module added later is covered with zero test edits:

```ts
it('keeps the split modules import-pure — `./` siblings only', () => {
  expect(existsSync(MODULE_DIR), 'lib/admin/filetree/ has not been created yet').toBe(true)
  const modules = readdirSync(MODULE_DIR).filter((f) => f.endsWith('.ts'))
  for (const file of modules) {
    for (const spec of importSpecifiers(`${MODULE_DIR}/${file}`)) {
      expect(/^\.\/[A-Za-z0-9]/.test(spec),
        `${file} imports '${spec}' — module files may import only ./siblings`).toBe(true)
    }
  }
})
```

**The line-count ledger** (from the commit stat): the 1,151-line single file became a 138-line
barrel + 1,234 lines across the seven modules (1,372 total, +221 — the growth is the barrel's
re-export shell and the header/module docstrings, not duplicated logic), plus the 163-line
contract test. Importer files changed: **zero**.

**The two-bugs-in-one-fix sequence, and what each failure mode taught:**

| Bug | Symptom | Class of failure |
|-----|---------|------------------|
| `sanitiseSegment` not exported from `pathGrammar.ts` | "sanitiseSegment is not a function" at runtime in vitest | vitest/esbuild does NOT typecheck — a missing export is `undefined`, not an error |
| `isFolderAncestorOf` missing from `uploadPlan.ts` imports | plain `ReferenceError` | the visible, familiar one — and it only surfaced AFTER the first fix |

`tsc --noEmit` then enumerated the import list authoritatively. The standing lesson: a green
vitest sweep proves nothing about missing exports; the type gate and the runtime gate catch
DISJOINT halves of the same mistake class, which is why both ran.

## Decisions & Trade-offs
- **Barrel-as-file over `filetree/index.ts` — the session's defining call.** TypeScript and
  every bundler this repo uses resolve `@/lib/admin/filetree` to `filetree.ts` BEFORE
  `filetree/index.ts`, so the file and directory sharing a name makes the specifier
  unambiguous. Three consequences, all verified: the ~20 importer files compile untouched; the
  in-code comments naming `lib/admin/filetree.ts` stay TRUE without a repo-wide comment sweep
  riding a refactor that is about module boundaries; and the diff stays disjoint from the
  sibling worker's, preserving the coordinator's parallel-merge plan. Cost: a file and a
  directory with the same basename, which looks like an accident until the header explains it
  isn't. The header says exactly that — "Deliberate, and not an accident to clean up."
- **Explicit re-export shell over `export *`.** A lazy barrel would have re-exported every
  module's internal helpers — `sanitiseSegment`, `compareFolded`, `FolderPathRejection`,
  `FileRejection` — and undone the 2026-09-11 dead-exports audit through the back door, plus
  widened the public surface against the pin. The explicit shell keeps the public surface
  byte-identical to the single file's, and the pin test makes any future drift a red test.
- **The zero-import invariant restated rather than abandoned.** The single file's "no imports
  at all" rule is unsatisfiable across seven files that need each other; the honest restatement
  is the strongest rule the split can actually check: `./`-siblings only inside the directory,
  `./filetree/` only in the barrel — no package specifiers, no `../` reaches (which would also
  let a module import the barrel and close a cycle), no server-only or client-only modules
  dragged in either direction. Restated in the barrel's header with the original rationale
  (readers span `'use client'` and `'use server'`) intact.
- **A vitest test, not a lint rule, for the purity check.** `npm test` is the gate the repo
  already runs everywhere, the node environment gives the check the fs access it needs, and the
  rule governs one directory rather than a codebase-wide convention — a custom eslint rule
  would be infrastructure for a single-site constraint.
- **Tests first, mutation-proven.** Writing the pin against the unchanged file and proving it
  red-then-green is the only way a compatibility pin earns trust; a pin that has never failed
  is indistinguishable from a pin that cannot fail. The failing purity test ("has not been
  created yet") then served as the split's own work order — the refactor was literally driven
  to green.
- **Surgical readme edits, sized for the coordinator's union-merge.** The sibling worker edits
  other sections of the same `lib/admin` package_readme; every claim this session could leave
  alone (the census row, the schema.ts bounds mention), it left alone. The +28/−12 diff is the
  minimum that keeps the readme truthful about the new shape.
- **`next build` run despite the symlink cost.** The test suite + tsc prove the TypeScript
  graph; only the bundler proves the RESOLUTION claim (file beats directory in Turbopack's
  actual algorithm), which is the split's central assumption. That made the real `npm install`
  worth its wall-clock.

## Follow-ups & YAGNI notes
- **The ~17 in-code comments across the repo naming `lib/admin/filetree.ts` were deliberately
  NOT swept** — they all remain true through the barrel, and a comment sweep riding this
  refactor would have bloated the diff and collided with the sibling worker's disjointness
  guarantee. If anyone ever wants finer granularity, the most load-bearing ones
  (`lib/admin/schema.ts`, `lib/db/schema.ts`) could be repointed at the specific module that
  now owns what they cite (e.g. `pathGrammar` for grammar comments).
- **The package_readme's import census row (`filetree | 17`) is still accurate** — the barrel
  path is unchanged so the importer count is unchanged — but a future audit could add
  per-module counts now that the surface is seven files.
- **This worktree's `next build` now runs on a real node_modules install** (the symlink was
  replaced). Future workers in FRESH worktrees still need the same treatment before any
  Turbopack build — the known trap, still armed for the next session.
- **Deliberately NOT done, on YAGNI grounds:** no importer was migrated to deep-import a
  specific module (the barrel is the only sanctioned entry point — that is what makes the
  surface pin meaningful); no module was further subdivided; no `index.ts` was added inside the
  directory (the barrel already owns that role from beside it); no comment sweep; no readme
  sections beyond the filetree one were touched.

## Appendix

**Commits** (both on `token-maxxing-2026-09-12-admin-filetree-split`, unmerged):

```
51aa457  refactor(admin): split lib/admin/filetree.ts into 7 cohesive modules behind a re-export barrel
         lib/admin/filetree.ts             | 1231 ++++------  (1,151 lines → 138-line barrel)
         lib/admin/filetree/bounds.ts      |   93 +++
         lib/admin/filetree/classify.ts    |  190 +++
         lib/admin/filetree/folderTree.ts  |  187 +++
         lib/admin/filetree/mediaView.ts   |   96 +++
         lib/admin/filetree/pathGrammar.ts |  308 +++
         lib/admin/filetree/sourceKey.ts   |   61 +++
         lib/admin/filetree/uploadPlan.ts  |  299 +++
         tests/admin.filetreeBarrel.test.ts|  163 +++
         9 files changed, 1506 insertions(+), 1122 deletions(-)

720c640  docs(admin): package_readme for the filetree split — barrel + module directory
         lib/admin/.workflows/package_readme.md | 40 ++++++++-------  (+28/−12)
```

**Gates, all green on the committed tree:** full vitest sweep 293 files / 5,390 tests;
`next typegen` + `npx tsc --noEmit` exit 0; eslint clean on touched paths; knip zero filetree
findings (listed findings verified pre-existing on untouched files: `lib/metrics`,
`components/admin/explorer`); prettier clean; `next build` (Turbopack) passed after replacing
the worktree's node_modules symlink with a real `npm install`.

**The mutation proof, restated for the record:** the surface pin was written against the
UNCHANGED single file, then one export was temporarily renamed — the pin went red — then the
export was restored. The purity test's first failure ("lib/admin/filetree/ has not been
created yet") predates the directory, by design.

**Session identity:** worker session `admin-filetree-split`, spawned by coordinator
`tokenmax-orch-2026-09-12` (Coordinator Mode) on 2026-09-12; branch
`token-maxxing-2026-09-12-admin-filetree-split`; worktree
`~/.worktrees/run-insights/tokenmax-2026-09-12-admin-filetree-split`; commits `51aa457`,
`720c640`; NOT merged — the coordinator owns all merges.

**Related sessions:** `2026-09-11-lib-admin-dead-exports.md` (the audit whose surface this
split had to preserve exactly — the pin exists because of it);
`2026-09-12-pkg-readme-lib-admin.md` (the lib/admin readme compacted earlier the same day,
updated here surgically under a sibling-worker constraint);
`2026-09-11-admin-file-explorer-tests.md` and `2026-09-11-admin-explorer-upload-tests.md`
(the consumer coverage that made the split safe); `2026-09-12-dead-export-tooling.md` (knip,
used as the split's surface-widening gate); and the sibling ninaAlbumActions split worker
(concurrent, disjoint diff — the coordinator union-merges both).
