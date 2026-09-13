# Token-Maxxing Session — 2026-09-13: Repo-Wide Lint Sweep (Card.test.tsx Premise Already Shipped)

## 🎯 Achievement / End Result
- **Goal of the burn:** Assigned by the coordinator: fix the one recorded
  `react/no-unescaped-entities` lint pair in `components/ui/Card.test.tsx:90`,
  then run `npm run lint` and `npx tsc --noEmit` across the whole repo and fix
  any other **real** violations found (not speculative ones).
- **Concrete changes:** 17 files, +17/−87 lines, all warning-driven
  deletions/fixes — zero net new surface area:
  - Removed 7 dead test helpers / unused imports across
    `components/admin/explorer/{FolderTree,UploadQueue}.test.tsx`,
    `components/nina/SessionRow.test.tsx`,
    `components/review/{ParsedInput,ReviewClient,SplitsTable}.test.tsx`,
    `lib/nina/turn.test.ts`
  - Removed 1 unused mock param (`components/extract/UploadPicker.test.tsx`)
  - Added `alt=""` + a scoped eslint-disable to 4 `next/image` test mocks in
    `components/profile/{BadgeDialog,BadgeShelf,RecordDialog,RecordsTable}.test.tsx`
  - Removed 2 orphaned constants whose values were hardcoded elsewhere
    (`lib/nina/chrome.ts`'s `CHROME_CONTROL_PX`,
    `scripts/capture/dataset.mjs`'s `ZONE4_FLOOR`) and 1 unused type import
    (`lib/nina/proactive.ts`'s `NagDecision`)
  - Fixed a real swallowed-error bug in `lib/photos/compressForExtraction.ts`
    (caught `cause` was dropped; now chained via `new Error(msg, { cause })`)
  - Removed `scripts/capture/shoot.mjs`'s dead `shotOf()` helper and a stale,
    now-unused `eslint-disable-next-line no-new-func` directive
- **Real value delivered:**
  - Confirmed the one *named* defect (`Card.test.tsx:90`) was already fixed
    by an earlier commit — verified by git blame, not assumed — so no
    duplicate work was done on a stale premise.
  - Cleared the repo's entire `npm run lint` warning backlog: 22 → 0, with 0
    errors both before and after.
  - Told apart a real typecheck signal from a red herring: raw
    `npx tsc --noEmit` showed 17 errors, all `Cannot find name
    'PageProps'/'LayoutProps'/'RouteContext'` — a fresh-worktree missing
    `.next/types` artifact, not a real violation. `npm run typecheck` (which
    runs `next typegen` first) was 0 errors, confirming the correct proving
    gate per prior session precedent.
  - One of the 22 fixes was a genuine bug fix, not just lint-silencing: an
    error's `cause` was being dropped on the floor in
    `compressForExtraction.ts`, breaking the error chain for anyone
    debugging a compression failure.
  - Every deletion was verified dead by grep for other call sites before
    removal — no `--fix` autopilot, no speculative changes.
- **Branch:** `token-maxxing-2026-09-13-repo-lint-doc-fix` (worker session
  slug `repo-lint-doc-fix`, of coordinator `tokenmax-orch-2026-09-13`).
- **Merge status:** NOT merged at doc time — worker sessions never merge;
  landing belongs to coordinator `tokenmax-orch-2026-09-13`. Verify by git,
  not by this line.
- **Approx token burn:** est. ~0.2–0.4M — one full `npm run lint` pass, one
  `npm run typecheck` pass, 17 individual file reads + hand-edits each
  preceded by a grep for other call sites, a full `npm test` run (5744
  tests), and a `format:check` pass.

## Context & Motivation

This was a Worker Mode session spawned by the parallel coordinator
`tokenmax-orch-2026-09-13`; the idea was pre-assigned, not chosen from a
menu. The assignment named a specific, already-documented lint defect
(`Card.test.tsx:90`, `react/no-unescaped-entities`) plus a repo-wide
lint/typecheck sweep, on the reasoning that this is the direct
gofmt+lint maintainability catalog item and is cheap to verify — a green
lint run is unambiguous, unlike judgment calls about code structure.

## What We Did (blow-by-blow)

**1. Checked the named defect first, before running anything repo-wide.**
`components/ui/Card.test.tsx:90` was read directly, then `git blame -L 88,92`
on the file showed the `react/no-unescaped-entities` pair had already been
fixed by commit `41cbed7` — *"fix(ci): restore green CI — prettier
formatting and two lint errors"*, dated 2026-09-12. The assignment's named
premise was already shipped; nothing to do there. This was verified by git
history, not assumed from the absence of an obvious lint error in the
current file content.

**2. Ran `npm run lint` across the whole repo.** Result: 0 errors, 22
warnings. The warnings clustered into a few patterns: unused variables/dead
helpers in several test files and two `lib/` files, missing alt-text plus
`no-img-element` on four `next/image` test mocks, one stale unused
eslint-disable directive, and two unused vars in `scripts/capture/*.mjs`.

**3. Ran `npx tsc --noEmit` raw first, hit a false positive, diagnosed it
correctly.** The raw command reported 17 errors, every single one
`Cannot find name 'PageProps'` / `'LayoutProps'` / `'RouteContext'`. Rather
than treating these as real violations to fix, recognized the pattern
(Next.js 16 route-typegen artifacts) and checked: this fresh worktree had
no `.next/types` directory yet, because typegen had never run in it. Ran
`npm run typecheck` instead (which chains `next typegen && tsc --noEmit`)
— 0 errors once typegen populated the ambient types. Cross-checked this
against standing memory precedent ("Land worktree needs the union gate" /
"vitest does not typecheck — next build does") confirming `next typegen`
first is the correct proving gate for this repo, not a real defect to chase.

**4. Fixed all 22 real lint warnings by hand, one file at a time — no
`--fix` autopilot, because every one required a logic/dead-code judgment
call, not a mechanical rewrite:**

- `components/admin/explorer/FolderTree.test.tsx` — removed a dead `row()`
  helper, never called anywhere in the file.
- `components/admin/explorer/UploadQueue.test.tsx` — removed an unused
  `UploadPhase` type import.
- `components/extract/UploadPicker.test.tsx` — removed an unused `pathname`
  param from a `.mockImplementation`.
- `components/nina/SessionRow.test.tsx` — removed a dead `openMenu()`
  helper, superseded by direct `disclosure()` calls elsewhere in the same
  file.
- `components/profile/{BadgeDialog,BadgeShelf,RecordDialog,RecordsTable}.test.tsx`
  — added `alt=""` plus
  `// eslint-disable-next-line @next/next/no-img-element -- the mock, not a caller`
  to each file's `next/image` test mock, matching the exact precedent
  already established in `components/ui/DetailPanel.test.tsx`. Checked the
  real `DetailPanel.tsx`'s `<Image alt="" .../>` first to confirm the art in
  question is genuinely decorative before copying the pattern.
- `components/review/ParsedInput.test.tsx` — removed a dead
  `renderIntAt()` helper, superseded by `rerenderAt()`.
- `components/review/ReviewClient.test.tsx` — removed an unused `waitFor`
  import.
- `components/review/SplitsTable.test.tsx` — removed an unused
  `ReviewDraft` type import.
- `lib/nina/chrome.ts` — removed the orphaned `CHROME_CONTROL_PX` constant;
  its value (32) was hardcoded separately as `size-8` in a class string a
  few lines below, and the constant itself was referenced only in prose
  comments, never in code.
- `lib/nina/proactive.ts` — removed an unused `NagDecision` type import.
- `lib/nina/turn.test.ts` — removed a dead `windowTurn()` helper (leftover
  from a design where earlier turns were full `ConversationTurn` objects;
  current tests pass plain strings) and the now-unused `ConversationTurn`
  type import that only it needed.
- `lib/photos/compressForExtraction.ts` — the caught `cause` was being
  silently dropped on the floor; changed to `throw new Error(msg, { cause
  })` so the original error chains through instead of vanishing. This one
  is a real behavioral improvement, not just lint-silencing — anyone
  debugging a compression failure previously lost the root cause.
- `scripts/capture/dataset.mjs` — removed the orphaned `ZONE4_FLOOR`
  constant, same pattern as `CHROME_CONTROL_PX`: its value (171) was
  hardcoded elsewhere, and the constant was referenced only in comments.
- `scripts/capture/shoot.mjs` — removed a dead `shotOf()` helper
  (superseded by the `seek()` helper, never called) and a stale
  `// eslint-disable-next-line no-new-func` that ESLint itself flagged as
  no longer needed.

Every removal was preceded by a grep for other call sites in the repo to
confirm it was genuinely dead before deleting — none were removed on the
strength of the linter's say-so alone.

**5. Verified the full gate stack after the fixes:**
- `npm run lint` → 0 errors, 0 warnings.
- `npm run typecheck` → clean.
- Full `npm test` → 332 test files, 5744 tests, all passed.
- `npm run format:check` → clean.

**6. Committed as `6510770`** — *"chore: repo-wide lint sweep — clear all
22 eslint warnings"* — on this branch.

## Code / Design Details

### The false-positive typecheck trap
Running `npx tsc --noEmit` directly in a fresh worktree is not the correct
gate for this repo: Next.js 16 generates ambient route types
(`PageProps`/`LayoutProps`/`RouteContext`) into `.next/types` via `next
typegen`, and a worktree that has never run a build or `npm run typecheck`
has no such directory yet. Raw `tsc` then reports every route file's use of
these generated types as `Cannot find name`. The correct command is `npm
run typecheck`, which runs `next typegen && tsc --noEmit` in sequence. This
matches prior recorded precedent in this repo's history (typegen-before-tsc
as the proving gate) and was reconfirmed here rather than taken on faith.

### The one non-cosmetic fix
```ts
// lib/photos/compressForExtraction.ts — before
} catch (err) {
  throw new Error(msg); // cause dropped
}

// after
} catch (err) {
  const cause = err;
  throw new Error(msg, { cause });
}
```
This was found only because ESLint flagged the caught binding as unused —
the lint warning was a symptom of a real bug (a swallowed cause), not
merely an unused-variable nit.

### The orphaned-constant pattern (seen twice)
Both `CHROME_CONTROL_PX` (lib/nina/chrome.ts) and `ZONE4_FLOOR`
(scripts/capture/dataset.mjs) followed the identical shape: a named
constant whose numeric value had been separately hardcoded elsewhere in the
same file (a Tailwind class string, a literal), leaving the constant itself
referenced only from prose comments. Both were safe to delete outright
rather than "fix" by wiring the hardcoded literal back to the constant,
since re-wiring would have been unrequested scope creep beyond the lint
fix.

## Decisions & Trade-offs

**Fix by hand, not `--fix`.** All 22 warnings required a judgment call
(is this helper truly dead? does this alt-text choice match the real
component's intent? does dropping this constant lose information?) rather
than a mechanical rewrite ESLint's autofixer could safely apply. Hand-fixing
took longer but avoided the risk of `--fix` mangling a test mock or
silently deleting something with a non-obvious caller.

**Did not chase the `PageProps` "errors."** These looked alarming (17 of
them) but were correctly diagnosed as a missing-artifact false positive
in a fresh worktree, not a real defect — confirmed by running the
project's own documented typecheck script rather than patching `tsconfig`
or adding type declarations to silence them.

**Fixed the swallowed-`cause` bug as a real fix, not a suppression.**
Could have silenced the lint warning by prefixing the caught binding with
`_` or adding a disable comment; instead threaded the cause through
properly since the swallowed error was a genuine defect independent of
lint.

**Did not touch `Card.test.tsx`.** The assigned defect's premise no longer
held (already shipped by `41cbed7`), so making any edit there would have
been either a no-op or unrequested rewrite; left it untouched and recorded
the verification instead.

## Follow-ups & YAGNI notes

- None identified. This was a closed, self-verifying sweep: `npm run lint`
  and `npm run typecheck` are both unambiguous green/red signals, and both
  read green after the fixes. No speculative or partial fixes were left
  behind.
- Worker Mode note: no menu of 3–5 alternative ideas was generated this
  session — the idea was centrally assigned by coordinator
  `tokenmax-orch-2026-09-13`, so this doc records the assigned idea and its
  "Why" rather than a menu.

## Appendix

### Commands run
```
npm run lint                    → 0 errors, 22 warnings (before)
npx tsc --noEmit                → 17 errors, all PageProps/LayoutProps/
                                   RouteContext "Cannot find name" (false
                                   positive — no .next/types yet)
npm run typecheck               → 0 errors (next typegen && tsc --noEmit)
git blame -L 88,92 components/ui/Card.test.tsx
                                 → fixed by 41cbed7 (2026-09-12)
npm run lint                    → 0 errors, 0 warnings (after)
npm run typecheck                → clean (after)
npm test                        → 332 files, 5744 tests, all passed
npm run format:check            → clean
```

### Diff stats
```
6510770 — chore: repo-wide lint sweep — clear all 22 eslint warnings
 components/admin/explorer/FolderTree.test.tsx  |  4 ----
 components/admin/explorer/UploadQueue.test.tsx |  1 -
 components/extract/UploadPicker.test.tsx       |  2 +-
 components/nina/SessionRow.test.tsx            |  5 -----
 components/profile/BadgeDialog.test.tsx        |  3 ++-
 components/profile/BadgeShelf.test.tsx         |  5 ++++-
 components/profile/RecordDialog.test.tsx       |  3 ++-
 components/profile/RecordsTable.test.tsx       |  5 ++++-
 components/review/ParsedInput.test.tsx         | 13 ------------
 components/review/ReviewClient.test.tsx        |  2 +-
 components/review/SplitsTable.test.tsx         |  2 +-
 lib/nina/chrome.ts                             |  1 -
 lib/nina/proactive.ts                          |  2 +-
 lib/nina/turn.test.ts                          | 23 ---------------------
 lib/photos/compressForExtraction.ts            |  2 +-
 scripts/capture/dataset.mjs                    |  3 ---
 scripts/capture/shoot.mjs                      | 28 --------------------------
 17 files changed, 17 insertions(+), 87 deletions(-)
```

### Commits
- `6510770` — chore: repo-wide lint sweep — clear all 22 eslint warnings

### References
- `41cbed7` — fix(ci): restore green CI — prettier formatting and two lint
  errors (2026-09-12) — the commit that had already fixed the assignment's
  named `Card.test.tsx:90` defect.
- `components/ui/DetailPanel.test.tsx` — the pre-existing precedent this
  session's `next/image` mock fixes matched exactly.
