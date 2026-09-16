# Todos: components/nina

**Package Path**: `components/nina`
**Package Code**: CN
**Last Updated**: 2026-09-16
**Total Active Tasks**: 0

## Quick Stats
- P0 Critical: 0
- P1 High: 0
- P2 Medium: 0
- P3 Low: 0
- P4 Backlog: 0
- Blocked: 0
- Completed: 7
- Archived: 6

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

(the prior six completed tasks were archived on 2026-09-11 — see Archive; full
per-task detail — Context, Drift, Decided, Files — survives in git history and in
`.workflows/package_readme.md`)

- [x] **P1-CN-A006** Phase 1: Paste an image into the composer
  - **Difficulty**: NORMAL
  - **Type**: Feature
  - **Context**: Owns `useComposerPhotos.ts` (extract `handleFiles`, add `onPaste`), `Composer.tsx` (wire `onPaste` onto the `<textarea>`), `Composer.test.tsx` (paste-path tests). Exit: pasting an image (synthetic `ClipboardEvent` with `clipboardData.files`) runs through compress/hash/dedupe/upload/describe exactly as a file-picker pick and sends the identical `ComposerDraftImage`; text-only paste unaffected; `npx tsc --noEmit` and Vitest pass.
  - **Status**: completed
  - **Plan Set**: `COMPOSER_CLIPBOARD_IMAGE_PASTE_PLAN.md` (phase 1 of 1, set complete)
  - **Satisfies**: R1 — Paste a clipboard image directly into the chat's message text input and have it attach as a photo, the way WhatsApp lets you paste a copied image bubble into its own text field
  - **Depends on**: none
  - **Plan**: `.workflows/plan/P1-CN-A006.md`
  - **Completed**: 2026-09-16 08:01
  - **Method**: /implement (plan set phase 1 of 1)
  - **Files**: components/nina/useComposerPhotos.ts, components/nina/Composer.tsx, components/nina/Composer.test.tsx
  - **Verified**: `npx tsc --noEmit` clean; `npx vitest run components/nina/Composer.test.tsx` 25/25 passed; full `npm test` 6103/6103 passed; `npx eslint components/nina` clean; `npx prettier --check` clean on all three modified files.

---

## Archive

### 2026-09

- P2-CN-A000: Phase 1: Attach strip: two icon sends (recent + new chat)
- P1-CN-A001: Phase 2: Keyboard channel: about strip box fix + rename re-assert
- P1-CN-A002: Phase 2: The rail's `up` reveals the main bar — Outstanding: the decisive on-device manual checklist (Verification steps 1-8, iPhone XS Max) remains open; phase 1's R1 on-device checklist (steps 1-7) is open too, and step 4 here rides on it
- P2-CN-A003: Phase 1: Flash the landing in the bubble's own color — and prove the jobs jump end-to-end
- P1-CN-A004: Phase 2: Write-time dedup: jalur upload chat runner
- P1-CN-A005: Phase 1: The panel pins the window over its focused field (formerly `P1-CN-A001`) — Outstanding: the decisive on-device R1 confirmation (plan invariant 8: fresh-bundle check + steps 1-7 on the iPhone XS Max) remains open
