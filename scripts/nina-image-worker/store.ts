/**
 * Storage: the generated PNG into Vercel Blob, under `nina/<userId>/<purpose>-<id>.png` (RU-7's
 * per-user prefix), hashed before it is put so a duplicate never lands as a second object.
 *
 * Part of the `nina-image-worker/` split; the system-level doc — why this worker exists, why it is
 * `.ts`, what it cannot import, where it runs — lives in the barrel `../nina-image-worker.ts`. The
 * worker's import rules: `.ts`-suffixed relative imports only, no `@/` aliases, no `server-only`,
 * CJS packages through `createRequire`.
 */
import { createRequire } from 'node:module'

import { newId } from '../../lib/id.ts'
import { contentHashOf } from '../../lib/photos/contentHash.ts'
import type { NinaImageDedupHit } from '../../lib/nina/imageDedupe.ts'
import {
  ninaImagePathname,
  NINA_IMAGE_CACHE_MAX_AGE,
  NINA_IMAGE_CONTENT_TYPE,
} from '../../lib/nina/imagerecipe.ts'
import type { NinaImageJobArgs } from '../../lib/nina/imagerecipe.ts'

import { findContentDuplicate } from './dedupe.ts'
import type { NeonSql } from './sql.ts'

/* `@vercel/blob` is CJS-friendly and is loaded the way every other script in `scripts/` loads such
 * packages (`scripts/blob-reap.mjs:34`), so this module needs no bundler and no transform beyond
 * stripping. */
const require = createRequire(import.meta.url)
const { put } = require('@vercel/blob') as {
  put: (
    pathname: string,
    body: Buffer,
    options: Record<string, unknown>,
  ) => Promise<{ url: string; pathname: string }>
}

/**
 * The PNG into Blob, under `nina/<userId>/<purpose>-<id>.png`. RU-7's per-user prefix.
 *
 * ── media-dedupe P3: HASH BEFORE PUT, IN LOCKSTEP WITH `lib/nina/imagerun.ts` ─────────────────
 * Same rule, second host: the bytes are in hand, so `contentHashOf` runs BEFORE `put` and a hit
 * in this user's originals skips the put entirely — `addRandomSuffix: true` would otherwise
 * guarantee that identical bytes land as a second object. The row-level decision is NOT made
 * here: `store` reports what it found and `finishSelfie` runs `planNinaImageWrite` — the SAME
 * pure function the app side calls — so the two hosts cannot disagree about what a deduped write
 * looks like. A lookup fault degrades to a plain put (a paid generation must never be lost to a
 * dedup read), exactly as the app side degrades.
 *
 * `avatar` is outside the dedup scope, here as there: `nina_avatars` carries no `content_hash`
 * and the Media collection never reads it.
 *
 * `sql` became a parameter because the dedup lookup needs the database; `runOneJob` is the only
 * caller and already holds it.
 */
export interface WorkerStoredImage {
  blobUrl: string
  pathname: string
  bytes: number
  /** sha-256 hex of the exact bytes, or null when the purpose is out of dedup scope (`avatar`). */
  contentHash: string | null
  /** Non-null: an original already holds these bytes and the put was SKIPPED. */
  duplicateOf: NinaImageDedupHit | null
}

async function putBlob(
  userId: string,
  purpose: NinaImageJobArgs['purpose'],
  bytes: Buffer,
): Promise<{ blobUrl: string; pathname: string }> {
  const blob = await put(ninaImagePathname(userId, purpose, newId()), bytes, {
    access: 'public',
    contentType: NINA_IMAGE_CONTENT_TYPE,
    addRandomSuffix: true,
    allowOverwrite: false,
    cacheControlMaxAge: NINA_IMAGE_CACHE_MAX_AGE,
    token: process.env.BLOB_READ_WRITE_TOKEN,
  })
  return { blobUrl: blob.url, pathname: blob.pathname }
}

export async function store(
  sql: NeonSql,
  userId: string,
  purpose: NinaImageJobArgs['purpose'],
  b64: string,
): Promise<WorkerStoredImage> {
  const bytes = Buffer.from(b64, 'base64')
  if (purpose === 'avatar') {
    const blob = await putBlob(userId, purpose, bytes)
    return { ...blob, bytes: bytes.byteLength, contentHash: null, duplicateOf: null }
  }

  const contentHash = await contentHashOf(bytes)

  let duplicateOf: NinaImageDedupHit | null = null
  try {
    duplicateOf = await findContentDuplicate(sql, userId, contentHash)
  } catch (cause) {
    console.warn('[nina-worker] dedup lookup failed; storing anyway', {
      hash: contentHash.slice(0, 12),
      error: String(cause),
    })
  }
  if (duplicateOf != null) {
    console.info('[nina-worker] duplicate content; the put is skipped', {
      bytes: bytes.byteLength,
      hash: contentHash.slice(0, 12),
    })
    return {
      blobUrl: duplicateOf.blobUrl,
      pathname: duplicateOf.pathname,
      bytes: bytes.byteLength,
      contentHash,
      duplicateOf,
    }
  }

  const blob = await putBlob(userId, purpose, bytes)
  return { ...blob, bytes: bytes.byteLength, contentHash, duplicateOf: null }
}
