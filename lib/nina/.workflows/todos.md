# Todos: nina

**Package Path**: `lib/nina`
**Package Code**: NIN
**Last Updated**: 2026-09-12
**Total Active Tasks**: 9

## Quick Stats
- P0 Critical: 0
- P1 High: 3
- P2 Medium: 6
- P3 Low: 0
- P4 Backlog: 0
- Blocked: 0
- Completed: 39
- Archived: 35

---

## Active Tasks

### [P1] High

- [ ] **P1-NIN-A018** Phase 3: The coaching register and the insight path
  - **Difficulty**: HARD
  - **Type**: Feature
  - **Context**: Owns the instructor's coaching block in `lib/nina/persona.ts` (`isInstructor`, `INSTRUCTOR_COACHING`, `ninaInstructorCoachingBlock`), gated on the relationship; all three edits to `lib/nina/prompts/system.ts` (the `"patterns"` paragraph of `buildContextGuide` `:247`, the `WHAT YOU ARE READING` section `:485`, and `proactiveTuningSuffix` `:594`); `NINA_PROMPT_VERSION` 4 -> 5 in `lib/nina/prompts/index.ts` (`:36`); and the gated prose naming of phase 2's `training_plan` slot key (D7). Exit: under `instructor` the prompt prescribes against `REPEATED_HIGH_AVG_HR` and `PACE_REGRESSION` in training terms — a day, an effort, a duration and a field to re-read; the gate is `ninaActiveRelationship(tuning) === 'instructor'` and **never** `tuning.relationship`; the coaching block, the `"patterns"` clause, the proactive line and the slot key are **absent** from all five other levels, asserted per level; `buildContextGuide` never contains `training_plan` at any level; frozen snapshot passes unregenerated; the anger ladder renders identically at all six relationships; `NINA_PROMPT_VERSION === 5`; `npx vitest run` green at **145 test files** and >= 2834 tests.
  - **Status**: pending
  - **Plan Set**: `NINA_INSTRUCTOR_CHARACTER_PLAN.md` (phase 3 of 3)
  - **Satisfies**: R3 (the "monitor and give insights" half) — "she will proactively monitor his performance and give insights into what should he do"
  - **Depends on**: `P1-NIN-A016`, `P1-NIN-A017`
  - **Plan**: `.workflows/plan/nina-instructor-character/phase-3.md`
  - **Method**: /implement (swarm wave 1)
  - **Files**: lib/nina/persona.ts, lib/nina/prompts/system.ts, lib/nina/prompts/index.ts, tests/nina.prompts.test.ts

- [x] **P1-NIN-A043** Phase 4: Images module (§5 + §5a-2 + §5b) + script/test pointer fixes
  - **Difficulty**: HARD
  - **Type**: Refactor
  - **Context**: Owns moving §5 (old 1567–2105) + §5a-2 (2107–2197) + §5b (2199–2491; delete 1566–2491) into `queries/images.ts` (19 exports: 18 functions + the `NinaChatPhotoBlobPatch` interface); `isOriginalPhoto` and `generatedChatPhotoScope` become internal-shared module exports (doc noted) so the frozen barrel snapshot grows 83 → 85; fourth `export *` line plus the `./queries/images` import-back for §10b; repoints the live line-pointer comments in `scripts/nina-dedupe-media.mjs:60`, `scripts/nina-dedupe-plan.mjs:71,93`, and `tests/nina.imageprefs.test.ts:566–567` (path + `export `-keyword anchor); rewrites the two §9 §-pointers inside the moved span. Does not touch §6 onward or any script logic (comments only). Exit: scoped gates green; snapshot green with exactly the two documented additions; script comments cite the new module.
  - **Status**: done
  - **Plan Set**: `NINA_QUERIES_SPLIT_PLAN.md` (phase 4 of 8)
  - **Satisfies**: R1, R2, R4, R6, R7, R11 — the images domain moves under `lib/nina/queries/` with its banner prose traveling verbatim; §x cross-references rewritten to module names; historical records untouched — only live prose that becomes false is fixed; the barrel keeps re-exporting all 113 public symbols; zero behavior change
  - **Depends on**: `P1-NIN-A042`
  - **Plan**: `.workflows/plan/P1-NIN-A043.md`

- [x] **P1-NIN-A045** Phase 6: Avatars module (§9 + §9b)
  - **Difficulty**: HARD
  - **Type**: Refactor
  - **Context**: Owns moving §9 (old 2991–3252) + §9b (3254–3843; delete through 3844) into `queries/avatars.ts` (23 exports; `folderSubtree` stays private — its five callers are intra-module; §9b's six §9-symbol mentions are COMMENT-ONLY, zero code-level calls, so they become intra-module prose with no import); ninth `export *` line; wholesale replacement of the barrel's import block with the exact minimal requirement of the remaining §10–§12 code — PRESERVING phase 4's `./queries/images` import-back (§10b still calls it) and adding `import { countNinaAvatars } from './queries/avatars'`; two "this module's rule 1" pointer rewrites + the internal-shared marker on `countNinaAvatars`. Does not touch §10 onward. Exit: scoped gates green; snapshot green unmodified; barrel surface unchanged (no new name — `countNinaAvatars` was already public).
  - **Status**: done
  - **Plan Set**: `NINA_QUERIES_SPLIT_PLAN.md` (phase 6 of 8)
  - **Satisfies**: R1, R2, R4, R6, R11 — the avatars domain moves under `lib/nina/queries/` with its banner prose traveling verbatim; §x cross-references rewritten to module names; the barrel keeps re-exporting all 113 public symbols; zero behavior change
  - **Depends on**: `P1-NIN-A044`
  - **Plan**: `.workflows/plan/P1-NIN-A045.md`

### [P2] Medium

- [x] **P1-NIN-A040** Phase 1: Foundations: shapes + columns modules, barrel contract test, real install + build smoke
  - **Difficulty**: NORMAL
  - **Type**: Refactor
  - **Context**: Owns creating `lib/nina/queries/` with `shapes.ts` (§1, old lines 122–611 moved byte-identical — the 27 §1 type declarations incl. the ruling A1 banner; the file's 3 other type exports stay with §5b/§12) and `columns.ts` (§2, old 613–683; the four private column lists become module exports for sibling import — the barrel IMPORTS them, never re-exports them); converts `lib/nina/queries.ts`'s §1/§2 into the first barrel line (`export * from './queries/shapes'`) plus import-backs in the import block (the 27-name `import type` from `./queries/shapes` that §3+'s annotations need, and the `./queries/columns` value import); prunes the five §1-only schema type imports; adds `lib/nina/queries.test.ts` freezing the exact 83-name barrel value-export set; replaces the worktree's symlinked `node_modules` with a real install + `next build` smoke. Does not touch §3–§12 bodies. Exit: all sections §3+ compile unchanged against the foundation imports; barrel snapshot test green at 83; full vitest + typecheck + eslint + `next build` pass.
  - **Status**: done
  - **Plan Set**: `NINA_QUERIES_SPLIT_PLAN.md` (phase 1 of 8)
  - **Satisfies**: R1, R2, R3, R5, R9, R10, R11 — `lib/nina/queries.ts` splits into domain-grouped modules under `lib/nina/queries/` (§1 Shapes + §2 Column lists as shared foundation modules); the barrel keeps re-exporting all 113 public symbols with layer-wide invariants on its header; gates incl. a real install + `next build` smoke; zero behavior change
  - **Depends on**: —
  - **Plan**: `.workflows/plan/P1-NIN-A040.md`

- [x] **P1-NIN-A041** Phase 2: Sessions module (§3 + §4 group banner + §4a)
  - **Difficulty**: NORMAL
  - **Type**: Refactor
  - **Context**: Owns moving §3 (old 685–710) + the §4 group banner (712–714) + §4a (716–1131; delete 684–1132) into `queries/sessions.ts` (9 exports incl. `getNinaIdentity`; private `readNinaSessionsWithActivity`) with exactly three pointer rewrites; barrel gains its second `export *` line plus the `getNinaSession` import-back (sole §4b+ call :1327); prunes `ne`/`exists`/`max` from drizzle-orm (all §4a-only), `NINA_SLOT_PENDING_PROMISES`/`ninaChatSessions`/`users` from schema, the whole `@/lib/nina/sessions` statement, and the 3 session types + `sessionColumns` from phase 1's import-backs; moved §-refs rewritten to module names. Does not touch §4b onward. Exit: scoped gates green; phase 1's snapshot test green unmodified; barrel surface unchanged.
  - **Status**: done
  - **Plan Set**: `NINA_QUERIES_SPLIT_PLAN.md` (phase 2 of 8)
  - **Satisfies**: R1, R2, R4, R6, R11 — the sessions domain moves under `lib/nina/queries/` with its banner prose traveling verbatim; §x cross-references rewritten to module names; the barrel keeps re-exporting all 113 public symbols; zero behavior change
  - **Depends on**: `P1-NIN-A040`
  - **Plan**: `.workflows/plan/P1-NIN-A041.md`

- [x] **P1-NIN-A042** Phase 3: Messages module (§4b + §4c)
  - **Difficulty**: NORMAL
  - **Type**: Refactor
  - **Context**: Owns moving §4b (old 1133–1427; 7 exports + private `messageScope`) + §4c (1429–1565; 2 exports) into `queries/messages.ts` (imports `getNinaSession` from `./sessions`, `messageColumns` from `./columns`; `hasProactiveMessageForRun` :1581 is §5's, NOT §4b's); two §-pointer rewrites (Rewrite A intra-module docstring, Rewrite B the :1433 §5 pointer); third `export *` line; removes the `getNinaSession` import-back and prunes `gt`, `messageColumns`, `NinaMessageInsert`, `NinaMessageRow`. Does not touch §5 onward. Exit: scoped gates green; snapshot green unmodified; barrel surface unchanged.
  - **Status**: done
  - **Plan Set**: `NINA_QUERIES_SPLIT_PLAN.md` (phase 3 of 8)
  - **Satisfies**: R1, R2, R4, R6, R11 — the messages domain moves under `lib/nina/queries/` with its banner prose traveling verbatim; §x cross-references rewritten to module names; the barrel keeps re-exporting all 113 public symbols; zero behavior change
  - **Depends on**: `P1-NIN-A041`
  - **Plan**: `.workflows/plan/P1-NIN-A042.md`

- [x] **P1-NIN-A044** Phase 5: Memory, shortcuts, nags, turns modules (§6, §6b, §7, §8)
  - **Difficulty**: NORMAL
  - **Type**: Refactor
  - **Context**: Owns moving §6 (old 2493–2674) → `queries/memory.ts` (8 exports), §6b (2676–2878) → `queries/shortcuts.ts` (5), §7 (2880–2926) → `queries/nags.ts` (2), §8 (2928–2989) → `queries/turns.ts` (2); zero prose rewrites; NO import-backs (comment-stripped scan: zero code-level callers in §9–§12); each module keeps its private helpers (`renderSlotValue`, `shortcutColumns`, `toShortcutRecord`, `derivedTrigger`) module-private; four barrel lines (block reaches 8); prunes 9 schema members + the whole `@/lib/nina/shortcuts` statement + the 10 moved types from the shapes back-import. Does not touch §9 onward. Exit: scoped gates green; snapshot green unmodified; barrel surface unchanged.
  - **Status**: done
  - **Plan Set**: `NINA_QUERIES_SPLIT_PLAN.md` (phase 5 of 8)
  - **Satisfies**: R1, R2, R4, R6, R11 — the memory, shortcuts, nags and turns domains move under `lib/nina/queries/` with their banner prose traveling verbatim; §x cross-references rewritten to module names; the barrel keeps re-exporting all 113 public symbols; zero behavior change
  - **Depends on**: `P1-NIN-A043`
  - **Plan**: `.workflows/plan/P1-NIN-A044.md`

- [x] **P1-NIN-A046** Phase 7: Tuning, imageprefs, jobphotos modules (§10, §10b, §11, §12)
  - **Difficulty**: NORMAL
  - **Type**: Refactor
  - **Context**: Owns moving §10 (old 3845–4018) → `queries/tuning.ts` (2 exports; a code-level leaf), §10b (4020–4335) → `queries/imageprefs.ts` (4 exports; imports `countNinaChatPhotos` + `generatedChatPhotoScope` from `./images` and `countNinaAvatars` from `./avatars` — the DAG's only cross edges), §11 (4337–4385) + §12 (4387–4573) → `queries/jobphotos.ts` (2 functions + 2 interfaces; imports NOTHING from `./columns` — the §12→§2 edge was docstring-only); deletes the barrel's whole residual import block (incl. both import-backs) — barrel completes as header + exactly 12 `export *` lines, ZERO imports, no SQL; repoints `tests/nina.imageprefs.test.ts:546` and `tests/db.schema.nina.test.ts:525,705` to the new module paths. Does not touch the sibling model layers (`lib/nina/tuning.ts`, `lib/nina/imageprefs.ts` — distinct paths, deliberate mirror naming). Exit: scoped gates green; snapshot green unmodified (85 names, column lists absent); `queries.ts` contains no SQL and no imports.
  - **Status**: done
  - **Plan Set**: `NINA_QUERIES_SPLIT_PLAN.md` (phase 7 of 8)
  - **Satisfies**: R1, R2, R4, R6, R11 — the tuning, imageprefs and jobphotos domains move under `lib/nina/queries/` with their banner prose traveling verbatim; §x cross-references rewritten to module names; the barrel keeps re-exporting all 113 public symbols; zero behavior change
  - **Depends on**: `P1-NIN-A045`
  - **Plan**: `.workflows/plan/P1-NIN-A046.md`

- [x] **P1-NIN-A047** Phase 8: Final sweep: §-ref audit, package readme, barrel module map, full gates incl. build
  - **Difficulty**: NORMAL
  - **Type**: Refactor
  - **Context**: Owns the barrel header's 19-line module map (which domain lives where; invariant prose byte-identical; opening line `module`→`layer`); the moved-prose pointer sweep — 9 line-pointer instances in `shapes.ts`/`messages.ts`/`images.ts`/`imageprefs.ts` (rows 3–5, 8–17; rows 6/7/10 are phase 3's/phase 4's own rewrites, verify-only here) plus 3 live-code pointers outside the moved file (`lib/admin/folderOps.ts:320`, `lib/admin/ninaAlbumActions.ts:635`, `lib/nina/imageprefs.ts:456`) and the one live §-pointer (`lib/nina/searchActions.ts:40`) — repoint, never reword the argument; `lib/nina/.workflows/package_readme.md` updated (8 edits: rules not state, date-stamped counts, barrel test named); `lib/.workflows/package_readme.md` VERIFIED NO-OP (grep evidence recorded in the commit body); verifies zero diff under `*/.workflows/plan/` and `docs/plans/archive/`; the audit greps (no `nina/queries.ts:NNN` survivor; §-allowlist inside the layer) and the full gate set: full vitest, `npm run typecheck`, `npm run lint`, prettier check, `npm run knip`, `next build`. Does not touch source semantics or historical records. Exit: every gate green on the finished tree; readme states the new rule; the barrel is header + map + 12 re-export lines, zero imports.
  - **Status**: done
  - **Plan Set**: `NINA_QUERIES_SPLIT_PLAN.md` (phase 8 of 8)
  - **Satisfies**: R2, R3, R6, R7, R8, R10 — the barrel keeps re-exporting all 113 public symbols and gains the layer-wide module map on its header; residual §x cross-references swept; historical records untouched, only live prose that becomes false fixed; `lib/nina/.workflows/package_readme.md` updated (rules not state, dated counts); full gate set incl. `next build`
  - **Depends on**: `P1-NIN-A046`
  - **Plan**: `.workflows/plan/P1-NIN-A047.md`

### [P3] Low

### [P4] Backlog

---

## Completed Tasks

(all thirty-five completed tasks were archived on 2026-09-12 — see Archive; full
per-task detail — Context, Drift, Decided, Files — survives in git history and in
`.workflows/package_readme.md`)

- [x] **P1-NIN-A037** Phase 3: OpenRouter fallback — vision/multimodal
  - **Difficulty**: NORMAL
  - **Type**: Feature
  - **Context**: Owns retry logic inside the vision/describe path: on a z.ai throw, `NinaVisionTokenFloorError`, or `NinaVisionTransportError`, retry once against OpenRouter (`z-ai/glm-5.3-flash`, same OpenAI-Chat-Completions shape, no translation layer needed) without applying the glm-4.6v-calibrated token floor to the fallback's response; logs a `nina_error_logs` row (`category:'multimodal'`, with `imageUrl`, `userId` NULL) for each failed attempt. Also owns `lib/nina/openrouter.ts` — the new zero-import constants module holding `OPENROUTER_CHAT_URL` and `NINA_FALLBACK_TEXT_MODEL`, shared with Phase 2, created here and written by no one else. Does not touch `lib/llm/vision.ts` (the unrelated `extractions`/screenshot feature), `describeNinaImagesWithFetch` (byte-identical), any admin UI. Exit: existing vision tests pass unmodified when z.ai succeeds; a new test simulates a z.ai token-floor trip and a transport failure, asserting the OpenRouter retry fires and its plain non-empty check (not the floor) gates acceptance; a double-failure test asserts both attempts are logged with the photo's Blob URL.
  - **Status**: done
  - **Plan Set**: `NINA_LLM_FALLBACK_ERROR_LOGS_PLAN.md` (phase 3 of 5)
  - **Satisfies**: R1 — OpenRouter (`z-ai/glm-5.3-flash`, multimodal) fallback when a z.ai-backed LLM call fails
  - **Depends on**: `P1-DB-A007`
  - **Plan**: `.workflows/plan/P1-NIN-A037.md`
  - **Completed**: 2026-09-12 09:12
  - **Method**: /do
  - **Files**: lib/nina/openrouter.ts, lib/nina/vision.ts, lib/nina/vision.test.ts
  - **Drift**: Plan's test code needed three type-level fixes to compile (runtime behavior unchanged): (1) `route()`'s fixture params widened from `() => Promise<Response>` to `() => Response | Promise<Response>` because the fixtures return Response synchronously; (2) the mocked `logNinaError` typed as `vi.fn<(entry: unknown) => Promise<void>>(async () => {})` with a single-arg forwarding wrapper — the plan's zero-arg `vi.fn` made `mock.calls` empty tuples (TS2493) and its `(...args)` spread wrapper tripped TS2556; the `vi.fn<T>` generic is this repo's existing convention (cf. `tests/nina.jobActions.test.ts`); (3) eslint flagged the plan's unused rest param, gone with the typed generic.
    Two "what the log row carries" assertions could never pass as written: `describeLogInput` returns `JSON.stringify` output, so a multi-line system prompt is newline-escaped inside it and `toContain(prompt)` cannot match. Changed to `JSON.parse` the row and assert exact field equality (`row.system === prompt`) — a stronger check than the substring, not a looser one; all other assertions of those tests kept.
    Plan said "replace lines 1-18" of vision.test.ts but its own replacement block extends through the `respond()` helper (old line 28); applied the block as the new file head, so `respond()` is not duplicated.
    SHARED WORKTREE — scoped verification, peers live: this worktree concurrently hosts in-flight phase 4 (`lib/nina/imagecall.ts`, `imagerun.ts`, `tests/nina.image*.test.ts`) and phase 5 (`app/admin/error-logs/`, `components/admin/ErrorLogList*`, `LogTextDialog`, `lib/admin/errorLogModel.ts`, `AdminNavLinks*`, `tests/admin.shell.test.ts`). Repo-wide gates therefore carry THEIR in-flight state: `tsc` has exactly 1 error (`app/admin/error-logs/page.tsx` — missing Next typegen for the new route, their file); `npm test` has exactly 3 failures (`components/admin/ErrorLogList.test.tsx`, a file that does not exist at HEAD, their file). ZERO errors/failures in any file this phase touches. Scoped checks all green: tsc clean on the 3 files, `vision.test.ts` 32/32, the three pin suites (admin.chatPhotos / admin.albumAvatarActions / admin.chatPhotoAdoption) 134/134 unmodified, `ci:openrouter-guard` OK, prettier+eslint clean on the 3 files.
  - **Decided**: log-row prompt assertion fails on JSON newline escaping → parse the row and assert exact field equality (`row.system === prompt`) (rung 2: the phase's exit criteria demand the row carry the exact prompt variant; parse-and-compare is the exact check; "a failing verification is never settled by relaxing the check" — this tightened it).
    Plan's mock/call typings do not compile under this repo's tsconfig → typed via the repo's `vi.fn<sig>()` convention, runtime identical (rung 6: surrounding convention).

- [x] **P1-NIN-A038** Phase 4: Image-generation error logging
  - **Difficulty**: NORMAL
  - **Type**: Feature
  - **Context**: Owns threading the currently-discarded `detail` (raw provider text) and the actual configured timeout through `failNinaImageJob`'s call chain into a `nina_error_logs` write (`category:'image_generation'`, `fullInput` = `args.prompt`, `imageUrl` = `args.referenceUrl` when present). Does not touch the retry/requeue/revival logic itself, `nina_turns`'s own `error_code` classification, any provider/model choice. Exit: a test that forces a terminal image-generation failure asserts a `nina_error_logs` row is written with the raw detail text and the correct timeout value for that host/anchoring combination; existing image-job tests unaffected.
  - **Status**: done
  - **Plan Set**: `NINA_LLM_FALLBACK_ERROR_LOGS_PLAN.md` (phase 4 of 5)
  - **Satisfies**: R2 — New admin "Error logs" tab, 3 sub-tabs, with the specified columns/behaviors
  - **Depends on**: `P1-DB-A007`
  - **Plan**: `.workflows/plan/P1-NIN-A038.md`
  - **Completed**: 2026-09-12 09:20
  - **Method**: /do
  - **Files**: lib/nina/imagecall.ts, lib/nina/imagerun.ts, tests/nina.imagelog.test.ts, tests/nina.imagerun.test.ts, tests/nina.imagecall.test.ts
  - **Drift**: Step 6's new imagecall test case: the plan's code assumed unsetting `process.env.OPENROUTER_API_KEY` reaches the key-absent ("nothing sent", `timeoutMs` null) path. It does not inside that file — `ninaEnv()` memoizes its parse (`ninaCache ??=`, lib/env.ts:222-226) and the file's earlier cases have already warmed the cache, so the call proceeded to fetch, got the bare `vi.fn()`'s undefined, and died at `res.text()`. Fixed inside the test only (`vi.resetModules()` + dynamic re-import gives the case the cold registry the 2026-09-04 incident actually had); the asserted intent — `timeoutMs` null when nothing was sent, 150s/235s/degraded ceilings otherwise — is unchanged and passes.
    Full-sweep `npm test` shows the documented MemoryTable add-row flake (`components/admin/MemoryTable.test.tsx`, varying failure counts 2→4→2 across runs, passes 20/20 in isolation, zero import contact with this diff — no shared files): not attributable to this phase; it also runs red with these exact signatures under swarm machine load.
    `npm run lint` reports 4 errors + 8 warnings, all in files ABSENT from this branch's diff vs origin/main (`components/nina/NinaBarProvider.test.tsx`, `components/nina/useChatScroll.test.tsx`, `components/ui/Card.test.tsx` + unused-var warnings) — pre-existing state inherited from main, not moved by this phase; this phase's five files produce no lint findings.
  - **Decided**: Step 6 no-key sub-case unreachable via env var (`ninaEnv` memoizes) → `vi.resetModules()` + fresh dynamic import in the test, preserving the plan's asserted intent (`timeoutMs` null when nothing was sent) — rung 3: the plan's code-block intent kept; mechanism corrected to the file's memoized reality; recorded as a comment in the test.
  - **Verified**: `npm run typecheck` clean (next typegen + `tsc --noEmit`); `npx vitest run` over the five image suites 96/96 (`nina.imagelog` 6 new tests, `nina.imagecall` 8 incl. the new R2-timeout case, `nina.imagerun`, `nina.jobActions`, `nina.imageworker`); `npm test` 5132+ passed with only the pre-existing MemoryTable flake red; `npm run format:check`, `ci:openrouter-guard`, `ci:llm-payload-guard`, `db:check` all green. Store ('store: …') and finish ('finish: …') failures deliberately do NOT log (D2 — the model call succeeded); `scripts/nina-image-worker.ts` out of scope per Handoffs.

- [x] **P1-NIN-A036** Phase 2: OpenRouter fallback — text chat
  - **Difficulty**: HARD
  - **Type**: Feature
  - **Context**: Owns a new OpenRouter-backed `NinaLlmClientLike` implementation in `lib/nina/llmFallbackText.ts` (Anthropic⇄OpenAI-Chat-Completions request/response translation, including forced single-tool `tool_choice` and tool-result round-trips), wired into `productionDeps(userId)` so both of `turn.ts`'s existing catch sites transparently retry via OpenRouter on a z.ai throw; writes a `nina_error_logs` row (`category:'text'`) for each failed attempt (z.ai and/or OpenRouter). Does not touch `turn.ts`'s loop/repair control flow itself, `nina_turns` writes, any admin UI, `lib/nina/openrouter.ts` (read-only here — Phase 3 owns and writes it; this phase must not redeclare either constant, it imports `OPENROUTER_CHAT_URL` / `NINA_FALLBACK_TEXT_MODEL` from the `lib/nina/openrouter.ts` module Phase 3 creates). Exit: existing `lib/nina/turn.ts`/`chatturn` tests still pass unmodified in behavior when the fallback is never exercised (z.ai succeeds); a new test simulates a z.ai throw and asserts the OpenRouter path is called and its result flows through `findSendBlock`/`findToolUses` unchanged; a double-failure test asserts both attempts are logged and the turn still ends `'unavailable'`.
  - **Status**: done
  - **Plan Set**: `NINA_LLM_FALLBACK_ERROR_LOGS_PLAN.md` (phase 2 of 5)
  - **Satisfies**: R1 — OpenRouter (`z-ai/glm-5.3-flash`, multimodal) fallback when a z.ai-backed LLM call fails
  - **Depends on**: `P1-DB-A007`, `P1-NIN-A037`
  - **Plan**: `.workflows/plan/P1-NIN-A036.md`
  - **Completed**: 2026-09-12 09:44
  - **Method**: /do
  - **Files**: lib/nina/llmFallbackText.ts, lib/nina/turn.ts, lib/nina/turnrun.ts, tests/nina.llmFallbackText.test.ts
  - **Drift**: The plan's failing-test code block had an index arithmetic slip (case 'carries is_error into the tool text and drops thinking blocks'): its input has no leading user turn, so the translated array is [system, assistant, tool] (indices 0/1/2), but the plan asserted the assistant at messages[2] and the tool at messages[3]. Fixed the two indices and added a one-line comment; the CONTENT of every assertion is unchanged (thinking block dropped, is_error folded into 'ERROR: bad date'). The plan's implementation code was correct — the sibling test 'replays a completed tool round' asserts the full array and passed byte-for-byte.
    The plan's manual grep 'deps.client.messages.create returns exactly two hits' now returns three: :911 and :1075 are the code (unchanged count, no third call site); the third at :1112 is prose inside the docblock paragraph the plan's own Step 2b appends.
    `npm run lint` fails with 4 PRE-EXISTING errors on HEAD, in files byte-identical to HEAD and owned by no phase of this set (`components/nina/NinaBarProvider.test.tsx`, `components/nina/useChatScroll.test.tsx`, `components/ui/Card.test.tsx` x2 react/no-unescaped-entities). eslint scoped to this phase's four files is CLEAN — not fixed: widening scope to unrelated files is forbidden, and the baseline failure predates this plan set.
    Full vitest run 5182/5184: the 2 failures are the documented MemoryTable add-row flake under parallel file load (varies run to run; 20/20 with --no-file-parallelism) — unrelated to this diff, file untouched by this set.
  - **Decided**: Plan's failing test index arithmetic vs plan's implementation code → fixed the test's indices, assertion content unchanged (rung 3: phase plan code blocks; implementation corroborated by the sibling full-array test that passed byte-for-byte)
    npm run lint gate vs 4 pre-existing HEAD errors in files no phase owns → scoped eslint clean on this phase's four files; did not widen scope to fix unrelated test files (tie-break: never widen scope; narrower blast radius)
  - **Verified**: re-measured in the shared worktree after p4/p5 landed: `tests/nina.llmFallbackText.test.ts` 15/15, `lib/nina/turn.test.ts` 59/59, `tests/nina.turnrevive.test.ts` + `lib/nina/turnflight.test.ts` 36/36 (turnrevive is `turnrun.ts`'s real under-test suite — it mocks `@/lib/nina/turn` and drives `turnrun` for real, including the server-only pin on `turnrun.ts`), `lib/nina/chatturn.test.ts` 10/10; `npm run typecheck` exit 0, `ci:openrouter-guard` OK, `format:check` exit 0; full suite 5182/5184 with only the documented MemoryTable parallel-load flake. The completion report's quoted `tests/nina.turnrun.test.ts` does not exist — vitest silently ignores a non-matching filter, so its "74/74" was turn (59) + fallback (15).

- [x] **P1-NIN-A039** Phase 1: Exclude album-adopted photographs from the chat side of the reference picker
  - **Difficulty**: NORMAL
  - **Type**: Bug
  - **Context**: Owns generatedChatPhotoScope in lib/nina/queries.ts, its docstring and isOriginalPhoto's neighbouring prose; tests/nina.imageprefs.test.ts's plan-invariant-13 describe block; a check that tests/nina.photoRefs.test.ts's REFERENCE_SKIPPED-based assertions still pass. Exit criteria: a chat photograph adopted into the album (an nina_avatars row with source_key = 'chat-photo:<id>') no longer appears via the chat side of listNinaPhotoReferences, and countNinaChatPhotos agrees; an un-adopted chat photograph is unaffected; mediaCollectionScope-driven reads are unaffected; tests pass; typecheck passes.
  - **Status**: done
  - **Plan Set**: `PHOTO_REFERENCE_DEDUP_ALBUM_ADOPTION_PLAN.md` (phase 1 of 1)
  - **Satisfies**: R1 — Diagnose why Photo reference shows duplicate photos (the first two), and deduplicate Photo reference so a photo present in both Image collection's Album and Media views is shown once
  - **Plan**: `.workflows/plan/P1-NIN-A039.md`
  - **Completed**: 2026-09-12 12:28
  - **Method**: /do
  - **Files**: lib/nina/queries.ts, tests/nina.photoRefs.test.ts, tests/nina.imageprefs.test.ts

---

## Archive

### 2026-09

- P1-NIN-A000: Phase 1: The tuning model and its row — `NINA_CHARACTER_TUNING_PLAN.md` (phase 1 of 6) [.workflows/plan/P1-NIN-A000.md]
- P1-NIN-A001: Phase 2: The canon, re-cut as a function — and the repeal — `NINA_CHARACTER_TUNING_PLAN.md` (phase 2 of 6) [.workflows/plan/P1-NIN-A001.md]
- P1-NIN-A002: Phase 3: `buildNinaSystemPrompt`, and the turn that reads it — `NINA_CHARACTER_TUNING_PLAN.md` (phase 3 of 6) [.workflows/plan/P1-NIN-A002.md]
- P1-NIN-A003: Phase 4: The camera, and a promise she keeps in the chat — `NINA_CHARACTER_TUNING_PLAN.md` (phase 4 of 6) [.workflows/plan/P1-NIN-A003.md]
- P1-NIN-A004: Phase 3: Girlfriend register: manja, imut, vowel lengthening — `ADMIN_RESPONSIVE_NINA_INTIMACY_PLAN.md` (phase 3 of 5) [.workflows/plan/P1-NIN-A004.md]
- P1-NIN-A005: Phase 4: Per-parameter enable toggles — `ADMIN_RESPONSIVE_NINA_INTIMACY_PLAN.md` (phase 4 of 5) [.workflows/plan/P1-NIN-A005.md]
- P1-NIN-A006: Phase 5: The `horny` trait — `ADMIN_RESPONSIVE_NINA_INTIMACY_PLAN.md` (phase 5 of 5) [.workflows/plan/P1-NIN-A006.md]
- P1-NIN-A007: Phase 1: Unblock the camera: the three measured defects — `NINA_IMAGE_PIPELINE_AND_ASYNC_CHAT_PLAN.md` (phase 1 of 7) [.workflows/plan/nina-image-pipeline-and-async-chat/phase-1.md]
- P1-NIN-A008: Phase 2: Move generation onto Vercel Fluid compute; demote GitHub Actions to backstop — `NINA_IMAGE_PIPELINE_AND_ASYNC_CHAT_PLAN.md` (phase 2 of 7) [.workflows/plan/nina-image-pipeline-and-async-chat/phase-2.md] — Open: exit criteria 1-6 are **manual production checks** and are unverified, not assumed — they need a deploy and a real conversation: ask her for a selfie, close the tab, confirm `nina_message_images` gains its first row ever, confirm `nina_avatars` gains its first `source='generated'` row, confirm the backstop still drains a job from the Actions UI.
- P1-NIN-A009: Phase 3: WhatsApp-style send: instant persist, durable background turn — `NINA_IMAGE_PIPELINE_AND_ASYNC_CHAT_PLAN.md` (phase 3 of 7) [.workflows/plan/nina-image-pipeline-and-async-chat/phase-3.md]
- P1-NIN-A010: Phase 4: Job tracking: `/nina/jobs`, the detail page, and the jump to the triggering bubble — `NINA_IMAGE_PIPELINE_AND_ASYNC_CHAT_PLAN.md` (phase 4 of 7) [.workflows/plan/nina-image-pipeline-and-async-chat/phase-4.md]
- P1-NIN-A011: Phase 5: The tracking section on `/nina/about`, below Media — `NINA_IMAGE_PIPELINE_AND_ASYNC_CHAT_PLAN.md` (phase 5 of 7) [.workflows/plan/nina-image-pipeline-and-async-chat/phase-5.md]
- P1-NIN-A012: Phase 6: Permanent session deletion: take the distilled memory with it — `NINA_IMAGE_PIPELINE_AND_ASYNC_CHAT_PLAN.md` (phase 6 of 7) [.workflows/plan/nina-image-pipeline-and-async-chat/phase-6.md]
- P1-NIN-A013: Phase 1: Model the random suffix as its own group, in both predicates, and pin the fixtures to a measured one — `BLOB_STORED_PATHNAME_WINDOW_PLAN.md` (phase 1 of 1) [.workflows/plan/P1-NIN-A013.md] — Outstanding: exit criterion 6, the post-deploy prod probe (upload `enina5.png` through `/admin/photos` on the deployed branch and confirm a `nina_message_images` row), is NOT done and is run by the main context after this push.
- P1-NIN-A014: Phase 2: Soft delete: `nina_turns.deleted_at` and the tidy list — `NINA_JOB_REDO_AND_SOFT_DELETE_PLAN.md` (phase 2 of 2) [.workflows/plan/P1-NIN-A014.md]
- P1-NIN-A015: Phase 1: Redo: reopen a failed job from its own args — `NINA_JOB_REDO_AND_SOFT_DELETE_PLAN.md` (phase 1 of 2) [.workflows/plan/P1-NIN-A015.md]
- P1-NIN-A016: Phase 1: The sixth character, and the 3x2 grid — `NINA_INSTRUCTOR_CHARACTER_PLAN.md` (phase 1 of 3) [.workflows/plan/nina-instructor-character/phase-1.md]
- P1-NIN-A017: Phase 2: A schedule she can keep — `NINA_INSTRUCTOR_CHARACTER_PLAN.md` (phase 2 of 3) [.workflows/plan/nina-instructor-character/phase-2.md] — Outstanding: the manual `/admin/memory` browser check (plan's Manual check 1-4) was deliberately not run — a production build of the shared worktree would compile phase 1's in-flight edits, making the result attributable to neither phase. Every automated criterion is met; do the browser confirmation once the wave has landed.
- P1-NIN-A019: Phase 1: Her eyes for her own photo, and her voice for the caption — `NINA_PHOTO_CAPTION_FROM_IMAGE_PLAN.md` (phase 1 of 4) [.workflows/plan/P1-NIN-A019.md]
- P1-NIN-A020: Phase 4: Generated selfies caption from the scene she asked for — `NINA_PHOTO_CAPTION_FROM_IMAGE_PLAN.md` (phase 4 of 4) [.workflows/plan/P1-NIN-A020.md]
- P1-NIN-A021: Phase 3: Tap a bubble to edit or delete it — `NINA_PHOTO_REFS_AND_BUBBLE_ACTIONS_PLAN.md` (phase 3 of 4) [.workflows/plan/P1-NIN-A021.md]
- P1-NIN-A022: Phase 4: Resend a message that was never answered — `NINA_PHOTO_REFS_AND_BUBBLE_ACTIONS_PLAN.md` (phase 4 of 4) [.workflows/plan/P1-NIN-A022.md]
- P1-NIN-A023: Phase 2: Firing a shortcut into the turn — `NINA_EMOJI_SHORTCUTS_PLAN.md` (phase 2 of 4) [.workflows/plan/P1-NIN-A023.md]
- P1-NIN-A024: Phase 2: The prompt: body canon, length ladder, focus, venue, time, notes — `NINA_IMAGE_GENERATION_TAB_PLAN.md` (phase 2 of 7) [.workflows/plan/P1-NIN-A024.md]
- P1-NIN-A025: Phase 1: Search hits deep-link through `?jump=` and the landing survives a same-session soft nav — `SEARCH_JUMP_PINPOINT_PLAN.md` (phase 1 of 1) [.workflows/plan/P1-NIN-A025.md]
- P1-NIN-A026: Phase 3: The reference image on the wire, and the timeout it costs — `NINA_IMAGE_GENERATION_TAB_PLAN.md` (phase 3 of 7) [.workflows/plan/P1-NIN-A026.md]
- P1-NIN-A027: Phase 6: Test prompt, its verdict, and the photo in Chat photos — `NINA_IMAGE_GENERATION_TAB_PLAN.md` (phase 6 of 7) [.workflows/plan/P1-NIN-A027.md]
- P1-NIN-A028: Phase 1: Cancel-and-retarget: supersede a thinking turn, discard its result — `NINA_BURST_CANCEL_PLAN.md` (phase 1 of 2) [.workflows/plan/P1-NIN-A028.md]
- P1-NIN-A029: Phase 7: Retire `nina_tuning.wardrobe` — `NINA_IMAGE_GENERATION_TAB_PLAN.md` (phase 7 of 7) [.workflows/plan/P1-NIN-A029.md]
- P1-NIN-A030: Phase 1: Orphan-able photographs: the FK, the migration, and every reader that assumed a message — `CHAT_PHOTO_ORPHANS_AND_UNIQUENESS_PLAN.md` (phase 1 of 3) [.workflows/plan/chat-photo-orphans-and-uniqueness/phase-1.md]
- P1-NIN-A031: Phase 2: Re-parent an orphaned chat photograph instead of copying it — `CHAT_PHOTO_ORPHANS_AND_UNIQUENESS_PLAN.md` (phase 2 of 3) [.workflows/plan/chat-photo-orphans-and-uniqueness/phase-2.md]
- P1-NIN-A032: Phase 2: Answer the accumulated bubbles: burst framing in the turn prompt — `NINA_BURST_CANCEL_PLAN.md` (phase 2 of 2) [.workflows/plan/P1-NIN-A032.md]
- P1-NIN-A033: Phase 3: Write-time dedup: jalur generated + admin — `MEDIA_DEDUPE_PLAN.md` (phase 3 of 4) [.workflows/plan/P1-NIN-A033.md]
- P1-NIN-A034: Phase 1: Idempotent reveal append (pure helper + call site + tests) — `NINA_DUP_BUBBLE_REVEAL_PLAN.md` (phase 1 of 1) [.workflows/plan/P1-NIN-A034.md]
- P1-NIN-A035: Phase 1: Cross-resolution perceptual twin gate + production merge — `FIX_CROSS_RESOLUTION_PERCEPTUAL_DEDUPE_PLAN.md` (phase 1 of 1) [.workflows/plan/P1-NIN-A035.md]
