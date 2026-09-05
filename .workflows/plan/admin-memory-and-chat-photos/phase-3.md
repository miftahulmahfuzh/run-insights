# Phase 3: Replace, add, remove

**Plan set:** `ADMIN_MEMORY_AND_CHAT_PHOTOS_PLAN.md`
**Analysis:** `20260905-045430-M7Q2_code_analyzer.md` (+ the two coordinator corrections of 2026-09-05, folded in below)
**Satisfies:** R2 — *"user can replace a photo in there with a new photo, or add a new photo (so it is like nina generated them, but actually it is manually added by user) or remove a photo"*
**Depends on:** Phase 2 (its `/admin/photos` route and `components/admin/ChatPhotoGrid.tsx` must exist)
**Difficulty:** HARD
**Package:** `lib/admin`

---

## Framework docs read before writing any code

Next.js **16.3.1** (`node_modules/next/package.json`). `AGENTS.md` warns the APIs differ from
training data, so these were read rather than remembered. The worktree has no `node_modules`; the
docs were read from the primary checkout at `/home/miftah/run-insights/node_modules/next/dist/docs/`.

- `01-app/02-guides/server-actions.md` — four facts this phase depends on:
  1. *"Next.js dispatches Server Actions one at a time per client… do not rely on `Promise.all` to
     parallelize Server Actions from the client."* — `ChatPhotoAdd` therefore loops **sequentially**
     over a multi-file pick.
  2. *"Action requests are capped at 1MB by default."* — the structural reason none of the three
     actions receives image bytes: the browser PUTs to Blob and the action receives a URL, a
     pathname and four integers.
  3. *"Send a reference (typically an ID) plus the user's change, and re-read the rest from a
     trusted source using the session… Schema validation (zod or similar) only checks the *shape* of
     the input. A well-formed `Item` object can still refer to a row the caller does not own."* —
     why every action here is `requireAdmin()` → Zod → **owner-scoped re-read** → write.
  4. *"When `updateTag`, `revalidatePath`, or `refresh` runs, Next.js re-renders the current route
     server-side and includes a newly rendered RSC Payload in the action's response, so the page
     reflects the change in the same roundtrip."* — so the three client controls need **no**
     `router.refresh()`; `revalidatePath(ADMIN_CHAT_PHOTOS_PATH)` is the whole update path.
- `01-app/03-api-reference/03-file-conventions/route.md` — `route.ts` exports named HTTP-method
  functions taking a Web `Request`; `export const runtime = 'nodejs'` is a route-segment export
  (`:649`). The existing handler already matches both; this phase changes only the body of
  `onBeforeGenerateToken` and adds imports.
- `01-app/03-api-reference/03-file-conventions/page.md` — `searchParams` is a promise and must be
  awaited; reading it opts the page into dynamic rendering. **No page is added or edited by this
  phase** (phase 2 owns `app/admin/photos/page.tsx`), so this is recorded as the reason phase 3
  writes no `page.tsx` rather than as a thing it applies.

---

## Goal

`/admin/photos` stops being read-only. Each of Nina's chat photographs gains a one-click **Replace**
and a one-click **Remove**, and the collection gains an **Add**. A photograph added here is written
as the same `nina_messages` + `nina_message_images` pair `finishSelfie` writes, so it appears in the
runner's chat and in `/nina/about`'s gallery on **her** side with nothing anywhere that says an
operator put it there. No Blob object is orphaned by any of the three, and — the harder half — no
Blob object is deleted while another row still points at it.

---

## The two corrections that reshaped this plan

Both were verified against the code in this worktree before rewriting.

### C1 — Her generated blobs are at `nina/<userId>/selfie-<id>.png`, not under `chat/`

`scripts/nina-image-worker.ts:377-392` (`store`) writes:

```ts
const blob = await put(ninaImagePathname(userId, purpose, newId()), bytes, {
  access: 'public',
  contentType: NINA_IMAGE_CONTENT_TYPE,      // 'image/png'
  addRandomSuffix: true,
  allowOverwrite: false,
  cacheControlMaxAge: NINA_IMAGE_CACHE_MAX_AGE,
  token: process.env.BLOB_READ_WRITE_TOKEN,
})
```

and `lib/nina/imagerecipe.ts:126`:

```ts
export function ninaImagePathname(userId: string, purpose: NinaImagePurpose, id: string): string {
  return `nina/${userId}/${purpose}-${id}.png`
}
```

So the real shape is **three** path segments, `selfie-` prefixed, `.png`. `ninaChatPathname` /
`isNinaChatRequestPathname` (`nina/<userId>/chat/<id>.jpg`, four segments) is **his uploads'** shape
and is the wrong thing to copy. Resolved in **D4** below.

### C2 — A Blob object can be shared by several rows, so `del()` cannot be unconditional

`lib/nina/actions.ts:143-192` (`resolveAttachment`) and `:518-528`: the R26 re-attach path **copies
`blobUrl` and `pathname`** from an existing row onto a new `nina_message_images` row. No bytes are
copied. Both branches do it:

```ts
// attach.kind === 'avatar'  — lib/nina/actions.ts:166-174
const row = await getNinaAvatar(userId, attach.id)
if (row == null) return null
return { blobUrl: row.blobUrl, pathname: row.pathname, kind: 'generated', description: row.description }

// attach.kind === 'image'   — lib/nina/actions.ts:185-192
const row = await getNinaMessageImage(userId, attach.id)
if (row == null) return null
return { blobUrl: row.blobUrl, pathname: row.pathname, kind: row.kind, description: row.description }
```

So a chat photograph's object may be shared with **another `nina_message_images` row** or with a
**`nina_avatars` row — possibly the row that IS her current profile picture**. An unconditional
`del()` in Remove or Replace is a data-loss bug: her face goes blank, or an earlier bubble does,
while both rows still point at a dead URL. Invariant 8 (no orphaned blobs) and this pull in opposite
directions and **correctness wins over tidiness**: an orphan costs storage; a deleted-but-referenced
object is visible data loss. Resolved in **D5** below.

---

## Interface Contract

The reconciler reads this section to detect cross-phase conflicts. Be exact and exhaustive.

**Deletes:** none.

**Renames:** none.

**Creates:**

| Symbol | File |
|---|---|
| `ADMIN_CHAT_PHOTOS_PATH` | `lib/admin/chatPhotos.ts` |
| `ADMIN_CHAT_PHOTO_PURPOSE` | `lib/admin/chatPhotos.ts` |
| `ADMIN_CHAT_PHOTO_EXT` | `lib/admin/chatPhotos.ts` |
| `ADMIN_CHAT_PHOTO_CONTENT_TYPE` | `lib/admin/chatPhotos.ts` |
| `ADMIN_CHAT_PHOTO_ID_RE` | `lib/admin/chatPhotos.ts` |
| `ADMIN_CHAT_PHOTO_MAX_UPLOAD_BYTES` | `lib/admin/chatPhotos.ts` |
| `ADMIN_CHAT_PHOTO_MAX_EDGE_PX`, `ADMIN_CHAT_PHOTO_MAX_URL_CHARS` | `lib/admin/chatPhotos.ts` |
| `adminChatPhotoPathname(userId, id): string` | `lib/admin/chatPhotos.ts` |
| `isAdminChatPhotoPathname(pathname, userId): boolean` | `lib/admin/chatPhotos.ts` |
| `isHttpsBlobUrl(value): boolean` | `lib/admin/chatPhotos.ts` |
| `blobUrlMatchesPathname(blobUrl, pathname): boolean` | `lib/admin/chatPhotos.ts` |
| `isNinaPhotoCarrierMessage(message): boolean` | `lib/admin/chatPhotos.ts` |
| `interface ChatPhotoActionResult` | `lib/admin/chatPhotos.ts` |
| `chatPhotoAddSchema`, `chatPhotoReplaceSchema`, `chatPhotoRemoveSchema` + their inferred types | `lib/admin/chatPhotoSchema.ts` |
| `replaceChatPhotoAction(input: unknown): Promise<ChatPhotoActionResult>` | `lib/admin/chatPhotoActions.ts` |
| `addChatPhotoAction(input: unknown): Promise<ChatPhotoActionResult>` | `lib/admin/chatPhotoActions.ts` |
| `removeChatPhotoAction(input: unknown): Promise<ChatPhotoActionResult>` | `lib/admin/chatPhotoActions.ts` |
| `updateNinaChatPhotoBlob(userId, id, patch): Promise<NinaImageRow \| null>` | `lib/nina/queries.ts` (§5b) |
| `deleteNinaMessageImage(userId, id): Promise<NinaImageRow \| null>` | `lib/nina/queries.ts` (§5b) |
| `setNinaMessageImageDescription(userId, id, description): Promise<boolean>` | `lib/nina/queries.ts` (§5b) |
| **`isBlobPathnameReferenced(userId, pathname): Promise<boolean>`** | `lib/nina/queries.ts` (§5b) |
| `interface NinaChatPhotoBlobPatch` | `lib/nina/queries.ts` (§5b) |
| `ADMIN_CHAT_PHOTO_LONG_EDGE_PX`, `ADMIN_CHAT_PHOTO_QUALITY`, `encodeChatPhotoJpeg`, `uploadChatPhoto`, `interface UploadedChatPhoto` | `components/admin/chatPhotoUpload.ts` |
| `ChatPhotoControls` | `components/admin/ChatPhotoControls.tsx` |
| `ChatPhotoAdd` | `components/admin/ChatPhotoAdd.tsx` |

**Signature changes:** none. `app/api/admin/nina/upload/route.ts`'s `POST` keeps its signature; only
the body of the inline `onBeforeGenerateToken` changes.

**Other edits to existing files:**
- `lib/nina/queries.ts` — the `drizzle-orm` import list gains **`or`** (`:1-13`). No other existing
  line in that file changes.

**Requires (from earlier phases):**

- **Phase 2** creates `components/admin/ChatPhotoGrid.tsx` as a `'use client'` component that
  receives `userId: string` as a prop and exposes **two named seams**: one collection-level seam in
  its header/toolbar for the Add control, and one per-photo seam on the detail rail for the
  Replace/Remove pair, where the selected photo's `nina_message_images.id` is in scope.
- **Phase 2** creates the route at **`/admin/photos`**. Phase 3 spells that string exactly once, in
  `ADMIN_CHAT_PHOTOS_PATH`. A different path is a one-line reconciliation.
- **Phase 2** appends `listNinaChatPhotos` + a count to `lib/nina/queries.ts`. Phase 3 appends a
  **§5b** block to the same file and adds one word to its import list — see Risk 1.
- **Phase 2** adds no Server Action, so `lib/admin/chatPhotoActions.ts` is the first and only writer.

**Leaves alone (owned by others):**

- `lib/admin/schema.ts` — phase 1 is rewriting it. This phase's Zod lives in
  `lib/admin/chatPhotoSchema.ts` and **the file is never opened**.
- `app/admin/memory/**`, `lib/admin/memory*`, `components/admin/Memory*` — phase 1's.
- `app/admin/photos/page.tsx`, `components/admin/AdminNav.tsx`, `app/admin/page.tsx` — phase 2's.
- `scripts/nina-image-worker.ts` — read as the shape to imitate, not edited.
- **`lib/nina/images.ts` — READ ONLY.** Its header (`:4-18`) forbids adding *any* import because
  three hosts read it and two break at runtime rather than at `tsc`. This phase imports
  `NINA_BLOB_PREFIX` from it (as `lib/admin/avatars.ts:1` already does) and adds nothing.
- **`lib/nina/imagerecipe.ts` — READ ONLY, same rule** (`:7-10`: *"This file must never import
  anything… `scripts/nina-image-worker.ts` imports it by relative path under
  `node --experimental-strip-types`"*, and `:12-17`: importing `NINA_BLOB_PREFIX` here *"would cost
  this module the zero-import property the Actions worker depends on"*). This phase imports
  `NINA_IMAGE_HEIGHT`, `NINA_IMAGE_PATHNAME_RE` and `ninaImagePathname` **from** it and adds nothing.
- **`lib/nina/imagefail.ts` — READ ONLY, same rule.** `ninaImageCaption`, `NINA_IMAGE_CAPTIONS`.
- `lib/admin/avatars.ts`, `lib/admin/ninaAlbumActions.ts`, `components/admin/explorer/**`,
  `components/admin/FileExplorer.tsx`, `app/admin/nina/page.tsx`, `scripts/nina-profpic.mjs` — read
  for the pattern, not edited.
- `app/nina/**`, `components/nina/**`, `lib/nina/chatphotos.ts`, `lib/nina/album.ts`,
  `lib/nina/actions.ts` — the readers that must keep working unchanged. That they are untouched is
  the proof of invariant 7.

---

## The five decisions this phase was told to make, and their answers

### D1 — What goes in `turn_id`, `text`, `reply_to_id` and `session_id` on ADD

`finishSelfie` (`scripts/nina-image-worker.ts:394-455`) writes a pair:

```sql
insert into nina_messages (id, user_id, role, text, source, turn_id, reply_to_id)
values (?, ?, 'nina', ninaImageCaption(jobId), 'chat', jobId,
        (select id from nina_messages where id = ? and user_id = ?));

insert into nina_message_images
  (id, user_id, message_id, kind, blob_url, pathname, width, height, bytes, description, prompt, sort_order)
values (?, ?, ?, 'generated', ?, ?, 768, 1024, ?, args.scene, args.sidecar, 0);
```

There is no job, no `nina_turns` row and no generation. Column by column:

| Column | Phase 3 writes | Why it is not a marker |
|---|---|---|
| `role` | `'nina'` | Identical. |
| `source` | `'chat'` | Identical. **No sixth `NinaMessageSource`** — RULING C9, quoted in `finishSelfie`'s docstring. |
| `text` | `ninaImageCaption(newId())` | The **same function**, seeded with a fresh nanoid(12) instead of a job id. `pickLine` (`lib/nina/imagefail.ts:160`) is a pure FNV-1a over the seed and a job id is itself a nanoid(12), so the distribution is identical and the output is always one of the five strings in `NINA_IMAGE_CAPTIONS`. Her words keep **one** definition. |
| `turn_id` | `null` | `lib/db/schema.ts:799` — *"nothing renders it"*. Minting a fake id would either dangle (no FK) or force a `nina_turns` row asserting a model call that never happened and a cost never paid, falsifying the one question that table exists to answer. See "where the difference is observable" below. |
| `reply_to_id` | `null` | The worker's subselect resolves *the runner message that asked*. Nobody asked. `resolveQuote` degrades a null to a plain message by design (`lib/nina/queries.ts:1128-1131`). |
| `session_id` | `await resolveNinaWriteSession(userId)` | `nina_messages.session_id` is `NOT NULL` with an FK (`lib/db/schema.ts:825-827`; `drizzle/0004_nina_chat_sessions.sql:34-35`) and `insertNinaMessages` takes it as a **required third argument**. `lib/nina/sessionResolve.ts` holds assumption A3's single policy for a writer with nobody looking, and creates a session when he has none. See Handoff 1: the worker's own SQL omits this column. |
| `kind` | `'generated'` | The discriminator `photoSideOf` (`lib/nina/album.ts:146`) reads. Identical. |
| `sort_order` | `0` | Identical. |
| `width` / `height` / `bytes` | measured by the browser encoder | The worker records the constants 768/1024 because no decoder runs on either host; here a real decode is in hand, so real numbers go in. Both are honest; neither is readable as provenance. |
| `description` | `null` at insert, then filled by a `glm-4.6v` pre-pass in `after()` | See D2. |
| `prompt` | `null` | See below. |

**`prompt = null` is invisible downstream, and that was checked rather than assumed.**
`grep -rn '\.prompt\b' lib app components scripts tests` finds exactly two references to
`nina_message_images.prompt`: the projection (`lib/nina/queries.ts:478`) and the writer (`:1226`).
**Nothing reads it.** It is also already NULL on every `kind = 'upload'` row, so a NULL prompt is not
a marker of admin origin — it is the majority value in the column. Writing a fabricated sidecar
would put a made-up model, prompt and seed in the one column whose stated purpose
(`lib/nina/imagerecipe.ts:46-50`) is *"a candidate you like six weeks from now has to be
explainable"*.

**Where the difference IS observable, and why that is acceptable.** Three places, all admin-facing,
none of them a rendering path:

1. `nina_messages.turn_id` — for a `kind='generated'` row, a NULL `turn_id` means no `nina_turns`
   row exists, i.e. no generation happened. That is **recoverable on purpose**: invariant 7 says a
   photograph must be indistinguishable *downstream*, to `photoSideOf`, `chatViewerPhotos`,
   `galleryPhotos` and the chat bubble renderer. It does not say the database must be unable to
   answer an operator's question, and a cost ledger that cannot be reconciled would be worse.
2. `nina_message_images.prompt` being NULL — but so is every upload's, so it does not discriminate.
3. `nina_message_images.pathname` — see D4. Read by `/admin`, by `describeNinaImages`'s error
   strings and by `lib/nina/messageActions.ts:172`'s orphan log. No runner-facing surface reads it.

**No new `kind`, no new `NinaMessageSource`, no admin column, no migration** (invariant 10).

### D2 — What happens to `description` and `prompt` on REPLACE

`description` is `glm-4.6v`'s prose about the **old** picture, and it is not decorative: it reaches
Nina. `lib/nina/gateway.ts:162` populates `MessageInput.imageDescriptions` from it, and
`lib/nina/actions.ts:604` feeds it into her prompt on the send path. A stale description after a
replace is a sentence she will confidently say about a photograph that is not there — invariant 6's
exact failure.

So `updateNinaChatPhotoBlob` sets **`description = null` and `prompt = null` in the same statement as
the new bytes**. There is no window in which the row points at new bytes and old prose. A null
description degrades honestly: `lib/nina/actions.ts:604` substitutes `NINA_DESCRIPTION_UNAVAILABLE`
(`lib/nina/prompts/describe.ts:79`), the instruction written for exactly this.

Then the row **earns a new description**: `scheduleChatPhotoDescribe` runs `describeNinaImages` in
`after()`, non-fatal, and stamps it. This is `scheduleDescribe`'s shape from
`lib/admin/ninaAlbumActions.ts:300-320`, for the reason the analysis states: *"Phases 14 and 15
hand-upload files with no prompt and DO run that pre-pass — that is the whole difference between the
two paths."* A generated row has a non-null description because `args.scene` gave it one; a
hand-uploaded row can only get one from a vision model, and leaving it null forever would make the
row **distinguishable and functionally worse** than a generated one — invariant 7 failing in the
direction nobody would notice. `after()` keeps the ~8-11 s call off the operator's click.

The same helper runs after ADD, for the same reason.

### D3 — REMOVE and the empty bubble

Directed by the plan index and implemented exactly:

```
siblings = getNinaMessageImagesForMessages(userId, [row.messageId])
isLast   = siblings has no member other than this row
carrier  = message.role === 'nina' AND NINA_IMAGE_CAPTIONS includes message.body

if (isLast && carrier)  ->  deleteNinaMessage(userId, message.id)   // cascade takes the image row
else                    ->  deleteNinaMessageImage(userId, row.id)
then                    ->  releaseChatPhotoBlob(...)               // see D5
```

- **The order is right for the cascade.** `nina_message_images.message_id` is `ON DELETE CASCADE`
  (`lib/db/schema.ts:948-951`), so deleting the message takes its image rows with it in one
  statement. Deleting the image row first and the message second would work but would be two
  statements outside a transaction, with a crash window that leaves the empty bubble this rule
  exists to prevent.
- **`role === 'nina'` is what protects his message.** The R26 re-attach path
  (`lib/nina/actions.ts:518-530`) writes a `kind = 'generated'` image row onto a message whose `role`
  is `'runner'` and whose text is **his**. That message fails the test and only the image row goes,
  exactly as the plan index directs.
- **The caption test is the second half, and it is exact.** `NINA_IMAGE_CAPTIONS` is a closed
  five-string array in a zero-import module. `finishSelfie`'s message text is always one of them and
  so is phase 3's ADD (D1), so the rule recognises both writers. It refuses to delete a message of
  hers that carries a photograph *and real words* — a shape nothing writes today, which is precisely
  why the guard is cheap and worth having: `role === 'nina'` alone would silently delete her words
  the day some later path attaches a photo to a real sentence of hers.

### D4 — The blob shape a hand-added photograph takes (correction C1)

**Chosen: `nina/<userId>/selfie-<id>.jpg`.** Same prefix, same `selfie-` segment and same id length
as the worker's own output; **JPEG instead of PNG**.

**Why not `chat/<id>.jpg`.** That is `ninaChatPathname`, and `lib/nina/images.ts`'s own comments
scope it to the runner's composer uploads. It would file her photographs under his prefix and would
make the collection's storage shape disagree with itself for no gain.

**Why not `selfie-<id>.png`, imitating the worker byte for byte.** The container is a *constraint of
the worker's environment*, not a property of the collection: `lib/nina/imagerecipe.ts:62` says so in
as many words — *"Qwen returns PNG bytes and there is no `sharp` on the worker, so PNG is what gets
stored."* The browser here **has** an encoder. An operator's source file is a photograph, which means
JPEG on disk far more often than not, and re-encoding a lossy JPEG to lossless PNG inflates it five
to twenty times for **zero** quality gain — into the one table `/nina/about` downloads whole, with
`next/image` ruled out on Blob-hosted photos (`components/nina/NinaPhotoGrid.tsx:56-58`). Paying that
to make a store listing tell a story nothing reads is the wrong trade.

**Why `.jpg` is not a new shape at all.** `NINA_IMAGE_PATHNAME_RE` (`lib/nina/imagerecipe.ts:73`)
already admits it:

```
/^nina\/[0-9A-Za-z_-]{1,64}\/(selfie|avatar)-[0-9A-Za-z_-]{12}\.(png|jpg)$/
```

`.jpg` is there because `scripts/nina-profpic.mjs` writes `avatar-<id>.jpg`. So the chosen pathname
matches a pattern already documented, already tested (`tests/nina.imagerecipe.test.ts:99,115`,
`tests/nina.profpic.test.ts:149-150`) and already read by a live script
(`scripts/nina-profpic.mjs:308`). **A future `scripts/blob-reap.mjs` taught the `nina/` prefix learns
one pattern, not two** — which is ruling D4's stated goal and the one consequence of a pathname
choice that could ever cost real data.

**Exactly which code can observe the difference, and why that is acceptable.**

| Reader | Sees | Acceptable because |
|---|---|---|
| `/admin/photos` detail rail (phase 2) | the pathname, if it renders it | Admin-facing. `/admin` is where the operator reads exactly this. |
| `lib/nina/vision.ts:263,266` error strings | the pathname, on a failed describe | Server log. |
| `lib/nina/messageActions.ts:172` | the pathname, in the orphan log | Server log. |
| a future `scripts/blob-reap.mjs` | `.jpg` where it might expect `.png` | It reads `NINA_IMAGE_PATHNAME_RE`, which admits both. This is the reason the shape was chosen. |
| a human listing the Blob store | `.jpg` beside `.png` | Same folder, same prefix, sorted together. |
| **every runner-facing surface** | **nothing** | `photoSideOf`, `chatViewerPhotos`, `galleryPhotos` and the bubble renderer read `kind`, `blob_url` and `sort_order`. `pathname` reaches none of them. Verified by `grep -rn '\.pathname' lib app components`. |

**Content type: `image/jpeg` only.** One container per accepted shape, so the branch has one
`allowedContentTypes` and one cross-check. The operator still picks any file the browser can decode;
`encodeChatPhotoJpeg` re-encodes it before the PUT. That is
`components/admin/explorer/thumbnail.ts:53-58`'s call — *"JPEG, always, whatever the original was"* —
and it is right here for a reason it is **not** right for an avatar:
`components/admin/UploadAvatar.tsx`'s no-re-encode ruling exists because an avatar is crop-zoomed 4x
inside a circular frame. A chat photograph is never crop-zoomed; `PhotoViewer` serves the same blob
at screen size.

**Byte ceiling: `ADMIN_CHAT_PHOTO_MAX_UPLOAD_BYTES = 2 MB`, a fourth number, resolved deliberately
against all three existing ones.**

| Existing ceiling | Value | Why it is not inherited |
|---|---|---|
| `NINA_CHAT_MAX_UPLOAD_BYTES` | 900 000 | Derived from ONE pipeline: `browser-image-compression` at 768 px short edge, q0.75, *"~4x the expected 120-200 KB"* (`lib/nina/images.ts:33-38`). A different encoder at q0.90 crossing it would surface as a bare "upload failed". It is also **his** side's number. |
| `ADMIN_AVATAR_MAX_UPLOAD_BYTES` | 8 MB | Exists because an avatar is deliberately **not** re-encoded (`lib/admin/avatars.ts:41-46`). A chat photo is, so 8 MB of headroom would only buy the chance to put an 8 MB object in the table `/nina/about` downloads whole. |
| the worker's own selfie | **uncapped** | `store()` calls `put` with no `maximumSizeInBytes` at all — a 768x1024 PNG runs 1-2 MB. So "no bigger than one of hers" is the real reference point, and 2 MB clears it. |

2 MB is ~6x what `encodeChatPhotoJpeg` actually produces at 1024 px / q0.90 (~250-350 KB) — the same
safety ratio the 900 KB cap was chosen for — and still loud about a raw original that slipped
through.

**What the branch does NOT get its own copy of.** `ADMIN_AVATAR_TOKEN_TTL_MS` (ten minutes: how long
a slow upload takes) and `ADMIN_AVATAR_CACHE_MAX_AGE` (one year) are shape-independent. The second is
worth spelling out because C1 raises it: `NINA_IMAGE_CACHE_MAX_AGE` is `31_536_000` and
`ADMIN_AVATAR_CACHE_MAX_AGE` is `60 * 60 * 24 * 365` — **the same number**, because both say "a blob
whose pathname carries a random suffix is immutable". Keeping the route's existing constant is
numerically identical to using her side's, so no third constant is introduced.

**One predicate, two windows, stated.** `isAdminChatPhotoPathname` admits a 12–24 symbol id, because
Blob's `addRandomSuffix` rewrites what we asked for and the ACTION validates the **stored** form. The
route validates the **requested** form with the same predicate, which is therefore slightly loose
there — a client could ask for a 24-symbol id. That is harmless: the id is a name inside the caller's
own folder, not a credential, and the alternative (two predicates, `{12}` and `{12,24}`) is exactly
the drift `isNinaChatRequestPathname` avoided by using one 12–24 window for both. The test pins the
requested form against `NINA_IMAGE_PATHNAME_RE`'s stricter `{12}`.

### D5 — Deleting a Blob object that other rows may still point at (correction C2)

**One function, used by both Replace and Remove, so they cannot drift:**
`releaseChatPhotoBlob(userId, ref)` in `lib/admin/chatPhotoActions.ts`, over
`isBlobPathnameReferenced(userId, pathname)` in `lib/nina/queries.ts` §5b.

`isBlobPathnameReferenced` asks two `LIMIT 1` existence questions, both scoped by `user_id`
(invariant 3):

1. any `nina_message_images` row with this `pathname`;
2. any `nina_avatars` row whose `pathname` **or** `thumb_pathname` is this pathname.

The second table is in scope because `resolveAttachment`'s avatar branch
(`lib/nina/actions.ts:166-174`) copies `nina_avatars.pathname` onto a chat image row — so removing
that chat photograph can, without this check, delete the object behind **her current profile
picture**. `thumb_pathname` cannot collide with the shape this phase writes (`thumb-<id>.<ext>` is a
different filename prefix), and it is checked anyway: one extra `OR` closes the question permanently
instead of resting on a shape argument that a later phase could invalidate.

**No "except this row" parameter, and that is a correctness property rather than a simplification.**
Both callers run the check **after** the row has stopped referencing the pathname:

- Remove deletes the row (or the message, whose cascade deletes the row) *first*, so the row is no
  longer in the table when the question is asked.
- Replace updates the row to the *new* pathname first, so a query on the *old* pathname cannot match
  it.

This is the same "row first, blob second" ordering `deleteNinaAvatarAction` already states
(`lib/admin/ninaAlbumActions.ts:186-191`) — *"a failed `del` leaves an orphaned object, which is
recoverable… a deleted blob under a live row is a permanently broken image"* — and here it does a
second job: it makes an exclusion parameter unnecessary, and a parameter that does not exist cannot
be passed wrongly.

**When the object is kept, the operator is told.** `ChatPhotoActionResult` gains a `note` field, on
`AdminActionResult.note`'s stated precedent — *"a true thing about the outcome that is not a failure…
the operation did what was asked, and the operator needs the sentence anyway."* `ok` stays `true`:
the photograph is out of the collection, which is what was asked.

**The orphan class this deliberately creates** is named in Handoffs, and `reap-orphaned-blobs` is its
backstop — which is exactly what a backstop is for.

---

## Files

| File | Action | What changes |
|---|---|---|
| `lib/admin/chatPhotos.ts` | **create** | Pure: the route path, the `selfie-<id>.jpg` builder and predicate, the content type, the byte ceiling, two URL predicates, the photo-carrier predicate, the result type |
| `lib/admin/chatPhotoSchema.ts` | **create** | The three Zod payloads. Deliberately NOT in `lib/admin/schema.ts` (phase 1 owns that file) |
| `lib/admin/chatPhotoActions.ts` | **create** | `'use server'` — the three mutations plus `releaseChatPhotoBlob` and `scheduleChatPhotoDescribe` |
| `lib/nina/queries.ts` | modify | `or` added to the drizzle import (`:1-13`); a new **§5b** block before the `§6 Memory` banner (`:1304`) with four queries and one type |
| `app/api/admin/nina/upload/route.ts` | modify | Two new imports and the body of `onBeforeGenerateToken` (`:120-165`): a third accepted pathname shape with its own ceiling and content type |
| `components/admin/chatPhotoUpload.ts` | **create** | `'use client'` — the JPEG re-encode and the Blob client handshake |
| `components/admin/ChatPhotoControls.tsx` | **create** | `'use client'` — Replace and Remove. One click each |
| `components/admin/ChatPhotoAdd.tsx` | **create** | `'use client'` — the collection-level Add |
| `components/admin/ChatPhotoGrid.tsx` | modify | Phase 2's file. **Two seam lines and two imports, nothing else** |
| `tests/admin.chatPhotos.test.ts` | **create** | The pure half: pathname agreement, predicates, schemas, the caption round-trip, the ceiling ordering |

---

## Implementation Steps

### Step 1: The pure module

**File:** `lib/admin/chatPhotos.ts` (new)
**Code:**

```ts
import { NINA_IMAGE_CAPTIONS } from '@/lib/nina/imagefail'
import { NINA_BLOB_PREFIX } from '@/lib/nina/images'

/**
 * What `/admin/photos` may write into Nina's chat collection: where the bytes land, what they may
 * be, how big they may get, and which message a photograph's removal takes with it. R2, phase 3.
 *
 * The counterpart of `lib/admin/avatars.ts` for `nina_message_images`, and pure for the same stated
 * reason: `components/admin/ChatPhotoControls.tsx`, `components/admin/ChatPhotoAdd.tsx` and
 * `components/admin/chatPhotoUpload.ts` (client modules), `app/api/admin/nina/upload/route.ts` (a
 * Route Handler), `lib/admin/chatPhotoActions.ts` (Server Actions) and
 * `tests/admin.chatPhotos.test.ts` all have to agree, and a constant that is agreed rather than
 * shared is a constant that will one day disagree.
 *
 * ── THE PREFIX IS IMPORTED, NOT DECLARED ────────────────────────────────────────────────────
 * RULING A6: `NINA_BLOB_PREFIX = 'nina/'` has exactly one definition, in `lib/nina/images.ts`,
 * which is pure and zero-import precisely so every host can reach it. `lib/admin/avatars.ts:1` does
 * the same thing for the same reason.
 *
 * ── THE SHAPE IS HERS, WITH A DIFFERENT CONTAINER, AND THAT IS DELIBERATE ───────────────────
 * A GENERATED chat photograph lives at `nina/<userId>/selfie-<id>.png` — `ninaImagePathname`
 * (`lib/nina/imagerecipe.ts:126`), written by `scripts/nina-image-worker.ts:383`. NOT under
 * `chat/`: `ninaChatPathname` is the RUNNER composer's shape for his own uploads.
 *
 * So a hand-added photograph takes the same prefix, the same `selfie-` segment and the same id
 * length — and `.jpg` instead of `.png`. Three reasons, in order of weight:
 *
 *   1. **PNG is the worker's ENVIRONMENT, not the collection's format.**
 *      `lib/nina/imagerecipe.ts:62`, verbatim: *"Qwen returns PNG bytes and there is no `sharp` on
 *      the worker, so PNG is what gets stored."* The browser here has an encoder. An operator's
 *      source is a photograph — JPEG on disk far more often than not — and re-encoding a lossy JPEG
 *      to lossless PNG inflates it five to twenty times for zero quality gain, into the one table
 *      `/nina/about` downloads whole with `next/image` ruled out
 *      (`components/nina/NinaPhotoGrid.tsx:56-58`).
 *   2. **`.jpg` is not a new shape.** `NINA_IMAGE_PATHNAME_RE` (`lib/nina/imagerecipe.ts:73`)
 *      already admits `(selfie|avatar)-<id>.(png|jpg)`, because `scripts/nina-profpic.mjs` writes
 *      `avatar-<id>.jpg`. A future `scripts/blob-reap.mjs` taught the `nina/` prefix therefore
 *      learns ONE pattern and not two — ruling D4's stated goal, and the one consequence of a
 *      pathname choice that can cost real data.
 *   3. **Nothing runner-facing reads `pathname`.** `photoSideOf`, `chatViewerPhotos`,
 *      `galleryPhotos` and the chat bubble renderer read `kind`, `blob_url` and `sort_order`. The
 *      readers of `pathname` are `/admin`, two server log lines and the future reaper — all
 *      admin-facing, which is where invariant 7 permits the distinction to be visible.
 *
 * ── ONE PREDICATE, TWO WINDOWS ──────────────────────────────────────────────────────────────
 * `addRandomSuffix: true` means Blob rewrites the pathname it was asked for, so the REQUESTED form
 * carries a 12-symbol id and the STORED form carries more. `ADMIN_CHAT_PHOTO_ID_RE` admits 12-24
 * and `isAdminChatPhotoPathname` is used for both — at mint time (where it is slightly loose: a
 * client could ask for a 24-symbol id, which is harmless, since the id is a name inside the
 * caller's own folder and not a credential) and at action time (where the loose window is exactly
 * right). `lib/nina/images.ts`'s `NINA_CHAT_ID_RE` made the same call for the same reason, and the
 * alternative — two predicates that must stay in step — is the drift it avoided. The unit suite
 * pins the REQUESTED form against `NINA_IMAGE_PATHNAME_RE`'s stricter `{12}`.
 */

/**
 * The route every action here revalidates. Phase 2 owns the page; this is the single place phase 3
 * spells its path, so a route rename is one edit.
 */
export const ADMIN_CHAT_PHOTOS_PATH = '/admin/photos'

/**
 * `'selfie'` — `NinaImagePurpose`'s chat value, spelled here rather than imported so this module
 * does not depend on `lib/nina/imagerecipe.ts` at runtime. `tests/admin.chatPhotos.test.ts` asserts
 * `adminChatPhotoPathname` and `ninaImagePathname(_, 'selfie', _)` agree up to the extension, which
 * is the same "checked rather than merely intended" mitigation `tests/nina.imagerecipe.test.ts`
 * uses for `NINA_BLOB_PREFIX`.
 */
export const ADMIN_CHAT_PHOTO_PURPOSE = 'selfie'

/** JPEG, always, whatever the operator picked. See the header. */
export const ADMIN_CHAT_PHOTO_EXT = 'jpg'
export const ADMIN_CHAT_PHOTO_CONTENT_TYPE = 'image/jpeg'

/**
 * 12 requested, up to 24 stored once Blob has appended its random suffix. See the header's
 * "one predicate, two windows".
 */
export const ADMIN_CHAT_PHOTO_ID_RE = /^[A-Za-z0-9_-]{12,24}$/

/**
 * 2 MB, and it is a FOURTH number on purpose — none of the three in the store was inherited.
 *
 * NOT `NINA_CHAT_MAX_UPLOAD_BYTES` (900 000): that is HIS side's cap and is ~4x the measured
 * 120-200 KB output of one pipeline — `browser-image-compression` at 768 px short edge, q0.75. A
 * different encoder at q0.90 crossing it would surface as a bare "upload failed".
 *
 * NOT `ADMIN_AVATAR_MAX_UPLOAD_BYTES` (8 MB): that exists because an avatar is deliberately never
 * re-encoded. A chat photo always is.
 *
 * And the real reference point, which neither of those is: the worker's own selfie is UNCAPPED —
 * `store()` calls `put` with no `maximumSizeInBytes` at all — and a 768x1024 PNG runs 1-2 MB. 2 MB
 * clears that, so an admin photo is never the biggest object in the folder, while still being ~6x
 * what `encodeChatPhotoJpeg` actually produces at 1024 px / q0.90 and therefore still loud about a
 * raw original that slipped through.
 */
export const ADMIN_CHAT_PHOTO_MAX_UPLOAD_BYTES = 2 * 1024 * 1024

/** A sanity ceiling on the dimensions the client reports. Nothing real is 12000 px. */
export const ADMIN_CHAT_PHOTO_MAX_EDGE_PX = 12_000

/** Longest URL any store produces, with room. A bound is cheaper than a `text` column overflow. */
export const ADMIN_CHAT_PHOTO_MAX_URL_CHARS = 2048

/** `nina/<userId>/selfie-<id>.jpg` — what the client asks for. Blob appends its own suffix. */
export function adminChatPhotoPathname(userId: string, id: string): string {
  return `${NINA_BLOB_PREFIX}${userId}/${ADMIN_CHAT_PHOTO_PURPOSE}-${id}.${ADMIN_CHAT_PHOTO_EXT}`
}

/**
 * The path-traversal defence and the "do not write beside anything else in the store" defence, in
 * one predicate — and written **segment by segment rather than by interpolating `userId` into a
 * RegExp**, which is `isNinaChatRequestPathname`'s rule and the stronger of the two precedents in
 * this repo: *"a user id is data, and data does not belong in a pattern."*
 * `isAdminAvatarRequestPathname` builds a pattern instead, and guards it with an alphabet test
 * first; this does not need the guard because it never builds one.
 *
 * The user id is INTERPOLATED FROM THE SESSION by the route and by every action, never taken from
 * the request, so a client cannot write into another user's folder even though there is one user.
 */
export function isAdminChatPhotoPathname(pathname: string, userId: string): boolean {
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(userId)) return false

  const parts = pathname.split('/')
  if (parts.length !== 3) return false
  const [prefix, owner, file] = parts

  // `NINA_BLOB_PREFIX` is `'nina/'`; as a path SEGMENT it is the same string without the slash.
  if (prefix !== NINA_BLOB_PREFIX.slice(0, -1)) return false
  if (owner !== userId) return false
  if (file == null) return false

  const head = `${ADMIN_CHAT_PHOTO_PURPOSE}-`
  const tail = `.${ADMIN_CHAT_PHOTO_EXT}`
  if (!file.startsWith(head) || !file.endsWith(tail)) return false

  return ADMIN_CHAT_PHOTO_ID_RE.test(file.slice(head.length, -tail.length))
}

/**
 * `https:` and nothing else. `lib/nina/actions.ts:816` is the precedent — it pairs a pathname
 * predicate with `blobUrl.startsWith('https://')` at ticket-mint time, and this is the same pair at
 * action time.
 */
export function isHttpsBlobUrl(value: string): boolean {
  if (value.length === 0 || value.length > ADMIN_CHAT_PHOTO_MAX_URL_CHARS) return false
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return false
  }
  return url.protocol === 'https:'
}

/**
 * The URL and the pathname must describe the SAME object, and this is stronger than anything the
 * album checks.
 *
 * A Server Action is a separate entry point from the token mint (Next 16's Server Actions guide:
 * *"the route is reachable to anyone who can send the same POST"*), so without this a well-formed
 * payload could point `blob_url` at any https URL on the internet while `pathname` — the column the
 * reference check in D5 and a future reaper both read — claimed a file in our own store. The row
 * would render someone else's bytes, and `isBlobPathnameReferenced` would be answering a question
 * about a pathname nothing had ever written.
 *
 * A Vercel Blob URL is `https://<store>.public.blob.vercel-storage.com/<pathname>`, so the URL's
 * path is exactly `/` + the pathname. Our pathnames are the URL-safe alphabet plus `/` and `.`, so
 * nothing is percent-encoded; `decodeURIComponent` is there so a store that ever encodes one still
 * compares equal rather than silently failing every upload.
 */
export function blobUrlMatchesPathname(blobUrl: string, pathname: string): boolean {
  if (!isHttpsBlobUrl(blobUrl)) return false
  let url: URL
  try {
    url = new URL(blobUrl)
  } catch {
    return false
  }
  let decoded: string
  try {
    decoded = decodeURIComponent(url.pathname)
  } catch {
    return false
  }
  return decoded === `/${pathname}`
}

/**
 * **Does this message exist ONLY to carry a photograph?** The whole of the empty-bubble rule.
 *
 * `finishSelfie`'s message is *"not a special kind of message"* — an ordinary `nina_messages` row
 * whose text is one of five canned captions — so removing its last image would leave a caption
 * bubble with no picture in the runner's chat, forever. This predicate is what lets
 * `removeChatPhotoAction` delete the message too.
 *
 * TWO clauses, and both are load-bearing:
 *
 *   · `role === 'nina'` protects HIS message. The R26 re-attach path
 *     (`lib/nina/actions.ts:518-530`) writes a `kind = 'generated'` image row onto a `role =
 *     'runner'` message that carries his own words. That message is his; only the image row goes.
 *   · the caption test protects HER words. `NINA_IMAGE_CAPTIONS` is a closed five-string array;
 *     `finishSelfie` and `addChatPhotoAction` both draw from it through `pickLine`, so the rule
 *     recognises both writers exactly. `role === 'nina'` ALONE would delete a real sentence of hers
 *     the day some later path attaches a photograph to one.
 *
 * The parameter is structural (`{ role, body }`) rather than `NinaMessageRow`, so this module stays
 * free of `lib/nina/queries.ts` and remains importable from a browser bundle and from the suite.
 * `body` is the DTO spelling of the `text` column (RULING A1).
 */
export function isNinaPhotoCarrierMessage(message: { role: string; body: string }): boolean {
  return message.role === 'nina' && NINA_IMAGE_CAPTIONS.includes(message.body)
}

/** One shape for all three actions, so the client has one branch and no `unknown`. */
export interface ChatPhotoActionResult {
  ok: boolean
  /** A sentence for the operator. Absent on success. */
  error?: string
  /** The `nina_message_images.id` the operation touched or created. */
  id?: string
  /**
   * A true thing about the outcome that is NOT a failure — `AdminActionResult.note`'s stated
   * purpose. Today it has one use: saying that the Blob object was kept because another row still
   * points at it (D5). `ok` is still `true`; the photograph is out of the collection, which is what
   * was asked.
   */
  note?: string
}
```

**Impact:** a new pure module. No existing import changes. Importable from a client bundle — both of
its imports are from zero-import modules by rule.

---

### Step 2: The Zod payloads, in their own module

**File:** `lib/admin/chatPhotoSchema.ts` (new)
**Change:** the three boundaries. **Not** `lib/admin/schema.ts` — phase 1 is deleting three schemas
from and reshaping four more in that file concurrently, and that file's docstring scopes it to
*"everything `/admin/nina` accepts from a browser"*, which `/admin/photos` is not.
**Code:**

```ts
import { z } from 'zod'

import {
  ADMIN_CHAT_PHOTO_MAX_EDGE_PX,
  ADMIN_CHAT_PHOTO_MAX_UPLOAD_BYTES,
  ADMIN_CHAT_PHOTO_MAX_URL_CHARS,
  blobUrlMatchesPathname,
} from '@/lib/admin/chatPhotos'

/**
 * Everything `/admin/photos` accepts from a browser. R2, phase 3.
 *
 * ── WHY THIS IS NOT IN `lib/admin/schema.ts` ────────────────────────────────────────────────
 * Two reasons, and the second stands on its own. (1) Phase 1 of this plan set rewrites the memory
 * half of that file in the same worktree, and two sessions appending to one file is a merge
 * conflict manufactured on purpose. (2) That file's docstring scopes it to what `/admin/nina`
 * accepts, and this is a different route over a different table.
 *
 * ── WHAT A SCHEMA IS AND IS NOT ─────────────────────────────────────────────────────────────
 * Next 16's Server Actions guide, verbatim: *"Schema validation (zod or similar) only checks the
 * shape of the input. A well-formed `Item` object can still refer to a row the caller does not
 * own."* So nothing here knows a user id. Ownership is the ACTION's job, in two places it cannot
 * skip: `isAdminChatPhotoPathname(pathname, userId)` binds the blob path to the session, and every
 * query below it carries `user_id` in its WHERE (invariant 3).
 *
 * What IS here: the cross-field tie between `blobUrl` and `pathname`, because that one is a pure
 * question about the payload and belongs where the payload is checked.
 */

/** `nina_message_images.id` is `newId()` — nanoid(12) over the URL-safe alphabet. */
const chatPhotoId = z.string().regex(/^[A-Za-z0-9_-]{12}$/)

/**
 * What the browser reports about the object it just PUT. Every one of these is a CLAIM: the bytes
 * went straight to Blob and no action here ever saw them.
 *
 * The byte ceiling is the same constant `/api/admin/nina/upload` hands Blob as
 * `maximumSizeInBytes`, so this is a second agreeing check rather than a second opinion — Blob
 * enforces it at PUT time and refuses the object, and this refuses the row.
 */
const uploadedBlob = {
  blobUrl: z.string().min(1).max(ADMIN_CHAT_PHOTO_MAX_URL_CHARS),
  pathname: z.string().min(1).max(512),
  width: z.number().int().positive().max(ADMIN_CHAT_PHOTO_MAX_EDGE_PX),
  height: z.number().int().positive().max(ADMIN_CHAT_PHOTO_MAX_EDGE_PX),
  bytes: z.number().int().positive().max(ADMIN_CHAT_PHOTO_MAX_UPLOAD_BYTES),
}

const BLOB_MISMATCH = 'blobUrl and pathname describe different objects'

/** "Put a new photograph in the collection." Mints the message + image pair. */
export const chatPhotoAddSchema = z
  .object({ ...uploadedBlob })
  .refine((value) => blobUrlMatchesPathname(value.blobUrl, value.pathname), {
    message: BLOB_MISMATCH,
    path: ['blobUrl'],
  })

/** "Swap the bytes behind this row." The row id plus the same claims. */
export const chatPhotoReplaceSchema = z
  .object({ id: chatPhotoId, ...uploadedBlob })
  .refine((value) => blobUrlMatchesPathname(value.blobUrl, value.pathname), {
    message: BLOB_MISMATCH,
    path: ['blobUrl'],
  })

/**
 * "Take this row away." An object rather than a bare string, so a later field (a reason, a
 * keep-the-message flag) is additive on an action the grid already calls.
 */
export const chatPhotoRemoveSchema = z.object({ id: chatPhotoId })

export type ChatPhotoAddInput = z.infer<typeof chatPhotoAddSchema>
export type ChatPhotoReplaceInput = z.infer<typeof chatPhotoReplaceSchema>
export type ChatPhotoRemoveInput = z.infer<typeof chatPhotoRemoveSchema>
```

**Impact:** a new module. `zod@4.4.3` is already a dependency.

---

### Step 3: The four queries

**File:** `lib/nina/queries.ts`

**3a — the import list.** Add `or` to the existing `drizzle-orm` import (`:1-13`), which becomes:

```ts
import {
  and,
  asc,
  desc,
  eq,
  gte,
  inArray,
  isNotNull,
  isNull,
  max,
  or,
  sql,
  type SQL,
} from 'drizzle-orm'
```

**3b — the block.** Insert immediately **before** the
`/* === §6 Memory — slots and the ledger (RU-6) === */` banner (currently `:1304`, right after
`getNinaMessageImagesForMessages` ends at `:1302`). Every function takes `userId` first and carries
it in the WHERE (invariant 3).

```ts
/* ============================================================================
 * §5b Conversation photographs — the admin write side (R2, phase 3)
 *
 * `/admin/photos` is the only caller. Every statement here is owner-scoped and none of them is
 * reachable from a runner-facing path, which is why they sit in their own block rather than in §5:
 * §5 is what the chat reads and what the worker writes, and this is what the operator changes.
 * ==========================================================================*/

/** The four measurements plus the two references a replaced photograph carries. */
export interface NinaChatPhotoBlobPatch {
  blobUrl: string
  pathname: string
  width: number
  height: number
  bytes: number
}

/**
 * **REPLACE: new bytes behind an existing row.** R2, verbatim: *"replace a photo in there with a
 * new photo"*.
 *
 * ── WHAT IT DELIBERATELY DOES NOT TOUCH, AND WHY EACH ONE MATTERS ───────────────────────────
 *   · `id` — the row is the same row. `/nina` deep links to it and `attachableIdAt`
 *     (`lib/nina/chatphotos.ts:93`) hands it to the re-attach path.
 *   · `message_id` — the bubble that already exists keeps existing and now shows the new picture.
 *     This IS the requirement; a delete-and-insert would move the photograph to the bottom of the
 *     conversation.
 *   · `created_at` — the gallery is ordered by it (`nina_message_images_user_created_idx`), so
 *     bumping it would silently re-sort `/nina/about`. Replacing a photograph is not taking a new
 *     one.
 *   · `sort_order` — its place inside a multi-image bubble.
 *   · `kind` — and the WHERE below carries `kind = 'generated'` as well, so this statement cannot
 *     reach one of HIS uploads even if an id for one arrives. `/admin/photos` lists only hers.
 *
 * ── WHY `description` AND `prompt` GO TO NULL IN THE SAME STATEMENT ─────────────────────────
 * They described the OLD picture. `description` is not decorative: `lib/nina/gateway.ts:162` puts
 * it in `MessageInput.imageDescriptions` and `lib/nina/actions.ts:604` feeds it to Nina, so a stale
 * one is a sentence she will confidently say about a photograph that is not there — invariant 6's
 * exact failure. Nulling it HERE rather than in a second statement means there is no window in
 * which the row points at new bytes and old prose. NULL degrades honestly: the send path
 * substitutes `NINA_DESCRIPTION_UNAVAILABLE`, the instruction written for it.
 * `lib/admin/chatPhotoActions.ts` earns a fresh description in `after()`.
 *
 * `prompt` is the generation sidecar for bytes that are gone. It has no reader anywhere in the repo
 * (only this file's projection and `insertNinaMessageImages`), and it is already NULL on every
 * `kind = 'upload'` row, so NULL is honest and invisible rather than a marker.
 */
export async function updateNinaChatPhotoBlob(
  userId: string,
  id: string,
  patch: NinaChatPhotoBlobPatch,
): Promise<NinaImageRow | null> {
  const updated = await db
    .update(ninaMessageImages)
    .set({
      blobUrl: patch.blobUrl,
      pathname: patch.pathname,
      width: patch.width,
      height: patch.height,
      bytes: patch.bytes,
      description: null,
      prompt: null,
    })
    .where(
      and(
        eq(ninaMessageImages.userId, userId),
        eq(ninaMessageImages.id, id),
        eq(ninaMessageImages.kind, 'generated'),
      ),
    )
    .returning(imageColumns)

  return updated[0] ?? null
}

/**
 * **REMOVE, the row-only half.** One image off a message that has others, or off a message that is
 * HIS and must survive (the R26 re-attach path). `removeChatPhotoAction` decides which half runs;
 * the other half is `deleteNinaMessage`, whose `ON DELETE CASCADE` takes the image rows with it.
 *
 * Returns the row as it was so the caller knows exactly which object it has stopped referencing —
 * `deleteNinaAvatar`'s shape.
 */
export async function deleteNinaMessageImage(
  userId: string,
  id: string,
): Promise<NinaImageRow | null> {
  const deleted = await db
    .delete(ninaMessageImages)
    .where(and(eq(ninaMessageImages.userId, userId), eq(ninaMessageImages.id, id)))
    .returning(imageColumns)

  return deleted[0] ?? null
}

/**
 * **Is any row still pointing at this Blob object?** The one question that stands between
 * `/admin/photos` and deleting bytes somebody is still rendering.
 *
 * ── WHY THIS EXISTS: BLOB OBJECTS ARE SHARED ────────────────────────────────────────────────
 * `resolveAttachment` (`lib/nina/actions.ts:143-192`) implements R26's re-attach by COPYING
 * `blob_url` and `pathname` onto a NEW row. No bytes are copied. Both of its branches do it:
 *
 *   · the avatar branch (`:166-174`) copies from `nina_avatars` — so a chat photograph's object can
 *     be the object behind **her current profile picture**;
 *   · the image branch (`:185-192`) copies from another `nina_message_images` row.
 *
 * So an unconditional `del()` in `/admin/photos` is a data-loss bug: her face goes blank, or an
 * earlier bubble does, while both rows still point at a dead URL. Invariant 8 (no orphaned blobs)
 * and this pull in opposite directions and correctness wins: an orphan costs storage, and a
 * deleted-but-referenced object is visible data loss the operator cannot undo.
 *
 * ── TWO EXISTENCE CHECKS, NOT A COUNT ───────────────────────────────────────────────────────
 * `LIMIT 1` each — the answer is boolean. Both scoped by `user_id` (invariant 3), which is also
 * correct rather than merely conventional: Blob objects are per-user by pathname
 * (`nina/<userId>/…`), so a row of another user's cannot reference this object and a cross-user
 * read would prove nothing extra.
 *
 * `nina_avatars.thumb_pathname` is checked alongside `pathname`. It cannot collide with what
 * `/admin/photos` writes — a thumbnail is `thumb-<id>.<ext>`, a different filename prefix — and it
 * is checked anyway, because one extra `OR` closes the question permanently instead of resting on a
 * shape argument that a later phase could invalidate.
 *
 * ── NO "EXCEPT THIS ROW" PARAMETER, AND THAT IS A CORRECTNESS PROPERTY ──────────────────────
 * Both callers run this AFTER the row has stopped referencing the pathname — Remove deletes the row
 * (or the message, whose cascade deletes the row) first, and Replace updates the row to the NEW
 * pathname first. That is the same "row first, blob second" ordering `deleteNinaAvatarAction`
 * already states, doing a second job here: an exclusion parameter is unnecessary, and a parameter
 * that does not exist cannot be passed wrongly.
 *
 * ── COST ────────────────────────────────────────────────────────────────────────────────────
 * There is no index on either `pathname` column, so these are bounded scans filtered by `user_id`.
 * At this table's size (single-digit thousands of rows at the horizon, per the analysis) that is
 * correct as-is, and it runs once per human-paced remove or replace. Invariant 10 forbids adding an
 * index anyway.
 */
export async function isBlobPathnameReferenced(
  userId: string,
  pathname: string,
): Promise<boolean> {
  const [images, avatars] = await Promise.all([
    db
      .select({ id: ninaMessageImages.id })
      .from(ninaMessageImages)
      .where(and(eq(ninaMessageImages.userId, userId), eq(ninaMessageImages.pathname, pathname)))
      .limit(1),
    db
      .select({ id: ninaAvatars.id })
      .from(ninaAvatars)
      .where(
        and(
          eq(ninaAvatars.userId, userId),
          or(eq(ninaAvatars.pathname, pathname), eq(ninaAvatars.thumbPathname, pathname)),
        ),
      )
      .limit(1),
  ])

  return images.length > 0 || avatars.length > 0
}

/**
 * Stamp `glm-4.6v`'s prose on a conversation photograph. The mirror of `setNinaAvatarDescription`
 * in §9, and it exists for the mirror reason: a hand-uploaded photograph has no generation prompt,
 * so a vision model is the only way this column is ever filled for one (invariant 5 — the prose is
 * private and its only consumer is Nina's prompt).
 *
 * Returns whether a row was hit, so an `after()` callback whose row was deleted while it ran logs a
 * miss instead of pretending it wrote something.
 */
export async function setNinaMessageImageDescription(
  userId: string,
  id: string,
  description: string,
): Promise<boolean> {
  const updated = await db
    .update(ninaMessageImages)
    .set({ description })
    .where(and(eq(ninaMessageImages.userId, userId), eq(ninaMessageImages.id, id)))
    .returning({ id: ninaMessageImages.id })

  return updated.length > 0
}
```

**Impact:** four new exports plus `or` on the import line. `and`, `eq`, `db`, `ninaMessageImages`,
`ninaAvatars`, `imageColumns` and `NinaImageRow` are all already in scope.
`scripts/check-data-layer-invariants.mjs` reads only `lib/db/queries.ts` and is unaffected.

---

### Step 4: The upload route's third branch

**File:** `app/api/admin/nina/upload/route.ts`
**Change:** two imports and the body of `onBeforeGenerateToken`. **The auth block does not move**:
`blobEnv()` first, `requireAdminApi()` before `handleUpload`, the user id interpolated from the
session. Those three properties are untouched and the diff must show them untouched.

**4a — imports.** Add after the existing `@/lib/admin/avatars` block:

```ts
import {
  ADMIN_CHAT_PHOTO_CONTENT_TYPE,
  ADMIN_CHAT_PHOTO_MAX_UPLOAD_BYTES,
  isAdminChatPhotoPathname,
} from '@/lib/admin/chatPhotos'
```

**4b — append this paragraph to the file docstring**, directly after the *"TWO PATHNAME SHAPES NOW"*
section (before *"Everything above this paragraph still holds"*):

```
 * ── THREE PATHNAME SHAPES NOW, AND THE AUTH BLOCK STILL DID NOT MOVE ────────────────────────
 * `admin-memory-and-chat-photos` phase 3 lets the operator replace, add and remove the photographs
 * in Nina's CHAT collection (`nina_message_images`, `kind = 'generated'`). That is a different
 * table from the album above, and its objects live at `nina/<userId>/selfie-<id>.png` — the shape
 * `ninaImagePathname` writes from the Actions worker. Note what it is NOT: it is not
 * `nina/<userId>/chat/<id>.jpg`, which is the RUNNER composer's shape for HIS uploads and is minted
 * by `/api/upload`, not here.
 *
 * The accepted shape is `nina/<userId>/selfie-<id>.jpg` — same prefix, same segment, same id
 * length, JPEG instead of PNG. PNG is the worker's ENVIRONMENT (`lib/nina/imagerecipe.ts:62`: no
 * `sharp` on the runner), not the collection's format; a browser has an encoder, and re-encoding an
 * operator's JPEG to lossless PNG inflates it five to twenty times for no gain. `.jpg` is already
 * admitted by `NINA_IMAGE_PATHNAME_RE`, so a future `blob-reap` learns one pattern and not two.
 * `lib/admin/chatPhotos.ts` carries the full argument.
 *
 * `isAdminChatPhotoPathname` is a THIRD predicate rather than a widened regex, for the reason the
 * paragraph above already gives about the thumbnail: each shape carries its own
 * `maximumSizeInBytes`, and a single alternation would make the cap conditional on a capture group.
 * It is written segment by segment rather than by interpolating the user id into a pattern —
 * `isNinaChatRequestPathname`'s rule, and the stronger of the two precedents in this repo.
 *
 * TWO parameters differ on this branch and both are named at the branch:
 *   · `maximumSizeInBytes` — `ADMIN_CHAT_PHOTO_MAX_UPLOAD_BYTES` (2 MB). Not the album's 8 MB (an
 *     avatar is never re-encoded; a chat photo always is), not the runner's 900 KB (a different
 *     encoder at a different quality), and clear of the worker's own uncapped 1-2 MB PNG.
 *   · `allowedContentTypes` — JPEG and nothing else, because the accepted pathname ends `.jpg` and
 *     `describeNinaImage` re-validates the stored form.
 *
 * The TTL and the cache max-age do NOT differ, and one of them is worth saying out loud:
 * `NINA_IMAGE_CACHE_MAX_AGE` is 31_536_000 and `ADMIN_AVATAR_CACHE_MAX_AGE` is
 * `60 * 60 * 24 * 365` — the same number, because both say "an object whose pathname carries a
 * random suffix is immutable". No third constant is introduced for either.
```

**4c — the body.** Replace the whole `onBeforeGenerateToken` callback (currently `:120-165`) with:

```ts
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        // The pathname check has to be here — it is the one input only the SDK has. A throw becomes
        // a 400, which is the right shape for "your request was malformed".
        //
        // Three shapes, and each answer is needed twice: to accept the request at all, and to pick
        // the cap. The chat predicate runs first because its shape is the most specific (three
        // segments, one filename prefix, one extension).
        const isChatPhoto = isAdminChatPhotoPathname(pathname, identity.userId)
        const isThumb =
          !isChatPhoto && isAdminAvatarThumbRequestPathname(pathname, identity.userId)
        if (
          !isChatPhoto &&
          !isThumb &&
          !isAdminAvatarRequestPathname(pathname, identity.userId)
        ) {
          throw new Error('Invalid pathname')
        }

        const payload = ClientPayload.parse(JSON.parse(clientPayload || '{}'))

        /*
         * The chat-photo shape stores JPEG and nothing else, because the accepted pathname ends
         * `.jpg` and `lib/nina/vision.ts`'s `toDataUri` reads the served content type back. Said
         * here, at the branch it governs, rather than left to the extension cross-check below: that
         * check was written for the album's three containers and this is a one-container rule.
         */
        if (isChatPhoto && payload.contentType !== ADMIN_CHAT_PHOTO_CONTENT_TYPE) {
          throw new Error('Invalid pathname')
        }

        /*
         * The extension in the pathname and the declared content type must describe the SAME file.
         *
         * Both are client claims, and while there was one pathname shape built by one caller from
         * `extForContentType` they could not disagree. There are three shapes and three encoders now
         * — the album original keeps its source container, the thumbnail is whatever the canvas
         * chose, the chat photo is always JPEG — so "a `.webp` name over JPEG bytes" is reachable.
         * `lib/nina/vision.ts`'s `toDataUri` reads a blob's served content type BACK rather than
         * assuming it, and says why: labelling PNG bytes `image/jpeg` in a data URI is a lie told to
         * a vendor whose failure mode is "200 OK with invented content". Refusing the mislabel at
         * mint time is cheaper than detecting it at describe time.
         */
        const declaredExt = extForContentType(payload.contentType)
        if (declaredExt == null || !pathname.endsWith(`.${declaredExt}`)) {
          throw new Error('Invalid pathname')
        }

        return {
          allowedContentTypes: [payload.contentType],
          /*
           * The one parameter that branches by size. See the header: 2 MB for a chat photograph the
           * browser re-encoded, 512 KB for a derived thumbnail, 8 MB for an album original that is
           * never re-encoded. A cap that silently becomes a bigger cap is exactly the mistake worth
           * making structurally impossible, which is why each shape has its own predicate.
           */
          maximumSizeInBytes: isChatPhoto
            ? ADMIN_CHAT_PHOTO_MAX_UPLOAD_BYTES
            : isThumb
              ? ADMIN_AVATAR_THUMB_MAX_UPLOAD_BYTES
              : ADMIN_AVATAR_MAX_UPLOAD_BYTES,
          addRandomSuffix: true, // collision-proof; rewrites the stored pathname
          allowOverwrite: false, // never clobber an existing blob
          cacheControlMaxAge: ADMIN_AVATAR_CACHE_MAX_AGE,
          validUntil: Date.now() + ADMIN_AVATAR_TOKEN_TTL_MS,
          tokenPayload: JSON.stringify({ userId: identity.userId }),
        }
      },
```

**Impact:**
- `/admin/photos` can mint upload tokens. `/admin/nina` is unaffected — both avatar branches keep the
  same predicate, cap, TTL and cache age, and `tokenPayload` is byte-identical.
- `isThumb` is now guarded by `!isChatPhoto`. The shapes cannot both match (`thumb-` and `selfie-`
  are different filename prefixes), so this is defensive and changes no outcome.
- A signed-in non-admin still gets `forbiddenJson()`'s 404 from before `handleUpload`, and a
  signed-out caller still gets `unauthorizedJson()`'s 401. Unchanged.
- `ClientPayload`'s `z.enum(ADMIN_AVATAR_CONTENT_TYPES)` already admits `'image/jpeg'`, so the
  schema needs no edit.

---

### Step 5: The three Server Actions

**File:** `lib/admin/chatPhotoActions.ts` (new)
**Code:**

```ts
'use server'

import { del } from '@vercel/blob'
import { revalidatePath } from 'next/cache'
import { after } from 'next/server'

import {
  ADMIN_CHAT_PHOTOS_PATH,
  isAdminChatPhotoPathname,
  isNinaPhotoCarrierMessage,
  type ChatPhotoActionResult,
} from '@/lib/admin/chatPhotos'
import {
  chatPhotoAddSchema,
  chatPhotoRemoveSchema,
  chatPhotoReplaceSchema,
} from '@/lib/admin/chatPhotoSchema'
import { requireAdmin } from '@/lib/admin/requireAdmin'
import { newId } from '@/lib/id'
import { ninaImageCaption } from '@/lib/nina/imagefail'
import {
  deleteNinaMessage,
  deleteNinaMessageImage,
  getNinaMessageImage,
  getNinaMessageImagesForMessages,
  getNinaMessagesByIds,
  insertNinaMessageImages,
  insertNinaMessages,
  isBlobPathnameReferenced,
  setNinaMessageImageDescription,
  updateNinaChatPhotoBlob,
} from '@/lib/nina/queries'
import { resolveNinaWriteSession } from '@/lib/nina/sessionResolve'
import { describeNinaImages } from '@/lib/nina/vision'

/**
 * Nina's chat photographs, from `/admin`. R2's write half: *"user can replace a photo in there with
 * a new photo, or add a new photo (so it is like nina generated them, but actually it is manually
 * added by user) or remove a photo"*.
 *
 * Every action opens with `requireAdmin()`, ABOVE any use of an argument, and is scoped to the id it
 * returns. `proxy.ts` does not match `/admin` at all (ruling D3), so this line is the authorization
 * — and Next 16's own Server Actions guide says why it has to be: *"the route is reachable to
 * anyone who can send the same POST. Treat every action as an untrusted entry point."*
 *
 * ── NO CONFIRMATIONS. ANYWHERE. ─────────────────────────────────────────────────────────────
 * R1's ruling — *"i am the only one using this app, no need for all these bullshit confirmation"* —
 * is a property of this admin surface, not of one page. One click, it happens. There is no dialog,
 * no `window.confirm`, no typed string, no second button and no `confirming` state in this file or
 * in the three components that call it. A Zod refusal is NOT a confirmation: it is a validation
 * failure and it is reported inline (invariant 4).
 *
 * ── NO ACTION HERE EVER SEES IMAGE BYTES ────────────────────────────────────────────────────
 * Server Action requests are capped at 1 MB by the framework (the Server Actions guide, "Body size
 * limit"). The browser PUTs straight to Blob through `/api/admin/nina/upload` and hands these
 * actions a URL, a pathname and four integers. That is a design constraint, not a convenience: a
 * 2 MB photograph through an action body would be a 500 with no useful message.
 *
 * ── THE CLAIMS ARE CHECKED TWICE, IN TWO DIFFERENT WAYS ─────────────────────────────────────
 * The Zod schemas bound the SHAPE and tie `blobUrl` to `pathname`. They know no user id, and the
 * guide is explicit that they cannot: *"A well-formed `Item` object can still refer to a row the
 * caller does not own."* So each action then binds the payload to the session with
 * `isAdminChatPhotoPathname(pathname, userId)` — the same predicate the token mint used — and
 * re-reads the row it is about to change through an owner-scoped query (invariant 3).
 *
 * ── `insertNinaMessageImages` RETURNING `[]` IS NOT SUCCESS ─────────────────────────────────
 * It validates the message FK by hand against the caller's own messages and returns `[]` rather
 * than throwing on a mismatch (`lib/nina/queries.ts:1198-1213`). `addChatPhotoAction` treats that
 * as a failure and UNDOES the message it just wrote, because a caption bubble with no picture is
 * the exact defect `removeChatPhotoAction` exists to prevent.
 *
 * ── A BLOB OBJECT MAY BE SHARED. NOTHING HERE CALLS `del` DIRECTLY. ─────────────────────────
 * R26's re-attach path copies `blob_url`/`pathname` onto a new row rather than copying bytes
 * (`lib/nina/actions.ts:143-192`), so a chat photograph's object can also be another chat row's or
 * a `nina_avatars` row's — possibly HER CURRENT PROFILE PICTURE. Every delete in this file goes
 * through `releaseChatPhotoBlob`, which asks `isBlobPathnameReferenced` first. Invariant 8 (no
 * orphaned blobs) yields to that: an orphan costs storage, a deleted-but-referenced object is
 * visible data loss.
 *
 * ── WHAT THIS FILE DOES NOT DO ──────────────────────────────────────────────────────────────
 *  · It writes no new `kind`, no new `NinaMessageSource` and no admin column. A photograph added
 *    here is indistinguishable downstream from one `finishSelfie` wrote (invariant 7); the phase
 *    plan's D1 justifies every column value.
 *  · It touches no runner-facing module. `photoSideOf`, `chatViewerPhotos`, `galleryPhotos` and the
 *    chat bubble renderer are unchanged and that is the proof, not the hope.
 *  · It writes no migration (invariant 10).
 */

/* ── REPLACE ─────────────────────────────────────────────────────────────────────────────── */

/**
 * Swap the bytes behind an existing photograph, keeping the row, its message, its `created_at` and
 * its place in the conversation — so the bubble that already exists shows the new picture.
 *
 * ── ROW FIRST, OLD BLOB SECOND ──────────────────────────────────────────────────────────────
 * `deleteNinaAvatarAction`'s rule (`lib/admin/ninaAlbumActions.ts:186-191`), and it points the same
 * way here: a failed `del` leaves an orphan, which is recoverable; a deleted blob under a live row
 * is a permanently broken image in the runner's chat. It also does a second job — by the time the
 * release runs, this row already points at the NEW pathname, so it is out of the reference answer
 * and no "except this row" parameter is needed.
 *
 * The `existing.pathname !== pathname` guard is not paranoia: `addRandomSuffix` makes a collision
 * impossible in practice, and deleting the object the row now points at would be unrecoverable, so
 * the one comparison that rules it out is worth making.
 */
export async function replaceChatPhotoAction(input: unknown): Promise<ChatPhotoActionResult> {
  const { userId } = await requireAdmin()

  const parsed = chatPhotoReplaceSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'That upload did not describe a photo.' }
  const { id, blobUrl, pathname, width, height, bytes } = parsed.data

  if (!isAdminChatPhotoPathname(pathname, userId)) {
    return { ok: false, error: 'That file did not land in her photo folder.' }
  }

  const existing = await getNinaMessageImage(userId, id)
  if (existing == null) return { ok: false, error: 'That photo is not in the collection.' }
  if (existing.kind !== 'generated') {
    return { ok: false, error: 'That one is his upload, not hers.' }
  }

  const updated = await updateNinaChatPhotoBlob(userId, id, {
    blobUrl,
    pathname,
    width,
    height,
    bytes,
  })
  if (updated == null) return { ok: false, error: 'That photo is not in the collection.' }

  let note: string | undefined
  if (existing.pathname !== pathname) {
    const outcome = await releaseChatPhotoBlob(userId, existing)
    if (outcome === 'shared') note = 'The old file is still used elsewhere, so it was kept.'
  }

  scheduleChatPhotoDescribe(userId, id)

  revalidatePath(ADMIN_CHAT_PHOTOS_PATH)
  return { ok: true, id, ...(note === undefined ? {} : { note }) }
}

/* ── ADD ─────────────────────────────────────────────────────────────────────────────────── */

/**
 * *"add a new photo (so it is like nina generated them, but actually it is manually added by
 * user)"* — a literal specification of the storage shape, and this writes exactly the pair
 * `finishSelfie` writes (`scripts/nina-image-worker.ts:427`).
 *
 * `nina_message_images.message_id` is `NOT NULL` and the column's own comment says why — *"an image
 * with no message is nothing"* — so there is no floating chat photo and "add a photo" is
 * unavoidably "add a message with a photo on it". No third shape is invented.
 *
 * ── THE FOUR VALUES THAT HAVE NO JOB TO TAKE THEM FROM ──────────────────────────────────────
 *   · `text` — `ninaImageCaption(newId())`. The SAME function, seeded with a fresh nanoid(12)
 *     instead of a job id. `pickLine` is a pure FNV-1a over its key and a job id is itself a
 *     nanoid(12), so the distribution is identical and the result is always one of the five strings
 *     in `NINA_IMAGE_CAPTIONS` — which is also what makes `isNinaPhotoCarrierMessage` recognise
 *     this message later. Her words keep exactly one definition in the repo.
 *   · `turnId` — NULL. `nina_turns` holds no message text and asserts that a model call happened
 *     and what it cost; none did and nothing was paid. Nothing renders the column
 *     (`lib/db/schema.ts:799`).
 *   · `replyToId` — NULL. The worker's subselect resolves *the runner message that asked*; nobody
 *     asked. `resolveQuote` degrades a null to a plain message by design.
 *   · `sessionId` — `resolveNinaWriteSession`. `nina_messages.session_id` is `NOT NULL` with an FK,
 *     `insertNinaMessages` takes it as a required third argument, and `lib/nina/sessionResolve.ts`
 *     holds assumption A3's ONE policy for a writer with nobody looking. It creates a session when
 *     he has none, so this works on a fresh account.
 *
 * `prompt` is NULL because there was no generation, and it has no reader anywhere in the repo.
 * `description` is NULL at insert and earned below, because a hand-uploaded photograph has no
 * generation prompt and `glm-4.6v` is the only thing that can say what is in it.
 */
export async function addChatPhotoAction(input: unknown): Promise<ChatPhotoActionResult> {
  const { userId } = await requireAdmin()

  const parsed = chatPhotoAddSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'That upload did not describe a photo.' }
  const { blobUrl, pathname, width, height, bytes } = parsed.data

  if (!isAdminChatPhotoPathname(pathname, userId)) {
    return { ok: false, error: 'That file did not land in her photo folder.' }
  }

  const sessionId = await resolveNinaWriteSession(userId)

  const [message] = await insertNinaMessages(
    userId,
    [
      {
        role: 'nina',
        body: ninaImageCaption(newId()),
        source: 'chat',
        turnId: null,
        replyToId: null,
        runId: null,
      },
    ],
    sessionId,
  )
  if (message == null) {
    return { ok: false, error: 'Could not open a place in the conversation for it.' }
  }

  const [image] = await insertNinaMessageImages(userId, [
    {
      messageId: message.id,
      kind: 'generated',
      blobUrl,
      pathname,
      width,
      height,
      bytes,
      description: null,
      prompt: null,
      sortOrder: 0,
    },
  ])

  /*
   * `[]` IS NOT SUCCESS. `insertNinaMessageImages` validates the message FK by hand and returns an
   * empty array on a mismatch rather than throwing. Leaving it there would put a caption bubble with
   * no picture in the runner's chat forever — the exact defect `removeChatPhotoAction` exists to
   * prevent — so the message is undone and the object we just uploaded is released with it. The
   * release goes through the same helper as everything else: this object is brand new and carries a
   * random suffix, so nothing can reference it, but a delete path that is uniform is a delete path
   * that cannot be the one that forgot to check.
   */
  if (image == null) {
    await deleteNinaMessage(userId, message.id)
    await releaseChatPhotoBlob(userId, { blobUrl, pathname })
    return { ok: false, error: 'The photo could not be attached to a message.' }
  }

  scheduleChatPhotoDescribe(userId, image.id)

  revalidatePath(ADMIN_CHAT_PHOTOS_PATH)
  return { ok: true, id: image.id }
}

/* ── REMOVE ──────────────────────────────────────────────────────────────────────────────── */

/**
 * Take a photograph out of the collection, its Blob object with it when nothing else needs it —
 * and, when the message existed only to carry it, the message too.
 *
 * ── THE EMPTY BUBBLE, RESOLVED ──────────────────────────────────────────────────────────────
 * `finishSelfie`'s message exists ONLY to carry the photograph, so removing its last image would
 * leave a caption bubble with no picture in the runner's chat, forever. When this is the last image
 * on such a message, the MESSAGE is deleted and `nina_message_images.message_id`'s
 * `ON DELETE CASCADE` takes the image row with it — one statement, and the order is Postgres's
 * rather than two statements with a crash window between them.
 *
 * It must NOT delete a RUNNER message that merely carried her re-attached photograph
 * (`lib/nina/actions.ts:518-530`, the R26 path): that message is his and carries his text. Both
 * clauses of that rule live in `isNinaPhotoCarrierMessage` and are argued at its definition.
 *
 * ── ROW FIRST, BLOB SECOND, AND ONLY IF NOTHING ELSE POINTS AT IT ───────────────────────────
 * The same R26 path that produced the runner-message case also produced the SHARED-OBJECT case: it
 * copies `blob_url`/`pathname` rather than bytes, so the object behind this row may also be behind
 * another chat row or a `nina_avatars` row — possibly her current profile picture.
 * `releaseChatPhotoBlob` asks first. Deleting the row before asking is what makes the question
 * answerable without an exclusion parameter.
 */
export async function removeChatPhotoAction(input: unknown): Promise<ChatPhotoActionResult> {
  const { userId } = await requireAdmin()

  const parsed = chatPhotoRemoveSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'Not a photo id.' }
  const { id } = parsed.data

  const row = await getNinaMessageImage(userId, id)
  if (row == null) return { ok: false, error: 'That photo is not in the collection.' }

  const [message, siblings] = await Promise.all([
    getNinaMessagesByIds(userId, [row.messageId]).then((rows) => rows[0] ?? null),
    getNinaMessageImagesForMessages(userId, [row.messageId]),
  ])
  const isLastImage = siblings.every((sibling) => sibling.id === id)

  if (isLastImage && message != null && isNinaPhotoCarrierMessage(message)) {
    const gone = await deleteNinaMessage(userId, message.id)
    if (gone == null) return { ok: false, error: 'That photo is not in the collection.' }
  } else {
    const gone = await deleteNinaMessageImage(userId, id)
    if (gone == null) return { ok: false, error: 'That photo is not in the collection.' }
  }

  const outcome = await releaseChatPhotoBlob(userId, row)

  revalidatePath(ADMIN_CHAT_PHOTOS_PATH)
  return {
    ok: true,
    id,
    ...(outcome === 'shared'
      ? { note: 'The file is still used elsewhere, so it was kept in the store.' }
      : {}),
  }
}

/* ── The two helpers ─────────────────────────────────────────────────────────────────────── */

/**
 * **Delete a Blob object we have just stopped pointing at — but only if nothing else points at
 * it.** The one place `del` is called in this file, so Replace and Remove cannot drift.
 *
 * ── WHY THE CHECK EXISTS ────────────────────────────────────────────────────────────────────
 * `resolveAttachment` (`lib/nina/actions.ts:143-192`) implements R26 by copying `blob_url` and
 * `pathname` onto a new row. No bytes are copied. So one object can be behind a chat row AND
 * another chat row AND a `nina_avatars` row — including the one that IS her current profile
 * picture. An unconditional `del` here blanks her face, or an older bubble, while the rows still
 * point at a dead URL. `isBlobPathnameReferenced` asks both tables, scoped by `user_id`.
 *
 * ── WHY IT IS SAFE TO ASK AFTER THE ROW IS GONE ─────────────────────────────────────────────
 * Because that is the ONLY time it is safe to ask. Every caller has already removed its own
 * reference — Remove deleted the row (or the message, whose cascade deleted it), Replace repointed
 * the row at the new pathname — so the row being changed is out of the answer by construction, and
 * there is no "except this one" parameter that a future caller could pass wrongly.
 *
 * ── WHAT IT COSTS WHEN IT SAYS "SHARED" ─────────────────────────────────────────────────────
 * The object stays in the store while the row that named it is gone. That is a deliberate orphan
 * class and `reap-orphaned-blobs` is its backstop — which is what a backstop is for. The
 * alternative is unrecoverable data loss, and invariant 8 does not outrank that.
 *
 * `'failed'` is logged, not surfaced: a `del` that 500s leaves an orphan, which is recoverable, and
 * the operator asked for the photograph to leave the collection, which it has.
 */
async function releaseChatPhotoBlob(
  userId: string,
  ref: { blobUrl: string; pathname: string },
): Promise<'deleted' | 'shared' | 'failed'> {
  let shared: boolean
  try {
    shared = await isBlobPathnameReferenced(userId, ref.pathname)
  } catch (cause) {
    // Could not prove it is unreferenced, so do not delete it. Erring toward an orphan is the only
    // direction that is recoverable.
    console.error('[f36] could not check blob references; keeping the object', ref.pathname, cause)
    return 'failed'
  }

  if (shared) {
    console.info('[f36] blob kept: another row still points at it', ref.pathname)
    return 'shared'
  }

  try {
    await del(ref.blobUrl)
    return 'deleted'
  } catch (cause) {
    console.error('[f36] row gone, blob left behind', ref.pathname, cause)
    return 'failed'
  }
}

/**
 * Fill in a missing description AFTER the response has gone out. Not exported: a `'use server'`
 * module may export only async functions, and this is a synchronous scheduler.
 *
 * ── WHY IT RUNS AT ALL ──────────────────────────────────────────────────────────────────────
 * A GENERATED photograph gets its `description` from `args.scene` — we wrote the picture, so we
 * already know what is in it. A hand-uploaded one has no prompt, and `glm-4.6v` is the only way the
 * column is ever filled for it. That is the whole difference between the two paths, and it is why
 * leaving the column NULL forever would make an admin-added row DISTINGUISHABLE from a generated
 * one in the one way that matters downstream: `lib/nina/gateway.ts:162` puts this text in Nina's
 * context window and `lib/nina/actions.ts:604` feeds it to her on the send path. Invariant 7 is
 * satisfied by filling it, not by skipping it. Invariant 5 still holds: the prose is private, only
 * `/admin` may display it, and nothing it renders reaches a runner-facing caption.
 *
 * ── WHY `after()` AND NOT `await` ───────────────────────────────────────────────────────────
 * `lib/admin/ninaAlbumActions.ts:300-320`'s `scheduleDescribe`, same shape and same measurement: a
 * describe call is ~8-11 s (`NINA_DESCRIBE_TIMEOUT_MS = 25_000`), and Server Actions dispatch one at
 * a time per client — so an awaited call would put that latency on every replace and every add, in
 * series. Non-fatal by design: the row exists, the grid renders, and a failure leaves a NULL that
 * the send path already substitutes `NINA_DESCRIPTION_UNAVAILABLE` for.
 *
 * ── WHY IT RE-READS THE ROW INSIDE THE CALLBACK ─────────────────────────────────────────────
 * So the caller pays nothing, and so the skip is authoritative at the moment the work would run — a
 * row removed between the click and the callback is a miss, not a vendor call.
 *
 * No `revalidatePath` in here: `after()` runs once the response is finished, so there is no
 * re-render left to attach to.
 */
function scheduleChatPhotoDescribe(userId: string, id: string): void {
  after(async () => {
    try {
      const row = await getNinaMessageImage(userId, id)
      if (row == null || row.description != null) return
      const { description } = await describeNinaImages([
        { blobUrl: row.blobUrl, pathname: row.pathname },
      ])
      await setNinaMessageImageDescription(userId, id, description)
    } catch (cause) {
      console.warn('[f36] chat photo describe failed; the row keeps a null description', {
        id,
        error: String(cause),
      })
    }
  })
}
```

**Impact:** the collection becomes writable. `revalidatePath(ADMIN_CHAT_PHOTOS_PATH)` makes phase 2's
page re-render inside the same response, so no control needs `router.refresh()`.

---

### Step 6: The client upload helper

**File:** `components/admin/chatPhotoUpload.ts` (new)
**Code:**

```ts
'use client'

import { upload } from '@vercel/blob/client'

import { ADMIN_CHAT_PHOTO_CONTENT_TYPE, adminChatPhotoPathname } from '@/lib/admin/chatPhotos'
import { newId } from '@/lib/id'

/**
 * A picked file -> an object in Blob at `nina/<userId>/selfie-<id>.jpg` -> the claims
 * `addChatPhotoAction` / `replaceChatPhotoAction` need.
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
 * ── WHY THIS RE-ENCODES WHEN `UploadAvatar` REFUSES TO ──────────────────────────────────────
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
 * Encode, then PUT straight to Blob through the admin handshake.
 *
 * `adminChatPhotoPathname` is what the client may ASK for; Blob rewrites it with a random suffix and
 * the STORED pathname is whatever `upload` returned — which is why `ADMIN_CHAT_PHOTO_ID_RE` admits
 * 12-24 symbols and why the actions re-validate the returned pathname rather than the requested one.
 *
 * `handleUploadUrl` is the ADMIN route and not `/api/upload`: that route mints tokens for a
 * merely-signed-in session and knows nothing about this pathname shape.
 */
export async function uploadChatPhoto(userId: string, file: File): Promise<UploadedChatPhoto> {
  const encoded = await encodeChatPhotoJpeg(file)
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
  }
}
```

**Impact:** new client module. `@vercel/blob/client`'s `upload` is already used by
`components/admin/explorer/useFolderUpload.ts`.

---

### Step 7: Replace and Remove, per photo

**File:** `components/admin/ChatPhotoControls.tsx` (new)
**Change:** the pair that renders on phase 2's detail rail. **It takes only `userId` and `photoId`**
— two strings — so it is immune to whatever shape phase 2 gave its photo model.
**Code:**

```tsx
'use client'

import { useRef, useState } from 'react'

import { removeChatPhotoAction, replaceChatPhotoAction } from '@/lib/admin/chatPhotoActions'

import { uploadChatPhoto } from './chatPhotoUpload'

/**
 * Replace and Remove, for one of Nina's chat photographs. R2's two per-photo verbs.
 *
 * ── NO CONFIRMATION, AND THAT IS THE REQUIREMENT ────────────────────────────────────────────
 * *"i am the only one using this app, no need for all these bullshit confirmation"*. Remove calls
 * the action on click. Replace opens the file picker on click and uploads on `change`. There is no
 * dialog, no `window.confirm`, no typed string, no second button and no `confirming` state — the
 * `busy` state below exists only to stop a double-click firing two uploads, which is a different
 * thing entirely.
 *
 * ── PROPS ARE TWO STRINGS ON PURPOSE ────────────────────────────────────────────────────────
 * Phase 2 owns the photo model and this component deliberately does not read it. A prop rename over
 * there cannot break this file, and this file cannot constrain phase 2's card shape.
 *
 * ── `note` IS RENDERED, AND IT IS NOT AN ERROR ──────────────────────────────────────────────
 * A removed or replaced photograph whose Blob object is still referenced by another row keeps its
 * bytes in the store, and the action says so. `ok` is true and the operation did what was asked; the
 * operator gets the sentence anyway. See the phase plan's D5.
 *
 * ── NO `router.refresh()` ───────────────────────────────────────────────────────────────────
 * Next 16's Server Actions guide: *"When `updateTag`, `revalidatePath`, or `refresh` runs, Next.js
 * re-renders the current route server-side and includes a newly rendered RSC Payload in the action's
 * response, so the page reflects the change in the same roundtrip."* Every action here ends with
 * `revalidatePath(ADMIN_CHAT_PHOTOS_PATH)`, so the grid updates with no second request.
 */
export function ChatPhotoControls({ userId, photoId }: { userId: string; photoId: string }) {
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
      else if (result.note != null) setNote(result.note)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'That removal failed.')
    } finally {
      setBusy('idle')
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="rounded-md border border-border px-3 py-1.5 text-sm disabled:opacity-50"
          disabled={busy !== 'idle'}
          onClick={() => fileRef.current?.click()}
        >
          {busy === 'replacing' ? 'Replacing…' : 'Replace'}
        </button>
        <button
          type="button"
          className="rounded-md border border-destructive px-3 py-1.5 text-sm text-destructive disabled:opacity-50"
          disabled={busy !== 'idle'}
          onClick={() => void onRemove()}
        >
          {busy === 'removing' ? 'Removing…' : 'Remove'}
        </button>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(event) => void onPick(event)}
      />

      {error !== null && <p className="text-sm text-destructive">{error}</p>}
      {note !== null && <p className="text-sm text-muted-foreground">{note}</p>}
    </div>
  )
}
```

**Impact:** new client component. It renders nothing until phase 2's grid mounts it.

> **Styling note for the implementer.** The class names above follow the repo's Tailwind token
> vocabulary. Match whatever phase 2's `ChatPhotoGrid` uses for its own buttons; the class strings
> are the one part of this file that may be adjusted freely.

---

### Step 8: Add, for the collection

**File:** `components/admin/ChatPhotoAdd.tsx` (new)
**Code:**

```tsx
'use client'

import { useRef, useState } from 'react'

import { addChatPhotoAction } from '@/lib/admin/chatPhotoActions'

import { uploadChatPhoto } from './chatPhotoUpload'

/**
 * *"or add a new photo (so it is like nina generated them, but actually it is manually added by
 * user)"*. One control, at the collection level, because the thing being added does not belong to
 * any photograph already there.
 *
 * ── SEQUENTIAL, NOT `Promise.all` ───────────────────────────────────────────────────────────
 * Next 16's Server Actions guide: *"Next.js dispatches Server Actions one at a time per client… do
 * not rely on `Promise.all` to parallelize Server Actions from the client."* So a multi-file pick is
 * a `for` loop, and the loop is honest about it — the counter below is what the operator watches.
 * The uploads are serialized with it, which is fine at this scale: this is "drop the three photos
 * you actually want in her chat", not `/admin/nina`'s three hundred, and that is exactly why this
 * file has no lanes, no queue model and no register-in-chunks machinery.
 *
 * A per-file failure is not a batch failure: the loop records the message and continues, so one bad
 * frame does not lose the rest. Same rule as `useFolderUpload`'s lanes, one order of magnitude
 * simpler.
 *
 * No confirmation, here either — picking files IS the gesture.
 */
export function ChatPhotoAdd({ userId }: { userId: string }) {
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [errors, setErrors] = useState<readonly string[]>([])
  const fileRef = useRef<HTMLInputElement>(null)

  const onPick = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? [])
    event.target.value = ''
    if (files.length === 0 || busy) return

    setBusy(true)
    setErrors([])
    setProgress({ done: 0, total: files.length })

    const failures: string[] = []
    for (const [index, file] of files.entries()) {
      try {
        const uploaded = await uploadChatPhoto(userId, file)
        const result = await addChatPhotoAction(uploaded)
        if (!result.ok) failures.push(`${file.name}: ${result.error ?? 'refused'}`)
      } catch (cause) {
        failures.push(`${file.name}: ${cause instanceof Error ? cause.message : 'upload failed'}`)
      }
      setProgress({ done: index + 1, total: files.length })
    }

    setErrors(failures)
    setProgress(null)
    setBusy(false)
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        className="rounded-md border border-border px-3 py-1.5 text-sm disabled:opacity-50"
        disabled={busy}
        onClick={() => fileRef.current?.click()}
      >
        {progress === null ? 'Add photo' : `Adding ${progress.done}/${progress.total}…`}
      </button>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(event) => void onPick(event)}
      />

      {errors.length > 0 && (
        <ul className="text-sm text-destructive">
          {errors.map((message) => (
            <li key={message}>{message}</li>
          ))}
        </ul>
      )}
    </div>
  )
}
```

**Impact:** new client component.

---

### Step 9: Wire the three controls into phase 2's seams

**File:** `components/admin/ChatPhotoGrid.tsx` (phase 2's; **two imports and two JSX lines**)

At the top:

```tsx
import { ChatPhotoAdd } from './ChatPhotoAdd'
import { ChatPhotoControls } from './ChatPhotoControls'
```

At the **collection-level seam** in the grid's header/toolbar, replace the seam comment with:

```tsx
        {/* Phase 3 — R2's "add a new photo". No confirmation: picking files IS the gesture. */}
        <ChatPhotoAdd userId={userId} />
```

At the **per-photo seam** on the detail rail, where the selected photo is in scope:

```tsx
          {/* Phase 3 — R2's "replace" and "remove". One click each, no confirmation. */}
          <ChatPhotoControls userId={userId} photoId={selected.id} />
```

**Impact:** phase 2's read-only page becomes the write surface. This is the **only** edit phase 3
makes to a file phase 2 owns, and it is two lines plus two imports so a conflict is trivially
resolvable. Nothing about phase 2's photo model, prop names or layout is depended on beyond `userId`
being in scope and the selected photo having an `id`.

> If phase 2 named the selected photo something other than `selected`, change the one expression.
> If phase 2's grid does not receive `userId`, see Risk 2.

---

### Step 10: The test suite

**File:** `tests/admin.chatPhotos.test.ts` (new)
**Change:** the pure half of this phase — everything decidable without a database or a browser.
`tests/admin.avatars.test.ts` is the shape.
**Code:**

```ts
import { describe, expect, it } from 'vitest'

import { ADMIN_AVATAR_MAX_UPLOAD_BYTES } from '@/lib/admin/avatars'
import {
  ADMIN_CHAT_PHOTO_MAX_UPLOAD_BYTES,
  adminChatPhotoPathname,
  blobUrlMatchesPathname,
  isAdminChatPhotoPathname,
  isHttpsBlobUrl,
  isNinaPhotoCarrierMessage,
} from '@/lib/admin/chatPhotos'
import {
  chatPhotoAddSchema,
  chatPhotoRemoveSchema,
  chatPhotoReplaceSchema,
} from '@/lib/admin/chatPhotoSchema'
import { ADMIN_CHAT_PHOTO_LONG_EDGE_PX } from '@/components/admin/chatPhotoUpload'
import { NINA_IMAGE_CAPTIONS, ninaImageCaption } from '@/lib/nina/imagefail'
import {
  NINA_IMAGE_HEIGHT,
  NINA_IMAGE_PATHNAME_RE,
  ninaImagePathname,
} from '@/lib/nina/imagerecipe'
import { NINA_CHAT_MAX_UPLOAD_BYTES, ninaChatPathname } from '@/lib/nina/images'

/**
 * `admin-memory-and-chat-photos` phase 3's boundary logic — the half that needs no database and no
 * DOM: the pathname agreement with her own writer, the URL predicates, the empty-bubble rule, the
 * three Zod payloads, and the cross-module agreements that would otherwise only fail in production.
 */

const USER = 'abc123XYZ_-9'
const ID = 'aB3_dEf-hI9k'
const STORE = 'https://abc123store.public.blob.vercel-storage.com'

/** What Blob hands back: the requested pathname plus its random suffix. */
const storedPathname = `nina/${USER}/selfie-${ID}-Xy7kQ2p.jpg`
const storedUrl = `${STORE}/${storedPathname}`

const goodBlob = {
  blobUrl: storedUrl,
  pathname: storedPathname,
  width: 768,
  height: 1024,
  bytes: 240_000,
}

describe('adminChatPhotoPathname — the shape is HERS, with a different container', () => {
  it('is `ninaImagePathname(_, "selfie", _)` up to the extension', () => {
    // The duplication is CHECKED rather than merely intended — `tests/nina.imagerecipe.test.ts`'s
    // mitigation for `NINA_BLOB_PREFIX`, applied to the one string this phase re-spells.
    expect(adminChatPhotoPathname(USER, ID)).toBe(
      ninaImagePathname(USER, 'selfie', ID).replace(/\.png$/, '.jpg'),
    )
    expect(adminChatPhotoPathname(USER, ID)).toBe(`nina/${USER}/selfie-${ID}.jpg`)
  })

  it('is admitted by the pattern a future blob-reap will be taught', () => {
    // The whole reason `.jpg` under `selfie-` was chosen over a new admin-only prefix.
    expect(NINA_IMAGE_PATHNAME_RE.test(adminChatPhotoPathname(USER, ID))).toBe(true)
  })

  it('is NOT the runner composer shape', () => {
    expect(adminChatPhotoPathname(USER, ID)).not.toBe(ninaChatPathname(USER, ID))
    expect(isAdminChatPhotoPathname(ninaChatPathname(USER, ID), USER)).toBe(false)
  })
})

describe('isAdminChatPhotoPathname', () => {
  it('accepts the requested form and the stored form the branch will actually see', () => {
    expect(isAdminChatPhotoPathname(adminChatPhotoPathname(USER, ID), USER)).toBe(true)
    expect(isAdminChatPhotoPathname(storedPathname, USER)).toBe(true)
  })

  it('refuses another user folder, traversal, and the album prefix', () => {
    expect(isAdminChatPhotoPathname(storedPathname, 'someoneelse')).toBe(false)
    expect(isAdminChatPhotoPathname(`nina/${USER}/../selfie-${ID}.jpg`, USER)).toBe(false)
    expect(isAdminChatPhotoPathname(`nina/${USER}/avatar-${ID}.jpg`, USER)).toBe(false)
    expect(isAdminChatPhotoPathname(`nina/${USER}/thumb-${ID}.jpg`, USER)).toBe(false)
    expect(isAdminChatPhotoPathname(`shots/${ID}.jpg`, USER)).toBe(false)
  })

  it('refuses the worker PNG container and a double extension', () => {
    expect(isAdminChatPhotoPathname(ninaImagePathname(USER, 'selfie', ID), USER)).toBe(false)
    expect(isAdminChatPhotoPathname(`nina/${USER}/selfie-${ID}.jpg.html`, USER)).toBe(false)
  })

  it('refuses an id outside the 12-24 window and a non-id user', () => {
    expect(isAdminChatPhotoPathname(`nina/${USER}/selfie-short.jpg`, USER)).toBe(false)
    expect(isAdminChatPhotoPathname(`nina/${USER}/selfie-${'a'.repeat(25)}.jpg`, USER)).toBe(false)
    expect(isAdminChatPhotoPathname(storedPathname, '../evil')).toBe(false)
  })
})

describe('isHttpsBlobUrl', () => {
  it('accepts an https store URL', () => {
    expect(isHttpsBlobUrl(storedUrl)).toBe(true)
  })

  it('refuses plaintext, a non-URL, an empty string and an absurd length', () => {
    expect(isHttpsBlobUrl(`http://${storedPathname}`)).toBe(false)
    expect(isHttpsBlobUrl('not a url')).toBe(false)
    expect(isHttpsBlobUrl('')).toBe(false)
    expect(isHttpsBlobUrl(`${STORE}/${'a'.repeat(4000)}.jpg`)).toBe(false)
  })
})

describe('blobUrlMatchesPathname', () => {
  it('ties the URL to the pathname it claims', () => {
    expect(blobUrlMatchesPathname(storedUrl, storedPathname)).toBe(true)
  })

  it('refuses a URL that points somewhere else entirely', () => {
    // The whole reason this exists: a Server Action is a separate entry point from the token mint,
    // so without it a well-formed payload could hang a foreign image on one of her rows — and the
    // D5 reference check would then be answering a question about a pathname nothing ever wrote.
    expect(blobUrlMatchesPathname('https://example.com/cat.jpg', storedPathname)).toBe(false)
    expect(blobUrlMatchesPathname(`${STORE}/nina/other/selfie-${ID}.jpg`, storedPathname)).toBe(
      false,
    )
  })

  it('refuses a suffix match that is not a whole-path match', () => {
    expect(blobUrlMatchesPathname(`${STORE}/evil/${storedPathname}`, storedPathname)).toBe(false)
  })
})

describe('the byte ceiling is a deliberate fourth number', () => {
  it('sits strictly between the runner cap and the album cap', () => {
    // Neither inherited. See `lib/admin/chatPhotos.ts` for the argument; this asserts the ordering
    // so a later edit to any of the three cannot silently collapse two of them into one.
    expect(ADMIN_CHAT_PHOTO_MAX_UPLOAD_BYTES).toBeGreaterThan(NINA_CHAT_MAX_UPLOAD_BYTES)
    expect(ADMIN_CHAT_PHOTO_MAX_UPLOAD_BYTES).toBeLessThan(ADMIN_AVATAR_MAX_UPLOAD_BYTES)
  })

  it('encodes into the same size class as her generated photographs', () => {
    expect(ADMIN_CHAT_PHOTO_LONG_EDGE_PX).toBe(NINA_IMAGE_HEIGHT)
  })
})

describe('isNinaPhotoCarrierMessage — the empty-bubble rule', () => {
  it('recognises every caption the worker can write', () => {
    for (const caption of NINA_IMAGE_CAPTIONS) {
      expect(isNinaPhotoCarrierMessage({ role: 'nina', body: caption })).toBe(true)
    }
  })

  it('recognises every caption an admin ADD can write', () => {
    // The round-trip that keeps `addChatPhotoAction` and `removeChatPhotoAction` from disagreeing:
    // ADD seeds `ninaImageCaption` with a fresh nanoid(12) instead of a job id, and the result must
    // always be a string this predicate accepts.
    for (const seed of ['aaaaaaaaaaaa', 'zZ9_-0000000', 'aB3_dEf-hI9k', 'QQQQQQQQQQQQ']) {
      expect(isNinaPhotoCarrierMessage({ role: 'nina', body: ninaImageCaption(seed) })).toBe(true)
    }
  })

  it('refuses HIS message even when it carries one of her photographs', () => {
    // The R26 re-attach path: a `kind = 'generated'` row on a `role = 'runner'` message. That
    // message is his and carries his text; removing the photo must not delete it.
    expect(isNinaPhotoCarrierMessage({ role: 'runner', body: NINA_IMAGE_CAPTIONS[0]! })).toBe(false)
  })

  it('refuses a message of hers that carries real words', () => {
    expect(isNinaPhotoCarrierMessage({ role: 'nina', body: 'lu abis lari berapa km tadi?' })).toBe(
      false,
    )
  })
})

describe('chatPhotoAddSchema', () => {
  it('accepts what the uploader actually produces', () => {
    expect(chatPhotoAddSchema.safeParse(goodBlob).success).toBe(true)
  })

  it('refuses a blobUrl that disagrees with the pathname', () => {
    expect(
      chatPhotoAddSchema.safeParse({ ...goodBlob, blobUrl: 'https://example.com/cat.jpg' }).success,
    ).toBe(false)
  })

  it('refuses bytes over the ceiling and dimensions that are not positive integers', () => {
    expect(
      chatPhotoAddSchema.safeParse({ ...goodBlob, bytes: ADMIN_CHAT_PHOTO_MAX_UPLOAD_BYTES + 1 })
        .success,
    ).toBe(false)
    expect(chatPhotoAddSchema.safeParse({ ...goodBlob, width: 0 }).success).toBe(false)
    expect(chatPhotoAddSchema.safeParse({ ...goodBlob, height: 1024.5 }).success).toBe(false)
  })
})

describe('chatPhotoReplaceSchema', () => {
  it('accepts a nanoid(12) plus the same claims', () => {
    expect(chatPhotoReplaceSchema.safeParse({ id: ID, ...goodBlob }).success).toBe(true)
  })

  it('refuses an id that is not nanoid(12)', () => {
    expect(chatPhotoReplaceSchema.safeParse({ id: 'short', ...goodBlob }).success).toBe(false)
    expect(chatPhotoReplaceSchema.safeParse({ id: `${ID}x`, ...goodBlob }).success).toBe(false)
    expect(chatPhotoReplaceSchema.safeParse({ id: '../../etc/passw', ...goodBlob }).success).toBe(
      false,
    )
  })
})

describe('chatPhotoRemoveSchema', () => {
  it('takes an object so a later field is additive', () => {
    expect(chatPhotoRemoveSchema.safeParse({ id: ID }).success).toBe(true)
    expect(chatPhotoRemoveSchema.safeParse(ID).success).toBe(false)
  })
})
```

**Impact:** `npm test` gains ~28 cases. No integration test is added: the three actions touch a real
database and a real Blob store, which `vitest.config.ts` deliberately keeps out of `npm test`.

> `vitest.config.ts` includes `tests/**/*.test.ts` and aliases `@` to the repo root, so importing
> `@/components/admin/chatPhotoUpload` for one constant works — the module's `'use client'` directive
> is inert under Vitest and nothing at its top level touches the DOM.

---

## Verification

**Build:**

```
cd /home/miftah/.worktrees/run-insights/admin-memory-and-chat-photos
npm install                     # the worktree has no node_modules yet
npx tsc --noEmit
npm run lint
npm run build
```

**Tests:**

```
npm test -- tests/admin.chatPhotos.test.ts
npm test
npm run ci:client-secret-guard
npm run ci:data-layer-guard
npm run ci:llm-payload-guard
npm run ci:openrouter-guard
npm run ci:f08-guard
npm run ci:f11-guard
npm run format:check
```

**Targeted greps that are cheaper than a test:**

```
# invariant 7 — no admin marker reached a runner-facing module
git diff --name-only origin/main -- app/nina components/nina lib/nina/album.ts \
  lib/nina/chatphotos.ts lib/nina/actions.ts                       # must be EMPTY

# invariant 10 — no migration
git status --porcelain drizzle/                                    # must be EMPTY

# the two zero-import modules grew no import
git diff origin/main -- lib/nina/images.ts lib/nina/imagerecipe.ts lib/nina/imagefail.ts
                                                                   # must be EMPTY

# phase 1's file was never opened
git diff --name-only origin/main -- lib/admin/schema.ts            # must be EMPTY

# C2 — `del` is called in exactly ONE place in this phase, inside the release helper
grep -n "del(" lib/admin/chatPhotoActions.ts
  # exactly one hit, inside `releaseChatPhotoBlob`

# no confirmation shapes anywhere in this phase's files
grep -rn "confirm\|Are you sure\|PURGE" lib/admin/chatPhoto*.ts \
  components/admin/ChatPhoto*.tsx components/admin/chatPhotoUpload.ts   # must be EMPTY

# requireAdmin is the first statement of every action
grep -n "export async function\|await requireAdmin" lib/admin/chatPhotoActions.ts
```

**Manual check** (needs `.env.local` with `BLOB_READ_WRITE_TOKEN`, `ADMIN_EMAILS`, `DATABASE_URL` and
an OpenRouter key; `npm run dev`):

1. `/admin/photos` → pick a photo → **Replace** → choose a JPEG. The tile swaps. Open `/nina` and
   find the bubble that photograph was in: **the same bubble, in the same place in the
   conversation**, now showing the new picture. The old Blob object is gone from the store.
2. `/admin/photos` → **Add photo** → choose a **PNG** (it must be accepted and stored as
   `nina/<userId>/selfie-<id>-<suffix>.jpg`). Open `/nina`: a new bubble from **Nina** at the bottom
   of the most recent conversation, with one of the five captions and the photograph on it. Tap it:
   `PhotoViewer`'s label reads **"Foto Nina"**, which is `photoSideOf` returning `'hers'`. Open
   `/nina/about`: it is in the gallery on her side. Nothing anywhere says an operator added it.
3. `/admin/photos` → **Remove** that added photo. `/nina`: **the whole bubble is gone**, not a
   caption with a hole in it. The Blob object is gone from the store.
4. In `/nina`, re-attach one of her selfies to a message of your own (the R26 path), then remove that
   photograph from `/admin/photos`. **Your message survives, with your text.** Only the photo goes.
5. **The C2 case, and it is the one to actually run.** In `/nina`, re-attach *her current profile
   picture* from the album into the chat (the avatar branch of `resolveAttachment`). Then remove that
   chat photograph from `/admin/photos`. The row goes; the control shows *"The file is still used
   elsewhere, so it was kept in the store."*; and **her profile picture still renders** in the chat
   header and on `/nina/about`. Before this phase's release helper, that click blanked her face.
6. Same again in the other direction: send one of her chat photos twice (attach the same image row
   to a second message), then remove one of the two from `/admin/photos`. The other bubble still
   shows its picture.
7. Every one of the above is **one click**. No dialog appeared at any point.
8. Sign in as a non-admin (or unset `ADMIN_EMAILS`) and `curl -X POST /api/admin/nina/upload` with a
   `selfie-` pathname: **404**, not 400, and no token.

**Exit criteria:**

- Replace swaps the bytes behind an existing row, keeps the row id, its `message_id`, its
  `created_at`, its `sort_order` and its `kind`, nulls the stale `description`/`prompt`, and
  releases the old Blob object **unless another row still points at it**.
- Add mints the `nina_messages` + `nina_message_images` pair `finishSelfie` writes — `role='nina'`,
  `source='chat'`, one of the five canned captions, `kind='generated'`, `sort_order=0` — filed into
  a real session, so the photograph appears in the runner's chat and in `/nina/about`'s gallery on
  her side with no admin marker.
- Remove deletes the row, deletes the carrying message when that message has no images left **and**
  is one of hers with the worker's caption shape, leaves a runner message intact in every case, and
  releases the Blob object **unless another row still points at it**.
- **No Blob object is ever deleted while a `nina_message_images` or `nina_avatars` row still
  references its pathname**, and every delete in the phase goes through one function.
- `/api/admin/nina/upload` accepts `nina/<userId>/selfie-<id>.jpg` at a 2 MB ceiling and
  `image/jpeg` only, still refuses everything else, still gates with `requireAdminApi()` **before**
  `handleUpload`, and still interpolates the user id from the session.
- No confirmation of any kind on any of the three.
- `npx tsc --noEmit`, `npm run lint`, `npm test` and every `ci:*` guard are green.

---

## Assumptions

Recorded so the reconciler can check each against phase 2's plan, which did not exist on disk when
this was written (`.workflows/plan/admin-memory-and-chat-photos/` was empty; phase 2's planner was
still running).

| # | Assumption about phase 2 | If wrong |
|---|---|---|
| A1 | The route is **`/admin/photos`** | Change `ADMIN_CHAT_PHOTOS_PATH` in `lib/admin/chatPhotos.ts`. One line. |
| A2 | `components/admin/ChatPhotoGrid.tsx` exists, is `'use client'`, and has `userId: string` in scope | See Risk 2 |
| A3 | It exposes a **collection-level seam** (header/toolbar) and a **per-photo seam** (detail rail) with the selected photo's `nina_message_images.id` in scope | Step 9's two JSX lines move to wherever those two places are. Nothing else changes. |
| A4 | Phase 2 adds `listNinaChatPhotos` + a count near the end of §5 in `lib/nina/queries.ts` | See Risk 1 |
| A5 | Phase 2's listing filters `kind = 'generated'` and does **not** filter by `message.role` | If it filtered by role it would hide the R26 re-attached photos, and both `removeChatPhotoAction`'s runner-message branch and the shared-blob case would be unreachable from the UI. Phase 2's stated exit criteria already forbid this. |
| A6 | Phase 2's page is `force-dynamic` and re-reads on every request | `revalidatePath` would otherwise not be enough. `/admin/nina` sets it; phase 2's plan says it will too. |
| A7 | Phase 2 renders `description` and/or `prompt` on the detail rail | Then a replaced photo shows both blank until the `after()` describe lands. That is correct and honest; a "describing…" affordance is phase 2's call, not phase 3's. |
| A8 | Phase 2 does not assume a pathname shape for the photos it lists | It lists whatever is in the rows. After this phase the collection contains both `selfie-<id>.png` (worker) and `selfie-<id>.jpg` (admin), so any phase-2 code that parses `pathname` — for a filename label, say — must not assume `.png`. |

Assumptions about **phase 1**: none. Phase 3 opens no file phase 1 owns, which is exactly why the
Zod lives in `lib/admin/chatPhotoSchema.ts`.

---

## Handoffs

Found while planning, deliberately not done here.

1. **`scripts/nina-image-worker.ts:434` omits `session_id`, which is `NOT NULL` with no default.**
   `finishSelfie`'s insert names `(id, user_id, role, text, source, turn_id, reply_to_id)`;
   `drizzle/0004_nina_chat_sessions.sql:34` set `session_id NOT NULL` and no default was added.
   `grep -n session scripts/nina-image-worker.ts` returns nothing, and its `information_schema`
   preflight column list (`:147`) does not include it either. **Every generated selfie should be
   failing to insert on `main` today.** Not phase 3's file (the scope forbids editing it), not a
   dependency of phase 3, and not made worse by it — `addChatPhotoAction` resolves a session properly
   through `resolveNinaWriteSession`. It needs its own card, urgently. The same omission appears at
   `:540` (the apology path).
2. **A deliberate orphan class, created by D5.** When `releaseChatPhotoBlob` answers `'shared'` or
   `'failed'`, the object stays in the store after the row that named it is gone. That is the correct
   trade (an orphan costs storage; a deleted-but-referenced object is unrecoverable data loss), and
   `reap-orphaned-blobs` is its backstop. Two follow-ups belong on a card, not here:
   `scripts/blob-reap.mjs` still does not know the `nina/` prefix at all (ruling D4's open card), and
   when it is taught it, "no row references this pathname" is exactly the query
   `isBlobPathnameReferenced` already implements — it should be the shared definition rather than a
   second one.
3. **The same shared-blob hazard exists on paths this phase does not own.**
   `lib/nina/messageActions.ts:172` logs orphaned pathnames when a message is deleted and deletes no
   bytes at all, and `deleteNinaAvatarAction` (`lib/admin/ninaAlbumActions.ts:195`) calls `del`
   **unconditionally** on an avatar's `blobUrl` — which R26's re-attach path can have copied onto a
   chat image row. That is the mirror image of the bug corrected here and it is live today, in a file
   phase 3 must not touch. It should be one card: route both through `isBlobPathnameReferenced`.
4. **The operator cannot choose which conversation an added photo lands in.** `addChatPhotoAction`
   uses assumption A3's policy (the most recently active session, creating one if there is none). A
   session picker on `/admin/photos` would be a real feature; nobody asked for it and inventing a
   second session policy is exactly what `lib/nina/sessionResolve.ts` exists to prevent.
5. **No index on `nina_message_images.pathname` or `nina_avatars.pathname`.**
   `isBlobPathnameReferenced` is therefore two bounded scans filtered by `user_id`, run once per
   human-paced remove or replace. Correct at this table's size, and invariant 10 forbids the
   migration anyway. If the reaper ever runs this query per object over the whole store, that is the
   moment to measure it.
6. **`components/admin/explorer/thumbnail.ts` and `components/admin/chatPhotoUpload.ts` both draw a
   bitmap onto an `OffscreenCanvas` and encode JPEG.** They differ in target (short edge 256 vs long
   edge 1024), quality (0.82 vs 0.90) and failure mode (null vs throw), so they are not the same
   function today. If a third one appears, that is the moment to extract a shared
   `drawToJpeg(bitmap, { width, height, quality })` — not before.
7. **`/nina` and `/nina/about` are not revalidated by these actions.** Both are session-gated dynamic
   renders (`requireUserId()`), so the runner sees the change on their next load with no invalidation
   step — the same property `loadNinaContext` relies on. If either is ever made static, the three
   actions need a second `revalidatePath`.

---

## Rollback

Phase 3 alone:

```
git revert <phase-3 commit>
```

Six of the ten files are new and vanish. The four edits are additive and revert cleanly **provided
phase 2 stays** — Step 9 touches `components/admin/ChatPhotoGrid.tsx`, and Step 3 appends to
`lib/nina/queries.ts` below phase 2's own addition. After the revert, `/admin/photos` is read-only
again and `/api/admin/nina/upload` accepts two pathname shapes.

**What a revert does not undo.** These actions write and delete real Blob objects and real chat rows
in production. Reverting the code does not un-delete a photograph the operator removed, does not
restore the bytes behind one they replaced, and does not remove one they added — that message and
that image row stay in the conversation and keep rendering, because they are, by design,
indistinguishable from generated ones. This is inherent to the requirement, not a defect of the plan;
the plan index says so too. To undo an *added* photograph, use the Remove control before reverting.

One asymmetry worth stating in the other direction: because of D5, a revert leaves **fewer**
irrecoverable states than an unconditional-`del` design would. Objects that were shared are still in
the store.

---

## Risks

1. **Two phases append to `lib/nina/queries.ts`.** Phase 2 adds `listNinaChatPhotos` + a count near
   the end of §5; phase 3 adds a §5b block before the `§6 Memory` banner **and one word (`or`) to the
   drizzle import list at `:1-13`**. Phase 3 runs *after* phase 2 (`depends_on: [2]`), so this is a
   rebase, not a concurrent write — but if the swarm runs them out of order, the import line is a
   second conflict point beyond the block itself. Mitigation: the §5b block opens with its own
   banner, and the import change is one alphabetically-placed identifier.
2. **`ChatPhotoGrid` may not receive `userId`.** Both controls need it to build the upload pathname
   (`adminChatPhotoPathname(userId, id)`). If phase 2's grid does not take it, the fix is one prop
   threaded from phase 2's page — which already has it from `requireAdmin()` — exactly as
   `app/admin/nina/page.tsx:57-59` threads `shareOrigin` into `FileExplorer`. **Do not** substitute a
   client-side session read: the user id in a pathname must come from the server, and the route
   re-derives it from the session anyway, so a wrong client value is a 400 rather than a hole.
3. **Blob's random suffix must keep the stored pathname inside `ADMIN_CHAT_PHOTO_ID_RE`'s 12-24
   window.** If Vercel ever appends more than 12 symbols, every replace and add fails at the action
   with "did not land in her photo folder". This is an existing exposure, not a new one —
   `lib/nina/actions.ts:816` relies on the same property for the runner's own uploads and
   `lib/nina/images.test.ts:36-40` pins it — and the failure is loud and immediate rather than silent.
4. **The `after()` describe needs an OpenRouter key.** In local dev without one, every add and
   replace logs `[f36] chat photo describe failed` and leaves `description = null`. Non-fatal by
   design, but it means the manual check's "indistinguishable" property is only fully true in an
   environment that has the key.
5. **`blobUrlMatchesPathname` is stricter than anything the album does.** If a future Blob store
   serves objects from a path prefix other than `/<pathname>`, every replace and add would refuse
   with "That upload did not describe a photo." The relaxation, if ever needed, is
   `decoded.endsWith('/' + pathname)` — and it should be made deliberately, with a test, rather than
   by deleting the check.
6. **The collection's blobs are now mixed-container.** After this phase the folder holds
   `selfie-<id>.png` (worker) beside `selfie-<id>.jpg` (admin). That is by design and
   `NINA_IMAGE_PATHNAME_RE` admits both, but any *future* code that infers a container from the
   `selfie-` prefix rather than reading the served content type would be wrong. `lib/nina/vision.ts`'s
   `toDataUri` already reads it back and says why; nothing else infers it today.
