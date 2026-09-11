# Token-Maxxing Session — 2026-09-12: Lib DB Package Readme Compaction & Re-verify

## 🎯 Achievement / End Result
- **Goal of the burn:** A WORKER session (slug `pkg-readme-lib-db`) pre-assigned one idea by
  the coordinator (`tokenmax-orch-2026-09-12`): compact
  `lib/db/.workflows/package_readme.md` (1,098 lines) — trim the stale/redundant sections and
  **verify every remaining claim against the current code**. Why this idea won the
  coordinator's assignment: highest recurring-context ROI in the repo's doc set — `lib/db` is
  imported by ~90 files, so this readme is loaded as recurring context (context-loader) by
  every task touching the persistence layer, and 48% of it was plan-era narrative — including
  deploy-state warnings that had gone stale **in both directions** (five obsolete
  "committed but NOT applied" warnings, while the one *real* unapplied migration went
  unrecorded).
- **Concrete changes:** 3 files, +186/−624, one commit (`356c5f4`) —
  `lib/db/.workflows/package_readme.md` (1,098 → 657 lines, **−40% of a file every `lib/db`
  task pays to load**), plus header-comment alignment in `lib/db/schema.ts` and
  `lib/db/queries.ts` so source and readme state the same facts.
- **Real value delivered:**
  - The compaction itself is the modest half: ~520 lines of per-phase "Recent changes"
    narratives (P1-DB-A000/A001/A003/A004/A006, nina-character-tuning, P1-RI-A029/A040)
    became a ~20-row documentation-history table — their decisions were already folded into
    the live sections (the entries themselves said "see the gotcha above"), and the stories
    live in `docs/plans/archive/` and git history.
  - The real value was the **verification harvest** — claims the file made that current code
    had falsified, each found by measuring the tree or production rather than trusting the
    doc: a deleted type still in the Exit list (`MonthlyTotal`), a whole table missing from
    the "complete" inventory (`appSettings`), a module-private union listed as exported
    (`AdapterAccountType`), db-instance importer counts off by 2× ("five files" → measured
    ten; 60 source / 72 static / 90 including dynamic), a scoping invariant claiming
    "exactly one exception" when there are two, a cascade claim falsified by migration 0013,
    pointers at the retired ROADMAP/RECONCILIATION contract docs, and migration names that no
    longer exist in the journal.
  - **THE BIG ONE — a real deploy-state defect found by measuring production**: read-only
    psql over `.env.local`'s DATABASE_URL showed **20 of 21 journal entries applied**, and
    the one miss — `0011_rare_blockbuster` (`DROP COLUMN nina_memory_facts.confidence`) — is
    not "pending" but **watermark-skipped**: its journal `when` is older than the newest
    applied row, so `db:migrate` will skip it silently **forever**. Production still holds
    the orphaned column (inert — the schema declares none and no code reads it). The readme
    previously carried five obsolete "committed but NOT applied" warnings for 0016/0017
    while missing this actual one; it now records the true deploy state plus the repair shape
    (hand `DROP COLUMN` + a constructed journal fix — `db:generate` cannot see it).
  - Memory updated: `migration-collision-regenerate-never-rename` gained a section — the
    skip hazard it warned about **materialized**, and journal-`when` timestamp matching can't
    distinguish "skipped" from "restamped"; the reliable check is by *effect*
    (`information_schema`), not timestamps.
  - Verification method worth recording: every claim re-derived (all 28 index names grepped,
    PKs spot-read, 12 test suites counted, union exports grepped, ninaTuning's 37-column
    arithmetic checked, `git diff` from the readme's last-touch commit `0798fc4` to HEAD to
    bound what could have gone stale) — then an adversarial reviewer subagent re-derived the
    risky counts **independently** with specifier-exact parsing and found seven
    discrepancies, four substantive, all fixed in the same commit.
- **Branch:** `token-maxxing-2026-09-12-pkg-readme-lib-db`
- **Merge status:** on branch, **NOT merged** — this is a worker session; the coordinator
  owns landing worker branches.
- **Approx token burn:** high for a docs-only diff (est. ~0.6M, input-dominated) — the burn
  went into the full re-derivation of ~40 claims across schema, migrations, tests, and
  importers, git archaeology from `0798fc4`, one production measurement, and an independent
  adversarial re-derivation by a reviewer subagent that was then itself corrected. 🔥

## Context & Motivation
The 2026-09-12 token-maxxing day ran as an orchestrated fan-out: a coordinator session
(`tokenmax-orch-2026-09-12`) spawning worker sessions on per-session branches, each handed a
pre-assigned idea. This worker's assignment was the persistence layer's package readme — the
same recurring-context-cost problem the day's other sessions attacked in other bloated
package readmes, but at the largest scale: at 1,098 lines, `lib/db/.workflows/package_readme.md`
was the second-biggest readme in the repo, and `lib/db` is the most-imported package in it
(~90 files eventually reach it).

The economics are specific: a context-loader hands this file to every task that touches the
persistence layer, so every line in it is a recurring tax paid on every future `lib/db` task.
Half the file wasn't even reference material — it was per-phase narrative ("Recent changes"
entries written at plan-landing time), which is history, not map. Worse than the size was the
staleness: the file's factual claims were written across eight days of churn
(2026-09-04 → 2026-09-11) with no re-verification pass, and yesterday's `lib-db-queries-yagni`
session had deleted code the readme still documented as present. The assignment therefore
paired the trim with a hard requirement: nothing survives into the compacted file unverified.

## What We Did (blow-by-blow)
1. **Bounded the staleness window before reading a claim.** `git log` on the readme found its
   last-touch commit (`0798fc4`); `git diff 0798fc4..HEAD` over `lib/db/` and the migration
   directory enumerated everything that changed *underneath* the doc since it was written —
   the universe of claims that could have rotted. (Yesterday's dead-code session alone
   accounted for six deletions the readme still named.)
2. **Compacted 1,098 → 657 lines.** The ~520 lines of per-phase "Recent changes" narratives
   (P1-DB-A000/A001/A003/A004/A006, nina-character-tuning, P1-RI-A029/A040) were folded into
   a single ~20-row **Documentation history** table (date | task/set | what changed in this
   package | current migration filename), with the section's preamble stating where the
   stories went (`docs/plans/archive/`, git history) and why the table is enough — the
   decisions were already folded into the live sections; several old entries literally
   pointed back up the page ("see the gotcha above").
3. **Re-derived every claim in the file rather than copy-editing it.** All 28 index names in
   the schema grepped against `schema.ts`; primary keys spot-read; the 12 test suites counted
   on disk; union/type exports grepped for real import sites; `ninaTuning`'s 37-column
   arithmetic re-checked; every importer claim re-counted. The harvest of falsified claims
   (each fixed in the same commit):
   - **`MonthlyTotal` documented in the Exit list but deleted** by yesterday's
     `lib-db-queries-yagni` session (along with `getMonthlyTotals`/`fillZeroMonths`).
   - **The `appSettings` table (migration `0020_image_gen_controls`) was missing entirely**
     from the readme's "complete" table inventory.
   - **`AdapterAccountType` listed as an exported union but is module-private**; and
     `NinaPromiseReward` was missing from the same list.
   - **"Only five files import the db instance" — measured: ten.** The Nina turn pipeline
     (`chatturn`/`turnrevive`/`searchActions`) bypasses `lib/nina/queries.ts` and imports the
     db instance directly, as do `lib/admin/memoryStore.ts` and `lib/llm/textModel.ts` (the
     `app_settings` reader). Importer counts updated to measured numbers: **60 source / 72
     static / 90 including dynamic test imports**.
   - **The scoping invariant's "exactly one exception" is wrong** — `listActiveUserIds` is a
     second sanctioned exception beside `getRunByShareToken`. The source's own header comment
     in `queries.ts` overstated the same way; both were fixed.
   - **"The session cascade chains through `nina_message_images.message_id`" was falsified
     by `0013_fixed_serpent_society`**, which made that FK `ON DELETE SET NULL`: image rows
     now survive message-less (for the blob reaper to collect). The gotcha was rewritten
     around the actual current behavior.
   - **`ROADMAP_v0.1.0`/`RECONCILIATION_v0.1.0` pointers at retired docs** (retired in
     `204fd34`): the readme — and `schema.ts`'s own header — pointed at ghosts. Both now
     point at `.workflows/plan/nina-chatbot/RECONCILIATION_RULINGS.md`, with the correct
     count of ten R-x rulings (R-1..R-28's surviving set), not the old text's "six places" /
     eight names.
   - **Migration-name rot**: the readme documented `0012_nina_shortcuts.sql`, which no longer
     exists (renumbered `0012_messy_carlie_cooper` in the TaskID/migration collision era),
     and described a journal that doesn't match reality — the journal has two `0011_*` files
     and no `0014`. The Migrations section was rewritten around the **live journal**, with
     the renumbering history preserved in the Documentation-history table's rows instead.
4. **Measured production deploy state — the big one.** Read-only psql over `.env.local`'s
   DATABASE_URL (the one production database — there is no separate dev): checked the
   migrations table and `information_schema` per claimed column. Result: **20 of 21 journal
   entries applied**; the missing one is `0011_rare_blockbuster` (`ALTER TABLE
   nina_memory_facts DROP COLUMN confidence`) — and it is structurally unappliable by the
   normal path, because its journal `when` is **below the applied watermark** and
   `db:migrate` skips entries older than the newest applied row. It will be skipped silently
   forever. Production still holds the orphaned column — inert (the drizzle schema declares
   no `confidence`, no code reads it), so this is an ops follow-up, not an incident. The
   readme's five old "committed but NOT applied" warnings for 0016/0017 — all of which had
   long since been applied — were replaced by this one true warning, plus the repair shape:
   a hand `DROP COLUMN` plus a constructed journal fix (`db:generate` cannot see a column
   the schema doesn't declare).
5. **Aligned the two source-header comments with the same facts** so source and readme can't
   drift apart again: `schema.ts`'s header now says the v0.1.0 contract docs are retired and
   names where the rulings live; `queries.ts`'s header states the scoping invariant with
   **exactly two** exceptions, and `listActiveUserIds`'s own doc-comment now reads "the
   second sanctioned exception" with the allowlist note that a *third* still has to be
   argued for in a diff.
6. **Ran an adversarial reviewer subagent over the risky counts.** It re-derived the
   importer/type/surface counts independently — using specifier-exact import parsing rather
   than line greps — and found **seven discrepancies** in the first-pass rewrite, four
   substantive: the importer counts (the first-pass line-grep had given 76/62, inflated by
   import-like lines inside comment quotes), a dead example file (`MemorySlots.tsx`) still
   implied present, the retired ROADMAP pointer missed in one place, and a row-type count of
   four that is actually six. All four (plus three cosmetic) were fixed within the same
   commit — the commit hash certifies the corrected numbers, not the first draft.
7. **Gates:** `npx prettier --check` clean; `next typegen` + `npx tsc --noEmit` exit 0 (the
   doc-only diff touches two `.ts` header comments, so the type gate matters even here).
8. **Committed as `356c5f4`** on the worker branch and stopped — no merge, no push; the
   coordinator lands worker branches.

## Code / Design Details

**The compacted readme's shape** (headings as landed; 657 lines):
```
# Package: db
## Overview                — what the package is, the scoping rules, load order
## Exported API            — schema tables + types, query functions (verified against source)
## Internal Architecture
## Dependencies
## Reverse Dependencies    — the measured importer counts (60 source / 72 static / 90 incl. dynamic)
## Concurrency
## Error Handling
## Performance
## Usage
## Notes
  ### Deploy state of the journal   — kept short, points at Migrations → Deploy state
  ### Documentation history         — the ~20-row table that replaced 520 lines of narrative
```

**The deploy-state paragraph as landed** (the fact most likely to rot, stamped with its
measure date):
```
**Deploy state (verified 2026-09-12 against production, by the migrations table and
`information_schema`):** 20 of the 21 journal entries are applied. … The one unapplied entry
is **`0011_rare_blockbuster`** (`ALTER TABLE nina_memory_facts DROP COLUMN confidence`) — and
it is not "pending" but **skipped**: its journal `when` is older than the newest applied row,
and the migrator only applies …
```

**The Documentation-history table** — the mechanism that replaced the narratives. One row per
landed change, four columns (Date | Task/set | What changed in this package | Migration
(current filename)); rows carry the collision-era renames inline, e.g.:
```
| 2026-09-07 | P1-DB-A004 (emoji shortcuts) | new `nina_shortcuts` and its matcher-side contract | `0012_messy_carlie_cooper` (minted as `0012_nina_shortcuts`) |
| — | drop shortcut/ledger confidence | `nina_memory_facts` − `confidence` | `0011_rare_blockbuster` — **unapplied; see Deploy state** |
```

**The source-header alignment** (`lib/db/queries.ts`):
```
 * every statement it runs. Exactly TWO exceptions: `getRunByShareToken` (§9), unscoped by
 * contract because the 96-bit token *is* the credential, and `listActiveUserIds` (§8), a
```
and on the function itself: "the second sanctioned exception … the allowlist so a THIRD
exception still has to be argued for in a diff."

**The measured-importer lesson.** The first-pass count (76 static / 62 source) came from a
line-level grep for import statements; the adversarial pass parsed specifiers exactly and got
72 static / 60 source — the delta was import-*like* text inside comment quotes. The dynamic
channel (90 total) is mostly test files importing `lib/db` inside `vi.mock` factories and
string specifiers.

## Decisions & Trade-offs
- **Measure the tree and production; never propagate the doc.** The assignment's core
  discipline. Every one of the eight substantive fixes above was a claim that *read* plausibly
  and was wrong — including five deploy-state warnings that were the exact opposite of the
  truth. A compaction pass that only trimmed would have enshrined all of them in a smaller,
  more confident-looking file. The production measurement was read-only and went through
  `DATABASE_URL` knowing it *is* production (the repo has one database — "dev" is production).
- **Adversarial re-derivation, not self-review.** The counts the rewrite asserted were
  re-derived by a second agent with a *different method* (specifier-exact parsing vs line
  grep), which is what made the method error visible — a re-check with the same method would
  have reproduced the same inflated numbers. Cost: one subagent run and a humbling diff; the
  alternative was publishing 76/62.
- **Fold, don't delete, the history.** The 520 narrative lines were reduced, not erased:
  decisions already lived in the live sections (the entries self-referenced them), the stories
  live in `docs/plans/archive/` and git history, and the new table preserves the one fact the
  narratives had that nothing else did — the mapping from task to *current* migration filename,
  including the collision-era renames. The table also keeps the `0011_rare_blockbuster` row
  visible in history while the Deploy-state section explains it.
- **Restate source-header comments rather than cross-reference them.** The two `.ts` header
  fixes were one-line comment edits, deliberately made so the readme and the code say the same
  thing about the two facts a reader is most likely to act on (the scoping exceptions; where
  the retired rulings live). The known cost is duplication — see the follow-up below.
- **Stamped volatile facts with their measure date.** Deploy state says "verified 2026-09-12"
  in its first line, and the Notes section keeps the pointer short precisely because it is the
  fact most likely to have changed since writing (and it has changed twice before this
  session). A future reader is told to re-measure, not to trust.
- **Scope discipline.** Exactly 3 files: the readme and the two header comments. No code, no
  migration, no attempt to *fix* the skipped 0011 as part of a docs session — a hand `DROP
  COLUMN` against production is an ops decision, not a ride-along.

## Follow-ups & YAGNI notes
- **The orphaned prod column needs an ops decision someday**: `nina_memory_facts.confidence`
  is hand-droppable (`ALTER TABLE … DROP COLUMN`) but only with a **constructed journal fix**
  — a fresh migration can't see it, and `db:generate` won't emit anything for a column the
  schema doesn't declare. The readme records the repair shape. Not urgent: the column is
  inert (nothing reads it, schema declares none).
- **Header-comment duplication is a standing debt.** `schema.ts` and `queries.ts` headers now
  restate readme facts. The agreed rule going forward: if the readme grows a second copy of
  *volatile* numbers again, prefer pointing at the journal/schema (the primary source) instead
  of restating — only stable facts belong in two places.
- **"Package readme volatile numbers rot" is now confirmed, twice.** The pattern (recorded by
  another session) held exactly here: counts rot fastest, deploy-state warnings rot hardest.
  This rewrite stamped volatile facts with their measure date; the next compaction should
  start from those dates and re-measure anything older than the last `lib/db` change.
- **The 90-including-dynamic importer count will drift upward** as the turn pipeline grows;
  the readme now states the three tiers (60/72/90) separately so a partial recount updates one
  tier instead of silently invalidating one lump number.

## Appendix

**Files touched:**
```
lib/db/.workflows/package_readme.md | 789 ++++++++----------------------------
lib/db/queries.ts                   |  12 +-
lib/db/schema.ts                    |   9 +-
3 files changed, 186 insertions(+), 624 deletions(-)
```

**Verification performed:** all 28 schema index names grepped against `schema.ts`; PKs
spot-read; 12 test suites counted on disk; union exports grepped for import sites;
`ninaTuning`'s 37-column arithmetic re-checked; `git diff 0798fc4..HEAD` bounding the
staleness window; production deploy state measured read-only (migrations table +
`information_schema` per claimed column → 20 of 21 applied, `0011_rare_blockbuster`
watermark-skipped, orphaned `confidence` column confirmed present); adversarial reviewer
subagent re-derived risky counts with specifier-exact import parsing (7 discrepancies found,
4 substantive, all fixed pre-commit); `npx prettier --check` clean; `next typegen` +
`npx tsc --noEmit` exit 0.

**Git evidence chain:** `0798fc4` (readme's last-touch commit before this session — the
staleness window's start); yesterday's `lib-db-queries-yagni` landing (deleted
`getMonthlyTotals`/`fillZeroMonths`/`MonthlyTotal` et al. that the readme still listed);
`0013_fixed_serpent_society` (made `nina_message_images.message_id` FK `ON DELETE SET NULL`,
falsifying the cascade claim); `204fd34` (retired the ROADMAP/RECONCILIATION v0.1.0 contract
docs); `0020_image_gen_controls` (added `app_settings`, absent from the old inventory);
`356c5f4` (this session).

**Session identity:** worker session `pkg-readme-lib-db`, spawned by coordinator
`tokenmax-orch-2026-09-12` on 2026-09-12; branch
`token-maxxing-2026-09-12-pkg-readme-lib-db`; final commit `356c5f4`; not merged (coordinator
lands worker branches).
