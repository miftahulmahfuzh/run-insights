# Token-Maxxing Session — 2026-09-13: Repo↔Production Schema Drift Guard

## 🎯 Achievement / End Result
- **Goal of the burn:** A SOLO session (slug `schema-drift-guard`) that generated its own
  five-candidate menu and picked #1: audit the committed migration folder (`drizzle/`) against
  the database it actually runs on, and — if the audit found anything — turn the finding into a
  permanent, executable CI gate rather than another dated prose claim. 112 prior token-maxxing
  sessions had audited *source* exhaustively (knip is down to 2 documented keeps); **not one had
  ever compared the committed schema to the live database.**
- **Concrete changes:** one commit, `ed98d63` ("feat(db): gate the schema against the database it
  actually runs on"), 5 files, +1030/−1:
  - `scripts/check-schema-drift.mjs` — **new**, 520 lines, read-only by design.
  - `tests/db.schemaDrift.test.ts` — **new**, 476 lines, 42 tests, all positive controls.
  - `.github/workflows/ci.yml` — new `Schema drift guard (static half)` step, wired in after
    the data-layer invariant guard.
  - `package.json` — new `ci:schema-drift-guard` script.
  - `lib/db/.workflows/package_readme.md` — a "do not hand-verify this again" pointer, the
    exhaustiveness result, and a row in the db command table.
- **Real value delivered:**
  - **Confirmed a real, live production defect — but it was NOT a new discovery, and this doc
    is deliberately careful about that.** `drizzle/0011_rare_blockbuster.sql` (one statement:
    `ALTER TABLE nina_memory_facts DROP COLUMN confidence`) has been committed, journalled at
    idx 11, and **UNAPPLIED in production since 2026-09-07** — six days — with `db:check` and
    `db:migrate` both green over it the entire time. `lib/db/.workflows/package_readme.md`
    **already documented this by hand on 2026-09-12**, watermark mechanism included. The session
    found that readme mid-run and explicitly recalibrated its own claim of novelty.
  - **The actual contribution is converting a dated, hand-verified claim into an executable
    gate**, plus the two genuinely new facts below. A hand-verified schema claim is exactly the
    kind of assertion that rots silently between readings; this one had already been
    re-established by hand twice in two days.
  - **NEW FACT 1 — exhaustiveness.** The 2026-09-12 check was *targeted* at columns it already
    suspected. This session swept the entire surface: **29 tables, 309 columns, 37 foreign keys,
    31 indexes, 1 unique constraint**. `nina_memory_facts.confidence` is the **only** divergence,
    and the snapshot `prevId` chain is **unbroken** despite the collision-era renumbering (two
    `0011_*` files, no `0014`). The prior hand-check could not say *"and nothing else drifted."*
    This can, and can say it again on demand.
  - **NEW FACT 2 — why it hid for six days with zero symptoms.** Production's `confidence` is
    `integer NOT NULL DEFAULT 100`. The `DEFAULT` means inserts that omit the column still
    succeed, so the drift produces **no error, ever**. It is latent, not breaking — which is
    precisely why nothing surfaced it and why only an explicit comparison could.
  - **Mechanism established from source, not inferred.** Read `node_modules/drizzle-orm/pg-core/
    dialect.js` (confirmed as the code `drizzle-kit migrate` delegates to, by checking that
    drizzle-kit imports `drizzle-orm/<driver>/migrator`): the migrator reads
    `select id, hash, created_at ... order by created_at desc limit 1` and applies an entry only
    `if (Number(lastDbMigration.created_at) < migration.folderMillis)`. The watermark is
    **max(created_at)**, and `created_at` is the journal's `when`. **A migration that loses a
    two-branch race sits below the watermark permanently.** It is not "pending" — no drizzle
    command draws that distinction. `scripts/check-schema-drift.mjs` draws it: applied / pending
    / **STRANDED**.
  - **A gate that CI can actually run.** Static half needs no connection (journal/file bijection,
    duplicate tags, `when` monotonicity, snapshot `prevId` chain) and is what CI runs, because
    CI's `DATABASE_URL` is a dummy localhost string. The live half runs only against a reachable
    database. The script states which half it ran and **exits 0 when it cannot connect**, the
    same posture as `badges:check` — a gate that fails when it merely could not look is a gate
    people delete.
  - **42 tests, all positive controls, proven by mutation testing.** Every test injects the
    defect it claims to catch rather than only asserting a clean tree passes. Six detectors were
    then broken one at a time and each was killed by **exactly its own test**, with the
    unmutated control green at 42/42.
- **Branch:** `token-maxxing-2026-09-13`
- **Merge status:** **landing in progress.** At the time this doc was written, `ed98d63` is on
  `token-maxxing-2026-09-13` and is **not** an ancestor of `main` — verified by
  `git merge-base --is-ancestor ed98d63 main` (false) and by `git log --oneline main | head`,
  whose tip is `a5c4ab0`, showing no merge commit for this session. This is a **solo** session
  that lands its own work, so this line is expected to become "merged" once the merge commit
  exists — but it is deliberately **not** claimed here in advance. (Context: every one of
  today's other 20 session docs asserted a merge status speculatively, and a prior session
  `session-log-audit` had to repair 17 of them. Verify by git, never by this line.)
- **Approx token burn:** high 🔥 — a full recall pass over all 20 same-day session docs plus all
  71 prior ones to establish the "never audited" premise; reading drizzle-orm's migrator source
  to derive the watermark rule rather than guess it; a 309-column live schema sweep with eight
  false positives individually investigated and verified as genuine Postgres aliases; writing
  520 lines of guard and 476 lines of test; and a **six-detector mutation-testing campaign**
  (each mutant run against the full 42-test suite), on top of format/lint/typecheck and a full
  333-file / 5800-test suite run.

## Context & Motivation

### How this idea was chosen
This was a solo session, so it generated its own menu of five candidates and picked the winner
itself:

| # | Candidate | Est. burn | Outcome |
|---|-----------|-----------|---------|
| 1 | 🆕 Repo↔production schema drift audit + permanent CI gate | high | **PICKED** |
| 2 | 🆕 Cron route audit (`app/api/cron/nina`, `app/api/cron/rollup`) — the only route handlers with no test file | med | not taken |
| 3 | 🆕 Auth layer code audit (`auth.ts`, `auth.config.ts`, `proxy.ts`) — only ever doc-audited | med | not taken |
| 4 | 🔁 Extract poll dead-band bug (`components/extract/useExtractionStatus.ts`) | low-med | not taken |
| 5 | 🆕 Stray root files cleanup (`NINA_QUERIES_SPLIT_PLAN.md`, `20260912-201916_code_analyzer.md`) | low | not taken |

**Why #1 won.** The campaign has audited *source* to exhaustion — 112 prior sessions, and knip
is down to two documented keeps. A recall subagent that independently read all 20 of today's
session docs **plus all 71 prior ones** ranked `drizzle/` as *"the single highest-value
un-audited ground — 22 migrations, not one audit session ever."* Two things made that ranking
worth acting on rather than noting: the folder is the boundary between the repo and the one
piece of state the repo cannot roll back, and every existing gate over it (`db:check`,
`db:migrate`) answers a question about the *folder*, never about the *database*. That gap
turned out to contain a real live defect.

### The recalibration that this doc has to be honest about
Partway in, the session found that `lib/db/.workflows/package_readme.md` had **already
documented the stranded `0011_rare_blockbuster` migration by hand on 2026-09-12**, watermark
mechanism and all. The premise "nobody has ever looked at this" was therefore false in spirit:
somebody had looked, once, by hand, the day before. The session did not paper over that. It
restated its own contribution as: *turn a dated hand-verified claim into a gate that re-verifies
on demand, and establish the two things the hand-check could not* — exhaustiveness across the
whole surface, and the reason the drift is symptomless. Overstating the discovery here would
have been the easy version of this doc and the wrong one.

## What We Did (blow-by-blow)

1. **Generated the five-candidate menu** (table above) and picked #1 on the recall pass's
   ranking of `drizzle/` as the highest-value never-audited ground in the repo.
2. **Read `drizzle/` in full**: 22 `.sql` files, `meta/_journal.json`, and the snapshot chain.
   Noted immediately that the folder carries collision-era scars — **two `0011_*` files**
   (`0011_natural_nico_minoru.sql`, `0011_rare_blockbuster.sql`) and **no `0014`** — which is
   the fingerprint of the two-branch migration race documented in prior sessions.
3. **Connected to the live database and asked what it actually contains**, which nothing in the
   toolchain does: `db:check` validates the migration folder against *itself* and never opens a
   connection; `db:migrate` reports what it *decided* to do, and its decision is the bug.
4. **Found the ledger gap**: 21 of 22 journal entries present in `drizzle.__drizzle_migrations`,
   with `0011_rare_blockbuster` absent — and `nina_memory_facts.confidence` still present in
   production as `integer NOT NULL DEFAULT 100`, six days after the DROP COLUMN was committed.
5. **Derived the mechanism from drizzle-orm's own source rather than inferring it.** Confirmed
   `drizzle-kit migrate` delegates to `drizzle-orm/<driver>/migrator`, then read
   `node_modules/drizzle-orm/pg-core/dialect.js`:
   ```
   select id, hash, created_at from drizzle.__drizzle_migrations order by created_at desc limit 1
   ...
   if (!lastDbMigration || Number(lastDbMigration.created_at) < migration.folderMillis) { apply }
   ```
   The watermark is **max(created_at)** and `created_at` is the journal's `when` — not the wall
   clock of the run. An entry applies only if its `when` strictly exceeds the watermark. So when
   two branches each generate a migration and the one with the **later** `when` lands and
   migrates first, the earlier one is stranded below the watermark **permanently**; every
   subsequent `db:migrate` walks past it and exits 0, forever.
6. **Discovered the prior hand-documentation** in `lib/db/.workflows/package_readme.md` dated
   2026-09-12 and **recalibrated the session's claim of novelty on the spot** (see above).
7. **Re-scoped to the thing that was actually missing: an executable gate**, and wrote
   `scripts/check-schema-drift.mjs` in two halves —
   - **static** (no connection): journal↔file bijection, duplicate tags, `when` monotonicity,
     unbroken snapshot `prevId` chain;
   - **live** (reachable `DATABASE_URL` only): classify every journal entry
     applied / pending / **STRANDED**, then diff the snapshot tip against `information_schema` —
     tables, columns, types, nullability, foreign keys, unique constraints, indexes.
8. **Hit the problem that decides whether a gate like this survives**: a naive string comparison
   of types produced **eight false positives on 309 clean columns**. Investigated all eight
   individually rather than blanket-normalising (detail in *Code / Design Details*).
9. **Ran the full sweep** once the comparator was honest: 29 tables, 309 columns, 37 foreign
   keys, 31 indexes, 1 unique constraint — `nina_memory_facts.confidence` the **only**
   divergence, snapshot chain **unforked**.
10. **Caught a self-inflicted accuracy bug in the guard's own output**: the first error message
    asserted the column had *"no default"* about a column it had just printed `DEFAULT 100` for.
    Fixed, and **the corrected wording is now pinned by a test** so it cannot silently regress
    into a misleading claim again.
11. **Wrote `tests/db.schemaDrift.test.ts`** — 476 lines, 42 tests across 7 describe blocks
    (`type normalisation`, `classifyMigrations — the stranded-migration detector`, `diffColumns`,
    `diffNamedObjects`, `checkFolderIntegrity`, `checkSnapshotChain`, `the committed drizzle/
    folder`) — with every test injecting the defect it claims to catch.
12. **Proved the tests by mutation testing.** Broke six detectors one at a time and confirmed
    each was killed by exactly its own test, with the unmutated control green at 42/42:
    | Mutation | Killed by |
    |---|---|
    | watermark → last-row instead of max | its own stranded-classification test |
    | stranded classification disabled | its own test |
    | extra-column check disabled | its own test |
    | serial-sequence (`nextval`) check disabled | its own test |
    | `when` monotonicity disabled | its own test |
    | snapshot-fork check disabled | its own test |
13. **Wired the gate into CI** — `npm run ci:schema-drift-guard`, placed in `.github/workflows/
    ci.yml` right after the data-layer invariant guard, with a comment block explaining that CI
    runs the **static half only** because CI's `DATABASE_URL` is a dummy string.
14. **Updated `lib/db/.workflows/package_readme.md`**: a *"Do not hand-verify this again — run
    `npm run ci:schema-drift-guard`"* pointer, the exhaustiveness result, and a row in the db
    command table describing the guard as *"the only command here that compares the two;
    `db:check` never opens a connection."*
15. **Ran full gates**: `format:check` clean, `eslint` 0 warnings, `tsc --noEmit` clean, full
    suite **333 files / 5800 tests** green.
16. **Committed as `ed98d63`** — after an incident with a concurrent peer session sharing the
    worktree (see *Decisions & Trade-offs → Process incident*).

## Code / Design Details

### The distinction no drizzle command makes
```
applied   — in the journal, in drizzle.__drizzle_migrations
pending   — in the journal, not in the ledger, `when` ABOVE the watermark → will apply
STRANDED  — in the journal, not in the ledger, `when` BELOW the watermark → will NEVER apply
```
`db:migrate` exits 0 over a stranded entry and reports nothing, because from the migrator's
point of view there is nothing to do — the watermark says this entry is in the past. The whole
value of the guard is that third row.

### Type normalisation — the part that decides whether the gate gets used
A naive `snapshotType === information_schema.data_type` compare produced **eight false positives
on 309 clean columns**:

| Snapshot spelling | `information_schema` spelling |
|---|---|
| `timestamp` | `timestamp without time zone` |
| `time` | `time without time zone` |
| `bigserial` | `bigint` (+ a `nextval()` DEFAULT) |
| `numeric(5, 3)` | `numeric` + `numeric_precision=5`, `numeric_scale=3` |

**Every one of the eight was verified as a genuine Postgres alias before being folded**, not
waved away: `numeric(5,3)` confirmed against `numeric_precision=5` / `numeric_scale=3`, and
`bigserial` confirmed against a live `nextval('nina_messages_seq_seq')` default on the column.

The critical design point is the pairing:

> **`bigserial` → `bigint` is folded ONLY in combination with a separate `nextval()` check
> (`checkSerialBacking`).** `serial` is not a type — it is `integer` plus a sequence DEFAULT.
> Folding the *type* therefore cannot hide a *lost sequence*, because the sequence is asserted
> independently. Suppressing that false positive cannot suppress a real defect.

Each rule is documented in the script as an **ALIAS — a pair of spellings Postgres itself treats
as identical — never a widening**. The reasoning is not cosmetic: **a comparator that cries wolf
on a clean database gets deleted**, and a comparator that normalises too eagerly is worse than
none at all because it reports green over real drift.

### Read-only by construction
The script never applies a migration and never writes to the ledger. That is not caution for its
own sake — the repair for a stranded `DROP COLUMN` **destroys data**, so it stays a human
decision with an explicit authorisation step (see *Follow-ups*).

### Exit-code posture
```
no usable DATABASE_URL  → run the static half, SAY SO plainly, exit 0
reachable database      → run both halves, exit 1 on any divergence
```
Modelled on `badges:check`'s "passes on an empty deck and says so" behaviour. The guard
**currently exits 1 locally against production** — that is the live finding reporting itself,
not a broken gate.

## Decisions & Trade-offs

- **Turned the finding into a gate instead of fixing the database.** The remediation is
  irreversible and destroys data (4 production rows carry a non-default `confidence` value), so
  it needs explicit human authorisation. A read-only guard that reports the problem every time
  anyone asks is strictly more durable than a one-off repair plus another dated prose note —
  which is exactly the artifact that already existed and had to be re-verified by hand twice in
  two days.
- **Did not silence the guard's local exit 1.** It fails locally against production *because the
  drift is real*. Adding an allowlist entry for the one known divergence was considered and
  rejected: the first thing an allowlist does is make the next divergence invisible.
- **Ran the static half in CI rather than provisioning a real database for CI.** CI's
  `DATABASE_URL` is a dummy localhost string. The static half — bijection, duplicate tags,
  monotonicity, snapshot chain — is precisely the half that catches the *arrangement* that
  strands a migration, before it ever reaches production. Standing up a real database in CI to
  run the live half would be a much larger commitment for a check a developer machine already
  performs correctly.
- **Investigated all eight type false positives individually instead of blanket-normalising.**
  The cheap fix (lowercase, strip parens, compare prefixes) would have produced a green gate that
  could not see a genuine type change. Each fold is a verified alias with a test pinning it.
- **Made every test a positive control, then mutation-tested them.** "The clean tree passes" is
  compatible with a detector that does nothing at all. Injecting the defect proves the detector
  fires; breaking the detector proves the test is the thing catching it. Six mutants, six
  distinct kills.
- **Fixed the guard's own misleading error message.** The first draft asserted "with no default"
  about a column whose `DEFAULT 100` it had printed two lines earlier. A gate that mis-describes
  what it found trains readers to disbelieve it; the corrected wording is now test-pinned.

### Process incident — `git add` is shared state in a shared worktree
A **concurrent Claude session sharing this worktree ran `git commit` while this session's files
were staged in the shared git index.** Its commit `f315192` swept **both** sessions' work into a
single commit under *its own* message, on *this* session's branch, and left its own
`package.json` line uncommitted (because the staged `package.json` was this session's variant).

**Nothing reached `main`.** The peer reset and re-landed its work cleanly on `origin/main` as
`e836926` containing only its 6 files; this session fast-forwarded onto that and committed its
own 5 files separately as `ed98d63`. Earlier in the session a `git stash -u` / `git stash pop`
round-trip over the peer's in-flight files also succeeded, but was riskier than it should have
been.

> **LESSON:** in a shared worktree with a live peer, **`git add` is a shared-state mutation**.
> Stage and commit in one uninterrupted step, and read `git diff --cached --stat` immediately
> before committing.

## Follow-ups & YAGNI notes

### Production remediation — deliberately NOT done, needs explicit human authorisation
The repair is two statements and is **irreversible**:
```sql
ALTER TABLE nina_memory_facts DROP COLUMN confidence;
-- plus, into drizzle.__drizzle_migrations, the (hash, created_at) pair
-- for 0011_rare_blockbuster  (created_at = 1788786634959)
```
It **destroys data** — 4 rows carry a value — so it is left to the user, by design.

**Backfilling that ledger row is SAFE with respect to the watermark**, and this was checked
rather than assumed: the watermark is `max(created_at)`, and this row's `created_at`
(`1788786634959`) is **below** the current max, so inserting it cannot lower the watermark and
cannot cause any migration to re-apply.

### Not a bug: the guard's local exit 1
It exits 1 locally against production **by design** — that is the live finding. It exits 0 in CI
(static half only). Do not "fix" it.

### Un-audited ground the recall pass surfaced and this session did not take
- `app/api/cron/*` — cron routes, **the only route handlers in the repo with no tests**
- `app/actions/share.ts`
- `types/next-auth.d.ts`
- `lib/nina/tools.ts` — 847 lines, **never named in any session doc**
- `lib/photos/` — a real swallowed-`cause` bug was found here **by a linter rather than by an
  audit**, which is itself a signal about where audit attention has not gone

### Known live items from the recall pass, untouched
- 21 stale `lib/nina/actions.ts:<line>` / `lib/db/schema.ts:<line>` citations
- `lib/llm` dead-roadmap citations, including one **inside a runtime error string**
  (`lib/llm/vision.ts:58`)
- `ConversationTurn` newly unused in `lib/nina/context.ts`

## Appendix

**Commit:**
```
ed98d63 feat(db): gate the schema against the database it actually runs on
```
```
 .github/workflows/ci.yml            |  14 +
 lib/db/.workflows/package_readme.md |  20 +-
 package.json                        |   1 +
 scripts/check-schema-drift.mjs      | 520 ++++++++++++++++++++++++++++++++++++
 tests/db.schemaDrift.test.ts        | 476 +++++++++++++++++++++++++++++++++
 5 files changed, 1030 insertions(+), 1 deletion(-)
```

**Verification performed:** `npm run format:check` clean; `eslint` **0 warnings**;
`npx tsc --noEmit` clean; full suite **333 files / 5800 tests** green; **mutation testing** over
six detectors, each killed by exactly its own test, unmutated control 42/42.

**Merge-status verification (as of doc write):**
```
$ git merge-base --is-ancestor ed98d63 main   # → NOT IN MAIN
$ git log --oneline main | head -1
a5c4ab0 docs: update changelog for v1.1.0
```
No merge commit for this session exists on `main` yet — hence **landing in progress**, not
"merged". Re-derive from git rather than trusting this line.

**The collision-era fingerprint in `drizzle/`:** 22 `.sql` files, two numbered `0011`
(`0011_natural_nico_minoru.sql`, `0011_rare_blockbuster.sql`), and no `0014` — yet the snapshot
`prevId` chain is **unbroken**, which the guard now asserts on every run.

**Related:** `lib/db/.workflows/package_readme.md` (the 2026-09-12 hand-verified note this
session turned executable); user memory notes `migration-collision-regenerate-never-rename`,
`repo-has-one-database-dev-is-production`, `drop-column-applies-after-the-deploy`, and
`green-gates-answering-the-wrong-question` — the last of which names this exact failure shape:
*name the question a green gate answered before believing it answered yours.*
