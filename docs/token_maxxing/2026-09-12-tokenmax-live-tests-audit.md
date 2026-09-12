# Token-Maxxing Session — 2026-09-12: Live & Integration Test Suites Audit

## 🎯 Achievement / End Result
- **Goal of the burn:** A WORKER session (slug `live-tests-audit`) pre-assigned one idea by
  the coordinator (`tokenmax-orch-2026-09-12`). The assignment, paraphrased from the brief:
  audit `tests/live/` and `tests/integration/` for staleness — are the live (real-API-key)
  tests still documented, runnable, and distinct from the integration suite, or is there
  dead/duplicate test scaffolding? The area had **never been reviewed by any prior
  token-maxxing session** — the two-day campaign swept lib packages, components, scripts,
  todos ledgers, package readmes and docs, but the two opt-in (money- and
  database-touching) suites at the repo's edge were untouched territory.
- **Concrete changes:** 2 worker commits, 9 files, +33/−33, docs-comment + script-line
  only — zero behavior change to any suite's assertions — plus a fourth fix landed by the
  coordinator as `8714456` on the same branch (finding 4 below):
  - `1cee232` ("test: one key gate for the live suites, and test:live selects tests/live
    by path") — `package.json` (the generic `test:live` script), `tests/live/loadEnvLocal.ts`
    (new exported `hasRealLlmKey()`), and the five live suites
    (`narrate`/`nina`/`ninaVision`/`vision`/`ninaImageE2E` `.live.test.ts`) consolidated
    onto it, plus the one comment that documented the old name-based pickup updated;
  - `8fbca54` ("docs: live-suite comment covers both models; stamp the unit-test count") —
    `vitest.config.ts`'s exclusion rationale (still named only `glm-4.6v` from the suite's
    vision-only era) and `README.md`'s unit-test count (5,093 → **5,187**, stamped
    "measured 2026-09-12" per the repo's volatile-numbers practice).
- **Real value delivered:**
  - **The verdict, reached by census rather than skim: the area is NOT stale.** It is
    actively maintained, exhaustively self-documenting (docblocks explain *why* at every
    trap), and free of dead scaffolding. Documentation is current (README test section,
    package_readme vitest row), fixtures all exist, model names in comments match
    `.env.local` (`glm-4.6v` vision / `glm-5.3` text), `NINA_IMAGE_DAILY_CAP=30` matches
    the suite's "(30 at this writing)" claim, the CI env block mirrors `setup.ts`'s
    sentinels, and `loadEnvLocal` is imported only by `tests/live` exactly as its docblock
    claims. A negative result with receipts — the most expensive kind to fake.
  - **One real bug found and fixed: the generic `test:live` script selected tests by NAME
    substring** (`vitest run --dir . --testNamePattern=live`). A simulation showed it
    collected **55 tests, of which only 11 are the actual live suites** — 44 bystander
    unit tests across 27 files ("the defaults live in TypeScript", `lib/nina/live.test.ts`
    as a *filename*, "no live share"…) would execute under the live suites' 180-second
    timeout and money-gate semantics. Fixed to `LLM_LIVE_TEST=1 vitest run tests/live`,
    selecting by path the same way the five per-target `test:live:*` scripts already did.
  - **One key gate consolidated:** the "is this a real `LLM_API_KEY`" predicate was
    hand-rolled in **three shapes** across the five live files (a 4-line conjunction ×3, a
    placeholder `Set` in vision, a variadic `realKey` in ninaImageE2E). A new sentinel
    added to one copy and not the others would silently change which suites run where.
    All now ask one exported `hasRealLlmKey()` in `loadEnvLocal.ts` — the module every
    file already imports first. (ninaImageE2E keeps its generic `realKey` for
    `OPENROUTER_API_KEY`/`BLOB_READ_WRITE_TOKEN`, which have different sentinel stories.)
  - **Two stale claims fixed:** `vitest.config.ts` justified the live exclusion by naming
    only `glm-4.6v` (three of five live files call `glm-5.3`); `ninaVision`'s comment
    described the description-length bounds as "60–140 words" while the assertions count
    **characters** (200–1200) — both corrected in the same two commits.
  - **Finding 4 (the capstone's harvest): the TEST_DATABASE_URL runbook documented in BOTH
    integration headers was broken for this repo's real credentials.** Both
    `queries.int.test.ts` and `ninaImageE2E.int.test.ts` told the reader to derive the
    scratch database URL with zsh's `${UNPOOLED/\/neondb/\/run_insights_itest}` — whose
    first `/neondb` match is inside the username `neondb_owner`, not the path. Measured
    live during the capstone setup: it produced `postgresql:/run_insights_itest_owner:…/neondb`
    (hostless; the migrate spun and landed nowhere — production untouched, and a migrate
    against the already-migrated prod DB would have been an idempotent no-op anyway).
    The corrupted shape also escaped the suite's `postgresql://…` sed mask, briefly
    exposing the Neon password in terminal scrollback — caught by reading the masked echo
    before running anything destructive. Both headers now carry an anchored swap function
    (`sed -E 's#^(postgresql://[^/?]+)/[^?]+(\?.*)$#\1/run_insights_itest\2#'`) plus the
    measurement note, fixed by the coordinator as `8714456`.
  - **CAPSTONE — the integration suite was actually RUN today, twice, against real
    Postgres:** created a scratch `run_insights_itest` database on the Neon endpoint per
    the suite's own documented recipe, applied all **22 migrations (29 tables)**, ran
    `TEST_DATABASE_URL=… npm run test:int`: **53/53 PASSED in 9.46 s** against real
    Postgres + the real Blob store (ninaImageE2E.int's real 1×1-PNG blob uploads included,
    deleted in `afterAll`). Re-ran under `TZ=America/New_York` (the suite's documented D6
    timezone proof): **53/53 PASSED again, 7.65 s**. Then terminated 2 pooler backends,
    DROPPED the database, and verified it gone. Nothing was left behind.
  - **The live suites were deliberately NOT executed** — they spend real money by design
    (ninaImageE2E ≈ $0.04 per run buys two real generations). Their runnability is proven
    structurally instead: `npm run typecheck` clean, `vitest list tests/live` with
    `LLM_LIVE_TEST=1` + real `.env.local` collects **11 runnable tests across 4 files**
    with `ninaImageE2E.live` correctly ABSENT (its `TEST_DATABASE_URL` gate holds even
    with real keys present).
- **Branch:** `token-maxxing-2026-09-12-live-tests-audit`
- **Merge status:** merged (commit `af073e3`)
- **Approx token burn:** high (est. ~1M, input-dominated) — the burn went into reading all
  9 suite/helper files end to end (the ninaImageE2E twins alone are 10.4 KB + 37.3 KB), a
  full `vitest list` collection census (5,187 tests), the claim-by-claim documentation
  cross-check, the create-migrate-run-drop database capstone, and this doc. 🔥

## Context & Motivation
The 2026-09-12 token-maxxing day ran as an orchestrated fan-out: a coordinator session
(`tokenmax-orch-2026-09-12`) spawning worker sessions on per-session branches, each handed
a pre-assigned idea. This worker's assignment targeted the one corner of the test estate
every prior session had routed around: `tests/live/` and `tests/integration/`.

The two directories are the repo's opt-in tier. Everything else a developer runs with
`npm test` is sandboxed — `tests/support/setup.ts` fills sentinel env vars
(`unit-test-key-never-sent` for the LLM key, `ci-dummy-key` mirroring the CI env block) so
unit tests never reach the network, and `vitest.config.ts` hard-excludes both special
directories unless `LLM_LIVE_TEST=1` / `VITEST_INTEGRATION=1`. `tests/live/` (five suites
plus the `loadEnvLocal.ts` helper) calls the real LLM endpoints and costs money;
`tests/integration/` (three suites, 53 tests) needs a real Postgres. Suites this dangerous
tend to rot in one of two ways: they break silently because nobody runs them, or they
accrete duplicate scaffolding because everybody is afraid to refactor them. The audit's
question was which of the three states — healthy, rotten, or duplicated — these were in.

The economics that made this worth a session: both suites are the *only* executable proof
of claims the docs make constantly ("the defaults live in TypeScript", "npm test never
touches a database", the D6 timezone invariant, the int/live twin-pair design). If they
are dead, a whole layer of the repo's self-description is decorative.

## What We Did (blow-by-blow)
1. **Inventoried both directories.** `tests/live/`: `narrate`, `nina`, `vision`,
   `ninaVision`, `ninaImageE2E` (each `.live.test.ts`) + `loadEnvLocal.ts`. Per the
   assignment's own map: narrate (prose), nina (tool round trip), vision (108/108),
   ninaVision (the HARD RULE 1 suite), ninaImageE2E (real money ≈ $0.04).
   `tests/integration/`: `hrMax.int.test.ts`, `queries.int.test.ts`,
   `ninaImageE2E.int.test.ts` — 53 tests across 3 files.
2. **Checked the exclusion machinery.** `vitest.config.ts` gates `tests/integration/**`
   behind `VITEST_INTEGRATION === '1'` ("so a plain `npm test` never reaches a real
   database") and `tests/live/**` behind `LLM_LIVE_TEST === '1'` ("§4.9's 'no test may
   call a live LLM except the explicitly-tagged live suites' is enforced here, not by
   convention"). Both gates confirmed present and wired to the npm scripts.
3. **Checked documentation currency.** README's test section and the root
   `package_readme` vitest row describe both suites correctly — except the README's
   headline unit-test count had drifted (5,093 stated vs 5,187 collected), and the config
   comment's model list had frozen in the vision-only era (fixed, see below).
4. **Analyzed distinctness — the assignment's duplicate-scaffolding suspicion.** The one
   file that exists in BOTH directories, `ninaImageE2E`, is an **intentional int/live twin
   pair**: the integration twin scripts the model's decision and stubs OpenRouter (free,
   deterministic); the live twin buys exactly those two generations with ~$0.04 of real
   API calls. Both headers cross-reference each other. This is layered testing by design,
   not copy-paste drift — the suspicion the audit was assigned to test is disproven, and
   now the disproval is written down.
5. **Verified fixtures and claims against the tree.** `research/fixtures/screenshots/`
   (shipped + original), `score.mjs`, `schema.mjs`, `downscale.mjs`,
   `shipped-image-recipe.py` all exist. Model names in comments match `.env.local`
   (`glm-4.6v` vision, `glm-5.3` text — the mismatch this found was in `vitest.config.ts`,
   not the suites). `NINA_IMAGE_DAILY_CAP=30` matches ninaImageE2E's "(30 at this
   writing)". The CI env block's dummy values match `setup.ts`'s sentinels. A repo-wide
   import census confirms `loadEnvLocal` has importers only inside `tests/live/`, as its
   docblock claims.
6. **Ran the safe execution gates:**
   - Default `vitest list` (full collection): **5,187 tests, ZERO references** to
     `tests/integration` or `tests/live` — "npm test never touches a database" holds at
     collection level, not just by config intent.
   - `npm run test:int` with no `TEST_DATABASE_URL`: 3 files, 53 tests, **ALL SKIPPED,
     450 ms** — the self-skip guard proven in the real runner, not inferred from code.
   - `vitest list tests/live` with `LLM_LIVE_TEST=1` + real `.env.local`: **11 runnable
     tests across 4 files**, with `ninaImageE2E.live` correctly absent — its extra
     `TEST_DATABASE_URL` gate holds even when every LLM key is real, so the $0.04 suite
     cannot start by accident.
   - `npm run typecheck` (next typegen + `tsc --noEmit`): clean.
7. **CAPSTONE — ran the integration suite against a real, disposable database.** Created
   `run_insights_itest` on the Neon endpoint using the suite's own documented recipe,
   applied all 22 migrations (29 tables), and ran the suite:
   - Pass 1: **53/53 PASSED in 9.46 s** — real Postgres (drizzle query semantics, real
     unique violations) and the real Vercel Blob store (ninaImageE2E.int uploads real
     1×1 PNGs and deletes them in `afterAll`).
   - Pass 2 under `TZ=America/New_York`: **53/53 PASSED in 7.65 s** — the suite's
     documented D6 timezone-invariance proof, executed for real.
   - Teardown: terminated 2 pooler backends, `DROP DATABASE`, verified gone. Zero residue.
8. **Fixed the first three findings** (two commits, detailed under Code / Design Details):
   the `test:live` selection bug and the three-shape key predicate (`1cee232`); the
   vision-only-era config comment and the stale README count (`8fbca54`). The fourth —
   the broken `TEST_DATABASE_URL` runbook in both integration headers, surfaced live by
   the capstone setup itself — was fixed by the coordinator as `8714456` on this branch
   (anchored sed swap + measurement note in both headers).
9. **Closed out the notable non-issues** so the next session doesn't re-litigate them:
   no `unittest_guide.md` exists anywhere (and none is needed — the suites self-document);
   `.workflows/todos.md` has no open test-related items;
   `docs/plans/archive/F01-*.md` still shows the old name-based `test:live` string —
   deliberately left, it is a historical record of what F01 shipped, not a live claim;
   prior sessions (2026-09-11/09-12) only edited these suites incidentally during
   dead-code removals, never audited them — this was genuinely first contact.

## Code / Design Details

**The `test:live` selection bug (commit `1cee232`):**

| | before | after |
|---|---|---|
| script | `LLM_LIVE_TEST=1 vitest run --dir . --testNamePattern=live` | `LLM_LIVE_TEST=1 vitest run tests/live` |
| collected | 55 tests | 11 tests |
| of which real live suites | 11 | 11 |
| bystander unit tests swept in | 44 across 27 files | 0 |

The bystanders were collected because their *names or filenames* contain "live": the
`live.test.ts` filename in `lib/nina/`, assertions like "the defaults live in TypeScript",
strings like "no live share". Under the old script they executed inside the live run —
subject to the live suite's timeout posture and mixed into its output, so a live-suite
failure triage would wade through 44 tests that have nothing to do with the API. The fix
selects by path, which is what the five per-target scripts (`test:live:vision`,
`test:live:narrate`, `test:live:nina`, `test:live:nina-vision`, `test:live:nina-image`)
already did — the generic script now agrees with them. `tests/live/nina.live.test.ts`'s
comment, which documented the old name-based pickup, was updated in the same commit.

**The key-gate consolidation (same commit).** Before, three shapes of the same question:

```ts
// shape A — 4-line conjunction, three files:
key != null && key !== '' && key !== 'unit-test-key-never-sent' && key !== 'ci-dummy-key'
// shape B — vision.live.test.ts:
const PLACEHOLDER_KEYS = new Set(['unit-test-key-never-sent', 'ci-dummy-key', ''])
// shape C — ninaImageE2E.live.test.ts:
const realKey = (...ks: (string | undefined)[]) => /* variadic variant */
```

After, one exported predicate in `tests/live/loadEnvLocal.ts` (landed form):

```ts
export function hasRealLlmKey(key: string | undefined): boolean {
  return key != null && key !== '' && key !== 'unit-test-key-never-sent' && key !== 'ci-dummy-key'
}
```

Its docblock records why it lives there: next to the `.env.local` load it pairs with (the
sentinel is what a key reads as UNTIL the `override: true` dotenv load replaces it), in the
module every live file already imports first. The escape hatch is deliberate:
`ninaImageE2E` keeps its own generic `realKey` for `OPENROUTER_API_KEY` and
`BLOB_READ_WRITE_TOKEN`, whose sentinel stories differ from the LLM key's — forcing those
through `hasRealLlmKey` would have been consolidation past the point of truth.

**The stale-comment fixes (commit `8fbca54`):**
- `vitest.config.ts`'s live-exclusion rationale named only `glm-4.6v` — true when the
  suite was vision-only, false since three of five live files started calling `glm-5.3`
  for prose and Nina's turns. The comment now names both, and notes the generic
  `test:live` opts in alongside the per-target variants.
- `README.md`'s test command line: `5,093 unit tests` → `5,187 unit tests (measured
  2026-09-12)` — stamped per the repo's volatile-numbers practice so the next reader can
  tell claim from measurement.
- `tests/live/ninaVision.live.test.ts`'s comment said the description bounds were
  "60–140 words"; the assertions count **characters** (200–1200). Words-vs-characters is
  exactly the kind of drift that redirects a future tuner to the wrong dial.

**The broken runbook (finding 4, coordinator commit `8714456`).** Both integration
headers carried the same recipe for deriving the scratch database URL from
`DATABASE_URL_UNPOOLED`:

```zsh
# BROKEN for credentials whose username starts with "neondb":
TEST_DATABASE_URL=${UNPOOLED/\/neondb/\/run_insights_itest}
# → matches the first "/neondb" substring, which is inside "neondb_owner":
#   postgresql:/run_insights_itest_owner:…@host/neondb?...   (hostless, path unswapped)
```

The measured failure had a second tail: the suite's credential mask (`sed` over
`postgresql://…`-shaped strings) no longer matched the corrupted single-slash URL, so the
echoed command line carried the live password into scrollback. The landed fix replaces the
bare substitution with one anchored to the authority prefix — the `/` that opens the path
segment can only follow the host:

```zsh
TEST_DATABASE_URL=$(echo "$UNPOOLED" | sed -E 's#^(postgresql://[^/?]+)/[^?]+(\?.*)$#\1/run_insights_itest\2#')
```

Both headers also now state what the capstone measured: the broken form produced a
hostless URL whose migrate spins and lands nowhere, so a reader following the old recipe
would never corrupt production — they would just fail confusingly, after leaking the
password through an unmasked echo.

**The int/live twin pair** (the audit's distinctness verdict, in one table):

| | `tests/integration/ninaImageE2E.int.test.ts` | `tests/live/ninaImageE2E.live.test.ts` |
|---|---|---|
| model decision | scripted in the test | bought from OpenRouter (~$0.04) |
| OpenRouter | stubbed | real |
| database | real Postgres (opt-in) | real Postgres (opt-in, extra `TEST_DATABASE_URL` gate) |
| cross-reference | header points at the live twin | header points at the int twin |

**Gates and their receipts:**

| Gate | Result |
|---|---|
| default `vitest list` collection | 5,187 tests, 0 refs to either special dir |
| `npm run test:int` (no `TEST_DATABASE_URL`) | 3 files / 53 tests, all skipped, 450 ms |
| `vitest list tests/live` (`LLM_LIVE_TEST=1`, real `.env.local`) | 11 tests / 4 files; ninaImageE2E.live correctly absent |
| `npm run test:int` vs scratch Neon DB, 22 migrations applied | 53/53 PASSED, 9.46 s |
| same, `TZ=America/New_York` (D6 proof) | 53/53 PASSED, 7.65 s |
| `npm run typecheck` | clean |
| teardown | 2 pooler backends terminated, DB dropped, verified gone |

## Decisions & Trade-offs
- **Prove the live suites structurally; do not spend the money.** The live suites exist
  to spend ~$0.04 and a minute of API time proving what mocks can't. An audit does not
  need that proof re-purchased; it needs to know the suites WOULD run. Typecheck +
  collection with the env flag + the gate semantics (11 runnable, the money suite gated
  out) establish that for free. The trade-off: a genuine runtime failure (bad prompt, API
  shape change) would not be caught. Accepted — the suites' last structural state was
  verified current by every other check in the audit.
- **But run the integration suite for real.** It is free (a scratch database on the
  existing Neon endpoint), it exercises the highest-risk assertions in the repo (real
  drizzle semantics, real blob round trips, the D6 timezone invariant), and "53 skipped"
  proves only the guard, not the tests. Creating a disposable database, migrating, running
  twice (once timezone-shifted), and dropping it converts the strongest claim in the docs
  from "should still pass" to "passed today, twice".
- **Create-and-destroy hygiene.** The scratch database shared the Neon endpoint but
  nothing else — no production data touched (the repo's one real database is production;
  the suite's own recipe creates a separate one precisely for this). Teardown terminated
  the pooler backends before the drop and verified the database gone afterwards.
- **Fix the selection bug by agreeing with the per-target scripts, not inventing a third
  convention.** Five `test:live:*` scripts already select by path; the generic one now
  does the same. No new env var, no new naming scheme.
- **Consolidate only the three copies of the SAME question.** `hasRealLlmKey` owns the
  LLM-key sentinel check because the five files ask it identically. ninaImageE2E's
  `realKey` stays generic because OPENROUTER/BLOB tokens are a different question wearing
  a similar shape — merging them would have made one sentinel's evolution silently
  govern the other's gates.
- **Historical docs keep historical strings.** `docs/plans/archive/F01-foundation.md`
  still shows the old name-based `test:live` — correct, since it documents what F01
  shipped. Only the living claim sites (config comment, package.json, the suite comment)
  were updated.
- **Scope discipline held:** no production database touched (scratch DB only, dropped and
  verified), zero live API calls, no `package_readme.md` edited (the coordinator had
  sibling workers compacting them the same day), and every behavioral change is a
  comment/script line — suite assertions untouched.

## Follow-ups & YAGNI notes
- **The live suites have still never been executed end-to-end this audit.** If a future
  session touches `lib/llm/client.ts`/`textModel.ts` resolution semantics, weigh one cheap
  live run (`test:live:narrate` or `test:live:nina`, text-model money only) to re-prove
  the runtime path; keep `test:live:nina-image`'s $0.04 run for when the image pipeline
  itself changes. Now that `test:live` selects by path, running it is also *safe* in a way
  it wasn't before (no bystander sweep).
- **The D6 timezone proof is now a known-good recipe.** The scratch-DB → migrate → run →
  `TZ=America/New_York` → re-run → drop cycle (9.46 s + 7.65 s) is cheap enough to repeat
  any time `lib/db/queries.ts` date-bucketing changes; it is documented in the suite and
  demonstrated in this doc's Appendix.
- **`unittest_guide.md` was considered and rejected** — the suites' docblocks already
  carry the "why" (the ES-module import-order trap, the sentinel pairing, the twin-pair
  contract). A guide would duplicate them and rot.
- **Operations lesson (finding 4, recorded for the repo's memory):** substituting a URL's
  database segment with zsh's bare `${URL/\/neondb/\/run_insights_itest}` matches the
  FIRST `/neondb` substring — which sits inside the USERNAME (`neondb_owner`'s leading
  `//`), not the path — corrupting the URL into a hostless string. Anchor the substitution
  to the authority prefix (`s#^(postgresql://[^/?]+)/[^?]+(\?.*)$#…#`), and mask-verify
  AFTER every transform, not just before: the corrupted shape also escaped the
  `postgresql://…` sed mask, which is how the credential reached scrollback. No command
  ran against any database with the corrupted URL (the migrate spun on a hostless string
  and landed nowhere); production verified untouched before the corrected redo. The twist
  that makes this finding rather than an anecdote: the session was FOLLOWING the recipe as
  documented in the integration headers — the runbook itself was the bug, and the fix is
  in both headers now (finding 4).

## Appendix

**Files touched:**
```
commit 1cee232 — 7 files, +28/−29
M package.json                         (test:live script → path selection)
M tests/live/loadEnvLocal.ts           (+ hasRealLlmKey, docblock)
M tests/live/narrate.live.test.ts
M tests/live/nina.live.test.ts         (+ comment documenting the old pickup, updated)
M tests/live/ninaImageE2E.live.test.ts
M tests/live/ninaVision.live.test.ts   (+ words→characters comment fix)
M tests/live/vision.live.test.ts

commit 8fbca54 — 2 files, +5/−4
M README.md                            (5,093 → 5,187, measured 2026-09-12)
M vitest.config.ts                     (exclusion rationale names both models)

coordinator commit 8714456 (same branch, between 8fbca54 and this doc) — 2 files
M tests/integration/queries.int.test.ts       (anchored TEST_DATABASE_URL swap + note)
M tests/integration/ninaImageE2E.int.test.ts  (same — finding 4)
```

**Commands and results (the audit's execution half):**
```
date +%F                                   → 2026-09-12
vitest list (default)                      → 5,187 tests; 0 refs to tests/{live,integration}
npm run test:int                           → 53 skipped / 450 ms (no TEST_DATABASE_URL)
LLM_LIVE_TEST=1 vitest list tests/live     → 11 tests / 4 files; ninaImageE2E.live absent
npm run typecheck                          → clean
create run_insights_itest + 22 migrations  → 29 tables
TEST_DATABASE_URL=… npm run test:int       → 53/53 PASSED, 9.46 s
TZ=America/New_York … npm run test:int     → 53/53 PASSED, 7.65 s
terminate 2 pooler backends; DROP DATABASE → verified gone
```

**Not executed, deliberately:** all five live suites (real money; runnability proven
structurally — see Decisions).

**Git evidence chain:** worker commits `1cee232` (test:live path selection + key-gate
consolidation) and `8fbca54` (config comment + README count stamp), the coordinator's
finding-4 commit `8714456` (integration-header runbook fix), then this docs commit — all
on branch `token-maxxing-2026-09-12-live-tests-audit` (the `orch`/`merge` commits below
them in the log belong to the photo-reference-dedup set the coordinator landed into this
worktree's history before the session started).

**Session identity:** worker session `live-tests-audit`, spawned by coordinator
`tokenmax-orch-2026-09-12` on 2026-09-12; branch
`token-maxxing-2026-09-12-live-tests-audit`; this docs commit was the branch tip at
writing time, with the coordinator's `8714456` directly below it; merged (commit `af073e3`).
