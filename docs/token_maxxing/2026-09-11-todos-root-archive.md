# Token-Maxxing Session — 2026-09-11: Todos Root Archive & TaskID Dedupe

## 🎯 Achievement / End Result
- **Goal of the burn:** A Worker Mode session (idea assigned by coordinator
  `tokenmax-orch-2026-09-11`, no self-picked menu) with two jobs on the root
  `.workflows/todos.md`: (1) the file had grown to 844 lines, ~90% of them completed
  `[x]` tasks never archived despite an empty, unused `## Archive` header — move them
  into Archive, condensed; (2) TaskIDs `P1-RI-A025` and `P1-RI-A026` were each reused
  for two entirely different tasks — mechanically rename the later entries to fresh
  IDs and update every cross-reference.
- **Concrete changes:** one commit, `0798fc4` — *chore(workflows): archive 41 completed
  RI tasks; dedupe TaskIDs A025/A026* — 8 files, **+55/−814**:
  - `.workflows/todos.md` — rewritten 844 → **84 lines**: Header + corrected Quick
    Stats, empty Active-Tasks skeleton, empty Completed Tasks, and an Archive section
    holding all 41 completed tasks as one line each.
  - `.workflows/plan/P1-RI-A025-simplify-personality-settings.md` →
    `P1-RI-A040-simplify-personality-settings.md`, and
    `P1-RI-A026-simplify-personality-settings.md` →
    `P1-RI-A041-simplify-personality-settings.md` — both via `git mv`, landing as
    **R100 renames** (content untouched; the plan files never self-reference their IDs).
  - 5 × `package_readme.md` (root, `lib/db`, `lib/admin`, `components/admin`,
    `lib/nina`) — 9 content sites re-pointed from A025/A026 to A040/A041 where the
    content belongs to the SIMPLIFY set.
- **Real value delivered:**
  - The duplicate TaskIDs that break tooling keyed off them (task-locator, plan index)
    are gone: `A025`/`A026` now mean exactly one task each (the SEARCH set's), and the
    SIMPLIFY tasks live at fresh, verified-unspent `P1-RI-A040`/`P1-RI-A041`.
  - Seeing what's actually open now costs 84 lines instead of 843: the file has **zero
    unchecked tasks and zero `[x]` checkboxes anywhere** — Active Tasks is an honest
    empty skeleton, and every bit of completed history is one grep-able line per task.
  - Nothing was lost in the condensation: every archived line keeps TaskID, title, plan
    set + phase ("phase x of y"), and the bracketed plan-file path — all 40 bracketed
    paths verified to exist on disk — so the todos→plan-file mapping and anything that
    keys off plan paths keeps working.
  - A stale Quick Stats line was corrected along the way (claimed 37 completed; the
    real count, asserted by a parse-everything script, was 41 — now `Completed: 41,
    Archived: 41`).
  - The mint-collision mechanism is now documented with a safe recipe (see Decisions):
    `todos.py mint` fills the lowest hole, which is exactly how a spent-then-pruned ID
    (the A020 precedent) comes back as a collision.
- **Branch:** `token-maxxing-2026-09-11-todos-root-archive` (Worker Mode — the session
  does NOT merge to main itself)
- **Merge status:** on branch at `0798fc4`, awaiting the coordinator's merge
  (`tokenmax-orch-2026-09-11` owns landing the parallel fan-out)
- **Approx token burn:** moderate — an 844-line parse with assert-heavy verification,
  whole-tree ID greps, and 9 readme sites re-pointed; no build or test cycles. 🔥

## Context & Motivation
This session ran in Worker Mode as part of a parallel token-maxxing fan-out: the
coordinator session (`tokenmax-orch-2026-09-11`) spawned workers with pre-assigned
ideas, so there was no menu to pick from — the assignment arrived with its Why already
written:

- **Idea:** the root `.workflows/todos.md` was 844 lines, ~90% completed `[x]` tasks
  that had never been archived, sitting above an empty, unused `## Archive` header.
  Move the completed tasks into that Archive section — grouped/condensed, keeping
  TaskIDs and one-line descriptions, dropping verbose Drift/Decided prose that is
  already historical. Separately, `P1-RI-A025` and `P1-RI-A026` were each reused for
  two entirely different tasks; rename the duplicate/later entries to fresh
  next-available TaskIDs in the same package and update every cross-reference
  (`Depends on` lines, Plan paths, the plan files under `.workflows/plan/`, and a
  whole-repo grep for strays).
- **Why:** duplicate TaskIDs break tooling that keys off them (task-locator, plan
  index), and an 843-line todos file makes it expensive to see what's actually open.

The duplicates had a known origin, recorded in each affected entry's own Drift notes:
a **2026-09-09 mint race between two plan sets**. Both the
`SEARCH_CLEAR_AND_SIDEBAR_ICONS` set and the `SIMPLIFY_PERSONALITY_SETTINGS` set minted
their phase-1 and phase-2 IDs in the same window and both were handed `A025`/`A026` —
four tasks, two IDs, each pair about a completely different piece of work.

## What We Did (blow-by-blow)

### 1. Survey — and the first correction
A full parse of the 844-line file established the ground truth: **41 completed
entries**, **40 unique IDs** (exactly 2 collisions — the A025/A026 pairs), **3
checkmarked tasks stranded under Active Tasks** rather than Completed, and **zero
unchecked tasks anywhere** in the file. The file's own Quick Stats claimed 37
completed — stale, off by four. The real count (41) was later asserted mechanically by
the rewrite script and written back as `Completed: 41`, with `Archived: 41` added.

### 2. The dedup — cross-set collisions, and the trap worth recording
The two duplicate pairs **cross plan sets**:

| ID | SEARCH_CLEAR_AND_SIDEBAR_ICONS (kept) | SIMPLIFY_PERSONALITY_SETTINGS (renamed) |
|----|----------------------------------------|------------------------------------------|
| A025 | phase 1 — keyboard/search | phase 1 — tuning-revision purge → **P1-RI-A040** |
| A026 | phase 2 — session icons | phase 2 — Personality auto-save → **P1-RI-A041** |

The **LATER** entries — the SIMPLIFY pair — were renamed. Before choosing A040/A041
they were verified unspent two ways: `git log --all -S` for each candidate ID came back
empty, and neither appeared in any `todos.md` anywhere in the tree. This recipe exists
because of the repo's A024 precedent: `mint` answers with the *lowest hole*, and the
lowest hole (A020) had already been spent once and pruned from the file — so
"highest + 1" **plus a history check** is the safe mint recipe, and A040/A041 followed
it.

The subtle cross-reference was the `Depends on` lines: after the rename, the SIMPLIFY
phase-2 entry's `Depends on: P1-RI-A025` correctly follows to **A040**, while A027's
`Depends on: P1-RI-A025` (SEARCH phase 3 → SEARCH phase 1) correctly **keeps** A025.
Which dependency points where is decided purely by which set the depending task
belongs to. Both SIMPLIFY plan files were renamed with `git mv` — they landed as R100
renames because their content never mentions their own IDs, so nothing inside them
needed editing.

### 3. Readme cross-references — discriminate by content, not by ID or date
9 content sites were re-pointed across 5 `package_readme.md` files (root, `lib/db`,
`lib/admin`, `components/admin`, `lib/nina`). The discriminator at each site was the
site's **CONTENT**, not its ID or its date: the root `.workflows/package_readme.md`
carries *two* `### Recent changes — P1-RI-A025 (2026-09-09)` headings, one per set —
line 1020 is the SEARCH set's (keeps A025), line 1224 is the SIMPLIFY set's (became
A040). Same ID, same date, opposite dispositions.

A final repo-wide audit caught one straggler the first pass had missed: the
`components/admin` readme's giant Last-Updated line, which named A026 for the SIMPLIFY
set. Post-fix state, mechanically verified (and re-verified independently while writing
this doc): **A040/A041 appear at exactly 11 sites** repo-wide; the remaining
**A025/A026 appear at exactly 4 sites**, all legitimately the SEARCH tasks — 2 archive
lines in todos.md, 2 root-readme SEARCH headings. Zero references to the old SIMPLIFY
plan *filenames* remain anywhere.

### 4. The archive rewrite — assert-heavy, refuse-on-surprise
The rewrite was done by a strict Python script (since deleted) that parsed all 41
entries while asserting everything it assumed: the entry count, ID formats, Completed
dates, Plan Set presence (P1-RI-A014 the only known exception, which carries a
`Source:` line instead of a bracketed plan path) — and **refused to write on any
surprise**. It in fact refused once, correctly: it caught that the ID renames had
already been applied by an earlier Edit pass, i.e. the assert layer was doing its job
against a file that had moved under it.

Output: the file's canonical 4-section structure — Header + Quick Stats, Active Tasks
skeleton, empty Completed Tasks, Archive — at 844 → 84 lines. Each archived line is
one line:

```
- {TaskID}: {title} — {plan set (phase x of y)} [{plan path}]
```

The plan path is kept in brackets so every plan file stays reachable from the todos
file and tooling that keys off plan paths keeps working; all 40 bracketed paths were
verified to exist on disk (41 lines, A014's Source-line entry has no bracket).

### 5. Verification battery
After the rewrite, all of the following were checked mechanically: zero `[x]` anywhere
in the file; exactly 4 top-level sections; 41 archive lines = 41 unique IDs, zero
duplicates; no dangling RI ID mentioned anywhere in the file; every plan path exists;
and the repo-wide ID audit from step 3 (11 sites / 4 sites, as above).

### 6. The commit mechanics catch — read the `--stat`
The first commit attempt used `git commit -- <pathspec>` naming the **NEW** plan
filenames but not the OLD ones — so the rename's deletion half stayed staged, HEAD
briefly held both names, and the `--stat` read backwards (+2621/−814, two `create mode`
lines). Spotted by reading the `--stat` — the shared-worktree rule, doing its job —
and fixed by amending with the full index. The final commit is 8 files, +55/−814,
R100 renames, clean tree, content verified from `git show HEAD:.workflows/todos.md`.

## Code / Design Details

**Before → after, top of file:**

```markdown
## Quick Stats                      ## Quick Stats
- P0 Critical: 0                    - P0 Critical: 0
...                                 ...
- Completed: 37   ← stale           - Completed: 41
                                    - Archived: 41   ← new
```

**The archive line format** (the whole condensed history — 41 of these):

```
- P1-RI-A040: Phase 1: Purge the tuning revision mechanism everywhere — `SIMPLIFY_PERSONALITY_SETTINGS_PLAN.md` (phase 1 of 2) [.workflows/plan/P1-RI-A040-simplify-personality-settings.md]
- P1-RI-A025: Phase 1: The keyboard stops eating the sidebar's fields; the search field clears — `SEARCH_CLEAR_AND_SIDEBAR_ICONS_PLAN.md` (phase 1 of 3) [.workflows/plan/P1-RI-A025.md]
- P1-RI-A014: The `nina/` blob reaper must count references, not rows — Source: `NINA_CHAT_SESSIONS_PLAN.md` — phase 7's handoffs and phase 9's H5
```

(A014 is the one entry with no bracketed plan path — it carries an explicit `Source:`
line instead, the format the rewrite script explicitly allowed for.)

**Final file shape (84 lines):**

| Section | Content |
|---------|---------|
| Header + Quick Stats | package identity, `Total Active Tasks: 0`, Completed 41 / Archived 41 |
| Active Tasks | the empty P0–P4/Blocked skeleton — 3 stranded checkmarks that used to live here are gone |
| Completed Tasks | empty (everything goes straight to Archive) |
| Archive | `### 2026-09`, 41 one-line entries |

**ID ledger after the dedupe:**
- `A025`, `A026` → SEARCH_CLEAR_AND_SIDEBAR_ICONS phases 1–2 only (4 remaining
  reference sites, all SEARCH).
- `A040`, `A041` → the SIMPLIFY phases (11 reference sites), minted at highest+1 with
  the history check; `git log --all -S 'P1-RI-A040'` returns only this session's
  commit, confirming the IDs were virgin.
- Historical holes remain holes: A020 (the spent-then-pruned precedent) and A030 are
  simply absent from the sequence rather than reused.

**The commit, as landed:**

```
0798fc4 chore(workflows): archive 41 completed RI tasks; dedupe TaskIDs A025/A026
 .workflows/package_readme.md                   |  4 +-
 ...A025-simplify... => ...A040-simplify...}    |  0   (R100)
 ...A026-simplify... => ...A041-simplify...}    |  0   (R100)
 .workflows/todos.md                            | 851 ++-------------------
 components/admin/.workflows/package_readme.md  |  6 +-
 lib/admin/.workflows/package_readme.md         |  2 +-
 lib/db/.workflows/package_readme.md            |  4 +-
 lib/nina/.workflows/package_readme.md          |  2 +-
 8 files changed, 55 insertions(+), 814 deletions(-)
```

## Decisions & Trade-offs
- **Rename the later entries, keep the earlier ones.** The duplicates came from a
  two-set mint race; the tiebreaker was recency (each entry's own Drift records the
  race). The SEARCH set's entries keep A025/A026; the SIMPLIFY pair moved. This keeps
  the older, more widely-referenced IDs stable and relocates the minimum.
- **Discriminate readme sites by content, not ID/date.** With two same-ID same-date
  headings in one file, only the surrounding content says which set a site belongs to.
  This is also what caught the Last-Updated-line straggler the ID/position pass missed.
- **Unspent-verification before minting:** highest+1 is not enough (the A020
  lowest-hole precedent proves a pruned ID can be silently re-handed); the
  `git log --all -S` emptiness check plus absence from every todos.md in the tree is
  the full recipe, and is now the documented one.
- **Deliberate deviation from the reorganize-todos skill, on the decision ladder**
  (the idea's stated Why > skill convention): the skill's 80/20
  Completed-then-Archive rule was **not** followed — the idea says move *all*
  completed straight to Archive, so Completed Tasks is empty. Likewise the skill's
  cleanup step suggests deleting historical plan files; they were **not** deleted,
  because the ledger and other tooling key off plan paths.
- **Keep one metadata line per archived task, plan path included.** The condensation
  drops all verbose Drift/Decided prose but keeps TaskID, title, plan set + phase, and
  the bracketed plan path — the cheapest line that preserves the todos→plan mapping.
  The alternative (TaskID + title only) would have made the file smaller but severed
  every archived task from its plan file.
- **Assert-heavy rewrite over hand-edits:** the script's refusal-on-surprise cost one
  extra iteration and caught a real mid-flight inconsistency (renames already applied
  by an earlier pass). For a mechanical rewrite of 41 entries over an 844-line file,
  the asserts were the difference between a verified rewrite and a hopeful one.
- **`git mv` for the plan files** even though their content didn't need to change:
  it preserves rename detection (R100 in the landed commit), which keeps the history
  of both plan files reachable from their new names.

## Follow-ups & YAGNI notes
- **None required.** Optional observations left on the table:
  - `todos.py mint` fills the *lowest hole*, which is exactly how spent-then-pruned
    IDs (A020) come back as collisions. Highest+1 plus a `git log --all -S` check
    remains the safe mint recipe — today's A040/A041 followed it. If mint collisions
    recur, the fix belongs in `mint` itself (skip IDs with any history), not in more
    manual dedupes.
  - The archive deliberately keeps one line of metadata per task (plan set + plan
    path). If a future session wants the file even smaller, those brackets are the
    droppable part — but dropping them costs the todos→plan-file mapping, so this is
    a conscious trade, not a free win.
  - A030 is a second hole in the ID sequence alongside the known A020 story; both are
    left absent rather than reused, per the recipe above.

## Appendix
- **Branch / commit:** `token-maxxing-2026-09-11-todos-root-archive` @ `0798fc4`
  (8 files, +55/−814). Not merged to main — Worker Mode reports DONE to coordinator
  `tokenmax-orch-2026-09-11`, which owns the merge.
- **Assigned idea's Why (verbatim intent):** duplicate TaskIDs break tooling that keys
  off them (task-locator, plan index), and an 843-line todos file makes it expensive
  to see what's actually open.
- **Verification battery, as run and as re-confirmed while writing this doc:**
  - `wc -l .workflows/todos.md` → 84.
  - `grep -c '\[x\]'` and `grep -c '\[ \]'` → 0 and 0.
  - `grep -n '^## '` → exactly Quick Stats / Active Tasks / Completed Tasks / Archive.
  - Archive line count: 41 (40 × `P1-RI-*` + 1 × `P2-RI-A006`); 41 unique IDs, zero
    duplicates; A014 the only non-bracketed entry.
  - `grep -rE 'P1-RI-A040|P1-RI-A041'` repo-wide (all file types, .git/node_modules
    excluded) → exactly 11 hits.
  - `grep -rn 'P1-RI-A025|P1-RI-A026'` → exactly 4 hits: 2 todos archive lines, 2
    root-readme `### Recent changes` SEARCH headings.
  - Old SIMPLIFY plan filenames (`P1-RI-A02[56]-simplify-personality-settings.md`) →
    0 references anywhere.
  - Both renamed plan files exist under `.workflows/plan/`; `git log --all -S
    'P1-RI-A040'` → only `0798fc4` (the IDs were unspent).
- **Commit mechanics lesson (recurring rule, third confirmation):** `git commit --
  <pathspec>` that names only a rename's new half leaves the deletion half staged;
  the `--stat` read backwards (+2621/−814, two `create mode` lines) until the amend
  with the full index. Read the `--stat`.
- **Survey corrections worth remembering:** Quick Stats had drifted (said 37, real
  41) and 3 completed tasks sat checkmarked under Active Tasks — both are exactly the
  kind of drift that makes a todos file's own summary untrustworthy; the rewrite now
  asserts counts instead of trusting them.
