# Token-Maxxing Session — 2026-09-13: Nina Imagejobs Concurrency Audit

## 🎯 Achievement / End Result
- **Goal of the burn:** A WORKER session (slug `nina-imagejobs-audit`) in a coordinator
  fan-out (coordinator `tokenmax-orch-2026-09-13`), pre-assigned one idea verbatim, with no
  menu of candidates offered: deeply read `lib/nina/imagejobs.ts` (1023 lines, the image-
  generation job queue/processing pipeline) for races, edge cases, and dead code — a
  concurrency-heavy file never audited despite handling async job state, and untouched by the
  same day's `nina-turnflight-yagni` worker. Fix any real races/edge cases found with tests
  proving the fix; fall back to a YAGNI/doc-drift pass if none existed.
- **Concrete changes:** one commit on this branch, `e49e3a7` ("fix(nina): close a soft-
  deleted job's TOCTOU races in imagejobs.ts"), touching 2 files (168 insertions, 52
  deletions): `lib/nina/imagejobs.ts` and `tests/nina.softDelete.test.ts`.
- **Real value delivered:**
  - **Found two real, reachable TOCTOU races, both from one root cause**, in a file already
    densely annotated from a prior plan set (docstrings citing "R2", "invariant 9", "RULING
    C1") — the value here was finding a genuine gap in *already-settled* reasoning, not
    re-litigating a fresh file.
  - **Race 1 — apology-before-terminal-write in `failNinaImageJob`**: the function posted
    Nina's chat apology *before* the terminal `UPDATE ... SET status='failed'`, with no
    re-check of `deleted_at`, directly violating the file's own R2 rule ("never apologise in
    the chat for a job he hid") — previously enforced only at the sweep, not here. Fixed by
    reordering the terminal UPDATE first (with `.returning({ deletedAt })`) and gating the
    apology on that freshly-read value instead of the state at claim time.
  - **Race 2 — immortal ghost row via `requeueNinaImageJob`**: a failed-but-retryable job is
    requeued to `status='queued'` without ever clearing `deleted_at`. Every reclaim path
    (`claimNinaImageJob`, `listRevivableNinaImageJobs`, and — before this fix —
    `sweepStaleNinaImageJobs`'s own SELECT) required `deleted_at IS NULL`, so a hidden job
    with retry budget remaining became a **permanently stuck row**: invisible on every screen,
    never revived, and never closed by the 20-minute stale-sweep deadline either, because the
    sweep excluded hidden rows from its own candidate query. This is the file's documented
    last-resort mechanism ("the only mechanism that still works when GitHub does not"), and it
    was silently blind to exactly the rows most likely to need it.
  - **Both fixes share one pattern**: never gate a *write* on `deleted_at`, only gate the
    *side-effecting apology* on a value re-read from the same UPDATE that performs the write —
    closing the TOCTOU window instead of adding a second racy check.
  - **Proved with exact-query-count tests**, not just return-value assertions: 4 new test
    cases (2 new `describe` blocks, ~120 lines) in `tests/nina.softDelete.test.ts` assert
    against a fake driver (`installFakeDb`) that the apology's full plumbing (session resolve +
    message insert) genuinely does not run when a row is hidden — a stronger proof than
    asserting the function's return value alone.
  - **Corrected two pre-existing tests that encoded the old, buggy behavior** as if it were
    correct: an assertion that the sweep's SELECT always carried `deleted_at is null` was split
    to show the sweep's SELECT deliberately does *not* carry that filter, while the adjacent
    strip-list read still does.
  - **Updated the file's own top-of-file docstring property list** to document the sweep's
    `deleted_at`-blind SELECT as a deliberate, named exception rather than an oversight.
  - **Checked and explicitly ruled out a third candidate as dead-but-harmless**:
    `claimNinaImageJob`'s predicate structurally supports being called with only one of
    `queuedBefore`/`runningBefore` set, but a full call-site trace found every real caller
    passes either both together (`reviveNinaImageJobs`) or neither (ordinary first-fire/redo) —
    live in the type signature, dead in practice, not worth touching.
- **Branch:** `token-maxxing-2026-09-13-nina-imagejobs-audit`
- **Merge status:** on branch, not merged — this is a WORKER session in a coordinator
  fan-out (coordinator `tokenmax-orch-2026-09-13`); the coordinator owns merging worker
  branches to main, not the worker itself.
- **Approx token burn:** moderate-high — a full 1023-line file read plus a delegated call-
  site trace across five call sites and a sibling GitHub Actions worker before hypothesizing
  any bug, two independent TOCTOU proofs each requiring exact-query-count test design against
  a fake driver, a full-suite run (332 files, 5747 tests), and a typecheck/format/lint pass. 🔥

## Context & Motivation
This was a WORKER session in the 2026-09-13 token-maxxing fan-out, coordinated by
`tokenmax-orch-2026-09-13`. Unlike a solo session that generates its own menu of candidate
ideas, this worker received one idea pre-assigned by the coordinator verbatim: audit
`lib/nina/imagejobs.ts` — the image-generation job queue/processing pipeline, 1023 lines — for
races, edge cases, and dead code, on the stated grounds that it is concurrency-heavy, has never
been audited, and was left untouched by the same day's sibling worker `nina-turnflight-yagni`
(which covered `lib/nina/turnflight.ts` and `components/nina` instead). The instruction was to
fix any real races/edge cases found with proving tests, and to fall back to a YAGNI/doc-drift
pass only if none existed.

The file turned out to be an unusually poor target for a naive "find something wrong" pass:
its docstrings already cite named rulings from a prior plan set ("R2", "invariant 9", "RULING
C1"), meaning it had already been heavily reconciled by earlier work. Rather than assume the
easy wins were still there, the session's first move was to trace every real caller of the
file's exported functions — across `lib/nina/imagerun.ts`, `jobActions.ts`, `selfiegen.ts`,
`avatargen.ts`, `imagetest.ts`, and the sibling GitHub Actions worker in
`scripts/nina-image-worker/` — to build the actual concurrency model before hypothesizing bugs
against it. That grounding is what surfaced the two races below: both are violations of rules
the file states about itself, not new invented requirements.

## What We Did (blow-by-blow)
1. **Read `lib/nina/imagejobs.ts` in full** (1023 lines) — the job queue/processing pipeline
   backing Nina's image generation, covering claim, run, fail, requeue, revive, and sweep
   paths, plus the soft-delete flag `nina_turns.deleted_at` set by `softDeleteNinaImageJob`
   when a runner taps the trash icon on `/nina/jobs`.
2. **Delegated a call-site trace to a research subagent** across `lib/nina/imagerun.ts`,
   `jobActions.ts`, `selfiegen.ts`, `avatargen.ts`, `imagetest.ts`, and
   `scripts/nina-image-worker/`, to establish the real concurrency model — which functions run
   synchronously in a request, which run in a background `after()` invocation, and which run
   in the separate GitHub Actions worker process — before treating any code path as a
   hypothesis for a bug.
3. **Identified the shared root cause of both races**: `deleteNinaImageJob` has no status gate
   by design — the file's own docstring states an in-flight generation still finishes and
   still delivers even after a soft-delete — so a runner can hide a job that a background
   `after()` invocation is actively retrying. Every other write path in the file needed to be
   checked individually for whether it respects that intentional gap correctly.
4. **Found Race 1 in `failNinaImageJob`**: traced its statement order and found the chat
   apology insert happened *before* the terminal `UPDATE ... SET status='failed'`, with no
   `deleted_at` re-check at that point — meaning a runner who hides a job in the window between
   claim (`claimNinaImageJob`, which does require `deleted_at IS NULL`) and this terminal give-
   up would still see Nina apologize in a chat they'd just tidied away. Confirmed this directly
   contradicts the file's own stated R2 rule, which was previously enforced only at the sweep.
5. **Found Race 2 in `requeueNinaImageJob`**: traced what happens when a failed attempt still
   has retry budget — the row goes back to `status='queued'` but `deleted_at` is left
   untouched. Cross-referenced every mechanism that could ever reclaim that row again
   (`claimNinaImageJob`, `listRevivableNinaImageJobs`, and `sweepStaleNinaImageJobs`'s own
   SELECT as it stood before this fix) and found all three required `deleted_at IS NULL` —
   meaning a hidden job with retry budget left became a permanently stuck `pending` row, closed
   by nothing, including the 20-minute stale-sweep deadline that is the file's documented
   last-resort mechanism.
6. **Fixed Race 1** by reordering `failNinaImageJob` to perform the terminal status UPDATE
   first, using `.returning({ deletedAt })` to read the row's current `deleted_at` in the same
   round trip, then gating the apology on that freshly-read value rather than on any earlier
   claim-time state.
7. **Fixed Race 2** by removing the `deleted_at IS NULL` filter from `sweepStaleNinaImageJobs`'s
   candidate SELECT and its per-row terminal UPDATE — the sweep must still find and close
   hidden rows, since it is the only backstop for them — while gating *only* the sweep's
   apology on the row's own `deletedAt`, read via that same UPDATE's `.returning()`, mirroring
   the exact pattern used for Race 1.
8. **Wrote 4 new proving tests** in `tests/nina.softDelete.test.ts` (2 new `describe` blocks,
   ~120 lines added) using the file's existing fake-driver harness (`installFakeDb`) to assert
   exact recorded-SQL query counts — proving the apology's full plumbing (session resolve +
   message insert) does not execute at all when the row is hidden, not merely that some return
   value looks right.
9. **Updated 2 pre-existing tests** whose assertions had encoded the old, buggy behavior as
   correct: an assertion that the sweep's SELECT always carries `deleted_at is null` was split
   into two assertions — the sweep's own SELECT deliberately does *not* carry that clause post-
   fix, while the neighboring strip-list read still does, since that read's purpose is
   unrelated to reclaiming hidden rows.
10. **Updated the file's top-of-file docstring property list** to name the sweep's
    `deleted_at`-blind SELECT explicitly as a deliberate, documented exception, so a future
    reader doesn't mistake it for a regression.
11. **Checked and ruled out a third candidate**: `claimNinaImageJob`'s predicate technically
    allows calling with only one of `queuedBefore`/`runningBefore` set (an asymmetric recovery
    window), but the full call-site trace from step 2 showed every real caller passes either
    both together (`reviveNinaImageJobs`) or neither (ordinary first-fire/redo paths) — the
    branch is structurally live but practically dead, and was deliberately left untouched.
12. **Ran full verification**: `npx vitest run` — 332 files, 5747 tests, all passing; `npx tsc
    --noEmit` — zero new errors (pre-existing `PageProps`/`LayoutProps` errors are missing-
    typegen noise from a fresh worktree with no `.next` dir, unrelated to this change); `npx
    prettier --check` and `npx eslint` on both changed files — clean.
13. **Committed as `e49e3a7`** ("fix(nina): close a soft-deleted job's TOCTOU races in
    imagejobs.ts").

## Code / Design Details

**The shared fix pattern** — never gate a write on `deleted_at`, gate only the side-effecting
apology on a value re-read from the same UPDATE that performs the terminal write:
```ts
// after: terminal write happens first, apology gated on a value read from the SAME statement
const [row] = await db
  .update(ninaTurns)
  .set({ status: "failed", /* ...other terminal fields... */ })
  .where(/* ... */)
  .returning({ deletedAt: ninaTurns.deletedAt });

if (row && row.deletedAt === null) {
  // only now is it safe to post Nina's apology — the row was not hidden
  // at the moment the terminal state was actually committed
}
```
This closes the TOCTOU window because the value gating the apology is read in the same
statement that commits the terminal state, rather than a separately-timed check against state
read earlier (e.g. at claim time).

**Race 2's sweep fix** — the candidate SELECT and per-row UPDATE lost their `deleted_at IS
NULL` filter (the sweep must still find and close hidden rows so they are not immortal), while
only the apology decision downstream still consults `deletedAt`:
```ts
// sweepStaleNinaImageJobs: SELECT no longer excludes deleted_at IS NOT NULL rows —
// it must reclaim hidden rows too, since it's the last-resort mechanism.
// The per-row terminal UPDATE also no longer filters on deleted_at.
// Only the post-UPDATE apology check reads the row's own deletedAt via .returning().
```

**Proof shape** — the new tests assert exact recorded-SQL query counts against
`installFakeDb`'s fake driver, not just a function's return value, so a false-negative ("looks
right, but the apology plumbing still silently ran") is caught:
```ts
// 2 new describe blocks, 4 new test cases in tests/nina.softDelete.test.ts:
// - failNinaImageJob: hidden row → session resolve + message insert queries: 0
// - failNinaImageJob: visible row → apology queries execute as before
// - sweepStaleNinaImageJobs: reclaims a hidden queued-with-retry-budget row
// - sweepStaleNinaImageJobs: apology suppressed for a hidden row, terminal UPDATE still runs
```

## Decisions & Trade-offs
- **Did not add a `deleted_at IS NULL` filter to `requeueNinaImageJob` or `claimNinaImageJob`
  as an alternative fix.** Those functions correctly participate in the existing design (an
  in-flight generation should still finish and deliver even after a soft-delete); the actual
  bug was that the *sweep* — the one mechanism documented as the guaranteed last resort — was
  excluding exactly the rows it exists to reclaim. Removing the filter from the sweep, not
  adding filters elsewhere, is what restores the invariant without breaking the documented
  in-flight-still-delivers behavior.
- **Gated only the apology, never the write, on `deleted_at`.** A write is what makes the
  system correct (a job must transition out of a stuck state regardless of visibility); the
  apology is a side effect whose only job is to respect the runner's soft-delete. Conflating
  the two gates was the root of both original bugs.
- **Proved both fixes with exact query-count assertions, not return-value checks.** A fake-
  driver test that only asserts the row ends up in the right terminal state can pass even if a
  dead-but-harmless call to the apology plumbing still executes; asserting the query count is
  zero is the stronger claim the fix actually makes.
- **Left `claimNinaImageJob`'s single-cutoff branch untouched.** It is structurally live (the
  type signature permits calling with only one of two cutoffs) but every real caller in the
  whole app either passes both together or neither — a full call-site trace, not a guess,
  established this. Touching a branch with zero live callers would be scope creep against an
  already-audited file, not a fix.
- **Did not attempt to unify the two TOCTOU fixes into one shared helper.** Both fixes use the
  same *pattern* (`.returning()` a fresh value, gate the side effect on it) but apply to two
  functions with different terminal-write shapes (`failNinaImageJob`'s single-row UPDATE vs.
  `sweepStaleNinaImageJobs`'s per-row loop over a batch SELECT); forcing a shared abstraction
  across them was judged not worth the coupling for two call sites.

## Follow-ups & YAGNI notes
- **`claimNinaImageJob`'s asymmetric single-cutoff branch** is dead in practice (every caller
  passes both `queuedBefore`/`runningBefore` together or neither) but structurally live in the
  type signature — worth revisiting only if a future caller is added that might exercise it
  without realizing the branch has never been exercised before.
- **Deliberately NOT done, on scope grounds:** no changes to `claimNinaImageJob`,
  `listRevivableNinaImageJobs`, or any file outside `lib/nina/imagejobs.ts` and
  `tests/nina.softDelete.test.ts`; no shared-helper extraction for the two TOCTOU-fix call
  sites; no re-litigating any of the file's prior settled rulings ("R2", "invariant 9",
  "RULING C1") — this session found a gap in their *enforcement*, not a flaw in the rulings
  themselves; no merge to main (worker session; coordinator's job).

## Appendix

**Commit on this branch (worker, not yet merged):**
```
e49e3a7 fix(nina): close a soft-deleted job's TOCTOU races in imagejobs.ts
```
2 files changed: `lib/nina/imagejobs.ts`, `tests/nina.softDelete.test.ts` — 168 insertions,
52 deletions.

**Verification performed:** `npx vitest run` — 332 files, 5747 tests, all passing; `npx tsc
--noEmit` — zero new errors (pre-existing `PageProps`/`LayoutProps` errors are missing-typegen
noise from a fresh worktree with no `.next` dir, unrelated to this change); `npx prettier
--check` and `npx eslint` clean on both changed files.

**Session identity:** worker session `nina-imagejobs-audit`, spawned by coordinator
`tokenmax-orch-2026-09-13`; branch `token-maxxing-2026-09-13-nina-imagejobs-audit`; worktree
`/home/miftah/.worktrees/run-insights/tokenmax-2026-09-13-nina-imagejobs-audit`; commit
`e49e3a7`; not merged — the coordinator lands worker branches.

**Related sessions:** `2026-09-13-nina-turnflight-yagni.md` (same day's sibling worker under
the same `tokenmax-orch-2026-09-13` coordinator, covering `lib/nina/turnflight.ts` and
`components/nina` instead of this file); `2026-09-12-nina-turn-jobs-yagni.md` (an earlier YAGNI
sweep of `lib/nina`'s turn+imagejobs exports, a dead-code pass rather than a concurrency audit
of this file's write paths).
