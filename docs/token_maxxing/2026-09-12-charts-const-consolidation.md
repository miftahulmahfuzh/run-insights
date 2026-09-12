# Token-Maxxing Session — 2026-09-12: Charts Constants Consolidation

## 🎯 Achievement / End Result
- **Goal of the burn:** A WORKER session (slug `tokenmax-charts-const-consolidation`) pre-assigned
  one idea by the coordinator (`tokenmax-orch-2026-09-12`): *"Consolidate the duplicate
  BUCKET_ORDER constant (`lib/insights/load.ts` vs `lib/charts`) and PACE_AXIS_LABEL literal, and
  finish removing the production-dead `zoneTotalSec`/`monthWeekBucketRanges` (only test-imported,
  with a stale docstring on `zoneTotalSec`) — named leftovers from today's tokenmax-charts-yagni
  session."* This session closes **all three** follow-ups that doc recorded.
- **Concrete changes:** 12 files, +111/−39, across 3 commits — `ff51184` (the dead exports:
  `lib/charts/{index,zones,weeksInMonth}.ts` + their two test files), `50985dd` (the shared axis
  label: new `components/charts/paceAxisLabel.ts` + both `Pace*ChartInner.tsx`), `e9d1cfa` (the
  guarded canonical list: `lib/metrics/{week,index}.ts`, `lib/insights/load.ts`,
  `lib/charts/paceTrend.ts`). Zero behavior change; every existing output bit-identical.
- **Real value delivered:**
  - **The assigned premise was wrong, and the correction is the deliverable.** `BUCKET_ORDER` is
    NOT a mergeable duplicate: the two constants have different orders AND different purposes.
    `lib/insights/load.ts`'s private one (`['10k','5k','half','full','other']`) was a dominance
    tie-break walk; `lib/charts/paceTrend.ts`'s exported one (`['other','5k','10k','half','full']`)
    is the chip-row left-to-right display order its docstring says *must stay that way*; and
    paceTrend also holds `TIE_PREFERENCE` (`['10k','5k','half','other','full']`), a third
    deliberately-separate tie-break. Blindly sharing a constant would have been a behavior bug —
    the exact twin-name trap the dead-export-sweep memory warns about, applied to constants.
    The REAL hazard of three hand-kept enumerations of one union is different: a sixth
    `DistanceBucket` added to the type silently skips any list that isn't compiler-checked.
  - **The fix for the real hazard:** `lib/metrics/week.ts` (where the type lives) now exports
    `DISTANCE_BUCKETS` — the one canonical member list — plus `EveryBucketListed`/`AssertTrue`, a
    type-only completeness guard. Every hand-kept enumeration of the union is now either the
    canonical list or guarded against missing a member: a future sixth bucket that skips a list is
    a **compile error naming the missing member**, instead of a silently unselectable chip or an
    unreachable default.
  - **`load.ts`'s private order was deleted as provably inert, and the proof replaced a lie.**
    `bucketForDistanceM`'s ranges are threshold-disjoint, so two buckets tying on count `n` cannot
    also tie on metres — the lower bucket's sum is strictly < `n·boundary` ≤ the higher bucket's.
    The walk order could therefore never decide anything, but the old docstring claimed it did
    ("ties break... then on the fixed order below") — a third tie-break level that can never fire.
    `dominantBucket` now walks `DISTANCE_BUCKETS` with the proof written into its docstring.
  - **One shared `PACE_AXIS_LABEL`** for both pace charts' y axes — the whole duplicated config
    object (`{ value: 'PACE (FASTER ↑)', angle: -90, position: 'insideLeft', offset: 8 } as
    const`), not just the string, in new `components/charts/paceAxisLabel.ts`. Deliberately NOT in
    `lib/charts` — that barrel's constitution is pure data, "no formatting"; a rendered label is
    presentation.
  - **The yagni session's two scope-blocked dead exports landed:** `zoneTotalSec` deleted from
    `lib/charts/zones.ts` (its docstring claimed "exported so a caller can test it for zero" —
    every would-be caller computes its own local sum; now the test does too, asserting the same
    numbers), `monthWeekBucketRanges` un-exported in `lib/charts/weeksInMonth.ts` (stays as
    `weeksInMonth`'s module-internal helper), barrel re-exports trimmed, both tests rewritten
    through the public functions.
  - **The method validated itself once:** the first `EveryBucketListed` draft had a `never`
    failing arm, and the positive-control scratch file (a deliberately incomplete list) produced
    NO error — `never` is assignable to everything, so `AssertTrue<never>` passes vacuously. The
    guard guarded nothing. The bug was caught by the positive control, not by luck, and the fixed
    arm returns the missing members themselves so the compile error names them.
- **Branch:** `token-maxxing-2026-09-12-charts-const-consolidation`
- **Merge status:** merged (commit `6d71857`)
- **Approx token burn:** moderate-high (est. ~0.6M, input-dominated) — the burn went into
  full-file reads of both `BUCKET_ORDER` contexts, the union/bucketing inertness proof, the guard
  design + positive-control iterations (including catching the vacuous-never bug), and the full
  gate stack run twice. 🔥

## Context & Motivation
The 2026-09-12 token-maxxing day ran as an orchestrated fan-out: coordinator
`tokenmax-orch-2026-09-12` spawning worker sessions on per-session branches, each handed a
pre-assigned idea. This worker drew the follow-ups section of
`docs/token_maxxing/2026-09-12-tokenmax-charts-yagni.md` — the same morning's dead-code sweep of
the charting pair had *verified* three finds but could not act: `tests/` was outside its
directory fence, and the `BUCKET_ORDER` consolidation was a cross-package decision.

The inherited list was three items:
1. `zoneTotalSec` and `monthWeekBucketRanges` — production-dead exports, each imported only by its
   test file, with a docstring lie on `zoneTotalSec` ("exported so a caller can test it for
   zero" — `lib/insights/load.ts`, `lib/metrics/week.ts`, and `lib/metrics/session.ts` each
   compute their own local sum instead).
2. `lib/insights/load.ts`'s private `BUCKET_ORDER`, flagged as duplicating `lib/charts`' with a
   different order — "consolidation is a cross-package decision, not a charts-dir sweep item."
3. `PACE_AXIS_LABEL` (`'PACE (FASTER ↑)'`) — a named const in `PaceHrChartInner` but a bare
   literal in `PaceTrendChartInner`; "a shared const in `lib/charts` would be the home if a third
   chart ever needs the label."

The constraints carried over from the day: no `package_readme.md` edits, no production-DB access
(the repo's single database IS production, so the DB-touching test files stay unrun).

## What We Did (blow-by-blow)
1. **Read both `BUCKET_ORDER` contexts in full before touching anything.** The premise said
   "duplicate"; the files said otherwise. `lib/insights/load.ts`'s version ordered a
   `dominantBucket` walk (which bucket wins a count comparison); `lib/charts/paceTrend.ts`'s
   version is the filter chip row's left-to-right reading order, shortest to longest, with a
   docstring stating it "must stay that way." A third list, `TIE_PREFERENCE`
   (`['10k','5k','half','other','full']`), sits beside it with its own docstring explaining why
   the two paceTrend orders must remain separate. Three enumerations, three different semantics —
   merging any two would have been a behavior bug delivered as a cleanup.
2. **Reframed the consolidation target: the member set, not the orders.** The genuine risk in the
   situation is that all three lists are hand-kept copies of the `DistanceBucket` union. Add a
   sixth member to the type and every list not compiler-checked silently skips it — a chip the
   reader can no longer select, a bucket that can never win `dominantBucket`'s comparison. The
   union's home is `lib/metrics/week.ts`, so that is where the canonical list went.
3. **Proved `load.ts`'s walk order inert, then deleted it.** `dominantBucket` tallies count and
   metres per bucket, breaks ties toward more distance — and the old docstring claimed a further
   tie-break "on the fixed order below." That third level can never fire: the buckets are
   threshold-disjoint distance ranges, so two buckets with the same count `n` cannot also tie on
   metres (the lower one's `n` runs each sit below the boundary every one of the higher one's `n`
   runs reaches, making its sum strictly smaller). The order was dead weight carrying a false
   documentation claim; `dominantBucket` now walks `DISTANCE_BUCKETS` and the docstring states the
   proof.
4. **Built the completeness guard and positive-controlled it — which caught the guard guarding
   nothing.** The first `EveryBucketListed` draft's failing arm was `never`
   (`... extends [never] ? true : never`). The scratch positive control (a deliberately
   incomplete list) produced NO tsc error: `Exclude<DistanceBucket, Members[number]>` resolves to
   `never` for a missing member, and `never` is assignable to everything, so
   `AssertTrue<never>` passed vacuously. Fixed by returning the missing members themselves in the
   failing arm, so the error names them: `Type '"other"' does not satisfy the constraint 'true'`.
   Positive-controlled both directions afterwards — incomplete list and typo'd member both fail
   with crisp errors; the complete real lists pass.
5. **Landed the guard at every enumeration site.** `DISTANCE_BUCKETS` got its own assertion in
   `week.ts`; paceTrend's `BUCKET_ORDER` and `TIE_PREFERENCE` became `as const` with per-site
   `AssertTrue<EveryBucketListed<...>>` aliases. Each assertion alias is **exported** on purpose:
   next's TS config sets `@typescript-eslint/no-unused-vars` at warn with no underscore ignore
   pattern, and an unexported assertion alias reads as dead — an assertion the linter deletes is
   an assertion that guards nothing. The comment at each site says the export is the point.
6. **Removed the two dead exports and rewrote their tests through the public surface**
   (`ff51184`): `zoneTotalSec` deleted, its test's denominator assert now a local row-sum with a
   comment explaining why (plus the sharpened observation that the worked example is reachable
   only with that denominator — from `durationSec`, zone 4 would print 46, not the brief's 47);
   `monthWeekBucketRanges` un-exported with a docstring note that `weeksInMonth` is the public
   face (no runs in, pure ranges out); barrel trimmed of both re-exports; the weeksInMonth test's
   three range-shape describes now call `weeksInMonth(month, [], today)`.
7. **Extracted the shared axis label** (`50985dd`): new `components/charts/paceAxisLabel.ts`
   exporting the whole config object, docstring carrying the "up is always faster" rule (§3.1
   inverts the pace axis; §3.6 must not make a reader relearn it) and the placement argument.
   Both `PaceHrChartInner` and `PaceTrendChartInner` consume it; the bare literal died with the
   duplication.
8. **Ran the full gate stack** (twice — after the guard iterations and at the end): `next typegen`
   + `npx tsc --noEmit` exit 0 (also under the scratch positive-control files, in both failing
   and passing directions); eslint exit 0 with zero warnings on all changed files; prettier clean
   (one `--write` on `lib/metrics/index.ts`); `scripts/check-f08-boundaries.mjs` passed (457
   files — the f08 boundary guard, relevant because the barrel surfaces changed); vitest in three
   waves: **18/18** (the commit-1 files), **49/49** across
   `tests/charts.{trends,paceHr,zones,weeksInMonth}.test.ts`, **67/67** across
   `tests/views.render.test.ts`, `tests/share.bundle.test.ts`,
   `components/ui/SplitsTable.test.tsx`, `components/ui/ZoneBar.test.tsx`. DB-touching tests
   deliberately not run — the repo's single database is production.
9. **Residual sweep, then committed and stopped.** No `BUCKET_ORDER` left anywhere in
   `lib/insights`; no imports of either removed export anywhere. Three commits on the worker
   branch — no merge, no push; the coordinator lands worker branches.

## Code / Design Details

**The guard** (`lib/metrics/week.ts`, next to the union it enumerates):

```ts
export type DistanceBucket = '5k' | '10k' | 'half' | 'full' | 'other'

/** The union's one canonical enumeration... Walk it when every bucket must be considered and the
 * order provably decides nothing. When order IS the semantics — a display row, a tie-break —
 * write that order locally and guard it with `EveryBucketListed`... */
export const DISTANCE_BUCKETS = ['5k', '10k', 'half', 'full', 'other'] as const

export type AssertTrue<Fact extends true> = Fact

export type EveryBucketListed<Members extends readonly DistanceBucket[]> = [
  Exclude<DistanceBucket, Members[number]>,
] extends [never]
  ? true
  : Exclude<DistanceBucket, Members[number]>

export type _distanceBucketsComplete = AssertTrue<EveryBucketListed<typeof DISTANCE_BUCKETS>>
```

The whole design is the failing arm. `[Exclude<Union, Members[number]>] extends [never]` asks
"does the list miss anything?"; a complete list resolves the tuple to `[never]` and gets `true`
(assertable), while an incomplete one resolves to the *missing members* and fails the assertion
with their names — `Type '"other"' does not satisfy the constraint 'true'`. The first draft's
`never` failing arm compiled against an incomplete list because `AssertTrue<never>` satisfies
`Fact extends true` vacuously — never is assignable to everything. A guard that cannot fail is
worse than no guard: it advertises protection it does not provide.

**A guarded load-bearing order** (`lib/charts/paceTrend.ts`):

```ts
export const BUCKET_ORDER = ['other', '5k', '10k', 'half', 'full'] as const
/** Completeness assertion — exported so `no-unused-vars` cannot eat it (see `DISTANCE_BUCKETS`). */
export type _bucketOrderComplete = AssertTrue<EveryBucketListed<typeof BUCKET_ORDER>>

const TIE_PREFERENCE = ['10k', '5k', 'half', 'other', 'full'] as const
/** Completeness assertion — exported so `no-unused-vars` cannot eat it (see `DISTANCE_BUCKETS`). */
export type _tiePreferenceComplete = AssertTrue<EveryBucketListed<typeof TIE_PREFERENCE>>
```

The docstring on `BUCKET_ORDER` now states the division of labor explicitly: the canonical list
is the union's member set, not a reading order; a display order is written locally — and guarded
— rather than borrowed. (`AssertTrue`/`EveryBucketListed` are deliberately NOT barrel-re-exported
from `lib/metrics/index.ts` — generic type plumbing, not domain surface; paceTrend imports them
from `@/lib/metrics/week` directly. The barrel did gain `DISTANCE_BUCKETS`.)

**The inertness proof, where the lie used to be** (`lib/insights/load.ts`):

```ts
// before — a docstring claiming a tie-break level that can never fire, plus a third hand-kept copy
// of the union: "Ties break toward more distance covered, then on the fixed order below..."
const BUCKET_ORDER: DistanceBucket[] = ['10k', '5k', 'half', 'full', 'other']
...
for (const bucket of BUCKET_ORDER) {

// after — the proof replaces the claim; the canonical list is walked
// Ties break toward more distance covered, and that second key is decisive, not decorative: the
// buckets are threshold-disjoint distance ranges, so two buckets with the same count `n` cannot
// also tie on metres — the lower one's n runs each sit below the boundary every one of the
// higher one's n runs reaches, making its sum strictly smaller.
for (const bucket of DISTANCE_BUCKETS) {
```

**The shared axis label** (`components/charts/paceAxisLabel.ts`, in full):

```ts
export const PACE_AXIS_LABEL = {
  value: 'PACE (FASTER ↑)',
  angle: -90,
  position: 'insideLeft',
  offset: 8,
} as const
```

Its docstring carries the two decisions: the "up is always faster" rule (§3.1 inverts the pace
axis, §3.6 must not make a reader relearn it — one constant so a third pace axis inherits the
sentence and the rotation together), and the placement (beside the charts, not in `lib/charts`,
whose barrel is pure data — a rendered label is presentation, and the barrel's own constitution
excludes it). Note the yagni session had sketched `lib/charts` as the home; reading the barrel's
own rule reversed that.

**The dead exports** (`ff51184`): `zones.ts` lost `zoneTotalSec` and its false docstring;
`weeksInMonth.ts`'s `monthWeekBucketRanges` dropped from `export function` to `function` with a
docstring note that `weeksInMonth` is the only consumer and the public face; the barrel lines
became `export { aggregateZones, toZoneShares, zoneOfHr } from './zones'` and
`export { weeksInMonth } from './weeksInMonth'`. The zones test's key assertion now reads:

```ts
// The denominator itself is the fixture's own row sum — every production would-be caller of the
// old test-only `zoneTotalSec` export computed exactly this local reduction, so the export
// died and the sum lives here where the assertion is.
const zoneSecTotal = canonicalSession.zones.reduce((sum, z) => sum + z.durationSec, 0)
expect(zoneSecTotal).toBe(4595)
expect(zoneSecTotal).not.toBe(canonicalSession.durationSec)
// The worked example above is reachable only with this denominator: from durationSec, zone 4
// would print 46 (2160 of 4716 s) and zone 5 42, not the brief's 47 and 43.
```

Same numbers as before, asserted through the same reduction production performs. The
weeksInMonth test's three range-shape describes call `weeksInMonth(month, [], today)` — the
public function with no runs, which is exactly the pure-ranges view the old export offered.

## Decisions & Trade-offs
- **Consolidate the member set, not the orders.** The coordinator's "duplicate" premise was
  corrected by investigation, and the correction is the deliverable: one canonical list plus
  completeness guards beats either blind merging (a behavior bug shipped as a cleanup — chip row
  reordered, tie-breaks warped) or leaving three unchecked lists (the silent-skew hazard). The
  twin-name lesson from the sweep memory generalizes from exports to constants: same name is not
  same purpose, and "different content, same name" is a question about *semantics*, not an
  invitation to unify.
- **Write the inertness proof into the docstring it corrects.** The old `dominantBucket`
  docstring claimed a tie-break level that can never fire; deleting the constant without deleting
  the claim would have left the lie mentoring the next reader into "restoring" the order. The
  proof (threshold-disjoint ranges ⇒ count-tie ⇒ metres cannot tie) now lives exactly where the
  claim did.
- **`PACE_AXIS_LABEL` lives in `components/charts`, not `lib/charts`.** The yagni sketch named
  `lib/charts`, but that barrel's constitution — pure data, "no formatting" — excludes a rendered
  Recharts label config. Placement follows the module's own rule over the earlier sketch. The
  whole object is shared, not just the string: the angle/position/offset are part of what "the
  same label on both charts" means, and a third pace axis should inherit all of it.
- **Export the assertion aliases; do not barrel the guard primitives.** `export type
  _bucketOrderComplete = ...` looks like noise until `no-unused-vars` (warn, no underscore
  pattern in next's TS config) flags the unexported form as dead and an auto-fixer removes the
  guard. The export IS the mechanism for keeping the assertion alive; the comment at each site
  says so. Conversely `AssertTrue`/`EveryBucketListed` stay out of `lib/metrics/index.ts` — they
  are generic plumbing, and the barrel advertises domain surface.
- **Test-only exports die with their tests rewritten through the public function, not kept as
  test seams.** Both tests still pin the same numbers — the zones test arguably pins more now
  (the denominator-vs-durationSec distinction is commented with its consequence, 46 vs 47) —
  but through `toZoneShares`' denominator and `weeksInMonth`'s empty-runs shape, i.e. the surface
  production actually uses. An export whose only consumer is its own test is the export testing
  itself.
- **Zero behavior change as a hard invariant.** Every existing output bit-identical; the one test
  whose helper was removed asserts the same numbers via the same reduction production uses. The
  `as const` on the two paceTrend lists narrows types without changing values;
  `dominantBucket`'s walk order change is inert *by proof*, not by hope.

## Follow-ups & YAGNI notes
- **The yagni session's follow-up list is now fully closed** — all three items acted on or
  corrected: the two test-only exports removed, the `BUCKET_ORDER` "duplication" investigated and
  consolidated the right way (member set, not orders), the `PACE_AXIS_LABEL` literal shared.
  Nothing inherited remains open.
- **The guard pattern generalizes.** `EveryBucketListed`/`AssertTrue` are written against
  `DistanceBucket`, but the shape — `Exclude<Union, Members[number]>` asserted true, failing arm
  naming the absent members — applies to any hand-kept enumeration of a union anywhere in the
  repo. Deliberately NOT generalized this session (no second union had a hand-kept list in the
  touched scope; speculative genericizing is its own YAGNI), but the pattern is now in the tree
  to copy, with its vacuous-never failure mode documented at the definition site.
- **Deliberately not done:** no `package_readme.md` edits (day-of constraint); no DB-touching
  tests run (single database = production); `BUCKET_LABELS` needed no guard (it is
  `Record<DistanceBucket, ...>` — the compiler already checks its keys); no attempt to derive
  `BUCKET_ORDER`/`TIE_PREFERENCE` from `DISTANCE_BUCKETS` programmatically — an order derived by
  transformation is harder to read than an order written out and guarded.
- **If a sixth `DistanceBucket` ever lands**, the compiler now walks the developer through every
  list: add to the union, add to `DISTANCE_BUCKETS`, and the per-site assertions name any
  display/tie-break list the new member was skipped from. That was the point.

## Appendix

**Files touched (3 commits, 12 files, +111/−39):**
```
ff51184 refactor(f08): drop production-dead zoneTotalSec and monthWeekBucketRanges exports
 lib/charts/index.ts               |  4 ++--
 lib/charts/weeksInMonth.ts        |  5 ++++-
 lib/charts/zones.ts               |  5 -----
 tests/charts.weeksInMonth.test.ts | 10 ++++++----
 tests/charts.zones.test.ts        | 14 ++++++++++----
 5 files changed, 22 insertions(+), 16 deletions(-)

50985dd refactor(f08): one shared PACE_AXIS_LABEL for both pace charts' y axes
 components/charts/PaceHrChartInner.tsx    |  7 +++----
 components/charts/PaceTrendChartInner.tsx |  4 +++-
 components/charts/paceAxisLabel.ts        | 17 +++++++++++++++++
 3 files changed, 23 insertions(+), 5 deletions(-)

e9d1cfa refactor(f08): consolidate DistanceBucket enumerations under a guarded canonical list
 lib/charts/paceTrend.ts | 22 +++++++++++++++++++---
 lib/insights/load.ts    | 15 ++++++++++-----
 lib/metrics/index.ts    | 13 +++----------
 lib/metrics/week.ts     | 34 ++++++++++++++++++++++++++++++++++
 4 files changed, 66 insertions(+), 18 deletions(-)
```

**Verification performed:** `next typegen` + `npx tsc --noEmit` exit 0 (including under the
scratch positive-control files — incomplete list and typo'd member failing with crisp errors,
complete lists passing); eslint exit 0, zero warnings on all changed files; prettier clean (one
`--write` on `lib/metrics/index.ts`); `scripts/check-f08-boundaries.mjs` passed (457 files);
vitest 18/18 (commit-1 files), 49/49 (`tests/charts.{trends,paceHr,zones,weeksInMonth}.test.ts`),
67/67 (`tests/views.render.test.ts`, `tests/share.bundle.test.ts`,
`components/ui/SplitsTable.test.tsx`, `components/ui/ZoneBar.test.tsx`). DB-touching tests
deliberately skipped (single-database repo; that database is production). Residual sweep: no
`BUCKET_ORDER` in `lib/insights`, no imports of the two removed exports anywhere.

**The positive-control receipt, in one line:** first draft `... extends [never] ? true : never`
compiled clean against a deliberately incomplete list (never assignable to everything ⇒
`AssertTrue<never>` vacuously true); fixed arm returns `Exclude<DistanceBucket,
Members[number]>` so tsc prints `Type '"other"' does not satisfy the constraint 'true'`;
re-controlled both directions before trusting the guard anywhere.

**Session identity:** worker session `tokenmax-charts-const-consolidation`, spawned by
coordinator `tokenmax-orch-2026-09-12` on 2026-09-12; branch
`token-maxxing-2026-09-12-charts-const-consolidation`; final commits `ff51184`, `50985dd`,
`e9d1cfa`; merged (commit `6d71857`). Continues the follow-ups section of
`docs/token_maxxing/2026-09-12-tokenmax-charts-yagni.md`.
