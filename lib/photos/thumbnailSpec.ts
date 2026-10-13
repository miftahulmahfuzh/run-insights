/*
 * **The `.ts` extension is load-bearing, not a slip.** `scripts/backfill-thumbnails.mjs` imports
 * this module under `node --experimental-strip-types`, whose ESM resolver does no extension
 * guessing — an extensionless specifier here is `ERR_MODULE_NOT_FOUND` at link time, before a
 * line runs. `tsconfig.json` already sets `allowImportingTsExtensions`, and Turbopack resolves it
 * unchanged, so this costs the app nothing and is what keeps the backfill reading the SAME short
 * edge, quality and box arithmetic the two encoders read instead of copying three constants into
 * a script.
 *
 * `lib/nina/avatarEmbedText.ts` is the precedent for "a script imports a lib module", and it only
 * works there because that file is a LEAF with no imports at all. This one has exactly one, so
 * spelling it is the whole price of staying importable.
 */
import { longEdgeTargetFor } from './resizeTarget.ts'

/**
 * **What a derived display thumbnail IS** — one short edge, one quality, one container, and the
 * arithmetic that turns a source's dimensions into a target box. Pure, no I/O, no `server-only`,
 * so the browser encoder and the sharp encoder can both import it.
 *
 * ── WHY THIS FILE EXISTS NOW AND DID NOT BEFORE ──────────────────────────────────────────────
 * F34 R1 put these numbers in `components/admin/explorer/thumbnail.ts` and said so explicitly:
 * *"THE TWO NUMBERS BELOW ARE THE CLIENT'S OWN. Nothing on the server re-encodes anything, so no
 * other module has to agree with the short edge or the quality… a constant is shared when it is
 * **agreed on**, and these are not."*
 *
 * That reasoning was correct and its premise has now changed. media-thumbnails phase 2 adds a
 * SERVER encoder (`./deriveThumbnail`, sharp) because two of the three write paths never touch a
 * browser — Nina's generated selfies are produced by `scripts/nina-image-worker` and land through
 * `lib/nina/imagerun.ts`, and the three backfills read originals out of Blob on a server. So the
 * numbers are agreed on now, by two encoders, and the F34 header's own rule says that is exactly
 * when they move. They moved here; that header now points at this file.
 *
 * The rule the move preserves is the one that mattered: **one home**. Two encoders with two short
 * edges would make a grid where a photograph's tile sharpness depended on which path uploaded it,
 * and nothing would ever flag it.
 */

/**
 * 256 px on the SHORT edge — F34's number, unchanged, and the reasoning carries to the new tables.
 *
 * The album grid draws at ~96 px (`size-24`), `NinaPhotoGrid`'s desktop tier floors a tile at
 * 92 px (`PHOTO_REFERENCE_MIN_TILE_PX`), and `ScreenshotStrip` draws `h-[168px]`. 256 covers the
 * largest of those at 1.5x and the rest at better than 2x.
 *
 * It is a SHORT-edge target, which is the whole reason `longEdgeTargetFor` exists: her generated
 * photographs are 768x1024 portrait (`NINA_IMAGE_WIDTH`/`NINA_IMAGE_HEIGHT`) and a run screenshot
 * is 739x1600, so clamping the LONG edge to 256 would land a 118 px-wide strip — the exact trap
 * `lib/photos/resizeTarget.ts` was split out of the compression module to document.
 */
export const PHOTO_THUMB_SHORT_EDGE_PX = 256

/**
 * 0.82. F34 measured it *"visually clean at 96 px and lands a 256 px face around 15–25 KB"*.
 *
 * Expressed on the browser's 0–1 scale because `OffscreenCanvas.convertToBlob` is the encoder
 * that cannot take any other, and `PHOTO_THUMB_JPEG_QUALITY_PERCENT` converts for sharp rather
 * than restating the number. One literal, two encoders.
 */
export const PHOTO_THUMB_QUALITY = 0.82

/** The same quality on sharp's 0–100 scale. Derived, never a second literal. */
export const PHOTO_THUMB_JPEG_QUALITY_PERCENT = Math.round(PHOTO_THUMB_QUALITY * 100)

/**
 * JPEG, always, whatever the original was — F34's ruling, and the new tables strengthen it. A
 * display derivative has no use for transparency, and the originals this now covers are her
 * 768x1024 **PNGs**, which is the class that benefits most: the whole point is that a tile must
 * not cost a megabyte.
 *
 * It is already in `ADMIN_AVATAR_CONTENT_TYPES`, so the avatar upload route's
 * `allowedContentTypes` still needs no new member.
 */
export const PHOTO_THUMB_CONTENT_TYPE = 'image/jpeg'

/** `.jpg`, to match the content type. The one place a thumbnail pathname's extension is decided. */
export const PHOTO_THUMB_EXT = 'jpg'

export interface ThumbnailTarget {
  width: number
  height: number
}

/**
 * The target box for a source of these dimensions, short edge on `PHOTO_THUMB_SHORT_EDGE_PX`.
 *
 * **Never upscales** — `longEdgeTargetFor` returns the source's own long edge when its short edge
 * is already at or below the target, so a small original is re-encoded at its own size rather
 * than interpolated up to a sharpness it does not have. A thumbnail that is bigger than its
 * original would also be the one case where this feature costs transfer instead of saving it.
 *
 * Both dimensions are floored at 1: a 4000x1 source is pathological rather than impossible, and a
 * zero-height canvas throws in the browser and in sharp alike.
 *
 * Throws on implausible dimensions, inheriting `longEdgeTargetFor`'s contract. Every caller is
 * already inside a try/catch that degrades to "no thumbnail", which is a legal permanent state.
 */
export function thumbnailTargetFor(width: number, height: number): ThumbnailTarget {
  const longEdge = longEdgeTargetFor(width, height, PHOTO_THUMB_SHORT_EDGE_PX)
  const scale = longEdge / Math.max(width, height)
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  }
}
