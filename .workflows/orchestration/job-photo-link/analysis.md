# Code Analysis: Detail foto — icon row + full-screen photo access from a job

**Type:** Feature Update
**Date:** 2026-09-10 10:40 WIB
**Session ID:** 20260910-104042
**Plan:** `JOB_PHOTO_LINK_PLAN.md` (2 phase(s))
**Worktree:** `/home/miftah/.worktrees/run-insights/job-photo-link` — branch `feature/job-photo-link` (base `origin/main` @ `ac9cf03`; local main equals origin/main and carries only another set's `.workflows` residue, so origin/main is the tree the plans are written against)

---

## User Input

### Original User Request

> you know, in Detail foto , kita bisa klik tombol "Buka chat-nya" . ubah tombol ini menjadi icon tanpa text.
> lalu , pada row yang sama, tambahkan tombol icon yang mengklik ini akan redirect user untuk melihat full screen foto (kita sudah punya ini, misalnya pas klik salah satu foto di Media) , di halaman itu ada juga tombol untuk send to most recent chat session, atau send to a new chat session.
> jadi, selama admin tidak menghapus foto ini di halaman admin, maka user selalu bisa mengakses foto nya dari laman Detail foto.
> walaupun foto sudah di Replace (admin bisa mereplace generated image) . tetap make sure user bisa mengklik foto yang baru dari Detail foto

### User-Provided Context

None beyond the prose. "Detail foto" is the `/nina/jobs/[id]` screen (`ScreenHeader title="Detail foto"`). "Media" is the section of that name on `/nina/about`. "halaman admin" is `/admin/photos`.

### User-Provided Files

None.

### Requirement IDs

| ID | What the user asked for |
|---|---|
| R1 | On Detail foto, the "Buka chat-nya" button becomes an icon-only button (no text). |
| R2 | On the same row, a second icon button that redirects to the existing full-screen photo view — the one opening when a Media photo is tapped — which already carries the send-to-most-recent-chat and send-to-new-chat buttons. |
| R3 | As long as the admin has not deleted the photo on the admin page, the user can always reach the photo from the Detail foto page. |
| R4 | Even when the admin has replaced a generated image, the Detail foto page must open the NEW photo. |

---

## Detailed Requirements Understanding

**Problem/Requirement Statement**: `/nina/jobs/[id]` currently renders its jump affordance as a
full-width labelled `ButtonLink` ("Buka chat-nya") when the triggering bubble resolves, and a
dashed sentence otherwise. The row gains a second navigation target — the job's photograph, opened
in `/nina/about`'s existing full-screen `PhotoViewer` overlay via its `?photo=` URL state — and the
first target is compressed to an icon. Both controls must be facts resolved on the server (this
codebase's standing pattern for that page), and the photo link must keep working across admin
Replace (same row, new bytes) and for photos older than the Media grid's 200-photo window.

**Success Criteria**:
- Jump affordance renders as an icon-only control with the words as its accessible name, same
  destinations, same refusal sentences.
- A second icon-only control beside it navigates to `/nina/about?photo=chat.<imageId>`, opening the
  full-screen viewer with the attach strip (recent/new sends) — the existing controls, no new ones.
- The photo control is drawn exactly when the job's photo row still exists (owner-scoped), and is
  absent when it does not (admin Remove, runner message delete) — never a dead link.
- The viewer opens for ANY existing photo id in the link, including one outside the 200-newest
  gallery window, without changing what the Media grid shows.
- After an admin Replace, the same link opens the new bytes.

**Key Considerations**:
- Two different `?photo=` grammars already exist in the app and must stay separate: `/nina?photo=avatar:<id>|image:<id>` (composer attach, `lib/nina/attach.ts`) and `/nina/about?photo=album.<id>|chat.<id>` (viewer state, codec currently private to `NinaAboutScreen.tsx`). The new link writes the SECOND grammar.
- `nina_avatars` carries no job id, so an avatar job cannot name its album row.
- `nina_message_images.message_id` is `ON DELETE SET NULL`: a removed session orphans its photos (alive in Media, but the job→photo chain is lost).
- `description` on a `nina_message_images` row is `glm-4.6v`'s private prose (invariant 5) — it must not cross into client props.
- No schema migration in this set; the join is index-supported by existing indexes for per-user reads.

---

## Analysis Scope

### Explicitly Mentioned Files

- (none marked `@`; inferred targets below)

### Discovered Related Files

- `app/nina/jobs/[id]/page.tsx` — the Detail foto server page; resolves `jump` via `planJobJump`, renders `NinaJobDetail`
- `components/nina/NinaJobDetail.tsx` — renders the "Buka chat-nya" `ButtonLink` (line 113-115) or the refusal sentence
- `lib/nina/jobview.ts` — pure job vocabulary: `planJobJump`, `NINA_JOB_JUMP_NOTE`, `ninaJumpHref`, `NINA_JOBS_HREF`
- `lib/nina/imagejobs.ts` — server-only job reads/writes; `getNinaImageJobDetail` (owner-scoped, filters `deletedAt`)
- `lib/nina/queries.ts` — the data layer; `getNinaMessageImage` (line 1738, "the `?photo=` deep link" read, never filters references), `listNinaMessageImages` (line 1712, filters `isOriginalPhoto`), `getNinaMessageImagesForMessages`, `listNinaSelfieJobIdsSince` (line 4051 — the images→job direction already exists; job→image does not)
- `app/nina/about/page.tsx` — server page; currently takes NO props (no `searchParams`); three index reads
- `components/nina/NinaAboutScreen.tsx` — Media section, viewer-open state derived from `?photo=`, attach strip with the two icon sends (recent/new), private codec `PHOTO_PARAM`/`encodePhoto`/`decodePhoto` (lines 61-77), Lucide glyph convention documented at lines 558-575
- `components/ui/PhotoViewer.tsx` — the full-screen swipeable viewer (shared; not to be modified)
- `components/nina/NinaPhotoGrid.tsx` — the 3-column grid (album + Media)
- `lib/nina/album.ts` — pure album/gallery vocabulary: `galleryPhotos`, `NINA_GALLERY_LIMIT` (200), `photoSideOf`, `NINA_SIDE_LABEL`
- `lib/nina/albumActions.ts` — `attachNinaPhotoToChat` (the strip's server action, targets `'recent' | 'new'`), `deleteNinaChatPhoto`
- `lib/nina/attach.ts` — the OTHER `?photo=` grammar (`kind:id`, colon)
- `lib/admin/chatPhotoActions.ts` — `replaceChatPhotoAction` / `removeChatPhotoAction` / `addChatPhotoAction`
- `lib/nina/imagerun.ts` — in-platform finish path (message `turnId: jobId` at line 247 + `kind: 'generated'` image at line 261-264)
- `scripts/nina-image-worker.ts` — worker finish path (`finishSelfie` line 768: raw-SQL inserts with `turn_id = jobId`; `finishAvatar` line 838: `nina_avatars` row, no job id written)
- `lib/db/schema.ts` — `nina_turns` (job rows), `nina_messages.turn_id` (nullable text, line ~101 of the table block, **no index on it**), `nina_message_images` (`message_id` nullable, `nina_message_images_user_created_idx`)
- `components/ui/Button.tsx` — `Button` / `ButtonLink` accept `aria-label` + children glyphs; `md` = 44px floor
- `components/nina/SessionRow.tsx` — icon-button precedent (glyph `aria-hidden`, words as `aria-label`)
- `tests/nina.jobview.test.ts`, `tests/nina.galleryDelete.test.ts`, `tests/nina.photoRefs.test.ts` — the three test shapes (pure, mocked-edge, source-claim via `readRepoCode`)

---

## Current Dataflow

### Entry Point: `/nina/jobs/[id]` (Detail foto)

**Location:** `app/nina/jobs/[id]/page.tsx:48`
**Trigger:** navigation (link from `/nina/jobs`, `/nina/about`'s job section)
**Input Schema:** `params: { id: string }` (awaited promise, Next 16)
**Validation:** `requireUserId()` → `isValidId(id)` else `notFound()` → `getNinaImageJobDetail(userId, id)`; `null` (not his / never existed / hidden `deleted_at`) → `notFound()` identically
**Next Step:** `jobStage({status, errorCode})` → `planJobJump(...)` → `<NinaJobDetail … jump={…} />`

### Processing Chain

1. **Function:** `getNinaImageJobDetail(userId, jobId)`
   - **Location:** `lib/nina/imagejobs.ts:969`
   - **Input / Transform / Output:** owner-scoped read of the `nina_turns` row (`kind='image'`, `deleted_at IS NULL`) projected by `toJobRecord` (args jsonb → nullable fields) + a second owner-scoped read `getNinaMessagesByIds(userId, [replyToId])` → `replySessionId`
   - **Calls:** nothing else; the photo is NOT part of this projection — a `nina_image_jobs`→image chain does not exist anywhere yet

2. **Function:** `planJobJump({purpose, replyToId, replySessionId, sessionParam})`
   - **Location:** `lib/nina/jobview.ts:422`
   - **Transform:** `avatar` (purpose avatar, no reply target) / `no-message` (no reply target) / `gone` (target did not resolve) / `ready` with `href = /nina?s=<sessionId>&jump=<messageId>`
   - **Output:** discriminated union the client renders without re-deriving

3. **Component:** `NinaJobDetail` — the jump row
   - **Location:** `components/nina/NinaJobDetail.tsx:111-121`
   - **Transform:** `jump.kind === 'ready'` → `<ButtonLink size="md" fullWidth>Buka chat-nya</ButtonLink>`; otherwise the dashed sentence `NINA_JOB_JUMP_NOTE[jump.kind]`
   - **Calls:** navigation only

### The photograph chain (what R2/R3/R4 must link into)

1. **Write (both hosts, same shape):** a finished selfie job writes
   - `nina_messages` row: `turn_id = jobId`, `photo_only = true` — `scripts/nina-image-worker.ts:798-806` (raw SQL) and `lib/nina/imagerun.ts:236-255` (drizzle)
   - `nina_message_images` row: `kind='generated'`, `message_id = <that message>`, `prompt = args.sidecar`, `description = args.scene`
   - The image row carries NO job id; **`nina_messages.turn_id` is the only job→photo key**.
2. **Read (Media):** `app/nina/about/page.tsx` → `listNinaMessageImages(userId, {limit: NINA_GALLERY_LIMIT=200})` → `galleryPhotos(rows)` → `NinaGalleryPhoto {id, messageId, url, kind, side, label}` → `NinaPhotoGrid`
3. **Viewer state:** tapping a Media cell pushes `/nina/about?photo=chat.<image.id>` (`encodePhoto`, `NinaAboutScreen.tsx:172-183`); `open` is DERIVED from the URL (`useMemo` over `searchParams` + lists, line 143-150): `decodePhoto` → `findIndex` in the section list → **`index < 0` resolves to `null` and the viewer does not open** (silent)
4. **Viewer controls:** `PhotoViewer` (z-60) + the fixed attach strip (z-70): question input, `attachNinaPhotoToChat({kind:'image', id, body, target:'recent'|'new'})`, delete when `side === 'his'`
5. **Paging/close:** `replaceState` swaps the id (`onIndex`); close pops or strips the param

### Admin surface (the R3/R4 counterparty)

- **Replace** — `replaceChatPhotoAction` (`lib/admin/chatPhotoActions.ts:136`): `updateNinaChatPhotoBlob(userId, id, {blobUrl, pathname, width, height, bytes})` — **same row, same id, same `message_id`, same `created_at`**; description nulled then re-earned via `scheduleChatPhotoCaption`; old blob released if unreferenced. ⇒ R4 is satisfied by construction once the link names the row id.
- **Remove** — `removeChatPhotoAction` (line 344): deletes the image row (and the carrier message when it is a photo-only carrier); blob released if unreferenced. ⇒ the job→photo read returns null afterwards; the control must not be drawn.
- **Add** — mints its own carrier message (`turn_id` NULL) → never attached to a job.

### Data Persistence

- `nina_turns` — the job row; read here, never written by this feature
- `nina_messages.turn_id` — nullable text, **no index**; join key for the new job→photo read (per-user scope via `user_id` indexes on both tables)
- `nina_message_images` — the photo row; `nina_message_images_user_created_idx (user_id, created_at desc)` serves the gallery
- No cache; both new reads are one indexed statement on pages opened a handful of times a day

### Exit Points

- `/nina/jobs/[id]` renders two navigation controls (chat jump, photo viewer) + refusal sentences
- `/nina/about?photo=chat.<id>` renders the existing viewer + attach strip
- No writes, no model calls, no revalidatePath needed (pure navigation links)

---

## Key Data Structures

### `NinaImageJobDetail`
**Location:** `lib/nina/imagejobs.ts:864`
**Fields:** `NinaImageJobRecord` (id, status, errorCode, model, createdAt, latencyMs, costMicroUsd, purpose, scene, mood, prompt, sidecar, seed, attempts, source, replyToId) + `replySessionId`
**Used In:** `app/nina/jobs/[id]/page.tsx:53`

### `NinaJobJump`
**Location:** `lib/nina/jobview.ts:378`
**Fields:** `{kind:'ready'; href} | {kind:'avatar'} | {kind:'no-message'} | {kind:'gone'}`
**Used In:** `NinaJobDetail.tsx:112`

### `NinaGalleryPhoto`
**Location:** `lib/nina/album.ts:224`
**Fields:** `{id, messageId, url, kind, side, label}`
**Used In:** `NinaAboutScreen` (grid cells + viewer lists)

### `ViewerPhoto`
**Location:** `components/ui/PhotoViewer.tsx` (`{url, kind, label}`)
**Used In:** `NinaAboutScreen.tsx:120-127`

### About-viewer codec (currently private)
**Location:** `components/nina/NinaAboutScreen.tsx:61-77`
**Fields:** `PHOTO_PARAM='photo'`, `encodePhoto(section,id) → "album.<id>" | "chat.<id>"`, `decodePhoto(raw)`
**Used In:** `openAt`, `onIndex`, `close`, `open` — all within this file; nobody else imports it (the chat page's `PHOTO_PARAM` from `lib/nina/attach.ts` is a DIFFERENT grammar on a different route)

---

## Dependencies

### Configuration / Environment / External Services

- None new. No env vars, no model calls, no Blob operations, no migrations.
- Next 16 route props: `app/nina/about/page.tsx` gains `searchParams` — `PageProps<'/nina/about'>`, `params`/`searchParams` are PROMISES that must be awaited (`node_modules/next/dist/docs/`, per the repo's AGENTS.md note and the detail page's own docstring).
- Worktree note: `node_modules` is a symlink to the main checkout's and `.env.local` is copied — `vitest`/`tsc`/`next` typegen resolve; if a phase must add dependencies (none planned), replace the symlink with a real install.

---

## Reference List

| Symbol / key | File:line | Kind | Notes |
|---|---|---|---|
| `Buka chat-nya` | `components/nina/NinaJobDetail.tsx:114` | render | the labelled button R1 compresses |
| `planJobJump` | `lib/nina/jobview.ts:422` | def | also `jobview.test.ts` |
| `NINA_JOB_JUMP_NOTE` | `lib/nina/jobview.ts:442` | def | refusal sentences stay |
| `ninaJumpHref` | `lib/nina/jobview.ts:89` | def | precedent for the photo href builder |
| `getNinaImageJobDetail` | `lib/nina/imagejobs.ts:969` | def | detail read |
| `getNinaMessageImage` | `lib/nina/queries.ts:1738` | def | deep-link read; never filters references; returns `description` — server-side only |
| `listNinaMessageImages` | `lib/nina/queries.ts:1712` | def | gallery read, `isOriginalPhoto()` filter |
| `isOriginalPhoto` | `lib/nina/queries.ts:1776` | def | three collection reads filter; the four render reads must not |
| `listNinaSelfieJobIdsSince` | `lib/nina/queries.ts:4051` | def | the images→job direction (proof of the join shape) |
| `galleryPhotos` | `lib/nina/album.ts:316` | def | row → `NinaGalleryPhoto` (strips `description`) |
| `NINA_GALLERY_LIMIT` | `lib/nina/album.ts:40` | config | 200 — the viewer-window bound R3 must transcend |
| `photoSideOf` / `NINA_SIDE_LABEL` | `lib/nina/album.ts:173,160` | def | side/label for a resolved single row |
| `PHOTO_PARAM`/`encodePhoto`/`decodePhoto` | `components/nina/NinaAboutScreen.tsx:61-77` | def | codec to be shared, not duplicated |
| `PHOTO_PARAM` (`kind:id`) | `lib/nina/attach.ts:126` | config | OTHER grammar — must remain separate |
| `attachNinaPhotoToChat` | `lib/nina/albumActions.ts:117` | def | the strip's action — unchanged |
| `replaceChatPhotoAction` | `lib/admin/chatPhotoActions.ts:136` | def | same-row swap — R4's counterparty |
| `removeChatPhotoAction` | `lib/admin/chatPhotoActions.ts:344` | def | row deletion — R3's stated boundary |
| `updateNinaChatPhotoBlob` | `lib/nina/queries.ts` | def | the same-row UPDATE |
| `finishSelfie` | `scripts/nina-image-worker.ts:768` | write | `turn_id = jobId` + `kind='generated'` |
| `finishAvatar` | `scripts/nina-image-worker.ts:838` | write | `nina_avatars`, NO job id |
| `imagerun.ts` finish | `lib/nina/imagerun.ts:236-264` | write | in-platform twin of `finishSelfie` |
| `nina_messages.turn_id` | `lib/db/schema.ts` (`ninaMessages` block) | column | nullable, unindexed — the join key |
| `Button` / `ButtonLink` | `components/ui/Button.tsx:84,129` | def | take `aria-label`; `md` = 44px |
| SessionRow glyph buttons | `components/nina/SessionRow.tsx:320-346` | precedent | icon-only + `aria-label` words |
| attach-strip glyph buttons | `components/nina/NinaAboutScreen.tsx:495-540` | precedent | `Button size="md" variant="secondary"` icon row |
| Lucide glyph convention | `components/nina/NinaAboutScreen.tsx:558-636` | convention | lucide-static 1.42.0 verbatim, 18px, `aria-hidden` |
| `NINA_ATTACH_*` strip | `NinaAboutScreen.tsx:456-541` | render | exists; R2 adds no controls here |

---

## Impact Points (files that WILL need changes)

1. `components/nina/NinaAboutScreen.tsx` — consume the shared codec; accept a server-resolved viewer-only photo for ids outside the section lists (Phase 1)
2. `app/nina/about/page.tsx` — read `searchParams` (Next 16 promise), resolve an out-of-list `chat.<id>` via the single-row deep-link read, map through `galleryPhotos` (strips `description`), pass down (Phase 1)
3. `lib/nina/album.ts` (or a sibling pure module — planner's call) — new home of the shared about-viewer codec + href builder (Phase 1)
4. `lib/nina/queries.ts` — new owner-scoped job→photo read (`nina_message_images ⋈ nina_messages.turn_id`) (Phase 2)
5. `lib/nina/jobview.ts` — pure photo-link plan/href helper beside `planJobJump` (Phase 2)
6. `app/nina/jobs/[id]/page.tsx` — resolve the photo fact in parallel with the detail read; pass down (Phase 2)
7. `components/nina/NinaJobDetail.tsx` — the icon row: jump icon + photo icon + unchanged refusal sentences (Phase 2)
8. `tests/nina.jobview.test.ts` (+ a codec test home) — pure rules (Phases 1-2); source-claim test for the new read, on `tests/nina.photoRefs.test.ts`'s pattern (Phase 2)

**This document describes. The plan files prescribe.**
