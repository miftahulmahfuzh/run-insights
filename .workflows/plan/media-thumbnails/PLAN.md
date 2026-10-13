# Plan set: media-thumbnails

**Origin:** 2026-10-13. The Vercel Blob store `run-insights-photos` was suspended
(`status: limits-exceeded-suspended`, `usageQuotaExceeded: true`) at 05:36:44 UTC, taking every
photo in production to `HTTP 403 "Your store is blocked"` — account-wide, all three stores on the
`jmt-arot` team at the same second.

**Root cause, measured:** the Hobby plan includes 1 GB storage / 10 GB Blob Data Transfer /
10,000 Simple Operations / 2,000 Advanced Operations per month. Storage measured **462.7 MB across
all three stores**, so storage was never the meter. The burn is transfer + simple operations, and
the shape of it is known precisely:

| table | surface | thumbnail | per page view |
| --- | --- | --- | --- |
| `nina_avatars` | album, `/admin/nina` | **yes** (F34 R1) | 120 x 256px JPEG, a few MB |
| `nina_message_images` | Media tab, chat | **no** | 48 x ~1 MB 768x1024 PNG = **~48 MB** |
| `run_photos` | `ScreenshotStrip`, `/r/[id]`, `/s/[token]` | **no** | full screenshots |

~208 Media page views exhausts the entire 10 GB allowance. `lib/nina/album.ts:99` already named
this gap and deferred it — *"A `thumb_url` column is a migration, which invariant 10 forbids in
this plan."* That deferral is what blew the quota.

**Goal:** close the gap on both remaining tables by mirroring F34 R1's existing, working design on
`nina_avatars` exactly — a second small blob beside the original, two nullable columns, renderers
falling back to the original when NULL. Plus a sweep for any `nina_avatars` row still carrying a
NULL `thumb_url`.

**Explicitly NOT revisited.** Both escapes are already refused in writing and both refusals hold:
`components/nina/NinaPhotoGrid.tsx:56-58` rules out `next/image` on Blob-hosted photos (*"would
re-optimise finished files on a paid transform quota"*, reaffirmed at
`components/admin/explorer/PhotoGrid.tsx:29-34`), and `components/admin/UploadAvatar.tsx:26-33`
rules out downscaling the ORIGINAL. The original still goes up whole; this is an addition.

---

## Phase order is a safety property, not a preference

`scripts/blob-reap.mjs` deletes any blob that no enumerated column names. Its own header records
the near-miss for the album: *"Omitting these two columns would have deleted every thumbnail in
the [album]."* `isBlobPathnameReferenced` (`lib/nina/queries/images.ts:1464`) restates the same
contract — *"The reference sites are `scripts/blob-reap.mjs`'s, EXACTLY"* — and is what stands
between a Replace/Remove and deleting bytes somebody is still rendering.

**So the columns must be known to BOTH reference sites before the first thumbnail object exists.**
Phase 1 therefore ships the migration and the two reference sites together, and no phase that
WRITES a thumbnail may land before it.

| phase | lands | depends on |
| --- | --- | --- |
| 1 | schema + migration + both reference sites | none |
| 2 | `lib/photos/deriveThumbnail.ts` (sharp, server) + generated-image write paths | 1 |
| 3 | browser-derived upload paths, `resolveAttachment` copy, release paths | 1, 2 |
| 4 | read projections + renderers (`thumbUrl ?? blobUrl`) | 1 |
| 5 | backfill scripts for all three tables, dry-run by default | 2, 4 |

Phase 5 cannot run until the Blob store is unsuspended: deriving a thumbnail requires reading the
original, and every original is 403 while the store is blocked.

## Invariants this plan must not break

1. **The original is never re-encoded.** A thumbnail is an addition beside it.
2. **Both columns NULL is a legal, permanent state** — a renderer falls back to `blob_url`. That
   is what makes the migration safe on a populated table and the backfill resumable.
3. **`thumb_pathname` is the STORED pathname**, not a computed one. Blob appends a random suffix;
   recording a URL without its pathname is how an album accumulates orphans only a store listing
   can find.
4. **Row first, blob second** on every delete, and the thumbnail is released through
   `releaseBlobIfUnreferenced` like any other object — never with a bare `del()`.
5. One database. `npm run db:migrate` writes production.

## Found during phase 1: the share-revocation consequence

`lib/share/rotateBlobs.ts` exists because *"A Vercel Blob URL is public, unguessable and permanent.
It is not protected by the share token — it is its own bearer secret."* R-15 rules that revoking a
share **rotates** every `run_photos` object to a fresh random pathname so the old URL 404s.

A `run_photos` thumbnail is therefore a SECOND bearer secret for the same screenshot. If phase 3
does not rotate it alongside the original, revocation stops protecting the photo: the page dies,
the original 404s, and the thumbnail — which `ScreenshotStrip` on `/s/[token]` just served to
whoever opened the link — stays live at its old pathname forever. That is precisely the hole R-15
was written to close, reopened at half resolution.

**So phase 3 must rotate both objects, and `RotatablePhoto` grows `thumbUrl`/`thumbPathname`.**
The sequential-not-`Promise.all` rule and the "put it back if the row write fails" rollback both
extend to the pair; a rotation that moves the original and fails on the thumbnail must report that
photo in `failed`, because its old URL is still live.

This is the one place where the `run_photos` half of this plan is more than a transfer saving, and
it is the reason that half is not simply "the same as the other two tables."
