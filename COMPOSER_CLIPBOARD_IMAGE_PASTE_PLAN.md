# Plan: Clipboard image paste into the Nina Composer

**Slug:** composer-clipboard-image-paste
**Date:** 2026-09-16 07:45:27
**Analysis:** `20260916-074527-J14P_code_analyzer.md`
**Worktree:** `/home/miftah/.worktrees/run-insights/composer-clipboard-image-paste`
**Branch:** `feature/composer-clipboard-image-paste` (base: `origin/main` @ `924bb32`)
**Phases:** 1
**Status:** planned
**Coordinator:** —

---

## Why

The owner can hold down a WhatsApp image bubble, tap Copy, and paste it straight into WhatsApp's
own text field. He wants the same mechanism in Nina's composer: copy an image anywhere (WhatsApp
included) and paste it directly into the "Message Nina" textarea, where it attaches as a photo the
same way the camera-icon file picker already does.

## Requirements

| ID | What the user asked for | Phases |
|---|---|---|
| R1 | Paste a clipboard image directly into the chat's message text input and have it attach as a photo, the way WhatsApp lets you paste a copied image bubble into its own text field | 1 |

## Scope

**In scope:** a new `onPaste` handler on the composer's `<textarea>` that, when the clipboard
carries at least one image file, routes it through the exact same compress → hash → dedupe-check →
upload → describe pipeline the existing file-picker button already uses (`useComposerPhotos.ts`),
producing an identical tile and an identical `ComposerDraftImage` at send time. A shared
`handleFiles(files: File[])` core extracted from `onPick` so the picker and the paste handler
are two thin entry points into one pipeline, not two implementations of it.

**Out of scope, and why:**
- Any server-side change (API routes, DB schema, Blob upload token minting) — a pasted image
  becomes a plain `File` before it ever leaves the browser, and the existing pipeline already
  treats a `File` identically regardless of where it came from.
- Any change to `sendNinaMessage`, `ComposerDraftImage`, or the `nina_message_images` table —
  `kind: 'upload'` already covers "the runner's own bytes, uploaded fresh."
- Any change to `NINA_CHAT_ALLOWED_CONTENT_TYPES` or other constants in `lib/nina/images.ts` —
  `compressForNina` re-encodes to JPEG regardless of the pasted image's source MIME type, so the
  existing JPEG-only server-side check is unaffected.
- Pasting into any other input in the app (e.g. admin surfaces) — the ask is specifically the
  Nina chat composer.
- Drag-and-drop image attach — not asked for; paste only.

## Invariants

- The tree builds and the test suite passes at the end of the phase.
- Pasting plain text (no image on the clipboard) is completely unaffected — normal browser text
  paste, no `preventDefault()`, no notice, no tile.
- Every existing picker rule (the 3-image cap, the 25 MB pre-decode ceiling, the "not an image"
  rejection, and their notice copy) applies identically to a pasted image, by construction —
  because both entry points call the same `planNinaPicked` decision and the same
  `handleFiles`/`process` pipeline, never a parallel copy of either.
- No public prop or exported type on `Composer` changes shape for its one caller (`ChatScreen.tsx`)
  — this is purely internal to `Composer.tsx` + `useComposerPhotos.ts`.

## Phases

| # | Title | Satisfies | Package | Files | Depends on | Difficulty | Plan | TaskID | Card |
|---|-------|-----------|---------|-------|-----------|------------|------|--------|------|
| 1 | Paste an image into the composer | R1 | `components/nina` | 3 | — | NORMAL | `.workflows/plan/composer-clipboard-image-paste/phase-1.md` | — | — |

### Phase 1 — Paste an image into the composer
**Satisfies:** R1
**Owns:** `components/nina/useComposerPhotos.ts` (extract `handleFiles`, add `onPaste`),
`components/nina/Composer.tsx` (wire `onPaste` onto the `<textarea>`),
`components/nina/Composer.test.tsx` (paste-path test cases).
**Does not touch:** any file outside `components/nina/` — no server action, no route, no schema,
no other component.
**Exit criteria:** pasting an image (via a synthetic `ClipboardEvent` carrying `clipboardData.files`)
into the composer's textarea produces a tile that runs through compress/hash/dedupe/upload/describe
exactly as a file-picker pick does, and sends in the identical `ComposerDraftImage` shape; pasting
text-only clipboard content is unaffected; `npx tsc --noEmit` and the Vitest suite (including the
new cases) pass.

## Reconciliation Log

single phase — nothing to reconcile

## Decisions

| Fork | Chosen | Rung |
|---|---|---|
| `handleFiles`'s file lookup: keep `onPick`'s `{name, size}` `.find()`, or key by candidate-object identity | identity-keyed `Map<NinaPickCandidate, File>` — a multi-image clipboard paste routinely carries several files the OS named identically (`image.png`), which `{name, size}` would collapse onto one `File` and silently duplicate a tile's bytes; `planNinaPicked` already hands back the exact candidate objects it was given, so identity is exact and total | 6: surrounding convention + a defect the phase-planner traced in `lib/nina/images.ts:207`, not present in the original analysis |
| A pasted non-image file (e.g. a `.txt` dragged into a paste alongside an image, or a lone non-image file pasted): reject with the picker's "That is not a photo." notice, or drop it silently | drop silently, no notice — a paste is not a deliberate choice of a file from an OS dialog the way the picker's `accept="image/*"` selection is, so the picker's rejection copy does not fit it; recorded in the hook's header and pinned by a test | 6: surrounding convention (judgement call, no invariant or requirement spoke to it) |

Both are reversible in isolation (noted under Handoffs in the phase plan) and neither touches the
send-side contract, so overturning either costs the one line the phase plan names.

## Open Questions

_(none)_

## Rollback

Single phase, single commit-sized change, additive and internal to `components/nina/`: revert the
commit (or `git checkout origin/main -- components/nina/useComposerPhotos.ts components/nina/Composer.tsx components/nina/Composer.test.tsx`)
to fully back out. No data migration, no server-side state, nothing else to unwind.

## Next

Execute the phase:

    /implement -f COMPOSER_CLIPBOARD_IMAGE_PASTE_PLAN.md --phase 1

Or run it as a swarm (a session per phase — trivial here with only one phase, but consistent):

    /analyze-orchestrator -f COMPOSER_CLIPBOARD_IMAGE_PASTE_PLAN.md

Or put it on the board first (GitHub repos only):

    /create-task --from-plan COMPOSER_CLIPBOARD_IMAGE_PASTE_PLAN.md
