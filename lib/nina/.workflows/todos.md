# Todos: nina

**Package Path**: `lib/nina`
**Package Code**: NIN
**Last Updated**: 2026-09-12
**Total Active Tasks**: 2

## Quick Stats
- P0 Critical: 0
- P1 High: 2
- P2 Medium: 0
- P3 Low: 0
- P4 Backlog: 0
- Blocked: 0
- Completed: 37
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

- [ ] **P1-NIN-A036** Phase 2: OpenRouter fallback — text chat
  - **Difficulty**: HARD
  - **Type**: Feature
  - **Context**: Owns a new OpenRouter-backed `NinaLlmClientLike` implementation in `lib/nina/llmFallbackText.ts` (Anthropic⇄OpenAI-Chat-Completions request/response translation, including forced single-tool `tool_choice` and tool-result round-trips), wired into `productionDeps(userId)` so both of `turn.ts`'s existing catch sites transparently retry via OpenRouter on a z.ai throw; writes a `nina_error_logs` row (`category:'text'`) for each failed attempt (z.ai and/or OpenRouter). Does not touch `turn.ts`'s loop/repair control flow itself, `nina_turns` writes, any admin UI, `lib/nina/openrouter.ts` (read-only here — Phase 3 owns and writes it; this phase must not redeclare either constant, it imports `OPENROUTER_CHAT_URL` / `NINA_FALLBACK_TEXT_MODEL` from the `lib/nina/openrouter.ts` module Phase 3 creates). Exit: existing `lib/nina/turn.ts`/`chatturn` tests still pass unmodified in behavior when the fallback is never exercised (z.ai succeeds); a new test simulates a z.ai throw and asserts the OpenRouter path is called and its result flows through `findSendBlock`/`findToolUses` unchanged; a double-failure test asserts both attempts are logged and the turn still ends `'unavailable'`.
  - **Status**: open
  - **Plan Set**: `NINA_LLM_FALLBACK_ERROR_LOGS_PLAN.md` (phase 2 of 5)
  - **Satisfies**: R1 — OpenRouter (`z-ai/glm-5.3-flash`, multimodal) fallback when a z.ai-backed LLM call fails
  - **Depends on**: `P1-DB-A007`, `P1-NIN-A037`
  - **Plan**: `.workflows/plan/P1-NIN-A036.md`

### [P2] Medium

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
