import { neon } from '@neondatabase/serverless'
import { drizzle, type NeonHttpDatabase } from 'drizzle-orm/neon-http'

import * as schema from './schema'

/**
 * The single Drizzle instance. Two deliberate choices:
 *
 * **`neon-http`, so every write is a `db.batch`.** `db.transaction()` throws on this driver
 * ("No transactions support in neon-http driver"). `db.batch([...])` sends the whole array as one
 * HTTP request that Postgres runs inside one transaction, which is both the atomicity every
 * multi-statement write in queries.ts needs and one round trip instead of N.
 *
 * **`process.env.DATABASE_URL` read directly, not through `lib/env.ts`.** `lib/env.ts` opens with
 * `import 'server-only'`, which throws outside a React Server Components graph — routing the DB
 * client through it would take every unit test down with it, and would make this module
 * unimportable from the non-Next callers (`drizzle-kit`, `scripts/*.mjs`) that `lib/env.ts`
 * cannot serve either. `lib/env.ts` still validates the same variable at boot for the app.
 *
 * The URL must be the POOLED one (`-pooler` in the host). `DATABASE_URL_UNPOOLED` is for
 * `drizzle-kit` only and is read by `drizzle.config.ts`, never here.
 */
export type Database = NeonHttpDatabase<typeof schema>

function createDb(): Database {
  const url = process.env.DATABASE_URL
  if (!url) {
    throw new Error(
      'DATABASE_URL is not set. Add the POOLED Neon connection string to .env.local ' +
        '(and to the Vercel project env). See ROADMAP_v0.1.0.md §4.1.',
    )
  }
  // neon() performs no I/O at construction, so this is safe to run eagerly: a missing URL is a
  // loud boot crash instead of a silent `undefined` that fails on the first query in production.
  return drizzle(neon(url), { schema, logger: process.env.DRIZZLE_LOG === '1' })
}

/**
 * Cached on globalThis so Next's dev-mode module reloading does not accumulate clients, and so
 * tests can install a recording fake by seeding this key before the first import.
 */
const globalForDb = globalThis as unknown as { __runInsightsDb?: Database }

export const db: Database = (globalForDb.__runInsightsDb ??= createDb())

export { schema }
export * from './schema'
