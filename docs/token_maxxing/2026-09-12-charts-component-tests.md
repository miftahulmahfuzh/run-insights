# Token-Maxxing Session — 2026-09-12: charts-component-tests

## 🎯 Achievement / End Result
- **Goal of the burn:** The assigned idea (coordinator `tokenmax-orch-2026-09-12`, slug
  `charts-component-tests`, idea pre-assigned — no menu generated for this worker):
  write **real, meaningful tests for `components/charts`** (~1155 lines across the
  chart-rendering components), which held **zero test files**. The why, verbatim from
  the coordinator: *lib/charts got two YAGNI/readme passes but the UI layer that renders
  those computations has never been tested at all — confirmed via a live file count,
  not assumption.*
- **Concrete changes:** commit `3613819` — **11 new co-located test files, +1854 lines,
  102 tests**, and **zero source changes**. `components/charts/` went from 0 to 11
  `*.test.tsx` files: the shared `ChartFrame.test.tsx`, five outer tests (one per
  chart), and five inner tests (one per chart).
- **Real value delivered:**
  - **The last major untested UI package is covered.** Before this session
    `components/charts/` held 11 TSX/TS files (~1155 lines + 207 lines of CSS) and not
    one `*.test.tsx`, against ~90 component test files elsewhere in the repo. Every
    chart component the app renders now has both a decision-layer suite and a
    real-rendering suite.
  - **The outer tests pin the decision layer, not the markup:** caption sentences
    asserted word-for-word — including the trend-delta triplet
    (`getting-faster` / `getting-slower` / `holding-steady`) and the WeeksInMonth
    partial-week **singular/plural matrix** — legend gating (the HR key and the
    4-week-mean key), PaceTrend's chip single-select + `defaultBucket` opening +
    empty-band `EmptySlot` + the `allowTrendLine` §9 gating, and the table twins (row
    counts, em dash for null means, `colSpan` on no-HR rows, the current-week bullet).
    The one sanctioned `table={null}` (PaceHrChart) is pinned as sanctioned.
  - **The inner tests render real Recharts 3.10.1 under happy-dom** by mocking only
    `ResponsiveContainer` — everything above the shim stays real. Proven by
    rendering, not by reading: the **22-split fixture reproduces the documented
    card-#18 axis-thinning ladder exactly** (`['1','3',…,'19','22*']`, eleven labels,
    the partial km force-appended); the **reversed pace axis is proven tick-by-tick**
    (parsing `formatPace` strings and asserting seconds ascend with SVG y on both pace
    charts, with the HR axis asserted anti-reversed); **scatter bubble widths are
    monotonic in distance, pairwise**, and bounded by the ZAxis `[36,150]` area range;
    zero-distance weeks draw **no rectangle at all** and label nothing; the partial
    final km wears `ri-partial-dot` at r=4.5 on **both** series.
  - **Keyboard tooltips are exercised the way a keyboard user experiences them:**
    driven through Recharts' `accessibilityLayer` (`fireEvent.focus` on
    `svg[role=application]`, then an ArrowRight walk), with **every tooltip string
    asserted through the real `lib/format` imports** — no test re-implements a format.
  - **R-23 honored in the tests, not just the components.** The repo's F08 boundary
    guard (`scripts/check-f08-boundaries.mjs`) scans `.test.tsx` files too (it
    excludes only `.test.ts`), so the inner tests carry no `from recharts` import and
    no `yAxisId` token anywhere — and during the run **the guard itself caught a
    `${cadence} spm` template literal**, whose fix routed the string through
    `formatCadence`. The guard did its job on the first new files it had ever scanned
    in this directory.
  - **Five harness findings banked for every future Recharts test in this repo**
    (probed with four throwaway probe files, deleted before commit; full list in the
    Appendix): the `ResponsiveContainer` shim as the one sanctioned bypass; tick
    labels living in sibling `*-tick-labels` layers; the keyboard-tooltip
    focus→index-0 / ArrowRight→+1 mapping (ArrowLeft a no-op under happy-dom); the
    `next/dynamic` lazy chunk resolving a microtask after first render — which had
    looked like a **50%-flake until understood**; and `interval={1}` rendering every
    *other* label on a category axis.
- **Branch:** `token-maxxing-2026-09-12-charts-component-tests`
- **Merge status:** on branch — work committed at `3613819`, **NOT yet merged** (the
  coordinator merges, per worker mode)
- **Approx token burn:** ~500k 🔥 (all 12 chart files read before writing; 1854 lines
  of tests written across 11 files; four throwaway probe files written and deleted;
  the 50%-flake investigation; the full 5504-test no-parallelism sweep; typegen, tsc,
  the F08 guard, prettier, knip; this doc)

## Context & Motivation
The 2026-09-12 token-maxxing day ran as an orchestrated fan-out under coordinator
`tokenmax-orch-2026-09-12`, each worker handed one pre-assigned idea (no menu). This
worker's assignment was the chart UI layer — a hole that was easy to state precisely
because it was binary: `components/charts/` had zero test files.

The gap had a specific shape worth recording. `lib/charts` — the computation layer
beneath the components — had already received **two** passes that day (the
charts-dead-code YAGNI sweep, then the charts constants consolidation), and the pair
had gotten its first combined package readme. But the UI layer that *renders* those
computations had never been touched by a test: eleven files of `'use client'`
components, a shared frame module, and 207 lines of CSS, none of it executed under
test even once. The coordinator's premise was verified live before any work started —
a file count, not an assumption — and held exactly: 11 TSX/TS files, 0 test files,
against ~90 component test files elsewhere in the repo. This was the last major
untested UI package in the codebase.

Timing helped: sibling sessions the same day had established the repo's component-test
harness conventions (`components/nina`, `components/admin`, `components/review` all
got suites earlier in the week), so the session wrote into an existing pattern rather
than inventing one. What had *no* precedent was Recharts under happy-dom — that had to
be probed from scratch, and the probing is where most of the session's transferable
findings came from.

## What We Did (blow-by-blow)
1. **Confirmed the gap live**, as the idea demanded: listed `components/charts/`, found
   11 TSX/TS files (~1155 lines + 207 lines CSS) and zero `*.test.tsx`. Cross-checked
   the repo: ~90 component test files elsewhere. The premise held exactly as assigned.
2. **Read all 12 chart files before writing anything.** The architecture that fell out
   of the read: **five charts** — PaceHr, PaceTrend, VolumeTrend, WeeksInMonth,
   ZoneDrift — each split into a thin `'use client'` **outer** (decision logic +
   `ChartFrame` chrome + the accessible table twin) that lazy-imports a **Recharts
   inner** via `next/dynamic`; plus shared `ChartFrame.tsx` (exporting `ChartFrame`,
   `LegendKey`, `ChartSkeleton`, `TableTwin`) and `paceAxisLabel.ts`. That split
   dictated the test split: the outer tests get a mocked inner and assert decisions;
   the inner tests get a shimmed container and assert real rendering.
3. **Probed Recharts-under-happy-dom with four throwaway probe files before writing a
   single real test** — where do tick labels actually land in the DOM, how does the
   keyboard tooltip layer respond to synthetic events, what does `next/dynamic` do to
   mock-call timing, what `interval={1}` really renders. All four probes were deleted
   before commit; their findings are distilled in the Appendix.
4. **Wrote the 11 test files** — `ChartFrame.test.tsx` first (the shared chrome:
   fixed plot height, table-twin disclosure including the one sanctioned `table={null}`
   caller, `LegendKey` line/bar variants, `ChartSkeleton`, `TableTwin` header
   scoping), then per chart one outer + one inner suite. Outer tests mock the sibling
   Inner via `vi.hoisted` + `vi.fn`; inner tests import the real Recharts 3.10.1 and
   shim only `ResponsiveContainer`.
5. **Hit the F08 boundary guard mid-run — and let it win.** `scripts/check-
   f08-boundaries.mjs` scans `.test.tsx` files too (it excludes only `.test.ts`), which
   the session honored structurally: no `from recharts` import and no `yAxisId` token
   anywhere in the new tests. The guard still caught one violation — a
   `` `${cadence} spm` `` template literal — and the fix routed it through
   `formatCadence`, extending the R-23 formatting rule into test code where it would
   otherwise have silently drifted from production formatting.
6. **Chased what looked like a 50%-flake and found a finding instead.** The first test
   in each outer file passed or failed depending on order: the `next/dynamic` lazy
   chunk resolves a microtask after first render, so the first test must
   `await screen.findByTestId(...)` before asserting on the inner mock's call args;
   later tests pass from module cache and need no such wait. Once understood, the
   pattern was applied to every outer file's first test. No flakes before or after.
7. **Ran the gates, all green, on the final bytes:**
   - Charts suite: **102/102 across 11 files**.
   - `npx next typegen` then `npx tsc --noEmit`: clean. (Fresh worktree initially
     showed PageProps errors — missing typegen, not real errors; the repo's known
     fresh-worktree pattern.)
   - `node scripts/check-f08-boundaries.mjs`: passing, **534 files scanned**.
   - `prettier --write` on the 11 new files: clean (new files only, never repo-wide).
   - `npm run knip`: only pre-existing findings — the new test files introduce no
     dead surface.
   - Full sweep `npx vitest run --no-file-parallelism`: **307 files / 5504 tests, all
     passing**.
8. **Triaged the one parallel-sweep red per the repo's own method.** A parallel
   full-sweep run showed a single unrelated failure in
   `components/admin/explorer/SelectionPane.test.tsx`; it passed **16/16 standalone**
   and passes in the no-parallelism sweep. That is the known parallel-load flake
   pattern (clean-HEAD repro before attributing to a diff), and the diff here is
   additive-only — 11 new files, zero source changes — so nothing in it can affect
   that suite. Not attributed; not chased further.
9. **Committed** `3613819` — `test(charts): cover every F08 chart component — 102
   tests, zero to full` — 11 files, +1854/−0, zero source files touched.

## Code / Design Details

**The test split mirrors the component split** — five charts, each already divided
into a decision layer and a rendering layer, so each got one suite per layer:

| chart | outer (decision layer) | inner (real Recharts) |
|---|---|---|
| PaceHr | `PaceHrChart.test.tsx` | `PaceHrChartInner.test.tsx` |
| PaceTrend | `PaceTrendChart.test.tsx` | `PaceTrendChartInner.test.tsx` |
| VolumeTrend | `VolumeTrendChart.test.tsx` | `VolumeTrendChartInner.test.tsx` |
| WeeksInMonth | `WeeksInMonthChart.test.tsx` | `WeeksInMonthChartInner.test.tsx` |
| ZoneDrift | `ZoneDriftChart.test.tsx` | `ZoneDriftChartInner.test.tsx` |

plus `ChartFrame.test.tsx` for the shared chrome (`ChartFrame`, `LegendKey`,
`ChartSkeleton`, `TableTwin`). Co-located next to the sources, matching the repo's
`*.test.tsx` convention.

**The outer-test mock pattern** — `vi.hoisted` so the mock factory can close over the
spy before hoisting, then the inner mocked at its own module path so the outer's
`next/dynamic` import resolves to the spy:

```ts
const { PaceHrChartInnerMock } = vi.hoisted(() => ({
  PaceHrChartInnerMock: vi.fn(() => <div data-testid="pace-hr-inner" />),
}))
vi.mock('./PaceHrChartInner', () => ({ default: PaceHrChartInnerMock }))
```

The outer is then exercised as a pure decision function: render it with fixture props
and assert what it *decided* — the caption sentence it composed, which legend keys it
gated in, which chip is selected, what props reached the inner (points/buckets/weeks
passed through **untouched** — passthrough asserted so a future transform can't sneak
in unnoticed), and the table twin's rows (row counts, em dash for null means,
`colSpan` on no-HR rows, the current-week bullet). The first test in each outer file
must `await screen.findByTestId(...)` before asserting on mock calls: the
`next/dynamic` lazy chunk resolves a microtask after first render; later tests pass
from module cache and don't need the wait.

**The inner-test shim** — the one sanctioned bypass for Recharts under happy-dom.
`ResponsiveContainer` is the only mock; an `importOriginal` spread factory keeps every
other Recharts export real, and the shim `cloneElement`-injects a fixed size because
happy-dom has no layout and the real container never mounts the chart:

```ts
vi.mock('recharts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('recharts')>()
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: React.ReactElement }) =>
      cloneElement(children, { width: 600, height: 300 }),
  }
})
```

Everything above the shim stays real: real `LineChart`/`BarChart`/`ScatterChart`, real
axes and ticks, real tooltips driven through the accessibilityLayer, real
`lib/format`-formatted strings in the DOM.

**The reversed-pace-axis proof** — the property the pace charts exist for, asserted at
the layer it renders at. Each test parses the `formatPace` tick strings back into
seconds and asserts the seconds **ascend as the SVG y descends** (the axis renders
fast-to-slow top-to-bottom), tick by tick, on both pace charts; the HR axis gets the
mirror assertion — ascending values with ascending y — so a wholesale copy of the
reversed config onto the HR axis would fail it.

**The axis-thinning ladder** — a 22-split fixture reproduces the documented card-#18
behavior exactly: labels `['1','3',…,'19','22*']` — eleven labels, every other split
thinned away, with the **partial final km force-appended** (the `22*`) even though
thinning would otherwise drop it. This pins the documented behavior as executable
fact; a Recharts upgrade that changes `interval` handling now fails a named test.

**Bubble geometry** — the ZoneDrift/VolumeTrend scatter's bubble width is asserted
**monotonic in distance, pairwise** across the fixture (every adjacent pair, not a
sample), and **bounded** by the ZAxis `[36,150]` area range; the DOM relationship used
is `path.recharts-symbols`' `width = 2·sqrt(area/π)`. Zero-distance weeks are asserted
to draw **no rectangle at all** and label nothing — honesty about missing data as a
rendering property.

**Keyboard tooltips** — driven through Recharts' `accessibilityLayer`: `fireEvent.focus`
on `svg[role=application]` lands the active tooltip at index 0, each ArrowRight
advances +1 (ArrowLeft is a no-op under happy-dom events — see findings), and every
tooltip string is asserted through the real `lib/format` imports, so the tests pin the
same formatting production shows.

**Partial-dot dashing** — the partial final km wears `ri-partial-dot` at r=4.5 on
**both** series it appears on, asserted as a rendered attribute, not a class-string
grep.

## Decisions & Trade-offs
- **Mock the inner, not the chart library (outer); mock the container, not the chart
  (inner).** Each layer's single mock sits exactly at the boundary that layer can't
  exercise under happy-dom: the outer's boundary is the lazy chunk (mocked, because
  the outer's value is its decisions, not Recharts), and the inner's boundary is the
  size-less container (shimmed, because happy-dom has no layout). Everything else is
  real. This is why the suites can assert word-for-word captions *and* tick-by-tick
  axis order without either lying.
- **No `from recharts` import in any test file — structurally, not on probation.** The
  F08 boundary guard scans `.test.tsx`, so honoring R-23 in tests is enforced by CI,
  not by discipline. The one guard catch during the run (`${cadence} spm`) is evidence
  the constraint has teeth on new files; routing it through `formatCadence` also means
  the test's expected strings come from the same function production uses.
- **The 50%-flake was investigated, not suppressed.** The tempting move on an
  order-dependent first test is a retry or a sleep. The session instead found the
  mechanism (lazy-chunk microtask resolution) and encoded the fix as an explicit
  `findByTestId` in the one place it's needed, leaving a comment trail. The finding is
  banked so the next `next/dynamic`-importing component's tests don't re-derive it.
- **Probes were throwaway, findings were not.** Four probe files established the DOM
  facts (tick-label layers, symbol geometry, keyboard mapping, `interval={1}`) and
  were deleted before commit — the repo gets the distilled findings in the Appendix,
  not four dead files.
- **The full sweep ran with `--no-file-parallelism`**, matching the repo's recorded
  method for verdict-bearing runs under this environment's parallel-load flake
  pattern. The parallel run's single red (SelectionPane, 16/16 standalone) was triaged
  per the record — clean-standalone pass, additive-only diff — and explicitly not
  attributed to this work.
- **Zero source changes, on principle.** The idea was to test the UI layer, not to
  refactor it. Where the tests found something arguable (none surfaced requiring
  change), the coverage documents current behavior; any behavior change belongs to a
  session whose idea is that change.

## Follow-ups & YAGNI notes
- **The five harness findings are the session's second export.** They apply to any
  future Recharts component in this repo (the readiness panel's charts, any new
  dashboard visualization): the `ResponsiveContainer` fixed-size shim as the entry
  point, sibling tick-label layers as the query target, the keyboard-tooltip event
  mapping, the `next/dynamic` first-test `findByTestId` rule, and the `interval={1}`
  every-other-label fact. A future session could promote them into a test-helper
  module (`test-utils/recharts.tsx`) if a second Recharts surface appears — until
  then, one consumer doesn't justify the abstraction.
- **Not covered, deliberately:** the CSS file (207 lines — nothing executes it under
  test, and visual-regression tooling is a different session); `paceAxisLabel.ts`'
  edge cases beyond what the inner suites exercise through real rendering (it's pure
  and small — a dedicated unit suite is cheap if it ever grows); and
  pointer-driven (mouse) tooltip paths — the keyboard path through the
  accessibilityLayer exercises the same tooltip rendering, and happy-dom's event
  fidelity for pointer geometry is poor.
- **The `next/dynamic` first-test pattern is documented in the test files
  themselves**, but if more lazy-imported components get suites, extracting the
  `renderOuter()` helper that awaits the chunk would remove the per-file repetition.
- **Recharts upgrade tripwire:** the axis-thinning ladder test, the tick-label layer
  selectors, and the symbol-geometry arithmetic are all pinned to Recharts 3.10.1's
  DOM. A major-version bump should expect exactly these tests to go red first — which
  is the point.

## Appendix

**The commit:** `3613819` — `test(charts): cover every F08 chart component — 102
tests, zero to full`; 11 files, +1854/−0, on branch
`token-maxxing-2026-09-12-charts-component-tests`. Zero source files changed.

**The 11 files, with line counts:**

| file | lines | covers |
|---|---|---|
| `ChartFrame.test.tsx` | 181 | shared chrome: plot height, table-twin disclosure (the sanctioned `table={null}`), LegendKey line/bar, ChartSkeleton, TableTwin header scoping |
| `PaceHrChart.test.tsx` | 118 | outer: caption, HR legend key, `table={null}`, props passthrough |
| `PaceHrChartInner.test.tsx` | 256 | real render: reversed pace axis tick-by-tick, HR axis anti-reversed, keyboard tooltips |
| `PaceTrendChart.test.tsx` | 238 | outer: chip single-select, `defaultBucket`, empty-band EmptySlot, `allowTrendLine` §9, table twin |
| `PaceTrendChartInner.test.tsx` | 188 | real render: bucket bars, 4-week-mean key, formatted ticks |
| `VolumeTrendChart.test.tsx` | 111 | outer: trend-delta triplet captions, table twin, passthrough |
| `VolumeTrendChartInner.test.tsx` | 147 | real render: area/bars, axis thinning ladder |
| `WeeksInMonthChart.test.tsx` | 159 | outer: partial-week singular/plural matrix, current-week bullet, em-dash null means |
| `WeeksInMonthChartInner.test.tsx` | 186 | real render: zero-distance weeks draw nothing, partial-dot r=4.5 both series |
| `ZoneDriftChart.test.tsx` | 142 | outer: zone legend gating, table twin, passthrough |
| `ZoneDriftChartInner.test.tsx` | 128 | real render: bubble width monotonic in distance, ZAxis `[36,150]` bounds |

**The five harness findings** (probed live, four throwaway probe files, deleted before
commit):

1. **The `ResponsiveContainer` fixed-size shim is the one sanctioned bypass** for
   Recharts under happy-dom; everything above it stays real.
2. **Tick labels live in sibling `.recharts-xAxis-tick-labels` /
   `.recharts-yAxis-tick-labels` layers**, NOT inside the `.recharts-xAxis` groups;
   scatter symbols are `path.recharts-symbols` with `width = 2·sqrt(area/π)`.
3. **Keyboard tooltip mapping:** focus → index 0, each ArrowRight +1; ArrowLeft is a
   no-op under happy-dom events.
4. **`next/dynamic` lazy chunks resolve a microtask after first render**, so the FIRST
   test in an outer file must `await screen.findByTestId(...)` before asserting on
   mock calls (later tests pass from module cache — this looked like a 50%-flake
   until understood).
5. **`interval={1}` on a Recharts category axis renders every OTHER label.**

**Gates and receipts:**

| Gate | Result |
|---|---|
| charts suite | 102/102 (11 files) |
| `npx next typegen` + `npx tsc --noEmit` | clean (fresh-worktree PageProps errors were missing typegen, not real) |
| `node scripts/check-f08-boundaries.mjs` | passing, 534 files scanned; caught one `${cadence} spm` template literal during the run, fixed via `formatCadence` |
| `prettier --write` | clean (the 11 new files only) |
| `npm run knip` | only pre-existing findings |
| full sweep `npx vitest run --no-file-parallelism` | 307 files / 5504 tests, all passing |
| parallel full-sweep red (triage) | `components/admin/explorer/SelectionPane.test.tsx` — 16/16 standalone, passes in the no-parallelism sweep; known parallel-load flake pattern, not attributable to an additive-only diff |

**Session identity:** worker session `charts-component-tests`, spawned by coordinator
`tokenmax-orch-2026-09-12` on 2026-09-12 (idea pre-assigned, no menu generated);
branch `token-maxxing-2026-09-12-charts-component-tests`; code commit `3613819` is the
branch tip; this doc and its README row are intentionally left uncommitted for the
coordinator to collect.

**Session status:** work committed on branch
`token-maxxing-2026-09-12-charts-component-tests` at `3613819`, **NOT yet merged**
(the coordinator merges, per worker mode).
