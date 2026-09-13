# Token-Maxxing Session — 2026-09-13: Nina Todos Audit

## 🎯 Achievement / End Result
- **Goal of the burn:** Audit `lib/nina/.workflows/todos.md`'s 9 "Active Tasks" entries
  against actual git history and code state — not the ledger's own claims — as
  pre-assigned by the coordinator, whose Why flagged one specific suspect:
  `P1-NIN-A018` looked already shipped (`NINA_PROMPT_VERSION` 7, `INSTRUCTOR_COACHING`
  and `ninaInstructorCoachingBlock` present in `lib/nina/persona/instructor.ts`, the
  `nina-instructor-character` set merged at `78ed264`) yet the ledger still marked it
  pending.
- **Concrete changes:** one commit, `1f024c8` — *docs(nina): audit todos.md against
  git/code — close all 9 stale active tasks* — 1 file, **+121/−98**:
  `lib/nina/.workflows/todos.md` only. No code, no tests, no plan files touched.
- **Real value delivered:**
  - **The coordinator's flagged suspect confirmed and closed.** `P1-NIN-A018`
    (instructor coaching register, phase 3 of 3 of `NINA_INSTRUCTOR_CHARACTER_PLAN.md`)
    was still `[ ]` pending/Status pending in the ledger, but the set landed at
    `a18e6e8` and merged into main at `04dda1a` (orch record `78ed264`, whose own
    commit body's "post-merge id audit" already lists A018 as "closed" — the ledger
    just never got the memo). Moved out of Active Tasks into the Archive section,
    alongside its already-archived siblings `P1-NIN-A016`/`P1-NIN-A017` from the same
    plan set.
  - **A second, undiscussed defect found and fixed by the same audit method:** 8 more
    "active" entries — `P1-NIN-A040` through `P1-NIN-A047`, the 8 phases of
    `NINA_QUERIES_SPLIT_PLAN.md` — were already flipped `[x]` done/Status done, but
    left sitting under `## Active Tasks` instead of moved to `## Completed Tasks` as
    the ledger's own documented model (and the `todos.py` tool's own model) requires.
    Confirmed fully landed and merged to main (merge commit `fa13041` "merge:
    token-maxxing session nina-queries-split"; all 8 phase commits present in git log:
    `1adfd74`, `20b4c15`, `374353c`, `13072ab`, `76c7c33`, `8c82eb4`, `d07c554`,
    `802d3a1`; the current tree has all 13 modules under `lib/nina/queries/` and the
    barrel `lib/nina/queries.ts` is exactly the header + 12 `export *` lines it
    claims — zero imports, zero SQL). Moved all 8 into Completed Tasks with
    `Completed:` date, `Method:`, `Files:`, and a `Verified:` line backfilled per
    phase, sourced directly from each phase's own commit message — nothing fabricated.
  - **Ledger now matches reality end to end.** `Total Active Tasks` 9 → **0**;
    Quick Stats `P1 High` 3 → 0, `P2 Medium` 6 → 0, `Completed` 39 → **48** (+1 A018,
    +8 queries-split phases), `Archived` 35 → **36** (+1 A018); `Last Updated` →
    2026-09-13.
  - **Zero risk, zero code touched.** A pure documentation/ledger correction — the
    only artifact anyone could point to as "what's still open in `lib/nina`" is now
    accurate, which is exactly the maintainability value a stale todos ledger
    otherwise erodes.
- **Branch:** `token-maxxing-2026-09-13-nina-todos-audit` (worker session of a
  coordinator, slug `nina-todos-audit`)
- **Merge status:** on branch (not yet merged/pushed — merge to main is handled
  separately by the coordinator)
- **Approx token burn:** moderate — a docs-only single-commit session, but the burn
  went into git archaeology across two plan sets (chasing commit SHAs through merge
  history, verifying orch post-merge audits, confirming barrel file contents), plus a
  full verification battery re-run to the digit. 🔥

## Context & Motivation
This was a **worker session** of a token-maxxing coordinator (slug `nina-todos-audit`),
so there was no idea menu — the coordinator pre-assigned the idea, with its Why already
written: audit `lib/nina/.workflows/todos.md`'s 9 active tasks against actual git
history and code state, because `P1-NIN-A018` looked already shipped (specific code
citations given: `NINA_PROMPT_VERSION` 7, `INSTRUCTOR_COACHING` and
`ninaInstructorCoachingBlock` in `lib/nina/persona/instructor.ts`, the
`nina-instructor-character` set merged at `78ed264`) yet the ledger still marked it
pending. **Why it mattered:** a stale todos ledger misdirects future work — a session
picking up "the last active NIN task" would have re-planned already-shipped work;
closing verified-done tasks and fixing counts is real, low-risk maintainability value.

This lands in the same family as three prior `todos.md`-archival sessions
(`2026-09-11 todos-root-archive`, `2026-09-11 todos-nina-archive`,
`2026-09-12 todos-nina-lib-archive`) but is a different operation: those compressed
already-correctly-classified completed history into an Archive section; this session's
job was **classification correction** first — proving which of the 9 "active" entries
were actually done (contra the doc's own claims), then filing them into the right
section (Archive for A018, Completed Tasks for the 8 queries-split phases) with
evidence, before any future archival pass could safely compress them again.

## What We Did (blow-by-blow)
1. **Read the Active Tasks section of `lib/nina/.workflows/todos.md`.** Found 9
   entries, not 1 as the assigned idea's framing might suggest at a glance: `P1-NIN-A018`
   genuinely marked `[ ]` pending, plus `P1-NIN-A040` through `P1-NIN-A047` (all 8
   phases of `NINA_QUERIES_SPLIT_PLAN.md`) already marked `[x]` done/Status done but
   never moved out of the Active Tasks section.
2. **Investigated A018 first, per the assigned idea's specific citations.** Traced the
   plan set `NINA_INSTRUCTOR_CHARACTER_PLAN.md` (phase 3 of 3) through git log: phase 3
   itself landed at `a18e6e8`; the orchestration record merged the whole set into main
   at `04dda1a` via orch commit `78ed264`. Read `78ed264`'s own commit body — its
   "post-merge id audit" section already lists `P1-NIN-A018` as "closed", confirming
   the orchestrator itself considered the task done; the todos ledger in `lib/nina`
   simply never got that update propagated into it.
3. **Verified against code, not just commit messages.** Confirmed
   `NINA_PROMPT_VERSION` is `7` in `lib/nina/prompts/index.ts`; confirmed
   `INSTRUCTOR_COACHING` and `ninaInstructorCoachingBlock` both exist in
   `lib/nina/persona/instructor.ts` and are wired into `lib/nina/prompts/system.ts` —
   i.e. the coaching register the phase-3 plan describes is live code, not a stub.
4. **Investigated the 8 queries-split entries next**, since they were sitting
   unclassified in the same section. Confirmed the plan set
   `NINA_QUERIES_SPLIT_PLAN.md` merged into main via merge commit `fa13041` ("merge:
   token-maxxing session nina-queries-split"), and that all 8 phase commits are
   present in git log (`1adfd74`, `20b4c15`, `374353c`, `13072ab`, `76c7c33`,
   `8c82eb4`, `d07c554`, `802d3a1`). Checked the resulting tree directly: all 13
   modules exist under `lib/nina/queries/`, and the barrel `lib/nina/queries.ts` is
   exactly the header comment plus 12 `export *` lines the plan set describes — zero
   remaining imports, zero remaining SQL in the barrel itself.
5. **Fixed A018:** moved its entry out of `## Active Tasks` into `## Archive`,
   alongside its already-archived phase-set siblings `P1-NIN-A016`/`P1-NIN-A017`, with
   a one-line archive entry documenting the landing commits (`a18e6e8` / `04dda1a` /
   `78ed264`) and the reason it was being corrected now rather than when the set
   landed.
6. **Fixed A040–A047:** moved all 8 out of `## Active Tasks` into `## Completed Tasks`
   (the ledger's own documented model: Completed Tasks is where a finished task's real
   entry lives, Active Tasks is unfinished work only). Backfilled, per phase, from
   each phase's own commit message via `git show -s --format='%ci'` (dates/times) and
   `git show --stat` (file lists) — never hand-typed or guessed: a `Completed:` date,
   `Method:` (`/implement`), `Files:`, and a `Verified:` line carrying that phase's
   actual gate results (typecheck / vitest counts / eslint / prettier, as recorded in
   its own commit).
7. **Updated the Quick Stats block to match the corrected classification:**
   `Total Active Tasks` 9 → 0; `P1 High` 3 → 0; `P2 Medium` 6 → 0; `Completed` 39 → 48
   (+1 for A018 moving into the completed-total, +8 for the queries-split phases);
   `Archived` 35 → 36 (+1 for A018). `Last Updated` bumped to 2026-09-13.
8. **Verified the edit was well-formed**, three independent ways: (a)
   `python3 ~/.claude/skills/task/todos.py --root lib/nina validate` (re-run while
   writing this doc: `0 live entries (12 incl. echoes), every TaskID canonical and
   unique`); (b) loaded the file directly through the `todos.py` `TodoFile` class in
   Python to confirm `tasks()` now reports exactly 12 completed tasks for `lib/nina`, 0
   active, 0 conflicts — up from 4 completed before the edit; (c)
   `npx prettier --check lib/nina/.workflows/todos.md` clean (run inside the repo, per
   the memory rule — prettier from `/tmp` false-flags with its own 80-col default) and
   `git status --porcelain` confirming only the one file changed.
9. **Committed** as `1f024c8` — "docs(nina): audit todos.md against git/code — close
   all 9 stale active tasks" — 1 file, +121/−98.

## Code / Design Details

**Before → after, Quick Stats block:**

```diff
-**Last Updated**: 2026-09-12
-**Total Active Tasks**: 9
+**Last Updated**: 2026-09-13
+**Total Active Tasks**: 0

 ## Quick Stats
 - P0 Critical: 0
-- P1 High: 3
-- P2 Medium: 6
+- P1 High: 0
+- P2 Medium: 0
 - P3 Low: 0
 - P4 Backlog: 0
 - Blocked: 0
-- Completed: 39
-- Archived: 35
+- Completed: 48
+- Archived: 36
```

**Two different destinations for two different verdicts** — this is the crux of the
session, not a mechanical rename:

| Entry | Was | Real status | Destination | Why that destination |
|-------|-----|--------------|-------------|------------------------|
| P1-NIN-A018 | `[ ]` pending | done, merged, code-confirmed | `## Archive` | Its own plan set's other two phases (A016/A017) were already archived; consistency with siblings, plus the orch's own post-merge audit already called it "closed" |
| P1-NIN-A040..A047 | `[x]` done | done, merged, code-confirmed (already correctly marked) | `## Completed Tasks` | Not archived yet — they were only ever *misfiled* under Active Tasks, not stale; Completed Tasks is the ledger's holding area before a future archival pass compresses them, matching the tool's documented model |

**Verification receipts, re-confirmed while writing this doc:**
```
$ python3 ~/.claude/skills/task/todos.py --root lib/nina validate
validate: 0 live entries (12 incl. echoes), every TaskID canonical and unique

$ npx prettier --check lib/nina/.workflows/todos.md
All matched files use Prettier code style!

$ git status --porcelain
(clean)
```

## Decisions & Trade-offs
- **Two destinations, not one.** It would have been mechanically simpler to dump all 9
  corrected entries into the same place, but that would have hidden the real
  distinction between "the ledger was simply wrong about this task's status" (A018)
  and "the ledger had the right status but the wrong section" (A040–A047). Keeping
  Completed Tasks and Archive as separate landings preserves that signal for future
  readers and for any tooling that treats the two sections differently.
- **Backfilled `Verified:` fields sourced only from each phase's own commit message,
  never invented.** Where a phase's commit didn't state a particular gate result, the
  entry was left without inventing one, rather than guessing a plausible-looking
  number.
- **No compression/archival pass beyond what the classification required.** This
  session's job was correcting misclassification, not doing another round of the
  archival-trilogy-style line compaction those three prior sessions already did to
  this same file; the 8 queries-split entries went to Completed Tasks in full detail
  (matching the ledger's per-task Completed Tasks convention), not compressed into
  one-liners — that compression is a separate, later archival pass's job.
- **No code changes considered.** The assigned idea was explicitly a ledger audit; the
  code paths cited (`NINA_PROMPT_VERSION`, `INSTRUCTOR_COACHING`,
  `ninaInstructorCoachingBlock`, the `queries/` module split) were read only to confirm
  the plan sets actually landed as claimed, never modified.

## Follow-ups & YAGNI notes
- **The queries-split 8 entries now sit in Completed Tasks, not yet Archive.** A
  future archival-style pass (in the spirit of the 2026-09-11/09-12 trilogy) could
  compress them into one-line Archive entries once nothing else needs their
  per-phase detail — deliberately left as a separate future action rather than
  bundled into this correction commit.
- **Whatever mechanism causes a landed set's ledger update to not propagate** (both
  A018 and the queries-split entries show the same failure mode: the work landed,
  the ledger didn't get updated to match) is worth a look if it recurs a third time —
  this session fixed the symptom twice, not any root cause in a completion-handler or
  orchestrator script.
- **No manual/production verification was needed here** — both corrected task
  clusters are pure code/refactor work provable entirely from git and the tree, unlike
  some prior `lib/nina` archive entries that carried open manual-production-check
  suffixes (see `2026-09-12-todos-nina-lib-archive.md`'s A008/A013/A017 obligations,
  which remain untouched by this session).

## Appendix
- **Branch / commit:** `token-maxxing-2026-09-13-nina-todos-audit` @ `1f024c8` (1 file,
  +121/−98). Not yet merged — merge/push handled by the coordinator.
- **Assigned idea's Why (verbatim intent):** a stale todos ledger misdirects future
  work; closing verified-done tasks and fixing counts is real, low-risk
  maintainability value.
- **Key commits chased down during the audit:**
  - `a18e6e8` — A018 phase-3 landing commit.
  - `04dda1a` — merge of `NINA_INSTRUCTOR_CHARACTER_PLAN` into main.
  - `78ed264` — orch record whose own "post-merge id audit" already lists A018
    "closed".
  - `fa13041` — merge commit "merge: token-maxxing session nina-queries-split".
  - `1adfd74`, `20b4c15`, `374353c`, `13072ab`, `76c7c33`, `8c82eb4`, `d07c554`,
    `802d3a1` — the 8 queries-split phase commits, all confirmed present.
- **Verification battery, as run and as re-confirmed while writing this doc:**
  - `git show --stat 1f024c8` → 1 file, +121/−98.
  - `python3 ~/.claude/skills/task/todos.py --root lib/nina validate` → exit 0,
    "0 live entries (12 incl. echoes), every TaskID canonical and unique".
  - Loaded the file through `todos.py`'s `TodoFile` class directly: `tasks()` reports
    12 completed, 0 active, 0 conflicts (up from 4 completed pre-edit).
  - `npx prettier --check lib/nina/.workflows/todos.md` → clean (run inside the repo).
  - `git status --porcelain` → clean tree, only the ledger file changed by the commit.
  - `lib/nina/queries.ts` inspected directly: header + 12 `export *` lines, zero
    imports, zero SQL — confirms the queries-split claim independent of commit
    messages.
  - `NINA_PROMPT_VERSION` confirmed `7` in `lib/nina/prompts/index.ts`;
    `INSTRUCTOR_COACHING` / `ninaInstructorCoachingBlock` confirmed present and wired
    in `lib/nina/persona/instructor.ts` + `lib/nina/prompts/system.ts`.
- **Commands run (representative):**
  ```bash
  git log --all --oneline -- lib/nina/persona/instructor.ts
  git show -s --format='%ci' a18e6e8 04dda1a 78ed264
  git show 78ed264 | sed -n '/post-merge id audit/,+20p'
  git log --oneline -- lib/nina/queries/
  git show --stat fa13041
  ls lib/nina/queries/
  cat lib/nina/queries.ts
  python3 ~/.claude/skills/task/todos.py --root lib/nina validate
  npx prettier --check lib/nina/.workflows/todos.md
  git add lib/nina/.workflows/todos.md && git commit -m "docs(nina): audit todos.md against git/code — close all 9 stale active tasks" -- lib/nina/.workflows/todos.md
  ```
- **Files touched:** `lib/nina/.workflows/todos.md` only.
- **References:** the assigned idea's own citations (`NINA_PROMPT_VERSION`,
  `INSTRUCTOR_COACHING`, `ninaInstructorCoachingBlock`, `78ed264`); prior sessions
  `2026-09-11-todos-root-archive.md`, `2026-09-11-todos-nina-archive.md`,
  `2026-09-12-todos-nina-lib-archive.md` (the archival-trilogy precedent this session
  sits alongside, though its job — classification correction — was distinct from
  their compression job); memory note *todos closure: measure the outcome* (the
  git-derived-closure discipline this session applied to both A018 and the
  queries-split cluster).
