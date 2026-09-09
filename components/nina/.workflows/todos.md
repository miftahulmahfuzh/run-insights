# Todos: components/nina

**Package Path**: `components/nina`
**Package Code**: CN
**Last Updated**: 2026-09-09
**Total Active Tasks**: 0

## Quick Stats
- P0 Critical: 0
- P1 High: 0
- P2 Medium: 0
- P3 Low: 0
- P4 Backlog: 0
- Blocked: 0
- Completed: 2

---

## Active Tasks

### [P1] High

### [P2] Medium

### [P3] Low

### [P4] Backlog

---

## Completed Tasks

- [x] **P2-CN-A000** Phase 1: Attach strip: two icon sends (recent + new chat)
  - **Difficulty**: NORMAL
  - **Type**: Feature
  - **Context**: Owns the strip's control rows in `NinaAboutScreen.tsx` (input row + adjacent icon row), `attachNinaPhotoToChat`'s input/result and new-session branch, the two glyphs, the tests for both send paths. Exit: two adjacent icon-only controls (recent-session send unchanged in behavior; new-chat send always lands the photo in a conversation with no prior content); the runner lands in the conversation that received the photo; both paths tested; suite green.
  - **Status**: done
  - **Plan Set**: `PHOTO_SEND_CHAT_ICONS_PLAN.md` (phase 1 of 2)
  - **Satisfies**: R1 — Ganti tombol "Kirim ke chat" menjadi icon tanpa text (behavior unchanged: sends to the most recent session); R2 — Di row yang sama dengan 1a (bersebelahan), tambahkan icon baru yang mengirim gambar ini ke new chat session — always a new chat session
  - **Depends on**: —
  - **Plan**: `.workflows/plan/P2-CN-A000.md`
  - **Completed**: 2026-09-09 12:23
  - **Method**: /do
  - **Files**: lib/nina/albumActions.ts, components/nina/NinaAboutScreen.tsx, tests/nina.attachTargets.test.ts
  - **Decided**: Plan-internal contradiction in phase 1's test block: the first 'new'-target test expected result.sessionId to carry the CREATE's session id while its mocked send landed in a different id — contradicting the plan's own Interface Contract ('sessionId' is sendNinaMessage's own answer, null iff !ok), the reconciled action code (ships result.sessionId), and the same suite's fourth test (next follows the landed id, not the create's copy). → The TEST's expectation was corrected to the landed id (LANDED_SESSION_ID), with a comment. Rung 1 (stated invariant/Interface Contract) + rung 3 (reconciled code block); the alternative repair (re-pointing the shared SENT fixture at the created id) breaks the 'recent'-target tests, so it was not a candidate.

- [x] **P1-CN-A001** Phase 2: Keyboard channel: about strip box fix + rename re-assert
  - **Difficulty**: HARD
  - **Type**: Feature
  - **Context**: Owns extracting the `visualViewport` publisher out of `ChatScreen`; mounting it on `/nina/about`; the strip's `bottom: var(--nina-kb-overlap, 0px)`; the sidebar reassert's layout-change-driven trigger; the pure helpers + tests. Exit: on `/nina/about` the question field stays visible with the keyboard up (strip ends at the keyboard's top edge, no Safari lift); in the sidebar the rename field is re-asserted when the panel's box actually changes, not only on the fixed delay schedule; publisher still single-implementation; rules tested; suite green.
  - **Status**: done
  - **Plan Set**: `PHOTO_SEND_CHAT_ICONS_PLAN.md` (phase 2 of 2)
  - **Satisfies**: R3 — Bug: mengedit nama session — keyboard mendorong text field ke atas sehingga tidak terlihat di layar; the photo-question field shares the exposure and is fixed under the same mechanism
  - **Depends on**: `P2-CN-A000`
  - **Plan**: `.workflows/plan/P1-CN-A001.md`
  - **Completed**: 2026-09-09 12:54
  - **Method**: /do
  - **Files**: components/nina/KeyboardOverlapPublisher.tsx, components/nina/ChatScreen.tsx, components/nina/NinaAboutScreen.tsx, components/nina/NinaSidebar.tsx, lib/nina/chatview.ts, lib/nina/chatview.test.ts
  - **Drift**: Exit criterion 2's grep gate now also matches the phase's own adopted plan copy (components/nina/.workflows/plan/P1-CN-A001.md quotes the grep pattern in its text). The gate's intent holds: among real components the matches are exactly KeyboardOverlapPublisher.tsx, PhotoViewer.tsx, MessageBubble.tsx, and ChatScreen.tsx is gone.
    The phase-2 plan docstring prose contained scrambled/duplicated text spans (no control chars — planner-written). Code blocks were applied verbatim; garbled docstring spans were transcribed as meaning-preserving clean English. No semantic change.
  - **Decided**: Plan-internal contradiction in phase 1's test block: the first 'new'-target test expected result.sessionId to carry the CREATE's session id while its mocked send landed in a different id — contradicting the plan's own Interface Contract ('sessionId' is sendNinaMessage's own answer, null iff !ok), the reconciled action code (ships result.sessionId), and the same suite's fourth test (next follows the landed id, not the create's copy). → The TEST's expectation was corrected to the landed id (LANDED_SESSION_ID), with a comment. Rung 1 (stated invariant/Interface Contract) + rung 3 (reconciled code block); the alternative repair (re-pointing the shared SENT fixture at the created id) breaks the 'recent'-target tests, so it was not a candidate.
