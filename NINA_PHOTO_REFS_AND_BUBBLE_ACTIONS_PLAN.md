# Plan: A re-attached photo is a reference, and a bubble is a control

**Slug:** `nina-photo-refs-and-bubble-actions`
**Date:** 2026-09-07 12:50:41 +07
**Analysis:** `20260907-125041-PHRF_code_analyzer.md`
**Worktree:** `/home/miftah/.worktrees/run-insights/nina-photo-refs-and-bubble-actions`
**Branch:** `feature/nina-photo-refs-and-bubble-actions` (base: `origin/main` @ `e6c68d6`)
**Phases:** 4
**Status:** planned
**Coordinator:** —

---

## Why

The user's words, verbatim:

> admin update
> can we avoid including duplicate photos in Chat Photos? look at prod admin, 2 of the most recent photos are duplicate.
> it looks like everytime i attached a photo into chat, we will add a new duplicate of it into Chat Photos. this is wrong. we must optimize it to only refer to the existing photo.
> there is a "what she can see in it" field. make this field editable by user
>
> - another similar problem is that , existing photos in Nina profpic album being added into Media as well. please optimize this. make sure if user is attaching profile photo, we would not add this profile photo into Media
>
> ---
> sometimes the interaction is embarassing or redundant. so , to keep nina context clean, give user the ability to edit his message, edit nina message, or delete his message, or delete nina message. this requirement is weird, but this is because nina will keep using previous history as context, so we need to give user the capability to make this context more "accurate" . so basically user can click any bubble (his or nina's) and choose: edit , delete
> sometimes, user chat message is left unanswered. add option to resend as well (just for user's bubble)

## Requirements

| ID | What the user asked for | Phases |
|---|---|---|
| R1 | Attaching a photo into chat must not add a duplicate to Chat Photos — refer to the existing photo | 1 |
| R2 | "what she can see in it" must be an editable field | 2 |
| R3 | Attaching a photo from Nina's profile album must not add it into Media | 1 |
| R4 | Click any bubble (his or hers) and choose edit or delete | 3 |
| R5 | Resend, on his bubbles only, for a message left unanswered | 4 |

**Phase 1 serves R1 and R3, and cannot be split.** They are one defect — `insertNinaMessageImages`
on the attach path — seen at two listings. Splitting by R would mean two migrations for one column
pair, or a phase that changes the write and a phase that changes the reads, the first of which
ships nothing observable. Per Step 6 the coupling is kept and named.

**R4 is an affordance, not a capability.** Edit and delete of a message — his and hers — already
ship (`75a9c34`): `lib/nina/messageActions.ts`, `components/nina/MessageActionsSheet.tsx`,
`lib/nina/edit.ts`, all tested. What is missing is a *tap*: the only openers today are a left swipe
on touch and a visually-hidden focus button, so on a mouse there is no opener at all. Phase 3
therefore adds the opener and touches neither action nor sheet logic.

## Scope

**In scope**

- Provenance on `nina_message_images`: which existing row or avatar a re-attached photo's bytes
  came from, and the two collection listings learning to skip a reference (phase 1).
- A one-time backfill so production's existing duplicates stop being listed (phase 1).
- An admin control that writes `nina_message_images.description` (phase 2).
- A tap/click opener for the shipped message-actions sheet, on both his and her bubbles (phase 3).
- `resendNinaMessage`: re-run the turn for a runner row already on the server, with no second copy
  of his message (phase 4).

**Out of scope, and why**

- **Deleting the duplicate rows, or their blobs.** A duplicate row is attached to a real message
  and a real bubble; deleting it blanks a photograph in the conversation. The rows stay and stop
  being *listed* — see D1. Blob reaping stays `reap-orphaned-blobs`'s job and it does not cover
  `nina/` yet.
- **`nina_avatars.description`.** The user pointed at one field, on one screen. The album rail
  (`components/admin/explorer/SelectionPane.tsx`) prints only whether a description exists, which
  is the right call for the album; making that editable too is a coherent follow-up and is not
  this set.
- **Any change to what Nina is *given* as context.** `dbNinaSourceGateway.readConversation`
  hardcodes `imageDescriptions: []` for window rows — a real gap, recorded by the previous set as
  out of scope for the same reason it stays out of scope here: it changes what she knows in every
  conversation and nobody asked for it.
- **Deduplicating the *upload* path.** Uploading the same photograph twice from the composer
  writes two blobs and two rows, and that is two photographs as far as anything can tell. The
  user's defect is specifically the attach path, which reuses a blob URL and therefore *can* be
  detected.
- **A "was this answered" indicator, badge or icon on a bubble.** R5 asks for a resend option, and
  `MessageBubble`'s own note records the deliberate choice not to grow retry chrome. See D4.
- **`NINA_PROMPT_VERSION`, the tuning surface, and Nina's system prompt.** Untouched.

## Invariants

Every phase holds all of these. A phase that cannot is a phase whose plan is wrong.

1. **The tree is green at the end of every phase**: `npm run lint`, `npm run typecheck`,
   `npx vitest run`. A phase does not leave the next one a broken build.
2. **A photograph already in the conversation keeps rendering, everywhere.** The bubble, the
   photo viewer, the download control, the job views and Nina's prompt all read
   `nina_message_images` by `message_id`; no phase may remove or repoint a row a message depends
   on. Whatever a listing hides, `getNinaMessageImagesForMessages` still returns.
3. **`description` is private to Nina's prompt and to `/admin`.** It may be read and written behind
   `requireAdmin()`; it may never reach a component under `components/nina/` or any runner-facing
   caption. (Invariant 5 of the shipped chat plans; `ChatPhotoDetail`'s header states the `/admin`
   carve-out.)
4. **Ownership is proved by a `user_id`-scoped read before every write**, and a miss refuses rather
   than degrades. An id from a client is a claim.
5. **No new model call.** Phase 2 writes prose a human typed; phase 4 re-runs an existing turn.
   `scripts/check-llm-payload-boundary.mjs` gains no entry.
6. **The reply swipe is not re-litigated.** `decideReplySwipe` runs first and keeps every pixel it
   has today; phase 3 adds a decision that can only fire where no existing gesture does.
7. **Resend never writes a `nina_messages` row.** It re-opens a turn for an existing
   `runner_message_id`; a second copy of his sentence on screen is a failed phase 4.
8. **One migration in this set, and it is phase 1's.** No other phase may add DDL.

## Phases

| # | Title | Satisfies | Package | Files | Depends on | Difficulty | Plan | TaskID | Card |
|---|-------|-----------|---------|-------|-----------|------------|------|--------|------|
| 1 | A re-attached photo is a reference, not a copy | R1, R3 | `lib/db`, `drizzle`, `lib/nina` | ~8 | — | HARD | `.workflows/plan/nina-photo-refs-and-bubble-actions/phase-1.md` | — | — |
| 2 | "What she can see in it", editable | R2 | `lib/admin`, `components/admin`, `lib/nina` | ~6 | — | NORMAL | `.workflows/plan/nina-photo-refs-and-bubble-actions/phase-2.md` | — | — |
| 3 | Tap a bubble to edit or delete it | R4 | `lib/nina`, `components/nina` | ~4 | — | NORMAL | `.workflows/plan/nina-photo-refs-and-bubble-actions/phase-3.md` | — | — |
| 4 | Resend a message that was never answered | R5 | `lib/nina`, `components/nina` | ~5 | 3 | HARD | `.workflows/plan/nina-photo-refs-and-bubble-actions/phase-4.md` | — | — |

### Phase 1 — A re-attached photo is a reference, not a copy
**Satisfies:** R1, R3
**Owns:** `ninaMessageImages`'s two new provenance columns and `drizzle/0010_*` (generated
`ALTER TABLE` **plus a hand-written backfill**, on `0009`'s precedent); `imageColumns`;
`NinaImageInsert`; `insertNinaMessageImages`; `resolveAttachment`'s return type and the attach
INSERT in `sendNinaMessage`; the reference filter in `listNinaMessageImages`,
`generatedChatPhotoScope` and `countNinaChatPhotos`. Optionally surfaces provenance on
`ChatPhoto` / `ChatPhotoDetail` as one read-only line — **coordinate with phase 2, which owns that
file**; if in doubt, leave it out and say so.
**Does not touch:** any message read used to render a bubble (invariant 2); `components/nina/`;
`lib/admin/chatPhotoActions.ts`; anything in phases 3 and 4.
**Exit criteria:** attaching an album face or re-attaching a chat photo leaves
`countNinaChatPhotos` unchanged and adds nothing to `galleryPhotos`'s input, while the photo still
renders in the bubble and its description still reaches the turn. The backfill marks production's
existing duplicates. `npm run db:generate` produces exactly one new file and the meta journal
matches it.

### Phase 2 — "What she can see in it", editable
**Satisfies:** R2
**Owns:** a zod schema in `lib/admin/chatPhotoSchema.ts`; an
`updateNinaChatPhotoDescription`-shaped statement in `lib/nina/queries.ts` §5b (the admin write
block); `editChatPhotoDescriptionAction` in `lib/admin/chatPhotoActions.ts`; the editable control
in `components/admin/ChatPhotoDetail.tsx` and whatever `ChatPhotoControls` / `chatPhotoModel.ts`
need for it.
**Does not touch:** `nina_avatars`; any DDL (invariant 8 — the column already exists); the
`describeNinaImages` `after()` pass; `components/nina/`.
**Exit criteria:** an operator can rewrite the description on `/admin/photos`, a save survives a
reload, an empty save is a decided outcome (clear it, or refuse — the plan must choose and say
which), and the next turn reads the new text with no invalidation step.

### Phase 3 — Tap a bubble to edit or delete it
**Satisfies:** R4
**Owns:** a pure tap decision in `lib/nina/edit.ts` and its tests; the pointer/tap opener in
`components/nina/MessageBubble.tsx`.
**Does not touch:** `decideReplySwipe` or `decideMessageActionSwipe` (invariant 6 — both keep
working); `MessageActionsSheet.tsx`; `messageActions.ts`; `ChatScreen.tsx` beyond a prop it may
already pass.
**Exit criteria:** a tap or click on the body of any bubble — his or hers — opens the shipped
sheet; a tap on a photo still opens the viewer, a tap on a quote stub still jumps, a swipe still
replies and still opens the sheet; an optimistic (`sending`) bubble opens nothing.

### Phase 4 — Resend a message that was never answered
**Satisfies:** R5
**Owns:** `resendNinaMessage` in `lib/nina/actions.ts` (sweep → `openNinaChatTurn` →
`startNinaBackgroundTurn`, rebuilding `NinaBackgroundTurnInput` from the persisted row); the
Resend item in `components/nina/MessageActionsSheet.tsx`; its handler in `ChatScreen.tsx`
(`awaiting`, `cursorRef`); any gate it needs in `lib/nina/edit.ts`.
**Does not touch:** `insertNinaMessages` (invariant 7); `pollNinaReply`; the turnflight cadence;
`messageActions.ts`; phase 1's columns.
**Exit criteria:** Resend appears only on his confirmed bubbles, never on hers; pressing it puts
the screen into the same awaiting state a send does and her answer arrives through the existing
poll; no second copy of his message appears; a resend while a turn is already running is refused
with a reason rather than opening a second claim.

## Reconciliation Log

_(filled by the reconciler)_

## Decisions

Every fork settled before planning, with the rung that settled it, so no phase session meets it
again.

| Fork | Chosen | Rung |
|---|---|---|
| "only refer to the existing photo" — drop the per-message row, or keep it and mark it? | **Keep the row, mark it as a reference, and exclude references from the two listings.** | 5: the user's raw input names the *observable* (no duplicate in the collection), and invariant 2 forbids the alternative — every bubble, viewer, download and prompt read goes through `nina_message_images.message_id`, so a message with no row of its own is a blank bubble. A `nina_messages.attached_image_id` union would touch every reader of the table for the same visible result. |
| How provenance is recorded | **Two nullable columns on `nina_message_images`: `source_avatar_id` → `nina_avatars(id)` and `source_image_id` → `nina_message_images(id)`, both `ON DELETE SET NULL`.** A row is a reference when either is non-null. | 6: surrounding convention — `nina_avatars.source_key` and `nina_messages.reply_to_id` (a self-referencing FK on the same shape) are the repo's two precedents. `SET NULL` is deliberate: when the original is deleted the copy stops being a copy and the collection keeps the picture instead of losing it. |
| The two existing production duplicates | **A hand-written backfill inside the generated `0010`, matching on `blob_url` within one `user_id` — earliest row wins as the original, and a row whose `blob_url` matches a `nina_avatars` row is marked `source_avatar_id`.** Literals and rule frozen at 2026-09-07. | 6: `drizzle/0009_nina_message_photo_only.sql` did exactly this, and states why a migration must not follow later edits to the code it mirrors. Note that regenerating the migration silently drops the backfill — diff before replacing. |
| Which listings filter references | **`listNinaChatPhotos` + `countNinaChatPhotos` (admin Chat photos) and `listNinaMessageImages` (`/nina/about` **Media**).** `getNinaMessageImagesForMessages`, `getNinaMessageImage` and `gateway.readMessageWindow` do **not** filter. | 1: invariant 2. The first three are collection listings; the last three are what makes a bubble render and what Nina reads. |
| Does Resend need an "unanswered" test? | **No. Resend is offered on every confirmed runner bubble.** The action refuses when a turn is already live. | 5: the user's input names a symptom ("sometimes … left unanswered"), not a gate; and a client-side answered/unanswered test would be a second authority on turn state beside `nina_turns`, which `openNinaChatTurn` already owns. Refusing at the action is honest; hiding the item on a guess is not. |
| Does R2 also cover the album's description? | **No — `nina_message_images.description` only.** | 5: the user named one field on one screen ("there is a 'what she can see in it' field"), and that string exists in exactly one file. |
| Tap vs long-press for the opener | **Tap/click.** | 5: "user can click any bubble … and choose: edit, delete" — the user said click. A long-press would also need a timer, a cancel path and a haptic story nobody asked for. |

## Open Questions

None. Every fork above was decidable from a rung.

## Rollback

**Per phase.**

- **Phase 1** — `git revert` the commit, then `drizzle/0010`'s inverse:
  `ALTER TABLE "nina_message_images" DROP COLUMN "source_avatar_id", DROP COLUMN "source_image_id";`
  The backfill is not undone by the revert and does not need to be — the columns go with it. No row
  is deleted at any point, so nothing is lost either way.
- **Phase 2** — revert the commit. The column and every description already written stay; the field
  goes back to read-only.
- **Phase 3** — revert the commit. The swipe and the focus button are untouched by it, so the sheet
  keeps its shipped openers.
- **Phase 4** — revert the commit. `nina_turns` is unaffected: a resend opens and closes an
  ordinary claim.

**As a whole.** `git branch -D feature/nina-photo-refs-and-bubble-actions` before merge, or revert
the merge commit and drop the two columns after.

## Next

Execute the phases one at a time, starting at phase 1:

    /implement -f NINA_PHOTO_REFS_AND_BUBBLE_ACTIONS_PLAN.md --phase 1

Or run the whole set as a swarm — a session per phase, concurrent wherever `Depends on` allows,
resumable on any machine:

    /analyze-orchestrator -f NINA_PHOTO_REFS_AND_BUBBLE_ACTIONS_PLAN.md

Or put them on the board first (GitHub repos only):

    /create-task --from-plan NINA_PHOTO_REFS_AND_BUBBLE_ACTIONS_PLAN.md
