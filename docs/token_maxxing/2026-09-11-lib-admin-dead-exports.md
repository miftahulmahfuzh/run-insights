# Token-Maxxing Session — 2026-09-11: Lib Admin Dead-Exports Audit

## 🎯 Achievement / End Result
- **Goal of the burn:** A genuine unused-export audit of the two largest files in
  `lib/admin/` — `lib/admin/filetree.ts` (1,151 lines) and `lib/admin/ninaAlbumActions.ts`
  (1,224 lines) — two additively-grown files that had never had a dead-code pass. Dead-code
  removal only, explicitly not a refactor: no restructuring, no file splits, no renames of
  anything still in use. Assigned as a `--worker` idea (in place of a generated menu) by the
  day's parallel-session coordinator `tokenmax-orch-2026-09-11`, whose scope line was
  "strictly these two files plus their tests". The timing was deliberate: `lib/admin` had
  just received strong test coverage from the same day's earlier sessions
  (`admin-file-explorer-tests`, `admin-folder-actions-tests`, `lib-admin-action-tests`,
  `admin-explorer-upload-tests`), making an export-surface shrink safe to attempt now.
- **Concrete changes:** Two commits, 15 changed lines total, every one of them the single
  word `export` being dropped:
  - `6d9d6f8` — `filetree.ts` unexports 12 zero-caller type exports: `NinaImageExt`,
    `NinaImageContentType`, `FileRejection`, `FileVerdict`, `FolderPathRejection`,
    `FolderPathResult`, `FolderCrumb`, `ExistingReason`, `SkippedFile`, `FolderUploadPlan`,
    `FolderRowLike`, `MediaViewNode` (12 insertions, 12 deletions).
  - `422daa5` — `ninaAlbumActions.ts` unexports 3 zero-caller result interfaces:
    `AdminManifestEntry`, `AdminBatchRegisterResult`, `AdminManifestResult`
    (3 insertions, 3 deletions).
  - No signature, body, or name touched anywhere. Net effect on the exported API surface:
    74 exports → 59 across the two files.
- **Real value delivered:**
  - The honest headline, which is itself the deliverable: **all 15 Server Actions, all 20
    `filetree.ts` functions, and all 13 constants have live callers.** `lib/admin`'s dead
    surface turned out to be entirely type-only — 15 type exports named by zero importers
    anywhere in the repo, whose only external occurrences were prose mentions inside
    comments (`UploadQueue.tsx:51` `FolderPathRejection`, `FileExplorer.tsx:302`
    `FolderCrumb`, `FolderTree.tsx:170` `MediaViewNode`, `useFolderUpload.ts:297`
    `AdminManifestEntry`). A name-grep audit would have called those comments "callers"
    and concluded there was nothing to remove; a lazier audit might have deleted the
    functions the comments sat next to.
  - Those 15 types are now module-private implementation shapes. Because TypeScript types
    erase at compile time, callers are unaffected — they consume the shapes structurally
    off the actions' and helpers' return types — and `ninaAlbumActions.ts`'s `'use server'`
    async-only-export rule is untouched (the rule constrains runtime exports; interface
    exports were already invisible to it).
  - The audit produced a repo-wide import census of both modules (every import site, every
    named symbol) that documents exactly which exports are load-bearing and *why* the
    survivors survive — including the test-only-but-live ones — which is the evidence base
    any future dead-code or API-surface pass over these files starts from.
  - A pre-existing, load-dependent test flake in `MemoryTable.test.tsx` was caught,
    isolated, and characterized (see Gates) so the next person doesn't re-debug it from
    scratch or, worse, blame a future diff for it.
- **Branch:** `token-maxxing-2026-09-11-lib-admin-dead-exports` (worktree session;
  session name `tokenmax-lib-admin-dead-exports`)
- **Merge status:** on branch — **NOT merged, deliberately**. The coordinator
  `tokenmax-orch-2026-09-11` owns merging all of the day's worker branches; this session
  must not merge its own work (see Decisions).
- **Approx token burn:** heavy audit phase over a tiny diff — the defining shape of this
  session. 74 exports enumerated and individually traced, ~20 import sites extracted
  symbol-by-symbol, repo-wide word-boundary greps with manual code-vs-prose
  classification of every hit, then full gate runs (typegen + tsc + eslint + 1,128
  tests) — all to justify a 15-line, keyword-only diff. That asymmetry is the point of
  the exercise: the tokens bought certainty, not line count. 🔥🔥

## Context & Motivation
`lib/admin/` is the admin half of the app's server logic, and its two biggest files grew
the way big files in a fast-moving repo grow: additively. `filetree.ts` (1,151 lines —
folder tree building, breadcrumb math, folder-upload planning, manifest validation) and
`ninaAlbumActions.ts` (1,224 lines — the `'use server'` module behind nearly every admin
mutation) had each accumulated an export surface nobody had ever audited. In a repo whose
docstrings reference function names in prose, "exported but never named anywhere" is a
real and reachable condition — but so is "named only in a comment," which is the trap.

The idea arrived pre-chosen: this was a `--worker` invocation under coordinator
`tokenmax-orch-2026-09-11`, so instead of generating and scoring a menu of ideas, the
session received one assigned idea verbatim, with its scope fixed ("strictly these two
files plus their tests") and its risk profile already reasoned about — the same day's
earlier sessions had just given `lib/admin` the strongest test coverage it has ever had
(51 files / 1,128 tests across `tests/admin.*` and `components/admin` alone), which is
what makes an export-surface change safely verifiable.

One prior session's lesson shaped the method directly: the
`admin-photoreference-false-positive-fix` session earlier on 2026-09-11 had been entirely
about a *string-matching false positive* — assertions that match text without matching
meaning. The audit refused to recreate that failure in reverse (a census that matches
names without matching imports). Hence the method below.

## What We Did (blow-by-blow)
1. **Enumerated the full export surface of both files, by kind.**
   `filetree.ts`: 54 exports — 13 constants, 21 types, 20 functions.
   `ninaAlbumActions.ts`: 20 exports — 4 interfaces and 16 async-function exports, 15 of
   which are actual Server Actions (the first count said 16 actions; re-inspection against
   the `'use server'` contract corrected it to 15).
2. **Extracted the exact symbol list from every import site of both modules, repo-wide —
   rather than grepping for names.** This is the load-bearing step. Name-greps cannot
   distinguish an import from a prose mention in this repo, and the docstrings reference
   function names in prose constantly (the exact mechanism behind the day's earlier
   `photoReference` false positive). The importer census found:
   - `app/admin/nina/page.tsx`
   - `components/admin/FileExplorer.tsx`, `FolderMenu.tsx`, `PhotoMoveBar.tsx`,
     `ShareToNinaItem.tsx`
   - `components/admin/explorer/SelectionPane.tsx`, `FolderTree.tsx`, `model.ts`,
     `dropWalk.ts`, `UploadQueue.tsx`, `useFolderUpload.ts`, `PhotoGrid.tsx`
   - `lib/admin/schema.ts`, `lib/admin/folderOps.ts`, and `ninaAlbumActions.ts` itself
     importing from `filetree.ts`
   - 5 admin test files under `tests/`
   - 6 component test files with `vi.mock` factories (a mock factory's export list is a
     real dependency — the factory must name every export the component imports)
   - 3 namespace-import test files (`import * as …`)
   Every symbol named in any of those import statements was marked live, with the
   importing file recorded against it.
3. **For every export absent from that set:** a repo-wide word-boundary grep — including
   non-TypeScript files (`.md`, package readmes, docs) — and then a **manual
   classification of each hit as code or prose.** This is where the 15 dead types were
   separated from their comment ghosts: `FolderPathRejection` at `UploadQueue.tsx:51`,
   `FolderCrumb` at `FileExplorer.tsx:302`, `MediaViewNode` at `FolderTree.tsx:170`, and
   `AdminManifestEntry` at `useFolderUpload.ts:297` all matched greps but are sentences in
   comments, not imports or type positions.
4. **Applied the audit's caller rule without exceptions: tests count as callers.** Several
   exports are live only because `tests/admin.filetree.test.ts` imports them —
   `folderCounts`, `findFolderNode`, `fileExtension`, `NINA_SOURCE_KEY_VERSION`, and
   others. All were kept. A test-only export is a defensible API contract; an
   unimportable-by-anyone export is not.
5. **Unexported the 15 confirmed-dead types in two commits**, one per file, changing
   nothing but the `export` keyword:
   - `6d9d6f8` — 12 types in `filetree.ts`. All 12 remain in the file and remain used
     *internally* (`classifyFile`, `validateFolderPath`, `planFolderUpload`,
     `folderBreadcrumbs`, `folderCounts`, `buildTree`, and `mediaViewNode` all reference
     them; callers consume those shapes structurally through the functions' return types).
   - `422daa5` — 3 interfaces in `ninaAlbumActions.ts` (`AdminManifestEntry`,
     `AdminBatchRegisterResult`, `AdminManifestResult`). `AdminActionResult` keeps its
     export because `FolderMenu.tsx` and `PhotoMoveBar.tsx` import it by name.
6. **Ran the full gate set.** `next typegen && npx tsc --noEmit` clean; eslint clean on
   both files; vitest over `tests/admin.*` + `components/admin`: 51 files / 1,128 tests
   green (serially — see the flake note below). The fresh worktree needed `typegen`
   first: the initial `tsc` run's `PageProps`/`LayoutProps` errors were missing generated
   route types, not regressions — the same trap the day's `admin-explorer-upload-tests`
   and land-worktree notes already flagged ("PageProps errors are missing typegen").

## Code / Design Details

**The shape of the diff** — the entire session's code change is 15 instances of this:

```ts
// filetree.ts, before → after (one of 12 in 6d9d6f8)
export type FolderCrumb = { label: string; path: string }
type FolderCrumb = { label: string; path: string }   // internal-only now

// ninaAlbumActions.ts, before → after (one of 3 in 422daa5)
export interface AdminManifestResult { … }
interface AdminManifestResult { … }
```

**Why dropping type exports is invisible to every caller.** TypeScript is structural:
`FileExplorer` never imports `FolderCrumb`; it calls `folderBreadcrumbs(...)` and uses
whatever comes back. Removing the type's *export* changes no emitted JavaScript, no
module graph edge, and no callable signature — it only stops other modules from *naming*
the type. That is also why the `'use server'` constraint in `ninaAlbumActions.ts` is
unaffected: Next's rule is that every *runtime* export of a `'use server'` module must be
an async function, which the 16 async exports (15 actions + companions) still satisfy;
interface exports were compile-time-only both before and after.

**The census result, summarized:**

| Module | Exports | Live (code callers) | Live (tests only) | Dead (unexported) |
|---|---|---|---|---|
| `filetree.ts` | 54 (13 const / 21 type / 20 fn) | all 13 constants, all 20 functions, 9 types | several types + `folderCounts`, `findFolderNode`, `fileExtension`, `NINA_SOURCE_KEY_VERSION`, … | 12 types |
| `ninaAlbumActions.ts` | 20 (4 interface / 16 async) | all 15 Server Actions + `AdminActionResult` | (action modules covered via `vi.mock` factories and namespace imports) | 3 interfaces |

**The prose-vs-code trap, concretely.** Four of the fifteen "dead" types *did* appear
outside their home file on a naive grep:

- `components/admin/explorer/UploadQueue.tsx:51` — `FolderPathRejection` in a comment
- `components/admin/FileExplorer.tsx:302` — `FolderCrumb` in a comment
- `components/admin/explorer/FolderTree.tsx:170` — `MediaViewNode` in a comment
- `components/admin/explorer/useFolderUpload.ts:297` — `AdminManifestEntry` in a comment

Each was read in context and classified as prose. An audit that stops at the grep keeps
these four types exported forever and reports the file as fully alive; an audit that
stops trusting greps entirely and deletes anything unmatched-by-imports-but-mentioned
somewhere would have started "cleaning up" comments. The classification step is the
audit.

**Import-site extraction vs. name-grep**, in one line each:
- `grep -rn "FolderUploadPlan"` → hits the comment in `useFolderUpload.ts`, the readme,
  and the definition: ambiguous.
- The importer census → no `import { … FolderUploadPlan … }` and no `import type` names it
  anywhere: dead, unexport it.
The `vi.mock` factories matter here too: a factory that names an export in its returned
object is a real dependency even though no production code imports the symbol, because
the component under test does.

## Decisions & Trade-offs
- **Do not merge; the coordinator owns landing.** This was a `--worker` session in a
  parallel set (`tokenmax-orch-2026-09-11` coordinating several worker branches). Merging
  from inside a worker session while siblings run is exactly the concurrent-phase hazard
  the repo has been burned by before (shared index, mid-wave land/verify, double-minted
  plan names). The session's contract is: commit to the worker branch, document, report.
  The coordinator merges.
- **Tests count as callers — kept the test-only exports.** `folderCounts`,
  `findFolderNode`, `fileExtension`, `NINA_SOURCE_KEY_VERSION` and others would die
  without their test importers. Deleting them would mean deleting their tests, which is a
  coverage decision, not a dead-code decision, and out of scope. The audit records them
  as "test-only-but-live" instead of pretending they're production-load-bearing.
- **Dead-code removal only — no drive-by refactors.** Both files have plenty of surface
  that *could* be restructured (1,151 and 1,224 lines each), and the audit surfaced
  adjacent temptations. The assigned scope line was "strictly these two files plus their
  tests," and a 15-line keyword-only diff is the maximally-reviewable expression of that
  scope: the coordinator's merge risk is near zero because the diff cannot change
  behavior by construction.
- **Unexported the types rather than deleting them.** The 15 types are the internal
  vocabulary of the files' own function signatures; deleting them would mean inlining
  structural types into signatures or inventing new names — a refactor. Dropping the
  keyword achieves the actual goal (shrinking the module's public API) with zero
  mechanical risk.
- **Ran the final vitest sweep with `--no-file-parallelism` after characterizing a flake,
  and reported the flake rather than quietly absorbing it.** Two `MemoryTable.test.tsx`
  add-row tests failed once under full parallelism, reproduced on **clean HEAD** (before
  this session's commits: 2 failed | 1,126 passed), passed in isolation on both trees,
  and passed in the full sweep with file parallelism disabled. Zero import relationship
  to either changed file; the machine was simultaneously running the coordinator and
  sibling workers during the reds. Honest reporting beats a green screenshot.

## Follow-ups & YAGNI notes
- **`lib/admin/.workflows/package_readme.md` has stale API lines — one small doc pass
  owed.** It still shows `export interface AdminManifestEntry` (~line 367),
  `AdminBatchRegisterResult` (~368) and `AdminManifestResult` (~372) as exports, and
  `FolderUploadPlan<T>` in a signature block (~170). After this session those three are
  module-private shapes and `FolderUploadPlan` is unexported. The readme was left
  untouched deliberately: the coordinator's scope was "strictly these two files plus
  their tests," and editing the package readme was outside it. This is the session's
  cleanest leftover.
- **If a future phase needs to name one of the 15 unexported types client-side, prefer
  `ReturnType<typeof someAction>` (or `Awaited<ReturnType<…>>` for the async ones) over
  re-exporting.** That keeps the module's public surface at "the actions and helpers,"
  which is the shape this audit just established.
- **`MemoryTable.test.tsx`'s two add-row tests are the suite's known flake under parallel
  load** (`fireEvent` + `waitFor` timing sensitivity, per the day's harness-quirks
  notes). Worth a stabilize pass someday — but as its own scoped session, not a drive-by.
  Until then, a full-suite red in exactly those two tests with an unrelated diff in hand
  should be checked against clean HEAD before being believed.
- **The coordinator's merge should be plain.** The session observed `origin/main` move 3
  commits ahead of this branch's base while it ran; a post-session check confirms neither
  audited file is among anything main has taken since the base (`41b297e`), so there is
  no content overlap for the 15 lines to collide with.
- **YAGNI: did not audit the rest of `lib/admin`** — the same treatment applied to the
  directory's other ~200 modules is an obvious follow-up idea, but it was neither
  assigned nor attempted. The two audited files were chosen because they are the largest;
  diminishing returns are likely below them.
- **YAGNI: did not try to make the audit reusable as a script.** The census was done with
  bespoke greps and manual classification because the hard part (code-vs-prose) is not
  mechanizable cheaply. A semi-automated "export census" script that at least produces
  the export list + import-site map per module would remove the mechanical half of the
  work for the next audit, if one ever runs.

## Appendix

**Commits (this branch, in order):**
```
6d9d6f8 refactor(admin): unexport 12 zero-caller type exports from filetree
422daa5 refactor(admin): unexport 3 zero-caller result interfaces from ninaAlbumActions
```
Branch base: `41b297e` (`docs: record 2026-09-11 token-maxxing session (admin
photoReference false-positive fix)`). Branch is 2 commits ahead of base; `origin/main`
was 3 ahead of the base when last measured mid-session (10 ahead at doc-writing time —
other same-day worker sessions landing — with **no** commit touching either audited
file, verified via `git diff --name-only 41b297e origin/main`).

**Full diff stats:**
```
lib/admin/filetree.ts         | 12 insertions(+), 12 deletions(-)   (6d9d6f8)
lib/admin/ninaAlbumActions.ts |  3 insertions(+),   3 deletions(-)   (422daa5)
2 files changed, 15 insertions(+), 15 deletions(-)
```

**Verification commands run:**
```
npx next typegen                 # fresh worktree: required before tsc (PageProps/LayoutProps)
npx tsc --noEmit                 # clean
eslint lib/admin/filetree.ts lib/admin/ninaAlbumActions.ts   # clean
npx vitest run tests/admin.* components/admin --no-file-parallelism
                                 # 51 files / 1,128 tests green
```
Flake characterization runs: full parallel sweep → 2 failed (`MemoryTable.test.tsx`
add-row ×2) | 1,126 passed; repeated on clean HEAD (pre-`6d9d6f8`) with the same 2
failures; both tests green in isolation on both trees; full sweep green with
`--no-file-parallelism`.

**Audit inputs:**
- `lib/admin/filetree.ts` — 1,151 lines, 54 exports (13 constants, 21 types, 20 functions)
- `lib/admin/ninaAlbumActions.ts` — 1,224 lines, 20 exports (4 interfaces, 16 async
  exports of which 15 are Server Actions)
- Importer set traced: 1 app route, 4 `components/admin/*.tsx`, 7
  `components/admin/explorer/*`, 3 `lib/admin/*.ts`, 5 `tests/admin.*` files,
  6 `vi.mock`-factory component tests, 3 namespace-import test files.

**Unexported symbols (the complete list of 15):**
`filetree.ts`: `NinaImageExt`, `NinaImageContentType`, `FileRejection`, `FileVerdict`,
`FolderPathRejection`, `FolderPathResult`, `FolderCrumb`, `ExistingReason`,
`SkippedFile`, `FolderUploadPlan`, `FolderRowLike`, `MediaViewNode`.
`ninaAlbumActions.ts`: `AdminManifestEntry`, `AdminBatchRegisterResult`,
`AdminManifestResult`.

**Deliberately kept despite test-only callers:** `folderCounts`, `findFolderNode`,
`fileExtension`, `NINA_SOURCE_KEY_VERSION`, and the other exports whose only importers
are `tests/admin.filetree.test.ts` — tests count as callers.

**Related same-day sessions:** coverage that made this safe came from
`2026-09-11-admin-file-explorer-tests.md`, `2026-09-11-admin-folder-actions-tests.md`,
`2026-09-11-lib-admin-action-tests.md`, and `2026-09-11-admin-explorer-upload-tests.md`;
the method's anti-false-positive discipline comes from
`2026-09-11-admin-photoreference-false-positive-fix.md`.
