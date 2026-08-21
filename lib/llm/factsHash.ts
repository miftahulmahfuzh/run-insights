import { createHash } from 'node:crypto'

/**
 * The cache key. `insights` is unique on `(user_id, scope, scope_key, facts_hash)`, so this
 * function alone decides whether opening `/trends` costs ten seconds and a model call or one
 * indexed read.
 *
 * ── WHAT MUST BE TRUE OF IT ───────────────────────────────────────────────────────────────────
 *  1. **Same numbers → same hash**, regardless of the order the builder happened to assign keys
 *     in. Otherwise a refactor that moves one field in an object literal silently invalidates
 *     every cached insight in the database.
 *  2. **Different numbers → different hash.** A corrected split, a newly observed HRmax, an
 *     answered intent question — each has to miss.
 *  3. **A prompt edit must miss too**, which is not a property of the numbers at all. See
 *     `promptVersion` in `lib/llm/prompts/narrate.ts`: the builders fold it into the facts object
 *     precisely so this function can see it.
 */

/**
 * Recursively sorts object keys so `JSON.stringify` is independent of insertion order. The
 * roadmap's D5 integer discipline keeps every NUMBER exact; this is the same discipline applied
 * to serialisation shape.
 *
 * **Arrays are NOT reordered.** Splits are ordered by km, the weekly series by date, and
 * `flagsPersisting` by the order the codes fired — that order is itself meaningful, and sorting
 * it would make two genuinely different fact sets collide. Reordering `splits` therefore changes
 * the hash, which is correct and is pinned by `tests/llm.factsHash.test.ts`.
 */
function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize)
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([k, v]) => [k, canonicalize(v)]),
    )
  }
  return value
}

/**
 * `localeCompare` is deliberately NOT used to sort the keys: it is locale-sensitive, and a hash
 * that depends on the server's ICU collation is a hash that changes when the runtime does. Plain
 * code-point ordering is stable everywhere, forever, which is the only property that matters for
 * a cache key.
 */
export function factsHash(facts: unknown): string {
  return createHash('sha256')
    .update(JSON.stringify(canonicalize(facts)))
    .digest('hex')
}

export { canonicalize as canonicalizeForHash }
