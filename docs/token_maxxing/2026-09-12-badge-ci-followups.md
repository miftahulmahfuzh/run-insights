# Token-Maxxing Session — 2026-09-12: Badge CI Follow-ups

## 🎯 Achievement / End Result
- **Goal of the burn:** Close the three explicit open follow-ups that
  [tools-package-hygiene](./2026-09-12-tools-package-hygiene.md) had left on
  the record, as assigned verbatim by the coordinator: (1) wire
  `make_badge_control.py` + `check_badge_art.py --no-anchor` into CI — free,
  offline, seconds-fast, and the gate whose absence let a real silent break
  stand for three weeks last time; (2) decide whether `RECORD_ART_SMALL_SIZE`
  should stop being emitted by `make_badge_assets.py` or be consumed by a
  records shelf; (3) add a `--deck` flag to `make_badge_sheet.py` if a records
  contact sheet turns out to be wanted. All three were identified as real,
  scoped, but unactioned follow-ups from a completed session — this closes
  them out.
- **Concrete changes:** Two commits on
  `token-maxxing-2026-09-12-badge-ci-followups`, plus this doc:
  - `c8ea202` — *tools(badges): the sheet reads the deck table — --deck
    records, --selftest* (`tools/make_badge_sheet.py`, +138/−46).
  - `cd67b37` — *docs(tools): the sheet's known limit is resolved — deck
    table, --deck, --selftest* (`tools/.workflows/package_readme.md`,
    +25/−14).
  - Items 1 and 2 of the assignment became a **verification job, not a redo**
    (see the pivotal discovery below): both had already been done and merged
    by a sibling session of the same coordinator, and this session verified
    the landed work at HEAD rather than re-executing it.
- **Real value delivered:**
  - **A records contact sheet now exists, and the YAGNI deferral it overrides
    is recorded with the evidence that flipped it.** `make_badge_sheet.py
    --deck records` draws all 11 record patches onto one navy bolt
    (1088×944). The sheet's own docstring had justified the badge sheet by
    "the deck was generated in one concentrated phase"; F32 (the eleventh
    record, `earliest_start`, landed in its own session) broke that premise —
    the records deck now grows across sessions, which is the exact
    daily-words growth pattern the sheet was built for.
  - **The sheet reads the deck table instead of hardcoding paths.** It was
    the LAST tool in `tools/` still answering "where do this deck's catalog
    and masters live" from its own constants — the exact duplication F25
    built `tools/decks.py` to end. It now takes `--deck` via the shared
    `add_deck_argument` and resolves per-deck catalog array, key pattern,
    masters dir, and default `--out` from the table.
  - **A `--selftest` guards the sheet's inputs, including the two drifts
    nothing else guards:** a catalog key with no promoted master (the sheet
    would draw it as a silent gap) and a promoted master whose catalog row is
    gone (never drawn at all). 10/10 assertions green, exit 0.
  - **Default behavior proven byte-identical:** the no-flag run draws the
    same 22/22 badges sheet at the same path, at dimensions identical to
    pre-change (1088×1760) — the refactor changed where paths come from, not
    what the tool produces for the badge deck.
  - **Two of the three assigned items were confirmed already-landed by a
    sibling, saving the session from redoing merged work** — and the
    coordination lesson (git-verify an assignment's premise before
    re-executing) is recorded for the next fan-out wave.
- **Branch:** `token-maxxing-2026-09-12-badge-ci-followups` (worker session
  slug `badge-ci-followups`, named `tokenmax-badge-ci-followups`, of
  coordinator `tokenmax-orch-2026-09-12`; worktree cut from the origin/main
  tip `c42c67a`, branch 0/0 vs origin/main at start).
- **Merge status:** NOT merged at doc time — worker sessions never merge;
  landing belongs to coordinator `tokenmax-orch-2026-09-12`. The landing set
  is commits `c8ea202` + `cd67b37` (plus the doc commit this workflow
  creates) on branch `token-maxxing-2026-09-12-badge-ci-followups`; verify by
  git, not by this line.
- **Approx token burn:** est. ~0.4–0.7M, input-dominated — full reads of both
  source session docs (the sibling's 393-line doc is what revealed the double
  assignment), full reads of `make_badge_sheet.py` + `decks.py` +
  `package_readme` + both catalogs, a pixel-measurement detour (old-sheet
  probe via `git show` + PIL sampling), four-direction green verification,
  and a visual read of the drawn records sheet. Output side small by design:
  +138/−46 Python, +25/−14 map, this doc.

## Context & Motivation

This was a `--worker` session spawned by the parallel coordinator
`tokenmax-orch-2026-09-12`. The assignment arrived pre-scoped, quoting the
tools-audit session's follow-up list:

> Action three explicit open follow-ups from the tools-package-hygiene
> session: (1) wire make_badge_control.py + check_badge_art.py --no-anchor
> into CI (it is free/offline/seconds-fast and would have caught a real
> 3-week silent break last time), (2) decide whether RECORD_ART_SMALL_SIZE
> should stop being emitted by make_badge_assets.py or be consumed by a
> records shelf, (3) add a --deck flag to make_badge_sheet.py if a records
> contact sheet turns out to be wanted. Why: all three were identified as
> real, scoped, but unactioned follow-ups from a completed session — this
> closes them out.

The fit looked clean in the way same-day follow-up waves usually do: the
tools audit (F10's numbering) had found the control loop silently broken and
re-cut it, deferred the CI gate as a CI-contract decision, recorded the
`RECORD_ART_SMALL_SIZE` emission as an open question, and left the records
sheet as a want-more-evidence YAGNI. What the assignment could not know —
because the tools doc's follow-up list had deliberately been left unedited —
was that a sibling session had closed items 1 and 2 hours earlier. Resolving
that collision, and then building item 3 properly, was the session.

## What We Did (blow-by-blow)

**1. The pivotal discovery: two of three items were already landed.** Before
touching anything, the session read the sibling session doc
[2026-09-12-badge-pipeline-followups.md](./2026-09-12-badge-pipeline-followups.md)
— and its 393 lines are exactly the two first assignment items, done. The
sibling session `tokenmax-badge-pipeline-followups` (same coordinator) had
committed `c14c913` (*ci(badges): gate the control loop*) and `6795893`
(*tools(badges): resolve RECORD_ART_SMALL_SIZE*). Its doc had been written
while its branch was NOT yet merged — but git proves both commits are in this
worker's ancestry (the branch sits at the origin/main tip). The coordinator
evidently generated this assignment from the tools doc's follow-up list,
which the sibling had deliberately left unedited ("their follow-up sections
are history"). So the assignment's items 1–2 flipped from re-execution to
verification. The lesson is recorded in this doc's Follow-ups section: under
same-day fan-out, a session-doc follow-up list can go stale within hours,
and a git check of "is this already in my base" should precede any
re-execution.

**2. Items 1–2 verified at HEAD, effect-level.** Not "the sibling said so" —
the landed work was re-run and re-inspected on this branch:

- `python3 tools/check_badge_controls.py` → 4/4 controls behaved as designed,
  exit 0.
- `.github/workflows/ci.yml` carries the `badge-art-controls` job (line 122).
- `package.json` carries `badges:controls`.
- `lib/records/record-art.ts` carries the KEEP docblock on
  `RECORD_ART_SMALL_SIZE`.
- `tools/make_badge_assets.py` has the deck-aware `sizes_doc`.

All five green. Items 1–2: closed by the sibling, verified here, not
re-done.

**3. Item 3's decision: the records contact sheet IS wanted.** The recorded
YAGNI deferral said "when a records contact sheet is actually wanted." Two
pieces of evidence flipped it:

- The sheet's own docstring had justified the badge sheet by "the deck was
  generated in one concentrated phase." F32 (commits `01c8bbc` + `f4fc76c`,
  the eleventh record `earliest_start`) broke that premise: the records deck
  now grows across sessions, which is the exact daily-words growth pattern
  `make_badge_sheet.py` was built for. A contact sheet stops being a luxury
  the moment a deck stops being reviewable one commit at a time.
- Independently, the sheet was the LAST tool in `tools/` hardcoding its
  catalog/masters paths instead of reading `tools/decks.py`. F25 built that
  table precisely so four tools would not each answer "where do this deck's
  masters live" from their own constants. Bringing the sheet onto the table
  closes that arc regardless of the records question.

**4. TDD, package idioms: two REDs watched first.** Before any code:
`--deck records` and `--selftest` both exited 2 with "unrecognized
arguments". The failure modes the new code must fix were observed, not
assumed.

**5. GREEN: the sheet reads the table.** `tools/make_badge_sheet.py` now
takes `--deck` via `decks.py`'s shared `add_deck_argument` (import pattern
matches the sibling tools: `sys.path.insert` then
`from decks import DECKS, DEFAULT_DECK, add_deck_argument, deck_for  # noqa:
E402`). From the table it resolves, per deck: the catalog array to draw, the
key pattern to match masters against, the masters dir to read, and the
default `--out` (the deck's own gitignored `_candidates/_shelf.png`). The
default deck is unchanged, so the no-flag run is the badge sheet it always
was.

**6. `--selftest` (decks.py's idiom) asserts the sheet's INPUTS.** Per deck:
array extraction works, keys are unique, and the two drifts nothing else
guards — a catalog key with no promoted master (the sheet would draw it as a
silent gap), and a promoted master whose catalog row is gone (never drawn at
all). These are completeness checks on the drawing inputs, not pixel checks
on the output.

**7. The design boundary, recorded: no CI gate for the sheet.** The grader
has its own CI gate (`check_badge_controls.py`, landed by the sibling). A
review artefact deliberately gets none — a sheet has no designed failure to
assert, only inputs that must be complete, and those inputs are what
`--selftest` covers. Gating a contact sheet in CI would assert that pictures
were drawn, which CI cannot meaningfully grade.

**8. Default-identical proof.** The no-flag run draws the same 22/22 badges
sheet at the same path; an unknown deck is rejected cleanly with the valid
choices. The refactor is invisible to the badge-deck caller.

**9. Effect-level verification, then an actual look.** `--selftest` 10/10
ok, exit 0. `--deck records` draws 11/11 at 1088×944 (panel-band math: 2
rows of 6). Default draws 22/22 at 1088×1760 — dimensions identical to
pre-change. And the records sheet PNG was actually READ, not just measured:
11 pentagon patches on one navy bolt — kite, candle, swallow, hare, bow,
shuttlecock, cable car, two tops, bell, moka pot.

**10. The eyeball-vs-measure detour (two findings, one action).** The empty
12th cell of the light panel band LOOKED dark in a thumbnail — pixel-measured
(201,233,251), exactly `PAPER_LIGHT`. Not a bug; the eye was lied to by
scale. The black right-margin of the 40px bands measured (0,0,0) on the OLD
badges sheet too (probed via `git show` of the pre-change output and PIL
sampling) — a pre-existing canvas fill: `Image.new` defaults to black where
narrower bands are pasted onto the widest canvas. Recorded as an observation,
deliberately NOT fixed — cosmetic churn on a green diff, and reviewers have
seen it since F10 (see Decisions).

**11. The map updated.** `cd67b37` rewrites
`tools/.workflows/package_readme.md`'s sheet section: the known-limit line
(a record of the hardcoding) is gone; `--deck`/`--selftest` are documented
with the not-CI-gated rationale; the verification stamp now covers both
decks' sheets plus the selftest; the closing Notes tally flips — of the
tools-audit session's four hygiene findings, only `extend_badge_art.py`'s
hardcoded paths still stand, by design (records are native 4:3, no widening
pass needed).

**12. Full gates at the end.** See Appendix — all green, including the
sibling's control loop re-run on this branch (4/4), so the branch carries
forward a verified-inheritance, not an assumed one.

## Code / Design Details

### The import pattern (identical to the sibling tools)

```python
sys.path.insert(0, str(Path(__file__).resolve().parent))
from decks import DECKS, DEFAULT_DECK, add_deck_argument, deck_for  # noqa: E402
```

`tools/decks.py` is the F25 table: one place that knows each deck's catalog
module, key pattern, masters dir, and constants name. `add_deck_argument` is
its shared argparse hookup, so every table-reading tool takes the same flag
with the same choices and the same rejection behavior. The `# noqa: E402` is
the established idiom for the post-`sys.path` import.

### What `--deck` resolves, per deck

| Resolved | Source | Used for |
|---|---|---|
| catalog array | the deck's generated `*_art.ts` constants | the keys to draw |
| key pattern | the deck's row in `DECKS` | matching master filenames |
| masters dir | the deck's row | the PNGs to composite |
| default `--out` | the deck's own `_candidates/` | where the shelf PNG lands (gitignored) |

Nothing about the badge deck moved: `DEFAULT_DECK` still selects it, and the
default `--out` still resolves to the badge sheet's historical path.

### The two input drifts `--selftest` guards

For every deck in the table:

1. **A catalog key with no promoted master.** The sheet draws what exists on
   disk; a key whose master was never promoted (or was deleted) becomes a
   silent gap in the contact sheet — a hole a human only notices by counting
   patches. The selftest counts.
2. **A promoted master with no catalog row.** The inverse drift: art exists
   that the catalog will never show, because the sheet iterates keys, not
   files. The patch is drawn nowhere and nothing complains.

Both are completeness failures, not correctness failures — no drawn pixel is
wrong, some expected pixel is simply absent. That is exactly the class of
drift a selftest over INPUTS can catch and a pixel gate cannot.

### Panel-band math, both decks

```
default (badges):  22/22 patches  → 1088×1760   (dimensions identical to pre-change)
--deck records:    11/11 patches  → 1088×944    (2 rows of 6; 12th cell empty, PAPER_LIGHT)
```

The records band's empty cell measured (201,233,251) = `PAPER_LIGHT` exactly
— it only read "dark" in a scaled-down thumbnail. The black right-margin on
the 40px bands measured (0,0,0) on the old badges sheet as well: a
pre-existing canvas fill (`Image.new` default black where narrower bands are
pasted onto the widest canvas), present since F10, recorded not fixed.

## Decisions & Trade-offs

**Records sheet IS wanted — YAGNI overridden on evidence, and the evidence is
the point.** The deferral was not wrong when written: with the deck generated
in one concentrated phase, a contact sheet solved a problem that did not
exist. F32 changed the facts (eleventh record, own session), so the premise
the YAGNI rested on is gone. The decision is recorded with the flip evidence
so the next reader re-derives the reasoning, not just the conclusion.

**Bring the sheet onto the deck table even if the records answer had been
no.** The hardcoding was the tools audit's last outstanding hygiene finding
for this tool; `--deck` and the table wiring are worth it independently of
whether records ever gets drawn. The two justifications stack, which is why
the commit does both in one move.

**A review artefact gets no CI gate.** `check_badge_controls.py` gates the
grader because the grader HAS designed failures (a control must fail exactly
its designed check). A contact sheet has no designed failure to assert — only
inputs that must be complete, which `--selftest` covers locally. The
boundary is written into the readme so the next "why isn't this in CI"
question is already answered.

**The black canvas margin: observed, not fixed.** It is pre-existing (proven
on the old sheet via `git show` + PIL sampling), cosmetic, invisible at the
sizes the sheet is consumed at, and every reviewer since F10 has seen it.
Fixing it would churn a green diff for zero behavioral value. Recorded in
Follow-ups so it is a decision, not an oversight.

**`extend_badge_art.py` stays hardcoded — by design.** Records are native
4:3, so the widening pass the badge deck needs has nothing to do for records;
there is no second deck for it to serve. The readme's closing tally now says
exactly this, so no future hygiene sweep re-flags it as drift.

**Merge status phrasing that cannot rot — and this time it paid off
directly.** The sibling session's doc said "NOT merged at doc time … verify
by git, not by this line," and that phrasing is precisely what let this
session trust the WORK while knowing the merge had since happened. This doc
uses the same construction: worker sessions never merge; the landing set is
`c8ea202` + `cd67b37` (+ the doc commit); a future reader checks git.

## Follow-ups & YAGNI notes

- **SKILL.md reference to the sheet — open, cross-package.** The
  `generate-badge` skill's SKILL.md does NOT currently reference the contact
  sheet (verified by grep in `.claude/skills/generate-badge/`). Wiring that
  reference belongs to the skill's owner; a regenerator who could see the
  whole deck at once would iterate differently.
- **`extend_badge_art.py` badge-deck paths hardcoded — standing, by design.**
  While records are native 4:3 there is no widening pass to parameterize. The
  readme's Notes say so; revisit only if a second non-badge deck ever needs
  widening.
- **The sheet's pre-existing black canvas margin.** The unpainted strip right
  of the narrower 40px bands (`Image.new` default black on the widest canvas,
  present since F10). Cosmetic; recorded here; deliberately not fixed in this
  green diff.
- **Coordination-process note worth its own line: idea lists generated from
  session-doc follow-up sections can double-assign work a sibling already
  landed the same day.** The tools doc's follow-up list was left unedited on
  purpose ("their follow-up sections are history"), which is the right call
  for the doc — and it means the list reads as open work to anyone who does
  not check. A git check of "is this already in my base" should precede
  re-execution; it saved this session from redoing two merged items, and the
  saved budget went into item 3's TDD and verification instead.
- **YAGNI, standing:** the generated manifests
  (`badge-art.ts`/`record-art.ts`) are still off-limits to dead-export sweeps
  (their liveness is typecheck's job; hand-edits are the anti-pattern). The
  sheet reads them through the deck table like every other tool now.

## Appendix

### Gates run at session end (all green, 2026-09-12)

```
python3 -m py_compile tools/*.py            # 10/10 compile
python3 tools/decks.py --selftest           # all green
python3 tools/make_badge_sheet.py --selftest  # 10/10 ok, exit 0
node scripts/check-badge-art.mjs            # green both decks (22 + 11, style v2)
python3 tools/check_badge_controls.py       # 4/4 (sibling's gate, verified on this branch)
npx prettier --check tools/.workflows/package_readme.md  # clean
```

Prettier has no `.py` parser in this repo — Python style is manual, house
~76 columns.

### Effect-level verification

```
make_badge_sheet.py --deck records   # 11/11 at 1088×944 (2 rows of 6); PNG visually read
make_badge_sheet.py                  # 22/22 at 1088×1760 (dimensions identical to pre-change)
make_badge_sheet.py --deck nope      # rejected cleanly, choices listed
```

Pixel measurements: empty 12th records cell = (201,233,251) = `PAPER_LIGHT`;
right-margin black = (0,0,0), confirmed pre-existing on the old badges sheet
via `git show` + PIL sampling.

### Diff stats

```
c8ea202 — tools(badges): the sheet reads the deck table — --deck records, --selftest
  tools/make_badge_sheet.py | 184 ++++++++++++++++----------
  1 file changed, 138 insertions(+), 46 deletions(-)

cd67b37 — docs(tools): the sheet's known limit is resolved — deck table, --deck, --selftest
  tools/.workflows/package_readme.md | 39 ++++++++++++++++++++++--------
  1 file changed, 25 insertions(+), 14 deletions(-)
```

### Commits

- `c8ea202` — tools(badges): the sheet reads the deck table — --deck
  records, --selftest
- `cd67b37` — docs(tools): the sheet's known limit is resolved — deck table,
  --deck, --selftest

### References

- [2026-09-12-tools-package-hygiene.md](./2026-09-12-tools-package-hygiene.md)
  — source of all three assigned items (the follow-up list this session
  closed out).
- [2026-09-12-badge-pipeline-followups.md](./2026-09-12-badge-pipeline-followups.md)
  — the sibling session that had already landed items 1–2 (`c14c913`,
  `6795893`); its doc is what revealed the double assignment, and its
  verified-here work is this branch's inheritance.
- `tools/decks.py` — the F25 table the sheet now reads; `add_deck_argument`
  and the `--selftest` idiom are its exports.
- `tools/.workflows/package_readme.md` — the map, updated by `cd67b37`
  (sheet section, verification stamp, closing Notes tally).
