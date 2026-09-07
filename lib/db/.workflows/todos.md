# Todos: db

**Package Path**: `lib/db`
**Package Code**: DB
**Last Updated**: 2026-09-07
**Total Active Tasks**: 1

## Quick Stats
- P0 Critical: 0
- P1 High: 1
- P2 Medium: 0
- P3 Low: 0
- P4 Backlog: 0
- Blocked: 0
- Completed: 3

---

## Active Tasks

### [P1] High

- [ ] **P1-DB-A002** Phase 2: The carrier marker: a photo bubble free text cannot hide
  - **Difficulty**: NORMAL
  - **Type**: Feature
  - **Context**: The schema half, shippable and behaviour-neutral on its own — **no caption text changes in this phase at all**. Spans four packages and is filed here because the generated migration is its irreversible half: `lib/db` (a generated migration adding `nina_messages.photo_only boolean NOT NULL DEFAULT false` plus a backfill of the rows that are carriers under today's rule, and `lib/db/schema.ts` carrying the column with the argument for it beside the `source` docstring explaining why it is not a sixth `NinaMessageSource`); `lib/nina` (`queries.ts` — `NinaMessageInsert.photoOnly`, `messageColumns`/`NinaMessageRow`; `imagerun.ts` — `finishSelfie` sets `photoOnly: true`); `lib/admin` (`chatPhotos.ts` — `isNinaPhotoCarrierMessage` reads the marker, with the caption-array test kept as the **legacy** clause for pre-migration rows; `chatPhotoActions.ts` — `addChatPhotoAction` sets `photoOnly: true`); and `scripts` (`nina-image-worker.ts`'s raw `INSERT` sets `photo_only = true`). Plus `tests/admin.chatPhotos.test.ts`. Does not touch `lib/nina/imagefail.ts`, `caption.ts`, `vision.ts` or `prompts/*`. Exit: `npm run db:generate` produced the migration (not hand-written); `npm run db:check` passes; `isNinaPhotoCarrierMessage` returns `true` for a marked message with any text whatsoever, `true` for an unmarked legacy message whose text is one of the five, and `false` for a `role: 'runner'` message however marked; remove still deletes the message when the last photo goes, for a message carrying free text. **Merge hazard:** `nina-job-redo-and-soft-delete` is in flight from the same base `f839116` and both sets mint `0008` — whoever merges second deletes this branch's `0008_*.sql` and re-runs `db:generate` against the merged `schema.ts`. Never rename a migration; `when` is the ordering key and a renamed entry is skipped silently.
  - **Status**: pending
  - **Plan Set**: `NINA_PHOTO_CAPTION_FROM_IMAGE_PLAN.md` (phase 2 of 4)
  - **Satisfies**: R1 — A photo added to the Chat photos collection must arrive with a chat message that says something true about **that** photograph; R2 — "can we make llm understand multi modal?" — every path that posts a photo of hers captions it from what is in the picture, not only the admin one
  - **Plan**: `.workflows/plan/P1-DB-A002.md`

---

## Completed Tasks

### [P1] High

- [x] **P1-DB-A003** Phase 1: A re-attached photo is a reference, not a copy
  - **Difficulty**: HARD
  - **Type**: Bug
  - **Context**: Owns `ninaMessageImages`'s two new provenance columns (`source_avatar_id` -> `nina_avatars(id)`, `source_image_id` -> `nina_message_images(id)`, both nullable, `ON DELETE SET NULL`) and `drizzle/0010_*` (generated `ALTER TABLE` plus a hand-written backfill, on `0009`'s precedent); `imageColumns`; `NinaImageInsert`; `insertNinaMessageImages`; `resolveAttachment`'s return type and the attach INSERT in `sendNinaMessage`; the reference filter in `listNinaMessageImages`, `generatedChatPhotoScope` and `countNinaChatPhotos`. Does not touch any message read used to render a bubble (invariant 2), `components/nina/`, `lib/admin/chatPhotoActions.ts`, `components/admin/ChatPhotoDetail.tsx`, `components/admin/chatPhotoModel.ts`, `app/admin/photos/page.tsx` (all phase 2's, per D8), or anything in phases 3 and 4. Exit: attaching an album face or re-attaching a chat photo leaves `countNinaChatPhotos` unchanged and adds nothing to `galleryPhotos`'s input, while the photo still renders in the bubble and its description still reaches the turn; the backfill marks production's existing duplicates; `npm run db:generate` produces exactly one new file and the meta journal matches it. Hazard D12: `drizzle/0010` is also claimed by the concurrent `nina-image-generation-tab` set - keep `0010`, and whichever set lands second REGENERATES rather than renames (a renamed migration keeps the old `when`, drops below the applied watermark and is skipped in silence), then diffs the discarded file against the new one and re-applies the hand-written backfill by hand.
  - **Status**: completed
  - **Plan Set**: `NINA_PHOTO_REFS_AND_BUBBLE_ACTIONS_PLAN.md` (phase 1 of 4)
  - **Satisfies**: R1 — a re-attached photo must not appear as a duplicate in admin Chat photos; R3 — a photo attached from Nina's profile-picture album must not be added to Media
  - **Plan**: `.workflows/plan/P1-DB-A003.md`
  - **Card**: `miftahulmahfuzh/run-insights#129`
  - **Completed**: 2026-09-07 17:59
  - **Method**: /do (swarm phase 1 of 4)
  - **Files**: lib/db/schema.ts, drizzle/0010_nina_image_provenance.sql, drizzle/meta/0010_snapshot.json, drizzle/meta/_journal.json, lib/nina/attach.ts, lib/nina/queries.ts, lib/nina/actions.ts, tests/nina.photoRefs.test.ts, tests/nina.attach.test.ts, tests/db.schema.nina.test.ts
  - **Notes**: Migration `0010` generated first, then a two-statement hand-written backfill appended below a `--> statement-breakpoint` (on `0009_nina_message_photo_only`'s precedent) to mark production's existing duplicates. `npm run db:check` reports "Everything's fine". `ON DELETE SET NULL` on both FKs is deliberate: when the original is deleted the copy stops being a copy and the collection keeps the picture rather than losing it. `ninaPhotoProvenance()` flattens, so a copy of a copy points at the *original* and deleting the middle row cannot resurrect a duplicate. The reference filter `isOriginalPhoto()` has **two call sites covering three reads** — the WHERE of `listNinaMessageImages` and the `and(...)` of `generatedChatPhotoScope`, which `listNinaChatPhotos` and `countNinaChatPhotos` both inherit and which are therefore not edited. `tests/nina.photoRefs.test.ts` asserts against generated SQL that the four bubble/context/reaper reads (`getNinaMessageImagesForMessages`, `getNinaMessageImage`, the gateway reads, `isBlobPathnameReferenced`) do **not** carry the filter — an absence assertion, because a later "consistency" cleanup adding it there would blank a photograph inside a live conversation. Verified: `npm run lint` 0 errors (2 pre-existing warnings in `scripts/capture/shoot.mjs`, untouched), `npm run typecheck` clean, `npx vitest run` 152 files / 3057 tests passing, `npm run db:check` clean, all phase-1 paths `prettier --check` clean. Production read-only counts taken before any migrate: 0 chat-to-chat duplicates, **2** album faces attached into chat, 5 rows in the collection, 21 album rows — the 2 are exactly the duplicates reported in prod admin.
  - **Decided**:
    - Step 3's task creation was limited to phase 1 alone: peers p2/p3 were live and minting from the same package counters would collide silently.
    - The TaskID was **not** written back into the tracked orchestration `PLAN.md` — it is reported to the coordinator over the swarm ledger instead, because that index is shared by three concurrent sessions and read-modify-write from all three stalls one.
    - `lib/nina/queries.ts` carries phase 1's ten hunks only; phase 2's `updateNinaChatPhotoDescription` in the same file is phase 2's to commit. Per-phase revert is a published property of this plan set's Rollback section.
    - The plan's pre-migrate abort gate ("stop if the R3 count is anywhere near the collection total") was assessed and **not** tripped: 2 of 5 looks like a large fraction only because the table is tiny, the gate's stated failure mode is a *bulk* `blob_url` collision, and 0 chat-to-chat duplicates contradicts that reading. The 2 rows are precisely the defect the user reported.
    - `npm run db:migrate` was deliberately **not** run. Applying a migration with an irreversible hand-written backfill to production is outside what implementing a phase authorises, and the plan files those checks under "Manual check".


- [x] **P1-DB-A001** Phase 1: Session data layer: schema, migration, backfill, scoped queries
  - **Difficulty**: HARD
  - **Type**: Feature
  - **Context**: Owns `lib/db/schema.ts` (the new `ninaChatSessions` table, `nina_messages.session_id` and the indexes both need); `drizzle/0004_*.sql` plus `drizzle/meta/`; `lib/nina/queries.ts` §4, where every message read and write gains a session parameter alongside session CRUD and the list query; and a new pure `lib/nina/sessions.ts` for the ordering and title-fallback rules with tests — including `NINA_SESSION_TITLE_MAX_CHARS = 60`, the set's one and only title cap, the `sessionTitleFor` fallback phase 5 renders rather than `session.title`, and `pinnedAt: Date | null` as an instant rather than a boolean. `session_id` is `NOT NULL` (D1) with `ON DELETE CASCADE` (R11), the sort key is derived at read time with no stored column (D3), and pins partition rather than sort (D4). Signatures widen with a defaulted or optional session parameter so the tree still compiles and existing callers keep working; phase 3 then makes them required. The backfill is the risk and is not optional: every existing row must end up in exactly one session per user, in `seq` order, under a deterministic placeholder title rather than an LLM call from a migration. Exit criteria: `npm run db:check` passes; the migration applies to a copy of production and `SELECT count(*) FROM nina_messages WHERE session_id IS NULL` is 0; `listNinaSessions` returns pinned-first then most-recent-user-message-descending, asserted by a unit test on the pure ordering rule; deleting a session row leaves no orphaned `nina_messages` and no orphaned `nina_message_images` (R11); the existing suite is green with no caller changed.
  - **Status**: completed
  - **Plan Set**: `NINA_CHAT_SESSIONS_PLAN.md` (phase 1 of 9)
  - **Satisfies**: R2, R4, R5, R11 — R2: Chat sessions: create a new one, or return to a previous conversation through a session-history list; R4: Pin sessions to the top; R5: Sort sessions by the most recent **user** message, newest first; R11: Remove a session
  - **Depends on**: —
  - **Plan**: `.workflows/plan/P1-DB-A001.md`
  - **Card**: `miftahulmahfuzh/run-insights#78`
  - **Completed**: 2026-09-05 03:26
  - **Method**: /implement (swarm phase 1 of 9)
  - **Commit**: `7a89066`
  - **Files**: lib/db/schema.ts, lib/nina/queries.ts, lib/nina/sessions.ts, lib/nina/sessions.test.ts, tests/db.schema.nina.test.ts, drizzle/0004_nina_chat_sessions.sql, drizzle/meta/0004_snapshot.json, drizzle/meta/_journal.json
  - **Notes**: Migration `0004` generated then hand-edited where generation cannot help — drizzle emits `ADD COLUMN ... NOT NULL`, which fails on a populated table, so the file adds the column nullable, backfills one session per user (`substr(md5(user_id),1,12)`, `created_at = min(sent_at)`, title `'Semua chat sebelumnya'`, `title_source = 'backfill'`), then `SET NOT NULL`. No `ON CONFLICT DO NOTHING` on that insert, deliberately: on an md5-prefix collision it would file the second user's messages into the first user's session. **Verified against a throwaway Postgres 16** (0000-0003 applied, three users — one with no messages — interleaved roles, image rows, a memory fact, a cross-session quote): 0 NULL `session_id`, one session per user with messages, no cross-user filing, cascade left 0 orphaned `nina_messages`/`nina_message_images`, the cross-session quote survived with `reply_to_id` NULL, the `nina_memory_facts` row survived with a deliberately dangling `source_message_id`, `Index Only Scan` on `nina_messages_user_session_runner_idx` and `Index Scan Backward` on `nina_messages_session_seq_idx`, and a session-less INSERT is rejected. **Not applied to production — that is a deploy action** and remains open. `lib/nina/queries.ts` is shared with phases 3 and 7 (§4c is a named seam for phase 7's `updateNinaMessage`/`deleteNinaMessage`); three plan-verbatim lines were reflowed by Prettier (cosmetic).


- [x] **P1-DB-A000** Phase 1: Folder metadata on `nina_avatars`, and the folder-aware data layer
  - **Difficulty**: NORMAL
  - **Type**: Feature
  - **Context**: Owns five new columns on `ninaAvatars` (`folder`, `filename`, `source_key`, `thumb_url`, `thumb_pathname`) plus `nina_avatars_user_folder_created_idx` and the UNIQUE `nina_avatars_user_source_key_unq`; the new `nina_folders` table; `drizzle/0003_nina_avatar_folders.sql` and its meta snapshot/journal; nine statements in `lib/nina/queries.ts` (folder-scoped page, subtree manifest, distinct-folder listing, album count, plain batch insert, bulk move/rename/recursive-delete/bulk-delete) plus `declareNinaFolders`/`renameNinaFolderSubtree`/`deleteNinaFolderSubtree`; the thumbnail cap/pathname builder/predicate in `lib/admin/avatars.ts`; the three new caps in `lib/nina/album.ts`; and `app/admin/page.tsx` switching to `countNinaAvatars`. Exit criteria: `npm run db:generate` produces exactly one additive migration; `db:check`, `typecheck`, `test` green; `is_current` has exactly three writers in `lib/nina/queries.ts`; `/admin/nina` renders exactly as today; `/admin`'s album card renders the same sentence from a `count(*)`.
  - **Status**: completed
  - **Plan Set**: `ADMIN_ALBUM_FILE_MANAGER_PLAN.md` (phase 1 of 7)
  - **Satisfies**: R1 — `/admin/nina` becomes a file manager: nested folders, folder upload by picker and by drag-and-drop from Windows Explorer, uploading only what is new, image files only, and an explorer view where clicking a photo lets you set it as her profile picture
  - **Depends on**: —
  - **Plan**: `.workflows/plan/P1-DB-A000.md`
  - **Card**: `#66`
  - **Completed**: 2026-09-04 16:46
  - **Method**: /do
  - **Files**: lib/db/schema.ts, drizzle/0003_nina_avatar_folders.sql, drizzle/meta/0003_snapshot.json, drizzle/meta/_journal.json, lib/nina/album.ts, lib/admin/avatars.ts, lib/nina/queries.ts, app/admin/page.tsx, tests/admin.avatars.test.ts, tests/db.schema.nina.test.ts
  - **Notes**: Migration generated and `db:check`-clean, but **not applied** — applying it is a deploy action. Verification check 5 (the `nina_folders` UNION probe against a live database) must run at deploy time. `lib/nina/queries.ts` is shared with phase 3 (`getNinaMessageImage` in §6).
