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
import { classifyImageFailure, ninaImageApology, ninaImageCaption } from '../lib/nina/imagefail.ts'
import type { NinaImageFailure } from '../lib/nina/imagefail.ts'
import {
  buildImageRequestBody,
  NINA_IMAGE_CACHE_MAX_AGE,
  NINA_IMAGE_CONTENT_TYPE,
  NINA_IMAGE_COST_MICRO_USD,
  NINA_IMAGE_DISPATCH_GRACE_MS,
  NINA_IMAGE_HEIGHT,
  NINA_IMAGE_MAX_ATTEMPTS,
  NINA_IMAGE_RECLAIM_MS,
  NINA_IMAGE_SWEEP_BUDGET,
  NINA_IMAGE_WIDTH,
  NINA_WORKER_CALL_TIMEOUT_MS,
  ninaImagePathname,
  OPENROUTER_IMAGE_URL,
  readReportedCostMicroUsd,
} from '../lib/nina/imagerecipe.ts'
import type { NinaImageJobArgs } from '../lib/nina/imagerecipe.ts'

/* `@neondatabase/serverless` and `@vercel/blob` are CJS-friendly and are loaded the way every other
 * script in `scripts/` loads them (`scripts/blob-reap.mjs:34`), so this file needs no bundler and no
 * transform beyond stripping. */
const require = createRequire(import.meta.url)
const { neon } = require('@neondatabase/serverless') as {
  neon: (url: string) => NeonSql
}
const { put } = require('@vercel/blob') as {
  put: (
    pathname: string,
    body: Buffer,
    options: Record<string, unknown>,
  ) => Promise<{ url: string; pathname: string }>
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
 * Every column this file writes, per table. **This list is the duplication `lib/db/schema.ts` costs
 * us**, and checking it against `information_schema` on every run is what makes the duplication
 * safe: the backstop runs every ten minutes, so a rename in phase 1's schema surfaces as a red
 * workflow within ten minutes of the deploy instead of as a silently unwritten photograph.
 */
const REQUIRED_COLUMNS: Record<string, readonly string[]> = {
  nina_turns: [
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
  nina_messages: ['id', 'user_id', 'role', 'text', 'source', 'turn_id', 'reply_to_id', 'sent_at'],
  nina_message_images: [
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
    'sort_order',
  ],
  nina_avatars: [
    'id',
    'user_id',
    'blob_url',
    'pathname',
    'width',
    'height',
    'bytes',
    'source',
    'description',
    'is_current',
    'announced_at',
  ],
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
    select table_name, column_name
    from information_schema.columns
    where table_schema = 'public' and table_name = any(${tables})
  `) as Array<{ table_name: string; column_name: string }>

  const have = new Map<string, Set<string>>()
  for (const row of rows) {
    const set = have.get(row.table_name) ?? new Set<string>()
    set.add(row.column_name)
    have.set(row.table_name, set)
  }

  const missing: string[] = []
  for (const [table, columns] of Object.entries(REQUIRED_COLUMNS)) {
    const set = have.get(table)
    if (set == null) {
      missing.push(`${table} (whole table)`)
      continue
    }
    for (const column of columns) if (!set.has(column)) missing.push(`${table}.${column}`)
  }
  if (missing.length > 0) {
    /*
     * The most likely cause, in order: phase 1's migration has not been applied to this database; a
     * column was renamed; the connection points at the wrong database entirely. All three are a code
     * or configuration change rather than a retry, so this throws and takes the workflow red rather
     * than failing a job quietly.
     */
    throw new Error(`schema drift — missing: ${missing.join(', ')}`)
  }
}

export interface ClaimedJob {
  jobId: string
  userId: string
  args: NinaImageJobArgs
  attempts: number
}

/**
 * **The only lock in the system.** One conditional UPDATE, and exactly one caller gets a row back.
 *
 * With a job id it claims that job. Without one it claims the oldest ACTIONABLE job, which is:
 *   · `queued`     — the doorbell never rang, or rang and the bookkeeping died;
 *   · `dispatched` older than `NINA_IMAGE_DISPATCH_GRACE_MS` — GitHub accepted it and no runner
 *     ever picked it up;
 *   · `running` older than `NINA_IMAGE_RECLAIM_MS` — the runner that owned it was killed by
 *     `timeout-minutes`, which is longer than the ceiling so it cannot still be alive.
 *
 * `attempts` is incremented in the same statement, so the retry budget cannot be spent twice by two
 * runners. A job at the budget is not claimed at all; the app-side sweep closes it instead.
 *
 * **One note on `created_at` in the WHERE clause.** It is the job's OPEN time, not its claim time,
 * because `nina_turns` has no claim timestamp and this phase did not ask phase 1 for one. For a
 * first attempt the two are within a minute of each other, so it is a fine proxy. For a SECOND
 * attempt the timestamp is already old, which would make a reclaimed job immediately eligible again
 * — and the only thing stopping an infinite reclaim loop is `attempts < NINA_IMAGE_MAX_ATTEMPTS` in
 * the same clause. **That bound is therefore load-bearing, not a nicety.** If a future phase adds a
 * `claimed_at` column, the cutoff should move to it and the bound should stay.
 */
export async function claimJob(
  sql: NeonSql,
  jobId: string | null,
  now: Date = new Date(),
): Promise<ClaimedJob | null> {
  const dispatchCutoff = new Date(now.getTime() - NINA_IMAGE_DISPATCH_GRACE_MS)
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
 * One OpenRouter call. **It never throws** — every failure comes back as a `NinaImageFailure`,
 * because the caller's whole job is to turn that into one of her sentences, and a `catch` that has
 * to re-derive which of four things happened is a `catch` that will get it wrong.
 *
 * The classification is `classifyImageFailure` from `lib/nina/imagefail.ts` — **the same function
 * the app uses, imported, not paraphrased.** That is the whole reason `imagefail.ts` is forbidden
 * from having imports.
 *
 * The timeout is `NINA_WORKER_CALL_TIMEOUT_MS` (240 s), three times the measured 78.2 s. Off Vercel
 * there is no ceiling to race, and a timeout that fires on a merely slow day throws away $0.04 and
 * a photograph.
 */
export async function generate(prompt: string, seed: number): Promise<WorkerOutcome> {
  const startedAt = Date.now()
  const apiKey = process.env.OPENROUTER_API_KEY as string

  let res: Response
  try {
    res = await fetch(OPENROUTER_IMAGE_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(buildImageRequestBody({ prompt, seed })),
      signal: AbortSignal.timeout(NINA_WORKER_CALL_TIMEOUT_MS),
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

/** The PNG into Blob, under `nina/<userId>/<purpose>-<id>.png`. RU-7's per-user prefix. */
async function store(
  userId: string,
  purpose: NinaImageJobArgs['purpose'],
  b64: string,
): Promise<{ blobUrl: string; pathname: string; bytes: number }> {
  const bytes = Buffer.from(b64, 'base64')
  const blob = await put(ninaImagePathname(userId, purpose, newId()), bytes, {
    access: 'public',
    contentType: NINA_IMAGE_CONTENT_TYPE,
    addRandomSuffix: true,
    allowOverwrite: false,
    cacheControlMaxAge: NINA_IMAGE_CACHE_MAX_AGE,
    token: process.env.BLOB_READ_WRITE_TOKEN,
  })
  return { blobUrl: blob.url, pathname: blob.pathname, bytes: bytes.byteLength }
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
 */
async function finishSelfie(
  sql: NeonSql,
  job: ClaimedJob,
  image: { blobUrl: string; pathname: string; bytes: number },
  result: { costMicroUsd: number; latencyMs: number },
): Promise<void> {
  const messageId = newId()
  const imageId = newId()
  const { jobId, userId, args } = job

  await sql`
    insert into nina_messages (id, user_id, role, text, source, turn_id, reply_to_id)
    values (
      ${messageId}, ${userId}, 'nina', ${ninaImageCaption(jobId)}, 'chat', ${jobId},
      (select id from nina_messages where id = ${args.replyToId} and user_id = ${userId})
    )
  `
  await sql`
    insert into nina_message_images
      (id, user_id, message_id, kind, blob_url, pathname, width, height, bytes, description, prompt, sort_order)
    values (
      ${imageId}, ${userId}, ${messageId}, 'generated', ${image.blobUrl}, ${image.pathname},
      ${NINA_IMAGE_WIDTH}, ${NINA_IMAGE_HEIGHT}, ${image.bytes}, ${args.scene}, ${args.sidecar}, 0
    )
  `
  await sql`
    update nina_turns
    set status = 'ok', error_code = null, latency_ms = ${result.latencyMs},
        cost_micro_usd = ${result.costMicroUsd}
    where id = ${jobId} and user_id = ${userId}
  `
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
        cost_micro_usd = ${result.costMicroUsd}
    where id = ${jobId} and user_id = ${userId}
  `
}

/**
 * Failure. **Two outcomes, and the choice is the retry budget.**
 *
 * If attempts remain, the row goes back to `queued` and stays `pending`, so the next backstop run
 * (<=10 minutes) tries again with the SAME prompt and the SAME seed — which is why both are stored
 * rather than rebuilt. Nothing is said to the runner: her bubble still says she is taking the photo,
 * and she is.
 *
 * If the budget is spent, the job is terminal and **the apology goes in with it, in the same
 * function**, because a caller that could mark a job failed without saying anything is a caller that
 * will eventually do so. An **avatar** job posts nothing — nobody asked for it in chat — which is
 * the same rule `failNinaImageJob` and both sweeps follow.
 *
 * `cost_micro_usd` is written for every kind, because a call that reached the provider and then timed
 * out was very probably billed. Guessing high is the honest direction for a cost log.
 */
async function closeFailed(
  sql: NeonSql,
  job: ClaimedJob,
  outcome: { kind: NinaImageFailure; latencyMs: number; detail: string },
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
      update nina_turns set error_code = 'queued', latency_ms = ${outcome.latencyMs}
      where id = ${jobId} and user_id = ${userId} and status = 'pending'
    `
    return 'retry'
  }

  if (args.purpose === 'selfie') {
    await sql`
      insert into nina_messages (id, user_id, role, text, source, turn_id, reply_to_id)
      values (
        ${newId()}, ${userId}, 'nina', ${ninaImageApology(outcome.kind, jobId)}, 'chat', ${jobId},
        (select id from nina_messages where id = ${args.replyToId} and user_id = ${userId})
      )
    `
  }
  await sql`
    update nina_turns
    set status = 'failed', error_code = ${outcome.kind}, latency_ms = ${outcome.latencyMs},
        cost_micro_usd = ${NINA_IMAGE_COST_MICRO_USD}
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
 * already spent, which is why it is still logged and still counted against the cap.
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

  const outcome = await generate(job.args.prompt, job.args.seed)
  if (!outcome.ok) return closeFailed(sql, job, outcome)

  let image: { blobUrl: string; pathname: string; bytes: number }
  try {
    image = await store(job.userId, job.args.purpose, outcome.b64)
  } catch (cause) {
    return closeFailed(sql, job, {
      kind: 'transport',
      latencyMs: outcome.latencyMs,
      detail: `store: ${String(cause)}`,
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
     */
    return closeFailed(sql, job, {
      kind: 'transport',
      latencyMs: outcome.latencyMs,
      detail: `finish: ${String(cause)}`,
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
