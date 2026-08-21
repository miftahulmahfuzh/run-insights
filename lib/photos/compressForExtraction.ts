'use client'

import imageCompression from 'browser-image-compression'

import {
  COMPRESSION_LIB_URL,
  COMPRESSION_MAX_ITERATION,
  MAX_UPLOAD_BYTES,
  TARGET_MAX_MB,
  TARGET_QUALITY,
  TARGET_SHORT_EDGE_PX,
  UPLOAD_CONTENT_TYPE,
} from '@/lib/extract/constants'
import { longEdgeTargetFor } from './resizeTarget'

/**
 * One picked screenshot → the exact image recipe that measured 108/108.
 *
 * This module reproduces a MEASUREMENT, not a preference. `research/downscale.mjs` scored five
 * variants; **JPEG q80 at 560 px on the short edge** ships because it costs 170 KB and 3,277
 * input tokens for three images with zero accuracy loss. Every option below either serves that
 * recipe or explains why it deviates from `expense-tracking`'s otherwise-identical compressor.
 */

export interface CompressedShot {
  file: File
  width: number
  height: number
  originalBytes: number
  compressedBytes: number
}

export async function compressForExtraction(
  file: File,
  opts: { signal?: AbortSignal; onProgress?: (percent: number) => void } = {},
): Promise<CompressedShot> {
  const source = await readDimensions(file)
  if (!source.width || !source.height) {
    throw new Error(
      'This image could not be read in this browser. If it is a HEIC photo, pick it from ' +
        'Photos rather than Files, or set Settings → Camera → Formats → Most Compatible.',
    )
  }

  // §3.1 — the whole point. `maxWidthOrHeight` clamps the LONG edge; we want the SHORT edge at
  // 560, so we hand it the long-edge value that produces that. Passing 560 directly would ship a
  // 259 px-wide image and silently leave the measured accuracy envelope.
  const maxWidthOrHeight = longEdgeTargetFor(source.width, source.height, TARGET_SHORT_EDGE_PX)

  let out: File
  try {
    out = await imageCompression(file, {
      maxWidthOrHeight,
      initialQuality: TARGET_QUALITY,
      fileType: UPLOAD_CONTENT_TYPE,
      /*
       * maxIteration: 1 is a deliberate difference from expense-tracking's compress.ts, which
       * targets a BYTE budget and lets the library iterate quality downward until it hits it.
       * That is right for arbitrary photos and wrong here: this module reproduces the EXACT
       * recipe that was scored (560 short edge, q80), and an iterative byte-budget search could
       * silently settle on a quality nobody ever measured. maxSizeMB is set generously as a
       * ceiling, not a target — at this recipe a screenshot lands near 55–60 KB.
       */
      maxSizeMB: TARGET_MAX_MB,
      maxIteration: COMPRESSION_MAX_ITERATION,
      // Off the main thread, so a 12 MP decode does not jank the picker. Needs OffscreenCanvas;
      // where it is missing the library falls back to the main thread by itself.
      useWebWorker: true,
      // Self-hosted by scripts/copy-image-compression-worker.mjs. The library's default here is
      // a jsDelivr CDN URL, which would put a third party on the hot path of every upload.
      libURL: COMPRESSION_LIB_URL,
      // Screenshots carry no GPS EXIF, but strip on principle: these blobs are served on an
      // unauthenticated /s/[token] page (D9), and re-encoding from a canvas removes the block
      // entirely rather than trusting that there was nothing in it.
      preserveExif: false,
      signal: opts.signal,
      onProgress: opts.onProgress,
    })
  } catch (cause) {
    if (opts.signal?.aborted) throw cause
    throw new Error(`“${file.name}” could not be processed in this browser.`)
  }

  const dims = await readDimensions(out)
  if (!dims.width || !dims.height || out.size < 1024) {
    // A browser that cannot decode the source produces a blank canvas rather than throwing.
    throw new Error(`“${file.name}” could not be read in this browser.`)
  }
  if (out.size > MAX_UPLOAD_BYTES) {
    // Refuse here, client-side, before any bytes move — a readable message instead of the opaque
    // 400 the upload route's maximumSizeInBytes would otherwise produce.
    throw new Error(
      `“${file.name}” is still ${Math.round(out.size / 1000)} KB after compression — too large.`,
    )
  }

  return {
    file: out,
    width: dims.width,
    height: dims.height,
    originalBytes: file.size,
    compressedBytes: out.size,
  }
}

/**
 * Decode once to record the real pixel dimensions. Worth the extra decode twice over: they go
 * into `run_photos.width/height` so the review strip can reserve the right box before the image
 * arrives, and they are the only evidence available afterwards that §3.1's trap did not reopen —
 * a portrait source must come out taller than wide, with its short edge at 560.
 *
 * Returns zeros instead of throwing; the caller turns that into a readable message.
 */
async function readDimensions(file: File): Promise<{ width: number; height: number }> {
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
