# Token-Maxxing Session — 2026-09-11: Nina Todos TaskID De-dup & Archive

## 🎯 Achievement / End Result
- **Goal of the burn:** Close the coordinator-assigned idea for the `todos-nina-archive`
  worker session: `components/nina/.workflows/todos.md` carried TaskID **P1-CN-A001 on
  two different tasks** (a duplicate that breaks any tooling keyed off TaskIDs), and all
  six `[x]` completed entries sat unarchived in the body, making the active view
  unscannable. Fix both, scoped strictly to `components/nina/.workflows/` — no
  component code touched.
- **Concrete changes:** two commits on `token-maxxing-2026-09-11-todos-nina-archive`:
  - `6a8987e` — *docs(nina): re-mint duplicate TaskID P1-CN-A001 — window pin becomes
    P1-CN-A005* (4 files: `todos.md`, `package_readme.md`, `plan/P1-CN-A001.md`
    restored to the keyboard task's copy, `plan/P1-CN-A005.md` created via `git mv` of
    the window-pin's copy; 1,468 insertions / 450 deletions, dominated by the two plan
    files swapping places).
  - `1d46479` — *docs(nina): archive all six completed tasks in
    components/nina/.workflows/todos.md* (`todos.md` only, +14/−109).
- **Real value delivered:**
  - The duplicate is gone **and the underlying file-clobber is healed**: both
    `P1-CN-A001` and `P1-CN-A005` now resolve via `todos.py plan-of` to existing plan
    files carrying the *matching* set's copy — before the fix, `P1-CN-A001`'s plan file
    contained the *other* task's plan.
  - The root cause was diagnosed, not guessed: an **add/add collision** from two
    parallel 2026-09-09 plan sets independently minting the same ID on their own
    branches, with the merged tree's plan file silently holding the wrong task's plan
    for two days.
  - **Tooling gap documented for the whole `.workflows` ecosystem:** `todos.py
    validate` exits 0 on a file with a real same-file TaskID collision —
    `tasks()` collapses repeats as "log echoes" — so the de-facto gate for this defect
    class is a per-entry `grep | sort | uniq -c`, now recorded in the commit message
    and this doc.
  - The archive restructure makes the package's task list scannable again (Total
    Active Tasks: 0 since 2026-09-10): six full metadata blocks collapsed to six
    single-line archive entries, while the two lines carrying live **Outstanding**
    on-device obligations keep them.
  - Honest bookkeeping preserved end-to-end: a **Former ID** stamp on the re-minted
    task, a new **Drift** line recording the clobber+restore on the keyboard task, the
    four living `package_readme.md` references corrected, and the merge note extended
    to record the resolution — historical dated log lines keep their dates.
- **Branch:** `token-maxxing-2026-09-11-todos-nina-archive` (worker session of
  coordinator `tokenmax-orch-2026-09-11`)
- **Merge status:** merged (commit `332b736` — "merge: token-maxxing session todos-nina-archive")
- **Approx token burn:** moderate — a docs-only two-commit session with no code or
  test churn, but the burn went into archaeology: blob forensics across two parallel
  branches, byte-identity verification of both file moves, `todos.py` behavior probes,
  and a repo-wide TaskID reference sweep. 🔥

## Context & Motivation
This was a **worker session** of the `tokenmax-orch-2026-09-11` coordinator (slug
`todos-nina-archive`), so there was no idea menu — the coordinator pre-assigned the
idea. Eleventh session of the day, and the day's first whose subject is the
`.workflows/` bookkeeping itself rather than code or tests.

The assigned idea verbatim: `components/nina/.workflows/todos.md` has TaskID
P1-CN-A001 reused for two different tasks. Mechanically rename the duplicate to a
fresh next-available TaskID in the CN package and update every cross-reference
(Depends on, the `.workflows/plan/P1-CN-A001.md` path, any other file naming it) —
including checking `components/nina/.workflows/plan/` for a file that needs renaming.
Then archive completed `[x]` tasks into an Archive section, following the root
`.workflows/todos.md`'s Archive convention if it has entries, otherwise a simple one.
**Why:** duplicate TaskIDs break tooling keyed off them; an unarchived todos file
makes active work hard to find.

One memory note shaped the investigation from the start: *"swarm find keys on the
SOURCE plan path — `find --plan` says 'no swarm' for the adopted P*.md copy; the
ledger indexes the phase-N.md the Plan column names."* In other words this repo's
todos entries carry a **Plan pointer** that may name either a source plan
(`.workflows/plan/<SET>/phase-N.md`) or an **adopted copy**
(`.workflows/plan/<TASKID>.md`) — and the duplicate ID meant exactly one shared
adopted-copy path was contended. Another memory note (*taskid mint collides across
sets*) predicted the mechanism before any evidence: two concurrent sets minting the
same id is a known failure mode.

## What We Did (blow-by-blow)
1. **Confirmed the duplicate as committed.** `git show HEAD:components/nina/.workflows/todos.md`
   had `P1-CN-A001` as the TaskID of two completed entries: the *keyboard channel*
   task (`photo-send-chat-icons` phase 2 of 2) and the *window pin* task
   (`search-kbd-and-up-btn` phase 1 of 2).
2. **Found the root cause — an add/add collision, not a sequential double-mint.** Both
   plan sets were authored in parallel on 2026-09-09 on their own branches, and each
   minted `P1-CN-A001` for its phase task. Because adopted plan copies live at the
   **ID-derived** path `.workflows/plan/<TASKID>.md`, both sets wrote their adopted
   copy to the *same path*. The timeline (all verified via `git log --format='%h %ad
   %s'`):
   - `a1bed18` 12:39 — `photo-send-chat-icons` 1/2 created the shared path with the
     *keyboard task's* copy;
   - `dcf9563` 12:49 — the window-pin fix landed its copy over that path **as a new
     file** (565 insertions, add/add), clobbering it;
   - `a8d2c50` 13:06 — the keyboard task's own completion commit came *after*, so the
     merged tree has held the **window-pin's plan under the keyboard task's Plan
     pointer ever since** — while the keyboard entry's Plan pointer and its grep-gate
     Drift note both still described their own (now-overwritten) copy.
   `package_readme.md` line ~982 had already documented the ID collision itself
   ("the two sets each minted a P1-CN-A001, so the chain names the set for every
   entry") — the *file-level* consequence of that collision had gone unnoticed.
3. **Decided which task keeps the ID** (see Decisions below): the keyboard task keeps
   `P1-CN-A001`; the window-pin is the duplicate that gets renamed.
4. **Minted the fresh ID properly:** `python3 ~/.claude/skills/task/todos.py mint CN
   --priority P1` → **P1-CN-A005** (next available in the CN package — A000–A004 all
   taken).
5. **Moved the files, not copies.** `git mv components/nina/.workflows/plan/
   P1-CN-A001.md components/nina/.workflows/plan/P1-CN-A005.md` (the window-pin's
   copy — verified byte-identical to the old HEAD `A001` blob first), then restored
   the keyboard task's copy byte-exact with `git show a1bed18:components/nina/
   .workflows/plan/P1-CN-A001.md > components/nina/.workflows/plan/P1-CN-A001.md`
   (verified byte-identical against the `a1bed18` blob). Both identities checked with
   `cmp`, not eyeballed.
6. **Re-pointed every cross-reference in `todos.md`:** the window-pin entry's TaskID →
   `P1-CN-A005` with a **Former ID** stamp (sync-skill convention) telling the whole
   story; its Plan pointer re-pointed from the *source* plan
   (`.workflows/plan/search-kbd-and-up-btn/phase-1.md`) to the adopted copy
   (`.workflows/plan/P1-CN-A005.md`) — now uniform with every other completed entry;
   `P1-CN-A002`'s `Depends on: P1-CN-A001` → `P1-CN-A005` (that dependency *is* the
   window pin — phase 2's bar reveal rides on phase 1's pin); and a new **Drift** line
   on the keyboard task recording the clobber and the restore honestly, dated
   2026-09-11.
7. **Corrected `package_readme.md`'s four living references** that name the window pin
   as `P1-CN-A001` — the header chain (line 4), the two "Both plan sets are complete"
   sentences, and the 12:45 branch note — to `P1-CN-A005`, and extended the merge note
   to record the resolution with the former ID. Historical dated log lines keep their
   dates; only identity labels changed.
8. **Probed the tooling** and found the gap (see the tooling finding below).
9. **Committed the de-dup** as `6a8987e` after verification.
10. **Archived.** Read the root `.workflows/todos.md`'s Archive section for the
    convention — it exists but is **EMPTY**, so per the idea's fallback the simple
    compressed format was used: all six `[x]` entries moved into `## Archive` under
    `### 2026-09` as single lines (`- {TaskID}: {title}`), sorted by TaskID. The two
    entries carrying live **Outstanding** obligations (`P1-CN-A002` and `P1-CN-A005`
    — both the decisive on-device iPhone XS Max keyboard checklists) keep them as a
    suffix on their archive lines, so compression does not orphan a still-open
    obligation. Completed Tasks remains as a section holding only a pointer note
    (4-section structure preserved); Quick Stats keeps `Completed: 6` all-time (root
    convention) and gains `Archived: 6`; `Last Updated` → 2026-09-11. The restructure
    also made a stray mid-section `### [P1] High` heading inside Completed Tasks
    disappear.
11. **Decided NOT to delete plan files:** all adopted copies are recent and
    ID-reachable via `todos.py plan-of` — verified post-archive that **all six** plan
    files resolve (the commit message says "five adopted copies", counting the
    pre-rename set; the final tree has six files, all resolving — the sixth is the
    rename's own `P1-CN-A005.md`). Full per-task metadata (Context, Drift, Decided,
    Files) survives in git history and in `package_readme.md`.
12. **Committed the archive** as `1d46479`. Tree clean after both commits.

## Code / Design Details

**The colliding pair, before the fix** (two completed entries, one TaskID):
```
- [x] **P1-CN-A001** Phase 2: Keyboard channel: about strip box fix + rename re-assert
  - **Plan Set**: `PHOTO_SEND_CHAT_ICONS_PLAN.md` (phase 2 of 2)
  - **Plan**: `.workflows/plan/P1-CN-A001.md`   ← pointed at the WRONG task's copy

- [x] **P1-CN-A001** Phase 1: The panel pins the window over its focused field
  - **Plan Set**: `SEARCH_KBD_AND_UP_BTN_PLAN.md` (phase 1 of 2)
  - **Plan**: `.workflows/plan/search-kbd-and-up-btn/phase-1.md`  ← source plan, not adopted copy
```

**After** — the window-pin entry re-minted, stamped, and re-pointed:
```
- [x] **P1-CN-A005** Phase 1: The panel pins the window over its focused field
  - **Former ID**: `P1-CN-A001` — re-minted 2026-09-11: both 2026-09-09 plan sets
    minted this ID in parallel on their own branches, colliding as an add/add on the
    shared adopted-copy path `.workflows/plan/P1-CN-A001.md`. `photo-send-chat-icons`
    phase 2 keeps it (its adopted copy created that path first: a1bed18 12:39 before
    dcf9563 12:49). This task's adopted copy moved to `.workflows/plan/P1-CN-A005.md`
    in the same fix.
  - **Plan**: `.workflows/plan/P1-CN-A005.md`
```
and the keyboard task gained the honest Drift line:
```
- **Drift** (recorded 2026-09-11): this task's adopted plan copy at
  `.workflows/plan/P1-CN-A001.md` was clobbered on main by the parallel set's add/add
  — dcf9563 (search-kbd phase 1, 12:49) wrote its copy over this path before this
  phase's completion commit a8d2c50 (13:06) landed, so the merged tree's file stopped
  being this task's copy while the Plan pointer and the grep-gate note above still
  described it. Restored byte-exact from a1bed18 during the 2026-09-11 TaskID
  de-duplication; the window-pin copy now lives at `.workflows/plan/P1-CN-A005.md`.
```

**The file swap, as committed** (`6a8987e` stat — note the two plan files effectively
trading places under one rename):
```
 components/nina/.workflows/package_readme.md  |   15 +-
 components/nina/.workflows/plan/P1-CN-A001.md | 1330 +++++++++++++++++--------
 components/nina/.workflows/plan/P1-CN-A005.md |  565 +++++++++++
 components/nina/.workflows/todos.md           |    8 +-
```
The 565-line count is itself a receipt: `dcf9563` introduced `plan/P1-CN-A001.md` as
a 565-line *new file* (the window-pin copy), and today's `P1-CN-A005.md` is 565 lines
— the same file, moved.

**The archive section as it now stands** (`1d46479`, +14/−109):
```
## Archive

### 2026-09

- P2-CN-A000: Phase 1: Attach strip: two icon sends (recent + new chat)
- P1-CN-A001: Phase 2: Keyboard channel: about strip box fix + rename re-assert
- P1-CN-A002: Phase 2: The rail's `up` reveals the main bar — Outstanding: the
  decisive on-device manual checklist (Verification steps 1-8, iPhone XS Max) remains
  open; phase 1's R1 on-device checklist (steps 1-7) is open too, and step 4 here
  rides on it
- P2-CN-A003: Phase 1: Flash the landing in the bubble's own color — and prove the
  jobs jump end-to-end
- P1-CN-A004: Phase 2: Write-time dedup: jalur upload chat runner
- P1-CN-A005: Phase 1: The panel pins the window over its focused field (formerly
  `P1-CN-A001`) — Outstanding: the decisive on-device R1 confirmation (plan invariant
  8: fresh-bundle check + steps 1-7 on the iPhone XS Max) remains open
```

**The tooling finding, stated precisely:** `todos.py validate` exits 0 both before
and after the fix. `TodoFile.tasks()` collapses same-file ID repeats as "log echoes"
— a heuristic built for files that legitimately repeat an ID across log lines — so a
real collision between two *completed task entries* in one file is invisible to
validate/scan. The binding gate for this defect class is per-entry:
```bash
grep -oE '^- \[.\] \*\*P[0-4]-CN-A[0-9]{3}\*\*' components/nina/.workflows/todos.md | sort | uniq -c
# before the fix: 2 × P1-CN-A001 among six entries; after: six distinct IDs, count 1 each
```
(Post-archive the same grep returns zero entries — everything is a single-line archive
line — which is itself the proof no checkbox survived compression.)

## Decisions & Trade-offs
- **The keyboard task keeps P1-CN-A001; the window-pin is renamed.** The idea said
  "rename the duplicate" without saying which of the two was the duplicate — the
  whole decision is the ladder: idea's Why (tooling keyed off TaskIDs must resolve) →
  repo convention (adopted-copy path is ID-derived) → surrounding convention (readme
  chain names tasks by ID). Three reasons for this direction:
  1. **First-created wins is the only hard ordering available for parallel mints.**
     The keyboard's adopted copy created the shared path first (`a1bed18` 12:39 <
     `dcf9563` 12:49), so keeping its ID makes `todos.py plan-of P1-CN-A001` resolve
     to *matching content* — the resolution property the Why actually asks for.
  2. **Smallest blast radius.** Every *living* readme reference to `P1-CN-A001` (the
     header chain, the module-map row for `NinaAboutScreen`, the geometry prose)
     means the keyboard task and stays valid untouched; only the window-pin's four
     mentions needed the new ID. The opposite choice would have staled 6+
     references including the module map.
  3. **It heals the clobber.** Keeping the keyboard on A001 is what justified
     restoring its adopted copy, making its Plan pointer and grep-gate Drift note
     true again after two days of pointing at the wrong file.
- **Stamp, don't silently rename.** The **Former ID** line and the readme merge-note
  amendment exist because TaskIDs are referenced in dated history, chat logs, and
  plans; a bare rename orphans anyone following an old reference. Same reason the
  keyboard task gets a *new* Drift line rather than rewriting its old ones — the
  clobber happened, and the record says so with dates and hashes.
- **Follow the root Archive convention's *shape*, not its emptiness.** The root
  `.workflows/todos.md` has an Archive section but zero entries, so there was no
  entry-level format to copy; per the idea's fallback the simple compressed format
  was used. But two conventions were kept anyway: `Completed: 6` stays all-time in
  Quick Stats (root convention) with `Archived: 6` added alongside, and Completed
  Tasks remains as a section (with a pointer note) so the file keeps its 4-section
  structure.
- **Compress the metadata, keep the obligations.** Six full metadata blocks (~109
  lines) became six single lines — but the two entries with live **Outstanding**
  on-device checklists keep them verbatim as line suffixes. A compressed archive that
  orphans a still-open iPhone XS Max verification would be worse than an
  unscannable file.
- **Plan files deliberately NOT deleted.** A fully-archived package invites pruning
  `plan/`; all six adopted copies are recent and ID-reachable via `todos.py plan-of`,
  and package_readme.md plus git history carry the full metadata. Nothing is
  unreachable, so nothing needed deleting.
- **Scope held to `.workflows/`.** No component code, no other package — a repo-wide
  grep (all file types) confirmed nothing outside `components/nina/.workflows/`
  references these IDs, so the blast radius genuinely ended at the package's
  workflows dir. This repo's origin is a personal GitHub repo, so the
  sync-todos-into-gitlab-board identity concern does not apply here.

## Follow-ups & YAGNI notes
- **The `todos.py validate` blind spot is recorded, not patched.** The skill file
  lives in `~/.claude/skills/task/` (a deploy target per the day's memory notes —
  patching it there gets overwritten, and the real source is `~/claude-commands`), and
  fixing tooling outside the assigned scope was out of bounds for this session. A
  future change could make `validate` (or `tasks()`) distinguish "repeated ID in a
  log line" from "repeated ID as a task-entry TaskID" — the per-entry uniq gate in
  the Appendix is the manual substitute until then.
- **Did not touch the root `.workflows/todos.md`** (or any other package's), even to
  backfill an Archive entry format — the idea scoped this session to
  `components/nina/.workflows/` only.
- **The five-vs-six count imprecision in `1d46479`'s message** ("all five adopted
  copies" — accurate for the pre-rename set, but the final tree has six, including
  the rename's own `P1-CN-A005.md`) is left as committed; amending a pushed-to-branch
  message for one word is not worth it, and this doc records the true count.
- **YAGNI: no renumber-to-close-gaps.** The package now has IDs A000–A005 with no
  gap (the collision resolution consumed the next free number naturally); no attempt
  was made to "compact" anything, and none should be — IDs are identity, not
  sequence.

## Appendix

**Commits (this branch, tree clean after both):**
```
1d46479 docs(nina): archive all six completed tasks in components/nina/.workflows/todos.md
        components/nina/.workflows/todos.md | 123 ++++------  (+14/−109)
6a8987e docs(nina): re-mint duplicate TaskID P1-CN-A001 — window pin becomes P1-CN-A005
        4 files changed, 1468 insertions(+), 450 deletions(-)
```

**Collision timeline (verified via `git log --format='%h %ad %s'`):**
```
a1bed18  2026-09-09 12:39  feat(nina): attach strip sends by icon — recent + always-new chat (photo-send-chat-icons 1/2)   ← creates plan/P1-CN-A001.md (keyboard copy)
dcf9563  2026-09-09 12:49  fix(nina-sidebar): pin the window over the focused panel field …                                 ← re-adds it as a NEW 565-line file (window-pin copy) — the clobber
a8d2c50  2026-09-09 13:06  feat(nina): keyboard-overlap publisher + about strip box fix … (photo-send-chat-icons 2/2)       ← keyboard task completes AFTER its plan file was overwritten
```

**Verification receipts (all re-run against the final tree):**
- Task-entry IDs: six distinct values, each exactly once (was: `P1-CN-A001` twice in
  `git show HEAD~2:{todos.md}`).
- `todos.py validate` exit 0, canonical + unique — before AND after (the blind spot
  above; it is not evidence of correctness either way).
- `todos.py plan-of` resolves **all six** TaskIDs (`P2-CN-A000`, `P1-CN-A001`,
  `P1-CN-A002`, `P2-CN-A003`, `P1-CN-A004`, `P1-CN-A005`) to existing files under
  `components/nina/.workflows/plan/`, each carrying the matching set's copy.
- Both file operations byte-identical against their git blobs: the moved
  `P1-CN-A005.md` vs the old HEAD `A001` blob, and the restored `P1-CN-A001.md` vs
  `git show a1bed18:...`.
- Zero `- [ ]`/`- [x]` checkboxes remain in the archived `todos.md`.
- Repo-wide grep: no component code or other package references any CN TaskID.

**Commands run (representative):**
```bash
python3 ~/.claude/skills/task/todos.py mint CN --priority P1                 # → P1-CN-A005
git mv components/nina/.workflows/plan/P1-CN-A001.md components/nina/.workflows/plan/P1-CN-A005.md
git show a1bed18:components/nina/.workflows/plan/P1-CN-A001.md > components/nina/.workflows/plan/P1-CN-A001.md
python3 ~/.claude/skills/task/todos.py plan-of P1-CN-A001   # and P1-CN-A005, and the other four
python3 ~/.claude/skills/task/todos.py validate components/nina/.workflows/todos.md
grep -oE '^- \[.\] \*\*P[0-4]-CN-A[0-9]{3}\*\*' components/nina/.workflows/todos.md | sort | uniq -c
```

**Files touched:**
- `components/nina/.workflows/todos.md` — de-dup + re-point + Drift line, then archive
- `components/nina/.workflows/package_readme.md` — four living references + merge note
- `components/nina/.workflows/plan/P1-CN-A001.md` — restored (keyboard copy, from a1bed18)
- `components/nina/.workflows/plan/P1-CN-A005.md` — created via rename (window-pin copy)

**References:** memory notes *taskid mint collides across sets* (predicted the
mechanism) and *swarm find keys on the SOURCE plan path* (source-plan vs adopted-copy
Plan pointers); `package_readme.md` line ~982's pre-existing documentation of the ID
collision; the sync-skill's **Former ID** convention for renames.
