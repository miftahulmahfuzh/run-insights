# Token-Maxxing Session — 2026-09-13: Schema/LLM/Insights/Review Deep Read

## 🎯 Achievement / End Result
- **Goal of the burn:** A WORKER session (slug `schema-llm-insights`) in a coordinator
  fan-out (coordinator `tokenmax-orch-2026-09-13`), pre-assigned one idea verbatim, with no
  menu of candidates offered: deeply read four large, never-individually-audited files
  spanning four different packages — `lib/db/schema/nina/chat.ts` (759 lines),
  `lib/llm/facts.ts` (702 lines), `lib/insights/load.ts` (560 lines), and
  `lib/review/draft.ts` (518 lines) — for dead code, doc drift, and docs-compaction
  opportunities. The coordinator's stated rationale: these four span four packages
  untouched by any of today's other already-landed sessions.
- **Concrete changes:** one commit (`d20a0d5`, already on this branch before this doc-update
  workflow ran) touching two markdown files: `lib/db/.workflows/package_readme.md` and
  `docs/architecture.md`. No source code changed — this was a documentation-only session.
- **Real value delivered:**
  - **Dead-code verdict: none, confirmed.** Every exported symbol from all four target
    files was checked against the whole repo (not just `lib/` and `tests/` — an early
    narrower grep pass had to be redone to also cover `app/`, `components/`, `scripts/`,
    `tools/`, `types/`, `research/`) and cross-validated against a full `npm run knip` run.
    Zero dead exports found in any of the four files; knip's full-repo run reported only 2
    unused exports and 3 unused types total, repo-wide, none in these four files or their
    packages. This is a real, verified negative result, not an unchecked assumption.
  - **Found a stale "no-importers" row-types list and extended it, not deleted the types.**
    `lib/db/.workflows/package_readme.md` already documented `NinaChatSession`/
    `NewNinaChatSession` as intentionally-kept schema row types with zero importers (part of
    the public row-type contract, for future callers). A full-repo grep (including
    `components/`) found the same is true of six more types declared in
    `lib/db/schema/nina/chat.ts` — `NinaTurn`, `NewNinaTurn`, `NinaMessage`,
    `NewNinaMessage`, `NinaMessageImage`, `NewNinaMessageImage` — none of which knip flags
    (it doesn't treat an `$inferSelect`/`$inferInsert` type alias as unused while its table
    import is live), so this was a grep-only finding the tooling could not have surfaced.
    Fixed by extending the documented list from 2 entries to 8.
  - **Caught two-layered doc drift in `lib/db/.workflows/package_readme.md`.** It was
    compacted at 06:18 on 2026-09-12, but three token-maxxing sessions —
    `db-schema-split`, `nina-queries-split`, `db-queries-split` — landed *later that same
    day* (21:03, 22:33, 23:27, all verified via `git log` timestamps), splitting the
    monolithic `schema.ts`/`queries.ts` into per-domain modules
    (`schema/auth.ts`, `schema/runs.ts`, `schema/nina/chat.ts`, `queries/errors.ts`,
    `queries/runs.ts`, etc.) behind unchanged `export *` barrels. The readme still described
    both as single files ("the whole Postgres schema in one file"). Fixed the Overview, the
    Key Responsibilities bullet, both file-section headers/intros, the row-types list (see
    above), and the Documentation History table.
  - **Caught the same drift's second-order echo in `docs/architecture.md`.** Its own
    2026-09-12 "drift-corrected" pass ran at 05:59 — *before* `nina_error_logs` was added
    (08:53) and before the schema/queries splits (21:03+) — so its "Table inventory (28, in
    `lib/db/schema.ts`)" line was stale on two independent counts: the count should be 29
    (missing `nina_error_logs` from both the total and the Platform-domain table row), and
    the file-layout description needed the same barrel-over-modules correction. Fixed both
    and recorded a second drift-correction pass in the doc's header banner, dated
    2026-09-13.
  - **Spot-checked (not blindly trusted) the other two packages' readmes** —
    `lib/llm/.workflows/package_readme.md` and `lib/review/.workflows/package_readme.md`,
    both authored fresh on 2026-09-12 — against current `facts.ts`/`draft.ts` content and
    the CI/test surfaces they cite (`ci:llm-payload-guard`, a guarded-symbol count of 9,
    `tests/llm.factsHash.test.ts`, `tests/review.draft.test.ts`,
    `lib/schema/extractedSession.ts`). Both found accurate; no changes made — a verified
    clean bill, not a skipped check.
  - **Correctly declined a docs-compaction temptation.** Considered and rejected
    stripping the dense rationale comments inside the four target files themselves
    (`chat.ts`/`facts.ts`/`load.ts`/`draft.ts` carry permanent decision records — "RULING
    C2", measured numbers, named prior incidents — as established house style for schema
    and payload-boundary files). Recognizing established convention rather than treating
    verbosity as automatically compactable was itself part of the audit's value.
- **Branch:** `token-maxxing-2026-09-13-schema-llm-insights`
- **Merge status:** on branch, not merged — this is a WORKER session in a coordinator
  fan-out (coordinator `tokenmax-orch-2026-09-13`); the coordinator owns merging worker
  branches to main, not the worker itself.
- **Approx token burn:** moderate — four full-file reads (759 + 702 + 560 + 518 = 2,539
  lines), a repo-wide exported-symbol audit redone after an initial pass under-scoped its
  grep, a full `npm run knip` run, `git log` timestamp reconstruction across three sibling
  sessions' landing times, and two markdown files rewritten in the sections the drift
  actually touched. 🔥

## Context & Motivation
This was a WORKER session in the 2026-09-13 token-maxxing fan-out, coordinated by
`tokenmax-orch-2026-09-13`. Unlike a solo session that generates its own menu of candidate
ideas, this worker received one idea pre-assigned by the coordinator verbatim: deeply audit
four specific large files — `lib/db/schema/nina/chat.ts`, `lib/llm/facts.ts`,
`lib/insights/load.ts`, `lib/review/draft.ts` — for dead code, doc drift, and
docs-compaction opportunities, on the stated grounds that these four span four packages
untouched by any of today's other already-landed sessions and have never been individually
audited despite their size (759, 702, 560, and 518 lines respectively).

This assignment sits squarely in the same lineage as the day's other YAGNI/doc-drift
sweeps (`lib-admin-yagni`, `lib-metrics-yagni`, `admin-explorer-yagni`, and the prior day's
`db-schema-split`/`nina-queries-split`/`db-queries-split`), but targets a combination of
files that spans package boundaries in a way none of the day's per-package sweeps had
covered — `lib/db/schema/nina/chat.ts` sits inside the just-split schema barrel,
`lib/llm/facts.ts` and `lib/review/draft.ts` are the LLM payload-boundary and review-diff
layers respectively, and `lib/insights/load.ts` is the DB-fetching half that feeds
`facts.ts`. Reading all four together surfaced the row-types drift specifically because
`chat.ts` (the schema file) and the readme documenting it (`lib/db`'s) had fallen out of
sync on exactly the same day three sibling sessions split that package's files.

## What We Did (blow-by-blow)
1. **Read all four target files in full**, no skimming: `lib/db/schema/nina/chat.ts` (759
   lines — the `ninaTurns`, `ninaChatSessions`, `ninaMessages`, and `ninaMessageImages`
   table definitions plus their inferred row types); `lib/llm/facts.ts` (702 lines — the
   LLM payload-boundary fact builders); `lib/insights/load.ts` (560 lines — the DB-fetching
   half that feeds `facts.ts`'s inputs); `lib/review/draft.ts` (518 lines — the
   `ReviewDraft` shape and its corrections-diff logic).
2. **Dead-code hunt, redone after an under-scoped first pass.** The first grep pass checked
   every exported symbol from the four files against `lib/` and `tests/` only, which would
   have missed importers living in `app/`, `components/`, `scripts/`, `tools/`, `types/`,
   or `research/`. Recognizing the gap, the search was redone against the whole repo tree.
   Cross-validated the manual result against a full `npm run knip` run — the repo's adopted
   standing dead-export instrument. Verdict: no dead code in any of the four files; knip's
   full-repo report showed only 2 unused exports and 3 unused types total, repo-wide, none
   attributable to these four files or the packages they belong to.
3. **Found the one exception worth recording rather than silently passing over.** knip does
   not flag `NinaTurn`, `NewNinaTurn`, `NinaMessage`, `NewNinaMessage`, `NinaMessageImage`,
   or `NewNinaMessageImage` (all `$inferSelect`/`$inferInsert` row types declared in
   `chat.ts`) as unused — it treats a type alias derived from a live table import as live,
   regardless of whether the alias itself has an importer. But a full-repo grep, including
   `components/`, found zero importers of any of these six types anywhere. This is not new
   dead code to remove: the repo's own `lib/db/.workflows/package_readme.md` already
   documents two sibling types (`NinaChatSession`, `NewNinaChatSession`) as intentionally-
   kept "no importers" row types — part of the schema's public row-type contract for future
   callers. The finding was that this documented list was stale/incomplete by six entries.
4. **Doc-drift hunt across the four files' home packages**, which surfaced the session's
   real, dated findings:
   - `lib/db/.workflows/package_readme.md` was compacted at 06:18 on 2026-09-12, but three
     token-maxxing sessions — `db-schema-split`, `nina-queries-split`, `db-queries-split` —
     landed *later that same day* (21:03, 22:33, 23:27 respectively, confirmed via `git log`
     timestamps on their commits), splitting `schema.ts` and `queries.ts` from monolithic
     files into barrels (`export *`) over one-file-per-domain modules (`schema/auth.ts`,
     `schema/runs.ts`, `schema/nina/chat.ts`, etc.; `queries/errors.ts`, `queries/runs.ts`,
     etc.). The readme still described both as single files ("the whole Postgres schema in
     one file (`schema.ts`)"). This is the "readme reads stale the same day it was written"
     pattern the day's other sessions have repeatedly found — compaction happening before a
     same-day split, not days later.
   - `docs/architecture.md` had a second-order version of the identical problem: its own
     2026-09-12 "drift-corrected" pass ran at 05:59, *before* `nina_error_logs` was added
     (08:53) and before the schema/queries splits (21:03+) that same day. Its "Table
     inventory (28, in `lib/db/schema.ts`)" line was therefore stale on two independent
     counts — the table count should be 29 (missing `nina_error_logs` entirely from both
     the total and the Platform-domain table row), and the file-layout description needed
     the same barrel-over-modules correction the readme got.
   - Spot-checked `lib/llm/.workflows/package_readme.md` and
     `lib/review/.workflows/package_readme.md` (both authored fresh on 2026-09-12, already
     carrying their own verification notes from that day) against the current content of
     `facts.ts`/`draft.ts` and the test/CI surfaces they cite (`ci:llm-payload-guard`, a
     guarded-symbol count of 9, `tests/llm.factsHash.test.ts`, `tests/review.draft.test.ts`,
     `lib/schema/extractedSession.ts`). Both found accurate — no drift, no changes made.
5. **Fixed the confirmed drift** in a single commit: updated `lib/db/.workflows/package_readme.md`'s
   Overview, Key Responsibilities bullet, both file-section headers/intros, extended the
   row-types "no importers" list from 2 to 8 entries, and added rows to the Documentation
   History table recording the two splits and this fix. Updated `docs/architecture.md`'s
   table count (28 → 29), the Platform-domain table row (added `nina_error_logs`), the
   file-layout description, and extended the header banner to record a second
   drift-correction pass dated 2026-09-13.
6. **Considered docs-compaction and rejected it for the four target files' own comments.**
   The dense rationale blocks inside `chat.ts`/`facts.ts`/`load.ts`/`draft.ts` — permanent
   decision records citing named rulings ("RULING C2"), measured numbers, and prior
   incidents — are the repo's established house style for schema and payload-boundary
   files, not accidental verbosity. Stripping them would destroy load-bearing context the
   rest of the codebase's own conventions treat as intentional. No compaction was applied
   to any of the four files themselves; the only compaction-adjacent output of this session
   is the doc-drift fixes above, which are net documentation-quality improvements rather
   than a size reduction.
7. **Verified before considering the session done.** Ran `npx prettier --check` on both
   edited markdown files — clean. Because no source code changed (a documentation-only
   session), no `tsc`/vitest run was required; the only artifacts touched were the two
   markdown files.

## Code / Design Details
This session touched no application code — the deliverable is documentation accuracy, not
a code change. The load-bearing "diff" is conceptual: a readme and an architecture doc each
had a barrel-vs-monolith description that fell behind the same-day file splits that made it
obsolete, plus a `NinaChatSession`-shaped precedent for row types with no importers that
turned out to be six types short.

**Row-types "no importers" list, before → after** (illustrative shape, not a literal diff):
```
before: NinaChatSession, NewNinaChatSession
after:  NinaChatSession, NewNinaChatSession, NinaTurn, NewNinaTurn,
        NinaMessage, NewNinaMessage, NinaMessageImage, NewNinaMessageImage
```

**Table inventory correction in `docs/architecture.md`:**
```
before: Table inventory (28, in lib/db/schema.ts)
after:  Table inventory (29, in lib/db/schema/**), + nina_error_logs row added
        to the Platform-domain table
```

## Decisions & Trade-offs
- **Extended the row-types list rather than removing the six undocumented types.** knip
  doesn't flag them (a live table import keeps the derived type alive in its model), and
  the repo already has an established precedent — `NinaChatSession`/`NewNinaChatSession` —
  for keeping schema row types with zero current importers as part of the public contract
  for future callers. Treating the six new findings the same way (document, don't delete)
  keeps the schema's row-type contract consistent rather than inventing a new rule for
  these six alone.
- **Fixed `docs/architecture.md`'s drift as a second, independent pass rather than folding
  it silently into the `lib/db` readme fix.** The two documents drifted for different
  reasons at different times (the readme was compacted mid-day before the splits landed;
  the architecture doc's own correction pass ran even earlier, missing both the splits and
  a same-day column addition), so the header banner records a distinct, dated
  drift-correction entry rather than conflating two separate staleness windows into one.
- **Declined to compact the four target files' own comments.** Recognizing "this dense
  comment is house style, not bloat" is itself a judgment call this session made
  deliberately, rather than defaulting to "big file → shrink it."
- **Did not expand the audit beyond the four assigned files' home packages.** The
  spot-checks on `lib/llm` and `lib/review` readmes were scoped to verifying the two files
  actually assigned (`facts.ts`, `draft.ts`), not a fresh full audit of either package —
  consistent with the coordinator's fan-out model where other sessions own other slices.

## Follow-ups & YAGNI notes
- **Deliberately NOT done, on YAGNI grounds:** no deletion of the six undocumented row
  types (matches the repo's own kept-for-future-callers precedent); no compaction of the
  four target files' own rationale comments (established house style, not accidental
  bloat); no broader re-audit of `lib/llm` or `lib/review` beyond the two assigned files
  (both packages' readmes were only spot-checked against `facts.ts`/`draft.ts`
  specifically, and found accurate); no merge to main (worker session; the coordinator's
  job).
- A future full-package audit of `lib/llm` or `lib/review` (beyond just `facts.ts`/
  `draft.ts`) is still open territory if a future session wants it — this session's
  spot-check only confirmed those two specific files and their readmes' claims about them,
  not every other file in either package.

## Appendix

**Commit on this branch (worker, not yet merged):**
```
d20a0d5 docs(db): fix doc drift left by the same-day schema/queries file splits
```

**Files changed:**
- `lib/db/.workflows/package_readme.md`
- `docs/architecture.md`

**Verification performed:** exported-symbol audit of all four target files against the
whole repo tree (`app/`, `components/`, `lib/`, `scripts/`, `tests/`, `tools/`, `types/`,
`research/`), redone after an initial narrower pass under-scoped its search; a full
`npm run knip` run cross-validating the manual dead-code result (2 unused exports / 3
unused types repo-wide, none in scope); `git log` timestamp checks confirming
`db-schema-split` (21:03), `nina-queries-split` (22:33), and `db-queries-split` (23:27)
all landed on 2026-09-12 after the `lib/db` readme's 06:18 compaction that same day, and
that `docs/architecture.md`'s 05:59 drift-correction pass predated both `nina_error_logs`
(08:53) and the three splits; `npx prettier --check` clean on both edited markdown files.

**Session identity:** worker session `schema-llm-insights`, spawned by coordinator
`tokenmax-orch-2026-09-13`; branch `token-maxxing-2026-09-13-schema-llm-insights`;
worktree `/home/miftah/.worktrees/run-insights/tokenmax-2026-09-13-schema-llm-insights`;
commit `d20a0d5`; not merged — the coordinator lands worker branches.

**Related sessions:** `2026-09-12-db-schema-split.md`, `2026-09-12-nina-queries-split.md`,
`2026-09-12-db-queries-split.md` (the three same-day splits whose landing this session's
doc-drift fix accounts for); `2026-09-12-pkg-readme-lib-db.md` (the `lib/db` readme's prior
compaction, whose 06:18 timestamp this session found predated the splits);
`2026-09-12-docs-architecture-readme-refresh.md` (the architecture doc's prior
drift-correction pass, whose 05:59 timestamp this session found predated both
`nina_error_logs` and the splits); `2026-09-12-pkg-readme-llm.md` and
`2026-09-12-pkg-readme-review.md` (the two other packages' readmes this session
spot-checked and found still accurate).
