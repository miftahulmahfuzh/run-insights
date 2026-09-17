# Nina job detail: edit prompt before retry

**Date:** 2026-09-17
**Status:** validated, not yet implemented

## Problem

`/nina/jobs/[id]` ("Detail foto") shows a job's stored prompt but has no way to change it. When a
job fails with `errorCode: 'policy'` ("Ditolak filter konten provider" — the provider's content
filter rejected the prompt), the only way to retry is from the `/nina/jobs` list page, which
copies `nina_turns.args` **verbatim**, including the exact prompt that just got rejected. There is
no way to strip the offending words before retrying.

## Goal

On the detail page, add:
1. An icon-only edit button that turns the prompt into an editable textarea, saved via an explicit
   Simpan/Batal step, persisting to `nina_turns.args.prompt` for that job.
2. An icon-only retry button (currently only on the list page), so edit → retry happens on one
   screen, landing on the new job's own detail page afterward.

Editable regardless of job stage (not just failed jobs) — an admin-only debugging page, so no
harm in allowing inspection/edits on any status. Retry itself stays gated to failed jobs only
(`jobCanRedo`), since `reopenNinaImageJob` refuses anything else.

## Data model

No schema change. `nina_turns.args` is already `jsonb`, typed `NinaImageJobArgs` in
`lib/nina/imagerecipe.ts`, with `prompt: string` and `sidecar: string` (the "prompt as sent" block
composed by `sidecarText()` in `lib/nina/imagegen.ts`: metadata lines, then a
`--- prompt as sent ---` marker, then the prompt verbatim).

## Changes

### `lib/nina/imagejobs.ts`

New `setNinaImageJobPrompt(userId, jobId, prompt)` (naming mirrors `reopenNinaImageJob` as the
core/"open" pair to `redoNinaImageJob`'s action wrapper):

- Trim the incoming prompt; refuse `empty-prompt` if blank.
- Owner-scoped read of `{ args }` from `ninaTurns` (`userId`, `id`, `kind: 'image'`,
  `deletedAt IS NULL`) — same shape as `reopenNinaImageJob`'s read. `row == null` or
  non-object `args` → refuse `not-found`.
- Regenerate the sidecar to keep it truthful: find `--- prompt as sent ---` in the existing
  `args.sidecar` and replace everything after it with the new prompt, preserving the metadata
  lines above (provider/model/purpose/resolution/seed/reference — unchanged by this edit). If the
  marker isn't found (an old/malformed sidecar), fall back to storing the bare new prompt as the
  sidecar.
- `UPDATE ninaTurns SET args = { ...args, prompt: trimmed, sidecar: <regenerated> } WHERE id AND
  userId`.

### `lib/nina/jobview.ts`

- `export type NinaPromptEditRefusal = 'not-found' | 'empty-prompt'` — a separate, smaller union
  from `NinaJobRefusal` so the edit vocabulary doesn't force `NinaJobActions.tsx`'s
  `Record<NinaJobRefusal, string>` to grow a case irrelevant to the list page.

### `lib/nina/jobActions.ts`

- New `'use server'` `updateNinaImageJobPrompt({ jobId, prompt })`: `requireUserId()` →
  `isValidId` check → `setNinaImageJobPrompt` → `revalidatePath` on this job's own detail path →
  `{ ok, reason }` shaped like `NinaJobActionResult` but using `NinaPromptEditRefusal`.
- Extend `NinaJobActionResult` with `jobId: string | null` (null for delete and for any refusal;
  the new job's id on a successful `redoNinaImageJob`). `redoNinaImageJob` returns
  `reopened.jobId`; `deleteNinaImageJob`'s returns add `jobId: null`. This is additive — existing
  callers (`NinaJobActions.tsx`) don't need to change since they don't destructure the new field.

### `components/nina/NinaJobDetail.tsx`

- New `jobId: string` prop (page.tsx already has `job.id`/`id`, just needs to pass it through).
- "Catatan foto" card: icon-only pencil button (`variant="secondary"`, `size="md"`,
  `aria-label="Ubah prompt"`) beside the heading, toggling local `mode: 'view' | 'edit'`.
  - Edit mode: `<textarea>` prefilled with the bare `prompt` prop (never the sidecar text), plus
    `Simpan`/`Batal` `Button`s below — mirrors `SessionRow`'s rename form.
  - `Simpan` calls `updateNinaImageJobPrompt({ jobId, prompt: draft })` inside a
    `useTransition`; a refusal renders inline (`NinaPromptEditRefusal` → one Indonesian
    sentence, module-local `NOTE` record, same pattern as `NinaJobActions.tsx`'s `NOTE`).
  - `Batal` discards the draft, back to `view` with the original `prompt` untouched.
- First card's icon row (currently jump + photo): add a third icon-only retry button, gated on
  `jobCanRedo(stage)` (already importable — pure function of the `stage` prop already in scope,
  no new prop needed), reusing the same `RedoIcon` glyph and refusal vocabulary
  (`NinaJobRefusal`/`NOTE`) as `NinaJobActions.tsx` — small enough to inline-duplicate rather than
  extract, consistent with this file's existing "icons are copied per file" convention.
  - On success: `router.push(`/nina/jobs/${result.jobId}`)` — lands on the new job's own detail
    page to watch the retry run, since (unlike the list) this page has nothing else to show once
    the old job is superseded.
- Mutual exclusion: edit mode hides the retry button and vice versa.

## Out of scope

- No change to how a prompt is originally assembled (`lib/nina/imagegen.ts`,
  `lib/nina/imageprefs.ts`) — this only edits the already-composed, already-stored string.
- No new refusal reasons on `redoNinaImageJob` itself; retry behavior is unchanged, just given a
  second UI entry point and a return value.
- No confirmation dialog on retry, consistent with the list page's documented R-level decision
  ("we dont need confirmation message to execute them").
