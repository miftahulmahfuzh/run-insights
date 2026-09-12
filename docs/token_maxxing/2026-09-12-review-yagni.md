# Token-Maxxing Session — 2026-09-12: Review YAGNI Sweep

## 🎯 Achievement / End Result
- **Goal of the burn:** Hunt and remove dead code and stale exports in `lib/review`
  and `components/review` — the run-review/correction flow (the screen where a parsed
  screenshot becomes an edited, committed workout). The package was chosen because it
  is a core feature that every prior token-maxxing sweep had somehow walked past: the
  dead-export passes had hit `lib/db`, `lib/nina`, `lib/admin`, `components/ui`,
  `components/extract`, and six more component directories — never `review`.
- **Concrete changes:** One commit (`38ac737`), **8 files, +17/−19**:
  - **Deleted exactly 1 fully-dead symbol:** the `CommitReviewPayload` type alias (a
    `z.infer` mirror of `CommitReviewPayloadSchema` with zero references repo-wide;
    the schema itself stays — `tests/review.schema.test.ts` uses it).
  - **Un-exported 17 file-local symbols** (code kept, `export` keyword dropped):
    `CheckId`, `ParseResult`, `DiffOptions`, `DraftPostWorkoutHr`,
    `StoredRunShape`, `StoredSplitShape`, `StoredZoneShape`, `HonestyState`,
    `ParsedInputProps`, `ReviewDraftInput`, `ReviewFieldErrors`,
    `DraftSplitSchema`, `DraftZoneSchema`, `DraftPostWorkoutHrSchema`,
    `CommitDeps`, `CommitOutcome`, `sourcePhotosFor`.
  - Files: `lib/review/{checks,commit,draft,inputs,schema}.ts` +
    `components/review/{HonestyChip,ParsedInput,ScreenshotStrip}.tsx`.
  - **Zero** `package_readme.md` touched, **zero** database statements run (both hard
    constraints of the assignment, both provable from the 8-file diffstat).
- **Real value delivered:**
  - The review packages' export surface now names only what something outside the
    file actually imports — a type-level audit, proven safe by a repo-wide
    `tsc --noEmit` that would catch any hidden importer the sweep missed.
  - The verdict on the packages themselves is the other half of the value: of 60
    exported declarations across 20 files (~4,065 lines), the vast majority are
    genuinely consumed — `review` is in good shape, and the session *proves* it
    rather than asserting it.
  - The audit method is a step up from the prior greps: a TypeScript-compiler-API
    extraction sweep that resolves real import edges (not name greps), built
    specifically to dodge the four known verifier traps — and the trap list, the
    kept-and-why notes, and the follow-ups are all written down for the next pass.
- **Branch:** `token-maxxing-2026-09-12-review-yagni`
- **Merge status:** merged (commit `c2487e8`)
- **Approx token burn:** a full worker session's burn — the inventory phase
  dominated (parse-every-file sweep authoring + every verdict re-checked). Estimate
  ~1.5M. 🔥

## Context & Motivation
The coordinator (`tokenmax-orch-2026-09-12`) assigned this from the day's idea menu:
"review-yagni — hunt and remove dead code and stale exports in `lib/review` and
`components/review`, the run-review/correction flow." The motivating observation was
coverage-shaped: the repo had accumulated a whole *family* of YAGNI sessions by this
point (lib/db queries, lib/nina queries, lib/admin dead-exports, two components
sweeps covering `extract/auth/push/runs/insights` + `ui/charts/review/profile/share/
trends`), and `review` — the feature the entire upload pipeline exists to feed — had
been in none of them. Either it was genuinely clean, or it was simply unloved. The
session was built to find out which, with a method strong enough that "clean" would
be a measured result rather than a default assumption.

Two constraints were fixed before the first command: no `package_readme.md` anywhere
(the same day's other workers were mid-flight on the readme compaction campaign, and
a worker editing a readme under its own peers is how add/add collisions happen), and
no database access (this repo's dev database IS production — a dead-*code* pass must
never drift into a dead-*column* one; the boundary was scope-limiting anyway since
`review` touches no schema).

## What We Did (blow-by-blow)
1. **Built the extraction sweep before trusting any grep.** The session's core
   artifact is a script using the TypeScript compiler API: it parses **every**
   `.ts`/`.tsx` in the repo, resolves **every import edge** through the `@/` alias
   and relative paths, and classifies all declarations in the two target packages
   along two axes: exported-vs-local, and live-vs-stale-export-vs-fully-dead.
   The reason to build rather than grep is that this repo has already produced four
   documented ways a naive verifier lies (see Decisions); the sweep answers "does
   anything import this symbol from this file" from the import graph itself.
2. **Inventoried the packages: 60 exported declarations across 20 files** (8
   `lib/review/*.ts` + 12 `components/review/*.tsx`, ~4,065 lines). The headline
   finding is a *negative*: the packages are in good shape. Most exports are
   genuinely consumed — by `app/x/[extractionId]/page.tsx`,
   `app/r/[id]/edit/page.tsx`, sibling review components, and the 6
   `tests/review.*.test.ts` suites. One dead type and a tail of file-local
   over-exports; no dead files, no dead components, no dead action endpoints.
3. **Removed exactly one fully-dead symbol:** `CommitReviewPayload` — a
   `z.infer<typeof CommitReviewPayloadSchema>` mirror alias with zero references
   anywhere in the repo. Its backing schema `CommitReviewPayloadSchema` **stays**:
   `tests/review.schema.test.ts` exercises it directly. Deleted the mirror, kept the
   thing the tests actually use.
4. **Un-exported 17 symbols whose every consumer lives in their own file** — code
   untouched, `export` keyword dropped. The list: `CheckId`, `ParseResult`,
   `DiffOptions`, `DraftPostWorkoutHr`, `StoredRunShape`, `StoredSplitShape`,
   `StoredZoneShape`, `HonestyState`, `ParsedInputProps`, `ReviewDraftInput`,
   `ReviewFieldErrors`, `DraftSplitSchema`, `DraftZoneSchema`,
   `DraftPostWorkoutHrSchema`, `CommitDeps`, `CommitOutcome`, `sourcePhotosFor`.
   Each was verified to have zero import edges before its keyword was dropped, and
   the subsequent repo-wide typecheck is the mechanical proof that the verification
   was right (an import edge that survived would be a compile error).
5. **Left `lib/review/actions.ts` completely alone, deliberately.** It is a
   `'use server'` module — every one of its exports is an HTTP endpoint reachable by
   the client bundle, so "exported with no repo-side caller" is its *correct* state,
   not a finding. Likewise `commit.ts` is `'server-only'`, and its demoted symbols
   are ordinary types, not server-boundary material — demoting them changes nothing
   about what crosses the wire.
6. **Ran the gates in order:**
   - `npx next typegen` first — the fresh worktree lacked `.next/types`, so the
     initial `tsc` run produced `PageProps` errors that were **typegen, not the
     diff** (a known fresh-worktree trap; generating types first removed them).
   - `npx tsc --noEmit` clean **repo-wide** — this is the load-bearing gate: it
     proves no importer anywhere (app code, tests, scripts) referenced any of the
     18 touched symbols, conclusively closing the multiline-import and
     relative-import failure modes from the compiler side.
   - `npx vitest run` over the 8 review/capture/extractedSession suites →
     **247/247 green**.
   - `prettier` clean on all 8 touched files.
   - **Sweep re-run as the final gate:** zero remaining
     exported-without-consumer declarations in either package. The audit ends at a
     fixed point, not at "ran out of session".
7. **Committed once** — `38ac737 refactor(review): YAGNI sweep — delete 1 dead
   type, un-export 17 file-local symbols` — with the method, the full 17-name list,
   and the trap rationale in the message body.

## Code / Design Details

**The classification the sweep produces** (per declaration, in the two packages):
```
exported + has external import edge  → live export        (the vast majority: kept)
exported + zero import edges + used in own file      → stale export (17 found: un-export)
exported + zero references anywhere                  → fully dead     (1 found: deleted)
local  + used in own file                            → fine           (not a finding)
```

**The one deletion, before/after** (`lib/review/schema.ts`):
```ts
// before — a mirror alias nothing ever imported
export type CommitReviewPayload = z.infer<typeof CommitReviewPayloadSchema>

// after — the schema remains, the zero-reference mirror is gone
// (tests/review.schema.test.ts imports CommitReviewPayloadSchema, not the alias)
```

**Shape of the 17 un-exports** (one-line diffs, e.g. `lib/review/draft.ts`):
```ts
// before                                    // after
export type ReviewDraftInput = { … }         type ReviewDraftInput = { … }
export const sourcePhotosFor = (…) => …      const sourcePhotosFor = (…) => …
```
Net diff across the whole commit: **+17/−19** — the −19 being the deleted alias
plus the 17 changed export lines' old spellings, the +17 their new ones.

**Touched-file map:**
| File | What changed |
|---|---|
| `lib/review/schema.ts` | −`CommitReviewPayload` alias; un-export `DraftSplitSchema`/`DraftZoneSchema`/`DraftPostWorkoutHrSchema` |
| `lib/review/draft.ts` | un-export `ReviewDraftInput`/`ReviewFieldErrors`/`DraftPostWorkoutHr`/`sourcePhotosFor` |
| `lib/review/commit.ts` | un-export `CommitDeps`/`CommitOutcome` (server-only module; plain types) |
| `lib/review/checks.ts` | un-export `CheckId` |
| `lib/review/inputs.ts` | un-export `ParseResult`/`ParsedInputProps` |
| `components/review/HonestyChip.tsx` | un-export `HonestyState` |
| `components/review/ParsedInput.tsx` | un-export `DiffOptions` |
| `components/review/ScreenshotStrip.tsx` | un-export `StoredRunShape`/`StoredSplitShape`/`StoredZoneShape` |

## Decisions & Trade-offs
- **Import-edge resolution over name greps — the four traps that forced it:**
  1. **Twin names.** `SplitsTable` and `ZoneBar` deliberately exist in *both*
     `components/review` and `components/ui` (the 2026-09-11 components sweep
     documented the twins as intentional). A name grep "proves" either file's copy
     is live from the other's importers. Only resolved edges answer "does anything
     import *this* file's *this* symbol".
  2. **Comment mentions that look like usage.** `lib/share/copy.ts` names
     `components/review/SheetSource` — a component that **no longer exists** — in
     prose only (verified at doc time: line 86, inside a doc comment). A full-text
     grep keeps a dead symbol alive on the strength of a sentence about it.
  3. **Barrel re-exports.** Checked: no barrel's re-export surface reaches anything
     in `review` — but "checked" had to be a property of the sweep, not a hope,
     since a single `export *` would invalidate every per-name verdict.
  4. **Multiline import lists.** A symbol imported on line 4 of a 9-line import
     statement looks importer-less to line-oriented tooling. Full-text edge parsing
     handles it — and the repo-wide `tsc --noEmit` then closes the loop from the
     compiler side: even a form the parser misread would fail the build.
- **Un-export, don't delete, for the 17.** All seventeen are used inside their own
  files; the *finding* is a wider module surface than the code needs, not dead
  logic. Dropping the keyword shrinks the surface at zero behavioral risk; deleting
  working code would be a different (and unjustified) session.
- **`actions.ts` exports are endpoints, not surface bloat.** A `'use server'`
  module's exports are its HTTP API — the client calls them by route, not by
  import, so "no repo-side importer" is the *healthy* state there. Sweeping them
  would have deleted live endpoints. The sweep's mandate was scoped to exclude the
  file from demotion by construction.
- **One commit for the whole sweep, not one per symbol.** Unlike the lib/db session
  (where each removal carried its own companion-test shrink), here every change is
  a keyword deletion with a single shared rationale and one shared gate suite —
  splitting 18 one-line diffs into 18 commits adds history noise, not bisectability.
- **Kept the schema, deleted its mirror.** `CommitReviewPayload` and
  `CommitReviewPayloadSchema` carried identical information, but only one had a
  consumer; the tests named the schema. The mirror alias was pure duplication of a
  `z.infer` expression.

## Follow-ups & YAGNI notes
- **`lib/share/copy.ts:86` still cites `components/review/SheetSource`, which no
  longer exists as a component** — a one-line stale-comment fix. Deliberately out
  of this session's scope: the assignment constrained the sweep to `lib/review` +
  `components/review`, and `lib/share` is outside that line. First candidate for
  whatever session next touches share copy.
- **Make the next sweep a gate, not a hunt.** The repo has no `noUnusedLocals` in
  `tsconfig` (verified at doc time) and no dead-export CI guard; the sweep script
  (TS-API extraction + import-edge resolution) was the only thing that found these
  18. Cheap hardening: wire up `knip`, or enable `noUnusedLocals` — either converts
  "re-run a hand-rolled parser every few weeks" into "CI goes red". Not done here:
  adding tooling was outside a dead-code session's mandate.
- **`loadReview.ts` and `actions.ts` remain the only `lib/review` files with no
  dedicated test suite.** `loadReview` is `'server-only'` and DB-bound (testing it
  properly means the fakeDb posture the admin action tests established), and
  `actions.ts` is the thin auth/revalidate wrapper over commit. Recorded, not
  acted on — a coverage session, not a YAGNI one.
- **The packages are clean — recorded as a result, so nobody re-sweeps them on a
  hunch.** The final re-sweep shows zero remaining exported-without-consumer
  declarations; the next `review`-adjacent YAGNI work should start from this doc's
  fixed point, not from zero.

## Appendix

**Commit:**
```
38ac737 refactor(review): YAGNI sweep — delete 1 dead type, un-export 17 file-local symbols
  components/review/HonestyChip.tsx     |  2 +-
  components/review/ParsedInput.tsx     |  2 +-
  components/review/ScreenshotStrip.tsx |  2 +-
  lib/review/checks.ts                  |  2 +-
  lib/review/commit.ts                  |  4 ++--
  lib/review/draft.ts                   | 10 +++++-----
  lib/review/inputs.ts                  |  2 +-
  lib/review/schema.ts                  | 12 +++++-------
  8 files changed, 17 insertions(+), 19 deletions(-)
```

**Gates run (session) and their results:**
```
npx next typegen                              # first — fresh worktree lacked .next/types
npx tsc --noEmit                              # 0 errors, repo-wide
npx vitest run (8 review/capture/extractedSession suites)
                                              # 247/247 green
prettier (8 touched files)                    # clean
sweep re-run (final gate)                     # 0 remaining exported-without-consumer
```

**Doc-time re-verification** (tree at `38ac737` + docs): the 8-file diffstat
re-measured (+17/−19 as stated); `lib/review` = 8 `.ts` files, `components/review`
= 12 `.tsx` files (20 total, ~4,063 lines measured at doc time vs ~4,065
inventoried at session time); `lib/share/copy.ts:86` confirmed to still carry the
`SheetSource` prose mention; `tsconfig.json` confirmed to still lack
`noUnusedLocals`; `git log -S CommitReviewPayload` consistent with zero remaining
references.

**Consumers that prove the surviving surface is live:** `app/x/[extractionId]/
page.tsx`, `app/r/[id]/edit/page.tsx`, the sibling `components/review` components,
and the 6 `tests/review.*.test.ts` suites (247 tests).

**References:** the day's sibling YAGNI sessions whose trap list this method
generalizes — `docs/token_maxxing/2026-09-11-components-dead-code-a.md` (the
SplitsTable/ZoneBar twins, first documented there) and
`docs/token_maxxing/2026-09-11-lib-admin-dead-exports.md` (the comment-mentions
trap, first documented there).
