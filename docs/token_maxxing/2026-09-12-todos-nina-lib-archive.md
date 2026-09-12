# Token-Maxxing Session — 2026-09-12: Lib Nina Todos Archive

## 🎯 Achievement / End Result
- **Goal of the burn:** Close the coordinator-assigned idea for the `todos-nina-lib-archive`
  worker session: `lib/nina/.workflows/todos.md` was the **one package ledger yesterday's
  two todos-archive sessions did not touch** — 703 lines against siblings of 53–157 —
  with all 35 `[x]` completed entries sitting unarchived above a single live task.
  Apply the same YAGNI/compaction pattern to it and complete the archival trilogy.
- **Concrete changes:** one commit, `d81aa7f` — *docs(nina): archive all 35 completed
  tasks in lib/nina/.workflows/todos.md* — 1 file, **+45/−658**: the ledger rewritten
  703 → **90 lines** (Header + Quick Stats, the untouched Active Tasks section with the
  one live task, a Completed Tasks pointer note, and an Archive section holding all 35
  completed tasks as one line each). No other file touched; no code, no tests, no plan
  files.
- **Real value delivered:**
  - Seeing what's actually open in the NIN package now costs 90 lines instead of 703:
    exactly **one live task** (`P1-NIN-A018`, instructor-character phase 3 of 3) sits at
    the top, and every bit of completed history is one grep-able line per task.
  - **Nothing was orphaned by the compression.** Every archived line keeps TaskID,
    title, plan set + phase ("phase x of y"), and the bracketed plan path — all 35
    bracketed paths verified to resolve on disk (see the two-base split below), so the
    todos→plan-file mapping and anything keyed off plan paths keeps working.
  - **The three still-open obligations survived verbatim** as line suffixes: A008's
    `**Open**` manual production checks (selfie, close-tab, first `nina_message_images`
    row, first generated `nina_avatars` row, backstop drain), A013's `**Outstanding**`
    post-deploy prod probe (upload `enina5.png` through `/admin/photos`), and A017's
    `**Outstanding**` manual `/admin/memory` browser check. A compressed archive that
    buried them would have silently retired live ops work.
  - **Zero dedup needed, and proven rather than assumed:** all 36 checkbox entries had
    unique TaskIDs at the per-entry `grep | sort | uniq -c` gate — the binding duplicate
    gate in this repo, since `todos.py validate` collapses repeats as echoes.
  - **Honest bookkeeping end-to-end:** Quick Stats' `Completed: 35` was verified as the
    REAL count before the rewrite (unlike the root session, whose stats claimed 37 of a
    real 41), `Archived: 35` added alongside it, and the Active Tasks section left
    **byte-identical** — diff-verified, not hand-copied.
- **Branch:** `token-maxxing-2026-09-12-todos-nina-lib-archive` (worker session of
  coordinator `tokenmax-orch-2026-09-12`, slug `todos-nina-lib-archive`)
- **Merge status:** merged (commit `8ae483b`)
- **Approx token burn:** moderate — a docs-only single-commit session with no build or
  test cycles, but the burn went into the inventory, plan-pointer archaeology across two
  path bases, an assert-heavy refuse-on-surprise rewrite, and a verification battery
  re-run to the digit. 🔥

## Context & Motivation
This was a **worker session** of the `tokenmax-orch-2026-09-12` coordinator (slug
`todos-nina-lib-archive`), so there was no idea menu — the coordinator pre-assigned the
idea, with its Why already written.

The assigned idea verbatim: archive completed/stale entries in
`lib/nina/.workflows/todos.md` (703 lines — the one package ledger yesterday's
root/nina todos-archive sessions did not touch; siblings are 53–157 lines). **Why:**
same YAGNI/compaction pattern as yesterday's root and nina-component todos archival
sessions, applied to the one ledger still bloated.

That makes this the **third and final session of the package-ledger archival trilogy**:

| Session | Ledger | Before → After |
|---------|--------|----------------|
| 2026-09-11 `todos-root-archive` | `.workflows/todos.md` (root) | 844 → 84 lines, 41 archived |
| 2026-09-11 `todos-nina-archive` | `components/nina/.workflows/todos.md` | 123 → ~28, 6 archived (+ the TaskID dedupe) |
| **this session** | **`lib/nina/.workflows/todos.md`** | **703 → 90 lines, 35 archived** |

Because both 2026-09-11 precedent docs existed, the session's first act was to read
them and adopt the **union** of their two archive-line formats — rather than invent a
third format or re-derive one from the `reorganize-todos` skill.

## What We Did (blow-by-blow)
1. **Loaded the `reorganize-todos` skill, then read both 2026-09-11 precedent docs**
   (`2026-09-11-todos-root-archive.md`, `2026-09-11-todos-nina-archive.md`) and adopted
   their union format for the archive lines (see Decisions for what each side
   contributed).
2. **Inventoried the ledger.** 36 checkbox entries: **35 `[x]` completed** plus **1
   active unchecked task** — `P1-NIN-A018`, phase 3 of 3 of
   `NINA_INSTRUCTOR_CHARACTER_PLAN` (the coaching register and the insight path). The
   per-entry `grep -oE '^- \[.\] \*\*P[0-4]-NIN-A[0-9]{3}\*\*' … | sort | uniq -c`
   gate showed **every ID exactly once** — so, unlike both 2026-09-11 sessions, **no
   dedup pass was needed at all**. The file's own Quick Stats said `Completed: 35`,
   and the inventory confirmed 35 is the real count — not stale (the root ledger's
   had claimed 37 of a real 41; this one was honest before the rewrite).
3. **Audited the Plan pointers, which live on two different bases** — the known
   package-relative quirk from the day's memory notes:
   - **25 entries** point at **adopted copies** `plan/P1-NIN-A###.md`, which resolve
     **package-relative** from `lib/nina/`;
   - **11 entries** point at **source plans** `.workflows/plan/<set>/phase-N.md`,
     which resolve **REPO-ROOT-relative**. Ten of those eleven are on completed
     entries (`A007`–`A012`, `A016`, `A017`, `A030`, `A031`); the eleventh is the live
     `A018`, untouched.
   The ten were verified **pre-existing**: their adopted copies never existed (absent
   at HEAD too), while their source-plan directories **do** exist at the repo root —
   so every one of the 35 completed entries has a reachable plan path, just on two
   different bases. Both bases were kept **as recorded** on the archive lines.
4. **Found the three live obligations that must survive compression** (each a full
   metadata block in the pre-image): A008 `**Open**` — exit criteria 1–6 are manual
   production checks needing a deploy and a real conversation; A013 `**Outstanding**`
   — the post-deploy prod probe (`enina5.png` through `/admin/photos`); A017
   `**Outstanding**` — the manual `/admin/memory` browser check, deliberately deferred
   until the wave landed because a worktree build would have compiled phase 1's
   in-flight edits.
5. **Rewrote the file with an assert-heavy Python script** (the root session's
   refuse-on-surprise precedent): it asserted the entry counts, ID uniqueness,
   Completed dates all in 2026-09, Plan Set/plan presence, and **every plan path
   resolving at exactly one of the two bases** — and refused to write on any surprise.
   All asserts passed before the write. Output: 703 → 90 lines, with the Active Tasks
   section **byte-identical** (diff-verified against the pre-image), Completed Tasks
   reduced to a pointer note (the components/nina convention), and a new `## Archive`
   / `### 2026-09` holding 35 one-line entries sorted by TaskID in the union format,
   with ` — Outstanding:`/` — Open:` suffixes carrying the three obligations. Quick
   Stats: `Completed: 35` stays all-time (root convention), `- Archived: 35` added;
   `Last Updated` → 2026-09-12.
6. **Ran the verification battery** — all green (receipts in the Appendix): 0 `[x]`
   and exactly 1 `[ ]` remaining; exactly 4 top-level sections; 35 archive lines with
   0 duplicate IDs; all 35 bracketed plan paths resolve (0 missing); Active Tasks diff
   IDENTICAL; `todos.py --root lib/nina validate` exit 0; `npx prettier --check` clean
   (run inside the repo, per the memory rule).
7. **Committed** as `d81aa7f` by explicit pathspec, read the `--stat` (1 file,
   +45/−658, exactly as intended), tree clean.

## Code / Design Details

**The union archive-line format** — root session's plan-set + bracketed path, plus the
nina-component session's obligation suffix. Two real lines from the final file, chosen
to show both suffix kinds and both path bases:

```
- P1-NIN-A008: Phase 2: Move generation onto Vercel Fluid compute; demote GitHub
  Actions to backstop — `NINA_IMAGE_PIPELINE_AND_ASYNC_CHAT_PLAN.md` (phase 2 of 7)
  [.workflows/plan/nina-image-pipeline-and-async-chat/phase-2.md] — Open: exit
  criteria 1-6 are **manual production checks** and are unverified, not assumed — …
  (repo-root-relative source plan + Open suffix)

- P1-NIN-A013: Phase 1: Model the random suffix as its own group, in both predicates,
  and pin the fixtures to a measured one — `BLOB_STORED_PATHNAME_WINDOW_PLAN.md`
  (phase 1 of 1) [.workflows/plan/P1-NIN-A013.md] — Outstanding: exit criterion 6,
  the post-deploy prod probe (upload `enina5.png` through `/admin/photos` …), is NOT
  done and is run by the main context after this push.
  (package-relative adopted copy + Outstanding suffix)
```

**Final file shape (90 lines):**

| Section | Lines | Content |
|---------|-------|---------|
| Header + Quick Stats | 1–18 | package identity, `Total Active Tasks: 1`, Completed 35 / Archived 35, `Last Updated: 2026-09-12` |
| Active Tasks | 20–41 | **byte-identical** to the pre-image — the P1 skeleton with only `P1-NIN-A018` in it; empty P2/P3/P4 headings |
| Completed Tasks | 44–48 | a three-line pointer note to the Archive (and to git history + `package_readme.md` for full metadata) |
| Archive | 52–90 | `### 2026-09`, 35 one-line entries sorted by TaskID |

**Quick Stats, before → after:**

```markdown
- Completed: 35        ← verified REAL pre-rewrite    - Completed: 35
                                                      - Archived: 35   ← new
```

**The tooling findings, stated precisely** (both re-measured while writing this doc):

- **`todos.py plan-of` is a pure ID→path DERIVER, not an existence checker.**
  `todos.py plan-of P1-NIN-A007` exits 0 and prints
  `.workflows/plan/P1-NIN-A007.md` — a file that does **not** exist under
  `lib/nina/.workflows/plan/` (it never did; absent at HEAD too). It answers for any
  canonical ID, with or without `--root`, deriving the convention path regardless of
  what is on disk. So a green `plan-of` is **not** a reachability receipt; the real
  one here is the on-disk check: 25 adopted copies exist package-relative under
  `lib/nina/.workflows/plan/`, and the 10 source plans exist repo-root-relative under
  `.workflows/plan/<set>/phase-N.md`. (The session's working notes initially recorded
  this the other way around — "plan-of resolves 25/25 and fails for the 10" — the
  direct measurement corrects that, and the earlier `validate` claim, below.)
- **`todos.py --root lib/nina validate` counts only the 1 live entry** — its output is
  `validate: 1 live entries (1 incl. echoes), every TaskID canonical and unique`,
  exit 0. The 35 archive lines are collapsed as echoes, so validate is blind to
  them by design; the per-entry `grep | sort | uniq -c` gate remains the real
  duplicate detector for this file (and it is the gate that showed 36/36 unique
  pre-rewrite and 35/35 post). This is the same blind spot the 2026-09-11 nina
  session documented; nothing new to patch, just re-recorded with its exact shape.

## Decisions & Trade-offs
- **Union archive-line format, deliberately.** The root session's format
  (`{TaskID}: {title} — \`{PLAN_SET}.md\` (phase x of y) [{plan path}]`) keeps the
  todos→plan mapping — which matters more here than it did there, because **10 of the
  35 entries have NO ID-derivable adopted copy** (their plans live only at
  repo-root-relative source paths); an ID-alone format would have severed them from
  their plan files. The nina-component session's ` — Outstanding:` suffix keeps live
  obligations visible — a compressed archive that orphans a still-open production
  check is worse than an unscannable file. Each side earned its place.
- **Plan files deliberately NOT deleted** (both precedents): the ledger and tooling
  key off plan paths, and full per-task metadata survives in git history and
  `package_readme.md`. Nothing is unreachable, so nothing needed deleting.
- **Deliberate deviation from the `reorganize-todos` skill, on the decision ladder**
  (the idea's stated Why > skill convention): the skill's 80/20
  Completed-then-Archive rule was not followed — **all 35** completed entries went
  straight to Archive, matching both 2026-09-11 precedents. The skill's
  missing-TaskID cleanup step was moot: all 36 entries had IDs.
- **The A018 active task and its Plan pointer untouched.** It is live work in a live
  plan set; its source plan resolves repo-root-relative, as recorded. Archiving
  sessions compress history, not the work in flight.
- **Both path bases kept as recorded** rather than re-pointing the 10 source-plan
  entries at minted adopted copies: the paths resolve (at the repo root), the
  rewrite's assert layer verified each path at exactly one base, and minting 25
  cosmetic copies to make the file uniform would be motion, not value (YAGNI, see
  Follow-ups).

## Follow-ups & YAGNI notes
- **Three open ops obligations are now visible on archive lines** (A008/A013/A017)
  instead of buried in prose — they remain open and are **unmeasurable from git**
  (manual/production checks leave no commit). A future session closing any of them
  should edit the archive line's suffix, not assume the next archive pass will.
- **The 10 source-plan entries have no adopted copies.** If someone wants uniform
  ID-derived `plan/P1-NIN-A###.md` resolution for all 35, minting adopted copies for
  A007–A012, A016, A017, A030, A031 is possible — but it was judged **YAGNI**: the
  real paths are recorded on the archive lines and verified to resolve, and plan-of
  derives a path for every ID anyway (it just doesn't prove anything by doing so).
- **The `todos.py validate` blind spot persists tooling-wide** (same-file repeats
  collapse as echoes — and, post-archive, validate counts *only live entries*, so an
  all-archived file would report zero entries entirely). The per-entry `uniq -c` gate
  was applied and recorded again; the fix belongs in the skill's source
  (`~/claude-commands`, not the `~/.claude/skills` deploy target), outside this
  session's scope.
- **`plan-of`'s exit 0 is not evidence** — any future session using it as a gate
  should pair it with an on-disk check (this session's own working notes got this
  backwards until measured; the correction is recorded above so the next reader
  doesn't repeat it).

## Appendix
- **Branch / commit:** `token-maxxing-2026-09-12-todos-nina-lib-archive` @ `d81aa7f`
  (1 file, +45/−658). Not merged, not pushed — Worker Mode reports DONE to coordinator
  `tokenmax-orch-2026-09-12`, which owns the merge.
- **Assigned idea's Why (verbatim intent):** same YAGNI/compaction pattern as
  yesterday's root and nina-component todos archival sessions, applied to the one
  ledger still bloated (703 lines vs siblings of 53–157).
- **Verification battery, as run and as re-confirmed while writing this doc:**
  - `wc -l lib/nina/.workflows/todos.md` → 90 (pre-image via
    `git show d81aa7f^:…` → 703).
  - `grep -c '\[x\]'` → 0; `grep -c '\[ \]'` → 1 (exactly the live A018).
  - `grep -n '^## '` → exactly Quick Stats / Active Tasks / Completed Tasks / Archive.
  - Archive lines: 35; `grep -oE '^- P[0-4]-NIN-A[0-9]{3}' | sort | uniq -c` → every
    ID exactly once, zero duplicates.
  - All 35 bracketed plan paths resolve on disk (0 missing) — 25 at the
    `lib/nina/`-relative base, 10 at the repo-root-relative base; the 10 source-plan
    adopted-copy paths (`lib/nina/.workflows/plan/P1-NIN-A007.md` etc.) never
    existed, at HEAD either.
  - Active Tasks section: `diff` of the pre-image slice vs the post-image slice →
    IDENTICAL.
  - `python3 ~/.claude/skills/task/todos.py --root lib/nina validate` → exit 0, "1
    live entries (1 incl. echoes), every TaskID canonical and unique" (counts live
    entries only — see the tooling finding).
  - `npx prettier --check lib/nina/.workflows/todos.md` → clean (run inside the repo,
    per the memory rule — from /tmp it false-flags with its own 80-col default).
- **Count imprecision worth remembering:** the session's working notes and this
  doc's early drafts carried "704-line ledger" from the inventory; every git measure
  of the pre-image says **703** (`git show … | wc -l`, python `readlines()`, and the
  commit's own 45+658 changed-line total). The idea text's "703 lines" was right;
  the doc uses the git-verified number. (Same genre as 2026-09-11's five-vs-six
  note: when a count matters, measure the committed blob, not the session's prose.)
- **Commands run (representative):**
  ```bash
  grep -oE '^- \[.\] \*\*P[0-4]-NIN-A[0-9]{3}\*\*' lib/nina/.workflows/todos.md | sort | uniq -c
  python3 ~/.claude/skills/task/todos.py --root lib/nina validate
  python3 ~/.claude/skills/task/todos.py plan-of P1-NIN-A007        # exit 0 — but a DERIVER, see above
  diff <(git show d81aa7f^:lib/nina/.workflows/todos.md | sed -n '/^## Active Tasks/,/^## Completed Tasks/p') \
       <(sed -n '/^## Active Tasks/,/^## Completed Tasks/p' lib/nina/.workflows/todos.md)
  npx prettier --check lib/nina/.workflows/todos.md
  git add lib/nina/.workflows/todos.md && git commit -m "docs(nina): archive all 35 completed tasks in lib/nina/.workflows/todos.md" -- lib/nina/.workflows/todos.md
  ```
- **Files touched:** `lib/nina/.workflows/todos.md` only.
- **References:** `2026-09-11-todos-root-archive.md` and
  `2026-09-11-todos-nina-archive.md` (the two format donors and the first two thirds
  of the trilogy); the `reorganize-todos` skill (followed in shape, deviated from on
  the 80/20 rule by decision ladder); memory notes *swarm find keys on the SOURCE
  plan path* (the two-base Plan-pointer quirk) and *todos.py validate is blind to
  same-file dup IDs* (the uniq gate), both re-confirmed live this session.
