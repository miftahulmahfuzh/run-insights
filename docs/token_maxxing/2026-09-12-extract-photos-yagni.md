# Token-Maxxing Session — 2026-09-12: Ingest-Pipeline Dead-Code Sweep (extract/photos)

## 🎯 Achievement / End Result
- **Goal of the burn:** A WORKER session (slug `extract-photos-yagni`), pre-assigned one
  idea by the coordinator (`tokenmax-orch-2026-09-12`): hunt and remove dead code in
  `lib/extract`, `components/extract`, and `lib/photos` — the ingest pipeline, i.e. the
  code that turns a picked file into a stored, hashed, compressed shot. The premise: these
  packages were untouched by every prior YAGNI pass (yesterday's components sweep had
  covered `components/extract`'s exports only as one directory inside a five-directory
  batch; `lib/extract` and `lib/photos` had never been symbol-censused at all).
  **Constraints honored to the letter:** strictly within the three dirs; **no
  `package_readme.md` touched** (forbidden this session); **zero database access all
  session** (no production DB touched).
- **Concrete changes:** 11 files, **+13/−36**, two commits on the session branch:
  - `b2a8f11` *refactor(ingest): delete dead code in extract/photos packages*
    (+3/−12, 4 files) — three genuine deletions: `UPLOAD_CONCURRENCY`,
    `shortEdgeOf`, `Tile.originalBytes`.
  - `a099686` *refactor(ingest/photos): shrink unconsumed export surface*
    (+10/−24, 7 files) — 8 types un-exported (nothing imports them), both compressors'
    never-populated `opts` bags dropped, write-only `originalBytes` dropped from both
    compressor result types.
- **Real value delivered:**
  - **The honest headline is the NEGATIVE result.** After an exhaustive census — every
    one of the three dirs' files read end to end (20 files, 2,343 lines pre-change), every
    exported symbol (~60) word-boundary-grepped across `app/`, `lib/`, `components/`,
    `scripts/`, `tests/`, and `research/` — these "never swept" packages turned out to be
    **almost entirely alive**. Roughly 2,300 lines of ingest pipeline carry only the ~36
    dead lines above. A smaller haul than yesterday's sweeps is not a smaller session:
    proving a package clean is the product.
  - **The verdict table is the durable value.** Every export → its consumers, classified
    (live / test-seam / totality-required / dead), is recorded below so the next sweep
    starts from the answer instead of re-deriving it.
  - **The deliberate KEEPS are written down** (test-seam exports per repo convention,
    `noUncheckedIndexedAccess` totality guards, `KNOWN_EXTENSIONS` entries pinned by
    `save.test.ts`) — so the next sweep doesn't re-litigate them.
  - **Two false docstrings died with their symbols.** `UPLOAD_CONCURRENCY`'s "Two at a
    time: enough to hide latency, few enough not to thrash a cellular uplink" was
    factually false — the picker uploads unbounded-concurrent — and `shortEdgeOf` claimed
    a QA consumer that does not exist. Dead code that lies is worse than dead code.
  - **An unreachable abort path removed:** both compressors accepted `opts.signal` no
    caller ever passed, so the `if (opts.signal?.aborted) throw cause` rethrow could never
    fire.
- **Branch:** `token-maxxing-2026-09-12-extract-photos-yagni`
- **Merge status:** merged (commit `faace78`)
- **Approx token burn:** high 🔥 — the diff is tiny (+13/−36) but the burn went into
  reading all 20 files end to end, the ~60-symbol repo-wide census with per-hit
  classification, the trap checks (twin names, barrel re-exports, file-path string
  references), and a full 5,093-test suite run for the final gate.

## Context & Motivation
The 2026-09-12 token-maxxing day ran as an orchestrated fan-out: a coordinator session
(`tokenmax-orch-2026-09-12`) spawning worker sessions on per-session branches, each handed
one pre-assigned idea. This worker drew the ingest pipeline.

The repo's prior YAGNI sessions had swept `lib/db/queries.ts`, `lib/nina/queries.ts`,
`lib/admin`'s two largest files, and most of `components/` — but the three packages that
implement photo ingestion (`components/extract` picking the files, `lib/extract` planning
and uploading them, `lib/photos` compressing/hashing/saving them) had never had a
dedicated pass. That is exactly where dead code accrues in a feature built incrementally
across plan sets: options added for callers that never arrived, result fields written but
never read, constants that document behavior the code outgrew.

The assignment's rules were strict and all honored: changes confined to the three dirs
(the census may *read* anywhere, the edits may not); `package_readme.md` files untouchable
this session; no database of any kind. That last one mattered for verification design —
no claim in this session's evidence depends on DB state.

## What We Did (blow-by-blow)
1. **Read every file in the three dirs end to end** — 20 files, 2,343 lines pre-change
   (16 source + 4 co-located `lib/photos` test files, measured at `b2a8f11^`). Not a
   grep-and-pray sweep: the justification for keeping or cutting any symbol is having
   seen what surrounds it, and two of the session's findings (the false docstrings, the
   unreachable abort rethrow) are only visible in a full read.
2. **Built a per-symbol census of every exported symbol (~60)** across `app/`, `lib/`,
   `components/`, `scripts/`, `tests/`, and `research/` — word-boundary greps per symbol,
   every hit classified code vs prose vs file-path string.
3. **Applied the known verifier traps explicitly** (the four false-positive shapes prior
   dead-code sessions recorded):
   - **TWIN NAMES — found and dismissed.** Two *different* `KindHolder` interfaces exist
     (`lib/extract/planPicked.ts` and `lib/extract/reassignKind.ts`), each genuinely used
     by its own module and tests — a naive "grep found hits elsewhere, keep exported"
     and a naive "it's a duplicate, deduplicate" are both wrong here.
     `EXPLORER_UPLOAD_CONCURRENCY` in `components/admin` is a different constant that
     shares only a suffix; `lib/llm/narrate.ts` carries its own
     `MIN_REPAIR_BUDGET_MS = 3_000` unrelated to any extract constant.
   - **BARREL RE-EXPORT — noted, out of scope.** `lib/schema/extractedSession.ts`
     re-exports `SCREEN_KINDS`/`ScreenKind`; that file lives outside the three dirs, so
     the re-export was left exactly as found (and its consumers count as consumers of the
     source symbols).
   - **FILE-PATH STRING REFERENCES — respected.** `tests/extract.kindSelector.test.ts`
     and `tests/extract.onPickPurity.test.ts` read the picker/planner *source as text*
     and pin specific identifiers. Every assertion in both files was checked before any
     edit; nothing the text tests pin was touched.
   - **POSITIVE CONTROLS — ran.** The census correctly flagged known-alive symbols
     (e.g. `MAX_IMAGES`) as live and known-dead `UPLOAD_CONCURRENCY` as dead; `tsc` was
     the final arbiter of every removal.
4. **Committed the removals in two gated commits** (details under Code / Design Details):
   first the three genuine deletions (`b2a8f11`), then the export-surface shrink
   (`a099686`).
5. **Recorded the deliberate KEEPS** — every zero-importer symbol that survives, with the
   reason it survives, so the next sweep reads the answer rather than re-running the
   debate (table below).
6. **Flagged two out-of-scope ghosts without touching them** (scope discipline — both
   files are outside the three dirs): a leftover `originalBytes` key in
   `components/nina/Composer.test.tsx`'s untyped `vi.fn()` mock (carried harmlessly), and
   `lib/db/.workflows/plan/P1-DB-A006.md` quoting `ContentHashInput`'s old *exported*
   signature as historical text.
7. **Ran the full gate suite post-change:** `next typegen` ✓ (fresh worktree — `PageProps`
   errors are missing typegen, not regressions), `npx tsc --noEmit` exit 0 repo-wide,
   `npm run test` = **265 files / 5,093 tests, all passing**, `prettier --check` clean on
   all 11 edited files, word-boundary re-sweeps confirming deleted symbols have zero hits
   and un-exported names appear only in their defining files, and a clean worktree after
   both commits.

## Code / Design Details

**The removal ledger** — what died, and the evidence that killed it:

| Symbol | File | Verdict | Evidence |
|---|---|---|---|
| `UPLOAD_CONCURRENCY` | `lib/extract/constants.ts` | deleted | zero references repo-wide; its "two at a time" docstring factually false — the picker uploads unbounded-concurrent |
| `shortEdgeOf` | `lib/photos/resizeTarget.ts` | deleted | only caller was its own test; docstring claimed a nonexistent QA consumer; test now inlines `Math.min` |
| `Tile.originalBytes` | `components/extract/UploadPicker.tsx` | deleted | written into every tile, never read by anything |
| `AcceptedPick`, `PickPlan` | `lib/extract/planPicked.ts` | un-exported | zero importers; remain private, load-bearing shapes |
| `Reassignment` | `lib/extract/reassignKind.ts` | un-exported | zero importers; still the module's return shape |
| `SwipeDecision` | `lib/photos/gallery.ts` | un-exported | zero importers |
| `SaveStrategy` | `lib/photos/save.ts` | un-exported | zero importers |
| `CompressedShot` | `lib/photos/compressForExtraction.ts` | un-exported | zero importers |
| `CompressedNinaImage` | `lib/photos/compressForNina.ts` | un-exported | zero importers |
| `ContentHashInput` | `lib/photos/contentHash.ts` | un-exported | zero importers (the doc-only mention in a plan file is prose, not an import) |
| compressor `opts` bags | `compressForExtraction.ts`, `compressForNina.ts` | dropped | no caller ever passed `signal`/`onProgress`; the `opts.signal?.aborted` rethrow was unreachable |
| result-type `originalBytes` | both compressor result types | dropped | write-only — populated by the compressor, read by no one |

**Signature before/after** (the largest single change, `compressForExtraction`):
```ts
// before
export interface CompressedShot { file: File; width: number; height: number;
  originalBytes: number; compressedBytes: number }
export async function compressForExtraction(
  file: File,
  opts: { signal?: AbortSignal; onProgress?: (percent: number) => void } = {},
): Promise<CompressedShot>
//   ... signal: opts.signal, onProgress: opts.onProgress passed through,
//   ... `if (opts.signal?.aborted) throw cause` in the catch

// after
interface CompressedShot { file: File; width: number; height: number;
  compressedBytes: number }
export async function compressForExtraction(file: File): Promise<CompressedShot>
```
`compressForNina` shrank identically (its bag had only `signal`). `resizeTarget.test.ts`
now asserts the same ±5 acceptance band through inline `Math.min(outWidth, outHeight)` —
the test's meaning is unchanged; the helper it exercised exists no more.

**The deliberate KEEPS** — zero-importer symbols that survive, with reasons:

| Kept symbol | Why it stays |
|---|---|
| `KINDS_MATCH_SLOTS`, `SWIPE_MIN_DISTANCE`, `SWIPE_DOMINANCE`, `pollDelayFor`, `SwipeGesture`, both `KindHolder`s, `isStalePending` | test-seam exports per repo convention — imported (or source-text-pinned) by the centrally-located `tests/extract.*` suites |
| `FUNCTION_MAX_DURATION_S` | pins `app/api/extract/route.ts`'s literal via a text test — the export IS the guard |
| `?? DEFAULT_KIND_BY_INDEX[0]` totality guards | `noUncheckedIndexedAccess: true` makes them type-required, not defensive noise |
| `KNOWN_EXTENSIONS`' `png`/`webp`/`gif`/`avif` entries | `save.test.ts` pins `png`/`webp`; the set is a contract, not a usage census |

Also recorded: **no `TODO`/`FIXME`/`console.log` noise exists anywhere in the three
dirs** — the packages are clean beyond the symbol level.

**Commit shapes:**
```
b2a8f11 refactor(ingest): delete dead code in extract/photos packages
  components/extract/UploadPicker.tsx   | 2 --
  lib/extract/constants.ts              | 2 --
  lib/photos/resizeTarget.test.ts       | 6 +++---
  lib/photos/resizeTarget.ts            | 5 -----
  4 files changed, 3 insertions(+), 12 deletions(-)

a099686 refactor(ingest/photos): shrink unconsumed export surface
  lib/extract/planPicked.ts             |  4 ++--
  lib/extract/reassignKind.ts           |  2 +-
  lib/photos/compressForExtraction.ts   | 12 ++----------
  lib/photos/compressForNina.ts         | 10 ++--------
  lib/photos/contentHash.ts             |  2 +-
  lib/photos/gallery.ts                 |  2 +-
  lib/photos/save.ts                    |  2 +-
  7 files changed, 10 insertions(+), 24 deletions(-)
```

## Decisions & Trade-offs
- **Delete vs un-export, decided by one rule.** A symbol referenced by *nothing at all*
  gets deleted (`UPLOAD_CONCURRENCY`, `shortEdgeOf`, `Tile.originalBytes`). A symbol used
  only inside its own module gets its `export` keyword removed but its body kept — the
  type stays load-bearing as the module's internal contract (all 8 un-exports). Never
  both: an un-export that also deletes the body would have broken the module's own
  signatures for zero additional surface.
- **Full reads over grep summaries.** The two false docstrings and the unreachable abort
  rethrow are invisible to a caller-census; they require reading the code that would lie.
  The census found *that* they were dead; the reads found *why* they mattered to remove.
- **Test-seam exports stay, per repo convention.** Prior YAGNI sessions (lib/db, lib/nina,
  components) established the pattern: a symbol whose only consumer is a test suite is
  kept and *noted*, not removed — the tests are real consumers and the text-pinning suites
  (`tests/extract.kindSelector.test.ts`, `tests/extract.onPickPurity.test.ts`) make the
  source text itself a contract. Recording them converts future "is this dead?" into a
  table lookup.
- **The type-required totality guards stay.** With `noUncheckedIndexedAccess: true`, the
  `?? DEFAULT_KIND_BY_INDEX[0]` fallbacks are what makes the file compile; removing them
  as "defensive dead code" would be a type error, not a cleanup.
- **Scope discipline over completeness.** Both out-of-scope ghosts (the nina test mock's
  leftover key, the plan file's historical signature quote) were *flagged, not fixed* —
  the assignment fenced the edits to three dirs, and an edit outside the fence needs its
  own mandate. Harmless as both are, nothing was gained by breaking scope.
- **Zero DB access, by constraint turned virtue.** Every claim in this sweep is verifiable
  from the tree alone (`tsc`, the test suite, word-boundary greps, git) — nothing in the
  evidence depends on database state that could drift.

## Follow-ups & YAGNI notes
- **Two flagged, not fixed (both outside the three dirs):**
  - `components/nina/Composer.test.tsx` — a mock object still carries an
    `originalBytes` key matching `CompressedNinaImage`'s dropped field; the mock is an
    untyped `vi.fn()` return, so the extra key is inert. Next person editing that test
    should drop the key.
  - `lib/db/.workflows/plan/P1-DB-A006.md` — quotes `ContentHashInput`'s old
    *exported* signature (`export type ContentHashInput = ...`) as historical text. It
    is a plan archive quoting the code as it was; leave it, but don't cite it as current.
- **Don't schedule another sweep of these packages soon.** The verdict table above is the
  answer; a re-sweep before meaningful new commits to the ingest pipeline would
  re-derive a settled question. If the pipeline grows (new uploader strategies, a real
  concurrent-upload limit replacing the deleted `UPLOAD_CONCURRENCY`), re-run the census
  *then*.
- **The `UPLOAD_CONCURRENCY` lesson generalizes:** a concurrency limit that exists only
  as a constant is documentation of behavior the code never had. If bounded upload
  concurrency is ever actually wanted, it must be implemented in `UploadPicker`, and the
  constant should be born in the same commit as the code that reads it.
- **YAGNI honored in the other direction too:** the never-populated `opts` bags were
  speculative flexibility for abort/progress support no caller used. The compressors'
  real contract ("compress this file, blockingly") is now spelled by the signature
  itself. If cancellation ever becomes real, the parameter returns with a caller.

## Appendix

**Pre-change inventory (measured at `b2a8f11^`):** 20 files across the three dirs
(16 source + 4 co-located tests in `lib/photos`), 2,343 lines. Post-change: 11 files
touched, +13/−36.

**Verification gates, all fresh and post-change:**
- `next typegen` ✓ (fresh worktree — `PageProps` errors are missing typegen, not
  regressions);
- `npx tsc --noEmit` — exit 0, whole repo;
- `npm run test` — **265 files / 5,093 tests, all passing**;
- `prettier --check` — clean on all 11 edited files;
- word-boundary re-sweeps — deleted symbols (`UPLOAD_CONCURRENCY`, `shortEdgeOf`)
  zero hits repo-wide; each un-exported name appears only in its defining file;
- `git status` — clean worktree after both commits.

**Census scope:** every exported symbol (~60) across `lib/extract`, `components/extract`,
`lib/photos`, word-boundary-grepped across `app/`, `lib/`, `components/`, `scripts/`,
`tests/` (including the seven centrally-located `tests/extract.*` suites), and
`research/`. Barrel re-exports found: one (`lib/schema/extractedSession.ts` re-exporting
`SCREEN_KINDS`/`ScreenKind`), outside scope, consumers credited to the source.

**Trap checks performed:** twin-name dismissals (`KindHolder` ×2 — both alive in their own
modules; `EXPLORER_UPLOAD_CONCURRENCY` ≠ `UPLOAD_CONCURRENCY`; `lib/llm/narrate.ts`'s own
`MIN_REPAIR_BUDGET_MS = 3_000`); file-path/string-reference tests
(`tests/extract.kindSelector.test.ts`, `tests/extract.onPickPurity.test.ts` — every
assertion checked before editing); positive controls (`MAX_IMAGES` alive,
`UPLOAD_CONCURRENCY` dead — the census got both right); `tsc` as final arbiter.

**Commits (this session, on the branch):**
- `b2a8f11` refactor(ingest): delete dead code in extract/photos packages
- `a099686` refactor(ingest/photos): shrink unconsumed export surface

**Session identity:** worker session `extract-photos-yagni`, spawned by coordinator
`tokenmax-orch-2026-09-12` on 2026-09-12; branch
`token-maxxing-2026-09-12-extract-photos-yagni`; not merged (the coordinator lands worker
branches). Constraints honored: edits confined to `lib/extract`, `components/extract`,
`lib/photos`; no `package_readme.md` touched; no database accessed all session.
