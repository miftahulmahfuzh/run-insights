# Code Analysis: `/admin/photos` upload — the stored-pathname window

**Type:** Bug Investigation
**Date:** 2026-09-07 07:25:34 +07
**Session ID:** 20260907-072534-B10B
**Plan:** `BLOB_STORED_PATHNAME_WINDOW_PLAN.md` (1 phase)
**Worktree:** `/home/miftah/.worktrees/run-insights/blob-stored-pathname-window`, branch `feature/blob-stored-pathname-window` (base `origin/main` @ `3902c58`)

---

## User Input

### Original User Request

> bug: in /admin/photos i cannot upload any image. try uploadin @enina5.png to prod yourself

### User-Provided Context

A screenshot of `runins.site/admin/photos`. "Nina generated" reads **0 photos**, the grid says
*"She has not sent a photo yet"*, and under the **Add photo** button, in red:

> `enina5.png: That file did not land in her photo folder.`

That string is `lib/admin/chatPhotoActions.ts:114` and `:183` — the same sentence in both, so the
screenshot alone does not say which action produced it. It was the ADD path
(`addChatPhotoAction`, line 183): the collection is empty, so there was no row to replace.

### User-Provided Files

- `enina5.png` — 1,839,968 bytes, 892×1200, RGBA PNG (repo root, untracked)

### Requirement IDs

| ID | What the user asked for |
|---|---|
| R1 | In `/admin/photos`, uploading an image must work — today no image can be uploaded |
| R2 | Upload `enina5.png` to **prod** myself, rather than reasoning about it from the code |

---

## Detailed Requirements Understanding

**Problem statement.** Every `/admin/photos` upload is refused by
`isAdminChatPhotoPathname(pathname, userId)` — **after the bytes have already landed in the Blob
store**. `ADMIN_CHAT_PHOTO_ID_RE` is `/^[A-Za-z0-9_-]{12,24}$/`, and the id segment of a STORED
Vercel Blob pathname is **43 characters**: a 12-symbol `newId()` plus `-` plus Vercel's 30-symbol
random suffix. 12 + 1 + 30 = 43, which is outside 12–24. The window was written for a suffix
nobody had measured.

The error message is also the opposite of what happened: the file *did* land in her photo folder.
It is the row that was refused, not the object.

**The same arithmetic mistake, in a second constant.** `NINA_CHAT_ID_RE`
(`lib/nina/images.ts:68`) is also `{12,24}`, and `describeNinaImage` (`lib/nina/actions.ts:1237`)
applies it to the STORED pathname the browser hands back. So the runner's own camera upload in
`components/nina/Composer.tsx` fails the same way, one screen over, with the message
*"Nina could not take this one."* Verified against four real orphaned `chat/` objects in the prod
store (below). This is not a speculative sibling: it is the same defect reached by a different
route, and one commit fixes both.

**Success criteria.**
1. `enina5.png` uploads through `/admin/photos` on **prod** and appears in "Nina generated".
2. A runner camera photo in the Nina composer reaches `state: 'ready'` instead of erroring.
3. The corrected predicates accept both the REQUESTED and the STORED form, and are *tighter* than
   today's at mint time, not looser.
4. The unit fixtures carry a **real** 30-symbol suffix, so the window is checked against
   production reality rather than an invented short string.

**Key considerations.**
- The requested window and the stored window are two different shapes. The repo already got this
  right once, from a real observation: `SHOT_STORED_PATHNAME_RE`
  (`lib/extract/constants.ts:107`) models them as two groups — `{12,24}-{16,64}` — and its comment
  names "the 30 currently observed". The two `{12,24}` constants tried to cover both windows with
  one range and the arithmetic does not close.
- A 12-symbol `newId()` may itself end in `-` (real prod object:
  `shots/Ve394_KsZZ7--Rb9EznPf5OE150rEwy1evUqr6Hbixd.jpg`), so a fix must not assume the separator
  is the only `-`.
- `isAdminChatPhotoPathname` is used at **two** call sites with **two** meanings — token mint
  (requested) and Server Action (stored). Both must keep working; the fix must not widen the mint
  check.
- Assumption: Vercel's suffix stays within 16–64 symbols. That is the repo's existing recorded
  bound, not a new guess, and 30 is what both prod and `lib/extract/constants.ts` observe.

---

## Analysis Scope

### Explicitly Mentioned Files

- `enina5.png` (the payload, not code)

### Discovered Related Files

- `lib/admin/chatPhotos.ts` — `ADMIN_CHAT_PHOTO_ID_RE`, `isAdminChatPhotoPathname` **(the defect)**
- `lib/admin/chatPhotoActions.ts:114,183` — the two `return { ok: false }` lines the user saw
- `lib/nina/images.ts:68,104` — `NINA_CHAT_ID_RE`, `isNinaChatRequestPathname` **(the same defect)**
- `lib/nina/actions.ts:1237` — `describeNinaImage`, applies the above to a STORED pathname
- `components/nina/Composer.tsx:243-267` — passes `result.pathname` (stored) to `describeNinaImage`
- `components/admin/ChatPhotoAdd.tsx:45-54` — the loop that renders the red line
- `components/admin/chatPhotoUpload.ts:110-125` — `upload()`; the stored pathname is `result.pathname`
- `app/api/admin/nina/upload/route.ts:153,203` — the mint-time call, `addRandomSuffix: true`
- `app/api/upload/route.ts:87,112` — the runner's mint, same `addRandomSuffix: true`
- `lib/extract/constants.ts:100-107` — `SHOT_REQUEST_PATHNAME_RE` / `SHOT_STORED_PATHNAME_RE`, **the
  one place in the repo that models the two windows correctly**
- `lib/admin/avatars.ts:87-93,148-154` — `{12}` exactly, request-only; the album is NOT affected
- `lib/nina/imagerecipe.ts:96-98` — `NINA_IMAGE_PATHNAME_RE`, `{12}`, request-only; not affected
- `lib/admin/chatPhotoSchema.ts` — the Zod payload; passes, it never sees the id length
- `tests/admin.chatPhotos.test.ts:36` — fixture suffix `-Xy7kQ2p` (**7 symbols**, invented)
- `lib/nina/images.test.ts:38` — fixture suffix `-Xy7` (**3 symbols**, invented)
- `scripts/blob-reap.mjs` — matches by **prefix**, not by these regexes; not affected

---

## Current Dataflow

### Entry Point: "Add photo" in `/admin/photos`

**Location:** `components/admin/ChatPhotoAdd.tsx:35` (`onPick`)
**Trigger:** `<input type="file" accept="image/*" multiple>` change
**Next step:** per file, sequentially — `uploadChatPhoto(userId, file)` then `addChatPhotoAction(...)`

### Processing Chain

1. **`encodeChatPhotoJpeg(file)`** — `components/admin/chatPhotoUpload.ts:64`
   - `createImageBitmap` → `OffscreenCanvas`, long edge clamped to 1024, white ground painted
     under the alpha channel, `convertToBlob({ type: 'image/jpeg', quality: 0.9 })`.
   - For `enina5.png` (892×1200) this yields **761×1024, ~125 KB** — measured by re-running the
     same recipe in Pillow.
   - **Succeeds.** Not the failure.

2. **`upload(adminChatPhotoPathname(userId, newId()), blob, …)`** — `chatPhotoUpload.ts:112`
   - REQUESTED pathname: `nina/<userId>/selfie-<12 symbols>.jpg`
   - `handleUploadUrl: '/api/admin/nina/upload'`

3. **`POST /api/admin/nina/upload`** — `app/api/admin/nina/upload/route.ts:121`
   - `blobEnv()`, then `requireAdminApi()` **before** `handleUpload` — passes.
   - `onBeforeGenerateToken`: `isAdminChatPhotoPathname(pathname, identity.userId)` on the
     **REQUESTED** pathname → `true` (id is exactly 12, inside 12–24).
   - Returns `maximumSizeInBytes: 2 MB`, `allowedContentTypes: ['image/jpeg']`,
     **`addRandomSuffix: true`** (line 203), `allowOverwrite: false`.
   - **Succeeds.** Not the failure.

4. **The browser PUTs straight to Blob**
   - Vercel rewrites the pathname. **STORED:**
     `nina/<userId>/selfie-<12 symbols>-<30 symbols>.jpg`
   - **The bytes are now in the store, permanently.** Nothing later releases them.

5. **`addChatPhotoAction({ blobUrl, pathname, width, height, bytes })`** — `lib/admin/chatPhotoActions.ts:175`
   - `requireAdmin()` → passes.
   - `chatPhotoAddSchema.safeParse` → **passes**: 125 KB < 2 MB, dimensions in range, and
     `blobUrlMatchesPathname` holds (`url.pathname === '/' + pathname`).
   - **`isAdminChatPhotoPathname(pathname, userId)` → `false`.** ⛔ **THE FAILURE, line 182.**
     `file.slice('selfie-'.length, -'.jpg'.length)` is 43 symbols;
     `ADMIN_CHAT_PHOTO_ID_RE` is `{12,24}`.
   - Returns `{ ok: false, error: 'That file did not land in her photo folder.' }`
   - **Never reaches** `resolveNinaWriteSession`, `insertNinaMessages`,
     `insertNinaMessageImages`, or `scheduleChatPhotoDescribe`.
   - **Never releases the object it just refused** — `releaseChatPhotoBlob` is only called on the
     two failure paths *below* this check.

6. **`ChatPhotoAdd.tsx:49`** pushes `` `${file.name}: ${result.error}` `` into `failures` and the
   red `<li>` in the screenshot is rendered.

### The parallel chain, same defect — the runner's camera

1. `components/nina/Composer.tsx:243` — `ninaChatPathname(userId, newId())` → `nina/<userId>/chat/<12>.jpg`
2. `upload(..., { handleUploadUrl: '/api/upload' })` → `app/api/upload/route.ts:87`
   `isNinaChatRequestPathname` on the **requested** form → `true`; `addRandomSuffix: true` (line 112)
3. STORED: `nina/<userId>/chat/<12>-<30>.jpg`
4. `Composer.tsx:257` — `describeNinaImage({ pathname: result.pathname, … })` passes the **stored**
   form
5. `lib/nina/actions.ts:1237` — `isNinaChatRequestPathname(pathname, userId)` → **`false`** ⛔
   (`NINA_CHAT_ID_RE` `{12,24}` against a 43-symbol id)
6. Returns `{ ok: false, ticket: null, reason: 'rejected' }` → `Composer.tsx:263` →
   `state: 'error'`, *"Nina could not take this one."*

### Data Persistence

**Database.** Nothing is written on either path. Measured on prod (`neondb`, `ep-winter-bo…`):

| table | rows |
|---|---|
| `nina_message_images` | **0** |
| ├ `kind = 'upload'` (runner camera) | 0 |
| └ `kind = 'generated'` (hers + admin add) | 0 |
| `nina_messages` | 53 |
| `nina_avatars` | 13 |

**Blob store** (`ptezanncca27s5kn`), the objects those zero rows should have pointed at:

| prefix | objects | provenance |
|---|---|---|
| `nina/<uid>/selfie-*.jpg` | 4 (118–242 KB) | `/admin/photos` add attempts — one at `2026-09-07T00:18:05Z` |
| `nina/<uid>/selfie-*.png` | 7 (0.8–1.3 MB) | the worker's generated selfies |
| `nina/<uid>/chat/*.jpg` | 4 (~210 KB) | runner composer uploads that failed the describe |

**All 15 are orphans** — every one of them is bytes in a paid store with no row naming it, ~7.6 MB.
The four `.jpg` selfies and the four `chat/` objects are the direct residue of this bug, one orphan
per refused click. The seven `.png` are the worker's own and are NOT evidence of a third bug: the
worker never runs a pathname predicate (`lib/nina/imagerun.ts:127` stores, `finishSelfie` inserts),
so their rows existed and were cascade-deleted with their chat sessions — the recently-merged
"a deleted session is really deleted" work.

### Exit Points

- `ChatPhotoActionResult` → the red `<li>` in `ChatPhotoAdd`
- `NinaDescribeImageResult` → the error tile in `Composer`
- Side effect on both: **one orphaned Blob object per attempt**

---

## Key Data Structures

### `ADMIN_CHAT_PHOTO_ID_RE`
**Location:** `lib/admin/chatPhotos.ts:79`
**Definition:** `/^[A-Za-z0-9_-]{12,24}$/`
**Comment claims:** *"12 requested, up to 24 stored once Blob has appended its random suffix."*
**Reality:** 12 requested, **43** stored.
**Used in:** `isAdminChatPhotoPathname` (`chatPhotos.ts:137`) → `app/api/admin/nina/upload/route.ts:153`
(requested) and `lib/admin/chatPhotoActions.ts:113,182` (stored)

### `NINA_CHAT_ID_RE`
**Location:** `lib/nina/images.ts:68`
**Definition:** `/^[A-Za-z0-9_-]{12,24}$/`
**Comment claims:** *"The upper bound is 24 because the STORED pathname carries Vercel's random
suffix on top of the requested one."*
**Reality:** the same 43.
**Used in:** `isNinaChatRequestPathname` (`images.ts:113`) → `app/api/upload/route.ts:87` (requested)
and `lib/nina/actions.ts:1237` (stored)

### `SHOT_STORED_PATHNAME_RE` — the correct precedent, already in the repo
**Location:** `lib/extract/constants.ts:107`
**Definition:** `/^shots\/[A-Za-z0-9_-]{12,24}-[A-Za-z0-9_-]{16,64}\.jpg$/`
**Comment:** *"`addRandomSuffix: true` appends `-` plus a run of URL-safe characters. The bound is
deliberately loose rather than pinned at the 30 currently observed."*
This one models the suffix as **its own group**, which is why it is right and the other two are
wrong. `SHOT_REQUEST_PATHNAME_RE` (line 101) is the separate request half.

---

## Dependencies

**Configuration / Environment.** `BLOB_READ_WRITE_TOKEN` (store `ptezanncca27s5kn`),
`DATABASE_URL` (Neon `neondb`), `AUTH_SECRET` (used below to mint a session for the prod probe),
`ADMIN_EMAILS` via `lib/env.ts` → `isAdminEmail`.

**External services.** Vercel Blob — **the random suffix length is an internal of Vercel's that we
do not control.** That is the whole reason the fix must bound it loosely in its own group rather
than fold it into one range, and it is exactly what `lib/extract/constants.ts:103-107` already
says in writing.

---

## R2 — the prod reproduction, run end to end

Auth.js runs `strategy: 'jwt'` (`auth.config.ts:59`), so a session cookie can be minted locally
from `AUTH_SECRET` and the real browser path driven against `runins.site` with no browser.
`enina5.png` was re-encoded in Pillow with `encodeChatPhotoJpeg`'s exact recipe (long edge 1024,
white ground under the alpha, JPEG q0.90) → 761×1024, 124,967 bytes.

```
1. GET /admin/photos -> 200 (admin session accepted)
2. REQUESTED pathname: nina/24076314-…-4acc660b5d7b/selfie-Q8lWbmk0LG7W.jpg
   id segment: Q8lWbmk0LG7W (12 chars) -> predicate true
3. POST /api/admin/nina/upload -> 200 blob.generate-client-token
4. PUT to Blob ok.
   STORED pathname: nina/24076314-…-4acc660b5d7b/selfie-Q8lWbmk0LG7W-yUFwuTN7o1ZNWvKU9FonuesJQKHQcQ.jpg
   id segment: Q8lWbmk0LG7W-yUFwuTN7o1ZNWvKU9FonuesJQKHQcQ (43 chars)
5. isAdminChatPhotoPathname(STORED, userId) = false
   -> addChatPhotoAction: "That file did not land in her photo folder."  <-- the on-screen error
6. orphan blob deleted by hand (the action never releases it on this refusal)
```

The user's own screenshot is the same run with a browser instead of a script. **The bytes reach
the store; the row is refused.** The probe's own orphan was deleted; the four from the browser
attempts were not, and are counted in the table above.

Independently, from prod objects written before this session — the suffix is **30 symbols**, twice:

```
nina/…/avatar-DlA2teEDtOPP-Pikq5mB56ZG2mBjkWsSpNVIn8M8oyw.jpg   id segment 43, suffix 30
shots/gbfsQ9Zq6hCp-mcsGWZIBQMNYFiHpKfjqkf5JoKeMiZ.jpg           id segment 43, suffix 30
```

### Why no test caught it

Both suites assert the stored form — and both **invented** the suffix instead of copying a real one:

| fixture | suffix | id segment | `{12,24}` | real |
|---|---|---|---|---|
| `tests/admin.chatPhotos.test.ts:36` `selfie-aB3_dEf-hI9k-Xy7kQ2p.jpg` | 7 symbols | 20 | passes ✓ | 43 |
| `lib/nina/images.test.ts:38` `chat/aaaaaaaaaaaa-Xy7.jpg` | 3 symbols | 16 | passes ✓ | 43 |

`admin.chatPhotos.test.ts:71` reads *"accepts the requested form and the stored form the branch
will actually see"* — and the string on line 36 is not the form the branch actually sees. This is
the whole reason the defect shipped green, and it is why the fix is not complete until both
fixtures carry a real 30-symbol suffix.

---

## Reference List

| Symbol / key | File:line | Kind | Package |
|---|---|---|---|
| `ADMIN_CHAT_PHOTO_ID_RE` | `lib/admin/chatPhotos.ts:79` | def | `lib/admin` |
| `ADMIN_CHAT_PHOTO_ID_RE` | `lib/admin/chatPhotos.ts:137` | call | `lib/admin` |
| `isAdminChatPhotoPathname` | `lib/admin/chatPhotos.ts:121` | def | `lib/admin` |
| `isAdminChatPhotoPathname` | `app/api/admin/nina/upload/route.ts:153` | call (requested) | `app/api` |
| `isAdminChatPhotoPathname` | `lib/admin/chatPhotoActions.ts:113` | call (stored, replace) | `lib/admin` |
| `isAdminChatPhotoPathname` | `lib/admin/chatPhotoActions.ts:182` | call (stored, add) | `lib/admin` |
| `isAdminChatPhotoPathname` | `tests/admin.chatPhotos.test.ts:70-93` | test | `tests` |
| `NINA_CHAT_ID_RE` | `lib/nina/images.ts:68` | def | `lib/nina` |
| `NINA_CHAT_ID_RE` | `lib/nina/images.ts:87,113` | call | `lib/nina` |
| `isNinaChatRequestPathname` | `lib/nina/images.ts:104` | def | `lib/nina` |
| `isNinaChatRequestPathname` | `app/api/upload/route.ts:87` | call (requested) | `app/api` |
| `isNinaChatRequestPathname` | `lib/nina/actions.ts:1237` | call (stored) | `lib/nina` |
| `isNinaChatRequestPathname` | `lib/nina/images.test.ts:29-58` | test | `lib/nina` |
| `SHOT_STORED_PATHNAME_RE` | `lib/extract/constants.ts:107` | def (correct precedent) | `lib/extract` |
| `addRandomSuffix: true` | `app/api/admin/nina/upload/route.ts:203` | config | `app/api` |
| `addRandomSuffix: true` | `app/api/upload/route.ts:91,112` | config | `app/api` |
| `addRandomSuffix: true` | `lib/nina/imagerun.ts:127` | config | `lib/nina` |

**Deliberately NOT in scope** — verified unaffected, each a `{12}` request-only pattern never
applied to a stored pathname: `isAdminAvatarRequestPathname` and
`isAdminAvatarThumbRequestPathname` (`lib/admin/avatars.ts:87,148`), `NINA_IMAGE_PATHNAME_RE`
(`lib/nina/imagerecipe.ts:96`), `SHOT_REQUEST_PATHNAME_RE` (`lib/extract/constants.ts:101`).
`scripts/blob-reap.mjs` matches by prefix and reads no id regex at all.

---

## Impact Points (files that WILL need changes)

1. `lib/admin/chatPhotos.ts` — the id window, and the "one predicate, two windows" paragraph that
   states the wrong arithmetic. Phase 1.
2. `lib/nina/images.ts` — `NINA_CHAT_ID_RE` and its comment, same defect. Phase 1.
3. `tests/admin.chatPhotos.test.ts` — `storedPathname` must carry a real 30-symbol suffix. Phase 1.
4. `lib/nina/images.test.ts` — same, line 38. Phase 1.

**This document describes. The plan files prescribe.**
