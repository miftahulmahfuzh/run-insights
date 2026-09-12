# Token-Maxxing Session — 2026-09-12: UI Primitives YAGNI

## 🎯 Achievement / End Result
- **Goal of the burn:** A WORKER session (slug `ui-primitives-yagni`) pre-assigned one idea by
  the coordinator (`tokenmax-orch-2026-09-12`): hunt and remove dead exports and unused
  primitives in `components/ui` — at 5,234 lines the largest component tree in the repo, and
  the one directory that had **never had a dead-code pass of its own** (the 2026-09-11
  sweeps touched `app/` and `components/{extract,auth,push,runs,insights}` and
  `components/{ui/charts…}` siblings, but treated the `ui` primitives themselves as the
  barrel they hang off, not as a subject). The idea was rated safe to prune because the
  directory's test coverage had landed the day before (`2026-09-11-ui-primitives-tests.md`:
  205 tests across 16 new files). Hard constraints from the coordinator: stay **strictly
  within `components/ui`**; touch **no `package_readme.md`**; **no production DB**.
- **Concrete changes:** 1 commit (`dba8f17`), 9 files, **+25/−46**, every file under
  `components/ui`: three zero-importer internal types un-exported
  (`AppShellScreen`, `SheetProps`, `PanelParam`); three speculative/test-only `className`
  props deleted (`AppShell.className`, `EmptyState.className`, `Field.className`) together
  with their test cases and `EmptyState`'s now-unneeded `cn` import; three doc-claim drifts
  inside the directory measured and fixed (`index.ts`, `AppShell.tsx`, `Sheet.tsx`).
- **Real value delivered:**
  - **The method is the durable artifact**: a TS-compiler-AST import-graph classifier
    (throwaway script in gitignored `.next/`, not committed) built specifically to defeat
    the four known verifier traps that make regex dead-code sweeps lie — twin names
    (attribution per *resolved module*, not per name), relative imports (real resolver),
    barrel re-exports (transitive name mapping through `index.ts`), multiline imports
    (AST, not line greps). Positive control passed before any verdict was trusted: a
    synthetic probe export was read as DEAD, and known-alive barrel imports were
    attributed through `index.ts`.
  - **The honest harvest, as measured:** 3 un-exports + 3 speculative props + 3 stale doc
    counts — and **verified-true claims on everything else**. The YAGNI verdict on the
    tree overall: `components/ui` is already unusually clean; a prior sweep curated the
    barrel and `Flag` was already module-private. Saying "this tree is clean, with
    evidence" is a real deliverable — it retires the idea from every future session's menu.
  - **A verifier blind spot caught by the gate, not the scanner**: `AppShell.className`
    was actually *used* — by a test, via a `{...props}` spread the JSX-attribute scanner
    could not see through. `tsc --noEmit` failed after the prop was removed, the spread
    was found, and the verdict was corrected from "keep (used by tests)" to "remove
    (test-only)". The scanner's test-pass blind spot and the type gate's catch are both
    recorded here for the next sweep.
  - **Two false alarms dismissed with reasons instead of deletions**: `NumberInput.ref`
    "never set" was inherited from the shared `InputProps`, where `Input` consumes it; the
    `buttonClasses` "never set" rows were a scanner artifact (a function, not a JSX
    element). Neither was touched.
  - **Doc-claim drift fixed at the source**: the three counts inside `components/ui` that
    had rotted now state measured numbers with their measure date, so the directory's own
    comments can't quietly mislead the next reader the way the barrel's "ten client
    components" (actually 32) was doing.
- **Branch:** `token-maxxing-2026-09-12-ui-primitives-yagni`
- **Merge status:** committed locally on the worker branch, **NOT merged** — the
  coordinator (`tokenmax-orch-2026-09-12`) owns landing worker branches to main.
- **Approx token burn:** high (est. ~0.7M, input-dominated) — the burn went into the
  classifier build and its positive control, per-call-site classification of every verdict,
  and three verification runs (components/ui suite, the full sweep, and a stash-based
  clean-HEAD reproduction of the two flaky failures). 🔥

## Context & Motivation
The 2026-09-12 token-maxxing day ran as an orchestrated fan-out: a coordinator session
(`tokenmax-orch-2026-09-12`) spawning worker sessions on per-session branches, each handed a
pre-assigned idea. This worker's assignment was the design-system primitives themselves.

The pitch had three legs. First, scale: `components/ui` is the largest component tree in the
repo (5,234 lines) and everything else imports it, so a dead export here is a lie every
future importer can inherit. Second, safety: the directory's test coverage had landed the
day before (205 real DOM tests across 16 co-located files), which is exactly the precondition
every prior YAGNI session had deferred on ("flagged 4–5 prior sessions, each deferred for
missing test coverage"). Third, the gap itself: despite being the most-imported component
tree, `components/ui` had never been the *subject* of a dead-code pass — the 2026-09-11
`components-dead-code-a` sweep had pruned around it (six dead barrel re-exports dropped,
`Button`'s and `Field`'s prop types de-exported) without auditing the primitives' own export
surface, and the directory was on record as "never had a dead-code pass itself."

The constraints were as much a part of the design as the idea: the TAB_BAR_* constants had a
known consumer living *outside* the directory (`tests/tabbar.geometry.test.ts`), so "stay
strictly within `components/ui`" was going to bind on a real verdict, not just on paper —
and it did.

## What We Did (blow-by-blow)
1. **Built the classifier before running any grep.** The repo's memory file
   (`dead-export-sweeps`) records four verifier traps that have each already flipped a
   keep/remove verdict somewhere: twin names (e.g. the `review/` vs `ui/` `SplitsTable` +
   `ZoneBar` twins from yesterday's sweep), relative imports, barrel re-exports, and
   multiline import lists. A regex sweep gets all four wrong in a directory that *has* a
   barrel and *has* name twins, so this pass skipped regex entirely: a throwaway
   TypeScript-compiler-AST script (written into gitignored `.next/`, deliberately not
   committed) built an import graph over the repo — every import specifier resolved to its
   module (so `../TabBar` and `@/components/ui` land on real files, and through-barrel names
   map transitively to their originating export), every imported name attributed per
   resolved module, all 17 `components/ui` source files / 44 exports enumerated.
2. **Positive-controlled the classifier before trusting a single verdict.** A synthetic
   probe export was planted and correctly read as DEAD; known-alive imports made *through*
   the barrel (`import { Card } from '@/components/ui'`) were correctly attributed to their
   originating files through `index.ts` rather than dying at the barrel boundary.
3. **Classified all 44 exports; the verdicts fell into four buckets:**
   - **DEAD, internal-use-only (3)**: `AppShellScreen` (`AppShell.tsx`),
     `SheetProps` (`Sheet.tsx`), `PanelParam` (`usePanelParam.ts`) — exported, zero
     importers repo-wide, each used only inside its own file. All three `export` keywords
     dropped; nothing deleted.
   - **SPECULATIVE SURFACE (3)**: `AppShell.className`, `EmptyState.className`,
     `Field.className` — optional props whose only setters were tests (or nothing). See
     step 4.
   - **TEST-ONLY, KEPT ON SCOPE (5 names)**: `TAB_BAR_HEIGHT_PX`, `TAB_BAR_BORDER_PX`,
     `TAB_BAR_OUTER_HEIGHT_PX`, `TAB_BAR_CONTENT_DROP_CSS` (+ outer-height companion) have
     no importer inside `components/ui` — their consumer is
     `tests/tabbar.geometry.test.ts`, which lives **outside** the directory the coordinator
     fenced off. Removing them would have violated the constraint, and `TabBar.tsx`'s own
     docstring already records them as deliberate test seams. Kept, deliberately.
   - **ALIVE, and verified rather than assumed**: the barrel's claims were checked against
     the graph instead of trusted — all **15** re-exported names have ≥1 non-test barrel
     importer (the prior trim pass held), and `Toast` is confirmed still nonexistent, exactly
     as `index.ts`'s doc claims it is.
4. **Removed the three `className` props, each by its own evidence:**
   - `AppShell.className`: set at **0 of 11 call sites, tests included**. This verdict is
     the session's verifier lesson: the JSX-attribute scanner initially missed a
     `{...props}` spread in `AppShell.test.tsx` and the first pass read the prop as
     test-unused; `tsc --noEmit` failed the moment the prop was deleted, the spread was
     found, and the verdict corrected to test-only-usage. The test case was **rewritten**
     onto the slimmer signature ("renders the page's children inside main") rather than
     deleted — coverage kept, speculation dropped.
   - `EmptyState.className` and `Field.className`: set only by their own test files. Their
     test cases were removed (one each), and each component's docstring now records the
     *rule* that justified removal — `EmptyState`: "No `className` prop: all nine callers
     want the same card, and a prop with no caller is a second way to render an absence,
     waiting"; `Field`: "spacing around a field belongs to the form that lays the fields
     out, and no caller reached for it." Both cite the precedent this follows: the repo's
     own `RunDateLink` round-3 ruling — **a prop with no caller is a second way to render,
     waiting.** `EmptyState`'s `cn` import went with it (a plain class string needs no
     merge).
5. **Measured the directory's own doc claims while in there** — three had drifted, all
   fixed in the same commit:
   - `index.ts`: "ten client components import it" → **32, measured 2026-09-12**
     (reworded "thirty-plus … (32 measured 2026-09-12)" so the sentence survives modest
     drift).
   - `AppShell.tsx`: "five pages import it" → **nine pages, a layout and two loading
     states, measured 2026-09-12** (the count matters because it is the argument for the
     file staying a Server Component).
   - `Sheet.tsx`: "memoising at the two call sites" → **three** (named:
     `MessageActionsSheet`, and the review `SplitsTable` and `ZoneBar`).
6. **Dismissed two false alarms with reasons, not deletions.** `NumberInput.ref` read as
   "never set" because the prop is *inherited* from the shared `InputProps` — `Input`
   consumes it on `NumberInput`'s behalf. The `buttonClasses` "never set" rows were a
   scanner artifact: `buttonClasses` is a function, not a JSX element, so a JSX-attribute
   scan was the wrong instrument. Both left untouched; both recorded so the next sweep
   doesn't re-litigate them.
7. **Gates, in order:** `npx tsc --noEmit` clean apart from the worktree's known
   missing-typegen `PageProps`/`LayoutProps`/`RouteContext` noise (a fresh worktree — the
   same noise every session here has seen); `vitest components/ui` **203/203**; full sweep
   **5,089 passed, 2 failed** — both the known pre-existing `MemoryTable` add-row
   parallel-load flake, reproduced **identically on clean HEAD via stash** before being
   attributed to anything, with `MemoryTable` passing **20/20** under
   `--no-file-parallelism` (the memory-file playbook followed to the letter); eslint clean
   on the changed files (one **pre-existing** `react/no-unescaped-entities` pair in
   `Card.test.tsx:90`, untouched by this diff and left alone as out of mandate); prettier
   clean after one `--write` reflow of the edited `AppShell.tsx` comment.
8. **Committed as `dba8f17`** on the worker branch and stopped — no merge, no push; the
   coordinator lands worker branches.

The test-count arithmetic reconciles to the digit: repo-wide the suite went
**5,093 → 5,091**, exactly the two removed cases (`EmptyState`'s and `Field`'s "merges a
caller className" tests) — the `AppShell` case was rewritten, not deleted, so it costs zero;
`components/ui` itself stands at 203/203.

## Code / Design Details

**The verdict table as landed** (from the commit message — the classifier's four buckets,
one line each):

```
- AppShellScreen, SheetProps, PanelParam: exported, zero importers, internal use
  only -> un-exported.
- AppShell.className: set at 0 of 11 call sites, tests included -> prop + cn slot
  removed.
- EmptyState.className, Field.className: set only by their own tests -> removed,
  with their test cases (the RunDateLink round-3 rule: a prop with no caller is a
  second way to render, waiting).
- TAB_BAR_{HEIGHT,BORDER,OUTER_HEIGHT}_PX + TAB_BAR_CONTENT_DROP_CSS stay: test
  seams whose consumer (tests/tabbar.geometry.test.ts) lives outside components/ui.
```

**The docstring rule, recorded at the site of the removal** (`EmptyState.tsx`) — so the
next person tempted to re-add the prop meets the argument where they'd write the code:

```
 * No `className` prop: all nine callers want the same card, and a prop with no caller is a second
 * way to render an absence, waiting (the rule `RunDateLink` applied when its `label` override came
 * back out).
```

**The `EmptyState` simplification that fell out for free** — dropping the prop also dropped
the only reason the file imported `cn`:

```diff
-    <div
-      className={cn(
-        'rounded-card border border-dashed border-rule px-6 py-8 text-center',
-        className,
-      )}
-    >
+    <div className="rounded-card border border-dashed border-rule px-6 py-8 text-center">
```

**The `Sheet.tsx` doc fix** — the "two call sites" claim was doing load-bearing work in an
argument about *why* the `onCloseRef` fix belongs in `Sheet` rather than at the callers, so
the count had to be right:

```diff
-   * this ref, and the effect keys on `open` alone. Fixing it here rather than memoising at the two
-   * call sites is the point: a `useCallback` in `ZoneBar` would leave the trap armed for the next
+   * this ref, and the effect keys on `open` alone. Fixing it here rather than memoising at the
+   * three call sites (MessageActionsSheet, and the review SplitsTable and ZoneBar) is the point:
+   * a `useCallback` in `ZoneBar` would leave the trap armed for the next
```

**Why the classifier, in one paragraph:** the four traps are not hypothetical in *this*
directory. `components/ui` has a barrel (`index.ts`) that every client component imports
through, so any per-name grep must map names transitively through the barrel to their
originating files; it has name twins across `review/` vs `ui/` (yesterday's sweep documented
that exact false alarm); it has relative imports (`./TabBar`) that a bare-name grep cannot
resolve; and its test files use multiline import lists that line-oriented greps misread. A
TS-AST pass over the whole repo resolves all four by construction — which is why the
throwaway script was worth the build even for a one-session use.

## Decisions & Trade-offs
- **Build the AST classifier rather than grep; throw it away anyway.** A regex sweep in a
  directory with a barrel and name twins produces verdicts that need exactly the manual
  re-checking the AST pass automates — and yesterday's sweep already burned a day proving
  the traps bite. Cost: script-writing time. Benefit: every verdict came with a resolved
  module path, and the positive control made "the classifier says DEAD" mean something.
  The script itself was left in gitignored `.next/` — the *method* is the artifact, and it
  is recorded here; committing a one-shot analyzer nobody will maintain is its own YAGNI
  violation.
- **The type gate outranks the scanner.** When `tsc` failed after removing
  `AppShell.className`, the finding was not "revert" but "the scanner missed a spread" —
  the verdict was corrected to test-only and the removal went through. A verifier that
  can't see `{...props}` is not evidence of usage; a compiler that can't type a removed
  prop *is*. The lesson generalizes: JSX-attribute scanners have a test-pass blind spot,
  so any "this prop is only set by tests" claim should be confirmed by deleting the prop
  and letting `tsc` vote.
- **Kept the TAB_BAR_* test seams on scope grounds, with the reason written where the next
  sweep will look.** These are test-only exports — the exact shape this pass was hunting —
  and they survive because their consumer lives outside the fence the coordinator drew.
  That is the correct reading of the constraint, but it is a *scope* verdict, not a *liveness*
  verdict, and `TabBar.tsx`'s docstring already says so; the keep is re-litigable the day
  the consumer test moves (see follow-ups).
- **Verified the barrel's claims instead of trusting them.** "15/15 re-exports pulled
  through; Toast still nonexistent, as the doc claims" is a *checked* statement, and
  checking it cost one query against the already-built graph. The alternative — carrying
  the barrel's self-description forward because it looked maintained — is how the three
  doc drifts in step 5 survived as long as they did.
- **Fixed doc drift in the same commit as the code change.** All three corrected counts
  live in the same files the sweep touched, and each got its measure date
  ("32 measured 2026-09-12"). Measuring was nearly free in-session (the graph already
  existed); the alternative was leaving freshly-touched files with known-false comments.
- **The honest-verdict framing over the bigger-diff framing.** Nine sibling sessions this
  day landed bigger diffs. This one's diff is +25/−46 against the repo's largest component
  tree, and the deliverable is partly the *negative result*: the tree is already clean, and
  the two false alarms are dismissed with reasons. Publishing a small true diff beat
  manufacturing a large speculative one.
- **Scope discipline held at the one place it hurt.** No `package_readme.md` touched (even
  though the day's theme is readme compaction and `components/ui` has one), no production
  DB, no file outside `components/ui` — including the tempting `Card.test.tsx:90` eslint
  errors, which are pre-existing on main and one fence over in mandate only.

## Follow-ups & YAGNI notes
- **`Card.test.tsx:90` still carries a pre-existing `react/no-unescaped-entities` pair on
  main** — a two-line escape fix (`'` → `&apos;` or a string literal) that nobody has made.
  It is one commit away and blocks nothing, but every future "eslint clean on changed
  files" claim in this directory will keep needing its "pre-existing, untouched" caveat
  until someone lands it.
- **origin/main moved +3 commits mid-session** (a sibling `review-yagni` sweep in
  `components/review`). No file overlap with this branch, so the coordinator's merge should
  be clean — but the coordinator should still expect main to have advanced past the branch
  point.
- **The TAB_BAR_* keep-verdict is conditional on geography.** If the test seams are ever
  consolidated, the consumer test (`tests/tabbar.geometry.test.ts`) moving *into*
  `components/ui` would flip their verdict from "keep (out of scope)" to "remove (test-only,
  in scope)". The next sweep of this directory should re-read that test's location before
  re-classifying the constants.
- **The `className`-removal pattern generalizes.** "Optional prop vs. its set-at call sites"
  is a cheap scan once an import graph exists (this pass needed no new machinery for it),
  and the same optional-prop-vs-call-sites scan could be run over `components/admin` and
  `components/nina` next — both are larger than `ui` was, and neither has had the pass.
- **Deliberately NOT done, on YAGNI grounds:** the classifier script was not committed, no
  `Toast` was written (the barrel's doc says it doesn't exist and nothing reached for it),
  no prop was re-added "for flexibility", and no package readme was updated — the
  directory's readme is another session's assignment and this diff changes no
  architecture.

## Appendix

**Files touched** (all under `components/ui/`; 9 files, +25/−46, commit `dba8f17`):
```
components/ui/AppShell.test.tsx   |  5 ++---    (className case rewritten, not deleted)
components/ui/AppShell.tsx        | 13 +++++-   (un-export AppShellScreen; drop className; count fix)
components/ui/EmptyState.test.tsx |  6 ------   (className case removed)
components/ui/EmptyState.tsx      | 15 +-----    (drop className; cn import dropped; rule doc'd)
components/ui/Field.test.tsx      | 10 -----    (className case removed)
components/ui/Field.tsx           |  8 +++--    (drop className; rule documented)
components/ui/Sheet.tsx           |  7 +++--   (un-export SheetProps; call-site count 2 -> 3)
components/ui/index.ts            |  5 +++--   (barrel count 10 -> 32, measure date)
components/ui/usePanelParam.ts    |  2 +-      (un-export PanelParam)
```

**Verification performed:** positive-controlled TS-AST import graph (synthetic DEAD probe
correctly classified; through-barrel attribution verified); all 44 exports over 17 source
files classified; `npx tsc --noEmit` clean apart from the worktree's known
missing-typegen `PageProps`/`LayoutProps`/`RouteContext` noise; `vitest components/ui`
203/203; full sweep 5,089 passed / 2 failed with both failures identified as the known
pre-existing `MemoryTable` add-row parallel-load flake — reproduced identically on clean
HEAD via stash, `MemoryTable` 20/20 under `--no-file-parallelism`; repo-wide suite
5,093 → 5,091 (exactly the two removed cases); eslint clean on changed files (one
pre-existing `react/no-unescaped-entities` pair in `Card.test.tsx:90` left as out of
mandate); prettier clean after one `--write` reflow.

**Session identity:** worker session `ui-primitives-yagni`, spawned by coordinator
`tokenmax-orch-2026-09-12` on 2026-09-12; branch
`token-maxxing-2026-09-12-ui-primitives-yagni`; work commit `dba8f17`; not merged
(coordinator lands worker branches).

**Related sessions:** `2026-09-11-ui-primitives-tests.md` (the coverage that made this pass
safe); `2026-09-11-components-dead-code-a.md` (the prior sweep that curated the barrel and
established the four-trap verifier discipline this pass industrialized);
`2026-09-11-lib-admin-dead-exports.md` and `2026-09-11-lib-db-queries-yagni.md` (the
repo's other dead-code passes, for method comparison).
