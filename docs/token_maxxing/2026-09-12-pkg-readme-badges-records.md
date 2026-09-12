# Token-Maxxing Session — 2026-09-12: pkg-readme-badges-records (Combined Pair Readme)

## 🎯 Achievement / End Result
- **Goal of the burn:** Write the standing `package_readme.md` that
  `lib/badges` + `lib/records` were owed after their same-day YAGNI sweep
  (`f903ef4`, worker `badges-records-yagni` of this same coordinator) — the
  sweep that deleted both barrels and censused all 82 exports but left neither
  package the map/rules doc every other swept package now has. The coordinator
  pre-assigned the idea (worker mode — no menu was generated): **one combined
  doc for both packages**, because the pair is one subsystem and no
  per-package doc can hold the seam.
- **Concrete changes:** One commit on
  `token-maxxing-2026-09-12-pkg-readme-badges-records`:
  - `1f20955` — *docs(lib/badges,lib/records): first package_readme.md — the
    gamification pair's map, rules and seam*: **`lib/badges/.workflows/package_readme.md`**,
    one new file, **338 insertions**, markdown-only (no source, no tests, no
    config touched).
- **Real value delivered:**
  - **The first standing doc for the gamification pair** — 338 lines holding
    what no single-file read can show: the shared trigger contract
    (`lib/derived/invalidate.ts`'s `onRunCommitted` with its
    **records-then-badges ordering, load-bearing**), one art pipeline
    (`tools/` decks), one CI guard (`check-badge-art.mjs`), a shared
    `runs.started_at` column read **two deliberate ways** (string lexical
    compare in badges vs seconds-past-midnight int in records), and the strict
    **one-way dependency** — badges imports records; records must never import
    badges, enforced by precedent and `compute.ts`'s private
    `clockToSeconds`, not by any lint rule.
  - **The placement decision recorded IN the doc:** `lib/` is not a package
    (no `.workflows/` of its own), so the combined doc lives at
    `lib/badges/.workflows/package_readme.md` and **explicitly declares itself
    lib/records' readme too**, with a do-not-fork-silently instruction — the
    header states "one doc for both" before any content.
  - **Two self-falsified claims caught before landing** (the method working as
    designed): the "one non-cascade FK" framing copied from
    `invalidate.ts`'s own stale comment was checked against `schema.ts:859`,
    which says **TWO** deliberate `SET NULL` FKs (`badges.run_id` and
    `nina_messages.run_id`) — the doc states the schema's version; and the
    gateway read-function count was corrected from a plausible 7 to the actual
    **10 reads + 2 writers** by counting the import blocks rather than
    trusting a skim.
  - **A verifier trap recorded for the next sweep:** the reverse-dependency
    grep done statically returned empty for the three gateway/db test files —
    `tests/badges.gateway.test.ts`, `tests/records.gateway.test.ts`,
    `tests/db.queries.recordsAndBadges.test.ts` reach the pair through
    `await import(...)` behind `vi.mock` — and the empty result was caught as
    the tool's bug (per house discipline: an empty result contradicting a
    known fact is your bug, not a fact), redone with exact-quote greps, and
    the dynamic-import trap written into the doc's gotchas.
- **Branch:** `token-maxxing-2026-09-12-pkg-readme-badges-records` (worker
  `tokenmax-pkg-readme-badges-records` under coordinator
  `tokenmax-orch-2026-09-12`; the yagni sweep `f903ef4` is an ancestor of this
  branch).
- **Merge status:** merged (commit `6d4b139`)
- **Approx token burn:** 🔥🔥 — audit-dominant over a docs diff: all 17 source
  files across both packages read **in full** before a line of the doc was
  written, plus the grep passes (broken first reverse-dep grep, exact-quote
  redo, dynamic-import sweep), plus the two falsification checks. The output
  side is one new markdown file.

## Context & Motivation

This was a `--worker` session of the parallel coordinator
`tokenmax-orch-2026-09-12`, spawned hours after the sibling
[badges-records-yagni](./2026-09-12-badges-records-yagni.md) sweep finished
the pair's dead-code audit. That sweep's shape is worth restating because it
explains this session: it deleted both barrels (`lib/badges/index.ts`,
`lib/records/index.ts`) on the evidence that every consumer imports a direct
submodule path — and recorded its harvest of deliberate non-removals
(`RECORD_ART_SMALL_SIZE` as generator output, the F25 `.small` bet, the three
test-only exports). What it did not leave behind was the standing doc: the
pair was now swept, mapped in a session transcript, and undocumented on disk.

The seven-readme fan-out earlier the same day (`pkg-readme-root`,
`pkg-readme-lib-admin`, `pkg-readme-lib-db`, `pkg-readme-nina-lib`,
`pkg-readme-nina-cmp`, `pkg-readme-admin-cmp`, and
[scripts-readme-compact](./2026-09-12-scripts-readme-compact.md)) closed the
repo's *compaction* debt; this session is the counterpart — a package that had
**no readme at all** getting its first one. And the assigned idea's premise,
kept intact because it was right: the honest shape is **one combined doc**.
`lib/badges` alone cannot state why `recompute.ts` must finish before
`evaluate.ts` runs; `lib/records` alone cannot state why its catalog must stay
type-only-importable for the strip-types backfill script. The seam lives
between them.

## What We Did (blow-by-blow)

**1. Read all 17 source files in full before writing.** Both packages —
`lib/records` (7 files) and `lib/badges` (10 files) — read end to end, per the
read-first rule that matters doubly when writing the map: a doc written from
headers inherits the headers' drift. This is where the session spent most of
its burn, and deliberately so (see the two falsifications below for what the
full reads bought).

**2. Reverse-dependency census — and the tool's bug caught live.** The first
reverse-dep grep (who imports the pair) returned empty for the test gateway
files. A known fact (the badges/records suites exist and import the modules)
contradicted by a tool result means the tool is wrong, not the fact — per the
house rule. Re-done with exact-quote greps, which found the static importers;
then a dedicated **dynamic-`await import()` pass** was added on top, which
found the three files the static pass missed:
`tests/badges.gateway.test.ts`, `tests/records.gateway.test.ts`, and
`tests/db.queries.recordsAndBadges.test.ts` — each importing through
`await import(...)` behind `vi.mock` so module dependencies can be replaced
per-test. A name-based or static-only census would have recorded three test
suites as nonexistent consumers. Recorded in the doc's gotchas as a standing
verifier trap.

**3. Two falsifications by direct source check, pre-landing.**
   - **The "one non-cascade FK" claim.** `lib/derived/invalidate.ts` carries a
     comment saying the badge FK is *the* non-cascade one; the draft doc
     echoed it. Direct read of `schema.ts:859` says **two deliberate `SET
     NULL` FKs** in a cascade-everywhere-else file: `badges.run_id` and
     `nina_messages.run_id`. The doc states the schema's version and the
     comment stands as an instance of documented-elsewhere drift.
   - **The gateway function count.** A skim said "7 reads"; counting the
     actual import blocks says **10 reads + 2 writers** across the two
     gateways. Corrected before landing.

**4. Wrote the doc — map, not territory.** 338 lines to the house readme
conventions (standing rules up top, per-area wiring, reverse wiring, gotchas,
verification stamp, volatile counts stamped with their measure date):
- **Overview** of the two write shapes: `lib/records` = recompute-and-
  wholesale-replace current truth (full DELETE + INSERT, absence is
  meaningful); `lib/badges` = append-only never-revoked ledger, `ON DELETE
  SET NULL` per R-22 so an award survives the run that earned it.
- **Eight standing rules**, including: the one-way dependency; R-42 threshold
  single-sourcing (thresholds live in `catalog.ts` and copy interpolates —
  including Nina's `patterns.ts` reading `BADGE_THRESHOLDS.lateStartAfter`);
  pure → orchestrator → server-only-gateway layering on both sides; catalog
  order everywhere; generated TOTAL-`Record` art files never hand-edited;
  record-key backfill requirement (with the F32 lesson); silent degradation
  for retired keys; and `records/catalog.ts` must stay type-only-importable
  for `scripts/backfill-record-keys.mjs` under
  `node --experimental-strip-types`.
- **File maps** for all 17 files; **the commit pipeline as ASCII data**;
  **the two-write-shapes table**; **read paths** (`/me`, run detail, Nina);
  **reverse wiring** (Nina's 4 modules; the components;
  `scripts/backfill-record-keys.mjs` importing `lib/records/catalog.ts` under
  strip-types; `scripts/backfill-badge-run-ids.mjs` whose `PERIOD_KEYS`
  literal is guarded by `tests/badges.catalog.test.ts`; `tools/decks.py`;
  `next.config.ts` immutable headers); **13 gotchas** (the
  dynamic-import-verifier trap among them); a **12+4-file testing map**;
  error posture; performance envelope; **verification stamp dated
  2026-09-12**.

**5. Gates.** `prettier --check` green on the new file (the repo's
`format:check` covers `.md`, so markdown IS format-gated). The diff is
markdown-only, so `tsc`/`vitest` are not applicable gates here — there is no
compilable surface. `git status` clean after the commit.

## Code / Design Details

### Why one doc, placed in badges

The pair's coupling is not incidental sharing; it is one contract with two
halves:

```
onRunCommitted (lib/derived/invalidate.ts)
        │
        ▼  records first — recompute.ts wholesale DELETE+INSERT
   [lib/records]  ── current truth: 11 keys, absence is meaningful
        │
        ▼  then badges — evaluate.ts appends, never revokes
   [lib/badges]   ── fact ledger: 22 keys, ON DELETE SET NULL (R-22)

one-way import edge:  badges ──▶ records   (never the reverse)
shared column:        runs.started_at
                        badges: string lexical compare
                        records: seconds-past-midnight int (clockToSeconds)
one CI guard:         check-badge-art.mjs over both decks
one art pipeline:     tools/ decks.py → promoters → *-art.ts
```

The ordering arrow is load-bearing: badges are awarded against the *freshly
recomputed* records, so evaluating badges before records would pin awards to
stale truth. No per-package doc can hold the ordering, the shared-column
duality, or the one-way edge — hence the combined file. Placement: `lib/` is
not a package and has no `.workflows/` home of its own, so the doc lives at
`lib/badges/.workflows/package_readme.md` and its header declares
"**one doc for both**", with an explicit do-not-fork-silently instruction so
the next records-side editor doesn't split it by accident.

### The two falsifications, side by side

| Draft claim | Source of the claim | Ground truth found | Doc now states |
|---|---|---|---|
| "one non-cascade FK" | `invalidate.ts`'s own comment (stale) | `schema.ts:859`: **two** deliberate `SET NULL` FKs — `badges.run_id`, `nina_messages.run_id` | the schema's version |
| gateway has "7 reads" | skim of `evaluate.ts`/`recompute.ts` imports | import blocks count **10 reads + 2 writers** | the counted number |

Both were caught by the same discipline: a claim written into a draft is
checked against the primary source before commit, and a comment is not a
primary source.

### The dynamic-import verifier trap

`tests/badges.gateway.test.ts`, `tests/records.gateway.test.ts` and
`tests/db.queries.recordsAndBadges.test.ts` do not `import` the pair
statically — they `await import(...)` inside test bodies with `vi.mock`
installed, so the mock replaces the real module. Consequences for any future
liveness/readme census: a static import grep undercounts the pair's consumer
set by three suites, and `vi.mock` hoisting means even the dynamic specifier
may sit far from the assertion that depends on it. The doc's gotchas state
the trap; the verification stamp says the reverse-wiring census was taken by
exact-quote grep **plus** the dynamic pass.

## Decisions & Trade-offs

**One combined doc vs two per-package docs.** Two docs would match the repo's
one-readme-per-package convention but would each have to hand-wave the seam —
the ordering, the shared column, the one-way edge live *between* the
directories. Decision: one doc, with the header declaring both packages and
an explicit anti-fork instruction. Recorded in the doc itself so the decision
is discoverable, not folklore.

**Echo the schema, not the comment.** When `invalidate.ts`'s comment and
`schema.ts` disagree, the schema wins — and the doc now carries the schema's
version while the code comment remains wrong elsewhere. Fixing the
`invalidate.ts` comment was out of scope (markdown-only diff by design); the
discrepancy is visible to anyone who reads both, which is the honest state a
docs-only session can leave.

**Count imports, don't skim them.** The 7→10 correction came from counting
import-block entries rather than trusting a first impression. Cost: minutes.
Value: the doc's gateway contract section names the real surface a consumer
can inject against.

**Docs-only diff kept docs-only.** No drive-by comment fix in
`invalidate.ts`, no `tsc`/`vitest` re-run theater over a `.md` change. The
applicable gates are the ones that read markdown: prettier, and the
source-extension-only OpenRouter boundary guard (which prose cannot trip —
the guard scans only source extensions by design, so `{pkg}/.workflows/plan/`
prose and this readme can never falsely fail it; see the tools readme's
gotcha on exactly this).

## Follow-ups & YAGNI notes

- **`invalidate.ts`'s stale "one non-cascade FK" comment** — the schema says
  two. One-line comment fix; deliberately untouched here to keep the diff
  markdown-only, recorded so the next session that touches
  `lib/derived/invalidate.ts` fixes it at the site.
- **The yagni sweep's open findings remain open as written there** (the doc's
  Notes section points at them rather than re-litigating): the generator
  `*_SMALL_SIZE` emission question in `tools/make_badge_assets.py`, the F25
  `.small` pre-generation bet, and the test-only-export restructure
  (`isBadgeKey`/`previousIsoWeek`/`badgesForRun`).
- **No lint rule for the one-way edge.** The badges→records-only dependency
  is enforced by precedent (`compute.ts`'s private `clockToSeconds`) — a
  future `dependency-cruiser`/import-boundary rule could make it mechanical;
  noted in the doc, not built (YAGNI: one violation in the pair's history,
  zero tooling warranted yet).
- **Volatile counts are stamped, not asserted** (the package-readme memory
  rule): 22/11 catalog counts, the 10+2 gateway surface, the 17-file map all
  carry the 2026-09-12 measure date, so the next drift pass measures the
  delta instead of trusting the prose.

## Appendix

### Commits

- `1f20955` — docs(lib/badges,lib/records): first package_readme.md — the
  gamification pair's map, rules and seam
  (`lib/badges/.workflows/package_readme.md`, 1 file, +338/−0)
- (this commit) — docs(token_maxxing): this session doc + index row

### Verification evidence (2026-09-12, this tree)

```
git show 1f20955 --stat    # 1 file changed, 338 insertions(+)
                           #   lib/badges/.workflows/package_readme.md
prettier --check lib/badges/.workflows/package_readme.md   # green (format:check covers .md)
git status --porcelain      # clean after commit
```

Markdown-only diff → `tsc`/`vitest` not applicable gates.

### References

- [2026-09-12-badges-records-yagni.md](./2026-09-12-badges-records-yagni.md) —
  the same-day sibling sweep (`f903ef4`) whose liveness map and non-removal
  harvest are this doc's evidence base; this session is the map half of the
  pair's two-session treatment.
- [2026-09-12-tools-package-hygiene.md](./2026-09-12-tools-package-hygiene.md) —
  the art pipeline's own first readme (same coordinator, same day); the pair
  doc's "generated TOTAL-Record art" rule cross-references its rules.
- [2026-09-12-scripts-readme-compact.md](./2026-09-12-scripts-readme-compact.md) —
  the same-day verification pass over `scripts/`, whose two backfill scripts
  appear in this doc's reverse wiring.
- `lib/badges/.workflows/package_readme.md` — the deliverable itself
  (338 lines).
