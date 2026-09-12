# Token-Maxxing Session — 2026-09-12: Badge Pipeline Follow-ups

## 🎯 Achievement / End Result
- **Goal of the burn:** Close both explicit deferred follow-ups that the same
  day's sibling sessions had left on the record: (1) wire
  `tools/make_badge_control.py` + `tools/check_badge_art.py --no-anchor` into CI
  as a standing gate — the item
  [tools-package-hygiene](./2026-09-12-tools-package-hygiene.md) deferred as "a
  CI-contract change belongs to a session that owns CI"; and (2) decide the
  zero-consumer `RECORD_ART_SMALL_SIZE` emission — stop emitting it, or document
  why it is kept — the item
  [badges-records-yagni](./2026-09-12-badges-records-yagni.md) found and this
  same day's tools audit traced to its root cause in the generator. Both items
  came from the coordinator pre-scoped; no idea selection was needed.
- **Concrete changes:** Two commits on
  `token-maxxing-2026-09-12-badge-pipeline-followups`:
  - `c14c913` — *ci(badges): gate the control loop — four designed controls,
    asserted on every push* (+228 across three files): new
    `tools/check_badge_controls.py` (197 lines), a new separate CI job
    `badge-art-controls` in `.github/workflows/ci.yml`, and a new
    `badges:controls` script in `package.json`.
  - `6795893` — *tools(badges): resolve RECORD_ART_SMALL_SIZE — kept, documented
    at the emitter* (+71/−32 across three files): `tools/make_badge_assets.py`'s
    `emit_manifest` sizes block is now deck-aware like the docblocks beside it,
    the records manifest was regenerated so its sizes block carries the
    keep-decision at the symbol, and
    `tools/.workflows/package_readme.md`'s two open gotchas became recorded
    decisions (plus reverse-wiring, script section, verification stamp
    nine→ten scripts, and closing Notes updated).
- **Real value delivered:**
  - **The badge grader's free self-test loop now runs on every push.** This is
    the gate whose absence let F15's frame move silently kill the loop for three
    weeks (the controls stayed 1024² squares, the "good" control died on check 1
    before any band was measured, and nothing noticed until a session actually
    RAN it). The next band or frame change that quietly breaks the loop now
    breaks a green build instead of nothing at all.
  - **The gate asserts designed outcomes, not bare exit codes.** Per control:
    the exit code, the EXACT set of hard-failure check names, and — where two
    controls share a check name — the reason phrase that tells them apart
    (`flat` fails "3 twill margin" *with* "no weave" in the detail: the sd
    floor; `bleached` fails the same check name *without* it: the grey band).
    `flat`'s designed check-10 warning is asserted too. And a checker crash
    (`die()` exits 1 with no REJECT verdict) is refused as a designed failure —
    a broken checker must not be mistaken for a passing negative control.
  - **Verified in BOTH directions.** The gate is green 4/4 against the real
    loop, and a negative control (one deliberately corrupted expectation) made
    it fail loudly — full checker transcript printed, MISMATCH named, exit 1.
  - **`RECORD_ART_SMALL_SIZE` resolved as KEEP, recorded at the symbol.** The
    generator's sizes block is deck-aware prose (not a noun-swapping template),
    so the records manifest itself now states: zero-reference today, kept on
    purpose, the contract half of the same F25 bet the `small` field already
    makes, and the future records shelf imports it exactly as `BadgeShelf`
    imports the badge deck's. The readme's gotchas entry flipped from open
    question to decision. No future sweep re-litigates it.
  - **The generator's own invariant held under the edit.** Regenerating the
    BADGES deck produced a byte-identical manifest; regenerating the RECORDS
    deck produced a diff that is exactly the docblock — no derivative bytes, no
    `.webp` churn.
- **Branch:** `token-maxxing-2026-09-12-badge-pipeline-followups` (worker
  session of coordinator `tokenmax-orch-2026-09-12`, that day's closing fan-out
  wave; its two assignments are the deferred follow-ups of two sibling sessions
  from the same coordinator's morning waves).
- **Merge status:** NOT merged at doc time — landing is owned by the
  coordinator `tokenmax-orch-2026-09-12` (worker sessions never merge). The
  landing set is commits `c14c913` + `6795893` on branch
  `token-maxxing-2026-09-12-badge-pipeline-followups`; verify by git, not by
  this line.
- **Approx token burn:** est. ~0.4–0.6M, input-dominated — the burn went into
  measuring all four control outcomes before writing a line of expectation
  (draw → grade → read, four times), full reads of the checker's verdict format
  and the generator's emit path before editing either, the double-direction
  gate verification (plus the corrupted-expectation negative control), both
  decks' regeneration checks, and two coordinator-visible stalls at session
  start (rate-limit retries; no work lost to them). The output side is small by
  design: +228 and +71/−32.

## Context & Motivation

This was a `--worker` session spawned by the parallel coordinator
`tokenmax-orch-2026-09-12`. The same coordinator's earlier waves produced the
two sessions whose deferred items became this session's assignments:

- [tools-package-hygiene](./2026-09-12-tools-package-hygiene.md) audited the
  `tools/` badge pipeline, found the control loop silently broken (F15's frame
  move vs square-era controls), re-cut it in `9aa0d44` — and then deferred
  wiring it into CI, on the stated ground that a new CI job is a CI-contract
  decision for a session that owns CI. It also recorded the
  `RECORD_ART_SMALL_SIZE` emission as an open gotcha.
- [badges-records-yagni](./2026-09-12-badges-records-yagni.md) swept
  `lib/badges` + `lib/records` and found `RECORD_ART_SMALL_SIZE` the one
  zero-reference constant, tracing the root cause to
  `tools/make_badge_assets.py`'s unconditional per-deck emission — and deferred
  the generator fix.

Both deferrals named their own next session. This was that session: a
follow-ups-only worker whose scope was fixed by the coordinator to exactly
these two items, both of which close loop-ends the same day opened. The
fit is clean: the gate's fix that makes it *pass* shipped in the morning
(`9aa0d44`); this session shipped the gate that keeps it passing.

## What We Did (blow-by-blow)

**1. Item 1, measured first.** Before writing a single expectation, all four
controls were drawn and graded on this machine (2026-09-12, Python 3.12.7,
Pillow 12.3.0, bands as re-cut in `9aa0d44`): `good` exits 0 with zero
warnings; `flat`, `offcentre`, and `bleached` each fail exactly their designed
check — no more, no fewer. The EXPECTED table is a stamp of measurement, not a
reading of anyone's intentions.

**2. The gate script.** `tools/check_badge_controls.py` (197 lines) draws the
four controls into a temp dir via `make_badge_control.py`, runs each through
`check_badge_art.py --no-anchor --no-crops` as a subprocess (the honest thing
to gate on: the real CLI, its real exit codes — the file deliberately does not
import PIL), and asserts each outcome against the EXPECTED table:

| Control | Designed question | Asserted outcome |
|---|---|---|
| `good` | a plausible patch passes the hard checks | exit 0 (warnings printed, not failed on) |
| `flat` | a sticker fails check 3's sd floor | exit 1, fails EXACTLY {"3 twill margin"}, detail contains "no weave", warns {"10 weave texture"} |
| `offcentre` | a shifted patch fails centring | exit 1, fails EXACTLY {"8a patch centred"} |
| `bleached` | a pale substrate fails the grey band | exit 1, fails EXACTLY {"3 twill margin"}, detail does NOT contain "no weave" |

The reason-phrase assertion is not pedantry: `flat` and `bleached` fail the
same check *name*, so without the detail-line disambiguation a band edit that
broke the grey-band path while leaving the sd floor intact would still show a
"passing" `bleached` row. The has / has-not pair pins *which sub-measurement*
fired. The script also refuses to count a checker crash as a designed failure:
`die()` exits 1 with no REJECT verdict on stdout, and a negative control that
"passes" because its judge segfaulted is worse than no gate.

**3. The wiring.** `package.json` gains `"badges:controls":
"python3 tools/check_badge_controls.py"` — npm is only the launcher, so the
script runs with no `node_modules` at all. `.github/workflows/ci.yml` gains a
separate job `badge-art-controls`: checkout, `setup-python@v5` (3.12),
`pip install pillow==12.3.0`, `npm run badges:controls`. Pillow is pinned
*together with* the EXPECTED stamp on purpose — the controls' pixels are both
DRAWN and MEASURED by that library, so a Pillow bump can move an outcome, and
the workflow comment tells the bumper to re-run the loop and re-stamp both.

**4. Separate job, not a step.** The job is deliberately not a step inside
`test`: it needs only Python + Pillow (no `npm ci`, no env vars, no database,
no Playwright), runs in ~5 seconds, and runs in parallel with the Node job
instead of lengthening it. A broken control loop now reddens CI without
costing the test job anything.

**5. Verified both directions.** The green direction:
`python3 tools/check_badge_controls.py` → 4/4 OK. The red direction: one
expectation deliberately corrupted → the gate failed loudly, printing the full
checker transcript under a MISMATCH verdict and exiting 1. A gate whose failure
mode is quiet is a second silent loop.

**6. Item 2's fact base.** `RECORD_ART_SMALL_SIZE` lives at
`lib/records/record-art.ts:57` — a GENERATED file; its emitter is
`tools/make_badge_assets.py` `emit_manifest`, which writes
`{deck.const_name}_SMALL_SIZE` unconditionally per deck (dynamically, which is
why literal greps for the name find the constant but miss the emitter). Of the
six manifest constants it is the only zero-consumer one: the `BADGE_ART` trio
is fully consumed (`BadgeShelf` and the render pipeline), and
`RECORD_ART_WIDTH`/`HEIGHT` are consumed by `RecordDialog` and tests.

**7. The decision, made in the generator.** `emit_manifest`'s sizes block is
now deck-aware the same way its `small` and `twill` docblocks already were.
The records deck's block states, at the symbol: zero-reference today and KEPT
on purpose — it is the contract half of the same F25 bet the `small` field
makes (the derivative ships whether or not the not-yet-built records shelf
draws it, because adding it later would re-hash every master's filename), and
when that shelf exists its shelf-mark component imports this constant exactly
as `BadgeShelf` imports the badge deck's. The badge deck's block stays the
one-liner it always was.

**8. Stop-emitting considered and rejected** (see Decisions) — the alternative
was real and lost on the merits, not unexamined.

**9. Positive control on the generator's own invariant.** The readme's
documented property is that regenerating a deck with this function reproduces
the file on disk. After the edit: regenerating the BADGES deck produced a
byte-identical manifest; regenerating the RECORDS deck produced a diff that is
exactly the docblock — nothing else, zero `.webp` binary churn. The edit
changed prose, and the invariant proves it changed *only* prose.

**10. The map updated.** `tools/.workflows/package_readme.md`: both gotchas
flipped from open follow-ups to recorded decisions — the control-loop gotcha
now says it IS gated (with the re-stamp rule: after any band or contract
change, re-run the loop and re-stamp EXPECTED, never widen EXPECTED to make
red go away), and the `RECORD_ART_SMALL_SIZE` gotcha now says the decision and
where it is recorded. The reverse-wiring section gained the new job and
script; `make_badge_control.py`'s section notes CI runs the loop; the
verification stamp went from nine to ten scripts; the closing Notes updated.

## Code / Design Details

### The EXPECTED table (the whole contract, 10 lines)

```python
EXPECTED = {
    "good": {"exit": 0},
    "flat": {
        "exit": 1,
        "fails": {"3 twill margin"},
        "fail_detail_has": "no weave",
        "warns": {"10 weave texture"},
    },
    "offcentre": {"exit": 1, "fails": {"8a patch centred"}},
    "bleached": {"exit": 1, "fails": {"3 twill margin"}, "fail_detail_has_not": "no weave"},
}
```

`fails` is the EXACT set — a failure control must fail its designed check and
nothing else, because a control that fails extra checks is indistinguishable
from a broken checker. `fail_detail_has` / `fail_detail_has_not` disambiguate
the one collision. The header stamps the measurement: *Measured 2026-09-12 —
Python 3.12.7, Pillow 12.3.0, bands as re-cut in `9aa0d44`* — and the
maintenance section tells the future band-re-deriver to re-run and re-stamp,
never to soften the gate.

### The CI job

```yaml
badge-art-controls:
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4
    # Pinned together with Pillow below on purpose: the controls' pixels are DRAWN and
    # MEASURED by this library, and check_badge_controls.py's EXPECTED table is stamped
    # against this pair (see its header). Bump both together, after re-running the loop.
    - uses: actions/setup-python@v5
      with:
        python-version: '3.12'
    - name: Install Pillow (pinned to the EXPECTED stamp)
      run: pip install pillow==12.3.0
    - name: Badge art control loop
      run: npm run badges:controls
```

### The deck-aware sizes block (the records deck's, generated)

```ts
/** Intrinsic pixel sizes, so a consumer never has to restate them.
 *
 *  `RECORD_ART_SMALL_SIZE` is zero-reference today and KEPT on purpose. It
 *  is the contract half of the same F25 bet the `small` field above makes: the
 *  derivative ships whether or not the not-yet-built records shelf draws it,
 *  because adding it later would re-hash every master's filename. When that shelf
 *  exists, its shelf-mark component imports this constant exactly as `BadgeShelf`
 *  imports the badge deck's; deleting it now would leave that component restating
 *  192 by hand — the exact thing this block exists to prevent. Verified
 *  zero-reference 2026-09-12; recorded here so no sweep re-litigates it. */
export const RECORD_ART_WIDTH = 768
export const RECORD_ART_HEIGHT = 576
export const RECORD_ART_SMALL_SIZE = 192
```

This text is generator OUTPUT — it lives in `emit_manifest` as a `sizes_doc`
branch keyed on the deck, beside the existing `small_doc`/`twill_doc` branches.
`emit_manifest`'s own docstring was updated to name the sizes block in its
"deck-aware prose, not a template with the nouns swapped" rule.

### Why the crash guard matters

`check_badge_art.py` has two failure exits: the grading verdict (prints
`REJECT — …` and its FAIL lines, exits 1) and `die()` (an internal error:
exits 1, prints no verdict). Both look identical to a shell `||`. A negative
control that only checks exit codes passes when the checker crashes — the gate
requires a REJECT verdict plus the designed FAIL set, so a crash reads as a
gate failure, not a control pass.

## Decisions & Trade-offs

**Assert designed outcomes, not exit codes.** The cheap gate is four exit-code
checks. It would have caught the F15 break (a crash or a wrong-shaped failure)
but not a partial break — e.g. a band edit that made `bleached` fail *both* 3
sub-measurements, or `flat` lose its warning. Since the loop exists precisely
to detect silent drift in the grader, the gate asserts the grader's full
designed verdict. Cost: the EXPECTED table needs re-stamping when bands move;
the readme turns that into a rule rather than leaving it as friction.

**Separate CI job vs a step in `test`.** A step would need the Node job to
install Python (or the Python job to install npm) — coupling two dependency
worlds for one command. The separate job is ~5s of parallel Python-only work
and its failure names itself in the checks list.

**KEEP + document vs stop emitting vs hand-delete.** Three options, two
rejected:
- *Hand-delete the constant from the manifest* — rejected immediately: it
  fights the generator; the next `make_badge_assets.py` run resurrects it.
- *Stop emitting for records* — considered seriously and rejected: it needs a
  per-deck flag keyed on a product fact the generator cannot observe (does a
  shelf consumer exist yet?). That is more speculative machinery than the
  one-line constant it would gate, and deleting the constant while still
  shipping the derivative it sizes leaves the future consumer restating 192 by
  hand — the exact restatement the sizes block exists to prevent.
- *KEEP, documented at the emitter* — chosen. The generator already had the
  deck-aware-docblock pattern; extending it to the sizes block costs one
  branch, and the decision lands in the two places the next reader looks: the
  symbol itself and the readme's gotchas.

**`npm run format:check` is red at HEAD — deliberately not fixed here.**
Pre-existing, not this branch: red at HEAD on 14 files unrelated to this diff
(e.g. `lib/metrics/hrMax.ts`, `lib/metrics/index.ts`,
`components/review/*.test.tsx`), verified by probing the HEAD blob of
`hrMax.ts` inside the repo. CI's format gate will be red for every PR until
someone sweeps it. A worker branch fixing 14 unrelated files is scope creep
and manufactures merge conflicts for its siblings; the finding is recorded
instead (see Follow-ups).

**Merge status phrasing that cannot rot.** Earlier same-day sweeps spent ten
commits fixing docs that said "on branch, NOT merged" after their branches
merged. This doc records fixed history — the *worker session* did not merge
(worker sessions never merge; landing belongs to the coordinator), with the
commit shas named so a future reader verifies current state via git rather
than trusting this line.

## Follow-ups & YAGNI notes

- **The repo-wide `format:check` red needs a sweep** by a session whose scope
  is allowed to touch 14 unrelated files (a dedicated formatting branch, or
  the coordinator's landing pass). Until then every PR's format gate is red,
  which trains people to ignore a red gate — the real cost.
- **The sibling docs' follow-up lists now point at landed work.** This
  session's commits close: "Wire the control loop as a cheap CI gate" and
  "Decide the `RECORD_ART_SMALL_SIZE` emission" in
  [2026-09-12-tools-package-hygiene.md](./2026-09-12-tools-package-hygiene.md),
  and "Fix the generator's `*_SMALL_SIZE` emission (cleanest follow-up)" in
  [2026-09-12-badges-records-yagni.md](./2026-09-12-badges-records-yagni.md).
  Neither sibling doc was edited (their follow-up sections are history, and
  the landing is traceable from here) — a future reader reaching those lists
  should check git before re-doing either.
- **Still open from the tools audit** (deliberately untouched — no assignment
  covers them): `--deck` for `make_badge_sheet.py` when a records contact
  sheet is actually wanted, and the cross-package SKILL.md reference — both in
  the tools doc's follow-up list with their reasons.
- **YAGNI, from the gate's own header:** never widen EXPECTED to make red go
  away. If a control fails differently after a band re-derivation, the drawing
  or the band has drifted — fix the cause, then re-stamp.
- **YAGNI, standing:** do not sweep the generated manifests
  (`badge-art.ts`/`record-art.ts`) for dead exports — their liveness is
  `typecheck`'s job and hand-edits are the anti-pattern (rule 5 of the tools
  readme). `RECORD_ART_SMALL_SIZE` was the one legitimate question there, and
  it is now answered at the symbol.
- **Session-start stalls:** the session began after two coordinator-visible
  rate-limit stalls (retried, resolved); no work was lost to them.

## Appendix

### Gates run at session end (all green, 2026-09-12)

```
python3 tools/check_badge_controls.py            # 4/4 OK (good/flat/offcentre/bleached)
npm run badges:check                             # both decks OK — 22 badges, 11 records, style v2
npm run typecheck                                # exit 0
npx vitest run tests/badges.render.test.ts       # 51/51
npx prettier --check <touched files>             # clean (ci.yml, package.json, both .py, record-art.ts, package_readme.md)
```

Plus the negative-direction proof: one corrupted expectation → loud MISMATCH
with the full checker transcript, exit 1.

### Diff stats

```
c14c913 — ci(badges): gate the control loop
  tools/check_badge_controls.py | 197 +++++++++++++++
  .github/workflows/ci.yml      |  30 +++++
  package.json                  |   1 +
  3 files changed, 228 insertions(+)

6795893 — tools(badges): resolve RECORD_ART_SMALL_SIZE
  lib/records/record-art.ts          | 11 +++++-
  tools/.workflows/package_readme.md | 63 ++++++++++--------
  tools/make_badge_assets.py         | 29 ++++++---
  3 files changed, 71 insertions(+), 32 deletions(-)
```

### Commits

- `c14c913` — ci(badges): gate the control loop — four designed controls,
  asserted on every push
- `6795893` — tools(badges): resolve RECORD_ART_SMALL_SIZE — kept, documented
  at the emitter

### References

- [2026-09-12-tools-package-hygiene.md](./2026-09-12-tools-package-hygiene.md) —
  source of item 1 (found and re-cut the broken control loop; deferred the CI
  gate) and co-source of item 2 (recorded the emission as an open gotcha).
- [2026-09-12-badges-records-yagni.md](./2026-09-12-badges-records-yagni.md) —
  source of item 2 (found `RECORD_ART_SMALL_SIZE` zero-reference; traced the
  root cause to `emit_manifest`).
- `tools/check_badge_controls.py` — the gate itself; its header is the design
  record (what is asserted, why, the maintenance rule, the measurement stamp).
- `tools/.workflows/package_readme.md` — the map, now carrying both decisions
  (gotchas, reverse wiring, ten-script stamp).
