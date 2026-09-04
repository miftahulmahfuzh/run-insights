# Todos: run-insights

**Package Path**: `.`
**Package Code**: RI
**Last Updated**: 2026-09-04 16:38
**Total Active Tasks**: 0

## Quick Stats
- P0 Critical: 0
- P1 High: 0
- P2 Medium: 0
- P3 Low: 0
- P4 Backlog: 0
- Blocked: 0
- Completed: 1

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

### [P1] P1-RI-A000
- [x] **P1-RI-A000** Phase 2: The pure file-tree library: image filter, path grammar, tree build, upload diff
  - **Difficulty**: NORMAL
  - **Type**: Feature
  - **Context**: Owns `lib/admin/filetree.ts` (pure, zero-import: the repo's one folder-path grammar — image test, path normalisation/validation, `buildTree`, `planFolderUpload`, the `v1|…` dedupe key, breadcrumb/ancestor/subtree helpers) and `tests/admin.filetree.test.ts`. Exit: `grep -n "^import" lib/admin/filetree.ts` prints nothing; `npm test` green with the new suite; `npm run lint` clean; no consumers yet.
  - **Status**: completed
  - **Plan Set**: `ADMIN_ALBUM_FILE_MANAGER_PLAN.md` (phase 2 of 7)
  - **Satisfies**: R1 — `/admin/nina` becomes a file manager: nested folders, folder upload by picker and by drag-and-drop from Windows Explorer, uploading only what is new, image files only, and an explorer view where clicking a photo lets you set it as her profile picture
  - **Depends on**: —
  - **Plan**: `.workflows/plan/P1-RI-A000.md`
  - **Card**: `miftahulmahfuzh/run-insights#67`
  - **Completed**: 2026-09-04 16:38
  - **Method**: /implement
  - **Files**: lib/admin/filetree.ts, tests/admin.filetree.test.ts
  - **Verification**: `npx vitest run tests/admin.filetree.test.ts` 72/72; `npm test` 120 files / 2140 tests green; `npm run typecheck` clean; `npx eslint` clean on both files; `npx prettier --check` clean on both files; all six `ci:*` guards PASS; `grep -c "^import" lib/admin/filetree.ts` → `0` (the phase's central invariant); all 47 Interface Contract symbols exported.
  - **Drift**: The plan's two verbatim code blocks disagreed on one assertion. `tests/admin.filetree.test.ts` expected `planFolderUpload(...).folders` to equal `['Faces/2027']` when a previously-uploaded `Faces/` tree grew by `Faces/2027/d.jpg`, `Faces/2027/e.jpg` and `Faces/f.jpg`. The module returns `['Faces', 'Faces/2027']`. **The module is right and the assertion is not satisfiable**: `ManifestEntryLike` is declared as `{ sourceKey: string | null }` and carries no folder, so `planFolderUpload` is never told which folders already exist; and the module deliberately reports the full ancestor chain of every uploaded row (phase-2 handoff 5 — declaring `a/b` alongside `a/b/c` is what stops `a/b` vanishing when `c` is deleted). Declaring an already-existing folder is idempotent under invariant 11, so a superset is correct. Fixed the test expectation to `['Faces', 'Faces/2027']`, renamed the case to *"uploads exactly the new files when the folder grew, and declares the whole chain"*, and added a comment recording why. The module was NOT changed. **Open for the plan-set owner**: the plan source at `.workflows/plan/admin-album-file-manager/phase-2.md` still carries the old assertion and should be corrected there.
  - **Drift**: Ran `npx prettier --write` on the two new files only, not `npm run format`, because two peer swarm sessions have uncommitted work in this same worktree and a repo-wide reformat would rewrite their in-flight files.

---

## Archive
