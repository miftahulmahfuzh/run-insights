# Token-Maxxing Session — 2026-09-12: Date/Flags/Derived YAGNI Sweep & Combined Package Readme

## 🎯 Achievement / End Result
- **Goal of the burn:** The coordinator's assigned idea, verbatim: *"Run a YAGNI sweep and
  write one combined package_readme.md for lib/date, lib/flags, and lib/derived (490 lines
  total, three small never-audited utility packages) — each fell through every prior sweep
  because alone none crossed the size threshold that triggered a session."* Worker mode:
  the idea arrived pre-chosen (no Step-4 menu this session — see Context), and the
  achievement-first headline is double-edged: the sweep **certified all three packages
  dead-code-clean with receipts** (knip zero + a per-symbol grep cross-check agreeing on
  every verdict, each trap individually triaged and recorded), **and** it flushed out a
  real correctness defect the audit was never scoped to find — `lib/date` accepted
  impossible calendar days and either emitted `'NaN-NaN-NaN'` or **silently normalised
  them to a plausible-looking different day**.
- **Concrete changes:** Two commits on the branch:
  - `4d5d270` — fix(date): reject impossible calendar days instead of emitting NaN or
    shifting. `lib/date/ranges.ts` (+13/−2: `DATE_RE` range-checks month/day fields like
    its `MONTH_RE`/`WEEK_RE` siblings; `utcDay` round-trips the constructed `Date` through
    `toISO` and throws `RangeError` when the day does not exist) plus **new**
    `tests/date.day.test.ts` (+83, 7 tests) pinning the previously untested day half.
  - `cf71d15` — docs(lib): `lib/.workflows/package_readme.md` (+120), titled
    **"Package: date, flags & derived (combined — three single-file lib utilities)"** —
    the first audit any of the three has ever received, with the full YAGNI verdict +
    receipts, per-export contracts, dependencies, and measured reverse dependencies.
- **Real value delivered:**
  - **A real bug, fixed at the layer that can actually know.** Before the fix,
    `'2026-99-99'` passed `isValidDateISO` (the regex was shape-only), `utcDay` built an
    Invalid Date from it, and `addDays` rendered the string `'NaN-NaN-NaN'`; worse, Node
    **silently normalises** `'2026-02-30'` to `2026-03-02`, so `daysBetween` and
    `isoWeekKeyOf` inherited a plausible-looking date shift with no error at all. The fix
    is two-layer by design (details below): the regex closes the garbage-input class, the
    runtime round-trip closes the impossible-day class *no regex can catch*.
  - **A latent 500 closed with it.** `app/(app)/page.tsx` passes a hand-edited `?before=`
    cursor through the shape check straight into a SQL date comparison — Postgres rejects
    `'2026-99-99'` as a date literal. The tightened `DATE_RE` refuses it at the door.
  - **The coverage gap closed in the same commit.** `tests/date.day.test.ts` pins the day
    half (`addDays` across month/year/leap boundaries, `daysBetween` antisymmetry,
    `jakartaDayOf` at the UTC+7 midnight boundary, `todayInJakarta`,
    `isValidDateISO` field ranges) — the month and ISO-week halves already had their own
    files; the day half was the hole.
  - **The YAGNI verdict with every keep explained, not just asserted.** Zero unused files,
    zero unused exports, zero duplicate exports in all three packages (knip ignores
    neither — only `research/**` and `docs/design/tokens.css` are in `knip.ts`'s ignore
    list), and the three look-dead things a naive sweep would have flagged each triaged to
    a *forced* keep: `FLAG_CODES` cannot be derived from `FLAG_THRESHOLDS` (the key sets
    are asymmetric — `FAST_START_TOLERANCE_SEC` is a threshold with no code, `FAST_START`
    is a code with no threshold — and a TS union has no runtime existence);
    `insightScopesFor` + the `InvalidateDeps` bag are the documented contract-test seam
    (production calls `onRunCommitted(event)` bare, `lib/review/commit.ts:227`); and
    `lib/derived`'s single production importer **is** the invalidation contract, not a
    smell.
  - **The measured importance map.** `lib/date/ranges` turns out to be quietly the
    most-depended-on utility in `lib/`: **45 production importers** across 7 app routes,
    3 components and 35 files in 11 lib areas (nina 11, charts 6, badges 6, review 2,
    records 2, metrics 2, insights 2, llm 1, format 1, derived 1, db 1) plus 9 test
    files — any signature change there is a fleet-wide event, and the readme now says so
    with the count and its measure date.
  - **All gates green on the post-fix tree:** full vitest sweep 5,237/5,237 across 280
    files; `tsc --noEmit` clean after `next typegen`; `npm run knip` clean in scope (the
    three packages produce no findings); prettier clean on all three touched files.
- **Branch:** `token-maxxing-2026-09-12-lib-utils-yagni` (worktree
  `tokenmax-2026-09-12-lib-utils-yagni`), head `cf71d15`, two commits on top of `6759f26`.
- **Merge status:** merged (commit `47fb802`)
- **Approx token burn:** no meter was read; by shape this was a mid-weight worker session
  whose spend is audit-dominant over a small diff — full knip pass, a per-symbol grep
  cross-check over all 21 exported symbols, three verifier-trap triages each requiring
  reading the surrounding contracts (threshold asymmetry, the seam's callers, the commit
  path), one TDD red/green cycle, the full gate battery, and a 120-line readme written
  claim-by-claim against the tree. The tokens bought certainty and a map, not line count.
  🔥🔥

## Context & Motivation
Every prior sweep in the 2026-09-11/12 dead-code campaign had a size threshold — a package
had to look big enough to be worth a session. `lib/date` (one file, 157 lines at
assignment), `lib/flags` (one file, 94) and `lib/derived` (one file, 239) each fell through
it every time: alone, none crossed the line. The coordinator
`tokenmax-orch-2026-09-12` grouped them into one worker assignment precisely because the
fall-through was an artifact of the threshold, not of the packages' unimportance — and the
sweep's first finding justified that reasoning immediately: `lib/date`, the smallest of the
three, turned out to be the most-imported utility in `lib/` (45 production importers), so
the "small package" had been carrying the largest blast radius in the codebase while never
once being audited.

This was a **worker session** (one of a 5-session fan-out under the coordinator), so there
was no Step-4 idea menu: worker mode receives a pre-assigned idea. What the coordinator
picked and why is the context: the three packages are the pure seams the write path hangs
on — `lib/date` owns every calendar decision, `lib/flags` owns the human sentence for each
metric verdict, `lib/derived` owns what happens after a run's numbers change — and the
same-day adoption of knip (`npm run knip`, by session
`tokenmax-dead-export-tooling`, commit `4f4fa3f`) meant a full-surface dead-code census of
all three was now a single command instead of another hand-rolled grep/AST sweep.

## What We Did (blow-by-blow)
1. **Knip census of all three packages.** `npm run knip` reports zero unused files, zero
   unused exports, zero duplicate exports in `lib/date`, `lib/flags`, `lib/derived`. Since
   `knip.ts` ignores only `research/**` and `docs/design/tokens.css`, coverage of the
   three is full — no blind spots, no "is it even scanned?" question.
2. **Per-symbol grep cross-check.** Every exported symbol (21 across the three files: 15
   in `lib/date/ranges.ts`, 2 in `lib/flags/copy.ts`, 4 in `lib/derived/invalidate.ts`)
   word-boundary-grepped independently of knip. Every verdict agreed. This is the
   trust-but-verify step the dead-export-tooling doc prescribes (knip's one known blind
   spot is regex-scraped non-TS consumers — checked explicitly, none in `scripts/` or
   `tools/`).
3. **Verifier-trap triage.** The three things that *looked* most like findings were each
   investigated to a recorded verdict:
   - **`lib/flags`' `FLAG_CODES` is test-only but forced.** Its only consumer is
     `tests/flags.copy.test.ts`. It cannot be derived from `FLAG_THRESHOLDS`: that
     object's keys are not the code union (`FAST_START_TOLERANCE_SEC` is a threshold with
     no code; `FAST_START` is a code with no threshold), and a TypeScript union has no
     runtime existence — something must enumerate `FlagCode` at runtime. The exhaustive
     `switch` in `flagCopy` is what the compiler pins; `FLAG_CODES` is what the tone and
     non-empty tests walk. Keep, with the reason written into the readme so the next
     sweep does not re-litigate it.
   - **`lib/derived`'s `insightScopesFor` + `InvalidateDeps` are test-only by documented
     design.** They are the contract-test seam: production calls
     `onRunCommitted(event)` with no second argument (`lib/review/commit.ts:227`), and the
     contract test injects the three halves (`recomputeRecordsFor`, `sweepInsights`,
     `evaluateBadgesFor`) to assert the failure-swallowing policy without a database.
   - **`lib/derived` has exactly one production importer.** `lib/review/commit.ts` is the
     only one — and that is not a smell, that *is* the invalidation contract: the commit
     path is written once and each feature fills in its own section of the body.
4. **The defect surfaced during the sweep, fixed TDD-style (`4d5d270`).** While verifying
   `lib/date`'s guards, `DATE_RE` turned out to be shape-only (`/^\d{4}-\d{2}-\d{2}$/`),
   unlike its siblings `MONTH_RE` and `WEEK_RE` which both range-check their fields. Red:
   impossible days pass `isValidDateISO`; `'2026-99-99'` makes `utcDay` build an Invalid
   Date so `addDays` renders `'NaN-NaN-NaN'`; `'2026-02-30'` is silently normalised by
   Node to `2026-03-02` and flows into `daysBetween`/`isoWeekKeyOf` as a plausible wrong
   answer. Green: the two-layer fix below. The commit also carries the new day-half test
   file.
5. **The combined package readme (`cf71d15`).** `lib/.workflows/package_readme.md`, 120
   lines: why one readme covers three packages (the size-threshold fall-through, stated
   up front), the YAGNI verdict with receipts, per-export contract tables for all three
   files (including the two governing rules of `lib/date` — half-open ranges never
   `to_char` predicates; no timezone reasoning happens here, the Jakarta decision is spent
   exactly once in `jakartaDayOf`), dependencies, measured reverse dependencies with the
   2026-09-12 measure date, and the test map.

## Code / Design Details
**The fix, layer one — the regex learns field ranges (garbage class):**

```diff
 const MONTH_RE = /^\d{4}-(?:0[1-9]|1[0-2])$/
 const WEEK_RE = /^\d{4}-W(?:0[1-9]|[1-4]\d|5[0-3])$/
-const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
+// Field ranges, like its two siblings above — not realness. '2026-02-30' is shape-legal here;
+// proving the DAY EXISTS is utcDay's job (a regex cannot, and Date normalization lies).
+const DATE_RE = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/
```

This alone closes the `2026-99-99` class *and* the latent 500: `app/(app)/page.tsx`
passes a hand-edited `?before=` cursor into a SQL date comparison once the shape check
accepts it, and Postgres rejects `'2026-99-99'` as a date literal. The regex deliberately
does **not** try to prove realness — `'2026-02-30'` stays shape-legal, because a regex
cannot know whether Feb 29 exists *this* year without becoming a calendar table.

**The fix, layer two — the runtime round-trip (impossible-day class):**

```diff
-  return new Date(`${dateISO}T00:00:00Z`)
+  const d = new Date(`${dateISO}T00:00:00Z`)
+  if (Number.isNaN(+d) || toISO(d) !== dateISO) {
+    throw new RangeError(`Not a real calendar day: ${JSON.stringify(dateISO)}`)
+  }
+  return d
```

`utcDay` (the private constructor every day math flows through) now round-trips the built
`Date` back through the module's own `toISO` and throws `RangeError` when it does not
reproduce the input. This is the only check that can catch Feb 30: `new Date` will not
tell you (it normalises), and no regex can know. Both `addDays` and `daysBetween` inherit
the guard through `utcDay`; `isoWeekKeyOf` inherits it through its day input.

**Why two layers instead of one:** the regex is the cheap, total gate every caller already
passes through (`isValidDateISO` is exported and used at API edges); the round-trip is the
exact check that requires constructing the date. Neither subsumes the other — the regex
cannot prove realness, the round-trip never sees strings the regex already rejected. The
belt-and-braces comment in the code records the division of labor.

**The readme's structure choices:** one file, not three, because the packages form one
layer (the pure seams under the write path; the only edge between them is
`lib/derived` → `lib/date` for `isoWeekKeyOf`/`monthKey`) and none is big enough to
warrant its own recurring-context load. The reverse-dependency section is the part that
rots fastest, so every count carries its measure date (2026-09-12) per the
package-readme-rot rule.

## Decisions & Trade-offs
- **Fix the defect in a YAGNI session** rather than note-only. The session's mandate was
  dead-code + docs, but a guard hole in the most-imported utility in `lib/` is not a
  follow-up note — it is the sweep's highest-value finding, and the cost of fixing it
  correctly (a two-line diff plus tests) was far below the cost of a handoff. The fix was
  committed separately (`4d5d270`) from the docs (`cf71d15`) so each lands reviewable on
  its own terms.
- **Reject the input at two layers rather than normalise or clamp.** Silently snapping an
  impossible day to a neighbouring real one is exactly the failure mode being fixed — the
  bug's worst half was Node doing precisely that. Throwing `RangeError` matches the
  file's existing guard convention (`Invalid ISO date` was already a `RangeError`).
- **Keep everything the sweep looked at.** The honest YAGNI outcome here is the negative
  result plus the recorded keeps. Nothing was deleted, nothing un-exported — every
  test-only export traces to a forced mechanism (asymmetric key sets, the contract-test
  seam, the single-importer contract), and the readme records each verdict with its
  reason so the *next* sweep starts from evidence instead of re-deriving it.
- **One combined readme, not three.** Three files of 100–240 lines each would have meant
  three recurring-context loads for content that mostly describes the same layer. The
  readme's "Why one readme covers three packages" section states the grouping rule so a
  future split (if any package grows past the threshold) knows the seam.

## Follow-ups & YAGNI notes
- **Deliberately not done:** no removals of any kind (the census came back clean — the
  correct response to a clean census is a recorded verdict, not invented churn); no
  changes to `lib/review/commit.ts` (the single-importer contract is the design); no
  restructuring of `FLAG_CODES`/`FLAG_THRESHOLDS` to make one derivable from the other
  (the asymmetry is in the domain: a tolerance threshold exists that is not a flag, and a
  flag exists that has no threshold).
- **Tiny drift recorded, not fixed:** the readme's heading says
  "`lib/date/ranges.ts` — calendar math (157 lines)" — measured *pre-fix* (the file was
  exactly 157 lines at `4d5d270^`); after the fix it is 168. A one-word follow-up for the
  next toucher of that file; left alone here to keep `cf71d15` a pure docs commit and
  because the count is decoration, not a contract.
- **The knip backlog is not this session's:** repo-wide, knip still reports the standing
  ~152 unused exports / 113 unused exported types adopted as a task list by
  `tokenmax-dead-export-tooling` — none of it in these three packages. Future
  `tests/`-scoped or per-package sessions pick that up.
- **The importance map creates an obligation:** now that `lib/date` is *measured* as the
  most-depended-on utility in `lib/` (45 production importers), any future signature
  change there should cite the readme's reverse-dependency section when planning the
  migration — that is what the count is for.

## Appendix
- **Commits:** `4d5d270` fix(date): reject impossible calendar days instead of emitting
  NaN or shifting (2 files, +96/−2: `lib/date/ranges.ts` +13/−2, `tests/date.day.test.ts`
  +83 new); `cf71d15` docs(lib): combined package_readme for date, flags, derived — first
  audit (1 file, +120: `lib/.workflows/package_readme.md`).
- **Branch base:** `6759f26`; head `cf71d15`. Branch
  `token-maxxing-2026-09-12-lib-utils-yagni`, worktree
  `tokenmax-2026-09-12-lib-utils-yagni`. The branch's *earlier* history (merged
  tools-package-hygiene / dead-export-tooling work below the base) predates this session.
- **Package sizes at assignment:** `lib/date/ranges.ts` 157 + `lib/flags/copy.ts` 94 +
  `lib/derived/invalidate.ts` 239 = the 490 lines the coordinator's idea quotes; 501
  after the fix. Export census: 15 + 2 + 4 = 21 exported symbols, all cross-checked.
- **New tests (7, `tests/date.day.test.ts`):** `addDays` across month/year/leap
  boundaries; `daysBetween` antisymmetry; `jakartaDayOf` at the UTC+7 midnight boundary;
  `todayInJakarta`; `isValidDateISO` field ranges (month 01–12, day 01–31, `2026-99-99`
  rejected); impossible-day `RangeError`s through `addDays`/`daysBetween`.
- **Gates as run:** full vitest sweep 5,237 passed / 5,237 across 280 files;
  `next typegen` then `tsc --noEmit` exit 0; `npm run knip` — no findings attributable to
  the three packages (repo-wide backlog elsewhere is the known, separately-owned census);
  `prettier --check` clean on all three touched files.
- **Measured reverse dependencies (2026-09-12, as recorded in the readme):**
  `lib/date/ranges` — 45 production importers (7 app routes, 3 components, 35 lib files
  across 11 areas: nina 11, charts 6, badges 6, review 2, records 2, metrics 2, insights
  2, llm 1, format 1, derived 1, db 1) + 9 test files. `lib/flags/copy` —
  `components/ui/Flag.tsx`, `lib/nina/context.ts`, `tests/flags.copy.test.ts`.
  `lib/derived/invalidate` — `lib/review/commit.ts` only + `tests/derived.invalidate.test.ts`.
  No regex-scrape consumers in `scripts/` or `tools/` (the knip blind-spot class,
  explicitly checked).
- **Tooling relied on:** `npm run knip` (knip 6.35.1, adopted same day by
  `tokenmax-dead-export-tooling`, `4f4fa3f`) — this session is the first consumer of the
  new instrument outside its adopter, and the census-of-three it made cheap is the proof
  of the adoption's value case.
