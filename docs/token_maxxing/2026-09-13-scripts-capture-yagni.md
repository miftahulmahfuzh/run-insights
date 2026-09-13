# Token-Maxxing Session — 2026-09-13: Scripts Capture YAGNI

## 🎯 Achievement / End Result
- **Goal of the burn:** Remove `scripts/`'s 4 knip-flagged unused exports —
  `ZONE4_FLOOR` (`scripts/capture/dataset.mjs`), `cookieNameFor`
  (`scripts/capture/session-cookie.mjs`), `MAX_BYTES`
  (`scripts/capture/webm-to-gif.mjs`), and `createdMs`
  (`scripts/nina-dedupe-plan.mjs`) — verifying `scripts/.workflows/package_readme.md`
  stays accurate afterward. This was a **coordinator-assigned idea**, not a
  self-picked one from a menu: the coordinator `tokenmax-orch-2026-09-13`
  dispatched this worker with the task pre-specified (slug
  `scripts-capture-yagni`), reasoning that this was fresh ground — knip's
  unused-exports report had never been swept at individual script-symbol
  granularity inside `scripts/` before.
- **Concrete changes:** One commit, `6d643d8`, 4 files changed, +4/−4 (each
  file: one line, the `export` keyword removed from one declaration):
  - `scripts/capture/dataset.mjs:45` — `export const ZONE4_FLOOR = 171` →
    `const ZONE4_FLOOR = 171`
  - `scripts/capture/session-cookie.mjs:31` — `export function cookieNameFor(origin)`
    → `function cookieNameFor(origin)`
  - `scripts/capture/webm-to-gif.mjs:35` — `export const MAX_BYTES = 2 * 1024 * 1024`
    → `const MAX_BYTES = 2 * 1024 * 1024`
  - `scripts/nina-dedupe-plan.mjs:77` — `export function createdMs(row)` →
    `function createdMs(row)`
- **Real value delivered:**
  - Closed out 4 of knip's standing unused-exports findings at a granularity
    (individual script-level symbols inside `scripts/`, not app/lib code) no
    prior session had swept — `scripts/` had received package-readme and
    dead-script audits before (2026-09-11 Scripts Package Hygiene, 2026-09-12
    Scripts Package-Readme Verification Pass) but never a symbol-level
    unused-export pass on the capture subtree.
  - Each of the 4 symbols was individually confirmed, by a repo-wide grep, to
    be used only inside its own defining file — so the correct fix was
    de-export (keep the logic, narrow its visibility), never deletion. Trusting
    knip's tool output without that per-symbol grep would have risked treating
    a "no external importer" finding as "delete the code," which is a
    different and riskier claim.
  - Verified `scripts/.workflows/package_readme.md` needed **no edit**: it
    describes the 4 touched scripts only at a behavioral/purpose level
    (`dataset.mjs` — 27 run specs; `session-cookie.mjs` — mints the demo
    user's Auth.js session cookie; etc.), never naming these 4 symbols or
    citing knip counts, so narrowing their export surface left every claim in
    the doc intact. A stale-doc risk was checked and closed as a non-issue,
    not skipped.
  - Full-suite verification disproportionate to the diff's size: targeted
    tests, `next typegen` + `tsc --noEmit` clean, and the entire 332-file /
    5,744-test vitest suite green — for a 4-line change, because a de-export is
    exactly the kind of "obviously safe" edit that is cheap to get wrong
    silently (a missed dynamic import, a test importing the symbol under a
    different alias) and the session's standing bar is proof, not confidence.
- **Branch:** `token-maxxing-2026-09-13-scripts-capture-yagni` (worker session
  of coordinator `tokenmax-orch-2026-09-13`)
- **Merge status:** on branch (commit `6d643d8` landed on this worker branch;
  merge into the coordinator's integration branch/`main` is the coordinator's
  step, not this worker's)
- **Approx token burn:** modest, ~150–250K — the diff is 4 one-line edits, so
  the burn is almost entirely verification: repo-wide grep per symbol, two
  targeted test files, full typecheck (including a fresh-worktree `typegen`
  run), and the full 5,744-test suite, rather than large reads or generation.

## Context & Motivation

This session is a worker under the parallel coordinator
`tokenmax-orch-2026-09-13`. Unlike a solo `/token-maxxing` session, there was
no menu of ideas generated and picked from here — the task arrived
pre-assigned from the coordinator: sweep 4 specific knip-flagged unused
exports inside `scripts/capture/` and `scripts/nina-dedupe-plan.mjs`, and
confirm the package readme doesn't drift as a result. The coordinator's stated
reasoning was that this was fresh ground: knip (adopted repo-wide 2026-09-12,
per prior session `2026-09-12-dead-export-tooling.md`) had been run broadly
across `lib/` and `components/`, but nobody had swept its findings inside
`scripts/` at this per-symbol granularity — the two prior `scripts/` sessions
(2026-09-11 Scripts Package Hygiene, 2026-09-12 Scripts Package-Readme
Verification Pass) were about the package map and README accuracy, not a
knip-driven export sweep.

Because this was assigned rather than chosen, there is no alternatives-considered
section in this doc — the idea, scope (exactly these 4 symbols, exactly this
verification), and the readme-accuracy check were all specified by the
coordinator up front.

## What We Did (blow-by-blow)

**1. Confirmed the flags.** Ran `npm run knip` and verified all 4 named
symbols actually appeared under "Unused exports," at the exact locations the
assignment named:
- `ZONE4_FLOOR` — `scripts/capture/dataset.mjs:45`
- `cookieNameFor` — `scripts/capture/session-cookie.mjs:31`
- `MAX_BYTES` — `scripts/capture/webm-to-gif.mjs:35`
- `createdMs` — `scripts/nina-dedupe-plan.mjs:77`

**2. Repo-wide grep per symbol, before touching anything.** Each of the 4
names searched across the whole repository (not just `scripts/`), including
test files. Each came back used only inside its own defining file. This
matters because knip's "unused export" only means "no importer we can see" —
it does not by itself distinguish "dead code, delete it" from "used locally,
just shouldn't be exported." The grep settled which of those two this was:
all 4 are live logic, called from within their own file, just never imported
elsewhere — so the correct action was removing the `export` keyword, not
deleting the declaration.

**3. Edited all 4 files** — one line each, removing only the `export` keyword,
changing nothing else about the declaration, its JSDoc comment, or its
callers:
- `scripts/capture/dataset.mjs` — `ZONE4_FLOOR` (a heart-rate zone-4 floor
  constant, still read by `dataset.mjs`'s own run-shape logic for
  `warmup_who`).
- `scripts/capture/session-cookie.mjs` — `cookieNameFor` (still called
  internally to select the Auth.js cookie name by origin scheme).
- `scripts/capture/webm-to-gif.mjs` — `MAX_BYTES` (still read by the same
  file's quality ladder for the per-GIF byte ceiling).
- `scripts/nina-dedupe-plan.mjs` — `createdMs` (still called by the same
  file's row-comparison logic; its neighbor `isOriginalRow` stayed exported
  since it has an external importer).

**4. Re-ran `npm run knip`.** All 4 symbols no longer appear in the
unused-exports list — the fix closed exactly the 4 findings it targeted, no
side effects on other findings.

**5. Checked `scripts/.workflows/package_readme.md` for staleness.** Searched
it for any mention of these 4 symbol names, knip counts, or unused-export
claims. Found none — the README describes `dataset.mjs`, `session-cookie.mjs`,
`webm-to-gif.mjs`, and `nina-dedupe-plan.mjs` only at the level of what each
script *does* (run-spec counts, cookie-minting purpose, GIF pipeline role,
dedupe-plan role), never at the level of which internal symbols are exported.
Verdict: **no README edit needed** — this was verified accurate as-is, not
silently skipped.

**6. Syntax-checked all 4 edited files** with `node --check` — clean.

**7. Ran the two most directly relevant test files** —
`tests/capture/dataset.test.ts` and `tests/nina.dedupeMedia.test.ts` — 120
tests passed, confirming neither the dataset zone logic nor the dedupe-plan
comparison logic broke when their symbols' export keyword was dropped.

**8. Ran `npx next typegen` then `npx tsc --noEmit`.** `typegen` was necessary
first because this is a fresh worktree (missing typegen artifacts produce
spurious `PageProps`/`LayoutProps`/`RouteContext` errors unrelated to this
change — a known artifact per the repo's worktree-hygiene memory). After
typegen, `tsc --noEmit` was clean — zero errors.

**9. Ran the full suite**: `npx vitest run` — 332 files, 5,744 tests, all
green.

**10. Committed as a single commit**, `6d643d8` —
`chore(scripts): de-export 4 knip-flagged unused exports` — 4 files changed,
4 insertions(+), 4 deletions(-), each a one-line `export` removal with no
other changes.

## Code / Design Details

The full diff (each hunk is a single-line change):

```diff
--- a/scripts/capture/dataset.mjs
+++ b/scripts/capture/dataset.mjs
@@
-export const ZONE4_FLOOR = 171
+const ZONE4_FLOOR = 171

--- a/scripts/capture/session-cookie.mjs
+++ b/scripts/capture/session-cookie.mjs
@@
-export function cookieNameFor(origin) {
+function cookieNameFor(origin) {

--- a/scripts/capture/webm-to-gif.mjs
+++ b/scripts/capture/webm-to-gif.mjs
@@
-export const MAX_BYTES = 2 * 1024 * 1024
+const MAX_BYTES = 2 * 1024 * 1024

--- a/scripts/nina-dedupe-plan.mjs
+++ b/scripts/nina-dedupe-plan.mjs
@@
-export function createdMs(row) {
+function createdMs(row) {
```

No JSDoc, logic, or call site changed in any of the 4 files — the existing
doc comments above each symbol (e.g. `ZONE4_FLOOR`'s "Zone 4's floor —
`warmup_who` fires when km 1's HR is at or above it" and `MAX_BYTES`'s
per-GIF ceiling rationale tying it to `docs/media/`'s 8 MB budget) were left
exactly as written, since they remain accurate for a module-private constant.

## Decisions & Trade-offs

**De-export, not delete.** knip's "unused export" signal only proves "no
external importer." Deleting on that signal alone risks removing live
internal logic. The repo-wide grep (step 2) is what actually licensed the
change — it proved each symbol is still called, just never imported — so the
correct action was narrowing visibility, not deletion. This distinction is
also the one the project's own dead-export-sweep memory calls out as a
recurring verifier trap category.

**No README edit, verified rather than assumed.** It would have been easy to
either skip the README check entirely (the diff is "obviously too small to
need it") or to make a defensive edit just to show diligence. Instead the
README was actually searched for the 4 symbol names and for any unused-export
claims, and the negative result — no mention exists — was the basis for
leaving it untouched. This matches the project's convention (seen repeatedly
in prior scripts/lib readme sessions) of stamping volatile counts with their
measure date and not touching a doc that was never wrong in the first place.

**Full-suite verification for a 4-line diff.** Given the tiny diff size, a
narrower test run might have felt sufficient. The session ran the two directly
relevant test files first, then escalated to typecheck and the entire 5,744-test
suite anyway — because an export-visibility change is invisible to a
same-file test but can break a distant, unexpected importer (a dynamic
import, a barrel re-export, a test file with an unusual alias) that a
targeted run wouldn't catch. Given how cheap the full suite is to run
end-to-end compared to the cost of a silently broken build, the asymmetry
favored running it.

**Single commit, four files.** All 4 edits are the same kind of change
(remove `export`) verified by the same process, across otherwise-unrelated
files. Bundling them into one commit keeps the change's story — "the 4 knip
findings this session was assigned to close" — legible as one unit rather
than as 4 near-identical single-line commits.

## Follow-ups & YAGNI notes

- **Not attempted:** hunting for further knip findings beyond these 4 named
  symbols. The assignment was scoped to exactly these 4; a broader
  `scripts/`-wide knip sweep (if other findings remain outside the capture/
  and nina-dedupe-plan surfaces) is future work for a session actually scoped
  to it, not a scope-creep add-on here.
- **Not attempted:** re-exporting any of the 4 symbols for a hypothetical
  future external caller. YAGNI — if a future script needs `ZONE4_FLOOR`,
  `cookieNameFor`, `MAX_BYTES`, or `createdMs` from outside its current file,
  re-adding `export` is a one-line, fully reversible change; there is no
  reason to keep them exported "just in case."
- **Not attempted:** deleting the symbols outright. They are live internal
  logic (confirmed by the grep and by the passing tests exercising their
  behavior), so deletion was never the right move — recorded here explicitly
  so a future sweep doesn't re-litigate "why weren't these just removed."
- **package_readme.md** stays as-is; no follow-up needed there unless a
  future change actually alters one of these 4 scripts' documented
  behavior — the export-visibility change described here does not.

## Appendix

### Commands run

```
npm run knip                                    # confirmed 4 flags, then confirmed 0 after fix
grep -rn 'ZONE4_FLOOR\|cookieNameFor\|MAX_BYTES\|createdMs' .   # per-symbol repo-wide (run separately per symbol)
node --check scripts/capture/dataset.mjs
node --check scripts/capture/session-cookie.mjs
node --check scripts/capture/webm-to-gif.mjs
node --check scripts/nina-dedupe-plan.mjs
npx vitest run tests/capture/dataset.test.ts tests/nina.dedupeMedia.test.ts   # 120 tests passed
npx next typegen
npx tsc --noEmit                                 # clean
npx vitest run                                   # 332 files, 5744 tests, all passed
```

### Commit

- `6d643d8` — `chore(scripts): de-export 4 knip-flagged unused exports`
  (4 files changed, +4/−4)

### References

- [2026-09-11-scripts-package-hygiene.md](./2026-09-11-scripts-package-hygiene.md)
  — the prior `scripts/` package map this session's readme-accuracy check
  builds on.
- [2026-09-12-scripts-readme-compact.md](./2026-09-12-scripts-readme-compact.md)
  — the most recent prior verification pass over
  `scripts/.workflows/package_readme.md`.
- [2026-09-12-dead-export-tooling.md](./2026-09-12-dead-export-tooling.md) —
  the session that adopted knip as the repo's standing dead-export detector,
  the tool this session's sweep is built on.
