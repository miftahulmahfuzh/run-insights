# Token-Maxxing Session — 2026-09-12: Schema Misc Todos Archive

## 🎯 Achievement / End Result
- **Goal of the burn:** Close the coordinator-pre-assigned idea for the
  `schema-misc-todos-archive` worker session — a two-stream brief, both halves
  completed: (1) hunt and remove dead code in `lib/schema`, `lib/derived`,
  `lib/date`, and `lib/flags`, and (2) finish the todos-archival trilogy by
  archiving the four remaining `.workflows/todos.md` files under `scripts/`,
  `lib/db/`, `lib/admin/`, and `components/admin/` — **Why (verbatim):** the
  2026-09-12 session digest explicitly flagged that only 3 of 7 todos.md files
  had been archived so far. No idea menu was generated (Worker Mode); the
  coordinator `tokenmax-orch-2026-09-12` assigned the idea directly.
- **Concrete changes:** two commits, neither touching a `package_readme.md` nor
  the database (both named constraints honored; the sweep stayed strictly inside
  the four assigned lib dirs, the archival strictly inside the four named
  ledgers):
  - `f332d1a` — *refactor: drop 3 dead exports + 8 un-export self-only symbols
    in lib/schema, lib/flags, lib/derived* — 5 files (four of them the sweep
    targets, plus `lib/schema/extractedSession.test.ts` re-anchored), **+33/−66**.
  - `a1db572` — *docs(workflows): archive all 19 completed tasks across scripts,
    lib/db, lib/admin, components/admin* — 4 files, **+86/−368**.
- **Real value delivered:**
  - **Stream 1 — the dead surface of five modules measured, not guessed:** a
    census of **all 51 exports** across `lib/date/ranges.ts`,
    `lib/flags/copy.ts`, `lib/schema/extractedSession.ts`,
    `lib/schema/extractionResult.ts`, and `lib/derived/invalidate.ts`. Three
    exports removed outright — the headline being `emptyExtractedSession`,
    whose docstring claimed an F05 consumer **that never existed** (ReviewClient
    renders failed drafts via `lib/review/draft.ts`); plus `sectionForField`
    (self-unused, zero prod refs) and the `ExtractRequest` type (zero refs
    anywhere). Eight self-only symbols un-exported (TypeScript has no
    package-private, so `export` was their only privacy leak): `FlagCopy`,
    `ExtractedSplit` const+type, `ExtractedZone` const+type,
    `ExtractedSessionField`, `ALL_SESSION_FIELDS`, `fieldIsReachable`,
    `TERMINAL_STATUSES`, `InvalidateOutcome`. And one dead re-export hop cut
    (`export { SCREEN_KINDS }` from extractedSession — nobody imports it via
    that path; the `ScreenKind` type re-export stays).
  - **lib/date proven clean rather than skipped:** every export in
    `lib/date/ranges.ts` is consumed in prod — the sweep's null result for that
    module is itself a finding, recorded as such.
  - **The peer-grown trap list from memory applied as a checklist** — twin
    names, multiline import lists, reverse-edge re-export hops, source-as-text
    tests, self-licking seams, write-only fields — with every full import block
    of every consumer verified by a multiline-aware scan, not a line grep.
    Kept-as-recorded findings written down: `FLAG_CODES` +
    `EXTRACTION_ERROR_COPY` (documented test seams with live consumers),
    `RawExtractedSession`, `RunChangeEvent`, `InvalidateDeps`,
    `insightScopesFor` (out-of-scope test consumers), and `changedFieldPaths`
    (a write-only field whose writer `lib/review/commit.ts` and its pinning
    test both sit outside the sweep's scope — the trap list's own category).
  - **Stream 2 — the trilogy completed: 7 of 7 todos.md files now archived.**
    All 19 completed tasks across the four remaining ledgers (scripts **2**,
    lib/db **7**, lib/admin **4**, components/admin **6**) compressed to the
    root/components-nina/lib-nina convention: header stats updated, empty
    Active section, Completed pointer note, one-line Archive entries.
  - **Closure derived from git, not trusted from the files' own bodies** — the
    step that gave the archival its real value: `lib/db`'s P1-DB-A002 was
    listed **pending in Active** while the file's own header said 0 active;
    commit `7fb7f90` (merged via `27bfaa6`) is its completion, so lib/db's real
    Completed count is **7, not the 5 its header claimed**. lib/admin's real
    Completed is **4, not 3**. And scripts' P1-SC-A001 — its withheld
    production `--apply` flagged as an open question in the ledger — closed
    2026-09-11, with the apply runs **measured** (48/52 rows hashed, 17
    repointed, per the scripts package_readme), not assumed.
  - **Every still-open obligation survived compression as a line suffix:**
    lib/db A000/A001/A003's deploy-time migration verifications (no git record
    of them running), and lib/admin A001's ten manual browser checks.
    Gates: all 19 cited plan paths verified to resolve package-relative
    (19/19), `todos.py validate` green, and the per-entry `uniq -c` duplicate
    gate green — the binding dup gate, since validate collapses repeats as
    echoes.
  - **Full-suite honesty:** targeted vitest 10 files / 228 tests green;
    typegen + `tsc --noEmit` clean; eslint + prettier clean on touched files.
    The full-suite reds (components/admin MemoryTable add-row, 2 tests) were
    identified as the **known load flake** rather than diff regressions —
    intermittent across three runs (2 fail → 0 → 2), 20/20 in isolation, zero
    diff overlap.
- **Branch:** `token-maxxing-2026-09-12-schema-misc-todos-archive` (worker
  session of coordinator `tokenmax-orch-2026-09-12`, slug
  `schema-misc-todos-archive`, worktree
  `~/.worktrees/run-insights/tokenmax-2026-09-12-schema-misc-todos-archive`)
- **Merge status:** merged (commit `4a237d5`)
- **Approx token burn:** high — the burn went into the 51-export census with a
  multiline-aware full-import-block verification of every consumer, the
  test-re-anchoring rewrites, four-ledger git archaeology for closure dates,
  the 19-path plan-pointer resolution check, and a three-run flake
  characterization to keep the full suite honest. 🔥🔥

## Context & Motivation
This was a **worker session** of the `tokenmax-orch-2026-09-12` coordinator
(slug `schema-misc-todos-archive`): no idea menu — the coordinator pre-assigned
the idea with its Why already written, and the session's job was to execute both
halves within their stated boundaries.

The assigned idea verbatim: hunt and remove dead code in `lib/schema`,
`lib/derived`, `lib/date`, and `lib/flags`, AND finish the todos-archival trilogy
by archiving the four remaining `.workflows/todos.md` files under `scripts/`,
`lib/db/`, `lib/admin/`, and `components/admin/`. **Why:** the 2026-09-12
session digest explicitly flagged that only 3 of 7 todos.md files have been
archived so far.

That makes stream 2 the **fourth and final leg of the package-ledger archival
effort**, completing the set its predecessors started:

| Session | Ledger(s) | Result |
|---------|-----------|--------|
| 2026-09-11 `todos-root-archive` | `.workflows/todos.md` (root) | 844 → 84 lines, 41 archived |
| 2026-09-11 `todos-nina-archive` | `components/nina/.workflows/todos.md` | 6 archived (+ TaskID dedupe) |
| 2026-09-12 `todos-nina-lib-archive` | `lib/nina/.workflows/todos.md` | 703 → 90 lines, 35 archived |
| **this session** | **`scripts/`, `lib/db/`, `lib/admin/`, `components/admin/`** | **19 archived across 4 files, +86/−368 — 7 of 7 done** |

Stream 1 extends the 2026-09-11 dead-code campaign
(`lib-admin-dead-exports`, `components-dead-code-a/b`, `lib-db-queries-yagni`,
`lib-nina-queries-yagni`) onto the four lib dirs no prior sweep had covered.
Both streams are compaction-of-truth work: make what's dead visibly dead, and
make what's done visibly done.

## What We Did (blow-by-blow)

### Work stream 1 — dead-export sweep (`f332d1a`)
1. **Censused all 51 exports** across the four assigned modules' five files:
   `lib/date/ranges.ts`, `lib/flags/copy.ts`, `lib/schema/extractedSession.ts`,
   `lib/schema/extractionResult.ts`, `lib/derived/invalidate.ts` — every
   symbol enumerated first, then classified, rather than spot-checking
   candidates.
2. **Applied the peer-grown trap list from memory as the classification
   checklist:** twin names, multiline import lists, reverse-edge re-export
   hops, source-as-text tests, self-licking seams, write-only fields. Every
   full import block of every consumer was verified with a multiline-aware
   scan — the 2026-09-11 sessions' hard-won rule that a line grep both
   over-counts (comment quotes) and under-counts (wrapped import lists).
3. **Removed three dead exports outright:**
   - `sectionForField` (extractedSession) — self-unused, zero prod refs; its
     test block re-anchored to `FIELD_SOURCES`, the data that actually drives
     the rule, so the coverage survived the removal.
   - `emptyExtractedSession` (extractedSession) — the best find of the sweep:
     its docstring claimed an F05 consumer **that never existed** (ReviewClient
     renders failed drafts via `lib/review/draft.ts`). The test now pins the
     all-empty form as the raw schema's own default parse.
   - `ExtractRequest` (extractionResult) — a type with zero refs anywhere.
4. **Un-exported eight self-only symbols.** TypeScript has no package-private,
   so a module-internal helper's `export` keyword is its only leak. Un-exported
   with nothing deleted: `FlagCopy`; `ExtractedSplit` (const + type);
   `ExtractedZone` (const + type); `ExtractedSessionField`;
   `ALL_SESSION_FIELDS`; `fieldIsReachable`; `TERMINAL_STATUSES`;
   `InvalidateOutcome`.
5. **Cut one dead re-export hop:** `export { SCREEN_KINDS }` from
   extractedSession — nobody imports it via that path. The `ScreenKind` type
   re-export stays (it has consumers).
6. **Recorded the keep list rather than sweeping it under the rug:**
   `FLAG_CODES` + `EXTRACTION_ERROR_COPY` are documented test seams with live
   consumers; `RawExtractedSession`, `RunChangeEvent`, `InvalidateDeps`, and
   `insightScopesFor` have test consumers outside the sweep's scope; and
   `changedFieldPaths` is a **write-only field** — its writer
   (`lib/review/commit.ts`) and its pinning test both sit outside the four
   assigned dirs, so removing it would have breached the session's own
   constraint. All kept, all written down.
7. **Ran the gates:** Next typegen + `npx tsc --noEmit` clean (the arbiter for
   un-exporting, which line greps can't prove); targeted vitest 10 files /
   228 tests green; eslint + prettier clean on the five touched files.
8. **Characterized the full-suite reds instead of hand-waving them:** the
   components/admin MemoryTable add-row failures (2 tests) are the known
   parallel-load flake — intermittent across three runs (2 fail → 0 → 2),
   20/20 in isolation, zero diff overlap with this branch's files. Recorded,
   not chased.
9. **Committed as `f332d1a`** — 5 files, +33/−66, read off the `--stat`.

### Work stream 2 — todos archival trilogy completed (`a1db572`)
1. **Read the precedent docs first** (the 2026-09-11 root/nina sessions and
   2026-09-12's lib-nina one) and applied the established convention to all
   four ledgers rather than inventing a format: header stats updated, empty
   Active section, Completed section reduced to a pointer note, one-line
   Archive entries.
2. **Inventoried and archived all 19 completed tasks** — scripts **2**, lib/db
   **7**, lib/admin **4**, components/admin **6** — one line each, keeping
   TaskID, title, plan set + phase, and the bracketed plan path.
3. **Derived closure from git, not from the files' own bodies** — the step
   that separated real completion from ledger fiction:
   - lib/db's **P1-DB-A002 was listed pending in Active** while the file's own
     header claimed 0 active — an internal contradiction the file would have
     archived as two wrong facts. Commit `7fb7f90` (merged via `27bfaa6`) is
     its completion; archived, and the real Completed count is **7, not the
     header's 5**.
   - lib/admin's real Completed is **4, not the 3 its header said**.
   - scripts' **P1-SC-A001** had a withheld production `--apply` standing as
     an open question; it closed 2026-09-11, proven by **measuring** the apply
     runs (48/52 rows hashed, 17 repointed, per the scripts package_readme) —
     the memory rule that a sweep is verified by DB count, never its own
     summary, applied in reverse to close a task.
4. **Preserved the open obligations as suffixes** instead of letting
   compression orphan them: lib/db A000/A001/A003's deploy-time migration
   verifications (no git record of them running), and lib/admin A001's ten
   manual browser checks.
5. **Ran the archival battery:** all 19 cited plan paths verified to resolve
   **package-relative** (19/19 — the known pointer quirk, checked from each
   package's own base); `todos.py validate` green; the per-entry
   `grep | sort | uniq -c` duplicate gate green.
6. **Committed as `a1db572`** — 4 files, +86/−368, read off the `--stat`.

## Code / Design Details

**The three-treatment taxonomy every one of the 51 exports fell into** (the
sweep's real output is the classification, the diff is just the third bucket):

| Treatment | Count | Members |
|-----------|-------|---------|
| Removed outright | 3 | `sectionForField`, `emptyExtractedSession`, `ExtractRequest` |
| Un-exported (self-only use; TS has no package-private) | 8 | `FlagCopy`, `ExtractedSplit` (const+type), `ExtractedZone` (const+type), `ExtractedSessionField`, `ALL_SESSION_FIELDS`, `fieldIsReachable`, `TERMINAL_STATUSES`, `InvalidateOutcome` |
| Dead re-export hop cut | 1 | `export { SCREEN_KINDS }` from extractedSession (`ScreenKind` type re-export stays) |
| Kept — live in prod | — | everything else, incl. **all of lib/date** |
| Kept — recorded finding | 7 | `FLAG_CODES`, `EXTRACTION_ERROR_COPY` (documented test seams, live consumers); `RawExtractedSession`, `RunChangeEvent`, `InvalidateDeps`, `insightScopesFor` (out-of-scope test consumers); `changedFieldPaths` (write-only; writer outside scope) |

**The false-claim pattern, worth naming for the next sweep:** two of the three
removals were *documentation lies*, not just dead code. `emptyExtractedSession`'s
docstring cited an F05 consumer that never existed, and lib/db's ledger listed a
task pending that its own header said was done. In both streams, the file's own
prose was the least reliable source in the room — git and the import graph were
the arbiters.

**Diff shape:** `f332d1a` is 5 files, +33/−66 —
`lib/schema/extractedSession.ts` (−38-side heavy), `extractedSession.test.ts`
(re-anchored, not deleted), `extractionResult.ts`, `lib/flags/copy.ts` and
`lib/derived/invalidate.ts` (single-line `export` keyword removals each).
`a1db572` is 4 files, +86/−368 — components/admin −141-side, lib/db −157-side,
lib/admin −97-side, scripts −59-side.

## Decisions & Trade-offs
- **Kept `changedFieldPaths` despite it being write-only.** The trap list's
  write-only-field category fired, but the writer (`lib/review/commit.ts`) and
  its pinning test both sit outside the four assigned dirs. Removing it would
  have meant touching files the coordinator explicitly fenced off. Recorded as
  a finding for the session that owns that scope — constraint honored over
  tidiness.
- **tsc as arbiter for the un-exports.** Removing an `export` keyword is
  invisible to grep (the symbol's uses are all in-file); only the compiler
  proves no external importer breaks. `next typegen` + `tsc --noEmit` clean is
  the receipt.
- **Closure from git, counts from measurement.** The archival could have
  trusted each ledger's own header (lib/db's said 0 active and 5 completed —
  one of those was wrong too). Instead: completion = a mergeable commit
  (`7fb7f90` via `27bfaa6`), counts = reconciled against git, and scripts'
  withheld `--apply` closed only because the apply runs were **measured**
  (48/52 hashed, 17 repointed), per the scripts package_readme — the same
  never-trust-a-sweep's-own-summary rule the 2026-09-11 sessions paid for.
- **All four ledgers archived to 100% of completed tasks** (not the
  reorganize-todos skill's 80/20), matching every archival precedent in this
  series — the digest's premise ("only 3 of 7 archived") is exactly the state
  the 80/20 rule leaves behind.
- **Open obligations kept as suffixes, not dropped.** lib/db's deploy-time
  migration verifications and lib/admin's ten manual browser checks are
  unmeasurable from git (manual checks leave no commit); an archive line
  suffix is the one place they stay visible.
- **Full-suite flake recorded, not chased.** Reproducing on clean HEAD before
  attributing reds to a diff, then `--no-file-parallelism`/isolation for the
  verdict — the 2→0→2 intermittence with 20/20 in isolation and zero diff
  overlap is the known MemoryTable add-row load flake, and the targeted 10
  files / 228 tests green is the real gate for this diff.

## Follow-ups & YAGNI notes
- **`changedFieldPaths` remains the one known write-only surface** in the swept
  area; its removal belongs to whichever session owns `lib/review/commit.ts`
  (and its pinning test) — deliberately not this one.
- **The kept test seams (`FLAG_CODES`, `EXTRACTION_ERROR_COPY`) and the four
  out-of-scope test-consumer exports are written down on purpose** — the next
  sweep should start from this doc's keep list, not re-derive it.
- **lib/db A000/A001/A003's deploy-time migration verifications are still
  open** (recorded as archive-line suffixes; no git record of them running) and
  lib/admin A001's ten manual browser checks likewise — both are ops work, not
  code work, and invisible to any future git-derived closure pass.
- **The MemoryTable add-row load flake persists suite-wide** (now
  characterized a second time, by a second session, with the same
  2-fail-intermittent signature); the fix belongs in the harness/parallelism
  layer, outside this session's scope.
- **Merged (commit `4a237d5`)** — landed by the coordinator
  `tokenmax-orch-2026-09-12`, per the Worker Mode contract.

## Appendix
- **Branch / commits:** `token-maxxing-2026-09-12-schema-misc-todos-archive` @
  `f332d1a` (5 files, +33/−66) and `a1db572` (4 files, +86/−368) — 9 files,
  +119/−434 total. Merged (commit `4a237d5`).
- **Files touched:**
  - `f332d1a`: `lib/schema/extractedSession.ts`,
    `lib/schema/extractedSession.test.ts`, `lib/schema/extractionResult.ts`,
    `lib/flags/copy.ts`, `lib/derived/invalidate.ts`.
  - `a1db572`: `scripts/.workflows/todos.md`,
    `lib/db/.workflows/todos.md`, `lib/admin/.workflows/todos.md`,
    `components/admin/.workflows/todos.md`.
- **Constraints honored (verified against the diffs):** no
  `package_readme.md` touched; no DB access; the sweep touched only the four
  assigned lib dirs' five files; the archival touched only the four named
  todos.md files.
- **Verification receipts:**
  - `next typegen` + `npx tsc --noEmit` — clean.
  - Targeted vitest — 10 files / 228 tests green.
  - eslint + `npx prettier --check` — clean on all touched files.
  - Full suite — only the known MemoryTable add-row load flake (2 tests,
    intermittent 2→0→2 across three runs, 20/20 in isolation, zero diff
    overlap).
  - All 19 archive-line plan paths resolve package-relative (19/19).
  - `todos.py validate` — green; per-entry `grep | sort | uniq -c` dup gate —
    green.
- **Closure evidence cited:** lib/db P1-DB-A002 → commit `7fb7f90` (merged via
  `27bfaa6`); scripts P1-SC-A001 → measured apply runs 48/52 rows hashed, 17
  repointed (scripts `package_readme.md`, 2026-09-11).
- **Commands run (representative):**
  ```bash
  git show --stat f332d1a a1db572          # diffs match the doc's numbers
  npx tsc --noEmit                         # arbiter for the 8 un-exports
  npx vitest run <10 targeted files>       # 228 tests green
  python3 ~/.claude/skills/task/todos.py validate   # per ledger, green
  grep -oE '^- \[.\] \*\*P[0-4]-[A-Z]+-A[0-9]{3}\*\*' <ledger> | sort | uniq -c
  ```
- **References:** the archival precedents `2026-09-11-todos-root-archive.md`,
  `2026-09-11-todos-nina-archive.md`, `2026-09-12-todos-nina-lib-archive.md`
  (the trilogy this session completed); the dead-code campaign precedents
  `2026-09-11-lib-admin-dead-exports.md`, `2026-09-11-components-dead-code-a.md`
  / `-b.md`, `2026-09-11-lib-db-queries-yagni.md`,
  `2026-09-11-lib-nina-queries-yagni.md`; memory notes *Dead-export sweeps:
  four verifier traps* (twin names, relative imports, barrel hops, multiline
  lists — all applied), *MemoryTable add-row tests flake under parallel load*
  (the full-suite reds), *todos.py validate is blind to same-file dup IDs*
  (the uniq gate), *todos Plan pointers are package-relative* (19/19 base), and
  *todos closure: measure the outcome* (the git-derived + measured-closure
  method).
