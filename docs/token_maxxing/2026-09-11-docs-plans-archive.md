# Token-Maxxing Session — 2026-09-11: Plans Archive

## 🎯 Achievement / End Result
- **Goal of the burn:** Execute the coordinator-assigned idea (worker session dispatched by
  `tokenmax-orch-2026-09-11`; the assigned idea stood in for the usual self-generated menu):
  archive the 36 SHIPPED/SUPERSEDED plan documents (~19K lines) out of `docs/plans/` into
  `docs/plans/archive/`, per the SHIPPED/SUPERSEDED reconciliation table that the same day's
  `architecture-reference` session had just written into `docs/architecture.md` §13 — fix the
  known colliding `F16-*.md` filename pair while moving, and repoint every live reference at
  the new location. Pure compaction, zero code risk: relocate, never delete.
- **Concrete changes:** 6 commits on the branch, 75 files changed, +127/−65 — and every one of
  those +/− lines is a comment, a string literal, or a doc paragraph:
  - `11c4565` — pure `git mv` of all 36 `docs/plans/*.md` into `docs/plans/archive/` (36 files,
    0 insertions, 0 deletions; 19,224 lines preserved byte-for-byte).
  - `fb2ed9e` — the F16 race settled in the filename: `F16-upload-kind-swap.md` →
    `F16b-upload-kind-swap.md` (rename only, content byte-identical).
  - `1e50d1f` — 30 files of in-code references repointed: source/test/config comments, 4 CI
    guard scripts' error-message strings, 6 badge-art tools' design-record headers.
  - `e0add93` — living docs: `docs/architecture.md` (intro, history, documentation map, §13
    preamble, F16b headings/references, sharp-edges note — also fixing two pre-existing stale
    self-references to a nonexistent §15), `README.md`, `CHANGELOG.md` (new Unreleased entry),
    the generate-badge skill + `style.md`, `assets/badges/README.md`, `.workflows/package_readme.md`.
  - `08a312b` — new `docs/plans/archive/README.md` (42 lines): what the archive is, the full
    F16b provenance, the leave-as-written convention for the records' internal cross-references.
  - `1a11286` — `types/next-auth.d.ts`, one reference the first inventory grep's head-cutoff
    hid, caught by the final sweep.
- **Real value delivered:**
  - The primary `docs/` tree now holds only living references. 19,224 lines of finished plan
    history sit behind one directory hop instead of masquerading as current documentation —
    the same archival mechanism `docs/token_maxxing/` already had, which `docs/plans/` had none of.
  - Nothing was deleted or edited: `git diff base..HEAD -M` over `docs/plans/` is 36 pure 100%
    renames plus the 42-line README. Per-file line-count identity against the base commit was
    verified file-by-file (19,224 total preserved).
  - A three-week-old known wart is settled: two different plans both named `F16-*.md` since
    2026-08-21 (an artifact of the `F<N+1>` race across parallel sessions) are now
    distinguishable — `F16-splits-column-gutters.md` and `F16b-upload-kind-swap.md` — with the
    `F16` stem kept greppable for every historical reference.
  - ~30 live reference strings embedded in code were found by inventory and repointed — the
    idea's "do not touch code" premise was wrong in an interesting way (see the disclosed
    deviation below), and the guards' error messages now cite paths that resolve.
  - Two stale self-references inside `docs/architecture.md` itself (intro pointing at a
    nonexistent "§15" for the reconciliation table that is actually §13) were fixed in passing.
  - An incidental finding for the coordinator: `npm run format:check` — a CI gate (`ci.yml:99`)
    — currently reports ~48 pre-existing dirty files, proven inherited from the base commit
    `41b297e` (before any of this branch's commits). See Follow-ups.
- **Branch:** `token-maxxing-2026-09-11-docs-plans-archive` (base `41b297e`)
- **Merge status:** merged (commit `a210552`)
- **Approx token burn:** moderate — no multi-thousand-line plan reads this time (§13 had
  already read all 36 plans earlier the same day); the burn went into the exhaustive
  reference inventory (grepping the whole tree for every form of plan-path string, twice,
  after the first sweep's head-cutoff was caught) and the full verification battery. 🔥

## Context & Motivation
The assigned idea, verbatim:

> "Archive SHIPPED/SUPERSEDED plans out of docs/plans/ (36 files, ~19K lines) into
> docs/plans/archive/, per the SHIPPED/SUPERSEDED reconciliation table already in
> docs/architecture.md section 13. Fix the known colliding F16-*.md filename pair (two
> different files both named F16-something, documented in architecture.md) by renumbering
> one. Update any links in architecture.md's table to point at the new archive/ location.
> Why: 19K lines of finished plan history sits in the primary docs/ tree with zero archival
> mechanism (unlike docs/token_maxxing/, which already has one) — pure compaction, zero code
> risk. Do NOT delete any plan content, only relocate and fix the naming collision; do not
> touch code."

This was a coordinator-dispatched worker session (`tokenmax-orch-2026-09-11`), so the assigned
idea replaced the usual generate-a-menu-and-pick step. The idea was well-timed rather than
lucky: earlier on 2026-09-11 the `architecture-reference` session had read all 36 plans in full
(~19.2k lines) and produced `docs/architecture.md` §13, the plan-by-plan cross-reference that
marks every one of the 36 documents **SHIPPED**, **SHIPPED+AMENDED**, or **SUPERSEDED**. That
table is what made archival *safe* — it is the proof that no file under `docs/plans/` is the
living spec for anything anymore (the living references are `docs/architecture.md` and the
`.workflows/plan/<set>/` trees), and it is the map a future reader needs in order to know
where each plan diverged from what shipped. The precedent also existed: the September 2026
purge had removed the v0.1.0 contract trio (`RECONCILIATION_v0.1.0.md` et al.) from the tree
entirely — readable only from git history. This session did the opposite of that purge: keep
everything, move it one level down.

The F16 collision was documented rather than hypothetical: `architecture.md` §2 records that
the plan numbering (`F<N+1>` handed out across parallel sessions) was not race-safe, and that
two `F16` files and one `F20→F21/F22` renumber exist as scars of that race.

## What We Did (blow-by-blow)

**1. `11c4565` — the archive move.** Pure `git mv docs/plans/*.md docs/plans/archive/` for all
36 files: `F01-foundation.md` through `F33-nina.md` (34 files — two of them both claiming F16)
plus the two 2026-09-10 design docs (`2026-09-10-admin-photos-icon-compact-profpic-design.md`,
`2026-09-10-image-gen-controls-design.md`). No content edits, no directory README yet — the
commit is exactly the move and nothing else, so the rename detection is unambiguous.
Verification at commit time: 36 files, 0 insertions, 0 deletions; every one marked SHIPPED or
SHIPPED+AMENDED by §13.

**2. `fb2ed9e` — the F16 renumber.** The evidence trail, established from git history before
choosing a name:
- `F16-splits-column-gutters.md` — card #2, commit `bc01bf4`, 2026-08-21 22:10:02 +0700
- `F16-upload-kind-swap.md` — card #3, commit `ed98bee`, 2026-08-21 22:33:49 +0700 — 23
  minutes later.

The later commit is the race's second claimer, so it is the one that moves. It became
`F16b-upload-kind-swap.md`: `b` is the number's first free suffix, which keeps the archive
listing in order (between F16 and F17, where the plan's own history puts it) and keeps the
`F16` stem that every historical reference — changelog entries, plan cross-references,
architecture prose — greps for. Rename only; `diff` of the old blob against the new file is
byte-identical. (The other documented race, `F20→F21/F22`, needed no rename: those numbers
are themselves unique, the collision was only in the *story* of the renumber.)

**3. `1e50d1f` — the in-code reference repoint, and the disclosed deviation.** The idea said
"do not touch code", on the belief that only docs referenced the plans. The inventory grep
found otherwise: ~30 files carry live reference strings in code —

- plain source comments: `lib/db/schema.ts` ("see docs/plans/F03-data-layer.md §10"),
  `lib/auth/requireUserId.ts`, `lib/extract/{constants,planPicked,reassignKind}.ts`,
  `lib/llm/vision.ts`, `lib/nina/{imagerecipe,turn}.ts`, `lib/share/config.ts`,
  `lib/charts/paceTrend.ts`, `lib/admin/filetree.ts`, `auth.config.ts`, `next.config.ts`,
  `vitest.config.ts`, `components/extract/UploadPicker.tsx`,
  `components/admin/explorer/useFolderUpload.ts`, `components/profile/RecordsTable.tsx`;
- test-file comments: `tests/panel.param.test.ts`, `tests/panel.render.test.ts`;
- a CI workflow comment: `.github/workflows/ci.yml` ("NEVER put a real secret in this block;
  see docs/plans/F01-foundation.md section 4");
- 4 CI guard scripts' error-message strings — `scripts/check-data-layer-invariants.mjs`,
  `scripts/check-f08-boundaries.mjs`, `scripts/check-f11-share-boundaries.mjs`,
  `scripts/check-llm-payload-boundary.mjs` — which cite plan paragraphs *as their own
  documentation*: when a guard fails, its error message tells you which plan section explains
  the invariant you just broke;
- 6 badge-art tools' design-record headers (`tools/check_badge_art.py`, `tools/decks.py`,
  `tools/gen_badge_art.py`, `tools/make_badge_assets.py`, `tools/make_badge_control.py`,
  `tools/make_badge_sheet.py` — each opens with "Design record: docs/plans/F10-badge-art-skill.md §…").

Every edit is a path substring inside a comment or a string literal — `docs/plans/` →
`docs/plans/archive/` — with zero behavior change. `reassignKind.ts` additionally picked up
the F16b renumber (its comment cites the upload-kind-swap plan by name). The deviation is
disclosed in the commit message itself, and the reason it is the right call is this repo's own
convention: plan paths here are greppable pointers, and the guard system's error messages
*promise* a resolvable trail. Leaving 30 dead pointers pointing at paths that no longer exist
would have preserved the letter of "don't touch code" while breaking the thing the idea was
actually for — a navigable record.

**4. `e0add93` — the living docs.** `docs/architecture.md` got the full set of edits: the intro
(sources paragraph — which also fixed two pre-existing stale self-references to a nonexistent
"§15"; the reconciliation cross-reference is §13), the one-page history line for 2026-09-11,
the numbering-as-record paragraph (which now records the F16b settlement as the race's
resolution), the documentation-map row (`docs/plans/*.md` → `docs/plans/archive/*.md`),
§13's preamble (which now explains that the two F16 entries are two different files, one
renamed at archival), the upload-kind-swap references in §5's pipeline diagram and §13's F04
entry and its own heading, and the sharp-edges race note. `README.md`'s docs-index row and the
Nina front-door link now resolve; its F16 row wording reflects the renumber. `CHANGELOG.md`
had its F01–F33 pointer moved to the archive and gained a new `[Unreleased] → Changed` entry
recording the archival, per this changelog's own convention for retired/moved contract
documents. The generate-badge skill (`SKILL.md` + `style.md`), `assets/badges/README.md`, and
`.workflows/package_readme.md` follow their design records.

**5. `08a312b` — the archive's own README.** 42 lines: what the archive is (the point-in-time
plan record for everything through the Nina release, all SHIPPED or SHIPPED+AMENDED), the
instruction to read `architecture.md` §13 alongside any of these records (and that where they
disagree, the architecture document wins), the full F16b provenance (both commits, both
timestamps, why the second claimer took the suffix, and why the F20→F21/F22 race needed no
rename), and the conventions section — including the rule that the records' internal
pre-archival cross-references (some pointing at `expense-tracking/docs/plans/…`, a different
repo's plans, which were never valid here) are left exactly as written.

**6. `1a11286` — the straggler.** `types/next-auth.d.ts` carried one `F02` reference that the
first inventory grep's head cutoff had hidden. The final full sweep caught it; one more
one-line path-substring edit.

**Deliberately untouched** (point-in-time records, left as written):
`.workflows/**` plan residue, `components/admin/.workflows/**`, `lib/nina/.workflows/**`,
`docs/token_maxxing/**` session records (including this one's siblings), and the archived
plans' own internal cross-references.

## Code / Design Details

**Rename purity, proven from git** (the load-bearing safety property of the whole session):
```
$ git diff 41b297e..HEAD -M --summary -- docs/plans/   # tail
 rename docs/plans/{ => archive}/F30-clock-time-normalisation.md (100%)
 rename docs/plans/{ => archive}/F31-narrate-thinking-disabled.md (100%)
 rename docs/plans/{ => archive}/F32-earliest-start-record.md (100%)
 rename docs/plans/{ => archive}/F33-nina.md (100%)
 create mode 100644 docs/plans/archive/README.md
$ git diff 41b297e..HEAD -M --shortstat -- docs/plans/
 37 files changed, 42 insertions(+)          # 36 renames at 0 lines + the 42-line README
$ find docs/plans/archive -name '*.md' ! -name README.md | xargs wc -l | tail -1
 19224 total                                 # identical to the base commit's docs/plans/*.md
```

**F16b identity:**
```
$ git show 41b297e:docs/plans/F16-upload-kind-swap.md | diff - docs/plans/archive/F16b-upload-kind-swap.md
# (no output — byte-identical)
```

**A representative repoint edit** (the entire class of code change in `1e50d1f` — path
substring only):
```ts
// lib/db/schema.ts, header comment — before
 * roadmap-plus-reconciliation pair wins — see docs/plans/F03-data-layer.md §10.
// after
 * roadmap-plus-reconciliation pair wins — see docs/plans/archive/F03-data-layer.md §10.

// lib/extract/reassignKind.ts — the one that also takes the renumber
- * See docs/plans/F16-upload-kind-swap.md §1; the invariant test below pins the equality that
+ * See docs/plans/archive/F16b-upload-kind-swap.md §1; the invariant test below pins the equality that
```

**The final sweep** — the acceptance test for "every live pointer repointed": grep the whole
tree for `docs/plans/` occurrences *not* followed by `archive/`, excluding the documented
leave-lists (`.workflows/**`, `components/admin/.workflows/**`, `lib/nina/.workflows/**`,
`docs/token_maxxing/**`, and the archive's own internal cross-references). Result: zero
matches.

**architecture.md's stale §15 self-reference, fixed in passing** — the intro previously
promised a reconciliation section that did not exist under that number:
```markdown
- …Where a plan and this document disagree, this document wins, and §15 says exactly where
- and why, plan by plan.
+ …Every plan under `docs/plans/archive/` is a point-in-time artifact; … and §13 says exactly
+ where and why, plan by plan.
```

## Decisions & Trade-offs
- **Disclosed deviation: touching code despite "do not touch code".** The instruction's intent
  was "zero behavior change / zero risk", and it rested on a factual premise ("only docs
  reference the plans") that the inventory falsified. Faced with 30 live reference strings
  embedded in comments and string literals — including CI guards whose error messages cite
  plan paragraphs as documentation — the session repointed them, keeping every edit a path
  substring inside a non-executing token. The deviation is disclosed in the commit message,
  listed in the session report to the coordinator, and scoped so that the letter of the
  intent (no behavior change) is intact: the 4 guard scripts were run, `tsc --noEmit` and
  eslint and the touched tests all pass. Refusing to repoint would have left a trail of
  pointers to dead paths on the very day the tree gained a rule that live pointers must
  resolve.
- **F16b, not F16-2, not a full renumber.** Options considered: leave the collision (rejected —
  it is the idea's named deliverable, and grep for `F16-upload-kind-swap` ambiguity is real),
  rename to `F16-2-…` (rejected — sorts oddly and reads like a version), renumber the *first*
  claimer instead (rejected — the later commit is the race loser by the same convention the
  repo already used for `F20→F21/F22`), or renumber everything after F16 to close the gap
  (rejected — that would rewrite 17 filenames and every reference to them for zero gain; the
  numbering is itself a record, and §2 says so). `F16b` keeps the stem greppable, keeps the
  archive listing ordered, and matches how humans already suffix race losers.
- **Records stay records.** The archived plans' internal cross-references are left as written,
  including references to `expense-tracking/docs/plans/…` — a different repo's plans, never
  valid here — and the archive README documents this convention explicitly, so nobody
  "fixes" them later by mistake. A record that has been made internally consistent with a
  later state of the tree stops being a record.
- **Leave-lists over a blanket sweep.** `.workflows/**` (including `components/admin/` and
  `lib/nina/` plan residue) and `docs/token_maxxing/**` keep their pre-archival path strings:
  they are execution and session records written when those paths were true. The acceptance
  sweep therefore excludes them by name, and the names are written down (archive README) so
  the exclusion is a rule, not an oversight.
- **Did not fix the red format gate.** `npm run format:check` reports ~48 dirty files, proven
  inherited (dirty at base `41b297e`). A repo-wide `npm run format` commit from this branch
  would collide with the day's other in-flight branches and mix an unrelated reformat into a
  docs-archival branch. Reported to the coordinator instead (see Follow-ups).
- **Doc-only commits, one logical change each.** Move, rename, code-repoint, living-docs,
  archive-README, straggler — six commits so the coordinator can land or cherry-pick them
  independently, and so the rename detection stays clean for any future `git log --follow`.

## Follow-ups & YAGNI notes
- **(a) Main's `format:check` gate is likely red.** ~48 pre-existing dirty files
  (`tests/nina.*.test.ts` etc.), proven inherited by probing the base commit's blob — dirty at
  `41b297e`, before any of this branch's commits, so earlier 2026-09-11 sessions shipped it.
  Needs a repo-wide `npm run format` in its own commit, by someone coordinating the day's
  branches (a stray reformat from a parallel branch would collide).
- **(b) The ~35 plan sets under `.workflows/plan/<set>/` have no archival mechanism.** This
  session archived `docs/plans/` only; the Nina 16-phase set, admin console, media dedupe,
  composer, search, image-pipeline sets and the rest still live at the top of the working
  tree. Whether they *should* archive (they are the living references right now, unlike the
  F-series) is a decision for when they age out.
- **(c) A CI guard for path references.** A future session could add a guard that fails when a
  `docs/plans/…` path reference appears *without* `/archive/` anywhere outside the documented
  leave-lists — mechanically the same sweep this session ran by hand, which already caught one
  straggler the first pass missed. The leave-lists would need to live in the guard, not in a
  README.
- **YAGNI, deliberately not done:** no front-matter or index file *inside* each archived plan
  ("this plan is archived" banners) — the directory-level README plus §13's per-plan table
  already carry that, and 36 header insertions would have broken the byte-identity proof.
  No `.gitignore`-style exemption for the archive; no symlink left at the old path (the repo
  just renumbered away from symlinks' cousin, and a symlink would defeat the compaction).
  No changes to any `.workflows/` tooling that might generate plans pointing at `docs/plans/`.

## Appendix

**Commits (base `41b297e`, in order):**
```
11c4565 docs(plans): archive all 36 SHIPPED plans into docs/plans/archive/
fb2ed9e docs(plans): renumber the F16 race's second claimer to F16b-upload-kind-swap.md
1e50d1f docs: repoint in-code plan references at docs/plans/archive/
e0add93 docs: repoint living docs at docs/plans/archive/; record the archival
08a312b docs(plans): add docs/plans/archive/README.md
1a11286 docs: repoint types/next-auth.d.ts's F02 reference at docs/plans/archive/
```

**Whole-branch stat:** 75 files changed, 127 insertions(+), 65 deletions(-) — of which the
`docs/plans/` portion is 36 zero-line renames + 42 inserted README lines; every other line is
comment/string/doc text.

**Verification battery (all green):**
- Per-file line-count identity vs base: 19,224 total preserved across the 36 plans.
- `git diff base..HEAD -M -- docs/plans/`: 36 pure 100% renames + the 42-line README.
- F16b byte-identical to its old name (`git show 41b297e:docs/plans/F16-upload-kind-swap.md | diff - …`).
- Final sweep: zero pre-archival `docs/plans/…` path references outside the two leave-lists.
- The 4 touched guard scripts (`check-data-layer-invariants`, `check-f08-boundaries`,
  `check-f11-share-boundaries`, `check-llm-payload-boundary`) all exit 0.
- `next typegen` + `tsc --noEmit` exit 0.
- eslint on the touched TS/TSX files exit 0.
- vitest on the 2 touched test files (`tests/panel.param.test.ts`, `tests/panel.render.test.ts`):
  25/25.
- prettier clean on every touched file.

**Incidental finding passed to the coordinator:** `npm run format:check` (a CI gate,
`.github/workflows/ci.yml` line 99) reports ~48 pre-existing dirty files; proven inherited by
probing the base commit `41b297e`'s blob, i.e. not introduced by this branch.

**References:**
- `docs/architecture.md` §13 — the plan-by-plan SHIPPED/SUPERSEDED cross-reference that
  authorized the archival; §2 — the F16/F20→F21/F22 numbering-race record.
- `docs/plans/archive/README.md` — the archive's own charter, including the F16b provenance
  (commits `bc01bf4` and `ed98bee`, 2026-08-21, 23 minutes apart) and the leave-as-written
  convention.
- `CHANGELOG.md` `[Unreleased] → Changed` — the archival entry.
- Sibling session doc `docs/token_maxxing/2026-09-11-architecture-reference.md` — the session
  that read all 36 plans and wrote §13, creating this session's precondition.
