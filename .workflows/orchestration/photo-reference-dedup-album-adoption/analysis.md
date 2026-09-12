# Code Analysis: Photo reference duplicate photos (album-adopted chat photographs)

**Type:** Bug Investigation
**Date:** 2026-09-12 11:58:48
**Session ID:** 20260912-115848-A7F3
**Plan:** `PHOTO_REFERENCE_DEDUP_ALBUM_ADOPTION_PLAN.md` (1 phase)
**Worktree:** `/home/miftah/.worktrees/run-insights/photo-reference-dedup-album-adoption` (branch `feature/photo-reference-dedup-album-adoption`, base `origin/main` @ `78f1a9c`)

---

## User Input

### Original User Request
> admin/image-generation , in Photo reference, why is there duplicate photos? the first 2 are duplicates. make sure the same photo exist in Image Collection-album and Image Collection-album-Media is deduplicated in Photo reference

### User-Provided Context
None beyond the prose above — no logs, no screenshot. "The first 2" refers to the top of the
Photo reference grid, which is sorted newest-first (see `mergeNinaPhotoRefs`), so the claim is
about the two most-recently-created entries.

### User-Provided Files
None — no `@` files in the prompt.

### Requirement IDs

| ID | What the user asked for |
|---|---|
| R1 | Diagnose why the Photo reference picker on `/admin/image-generation` shows duplicate photos (the first two entries are the same photograph), and fix it so that a photograph present in both Image collection's Album view and its Media view is de-duplicated in Photo reference. |

---

## Detailed Requirements Understanding

**Problem/Requirement Statement:** `/admin/image-generation`'s "Photo reference" picker
(`listNinaPhotoReferences`) merges two sources — Nina's album (`nina_avatars`, the Image
collection's **Album** view) and her generated chat photographs (`nina_message_images`, the
**Media** view) — and is supposed to show each photograph exactly once. It currently shows the
same photograph twice when an operator has used the admin action **"Set as her profile
picture"** (`setChatPhotoAsAvatarAction`) on a chat/Media photograph: that action **copies** the
photograph's bytes into a brand-new `nina_avatars` row (a second Blob object, a new id) but never
marks the original `nina_message_images` row it copied from as "already elsewhere." The merge's
existing de-duplication predicate (`isOriginalPhoto()` / `generatedChatPhotoScope`) only excludes
a chat row when its `source_avatar_id` or `source_image_id` column is set — and this copy path
sets neither — so the untouched original chat row and its new album twin both pass the filter and
both appear in the merged, newest-first list. Because the album row is created moments after the
chat row (same request), the two land next to each other at the very top of the list — exactly
the "first 2" the user observed.

**Verified against production data** (read-only, via `psql "$DATABASE_URL"`): 5 rows in
`nina_avatars` carry a `source_key` of the shape `'chat-photo:<id>'` (the marker
`copyChatPhotoIntoAlbum` writes). Joining each back to its named `nina_message_images` row shows
all 5 source rows still have `source_avatar_id` and `source_image_id` both `NULL` — i.e. every
single adoption to date left its original chat row looking "original," and the newest pair
(avatar `1ZES60TSlrti` created `2026-09-12 03:44:08`, chat row `ueetX15Ici4q` created
`2026-09-12 03:37:01`, both `kind = 'generated'`) is the pair currently sitting at the top of the
merged list — this is the live occurrence of the bug the user is looking at.

**Success Criteria:**
- After the fix, a photograph adopted into the album via `setChatPhotoAsAvatarAction` appears
  **once** in `listNinaPhotoReferences`' merged output (`ImageGenPanel`'s Photo reference grid),
  not twice.
- The album view (`/admin/nina?view=album`) and the Media view (`/admin/nina?view=media`) are
  **unaffected** — each keeps showing the photograph it already shows today. The user asked only
  that the *merge* (Photo reference) stop double-counting; nothing in the request asks the two
  admin explorer views to change what they list.
- `countNinaChatPhotos` (the picker's chat-side total) and `resolveNinaPhotoReference` (a saved
  reference's resolution) must not drift out of agreement with the listing — the existing
  invariant the code already states and tests (`generatedChatPhotoScope` is shared by exactly
  these three callers for this reason).
- No new Blob object is deleted and no photograph disappears from any collection outright — the
  chat row keeps existing (still visible in Media, still renderable in its chat bubble); it is
  hidden **only** from the reference-picker merge, the one surface the user named.

**Key Considerations / Edge Cases:**
- One of the 5 adopted rows found in production has `kind = 'upload'` (a hand-uploaded photograph
  the operator adopted into the album), not `'generated'`. `generatedChatPhotoScope` already
  excludes `kind = 'upload'` rows from the chat side of the picker (R2's own scope, unrelated to
  this bug) — the fix does not need to special-case this row; it simply never reaches the new
  predicate because the existing `kind` filter already removes it first.
- `resolveNinaPhotoReference('chat', id)` can be asked to resolve a previously **saved**
  preference whose id later got adopted into the album. Per the function's own documented
  contract, a reference that no longer resolves degrades to `null` (an unanchored generation) —
  this is the function's designed behaviour for "the photograph was later deleted," and an
  adoption is being treated the same way on purpose: the saved id still names a real photograph,
  it has just moved. No new failure mode is introduced.
- The fix must not touch `mediaCollectionScope` (the predicate behind `/admin/nina?view=media`)
  or `isOriginalPhoto()` itself, both of which are explicitly shared with reads that must keep
  showing a photograph even when it has a twin elsewhere (rendering reads, the Media explorer).
  Only the picker-specific scope (`generatedChatPhotoScope`) may change.
- The `nina_avatars_user_source_key_unq` unique index already exists on `(user_id, source_key)`,
  so a correlated `NOT EXISTS` lookup against it is an index-backed equality check, not a new
  migration.

---

## Analysis Scope

### Explicitly Mentioned Files
None — target inferred from `admin/image-generation`.

### Discovered Related Files
- `app/admin/image-generation/page.tsx` — the route; calls `listNinaPhotoReferences`.
- `components/admin/ImageGenPanel.tsx` — renders the Photo reference grid from
  `referencePage.rows` / `photoTotal`.
- `components/admin/PhotoReferencePicker.tsx`, `components/admin/photoReferenceModel.ts` — the
  picker UI and its client-side row model.
- `lib/nina/imageprefs.ts` — `mergeNinaPhotoRefs`, `ninaPhotoRefBounds`,
  `NINA_PHOTO_REF_PAGE_SIZE` / `NINA_PHOTO_REF_SCAN_MAX`, the `NinaPhotoRef` / `NinaPhotoRefPage`
  types. Pure merge/sort logic, no DB access — not itself the bug.
- `lib/nina/queries.ts` — `listNinaPhotoReferences` (:4162), `resolveNinaPhotoReference` (:4237),
  `countNinaChatPhotos` (:2037), `generatedChatPhotoScope` (:2018), `isOriginalPhoto` (:1984),
  `mediaCollectionScope` (:2072), `getNinaAvatarBySourceKey` (:3104). **This is where the fix
  lands.**
- `lib/admin/ninaAlbumActions.ts` — `setChatPhotoAsAvatarAction` (:278),
  `copyChatPhotoIntoAlbum` (:332). **This is the write path that creates the duplicate;
  unchanged by the fix** — it is documented and tested as "the reverse of F37's share: bytes
  COPIED, not shared" for its own good reason (album deletes call `del` with no reference check),
  so the fix works around the copy rather than un-copying it.
- `lib/db/schema.ts` — `ninaAvatars` (:1709, `source_key` at :1741,
  `nina_avatars_user_source_key_unq` at :1781), `ninaMessageImages` (`source_avatar_id` /
  `source_image_id`, F37's provenance pair).
- `lib/nina/attach.ts` — the *other* direction (album → chat, `resolveAttachment`'s
  `ninaPhotoProvenance`), which already writes `sourceAvatarId` on the new chat row and is why
  that direction is already correctly de-duplicated. Read for contrast, not touched.
- `tests/nina.photoRefs.test.ts` — asserts `generatedChatPhotoScope`'s predicates against
  generated SQL for `listNinaMessageImages` and `countNinaChatPhotos`.
- `tests/nina.imageprefs.test.ts` — "the picker's union cannot contain the same photograph twice
  (plan invariant 13)" (:539), which asserts `listNinaPhotoReferences` reaches the chat set
  through `generatedChatPhotoScope` and never a hand-written `kind` filter. This existing
  invariant is about the *other* direction of the same duplicate class (an album face reappearing
  as an unlinked chat reference) — the fix extends the same predicate to close the direction this
  invariant did not anticipate.
- `tests/admin.chatPhotoAdoption.test.ts` — the `setChatPhotoAsAvatarAction` suite. Documents the
  "copy, not share" design and `source_key` idempotence; has no assertion today about the
  original chat row's visibility in the Photo reference picker after adoption.

---

## Current Dataflow

### Entry Point: `/admin/image-generation` (GET)

**Location:** `app/admin/image-generation/page.tsx:100`
**Trigger:** admin navigates to the page (server component render).
**Input:** none (no `searchParams`).
**Validation:** `requireAdmin()` at the top of the function body.
**Next Step:** `Promise.all([readNinaImagePrefs, readNinaTuning, listNinaPhotoReferences])`,
then `referencePage.rows.map(toImageReferenceOption)` is handed to `<ImageGenPanel>` as
`references`, with `photoTotal={referencePage.total}`.

### Processing Chain

1. **Function:** `listNinaPhotoReferences(userId, opts)`
   - **Location:** `lib/nina/queries.ts:4162`
   - **Input:** `userId`, optional `{ limit, offset }`.
   - **Transform:** runs four statements concurrently — album rows (`nina_avatars`, no
     `folder` predicate, ordered `created_at desc, id desc`, `LIMIT bounds.scan`), chat rows
     (`nina_message_images` under `generatedChatPhotoScope(userId)`, same order/limit),
     `countNinaAvatars(userId)`, `countNinaChatPhotos(userId)`. Album rows are tagged
     `{ source: 'album' }`, chat rows `{ source: 'chat', thumbUrl: null }`.
   - **Output:** `{ rows: mergeNinaPhotoRefs(album, chat, bounds), total: albumCount +
     chatCount, offset, limit }`.
   - **Calls:** `generatedChatPhotoScope` (:2018) for the chat WHERE clause;
     `mergeNinaPhotoRefs` (`lib/nina/imageprefs.ts`) for the pure sort+slice.

2. **Function:** `generatedChatPhotoScope(userId)`
   - **Location:** `lib/nina/queries.ts:2018`
   - **Current definition:** `and(eq(userId), eq(kind, 'generated'), isOriginalPhoto())`, where
     `isOriginalPhoto()` (:1984) is `and(isNull(sourceAvatarId), isNull(sourceImageId))`.
   - **Gap:** a `nina_message_images` row that was **copied into the album** by
     `copyChatPhotoIntoAlbum` still has both provenance columns `NULL` — it was never a
     "reference" in the F37 sense, so this predicate correctly (by its own definition) still
     calls it original. The row genuinely has no pointer *to* the copy; only the copy (the new
     `nina_avatars` row) has a pointer *back*, via `source_key`, and nothing reads that pointer
     from the chat side.

3. **Function:** `setChatPhotoAsAvatarAction(input)` (the write path that creates the pair)
   - **Location:** `lib/admin/ninaAlbumActions.ts:278`
   - **Input:** `{ id, scale, x, y }` (a chat photograph's id + crop framing).
   - **Transform:** reads the chat row (`getNinaMessageImage`); refuses a reference row
     (`sourceAvatarId`/`sourceImageId` set) or a schema-invalid crop; computes `sourceKey =
     'chat-photo:' + row.id`; looks up an existing avatar by that key
     (`getNinaAvatarBySourceKey`) — if none, calls `copyChatPhotoIntoAlbum`.
   - **`copyChatPhotoIntoAlbum`** (:332): `fetch`es the chat row's `blobUrl`, `put`s the bytes
     as a **new** Blob object (`avatar-<newId>.<ext>`, `addRandomSuffix: true`), then
     `insertNinaAvatars` with `{ blobUrl: stored.url, pathname: stored.url, source: 'admin',
     folder: '', sourceKey, width: row.width, height: row.height, bytes: row.bytes, description:
     row.description }`. **Nothing here writes back to the `nina_message_images` row `row`.**
   - **Exit:** the new avatar becomes current (`setCurrentNinaAvatar`); `revalidatePath`.
   - **State change:** one new `nina_avatars` row (new Blob object, new id, `source_key` set);
     the original `nina_message_images` row is untouched.

### Data Persistence

**`nina_avatars`** (Postgres, via drizzle): new row per adoption, `source_key = 'chat-photo:' +
<original nina_message_images.id>`, unique on `(user_id, source_key)`
(`nina_avatars_user_source_key_unq`) — this is what prevents a *second* copy on re-adoption, but
it has no reciprocal effect on the original row's visibility.

**`nina_message_images`**: the adopted-from row is never updated by this action. Its
`source_avatar_id` / `source_image_id` remain `NULL` forever (unless some *other* code path later
touches it — none does today).

### Exit Points
- `ImageGenPanel`'s Photo reference grid renders `referencePage.rows` — one tile per
  `NinaPhotoRef`, keyed by `{source, id}`. Two rows (one `album`, one `chat`) with the visually
  identical photograph both render as separate tiles.
- `photoTotal` (`referencePage.total = albumCount + chatCount`) over-counts by one for every
  adopted-and-still-original pair, which is what the picker's "Showing N of `total`" footer would
  also overstate.

---

## Key Data Structures

### Table: `nina_avatars`
**Location:** `lib/db/schema.ts:1709`
**Relevant fields:** `id`, `userId`, `blobUrl`, `pathname`, `sourceKey` (`text`, nullable, unique
per `(userId, sourceKey)` via `nina_avatars_user_source_key_unq` at :1781), `source`
(`NinaAvatarSource`), `isCurrent`, `createdAt`.
**Used in:** `insertNinaAvatarAsCurrent`, `insertNinaAvatars`, `getNinaAvatarBySourceKey`,
`listNinaPhotoReferences` (album side).

### Table: `nina_message_images`
**Location:** `lib/db/schema.ts` (F37 provenance pair `source_avatar_id` / `source_image_id`,
around :1081-1112 per existing doc references in `lib/nina/queries.ts:4118`).
**Relevant fields:** `id`, `userId`, `kind` (`NinaImageKind`, includes `'generated' | 'upload'`),
`blobUrl`, `sourceAvatarId`, `sourceImageId`, `createdAt`.
**Used in:** `generatedChatPhotoScope`, `isOriginalPhoto`, `mediaCollectionScope`,
`listNinaPhotoReferences` (chat side), `countNinaChatPhotos`, `resolveNinaPhotoReference`.

### Type: `NinaPhotoRef` / `NinaPhotoRefPage`
**Location:** `lib/nina/imageprefs.ts` (near `NINA_PHOTO_REF_PAGE_SIZE` at :450).
**Fields:** `{ source: 'album' | 'chat', id, blobUrl, thumbUrl, width, height, createdAt }` /
`{ rows, total, offset, limit }`.
**Used in:** `listNinaPhotoReferences`'s return, `toImageReferenceOption` (`lib/admin/imageGenModel.ts`).

---

## Dependencies

### Configuration / Environment / External Services
- Vercel Blob (`@vercel/blob`'s `put`/`fetch`) — where `copyChatPhotoIntoAlbum` stores the second
  copy. Not touched by the fix.
- Postgres (Neon) via drizzle — the fix is a single additional predicate in one query function.
- `nina_avatars_user_source_key_unq` (existing unique index) — the fix's `NOT EXISTS` subquery is
  an equality lookup this index already serves; no migration needed.

---

## Reference List

| Symbol / key | File:line | Kind | Package |
|---|---|---|---|
| `generatedChatPhotoScope` | `lib/nina/queries.ts:2018` | def | `lib/nina` |
| `generatedChatPhotoScope(userId)` | `lib/nina/queries.ts:2041` | call (`countNinaChatPhotos`) | `lib/nina` |
| `generatedChatPhotoScope(userId)` | `lib/nina/queries.ts:4191` | call (`listNinaPhotoReferences`) | `lib/nina` |
| `generatedChatPhotoScope(userId)` | `lib/nina/queries.ts:4269` | call (`resolveNinaPhotoReference`) | `lib/nina` |
| `isOriginalPhoto` | `lib/nina/queries.ts:1984` | def | `lib/nina` |
| `mediaCollectionScope` | `lib/nina/queries.ts:2072` | def (must stay unchanged) | `lib/nina` |
| `nina_avatars.sourceKey` | `lib/db/schema.ts:1741` | def | `lib/db` |
| `nina_avatars_user_source_key_unq` | `lib/db/schema.ts:1781` | def (index) | `lib/db` |
| `copyChatPhotoIntoAlbum` | `lib/admin/ninaAlbumActions.ts:332` | def (writer, unchanged) | `lib/admin` |
| `setChatPhotoAsAvatarAction` | `lib/admin/ninaAlbumActions.ts:278` | def (writer, unchanged) | `lib/admin` |
| `listNinaPhotoReferences` | `lib/nina/queries.ts:4162` | def | `lib/nina` |
| `countNinaChatPhotos` | `lib/nina/queries.ts:2037` | def | `lib/nina` |
| `resolveNinaPhotoReference` | `lib/nina/queries.ts:4237` | def | `lib/nina` |
| plan invariant 13 test | `tests/nina.imageprefs.test.ts:539` | test (extend) | `tests` |
| `generatedChatPhotoScope` SQL assertions | `tests/nina.photoRefs.test.ts:78-88` | test (must still pass) | `tests` |
| adoption test suite | `tests/admin.chatPhotoAdoption.test.ts` | test (reference, unchanged) | `tests` |

---

## Impact Points (files that WILL need changes)

1. `lib/nina/queries.ts` — extend `generatedChatPhotoScope(userId)` with a correlated
   `NOT EXISTS` predicate against `nina_avatars` on `source_key = 'chat-photo:' || id`, scoped to
   the same `userId`; update its docstring and `isOriginalPhoto`'s neighbouring prose to describe
   the new exclusion. Owned by phase 1.
2. `tests/nina.imageprefs.test.ts` — extend or add a case under "the picker's union cannot
   contain the same photograph twice (plan invariant 13)" covering the album-adoption direction:
   an adopted chat row must not appear in `listNinaPhotoReferences`'s chat side (and
   `countNinaChatPhotos` must not count it). Owned by phase 1.
3. `tests/nina.photoRefs.test.ts` — the existing `REFERENCE_SKIPPED`-based assertions on
   `countNinaChatPhotos`'s WHERE clause use `.toContain`, so they keep passing once the new
   predicate is added; verify this rather than assume it, and add a case for the new predicate's
   presence if the phase plan judges it useful. Owned by phase 1.

**This document describes. The plan file prescribes.**
