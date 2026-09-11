/**
 * **Nina's camera, off-platform.** RU-19 and RU-20: the shipping generation is 78.2 s measured and
 * Vercel Hobby caps a function at 60 s in `sin1`, so the call cannot happen in the app at all. This
 * script is the generator, and GitHub Actions is the host.
 *
 *   node --experimental-strip-types --no-warnings scripts/nina-image-worker.ts --job <jobId>
 *   node --experimental-strip-types --no-warnings scripts/nina-image-worker.ts
 *   node --experimental-strip-types --no-warnings --env-file=.env.local scripts/nina-image-worker.ts --dry-run
 *
 *   npm run nina:worker            # the sweep, against whatever .env.local points at
 *   npm run nina:worker:dry        # preflight only: no OpenRouter call, no writes
 *
 * With `--job` it does that one job — the `workflow_dispatch` path, and the normal one. With no
 * `--job` it drains up to `NINA_IMAGE_SWEEP_BUDGET` actionable jobs — the `schedule:` backstop path,
 * which exists because a dispatch can be lost and because Vercel Hobby caps crons at two and phase
 * 10 spent the second on `/api/cron/nina`. That backstop is the single best property of RU-20's
 * choice: it is the third cron the platform would not give us.
 *
 * NOT A TEST, and never part of `npm test`: it reads the real database, spends real money and writes
 * real bytes. The same line `scripts/blob-reap.mjs` and `scripts/backfill-record-keys.mjs` draw. It
 * is nonetheless IMPORTABLE by a test — `main()` runs only when this file is the process entry point
 * — so `tests/nina.imageworker.test.ts` can drive `parseArgv` and `generate` with no network.
 *
 * ── WHY IT IS `.ts`, AND WHAT THAT COSTS ──────────────────────────────────────────────────────
 * `package.json`'s `records:backfill` already runs
 * `node --experimental-strip-types --no-warnings scripts/backfill-record-keys.mjs`, and that script
 * imports `../lib/records/catalog.ts` directly (its line 85). Its header states the rule it obeys: a
 * `lib/` module can be imported from `scripts/` when stripping its types leaves no runtime
 * dependency and no `@/` alias to resolve. This worker obeys the same rule and imports three such
 * modules — `../lib/nina/imagefail.ts`, `../lib/nina/imagerecipe.ts` and `../lib/id.ts` (whose own
 * header says it exists to be importable "from Vitest, from `research/*.mjs` and from a Route
 * Handler alike, with nothing to resolve"). **That is why R22's copy, the payload shape, the
 * pathname convention, the cap and every threshold are not duplicated here.**
 *
 * The extension is `.ts` rather than `.mjs` because this file is itself annotated and a test imports
 * its exports. The one cost, measured rather than assumed: `tsconfig.json` includes `**\/*.ts`, so
 * `tsc --noEmit` typechecks this file, and a `.ts` import specifier is `error TS5097` unless
 * `allowImportingTsExtensions` is on. That flag is therefore set — it requires `noEmit`, which this
 * project already has, and it changes nothing else. `backfill-record-keys.mjs` escaped the same
 * error only by being invisible to `tsc`.
 *
 * ── WHAT IT CANNOT IMPORT, AND WHAT THAT COSTS ────────────────────────────────────────────────
 * `lib/nina/queries.ts` and `lib/db/*` import `server-only` and use `@/` aliases, so the worker
 * writes its own SQL through `@neondatabase/serverless` — exactly as `scripts/blob-reap.mjs`,
 * `scripts/db-smoke.mjs` and both backfill scripts do. `lib/env.ts` is unreachable for the same
 * reason, so the worker reads `process.env` directly and validates by hand in `preflight`. The cost
 * is that column names are written twice, in `lib/db/schema.ts` and here; the mitigation is the
 * `information_schema` preflight below, which turns a drift into a loud failure on the very next
 * scheduled run rather than a silent one at 3am. That trade is the plan's Risk 1.
 *
 * ── WHY IT MAY RUN ON A LAPTOP TOO ────────────────────────────────────────────────────────────
 * `npm run nina:worker` against `.env.local` is a fully supported manual runner: it is how a stuck
 * job gets drained during development and how the setup checklist is verified. It is NOT the
 * shipping mechanism — RU-21 forbids anything needing the user present — but it means the mechanism
 * is swappable. If GitHub ever becomes the wrong host, the replacement (a Fly machine, a Railway
 * worker, a cron on a box) runs this same file with the same three environment variables and
 * nothing else in the phase changes.
 */
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

import { newId } from '../lib/id.ts'
import { planNinaImageWrite, type NinaImageDedupHit } from '../lib/nina/imageDedupe.ts'
import { classifyImageFailure, ninaImageApology, ninaImageCaption } from '../lib/nina/imagefail.ts'
import { coerceNinaImageModel } from '../lib/nina/imageprefs.ts'
import type { NinaImageFailure } from '../lib/nina/imagefail.ts'
import {
  buildImageReferenceDataUrl,
  buildImageRequestBody,
  NINA_IMAGE_CACHE_MAX_AGE,
  NINA_IMAGE_CONTENT_TYPE,
  NINA_IMAGE_COST_MICRO_USD,
  NINA_IMAGE_DISPATCH_GRACE_MS,
  NINA_IMAGE_HEIGHT,
  NINA_IMAGE_MAX_ATTEMPTS,
  NINA_IMAGE_RECLAIM_MS,
  NINA_IMAGE_REFERENCE_FETCH_TIMEOUT_MS,
  NINA_IMAGE_REFERENCE_MAX_BYTES,
  NINA_IMAGE_SWEEP_BUDGET,
  NINA_IMAGE_WIDTH,
  NINA_WORKER_CALL_TIMEOUT_MS,
  ninaImagePathname,
  ninaImageReferenceUrl,
  OPENROUTER_IMAGE_URL,
  readReportedCostMicroUsd,
} from '../lib/nina/imagerecipe.ts'
import type { NinaImageJobArgs } from '../lib/nina/imagerecipe.ts'
import { contentHashOf } from '../lib/photos/contentHash.ts'

/* `@neondatabase/serverless` and `@vercel/blob` are CJS-friendly and are loaded the way every other
 * script in `scripts/` loads them (`scripts/blob-reap.mjs:34`), so this file needs no bundler and no
 * transform beyond stripping. */
const require = createRequire(import.meta.url)
const { neon } = require('@neondatabase/serverless') as {
  neon: (url: string) => NeonSql
}
const { put, del } = require('@vercel/blob') as {
  put: (
    pathname: string,
    body: Buffer,
    options: Record<string, unknown>,
  ) => Promise<{ url: string; pathname: string }>
  del: (url: string) => Promise<unknown>
}

/**
 * `@neondatabase/serverless`'s tagged-template client, as much of it as this file uses. Written by
 * hand rather than imported because the package's types are not reachable through a `require()`
 * under `--experimental-strip-types`.
 */
export interface NeonSql {
  (strings: TemplateStringsArray, ...values: unknown[]): Promise<unknown[]>
  transaction: (queries: unknown[]) => Promise<unknown[]>
}

export interface WorkerArgv {
  jobId: string | null
  dryRun: boolean
}

export function parseArgv(argv: readonly string[]): WorkerArgv {
  const jobFlag = argv.indexOf('--job')
  const raw = jobFlag === -1 ? null : (argv[jobFlag + 1] ?? null)
  /*
   * `workflow_dispatch` inputs arrive as strings and an unset one arrives as the empty string, so
   * "--job ''" must mean "sweep" and not "job id ''". The character class is the id alphabet from
   * `lib/id.ts`; anything else is a caller bug and is refused rather than turned into a query.
   */
  const jobId = raw != null && /^[0-9A-Za-z_-]{1,64}$/.test(raw) ? raw : null
  return { jobId, dryRun: argv.includes('--dry-run') }
}

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

/** The row `findContentDuplicate` answers with — the shape `imageDedupe.ts` states its `hit` in. */
export interface WorkerContentDuplicate {
  id: string
  blobUrl: string
  pathname: string
}

/**
 * The worker's own spelling of `findNinaImageByContentHash` (`lib/nina/queries.ts`), clause for
 * clause — it cannot be imported (`server-only`, `@/` aliases; this file's header), so the
 * POLICY is restated in SQL and the duplication is kept honest the way every duplication in this
 * file is: by naming the columns in `REQUIRED_COLUMNS`, where a drift takes the workflow red.
 *
 *   · owner-scoped — `user_id` in the WHERE, invariant 5;
 *   · ORIGINALS ONLY — both provenance columns `IS NULL`. A reference must never satisfy a dedup
 *     lookup, or two references could chain onto each other and the keeper's deletion would
 *     re-materialize BOTH as originals;
 *   · newest first — `created_at desc` with `id desc` as the tie-break, the same tie-break the
 *     collection reads use, so a re-run after a crash names the same keeper.
 *
 * Phase 1's partial index (`nina_message_images_user_content_hash_idx`) makes this a lookup, not
 * a scan.
 */
export async function findContentDuplicate(
  sql: NeonSql,
  userId: string,
  contentHash: string,
): Promise<WorkerContentDuplicate | null> {
  const rows = (await sql`
    select id, blob_url, pathname
    from nina_message_images
    where user_id = ${userId}
      and content_hash = ${contentHash}
      and source_avatar_id is null
      and source_image_id is null
    order by created_at desc, id desc
    limit 1
  `) as Array<{ id: string; blob_url: string; pathname: string }>

  const row = rows[0]
  return row == null ? null : { id: row.id, blobUrl: row.blob_url, pathname: row.pathname }
}

export interface ClaimedJob {
  jobId: string
  userId: string
  args: NinaImageJobArgs
  attempts: number
}

/**
 * **The instant a `dispatched` row becomes claimable. FINDING 2, in one function.**
 *
 * `fireNinaImageDispatch` stamps `error_code = 'dispatched'` BEFORE it POSTs to GitHub — deliberately,
 * so two concurrent dispatch attempts cannot both call the API — and a GitHub runner takes ~25-40 s
 * to reach the `Generate` step. Measured: job `ke20AUHNE0TB` was created at `03:02:31.897Z` and the
 * worker ran at `03:03:00.4Z`, 28.5 seconds old. With a single cutoff of `now - GRACE` the row is
 * `dispatched` and younger than 60 s, so the `WHERE` excluded it, and every one of the five
 * `workflow_dispatch` runs on 2026-09-06 logged `finished { attempted: 0 }`. **The doorbell rang a
 * runner that was structurally forbidden from opening the door.**
 *
 * The grace exists to stop a SWEEP stealing a job a runner is about to start. A job named by `--job`
 * was named by the doorbell, so the name and the runner ARE the same event and there is nothing to
 * protect it from. So:
 *
 *   · sweep      (`jobId == null`) -> `now - GRACE`. A fresh dispatch is left alone.
 *   · named job  (`jobId != null`) -> `now + GRACE`. Claimable however young it is.
 *
 * The named cutoff runs the window FORWARD rather than simply using `now`, and that is not
 * decoration: `created_at` is stamped by Vercel and `now` is read on a GitHub runner, so a minute of
 * clock skew between the two must not be able to reintroduce the bug. It reuses the same constant so
 * there is no second number to keep in step.
 *
 * **What this does NOT relax.** The `running` reclaim cutoff still applies to a named job, so a
 * dispatch can never steal a job another runner is mid-generation on and bill the same picture
 * twice. Neither does it relax `attempts < NINA_IMAGE_MAX_ATTEMPTS` — see `claimJob`'s note, where
 * that bound is the only thing preventing an infinite reclaim loop.
 */
export function dispatchCutoffFor(jobId: string | null, now: Date): Date {
  return jobId == null
    ? new Date(now.getTime() - NINA_IMAGE_DISPATCH_GRACE_MS)
    : new Date(now.getTime() + NINA_IMAGE_DISPATCH_GRACE_MS)
}

/**
 * **The only lock in the system.** One conditional UPDATE, and exactly one caller gets a row back.
 *
 * With a job id it claims that job. Without one it claims the oldest ACTIONABLE job, which is:
 *   · `queued`     — the doorbell never rang, or rang and the bookkeeping died;
 *   · `dispatched` past `dispatchCutoffFor` — for a sweep that means older than
 *     `NINA_IMAGE_DISPATCH_GRACE_MS`, i.e. GitHub accepted it and no runner ever picked it up; for a
 *     NAMED job it means unconditionally, because the runner asking IS the dispatch (Finding 2);
 *   · `running` older than `NINA_IMAGE_RECLAIM_MS` — the runner that owned it was killed by
 *     `timeout-minutes`, which is longer than the ceiling so it cannot still be alive. **This one is
 *     not relaxed for a named job**: a live generation must never be claimed twice.
 *
 * `attempts` is incremented in the same statement, so the retry budget cannot be spent twice by two
 * runners. A job at the budget is not claimed at all; the app-side sweep closes it instead.
 *
 * **One note on `created_at` in the WHERE clause.** It is the job's OPEN time, not its claim time,
 * because `nina_turns` has no claim timestamp and no phase has added one. For a first attempt the
 * two are within a minute of each other, so it is a fine proxy. For a SECOND attempt the timestamp
 * is already old, which would make a reclaimed job immediately eligible again — and the only thing
 * stopping an infinite reclaim loop is `attempts < NINA_IMAGE_MAX_ATTEMPTS` in the same clause.
 * **That bound is therefore load-bearing, not a nicety.** If a future phase adds a `claimed_at`
 * column, the cutoff should move to it and the bound should stay.
 */
export async function claimJob(
  sql: NeonSql,
  jobId: string | null,
  now: Date = new Date(),
): Promise<ClaimedJob | null> {
  const dispatchCutoff = dispatchCutoffFor(jobId, now)
  const runningCutoff = new Date(now.getTime() - NINA_IMAGE_RECLAIM_MS)

  const rows = (await sql`
    update nina_turns set
      error_code = 'running',
      args = jsonb_set(args, '{attempts}', to_jsonb((coalesce((args->>'attempts')::int, 0) + 1)))
    where id = (
      select id from nina_turns
      where kind = 'image'
        and status = 'pending'
        and args is not null
        and coalesce((args->>'attempts')::int, 0) < ${NINA_IMAGE_MAX_ATTEMPTS}
        and (${jobId}::text is null or id = ${jobId}::text)
        and (
          error_code = 'queued'
          or (error_code = 'dispatched' and created_at < ${dispatchCutoff.toISOString()})
          or (error_code = 'running' and created_at < ${runningCutoff.toISOString()})
        )
      order by created_at asc
      limit 1
      for update skip locked
    )
    returning id, user_id, args
  `) as Array<{ id: string; user_id: string; args: NinaImageJobArgs }>

  const row = rows[0]
  if (row == null) return null
  return {
    jobId: row.id,
    userId: row.user_id,
    args: row.args,
    attempts: Number(row.args.attempts ?? 0),
  }
}

export type WorkerOutcome =
  | { ok: true; b64: string; costMicroUsd: number; latencyMs: number }
  | { ok: false; kind: NinaImageFailure; latencyMs: number; detail: string }

/**
 * **The anchor, off Blob, on the runner.** A near-copy of `fetchNinaImageReference` in
 * `lib/nina/imagecall.ts`, and the duplication is stated rather than hidden — the same trade this
 * file's header makes about column names, and for the same reason: `imagecall.ts` opens with
 * `import 'server-only'` and reaches `@/lib/env`, neither of which survives
 * `--experimental-strip-types`.
 *
 * **What is NOT duplicated is everything that could disagree**: the byte bound, the fetch deadline,
 * the allow-list and the `data:` URL construction all come from `imagerecipe.ts`, which both hosts
 * import. What is duplicated is fifteen lines of `fetch` plumbing.
 *
 * A plain `fetch` of the public Blob URL, not `@vercel/blob`: this file can only reach that package
 * through `createRequire` (see `put`, above) and its reader half has no `require()`-able shape here.
 * A public Blob object is an HTTPS GET on both hosts, so the app side uses the same `fetch` — one
 * mechanism, two copies, rather than two mechanisms.
 */
export async function fetchReference(url: string): Promise<string | null> {
  const startedAt = Date.now()
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(NINA_IMAGE_REFERENCE_FETCH_TIMEOUT_MS),
      cache: 'no-store',
    })

    if (!res.ok) {
      console.warn('[nina-worker] image reference dropped — blob fetch failed', {
        url,
        status: res.status,
      })
      return null
    }

    const declared = res.headers.get('content-length')
    const declaredBytes = declared == null ? null : Number.parseInt(declared, 10)
    if (
      declaredBytes != null &&
      Number.isFinite(declaredBytes) &&
      declaredBytes > NINA_IMAGE_REFERENCE_MAX_BYTES
    ) {
      console.warn('[nina-worker] image reference dropped — declared too large', {
        url,
        declaredBytes,
        maxBytes: NINA_IMAGE_REFERENCE_MAX_BYTES,
      })
      return null
    }

    const bytes = Buffer.from(await res.arrayBuffer())
    if (bytes.byteLength === 0 || bytes.byteLength > NINA_IMAGE_REFERENCE_MAX_BYTES) {
      console.warn('[nina-worker] image reference dropped — bad size', {
        url,
        bytes: bytes.byteLength,
        maxBytes: NINA_IMAGE_REFERENCE_MAX_BYTES,
      })
      return null
    }

    const served = res.headers.get('content-type') ?? ''
    const dataUrl = buildImageReferenceDataUrl(served, bytes.toString('base64'))
    if (dataUrl == null) {
      console.warn('[nina-worker] image reference dropped — content type not vouched for', {
        url,
        served,
      })
      return null
    }

    console.info('[nina-worker] image reference attached', {
      bytes: bytes.byteLength,
      contentType: served,
      fetchMs: Date.now() - startedAt,
    })
    return dataUrl
  } catch (cause) {
    console.warn('[nina-worker] image reference dropped — fetch threw', {
      url,
      cause: String(cause),
    })
    return null
  }
}

/**
 * One OpenRouter call. **It never throws** — every failure comes back as a `NinaImageFailure`,
 * because the caller's whole job is to turn that into one of her sentences, and a `catch` that has
 * to re-derive which of four things happened is a `catch` that will get it wrong.
 *
 * The classification is `classifyImageFailure` from `lib/nina/imagefail.ts` — **the same function
 * the app uses, imported, not paraphrased.** That is the whole reason `imagefail.ts` is forbidden
 * from having imports.
 *
 * ── ONE TIMEOUT HERE, TWO ON VERCEL, AND THAT ASYMMETRY IS DELIBERATE ─────────────────────────
 * `NINA_WORKER_CALL_TIMEOUT_MS` (290 s) covers BOTH the anchored and the unanchored call on this
 * host: 3.7x the measured 78.2 s unanchored, and strictly above the 240 s at which this host's
 * own anchored attempt died on 2026-09-10 — the drift that moved the in-platform ceilings the
 * same day. The app needs a second, larger constant because it is racing a 300 s invocation
 * ceiling; this host is racing `timeout-minutes: 6` (360 s), and 290 s is the largest call
 * timeout that keeps the whole derived chain honest without touching it: 360 s must stay above
 * call + 60 s of setup (290 + 60 = 350), and `NINA_IMAGE_RECLAIM_MS` (420 s, chosen to exceed
 * BOTH host ceilings) must stay above the workflow ceiling. The residual is still accepted and
 * named: an anchored generation slower than 290 s fails here as `timeout` — and one
 * `reviveNinaImageJobs` retries.
 *
 * The reference is fetched before the POST and inside the same 290 s wall, which is bounded by
 * `NINA_IMAGE_REFERENCE_FETCH_TIMEOUT_MS` (10 s) and degrades to unanchored on any failure.
 */
export async function generate(
  prompt: string,
  seed: number,
  /** The job's `args.referenceUrl`, already normalised by `ninaImageReferenceUrl`. */
  referenceUrl: string | null = null,
  /**
   * The job's chosen camera (the 2026-09-10 dropdown), already normalised by
   * `coerceNinaImageModel`. Optional and defaulted: the payload builder owns the fallback to
   * `NINA_IMAGE_MODEL`, so a caller that never heard of the dropdown builds the body it always
   * built — which is also what every pre-dropdown job (no `args.model` key at all) does.
   */
  model?: string,
): Promise<WorkerOutcome> {
  const startedAt = Date.now()
  const apiKey = process.env.OPENROUTER_API_KEY as string

  const referenceDataUrl =
    referenceUrl == null || referenceUrl.length === 0 ? null : await fetchReference(referenceUrl)

  let res: Response
  try {
    res = await fetch(OPENROUTER_IMAGE_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(buildImageRequestBody({ prompt, seed, referenceDataUrl, model })),
      /* What is left of the 290 s after the reference fetch, floored so a slow fetch cannot hand
       * `AbortSignal.timeout` a zero. */
      signal: AbortSignal.timeout(
        Math.max(1_000, NINA_WORKER_CALL_TIMEOUT_MS - (Date.now() - startedAt)),
      ),
      cache: 'no-store',
    })
  } catch (cause) {
    return {
      ok: false,
      kind: classifyImageFailure({ cause }),
      latencyMs: Date.now() - startedAt,
      detail: String(cause),
    }
  }

  const raw = await res.text()
  if (!res.ok) {
    return {
      ok: false,
      kind: classifyImageFailure({ httpStatus: res.status, body: raw }),
      latencyMs: Date.now() - startedAt,
      detail: `HTTP ${res.status} ${raw.slice(0, 500)}`,
    }
  }

  let b64: string | null = null
  let reportedCost: number | null = null
  try {
    const parsed = JSON.parse(raw) as { data?: Array<{ b64_json?: string }>; usage?: unknown }
    b64 = parsed.data?.[0]?.b64_json ?? null
    reportedCost = readReportedCostMicroUsd(parsed.usage)
  } catch {
    b64 = null
  }

  if (b64 == null || b64.length === 0) {
    /*
     * A 200 with no image. `classifyImageFailure` decides whether the body reads as a refusal
     * (`policy`) or as something else entirely (`transport`) — the distinction that matters to the
     * runner is a picture the model would not draw versus a picture that got lost.
     */
    return {
      ok: false,
      kind: classifyImageFailure({ httpStatus: 200, body: raw }),
      latencyMs: Date.now() - startedAt,
      detail: raw.slice(0, 500),
    }
  }

  return {
    ok: true,
    b64,
    /* The index measured `usage.cost` present at $0.040. The constant is the fallback only. */
    costMicroUsd: reportedCost ?? NINA_IMAGE_COST_MICRO_USD,
    latencyMs: Date.now() - startedAt,
  }
}

/**
 * The PNG into Blob, under `nina/<userId>/<purpose>-<id>.png`. RU-7's per-user prefix.
 *
 * ── media-dedupe P3: HASH BEFORE PUT, IN LOCKSTEP WITH `lib/nina/imagerun.ts` ─────────────────
 * Same rule, second host: the bytes are in hand, so `contentHashOf` runs BEFORE `put` and a hit
 * in this user's originals skips the put entirely — `addRandomSuffix: true` would otherwise
 * guarantee that identical bytes land as a second object. The row-level decision is NOT made
 * here: `store` reports what it found and `finishSelfie` runs `planNinaImageWrite` — the SAME
 * pure function the app side calls — so the two hosts cannot disagree about what a deduped write
 * looks like. A lookup fault degrades to a plain put (a paid generation must never be lost to a
 * dedup read), exactly as the app side degrades.
 *
 * `avatar` is outside the dedup scope, here as there: `nina_avatars` carries no `content_hash`
 * and the Media collection never reads it.
 *
 * `sql` became a parameter because the dedup lookup needs the database; `runOneJob` is the only
 * caller and already holds it.
 */
export interface WorkerStoredImage {
  blobUrl: string
  pathname: string
  bytes: number
  /** sha-256 hex of the exact bytes, or null when the purpose is out of dedup scope (`avatar`). */
  contentHash: string | null
  /** Non-null: an original already holds these bytes and the put was SKIPPED. */
  duplicateOf: NinaImageDedupHit | null
}

async function putBlob(
  userId: string,
  purpose: NinaImageJobArgs['purpose'],
  bytes: Buffer,
): Promise<{ blobUrl: string; pathname: string }> {
  const blob = await put(ninaImagePathname(userId, purpose, newId()), bytes, {
    access: 'public',
    contentType: NINA_IMAGE_CONTENT_TYPE,
    addRandomSuffix: true,
    allowOverwrite: false,
    cacheControlMaxAge: NINA_IMAGE_CACHE_MAX_AGE,
    token: process.env.BLOB_READ_WRITE_TOKEN,
  })
  return { blobUrl: blob.url, pathname: blob.pathname }
}

export async function store(
  sql: NeonSql,
  userId: string,
  purpose: NinaImageJobArgs['purpose'],
  b64: string,
): Promise<WorkerStoredImage> {
  const bytes = Buffer.from(b64, 'base64')
  if (purpose === 'avatar') {
    const blob = await putBlob(userId, purpose, bytes)
    return { ...blob, bytes: bytes.byteLength, contentHash: null, duplicateOf: null }
  }

  const contentHash = await contentHashOf(bytes)

  let duplicateOf: NinaImageDedupHit | null = null
  try {
    duplicateOf = await findContentDuplicate(sql, userId, contentHash)
  } catch (cause) {
    console.warn('[nina-worker] dedup lookup failed; storing anyway', {
      hash: contentHash.slice(0, 12),
      error: String(cause),
    })
  }
  if (duplicateOf != null) {
    console.info('[nina-worker] duplicate content; the put is skipped', {
      bytes: bytes.byteLength,
      hash: contentHash.slice(0, 12),
    })
    return {
      blobUrl: duplicateOf.blobUrl,
      pathname: duplicateOf.pathname,
      bytes: bytes.byteLength,
      contentHash,
      duplicateOf,
    }
  }

  const blob = await putBlob(userId, purpose, bytes)
  return { ...blob, bytes: bytes.byteLength, contentHash, duplicateOf: null }
}

/**
 * The worker's own spelling of `releaseBlobIfUnreferenced` (`lib/nina/blobRelease.ts`), which
 * cannot be imported for the same reason everything else here is restated. The rule is the ONE
 * delete rule of the whole plan set: ROW FIRST, BLOB SECOND — the caller has already written the
 * row that replaced the reference, and this asks the same SIX columns across the same TWO tables
 * the app's `isBlobPathnameReferenced` asks (images pathname+url, avatars pathname+url,
 * thumbnails pathname+url) before `del`. Any fault keeps the object: a loser blob left for the
 * reaper is recoverable, a deleted object a row still points at is not.
 */
export async function releaseBlobIfUnreferenced(
  sql: NeonSql,
  userId: string,
  ref: { blobUrl: string; pathname: string },
  /** Test seam: `del` arrives through `createRequire`, which no `vi.mock` registry reaches. */
  delFn: (url: string) => Promise<unknown> = del,
): Promise<'deleted' | 'shared' | 'failed'> {
  try {
    const rows = (await sql`
      select id from (
        (select id from nina_message_images
          where user_id = ${userId}
            and (pathname = ${ref.pathname} or blob_url = ${ref.blobUrl}))
        union all
        (select id from nina_avatars
          where user_id = ${userId}
            and (pathname = ${ref.pathname} or blob_url = ${ref.blobUrl}
              or thumb_pathname = ${ref.pathname} or thumb_url = ${ref.blobUrl}))
      ) referenced
      limit 1
    `) as Array<{ id: string }>
    if (rows.length > 0) {
      console.info('[nina-worker] blob kept: another row still points at it')
      return 'shared'
    }
    await delFn(ref.blobUrl)
    return 'deleted'
  } catch (cause) {
    console.warn('[nina-worker] the loser blob could not be released; the reaper owns it now', {
      error: String(cause),
    })
    return 'failed'
  }
}

/**
 * **Which session does a message this worker writes belong in? FINDING 1's real question.**
 *
 * `nina_messages.session_id` has been `NOT NULL` since migration 0004 (`lib/db/schema.ts:855`) and
 * both of this file's INSERTs omitted it, so every successful generation crashed on the write that
 * would have made the photograph visible, and the apology for that crash crashed the same way and
 * took the process down before `nina_turns` could record what had been spent. Run `33986082744`
 * measured all of it.
 *
 * ── WHY THIS IS SQL AND NOT AN IMPORT ─────────────────────────────────────────────────────────
 * The app's answer to this exact question is `resolveNinaSessionForMessage` in
 * `lib/nina/sessionResolve.ts`. It cannot be imported here: it begins `import 'server-only'` and
 * reaches `lib/nina/queries.ts` through `@/` aliases, neither of which survives
 * `--experimental-strip-types`. See this file's header. So the POLICY is duplicated and the
 * duplication is stated rather than hidden — and the widened `findSchemaDrift` is what keeps the
 * column list honest across the two hosts.
 *
 * ── THE POLICY, WHICH IS `resolveNinaSessionForMessage`'S, CLAUSE FOR CLAUSE ───────────────────
 *   1. the session of `args.replyToId` — the runner message that asked — **when that message still
 *      exists and is his**. So a photograph lands in the conversation where he asked for it, not in
 *      whichever chat happens to be newest two minutes later.
 *   2. otherwise his most recent session BY ACTIVITY, which is `max(sent_at)` over his own messages
 *      in it, falling back to the session's `created_at` for one he made and has not written in.
 *      This is `sessionActivityAt` + `compareNinaSessionActivity` from `lib/nina/sessions.ts`, and
 *      **pins are irrelevant on purpose** — the display list is pinned-first, and a photograph does
 *      not belong in a conversation he pinned in March. The `s.id desc` tie-break is that
 *      comparator's, which returns `a.id < b.id ? 1 : -1` and therefore sorts the larger id first.
 *   3. otherwise **null, and the caller declines to write the message**. This is the one place the
 *      policies differ, deliberately: the app's fallback is `ensureNinaSession`, which CREATES. A
 *      worker that minted a session would file a photograph into a conversation the runner has
 *      never seen, and it would make `nina_chat_sessions` a table this file writes — which is a
 *      second writer of a ledger the app owns. Declining is the honest outcome, and it is reachable
 *      only in the R11 state where he has removed every session he has.
 *
 * Owner-scoped in both branches (invariant 5): a foreign or vanished id comes back empty and takes
 * the fallback rather than reaching into somebody else's conversation.
 *
 * One statement rather than two, because neon-http charges a round trip per call and the `not
 * exists` guard means exactly one branch of the `union all` ever produces a row.
 */
export async function resolveWorkerSessionId(
  sql: NeonSql,
  userId: string,
  replyToId: string | null,
): Promise<string | null> {
  const rows = (await sql`
    with reply as (
      select m.session_id as id
      from nina_messages m
      where m.id = ${replyToId}::text and m.user_id = ${userId}
      limit 1
    ),
    recent as (
      select s.id
      from nina_chat_sessions s
      left join (
        select m.session_id as session_id, max(m.sent_at) as last_user_at
        from nina_messages m
        where m.user_id = ${userId} and m.role = 'runner'
        group by m.session_id
      ) a on a.session_id = s.id
      where s.user_id = ${userId}
      order by coalesce(a.last_user_at, s.created_at) desc, s.id desc
      limit 1
    )
    select id from reply
    union all
    select id from recent where not exists (select 1 from reply)
  `) as Array<{ id: string | null }>

  return rows[0]?.id ?? null
}

/**
 * Success, for a **chat selfie**. The photograph, as an ordinary chat message.
 *
 * **Not a special kind of message** — a `nina_messages` row plus a `nina_message_images` row with
 * `kind = 'generated'`, which is the same pair phase 6 writes for an upload. That is what makes it
 * quotable (phase 7), gallery-able (phase 13) and unread-able (phase 10) for free.
 *
 * `source = 'chat'` on purpose, and NOT a sixth `NinaMessageSource`: she is answering something he
 * said in an open conversation, minutes ago. Adding a source value would force an edit to phase 1's
 * column domain and phase 10's `'chat' | ProactiveTriggerKind` test for no gain (RULING C9).
 *
 * The caption is never empty. `nina_messages.text` is `notNull` and would accept `''`, but an empty
 * bubble is not a message.
 *
 * `prompt` gets the sidecar (prompt as sent, model, seed) and `description` gets the scene prose.
 * Phase 6's `glm-4.6v` describe pre-pass is **not** run over a generated image: we wrote the
 * picture, so we already know what is in it, and paying a vision call to be told back our own prompt
 * would be absurd. Phases 14 and 15 hand-upload files with no prompt and DO run that pre-pass —
 * that is the whole difference between the two paths.
 *
 * **THE ORDER IS LOAD-BEARING.** The message and its image row go in FIRST, then the job is marked
 * `ok`. A crash between the two leaves a `pending` job whose photo is already in the chat — which a
 * sweep will eventually apologise for, so the runner sees a picture AND an apology. Odd, but
 * survivable and self-correcting. The reverse order would mark the job done with no photograph
 * anywhere and no sweep left to notice, which is R22's exact failure.
 *
 * `reply_to_id` is written through a subselect rather than trusted: a quote whose target was deleted
 * must degrade to a plain message, not violate the foreign key and lose the photograph.
 *
 * **`session_id` IS FINDING 1, AND IT IS RESOLVED RATHER THAN GUESSED.** It is `NOT NULL` and this
 * function omitted it, so the picture was generated, paid for, stored in Blob — and thrown away by
 * the INSERT that would have shown it. `resolveWorkerSessionId` is the policy, and it is the same
 * policy `postNinaApologyMessage` uses on the app side. Note that `reply_to_id` and `session_id`
 * degrade in OPPOSITE directions and that is correct: a deleted quote target degrades to a plain
 * message (`set null`), while a message with no session is not a message at all.
 *
 * **When no session resolves, this throws rather than writing anything.** The caller turns that into
 * a `transport` failure through `closeFailed`, which records what was spent and — once the retry
 * budget is gone — apologises. The state is reachable only when he has removed every session he has
 * (R11), and the honest cost is that the retry regenerates and spends a second $0.04 before giving
 * up. That is priced rather than special-cased: both spends are now recorded (see `closeFailed`), so
 * phase 4's detail page will show `attempts: 2` and a doubled cost, which is exactly what happened.
 *
 * *media-dedupe P3: the image row is written from `planNinaImageWrite` — the same pure function the
 * app side calls — so a generation whose bytes this user already stores lands as a REFERENCE with no
 * second object; the race between the pre-put lookup and this insert is closed HERE, and the loser
 * blob is released only after the row that replaced it is in.*
 */
export async function finishSelfie(
  sql: NeonSql,
  job: ClaimedJob,
  image: WorkerStoredImage,
  result: { costMicroUsd: number; latencyMs: number },
): Promise<void> {
  const messageId = newId()
  const imageId = newId()
  const { jobId, userId, args } = job

  const sessionId = await resolveWorkerSessionId(sql, userId, args.replyToId)
  if (sessionId == null) {
    throw new Error(`no session to file the photograph in (job ${jobId})`)
  }

  /* ── media-dedupe P3: THE RACE-CLOSE, ASKED A SECOND TIME AT THE INSERT ─────────────────────
   * `store` asked before its put; two hosts can both hear "no" and both put. The same lookup runs
   * again here, and a hit turns this write into a REFERENCE through `planNinaImageWrite` — with
   * the fresh loser bytes scheduled for release after the row is in. A lookup fault degrades to
   * "original", the same rule as the pre-put lookup: the photograph must never be lost to a
   * dedup read. */
  let racedDuplicate: NinaImageDedupHit | null = null
  if (image.duplicateOf == null && image.contentHash != null) {
    try {
      racedDuplicate = await findContentDuplicate(sql, userId, image.contentHash)
    } catch (cause) {
      console.warn('[nina-worker] dedup re-check failed; writing an original', {
        jobId,
        error: String(cause),
      })
    }
  }
  const writePlan = planNinaImageWrite({
    hit: image.duplicateOf ?? racedDuplicate,
    stored: { blobUrl: image.blobUrl, pathname: image.pathname, contentHash: image.contentHash },
  })
  if (writePlan.release != null) {
    console.info('[nina-worker] lost a dedup race; the row will reference the keeper', {
      jobId,
      bytes: image.bytes,
      hash: image.contentHash?.slice(0, 12) ?? null,
    })
  }

  /* `photo_only = true` marks the bubble as existing only to carry the picture — the same fact
   * `finishSelfie` and `addChatPhotoAction` record through `NinaMessageInsert.photoOnly`. Here it is
   * a column name in SQL and nothing more, because this file may not import `@/lib/db/schema`.
   *
   * THE CANNED CAPTION IS PERMANENT ON THIS HOST, and it is not an inconsistency to fix. This
   * worker runs on a GitHub runner with no z.ai key, and `lib/nina/imagefail.ts` — the one module it
   * imports, by relative path under `--experimental-strip-types` — states in its own header that it
   * may import nothing at all. Reaching for `@/lib/nina/caption` here would stop the worker booting,
   * and a caption that fails to be produced is the exact bug `imagefail.ts` exists to kill. What
   * makes the canned line acceptable is that its pool no longer asserts a scene: every member is
   * true of any photograph of her.
   *
   * DEPLOY ORDER: this INSERT names a column migration 0008 creates. Additive, and migrations run
   * before the deploy in the normal order — but a worker deployed against an un-migrated database
   * fails this statement, so the order is a requirement here and not an incidental. The same now
   * applies to `content_hash` (migration 0018, media-dedupe P1) — except that preflight's
   * `findSchemaDrift` runs the existence check FIRST, so an un-migrated database takes the
   * workflow red before a job is claimed, rather than dropping a photograph after the money was
   * spent. */
  await sql`
    insert into nina_messages
      (id, user_id, session_id, role, text, source, turn_id, reply_to_id, photo_only)
    values (
      ${messageId}, ${userId}, ${sessionId}, 'nina', ${ninaImageCaption(jobId)}, 'chat', ${jobId},
      (select id from nina_messages where id = ${args.replyToId} and user_id = ${userId}),
      true
    )
  `
  /* The plan's values, not `image`'s: a deduped row carries the KEEPER's object and the keeper's
   * id in `source_image_id`, so `isOriginalPhoto()` hides it from the collection while the bubble
   * still renders it. `description`/`prompt` stay THIS generation's — the same argument the app
   * side makes at its insert: the scene is a truthful description of these bytes, and the sidecar
   * is what ITS generation was told. */
  await sql`
    insert into nina_message_images
      (id, user_id, message_id, kind, blob_url, pathname, width, height, bytes, description, prompt,
       content_hash, source_image_id, sort_order)
    values (
      ${imageId}, ${userId}, ${messageId}, 'generated', ${writePlan.row.blobUrl},
      ${writePlan.row.pathname}, ${NINA_IMAGE_WIDTH}, ${NINA_IMAGE_HEIGHT}, ${image.bytes},
      ${args.scene}, ${args.sidecar}, ${writePlan.row.contentHash}, ${writePlan.row.sourceImageId}, 0
    )
  `
  await sql`
    update nina_turns
    set status = 'ok', error_code = null, latency_ms = ${result.latencyMs},
        cost_micro_usd = coalesce(cost_micro_usd, 0) + ${result.costMicroUsd}
    where id = ${jobId} and user_id = ${userId}
  `

  /* Loser bytes out, after the row that replaced them is in — ROW FIRST, BLOB SECOND. Reached
   * only on the race path: the skip path never put anything. If the INSERT above throws instead,
   * the loser blob stays behind and the reaper owns it — the same orphan class the existing
   * `finish:` failure branch already documents. */
  if (writePlan.release != null) {
    await releaseBlobIfUnreferenced(sql, userId, writePlan.release)
  }
}

/**
 * Success, for an **avatar** (phases 13 and 15).
 *
 * The two statements are one `sql.transaction`, in this order, because phase 1's partial unique
 * index `nina_avatars_user_current_unq` makes it mandatory rather than merely tidy: inserting a
 * second `is_current` row before un-currenting the first violates the index. This mirrors phase 1's
 * `insertNinaAvatarAsCurrent`, which uses `db.batch` for the same reason — and re-implementing it
 * here is the duplication the plan's Risk 1 names.
 *
 * `announced_at` is left NULL, and **that NULL IS phase 10's `avatar_changed` trigger.** This is the
 * only place a *generated* avatar becomes announceable, and it is reached only on success — which is
 * the structural half of "her announcement must not fire for a photograph that does not exist".
 *
 * No `nina_messages` row. Nobody asked in chat; phase 10's next tick is what makes her mention it.
 */
async function finishAvatar(
  sql: NeonSql,
  job: ClaimedJob,
  image: { blobUrl: string; pathname: string; bytes: number },
  result: { costMicroUsd: number; latencyMs: number },
): Promise<void> {
  const { jobId, userId, args } = job
  const avatarId = newId()
  const source = args.source === 'admin' ? 'admin' : 'generated'

  await sql.transaction([
    sql`update nina_avatars set is_current = false where user_id = ${userId} and is_current = true`,
    sql`
      insert into nina_avatars
        (id, user_id, blob_url, pathname, width, height, bytes, source, description, is_current, announced_at)
      values (
        ${avatarId}, ${userId}, ${image.blobUrl}, ${image.pathname}, ${NINA_IMAGE_WIDTH},
        ${NINA_IMAGE_HEIGHT}, ${image.bytes}, ${source}, ${args.scene}, true, null
      )
    `,
  ])

  await sql`
    update nina_turns
    set status = 'ok', error_code = null, latency_ms = ${result.latencyMs},
        cost_micro_usd = coalesce(cost_micro_usd, 0) + ${result.costMicroUsd}
    where id = ${jobId} and user_id = ${userId}
  `
}

/**
 * Failure. **Two outcomes, and the choice is the retry budget.**
 *
 * If attempts remain, the row goes back to `queued` and stays `pending`, so the next backstop run
 * tries again with the SAME prompt and the SAME seed — which is why both are stored rather than
 * rebuilt. Nothing is said to the runner: her bubble still says she is taking the photo, and she is.
 *
 * If the budget is spent, the job is terminal and **the apology goes in with it, in the same
 * function**, because a caller that could mark a job failed without saying anything is a caller that
 * will eventually do so. An **avatar** job posts nothing — nobody asked for it in chat — which is
 * the same rule `failNinaImageJob` and both sweeps follow.
 *
 * ── FINDING 1's BLAST RADIUS: THE APOLOGY CANNOT TAKE THE JOB DOWN WITH IT ────────────────────
 * The apology INSERT omitted `session_id`, so on the final attempt it threw, the throw propagated
 * out of `runOneJob` and out of `main`, and the process died BEFORE the terminal
 * `update nina_turns` ever ran. The job stayed `pending`, the app's 20-minute sweep later marked it
 * `stale`, and `cost_micro_usd` stayed NULL — measured on jobs `pF5c6V8YbxAR` (73 925 ms) and
 * `ChfwHZ2GJT4I` (55 600 ms), both of which reached OpenRouter successfully. **The money was spent
 * and the ledger said it was free.**
 *
 * So the apology is now best-effort and the terminal UPDATE is not. The ordering is unchanged —
 * apology first, then close — because the alternative (close first) would let a crash in between
 * leave a `failed` job with no apology and no sweep left to notice it, and the sweep only looks at
 * `pending` rows. Wrapping is strictly better than reordering here.
 *
 * ── INVARIANT 9: MONEY IS NEVER SPENT SILENTLY ───────────────────────────────────────────────
 * `costMicroUsd` is what THIS attempt is known to have spent, or null when the call never came back
 * with a figure. Both branches now accumulate onto the row rather than overwriting it, because two
 * attempts are two generations and two bills. The retry branch adds only a KNOWN spend: an unknown
 * one would otherwise be guessed twice for the same picture. The terminal branch keeps the old
 * behaviour of guessing high when nothing is known — a call that reached the provider and then timed
 * out was very probably billed, and guessing high is the honest direction for a cost log.
 */
export async function closeFailed(
  sql: NeonSql,
  job: ClaimedJob,
  outcome: {
    kind: NinaImageFailure
    latencyMs: number
    detail: string
    /** Micro-USD this attempt is KNOWN to have spent. Null when the call returned no figure. */
    costMicroUsd: number | null
  },
): Promise<'retry' | 'gave-up'> {
  const { jobId, userId, args, attempts } = job
  console.warn('[nina-worker] generation failed', {
    jobId,
    kind: outcome.kind,
    attempts,
    detail: outcome.detail,
  })

  if (attempts < NINA_IMAGE_MAX_ATTEMPTS) {
    await sql`
      update nina_turns set
        error_code = 'queued',
        latency_ms = ${outcome.latencyMs},
        cost_micro_usd = coalesce(cost_micro_usd, 0) + ${outcome.costMicroUsd ?? 0}
      where id = ${jobId} and user_id = ${userId} and status = 'pending'
    `
    return 'retry'
  }

  if (args.purpose === 'selfie') {
    try {
      const sessionId = await resolveWorkerSessionId(sql, userId, args.replyToId)
      if (sessionId == null) {
        console.warn('[nina-worker] no session for the apology; closing the job anyway', { jobId })
      } else {
        await sql`
          insert into nina_messages
            (id, user_id, session_id, role, text, source, turn_id, reply_to_id)
          values (
            ${newId()}, ${userId}, ${sessionId}, 'nina', ${ninaImageApology(outcome.kind, jobId)},
            'chat', ${jobId},
            (select id from nina_messages where id = ${args.replyToId} and user_id = ${userId})
          )
        `
      }
    } catch (cause) {
      /* Best-effort, and it MUST stay that way. See the header: this throw is what killed the
       * process before the money could be recorded. Nothing identifying is logged — invariant 4,
       * this repository is public and this line appears in an Actions run. */
      console.warn('[nina-worker] the apology could not be written; closing the job anyway', {
        jobId,
        error: String(cause),
      })
    }
  }

  await sql`
    update nina_turns
    set status = 'failed', error_code = ${outcome.kind}, latency_ms = ${outcome.latencyMs},
        cost_micro_usd = coalesce(cost_micro_usd, 0)
          + ${outcome.costMicroUsd ?? NINA_IMAGE_COST_MICRO_USD}
    where id = ${jobId} and user_id = ${userId} and status = 'pending'
  `
  return 'gave-up'
}

/**
 * Claim, generate, close. Returns what happened so `main` can log one line per job and so the test
 * can assert the branches without a network.
 *
 * **A store failure is a `transport` failure and not a crash.** The picture exists and we could not
 * keep it, which from the runner's side is "the photo did not come through" — and the money is
 * already spent, which is why it is still logged, still counted against the cap, and now also
 * recorded on the row (invariant 9).
 */
export async function runOneJob(
  sql: NeonSql,
  jobId: string | null,
): Promise<'none' | 'ok' | 'retry' | 'gave-up'> {
  const job = await claimJob(sql, jobId)
  if (job == null) return 'none'

  console.info('[nina-worker] claimed', {
    jobId: job.jobId,
    purpose: job.args.purpose,
    attempt: job.attempts,
  })

  const outcome = await generate(
    job.args.prompt,
    job.args.seed,
    ninaImageReferenceUrl(job.args),
    /* §8: an old jsonb row without the key coerces to the measured default, the same degrade the
     * in-platform host applies. */
    coerceNinaImageModel(job.args.model),
  )
  if (!outcome.ok) {
    return closeFailed(sql, job, {
      kind: outcome.kind,
      latencyMs: outcome.latencyMs,
      detail: outcome.detail,
      /* The call returned no figure, so what it cost is unknown. `closeFailed` adds nothing on a
       * retry — an unknown guessed twice for one picture is a worse log than a missing one — and
       * guesses high on the terminal attempt, where a timed-out call was very probably billed. */
      costMicroUsd: null,
    })
  }

  let image: WorkerStoredImage
  try {
    image = await store(sql, job.userId, job.args.purpose, outcome.b64)
  } catch (cause) {
    return closeFailed(sql, job, {
      kind: 'transport',
      latencyMs: outcome.latencyMs,
      detail: `store: ${String(cause)}`,
      /* The generation SUCCEEDED and was billed; only the storage failed. */
      costMicroUsd: outcome.costMicroUsd,
    })
  }

  try {
    if (job.args.purpose === 'avatar') {
      await finishAvatar(sql, job, image, outcome)
    } else {
      await finishSelfie(sql, job, image, outcome)
    }
  } catch (cause) {
    /*
     * The bytes are stored and the row could not be written. Closing it as a failure is the honest
     * outcome — no photograph is visible, so she should say so — and the blob is left behind, which
     * the plan's Handoff 6 (the `nina/` reaper) exists for.
     *
     * **This is the branch Finding 1 lived in**, and it reached `closeFailed` correctly every time.
     * What was broken was `closeFailed` itself, which threw the same way and killed the process
     * before the spend below could be recorded.
     */
    return closeFailed(sql, job, {
      kind: 'transport',
      latencyMs: outcome.latencyMs,
      detail: `finish: ${String(cause)}`,
      costMicroUsd: outcome.costMicroUsd,
    })
  }

  console.info('[nina-worker] done', {
    jobId: job.jobId,
    purpose: job.args.purpose,
    bytes: image.bytes,
    costMicroUsd: outcome.costMicroUsd,
    latencyMs: outcome.latencyMs,
  })
  return 'ok'
}

export async function main(argv: readonly string[] = process.argv.slice(2)): Promise<number> {
  const { jobId, dryRun } = parseArgv(argv)
  const sql = neon(process.env.DATABASE_URL as string)

  await preflight(sql)
  if (dryRun) {
    console.info('[nina-worker] preflight ok', { jobId, mode: jobId == null ? 'sweep' : 'job' })
    return 0
  }

  /*
   * With `--job` exactly one job is attempted, because the doorbell named it. Without one, up to
   * `NINA_IMAGE_SWEEP_BUDGET` — a burst of six requests would otherwise make a single scheduled run
   * exceed `timeout-minutes`, and a run killed mid-generation wastes the money it already spent.
   * Three x 78 s ~ 4 min, inside the 6.
   */
  const budget = jobId == null ? NINA_IMAGE_SWEEP_BUDGET : 1
  let done = 0
  for (let i = 0; i < budget; i++) {
    const result = await runOneJob(sql, jobId)
    if (result === 'none') break
    done += 1
  }

  /*
   * Exit 0 even when nothing was found. The scheduled backstop finds nothing on the overwhelming
   * majority of its runs — that is what a backstop is — and a red workflow every ten minutes is a
   * workflow nobody reads. A genuine problem (missing secrets, schema drift) throws out of
   * `preflight` and DOES go red.
   */
  console.info('[nina-worker] finished', { attempted: done })
  return 0
}

/* Run only as a script, so a test can import everything above. Removing this guard makes
 * `tests/nina.imageworker.test.ts` open a database connection on import. */
if (process.argv[1] != null && fileURLToPath(import.meta.url) === process.argv[1]) {
  main()
    .then((code) => process.exit(code))
    .catch((error) => {
      console.error('[nina-worker] fatal', error)
      process.exit(1)
    })
}
