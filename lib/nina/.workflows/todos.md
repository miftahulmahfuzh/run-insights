# Todos: nina

**Package Path**: `lib/nina`
**Package Code**: NIN
**Last Updated**: 2026-09-12
**Total Active Tasks**: 1

## Quick Stats
- P0 Critical: 0
- P1 High: 1
- P2 Medium: 0
- P3 Low: 0
- P4 Backlog: 0
- Blocked: 0
- Completed: 35
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

### [P2] Medium

### [P3] Low

### [P4] Backlog

---

## Completed Tasks

(all thirty-five completed tasks were archived on 2026-09-12 — see Archive; full
per-task detail — Context, Drift, Decided, Files — survives in git history and in
`.workflows/package_readme.md`)

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
