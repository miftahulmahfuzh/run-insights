# Code Analysis: Unified semantic search + keyword tagging across Album and Media, with a link-not-copy promotion path

**Type:** Feature Implementation
**Date:** 2026-09-17
**Session ID:** 20260917-091446-W0FK
**Plan:** `MEDIA_ALBUM_UNIFIED_SEARCH_PLAN.md` (4 phases)
**Worktree:** `/home/miftah/.worktrees/run-insights/media-album-unified-search` (branch `feature/media-album-unified-search`, base `origin/main` @ `b8b4aeb`)

---

## User Input

### Original User Request (verbatim, across the conversation)

> in admin-Image Collection, we have semantic search feature. but how come we can only add search keyword and negative search keyword to the pictures in Album folder? every single picture in any directory must be able to be image searched and we must be able to add search keyword and negative search keyword to each of them.

Clarifying exchange (preserved because it changed the requirement):

> [assistant] within the Album arm, search already covers every folder. The real gap is Media (chat photos)...
> [user] if every single directory, including Media has been included in the search space, then we just need to fix the UI problem in Media. try selecting an image inside Media folder. this image do not have search keyword and negative keyword field

> [assistant, correcting the premise] Media is not in the search space today (no embedding column, not queried). Which shape do you want — mirror the Album pattern onto `nina_message_images` (Option A), or unify the two tables (Option B)?
> [user] Mirror Album pattern (Option A, recommended)

> [assistant] Should Media get its own search bar, or should Album's search bar be extended to return matching Media results in the same list?
> [user] Merge into one cross-table search. but we need to make sure there are no duplicates in the search result.
> i think we need to refactor how we save profile picture. make it so, if admin set a picture from Media, we wouldn't copy paste a new duplicate image into Album directory.
> i keep thinking about this a lot. i think the best way is just using somekind of dynamic link (so the image in Album is just a pointer to the real file in Media)
> this will solve this duplicate problem in our cross-table search.
> we will also have many subfolders, i tried to upload one subfolder just now, named: runins-a . make sure this dynamic link mechanism is used for every subfolders as well. if admin set an image in runins-a, the Album directory just show the image, but in reality it's just a dynamic link to the real file .
> this way, storage usage will be lower, and editing image description, search keyword, negative keyword in one place will automatically synchronize it with other location

> [user, final] go ahead and design it. use /analyze

### User-Provided Files
None (`@`-mentioned).

### Requirement IDs

| ID | What the user asked for |
|---|---|
| R1 | Every picture, in every directory (Album *and* Media), must be semantically searchable — one merged, deduplicated search, not two separate ones. |
| R2 | Every picture, in every directory, must support hand-written search keywords *and* negative search keywords (parity with what Album already has). |
| R3 | "Set as her profile picture" (Media → Album) must stop copying bytes into a new Blob object and a new independent row. It must create a dynamic link/pointer instead — the Album entry is a pointer to the real file living in Media, for every folder including new subfolders (e.g. `runins-a`) — and editing description/keywords in one place must automatically be reflected in the other, because there is only one real copy of that data. |

---

## Detailed Requirements Understanding

**Problem/Requirement Statement:** The admin Image Collection (`/admin/nina`) has two arms today: **Album** (`nina_avatars`, browsable by folder, semantic search, hand-written keywords) and **Media** (`nina_message_images`, Nina's chat photos — her generated selfies and the operator's chat uploads). Semantic search and keyword tagging exist *only* for Album, because only `nina_avatars` carries `description_embedding`, `search_keywords`, `negative_search_keywords`. Separately, promoting a Media photo to be "her profile picture" today performs a full byte-for-byte copy into a brand-new Blob object and a brand-new `nina_avatars` row (`copyChatPhotoIntoAlbum`, `lib/admin/ninaAlbumAvatarActions.ts:179-241`) — a deliberate, documented decision at the time it was written, but one the user now wants reversed for storage and single-source-of-truth reasons, and because a duplicated row is a duplicate search hit.

**Success Criteria:**
- Typing a query (or uploading a query photo) in the one search bar returns ranked results drawn from *both* tables, with each physical photograph appearing exactly once, regardless of folder (root or any subfolder, e.g. `runins-a`).
- Every photo in Media — generated selfies and operator uploads alike — has a search-keywords box and a negative-keywords box in its detail pane, working exactly like Album's today (same character limits, same save/clear/re-embed semantics).
- Clicking "Set as her profile picture" on a Media photo no longer uploads a second Blob object or a row with its own independent description/keywords. It creates a linked Album row; editing the description or either keyword field from *either* the Album pane or the Media pane changes the same underlying data, visible from both.
- The existing Album-only workflows (upload, crop, folder move, "make current", delete) keep working unchanged for photos that are not links.

**Key Considerations / Constraints:**
- **Existing precedent for cross-table pointers already exists, in the opposite direction**: `nina_message_images.source_avatar_id` / `source_image_id` (`lib/db/schema/nina/chat.ts:606-644`, "F37") let a *chat* row re-show an Album photo or another chat photo without copying bytes. `isOriginalPhoto()` (`lib/nina/queries/images.ts:489`) is the existing convention for "exclude a reference row from every collection listing, dedup mechanism and search" — R1/R3's design should extend this same convention symmetrically to the new Album→Media direction, rather than inventing a new one.
- **Cross-table *live* reads without copying are already proven safe in production**: `resolveNinaPhotoReference` (`lib/nina/queries/imageprefs.ts:314-350`) resolves a stored `{source: 'album'|'chat', id}` preference at generation time with a plain `SELECT` against whichever table `source` names, and nothing is ever copied for that feature. This directly supports the user's "dynamic link" ask being both idiomatic and low-risk here.
- **The existing "bytes copied, not shared" decision was deliberate** (`lib/admin/ninaAlbumAvatarActions.ts:82-114`) and gave two reasons: (a) the Album row needs its own crop/framing and folder lifetime independent of the chat photo, and (b) deleting either side must not orphan or corrupt the other. Both concerns are already handled by mechanisms that exist independently of *whether bytes are copied*: crop lives in `nina_avatars`' own `crop_scale`/`crop_x`/`crop_y` columns regardless of whether `blob_url` is shared or fresh, and shared-blob deletion safety is already solved generically by `isBlobPathnameReferenced`/`releaseBlobIfUnreferenced` (`lib/nina/blobRelease.ts`, `lib/nina/queries/images.ts:1127`). So reversing "copy" to "link" does not reopen either original concern — it only needs a new, explicit rule for description/keyword ownership (see Decisions in the plan index) and a new rule for what happens if the operator tries to delete the underlying Media original while an Album pointer still exists.
- **No CLIP-style image embedding model exists in this app's vendor arsenal** (`lib/nina/queries/avatarsearch.ts:18-25`) — an image query is captioned by `glm-4.6v` and the caption is embedded as text, same as Album today. Media rows already have a `description` column (`glm-4.6v`'s private prose, `lib/db/schema/nina/chat.ts:602-603`) written by the existing describe/caption pipeline (`scheduleChatPhotoCaption`), so the embedding input (description + optional keywords) is already available for every Media row; only the embedding *column* and the *keyword* columns are missing.
- **154 existing `nina_message_images` rows and 70 existing `nina_avatars` rows** (18 of which are `source_key LIKE 'chat-photo:%'` — the very duplicates R3 is about) exist in production today. This plan does not retroactively merge or delete the 18 existing duplicate Album rows — that is a one-off data cleanup outside what the user asked for (R3 is about the promotion *action* going forward); the 18 existing rows remain ordinary, independent Album rows. Existing Media rows do need a one-time embedding backfill so R1 is true for photos that already exist, not just new ones.
- **Blob path convention**: both tables already share one flat prefix (`nina/<userId>/...`, `lib/nina/images.ts`), distinguished only by filename (`avatar-<id>.<ext>` vs `selfie-<id>.<ext>`) — nothing about "directories" needs to change for the link mechanism; folders are metadata (`nina_avatars.folder`) exactly as they are today for ordinary Album rows, and a linked row's `folder` behaves identically (the operator can move a linked Album entry between folders exactly like any other Album row — only its bytes and its description/keywords are borrowed).

**Assumptions this plan makes explicit (see the plan index's Decisions section for the rung each was decided on):**
1. Reversing "copy, not share" for `setChatPhotoAsAvatarAction` is authorized directly by the user's raw input (R3), which outranks the old convention's own stated rationale — a rationale this analysis shows is otherwise satisfied by mechanisms unrelated to whether bytes are copied (see above).
2. A pointer Album row never carries its own `description` / `search_keywords` / `negative_search_keywords` / `description_embedding` — those four fields are read from, and written to, the linked Media row, so "editing in one place" and "automatically synchronized" are true by construction (there is only one row that actually holds the data).
3. Deleting a Media original while an Album pointer still names it is refused (not cascaded, not silently orphaned) — mirroring the existing, familiar refusal shape `deleteNinaAvatar` already uses for "you cannot delete the current avatar."
4. The 18 pre-existing duplicate Album rows and their already-uploaded copies are left as-is; only the promotion action changes going forward.

---

## Analysis Scope

### Explicitly Mentioned Files
None — the user described a feature; every path below was found in Step 2.

### Discovered Related Files

**Schema**
- `lib/db/schema/nina/avatars.ts` — `nina_avatars` (Album): `folder`, `description`, `searchKeywords`, `negativeSearchKeywords`, `descriptionEmbedding`, `NINA_EMBEDDING_DIMENSIONS = 1536`, `nina_avatars_description_embedding_hnsw_idx`. No column referencing `nina_message_images` today.
- `lib/db/schema/nina/chat.ts` — `nina_message_images` (Media): `description`, `prompt`, `sourceAvatarId`, `sourceImageId` (both `ON DELETE SET NULL`, self/cross-table provenance, F37), `contentHash`, `perceptualHash`/`perceptualSig`. No `search_keywords`, `negative_search_keywords` or `description_embedding` today.

**Embedding pipeline (Album, to generalize)**
- `lib/nina/avatarEmbedText.ts` — `buildNinaAvatarEmbedText(description, searchKeywords)`: the one join of description+keywords into embeddable text. Zero imports, callable from Vitest/scripts/route handlers alike. Generic over any row shape with those two strings — reusable as-is for Media, despite the name.
- `lib/nina/queries/avatarEmbeddings.ts` — `listNinaAvatarDescribeTargets`, `listNinaAvatarDescribeBacklog`, `countNinaAvatarDescribeBacklog`, `setNinaAvatarDescriptionAndEmbedding`, `setNinaAvatarSearchKeywordsAndEmbedding`. All `nina_avatars`-only; a media-side twin is needed.
- `lib/admin/ninaAlbumDeferredDescribe.ts` — `scheduleDescribe`/`scheduleDescribeAll`/`scheduleEmbed`, the `after()`-based worker (`fillOne`, `runFillLanes`) that describes+embeds Album rows off the request path. `embedNinaAvatarDescription` is the one function deciding what an Album vector is computed from.
- `lib/nina/queries/avatarsearch.ts` — `searchNinaAvatarsByText`/`ByImageCaption`/`ByTextAndCaption`, `rankByDistance`, `searchScope` (`user_id` + `descriptionEmbedding IS NOT NULL`), `NINA_SEARCH_MIN_SCORE = 0.2`, `NINA_SEARCH_TEXT_WEIGHT = 0.5`, `matchesNegativeKeyword` (whole-word, case-insensitive, comma-split). `nina_avatars`-only.
- `lib/admin/ninaAlbumSearchActions.ts` — `searchNinaAvatarsAction`, the one Server Action the UI calls; three-way branch (text/image/both) via `runSearch`, maps rows to `AdminSearchHit` via `toHit`.

**Media describe/caption pipeline (existing, to extend)**
- `lib/admin/chatPhotoActions.ts` — `editChatPhotoDescriptionAction` (hand-edit, no re-embed today because there's nothing to embed), `describeChatPhotoAction` (vision re-describe), `scheduleChatPhotoCaption` (the `after()` pass that both describes *and* writes a chat bubble caption — file continues past the read window, not fully read), `isChatPhotoReference` (row-level re-share check).
- `lib/admin/ninaAlbumAvatarActions.ts` — `setCurrentNinaAvatarAction`, `setChatPhotoAsAvatarAction` + private `copyChatPhotoIntoAlbum` (the copy this plan replaces), `saveNinaAvatarCropAction`, `deleteNinaAvatarAction`.
- `lib/nina/provenancePromotion.ts` — `promoteNinaAvatarDependents`/`promoteNinaImageDependents`: measures (hash+perceptual-sign) a dependent row's shared object before its parent is deleted, so `ON DELETE SET NULL` produces a true "original" instead of a ghost. Existing, unmodified by this plan except that a new provenance direction (Album pointer → Media parent) needs the *inverse* protection: **refuse the delete**, not promote-then-allow (see Decisions).
- `lib/nina/blobRelease.ts` — `releaseBlobIfUnreferenced` — the one reference-checked Blob delete, asks `isBlobPathnameReferenced` (`lib/nina/queries/images.ts:1127`) which already scopes across *both* tables.
- `lib/nina/queries/images.ts` — `isOriginalPhoto()` (:489, the exclude-a-reference predicate), `generatedChatPhotoScope` (:566, the Media collection's scope), `listNinaMediaPhotos`/`countNinaMediaPhotos` (:655/:690), `isBlobPathnameReferenced` (:1127, already cross-table).

**UI**
- `components/admin/explorer/model.ts` — `ExplorerPhotoBase`, `AlbumExplorerPhoto` (carries `searchKeywords`/`negativeSearchKeywords`), `MediaExplorerPhoto` (does not), `ExplorerPhoto` union.
- `components/admin/explorer/PhotoDescription.tsx` — the one shared describe/keyword panel; `onSaveKeywords`/`onSaveNegativeKeywords` are optional and, when absent, the whole block does not render ("absent, not disabled").
- `components/admin/explorer/SelectionPane.tsx` (`AlbumSelectionPane`, ~line 397-425) — mounts `PhotoDescription` with all four Album props wired to `editNinaAvatarDescriptionAction`/`describeNinaAvatarAction`/`editNinaAvatarSearchKeywordsAction`/`editNinaAvatarNegativeSearchKeywordsAction`.
- `components/admin/explorer/MediaPane.tsx` — mounts `PhotoDescription` with only `description`/`onSave`/`onRedescribe`; no keyword props at all (not merely disabled — absent). Also the "Set as her profile picture" button (`onAdopt` → `setChatPhotoAsAvatarAction`).
- `components/admin/explorer/PhotoSearchBar.tsx` — the one search bar (`searchNinaAvatarsAction`), currently mounted only in the Album arm's header (per its own docstring, "the search is album-wide" — i.e. every folder, not every table).
- `components/admin/explorer/SearchResultsGrid.tsx` — renders `AdminSearchHit[]`, opens `PhotoViewer`, links each result to `hrefForAvatar(photo.id)` (`lib/admin/albumDeepLink.ts`) for "open this photo's description" — Album-specific today; a Media-origin hit needs a different deep link.
- `app/admin/nina/page.tsx` — the Server Component that builds `ExplorerPhoto` rows for both arms (not fully read; every field mapped here must gain the new columns).

**Constants/bounds**
- `lib/admin/avatars.ts:192,206` — `ADMIN_AVATAR_MAX_SEARCH_KEYWORDS_CHARS = 500`, `ADMIN_AVATAR_MAX_NEGATIVE_SEARCH_KEYWORDS_CHARS = 500`.
- `lib/admin/chatPhotos.ts:188` — `ADMIN_CHAT_PHOTO_MAX_DESCRIPTION_CHARS = 2000` (shared by both tables' description boxes already).
- `lib/admin/schema.ts:130-165` — the Zod schemas for the Album keyword actions (`editNinaAvatarSearchKeywordsAction`'s input, `:137`; negative's, `:163`) — the pattern to mirror for Media.

---

## Current Dataflow

### Entry Point 1: Album semantic search
**Location:** `components/admin/explorer/PhotoSearchBar.tsx:100` → `searchNinaAvatarsAction` (`lib/admin/ninaAlbumSearchActions.ts:143`)
**Trigger:** form submit (typed text and/or an uploaded query photo, re-encoded client-side to a data URI, never PUT to Blob).
**Validation:** `ninaAlbumSearchSchema` (refines "at least one arm present").
**Processing:** optional caption of the query photo (`describeNinaImagesWithFallback`) → embed text and/or caption (`embedNinaText`, parallel) → `runSearch` picks one of `searchNinaAvatarsByText`/`ByImageCaption`/`ByTextAndCaption` (`lib/nina/queries/avatarsearch.ts`) → `rankByDistance` queries `nina_avatars` only, `WHERE user_id = $1 AND description_embedding IS NOT NULL`, `ORDER BY <=>`, applies `NINA_SEARCH_MIN_SCORE` and `matchesNegativeKeyword` in JS on the fetched page.
**Exit:** `AdminSearchHit[]` (`toHit`), rendered by `SearchResultsGrid`.

### Entry Point 2: Media promotion ("set as profile picture")
**Location:** `components/admin/explorer/MediaPane.tsx:130-147` (`onAdopt`) → `setChatPhotoAsAvatarAction` (`lib/admin/ninaAlbumAvatarActions.ts:122`).
**Trigger:** click, with a client-side draft crop (scale/x/y).
**Processing today:** reads the `nina_message_images` row (refuses if it is itself a reference — `sourceAvatarId`/`sourceImageId` set) → looks up an existing adoption by `source_key = 'chat-photo:<id>'` → if none, `copyChatPhotoIntoAlbum` fetches the chat photo's bytes and `put()`s a **new** Blob object, then inserts a **new** `nina_avatars` row with its own `description` (copied value, not linked) → applies the crop → `setCurrentNinaAvatar` → `scheduleDescribe` (a no-op if description is already non-null).
**State changes:** new Blob object, new `nina_avatars` row (independent lifetime), `nina_avatars.is_current` flips.
**Exit:** `revalidatePath('/admin/photos'... )` — actually `ADMIN_CHAT_PHOTOS_PATH`, which is `/admin/nina`.

### Entry Point 3: Keyword edit (Album only today)
**Location:** `components/admin/explorer/SelectionPane.tsx` (`AlbumSelectionPane`) → `editNinaAvatarSearchKeywordsAction`/`editNinaAvatarNegativeSearchKeywordsAction` (`lib/admin/ninaAlbumActions.ts` barrel, implementation not yet read in full — same module family as `ninaAlbumAvatarActions.ts`).
**Processing:** writes `search_keywords` (or `negative_search_keywords`) and, for the search-keywords arm only, nulls `description_embedding` in the same UPDATE (`setNinaAvatarSearchKeywordsAndEmbedding`), then `scheduleEmbed` recomputes the vector off-band from `buildNinaAvatarEmbedText(description, searchKeywords)`. The negative-keywords arm never touches the vector (`matchesNegativeKeyword` reads it fresh at search time, not folded into the embedding).
**Exit:** `revalidatePath('/admin/nina')`.

---

## Key Data Structures

### `nina_avatars` (Album) — `lib/db/schema/nina/avatars.ts:214`
Relevant existing columns: `id`, `userId`, `blobUrl`, `pathname`, `folder`, `sourceKey`, `contentHash`, `description`, `searchKeywords`, `negativeSearchKeywords`, `descriptionEmbedding` (vector(1536), HNSW cosine index), `isCurrent`, `cropScale`/`cropX`/`cropY`.
**New in this plan:** `sourceImageId` — nullable `text`, FK → `nina_message_images.id`, `ON DELETE RESTRICT`. Non-null marks the row a *pointer*.

### `nina_message_images` (Media) — `lib/db/schema/nina/chat.ts:554`
Relevant existing columns: `id`, `userId`, `messageId` (nullable), `kind` (`'upload'|'generated'`), `blobUrl`, `pathname`, `description`, `prompt`, `sourceAvatarId`, `sourceImageId` (self/cross-table reference, unrelated to the new Album-side column of the same name — two different tables, two different meanings, both following the same "provenance FK" idiom), `contentHash`, `perceptualHash`/`perceptualSig`.
**New in this plan:** `searchKeywords`, `negativeSearchKeywords` (both nullable `text`, same shape and same 500-char bound as Album's), `descriptionEmbedding` (`vector(1536)`, nullable, HNSW cosine index — identical shape to Album's).

### `AdminSearchHit` (`lib/admin/ninaAlbumActions.ts`, barrel type)
Currently Album-shaped (`folder`, `isCurrent`, `crop`, `source` as the avatar's admin/seed/etc. enum). **Needs an `origin: 'album' | 'media'` discriminant** (or equivalent) so the UI can build the right deep link and the right pane affordances per hit, mirroring `ExplorerPhoto`'s existing `origin` discriminant.

---

## Dependencies

### Configuration / Environment / External Services
- `NINA_EMBEDDING_MODEL` / `NINA_EMBEDDING_DIMENSIONS` (`lib/db/schema/nina/avatars.ts:212`) — must stay the same model for Media's new column; no new vendor surface, reuses `embedNinaText` (`lib/nina/embedding.ts`).
- `glm-4.6v` describe/caption path (`lib/nina/vision.ts`, `describeNinaImages`/`describeNinaImagesWithFallback`) — already runs for both tables; unchanged.
- Drizzle migrations under `drizzle/` — a new migration adds the three Media columns + HNSW index and the one Album FK column + its index.
- `Neon` Postgres (production database — `.env.local`'s `DATABASE_URL` is the one database this repo has; a migration here is a production migration).

---

## Reference List

| Symbol / key | File:line | Kind | Package |
|---|---|---|---|
| `ninaAvatars` (table) | `lib/db/schema/nina/avatars.ts:214` | def | `lib/db/schema/nina` |
| `ninaMessageImages` (table) | `lib/db/schema/nina/chat.ts:554` | def | `lib/db/schema/nina` |
| `buildNinaAvatarEmbedText` | `lib/nina/avatarEmbedText.ts:47` | def/reuse | `lib/nina` |
| `searchScope`, `rankByDistance`, `searchNinaAvatarsBy*` | `lib/nina/queries/avatarsearch.ts` | def/replace | `lib/nina/queries` |
| `listNinaAvatarDescribeTargets`, `setNinaAvatarDescriptionAndEmbedding`, `setNinaAvatarSearchKeywordsAndEmbedding` | `lib/nina/queries/avatarEmbeddings.ts` | def/mirror | `lib/nina/queries` |
| `scheduleDescribe`, `scheduleEmbed`, `fillOne`, `embedNinaAvatarDescription` | `lib/admin/ninaAlbumDeferredDescribe.ts` | def/mirror | `lib/admin` |
| `copyChatPhotoIntoAlbum`, `setChatPhotoAsAvatarAction` | `lib/admin/ninaAlbumAvatarActions.ts:122-241` | call/rewrite | `lib/admin` |
| `deleteNinaAvatarAction` | `lib/admin/ninaAlbumAvatarActions.ts:324` | call/edit | `lib/admin` |
| `isOriginalPhoto`, `generatedChatPhotoScope`, `isBlobPathnameReferenced` | `lib/nina/queries/images.ts:489,566,1127` | def/reuse | `lib/nina/queries` |
| `editChatPhotoDescriptionAction`, `describeChatPhotoAction`, `isChatPhotoReference` | `lib/admin/chatPhotoActions.ts:720,795,881` | call/extend | `lib/admin` |
| `promoteNinaAvatarDependents`, `promoteNinaImageDependents` | `lib/nina/provenancePromotion.ts:79,91` | def/unchanged | `lib/nina` |
| `AlbumExplorerPhoto`, `MediaExplorerPhoto`, `ExplorerPhoto` | `components/admin/explorer/model.ts` | def/edit | `components/admin/explorer` |
| `PhotoDescription` | `components/admin/explorer/PhotoDescription.tsx:89` | call (unchanged component) | `components/admin/explorer` |
| `AlbumSelectionPane` | `components/admin/explorer/SelectionPane.tsx:~397` | call/edit | `components/admin/explorer` |
| `MediaPane`, `onAdopt` | `components/admin/explorer/MediaPane.tsx:87,130` | call/edit | `components/admin/explorer` |
| `PhotoSearchBar`, `searchNinaAvatarsAction` | `components/admin/explorer/PhotoSearchBar.tsx:54` | call/edit | `components/admin/explorer` |
| `SearchResultsGrid`, `toHit`, `AdminSearchHit` | `components/admin/explorer/SearchResultsGrid.tsx`, `lib/admin/ninaAlbumSearchActions.ts:94` | call/edit | `components/admin/explorer`, `lib/admin` |
| `app/admin/nina/page.tsx` | not fully read | call/edit | `app/admin` |
| `NINA_ALBUM_BACKFILL_SLICE`, `/api/admin/nina/backfill-descriptions` route | `lib/admin/ninaAlbumDeferredDescribe.ts:106`, route not read | call/mirror | `app/api/admin/nina` |

---

## Impact Points (files that WILL need changes)

1. `lib/db/schema/nina/avatars.ts` — add `sourceImageId` FK column + index — **Phase 1**.
2. `lib/db/schema/nina/chat.ts` — add `searchKeywords`, `negativeSearchKeywords`, `descriptionEmbedding` + HNSW index — **Phase 1**.
3. A new Drizzle migration file — **Phase 1**.
4. `lib/nina/queries/images.ts` (or a new sibling module) — media embedding read/write helpers mirroring `avatarEmbeddings.ts`; extend the reference predicate story for the new Album-pointer direction — **Phase 2**.
5. A new merged search module (replacing/wrapping `lib/nina/queries/avatarsearch.ts`) — **Phase 2**.
6. `lib/admin/ninaAlbumDeferredDescribe.ts` — extend the deferred describe+embed worker to cover Media rows (or add a sibling scheduler) — **Phase 2**.
7. `lib/admin/ninaAlbumAvatarActions.ts` — `copyChatPhotoIntoAlbum` → link, not copy; `deleteNinaAvatarAction` — skip blob release for pointer rows — **Phase 2**.
8. `lib/admin/chatPhotoActions.ts` — new keyword actions for Media; `editChatPhotoDescriptionAction`/`describeChatPhotoAction` gain re-embed scheduling; `removeChatPhotoAction` gains a friendly refusal when an Album pointer still names the row — **Phase 2**.
9. `lib/admin/ninaAlbumSearchActions.ts` — call the merged search module, emit `origin` on `AdminSearchHit` — **Phase 2**.
10. `lib/admin/schema.ts` / a new `lib/admin/chatPhotoSchema.ts` addition — Zod schemas for the new media keyword actions — **Phase 2**.
11. `components/admin/explorer/model.ts` — `MediaExplorerPhoto` gains `searchKeywords`/`negativeSearchKeywords`; `AdminSearchHit`-adjacent UI types gain `origin` — **Phase 3**.
12. `components/admin/explorer/MediaPane.tsx` — wire the keyword box — **Phase 3**.
13. `components/admin/explorer/SelectionPane.tsx` (`AlbumSelectionPane`) — pointer-row messaging (read-only note that this is a linked photo, if the UI should say so) — **Phase 3**.
14. `components/admin/explorer/SearchResultsGrid.tsx` — per-origin deep link — **Phase 3**.
15. `app/admin/nina/page.tsx` — row mapping for the new fields — **Phase 3**.
16. A backfill route/script for Media embeddings (mirrors `/api/admin/nina/backfill-descriptions`) — **Phase 4**.
17. Tests: `tests/nina.avatarSearch.test.ts` and siblings, `SelectionPane.test.tsx`, `MediaPane.test.tsx`, `SearchResultsGrid.test.tsx`, `PhotoSearchBar.test.tsx`, schema tests (`tests/db.schema.nina.test.ts`) — **Phase 4** (plus each phase's own new-file tests where a phase introduces a new module).

**This document describes. The plan files prescribe.**
