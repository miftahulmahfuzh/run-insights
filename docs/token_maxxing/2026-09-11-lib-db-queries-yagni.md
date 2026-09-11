# Token-Maxxing Session — 2026-09-11: Lib DB Queries YAGNI Dead-Code Removal

## 🎯 Achievement / End Result
- **Goal of the burn:** `lib/db/queries.ts` — the repo's single data-access module, at
  1,914 lines and 80 exports — had grown additively for the project's lifetime with no
  dead-code pass. Audit **every** exported query function for callers across the whole
  repo (`app/`, `components/`, `lib/`, `scripts/`, plus root configs) and remove the
  functions with genuinely zero callers. HARD BOUNDARY honored throughout: **no
  `lib/db/schema.ts` changes, no migrations, no table/column changes** — this repo's
  dev database IS production (a lesson the day's memory already paid for once), so a
  dead-*code* pass must never drift into a dead-*column* one.
- **Concrete changes:**
  - **Removed 6 genuinely dead functions + 1 now-orphaned interface**, in 4 gated
    commits, each with its full companion-test and boundary-guard cleanup:
    1. `7bd9b85` — `getMonthlyTotals` + `fillZeroMonths` (+ the `MonthlyTotal`
       interface, + the now-unused `addMonths` import).
    2. `97e337a` — `getObservedMaxHr` + `getObservedMaxHrExcludingRun` (+ fixed
       `getObservedMaxHrRun`'s doc comment, which described itself relative to the
       removed pair: "the plain max() above").
    3. `9b47833` — `listExtractions`.
    4. `84ae30f` — `deletePhoto`.
  - **8 files touched, 8 insertions, 315 deletions** (307 net); `lib/db/queries.ts`
    itself **1,914 → 1,777 lines**.
  - Companion updates beyond `queries.ts`: `scripts/check-data-layer-invariants.mjs`
    (removed `fillZeroMonths` from the `ALLOWED_UNSCOPED` allowlist),
    `tests/db.queries.shares.test.ts` (its mirror list, which asserts the
    unscoped-export set exactly: **4 → 3 entries**), `tests/db.queries.rollups.test.ts`,
    `tests/db.queries.reviewedOnly.test.ts` (its invariant-completion expected-exports
    list: **15 → 14 → 12 entries** across batches 1 and 2 — measured from git at each
    commit), `tests/db.queries.extractions.test.ts`, `tests/db.ownership.test.ts`, and
    `tests/integration/queries.int.test.ts`.
  - Test-case arithmetic, measured from the range diff: 20 `it()` blocks removed / 1
    re-added (net −19), of which 5 were in the opt-in integration suite — so the
    default suite shed exactly **14 tests**: 5,107 (the day's earlier count on main,
    post-photoReference-fix) → **5,093**, matching the session's reported full-suite
    number to the digit.
- **Real value delivered:**
  - The data-access module's export surface now names only functions something
    actually calls — every one of the 74 remaining function exports has a verified
    production caller, and the two boundary-guard allowlists that encode "exports that
    touch no database" shrank to match reality instead of accumulating exceptions.
  - Three whole code paths that could have silently rotted are gone: a monthly-totals
    SQL path that had been superseded by the trends rebuild (and could have produced a
    *different* monthly number than `lib/metrics` if anyone had re-wired it), an
    HR-max read with no reviewed-at filter semantics of its own sitting next to the
    real F02 resolver, and a delete-by-photo-id path that bypassed both documented
    photo-deletion channels.
  - The audit method itself is now written down (this doc's What We Did) including the
    one false positive it produced mid-session — the same method is directly reusable
    on `lib/nina/queries.ts`, the repo's other ~2,000-line data layer, which is the
    named follow-up.
  - Zero schema drift: the diff contains no `lib/db/schema.ts` change, no migration,
    no table/column rename — provable from the 8-file diffstat alone.
- **Branch:** `token-maxxing-2026-09-11-lib-db-queries-yagni`
- **Merge status:** on branch (4 gated code commits, `7bd9b85` → `84ae30f`; docs commit
  on top; not yet merged to main)
- **Approx token burn:** a full fanned-out session's burn — the audit phase dominated:
  80 exports each word-boundary-grepped repo-wide, the intra-file call graph mapped,
  and every candidate's "zero callers" claim re-verified before its commit. No precise
  meter available; estimate ~2M. 🔥

## Context & Motivation
The coordinator (`tokenmax-orch-2026-09-11`) assigned this from the day's idea menu.
The same YAGNI method had already been validated on other packages earlier on
2026-09-11; this applied it to the module where it carries the most risk and the most
value: `lib/db/queries.ts` is imported by nearly every server-side surface in the app
(runs, metrics, extractions, shares, insights, photos), so its export list is the
de-facto public API of the data layer.

Two facts made the pass overdue. First, the module's history is purely additive: the
trends rebuild, the extraction-poll endpoint, and the nina photo pipeline had each
introduced their own reads while leaving their predecessors in place, and nothing in
CI fails on an uncalled export. Second, the module has a *self-describing* guard
culture — `scripts/check-data-layer-invariants.mjs` allowlists exports that touch no
database, and `tests/db.queries.reviewedOnly.test.ts` pins every reviewed-only rollup
by name — which meant dead exports were actively being *carried* by those lists: each
dead function had to keep its invariant assertions, its rollups tests, and its
allowlist entry green. Dead code in this module is not free; it has a maintenance
annuity.

The boundary was fixed before the first grep: this repo's "dev" database is the
production instance (a measured lesson), and dead-column removal would mean a `DROP
COLUMN` landing after the next deploy against live data. Only *functions* with zero
callers were in scope; schema.ts was read, never written.

## What We Did (blow-by-blow)
1. **Mapped the full export surface and the intra-file call graph.** All 80 exports of
   `lib/db/queries.ts` were enumerated and, for each, whether it is called from
   elsewhere in the same file. This distinguishes the two failure shapes early: an
   export with no callers *anywhere* (removable), and an export whose only callers are
   internal (not removable under the mandate, but worth noting — see Kept-and-noted).
2. **Word-boundary grepped every export across the whole repo**: `app/`,
   `components/`, `lib/`, `scripts/`, plus root configs — not a substring grep, a
   word-boundary one, so `getObservedMaxHr` did not "find" a caller inside
   `getObservedMaxHrRun`'s name.
3. **Hit and corrected a false positive in the audit's own first pass.** The first
   sweep included `.workflows/` planning-doc directories, and doc mentions of removed
   candidates misattributed as callers (e.g. plan text quoting function names). This
   was corrected *before* any removal decision was made on it — `.workflows/` was
   excluded, and `docs/plans/` mentions were classified as historical plan text, not
   callers (see the `docs/plans/F03-data-layer.md` note below). A dead-code audit's
   grep is exactly the kind of green gate that can answer the wrong question; the
   correction is recorded here so the next pass skips the same detour.
4. **Swept the dynamic-reference channels separately**, because a word-boundary grep
   of a name only proves static, named imports: `import * as queries` (none),
   bracket-access like `queries[name]` (none), drizzle's `db.query.*` relational API
   (none — this repo goes through the explicit query functions), and CI/`.github`
   references (none). With all four channels empty, "zero grep hits outside the
   module" legitimately means "zero callers".
5. **Removed the dead functions in 4 gated commits, one concern per commit:**
   - **`7bd9b85` — monthly totals.** `getMonthlyTotals` (+ `fillZeroMonths`, its only
     caller, + the `MonthlyTotal` interface, + the orphaned `addMonths` import) went
     together: since the trends rebuild, monthly totals are computed in `lib/metrics`
     from raw reviewed runs (`getReviewedRunsWithChildren`), so the SQL-side
     monthly-aggregate path had no reader. Companions: the `ALLOWED_UNSCOPED`
     allowlist in `scripts/check-data-layer-invariants.mjs` (which existed largely to
     excuse `fillZeroMonths` — "pure function, no database access at all", said its
     own comment) and its exact-mirror list in `tests/db.queries.shares.test.ts`,
     now **3 entries** (`getRunByShareToken`, `isUniqueViolation`,
     `listActiveUserIds`), not 4.
   - **`97e337a` — HRmax reads.** `lib/metrics/hrMax.ts` resolves rule 2 of roadmap
     §4.4 through `getObservedMaxHrRun` alone — the variant that names the run and
     takes the Tanaka floor and an `asOf` cutoff *in SQL*. The plain `max()` read
     (`getObservedMaxHr`) and the exclude-one-run variant it had superseded
     (`getObservedMaxHrExcludingRun`) were orphaned. `getObservedMaxHrRun`'s doc
     comment, which described itself relative to "the plain max() above", was rewritten
     to stand alone — a doc-comment rot fixed in the same commit that created it.
   - **`9b47833` — extractions list.** The upload screen's "still waiting" read now
     happens via the extraction poll endpoint (`getExtraction`);
     `app/upload/page.tsx` imports only `getProfile`. `listExtractions` had no caller.
   - **`84ae30f` — photo delete.** `run_photos` rows leave the database only via the
     runs cascade (`deleteRun`) or lib/nina's own photo helpers
     (`removeChatPhotoAction` / `releaseBlobIfUnreferenced`). The nina gallery delete
     was specifically verified NOT to route through `deletePhoto` before removal.
6. **Updated each batch's companion tests in the same commit**, so every commit
   individually passes its gates: `tests/db.queries.rollups.test.ts`,
   `tests/db.queries.reviewedOnly.test.ts` (including the invariant-completion
   expected-exports list — measured trajectory **15 → 14 → 12** entries),
   `tests/db.queries.extractions.test.ts`, `tests/db.queries.shares.test.ts`,
   `tests/db.ownership.test.ts`, `tests/integration/queries.int.test.ts`. The
   integration suite is opt-in (`VITEST_INTEGRATION=1`) and was **typechecked but NOT
   run** — running it would hit the production database, which this session had no
   reason to touch.
7. **Kept and noted, per the leave-and-note rule** (details in Decisions):
   `getInsight`, the ownership predicates/asserters, `getActiveShareForRun`, and a
   dozen type-only exports with no external importers.
8. **Ran all gates at final state** (all green): `npx next typegen` +
   `npx tsc --noEmit` → 0 errors; `npx vitest run tests/db.` → 246/246 across 12
   files after each batch; full suite `npx vitest run` → 265 files / 5,093 tests
   (integration + live excluded by default); all six `ci:*` boundary guards pass
   (`ci:data-layer-guard`, `ci:client-secret-guard`, `ci:f08-guard`,
   `ci:llm-payload-guard`, `ci:f11-guard`, `ci:openrouter-guard`); eslint clean on all
   touched files; prettier `--write` on exactly the touched files; git tree clean.

## Code / Design Details

**The allowlist that existed to excuse the dead, before and after** (`scripts/
check-data-layer-invariants.mjs`, batch 1):
```js
// before — 4 entries, one of which was the dead pure helper itself
//   fillZeroMonths     — pure function, no database access at all
const ALLOWED_UNSCOPED = new Set([
  'getRunByShareToken',
  'isUniqueViolation',
  'listActiveUserIds',
  'fillZeroMonths',
])

// after — 3 entries
const ALLOWED_UNSCOPED = new Set(['getRunByShareToken', 'isUniqueViolation', 'listActiveUserIds'])
```
The mirror list in `tests/db.queries.shares.test.ts` asserts the unscoped-export set
*exactly*, so it shrank in lockstep — that test is why the guard file and reality
cannot drift apart silently. Its own comment was updated too ("`fillZeroMonths` is
pure" no longer names anything real).

**The invariant-completion list, measured at each commit** (`tests/
db.queries.reviewedOnly.test.ts` — "names every rollup-shaped export, so a new one
cannot be added silently"):
```
41b297e (session start)  15 entries   (…, getMonthlyTotals, getObservedMaxHr,
                                       getObservedMaxHrExcludingRun, …)
7bd9b85  (batch 1)       14 entries   − getMonthlyTotals
97e337a  (batch 2)       12 entries   − getObservedMaxHr − getObservedMaxHrExcludingRun
9b47833  (batch 3)       12 entries   (listExtractions was never rollup-shaped)
84ae30f  (batch 4)       12 entries   (deletePhoto was never rollup-shaped)
```
The regex in the same test lost its `^getMonthlyTotals$` alternative in batch 1 for
the same reason. The final 12: `countReviewedRunsStartedBefore`, `getAllTimeTotals`,
`getObservedMaxHrRun`, `getReviewedRunWindow`, `getReviewedRunsBefore`,
`getReviewedRunsWithChildren`, `getRunsBetween`, `getRunsInIsoWeek`,
`getRunsInMonth`, `hasOtherReviewedRunAtLocation`, `listRuns`,
`listRunsWithPhotoCounts`.

**The caller-substitution map** — what each dead read had been superseded by:
| Removed | Lives on as |
|---|---|
| `getMonthlyTotals` + `fillZeroMonths` | `lib/metrics` computing monthly totals from `getReviewedRunsWithChildren` (trends rebuild) |
| `getObservedMaxHr` (plain `max()`) | `getObservedMaxHrRun` — run-named, Tanaka floor + `asOf` cutoff in SQL (roadmap §4.4 rule 2) |
| `getObservedMaxHrExcludingRun` | same — superseded by the above before this session |
| `listExtractions` | `getExtraction` via the extraction poll endpoint |
| `deletePhoto` | `deleteRun` cascade; `removeChatPhotoAction` / `releaseBlobIfUnreferenced` in lib/nina |

**Per-commit diffstat** (from `git show --stat`):
```
7bd9b85  lib/db/queries.ts 75− | scripts/check-data-layer-invariants.mjs 8− |
         tests/db.queries.reviewedOnly.test.ts | tests/db.queries.rollups.test.ts 66− |
         tests/db.queries.shares.test.ts | tests/integration/queries.int.test.ts 26−
         6 files changed, 6 insertions(+), 188 deletions(-)
97e337a  lib/db/queries.ts 36− | tests/db.queries.reviewedOnly.test.ts 17− |
         tests/db.queries.rollups.test.ts 14− | tests/integration/queries.int.test.ts 13−
         4 files changed, 2 insertions(+), 78 deletions(-)
9b47833  lib/db/queries.ts 18− | tests/db.queries.extractions.test.ts 9−
         2 files changed, 27 deletions(-)
84ae30f  lib/db/queries.ts 12− | tests/db.ownership.test.ts 10−
         2 files changed, 22 deletions(-)
─────────
range 41b297e..84ae30f: 8 files changed, 8 insertions(+), 315 deletions(-)
lib/db/queries.ts: 1914 → 1777 lines
```

## Decisions & Trade-offs
- **Functions only, never schema — and the boundary was the design constraint, not a
  courtesy.** A dead export's row-shaped residue (columns only it read) stays in the
  database. That is the correct trade here: the repo's dev database IS production, a
  `DROP COLUMN` applies *after* the deploy, and drizzle's bare-select column expansion
  makes a dropped column break code that never named it. Dead columns cost nothing at
  runtime; dead functions cost reading time and get carried by guard lists. The
  8-file diffstat is the proof the line was held.
- **Leave-and-note, not remove-everything-unused.** Three categories with zero
  *external* callers were deliberately kept, each for a named reason:
  - `getInsight` — `saveInsight` calls it internally after insert-conflict, and unit
    tests exercise it directly. A caller is a caller. Noted as export surface wider
    than needed.
  - The ownership predicates `runSplitOwnedBy`/`runZoneOwnedBy`/`runPhotoOwnedBy`, the
    asserters `assertRunOwned`/`assertExtractionOwned`, and `getActiveShareForRun` —
    exported with only internal callers (+ direct test usage in
    `tests/db.ownership.test.ts`), but they are the module's *documented security
    vocabulary*; un-exporting them would trade a real convention for a smaller export
    list.
  - Type-only exports with no external importers (`RunAggregate`,
    `ReviewedRunWithChildren`, `AllTimeTotals`, `ObservedMaxHr`,
    `ReviewedRunBeforeRow`, `FieldErrorStat`, `NewPhotoInput`, `NewInsightInput`,
    `RunDetail`, `RunWithPhotoCount`, `SharedPhoto`, `RunAttachmentRow`) — they are
    the typed return surface of kept functions; un-exporting is possible but outside
    this session's functions-removal mandate.
- **One commit per concern**, so each removal's rationale, companion-test update, and
  guard-list shrink travel together and each commit passes its gates independently —
  a revert of any single batch is clean.
- **The integration suite was typechecked, not run.** `VITEST_INTEGRATION=1` exists
  precisely to keep the production database out of default runs, and there was no
  question this session needed answered from live data. Deleting integration tests
  for deleted functions cannot fail at runtime in a way typechecking misses.
- **`.workflows/` excluded from the caller grep after the first pass misattributed doc
  mentions as callers.** The correction happened before any decision consumed the
  wrong number. The residual known non-caller mention is `docs/plans/F03-data-layer
  .md`, which still names `getMonthlyTotals`/`getObservedMaxHr`/`fillZeroMonths` —
  historical plan text describing what was built, left untouched on purpose.

## Follow-ups & YAGNI notes
- **The same audit on `lib/nina/queries.ts`** (the nina data layer, ~2,000+ lines) is
  the obvious next pass — same method, same leave-and-note rule, same
  no-schema-drift boundary. The dynamic-channel sweep (namespace imports, bracket
  access, `db.query.*`) can be assumed empty-ish but should be re-verified, not
  assumed.
- **Un-exporting the internal-only types** in `lib/db/queries.ts` is a possible
  micro-pass if anyone wants it. Low value; the export list of *functions* was the
  thing with a maintenance annuity.
- **A doc-comment rot worth knowing about:** `queries.ts` function doc comments
  sometimes name their "only caller" (`getObservedMaxHr` claimed `resolveHrMax`) —
  those rots silently when the caller migrates, and this session had to fix one for a
  function it was *keeping* (`getObservedMaxHrRun` described itself relative to "the
  plain max() above"). The reviewed-only invariant-completion test is what actually
  catches export-surface drift; prose "only caller" claims should be treated as
  hearsay anywhere they appear.
- The audit's first-pass false positive (`.workflows/` doc mentions reading as
  callers) is recorded above; the next pass should exclude planning-doc directories
  from the outset.

## Appendix

**Commits (this branch, in order):**
```
7bd9b85 refactor(db): remove dead monthly-totals pair (getMonthlyTotals, fillZeroMonths)
97e337a refactor(db): remove orphaned HRmax reads (getObservedMaxHr, getObservedMaxHrExcludingRun)
9b47833 refactor(db): remove dead listExtractions
84ae30f refactor(db): remove dead deletePhoto
```

**Verification commands run (session) and their results:**
```
npx next typegen            # ok
npx tsc --noEmit            # 0 errors
npx vitest run tests/db.    # 246/246, 12 files — after every batch
npx vitest run              # 265 files / 5,093 tests (integration + live excluded by default)
npm run ci:* (6 guards)     # data-layer, client-secret, f08, llm-payload, f11, openrouter — all pass
eslint (touched files)      # clean
prettier --write (touched)  # then clean; git tree clean
```

**Doc-time re-verification** (done while writing this doc, tree at `84ae30f`):
`npx tsc --noEmit` clean; `npx vitest run tests/db.` → 246/246 across 12 files;
removals confirmed absent from `lib/db/queries.ts` by grep; kept-and-noted functions
confirmed present; `ALLOWED_UNSCOPED` measured at 3 entries; invariant-completion
list measured at 12 entries (15 → 14 → 12 across the commits). One correction to the
session's own notes: the invariant-completion list was recorded in-session as "now 13
entries"; measured from git it is **12** (batch 2 removed *two* entries, not one).

**Test-count reconciliation** (measured from the range diff):
20 `it()` blocks removed, 1 re-added → net −19; 5 of those in the opt-in integration
suite; default-suite delta −14 → 5,107 (main, post-photoReference) − 14 = 5,093,
matching the session's reported full-suite count exactly.

**References:** `docs/plans/F03-data-layer.md` (still names the removed functions —
historical plan text); `lib/metrics/hrMax.ts` (the surviving HRmax resolver);
`lib/metrics` trends (the surviving monthly-totals computation);
`docs/token_maxxing/2026-09-11-*.md` (the day's sibling sessions whose YAGNI method
this applied).
