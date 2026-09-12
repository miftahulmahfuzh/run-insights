# Token-Maxxing Session — 2026-09-12: DB Queries Split Into Domain Modules

## 🎯 Achievement / End Result
- **Goal of the burn:** a WORKER session (slug `db-queries-split`) of coordinator
  `tokenmax-orch-2026-09-12` — the idea was **pre-assigned, so there was no Step-4 idea menu**.
  The assignment, in substance: *"Split `lib/db/queries.ts` (1735 lines, the largest unsplit
  file in `lib/db`) into domain-grouped modules behind a barrel at `lib/db/queries.ts`,
  preserving every function signature and behavior exactly."* Why this file: `db-schema-split`
  had already applied the identical pattern to `schema.ts` (a pure reorg with zero runtime
  risk), and `queries.ts` was **the one file in `lib/db` that pattern was never applied to** —
  now the single largest remaining reading-cost unit outside `lib/nina`.
- **Concrete changes:** ONE commit, `c312fb0` — "refactor(db): split lib/db/queries.ts into
  14 domain modules behind the barrel" — **21 files changed, +1928/−1748**:
  - `lib/db/queries.ts` rewritten as a **68-line barrel**: a layout-map header carrying the
    two invariant essays (userId-scoping **D8**, reviewed-data **D16/R-13**), the
    `db.batch`-over-`db.transaction` rationale, and the single-import-path rule; under it,
    13 `export *` lines (the 14th module, `internal`, is deliberately NOT re-exported).
  - **14 new domain modules** under `lib/db/queries/`, preserving the original §1–§9 section
    structure of the monolith: `errors` (§1), `internal` (§2 — `runBatch` + `Statement`,
    kept off the barrel as sibling plumbing), `ownership` (§3 — correlated-EXISTS predicates
    + `assert*` helpers), `runs` (§4 — review commit, corrections, intent, run reads, Nina
    attachments; the largest at 434 lines), `rollups` (§5 — reviewed-only aggregates,
    lifetime totals, plus the cron's `listActiveUserIds` directory read), `badgeReads` (§5b —
    F09's badge-rule reads), `extractions` (§6 — the append-only audit trail), `photos` (§7 —
    R-1's two-parent screenshot lifecycle), and the §8 per-table split — `profile`,
    `insights`, `records`, `badges`, `shares` — plus `sharedRun` (§9, THE one unscoped read).
    Function bodies, signatures and comments moved **verbatim**; the only wording edits are
    cross-references that named the monolith by section number.
  - **Guards and tests that source-grepped the monolith by path repointed in the same
    commit** so no bisect point has a red suite (details below — this is where the session's
    real work was): `scripts/check-data-layer-invariants.mjs`,
    `tests/db.queries.extractions.test.ts`, `tests/db.queries.shares.test.ts`.
  - **Three prose claims the split falsified** repointed: `lib/db/schema.ts`'s "enforced in
    lib/db/queries.ts", `lib/push/queries.ts`'s "is 1500 lines", and
    `docs/architecture.md`'s resolver-query location. Archived plan docs deliberately keep
    original wording — they are historical records.
- **Real value delivered:**
  - **The reading-cost monolith is gone without changing a single import.** 1735 lines
    becomes a 68-line barrel plus 14 files of 24–434 lines each (1808 lines total incl.
    imports/headers). Every consumer in the repo keeps importing from `@/lib/db/queries`;
    the barrel re-export surface is **proven identical, not asserted**: all **71/71 exported
    names** match old vs new with the same declaration kinds (mechanical check), plus
    typecheck over every consumer.
  - **The invariant guard now scans what actually holds the invariants.**
    `scripts/check-data-layer-invariants.mjs` grepped `lib/db/queries.ts` **by path** for
    BOTH invariants — after the split it would have **passed vacuously** (a barrel declares
    nothing). It now scans the barrel + every module file, reports the offending *file*, and
    `runBatch` joins its documented exception list (plumbing, not a query). Positive-
    controlled by planting a synthetic offender and watching both checks fire.
  - **Two source-grepping tests survive honestly.** `tests/db.queries.extractions.test.ts`
    reads the file's source twice (append-only grep + `jsonb_typeof` assertion) — repointed
    to `queries/extractions.ts`, and its pointer to a CI script that **no longer exists**
    (`check-extractions-append-only.mjs`) now names the guard that actually runs.
    `tests/db.queries.shares.test.ts` counts unscoped exports from the file source —
    repointed to the **union of sources**; its expected list is now exactly four names, with
    `runBatch` documented in place.
  - **Zero-drama bisectability:** the guard/test/doc repoints landed in the same commit as
    the split, so every commit in history either has the monolith with its old guards or the
    split with its new ones — never a red intermediate.
- **Gates, all green:** `npm run typecheck` (next typegen + `tsc --noEmit`); **full vitest
  296 files / 5,402 tests passed**; eslint clean; prettier clean (after collapsing two
  import blocks); knip **zero findings in any touched file**; **`next build`** — the barrel's
  bundler-level proving gate, run for real (real `node_modules`, not the symlink).
- **Branch:** `token-maxxing-2026-09-12-db-queries-split` (HEAD `c312fb0`)
- **Merge status:** on branch — the **coordinator lands the merge; this worker never merges**.
- **Approx token burn:** high (est. ~1M, input-dominated — repeated full-file reads of the
  1735-line monolith and its consumers, plus the 5,402-test sweep) 🔥

## Context & Motivation
`lib/db/queries.ts` held every read and write the application performs. At 1735 lines it was
the largest unsplit file in `lib/db` — the only one the `db-schema-split` session's pattern
(a barrel over domain modules, identical import path, pure verbatim reorg) had never been
applied to. That pattern's virtue is that it is *boring*: zero runtime risk, no behavior
change, proven by mechanical surface comparison rather than review effort. The assignment
took the one file in the package where the pattern still applied, outside `lib/nina` (which
its own splits had already covered — see `2026-09-12-nina-queries-split.md`).

The deceptively simple part of the assignment is "preserve every function signature and
behavior exactly." The signatures were mechanical. The real risk lived **elsewhere in the
repo**: scripts and tests that assert on the *file's source text by path*. A naive split
leaves every one of them passing vacuously or failing loudly — and the vacuous ones are the
danger, because they are green.

## What We Did (blow-by-blow)
1. **Read the monolith and mapped its sections.** The original file's header already organized
   itself §1–§9; the split keeps those numbers in the module headers so history and old
   references stay greppable ("the § numbers in the module headers are this file's original
   monolith sections").
2. **Mirrored the schema.ts barrel pattern exactly.** `lib/db/queries.ts` rewritten as a
   barrel whose layout-map header carries the two invariant essays verbatim-plus-paths
   (userId-scoping **D8**, with its exactly-two exceptions named; reviewed-data **D16/R-13**),
   the `db.batch` rationale (neon-http `db.transaction()` throws; `db.batch` is one HTTP
   round trip AND atomic), and the single-import-path rule. 14 domain modules under
   `lib/db/queries/`, bodies/signatures/comments moved verbatim.
3. **Proved the surface identical mechanically:** 71/71 exported names identical old vs new,
   same declaration kinds — plus typecheck over every consumer.
4. **Hunted the hidden couplings** — the actual work of the session:
   - **`scripts/check-data-layer-invariants.mjs`**: grepped `lib/db/queries.ts` by path for
     BOTH invariants. After the split it would have **passed vacuously** — a barrel declares
     nothing. It now scans the barrel + every module file, reports the offending file
     (file-scoped failures), and `runBatch` joins its documented exception list (plumbing,
     not a query). **Positive-controlled**: planted a synthetic offender, watched both checks
     fire, removed it.
   - **`tests/db.queries.extractions.test.ts`**: source-greps the file twice (append-only
     grep + `jsonb_typeof` assertion). Repointed to `queries/extractions.ts`; its pointer to
     `check-extractions-append-only.mjs` — a CI script that no longer exists — now names the
     real guard.
   - **`tests/db.queries.shares.test.ts`**: counts unscoped exports from the file source.
     Repointed to the union of sources; the expected list is now exactly four names, with
     `runBatch` documented.
   - **Three prose claims the split falsified**: `lib/db/schema.ts` ("enforced in
     lib/db/queries.ts"), `lib/push/queries.ts` ("is 1500 lines"),
     `docs/architecture.md` (resolver-query location). Archived plan docs keep original
     wording on purpose.
5. **Ran the full gate stack** (below) and landed everything in one commit.
6. **One mid-flight correction worth remembering:** `listActiveUserIds` was briefly misfiled
   into `insights.ts` — it is the cron's directory read over runs, so it belongs in
   `rollups.ts`. Moved before any commit; the barrel's invariant essay now names its module
   explicitly as one of the two scoping exceptions.

## Code / Design Details
The new barrel (`lib/db/queries.ts`, 68 lines) — header essays, then the re-exports:

```ts
export * from './queries/errors'
export * from './queries/ownership'
export * from './queries/runs'
export * from './queries/rollups'
export * from './queries/badgeReads'
export * from './queries/extractions'
export * from './queries/photos'
export * from './queries/profile'
export * from './queries/insights'
export * from './queries/records'
export * from './queries/badges'
export * from './queries/shares'
export * from './queries/sharedRun'
```

…with `queries/internal` deliberately absent: `runBatch` and `Statement` are plumbing for
sibling modules, not public surface. The module→section map:

| Module | § | Owns | Lines |
|--------|---|------|-------|
| `errors.ts` | §1 | NotFoundError, DuplicateRunError, isUniqueViolation | 38 |
| `internal.ts` | §2 | runBatch + Statement (NOT re-exported) | 25 |
| `ownership.ts` | §3 | correlated-EXISTS predicates + assert* helpers | 71 |
| `runs.ts` | §4 | review commit, corrections, intent, run reads, Nina attachments | 434 |
| `rollups.ts` | §5 | reviewed-only aggregates, totals, cron user directory | 241 |
| `badgeReads.ts` | §5b | F09's badge-rule reads over reviewed runs | 254 |
| `extractions.ts` | §6 | the append-only audit trail | 198 |
| `photos.ts` | §7 | R-1's two-parent screenshot lifecycle | 104 |
| `profile.ts` / `insights.ts` / `records.ts` / `badges.ts` / `shares.ts` | §8 | one table each | 24/113/33/81/43 |
| `sharedRun.ts` | §9 | THE one unscoped read | 149 |

Line counts measured 2026-09-12 via `wc -l` (stamped per the volatile-numbers rule).

The invariant-essay header keeps the two essays that made the monolith worth reading whole:
every exported per-user function takes `userId` first and scopes every statement by it
(exactly TWO exceptions — `getRunByShareToken`, unscoped by contract because the 96-bit
token *is* the credential, and `listActiveUserIds`, a directory read with nothing to scope;
"Never add a third"), and every rollup/list/chart/record/badge input filters
`runs.reviewed_at IS NOT NULL` — enforced function-by-function by
`tests/db.queries.reviewedOnly.test.ts`, because the failure mode (a missing filter on the
eleventh query) is silent and produces a plausible wrong number.

## Decisions & Trade-offs
- **One commit for split + guard/test/doc repoints.** A split commit that leaves a
  path-grepping guard pointing at the barrel would fail (or, worse, pass vacuously) at that
  bisect point. Bundling keeps every bisect point either "monolith with old guards" or
  "split with new guards".
- **The guard scans barrel + modules rather than just `queries/*.ts`.** A module-only scan
  would miss invariant statements that live in the barrel header; a barrel-only scan is the
  vacuous-pass trap this whole fix exists to close. File-scoped failure messages point the
  next editor at the actual offender.
- **`internal.ts` stays off the barrel.** `runBatch`/`Statement` were never importable
  public API through the old file's *intended* surface; not re-exporting them makes the
  accidental-import failure loud instead of silently blessed.
- **§ numbers kept in module headers.** Old references (memory files, plan docs, this log)
  say "§6" or "§5b"; keeping the numbering in the new headers keeps those pointers true
  without editing history.
- **Prose repoints limited to what the split falsified.** `lib/admin/users.ts`, `lib/nina/*.ts`
  and `proxy.ts` prose that says "lib/db/queries.ts" remains *true through the barrel* and
  was left untouched. Archived plan docs keep original wording — historical records.

## Follow-ups & YAGNI notes
- The guard could someday also enforce **"every module file is re-exported by the barrel"**
  and **"no file outside lib/db imports a queries/ module directly"** — deliberately not
  added now: knip (unused-export detection) plus tsc (unresolvable deep imports aren't
  blocked by tsc, but nothing deep-imports today, and the single-import-path rule is
  documented in the barrel) cover the real failure modes at zero added machinery.
- Pre-existing knip findings (82, in `lib/env.ts` / `lib/metrics` / `fakeDb` etc.) are
  **untouched by this diff** — out of scope for a pure reorg.
- The handful of prose references to `lib/db/queries.ts` in `lib/admin/users.ts`,
  `lib/nina/*.ts` and `proxy.ts` remain accurate through the barrel; no edit needed.

## Appendix
- Commit: `c312fb0` — 21 files changed, +1928/−1748 (`git show --stat c312fb0`).
- Layout after: `lib/db/queries.ts` 68-line barrel + `lib/db/queries/` 14 modules, 1808
  lines total.
- Surface proof: 71/71 exported names, identical declaration kinds, old vs new; typecheck
  over every consumer.
- Gates: `npm run typecheck`; vitest **296 files / 5,402 tests**; eslint; prettier; knip
  (zero findings in touched files); `next build`.
- Guard positive-control: synthetic offender planted → both invariant checks fired → removed.
- Sibling sessions this pattern mirrors: `2026-09-12-db-schema-split.md` (schema.ts), and in
  spirit `2026-09-12-nina-queries-split.md` (the Nina side of the same idea).
