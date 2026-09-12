# Token-Maxxing Session — 2026-09-11: Scripts Package Hygiene

## 🎯 Achievement / End Result
- **Goal of the burn:** A WORKER session (slug `scripts-package-hygiene`), pre-assigned one
  idea by the coordinator (`tokenmax-orch-2026-09-11`) with no menu this time: two fixes
  scoped strictly to `scripts/.workflows/`, with **no script code touched** — (1)
  `scripts/.workflows/todos.md` had TaskID **P1-SC-A000** checked `[x]` with
  `Status: completed` but **zero closure fields**, still sitting in Active Tasks — abandoned
  mid-bookkeeping; (2) `scripts/.workflows/package_readme.md` was 7 lines covering only
  `nina-dedupe-media.mjs` despite `scripts/` holding ~6,100 lines across 27 files. Both gaps
  make the directory hard for a future session to navigate.
- **Concrete changes:** 2 files, +244/−17, one commit (`b049bb7`) —
  `scripts/.workflows/todos.md` (+20/−12) and `scripts/.workflows/package_readme.md`
  (+224/−5, 7 → 226 lines).
- **Real value delivered:**
  - The small diff hides what the session actually was: it **replaced two pieces of
    silently-wrong bookkeeping with measured facts** and gave the package a real map.
  - P1-SC-A000's closure was **reconstructed from git rather than copied from the
    checkbox** — and the reconstruction found the root cause of the abandonment
    (`aee6b75` records `/implement` Step 3 deliberately SKIPPED as a set-level act; the set
    coordinator's landing `62727a2` closed the set without ever writing the block), so the
    Drift field explains *why* the entry rotted rather than just papering over it.
  - The task's production outcome was **measured, not assumed**. Git records no run of the
    importer's `--apply`; a naive closure would have minted an open follow-up task "run
    `--apply`". A read-only query against the one production database instead showed
    `nina_shortcuts` = 25 rows and `nina_memory_facts` = 3 — **the original 28 conserved** —
    so the ledger migration this task exists for is **already complete**. No follow-up task
    was invented.
  - A **second stale fact caught by measuring instead of propagating**: the old readme's
    central warning claimed dedupe `--apply` "has NOT yet been run against production" —
    but commit `c2c2ca5` (2026-09-11) records the run ("production pair merged via
    `nina:dedupe-media --apply`, 5/5 ops") and the live DB measures 48/52 rows hashed, 17
    repointed. Replaced with the measured truth, keeping the idempotent-rerun guidance.
  - `scripts/` finally has a **real map**: all 27 scripts described in five groups with npm
    wiring, plus the directory's six standing rules — and the descriptions are written
    **from the code** (every script was read, headers at minimum, several in full), not
    from file names.
- **Branch:** `token-maxxing-2026-09-11-scripts-package-hygiene`
- **Merge status:** merged (commit `2ecaf7f`)
- **Approx token burn:** moderate — the diff is only 2 files, but the burn went into
  reading all 27 scripts, git archaeology across four commits (`aee6b75`, `8018065`,
  `62727a2`, `c2c2ca5`), and two production queries. 🔥

## Context & Motivation
The 2026-09-11 token-maxxing day ran as an orchestrated fan-out: a coordinator session
(`tokenmax-orch-2026-09-11`) spawning worker sessions on per-session branches, each handed
a pre-assigned idea rather than a menu. This worker's assignment was package hygiene for
`scripts/` — the one corner of the repo the day's other sessions (all admin/nina test
suites) never touched.

Two concrete defects were named in the assignment. First, `scripts/.workflows/todos.md` —
the package's task ledger — carried P1-SC-A000 ("Phase 4: Import the ledger's shortcuts",
the phase that built `scripts/nina-shortcuts-import.mjs`) as a ticked, `Status: completed`
entry in **Active Tasks** with no Completed/Commit/Verified fields: the ledger claims a
task finished but records nothing about how, when, or with what result. Second,
`package_readme.md` was 7 lines describing a single script, in a directory of 27 — a
future session picking up any `scripts/` idea would have no map and, worse, would inherit
the old readme's central claim, which was false (see below). The rationale for the
assignment: both gaps make the directory hard for a future session to navigate, and
`scripts/` is precisely the directory where a misread consequence is a production write.

## What We Did (blow-by-blow)
1. **Reconstructed P1-SC-A000's closure from git, not from the checkbox.** The phase
   commit `aee6b75` (2026-09-07 22:46, "/implement (swarm phase 4 of 4)") records that
   `/implement` Step 3 was SKIPPED — no `todos.md` entry minted at phase time and no
   adopted plan copy written, because Step 3 is a set-level act and the entry text goes to
   the set's coordinator, the single writer for shared bookkeeping. The coordinator's
   landing commit `62727a2` then closed the set **without ever writing the closure block**.
   That is the root cause: the entry sat ticked in Active Tasks, with Quick Stats *already*
   claiming 0 active / 1 completed — the counters were updated but the record wasn't.
2. **Measured the production outcome before writing a word of closure.** Git records no
   run of `nina:shortcuts-import --apply` anywhere. The naive move — close the task, note
   "apply never run", mint an open follow-up task to run it — would have written a
   follow-up that is already moot. Instead, a **read-only** query against the one
   production database: `nina_shortcuts` holds **25 rows** and `nina_memory_facts` holds
   **3** — the original 28 ledger rows, conserved. The ledger migration the task exists to
   perform has already happened. The `Verified` field therefore states the transfer
   happened after landing by an unrecorded route (the script, or by hand on
   `/admin/shortcuts` — git cannot distinguish, and it doesn't matter), and that **there
   is no open follow-up**.
3. **Wrote the closure block in the house fields and moved the entry to Completed Tasks**
   (newest-first position): `Completed: 2026-09-07 22:46` (from `aee6b75`'s timestamp, not
   today), `Method: /implement (swarm phase 4 of 4)`, `Commit: aee6b75`, `Files`
   (script, test, package.json), a two-bullet `Drift`, and the measured `Verified`.
   Quick Stats Completed 1 → 2; Last Updated 2026-09-11. The full entry text (Context,
   the four grammars, the two corrections-not-to-reintroduce, the dry-run-default exit
   criteria) moved verbatim — history preserved, not summarized away.
4. **Read every script under `scripts/`** — headers at minimum, several in full — before
   describing any of them. The readme's per-script sentences are written from the code:
   flags, defaults, what touches production, what the CI guards actually guard, what the
   capture toolkit actually photographs.
5. **Expanded `package_readme.md` 7 lines → 226**: an Overview stating what the directory
   *is* (operational code, not app code; nothing imports it; none of it runs under
   `npm test` — with the three deliberate reversals where the test suite imports a
   script's pure half) and its **six standing rules** — (1) dry run is the default, the
   write flag writes; (2) NOT A TEST; (3) `DATABASE_URL` IS PRODUCTION; (4) the
   zero-import `lib/` rule under `--experimental-strip-types`; (5) dates as `::text`,
   never a JS `Date`; (6) guards: fix the code, never silence the check — then all 27
   scripts in five groups (ops & maintenance, CI boundary guards, the image worker, the
   capture toolkit, build wiring), a few accurate sentences each with npm wiring.
6. **Caught the second stale fact by measuring instead of propagating.** The old readme's
   central warning — dedupe `--apply` "has NOT yet been run against production" — was
   already false on the day this session ran: `c2c2ca5` (2026-09-11) records the run
   ("production pair merged via `nina:dedupe-media --apply`, 5/5 ops"), and the DB
   measures 48/52 rows hashed and 17 repointed. Had the readme simply been *extended*
   rather than re-verified, the false warning would have been enshrined in a 226-line
   document instead of a 7-line one. Replaced with the measured truth; the
   idempotent-rerun guidance (safe to re-run, `onConflictDoNothing` on the natural key)
   kept.
7. **Verified:** `npx prettier --check` clean on both files; structure checks — zero `[x]`
   left in Active Tasks, TaskIDs unique, Quick Stats match the actual counts; and
   `git diff --stat` confirms scope held to exactly the two `scripts/.workflows/` files —
   no script code touched, per the assignment's one hard constraint.
8. **Committed as `b049bb7`** on the worker branch and stopped — no merge, no push; the
   coordinator lands worker branches.

## Code / Design Details

**The closure block as written** (the new fields appended to P1-SC-A000, now in Completed
Tasks; entry text above them unchanged):
```
- **Completed**: 2026-09-07 22:46
- **Method**: /implement (swarm phase 4 of 4)
- **Commit**: `aee6b75`
- **Files**: scripts/nina-shortcuts-import.mjs, tests/nina.shortcutsImport.test.ts, package.json
- **Drift**:
  - This closure itself was the loose end. The phase's own commit records skipping /implement
    Step 3 … and the coordinator's landing commit `62727a2` closed the set without ever writing
    this block — leaving the entry ticked, the Quick Stats already updated, and the block
    unclosed in Active Tasks. Reconstructed from git on 2026-09-11 (`aee6b75`, `8018065`,
    `62727a2`) plus a read-only DB measurement; nothing about the work was in doubt, only the
    bookkeeping was missing.
  - The plan's .mjs code block and its test code block disagreed under tsc … `parseShortcutRow`
    gained the JSDoc @typedef union the plan's own Interface Contract already declared; the
    code was fixed, never the check, and every test assertion survives byte-for-byte.
- **Verified**: … The phase's production dry run was read-only: 28 ledger rows read, 24 parsed
  (11 A / 2 B / 8 C / 3 D), 4 skipped as genuine facts, nothing written … Measured 2026-09-11
  read-only: `nina_shortcuts` holds 25 rows and `nina_memory_facts` 3 — the original 28,
  conserved; the ledger migration this task exists for is complete in production. Git records
  no run of `--apply`, so the transfer happened after landing, by the script or by hand on
  `/admin/shortcuts`; either way there is no open follow-up.
```

**The new readme's shape** (headings as landed):
```
# Package: scripts
## Overview                       — what the directory is + the six standing rules
## Ops & maintenance — dry-run by default, `--apply` writes    (9 scripts)
## The image worker               — `nina-image-worker.ts`
## CI boundary guards
## Build-time wiring
## Capture toolkit (`capture/`) — the README's screenshots and GIFs
## Everything else
```

**The stale warning, before → after** (`package_readme.md`): the old 7-line file's central
claim that dedupe `--apply` had *not yet* been run against production was replaced with the
measured state — the run happened (`c2c2ca5`, 2026-09-11, "production pair merged via
`nina:dedupe-media --apply`, 5/5 ops"), 48/52 rows hashed, 17 repointed — while keeping the
operationally important half: the script is idempotent and safe to re-run.

**Commit:**
```
b049bb7 docs(scripts): close out P1-SC-A000's abandoned bookkeeping; map the package in its readme
```

## Decisions & Trade-offs
- **Reconstruct from git; do not trust the checkbox.** The entry said completed; the
  ledger's own Quick Stats said 1 completed. Neither answered *when, how, with what
  result* — and the only honest source was the commit chain. That chain also surfaced the
  root cause (Step 3 skipped by design, the coordinator's landing never wrote the block),
  which the Drift field records so a future reader knows this failure mode exists:
  **a ticked entry is not a closed task, and an updated counter is not bookkeeping.**
- **Measure the outcome; never mint a moot follow-up.** The tempting closure was "apply
  never run per git → add follow-up task to run it." One read-only query falsified the
  premise: 28 rows conserved means the migration already happened. Writing the follow-up
  would have sent a future session to run `--apply` against production for nothing — in
  `scripts/`, where "for nothing" still means a production write. The Verified field
  states the residual uncertainty honestly (route unknown: script vs `/admin/shortcuts`)
  instead of resolving it by guesswork.
- **Honest Drift over tidy history.** The Drift bullet says outright that *this closure
  was the loose end* — the abandonment was a process gap (single-writer bookkeeping that
  no one wrote), not a work defect. It also preserves the phase's real drift (the `.mjs`
  `ok: true` boolean-widening that collapsed the discriminated union under tsc, fixed by
  adding the `@typedef` the plan already declared — code fixed, never the check).
- **Read the code; don't describe names.** The readme's value is that its sentences are
  load-bearing (which flag writes, which guard fires in CI, which script touches money),
  so every one was written against the actual file. Cost: the session's token burn went
  into reading 27 scripts for a 2-file diff. Benefit: the map is trustworthy on day one.
- **Scope discipline as the assignment's hard constraint.** Zero script code touched;
  `git diff --stat` after the fact shows exactly the two `.workflows/` files. A session
  about bookkeeping hygiene that "helpfully" also touched a script would have proven the
  old readme's point about blast radius.

## Follow-ups & YAGNI notes
- **No follow-up task invented.** The `--apply` question is closed by measurement, not
  left open by omission — the Verified field records why there is nothing to do.
- **The transfer route was deliberately not chased further.** Whether the 28 rows moved
  via the script or by hand on `/admin/shortcuts` is not derivable from git, and the
  distinction has no operational consequence (the rows are conserved either way). YAGNI.
- **The readme will rot the same way the old one did** — it describes code that changes.
  The standing rules are durable, but the per-script facts (flags, row counts) are
  snapshots; the next session that materially changes a script under `scripts/` should
  re-measure its readme section rather than extend it. This session's own history is the
  cautionary example: extending an unverified readme would have enshrined the false
  `--apply` warning at 30× the size.
- **`8018065` and the wider swarm bookkeeping** (which set minted what, which landing
  wrote which counters) were read only as far as P1-SC-A000's closure required;
  auditing *other* packages' ledgers for the same skipped-Step-3 rot was out of scope
  and untouched.

## Appendix

**Files touched:**
```
scripts/.workflows/package_readme.md | 224 ++++++++++++++++++++++++++++++-
scripts/.workflows/todos.md          |  20 ++++---
2 files changed, 244 insertions(+), 17 deletions(-)
```
(`package_readme.md`: 224 insertions / 5 deletions, 7 → 226 lines; `todos.md`:
20 insertions / 12 deletions.)

**Verification performed:** `npx prettier --check` clean on both files; structure checks
(zero `[x]` remaining in Active Tasks, TaskIDs unique across the ledger, Quick Stats equal
to the actual section counts); `git diff --stat` confirming the diff touches exactly the
two `scripts/.workflows/` files. Two **read-only** production queries (row counts only):
`nina_shortcuts` = 25, `nina_memory_facts` = 3 (28 conserved); dedupe state 48/52 rows
hashed, 17 repointed.

**Git evidence chain:** `aee6b75` (2026-09-07 22:46 — "/implement (swarm phase 4 of 4)",
records Step 3 skipped, holds the phase's real closure facts: tests green
155 files / 3,228 tests, dry run 28 read / 24 parsed / 4 skipped / nothing written);
`8018065` (regenerated migration 0012 + landing measurement, 24 match_keys DISTINCT);
`62727a2` (set coordinator's landing — closed the set, never wrote the closure block);
`c2c2ca5` (2026-09-11 — records the dedupe `--apply` production run, 5/5 ops, which the
old readme claimed had never happened).

**Session identity:** worker session `scripts-package-hygiene`, spawned by coordinator
`tokenmax-orch-2026-09-11` on 2026-09-11; branch
`token-maxxing-2026-09-11-scripts-package-hygiene`; final commit `b049bb7`; not merged
(coordinator lands worker branches).
