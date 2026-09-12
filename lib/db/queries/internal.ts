import type { BatchItem } from 'drizzle-orm/batch'

import { db } from '../index'

/* ============================================================================
 * §2 Batch plumbing — shared by the domain modules that write more than one
 * statement (`runs`, `records`). Deliberately NOT re-exported through the
 * barrel: `runBatch` and `Statement` are plumbing for sibling modules, not part
 * of the query layer's public surface.
 * ==========================================================================*/

export type Statement = BatchItem<'pg'>

/**
 * `db.batch` is typed for a non-empty tuple, which a conditionally-built statement list is not.
 * This is the one place the cast lives, so no call site has to repeat it. An empty list is a
 * no-op rather than a runtime error, which keeps callers free of `if (statements.length)`.
 *
 * **Not a query** — it takes no `userId` and scopes nothing itself; it executes statements the
 * caller built. `scripts/check-data-layer-invariants.mjs` allowlists it on exactly that ground.
 */
export async function runBatch(statements: Statement[]): Promise<unknown[]> {
  if (statements.length === 0) return []
  return (await db.batch(statements as [Statement, ...Statement[]])) as unknown[]
}
