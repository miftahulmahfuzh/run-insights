# Token-Maxxing Session — 2026-09-12: Schema YAGNI Sweep & First package_readme

## 🎯 Achievement / End Result
- **Goal of the burn:** A WORKER session (slug `schema-yagni-readme`) of coordinator
  `tokenmax-orch-2026-09-12` — the idea was **pre-assigned, so there was no Step-4 idea menu**.
  The assignment, in substance: *"Run a YAGNI dead-export sweep over `lib/schema` (878 lines
  incl. tests, never audited) and write its first `package_readme.md` (map + standing rules),
  since it is one of the last major `lib/` packages with zero maintainability docs and no
  dead-code pass."* (Premise correction below — see Context & Motivation: a same-day sibling
  session had already taken the package's *coarser* dead exports; what remained was exactly the
  finer residue this sweep exists for.)
- **Concrete changes:** two commits, net −1 line of code and +181 lines of documentation:
  - `ad7c732` — "refactor(schema): drop dead exports — unused ExtractedPostWorkoutHr alias +
    2 needless export keywords" (2 files, +2/−3: `lib/schema/extractedSession.ts` un-exports
    the `ExtractedPostWorkoutHr` const and **deletes the dead `ExtractedPostWorkoutHr` type
    alias**; `lib/schema/extractionResult.ts` un-exports `ExtractionBlobRefSchema`).
  - `2473ace` — "docs(schema): first package_readme.md — module map, standing rules, consumer
    census" (1 file, +181: `lib/schema/.workflows/package_readme.md`).
- **Real value delivered:**
  - **The dead surface is gone — all three symbols of it**, including one the adopted
    instrument **structurally cannot see**: knip flagged 2 unused exports (the
    `ExtractedPostWorkoutHr` const and `ExtractionBlobRefSchema`, both the "needless export
    keyword" class, in-file use only), but the full grep cross-check census found a **third
    dead symbol knip missed — the `ExtractedPostWorkoutHr` TYPE alias, zero importers
    anywhere**. knip read the type as consumed because of the
    `z.infer<typeof ExtractedPostWorkoutHr>` self-reference inside its own declaration file.
    Its last real consumer died when F05 moved to its own positional post-workout shape
    (`[end_hr_bpm, hr_1min_post_bpm]` per the surviving R-9 doc comment).
  - **First-ever maintainability doc for the package:** `lib/schema/.workflows/package_readme.md`
    (181 lines) — Overview (the validation boundary between the vision model's transcription
    and everything the app trusts; the vendor ignores JSON-Schema `required`), an Exported API
    table per module (8 + 8 exports), the data flow through the extraction pipeline, an
    import-edge census **stamped 2026-09-12**, and **nine standing rules** — including the
    deliberate `ExtractionStatus` twin-union reconciled by a cast tsc cannot check, the
    four-edit lockstep for a new session field (and which of the four nothing enforces), and
    why exported-for-its-own-test is a seam knip cannot see.
  - **The instrument got its first production workout.** This is the first package swept
    *using* `npm run knip` (adopted earlier the same day by the `dead-export-tooling` session,
    commit `4f4fa3f`) — census cost ≈ zero setup, and the sweep doubled as an instrument
    evaluation. Verdict, written into the readme's Notes: **run the grep census even when knip
    is green** — the z.infer self-reference class is invisible to it.
  - **The keeps are ledgered so the next sweep doesn't re-litigate:** prose mentions in
    comments are not consumers (`draft.ts`, `route.test.ts`, `KindSelector.tsx`,
    `prompts/extraction.ts`); `lib/db/schema.ts`'s own `ExtractionStatus` union is a deliberate
    twin, not a duplicate to unify; four exports (`normalizeClockTime`, `FIELD_SOURCES`,
    `EXTRACTION_ERROR_COPY`, `RawExtractedSession`) are exported-for-their-own-test —
    deliberate seams knip cannot see because its vitest entries count as consumers.
- **Gates, all green:** `next typegen` + `tsc --noEmit` exit 0; eslint + prettier clean on
  `lib/schema`; full vitest **279 files / 5,230 tests passed**; knip `lib/schema` findings
  **2 → 0** (repo unused exports **152 → 150**). Note: the worktree's `node_modules` is a
  symlink to the main checkout — fine for tsc/vitest/knip, but a Turbopack build rejects it,
  so `next build` was deliberately **not** a gate.
- **Branch:** `token-maxxing-2026-09-12-schema-yagni-readme` (HEAD `2473ace`)
- **Merge status:** on branch, **NOT merged** — worker mode; coordinator
  `tokenmax-orch-2026-09-12` owns the landing.
- **Approx token burn:** high (est. ~1M, input-dominated) 🔥

## Context & Motivation
`lib/schema` is the validation boundary of the whole ingest pipeline — two pure, client-importable
Zod modules (`extractedSession.ts` 310 lines + `extractionResult.ts` 140 lines, plus their
co-located tests = 878 lines total at sweep start, measured `git show ad7c732^ | wc -l` per
file) — and until today it was one of the last major `lib/` packages with no maintainability
doc and no dedicated dead-code pass.

**Premise correction, recorded rather than absorbed silently:** the assignment's "never
audited" was two-thirds true. A same-day sibling worker (`schema-misc-todos-archive`, commit
`f332d1a`, 07:48 that morning) had already swept `lib/schema` *among four directories* and
taken its coarser findings (`emptyExtractedSession` — whose docstring claimed an F05 consumer
that never existed — the self-unused `sectionForField`, the dead `ExtractRequest` type, plus 8
self-only un-exports). What this session's knip-first pass then found is exactly the *finer*
residue that method misses — and it still contained three dead symbols, one of them invisible
to the instrument. The "zero maintainability docs" half of the premise was fully true: no
`package_readme.md` existed.

This was also the first real test of the day's knip adoption: the `dead-export-tooling` session
had validated the instrument against *prior* sessions' documented ground truth; this session
used it forward, as the starting census, and the one place it fell short (the self-referential
type alias) is now a documented class with a documented countermeasure.

Constraints honored: no production DB access, no behavior change (pure export-surface
reduction + docs), coordinator lands the branch.

## What We Did (blow-by-blow)
1. **Started from the instrument, not from scratch:** `npm run knip` → `lib/schema` findings: 2
   unused exports, both "needless export keyword" cases (used only inside their own files):
   `ExtractedPostWorkoutHr` (const) and `ExtractionBlobRefSchema`.
2. **Ran the full grep cross-check census anyway** — every one of the package's exported
   symbols word-boundary-grepped repo-wide, every hit classified code vs prose. The surface at
   sweep start: **19 export statements / 18 unique names** (the assignment brief's "17
   exports" counts first-class exports; the 18th name is `ScreenKind`, a pass-through type
   re-export from `@/lib/extract/constants`, kept deliberately so schema consumers import one
   place). `ExtractedPostWorkoutHr` counted once as a name but was a const+type pair.
3. **The catch of the session:** the `ExtractedPostWorkoutHr` **type alias** had **zero
   importers anywhere** — every repo hit was its own declaration file. knip missed it because
   the very next line, `export type ExtractedPostWorkoutHr = z.infer<typeof
   ExtractedPostWorkoutHr>`, is an in-file reference that knip counts as consumption. The
   alias's last real consumer died when F05 moved to its own positional post-workout shape
   (R-9: `[0]` is `runs.end_hr_bpm`, `[1]` is `runs.hr_1min_post_bpm`). knip's two value
   findings were correct; its silence on the alias proved nothing — and that asymmetry is the
   lesson now stamped in the readme.
4. **Verifier-trap triage on every would-be finding** (the keeps, each with its reason):
   - **Prose mentions are not consumers:** `ExtractRequestSchema` is *named* in comments in
     `lib/review/draft.ts`, `app/api/extract/route.test.ts`, `components/extract/KindSelector.tsx`,
     and `lib/llm/prompts/extraction.ts` — counting any of these as refs would have blocked
     nothing here, but counting prose as refs has blocked earlier sweeps; classified and moved on.
   - **`ExtractionStatus` is declared twice, on purpose:** `lib/db/schema.ts` needs its own
     union for the column's `$type<>` and cannot import upward; this package needs one and must
     stay pure (no `@/lib/db`). The unions are reconciled by an explicit **cast** in
     `lib/extract/readExtraction.ts` — so a one-sided member addition is invisible to tsc at
     that seam. Kept as a twin; documented as standing rule 5, with the unification alternative
     recorded as a follow-up.
   - **Exported-for-their-own-test is a deliberate seam, not dead code:**
     `normalizeClockTime`, `FIELD_SOURCES`, `EXTRACTION_ERROR_COPY`, and `RawExtractedSession`
     have their production callers inside the package and their test suites as the only
     external importers. knip cannot see this class at all — its vitest entries count as
     consumers, so `npm run knip` staying silent proves nothing either way about it. Kept;
     documented as standing rule 9.
5. **Commit `ad7c732` (+2/−3):** un-exported the `ExtractedPostWorkoutHr` const (it stays as a
   private building block of `RawExtractedSession`'s `postWorkoutHr` row), **deleted** the dead
   type alias outright (zero importers = dead, not private), and un-exported
   `ExtractionBlobRefSchema` (stays as the private builder behind the exported
   `ExtractionBlobRef` type and `ExtractRequestSchema`'s images array). No runtime change —
   only `export` keywords and one dead line.
6. **Commit `2473ace` (+181):** wrote `lib/schema/.workflows/package_readme.md` — Overview
   (what the package is for and the vendor-ignores-`required` premise from
   `IMPLEMENTATION_PLAN.md` §1.6), per-module Exported API tables (8 + 8), Internal
   Architecture (the data flow `UploadPicker` → `POST /api/extract` → `lib/llm/extract.ts` →
   `runExtractionJob.ts` → `readExtraction.ts` → poll hook/`ReviewClient`, plus key internals
   like `transcribedClockTime` normalizing *inside* the schema and `emptyFieldValues()` being a
   function to dodge the shared-array trap), Dependencies (external: zod only; internal: one
   import edge; **notably absent: `server-only`, `@/lib/env`, `@/lib/db`** — with the pure-module
   rule as the reason; plus the test-side oddity of the `TRUTH` fixture imported from
   `research/schema.mjs`, outside knip's graph, "do not clean it up"), Reverse Dependencies
   (the full import-edge consumer census, grep-measured, **stamped 2026-09-12**), Concurrency,
   Error Handling, **nine Standing Rules**, Performance, and Notes (the creation record with
   the knip-blind-spot lesson and a pointer to `npm run knip` as the instrument, "interpret
   its silence per rule 9").
7. **Gates:** `next typegen` + `tsc --noEmit` exit 0 (the compiler-side proof no hidden
   importer existed for anything de-exported or deleted); eslint + prettier clean on
   `lib/schema`; **full vitest 279 files / 5,230 tests passed**; re-ran knip: `lib/schema`
   findings **2 → 0**, repo-wide unused exports **152 → 150**. `next build` skipped
   deliberately — symlinked `node_modules` is a known Turbopack rejection; tsc/vitest/knip are
   unaffected by it.

## Code / Design Details
**The whole code diff** (commit `ad7c732`, 2 files, +2/−3):

```diff
--- a/lib/schema/extractedSession.ts
+++ b/lib/schema/extractedSession.ts
 /** R-9: `[0]` is `runs.end_hr_bpm`, `[1]` is `runs.hr_1min_post_bpm`. F05 maps them. */
-export const ExtractedPostWorkoutHr = z.object({
+const ExtractedPostWorkoutHr = z.object({
   label: z.string().min(1),
   bpm: z.number().int().min(40).max(230),
 })
-export type ExtractedPostWorkoutHr = z.infer<typeof ExtractedPostWorkoutHr>
 
--- a/lib/schema/extractionResult.ts
+++ b/lib/schema/extractionResult.ts
-export const ExtractionBlobRefSchema = z.object({
+const ExtractionBlobRefSchema = z.object({
```

Note the trap in the first hunk: the deleted `export type … = z.infer<typeof …>` line is what
made knip believe the name was alive. A "remove the dead type" edit driven by knip alone would
have stopped one step short and left the dead alias in place.

**The knip blind spot, as a class:** any `z.infer<typeof X>` (or `satisfies`/annotation)
written inside X's own declaration file is an in-file reference — and knip counts in-file
references as consumption *by design* (`ignoreExportsUsedInFile: false` is deliberately kept in
`knip.ts` because the needless-export-keyword class is signal). The corollary the readme now
records: **for type aliases, knip's silence is weaker evidence than for values** — a value used
only in-file shows up as a needless-export finding, but an *unused type* wrapped around an
in-file `z.infer` of itself does not. The grep census is the counter-instrument, and it is
cheap.

**The readme's nine standing rules, in one line each** (the file is the real record):
1. Pure module, client-importable — no `server-only`, no `@/lib/env`, no `@/lib/db`.
2. The vendor ignores `required` — rows must fail Zod and fire repair, never `.default()` into
   existence; scalars degrade to `null`.
3. The provenance null-out is hard, and `kindsPresent` comes from our own upload records.
4. A new session field is **four edits in lockstep** — schema row, `FIELD_SOURCES` row,
   `emptyFieldValues()` entry, `EXTRACTION_SHAPE` prompt — of which **the prompt shape is
   enforced by nothing**.
5. `ExtractionStatus` is declared twice by necessity; reconciled by a cast tsc cannot check;
   new statuses go into both unions in the same commit.
6. A bare one-digit hour returns `null` on purpose (measured 1-in-8 wrong; badges mint from
   `started_at`).
7. The Blob-URL refinement is the SSRF boundary; `pathname` must match the stored pattern.
8. The D1 copy contract is test-enforced ("nothing was saved" or the by-hand path).
9. Exported-for-its-own-test is a deliberate seam, invisible to knip — keep the export, and
   read knip's silence accordingly.

**Reconciliation arithmetic, to the digit:**
- Lines: 878 (pre-sweep: 310 + 289 + 140 + 139) → 877 post-commit (net −1, the deleted alias).
- Exports: 19 statements / 18 unique names pre-sweep → 16 exports post-sweep (8 + 8); removed
  surface = 2 needless export keywords + 1 dead name (const+type pair).
- knip: repo unused exports 152 → 150; `lib/schema` 2 → 0. Live re-derivation while writing
  this doc confirms 150 unused exports / 116 unused exported types / 2 duplicate pairs, zero
  `lib/schema` findings.

## Decisions & Trade-offs
- **Deleted the alias rather than un-exporting it.** The rule applied: a symbol with zero
  importers is dead, not private — un-exporting is for values still used in their own file.
  `RawExtractedSession`'s `postWorkoutHr` row uses the *const*; nothing anywhere used the
  *type*. The const went private; the alias went away.
- **Kept all four test-seam exports** (`normalizeClockTime`, `FIELD_SOURCES`,
  `EXTRACTION_ERROR_COPY`, `RawExtractedSession`) and wrote the class down as knip-invisible
  (rule 9) instead of "fixing" knip's config — the seams are deliberate, and silencing the
  tool is not the same as understanding the surface.
- **Kept the `ExtractionStatus` twins.** Unifying behind a shared leaf module would give tsc
  the power to guard the cast seam, but it would put a constraint (`lib/db` importing from a
  new leaf, or the schema package growing a non-pure sibling) on an otherwise trivially pure
  package. The twin + documented same-commit rule is the lighter invariant today; the unification
  is recorded as a follow-up, not done speculatively (YAGNI).
- **Counts are stamped, not stated.** Per the repo's volatile-numbers rule, every count in the
  readme (the import-edge census, the export tables, the line numbers of this doc) carries its
  2026-09-12 measure date, and the readme points at `npm run knip` as the live source rather
  than at itself.
- **Premise corrections recorded, not laundered.** The "878 lines, never audited" assignment is
  quoted with its wrinkle (a same-day four-dir sibling had already taken the coarse findings)
  because the next reader of this doc deserves to know why the residue was so small — and why
  it still contained three symbols.

## Follow-ups & YAGNI notes
1. **knip's repo-wide backlog is the next YAGNI sessions' task list, at zero setup:** live
   census (re-derived 2026-09-12) of **150 unused exports + 116 unused exported types**,
   concentrated in `lib/nina` (~60+ files). (The counts grow and shrink as sessions land —
   treat the tool, not any doc, as the source.)
2. **The "exported only for its own test" class is invisible to knip by config** — its vitest
   entries count as consumers. A deliberate-seam audit of other packages would need this
   session's grep-census method; `lib/schema`'s four seams (readme rule 9) are the worked
   example.
3. **The `ExtractionStatus` twin-union cast seam** (`lib/extract/readExtraction.ts`) is
   documented in the new readme as a standing rule, but could alternatively be **unified behind
   a shared leaf module** if one ever wants tsc to guard it — a one-sided member addition is
   currently invisible to the compiler at that seam, and only the same-commit discipline (rule
   5) catches it.
4. **The four-edit lockstep's unenforced quarter** (readme rule 4): nothing enforces the
   `EXTRACTION_SHAPE` prompt edit — a missed edit just means the model never fills the field.
   A future guard could close it; deliberately not built here.

## Appendix
- **Commits:**
  - `ad7c732` — refactor(schema): drop dead exports — unused ExtractedPostWorkoutHr alias +
    2 needless export keywords — 2 files, +2/−3 (`lib/schema/extractedSession.ts` 1+/2−,
    `lib/schema/extractionResult.ts` 1+/1−).
  - `2473ace` — docs(schema): first package_readme.md — module map, standing rules, consumer
    census — 1 file, +181 (`lib/schema/.workflows/package_readme.md`).
- **Verification run for this doc:** `npm run knip` re-executed on the branch tip —
  `Unused exports (150)`, `Unused exported types (116)`, `Duplicate exports (2)`, zero
  `lib/schema` findings; `wc -l` confirms 309/289/140/139 = 877 post-sweep vs 878 pre-sweep;
  pre-sweep export surface re-counted from `git show ad7c732^` (19 statements / 18 names).
- **Method summary for repeatability:** `npm run knip` (config `knip.ts`) as the starting
  census → per-export word-boundary grep cross-check with prose-vs-code classification →
  compiler as arbiter (`tsc --noEmit` over the whole repo after the edit) → knip re-run as the
  closing gate (findings 2 → 0).
- **Sibling sessions referenced:** `dead-export-tooling` (`4f4fa3f`, the knip adoption this
  session consumed) and `schema-misc-todos-archive` (`f332d1a`, the same-morning four-dir sweep
  that took the package's coarser findings first).
- **Gates recap:** typegen + tsc exit 0; eslint + prettier clean (`lib/schema`); vitest
  279 files / 5,230 tests passed; knip `lib/schema` 2 → 0. No DB access, no behavior change.
