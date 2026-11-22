import 'server-only'

import sharp from 'sharp'

import type { RgbImage } from './pixels'

/**
 * **The one codec in `lib/extract/chart/`** — bytes of a stored screenshot (the browser's 560 px
 * JPEG, or a PNG) to the 8-bit RGB buffer `estimateFromCharts` reads.
 *
 * Server-only because `sharp` is a native module (`serverExternalPackages` in `next.config.ts`,
 * the same arrangement as `lib/photos/deriveThumbnail.ts`). Everything else in this directory is
 * pure and never imports this file, so the estimator stays testable and bundle-safe
 * (WORKOUT_DETAILS_ESTIMATE_PLAN invariant 7).
 *
 * Alpha is dropped and the colourspace forced to 8-bit sRGB, so a greyscale, palette, 16-bit or
 * RGBA input still comes back as exactly 3 bytes per pixel.
 *
 * THROWS on bytes `sharp` cannot decode. That is deliberate: this is the I/O edge, and the caller
 * (the extraction job) owns the degradation — it catches and finishes with no estimate (R2.4).
 */
export async function decodeToRgb(jpegOrPng: Buffer): Promise<RgbImage> {
  const { data, info } = await sharp(jpegOrPng)
    .removeAlpha()
    .toColourspace('srgb')
    .raw()
    .toBuffer({ resolveWithObject: true })
  if (info.channels !== 3 || data.length !== info.width * info.height * 3) {
    throw new Error(
      `decodeToRgb: expected 3-channel RGB, got ${info.channels} channels for ${info.width}x${info.height}`,
    )
  }
  return {
    width: info.width,
    height: info.height,
    data: new Uint8Array(data.buffer, data.byteOffset, data.length),
  }
}
