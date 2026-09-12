# Token-Maxxing Session — 2026-09-12: Dead-Export Tooling (knip Adoption)

## 🎯 Achievement / End Result
- **Goal of the burn:** A WORKER session (slug `dead-export-tooling`) pre-assigned one idea by
  the coordinator (`tokenmax-orch-2026-09-12`). The assignment, verbatim: *"Evaluate and, if it
  fits cleanly, adopt knip as a durable dead-export/unused-file detector to replace the
  hand-rolled one-off sweep scripts every prior YAGNI session had to write from scratch — wire
  it into package.json as an npm script."* Why: every prior YAGNI session (about 14 docs in
  `docs/token_maxxing/` from 2026-09-11/12) re-wrote ad-hoc grep/TS-compiler sweeps from
  scratch, each time re-learning the same false-positive traps; a durable AST-based detector
  makes every future YAGNI session start from `npm run knip`.
- **Verdict: fits cleanly. Adopted.** Commit `4f4fa3f` ("chore(tooling): adopt knip as the
  durable dead-export detector"), 4 files, +983/−23: new `knip.ts` (48 lines, TypeScript
  config, comment-heavy per repo culture), `lib/llm/prompts/extraction.ts` (extended docblock
  on the one known false positive), `package.json` (+`knip` script, +`probe:f04` script,
  +`knip` 6.35.1 devDependency, −dead `nanoid` direct dependency), `package-lock.json`.
- **Real value delivered:**
  - **`npm run knip` is now the standing dead-export detector.** knip 6.35.1 (AST-based,
    Node 22) resolves real import edges through the `@/` alias, relative paths, and barrel
    re-exports — the exact machinery every hand-rolled sweep rebuilt as a throwaway script,
    and the exact machinery several of those scripts got wrong late (a barrel BFS hopped in
    the wrong direction; a counter-key typo zeroed cross-file refs).
  - **Validated against the prior sessions' documented ground truth, not vibes.** A control
    experiment against digests of 8 prior YAGNI session docs: all six documented negative
    controls correctly NOT flagged, and two extra correctness checks both landed the right
    way (details below) — including catching the prior llm-yagni doc's "zero TS importers"
    claim as stale.
  - **Dropped the dead `nanoid` DIRECT dependency** that the bare run surfaced: an
    import-statement census found zero hits; every in-repo occurrence is prose ("a
    `nanoid(12)`"); `lib/id.ts` reimplemented it long ago. postcss keeps its own transitive
    `nanoid@3` — untouched.
  - **Wired the one unwired script** knip found: `scripts/f04-e2e-probe.mjs` is now
    `npm run probe:f04` (a self-documented manual ops probe that had lived outside
    package.json).
  - **The backlog census is banked:** the standing report re-derives live — 152 unused
    exports + 113 unused exported types + 2 duplicate-export pairs (re-verified today via
    `npm run knip`; the bare pre-config run's 11 unused files and 1 unused dependency are
    fully resolved by the adoption). That census IS the next YAGNI session's task list,
    costing zero setup for the first time in the campaign.
- **Branch:** `token-maxxing-2026-09-12-dead-export-tooling`
- **Merge status:** merged (commit `4605076`)
- **Approx token burn:** high (est. ~1M, input-dominated) — includes the first attempt of
  this session, which died to an API-429 before any work was done; the redo started clean
  and reached the same verdict. 🔥

## Context & Motivation
The 2026-09-11/12 token-maxxing campaign produced a string of dead-code/YAGNI sessions, and
a pattern became undeniable: every one of them hand-built the same tool. `components-dead-code-a`
wrote a TypeScript-compiler-API export extractor; `review-yagni` built its own compiler-API
sweep; `insights-metrics-panel` built a 705-module import-graph inventory whose first barrel
BFS traversed the wrong direction (caught by its own word-boundary cross-check before any
edit); `ui-primitives-yagni` wrote another throwaway AST script (kept out of git); `badges-records`
built a whole-repo liveness map whose counter-key bug (`pkg` vs `pkgx`) silently zeroed
cross-file refs until a pass-disagreement exposed it. Each sweep also re-derived, by hand,
the same false-positive trap classes: twin names in unrelated modules, prose-only mentions in
comments, string literals in tests that are data not imports, barrel re-exports, relative
imports, multiline import lists.

The economics: that is roughly a session-day of duplicated machinery plus one
self-bug per sweep, spent before the actual dead-code triage starts. knip is the
off-the-shelf version of that machinery — AST-based, alias-aware, barrel-aware, with
entry-point inference for package.json scripts and Next.js file conventions. The idea this
session evaluated: buy it once, configure the repo's two genuine exceptions, and let every
future YAGNI session start from the census instead of from `npm init -y` of a scratch
sweep.

Constraints honored: no production DB access, no package_readme edits, coordinator lands
the branch.

## What We Did (blow-by-blow)
1. **First attempt died to an API-429** before any work was done. The redo started clean —
   no half-state to recover.
2. **Bare knip run, no config** (knip 6.35.1, Node 22): 11 unused files, 1 unused
   dependency (`nanoid`), 154 unused exports, 113 unused exported types, 2 duplicate-export
   pairs. Enough signal to evaluate the verdict question, and — critically — a report whose
   obvious false-positive candidates could be enumerated and dispositioned.
3. **Adopted with a TypeScript config** (`knip.ts`, typed `KnipConfig`, comment-heavy per
   repo culture). Every non-default choice carries its reason inline:
   - `ignore: ['research/**']` — the deliberate scratch area, which `tsconfig` already
     excludes. The documented consequence (this is the *point*, not a side effect): a
     `lib/` export kept alive ONLY by a research script will now correctly surface as
     unused — the right question for a YAGNI sweep to ask. Graduate the script to
     `scripts/` (wired in package.json) or let the export go.
   - `ignore: ['docs/design/tokens.css']` — the design source-of-truth consumed by humans,
     docs, and `DesignSync`/og-image mirroring. Nothing can import a design reference, so
     "unused file" is the wrong verdict for it by construction.
   - `ignoreExportsUsedInFile: false` (knip's default, deliberately kept) — an export used
     only inside its own file is still reported. That "needless export keyword" class is
     exactly what the `lib-admin-dead-exports` session hunted by hand across 74 exports;
     the noise is signal.
   - `includeEntryExports` off — Next route files export framework hooks
     (`generateMetadata`, route handlers, this Next version's root `proxy.ts`); turning it
     on would flood the report.
4. **Verified knip's own entry discovery** against the first run rather than trusting it:
   it finds package.json scripts (every `scripts/*.mjs` wired there), the Next.js plugin's
   file conventions (page/layout/route AND the root `proxy.ts`), vitest tests via
   `vitest.config.ts` (`tests/**` plus co-located `*.test.ts`), `drizzle.config.ts`, and
   the eslint/prettier/postcss configs.
5. **Dispositioned the ONE documented false positive instead of suppressing it:**
   `EXTRACTION_SHAPE` (`lib/llm/prompts/extraction.ts`). `scripts/f04-e2e-probe.mjs` scrapes
   it out of that module's SOURCE TEXT by regex — deliberately, because the probe replays
   the job without a TS loader (`@/` alias + `server-only` block imports) — so it is
   invisible to any import graph, including knip's. Documented in two places (an extended
   docblock at the symbol, and the `knip.ts` header), NOT suppressed, and with an explicit
   do-not-touch warning: dropping that `export` leaves `tsc` green while silently breaking
   what the probe scrapes.
6. **Wired the probe** as `probe:f04` — it was knip's one unwired script file, and the
   wiring is also the honest fix for why it looked orphaned.
7. **Dropped the dead `nanoid` direct dependency** from package.json (with the lockfile
   regen). Evidence: knip flagged it; a repo-wide import-statement census found zero
   importers; every textual occurrence is prose; `lib/id.ts` reimplemented the
   functionality. postcss's own transitive `nanoid@3` is a different edge and untouched.
8. **Ran the validation control experiment** — the load-bearing part of the session. Digested
   8 prior YAGNI session docs and extracted their documented ground truth, then checked
   knip's report against it:
   - **Six negative controls, all correctly NOT flagged:** `pollDelayFor` (a test-only seam
     whose repo mentions are prose in 3 files); the review `SplitsTable`/`ZoneBar` pair
     (live via relative imports, plus the deliberate `components/ui` twins that fooled an
     earlier grep sweep); the `components/ui` barrel (through-barrel attribution);
     `TAB_BAR_*` constants (test-only consumer living outside their directory); `getInsight`
     (internal caller + direct unit tests); `getObservedMaxHrRun` (the live
     substring-twin of a dead name — the trap that ate the lib-db session's greps).
   - **Correctness check 1:** `EXTRACTION_SYSTEM_PROMPT` is correctly counted LIVE —
     `lib/llm/vision.ts` imports it. The prior `llm-yagni` doc said it had zero TS
     importers; that claim was stale. A standing detector surfaces this class of doc drift
     for free.
   - **Correctness check 2:** the `'distillNinaMemory'` string hits in tests are a
     boundary-guard test asserting the source does NOT contain those names — data, not
     imports — and knip correctly ignores them. This is precisely the over-count trap the
     text-based sweeps kept fighting.
   - Net: knip's AST resolution handled every trap class the hand-rolled sweeps kept
     re-learning, with zero manual disambiguation needed.
9. **Gates:** `npm run typecheck` exit 0; eslint clean on `knip.ts`; `prettier --check`
   clean on all changed files; vitest 5,183 passed + 3 failed, where the 3 are the
   DOCUMENTED parallel-load flake family (`components/admin/MemoryTable.test.tsx` add-row +
   `explorer/SelectionPane` refusal) — both files pass 36/36 with `--no-file-parallelism`,
   consistent with every prior session that reproduced the same flake on untouched files.

## Code / Design Details
**The standing report** (re-derived live during this doc-writing, 2026-09-12 —
`npm run knip`):
- Unused files: none. Unused dependencies: none. (The bare run's 11 + 1 are fully resolved:
  `research/**` is ignored as scratch, and the f04 probe is wired.)
- Unused exports: **152**. Unused exported types: **113**. Duplicate export pairs: **2**.

**Backlog clusters** (for the next YAGNI session's triage): `lib/nina` (`persona.ts`,
`prompts/*`, distill/vision/proactive), `lib/admin` (`chatPhotos`/`folderOps`/`schema`),
`lib/metrics`, `lib/env` (`adminEnv` — a pure needless-export-keyword case),
`components/admin` explorer, `tests/fixtures` + `tests/support`. knip's report
distinguishes in-file-used exports from fully dead values, so per-symbol triage is
de-export vs delete, not re-verification from scratch.

**The two duplicate-export pairs, dispositioned in the config's documentation trail:**
- `lib/nina/turnflight.ts`: `NINA_BACKGROUND_BUDGET_MS` | `NINA_TURN_POLL_GIVE_UP_MS` —
  **both names live** (`turnrun.ts` and `ChatScreen.tsx` import different names, and a test
  asserts their equality as a client/server invariant). Leave alone; this is an invariant
  pair, not drift.
- `lib/nina/schema.ts`: `NinaMemoryWriteSchema` | `SaveMemoryArgsSchema` — an alias pair;
  all external consumers use `SaveMemoryArgsSchema` (`tools.ts:447`). The fix is one
  dropped `export` keyword on the alias — a one-line follow-up deliberately not taken in a
  tooling commit.

**The annotated false positive** — the shape of the pattern, worth copying for any future
regex-contract symbol:

```
lib/llm/prompts/extraction.ts:88
  export const EXTRACTION_SHAPE = ...   ← flagged by knip, alive via scripts/f04-e2e-probe.mjs
                                          scraping SOURCE TEXT by regex; the probe replays the
                                          job without a TS loader (@/ alias + server-only), so
                                          no import-graph tool can see the consumer.
```

The commit adds the extended docblock at the symbol and the matching explanation in
`knip.ts`'s header, including the failure mode of the "obvious fix": dropping `export`
silently changes what the probe scrapes while `tsc` stays green either way.

**package.json delta:** + `"knip": "knip"`, + `"probe:f04": "node --env-file=.env.local scripts/f04-e2e-probe.mjs"`,
+ `"knip": "^6.35.1"` (devDeps), − `"nanoid"` (direct deps).

## Decisions & Trade-offs
- **Not wired into `ci.yml`.** The backlog is real (152 + 113), so `knip` in CI would redden
  every push from day one — a gate nobody reads is worse than no gate. The promotion path is
  explicit: burn the backlog, then add `npm run knip` to `ci.yml`. Until then it is a
  census tool, not a gate.
- **Annotation over suppression.** knip has no per-symbol ignore, so the one regex-contract
  symbol is handled by documentation (docblock + config header) rather than a suppression
  mechanism that would also hide genuinely new findings. Corollary stance: everything else
  the report lists is backlog, not noise to config away.
- **`ignoreExportsUsedInFile` stays `false`.** Turning it on would halve the report, but the
  filtered class — exports used only within their own file — is the repo's single most
  common real defect (nearly every YAGNI session's harvest was un-exports, not deletions).
- **Dropped the dependency rather than ignoring it.** An unused direct dep is either a
  deletion or a finding; `nanoid`'s import census made it a deletion. The transitive
  postcss copy is a different dependency edge and correctly out of scope.
- **Incidentally resolved an open question from the `llm-yagni` doc:** whether
  `.github/workflows/ci.yml` actually runs the `ci:*` guard scripts. It does — settled
  while reading CI wiring for the promotion-path decision.
- **Free doc-drift catch:** knip falsified the `llm-yagni` doc's "zero TS importers" claim
  for `EXTRACTION_SYSTEM_PROMPT` (`lib/llm/vision.ts` imports it). This is the standing
  detector's compounding value: its verdicts are re-derivable, so prose that drifts from
  the import graph becomes visibly wrong on the next run.

## Follow-ups & YAGNI notes
1. **The 152 unused exports + 113 unused exported types census IS the next YAGNI session's
   task list**, now costing zero setup. De-export vs delete is per-symbol triage; knip's
   report already distinguishes in-file-used exports from fully dead values. (Counts
   stamped 2026-09-12; `npm run knip` re-derives live — treat the tool, not this doc, as
   the source.)
2. **One-keyword fix available:** `lib/nina/schema.ts` — drop `export` from the
   `NinaMemoryWriteSchema` alias; every external consumer uses `SaveMemoryArgsSchema`
   (`tools.ts:447`).
3. **Do not touch the `turnflight` duplicate pair** — both names are live and a test pins
   their equality as a client/server invariant.
4. **`ci.yml` promotion after backlog burn-down** — add `npm run knip` as a gate only once
   the census is near-zero, so the gate stays meaningful.
5. **knip has no per-symbol ignore** — any future regex-scraped contract symbol needs the
   same annotation treatment as `EXTRACTION_SHAPE` (docblock at the symbol + a note in
   `knip.ts`), never a deletion of the `export`.

## Appendix
- **Commit:** `4f4fa3f` — `chore(tooling): adopt knip as the durable dead-export detector`
  — 4 files changed, +983/−23 (`knip.ts` +48; `lib/llm/prompts/extraction.ts` +10/−1-ish
  docblock; `package.json` 4 lines; `package-lock.json` +944-ish from the devDependency
  add + nanoid removal).
- **Verification run for this doc:** `npm run knip` re-executed on the branch tip —
  `Unused exports (152)`, `Unused exported types (113)`, `Duplicate exports (2)`, no
  unused-files/unused-dependencies sections, `EXTRACTION_SHAPE` present at
  `lib/llm/prompts/extraction.ts:88` as designed.
- **Negative-control ledger** (from 8 prior YAGNI doc digests, all correctly clean under
  knip): `pollDelayFor`; review `SplitsTable`/`ZoneBar`; `components/ui` barrel;
  `TAB_BAR_*`; `getInsight`; `getObservedMaxHrRun`.
- **Gates:** typecheck exit 0; eslint clean (`knip.ts`); prettier clean (changed files);
  vitest 5,183 passed / 3 failed = the documented MemoryTable + SelectionPane
  parallel-load flake family, 36/36 serial in both files.
- **Prior-session machinery this replaces** (for the archaeologically inclined): the
  compiler-API export extractor (`components-dead-code-a`), the review sweep
  (`review-yagni`), the 705-module import-graph inventory with the reversed-edge barrel BFS
  (`insights-metrics-panel`), the throwaway AST script (`ui-primitives-yagni`), the
  liveness map with the counter-key typo (`badges-records`), and the word-boundary grep
  batteries in every session before them.
