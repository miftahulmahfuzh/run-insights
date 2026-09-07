# Code Analysis: chat-photo references and bubble-level message controls

**Type:** Feature Update
**Date:** 2026-09-07 12:50:41 +07
**Session ID:** 20260907-125041-PHRF
**Plan:** `NINA_PHOTO_REFS_AND_BUBBLE_ACTIONS_PLAN.md` (4 phases)
**Worktree:** `/home/miftah/.worktrees/run-insights/nina-photo-refs-and-bubble-actions` — branch `feature/nina-photo-refs-and-bubble-actions`, base `origin/main` @ `e6c68d6`

---

## User Input

### Original User Request

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

### User-Provided Context

No logs, no files. One reported observation, treated as the measurement it is: **on production
`/admin/photos`, the two most recent photographs are the same picture twice.** The mechanism below
reproduces that from the code without needing the database.

### User-Provided Files

None (no `@` references).

### Requirement IDs

| ID | What the user asked for |
|---|---|
| R1 | Attaching a photo into chat must not add a duplicate of it to Chat Photos — it must refer to the existing photo |
| R2 | The "what she can see in it" field must be editable by the user |
| R3 | Attaching a photo from Nina's profile album must not add that photo into Media |
| R4 | Click any bubble — his or hers — and choose edit or delete, so Nina's context can be made accurate |
| R5 | Resend, on his bubbles only, for a message left unanswered |

R1 and R3 are the **same defect at two surfaces** and R3 is the user's own words for it
("another similar problem"). They are kept as two IDs because the user named two surfaces and
will check two surfaces.

---

## Detailed Requirements Understanding

**Problem statement (R1, R3).** `nina_message_images` is a per-message table. The two "collection"
surfaces are plain listings of it:

- `/admin/photos` — "Chat photos", `listNinaChatPhotos` → every row with `kind = 'generated'`
- `/nina/about` — the **Media** section, `listNinaMessageImages` → every row, his and hers

Attaching an *existing* photo (album face or earlier chat photo) into a chat message inserts a
**new row** in that table pointing at the **same blob URL**. Both listings therefore gain an entry.
That is the duplicate the user is looking at, and it is why an album face turns up in Media.

**Problem statement (R2).** `nina_message_images.description` is `glm-4.6v`'s prose — the field
`/admin/photos`'s detail rail prints under the heading **"What she can see in it"**
(`components/admin/ChatPhotoDetail.tsx:157`). It is read-only there, and it is the only text on
that row that reaches Nina's prompt, so a wrong description is a wrong belief with no way to
correct it.

**Problem statement (R4).** Edit and delete of a message — his and hers — **already ship**
(`75a9c34`, `lib/nina/messageActions.ts`, `components/nina/MessageActionsSheet.tsx`). What does not
ship is a way to *open* that sheet by tapping the bubble. The only openers today are a **left swipe
on a touch device** (`decideMessageActionSwipe`) and a visually-hidden focus-only button for
keyboard/VoiceOver. On a desktop pointer there is no opener at all. So R4 is an **affordance**
requirement, not a capability one — a tap/click path onto machinery that exists and is tested.

**Problem statement (R5).** Nothing can re-run a turn for a message already on the server. The
symptom is documented in `MessageBubble.tsx` itself: a failed send keeps a red hairline "so the
runner can see which line to try again, **without an icon, a badge or a retry button**". A turn can
also die silently and be swept (`sweepStaleNinaChatTurns`), leaving a persisted runner row with no
answer and no way to ask again except retyping.

**Success criteria.**

1. Re-attaching a chat photo, or attaching an album face, leaves the count on `/admin/photos`
   **unchanged**, and adds nothing to Media on `/nina/about` — while the photograph still renders
   in the bubble, still opens in the viewer, and still reaches Nina's prompt with its description.
2. Production's existing duplicates stop being listed, without deleting any message or any blob.
3. "What she can see in it" is an editable field on `/admin/photos`; a save is visible on reload and
   is what Nina's next turn reads.
4. Tapping a bubble — his or hers, touch or mouse — opens the existing actions sheet.
5. His bubbles offer **Resend**; it re-runs the turn for that exact row and no second copy of his
   message appears.

**Key considerations.**

- **Invariant 5 of the shipped chat plans**: `description` is private to Nina's prompt and must
  never reach a runner-facing surface. `/admin` is explicitly exempt (`ChatPhotoDetail`'s header
  argues this in full) — so R2 is admin-only by construction, and no phase may leak the field into
  `components/nina/`.
- **A bubble's photo must keep rendering.** Every read of a message's photos goes through
  `nina_message_images.message_id` (`getNinaMessageImagesForMessages`, `gateway.readMessageWindow`,
  `ChatImages`, `chatViewerPhotos`, the job views). Removing the per-message row to avoid a
  duplicate would blank the bubble; the row has to stay and the *listings* have to learn it is a
  reference. See Decisions in the plan index.
- **Tap must not steal the existing gestures.** A bubble already handles a right-swipe reply, a
  left-swipe actions open, a tap on a quote stub (jump), and a tap on a photo (viewer). A tap
  opener has to be a decision function with those exclusions, tested, in `lib/nina/edit.ts`.
- **Resend must not duplicate his message.** It re-opens a turn for an existing
  `runner_message_id`; it does not call `insertNinaMessages`.

---

## Analysis Scope

### Explicitly mentioned files

None. Everything below was discovered.

### Discovered related files

| File | Why it is in scope |
|---|---|
| `lib/nina/actions.ts` | `resolveAttachment` (:183) and the attach INSERT (:552-574) — the defect; and `startNinaBackgroundTurn` (:681), which R5 re-uses |
| `lib/nina/queries.ts` | `imageColumns` (:503), `insertNinaMessageImages` (:1449), `listNinaMessageImages` (:1491), `listNinaChatPhotos` (:1603), `countNinaChatPhotos` (:1637), `generatedChatPhotoScope` (:1577) |
| `lib/db/schema.ts` | `ninaMessageImages` (:1031), `ninaAvatars` (:1433) |
| `drizzle/0009_nina_message_photo_only.sql` | the newest migration, and the precedent for a hand-written backfill inside a generated file |
| `components/admin/ChatPhotoDetail.tsx` | the "What she can see in it" block (:152-170) — R2's surface |
| `lib/admin/chatPhotoActions.ts` | `replaceChatPhotoAction` / `addChatPhotoAction` / `removeChatPhotoAction` — the action shape R2 copies |
| `lib/admin/chatPhotoSchema.ts` | `chatPhotoAddSchema` / `chatPhotoReplaceSchema` / `chatPhotoRemoveSchema` — R2's zod precedent |
| `components/admin/ChatPhotoControls.tsx`, `ChatPhotoGrid.tsx`, `chatPhotoModel.ts` | where an admin control mounts, and the `ChatPhoto` prop shape |
| `components/nina/MessageBubble.tsx` | the gesture handlers (:185-231) — R4's opener |
| `components/nina/MessageActionsSheet.tsx` | the sheet — R4 opens it, R5 adds one item |
| `components/nina/ChatScreen.tsx` | `handleRequestActions` (:734), `handleEditMessage` (:765), `handleDeleteMessage` (:798), the poll loop (:905-940), `cursorRef` (:291), `awaiting` (:278) |
| `lib/nina/edit.ts` | `EditTarget`, `canActOnMessage`, `planMessageEdit`, `decideMessageActionSwipe` — R4's decision layer |
| `lib/nina/messageActions.ts` | the shipped edit/delete actions; R5's sibling |
| `lib/nina/album.ts` | `photoSideOf` (:146), `galleryPhotos` (:304), `albumPhotos`, `NINA_SIDE_LABEL` |
| `app/nina/about/page.tsx` | the **Media** section's feed (`listNinaMessageImages`, :61) |
| `app/admin/photos/page.tsx` | the Chat photos page and its row → prop mapping |
| `lib/nina/gateway.ts` | `readMessageWindow` — what Nina actually reads back |

---

## Current Dataflow

### Entry Point A — attaching an existing photo into a chat message

**Trigger:** `/nina?photo=avatar:<id>` or `?photo=image:<id>` (built by `ShareToNinaItem` on
`/admin/nina`, and by the chat photo viewer's attach control), then a send.

1. `app/nina/page.tsx` parses the parameter with `parseNinaPhotoParam`
   (`lib/nina/attach.ts:PHOTO_PARAM`), resolves the id **owner-scoped** to a blob URL, and hands
   `pendingPhoto` to `ChatScreen`.
2. `ChatScreen` sends `sendNinaMessage({ body, attachExisting: { kind, id } })`.
3. **`resolveAttachment(userId, attach)`** — `lib/nina/actions.ts:183`
   - `kind === 'avatar'` → `getNinaAvatar(userId, id)`; returns
     `{ blobUrl, pathname, kind: 'generated', description }`
   - `kind === 'image'` → `getNinaMessageImage(userId, id)`; returns the row's own
     `{ blobUrl, pathname, kind, description }`
   - a miss **refuses the whole send** (deliberate; documented at :455-461)
   - **no vision call** — the existing `description` is copied, "already paid for"
4. `insertNinaMessages(...)` writes the runner row.
5. **`insertNinaMessageImages(userId, [{ messageId, kind, blobUrl, pathname, description, sortOrder: images.length }])`**
   — `lib/nina/actions.ts:564-574`. **This is the duplicate.** A brand-new `nina_message_images`
   row, new `id`, new `created_at`, **same `blob_url`** as the row or avatar it came from, and
   nothing on it says it is a copy.
6. `startNinaBackgroundTurn` runs the turn; `imageDescriptions` carries the copied description.

**State change:** one extra row in `nina_message_images`. No extra blob — the bytes are shared.

**Exit points, and the two surfaces the user is complaining about:**

| Surface | Read | What it now shows |
|---|---|---|
| `/admin/photos` "Chat photos" | `listNinaChatPhotos` → `generatedChatPhotoScope` = `user_id = $1 AND kind = 'generated'` | the copy, beside the original → **R1's duplicate** |
| `/nina/about` **Media** | `listNinaMessageImages(userId, { limit: NINA_GALLERY_LIMIT })` → every row of the table | an album face that was never a chat photo → **R3** |
| `/admin` hub count | `countNinaChatPhotos` (same predicate) | the collection total is inflated |

**Why the avatar branch lands in the `'generated'` set:** `resolveAttachment` rewrites `kind` to
`'generated'` for an avatar (:207-212) so `photoSideOf` keeps telling the truth about whose
photograph it is. Correct for the bubble; it is also exactly what puts an album face into an
admin collection built on `kind`.

### Entry Point B — `/admin/photos` detail rail

**Location:** `app/admin/photos/page.tsx` → `ChatPhotoGrid` → `ChatPhotoDetail`.

- `requireAdmin()` first statement; `force-dynamic`; `?page=` parsed, floored, capped.
- Row → prop mapping happens on the server; `ChatPhoto` (`components/admin/chatPhotoModel.ts`)
  carries `description` and `prompt` as plain strings.
- `ChatPhotoDetail:152-170` prints `description` under **"What she can see in it"**, with a
  fallback sentence about the row being undescribed yet. **No control writes it.**
- The action stack under the second divider holds `ChatPhotoControls` (Replace, Remove); Add is a
  collection-level control in `ChatPhotoGrid`'s header. All three go through
  `lib/admin/chatPhotoActions.ts`: `requireAdmin()` → zod parse → owner-scoped read → write →
  `revalidatePath(ADMIN_CHAT_PHOTOS_PATH)` → `ChatPhotoActionResult`.
- **`description` is nulled on Replace** and re-derived by `scheduleChatPhotoDescribe`'s `after()`
  pass, which is why the fallback copy is worded as a state and not a defect.

**Who else writes `description`:** `describeNinaImage` (the composer's upload path, before the
send), `describeNinaImages` in `after()` (the admin add/replace path), and `resolveAttachment`'s
copy. There is no UPDATE-by-id statement on the column at all.

### Entry Point C — a bubble gesture

**Location:** `components/nina/MessageBubble.tsx:185-231`.

- `onTouchStart` records `{ x, y, touches }`; `onTouchMove` only tracks the max touch count;
  `onTouchEnd` computes `dx`, `dy`, `zoomScale = window.visualViewport?.scale ?? 1`.
- Right swipe → `decideReplySwipe` → `onReply(message)`, and it is checked **first** (invariant 9:
  the reply swipe is not re-litigated).
- Left swipe → `decideMessageActionSwipe({ dx, dy, touches, zoomScale, startX, viewportWidth })`,
  which also guards the 24 px Safari back-gesture edge (`MESSAGE_ACTION_EDGE_GUARD_PX`)
  → `onRequestActions(message)`.
- Two `sr-only focus:not-sr-only` buttons per bubble ("Reply to this message", "Edit or delete this
  message") — the keyboard/VoiceOver path, invisible to a pointer.
- **There is no `onClick` on the bubble body.** A mouse user has no opener; a touch user has one
  only if they discover the swipe.

`ChatScreen.handleRequestActions` (:734) builds the `EditTarget` — `mine: role === 'runner'`,
`hasImage`, `hasRun`, `confirmed: state !== 'sending'` — and stores it with a photo count for the
sheet. `MessageActionsSheet` then runs `menu | edit | confirm` and calls
`onSubmitEdit` / `onConfirmDelete`, which call `editNinaMessage` / `removeNinaMessage` and patch
local state through `applyMessageEdit` / `applyMessageDeletion`. **No `revalidatePath`** —
deliberate, documented in `messageActions.ts`.

### Entry Point D — the turn lifecycle (what R5 must re-enter)

`sendNinaMessage`, after the runner row is committed:

1. `sweepStaleNinaChatTurns(userId)` — closes a dead claim so a new one can open. Never allowed to
   cost a send.
2. `openNinaChatTurn(userId, { sessionId, runnerMessageId, depth: 0 })` → `turnId | null`.
   **`null` is ordinary** — a turn is already running and will chain onto this message.
3. `startNinaBackgroundTurn({ userId, sessionId, turnId, runnerMessageId, runnerText,
   imageDescriptions, quotedRow, attachedRunId, depth: 0, startedAtMs })` — one line,
   `after(() => runNinaBackgroundTurn(input))`. The 300 s budget comes from
   `app/nina/page.tsx`'s `export const maxDuration = 300`.
4. Returns `{ ok: true, userMessageId, sessionId, cursor: runnerSeq, turnId }`.

**Client side:** `ChatScreen` holds `awaiting` (seeded from `flight.awaiting`) and `cursorRef`
(`nina_messages.seq`), and polls `pollNinaReply({ afterSeq: cursorRef.current })` on the
`turnflight` cadence until it stops awaiting. **A resend needs to produce exactly the same two
facts** — a `turnId` and an unchanged cursor — and the shipped poll picks the answer up with no new
machinery.

### Data persistence

| Table | Column | Written by | Read by |
|---|---|---|---|
| `nina_message_images` | whole row | `insertNinaMessageImages` (uploads, generations, **attach copies**) | `listNinaMessageImages` (Media), `listNinaChatPhotos` + `countNinaChatPhotos` (admin), `getNinaMessageImagesForMessages` (bubbles, delete logging), `gateway.readMessageWindow` |
| `nina_message_images` | `description` | `describeNinaImage`, `describeNinaImages` (`after()`), `resolveAttachment`'s copy | Nina's prompt; `/admin/photos` detail |
| `nina_avatars` | `blob_url`, `description` | album upload, generation, admin | `resolveAttachment`, `/admin/nina`, `/nina/about` album |
| `nina_messages` | `text` | `insertNinaMessages`, `updateNinaMessage` (edit) | `getNinaMessageWindow` → `conversationFacts` → **every later turn** |
| `nina_turns` | claim rows | `openNinaChatTurn`, `closeNinaChatTurn`, `sweepStaleNinaChatTurns` | `pollNinaReply`, `ninaFlightView` |

`nina_message_images.message_id` is `ON DELETE CASCADE`; the blob bytes are left behind and
`reap-orphaned-blobs` does not yet cover `nina/` (recorded as accepted in `messageActions.ts`).

---

## Key Data Structures

### `ninaMessageImages` — `lib/db/schema.ts:1031`

`id`, `user_id`, `message_id` (cascade), `kind` (`'upload' | 'generated'`), `blob_url`, `pathname`,
`width`, `height`, `bytes`, `description`, `prompt`, `sort_order`, `created_at`. Indexes:
`(message_id)` and `(user_id, created_at desc)`. **Nothing records where a row's bytes came from**,
which is the single missing fact behind R1 and R3.

### `imageColumns` — `lib/nina/queries.ts:503`

The projection every read of the table uses. A new column is invisible to every caller until it is
added here.

### `EditTarget` — `lib/nina/edit.ts:80`

`{ id, mine, body, hasImage, hasRun, confirmed }`. `canActOnMessage` (:106) is the gate; `mine` is
the discriminator R5 needs (Resend on his bubbles only), and `confirmed` is what excludes an
optimistic row.

### `ChatPhoto` — `components/admin/chatPhotoModel.ts`

The serializable admin prop: `id`, `messageId`, `url`, `kind`, `side`, `pathname`, `width`,
`height`, `bytes`, `description`, `prompt`, `sortOrder`, `createdAt`. R2 writes `description`
through it; R1/R3 may surface provenance through it.

### `ChatPhotoActionResult` — `lib/admin/chatPhotos.ts:279`

`{ ok, note }`-shaped. R2's action returns the same type so `ChatPhotoDetail`'s `onRemoved(note)`
convention needs no new vocabulary.

---

## Dependencies

**Configuration / environment.** No new env var. `lib/env.ts` validates 14 vars at load, so a
worktree needs `.env.local` before `npm run build`, `db:*`, `lint` or `vitest` will run — done for
this worktree already.

**Database.** One migration for R1/R3 (`drizzle/0010_*`), generated with `npm run db:generate` and
then **appended by hand** with the backfill. `drizzle/0009_nina_message_photo_only.sql` is the
precedent: a generated `ALTER TABLE`, a `--> statement-breakpoint`, then a commented `UPDATE` whose
literals are frozen at the migration's date. Regenerating drops a hand-written backfill silently —
diff before replacing.

**External services.** None. No model call is added by any phase (R2 edits prose by hand; R5
re-runs an existing turn).

**Concurrent work on this repo.** `feature/nina-instructor-character` (in progress) and
`feature/nina-chat-avatar-profile` both state **no migration**, so `0010` is uncontested. Both
touch `components/nina/` — `nina-chat-avatar-profile` has already landed an `avatar` prop through
`ChatScreen` → `MessageList` → `TypingIndicator` on `origin/main` — so phases 3 and 4 should expect
merge-time conflicts in `ChatScreen.tsx`, not planning-time ones.

---

## Reference List

Every site that touches the thing being changed.

| Symbol / key | File:line | Kind | Package |
|---|---|---|---|
| `ninaMessageImages` | `lib/db/schema.ts:1031` | def | `lib/db` |
| `NinaImageInsert` | `lib/nina/queries.ts` (§5) | def | `lib/nina` |
| `imageColumns` | `lib/nina/queries.ts:503` | def | `lib/nina` |
| `insertNinaMessageImages` | `lib/nina/queries.ts:1449` | def | `lib/nina` |
| `insertNinaMessageImages` | `lib/nina/actions.ts:534` (uploads), `:564` (**attach copy**) | call | `lib/nina` |
| `insertNinaMessageImages` | `lib/nina/imagerun.ts`, `lib/admin/chatPhotoActions.ts` | call | `lib/nina`, `lib/admin` |
| `resolveAttachment` | `lib/nina/actions.ts:183` | def | `lib/nina` |
| `listNinaMessageImages` | `lib/nina/queries.ts:1491` | def | `lib/nina` |
| `listNinaMessageImages` | `app/nina/about/page.tsx:61` | call (**Media**) | `app` |
| `generatedChatPhotoScope` | `lib/nina/queries.ts:1577` | def | `lib/nina` |
| `listNinaChatPhotos` | `lib/nina/queries.ts:1603` | def | `lib/nina` |
| `listNinaChatPhotos` | `app/admin/photos/page.tsx:78` | call | `app` |
| `countNinaChatPhotos` | `lib/nina/queries.ts:1637` | def + `/admin` hub call | `lib/nina`, `app` |
| `getNinaMessageImage` | `lib/nina/queries.ts:1517` | def | `lib/nina` |
| `getNinaMessageImagesForMessages` | `lib/nina/queries.ts` | def; called by `messageActions.ts` | `lib/nina` |
| `galleryPhotos` | `lib/nina/album.ts:304` | def | `lib/nina` |
| `photoSideOf` / `NINA_SIDE_LABEL` | `lib/nina/album.ts:146` | def | `lib/nina` |
| `ChatPhotoDetail` "What she can see in it" | `components/admin/ChatPhotoDetail.tsx:157` | render | `components/admin` |
| `ChatPhotoControls` | `components/admin/ChatPhotoControls.tsx` | render + action calls | `components/admin` |
| `replaceChatPhotoAction` / `addChatPhotoAction` / `removeChatPhotoAction` | `lib/admin/chatPhotoActions.ts:106,175,266` | def | `lib/admin` |
| `chatPhotoAddSchema` / `chatPhotoReplaceSchema` / `chatPhotoRemoveSchema` | `lib/admin/chatPhotoSchema.ts:52,60,71` | def | `lib/admin` |
| `ChatPhoto` | `components/admin/chatPhotoModel.ts` | def | `components/admin` |
| `decideMessageActionSwipe` / `MESSAGE_ACTION_EDGE_GUARD_PX` | `lib/nina/edit.ts:333,276` | def | `lib/nina` |
| `decideReplySwipe` | `lib/nina/reply.ts` | def | `lib/nina` |
| `canActOnMessage` / `planMessageEdit` / `editCapFor` | `lib/nina/edit.ts:106,146,66` | def | `lib/nina` |
| `applyMessageEdit` / `applyMessageDeletion` | `lib/nina/edit.ts:209,239` | def | `lib/nina` |
| `MessageBubble` gesture block | `components/nina/MessageBubble.tsx:185-231` | render | `components/nina` |
| `MessageActionsSheet` | `components/nina/MessageActionsSheet.tsx:54` | render | `components/nina` |
| `handleRequestActions` / `handleEditMessage` / `handleDeleteMessage` | `components/nina/ChatScreen.tsx:734,765,798` | call | `components/nina` |
| `editNinaMessage` / `removeNinaMessage` | `lib/nina/messageActions.ts` | def | `lib/nina` |
| `startNinaBackgroundTurn` / `NinaBackgroundTurnInput` | `lib/nina/actions.ts:681,695` | def (private) | `lib/nina` |
| `openNinaChatTurn` / `sweepStaleNinaChatTurns` / `closeNinaChatTurn` | `lib/nina/queries.ts` (§ turns) | def | `lib/nina` |
| `pollNinaReply` | `lib/nina/actions.ts:1080` | def | `lib/nina` |
| `cursorRef` / `awaiting` / poll loop | `components/nina/ChatScreen.tsx:291,278,905-940` | state | `components/nina` |
| `drizzle/0009_nina_message_photo_only.sql` | whole file | migration precedent | `drizzle` |

---

## Impact Points (files that WILL need changes)

1. `lib/db/schema.ts` — provenance columns on `ninaMessageImages` — **phase 1**
2. `drizzle/0010_*.sql` + `drizzle/meta` — the migration and its hand-written backfill — **phase 1**
3. `lib/nina/queries.ts` — `imageColumns`, `NinaImageInsert`, `insertNinaMessageImages`,
   `listNinaMessageImages`, `generatedChatPhotoScope`, `countNinaChatPhotos` — **phase 1**;
   one UPDATE statement for the description — **phase 2**
4. `lib/nina/actions.ts` — `resolveAttachment` returns provenance; the attach INSERT carries it —
   **phase 1**; `resendNinaMessage` — **phase 4**
5. `lib/admin/chatPhotoSchema.ts` — a zod schema for the description edit — **phase 2**
6. `lib/admin/chatPhotoActions.ts` — `editChatPhotoDescriptionAction` — **phase 2**
7. `components/admin/ChatPhotoDetail.tsx` — the field becomes an editable control — **phase 2**
8. `components/admin/chatPhotoModel.ts` — only if provenance is surfaced (**phase 1**, optional) or
   the description edit needs a callback (**phase 2**)
9. `lib/nina/edit.ts` — a tap decision function — **phase 3**; the Resend gate — **phase 4**
10. `components/nina/MessageBubble.tsx` — the tap/click opener — **phase 3**
11. `components/nina/MessageActionsSheet.tsx` — a Resend item — **phase 4**
12. `components/nina/ChatScreen.tsx` — nothing for phase 3 beyond what `handleRequestActions`
    already provides; a resend handler that sets `awaiting` — **phase 4**
13. `tests/` — `nina.edit.test.ts` (or a sibling) for the tap decision and the resend gate;
    query-level tests for the listing filters; an admin action test for the description edit —
    **every phase**

**This document describes. The plan files prescribe.**
