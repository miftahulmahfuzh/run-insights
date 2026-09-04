'use client'

import imageCompression from 'browser-image-compression'

import { COMPRESSION_LIB_URL } from '@/lib/extract/constants'
import {
  NINA_CHAT_CONTENT_TYPE,
  NINA_CHAT_MAX_UPLOAD_BYTES,
  NINA_CHAT_TARGET_MAX_MB,
  NINA_CHAT_TARGET_QUALITY,
  NINA_CHAT_TARGET_SHORT_EDGE_PX,
} from '@/lib/nina/images'
import { longEdgeTargetFor } from './resizeTarget'

/**
 * One picked chat photo -> the bytes `glm-4.6v` gets to look at.
 *
 * A SIBLING OF `compressForExtraction`, not a parameterisation of it. That module's docstring is
 * explicit that it reproduces a MEASUREMENT — 560 px/q80, five 108/108 scores — and adding an
 * options bag would make it possible to run F04's extraction at a recipe nobody scored. So this
 * file duplicates about fifteen lines of library call and shares the one thing worth sharing:
 * `longEdgeTargetFor`, which is where the actual bug lives (`maxWidthOrHeight` clamps the LONG
 * edge, so passing the short-edge target directly ships a postage stamp).
 *
 * `COMPRESSION_LIB_URL` is reused as-is: the worker is self-hosted by
 * `scripts/copy-image-compression-worker.mjs`, and the library's default is a jsDelivr CDN URL
 * that would put a third party on the hot path of every upload.
 *
 * `maxIteration` is left at the library default here, unlike F04's deliberate `1`. F04 pins one
 * pass to protect an exact scored recipe; this has no scored recipe and does have a byte ceiling
 * a dense night shot can genuinely hit, which is the case iteration exists for.
 */

export interface CompressedNinaImage {
  file: File
  width: number
  height: number
  originalBytes: number
  compressedBytes: number
}

/**
 * Decode once to record the real pixel dimensions — they go into `nina_message_images.width/height`
 * so phase 13's gallery can reserve the right box before the image arrives.
 *
 * Returns zeros rather than throwing, matching `compressForExtraction`'s proven shape, so the
 * caller owns the message. `createImageBitmap` is the fast path; the `<img>` decode is the Safari
 * fallback for types it will not take.
 */
async function readDimensions(file: File): Promise<{ width: number; height: number }> {
  try {
    const bitmap = await createImageBitmap(file)
    const dims = { width: bitmap.width, height: bitmap.height }
    bitmap.close()
    return dims
  } catch {
    const url = URL.createObjectURL(file)
    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const el = new Image()
        el.onload = () => resolve(el)
        el.onerror = () => reject(new Error('decode failed'))
        el.src = url
      })
      return { width: img.naturalWidth, height: img.naturalHeight }
    } catch {
      return { width: 0, height: 0 }
    } finally {
      URL.revokeObjectURL(url)
    }
  }
}

export async function compressForNina(
  file: File,
  opts: { signal?: AbortSignal } = {},
): Promise<CompressedNinaImage> {
  const source = await readDimensions(file)
  if (!source.width || !source.height) {
    throw new Error(
      'This photo could not be read in this browser. If it is a HEIC photo, pick it from ' +
        'Photos rather than Files, or set Settings > Camera > Formats > Most Compatible.',
    )
  }

  const maxWidthOrHeight = longEdgeTargetFor(
    source.width,
    source.height,
    NINA_CHAT_TARGET_SHORT_EDGE_PX,
  )

  const out = await imageCompression(file, {
    maxWidthOrHeight,
    initialQuality: NINA_CHAT_TARGET_QUALITY,
    fileType: NINA_CHAT_CONTENT_TYPE,
    maxSizeMB: NINA_CHAT_TARGET_MAX_MB,
    useWebWorker: true,
    libURL: COMPRESSION_LIB_URL,
    /*
     * STRIP EXIF. Not "on principle" as F04 has it — here it is the point. A phone photo carries
     * GPS coordinates, and these blobs sit on a public CDN URL. Re-encoding from a canvas removes
     * the block entirely rather than trusting that there was nothing in it.
     */
    preserveExif: false,
    signal: opts.signal,
  })

  if (out.size > NINA_CHAT_MAX_UPLOAD_BYTES) {
    // Fail here rather than at token-mint, so the message names the photo and not the endpoint.
    throw new Error('That photo is unusually large even after compression. Try another one.')
  }

  const compressed = await readDimensions(out)
  return {
    file: out,
    width: compressed.width,
    height: compressed.height,
    originalBytes: file.size,
    compressedBytes: out.size,
  }
}
