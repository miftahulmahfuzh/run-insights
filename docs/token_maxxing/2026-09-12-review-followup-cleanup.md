# Token-Maxxing Session — 2026-09-12: Review Follow-up Cleanup

## 🎯 Achievement / End Result
- **Goal of the burn:** Close the two named leftovers today's earlier sessions had
  *recorded but not acted on* — (1) the known write-only field `changedFieldPaths`
  on `RunChangeEvent`, and (2) the missing test coverage for `lib/review/loadReview.ts`
  and `lib/review/actions.ts`, the only two `lib/review` files with no dedicated
  test suite. Each had been deferred by its finder for a scope reason, not a
  judgement: the schema-misc-todos-archive dead-export sweep found `changedFieldPaths`
  write-only but its writer (lib/review) sat outside that sweep's assignment
  (lib/schema, lib/derived, lib/date, lib/flags); the review-yagni sweep recorded the
  two untested files but a YAGNI session is not a coverage session. This session's
  scope covers the writer, so both recorded findings could finally be closed.
- **Concrete changes:** Two commits on the branch:
  - `63bfbf6` refactor(review): drop the write-only changedFieldPaths off
    RunChangeEvent — **4 files, −14 lines, zero insertions** (`lib/derived/invalidate.ts`,
    `lib/review/commit.ts`, `tests/review.commit.test.ts`, `tests/derived.invalidate.test.ts`).
  - `644ec6c` test(review): cover loadReview.ts and actions.ts — **2 new test files,
    +557 lines, 25 new tests** (`tests/review.loadReview.test.ts` 311 lines / 13 tests,
    `tests/review.actions.test.ts` 246 lines / 12 tests).
- **Real value delivered:**
  - The one known write-only surface in the review flow is gone, with the R-7
    corrections log (the actual record of what moved) untouched — `commit.ts` still
    computes `Object.keys(corrections)` as that gate; only the unread pass-through
    COPY onto the invalidation event died.
  - Every `lib/review` file now has a dedicated suite; the two hardest-to-test files
    are covered under postures that test the real thing: `draft.ts`'s hydrators run
    FOR REAL (the mapping is the feature — stubbing them would let provenance rot
    while the suite stayed green), and the `'use server'` module is pinned including
    the redirect-throws contract and the scheduled-never-awaited Nina reaction.
  - The compiler-arbiter proof is on record: repo-wide `tsc --noEmit` clean after a
    REQUIRED-field removal is mechanical evidence no reader existed anywhere
    (app code, tests, scripts).
- **Branch:** `token-maxxing-2026-09-12-review-followup-cleanup` (HEAD `644ec6c`,
  tree clean)
- **Merge status:** on branch — NOT merged; worker session under coordinator
  `tokenmax-orch-2026-09-12` (slug `review-followup-cleanup`), which owns the merge (C7)
- **Approx token burn:** a full worker session — two-file census, two new suites
  authored against real fixtures, tsc rounds. Estimate ~1M. 🔥

## Context & Motivation
The coordinator pre-assigned this idea in place of a self-generated menu, and the
rationale is itself the interesting part: both leftovers were already *measured* by
earlier sessions the same day, and each was left open not out of disagreement but
out of scope discipline. The schema-misc-todos-archive sweep's census classified
`changedFieldPaths` as write-only and then had to leave it — its writer lives in
`lib/review`, outside the sweep's four-directory assignment, so acting on it would
have been exactly the cross-package drift the worker-mode fan-out exists to prevent.
The review-yagni sweep named `loadReview.ts` and `actions.ts` as "the only lib/review
files with no dedicated test suite" and likewise recorded rather than acted —
hunting dead code does not authorize writing coverage.

This session's assignment (`review-followup-cleanup`) covers the writer, so both
findings converted from "recorded" to "closed" with no re-verification needed beyond
a fresh census: the prior sessions had already done the measurement work, and the
doc trail (this repo's token_maxxing docs) carried the hand-off.

## What We Did (blow-by-blow)
1. **Census before the cut** (per the repo's dead-export memory: census per symbol,
   tsc as arbiter). Full-repo grep for `changedFieldPaths`: production hits were
   exactly the local const `commit.ts:162` (`Object.keys(corrections)`), its READ at
   `commit.ts:205` (the R-7 corrections-log gate `changedFieldPaths.length > 0`),
   the event-literal WRITE at `commit.ts:230`, and the required type declaration at
   `lib/derived/invalidate.ts:37`. The field's only readers anywhere were two test
   lines: `review.commit.test.ts:191` (an assertion pinning the passthrough) and the
   stub at `derived.invalidate.test.ts:27`. `onRunCommitted` reads only
   runId/userId/phase/occurredOn/previousOccurredOn; `insightScopesFor` reads three
   of those. Plan-copy and doc prose hits (`.workflows/plan/nina-chatbot/phase-10.md`,
   `docs/plans/archive/F05-review-correction.md`, two token_maxxing docs) were
   classified as prose and left untouched per the never-reword-plan-copies rule.

2. **Four-file coordinated removal.** The field is REQUIRED on `RunChangeEvent`, so
   type, writer, and both test readers had to move in one commit: dropped the field
   + its doc line from the interface, dropped the property from the `invalidate()`
   event literal (the local const SURVIVES — it is the gate for `recordCorrections`,
   R-7's actual log, which is untouched), narrowed the exact-match
   `toHaveBeenCalledWith` in `review.commit.test.ts`, and DELETED the one test whose
   entire purpose was pinning the removed passthrough ("passes the changed paths to
   onRunCommitted so F06/F09 know what moved" — F06/F09 demonstrably never read it).
   Narrowed the `derived.invalidate.test.ts` stub.

3. **Gates for the removal:** `npx next typegen` first (fresh worktree lacked
   `.next/types` — the known PageProps trap), then `npx tsc --noEmit` clean
   repo-wide (the compiler-arbiter proof that no reader remained anywhere: app code,
   tests, scripts), 42/42 across the two touched suites (was 43; the deleted
   passthrough test accounts for the difference), prettier clean. Verified from git,
   not the working tree: `git show HEAD:lib/derived/invalidate.ts | grep -c
   changedFieldPaths` → 0; `git show 63bfbf6:lib/review/commit.ts` → exactly 2 hits
   (const def + gate read); `git show HEAD:tests/review.commit.test.ts` → 0.

4. **Coverage: `tests/review.loadReview.test.ts` (13 tests).** Posture: queries
   stubbed via `vi.hoisted` + `vi.mock('@/lib/db/queries')`, but `draft.ts` runs FOR
   REAL — the mapping is the feature, so stubbing `hydrateDraftFromExtraction`/
   `draftFromRun` would let provenance rot while the suite stayed green. Fixtures
   reuse the TRUTH research fixture and the same `extractionRow`/`runDetail` shapes
   as `review.commit.test.ts`. Pins:
   - baseline provenance — first commit hydrates from `parsedSession` (= real
     hydrator output), later edits rebuild from stored run rows (= real
     `draftFromRun` output), with spot checks keeping the oracle honest:
     `distanceKm` 10.67, `startTime` '07:07' narrowed, `postWorkoutHr` positional
     [End 185, 1 MIN 162];
   - a failed extraction gets §8's blank draft through the SAME branch (no special
     case), and the blank's `occurredOn` (2026-08-21, Jakarta-today for the fixture
     NOW) doubles as the clock-passthrough proof;
   - ownership null answers BEFORE any second query (`listExtractionPhotos` and
     `getRunIdForExtraction` never called);
   - repaired hydrates like ok;
   - vendor JSON and corrections log carried BY REFERENCE (`toBe` identity —
     "never re-parsed, never inferred from");
   - `blobUrls ?? []` defensive guard on the notNull column, recorded with an honest
     double-cast;
   - `committedRunId` threading.

5. **Coverage: `tests/review.actions.test.ts` (12 tests).** Posture per
   `tests/share.actions.test.ts`: `'use server'` module under test via lazy
   `await import()` in `beforeEach`, all collaborators mocked (`requireUserId`,
   `next/cache` revalidatePath, `next/navigation` redirect, `next/server` after,
   `emitRunCommitted`, and `'@/lib/review/commit'` — which resolves the same module
   as actions.ts's `'./commit'` import). The redirect mock THROWS the
   NEXT_REDIRECT-shaped error the Next docs describe (checked against the bundled
   `node_modules/next/dist/docs` redirect/after pages per the repo's AGENTS.md rule),
   and success-path assertions require the action's promise to REJECT — pinning
   that neither redirect nor auth failures are ever caught. `after` is mocked as
   pure registration, so the test decides when the scheduled Nina reaction runs:
   - "scheduled, not awaited" pinned as an observed property (`emitRunCommitted`
     untouched at action-return time);
   - exactly one callback on `isNewRun`, NONE on a post-review edit;
   - the four `revalidatePath` calls ('/', '/trends', '/me', '/r/<id>') before
     `redirect('/r/<id>')`;
   - the reaction's exact payload (userId/runId/occurredOn read from the
     payload/recordKeys/badgeKeys), its success log, and its failure
     logged-never-thrown backstop;
   - `it.each` over three malformed payloads (null; no `draft.occurredOn`;
     non-string `occurredOn`) all reading as `occurredOn` '' rather than a throw
     inside `after`;
   - INVARIANT A: `requireUserId`'s `invocationCallOrder` strictly before
     `commitReview`'s, with the payload handed through raw (undefined passed
     straight to `commitReview`).

6. **Type-rigor tsc catches on the new tests (all fixed):** ASCII apostrophes in
   three test names broke string literals (fixed with the repo's typographic U+2019
   convention, as `review.commit.test.ts` already does — prettier's parse error
   named the line); declared-later consts (`corrections`, `blobUrls`) widened
   `phase`/`kind` to string outside contextual typing (fixed with
   `Extraction['corrections']` / `ExtractionBlobRefRow` annotations);
   `noUncheckedIndexedAccess` required `!` on `invocationCallOrder[0]` arguments to
   `toBeLessThan`; `CommitReviewState` `fieldErrors` values are `string`, not
   `string[]`.

7. **Final gates, run fresh on the committed tree:** next typegen ✓;
   `npx tsc --noEmit` exit 0 repo-wide; prettier clean on all five touched files;
   **197/197** across the nine review+derived suites (172 prior + 25 new —
   `tests/review.loadReview`, `review.actions`, `review.commit`, `review.checks`,
   `review.copy`, `review.draft`, `review.inputs`, `review.schema`,
   `derived.invalidate`). The 197 number was re-measured AFTER the last test edits
   (an earlier same-number reading predated three tsc-driven fixes and was re-run
   per verification-before-completion).

## Code / Design Details

**The write-only field, before/after** — the census found exactly one production
reader-shaped thing, and it was the gate for a DIFFERENT write:

```ts
// lib/review/commit.ts — the const SURVIVES (R-7's gate), only the copy died
const changedFieldPaths = Object.keys(corrections)   // :162 — kept
if (changedFieldPaths.length > 0) recordCorrections(…)  // :205 — kept (R-7 log)
onRunCommitted({ …, changedFieldPaths })             // :230 — REMOVED

// lib/derived/invalidate.ts:37 — REMOVED, with its doc line
export type RunChangeEvent = { … }  // (field was REQUIRED → 4-file coordinated move)
```

Removal was safe because the field's only consumers anywhere were two test lines —
`onRunCommitted` reads runId/userId/phase/occurredOn/previousOccurredOn, and
`insightScopesFor` reads three of those. The repo-wide `tsc --noEmit` after a
REQUIRED-field deletion is the mechanical form of that argument.

**The two coverage postures, side by side:**

| | `review.loadReview.test.ts` (13) | `review.actions.test.ts` (12) |
|---|---|---|
| Module under test | `lib/review/loadReview.ts` ('server-only', DB-bound) | `lib/review/actions.ts` ('use server') |
| Import posture | static, queries mocked via `vi.hoisted` + `vi.mock('@/lib/db/queries')` | lazy `await import()` in `beforeEach` (per `tests/share.actions.test.ts`) |
| What runs FOR REAL | `draft.ts`'s hydrators — the mapping is the feature | nothing beyond the action itself; all Next collaborators mocked |
| Key contract pinned | provenance split (parsedSession on first commit / stored rows on edits), by-reference vendor JSON + corrections log | redirect THROWS (success = rejected promise), `after` is scheduled-not-awaited, auth-before-commit (INVARIANT A) |
| Mock fidelity detail | fixtures reuse the TRUTH research fixture + `review.commit.test.ts` shapes | redirect mock throws the NEXT_REDIRECT-shaped error per the bundled Next docs |

**Touched-file map:**

| File | Commit | What changed |
|---|---|---|
| `lib/derived/invalidate.ts` | `63bfbf6` | `changedFieldPaths` field + doc line off the `RunChangeEvent` interface |
| `lib/review/commit.ts` | `63bfbf6` | field off the `onRunCommitted()` event literal (const + gate kept) |
| `tests/review.commit.test.ts` | `63bfbf6` | exact-match assertion narrowed; passthrough-pinning test deleted (−10 lines) |
| `tests/derived.invalidate.test.ts` | `63bfbf6` | event stub narrowed |
| `tests/review.loadReview.test.ts` | `644ec6c` | NEW — 311 lines, 13 tests |
| `tests/review.actions.test.ts` | `644ec6c` | NEW — 246 lines, 12 tests |

## Decisions & Trade-offs
- **Deleted, not kept-with-a-comment.** The write-only field's passthrough test was
  deleted outright rather than converted into a comment, because the R-7 corrections
  log (the actual record of what moved) keeps its own dedicated assertions in the
  same describe block; the invalidation contract does not need a second copy of
  that information.
- **The local const survives the removal.** It gates `recordCorrections` (R-7).
  Only the pass-through COPY onto the invalidation event died. Consequence worth
  recording: if a future feature ever needs "which fields moved" on the invalidation
  event, re-adding it is a one-liner at the write site — the data never left, only
  the unread copy did.
- **Real draft builders as oracle, not stubs.** Coverage that mocked
  `hydrateDraftFromExtraction`/`draftFromRun` would have tested the loader's
  field-name spelling against itself.
- **Tests written green-on-arrival** (characterization coverage, no implementation
  code): where the existing behavior was surprising it was pinned with a comment
  (the `blobUrls ?? []` guard on a notNull column; `occurredOnOf`'s
  empty-string-on-malformed contract). No TDD red-green was applicable — nothing
  new was implemented; the suites' wiring is proven by named-value assertions and
  by the redirect-throws tests, which would fail vacuous no-ops via
  `scheduledReaction()`'s own `calledTimes(1)`.
- **`runDetailRow` fixture deliberately mirrors `review.commit.test.ts`'s
  post-review-edit block** so both suites describe the same run.

## Follow-ups & YAGNI notes
- **`lib/share/copy.ts:86` still cites the nonexistent `components/review/SheetSource`**
  — carried from review-yagni; still open.
- **Wire `knip` or `noUnusedLocals`** so dead-export sweeps are CI gates, not
  hand-rolled parser reruns — carried from review-yagni; still open.
- **Re-adding "which fields moved" to the invalidation event, if ever needed, is a
  one-liner at the write site** — `commit.ts` still computes
  `Object.keys(corrections)` for the R-7 gate, so the data never left; only the
  unread copy did.
- **All `lib/review` files now have dedicated suites;** the next natural
  review-adjacent coverage target would be `components/review` interaction tests
  (unexamined by this session).

## Appendix

**Commits:**
```
644ec6c test(review): cover loadReview.ts and actions.ts — the two untested lib/review files
  tests/review.actions.test.ts    | 246 ++++++++++++++++++++++++++++++
  tests/review.loadReview.test.ts | 311 ++++++++++++++++++++++++++++++++
  2 files changed, 557 insertions(+)

63bfbf6 refactor(review): drop the write-only changedFieldPaths off RunChangeEvent
  lib/derived/invalidate.ts        |  2 --
  lib/review/commit.ts             |  1 -
  tests/derived.invalidate.test.ts |  1 -
  tests/review.commit.test.ts      | 10 ----------
  4 files changed, 14 deletions(-)
```

**Gates run (session) and their results:**
```
npx next typegen                              # first — fresh worktree lacked .next/types
npx tsc --noEmit                              # exit 0, repo-wide (twice: after each commit's edits)
npx vitest run (2 touched suites, post-removal)   # 42/42 (was 43; −1 deleted passthrough test)
npx vitest run (9 review+derived suites, final)   # 197/197 (172 prior + 25 new), re-measured after last edits
prettier (all 5 touched files)                # clean
git show-based verification                   # invalidate.ts: 0 hits; commit.ts: 2 hits (const + gate); commit test: 0
```

**Provenance chain:** the finding being closed is recorded in
`docs/token_maxxing/2026-09-12-schema-misc-todos-archive.md` (the write-only
`changedFieldPaths`, listed among that sweep's keeps because its writer sat outside
the assignment) and `docs/token_maxxing/2026-09-12-review-yagni.md` (loadReview.ts
and actions.ts as the only untested lib/review files). The prose hits left untouched
during the census: `.workflows/plan/nina-chatbot/phase-10.md`,
`docs/plans/archive/F05-review-correction.md`, and two token_maxxing docs — never
reword plan copies.

**References:** `tests/share.actions.test.ts` (the `'use server'` test posture
reused for actions.ts); the bundled `node_modules/next/dist/docs` redirect/after
pages (the NEXT_REDIRECT throw shape); the TRUTH research fixture (loadReview's
baseline data).
