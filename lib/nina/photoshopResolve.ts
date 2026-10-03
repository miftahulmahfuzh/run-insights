import 'server-only'

import type { NinaPhotoshopJob } from '@/lib/db/schema'

import { releaseBlobIfUnreferenced } from './blobRelease'
import {
  getNinaAvatar,
  getNinaMessageImage,
  insertNinaAvatars,
  updateNinaAvatarBlob,
  updateNinaChatPhotoBlob,
} from './queries'
import { getNinaPhotoshopJob, resolveNinaPhotoshopJob } from './photoshopJobs'

export type NinaPhotoshopResolveOutcome =
  | { ok: true }
  | { ok: false; reason: 'not-found' | 'not-ready' | 'already-resolved' | 'source-unavailable' }

/** The photo a job's `sourceKind`/`sourceId` names, resolved fresh — never cached, never carried
 * on the job row as a URL, for `NinaImagePrefs`' own reason: a stored URL can outlive the row it
 * pointed at. */
export async function getPhotoshopSourcePhoto(
  userId: string,
  sourceKind: 'avatar' | 'message_image',
  sourceId: string,
): Promise<{
  blobUrl: string
  contentHash: string | null
  folder: string | null
  /** The source photo's own shape — `nearestNinaImageAspectRatio`'s input for an edit-mode job,
   * so the model is not defaulted onto `NINA_IMAGE_ASPECT`'s fixed 3:4 canvas. `null` when the row
   * predates dimension tracking; the caller degrades to the fixed default in that case. */
  width: number | null
  height: number | null
} | null> {
  if (sourceKind === 'avatar') {
    const row = await getNinaAvatar(userId, sourceId)
    if (row == null) return null
    /* `avatarColumns` (and so `NinaAvatarRow`) does not project `content_hash` — it is a
     * write-time dedup key nothing else reads back, and it is only audited here, never compared
     * against, so `null` costs nothing. */
    return {
      blobUrl: row.blobUrl,
      contentHash: null,
      folder: row.folder,
      width: row.width,
      height: row.height,
    }
  }
  const row = await getNinaMessageImage(userId, sourceId)
  if (row == null) return null
  return {
    blobUrl: row.blobUrl,
    contentHash: row.contentHash,
    folder: null,
    width: row.width,
    height: row.height,
  }
}

type ResolvableJobError = 'not-found' | 'not-ready' | 'already-resolved'

async function loadResolvableJob(
  userId: string,
  jobId: string,
): Promise<{ error: ResolvableJobError | null; job: NinaPhotoshopJob | null }> {
  const job = await getNinaPhotoshopJob(userId, jobId)
  if (job == null) return { error: 'not-found', job: null }
  if (job.status !== 'ok') return { error: 'not-ready', job: null }
  if (job.resolvedAction != null) return { error: 'already-resolved', job: null }
  return { error: null, job }
}

/** "Replace the existing photo": overwrite the source row's bytes in place, keep its id — then free
 * the object the row stopped naming (profpic-pointer-sync R3).
 *
 * ROW FIRST, BLOB SECOND, in three moves: read the row so the old object's URL is in hand, write
 * the new bytes (which moves every pointer and chat reference in the same batch — see
 * `updateNinaChatPhotoBlob` / `updateNinaAvatarBlob`), and only then ask `releaseBlobIfUnreferenced`
 * about the old object and the old album thumbnail. Until this set the old object was never
 * released here at all; every Photoshop replace leaked one file. The release never throws and its
 * outcome does not change this function's: the photo was replaced either way, and a kept object is
 * `reap-orphaned-blobs`' to collect. */
export async function resolvePhotoshopReplace(
  userId: string,
  jobId: string,
): Promise<NinaPhotoshopResolveOutcome> {
  const loaded = await loadResolvableJob(userId, jobId)
  if (loaded.error != null || loaded.job == null) {
    return { ok: false, reason: loaded.error ?? 'not-found' }
  }
  const job = loaded.job

  const patch = {
    blobUrl: job.resultBlobUrl!,
    pathname: job.resultPathname!,
    width: job.resultWidth!,
    height: job.resultHeight!,
    bytes: job.resultBytes!,
    contentHash: job.resultContentHash,
  }

  const before =
    job.sourceKind === 'avatar'
      ? await getNinaAvatar(userId, job.sourceId)
      : await getNinaMessageImage(userId, job.sourceId)
  if (before == null) return { ok: false, reason: 'source-unavailable' }

  const written =
    job.sourceKind === 'avatar'
      ? await updateNinaAvatarBlob(userId, job.sourceId, patch)
      : await updateNinaChatPhotoBlob(userId, job.sourceId, patch)

  if (written == null) return { ok: false, reason: 'source-unavailable' }

  await resolveNinaPhotoshopJob(userId, jobId, 'replaced')

  for (const ref of replacedObjects(before, patch.pathname)) {
    await releaseBlobIfUnreferenced(userId, ref)
  }
  return { ok: true }
}

/** The objects a replace stopped naming: the original's own bytes (unless the job somehow handed
 * back the same pathname — deleting what the row now serves would be unrecoverable) and an album
 * row's thumbnail, which `updateNinaAvatarBlob` just nulled. A chat row has no thumbnail columns,
 * hence the optional pair. `thumb_pathname ?? thumb_url` is `deleteNinaAvatarAction`'s spelling for
 * the same question. */
function replacedObjects(
  before: {
    blobUrl: string
    pathname: string
    thumbUrl?: string | null
    thumbPathname?: string | null
  },
  newPathname: string,
): Array<{ blobUrl: string; pathname: string }> {
  const refs: Array<{ blobUrl: string; pathname: string }> = []
  if (before.pathname !== newPathname) {
    refs.push({ blobUrl: before.blobUrl, pathname: before.pathname })
  }
  if (before.thumbUrl != null) {
    refs.push({ blobUrl: before.thumbUrl, pathname: before.thumbPathname ?? before.thumbUrl })
  }
  return refs
}

/** The album folder every photoshop result lands in on "Add as a new photo" — the runner's own
 * words: *"the image result must be added as a new image in directory Photoshop in Album."*
 * Shared with the `/photoshop` skill's script, which writes the identical literal in raw SQL
 * because it cannot import this module (`scripts/photoshop.mjs`'s header explains why). */
export const NINA_PHOTOSHOP_ALBUM_FOLDER = 'Photoshop'

/** "Add this as a new photo": always lands in the album (`nina_avatars`), never current, always
 * in the `Photoshop` folder — regardless of where the source photo came from. A photoshopped
 * chat photo has no message to attach a new row to (`insertNinaMessageImages` requires one it
 * owns), and the album is the one collection this admin-only feature can always write into. */
export async function resolvePhotoshopAdd(
  userId: string,
  jobId: string,
): Promise<NinaPhotoshopResolveOutcome> {
  const loaded = await loadResolvableJob(userId, jobId)
  if (loaded.error != null || loaded.job == null) {
    return { ok: false, reason: loaded.error ?? 'not-found' }
  }
  const job = loaded.job

  const inserted = await insertNinaAvatars(userId, [
    {
      blobUrl: job.resultBlobUrl!,
      pathname: job.resultPathname!,
      source: 'admin',
      folder: NINA_PHOTOSHOP_ALBUM_FOLDER,
      filename: null,
      sourceKey: `photoshop:${jobId}`,
      width: job.resultWidth,
      height: job.resultHeight,
      bytes: job.resultBytes,
      contentHash: job.resultContentHash,
    },
  ])
  if (inserted.length === 0) return { ok: false, reason: 'source-unavailable' }

  await resolveNinaPhotoshopJob(userId, jobId, 'added')
  return { ok: true }
}

/** "Cancel": the result is unsatisfactory. Marks the job resolved and leaves its blob where it
 * is — nothing in this pipeline deletes Blob objects on discard, matching every other job kind's
 * posture (`attemptOnce`'s own note: an orphaned blob is the `reap-orphaned-blobs` skill's job). */
export async function resolvePhotoshopDiscard(
  userId: string,
  jobId: string,
): Promise<NinaPhotoshopResolveOutcome> {
  const loaded = await loadResolvableJob(userId, jobId)
  if (loaded.error != null) return { ok: false, reason: loaded.error }

  await resolveNinaPhotoshopJob(userId, jobId, 'discarded')
  return { ok: true }
}
