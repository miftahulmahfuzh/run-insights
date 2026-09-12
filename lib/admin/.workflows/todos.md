# Todos: admin

**Package Path**: `lib/admin`
**Package Code**: ADM
**Last Updated**: 2026-09-12
**Total Active Tasks**: 0

## Quick Stats
- P0 Critical: 0
- P1 High: 0
- P2 Medium: 0
- P3 Low: 0
- P4 Backlog: 0
- Blocked: 0
- Completed: 5
- Archived: 4

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

(all four completed tasks were archived on 2026-09-12 — see Archive; full
per-task detail — Context, Drift, Decided, Files — survives in git history and
in `.workflows/package_readme.md`)

- [x] **P1-ADM-A002** Phase 5: Admin Error Logs page
  - **Difficulty**: HARD
  - **Type**: Feature
  - **Context**: Owns `app/admin/error-logs/page.tsx` (Server Component, `?tab=text|multimodal|image_generation`, `?page=`), `lib/admin/errorLogModel.ts` (the pure row/URL model, zero value imports), a compact flex-row list component, a read-only popup dialog for full input/full error text, `PhotoViewer` integration for image links, the new `AdminNavLinks` entry (6→7 cells) and the six pinned counts in `tests/admin.shell.test.ts` that move with it. Calls Phase 1's reader as `listNinaErrorLogs(category, { limit, offset })` — no `userId` argument — with `ADMIN_ERROR_LOG_PAGE_SIZE = 25`, mirroring Phase 1's ceiling. Does not touch any of the writer code from phases 2–4 (reads `nina_error_logs` directly via Phase 1's reader) — can be built and reviewed independently of whether 2/3/4 have landed, since Phase 1 alone is enough to exercise it end-to-end (seed rows via `logNinaError` in a dev one-liner if needed). Sole owner of `components/admin/AdminNavLinks.tsx` and `tests/admin.shell.test.ts` in this set. Exit: `/admin/error-logs` renders all three tabs with real (or seeded) data; a narrow-viewport (375px) visual/manual check confirms one entry = one row; full-input/full-error icon buttons open the popup with complete text and the error popup's first line is `Timeout: <n>s` when the row has one; image links open `PhotoViewer` full-screen and rows without an image draw no image control at all; pagination works past one page (`?page=2` reads "26–50 of N"); the bottom bar is one row of seven cells at 375/414/896px.
  - **Status**: completed
  - **Plan Set**: `NINA_LLM_FALLBACK_ERROR_LOGS_PLAN.md` (phase 5 of 5)
  - **Satisfies**: R2 — New admin "Error logs" tab, 3 sub-tabs, with the specified columns/behaviors
  - **Depends on**: `P1-DB-A007`
  - **Plan**: `.workflows/plan/P1-ADM-A002.md`
  - **Completed**: 2026-09-12 09:15
  - **Method**: /do
  - **Files**: app/admin/error-logs/page.tsx, lib/admin/errorLogModel.ts, lib/admin/errorLogModel.test.ts, components/admin/ErrorLogList.tsx, components/admin/ErrorLogList.test.tsx, components/admin/LogTextDialog.tsx, components/admin/LogTextDialog.test.tsx, components/admin/AdminNavLinks.tsx, components/admin/AdminNavLinks.test.tsx, tests/admin.shell.test.ts
  - **Drift**: `components/admin/AdminNavLinks.test.tsx` is NOT in the phase plan's Files table but pins the bar geometry by render (HREFS array, label pairs, grid-cols-6, toHaveLength(6) cells, two test titles) — the plan only knew about `tests/admin.shell.test.ts`. The same deliberate 6→7 move was applied there: `/admin/error-logs` appended to HREFS, `['/admin/error-logs','Errors','Error logs']` appended to pairs, grid-cols-7, seven cells, titles say seven.
  - **Drift**: The plan's "the popups" tests in `components/admin/ErrorLogList.test.tsx` used `screen.getByText` with multi-line strings (`'Timeout: 22s\n\nConnection error.'`), which @testing-library/dom can never match because it normalizes whitespace. Rewritten to assert the dialog `<pre>`'s raw `textContent` with exact equality (newlines included) — stronger, not weaker. 3 tests affected.
  - **Drift**: prettier reflowed `components/admin/ErrorLogList.test.tsx` and `app/admin/error-logs/page.tsx` (line wrapping only).
  - **Decided**: `AdminNavLinks.test.tsx` also pins the six-cell bar (plan missed the file) → extended the 6→7 move there rather than letting the suite go red. Rung 1+2: invariant "tree passes vitest every phase" + exit criterion "one row of seven cells".
  - **Decided**: The plan's multi-line `getByText` popup assertions can never match under testing-library normalization → exact `textContent` equality instead. Rung 3 code blocks + tie-break "a failing verification is never settled by relaxing the check".
  - **Decided**: First full-sweep run had 2 reds in MemoryTable add-row tests (known parallel-load flake per plan and package memory); two consecutive full sweeps then passed 5169/5169 — settled green, no flag, no assertion touched.
  - **Decided**: `ci:client-secret-guard` exits 1 on `lib/nina/vision.test.ts:33` (raw `process.env.OPENROUTER_API_KEY` read) — that is Phase 3's UNCOMMITTED in-flight file, sole-owned by Phase 3, absent from HEAD; NOT this phase's file. Left untouched; reported to the swarm coordinator.
  - **Decided**: The plan's manual 375px visual check and its "seed rows via `logNinaError`" one-liner were NOT performed: the seed writes `.env.local`'s `DATABASE_URL` which is the production instance, and the visual check needs a browser. The one-row property is held by the class-shape tests (`min-w-0 truncate` / `shrink-0`) + the plan's width arithmetic; flagged to the operator as the remaining manual step.
  - **Verified**: `npm run typecheck` clean; full vitest sweep 5169/5169 passing twice consecutively; targeted suites for this phase's files 65/65; `npm run lint` clean for this phase's files; `ci:openrouter-guard` and `ci:f08-guard` pass.
  - **Note**: The set's remaining manual steps for this phase: a signed-in-admin visual check of `/admin/error-logs` at 375px (one entry = one row, popups, PhotoViewer) and optional seeded rows. Seeding writes `.env.local`'s DATABASE_URL = the production instance — use a throwaway row and delete it, or skip.

---

## Archive

### 2026-09

- P1-ADM-A000: Phase 3: The admin add path captions from the photograph — `NINA_PHOTO_CAPTION_FROM_IMAGE_PLAN.md` (phase 3 of 4) [.workflows/plan/P1-ADM-A000.md]
- P1-ADM-A001: Phase 3: `/admin/shortcuts` — `NINA_EMOJI_SHORTCUTS_PLAN.md` (phase 3 of 4) [.workflows/plan/P1-ADM-A001.md] — Outstanding: the plan's ten manual browser checks (414 px render, add/edit/toggle/delete each writing production, duplicate-trigger refusal) were never run — the `nina_shortcuts` table did not exist at phase time
- P1-ADM-B130: Phase 2: "What she can see in it", editable — `NINA_PHOTO_REFS_AND_BUBBLE_ACTIONS_PLAN.md` (phase 2 of 4) [.workflows/plan/P1-ADM-B130.md]
- P1-ADM-C410: Phase 4: The route, the sixth nav cell, and the form — `NINA_IMAGE_GENERATION_TAB_PLAN.md` (phase 4 of 7) [.workflows/plan/P1-ADM-C410.md]
