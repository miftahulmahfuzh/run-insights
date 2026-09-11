# Token-Maxxing Session — 2026-09-12: Docs Architecture & README Refresh

> **First token-maxxing session on this date, and again a WORKER** (worker
> `docs-architecture-readme-refresh` of coordinator `tokenmax-orch-2026-09-12`;
> no solo menu — the idea was pre-assigned by the coordinator, as with all of
> that fan-out's workers). The assignment: verify the brand-new
> `docs/architecture.md` — synthesized the previous evening, *before* several
> same-day dead-code-removal merges landed — does not cite any function or file
> those later merges removed, check the root `README.md` for the same kind of
> drift, and compact/correct both. The session ran ~05:30–06:00 WIB, straight
> after the fan-out's earlier sessions had cleared the way.

## 🎯 Achievement / End Result
- **Goal of the burn:** Close the drift window yesterday's synthesis opened.
  `docs/architecture.md` was written from a tree that then changed under it —
  the same day's YAGNI purges over `lib/db`, `lib/nina`, `lib/admin` and
  `components/ui` landed *after* the doc's baseline — so the pass extracted the
  exact removal checklist from the intervening commits, swept both docs against
  it, and fixed every hit.
- **Concrete changes:** commit `c643878` — 3 files, +43/−29:
  `docs/architecture.md` (49 changed lines), `README.md` (21),
  `components/admin/AdminNav.tsx` (2 — one word in a comment).
- **Real value delivered:**
  - Three real same-day drift hits fixed in `architecture.md`: F03/§6 no
    longer cite the removed `getObservedMaxHrExcludingRun` as a live resolver
    (rewritten around the surviving `getObservedMaxHrRun`); §4.2 invariant 1
    now names the allow-list the guard *actually* enforces instead of a
    `requireAdmin()` exception that is not in the set; §8 no longer lists the
    dead `/admin/photos` route.
  - One falsified premise settled cheaply: the coordinator's named suspect —
    the "admin PhotoReference fix" (`6fe5f82`) — **predates the doc baseline**,
    was already reflected in the docs, and could not have caused drift.
  - Four stale README facts corrected to measured ones: 3,566 → 5,093 tests
    (full suite re-run green today), "six a day" → `NINA_IMAGE_DAILY_CAP`
    (default 30), "Seven tabs" → six, and all three "v0.2.0" mentions (both
    docs) → v1.0.0 — no v0.2.0 tag or CHANGELOG entry ever existed.
  - A clean negative result recorded so nobody re-audits it blind: README
    cites **none** of the 7 removed or 28 de-exported symbols; all 70 file
    paths cited across both docs exist; every npm script name README documents
    exists; route handlers match the doc's "seven + two".
  - The doc-wide lesson written down: a "current-state" doc synthesized mid-day
    on a heavy-merge day inherits a drift window measured in **hours** — the
    fix is a mechanical gate, not another careful read.
- **Branch:** `token-maxxing-2026-09-12-docs-architecture-readme-refresh`
- **Merge status:** on branch (worker session; the coordinator owns the merge
  — Worker Mode W4: report, never merge).
- **Approx token burn:** high, deliberately — the full 5,093-test suite re-run
  to own the README's headline number, per-symbol greps over two docs, a
  70-path existence check, and diff archaeology across the 9 code commits in
  the window. 🔥

## Context & Motivation

The 2026-09-11 architecture-reference session (doc:
`2026-09-11-architecture-reference.md`) read all 36 plan docs and synthesized
`docs/architecture.md` (622 lines) as "the system as it actually exists." Its
own Follow-ups section predicted the failure mode this session fixed: *"the doc
is a snapshot dated 2026-09-11 — it will drift… the topology and counts
sections age fastest."*

What the prediction undersold was the *speed*. The synthesis was written on a
day that was itself a heavy-merge day — the coordinator's fan-out landed the
`lib/admin` dead-export audit, both components dead-code sweeps, the
`lib/db/queries` YAGNI removal and the `lib/nina` `countNinaSessionMessages`
removal *around* the doc work. The doc's baseline (`e0add93`, the last commit
that touched either doc) therefore predates several same-day purges, and every
function name, route and count it cites was suspect the moment it was written.

The coordinator assigned exactly this audit to one worker of the 2026-09-12
fan-out: check the doc against the merges that postdate it, give the root
README the same treatment, and correct what's wrong. It is the verification
half of yesterday's session — the half yesterday's session could not do,
because the merges had not landed yet.

## What We Did (blow-by-blow)

1. **Established the drift window.** `git log` on both docs gave `e0add93` as
   the last commit that touched either one. Everything in `e0add93..HEAD` is
   candidate drift. The window turned out to contain **9 code commits** (the
   refactors; merges and docs commits excluded).

2. **Extracted the removal checklist from those 9 commits** — the exact set of
   symbols whose disappearance could invalidate a doc citation:
   - **Removed functions (7):** `deletePhoto`, `listExtractions`,
     `getObservedMaxHr`, `getObservedMaxHrExcludingRun`, `getMonthlyTotals`,
     `fillZeroMonths`, `countNinaSessionMessages`.
   - **De-exported symbols (28):** 9 in `components/ui` (+ barrel trim),
     `ExtractionStatusState` / `PushSetupFallback` / `RunListRow` /
     `WeekDivider` from the app-side sweep,
     `AdminManifestEntry` / `AdminBatchRegisterResult` / `AdminManifestResult`
     from `ninaAlbumActions.ts`, and 12 type exports from
     `lib/admin/filetree.ts`.

3. **Checked the assignment's named suspect first — and falsified it.** The
   brief said to look at the "admin PhotoReference fix" (`6fe5f82`) as a
   same-day merge that might have invalidated references. It **predates the
   baseline**: already in the tree when the docs were last touched, already
   reflected in them. No drift possible from it — recorded as a falsified
   premise rather than chased further.

4. **Swept both docs against the checklist** (word-boundary greps per symbol,
   with every hit classified live-citation vs. prose/removed-framing), then
   existence-checked **all 70 file paths cited across both docs**, and verified
   every npm script name README documents against `package.json`.

5. **Fixed the hits** (one commit, `c643878`):
   - `architecture.md` F03 + §6: rewritten around the surviving
     `getObservedMaxHrRun` — Tanaka floor + `asOf` cutoff in SQL, which is how
     a run keeps itself out of its own HRmax resolution (R-3's
     self-exclusion) — with the removed pair *named as removed* rather than
     silently dropped, so the doc keeps its history.
   - `architecture.md` §4.2 invariant 1: the real three-member allow-list
     `{getRunByShareToken, isUniqueViolation, listActiveUserIds}` (which
     `7bd9b85` had shrunk from four), plus a note that admin reads live in
     `lib/admin/*` outside the one file the guard scans.
   - `architecture.md` §8: `/admin/photos` struck from the live-surfaces list —
     image-collection p2 (`746e454`) had purged that route into `/admin/nina`'s
     Image collection *before the doc was even written*, making this the one
     **pre-existing** error rather than same-day drift; §8 now says "five
     surfaces beyond the overview hub", and §13's 2026-09-10 redesign entry is
     stamped "**SHIPPED, route since merged**" with the pointer.
   - All three "v0.2.0" mentions → **v1.0.0** (architecture.md ×2, README ×1):
     `git tag` has no v0.2.0 and `CHANGELOG.md` has no such entry — Nina
     shipped inside v1.0.0.
   - README: "3,566 tests" (front page + Getting started) → **5,093**, measured
     by running the full suite today (265 files, 5,093 tests, all green,
     exit 0) rather than copied from anyone's summary; the Nina photo cap
     "six a day" ×2 → the `NINA_IMAGE_DAILY_CAP` env knob (default 30,
     `lib/nina/imagerecipe.ts:162`); "Seven tabs" → six (the chat-photos tab
     had merged into the Image collection).
   - `components/admin/AdminNav.tsx`: its header comment claimed "seven admin
     routes" over a six-entry array — one-word comment fix, caught because the
     README's "seven tabs" was traced to its source.
   - `architecture.md` Scale row re-measured 2026-09-12: 762 commits since
     2026-08-20 · 203 lib modules · 133 component files (non-test) · 265
     unit-test files / 5,093 tests.
   - The doc's header now says "Written 2026-09-11; drift-corrected
     2026-09-12", naming what invalidated what.

6. **Ran the gate** (below), then committed and stopped — worker mode, the
   coordinator owns the merge.

## Code / Design Details

**The mechanical gate, as run** — this is the part worth re-running after any
future doc synthesis:

- **Stale-string sweep, both docs:** `v0.2.0`, `six a day`, `6/day`, `3,566`,
  `Seven tabs`, `five surfaces:` — all clean after the fixes.
- **Removed-symbol citations:** the only remaining mentions of any of the 7
  removed functions are ones with **explicit removal framing** ("were removed
  as dead in the 2026-09-11 YAGNI sweeps"), which is the correct state — a
  current-state doc may name a dead symbol, but only to say it is dead.
- **Path existence:** 70/70 cited file paths exist.
- **prettier** clean on all three touched files.
- **AdminNav tests 18/18** after the comment fix (comment-only, but the suite
  owns the file's prose via source-scan tests, so it was run anyway).

**The §4.2 invariant-1 fix is the subtle one.** The old text said the
allow-list contained `getRunByShareToken`, `listActiveUserIds` "and the admin
console's operator reads (`requireAdmin()`)" — a plausible-sounding third
member that was never in the list. The guard `scripts/check-data-layer-invariants.mjs`
actually allow-lists `isUniqueViolation` (a pure predicate over an error
object) as the third entry, and `7bd9b85` had just shrunk the set 4 → 3. The
corrected text names the real three *and* explains where admin reads actually
live (`lib/admin/*`, outside the scanned file) — fixing the claim without
leaving the reader wondering how the admin console passes the guard.

**The F03/§6 HRmax fix preserves the history.** Rather than deleting the
mention, the rewrite says what the surviving `getObservedMaxHrRun` does (names
the run the peak came from; Tanaka floor + `asOf` cutoff in SQL = R-3's
self-exclusion by query shape) and states plainly that "the plain max() read
and the exclude-one-run variant it superseded were removed as dead in the
2026-09-11 YAGNI sweeps." Same pattern as §9's queries-history paragraph, which
gained a parenthetical mapping the removed functions to their fate.

**README's numbers are now measured, not inherited.** The 5,093 figure is not
yesterday's suite count minus the db sweeps — it is today's full-suite run
(265 files, 5,093 tests, green, exit 0). The component-test sessions had
raised the count from 3,566; the db YAGNI sweeps then lowered it; only a fresh
run answers both.

## Decisions & Trade-offs

- **Fix in place, don't rewrite.** The corrections are surgical hunks; the
  doc keeps its 622-line structure and its history (removed things are named
  *as removed*). A second full synthesis would have cost far more and lost the
  drift story.
- **Name the falsified premise in the record.** `6fe5f82` was the
  coordinator's named suspect; recording that it predates the baseline is what
  stops the next auditor from re-chasing it.
- **Correct a pre-existing error while in the room.** `/admin/photos` in §8
  was not same-day drift — it was wrong from birth (`746e454` purged the route
  before the doc existed). Fixing it was in the spirit of the assignment even
  though it fell outside the strict drift window; §13's entry was stamped
  "SHIPPED, route since merged" rather than re-statused, keeping the plan
  record honest.
- **One comment word in a .tsx file** rather than a docs-only commit. The
  README's "Seven tabs" and AdminNav's "seven admin routes" describe the same
  array; fixing one and not the other would have left the lie in code.
- **Report, never merge.** Worker Mode W4 — coordinator `tokenmax-orch-2026-09-12`
  owns the landing.

## Follow-ups & YAGNI notes

- **`AdminNav.tsx`'s header comment carries more stale history than the one
  word fixed.** It still narrates the pre-responsive era in places. Candidate
  for a comment-only refresh *if anyone touches that file again* — not worth
  its own session.
- **The doc-wide lesson, stated so the next synthesis inherits it:** a
  "current-state" doc written mid-day on a heavy-merge day has a drift window
  measured in **hours**. The fix is not another careful read — it is the
  mechanical gate from this session: extract the day's diff, grep every
  removed symbol, existence-check every cited path. Cheap, and it converts
  "trust me, I re-read it" into a checklist.
- **Yesterday's other open follow-ups remain open** (`.workflows/plan/`
  cross-reference, same-commit updates when a cited constant changes). This
  session's assignment was the drift audit alone.

## Appendix

**Drift window:** `e0add93..HEAD` (baseline = last commit touching either
doc). Code commits in window: `422daa5`, `7bd9b85`, `3974079`, `6d9d6f8`,
`b7026d0`, `97e337a`, `eb93607`, `9b47833`, `84ae30f` — the 9 whose removals
form the checklist. Falsified suspect: `6fe5f82` (predates baseline).
Pre-existing error fixed in passing: `/admin/photos` (`746e454`, pre-baseline).

**Re-measured today:** 762 commits since 2026-08-20 · 203 lib modules · 133
component files (non-test) · 28 tables · 21 migrations · 265 unit-test files /
5,093 tests, all green · 7 bespoke CI guards · route handlers = seven + two.

**Commit (on `token-maxxing-2026-09-12-docs-architecture-readme-refresh`):**
```
c643878 docs: drift-correct architecture.md and README after the same-day dead-code sweeps
```
3 files changed, 43 insertions(+), 29 deletions(-) — `docs/architecture.md`,
`README.md`, `components/admin/AdminNav.tsx`.

**Merge status:** on worker branch, NOT merged — coordinator
`tokenmax-orch-2026-09-12` owns the merge to main (Worker Mode W4: report,
never merge).
