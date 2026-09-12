# Token-Maxxing Session — 2026-09-12: Extract/Photos Package-Readme Creation (One Pipeline Map)

## 🎯 Achievement / End Result
- **Goal of the burn:** A WORKER session (slug `pkg-readme-extract-photos`) pre-assigned one
  idea by the coordinator (`tokenmax-orch-2026-09-12`), verbatim: *"Write one combined
  package_readme.md for lib/extract + lib/photos + components/extract (already swept via
  extract-photos-yagni) — the photo/extract upload pipeline has no standing map despite being
  a core user-facing path."* Why the coordinator picked it: a core user-facing path with no
  standing map, and among the day's candidate ideas docs give the highest
  defensible-value-per-token ratio.
- **Concrete changes:** 1 file, **+522 lines, one commit (`2397e88`)** — the NEW
  `lib/extract/.workflows/package_readme.md`: a standing map of the photo/extract upload
  pipeline, the repo's first doc that describes the whole pick → review path. Zero code
  changed; `lib/photos` and `components/extract` deliberately got **no** per-package copy
  (see Decisions).
- **Real value delivered:**
  - The pipeline now has its **end-to-end standing map** in one file: pick → pure plan
    (`planPicked`/`rejectionReason`) → browser compression at the measured 560-short-edge/q80
    recipe (via `resizeTarget.longEdgeTargetFor`, the short-edge trap) → direct browser→Blob
    PUT through a signed token minted by `/api/upload` (the server never sees bytes) →
    `POST /api/extract` → `202 { extractionId }` → `after()` job → JSON poll with backoff +
    the lazy stale-pending self-heal → `/x/[extractionId]` hand-off to the review screen —
    drawn as an ASCII flow with all ten steps' seams spelled out.
  - **15 standing rules/invariants** of the pipeline, each stated with its reason:
    `constants.ts` imports nothing (client half of the build); the recipe is a measurement,
    not a preference; the short-edge trap (`maxWidthOrHeight` clamps the LONG edge — a
    portrait screenshot fed 560 directly ships ~259 px wide, silent); kinds declared by the
    runner, never inferred; swap-never-subtract kind reassignment; no side effects inside
    state updaters (the measured F04 two-blob bug); `patchIfCurrent` drops superseded
    uploads; `/api/upload` never receives bytes and `getUserId()` is the whole boundary
    (`proxy.ts` deliberately skips `/api/*`); the wire contract validates what Vercel
    STORED (`SHOT_STORED_PATHNAME_RE`), not what was asked (`SHOT_REQUEST_PATHNAME_RE` — two
    regexes on purpose); the read side never re-parses vendor output; one JSON poll, not a
    stream (R-41 forbids fabricated progress); siblings-not-abstractions compressors; EXIF
    stripped with per-path reasons; segment `maxDuration` must be literals (build-time
    static analysis); ownership inside the read answering 404, not 403.
  - **The exported API of all three packages** documented from source: the full
    `constants.ts` vocabulary table (every tunable with its "why it is what it is" —
    `DEFAULT_KIND_BY_INDEX` deliberately a literal, never an alias of `SCREEN_KINDS`;
    `JOB_DEADLINE_MS` 55 s / `PRIMARY_TIMEOUT_MS` 45 s / `REPAIR_TIMEOUT_MS` 36 s /
    `MIN_REPAIR_BUDGET_MS` 28 s including the honest Hobby implication that the repair is
    usually skipped by design; `STALE_PENDING_MS` = 90 s serving BOTH the client give-up and
    the server self-heal on purpose), the pure-function signatures (`planPicked`,
    `reassignKind`, `rejectionReason`, `isStalePending`/`readExtractionResult`,
    `longEdgeTargetFor`, `contentHashOf`, `stepIndex`/`decideSwipe`,
    `chooseSaveStrategy`/`saveFilenameFor`), and the six `components/extract` exports with
    their contracts.
  - **The measured reverse-dependency table**: 29 importing files for `lib/extract`, 11 for
    `lib/photos`, 2 for `components/extract` — **measured 2026-09-12 at commit `6759f26`**,
    grouped by pipeline core / review-share surface / Nina family / UI family / strip-types
    scripts (which import by RELATIVE path because they cannot build an import graph) /
    tests — so the next session starts from data, not memory.
  - **The `lib/photos` "second family" split made explicit**: half the package serves this
    pipeline (`compressForExtraction`, `resizeTarget`), half serves paths that merely live
    in the same folder — `compressForNina`/`contentHash` serve Nina chat photos (and admin
    uploads, and the backfill scripts), `gallery`/`save` serve `PhotoViewer`'s overlay and
    save button. Documented as a per-module table because assuming "`lib/photos`" means
    "extraction photos" is named as the map's first trap.
  - **Test topology**: no component tests BY DESIGN (`vitest` runs `environment: 'node'`,
    `include` matches `*.test.ts` only) — which is why behaviour is extracted into `lib/` as
    pure functions, proved in `tests/extract.*` suites, and the components carry
    comment-stripping text-scan tests (`tests/extract.onPickPurity.test.ts` asserts purity
    for EVERY `setTiles` call — strictly stronger than one rendered scenario).
  - **A failure map** (11 rows: pick/compress/token-mint/PUT/submit/job/invocation-death/
    poll × where it surfaces × aftermath) and a **Gotchas** section (never "simplify" 560
    into the compressor; never re-alias `DEFAULT_KIND_BY_INDEX`; two distinct `KindHolder`
    interfaces on purpose; stored ≠ request regex; `onUploadCompleted` is observability,
    never a writer; `STALE_PENDING_MS` is one number with two jobs; hash claims are gated,
    not normalised; the repair path is rationed, not broken).
- **Branch:** `token-maxxing-2026-09-12-pkg-readme-extract-photos` (the worker's own
  worktree; branch tip `2397e88`)
- **Merge status:** merged (commit `1a0cd03`)
- **Approx token burn:** est. ~0.6M, input-dominated 🔥 — the burn went into reading all 20
  files of the three packages IN FULL, the 4 route/page files at the seams, and the wire
  schema before writing a word, then re-verifying every claim (including two
  neighbor-sourced numbers re-checked in `lib/nina/images.ts`). Includes the first
  attempt's burn, lost to a transient API 429 before anything was written (retried clean —
  see Context).

## Context & Motivation
The 2026-09-12 token-maxxing day ran as an orchestrated fan-out: coordinator
`tokenmax-orch-2026-09-12` spawning worker sessions on per-session branches, each handed a
pre-assigned idea (no menu in worker mode). This worker's assignment was the one pipeline-shaped
gap left in the doc set.

The gap was specific and structural. The photo/extract upload path — the app's front door:
pick 1–3 Apple Fitness screenshots, have them read into a run — cuts across THREE directories
with no single owner: `components/extract` is what the runner taps, `lib/photos` turns each
pick into the exact bytes the vision model was scored on, and `lib/extract` is the
dependency-free vocabulary the whole path speaks plus the server-side read that publishes the
result. The same day's `extract-photos-yagni` sweep had already certified the code
(22 verdict rows, ~36 dead lines removed out of ~2,343), which proved the packages were alive
and tight — but left them UNMAPPED. A reader opening any one of the three directories alone is
missing the contract that makes the other two correct (the measured recipe, the two pathname
regexes, the 90 s double-duty threshold, the swap-never-subtract rule), and none of that
existed anywhere except scattered across plan files and source docstrings.

The economics matched the day's pkg-readme theme (six prior sessions compacted existing
readmes; this one CREATED the missing one): a context-loader hands package readmes to every
future task in the package, so an absent map is paid as re-derivation cost on every
extract/photos task, forever.

Session reliability note, recorded because it shaped the timeline: the first run of this
session died on a transient API 429 **before writing anything**. The coordinator re-sent the
assignment and the retry ran clean from zero — no partial state to reconcile, which is the
quiet upside of dying pre-work.

## What We Did (blow-by-blow)
1. **Read everything before writing anything.** All 20 files across the three directories in
   full — `lib/extract` (constants, planPicked, reassignKind, rejectionReason, readExtraction),
   `lib/photos` (compressForExtraction, compressForNina, contentHash, gallery, resizeTarget,
   save), `components/extract` (UploadPicker, KindSelector, useExtractionStatus,
   ExtractingSkeleton, ExtractionGate) — plus the 4 seam files the pipeline crosses
   (`app/upload/page.tsx`, `app/api/upload/route.ts`, `app/api/extract/route.ts`,
   `app/api/extract/[id]/route.ts`, `app/x/[extractionId]/page.tsx`) and the wire schema
   (`lib/schema/extractionResult.ts`).
2. **Cross-checked every claim against source as it went** — no claim written from memory or
   from a prior session's docs. The two numbers the map quotes from a NEIGHBOUR (Nina's 768 px
   short edge / q75 recipe, cited because `compressForNina` imports them from
   `lib/nina/images.ts`) were re-verified in that file rather than trusted (`NINA_CHAT_TARGET_SHORT_EDGE_PX = 768`,
   `NINA_CHAT_TARGET_QUALITY = 0.75`, header comment confirms the design rationale).
3. **Measured the reverse-dependency table by verification grep, not recall**: 29 importing
   files for `lib/extract` (all via `@/lib/extract/…` submodule paths — no barrel exists),
   11 for `lib/photos`, 2 for `components/extract` (`app/upload/page.tsx` and
   `app/x/[extractionId]/page.tsx` — terminal consumers, not a library). Each importer list
   was produced by grep at `6759f26` and then classified (pipeline core / review-share
   surface / Nina family / UI family / strip-types scripts / tests), with the strip-types
   scripts' RELATIVE-path imports called out because they cannot build an import graph — and
   `scripts/shipped-image-recipe.py` noted as RE-implementing `longEdgeTargetFor` as literals
   rather than importing (a Python host cannot import TS), a mirror documented at both ends.
4. **Chose the host and defended it in the doc itself.** `lib/extract` hosts the file because
   it is the hub every other file in the map imports from. The doc's opening section states
   the "Why one map for three packages" rationale and records that `lib/photos` and
   `components/extract` deliberately have NO readme of their own — two maps of one pipeline
   would drift.
5. **Wrote the 522-line doc** in the house style established by `lib/nina`'s and the root
   package_readme: dense, invariant-first, every volatile number stamped with its measure
   date + commit ("measured 2026-09-12 at `6759f26`" in the reverse-deps header; "re-read
   from the tree at commit `6759f26` on this date" in the file header). Structure: Why one
   map → Overview → the standing map (ASCII flow + 10 annotated steps) → 15 standing rules →
   the second family table → Exported API (per file) → Dependencies → Reverse dependencies
   (measured) → Test topology → Failure map → Concurrency → Gotchas → Notes/historical
   context (F04/F05 lineage plus the numbered fix sessions F16/F16b/F17/F18/F29/F33 and the
   media-dedupe phases that shaped today's shape).
6. **Gates:** prettier-clean (`npx prettier --check` on the new file — the repo's docs
   formatting gate). The diff touches no `.ts`, so typegen/tsc/vitest were not load-bearing,
   but the doc's build-time claims themselves cite the gates that enforce them (the
   `maxDuration` literal rule enforced by `next build`; `tests/extract.pollSchedule.test.ts`
   pinning the literal to `FUNCTION_MAX_DURATION_S`).
7. **Committed as `2397e88`** ("docs(extract): standing map for the photo/extract upload
   pipeline") on the worker branch and STOPPED — no merge, no push. Worker mode: the
   coordinator owns landing worker branches.

## Code / Design Details

**The one decision everything else follows — one map, not three.** The repo convention is one
`package_readme.md` per package directory, so the default shape for this assignment would have
been three files. The map's own header argues the alternative:

```
`lib/extract` hosts it because it is the hub: every other file in the map imports something from
it … `lib/photos` and `components/extract` deliberately have no readme of their own — two maps of
one pipeline would drift.
```

**The map's spine** (from the doc's ASCII flow): `/upload` → `UploadPicker.onPick` →
`planPicked()`/`rejectionReason()` (pure, `lib/extract`) → per-tile
`compressForExtraction()` → `longEdgeTargetFor()` (`lib/photos`; JPEG q80, SHORT edge 560,
web worker, EXIF stripped) → `upload()` `@vercel/blob/client` → `POST /api/upload` token mint
(`getUserId()` → `SHOT_REQUEST_PATHNAME_RE` → kind parsed → signed token 10 min; NEVER carries
bytes) → browser PUTs to Blob → "Read this run" → `POST /api/extract`
(`ExtractRequestSchema`: 1–3, distinct kinds, absolute Blob-host URL) → `202 {extractionId}`
→ `after()`: `runExtractionJob()` (one vision call → Zod → optional repair → terminal row) →
`/x/[extractionId]` server render → `readExtractionResult()` → pending? `ExtractionGate` +
`useExtractionStatus` (poll 2 s/3 s/5 s + stale self-heal) → terminal? `router.refresh()` →
`ReviewScreen` → committed run at `/r/[id]`.

**The design-centering number** the Overview states up front: the whole path is designed
around the extraction's **33.7 s measured median against Vercel Hobby's 60 s function
ceiling** — which is why the budgets are 55/45/36/28 s, why the repair is usually skipped by
design, why one JSON poll instead of a stream, and why the lazy self-heal exists at all
(`after()` has no resume; an invocation killed at the wall leaves `pending` forever, and
~17 runs a month cannot justify a queue).

**The second-family table** — the doc's answer to its own named first trap ("assuming
`lib/photos` means extraction photos"): six modules × serves-what × one-line contract, e.g.
`contentHash.ts` serves "Nina chat photos, admin uploads, backfill scripts" (sha-256 over
bytes exactly as stored, via `crypto.subtle` so browser/server/strip-types scripts agree;
failed claims stored as NULL — dedup silently inactive — never rewritten into shape), and
`gallery.ts` serves `PhotoViewer` (the double-modulo wrap in `stepIndex` because `%` keeps
the dividend's sign; the three `decideSwipe` rules that keep native pinch-zoom alive).

**Stamp discipline**, per the `package-readme-volatile-numbers-rot` memory: the file header
says every constant/signature/consumer/route was re-read at `6759f26` on 2026-09-12; the
reverse-deps section headline carries the same stamp; the doc states rules rather than
snapshot state wherever the two could diverge (e.g. it documents that the token's `kind` is
read by nothing *today* under R-1, framed as a trap for whoever makes that webhook a writer).

## Decisions & Trade-offs
- **One map hosted by the hub, zero per-package copies.** The load-bearing decision. Three
  readmes would have matched the directory convention but guaranteed three divergent
  descriptions of one contract — and the failure mode (compressor recipe, the two regexes,
  the 90 s threshold) is exactly the kind of quietly-forking invariant this repo keeps
  getting bitten by. Cost, accepted: a reader browsing `lib/photos/` finds no readme in that
  directory. Mitigation: the doc's header names the host and the reason, and the host package
  is the hub every map reader passes through anyway.
- **Read-then-write, all of it, before drafting.** 20 files + 4 seams + wire schema read in
  full before the first line of doc. The alternative (draft from the YAGNI session's verdict
  table, spot-check as you go) is faster and is exactly how neighbour-sourced numbers rot —
  the same-day `scripts-readme-compact` session's `head -12` lesson, and the reason the two
  `lib/nina/images.ts` constants were re-read rather than quoted from this morning's sweep
  doc.
- **Rules over state.** Following the house calibration ("write rules not state; stamp
  volatile counts"), the doc records the 15 *invariants* and the *reasons* the constants are
  what they are, not a snapshot of values that will drift — the values themselves live
  beside their measurements in `constants.ts`, and the doc points there. The one volatile
  table (reverse deps) carries its measure date + commit in its headline so the next reader
  knows precisely how much to trust it.
- **Scope discipline: document, don't fix.** Two out-of-scope ghosts were left exactly as the
  morning's sweep flagged them (the inherited `RECORD_ART_SMALL_SIZE`-class generator note is
  another set's finding; here, the plan file quoting the old exported `ContentHashInput`
  signature). The session's mandate was the map; repairs belong to whoever owns the cited
  artifact.
- **Report, don't merge.** The branch tip `2397e88` stands alone; landing is the
  coordinator's move. The doc records this explicitly so a future reader of the index knows
  where the authoritative copy lives after the merge.

## Follow-ups & YAGNI notes
- **None opened.** The assignment produced no follow-up backlog: the code was already swept
  clean the same morning (`extract-photos-yagni`), and the map documents existing behaviour
  rather than proposing change.
- **One deliberate non-goal, recorded in the doc itself:** it stays ONE map — future updates
  go to the `lib/extract` copy, never by forking per-package readmes. The doc's Notes section
  states this as the intent so the next editor doesn't "restore" the directory convention.
- **The doc will need its reverse-dep counts re-measured eventually** (29/11/2 at
  `6759f26`) — by design it says so in its own headline, so the staleness is self-declaring.

## Appendix

**Files touched:**
```
lib/extract/.workflows/package_readme.md | 522 ++++++++++++++++++++++++++++++++++
1 file changed, 522 insertions(+)
```

**Commit:** `2397e88` — "docs(extract): standing map for the photo/extract upload pipeline"
(branch `token-maxxing-2026-09-12-pkg-readme-extract-photos`, authored 2026-09-12 14:17 +0700).

**Verification performed:** all 20 files of the three packages read in full; the 4 seam
routes/pages + `lib/schema/extractionResult.ts` read; the two neighbour-sourced constants
re-verified in `lib/nina/images.ts` (768 / 0.75); reverse-dependency lists produced by
verification grep at `6759f26` and classified by family, not from memory; prettier --check
clean.

**Doc structure as landed (522 lines):** Why one map for three packages · Overview (the
33.7 s-vs-60 s design center) · The standing map (ASCII flow + 10 steps) · The standing rules
(15) · The second family (6-module table) · Exported API (constants table, 4 pure-function
signatures, photos signatures, components table) · Dependencies · Reverse dependencies
(measured: 29 / 11 / 2) · Test topology · Failure map (11 rows) · Concurrency · Gotchas (9) ·
Notes / historical context (F04/F05 + F16/F16b/F17/F18/F29/F33 + media-dedupe lineage).

**Session identity:** worker session `pkg-readme-extract-photos`, spawned by coordinator
`tokenmax-orch-2026-09-12` on 2026-09-12; branch
`token-maxxing-2026-09-12-pkg-readme-extract-photos`; final commit `2397e88`; not merged —
the coordinator lands worker branches. First run of this session died on a transient API 429
pre-work; the retry reproduced the assignment from the coordinator's re-send and completed
with no lost state.
