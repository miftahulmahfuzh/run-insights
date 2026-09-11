# Phase 2: Media verbs on both kinds; purge the Chat photos surface

**Plan set:** `IMAGE_COLLECTION_PLAN.md`
**Analysis:** `20260910-154651-53D2_code_analyzer.md`
**Satisfies:** R1 (write half — every original media row replaceable/describable/adoptable; the purge), R2 (prompt affordance only while the sidecar exists)
**Depends on:** Phase 1
**Difficulty:** HARD
**Package:** `lib/admin`, `lib/nina`, `components/admin`, `app/admin`

---

## Goal

Every verb the `/admin/photos` rail offered — replace, add, remove, hand-edit description, adopt-as-profile-picture, download, view prompt — now works in the explorer's Media folder for **both** `kind: 'upload'` and `kind: 'generated'` rows, and the `/admin/photos` surface (route, components, nav entry, dashboard card, its exclusive test) is deleted. A replaced or hand-added row offers no prompt affordance at all (R2), while a never-replaced generated row still does. No migration, no confirmations, inline sentence errors, no runner-facing change.

## Interface Contract

The reconciler reads this section to detect cross-phase conflicts. Be exact and exhaustive.

**Deletes:**
- `app/admin/photos/page.tsx` (whole route, incl. `PageProps<'/admin/photos'>` usage — typegen regenerates)
- `components/admin/ChatPhotoGrid.tsx` (incl. `CHAT_PHOTO_COLLECTION_LABEL`)
- `components/admin/ChatPhotoDetail.tsx`
- `components/admin/ChatPhotoControls.tsx`
- `components/admin/ChatPhotoAdd.tsx`
- `components/admin/ChatPhotoDescription.tsx`
- `components/admin/ChatPhotoProfilePicture.tsx`
- `components/admin/chatPhotoUpload.ts` (content MOVED to `components/admin/explorer/chatPhotoUpload.ts` — see Creates)
- `components/admin/chatPhotoModel.ts` (`ChatPhoto`, `ChatPhotoPageInfo` — subsumed by Phase 1's `ExplorerPhoto`)
- `lib/nina/queries.ts` — `listNinaChatPhotos`, `NinaChatPhotoPage` (last caller was the deleted page)
- `tests/admin.chatPhotosRail.test.ts`
- The `kind !== 'generated'` refusals (code + their sentence `'That one is his upload, not hers.'`) in `replaceChatPhotoAction` (`lib/admin/chatPhotoActions.ts`), `editChatPhotoDescriptionAction` (same file), `setChatPhotoAsAvatarAction` (`lib/admin/ninaAlbumActions.ts`)
- The `eq(ninaMessageImages.kind, 'generated')` WHERE clause in `updateNinaChatPhotoBlob` and `updateNinaChatPhotoDescription` (`lib/nina/queries.ts`) — replaced by `isOriginalPhoto()`, see below
- Nav entry `{ href: '/admin/photos', label: 'Chat photos', short: 'Photos', icon: CameraIcon }` and the private `CameraIcon` fn in `components/admin/AdminNavLinks.tsx`; the dashboard "Chat photos" card + its `countNinaChatPhotos` call in `app/admin/page.tsx`
- `revalidatePath('/admin/photos')` in `setChatPhotoAsAvatarAction` (the literal; the constant callers keep their call)

**Renames:**
- `components/admin/chatPhotoUpload.ts` -> `components/admin/explorer/chatPhotoUpload.ts` (same exports: `ADMIN_CHAT_PHOTO_LONG_EDGE_PX`, `ADMIN_CHAT_PHOTO_QUALITY`, `UploadedChatPhoto`, `encodeChatPhotoJpeg`, `uploadChatPhoto`)
- `ChatPhotoAdd` -> `MediaAdd` (`components/admin/explorer/MediaAdd.tsx`, accessible name "Add photos")
- `ChatPhotoControls` -> `MediaControls` (`components/admin/explorer/MediaControls.tsx`, fragment idiom kept)
- `ChatPhotoDescription` -> `MediaDescription` (`components/admin/explorer/MediaDescription.tsx` — SEAM: Phase 3 replaces this file wholesale)
- `SelectionPane`'s album body -> private `AlbumSelectionPane`; the exported `SelectionPane` becomes a dispatcher over `isMediaRow`

**Creates:**
- `components/admin/explorer/chatPhotoUpload.ts` (moved client module)
- `components/admin/explorer/MediaAdd.tsx` — `MediaAdd({ userId })`
- `components/admin/explorer/MediaControls.tsx` — `MediaControls({ userId, photoId, onRemoved })`
- `components/admin/explorer/MediaDescription.tsx` — `MediaDescription({ photoId, description })`
- `components/admin/explorer/MediaPane.tsx` — `MediaPane({ photo, userId, onClose, onRemoved })` + `isMediaRow(photo)`
- `lib/nina/album.ts` — `describeSubjectForSide(side: NinaPhotoSide): 'self' | 'runner'` (pure, unit-tested)
- `tests/admin.mediaPane.test.ts` (structural, `readRepoCode` — vitest is node-only, no DOM)
- One `FileExplorer` render note: `notice` state + inline sentence for a remove that kept a shared blob

**Signature changes:**
- `SelectionPane` props: `onRemoved: () => void` -> `onRemoved: (note: string | null) => void` (album branch passes `null`; media branch forwards the chat-remove note). `userId: string` is ADDED to `SelectionPane`'s props (threaded to `MediaPane`/`MediaControls`; never read from a client session)
- `updateNinaChatPhotoDescription(userId, id, description)` — signature unchanged; WHERE `kind='generated'` -> `isOriginalPhoto()`
- `updateNinaChatPhotoBlob(userId, id, patch)` — signature unchanged; WHERE `kind='generated'` -> `isOriginalPhoto()` (DECISION D-P2-1 below)
- `scheduleChatPhotoCaption` (private) — describe subject now `describeSubjectForSide(photoSideOf(row.kind))` instead of constant `'self'`
- `app/admin/page.tsx` `Promise.all` shrinks: `chatPhotoCount` read removed

**Requires (from earlier phases):** Phase 1 has landed, i.e. this tree already has:
- `ExplorerPhoto` (`components/admin/explorer/model.ts`) as a discriminated union
  `AlbumExplorerPhoto | MediaExplorerPhoto`, the discriminant being **`origin: 'album' | 'media'`** (a
  plain field on each arm; no type-guard function ships in `model.ts`). The media arm carries
  `kind: NinaImageKind` (`'upload' | 'generated'`), `side: NinaPhotoSide`, `prompt: string | null`,
  `messageId: string | null`, `sortOrder: number`, and pins `thumbUrl: null`, `isCurrent: false`,
  identity `crop`; the album arm pins nothing extra. **`isMediaRow` in `MediaPane.tsx` is the single
  point of contact** — below it is written as a type guard over `origin`
  (`photo is MediaExplorerPhoto`), so the dispatcher's branches narrow without a cast.
- The `?view=media` arm of `app/admin/nina/page.tsx`, with the paginated all-kinds originals read
  (`listNinaMediaPhotos` + `countNinaMediaPhotos` over `mediaCollectionScope`) in
  `lib/nina/queries.ts`, and `FileExplorer` already carrying the view as a **`view: ExplorerView`
  prop** — `export type ExplorerView = 'album' | 'media'` lives in `lib/admin/filetree.ts`, the page
  derives it with `readExplorerView(params.view)`, and a `mediaCount: number` prop rides along for
  the tree badge. This phase therefore adds NO prop to `FileExplorer`; it derives
  `const isMediaView = view === 'media'` locally.
- The virtual Media node in `lib/admin/filetree.ts` + `FolderTree` (nav between Album and Media keeps working; Phase 2 changes nothing in the tree).
- `NINA_CHAT_PHOTO_PAGE_SIZE` still exported from `lib/nina/album.ts` (Phase 1 may have re-homed the constant for its media read — this phase neither renames nor re-homes it; only comments mentioning the retired `listNinaChatPhotos` are touched, and only where this phase already edits the surrounding function).

**Leaves alone (owned by others):**
- `lib/nina/gateway.ts` window `imageDescriptions` and `lib/nina/actions.ts:1535-1540` stale comment (Phase 3)
- `describeNinaAvatarAction`'s subject and the MANUAL describe button shape/labels (Phase 3); `MediaDescription.tsx` is a marked seam Phase 3 replaces wholesale
- `explorer/PhotoGrid.tsx` styling + all renames to "Image collection" (Phase 4); `PhotoReferencePicker.tsx` and `tests/admin.photoReference.test.ts` (invariant 9 — untouched)
- `lib/admin/chatPhotoSchema.ts` (schemas kept as-is), `app/api/admin/nina/upload/route.ts` (predicates reused as-is), `lib/nina/chatphotos.ts` (runner-facing, pure), `lib/nina/dedupe.ts`, `lib/nina/albumActions.ts` (runner-facing media viewer), `generatedChatPhotoScope` + `countNinaChatPhotos` in `lib/nina/queries.ts` (the image-reference picker is their remaining caller — `tests/nina.imageprefs.test.ts:541` pins it), `scripts/*`, `lib/db/schema.ts`
- Every runner-facing module: `photoSideOf`, `galleryPhotos`, `chatViewerPhotos`, chat bubbles — byte-identical
- Comment-only mention cleanups not adjacent to edited code (e.g. `components/admin/photoIcons.tsx` header, `components/admin/PhotoReferencePicker.tsx`, `lib/pwa.ts`, `components/nina/SessionRow.tsx`) — Phase 4's opportunistic list

---

## Files

| File | Action | What changes |
|---|---|---|
| `lib/admin/chatPhotos.ts` | modify | `ADMIN_CHAT_PHOTOS_PATH` value -> `'/admin/nina'`, honest docstring; header's consumer list updated |
| `lib/nina/album.ts` | modify | add pure `describeSubjectForSide` beside `photoSideOf` |
| `lib/nina/queries.ts` | modify | both chat-photo write WHEREs widened to `isOriginalPhoto()`; `listNinaChatPhotos` + `NinaChatPhotoPage` retired; §5b banner + two adjacent docstrings updated |
| `lib/admin/chatPhotoActions.ts` | modify | lift Replace/Edit kind refusals; side-aware describe subject; docstrings |
| `lib/admin/ninaAlbumActions.ts` | modify | lift `setChatPhotoAsAvatarAction` kind refusal; drop `revalidatePath('/admin/photos')`; docstring |
| `lib/admin/imageGenActions.ts` | modify | 2-line comment fix where the revalidate constant's meaning changed |
| `components/admin/explorer/chatPhotoUpload.ts` | create | moved client upload module (verbatim logic) |
| `components/admin/explorer/MediaAdd.tsx` | create | migrated `ChatPhotoAdd` — Media view's "Add photos" |
| `components/admin/explorer/MediaControls.tsx` | create | migrated `ChatPhotoControls` — Replace/Remove fragment |
| `components/admin/explorer/MediaDescription.tsx` | create | migrated `ChatPhotoDescription` — SEAM: Phase 3 |
| `components/admin/explorer/MediaPane.tsx` | create | the media selection rail + `isMediaRow` |
| `components/admin/explorer/SelectionPane.tsx` | modify | dispatcher; album body becomes private `AlbumSelectionPane`; `onRemoved(note)`; `userId` prop |
| `components/admin/FileExplorer.tsx` | modify | media-view toolbar branch, drop-target/queue/move-bar album-only, notice line, `userId` + `onRemoved` threading |
| `components/admin/AdminNavLinks.tsx` | modify | entry + `CameraIcon` removed; `grid-cols-6`; comments de-trio'd |
| `app/admin/page.tsx` | modify | "Chat photos" card, count read and import removed |
| `app/admin/photos/page.tsx` | delete | the route |
| `components/admin/{ChatPhotoGrid,ChatPhotoDetail,ChatPhotoControls,ChatPhotoAdd,ChatPhotoDescription,ChatPhotoProfilePicture,chatPhotoModel,chatPhotoUpload}.tsx/ts` | delete | the purged family |
| `tests/admin.chatPhotosRail.test.ts` | delete | rail suite retires |
| `tests/admin.mediaPane.test.ts` | create | structural guard for the migrated rail + R2's conditional |
| `tests/admin.shell.test.ts` | modify | href array (6), counts 7->6, `grid-cols-6` |
| `tests/admin.chatPhotos.test.ts` | modify | import path; `'/admin/nina'` revalidates; lifted-guard positives; subject-by-side case |
| `tests/nina.chatPhotoDescription.test.ts` | modify | WHERE assertions kind -> original-only; add `updateNinaChatPhotoBlob` describe |
| `tests/admin.chatPhotoAdoption.test.ts` | modify | `'/admin/nina'` revalidate; his-upload refusal -> positive adoption |
| `tests/nina.photoRefs.test.ts` | modify | retire the `listNinaChatPhotos` it; keep the count it |
| `lib/nina/album.test.ts` | modify | `describeSubjectForSide` cases |

---

## Decisions taken in this phase (documented, per the brief's "decide and document" items)

**D-P2-1 — `updateNinaChatPhotoBlob`'s WHERE.** The `kind = 'generated'` clause is REPLACED by `isOriginalPhoto()`; `kind` is not written by the statement. Rationale: after the guard lift, Replace addresses any original row, so a kind clause would turn "replace one of his uploads" into a silent `"That photo is not in the collection."` refusal — the one outcome worse than the old loud one. The row's `kind` stays whatever it was: a replaced upload remains `kind: 'upload'`, now storing selfie-shaped JPEG bytes at a `selfie-` pathname. That is the analysis's rule held exactly — pathname is display/admin-only, `kind` drives behavior (`photoSideOf`, describe subject, runner display). The reference backstop (`isOriginalPhoto()`) stays in the SQL so the second of the surface's two agreeing checks survives the widening: an id for a reference row still updates nothing, even from a stale tab that somehow passed the action's refusal.

**D-P2-2 — `updateNinaChatPhotoDescription`'s WHERE.** Same replacement, same reasons. Hand-editing what she can see in one of his uploads is R1's point; references stay refused twice (action + SQL).

**D-P2-3 — Retire `listNinaChatPhotos`, keep `countNinaChatPhotos` + `generatedChatPhotoScope`.** The listing's only caller is the deleted page. The count and the scope keep a live caller — `listNinaPhotoReferences`/`resolveNinaPhotoReference` (the image-reference picker), pinned by `tests/nina.imageprefs.test.ts:541`. Retiring them would be scope creep into the picker.

**D-P2-4 — Pane architecture.** `SelectionPane` becomes a two-line dispatcher; the album body is untouched except its `onRemoved` callback's signature (it now reports `null` instead of nothing). The media rail is a new `MediaPane.tsx` — the old rail's documented "keyed remount per selection" reset idiom (`ChatPhotoGrid`'s `key`) is reproduced by the dispatcher keying `MediaPane` on `photo.id`, which also makes the R2 conditional and the adopt latch selection-local.

**D-P2-5 — Upload module home.** The client encode/upload module moves inside `components/admin/explorer/` (beside `thumbnail.ts`, its stated precedent) rather than into `lib/`: it is a `'use client'` module using `OffscreenCanvas` and `@vercel/blob/client`, and `lib/nina/album.ts`'s note on zero-import purity is why browser-only modules stay under `components/`.

---

## Implementation Steps

Implement in order; the tree compiles at the end of Step 12 (the deletions in Step 10 are what break the old imports, so do them no earlier than Step 10).

### Step 1: Re-home the revalidate path constant
**File:** `lib/admin/chatPhotos.ts:89-93` (constant) and `:5-14` (header consumer list)
**Change:** The constant's value becomes the explorer route. The NAME stays — every caller keeps compiling, and `imageGenActions.ts`'s background revalidate now correctly refreshes the page the collection actually lives on.
**Code:**

```ts
/**
 * The route every action here revalidates.
 *
 * Named for the COLLECTION, not for a URL: the chat photographs this module writes were rehomed
 * from `/admin/photos` into the explorer's Media view (`/admin/nina?view=media`, the image-collection
 * page) when that surface was purged, and the constant is what kept that move a one-line change.
 * `/admin/nina` is the page route — `revalidatePath` re-renders the whole page, so the Media view
 * arrives fresh with it — and `lib/admin/imageGenActions.ts` rides the same constant to invalidate
 * the collection when the background selfie finisher lands a new photograph.
 */
export const ADMIN_CHAT_PHOTOS_PATH = '/admin/nina'
```

Also update the file header's consumer list (`:9-13`) to name the survivors, so the docstring does not point at deleted files:

```ts
 * The counterpart of `lib/admin/avatars.ts` for `nina_message_images`, and pure for the same stated
 * reason: `components/admin/explorer/chatPhotoUpload.ts`, `components/admin/explorer/MediaAdd.tsx`
 * and `components/admin/explorer/MediaControls.tsx` (client modules),
 * `app/api/admin/nina/upload/route.ts` (a Route Handler), `lib/admin/chatPhotoActions.ts` (Server
 * Actions) and `tests/admin.chatPhotos.test.ts` all have to agree, and a constant that is agreed
 * rather than shared is a constant that will one day disagree.
```

**Impact:** every `revalidatePath(ADMIN_CHAT_PHOTOS_PATH)` call (three actions + `imageGenActions.ts:304`) now invalidates `/admin/nina`. No behavior lost: `/admin/photos` no longer exists to go stale.

### Step 2: The side-to-subject mapping, as a pure function
**File:** `lib/nina/album.ts` — insert directly after `photoSideOf` (`:176-178`)
**Change:** One pure decision, unit-tested per invariant 8: a photograph of Nina is described by the self witness; one of his uploads by the runner witness. `lib/nina/album.ts` is the module that already owns the his/hers discriminator, is pure, and is imported by the admin actions already for `NINA_CHAT_PHOTO_PAGE_SIZE` neighbors — no new edge.
**Code:**

```ts
/**
 * Which witness prompt a describe pass uses for a photograph of this side.
 *
 * `'hers'` — a generated photograph, which is a photograph OF NINA — is described with
 * `NINA_SELF_DESCRIBE_SYSTEM_PROMPT`; the runner prompt would look for a man who is not in the
 * frame. `'his'` — one of the runner's own uploads — is described with the default runner witness,
 * because the subject is him. `scheduleChatPhotoCaption` reads this off the row's `kind` through
 * `photoSideOf`, which is what makes the admin describe pass side-aware without the admin surface
 * learning the prompts. Kept beside `photoSideOf` so the discriminator and its consequence are one
 * edit apart, and pure so `lib/nina/album.test.ts` can pin the pair.
 */
export function describeSubjectForSide(side: NinaPhotoSide): 'self' | 'runner' {
  return side === 'hers' ? 'self' : 'runner'
}
```

**Impact:** none at runtime until Step 5 wires it. `NinaDescribeSubject` is not imported here on purpose — the return type is structural, and `lib/nina/vision.ts` accepts it (`subject?: 'self' | 'runner'`).

### Step 3: Widen the two chat-photo write statements
**File:** `lib/nina/queries.ts`
**Change (a):** `updateNinaChatPhotoDescription` (`:2286-2304`) — replace the kind clause with `isOriginalPhoto()` per D-P2-2. The docstring's third-bullet paragraph (`:2254-2260`) is rewritten to say what the clause now asserts, since that paragraph's premise ("lists only HERS") is false after this phase.

```ts
/**
 * **EDIT: the operator rewrites what she can see in a photograph.** R2 of
 * `nina-photo-refs-and-bubble-actions`, verbatim: *"there is a 'what she can see in it' field. make
 * this field editable by user"*.
 *
 * ── WHY THIS IS NOT `setNinaMessageImageDescription` WITH A WIDER SIGNATURE ────────────────
 * Three differences, and each one is load-bearing:
 *
 *   · The WHERE carries `isOriginalPhoto()` — both provenance columns must be NULL. Since the
 *     image-collection merge, EVERY original row of this table is describable from the admin
 *     surface: hers AND his, which is why the old `kind = 'generated'` clause is gone. What the
 *     clause is replaced with is the reference backstop: a row carrying `source_avatar_id` /
 *     `source_image_id` is a re-SHOW of a photograph that lives elsewhere, the action refuses it
 *     first, and this clause is the second of the two agreeing checks — a stale client that slips
 *     the refusal updates nothing. `setNinaMessageImageDescription` has no such clause and must NOT
 *     grow one: its caller is `after()`'s describe pass, which legitimately describes both sides.
 *   · `description` is `string | null` here. NULL is the operator CLEARING the field (the phase's
 *     D1), and it is not a new state for the row — `updateNinaChatPhotoBlob` writes it in the same
 *     breath as a replace, and every `addChatPhotoAction` row starts there.
 *     `setNinaMessageImageDescription` takes a `string` because a vision pass that produced nothing
 *     writes nothing.
 *   · It returns the ROW rather than a boolean, because its caller reports on what it wrote. That is
 *     `updateNinaChatPhotoBlob`'s shape; the boolean is the `after()`-callback shape, for a caller
 *     whose only options are "log a miss" and "log a write".
 *
 * ── IT TOUCHES ONE COLUMN, AND THE ABSENCES ARE THE CONTRACT ──────────────────────────────
 *   · NOT `kind` — a hand-corrected description does not turn one of his uploads into one of hers;
 *     `kind` is the his/hers discriminator and only the bytes' origin writes it.
 *   · NOT `prompt` — the generation sidecar for bytes that have not changed.
 *   · NOT `created_at` — `nina_message_images_user_created_idx` orders the gallery and the Media
 *     view by it. Correcting a sentence about a photograph is not taking a new one.
 *   · NOT `blob_url`, `pathname`, or the four measurements — the picture is the same picture.
 *   · NOTHING on `nina_messages`. The bubble's caption is what she SAID; this column is what she
 *     SAW. Rewriting the second from `/admin` must not silently rewrite the first in the runner's
 *     conversation — see the action's docstring.
 *
 * ── NO INVALIDATION STEP, BY CONSTRUCTION ─────────────────────────────────────────────────
 * `resolveAttachment` re-reads this row with `getNinaMessageImage` on every send, and
 * `lib/nina/actions.ts:634-637` hands the value straight to
 * `NinaBackgroundTurnInput.imageDescriptions`. So the next turn that carries this photograph reads
 * what was just written, with no cache to bust. A NULL degrades exactly as a replace's NULL does:
 * `NINA_DESCRIPTION_UNAVAILABLE` is substituted and she asks him what the picture is.
 */
export async function updateNinaChatPhotoDescription(
  userId: string,
  id: string,
  description: string | null,
): Promise<NinaImageRow | null> {
  const updated = await db
    .update(ninaMessageImages)
    .set({ description })
    .where(
      and(
        eq(ninaMessageImages.userId, userId),
        eq(ninaMessageImages.id, id),
        isOriginalPhoto(),
      ),
    )
    .returning(imageColumns)

  return updated[0] ?? null
}
```

**Change (b):** `updateNinaChatPhotoBlob` (`:2068-2110`) — same WHERE replacement per D-P2-1, plus the docstring bullet that justified the kind clause (`:2052-2053`) rewritten:

```ts
 *   · `kind` — never written by this statement. A replaced upload row stays `kind: 'upload'`,
 *     now storing selfie-shaped JPEG bytes at a `selfie-` pathname: pathname is display/admin-only
 *     and `kind` drives behavior (`photoSideOf`, the describe subject, the runner's display). The
 *     WHERE carries `isOriginalPhoto()` instead of the old `kind = 'generated'`: every original is
 *     replaceable since the merge, and a REFERENCE row is still unreachable — the action refuses
 *     it first and this clause is the second agreeing check.
```

and the statement itself:

```ts
    .where(
      and(
        eq(ninaMessageImages.userId, userId),
        eq(ninaMessageImages.id, id),
        isOriginalPhoto(),
      ),
    )
    .returning(imageColumns)
```

**Change (c):** retire `listNinaChatPhotos` — delete the whole function with its docstring (`:1948-1992`) and the `NinaChatPhotoPage` interface with its docstring (`:296-309`). Rewrite the two adjacent docstrings that described it as a caller:

- `generatedChatPhotoScope`'s final paragraph (`:1933-1938`) becomes:

```ts
 * ── AND SINCE F37, NOT A REFERENCE ───────────────────────────────────────────
 * `isOriginalPhoto()` joins the `and(...)` here rather than at the call sites, which is the same
 * argument this docstring already makes for `kind`: every statement that reads this scope reads the
 * same set by construction. After the image-collection merge the scope's callers are the
 * image-reference picker's — `listNinaPhotoReferences` (page side) and `countNinaChatPhotos` (its
 * total) and `resolveNinaPhotoReference` (the stored selection) — a picker grid that shows her
 * GENERATED photographs only, which is the one set this scope still names.
```

- `countNinaChatPhotos`'s first paragraph (`:1996-1999`) becomes:

```ts
 * One caller needs the integer and nothing else: `listNinaPhotoReferences`, whose picker total is
 * the album count plus this one — the mistake `countNinaAvatars` (:2336) was written to undo, not
 * repeated here. (The `/admin` hub card and the `/admin/photos` page that used to read it are gone
 * with the surface merge; the Media view counts with its own all-kinds read.)
```

- The §5b banner (`:2012-2018`) becomes:

```ts
/* ============================================================================
 * §5b Conversation photographs — the admin write side (R2, phase 3)
 *
 * The image-collection explorer's Media view (`/admin/nina?view=media`) is the only surface these
 * statements answer to. Every statement here is owner-scoped and none of them is reachable from a
 * runner-facing path, which is why they sit in their own block rather than in §5: §5 is what the
 * chat reads and what the worker writes, and this is what the operator changes.
 * ==========================================================================*/
```

- The read inventory in `isOriginalPhoto()`'s docstring (`:1875-1886`) — the line naming `listNinaChatPhotos` as a collection read — is updated in place: remove the `listNinaChatPhotos` bullet, and reword the `countNinaChatPhotos` bullet to "→ the reference picker's chat-side total, via the same scope". (Phase 1's media read has its own bullet there from its own edit; leave whatever Phase 1 wrote.)

**Impact:** `updateNinaChatPhotoDescription`'s generated SQL no longer contains `"kind" = $` and now contains both `"source_avatar_id" is null` and `"source_image_id" is null`. `tsc` will flag the two retired exports' test references, fixed in Step 13. The picker's `generatedChatPhotoScope` contract (pinned by `tests/nina.imageprefs.test.ts:541`) is untouched.

### Step 4: Lift the Replace guard; side-aware describe subject
**File:** `lib/admin/chatPhotoActions.ts`
**Change (a):** `replaceChatPhotoAction` — delete the refusal at `:152-154`:

```ts
  if (existing.kind !== 'generated') {
    return { ok: false, error: 'That one is his upload, not hers.' }
  }
```

Keep `isChatPhotoReference(existing)` and its exact sentence (`:155-160`). Rewrite the docstring paragraph `:129-137` (the one headed "A REFERENCE ROW IS NOT A MEMBER") — its second sentence claims references "are not on `/admin/photos` at all"; after the merge they are not in the Media folder (the read skips them), which is the same property reworded, and the paragraph's last sentence must stop calling the kind refusal "the `kind` refusal above it" since it is deleted. Replacement paragraph:

```ts
 * ── A REFERENCE ROW IS NOT A MEMBER, SO IT IS NOT REPLACEABLE ───────────────────────────────
 * F37's `source_avatar_id` / `source_image_id` mark a row that RE-SHOWS a photograph which already
 * exists elsewhere — an album row (F34 R2's share) or another chat row. `isOriginalPhoto()` is
 * inside every collection read's WHERE, so such a row is not in the Media folder at all and an id
 * for one is a stale link or a hand-typed claim. `getNinaMessageImage` above deliberately does NOT
 * filter references (it is the bubble/viewer read too), so the refusal has to be here — and
 * `updateNinaChatPhotoBlob`'s own `isOriginalPhoto()` clause is the second agreeing check.
 * Replacing a reference's bytes would change what one bubble shows while the photograph it re-shows
 * stayed as it was: two pictures where the operator asked for one, and no way to see the second one
 * from this screen.
 *
 * The old `kind !== 'generated'` refusal is GONE (the merge's whole point): one of HIS uploads is
 * now replaceable like any other original. `kind` is not written by the replace — the row keeps its
 * side, gains selfie-shaped bytes, and the describe pass below follows the side it still has.
```

**Change (b):** `editChatPhotoDescriptionAction` — delete the refusal at `:552-554` (same three lines, same sentence). The docstring's "THE TWO CHECKS" paragraph (`:524-532`) is rewritten:

```ts
 * ── THE TWO CHECKS, AGAIN AND FOR THE SAME REASON ─────────────────────────────────────────
 * `requireAdmin()` first, above any use of the argument. Then the SHAPE (Zod, which knows no user
 * id — *"A well-formed `Item` object can still refer to a row the caller does not own"*), then the
 * owner-scoped re-read, then a write whose own WHERE carries `user_id` AND `isOriginalPhoto()`.
 *
 * The write's WHERE used to carry `kind = 'generated'` and the action refused his uploads with the
 * same sentence Replace used. Both halves of that pair are gone with the surface merge: every
 * ORIGINAL row is describable now, and the clause that replaced the kind check — the reference
 * backstop — is the one that still matters. References keep their refusal below the fold of the
 * shared grammar: this action's write cannot reach one, and the sentence the operator sees for a
 * reference id here is the write's miss, reported as a not-in-the-collection.
 *
 * And there is no `isAdminChatPhotoPathname` call here, with nothing missing: that predicate binds
 * an UPLOADED BLOB to the session, and this action receives no blob, no pathname and no URL.
```

**Change (c):** `scheduleChatPhotoCaption` — the describe call at `:706-709` becomes side-aware, and its comment block (`:698-702`) is rewritten:

```ts
      /* ── HALF ONE: LOOK AT IT ──────────────────────────────────────────────────────────────
       * The subject follows the photograph's side: `photoSideOf('generated')` is 'hers', described
       * by the self witness (`NINA_SELF_DESCRIBE_SYSTEM_PROMPT` — the runner prompt would look for
       * a man who is not in the frame); one of HIS uploads is 'his', described by the runner
       * witness, because the subject of THAT photograph is him. `describeSubjectForSide` is the
       * pinned mapping; keeping it beside `photoSideOf` is what makes the two one edit apart. */
      let description = row.description
      if (description == null) {
        try {
          const result = await describeNinaImages(
            [{ blobUrl: row.blobUrl, pathname: row.pathname }],
            { subject: describeSubjectForSide(photoSideOf(row.kind)) },
          )
```

and the import block at the top of the file gains, in alphabetical position among the `@/lib/nina/*` imports:

```ts
import { describeSubjectForSide, photoSideOf } from '@/lib/nina/album'
```

**Impact:** Replace/describe-edit now work on `kind: 'upload'` rows; the after() pass describes his uploads with the runner witness and hers with the self witness. The reference-refusal sentences are byte-identical (invariant 5). `tests/nina.chatPhotoAdoption.test.ts`'s source-order assertion (`isChatPhotoReference(existing)` before `updateNinaChatPhotoBlob(`) still passes.

### Step 5: Lift the adoption guard; revalidate the survivor route
**File:** `lib/admin/ninaAlbumActions.ts`
**Change (a):** `setChatPhotoAsAvatarAction` — delete `:217-219`:

```ts
  if (row.kind !== 'generated') {
    return { ok: false, error: 'That one is his upload, not hers.' }
  }
```

Keep the reference refusal at `:220-225` and its exact sentence. The docstring's "THE GUARDS ARE REPLACE'S AND REMOVE'S, VERBATIM" paragraph (`:193-200`) is rewritten:

```ts
 * ── THE GUARDS ARE REPLACE'S AND REMOVE'S, VERBATIM ──────────────────────────────────────────
 * `getNinaMessageImage` deliberately does not filter (it is the bubble and viewer read too), so
 * this action enforces here what Replace and Remove enforce at their own seams. The old
 * `kind !== 'generated'` refusal is gone with the merge — one of HIS uploads is adoptable like any
 * other original, which is R1's literal ask ("bahkan image yang diupload user secara manual di
 * chat session bisa ... di jadiin profpic nina juga"). What still refuses, before any bytes move,
 * is a row carrying `source_avatar_id`/`source_image_id`: a re-SHOW of a photograph that lives
 * elsewhere, and adopting it would file a second copy of bytes the original still owns.
 * `isChatPhotoReference` stays private to `lib/admin/chatPhotoActions.ts` (a `'use server'` module
 * exports actions, not predicates), so the two-field test is spelled here; the actions' refusals
 * stay one rule by tests, not by imports.
```

**Change (b):** `:251-252`:

```ts
  revalidatePath(ADMIN_CHAT_PHOTOS_PATH)
  revalidatePath('/admin/nina')
```

becomes the single call (the constant now IS `/admin/nina`; calling both would be the same path twice):

```ts
  revalidatePath(ADMIN_CHAT_PHOTOS_PATH)
```

with the import of `ADMIN_CHAT_PHOTOS_PATH` added to the file's `@/lib/admin/chatPhotos` import (it currently imports `chatPhotoSetAvatarSchema` from `@/lib/admin/chatPhotoSchema`; add a sibling import — check the file's existing import block and place it alphabetically). If the file already imports from `@/lib/admin/chatPhotos`, extend that import instead.

**Impact:** adoption of an upload row proceeds to the byte copy; both the chat collection and the album refresh in one revalidate.

### Step 6: Move the client upload module into the explorer
**File:** create `components/admin/explorer/chatPhotoUpload.ts`; delete `components/admin/chatPhotoUpload.ts` (Step 10)
**Change:** the module moves verbatim — `ADMIN_CHAT_PHOTO_LONG_EDGE_PX`, `ADMIN_CHAT_PHOTO_QUALITY`, `UploadedChatPhoto`, `encodeChatPhotoJpeg`, `uploadChatPhoto` — with the imports unchanged (`@vercel/blob/client`, `findChatPhotoDuplicateAction`, the `chatPhotos` constants, `contentHashOf`, `newId`). Its `dedupe` default stays OFF; `MediaAdd` turns it on, `MediaControls` (Replace) never does. The two header docstrings move with it, with these content edits:
- References to `components/admin/explorer/thumbnail.ts` stay (they were already the precedent and are now siblings).
- The "WHY REPLACE MUST NEVER PASS IT" paragraph's mention of `/admin/photos` becomes "the Media folder".
- One paragraph is ADDED to the module header, carrying `chatPhotoModel.ts`'s load-bearing pathname docstring forward (that file dies in Step 10 and its rule must survive it):

```ts
 * ── THE PATHNAME IS BOUND HERE, AND NOWHERE IS IT PARSED ───────────────────────────────────
 * `adminChatPhotoPathname` is the ONLY producer of the chat-photo pathname shape, and nothing in
 * the explorer ever parses one: the row's stored pathname is never split, matched or inferred-from
 * — the served content type is the only authority for what the bytes are (`lib/nina/vision.ts`'s
 * `toDataUri` reads it back rather than guessing). The collection is mixed-container by design —
 * `selfie-<id>.png` from the worker, `selfie-<id>.jpg` from this module — and
 * `NINA_IMAGE_PATHNAME_RE` admits both, which is why the predicate below checks segment shapes and
 * not a single container.
```

**Code:** (complete file — logic is the moved module's, unchanged)

```ts
'use client'

import { upload } from '@vercel/blob/client'

import { findChatPhotoDuplicateAction } from '@/lib/admin/chatPhotoActions'
import { ADMIN_CHAT_PHOTO_CONTENT_TYPE, adminChatPhotoPathname } from '@/lib/admin/chatPhotos'
import { contentHashOf } from '@/lib/photos/contentHash'
import { newId } from '@/lib/id'

/**
 * A picked file -> an object in Blob at `nina/<userId>/selfie-<id>.jpg` -> the claims
 * `addChatPhotoAction` / `replaceChatPhotoAction` need. The Media view's upload path — Add and
 * Replace — migrated here from the purged `/admin/photos` surface (`components/admin/
 * chatPhotoUpload.ts`), unchanged in behavior and re-homed beside `thumbnail.ts`, its own cited
 * precedent for a client encode module.
 *
 * ── THE PATHNAME IS BOUND HERE, AND NOWHERE IS IT PARSED ───────────────────────────────────
 * `adminChatPhotoPathname` is the ONLY producer of the chat-photo pathname shape, and nothing in
 * the explorer ever parses one: the row's stored pathname is never split, matched or inferred-from
 * — the served content type is the only authority for what the bytes are (`lib/nina/vision.ts`'s
 * `toDataUri` reads it back rather than guessing). The collection is mixed-container by design —
 * `selfie-<id>.png` from the worker, `selfie-<id>.jpg` from this module — and
 * `NINA_IMAGE_PATHNAME_RE` admits both, which is why the pathname predicate checks segment shapes
 * and not a single container.
 *
 * ── THE TWO NUMBERS BELOW ARE THE CLIENT'S OWN ──────────────────────────────────────────────
 * `components/admin/explorer/thumbnail.ts:30-40`'s rule, applied: nothing on the server re-encodes
 * anything, so no other module has to agree with the long edge or the quality, and a constant is
 * shared when it is AGREED ON. Only three things cross the boundary and none of them is here:
 * `adminChatPhotoPathname`, `ADMIN_CHAT_PHOTO_CONTENT_TYPE`, and
 * `ADMIN_CHAT_PHOTO_MAX_UPLOAD_BYTES` (which Blob enforces at PUT time and the Zod schema re-checks
 * at action time). `tests/admin.chatPhotos.test.ts` asserts the long edge equals `NINA_IMAGE_HEIGHT`
 * so the "same size class as her generated photographs" claim below is checked rather than merely
 * intended.
 *
 * ── WHY THIS RE-ENCODES WHEN `UploadAvatar` REFUSED TO ─────────────────────────────────────
 * `UploadAvatar.tsx:26-33` is a ruling and it still holds where it was made: an avatar is
 * crop-zoomed 4x inside a circular frame, so a 768 px source would show her face at 192 px of real
 * detail. A chat photograph is never crop-zoomed — the bubble draws it small and `PhotoViewer`
 * serves the same blob at screen size — so re-encoding costs nothing visible and buys three things:
 * the `.jpg` container the accepted pathname requires, the size class the rest of this folder
 * already lives in (a generated selfie is 768x1024 PNG), and a bounded byte count in the one table
 * `/nina/about` downloads whole with no `next/image`.
 */

/**
 * 1024 px on the LONG edge — `NINA_IMAGE_HEIGHT`, so a hand-added photograph lands in the same size
 * class as every generated one rather than being the only 4000 px object in the folder. Never
 * upscales: a smaller source is passed through at its own size.
 */
export const ADMIN_CHAT_PHOTO_LONG_EDGE_PX = 1024

/**
 * 0.90 — higher than the runner composer's 0.75, because that number was chosen for what
 * `glm-4.6v` needs to resolve a face at 768 px on a phone upload, and this is a photograph the
 * operator chose deliberately and will look at full-screen.
 */
export const ADMIN_CHAT_PHOTO_QUALITY = 0.9

export interface UploadedChatPhoto {
  blobUrl: string
  pathname: string
  width: number
  height: number
  bytes: number
  /**
   * media-dedupe P3. sha-256 hex over the exact bytes this object holds — the bytes that were (or
   * would have been) PUT. A claim, in the same class as `width` and `bytes`: the action
   * format-validates it and the shared insert NULLs an invalid one (invariant 9).
   */
  contentHash: string
  /**
   * Non-null: an original row already holds these bytes, the PUT was SKIPPED, and `blobUrl` /
   * `pathname` are that row's (the dimensions and byte count are still this encode's — identical
   * bytes measure identically). `addChatPhotoAction` turns the add into a reference to this row.
   */
  duplicateOfId: string | null
}

/**
 * Decode once, scale on the canvas, encode JPEG.
 *
 * `bitmap.close()` in a `finally` is load-bearing and not tidiness — `thumbnail.ts:22-28` measured
 * it: a 4032x3024 JPEG is ~48 MB of decoded surface, and this runs once per picked file.
 *
 * Throws if the file does not decode or the browser has no `OffscreenCanvas`. The caller reports it
 * on the control; there is no silent fallback, because a photograph that could not be re-encoded
 * cannot be stored under the `.jpg` pathname the predicate requires.
 */
export async function encodeChatPhotoJpeg(
  file: File,
): Promise<{ blob: Blob; width: number; height: number }> {
  if (typeof OffscreenCanvas === 'undefined') {
    throw new Error('This browser cannot re-encode an image.')
  }

  const bitmap = await createImageBitmap(file)
  try {
    const longEdge = Math.max(bitmap.width, bitmap.height)
    const scale =
      longEdge > ADMIN_CHAT_PHOTO_LONG_EDGE_PX ? ADMIN_CHAT_PHOTO_LONG_EDGE_PX / longEdge : 1
    const width = Math.max(1, Math.round(bitmap.width * scale))
    const height = Math.max(1, Math.round(bitmap.height * scale))

    const canvas = new OffscreenCanvas(width, height)
    const context = canvas.getContext('2d')
    if (context == null) throw new Error('This browser cannot re-encode an image.')

    // A PNG with an alpha channel flattens to BLACK behind a JPEG encoder unless the ground is
    // painted first, which on a portrait means a black halo around her hair. White, not `--card`:
    // this is baked pixel data and it must not carry a theme. (`thumbnail.ts:106-108`.)
    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, width, height)
    context.drawImage(bitmap, 0, 0, width, height)

    const blob = await canvas.convertToBlob({
      type: ADMIN_CHAT_PHOTO_CONTENT_TYPE,
      quality: ADMIN_CHAT_PHOTO_QUALITY,
    })
    return { blob, width, height }
  } finally {
    bitmap.close()
  }
}

/**
 * Encode, then PUT straight to Blob through the admin handshake — unless the collection already
 * holds these bytes, in which case the PUT is SKIPPED and the claims describe the row that does
 * hold them.
 *
 * `adminChatPhotoPathname` is what the client may ASK for; Blob rewrites it with a random suffix and
 * the STORED pathname is whatever `upload` returned — 43 symbols in the id segment, not 12 — which
 * is why `lib/admin/chatPhotos.ts` carries a SECOND pattern, `ADMIN_CHAT_PHOTO_STORED_ID_RE`, and why
 * the actions re-validate the returned pathname rather than the requested one.
 *
 * `handleUploadUrl` is the ADMIN route and not `/api/upload`: that route mints tokens for a
 * merely-signed-in session and knows nothing about this pathname shape.
 *
 * ── media-dedupe P3: THE HASH IS OVER THE ENCODED BLOB, BEFORE THE PUT ───────────────────────
 * `encoded.blob` is the exact body of the PUT, so it is what gets hashed — invariant 4's "bytes
 * persis yang di-PUT". The re-encode is NOT deterministic across browsers and sessions, and that
 * is fine: identical hash still means identical stored bytes, which is the only claim the column
 * makes. The pre-check is one owner-scoped server action round trip; on a hit it saves the PUT, a
 * second Blob object, and the duplicate row that would have hidden the keeper from nothing.
 *
 * ── THE SECOND KEY, OVER THE PICK ITSELF (2026-09-10's measured defect) ──────────────────────
 * The encode hash above can never match a photograph that was downloaded out of the collection
 * and re-added: THIS re-encode produces bytes nobody has ever stored. So the picked file is
 * hashed too and both keys go into the one lookup — the pick's bytes ARE a stored row's object
 * byte for byte, and `content_hash` holds "sha-256 over a row's stored bytes" either way. On a
 * source-key hit the claims still describe THIS encode; that is correct — `addChatPhotoAction`
 * pins the keeper by id and writes the KEEPER's measured hash onto the reference row, so the
 * encode's claim never reaches the database as a byte description.
 *
 * ── WHY DEDUPE IS OPT-IN, AND WHY REPLACE MUST NEVER PASS IT ─────────────────────────────────
 * `opts.dedupe` defaults to OFF so every existing caller keeps today's behavior, and `MediaAdd` is
 * the only caller that turns it on. Replace must NOT: its contract is "swap the bytes behind THIS
 * row", and a deduped replace would point the row at another row's object and strip its provenance
 * to a reference — which the collection reads then hide, making the photograph the operator can
 * see vanish from the Media folder. Replace gets the hash for free (it claims it through
 * `chatPhotoReplaceSchema`) but never the skip.
 */
export async function uploadChatPhoto(
  userId: string,
  file: File,
  opts: { dedupe?: boolean } = {},
): Promise<UploadedChatPhoto> {
  const encoded = await encodeChatPhotoJpeg(file)
  const contentHash = await contentHashOf(encoded.blob)

  if (opts.dedupe === true) {
    /* Only a dedupe caller pays for the pick's own hash — the opt-out paths keep today's
     * behavior byte for byte. */
    const sourceHash = await contentHashOf(file).catch(() => null)
    const duplicate = await findChatPhotoDuplicateAction(contentHash, sourceHash ?? undefined)
    if (duplicate != null) {
      return {
        blobUrl: duplicate.blobUrl,
        pathname: duplicate.pathname,
        width: encoded.width,
        height: encoded.height,
        bytes: encoded.blob.size,
        contentHash,
        duplicateOfId: duplicate.id,
      }
    }
  }

  const result = await upload(adminChatPhotoPathname(userId, newId()), encoded.blob, {
    access: 'public',
    contentType: ADMIN_CHAT_PHOTO_CONTENT_TYPE,
    handleUploadUrl: '/api/admin/nina/upload',
    clientPayload: JSON.stringify({ contentType: ADMIN_CHAT_PHOTO_CONTENT_TYPE }),
  })
  return {
    blobUrl: result.url,
    pathname: result.pathname,
    width: encoded.width,
    height: encoded.height,
    bytes: encoded.blob.size,
    contentHash,
    duplicateOfId: null,
  }
}
```

**Impact:** none by itself; the old file still exists until Step 10.

### Step 7: `MediaAdd` — the Media view's "Add photos"
**File:** create `components/admin/explorer/MediaAdd.tsx`
**Change:** the migrated `ChatPhotoAdd`, same sequential loop and dedupe-on add, renamed, sized for the explorer toolbar, and with `chatPhotoModel.ts`'s orphan-semantics docstring content carried forward (that file dies in Step 10).
**Code:**

```tsx
'use client'

import { useRef, useState } from 'react'

import { PlusIcon } from '@/components/admin/photoIcons'
import { Button } from '@/components/ui'
import { addChatPhotoAction } from '@/lib/admin/chatPhotoActions'

import { uploadChatPhoto } from './chatPhotoUpload'

/**
 * The Media view's "Add photos" — *"add a new photo (so it is like nina generated them, but
 * actually it is manually added by user)"*. Migrated from the purged `/admin/photos` surface's
 * `ChatPhotoAdd`, unchanged in behavior: browser JPEG encode -> `findChatPhotoDuplicateAction`
 * pre-check -> PUT through `/api/admin/nina/upload` -> `addChatPhotoAction`.
 *
 * ── WHAT THE ACTION WRITES, CARRIED FORWARD FROM `chatPhotoModel.ts` ────────────────────────
 * Every row this flow creates hangs off a carrier message `addChatPhotoAction` mints
 * (`photoOnly: true`), because "add a photo" is still "add a message with a photo on it" — a NULL
 * `message_id` is the residue of a DELETE, never something a writer asks for, and a photograph the
 * operator adds on purpose has never been in a conversation. The ORPHAN is therefore still a
 * first-class member of the Media folder — every photograph whose conversation was deleted sits
 * here with `messageId: null`, listed and verbable like any other row — but this button never
 * makes one.
 *
 * ── `userId` COMES FROM THE SERVER PROP ─────────────────────────────────────────────────────
 * Threaded `app/admin/nina/page.tsx` -> `FileExplorer` -> here. It builds
 * `adminChatPhotoPathname(userId, id)`, and a user id that reaches a Blob pathname comes from
 * `requireAdmin()`, never from a client-side session read.
 *
 * ── SEQUENTIAL, NOT `Promise.all` ───────────────────────────────────────────────────────────
 * Next 16's Server Actions guide: *"Next.js dispatches Server Actions one at a time per client… do
 * not rely on `Promise.all` to parallelize Server Actions from the client."* So a multi-file pick is
 * a `for` loop, and the loop is honest about it — the `loading` dots are the whole progress display
 * and the per-file failures below are named in full.
 *
 * A per-file failure is not a batch failure: the loop records the message and continues, so one bad
 * frame does not lose the rest. Same rule as `useFolderUpload`'s lanes, one order of magnitude
 * simpler.
 *
 * No confirmation, here either — picking files IS the gesture.
 */
export function MediaAdd({ userId }: { userId: string }) {
  const [busy, setBusy] = useState(false)
  const [errors, setErrors] = useState<readonly string[]>([])
  const fileRef = useRef<HTMLInputElement>(null)

  const onPick = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? [])
    event.target.value = ''
    if (files.length === 0 || busy) return

    setBusy(true)
    setErrors([])

    const failures: string[] = []
    for (const [, file] of files.entries()) {
      try {
        const uploaded = await uploadChatPhoto(userId, file, { dedupe: true })
        const result = await addChatPhotoAction(uploaded)
        if (!result.ok) failures.push(`${file.name}: ${result.error ?? 'refused'}`)
      } catch (cause) {
        failures.push(`${file.name}: ${cause instanceof Error ? cause.message : 'upload failed'}`)
      }
    }

    setErrors(failures)
    setBusy(false)
  }

  return (
    <div className="flex shrink-0 flex-col items-end gap-1">
      {/*
       * Icon, no text — the words live in `aria-label`/`title`, the same rule the album toolbar's
       * icon-only buttons state (`AdminNavLinks.tsx`). The counter text is gone with the old
       * surface; the dots and the failure list carry it.
       */}
      <Button
        type="button"
        size="md"
        variant="secondary"
        aria-label="Add photos"
        title="Add photos"
        loading={busy}
        disabled={busy}
        onClick={() => fileRef.current?.click()}
      >
        <PlusIcon className="size-5" />
      </Button>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(event) => void onPick(event)}
      />

      {errors.length > 0 && (
        <ul className="text-[12px] font-medium text-red">
          {errors.map((message) => (
            <li key={message}>{message}</li>
          ))}
        </ul>
      )}
    </div>
  )
}
```

**Impact:** none by itself (Step 9 mounts it).

### Step 8: `MediaControls` — Replace and Remove, fragment idiom
**File:** create `components/admin/explorer/MediaControls.tsx`
**Change:** the migrated `ChatPhotoControls`, byte-for-byte behavior: Replace opens the picker and uploads without dedupe; Remove calls the carrier-aware action and reports its note upward because the pane unmounts under the sentence.
**Code:**

```tsx
'use client'

import { useRef, useState } from 'react'

import { SwapIcon, TrashIcon } from '@/components/admin/photoIcons'
import { Button } from '@/components/ui'
import { removeChatPhotoAction, replaceChatPhotoAction } from '@/lib/admin/chatPhotoActions'

import { uploadChatPhoto } from './chatPhotoUpload'

/**
 * Replace and Remove, for one row of the Media folder — the purged `/admin/photos` rail's
 * `ChatPhotoControls`, migrated with its fragment idiom intact: the two buttons are FRAGMENT
 * children so the selection pane's single icon row is their flex parent, the hidden input rides
 * along invisibly, and the inline messages carry `basis-full` so a flex-wrap parent pushes them
 * onto their own line under the icons instead of squeezing them between buttons.
 *
 * ── NO CONFIRMATION, AND THAT IS THE REQUIREMENT ────────────────────────────────────────────
 * *"i am the only one using this app, no need for all these bullshit confirmation"*. Remove calls
 * the action on click. Replace opens the file picker on click and uploads on `change`. There is no
 * dialog, no `window.confirm`, no typed string, no second button and no `confirming` state — the
 * `busy` state below exists only to stop a double-click firing two uploads, which is a different
 * thing entirely.
 *
 * ── BOTH VERBS WORK ON BOTH KINDS ───────────────────────────────────────────────────────────
 * The kind refusal the old rail's actions carried is lifted (`replaceChatPhotoAction`'s docstring
 * has the argument); the reference refusal is not — a row that re-shows a photograph living
 * elsewhere answers with its exact sentence, inline here.
 *
 * ── `note` GOES UP, NOT DOWN ────────────────────────────────────────────────────────────────
 * A removed photograph whose Blob object is still referenced by another row keeps its bytes in the
 * store, and the action says so. `ok` is true and the operation did what was asked; the operator
 * gets the sentence anyway. But this pane unmounts the instant `revalidatePath`'s RSC payload
 * arrives without the removed row, so a note rendered HERE would be destroyed before it could be
 * read. `onRemoved(note)` hands it to `FileExplorer`, which does not unmount. Replace does not
 * unmount anything, so its note stays local.
 *
 * ── NO `router.refresh()` ───────────────────────────────────────────────────────────────────
 * Next 16's Server Actions guide: *"When `updateTag`, `revalidatePath`, or `refresh` runs, Next.js
 * re-renders the current route server-side and includes a newly rendered RSC Payload in the action's
 * response, so the page reflects the change in the same roundtrip."* Every action here ends with
 * `revalidatePath(ADMIN_CHAT_PHOTOS_PATH)` — `/admin/nina` since the merge — so the grid updates
 * with no second request.
 */
export function MediaControls({
  userId,
  photoId,
  onRemoved,
}: {
  /** The signed-in admin's id, from the server prop chain — it builds the Blob pathname. */
  userId: string
  photoId: string
  /** Called on a successful remove, carrying the action's `note` (`null` when there is none). */
  onRemoved: (note: string | null) => void
}) {
  const [busy, setBusy] = useState<'idle' | 'replacing' | 'removing'>('idle')
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const onPick = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    // Clearing the input is what makes picking the SAME file twice fire `change` again.
    event.target.value = ''
    if (file == null || busy !== 'idle') return

    setBusy('replacing')
    setError(null)
    setNote(null)
    try {
      const uploaded = await uploadChatPhoto(userId, file)
      const result = await replaceChatPhotoAction({ id: photoId, ...uploaded })
      if (!result.ok) setError(result.error ?? 'That replacement did not stick.')
      else if (result.note != null) setNote(result.note)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'That upload failed.')
    } finally {
      setBusy('idle')
    }
  }

  const onRemove = async () => {
    if (busy !== 'idle') return
    setBusy('removing')
    setError(null)
    setNote(null)
    try {
      const result = await removeChatPhotoAction({ id: photoId })
      if (!result.ok) setError(result.error ?? 'That photo did not go away.')
      else onRemoved(result.note ?? null)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'That removal failed.')
    } finally {
      setBusy('idle')
    }
  }

  return (
    <>
      {/*
       * Icons, no text — the verbs live in `aria-label`/`title`, the destructive red stays on
       * the trash, and `loading` keeps each square box while its dots run. `w-11 px-0` squares the
       * `md` button: 44 px of tap target either way — the pane's own `RAIL_BUTTON` idiom.
       */}
      <Button
        type="button"
        size="md"
        variant="secondary"
        aria-label="Replace this photo"
        title="Replace this photo"
        className="w-11 px-0"
        loading={busy === 'replacing'}
        disabled={busy !== 'idle'}
        onClick={() => fileRef.current?.click()}
      >
        <SwapIcon className="size-4" />
      </Button>
      <Button
        type="button"
        size="md"
        variant="destructive"
        aria-label="Remove this photo"
        title="Remove this photo"
        className="w-11 px-0"
        loading={busy === 'removing'}
        disabled={busy !== 'idle'}
        onClick={() => void onRemove()}
      >
        <TrashIcon className="size-4" />
      </Button>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(event) => void onPick(event)}
      />

      {error !== null && <p className="basis-full text-[12px] font-medium text-red">{error}</p>}
      {note !== null && <p className="basis-full text-[12px] font-medium text-ink-3">{note}</p>}
    </>
  )
}
```

**Impact:** none by itself (Step 9 mounts it).

### Step 9: `MediaDescription` (the Phase 3 seam) and `MediaPane` — the media rail
**File:** create `components/admin/explorer/MediaDescription.tsx`
**Change:** the migrated `ChatPhotoDescription`, renamed and marked as the seam Phase 3 replaces. The old file dies in Step 10; the hand-edit verb must not die with it.
**Code:**

```tsx
'use client'

import { useState } from 'react'

import { CheckIcon } from '@/components/admin/photoIcons'
import { Button, CONTROL_CLASS } from '@/components/ui'
import { editChatPhotoDescriptionAction } from '@/lib/admin/chatPhotoActions'
import { ADMIN_CHAT_PHOTO_MAX_DESCRIPTION_CHARS } from '@/lib/admin/chatPhotos'
import { cn } from '@/lib/cn'

/**
 * **"What she can see in it", editable** — for a Media row. The purged `/admin/photos` surface's
 * `ChatPhotoDescription`, migrated so the hand-edit verb survives the purge: a vision pass that
 * failed, or a wrong paragraph, is correctable by the operator for EITHER kind of row (the kind
 * refusal in `editChatPhotoDescriptionAction` is lifted with the merge).
 *
 * SEAM — PHASE 3. This file is the interim describe control, not the destination: the plan set's
 * R3 replaces it — and the pane's eye toggle around it — with ONE unified describe panel serving
 * album rows and media rows alike (stored prose rendered and editable, plus an always-available
 * re-describe button). Replace this file wholesale in Phase 3; nothing else in the explorer needs
 * to change when that happens, which is the whole reason it is its own file.
 *
 * ── A SAVE BUTTON, NOT COMMIT-ON-BLUR, AND NOT A CONFIRMATION ─────────────────────────────
 * R1's ruling — *"no need for all these bullshit confirmation"* — is about a SECOND click on
 * something. This is the FIRST click of the write. Commit-on-blur is wrong for one 2000-character
 * paragraph: a stray blur would silently store a half-finished sentence into Nina's prompt.
 *
 * ── NO `<form>`, NO `router.refresh()` ────────────────────────────────────────────────────
 * The action ends with `revalidatePath(ADMIN_CHAT_PHOTOS_PATH)` (`/admin/nina` since the merge),
 * and Next 16 *"re-renders the current route server-side and includes a newly rendered RSC Payload
 * in the action's response"*, so the pane gets the saved text back in the same round trip.
 *
 * ── `draft === null` MEANS UNTOUCHED, WHICH IS WHY THERE IS NO EFFECT ─────────────────────
 * The box shows the SERVER's prose until the operator types, so when `after()`'s describe pass
 * lands while the pane is open, the next payload's text simply appears; and once he has typed,
 * nothing from the server can overwrite him. `MediaPane` keys this by `photo.id`, which covers the
 * other direction: switching tiles with unsaved text in the box.
 */
export function MediaDescription({
  photoId,
  description,
}: {
  photoId: string
  /** The row's stored prose, straight from the server. `null` is "not described yet". */
  description: string | null
}) {
  const stored = description ?? ''
  const [draft, setDraft] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)

  const text = draft ?? stored
  const dirty = draft !== null && draft !== stored
  /* Mirrors the schema's transform, which trims before it decides, so the label cannot lie. */
  const willClear = text.trim().length === 0

  const onSave = async () => {
    if (busy || !dirty) return
    setBusy(true)
    setError(null)
    setNote(null)
    try {
      const result = await editChatPhotoDescriptionAction({ id: photoId, description: text })
      if (!result.ok) {
        setError(result.error ?? 'That description did not stick.')
      } else {
        setNote(result.note ?? null)
        /* Back to "untouched", so the box follows the server again — and so the payload that
         * `revalidatePath` just produced, which carries exactly what was written, does not read as
         * an unsaved edit. */
        setDraft(null)
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'That save failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <textarea
        aria-label="What she can see in it"
        className={cn(CONTROL_CLASS, 'min-h-[104px] resize-y py-2 leading-relaxed')}
        value={text}
        maxLength={ADMIN_CHAT_PHOTO_MAX_DESCRIPTION_CHARS}
        disabled={busy}
        placeholder="Not described yet."
        onChange={(event) => {
          setDraft(event.target.value)
          setError(null)
          setNote(null)
        }}
      />

      <div className="mt-1.5 flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="md"
          variant="secondary"
          aria-label={
            willClear && description !== null ? 'Clear the description' : 'Save the description'
          }
          title={
            willClear && description !== null ? 'Clear the description' : 'Save the description'
          }
          className="w-11 px-0"
          loading={busy}
          disabled={busy || !dirty}
          onClick={() => void onSave()}
        >
          <CheckIcon className="size-4" />
        </Button>
        <span className="text-[11px] font-medium text-ink-3 tabular-nums">
          {text.length}/{ADMIN_CHAT_PHOTO_MAX_DESCRIPTION_CHARS}
        </span>
        {dirty && <span className="text-[11px] font-semibold text-accent">unsaved</span>}
      </div>

      {/*
       * The honest sentence about the ROW's state: after an Add or Replace this field is NULL for
       * the few seconds `scheduleChatPhotoCaption`'s `after()` pass takes, and then fills in on the
       * next load. A field that is merely empty would read as a permanent defect for a photograph
       * that is about to be fine.
       */}
      {description === null && !dirty && (
        <p className="mt-1.5 text-[12px] leading-relaxed font-medium text-ink-3">
          She cannot talk about this photo until it is described &mdash; reload in a moment if it
          was just added or replaced, or write it yourself.
        </p>
      )}

      {error !== null && <p className="mt-1.5 text-[12px] font-medium text-red">{error}</p>}
      {note !== null && <p className="mt-1.5 text-[12px] font-medium text-ink-3">{note}</p>}
    </div>
  )
}
```

**File:** create `components/admin/explorer/MediaPane.tsx`
**Code:**

```tsx
'use client'

import { useEffect, useRef, useState, useTransition } from 'react'

import { CircleFrame } from '@/components/admin/CircleFrame'
import { CropStudio } from '@/components/admin/CropStudio'
import { BrushIcon, DownloadIcon, EyeIcon, PersonFrameIcon } from '@/components/admin/photoIcons'
import { TOUCH_ICON } from '@/components/admin/touch'
import { Button } from '@/components/ui'
import { useSavePhoto, type SaveNotice } from '@/components/ui/useSavePhoto'
import { setChatPhotoAsAvatarAction } from '@/lib/admin/ninaAlbumActions'
import { cn } from '@/lib/cn'
import { isIdentityCrop, resolveCrop, type NinaCrop } from '@/lib/nina/crop'

import { MediaControls } from './MediaControls'
import { MediaDescription } from './MediaDescription'
import type { ExplorerPhoto, MediaExplorerPhoto } from './model'

/**
 * **One row of the Media folder, in full** — the purged `/admin/photos` rail (`ChatPhotoDetail` +
 * `ChatPhotoProfilePicture`), re-hosted as the explorer's media selection pane. Every verb the old
 * rail had is here, for BOTH kinds of row: the eye (hand-edit what she can see in it), the brush
 * (the generation prompt — see R2 below), the person (adopt as her profile picture, draft framing),
 * download, replace, remove.
 *
 * ── THE FRAMING HALF IS ADOPTION, AND THE DRAFT HAS NOWHERE TO PERSIST ──────────────────────
 * A media row has no crop columns (`nina_message_images` has none — no migration), so there is
 * nothing for a "Save framing" to write to. `CropStudio` + the two sanity circles render with a
 * DRAFT crop that starts at identity and resets to identity, and the draft's ONE consumer is
 * `setChatPhotoAsAvatarAction`, which receives `scale`/`x`/`y` at click time and copies the bytes
 * into a fresh `avatar-` object (`ChatPhotoProfilePicture`'s body, unchanged in mechanism). The
 * `worn` latch disables the button once the action answered `ok` — a live button under a face she
 * already wears would be a lie; a second click would not duplicate anything (the source-key lookup
 * sees to that), but the operator should not have to know that.
 *
 * ── R2: THE PROMPT AFFORDANCE EXISTS ONLY WHILE THE SIDECAR DOES ────────────────────────────
 * The old rail's brush toggle ALWAYS rendered and dimmed on `prompt == null` — the defect the user
 * named: *"kalo user udah replace satu photo, ... hapus tombol untuk ngeliat promptnya"*. Here the
 * toggle is INSIDE the `photo.prompt != null` conditional: a replaced row (`updateNinaChatPhotoBlob`
 * nulls `prompt` in the same statement as the bytes) and a hand-added row (`addChatPhotoAction`
 * writes `prompt: null`) show NO prompt affordance at all — no dim button, no empty block. A
 * never-replaced generated row still does. There is no dim state for prompt and no replaced-flag:
 * the column's NULL is the state.
 *
 * ── ORPHANS ARE FIRST-CLASS MEMBERS, CARRIED FORWARD FROM `chatPhotoModel.ts` ───────────────
 * `messageId` is nullable with `ON DELETE SET NULL`: deleting a chat session orphaned its
 * photographs instead of destroying them, and this folder is where they live now. An orphan has no
 * bubble to caption and no carrier to remove — `removeChatPhotoAction` takes the plain-row branch
 * for it — and nothing here treats `messageId` as "broken". It is displayed nowhere.
 *
 * ── NO OPTIMISTIC COPY, NO CLIENT SESSION ───────────────────────────────────────────────────
 * Every action ends in `revalidatePath('/admin/nina')` and the page is `force-dynamic`, so rows
 * arrive from the server on every render — `SelectionPane`'s docstring's "the one class of bug this
 * screen could plausibly have shipped" stays avoided. `userId` arrives as a prop from the server
 * page (`requireAdmin()`), because it builds a Blob pathname; it is never read from a client
 * session.
 *
 * ── REMOUNTING IS THE RESET ────────────────────────────────────────────────────────────────
 * The dispatcher keys this component by `photo.id` (`SelectionPane`), reproducing the old grid's
 * documented idiom: selecting a different tile remounts the pane — all toggles close, the draft
 * resets, the `worn` latch and the description box's unsaved marker reset with the selection.
 */

/** The pane's own wording for `useSavePhoto`'s two rung-out outcomes — the admin's English. */
const SAVE_NOTICE_TEXT: Record<SaveNotice, string> = {
  opened: 'Opened in a new tab — long-press it to save.',
  unavailable: 'Could not download it. Try again on a steadier connection.',
}

/** The squared icon button every rail control wears — `SelectionPane`'s idiom, spelled once. */
const RAIL_BUTTON = 'w-11 px-0'

/**
 * **Is this explorer row a Media row?** The one narrow over Phase 1's union: `ExplorerPhoto` is
 * `AlbumExplorerPhoto | MediaExplorerPhoto` discriminated by `origin` (`'album'` = an
 * `nina_avatars` row, `'media'` = an original `nina_message_images` row), so a type guard here —
 * not a `boolean` — is what lets the dispatcher's branches reach an arm's own fields with no cast.
 *
 * The single point of contact with Phase 1's model: every other consumer narrows through this
 * guard, so a change to the discriminant's spelling is an edit to this one function.
 */
export function isMediaRow(photo: ExplorerPhoto): photo is MediaExplorerPhoto {
  return photo.origin === 'media'
}

export function MediaPane({
  photo,
  userId,
  onClose,
  onRemoved,
}: {
  photo: MediaExplorerPhoto
  /** From the server prop chain (`requireAdmin()`); `MediaControls` builds a Blob pathname with it. */
  userId: string
  onClose: () => void
  /** Selection is dropped by the owner — the row is gone. Carries the remove action's `note`. */
  onRemoved: (note: string | null) => void
}) {
  /** The adoption draft. `null` means identity — a media row has no stored crop to fall back to. */
  const [draft, setDraft] = useState<NinaCrop | null>(null)
  const [worn, setWorn] = useState(false)
  const [showDescription, setShowDescription] = useState(false)
  const [showPrompt, setShowPrompt] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  /** The download, on `useSavePhoto`'s shared ladder — the album rail's same hook, not a third. */
  const saver = useSavePhoto(photo.url, 'nina')

  /** Keyed remount per selection (`SelectionPane`) resets everything that matters below. */
  const crop = draft ?? resolveCrop(null)
  const dirty = draft != null && !isIdentityCrop(draft)
  const natural = { width: photo.width, height: photo.height }

  /**
   * The pane scrolls itself into view when the selection changes — `SelectionPane.tsx`'s effect,
   * for the same reason: below `lg` this `<aside>` sits under a grid of up to 48 tiles, and a pane
   * the operator cannot see is indistinguishable from a broken button. `block: 'nearest'` is a
   * no-op when the element is already fully visible, so desktop is never touched.
   */
  const paneRef = useRef<HTMLElement | null>(null)
  useEffect(() => {
    paneRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [photo.id])

  /** Adoption consumes `AdminActionResult`; `MediaControls` consumes `ChatPhotoActionResult`. */
  const onAdopt = () => {
    if (pending || worn) return
    setError(null)
    startTransition(async () => {
      const result = await setChatPhotoAsAvatarAction({
        id: photo.id,
        scale: crop.scale,
        x: crop.x,
        y: crop.y,
      })
      if (!result.ok) {
        setError(result.error ?? 'That did not work.')
        return
      }
      setWorn(true)
      setDraft(null)
    })
  }

  /** The row-toggle look: 44 px of tap target, hover, and a dim state ONLY for the eye below. */
  const rowToggle = (dimmed: boolean) =>
    cn(
      TOUCH_ICON,
      '-my-1 rounded-field hover:bg-paper-2',
      dimmed ? 'text-ink-3 opacity-50' : 'text-ink-2',
    )

  return (
    <aside ref={paneRef} className="rounded-card border border-rule bg-card p-4 lg:p-5">
      <div className="mb-4 flex items-start justify-between gap-2">
        {/* The old rail's compact header: the timestamp, rather than Phase 1's derived
            `filename` (date + id) — the pane answers "when", and the grid tile's aria-label already
            answers "which". `pathname` is deliberately not displayed or parsed anywhere. */}
        <p className="truncate text-[15px] font-semibold text-ink">
          {new Date(photo.createdAt).toLocaleString()}
        </p>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close the details pane"
          className={cn(TOUCH_ICON, '-mt-2 -mr-2 shrink-0 text-[15px] font-semibold text-ink-3')}
        >
          &times;
        </button>
      </div>

      {/* The adoption framing half: same studio, same sanity circles at the sizes the app draws.
          Draft-only — the row keeps no crop columns. */}
      <CropStudio
        src={photo.url}
        natural={natural}
        crop={crop}
        onChange={setDraft}
        disabled={pending || worn}
      />
      <div className="mt-5 flex items-center gap-3">
        <CircleFrame src={photo.url} natural={natural} crop={crop} sizeClass="size-11" />
        <CircleFrame src={photo.url} natural={natural} crop={crop} sizeClass="size-7" />
        <p className="text-[11px] font-medium text-ink-3">
          44 px and 28 px &mdash; the chat header and the typing row, at the sizes they render.
        </p>
      </div>

      <dl className="mt-5 space-y-1 border-t border-rule pt-4 text-[12px] font-medium text-ink-3">
        <div className="flex gap-2">
          <dt>Source</dt>
          <dd className="text-ink-2">
            {photo.kind === 'upload' ? 'His upload, from the chat' : 'Generated in the chat'}
          </dd>
        </div>
        <div className="flex gap-2">
          <dt>Pixels</dt>
          <dd className="text-ink-2 tabular-nums">
            {photo.width ?? '?'} &times; {photo.height ?? '?'}
          </dd>
        </div>
        <div className="flex gap-2">
          <dt>Thumbnail</dt>
          <dd className="text-ink-2">None — the grid loads the original</dd>
        </div>
        <div className="flex gap-2">
          <dt>Nina</dt>
          <dd className="text-ink-2">
            {photo.description == null
              ? 'Cannot talk about this photo yet'
              : 'Can talk about this photo'}
          </dd>
        </div>
      </dl>

      {/*
       * THE ONE ICON ROW — the old rail's grammar, in the pane's idiom. Left of the hairline: what
       * the photograph IS to her (the eye; the brush ONLY while a prompt exists — R2). Right of it:
       * what the operator can DO — make it hers, download a copy, replace its bytes, remove it,
       * destructive last. Every control names itself with `aria-label`/`title`; MediaControls's
       * fragment drops Replace and Remove straight into this flex row, and its inline messages wrap
       * beneath (basis-full).
       */}
      <div className="mt-5 flex flex-wrap items-center gap-1 border-t border-rule pt-4">
        <button
          type="button"
          onClick={() => setShowDescription((value) => !value)}
          aria-expanded={showDescription}
          aria-label="What she can see in it"
          title="What she can see in it"
          className={cn(rowToggle(photo.description == null), '-ml-2')}
        >
          <EyeIcon className="size-4" />
        </button>

        {/* R2. The conditional IS the feature: no prompt, no button — not a dimmed one. The
            expanded block re-checks, so a selection swap under a reused pane cannot print a stale
            sidecar. */}
        {photo.prompt != null && (
          <button
            type="button"
            onClick={() => setShowPrompt((value) => !value)}
            aria-expanded={showPrompt}
            aria-label="What she was asked to draw"
            title="What she was asked to draw"
            className={rowToggle(false)}
          >
            <BrushIcon className="size-4" />
          </button>
        )}

        <span aria-hidden="true" className="mx-1 h-6 w-px bg-rule" />

        <Button
          size="md"
          className={RAIL_BUTTON}
          loading={pending}
          disabled={pending || worn}
          aria-label={worn ? "She's wearing this one now" : 'Set as her profile picture'}
          title={worn ? "She's wearing this one now" : 'Set as her profile picture'}
          onClick={onAdopt}
        >
          <PersonFrameIcon className="size-4" />
        </Button>

        <Button
          size="md"
          variant="secondary"
          className={RAIL_BUTTON}
          loading={saver.busy}
          aria-label="Download this photo"
          title="Download this photo"
          onPointerDown={saver.warm}
          onFocus={saver.warm}
          onClick={saver.save}
        >
          <DownloadIcon className="size-4" />
        </Button>

        <MediaControls userId={userId} photoId={photo.id} onRemoved={onRemoved} />

        {saver.notice !== null && (
          <p className="basis-full text-[12px] font-medium text-ink-3">
            {SAVE_NOTICE_TEXT[saver.notice]}
          </p>
        )}
        {error !== null && (
          <p role="alert" className="basis-full text-[13px] font-semibold text-warn">
            {error}
          </p>
        )}
      </div>

      {/* THE EXPANDED BLOCKS, in button order — only the asked-for one takes the room. */}
      {showDescription && (
        <div className="mt-3">
          <MediaDescription key={photo.id} photoId={photo.id} description={photo.description} />
        </div>
      )}
      {showPrompt && photo.prompt != null && (
        <p className="mt-3 text-[12px] leading-relaxed font-medium break-words text-ink-2">
          {photo.prompt}
        </p>
      )}
    </aside>
  )
}
```

**Impact:** none by itself (Steps 9b/9c mount them). Both `ChatPhotoActionResult` (`MediaControls`) and `AdminActionResult` (`MediaPane`'s adoption) are consumed.

### Step 9b: `SelectionPane` becomes the dispatcher
**File:** `components/admin/explorer/SelectionPane.tsx`
**Change:** three edits, album controls untouched.

Edit 1 — the import block gains:

```tsx
import { setChatPhotoAsAvatarAction } from '@/lib/admin/ninaAlbumActions' // already present; unchanged
```
(no new action import) and from the siblings:

```tsx
import { MediaPane, isMediaRow } from './MediaPane'
```

Edit 2 — the existing exported component is renamed and made private, its props gain `userId` and its `onRemoved` widens, and its album Remove button's callback is re-wrapped. The header of the file gains a short paragraph:

```tsx
/**
 * ── TWO KINDS OF ROW, ONE PANE MOUNT ────────────────────────────────────────────────────────
 * Since the image-collection merge this mount serves the album's rows AND the Media view's rows.
 * The exported `SelectionPane` is a two-line dispatcher: an album row keeps everything below,
 * byte for byte; a media row renders `MediaPane`, whose verbs are the conversation photograph's
 * (replace, remove, adopt-with-draft, download, hand-edit description, prompt view). The split is
 * Phase 2's D-P2-4: the album rail's framing semantics (a STORED crop, Save/Reset) and the media
 * rail's (a DRAFT crop, adopt) share a studio but not a contract, and one branching component
 * would have threaded `photo.kind` through every line of both.
 */
```

and the exported entry point becomes:

```tsx
export function SelectionPane({
  photo,
  userId,
  shareOrigin,
  onClose,
  onRemoved,
}: {
  photo: ExplorerPhoto
  /** From the server page (`requireAdmin()`). `MediaPane` builds a Blob pathname with it. */
  userId: string
  /** `shareOrigin()`'s output, threaded from the page. Never `window.location`. Phase 7 / R2. */
  shareOrigin: string
  onClose: () => void
  /**
   * Selection has to be dropped by the owner — the row is gone. Carries the remove action's `note`
   * (`null` for an album remove), which `FileExplorer` holds because this pane unmounts before the
   * sentence could be read.
   */
  onRemoved: (note: string | null) => void
}) {
  if (isMediaRow(photo)) {
    return (
      <MediaPane
        key={photo.id}
        photo={photo}
        userId={userId}
        onClose={onClose}
        onRemoved={onRemoved}
      />
    )
  }
  return (
    <AlbumSelectionPane
      photo={photo}
      shareOrigin={shareOrigin}
      onClose={onClose}
      onRemoved={() => onRemoved(null)}
    />
  )
}
```

The existing body keeps its name changed to `function AlbumSelectionPane({ photo, shareOrigin, onClose, onRemoved }: { photo: AlbumExplorerPhoto; shareOrigin: string; onClose: () => void; onRemoved: () => void })` — **nothing else in its body changes** (the framing pair, ShareToNinaItem, the describe-when-null button, download, remove all stay exactly as Phase 1 left them; the narrowed arm type is what keeps its album-only reads compiling). Its `ExplorerPhoto` import widens to `import type { AlbumExplorerPhoto, ExplorerPhoto } from './model'`.

Edit 3 — `AlbumSelectionPane`'s `run()` helper and buttons are untouched; only the type annotation of the `run` helper's `onOk` usage stays as-is. (No third edit inside the body is needed because `AlbumSelectionPane`'s `onRemoved` remains `() => void`; the dispatcher absorbs the note.)

**Impact:** album rows behave identically; the pane can now render for media rows with full verbs. Phase 1 shipped a read-only media arm as an early return inside this file — DELETE that arm in this step; `MediaPane` supersedes it (the arm's "THE MEDIA ARM" comment names the seams Phase 2 takes over).

### Step 9c: `FileExplorer` — media-view wiring
**File:** `components/admin/FileExplorer.tsx`
**Change:** five anchor edits on the file as Phase 1 left it. Phase 1 already delivered the view
plumbing this phase builds on — the component's props are `userId, folders, photos, page, view:
ExplorerView, mediaCount: number, shareOrigin: string`, `hrefForMediaView` sits beside
`hrefForFolder`, the drop handlers early-return in the media view, the Add buttons render
album-only, and `PhotoMoveBar` is already origin-guarded — so **no prop changes here**; the edits
below thread `userId`/`onRemoved` deeper and mount the migrated Add flow.

Edit 1 — imports only. The props destructure and the `view: ExplorerView` / `mediaCount: number`
props are Phase 1's, byte for byte — no edit. The sibling imports gain:

```tsx
import { MediaAdd } from './explorer/MediaAdd'
```

Edit 2 — state and the drop-handler split. After `const [treeOpen, setTreeOpen] = useState(false)`:

```tsx
  /** One sentence about the last media removal that kept a shared blob. Held HERE — the pane
   * unmounts under it — and rendered under the toolbar until the next removal replaces it. */
  const [notice, setNotice] = useState<string | null>(null)

  const isMediaView = view === 'media'
```

and the four drag handlers are collected so the content pane can opt out as one object (added after `onDrop`'s definition):

```tsx
  /* The album is a drop target; the Media view is not — its upload path is the picker + the
   * browser encode (`MediaAdd`), and a folder walk has nothing to walk onto. */
  const dropHandlers = isMediaView
    ? {}
    : {
        onDragEnter,
        onDragOver,
        onDragLeave,
        onDrop,
      }
```

Edit 3 — the toolbar's control cluster. Phase 1's cluster reads: the view-conditional count span
(`N in Media` / `N in this folder` — keep it exactly), the two hidden inputs, the drawer button,
then `{view === 'album' && (<>…Add photos / Add a folder…</>)}`. The two hidden inputs move under
`!isMediaView`, and `MediaAdd` replaces the album-add conditional in the media view (the drawer
button stays — the tree is how you reach Media in the first place):

```tsx
        <div className="flex flex-wrap items-center gap-2 lg:contents">
          <span className="shrink-0 text-[12px] font-semibold text-ink-3 tabular-nums">
            {view === 'media'
              ? `${page.total} in ${NINA_MEDIA_NODE_LABEL}`
              : `${page.total} in this folder`}
          </span>

          {!isMediaView && (
            <>
              <input
                ref={folderInputRef}
                type="file"
                multiple
                accept="image/*"
                className="hidden"
                onChange={onPickFolder}
              />
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="image/*"
                className="hidden"
                onChange={onPickFolder}
              />
            </>
          )}

          <Button
            size="md"
            variant="secondary"
            className="lg:hidden"
            aria-expanded={treeOpen}
            aria-controls="admin-folder-rail"
            aria-label={treeOpen ? 'Hide the folders' : 'Show the folders'}
            onClick={() => setTreeOpen(!treeOpen)}
          >
            <PanelLeftIcon className="size-5" />
          </Button>

          {isMediaView ? (
            /* The Media view's "Add photos": the conversation-collection upload flow (browser
             * JPEG encode -> dedupe pre-check -> PUT -> addChatPhotoAction). No folders, no
             * drop-walk — a conversation photograph is not filed. */
            <MediaAdd userId={userId} />
          ) : (
            <>
              <Button
                size="md"
                variant="secondary"
                aria-label="Add photos"
                onClick={() => fileInputRef.current?.click()}
              >
                <ImagePlusIcon className="size-5" />
              </Button>
              <Button
                size="md"
                aria-label="Add a folder"
                onClick={() => folderInputRef.current?.click()}
              >
                <FolderPlusIcon className="size-5" />
              </Button>
            </>
          )}
        </div>
```

(This supersedes Phase 1's `{view === 'album' && (…)}` guard on the Add buttons — the ternary
replaces it, and the count span's `NINA_MEDIA_NODE_LABEL` arm is Phase 1's own copy, kept.)

Edit 4 — the content pane: drop handlers become a spread, `PhotoMoveBar` and `UploadQueue` render album-only, and the removal notice gets a line. The notice renders above the pane box, after the toolbar's closing `</div>`:

```tsx
      {notice !== null && <p className="mb-4 text-[13px] font-medium text-ink-2">{notice}</p>}
```

and the pane box:

```tsx
        <div className="min-w-0" {...dropHandlers}>
```

Phase 1's current block passes `selectedId={selected != null && selected.origin === 'album' ? selected.id : null}` — equivalent at runtime (a media view never holds an album selection), so replace it with the cheaper view-level guard:

```tsx
            {/* PHASE 6. Move / remove for the selection — an album verb set (folder move, album
                delete). A media row's Remove is carrier-aware and lives in its pane. */}
            {!isMediaView && (
              <PhotoMoveBar
                selectedId={selected?.id ?? null}
                folders={allFolders}
                folder={folder}
                currentId={photos.find((photo) => photo.isCurrent)?.id ?? null}
                onDone={() => setSelectedId(null)}
              />
            )}
```

```tsx
          {!isMediaView && (
            <UploadQueue
              phase={upload.phase}
              items={upload.items}
              report={upload.report}
              error={upload.error}
              onDismiss={upload.dismiss}
            />
          )}
```

(`useFolderUpload` itself stays called unconditionally — it is hook-shaped and inert unless started.)

Edit 5 — the pane mount:

```tsx
        {selected != null && (
          <SelectionPane
            photo={selected}
            userId={userId}
            shareOrigin={shareOrigin}
            onClose={() => setSelectedId(null)}
            onRemoved={(note) => {
              setSelectedId(null)
              setNotice(note)
            }}
          />
        )}
```

**Impact:** the Media view reads exactly as Phase 1 shipped it, gains its own Add control, no drop ring, no album move-bar, no album queue, and a pane with every verb. The album view is byte-identical in behavior.

### Step 10: The purge
**Files deleted (with where each load-bearing piece went):**

| Deleted | Survives where |
|---|---|
| `app/admin/photos/page.tsx` | The Media view (`?view=media`, Phase 1) is the collection's only read; `readOne`/`readPage` already exist on `/admin/nina`. |
| `components/admin/ChatPhotoGrid.tsx` | Grid + pager = Phase 1's `PhotoGrid` media tiles + `hrefForPage`; the unmount-surviving removal note = `FileExplorer`'s `notice` (Step 9c). `CHAT_PHOTO_COLLECTION_LABEL` dies — the tree node's label (Phase 1) is the collection's name. |
| `components/admin/ChatPhotoDetail.tsx` | `MediaPane.tsx` (Step 9) — compact header, one icon row, expanded blocks, scroll-into-view. |
| `components/admin/ChatPhotoControls.tsx` | `MediaControls.tsx` (Step 8) — fragment idiom verbatim. |
| `components/admin/ChatPhotoAdd.tsx` | `MediaAdd.tsx` (Step 7). |
| `components/admin/ChatPhotoDescription.tsx` | `MediaDescription.tsx` (Step 9) — SEAM: Phase 3 replaces. |
| `components/admin/ChatPhotoProfilePicture.tsx` | `MediaPane`'s adoption half (Step 9) — CropStudio draft, sanity circles, worn latch. |
| `components/admin/chatPhotoUpload.ts` | `components/admin/explorer/chatPhotoUpload.ts` (Step 6), incl. the pathname-never-parsed docstring. |
| `components/admin/chatPhotoModel.ts` | Fields were absorbed into `ExplorerPhoto` by Phase 1; the `messageId` orphan-semantics docstring lives on `MediaPane`'s header (Step 9) and the pathname rule on the moved upload module (Step 6). |
| `tests/admin.chatPhotosRail.test.ts` | Superseded by `tests/admin.mediaPane.test.ts` (Step 14). |

```bash
git rm app/admin/photos/page.tsx \
  components/admin/ChatPhotoGrid.tsx \
  components/admin/ChatPhotoDetail.tsx \
  components/admin/ChatPhotoControls.tsx \
  components/admin/ChatPhotoAdd.tsx \
  components/admin/ChatPhotoDescription.tsx \
  components/admin/ChatPhotoProfilePicture.tsx \
  components/admin/chatPhotoUpload.ts \
  components/admin/chatPhotoModel.ts \
  tests/admin.chatPhotosRail.test.ts
```

### Step 11: Nav entry and dashboard card
**File:** `components/admin/AdminNavLinks.tsx`
**Change:** the LINKS entry at `:107` is deleted; the array comment "The seven routes" becomes "The six routes"; `grid-cols-7` becomes `grid-cols-6` at `:163` (the `px-[7px]` dial and `h-14` are untouched — the owner's dial is a class, not an arithmetic dependency; six wider cells re-center on the same row); the private `CameraIcon` (`:320-337`) is deleted. The docstrings that explained the deleted entry as part of a trio are corrected:

- `:71-75` (personality position) — the sentence "It sits between the album and the chat photos because it is the third thing about HER" becomes: "It sits between the album and the image-generation tab: the two configuration surfaces — who she is, and how she is photographed — are neighbours, and the routes above and below them are the things you look AT."
- `:83-93` (image-generation placement + short label) — the sentences "Note that it is adjacent to 'Photos', and that the two are not the same word by accident … a wand for making, a camera for what was" become: "Its `short` is 'Images', and the photo-ish routes left in the bar are this one and the album — a wand for making, a stack for what is kept."
- `:100-106` (the conversation note over the photos entry) is deleted with the entry.
- `:249-252` (`ImagesIcon`'s docstring, "the anchor of the photo-ish trio — this glyph, `WandSparklesIcon` and `CameraIcon`") — **do NOT rewrite here.** Its final wording names the routes by their post-rename labels, so it is Phase 4's edit (reconciled: one owner per region). Between this phase and Phase 4 the docstring names a deleted `CameraIcon` in a comment — stale prose, not a broken build, and no test reads it.

**File:** `app/admin/page.tsx`
**Change:** remove `countNinaChatPhotos` from the `@/lib/nina/queries` import (`:14-20`), from the `Promise.all` (`:44`, `:54-60` — including the comment block above it), the `chatPhotoCount` binding, and the whole "Chat photos" `Card` (`:117-132`). The destructure becomes:

```tsx
  const [albumCount, current, me, tuning, imagePrefs] = await Promise.all([
```

with the `countNinaChatPhotos(userId)` member and its comment paragraph removed (the remaining five members and their comments unchanged). The module docstring's "admin-memory-and-chat-photos phase 2 the chat-photos one" is a historical record — leave it.

**Impact:** `tests/admin.shell.test.ts`'s exact href array and all counts must move with this (Step 13).

### Step 12: The image-gen revalidate comment
**File:** `lib/admin/imageGenActions.ts:296-304`
**Change:** runtime behavior is unchanged (the constant re-pointed in Step 1 is the fix); the comment must stop naming a route that no longer exists:

```ts
  /*
   * R12's "automatically", made literal. The photograph is written by the selfie finisher on a
   * background invocation that has no idea where the collection is rendered, so its cached render
   * would keep showing the old collection until something invalidated it. Doing it HERE — once, on
   * the poll that first sees `status='ok'` — costs nothing and means the operator finds the
   * picture already there. `ADMIN_CHAT_PHOTOS_PATH` has named `/admin/nina` since the collection
   * moved into the explorer's Media view.
   */
  if (imageTestVerdict(job) === 'allowed') revalidatePath(ADMIN_CHAT_PHOTOS_PATH)
```

### Step 13: Test adaptations
**File:** `tests/admin.shell.test.ts`
**Change:** the nav suite shrinks from seven cells to six:

- `:111-119` — the expected array loses `'/admin/photos'`:

```ts
    expect(hrefs).toEqual([
      '/admin',
      '/admin/nina',
      '/admin/personality',
      '/admin/image-generation',
      '/admin/memory',
      '/admin/shortcuts',
    ])
```

- `:141` — `expect(shorts).toHaveLength(7)` -> `toHaveLength(6)`; the comment's "seven entries, one per cell" -> "six entries, one per cell".
- `:162` — `expect(svgTags, ...).toHaveLength(7)` -> `toHaveLength(6)`.
- `:182` — `expect(new Set(glyphs).size, ...).toBe(7)` -> `.toBe(6)`. The trio comment above it (`:172-180`) still names the camera in its prose — **leave the comment to Phase 4**, whose rewrite carries the post-rename labels (reconciled: one owner per region; no assertion reads the comment).
- `:276-293` — the `it('is one row of exactly seven cells')` title and its comment become "six cells"; the arithmetic assertions are read, not written (`grid-cols-(\d+)` is matched from source, so `grid-cols-6` satisfies them unchanged; `(414 - rowPad) / 6 = 66.7px` still passes the 44pt floor at `:317`).
- `:128-135` (the row's docstring arithmetic mentioning 414/7) is reworded to the six-cell figure — it narrates current geometry, not history, so it must not lie.

**File:** `tests/admin.chatPhotos.test.ts`
**Change:**
1. `:3` — the import moves: `import { ADMIN_CHAT_PHOTO_LONG_EDGE_PX } from '@/components/admin/explorer/chatPhotoUpload'`.
2. `:377` — the hoisting comment's module path mentions update to the explorer path.
3. `:795` — `expect(revalidatePath).toHaveBeenCalledWith('/admin/photos')` -> `'/admin/nina'`.
4. `:836-847` — the refusal test inverts into the lifted-guard positive:

```ts
  it('describes one of HIS uploads — the kind refusal is lifted (R1)', async () => {
    // `getNinaMessageImage` does not filter on `kind`, and nothing above the write does either
    // now: every ORIGINAL row is describable, which is the merge's whole point. The write's own
    // `isOriginalPhoto()` clause is what still stops a reference.
    getNinaMessageImage.mockResolvedValue({ ...imageRow, kind: 'upload' })
    const result = await actions.editChatPhotoDescriptionAction({
      id: IMAGE_ID,
      description: PROSE,
    })

    expect(updateNinaChatPhotoDescription).toHaveBeenCalledWith(USER, IMAGE_ID, PROSE)
    expect(revalidatePath).toHaveBeenCalledWith('/admin/nina')
    expect(result).toEqual({ ok: true, id: IMAGE_ID })
  })
```

5. In `describe('replaceChatPhotoAction schedules the same captioner')`, add the two lifted-guard cases:

```ts
  it('replaces one of HIS uploads — the row, not its kind, is the address (R1)', async () => {
    getNinaMessageImage.mockResolvedValue({ ...imageRow, kind: 'upload' })

    const result = await actions.replaceChatPhotoAction({ id: IMAGE_ID, ...goodBlob })

    expect(result).toEqual({ ok: true, id: IMAGE_ID })
    expect(updateNinaChatPhotoBlob).toHaveBeenCalledWith(
      USER,
      IMAGE_ID,
      expect.objectContaining({ blobUrl: storedUrl, pathname: storedPathname }),
    )
  })

  it('describes HIS upload with the runner witness — subject follows the side', async () => {
    getNinaMessageImage.mockResolvedValue({ ...imageRow, kind: 'upload' })

    await actions.replaceChatPhotoAction({ id: IMAGE_ID, ...goodBlob })
    await runTheAfterCallback()

    expect(describeNinaImages).toHaveBeenCalledWith(expect.anything(), { subject: 'runner' })
  })
```

(The existing `'is the captioner and not the old describe-only pass'` case keeps asserting `{ subject: 'self' }` for the `kind: 'generated'` fixture — that is the other half of the mapping.)

**File:** `tests/nina.chatPhotoDescription.test.ts`
**Change:** the WHERE assertions move from the kind clause to the reference backstop, and a second describe pins `updateNinaChatPhotoBlob`'s widened WHERE (the statement whose clause changed most):

```ts
describe('updateNinaChatPhotoDescription', () => {
  it('is owner-scoped, id-scoped and ORIGINAL-only, in ONE statement', async () => {
    fake.enqueue([])
    await queries.updateNinaChatPhotoDescription(USER, ID, 'she is underwater, fins on')

    const { sql, params } = fake.only()
    expect(sql).toContain('update "nina_message_images"')
    expect(sql).toContain('"user_id" = $')
    expect(sql).toContain('"id" = $')
    // The clause that replaced `kind = 'generated'`: every original of BOTH kinds is describable
    // since the merge, and a REFERENCE row is what the WHERE still refuses — the second of the
    // two agreeing checks (`tests/nina.photoRefs.test.ts` pins the same pair on the listings).
    expect(sql).toContain('"source_avatar_id" is null')
    expect(sql).toContain('"source_image_id" is null')
    expect(sql).not.toContain('"kind" = $')
    expect(params).toContain(USER)
    expect(params).toContain(ID)
  })

  // ... the existing `touches description and nothing else`, `carries a NULL`, and
  // `returns null when no row matched` cases are UNCHANGED — the first one's `not.toContain`
  // list keeps passing; its comment's "/admin/photos" mention becomes "the Media view".
})

describe('updateNinaChatPhotoBlob — the replace write (D-P2-1)', () => {
  it('is original-only and kind-blind: a replaced upload keeps its kind', async () => {
    fake.enqueue([])
    await queries.updateNinaChatPhotoBlob(USER, ID, {
      blobUrl: 'https://x.example/nina/u1/selfie-n.jpg',
      pathname: 'nina/u1/selfie-n.jpg',
      width: 768,
      height: 1024,
      bytes: 240_000,
      contentHash: null,
    })

    const { sql } = fake.only()
    expect(sql).toContain('update "nina_message_images"')
    expect(sql).toContain('"source_avatar_id" is null')
    expect(sql).toContain('"source_image_id" is null')
    // The old kind clause is gone: one of HIS uploads is replaceable now, and the statement
    // never writes `kind` — the row keeps its side with new bytes.
    expect(sql).not.toContain('"kind" = $')
    expect(sql).not.toContain('set "kind"')
  })

  it('nulls description, prompt and the provenance pair in the same statement', async () => {
    fake.enqueue([])
    await queries.updateNinaChatPhotoBlob(USER, ID, {
      blobUrl: 'https://x.example/nina/u1/selfie-n.jpg',
      pathname: 'nina/u1/selfie-n.jpg',
      width: 768,
      height: 1024,
      bytes: 240_000,
    })

    const { sql } = fake.only()
    expect(sql).toContain('set "description" = $')
    expect(sql).toContain('set "prompt" = $')
    expect(sql).toContain('set "source_avatar_id" = $')
    expect(sql).toContain('set "source_image_id" = $')
    // And the R2 mechanic this phase's UI leans on: the sidecar dies with the bytes it
    // produced, so the prompt affordance has nothing to render.
  })
})
```

The file header's comment (`:5-28`) — "the whole difference between a write reachable from `/admin/photos`'s set and … the whole table" — is reworded to the post-merge fact: the difference now is "a write reachable from the Media view's set (every ORIGINAL row, both kinds) and a write reachable from the whole table (references included) — `isOriginalPhoto()` is the clause that holds the line." The header's stale "`/admin/photos`" mentions (`:10`, `:59`, `:73`) become "the Media view".

**File:** `tests/admin.chatPhotoAdoption.test.ts`
**Change:**
1. `:298` — `expect(revalidatePath).toHaveBeenCalledWith('/admin/photos')` -> `'/admin/nina'` (and `:299`'s second assertion is now the same path twice — replace the pair with the single assertion and the comment "one revalidate: the constant and the page route are the same path since the merge").
2. `:17-20` — the header's "then the `kind = 'generated'` and reference-row refusals" becomes "then the reference-row refusal (the kind refusal is lifted with the merge — his uploads are adoptable now)".
3. `:375-383` — the refusal test inverts into the positive:

```ts
  it('adopts one of HIS uploads — the kind refusal is lifted (R1)', async () => {
    // Same fresh-adoption sequence as the generated fixture, one column different: kind. The
    // copy is kind-blind — `avatarExtFor` reads the container, nothing reads the side.
    fake.enqueue([imageRow({ kind: 'upload' })]) // getNinaMessageImage
    fake.enqueue([]) // getNinaAvatarBySourceKey — not adopted yet
    fake.enqueue([avatarRow()]) // insertNinaAvatars RETURNING
    fake.enqueue([{ id: AVATAR_ID }]) // updateNinaAvatarCrop RETURNING
    fake.enqueue([avatarRow()]) // setCurrentNinaAvatar's pre-read

    const result = await actions.setChatPhotoAsAvatarAction(FRAMED)

    expect(result).toEqual({ ok: true, id: AVATAR_ID })
    expect(put).toHaveBeenCalled()
    expect(fetchMock).toHaveBeenCalled()
  })
```

4. `:385-393` (reference refusal) — unchanged, byte for byte.

**File:** `tests/nina.photoRefs.test.ts`
**Change:** delete the `it('listNinaChatPhotos — BOTH of its statements carry it, so the pager cannot lie')` block (`:83-94`) — the function is retired. The `countNinaChatPhotos` it stays; its title's "/admin's hub card counts what /admin/photos lists" becomes "the reference picker's chat-side total still skips a reference". The describe's header note ("Two call sites for three statements") is reworded to "the listing read and the picker count".

**File:** `lib/nina/album.test.ts`
**Change:** add beside the `photoSideOf` describe (`:107`):

```ts
describe('describeSubjectForSide', () => {
  it("sends the self witness for a photograph of Nina ('hers')", () => {
    expect(describeSubjectForSide(photoSideOf('generated'))).toBe('self')
  })

  it("sends the runner witness for one of his uploads ('his')", () => {
    expect(describeSubjectForSide(photoSideOf('upload'))).toBe('runner')
  })

  it('defaults an unknown kind to his, and his to the runner witness', () => {
    // `photoSideOf`'s documented default, and the reason it points the safe way: describing a
    // stranger's photograph with the SELF prompt would put her name on it.
    expect(describeSubjectForSide(photoSideOf('something-else'))).toBe('runner')
  })
})
```

with `describeSubjectForSide` added to the file's existing `@/lib/nina/album`-relative import list (`:4`).

### Step 14: The new structural suite for the migrated rail
**File:** create `tests/admin.mediaPane.test.ts`
**Change:** the retired rail suite's replacement — structural, `readRepoCode` (comments stripped), pinning the decisions a later edit could quietly reverse, above all R2's conditional.
**Code:**

```ts
import { describe, expect, it } from 'vitest'

import { readRepoCode, repoFileExists } from './support/importGraph'

/**
 * **The Media rail, migrated — read as structure, because the suite has no DOM.**
 *
 * The purged `/admin/photos` rail's suite (`tests/admin.chatPhotosRail.test.ts`) retired with its
 * components; the verbs live in the explorer now, and the decisions a later edit could quietly
 * reverse are pinned the same way the old suite pinned theirs: read the REAL source with comments
 * stripped and assert properties of it.
 *
 * R2 is the load-bearing one: the old brush toggle ALWAYS rendered and dimmed on `prompt == null`,
 * which is the exact defect the user named — *"kalo user udah replace satu photo, ... hapus tombol
 * untuk ngeliat promptnya"*. The toggle must live INSIDE the `prompt != null` conditional, and no
 * dim state may exist for prompt.
 */

const PANE = 'components/admin/explorer/MediaPane.tsx'
const CONTROLS = 'components/admin/explorer/MediaControls.tsx'
const ADD = 'components/admin/explorer/MediaAdd.tsx'
const DESCRIPTION = 'components/admin/explorer/MediaDescription.tsx'
const PANE_DISPATCH = 'components/admin/explorer/SelectionPane.tsx'

describe('the media rail exists where the verbs migrated to', () => {
  it('has all four migrated modules', () => {
    for (const file of [PANE, CONTROLS, ADD, DESCRIPTION]) {
      expect(repoFileExists(file), `${file} is missing`).toBe(true)
    }
  })

  it('SelectionPane dispatches on isMediaRow and keys the media pane by photo id', () => {
    const source = readRepoCode(PANE_DISPATCH)
    expect(source).toContain('isMediaRow(photo)')
    expect(source).toMatch(/<MediaPane\s+key=\{photo\.id\}/)
    // The album controls are untouched: the dispatcher, not the album body, absorbed the note.
    expect(source).toMatch(/onRemoved: \(note: string \| null\) => void/)
  })

  it('MediaControls keeps the fragment idiom: Replace and Remove are labelled icons', () => {
    const source = readRepoCode(CONTROLS)
    expect(source).toContain('aria-label="Replace this photo"')
    expect(source).toContain('aria-label="Remove this photo"')
    expect(source).toContain('SwapIcon')
    expect(source).toContain('TrashIcon')
    expect(source).toMatch(/basis-full/)
    expect(source).not.toContain('flex-col')
  })

  it('MediaAdd is the dedupe-on add flow, and its userId comes from a prop', () => {
    const source = readRepoCode(ADD)
    expect(source).toContain('uploadChatPhoto(userId, file, { dedupe: true })')
    expect(source).toContain('addChatPhotoAction')
    expect(source).toContain('userId: string')
    // A user id that reaches a Blob pathname never comes from a client session.
    expect(source).not.toContain('useSession')
  })

  it('MediaDescription is the marked Phase 3 seam and drives the hand-edit action', () => {
    const source = readRepoCode(DESCRIPTION)
    expect(source).toContain('editChatPhotoDescriptionAction')
    expect(source).toContain('SEAM')
  })
})

describe('R2 — the prompt affordance exists only while the sidecar does', () => {
  it('the brush toggle is INSIDE the prompt != null conditional', () => {
    const source = readRepoCode(PANE)
    expect(source).toMatch(/photo\.prompt != null && \(\s*\n\s*<button/)
  })

  it('no dim state exists for prompt — the old defect spelled as an absence', () => {
    const source = readRepoCode(PANE)
    // The old rail dimmed on `prompt == null` while always rendering. That expression must not
    // exist anywhere in the pane; the eye's dim (description == null) is the only one.
    expect(source).not.toMatch(/prompt == null/)
    expect(source).toMatch(/description == null/)
  })

  it('the expanded prompt block re-checks the sidecar', () => {
    const source = readRepoCode(PANE)
    expect(source).toMatch(/showPrompt && photo\.prompt != null/)
  })
})

describe('the purge is total', () => {
  it('no ChatPhoto* component remains in components/admin', () => {
    for (const file of [
      'components/admin/ChatPhotoGrid.tsx',
      'components/admin/ChatPhotoDetail.tsx',
      'components/admin/ChatPhotoControls.tsx',
      'components/admin/ChatPhotoAdd.tsx',
      'components/admin/ChatPhotoDescription.tsx',
      'components/admin/ChatPhotoProfilePicture.tsx',
      'components/admin/chatPhotoUpload.ts',
      'components/admin/chatPhotoModel.ts',
      'app/admin/photos/page.tsx',
      'tests/admin.chatPhotosRail.test.ts',
    ]) {
      expect(repoFileExists(file), `${file} survived the purge`).toBe(false)
    }
  })

  it('the media flow never parses a stored pathname', () => {
    // Carried forward from chatPhotoModel.ts's load-bearing rule: the pathname is displayed
    // (nowhere, in the explorer) and never parsed. Comments are stripped by readRepoCode, so
    // this is a statement about CODE.
    for (const file of [PANE, CONTROLS, ADD]) {
      const source = readRepoCode(file)
      expect(source).not.toMatch(/pathname\.(split|slice|match|replace|startsWith|endsWith)/)
    }
  })
})
```

**Phase-3 note on this suite (reconciled):** two of these pins are interim by design and Phase 3
retires them with the seam — the `DESCRIPTION` file-exists/seam `it` (it deletes
`MediaDescription.tsx`) and `MediaPane`'s `description == null` positive (it removes the eye toggle
and the `<dl>` null-ness row the dim was pinned to). Phase 3 updates this suite in the same step;
nothing here changes at the end of THIS phase.

---

## Verification

**Build:** `npm run typecheck` (runs `next typegen` first — this is the command that notices the deleted route's `PageProps<'/admin/photos'>` leaving the generated types; per AGENTS.md, a bare `tsc --noEmit` is not).
**Lint:** `npm run lint`.
**Tests:** `npm run test` — specifically green: `tests/admin.shell.test.ts`, `tests/admin.mediaPane.test.ts`, `tests/admin.chatPhotos.test.ts`, `tests/nina.chatPhotoDescription.test.ts`, `tests/admin.chatPhotoAdoption.test.ts`, `tests/admin.chatPhotoDedupe.test.ts` (untouched, must stay green — the planner is untouched), `tests/nina.photoRefs.test.ts`, `tests/nina.imageprefs.test.ts` (the picker pin), `tests/nina.chatPhotoAdoption.test.ts` (reference-refusal source assertions — the lifted file keeps `isChatPhotoReference(existing)` ordered before `updateNinaChatPhotoBlob(`), `lib/nina/album.test.ts`, `tests/admin.photoReference.test.ts` (invariant 9 — untouched and green).
**Fresh-worktree note:** this worktree needs `.env.local` and `npm install` before any of the above (`lib/env.ts` validates at load) — per this repo's own memory note.
**Manual check:** `/admin/photos` answers 404; `/admin/nina?view=media` lists both kinds; on a never-replaced generated row the brush opens the prompt, and after Replace the brush is gone entirely (no dim button); on one of his uploads Replace, hand-edit (eye) and adopt all proceed; Remove on the last photo of a photo-only bubble deletes the bubble (check `/nina` chat), on a shared blob prints "The file is still used elsewhere…" under the pane row.

**Exit criteria:** every verb from the old rail works in the Media folder for both kinds; `/admin/photos`, its nav entry and its dashboard card are gone; no `ChatPhoto*` component remains; `tests/admin.shell.test.ts` updated and green; the whole suite, lint and typecheck pass; no migration was written; the reference-refusal sentences are byte-identical; runner-facing modules are untouched (`git diff --name-only` shows none of `lib/nina/chatphotos.ts`, `lib/nina/albumActions.ts`, `lib/nina/gateway.ts`, `components/nina/*`).

## Handoffs

- **Phase 3 (owns the describe panel):** `components/admin/explorer/MediaDescription.tsx` is a marked SEAM — Phase 3 deletes it, re-works `MediaPane` (eye toggle + `showDescription` out, `<PhotoDescription>` with the media closures in), deletes the `<dl>` Nina null-ness row in BOTH arms, removes the describe button from `AlbumSelectionPane`, and updates `tests/admin.mediaPane.test.ts` (the `DESCRIPTION` pin and the `description == null` positive go with the seam) — phase-3.md now spells all of this; nothing left to negotiate. `describeNinaAvatarAction`'s subject fix and the `gateway.ts` window fix are Phase 3's own plan. The side-aware subject for the ADMIN describe pass already landed here (Step 4) via `describeSubjectForSide` (`lib/nina/album.ts`) — it is the set's ONE side→subject mapping; Phase 3 imports it and mints no second helper.
- **Phase 4 (owns renames + comment sweep):** the opportunistic comment mentions this phase left standing because they are not adjacent to changed code: `components/admin/photoIcons.tsx` header (names the deleted consumers), `components/admin/PhotoReferencePicker.tsx` (`:26`, `:36`, `:46`, `:102`, `:133`), `components/admin/photoReferenceModel.ts` (`:6`, `:21`, `:103`), `lib/nina/queries.ts` residual mentions (`:228`, `:983`, `:1499`, `:2134`, `:2144`, `:3984`-area), `lib/nina/imagetest.ts`, `lib/nina/imageprefs.ts`, `lib/db/schema.ts` (`:891`, `:1069`, `:1123`), `components/nina/SessionRow.tsx:82`, `components/nina/NinaAboutScreen.tsx:316`, `lib/nina/album.ts` (the page-size docstring's mention — the constant STAYS in `lib/nina/album.ts`; Phase 1 kept it there and only read it, so you own only prose). `PhotoGrid`'s media empty state needs nothing from you: Phase 1 already grew the `view` prop and wrote the view-aware copy — Phase 4's restyle keeps both byte for byte.
- **Reconciler note (resolved — nothing left to align at run time):** this plan was written without sight of Phase 1's, quoting base-tree blocks. The two declared points of contact are now pinned to Phase 1's delivered spellings IN this file: `isMediaRow` is a `photo is MediaExplorerPhoto` guard over `origin` (Step 9), and `FileExplorer` needs no prop edit — `view: ExplorerView` + `mediaCount: number` already exist (Step 9c Edit 1). `SelectionPane`'s post-Phase-2 shape (dispatcher + private `AlbumSelectionPane`) is what Phase 3 was rewritten against. `lib/nina/queries.ts` Step 3(c)'s docstring bullets still say "apply wherever Phase 1 wrote them" — Phase 1's media-read bullet is additive and needs no merge beyond the rewording already specified.

## Rollback

`git revert` of this phase's commit(s) on `feature/image-collection`. The phase is the first behavior-loss point of the set (Phase 1 left `/admin/photos` live and green), so reverting 2 alone restores the old surface only alongside reverting 1 — the read half's `?view=media` arm would render a pane without verbs until 1 is reverted too. No data backout is needed: no migration, and every blob-writing flow (replace, add, adopt, release-on-delete) pre-exists this set with its own rules. The lifted guards revert to generated-only writes; rows replaced while this phase was live keep their new bytes and their NULL `prompt`/`description` — the `after()` pass re-describes them, which is the same recovery a replace has always had.
