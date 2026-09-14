# Todos: push

**Package Path**: `lib/push`
**Package Code**: PSH
**Last Updated**: 2026-09-14
**Total Active Tasks**: 0

## Quick Stats
- P0 Critical: 0
- P1 High: 0
- P2 Medium: 0
- P3 Low: 0
- P4 Backlog: 0
- Blocked: 0
- Completed: 1
- Archived: 0

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

- [x] **P1-PSH-A000** Phase 1: The notify seam every message writer can call
  - **Difficulty**: NORMAL
  - **Type**: Feature
  - **Context**: Owns `lib/push/send.ts` and `lib/push/payload.ts` (plus `lib/push/payload.test.ts` and the new `lib/push/send.test.ts`) — adds the `NINA_PUSH_KINDS`/`NinaPushKind` vocabulary and a caller-facing, never-throwing `notifyNinaPush` that any server module can call with any of the twelve kinds. Exit: `lib/push` exposes one documented notify function any server module can call with any of the twelve `NinaPushKind`s; `pushNotifier` still satisfies `ProactiveNotifier` unchanged and still propagates on a database fault; `tsc --noEmit`, lint and the full suite pass; no new dependency, no DDL.
  - **Status**: completed
  - **Plan Set**: `NINA_PUSH_EVERY_MESSAGE_PLAN.md` (phase 1 of 5)
  - **Satisfies**: R1, R2 — When Nina answers something the runner said, a push notification is sent; When Nina speaks on her own initiative, a push notification is sent
  - **Plan**: `.workflows/plan/P1-PSH-A000.md`
  - **Completed**: 2026-09-14 11:17
  - **Method**: /implement (plan set phase 1 of 5)
  - **Files**: lib/push/payload.ts, lib/push/send.ts, lib/push/payload.test.ts, lib/push/send.test.ts
  - **Drift**: none
  - **Decided**: none — the plan's code blocks were applied verbatim, no ambiguity encountered

---

## Archive

(none yet)
