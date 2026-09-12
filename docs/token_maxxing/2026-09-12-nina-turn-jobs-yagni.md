# Token-Maxxing Session — 2026-09-12: Nina Turn/Imagejobs YAGNI Sweep & Gateway Bug Verdict

## 🎯 Achievement / End Result
- **Goal of the burn:** The coordinator's (`tokenmax-orch-2026-09-12`) assigned idea,
  verbatim: *"YAGNI-sweep lib/nina/turn.ts and lib/nina/imagejobs.ts for dead/unused
  exports, and resolve lib/nina/gateway.ts's recorded bug where imageDescriptions is
  hardcoded to [] for every window row (fix properly or clearly document why deferred).
  Why: large never-swept files, and the gateway bug has sat recorded-but-unfixed. Do NOT
  touch lib/nina/.workflows/package_readme.md."* A two-headed assignment: one sweep with
  real deletion risk, one recorded bug to either fix or explicitly close.
- **Concrete changes:** One commit, `86f40fd` — refactor(nina): YAGNI sweep turn.ts +
  imagejobs.ts — 4 files, +44/−45:
  - `lib/nina/turn.ts` — 3 dead exports made module-local: `NINA_MIN_REPAIR_BUDGET_MS`,
    `NinaTurnUsage`, `NinaTurnTrace` (each with a dated one-line note).
  - `lib/nina/imagejobs.ts` — 9 dead exports made module-local: `JOB_PHASE_QUEUED`,
    `JOB_PHASE_DISPATCHED`, `JOB_PHASE_RUNNING`, `NinaImageJobRow`, `NinaImageReopen`,
    `NinaImageClaim`, `NinaImageRevivable`, `NINA_JOB_LIST_LIMIT`, and
    `postNinaApologyMessage` (its only callers were `failNinaImageJob` and the stale
    sweep in the same file). Plus **deleted outright**: `getNinaImageJob`, the
    prod-dead single-job poll, with a tombstone comment at its site pointing at git
    history. `lib/nina/avatargen.ts:25`'s prose advertisement of the deleted function
    corrected.
  - `tests/nina.softDelete.test.ts` — `getNinaImageJob`'s one test block removed; the
    hidden-job `deletedAt` rule it covered survives in `getNinaImageJobDetail`'s
    identical WHERE clause and its own test.
  - **Zero code change to gateway.ts** — the recorded bug turned out to be stale
    (see Real value); the assignment's second head resolved as *already fixed*.
- **Real value delivered:**
  - **The gateway bug closed as PREMISE STALE, with receipts.** The recorded bug —
    `imageDescriptions: []` hardcoded into every window row — was **already fixed on
    origin/main by `f5cb107`** ("image-collection p3", R3, 2026-09-10, two days before
    this session). `gateway.ts` `readMessageWindow` now fetches
    `getNinaMessageImagesForMessages`, buckets described rows per message in `sort_order`,
    and maps `imageDescriptions: describedByMessage.get(row.id) ?? []`; undescribed
    history deliberately stays silent, a decision documented in the code itself
    (`gateway.ts:62`, `:146`). The contract is pinned by
    `tests/nina.gateway.window.test.ts` (5 assertions: described prose carried,
    multi-photo order, undescribed omitted, reference rows carried, empty window).
    `lib/nina/.workflows/todos.md` has no open item on it. The session's role was to
    verify the fix by effect — commit provenance, live code, and pinning tests — not
    to re-fix it.
  - **One stale artifact flushed out and flagged, not touched:** the only place the bug
    still "exists" is `lib/nina/.workflows/package_readme.md:300`, which still claims
    *"The gateway hardcodes imageDescriptions: [] into every window row (recorded gap,
    out of scope)"* — stale since `f5cb107`. This session was forbidden to touch that
    file; the correction is recorded here as a follow-up for the next package_readme
    pass.
  - **13 dead exports removed, each verdict on the record.** 12 un-exports + 1 deletion,
    none speculative: every one was checked against production *and* test consumers
    before the knife, and the kept-vs-cut reasoning is written down (below) so the next
    sweep doesn't re-litigate.
  - **A sweep method that survives knip's blind spots, applied where knip reported
    zero.** knip found nothing in either file — the sweep did not stop there, and it
    still found 13 things. The method (below) is the reusable part.
  - **All gates green on the post-sweep tree:** `npx tsc --noEmit` clean (after
    `npx next typegen`); 13 targeted vitest suites 238/238; full sweep 5234/5236 with
    the only 2 reds being the known MemoryTable add-row parallel-load flake (green
    20/20 serially under `--no-file-parallelism`); prettier --check clean on all 4
    changed files; knip re-run still zero scoped findings.
- **Branch:** `token-maxxing-2026-09-12-nina-turn-jobs-yagni` (worktree
  `tokenmax-2026-09-12-nina-turn-jobs-yagni`), head `86f40fd`.
- **Merge status:** on branch, **awaiting coordinator landing** — the worker does not
  merge to main; coordinator `tokenmax-orch-2026-09-12` owns the merge (same contract
  as the other 2026-09-12 worker sessions).
- **Approx token burn:** no meter was read; by shape this was a mid-weight worker
  session whose spend is verification-dominant over a tiny diff — the full 44-symbol
  inventory and per-symbol prod-vs-test grep, the knip adoption memory's extra steps
  (import-statement extraction via python DOTALL, turnrun indirection resolution), a
  premise-stale bug investigation that read commit history, live code, and pinning
  tests before concluding "nothing to fix," and the full gate battery including a
  serial re-run to separate the known flake from the diff. The tokens bought certainty:
  13 cuts with no red gate anywhere. 🔥🔥

## Context & Motivation
`lib/nina` is the repo's largest and most churned lib package, and its two biggest
files — `turn.ts` (the turn engine) and `imagejobs.ts` (the image-job lifecycle) — had
never had a dedicated dead-export pass: earlier 2026-09-11/12 sweeps covered
`lib/nina/queries` (the one dead query export, closed 2026-09-11) and the todo/readme
surfaces, but not these. Both files grew wide `export` surfaces during the phased
nina build-out (phases 13/15 among others), and phase-scoped builds habitually export
more than the final wiring consumes.

The gateway bug was the assignment's second head: the package readme records it as an
open gap, and recorded-but-unfixed bugs age into either real incidents or stale
premises — the session's job was to make it one or the other, explicitly.

Worker mode: the idea arrived pre-chosen from the coordinator; no Step-4 menu this
session.

## What We Did (blow-by-blow)
1. **Gateway bug first — it was the riskier half.** Read the recorded claim at
   `lib/nina/.workflows/package_readme.md:300`, then read `gateway.ts` live: the fix is
   already in. `readMessageWindow` calls `getNinaMessageImagesForMessages`, builds
   `describedByMessage` (a `Map<string, string[]>` bucketing descriptions per message in
   `sort_order`), and maps each row with `imageDescriptions: describedByMessage.get(row.id)
   ?? []`. The `?? []` is the residue the readme recorded — but it is now the *correct*
   fallback for undescribed rows, not a blanket hardcode. The code comment at `:62` and
   the fix-history note at `:146` document both the original defect and the deliberate
   decision to keep undescribed history silent. Provenance: `f5cb107` on origin/main
   ("image-collection p3", R3, 2026-09-10). Contract pinned by
   `tests/nina.gateway.window.test.ts`, 5 assertions. `todos.md`: no open item.
   Verdict: **nothing to fix, nothing to defer — the premise was stale.** The only live
   trace of the bug is the readme line itself, which this session was forbidden to edit.
2. **knip pass — zero findings, sweep continues anyway.** `npm run knip` reported
   nothing in either scoped file. Per the 2026-09-12 knip-adoption memory, knip has
   known blind spots (regex-scraped contracts, test-only consumers it can't see through,
   twin names), and a zero from the tool is a finding about the tool, not the files. So
   the manual method ran in full.
3. **Manual sweep method, in order:**
   - Full read of both files, top to bottom.
   - A **44-symbol inventory** of every `export` in both files.
   - **Per-symbol word-boundary grep**, split prod vs test — word boundaries because
     `NINA_JOB_LIST_LIMIT` must not match a longer name, and the split because a
     test-only export is a different verdict than a dead one.
   - **Import-statement extraction, single + multiline, via python DOTALL regex** —
     plain grep overcounts here because this repo's docstrings *name symbols in prose*:
     e.g. `lib/db/schema.ts`'s "consumers" of one symbol were comments, and
     `lib/llm/extract.ts`'s `productionDeps` is a twin name, not an import.
   - **turnrun indirection resolved:** `actions.ts` gets `runNinaTurn` via
     `turnrun.ts`, which imports it from `turn` — a two-hop consumer still counts as
     alive, and naive per-file grepping misses the hop.
4. **Verdicts applied.** 12 exports with zero consumers anywhere (not even tests) made
   module-local, each annotated with a dated one-line note so the next reader knows the
   narrowing was deliberate and when. 1 export deleted outright (below). Everything
   else got an explicit keep verdict (below).
5. **`getNinaImageJob` deleted, not just un-exported.** It was prod-dead — a
   single-job poll whose docstring claimed it was "provided for polling" but nothing
   ever polled one: the jobs page polls `listNinaImageJobs`, the chat page polls its
   turn, and phases 13/15 shipped without calling it. Its prose advertisement in
   `avatargen.ts:25` was corrected, and its one test block removed from
   `tests/nina.softDelete.test.ts` — carefully: the test also covered the hidden-job
   `deletedAt` rule, and that rule survives in `getNinaImageJobDetail`'s identical
   WHERE clause with its own test, so no coverage was actually lost. A tombstone
   comment at the deletion site (`imagejobs.ts:752`) points at git history for anyone
   grepping the old name.
6. **Gates, in order:** `npx next typegen` (a fresh worktree's PageProps errors are
   missing typegen, not the diff) → `npx tsc --noEmit` clean → 13 targeted vitest
   suites 238/238 → full sweep 5234/5236, the 2 reds both the known MemoryTable
   add-row parallel-load flake, re-run serially (`--no-file-parallelism`) green 20/20
   → `prettier --check` clean on all 4 changed files → knip re-run, still zero scoped
   findings. Committed as `86f40fd` with pathspec-scoped add/commit.

## Code / Design Details
**The fixed gateway mapping (verified, not written, this session)** — `gateway.ts`,
the relevant shape:

```ts
const describedByMessage = new Map<string, string[]>()
for (const image of await getNinaMessageImagesForMessages(...)) {
  const bucket = describedByMessage.get(image.messageId)
  if (bucket == null) describedByMessage.set(image.messageId, [image.description])
  else bucket.push(image.description)
}
// per row:
imageDescriptions: describedByMessage.get(row.id) ?? [],
```

The `?? []` fallback that once looked like "the bug" is now the deliberate
 undescribed-row case — the difference between the stale premise and the live code is
the bucketing fetch above it.

**The un-export pattern** — every cut export keeps its body and gains a dated note;
only the `export` keyword goes:

```ts
// Un-exported 2026-09-12 (YAGNI sweep): zero consumers anywhere, incl. tests.
const NINA_MIN_REPAIR_BUDGET_MS = ...;
```

Module-local is reversible at zero cost; deletion is reserved for symbols whose
*reason to exist* is gone (`getNinaImageJob`).

**The deletion's coverage argument** — `getNinaImageJob`'s WHERE clause (hidden jobs
with `deletedAt` excluded) is character-for-character the same rule
`getNinaImageJobDetail` enforces, and the detail variant has its own test. Removing
the dead twin removes no invariant.

## Decisions & Trade-offs
- **Verify-by-effect for the stale premise.** Rather than trust the readme's claim or
  a quick glance at the `?? []`, the session triangulated three ways: commit
  provenance (`f5cb107` on origin/main), live code shape, and the pinning test file.
  A stale premise confirmed from one source would have invited either a duplicate fix
  or a wrong "deferred" writeup.
- **Un-export vs delete.** Constants and types with zero consumers got the reversible
  cut (module-local + note); the one function whose docstring claimed a caller that
  never materialized across two shipped phases got the irreversible cut with a
  tombstone. The bar for deletion: not "no consumers" but "no *reason*."
- **Test-pinned contracts stay exported.** `NINA_MIN_ROUND_BUDGET_MS`,
  `MAX_TOOL_ROUNDS`, `NINA_MAX_TOKENS`, `NinaTurnResult`, `NinaTurnInput` (turn.test.ts
  et al.), `ninaClient` (tests/live), `runNinaTurnWith` (the documented testable-core
  seam), `sweepStaleNinaImageJobs` (softDelete test) — under the knip bar, tests count
  as consumers. Widening to "prod consumers only" would have cut real coverage seams.
- **Cross-file-alive exports stay.** `NINA_TURN_BUDGET`/`NINA_BURST_MAX_MESSAGES`/
  `runNinaTurn`/`productionDeps`/`NinaTurnSource` (turnrun, proactive, chatturn,
  gateway), `ninaModel` (chatturn), `NinaLlmClientLike` (llmFallbackText),
  `NinaTurnRow`/`NinaTurnStore` (chatturn, gateway), and imagejobs' whole read/write
  surface (imagerun, jobActions, avatargen, selfiegen, admin/imageGenActions, the
  app/nina pages — the about page imports `NinaImageJobRecord`). Two files look
  self-contained; neither is.
- **The forbidden file stayed forbidden.** The stale readme line is the session's
  most actionable finding and it could not be fixed in-place; writing it down here
  (and in the follow-ups) is the compliant alternative, not a workaround.

## Follow-ups & YAGNI notes
- **Stale readme line (the flagged artifact):** `lib/nina/.workflows/
  package_readme.md:300` still records the gateway `imageDescriptions` gap as open —
  stale since `f5cb107` (2026-09-10). The next package_readme session on lib/nina
  should correct it; this session was forbidden to touch that file.
- **knip repo-wide menu (measured 2026-09-12, output not persisted):** ~150 unused
  exports + 116 unused exported types, heavily concentrated in lib/nina (context.ts,
  tools.ts, memory.ts, persona.ts, proactive.ts, …). A ready-made menu for future
  YAGNI sessions, one package at a time, using this session's prod-vs-test grep method
  (prose docstrings defeat naive grep).
- **Two duplicate exports knip found** (renames-in-waiting, each a small session or a
  rider):
  - `NinaMemoryWriteSchema` | `SaveMemoryArgsSchema` (`lib/nina/schema.ts`)
  - `NINA_BACKGROUND_BUDGET_MS` | `NINA_TURN_POLL_GIVE_UP_MS` (`lib/nina/turnflight.ts`)
- **Deliberately NOT done:** no signature changes to any kept export (this was a
  visibility sweep, not an API redesign); no consolidation of the duplicate exports
  (out of scope, needs its own consumer census); no touching `package_readme.md`.

## Appendix
- **Commit:** `86f40fd` — refactor(nina): YAGNI sweep turn.ts + imagejobs.ts —
  un-export never-imported surface, delete dead getNinaImageJob. 4 files, +44/−45:
  `lib/nina/avatargen.ts`, `lib/nina/imagejobs.ts`, `lib/nina/turn.ts`,
  `tests/nina.softDelete.test.ts`.
- **Gateway fix provenance:** `f5cb107` feat(admin): one describe control on every
  photo; described photos reach Nina's context (image-collection p3) — R3, 2026-09-10,
  on origin/main.
- **The 12 un-exports:** turn.ts — `NINA_MIN_REPAIR_BUDGET_MS`, `NinaTurnUsage`,
  `NinaTurnTrace`; imagejobs.ts — `JOB_PHASE_QUEUED`, `JOB_PHASE_DISPATCHED`,
  `JOB_PHASE_RUNNING`, `NinaImageJobRow`, `NinaImageReopen`, `NinaImageClaim`,
  `NinaImageRevivable`, `NINA_JOB_LIST_LIMIT`, `postNinaApologyMessage`.
- **The 1 deletion:** `getNinaImageJob` (imagejobs.ts), tombstone at `imagejobs.ts:752`.
- **Gates:** typegen + `tsc --noEmit` clean; targeted 238/238 (13 suites); full sweep
  5234/5236 (2 reds = MemoryTable add-row parallel-load flake, 20/20 serial); prettier
  clean ×4; knip zero scoped findings before and after.
- **Method receipts (knip blind spots this repo actually has):** prose docstrings that
  name symbols (`lib/db/schema.ts` comment-"consumers"), a twin name
  (`lib/llm/extract.ts` `productionDeps`), and turnrun indirection
  (`actions.ts` → `turnrun.ts` → `turn.ts`) — each would have flipped a naive verdict.
