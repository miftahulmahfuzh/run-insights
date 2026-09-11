# Code Analysis: Merge Chat photos into the album as a Media folder; revamp as "Image collection"

**Type:** Feature Update (+ Refactoring — one admin surface is purged)
**Date:** 2026-09-10 15:46 WIB
**Session ID:** 20260910-154651-53D2
**Plan:** `IMAGE_COLLECTION_PLAN.md` (4 phase(s))
**Worktree:** `/home/miftah/.worktrees/run-insights/image-collection` — branch `feature/image-collection` (base `origin/main` @ `f429986`; local main equals origin/main and the checkout is clean)

---

## User Input

### Original User Request

> 1. setelah berfikir lama, saya memutuskan untuk menggabungkan Chat photos ke Nina's album. karena foto foto pada Chat photos dan Nina's album sama sama memiliki fitur yang hampir sama. saat ini foto foto di Chat photos bisa diset jadi foto profil juga. dan saya ingin fitur untuk replace satu item foto juga bisa diimplementasikan di Nina's album.
>
> currently, sedikit bedanya adalah di Chat photos , kita bisa lihat prompt image generation nya. nanti tolong anda handle saja resolution nya gimana. i trust your expertise.
>
> ide saya adalah, we purge Chat photos tab, dan di folder list di Nina's album kita bikin aja satu folder Media , posisinya dibawah folder Album. kalo admin klik folder ini, maka akan kelihatan semua foto - foto yang saat ini ada di Media (kaya di section Media di page /nina/about)  jadi sekarang bahkan image yang diupload user secara manual di chat session bisa direplace dan di jadiin profpic nina juga.
>
> sekalian juga, kan sekarang foto di Chat photos itu bisa direplace user, nah, kalo user udah replace satu photo, tolong nanti pas refactor hapus tombol untuk ngeliat promptnya (karena generated image dari prompt ini udah direplace user)
>
> last but not least, tolong seragamkan tombol "describe" yang ada di Chat photos sekarang. admin kan bisa liat hasil describe nya. tolong di halaman Image collection nanti semua foto punya UI/UX seragam yang bisa accomodate fitur describe ini. dan tolong make sure, ketika user attach foto yang sudah didescribe ke chat session, maka describe result nya juga di attach sebagai context nina biar balasan chat nina lebih akurat
>
> 2. selain itu, tolong revamp halaman Nina's album, ganti namanya jadi Image collection . dan buat tampilan foto foto nya ini lebih clean. buat supaya foto-fotonya ini borderless kaya di Photo reference di Image generation page.

### User-Provided Context

- "Chat photos" = the `/admin/photos` page (nav label "Chat photos", dashboard card of the same name).
- "Nina's album" = the `/admin/nina` page (the FileExplorer file-manager over `nina_avatars`).
- "Media" = the photo grid section on `/nina/about` (`galleryPhotos` over `listNinaMessageImages`) — both parties' photographs, newest first.
- "Photo reference" = the borderless picker grid on `/admin/image-generation` (`PhotoReferencePicker`).
- The prompt-visibility difference ("kita bisa lihat prompt image generation nya") is delegated: *"nanti tolong anda handle saja resolution nya gimana. i trust your expertise."*
- The describe-button unification and its chat-context consequence are explicit requirements, not suggestions.

### User-Provided Files

None.

### Requirement IDs

| ID | What the user asked for |
|---|---|
| R1 | Merge Chat photos into the album: purge the Chat photos tab; add one **Media** folder to the album's folder list, positioned below the "Album" folder; clicking it shows every photo the `/nina/about` Media section shows — so even images the user uploaded manually in a chat session become replaceable and can be set as Nina's profile picture. The generation-prompt difference is resolved at the planner's discretion. |
| R2 | After the refactor, a replaced photo must no longer offer the view-prompt affordance — the generated image the prompt produced has been replaced. |
| R3 | Make the "describe" affordance uniform: on the Image collection page every photo gets the same UI/UX that can accommodate describe (admin can read the describe result). And make sure that when a photo that has already been described is attached to a chat session, its describe result is attached as context for Nina, so her replies are more accurate. |
| R4 | Revamp the album page: rename it "Image collection", render the photos cleaner — borderless, like Photo reference on the Image generation page. |

---

## Detailed Requirements Understanding

**Problem/Requirement Statement**: The admin app currently maintains two parallel photo surfaces over two tables that converged feature-wise: `/admin/photos` ("Chat photos", a flat paginated grid over `nina_message_images.kind='generated'` with replace/add/remove/describe-edit/adopt-as-profpic/prompt-view) and `/admin/nina` ("Nina's album", a folder-tree FileExplorer over `nina_avatars` with upload/move/crop/set-current/describe/share/remove). The user wants ONE surface: the file manager, renamed **Image collection**, gains a virtual **Media** folder (sibling under the "Album" root) whose content is the conversation's photographs — every original row of `nina_message_images`, HIS uploads included — with the Chat-photos verbs (replace, add, remove, adopt-as-profpic, describe) lifted to work on both kinds. The `/admin/photos` route, nav entry, dashboard card and their exclusive components are deleted. The prompt view survives only for rows that still carry their generation sidecar. Describe becomes one uniform control for every photo in the page, and the described text must actually reach Nina when the photo is attached to a chat.

**Success Criteria**:
1. `/admin/photos` no longer exists (route, nav entry, dashboard card, exclusive components); nothing regressed that the page offered.
2. On `/admin/nina` the folder tree shows a "Media" entry below "Album"; selecting it lists every original `nina_message_images` row (both kinds), paginated, newest first — the same set the `/nina/about` Media section shows (originals-only per `isOriginalPhoto()`).
3. In the Media folder the operator can: add (carrier-message upload with dedupe pre-check), replace (both kinds), remove (carrier-aware), adopt as profile picture (both kinds, with crop draft), describe, download.
4. A replaced photo shows no prompt affordance; a never-replaced generated photo still does.
5. One describe UI/UX serves album rows and media rows alike: read the stored prose, edit it by hand, re-describe with the vision model (subject follows whose photo it is).
6. Attaching a described photo to a chat carries its description into Nina's context — for the attaching turn AND for subsequent turns in that conversation (the window gap closes).
7. The page is named "Image collection" everywhere it was "Nina's album", and the photo grid is borderless in the Photo-reference idiom.

**Key Considerations**:
- **No migrations.** Nothing in this plan needs a schema change: the Media folder is a view over the existing table; replaced rows already lose `prompt` via `updateNinaChatPhotoBlob`; adoption and dedupe flows exist. Invariant: `drizzle` schema untouched.
- **The two tables' delete rules differ.** `nina_avatars` deletes call `del` with no reference check; `nina_message_images` deletes go through `releaseBlobIfUnreferenced`. Adoption copies bytes (never shares) — keep that; lifting its `kind` guard does not change the copy semantics.
- **References are not members.** Rows with `source_avatar_id`/`source_image_id` set are re-shows; the three collection reads skip them (`isOriginalPhoto()`) and the per-row actions refuse them with a sentence. The Media folder keeps both properties.
- **Thumbnails.** `nina_avatars` has `thumb_url`; `nina_message_images` does not — media tiles load originals (the accepted cost behind `NINA_CHAT_PHOTO_PAGE_SIZE = 48`; `next/image` is ruled out repo-wide for Blob photos). The borderless restyle must not change the source of a tile's bytes.
- **Runner-facing invariants hold:** invariant 5 (descriptions never cross to a runner surface; `glm-5.3` is never sent an image part — `userTurnText`'s text block is the only image path), `chatViewerPhotos`/`galleryPhotos` unchanged, `photoSideOf` remains the his/hers discriminator.
- **Admin copy is English** (`components/admin/AlbumManager.tsx:233` convention); runner copy is Indonesian. "Image collection" must not collide with the existing "Images" nav short label (image generation, `AdminNavLinks.tsx:94-99`).
- **Tests are structural here.** No DOM harness exists for the explorer; `tests/admin.shell.test.ts` pins the exact nav href array; `tests/admin.photoReference.test.ts` pins the borderless class recipe (scoped to `PhotoReferencePicker.tsx`, so restyling `explorer/PhotoGrid.tsx` is free to mirror it). New pure logic (tree Media node, media view model) goes in `lib/` and gets unit tests per invariant 6.

---

## Analysis Scope

### Explicitly Mentioned Files

- `/admin/photos` → `app/admin/photos/page.tsx` (purged)
- "Nina's album" → `app/admin/nina/page.tsx` (renamed, extended)
- "Media" section → `components/nina/NinaAboutScreen.tsx` + `lib/nina/album.ts` (`galleryPhotos`) — reference for the Media folder's membership
- "Photo reference" → `components/admin/PhotoReferencePicker.tsx` — the borderless style target

### Discovered Related Files

- `components/admin/FileExplorer.tsx` + `components/admin/explorer/{model,PhotoGrid,SelectionPane,FolderTree,thumbnail,useFolderUpload,dropWalk}.ts(x)` — the file manager
- `components/admin/{ChatPhotoGrid,ChatPhotoDetail,ChatPhotoControls,ChatPhotoAdd,ChatPhotoDescription,ChatPhotoProfilePicture,chatPhotoModel,chatPhotoUpload,PhotoMoveBar,FolderMenu}.tsx/ts` — the Chat-photos UI family (purged or migrated)
- `lib/admin/{chatPhotoActions,chatPhotoSchema,chatPhotos,ninaAlbumActions,avatars,filetree,folderOps}.ts` — write half + pure planners
- `lib/nina/{queries,album,chatphotos,attach,actions,vision,turn,context,gateway,caption,imagefail,imagerecipe,images,dedupe}.ts` — reads, runner invariants, describe, context assembly
- `app/api/admin/nina/upload/route.ts` — Blob token mint (three pathname shapes)
- `components/admin/AdminNavLinks.tsx`, `components/admin/AdminNav.tsx`, `app/admin/page.tsx` — nav + dashboard
- Tests: `tests/admin.{chatPhotos,chatPhotosRail,chatPhotoAdoption,chatPhotoDedupe,photoReference,shell,filetree,folderOps}.test.ts`, `tests/nina.{chatPhotoAdoption,chatPhotoDescription,photoOrphans,photoRefs,attach,resend}.test.ts`, `lib/nina/{album,vision,chatphotos}.test.ts`

---

## Current Dataflow

### Entry Point A: `/admin/photos` — "Chat photos" (TO BE PURGED)

**Location:** `app/admin/photos/page.tsx:62` (`AdminChatPhotosPage`, `force-dynamic`)
**Trigger:** GET `/admin/photos?page=N`; nav entry `AdminNavLinks.tsx:107`, dashboard card `app/admin/page.tsx:117-132`
**Gate:** `requireAdmin()` first statement (`:63`); `proxy.ts` does not match `/admin`
**Read:** `listNinaChatPhotos(userId, {limit: 48, offset})` — `lib/nina/queries.ts:1970`, WHERE = `generatedChatPhotoScope` (`:1940`: `user_id`, `kind='generated'`, `isOriginalPhoto()`), ordered `(created_at desc, id desc)`; `countNinaChatPhotos` (`:2004`) for the pager
**Mapping:** rows → `ChatPhoto[]` on the server (`:81-95`: ISO dates, `photoSideOf` computed) → `ChatPhotoGrid` (client grid + rail host)

**Rail verbs** (`components/admin/ChatPhotoDetail.tsx:158-249`, one icon row + expanded blocks):
| Control | Component | Action | Guard |
|---|---|---|---|
| Eye — "what she can see in it" (edit) | `ChatPhotoDescription.tsx:52` | `editChatPhotoDescriptionAction` (`lib/admin/chatPhotoActions.ts:536`) | refuses `kind !== 'generated'`; `updateNinaChatPhotoDescription` re-checks `kind='generated'` in WHERE (`lib/nina/queries.ts:2286`) |
| Brush — "what she was asked to draw" (view prompt) | inline in `ChatPhotoDetail.tsx:170-179,239-243` | none (read-only) | dims on `prompt == null` but ALWAYS renders — **the R2 defect** |
| Person-frame — set as profile picture | `ChatPhotoProfilePicture.tsx:44` (CropStudio draft + two CircleFrames) | `setChatPhotoAsAvatarAction` (`lib/admin/ninaAlbumActions.ts:208`) | refuses `kind !== 'generated'` (`:217`) and references (`:220`); copies bytes into `avatar-` object, `source_key='chat-photo:<id>'`, idempotent re-adoption |
| Download | `ChatPhotoDetail.tsx:202-214` | `useSavePhoto(photo.url,'nina')` | — |
| Replace / Remove | `ChatPhotoControls.tsx` | `replaceChatPhotoAction` (`chatPhotoActions.ts:139`), `removeChatPhotoAction` (`:453`) | Replace refuses non-generated (`:152`) and references (`:155`); nulls `description` **and `prompt`** in `updateNinaChatPhotoBlob` (`lib/nina/queries.ts:2068-2082`), re-captions via `scheduleChatPhotoCaption`; Remove deletes carrier message when last image on a photo-only Nina bubble (`isNinaPhotoCarrierMessage`, `lib/admin/chatPhotos.ts:310`), else the row; releases blob only if unreferenced |
| Add (toolbar, `ChatPhotoGrid`) | `ChatPhotoAdd.tsx` + `chatPhotoUpload.ts` (browser JPEG encode, dedupe pre-check `findChatPhotoDuplicateAction` `:390`, PUT via `/api/admin/nina/upload` token) | `addChatPhotoAction` (`:253`) | mints carrier message (`photoOnly`), `kind='generated'`, `prompt: null`; writes reference row on dedupe hit via `planChatPhotoAddWrite` (`lib/admin/chatPhotos.ts:415`) |

**Describe-after-write:** `scheduleChatPhotoCaption` (`chatPhotoActions.ts:691-779`, `after()`) — HALF ONE describes with `describeNinaImages(..., {subject:'self'})` when `description == null` (skips otherwise); HALF TWO captions the carrier bubble via `captionNinaPhoto` + `updateNinaMessage` (refuses non-Nina messages, refuses orphans).

### Entry Point B: `/admin/nina` — "Nina's album" (TO BE RENAMED "Image collection" + EXTENDED)

**Location:** `app/admin/nina/page.tsx:67` (`AdminNinaPage`, `force-dynamic`)
**Trigger:** GET `/admin/nina?folder=<path>&page=N`; nav `AdminNavLinks.tsx:70`, dashboard card `app/admin/page.tsx:100-115`
**Gate:** `requireAdmin()` (`:68`); `?folder=` through `validateFolderPath` (`:71`, refuses `..` — `lib/admin/filetree.ts:356`)
**Read:** `listNinaAvatarsInFolder` (one folder, `NINA_ADMIN_PAGE_SIZE = 120`) + `listNinaAvatarFolders` (real folders ∪ `nina_folders` declarations) in one `Promise.all` (`:75-81`)
**Mapping:** rows → `ExplorerPhoto[]` (`:92-106`: `thumbUrl`, `folder`, `filename`, `source`, `isCurrent`, `crop`, ISO date) → `FileExplorer` (`:152-163`) with `shareOrigin()` resolved server-side

**FileExplorer composition** (`components/admin/FileExplorer.tsx`):
- URL is the truth for folder/page: `hrefForFolder` (`:422-428`, root = no `?folder=`); selection is `useState` (`:93`, derived `photos.find` `:134`)
- Tree pane `FolderTree` (`:342-349`): `buildTree(folders)` (`lib/admin/filetree.ts:975` — single root node `'Album'`, synthesizes ancestors, keeps zero-count folders, `compareFolded` sort) + `folderAncestors` for auto-expand; `FolderMenu` (rendered by `FolderTree.tsx:298`) offers create/rename/move/delete folder via `lib/admin/ninaAlbumActions.ts:884-1073`
- Content: `PhotoGrid` (`:383-389`) — tiles `rounded-chip border p-1` cards, `aspect-square` frame, `thumbUrl ?? url`, "Hers" ribbon for `isCurrent`, filename label under the tile; pager below
- Toolbar: breadcrumbs, counts, hidden inputs + `useFolderUpload` (drag-drop/picker walk → per-file thumbnail PUT + original PUT → `registerNinaAvatarsAction` batched insert with `ON CONFLICT (user_id, source_key) DO NOTHING`), "Add photos" / "Add a folder"
- `PhotoMoveBar` (`:375-381`): move (`moveNinaAvatarsAction`) / remove (`removeNinaAvatarsAction`) for the selection
- Selection pane `SelectionPane` (mounted `:401-407`, keyed remount per selection): Save framing / Reset framing (`saveNinaAvatarCropAction`), **Set as her profile picture** (`setCurrentNinaAvatarAction` + `scheduleDescribe`), Share link to Nina (`ensureNinaAvatarDescriptionAction` before `window.open`), **Describe it — rendered ONLY when `description == null`** (`SelectionPane.tsx:303-316` → `describeNinaAvatarAction`), Download, Remove. Description is displayed as a null-ness row only ("Cannot talk about this photo yet") — **the stored prose is never rendered here**.

### The describe machine (both surfaces)

`lib/nina/vision.ts:322` `describeNinaImages(refs, {subject})` — glm-4.6v, one image part, `NINA_DESCRIBE_SYSTEM_PROMPT` (runner witness, default) or `NINA_SELF_DESCRIBE_SYSTEM_PROMPT` (photo of Nina); token-floor guard; blob re-fetched to a data URI with content type read back.

| Caller | Writes | Subject | Trigger |
|---|---|---|---|
| `describeNinaImage` — `lib/nina/actions.ts:1994` | signed ticket only | `'runner'` | composer attach pre-pass (`Composer.tsx:439`) |
| `scheduleChatPhotoCaption` — `lib/admin/chatPhotoActions.ts:691` | `nina_message_images.description` (+ bubble caption) | `'self'` | `after()` from Replace/Add |
| `describeNinaAvatarAction` — `lib/admin/ninaAlbumActions.ts:121` | `nina_avatars.description` | **`'runner'` — photos of Nina described with the runner prompt (latent inconsistency)** | manual button |
| `scheduleDescribe` — `lib/admin/ninaAlbumActions.ts:477` | `nina_avatars.description` | `'runner'` | `after()` from set-current / adoption / empty-album promotion |
| `ensureNinaAvatarDescriptionAction` — `:509` | `nina_avatars.description` (only if null) | `'runner'` | Share-to-Nina pre-pass |

Scene prose writers (no vision): `lib/nina/imagerun.ts:402,452` and `scripts/nina-image-worker.ts:1023-1029,1076-1079` — generated rows get `description = scene`, `prompt = sidecar` at insert.

### Attach-to-chat and the model's image context (R3's second half)

- Pure grammar: `lib/nina/attach.ts` (`?photo=avatar:<id>|image:<id>`; `ninaPhotoProvenance`).
- Write path: `sendNinaMessage` STEP 0d — `resolveAttachment` (`lib/nina/actions.ts:233-301`) reads the avatar or message-image row, **copies `description` and `kind`** onto a new reference row (`:852-861`; dedupe keepers too — `lib/nina/dedupe.ts:181-203`); a miss refuses the send. Composer uploads get `kind='upload'` + ticket description; hash-matched tiles inherit the keeper's.
- Context assembly — the ONE image path into the prompt: `userTurnText` (`lib/nina/turn.ts:577-586`) renders `input.imageDescriptions` as a text block ("HE SENT AN IMAGE. This is what is in it — react to the picture, never to this description as a description"). `glm-5.3` never receives an image part (invariant 5, `turn.ts:292-296`, enforced `actions.ts:1246-1249`).
- Producers of `imageDescriptions`: the current send (`actions.ts:958-968` — tickets + resolved attachments, `?? NINA_DESCRIPTION_UNAVAILABLE`) and resend (`:1784`, rebuilt from rows). **Two gaps, measured:**
  1. `lib/nina/gateway.ts:162-164` hardcodes `imageDescriptions: []` for the conversation window — photo messages earlier in the conversation contribute NO image context, under a comment `actions.ts:1535-1540` that wrongly claims `loadNinaContext` covers them (`tests/nina.resend.test.ts:375-385` documents the gap).
  2. No test pins that an ATTACHED described photo's description reaches `imageDescriptions`.
- Media-viewer "Kirim ke chat / ke chat baru" = `attachNinaPhotoToChat` (`lib/nina/albumActions.ts:117-160`) → the same `sendNinaMessage({attachExisting})`.

### Data Persistence

- `nina_message_images` (`lib/db/schema.ts:1056-1198`): `messageId` (nullable, `SET NULL` — orphans are first-class members), `kind` (`'upload'|'generated'`), `blobUrl`/`pathname` (`nina/<uid>/…`), `description`, `prompt` (generation sidecar, generated-only, nulled on replace), `sourceAvatarId`/`sourceImageId` (reference markers, `SET NULL` → an orphaned reference becomes an original again), `contentHash` (nullable dedup key, partial index), `sortOrder`, `createdAt`.
- `nina_avatars` (`schema.ts` §9): `folder` column + `nina_folders` table, `thumbUrl`, `isCurrent` (partial unique), `sourceKey` (unique per user — `'chat-photo:<id>'` for adoptions), `description`, crop columns, `source`.
- Blob objects live under `nina/<userId>/` — `selfie-<id>.jpg` (chat/admin, always JPEG), `avatar-<id>.<ext>` + `thumb-<id>.jpg` (album), `chat-...` (runner uploads, `ninaChatPathname` `lib/nina/images.ts:117`).

### Exit Points

- RSC payloads to the two admin pages; Server Action results (`{ok, error?, id?, note?}`) with `revalidatePath`; Blob PUTs from the browser via token-mint routes (`/api/admin/nina/upload`, `/api/upload`); `after()` describe/caption passes; logs (`[f33]`, `[f34]`, `[f36]`).

---

## Key Data Structures

### `ChatPhoto` — `components/admin/chatPhotoModel.ts:17`
`{id, messageId|null, url, kind, side, pathname, width, height, bytes, description, prompt, sortOrder, createdAt}` — the purged page's view model. Subsumed by an extended `ExplorerPhoto` in the new design; its load-bearing docstrings (pathname never parsed; orphan semantics) move with the fields.

### `ExplorerPhoto` — `components/admin/explorer/model.ts:16`
`{id, url, thumbUrl|null, folder, filename, width, height, bytes, source, isCurrent, description, crop, createdAt}` — album rows only today. The Media merge extends it (media-only fields: kind/side, prompt, messageId; album-only fields nullable on media rows) or carries a discriminated sub-object — the phase plan decides, keeping server-mapped plain serializability.

### `FolderNode` — `lib/admin/filetree.ts:936`
`{path, name, depth, ownCount, totalCount, children}` — `buildTree` output; the tree pane's renderer. The virtual Media node must enter the tree without becoming a storable folder path (no `nina_folders` row, no `folder` column value, invisible to `isFolderAncestorOf`/move/delete).

### `NinaImageRow` / `NinaAvatarRow` — `lib/nina/queries.ts`
Structural sources for both listings; `imageColumns` carries `description` and `prompt` (`:633`).

### `ChatPhotoActionResult` — `lib/admin/chatPhotos.ts:320` / `AdminActionResult` — `lib/admin/ninaAlbumActions.ts:85`
The two action-result shapes the unified pane will both consume.

---

## Dependencies

### Configuration / Environment / External Services
- `LLM_VISION_*` env (glm-4.6v describe), `LLM_API_KEY` shared with glm-5.3 — unchanged.
- Vercel Blob token-mint routes and the pathname predicates in `app/api/admin/nina/upload/route.ts` (chat-photo shape: `nina/<uid>/selfie-<id>.jpg`, JPEG-only, 2 MB) — reused by the migrated Replace/Add flows.
- `scripts/blob-reap.mjs` knows the `nina/` prefix — pathname shapes unchanged, so the reaper is untouched.
- Next 16: `searchParams` is a Promise; `PageProps<'/admin/nina'>` gains the new `view` param — **phase plans must consult `node_modules/next/dist/docs/` before writing route code (AGENTS.md).**

---

## Reference List

Complete list of sites that touch the surfaces being changed (kind: def · call · ui · config · test · doc).

| Symbol / surface | File:line | Kind | Notes |
|---|---|---|---|
| `/admin/photos` route | `app/admin/photos/page.tsx:62` | def | purged (R1) |
| Nav entry "Chat photos" | `components/admin/AdminNavLinks.tsx:107` (+ icon fn `:321`, comments `:74,89-90,251`) | ui | removed (R1) |
| Dashboard card "Chat photos" | `app/admin/page.tsx:117-132` (comment `:58`) | ui | removed (R1) |
| `ChatPhotoGrid` | `components/admin/ChatPhotoGrid.tsx` | ui | purged; pager/upload-toolbar duties migrate |
| `ChatPhotoDetail` | `components/admin/ChatPhotoDetail.tsx:65` | ui | purged; rail composition migrates to SelectionPane |
| `ChatPhotoControls` | `components/admin/ChatPhotoControls.tsx` | ui | Replace/Remove buttons migrate |
| `ChatPhotoAdd` + `chatPhotoUpload` | `components/admin/ChatPhotoAdd.tsx`, `components/admin/chatPhotoUpload.ts` | ui | upload flow migrates into explorer toolbar (Media view) |
| `ChatPhotoDescription` | `components/admin/ChatPhotoDescription.tsx:52` | ui | merges into unified describe panel (R3) |
| `ChatPhotoProfilePicture` | `components/admin/ChatPhotoProfilePicture.tsx:44` | ui | adoption panel migrates into SelectionPane (R1) |
| `chatPhotoModel` | `components/admin/chatPhotoModel.ts` | def | subsumed by extended `ExplorerPhoto` |
| `replaceChatPhotoAction` | `lib/admin/chatPhotoActions.ts:139` | def | kind guard lifted (R1); revalidates `ADMIN_CHAT_PHOTOS_PATH` → `/admin/nina` |
| `addChatPhotoAction` | `lib/admin/chatPhotoActions.ts:253` | def | kept; revalidate path updated |
| `removeChatPhotoAction` | `lib/admin/chatPhotoActions.ts:453` | def | kept; revalidate path updated |
| `editChatPhotoDescriptionAction` | `lib/admin/chatPhotoActions.ts:536` | def | kind guard lifted (R1/R3) |
| `findChatPhotoDuplicateAction` | `lib/admin/chatPhotoActions.ts:390` | def | kept (upload pre-check) |
| `scheduleChatPhotoCaption` | `lib/admin/chatPhotoActions.ts:691` | def | describe subject becomes side-aware (R3) |
| `setChatPhotoAsAvatarAction` | `lib/admin/ninaAlbumActions.ts:208` | def | kind guard lifted (R1) |
| `describeNinaAvatarAction` | `lib/admin/ninaAlbumActions.ts:121` | def | subject → `'self'` (R3 unification) |
| `ensureNinaAvatarDescriptionAction` | `lib/admin/ninaAlbumActions.ts:509` | def | kept (ShareToNinaItem pre-pass) |
| `setCurrentNinaAvatarAction`, `saveNinaAvatarCropAction`, `deleteNinaAvatarAction`, `registerNinaAvatarsAction`, `listNinaAlbumManifestAction`, folder actions | `lib/admin/ninaAlbumActions.ts:154,335,365,610,711,884-1134` | def | unchanged |
| chat-photo predicates/planners | `lib/admin/chatPhotos.ts` (`isAdminChatPhotoPathname:203`, `isNinaPhotoCarrierMessage:310`, `planChatPhotoAddWrite:415`, `ADMIN_CHAT_PHOTOS_PATH:93`) | def | kept; path constant re-homed/updated |
| schemas | `lib/admin/chatPhotoSchema.ts` | def | kept |
| `listNinaChatPhotos` / `countNinaChatPhotos` | `lib/nina/queries.ts:1970,2004` | def | callers gone after purge — retire or generalize into the media read |
| `generatedChatPhotoScope` | `lib/nina/queries.ts:1940` | def | superseded by the all-kinds media scope |
| `updateNinaChatPhotoBlob` | `lib/nina/queries.ts:2068` | def | already nulls `prompt`+`description`; WHERE kind stays (replacement only ever mints selfie-shaped bytes) or widens per plan |
| `updateNinaChatPhotoDescription` | `lib/nina/queries.ts:2286` | def | WHERE `kind='generated'` widened (R1) |
| `listNinaMessageImages` / `isOriginalPhoto` | `lib/nina/queries.ts:1740,1907` | def | membership definition for the Media folder |
| **window image gap** | `lib/nina/gateway.ts:162-164` | def | hardcoded `imageDescriptions: []` — fixed (R3) |
| stale claim about window coverage | `lib/nina/actions.ts:1535-1540` | doc | corrected alongside |
| context assembly | `lib/nina/turn.ts:577-586` (invariant 5 `:292-296`), `lib/nina/actions.ts:958-968,1784` | def | unchanged mechanics; regression-tested (R3) |
| Media section (runner) | `components/nina/NinaAboutScreen.tsx:320`, `lib/nina/album.ts:319` (`galleryPhotos`) | ui/def | reference for membership; unchanged |
| attach grammar/writers | `lib/nina/attach.ts`, `lib/nina/actions.ts:233-301,852-865`, `lib/nina/dedupe.ts:181-203` | def | unchanged |
| FileExplorer | `components/admin/FileExplorer.tsx:71-89` (props), `:422-428` (URL grammar) | def | gains Media view |
| FolderTree / `buildTree` | `components/admin/explorer/FolderTree.tsx:84-85`, `lib/admin/filetree.ts:975` | def | gains the virtual Media node |
| PhotoGrid | `components/admin/explorer/PhotoGrid.tsx:78,88-114` | ui | restyled borderless (R4); media tiles |
| SelectionPane | `components/admin/explorer/SelectionPane.tsx:81-93,244-346` | ui | hosts the unified rail for both row kinds (R1/R3) |
| PhotoReferencePicker | `components/admin/PhotoReferencePicker.tsx:151-189` | ui | style target only — unchanged |
| Nav "Nina's album" | `components/admin/AdminNavLinks.tsx:70`, `app/admin/page.tsx:101`, `app/admin/nina/page.tsx:121` (+ copy `app/admin/personality/page.tsx:77`, `app/admin/photos/page.tsx:104`) | ui | renamed "Image collection" (R4) |
| nav shell test | `tests/admin.shell.test.ts:108-183` | test | href array + icon count updated |
| photo-reference style test | `tests/admin.photoReference.test.ts:205-320` | test | scoped to the picker — must stay green (restyle is in explorer files) |
| chat-photo suites | `tests/admin.chatPhotos.test.ts`, `tests/admin.chatPhotosRail.test.ts`, `tests/admin.chatPhotoAdoption.test.ts`, `tests/admin.chatPhotoDedupe.test.ts`, `tests/nina.chatPhotoAdoption.test.ts`, `tests/nina.chatPhotoDescription.test.ts`, `tests/nina.photoOrphans.test.ts`, `tests/nina.photoRefs.test.ts` | test | rail suite retires; action suites adapt to lifted guards |
| explorer suites | `tests/admin.filetree.test.ts`, `tests/admin.folderOps.test.ts` | test | extended for the Media node/view model |
| vision suite | `lib/nina/vision.test.ts:153-200` | test | extended for subject-by-side |
| resend/window gap | `tests/nina.resend.test.ts:360-400` | test | gap note replaced by the fix's tests |
| comments/docs mentioning the surfaces | `lib/admin/requireAdmin.ts:16`, `lib/pwa.ts:126`, `lib/nina/imageprefs.ts:384`, `lib/nina/queries.ts:943,3956,3980`, `lib/nina/imagerecipe.ts:42-43,276`, `lib/nina/imagetest.ts:24`, `lib/db/schema.ts:1073`, `components/admin/{CharacterPanel,PhotoReferencePicker,ImageGenTestPanel,ChatPhotoProfilePicture}.tsx`, `components/nina/SessionRow.tsx:74` | doc | opportunistic, non-blocking |
| historical plan-set residue | `components/admin/.workflows/*`, `lib/*/.workflows/*`, `docs/plans/2026-09-10-admin-photos-icon-compact-profpic-design.md` | doc | NOT edited — historical records |

---

## Impact Points (files that WILL need changes)

1. `app/admin/photos/page.tsx` — **deleted** (R1) — Phase 2
2. `app/admin/nina/page.tsx` — new `?view=media` arm, media read, renamed header (R1/R4) — Phases 1, 4
3. `components/admin/FileExplorer.tsx` — Media view composition, Media-aware toolbar/pane wiring (R1) — Phases 1, 2
4. `components/admin/explorer/model.ts` — `ExplorerPhoto` extension + media view model (R1) — Phase 1
5. `components/admin/explorer/FolderTree.tsx` + `lib/admin/filetree.ts` — virtual Media node (pure builder + count) (R1) — Phase 1
6. `components/admin/explorer/PhotoGrid.tsx` — media tiles; borderless restyle (R1/R4) — Phases 1, 4
7. `components/admin/explorer/SelectionPane.tsx` — unified rail: describe (always), adopt-with-crop, replace, remove; album branches preserved (R1/R3) — Phases 2, 3
8. `lib/admin/chatPhotoActions.ts` — guards lifted, revalidate paths, subject-by-side (R1/R3) — Phases 2, 3
9. `lib/admin/ninaAlbumActions.ts` — `setChatPhotoAsAvatarAction` guard lifted; `describeNinaAvatarAction` subject (R1/R3) — Phases 2, 3
10. `lib/admin/chatPhotos.ts` + `chatPhotoSchema.ts` — path constant, predicate homes (R1) — Phase 2
11. `lib/nina/queries.ts` — media page/count reads; widen description write; retire generated-only listing (R1) — Phases 1, 2
12. `lib/nina/gateway.ts` (+ stale comment `lib/nina/actions.ts:1535-1540`) — window `imageDescriptions` populated (R3) — Phase 3
13. New unified describe panel component (merging `ChatPhotoDescription` + SelectionPane's button) (R3) — Phase 3
14. `components/admin/AdminNavLinks.tsx`, `app/admin/page.tsx` — entry removed; labels/cards renamed (R1/R4) — Phases 2, 4
15. Migrated client upload flow (from `ChatPhotoAdd`/`chatPhotoUpload`) into the explorer (R1) — Phase 2
16. Tests: `tests/admin.shell.test.ts`, chat-photo suites, explorer suites, `lib/nina/vision.test.ts`, new window-context tests (all R) — Phases 1-4

**This document describes. The plan files prescribe.**
