# Token-Maxxing Session — 2026-09-13: Nina Image Queries Audit

## 🎯 Achievement / End Result
- **Goal of the burn:** deeply read `lib/nina/queries/images.ts` (984 lines) and
  `lib/nina/queries/avatars.ts` (906 lines) — the two query modules that were *not*
  part of the 2026-09-13 turnflight/optional-prop sweep and had never been
  individually audited since their 2026-09-12 split out of the monolithic
  `queries.ts` — for dead code, YAGNI violations, and doc-drift against
  `lib/nina/.workflows/package_readme.md`.
- **Concrete changes:**
  - `lib/nina/queries/images.ts` — corrected one stale inline comment on the
    `contentHash` field inside `insertNinaMessageImages`.
  - No other source changes. No `package_readme.md` changes (its numeric claims
    were re-verified and held up).
- **Real value delivered:**
  - Found and fixed one confirmed, dated doc-drift bug: a comment claiming
    "No caller sends one yet" that had been false since 2026-09-10 (media-dedupe
    phase 2 landed a real caller) and survived un-corrected through the
    2026-09-12 file split.
  - Ran `npm run knip` and cross-checked every exported function in both files
    (≈18 in images.ts, ≈23 in avatars.ts) against the whole repo by hand:
    zero dead exports in either file — a clean bill of health that de-risks
    trusting this package's exports going forward.
  - Re-verified two package_readme.md numeric claims against the current tree
    (the 12-domain-module count under `lib/nina/queries/`, and the barrel's
    "85 runtime value exports" contract via `lib/nina/queries.test.ts`) — both
    still accurate, so no readme edit was needed.
  - Checked for recurrence of the same stale-comment failure pattern elsewhere
    in both files (three other "not yet" / "no caller" style claims) — all
    three still true today; this was an isolated line, not a systemic problem.
- **Branch:** token-maxxing-2026-09-13-nina-image-queries-audit
- **Merge status:** on branch (single commit `fix(nina): correct stale doc-drift
  comment in insertNinaMessageImages`, not yet merged to main as of this doc)
- **Approx token burn:** high — two full-file reads at 984+906 lines, a full
  829-line package_readme read, a repo-wide knip run, ~41 targeted export greps,
  and three verification test suites (52-file/1228-test full nina suite,
  targeted vitest, tsc/typegen). 🔥

## Context & Motivation
This was a coordinator-assigned idea in worker mode, not self-picked. The
coordinator's brief: `lib/nina/queries/images.ts` and `lib/nina/queries/avatars.ts`
were carved out of the old monolithic `lib/nina/queries.ts` on 2026-09-12
(see the `2026-09-12-nina-queries-split.md` session), and other Nina query
domains (turns, memory, shortcuts, etc.) had already gone through dedicated
knip/optional-prop/YAGNI sweeps in the days since — but these two specific
files, despite being large (984 and 906 lines) and central to Nina's photo
and avatar handling, had never individually been through that audit gauntlet.
The ask was a deep, line-by-line read of both, checked against knip and against
the package's own readme, to find whatever the earlier broader sweeps missed
by not focusing on these two files specifically.

## What We Did (blow-by-blow)
1. Read `lib/nina/queries/images.ts` in full (984 lines) — covers Nina's
   chat-image ingest path: inserting message images, content-hash-based
   dedupe bookkeeping, image metadata queries, and related helpers.
2. Read `lib/nina/queries/avatars.ts` in full (906 lines) — covers avatar
   upload/selection/history queries for both Nina's own face and user avatars.
3. Read the full `lib/nina/.workflows/package_readme.md` (829 lines) to get
   every claim this package makes about its own shape, including the
   12-domain-module breakdown under `lib/nina/queries/` and the barrel's
   stated "85 runtime value exports" contract.
4. Ran `npm run knip` across the whole repo. Result: zero unused-export
   findings in either `images.ts` or `avatars.ts`. All knip findings that
   session were in unrelated packages (`lib/llm`, `lib/records`, `lib/charts`,
   `lib/metrics`), confirming these two files carry no dead exports of their
   own — consistent with them being recently split out of already-audited code
   rather than long-neglected.
5. Went further than knip alone: for every one of the ~18 exported functions in
   `images.ts` and ~23 in `avatars.ts`, ran a targeted grep across the entire
   repository (not just the barrel or the test files) to confirm a real,
   non-test, non-barrel caller exists. All ~41 exports had live callers.
   Knip's silence was corroborated rather than taken on faith.
6. Spot-verified package_readme.md's numeric claims against the current tree:
   - Counted the domain modules under `lib/nina/queries/`: shapes, sessions,
     messages, images, memory, shortcuts, nags, turns, avatars, tuning,
     imageprefs, jobphotos = 12, plus `columns.ts` — matches the readme's
     stated module count.
   - Ran `lib/nina/queries.test.ts` directly to check the barrel's "85 runtime
     value exports" claim still holds structurally: passed 2/2.
7. While reading `insertNinaMessageImages` in `images.ts`, noticed an inline
   comment on the `contentHash` field reading "No caller sends one yet."
   This did not match what the surrounding dedupe logic implied, so it was
   run down with `git blame` / `git log`:
   - The comment was accurate when media-dedupe phase 1 landed the
     `contentHash` column (commit `b5c7702`) — at that point nothing populated it.
   - It became **false** on 2026-09-10 when media-dedupe phase 2 landed
     (commit `4478758`, `feat(nina): media-dedupe phase 2/4`):
     `lib/nina/dedupe.ts`'s `ninaUploadInsertRow` has sent a real content
     hash on every fresh-upload row insert ever since. `git blame` on that
     line in `dedupe.ts` dates it 2026-09-10 — three days before the stale
     comment was even split into its own file.
   - The false comment survived, "byte-identical," through the 2026-09-12
     file-split commit (`13072ab`) that moved the code from monolithic
     `queries.ts` into the new `queries/images.ts`. Nobody re-checked the
     comment's truth during the mechanical split.
8. Checked both files for other instances of the same failure shape
   ("not yet" / "no caller" / "nobody" style claims): found three more hits,
   read the surrounding code for each, and confirmed all three are still
   true today. So this was one isolated stale line, not a systemic pattern
   across the two files.
9. Fixed the one confirmed bug: replaced the stale comment with an accurate
   one naming `dedupe.ts`'s `ninaUploadInsertRow` as the real caller since
   phase 2, and noting that reference rows deliberately still carry no hash
   per that file's own documented rule (so the "still true" cases weren't
   touched — only the falsified one was).
10. Ran verification gates after the fix:
    - `npx vitest run lib/nina/queries.test.ts tests/nina.dedupe.test.ts` → 19/19 passed.
    - `npx next typegen && npx tsc --noEmit` → clean, zero errors (typegen was
      required first — a fresh worktree has no generated route types yet).
    - `npx vitest run --no-file-parallelism tests/nina` → full nina suite,
      52 files, 1228 tests, all passed.
    - `npx prettier --check` on the changed file → passed.
11. Committed as a single commit: `fix(nina): correct stale doc-drift comment
    in insertNinaMessageImages`.

## Code / Design Details
The fix touches only a comment, not behavior — `insertNinaMessageImages` in
`lib/nina/queries/images.ts` still inserts `contentHash` exactly as before.
Before:
```ts
// contentHash: no caller sends one yet — reserved for future dedupe use
```
After (paraphrased; see the actual diff in the commit for exact wording):
```ts
// contentHash: populated since media-dedupe phase 2 by dedupe.ts's
// ninaUploadInsertRow on every fresh upload row; reference rows still
// carry no hash by that file's own rule.
```
This is a pure documentation-truth fix: the runtime behavior (accepting and
storing whatever `contentHash` the caller provides, including `null` for
reference rows) was never wrong — only the comment describing who calls it
was.

## Decisions & Trade-offs
- Did not touch `package_readme.md`: its own numeric claims (module count,
  85-export barrel contract) were re-verified and held, so editing it would
  have been unearned churn. Only the inline source comment was wrong.
- Did not treat the three other "not yet true" phrasings as bugs — each was
  individually re-verified against current code and is still accurate, so
  leaving them alone was the correct call rather than a missed cleanup.
- Went beyond knip's own verdict (which only flags unused exports, not
  "used only by a barrel/test") by manually grepping every export's callers
  across the whole repo — this is what actually earns the "zero dead code"
  claim rather than just repeating knip's output.

## Follow-ups & YAGNI notes
- No YAGNI violations found in either file — both are lean, single-purpose
  query modules post-split, and nothing warranted trimming.
- No further action needed on these two files; this audit is a closed loop
  for now. Future work on Nina's image/avatar path can trust these files'
  doc comments and the package_readme's numeric claims as of 2026-09-13.

## Appendix
- Files read in full: `lib/nina/queries/images.ts` (984 lines),
  `lib/nina/queries/avatars.ts` (906 lines),
  `lib/nina/.workflows/package_readme.md` (829 lines).
- Commands run: `npm run knip` (repo-wide), ~41 targeted export greps,
  `git blame`/`git log` on the `contentHash` line and on `dedupe.ts`'s
  `ninaUploadInsertRow`, `npx vitest run lib/nina/queries.test.ts
  tests/nina.dedupe.test.ts`, `npx next typegen`, `npx tsc --noEmit`,
  `npx vitest run --no-file-parallelism tests/nina` (52 files / 1228 tests),
  `npx prettier --check`.
- Key commits referenced during investigation: `b5c7702` (media-dedupe phase 1,
  `contentHash` column added), `4478758` (media-dedupe phase 2, real caller
  added in `dedupe.ts`), `13072ab` (2026-09-12 file split that moved the stale
  comment into `queries/images.ts` unchanged).
- Resulting commit on this branch: `fix(nina): correct stale doc-drift comment
  in insertNinaMessageImages`.
