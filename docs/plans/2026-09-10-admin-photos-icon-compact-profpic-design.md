# Design — `/admin/photos`: icon-only controls, compact detail rail, chat photo → profpic

Date: 2026-09-10. Status: validated with the operator (R1-R3 below are verbatim, translated).

## Requirements (the operator's words)

1. *"replace semuat tombol pada halaman ini menjadi icon tanpa text"* — every button on
   `/admin/photos` becomes an icon without text.
2. *"buat tampilan lebih compact saat admin klik satu foto"* — a more compact detail rail:
   - 2a: hide the long file name (below the timestamp).
   - 2b: "what she can see in it" becomes one icon button; clicking expands the text content.
   - 2c: "what she was asked to draw" becomes one icon button; clicking expands the text content.
3. Above the Replace / Remove row, add an icon button (set as profile photo); clicking expands the
   framing selection and "Set as her profile picture" exactly as Nina's album page already has —
   so Chat-photos images can become her profpic too.

## Decisions taken with the operator

- **Adoption copies bytes** into a new Blob object (`nina/<userId>/avatar-<newId>.<ext>`) rather
  than sharing the chat photo's object. Reason: the album-side deletes
  (`deleteNinaAvatarAction`, `reapAvatarBlobs`) call `del` with no reference check — a shared
  object would break the chat photo the day the album row is deleted. Cost: one duplicate object
  per adoption, and the adopted row also appears in `/admin/nina` (root folder), where its framing
  can be re-tuned later.
- **The metadata `<dl>` (Whose / Pixels / Size / Message / Position / Row) is removed entirely**
  from the rail, not collapsed. `ChatPhoto` the model keeps every field — the rail just stops
  rendering them; `width`/`height` are still consumed by `CropStudio`/`CircleFrame`.

## A. Icon-only controls

Inline SVG glyphs drawn in the repo's existing idiom (`AdminNavLinks`, `FileExplorer` — no icon
library), ~16 px glyph, `stroke="currentColor"`, `aria-hidden` on the path, with `aria-label` +
`title` carrying the words. Every control keeps its 44 px tap target (`TOUCH_ICON` / `Button`).

| Control | File | Icon |
| --- | --- | --- |
| Add photo | `ChatPhotoAdd` | plus |
| Replace | `ChatPhotoControls` | swap / cycle arrows |
| Remove | `ChatPhotoControls` | trash |
| Save / Clear description | `ChatPhotoDescription` | check (`title` switches Save ↔ Clear) |
| Close rail | `ChatPhotoDetail` | ✕ (already icon-only) |
| Pager Newer / Older | `ChatPhotoGrid` | chevron ‹ › only, still `<Link rel=…>` |

The multi-file progress counter ("Adding 1/3…") is replaced by the button's `loading` state; the
per-file error list stays text (a message, not a button label). The description char counter and
"unsaved" marker are status text inside the expanded block, not button labels — they stay.

## B. Compact detail rail (`ChatPhotoDetail`)

- Header: timestamp + close ✕. The pathname line under the timestamp is gone (2a).
- The `<dl>` is gone (decision above).
- **2b** — the "What she can see in it" section is one icon button (eye). Dimmed when
  `description == null`. Clicking expands the exact block that exists today:
  `ChatPhotoDescription` (editable textarea + Save icon + counter + the `after()` honesty hint).
  Nothing about editability changes; it is only hidden until expanded.
- **2c** — "What she was asked to draw" is one icon button (brush). Dimmed when `prompt == null`.
  Clicking expands the read-only prompt paragraph (or its "No sidecar on this row." sentence).
- Both sections start collapsed; expansion state resets when the selection changes — the two
  sections are mounted keyed by `photo.id`, the same mechanism that already protects
  `ChatPhotoDescription`'s draft.

## C. Set as profile photo — chat photo → album adoption

One icon button (person in circle) **above** the Replace/Remove row. Clicking expands a panel that
mirrors `SelectionPane`'s framing half: `CropStudio` (unmodified), the two `CircleFrame` sanity
circles at 44 px / 28 px with their caption, a **Reset framing** secondary control, and
**"Set as her profile picture"** (primary, full width, `loading` while pending).

- The crop is client draft state (`draft` / identity `stored` / `dirty` triple, as SelectionPane).
  There is deliberately no "Save framing": a chat row has no crop columns to persist to, so the
  draft's only consumer is the adoption action, which receives `scale`/`x`/`y` at click time.
- After success the button disables and reports she is wearing it now. A second click costs no
  second copy either: the adopted row is written with `source_key = 'chat-photo:<imageId>'`
  (refinement over the validated draft, landed during TDD), so `getNinaAvatarBySourceKey` finds
  the first adoption before any bytes move and the action just re-currents it — the
  `nina_avatars_user_source_key_unq` index is the backstop for the race the lookup cannot close.
  This is the same "idempotence is a constraint" doctrine the folder upload argues for.

### The action: `setChatPhotoAsAvatarAction` (in `lib/admin/ninaAlbumActions.ts`)

Lives there, not in `chatPhotoActions.ts`, because it reuses that module's private
`scheduleDescribe` — a sync function cannot be exported from a `'use server'` module, and the
describe-after-promotion behaviour is the album's (`setCurrentNinaAvatarAction`'s) contract.

1. `requireAdmin()` first.
2. Zod: `chatPhotoSetAvatarSchema` in `lib/admin/chatPhotoSchema.ts` — `{ id (12-symbol),
   scale, x, y }`, crop fields optional (absent = identity).
3. Owner-scoped re-read: `getNinaMessageImage(userId, id)`; refuse `kind !== 'generated'` and
   reference rows (`source_avatar_id`/`source_image_id` non-null — the same two guards
   `replaceChatPhotoAction`/`removeChatPhotoAction` enforce; re-stated inline with a comment
   rather than exported, so the chat actions file keeps its single spelling).
4. **Bytes first, rows second**: `fetch(row.blobUrl)` → `put()` to
   `adminAvatarPathname(userId, newId(), ext)` where `ext` is taken from the source pathname's
   suffix (`.jpg` | `.png`; both are `AdminAvatarExt`s), `addRandomSuffix: true`, matching content
   type. A fetch/put failure leaves nothing written (at worst an orphan object, the reaper's
   domain — the same exposure every upload already has).
5. `insertNinaAvatars` — `source: 'admin'`, `folder: ''`, `filename: null`, `sourceKey: null`,
   `thumbUrl`/`thumbPathname: null`, `width`/`height`/`bytes` from the chat row, **`description`
   seeded from the chat row's description** — same bytes the vision model already described, so no
   second vendor call and no token-floor exposure; when null, `scheduleDescribe` fills it after
   the response.
6. Crop: `clampCrop` server-side against the row's real dimensions (the
   `saveNinaAvatarCropAction` guarantee), written via `updateNinaAvatarCrop`; identity → three
   NULLs via `cropForWrite` (one code path with Reset).
7. `setCurrentNinaAvatar(userId, avatarId)` — un-currents the old face, re-arms `announced_at`,
   so she comments on the change exactly as on the album path (RU-17).
8. `revalidatePath` **both** `/admin/photos` and `/admin/nina`; return `{ ok: true, id: avatarId }`.

## D. Tests

- Schema: `chatPhotoSetAvatarSchema` accepts/rejects (id shape, crop bounds) —
  `tests/admin.chatPhotos.test.ts` pattern.
- Action guards + SQL shapes with `fakeDb` (the `tests/nina.chatPhotoAdoption.test.ts` idiom):
  the insert is owner-scoped with `source: 'admin'` and the seeded description; the crop UPDATE
  clamps server-side; `setCurrentNinaAvatar`'s two-step ordering; the `kind`/reference refusals
  fire before any blob call.
- Source-structure assertions (the `readRepoCode` idiom): every icon-only control on the page
  carries `aria-label`; the removed pathname/`<dl>` render nowhere in `ChatPhotoDetail`.

## Non-goals

- No migration: no schema change anywhere (invariant from the R2 plan set holds).
- No `next/image` reintroduction; the grid/rail still load originals.
- The runner-facing surfaces (`photoSideOf`, `chatViewerPhotos`, `galleryPhotos`, bubble renderer)
  are untouched.
- `update-nina-profpic` / the committed face anchor are untouched.
