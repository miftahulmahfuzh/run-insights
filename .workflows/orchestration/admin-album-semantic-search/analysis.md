# Code Analysis: Admin Album Semantic Image Search

**Type:** Feature Implementation
**Date:** 2026-09-15 08:59:28
**Session ID:** 20260915-085928-9RVY
**Plan:** `ADMIN_ALBUM_SEMANTIC_SEARCH_PLAN.md` (4 phases)
**Worktree:** `/home/miftah/.worktrees/run-insights/admin-album-semantic-search` (branch `feature/admin-album-semantic-search`, base `origin/main` @ `c1a3d9e`)

---

## User Input

### Original User Request

> 1. implement an image search system :
> for admin:
> in image collection, above "Album" text. put a search field, plus a button to upload image:
> - admin can search using text only. we use semantic search to search to every image description we have, and we output similar images
> - admin can search using image only. think of a way so we can output the most similar images (semantic image search)
> - admin can search using both text and image. think of a way to resolve the scoring between these 2.
>
> use any means necessary in our arsenal, z's api key, openrouter api key, etc.
>
> note: the problem is, our image collection is getting crowded now, i am struggling to see the image i want.

### Mid-turn addendum (sent while this analysis was in progress)

> we also have full screen image view. the images search result must support this, so if admin click one of the result, it will pop up the full screen image view

### User-Provided Files

None (`@`-referenced).

### Requirement IDs

| ID | What the user asked for |
|---|---|
| R1 | A search field + an image-upload button, placed above "Album" in the admin image collection screen; clicking a search result opens the existing full-screen photo viewer (mid-turn addendum folded in — same UI surface). |
| R2 | Text-only search: semantic search over every image description, returning similar images. |
| R3 | Image-only search: upload an image, return the most visually/semantically similar images ("semantic image search"). |
| R4 | Combined text+image search: resolve the scoring between the two signals into one ranking. |

---

## Detailed Requirements Understanding

**Problem/Requirement Statement.** `/admin/nina`'s "Image collection" (the renamed profile-picture album, `app/admin/nina/page.tsx:241`) has grown past the point where an operator can find a specific photo by scrolling a folder-paginated grid. The operator wants to type a description (or drop a reference photo, or both) and have the system surface the matching photos, ranked by relevance, regardless of which folder they sit in.

**Success Criteria.**
- A search UI sits above the "Album" label (both the breadcrumb's root crumb and the folder tree's root row carry that text — see Dataflow below) in `components/admin/FileExplorer.tsx`.
- Typing text and searching returns avatars ranked by semantic similarity between the query and each avatar's stored `description`.
- Uploading an image and searching returns avatars ranked by semantic similarity between what that image depicts and each avatar's stored `description`.
- Supplying both ranks by a resolved combination of the two signals.
- Clicking a result opens `components/ui/PhotoViewer.tsx`'s full-screen overlay, scoped to the result set (swipeable between results).
- Search covers the operator's whole album (every folder), not just the folder currently open — the pain point is not knowing where a photo is filed.

**Key Considerations / Constraints Discovered.**
1. **Most avatars have no description today**, which is the load-bearing finding of this analysis (see "Description Coverage Gap" below). A search built only on existing descriptions would cover a small fraction of "hundreds of profile pics."
2. **No embedding infrastructure exists anywhere in this codebase** — no `pgvector`, no embedding client, no vector column. This is greenfield within an otherwise mature, heavily-documented album subsystem.
3. **No native image-embedding (CLIP-style) capability is available** in this repo's vendor arsenal (z.ai's two configured endpoints are both chat/completions-shaped; OpenRouter is used here only for chat/vision fallback). Image-only search must be built from what exists: a vision *captioning* model (`glm-4.6v`, already wired for descriptions) plus a *text* embedding model.
4. Two independent scores in the same embedding space (both are cosine similarities against `nina_avatars.description_embedding`, just against two different query vectors) are directly comparable — a weighted-average combination is valid without rank fusion.
5. The existing upload path (`ninaAlbumUploadActions.ts`) deliberately keeps a heavy vendor call (`describeNinaImages`) **off** the synchronous request path, for a measured, documented reason (hundreds of uploads × 8–11s each). Any embedding work added at upload time must respect that constraint — i.e., stay on the same non-blocking `after()` pattern, not re-introduce an awaited call.
6. `PhotoViewer` (`components/ui/PhotoViewer.tsx`) is a **existing, shared, already-built** full-screen overlay used elsewhere in the app (`NinaAboutScreen.tsx`, chat surfaces, review surfaces) but **not currently wired into `/admin/nina` at all** — the admin explorer's own "full screen" reference in `components/admin/explorer/model.ts:31` is aspirational prose about `SelectionPane`'s 320px rail, not an actual full-screen component. R1's mid-turn addendum is satisfied by wiring this existing component into the admin explorer for the first time, not by building a new viewer.

---

## Analysis Scope

### Explicitly Mentioned Files

None — no `@` files given; target and scope inferred from "in image collection, above 'Album' text."

### Discovered Related Files

**UI / explorer surface**
- `app/admin/nina/page.tsx` — the Server Component page; fetches folders/photos, maps rows to view-model, renders `<FileExplorer>`.
- `components/admin/FileExplorer.tsx` — the client component; owns the toolbar, breadcrumb, tree/content/details layout.
- `components/admin/explorer/model.ts` — `AlbumExplorerPhoto` / `MediaExplorerPhoto` / `ExplorerPhoto` view-model types.
- `components/admin/explorer/FolderTree.tsx` — renders the "Album" root row (label from `NINA_FOLDER_ROOT_LABEL`).
- `components/admin/explorer/PhotoGrid.tsx` — the folder-paginated photo grid (borderless-sheet tile idiom).
- `components/admin/explorer/SelectionPane.tsx` / `AlbumSelectionPane` — the 320px details rail opened by a tile click today.
- `components/ui/PhotoViewer.tsx` — the shared full-screen overlay (`ViewerPhoto { url, kind, label? }`), NOT currently imported anywhere under `components/admin/`.
- `components/admin/explorer/chatPhotoUpload.ts` / `thumbnail.ts` — precedent for client-side canvas re-encode before a bytes-bearing request.
- `lib/admin/filetree/bounds.ts:27` — `export const NINA_FOLDER_ROOT_LABEL = 'Album'`.
- `lib/admin/filetree/mediaView.ts` — `ExplorerView`, `NINA_MEDIA_VIEW_PARAM/VALUE`, `NINA_MEDIA_NODE_LABEL`.

**Data / schema**
- `lib/db/schema/nina/avatars.ts` — `ninaAvatars` (`nina_avatars`) table: `id, userId, blobUrl, pathname, folder, filename, sourceKey, thumbUrl, thumbPathname, width, height, bytes, source, cropScale, cropX, cropY, description, isCurrent, announcedAt, createdAt`. No embedding column today.
- `lib/db/schema.ts` — the schema barrel; `drizzle.config.ts` pins it; migrations live in `./drizzle` (latest: `0021_nina_error_logs.sql`, journal idx 21).
- `lib/nina/queries/avatars.ts` — `listNinaAvatarsInFolder` (`:392-416`, folder-scoped, paginated), `listNinaAvatarFolders` (`:525-`).
- `node_modules/drizzle-orm/pg-core/columns/index.d.ts:35` — `vector_extension/vector.js` is exported; drizzle-orm 0.45.2 natively supports a pgvector `vector({dimensions})` column builder. No `cosineDistance` SQL helper is exported at the top level in this version — a raw `sql` template with the `<=>` operator (already this codebase's idiom for `count(*)`, e.g. `lib/nina/queries/avatars.ts:410`) is the way to express the similarity ORDER BY.

**Description generation (vision pipeline)**
- `lib/nina/vision.ts` — `describeNinaImagesWithFetch` (`:252-`, takes `NinaDescribeImage[] = {dataUri}[]` directly — no blob fetch required), `describeNinaImagesWithFallback` (`:617-`, z.ai then OpenRouter), `describeNinaImages` (`:708-`, the ref-based wrapper that fetches a blob URL and builds the data URI via `toDataUri` at `:673-`). `NinaImageRef = {blobUrl, pathname}` (`:157-160`).
- `lib/nina/prompts/describe.ts` — `NinaDescribeImage = {dataUri: string}` (`:32-35`), `buildDescribeUserContent`, `NINA_DESCRIBE_SYSTEM_PROMPTS`.
- `lib/admin/ninaAlbumDeferredDescribe.ts` — `scheduleDescribe(userId, id)` (`:88-107`): an `after()`-scheduled, non-fatal, non-blocking describe call. **Called from exactly three places**, none of which is "every upload":
  - `lib/admin/ninaAlbumAvatarActions.ts:68` — on `setCurrentNinaAvatarAction` (making a row current).
  - `lib/admin/ninaAlbumAvatarActions.ts:155` — inside `copyChatPhotoIntoAlbum` (adoption from a chat photo).
  - `lib/admin/ninaAlbumUploadActions.ts:182` — **only for `rows[0]`, only when the album had no current avatar before this batch** (`ninaAlbumUploadActions.ts:179-183`).
- `lib/admin/ninaAlbumDescribeActions.ts` — `describeNinaAvatarAction`, the manual "Describe it" button; `ensureNinaAvatarDescriptionAction`, the share-to-Nina in-band describe.
- `env.LLM_VISION_BASE_URL` = `https://api.z.ai/api/coding/paas/v4` (glm-4.6v, OpenAI-shaped chat/completions), `env.LLM_BASE_URL` = `https://api.z.ai/api/anthropic` (glm-5.3, Anthropic-compatible) — both authenticated with the single `LLM_API_KEY` (`lib/env.ts:11-24, 46-57`). Neither base URL is an embeddings endpoint.

**OpenRouter**
- `lib/nina/openrouter.ts` — zero-import constants module: `OPENROUTER_CHAT_URL = 'https://openrouter.ai/api/v1/chat/completions'`, `NINA_VISION_FALLBACK_MODEL = 'z-ai/glm-5.3-flash'`, `NINA_CHAT_FALLBACK_MODEL_IDS`. No embeddings URL or model declared anywhere in the repo today. `env.OPENROUTER_API_KEY` is validated (`lib/env.ts:128`) but otherwise only ever read by the chat/vision fallback call sites (per the "z.ai key, both endpoints" / `ci:openrouter-guard` convention this repo enforces).

**Admin action plumbing**
- `lib/admin/ninaAlbumActions.ts` — the barrel; re-exports every Server Action the explorer calls, from five sibling files (`ninaAlbumDescribeActions.ts`, `ninaAlbumAvatarActions.ts`, `ninaAlbumUploadActions.ts`, `ninaAlbumFolderActions.ts`, `ninaAlbumDeferredDescribe.ts`).
- `lib/admin/requireAdmin.ts:69-78` — `requireAdmin()`: the gate every admin Server Action and the page itself call first.
- `lib/admin/ninaAlbumActions.ts:43-` — `AdminActionResult { ok, error?, id?, description? }`, the shared action-result shape.
- `lib/nina/album.ts:78` — `NINA_ADMIN_PAGE_SIZE = 120`.
- `lib/nina/errorlogs.ts:110-` — `logNinaError`, the shared non-fatal error-logging sink `vision.ts`'s fallback path already uses.

### Reference List

| Symbol / key | File:line | Kind | Package |
|---|---|---|---|
| `ninaAvatars` (`nina_avatars` table) | `lib/db/schema/nina/avatars.ts:150` | def | `lib/db/schema` |
| `description` column | `lib/db/schema/nina/avatars.ts:198` | def | `lib/db/schema` |
| `NINA_FOLDER_ROOT_LABEL = 'Album'` | `lib/admin/filetree/bounds.ts:27` | def | `lib/admin` |
| `FileExplorer` toolbar/breadcrumb JSX | `components/admin/FileExplorer.tsx:328-447` | render | `components/admin` |
| `PhotoGrid` | `components/admin/explorer/PhotoGrid.tsx:63-217` | def | `components/admin/explorer` |
| `PhotoViewer` | `components/ui/PhotoViewer.tsx:61-285` | def, unused-by-admin | `components/ui` |
| `AlbumExplorerPhoto` / `ExplorerPhoto` | `components/admin/explorer/model.ts:69,122` | def | `components/admin/explorer` |
| `listNinaAvatarsInFolder` | `lib/nina/queries/avatars.ts:392-416` | def, call | `lib/nina/queries` |
| `scheduleDescribe` | `lib/admin/ninaAlbumDeferredDescribe.ts:88-107` | def | `lib/admin` |
| `scheduleDescribe` call (promotion) | `lib/admin/ninaAlbumAvatarActions.ts:68` | call | `lib/admin` |
| `scheduleDescribe` call (adoption) | `lib/admin/ninaAlbumAvatarActions.ts:155` | call | `lib/admin` |
| `scheduleDescribe` call (upload, first row only) | `lib/admin/ninaAlbumUploadActions.ts:179-183` | call | `lib/admin` |
| `registerNinaAvatarsAction` insert loop | `lib/admin/ninaAlbumUploadActions.ts:162-196` | def | `lib/admin` |
| `describeNinaImagesWithFetch` | `lib/nina/vision.ts:252-` | def | `lib/nina` |
| `describeNinaImagesWithFallback` | `lib/nina/vision.ts:617-` | def | `lib/nina` |
| `describeNinaImages` (blob-ref wrapper) | `lib/nina/vision.ts:708-` | def | `lib/nina` |
| `NinaDescribeImage { dataUri }` | `lib/nina/prompts/describe.ts:32-35` | def | `lib/nina/prompts` |
| `OPENROUTER_CHAT_URL` | `lib/nina/openrouter.ts:34` | def | `lib/nina` |
| `env.OPENROUTER_API_KEY` | `lib/env.ts:128` | def | `lib/env` |
| `env.LLM_API_KEY` / `LLM_VISION_BASE_URL` / `LLM_BASE_URL` | `lib/env.ts:48,52,56` | def | `lib/env` |
| `requireAdmin` | `lib/admin/requireAdmin.ts:69-78` | def | `lib/admin` |
| `AdminActionResult` | `lib/admin/ninaAlbumActions.ts:43-49` | def | `lib/admin` |
| `NINA_ADMIN_PAGE_SIZE = 120` | `lib/nina/album.ts:78` | def | `lib/nina` |
| pgvector column builder `vector()` | `node_modules/drizzle-orm/pg-core/columns/vector_extension/vector.d.ts` | def (dependency) | `drizzle-orm` |
| Latest migration | `drizzle/0021_nina_error_logs.sql`, `drizzle/meta/_journal.json` idx 21 | def | `drizzle` |

---

## Current Dataflow

### Entry Point: `/admin/nina` (album view)

**Location:** `app/admin/nina/page.tsx:85`
**Trigger:** GET, gated by `requireAdmin()` (`:86`).
**Input:** `?folder=`, `?page=`, `?view=` search params, each validated (`validateFolderPath`, `readPage`, `readExplorerView`).
**Processing:** `listNinaAvatarsInFolder(userId, folder, {limit: 120, offset})` (album arm) or `listNinaMediaPhotos` (media arm), plus `listNinaAvatarFolders` for the tree and `countNinaMediaPhotos` for the badge — all run in one `Promise.all`.
**Output:** Rows mapped to `AlbumExplorerPhoto`/`MediaExplorerPhoto` (`page.tsx:202-217`, `:137-168`), handed to `<FileExplorer>` as `photos`, `folders`, `page`, `view`, `mediaCount`, `shareOrigin`.

### FileExplorer's render (client)

**Location:** `components/admin/FileExplorer.tsx:87-550`.
The returned JSX is, top to bottom: a toolbar `<div>` (`:338-447`) containing the breadcrumb (`<nav>`, first crumb = "Album", `:339-375`) and the Add/upload controls (`:377-446`); an optional notice (`:449`); then a CSS grid (`:456-547`) of `[FolderTree (renders "Album" root row + count) | content pane (PhotoMoveBar + PhotoGrid + UploadQueue) | SelectionPane, if a tile is selected]`.

A tile click (`PhotoGrid.tsx:129-131`, `onSelect(photo.id)`) sets `selectedId` in `FileExplorer` state (`:251-253`), which mounts `SelectionPane` (`:535-546`) — a 320px rail showing the full-resolution `photo.url`, not a full-screen overlay. No code path in `components/admin/**` currently imports `components/ui/PhotoViewer.tsx`.

### Upload path (batch register)

**Location:** `lib/admin/ninaAlbumUploadActions.ts` (`registerNinaAvatarsAction`, body around `:140-196`).
1. Client walks a folder/file picker (`FileExplorer.tsx:255-260`, `useFolderUpload.ts`), computing `sourceKey` dedupe keys and PUTting new bytes to Blob directly.
2. `registerNinaAvatarsAction` batch-inserts the new rows (`insertNinaAvatars`, `:162-177`) — **`description` is left NULL at insert time; there is no per-row describe call in this loop.**
3. `if (!hadCurrent && first != null)`: only when the album was previously empty, the FIRST inserted row is promoted to current and `scheduleDescribe(userId, first.id)` fires (`:179-183`) — an `after()` callback that fetches the row, calls `describeNinaImages`, and writes `description` back, non-fatally.
4. Every OTHER row in the batch — which, for "hundreds of profile pics," is nearly the entire album — is inserted with `description = NULL` and **stays NULL indefinitely** unless later: made current (`setCurrentNinaAvatarAction`), manually described (`describeNinaAvatarAction`), or shared to Nina (`ensureNinaAvatarDescriptionAction`).

### Description Coverage Gap (the analysis's central finding)

Given the above, a text-semantic-search feature built on `nina_avatars.description` would, on a real "hundreds of photos" album, search only the tiny subset of rows that happen to have been promoted, shared, or manually described — not "every image description we have" in the sense the user means it (they mean *every image*). This is not a bug in existing code — `lib/admin/ninaAlbumDeferredDescribe.ts:16-55`'s header explicitly and deliberately keeps describe off the synchronous upload path, for a measured reason (hundreds of uploads × 8-11s awaited = 40min-1.4h wall-clock, documented there). It is, however, a gap this feature cannot ship without closing, because search coverage IS the feature. The fix must preserve the existing constraint (no operator-visible latency added to an upload) while achieving coverage — i.e., it must extend the same non-blocking `after()` pattern to every uploaded row (not just the first), plus a one-time backfill for the rows already sitting in production with `description IS NULL`.

### Exit Points (today, pre-feature)
- Rendered grid of thumbnails (`PhotoGrid`), a 320px details rail (`SelectionPane`), Server Action writes (`revalidatePath('/admin/nina')`), and non-fatal deferred `description` writes via `after()`.

---

## Key Data Structures

### Table: `nina_avatars`
**Location:** `lib/db/schema/nina/avatars.ts:150-224`.
**Fields (today):** `id, userId, blobUrl, pathname, folder, filename, sourceKey, thumbUrl, thumbPathname, width, height, bytes, source, cropScale, cropX, cropY, description, isCurrent, announcedAt, createdAt`.
**Indexes:** `nina_avatars_user_current_unq` (partial unique on `is_current`), `nina_avatars_user_created_idx`, `nina_avatars_user_folder_created_idx`, `nina_avatars_user_source_key_unq`.
**Used in:** every query in `lib/nina/queries/avatars.ts`; every Server Action in `lib/admin/ninaAlbum*.ts`.

### `ExplorerPhoto` view-model union
**Location:** `components/admin/explorer/model.ts:25-122`. `AlbumExplorerPhoto` (`origin: 'album'`) and `MediaExplorerPhoto` (`origin: 'media'`) share `ExplorerPhotoBase {id, url, filename, width, height, bytes, source, isCurrent, description, crop, createdAt, folder, thumbUrl}`.

### `ViewerPhoto` (the reusable full-screen viewer's input shape)
**Location:** `components/ui/PhotoViewer.tsx:47-59`. `{ url: string; kind: string; label?: string }` — structurally compatible with an `AlbumExplorerPhoto` mapped as `{url: photo.url, kind: photo.source, label: photo.filename}`.

---

## Dependencies

### Configuration / Environment
- `LLM_API_KEY`, `LLM_VISION_BASE_URL`, `LLM_VISION_MODEL` (`lib/env.ts:48-53`) — the existing z.ai vision/describe path.
- `LLM_BASE_URL`, `LLM_MODEL` (`:56-57`) — the existing z.ai text-chat path (Anthropic-compatible; unrelated to embeddings).
- `OPENROUTER_API_KEY` (`:128`) — validated, currently used only by chat/vision fallback call sites.
- `DATABASE_URL` / `DATABASE_URL_UNPOOLED` (Neon Postgres) — Neon supports the `vector` (pgvector) extension; none is enabled in this repo today (`drizzle/*.sql` has no `CREATE EXTENSION` for it).

### External Services
- z.ai (coding + Anthropic-compatible endpoints) — chat/vision only, no confirmed embeddings surface at either configured base URL.
- OpenRouter — chat/completions only in this repo today; its `/api/v1/embeddings` surface is not yet used or probed here.
- Vercel Blob — where avatar bytes live; a search-query image does **not** need to be written here (see Decision 5 in the plan index — `describeNinaImagesWithFetch` accepts a `NinaDescribeImage{dataUri}` directly, no blob round-trip required for an ephemeral query image).

### npm packages
- `drizzle-orm@0.45.2` — has native `vector()` pgvector column support (`pg-core/columns/vector_extension`); no `cosineDistance` helper exported, so similarity ordering is a raw `sql` template using `<=>`, matching this codebase's existing `sql<number>` idiom.
- No embedding/vector-search npm package (`pgvector`, `@pinecone-database`, etc.) is installed.

---

## Impact Points (files that WILL need changes)

1. `lib/db/schema/nina/avatars.ts` — add `descriptionEmbedding` (vector column) + supporting metadata; new migration under `drizzle/`. *(Phase 1)*
2. `lib/nina/openrouter.ts` / a new `lib/nina/embedding.ts` — embeddings client constants + server-only fetch wrapper. *(Phase 1)*
3. `lib/admin/ninaAlbumDeferredDescribe.ts` — extend to compute + store the embedding alongside every description write; extend to cover every uploaded row, not just the first. *(Phase 2)*
4. `lib/admin/ninaAlbumUploadActions.ts` — batch-schedule describe+embed for all inserted rows (bounded concurrency), not just `rows[0]`. *(Phase 2)*
5. `lib/admin/ninaAlbumDescribeActions.ts`, `lib/admin/ninaAlbumAvatarActions.ts` — every other site that writes `description` must also (re)compute the embedding. *(Phase 2)*
6. A new one-time backfill entry point for existing NULL-description rows. *(Phase 2)*
7. `lib/nina/queries/` — new cosine-similarity search query/queries (text-only, image-caption-only, combined). *(Phase 3)*
8. `lib/admin/ninaAlbumSearchActions.ts` (new) + `lib/admin/ninaAlbumActions.ts` barrel — the `searchNinaAvatarsAction` Server Action. *(Phase 3)*
9. `components/admin/explorer/PhotoSearchBar.tsx` (new), a results-grid component (new), `components/admin/FileExplorer.tsx` — the search UI, placed above the "Album" breadcrumb; wiring result clicks to `components/ui/PhotoViewer.tsx`. *(Phase 4)*

**This document describes. The plan files prescribe.**
