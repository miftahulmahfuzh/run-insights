# Token-Maxxing Session — 2026-09-11: Components Dead-Code Sweep

> **Twelfth token-maxxing session on this date, and the second run in worker
> mode for the afternoon's coordinated set** (coordinator
> `tokenmax-orch-2026-09-11`, worker slug `components-dead-code-b`): the idea
> was pre-assigned by the coordinator rather than picked from a menu, and it
> is the day's first **YAGNI/dead-code** session rather than another
> test-coverage session. The eleven prior sessions all added files (test
> suites, an architecture reference); this one deliberately tries to **remove
> things** — with "found nothing genuinely dead" named as an acceptable
> outcome up front, because the point is the audit, not the deletion count.

## 🎯 Achievement / End Result
- **Goal of the burn:** Run a dead-code / unused-export sweep across six
  directories that had never had a YAGNI pass — `components/extract/`,
  `components/auth/`, `components/push/`, `components/runs/`,
  `components/insights/`, and `lib/derived/` — for every exported
  component/function/type, grep the whole repo for callers/importers, and
  remove exports with genuinely zero callers (not counting the file's own
  tests). Targeted removal only: the `export` keyword leaves, nothing is
  deleted, renamed, or restructured.
- **Concrete changes:**
  - `components/extract/useExtractionStatus.ts` — `ExtractionStatusState`
    un-exported (1 line changed).
  - `components/push/PushSetup.tsx` — `PushSetupFallback` un-exported
    (1 line changed).
  - `components/runs/RunList.tsx` — `RunListRow` and `WeekDivider`
    un-exported (2 lines changed).
  - `lib/derived/invalidate.ts` — the header contract prose refreshed: it
    still described `onRunCommitted` as shipped "as a real, exported,
    **currently-no-op** function", which was true when F05 shipped the seam
    and false since the F06/F07/F09 sections in the same file all read
    LANDED (3 insertions, 2 deletions).
  - Total: 2 commits, 4 files, 4 `export` keywords + one comment. Zero
    behavior change, zero deletions of code.
- **Real value delivered:**
  - **The module surface is 4 members smaller**, verified by a repo-wide
    word-boundary grep per symbol — `ExtractionStatusState`, `RunListRow`,
    `WeekDivider`, and `PushSetupFallback` are now file-private, so nothing
    outside their file can grow a dependency on them without a deliberate
    re-export.
  - **All 17 files in the six directories are confirmed alive** — each is
    imported by at least one real caller — so the sweep's null result for
    whole-file deletion is itself evidence, recorded here so a future sweep
    does not re-derive it from scratch.
  - **Four deliberate keeps are documented with their reasons** (`pollDelayFor`,
    `insightScopesFor`, `InvalidateDeps`, `RunChangeEvent` — zero non-test
    importers, but contract-test seams their own file prose commits to), so a
    future sweep does not re-litigate them.
  - **One stale doc claim corrected** in `lib/derived/invalidate.ts`'s header:
    the invalidation contract no longer describes itself as a no-op it hasn't
    been since F06/F07/F09 filled in.
  - The one non-obvious trap is documented: `pollDelayFor` *is* named in
    three files it is never imported by (`lib/nina/turnflight.ts`,
    `lib/admin/imageGenTestView.ts`, `components/admin/ImageGenTestPanel.tsx`)
    — but only in comments. Prose mentions are not callers; the full-file
    reads are what separated the two.
- **Branch:** `token-maxxing-2026-09-11-components-dead-code-b`
  (worker-named branch, per-worker for this coordinated set).
- **Merge status:** merged (commit `74096a7`)
- **Approx token burn:** moderate — the burn is in the reading, not the
  writing: 27 exported symbols each grepped repo-wide, every candidate file
  read in full to separate real callers from prose mentions, typegen + tsc +
  targeted suites after each removal plus a full-suite gate at the end — for
  a net diff of 4 keywords and a comment. 🔥

## Context & Motivation
Every prior 2026-09-11 token-maxxing session grew the repo: component tests,
action tests, an architecture reference. The coordinator's afternoon set
deliberately pointed one worker the other way. Six directories —
`components/{extract,auth,push,runs,insights}` and `lib/derived/` — had
accumulated exports with no history of a "is this actually used?" pass, and
YAGNI sweeps are cheap to run and bounded in risk *if* the removal rule is
strict: only symbols with zero importers anywhere (the defining file's own
tests don't count as callers, since a test importing a symbol is exactly how
dead exports survive).

The constraint set was fixed up front:
- **Targeted removal only** — the `export` keyword leaves; nothing is
  deleted, renamed, moved, or restructured. A symbol that is dead as an
  export but alive as an internal helper keeps its job.
- **Parallel-session ownership respected** — `lib/nina`, `lib/admin`,
  `components/nina`, `components/admin`, `lib/db`, `app/`, `components/ui`,
  `components/charts`, `components/review`, `components/profile`,
  `components/share`, and `components/trends` were other sessions' territory
  and were not touched, not even for greps' conclusions that might have led
  to edits there.
- **A null result is a valid result** — "finding nothing genuinely dead was
  an acceptable outcome"; the value is the audit trail, not a deletion quota.

## What We Did (blow-by-blow)
1. **Enumerated the sweep's universe.** Grepped the six directories for
   top-level `export` lines: 17 files carrying 27 exported symbols
   (`components/auth/` 3 files, `components/extract/` 5, `components/insights/`
   2, `components/push/` 2, `components/runs/` 4, `lib/derived/` 1). Every
   `export` line names exactly one symbol — the session's live tally said
   "28 export sites / 27 symbol names"; the post-hoc `git grep` at the
   pre-sweep commit counts 27/27, one duplicated site in the live tally.
   (The full table is in the Appendix.)
2. **Grepped each of the 27 symbol names repo-wide** with word boundaries,
   then subtracted the defining file and its own tests. This produced the
   candidate list — and immediately separated two classes of hits:
   symbols with **zero** references outside their file, and symbols whose
   only outside references are **prose**.
3. **Cross-checked the two indirection layers that defeat naive greps.**
   Barrel re-export files: none exist for these directories — no
   `index.ts` re-exports, so an import anywhere names its defining module
   directly. `next/dynamic` string references: none — no dynamic import in
   the app references these components by path string. With both ruled out,
   a symbol absent from every import statement in the repo is genuinely
   importer-less.
4. **Read every candidate file in full** rather than trusting grep context
   lines. This is where the prose-vs-caller distinction got made:
   `pollDelayFor` (defined in and called by
   `components/extract/useExtractionStatus.ts` itself) is *named* in three
   files it is never imported by — `lib/nina/turnflight.ts` and
   `lib/admin/imageGenTestView.ts`, in comments explaining the polling
   schedule, plus `components/admin/ImageGenTestPanel.tsx` — and imported
   **nowhere** outside its own test. A context-line-only sweep would have either
   wrongly killed it on the grep hits or wrongly kept it as "referenced";
   the full read shows the references are prose. (It was kept anyway — see
   Decisions — but for the *documented* reason, not the grep artifact.)
5. **Concluded the per-file audit: every one of the 17 files is alive.**
   Each is imported by at least one real caller somewhere in the repo, so
   no file was deleted and no directory turned out to contain dead weight
   at file granularity. The dead weight was all at **member** granularity:
   4 `export` keywords, on 4 symbols across 3 files.
6. **Removed exactly the four `export` keywords:**
   - `ExtractionStatusState` (interface, `components/extract/useExtractionStatus.ts`)
     — the return type of `useExtractionStatus`, whose *name* is referenced
     nowhere else in the repo; the type still does its job as the hook's
     inferred return shape.
   - `RunListRow` (interface, `components/runs/RunList.tsx`) — the row type
     used only inside that file.
   - `WeekDivider` (component, `components/runs/RunList.tsx`) — rendered only
     inside `RunList` in the same file.
   - `PushSetupFallback` (component, `components/push/PushSetup.tsx`) —
     rendered only inside `PushSetup` in the same file.
   Nothing else changed: no signature edits, no renames, no reordering.
7. **Fixed the stale prose the sweep surfaced.** Reading `lib/derived/invalidate.ts`
   in full (as the audit required) showed its header still describing
   `onRunCommitted` as shipped "as a real, exported, **currently-no-op**
   function" — accurate on the day F05 shipped the seam, stale since the
   F06/F07/F09 sections in the same file were filled in and all read LANDED.
   Reworded to say what is true now: shipped as a deliberate no-op that
   F06/F07/F09 have since filled in, **preserving the original point** —
   the contract existed as a real exported seam on day one, never as a
   TODO comment.
8. **Verified after each removal, then at the end.** Fresh worktree, so
   `npx next typegen` ran first — `tsc` reports `PageProps` errors until
   typegen has run in a fresh checkout (a known trap, hit immediately).
   Then `npx tsc --noEmit` clean after each removal, plus the suites
   relevant to each touched file: `tests/extract.pollSchedule.test.ts`
   9/9 (extract) and `tests/views.render.test.ts` 19/19 (runs/push render).
   Full suite at the end: the first run showed 2 failures in one file
   (5105/5107) that did **not** reproduce on two immediate re-runs — final
   265 files / 5107/5107 green — consistent with the known
   MemoryTable-style flake under parallel load. The diff itself changes no
   runtime behavior (4 `export` keywords + a comment), which is what makes
   the non-reproducing failure safe to attribute to load rather than the
   change.
9. **Committed in two commits on the worker branch:**
   `b7026d0` — `refactor: un-export four symbols with zero importers
   (YAGNI sweep)` (3 files), `d2132b9` — `docs(invalidate): refresh stale
   'currently-no-op' contract prose` (1 file). Code and doc-prose kept as
   separate commits so each is independently revertable and neither buries
   the other.

## Code / Design Details

**The complete diff to code** — the entire `b7026d0` change is four lines:

```diff
 # components/extract/useExtractionStatus.ts
-export interface ExtractionStatusState {
+interface ExtractionStatusState {

 # components/push/PushSetup.tsx
-export function PushSetupFallback() {
+function PushSetupFallback() {

 # components/runs/RunList.tsx
-export interface RunListRow {
+interface RunListRow {

-export function WeekDivider({
+function WeekDivider({
```

Each symbol keeps its internal role: `ExtractionStatusState` is still the
return type of `useExtractionStatus` (the hook's consumers infer it, they
never named it), `RunListRow` still types the rows `RunList` maps over,
`WeekDivider` still renders inside `RunList`, `PushSetupFallback` still
renders inside `PushSetup`. The only thing removed is the ability for a new
importer to form, unremarked.

**The stale-prose fix** (`d2132b9`, `lib/derived/invalidate.ts` header):

```diff
- * **The invalidation contract.** Shipped by F05 as a real, exported, currently-no-op function —
- * not as a TODO comment, and not as a hook each downstream feature bolts on when it lands.
+ * **The invalidation contract.** Shipped by F05 as a real, exported function — a deliberate
+ * no-op that F06, F07 and F09 have since filled in below — not as a TODO comment, and not as a
+ * hook each downstream feature bolts on when it lands.
```

**Method notes worth keeping for the next sweep:**
- Word-boundary greps matter (`\bWeekDivider\b`), or `RunListRow` matches
  inside longer identifiers and comments inflate the caller count.
- **Barrel files and `next/dynamic` are the two holes in any import-grep** —
  the first re-exports under a different name path, the second references a
  component by a string literal. Neither exists for these six directories,
  which is what makes a grep-based conclusion sound here; a directory with
  either would need the extra check before any removal.
- Prose hits are the third hole: `pollDelayFor` appears in three files it is
  never imported by. Grep says "referenced elsewhere"; a full-file read says
  "referenced in comments elsewhere".

## Decisions & Trade-offs
- **Keep `pollDelayFor`, `insightScopesFor`, `InvalidateDeps`, `RunChangeEvent`,
  despite zero non-test importers.** These are the four symbols a naive
  sweep would have removed second (they pass the "not imported outside
  tests" test). They stay because their own file prose documents them as
  deliberate seams: `invalidate.ts` says `insightScopesFor` is exported "so
  the contract test can assert the set", its `InvalidateDeps` members are
  "[i]njected so the contract test can assert this is called once … without
  a database", and
  `lib/admin/imageGenTestView.ts` documents `pollDelayFor`'s
  exported-for-testability shape as a pattern ("`pollDelayFor`'s shape,
  exactly — a pure function of the attempt count, so it is testable") — and
  `tests/derived.invalidate.test.ts` plus `tests/extract.pollSchedule.test.ts`
  import those names directly. Removing them would have required rewriting
  the contract tests that exist to pin them: that is **refactoring, not
  targeted removal**, and out of scope by the session's own rule. Recorded
  here explicitly so a future sweep reads the reason instead of re-deriving
  (or worse, silently removing) them.
- **Keep `InvalidateOutcome`, which is imported nowhere at all.** It is the
  result type of `onRunCommitted`, matching the repo's convention of
  exporting result types (`RecomputeResult`, `BadgeAwardResult`). A type
  that names a function's contract at its definition site is a different
  thing from an unused helper — removing it would make the contract
  *less* legible, not more dead-code-free. This is the one judgment call in
  the sweep where "zero references anywhere" was not sufficient grounds,
  and the convention argument is the reason.
- **Un-export rather than delete `ExtractionStatusState` / `RunListRow`.**
  Both interfaces could arguably have been inlined-away. That is
  restructuring; the session's mandate was targeted removal. Un-exporting
  gets ~all the value (the public surface shrinks) at ~none of the risk,
  and leaves the inlining decision to whoever next edits those files with
  context in hand.
- **Split the prose fix into its own commit.** `d2132b9` touches only a
  docstring. Bundling it into `b7026d0` would have made the refactor
  commit's claim ("only export keywords") literally false and made
  reverting the wording separate from reverting the surface change.
- **Accept the non-reproducing full-suite failure as environmental.** 2
  failures in one file, gone on two immediate re-runs, on a diff that
  cannot change runtime behavior. The alternative — treating it as real —
  would have meant debugging a suite the diff provably cannot affect. The
  known MemoryTable-style flake under parallel load is the parsimonious
  explanation, and the final green run (265 files / 5107/5107) is the
  recorded gate.

## Follow-ups & YAGNI notes
- **Did not sweep the parallel-session-owned directories** (`lib/nina`,
  `lib/admin`, `components/nina`, `components/admin`, `lib/db`, `app/`,
  `components/ui`, `components/charts`, `components/review`,
  `components/profile`, `components/share`, `components/trends`) — other
  sessions' territory in this coordinated set. If the coordinator wants a
  full-repo YAGNI pass, those directories are the remaining surface, and
  this session's method (enumerate → word-boundary grep → barrel/dynamic
  cross-check → full-file read) transfers directly.
- **Did not touch the four deliberate keeps** (`pollDelayFor`,
  `insightScopesFor`, `InvalidateDeps`, `RunChangeEvent`). A future session
  *could* decide the contract tests should reach the seams differently
  (e.g. asserting via the public function's behavior rather than importing
  the types), which would free all four for un-exporting — but that is a
  test-design refactor with its own trade-offs, not dead-code removal.
- **Did not inline the two now-file-private interfaces** (`ExtractionStatusState`,
  `RunListRow`) — see Decisions.
- **The prose-vs-caller trap generalizes:** `pollDelayFor` was caught by
  reading files in full. A cheap future improvement: when a grep shows a
  symbol "referenced" only in files that don't import it, check whether the
  hits are comment lines (`grep -v '^\s*//'`-style pre-filter or just
  reading the hit lines) before promoting the symbol to "alive".
- **`InvalidateOutcome` remains the one convention-kept, zero-import export.**
  If the repo ever grows a lint rule against unconsumed exports, this is the
  symbol that will need an inline exemption or a convention carve-out
  documented in the rule.

## Appendix

**Commits (on `token-maxxing-2026-09-11-components-dead-code-b`, oldest
first):**
```
b7026d0 refactor: un-export four symbols with zero importers (YAGNI sweep)
d2132b9 docs(invalidate): refresh stale 'currently-no-op' contract prose
```

**Files touched:**
```
components/extract/useExtractionStatus.ts | 2 +-
components/push/PushSetup.tsx             | 2 +-
components/runs/RunList.tsx               | 4 ++--
lib/derived/invalidate.ts                 | 5 +++-
```
(3 files in `b7026d0`: 4 insertions, 4 deletions; 1 file in `d2132b9`:
3 insertions, 2 deletions.)

**The sweep's universe — all 17 files and their exported symbols as they
stood at the pre-sweep commit (`b7026d0^`), with the four removals marked:**

| File | Exports | Removed this session |
|---|---|---|
| `components/auth/AccountMenu.tsx` | `AccountMenu` | — |
| `components/auth/SignInCard.tsx` | `SignInCard` | — |
| `components/auth/SignOutButton.tsx` | `SignOutButton` | — |
| `components/extract/ExtractingSkeleton.tsx` | `ExtractingSkeleton` | — |
| `components/extract/ExtractionGate.tsx` | `ExtractionGate` | — |
| `components/extract/KindSelector.tsx` | `KindSelector` | — |
| `components/extract/UploadPicker.tsx` | `UploadPicker` | — |
| `components/extract/useExtractionStatus.ts` | `pollDelayFor`, `ExtractionStatusState`, `useExtractionStatus` | `ExtractionStatusState` |
| `components/insights/InsightCard.tsx` | `readInsightPayload`, `InsightCard` | — |
| `components/insights/InsightTrigger.tsx` | `InsightTrigger` | — |
| `components/push/PushSetup.tsx` | `PushSetup`, `PushSetupFallback` | `PushSetupFallback` |
| `components/push/PushSetupCard.tsx` | `PushSetupCard` | — |
| `components/runs/IntentChips.tsx` | `IntentChips` | — |
| `components/runs/ProvenanceMark.tsx` | `ProvenanceMark` | — |
| `components/runs/RunList.tsx` | `RunListRow`, `RunList`, `WeekDivider` | `RunListRow`, `WeekDivider` |
| `components/runs/RunRow.tsx` | `RunRow` | — |
| `lib/derived/invalidate.ts` | `RunChangeEvent`, `InvalidateDeps`, `InvalidateOutcome`, `insightScopesFor`, `onRunCommitted` | — (all kept; see Decisions) |
| **Total** | **27 symbols / 27 sites** | **4 removed** |

(Count reconciliation: the session's live tally recorded "28 export sites /
27 symbol names"; the post-hoc `git grep -E '^export '` at `b7026d0^` counts
27 sites, each naming exactly one symbol — one duplicate in the live tally.
All per-file numbers in this table are measured at the pre-sweep commit.)

**Verification commands run:**
```bash
npx next typegen          # fresh worktree: required before tsc (PageProps errors otherwise)
npx tsc --noEmit          # clean, after each removal
npx vitest run tests/extract.pollSchedule.test.ts   # 9/9
npx vitest run tests/views.render.test.ts           # 19/19
npx vitest run            # final: 265 files / 5,107 tests green
```

**Gate results:**
- `npx next typegen && npx tsc --noEmit`: clean.
- Targeted suites after each removal: `tests/extract.pollSchedule.test.ts`
  9/9, `tests/views.render.test.ts` 19/19.
- Full suite: first run 5,105/5,107 (2 failures in one file, non-reproducing
  on two immediate re-runs — consistent with the known MemoryTable-style
  flake under parallel load); final **265 files / 5,107/5,107 green**.
- The diff contains no runtime change (4 `export` keywords + one comment),
  which is what makes attributing the flake to load, not the change, sound.

**Branch:** `token-maxxing-2026-09-11-components-dead-code-b` — merged
(commit `74096a7`).
