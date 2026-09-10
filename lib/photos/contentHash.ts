/**
 * sha-256 over image bytes, as the one string every dedup layer agrees on.
 *
 * ── WHY WEBCRYPTO AND NOT NODE'S `crypto` ────────────────────────────────────────────────────
 * This module runs in THREE hosts and must produce byte-identical answers in all of them:
 *   · the browser — the composer hashes the compressed bytes it is about to PUT, because the
 *     server never sees upload bytes (`/api/upload` mints a token; the PUT goes browser → Blob);
 *   · the server — the generated path hashes bytes before `put`, and the actions validate what
 *     the client claimed;
 *   · strip-types scripts — the backfill sweep hashes by GETting each Blob, and the worker
 *     (`scripts/nina-image-worker.ts`) can only import modules that import nothing.
 * `globalThis.crypto.subtle` is that one primitive: native in every browser, native in Node ≥19
 * (this repo's floor is 22), and reachable from a script that may not build an import graph. The
 * repo's other sha-256 (`lib/llm/factsHash.ts`) uses node:crypto and is therefore server-only —
 * fine for a cache key computed and consumed in one process, wrong for a value a browser must be
 * able to compute too.
 *
 * ── THE CONTRACT ─────────────────────────────────────────────────────────────────────────────
 * The input is the bytes EXACTLY AS STORED — for the upload path that is the compressed output,
 * not the picked file (`compressForNina` re-encodes; a different re-encode is different bytes,
 * which is "honestly two objects", not a dedup miss). The output is 64 lowercase hex.
 * `isValidContentHash` is the gate on the OTHER side: a hash a client CLAIMS goes through it
 * before it is stored, and a claim that fails is written as NULL — dedup silently inactive for
 * that row — never a send error (plan invariant 9).
 *
 * ── THE VIEW PITFALL, STATED WHERE THE BUG WOULD BE MADE ─────────────────────────────────────
 * `digest` respects a Uint8Array's `byteOffset`/`byteLength`, so a subarray view hashes exactly
 * the view's bytes. Never "simplify" an input by passing `view.buffer` instead: that hashes the
 * WHOLE underlying allocation, and a Node `Buffer` is pooled — you would hash a chunk of
 * unrelated heap and call it the file's identity. This module passes the view itself, always.
 *
 * Deliberately imports NOTHING: the script-host constraint above is a hard one, and a single
 * dependency would silently break `--experimental-strip-types`.
 */

/** One hash input. `Blob` covers the browser (`File` IS a Blob); the array forms cover server and script. */
export type ContentHashInput = Blob | ArrayBuffer | Uint8Array

/** sha-256 over these exact bytes, as 64 lowercase hex characters. Rejects only if the platform has no `crypto.subtle`. */
export async function contentHashOf(input: ContentHashInput): Promise<string> {
  const bytes = await toBytes(input)
  // Compile-time restatement of the contract, nothing else: these lib types demand an
  // ArrayBuffer-backed view for `BufferSource`, and this module never holds a SharedArrayBuffer
  // — `contentHashOf` receives application bytes, and the view-pitfall rule above keeps the
  // digest over exactly the view's bytes at runtime, assertion or not.
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes as BufferSource)
  return toHex(new Uint8Array(digest))
}

/**
 * The Blob check as a type predicate rather than a bare `instanceof`: this repo's TS + Node types
 * do not eliminate the `Blob` union member in a compound condition's false branch, and the
 * narrowing is all that lets `toBytes` return without a second assertion.
 */
function isBlob(input: ContentHashInput): input is Blob {
  return typeof Blob !== 'undefined' && input instanceof Blob
}

async function toBytes(input: ContentHashInput): Promise<ArrayBuffer | Uint8Array> {
  if (isBlob(input)) {
    return input.arrayBuffer()
  }
  return input
}

function toHex(bytes: Uint8Array): string {
  let hex = ''
  for (const byte of bytes) {
    hex += byte.toString(16).padStart(2, '0')
  }
  return hex
}

const CONTENT_HASH_RE = /^[0-9a-f]{64}$/

/**
 * The gate for a hash CLAIM — a value that arrived from a client and is about to reach
 * `nina_message_images.content_hash`. Lowercase only, on purpose: lowercase is the only spelling
 * `contentHashOf` produces, the column should hold one spelling, and the only client in this repo
 * is ours. A claim in another casing fails here and is stored as NULL — dedup goes inactive for
 * that row, which is the honest reading of "this claim is not one of ours" — rather than being
 * silently rewritten into shape.
 */
export function isValidContentHash(value: unknown): value is string {
  return typeof value === 'string' && CONTENT_HASH_RE.test(value)
}
