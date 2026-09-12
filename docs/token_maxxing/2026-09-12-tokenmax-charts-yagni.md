# Token-Maxxing Session — 2026-09-12: Charts Dead-Code Sweep (YAGNI)

## 🎯 Achievement / End Result
- **Goal of the burn:** A WORKER session (slug `tokenmax-charts-yagni`) pre-assigned one idea
  by the coordinator (`tokenmax-orch-2026-09-12`): *"Hunt and remove dead code in `lib/charts`
  and `components/charts`. Why: untouched charting feature pair, never swept."* Constraint:
  stay strictly within `lib/charts` and `components/charts`; do not touch any
  `package_readme.md` or the production DB.
- **Concrete changes:** 8 files, +33/−35, across 2 commits — `4dd4abe` (the lib side:
  `lib/charts/{index,paceHr,paceTrend,volumeTrend,window,zoneDrift}.ts`) and `c0f0cff` (the
  components side: `components/charts/{ChartFrame,PaceTrendChartInner}.tsx`). Zero behavior
  change; rendered output identical everywhere.
- **Real value delivered:**
  - **The honest headline: the sweep found remarkably little, and said so.** The charting
    pair is young (landed as feat(f08), one refinement in feat(f20)) and turned out genuinely
    clean — no dead files, no dead components, no dead CSS. Every selector in `charts.css`
    has an emitter (`ri-zone-1..5` are emitted via a template literal, so the naive grep
    would have called them dead). The value is the verified negative plus the 7 real removals,
    not a large haul.
  - **Removals that shrank the API surface to what callers actually use:**
    - Barrel (`lib/charts/index.ts`): dropped the `TrendWeek`, `PaceTrendLine`,
      `TREND_WEEKS` re-exports — no file outside `lib/charts` imports any of them
      (`TREND_WEEKS`'s sibling importers go through `./volumeTrend` directly).
    - `window.ts` / `paceTrend.ts`: unexported the `TrendWeek` and `PaceTrendLine`
      interfaces — they live on as return types consumed by inference; no consumer names
      them.
    - `paceHr.ts`: folded the never-varied `padSec` (=20) / `padBpm` (=10) parameters and
      `kmAxisTicks`' `maxLabels` parameter into constants — no caller in production or tests
      ever passed them, and the files' own doc comments argue the values are *fixed policy*
      ("a constant, never a percentage"; "measured rather than chosen").
    - `volumeTrend` / `zoneDrift` / `paceTrend`: dropped the `weeks = TREND_WEEKS` valve on
      `toVolumeTrend` / `toZoneDrift` / `toPaceTrendPoints` — the shared 12-week window is
      the stated cross-chart invariant, so the parameter that allowed divergence was
      speculative API.
    - `ChartFrame`: removed the `tableSummary` prop (no caller overrode the `'Table view'`
      default; it is now the literal) and the `className` prop (no caller passed it).
    - `LegendKey`: removed the `'dashed'` variant — a dead union member plus its dead
      `strokeDasharray` branch; only `'line'` and `'bar'` are used.
    - `PaceTrendChartInner`: `showTrendLine` is now **required** — its only caller
      (`PaceTrendChart`) always passes the §9 gate (`allowTrendLine`), so the default-true
      fallback never fired.
  - **Scope-blocked finds recorded for the future** (the task forbids files outside the two
    dirs, so they were verified and documented, not touched): `zoneTotalSec` and
    `monthWeekBucketRanges` are production-dead — each imported ONLY by its test file.
  - **Verification method:** repo-wide word-boundary sweep of all 45 exported symbols,
    classified per-consumer with a positive control (known-live exports correctly showed
    their page consumers), then the full gate stack: typegen + `tsc --noEmit` clean, eslint
    clean, prettier clean on all 8 changed files, `scripts/check-f08-boundaries.mjs` passed
    (449 files), and vitest **116/116** across the 8 consumer test files. DB-touching tests
    deliberately not run (the repo's single database is production).
  - **Two twin-name traps caught before they drove a wrong removal** — a live consumer
    (`SplitsTable` reading `timeSec`) and a different-purpose duplicate (`BUCKET_ORDER` in
    `lib/insights/load.ts`) each looked dead on a naive grep and are alive.
- **Branch:** `token-maxxing-2026-09-12-charts-yagni`
- **Merge status:** merged (commit `a9a4c24`)
- **Approx token burn:** moderate (est. ~0.5M, input-dominated) — the burn went into the
  45-symbol per-consumer classification sweep, full-file reads of every chart module to
  separate callers from prose mentions, the twin-name disambiguation greps, and the gate
  stack. The low removal count is the finding, not a slack indicator. 🔥

## Context & Motivation
The 2026-09-12 token-maxxing day ran as an orchestrated fan-out: a coordinator session
(`tokenmax-orch-2026-09-12`) spawning worker sessions on per-session branches, each handed a
pre-assigned idea. This worker drew the charting pair — `lib/charts/` (12 files: the
computation layer behind the run page's five charts) and `components/charts/` (the React
rendering layer).

The idea's premise: every other meaningful directory had been swept by now (`components/`
dead-code sweeps a/b and `lib/admin` dead-exports on 2026-09-11, `lib/db/queries.ts` YAGNI,
`lib/nina` queries), but the charting pair had never been touched by one. It landed as
feat(f08) — "the charts" plan — with one refinement pass in feat(f20), so it is among the
youngest production code in the repo. The sweep was therefore a test of a different
hypothesis than the prior sweeps: not "old accreted code has rotted" but "even young code
carries speculative API written for callers that never arrived."

The constraints mattered: `package_readme.md` files were off-limits (the same day ran six
readme-compaction workers — touching one would have collided), and the production DB was
off-limits (there is only one database — "dev" is production — so the DB-touching test files
in the consumer set were deliberately excluded from the vitest run).

## What We Did (blow-by-blow)
1. **Enumerated the full export surface.** All 45 exported symbols across both directories
   were listed (functions, constants, interfaces/types, and the barrel's re-exports), so the
   sweep would be exhaustive rather than suspicion-driven.
2. **Swept each symbol repo-wide with word-boundary greps and classified every hit.** Each
   consumer hit was read in context: real import site vs. comment prose vs. local variable
   vs. unrelated identically-named thing. A positive control kept the method honest —
   known-live exports correctly surfaced their page consumers — so a silent sweep bug
   couldn't manufacture dead symbols. Barrel re-exports and template-literal CSS emitters
   were checked for specifically (the classic false-positive sources).
3. **Confirmed the honest result: no dead files, no dead components, no dead CSS.** Every
   selector in `charts.css` has an emitter — `ri-zone-1..5` are emitted via a template
   literal, so a naive grep for each literal selector would have misfiled all five as dead.
   Every file in both directories is imported; every component is rendered.
4. **Removed the verified-dead surface in two commits:**
   - `4dd4abe` (lib): barrel re-exports (`TrendWeek`, `PaceTrendLine`, `TREND_WEEKS`), the
     two interface `export` keywords (`TrendWeek` in `window.ts`, `PaceTrendLine` in
     `paceTrend.ts`), the never-varied `padSec`/`padBpm`/`maxLabels` parameters in
     `paceHr.ts` (each folded into a named constant with a comment stating the policy
     argument), and the `weeks = TREND_WEEKS` valve on all three 12-week transforms.
   - `c0f0cff` (components): `ChartFrame`'s `tableSummary` and `className` props,
     `LegendKey`'s `'dashed'` variant (union member + `strokeDasharray` branch), and
     `showTrendLine`'s default (`= true` → required, with a doc comment naming the §9 gate
     as the outer's decision).
5. **Verified the scope-blocked finds before leaving them.** `zoneTotalSec` is
   production-dead: imported ONLY by `tests/charts.zones.test.ts`. Its doc comment claims it
   is "exported so a caller can test it for zero", but every would-be caller computes its own
   local sum instead (`lib/insights/load.ts:491`, `lib/metrics/week.ts:121`,
   `lib/metrics/session.ts:76`). Same pattern for `monthWeekBucketRanges` — production-
   internal, barrel-imported only by `tests/charts.weeksInMonth.test.ts`. Both are outside
   the allowed files, so they were recorded, not removed.
6. **Checked the suspicious-looking "dead" things that turned out alive:**
   - `PaceHrPoint.timeSec` looked dead — its own comment says it is "deliberately NOT
     rendered" — but `components/ui/SplitsTable.tsx:154` reads it. Verified live before
     leaving alone. (A naive "no chart renders it" pass would have deleted the field.)
   - The `zoneTotalSec` external grep hits were all local variables in `lib/metrics` and
     `lib/insights`, not importers.
   - The `ZONES` hits in `tools/*.py` and `scripts/gen-og-default.mjs` are unrelated
     Python/OG constants that happen to share the name.
   - `lib/insights/load.ts:142` defines its OWN `BUCKET_ORDER`
     (`['10k','5k','half','full','other']`) — different order, different purpose from
     `lib/charts`' chip-row order. Confirmed twice; not a duplicate to prune.
7. **Ran the full gate stack:** `next typegen` + `npx tsc --noEmit` exit 0; eslint clean;
   prettier clean on all 8 changed files; `scripts/check-f08-boundaries.mjs` passed
   (449 files — the f08 feature-boundary guard, relevant because the sweep changed the
   barrel's surface); and vitest **116/116** across the 8 consumer test files
   (`tests/charts.{paceHr,trends,weeksInMonth,zones}.test.ts`, `tests/views.render.test.ts`,
   `tests/share.bundle.test.ts`, `components/ui/SplitsTable.test.tsx`,
   `components/ui/ZoneBar.test.tsx`). DB-touching tests deliberately not run — the repo has
   one database and it is production.
8. **Committed** `4dd4abe` + `c0f0cff` on the worker branch and stopped — no merge, no push;
   the coordinator lands worker branches.

## Code / Design Details

**The valve removal, before/after** (`lib/charts/volumeTrend.ts`; the same shape landed in
`zoneDrift.ts` and `paceTrend.ts`):

```ts
// before — a parameter whose only lawful value is the default
export function toVolumeTrend(
  runs: readonly ChartRun[],
  anchorISO: DateISO,
  weeks = TREND_WEEKS,
): VolumeTrendPoint[] {
  const window = lastIsoWeeks(anchorISO, weeks)
  ...

// after — the shared window is the invariant, so the parameter is gone
export function toVolumeTrend(runs: readonly ChartRun[], anchorISO: DateISO): VolumeTrendPoint[] {
  const window = lastIsoWeeks(anchorISO, TREND_WEEKS)
```
The reasoning, as recorded in the code: the three trend charts sharing one 12-week window is
the *stated cross-chart invariant* — a reader comparing the volume, zone-drift, and pace
charts must be looking at the same weeks. A parameter that lets one chart diverge was API
for a requirement nobody has.

**Policy params folded into constants** (`lib/charts/paceHr.ts`):

```ts
export function paceDomain(points: readonly PaceHrPoint[]): [number, number] | null {
  // A constant, not a parameter: the pad is policy (the anti-drama rule above), and policy is not
  // per-call tunable. No caller ever varied it.
  const padSec = 20
  ...
```
The files' own doc comments supplied the argument: the pads implement the §12 anti-drama
waiver ("a constant, never a percentage"; the axis must not "expand with a run's own
variance"), and policy is not per-call tunable. The `maxLabels` param on `kmAxisTicks` fell
the same way — the stride ladder is computed against `MAX_AXIS_LABELS` directly now.

**Interface un-exports:** `TrendWeek` and `PaceTrendLine` keep their shapes and their doc
comments; they are simply no longer `export`ed (and no longer re-exported by the barrel).
`paceTrendLine`'s return type is still `PaceTrendLine` — both chart components consume it by
inference, and no consumer names the type.

**`ChartFrame`'s prop shedding** (`components/charts/ChartFrame.tsx`): `tableSummary` lost
its default-and-prop pair and became the literal `Table view` in the `<summary>`; `className`
was removed and the `<Card className="p-5">` is fixed — the card padding is the frame's own,
not per-call. Same file hosts `LegendKey`, whose `'dashed'` variant (a dead union member
plus the dead `strokeDasharray` branch) is gone; the union is now `'line' | 'bar'`.

**Required-ness promoted** (`components/charts/PaceTrendChartInner.tsx`):

```tsx
showTrendLine,            // was: showTrendLine = true
...
/** Required: the §9 gate is the outer's decision (`allowTrendLine`), never the inner's default. */
showTrendLine: boolean    // was: showTrendLine?: boolean
```
Its only caller, `PaceTrendChart`, always passes the §9 gate — the default-true fallback
never fired, and a default that silently *enables* a trend line is the wrong default for a
gate the outer owns.

## Decisions & Trade-offs
- **Record the honest negative as the headline.** A sweep of young code that finds little
  has a failure mode: inventing marginal removals to justify the burn. The doc and both
  commit messages state plainly that the pair is clean — no dead files, components, or CSS —
  and the 7 real removals are individually argued. The verified negative is itself
  deliverable: the next sweep of this pair starts knowing the floor.
- **Scope discipline held where it hurt.** `zoneTotalSec` and `monthWeekBucketRanges` are
  genuinely dead in production and the temptation was to "just also fix the two test
  imports" — but the assignment forbade files outside the two directories, and test files
  live in `tests/`. They are verified, located (file:line for every would-be caller), and
  written down instead of half-fixed. A rule violated for a 2-line win stops being a rule.
- **Un-export rather than delete when the shape is consumed by inference.** `TrendWeek` and
  `PaceTrendLine` still exist as the return types of live functions; deleting them would
  have meant restructuring working inference. The minimal correct edit is dropping the
  `export` keyword, which shrinks the *advertised* surface (what the barrel offers) without
  touching the working surface.
- **Fold never-varied params into commented constants rather than inlining the literals.**
  `const padSec = 20` with the policy comment preserves the name and the reasoning at the
  use site; inlining `20` at three arithmetic sites would have deleted the "why" that the
  parameter's default value was silently carrying.
- **Treat "looks dead" as a question, not a verdict.** Three separate look-dead things were
  investigated and kept: `timeSec` (read by SplitsTable), the local `zoneTotalSec`
  variables (locals, not imports), and the Python/OG `ZONES` constants (unrelated names).
  Each would have been a wrong deletion on grep-confidence alone — and the twin-name trap
  (`BUCKET_ORDER` defined twice with different contents) is exactly the pattern the
  dead-export-sweep memory warns about, confirmed twice in one session.
- **Excluded DB tests knowingly.** The consumer test set minus the DB-touching files ran
  116/116. Running the excluded ones would have written to the one database, which is
  production. The scope of the diff (no data-layer change) made the risk of the exclusion
  negligible.

## Follow-ups & YAGNI notes
- **The two test-only exports are the obvious next prune if `tests/` ever enters scope:**
  `zoneTotalSec` (`lib/charts/zones.ts` — imported only by `tests/charts.zones.test.ts`;
  would-be callers at `lib/insights/load.ts:491`, `lib/metrics/week.ts:121`,
  `lib/metrics/session.ts:76` each compute their own local sum) and
  `monthWeekBucketRanges` (imported only by `tests/charts.weeksInMonth.test.ts`). Each is a
  2-line barrel/keyword removal plus a test rewrite through the public function
  (`toZoneShares` / `weeksInMonth`). Note the doc-comment lie on `zoneTotalSec` ("exported
  so a caller can test it for zero") — it should be corrected or the export removed with it.
- **`lib/insights/load.ts`'s private `BUCKET_ORDER` duplicates `lib/charts`' with a
  different order** (`['10k','5k','half','full','other']` vs the chip-row order).
  Consolidation is a cross-package decision, not a charts-dir sweep item — recorded, not
  acted on.
- **`PACE_AXIS_LABEL` (`'PACE (FASTER ↑)') is a named const in `PaceHrChartInner` but a
  bare literal in `PaceTrendChartInner`** — a small duplication, not dead code. Noted for a
  future polish pass; a shared const in `lib/charts` would be the home if a third chart ever
  needs the label.
- **The charting pair is now swept and can rejoin the normal rotation.** Given how clean a
  young, test-covered pair swept, the YAGNI lesson for future sessions: target age ×
  churn × missing coverage, not mere "never swept".

## Appendix

**Files touched (2 commits, 8 files, +33/−35):**
```
4dd4abe refactor(f08): drop dead exports and never-varied policy params from lib/charts
 lib/charts/index.ts       |  5 ++---
 lib/charts/paceHr.ts      | 14 +++++++++-----
 lib/charts/paceTrend.ts   | 10 +++++++---
 lib/charts/volumeTrend.ts |  8 ++------
 lib/charts/window.ts      |  7 +++++--
 lib/charts/zoneDrift.ts   |  8 ++------
 6 files changed, 27 insertions(+), 25 deletions(-)

c0f0cff refactor(f08): ChartFrame drops never-passed props; LegendKey drops dashed variant
 components/charts/ChartFrame.tsx          | 11 +++--------
 components/charts/PaceTrendChartInner.tsx |  5 +++--
 2 files changed, 6 insertions(+), 10 deletions(-)
```

**Verification performed:** repo-wide word-boundary sweep of all 45 exported symbols with
per-consumer classification and a positive control; the CSS-selector emitter check (template
literal for `ri-zone-*`); `next typegen` + `npx tsc --noEmit` exit 0; eslint clean; prettier
clean on all 8 changed files; `scripts/check-f08-boundaries.mjs` passed (449 files); vitest
116/116 across `tests/charts.paceHr.test.ts`, `tests/charts.trends.test.ts`,
`tests/charts.weeksInMonth.test.ts`, `tests/charts.zones.test.ts`,
`tests/views.render.test.ts`, `tests/share.bundle.test.ts`,
`components/ui/SplitsTable.test.tsx`, `components/ui/ZoneBar.test.tsx`. DB-touching tests
deliberately skipped (single-database repo; that database is production).

**Key evidence locations:** `components/ui/SplitsTable.tsx:154` (the live `timeSec` read);
`lib/insights/load.ts:142` (the other `BUCKET_ORDER`); `lib/insights/load.ts:491`,
`lib/metrics/week.ts:121`, `lib/metrics/session.ts:76` (the three local-sum would-be callers
of `zoneTotalSec`).

**Session identity:** worker session `tokenmax-charts-yagni`, spawned by coordinator
`tokenmax-orch-2026-09-12` on 2026-09-12; branch
`token-maxxing-2026-09-12-charts-yagni`; final commits `4dd4abe` + `c0f0cff`; not merged
(coordinator lands worker branches).
