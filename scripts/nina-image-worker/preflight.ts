/**
 * Preflight: the checks that must pass before a single cent is spent — the three environment
 * variables, and the `information_schema` comparison that turns column drift between
 * `lib/db/schema.ts` and this worker's hand-written SQL into a red workflow on the very next
 * scheduled run rather than a silently unwritten photograph.
 *
 * Part of the `nina-image-worker/` split; the system-level doc — why this worker exists, why it is
 * `.ts`, what it cannot import, where it runs — lives in the barrel `../nina-image-worker.ts`. The
 * worker's import rules: `.ts`-suffixed relative imports only, no `@/` aliases, no `server-only`,
 * CJS packages through `createRequire`.
 */
import type { NeonSql } from './sql.ts'

const REQUIRED_ENV = ['DATABASE_URL', 'BLOB_READ_WRITE_TOKEN', 'OPENROUTER_API_KEY'] as const

/**
 * Every column this file names for a table, and whether this file INSERTs rows into it.
 *
 * `columns` is **the duplication `lib/db/schema.ts` costs us**, and checking it against
 * `information_schema` on every run is what makes the duplication safe: a rename surfaces as a red
 * workflow on the very next run instead of as a silently unwritten photograph.
 *
 * `inserts` is **FINDING 1'S CLASS, made structural.** Checking that every column we name EXISTS is
 * only half a check: it catches a rename and it is blind to an ADDITION. Migration 0004 added
 * `nina_messages.session_id text NOT NULL` after this worker was written; both INSERTs kept
 * compiling, kept passing preflight, and every generation crashed on the write that would have made
 * the photograph visible — after the money was spent. So for an INSERT target `findSchemaDrift`
 * also runs the CONVERSE: every `NOT NULL` column the database does not fill for us must appear in
 * `columns`. A table this file only reads or only UPDATEs is exempt, because a statement that never
 * supplies a column cannot omit one.
 */
interface WorkerTable {
  /** True when this file writes an `insert into <table>`. Only then is NOT NULL coverage checked. */
  readonly inserts: boolean
  /** Every column this file names for the table, in any statement. */
  readonly columns: readonly string[]
}

export const REQUIRED_COLUMNS: Record<string, WorkerTable> = {
  /* UPDATE and SELECT only — `claimJob` and the three terminal updates. Never inserted here: the
   * app opens every job (`openNinaImageJob`), and a worker that could open one would be a second
   * writer of a table whose whole point is that the app owns the ledger. */
  nina_turns: {
    inserts: false,
    columns: [
      'id',
      'user_id',
      'kind',
      'model',
      'status',
      'error_code',
      'tool_calls',
      'latency_ms',
      'cost_micro_usd',
      'args',
      'created_at',
    ],
  },
  /* SELECT only — `resolveWorkerSessionId`'s activity ordering. The worker deliberately cannot
   * CREATE a session: `ensureNinaSession` is the app's policy and a worker that minted one would
   * file a photograph into a conversation the runner has never seen. When no session exists the
   * worker declines to write the message instead. */
  nina_chat_sessions: {
    inserts: false,
    columns: ['id', 'user_id', 'created_at'],
  },
  nina_messages: {
    inserts: true,
    columns: [
      'id',
      'user_id',
      /* FINDING 1. `NOT NULL` since migration 0004, and omitted by both INSERTs until that phase.
       * It is listed here so the existence check covers it AND so the NOT NULL coverage check
       * passes — the two halves have to agree or the worker will not start. */
      'session_id',
      'role',
      'text',
      'source',
      'turn_id',
      'reply_to_id',
      'sent_at',
    ],
  },
  nina_message_images: {
    inserts: true,
    columns: [
      'id',
      'user_id',
      'message_id',
      'kind',
      'blob_url',
      'pathname',
      'width',
      'height',
      'bytes',
      'description',
      'prompt',
      /* media-dedupe P1/P3. P1 named content_hash for the INSERT; P3's `findContentDuplicate`
       * SELECT names it PLUS the two provenance columns (its originals-only WHERE) and
       * `created_at` (its ORDER BY). All four are listed for the existence check; all four are
       * nullable or defaulted, so the NOT NULL coverage check demands none of them. */
      'content_hash',
      'source_avatar_id',
      'source_image_id',
      'created_at',
      'sort_order',
    ],
  },
  nina_avatars: {
    inserts: true,
    columns: [
      'id',
      'user_id',
      'blob_url',
      'pathname',
      'width',
      'height',
      'bytes',
      'source',
      'description',
      /* media-dedupe P3: named by `releaseBlobIfUnreferenced`'s six-column reference check — the
       * same six columns `isBlobPathnameReferenced` asks, so the worker cannot release an object
       * the app would have kept (an album thumbnail sharing bytes is the case that makes the
       * `thumb_*` columns more than symmetry). */
      'thumb_pathname',
      'thumb_url',
      'is_current',
      'announced_at',
    ],
  },
}

/**
 * One `information_schema.columns` row, as much of it as `findSchemaDrift` reads. Written by hand
 * for the same reason `NeonSql` is: the catalogue's own types are not reachable here.
 */
export interface SchemaColumn {
  table_name: string
  column_name: string
  /** `'YES'` or `'NO'`. */
  is_nullable: string
  /** The `DEFAULT` expression, or null when the column has none. */
  column_default: string | null
  /** `'YES'` or `'NO'`. */
  is_identity: string | null
  /** `'ALWAYS'` or `'NEVER'`. */
  is_generated: string | null
}

/**
 * **The whole preflight decision, as a pure function over what the catalogue said.**
 *
 * Split out of `preflight` so `tests/nina.imageworker.test.ts` can drive Finding 1's exact shape —
 * a `NOT NULL` column with no default that this worker never writes — with no database, no key and
 * no network. A check that only runs against production is a check that first fails in production,
 * which is precisely how Finding 1 shipped.
 *
 * Two rules, and the second is the new one:
 *   1. every column this file NAMES must exist (a rename takes the workflow red);
 *   2. on a table this file INSERTS into, every column the database will NOT fill for us must be
 *      named (an addition takes the workflow red).
 *
 * "The database will fill it for us" means one of: a `DEFAULT` expression (`sent_at`, `source`,
 * `sort_order`, `created_at`, `is_current`, `folder`), an identity column, or a generated column.
 * `nina_messages.seq` is a `bigserial`, so its `column_default` is a `nextval(...)` and it is
 * correctly exempt — the check must not demand that the worker write the conversation's sequence.
 *
 * Returns the drift as sentences. Empty means this file and the schema agree.
 */
export function findSchemaDrift(
  rows: readonly SchemaColumn[],
  tables: Record<string, WorkerTable> = REQUIRED_COLUMNS,
): string[] {
  const have = new Map<string, Map<string, SchemaColumn>>()
  for (const row of rows) {
    const columns = have.get(row.table_name) ?? new Map<string, SchemaColumn>()
    columns.set(row.column_name, row)
    have.set(row.table_name, columns)
  }

  const drift: string[] = []
  for (const [table, spec] of Object.entries(tables)) {
    const columns = have.get(table)
    if (columns == null) {
      drift.push(`${table} (whole table) is missing`)
      continue
    }

    for (const column of spec.columns) {
      if (!columns.has(column)) drift.push(`${table}.${column} is missing`)
    }

    if (!spec.inserts) continue

    const named = new Set(spec.columns)
    for (const [column, meta] of columns) {
      if (named.has(column)) continue
      if (meta.is_nullable !== 'NO') continue
      if (meta.column_default != null) continue
      if (meta.is_identity === 'YES') continue
      if (meta.is_generated === 'ALWAYS') continue
      drift.push(`${table}.${column} is NOT NULL with no default and this worker never writes it`)
    }
  }
  return drift
}

export async function preflight(sql: NeonSql): Promise<void> {
  const missingEnv = REQUIRED_ENV.filter((key) => {
    const value = process.env[key]
    return value == null || value.length === 0
  })
  if (missingEnv.length > 0) {
    throw new Error(
      `missing ${missingEnv.join(', ')} — set them as repository secrets, or run with --env-file=.env.local`,
    )
  }

  const tables = Object.keys(REQUIRED_COLUMNS)
  const rows = (await sql`
    select table_name, column_name, is_nullable, column_default, is_identity, is_generated
    from information_schema.columns
    where table_schema = 'public' and table_name = any(${tables})
  `) as SchemaColumn[]

  const drift = findSchemaDrift(rows)
  if (drift.length > 0) {
    /*
     * The most likely cause, in order: a migration has not been applied to this database; a column
     * was renamed; a column was ADDED as NOT NULL and this file was not updated with it (Finding 1);
     * the connection points at the wrong database entirely. All four are a code or configuration
     * change rather than a retry, so this throws and takes the workflow red rather than failing a
     * job quietly.
     */
    throw new Error(`schema drift — ${drift.join('; ')}`)
  }
}
