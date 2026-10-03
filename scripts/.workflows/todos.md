# Todos: scripts

**Package Path**: `scripts`
**Package Code**: SC
**Last Updated**: 2026-10-03
**Total Active Tasks**: 0

## Quick Stats
- P0 Critical: 0
- P1 High: 0
- P2 Medium: 0
- P3 Low: 0
- P4 Backlog: 0
- Blocked: 0
- Completed: 6
- Archived: 2

---

## Active Tasks

### [P0] Critical

### [P1] High

### [P2] Medium

### [P3] Low

### [P4] Backlog

### 🚫 Blocked

---

## Completed Tasks

- [x] **P1-SC-A004** Phase 3: Repair existing production rows and delete freed files
  - **Difficulty**: NORMAL
  - **Type**: Bug
  - **Context**: Owns scripts/nina-profpic-pointer-repair.mjs (raw SQL via @neondatabase/serverless, del via @vercel/blob, pure planner + I/O main(), dry-run default, backup JSON outside repo, one sql.transaction, release after commit through six-column + jsonb check), the nina:profpic-pointer-repair npm script, tests/nina.profpicPointerRepair.test.ts. Exit: second dry run prints 0/0/0/0/0 skipped and `Daofejusg4Xa → media jWWu8vkl09fT blob_url MATCHES`; apply printed `failed 0`; backup outside repo; git status shows only the phase's three files; tests, typecheck, lint, format, knip green.
  - **Status**: completed
  - **Plan Set**: `PROFPIC_POINTER_SYNC_PLAN.md` (phase 3 of 3)
  - **Satisfies**: R1, R2, R3 — every Foto profil photo points at a real file; replace+set-as-profpic shows the new version; a replaced photo's old file is permanently deleted
  - **Depends on**: —
  - **Plan**: `.workflows/plan/P1-SC-A004.md`
  - **Completed**: 2026-10-03 15:02
  - **Method**: /do
  - **Files**: scripts/nina-profpic-pointer-repair.mjs, tests/nina.profpicPointerRepair.test.ts, package.json, scripts/.workflows/todos.md, scripts/.workflows/plan/P1-SC-A004.md
  - **Drift**:
    - Plan's test 'skips a legacy copy whose original is gone, or is itself a reference' expected skipped ids ['a1','a2'], but its own fixture m2 (sourceImageId 'm9', nonexistent) is also skipped by the reference pass. Planner is correct; assertion made exact and stricter: [['nina_avatars','a1'],['nina_avatars','a2'],['nina_message_images','m2']].
    - Plan's test indexed results directly (op., avatarOps[0].); tsconfig noUncheckedIndexedAccess made typecheck fail. Switched to optional chaining (op?., [0]?.), the idiom tests/nina.dedupeMedia.test.ts uses.
  - **Decided**:
    - Step 3 task creation → only phase 3's task created by this session (peer impl-profpic-pointer-sync-p1 runs concurrently in the same worktree and owns its own bookkeeping) (tie-break: narrower blast radius)
    - Unattended --apply against production → applied after dry-run counts matched exactly 21/11/13/7, 0 skipped (index Decision D5, rung 5)
    - Backup location → scratchpad per plan, plus a durable copy at ~/backups/run-insights/nina-profpic-pointer-repair-2026-10-03.json (outside the repo; scratchpad is session-temporary) (rung 1: invariant 7)
  - **Handoff**: POST-DEPLOY (Decision D6): once main with Phases 1–2 is live on Vercel, run `npm run nina:profpic-pointer-repair` (dry run) from the main checkout. All zeros = done; else `--apply --backup <path outside repo>`. 9 objects kept as kept-jsonb (nina_turns.args / nina_memory_slots.value still name them); 13 references with NULL width/height/bytes but correct pathname left alone (cosmetic follow-up).

- [x] **P1-SC-A003** Phase 2: Phantom-original census + `fill-dimensions` in the existing sweep
  - **Difficulty**: NORMAL
  - **Type**: Update
  - **Context**: Extends `scripts/nina-dedupe-plan.mjs` + `scripts/nina-dedupe-media.mjs` (no standalone script) with `isPhantomOriginal` / `classifyPhantomOriginals` — the census of "original" rows that arrived with `content_hash IS NULL` — and a new `fill-dimensions` op + `buildFillDimensionOps`, since `isPerceptualTwin` refuses any row with NULL width/height and nothing in this family has ever filled those columns; `signBytes` gains width/height via an added `img.metadata()` read. Writes exactly Phase 1's six columns, each op guarded on its own column; adds no flag, no `del()`, no `DELETE` under any flag. Exit: `npx tsc --noEmit` and the full suite green; the read-only production dry run correctly buckets phantom rows (recovered/partial/unrecoverable), never counts a live reference as a phantom, and ends with `DRY RUN — nothing written.`
  - **Status**: completed
  - **Plan Set**: `NINA_GHOST_PHOTO_DEDUP_FIX_PLAN.md` (phase 2 of 2 — final phase; set complete)
  - **Satisfies**: R1 — Implement a robust fix for the dedup gap: a reference row losing its provenance must never become a permanently-invisible, potentially-broken duplicate in Media
  - **Depends on**: P1-NIN-A051 — satisfied 2026-09-16: phase 1 landed on `feature/nina-ghost-photo-dedup-fix`; `lib/nina/provenancePromotion.ts` exists, the six promoted columns are fixed, and the barrel surface is at 96 names
  - **Plan**: `.workflows/plan/P1-SC-A003.md`
  - **Completed**: 2026-09-16 11:47
  - **Method**: /do
  - **Files**: scripts/nina-dedupe-plan.mjs, scripts/nina-dedupe-media.mjs, tests/nina.dedupeMedia.test.ts
  - **Verified**: `npx next typegen && npx tsc --noEmit` clean; `npm test` 6180/6180 across 354 files; `npx vitest run tests/nina.dedupeMedia.test.ts` 88/88 (76 existing + 12 new); `npx prettier --check` and `npx eslint scripts tests` clean; read-only production dry run (`npm run nina:dedupe-media`, no `--apply`) matched every exit criterion.
  - **Drift**: Production dry run shows 131 rows (plan's 2026-09-16 measurement was 129) — production grew by 2 rows in the interim, all references/originals unaffected. Phantom census still correctly shows 0 recovered / 0 partial / 1 unrecoverable (`Tdw_AkrJT0ks`), matching the plan's exit criteria exactly.
  - **Decided**: Import placement of `classifyPhantomOriginals` in `tests/nina.dedupeMedia.test.ts` → placed before `compareKeeperCandidates` (true alphabetical order: `cl` < `co`), not "between `compareKeeperCandidates` and `decodeStoredSignature`" as the plan's prose literally said, because that placement contradicts the plan's own stated intent ("keeping it alphabetical") and contradicts the identical import edit the plan itself specifies for `nina-dedupe-media.mjs`'s import list (rung 3: the phase plan's own code blocks).

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
