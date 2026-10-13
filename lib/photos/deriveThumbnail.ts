import 'server-only'

import sharp from 'sharp'

import {
  PHOTO_THUMB_CONTENT_TYPE,
  PHOTO_THUMB_JPEG_QUALITY_PERCENT,
  thumbnailTargetFor,
} from './thumbnailSpec'

/**
 * **The ONE server-side thumbnail encoder** — `sharp`, over bytes, to the spec in
 * `./thumbnailSpec` that the browser encoder (`components/admin/explorer/thumbnail.ts`) also
 * reads. `lib/nina/perceptualSign.ts`'s shape, deliberately, because it is the same shape of
 * problem: a native module, a server-only host, and a degradation ladder that must never throw.
 *
 * ── WHY A SERVER ENCODER EXISTS AT ALL, GIVEN F34 USED THE BROWSER ───────────────────────────
 * F34's thumbnails were derived in the tab that was already decoding the file to measure it —
 * free pixels, no egress. That stays the right answer for anything a human uploads. It is simply
 * not available for two of the three write paths this plan covers:
 *
 *   · **Her generated photographs.** `scripts/nina-image-worker` renders a 768x1024 PNG on a
 *     server and `lib/nina/imagerun.ts` stores it. No browser is in the loop, and the one that
 *     eventually *displays* it is the one we are trying to stop downloading a megabyte.
 *   · **The three backfills.** 1,274 existing objects have no thumbnail and never will unless
 *     something reads the original and derives one. That something is a script.
 *
 * ── THE COST, STATED, BECAUSE THIS FEATURE IS ABOUT COST ─────────────────────────────────────
 * Deriving on the server means the bytes travel: a GET of the original (Blob Data Transfer + a
 * Simple Operation on a cache miss) and a PUT of the thumbnail (an Advanced Operation). That is
 * ~1 MB and two operations **once per photograph, ever** — against ~1 MB **per tile per page
 * view** without it. The backfill is the expensive direction and it is bounded by the table; the
 * steady state is one derivation per generation.
 *
 * It is also why the generated path derives from the bytes it ALREADY HOLDS in memory
 * (`deriveThumbnailBytes`) rather than re-fetching what it just uploaded. `fetchAndDeriveThumbnail`
 * exists for the backfills, which by definition do not hold the bytes.
 *
 * ── FAILURE IS `null`, AND `null` IS A LEGAL PERMANENT STATE ─────────────────────────────────
 * Every throw is caught — a decode failure, an odd buffer, a sharp fault, a 403 from a suspended
 * store — and degrades to "this photograph has no thumbnail". The columns are nullable precisely
 * so that this is a degradation and not an error: the renderer falls back to `blob_url`, which is
 * what every grid did before this plan. A thumbnail must never be able to fail a send, a
 * generation, or a backfill row. Same ladder `signImageBytes` follows, for the same invariant.
 *
 * `sharp` is in `dependencies` and named in `serverExternalPackages` (`next.config.ts`) — a
 * native module must be required, not bundled.
 */

/** The derived JPEG plus what the caller must record about it. */
export interface DerivedThumbnail {
  bytes: Uint8Array
  contentType: typeof PHOTO_THUMB_CONTENT_TYPE
  width: number
  height: number
}

/**
 * Derive a thumbnail from bytes already in hand. `null` on any failure.
 *
 * `failOn: 'none'` matches `signImageBytes`: a truncated or slightly malformed file should yield
 * the pixels it does have rather than refuse, because the alternative here is not a better
 * thumbnail, it is no thumbnail.
 *
 * The white ground is not cosmetic and is the one thing this shares with the browser encoder
 * beyond the spec: her originals are PNGs with an alpha channel, and alpha flattens to BLACK
 * under a JPEG encoder unless a ground is painted first — a black halo around her hair on every
 * tile. `flatten` before `jpeg`, white, never a theme colour, because these are baked pixels.
 */
export async function deriveThumbnailBytes(bytes: Uint8Array): Promise<DerivedThumbnail | null> {
  try {
    const img = sharp(bytes, { failOn: 'none' })
    const meta = await img.metadata()
    if (meta.width == null || meta.height == null) return null

    const target = thumbnailTargetFor(meta.width, meta.height)
    const out = await img
      .resize(target.width, target.height, { fit: 'fill' })
      .flatten({ background: '#ffffff' })
      .jpeg({ quality: PHOTO_THUMB_JPEG_QUALITY_PERCENT })
      .toBuffer()

    return {
      bytes: new Uint8Array(out),
      contentType: PHOTO_THUMB_CONTENT_TYPE,
      width: target.width,
      height: target.height,
    }
  } catch {
    return null
  }
}

/**
 * Fetch a stored photograph's own bytes and derive a thumbnail from them — the backfills' shape,
 * and `fetchAndSignImage`'s verbatim, including the `https:`-only check.
 *
 * `null` for a bad URL, a failed GET, or an undecodable body. **A suspended Blob store returns
 * `403` here and therefore `null`**, which is the correct and safe answer: a backfill run against
 * a blocked store writes no rows and reports every photograph as unfilled, rather than stamping
 * NULLs over a table or half-deriving from error pages.
 */
export async function fetchAndDeriveThumbnail(url: string): Promise<DerivedThumbnail | null> {
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'https:') return null
    const response = await fetch(parsed, { redirect: 'follow' })
    if (!response.ok) return null
    return await deriveThumbnailBytes(new Uint8Array(await response.arrayBuffer()))
  } catch {
    return null
  }
}
