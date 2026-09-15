'use client'

import { longEdgeTargetFor } from '@/lib/photos/resizeTarget'

/**
 * The SEARCH query photograph: a picked file -> a small JPEG **data URI**, and nowhere else.
 *
 * ── THIS FILE IS THE ONE THAT DOES NOT UPLOAD ───────────────────────────────────────────────
 * Its two neighbours in this folder both end in a PUT: `chatPhotoUpload.ts` writes
 * `nina/<userId>/selfie-<id>.jpg`, `thumbnail.ts` writes the derived 256 px copy beside an avatar.
 * This one writes nothing. The image the operator drops into the search field is a QUESTION, not a
 * photograph the album is gaining — phase 3 captions it with `glm-4.6v`, embeds the caption, ranks
 * against it, and the bytes are finished. A PUT here would leave one orphan Blob object per search,
 * for an image nobody will ever ask for again, in a store whose orphans already need a reaper
 * (`scripts/blob-reap.mjs`). There is no `@vercel/blob/client` import in this module and
 * `tests/admin.photoSearch.test.ts` pins its absence.
 *
 * ── 768 px SHORT EDGE, q0.75, AND WHY THOSE ARE THIS FILE'S OWN NUMBERS ─────────────────────
 * `lib/nina/images.ts:28-31` measured them for the composer: *"~1024x768 at 4:3 -> ~1,700 input
 * tokens"*, and *"a photograph tolerates more chroma loss than rendered UI type"*. The reader of
 * these bytes is the same model those numbers were chosen for. They are nevertheless DECLARED here
 * rather than imported, which is `chatPhotoUpload.ts:26-34`'s and `thumbnail.ts:30-40`'s standing
 * ruling: a constant is shared when it is AGREED ON, and no module on the server agrees with this
 * one — the data URI crosses the boundary as opaque bytes and nothing re-derives its size.
 *
 * SHORT edge, via `longEdgeTargetFor` — `thumbnail.ts:1` reaches for the same helper for the same
 * reason `lib/photos/resizeTarget.ts`'s header gives: clamping the LONG edge of a portrait to 768
 * lands its width at ~350 px, which is outside the envelope the vision model was measured in.
 * It never upscales, so a small pick is passed through at its own size.
 *
 * ── ONE DECODE, AND `close()` IS NOT TIDINESS ───────────────────────────────────────────────
 * `thumbnail.ts:22-28`'s measurement, unchanged: a 4032x3024 JPEG is ~48 MB of decoded surface.
 * Hence the `finally`.
 *
 * Throws on a file that does not decode and on a browser with no `OffscreenCanvas`. The caller
 * reports the message on the control — there is no silent fallback, because a search that quietly
 * dropped its image would return text-only results and look like a ranking bug.
 */

/**
 * `knip` flags these four constants as unused: their only outside reader is
 * `tests/admin.photoSearch.test.ts`, which pins them by `readFileSync`-ing this file's SOURCE TEXT
 * (the same reason `EXTRACTION_SHAPE` in `lib/llm/prompts/extraction.ts` is knip's other documented
 * blind spot) rather than importing them, so no import graph shows that reader. `tsc` stays green
 * either way; dropping `export` would silently desync the pinned numbers from what the test reads.
 */

/** 768 px on the SHORT edge. See the header — `glm-4.6v`'s measured envelope. */
export const SEARCH_QUERY_SHORT_EDGE_PX = 768

/** 0.75. See the header. */
export const SEARCH_QUERY_QUALITY = 0.75

/** JPEG, always. It is a question, not an archive: transparency is meaningless. */
export const SEARCH_QUERY_CONTENT_TYPE = 'image/jpeg'

/**
 * The data URI's character ceiling.
 *
 * Next's Server Action body limit is **1 MB** by default (`serverActions.bodySizeLimit`;
 * `next.config.ts` does not raise it and this feature is not a reason to). A 768 px short-edge JPEG
 * at q0.75 is ~60-120 KB, ~80-160 KB once base64 inflates it by 4/3 — an order of magnitude under.
 * This cap exists for the pathological source (a 12000 px panorama that stays huge at 768 short
 * edge) so the operator gets a sentence instead of a Server Action that fails with a framework
 * error naming a limit they have never heard of.
 */
export const SEARCH_QUERY_MAX_DATA_URI_CHARS = 700_000

/**
 * Decode once, scale on the canvas, encode JPEG, read out as a data URI.
 */
export async function encodeSearchQueryImage(file: File): Promise<string> {
  if (typeof OffscreenCanvas === 'undefined') {
    throw new Error('This browser cannot re-encode an image.')
  }

  const bitmap = await createImageBitmap(file)
  try {
    const longEdge = Math.max(bitmap.width, bitmap.height)
    const target = longEdgeTargetFor(bitmap.width, bitmap.height, SEARCH_QUERY_SHORT_EDGE_PX)
    const scale = longEdge === 0 ? 1 : target / longEdge
    const width = Math.max(1, Math.round(bitmap.width * scale))
    const height = Math.max(1, Math.round(bitmap.height * scale))

    const canvas = new OffscreenCanvas(width, height)
    const context = canvas.getContext('2d')
    if (context == null) throw new Error('This browser cannot re-encode an image.')

    // A PNG with an alpha channel flattens to BLACK behind a JPEG encoder unless the ground is
    // painted first. White, not `--card`: this is baked pixel data and must not carry a theme.
    // (`chatPhotoUpload.ts:109-112`, `thumbnail.ts:106-108`.)
    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, width, height)
    context.drawImage(bitmap, 0, 0, width, height)

    const blob = await canvas.convertToBlob({
      type: SEARCH_QUERY_CONTENT_TYPE,
      quality: SEARCH_QUERY_QUALITY,
    })

    const dataUri = await blobToDataUri(blob)
    if (dataUri.length > SEARCH_QUERY_MAX_DATA_URI_CHARS) {
      throw new Error('That photo is too big to search with. Try a smaller one.')
    }
    return dataUri
  } finally {
    bitmap.close()
  }
}

/**
 * `FileReader` and not a hand-rolled `btoa` over an `ArrayBuffer`: the reader emits the whole
 * `data:image/jpeg;base64,…` string including the media type, which is the exact shape
 * `lib/nina/prompts/describe.ts`'s `NinaDescribeImage { dataUri }` wants, and a manual base64 of a
 * ~100 KB buffer through `String.fromCharCode` is the classic call-stack overflow.
 */
function blobToDataUri(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('This browser could not read the re-encoded image.'))
    reader.onload = () => {
      const result = reader.result
      if (typeof result === 'string') resolve(result)
      else reject(new Error('This browser could not read the re-encoded image.'))
    }
    reader.readAsDataURL(blob)
  })
}
