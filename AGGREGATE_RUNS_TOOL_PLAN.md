# Plan: AGGREGATE_RUNS_TOOL

**Slug:** aggregate-runs-tool
**Date:** 2026-09-16 09:23
**Analysis:** `20260916-092315-6LV6_code_analyzer.md`
**Worktree:** `/home/miftah/.worktrees/run-insights/aggregate-runs-tool`
**Branch:** `feature/aggregate-runs-tool` (base: `origin/main` @ `1e5af67`)
**Phases:** 1
**Status:** complete
**Coordinator:** —

---

## Why

The user wants Nina to answer numeric-summary questions ("what's my average run duration over the last 2 months") without loading every individual run into the turn and having the model average raw rows itself — inaccurate past a handful of rows, and expensive in context. The chosen design (from conversation) is a structured, Zod-validated tool matching the existing `lookup_runs`/`compare_runs` shape, whose handler runs one real SQL aggregate against Neon and returns a single precomputed number — not a free-form code/SQL-generation tool, since this repo has no code sandbox and z.ai's tool-calling surface here is a fixed-schema function call, not a code-execution primitive.

## Requirements

| ID | What the user asked for | Phases |
|---|---|---|
| R1 | Add `aggregate_runs`: a Zod-validated tool computing avg/sum/min/max/count over one run metric, over a date range, optionally filtered by intent, via a real SQL aggregate query — wired through the existing schema/dispatch/gateway/rollups layering. | 1 |

## Scope

**In scope:**
- New tool schema `AGGREGATE_RUNS_TOOL` in `lib/nina/prompts/tools.ts`, added to `NINA_TOOLS`.
- New Zod schema `AggregateRunsArgsSchema` in `lib/nina/schema.ts`.
- New handler `handleAggregateRuns` and a fourth `NinaToolGateway` method `aggregateRuns`, registered in `NINA_CORE_TOOL_SET` in `lib/nina/tools.ts`.
- New gateway implementation in `lib/nina/gateway.ts` (`dbNinaToolGateway.aggregateRuns`).
- New parameterized SQL-aggregate query function in `lib/db/queries/rollups.ts`, following `getAllTimeTotals`'s pattern.
- `NINA_PROMPT_VERSION` bump (`lib/nina/prompts/index.ts:91`, 7 → 8) with its changelog-comment convention.
- Test coverage: gateway fake extension + handler unit tests in `lib/nina/tools.test.ts`; new cases in `tests/db.queries.rollups.test.ts` and `tests/db.queries.reviewedOnly.test.ts` (both exist — the analysis's "no rollups test file was found" was wrong, corrected during phase planning); `tests/nina.prompts.test.ts:407-416` and `tests/fixtures/ninaTurn.ts` (fake gateway) both hard-code the tool/handler list and must be updated or the tree goes red. `tests/integration/ninaImageE2E.int.test.ts` uses `arrayContaining` and needs no edit (verified by the phase planner).

**Out of scope, and why:**
- Free-form code or SQL generation by the model (no sandbox exists in this repo; rejected in the design discussion).
- Forcing the model to call this specific tool (z.ai's `tool_choice` here only supports `'any'`, not a per-tool force) — improving the tool's `description` to raise pickup rate is allowed and expected, but tuning it empirically against live traffic is not this phase's job.
- Any metric beyond the six named (`durationSec`, `distanceM`, `avgPaceSec`, `avgHr`, `activeKcal`, `elevationM`) or any filter beyond `intent`.
- Week/month bucketing or multi-range comparison (e.g. "this month vs last month" in one call) — a single range, single number, per call.
- Updating `lib/nina/.workflows/package_readme.md` / `.workflows/todos.md` — that is the completion-handler's job after implementation, not this plan's.

## Invariants

1. The tree builds (`npx tsc --noEmit`) and all existing tests pass at the end of the phase.
2. **Invariant 9 (`lib/nina/queries.ts:40-43`) is preserved**: neither `lib/nina/tools.ts` nor `lib/nina/prompts/tools.ts` imports `runs`, the Drizzle schema, or `db` — the new capability reaches the database only through `NinaToolGateway.aggregateRuns`, implemented in `lib/nina/gateway.ts`, exactly like `loadRunHistory` today.
3. Every DB read in the new rollups function is scoped by `userId` in its `WHERE` clause and gated by `isNotNull(runs.reviewedAt)` (D16), matching every existing function in `lib/db/queries/rollups.ts`.
4. The new tool schema uses `additionalProperties: false`, marks every truly-required field `required` in the JSON Schema AND `"REQUIRED."`-prefixed in its description (the measured convention, `prompts/tools.ts:8-18`), and keeps descriptions terse (one clause) per the same measurement.
5. `NINA_CORE_TOOL_SET` gains exactly one tool; `NINA_CHAT_TOOL_SET`/`NINA_FULL_TOOL_SET` (built from it via `extendToolSet`) automatically include it — no edit needed in `imagetools.ts`/`avatartools.ts`/`turnrun.ts`.
6. No new column, index, or migration — the query reads existing `runs` columns only.

## Phases

| # | Title | Satisfies | Package | Files | Depends on | Difficulty | Plan | TaskID | Card |
|---|-------|-----------|---------|-------|-----------|------------|------|--------|------|
| 1 ✅ | Add `aggregate_runs` tool (schema, Zod, gateway, SQL, tests) | R1 | `lib/nina` + `lib/db/queries` | 11 | — | NORMAL | `.workflows/plan/aggregate-runs-tool/phase-1.md` | P1-NIN-A050 | — |

### Phase 1 — Add `aggregate_runs` tool
**Satisfies:** R1
**Owns:** `lib/nina/prompts/tools.ts`, `lib/nina/schema.ts`, `lib/nina/tools.ts`, `lib/nina/gateway.ts`, `lib/db/queries/rollups.ts`, `lib/nina/prompts/index.ts` (version bump), `lib/nina/tools.test.ts`, `tests/db.queries.rollups.test.ts`, `tests/db.queries.reviewedOnly.test.ts`, `tests/nina.prompts.test.ts`, `tests/fixtures/ninaTurn.ts`.
**Does not touch:** `lib/nina/turn.ts`, `lib/nina/imagetools.ts`, `lib/nina/avatartools.ts`, `lib/nina/turnrun.ts` (all pick up the new tool automatically via the `NINA_CORE_TOOL_SET` → `extendToolSet` chain), any migration file, `lib/nina/prompts/system.ts`, `tests/integration/ninaImageE2E.int.test.ts` (uses `arrayContaining`, needs no edit).
**Exit criteria:** `aggregate_runs` is callable end-to-end through `dispatchNinaTool`, returns a precomputed aggregate (never raw rows) for a valid request and a structured `isError: true` answer for an invalid one (bad enum, malformed date, `from > to`), every existing test still passes, `npx tsc --noEmit` is clean, and `NINA_PROMPT_VERSION` is 8.

## Reconciliation Log

single phase — nothing to reconcile

## Decisions

| Fork | Chosen | Rung |
|---|---|---|
| User's literal phrasing said "handler wired via `extendToolSet()` in `lib/nina/tools.ts`" — but `extendToolSet` is called *outside* `tools.ts` (in `imagetools.ts`/`avatartools.ts`) specifically to keep separate-infrastructure tools (image generation, avatar rotation) out of the core file; `aggregate_runs` is a pure DB-read tool with the same dependency profile as `lookup_runs`/`compare_runs`, which are registered directly in `NINA_CORE_TOOL_SET` inside `tools.ts` | Register `aggregate_runs` directly in `NINA_CORE_TOOL_SET` inside `lib/nina/tools.ts`, alongside `lookup_runs`/`compare_runs`/`save_memory` — not via a separate `extendToolSet` call site | 6: surrounding convention (the stated *reason* `extendToolSet` exists — module-boundary separation for tools with extra infrastructure — does not apply to this tool) |
| Whether `count` counts matching rows or non-null values of the chosen metric | `count` counts rows where the chosen metric column is non-null (so "how many runs have a recorded elevation gain" is answerable for a nullable metric; for the three not-null metrics this is identical to a row count) | 6: surrounding convention (`getAllTimeTotals`'s `runCount: count(*)` counts rows because every column it totals is not-null; the new function generalizes to nullable columns, so `count` must generalize with it to stay meaningful) |
| The tool's public date-range shape (inclusive end vs. the half-open `endExclusiveISO` every rollup function uses internally) | Tool input takes an **inclusive** `to` (what a model naturally reasons in, per RU-13's "she emits ISO dates" convention); the handler/query function converts to an exclusive upper bound internally, the same translation `monthRange`/`isoWeekRange` already perform for their callers | 6: surrounding convention |

## Open Questions

(none — every fork above is reversible: each is a naming/placement choice inside one new, unshipped tool, not a data-destroying or unrepeatable decision)

## Rollback

Revert the phase's commit(s) on `feature/aggregate-runs-tool`. No migration, no data written by this phase (the tool is read-only), no other phase depends on it. Reverting drops `aggregate_runs` from `NINA_TOOLS`/`NINA_CORE_TOOL_SET` and `NINA_PROMPT_VERSION` returns to 7.

## Next

Phase 1 landed (P1-NIN-A050, 2026-09-16). Single-phase set — nothing left to execute.
Merge the set as a whole:

    git checkout main && git merge feature/aggregate-runs-tool
