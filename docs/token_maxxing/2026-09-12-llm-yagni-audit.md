# Token-Maxxing Session — 2026-09-12: Lib LLM YAGNI Audit

## 🎯 Achievement / End Result
- **Goal of the burn:** A WORKER session (slug `llm-yagni-audit`) pre-assigned one idea by
  the coordinator (`tokenmax-orch-2026-09-12`). The assignment, verbatim: *"Hunt and remove
  dead code, unused exports, and stale config in lib/llm (3249 lines, the largest untouched
  lib package). Why: lib/db, lib/admin, and lib/nina all got dead-code/YAGNI sweeps on
  2026-09-11/12 but lib/llm never has. Stay strictly within lib/llm; do not touch any
  package_readme.md or production DB."* — the last lib package to get the repo's
  now-standard verify-then-remove export-surface treatment.
- **Concrete changes:** 1 commit (`5421e6b`, "refactor(lib/llm): YAGNI sweep — delete dead
  exports, shrink the public surface"), 13 files, +53/−70: 11 `lib/llm` source files
  (catalog, extract, facts, factsHash, narrate, prompts/extraction, prompts/narrate,
  runExtractionJob, schema, textModel, vision), 1 test (`tests/llm.textModel.test.ts`), and
  1 deletion (`lib/llm/.gitkeep`). Zero behavior change, zero API-shape change at the call
  sites — every removed symbol is proven to have zero non-test consumers first.
- **Real value delivered:**
  - **The public export surface cut 93 → 57 symbols (−39%)**, measured as line-start
    `export` statements counted through brace/comma lists across the whole package. Per
    file: `facts.ts` **27 → 14**, `prompts/narrate.ts` 10 → 4, `narrate.ts` 13 → 7,
    `catalog.ts` 6 → 3, `schema.ts` 7 → 4, `prompts/extraction.ts` 9 → 7, `factsHash.ts`
    2 → 1, `extract.ts` 4 → 3, `runExtractionJob.ts` 3 → 2, `vision.ts` 9 → 8
    (`textModel.ts` unchanged at 2).
  - **6 exports deleted outright** (not just unexported — the code is gone): the
    `canonicalizeForHash` re-export, `coerceNarrativeTextModel`,
    `NARRATIVE_TEXT_MODEL_DEFAULT`, `type Observation`, `type Verdict`, and the
    `promptVersionFor` re-export plus its feeder import.
  - **30 internal-only exports unexported** (still compiled, `export` keyword dropped) —
    the types and helpers that were only ever package plumbing but read as public API to
    every future reader and context-loader.
  - **The sweep's real value — a stale-claim catch that produced a test instead of a
    deletion:** `catalog.ts`'s docstring claimed *"tests/llm.textModel.test.ts pins this
    constant to be an id the env spells too"* — **that pin did not exist in the test
    file.** Rather than delete the claim, the session made it true: the test now asserts
    `expect(NARRATIVE_TEXT_MODEL_IDS).toContain(env.LLM_MODEL)` with the reasoning
    documented in the test body (`narrativeModel()` degrades every unreadable setting to
    `env.LLM_MODEL`, so the env value must stay inside the dropdown's vocabulary — an env
    model the catalog refuses would make the degrade pick a model no admin could have
    chosen). The test comment now reads: "This is the pin the catalog's header has always
    claimed."
  - Every removal verified against the **four verifier traps** (twin names, relative
    imports, barrel re-exports, multiline import lists) with word-boundary greps plus a
    no-head-cutoff hard gate — and four real twin-name near-misses were caught and
    dismissed during verification (see Code / Design Details).
- **Branch:** `token-maxxing-2026-09-12-llm-yagni-audit`
- **Merge status:** merged (commit `e54c299`)
- **Approx token burn:** high (est. ~1M, input-dominated) — the burn went into the
  enumerate-every-export census, per-symbol repo-wide word-boundary grep classification,
  the four-trap disambiguation passes, and the gates, including a serial full-suite sweep
  (265 files / 5,093 tests) that is deliberately slow. 🔥

## Context & Motivation
The 2026-09-12 token-maxxing day ran as an orchestrated fan-out: a coordinator session
(`tokenmax-orch-2026-09-12`) spawning worker sessions on per-session branches, each handed
a pre-assigned idea. This worker's assignment closed the last hole in a two-day campaign:
the YAGNI/dead-export sweeps had covered `lib/db` (2026-09-11: 6 dead functions + 1
interface out of 80 exports), `lib/admin` (2026-09-11: 15 type-only exports unexported),
`lib/nina/queries.ts` (2026-09-11: 1 dead export), and `components/*` — but `lib/llm`, at
3,249 lines the largest lib package never to get the pass, had been passed over precisely
because it looked risky: it is the AI layer, its exports are consumed by Server Actions,
workers, scripts, and tests, and it carries its own boundary guard
(`scripts/check-llm-payload-boundary.mjs`) whose nine guarded symbols must not move.

The economics are the same as every prior sweep: each `export` keyword is a promise that
something outside the module may depend on the symbol, which forces future readers (and
the context-loader that packages files for tasks) to treat it as load-bearing API. A type
like `ProfileFacts` exported from `facts.ts` when only `facts.ts` builds it makes the
module's real contract — the handful of functions other packages call — harder to see. The
assignment's constraints: strictly `lib/llm`, no `package_readme.md` (all were being
compacted by sibling workers the same day — touching one would collide with them), no
production DB.

## What We Did (blow-by-blow)
1. **Enumerated the whole export surface.** Every `export` statement in every `lib/llm`
   file listed symbol-by-symbol (93 across the package, by the session's count; a
   comma-splitting recount of `^export` lines lands at 94 — the ±1 is a counting-method
   artifact around multi-symbol statements, and both counts yield the same ~39% cut to the
   same 57). Tests and `.test.ts` files excluded from the census.
2. **Classified every symbol by consumer.** Repo-wide word-boundary greps per symbol, each
   hit manually classified code-vs-prose, with the four known verifier traps checked
   explicitly: (a) **twin names** — same identifier exported elsewhere in the repo;
   (b) **relative imports** — importers that reach the module by path, not by the barrel
   package name; (c) **barrel re-exports** — `export * from` or named re-export lists that
   transitively expose a symbol (none exist in `lib/llm`); (d) **multiline import lists** —
   an importer spanning lines hides a symbol from a single-line grep. The final sweep was
   run with no `head` cutoff (the inventory-grep lesson: a head-cutoff once silently
   dropped a live ref).
3. **Deleted the 6 proven-dead exports:**
   - `canonicalizeForHash` — a re-export alias (`export { canonicalize as
     canonicalizeForHash }`) at the bottom of `factsHash.ts` with zero importers anywhere;
   - `coerceNarrativeTextModel` in `catalog.ts` — no production caller;
     `narrativeModel()` deliberately does its own env-degrading check per the documented
     ruling; only its own test called it;
   - `NARRATIVE_TEXT_MODEL_DEFAULT` — nothing in production read it (the degrade lands on
     `env.LLM_MODEL`, not on this constant); **but its docstring claimed a test pin that
     did not exist** — the stale-claim catch, resolved by writing the real pin into
     `tests/llm.textModel.test.ts` (see Achievement above);
   - `type Observation` + `type Verdict` in `schema.ts` — referenced by nothing;
     `components/insights/InsightCard.tsx` declares its own local twins;
   - the `promptVersionFor` re-export at the bottom of `narrate.ts`, plus the line-11
     import that existed only to feed it — the one real consumer (`lib/insights/load.ts`)
     imports the defining module (`lib/llm/prompts/narrate.ts`) directly;
   - stale `lib/llm/.gitkeep` — the directory has been non-empty since F04.
4. **Unexported the 30 internal-only symbols** (30 = 13 facts types + 5 narrate + 1 vision
   + 6 prompts/narrate + 2 prompts/extraction + 1 extract + 1 runExtractionJob + 1
   catalog):
   - `facts.ts` (13 structural types): `ProfileFacts`, `SplitFact`, `SessionFacts`,
     `ComputedFacts`, `WeeklyContextFacts`, `RecentRunFact`, `SessionRunFacts`,
     `BuildSessionFactsInput`, `TrendSincePrevious`, `WeekMetricsFacts`,
     `BuildWeekFactsInput`, `MonthMetricsFacts`, `BuildMonthFactsInput`;
   - `narrate.ts` (5): `InsightSource`, `Usage`, `InsightResult`, `dbInsightStore`,
     `NarrateDeps`;
   - `vision.ts` (1): `callVisionWithFetch` (the `WithFetch` wrappers remain the seam);
   - `prompts/narrate.ts` (6): the 3 prompt-version consts + the 3 system prompts;
   - `prompts/extraction.ts` (2): `VisionTextPart`, `VisionImagePart`;
   - `extract.ts` (1): `ExtractOutcome`; `runExtractionJob.ts` (1): `RunExtractionJobInput`;
     `catalog.ts` (1): `NarrativeTextModelSpec`.
5. **Recorded the deliberate keeps** — exports that *look* dead to a naive grep but have
   real consumers the type checker cannot see (see Decisions below), most importantly
   `EXTRACTION_SYSTEM_PROMPT`/`EXTRACTION_SHAPE`, which no TS file imports but which
   `scripts/f04-e2e-probe.mjs` scrapes out of the source text with the literal regex
   `` export const ${name} = ` `` — a non-TS consumer contract.
6. **Gates, all green:** `npm run typecheck` (next typegen + `tsc --noEmit`); eslint on
   `lib/llm` + the touched test; `prettier --check`; targeted vitest (11 files / 167
   tests); **full** vitest sweep 265 files / 5,093 tests with `--no-file-parallelism`
   (the serial posture used to separate real failures from the known parallel-load
   flakes); and `scripts/check-llm-payload-boundary.mjs` — all 9 guarded symbols
   (`getOrCreateInsight`, `runNinaTurn`, `distillNinaMemory`, `resolveNinaPromises`,
   `describeNinaImage`, `titleNinaSessionIfNeeded`, `rankNinaSearchHits`,
   `runNinaImageJob`, `captionNinaPhoto`) still confined to their sanctioned callers.
7. **Committed as `5421e6b`** on the worker branch and stopped — no merge, no push; the
   coordinator lands worker branches.

## Code / Design Details

**Per-file export census (line-start `export` statements, symbols counted through brace
and comma lists; before = `5421e6b^`, after = landed tree):**

| File | Before | After | What moved |
|------|-------:|------:|------------|
| `facts.ts` | 27 | 14 | 13 structural types unexported |
| `narrate.ts` | 13 | 7 | 5 unexports + `promptVersionFor` re-export deleted |
| `prompts/narrate.ts` | 10 | 4 | 3 version consts + 3 system prompts unexported |
| `prompts/extraction.ts` | 9 | 7 | `VisionTextPart`/`VisionImagePart` unexported |
| `schema.ts` | 7 | 4 | `Observation` + `Verdict` types deleted |
| `catalog.ts` | 6 | 3 | `coerceNarrativeTextModel` + default const deleted, spec type unexported |
| `extract.ts` | 4 | 3 | `ExtractOutcome` unexported |
| `runExtractionJob.ts` | 3 | 2 | `RunExtractionJobInput` unexported |
| `vision.ts` | 9 | 8 | `callVisionWithFetch` unexported |
| `factsHash.ts` | 2 | 1 | `canonicalizeForHash` re-export deleted |
| `textModel.ts` | 2 | 2 | unchanged |
| *(package incl. `extractJson.ts`)* | **93–94** | **57** | −39% |

**The stale-claim → test-pin fix** (`tests/llm.textModel.test.ts`, as landed):
```ts
it('the deployed fallback env.LLM_MODEL is an id this catalog declares', () => {
  /* `narrativeModel` degrades every unreadable or absent setting to `env.LLM_MODEL`, so the env
   * value and the dropdown's vocabulary must describe the same set — an env model the catalog
   * refuses would make the no-row and unknown-row degrades pick a model no admin could have
   * chosen. This is the pin the catalog's header has always claimed. */
  expect(NARRATIVE_TEXT_MODEL_IDS).toContain(env.LLM_MODEL)
})
```
The rule this enforces: the resolver's degrade target must stay inside the dropdown's
vocabulary. Before this session, the catalog header asserted the pin and the test file did
not contain it — exactly the doc-drift shape the repo keeps hitting, except here the fix
was to make the doc's claim true rather than to delete it, because the invariant it
describes is real and worth enforcing.

**The twin-name traps caught during verification** (each would have produced a wrong
"dead" verdict from a naive repo-wide grep, and each is why the four-trap checklist
exists):
- `SessionFacts` also exists as an **unrelated type in `lib/badges/evaluate.ts`** — the
  badges family uses its own; a hit there did not count as a consumer of the facts.ts
  type;
- `Verdict`/`Observation` appear in `components/insights/InsightCard.tsx` as **local
  declarations**, not imports of the deleted schema.ts types — which is precisely why the
  schema.ts twins were deletable;
- `MIN_REPAIR_BUDGET_MS` exists in **both** `narrate.ts` and `lib/extract/constants.ts` —
  both alive, pinned by different suites, neither touched;
- `productionDeps` also exists in `lib/nina/turn.ts` (unrelated module, unrelated suite).

**The non-TS consumer contract** (why `EXTRACTION_SYSTEM_PROMPT`/`EXTRACTION_SHAPE` keep
`export` despite zero TS importers): `scripts/f04-e2e-probe.mjs` reads the *source text*
and extracts these with the literal regex `` export const ${name} = ` ``. Dropping the
`export` keyword would break the probe's regex while `tsc` stays green — a trap the type
checker structurally cannot catch, and the strongest argument for keeping the "who reads
this, including non-TS readers?" question in the sweep method.

## Decisions & Trade-offs
- **Unexport before delete; delete only on zero references anywhere.** The 30 unexports
  are the conservative half of the cut: the code stays, compiled and tested, but stops
  advertising itself as API. Deletion was reserved for the 6 symbols with literally zero
  reference sites (production, tests, scripts, docs-prose aside) — and even then only
  after the four-trap disambiguation.
- **Prose mentions are not consumers, but contract references are.** A docstring or
  comment naming a symbol does not keep it alive; a *regex contract* in a script does.
  This distinction is what split `promptVersionFor` (deletable re-export) from
  `EXTRACTION_SYSTEM_PROMPT` (must keep `export` or the f04 probe's regex stops matching).
- **Fix the stale claim by writing the missing test, not by deleting the claim.** The
  catalog docstring promised an invariant worth having (env degrade target ∈ dropdown
  vocabulary). Deleting the sentence would have been smaller; writing the pin makes the
  invariant enforced and the header honest in one move. Cost: one new test in a file the
  sweep was already touching.
- **Full serial suite despite a "removal-only" diff.** De-exports can break compilation in
  importers `vitest`'s default parallel run muddies; the `--no-file-parallelism` sweep plus
  `tsc --noEmit` is the pair that separates "my diff broke it" from the known
  parallel-load flakes. 5,093 tests green, 265 files.
- **Scope discipline held:** no `package_readme.md` touched (coordinator constraint —
  sibling workers were compacting them the same day; a `lib/llm` readme edit here would
  have add/add-collided with the campaign), no production DB, nothing outside `lib/llm`
  except the one test file that documents the deleted constant's pin.

## Follow-ups & YAGNI notes
- **Is the payload-boundary guard actually in CI?** `lib/llm/README.md` says the boundary
  is "enforced by `scripts/check-llm-payload-boundary.mjs` **in CI**", and `package.json`
  wires it as `ci:llm-payload-guard` — but whether any CI pipeline actually invokes that
  script is **unverified**. A future session could check the CI config and either wire the
  script in or correct the README's claim (the same verify-the-doc order this campaign
  forces).
- **Measured budgets for narrate.ts.** The week/month `BUDGET` constants still carry the
  header's own admission: *"Neither has a live measurement yet… revisit them once /trends
  has run against real history."* A measured-budget revisit is open and is the natural
  next `lib/llm` session once real history exists to measure against.
- **The `npm run test:live:*` scripts are the remaining untested surface here** — they hit
  the live LLM API and cost money, so they were deliberately not run this session. Any
  future session touching `client.ts`/`textModel.ts` resolution semantics should weigh
  one live run against the cost.
- **If a `lib/llm` `package_readme.md` compaction is ever assigned**, this doc's per-file
  export table is the verified base to diff against (93 → 57 as of 2026-09-12) — the same
  way today's lib-db worker used its package's last-touch commit as the staleness window.

## Appendix

**Files touched (commit `5421e6b`):**
```
D  lib/llm/.gitkeep
M  lib/llm/catalog.ts
M  lib/llm/extract.ts
M  lib/llm/facts.ts
M  lib/llm/factsHash.ts
M  lib/llm/narrate.ts
M  lib/llm/prompts/extraction.ts
M  lib/llm/prompts/narrate.ts
M  lib/llm/runExtractionJob.ts
M  lib/llm/schema.ts
M  lib/llm/textModel.ts
M  lib/llm/vision.ts
M  tests/llm.textModel.test.ts
13 files changed, 53 insertions(+), 70 deletions(-)
```

**Gates run, all green:** `npm run typecheck` (next typegen + `tsc --noEmit`); eslint on
`lib/llm` + `tests/llm.textModel.test.ts`; `prettier --check`; targeted vitest (11 files /
167 tests); full vitest sweep `--no-file-parallelism` (265 files / 5,093 tests);
`node scripts/check-llm-payload-boundary.mjs` (9/9 guarded symbols confined — re-confirmed
on the landed tree while writing this doc).

**Counting-method note for future re-measures:** the "93 → 57" figures count line-start
`export` statements per file with symbols expanded through brace/comma lists, whole
package, `.test.ts` excluded. A recount while writing this doc landed the *after* count at
exactly 57 and the *before* count at 94 (±1 vs the session's 93 — a multi-symbol-statement
counting artifact); the −39% and the arithmetic (93 − 30 unexports − 6 deletions = 57)
hold under either.

**Git evidence chain:** `5421e6b` (this session's worker commit). Prior campaign commits
for context: `422daa5`/`6d9d6f8` (lib/admin dead-exports, 2026-09-11),
`lib-nina-queries-yagni` (`countNinaSessionMessages` removal), lib-db-queries-yagni (6
functions + 1 interface). The assignment's "largest untouched lib package" premise held:
no prior sweep commit touches `lib/llm`.

**Session identity:** worker session `llm-yagni-audit`, spawned by coordinator
`tokenmax-orch-2026-09-12` on 2026-09-12; branch
`token-maxxing-2026-09-12-llm-yagni-audit`; final commit `5421e6b`; merged (commit `e54c299`).
