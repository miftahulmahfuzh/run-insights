# Token-Maxxing Session — 2026-09-13: Tools CI Gate (Already Shipped) → SKILL.md Contact-Sheet Reference

## 🎯 Achievement / End Result
- **Goal of the burn:** Assigned verbatim by the coordinator: "Wire
  `tools/make_badge_control.py` and `check_badge_art.py` into an automated CI
  gate, the concrete follow-up named by the completed tools-package-hygiene
  session, updating `tools/package_readme.md`; Why: that control loop already
  caught one silent 3-week-old bug manually and should run automatically."
- **Concrete changes:** Zero lines touched on the assigned CI-gate item — it
  was verified already shipped, twice over, before any code was written.
  Instead, one small, genuinely open, previously-flagged-but-unclaimed
  documentation gap in the same area was closed:
  - `a35148c` — *docs(generate-badge): SKILL.md points at the whole-deck
    contact sheet* (`.claude/skills/generate-badge/SKILL.md`, +4/−1).
- **Real value delivered:**
  - **Prevented a fourth wasted re-assignment/re-execution of already-merged
    work.** Verified at HEAD, before writing any code, that the CI gate this
    session was assigned to build already exists: `.github/workflows/ci.yml`
    has had a `badge-art-controls` job since commit `c14c913` (2026-09-12
    20:56:46 +0700), `package.json` has had the `badges:controls` script
    since the same commit, and `tools/.workflows/package_readme.md` already
    documents it under "Gotchas" with the exact three-week-silent-break
    rationale the assignment's own "Why" repeated back. Re-ran
    `python3 tools/check_badge_controls.py` on this branch: 4/4 controls
    behaved as designed, exit 0.
  - **Traced the root cause of the repeat assignment and recorded it for the
    command maintainer** rather than just shrugging at the collision: the
    `/token-maxxing` recall step reads only the top-5 `docs/token_maxxing/*.md`
    filenames sorted ISO-descending, and on a high-volume day
    ("tools-*" > "badge-*" alphabetically) that window can surface a stale
    Follow-ups list while burying the two docs that actually show the item
    closed. This is now the third time the same idea has been assigned across
    two different coordinator days for this exact structural reason.
  - **Closed one real, previously-deferred, unclaimed doc gap instead of
    burning the session on redundant re-verification alone.** The prior
    sibling session's own Follow-ups section had explicitly flagged
    `.claude/skills/generate-badge/SKILL.md` as never referencing the
    whole-deck contact sheet, and explicitly deferred it as "belongs to the
    skill's owner." This session *was* that skill's owner for this go-round,
    confirmed the gap still stood by grep, checked same-day sibling worktrees
    for collision risk first, then wired one sentence into the step-5
    collision-tally bullet pointing at
    `python3 tools/make_badge_sheet.py --deck <badges|records>` as the
    picture-form equivalent of the tally, naming its gitignored output path.
  - **Verified the doc claim by actually running the tool before
    committing:** `make_badge_sheet.py --deck records` produced
    `assets/records/_candidates/_shelf.png` at 1088×944 (11/11 records), and
    `--selftest` passed 10/10; both generated (gitignored) shelf PNGs were
    deleted before committing since they are build artefacts, not source.
- **Branch:** `token-maxxing-2026-09-13-tools-ci-gate` (worker session slug
  `tools-ci-gate`, of coordinator `tokenmax-orch-2026-09-13`; worktree cut
  from the coordinator's fetched `origin/main` tip, commit `1b70216`).
- **Merge status:** NOT merged at doc time — worker sessions never merge;
  landing belongs to coordinator `tokenmax-orch-2026-09-13`. Verify by git,
  not by this line.
- **Approx token burn:** est. ~0.3–0.5M, verification-dominated — full reads
  of `.github/workflows/ci.yml`, `package.json`,
  `tools/.workflows/package_readme.md`, both sibling 2026-09-12 badge docs
  (`badge-ci-followups.md` at ~390 lines and `badge-pipeline-followups.md`),
  a `git branch --list` + per-worktree `git status --porcelain` collision
  check across today's ~10 sibling workers, and re-running
  `check_badge_controls.py` + `make_badge_sheet.py` for effect-level proof.
  Output side small by design: a single +4/−1 doc edit, this doc.

## Context & Motivation

This was a `--worker` session spawned by the parallel coordinator
`tokenmax-orch-2026-09-13`. Unlike a solo `/token-maxxing` run, there was no
menu-of-ideas step: the idea arrived pre-assigned, quoting the completed
`tools-package-hygiene` session's follow-up list almost verbatim, and citing
the same "caught one silent 3-week-old bug manually" rationale that session
had recorded.

The instruction in this session's own working process — verify a plan's
premise against git before acting on it, never trust an assignment's
framing at face value — applied directly here. Rather than opening
`tools/make_badge_control.py` and `check_badge_art.py` and starting to wire a
CI job, the very first move was to check whether the wiring already existed.

## What We Did (blow-by-blow)

**1. Verified the assignment's premise against the tree, before writing any
code.** Grepped `.github/workflows/ci.yml`, `package.json`, and
`tools/.workflows/package_readme.md` directly:

- `.github/workflows/ci.yml` already carries a `badge-art-controls` job. It
  runs `tools/make_badge_control.py` to draw four synthetic controls (a
  clean patch, a flat patch, an off-centre patch, a bleached patch) and
  `tools/check_badge_controls.py` (which shells out to
  `check_badge_art.py --no-anchor --no-crops`) to assert each control's
  *designed* verdict (`good` / `flat` / `offcentre` / `bleached`). Free,
  offline, Pillow-only, roughly 5 seconds, no `npm ci` needed.
- `package.json` already has the `badges:controls` script
  (`python3 tools/check_badge_controls.py`) that the CI job invokes.
- `tools/.workflows/package_readme.md`'s Gotchas section already states:
  "**The control loop is CI-gated (2026-09-12).**" — the same F15 /
  three-week-silent-break story the assignment's own "Why" line quoted.

**2. Traced the wiring to its origin commit.** `git log` on
`.github/workflows/ci.yml` and `package.json` for the `badge-art-controls`
job landed on `c14c913` — *"ci(badges): gate the control loop — four designed
controls, asserted on every push"* — dated 2026-09-12 20:56:46 +0700, roughly
a day before this session started.

**3. Found the exact prior sessions that had done this work — twice.** A
search of `docs/token_maxxing/` turned up two sibling docs from the SAME day
(2026-09-12), under the SAME coordinator generation
(`tokenmax-orch-2026-09-12`, a run distinct from today's
`tokenmax-orch-2026-09-13`):

- [`2026-09-12-badge-pipeline-followups.md`](./2026-09-12-badge-pipeline-followups.md)
  — the session that actually landed `c14c913` (the CI gate itself) plus
  `6795893` (resolving `RECORD_ART_SMALL_SIZE`).
- [`2026-09-12-badge-ci-followups.md`](./2026-09-12-badge-ci-followups.md) —
  a second sibling of that same 2026-09-12 coordinator run, which had
  *already* hit this exact collision once: it was assigned the same three
  tools-package-hygiene follow-ups, discovered a different sibling
  (`badge-pipeline-followups`) had landed items 1–2 hours earlier, verified
  the landed work at HEAD instead of redoing it, and explicitly recorded the
  lesson: *"a session-doc follow-up list can go stale within hours, and a git
  check of 'is this already in my base' should precede any re-execution."*

This session is the second re-run of a bug that a sibling had already
diagnosed and named the day before — now recurring across coordinator runs
on different days, not just within one day's fan-out.

**4. Diagnosed WHY the stale idea kept resurfacing, rather than just noting
the collision.** The recall step of Solo/Coordinator Mode (Step 2) sorts
`docs/token_maxxing/*.md` filenames ISO-descending and reads only the top 5.
On 2026-09-12 there were enough same-date sessions that plain alphabetical
descending order put `2026-09-12-tools-package-hygiene.md` (whose Follow-ups
section — by design, left unedited as history — still names this CI-gate
idea) inside the top-5 window, while `2026-09-12-badge-ci-followups.md` and
`2026-09-12-badge-pipeline-followups.md` — the two docs that prove it is
closed — sorted below the top 5 purely because `"badge-*"` precedes
`"tools-*"` alphabetically, landing them lower in a *descending* alphabetical
sort of same-date names. Net effect: the closing evidence was systematically
less visible to recall than the stale ask. This is now the third assignment
of the identical idea across two different days' coordinator runs, for the
same structural cause each time.

**5. Effect-level re-verification, not just doc-trusting.** Ran
`python3 tools/check_badge_controls.py` on this branch directly: 4/4
controls behaved as designed, exit 0. This is the concrete "run the thing,
don't just read about it" check before declining to redo work.

**6. Decision: do not redo already-shipped work.** Per the repo's own
established precedent (`badge-ci-followups` handled an identical partial
collision the same way), nothing was re-implemented for the CI-gate item, and
`tools/package_readme.md` was left untouched — it was already accurate and
current for this fact, so a "refresh" would have been pure churn on a green
file.

**7. Pivoted to the one real, still-open, scoped follow-up in the same
area.** `badge-ci-followups.md`'s own Follow-ups section had flagged: "SKILL.md
reference to the sheet — open, cross-package. The generate-badge skill's
SKILL.md does NOT currently reference the contact sheet... Wiring that
reference belongs to the skill's owner." This session sits squarely in that
skill's area, so:

- Grepped `.claude/skills/generate-badge/SKILL.md` for `make_badge_sheet.py`
  and "contact sheet" — zero hits, confirming the gap still stood.
- Before touching anything, checked today's sibling workers for collision
  risk: `git branch --list 'token-maxxing-2026-09-13-*'` (today's coordinator,
  `tokenmax-orch-2026-09-13`, had spawned roughly 10 workers) plus
  `git status --porcelain` on the one plausibly adjacent sibling worktree,
  `token-maxxing-2026-09-13-badges-records-cleanup`. Its live uncommitted
  work touched only `lib/badges/.workflows/package_readme.md` and
  `lib/badges/rules.ts` — badge scoring/rules code, nothing under `tools/`
  or `.claude/skills/` — so no collision.
- Edited `.claude/skills/generate-badge/SKILL.md`'s step-5 "LOOK AT IT"
  collision-tally bullet — the one that already instructs a regenerator to
  "keep a running tally across the set" and consult style.md's collision
  audit before generating further — adding one sentence pointing at
  `python3 tools/make_badge_sheet.py --deck <badges|records>` as the
  picture-form equivalent of that mental tally, and naming its output path
  (`_candidates/_shelf.png`, gitignored).

**8. Verified the doc claim by running the tool, not just citing its prior
existence.** `python3 tools/make_badge_sheet.py --deck records` produced
`assets/records/_candidates/_shelf.png` at 1088×944 (11/11 records drawn).
`python3 tools/make_badge_sheet.py --selftest` passed 10/10. Both generated
shelf PNGs (gitignored build artefacts) were deleted before committing.

**9. Style gate.** `npx prettier --check .claude/skills/generate-badge/SKILL.md`
— clean.

**10. Committed.** `a35148c` — *docs(generate-badge): SKILL.md points at the
whole-deck contact sheet* — on branch `token-maxxing-2026-09-13-tools-ci-gate`.

## Code / Design Details

### What actually changed

One sentence added to the existing step-5 "LOOK AT IT" collision-tally
bullet in `.claude/skills/generate-badge/SKILL.md`, naming the whole-deck
contact-sheet tool as the picture-form equivalent of the mental tally a
regenerator is already asked to keep:

```
python3 tools/make_badge_sheet.py --deck <badges|records>
```
producing the deck's gitignored `_candidates/_shelf.png`.

No other file in the diff. `tools/make_badge_control.py`,
`check_badge_art.py`, `.github/workflows/ci.yml`, `package.json`, and
`tools/package_readme.md` were all read and verified, but none were edited —
they were already correct.

### The CI gate that was verified, not built

```
.github/workflows/ci.yml  →  badge-art-controls job
  runs: tools/make_badge_control.py   (draws 4 synthetic controls)
        tools/check_badge_controls.py (asserts each's designed verdict,
                                        shells to check_badge_art.py
                                        --no-anchor --no-crops)
package.json → "badges:controls": "python3 tools/check_badge_controls.py"
```

Landed by commit `c14c913` (2026-09-12 20:56:46 +0700), a full session prior
to this one. `tools/.workflows/package_readme.md`'s Gotchas section already
documents it in full, using the same three-week-silent-break framing this
session's assignment cited independently.

## Decisions & Trade-offs

**Do not touch already-shipped, already-documented work.** The temptation
with a pre-scoped assignment is to treat the ask as ground truth and start
implementing. This session instead treated "wire X into CI" as a claim to be
checked against `git log` and the live tree first — the same discipline the
`badge-ci-followups` sibling had already demonstrated and explicitly
recommended as a lesson. Re-verifying and declining to redo saved the
session's budget for something that was actually open.

**Pivot to a real, adjacent, previously-deferred item rather than end the
session with a no-op.** The sibling doc had explicitly named the SKILL.md gap
and explicitly deferred it to "the skill's owner." Rather than treating "not
my assigned item" as a reason to skip it, this session recognized it was, in
effect, that owner for this pass, and closed it — a small, real, honestly
scoped deliverable instead of a diff-free session.

**Record the recall-window root cause as a finding, not an actioned fix.**
The `/token-maxxing` command's Step 2 recall logic lives outside this repo
(in the skill definition), so this session could not fix it directly. It is
recorded here, verbatim and specific enough (top-5, ISO-descending filename
sort, alphabetical burial of `badge-*` under `tools-*`) that whoever next
touches the skill can act on it without re-deriving the diagnosis.

**No `/analyze` escalation.** The surviving diff is a single 4-line addition.
The bulk of the session's real effort was investigation and verification, not
code — a large session by token burn, small by diff, and this doc says so
plainly rather than padding the Concrete Changes section to look bigger than
it is.

## Follow-ups & YAGNI notes

- **The `/token-maxxing` recall-window bug — recorded, not fixed here.** The
  Solo/Coordinator Mode Step 2 recall reads only the top-5
  `docs/token_maxxing/*.md` filenames by ISO-descending sort. On a
  high-session-volume day, alphabetically-later same-date filenames can drop
  out of that window even when they are the most relevant docs for judging
  whether a follow-up is still open. This exact idea (badge control-loop CI
  gate) has now been assigned three times across two different coordinator
  days (2026-09-12 twice, 2026-09-13 once here) for this one structural
  reason. A fix belongs in the `/token-maxxing` skill definition itself
  (e.g., read a larger window, or rank by a signal other than filename
  sort) — out of scope for a worker session to change, but worth a
  command-maintainer's attention given the repeat count.
- **`RECORD_ART_SMALL_SIZE` and the records contact sheet** — both already
  resolved by `badge-pipeline-followups` and `badge-ci-followups`
  respectively; nothing further needed here.
- **No further SKILL.md gaps found** in this pass — the search was scoped to
  the one gap the sibling doc had explicitly named; a broader SKILL.md audit
  was out of scope for this session.

## Appendix

### Commands run (verification)

```
python3 tools/check_badge_controls.py
  → 4/4 controls behaved as designed, exit 0

grep -n "badge-art-controls" .github/workflows/ci.yml
grep -n "badges:controls" package.json
grep -n "control loop" tools/.workflows/package_readme.md

git log --oneline --all -- .github/workflows/ci.yml | grep -i badge
  → c14c913 ci(badges): gate the control loop — four designed controls,
    asserted on every push

grep -rn "make_badge_sheet\|contact sheet" .claude/skills/generate-badge/SKILL.md
  → (no matches, before this session's edit)

git branch --list 'token-maxxing-2026-09-13-*'
git -C <sibling-worktree-path> status --porcelain
  → token-maxxing-2026-09-13-badges-records-cleanup touched only
    lib/badges/.workflows/package_readme.md and lib/badges/rules.ts;
    no collision with tools/ or .claude/skills/

python3 tools/make_badge_sheet.py --deck records
  → assets/records/_candidates/_shelf.png, 1088×944, 11/11 records

python3 tools/make_badge_sheet.py --selftest
  → 10/10 ok, exit 0

npx prettier --check .claude/skills/generate-badge/SKILL.md
  → clean

rm assets/badges/_candidates/_shelf.png assets/records/_candidates/_shelf.png
  → build artefacts deleted before commit (gitignored, not source)
```

### Diff stats

```
a35148c — docs(generate-badge): SKILL.md points at the whole-deck contact sheet
  .claude/skills/generate-badge/SKILL.md | 5 +++--
  1 file changed, 4 insertions(+), 1 deletion(-)
```

### Commits

- `a35148c` — docs(generate-badge): SKILL.md points at the whole-deck contact
  sheet

### References

- [2026-09-12-tools-package-hygiene.md](./2026-09-12-tools-package-hygiene.md)
  — origin of the CI-gate follow-up idea, whose unedited Follow-ups section
  keeps surfacing it to recall.
- [2026-09-12-badge-pipeline-followups.md](./2026-09-12-badge-pipeline-followups.md)
  — the session that actually landed the CI gate (`c14c913`) and the
  `RECORD_ART_SMALL_SIZE` resolution (`6795893`).
- [2026-09-12-badge-ci-followups.md](./2026-09-12-badge-ci-followups.md) —
  the sibling that hit this exact collision one day earlier, verified the
  landed work instead of redoing it, first recorded the "git-check before
  re-execution" lesson, and flagged the SKILL.md gap this session closed.
- `.github/workflows/ci.yml` — the `badge-art-controls` job, verified not
  edited.
- `tools/.workflows/package_readme.md` — Gotchas section already documents
  the CI gate; verified not edited.
- `.claude/skills/generate-badge/SKILL.md` — the one file this session
  edited.
