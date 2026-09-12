# Token-Maxxing Session — 2026-09-12: Env & Config Hygiene Census

## 🎯 Achievement / End Result
- **Goal of the burn:** A WORKER session (slug `tokenmax-env-config-hygiene`) pre-assigned one
  idea by the coordinator (`tokenmax-orch-2026-09-12`, fan-out mode — no idea menu; the idea
  arrived with the spawn). The assignment: cross-check `lib/env.ts`'s validated environment
  variables, plus `package.json` dependencies/devDependencies (36 total) and
  `tsconfig.json`/`next.config.*` settings, against actual repo-wide usage; remove or flag
  anything genuinely unreferenced and fix anything stale. Why this idea: the env contract +
  dependency manifest + build config is the one class of repo surface that no prior YAGNI
  sweep of the 2026-09-11/12 campaign had ever targeted **as a unit** — sessions had swept
  lib trees, component trees, app tree, schema, charts, even docs, but never the
  configuration layer itself.
- **Verdict: the layer was mostly healthy, with real findings.** Merged-quality work committed
  on the branch as three commits:
  - `3f916c6` — `chore(env): drop the dead NODE_ENV chain and env.ts's unused exports`
    (`lib/env.ts`, +10/−13)
  - `c4c2e6e` — `docs(env): document NINA_FLASH_BLINKS in .env.example` (+7)
  - `1c57520` — `chore(config): drop the two build-config settings nothing wanted`
    (`tsconfig.json` + `next.config.ts`)
- **Real value delivered:**
  - **lib/env.ts's dead surface removed** — the NODE_ENV schema member (its only readers were
    `isProduction`/`isDevelopment`, and nothing read those either: zero refs outside the
    file), the `isProduction`/`isDevelopment` exports, `adminEnv()` un-exported
    (`isAdminEmail` is the admin group's only consumer and lives in the same file), and 7
    exported type aliases with zero imports (`CoreEnv`/`AuthEnv`/`BlobEnv`/`CronEnv`/
    `NinaEnv`/`PushEnv`/`AdminEnv`). knip delta: unused exports 31→28, unused types 50→43,
    and **lib/env.ts is now absent from the knip report entirely** — a cluster the
    dead-export-tooling doc had named as backlog, closed.
  - **`.env.example`'s one genuinely-live omission fixed** — `NINA_FLASH_BLINKS` was read in
    production (server component `app/nina/page.tsx`, per render, via `flashBlinkCount()`,
    default 4 = `NINA_FLASH_BLINKS_DEFAULT` in `lib/nina/reply.ts`, clamped 1..8) but was
    missing from the template anyone copying the repo would start from. Documented in the
    optional section.
  - **Build-config settings spelling defaults or targeting nothing, dropped** — tsconfig's
    `"**/*.mts"` include glob (no `.mts` file exists anywhere in the tree; survived a
    follow-up `next typegen` run unchanged) and next.config.ts's `reactStrictMode: true`
    (Strict Mode has been the app-router default since Next 13.5.1 per the bundled Next 16
    docs, and the app has no `pages/` directory — the key was spelling the default). The
    absence is documented in next.config.ts's trailing comment block per house style,
    preserving the Node.js-runtime note that sat above the removed key.
  - **A measurement-backed refusal recorded** — `resolveJsonModule` looked dead (zero `.json`
    imports repo-wide) but `next typegen` force-restores it as a mandatory setting ("to
    match webpack resolution") and rewrites tsconfig when absent. The removal attempt is
    abandoned and the reasoning recorded in the commit message, so no future session
    re-burns the same experiment.
  - **A full negative-result census banked** — all 36 dependencies genuinely used (the
    zero-import ones are convention-loaded), all 18 remaining validated env vars consumed,
    vercel.json's cron paths both resolving to real `CRON_SECRET`-guarded routes. The
    env/config layer is certified alive, which is itself the sweep's deliverable.
- **Branch:** `token-maxxing-2026-09-12-env-config-hygiene`
- **Merge status:** on branch at `1c57520`, tree clean — this worker does NOT merge; the
  coordinator (`tokenmax-orch-2026-09-12`) lands the merge.
- **Approx token burn:** high (est. ~0.8–1M, input-dominated) — the census methodology is
  grep-heavy over the whole tree, plus two full typegen+tsc runs, a full vitest sweep, and a
  `next build`. 🔥

## Context & Motivation
The 2026-09-12 fan-out (`tokenmax-orch-2026-09-12`) dispatched many worker sessions at the
repo's remaining un-swept surfaces. Every prior YAGNI session in the campaign had swept
*code* directories — lib trees, component directories, the app tree, schema, charts, scripts,
even the docs — but the **configuration layer** had never been censused as one unit:

- `lib/env.ts` defines the validated env contract (zod schema → typed accessors) that every
  runtime env read is supposed to flow through;
- `package.json`'s 36 dependencies/devDependencies are the dependency manifest;
- `tsconfig.json` + `next.config.ts` are the build configuration.

Three different files, one question: *is everything declared here actually consumed?* The
question runs in both directions — dead declarations to delete (the YAGNI direction), and
live consumers missing from documentation to add (the hygiene direction, i.e. `.env.example`
lagging the real contract). This session was assigned exactly that dual-direction census.

Constraints honored: no production DB access, no package_readme edits, coordinator lands the
branch.

## What We Did (blow-by-blow)
1. **Dual-direction census, three surfaces.** For each declared thing, find consumers; for
   each consumer-side knob, check it is declared/documented. knip (`npm run knip` — the
   instrument adopted earlier the same day by session `tokenmax-dead-export-tooling`) did
   the AST-level work; manual greps covered what no import graph can see.
2. **Dependency census (36 deps).** knip's unused-dependency section plus a manual
   import/require grep census of every dependency name. Result: **all 36 genuinely used.**
   The ones with zero import statements are convention-loaded, each verified individually:
   `happy-dom` via per-file `@vitest-environment` pragmas in 20+ component tests;
   `prettier` + `prettier-plugin-tailwindcss` via npm scripts and `.prettierrc.json`'s
   `plugins` key; `@tailwindcss/postcss` via `postcss.config.mjs`; `typescript` and the
   `@types/*` packages via `tsc` itself. Nothing dropped; nothing to drop.
3. **Env-var census, both access styles.** Raw `process.env` dot-access AND bracket-access
   sweeps (bracket access is invisible to naive dot-greps), plus validated-var accessor
   sweeps (`env.X`, `*Env().X`, destructuring) for everything flowing through the
   `lib/env.ts` contract, plus per-variable bare-identifier repo-wide censuses with
   comment-line filtering (a bare name in a comment is prose, not a consumer — the trap
   every prior sweep documented).
   - **One dead chain found and removed** (commit `3f916c6`): the `NODE_ENV` schema member,
     whose only readers inside env.ts were the `isProduction`/`isDevelopment` helpers, which
     themselves had zero refs outside the file. Next.js consumes NODE_ENV itself at build
     time; this repo's contract never did anything with it. Also in the commit: `adminEnv()`
     un-exported (in-file consumer only), and the 7 zero-import type aliases.
   - **Two false alarms resolved honestly** (commit-free): `VITEST_INTEGRATION` and
     `LLM_LIVE_TEST` looked dead in the first sweep — the first grep's file list had simply
     omitted `vitest.config.ts`, which reads both. Re-checked, confirmed consumed, no change
     made, false alarm recorded.
   - **The remaining 18 validated vars all consumed**, including the three with non-obvious
     shapes: `AUTH_GOOGLE_ID`/`AUTH_GOOGLE_SECRET` read raw in `auth.config.ts` by design
     (outside the zod contract), `DATABASE_URL_UNPOOLED` read in `drizzle.config.ts` with a
     pooled-host guard, `ADMIN_EMAILS` via `isAdminEmail` → `lib/admin/requireAdmin.ts`.
   - **One documentation gap found and fixed** (commit `c4c2e6e`): `NINA_FLASH_BLINKS` was
     live in production but absent from `.env.example`. Every other entry in the template
     maps to the env.ts contract; this knob was the one runtime variable read in production
     but undocumented for anyone copying the template. Added to the optional section with
     its default and clamp range.
   - **vercel.json checked too:** both cron paths resolve to real routes guarded by
     `CRON_SECRET`. No orphans.
4. **Build-config census against the bundled Next 16 docs.** `next.config.ts` keys were
   checked against `node_modules/next/dist/docs/` (the AGENTS.md-mandated source of truth
   for this Next version, not training data); tsconfig flags were checked against actual
   repo usage.
   - `reactStrictMode: true` — spells the app-router default (since Next 13.5.1, per the
     bundled `reactStrictMode.md`), and the app has no `pages/` directory where the flag
     would still matter. Removed, with the absence documented in the file's trailing
     comment block, house style (commit `1c57520`).
   - `"**/*.mts"` include glob — no `.mts` file exists anywhere in the tree. Removed, and
     the removal *survived a follow-up `next typegen` run unchanged*, proving the framework
     does not want the glob back (commit `1c57520`).
   - `resolveJsonModule` — zero `.json` imports repo-wide, so it *looked* removable; the
     removal was attempted and **abandoned on measurement**: `next typegen` force-restores
     it as a mandatory setting ("to match webpack resolution") and rewrites tsconfig when
     it is absent. Recorded in the commit message.
   - The `@/*` path alias — 523 consuming files. Emphatically alive.
   - `allowImportingTsExtensions` — live: `scripts/nina-image-worker` and tests import with
     explicit `.ts` extensions. Kept.
5. **Process incident, caught and repaired:** one Edit misfire on tsconfig.json removed the
   live `"jsx": "react-jsx"` line instead of `resolveJsonModule`. Restored from the file's
   on-disk state within one tool round, and the final file proven by two full
   typegen+tsc runs. No gate ever saw the broken state.
6. **Gates, all green after the edits:** `prettier --check` on touched files; `npm run
   typecheck` (`next typegen && tsc --noEmit`) exit 0 twice; eslint on touched files exit 0;
   `npm run knip` re-run with the exact expected delta (31→28 exports, 50→43 types,
   lib/env.ts gone from the report); `npm test` — 296 test files, 5,402 tests, **all
   passed**, including the flake-family files; `npm run build` (`next build`) exit 0.
7. **Working tree left clean** on the branch at `1c57520`, ready for the coordinator.

## Code / Design Details
**The env.ts removal, in census form** — every removal is a name that went from "declared
and exported" to "gone", each with its consumer count at removal time:

| Removed | Why it was dead |
|---|---|
| `NODE_ENV` (schema member) | only readers were the two helpers below, themselves dead; Next consumes the var at build time, the contract never did |
| `isProduction`, `isDevelopment` (exports) | zero refs outside lib/env.ts |
| `adminEnv()` (de-exported, kept internal) | sole consumer `isAdminEmail()` lives in the same file |
| `CoreEnv`, `AuthEnv`, `BlobEnv`, `CronEnv`, `NinaEnv`, `PushEnv`, `AdminEnv` (type aliases) | zero imports anywhere |

knip before → after: unused exports **31 → 28**, unused exported types **50 → 43**, and
lib/env.ts absent from the report — the report now names nothing in the file.

**The NINA_FLASH_BLINKS contract as documented** (`.env.example`, optional section): read
per render by the `app/nina/page.tsx` server component via `flashBlinkCount()`; unset or
malformed falls back to `NINA_FLASH_BLINKS_DEFAULT` (4, `lib/nina/reply.ts`), clamped to
1..8.

**The resolveJsonModule lesson** — the shape of the trap, worth copying:
`next typegen` treats tsconfig as partially *owned* by the framework. A flag can have zero
repo-side consumers and still be mandatory, because the consumer is the toolchain
("to match webpack resolution"). The test for "is this tsconfig flag dead" is therefore not
"who imports JSON" but "does typegen put it back" — a cheaper experiment than it looks,
since typegen runs in seconds and rewrites the file itself.

**The reactStrictMode removal's documentation trail** — next.config.ts's trailing comment
block (house style) now records that the setting is absent *because* it is the default,
and preserves the Node.js-runtime note that sat above the removed key. Deleting a
spells-the-default key without recording why invites its resurrection in the next config
pass.

## Decisions & Trade-offs
- **Negative results are deliverables.** All 36 deps and 18 remaining env vars verified
  alive is not "nothing found" — it is a certified census of a surface no sweep had ever
  covered, and it converts future "is X still used?" questions into lookups instead of
  re-sweeps.
- **False alarms get recorded as false alarms, not silently dropped.** The
  `VITEST_INTEGRATION`/`LLM_LIVE_TEST` miss (first grep omitted `vitest.config.ts` from its
  file list) is documented because the *methodology defect* — a grep whose file enumeration
  misses a config file — is exactly the class of error that produces a wrong deletion in a
  less careful pass.
- **Abandon on measurement, record the refusal.** `resolveJsonModule` fit every static
  criterion for dead and was removed anyway on the first attempt; typegen's force-restore
  ended the experiment. Rather than fight the toolchain or leave a silent revert, the
  flag stays where typegen puts it and the commit message carries the whole story.
- **Un-export rather than delete where the code is live.** `adminEnv()` is genuinely used —
  by `isAdminEmail()` in the same file — so the fix is dropping the `export` keyword, not
  the function. Same discipline the dead-export sessions applied repo-wide.
- **Convention-loaded dependencies get individually verified, never batch-assumed.** Each
  zero-import dep got its own loading-mechanism proof (pragma, config key, plugin registry,
  compiler) before being marked alive.
- **Scope discipline:** knip's remaining 28 unused exports + 43 unused types belong to the
  dead-export session's declared triage backlog — real, but outside this session's
  file scope. Flagged, not touched.

## Follow-ups & YAGNI notes
1. **knip's remaining census is the dead-export session's declared backlog, unchanged by
   this session except where lib/env.ts was concerned:** 28 unused exports + 43 unused
   exported types (counts as of this session's re-run; heaviest in `lib/admin/*`). Not this
   session's scope.
2. **One duplicate-export pair remains, already dispositioned as an invariant by the knip
   adoption session:** `NINA_BACKGROUND_BUDGET_MS` | `NINA_TURN_POLL_GIVE_UP_MS`
   (`lib/nina/turnflight.ts`) — both names live, a test pins their equality as a
   client/server invariant. Leave alone. Re-flagged here only because this session's knip
   re-run surfaced it again.
3. **Dead authority pointers in lib/env.ts's header** — it cites `ROADMAP_v0.1.0.md` §4.1
   and `IMPLEMENTATION_PLAN.md` §1.1 as the contract's authority, and **neither file exists
   in the tree**. Dead citations for a future docs pass (the same drift class the
   docs-design-dead-links and app-tree-yagni sessions repaired elsewhere).
4. **resolveJsonModule is permanent until the toolchain says otherwise** — do not re-derive
   this: typegen force-restores it. The commit message on `1c57520` is the record.
5. **`@types/*` and convention-loaded deps will always look dead to an import grep** — any
   future dependency census should start from this doc's loading-mechanism list rather than
   re-interrogating each one.

## Appendix
- **Commits (this branch, in order):**
  - `3f916c6` — `chore(env): drop the dead NODE_ENV chain and env.ts's unused exports`
    (lib/env.ts, +10/−13)
  - `c4c2e6e` — `docs(env): document NINA_FLASH_BLINKS in .env.example` (+7)
  - `1c57520` — `chore(config): drop the two build-config settings nothing wanted`
    (tsconfig.json, next.config.ts)
- **Gates ledger:** prettier --check clean (touched files) · typecheck exit 0 ×2 · eslint
  exit 0 (touched files) · knip delta exact (31→28 exports, 50→43 types, lib/env.ts absent)
  · vitest 296 files / 5,402 tests, all passed · next build exit 0.
- **Census results at a glance:** deps 36/36 alive · validated env vars 18/18 alive after
  removals · NINA_FLASH_BLINKS: live-but-undocumented → documented · tsconfig: 1 glob
  dropped, 1 flag removal abandoned on typegen's force-restore · next.config: 1
  spells-the-default key dropped · vercel.json: 2/2 cron paths live and guarded.
- **Methodology inventory (for the next config-layer sweep):** raw `process.env` dot AND
  bracket sweeps; validated accessor sweeps (`env.X`, `*Env().X`, destructuring);
  per-variable bare-identifier censuses with comment-line filtering; knip for
  exports/types/deps; bundled `node_modules/next/dist/docs/` as the authority for Next
  config keys; `next typegen` survival as the test for framework-owned tsconfig flags.
- **Prior sessions this one stands on:** `tokenmax-dead-export-tooling` (same day) for the
  knip instrument and the pre-removal 31/50 baseline; every prior YAGNI session's
  comment-line-filtering discipline; the coordinator fan-out pattern
  (`tokenmax-orch-2026-09-12`).
