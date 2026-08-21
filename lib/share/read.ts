import 'server-only'
import { cache } from 'react'

import { getRunByShareToken } from '@/lib/db/queries'
import { isValidShareToken } from '@/lib/id'
import { toSharedRunView } from './project'
import type { SharedRunView } from './types'

/**
 * The public page's one read, memoised per request.
 *
 * ── WHY THE `cache()` LIVES HERE AND NOT ON `getRunByShareToken` ───────────────────────────────
 * F11's plan (contract delta 4) asks for the token read to be `cache()`-wrapped, because
 * `/s/[token]` calls it **twice per request** — once from `generateMetadata` to build the WhatsApp
 * card, once from the page body — and without request-level memoisation that is two round trips to
 * Neon on every pageview and on every link-preview scrape.
 *
 * The wrap belongs to F11 rather than to `lib/db/queries.ts` for two concrete reasons, not
 * tidiness:
 *
 *   1. `cache()` is a React request-scope primitive. `queries.ts` is imported by the cron handler,
 *      the background extraction job and the Vitest suite, none of which has a React request scope;
 *      keeping the raw async function exported there keeps it callable from all three.
 *   2. `scripts/check-data-layer-invariants.mjs` reads `queries.ts` and asserts that every
 *      `export async function` takes `userId` first, with `getRunByShareToken` as the single named
 *      exception. Turning that export into `export const … = cache(…)` would make the one query
 *      the guard exists to watch invisible to it.
 *
 * ── THE SHAPE CHECK BEFORE THE QUERY ──────────────────────────────────────────────────────────
 * A token that cannot be one of ours (wrong length, wrong alphabet) should 404 without a database
 * round trip. `/s/xxx` from a crawler costs nothing, and the answer is byte-identical to a real
 * token that was revoked — which is the anti-oracle property this route needs (§3.2).
 */
export const readSharedRun = cache(async (token: string): Promise<SharedRunView | null> => {
  if (!isValidShareToken(token)) return null

  // A revoked token and a token that never existed hit the identical
  // `WHERE token = $1 AND revoked_at IS NULL` predicate inside the query, produce the identical
  // zero rows, and resolve to the identical null here. No special-casing is needed to avoid
  // telling a stranger which of the two happened — it falls out of the query's shape.
  const run = await getRunByShareToken(token)
  return run === null ? null : toSharedRunView(run)
})
