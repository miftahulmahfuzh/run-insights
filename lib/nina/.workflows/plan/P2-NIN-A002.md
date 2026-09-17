> Adopted from `MEDIA_ALBUM_UNIFIED_SEARCH_PLAN.md` phase 2. Source: `.workflows/plan/media-album-unified-search/phase-2.md`.
> Written and reconciled by /analyze — edit the source, not this copy.

# Phase 2: Query/action layer — merged search, media embedding pipeline, link-not-copy promotion, deletion guard

**Plan set:** `MEDIA_ALBUM_UNIFIED_SEARCH_PLAN.md`
**Analysis:** `20260917-091446-W0FK_code_analyzer.md`
**Satisfies:** R1 (one merged deduplicated search over both tables), R2 (keywords on every Media row), R3 (link-not-copy promotion + one place the description/keywords live)
**Depends on:** Phase 1
**Difficulty:** HARD
**Package:** `lib/nina/queries`, `lib/admin`

---

## Goal

After this phase, `nina_message_images` has the same describe→embed→search pipeline `nina_avatars`
has had since `admin-album-semantic-search`, and one Server Action ranks BOTH tables into one
deduplicated list. "Set as her profile picture" writes a POINTER row (`source_image_id` set, same
`blob_url`, no `fetch`, no `put`, no `description`) instead of a byte copy, every read and write of
a pointer row's description/keywords redirects to the Media row it names, and deleting either side
refuses rather than orphaning. No component and no page changes — Phase 3 consumes the contracts
below as given.

## Assumptions (Phase 1 has landed)

Quoted as they will look AFTER Phase 1, not as they look at `b8b4aeb`:

1. `lib/db/schema/nina/chat.ts`'s `ninaMessageImages` carries `searchKeywords: text('search_keywords')`,
   `negativeSearchKeywords: text('negative_search_keywords')` and
   `descriptionEmbedding: vector('description_embedding', { dimensions: NINA_EMBEDDING_DIMENSIONS })`,
   plus an HNSW `vector_cosine_ops` index — the exact shapes `nina_avatars` already declares.
2. `lib/db/schema/nina/avatars.ts`'s `ninaAvatars` carries
   `sourceImageId: text('source_image_id').references((): AnyPgColumn => ninaMessageImages.id, { onDelete: 'restrict' })`,
   plus the plain btree index `nina_avatars_source_image_id_idx` on it.
   **SETTLED BY THE RECONCILER (2026-09-17):** Phase 1 declared the FK at the DRIZZLE level, not in
   raw migration SQL. It broke the `avatars ⇄ chat` cycle by moving `NINA_EMBEDDING_DIMENSIONS` into
   a new leaf module `lib/db/schema/nina/embedding.ts` (re-exported by `avatars.ts`, so
   `@/lib/db/schema`'s surface is unchanged) and re-probed both module-entry orders green. So
   `ninaAvatars.sourceImageId` IS a drizzle column object with a real `.references()`, this phase
   reads and writes it as one, and **there is no raw-SQL fallback to carry** — any note in this file
   implying otherwise has been removed. Phase 1's index is named `nina_avatars_source_image_id_idx`;
   use that spelling wherever this phase names it.
3. Phase 1 touched **no** query, action, or UI file. So `avatarColumns`, `NinaAvatarRow` and
   `NinaAvatarBatchInsert` do **not** yet know about `source_image_id`, and adding them is Step 1
   of this phase.

## Interface Contract

**Creates (query layer — `lib/nina/queries/`):**
- `lib/nina/queries/imageEmbeddings.ts` (new file, §5c): `NinaImageDescribeTarget` (type),
  `listNinaMessageImageDescribeTargets`, `listNinaMessageImageDescribeBacklog`,
  `NinaImageDescribeBacklogCount` (type), `countNinaMessageImageDescribeBacklog`,
  `setNinaMessageImageDescriptionAndEmbedding`, `setNinaMessageImageSearchKeywordsAndEmbedding`,
  `setNinaMessageImageNegativeSearchKeywords`
- `lib/nina/queries/avatarPointer.ts` (new file, §9e): `NinaLinkedPhotoText` (type),
  `resolveNinaAvatarLinkedText`
- `lib/nina/queries/images.ts`: `countNinaAvatarsLinkedToImage` (`images.ts`, beside
  `isBlobPathnameReferenced`)
- `lib/nina/queries/shapes.ts`: `NinaPhotoSearchOrigin`, `NinaPhotoSearchRow`, `NinaPhotoSearchPage`

**Creates (admin layer — `lib/admin/`):**
- `lib/admin/ninaMediaDeferredDescribe.ts` (new file): `NINA_MEDIA_DEFERRED_DESCRIBE_CONCURRENCY`,
  `NINA_MEDIA_DEFERRED_DESCRIBE_BUDGET_MS`, `NINA_MEDIA_BACKFILL_BUDGET_MS`,
  `NINA_MEDIA_BACKFILL_SLICE`, `embedNinaMessageImageDescription`,
  `fillNinaMessageImageDescribeTargets`, `scheduleMediaDescribe`, `scheduleMediaEmbed`
- `lib/admin/chatPhotoKeywordActions.ts` (new `'use server'` file):
  `editNinaMessageImageSearchKeywordsAction`, `editNinaMessageImageNegativeSearchKeywordsAction`
- `lib/admin/chatPhotos.ts`: `ADMIN_CHAT_PHOTO_MAX_SEARCH_KEYWORDS_CHARS`,
  `ADMIN_CHAT_PHOTO_MAX_NEGATIVE_SEARCH_KEYWORDS_CHARS`
- `lib/admin/chatPhotoSchema.ts`: `chatPhotoSearchKeywordsField`, `chatPhotoSearchKeywordsSchema`,
  `chatPhotoNegativeSearchKeywordsField`, `chatPhotoNegativeSearchKeywordsSchema`

**Renames:**
- `searchNinaAvatarsByText` -> `searchNinaPhotosByText`
- `searchNinaAvatarsByImageCaption` -> `searchNinaPhotosByImageCaption`
- `searchNinaAvatarsByTextAndCaption` -> `searchNinaPhotosByTextAndCaption`
  (all three in `lib/nina/queries/avatarsearch.ts`, which keeps its path — see Step 8's note)
- `copyChatPhotoIntoAlbum` -> `linkChatPhotoIntoAlbum` (module-private, `ninaAlbumAvatarActions.ts`)

**Deletes:**
- `NinaAvatarSearchRow`, `NinaAvatarSearchPage` (`lib/nina/queries/shapes.ts:496,520`) — replaced by
  `NinaPhotoSearchRow` / `NinaPhotoSearchPage`; no runtime importer outside `avatarsearch.ts`
- `avatarExtFor` (`lib/admin/ninaAlbumAvatarActions.ts:244`) — a link mints no new object, so there
  is no extension to validate
- the `import { put } from '@vercel/blob'`, `adminAvatarPathname`, `contentTypeForAvatarExt`,
  `ADMIN_AVATAR_EXTS`, `AdminAvatarExt` and `newId` imports of `ninaAlbumAvatarActions.ts`

**Signature changes:**
- `avatarColumns` gains `sourceImageId` **appended after `createdAt`** (`queries/columns.ts:99`) —
  so `NinaAvatarRow` gains `sourceImageId: string | null` as its LAST field
- `imageColumns` gains `searchKeywords` and `negativeSearchKeywords`, **appended after `createdAt`**
  (`queries/columns.ts`) — so `NinaImageRow` gains both as `string | null`, as its last two fields.
  Added by the reconciler: Phase 3's media arm and `MediaExplorerPhoto` both require them and
  Phase 3 may not touch this package. Appended, not inserted, so the two positional `imageRow()`
  fixtures need no edit. See Step 1.
- `NinaAvatarBatchInsert` gains `sourceImageId?: string | null`; `insertNinaAvatars` writes it
- `AdminSearchHit` (`lib/admin/ninaAlbumActions.ts:94`) gains
  `origin: 'album' | 'media'` and `searchKeywords`/`negativeSearchKeywords: string | null`
- `toHit` (`lib/admin/ninaAlbumSearchActions.ts:94`) takes a `NinaPhotoSearchRow`

**Requires (from earlier phases):** the three new `nina_message_images` columns and
`nina_avatars.source_image_id`, all from Phase 1.

**Leaves alone (owned by others):** `components/admin/explorer/*`, `app/admin/nina/page.tsx`
(Phase 3); `lib/db/schema/**` (Phase 1); `app/api/admin/nina/backfill-descriptions/route.ts` and any
new media backfill route (Phase 4).

## Decisions this phase makes, and why

| Fork | Chosen | Why |
|---|---|---|
| Extend `ninaAlbumDeferredDescribe.ts` with a `kind`, or add a sibling? | **Sibling** `lib/admin/ninaMediaDeferredDescribe.ts` | The discriminant would have to be threaded through `fillOne`, `runFillLanes`, `scheduleFill` AND `embedNinaAvatarDescription`'s two existing callers. And the fork is not a table swap: the album's describe subject is always `describeSubjectForSide('hers')`, a Media row's is `describeSubjectForSide(photoSideOf(row.kind))`. That is a real behavioural branch inside `fillOne`. The existing file's own header ("a module of its own, beside `queries/avatars.ts`") argues the same way. |
| `ADMIN_CHAT_PHOTO_MAX_SEARCH_KEYWORDS_CHARS`: import `ADMIN_AVATAR_MAX_SEARCH_KEYWORDS_CHARS`, or declare a sibling? | **Declare siblings in `lib/admin/chatPhotos.ts`, both 500** | `lib/admin/avatars.ts:192`'s own docstring forbids the import in as many words: *"NOT `ADMIN_CHAT_PHOTO_MAX_DESCRIPTION_CHARS` … sharing a bound here would assert a kinship that does not exist"*, and its twin at `:206` adds *"the two columns' bounds happening to agree today is not a promise that they always will."* Two constants that agree beats one that is shared across a boundary the file already ruled on. |
| Where does the keyword read redirection live? | **Query layer** — `resolveNinaAvatarLinkedText` in a new `queries/avatarPointer.ts` | Option (b) (join in `page.tsx`) leaves the WRITE redirection — which `editNinaAvatarDescriptionAction`, `describeNinaAvatarAction` and the two album keyword actions all need — with nowhere to live but duplicated into Phase 3's package. A batch resolver (one `inArray` statement per page render, `listNinaAvatarDescribeTargets`'s exact shape) keeps read and write logic in one module. |
| Does `deleteNinaAvatarAction` still call `promoteNinaAvatarDependents` for a pointer row? | **Yes — it is NOT a no-op** | Re-read `provenancePromotion.ts:79-96` and `listUnmeasuredNinaImageDependents`: it looks for `nina_message_images` rows whose `source_avatar_id` names THIS avatar. A pointer row can perfectly well have been shared into chat (F37 R3), and that chat row's `ON DELETE SET NULL` fires inside the same DELETE. Skipping the promotion would mint exactly the ghost the module exists to bury. |
| Does it still call `releaseBlobIfUnreferenced` for a pointer row? | **No** | It would be *safe* (the Media row still names the pathname, so `isBlobPathnameReferenced` answers `true` and the object is kept) but it is two SELECTs and a `del`-adjacent code path asking a question whose answer the FK already guarantees. Skipping it is the statement of the invariant: a pointer never owned bytes. A pointer also has `thumb_url = NULL` by construction (nothing generates a thumbnail for one), so the second release is unreachable anyway. |
| Media search scope: does an already-adopted Media row still rank? | **A row a LEGACY COPY adopted does not; a row a POINTER names does** | `generatedChatPhotoScope:523-564` already rules that when the same physical photograph exists on both sides, *"the copy is the survivor and the original is the one hidden."* The 18 pre-existing `source_key LIKE 'chat-photo:%'` album rows are exactly that case and would otherwise be R1's forbidden duplicate. But a NEW pointer row ALSO carries `source_key = 'chat-photo:<id>'` (Step 6 keeps it for idempotency), and hiding its Media row would hide the only ranked half of the pair. So the `NOT EXISTS` arm is qualified with `AND source_image_id IS NULL`: only a copy hides its original. |
| Rename `avatarsearch.ts`? | **No** | The file keeps every load-bearing comment (the hand-written `<=>`, the weighted-average identity, the JS relevance floor, the tiebreak) and is where the three ranking constants live. A path change would make every `lib/nina/queries/avatarsearch.ts` reference in `package_readme.md`, `todos.md`, `scripts/search-analysis.mjs` and the schema headers dangle. The functions are renamed; the module is not moved. |

---

## Files

| File | Action | What changes |
|---|---|---|
| `lib/nina/queries/columns.ts:51,99` | modify | `avatarColumns` gains `sourceImageId`; `imageColumns` gains `searchKeywords`/`negativeSearchKeywords` — **both appended after each list's `createdAt`**, so every positional fixture keeps its existing positions |
| `lib/nina/queries/shapes.ts:396,455,496-524` | modify | `NinaAvatarRow.sourceImageId`; `NinaImageRow.searchKeywords`/`.negativeSearchKeywords`; `NinaAvatarBatchInsert.sourceImageId?`; `NinaAvatarSearchRow`/`Page` replaced by `NinaPhotoSearchOrigin`/`Row`/`Page` |
| `lib/nina/queries/avatars.ts:768` | modify | `insertNinaAvatars` writes `sourceImageId` |
| `lib/nina/queries/imageEmbeddings.ts` | create | the Media twin of `avatarEmbeddings.ts` — six statements |
| `lib/nina/queries/avatarPointer.ts` | create | `resolveNinaAvatarLinkedText` — the pointer read redirection |
| `lib/nina/queries/images.ts:1165` | modify | `countNinaAvatarsLinkedToImage`, beside `isBlobPathnameReferenced` |
| `lib/nina/queries/avatarsearch.ts` | modify | the merged two-arm ranking; three functions renamed |
| `lib/nina/queries.ts:63-77` | modify | two new `export *` lines + the map comment |
| `lib/admin/ninaMediaDeferredDescribe.ts` | create | the Media `after()` describe+embed worker |
| `lib/admin/chatPhotos.ts:188` | modify | two new character bounds |
| `lib/admin/chatPhotoSchema.ts:148` | modify | two new Zod field/schema pairs |
| `lib/admin/chatPhotoKeywordActions.ts` | create | the two Media keyword Server Actions |
| `lib/admin/chatPhotoActions.ts:623,720,795` | modify | `removeChatPhotoAction` pointer guard; the two describe writers schedule a Media embed |
| `lib/admin/ninaAlbumDescribeActions.ts:64,135,212,263` | modify | all four album actions redirect on a pointer row |
| `lib/admin/ninaAlbumAvatarActions.ts:122,189,244,324` | modify | link not copy; pointer-aware delete |
| `lib/admin/ninaAlbumSearchActions.ts:12-16,79-128,186` | modify | merged search call, `toHit` over both origins |
| `lib/admin/ninaAlbumActions.ts:94` | modify | `AdminSearchHit` gains `origin` + the two keyword fields |
| `lib/nina/queries.test.ts:44` | modify | `BARREL_VALUE_EXPORTS` 96 → 104 |
| `tests/nina.avatarSearch.test.ts` | modify | renamed callees + the merged-arm assertions |
| `tests/admin.albumSearch.test.ts` | modify | renamed mocks, `origin` on the hit |
| `tests/admin.chatPhotoAdoption.test.ts:117` | modify | link-not-copy rewrite + `avatarRow` gains a 21st value |
| `tests/admin.albumAvatarActions.test.ts:76` | modify | `avatarRow` gains a 21st value |
| `tests/admin.albumDescribeEmbed.test.ts:65` | modify | `avatarRow` gains a 21st value + the pointer-redirect cases |
| `tests/admin.albumAvatarDelete.test.ts` | modify | the pointer-delete case |
| `tests/admin.chatPhotos.test.ts:420` | modify | **ONE LINE, and this phase is RED without it** — `countNinaAvatarsLinkedToImage` added to the wholesale `@/lib/nina/queries` mock factory. See Step 14l. |
| `tests/nina.mediaSearch.test.ts` | create | the Media arm's generated SQL and the merge rule |
| `tests/nina.mediaEmbeddings.test.ts` | create | `imageEmbeddings.ts` + `avatarPointer.ts` |
| `tests/admin.mediaKeywords.test.ts` | create | the two new actions + the two describe writers' embed scheduling |
| `tests/admin.mediaDescribeEmbed.test.ts` | create | `ninaMediaDeferredDescribe.ts` |

---

## Implementation Steps

### Step 1: Teach the query layer that an album row can be a pointer

**File:** `lib/nina/queries/columns.ts:99` (end of `avatarColumns`)
**Change:** append `sourceImageId`. **Appended and not placed beside `description`** on purpose:
every `avatarRow()` fixture in `tests/` is a POSITIONAL `projectedRow(...)`, so appending means each
one needs one extra value at the end rather than a reshuffle that silently mis-assigns every field
after the insertion point.

**Code** — the two lines that replace `createdAt: ninaAvatars.createdAt,`:

```ts
  createdAt: ninaAvatars.createdAt,
  /**
   * media-album-unified-search R3. The `nina_message_images` row this album entry is a POINTER to,
   * or NULL for an ordinary album row that owns its own bytes.
   *
   * **APPENDED, deliberately, rather than placed beside `description` where it belongs
   * semantically.** Every `avatarRow()` fixture under `tests/` is a positional
   * `projectedRow(...)` over this list, so an insertion in the middle would silently re-assign
   * every field after it; an append costs each fixture one extra value and nothing else.
   *
   * Non-null means all four of `description`, `search_keywords`, `negative_search_keywords` and
   * `description_embedding` on THIS row are permanently NULL and the truth lives on the Media row
   * — see `lib/nina/queries/avatarPointer.ts` and the column's own header in
   * `lib/db/schema/nina/avatars.ts`.
   */
  sourceImageId: ninaAvatars.sourceImageId,
```

**File:** `lib/nina/queries/shapes.ts:395` (inside `NinaAvatarRow`, after `createdAt: Date`)

```ts
  createdAt: Date
  /**
   * media-album-unified-search R3. The `nina_message_images.id` whose bytes this row shows, or
   * `null` for an ordinary album row.
   *
   * **A non-null value is a promise about four OTHER fields on this row**: `description`,
   * `searchKeywords`, `negativeSearchKeywords` and the (never-projected) `description_embedding`
   * are all NULL, forever, and the operator's real values live on the row this names. Nothing may
   * render `row.description` for a pointer without going through
   * `resolveNinaAvatarLinkedText` (`lib/nina/queries/avatarPointer.ts`) first. Last in the
   * interface because it is last in `avatarColumns`; see that list's note for why.
   */
  sourceImageId: string | null
```

**File:** `lib/nina/queries/shapes.ts:454` (inside `NinaAvatarBatchInsert`, after `contentHash`)

```ts
  contentHash?: string | null
  /**
   * media-album-unified-search R3. The `nina_message_images.id` this row POINTS AT — set by
   * exactly one writer, `linkChatPhotoIntoAlbum` (`lib/admin/ninaAlbumAvatarActions.ts`), and by
   * nothing else ever.
   *
   * Optional for `contentHash`'s stated reason and not `sourceKey`'s: an absent value and an
   * explicit null are the same fact, and the folder-upload writer — the other caller of this
   * shape — mints rows that own their bytes and must never set it. A row that sets this must
   * leave `description` unset, because a pointer's prose lives on the row it names.
   */
  sourceImageId?: string | null
```

**File:** `lib/nina/queries/avatars.ts:773` (inside `insertNinaAvatars`'s `.values(...)` map, after
the `contentHash` line)

```ts
        contentHash: input.contentHash ?? null,
        /* media-album-unified-search R3. `?? null` for `contentHash`'s reason. It takes no part in
         * `onConflictDoNothing` below: `(user_id, source_key)` stays the only key this statement
         * conflicts on, which is what keeps re-adoption a constraint decision rather than a
         * second pointer row. */
        sourceImageId: input.sourceImageId ?? null,
        isCurrent: false,
```

**File:** `lib/nina/queries/columns.ts` (inside `imageColumns`, **appended after `createdAt`**)

**Added by the reconciler (2026-09-17).** Phase 3's `app/admin/nina/page.tsx` media arm maps
`row.searchKeywords` / `row.negativeSearchKeywords` off `listNinaMediaPhotos`' rows, and
`MediaExplorerPhoto` declares both as REQUIRED. `imageColumns` is the projection those rows come
from and it is this phase's file, so the two columns are threaded here rather than in Phase 3 (which
may not touch `lib/nina/queries/*`). Without this the UI phase does not compile and R2's media half
has no value to render.

This is NOT in tension with `imageEmbeddings.ts`'s header rule ("none of them may go through
`imageColumns`") — that rule is about `description_embedding`, ~1536 float4s over a 48-row page. Two
short text columns cost what `description` costs and are read on exactly the surface that renders
them, which is `description`'s own argument for being here.

**APPENDED, not placed beside `description` where they belong semantically — the same call
`avatarColumns` makes two blocks up, for the same measured reason, and here it is load-bearing
rather than merely convenient.** Two positional `imageRow()` fixtures project this list:
`tests/admin.chatPhotoAdoption.test.ts:96` and `tests/nina.chatPhotoAdoption.test.ts:48` (**verified
against the tree, 2026-09-17**). Both stop at **14** of the list's 17 values, so the trailing columns
they never fill cost them nothing — but an insertion after `description` would shift `prompt`,
`sourceAvatarId` and `sourceImageId` left by two in both, silently re-assigning the very two
provenance fields the adoption guard reads. `tests/nina.chatPhotoAdoption.test.ts` is **not in this
phase's Files table and should not need to be**; appending is what keeps that true.

```ts
  createdAt: ninaMessageImages.createdAt,
  /* media-album-unified-search R2, 2026-09-17. The media twin of `avatarColumns`' keyword pair, and
   * read for the same two reasons: the Media pane edits it, and `ninaMediaDeferredDescribe`'s embed
   * pass folds it into the text the vector is computed from. Never ranked against directly — see
   * the column's own header in `lib/db/schema/nina/chat.ts`.
   *
   * APPENDED rather than placed beside `description`, where it belongs semantically: two positional
   * `imageRow()` fixtures project this list and an insertion would silently re-assign every field
   * after it, including the two provenance ids the adoption guard reads. `avatarColumns` makes this
   * exact argument for `sourceImageId` two blocks up. */
  searchKeywords: ninaMessageImages.searchKeywords,
  /* media-album-unified-search R2, 2026-09-17. Read by the Media pane (to edit) and by the merged
   * ranker's `matchesNegativeKeyword` pass (to exclude a row from a query it names). Never folded
   * into the embedded text. Appended for its neighbour's reason. */
  negativeSearchKeywords: ninaMessageImages.negativeSearchKeywords,
```

**File:** `lib/nina/queries/shapes.ts` — `NinaImageRow` (the shape `imageColumns` projects into)
gains the matching `searchKeywords: string | null` and `negativeSearchKeywords: string | null`, as
its LAST two fields, documented as above. Every existing construction site is a
`db.select(imageColumns)`, so nothing hand-builds this shape and nothing breaks.

**Impact of the `imageColumns` widening: none on any existing fixture, by construction.** Because
both columns are appended, the two positional `imageRow()` fixtures keep every value they already
bind at the position it already occupies, and simply do not fill the two new trailing ones — which
reads as `null`/`undefined`, the value an untagged row genuinely has, and which no assertion in
either file touches. `tests/admin.chatPhotos.test.ts`'s `imageRow` is an OBJECT literal, not a
positional row, and is unaffected either way. **If a case ever needs a tagged media row**, the
fixture gains two trailing values; nothing needs it in this phase.

**Impact:** `NinaAvatarRow` grows one field, so the three positional `avatarRow()` fixtures
(`tests/admin.albumDescribeEmbed.test.ts:65`, `tests/admin.chatPhotoAdoption.test.ts:117`,
`tests/admin.albumAvatarActions.test.ts:76`) each need a 21st value — see Step 13.
`tests/admin.albumUploadActions.test.ts:90` builds an object literal, not a positional row, and is
unaffected. Phase 3's `app/admin/nina/page.tsx` mapping is structurally unaffected (an extra
property is invisible to a narrowing map) — flagged to Phase 3 in **Handoffs**.

---

### Step 2: The Media embedding read/write helpers

**File:** `lib/nina/queries/imageEmbeddings.ts` (new)
**Change:** `avatarEmbeddings.ts`'s six statements against `nina_message_images`. Two deltas from
the Album twin, both load-bearing and both documented in the file: a target carries `kind` (the
describe subject follows the photograph's side, where the album's is always `'hers'`), and every
read and write carries `isOriginalPhoto()` (a re-share must never earn a vector of its own).

**Code (whole file):**

```ts
import { and, eq, inArray, isNull, or, sql } from 'drizzle-orm'

import { db } from '@/lib/db'
import { ninaMessageImages, type NinaImageKind } from '@/lib/db/schema'
import { isOriginalPhoto } from './images'

/**
 * §5c Media description embeddings — the derived column the MEDIA half of the unified search ranks
 * by, and the six statements that fill it. `media-album-unified-search` phase 2, R1/R2.
 *
 * ── IT IS `queries/avatarEmbeddings.ts`, ONE TABLE OVER, AND THAT IS THE DESIGN ─────────────
 * Function for function, docstring argument for docstring argument. The user chose Option A —
 * *"Mirror Album pattern"* — over unifying the two tables, so the correct shape here is the
 * album's shape with the table swapped, not a cleverer one. Every reason that module's header
 * gives holds verbatim: these reads exist for one pipeline
 * (`lib/admin/ninaMediaDeferredDescribe.ts`) rather than for the Media view's file-manager
 * surface, and **none of them may go through `imageColumns`** — `description_embedding` is ~1536
 * float4s and `listNinaMediaPhotos` returns 48 rows a render. The vector is never SELECTed
 * anywhere; every statement below either projects `IS NOT NULL` or writes the column.
 *
 * ── THE TWO DELTAS FROM THE ALBUM TWIN ──────────────────────────────────────────────────────
 * 1. **A target carries `kind`.** An album row is always a photograph of HER, so
 *    `ninaAlbumDeferredDescribe.ts` hard-codes `describeSubjectForSide('hers')`. This table holds
 *    both sides, and `scheduleChatPhotoCaption` has always picked the witness with
 *    `describeSubjectForSide(photoSideOf(row.kind))`. Carrying `kind` in the same statement the
 *    rest of the target came from is what keeps that one statement per batch.
 * 2. **`isOriginalPhoto()` is in every WHERE.** A row carrying `source_avatar_id` /
 *    `source_image_id` RE-SHOWS a photograph that lives elsewhere; it is excluded from every
 *    collection read (`isOriginalPhoto`'s own header lists them) and from the merged search
 *    (`queries/avatarsearch.ts`), so earning it a vector would be paying a vendor for a column
 *    nothing can ever rank. It is a scope arm rather than a caller's job for
 *    `generatedChatPhotoScope`'s reason: every statement that reads this pipeline reads the same
 *    set by construction.
 *
 * ── WHAT IS DELIBERATELY NOT HERE ───────────────────────────────────────────────────────────
 * `setNinaMessageImageDescription` (`queries/images.ts`) and `updateNinaChatPhotoDescription`
 * (same) are untouched and keep their callers. They are still the right statements for a write
 * that is deliberately NOT accompanied by a vector — `scheduleChatPhotoCaption`'s HALF ONE, which
 * describes a photograph so that Nina's prompt can read the prose, at a moment when whether the
 * Media view's search can also find it is nobody's question.
 *
 * Ownership scoping (the layer's invariant 1) is unconditional: `user_id` is in all six WHEREs.
 */

/** One row as the Media describe+embed worker needs it. `NinaAvatarDescribeTarget` plus `kind`. */
export interface NinaImageDescribeTarget {
  id: string
  blobUrl: string
  pathname: string
  /**
   * `'generated'` (hers) or `'upload'` (his). The worker maps it through `photoSideOf` +
   * `describeSubjectForSide` to pick the vision witness — the album twin has no such field
   * because every album row is hers. See the header's delta 1.
   */
  kind: NinaImageKind
  /** NULL means the vision model has never been asked about this photograph. */
  description: string | null
  /**
   * The operator's hand-written phrases, or NULL. R2. Carried here because the worker embeds
   * `description` COMBINED with these (`buildNinaAvatarEmbedText`), and reading them in the same
   * statement is what keeps that one statement per batch. The worker never WRITES this column —
   * only `editNinaMessageImageSearchKeywordsAction` does.
   */
  searchKeywords: string | null
  /** `description_embedding IS NOT NULL` — the vector itself is deliberately not selected. */
  hasEmbedding: boolean
}

/**
 * `(… IS NOT NULL)::int` and `.mapWith(Number)` rather than a bare `sql<boolean>` — the album
 * twin's argument, unchanged: what a driver hands back for a Postgres `bool` is a driver detail,
 * and a `sql<boolean>` that arrives as the STRING `'f'` is truthy, which would silently skip every
 * unembedded row as "already done".
 */
const hasEmbeddingExpr =
  sql<number>`(${ninaMessageImages.descriptionEmbedding} is not null)::int`.mapWith(Number)

const imageDescribeTargetColumns = {
  id: ninaMessageImages.id,
  blobUrl: ninaMessageImages.blobUrl,
  pathname: ninaMessageImages.pathname,
  kind: ninaMessageImages.kind,
  description: ninaMessageImages.description,
  searchKeywords: ninaMessageImages.searchKeywords,
  embedded: hasEmbeddingExpr,
}

function toImageTarget(row: {
  id: string
  blobUrl: string
  pathname: string
  kind: NinaImageKind
  description: string | null
  searchKeywords: string | null
  embedded: number
}): NinaImageDescribeTarget {
  return {
    id: row.id,
    blobUrl: row.blobUrl,
    pathname: row.pathname,
    kind: row.kind,
    description: row.description,
    searchKeywords: row.searchKeywords,
    hasEmbedding: row.embedded === 1,
  }
}

/**
 * The rows named by `ids`, as describe+embed targets. ONE statement for a whole batch.
 *
 * An id that is not this user's, does not exist, or is a REFERENCE row is simply absent from the
 * result: "not yours", "gone" and "re-shows someone else's photograph" are one outcome in this
 * layer, and the worker's job is the rows that came back.
 *
 * `ids` is empty-safe for `listNinaAvatarDescribeTargets`'s reason: a round trip to say nothing is
 * still a round trip.
 */
export async function listNinaMessageImageDescribeTargets(
  userId: string,
  ids: readonly string[],
): Promise<NinaImageDescribeTarget[]> {
  if (ids.length === 0) return []
  const rows = await db
    .select(imageDescribeTargetColumns)
    .from(ninaMessageImages)
    .where(
      and(
        eq(ninaMessageImages.userId, userId),
        inArray(ninaMessageImages.id, [...ids]),
        isOriginalPhoto(),
      ),
    )
  return rows.map(toImageTarget)
}

/**
 * The Media collection's unfinished work, oldest first: every original row that has no description,
 * plus every one that has one and no embedding. Phase 4's backfill route reads this.
 *
 * `created_at asc` for `listNinaAvatarDescribeBacklog`'s stated reason: it makes a repeated slice
 * monotone, so each POST finishes the oldest unfinished rows with no cursor to carry.
 * `nina_message_images_user_created_idx` is declared DESC; a b-tree scans either direction.
 */
export async function listNinaMessageImageDescribeBacklog(
  userId: string,
  limit: number,
): Promise<NinaImageDescribeTarget[]> {
  const capped = Math.max(1, Math.trunc(limit))
  const rows = await db
    .select(imageDescribeTargetColumns)
    .from(ninaMessageImages)
    .where(
      and(
        eq(ninaMessageImages.userId, userId),
        isOriginalPhoto(),
        or(
          isNull(ninaMessageImages.description),
          isNull(ninaMessageImages.descriptionEmbedding),
        ),
      ),
    )
    .orderBy(ninaMessageImages.createdAt)
    .limit(capped)
  return rows.map(toImageTarget)
}

/** How much work is left, split by which half of it is left. Phase 4's backfill `GET`. */
export interface NinaImageDescribeBacklogCount {
  /** No prose yet — needs a vision call AND an embedding call. */
  missingDescription: number
  /** Prose but no vector — needs an embedding call only. */
  missingEmbedding: number
}

/**
 * Both counts in ONE statement, with `FILTER` — the album twin's reason: a `GET` that spends
 * nothing should also not cost two round trips.
 */
export async function countNinaMessageImageDescribeBacklog(
  userId: string,
): Promise<NinaImageDescribeBacklogCount> {
  const counted = await db
    .select({
      missingDescription:
        sql<number>`count(*) filter (where ${ninaMessageImages.description} is null)`.mapWith(
          Number,
        ),
      missingEmbedding:
        sql<number>`count(*) filter (where ${ninaMessageImages.description} is not null and ${ninaMessageImages.descriptionEmbedding} is null)`.mapWith(
          Number,
        ),
    })
    .from(ninaMessageImages)
    .where(and(eq(ninaMessageImages.userId, userId), isOriginalPhoto()))
  return {
    missingDescription: counted[0]?.missingDescription ?? 0,
    missingEmbedding: counted[0]?.missingEmbedding ?? 0,
  }
}

/**
 * Write the prose and its vector in ONE UPDATE. The only writer of
 * `nina_message_images.description_embedding` that FILLS it.
 *
 * ── WHY NOT A SECOND CALL BESIDE `setNinaMessageImageDescription` ───────────────────────────
 * `setNinaAvatarDescriptionAndEmbedding`'s argument, verbatim, because it is the same argument:
 * two statements have an order and every order has a window in which the row is a lie.
 * Prose-then-vector leaves a row whose vector describes the PREVIOUS prose (search returns the
 * photo for words it no longer matches); vector-then-prose leaves the mirror. One `SET` of two
 * columns has no window. `setNinaMessageImageDescription` is untouched and keeps its two callers.
 *
 * `embedding: null` is a real, expected argument: it is what a failed embedding call writes and
 * what the hand-edit path writes, and it leaves the row in the exact state
 * `listNinaMessageImageDescribeBacklog` picks up next sweep. The prose is never lost to a vendor
 * that would not answer.
 */
export async function setNinaMessageImageDescriptionAndEmbedding(
  userId: string,
  id: string,
  description: string | null,
  embedding: number[] | null,
): Promise<boolean> {
  const updated = await db
    .update(ninaMessageImages)
    .set({ description, descriptionEmbedding: embedding })
    .where(
      and(eq(ninaMessageImages.userId, userId), eq(ninaMessageImages.id, id), isOriginalPhoto()),
    )
    .returning({ id: ninaMessageImages.id })
  return updated.length > 0
}

/**
 * Write the hand-written keywords and the vector in ONE UPDATE. The twin of the function above,
 * for the other input to the same derived column.
 *
 * ── WHY A SECOND FUNCTION AND NOT A THIRD PARAMETER ON THE FIRST ────────────────────────────
 * `setNinaAvatarSearchKeywordsAndEmbedding`'s argument applies here word for word, and the failure
 * it prevents is the same one: a merged `set({ description, searchKeywords, descriptionEmbedding })`
 * would put a `searchKeywords` parameter within reach of `describeChatPhotoAction` — the
 * re-describe button — and the first time someone passed the wrong thing there, a vision pass
 * would erase the operator's correction, silently, with the row still looking healthy. Two
 * functions cannot make that mistake: the describe path has no way to spell it.
 *
 * `searchKeywords: null` is the CLEAR, exactly as `description: null` is on the twin.
 */
export async function setNinaMessageImageSearchKeywordsAndEmbedding(
  userId: string,
  id: string,
  searchKeywords: string | null,
  embedding: number[] | null,
): Promise<boolean> {
  const updated = await db
    .update(ninaMessageImages)
    .set({ searchKeywords, descriptionEmbedding: embedding })
    .where(
      and(eq(ninaMessageImages.userId, userId), eq(ninaMessageImages.id, id), isOriginalPhoto()),
    )
    .returning({ id: ninaMessageImages.id })
  return updated.length > 0
}

/**
 * Write the hand-written EXCLUSION phrases. A PLAIN setter, unlike its neighbour, and that is the
 * whole point: **a negative keyword never touches the vector.**
 *
 * `buildNinaAvatarEmbedText` reads only `description` and `searchKeywords`, and
 * `matchesNegativeKeyword` (`queries/avatarsearch.ts`) reads this column fresh at search time
 * against the operator's typed query. So writing it changes nothing any vector describes and there
 * is no derived value to re-earn afterwards — the exact non-involvement
 * `setNinaAvatarNegativeSearchKeywords` has on the album side, replicated here rather than
 * re-decided.
 */
export async function setNinaMessageImageNegativeSearchKeywords(
  userId: string,
  id: string,
  negativeSearchKeywords: string | null,
): Promise<boolean> {
  const updated = await db
    .update(ninaMessageImages)
    .set({ negativeSearchKeywords })
    .where(
      and(eq(ninaMessageImages.userId, userId), eq(ninaMessageImages.id, id), isOriginalPhoto()),
    )
    .returning({ id: ninaMessageImages.id })
  return updated.length > 0
}
```

**Impact:** Phase 4's backfill has `listNinaMessageImageDescribeBacklog` (the list) and
`countNinaMessageImageDescribeBacklog` (the `GET`) to call, and Step 5's
`fillNinaMessageImageDescribeTargets` as its worker.

---

### Step 3: The pointer read redirection

**File:** `lib/nina/queries/avatarPointer.ts` (new)
**Change:** one batch read that turns a page of album rows into "what this photograph's prose and
keywords actually are", following the link where there is one.

**Code (whole file):**

```ts
import { and, eq, inArray } from 'drizzle-orm'

import { db } from '@/lib/db'
import { ninaMessageImages } from '@/lib/db/schema'

/**
 * §9e The pointer redirection — where a LINKED album row's prose and keywords actually live.
 * `media-album-unified-search` phase 2, R3.
 *
 * ── THE RULE, IN ONE SENTENCE ───────────────────────────────────────────────────────────────
 * **A pointer row's own `description`, `search_keywords`, `negative_search_keywords` and
 * `description_embedding` columns are DEAD.** All four are NULL on that row, forever, and the
 * values the operator sees and edits belong to the `nina_message_images` row its `source_image_id`
 * names. See the FK's own header in `lib/db/schema/nina/avatars.ts` and the plan index's Decision
 * *"Where does a pointer row's description/keywords live?"*.
 *
 * That is not a synchronisation mechanism, it is the ABSENCE of one, which is the whole reason it
 * is correct: the user asked that *"editing image description, search keyword, negative keyword in
 * one place will automatically synchronize it with other location"*, and the only design that
 * cannot drift is the one where there is a single row holding the data. A dual write would have a
 * failure mode; this has none to have.
 *
 * ── WHY THIS IS A QUERY-LAYER FUNCTION AND NOT A JOIN IN `app/admin/nina/page.tsx` ──────────
 * Because the WRITES redirect too. `editNinaAvatarDescriptionAction`, `describeNinaAvatarAction`,
 * `editNinaAvatarSearchKeywordsAction` and `editNinaAvatarNegativeSearchKeywordsAction` all have to
 * land on the linked Media row for a pointer, and that decision belongs beside the read decision
 * rather than duplicated into the UI package. Those four actions do NOT call this function — they
 * already hold the row and read `row.sourceImageId` off it — but they and this share one rule and
 * one docstring, which is the point.
 *
 * ── WHY IT IS A BATCH AND KEYED BY THE AVATAR ID ────────────────────────────────────────────
 * `listNinaAvatarDescribeTargets`'s shape: one `inArray` statement for a whole page, so a render
 * of 120 album tiles costs one extra indexed read rather than 120. Keyed by the AVATAR id and not
 * the image id so the caller's lookup is `linked.get(row.id) ?? row` with no second mapping —
 * `nina_avatars_user_source_key_unq` makes two pointers at one image unreachable in practice, and
 * keying this way means nothing depends on that being true.
 *
 * Imports foundation-wards only, as every module in this layer does.
 */

/** The three fields a pointer borrows. Exactly the three a `PhotoDescription` panel reads. */
export interface NinaLinkedPhotoText {
  description: string | null
  searchKeywords: string | null
  negativeSearchKeywords: string | null
}

/**
 * For every row in `rows` that IS a pointer, the prose and keywords of the Media row it names.
 *
 * Rows with `sourceImageId === null` are absent from the result — an ordinary album row's own
 * columns are the truth, so there is nothing to look up and nothing to override. A pointer whose
 * target has gone is absent too, which degrades to "no description", the same state an undescribed
 * album row has always had. (The FK is `ON DELETE RESTRICT`, so that is unreachable while the
 * constraint holds; it is handled rather than asserted because a `Map.get` miss is one branch and
 * a thrown invariant is a 500 on an admin page.)
 *
 * Empty-safe for `listNinaAvatarDescribeTargets`'s reason: a round trip to say nothing is still a
 * round trip, and a page with no pointers on it is the common case today.
 */
export async function resolveNinaAvatarLinkedText(
  userId: string,
  rows: readonly { id: string; sourceImageId: string | null }[],
): Promise<Map<string, NinaLinkedPhotoText>> {
  const pointers = rows.filter(
    (row): row is { id: string; sourceImageId: string } => row.sourceImageId != null,
  )
  const resolved = new Map<string, NinaLinkedPhotoText>()
  if (pointers.length === 0) return resolved

  /* De-duplicated, because two pointers at one image would otherwise bind the same id twice in the
   * `IN` list. `nina_avatars_user_source_key_unq` makes that unreachable; the `Set` costs nothing
   * and means this function does not depend on it. */
  const imageIds = [...new Set(pointers.map((row) => row.sourceImageId))]

  const linked = await db
    .select({
      id: ninaMessageImages.id,
      description: ninaMessageImages.description,
      searchKeywords: ninaMessageImages.searchKeywords,
      negativeSearchKeywords: ninaMessageImages.negativeSearchKeywords,
    })
    .from(ninaMessageImages)
    .where(and(eq(ninaMessageImages.userId, userId), inArray(ninaMessageImages.id, imageIds)))

  const byImageId = new Map(linked.map((row) => [row.id, row]))
  for (const pointer of pointers) {
    const text = byImageId.get(pointer.sourceImageId)
    if (text == null) continue
    resolved.set(pointer.id, {
      description: text.description,
      searchKeywords: text.searchKeywords,
      negativeSearchKeywords: text.negativeSearchKeywords,
    })
  }
  return resolved
}
```

**Impact:** Phase 3's `app/admin/nina/page.tsx` calls this once per album page render and applies
`linked.get(row.id) ?? row` when building each `AlbumExplorerPhoto`. Documented in **Handoffs**.

---

### Step 4: The "is an album pointer still naming this Media row?" pre-check

**File:** `lib/nina/queries/images.ts:1165` (immediately after `isBlobPathnameReferenced`, before
`setNinaMessageImageDescription`)
**Change:** add the row-level twin of the blob-level question that already lives here.

**Code (inserted whole):**

```ts
/**
 * **"Is an album entry still pointing at this photograph?"** `media-album-unified-search` phase 2,
 * R3 — the row-level twin of `isBlobPathnameReferenced` directly above, which is why it lives here
 * and not in `queries/avatars.ts`: that function asks "is anything still pointing at these BYTES"
 * and this asks "is anything still pointing at this ROW", and a reader looking for either should
 * find both without leaving the file.
 *
 * ── WHY A COUNT AND NOT A BOOLEAN ───────────────────────────────────────────────────────────
 * Because the caller's sentence says a number: *"2 album entries still show this photo."* A
 * `LIMIT 1` existence probe would make the operator open the album to find out how much work the
 * refusal is asking for. The statement is an index-backed equality on
 * `nina_avatars_source_image_id_idx` (phase 1's index — that exact spelling), so the count costs
 * what the probe would.
 *
 * ── WHY THE PRE-CHECK EXISTS WHEN THE FK ALREADY REFUSES ────────────────────────────────────
 * `nina_avatars.source_image_id` is `ON DELETE RESTRICT`, so Postgres refuses the delete either
 * way — as a thrown constraint violation naming a constraint the operator has never heard of,
 * surfaced by a Server Action as the framework's error page. This turns it into the shape
 * `deleteNinaAvatarAction` already uses for "that is her current photo": `ok: false` and one
 * sentence that names the fix. The constraint stays the backstop for the race this read cannot
 * close, exactly as `nina_avatars_user_source_key_unq` is the backstop for re-adoption's.
 *
 * Owner-scoped (invariant 1) and correct rather than merely conventional: another operator's album
 * cannot point at this user's photograph, and a cross-user read would prove nothing extra.
 */
export async function countNinaAvatarsLinkedToImage(
  userId: string,
  imageId: string,
): Promise<number> {
  const counted = await db
    .select({ total: sql<number>`count(*)`.mapWith(Number) })
    .from(ninaAvatars)
    .where(and(eq(ninaAvatars.userId, userId), eq(ninaAvatars.sourceImageId, imageId)))
  return counted[0]?.total ?? 0
}
```

**Impact:** `ninaAvatars` is already imported in this module (it is used by
`generatedChatPhotoScope` and `isBlobPathnameReferenced`), as are `and`, `eq` and `sql`. No new
imports.

---

### Step 5: The Media deferred describe+embed worker

**File:** `lib/admin/ninaMediaDeferredDescribe.ts` (new)
**Change:** `ninaAlbumDeferredDescribe.ts`'s worker against `nina_message_images`. It reuses that
module's `NinaDescribeFillOutcome` type (one shape, two pipelines) and
`buildNinaAvatarEmbedText` unchanged.

**Code (whole file):**

```ts
import { after } from 'next/server'

import type { NinaDescribeFillOutcome } from '@/lib/admin/ninaAlbumDeferredDescribe'
import { describeSubjectForSide, photoSideOf } from '@/lib/nina/album'
import { buildNinaAvatarEmbedText } from '@/lib/nina/avatarEmbedText'
import { embedNinaText } from '@/lib/nina/embedding'
import {
  listNinaMessageImageDescribeTargets,
  setNinaMessageImageDescriptionAndEmbedding,
  type NinaImageDescribeTarget,
} from '@/lib/nina/queries'
import { NinaVisionTokenFloorError, describeNinaImages } from '@/lib/nina/vision'

/**
 * The deferred describe-and-embed pre-pass for the MEDIA collection — the `after()` schedulers the
 * chat-photo action modules call when a photograph's prose or keywords change.
 * `media-album-unified-search` phase 2, R1/R2.
 *
 * ── WHY A SIBLING MODULE AND NOT A `kind` PARAMETER ON THE ALBUM ONE ────────────────────────
 * `lib/admin/ninaAlbumDeferredDescribe.ts` exists as its own module for a rule this one inherits
 * (a `'use server'` module may export only async functions, and these are synchronous schedulers).
 * It is not WIDENED into covering both tables for two measured reasons:
 *
 *   1. A table discriminant would have to be threaded through `fillOne`, `runFillLanes`,
 *      `scheduleFill` AND `embedNinaAvatarDescription`'s two existing callers — five signatures
 *      changed so that one of them can pick a table.
 *   2. **The fork is not a table swap, it is a behaviour.** Every `nina_avatars` row is a
 *      photograph of HER, so the album worker hard-codes `describeSubjectForSide('hers')`. This
 *      table holds both sides, and picking the wrong witness is the measured defect
 *      `describeNinaAvatarAction`'s docstring records (*"the prompt went looking for a man who is
 *      not in the frame"*). So `fillOne` below reads `photoSideOf(target.kind)`, which is a
 *      different function body, not a different table name.
 *
 * Everything else is that module's, deliberately unchanged: the same `after()` posture, the same
 * lane count, the same wall-clock budget against `/admin/nina`'s 300 s segment, the same
 * non-fatal-failure contract, and the same `NinaDescribeFillOutcome` shape — imported rather than
 * re-declared, so the two pipelines report in one vocabulary and a future dashboard reads one type.
 */

/** `NINA_DEFERRED_DESCRIBE_CONCURRENCY`'s number and reason, one table over. */
export const NINA_MEDIA_DEFERRED_DESCRIBE_CONCURRENCY = 4

/** `NINA_DEFERRED_DESCRIBE_BUDGET_MS`'s number and reason: 240 s of `/admin/nina`'s 300. */
export const NINA_MEDIA_DEFERRED_DESCRIBE_BUDGET_MS = 240_000

/** Phase 4's backfill route's own budget. Same ceiling, same 60 s reserve. */
export const NINA_MEDIA_BACKFILL_BUDGET_MS = 240_000

/** How many backlog rows one backfill POST reads — `NINA_ALBUM_BACKFILL_SLICE`'s number. */
export const NINA_MEDIA_BACKFILL_SLICE = 200

function emptyOutcome(): NinaDescribeFillOutcome {
  return { described: 0, embedded: 0, failed: 0, ranOutOfTime: 0, alreadyDone: 0 }
}

/**
 * Embed one Media description — COMBINED with its hand-written keywords — or answer `null`.
 *
 * **This is the only place in the repo that decides what a MEDIA photograph's vector is computed
 * FROM**, and it must agree with `embedNinaAvatarDescription` byte for byte, which is why both
 * call `buildNinaAvatarEmbedText` rather than either one spelling the join.
 *
 * ── THE JOIN FUNCTION IS REUSED AS-IS, NAME AND ALL ─────────────────────────────────────────
 * `buildNinaAvatarEmbedText` is generic over any `(description, searchKeywords)` pair despite the
 * word "Avatar" in it, and it is NOT renamed or forked here. `lib/nina/avatarEmbedText.ts`'s own
 * header names the failure mode a second spelling would cause — *"a second spelling of the join
 * would embed a text the app never embeds, and the corpus would end up half in one space and half
 * in another with no error anywhere"* — and both corpora are now searched by ONE ranking against
 * ONE query vector, so the two texts must be built identically or the merged ranking compares
 * apples to a different join. Renaming it would be a wide, no-behaviour diff across three runtimes
 * (`scripts/`, `research/`, the app); it stays.
 *
 * **Never throws**, for `embedNinaAvatarDescription`'s reason: an embedding outage must not cost
 * the prose. `null` writes a NULL vector, which is exactly the state
 * `listNinaMessageImageDescribeBacklog` picks up next sweep.
 */
export async function embedNinaMessageImageDescription(
  description: string,
  searchKeywords: string | null,
  userId: string,
): Promise<number[] | null> {
  try {
    return await embedNinaText(buildNinaAvatarEmbedText(description, searchKeywords), { userId })
  } catch (cause) {
    console.error('[f36] media embedding failed; the description is kept and stays unsearchable', cause)
    return null
  }
}

/**
 * One row. Decides for itself what it still needs, and writes both columns in one statement.
 *
 * `describe: false` is the rewrite path (`editChatPhotoDescriptionAction` and the two keyword
 * actions): the prose is the human's and a vision call would be both wasteful and wrong. A row
 * with no prose under `describe: false` is left alone — an operator who CLEARED the box asked for
 * silence.
 *
 * ── THE SUBJECT FOLLOWS THE PHOTOGRAPH, WHICH IS THIS WORKER'S ONE REAL DIFFERENCE ──────────
 * `photoSideOf(target.kind)` then `describeSubjectForSide` — `scheduleChatPhotoCaption`'s HALF ONE
 * already describes this table's rows that way, and this is the same mapping through the same two
 * helpers so the rule keeps one spelling and one suite.
 *
 * ── IT EMBEDS THE KEYWORDS TOO, AND IT NEVER WRITES THEM ────────────────────────────────────
 * `setNinaMessageImageDescriptionAndEmbedding` sets two columns and `search_keywords` is not one
 * of them, so the omission is structural rather than a thing to remember. That is also what makes
 * this the re-earn path for `editNinaMessageImageSearchKeywordsAction`: the keywords are already
 * written, the vector is NULL, and `describe: false` recomputes it from the pair with no vendor
 * image call.
 */
async function fillOne(
  userId: string,
  target: NinaImageDescribeTarget,
  describe: boolean,
  outcome: NinaDescribeFillOutcome,
): Promise<void> {
  try {
    let description = target.description

    if (description == null) {
      if (!describe) return
      const result = await describeNinaImages(
        [{ blobUrl: target.blobUrl, pathname: target.pathname }],
        { subject: describeSubjectForSide(photoSideOf(target.kind)) },
      )
      description = result.description
      outcome.described += 1
    } else if (target.hasEmbedding) {
      // Prose and vector both present: authoritative skip, and not one vendor call.
      outcome.alreadyDone += 1
      return
    }

    const embedding = await embedNinaMessageImageDescription(
      description,
      target.searchKeywords,
      userId,
    )
    if (embedding != null) outcome.embedded += 1
    await setNinaMessageImageDescriptionAndEmbedding(userId, target.id, description, embedding)
  } catch (cause) {
    outcome.failed += 1
    /* The floor tripping is its own class and is logged LOUDLY — `describeChatPhotoAction`'s
     * posture: it means the vendor answered 200 with an image it silently dropped, and the text of
     * such a response is exactly where an invented description would be. */
    if (cause instanceof NinaVisionTokenFloorError) {
      console.error('[f36] TOKEN FLOOR TRIPPED on a deferred media describe', {
        id: target.id,
        pathname: target.pathname,
        message: cause.message,
      })
    } else {
      console.error('[f36] deferred media describe failed', target.id, cause)
    }
  }
}

/**
 * A fixed number of lanes drawing from one shared index, stopping at a deadline —
 * `runFillLanes`'s body, one table over, and `next++` needs no lock for its stated reason.
 * Past the deadline the lanes keep DRAINING without working, so `ranOutOfTime` is truthful.
 */
async function runFillLanes(
  userId: string,
  targets: readonly NinaImageDescribeTarget[],
  describe: boolean,
  deadline: number,
): Promise<NinaDescribeFillOutcome> {
  const outcome = emptyOutcome()
  let next = 0
  const lanes = Array.from(
    { length: Math.min(NINA_MEDIA_DEFERRED_DESCRIBE_CONCURRENCY, targets.length) },
    async () => {
      for (;;) {
        const target = targets[next++]
        if (target == null) return
        if (Date.now() >= deadline) {
          outcome.ranOutOfTime += 1
          continue
        }
        await fillOne(userId, target, describe, outcome)
      }
    },
  )
  await Promise.all(lanes)
  return outcome
}

/**
 * Work a list of already-read targets to completion or to the budget. **No `after()`** — the entry
 * point for a caller that is already off the request path and wants the outcome in its own return
 * value, which is phase 4's Media backfill route. `fillNinaAvatarDescribeTargets`'s twin.
 */
export async function fillNinaMessageImageDescribeTargets(
  userId: string,
  targets: readonly NinaImageDescribeTarget[],
  budgetMs: number,
): Promise<NinaDescribeFillOutcome> {
  return runFillLanes(userId, targets, true, Date.now() + budgetMs)
}

/**
 * Describe (if needed) and embed one Media row, AFTER the response has gone out.
 * `scheduleDescribe`'s twin — see that function for why it is `after()` and why it re-reads the
 * row inside the callback rather than trusting what the caller had in hand.
 */
export function scheduleMediaDescribe(userId: string, id: string): void {
  scheduleFill(userId, [id], true)
}

/**
 * Re-embed a Media row whose prose or keywords a HUMAN just rewrote. No vision call, ever.
 *
 * `scheduleEmbed`'s twin, and the same contract: the writer nulls `description_embedding` in the
 * same UPDATE as the new text, so the row is never searchable under words it no longer has, and
 * this re-earns the vector after the response. A callback that never runs costs a sweep, not a
 * correction — NULL is the state `listNinaMessageImageDescribeBacklog` already looks for.
 */
export function scheduleMediaEmbed(userId: string, id: string): void {
  scheduleFill(userId, [id], false)
}

function scheduleFill(userId: string, ids: readonly string[], describe: boolean): void {
  if (ids.length === 0) return
  after(async () => {
    // Measured from inside the callback: `after()` starts when the response is finished.
    const deadline = Date.now() + NINA_MEDIA_DEFERRED_DESCRIBE_BUDGET_MS
    try {
      const targets = await listNinaMessageImageDescribeTargets(userId, ids)
      const outcome = await runFillLanes(userId, targets, describe, deadline)
      if (outcome.ranOutOfTime > 0 || outcome.failed > 0) {
        console.warn('[f36] deferred media describe finished short', {
          requested: ids.length,
          ...outcome,
        })
      }
    } catch (cause) {
      console.error('[f36] deferred media describe batch failed', { requested: ids.length }, cause)
    }
  })
}
```

**Impact:** `NinaDescribeFillOutcome` is exported from `ninaAlbumDeferredDescribe.ts` already
(`:109`); the import above is `import type`, which erases, so no runtime edge between the two
modules is created.

---

### Step 6: Link, not copy

**File:** `lib/admin/ninaAlbumAvatarActions.ts:1-32` (imports), `:36-48` (module header), `:77-177`
(`setChatPhotoAsAvatarAction`), `:179-247` (`copyChatPhotoIntoAlbum` + `avatarExtFor`)

**Change:** the import block loses `put`, `ADMIN_AVATAR_EXTS`, `adminAvatarPathname`,
`contentTypeForAvatarExt`, `AdminAvatarExt` and `newId`; it gains `scheduleMediaDescribe`.
`copyChatPhotoIntoAlbum` becomes `linkChatPhotoIntoAlbum`; `avatarExtFor` is deleted.

**Code — the new import block (replacing `:1-32` in full):**

```ts
'use server'

import { revalidatePath } from 'next/cache'

import { ADMIN_CHAT_PHOTOS_PATH } from '@/lib/admin/chatPhotos'
import { chatPhotoSetAvatarSchema } from '@/lib/admin/chatPhotoSchema'
import type { AdminActionResult } from '@/lib/admin/ninaAlbumActions'
import { scheduleDescribe } from '@/lib/admin/ninaAlbumDeferredDescribe'
import { scheduleMediaDescribe } from '@/lib/admin/ninaMediaDeferredDescribe'
import { requireAdmin } from '@/lib/admin/requireAdmin'
import { avatarIdSchema, cropWriteSchema } from '@/lib/admin/schema'
import { clampCrop, cropForWrite, isIdentityCrop, resolveCrop } from '@/lib/nina/crop'
import {
  deleteNinaAvatar,
  getNinaAvatar,
  getNinaAvatarBySourceKey,
  getNinaMessageImage,
  insertNinaAvatars,
  setCurrentNinaAvatar,
  updateNinaAvatarCrop,
  type NinaAvatarRow,
  type NinaImageRow,
} from '@/lib/nina/queries'
import { releaseBlobIfUnreferenced } from '@/lib/nina/blobRelease'
import { promoteNinaAvatarDependents } from '@/lib/nina/provenancePromotion'
```

**Code — the module header's third bullet (replacing `:39`):**

```
 *   · `setChatPhotoAsAvatarAction` adopts a chat photograph — as a LINK, not a copy.
```

and the helper sentence at `:45-47` becomes:

```
 * The bulk forms of move and remove live in `lib/admin/ninaAlbumFolderActions.ts`; the deferred
 * describe that promotion schedules lives in `lib/admin/ninaMediaDeferredDescribe.ts` (the MEDIA
 * one — a pointer row never earns a vector of its own). The adoption helper
 * (`linkChatPhotoIntoAlbum`) stays private here because a `'use server'` module exports actions,
 * not predicates or insert routines (`lib/nina/album.ts:144-148` states the rule). Nothing outside
 * the layer imports this module; everything reaches it through the
 * `lib/admin/ninaAlbumActions.ts` barrel.
```

**Code — `setChatPhotoAsAvatarAction`, docstring and body, replacing `:77-177` in full:**

```ts
/**
 * "Set as her profile picture", from a CHAT photograph — the reverse of F37's share. The Media
 * pane's framing panel sends a chat-photo id and its whole crop draft; this makes the photograph
 * hers, exactly as `setCurrentNinaAvatarAction` does for an album row.
 *
 * ══ THE BYTES ARE SHARED, NOT COPIED. THE OLD DECISION IS REVERSED, ON PURPOSE. ═════════════
 * This function used to `fetch` the chat photograph and `put` a fresh `avatar-` object, and its
 * docstring argued for that at length. **That argument is withdrawn** by the user's own input
 * (`media-album-unified-search` R3): *"if admin set a picture from Media, we wouldn't copy paste a
 * new duplicate image into Album directory … the image in Album is just a pointer to the real file
 * in Media … this way, storage usage will be lower, and editing image description, search keyword,
 * negative keyword in one place will automatically synchronize it with other location."*
 *
 * The old decision's two stated reasons are both answered by mechanisms that have nothing to do
 * with whether bytes are copied, which is why reversing it reopens neither:
 *
 *   · *"its own framing"* — `crop_scale`/`crop_x`/`crop_y` are this row's OWN columns and stay so.
 *     Re-cropping her profile picture still cannot re-crop the bubble; the crop was never in the
 *     bytes.
 *   · *"deleting either side cannot turn the other into a row whose bytes are kept alive only by
 *     someone else's reference"* — `releaseBlobIfUnreferenced`/`isBlobPathnameReferenced` already
 *     do reference-checked shared-blob deletion across BOTH tables, and this set adds the two
 *     guards that close the row-level half: `deleteNinaAvatarAction` releases nothing for a
 *     pointer (it never owned the object) and `removeChatPhotoAction` refuses to delete a Media
 *     row an album pointer still names (`source_image_id` is `ON DELETE RESTRICT`).
 *
 * A live cross-table read with no copy is already proven in production by
 * `resolveNinaPhotoReference` (`lib/nina/queries/imageprefs.ts`), which resolves a stored
 * `{source, id}` against whichever table `source` names, at generation time, copying nothing.
 *
 * ── AND THE POINTER ROW CARRIES NO PROSE OF ITS OWN ─────────────────────────────────────────
 * `description` is deliberately NOT seeded from the chat row any more — the line that did it is
 * gone rather than kept. A pointer row's `description`, `search_keywords`,
 * `negative_search_keywords` and `description_embedding` are all permanently NULL and the truth
 * lives on the Media row (`lib/nina/queries/avatarPointer.ts`). That is what makes R3's *"editing
 * in one place automatically synchronize"* true by construction rather than by a sync mechanism
 * that could get it wrong.
 *
 * ── RE-ADOPTION IS STILL A CONSTRAINT DECISION ──────────────────────────────────────────────
 * Unchanged: the row is written with `source_key = 'chat-photo:<imageId>'`, so a second click
 * finds the first adoption through `getNinaAvatarBySourceKey` and just re-currents it, and
 * `nina_avatars_user_source_key_unq` is the backstop for the race the lookup cannot close. What
 * changes is the cost of losing that race: nothing. There is no orphaned object to reap any more,
 * because no object was minted.
 *
 * ── THE GUARDS ARE REPLACE'S AND REMOVE'S, VERBATIM ─────────────────────────────────────────
 * Unchanged. `getNinaMessageImage` deliberately does not filter (it is the bubble and viewer read
 * too), so this action enforces here what Replace and Remove enforce at their own seams: a row
 * carrying `source_avatar_id`/`source_image_id` is a re-SHOW, and pointing an album entry at a
 * pointer would be a link to a link.
 *
 * ── AND THE DESCRIBE IT SCHEDULES IS THE **MEDIA** ONE ──────────────────────────────────────
 * `scheduleMediaDescribe(userId, row.id)`, not `scheduleDescribe(userId, avatar.id)`. The pointer
 * row will never carry a vector, so scheduling the album worker on it would be a read that finds
 * a NULL description it must not invent prose for, every single time. The row that needs prose and
 * a vector is the MEDIA row — and after this phase that row is the one the merged search ranks,
 * so this is also what makes a freshly-promoted photograph findable at all.
 */
export async function setChatPhotoAsAvatarAction(input: unknown): Promise<AdminActionResult> {
  const { userId } = await requireAdmin()

  const parsed = chatPhotoSetAvatarSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'That framing is out of range.' }
  const { id, scale, x, y } = parsed.data

  const row = await getNinaMessageImage(userId, id)
  if (row == null) return { ok: false, error: 'That photo is not in the collection.' }
  if (row.sourceAvatarId != null || row.sourceImageId != null) {
    return {
      ok: false,
      error: 'That one re-shows a photo that lives elsewhere. Make the original hers instead.',
    }
  }

  /*
   * The schema can only reject nonsense; the clamp against the row's REAL dimensions is what
   * guarantees the stored numbers keep the circle covered — `saveNinaAvatarCropAction`'s
   * server-side guarantee, same reason. Identity stays three NULLs by never being written.
   */
  const crop = clampCrop({ width: row.width, height: row.height }, resolveCrop({ scale, x, y }))
  const sourceKey = `chat-photo:${row.id}`

  let avatar = await getNinaAvatarBySourceKey(userId, sourceKey)
  if (avatar == null) {
    avatar = await linkChatPhotoIntoAlbum(userId, row, sourceKey)
  }
  if (avatar == null) {
    return { ok: false, error: 'The link into her album did not land. Try again.' }
  }

  if (!isIdentityCrop(crop)) {
    await updateNinaAvatarCrop(userId, avatar.id, cropForWrite(crop))
  }

  await setCurrentNinaAvatar(userId, avatar.id)
  /*
   * The MEDIA row, not the album row — see the docstring's last block. `scheduleMediaDescribe`
   * re-reads inside its `after()` and decides for itself: prose and vector both present is an
   * authoritative skip with no vendor call, which is the property the scheduler's own docstring
   * claims. So promoting an already-described, already-embedded photograph costs one indexed read.
   */
  scheduleMediaDescribe(userId, row.id)

  revalidatePath(ADMIN_CHAT_PHOTOS_PATH)
  return { ok: true, id: avatar.id }
}
```

**Code — `linkChatPhotoIntoAlbum`, replacing `:179-247` (both `copyChatPhotoIntoAlbum` AND
`avatarExtFor`) in full:**

```ts
/**
 * Insert the album row that POINTS at a chat photograph. No `fetch`, no `put`, no second Blob
 * object, no second copy of the prose. `media-album-unified-search` R3.
 *
 * ── WHAT IT WRITES, FIELD BY FIELD, AND WHY EACH IS WHAT IT IS ──────────────────────────────
 *   · `blobUrl` / `pathname` — the MEDIA row's own, verbatim. The two rows now name one object,
 *     which is the storage saving R3 asked for and the reason both deletes grew a guard.
 *   · `sourceImageId` — the link itself, and the flag that marks this row a pointer. Every read of
 *     this row's prose goes through it (`lib/nina/queries/avatarPointer.ts`).
 *   · `description` — ABSENT. A pointer holds none; see the action's docstring. The line that used
 *     to read `description: row.description` is deleted, not commented out, because a copied
 *     description is exactly the second source of truth R3 exists to remove.
 *   · `sourceKey` — still `chat-photo:<imageId>`, so the re-adoption idempotency the unique index
 *     backs keeps working completely unchanged.
 *   · `width`/`height`/`bytes` — plain numbers copied from the row, as they always were: they
 *     describe the bytes, and the bytes are the same bytes.
 *   · `folder: ''` and `filename: null` — unchanged. A linked entry is an ordinary album entry for
 *     every purpose except where its bytes and its prose live: the operator can move it between
 *     folders, re-frame it and make it current exactly like any other.
 *
 * ── NO `try`/`catch` LEFT, AND THAT IS NOT AN OMISSION ──────────────────────────────────────
 * The old body wrapped a `fetch` and a `put` — two vendor calls whose failure had to become one
 * `{ ok: false }` sentence rather than a framework error page. There is no vendor call here any
 * more; what remains is one INSERT through the query layer, which is exactly as exceptional as
 * every other statement this module runs unguarded. The one non-exceptional failure — the unique
 * index racing the lookup — is still handled, below, by re-reading the row the winner wrote.
 *
 * Not exported: a `'use server'` module may export only async actions, and this is a helper with
 * one caller.
 */
async function linkChatPhotoIntoAlbum(
  userId: string,
  row: NinaImageRow,
  sourceKey: string,
): Promise<NinaAvatarRow | null> {
  const [inserted] = await insertNinaAvatars(userId, [
    {
      blobUrl: row.blobUrl,
      pathname: row.pathname,
      source: 'admin',
      folder: '',
      filename: null,
      sourceKey,
      sourceImageId: row.id,
      width: row.width,
      height: row.height,
      bytes: row.bytes,
    },
  ])
  if (inserted != null) return inserted

  // The unique index raced the lookup — another tab adopted this photograph between the read and
  // the insert. The row the winner wrote is what the operator meant, and it points at the same
  // object and the same prose, so there is nothing to reconcile and nothing to reap.
  return getNinaAvatarBySourceKey(userId, sourceKey)
}
```

**Impact:** `tests/admin.chatPhotoAdoption.test.ts` asserts `put`'s arguments, the `fetch` call and
the seeded description — all four assertions invert (Step 13). `lib/admin/avatars.ts`'s
`ADMIN_AVATAR_EXTS`, `adminAvatarPathname` and `contentTypeForAvatarExt` keep their other callers
(`registerNinaAvatarsAction`, the upload route) and are not deleted.

---

### Step 7: The two pointer-aware deletes

**File:** `lib/admin/ninaAlbumAvatarActions.ts:276-357` (`deleteNinaAvatarAction`)
**Change:** add a "STEP 3 for a pointer" branch. The promotion and the row delete are untouched.

**Code — the docstring's new block, inserted after the "TWO OBJECTS, TWO QUESTIONS" block at
`:303-314`, and the body, replacing `:324-357` in full:**

```ts
/**
 * ── AND A POINTER ROW RELEASES NOTHING, BECAUSE IT NEVER OWNED ANYTHING ─────────────────────
 * `media-album-unified-search` R3. A row with `source_image_id` set shows the MEDIA row's object;
 * it minted none of its own and it has no thumbnail (nothing generates one for a link). So step 3
 * is skipped entirely for it.
 *
 * Asking anyway would be SAFE rather than wrong — `isBlobPathnameReferenced` reads both tables, the
 * Media row still names the pathname, the answer would be `'shared'` and the object would be kept.
 * It is skipped because it is two SELECTs and a `del`-adjacent code path spent re-deriving a fact
 * the `ON DELETE RESTRICT` FK already guarantees, and because the absence of the call is the
 * clearest statement of the invariant there is.
 *
 * **Step 1 is NOT skipped for a pointer, and that is deliberate.** `promoteNinaAvatarDependents`
 * looks for `nina_message_images` rows whose `source_avatar_id` names THIS avatar — a chat re-share
 * of it (F37 R3), which a pointer row can have exactly like any other album row. That FK is
 * `ON DELETE SET NULL` and it fires inside the DELETE below, so skipping the promotion would mint
 * precisely the unmeasured ghost `lib/nina/provenancePromotion.ts` exists to bury.
 */
export async function deleteNinaAvatarAction(rawId: string): Promise<AdminActionResult> {
  const { userId } = await requireAdmin()
  const parsed = avatarIdSchema.safeParse(rawId)
  if (!parsed.success) return { ok: false, error: 'Not an avatar id.' }

  /* Read BEFORE the delete, because `deleteNinaAvatar`'s RETURNING projection is the blob-ref
   * shape and does not carry `source_image_id` — and after the DELETE there is nothing left to
   * ask. One indexed single-row read on a human-paced path. */
  const existing = await getNinaAvatar(userId, parsed.data)
  if (existing == null) return { ok: false, error: 'That photo is not in the album.' }

  /* STEP 1 — while `parsed.data` still links them. Never throws; see the module's header. Run for
   * a pointer row too: a chat row can re-show it, and that link is about to be cut. */
  await promoteNinaAvatarDependents(userId, [parsed.data])

  /* STEP 2 — the row. This is the statement inside which `ON DELETE SET NULL` fires. */
  const removed = await deleteNinaAvatar(userId, parsed.data)
  if (removed == null) {
    return { ok: false, error: 'That is her current photo — make another one current first.' }
  }

  /* STEP 3 — the bytes, per object, and only if nothing else names them. A POINTER OWNS NO BYTES,
   * so it releases nothing at all; see the docstring's own block. */
  if (existing.sourceImageId == null) {
    await releaseBlobIfUnreferenced(userId, {
      blobUrl: removed.blobUrl,
      pathname: removed.pathname,
    })
    if (removed.thumbUrl != null) {
      /* `thumb_pathname` and `thumb_url` are written together by `registerNinaAvatarsAction`, so a
       * URL with no pathname is not a state this table produces. If one ever appeared, asking about
       * the URL under both parameters is still a correct question — `isBlobPathnameReferenced` ORs
       * the pathname columns with the URL columns, and a pathname that matches nothing simply
       * contributes nothing to the answer. */
      await releaseBlobIfUnreferenced(userId, {
        blobUrl: removed.thumbUrl,
        pathname: removed.thumbPathname ?? removed.thumbUrl,
      })
    }
  }

  revalidatePath('/admin/nina')
  return { ok: true }
}
```

**File:** `lib/admin/chatPhotoActions.ts:623-671` (`removeChatPhotoAction`)
**Change:** an explicit pre-check above the carrier read, so the FK never surfaces raw.

**Code — the new import lines (added to the `@/lib/nina/queries` block at `:29-46`):**

```ts
  countNinaAvatarsLinkedToImage,
  deleteNinaMessage,
```

**Code — the docstring's new block (inserted before `:623`) and the body's first half (replacing
`:623-641`):**

```ts
/**
 * ── AND A PHOTOGRAPH AN ALBUM ENTRY POINTS AT CANNOT LEAVE ─────────────────────────────────
 * `media-album-unified-search` R3. Since the promotion became a LINK, a `nina_avatars` row can
 * name this row through `source_image_id` and show its object without owning a byte. The FK is
 * `ON DELETE RESTRICT` — the plan index's Decision argues why, against `SET NULL` (a pointer with
 * no bytes, unrecoverable) and `CASCADE` (silently losing the "current profile picture"
 * designation) — so Postgres refuses this delete either way.
 *
 * The check below turns that refusal into the shape the operator already knows from
 * `deleteNinaAvatarAction`'s *"That is her current photo — make another one current first."*: one
 * sentence naming the fix, instead of a constraint violation surfaced as a framework error page.
 * The constraint stays the backstop for the race this read cannot close, exactly as
 * `nina_avatars_user_source_key_unq` is for re-adoption's.
 *
 * It sits ABOVE `loadPhotoCarrier` and above `promoteNinaImageDependents` for
 * `isChatPhotoReference`'s stated reason, one refusal over: nothing may be measured, promoted or
 * deleted on behalf of a remove that is not going to happen.
 */
export async function removeChatPhotoAction(input: unknown): Promise<ChatPhotoActionResult> {
  const { userId } = await requireAdmin()

  const parsed = chatPhotoRemoveSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'Not a photo id.' }
  const { id } = parsed.data

  const row = await getNinaMessageImage(userId, id)
  if (row == null) return { ok: false, error: 'That photo is not in the collection.' }
  if (isChatPhotoReference(row)) {
    return {
      ok: false,
      error: 'That one re-shows a photo that lives elsewhere. Remove the original instead.',
    }
  }

  const linked = await countNinaAvatarsLinkedToImage(userId, id)
  if (linked > 0) {
    return {
      ok: false,
      error:
        linked === 1
          ? 'An album entry shows this photo — remove it from the album first.'
          : `${linked} album entries show this photo — remove them from the album first.`,
    }
  }

  const carrier = await loadPhotoCarrier(userId, row.messageId)
  const isLastImage = carrier.siblings.every((sibling) => sibling.id === id)
```

The rest of the function (`:642-671`) is unchanged.

**Impact:** `replaceChatPhotoAction` deliberately gains NO such guard — a replace swaps the bytes
behind a row that stays, so the album pointer keeps a valid link and simply shows the new
photograph, which is the correct and arguably desirable behaviour for a link. Noted in
**Handoffs** as a thing Phase 3 may want to say in the pane.

---

### Step 8: The merged search

**File:** `lib/nina/queries/avatarsearch.ts`
**Change:** the three ranking constants, `queryVector`, `matchesNegativeKeyword` and `clampLimit` are
untouched. `cosineDistanceTo` splits into two table-bound spellings; `searchScope`/`rankByDistance`
become two arms plus a merge; the three exported functions are renamed.

**Code — the import block and the header's last paragraph (replacing `:1-6` and `:41-43`):**

```ts
import { and, asc, desc, eq, isNotNull, isNull, notExists, sql, type SQL } from 'drizzle-orm'

import { db } from '@/lib/db'
import { ninaAvatars, ninaMessageImages } from '@/lib/db/schema'
import type { NinaPhotoSearchPage, NinaPhotoSearchRow } from './shapes'
import { avatarColumns } from './columns'
import { isOriginalPhoto } from './images'
```

```
 * Imports foundation-wards (`./shapes`, `./columns`) plus `db`, the two tables, and ONE sibling
 * domain module: `./images`' `isOriginalPhoto`. That one edge is deliberate — the media arm's
 * "not a re-share" rule must be the SAME predicate every other collection read uses, and a second
 * spelling of it here is how the two would one day disagree about which photographs exist. Never
 * the barrel `@/lib/nina/queries`, which re-exports this module.
```

**Code — replacing `:130-133` (`cosineDistanceTo`) with the two table-bound spellings:**

```ts
/** Cosine DISTANCE (0 = identical, 2 = opposed) between the ALBUM column and one query vector. */
function albumDistanceTo(embedding: readonly number[]): SQL {
  return sql`(${ninaAvatars.descriptionEmbedding} <=> ${queryVector(embedding)})`
}

/** The same, against the MEDIA column. Two functions and not one parameterised by a column,
 *  because the two are used in two different statements against two different tables and a shared
 *  one would have to take the column as an argument — which is a way of spelling "get it wrong". */
function mediaDistanceTo(embedding: readonly number[]): SQL {
  return sql`(${ninaMessageImages.descriptionEmbedding} <=> ${queryVector(embedding)})`
}
```

**Code — replacing `:167-236` (`searchScope` + `rankByDistance`) in full:**

```ts
/**
 * "Yours, searchable, and not a pointer." The ALBUM arm's candidate set, shared by its ranked page
 * and its coverage count so the two can never disagree about what was compared.
 *
 * ── THE `source_image_id IS NULL` ARM IS INSURANCE, AND IT IS SAID OUT LOUD ─────────────────
 * `media-album-unified-search` R3. A pointer row's `description_embedding` is permanently NULL by
 * the plan index's Decision (its prose lives on the Media row it names), so `IS NOT NULL` above
 * already excludes it and this arm is technically redundant. It is here anyway, in the same spirit
 * as `nina_avatars`' HNSW index note about a predicate that is *"insurance rather than a
 * requirement"*: it is the one place in the ranking that STATES the dedup invariant — one physical
 * photograph, one hit — rather than relying on a NULL somewhere else to imply it. If a future
 * writer ever fills a pointer's vector by mistake, this line is what keeps the album from
 * returning the same photograph twice, and the failure shows up as a review comment instead of as
 * a duplicate tile.
 */
function albumSearchScope(userId: string) {
  return and(
    eq(ninaAvatars.userId, userId),
    isNotNull(ninaAvatars.descriptionEmbedding),
    isNull(ninaAvatars.sourceImageId),
  )
}

/**
 * The MEDIA arm's candidate set. Yours, searchable, an ORIGINAL — and not a photograph a LEGACY
 * album COPY already stands in for.
 *
 * ── `isOriginalPhoto()`, FOR THE REASON EVERY OTHER COLLECTION READ HAS IT ──────────────────
 * A row carrying `source_avatar_id`/`source_image_id` RE-SHOWS a photograph that lives elsewhere.
 * It is excluded from `/nina/about`'s feed, from the Media view and from the picker; a search that
 * returned it would be the one surface in the app that shows the same photograph twice.
 *
 * ── THE `NOT EXISTS` ARM, AND WHY IT IS QUALIFIED THE WAY IT IS ─────────────────────────────
 * `isOriginalPhoto()` catches ALBUM → CHAT only. The other direction, CHAT → ALBUM, is
 * `generatedChatPhotoScope`'s problem and this is its answer, borrowed whole: 18 `nina_avatars`
 * rows in production carry `source_key LIKE 'chat-photo:%'` from before this set — real, byte-copied
 * album rows with their own descriptions and their own vectors, whose chat originals are still
 * ordinary rows. Once phase 4 embeds those originals, each of those 18 photographs would rank
 * TWICE, which is exactly what the user ruled out (*"we need to make sure there are no duplicates
 * in the search result"*). `generatedChatPhotoScope` already decided which half survives —
 * *"the copy is the survivor and the original is the one hidden, because the copy is the row the
 * operator just made current"* — and this follows it rather than inventing a second rule.
 *
 * **`and ... source_image_id is null` inside the subquery is the whole of the correctness.** A
 * POINTER row carries `source_key = 'chat-photo:<id>'` too (step 6 keeps it, because it is what
 * makes re-adoption a constraint decision), so an unqualified `NOT EXISTS` would hide the Media
 * row of every newly linked photograph — the one half of the pair that IS ranked, since the
 * pointer's own vector is permanently NULL. Result: a photograph promoted to her profile picture
 * would silently vanish from search. The qualifier says the rule exactly: only a COPY hides its
 * original; a LINK does not, because a link is not a second photograph.
 *
 * The outer parentheses are load-bearing and hand-written for `generatedChatPhotoScope`'s measured
 * reason: `notExists()` emits its argument's chunks verbatim, and a raw `sql` template does not
 * bracket itself. It is scoped (`nina_avatars.user_id` inside the subquery) and index-backed
 * (`nina_avatars_user_source_key_unq`), so it is an equality probe per candidate row, not a scan.
 */
function mediaSearchScope(userId: string) {
  const supersededByALegacyCopy = sql`(
    select 1
      from ${ninaAvatars}
     where ${ninaAvatars.userId} = ${userId}
       and ${ninaAvatars.sourceKey} = 'chat-photo:' || ${ninaMessageImages.id}
       and ${ninaAvatars.sourceImageId} is null
  )`

  return and(
    eq(ninaMessageImages.userId, userId),
    isNotNull(ninaMessageImages.descriptionEmbedding),
    isOriginalPhoto(),
    notExists(supersededByALegacyCopy),
  )
}

/** The MEDIA arm's projection. Deliberately NOT `imageColumns`: `prompt`, the two provenance ids,
 *  the two hashes and `sortOrder` are of no use to a ranked tile, and the vector is never SELECTed
 *  anywhere (`queries/imageEmbeddings.ts`'s header). */
const mediaSearchColumns = {
  id: ninaMessageImages.id,
  blobUrl: ninaMessageImages.blobUrl,
  kind: ninaMessageImages.kind,
  width: ninaMessageImages.width,
  height: ninaMessageImages.height,
  bytes: ninaMessageImages.bytes,
  description: ninaMessageImages.description,
  searchKeywords: ninaMessageImages.searchKeywords,
  negativeSearchKeywords: ninaMessageImages.negativeSearchKeywords,
  createdAt: ninaMessageImages.createdAt,
}

/**
 * The ALBUM arm: rank by a distance expression, and count the candidates that were ranked.
 *
 * Two statements rather than a `count(*) OVER ()` window, for `listNinaAvatarsInFolder`'s reason —
 * the count is about the CANDIDATE SET, not the page, so a window over the limited result would
 * report the page size and mean nothing.
 *
 * The per-arm tiebreak is `(created_at desc, id desc)`, the album's own ordering, and it stays
 * INSIDE the arm rather than being deferred to the merge. That is not redundant with the merged
 * sort below: it is what makes the arm's own `LIMIT` deterministic — which 48 of 300 equally
 * distant rows come back is decided here, and without it two renders could fetch two different
 * sets before the merge ever sees them.
 */
async function rankAlbum(
  userId: string,
  distance: SQL,
  limit: number,
): Promise<{ rows: NinaPhotoSearchRow[]; total: number }> {
  const scope = albumSearchScope(userId)

  const [ranked, counted] = await Promise.all([
    db
      .select({ ...avatarColumns, score: sql<number>`1 - ${distance}`.mapWith(Number) })
      .from(ninaAvatars)
      .where(scope)
      .orderBy(asc(distance), desc(ninaAvatars.createdAt), desc(ninaAvatars.id))
      .limit(limit),
    db
      .select({ total: sql<number>`count(*)`.mapWith(Number) })
      .from(ninaAvatars)
      .where(scope),
  ])

  const rows: NinaPhotoSearchRow[] = ranked.map((row) => ({
    origin: 'album',
    id: row.id,
    blobUrl: row.blobUrl,
    thumbUrl: row.thumbUrl,
    folder: row.folder,
    filename: row.filename,
    width: row.width,
    height: row.height,
    bytes: row.bytes,
    source: row.source,
    isCurrent: row.isCurrent,
    description: row.description,
    searchKeywords: row.searchKeywords,
    negativeSearchKeywords: row.negativeSearchKeywords,
    cropScale: row.cropScale,
    cropX: row.cropX,
    cropY: row.cropY,
    createdAt: row.createdAt,
    score: row.score,
  }))

  return { rows, total: counted[0]?.total ?? 0 }
}

/**
 * The MEDIA arm. The same two statements, the same tiebreak, the same reasons — and five constant
 * fields, each of which is `MediaExplorerPhoto`'s own existing convention rather than a new
 * opinion invented for search:
 *
 *   · `folder: ''` — a Media row is filed nowhere, and `''` is what `ExplorerPhotoBase.folder`
 *     already documents as *"the only value a media row ever carries"*.
 *   · `isCurrent: false` — *"a message image is never itself her face"*; only an album row carries
 *     `is_current`, and a pointer to this photograph would be a different hit that this arm's
 *     `NOT EXISTS`/the album arm's `IS NULL` have already resolved.
 *   · `thumbUrl: null` — the table has no thumbnail column; every consumer falls back to `url`.
 *   · the three crop fields `null` — `resolveCrop` folds all-null to centred `object-cover`.
 *   · `source: row.kind` — `ExplorerPhotoBase.source` documents exactly this: *"Media: the row's
 *     own `kind`, which on that table IS the provenance."*
 *
 * `filename: null` — the Media view DERIVES a display name from the row's date and id in
 * `app/admin/nina/page.tsx`, and the data layer does not know that format. The consumer's existing
 * `row.filename ?? row.id` fallback gives the id, which is a truthful name; a nicer one is the UI
 * phase's to build if it wants one.
 */
async function rankMedia(
  userId: string,
  distance: SQL,
  limit: number,
): Promise<{ rows: NinaPhotoSearchRow[]; total: number }> {
  const scope = mediaSearchScope(userId)

  const [ranked, counted] = await Promise.all([
    db
      .select({ ...mediaSearchColumns, score: sql<number>`1 - ${distance}`.mapWith(Number) })
      .from(ninaMessageImages)
      .where(scope)
      .orderBy(asc(distance), desc(ninaMessageImages.createdAt), desc(ninaMessageImages.id))
      .limit(limit),
    db
      .select({ total: sql<number>`count(*)`.mapWith(Number) })
      .from(ninaMessageImages)
      .where(scope),
  ])

  const rows: NinaPhotoSearchRow[] = ranked.map((row) => ({
    origin: 'media',
    id: row.id,
    blobUrl: row.blobUrl,
    thumbUrl: null,
    folder: '',
    filename: null,
    width: row.width,
    height: row.height,
    bytes: row.bytes,
    source: row.kind,
    isCurrent: false,
    description: row.description,
    searchKeywords: row.searchKeywords,
    negativeSearchKeywords: row.negativeSearchKeywords,
    cropScale: null,
    cropX: null,
    cropY: null,
    createdAt: row.createdAt,
    score: row.score,
  }))

  return { rows, total: counted[0]?.total ?? 0 }
}

/**
 * **The merge — R1's whole answer.** Both arms, concurrently, then one ranking.
 *
 * ── FOUR STATEMENTS IN ONE `Promise.all`, NOT TWO ROUND TRIPS ───────────────────────────────
 * `rankAlbum` and `rankMedia` each run their page and their count together; running the two ARMS
 * together as well makes the whole search one round trip's latency instead of two. Nothing in
 * either arm depends on the other, so serialising them would buy nothing and cost a search's worth
 * of perceived speed on a click the operator is watching.
 *
 * ── WHY NOT ONE SQL `UNION ALL` ─────────────────────────────────────────────────────────────
 * Because the two tables have different column sets, and a `UNION ALL` would need a
 * lowest-common-denominator projection with NULL padding on both sides — the merge would move into
 * SQL and the per-table `LIMIT` would move with it, at which point neither arm's HNSW index can
 * answer its own ordering cleanly. Two indexed top-N reads plus a JS merge of at most 96 rows is
 * the cheaper and the more legible shape, and it is the shape
 * `searchNinaAvatarsByTextAndCaption`'s own docstring already reasons about for the mirror case.
 *
 * ── THE ORDER OF THE FOUR JS STEPS IS THE CONTRACT ──────────────────────────────────────────
 *   1. **Concatenate**, tagged with `origin`. Nothing is deduplicated here and nothing needs to be:
 *      the two scopes are disjoint by construction (a pointer's album row is excluded by
 *      `IS NULL`, a legacy copy's media row by `NOT EXISTS`), which is what makes "every physical
 *      photograph at most once" a property of the PREDICATES rather than of a post-hoc filter.
 *   2. **The relevance floor**, `NINA_SEARCH_MIN_SCORE`, applied identically to both origins.
 *      Identically is the point: one floor over one comparison against one query vector in one
 *      space, so a Media hit at 0.21 and an album hit at 0.21 are the same statement about
 *      relevance and are treated as such.
 *   3. **The negative-keyword exclusion**, on the same pass, reading each row's OWN
 *      `negative_search_keywords` whichever table it came from. `queryText === null` (the
 *      image-only arm) exempts both origins by construction — no branch, no flag.
 *   4. **The merged sort, then the clamp.** `score desc`, then `created_at desc`, then `id desc`,
 *      over the COMBINED set — deliberately NOT a stable sort over the concatenation order, which
 *      would make the album arm silently win every exact tie for no reason a reader could name.
 *      `id desc` is the final decider, so the rule is total and two renders of the same corpus
 *      cannot disagree. An id collision across the two tables is possible in principle (both are
 *      `newId()`), and harmless: the pair is already ordered by score and date.
 *
 *      The clamp is LAST and it is `NINA_SEARCH_LIMIT` over the WHOLE result, not per table. Each
 *      arm is asked for the full limit and the merged 96 is trimmed to 48 — asking each arm for 24
 *      would silently under-serve any query one collection dominates, which is most of them.
 *
 * `total` is the SUM of the two candidate counts, keeping `searched`'s meaning exactly what it has
 * always been: *"how many rows were compared"*, not how many passed and not the page size.
 */
async function rankMerged(
  userId: string,
  albumDistance: SQL,
  mediaDistance: SQL,
  limit: number,
  queryText: string | null,
): Promise<NinaPhotoSearchPage> {
  const [album, media] = await Promise.all([
    rankAlbum(userId, albumDistance, limit),
    rankMedia(userId, mediaDistance, limit),
  ])

  const merged = [...album.rows, ...media.rows]
    .filter((row) => row.score >= NINA_SEARCH_MIN_SCORE)
    .filter(
      (row) => queryText === null || !matchesNegativeKeyword(queryText, row.negativeSearchKeywords),
    )
    .sort(
      (a, b) =>
        b.score - a.score ||
        b.createdAt.getTime() - a.createdAt.getTime() ||
        (a.id < b.id ? 1 : a.id > b.id ? -1 : 0),
    )
    .slice(0, limit)

  return { rows: merged, total: album.total + media.total }
}
```

**Code — the three exported functions, replacing `:238-307` in full:**

```ts
/**
 * **R1/R2 — "every single picture in any directory must be able to be image searched."**
 *
 * `queryEmbedding` is `embedNinaText(<what the operator typed>)`. This function does not embed and
 * does not know what a model is: the data layer takes vectors, the Server Action owns the vendor
 * call. That is what lets the whole ranking be unit-tested against generated SQL with no network.
 *
 * Renamed from `searchNinaAvatarsByText` by `media-album-unified-search`: it stopped being about
 * avatars the moment it grew a second arm, and a name that says "avatars" over a merged ranking is
 * the kind of half-truth that survives three refactors.
 */
export async function searchNinaPhotosByText(
  userId: string,
  queryEmbedding: readonly number[],
  queryText: string | null = null,
  opts: { limit?: number } = {},
): Promise<NinaPhotoSearchPage> {
  return rankMerged(
    userId,
    albumDistanceTo(queryEmbedding),
    mediaDistanceTo(queryEmbedding),
    clampLimit(opts.limit),
    queryText,
  )
}

/**
 * **R3 — "admin can search using image only … output the most similar images."**
 *
 * `captionEmbedding` is `embedNinaText(<what glm-4.6v saw in the uploaded photo>)`. The statements
 * this builds are IDENTICAL to `searchNinaPhotosByText`'s, and that is the design rather than a
 * duplication: image search in this app IS text search, run against a caption instead of a typed
 * phrase. It exists as its own name so the Server Action's three-way branch reads as the three
 * things the user asked for, and so a future divergence has a place to land that is not an `if`.
 */
export async function searchNinaPhotosByImageCaption(
  userId: string,
  captionEmbedding: readonly number[],
  opts: { limit?: number } = {},
): Promise<NinaPhotoSearchPage> {
  /* `queryText: null` — an uploaded photo's caption is `glm-4.6v`'s prose, not a phrase the
   * operator typed, so there is nothing a hand-written negative keyword could be checked against.
   * See `rankMerged`'s step 3. */
  return rankMerged(
    userId,
    albumDistanceTo(captionEmbedding),
    mediaDistanceTo(captionEmbedding),
    clampLimit(opts.limit),
    null,
  )
}

/**
 * **R4 — "think of a way to resolve the scoring between these 2."**
 *
 * The resolution is a weighted average of the two cosine SIMILARITIES, computed as a weighted
 * average of the two DISTANCES, which is the same number because the weights sum to 1:
 *
 *     w·(1 − d_text) + (1 − w)·(1 − d_caption)  =  1 − ( w·d_text + (1 − w)·d_caption )
 *
 * So one expression is both the ranking key (ascending) and, via `1 − x`, the reported score — and
 * the weights cannot drift between the two, because there is only one of them. It is built TWICE
 * here, once per table, and that is not a second opinion: it is the same expression over each
 * table's own column, which is the only way two columns can be ranked by one identity.
 *
 * ONE statement per arm, not two ranked passes merged in JS per arm. Both signals are already
 * comparable (same model, same space), which is exactly the precondition reciprocal rank fusion
 * exists to work around; using RRF here would discard the magnitudes for no gain.
 *
 * Neither HNSW index can answer this ordering — it is a sum over two different query vectors — so
 * each arm is a scan of that user's embedded rows. At the requirement's scale (~70 album rows and
 * ~154 media rows today) that is a few hundred 1536-float dot products, single-digit milliseconds;
 * stated so nobody "fixes" it into indexed passes and a merge.
 */
export async function searchNinaPhotosByTextAndCaption(
  userId: string,
  textEmbedding: readonly number[],
  captionEmbedding: readonly number[],
  queryText: string | null = null,
  opts: { limit?: number } = {},
): Promise<NinaPhotoSearchPage> {
  const albumWeighted = sql`(${NINA_SEARCH_TEXT_WEIGHT}::float8 * ${albumDistanceTo(textEmbedding)} + ${NINA_SEARCH_CAPTION_WEIGHT}::float8 * ${albumDistanceTo(captionEmbedding)})`
  const mediaWeighted = sql`(${NINA_SEARCH_TEXT_WEIGHT}::float8 * ${mediaDistanceTo(textEmbedding)} + ${NINA_SEARCH_CAPTION_WEIGHT}::float8 * ${mediaDistanceTo(captionEmbedding)})`
  /* `queryText` here is the TYPED half only (R4's own text arm) — see the docstring's note on why
   * the caption half is exempt: nothing the operator wrote is being checked against it. */
  return rankMerged(userId, albumWeighted, mediaWeighted, clampLimit(opts.limit), queryText)
}
```

**File:** `lib/nina/queries/shapes.ts:487-524`
**Change:** replace `NinaAvatarSearchRow` and `NinaAvatarSearchPage`.

**Code:**

```ts
/** Which table a merged search hit came from. `media-album-unified-search` R1. */
export type NinaPhotoSearchOrigin = 'album' | 'media'

/**
 * One ranked photograph of the MERGED search — the union of what a `nina_avatars` row and a
 * `nina_message_images` row can both say about themselves, plus where it came from and what it
 * scored. `media-album-unified-search` R1, replacing `NinaAvatarSearchRow`.
 *
 * ── A FLAT SHAPE AND NOT A DISCRIMINATED UNION, DELIBERATELY ────────────────────────────────
 * The consumer (`toHit`, `lib/admin/ninaAlbumSearchActions.ts`) maps every hit to ONE
 * `AdminSearchHit`, because the results grid draws one kind of tile. A union would make that
 * mapping a two-branch `switch` whose two branches wrote the same object, and would push the
 * "a media row is filed nowhere / is never current / has no thumbnail" conventions into the
 * consumer instead of into the query that knows them. So the query layer applies
 * `MediaExplorerPhoto`'s own documented constants (see `rankMedia`) and hands over one shape.
 * `origin` rides along because the UI phase needs it for the deep link and the pane it opens, not
 * because the type varies by it.
 *
 * `filename` is nullable here (it is on `nina_avatars` and absent on `nina_message_images`); the
 * `?? id` fallback is the consumer's, exactly as it already was.
 */
export interface NinaPhotoSearchRow {
  origin: NinaPhotoSearchOrigin
  id: string
  blobUrl: string
  thumbUrl: string | null
  /** `''` for every media row — it is filed nowhere. See `rankMedia`. */
  folder: string
  filename: string | null
  width: number | null
  height: number | null
  bytes: number | null
  /** The album row's `source`, or the media row's `kind` — `ExplorerPhotoBase.source`'s rule. */
  source: string
  /** Always `false` for a media row. */
  isCurrent: boolean
  description: string | null
  searchKeywords: string | null
  /**
   * Read by `matchesNegativeKeyword` at merge time, for BOTH origins. It is on the row rather than
   * looked up later because the exclusion is applied over the merged page and a second read per
   * row would be 96 round trips for a filter.
   */
  negativeSearchKeywords: string | null
  cropScale: number | null
  cropX: number | null
  cropY: number | null
  createdAt: Date
  /**
   * Cosine similarity against the query vector, `1 - (embedding <=> query)`.
   *
   * In `[-1, 1]` by definition, and in practice in `[0, 1]` for two embeddings of English prose
   * from one model. It is a RELATIVE number: read it to order results and to grey out the weak
   * tail, never as a percentage, and never compare one query's scores against another's. **It is
   * also comparable ACROSS the two origins**, which is what makes the merged sort legitimate
   * rather than a coincidence: one model, one space, one column shape on both tables.
   *
   * On `searchNinaPhotosByTextAndCaption` it is the WEIGHTED similarity — see that function.
   */
  score: number
}

/**
 * A page of merged search results.
 *
 * `total` means *"how many rows were actually compared"* — the sum of BOTH tables' candidate
 * counts, i.e. how many rows across the two carry a `description_embedding` and are not excluded
 * by their arm's dedup predicate. It is NOT the collection's size and NOT a pager's denominator;
 * search returns one flat top-N list and has no pager. It is the coverage number: "48 shown, out of
 * 196 photos that have been described". Phase 4's Media backfill is what moves it.
 */
export interface NinaPhotoSearchPage {
  rows: NinaPhotoSearchRow[]
  total: number
}
```

**File:** `lib/nina/queries.ts:25-27` (the module map) and `:72-74` (the `export *` block)
**Change:**

```
 *   queries/avatarEmbeddings.ts §9c    the description_embedding writes (semantic search)
 *   queries/imageEmbeddings.ts  §5c    the MEDIA description_embedding writes (unified search)
 *   queries/avatarPointer.ts    §9e    where a linked album row's prose actually lives
 *   queries/avatarsearch.ts     §9d    the MERGED semantic search over both tables (R1/R2/R3)
```

```ts
export * from './queries/avatarEmbeddings'
export * from './queries/imageEmbeddings'
export * from './queries/avatarPointer'
export * from './queries/avatarsearch'
```

**Impact:** `lib/nina/queries.test.ts:44`'s `BARREL_VALUE_EXPORTS` goes 96 → 104 (Step 13).

---

### Step 9: The Media keyword bounds and schemas

**File:** `lib/admin/chatPhotos.ts:188` (immediately after `ADMIN_CHAT_PHOTO_MAX_DESCRIPTION_CHARS`)

```ts
/**
 * **How long a hand-written keyword list may be, on a MEDIA row** —
 * `media-album-unified-search` R2. 500.
 *
 * ── WHY IT IS A SIBLING OF `ADMIN_AVATAR_MAX_SEARCH_KEYWORDS_CHARS` AND NOT AN IMPORT OF IT ──
 * Because that constant's own docstring rules on exactly this question, in the other direction:
 * *"NOT `ADMIN_CHAT_PHOTO_MAX_DESCRIPTION_CHARS` … sharing a bound here would assert a kinship
 * that does not exist"*, and its negative twin adds *"the two columns' bounds happening to agree
 * today is not a promise that they always will."* Two constants that agree beats one that is
 * shared across a boundary the file next door already declined to cross.
 *
 * The NUMBER is derived the same way its album twin's is, and the derivation holds because the two
 * tables now feed ONE embedding text: `NINA_EMBEDDING_MAX_CHARS` truncates at 8 000 and the
 * combined text is `description + "\n\nKeywords: " + searchKeywords`, so
 * `ADMIN_CHAT_PHOTO_MAX_DESCRIPTION_CHARS` (2 000) + 13 + 500 = 2 513 — two-and-a-half times of
 * headroom, and the keywords can never be the half that gets cut. 500 is also ~30 comma-separated
 * phrases, more than a human tags one photograph with.
 */
export const ADMIN_CHAT_PHOTO_MAX_SEARCH_KEYWORDS_CHARS = 500

/**
 * **How long a hand-written EXCLUSION list may be, on a MEDIA row** —
 * `media-album-unified-search` R2. Same 500, different reason: this column never joins the
 * embedded text, so `NINA_EMBEDDING_MAX_CHARS` has nothing to say about it. The bound here is the
 * "a human types this" ceiling its neighbour argues for itself — a separate constant, because the
 * two agreeing today is not a promise.
 */
export const ADMIN_CHAT_PHOTO_MAX_NEGATIVE_SEARCH_KEYWORDS_CHARS = 500
```

**File:** `lib/admin/chatPhotoSchema.ts` — add the two constants to the existing import from
`@/lib/admin/chatPhotos` (`:3-9`), and append after `chatPhotoDescriptionSchema` (`:148`):

```ts
/**
 * **"Tag this photograph with the words it should be findable by", as a field.**
 * `media-album-unified-search` R2 — the media twin of `avatarSearchKeywordsField`
 * (`lib/admin/schema.ts`), and normalised identically for the identical reason.
 *
 * `\s+` folded to one space and trimmed — this is a LINE, not a paragraph, unlike
 * `chatPhotoDescriptionField` above, which preserves blank lines because it holds prose. Nothing
 * is split, sorted, de-duplicated or case-folded: the commas are a human's convention, and
 * `buildNinaAvatarEmbedText` embeds what the operator typed.
 *
 * `.max()` before `.transform()`, this file's rule: an over-long paste is REFUSED and reported
 * inline, never silently truncated into range. No `.min(1)`, also this file's rule: an
 * all-whitespace box normalises to `''`, this accepts it, and the action turns it into `NULL`.
 */
export const chatPhotoSearchKeywordsField = z
  .string()
  .max(ADMIN_CHAT_PHOTO_MAX_SEARCH_KEYWORDS_CHARS)
  .transform((value) => value.replace(/\s+/g, ' ').trim())

/** The hand-edit write. `chatPhotoDescriptionSchema`'s exact shape for the other free-text column. */
export const chatPhotoSearchKeywordsSchema = z.object({
  id: chatPhotoId,
  searchKeywords: chatPhotoSearchKeywordsField,
})

/**
 * **"Tell the search what this photograph should never match", as a field.**
 * `media-album-unified-search` R2 — the media twin of `avatarNegativeSearchKeywordsField`.
 *
 * Same normalisation as the field above and for the same reason: it is about to be checked
 * word-for-word against a typed query. `matchesNegativeKeyword`
 * (`lib/nina/queries/avatarsearch.ts`) owns the comma split and the case-insensitive compare; this
 * schema only bounds the shape.
 */
export const chatPhotoNegativeSearchKeywordsField = z
  .string()
  .max(ADMIN_CHAT_PHOTO_MAX_NEGATIVE_SEARCH_KEYWORDS_CHARS)
  .transform((value) => value.replace(/\s+/g, ' ').trim())

/** The hand-edit write. `chatPhotoSearchKeywordsSchema`'s exact twin for the other column. */
export const chatPhotoNegativeSearchKeywordsSchema = z.object({
  id: chatPhotoId,
  negativeSearchKeywords: chatPhotoNegativeSearchKeywordsField,
})
```

---

### Step 10: The two Media keyword Server Actions

**File:** `lib/admin/chatPhotoKeywordActions.ts` (new)
**Change:** the media twins of `editNinaAvatarSearchKeywordsAction` /
`editNinaAvatarNegativeSearchKeywordsAction`, in a module of their own rather than appended to a
1 148-line file — the same seam-per-module split the album side already has
(`ninaAlbumDescribeActions.ts` beside `ninaAlbumAvatarActions.ts`).

**Code (whole file):**

```ts
'use server'

import { revalidatePath } from 'next/cache'

import {
  ADMIN_CHAT_PHOTOS_PATH,
  ADMIN_CHAT_PHOTO_MAX_NEGATIVE_SEARCH_KEYWORDS_CHARS,
  ADMIN_CHAT_PHOTO_MAX_SEARCH_KEYWORDS_CHARS,
  type ChatPhotoActionResult,
} from '@/lib/admin/chatPhotos'
import {
  chatPhotoNegativeSearchKeywordsSchema,
  chatPhotoSearchKeywordsSchema,
} from '@/lib/admin/chatPhotoSchema'
import { scheduleMediaEmbed } from '@/lib/admin/ninaMediaDeferredDescribe'
import { requireAdmin } from '@/lib/admin/requireAdmin'
import {
  getNinaMessageImage,
  setNinaMessageImageNegativeSearchKeywords,
  setNinaMessageImageSearchKeywordsAndEmbedding,
} from '@/lib/nina/queries'

/**
 * The keyword half of the media layer — the two hand-written phrase lists on a
 * `nina_message_images` row, and nothing else. `media-album-unified-search` R2, from the user's
 * own words: *"every single picture in any directory must be able to be image searched and we must
 * be able to add search keyword and negative search keyword to each of them."*
 *
 * ── WHY A MODULE OF ITS OWN AND NOT TWO MORE EXPORTS IN `chatPhotoActions.ts` ───────────────
 * That file is 1 148 lines and is already four seams wide (replace, add, remove, describe) plus
 * three private `after()` schedulers. The album side answered the same question the same way —
 * `ninaAlbumDescribeActions.ts` holds the prose-and-keyword actions and
 * `ninaAlbumAvatarActions.ts` the face-and-lifecycle ones — and this is that split, one table
 * over. Nothing else changes: `ADMIN_CHAT_PHOTOS_PATH` is still what a media action revalidates,
 * and `ChatPhotoActionResult` is still the one shape a media action returns.
 *
 * ── THE FOUR RULES THESE INHERIT, LINE FOR LINE, FROM THE ALBUM TWINS ───────────────────────
 *   1. `requireAdmin()` is line 1, ABOVE any use of an argument.
 *   2. Zod for the SHAPE (which knows no user id — *"a well-formed `Item` object can still refer
 *      to a row the caller does not own"*), then an owner-scoped re-read, then a write whose own
 *      WHERE carries `user_id` AND `isOriginalPhoto()`.
 *   3. AN EMPTY BOX CLEARS THE FIELD, and `NULL` is what every untagged row already carries.
 *   4. NO model call and NO `after()` vision pass — these are the human's words.
 *
 * ── AND ONE RULE OF THIS TABLE'S OWN: A REFERENCE ROW IS REFUSED ────────────────────────────
 * A row carrying `source_avatar_id`/`source_image_id` RE-SHOWS a photograph that lives elsewhere.
 * It is excluded from every collection read and from the merged search, so keywords on it would be
 * words nothing can ever match — and the photograph the operator means is the original, which owns
 * them. The refusal is spelled here for the reason `removeChatPhotoAction` and
 * `describeChatPhotoAction` spell theirs: `getNinaMessageImage` deliberately does not filter
 * (it is the bubble and viewer read too), so each action enforces membership at its own seam. The
 * write's own `isOriginalPhoto()` clause is the second agreeing check.
 *
 * `isChatPhotoReference` stays private to `lib/admin/chatPhotoActions.ts` — a `'use server'` module
 * exports actions, not predicates — so the two-field test is spelled here, held together with its
 * three siblings by tests rather than by imports. That is the arrangement
 * `setChatPhotoAsAvatarAction` already lives under.
 */

/**
 * **"Tag this photograph with the words it should be findable by."** R2, media half.
 *
 * ── THE VECTOR IS NULLED IN THE SAME UPDATE AND RE-EARNED AFTERWARDS ────────────────────────
 * `editNinaAvatarSearchKeywordsAction`'s contract exactly. `description_embedding` is derived from
 * these words (`buildNinaAvatarEmbedText` joins them onto the description), so leaving the old
 * vector standing would keep the photo findable under tags the operator just deleted — the
 * invisible-until-a-search-returns-the-wrong-photo failure. One `SET` of both columns has no
 * window in which they disagree, and `scheduleMediaEmbed` recomputes after the response.
 *
 * ── THE ONE ASYMMETRY: A ROW WITH NO PROSE SCHEDULES NOTHING ────────────────────────────────
 * The embedded text is ANCHORED on the description. There is no keywords-only vector, deliberately:
 * the embed-only worker refuses to describe a NULL description, so a `scheduleMediaEmbed` here
 * would be a read that finds nothing to do. Such a row is already in
 * `listNinaMessageImageDescribeBacklog` (no description), and phase 4's sweep will write prose and
 * then embed the pair — the state heals through the path that already exists.
 */
export async function editNinaMessageImageSearchKeywordsAction(
  input: unknown,
): Promise<ChatPhotoActionResult> {
  const { userId } = await requireAdmin()

  const parsed = chatPhotoSearchKeywordsSchema.safeParse(input)
  if (!parsed.success) {
    return {
      ok: false,
      error: `Those keywords did not fit the field — ${ADMIN_CHAT_PHOTO_MAX_SEARCH_KEYWORDS_CHARS} characters at most.`,
    }
  }
  const { id, searchKeywords } = parsed.data

  const row = await getNinaMessageImage(userId, id)
  if (row == null) return { ok: false, error: 'That photo is not in the collection.' }
  if (row.sourceAvatarId != null || row.sourceImageId != null) {
    return {
      ok: false,
      error: 'That one re-shows a photo that lives elsewhere. Tag the original instead.',
    }
  }

  /* The empty box IS the clear — the same policy line every description and keyword edit runs. */
  const next = searchKeywords.length === 0 ? null : searchKeywords

  const written = await setNinaMessageImageSearchKeywordsAndEmbedding(userId, id, next, null)
  if (!written) return { ok: false, error: 'That photo is not in the collection.' }

  /* Only a row that HAS prose has a vector to re-earn. See the docstring's last block. */
  if (row.description != null) scheduleMediaEmbed(userId, id)

  revalidatePath(ADMIN_CHAT_PHOTOS_PATH)
  return {
    ok: true,
    id,
    ...(next === null ? { note: 'Cleared. The photo is findable by its description alone.' } : {}),
  }
}

/**
 * **"Tell the search what this photograph should never match."** R2, media half.
 *
 * ── NO MODEL CALL, NO VECTOR TOUCHED, NO `scheduleMediaEmbed` ───────────────────────────────
 * The whole reason this is a plain setter rather than its neighbour's shape:
 * `negative_search_keywords` is never folded into the text `description_embedding` is computed
 * from (`buildNinaAvatarEmbedText` reads only `description` and `searchKeywords`), so writing it
 * changes nothing the vector describes. `matchesNegativeKeyword` reads the column fresh at search
 * time, against the words the operator actually typed. There is no derived value to re-earn —
 * exactly the non-involvement `editNinaAvatarNegativeSearchKeywordsAction` has on the album side.
 */
export async function editNinaMessageImageNegativeSearchKeywordsAction(
  input: unknown,
): Promise<ChatPhotoActionResult> {
  const { userId } = await requireAdmin()

  const parsed = chatPhotoNegativeSearchKeywordsSchema.safeParse(input)
  if (!parsed.success) {
    return {
      ok: false,
      error: `Those keywords did not fit the field — ${ADMIN_CHAT_PHOTO_MAX_NEGATIVE_SEARCH_KEYWORDS_CHARS} characters at most.`,
    }
  }
  const { id, negativeSearchKeywords } = parsed.data

  const row = await getNinaMessageImage(userId, id)
  if (row == null) return { ok: false, error: 'That photo is not in the collection.' }
  if (row.sourceAvatarId != null || row.sourceImageId != null) {
    return {
      ok: false,
      error: 'That one re-shows a photo that lives elsewhere. Tag the original instead.',
    }
  }

  /* The empty box IS the clear. */
  const next = negativeSearchKeywords.length === 0 ? null : negativeSearchKeywords

  const written = await setNinaMessageImageNegativeSearchKeywords(userId, id, next)
  if (!written) return { ok: false, error: 'That photo is not in the collection.' }

  revalidatePath(ADMIN_CHAT_PHOTOS_PATH)
  return {
    ok: true,
    id,
    ...(next === null ? { note: 'Cleared. No query is excluded for this photo any more.' } : {}),
  }
}
```

---

### Step 11: The two Media describe writers start feeding the vector

**File:** `lib/admin/chatPhotoActions.ts`
**Change:** `editChatPhotoDescriptionAction` (`:720-753`) and `describeChatPhotoAction`
(`:795-837`) each gain the re-embed the column now makes real. Neither embeds in band.

**Code — imports:** add `import { scheduleMediaEmbed } from '@/lib/admin/ninaMediaDeferredDescribe'`
beside the existing `@/lib/admin/requireAdmin` import at `:22`.

**Code — `editChatPhotoDescriptionAction`'s body, replacing `:734-752`:**

```ts
  const existing = await getNinaMessageImage(userId, id)
  if (existing == null) return { ok: false, error: 'That photo is not in the collection.' }

  /* The empty box IS the clear. D1, and this line is the only place that policy lives. */
  const next = description.length === 0 ? null : description

  const updated = await updateNinaChatPhotoDescription(userId, id, next)
  if (updated == null) return { ok: false, error: 'That photo is not in the collection.' }

  /*
   * ── AND THE VECTOR, WHICH THIS ACTION COULD NOT TOUCH UNTIL TODAY ───────────────────────────
   * `media-album-unified-search` R1. `nina_message_images.description_embedding` did not exist
   * when this action was written, which is why it has never embedded anything — not a decision,
   * an absence. Now that the column is real, the rule is the album's:
   * `editNinaAvatarDescriptionAction`'s *"a stale vector is worse than a missing one, because a
   * missing one is visible in the backlog count and a stale one is invisible until a search
   * returns the wrong photo."*
   *
   * The vector is retracted HERE rather than inside `updateNinaChatPhotoDescription`, and the
   * difference matters: that statement's docstring makes the columns it touches (and the ones it
   * does NOT) its contract, and `scheduleChatPhotoCaption`'s HALF ONE writes prose through a
   * different statement for a different reason. So the retraction is one explicit call on the
   * path that has the human's new words, and `scheduleMediaEmbed` re-earns the vector after the
   * response has gone out.
   *
   * `null` in, `null` out: a CLEARED box leaves prose and vector both NULL, which is the honest
   * state and the one `listNinaMessageImageDescribeBacklog` already looks for. `scheduleMediaEmbed`
   * and never `scheduleMediaDescribe`: a cleared box must not summon `glm-4.6v` to invent prose the
   * operator just removed.
   */
  await setNinaMessageImageDescriptionAndEmbedding(userId, id, next, null)
  if (next != null) scheduleMediaEmbed(userId, id)

  revalidatePath(ADMIN_CHAT_PHOTOS_PATH)
  return {
    ok: true,
    id,
    ...(next === null
      ? {
          note: 'Cleared. If this photo comes up again she will say she could not see it and ask him what it is.',
        }
      : {}),
  }
}
```

Add `setNinaMessageImageDescriptionAndEmbedding` to the `@/lib/nina/queries` import block at
`:29-46`.

> **Why two statements and not one here.** `updateNinaChatPhotoDescription` returns the ROW (the
> action reports on what it wrote and the `null` return is its not-in-the-collection miss) and
> carries the `isOriginalPhoto()` backstop; the second statement retracts the vector. The window
> between them is one in which the row has NEW prose and an OLD vector — the exact state the album
> side avoids with one `SET`. It is accepted here, explicitly, because collapsing them would mean
> either giving `updateNinaChatPhotoDescription` an embedding parameter (putting it within reach of
> `updateNinaChatPhotoBlob`'s callers) or giving up the row return this action's error shape needs.
> The window is two statements wide on one request, and the failure it could produce is "a search a
> few milliseconds from now returns this photo for its previous description", which the very next
> `scheduleMediaEmbed` corrects. **If the reconciler prefers one statement, the change is to give
> `setNinaMessageImageDescriptionAndEmbedding` a `returning(imageColumns)` and drop
> `updateNinaChatPhotoDescription` from this path — flagged rather than silently chosen.**

**Code — `describeChatPhotoAction`'s `try` block, replacing `:811-820`:**

```ts
  try {
    const { description } = await describeNinaImages(
      [{ blobUrl: row.blobUrl, pathname: row.pathname }],
      { subject: describeSubjectForSide(photoSideOf(row.kind)) },
    )
    /*
     * ── AND THE VECTOR, IN THE SAME UPDATE ──────────────────────────────────────────────────
     * `media-album-unified-search` R1, and `describeNinaAvatarAction`'s argument one table over:
     * this action OVERWRITES whatever was stored, so leaving the old vector in place would leave
     * the photo searchable under prose it just stopped having.
     *
     * IN BAND rather than `after()`, for that action's arithmetic: the operator is already waiting
     * ~8-11 s for the vision call they clicked, and an embedding is one small text request with no
     * image in it. `embedNinaMessageImageDescription` never throws — an embedding outage must not
     * turn a successful describe into a failed one; it answers `null`, the row is written
     * prose-with-no-vector, and phase 4's sweep picks it up.
     *
     * ── AND IT READS `search_keywords` WITHOUT WRITING IT ───────────────────────────────────
     * The keywords are the operator's correction of exactly this model's opinion, and a pass that
     * cleared them would erase the correction every time it was needed. The row's stored value is
     * read here and handed to the embedder so the new vector still carries the tags;
     * `setNinaMessageImageDescriptionAndEmbedding` sets two columns and `search_keywords` is not
     * one of them, so the omission is structural.
     *
     * The statement changes from `setNinaMessageImageDescription` to the embedding twin, and the
     * reason the old one was chosen still holds for its remaining caller: a vision pass that
     * produced nothing writes nothing, and NULL is not among this path's outcomes.
     */
    const embedding = await embedNinaMessageImageDescription(description, row.searchKeywords, userId)
    const written = await setNinaMessageImageDescriptionAndEmbedding(
      userId,
      id,
      description,
      embedding,
    )
    if (!written) return { ok: false, error: 'That photo is not in the collection.' }

    revalidatePath(ADMIN_CHAT_PHOTOS_PATH)
    return { ok: true, id, description }
  } catch (cause) {
```

Add `import { embedNinaMessageImageDescription } from '@/lib/admin/ninaMediaDeferredDescribe'` to
the same import line added above (one import statement, two names).

**Impact:** `setNinaMessageImageDescription` keeps exactly one caller — `scheduleChatPhotoCaption`'s
HALF ONE (`:1013`), which describes a photograph so Nina's prompt can read it and legitimately has
nothing to say about search coverage. **Left as-is deliberately**; see **Handoffs**.

---

### Step 12: The album's four actions redirect on a pointer row

**File:** `lib/admin/ninaAlbumDescribeActions.ts`
**Change:** each of the four actions gains one branch. The shape is identical in all four, so it is
argued once in the module header and referenced at each site.

**Code — the module header gains this block after `:44`:**

```
 * ── AND ALL FOUR REDIRECT FOR A POINTER ROW ─────────────────────────────────────────────────
 * `media-album-unified-search` R3. An album row with `source_image_id` set is a POINTER: its own
 * `description`, `search_keywords`, `negative_search_keywords` and `description_embedding` columns
 * are dead — see the FK's header in `lib/db/schema/nina/avatars.ts` and the rule's home,
 * `lib/nina/queries/avatarPointer.ts`. So every write below lands on the `nina_message_images` row
 * it names, through this phase's media setters, and the re-embed it schedules is the MEDIA one.
 *
 * That is not a sync mechanism, it is the absence of one, and that is the point: the user asked
 * that *"editing image description, search keyword, negative keyword in one place will
 * automatically synchronize it with other location"*, and the only design that cannot drift is the
 * one where there is a single row holding the data. Nothing here dual-writes and nothing reconciles.
 *
 * The branch is `row.sourceImageId == null ? <album write> : <media write>` and it is spelled at
 * each of the four sites rather than hidden in a helper: each action writes a DIFFERENT column
 * pair, and a helper taking "which column" would be the merged writer
 * `setNinaAvatarSearchKeywordsAndEmbedding`'s docstring argues against.
```

**Code — `describeNinaAvatarAction`, replacing `:69-111`:**

```ts
  const row = await getNinaAvatar(userId, parsed.data)
  if (row == null) return { ok: false, error: 'That photo is not in the album.' }

  /* A POINTER shows the MEDIA row's photograph, so the media row is what gets described and the
   * media row is where the prose belongs. Delegating rather than re-implementing keeps one vision
   * call, one witness choice (`photoSideOf` there, not `'hers'` here) and one suite — and it is
   * what makes "re-describe from the album pane" and "re-describe from the media pane" literally
   * the same operation, which is R3's ask. See the module header. */
  if (row.sourceImageId != null) {
    const result = await describeChatPhotoAction({ id: row.sourceImageId })
    /* `ChatPhotoActionResult` and `AdminActionResult` are the same four optional fields; the
     * revalidate the delegate ran is `ADMIN_CHAT_PHOTOS_PATH`, which IS `/admin/nina`. */
    return result
  }

  try {
    const { description } = await describeNinaImages(
      [{ blobUrl: row.blobUrl, pathname: row.pathname }],
      { subject: describeSubjectForSide('hers') },
    )
```

The remainder of the `try` block (`:77-111` — the `embedNinaAvatarDescription` call, the
`setNinaAvatarDescriptionAndEmbedding` write, the `revalidatePath` and the `catch`) is unchanged:
it is now the non-pointer path only, and every word of its existing docstring still applies to it.

Add `import { describeChatPhotoAction } from '@/lib/admin/chatPhotoActions'` to the import block.
This is a `'use server'` → `'use server'` import of an exported async action, which is legal and
already precedented (`ninaAlbumAvatarActions.ts` imports from `chatPhotoActions.ts`'s module family
today via `@/lib/admin/chatPhotos`).

**Code — `editNinaAvatarDescriptionAction`, replacing `:147-170`:**

```ts
  const row = await getNinaAvatar(userId, id)
  if (row == null) return { ok: false, error: 'That photo is not in the album.' }

  /* The empty box IS the clear — the same policy line `editChatPhotoDescriptionAction` runs. */
  const next = description.length === 0 ? null : description

  /* A POINTER's prose lives on the media row. See the module header. */
  if (row.sourceImageId != null) {
    await setNinaMessageImageDescriptionAndEmbedding(userId, row.sourceImageId, next, null)
    if (next != null) scheduleMediaEmbed(userId, row.sourceImageId)
  } else {
    /*
     * ── THE VECTOR IS CLEARED HERE AND RE-EARNED AFTERWARDS ─────────────────────────────────
     * (unchanged — see the original block for the full argument: the vector is DERIVED from this
     * prose, so leaving the old one behind would leave the photo searchable under the words the
     * operator just deleted. One UPDATE of both columns has no window; `scheduleEmbed` re-earns
     * the vector after the response. `scheduleEmbed` and not `scheduleDescribe`: a CLEARED box
     * must not summon `glm-4.6v` to invent prose the operator just removed.)
     */
    await setNinaAvatarDescriptionAndEmbedding(userId, id, next, null)
    if (next != null) scheduleEmbed(userId, id)
  }
```

**Code — `editNinaAvatarSearchKeywordsAction`, replacing `:226-234`:**

```ts
  const row = await getNinaAvatar(userId, id)
  if (row == null) return { ok: false, error: 'That photo is not in the album.' }

  /* The empty box IS the clear — the same policy line the description edit runs. */
  const next = searchKeywords.length === 0 ? null : searchKeywords

  /* A POINTER's keywords live on the media row. See the module header.
   *
   * `row.description` is NULL for every pointer (its prose is not here), so the "only a row that
   * HAS prose has a vector to re-earn" test has to be asked of the LINKED row, not of this one.
   * `scheduleMediaEmbed` asks it itself — it re-reads the target inside its `after()` and its
   * `describe: false` worker leaves a NULL description alone — so scheduling unconditionally here
   * is correct and is one fewer read on the request path. That is the same authoritative-skip
   * property `scheduleDescribe`'s docstring claims for the album side. */
  if (row.sourceImageId != null) {
    await setNinaMessageImageSearchKeywordsAndEmbedding(userId, row.sourceImageId, next, null)
    scheduleMediaEmbed(userId, row.sourceImageId)
  } else {
    await setNinaAvatarSearchKeywordsAndEmbedding(userId, id, next, null)
    /* Only a row that HAS prose has a vector to re-earn. See the docstring's last block. */
    if (row.description != null) scheduleEmbed(userId, id)
  }
```

**Code — `editNinaAvatarNegativeSearchKeywordsAction`, replacing `:277-283`:**

```ts
  const row = await getNinaAvatar(userId, id)
  if (row == null) return { ok: false, error: 'That photo is not in the album.' }

  /* The empty box IS the clear — the same policy line the description and keyword edits run. */
  const next = negativeSearchKeywords.length === 0 ? null : negativeSearchKeywords

  /* A POINTER's exclusions live on the media row. No vector on either side of this branch — the
   * column never joins the embedded text. See the module header. */
  if (row.sourceImageId != null) {
    await setNinaMessageImageNegativeSearchKeywords(userId, row.sourceImageId, next)
  } else {
    await setNinaAvatarNegativeSearchKeywords(userId, id, next)
  }
```

**Code — the module's import block gains:**

```ts
import { scheduleMediaEmbed } from '@/lib/admin/ninaMediaDeferredDescribe'
import { describeChatPhotoAction } from '@/lib/admin/chatPhotoActions'
```

and the `@/lib/nina/queries` block gains `setNinaMessageImageDescriptionAndEmbedding`,
`setNinaMessageImageNegativeSearchKeywords`, `setNinaMessageImageSearchKeywordsAndEmbedding`.

**Note on `ensureNinaAvatarDescriptionAction` (`:312`):** its fast path reads `row.description`,
which is NULL for a pointer, so it falls through to `describeNinaAvatarAction`, which now
redirects — and that action's own delegate returns the prose in band. The action needs **no edit**;
a pointer simply always takes its slow path, which costs one extra indexed read on a
share-to-Nina click and is the honest answer while `getNinaAvatar` cannot see through the link.
Improving it is a **Handoff**.

---

### Step 13: The Server Action surface

**File:** `lib/admin/ninaAlbumActions.ts:94-115` (`AdminSearchHit`)
**Change:** three fields.

**Code — inserted after `id: string`:**

```ts
export interface AdminSearchHit {
  /**
   * **Which collection this photograph lives in.** `media-album-unified-search` R1 — search now
   * ranks `nina_avatars` and `nina_message_images` into one list, and the two need different deep
   * links and different pane affordances.
   *
   * It mirrors `ExplorerPhoto`'s own discriminant (`components/admin/explorer/model.ts`) by name
   * and by value, so `{ ...hit }` still lands as a drawable explorer row — which is the property
   * this type's own note calls deliberate: *"add `origin: 'album'` and this IS an
   * `AlbumExplorerPhoto`"*. It is now carried rather than added at the call site.
   */
  origin: 'album' | 'media'
  id: string
```

and after `description`:

```ts
  /** Carried, never rendered — `components/admin/explorer/model.ts:49`, invariant 5. */
  description: string | null
  /**
   * The operator's hand-written search phrases, or `null`. Carried so a result opened in the pane
   * shows the same two boxes the browsing grid does, without a second round trip. For an ALBUM
   * hit this is the row's own column; a POINTER album row never appears in results at all (its
   * vector is permanently NULL — `lib/nina/queries/avatarsearch.ts`'s `albumSearchScope`), so this
   * is never the borrowed value and never NULL-because-linked.
   */
  searchKeywords: string | null
  /** The operator's hand-written EXCLUSION phrases, or `null`. Same carriage, same reason. */
  negativeSearchKeywords: string | null
```

`AdminSearchResult.searched`'s docstring (`:126-130`) gains one sentence:

```
   * Since `media-album-unified-search` it is the SUM across BOTH collections — album rows plus
   * media rows that carry a `description_embedding` and are not superseded by a legacy copy.
```

**File:** `lib/admin/ninaAlbumSearchActions.ts`
**Change:** the three imports rename, `runSearch`'s callees rename, `toHit` takes a
`NinaPhotoSearchRow`.

**Code — the import block at `:12-16`:**

```ts
import {
  searchNinaPhotosByImageCaption,
  searchNinaPhotosByText,
  searchNinaPhotosByTextAndCaption,
  type NinaPhotoSearchRow,
} from '@/lib/nina/queries'
```

**Code — `runSearch`, replacing `:79-91`:**

```ts
async function runSearch(
  userId: string,
  textEmbedding: number[] | null,
  captionEmbedding: number[] | null,
  typed: string | null,
) {
  if (textEmbedding !== null && captionEmbedding !== null) {
    return searchNinaPhotosByTextAndCaption(userId, textEmbedding, captionEmbedding, typed)
  }
  if (textEmbedding !== null) return searchNinaPhotosByText(userId, textEmbedding, typed)
  if (captionEmbedding !== null) return searchNinaPhotosByImageCaption(userId, captionEmbedding)
  throw new Error('searchNinaAvatarsAction: no query arm — the schema should have refused this')
}
```

**Code — `toHit`, replacing `:93-128`:**

```ts
/**
 * One ranked row, narrowed for the browser — for EITHER collection.
 *
 * ── ONE MAPPER AND NOT TWO, BECAUSE THE QUERY LAYER ALREADY RESOLVED THE DIFFERENCES ────────
 * `media-album-unified-search` R1. A media row has no folder, no framing, no thumbnail and can
 * never be her current face, and `lib/nina/queries/avatarsearch.ts`'s `rankMedia` fills each of
 * those with `MediaExplorerPhoto`'s own documented constant (`''`, three NULLs, `null`, `false`)
 * rather than leaving the convention to be re-invented here. So this stays the field-for-field
 * narrowing it has always been, plus `origin` and the two keyword columns.
 *
 * `filename: row.filename ?? row.id` is unchanged and now does double duty: a media row carries
 * `null` (that table has no filename column) and therefore prints its id, which is a truthful
 * name. The Media view's nicer date-and-id form is built in `app/admin/nina/page.tsx` and is the
 * UI phase's to reuse here if it wants it.
 */
function toHit(row: NinaPhotoSearchRow): AdminSearchHit {
  return {
    origin: row.origin,
    id: row.id,
    url: row.blobUrl,
    thumbUrl: row.thumbUrl,
    folder: row.folder,
    filename: row.filename ?? row.id,
    width: row.width,
    height: row.height,
    bytes: row.bytes,
    source: row.source,
    isCurrent: row.isCurrent,
    description: row.description,
    searchKeywords: row.searchKeywords,
    negativeSearchKeywords: row.negativeSearchKeywords,
    crop: { scale: row.cropScale, x: row.cropX, y: row.cropY },
    createdAt: row.createdAt.toISOString(),
    score: row.score,
  }
}
```

**Code — the action's docstring `:131` first line:**

```
 * **Search the whole collection — album AND media.** `{ text?, imageDataUri? }` in, a ranked
 * top-48 out, every physical photograph at most once.
```

The action body at `:143-212` is otherwise unchanged (`page.rows.map(toHit)` still compiles).

---

### Step 14: Tests

Follow the two postures this suite already uses, picking per file exactly as the existing sibling
does: **query-layer tests run the REAL statements against the recording driver**
(`installFakeDb`/`projectedRow`, `tests/nina.avatarSearch.test.ts`'s stance — assert generated SQL,
not spies); **action tests mock only the edges** (`requireAdmin`, `next/server`'s `after`,
`next/cache`'s `revalidatePath`, `@vercel/blob`, `fetch`, the vision and embedding clients) and let
the queries run for real (`tests/admin.chatPhotoAdoption.test.ts`'s stance).

**14a. `tests/nina.avatarSearch.test.ts` (modify).** Rename all 18 `queries.searchNinaAvatarsBy*`
call sites. Every existing assertion about the ALBUM arm survives, at a new index: each search now
runs FOUR statements in one `Promise.all`, so `fake.queries` has length 4 and the album page/count
are no longer at `[0]`/`[1]` deterministically. **Assert by content, not by index** — add a helper
that finds the statement containing `"nina_avatars"` and `<=>` rather than reading `sqlAt(0)`. Add:
- the album arm carries `"source_image_id" is null` (the documented insurance predicate);
- `fake.queries` has length 4 and two of them are `count(*)`;
- an oversized `limit` still binds 48 **in both arms**.

**14b. `tests/nina.mediaSearch.test.ts` (new).** The media arm and the merge:
- the media page and count both carry `"nina_message_images"."user_id" = $`,
  `"description_embedding" is not null`, `source_avatar_id" is null`, `source_image_id" is null` and
  `not exists`;
- the `NOT EXISTS` subquery contains `'chat-photo:'` **and** `"source_image_id" is null` — the
  qualifier, pinned, because without it a promoted photograph silently leaves the search (a comment
  saying so belongs on the assertion);
- the media ORDER BY is `<=> asc` then `"nina_message_images"."created_at" desc`;
- `total` is the SUM: enqueue counts 7 and 5, expect `page.total === 12`;
- the merge orders by score across origins: enqueue an album row at 0.5 and media rows at 0.9 and
  0.3, expect `['media', 'album', 'media']` in `rows.map(r => r.origin)`;
- an exact score tie is broken by `createdAt desc` then `id desc`, and NOT by origin — enqueue one
  album and one media row at identical score and identical `created_at`, and pin which id wins;
- the floor cuts a 0.19 media row exactly as it cuts a 0.19 album row;
- a media row's `negative_search_keywords` excludes it from a typed query, and is ignored on the
  image-only arm;
- the merged page is clamped to 48 **after** the merge: enqueue 48 album + 48 media rows all above
  the floor and expect 48 back with both origins present.

**14c. `tests/nina.mediaEmbeddings.test.ts` (new).** `queries/imageEmbeddings.ts` and
`queries/avatarPointer.ts` against generated SQL:
- all six statements carry `user_id` and all six carry `source_avatar_id" is null` /
  `source_image_id" is null` (the `isOriginalPhoto()` arm) — `tests/nina.photoRefs.test.ts`'s
  posture, as a presence this time;
- the two `…AndEmbedding` writers each `set` exactly two columns, and neither `set`s the other's —
  the structural-omission claim, as a test;
- `setNinaMessageImageNegativeSearchKeywords` never mentions `description_embedding`;
- `listNinaMessageImageDescribeTargets([])` runs zero statements;
- `resolveNinaAvatarLinkedText` runs zero statements when no row is a pointer, binds a
  de-duplicated `IN` list, and keys its `Map` by the AVATAR id.

**14d. `tests/admin.mediaDescribeEmbed.test.ts` (new).** `ninaMediaDeferredDescribe.ts`, mirroring
`tests/admin.albumDescribeEmbed.test.ts`:
- the subject follows `kind` — a `'generated'` target gets the self witness, an `'upload'` target
  gets the runner witness (the one real difference from the album worker);
- `fillOne` on a described + embedded row makes zero vendor calls (`alreadyDone`);
- `describe: false` on a NULL-description row writes nothing and calls nothing;
- a thrown embed answers `null` and the prose is still written;
- the deadline stops rows STARTING and `ranOutOfTime` counts them truthfully;
- `embedNinaMessageImageDescription` embeds `buildNinaAvatarEmbedText(description, keywords)` —
  assert the exact string, because this is the "one text, two corpora" invariant the merged ranking
  rests on.

**14e. `tests/admin.mediaKeywords.test.ts` (new).** The two new actions plus the two describe
writers' new scheduling:
- `requireAdmin` first (a rejected `requireAdmin` runs no statement);
- an over-long paste is refused with the 500-character sentence and writes nothing;
- an empty box clears to NULL and returns the `note`;
- a reference row is refused with the "re-shows a photo that lives elsewhere" sentence, before any
  write;
- the search-keyword action nulls `description_embedding` in the same statement and schedules
  `scheduleMediaEmbed`; the negative one does neither;
- a row with a NULL description schedules nothing;
- `editChatPhotoDescriptionAction` now nulls the vector and schedules an embed for non-empty prose,
  and schedules nothing for a clear;
- `describeChatPhotoAction` writes prose and vector in one statement and never touches
  `search_keywords`.

**14f. `tests/admin.chatPhotoAdoption.test.ts` (modify).** The file's header and five of its
properties invert. Rewrite the header to state the NEW decision (quoting R3) and assert:
- **no `fetch` and no `put` at all** — `expect(put).not.toHaveBeenCalled()` and
  `expect(fetchMock).not.toHaveBeenCalled()`, which is the whole of R3's storage claim;
- the inserted row binds the MEDIA row's `blob_url` and `pathname` verbatim;
- the inserted row binds `source_image_id = <the image id>`;
- the inserted row does **not** bind the source description (the old
  `description: row.description` assertion becomes its negation);
- `source_key` is still `chat-photo:<imageId>` and re-adoption still costs one lookup and no
  insert;
- the crop clamp and `setCurrentNinaAvatar` are unchanged;
- the scheduled describe is the **MEDIA** one, for the **IMAGE** id, not the album one for the
  avatar id.
Plus: `avatarRow()` at `:117` gains a 21st positional value, appended after the `createdAt` literal:

```ts
    '2026-09-01 09:00:00+00',
    pick(overrides, 'sourceImageId', null),
  )
```

and its docstring's `— 20 values` becomes `— 21 values`.

**`pick()` is correct HERE and nowhere else in this step list** — verified against the tree,
2026-09-17: `function pick` is defined in `tests/admin.chatPhotoAdoption.test.ts` and in **no other
fixture file in this phase**. Steps 14h and 14i touch files that spell the same idea as
`'x' in overrides ? overrides.x : <default>`; use each file's own spelling and do not import or
re-declare `pick` across files.

**14g. `tests/admin.albumAvatarDelete.test.ts` (modify).** Add a pointer case: a row whose
`getNinaAvatar` read returns `sourceImageId` non-null still runs the dependent promotion and still
runs the row DELETE, and runs **no** `isBlobPathnameReferenced` statement and **no** `del`. Assert
by counting statements, which is what makes "it never owned bytes" visible in execution order.

**14h. `tests/admin.albumDescribeEmbed.test.ts` (modify).** `avatarRow()` at `:65` gains the 21st
value — **this file has no `pick()` helper**, so append
`'sourceImageId' in overrides ? overrides.sourceImageId : null,` after the `createdAt` literal and
change the helper's `— 20 values` docstring to `— 21 values`. Add four pointer cases, one per
action: the write lands on `nina_message_images` (the statement mentions that table, not
`nina_avatars`) and the scheduled worker is the media one.

**14i. `tests/admin.albumAvatarActions.test.ts` (modify).** `avatarRow()` at `:76` gains the 21st
value, same `'x' in overrides` idiom as 14h (no `pick()` here either) and same docstring bump. No
behavioural change otherwise.

**14j. `tests/admin.albumSearch.test.ts` (modify).** Rename the three `vi.fn()` mocks and the
`vi.mock` factory keys to `searchNinaPhotos*`. Add `origin: 'album'` and the two keyword fields to
the `ROW` fixture and assert `toHit` carries `origin` through; add a `'media'` row to the mocked
page and assert its hit has `folder: ''`, `isCurrent: false`, `thumbUrl: null`, identity crop and
`filename === row.id`.

**14k. `lib/nina/queries.test.ts:44` (modify).** `BARREL_VALUE_EXPORTS` 96 → 104: remove the three
`searchNinaAvatarsBy*` names, add `searchNinaPhotosByImageCaption`, `searchNinaPhotosByText`,
`searchNinaPhotosByTextAndCaption`, `countNinaAvatarsLinkedToImage`,
`countNinaMessageImageDescribeBacklog`, `listNinaMessageImageDescribeBacklog`,
`listNinaMessageImageDescribeTargets`, `resolveNinaAvatarLinkedText`,
`setNinaMessageImageDescriptionAndEmbedding`, `setNinaMessageImageNegativeSearchKeywords`,
`setNinaMessageImageSearchKeywordsAndEmbedding` — sorted, each with the one-line documented-growth
comment the list's header demands, pointing at this set's plan index.

**14l. `tests/admin.chatPhotos.test.ts` (modify) — ONE LINE, AND THIS PHASE IS RED WITHOUT IT.**

*Added by the reconciler (2026-09-17). Phase 4's planner found it; it is fixed HERE because Phase 2
is the phase that must not land broken, and invariant 1 requires `vitest` green at the end of every
phase.*

That file mocks `@/lib/nina/queries` **wholesale**, with an explicit-key factory (`:420`) that
enumerates every name it forwards — **verified against the tree, 2026-09-17**. A `vi.mock` factory
REPLACES the module, so a name the factory omits is `undefined` for every importer in the graph.
Step 7 of this phase adds `countNinaAvatarsLinkedToImage` to `chatPhotoActions.ts`'s import block
from that exact module and calls it inside `removeChatPhotoAction`. Result without this edit:
`TypeError: countNinaAvatarsLinkedToImage is not a function` in all **eleven** existing
`removeChatPhotoAction` cases.

Two edits, both mechanical. First, a handle beside the other `vi.fn()` declarations (the block at
`:386-410`):

```ts
const countNinaAvatarsLinkedToImage = vi.fn()
```

Second, a forwarding entry as the factory's FIRST key, keeping its alphabetical order:

```ts
vi.mock('@/lib/nina/queries', () => ({
  countNinaAvatarsLinkedToImage: (...args: unknown[]) => countNinaAvatarsLinkedToImage(...args),
  deleteNinaMessage: vi.fn(),
  …
```

and, in the `removeChatPhotoAction` section's own `beforeEach` (`:1390-1401`), one default — `0` is
"no album entry points at this photograph", which is what every pre-existing case there assumes:

```ts
  countNinaAvatarsLinkedToImage.mockResolvedValue(0)
```

**Behavioural cases for the new refusal are NOT written here — they are Phase 4's Step 4c**, which
owns this file's new coverage and quotes it as it looks after this edit. This step is the minimum
that keeps Phase 2's own tree green, and nothing more. If Phase 4 finds the three lines already
present, that is the intended outcome: it keeps one copy and adds only its four cases.

---

## Verification

**Build:** `npx tsc --noEmit` (vitest does not typecheck — run this before believing anything)
**Tests:**
```
npx vitest run tests/nina.avatarSearch.test.ts tests/nina.mediaSearch.test.ts \
  tests/nina.mediaEmbeddings.test.ts tests/admin.mediaDescribeEmbed.test.ts \
  tests/admin.mediaKeywords.test.ts tests/admin.chatPhotoAdoption.test.ts \
  tests/admin.chatPhotos.test.ts \
  tests/admin.albumAvatarDelete.test.ts tests/admin.albumDescribeEmbed.test.ts \
  tests/admin.albumAvatarActions.test.ts tests/admin.albumSearch.test.ts \
  tests/admin.albumActionsBarrel.test.ts lib/nina/queries.test.ts
```
then the full suite: `npx vitest run`. A red that is not in the list above is checked against clean
`HEAD` before it is believed (`--no-file-parallelism` for a flake verdict).

**Manual check:** none required of this phase — no surface renders any of it until Phase 3. If a
dev server is wanted anyway, `/admin/nina`'s existing search bar must keep returning album results
unchanged for a corpus where no Media row has an embedding yet, which is exactly the state before
Phase 4's backfill.

**Exit criteria:**
1. `npx tsc --noEmit` and `npx vitest run` are green.
2. `searchNinaPhotosByText` against a fixture corpus returns rows from both origins in one
   score-ordered list, clamped to 48, with `total` the sum of the two candidate counts.
3. `setChatPhotoAsAvatarAction` performs zero `fetch` calls and zero `put` calls, and writes a row
   whose `blob_url` and `pathname` equal the Media row's and whose `description` is NULL.
4. `deleteNinaAvatarAction` on a pointer runs no blob release; `removeChatPhotoAction` on a linked
   Media row returns `{ ok: false }` with a sentence naming the album, and runs no DELETE.
5. `lib/nina/queries.test.ts`'s frozen barrel is 104 names and matches.
6. `tests/admin.chatPhotos.test.ts` passes **in full**, including its eleven pre-existing
   `removeChatPhotoAction` cases — i.e. Step 14l's factory line landed.
7. `listNinaMediaPhotos`' rows carry `searchKeywords` and `negativeSearchKeywords` (Step 1's
   `imageColumns` widening), which is what Phase 3's media arm maps.

---

## Handoffs

**To Phase 3 (UI) — contracts to consume, and the four things it must do:**
1. `AdminSearchHit` now carries `origin: 'album' | 'media'`, `searchKeywords` and
   `negativeSearchKeywords`. `SearchResultsGrid` must branch its deep link on `origin` —
   `hrefForAvatar` is album-only and a media hit needs the Media view's own link.
2. `MediaExplorerPhoto` should gain `searchKeywords`/`negativeSearchKeywords` and
   `app/admin/nina/page.tsx`'s media arm should map them — **`imageColumns` carries both after
   Step 1, so `listNinaMediaPhotos`' rows have them and no second query is needed.** `MediaPane`
   then mounts `PhotoDescription`'s `onSaveKeywords`/`onSaveNegativeKeywords` against
   **`editNinaMessageImageSearchKeywordsAction` / `editNinaMessageImageNegativeSearchKeywordsAction`,
   imported from `@/lib/admin/chatPhotoKeywordActions`** — a NEW module, not `chatPhotoActions.ts`,
   and the names are `…NinaMessageImage…`, not `…ChatPhoto…`. Both take
   `{ id, searchKeywords }` / `{ id, negativeSearchKeywords }` and return `ChatPhotoActionResult`
   (`{ ok, error?, id?, note? }`).
3. **`app/admin/nina/page.tsx`'s album arm must call `resolveNinaAvatarLinkedText(userId, rows)`
   once and apply `linked.get(row.id) ?? row` when building each `AlbumExplorerPhoto`'s
   `description`/`searchKeywords`/`negativeSearchKeywords`.** Without it a pointer row shows three
   empty boxes and R3's synchronisation is invisible even though it is correct underneath.
   `NinaAvatarRow` also gains `sourceImageId`, so the pane can say "this is a linked photo" — the
   plan index's Phase 3 scope calls that "pointer-row messaging".

   **The redirection is NOT inside `listNinaAvatarsInFolder`, and that is deliberate** (reconciler
   note, 2026-09-17): that read is the file-manager projection and stays one indexed statement over
   `avatarColumns`. `resolveNinaAvatarLinkedText` is the second, batched statement the PAGE issues,
   which is why it takes the rows it already has. Phase 3 must call it explicitly; assuming the
   redirect arrives for free would ship a pointer row with three empty boxes under a pane that says
   its values live in Media.
4. `AlbumExplorerPhoto` is unchanged structurally; the extra `sourceImageId` on `NinaAvatarRow` is
   invisible to a narrowing map, so nothing breaks by omission — only the redirect in item 3 is
   load-bearing.
5. `AdminSearchHit`'s two new keyword fields are **required, not optional**, so every
   `AdminSearchHit` literal in a Phase-3 test fixture must carry `searchKeywords` and
   `negativeSearchKeywords` as well as `origin`, or `tsc --noEmit` fails at the fixture.

**To Phase 4 (backfill):** call `listNinaMessageImageDescribeBacklog(userId, NINA_MEDIA_BACKFILL_SLICE)`
→ `fillNinaMessageImageDescribeTargets(userId, targets, NINA_MEDIA_BACKFILL_BUDGET_MS)` for the POST,
and `countNinaMessageImageDescribeBacklog(userId)` for the GET — the exact shapes
`/api/admin/nina/backfill-descriptions/route.ts` already uses for the album. All four are exported.

**Found and deliberately left:**
- **The 18 legacy `chat-photo:` album copies.** Out of scope per the plan index. This phase hides
  their Media originals from search (`mediaSearchScope`'s `NOT EXISTS`) so they are not duplicates,
  but they remain byte-duplicated in the store with independent descriptions. A one-off migration
  that converts them to pointers and releases the duplicate objects is its own card.
- **`replaceChatPhotoAction` gains no pointer guard.** Replacing a Media row's bytes silently
  changes the photograph an album pointer shows — arguably correct for a link, but a surprise. A
  note in the Media pane ("an album entry shows this photo") is a Phase 3 nicety, not this phase's
  refusal.
- **`ensureNinaAvatarDescriptionAction`'s fast path does not see through a link**, so a pointer
  always takes the slow path (one extra indexed read on a share-to-Nina click). Fixing it means
  giving it the linked read; left because it costs a read, not a correction.
- **`buildNinaAvatarEmbedText` is not renamed** despite now serving both corpora. The rename is a
  wide no-behaviour diff across three runtimes (`lib/`, `scripts/`, `research/`) and the
  `NINA_AVATAR_KEYWORDS_PREFIX` constant a test pins. Its own header's argument for a single
  spelling is now stronger, not weaker.
- **`setNinaMessageImageDescription` keeps its one remaining caller** (`scheduleChatPhotoCaption`'s
  HALF ONE), which writes prose without a vector. Giving the caption pass an embed is a behaviour
  change to the runner-facing send path and belongs in its own card; until then those rows land in
  `listNinaMessageImageDescribeBacklog` and Phase 4's sweep embeds them.
- **`package_readme.md` / `todos.md` updates** for `lib/nina` and `lib/admin` — the readme-updater's
  job at landing, not a plan step. Note that `lib/nina/.workflows/package_readme.md:888,1063` names
  the three renamed functions.

---

## Rollback

Every change is additive at the schema level (Phase 1 owns the columns; this phase only reads and
writes them) and reversible at the code level in one commit:

- `git revert` this phase's commit(s). The tree returns to album-only search, byte-copy promotion,
  and Media rows with no keywords — all states the app supported before.
- **The one thing a revert does not undo is data**, and it is harmless: any pointer rows created
  while this phase was live keep `source_image_id` set (a column Phase 1 owns and reverting this
  phase does not drop) and keep sharing their Media row's object. Under the reverted code they read
  as ordinary album rows with a NULL description — visibly undescribed, which the "Describe it"
  button fixes — and their delete goes back through `releaseBlobIfUnreferenced`, which correctly
  answers `'shared'` and keeps the object because the Media row still names it. No orphan, no 404.
  Any Media embeddings written stay and are simply unread.
- If only the merged search needs reverting without the rest, the three `searchNinaPhotos*`
  functions can be pointed back at `rankAlbum` alone (delete `rankMedia` from `rankMerged`'s
  `Promise.all` and sum nothing) — one function, five lines, no other module changes.
