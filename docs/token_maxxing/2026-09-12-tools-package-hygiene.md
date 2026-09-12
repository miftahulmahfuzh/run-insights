# Token-Maxxing Session — 2026-09-12: Tools Package Hygiene

## 🎯 Achievement / End Result
- **Goal of the burn:** Give `tools/` — the offline Python badge-art generation
  pipeline (`gen_badge_art.py`, `check_badge_art.py`, `make_badge_assets.py`,
  `make_badge_sheet.py`, `make_badge_control.py`, `extend_badge_art.py`,
  `gen_app_icon.py`, `make_icon_assets.py`, `decks.py`) — its first-ever
  token-maxxing pass: audit the directory for dead/unused scripts, and write its
  first `package_readme.md`. The directory had been shipped, guarded by CI, and
  used by the `generate-badge` skill since 2026-08-21, but no prior session had
  ever mapped or swept it. The assigned framing made both outcomes valuable: dead
  code found *or* a first map written were each real value.
- **Concrete changes:** Two commits on
  `token-maxxing-2026-09-12-tools-package-hygiene`:
  - `9aa0d44` — *fix(tools): re-cut the badge controls at the deck's 4:3 frame*
    (`tools/make_badge_control.py`, +33/−13): the control-loop repair described
    below — the session ran every offline command in the directory, and the
    *good* control failed check 1. F15 had moved the masters and check 1 to a
    1024×768 4:3 contract; the control drawer was still drawing 1024² squares,
    so the grader's free self-test loop had been silently broken for three weeks.
  - `4db3539` — *docs(tools): first package_readme.md — map, standing rules,
    reverse wiring*: `tools/.workflows/package_readme.md`, 234 lines, written to
    the `scripts/` readme's conventions (map, not territory).
- **Real value delivered:**
  - **The verdict: NO dead scripts** — and, more useful than the verdict, the
    evidence for it. CI reads `tools/decks.json` (`scripts/check-badge-art.mjs`
    via `npm run badges:check`, run by `.github/workflows/ci.yml`); the two
    promoters generate the shipped manifests `lib/badges/badge-art.ts` and
    `lib/records/record-art.ts`; `icon:assets` is an npm entry; `gen_badge_art.py`
    and `extend_badge_art.py` are the two sanctioned `OPENROUTER_API_KEY` users
    per the `ci:openrouter-guard` boundary; the sheet and the controls are
    documented free review tools with foreseeable next uses. A name-grep audit
    would have flagged several of these as dead — nothing under `app/` or `lib/`
    imports anything in `tools/`.
  - **A real bug found by effect, not by reading:** the "good" control failed
    check 1 (measured ratio 1.0000, want 1.3333) — `make_badge_control.py` had
    never been re-cut after F15's frame move, and nothing in CI runs controls, so
    the checker's free-fixture loop had been silently off since 2026-08-21.
    Re-cut at the deck's measured 4:3 frame; verified that each of the four
    controls now fails *exactly* the question it was drawn to ask.
  - **The first map of the package:** pipeline-as-data diagram, six standing
    rules (skill-is-the-contract; one bolt of cloth; exit code is not the
    verdict; dry-run reads no key; generated files are never hand-edited;
    stdlib/PIL dependency posture), per-script why + wiring, a **reverse-wiring**
    section (ci.yml, `next.config.ts` immutable-header comments, package.json,
    README/architecture.md), and a gotchas list.
  - **Effect-level verification of the whole directory** (stamp dated in the
    readme): every offline command actually run, not read about — see the
    blow-by-blow below.
- **Branch:** `token-maxxing-2026-09-12-tools-package-hygiene` (worker session of
  coordinator `tokenmax-orch-2026-09-12`, one of that day's parallel fan-out;
  sibling sessions the same day included `badges-records-yagni`)
- **Merge status:** merged (commit `e755cb7`)
- **Approx token burn:** est. ~0.8–1M, input-dominated — the burn went into the
  full read of all nine scripts (~4,128 lines measured 2026-09-12, before any
  verdict), the exhaustive per-basename reference census, per-file git
  archaeology, and above all the effect-level loop: every grading run's output
  read and acted on (the control repair alone took a draw → grade → fail →
  re-cut → re-grade cycle). The output side is comparatively tiny: +33/−13 of
  Python and 234 lines of markdown.

## Context & Motivation

This was a `--worker` session spawned by the parallel coordinator
`tokenmax-orch-2026-09-12`, one of several same-day siblings (including
`badges-records-yagni`, which swept `lib/badges` + `lib/records` — the
*consumers* of this directory's outputs, making the two sessions natural
bookends: it audited what `tools/` ships into, this one audited `tools/` itself).

`tools/` was one of the last genuinely untouched corners of the repo. Every
other area — lib, components, app, scripts, docs — had received at least one
token-maxxing pass by 2026-09-11; `tools/` had none, not even a
`package_readme.md`. The assigned idea's reasoning: a first-time hygiene pass on
an undocumented package pays either way — if scripts are dead, deleting them is
value; if none are, the first map is value. That both came true (no dead
scripts, but a broken control loop found and a map written) is the session in
one sentence.

## What We Did (blow-by-blow)

**1. Full read before any verdict.** All nine scripts read end to end
(~4,128 lines: `check_badge_art.py` 1,176; `extend_badge_art.py` 571;
`gen_badge_art.py` 551; `make_badge_assets.py` 443; `gen_app_icon.py` 380;
`decks.py` 331; `make_icon_assets.py` 342; `make_badge_control.py` 201;
`make_badge_sheet.py` 133). No verdict was formed from a header or a docstring —
the session's read-first rule, which matters doubly here because every script
header *is* documentation and could vouch for itself convincingly while being
wrong about wiring.

**2. Exhaustive reference census per basename.** Every script's basename
grepped across the repo — excluding nothing, no `head` cutoff (a known
inventory-grep trap) — plus the two skill trees *outside* the repo:
`~/claude-commands` (source) and `~/.claude/skills` (deploy target). A badge
script could plausibly be referenced only from a skill — the `generate-badge`
skill drives these tools step by step — so an in-repo-only census would have
been answering the wrong question. Prose mentions in adopted plans under
`{pkg}/.workflows/plan/` were classified as prose, not callers (the copies sit
inside `lib/`, inside the grep surface, per the string-guard memory rule).

**3. Git archaeology per file.** Birth and last-touch dates for all nine
(measured 2026-09-12 from this branch):
- Eight of nine born **2026-08-21**: `gen_badge_art.py`/`check_badge_art.py`/
  `make_badge_assets.py`/`make_badge_control.py` in `8609927` (F10),
  `extend_badge_art.py` in `703f459` (F15), `make_badge_sheet.py` in `2f51b4e`
  (F10), `gen_app_icon.py`/`make_icon_assets.py` in `35419c1` (pwa);
  `decks.py` born **2026-08-22** in `9b0380f` (F25).
- Last touches: five files repointed by the 2026-09-11 docs-repoint commit
  `1e50d1f` (the [plans-archive session](./2026-09-11-docs-plans-archive.md))
  — that documentation sweep is the most recent git touch on most of the
  directory. `extend_badge_art.py` and `gen_app_icon.py` have had **zero
  commits since birth**; `make_icon_assets.py` last changed 2026-09-07 (the
  `/admin` tile deck); `make_badge_control.py` last changed *by this session*
  (`9aa0d44`).
- No file shows a suspicious gap between "last feature use" and "now" — the
  staleness pattern that usually precedes a dead-script verdict is absent, and
  the wiring census explains why.

**4. Effect-level verification — every offline command actually run.** This is
the session's defining choice, and the one that found the bug. Census and
archaeology establish *wiring*; only execution establishes *working*. Run
(Python 3.12.7, PIL 12.3.0 present):
- `py_compile` all nine scripts — all compile.
- `decks.py --selftest` — all green (cross-deck uniqueness, shared anchor,
  `decks.json` in step with the Python).
- `node scripts/check-badge-art.mjs` (`badges:check`) — green: 22 badges + 11
  records complete, style v2, one shared anchor.
- Both decks' `gen_badge_art.py --dry-run --all` — 22 + 11 prompts assemble,
  the style↔catalog parity guards green, no key read.
- Both `make_badge_assets.py --dry-run` — clean.
- `gen_app_icon.py --all --dry-run` — clean.
- `make_badge_sheet.py` — built the contact sheet, 22/22 badges.
- **The full control loop**: `make_badge_control.py` →
  `check_badge_art.py <control> --no-anchor` for all four synthetic patches.
- Not run (spends money, by design): the real generators against
  `OPENROUTER_API_KEY`. `--dry-run` is the free contract, and rule 4 of the
  readme now states it.

**5. The find.** The *good* control — the one that must pass every hard check —
**failed check 1**: measured aspect ratio 1.0000 against the 1.3333 (4:3)
contract. `make_badge_control.py` was still drawing 1024² squares; F15 had moved
the masters and check 1 to 1024×768, and since nothing in CI runs the control
loop, the checker's free self-test had been silently broken for three weeks. The
session had effectively discovered that its own verification harness — the very
tool meant to prove the grader works — was the broken thing.

**6. Two repair attempts (see Code / Design Details for the numbers).** The
first re-cut changed only the frame and kept the square-era patch geometry
(`half = 0.40 * W` = 410px); the hexagon control's vertices landed outside the
768-tall frame, and check 3's strips caught the sliced bone border (strip sd
56.4, judged "cluttered", measured box height 100.0% of frame). The real fix
sizes the patch to the deck's *measured* box: ground at `W, H = 1024, 768`, and
`half = 0.45 * H`. Verified end to end: each control now fails exactly its
designed check. Committed as `9aa0d44`.

**7. The map.** `tools/.workflows/package_readme.md` (234 lines, commit
`4db3539`), following the `scripts/` readme's conventions: Overview + the six
standing rules; the pipeline as a data-flow diagram (catalog + style block →
gen → grade → widen → promote → the two drift guards), with where records
(native 4:3, no widen) and icons (their own two-step) diverge; one subsection
per script with its *why* and its npm/CI wiring; reverse wiring; gotchas; a
verification stamp dated 2026-09-12; and a Notes section stating the audit
verdict.

## Code / Design Details

### The control repair (commit `9aa0d44`)

The failure signature, from the actual grading run:

```
good:    check 1 FAIL  ratio 1.0000, want 1.3333   # square-era output vs 4:3 contract
```

Attempt 1 — frame only — produced a *worse* looking failure that the checker's
own measurements diagnosed:

```
offcentre/hexagon geometry:  half = 0.40 * W = 410 px patch radius on a 768-tall frame
check 3 (strips):  strip sd 56.4 → "cluttered"; measured box height 100.0% of frame
                   # the hexagon's vertices ran out of the frame, slicing the
                   # bone border the strips are drawn to measure
```

The lesson the commit message records: *the patch must be sized to the deck's
measured box, not to the frame's square-era pixels*. `early_bird` — the deck's
anchor patch, the reference the checker normalises against — measures
**61.3% × 90.2%** of the frame; the rebuilt good control lands at
**58.6% × 86.7%**, comfortably inside the same envelope. Hence
`half = 0.45 * H` (345.6 px on the 768-tall ground), not any fraction of W.

The two-line diff, in spirit:

```python
# before (square era)               # after (F15 4:3)
W = H = 1024                        W, H = 1024, 768
grad over 2 * size                  grad over (w + h)   # same normalized sweep
patch half = 0.40 * W               patch half = 0.45 * H   # sized to MEASURED box
```

The gradient change is the subtle half: the square drew its raking-light sweep
over `2 * size`; the 4:3 ground draws it over `(w + h)`, the same normalized
sweep over the same total travel, so the lighting survives the aspect change.

### The post-repair control matrix (the actual acceptance evidence)

Each control is drawn to ask one question; the repaired loop answers each
correctly (`--no-anchor`, `--no-crops`):

| Control | Must | Does |
|---|---|---|
| `good` | pass every hard check | passes |
| `flat` | fail only check 3's sd floor | all four strips "flat, no weave" |
| `offcentre` | fail only check 8a | 9.45% off centre, band 3.00 |
| `bleached` | fail only check 3's grey band | grey 107–111 vs band 16–52 |

"Each control fails exactly the question it was drawn to ask" — that sentence
is in the commit message, and it is the acceptance criterion, because a control
that fails *extra* checks is indistinguishable from a broken checker.

### Why `--no-anchor`

A synthetic control is not a deck member, so it fails check 9 (anchor
similarity) *by construction* — running controls without `--no-anchor` would
report a pass/fail that means nothing about the checks under test. The readme's
`check_badge_art.py` subsection documents this flag's purpose.

### The map's structure (what a future reader gets)

`tools/.workflows/package_readme.md`, 234 lines:
- **Overview**: nothing here is imported by the app; the app consumes committed
  *outputs* by URL and type; generation is the only part that spends money.
- **Six standing rules** (skill is the contract; one bolt of cloth; exit code is
  not the verdict; dry-run reads no key and it is `OPENROUTER_API_KEY`, not
  `LLM_API_KEY`; generated files are never hand-edited; stdlib/PIL posture).
- **Pipeline as data**: the gen → grade → widen → promote → drift-guards
  diagram, plus the records and icon divergences.
- **Per script**: why it exists, its known limits, its wiring — including the
  `--all` asymmetry (forbidden in `gen_badge_art.py`, allowed in
  `extend_badge_art.py`) as *design*.
- **Reverse wiring**: `.github/workflows/ci.yml` → `badges:check` →
  `decks.json`; `package.json` (`badges:check`, `icon:assets`);
  `next.config.ts`'s immutable-header comments crediting `decks.py` and the
  orphan sweep; README/architecture.md; the F10/F15/F25 design records.
- **Gotchas**: the ungated control loop (with the F15 story as proof of cost);
  `RECORD_ART_SMALL_SIZE` as a standing zero-ref generator emission; the
  records `.sm.webp` set shipping unrendered (the F25 deliberate bet); warmth
  is `r − b` and *negative* here; the `.workflows/plan/` copies inside the
  grep surface.
- **Verification stamp** dated 2026-09-12, with the explicit rule that counts
  are as-of-this-date state, not rules.

## Decisions & Trade-offs

**Run everything vs. read-only census.** The audit could have stopped at the
census + archaeology (both clean). Running every offline command cost the most
tokens and found the only code bug of the session. Decision: for a directory
whose whole job is to *be run*, a verdict reached without running is not a
verdict. This choice is now baked into the readme's verification stamp so the
next auditor repeats it.

**Deliberately NOT drive-by-fixed.** Four hygiene findings were recorded, not
repaired — each has a design decision attached that belongs to the session
which next touches that tool:
1. `make_badge_sheet.py` predates `decks.py` and reads
   `lib/badges/catalog.ts` directly — a records sheet needs the `--deck`
   treatment first. Not done: no records sheet is currently wanted.
2. `extend_badge_art.py`'s badge-deck paths are hardcoded — and records do not
   need it (they are generated natively at 4:3), so neither does the flag.
   Not done by design.
3. The control loop has no automated gate — see Follow-ups; wiring one is a
   CI-contract decision, not a one-line fix.
4. `RECORD_ART_SMALL_SIZE` is a standing zero-reference constant
   (`lib/records/record-art.ts:57`) — but it is *generator output*:
   `tools/make_badge_assets.py` emits `{deck.const_name}_SMALL_SIZE`
   unconditionally per deck (dynamically, which is why literal greps miss the
   emitter). Hand-deleting it fights the generator; the fix belongs in the
   generator (or a records shelf ships). This is the **inherited follow-up
   from the sibling session
   [badges-records-yagni](./2026-09-12-badges-records-yagni.md)** — that
   session found the zero-ref, this session's audit of the generator confirmed
   the root cause, and the readme now records it so no future sweep
   re-litigates it.

**The `--all` asymmetry left alone.** `gen_badge_art.py` forbids `--all`
without `--dry-run` (invention is per-badge: the three-attempt cap and the
look-at-it step are per badge); `extend_badge_art.py` allows it (outpainting is
mechanical 22 times over). The readme documents this as design so nobody
"fixes" it into uniformity.

**Controls duplicate `style.md` tokens by copy.** A shared import shim would be
more coupling than the duplication costs; if the palette moves, both files
move. Stated in the readme under `make_badge_control.py`.

**Doc conventions followed, not invented.** The readme is written to the
`scripts/` readme's shape (the 2026-09-11 [scripts package hygiene
session](./2026-09-11-scripts-package-hygiene.md) set it): map-not-territory,
standing rules up top, per-entry wiring, volatile counts stamped with their
measure date.

## Follow-ups & YAGNI notes

- **Wire the control loop as a cheap CI gate.** `make_badge_control.py` +
  `check_badge_art.py --no-anchor` on all four patches is free, offline, and
  seconds-fast — the exact gate that would have caught the three-week silent
  break after F15's frame move. Deliberately not added this session: a CI-contract
  change (new job/step) belongs to a session that owns CI, and the fix that
  makes the gate *pass* already shipped in `9aa0d44`.
- **Add `--deck` to `make_badge_sheet.py`** when a records contact sheet is
  actually wanted — not before (YAGNI; the wiring work is real but the need is
  not yet).
- **Decide the `RECORD_ART_SMALL_SIZE` emission in the generator**: either
  `make_badge_assets.py` stops emitting it for decks with no shelf consumer, or
  a records shelf starts consuming it. Recorded in the readme's gotchas so the
  next sweep reads the decision instead of re-deriving it.
- **Consider referencing `make_badge_sheet.py` from SKILL.md's review step**
  (so the per-badge loop reminds the operator the whole-deck sheet exists).
  Cross-package by definition — SKILL.md belongs to the `generate-badge` skill,
  not to `tools/` — so it needs coordination with that skill's owner; noted, not
  done.
- **YAGNI note on the audit itself:** the natural next "tools/" idea — sweeping
  the *generated* manifests (`badge-art.ts`/`record-art.ts`) for dead exports —
  is already answered by the sibling session and the readme's rule 5: those
  files are generator output, their liveness is `typecheck`'s job (a TOTAL
  `Record<Key, Art>` makes a key without art fail the build), and hand-edits
  are the anti-pattern. Don't sweep generated files.

## Appendix

### Commands run (the verification stamp's evidence, 2026-09-12)

```
python3 -m py_compile tools/*.py                     # all nine compile (Python 3.12.7, PIL 12.3.0)
python3 tools/decks.py --selftest                    # all green
node scripts/check-badge-art.mjs                     # badges:check green — 22 badges + 11 records,
                                                     #   style v2, one shared anchor
python3 tools/gen_badge_art.py --dry-run --all                    # badges deck: 22 prompts
python3 tools/gen_badge_art.py --deck records --dry-run --all     # records deck: 11 prompts
python3 tools/make_badge_assets.py --dry-run         # both decks' promoters clean
python3 tools/gen_app_icon.py --all --dry-run        # clean
python3 tools/make_badge_sheet.py                    # sheet built 22/22
python3 tools/make_badge_control.py && \
python3 tools/check_badge_art.py <control> --no-anchor   # ×4: good/flat/offcentre/bleached
```

### Git archaeology table (measured 2026-09-12)

| Script | Born | Last touch before session |
|---|---|---|
| `gen_badge_art.py` | 2026-08-21 `8609927` (F10) | `1e50d1f` 2026-09-11 (docs repoint) |
| `check_badge_art.py` | 2026-08-21 `8609927` (F10) | `1e50d1f` 2026-09-11 |
| `make_badge_assets.py` | 2026-08-21 `8609927` (F10) | `1e50d1f` 2026-09-11 |
| `make_badge_control.py` | 2026-08-21 `8609927` (F10) | `1e50d1f` 2026-09-11 → this session `9aa0d44` |
| `make_badge_sheet.py` | 2026-08-21 `2f51b4e` (F10) | `1e50d1f` 2026-09-11 |
| `extend_badge_art.py` | 2026-08-21 `703f459` (F15) | **birth** (zero commits since) |
| `gen_app_icon.py` | 2026-08-21 `35419c1` (pwa) | **birth** (zero commits since) |
| `make_icon_assets.py` | 2026-08-21 `35419c1` (pwa) | `701aed5` 2026-09-07 (/admin tile) |
| `decks.py` | 2026-08-22 `9b0380f` (F25) | `1e50d1f` 2026-09-11 |

### Commits

- `9aa0d44` — fix(tools): re-cut the badge controls at the deck's 4:3 frame
  (1 file, +33/−13)
- `4db3539` — docs(tools): first package_readme.md — map, standing rules,
  reverse wiring (1 file, +234/−0)

### References

- [2026-09-12-badges-records-yagni.md](./2026-09-12-badges-records-yagni.md) —
  the sibling session that found the zero-ref `RECORD_ART_SMALL_SIZE` (source
  of this session's inherited follow-up) and swept this directory's consumers.
- [2026-09-11-docs-plans-archive.md](./2026-09-11-docs-plans-archive.md) — the
  session whose in-code path repoints (`1e50d1f`) are the most recent git touch
  on most `tools/` files, including the six badge-art tool headers.
- [2026-09-11-scripts-package-hygiene.md](./2026-09-11-scripts-package-hygiene.md)
  — the `scripts/` readme whose conventions this package's first readme follows.
- `tools/.workflows/package_readme.md` — the deliverable itself (234 lines).
