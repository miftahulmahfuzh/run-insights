# Token-Maxxing Session — 2026-09-13: lib/metrics YAGNI Sweep + HrMaxSource Drift Investigation

## 🎯 Achievement / End Result
- **Goal of the burn:** Coordinator-assigned idea (worker session, no Step 4 menu): remove `lib/metrics`' 5 knip-flagged unused values and resolve its 8 unused types, specifically investigating why `HrMaxSource` is "defined separately in both `index.ts` and `types.ts`" before deciding removal vs. consolidation, then refresh its `package_readme.md`. The assigned Why called this "a likely real drift bug, not just dead code."
- **Concrete changes:**
  - `lib/metrics/index.ts` — removed 5 unused values (`tanakaEstimate`, `roundSharesTo100`, `avgPaceSecPerKm`, `FLAG_THRESHOLDS`, `computeVolumeDelta`) and 7 unused types (`HrMaxSource`, `FastestSlowestKm`, `SessionMetrics`, `FlagCode`, `WeekRunSummary`, `MonthRunSummary`, `DailyLoadPoint`).
  - `lib/metrics/types.ts` — removed the `export type { HrMax, HrMaxSource } from './hrMax'` re-export line entirely; kept the internal `import type { HrMax }` since the file still needs it for `SessionMetrics.hrMaxUsed`. Rewrote the file's top-of-file doc comment to describe the new reality.
  - `knip.ts` — documented `week.ts`'s `_distanceBucketsComplete` as a second known knip false positive (alongside the existing `EXTRACTION_SHAPE` entry), in the same "don't delete this, here's why" style.
  - `lib/metrics/.workflows/package_readme.md` — refreshed the Last Updated header, the "`types.ts` and the barrel" section (investigation + outcome + what was trimmed), and the Notes/Provenance section (new 2026-09-13 entry above the 2026-09-12 one).
  - 4 files touched total, 69 insertions / 36 deletions, one commit: `3f8a7b9` — "refactor(metrics): drop 5 unused barrel values + 8 unused re-exported types".
- **Real value delivered:**
  - Ruled out a suspected real bug with evidence rather than assuming it: `HrMaxSource` was never redeclared anywhere — it has exactly one declaration (`lib/metrics/hrMax.ts:15`) — so the "defined separately in two files" premise in the assigned idea was **false**, and the doc says so plainly.
  - Found the *actual* mechanism knip was flagging: two redundant re-export surfaces (the barrel and `types.ts`) that zero consumers in the repo actually import through — every real consumer imports `HrMaxSource`/`HrMax` straight from `./hrMax`, several with their own comments explaining why (keeping a runtime-graph test green).
  - Cross-verified every one of the 5 values and 7 remaining types individually by grepping their real consumers before touching anything, so nothing that's actually used anywhere got deleted — only the specific unused re-export surface.
  - Caught and preserved a 9th flagged-but-not-dead symbol (`_distanceBucketsComplete`) and converted it from "a future session might re-flag/delete this" into a documented, permanent knip exception.
  - Full verification loop green: knip clean (bar the now-documented exception), `next typegen` + `tsc --noEmit` clean, full vitest suite (332 files / 5744 tests) green, no regressions.
- **Branch:** token-maxxing-2026-09-13-lib-metrics-yagni
- **Merge status:** on branch (committed, not yet merged to main — worker awaiting coordinator `tokenmax-orch-2026-09-13` to land it)
- **Approx token burn:** high — full-repo grep-verification of 13 separate symbols across every consumer, plus knip/typegen/tsc/vitest verification passes 🔥

## Context & Motivation
This was not a self-directed token-maxxing session with a Step 4 menu of candidate ideas. It was a **worker session** spawned by a coordinator run, `tokenmax-orch-2026-09-13`, which pre-assigned this worker a single idea under the slug `lib-metrics-yagni` — verbatim:

> "Remove lib/metrics' 5 knip-flagged unused values and resolve its 8 unused types, specifically investigating why HrMaxSource is defined separately in both index.ts and types.ts before deciding removal vs consolidation, then refresh its package_readme.md; Why: a type defined twice across files is a likely real drift bug, not just dead code."

The coordinator's framing treated the `HrMaxSource` duplication as the headline risk — the idea's own "Why" asserts it's "a likely real drift bug." That assertion is the single most important thing this session had to check before doing any deleting, because if `HrMaxSource` really were declared twice, blindly deleting "the unused one" per knip's report could delete the *wrong* copy, or paper over an actual type-drift hazard rather than fix it. So the investigation in Step 2 below was treated as the load-bearing part of the session, not a formality.

## What We Did (blow-by-blow)

**1. Establish ground truth with knip.** Ran `npx knip --reporter json` and filtered the JSON output down to everything under `lib/metrics/`. This produced:
- 5 unused *values*, all in `lib/metrics/index.ts`: `tanakaEstimate`, `roundSharesTo100`, `avgPaceSecPerKm`, `FLAG_THRESHOLDS`, `computeVolumeDelta`.
- Unused *types* spread across three files:
  - `index.ts`: `HrMaxSource`, `FastestSlowestKm`, `SessionMetrics`, `FlagCode`, `WeekRunSummary`, `MonthRunSummary`, `DailyLoadPoint`
  - `types.ts`: `HrMax`, `HrMaxSource`
  - `week.ts`: `_distanceBucketsComplete`

Counting *unique type names* (not occurrences) gives exactly 8 — `HrMaxSource` counts once even though it's flagged in two files, `HrMax`, `FastestSlowestKm`, `SessionMetrics`, `FlagCode`, `WeekRunSummary`, `MonthRunSummary`, `DailyLoadPoint` — matching the assigned idea's count precisely, and confirming `_distanceBucketsComplete` in `week.ts` sits outside that count as a 9th, separate flag to handle on its own merits.

**2. Investigate the `HrMaxSource` premise directly.** Grepped the whole repo for every declaration and reference to `HrMaxSource`, and read `lib/metrics/hrMax.ts`, `lib/metrics/types.ts`, and `lib/metrics/index.ts` in full.

Finding: `HrMaxSource` has **exactly one declaration** in the entire repo — `lib/metrics/hrMax.ts:15`:
```ts
export type HrMaxSource = 'measured' | 'observed' | 'estimated'
```
Both `index.ts` and `types.ts` only ever **re-exported** it (`export type { HrMax, HrMaxSource } from './hrMax'`-shaped lines) — neither file redeclared its shape. `types.ts`'s own file-header comment already documented this as a deliberate rule before this session touched anything:

> "HrMax / HrMaxSource are RE-EXPORTED, never redeclared... a second, structurally-identical declaration would compile fine and then drift."

So the codebase had already anticipated and guarded against exactly the failure mode the assigned idea worried about — it just hadn't been re-verified that the guard was still holding. **Verdict: the "defined separately in both files" premise is false.** The real, narrower finding is that these were two redundant *re-export surfaces* for a singly-defined type, not two definitions — and knip flags both re-export lines as unused because literally nothing in the repo imports `HrMaxSource` via the barrel (`@/lib/metrics`) or via `@/lib/metrics/types`. Every real consumer — `lib/share/types.ts`, `lib/nina/context.ts`, `lib/llm/schema.ts`, `lib/llm/facts.ts` — type-imports it directly from `./hrMax` / `@/lib/metrics/hrMax`. `lib/share/types.ts`'s own comment explains this is deliberate: it keeps `tests/share.bundle.test.ts`, a runtime-graph test, passing by ensuring nothing ever imports `hrMax.ts` as a value through that path.

**3. Cross-check every other flagged symbol the same way.** For all 5 unused values and the remaining 7 index.ts types, grepped every consumer across the repo individually before deciding to remove or keep. Every single one had real, active consumers — just none of them went through the specific barrel/`types.ts` re-export surface knip was flagging. Example: `tanakaEstimate` is consumed by `app/me/page.tsx` and by `lib/metrics/hrMax.ts`'s own test file, but always imported straight from `./hrMax`, never via `@/lib/metrics`. This confirmed the session's actual character: a **redundant re-export cleanup**, not a dead-code-in-general cleanup. Nothing found here was genuinely dead code — it was all reachable and used, just unreachable through one specific flagged export surface.

**4. Handle the 9th flag, `_distanceBucketsComplete`, on its own merits.** This one is categorically different: it's a deliberate type-level completeness assertion in `week.ts`, and its own comment explains that the `export` keyword is load-bearing — needed so a linter/bundler can't strip it as dead code, which would silently defeat the assertion it exists to make. Left it untouched in the source. Since `knip.ts`'s header comment already documents one other known false positive (`EXTRACTION_SHAPE`) in a "don't delete this, here's why" format, added `_distanceBucketsComplete` as a second documented false positive in the same style and location, so a future YAGNI sweep doesn't re-litigate or accidentally delete it.

**5. Make the edits**, each gated on the grep-verification from steps 2–3:
- `lib/metrics/index.ts`: removed the 5 values and 7 (of the 8) types confirmed to have zero consumers via the barrel. Kept every barrel re-export individually confirmed to have a real barrel consumer somewhere in the repo: `computeSessionMetrics`, `evaluateSessionFlags`, `ZoneRow`, `SplitRow`, `ZonePctRow`, `SessionInput`, `HrMax`, `resolveHrMax`, `computeWeekMetrics`, `VolumeDelta`, `DistanceBucket`, `bucketForDistanceM`, `DISTANCE_BUCKETS`, `paceByBucket`, `VOLUME_JUMP`, `computeMonthMetrics`, `ACWR_OUT_OF_RANGE`, `ACWR_SWEET_SPOT`, `computeAcwr`, `isAcwrOutOfRange`, `Acwr`.
- `lib/metrics/types.ts`: removed the `export type { HrMax, HrMaxSource } from './hrMax'` line (accounting for the 8th type, `HrMax`, plus the second occurrence of `HrMaxSource`). Kept the plain `import type { HrMax } from './hrMax'` line, since `types.ts` still needs `HrMax` internally for its own `SessionMetrics.hrMaxUsed` field. Rewrote rule 1 of the file's "two rules govern this file" doc-comment block to state the new, accurate reality instead of the now-false "re-exported here and in the barrel" claim.
- `knip.ts`: added the `_distanceBucketsComplete` false-positive documentation.
- `lib/metrics/.workflows/package_readme.md`: refreshed the Last Updated header; rewrote the `types.ts`-and-the-barrel section's `HrMax`/`HrMaxSource` paragraph to describe the investigation and its outcome, and added a paragraph listing exactly what was trimmed and why; added a 2026-09-13 Notes/Provenance entry above the existing 2026-09-12 one describing this session and its verification.

**6. Verify.**
- `npx knip --reporter json` re-run: `lib/metrics` now shows zero unused exports/types except the documented `_distanceBucketsComplete` false positive.
- `npx next typegen` run first (a bare `npx tsc --noEmit` on a fresh worktree otherwise fails on unrelated `PageProps`/`LayoutProps`/`RouteContext` errors — a known missing-typegen artifact, not caused by this change), then `npx tsc --noEmit` — clean.
- `npx vitest run` — full suite, 332 test files, 5744 tests, all passed, no regressions.

**7. Commit.** Single commit on `token-maxxing-2026-09-13-lib-metrics-yagni`: `3f8a7b9` "refactor(metrics): drop 5 unused barrel values + 8 unused re-exported types", touching exactly `knip.ts`, `lib/metrics/.workflows/package_readme.md`, `lib/metrics/index.ts`, `lib/metrics/types.ts` — 4 files, 69 insertions, 36 deletions. `git status` was clean before and after except for those 4 files; nothing else in the working tree was touched.

## Code / Design Details

**Before (`lib/metrics/types.ts`, relevant excerpt):**
```ts
export type { HrMax, HrMaxSource } from './hrMax'
```
This line re-exported both names from `types.ts`, duplicating the barrel's own re-export of the same two names from the same source file — two parallel unused surfaces for the same single declaration.

**After:** that line is gone; `types.ts` keeps only:
```ts
import type { HrMax } from './hrMax'
```
used solely for `types.ts`'s own internal `SessionMetrics.hrMaxUsed: HrMax` field — no longer re-exported from this file at all.

**`lib/metrics/index.ts`:** trimmed to only the re-exports individually confirmed (via grep) to have at least one consumer importing through `@/lib/metrics` specifically — every symbol kept was checked, not assumed, and every symbol dropped was checked to have real consumers *elsewhere*, just never through this barrel.

**`knip.ts`:** the header comment already had a documented-false-positive block for `EXTRACTION_SHAPE` (a regex-scraped contract). `_distanceBucketsComplete` was added there in the same shape — name, location, and one-line reason ("export keyword is load-bearing; a linter would otherwise strip this completeness assertion as dead code").

## Decisions & Trade-offs
- **Kept `HrMax` importable inside `types.ts` as a plain (non-re-exported) `import type`, rather than removing it entirely**, because `types.ts` genuinely needs the type for its own `SessionMetrics.hrMaxUsed` field — removing it would have broken that file, which would be a real regression, not a cleanup.
- **Did not consolidate `HrMaxSource`'s single declaration into `types.ts` or the barrel**, despite the assigned idea raising "removal vs. consolidation" as the decision to make. Consolidation was rejected because there was nothing to consolidate — there was never a second declaration to merge with the first. Moving the single declaration would have meant touching `hrMax.ts`, which every real consumer already imports from directly and which nobody asked to change; that would have been unrelated churn for zero benefit.
- **Left `_distanceBucketsComplete` in `week.ts` completely untouched** rather than treating it as an 8th (or 9th) thing to "resolve." It is not dead code, and the assigned idea's count of 8 types already excluded it, which independently corroborates that this file's own reasoning for keeping it exported was sound and had already been factored into the idea's own math.
- **Documented, rather than silently ignored, the false premise.** The idea's Why explicitly predicted a drift bug. Rather than quietly doing the deletion and moving on, the package_readme's provenance section and this doc both state the premise was investigated and found false, with the evidence (single declaration location, re-export-only usage, deliberate direct-import pattern in every consumer) recorded — so a future reader doesn't have to redo the investigation or wonder if it was skipped.

## Follow-ups & YAGNI notes
- **No open follow-ups.** The barrel/`types.ts` re-export surface for `lib/metrics` is now knip-clean, and the one remaining knip flag in the directory (`_distanceBucketsComplete`) is intentionally not dead code and is now permanently documented as a false positive in `knip.ts`.
- **Do not re-propose** lib/metrics barrel cleanup or the `HrMaxSource` "defined twice" investigation in a future token-maxxing session — this session is a completed, evidence-backed closure of both, pending only the coordinator's merge to main.
- Nothing was deferred for lack of time or scope — the full assigned idea (5 values, 8 types, the `HrMaxSource` investigation, and the package_readme refresh) was completed in one commit.

## Appendix

**Key commands run:**
```bash
npx knip --reporter json          # initial scan, filtered to lib/metrics
# grep for every one of 13 flagged symbols' consumers repo-wide, individually
npx knip --reporter json          # re-run post-edit, confirms clean bar documented exception
npx next typegen                  # required before tsc --noEmit in a fresh worktree
npx tsc --noEmit                  # clean
npx vitest run                    # 332 files / 5744 tests, all green
git commit                        # 3f8a7b9
```

**Commit:** `3f8a7b9` — "refactor(metrics): drop 5 unused barrel values + 8 unused re-exported types"
**Files touched:** `knip.ts`, `lib/metrics/.workflows/package_readme.md`, `lib/metrics/index.ts`, `lib/metrics/types.ts` (4 files, +69/-36)
**Coordinator:** `tokenmax-orch-2026-09-13` · **Assigned slug:** `lib-metrics-yagni`
**Session type:** coordinator-assigned worker session (no Step 4 menu of candidate ideas — one idea given verbatim, executed and reported on)
