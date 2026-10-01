# Code Analysis: copy-admin-link button in the client full-view image overlay

**Type:** Feature Implementation
**Date:** 2026-10-01 10:49:38 (WIB)
**Session ID:** 20261001-104938-K7P2
**Plan:** `COPY_ADMIN_MEDIA_LINK_PLAN.md` (4 phases)
**Worktree:** `/home/miftah/.worktrees/run-insights/copy-admin-media-link` — branch `feature/copy-admin-media-link`, base `origin/main` @ `5b51454`

---

## User Input

### Original User Request

> you know, in the admin page, we have this link:
> https://runins.site/admin/nina?view=media , and here admin can click on one image, and do several things on that image, like:
> - crop it for profpic view
> - set it as profpic
> - set it as the anchor for image generation
> - download it
> - Photoshop this image
> - replace this image with a new manually uploaded image
>
> my requirement:
> - oftentimes, i am using full-view image from runins Nina chat (client page, not admin) through my phone , and here sometimes i realize i want to replace this image
> with a newly uploaded image. so, please add an icon only copy-admin-link button in the full-view image, to do these:
> - when user click that button, it will automatically copy an admin-media-view link to clipboard
> - then i can paste this admin-media-view link to Whatsapp, etc.
> - i will open this link on my Desktop
> - this link will directly open https://runins.site/admin/nina?view=media with that image selected.
> - i can directly replace this image using a new uploaded photo
>
> ---
>
> > [!IMPORTANT]
> > our current rules, regulations do not matter, change them if necessary. i just want this requirement to be achieved.
> > any entry point in the client app, where user can open full-view image MUST have this button. so user can open /nina/about - Foto profil , click one image, and it can do the copy-admin-link button as well.

**Follow-up, sent mid-analysis (2026-10-01), verbatim:**

> so the admin gmail is only "mahfuzh74@gmail.com" . please hide this new copy-admin-link button for other gmail users

### User-Provided Context

No error logs. One explicit instruction about precedence: existing rules and conventions may be changed where they stand in the way. One explicit second entry point named by hand: `/nina/about` → "Foto profil". One follow-up constraint: the control is for the admin account alone and must not render for any other signed-in user.

### User-Provided Files

None marked `@`.

### Requirement IDs

| ID | What the user asked for |
|---|---|
| R1 | An **icon-only** copy-admin-link button inside the full-view image overlay. Tapping it puts an admin link to *that* photograph on the clipboard, in a form that can be pasted into WhatsApp and opened later on a desktop. |
| R2 | That link must open `/admin/nina?view=media` **with that image already selected**, so the operator lands on the selection pane and can Replace the photo straight away. |
| R3 | **Every** entry point in the client (non-admin) app that can open a full-view image carries the button — the Nina chat overlay and `/nina/about` → "Foto profil" are named explicitly. |
| R4 | The button is **hidden for every signed-in user who is not the admin**. Only the account on `ADMIN_EMAILS` sees it. |

---

## Detailed Requirements Understanding

**Problem/Requirement Statement.** The admin Image-collection screen (`/admin/nina`) already owns every verb the user listed — crop, set-as-profpic, set-as-anchor, download, Photoshop, Replace — on both of its collections. What it lacks is a way to *arrive at one specific conversation photograph*. The album arm has a deep link (`?avatar=<id>`, resolved server-side into a folder and a page); the **media arm deliberately has none** — `app/admin/nina/page.tsx:131` reads `view === 'media' ? null : readAvatarId(...)`, and `lib/admin/albumDeepLink.ts:60-70` states the reason out loud: *"there is no such read for `nina_message_images`, and adding one is a query-layer change rather than a URL grammar."*

So the feature is two halves that meet at a URL:
1. the client overlay must **mint** an absolute admin link for the photograph on screen and copy it;
2. `/admin/nina` must **honour** that link on the media arm the way it already honours `?avatar=` on the album arm.

**Success Criteria.**
- In the Nina chat full-view overlay, in `/nina/about` → Foto profil, in `/nina/about` → Media, and on `/photo/[kind]/[id]`, an icon-only control sits in the viewer header.
- Tapping it copies an absolute `https://runins.site/admin/nina?...` URL naming that exact photograph, and confirms visibly (the `ShareButton` tick + `role="status"` pattern).
- Pasting that URL on a desktop lands on `/admin/nina` with the photograph **selected** — the selection pane mounted, Replace one click away — whichever page of the Media collection it happens to be on.
- An album photograph (`/nina/about` → Foto profil) lands the same way through the already-shipped `?avatar=` grammar.
- **No non-admin ever sees the control.** A signed-in user whose email is not on `ADMIN_EMAILS` gets the header exactly as it ships today, and their page payload carries no admin origin at all.
- `npm run typecheck`, `npm test`, `npm run lint`, and the seven CI guards stay green.

**Key Considerations.**

- **Two tables, two destinations.** A chat/Media photograph is a `nina_message_images` row and belongs in `?view=media`; a Foto-profil photograph is a `nina_avatars` row and belongs in the album arm, which already resolves `?avatar=<id>` into a folder and a page. One button, one minter, two arms — `PhotoPointerKind` (`lib/photos/pointer.ts:33`) is the existing vocabulary for exactly this distinction (`'shot' | 'avatar' | 'image'`) and is reused rather than re-invented.
- **`ViewerPhoto.id` is already taken.** On both the chat overlay and `/nina/about` → Media it carries the **turn (job) id** for the "Buka detail job foto ini" header link (`components/nina/ChatScreen.tsx:700`, `components/nina/NinaAboutScreen.tsx:753`), not the image row id. A second, separately-named handle is required; overloading `id` would silently point the admin link at `nina_turns`.
- **The media ordering is not `created_at` alone.** `listNinaMediaPhotos` orders by `coalesce(last_replaced_at, created_at) DESC, id DESC` under `mediaCollectionScope` (`lib/nina/queries/images.ts:712-737`, `:682`). A locate query that computes an offset must mirror **both** the predicate and the full sort key, or it will compute the wrong page — and a *replaced* photo is precisely the row whose position moves.
- **A re-shared chat row is not in the Media collection.** `mediaCollectionScope` is `userId AND isOriginalPhoto()`, so a row with `source_image_id` set has no tile in `?view=media` at all. The honest destination for such a photograph is the original it points at.
- **The origin must be absolute and must not be `window.location`.** The link is pasted into WhatsApp and opened on another device. `lib/share/origin.ts` is `server-only` and invariant 9 forbids a `NEXT_PUBLIC_` for it; the repo's shipped answer is to resolve `shareOrigin()` on the server and thread it down as a prop — `app/admin/nina/page.tsx:277` does exactly that for `FileExplorer`, and `SelectionPane`'s prop doc says *"Never `window.location`."* The three client pages involved here are all Server Components and can do the same.
- **`headerAction` already exists and is the right slot.** `PhotoViewer` takes `headerAction?: (photo: ViewerPhoto) => React.ReactNode`, drawn immediately left of the close ✕ (`components/ui/PhotoViewer.tsx:158`, `:294`), and it is handed `photos[index]` so a control acts on the photograph actually on screen. Two of the six callers already use it for the job-detail link, so on those surfaces the slot must return a **cluster** of two controls rather than one.
- **The admin env group is LAZY and it THROWS — measured, and it bounds the design.** `isAdminEmail` (`lib/env.ts:261`) returns `false` early for a null/empty email, but for a real one it calls `adminEnv()` → `load('admin', adminSchema)` (`:241-250`), which `fail()`s with a thrown `Error` when `ADMIN_EMAILS` is missing. The variable is **Production-scope only** in Vercel and is **not present in this repo's `.env.local`**. So a naive `getAdminIdentity()` added to `/nina`, `/nina/about` or `/photo/[kind]/[id]` would throw for every *signed-in* user on every preview deployment and in a plain local run — taking down the chat screen in order to hide a button. The gate therefore has to resolve to "not an admin" when the group is unconfigured, rather than propagate.
- **The admin gate is a server fact, threaded as one prop.** `getAdminIdentity()` (`lib/admin/requireAdmin.ts:52`) already exists for precisely this — its docstring says it is "for the caller that wants to BRANCH rather than refuse". It reads the session email and tests it against `ADMIN_EMAILS` through `isAdminEmail` (`lib/env.ts:261`), which is **the one predicate** for admin-ness in this repo. The address itself must never appear in source: it is env (`lib/env.ts:149` records the reason — "it is a personal address"), and a hardcoded copy would be a second source of truth that silently diverges. Because the button needs *both* an origin and an admin verdict, the two collapse into one nullable prop — a non-admin's client payload then carries no origin at all, which makes the hiding structural rather than a render-time `if` over a value that was shipped anyway.
- **Assumption, stated:** "any entry point in the client app" means any client surface that opens a **Nina photograph**. Run screenshots (`run_photos`) also open in `PhotoViewer` on `/x/[extractionId]` and `/r/[id]`, but `/admin/nina` holds no `run_photos` rows in either collection, so there is no destination to link to. See the plan's `## Decisions`.

---

## Analysis Scope

### Explicitly Mentioned Files

None — the user named URLs and screens, not paths.

### Discovered Related Files

**The shared overlay and its rules**
- `components/ui/PhotoViewer.tsx` — the one full-screen overlay; owns `ViewerPhoto`, `headerAction`, `actions`, `PHOTO_VIEWER_MAX_DOTS`
- `components/ui/PhotoViewer.test.tsx` — component test; holds the "absent `headerAction` renders nothing" half
- `tests/ui.photoViewer.test.ts` — frozen-surface source scan over the overlay and its callers
- `lib/photos/gallery.ts` — `decideSwipe`, `stepIndex`
- `lib/photos/pointer.ts` — `PhotoPointerKind`, `PhotoPointer`, `photoViewerPath`, `parsePhotoViewerSegments`

**Client callers of the overlay (the R3 inventory)**
- `components/nina/ChatScreen.tsx:631` — the chat overlay; `headerAction` occupied by the job link
- `components/nina/usePhotoViewer.ts` — session-wide paging state; exposes `shownPhoto`, `viewerAttachId`
- `lib/nina/chatphotos.ts` — `ChatSessionPhoto.attachId` is the `nina_message_images` row id
- `components/nina/NinaAboutScreen.tsx:730` — album + Media overlay; `albumViewer` / `galleryViewer` mappers at `:366-381`
- `components/photo/PhotoDeepLinkScreen.tsx:67` — `/photo/[kind]/[id]`, one photo, no list
- `app/photo/[kind]/[id]/page.tsx` — server resolution of all three pointer kinds
- `components/review/ScreenshotStrip.tsx:103,:165` — run screenshots (review)
- `components/share/PhotoInclusionList.tsx:158` — run screenshots (run detail)

**Admin callers (context, not in scope)**
- `components/admin/explorer/SearchResultsGrid.tsx:187` — the existing `headerAction` precedent
- `components/admin/ErrorLogList.tsx:187`

**The admin destination**
- `app/admin/nina/page.tsx` — the gate, the two arms, `?avatar=` resolution, `shareOrigin()` threading
- `components/admin/FileExplorer.tsx` — `deepLinkId` landing effect (`:244-251`), `hrefForFolder` (`:673`), module-private `hrefForMediaView(page)` (`:688`)
- `components/admin/explorer/SelectionPane.tsx` — dispatches `MediaPane` vs `AlbumSelectionPane` on `isMediaRow`
- `components/admin/explorer/MediaPane.tsx` / `MediaControls.tsx` — the media row's Replace/Remove verbs
- `lib/admin/albumDeepLink.ts` — `NINA_AVATAR_PARAM`, `hrefForAvatar`, `hrefForMediaView`
- `lib/admin/filetree/mediaView.ts` — `NINA_MEDIA_VIEW_PARAM`, `NINA_MEDIA_VIEW_VALUE`, `readExplorerView`
- `lib/admin/avatars.ts` — `ADMIN_AVATAR_ID_RE`
- `lib/nina/queries/avatars.ts:659` — `locateNinaAvatar`, the shape to mirror
- `lib/nina/queries/images.ts:682,:712,:750` — `mediaCollectionScope`, `listNinaMediaPhotos`, `countNinaMediaPhotos`

**The clipboard precedent**
- `components/share/ShareButton.tsx` — `navigator.share` → clipboard → manual-field ladder, the tick, the `role="status"` live region
- `components/share/ShareLinkPanel.tsx:65`, `components/admin/ImageGenTestPanel.tsx:302` — plain `clipboard.writeText` call sites
- `lib/share/origin.ts` — `shareOrigin()`, `server-only`

**Client pages that must thread the origin and the admin verdict**
- `app/nina/page.tsx:579` — `<ChatScreen>` props
- `app/nina/about/page.tsx:154` — `<NinaAboutScreen>` props
- `app/photo/[kind]/[id]/page.tsx` — `<PhotoDeepLinkScreen>` props

**The admin verdict**
- `lib/admin/requireAdmin.ts:52` — `getAdminIdentity(): Promise<AdminIdentity | null>`, the branch-don't-refuse helper; `server-only`
- `lib/env.ts:261` — `isAdminEmail(email)`, the one predicate; splits `ADMIN_EMAILS`
- `lib/env.ts:149`, `:180` — why `ADMIN_EMAILS` is env and not a constant

---

## Current Dataflow

### Entry Point A: the client overlay opens

**Location:** `components/nina/ChatScreen.tsx:631`
**Trigger:** a tap on a photograph in a chat bubble → `ChatImages`' `onOpenImage(messageId, index)` → `usePhotoViewer.openViewer`
**State:** `{ messageId, index }` — deliberately not a flat position (`usePhotoViewer.ts:40`)
**Derivation:** `chatSessionPhotos(messages)` flattens every photograph of the open session into `ChatSessionPhoto[]`; `sessionPhotoIndex` maps the identity back to a flat position each render
**Per-photo handles in hand:**
- `url`, `kind`, `label` — display
- `id` — the **turn** id, for the job-detail header link (`chatphotos.ts:26-32`)
- `attachId` — the **`nina_message_images` row id**, or `null` on the optimistic row (`chatphotos.ts:155-163`)
**Exit:** `<PhotoViewer photos={sessionPhotos} index={shownIndex} actions={<ChatPhotoActions/>} headerAction={…job link…}/>`

**Finding:** the row id this feature needs is already resolved and already on screen, under the name `attachId`. It is `null` exactly for an optimistic row whose database rows do not exist yet — the same condition that already hides the attach control.

### Entry Point B: `/nina/about`

**Location:** `components/nina/NinaAboutScreen.tsx:730`
**Trigger:** a grid tap in "Foto profil" (album) or "Media" (gallery) → `?photo=<section>.<id>` on the URL; the open photo is **derived from the URL**, never mirrored into state (`:383-400`)
**Lists:**
- `albumViewer` ← `NinaAlbumPhoto[]` — maps `{url, kind, label}` only; **`NinaAlbumPhoto.id` (a `nina_avatars` id) is dropped** (`:366-370`)
- `galleryViewer` ← `NinaGalleryPhoto[]` — maps `{url, kind, label, id: photo.turnId}`; **`NinaGalleryPhoto.id` (a `nina_message_images` id) is dropped**, and `id` is the turn id (`:371-381`)
**Exit:** `<PhotoViewer … headerAction={open.section === 'album' ? undefined : …job link…}/>`

**Finding:** both row ids exist on the source types (`lib/nina/album.ts:245-273`) and are discarded by the two mappers. Nothing has to be fetched; the mappers have to stop dropping them, under a name that is not `id`.

### Entry Point C: `/photo/[kind]/[id]`

**Location:** `app/photo/[kind]/[id]/page.tsx` → `components/photo/PhotoDeepLinkScreen.tsx:67`
**Trigger:** a `duplicate_image` push notification tap
**Server resolution:** `parsePhotoViewerSegments(kind, id)` → one single-row, `user_id`-scoped read per arm → `{photo, subject, closeHref}`
**Finding:** the pointer (`kind` + `id`) is literally the route's own two segments. This surface has the cleanest possible handle and currently passes no `headerAction` at all.

### Entry Points D/E: the run-screenshot surfaces

`components/review/ScreenshotStrip.tsx` (the `/x/[extractionId]` review strip and the correction sheet) and `components/share/PhotoInclusionList.tsx` (`/r/[id]`'s sharing control) both open `PhotoViewer` over `ReviewPhoto[]`/mapped `blobUrl` rows from `run_photos`. Neither carries a row id in its `ViewerPhoto`, and `/admin/nina` has no collection that holds `run_photos`.

### The admin destination: how a deep link lands today

**Location:** `app/admin/nina/page.tsx:106-150`

1. `requireAdmin()` — the gate, first statement.
2. `readExplorerView(params.view)` — `'media'` iff the value is exactly `media`; anything else is `'album'`.
3. `validateFolderPath(params.folder ?? '')`.
4. **`const wantedAvatarId = view === 'media' ? null : readAvatarId(readOne(params[NINA_AVATAR_PARAM]))`** — the album-only gate. `readAvatarId` is a shape check against `ADMIN_AVATAR_ID_RE`, never an existence check.
5. `locateNinaAvatar(userId, id)` → `{id, folder, offset}` or `null`, where `offset` is a correlated `count(*)` of rows sorting *ahead* of this one **inside its folder** (`lib/nina/queries/avatars.ts:663-678`).
6. `folder = located?.folder ?? …`, `page = located != null ? pageOfOffset(located.offset) : readPage(…)` — a resolved deep link **wins over** `?folder=`/`?page=`; a failed one changes nothing and is silent.
7. The album arm lists that folder-page; `deepLinkId={located?.id ?? null}` crosses to the client.

**Location:** `components/admin/FileExplorer.tsx:244-251` — the landing effect, three things and a ref:
```
if (deepLinkId === null) return
if (spentDeepLink.current === deepLinkId) return
spentDeepLink.current = deepLinkId
setSelectedId(deepLinkId)
setSearch(null)
window.history.replaceState(null, '', hrefForFolder(page.folder, page.page))
```
The ref is load-bearing: `history.replaceState` re-runs parameter watchers synchronously, so the effect can be entered twice for one id and must be idempotent. **`hrefForFolder` and not the media href** — the comment at `:240` states the reason, which this feature invalidates: *"the page resolves `?avatar=` on the ALBUM arm only (a message image is not an album row), so `deepLinkId` is never non-null under `?view=media`."*

`setSelectedId(id)` → `selected = photos.find(p => p.id === selectedId)` (`:209`) → `<SelectionPane photo={selected} …/>` (`:648`) → `isMediaRow(photo)` dispatches `MediaPane`, whose `MediaControls` mounts **Replace** (`replaceChatPhotoAction`) and Remove. The album arm's `AlbumSelectionPane` mounts crop, set-as-current, set-as-anchor, share-to-Nina, Photoshop, download, Replace (`replaceNinaAvatarAction`), remove.

**Finding:** everything downstream of `setSelectedId` already works for a media row. The *only* missing links are (a) a parameter the media arm reads, (b) a query that turns a media id into an offset, and (c) the landing effect spending the parameter with the media href instead of the folder href.

### Data Persistence

No schema change, no migration, no write. Every read added is a single indexed `SELECT` scoped to `user_id`.

- `nina_message_images` — read by a new locate query mirroring `mediaCollectionScope` + `coalesce(last_replaced_at, created_at) DESC, id DESC`
- `nina_avatars` — unchanged; `locateNinaAvatar` already exists

### Exit Points

- Clipboard: an absolute `https://<origin>/admin/nina?...` string
- `navigator.share()` where present (the `ShareButton` ladder), falling through to the clipboard, falling through to a selectable field
- A `role="status"` live region announcing the copy

---

## Key Data Structures

### `ViewerPhoto` — `components/ui/PhotoViewer.tsx:44-78`
```ts
interface ViewerPhoto {
  url: string
  kind: string
  id?: string      // TURN id on the two Nina surfaces — the job-detail link's handle
  label?: string
  meta?: string
}
```
**Used in:** every `PhotoViewer` caller. Six of the fields' consumers are display-only; `id` is the one handle and it is already spoken for.

### `ChatSessionPhoto` — `lib/nina/chatphotos.ts:132-166`
```ts
interface ChatSessionPhoto extends ChatViewerPhoto {
  messageId: string
  indexWithinMessage: number
  attachId: string | null   // the nina_message_images row id, or null on the optimistic row
}
```
**Used in:** `usePhotoViewer` → `ChatScreen`.

### `NinaAlbumPhoto` / `NinaGalleryPhoto` — `lib/nina/album.ts:245-273`
```ts
interface NinaAlbumPhoto   { id: string; url: string; kind: 'avatar'; label: string; isCurrent: boolean; description: string | null }
interface NinaGalleryPhoto { id: string; messageId: string | null; url: string; kind: string; side: NinaPhotoSide; label: string; turnId: string | null }
```
**Used in:** `NinaAboutScreen`'s two mappers, which drop `id` in both cases.

### `PhotoPointer` / `PhotoPointerKind` — `lib/photos/pointer.ts:33-47`
```ts
type PhotoPointerKind = 'shot' | 'avatar' | 'image'
interface PhotoPointer { kind: PhotoPointerKind; id: string }
```
**Used in:** `/photo/[kind]/[id]`, the duplicate-image push. Pure, no DB, no `server-only` — importable from a client component, which is what makes it the right vocabulary for the minter.

### `NinaAvatarLocation` — `lib/nina/queries/avatars.ts`
```ts
{ id: string; folder: string; offset: number }
```
The shape a media locate must mirror, minus `folder` (Media is not a folder).

---

## Dependencies

### Configuration / Environment
- `AUTH_URL` → `shareOrigin()` (`lib/share/origin.ts`, `server-only`). In production `https://runins.site`; on a preview it resolves to the stable production hostname, which is exactly what a link pasted into WhatsApp needs.
- `ADMIN_EMAILS` — the admin group, read through `isAdminEmail` (`lib/env.ts:261`). **Production-scope only in Vercel**, so `/admin/nina` cannot be served from a preview deployment at all, and on a preview `getAdminIdentity()` answers `null` for everyone — which is the correct behaviour for R4, not a bug to work around. It also bounds how this can be verified before merge: the end-to-end check is local (with `ADMIN_EMAILS` supplied by hand) or on production.

### External Services
None added. No model call, no blob write, no network beyond the clipboard.

### Invariants this work must not break
- **Invariant 5** — `description` (`glm-4.6v`'s private prose) never crosses into a client component. The new field is an **id**, not prose.
- **Invariant 9** — no `NEXT_PUBLIC_` for the share origin; it is resolved server-side and threaded as a prop. The same applies to the admin verdict: `getAdminIdentity()` and `isAdminEmail` are both `server-only`/env-reading, and neither may cross into a client bundle.
- **The admin address is never written in source.** `isAdminEmail` against `ADMIN_EMAILS` is the only admin test in this repo (R4). A literal `'mahfuzh74@gmail.com'` anywhere in `lib/`, `app/` or `components/` is a defect, not a shortcut.
- `npm run ci:client-secret-guard` — JSX comments need a leading `*` on every continuation line, or the guard fails on the prose explaining why it is being obeyed (`app/admin/nina/page.tsx:265-276` records this).
- `tests/admin.filetreeBarrel.test.ts` freezes `lib/admin/filetree`'s barrel at 35 names, and its purity half forbids server-only imports there. New grammar goes in `lib/admin/albumDeepLink.ts`, which is where the last two additions went for exactly this reason.
- `tests/ui.photoViewer.test.ts` asserts the public shared page (`app/(public)/s/[token]/page.tsx`) never imports `PhotoViewer`. It must stay a non-caller.

---

## Reference List

| Symbol / key | File:line | Kind | Package |
|---|---|---|---|
| `PhotoViewer` | `components/ui/PhotoViewer.tsx:100` | def | `components/ui` |
| `ViewerPhoto` | `components/ui/PhotoViewer.tsx:44` | def | `components/ui` |
| `headerAction` prop | `components/ui/PhotoViewer.tsx:158`, `:294` | def · render | `components/ui` |
| `<PhotoViewer>` (chat) | `components/nina/ChatScreen.tsx:631` | call | `components/nina` |
| `<PhotoViewer>` (about) | `components/nina/NinaAboutScreen.tsx:730` | call | `components/nina` |
| `<PhotoViewer>` (deep link) | `components/photo/PhotoDeepLinkScreen.tsx:67` | call | `components/photo` |
| `<PhotoViewer>` (review ×2) | `components/review/ScreenshotStrip.tsx:103`, `:165` | call | `components/review` |
| `<PhotoViewer>` (share) | `components/share/PhotoInclusionList.tsx:158` | call | `components/share` |
| `<PhotoViewer>` (admin search) | `components/admin/explorer/SearchResultsGrid.tsx:140` | call | `components/admin` |
| `<PhotoViewer>` (admin errors) | `components/admin/ErrorLogList.tsx:187` | call | `components/admin` |
| `ChatSessionPhoto.attachId` | `lib/nina/chatphotos.ts:163` | def | `lib/nina` |
| `chatSessionPhotos` | `lib/nina/chatphotos.ts:186` | def | `lib/nina` |
| `usePhotoViewer` | `components/nina/usePhotoViewer.ts:22` | def | `components/nina` |
| `albumViewer` mapper | `components/nina/NinaAboutScreen.tsx:366` | def | `components/nina` |
| `galleryViewer` mapper | `components/nina/NinaAboutScreen.tsx:371` | def | `components/nina` |
| `NinaAlbumPhoto` | `lib/nina/album.ts:245` | def | `lib/nina` |
| `NinaGalleryPhoto` | `lib/nina/album.ts:255` | def | `lib/nina` |
| `PhotoPointerKind` | `lib/photos/pointer.ts:33` | def | `lib/photos` |
| `NINA_AVATAR_PARAM` | `lib/admin/albumDeepLink.ts:38` | def | `lib/admin` |
| `hrefForAvatar` | `lib/admin/albumDeepLink.ts:50` | def | `lib/admin` |
| `hrefForMediaView` (no-arg) | `lib/admin/albumDeepLink.ts:72` | def | `lib/admin` |
| `hrefForMediaView` (paged, module-private) | `components/admin/FileExplorer.tsx:688` | def | `components/admin` |
| `NINA_MEDIA_VIEW_PARAM` / `_VALUE` | `lib/admin/filetree/mediaView.ts:28`, `:31` | def | `lib/admin/filetree` |
| `readExplorerView` | `lib/admin/filetree/mediaView.ts:61` | def | `lib/admin/filetree` |
| `readAvatarId` | `app/admin/nina/page.tsx` (module-private) | def | `app/admin` |
| `wantedAvatarId` album-only gate | `app/admin/nina/page.tsx:131` | **the blocker** | `app/admin` |
| `locateNinaAvatar` | `lib/nina/queries/avatars.ts:659` | def | `lib/nina/queries` |
| `listNinaMediaPhotos` | `lib/nina/queries/images.ts:712` | def | `lib/nina/queries` |
| `countNinaMediaPhotos` | `lib/nina/queries/images.ts:750` | def | `lib/nina/queries` |
| `mediaCollectionScope` | `lib/nina/queries/images.ts:682` | def (module-private) | `lib/nina/queries` |
| `deepLinkId` landing effect | `components/admin/FileExplorer.tsx:244` | impl | `components/admin` |
| `hrefForFolder` | `components/admin/FileExplorer.tsx:673` | def | `components/admin` |
| `SelectionPane` dispatcher | `components/admin/explorer/SelectionPane.tsx:105` | def | `components/admin` |
| `MediaControls` Replace | `components/admin/explorer/MediaControls.tsx:109` | impl | `components/admin` |
| `shareOrigin()` | `lib/share/origin.ts:25` | def (`server-only`) | `lib/share` |
| `shareOrigin` prop threading | `app/admin/nina/page.tsx:277` | call | `app/admin` |
| `ShareButton` clipboard ladder | `components/share/ShareButton.tsx:96-131` | impl | `components/share` |
| `<ChatScreen>` props | `app/nina/page.tsx:579` | call | `app/nina` |
| `<NinaAboutScreen>` props | `app/nina/about/page.tsx:154` | call | `app/nina` |
| `<PhotoDeepLinkScreen>` props | `app/photo/[kind]/[id]/page.tsx` | call | `app/photo` |
| `tests/ui.photoViewer.test.ts` | whole file | test | `tests` |
| `components/ui/PhotoViewer.test.tsx` | `:219`, `:239-248` | test | `components/ui` |
| `components/nina/NinaAboutScreen.test.tsx:54-57` | headerAction stub | test | `components/nina` |
| `tests/nina.chatPhoto.test.ts` | whole file | test | `tests` |
| `tests/admin.photoSearch.test.ts:166-170` | headerAction source scan | test | `tests` |
| `tests/photo.deepLink.test.ts` | whole file | test | `tests` |

---

## Impact Points (files that WILL need changes)

| # | File | Why | Phase |
|---|---|---|---|
| 1 | `lib/admin/albumDeepLink.ts` | add the media-photo parameter key and the one absolute-link minter, keyed on `PhotoPointerKind` | 1 |
| 2 | `lib/nina/queries/images.ts` | add `locateNinaMediaPhoto` — mirror `mediaCollectionScope` + the full sort key; follow `source_image_id` for a re-share | 2 |
| 3 | `lib/nina/queries.ts` (barrel) | re-export the new query | 2 |
| 4 | `app/admin/nina/page.tsx` | read the new parameter on the **media** arm; resolve it to a page; hand `deepLinkId` down from either arm | 2 |
| 5 | `components/admin/FileExplorer.tsx` | the landing effect must spend the parameter with the media href when `view === 'media'` | 2 |
| 6 | **new** `components/ui/CopyAdminLinkButton.tsx` | the icon-only control: minter + `ShareButton`'s clipboard ladder + the tick + the live region | 3 |
| 7 | `components/ui/PhotoViewer.tsx` | carry a second, separately-named row handle on `ViewerPhoto` (`id` is the turn id) | 3 |
| 8 | `components/nina/ChatScreen.tsx` | `headerAction` returns a **cluster**: the new button plus the existing job link | 4 |
| 9 | `lib/nina/chatphotos.ts` | surface `attachId` onto the viewer photo under the agreed handle name | 4 |
| 10 | `components/nina/NinaAboutScreen.tsx` | stop dropping the row id in both mappers; `headerAction` on the **album** arm too (today `undefined`) | 4 |
| 11 | `components/photo/PhotoDeepLinkScreen.tsx` | accept and render the button from the route's own pointer | 4 |
| 12 | `app/photo/[kind]/[id]/page.tsx` | pass the pointer + the nullable admin origin through | 4 |
| 13 | `app/nina/page.tsx` | resolve `getAdminIdentity()`, thread the nullable admin origin to `<ChatScreen>` | 4 |
| 14 | `app/nina/about/page.tsx` | same, to `<NinaAboutScreen>` | 4 |
| 14b | `components/nina/ChatScreen.tsx`, `NinaAboutScreen.tsx`, `PhotoDeepLinkScreen.tsx` | accept the nullable prop; render nothing at all when it is `null` (R4) | 4 |
| 14c | **new**, under `lib/admin/` | a `server-only` resolver: `shareOrigin()` for an admin identity, `null` otherwise **and** when the admin env group is unconfigured — so these three pages never inherit `isAdminEmail`'s throw | 4 |
| 15 | tests: `components/ui/PhotoViewer.test.tsx`, `tests/ui.photoViewer.test.ts`, `components/nina/NinaAboutScreen.test.tsx`, `tests/nina.chatPhoto.test.ts`, `tests/photo.deepLink.test.ts`, new query + grammar suites | the surfaces above are frozen by source scans and component tests | 1–4 |

**Explicitly NOT changed:** `components/review/ScreenshotStrip.tsx`, `components/share/PhotoInclusionList.tsx`, `app/(public)/s/[token]/page.tsx` — see the plan's `## Decisions`.

**This document describes. The plan files prescribe.**
