# Token-Maxxing Session — 2026-09-12: HRmax Transition Machinery Removal (F06 §4.5 YAGNI)

## 🎯 Achievement / End Result
- **Goal of the burn:** Resolve the explicitly deferred "ship F06 §4.5 or remove" decision on
  `lib/metrics/hrMax.ts`'s `hrMaxTransitionAt` / `resolveHrMaxAsOf` / `HrMaxTransition` — the F06
  §4.5 HRmax transition banner was planned and documented but never shipped, the trio had zero
  production callers, so YAGNI says remove. The assignment's one hard requirement: **verify zero
  callsites before deleting.** Assigned as a worker idea by the day's parallel coordinator
  `tokenmax-orch-2026-09-12`; this is the direct sequel to the same-day insights/metrics/panel
  sweep, whose Follow-ups section had recorded this exact decision as "the real decision, and
  it's still open."
- **Concrete changes:** Two commits, **+40/−309 across 10 files**, on branch
  `token-maxxing-2026-09-12-metrics-hrmax-yagni`:
  - `3964416` "refactor(metrics): remove never-shipped F06 §4.5 HRmax transition machinery" —
    8 files, +35/−229. The trio itself, its 3 barrel re-export lines, `HrMax.observedRunId`
    (written, never read), the `asOf` plumbing through `resolveFromProfile`, the false
    "F06's run detail page calls it once per render" doc comment, the dead halves of both HRmax
    suites, a phantom corrected in `tests/metrics.session.test.ts`, and doc reconciliation in
    `docs/architecture.md` + `lib/metrics/.workflows/package_readme.md`.
  - `d41ed8a` "refactor(db): drop the two HRmax queries orphaned by the F06 §4.5 removal" —
    2 files, +5/−80. `getRun` and `getPreviousReviewedRun` deleted from `lib/db/queries.ts`
    (exactly one production caller each: the removed detection), their two reviewedOnly unit
    cases, the `asOf` cutoff option on `getObservedMaxHrRun` (one producer:
    `resolveHrMaxAsOf`), and the now-unused `lte` drizzle import.
- **Real value delivered:**
  - A decision the codebase carried as an explicit deferral is **closed, not narrowed**: the
    never-shipped banner's entire machinery — transition detection, cutoff resolver, two
    orphaned DB queries, a write-only field, a drizzle import — is gone, and `hrMax.ts`'s
    DOCUMENTED NON-GOAL block now records the removal instead of implying the feature was
    pending.
  - **Verification before deletion, traced to depth 3.** The word-boundary sweep found only
    barrel lines, two test suites, and comment prose (prose-vs-import classification applied to
    every hit, per the dead-export-sweep memory). Following the callers *of the callers* then
    produced the real diff: `getRun` and `getPreviousReviewedRun` were each held alive by
    exactly one production consumer — the trio itself — with their own unit tests as the only
    other referencers (the self-licking-seam shape); `getObservedMaxHrRun`'s `asOf` option and
    the `lte` import had exactly one producer each. Deleting only the named trio would have
    left 80 lines of half-dead surface behind.
  - **Bonus dead surface found and removed:** `HrMax.observedRunId` — written in
    `resolveFromProfile`, read by nobody; the live attribution copy on `app/r/[id]/page.tsx:298`
    and `app/me/page.tsx:177` reads `observedOn` only. Its justification doc comment referenced
    the dead §4.5 transition detection.
  - **A phantom corrected:** `tests/metrics.session.test.ts` claimed
    "`resolveHrMaxExcludingRun` still ships, for F09's `new_ceiling` badge" — no such function
    exists anywhere in the repo's history; `new_ceiling` reads the record-recompute's `changed`
    set (`lib/badges`), never a resolver. The comment now states reality.
  - **The tsc gate caught the one fixture the manual sweep missed** (`observedRunId` in a
    session-test `HrMax` literal) — verification-before-completion doing its job.
  - Kept surface verified live and untouched in behavior: `resolveHrMax`, `tanakaEstimate`,
    `HrMax`, `HrMaxSource`, `getObservedMaxHrRun` — the resolver's four-step degradation ladder
    and every documented ruling about it survive verbatim.
- **Branch:** `token-maxxing-2026-09-12-metrics-hrmax-yagni` (worktree session; exactly two
  commits ahead of origin/main tip `a088491` — `git log --oneline origin/main..HEAD` shows
  only `d41ed8a` and `3964416`).
- **Merge status:** merged (commit `cbf803e`)
- **Approx token burn:** the heaviest kind of light diff — multi-round per-symbol caller
  verification (namespace-call and barrel-path traps, twin-name check `getRun` vs
  `getRunDetail`), a removal cascade traced to depth 3 (detection → queries → query options →
  drizzle imports), one full-suite flake chase (two ~21s full vitest runs), a knip baseline
  provenance check for three re-export flags, and several deliberate scope rulings (keep vs
  trim a query projection; reword vs delete a contract block) — all to justify a 309-deletion
  diff that removes behavior nobody could reach. 🔥🔥

## Context & Motivation
The F02 plan (§4.5) had specified an HRmax transition banner: when a run is the first where
`observed` overtakes `estimated`, the run detail page was to announce — naming both numbers —
that the denominator moved, because a silently changing denominator makes historical %HRmax
figures incomparable. The plan's detection machinery was fully built and richly documented:
`hrMaxTransitionAt` compared two resolutions, `resolveHrMaxAsOf` answered "what was true then",
and `HrMaxTransition` carried the before/after pair. F06 (the run detail page) shipped without
the banner. What remained was 150+ lines of tested, commented machinery whose own doc comment
falsely claimed "F06's run detail page calls it once per render" — the exact shape of debt the
`dead-export-sweep-verifier-traps` memory exists for: alive only behind its own tests, with
prose asserting a caller that does not exist.

The 2026-09-12 morning sweep (`2026-09-12-insights-metrics-panel-yagni.md`) measured the trio
at zero production callers, classified it test-only, and — because `tests/` was outside its
assigned four dirs — recorded rather than acted: "Either ship F06 §4.5 (the code is sitting
there tested and waiting) or hold a tests-scoped session that removes it. Neither half is a
drive-by." The coordinator put exactly that decision on this session's menu, and it won it:
small, fully specified, high-certainty value — one recorded open decision, closable
definitively in a single session.

REMOVE over SHIP is not a close call. The banner was never in any release; every day the
machinery sat there it taxed every reader of `hrMax.ts` (the file's own doc comment lied about
its caller), and shipping a UI feature as a side effect of a YAGNI session would invert the
session's whole premise. Constraints honored throughout: no production-DB contact (the repo's
one database is production, and this is a read-only-code-plus-delete session), and the worker
does not merge — the coordinator owns landing.

## What We Did (blow-by-blow)
1. **Re-verified zero callers independently of the morning sweep.** Word-boundary greps for
   `hrMaxTransitionAt` / `resolveHrMaxAsOf` / `HrMaxTransition` over all tracked files. Every
   hit classified import-vs-prose: the 3 barrel lines in `lib/metrics/index.ts`, the two suites
   (`tests/metrics.hrMax.test.ts`, `tests/integration/hrMax.int.test.ts`), comment prose in
   `lib/db/queries.ts` ("F02's `hrMaxTransitionAt` wants `occurred_on`") and
   `lib/insights/load.ts` (the R-11 rationale), plus docs prose. The namespace-call trap
   (`metrics.hrMaxTransitionAt` spelling) came up empty; the twin-name trap was checked too —
   `getRunDetail` (live, many callers) vs `getRun` (the orphan) are near-anagrams and both
   live in `lib/db/queries.ts`.
2. **Traced the removal cascade to depth 3.** The assignment named the trio; the verification
   named everything the trio held: `hrMaxTransitionAt` was the *only* production caller of both
   `getRun` and `getPreviousReviewedRun` (each function's unit tests were the only other
   referencers — the self-licking seam); `resolveHrMaxAsOf` was the *only* producer of
   `getObservedMaxHrRun`'s `asOf` cutoff option; that option's predicate was the *only* user of
   the `lte` drizzle import. Depth 3 because the last link only falls out after the second.
3. **Swept the trio's data shape for dead fields.** `HrMax.observedRunId` was written in
   `resolveFromProfile` and read by nobody — the attribution copy ("from your run of X") on
   `app/r/[id]/page.tsx` and `app/me/page.tsx` reads `observedOn`. Its doc comment justified
   the field by §4.5's transition detection, itself dead.
4. **Commit 1 (`3964416`):** removed the trio, the barrel lines, `observedRunId`, the `asOf`
   parameter threading, and the false comment; reworded the DOCUMENTED NON-GOAL block to stand
   alone and record the removal; trimmed both suites to the surviving resolver surface (62
   tests green across `metrics.hrMax`, `metrics.session`, `db.queries.reviewedOnly`);
   reconciled `docs/architecture.md`'s F02 as-built line and
   `lib/metrics/.workflows/package_readme.md`; corrected the phantom
   `resolveHrMaxExcludingRun` claim.
5. **Let the gates audit the manual sweep.** `npm run typecheck` flagged exactly one fixture
   the greps had not surfaced — an `observedRunId` key in a session-test `HrMax` literal
   (`tests/metrics.session.test.ts`). Fixed in the same commit; a nice concrete proof that the
   gate set is not ceremony.
6. **Commit 2 (`d41ed8a`):** removed `getRun` and `getPreviousReviewedRun` wholesale (bodies,
   doc comments, the two `tests/db.queries.reviewedOnly.test.ts` cases asserting their SQL),
   dropped the `asOf` option from `getObservedMaxHrRun` (its "three things it does" doc list
   became two), and dropped the `lte` import. The "the invariant is complete" rollup census
   comment in `lib/db/queries.ts` never listed either removed query — verified, no edit needed.
7. **Ran the full gate set** (see Appendix): typecheck clean; full vitest green after one flake
   chase; knip flags none of the removed symbols; eslint zero findings on all touched paths;
   `next build` skipped deliberately (Decisions).

## Code / Design Details

**`lib/metrics/hrMax.ts` before/after** — the file went from ~215 lines to 106, and the kept
surface is exactly the resolver the roadmap names:

```ts
// KEPT (live, tested, documented):        // REMOVED (zero prod callers):
export type HrMaxSource                     hrMaxTransitionAt(userId, runId)
export interface HrMax                      resolveHrMaxAsOf(userId, asOf)
export function tanakaEstimate              interface HrMaxTransition
export async function resolveHrMax          HrMax.observedRunId?            // written, never read
async function resolveFromProfile           resolveFromProfile's asOf param
```

The `HrMax` interface's change is the observedRunId removal plus a comment that now tells the
truth about who consumes the field:

```ts
   /**
-   * Only set when `source === 'observed'`: which run produced the reading, for the "your watch has
-   * seen X bpm" copy and for §4.5's transition detection.
+   * Only set when `source === 'observed'`: the day the reading came from, for the "from your run
+   * of X" attribution copy on the run detail page and /me.
    */
-  observedRunId?: string
   observedOn?: DateISO
```

The DOCUMENTED NON-GOAL block (kept — see Decisions) was reworded to stand alone without the
removed machinery's prose, and to record the removal with a resurrection pointer:

```ts
- * even when the bpm barely moves, and deserves the same announcement. F02 does not build that UI:
- * profile edits are rare and self-directed, unlike the passive "your watch saw a new peak" case
- * above, so the runner already knows. The resolver supports it for free if a later feature wants
- * it: compare `resolveHrMax` before and after the write.
+ * even when the bpm barely moves, and no UI announces it: the passive "your watch saw a new peak"
+ * banner (F06 §4.5) was planned but never shipped, and its detection machinery
+ * (`hrMaxTransitionAt` / `resolveHrMaxAsOf`) was removed on 2026-09-12 — the full contract lives
+ * in the F02 plan archive and in git history if a future feature ever resurrects it. ...
```

**The cascade commit in `lib/db/queries.ts`.** Two whole functions deleted — `getRun` (the
"one run, no children" read whose doc comment claimed a caller in F02's transition detection)
and `getPreviousReviewedRun` (the "reviewed run immediately before" read) — plus the options
bag of the surviving query losing its dead half:

```ts
 export async function getObservedMaxHrRun(
   userId: string,
-  options: { minBpm?: number; asOf?: DateISO } = {},
+  options: { minBpm?: number } = {},
 ): Promise<ObservedMaxHr | null> {
```

with the `asOf ? lte(runs.occurredOn, asOf) : undefined` predicate line and the `lte` import
going with it. `getObservedMaxHrRun` keeps its `runId` projection — that is provenance for the
live attribution copy, not §4.5 residue.

**The phantom.** `tests/metrics.session.test.ts` carried a false claim in its observed-first
rationale comment:

```ts
- * not conservatism, it is ignoring the evidence on screen. `resolveHrMaxExcludingRun` still ships,
- * for F09's `new_ceiling` badge — "did this beat the previous best" genuinely needs the previous
- * best — but never for a run's own metrics.
+ * not conservatism, it is ignoring the evidence on screen — the run's own max_hr feeds its own
+ * metrics, and there is no excluding variant: F09's `new_ceiling` compares records, not HRmax
+ * (it reads the recompute's `changed` set, never a resolver).
```

No function named `resolveHrMaxExcludingRun` has ever existed in the tree — a name invented by
an earlier summary, then believed. `new_ceiling` is fed by `lib/badges`' record recompute.

**Test census.** `tests/metrics.hrMax.test.ts` lost its `resolveHrMaxAsOf` cases ("sees only
what had happened by the cutoff", "adds a cutoff and changes nothing else") and its four
`hrMaxTransitionAt` cases; `tests/integration/hrMax.int.test.ts` lost its entire
"hrMaxTransitionAt — telling the runner when the denominator moved" describe block; the
surviving ladder case "2. an observation that EXCEEDS the estimate wins" was reworded from
"names the run it came from" to "carries the day it came from" (the run page copy reads the
*day*, and `HrMax` no longer carries the id); `tests/db.queries.reviewedOnly.test.ts` lost the
`asOf`-cutoff and `getPreviousReviewedRun` SQL cases.

**Doc reconciliation.** `docs/architecture.md`'s F02 as-built sentence now reads "the
never-shipped §4.5 transition banner (`hrMaxTransitionAt`/`resolveHrMaxAsOf`) was removed on
2026-09-12". `lib/metrics/.workflows/package_readme.md` replaced its "Known state (measured
2026-09-12, the yagni sweep)" deferral paragraph with a "Removed 2026-09-12" resolution
paragraph naming everything gone, dropped the `resolveHrMaxAsOf` line from the resolver
diagram, and corrected the module table's I/O cell from "4 indexed queries" to "2 indexed
queries". Historical records (docs/plans/archive/*, earlier session docs) deliberately
untouched, and the adopted plan copies under `.workflows/plan/` untouched — the memory rule
against rewording adopted copies.

## Decisions & Trade-offs
- **REMOVE, not SHIP.** YAGNI decides a decision that was explicitly deferred: the banner was
  never in a release, its machinery taxed every reader with a lying doc comment, and building
  a UI feature is a product decision no dead-code session should smuggle in. The removal is
  reversible by design — the full banner contract lives in the F02 plan archive and in git
  history, and the non-goal block says so.
- **Follow the cascade past the assignment's literal scope.** Commit 2 removes two exports the
  idea never named. Stopping at commit 1 would have left `getRun`/`getPreviousReviewedRun` as
  freshly-orphaned dead exports — turning one clean decision into a new knip finding. The
  verification-before-deleting requirement cuts both ways: it licenses the deletion *and*
  defines its true extent.
- **Keep `getObservedMaxHrRun`'s runId projection.** Trimming the query to
  `{ maxHr, occurredOn }` would shrink the projection to what `resolveFromProfile` reads today,
  but the query is live, tested, and its "names the run" contract is documented in two files;
  the churn is not justified by a field no one asked to remove. Declined as churn.
- **Reword, don't delete, the DOCUMENTED NON-GOAL block.** It records a real product ruling
  (no announcement when the runner switches observed→measured by typing a lab result — rare
  and self-directed) that outlives the removed banner machinery. Deleted, the next reader
  re-litigates it; reworded, it stands alone and carries the removal record.
- **Historical records are immutable; living docs are reconciled.** Plan archives and older
  session docs keep their original text (they are records of what was believed then);
  `architecture.md` and the package readme describe the tree *as it now is* and were updated.
  The adopted plan copies under `.workflows/plan/` are records too — untouched per the memory
  rule.
- **`next build` skipped on purpose; typegen + tsc + full vitest + knip is the gate set.** This
  worktree's `node_modules` is a symlink and Turbopack's build rejects it — the known
  environment artifact recorded on earlier sessions (vitest and tsc accept the symlink). The
  diff deletes caller-free code; there is no runtime shape for a build to catch that tsc
  cannot. Same call the same-day `insights-metrics-panel-yagni` session made and documented.
- **The full-suite flake was not attributed to the diff.** First `npx vitest run`: 2 failures
  in one component test ("The write failed. Try again." assertion). Re-run on the same tree:
  280 files / 5,228 tests all green. That is the reproduced-verdict protocol — the known
  MemoryTable-adjacent parallel-load flake does not survive a same-tree re-run, and a
  first-run red on a full sweep is not evidence about the diff until reproduced.
- **knip's three pre-existing flags were left as the backlog they already were.** A baseline
  provenance check confirmed all three (the `HrMaxSource` re-export at
  `lib/metrics/index.ts:14`; the `HrMax` + `HrMaxSource` re-exports at
  `lib/metrics/types.ts:21`) predate this session, sit on lines it never touched, and have
  consumers whose behavior this session verified unchanged. Removing them is a separate
  surface decision (they are the package's convenience re-export face), not part of this one.
- **Worker does not merge.** Coordinator `tokenmax-orch-2026-09-12` owns landing the day's
  branches; merging from a worker while siblings run is the concurrent-phase hazard this repo
  has documented repeatedly.

## Follow-ups & YAGNI notes
- **knip backlog, flagged not fixed:** the `HrMaxSource` re-export at
  `lib/metrics/index.ts:14` and the `HrMax`/`HrMaxSource` pair at `lib/metrics/types.ts:21` —
  the barrel still re-exports what `types.ts` already re-exports. A five-line diff for a future
  YAGNI session, deliberately not taken here (see Decisions).
- **If the transition banner is ever wanted back:** the resurrection path is written into the
  non-goal block — F02 plan archive for the full contract, git history for the machinery
  (revert-all-or-part of these two commits), and the resolver-side support costs nothing
  (compare `resolveHrMax` before and after the write). Do not rebuild it speculatively.
- **`WeekRunSummary` / `MonthRunSummary`** — the morning sweep's other recorded test-only
  finding — remain open, same resolution pattern available: a session whose scope includes
  `tests/fixtures` can move them into their fixtures or derive them from the metric
  functions' return types.
- **The integration suite stays skipped** per repo default (no `TEST_DATABASE_URL` anywhere in
  env, and the repo's one database is production). Its trimmed file is type-checked by tsc and
  collected by vitest, so the surviving cases still gate on every full run; the SQL-assertion
  cases are unit-side and stay green.
- **Method note for the next sweep:** the depth-3 cascade was found by asking "who calls the
  callers" *after* the zero-caller verdict, not by grepping harder for the original names. A
  one-round verification would have deleted exactly the assignment's named trio and minted two
  new dead exports. Budget for the cascade round; it is where the real diff lives.

## Appendix

**Commits (the branch's full content — base `a088491`, origin/main tip at session start):**
```
3964416 refactor(metrics): remove never-shipped F06 §4.5 HRmax transition machinery   (8 files, +35/−229)
d41ed8a refactor(db): drop the two HRmax queries orphaned by the F06 §4.5 removal     (2 files, +5/−80)
```

**Full diff stat (both commits combined):**
```
 docs/architecture.md                     |   5 +-
 lib/insights/load.ts                     |   6 +--
 lib/metrics/.workflows/package_readme.md |  27 +++++-----
 lib/metrics/hrMax.ts                     |  92 ++++------------------------
 lib/metrics/index.ts                     |   3 --
 lib/db/queries.ts                        |  54 ++++------------------
 tests/db.queries.reviewedOnly.test.ts    |  31 -----------
 tests/integration/hrMax.int.test.ts      |  47 +--------------
 tests/metrics.hrMax.test.ts              |  77 +-----------------------
 tests/metrics.session.test.ts            |   7 ++-
 10 files changed, 40 insertions(+), 309 deletions(-)
```

**Removed, complete list:**
`lib/metrics/hrMax.ts`: `hrMaxTransitionAt`, `resolveHrMaxAsOf`, `HrMaxTransition`,
`HrMax.observedRunId`, the `asOf` parameter on `resolveFromProfile`, the false "calls it once
per render" comment.
`lib/metrics/index.ts`: the `hrMaxTransitionAt` / `resolveHrMaxAsOf` / `HrMaxTransition`
re-export lines.
`lib/db/queries.ts`: `getRun`, `getPreviousReviewedRun`, the `asOf` option on
`getObservedMaxHrRun`, the `lte` drizzle import.
Docs: the package readme's "Known state" deferral replaced by a removal record;
architecture.md's F02 as-built line; the session-test phantom
`resolveHrMaxExcludingRun` claim.

**Kept, verified live:** `resolveHrMax`, `tanakaEstimate`, `HrMax`, `HrMaxSource`,
`getObservedMaxHrRun` (runId projection intact) — callers: `/me`, the insights loaders,
`lib/nina/load.ts`, the run page.

**Verification commands run:**
```
npm run typecheck          # next typegen + tsc --noEmit — clean (caught the observedRunId fixture)
npx vitest run             # run 1: 2 failures in one component test (known parallel-load flake)
                           # run 2, same tree: 280 files / 5,228 tests — ALL green
npm run knip               # zero flags for any removed symbol; nothing half-dead left behind
                           # 3 pre-existing HrMax re-export flags — proven pre-existing, left as backlog
eslint <all touched paths> # zero findings
# next build skipped: symlink node_modules vs Turbopack (known artifact; tsc+vitest+knip cover a deletion diff)
# integration suite: stays skipped per repo default (no TEST_DATABASE_URL); type-checked + collected
# no production-DB contact: none needed, none made
```
Post-removal residue check (this doc's author, from the committed tree): word-boundary greps
for all five removed names hit only the two deliberate "was removed on 2026-09-12" doc mentions
(`hrMax.ts`'s non-goal block, `docs/architecture.md`) once archives and plan copies are
excluded — no code, no test, no prose asserts the old state.

**Method references:** the `dead-export-sweep-verifier-traps` memory (prose-vs-import
classification, twin names, barrel paths, self-licking test seams); the
`memorytable-addrow-flakes-under-parallel-load` reproduced-verdict protocol for the flake;
`adopted-plan-copies-trip-string-guards` for leaving `.workflows/plan/` alone. Direct
predecessors: `2026-09-12-insights-metrics-panel-yagni.md` (recorded the decision this session
resolved), `2026-09-11-lib-db-queries-yagni.md` (the earlier `lib/db` sweep that left these two
queries standing).
