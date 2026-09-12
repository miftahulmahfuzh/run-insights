# Token-Maxxing Session — 2026-09-12: Pkg-Readme-Review — First Map of the Review Surface

## 🎯 Achievement / End Result
- **Goal of the burn:** A WORKER session (slug `pkg-readme-review`) pre-assigned one idea by
  the coordinator (`tokenmax-orch-2026-09-12`): write **one combined
  `package_readme.md` for `lib/review` + `components/review`** — 8 modules (1,915 lines) +
  12 components (2,147 lines), 4,062 lines as of 2026-09-12, one of the largest feature
  surfaces in the repo, already cleaned by `review-yagni` and closed-out by
  `review-followup-cleanup` earlier the same day, but **never mapped**. Why the coordinator
  picked it: the review surface is the wall between a model's guess and a stored fact — the
  only code path in the repo that creates `runs` rows — and a maintainability map is the
  cheapest way to make its joint invariants (the draft's shape = the screen's state = the
  wall's schema = the diff's key space) legible to the next session that has to touch it.
- **Concrete changes:** 2 files, +652/−2, one commit (`8af2412`) — the new
  `lib/review/.workflows/package_readme.md` (648 lines, the repo's **seventh** package
  readme and its first covering two directories), plus the root readme's package-readme
  index line updated six → seven packages, naming the combined review file.
- **Real value delivered:**
  - The surface's **ten standing rules** are now written down in one place instead of living
    as folklore across 20 files and 6 prior session docs: the server re-reads the baseline
    and the client nominates nothing; `requireUserId()` is line 1 and above every `try`
    (both it and the final `redirect()` signal by throwing `NEXT_REDIRECT` — neither may ever
    be caught); the wall validates the payload the browser sent and the four checks are
    **advice, never gates**; the save button is never pre-emptively disabled; `commit.ts` is
    the only creator of `runs` rows and the only writer of `reviewed_at` (R-1 — not even a
    placeholder row); `actions.ts` is the boundary and `commit.ts` everything real (the
    `'use server'` export constraint, `after()`'s unconditional `E468` outside a request
    scope); four pure modules re-run on every keystroke; the **honesty constraint** — a check
    may only implicate fields it can name; the corrections log is append-only and measures
    edits, not attention; `runs.source` is never rewritten by an edit.
  - The **commit pipeline's order of operations, with the why attached to each step** —
    re-read baseline → wall-validate → one-batch write → corrections log →
    `onRunCommitted` — including why steps 4 and 5 sit deliberately outside step 3's
    transaction (a saved run with a missing log loses measurable signal; a log describing a
    run that does not exist lies about history — losing analytics beats lying), why the
    already-committed short-circuit answers with the run the caller already has
    (`ok`, `isNewRun: false`), and why Nina's reaction fires only when `isNewRun` (a run
    becoming real is the event; a post-review edit is not).
  - The **reverse-dependency map nobody had drawn**: `ReviewScreen` is the only component
    importing `lib/review/actions` (grep-verified before commit), exactly 9 of 12 components
    import `lib/review` (grep-verified), the two **source-reading overlay suites**
    (`tests/ui.photoViewer.test.ts`, `tests/nina.chatPhoto.test.ts`) assert against this
    package's *text* and will red on prose-level edits, `pwa.install`'s prose depends on the
    strip's top-inset geometry, and the `components/ui` twins (`SplitsTable`, `ZoneBar`) are
    read-only F08 presentations whose merge-with case was examined and rejected.
  - The carry-forward sections preserve the two same-day sessions' history with their commit
    shas (`review-yagni` `38ac737`, `review-followup-cleanup` `63bfbf6`/`644ec6c`) and the
    known gaps accepted in writing — see Follow-ups below for one of those carried claims
    that this doc session itself found to be stale-on-arrival.
  - The map is written as **rules, not state**: volatile counts (4,062 lines; 9 of 12) are
    stamped with their measure date, per the house rule that package-readme numbers rot.
- **Branch:** `token-maxxing-2026-09-12-pkg-readme-review`
- **Merge status:** on branch, **NOT merged** — worker session; the coordinator
  (`tokenmax-orch-2026-09-12`) owns landing worker branches (C7).
- **Approx token burn:** ~700k 🔥 — one full worker session dominated by reading all 4,062
  source lines of both directories in full, plus the two mounting pages, two prior session
  docs, two format-anchor readmes, reverse-dependency greps and an eight-suite test survey —
  then authoring the 648-line map.

**Honest boot note:** this worker went idle after launch **without doing any work** — the
coordinator pinged it, and the worker resumed from a clean tree at base and did the entire
job in the continuation. Nothing had been started and nothing was lost; the whole deliverable
is from the one continuation.

## Context & Motivation
The 2026-09-12 token-maxxing day ran as an orchestrated fan-out: a coordinator session
(`tokenmax-orch-2026-09-12`) spawning worker sessions on per-session branches, each handed a
pre-assigned idea. Earlier the same day, two sessions had passed over the review surface:
`review-yagni` (compiler-API export audit — 60 exported declarations across 20 files, one
dead symbol deleted, seventeen un-exported) and `review-followup-cleanup` (removed a
write-only passthrough field; wrote the last two missing suites, `loadReview` and `actions`).
Both left the code measurably clean — and both left **no map**. Every other major package had
gained a readme during the day's `pkg-readme-*` wave (root, `lib/db`, `lib/admin`,
`lib/nina`, `components/admin`, `components/nina`, `scripts`); the review surface was the
largest hole left.

The case for the readme was specific to what this surface *is*. `/x/[extractionId]` is where
an extractor's guess becomes a human-confirmed fact, and `/r/[id]/edit` is where that fact can
be corrected; `commit.ts` is the only code path that mints `runs` rows. Its invariants do not
live in any single file — the draft's zod shape is simultaneously the screen's state shape,
the wall's validation schema, and the correction diff's key space, so a change to one file
silently re-contracts three others. Unmapped, every future session touching it would have to
re-derive those joints from 4,062 lines; the readme makes them a 648-line load instead —
and, more importantly, makes the *rules* (checks are advice; the server owns the baseline;
`source` is never rewritten) findable at all.

## What We Did (blow-by-blow)
1. **(After the idle-and-ping.)** Resumed from a clean tree at base; confirmed the branch and
   that no prior work existed to salvage.
2. **Read all 20 source files in full.** The 8 `lib/review` modules — `draft.ts` (518),
   `checks.ts` (311), `schema.ts` (288), `commit.ts` (286), `inputs.ts` (195),
   `loadReview.ts` (136), `actions.ts` (113), `copy.ts` (68) = 1,915 lines — and the 12
   `components/review` components — `SplitsTable` (360), `MoreDetails` (292),
   `ReviewClient` (287), `ZoneBar` (285), `HeroFields` (251), `ScreenshotStrip` (173),
   `ParsedInput` (167), `RetryExtraction` (105), `ConsistencyBanner` (72), `HonestyChip`
   (64), `RawResponseDisclosure` (56), `ReviewScreen` (35) = 2,147 lines. No sampling; the
   map's claims are all first-hand reads as of 2026-09-12.
3. **Read the contract context around the surface:** both mounting pages
   (`app/x/[extractionId]/page.tsx`, `app/r/[id]/edit/page.tsx` — the source of the
   `maxDuration = 60` page-segment literal that governs the Server Actions' timeout) and the
   two same-day prior session docs (`2026-09-12-review-yagni.md`,
   `2026-09-12-review-followup-cleanup.md`) whose findings and follow-ups the readme had to
   carry forward accurately.
4. **Anchored the format** on the root readme and `lib/nina/.workflows/package_readme.md`
   (the newest house-style readme), then ran **reverse-dependency greps** — importers of
   `@/lib/review` and `components/review` across the repo — and surveyed the **eight**
   `tests/review.*.test.ts` suites' describe blocks (`actions`, `checks`, `commit`, `copy`,
   `draft`, `inputs`, `loadReview`, `schema`) for the test table.
5. **Wrote `lib/review/.workflows/package_readme.md`** (648 lines) — one combined readme for
   both directories: Overview; the ten standing rules; the two routes (with the
   maxDuration-literal contract); the `lib/review` module map; per-contract sections for the
   draft, the four checks (CHK-1..4 with their honesty constraint), the wall
   (`schema.ts`), inputs and the mask (`inputs.ts` + `ParsedInput.tsx`); the commit pipeline
   with its order-of-operations reasoning; the screen's per-component map; a dataflow
   diagram; dependencies; reverse dependencies (including the source-reading overlay suites,
   the `pwa.install` top-inset prose, and the ui twins); concurrency; an error-degradation
   table; performance; configuration; usage recipes (**adding a field to the draft**,
   **adding a consistency check** — the two changes the joint invariants make most
   dangerous); gotchas; the 8-suite test table; and Notes carrying the charter, the
   same-day history with commit shas, and the known gaps accepted in writing.
6. **Verified before committing:** `npx prettier --check` clean on both touched files; and
   the two riskiest "only/one" claims in the new doc grep-verified against the tree —
   `ReviewScreen` is the only component importing `lib/review/actions`, and exactly **9 of
   12** components import `lib/review`. Docs-only change: no code, no tests, no database
   access; `vitest`/`tsc` deliberately not run (nothing executable changed).
7. **Updated the root readme's package-readme index** (six → seven packages, naming the
   combined review file at `lib/review/.workflows/package_readme.md`).
8. **Committed as `8af2412`** ("docs(review): package_readme — map the lib/review +
   components/review surface", 2 files, +652/−2) and stopped — tree clean, no merge, no
   push; the coordinator lands worker branches.

## Code / Design Details

**The readme's shape** (headings as landed; 648 lines):
```
# Package: `lib/review` + `components/review` — the review surface
## Overview
## The standing rules of the surface      — the ten rules, numbered
## The two routes                         — /x/[extractionId], /r/[id]/edit; maxDuration contract
## Module map — `lib/review`              — 8 modules with sizes and roles
## The draft (`draft.ts`)
## The four checks (`checks.ts`)
## The wall (`schema.ts`)
## Inputs and the mask (`inputs.ts`, `ParsedInput.tsx`)
## The commit pipeline (`commit.ts` + `actions.ts`)
## The screen (`components/review`)       — per-component map, all 12
## Dataflow
## Dependencies
## Reverse dependencies                   — overlays, pwa.install prose, ui twins
## Concurrency
## Error handling                         — degradation table
## Performance
## Configuration
## Usage
  ### Adding a field to the draft
  ### Adding a consistency check
## Gotchas
## Tests                                  — the 8-suite table
## Notes
  ### Charter
  ### History                             — review-yagni 38ac737; followup-cleanup 63bfbf6/644ec6c
  ### Known gaps, accepted in writing
```

**The maxDuration-literal contract** (verified on all three page segments): a Server Action's
timeout is the **page segment's**, not the action's — `app/x/[extractionId]/page.tsx:45`,
`app/r/[id]/page.tsx:79` and `app/r/[id]/edit/page.tsx:41` each carry
`export const maxDuration = 60` with the Next.js doc quote in a comment. A new route mounting
these actions must copy the literal or inherit the platform default.

**The commit pipeline as documented** (order of operations, and why it is this order):
1. Re-read the baseline from the database (`runId` wins when both ids are present — an edit
   diffs against the run, never against the extraction that produced it three weeks ago).
2. Validate the submitted draft — the wall; envelope first, then draft, two parses.
3. Write run + splits + zones in ONE batch (`commitExtractedRun`, or `applyRunCorrections`
   with `source` stripped from the patch).
4. Append the corrections log — **deliberately outside step 3's transaction and after it**:
   the failure this ordering opens is a saved run whose log is missing events (measurable
   signal lost, no stored number wrong); the other ordering opens a log describing a run that
   does not exist. Failure here is logged, not raised.
5. Fire `onRunCommitted` — in `after()` by ruling; records first, then badges (the order
   lives in `lib/derived/invalidate.ts` and matters: badges read the records the recompute
   just wrote).

The already-committed short-circuit sits between 1 and 2 and **answers with the run they
already have** (`ok`, `isNewRun: false`, empty earned/moved arrays) — two tabs or a
double-tap on a slow connection becomes a no-op instead of the R-5 dedupe index's confusing
duplicate error. `DuplicateRunError` becomes a `status: 'duplicate'` state carrying the
existing run's id so the screen can link to it. Nina's reaction (F33 R8) is scheduled in the
action's `after()`, **only when `isNewRun`**, never awaited, and is handed
`recordsMoved`/`newlyEarned` from the invalidation pass rather than re-deriving them (a run
edited twice in a minute would otherwise mis-report); `occurredOnOf` returns `''` on
malformed shape rather than throwing inside `after` — an empty string says nothing about the
date instead of lying about it.

**The honesty constraint, as written** (rule 8): a check may only implicate fields it can
name. CHK-1 knows the splits disagree with the duration but not which row, so it flags the
block ("one of the 11 splits below looks off") — never row 7. Only CHK-4 names an exact
field, because it is row-specific by construction. Overclaiming precision teaches the
reviewer to trust a flag that lied about how much it knew.

**Reverse dependencies worth knowing before editing prose or geometry:** the overlay suites
`tests/ui.photoViewer.test.ts` and `tests/nina.chatPhoto.test.ts` read this package's source
as text and can red on comment edits; `pwa.install`'s prose describes the strip's top inset;
and the `components/ui` twins (`SplitsTable`, `ZoneBar`) are F08's read-only presentations —
merging them with F05's editable controls would put `editedPaths`/`onChange` into the run
detail page and R-30's pace bar into the review screen.

## Decisions & Trade-offs
- **One combined readme for two directories.** The charter section states the reason: the
  invariants only hold jointly across the halves — the draft's shape is the screen's state
  AND the wall's schema AND the diff's key space — so two separate readmes would each show
  half of every joint. Cost: one file serves two audiences (server-contract readers and
  screen editors); mitigated by the module map and the per-half sections.
- **Read everything first, then write.** All 4,062 lines were read in full before a claim
  was written, rather than sampling and grepping. For a first map of the surface whose whole
  point is cross-file joints, sampling is how you document one file's fiction about another.
  The cost is the session's token burn — that burn is the product.
- **Rules and contracts over narrative.** Following the root readme's post-compaction
  convention, the file contains no per-session changelog narrative: history is a three-bullet
  Notes section with commit shas pointing at the two same-day sessions' docs. The readme maps
  the standing truth; git and the session docs carry the stories.
- **Volatile counts stamped, rules unstamped.** Line counts and importer fractions carry
  "as of 2026-09-12"; the ten rules are written as invariants with their rationale so they
  survive refactors that invalidate any count.
- **Docs-only scope, held.** The session found at least one adjacent defect it did not fix
  (see the stale-on-arrival note below — the fix site is `lib/share/copy.ts`-adjacent prose
  in a file this session was forbidden to touch post-hoc and whose committed form is the
  coordinator's to land) and touched no code: the assignment was the map.
- **A verification budget, spent where claims were riskiest.** Two greps verified the only
  two "only/exactly" claims the doc makes about import topology (the claims a reader would
  act on structurally). The cheaper descriptive claims were left on first-hand reads. The
  miss (below) was exactly in the category the budget did not cover — a carried claim
  re-stated without a re-grep.

## Follow-ups & YAGNI notes
- **Stale-on-arrival claim in the committed readme (found while writing THIS session doc —
  fix on landing).** `lib/review/.workflows/package_readme.md` says in two places (the
  Reverse-dependencies section and Known gaps) that `lib/share/copy.ts:86` "**still** names
  `components/review/SheetSource` — a component that no longer exists." That was already
  false in the commit's own tree: `95c99e1` (the `ui-share-polish` worker, landed 13:08,
  an ancestor of this branch) repaired line 86 an hour before this readme was committed
  (14:21) — it now cites the symbol correctly: "`SheetSource` in
  `components/review/ScreenshotStrip.tsx`". The worker inherited the wording from the
  `review-followup-cleanup` session doc's known-gap without re-grepping that line; its two
  verification greps covered the import-topology claims instead. The repair is a two-line
  prose edit in `lib/review/.workflows/package_readme.md` (say: fixed by `95c99e1`; the
  keep-in-sync warning itself stands — `SheetSource` is a live export of `ScreenshotStrip.tsx`,
  and `PHOTO_ZOOM_HINT` still is not imported by it). Not fixed here: this doc session must
  not touch `lib/review`.
- **Carried known gaps, accepted in writing** (recorded in the readme's Known-gaps section):
  `components/review` has no rendered-component (happy-dom) interaction tests — the natural
  next target, with the mask/`ParsedInput` logic deliberately kept in pure modules until
  then; the check tolerances are seeded against one ground-truth fixture and the tightening
  mechanism (`getExtractionErrorProfile`) has no consumer yet; and the `knip`/
  `noUnusedLocals` adoption from the day's dead-export-tooling session remains the standing
  instrument against re-rot.
- **Not done, deliberately:** no importer-count arithmetic beyond the two verified claims
  (a full measured importer census like `lib/db`'s 60/72/90 was judged not worth its burn for
  a package with a handful of importers); no diagrams beyond the dataflow ASCII; no attempt
  to reconcile the readme's wording with the `ui-share-polish` session's findings (that
  reconciliation is the stale-on-arrival fix above).

## Appendix

**Files touched:**
```
.workflows/package_readme.md            |   6 +-
lib/review/.workflows/package_readme.md | 648 ++++++++++++++++++++++
2 files changed, 652 insertions(+), 2 deletions(-)
```

**Verification performed:** full first-hand read of all 20 source files (4,062 lines as of
2026-09-12) plus both mounting pages; reverse-dependency greps for `@/lib/review` and
`components/review` importers; describe-block survey of the eight `tests/review.*.test.ts`
suites; grep-verified before commit — `ReviewScreen` is the only component importing
`lib/review/actions`, and exactly 9 of 12 components import `lib/review`;
`npx prettier --check` clean on both touched files. Not run: `vitest`/`tsc` (docs-only diff;
nothing executable changed).

**Git evidence chain:** `38ac737` (`review-yagni` — the export audit whose results the
History section carries); `63bfbf6` + `644ec6c` (`review-followup-cleanup` — the write-only
field removal and the last two suites); `95c99e1` (`ui-share-polish` — repaired
`lib/share/copy.ts:86`'s SheetSource citation at 13:08, making the readme's "still names"
claim stale-on-arrival at 14:21); `8af2412` (this session).

**Measured surface facts behind the map (as of 2026-09-12):** `lib/review` — `draft.ts` 518,
`checks.ts` 311, `schema.ts` 288, `commit.ts` 286, `inputs.ts` 195, `loadReview.ts` 136,
`actions.ts` 113, `copy.ts` 68 (1,915 total). `components/review` — `SplitsTable` 360,
`MoreDetails` 292, `ReviewClient` 287, `ZoneBar` 285, `HeroFields` 251, `ScreenshotStrip`
173, `ParsedInput` 167, `RetryExtraction` 105, `ConsistencyBanner` 72, `HonestyChip` 64,
`RawResponseDisclosure` 56, `ReviewScreen` 35 (2,147 total). `maxDuration = 60` literals at
`app/x/[extractionId]/page.tsx:45`, `app/r/[id]/page.tsx:79`, `app/r/[id]/edit/page.tsx:41`.

**Session identity:** worker session `pkg-readme-review`, spawned by coordinator
`tokenmax-orch-2026-09-12` on 2026-09-12 (idle at launch, resumed on the coordinator's ping
with zero prior work); branch `token-maxxing-2026-09-12-pkg-readme-review`; final commit
`8af2412`; not merged (coordinator lands worker branches per C7).
