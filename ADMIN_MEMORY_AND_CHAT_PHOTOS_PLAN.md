# Plan: One memory table, and Nina's chat photographs in `/admin`

**Slug:** `admin-memory-and-chat-photos`
**Date:** 2026-09-05 04:54 (Asia/Jakarta)
**Analysis:** `20260905-045430-M7Q2_code_analyzer.md`
**Worktree:** `/home/miftah/.worktrees/run-insights/admin-memory-and-chat-photos`
**Branch:** `feature/admin-memory-and-chat-photos` (base: `origin/main` @ `7cec803`)
**Phases:** 3
**Status:** complete — 3/3 phases landed (1, 2, 3), reconciled 2026-09-05 (round 1), merged to `main`
**Coordinator:** —
**Cards:** R1 #89 · R2 #90 (phases: #91, #92) · bugs found while planning: #93, #94

---

## Why

The user's words, verbatim, because they are the specification:

> 1.in admin page, revamp the ui ux for memory editing. make it much simpler. when i delete or edit a memory, do not ask for any confirmation whatsoever. i am the only one using this app, no need for all these bullshit confirmation. just make all the memory to show as one simple table. i can easily edit, add or remove one row easily
>
> 2.make sure all the photos in in user chat collection with nina (nina generated images) are shown in admin page as well. just put them into a folder or something, user can replace a photo in there with a new photo, or add a new photo (so it is like nina generated them, but actually it is manually added by user) or remove a photo

Four phrases are load-bearing and are quoted again in the phases that own them:

- *"do not ask for any confirmation whatsoever"* and *"i am the only one using this app"* — the
  rationale is the licence. Every two-step flow on `/admin/memory` exists in the code today
  **because a second reader was imagined**. There is one reader and he has ruled. Phase 1 deletes
  `purgeFactAction`'s typed-`PURGE` gate, `retractFactAction`'s append-then-delete pair and
  `retireSlotAction`'s panel, and it deletes them rather than hiding them behind a flag.
- *"one simple table … edit, add or remove one row"* — one `<table>`, not three card grids. Phase 1.
- *"nina generated images"* — `nina_message_images WHERE kind = 'generated'`, which is a different
  table from `/admin/nina`'s album and includes rows hanging off **runner** messages (the
  re-attach path). Phases 2 and 3.
- *"so it is like nina generated them, but actually it is manually added by user"* — a literal
  specification of the storage shape: what phase 3 writes must be indistinguishable from what
  `scripts/nina-image-worker.ts:427`'s `finishSelfie` writes, which is a `nina_messages` pair and
  not a lone image row.

## Requirements

| ID | What the user asked for | Phases |
|---|---|---|
| R1 (#89) | Revamp `/admin`'s memory editing: much simpler, **one simple table** for all the memory, easy edit / add / remove of a single row, and **no confirmation of any kind** on delete or edit | 1 |
| R2 (#90) | Every Nina-generated photograph in the chat collection is also shown in the admin page, in a folder or similar, where the user can **replace** a photo with a new one, **add** a new photo (which then reads as if Nina generated it), or **remove** a photo | 2, 3 |

Every phase serves exactly one R.

## Scope

**In scope**
- `/admin/memory`: the page, its two client components, its nine Server Actions, its Zod schemas,
  its pure model module and its test suite.
- A new admin route for Nina's chat photographs, its read query, its grid, and its three
  mutations; the admin upload handshake gaining a third accepted pathname shape.

**Out of scope, and why**
- **`/admin/nina` and `nina_avatars`.** A different table with a different purpose (her profile
  picture) and a file manager that already works. R2 is about the *chat* collection. Touching the
  explorer would put phases 2 and 3 in a file the album's seven-phase set just finished settling.
- **The runner-facing surfaces.** `app/nina/page.tsx`, `app/nina/about/page.tsx`,
  `lib/nina/chatphotos.ts` and `PhotoViewer` read the rows this plan writes and must keep working
  unchanged — that is an invariant below, not a work item.
- **The generation worker.** `scripts/nina-image-worker.ts` is read as the shape to imitate and is
  not edited.
- **Any migration.** No column is added to any table in this plan. `nina_message_images` gets no
  `folder` column: the collection R2 asks for is one bucket, and a folder grammar for a set the
  user described as "a folder or something" would be a migration plus a second path vocabulary for
  no asked-for gain.
- **The distiller.** `lib/nina/distill.ts` writes memory rows and is unaffected by how the admin
  page renders them. The one contract it depends on — `source = 'admin'` means "do not overwrite"
  — is preserved by phase 1 and is an invariant below.

## Invariants

Every phase must hold all of these. They are checkable, not felt.

1. **The tree builds and the suite passes at the end of each phase.** `npm ci` first — the
   worktree has no `node_modules` — then `npm run lint`, **`npm run typecheck`**, `npm test`, and
   the `ci:*` guards. It must be `npm run typecheck` (`next typegen && tsc --noEmit`) and never a
   bare `npx tsc --noEmit`: `PageProps<'/admin/photos'>` does not typecheck until typegen has seen
   the new route, so a bare `tsc` would fail phase 2 for a reason that is not a defect.
2. **`requireAdmin()` is the first statement** of every new page, route handler and Server Action,
   above any use of an argument. `proxy.ts` matches neither `/admin` nor `/api/*`
   (`lib/admin/requireAdmin.ts:13-16`), so these calls are the only gate.
3. **Every write is scoped by `userId` first** (invariant 7 of the roadmap). No query added by this
   plan may reach a row without an equality on `user_id`.
4. **Zod at every boundary.** A Server Action parses its input before touching a store. The client
   is not a source of truth — this survives the confirmation purge untouched, because validation is
   not confirmation.
5. **`source = 'admin'` still means "the distiller defers to this".** Phase 1 may change which
   rows carry that label and when, but not what it means to `lib/nina/distill.ts`.
6. **Invariant 5 of the Nina set holds:** `nina_message_images.description` is `glm-4.6v`'s private
   prose whose only consumer is Nina's prompt. `/admin` may display it; nothing it renders may
   reach a runner-facing caption.
7. **A photograph added or replaced by phase 3 is indistinguishable downstream from a generated
   one.** `photoSideOf`, `chatViewerPhotos`, `galleryPhotos` and the chat bubble renderer must all
   treat it as hers, with no new `kind`, no new `source`, and no admin marker in any runner-facing
   surface.
8. **No orphaned blobs — but never a deleted-but-referenced one.** Any path that stops
   referencing a Blob object deletes it in the same action, **unless another row still points at
   it**. `resolveAttachment` (`lib/nina/actions.ts:143-192`) copies `blob_url`/`pathname` onto a new
   row without copying bytes, so one object can be referenced by several `nina_message_images` rows
   **and** by a `nina_avatars` row. A remove or replace must check both tables for a surviving
   reference before calling `del()`. Where the two rules conflict, correctness wins: an orphan costs
   storage, a deleted-but-referenced object is visible data loss. `reap-orphaned-blobs` is the
   backstop for the orphans this deliberately leaves.
9. **No `NEXT_PUBLIC_` for a server secret**, and `scripts/check-client-secret-boundary.mjs` stays
   green — including its Rule 3, which exempts only lines a comment scanner recognises (hence the
   leading `*` on JSX comment continuation lines).
10. **No new database migration.** If a phase concludes it needs one, it stops and says so in Open
    Questions rather than writing DDL.

## Phases

| # | Title | Satisfies | Package | Files | Depends on | Difficulty | Plan | TaskID | Card |
|---|-------|-----------|---------|-------|-----------|------------|------|--------|------|
| 1 ✅ | One memory table, zero confirmations | R1 | `app/admin/memory`, `components/admin`, `lib/admin` | 10 | — | NORMAL | `.workflows/plan/admin-memory-and-chat-photos/phase-1.md` | — | #89 |
| 2 ✅ | Her chat photographs, listed in `/admin` | R2 | `app/admin/photos`, `components/admin`, `lib/nina` | 8 | — | NORMAL | `.workflows/plan/admin-memory-and-chat-photos/phase-2.md` | — | #91 |
| 3 ✅ | Replace, add, remove | R2 | `lib/admin`, `app/api/admin`, `components/admin` | 10 | 2 | HARD | `.workflows/plan/admin-memory-and-chat-photos/phase-3.md` | — | #92 |

**Phases 1 and 2 share no file and run concurrently.** That is the reason phase 3's Zod schemas go
in a new `lib/admin/chatPhotoSchema.ts` rather than into `lib/admin/schema.ts`: phase 1 deletes
three schemas from that file and reshapes four more, and a concurrent phase 3 appending to it would
be two sessions writing one file in one shared worktree. The split is defensible on its own terms
too — `lib/admin/schema.ts`'s docstring scopes it to *"everything `/admin/nina` accepts from a
browser"*, and `/admin/photos` is not `/admin/nina`.

### Phase 1 — One memory table, zero confirmations
**Satisfies:** R1
**Owns:** `app/admin/memory/page.tsx`; the deletion of `components/admin/MemoryLedger.tsx` and
`components/admin/MemorySlots.tsx`; a new `components/admin/MemoryTable.tsx`;
`lib/admin/memoryActions.ts`, `lib/admin/memoryModel.ts`, `lib/admin/memoryStore.ts`,
`lib/admin/memoryVocab.ts` where the row model requires it; the memory half of
`lib/admin/schema.ts`; `tests/admin.memory.test.ts`.
**Does not touch:** `lib/nina/**` (except as a read), `app/admin/page.tsx`,
`components/admin/AdminNav.tsx`, anything under `components/admin/explorer/`, and
`lib/admin/schema.ts`'s avatar/album section.
**Exit criteria:** `/admin/memory` renders one table containing slots, ledger rows and pending
promises. A cell edit saves with no second click. A row's delete control removes the row with no
prompt, no typed string and no panel. A new row can be added from within the table. No component
under **`components/admin/Memory*`** retains a `mode`/`confirming` state whose only job is a
second click. **Scoped at reconciliation (R-A):** the criterion does NOT reach `FolderMenu.tsx`,
whose `mode` union picks *which* operation the menu performs and is not a confirmation step.
`ADMIN_PURGE_CONFIRMATION`, `isPurgeConfirmed`, `composeRetraction` and `composeSlotRetirement` are
gone from the repo, along with their tests and their Zod schemas.

### Phase 2 — Her chat photographs, listed in `/admin`
**Satisfies:** R2
**Owns:** a paginated `listNinaChatPhotos` + count in `lib/nina/queries.ts`; a new
`app/admin/photos/page.tsx`; new `components/admin/ChatPhotoGrid.tsx` and its model module; the
fourth link in `components/admin/AdminNav.tsx`; a new card in `app/admin/page.tsx` (which has two
today, so this is the third); and — **approved at reconciliation (R-C)** —
`NINA_CHAT_PHOTO_PAGE_SIZE` appended to `lib/nina/album.ts`, the home of every other Nina photo cap
and a file no other phase touches. The surface is split into `components/admin/ChatPhotoGrid.tsx`
and `components/admin/ChatPhotoDetail.tsx`; **phase 3 edits both**.
**Does not touch:** any mutation, any Server Action, the upload route, `lib/admin/schema.ts`,
`app/admin/memory/**`, `components/admin/Memory*`, `lib/admin/memory*`.
**Exit criteria:** `/admin/photos` lists every `kind = 'generated'` row for the user, newest first,
paginated, reachable from the nav and the hub. The listing includes rows attached to **runner**
messages (the re-attach path), so it cannot disagree with `/nina/about`'s gallery. Read-only: the
page renders no control that writes.

### Phase 3 — Replace, add, remove
**Satisfies:** R2
**Owns:** a new `lib/admin/chatPhotos.ts` (pure: ids, pathnames, content types, byte ceilings) and
`lib/admin/chatPhotoSchema.ts` (Zod); a new `lib/admin/chatPhotoActions.ts` with the three
mutations; the chat-photo pathname branch in `app/api/admin/nina/upload/route.ts`; the write
queries phase 3 needs in `lib/nina/queries.ts`; the three controls wired into phase 2's
`ChatPhotoGrid.tsx` **and `ChatPhotoDetail.tsx`** (reconciled — phase 3 originally named only the
grid); a new `tests/admin.chatPhotos.test.ts`.
**Does not touch:** `scripts/nina-image-worker.ts`, `lib/nina/images.ts` (read-only — its header
forbids adding an import and three runtime hosts depend on that), `app/admin/memory/**`,
`lib/admin/memory*`, `lib/admin/schema.ts`, anything under `components/admin/explorer/`.
**Exit criteria:** replace swaps the bytes behind an existing row, keeps the row, its message, its
`created_at` and its place in the conversation, and deletes the old Blob object **when no other
row references it** (invariant 8). Add mints the
`nina_messages` + `nina_message_images` pair `finishSelfie` writes, so the photo appears in the
runner's chat and in `/nina/about`'s gallery on her side with no admin marker. Remove deletes the
row, deletes its Blob object only when nothing else references it, and resolves the empty-bubble
question stated below. No confirmation on
any of the three — R1's ruling is a property of this admin surface, not of one page.

## Reconciliation Log

One round, 2026-09-05. The three planners worked in parallel and could not see each other's output;
phase 3's plan was written while `.workflows/plan/admin-memory-and-chat-photos/` was still empty, so
every claim it made about phase 2 was an assumption until checked here.

| Conflict | Phases | Resolution |
|---|---|---|
| Phase 3 built its blob paths on `ninaChatPathname` (`nina/<u>/chat/<id>.jpg`), which is **his upload** shape, not hers | 3 | Corrected mid-flight. Her generated blobs are `nina/<u>/selfie-<id>.png` via `ninaImagePathname` (`lib/nina/imagerecipe.ts:126`). Phase 3 now defines its own `adminChatPhotoPathname` / `isAdminChatPhotoPathname` and drops every `NINA_CHAT_*` constant |
| `del()` called unconditionally when a row is removed | 3 | **Invariant 8 rewritten.** `resolveAttachment` copies `blob_url`/`pathname` without copying bytes, so one object can be referenced by several `nina_message_images` rows *and* by a `nina_avatars` row. Phase 3 adds `isBlobPathnameReferenced` (both tables, `user_id`-scoped) and `releaseChatPhotoBlob` as its single `del()` caller |
| Collision on `lib/nina/queries.ts` — both phases 2 and 3 append, and phase 3 also edits the `drizzle-orm` import line to add `or` | 2, 3 | Sequenced by `Depends on: 2`. Phase 3 quotes the file as it looks *after* phase 2, and its block opens with its own `§5b` banner so the two additions cannot interleave |
| Phase 3's Files table named only `ChatPhotoGrid.tsx`; phase 2 split the surface in two | 2, 3 | Phase 3's file list now names `ChatPhotoDetail.tsx` too — its action stack is where Replace and Remove land. Both plans and the phase-3 OWNS line above updated |
| `userId` needed by phase 3's upload handshake, not in phase 2's original component signature | 2, 3 | Phase 2's `ChatPhotoGrid` and `ChatPhotoDetail` both take `userId: string`, threaded from the server page and rendered nowhere — `app/admin/nina/page.tsx:57-59`'s own `shareOrigin` pattern. A client-side session read was explicitly rejected: a user id that reaches a Blob pathname must come from the server |
| `onRemoved` was dead in phase 2 and marked `void onRemoved` | 2, 3 | It has a caller from the moment phase 3 lands. Phase 3's remove returns a `note` (*"still used elsewhere, so it was kept in the store"*) whose only phase-3 render site is inside a rail that unmounts the instant the row leaves the RSC payload. `onRemoved` now carries the note up to the grid's `notice` line |
| Phase 3 chose JPEG where the worker writes PNG | 3 | **Approved.** PNG is the worker's *environment* (no `sharp` on the runner), not the collection's format; re-encoding an operator's JPEG to lossless PNG inflates it 5–20× into the one table `/nina/about` downloads whole. `NINA_IMAGE_PATHNAME_RE` already admits `.jpg` |
| Consequence of the above: the collection becomes mixed-container | 2, 3 | Phase 3's assumption A8, landed on phase 2 after the fact. Nothing in either phase may infer a container or MIME type from the `selfie-` prefix; phase 2's pathname handling checked and fixed |
| Phase 2 appended a const to `lib/nina/album.ts`, outside its stated OWNS | 2 | **Approved (R-C).** Every other Nina photo cap lives there and no other phase touches the file. Added to phase 2's OWNS |
| Phase 1's exit criterion read as reaching `FolderMenu.tsx` | 1 | **Scoped (R-A)** to `components/admin/Memory*`. `FolderMenu`'s `mode` picks *which* operation, not a second click |
| Two docstrings cite the deleted `MemoryLedger.tsx` | 1 | Adopted as phase 1 Step 7b — the last phase that referenced the symbol owns its removal |
| `updateNinaMemoryFact` left unreferenced by phase 1 | 1 | **Deliberately not deleted (R-B):** phases 2 and 3 edit `lib/nina/queries.ts`, and a delete there would be a third writer. Recorded as known-dead below |
| Index said `npx tsc --noEmit` | all | Invariant 1 now says `npm run typecheck`; a bare `tsc` fails phase 2 before typegen has seen `/admin/photos` |
| Index estimated ~6/~7/~9 files | all | Phase table now carries the planners' real counts: 10 / 8 / 10 |

## Open Questions

**Empty.** Nothing survived reconciliation unresolved, and the orchestrator is clear to run.

### Design decisions delegated to the owning phase

These are **not** open questions — each was resolved by the phase that writes the code, and each
is recorded here so no reader re-opens a settled decision.

- **Phase 1 — an edit to a *distilled* ledger row.** It was refused before, because the row points
  at a real chat message via `source_message_id` and rewriting its text makes it misquote that
  message. That is data integrity, not "are you sure". **Resolved:** the edit is allowed and
  re-labels the row `source = 'admin'` with `source_message_id = NULL`, because a sentence the admin
  wrote is no longer a quotation. `factPermissions` is deleted outright rather than loosened —
  with an edit that always re-labels, there is nothing left to branch on.
- **Phase 1 — deleting a slot row.** A slot is a `(user_id, key)` upsert over a closed nine-key
  vocabulary, so "remove the row" is `adminDeleteSlot` and the key immediately reappears as an empty
  row. Visibly correct, not a bug.
- **Phase 1 — cell saves fire on blur, not on a debounce.** Sequential client dispatch plus
  `revalidatePath`'s in-response re-render would make a keystroke debounce a queue of full route
  re-renders.
- **Phase 3 — the pathname shape.** `nina/<userId>/selfie-<id>.jpg`: her prefix and segment, JPEG
  rather than the worker's PNG. Observable only in `/admin`, two server log lines, a store listing
  and the future reaper — never in `photoSideOf`, `chatViewerPhotos`, `galleryPhotos` or the bubble
  renderer, which is what invariant 7 actually demands.
- **Phase 3 — the empty bubble.** Removing the last image from one of *her* caption-carrying
  messages deletes the message too; removing a re-attached photo from a **runner** message does not,
  because that message is his and carries his text.
- **Phase 3 — no session picker on add.** `resolveNinaWriteSession`'s existing policy is used (most
  recently active session, created if none). Inventing a second session policy is the exact thing
  `lib/nina/sessionResolve.ts` exists to prevent.

## Handoffs — out of scope, filed separately

Two **verified production bugs on `main`** found while planning. Neither blocks this plan set and
neither is made worse by it, so they are recorded here rather than in Open Questions — a non-empty
Open Questions blocks the orchestrator, and these do not.

- **BUG-1 — Nina's image generation is broken in production.**
  `scripts/nina-image-worker.ts:433` (`finishSelfie`) and `:539` (the apology) insert into
  `nina_messages` **without `session_id`**, which `drizzle/0004_nina_chat_sessions.sql:34` made
  `NOT NULL` with a foreign key and no default. `grep -n session scripts/nina-image-worker.ts`
  returns nothing, and the worker's own `information_schema` preflight column list (`:147`) omits it
  too. Every generated selfie *and* every apology message should be failing to insert. A regression
  from the `nina-chat-sessions` merge that is `7cec803` — i.e. current `main`. **Urgent, and its own
  card.**
- **BUG-2 — deleting an avatar can blank a chat bubble.** `deleteNinaAvatarAction`
  (`lib/admin/ninaAlbumActions.ts:224-229`) calls `del()` unconditionally on the avatar's `blobUrl`.
  R26's re-attach (`lib/nina/actions.ts:160-172`) copies that exact `blobUrl`/`pathname` onto a
  `nina_message_images` row without copying bytes, so removing a photo from `/admin/nina` can kill
  the image in a chat message that shares it. The function's own comment reasons carefully about
  orphans versus broken images and gets the *thumbnail* case right, but never considers the other
  table. Same class as invariant 8, in a file phase 3 must not touch. The fix is to route it — and
  `lib/nina/messageActions.ts:172`, which logs orphans and deletes no bytes at all — through phase
  3's `isBlobPathnameReferenced` **once phase 3 has landed**. Ordering matters: the card depends on
  this set.

Also recorded, not bugs:

- **Known-dead symbol.** `updateNinaMemoryFact` (`lib/nina/queries.ts:1463`) is unreferenced after
  phase 1 and deliberately not deleted (R-B). Whoever next touches that file may remove it.
- **A deliberate orphan class.** When `releaseChatPhotoBlob` answers `shared` or `failed`, the
  object outlives the row that named it. That is the correct trade under invariant 8.
  `scripts/blob-reap.mjs` is the backstop and still does not know the `nina/` prefix at all — when
  it is taught, `isBlobPathnameReferenced` should be the shared definition rather than a second one.

## Rollback

Per phase: each is a self-contained commit on `feature/admin-memory-and-chat-photos`; `git revert`
the phase's commit. Phase 3 reverts cleanly only if phase 2 stays, since it edits phase 2's
component.

As a whole: the branch is never merged, or `git revert -m 1` the merge. **No migration is written
by this plan** (invariant 10), so a rollback is code-only and no data conversion is needed.

One asymmetry worth stating: phase 3 writes and deletes real Blob objects and real chat rows in
production. Reverting the code does not un-delete a photograph the operator removed. That is
inherent to the requirement, not a defect of the plan.

## Next

Execute the phases one at a time, starting at phase 1:

    /implement -f ADMIN_MEMORY_AND_CHAT_PHOTOS_PLAN.md --phase 1

Or run the whole set as a swarm — a session per phase, concurrent wherever `Depends on` allows,
resumable on any machine:

    /analyze-orchestrator -f ADMIN_MEMORY_AND_CHAT_PHOTOS_PLAN.md

Or put them on the board first (GitHub repos only):

    /create-task --from-plan ADMIN_MEMORY_AND_CHAT_PHOTOS_PLAN.md
