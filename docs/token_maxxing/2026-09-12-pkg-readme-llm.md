# Token-Maxxing Session — 2026-09-12: lib/llm package_readme (First Map + README Fold)

## 🎯 Achievement / End Result
- **Goal of the burn:** Write `lib/llm`'s first `.workflows/package_readme.md` —
  assigned verbatim by the coordinator: *"Write lib/llm's first package_readme.md
  (2733 lines, the largest lib/ package still undocumented) — its dead-export sweep
  already happened in llm-yagni-audit, but the compact map/rules doc this repo's
  convention calls for was never written."* `lib/llm` is the app's whole
  direct-contact-with-LLMs layer (vision extraction via `glm-4.6v`, narrative
  insights via `glm-5.3`): 13 source files (~2.5k source lines; 3,245 total .ts
  lines including the three co-located suites, measured 2026-09-12). The dead-code
  half of the package's hygiene was already done (llm-yagni-audit, commit
  `5421e6b`, 93 → 57 exports); what was missing was the map.
- **Concrete changes:** One commit, `456a294` — *docs(lib/llm): first
  package_readme.md — the map/rules doc; fold the F07-era README in* — 2 files,
  +543/−52, markdown-only:
  - `lib/llm/.workflows/package_readme.md` — **543 lines**, new. Overview, a
    file-by-file map table, **20 numbered standing rules**, a two-clients table,
    per-path deep dives (facts boundary, narrate cache rule, vision job, model
    switch), an error taxonomy, concurrency, performance/budgets tables, env vars,
    dependencies, reverse dependencies, usage patterns/anti-patterns, and
    historical context. Structure follows the `lib/nina` exemplar.
  - `lib/llm/README.md` — **deleted** (`git rm`). An F07-era 52-line prose README
    (by the commit stat; +543/−52), and the ONLY plain `README.md` under
    `lib/`, `components/`, `app/`, or `scripts/` anywhere in the tree. Its content
    was folded into the package_readme, ending the two-maps drift risk and leaving
    the tree consistent with the other 7 documented packages (all
    `.workflows/package_readme.md` only).
- **Real value delivered:**
  - **The 20 standing rules are the load-bearing core** — the rules a future
    editor breaks silently and pays for in production. Highlights, each traced to
    its source comment rather than paraphrased from memory: nothing throws for an
    LLM problem; a model call is never awaited from a page render; **the model
    computes nothing** (MEASURED −14.1% vs +12.3% sign flip); round-at-the-
    boundary-then-hash; `factsHash` canonicalization (keys sorted code-point
    order, arrays NOT reordered, absent ≠ null keys); one text-only budget-gated
    repair, and `max_tokens` truncation is never repaired; the
    `MIN_REPAIR_BUDGET_MS` twin-name warning (3_000 in narrate vs 28_000 in
    `lib/extract/constants`); `thinking: {type:'disabled'}` on BOTH endpoints is
    never removed (the 31-hour silent insights-table stall); SDK `maxRetries: 0` —
    the repair IS the retry; the token floor GATES parsing (500 × imageCount,
    checked before status, because the measured failure was itself a 200) and is
    deliberately NOT ported to narrative (no images there — a guard against an
    impossible condition is dead code that reads like a live defence); provenance
    from our records, never the model's answer; required-array-is-documentation
    (MEASURED 200-OK missing every title); `catalog.ts` as the only browser-safe
    zero-import module; `narrativeModel` never throws and is read live at dial
    time; the measured 108/108 prompt text is load-bearing;
    `EXTRACTION_SYSTEM_PROMPT`/`EXTRACTION_SHAPE` keep `export` for the f04
    probe's source-text regex scrape (knip reporting them unused is EXPECTED);
    data URIs, not hosted URLs; a prompt edit is a cache-key edit — bump
    `*_PROMPT_VERSION` in the same commit, and REPORT_TOOL's descriptions
    measurably count.
  - **A closed follow-up with evidence:** the llm-yagni-audit session's open
    question *"Is the payload-boundary guard actually in CI?"* — **VERIFIED
    TRUE**: `.github/workflows/ci.yml` line 88 runs `npm run ci:llm-payload-guard`;
    `package.json` wires it at line 48. Recorded in the package_readme's rule 2
    with the evidence, and in its Last Updated header. The yagni session could not
    answer it; this one did, in the doc where the next person will look.
  - **The tree's README inconsistency ended:** folding the F07-era README in means
    every documented package now follows one convention. The archived plan doc
    that names the old README (`docs/plans/archive/F07-insights.md`) was
    deliberately left alone — archives are records.
  - **Method discipline held throughout:** all 13 source files read in full before
    writing a word; every numeric claim traced to its source comment (the repo's
    own measured-notes style); the export count re-measured today rather than
    inherited; the known memory hazards checked before writing, not assumed away.
- **Branch:** `token-maxxing-2026-09-12-pkg-readme-llm` (worker session `pkg-readme-llm`
  of coordinator `tokenmax-orch-2026-09-12`; sibling sessions that day included the
  other pkg-readme workers, the optional-props pair, and dead-export-tooling)
- **Merge status:** merged (commit `15fe85b`)
- **Approx token burn:** est. ~0.7–1M, input-dominated — the full read of all 13
  source files (~2.5k lines) plus the llm-yagni-audit session doc before writing,
  the guard-script and CI-workflow verification reads, and the doc itself at 543
  lines written and reviewed against source. 🔥

## Context & Motivation
The 2026-09-11/12 token-maxxing campaign built a convention: each substantial
package carries a compact `.workflows/package_readme.md` — a map and a rules list,
not a narrative — loaded as recurring context by every future task that touches the
package. By 2026-09-12, eight packages had one (root, lib/db, lib/admin,
components/admin, lib/nina, components/nina, scripts, tools), and `lib/llm` was the
largest `lib/` package without one. Its dead-export sweep had landed the same day
(llm-yagni-audit: 93 → 57 exports, plus the stale-claim catch that wrote the
missing catalog pin), so the package was already clean — but clean and unmapped is
still unmapped: nothing recorded the two-client split, the repair budget, the
token floor's gating order, or why "unused" knip output on the prompt consts is
expected. The coordinator's fan-out assigned exactly this gap.

The second deliverable was discovered, not assigned: while reading the package, the
session found `lib/llm/README.md` — an F07-era prose README, the only plain
README.md under lib/components/app/tools/scripts in the whole tree — a second,
competing map of the same package, guaranteeing drift. The convention answer was to
fold it in and delete it.

## What We Did (blow-by-blow)
1. **Read everything first.** All 13 `lib/llm` source files in full — `client.ts`,
   `vision.ts`, `extract.ts`, `extractJson.ts`, `facts.ts`, `factsHash.ts`,
   `narrate.ts`, `runExtractionJob.ts`, `schema.ts`, `textModel.ts`, `catalog.ts`,
   `prompts/extraction.ts`, `prompts/narrate.ts` — plus the llm-yagni-audit session
   doc (`docs/token_maxxing/2026-09-12-llm-yagni-audit.md`) for the decisions the
   code alone doesn't explain (why the prompt consts keep `export`, what the audit
   left open).
2. **Checked the memory hazards before writing, not after.** The known trap: a
   package's `.workflows/plan/` copy sits INSIDE `lib/`, so filesystem string
   guards scan the copy's prose. Verified directly against the guard:
   `scripts/check-llm-payload-boundary.mjs` scans only `.ts`/`.tsx`
   (`/\.(ts|tsx)$/.test(path)`) AND strips comments first — so a `.md` file naming
   `getOrCreateInsight` 20+ times is doubly invisible to it. Verified, not assumed.
3. **Closed the predecessor's open question.** Grepped the CI wiring:
   `package.json:48` defines `ci:llm-payload-guard`, `.github/workflows/ci.yml:88`
   runs it. The llm-yagni-audit session ended with this exact question open; the
   answer (TRUE, with line numbers) went into the new doc's rule 2 and Last
   Updated header.
4. **Re-measured the volatile numbers.** Per the package-readme-volatile-numbers-
   rot rule, the export count was re-derived today, not inherited: **57 symbols
   total** (client 1, vision 8, extractJson 1, prompts/extraction 7,
   prompts/narrate 4, extract 3, factsHash 1, textModel 2, facts 14, narrate 7,
   runExtractionJob 2, schema 4, catalog 3) — matching the yagni audit's 57, and
   stamped with the measure date in the doc's Historical Context rather than
   stated as a permanent property.
5. **Verified the cross-package claims before documenting them.** `ninaModel` is a
   pure alias (`export const ninaModel = narrativeModel`, `lib/nina/turn.ts:160`)
   — checked before documenting lib/nina's consumption shape. The prose
   "importers" (ChatScreen, share pages) verified as comment references, not
   imports — the difference between a reverse-dependency claim and folklore.
6. **Wrote the doc** to the lib/nina exemplar's structure (overview → file map →
   20 numbered rules → two-clients table → per-path deep dives → error taxonomy →
   concurrency → performance/budgets → env vars → dependencies → reverse deps →
   usage/anti-patterns → historical context). The week/month budget constants'
   flagged-unmeasured admission is preserved verbatim — the doc says the budgets
   are unmeasured because the file header itself says so.
7. **Folded the F07 README in and deleted it.** Its one substantive claim the new
   doc didn't already carry (the CI-enforced boundary) was verified and absorbed
   into rule 2; its prose was folded into the corresponding sections; `git rm` ended
   it. The archived plan naming it (`docs/plans/archive/F07-insights.md`) was left
   untouched — archives are records, not living docs.
8. **Ran the gates, committed.** Prettier on the new doc; the payload-boundary
   guard (9/9 guarded symbols confined); targeted vitest on the package's 8 suites.
   Committed as `456a294`; reported DONE to the coordinator.

## Code / Design Details
- **The two-clients table** is the doc's structural spine: `vision.ts` speaks
  OpenAI-shaped fetch (glm-4.6v), `textModel.ts` speaks Anthropic-shaped SDK
  (glm-5.3), both from the ONE shared `LLM_API_KEY` via two different auth
  headers. R-40 (no second vision key) is recorded at the table. Everything else
  in the package routes through one of these two doors.
- **Rules cite their measurements, not their folklore.** Examples as written:
  the sign-flip rule carries MEASURED −14.1% vs +12.3%; the required-array rule
  carries MEASURED 200-OK missing every title; the token-floor rule records that
  the measured failure was itself a 200 — which is WHY the floor is checked before
  status; the `thinking: disabled` rule names the 31-hour silent insights-table
  stall as the price of removing it.
- **Twin-name warnings written at both ends:** the doc warns about
  `MIN_REPAIR_BUDGET_MS` being 3_000 in `narrate.ts` but 28_000 in
  `lib/extract/constants` — the same near-miss the yagni audit caught live, now
  permanent in the map so the next reader doesn't "unify" them.
- **The knip blind spot is documented as expected behavior:**
  `EXTRACTION_SYSTEM_PROMPT`/`EXTRACTION_SHAPE` keep `export` with zero TS
  importers because `scripts/f04-e2e-probe.mjs` scrapes them by the literal regex
  `` export const ${name} = ` `` — a non-TS consumer contract tsc and knip cannot
  see. The doc says knip reporting them unused is EXPECTED, so the next sweep
  doesn't re-flag them.
- **Diff shape:** 1 new `.md` (543 lines) + 1 deleted `.md` (52 lines). No
  TypeScript, no runtime code, no config.

## Decisions & Trade-offs
- **Fold, don't coexist.** Two maps of one package is a drift factory; the F07
  README's only non-duplicated claim was verified and absorbed rather than
  trusted. Trade-off: `docs/plans/archive/F07-insights.md` still names the deleted
  file — accepted, because archives are records and rewriting them falsifies
  history.
- **Structure copied from an exemplar, content derived from source.** The lib/nina
  readme's section skeleton was reused so future readers get one shape across
  packages; every sentence inside it was derived from today's tree, not from the
  exemplar's phrasing or from memory of reading the code.
- **Write rules, not state.** Volatile numbers (the 57 exports) are stamped with
  their measure date and framed as "as measured 2026-09-12", never as properties
  of the package — the doc's value is supposed to survive the next refactor.
- **Honesty about the unmeasured.** The narrate week/month BUDGET constants are
  the one unmeasured surface in the package, and the doc says so rather than
  inventing numbers — the file header says the same, and a map that lies about
  budgets is worse than one that admits the gap.
- **Gates scoped to the diff.** No TypeScript or runtime code changed, so tsc and
  build were not required and not run; the gates that could catch a doc-caused
  regression (prettier, the string guard, the package's 8 suites) all ran green.

## Follow-ups & YAGNI notes
- **The narrate week/month BUDGET constants remain the package's one unmeasured
  surface** (the file header itself says so). A measured-budget revisit stays open
  as the natural next lib/llm session once `/trends` has real history.
- **The `npm run test:live:*` suites remain the untested-by-us surface** (they cost
  real API money). Any session touching client/`textModel` resolution semantics
  should weigh one live run before trusting unit-level mocks.
- **The package_readme convention is now 8-for-8 among substantial packages.** The
  remaining undocumented `lib/` packages are all small single-purpose modules
  (date, flags, format, id, cn, pwa, etc.) — if the convention is to be completed,
  it is now a wide-and-shallow pass, not a deep one.
- **Deliberately NOT done:** no code changes of any kind (the sweep already
  happened in llm-yagni-audit); no rewrite of the archived F07 plan; no port of
  the vision token floor to narrate (no images there — recorded in the doc as a
  non-gap).

## Appendix
- **Commit:** `456a294` — "docs(lib/llm): first package_readme.md — the map/rules
  doc; fold the F07-era README in" — 2 files changed, 543 insertions(+),
  52 deletions(-).
- **New doc:** `lib/llm/.workflows/package_readme.md` (543 lines).
- **Deleted:** `lib/llm/README.md` (F07-era, 52 lines by the commit stat).
- **Gates, all green:**
  - `npx prettier --check` on the new doc.
  - `node scripts/check-llm-payload-boundary.mjs` — 9/9 guarded symbols confined.
  - Targeted vitest on the package's 8 suites (`lib/llm/extract`, `extractJson`,
    `vision` + `tests/llm.facts`, `factsHash`, `narrate`, `schema`, `textModel`) —
    **137/137 passed**.
  - tsc/build not run — no TypeScript or runtime code touched (diff = 1 new .md +
    1 deleted .md).
- **Verification receipts recorded in the doc:** `package.json:48` +
  `.github/workflows/ci.yml:88` (CI wiring); `lib/nina/turn.ts:160` (`ninaModel`
  alias); `scripts/check-llm-payload-boundary.mjs` extension scoping
  (`/\.(ts|tsx)$/.test(path)`) + comment stripping; 57-export census with
  per-module breakdown, measured 2026-09-12.
- **Related sessions:** `2026-09-12-llm-yagni-audit.md` (the predecessor whose
  open CI question this session closed); `2026-09-12-dead-export-tooling.md`
  (knip — the tool whose EXPECTED output on the prompt consts the doc explains);
  `2026-09-12-pkg-readme-*` (the sibling readme workers).
