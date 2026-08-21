import { MAX_SOURCE_BYTES } from './constants'

/**
 * Is this picked file worth decoding at all, and if not, what does the runner get told?
 *
 * ── WHY IT LIVES HERE AND NOT IN `lib/photos/compressForExtraction.ts` ──────────────────────
 * It used to live there, beside the compressor it guards. But that module opens with `'use client'`
 * and imports `browser-image-compression`, and this function is now read by
 * `lib/extract/planPicked.ts` — which exists to be unit-testable under `environment: 'node'`.
 * Pulling a bundler-shaped client module into a node test to reach nine pure lines is the wrong
 * trade, and `lib/photos/resizeTarget.ts` was split out of the same file for the same kind of
 * reason.
 *
 * It also belongs here on the merits: it validates rather than compresses, and the only number it
 * argues with (`MAX_SOURCE_BYTES`) is defined two modules away in `./constants`.
 *
 * The messages are the runner-facing copy for a rejected pick, so they are quoted in
 * `tests/extract.planPicked.test.ts` rather than matched loosely — a silent rewording is a change
 * to the product, not to an implementation detail.
 */
export function rejectionReason(file: File): string | null {
  if (!file.type.startsWith('image/') && !/\.(png|jpe?g|heic|heif|webp)$/i.test(file.name)) {
    return `“${file.name}” is not an image.`
  }
  if (file.size === 0) return `“${file.name}” is empty.`
  if (file.size > MAX_SOURCE_BYTES) {
    return `“${file.name}” is too large (${Math.round(file.size / 1e6)} MB).`
  }
  return null
}
