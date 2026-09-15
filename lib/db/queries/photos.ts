import { and, asc, desc, eq, exists, inArray, notInArray, sql } from 'drizzle-orm'

import { newPhotoId } from '@/lib/id'
import { isValidContentHash } from '@/lib/photos/contentHash'

import { db } from '../index'
import { extractions, runPhotos, type PhotoKind, type RunPhoto } from '../schema'

import { NotFoundError } from './errors'
import { assertExtractionOwned, runPhotoOwnedBy } from './ownership'

/* ============================================================================
 * §7 Photos — R-1's two-parent lifecycle
 * ==========================================================================*/

export interface NewPhotoInput {
  blobUrl: string
  pathname: string
  kind: PhotoKind
  width?: number | null
  height?: number | null
  bytes?: number | null
  sortOrder?: number
  /**
   * **The duplicate-image push's key (R1).** `contentHashOf` over the bytes this row's blob
   * holds, as claimed by the browser that PUT them. THIS FUNCTION IS THE INSERT DOOR: anything
   * that is not 64 lowercase hex is written as NULL — dedup silently inactive for that row —
   * which is the same rule, for the same reason, that `insertNinaMessageImages` applies to
   * `nina_message_images.content_hash`. One spelling in the column, or nothing.
   */
  contentHash?: string | null
}

/**
 * Attaches uploaded screenshots to their extraction (R-1). `run_id` stays NULL until
 * `commitExtractedRun` backfills it, so a photo is never orphaned and no placeholder run is
 * needed to hold it.
 *
 * **`ids` comes back in INPUT ORDER**, and that is a contract rather than an accident: the ids
 * are minted here, one per `photos[i]`, and `POST /api/extract` zips them back against the claims
 * it sent to know which row carries which hash for the duplicate scan. Do not reorder the map.
 */
export async function attachExtractionPhotos(
  userId: string,
  extractionId: string,
  photos: NewPhotoInput[],
): Promise<{ ids: string[] }> {
  await assertExtractionOwned(userId, extractionId)
  if (photos.length === 0) return { ids: [] }
  const rows = photos.map((photo, i) => ({
    id: newPhotoId(),
    extractionId,
    blobUrl: photo.blobUrl,
    pathname: photo.pathname,
    kind: photo.kind,
    width: photo.width ?? null,
    height: photo.height ?? null,
    bytes: photo.bytes ?? null,
    sortOrder: photo.sortOrder ?? i,
    contentHash: isValidContentHash(photo.contentHash) ? photo.contentHash : null,
  }))
  await db.insert(runPhotos).values(rows)
  return { ids: rows.map((r) => r.id) }
}

/** The review screen's screenshot strip, before any run exists. */
export async function listExtractionPhotos(
  userId: string,
  extractionId: string,
): Promise<RunPhoto[]> {
  return db
    .select()
    .from(runPhotos)
    .where(
      and(
        eq(runPhotos.extractionId, extractionId),
        exists(
          db
            .select({ ok: sql`1` })
            .from(extractions)
            .where(and(eq(extractions.id, extractionId), eq(extractions.userId, userId))),
        ),
      ),
    )
    .orderBy(asc(runPhotos.sortOrder), asc(runPhotos.createdAt))
}

/**
 * **"Does this user already store these bytes as a run screenshot?"** — the `run_photos` arm of
 * the cross-table duplicate lookup (`lib/photos/globalDuplicate.ts`), and this table's first
 * content-addressed read of any kind.
 *
 * ── THE OWNERSHIP HALF IS `runPhotoOwnedBy`, NOT A `user_id` ─────────────────────────────────
 * This table carries no owner column on purpose (§3's header, and `tests/db.schema.test.ts:270`
 * asserts the absence). `runPhotoOwnedBy` is the correlated double-EXISTS back to `extractions`
 * OR `runs` — either parent claiming the row is enough, because a photo has only an extraction
 * until the review commit backfills `run_id`. It runs IN THE SAME STATEMENT as the hash
 * predicate, so there is no window between the check and the read.
 *
 * ── TWO HASHES, ONE ROUND TRIP ───────────────────────────────────────────────────────────────
 * `string | readonly string[]`, exactly as `findNinaImageByContentHash` takes it and for the same
 * measured reason: an upload carries two hashes worth asking about — the encode's (the bytes a
 * PUT carries) and the picked file's own, which for a download-then-reupload IS a stored row's
 * bytes. `in (…)` asks both at once.
 *
 * ── `excludeIds` IS NOT OPTIONAL BEHAVIOUR, IT IS THE POINT ──────────────────────────────────
 * The caller runs this AFTER inserting the rows it is asking about, so without the exclusion every
 * genuinely-new upload matches itself and every upload notifies. Pushed into SQL rather than
 * post-filtered, because a post-filter over a `LIMIT 1` would answer "no duplicate" whenever a
 * row being excluded happened to sort first — which it always does, being the newest.
 *
 * **A LIST, not one id** (reconciler ruling, round 1). One `POST /api/extract` writes up to THREE
 * `run_photos` rows and two of them can carry identical bytes — the kinds must differ, the pixels
 * need not. Excluding only the asking row then makes each of the two match the other and announce
 * a photograph this very request created. "Already" has to mean "before now", which is the whole
 * batch, not one row of it. An empty array is "exclude nothing" and must not emit a
 * `not in ()` — hence the length guard below.
 *
 * ── NEWEST FIRST ─────────────────────────────────────────────────────────────────────────────
 * `(created_at desc, id desc)` — `findNinaImageByContentHash`'s standing rule, quoted: any match
 * is a correct target, and the newest is the least likely to have been deleted between this read
 * and the notification that follows.
 *
 * `null` means "not yours", "no such bytes" and "nobody stores them" alike — §3's rule, and here
 * it is also the answer the caller wants: nothing to notify about.
 */
export async function findRunPhotoByContentHash(
  userId: string,
  contentHash: string | readonly string[],
  excludeIds?: readonly string[],
): Promise<{ id: string; blobUrl: string } | null> {
  const hashes = Array.isArray(contentHash) ? [...contentHash] : [contentHash as string]
  if (hashes.length === 0) return null
  const excluded = excludeIds ?? []
  const rows = await db
    .select({ id: runPhotos.id, blobUrl: runPhotos.blobUrl })
    .from(runPhotos)
    .where(
      and(
        inArray(runPhotos.contentHash, hashes),
        excluded.length > 0 ? notInArray(runPhotos.id, [...excluded]) : undefined,
        runPhotoOwnedBy(userId),
      ),
    )
    .orderBy(desc(runPhotos.createdAt), desc(runPhotos.id))
    .limit(1)
  return rows[0] ?? null
}

/** R-11 / F11's per-photo opt-out. */
export async function setPhotoExcludedFromShare(
  userId: string,
  photoId: string,
  excluded: boolean,
): Promise<void> {
  const rows = await db
    .update(runPhotos)
    .set({ excludedFromShare: excluded })
    .where(and(eq(runPhotos.id, photoId), runPhotoOwnedBy(userId)))
    .returning({ id: runPhotos.id })
  if (rows.length === 0) throw new NotFoundError('Photo not found')
}

/**
 * R-15's blob rotation. A Vercel Blob URL is public and survives revocation forever, so revoking
 * a share re-uploads every photo under a fresh random pathname and points the row at it; the old
 * URL then 404s. F11 owns the fetch/upload/delete; this is the row update.
 */
export async function updatePhotoBlobLocation(
  userId: string,
  photoId: string,
  location: { blobUrl: string; pathname: string },
): Promise<void> {
  const rows = await db
    .update(runPhotos)
    .set(location)
    .where(and(eq(runPhotos.id, photoId), runPhotoOwnedBy(userId)))
    .returning({ id: runPhotos.id })
  if (rows.length === 0) throw new NotFoundError('Photo not found')
}
