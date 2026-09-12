import { and, asc, eq, exists, sql } from 'drizzle-orm'

import { newPhotoId } from '@/lib/id'

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
}

/**
 * Attaches uploaded screenshots to their extraction (R-1). `run_id` stays NULL until
 * `commitExtractedRun` backfills it, so a photo is never orphaned and no placeholder run is
 * needed to hold it.
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
