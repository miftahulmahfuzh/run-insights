import { drizzle } from 'drizzle-orm/neon-http'
import { getTableConfig, type PgTable } from 'drizzle-orm/pg-core'

import * as schema from '@/lib/db/schema'

/**
 * A recording stand-in for the Neon HTTP client.
 *
 * `drizzle-orm/neon-http` talks to its client through exactly two entry points — `client(sql,
 * params, opts)` for a single statement and `client.transaction(queries, opts)` for a `db.batch`
 * — so a function with a `transaction` property is a complete driver. That makes these tests
 * assert the REAL generated SQL (real dialect, real parameter binding, real batching) with no
 * network and no database, which is the only way a test can catch a missing
 * `reviewed_at is not null` or a lost ownership predicate.
 *
 * It is installed by seeding `globalThis.__runInsightsDb` before `lib/db/index.ts` is first
 * imported — the same cache that exists so Next's dev reloads do not pile up clients. Call
 * `installFakeDb()` and then `await import('@/lib/db/queries')` inside the test.
 */

export interface RecordedQuery {
  sql: string
  params: unknown[]
  /** True when this statement was one member of a db.batch. */
  batched: boolean
}

export interface FakeDb {
  /** Every statement in execution order. */
  queries: RecordedQuery[]
  /** One entry per db.batch call, holding the number of statements in it. */
  batches: number[]
  /** Queue a result for the next statement. Rows must be arrays for mapped selects. */
  enqueue(...results: unknown[][]): void
  reset(): void
  /** The single statement, asserting there was exactly one. */
  only(): RecordedQuery
  last(): RecordedQuery
  sqlAt(index: number): string
}

type QueryResult = {
  command: string
  fields: unknown[]
  rowCount: number
  rows: unknown[]
  rowAsArray: boolean
}

const CACHE_KEY = '__runInsightsDb'

function makeFake(): { client: unknown; fake: FakeDb } {
  const queries: RecordedQuery[] = []
  const batches: number[] = []
  const pending: unknown[][] = []
  let batchDepth = 0

  const respond = (rows: unknown[], arrayMode: boolean): QueryResult => ({
    command: 'SELECT',
    fields: [],
    rowCount: rows.length,
    rows,
    rowAsArray: arrayMode,
  })

  const client = (async (
    sqlText: string,
    params: unknown[] = [],
    opts: { arrayMode?: boolean } = {},
  ) => {
    queries.push({ sql: sqlText, params, batched: batchDepth > 0 })
    const rows = pending.shift() ?? []
    return respond(rows, opts.arrayMode ?? false)
  }) as ((sql: string, params?: unknown[], opts?: unknown) => Promise<QueryResult>) & {
    transaction: (items: Promise<QueryResult>[]) => Promise<QueryResult[]>
  }

  // drizzle builds the member promises FIRST (calling client() for each) and then hands the array
  // to transaction(), so the batch marker has to be set before the members run. It is set for the
  // synchronous window in which drizzle constructs them, which is exactly when they are recorded.
  client.transaction = async (items) => {
    batches.push(items.length)
    return Promise.all(items)
  }

  const fake: FakeDb = {
    queries,
    batches,
    enqueue: (...results) => pending.push(...results),
    reset: () => {
      queries.length = 0
      batches.length = 0
      pending.length = 0
    },
    only: () => {
      if (queries.length !== 1) {
        throw new Error(`expected exactly 1 query, got ${queries.length}:\n${dumpSql(queries)}`)
      }
      return queries[0]!
    },
    last: () => {
      const query = queries.at(-1)
      if (!query) throw new Error('no queries recorded')
      return query
    },
    sqlAt: (index) => {
      const query = queries[index]
      if (!query) throw new Error(`no query at index ${index} (have ${queries.length})`)
      return query.sql
    },
  }

  // Wrap so that statements built inside a batch are flagged. drizzle's batch() calls the client
  // synchronously per member before awaiting, so a depth counter around transaction is not
  // enough; instead we flag from the batch side by patching after the fact.
  const originalTransaction = client.transaction
  client.transaction = async (items) => {
    const before = queries.length - items.length
    for (let i = Math.max(0, before); i < queries.length; i++) {
      const query = queries[i]
      if (query) query.batched = true
    }
    batchDepth++
    try {
      return await originalTransaction(items)
    } finally {
      batchDepth--
    }
  }

  return { client, fake }
}

function dumpSql(queries: RecordedQuery[]): string {
  return queries.map((q, i) => `  [${i}] ${q.sql}`).join('\n')
}

/**
 * Installs a fresh fake and clears the module registry so the next `import('@/lib/db/queries')`
 * picks it up. Returns the recorder.
 */
export function installFakeDb(): FakeDb {
  const { client, fake } = makeFake()
  const holder = globalThis as unknown as Record<string, unknown>
  holder[CACHE_KEY] = drizzle(client as never, { schema })
  return fake
}

export function uninstallFakeDb(): void {
  const holder = globalThis as unknown as Record<string, unknown>
  delete holder[CACHE_KEY]
}

/**
 * A driver-shaped row for `db.select().from(table)`, in the table's column order — which is the
 * order drizzle maps a full-table select in. Overrides are keyed by TS property name.
 */
export function tableRow(table: PgTable, overrides: Record<string, unknown> = {}): unknown[] {
  const config = getTableConfig(table)
  return config.columns.map((column) => {
    const key = columnPropertyName(table, column.name)
    if (key !== undefined && key in overrides) return overrides[key]
    if (column.name in overrides) return overrides[column.name]
    return defaultForColumn(column.getSQLType())
  })
}

function columnPropertyName(table: PgTable, sqlName: string): string | undefined {
  for (const [property, column] of Object.entries(table as unknown as Record<string, unknown>)) {
    const candidate = column as { name?: string }
    if (candidate && typeof candidate === 'object' && candidate.name === sqlName) return property
  }
  return undefined
}

function defaultForColumn(sqlType: string): unknown {
  if (sqlType === 'integer') return 0
  if (sqlType.startsWith('numeric')) return '0'
  if (sqlType === 'boolean') return false
  if (sqlType === 'date') return '2026-08-20'
  if (sqlType === 'time') return '05:12:00'
  if (sqlType.startsWith('timestamp')) return '2026-08-20 05:12:00+00'
  if (sqlType === 'jsonb') return null
  return null
}

/** Rows for a `db.select({ a, b })` projection: values in the order the keys were written. */
export function projectedRow(...values: unknown[]): unknown[] {
  return values
}
