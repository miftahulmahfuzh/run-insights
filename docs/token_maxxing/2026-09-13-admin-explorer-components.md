# Token-Maxxing Session — 2026-09-13: Admin Explorer Components Deep Read

## 🎯 Achievement / End Result
- **Goal of the burn:** A WORKER session (slug `admin-explorer-components`) in the
  `tokenmax-orch-2026-09-13` fan-out, pre-assigned one idea by the coordinator: deeply read
  four of `components/admin`'s largest files — `FileExplorer.tsx` (652 lines),
  `MemoryTable.tsx` (625 lines), `CharacterPanel.tsx` (620 lines), and `ShortcutTable.tsx`
  (581 lines) — for dead code, doc drift, and test-coverage gaps. Framed as disjoint from the
  same day's `admin-explorer-yagni` worker (which only touched
  `components/admin/explorer/*` upload files and `photoReferenceModel.ts`) and from the
  `admin-imagegen-actions` worker's files.
- **Concrete changes:** 1 commit, 2 files, +91/−3 net lines: `test(admin): close two
  coverage gaps in FileExplorer and CharacterPanel` (`86a714d`) — `FileExplorer.test.tsx`
  (+81/−3) and `CharacterPanel.test.tsx` (+13).
- **Real value delivered:**
  - Read all four files in full plus their four dedicated component test files
    (`FileExplorer.test.tsx`, `MemoryTable.test.tsx`, `CharacterPanel.test.tsx`,
    `ShortcutTable.test.tsx`) — the genuine three-prong deep read the assignment asked for,
    not a re-skim.
  - **Dead code:** verified clean via fresh `npx knip` runs (not merely trusted from the
    2026-09-12 whole-directory optional-prop sweep that already covers these four files) —
    zero flags.
  - **Doc drift:** spot-checked four specific factual claims embedded in the files'
    docstrings (a schema-migration citation, a "successor to a since-deleted component"
    claim, a "no `lib/nina` specifier" claim, and a "retired URL fragment" claim) — all four
    confirmed accurate against the tree. A legitimate negative result, arrived at by real
    verification rather than assumed.
  - **Test-coverage gaps — the session's real find:** two genuine, previously-invisible gaps
    closed.
    - **Gap A:** `FileExplorer.tsx`'s private URL-grammar functions (`hrefForFolder`,
      `hrefForMediaView`, and the `hrefForPage`/`hrefFor`/`mediaHref` closures built from
      them) were completely untested — the test file's mocks of `FolderTree` and
      `PhotoGrid` silently ignored the very props carrying this grammar, despite the file's
      own header calling it out as living "in one place ... so it cannot drift" and a
      separate test (`tests/admin.filetree.test.ts:803`) depending on
      `hrefForMediaView`'s behavior "by construction." A wrong param order, a dropped
      `view=media`, or an off-by-one on page numbers could have shipped invisibly.
    - **Gap B:** `CharacterPanel.tsx`'s "loudest diverging dial" header summary
      (`loudestDials(draft, defaults)`, e.g. "anger 75, flirty 30") had zero coverage of its
      non-trivial branch — every existing test started from `draft === defaults`, exercising
      only the "every dial at its default" empty-list branch.
  - Both closed with targeted new tests (3 for Gap A, 1 for Gap B); full verification held:
    `npx vitest run` on all four component test files 78/78 (up from 71), `npx prettier
    --check` (one formatting fix applied), `npx eslint` clean, `npx tsc --noEmit` clean
    (pre-existing missing-typegen noise only), and the whole-repo gate `npx vitest run` —
    332 test files, 5748 tests, all green, zero flakes.
- **Branch:** `token-maxxing-2026-09-13-admin-explorer-components`
- **Merge status:** UNMERGED — Worker Mode. The coordinator (`tokenmax-orch-2026-09-13`)
  lands this branch; this worker does not merge or push it itself.
- **Approx token burn:** moderate (est. **~0.15M**) — dominated by reading four ~600-line
  files plus their four test files in full and manually cross-referencing every function and
  branch against its dedicated test file to find the two real gaps, rather than by a
  from-scratch AST scan (deliberately not re-run — see Decisions). 🔥

## Context & Motivation
This was one worker in the 2026-09-13 orchestrated fan-out, structurally identical to prior
days': a coordinator session spawns per-idea worker sessions on their own branches, each
handed one pre-assigned idea rather than choosing from a menu. This worker's assignment named
four specific files by line count and asked for the same three-prong deep read
(dead-code / doc-drift / test-coverage-gaps) that several 2026-09-12 and 2026-09-13 sessions
have already run over other corners of `components/admin`.

Before touching anything, the session checked the two other same-day docs already covering
adjacent territory — `2026-09-13-admin-explorer-yagni.md` and `2026-09-13-lib-admin-yagni.md`
— confirming both cover genuinely different files (`components/admin/explorer/*` +
`photoReferenceModel.ts`, and `lib/admin/*.ts`, respectively), so this session's four files
were real, untouched ground. That same check surfaced
`2026-09-12-admin-optional-props.md` (commit `1fec595`, merged `cb210af`): a whole-directory
dead-export/dead-prop AST scan over all 73 `components/admin` components with a "zero dead
exports" verdict — which necessarily already covers these four files at the export level.
Per the repo's own `main-may-have-shipped-the-requirement` lesson, that meant the dead-code
prong of this assignment needed a cheap fresh check (knip), not a from-scratch re-scan.

## What We Did (blow-by-blow)
1. Read `FileExplorer.tsx` (652 lines), `MemoryTable.tsx` (625 lines), `CharacterPanel.tsx`
   (620 lines), and `ShortcutTable.tsx` (581 lines) in full, plus their four dedicated
   component test files, before forming any opinion about gaps.
2. Read `2026-09-13-admin-explorer-yagni.md` and `2026-09-13-lib-admin-yagni.md` first, to
   rule out this session's four files overlapping either adjacent worker's assigned scope.
   Confirmed disjoint. Learned from the former doc's own verified ancestry chain that
   `2026-09-12-admin-optional-props.md` (commit `1fec595`, merged `cb210af`) already ran a
   whole-directory dead-export/dead-prop AST scan (73 components, 1,132 callsites) with a
   "zero dead exports" verdict at the export level, necessarily including these four files.
3. **Dead code prong.** Ran `npx knip --include exports,types` and plain `npx knip` scoped to
   all four files: zero flags on all four. This independently re-confirms (rather than just
   cites) the 2026-09-12 sweep's directory-wide verdict for these specific files — cheap,
   and avoids re-litigating the settled scan itself.
4. **Doc drift prong.** Spot-checked four specific factual claims embedded in the files'
   docstrings:
   - `MemoryTable.tsx` claims task #135 retired `confidence` from `nina_memory_facts` —
     confirmed via `drizzle/0011_rare_blockbuster.sql`
     (`ALTER TABLE "nina_memory_facts" DROP COLUMN "confidence"`) and matching commentary in
     `lib/admin/schema.ts`.
   - `FileExplorer.tsx`'s header calls itself "the successor to `AlbumManager`" — confirmed
     `AlbumManager.tsx` does not exist anywhere in the repo.
   - `ShortcutTable.tsx`'s header claims "this file names no `lib/nina` specifier at all" —
     confirmed by grep: the only occurrences of the string `lib/nina` in the file are inside
     the docstring's own prose, not an import.
   - `CharacterPanel.tsx`'s header claims the old `/admin/nina#character` fragment is
     retired, backed by a repo-wide grep (excluding `.workflows/plan/` copies) coming back
     empty — confirmed: `nina#character` only appears inside
     `components/admin/.workflows/plan/P2-CA-A00*.md` (adopted plan-doc copies, excluded
     from this kind of guard by repo convention), not in any real source file.
   No doc drift found anywhere in these four files — a legitimate negative result after
   genuine verification, not an unchecked assumption.
5. **Test-coverage-gaps prong — where the real value landed.** Cross-referenced every
   function and branch in each of the four files against its dedicated test file. Found two
   genuine gaps:
   - **Gap A — FileExplorer's private URL-grammar functions were completely untested.**
     `hrefForFolder`, `hrefForMediaView`, and the `hrefForPage`/`hrefFor`/`mediaHref`
     closures built from them are private to `FileExplorer.tsx`. `FileExplorer.test.tsx`
     fully mocks both `FolderTree` and `PhotoGrid` (the only two consumers of these
     functions), and the existing mocks simply ignored the `hrefFor`, `mediaHref`, and
     `hrefForPage` props entirely — so despite the file's own header calling this grammar
     out as living "in one place ... so it cannot drift," and another file
     (`tests/admin.filetree.test.ts:803`) explicitly depending on `hrefForMediaView` and its
     reader agreeing "by construction," nothing anywhere actually invoked these functions
     and checked their output.
     Fix: widened the `FolderTree` and `PhotoGrid` mocks in `FileExplorer.test.tsx` to
     capture and expose `hrefFor('bali')`, `mediaHref`, and `hrefForPage(1)`/`hrefForPage(2)`
     as `data-*` attributes, then added a new
     `describe('FileExplorer — the URL grammar (hrefFor / hrefForPage / mediaHref)')` block
     with 3 new tests covering: folder-present vs folder-absent vs page>1 combinations in
     the album arm, the media arm never dropping `?view=media` across pages, and the album
     pager never leaking `view=media` when a folder is open.
   - **Gap B — CharacterPanel's "loudest diverging dial" header summary had no coverage of
     its non-trivial branch.** The header shows `loudestDials(draft, defaults)` — e.g.
     "anger 75, flirty 30" — but every existing `CharacterPanel.test.tsx` test either starts
     with `draft === defaults` (exercising only the `loud.length === 0` → "every dial at its
     default" branch) or never asserts that line's content after a dial changes.
     Fix: added one test in the "chrome" describe block that changes the `anger` trait
     slider to 75 and asserts the header text matches `/anger 75/` — confirming the
     live-draft-based (not saved-row-based) summary actually names the right dial and value.
6. Verified via a TDD-adjacent process: wrote the mocks + tests, ran `npx vitest run` on all
   four component test files (78/78 passed, up from 71), ran `npx prettier --check` (found
   and fixed one formatting issue in the widened `FileExplorer.test.tsx` mocks via
   `--write`), ran `npx eslint` on both touched files (clean), ran `npx tsc --noEmit`
   (clean — only the pre-existing, already-documented missing-typegen `PageProps` /
   `LayoutProps` / `RouteContext` noise this worktree always has), then ran the full repo
   suite `npx vitest run` — 332 test files, 5748 tests, all green, zero flakes.
7. Committed as a single commit on this worker's own branch: `test(admin): close two
   coverage gaps in FileExplorer and CharacterPanel` (`86a714d`). 2 files changed
   (`CharacterPanel.test.tsx` +13, `FileExplorer.test.tsx` +81/−3), net +91/−3 lines.

## Code / Design Details
**Gap A fix, conceptually:** the `FolderTree`/`PhotoGrid` mocks in `FileExplorer.test.tsx`
previously rendered stub components that ignored the `hrefFor`, `mediaHref`, and
`hrefForPage` props they were handed. The fix threads those props through onto `data-*`
attributes on the mock's rendered output, so a test can call, e.g.,
`screen.getByTestId(...).dataset.hrefBali` and assert on the actual string the real
`FileExplorer` component computed — turning "the mock never looked at this prop" into "the
mock proves what this prop actually contains." The three new tests exercise the grammar
across the matrix that matters: folder present/absent, page 1 vs page>1, and album vs media
view — checking that `?view=media` is never dropped in the media arm and never leaks into the
album arm's pager links.

**Gap B fix, conceptually:** `CharacterPanel`'s header summary is computed from the *live
draft* state (`loudestDials(draft, defaults)`), not the last-saved row — a detail existing
tests never exercised because they all started from an unmodified draft. The new test moves
the `anger` slider to 75 first, then asserts the header text reflects that specific
draft-state change, closing the only branch of `loudestDials` (`loud.length > 0`) that had
zero coverage.

## Decisions & Trade-offs
- **Did NOT re-run or extend the 2026-09-12 optional-prop/dead-export AST scan to these four
  files.** That scan already covers the whole `components/admin` directory including these
  four, per `2026-09-13-admin-explorer-yagni.md`'s own verified ancestry chain. Re-running it
  would re-litigate a settled, landed verdict. Verified the *current* zero-flag state
  independently via knip instead, which is cheap and doesn't require rebuilding that AST
  classifier.
- **Only fixed genuinely verified gaps (2 concrete, provable ones), not speculative
  "coverage padding."** Did not add tests for branches already covered at the model/lib
  level — e.g. `formatFired`'s three branches are already exhaustively unit-tested in
  `tests/admin.shortcuts.test.ts`, so no additional `ShortcutTable`-level test was needed
  there.
- **Did not touch `MemoryTable.tsx` or `ShortcutTable.tsx`'s own test files.** Both were read
  in full and found to already have thorough, deliberate coverage matching every claim in
  their own headers (blur-to-save, optimistic-delete-into-blank-vs-absence, Escape/Cmd+Enter,
  refusal-without-network-call, etc.), so there was no real gap to close in either.
- **Chose not to install `@vitest/coverage-v8`** to get a numeric coverage report (it's not
  currently a dependency) — manual cross-referencing of every function/branch in each of the
  four files against its dedicated test file was sufficient to find the two real gaps, and
  adding a new dev dependency for a one-off measurement wasn't warranted.

## Follow-ups & YAGNI notes
- `components/nina` and `components/{extract,auth,push}` remain open targets for the same
  kind of file-by-file dead-code/doc-drift/test-gap deep read, per the repo's ongoing sweep
  pattern — not touched here, out of this session's assigned scope.
- If a future session ever adds `@vitest/coverage-v8`, re-verifying these four files' branch
  coverage numerically (rather than by manual cross-reference) would be a fast confirmation
  the two gaps found here are actually representative and nothing else was missed.

## Appendix
**Commands run:** `npx knip --include exports,types` and plain `npx knip` (scoped to the four
files); `npx vitest run` on the four component test files (78/78, up from 71) and full-repo
(332 files, 5748 tests, all green); `npx prettier --check` / `--write`; `npx eslint` on both
touched files; `npx tsc --noEmit`; various repo-wide greps for `AlbumManager`, `lib/nina`,
`nina#character`, and the `nina_memory_facts`/`confidence` schema history.

**Files touched:**
```
components/admin/CharacterPanel.test.tsx | 13 +++++++
components/admin/FileExplorer.test.tsx   | 81 ++++++++++++++++++++++++++---
```

**Session identity:** worker session `admin-explorer-components`, spawned by coordinator
`tokenmax-orch-2026-09-13` on 2026-09-13; branch
`token-maxxing-2026-09-13-admin-explorer-components`; work commit `86a714d`; unmerged as of
this doc's write time — the coordinator lands worker branches, not the worker itself.

**Related sessions:** `2026-09-13-admin-explorer-yagni.md` (adjacent worker, different files
— `components/admin/explorer/*` and `photoReferenceModel.ts`); `2026-09-13-lib-admin-yagni.md`
(adjacent worker, different files — `lib/admin/*.ts`); `2026-09-12-admin-optional-props.md`
(the prior whole-directory dead-export/prop sweep this session's dead-code prong builds on
and re-verified rather than re-ran).
