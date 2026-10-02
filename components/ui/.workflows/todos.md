# Todos: components/ui

**Package Path**: `components/ui`
**Package Code**: CU
**Last Updated**: 2026-10-02
**Total Active Tasks**: 0

## Quick Stats
- P0 Critical: 0
- P1 High: 0
- P2 Medium: 0
- P3 Low: 0
- P4 Backlog: 0
- Blocked: 0
- Completed: 3
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

- [x] **P2-CU-A002** Phase 2: One pager cell: 30.8 px, circular
  - **Difficulty**: EASY
  - **Type**: Update
  - **Context**: Owns `components/ui/Pagination.tsx` (the file-header `TOUCH_ICON` paragraph and the `CELL` docstring + class string), `components/ui/Pagination.test.tsx` (header docstring and the pinned size test), `components/ui/.workflows/package_readme.md` (the sizing decision record and the now-false 44 px tap-floor bullet), and `docs/architecture.md` §8 (the "Three things" count and a new fourth bullet). Not one of the five `<Pagination>` call sites is edited. Exit: every pagination in the app draws a 30.8 px circular cell (`min-h-[1.925rem] min-w-[1.925rem] rounded-pill px-1 text-[12px]`), exactly one implementation file changed, no change to which element is rendered for which state, `Pagination.test.tsx` pins all three argued tokens, and the deliberate below-the-44 px-floor decision is recorded in all three documents. `npm test`, `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run knip` green.
  - **Status**: completed
  - **Plan Set**: `MEDIA_PARITY_COMPACT_PAGER_PLAN.md` (phase 2 of 2)
  - **Satisfies**: R2 — Pagination cells: smaller, circular, 30% smaller than today's — applied to every pagination in the system
  - **Plan**: `.workflows/plan/P2-CU-A002.md`
  - **Completed**: 2026-10-02 14:49
  - **Method**: /do (plan set phase 2 of 2)
  - **Files**: components/ui/Pagination.tsx, components/ui/Pagination.test.tsx, components/ui/.workflows/package_readme.md, docs/architecture.md
  - **Drift**: None. Every line range and quoted 'before' hunk in the phase plan matched the worktree byte-for-byte: Pagination.tsx header :14-17, CELL docstring :51-55 and CELL string :56-58; Pagination.test.tsx docstring :8-14 and size test :90-98; components/ui/.workflows/package_readme.md :373-376 and :381-384; docs/architecture.md :325 and the bullet ending :335. The reconciler's two corrected line pointers were correct as corrected.
  - **Drift**: The worktree shipped with NO node_modules (.env.local was present). Every test/typecheck command died with MODULE_NOT_FOUND out of vitest.config.ts until `npm ci` was run. Not a code drift -- a fresh-worktree provisioning gap. node_modules is gitignored, so nothing enters the commit.
  - **Decided**: Step 3 says create every phase's task; phase 1 is running concurrently in this same shared worktree and mints its own -> created phase 2's task (P2-CU-A002) ONLY. Tie-break rung: narrower blast radius, plus the coordinator's explicit shared-index WARN. Creating phase 1's row here risked a double-mint and a todos.md collision.
  - **Decided**: `npm ci` was claimed by this session and announced to phase 1 by mesh message before starting, because two concurrent npm installs in one directory corrupt each other. Rung 6: surrounding convention for a shared worktree.
  - **Decided**: CELL's new first line measures exactly 98 columns against .prettierrc.json's printWidth 100, as the plan predicted -- the hand-written string split survives format:check unchanged, verified.
  - **Verified**: `npx vitest run components/ui/Pagination.test.tsx` 17/17 passed; `npx vitest run components/nina/NinaAboutScreen.test.tsx` 45/45 passed (the one call-site suite that mounts the pager; passes UNCHANGED, as the contract requires); `npm test` 386 files / 6863 tests all passed; `npm run typecheck` clean; `npm run lint` clean; `npm run format:check` "All matched files use Prettier code style!"; `npm run knip` no finding under components/ui or Pagination -- the one 'Duplicate exports' entry (NINA_CHAT_PHOTO_PAGE_SIZE|NINA_ABOUT_MEDIA_PAGE_SIZE in lib/nina/album.ts) is phase 1's D-2 alias, not this phase's.

- [x] **P2-CU-A001** Phase 1: The shared numbered `Pagination` control
  - **Difficulty**: NORMAL
  - **Type**: Feature
  - **Context**: Owns `components/ui/Pagination.tsx` (new), `components/ui/Pagination.test.tsx` (new) and the one re-export line in `components/ui/index.ts` — no caller and no existing pager is touched, so the component ships unused until phases 2-5 land it. Exit: the discriminated `hrefForPage` / `onPage` contract compiles and is exercised — `null` at `pageCount <= 1`; every number rendered at `pageCount = 6` with no ellipsis; the active cell a non-interactive `aria-current="page"`; one `<Link>` per inactive page at the href the callback returns; `onPage` called with the clicked number; `busy` disabling every button. `components/ui/index.ts` re-exports it, it carries no `'use client'`, hook or effect, and `tests/share.bundle.test.ts` stays green.
  - **Status**: completed
  - **Plan Set**: `NUMBERED_PAGINATION_PLAN.md` (phase 1 of 5)
  - **Satisfies**: R2 — The control itself: render **every** page number as its own button (`1 2 3 4 5 6`), highlight the active page, and let a tap jump straight to that page
  - **Plan**: `.workflows/plan/P2-CU-A001.md`
  - **Completed**: 2026-10-01 13:18
  - **Method**: /do (plan set phase 1 of 5)
  - **Files**: components/ui/Pagination.tsx, components/ui/Pagination.test.tsx, components/ui/index.ts
  - **Drift**: None. `components/ui/index.ts` lines 38-46 matched the plan's quoted export list byte-for-byte; the one line was inserted between `'./Flag'` and `'./SplitsTable'` exactly as Step 3 specifies.
  - **Decided**: Exit criterion 2 demands `grep -c "components/admin" components/ui/Pagination.tsx` == 0, but the file measures 1 — the hit is prose inside the comment block Step 1 mandates verbatim ("Nothing in it is optional"), which literally names `components/admin/touch.ts` to explain why it is NOT imported. Kept the code block verbatim; treated the criterion's stated purpose ("no inverted dependency") as the thing measured. (Rung 1: invariant 4 forbids IMPORTING `components/admin/touch.ts`, not mentioning it. Verified the import list is exactly `react` type-only, `next/link`, `@/lib/cn`.)
  - **Verified**: `npx vitest run components/ui/Pagination.test.tsx` 17 passed; `npx vitest run tests/share.bundle.test.ts` 19 passed (barrel still client-safe); `npm test` 380 files / 6790 tests all passed; `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run build` all clean; all seven CI guards PASS.

- [x] **P1-CU-A000** Phase 3: The icon-only copy button, and the handle it reads
  - **Difficulty**: NORMAL
  - **Type**: Feature
  - **Context**: Owns a new `components/ui/CopyAdminLinkButton.tsx` and its component test, the `rowPointer?: PhotoPointer` addition to `ViewerPhoto` in `components/ui/PhotoViewer.tsx`, and the `PhotoViewer.test.tsx` half proving an absent handle still renders nothing; it also exports the four copy constants phase 4's suites import. Four files, no caller touched. Exit: the button takes a required non-null origin (R4's gate lives at phase 4's call sites), renders icon-only with an `aria-label`/`title`, and a tap writes phase 1's absolute link straight to `navigator.clipboard` — `navigator.share` is never called, and a test proves it is not called even where the platform has it — showing the `ShareButton` tick, announcing through a `role="status"` live region, and falling back to a selectable read-only field when the clipboard refuses; `ViewerPhoto.id` still means the turn id; the three review surfaces are unchanged; gates green.
  - **Status**: completed
  - **Plan Set**: `COPY_ADMIN_MEDIA_LINK_PLAN.md` (phase 3 of 4)
  - **Satisfies**: R1 — An icon-only copy-admin-link button in the full-view image overlay; tapping it puts an absolute admin link to that photograph on the clipboard, pasteable into WhatsApp
  - **Depends on**: `P1-ADM-A004`
  - **Plan**: `.workflows/plan/P1-CU-A000.md`
  - **Completed**: 2026-10-01 11:45
  - **Method**: /do (plan set phase 3 of 4)
  - **Files**: components/ui/PhotoViewer.tsx, components/ui/PhotoViewer.test.tsx, components/ui/CopyAdminLinkButton.tsx, components/ui/CopyAdminLinkButton.test.tsx
  - **Verified**: `npx vitest run components/ui/CopyAdminLinkButton.test.tsx components/ui/PhotoViewer.test.tsx tests/ui.photoViewer.test.ts` 3 files / 56 tests passed; `npm run typecheck`, `npm run build`, `npm run lint`, `npm run format:check` all clean; `npm run ci:f08-guard` and `npm run ci:client-secret-guard` passed; `npm run knip` identical to the plan's recorded baseline (3 unused files / 27 unused exports / 10 unused exported types), `CopyAdminLinkButton` not flagged. Full `npm test` 375/376 files pass — the one red file, `tests/nina.mediaLocate.test.ts`, is phase 2's untracked in-flight work in the shared worktree, not this phase's.

---

## Archive
