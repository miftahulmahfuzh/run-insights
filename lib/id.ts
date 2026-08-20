/**
 * Id generation for every `text` primary key in the schema, with no dependency.
 *
 * The alphabet is 64 URL-safe symbols, so `byte & 63` is a perfectly uniform mapping
 * (256 / 64 = 4 whole buckets per symbol): no rejection sampling, zero modulo bias. This is the
 * same property nanoid relies on; reimplementing it here keeps `lib/id.ts` importable from
 * Vitest, from `research/*.mjs` and from a Route Handler alike, with nothing to resolve.
 *
 * Roadmap §4.3: entity PKs are nanoid(12); `shares.token` is nanoid(16).
 */
const ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-_'

/** Entity primary keys: runs, extractions, run_photos, insights. */
export const ID_LENGTH = 12
/** shares.token — the credential itself, so it is deliberately longer. 16 × log2(64) = 96 bits. */
export const SHARE_TOKEN_LENGTH = 16

export function newId(size: number = ID_LENGTH): string {
  const bytes = new Uint8Array(size)
  crypto.getRandomValues(bytes)
  let out = ''
  for (let i = 0; i < size; i++) out += ALPHABET[bytes[i]! & 63]
  return out
}

export const newRunId = (): string => newId()
export const newExtractionId = (): string => newId()
export const newPhotoId = (): string => newId()
export const newInsightId = (): string => newId()

/**
 * 96 bits of entropy in a 16-symbol token. Roadmap D9's "unguessable" is quantified here: at one
 * guess per millisecond it is ~10^21 years to a 50% chance of hitting any single live token.
 */
export const newShareToken = (): string => newId(SHARE_TOKEN_LENGTH)

const ID_RE = /^[0-9A-Za-z_-]{12}$/
const SHARE_TOKEN_RE = /^[0-9A-Za-z_-]{16}$/

/**
 * Cheap shape check for a route segment before it ever reaches the database. A `/r/[id]` whose
 * id cannot be one of ours should 404 without a query, not with one.
 */
export function isValidId(value: unknown): value is string {
  return typeof value === 'string' && ID_RE.test(value)
}

export function isValidShareToken(value: unknown): value is string {
  return typeof value === 'string' && SHARE_TOKEN_RE.test(value)
}
