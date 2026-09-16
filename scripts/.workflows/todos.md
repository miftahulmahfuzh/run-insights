# Todos: scripts

**Package Path**: `scripts`
**Package Code**: SC
**Last Updated**: 2026-09-16
**Total Active Tasks**: 1

## Quick Stats
- P0 Critical: 0
- P1 High: 1
- P2 Medium: 0
- P3 Low: 0
- P4 Backlog: 0
- Blocked: 0
- Completed: 4
- Archived: 2

---

## Active Tasks

### [P0] Critical

### [P1] High

- [ ] **P1-SC-A003** Phase 2: Phantom-original census + `fill-dimensions` in the existing sweep
  - **Difficulty**: NORMAL
  - **Type**: Update
  - **Context**: Extends `scripts/nina-dedupe-plan.mjs` + `scripts/nina-dedupe-media.mjs` (no standalone script) with `isPhantomOriginal` / `classifyPhantomOriginals` — the census of "original" rows that arrived with `content_hash IS NULL` — and a new `fill-dimensions` op + `buildFillDimensionOps`, since `isPerceptualTwin` refuses any row with NULL width/height and nothing in this family has ever filled those columns; `signBytes` gains width/height via an added `img.metadata()` read. Writes exactly Phase 1's six columns, each op guarded on its own column; adds no flag, no `del()`, no `DELETE` under any flag. Exit: `npx tsc --noEmit` and the full suite green; the read-only production dry run correctly buckets phantom rows (recovered/partial/unrecoverable), never counts a live reference as a phantom, and ends with `DRY RUN — nothing written.`
  - **Status**: `open`
  - **Plan Set**: `NINA_GHOST_PHOTO_DEDUP_FIX_PLAN.md` (phase 2 of 2)
  - **Satisfies**: R1 — Implement a robust fix for the dedup gap: a reference row losing its provenance must never become a permanently-invisible, potentially-broken duplicate in Media
  - **Depends on**: P1-NIN-A051 — satisfied 2026-09-16: phase 1 landed on `feature/nina-ghost-photo-dedup-fix`; `lib/nina/provenancePromotion.ts` exists, the six promoted columns are fixed, and the barrel surface is at 96 names
  - **Plan**: `.workflows/plan/P1-SC-A003.md`

### [P2] Medium

### [P3] Low

### [P4] Backlog

### 🚫 Blocked

---

## Completed Tasks

- [x] **P1-SC-V2XN** `/search-analysis` skill and its diagnostic script
  - **Difficulty**: NORMAL
  - **Type**: Feature
  - **Context**: Owns `scripts/search-analysis.mjs`, `.claude/skills/search-analysis/SKILL.md`, and one additive `nina:search-analysis` line in `package.json`'s `scripts` block. Exit: a `/search-analysis <query> <part-of-id>`-shaped invocation resolves the partial id by substring (`strpos`), refusing zero matches (exit 3) and ambiguous matches (exit 4, listing the candidates) — never guessing; runs the unfiltered ranking query (no 48-row cap, no 0.2 floor, scoped to the target row's owner) and emits one JSON document on stdout carrying the target's true rank/score, `description`, `searchKeywords`, `embeddedText`, `hasEmbedding`, a `wouldAppearInApp` verdict with `cutBy` reasons, the candidate count and the top 10 competing rows; diagnosis and reporting only — the session makes zero write calls; `git diff --stat` shows exactly three paths.
  - **Status**: completed
  - **Plan Set**: `NINA_ALBUM_SEARCH_RELEVANCE_TOOLS_PLAN.md` (phase 3 of 3 — final phase; set complete)
  - **Satisfies**: R3 — `/search-analysis <text-query> <part-of-image-id>` skill — diagnose, never auto-edit
  - **Depends on**: `P1-ADM-T8RM` — satisfied 2026-09-15: phase 2 landed on `feature/nina-album-search-relevance-tools`, the `search_keywords` column's migration is applied to the production database, and `lib/nina/avatarEmbedText.ts` exists and is zero-import
  - **Plan**: `.workflows/plan/P1-SC-V2XN.md`
  - **Completed**: 2026-09-15 15:37
  - **Method**: /do
  - **Files**: scripts/search-analysis.mjs, .claude/skills/search-analysis/SKILL.md, package.json, components/admin/explorer/PhotoDescription.tsx, scripts/backfill-avatar-embeddings.mjs, tests/admin.albumDescribeEmbed.test.ts
  - **Verified**: `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm test` 6083/6083; `npx tsc --noEmit --listFiles | grep -c search-analysis` → 0 (the new `.mjs` is outside the tsc program); offline smoke with no args and no env → exit 2, proving the cross-phase import of `lib/nina/avatarEmbedText.ts` resolves with no database and no API key; live read-only runs against the production database — happy path on `Rm2NGvY5DFwe` (fragment `Rm2NG`) reported rank 4/53 at score 0.221 for query "tete", ambiguity refusal (fragment `a` → exit 4, 9 candidates) and not-found refusal (`zzzzzzzzzzzz` → exit 3); ranking cross-checked against `scripts/album-search-probe.mjs` for the same query — ids and scores agree to 4 decimal places, confirming the SQL was genuinely mirrored.
  - **Drift**: Every step in the phase plan applied verbatim — the script and the skill markdown are both complete-file code blocks from the plan, applied as-is.
  - **Drift**: Three files phase 2 already committed (`components/admin/explorer/PhotoDescription.tsx`, `scripts/backfill-avatar-embeddings.mjs`, `tests/admin.albumDescribeEmbed.test.ts`) turned out not to be prettier-clean, discovered when this phase's `npm run format:check` flagged them alongside the new files. Ran `npx prettier --write` on all four touched files; the resulting diffs on the three phase-2 files are pure whitespace/line-wrapping (verified via `git diff`, 4-5 line diffs each, no logic change), and the full suite stayed green (6083/6083) afterward. Included in this phase's commit since format:check is a hard gate and the fix is trivial and safe — recorded here rather than silently folded in.
  - **Note**: `/search-analysis` was not separately invoked as a skill from a fresh Claude Code session (that would mean this session invoking a skill on itself); the script's correctness and the SKILL.md's read-only instructions were verified directly instead.

- [x] **P1-SC-A002** Phase 5: Push from the off-platform backstop worker
  - **Difficulty**: HARD
  - **Type**: Feature
  - **Context**: Owns `scripts/nina-image-worker/finish.ts` (both `finishSelfie` and `closeFailed`), the new sibling module `scripts/nina-image-worker/push.ts`, `.github/workflows/nina-image.yml`'s three `VAPID_*` lines, and the worker's test (`tests/nina.imageworker.test.ts`, modified) — sends `'worker_photo_delivered'` after the photograph's row/insert/ledger close, and `'worker_photo_apology'` after `closeFailed`'s terminal update, both through a worker-local sender that imports every judgement from `lib/push/payload.ts` and restates only the plumbing. Exit: a photograph the worker finishes pushes its caption and one it gives up on pushes her apology, both only after their rows and the ledger close are committed; a retry, an avatar job, an unresolvable session and a failed apology insert each push nothing and still close the job; the run exits 0 and finishes the photograph when the VAPID secrets are absent; typecheck/lint/format/test all pass.
  - **Status**: completed
  - **Plan Set**: `NINA_PUSH_EVERY_MESSAGE_PLAN.md` (phase 5 of 5)
  - **Satisfies**: R1 — When Nina answers something the runner said, a push notification is sent
  - **Depends on**: `P1-PSH-A000`
  - **Plan**: `.workflows/plan/P1-SC-A002.md`
  - **Completed**: 2026-09-14 11:33
  - **Method**: /do
  - **Files**: scripts/nina-image-worker/push.ts, scripts/nina-image-worker/finish.ts, .github/workflows/nina-image.yml, tests/nina.imageworker.test.ts
  - **Verified**: `npx tsc --noEmit`, `npm run lint`, `npm run format:check` (this phase's four files), `npx vitest run tests/nina.imageworker.test.ts` 72/72, `npm run nina:worker:dry` (`preflight ok { jobId: null, mode: 'sweep' }`), workflow YAML parses, full `npm test` 5863/5864 — the single red, `tests/admin.albumActionsBarrel.test.ts`, is the known parallel-load timeout flake and passed 5/5 in isolation.
  - **Note**: closes C3, the last uncovered `nina_messages` write in the set — `closeFailed`'s apology, assigned to this phase by the reconciler (decision D3 in the plan index, settled there, not reopened here).

(both earlier completed tasks were archived on 2026-09-12 — see Archive; full per-task
detail — Context, Drift, Decided, Files — survives in git history and in
`.workflows/package_readme.md`)

---

## Archive

### 2026-09

- P1-SC-A000: Phase 4: Import the ledger's shortcuts — `NINA_EMOJI_SHORTCUTS_PLAN.md` (phase 4 of 4) [.workflows/plan/P1-SC-A000.md]
- P1-SC-A001: Phase 4: Backfill sweep: hash-fill + peleburan duplikat existing — `MEDIA_DEDUPE_PLAN.md` (phase 4 of 4) [.workflows/plan/P1-SC-A001.md] — was held at the plan's production-drift stop rule (the phase never ran `--apply`; the snapshot acceptance was falsified); closed 2026-09-11 — apply runs measured against production (48/52 rows hashed, 17 repointed), recorded in `scripts/.workflows/package_readme.md`
