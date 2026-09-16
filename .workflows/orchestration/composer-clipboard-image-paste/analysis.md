# Code Analysis: Clipboard image paste into the Nina Composer

**Type:** Feature Implementation
**Date:** 2026-09-16 07:45:27
**Session ID:** 20260916-074527-J14P
**Plan:** `COMPOSER_CLIPBOARD_IMAGE_PASTE_PLAN.md` (1 phase)
**Worktree:** `/home/miftah/.worktrees/run-insights/composer-clipboard-image-paste` (branch `feature/composer-clipboard-image-paste`, base `origin/main` @ `924bb32`)

---

## User Input

### Original User Request
in whatsapp, i can hold down on a bubble containing image, select copy, then i can paste it directly into whatsapp text chat field input
can we implement this image paste mechanism into our chat as well? so i can copy image from whatsapp and in our chat text input, i can paste it

### User-Provided Context
None beyond the description above. No error messages; this is a net-new capability request, described by analogy to WhatsApp's own paste behavior (copy an image bubble elsewhere, paste it directly into a text input and it is attached as an image).

### User-Provided Files
None (`@`-referenced).

### Requirement IDs

| ID | What the user asked for |
|---|---|
| R1 | When an image is on the system clipboard (e.g. copied from a WhatsApp image bubble, or any other app/website), pasting into the Nina chat's message text input attaches it as an image to the message being composed — the same way the existing camera/picker button attaches a picked photo. |

One paragraph, one deliverable — not a numbered list, so it collapses to a single R.

---

## Detailed Requirements Understanding

**Problem/Requirement Statement**: The Nina chat composer (`components/nina/Composer.tsx`) already lets the runner attach up to 3 photos to a message via a file-picker button (camera icon → OS file picker → compress → hash → dedupe-check → upload to Blob → describe). There is no way to attach an image via clipboard paste. The ask is to add that second entry point: focus the message textarea, paste (Ctrl+V / Cmd+V, or a long-press "Paste" on mobile), and if the clipboard holds an image, it is picked up and run through the same pipeline that already turns a file-picker selection into a ready, sendable tile.

**Success Criteria**:
- Focusing the composer's textarea and pasting a clipboard image adds a tile to the composer (same UI as a file-pick), which compresses, hashes, dedupe-checks, uploads, and gets described exactly like a picked file — and is sent in the same `ComposerDraftImage` shape.
- All existing picker rules keep applying to a pasted image without new code paths: the 3-image cap (`NINA_MAX_CHAT_IMAGES`), the size ceiling (`NINA_CHAT_MAX_SOURCE_BYTES`), the "not an image" rejection, and their notice copy (`REJECTION_TEXT`).
- Pasting plain text (no image on the clipboard) is completely unaffected — it still inserts as text the normal browser way.
- No new server-side code, DB column, or API route is needed — a pasted image is indistinguishable, once it becomes a `File`, from a picked one.

**Key Considerations / Constraints**:
- **No existing paste handling anywhere in the repo** (`grep -rn "onPaste|clipboardData|ClipboardEvent"` returns zero hits) — this is a new capability, not an extension of one.
- The picker's decision logic (`onPick` in `useComposerPhotos.ts:265-299`) is currently written specifically against a `React.ChangeEvent<HTMLInputElement>` (reads `event.target.files`, resets `event.target.value`). A paste event is a `React.ClipboardEvent<HTMLTextAreaElement>` with files under `event.clipboardData.files` — there is no `event.target.value` to reset. The two need a shared `File[]`-taking core so `planNinaPicked`, the tile-construction loop, and the `process()` kickoff are not duplicated.
- **When to `preventDefault()`**: only when the clipboard actually contains at least one image file. Otherwise a runner pasting normal text into the box must see completely normal browser paste behavior (undisturbed, and outside this hook's control).
- A clipboard paste event can, in principle, carry both an image file and a text/plain item at once (e.g. some screenshot tools). WhatsApp's own behavior in this situation is to take the image and ignore the accompanying text; this analysis assumes the same call (the image branch fires whenever any image file is present, and it prevents default even if a text item is also present — otherwise a garbled bytes-string could get inserted into the textarea alongside the tile).
- `compressForNina` (browser-image-compression) is not restricted to JPEG input — it re-encodes to JPEG regardless of source type, so a pasted PNG/WEBP/etc. flows through unchanged; no widening of `NINA_CHAT_ALLOWED_CONTENT_TYPES` (server-side, JPEG-only, post-compression) is needed.
- Clipboard `File` objects for a pasted image commonly carry a generic/OS-assigned name and MIME type (e.g. `image.png`, `image/png`) rather than the original filename — irrelevant to the pipeline, which cares only about `type` (for accept/reject) and byte content (for compression/hashing), never the filename.
- This is purely a **client-side, single-package** change: `components/nina/`. No new Server Action, no new DB column (`nina_message_images` already has no notion of "how the image got picked" — `kind: 'upload'` covers both a file-pick and a paste identically), no new Blob route.

---

## Analysis Scope

### Explicitly Mentioned Files
None (no `@` files — target and files were inferred from the request).

### Discovered Related Files
- `components/nina/Composer.tsx` — renders the textarea; owns `canSend`/`submit`; wires the file-input's `onChange` to `onPick`.
- `components/nina/useComposerPhotos.ts` — the photo half of the composer: tile state machine, `onPick`, `process()` (compress → hash → dedupe-check → upload → describe), `collectDraft()`, `reset()`.
- `components/nina/useComposerDraft.ts` — the text half: draft string, auto-grow, `clear()`. Not touched by this feature (paste is a photo-pipeline concern, not a text-state concern), but it owns the textarea's `ref`/`value`/`onChange`, so its shape constrains where a sibling `onPaste` prop can be added on the same `<textarea>` in `Composer.tsx`.
- `lib/nina/images.ts` — pure, no-import module: `NINA_MAX_CHAT_IMAGES`, `NINA_CHAT_MAX_SOURCE_BYTES`, `NINA_CHAT_ALLOWED_CONTENT_TYPES`, `ninaChatPathname()`, `planNinaPicked()` (the pure accept/reject decision, keyed on `{name, type, size}`).
- `lib/nina/dedupe.ts` — `planNinaPickUpload()`, read by `process()`; unaffected.
- `lib/photos/compressForNina.ts`, `lib/photos/contentHash.ts` — the compress/hash utilities `process()` calls; unaffected, and re-encode to JPEG regardless of input type.
- `lib/nina/actions` (barrel, `describeNinaImage`, `findNinaDuplicateChatImage`) — Server Actions `process()` calls; unaffected.
- `app/api/upload/route.ts` — Blob upload token mint; unaffected (still receives the same compressed JPEG bytes regardless of how the tile was created).
- `components/nina/Composer.test.tsx` — the co-located test file; the file-input pick path (`mockUploadPipeline()`, `imageFile()` helpers) is the pattern a paste test suite should reuse.
- `tests/support/setup.ts` — global Vitest setup (`happy-dom` per-file pragma required on `.test.tsx` files, `cleanup()` in `afterEach`).
- `vitest.config.ts:34` — confirms the repo's default test environment is `'node'`, so `.tsx` component tests need the `// @vitest-environment happy-dom` pragma (already present at `Composer.test.tsx:1`).

### Files NOT touched, and why
- `components/nina/ChatScreen.tsx`, `components/nina/useNinaSend.ts`, `lib/nina/actions/send.ts` — the send-side contract (`ComposerDraftImage`, `sendNinaMessage`) is unchanged; a pasted tile produces the exact same `ComposerDraftImage` union member (`'upload'` or `'deduped'`) a picked tile does.
- `lib/db/schema/nina/chat.ts` (`nina_message_images`) — no new column; `kind: 'upload'` already covers "the runner's own bytes, uploaded fresh," regardless of how those bytes were selected client-side.
- `app/api/upload/route.ts`, `app/api/admin/nina/upload/route.ts` — no route changes; the mint-time checks (owner-scoped pathname, `NINA_CHAT_MAX_UPLOAD_BYTES`, `image/jpeg`-only) apply identically to bytes that originated from a paste.

---

## Current Dataflow

### Entry Point (existing): the file-picker attach

**Location:** `components/nina/Composer.tsx:343-350` (hidden `<input type="file" accept="image/*" multiple>`), opened by the camera-icon button at `Composer.tsx:351-377` (`fileRef.current?.click()`).
**Trigger:** `onChange={onPick}` — `onPick` is `useComposerPhotos.ts:265`.
**Input Schema:** `event.target.files: FileList`.

### Processing Chain (existing, `useComposerPhotos.ts`)

1. **`onPick(event)`** — `useComposerPhotos.ts:265-299`
   - `Array.from(event.target.files ?? [])` → `picked: File[]`.
   - Resets `event.target.value = ''` so re-picking the same file still fires `onChange`.
   - Early-returns if `picked.length === 0`.
   - `planNinaPicked(picked.map(f => ({name, type, size})), { alreadyHeld: tiles.length })` — pure accept/reject decision (`lib/nina/images.ts:186-212`): rejects non-images (`not_an_image`), over-25MB files (`too_large`), and anything past the 3-image cap (`too_many`).
   - For each accepted candidate, re-finds the matching `File` by `{name, size}`, builds a `Tile` (`state: 'compressing'`, a `previewUrl` via `URL.createObjectURL`), and collects `{tile, file}` pairs.
   - `setTiles` appends the new tiles; `setNotice` shows the first rejection's copy (`REJECTION_TEXT`) or clears it; then kicks off `process(tile, file)` for every fresh pair (not awaited — fire-and-forget per tile).

2. **`process(tile, file)`** — `useComposerPhotos.ts:165-259` (unchanged by this feature; a pasted `File` enters here identically to a picked one):
   - `compressForNina(file)` → compressed JPEG `File` + dimensions/bytes.
   - `contentHashOf(compressed.file)` (encode hash) and `contentHashOf(file)` (source hash), each independently null-safe.
   - `findNinaDuplicateChatImage({contentHash, sourceHash})` — owner-scoped dedupe pre-check (Server Action).
   - `planNinaPickUpload({contentHash, duplicate})` (`lib/nina/dedupe.ts`) decides `attach-existing` vs. upload.
   - If `attach-existing`: tile → `ready` with `existing` set, no upload, no describe.
   - Else: `upload(requested, compressed.file, {access:'public', handleUploadUrl:'/api/upload'})` (`@vercel/blob/client`) → tile → `describing`; then `describeNinaImage(...)` (Server Action) → tile → `ready` with a signed `ticket`, or → `error` if the ticket is null.

3. **`collectDraft()`** — `useComposerPhotos.ts:313-325` — maps every `ready` tile into `ComposerDraftImage` (`'upload'` or `'deduped'`), called by `Composer.tsx`'s `submit()` at send time.

### Exit Points
- `Composer.submit()` (`Composer.tsx:246-260`) calls `onSend({ body: value.trim(), images: collectDraft() })`, then `clearDraft()` + `resetPhotos()`.
- `onSend` is `useNinaSend`'s `handleSend`, which eventually calls the `sendNinaMessage` Server Action (`lib/nina/actions/send.ts:291-1022`) — entirely unaffected by this feature; it already accepts the `ComposerDraftImage[]` shape regardless of origin.

---

## Key Data Structures

### Type: `Tile` (internal, not exported)
**Location:** `useComposerPhotos.ts:79-113`
**Fields:** `id`, `previewUrl`, `state: TileState`, `error`, `ticket`, `blobUrl`, `pathname`, `contentHash`, `existing`.
**Used In:** `process()`, `onPick()`, `removeTile()`, `collectDraft()`, `reset()` — all in `useComposerPhotos.ts`.

### Type: `ComposerDraftImage`
**Location:** `useComposerPhotos.ts:127-139` (exported)
**Fields:** discriminated union on `source`: `'upload'` (`ticket`, `url`, `pathname`, `contentHash`) | `'deduped'` (`url`, `imageId`).
**Used In:** `collectDraft()` (`useComposerPhotos.ts:313`), `Composer`'s `onSend` prop type (`Composer.tsx:154`), `Composer.test.tsx` assertions.

### Type: `NinaPickedPlan` / `NinaPickCandidate` / `NinaPickRejection`
**Location:** `lib/nina/images.ts:157-173`
**Used In:** `planNinaPicked()` (`lib/nina/images.ts:186`), consumed by `onPick()` (`useComposerPhotos.ts:270`).

---

## Dependencies

### Configuration / Constants (all `lib/nina/images.ts`, pure, no imports)
- `NINA_MAX_CHAT_IMAGES = 3`
- `NINA_CHAT_MAX_SOURCE_BYTES = 25 * 1024 * 1024` (25 MB, pre-decode reject)
- `NINA_CHAT_TARGET_SHORT_EDGE_PX = 768`, `NINA_CHAT_TARGET_QUALITY = 0.75`, `NINA_CHAT_TARGET_MAX_MB = 1` (compression targets, `compressForNina`)
- `NINA_CHAT_MAX_UPLOAD_BYTES = 900_000` (server-side mint-time ceiling, post-compression)
- `NINA_CHAT_ALLOWED_CONTENT_TYPES = ['image/jpeg']` (server-side, post-compression — compressor always emits JPEG regardless of paste/pick source type)

### External Services
- Vercel Blob (`@vercel/blob/client`'s `upload()`, `/api/upload` route) — unaffected.
- The vision-describe Server Action — unaffected.

### Browser APIs newly exercised by this feature
- `ClipboardEvent.clipboardData.files: FileList` on the textarea's `onPaste`. No polyfill; this is standard and already how the codebase's own drag/drop-equivalent (`useComposerPhotos`) treats a `FileList`. happy-dom (the test environment already used for `Composer.test.tsx`) supports constructing a synthetic paste via `fireEvent.paste(el, { clipboardData: { files: [...] } })` — RTL/happy-dom simply assigns the supplied object onto the event, so no clipboard permission/API mocking is required in tests.

---

## Reference List

| Symbol / key | File:line | Kind | Package |
|---|---|---|---|
| `onPick` | `components/nina/useComposerPhotos.ts:265` | def (to be refactored into a shared core) | `components/nina` |
| `<textarea>` | `components/nina/Composer.tsx:379-422` | def (needs a new `onPaste` prop) | `components/nina` |
| `useComposerPhotos` | `components/nina/useComposerPhotos.ts:147` | def (hook to gain a returned `onPaste` handler) | `components/nina` |
| `useComposerPhotos(...)` call | `components/nina/Composer.tsx:226-235` | call (destructure the new `onPaste`) | `components/nina` |
| `planNinaPicked` | `lib/nina/images.ts:186` | call (reused unchanged) | `lib/nina` |
| `Composer.test.tsx` | `components/nina/Composer.test.tsx` | test (add paste cases, mirroring existing pick cases) | `components/nina` |

---

## Impact Points (files that WILL need changes)
1. `components/nina/useComposerPhotos.ts` — extract `onPick`'s body (everything after the `Array.from(event.target.files ?? [])`/`event.target.value` lines) into a shared `handleFiles(files: File[])`; add a new `onPaste(event: React.ClipboardEvent<HTMLTextAreaElement>)` that reads `event.clipboardData?.files`, filters to `type.startsWith('image/')`, and — only when at least one image file is present — calls `event.preventDefault()` then `handleFiles(imageFiles)`; return `onPaste` alongside the hook's existing return values.
2. `components/nina/Composer.tsx` — destructure `onPaste` from the `useComposerPhotos(...)` call (line ~226-235) and wire it onto the `<textarea>` (`onPaste={onPaste}`, alongside the existing `onKeyDown` at line 384).
3. `components/nina/Composer.test.tsx` — add paste-path test cases mirroring the existing pick-path ones (happy path through `mockUploadPipeline()`, the 3-image cap rejection, the non-image no-op case), driven via `fireEvent.paste(textbox(), { clipboardData: { files: [...] } })`.

**This document describes. The plan file prescribes.**
