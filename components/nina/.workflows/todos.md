# Todos: components/nina

**Package Path**: `components/nina`
**Package Code**: CN
**Last Updated**: 2026-10-01
**Total Active Tasks**: 0

## Quick Stats
- P0 Critical: 0
- P1 High: 0
- P2 Medium: 0
- P3 Low: 0
- P4 Backlog: 0
- Blocked: 0
- Completed: 8
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
- [x] **P1-CN-A007** Phase 1: Page the chat overlay across the session's photos, and follow them in the history
  - **Difficulty**: HARD
  - **Type**: Feature
  - **Context**: Owns the session-wide photo list + position lookup in `lib/nina/chatphotos.ts` (+ tests), `usePhotoViewer.ts`'s derivation and flat-index → `{messageId, index}` mapping, `ChatScreen.tsx`'s `<PhotoViewer>` call site and R2's wiring, the dot-row bound in `components/ui/PhotoViewer.tsx` (+ test), the exposed bubble measurement in `useQuoteLanding.ts`, a new follow-scroll hook + happy-dom test, and the re-pointed structural claims in `tests/nina.chatPhoto.test.ts`. Exit: tapping any photo opens the overlay on the whole session's photos with a session-wide `7 / 23` counter; swipe/arrow/dot crosses bubble boundaries and wraps via the existing `stepIndex`; header name, job-detail `headerAction`, download and attach all act on the photo currently on screen; moving to another message's photo instantly scrolls the conversation behind the overlay to that message; deleting or clamping underneath an open overlay stays safe (invariant 3); above `PHOTO_VIEWER_MAX_DOTS` the dot row is not drawn and at or below it is byte-identical; `npm run typecheck && npm run lint && npm run format:check && npm test` all pass.
  - **Status**: completed
  - **Plan Set**: `CHAT_SESSION_WIDE_PHOTO_SWIPE_PLAN.md` (phase 1 of 1, set complete)
  - **Satisfies**: R1 — In a chat session, the full-view photo overlay pages (swipe right / left) across **every photo in that chat session**, not just the photos of the one bubble the photo was tapped in; R2 — The chat history **auto-scrolls to follow the photo currently being viewed**, so exiting full-view after N swipes leaves the reader looking at the bubble that sent the photo they were last on
  - **Plan**: `.workflows/plan/P1-CN-A007.md`
  - **Completed**: 2026-10-01 10:01
  - **Method**: /do
  - **Files**: lib/nina/chatphotos.ts, lib/nina/chatphotos.test.ts, components/nina/usePhotoViewer.ts, components/nina/useChatPhotoFollow.ts, components/nina/useChatPhotoFollow.test.tsx, components/nina/useQuoteLanding.ts, components/nina/ChatScreen.tsx, components/nina/ChatImages.tsx, components/nina/MessageList.tsx, components/ui/PhotoViewer.tsx, components/ui/PhotoViewer.test.tsx, tests/nina.chatPhoto.test.ts
  - **Drift**: `tests/nina.chatPhoto.test.ts` already declared `PUBLIC_PAGE` at :30; plan step 12a quoted it as context, so only the new `FOLLOW` const was added.
    `components/ui/PhotoViewer.tsx` has TWO `{photos.length > 1 && (` sites — the header counter and the dot row. Only the dot row (the one followed by the `flex justify-center gap-2 …` div) was bounded, as the plan's :320 anchor intends.
  - **Decided**: plan Step 12b's `expect(hook).not.toContain('viewerMessage')` vs Step 3's returned `viewerMessageId` (a superstring, so the assertion could never pass) → the code block wins; the assertion was re-pointed at the two constructs that actually went away, `messages.find(` and `chatViewerPhotos`, preserving its stated intent that the bubble-local derivation is gone (rung 3: the phase plan's code blocks are complete by construction and reconciled; the assertion around them is commentary).
  - **Verified**: `npm test` 374 files / 6698 tests passed; `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run build` all clean; all seven CI guards PASS.

---

## Archive

### 2026-09

- P2-CN-A000: Phase 1: Attach strip: two icon sends (recent + new chat)
- P1-CN-A001: Phase 2: Keyboard channel: about strip box fix + rename re-assert
- P1-CN-A002: Phase 2: The rail's `up` reveals the main bar — Outstanding: the decisive on-device manual checklist (Verification steps 1-8, iPhone XS Max) remains open; phase 1's R1 on-device checklist (steps 1-7) is open too, and step 4 here rides on it
- P2-CN-A003: Phase 1: Flash the landing in the bubble's own color — and prove the jobs jump end-to-end
- P1-CN-A004: Phase 2: Write-time dedup: jalur upload chat runner
- P1-CN-A005: Phase 1: The panel pins the window over its focused field (formerly `P1-CN-A001`) — Outstanding: the decisive on-device R1 confirmation (plan invariant 8: fresh-bundle check + steps 1-7 on the iPhone XS Max) remains open
