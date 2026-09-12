# Package: metrics — with the insights vertical and the panel codec

**Locations**: `lib/metrics` (this file's anchor), `lib/insights`, `components/insights`,
`lib/panel`
**Last Updated**: 2026-09-12 (initial creation — one combined readme for the four packages the
2026-09-12 `insights-metrics-panel-yagni` sweep handled as one unit; see Charter)

## Charter: why one readme covers four directories

The 2026-09-12 dead-exports sweep treated these four directories as one unit — the dashboard
layer the 2026-09-11 campaign never reached — and none of them had a `package_readme.md`. This
file mints **one** instead of four, and the architecture is stated honestly rather than forced
into a false unity:

- **Three of the four are one vertical.** `lib/metrics` computes every deterministic number;
  `lib/insights` turns reviewed rows and those numbers into narration facts;
  `components/insights` renders the resulting narrative. Data flows through them in that order.
- **`lib/panel` has no functional relationship to insights.** It is `/me`'s open-panel URL codec.
  It rides in this file because the sweep swept it, not because anything imports it here — it
  gets its own part below and shares nothing with the other three.
- **The anchor is `lib/metrics`** because it is 11 of the 16 files (2,155 lines total across the
  four, wc-measured 2026-09-12) and the only one of the four that the rest of the repo imports
  at large. Tooling that looks for `{pkg}/.workflows/package_readme.md` in the other three
  directories finds nothing: **this is their readme too.**

## The vertical, end to end

```
lib/db rows (runs, run_splits, run_zones)          ← outside this layer
        │  reviewed-only (D16)
        ▼
lib/metrics            pure arithmetic: session metrics, flags, week/month rollups,
        │              ACWR, HRmax resolution        ← the layer's foundation
        ▼
lib/insights/load.ts   rows + metrics + flags → narrate FACTS (no fact shapes of its own)
        │
        ▼
lib/llm/narrate        getOrCreateInsight: model call, cached in insights.payload
        │              keyed by facts_hash       ← outside this layer
        ▼
components/insights    InsightCard renders the stored payload (server);
                       InsightTrigger fires the lib/insights actions from a client effect,
                       then router.refresh() when a new row landed
```

`app/api/cron/rollup` is the third entrance: nightly it calls `loadWeekFacts`/`loadMonthFacts`
directly, so week and month insights are usually cache hits by the time a reader opens `/trends`.

The arrows reverse for nothing: `lib/` never imports `components/`, and the one upward edge
(`components/insights/InsightTrigger.tsx` → `lib/insights/actions.ts`) is the sanctioned
client→Server Action call.

`lib/metrics` is **not** insights-only. Its heaviest consumers are outside the vertical —
badges, records, charts, Nina, the LLM fact layer and shared UI all read it — which is why the
combined readme anchors there rather than at `lib/insights`.

---

## Part 1 — `lib/metrics`, the deterministic core

### The four laws

Each is stated in a file header somewhere; together they are the package's contract, so they are
collected here:

1. **No LLM touches any of this** (D2, `session.ts`). The narrative model's only permitted
   operation on a number is to copy it into a sentence. A measured failure is on record: handed
   this exact fixture and the exact formulas, the model returned decoupling **−14.1%** where the
   truth is **+12.35%** — the sign backwards, not a rounding slip.
2. **Nothing here is formatted for display** (`types.ts`). Every field is a plain
   `number | null`, JSON-serialisable, crossing the server→client boundary as-is. `lib/format.ts`
   is the only place a number becomes text.
3. **Raw floats first, rounding for the screen** (`round.ts`, `session.ts`). Every threshold
   comparison reads raw floats; `roundSharesTo100` is display-layer only. Round first and a zone
   at 69.6% can be promoted to 70% and trip `TOO_MUCH_HARD` — a flag fired by a rounding
   artefact.
4. **`null` means "cannot compute", never `0`** (everywhere). A null renders as "not enough
   data"; a 0 renders as a real reading. `resolveHrMax` returns null rather than any substituted
   constant, `hardPct` is null rather than 0 when zone time is zero, and a missing HR-recovery
   reading is null rather than a 0 bpm drop.

### Module map

| Module | Job | I/O |
|---|---|---|
| `hrMax.ts` | THE HRmax resolver — the only module in the package that touches the database | 2 indexed queries |
| `session.ts` | `computeSessionMetrics` — every number a run detail page shows | none |
| `flags.ts` | `evaluateSessionFlags` — the closed seven-code catalog of per-run observations | none |
| `week.ts` | Weekly rollups, distance buckets, volume delta, the bucket-enumeration device | none |
| `month.ts` | Monthly rollups — the week's arithmetic folded wider, not reimplemented | none |
| `acwr.ts` | Coupled acute:chronic ratio, as of a day | none |
| `age.ts` | Age derived from `birth_year`, never stored | none |
| `pace.ts` | The one place distance and duration become a pace | none |
| `round.ts` | Largest-remainder apportionment to exactly 100 — display only | none |
| `types.ts` | The boundary types; field names match the Drizzle columns exactly | none |
| `index.ts` | The barrel — the stable import face | — |

### `hrMax.ts` — the resolver, and the one database edge

```
resolveHrMax(userId)            1. profiles.max_hr      → 'measured'
                                2. MAX(runs.max_hr)     → 'observed'  only if > the Tanaka estimate
tanakaEstimate(birthYear, now)  3. 208 − 0.7 × age      → 'estimated' only if birth_year is set
                                4. null                               no birth year, no observation
```

The rules that are easy to get wrong, all documented in the file:

- **Observed-first, never formula-first** (D11) — but step 2 *compares against the estimate*
  rather than merely existing: a slipped strap or an easy run's low peak must not clobber a
  better signal.
- **`measured` wins even when lower than `observed`.** A number a human typed is assumed
  intentional; the asymmetry is deliberate and documented so nobody "fixes" it.
- **No caching, deliberately.** Two indexed queries, called at most once per render; the file's
  header explains why a request-scoped cache would be a fix for a non-problem. A future hot-loop
  caller resolves ONCE and reuses the value across the loop.

**Removed 2026-09-12 (`metrics-hrmax-yagni` session):** `hrMaxTransitionAt`, `resolveHrMaxAsOf`
and `HrMaxTransition` — the never-shipped F06 §4.5 transition banner's machinery, which the
day's earlier yagni sweep had measured at zero production callers, alive only behind its own two
test suites. The recorded "ship F06 §4.5 or remove" decision was resolved to REMOVE; the full
banner contract lives in the F02 plan archive and in git history if a future feature ever wants
it. Removed with it, for the same reason: `HrMax.observedRunId` (written, never read — the
attribution copy reads `observedOn`), and the `asOf` cutoff option on `getObservedMaxHrRun`.
Everything else above about the resolver proper is unaffected — `resolveHrMax` itself is called
from `/me`, the insights loaders, `lib/nina/load.ts` and the run page.

### `session.ts` — `computeSessionMetrics`

```ts
function computeSessionMetrics(input: SessionInput, hrMax: HrMax | null): SessionMetrics
```

Pure — the resolved `HrMax` arrives as an argument because resolving it costs a query, and a
pure function that silently does I/O is untestable at the moment you most want to test it.

- **The D14 filter is the single most important line**: partial final-km rows are excluded from
  every statistic that aggregates split *rows* (cadence fade, drift, decoupling, fastest/slowest).
  The failure when skipped is silent and plausible — the recorded case had cadence fade read
  exactly half the truth, still negative, still "looking right".
- **Two full splits is the floor** for the half-comparison metrics (decoupling, drift, pace sd);
  below it they are null rather than NaN.
- Decoupling is Pa:Hr over **aggregate** half means, not a mean of per-split ratios.
- `paceSdSec` is **population** sd (÷ n): these kilometres are the whole run, not a sample.
- `avgHrPctMax` is the ONLY field that depends on HRmax at all; when the resolver returns null
  only it (and the `VERY_HIGH_AVG_HR` flag it feeds) disappears.
- `zonePct` carries raw float shares — the caller rounds for display, never the reverse.
- `fullSplitCount` travels with the output so a caller can say "not enough data" honestly.

### `flags.ts` — the closed catalog

`evaluateSessionFlags(m, firstFullSplit)` returns `{ code, severity, value }[]`. The thresholds
are exported as data (`FLAG_THRESHOLDS`) so copy and narration can name the same numbers the
function compares against. `lib/flags/copy.ts` owns the human wording; the narrative model is
handed codes, never invited to coin them.

| Code | Fires when (strict) | Severity |
|---|---|---|
| `HIGH_DECOUPLING` | decoupling > 5% | warn |
| `TOO_MUCH_HARD` | Z4+Z5 share > 70% | warn |
| `POSITIVE_SPLIT` | drift > +30 s/km | info |
| `CADENCE_FADE` | fade < −8 spm | warn |
| `VERY_HIGH_AVG_HR` | avg HR > 90% of max | warn |
| `SLOW_HR_RECOVERY` | 1-min drop < 20 bpm | info |
| `FAST_START` | first full km within 1 s/km of the fastest | info |

A null metric never fires its flag — and absence is not "false": when HRmax cannot be resolved,
`VERY_HIGH_AVG_HR` is simply not in the array, rendered as nothing rather than as a reassuring
"heart rate was fine". `firstFullSplit` is a parameter, not `splits[0]`, so the function stays
independent of `computeSessionMetrics` and a fires/does-not-fire test needs no fixture.

### `week.ts` / `month.ts` — rollups and the bucket device

- `bucketForDistanceM` maps metres to `'5k' | '10k' | 'half' | 'full' | 'other'` around
  race-equivalent efforts. The boundaries are an explicitly tunable heuristic — moving one is a
  product decision, not a bug fix.
- `DISTANCE_BUCKETS` is the union's one canonical enumeration, completeness-guarded by the
  `AssertTrue`/`EveryBucketListed` type device: a hand-kept bucket list that misses a member
  fails to compile *naming the missing member* (the failing arm must not be `never`, which is
  assignable to everything and would pass vacuously). When order **is** the semantics, write the
  order locally and guard it the same way — the pattern `lib/charts/paceTrend.ts` uses — rather
  than borrowing this order-provably-inert list.
- `computeVolumeDelta` returns a discriminated union, and the branches are the honesty:
  `{ kind: 'none' }` when neither period ran (a "0%" would imply a comparison),
  `{ kind: 'first' }` when there is no previous side (+∞ is not a percentage), `{ kind: 'pct' }`
  with 1dp under 10% and 0dp above, and a ±0.5% flat band.
- `computeWeekMetrics`'s `jumpWarning` fires on **increases only** — a taper is not a
  training-load warning — and `VOLUME_JUMP` is a period-scoped code, not a session `FlagCode`,
  because R-19's insight memory diffs *codes* between periods.
- `paceByBucket` is distance-weighted — `avgPaceSecPerKm(Σ distance, Σ duration)`, never a mean
  of per-run paces — and is shared with `month.ts` so "compare two periods" has one definition.
- `computeMonthMetrics` iterates this month's buckets only (a bucket run only last month is not
  a trend) and omits zones with no time rather than emitting 0% rows. ACWR deliberately does not
  live here — see `acwr.ts`.

### `acwr.ts` — the coupled ratio

`computeAcwr(runs, asOf, firstRunOn)` — **acute is Σ7 days; chronic is Σ28 days ÷ 4.** The naive
`Σ7 / Σ28` is identically 0.25 at any steady volume and can never land in the published
0.8–1.3 band; the coupled form reads 1.0 at steady volume, which is the only version compatible
with the sweet spot. `tests/metrics.acwr.test.ts` pins exactly this.

- `insufficientHistory` (first-ever run < 28 days before `asOf`) forces `ratio: null` with the
  flag set — computing anyway yields ratios like 3.2 that call a normal second week a red alert.
- `firstRunOn` is caller-supplied because the function sees only the windowed slice it is handed.
- ACWR is a property of the runner *right now*, not of a month — never scoped per period in the
  loaders, which anchor it at the period's last day clamped to today instead.

### `age.ts`, `pace.ts`, `round.ts` — the one-liners with rules

- **Age is derived, never stored.** `profiles.birth_year` is stable; a stored `age` column would
  be wrong on every date after the one it was written. Whole-year precision is all the input
  supports — onboarding asks for a year, and "exact" age from a birth year would be false
  precision for half of each year.
- **`avgPaceSecPerKm` is the one place distance and duration become a pace**, integer s/km,
  and it is the WHOLE-run ratio: it includes the partial final km because it divides by true
  distance. D14's exclusion applies to row-aggregated statistics, never here — re-deriving a
  pace average from the splits array makes every run look slightly faster than it was.
- **`roundSharesTo100` is largest-remainder (Hamilton) apportionment** so five zone percentages
  sum to exactly 100, ties breaking on the earlier index for deterministic output. Display
  layer only — see law 3.

### `types.ts` and the barrel

`SplitRow`, `ZoneRow`, `SessionInput`, `SessionMetrics`, `ZonePctRow`, `FastestSlowestKm` are
the boundary vocabulary. Field names match the Drizzle columns exactly (`distanceM`, `paceSec`,
`hr`, `cadence`) so a query result feeds `computeSessionMetrics` with no adapter; the one
deliberate respelling is `SessionInput.avgHrBpm` (column `runs.avgHr`), unit-suffixed because a
bare `avgHr` next to `avgHrPctMax` reads ambiguously in formulas. `HrMax`/`HrMaxSource` are
re-exported here and in the barrel, never redeclared — a second structurally-identical
declaration would compile and then drift.

The barrel's own header states its purpose: import from `@/lib/metrics`, not from its files, so
a later split or rename inside the directory is invisible to F07/F08/F09. In the wider repo the
reality is looser, measured 2026-09-12: `lib/badges`, `lib/charts`, `lib/llm`, `lib/records` and
`lib/nina` import leaf files directly, almost always **type-only** (`types.ts` most of all). A
new consumer of *computed values* should use the barrel; a type-only deep import matches
existing practice in the infrastructure packages.

---

## Part 2 — `lib/insights`, the fetching half of F07

### `load.ts` — rows in, facts out

`loadSessionFacts(userId, runId)`, `loadWeekFacts(userId, weekKey)`, `loadMonthFacts(userId,
monthKey)` build the narration-facts objects. **They own no fact shapes**: `lib/llm/facts.ts`
decides what a fact IS and contains no I/O; this file reads rows and hands them over — the same
split `lib/records/{recompute,gateway}.ts` uses, for the same reason.

- **One query for a period.** `getReviewedRunsWithChildren` reads the whole reviewed history in
  one batch — one consistent snapshot — and every rollup is a filter and reduce over that array.
  This rests on the single-user, bounded-history premise (~200 runs a year) shared with
  `/trends` and the records recompute; if it stops holding, all three need the same rethink
  together.
- **Reviewed-only at every scope, including session** (D16). `getRunDetail` deliberately does
  not filter (a run must render whatever its review state), so `loadSessionFacts` applies the
  filter itself and returns `null` for a draft. Unknown, not-this-user's and draft all collapse
  to `null` — telling them apart would be an ownership oracle.
- **HRmax is resolved CURRENT, not as-of the run**: the prose sits directly beneath a stat tile
  computed against the current resolution, and R-11 freezes whichever value was used into the
  payload so the pair stays consistent forever.
- **Session context**: `weeklyContext` is the 28 days ENDING ON the run's own date (narrating
  March's run in August must not cite August's volume), null below 2 runs; the narrator also
  gets the 8 previous reviewed runs with no calendar bound (F28) — a bound would return an empty
  list exactly in the layoff case that needs history most, and `daysBefore` ships with every row.
- **The comparable pace is taken in the DOMINANT bucket** (most runs this period; ties break
  toward more metres, which makes the `DISTANCE_BUCKETS` walk order provably inert), and the
  PREVIOUS period is compared in THIS period's bucket — a pace delta between different distances
  is not a pace delta.
- **ACWR anchors**: `weekEndFor`/`monthEndFor` clamp the period's last day to today, per R-6's
  "answers right now, never as of March".
- `periodFlags` aggregates per-run flags into `FlagFact[]` and appends the two period-scoped
  codes — `VOLUME_JUMP` (week only, from `jumpWarning`) and `ACWR_OUT_OF_RANGE` at `warn`
  severity, R-6 calling it an injury-risk signal whose loudness the prompts cap.

### `actions.ts` — the non-blocking boundary

`ensureRunInsight(runId)`, `ensureWeekInsight(weekKey)`, `ensureMonthInsight(monthKey)` —
`'use server'`, and the only sanctioned `getOrCreateInsight` callers outside `/api/cron/rollup`.

- A Server Action because D7 fixes the route-handler list and generating an insight writes a
  row, so it is a mutation.
- The page never awaits it: a cache miss costs 10–35 s against a model, and the screen is
  already complete from stored numbers. A hit returns in single-digit milliseconds having made
  no model call.
- **The return value is not the prose** — `{ changed, unavailable }` only. The caller refreshes,
  and the server component reads the row the normal way; two render paths for one insight is how
  they eventually diverge. `changed` means a new row was written; `unavailable` means the model
  was unreachable or answered invalid twice.
- Malformed input (`isValidId`, the week/month key validators) returns the nothing-result rather
  than an error — same ownership-oracle reasoning as the loaders.

---

## Part 3 — `components/insights`, the two render-side components

### `InsightCard.tsx` — the slot (server component)

F08 owns the container and not a single word inside it. Three states: prose available; not
generated yet — a reserved slot (`min-h-[168px]`) so charts below do not jump when prose
arrives; unavailable — silence about the prose, never a fabricated summary, never a scary error.

The payload arrives as `unknown` (jsonb) and is parsed **tolerantly, non-throwing, total**:
whatever is present renders, whatever is missing is skipped, and a row written before a schema
change cannot crash a page whose numbers are fine. The measured failure that motivates this: a
real captured model response omitted `observations[].title` from every entry while the server
returned 200 — F07 validates on the way IN, this file owns not dying on the way OUT.

The verdict pill renders four fixed enum values on the status palette — the severity of an
effort is not a brand colour — and the label is always the word, never the colour alone.
`children` is where the page's own flags render, below the prose.

### `InsightTrigger.tsx` — the suspended half (`'use client'`)

Renders nothing on the happy path. It fires the matching `ensure*` action once per mount (the
`fired` ref survives development StrictMode's double effect; the `alive` flag survives
unmount), shows one quiet line while working, and `router.refresh()`es only when `changed`.

It fires **even when an insight already exists**: a cache hit is one indexed read plus a hash,
and it is the only thing that notices a *stale* insight — the facts move when a split is
corrected or the observed HRmax ceiling rises. `enabled: false` marks a target with nothing to
narrate (unreviewed draft, empty week) and skips the call entirely.

**No dedicated test suites exist for either component** (measured 2026-09-12 — the only
component directory in this file without one). The rules they enforce are pinned indirectly:
the codec and loaders below them by `tests/panel.param.test.ts` and
`tests/insights.cron.test.ts`, the tolerant parser's motivating failure by the F07 schema's own
suite. The card's parser and the trigger's state machine have no direct suite of their own.

---

## Part 4 — `lib/panel`, the `/me` panel URL codec

One pure file, `param.ts`, with **zero imports of any kind** — the codec is client-safe by
construction and testable with no DOM.

- **`PANEL_PARAM = 'panel'`** carries `{ kind: 'badge' | 'record', key }`, encoded
  `badge.early_bird`. One parameter, not one per surface: with `?badge=` beside `?record=`,
  two-open-dialogs is a representable state and exclusivity becomes a registry every opener
  must remember to join — whose failure is stacked modals, not a type error. One slot makes the
  exclusivity structural.
- **`.` and not `:`** because `URLSearchParams` percent-encodes `:` and leaves `.` alone, so the
  address-bar round trip stays human-readable.
- **The key is a `string`, deliberately** — not `BadgeKey`. A URL is user-typed input, and the
  key is resolved against the surface's catalog at render time: a stale key closes the panel
  rather than crashing it. An unknown *kind*, though, decodes to null — that is not a stale key,
  it is not this page's parameter.
- **`PANEL_DATES_PARAM = 'dates'`** is the open panel's disclosure state, subordinate rather
  than parallel: alone it opens nothing, so the one-parameter exclusivity argument does not
  forbid it (F27 round 2 — round 1 kept the list in `useState` and a back-swipe returned to a
  collapsed list). `dates=1` and nothing else is true; a hand-typed `?dates=true` failing closed
  is the safe direction.
- Values split on the FIRST `.` only — a key may contain a dot.

**The consumer counterpart lives outside this package**: `components/ui/usePanelParam.ts` owns
the history decisions (open pushes a history entry; the date list *replaces* rather than pushes,
so the back-swipe from a run returns to the list still open; close uses `back()` only when this
mount pushed its own entry, `replaceState` otherwise — deep links and returns from `/r/<id>`
arrive with no entry of ours underneath). The codec stays pure so those decisions are testable
without a browser; `tests/panel.param.test.ts` pins the codec and
`tests/panel.render.test.ts` renders the hook.

---

## Dependencies

### External

- `next` — `revalidatePath` (`lib/insights/actions.ts`), `next/navigation` (`InsightTrigger`),
  nothing else.
- `react` — `components/insights` only.

`lib/metrics` and `lib/panel` import **no third-party package at all**.

### Internal

- `lib/metrics` → `lib/date/ranges` (date arithmetic and the `DateISO`/key types), and
  `lib/db/queries` + `lib/db/schema` from **`hrMax.ts` only** — the package's single database
  edge. Every other module is pure.
- `lib/insights` → `lib/auth/requireUserId`, `lib/date/ranges`, `lib/id`,
  `lib/db/queries`/`lib/db/schema`, `lib/llm/{narrate,facts,prompts/narrate}`, `lib/metrics`;
  `load.ts` opens with `import 'server-only'`.
- `lib/panel` → nothing.
- `components/insights` → `components/ui/{Card,EmptyState}`, `lib/insights/actions`.

## Reverse dependencies

All counts grep-measured 2026-09-12; import-statement hits only — a prose mention counts as an
importer exactly never (the trap that class is for).

### `lib/metrics` — 31 source files, 21 test files (grep-raw 55)

The alias grep finds 55 files; the two exclusions are classified, not hidden.
`components/ui/{Flag,SplitsTable}.test.tsx` are co-located component tests and are counted with
the test files, not the source files; `tests/share.bundle.test.ts` matches only inside a
comment, which is prose and never an importer.

- **Through the barrel**: the F-feature surfaces — `app/r/[id]/page.tsx`, `app/trends/page.tsx`,
  `lib/insights/load.ts`, `lib/nina/{gateway,load,tools}.ts`, `components/trends/AcwrTile.tsx`,
  `components/trends/DeltaLine.tsx`, `components/ui/{Flag,SplitsTable}.tsx` (their co-located
  tests are the exclusions above).
- **Deep file imports**: `lib/badges/*` and `lib/records/*` (`session.ts` + `types.ts`),
  `lib/charts/*` (`types.ts`, `week.ts`, `round.ts`), `lib/flags/copy.ts` (`flags.ts`),
  `lib/llm/*` and `lib/nina/{context,patterns}.ts` (`age`, `flags`, `hrMax`, `types`, `week`),
  `lib/profile/schema.ts` and `app/{me,onboarding}/page.tsx` (`age.ts`),
  `lib/share/types.ts` + `lib/llm/schema.ts` (`hrMax` types),
  `components/charts/PaceTrendChart.tsx` (`week.ts`).
- **Suites**: ten `tests/metrics.*.test.ts` files (acwr, age, canonicalFixture, flags, hrMax,
  month, pace, round, session, week) plus consumer suites (`flags.copy`, `badges.*`,
  `nina.patterns`, `llm.facts`, `views.render`) and the fixtures (`canonicalRun`, `ninaContext`,
  `recordCandidates`, `syntheticWeek`, `syntheticMonth`). `tests/share.bundle.test.ts` names
  `computeSessionMetrics` in a comment only — prose, not an importer.

### `lib/insights` — 2 source files, 1 test file

`app/api/cron/rollup/route.ts` (the loaders), `components/insights/InsightTrigger.tsx` (the
actions), `tests/insights.cron.test.ts`. `tests/db.queries.insights.test.ts` despite its name
exercises the insights *table* layer in `lib/db`, not this package.

### `lib/panel` — 3 source files, 1 direct test

`components/ui/usePanelParam.ts` (the codec's only full-round-trip consumer),
`components/profile/{BadgeShelf,RecordsTable}.tsx` (`panelKeyFor` only),
`tests/panel.param.test.ts`; `tests/panel.render.test.ts` reaches it transitively through the
hook.

### `components/insights` — 2 source files, 0 tests

`app/r/[id]/page.tsx` and `app/trends/page.tsx` import both components. No test file imports
them (see Part 3).

## Concurrency

Nothing here holds shared mutable state: no module-level caches, no locks, no workers. Every
exported function is an independent pure function or stateless `async` call. The two races that
exist are handled by structure:

- Two triggers firing the same insight (two tabs, StrictMode double-effect) is settled
  **downstream** of this layer by the `insights` table's unique index
  (`insights_user_scope_key_hash_unq`), not by anything here.
- `InsightTrigger`'s `fired` ref and `alive` cleanup make one mount one call, and an unmount a
  no-op state write.

## Error handling

No custom error classes anywhere in the four packages, and nothing throws at a caller for data
reasons:

- `lib/metrics` — total functions; "cannot compute" is `null` with the reason structurally
  adjacent (`insufficientHistory`, `fullSplitCount`), never an exception.
- `lib/insights` — unknown/not-yours/draft collapse to `null`; malformed action input returns
  the nothing-result; model failure surfaces as `{ unavailable: true }`.
- `components/insights` — the card's parse is total over `unknown`; the trigger degrades to a
  quiet line.
- `lib/panel` — decode is total; unknown shapes decode to `null`.

## Performance

- `lib/metrics` is arithmetic over a run's rows or a period's runs — linear, no allocation
  hotspots worth noting. `resolveHrMax` is two indexed queries and deliberately uncached (its
  header's argument; a hot-loop caller resolves once and reuses).
- `lib/insights` deliberately trades one whole-history read (one batch, one snapshot) for six
  range scans that could disagree; the premise and its escape hatch are documented in
  `load.ts`'s header.
- The action boundary keeps the 10–35 s model miss off every render path; the cron makes week
  and month misses rare in practice.
- `InsightCard` reserves its height so prose arrival causes no layout shift.
- `usePanelParam` writes history directly instead of `router.push` so a badge tap never re-runs
  `/me`'s six database reads.

## Usage

### Reading a run's numbers

```ts
import { computeSessionMetrics, evaluateSessionFlags, resolveHrMax } from '@/lib/metrics'

const hrMax = await resolveHrMax(userId)          // the ONE HRmax source; may be null
const metrics = computeSessionMetrics(input, hrMax) // input: SessionInput, pure, no I/O
const flags = evaluateSessionFlags(metrics, input.splits.find((s) => !s.partial) ?? null)
```

### Rendering + triggering an insight

```tsx
<InsightCard payload={insight?.payload ?? null} scopeLabel="This run">
  {/* the page's own flags render inside the card, below the prose */}
</InsightCard>
<InsightTrigger target={{ scope: 'session', runId }} hasInsight={insight != null} />
```

The server component reads the stored row; the trigger fires the action after paint and
refreshes on `changed`. Never await the action in the page's render path.

### Panel state on `/me`

```ts
const { selection, expanded, open, setExpanded, close } = usePanelParam()
// read: selection?.kind === 'badge' && panelKeyFor(selection, 'badge')
// resolve key against the catalog at render — a stale key means no panel, not a crash
```

### Gotchas

- **Never call `roundSharesTo100` before a threshold comparison.** Compare raw, then round for
  the screen — law 3.
- **The partial-km rule cuts both ways.** Excluded from row-aggregated statistics (D14);
  included in `avgPaceSecPerKm`. Never re-derive a pace average from the splits array.
- **One HRmax resolver.** Never read `profiles.max_hr` or `runs.max_hr` directly, never inline
  Tanaka, never substitute `220 − age` or any constant. Null propagates: the dependent metric
  and its flag simply do not appear.
- **ACWR is never month-scoped.** It answers "this runner, right now"; the loaders anchor it at
  a period's last day clamped to today, and that is as historical as it gets. And the naive
  `Σ7 / Σ28` spelling is 0.25 forever — the coupled form is not a stylistic choice.
- **The flag catalog is closed.** Seven session codes plus the two period-scoped codes declared
  next to their rules (`VOLUME_JUMP`, `ACWR_OUT_OF_RANGE`). A narrator that coins a code is
  making a claim nobody wrote or tested.
- **`null` ≠ `0` everywhere.** `hardPct` at zero zone time, a missing recovery reading, an
  unresolvable HRmax — each is null, and each renders as "not enough data", never as a real
  reading of zero.
- **The loaders enforce reviewed-only themselves at session scope.** `getRunDetail` does not
  filter — a new session-scoped consumer of it must apply the same guard, not assume the query
  did.
- **The actions' return value is not the prose.** Render the row through the server component
  after `router.refresh()`; there is exactly one code path that renders an insight.
- **A panel key is unvalidated by design.** Resolve it against the catalog at render;
  `?panel=badge.nonsense` must close quietly, and `?dates=1` alone must open nothing.
- **The card's payload is read defensively on purpose.** F07 validates on the way in; the card
  survives rows written before any schema change. Do not "simplify" the tolerant parser into a
  schema throw.

## Notes

### Provenance

Documentation created 2026-09-12 by a token-maxxing worker session
(`tokenmax-pkg-readme-insights-metrics`), the idea assigned by that day's coordinator
(`tokenmax-orch-2026-09-12`). It documents the four directories exactly as the same-day
`insights-metrics-panel-yagni` sweep (commit `7f07c41`) left them: its ten un-exported symbols
are reflected here — `readInsightPayload`, `EnsureInsightResult`, `dominantBucket`,
`getPreviousInsight`, `FlagSeverity`, `PaceComparison`, `MonthMetrics`, `RecoveryInput`,
`WeekMetrics`, `PanelKind` are internal vocabulary and appear in this page only where their
concepts matter, never as API. All file/line/importer counts carry their 2026-09-12 measurement
date and should be re-measured, not trusted, after any refactor. The root
`.workflows/package_readme.md` index line was updated in the same commit to list this file.
