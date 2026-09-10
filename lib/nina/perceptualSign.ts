import 'server-only'

import sharp from 'sharp'

import { dhashHexOf, sig16ToBase64 } from './perceptual'

/**
 * **The ONE signer** — `sharp`, over bytes, to the exact signature pair the perceptual twin gates
 * compare (`lib/nina/perceptual.ts`). Server-only because sharp is a native module and the two
 * callers (`lib/nina/actions.ts`'s send-time race-close, `lib/nina/imagerun.ts`'s generated store)
 * are both server hosts.
 *
 * ── WHY THIS PIPELINE, AND WHY IT MUST NOT GROW AN OPTION ─────────────────────────────────────
 * These are `scripts/nina-dedupe-media.mjs`'s `signBytes` lines, verbatim: `resize(…, fit: 'fill')`
 * then `grayscale()` then `raw()`, a 9x8 pass for the 64-bit difference hash and a 16x16 pass for
 * the mean-abs gate. The sweep is where the signatures were invented and where the measurement
 * (dHash 0/64, mean-abs 0.1/255 on a real re-encode pair) was taken; a second pipeline here — a
 * different kernel, a different gray coefficient, a different resize order — would produce
 * signatures that answer the gates slightly differently from the sweep's, and the two layers would
 * drift apart in the exact direction a conservative gate cannot see. If the sweep's `signBytes`
 * ever changes, this file changes in the same commit, and the reverse.
 *
 * ── FAILURE IS `null`, AND `null` MEANS "LAND FRESH" ──────────────────────────────────────────
 * Every throw is caught: a decode failure, an odd buffer, a sharp fault — any of them degrades to
 * "this photograph carries no signature", which is the write paths' standing degradation ladder
 * (invariant 9's shape: dedup must never make a send worse, so it may never make one throw). The
 * same rule the byte-hash paths follow; the caller writes the row and moves on.
 *
 * `sharp` itself is in `dependencies` (moved up from dev on the same commit) and named in
 * `serverExternalPackages` (`next.config.ts`) — a native module must not be bundled, only
 * required. `scripts/nina-image-worker.ts`'s runner installs with `--omit=dev`, which now INCLUDES
 * this package, but the worker's rows are still written unsigned: the sweep's `fill-perceptual`
 * op owns them, and giving the worker a second signer is how the one-pipeline rule above dies.
 */

/** A signature pair plus the dimensions the gates need, all measured off the same bytes. */
export interface NinaImageSignature {
  /** 64-bit difference hash, 16 lowercase hex characters (`dhashHexOf`). */
  dhashHex: string
  /** The 16x16 grayscale thumbnail, base64 (`sig16ToBase64`). */
  sig16Base64: string
  /** Pixel dimensions of the bytes — measured here, never trusted from a client claim. */
  width: number
  height: number
}

/** Sign bytes. `null` on any failure — the caller lands the photograph fresh and unsigned. */
export async function signImageBytes(bytes: Uint8Array): Promise<NinaImageSignature | null> {
  try {
    const img = sharp(bytes, { failOn: 'none' })
    const [meta, sig16, dh] = await Promise.all([
      img.metadata(),
      img.clone().resize(16, 16, { fit: 'fill' }).grayscale().raw().toBuffer(),
      img.clone().resize(9, 8, { fit: 'fill' }).grayscale().raw().toBuffer(),
    ])
    if (meta.width == null || meta.height == null) return null

    let dhash = 0n
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        // The raw 9x8 buffer is exactly 72 bytes; both indices are in range by construction.
        if (dh[y * 9 + x]! > dh[y * 9 + x + 1]!) dhash |= 1n << BigInt(y * 8 + x)
      }
    }
    return {
      dhashHex: dhashHexOf(dhash),
      sig16Base64: sig16ToBase64(new Uint8Array(sig16)),
      width: meta.width,
      height: meta.height,
    }
  } catch {
    return null
  }
}

/**
 * Fetch a stored photograph's own bytes and sign them. This is the send-time race-close's shape —
 * the chat upload PUTs browser → Blob directly, so the only way the server can hold the bytes it
 * just promised to dedup against is a GET of the public URL it already has. `null` for a bad URL,
 * a failed GET, or an undecodable body — same ladder as above.
 */
export async function fetchAndSignImage(url: string): Promise<NinaImageSignature | null> {
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'https:') return null
    const response = await fetch(parsed, { redirect: 'follow' })
    if (!response.ok) return null
    const bytes = new Uint8Array(await response.arrayBuffer())
    return await signImageBytes(bytes)
  } catch {
    return null
  }
}
