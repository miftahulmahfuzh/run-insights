# Token-Maxxing Session — 2026-09-12: Insights/Metrics/Panel Dead-Exports Sweep

## 🎯 Achievement / End Result
- **Goal of the burn:** Hunt and remove dead code — at symbol level, not file level —
  across the four dashboard-layer packages the 2026-09-11 dead-code campaign never
  reached: `lib/insights`, `components/insights`, `lib/metrics`, and `lib/panel`.
  Assigned as a worker idea by the day's parallel coordinator `tokenmax-orch-2026-09-12`,
  with three hard constraints, all honored: **strictly the four dirs**, **no
  `package_readme.md` touched**, and **no production DB contact**.
- **Concrete changes:** One commit — `7f07c41` "refactor(metrics,insights,panel): drop 10
  dead exports found by symbol-level YAGNI sweep" — 9 files, **+11/−16**. Ten exported
  symbols with zero importers anywhere in the repo were un-exported (every one keeps its
  in-file uses; only the export surface went), plus the 5 barrel re-export lines that
  advertised them from `lib/metrics/index.ts`, plus one stale comment corrected:
  - `components/insights/InsightCard.tsx` — `readInsightPayload` (the card's
    payload-parsing helper; InsightCard is its only consumer).
  - `lib/insights/actions.ts` — `EnsureInsightResult` (interface; action return shape,
    consumed structurally).
  - `lib/insights/load.ts` — `dominantBucket`, `getPreviousInsight` (module-internal
    helpers that had drifted to exported).
  - `lib/metrics/flags.ts` — `FlagSeverity`; `lib/metrics/month.ts` — `PaceComparison`,
    `MonthMetrics`; `lib/metrics/types.ts` — `RecoveryInput`; `lib/metrics/week.ts` —
    `WeekMetrics`.
  - `lib/panel/param.ts` — `PanelKind`, plus its stale "record arrives with #25" comment
    fixed (issue #25 shipped).
  - `lib/metrics/index.ts` — the 5 corresponding `export type { … }` re-export lines
    dropped from the barrel.
- **Real value delivered:**
  - The four untouched dashboard packages are now **measured clean**: a TypeScript
    compiler-API import-graph inventory over all **705 repo modules** (exports per file,
    resolved named/default/namespace imports, barrel re-export edges, same-file usage
    counts, dynamic `import()`/`require()` refs) found exactly 10 dead exports, all of
    them now gone. A post-edit re-inventory reports **zero dead exports remaining** in
    the four dirs.
  - The debt was **all in the export surface, not inside files** — a clean-tree
    `tsc --noUnusedLocals --noUnusedParameters` baseline was already silent on all four
    dirs. The packages were internally tight; nothing was deleted, nothing was
    restructured, and no behavior changed by construction.
  - The verifier caught **a real bug in itself** mid-run — a barrel BFS traversing
    forward through a module's own re-exports instead of backward through files that
    re-export *from* it, which missed every barrel-mediated caller and false-flagged
    three live symbols (`ACWR_OUT_OF_RANGE`, `VOLUME_JUMP`, `Acwr`) as dead. The
    word-boundary grep cross-check caught the discrepancy before any edit; the finding
    extends the repo's dead-export-sweep-verifier-traps memory with a fifth trap class
    (wrong-direction graph traversal).
  - Three **recorded-but-unremovable findings** with receipts: the `hrMax` transition
    machinery (`hrMaxTransitionAt`, `resolveHrMaxAsOf`, `HrMaxTransition`) has **zero
    production callers** — the F06 §4.5 HRmax transition banner was planned and
    documented but never shipped, and the code is kept alive only by
    `tests/metrics.hrMax.test.ts` and `tests/integration/hrMax.int.test.ts`, its own doc
    comment falsely claiming "F06's run detail page calls it once per render"; and
    `WeekRunSummary`/`MonthRunSummary` are imported only by test fixtures. Both are
    flagged for a future session whose scope may touch `tests/`.
- **Branch:** `token-maxxing-2026-09-12-insights-metrics-panel-yagni` (worktree session;
  single commit `7f07c41` on base `4fe9d01`).
- **Merge status:** on branch — **NOT merged, deliberately**. Coordinator
  `tokenmax-orch-2026-09-12` owns landing all of the day's worker branches; this session
  does not merge its own work.
- **Approx token burn:** the defining asymmetry again, one notch heavier than the
  `lib/admin` audit — a 705-module compiler-API graph built and then debugged (the BFS
  bug), a positive control planted and cleared, every candidate cross-validated against
  greps, and the full gate set including all 5,093 tests — all to justify a
  16-deletion, 11-insertion diff. 🔥🔥🔥

## Context & Motivation
The 2026-09-11 dead-code campaign covered `app/` plus six component families
(`components-dead-code-a`: `ui`/`charts`/`review`/`profile`/`share`/`trends` +
`app/`; `components-dead-code-b`: `extract`/`auth`/`push`/`runs`/`insights` +
`lib/derived/`) and the two largest `lib/admin` files — and explicitly did not reach the
dashboard layer. `lib/insights`, `components/insights`, `lib/metrics`, and `lib/panel`
were the untouched remains: **16 source files, 2,123 lines** as measured at doc-writing
time (the coordinator's menu framed it as ~2.4k lines / 19 files; either way the point
stood). That size is exactly why the idea won the menu: small enough that a
symbol-level hunt over every export in all four packages is tractable in one session,
unlike a sweep over a 200-module package.

The second menu argument was independence. The 2026-09-11 sweep had established that
this package family's dead code, where it exists, is keyword-level (un-export, don't
delete) — removals that are individually safe and order-independent. That meant no
`/analyze` planning machinery was needed: the escalation criterion was pre-declared on
the menu (plan formally **only if** the candidates turned out to form one large
interdependent set), and they did not — 10 independent export-keyword drops, one commit.

Constraints were fixed by the assignment: strictly the four dirs; no
`package_readme.md` (a constraint the day needed after the readme-compaction workers
were running in parallel); no production DB contact (a read-only-code session needs no
database, and the repo's one database is production). All three held — the diff touches
exactly the 9 files inside the four dirs, none of the four dirs contains a
`package_readme.md` at all, and no DB client was opened.

Method came straight from the `dead-export-sweep-verifier-traps` memory: twin names,
relative imports, barrel re-exports, and multiline import lists each flip a
keep/remove verdict, so the prescription is TS-API extraction + line classification + a
positive control, not greps. This session built that verifier in full — and then the
verifier needed its own verifier.

## What We Did (blow-by-blow)
1. **Built the import-graph inventory.** A TypeScript compiler-API pass over all **705
   repo modules** recorded, per target file: every export, every resolved import
   (named / default / namespace), every barrel re-export edge, same-file usage counts
   for each exported symbol, and every dynamic `import()` / `require()` reference. This
   is the layer greps cannot provide: namespace imports, `export * from` chains, and
   multiline named-import lists are all resolved structurally rather than pattern-matched.
2. **Ran the first pass — and the verifier failed.** The naive expectation was that
   barrel-mediated liveness is found by walking the barrel graph outward from a module.
   The first implementation BFS'd **forward through the source module's own re-exports**
   instead of **backward through the files that re-export from it**, so every caller
   that reached these modules via `@/lib/metrics`' barrel was invisible to liveness.
   Three genuinely live symbols false-flagged dead: `ACWR_OUT_OF_RANGE`, `VOLUME_JUMP`,
   `Acwr` — all real, all imported elsewhere via the barrel.
3. **The grep cross-check caught it.** Every candidate from the graph was
   word-boundary-grep'd before any edit (the prescription's second half), and those
   three symbols had live importer hits the graph had missed. Discrepancy → the BFS was
   reversed to walk reverse edges (who re-exports *me*), and the graph and grep results
   were reconciled per symbol. Only symbols dead under **both** measurements survived to
   the edit list.
4. **Positive control.** A scratch symbol `ZZZ_DEAD_SCRATCH` was planted behind both a
   direct export and a barrel re-export line and the verifier run against it: it
   flagged **both** entries, proving the fixed barrel traversal and the named-import
   resolution both work end-to-end. The scratch symbol was removed and the tree verified
   clean afterward.
5. **Un-exported the 10 confirmed-dead symbols.** Every one keeps its in-file uses —
   `readInsightPayload` still parses inside `InsightCard`, `dominantBucket` still ranks
   inside `load.ts`, the six metric types still shape their own modules' signatures —
   only the `export` keyword and the 5 barrel lines went. `PanelKind`'s drop came with
   its comment corrected: the "record arrives with #25" note described a future arrival
   that has since shipped.
6. **Re-ran the inventory on the edited tree:** zero dead exports remain across the
   four dirs — the sweep is closed, not merely interrupted.
7. **Ran the full gate set** (see Appendix): `npm run typecheck` (next typegen + tsc
   --noEmit) clean; eslint zero findings in the four dirs; full vitest **265 files /
   5,093 tests** green. `next build` was intentionally skipped — see Decisions.

## Code / Design Details

**The shape of the diff** — every code change is one of three moves:

```ts
// Move 1: function keeps its body, loses its export (readInsightPayload, dominantBucket,
// getPreviousInsight — 3 of the 10)
-export function readInsightPayload(payload: unknown): InsightPayloadish | null {
+function readInsightPayload(payload: unknown): InsightPayloadish | null {

// Move 2: type/interface likewise (EnsureInsightResult, FlagSeverity, PaceComparison,
// MonthMetrics, RecoveryInput, WeekMetrics — 6 of the 10)
-export type FlagSeverity = 'info' | 'warn'
+type FlagSeverity = 'info' | 'warn'

// Move 3: the barrel line advertising it goes (5 lines in lib/metrics/index.ts)
 export type {
   FastestSlowestKm,
-  RecoveryInput,
   SessionInput,
```

plus one comment-only fix in `lib/panel/param.ts` (`PanelKind`'s "record arrives with
#25" — #25 shipped, so the future tense was false).

**Why the barrel bug mattered, concretely.** `lib/metrics` is consumed through
`lib/metrics/index.ts` far more often than through direct file imports. A liveness check
that resolves only direct file edges therefore sees a module as unimported even while
the barrel carries its symbols to half the app. Forward-vs-backward is the difference:
"what does this module re-export" (useless — the module's own face) vs. "which files
re-export *from* this module" (the paths by which its symbols actually travel). The
three false-flagged names were the tripwire: `ACWR_OUT_OF_RANGE`, `VOLUME_JUMP`, and
`Acwr` are all exported from leaf modules and re-exported through the barrel, and all
three have real importers. A session that had trusted the first pass would have deleted
live ACWR constants — a behavior change hidden inside a "dead code" diff.

**The four-dir census (measured 2026-09-12):**

| Dir | Files | Dead exports found |
|---|---|---|
| `lib/insights` | 2 (`actions.ts`, `load.ts`) | `EnsureInsightResult`, `dominantBucket`, `getPreviousInsight` |
| `components/insights` | 2 (`InsightCard.tsx`, `InsightTrigger.tsx`) | `readInsightPayload` |
| `lib/metrics` | 12 (`week`, `pace`, `acwr`, `flags`, `hrMax`, `month`, `age`, `round`, `types`, `index`, `session`) | `FlagSeverity`, `PaceComparison`, `MonthMetrics`, `RecoveryInput`, `WeekMetrics` (+5 barrel lines) |
| `lib/panel` | 1 (`param.ts`) | `PanelKind` |

16 files / 2,123 lines total; 9 files needed touching (the other 7 had a fully live
surface); zero test files exist inside the four dirs — their suites live centrally under
`tests/`, which is what pins the recorded findings below out of scope.

**The recorded-but-unremovable findings.** The sweep's honest residue — dead by the
same measurement, but their only consumers are tests, and `tests/` is outside the
assigned four dirs:

- **`hrMaxTransitionAt`, `resolveHrMaxAsOf`, `HrMaxTransition`** (`lib/metrics/hrMax.ts`)
  — zero production callers, verified: no `import` anywhere outside `lib/metrics` names
  any of the three (the word-boundary hits in `lib/db/queries.ts` and
  `lib/insights/load.ts` are all comment prose — "F02's `hrMaxTransitionAt` wants
  `occurred_on`" — exactly the code-vs-prose classification the method exists for).
  The F06 §4.5 HRmax transition banner was planned and documented but never shipped;
  the trio is kept alive only by `tests/metrics.hrMax.test.ts` and
  `tests/integration/hrMax.int.test.ts`. And `hrMax.ts`'s own doc comment still claims
  "F06's run detail page calls it once per render" — false as of this measurement.
- **`WeekRunSummary`, `MonthRunSummary`** — imported only by
  `tests/fixtures/syntheticWeek.ts` and `tests/fixtures/syntheticMonth.ts`; production
  code consumes the metrics functions' return types structurally, never these names.

## Decisions & Trade-offs
- **Do not merge; the coordinator owns landing.** Worker session in a parallel set
  (`tokenmax-orch-2026-09-12` is landing several same-day branches, several of them the
  readme-compaction campaign). Merging from a worker while siblings run is the
  concurrent-phase hazard this repo has been burned by repeatedly. Contract: commit to
  the worker branch, document, report.
- **Un-export rather than delete, uniformly.** All 10 symbols are their files' internal
  vocabulary. Deleting `dominantBucket` would mean inlining a bucket-ranking loop;
  deleting `FlagSeverity` would mean spelling `'info' | 'warn'` at each use site. The
  keyword drop achieves the goal — a shrunk importable surface — with zero mechanical
  risk, and it keeps the diff reviewable as "nothing but `export` words and 5 barrel
  lines."
- **Tests count as callers — except when the constraint says otherwise.** The default
  rule from prior sweeps is that test-only exports stay. Here the *assignment* drew the
  boundary at the four dirs, so the test-only findings (`hrMax` trio, the two summary
  types) were recorded with their full evidence instead of acted on: removing them
  means removing or rewriting their suites, which is a coverage decision owned by a
  session whose scope includes `tests/`.
- **Grep cross-check mandatory before any edit — this session is the proof.** The graph
  alone was wrong (wrong-direction BFS); the greps alone are wrong (prose mentions,
  twin names); neither alone was trusted. Every edit-list survivor was dead under both.
  The positive control (`ZZZ_DEAD_SCRATCH` behind a direct export AND a barrel line,
  both entries flagged) then proved the fixed verifier end-to-end before real edits.
- **`next build` skipped on purpose; typegen + tsc + the full suite is the gate set.**
  This worktree's `node_modules` is a symlink and Turbopack's build rejects it — a
  known environment artifact recorded on earlier sessions (a real install passes where
  the symlink fails; `vitest` and `tsc` accept the symlink). Since the diff is
  export-keyword-only, there is no runtime shape for a build to catch that tsc cannot;
  spending a real `npm install` to unblock a build of an 11/16-line diff was declined.
- **No `package_readme.md` reconciliation debt.** The constraint said don't touch them;
  as measured, none of the four dirs has one at all — so unlike the `lib/admin` sweep
  (which left stale export lines behind in its readme), this sweep leaves zero doc drift.

## Follow-ups & YAGNI notes
- **The `hrMax` transition banner is the real decision, and it's still open.** Either
  ship F06 §4.5 (the code is sitting there tested and waiting) or hold a `tests/`-scoped
  session that removes `hrMaxTransitionAt`, `resolveHrMaxAsOf`, `HrMaxTransition`, their
  two suites, and the false "F06's run detail page calls it once per render" doc comment.
  Neither half is a drive-by. Until then the comment lies to every reader of
  `lib/metrics/hrMax.ts`.
- **`WeekRunSummary`/`MonthRunSummary`** could move into the fixtures that use them (or
  the fixtures could derive from the functions' return types) — a `tests/fixtures`
  scoped cleanup, same future session as above if it happens.
- **The verifier was session-scratch** (the commit touches only the 9 target files) and
  died with the session. The wrong-direction-BFS bug is now the recorded lesson; if a
  future sweep rebuilds the tool, start from reverse-edge barrel traversal and keep the
  grep-reconciliation step non-optional. Making it a committed, reusable repo script
  remains YAGNI until a fourth sweep wants it — but three sweeps in two days is starting
  to argue for it.
- **Escalation criterion never fired:** candidates were 10 independent keyword drops,
  not an interdependent set, so no `/analyze` plan was minted. The same criterion holds
  for any future single-package sweep of this shape.
- **Not extended to neighboring packages.** `lib/derived/`, `lib/charts/`,
  `components/runs/` and friends were covered on 2026-09-11; `lib/panel`'s single file
  and the insights pair are now covered; nothing else was in scope and nothing else was
  started.

## Appendix

**Commit (the branch's one commit):**
```
7f07c41 refactor(metrics,insights,panel): drop 10 dead exports found by symbol-level YAGNI sweep
```
Base: `4fe9d01` (`merge: token-maxxing session pkg-readme-lib-db`). One commit ahead;
diff touches exactly the 9 files inside the four assigned dirs.

**Full diff stat:**
```
 components/insights/InsightCard.tsx | 2 +-
 lib/insights/actions.ts             | 2 +-
 lib/insights/load.ts                | 4 ++--
 lib/metrics/flags.ts                | 2 +-
 lib/metrics/index.ts                | 5 -----
 lib/metrics/month.ts                | 4 ++--
 lib/metrics/types.ts                | 2 +-
 lib/metrics/week.ts                 | 2 +-
 lib/panel/param.ts                  | 4 ++--
 9 files changed, 11 insertions(+), 16 deletions(-)
```

**The 10 un-exported symbols, complete list:**
`components/insights`: `readInsightPayload`.
`lib/insights`: `EnsureInsightResult`, `dominantBucket`, `getPreviousInsight`.
`lib/metrics`: `FlagSeverity`, `PaceComparison`, `MonthMetrics`, `RecoveryInput`,
`WeekMetrics` (+ the 5 corresponding re-export lines in `lib/metrics/index.ts`).
`lib/panel`: `PanelKind`.

**Verification commands run:**
```
npm run typecheck                    # next typegen + tsc --noEmit — clean
eslint lib/insights components/insights lib/metrics lib/panel   # zero findings
npx vitest run                       # 265 files / 5,093 tests — all passing
# inventory re-run post-edit: zero dead exports remaining in the four dirs
# tsc --noUnusedLocals --noUnusedParameters clean-tree baseline: already silent on all four dirs
```
The 4 eslint errors elsewhere (components/nina and components/ui test files) were proven
pre-existing by a git-stash re-lint before any of this session's edits — not caused, not
fixed (out of scope), not hidden.

**Recorded findings' evidence:**
```
grep -rn "hrMaxTransitionAt|resolveHrMaxAsOf|HrMaxTransition"  → importers:
  tests/metrics.hrMax.test.ts, tests/integration/hrMax.int.test.ts  (only)
  lib/db/queries.ts + lib/insights/load.ts hits = comment prose, not imports
grep -rln "WeekRunSummary|MonthRunSummary" →
  lib/metrics/{week,month,index}.ts (home + barrel) + tests/fixtures/synthetic{Week,Month}.ts
```

**Method references:** the `dead-export-sweep-verifier-traps` memory (TS-API extraction +
line classification + positive control), extended this session with the fifth trap —
barrel traversal direction. Same-day predecessors: `2026-09-11-components-dead-code-a.md`,
`2026-09-11-components-dead-code-b.md`, `2026-09-11-lib-admin-dead-exports.md`,
`2026-09-11-lib-nina-queries-yagni.md`.
