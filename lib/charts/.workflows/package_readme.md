# Package: charts — the F08 charting pair

**Locations**: `lib/charts` (this file's anchor), `components/charts`
**Last Updated**: 2026-09-12 (initial creation — one combined readme for the pair the 2026-09-12
yagni sweeps handled as one unit; see Charter)

## Charter: why one readme covers two directories

The 2026-09-12 dead-exports sweep and the same-day constants consolidation both treated these two
directories as one unit — the F08 charting feature — and neither had a `package_readme.md`. This
file mints **one** instead of two, because the architecture genuinely spans the boundary: the
Inner/outer component split, the token-bridge stylesheet and the table-twin rule each name files on
both sides, and a reader holding only one half is missing the seams that make the other half
correct.

- **`lib/charts` is the anchor** because it is the API surface: the barrel `@/lib/charts` is what
  the app pages and `components/ui` import, and it is where the pair's constitution (the three
  laws below) is stated. It is 9 of the 22 files, 798 of the 2,160 lines (wc-measured 2026-09-12).
- **`components/charts` is the render half** — thirteen files, every one of them `'use client'`,
  every Recharts import in the app confined to five of them by a CI guard.
- Tooling that looks for `{pkg}/.workflows/package_readme.md` in `components/charts` finds
  nothing: **this is its readme too.**

## The vertical, end to end

```
lib/db rows (runs, run_splits, run_zones)      ← outside this layer; reviewed-only (D16)
        │
        ▼
lib/charts            PURE reshape: rows in, rows out. No I/O, no clock, no formatting,
        │             no metric arithmetic. "Today" is always a parameter.
        ▼
app page (server)     /r/[id], /trends, /s/[token] call the reshapers and pass plain props
        │
        ▼
outer component       'use client', thin: ChartFrame chrome, filter state, table twin,
        │             caption in words. Zero Recharts.
        │  dynamic(() => import('./…Inner'), { ssr: false })   ← the lazy boundary
        ▼
Inner component       THE ONLY Recharts importers in the app (five files, CI-guarded).
        │             All drawing config; colours via className, never inline hex.
        ▼
charts.css            The token bridge: paints the classes the Inners carry from the
                      design tokens, overriding Recharts' SVG presentation attributes.
```

The arrows reverse for nothing: `lib/` never imports `components/`, and `lib/charts` reaches only
`lib/date/ranges` (all window arithmetic) and `lib/metrics` (types, rounding, the distance-bucket
device). The one edge that looks upward — an outer component importing `@/lib/charts` — is the
sanctioned client-reads-pure-data call.

`components/ui/{SplitsTable,ZoneBar}.tsx` render two of this layer's *data shapes* with zero
Recharts, on purpose: the run page's most load-bearing visuals are Server Components, and their
data comes from the same barrel.

## The three laws (`lib/charts/types.ts`)

Stated in the types file's header; they are the pure half's whole contract:

1. **Nothing here is formatted.** Every field is a number, a null or an ISO string; `lib/format.ts`
   is the only place a number becomes text (R-23) — including inside a chart axis's
   `tickFormatter`, which lives in the Inner and still calls `lib/format`.
2. **Nothing here computes a metric.** F06 owns decoupling, drift, cadence fade, zone shares and
   ACWR; `lib/charts` only re-shapes stored rows and F06 output into the arrays Recharts wants.
   A function here that needs a formula belongs in `lib/metrics`.
3. **No I/O.** Every function takes rows and returns rows, so every one is testable against the
   canonical fixture with no database and no clock. "Today" arrives as a parameter for exactly that
   reason — and because a render straddling Jakarta midnight must not produce two different answers
   for one page.

---

## The distance-bucket device — one shared source, and the orders that must not merge

The one cross-package constant story in this pair, and the one most tempting to "clean up"
wrongly. **The union has exactly one canonical enumeration; every order with its own semantics is
written locally and compiler-guarded.**

### The shared source

`DistanceBucket` (`'5k' | '10k' | 'half' | 'full' | 'other'`) lives in `lib/metrics/week.ts`, and
so does the union's **one canonical member list**:

```ts
export const DISTANCE_BUCKETS = ['5k', '10k', 'half', 'full', 'other'] as const
```

Walk it when every bucket must be considered and the order provably decides nothing (its one
production walk, `dominantBucket` in `lib/insights/load.ts`, carries the inertness proof in its
docstring). It is re-exported through `lib/metrics`' barrel. **It is not a reading order, and must
not be borrowed as one.**

### The orders, and why there are three

When order IS the semantics, the rule — written into `week.ts`'s own doc comment — is to write
that order locally and guard it, never to borrow the canonical list:

| list | site | order | semantics |
|---|---|---|---|
| `DISTANCE_BUCKETS` | `lib/metrics/week.ts` | `5k, 10k, half, full, other` | the member set; order inert by proof |
| `BUCKET_ORDER` | `lib/charts/paceTrend.ts` | `other, 5k, 10k, half, full` | the chip row's left-to-right reading order, shortest to longest — must stay that way |
| `TIE_PREFERENCE` | `lib/charts/paceTrend.ts` | `10k, 5k, half, other, full` | `defaultBucket`'s tie-break, nearest to the runner's home base first |
| `BUCKET_LABELS` | `lib/charts/paceTrend.ts` | — | `Record<DistanceBucket, …>` — compiler-checked by construction, needs no list guard |

Merging any two of the first three would be a **behavior bug delivered as a cleanup**: the chip
row would open on `full` instead of `10k`, or read right-to-left. This is not hypothetical — it
was tried, in a sense, by this repo's own history:

> The 2026-09-12 `tokenmax-charts-yagni` sweep flagged `lib/insights/load.ts`'s private
> `BUCKET_ORDER` (`['10k','5k','half','full','other']`) as a duplicate of the charts one. The
> same-day `charts-const-consolidation` session read both contexts in full and **corrected the
> premise**: different orders, different purposes — the load.ts copy was a dominance tie-break
> walk, and it was deleted not because it duplicated anything but because it was *provably inert*
> (the buckets are threshold-disjoint distance ranges, so two buckets tying on count `n` cannot
> also tie on metres). Its replacement is the canonical `DISTANCE_BUCKETS` walk, with the proof
> where the false docstring used to be. Deliberately NOT done, recorded as a decision: no
> deriving `BUCKET_ORDER`/`TIE_PREFERENCE` from `DISTANCE_BUCKETS` programmatically — an order
> derived by transformation is harder to read than an order written out and guarded.

### The guard, and its one known failure mode

`EveryBucketListed`/`AssertTrue` (`lib/metrics/week.ts`) hold every hand-kept list complete. The
whole design is the failing arm:

```ts
export type EveryBucketListed<Members extends readonly DistanceBucket[]> = [
  Exclude<DistanceBucket, Members[number]>,
] extends [never]
  ? true
  : Exclude<DistanceBucket, Members[number]>
```

A complete list resolves to `true` and compiles; an incomplete one resolves to **the missing
members themselves**, so `tsc` prints their names (`Type '"other"' does not satisfy the constraint
'true'`). The failing arm must never be `never`: `never` is assignable to everything, so the first
draft of this guard compiled clean against a deliberately incomplete list — a guard that cannot
fail advertises protection it does not provide. The assertion aliases are **exported** on purpose:
`no-unused-vars` reads an unexported alias as dead, and an assertion the linter deletes guards
nothing.

**Completeness audit, measured 2026-09-12 (this readme's creation pass):** a repo-wide sweep for
the `'5k'` literal across `lib/`, `components/`, `app/` finds no enumeration of the union outside
the four sites above. Every hand-kept copy is either the canonical list or guarded; a future
sixth bucket is walked through every list by the compiler, in order: add to the union, add to
`DISTANCE_BUCKETS`, and each per-site assertion names any display/tie-break list the new member
was skipped from.

---

## Module map — `lib/charts`

| module | job | the rule worth knowing before editing |
|---|---|---|
| `window.ts` | `lastIsoWeeks` — the `count` most recent whole ISO weeks, oldest first | Shared by the volume trend and zone drift **on purpose**: the two charts sit one above the other and a reader traces one week's bar to the same week's band. |
| `volumeTrend.ts` | `toVolumeTrend`, `weeksWithRuns`, `TREND_WEEKS`, `ROLLING_MEAN_WEEKS` | The mean's first three points are `null`, not estimated — index-based, so every plotted value derives from bars the reader can see. |
| `weeksInMonth.ts` | `weeksInMonth` — ISO weeks clipped to a calendar month | The partition invariant: buckets are clipped, never moved, so the bucket sum IS the month total by construction. Do **not** share this code with `volumeTrend` — no month boundary there. |
| `paceHr.ts` | `toPaceHrPoints`, `paceDomain`, `hrDomain`, `fastestSlowestFullKm`, `kmAxisTicks`, `MAX_AXIS_LABELS` | The partial row's real distance is arithmetic (run metres − 1 km per full split, split evenly if two partials); the axis domains are fixed-pad, never percentage — the anti-drama rule. |
| `zones.ts` | `toZoneShares`, `aggregateZones`, `zoneOfHr` | The zone bar's denominator is the zone rows' own sum, not `runs.duration_sec` — a bar must agree with its own parts. |
| `zoneDrift.ts` | `toZoneDrift`, `ZONES` | A week with no zone data gets `hasData: false` and renders as a gap — five zeros would read as "an easy week". |
| `paceTrend.ts` | `toPaceTrendPoints`, `defaultBucket`, `paceTrendLine`, `BUCKET_ORDER`, `BUCKET_LABELS`, `TIE_PREFERENCE`, `dayIndexToISO` | The comparability rule made mechanical: single-select distance filter, one vocabulary (F06's), regression withheld below four points. |
| `types.ts` | `ChartRun`, `PaceHrPoint`, `ZoneShare`, `MonthWeekBucket`, `VolumeTrendPoint`, `PaceTrendPoint`, `ZoneDriftWeek` | The three laws live here; field names match the Drizzle columns exactly. |
| `index.ts` | the barrel | Import from `@/lib/charts`, never from its files — a rename inside the directory stays invisible to routes and components. |

### The specifics that earned their comments

- **`paceDomain` returns fastest-first** because §3.1's and §3.6's pace axes are `reversed`:
  Recharts renders `domain[0]` at the top, and in this app the top of a pace axis is always the
  faster number. "Up is faster" is a global rule; `PACE_AXIS_LABEL` says so in words.
- **`MAX_AXIS_LABELS = 11` is measured, not chosen.** Card #18's screenshots: eleven rows render
  clean, twenty-two render as `101112…2021 22*`. Eleven keeps F19's committed screenshot of an
  eleven-row run pixel-valid; a tidier cap of six would have re-shot the README.
- **`kmAxisTicks` counts ROWS, not kilometres**, and force-appends the last row because it carries
  the `*` — the partial marker is a non-colour third channel painted on the final tick, and a
  stride that skipped it would delete it silently.
- **`fastestSlowestFullKm` excludes the partial row** even though its pace is valid: "fastest
  split: km 11" on a 0.67 km row is a badge for a sprint that never happened — D14's failure mode
  stated as a UI rule.
- **`aggregateZones` takes bounds from the LAST run that carried them**: zone boundaries move when
  the observed HRmax moves, and "Z4 164–174" must print the definition this month's reader runs on.
- **`zoneOfHr` uses the run's own bounds, never a global table**, and treats a null bound as an
  open interval — Apple prints `< 140` and `175+`.
- **`paceTrendLine` returns `null` below four points or on one x value.** A 2-point "trend" is a
  ruler; a regression over one day has an undefined slope. The component draws the scatter without
  the line rather than drawing one the data cannot support.
- **The F08/F06 contract delta** (`paceTrend.ts`'s header) is the package's one recorded
  plan-deviation: the F08 plan named a new `distanceBand` vocabulary; F06's buckets had already
  landed with the identical justification, so F08 reuses them and ships no second taxonomy. Two
  distance vocabularies disagreeing about which runs are 10Ks would be a reader-visible bug.

## Module map — `components/charts`

The five visible charts all follow one shape. The **outer** is a thin `'use client'` shell — it
holds the frame, any filter state, the legend, the caption and the table twin, and lazily imports
its Inner. The **Inner** holds everything Recharts-shaped and nothing else.

| chart | outer → inner | form | the one rule |
|---|---|---|---|
| Pace & HR (§3.1) | `PaceHrChart` → `PaceHrChartInner` | dual-axis composed | The app's ONLY dual-axis chart — §12's waiver, CI-guarded to this one file. |
| Weeks this month (§3.4) | `WeeksInMonthChart` → `WeeksInMonthChartInner` | bar | No `minPointSize`: a zero week draws as a true zero, never a sympathy sliver. |
| Weekly volume (§3.5) | `VolumeTrendChart` → `VolumeTrendChartInner` | bar + mean line | Does not move with the Week/Month switcher — a rolling window, titled "last 12 weeks" out loud. |
| Pace trend (§3.6) | `PaceTrendChart` → `PaceTrendChartInner` | scatter + segment line | The one genuinely client-stateful piece: single-select band filter in `useState`, deliberately not a URL param. |
| Zone drift (§3.7) | `ZoneDriftChart` → `ZoneDriftChartInner` | stacked area | y is always 0–100; a no-data week is a `null` gap (`connectNulls={false}`), never five zeros. |

Shared furniture in `ChartFrame.tsx`:

- **`ChartFrame`** — card, eyebrow title, control row, plot area at a FIXED height, legend,
  caption, table twin. The fixed height is not styling: a `ResponsiveContainer` inside an
  auto-height parent measures zero and renders nothing, so the height is declared once per chart
  and includes the axis and legend rows. **`table` is a required prop** (dataviz's non-negotiable:
  no value reachable only by hover or tap); the one sanctioned `null` is §3.1, whose twin is the
  splits table printed directly beneath it.
- **`LegendKey`** — line keys, not swatch boxes (a two-item legend on a 414px card is dense);
  `variant="bar"` for bars. The `className` must be a `charts.css` colour class, never inline hex.
- **`ChartSkeleton`** — the lazy chunk's placeholder, at exactly the frame's own height, so ~100 KB
  of Recharts arriving causes zero layout shift.
- **`TableTwin`** — the shared accessible-table shell, so five charts do not each invent a header
  style.
- **`paceAxisLabel.ts`** — `PACE_AXIS_LABEL`, the y-axis label both pace charts render. Lives here
  and deliberately **not** in `lib/charts`: that barrel's constitution is pure data, and a rendered
  label is presentation.

### `charts.css` — the token bridge, and the only place a chart colour is decided

Recharts writes `fill`/`stroke` as SVG **presentation attributes**, and `var()` inside a
presentation attribute is not reliably resolved (Safari ignores it). A CSS *declaration* outranks
a presentation attribute, so every series element carries a className with **zero inline hex** and
this file paints it from the design tokens — which is also what makes a light/dark flip repaint
every chart with no JavaScript and no `prefers-color-scheme` listener.

- The **double selectors** (`.cls .recharts-curve, .cls.recharts-curve`) exist because Recharts
  puts the className on a `<g>` layer for series components and directly on the shape for `<Cell>`;
  each rule targets both rather than depend on which.
- The **palette is the token set, not the plan's placeholder hexes**: pace `--accent` (the app's
  one brand hue — pace is the subject), HR `--z5` (a heart line in the maximum-effort colour),
  zones `--z1..--z5` unchanged from the zone bar, volume bars `--accent` in three ordinal
  `color-mix` steps, and the 4-week mean a **darker step of the same hue** — it is a statistic
  about the bars, not a rival series.
- **Gridlines are solid hairlines.** Dashed gridlines are a documented anti-pattern here: dashes
  are the "this one is different" channel, spent on the partial-km dot and reserved for it.

### The CI guard: `scripts/check-f08-boundaries.mjs`

Three grep-able invariants, each with a real exit code, run in CI as `ci:f08-guard`:

1. **Recharts is imported only from `components/charts/*Inner.tsx`** (regex
   `^components[/\\]charts[/\\]\w+Inner\.tsx$`). A second importer silently promotes ~100 KB of
   Recharts into a shared chunk paid for by `/` and `/upload`, screens with no chart at all —
   invisible in review and at runtime, visible only in bundle output. This is why the
   `dynamic()` call must live in the outer's `'use client'` file (`ssr: false` in a Server
   Component is illegal under Next 16 / React 19) and why the outer "exists to be as small as
   possible".
2. **Exactly one file declares `yAxisId`** — the dual-axis waiver is granted to
   `PaceHrChartInner.tsx` alone and must be re-argued at §12's depth for a second chart. The guard
   also fails if its anchor file *stops* declaring one, so it cannot pass vacuously forever after
   the signature chart moves.
3. **No chart or screen hand-rolls a unit** (R-23): a number-or-interpolation immediately followed
   by `km`/`kcal`/`bpm`/`spm`, a `toFixed()` before a unit, or an `Intl.NumberFormat` anywhere
   except `lib/format.ts` fails. Comments are stripped before matching — prose may say "kilometres"
   all it likes; the guard polices code, and a guard that fires on its own explanation gets
   silenced, which is the one failure it must not have.

Fix the code, never silence the check.

---

## Dependencies

### External

- `recharts` — Inner files only (CI-guarded).
- `next` — `next/dynamic` in the five outers; nothing else.
- `react` — the outers and `ChartFrame`.

`lib/charts` itself imports **no third-party package at all** — it cannot: law 3 makes it pure,
and the render library stays behind the lazy boundary.

### Internal

- `lib/date/ranges` — ALL window arithmetic (`isoWeekRange`, `isoWeekKeyOf`, `monthRange`,
  `addDays`, `daysBetween`, the `DateISO`/`MonthKey` types). "Which Monday owns this day" has
  exactly one implementation in the repo, and it is not here.
- `lib/metrics` — `types.ts` (`SplitRow`, `ZoneRow`), `round.ts` (`roundSharesTo100`), `week.ts`
  (`bucketForDistanceM`, `DistanceBucket`, `DISTANCE_BUCKETS`, the `EveryBucketListed` device).
- `lib/format` — every rendered number in the outers and Inners.
- `components/ui` — `Card`/`Eyebrow` (ChartFrame), `Chip` (PaceTrendChart), `EmptyState`.
- `lib/cn` — class composition in `TableTwin`.

## Reverse dependencies

All counts grep-measured 2026-09-12; import-statement hits only.

### `lib/charts` — 15 source files, 7 test files

- **`app/trends/page.tsx`** — the heaviest consumer: `aggregateZones`, `toPaceTrendPoints`,
  `toVolumeTrend`, `toZoneDrift`, `toZoneShares`, `weeksInMonth`, `weeksWithRuns`, `ChartRun`.
- **`app/r/[id]/page.tsx`** and **`app/(public)/s/[token]/page.tsx`** —
  `fastestSlowestFullKm`, `toPaceHrPoints`, `toZoneShares` (the run page's three visuals, share
  included).
- **`components/ui/SplitsTable.tsx`** — `zoneOfHr` + `PaceHrPoint` (the split row's dominant-zone
  colour); **`components/ui/ZoneBar.tsx`** — the `ZoneShare` type only. Both are Server
  Components with zero Recharts; their co-located tests (`SplitsTable.test.tsx`,
  `ZoneBar.test.tsx`) import the same names.
- **The ten chart components** (`components/charts/*Chart*.tsx`) — the intra-vertical edge; the
  Inners consume most shapes by inference, which is why `PaceTrendLine` is deliberately
  unexported ("named by no consumer").
- **Suites**: `tests/charts.paceHr.test.ts` (16 cases), `tests/charts.trends.test.ts` (15),
  `tests/charts.weeksInMonth.test.ts` (7), `tests/charts.zones.test.ts` (9) — 47 cases over the
  pure half — plus `tests/views.render.test.ts`, which renders the run page's Server Components to
  assert the *numbers reach the screen* (a unit test on `lib/charts` cannot see a `pct` that never
  renders).

### `components/charts` — 3 source files, 2 test-adjacent

- **`app/r/[id]/page.tsx`** (`PaceHrChart`), **`app/trends/page.tsx`** (the other four),
  **`app/(public)/s/[token]/page.tsx`** (`PaceHrChart` again — the share page pays the Recharts
  chunk knowingly; `tests/share.bundle.test.ts` guards what that bundle reaches, and asserts the
  chart IS in the client module list so its other assertions cannot pass vacuously).
- No co-located `*.test.tsx` exists for any outer or Inner (measured 2026-09-12) — the only
  component directory in this file without one. The outers' decisions are pinned indirectly: the
  gates they read (`weeksWithRuns`, `paceTrendLine`'s four-point floor, `defaultBucket`) are
  directly tested in the pure half, and `tests/views.render.test.ts` covers the server-rendered
  numbers. The client-only behaviors (the band filter's state machine, the empty slots, the
  captions) have no direct suite.

## Performance

- **The bundle boundary is the whole story.** Recharts (~100 KB) is reachable only through five
  lazily-imported Inners, so a session that opens `/` and `/upload` and never a run or `/trends`
  downloads none of it — enforced by the CI guard, not by discipline.
- `lib/charts` is linear array arithmetic over ≤12-week windows and ≤22-split runs; the one
  whole-history read happens above it (`lib/db`'s `getReviewedRunsWithChildren`, shared with the
  insights loaders — one consistent snapshot feeding every chart on the page).
- Every Inner sets `isAnimationActive={false}`: the charts render inside a shell that may re-render
  on filter taps, and re-animating a re-render reads as the data moving.
- Skeletons match frame heights exactly; nothing on these pages shifts on load.

## Usage

### Adding a chart to this pair

1. Shape the data in `lib/charts` (pure; rows in, rows out; export through the barrel). A formula
   needed here belongs in `lib/metrics` instead — law 2.
2. Write the Inner first — all Recharts config, colours as `charts.css` classNames, every rendered
   number through `lib/format`, one y axis unless you are prepared to argue §12 again.
3. Wrap it in an outer: `dynamic(..., { ssr: false })`, a `ChartSkeleton` at the same height, a
   `ChartFrame` with a **table twin** (or the sanctioned `null` plus the adjacent table), a caption
   that states in words what the picture's endpoint means.
4. Run `node scripts/check-f08-boundaries.mjs` — it is the fastest feedback on all three boundary
   rules.

### Gotchas

- **Never threshold on `ZoneShare.pct`.** It is largest-remainder-rounded so the five sum to
  exactly 100 — 69.6% can become 70% and trip a flag on a run that never crossed the line. Flags
  read raw floats; this number is for labels.
- **The partial final kilometre follows the rules, not the vibes**: excluded from
  row-aggregated statistics, still plotted (dashed dot + `11*` tick + table row), never eligible
  for "fastest split".
- **Do not derive `BUCKET_ORDER` from `DISTANCE_BUCKETS`.** The orders are different on purpose;
  see the device section. The compiler, not a transformation, holds the lists complete.
- **`interval={0}` on the §3.1 x-axis is load-bearing.** Beside an explicit `ticks` array it means
  "draw exactly these"; remove it and Recharts re-runs its own collision skip, and the tick
  likeliest to go is the crowded final one — deleting the partial marker silently.
- **`connectNulls={false}` is the honesty rule** for the rolling mean and the zone drift: a gap
  where data is missing, never a straight line drawn through it.
- **Do not share window code between `weeksInMonth` and `lastIsoWeeks`.** One clips to a month,
  one must not; sharing the clipping logic is a bug waiting for a month that starts on a Sunday.
- **Empty is said in words.** An empty band, a no-HR week, a sub-two-point run each render an
  `EmptySlot` sentence — never a bare axis, never fabricated zeros.
- **Never add a chart colour.** The palette is `charts.css`'s token mapping; a new hue there is a
  design decision, an inline hex anywhere is a guard-free regression.

## Notes

### Provenance

Documentation created 2026-09-12 by a token-maxxing worker session
(`tokenmax-charts-readme-yagni`), the idea assigned by that day's coordinator
(`tokenmax-orch-2026-09-12`). It documents the pair exactly as the same day's two sweeps left it:
`tokenmax-charts-yagni` (commits `4dd4abe`, `c0f0cff` — the dead-export sweep) and
`tokenmax-charts-const-consolidation` (`ff51184`, `50985dd`, `e9d1cfa` — the bucket device, the
shared axis label, the test-only export removals). The session's assigned premise — "consolidate
the duplicate `BUCKET_ORDER` between `lib/charts` and `lib/insights/load.ts`" — was verified
against the tree and found already landed in exactly the one-shared-source form recorded above;
the verification sweep and this documentation are that idea's residue, not a re-litigation.
All counts carry their 2026-09-12 measurement date and should be re-measured, not trusted, after
any refactor. The root `.workflows/package_readme.md` index was updated in the same commit to
list this file.
