import 'server-only'

import { put } from '@vercel/blob'

import { blobEnv } from '@/lib/env'
import { deriveThumbnailBytes, fetchAndDeriveThumbnail } from '@/lib/photos/deriveThumbnail'

import { ninaThumbPathname } from './images'
import { NINA_IMAGE_CACHE_MAX_AGE } from './imagerecipe'

/**
 * **Derive a grid thumbnail and store it beside its original** — the one place in the app that
 * writes a `thumb-*` object, so the two server write paths cannot drift in pathname, cache
 * header, suffix policy or degradation behaviour.
 *
 * ── TWO ENTRY POINTS, BECAUSE THERE ARE TWO WAYS TO HAVE THE PIXELS ─────────────────────────
 * `fromBytes` is the generated path (`lib/nina/imagerun.ts`): the server rendered the photograph
 * and is still holding it, so deriving costs nothing but CPU. `fromStoredUrl` is the chat-upload
 * path (`lib/nina/actions/send.ts`): the browser PUT straight to Blob (F04 §10), so the only way
 * the server can hold those bytes is to GET the public URL it was just handed — which that path
 * already does once to sign them (`fetchAndSignImage`), and which is cheap because a chat upload
 * is pre-compressed to ~120-200 KB.
 *
 * Both answer `null` on every failure and neither ever throws. That is not politeness, it is the
 * contract the nullable columns were designed around: a photograph must never be lost, delayed or
 * refused because its *thumbnail* could not be made. The row lands with NULL, the grid renders
 * the original exactly as it did before this feature, and `scripts/backfill-thumbnails.mjs` fills
 * it on the next sweep.
 *
 * ── WHAT IS DELIBERATELY NOT HERE ───────────────────────────────────────────────────────────
 * No "derive one for a reference row". A row that renders another row's bytes takes that row's
 * thumbnail — `planNinaImageWrite` and `ninaUploadInsertRow` both implement it, and the backfill
 * reached the same rule from the data (1,304 rows named 1,037 objects). The thumbnail follows the
 * BYTES. Adding a convenience here that derived per-row would quietly undo that everywhere.
 */
export interface StoredThumbnail {
  blobUrl: string
  pathname: string
}

/**
 * `addRandomSuffix: true`, like every other writer in this repo, so the RETURNED pathname is not
 * the one asked for. That is why callers must store what comes back rather than recomputing it —
 * see `nina_message_images.thumb_pathname`'s header.
 *
 * `allowOverwrite: false` because a collision here would mean two different photographs' tiles at
 * one address, and the suffix makes a collision mean a bug rather than a retry.
 */
async function putThumbnail(
  originalPathname: string,
  derived: { bytes: Uint8Array; contentType: string },
): Promise<StoredThumbnail | null> {
  try {
    const blob = await put(ninaThumbPathname(originalPathname), Buffer.from(derived.bytes), {
      access: 'public',
      contentType: derived.contentType,
      addRandomSuffix: true,
      allowOverwrite: false,
      cacheControlMaxAge: NINA_IMAGE_CACHE_MAX_AGE,
      /* Through `lib/env.ts`, never `process.env` — `lib/nina/imagerun.ts` states the rule and
       * `scripts/` is the only place that reads the raw variable. */
      token: blobEnv().BLOB_READ_WRITE_TOKEN,
    })
    return { blobUrl: blob.url, pathname: blob.pathname }
  } catch (cause) {
    console.warn('[nina] thumbnail put failed; the grid will load the original', {
      pathname: originalPathname,
      error: String(cause),
    })
    return null
  }
}

/** The generated path: the bytes are in hand, so no GET is spent. */
export async function storeThumbnailFromBytes(
  originalPathname: string,
  bytes: Uint8Array,
): Promise<StoredThumbnail | null> {
  const derived = await deriveThumbnailBytes(bytes)
  if (derived == null) {
    console.warn('[nina] thumbnail derivation failed; the grid will load the original', {
      pathname: originalPathname,
    })
    return null
  }
  return await putThumbnail(originalPathname, derived)
}

/** The upload path: the browser owns the bytes, so the server fetches the object it was handed. */
export async function storeThumbnailFromStoredUrl(
  blobUrl: string,
  originalPathname: string,
): Promise<StoredThumbnail | null> {
  const derived = await fetchAndDeriveThumbnail(blobUrl)
  if (derived == null) {
    console.warn('[nina] thumbnail derivation failed; the grid will load the original', {
      pathname: originalPathname,
    })
    return null
  }
  return await putThumbnail(originalPathname, derived)
}
