# Todos: scripts

**Package Path**: `scripts`
**Package Code**: SC
**Last Updated**: 2026-09-14
**Total Active Tasks**: 1

## Quick Stats
- P0 Critical: 0
- P1 High: 1
- P2 Medium: 0
- P3 Low: 0
- P4 Backlog: 0
- Blocked: 0
- Completed: 2
- Archived: 2

---

## Active Tasks

### [P0] Critical

### [P1] High

- [ ] **P1-SC-A002** Phase 5: Push from the off-platform backstop worker
  - **Difficulty**: HARD
  - **Type**: Feature
  - **Context**: Owns `scripts/nina-image-worker/finish.ts` (both `finishSelfie` and `closeFailed`), the new sibling module `scripts/nina-image-worker/push.ts`, `.github/workflows/nina-image.yml`'s three `VAPID_*` lines, and the worker's test (`tests/nina.imageworker.test.ts`, modified) — sends `'worker_photo_delivered'` after the photograph's row/insert/ledger close, and `'worker_photo_apology'` after `closeFailed`'s terminal update, both through a worker-local sender that imports every judgement from `lib/push/payload.ts` and restates only the plumbing. Exit: a photograph the worker finishes pushes its caption and one it gives up on pushes her apology, both only after their rows and the ledger close are committed; a retry, an avatar job, an unresolvable session and a failed apology insert each push nothing and still close the job; the run exits 0 and finishes the photograph when the VAPID secrets are absent; typecheck/lint/format/test all pass.
  - **Status**: active
  - **Plan Set**: `NINA_PUSH_EVERY_MESSAGE_PLAN.md` (phase 5 of 5)
  - **Satisfies**: R1 — When Nina answers something the runner said, a push notification is sent
  - **Depends on**: `P1-PSH-A000`
  - **Plan**: `.workflows/plan/P1-SC-A002.md`

### [P2] Medium

### [P3] Low

### [P4] Backlog

### 🚫 Blocked

---

## Completed Tasks

(both completed tasks were archived on 2026-09-12 — see Archive; full per-task
detail — Context, Drift, Decided, Files — survives in git history and in
`.workflows/package_readme.md`)

---

## Archive

### 2026-09

- P1-SC-A000: Phase 4: Import the ledger's shortcuts — `NINA_EMOJI_SHORTCUTS_PLAN.md` (phase 4 of 4) [.workflows/plan/P1-SC-A000.md]
- P1-SC-A001: Phase 4: Backfill sweep: hash-fill + peleburan duplikat existing — `MEDIA_DEDUPE_PLAN.md` (phase 4 of 4) [.workflows/plan/P1-SC-A001.md] — was held at the plan's production-drift stop rule (the phase never ran `--apply`; the snapshot acceptance was falsified); closed 2026-09-11 — apply runs measured against production (48/52 rows hashed, 17 repointed), recorded in `scripts/.workflows/package_readme.md`
