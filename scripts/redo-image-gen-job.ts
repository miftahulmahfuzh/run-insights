/**
 * **Resolve a rejected Nina image job: edit its prompt, reopen it, and run it — now, from here.**
 *
 *   node --experimental-strip-types --no-warnings --env-file=.env.local \
 *     scripts/redo-image-gen-job.ts xha1hYOS0QCD /tmp/edited-prompt.txt
 *   node --experimental-strip-types --no-warnings --env-file=.env.local \
 *     scripts/redo-image-gen-job.ts xha1hYOS0QCD /tmp/edited-prompt.txt --dry-run
 *
 * The FIRST argument is the job id fragment, same convention as `pull-image-gen-job.mjs`
 * (`ID_FRAGMENT_RE`, `strpos`, refuse on 0 or 2+ matches). The SECOND is a PATH to a text file
 * holding the new prompt — a file, not a shell argument, because the prompt is a multi-paragraph
 * block of prose that a shell would mangle (quotes, `$`, newlines) long before it reached `argv`.
 *
 * ── WHAT IT DOES, IN THE APP'S OWN TERMS ──────────────────────────────────────────────────────
 * `/nina/jobs/[id]` already has an "Ubah prompt" (edit) control and a "Coba lagi" (redo) button —
 * `updateNinaImageJobPrompt` + `redoNinaImageJob` in `lib/nina/jobActions.ts`. This script is a
 * headless run of exactly that pair, in the same order, with the same refusals, PLUS a third step
 * neither button takes: it does not merely schedule the new job for `after()` or the GitHub
 * backstop to eventually pick up — it calls the worker's OWN `runOneJob` in-process, immediately,
 * so a job opened by this script does not wait on a cron.
 *
 *   1. `setNinaImageJobPrompt`'s SQL, verbatim: trim, refuse empty, rewrite the OLD row's
 *      `args.prompt` and `args.sidecar` (keeping every other key), still under `status = 'failed'`
 *      or `'ok'`/`'repaired'` — never under `'pending'`, which step 2 refuses anyway.
 *   2. `reopenNinaImageJob`'s SQL, verbatim: refuse `'pending'`, refuse missing/malformed args,
 *      refuse a spent daily cap, then INSERT a NEW row — `{ ...editedArgs, attempts: 0 }` — and
 *      leave the old row exactly as it was (the ledger's "two rows, two bills, two truths" rule;
 *      see that function's own header in `lib/nina/imagejobs.ts`).
 *   3. `scripts/nina-image-worker/run.ts`'s `runOneJob`, called directly, looped up to
 *      `NINA_IMAGE_MAX_ATTEMPTS` times while it returns `'retry'` — draining the SAME budget the
 *      cron backstop would, just synchronously, in this one invocation, so the caller gets a real
 *      `'ok'` or `'gave-up'` before the script exits instead of a `'pending'` row and a wait.
 *
 * `--dry-run` runs steps 1's and 2's CHECKS (fragment resolution, pending/args/cap refusals) and
 * reports what would happen, but performs neither UPDATE, neither INSERT, nor any model call —
 * `nina-image-worker.ts --dry-run`'s own contract, applied one level up.
 *
 * ── WHY A NEW SCRIPT AND NOT A MUTATING MODE OF `pull-image-gen-job.mjs` ─────────────────────—
 * That script's own header states its invariant twice over — "READ-ONLY: SELECTs only" and "the
 * diagnosis and any prompt fix are a separate, explicitly-asked-for step" — and `search-analysis.mjs`
 * / `set-current-image-gen-prompt-as-default.mjs` already draw the same line between a script that
 * reports and one that writes. Bolting an UPDATE onto the read-only tool would make every future
 * read of it a write users have to reason about; this one exists so that boundary never moves.
 *
 * ── WHY THIS CAN RUN THE MODEL CALL AND `pull-image-gen-job.mjs` STILL CANNOT ─────────────────
 * Nothing changed about `@/`-alias resolution — this script obeys the exact same import rule the
 * worker's header states (`.ts`-suffixed relative imports only, no `@/` aliases, no `server-only`).
 * What makes step 3 possible is that `scripts/nina-image-worker/run.ts` ALREADY does the generation
 * with zero `@/` imports, because RU-20 built it to run unattended on a GitHub Actions runner with
 * nothing but three environment variables. This script is simply a second caller of that same
 * worker code, on a laptop instead of a scheduled runner — `nina-image-worker.ts`'s own header
 * already names this shape: *"a fully supported manual runner: it is how a stuck job gets drained
 * during development."* A redo IS a drain, just of one specific, just-edited job.
 *
 * ── STDOUT DISCIPLINE ──────────────────────────────────────────────────────────────────────────
 * The worker's own `console.info` calls (`[nina-worker] claimed`, `[nina-worker] done`, …) go to
 * `stdout` by Node's default, which would interleave plain log lines with this script's own JSON
 * report — `pull-image-gen-job.mjs`'s "stdout is one JSON document and nothing else" convention,
 * unchanged here. So `console.info` is rebound to `console.error` for the life of this process,
 * BEFORE any worker module is imported; `console.warn` already goes to `stderr` in Node and needs
 * no rebinding. The final report is still the ONE `process.stdout.write` this file makes.
 *
 * ── WHY THE RAW REJECTION TEXT IS CAPTURED FROM `console.warn`, NOT `nina_error_logs` ─────────
 * `pull-image-gen-job.mjs` reads the provider's exact words back from `nina_error_logs`, because
 * the APP's failure path (`recordImageCallFailure`, `lib/nina/imagerun.ts`) writes them there. The
 * WORKER's failure path (`closeFailed`, `scripts/nina-image-worker/finish.ts`) never touches that
 * table — it only `console.warn`s the same `detail` string, because RU-20 built the worker to run
 * on a GitHub runner with no app-side logging table in reach. A job redone THROUGH THIS SCRIPT is
 * therefore run by the worker, not the app, and `nina_error_logs` would stay silent for it forever.
 * So `console.warn` is intercepted (forwarding to the real one, never swallowing it) to also catch
 * `closeFailed`'s own structured line and keep its `detail` for the final report.
 */
const failureDetails: string[] = []
const realWarn = console.warn.bind(console)
console.warn = (...args: unknown[]) => {
  realWarn(...args)
  const [label, meta] = args
  if (
    label === '[nina-worker] generation failed' &&
    typeof meta === 'object' &&
    meta != null &&
    typeof (meta as { detail?: unknown }).detail === 'string'
  ) {
    failureDetails.push((meta as { detail: string }).detail)
  }
}
console.info = console.error

import { createRequire } from 'node:module'

import { newId } from '../lib/id.ts'
import {
  jakartaDayStart,
  ninaImageDailyCap,
  NINA_IMAGE_MAX_ATTEMPTS,
  type NinaImageJobArgs,
} from '../lib/nina/imagerecipe.ts'
import { coerceNinaImageModel } from '../lib/nina/imageprefs.ts'

import { runOneJob } from './nina-image-worker/run.ts'
import type { NeonSql } from './nina-image-worker/sql.ts'

/* Same alphabet guard `pull-image-gen-job.mjs` and `search-analysis.mjs` both use. */
const ID_FRAGMENT_RE = /^[0-9A-Za-z_-]{1,12}$/
const MAX_LISTED_MATCHES = 25

function emit(payload: Record<string, unknown>, exitCode: number): never {
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`)
  process.exit(exitCode)
}

function fail(exitCode: number, error: string, extra: Record<string, unknown> = {}): never {
  console.error(`FAIL  ${error}`)
  return emit({ ok: false, error, ...extra }, exitCode)
}

/**
 * `setNinaImageJobPrompt`'s own helper, copied verbatim (`lib/nina/imagejobs.ts`) — it is a pure
 * string function with no import of its own, so copying it here costs nothing and keeps this
 * script's rule ("no `@/` alias, no `server-only`") intact. Kept in exact lockstep with the
 * original: `tests/nina.imagejobs.test.ts` pins the app's copy's behaviour, and any drift between
 * the two would only ever show up as a wrong sidecar, quietly, on a job nobody is looking at.
 */
function replaceSidecarPrompt(sidecar: string, newPrompt: string): string {
  const marker = '--- prompt as sent ---'
  const idx = sidecar.indexOf(marker)
  if (idx === -1) return newPrompt
  return sidecar.slice(0, idx + marker.length) + '\n' + newPrompt
}

/** `isRedoableArgs`, copied verbatim (`lib/nina/imagejobs.ts`) — see this file's own header for why
 * a copy and not an import. */
function isRedoableArgs(value: unknown): value is NinaImageJobArgs {
  if (value == null || typeof value !== 'object') return false
  const args = value as Partial<NinaImageJobArgs>
  return typeof args.prompt === 'string' && args.prompt !== '' && typeof args.seed === 'number'
}

/* ── 1. The arguments ───────────────────────────────────────────────────────────────────────── */

const rawArgv = process.argv.slice(2)
const dryRun = rawArgv.includes('--dry-run')
const positional = rawArgv.filter((a) => a !== '--dry-run')

if (positional.length < 2) {
  fail(
    2,
    'usage: redo-image-gen-job.ts <job-id-fragment> <prompt-file> [--dry-run]   ' +
      'e.g.  xha1hYOS0QCD /tmp/edited-prompt.txt',
  )
}

const fragment = positional[0]!.replace(/^#/, '').trim()
const promptFile = positional[1]!

if (!ID_FRAGMENT_RE.test(fragment)) {
  fail(
    2,
    `${JSON.stringify(fragment)} is not a fragment of an id: ids are 1-12 symbols from [0-9A-Za-z_-] ` +
      "(lib/id.ts). A leading '#' is stripped for you; nothing else is.",
  )
}

const fs = await import('node:fs/promises')
let newPrompt: string
try {
  newPrompt = (await fs.readFile(promptFile, 'utf8')).trim()
} catch (cause) {
  fail(2, `could not read prompt file ${JSON.stringify(promptFile)}: ${String(cause)}`)
}
if (newPrompt.length === 0) {
  fail(5, 'empty-prompt: the prompt file has no text in it after trimming')
}

/* ── 2. The environment ─────────────────────────────────────────────────────────────────────── */

const url = process.env.DATABASE_URL
if (!url) fail(2, 'needs DATABASE_URL — run with --env-file=.env.local')
const parsedUrl = new URL(url)
if (!parsedUrl.host.endsWith('neon.tech')) {
  fail(2, `DATABASE_URL does not point at Neon (host: ${parsedUrl.host})`)
}

const require = createRequire(import.meta.url)
const { neon } = require('@neondatabase/serverless') as { neon: (u: string) => NeonSql }
const sql = neon(url)

/* ── 3. The fragment → exactly one image job, or a refusal ────────────────────────────────────
 *
 * `deleted_at is null` mirrors `reopenNinaImageJob`'s own `WHERE`: a job the runner hid from
 * `/nina/jobs` must not be redoable from a stale link, so it reads as `not-found`, identically to
 * one that never existed. */
const matches = (await sql`
  select id, user_id, status, args, created_at
  from nina_turns
  where kind = 'image' and deleted_at is null and strpos(id, ${fragment}::text) > 0
  order by created_at desc
  limit ${MAX_LISTED_MATCHES + 1}
`) as Array<{
  id: string
  user_id: string
  status: string
  args: Partial<NinaImageJobArgs> | null
  created_at: string
}>

if (matches.length === 0) {
  fail(3, `no (non-hidden) image job has an id containing ${JSON.stringify(fragment)}`, {
    fragment,
  })
}
if (matches.length > 1) {
  const listed = matches.slice(0, MAX_LISTED_MATCHES).map((row) => ({
    id: row.id,
    status: row.status,
    createdAt: row.created_at,
    scene: typeof row.args?.scene === 'string' ? row.args.scene : null,
  }))
  fail(
    4,
    `${JSON.stringify(fragment)} names ${matches.length > MAX_LISTED_MATCHES ? `more than ${MAX_LISTED_MATCHES}` : matches.length} image jobs — give more of the id`,
    { fragment, matches: listed },
  )
}

const job = matches[0]!

/* ── 4. The four refusals, in `reopenNinaImageJob`'s own order — cheapest first, cap last ────── */

// R2's rule, unchanged: a job still queued/dispatched/running is not this script's to touch —
// `reviveNinaImageJobs`/`claimNinaImageJob` (or a second run of this script once it finishes) own
// retrying it.
if (job.status === 'pending') {
  fail(6, `job ${job.id} is still 'pending' — it is mid-flight, not failed or done`, {
    jobId: job.id,
    status: job.status,
  })
}

if (job.args == null || typeof job.args !== 'object') {
  fail(7, `job ${job.id} has no args to redo from`, { jobId: job.id })
}

const nextArgs: NinaImageJobArgs = {
  ...(job.args as NinaImageJobArgs),
  prompt: newPrompt,
  sidecar: replaceSidecarPrompt(
    typeof job.args.sidecar === 'string' ? job.args.sidecar : '',
    newPrompt,
  ),
}

if (!isRedoableArgs(nextArgs)) {
  fail(7, `job ${job.id}'s args have no numeric seed to redo with`, { jobId: job.id })
}

const dayStart = jakartaDayStart()
const usedRows = (await sql`
  select count(*)::int as used
  from nina_turns
  where user_id = ${job.user_id} and kind = 'image' and created_at >= ${dayStart.toISOString()}
`) as Array<{ used: number }>
const used = usedRows[0]?.used ?? 0
const cap = ninaImageDailyCap()
if (used >= cap) {
  fail(8, `today's image cap is spent (${used}/${cap}) — the redo would be refused, not queued`, {
    jobId: job.id,
    used,
    cap,
  })
}

/* ── 5. Dry run stops here — everything above is read-only ───────────────────────────────────── */

if (dryRun) {
  emit(
    {
      ok: true,
      dryRun: true,
      originalJobId: job.id,
      promptChanged: nextArgs.prompt !== job.args.prompt,
      oldPrompt: typeof job.args.prompt === 'string' ? job.args.prompt : null,
      newPrompt: nextArgs.prompt,
      quota: { used, cap, left: cap - used },
      note: 'no UPDATE, no INSERT, no model call was made — pass without --dry-run to actually redo',
    },
    0,
  )
}

/* ── 6. `setNinaImageJobPrompt`'s UPDATE — the OLD row, edited in place ───────────────────────── */

await sql`
  update nina_turns set args = ${JSON.stringify(nextArgs)}::jsonb
  where id = ${job.id} and kind = 'image' and deleted_at is null
`

/* ── 7. `openNinaImageJob`'s INSERT — a NEW row, `attempts: 0`, the old one untouched ─────────── */

const newJobId = newId()
await sql`
  insert into nina_turns
    (id, user_id, kind, model, prompt_version, tool_calls, status, error_code, args, created_at)
  values (
    ${newJobId},
    ${job.user_id},
    'image',
    ${coerceNinaImageModel(nextArgs.model)},
    null,
    'generate_image',
    'pending',
    'queued',
    ${JSON.stringify({ ...nextArgs, attempts: 0 })}::jsonb,
    now()
  )
`

console.error(`[redo] opened ${newJobId} from ${job.id}, running it now…`)

/* ── 8. Run it — draining the SAME retry budget the cron backstop would, synchronously ────────── */

const attempts: Array<{ result: string }> = []
let outcome: 'none' | 'ok' | 'retry' | 'gave-up' = 'none'
for (let i = 0; i < NINA_IMAGE_MAX_ATTEMPTS; i++) {
  outcome = await runOneJob(sql, newJobId)
  attempts.push({ result: outcome })
  if (outcome !== 'retry') break
}

/* ── 9. The report — including the photograph, when there is one ─────────────────────────────── */

let image: {
  messageId: string
  blobUrl: string
  width: number | null
  height: number | null
} | null = null

if (outcome === 'ok') {
  const replyRows = (await sql`
    select id from nina_messages where turn_id = ${newJobId} and photo_only = true
  `) as Array<{ id: string }>
  if (replyRows.length > 0) {
    const imageRows = (await sql`
      select message_id, blob_url, width, height
      from nina_message_images
      where message_id = ${replyRows[0]!.id}
    `) as Array<{
      message_id: string
      blob_url: string
      width: number | null
      height: number | null
    }>
    if (imageRows.length > 0) {
      const row = imageRows[0]!
      image = {
        messageId: row.message_id,
        blobUrl: row.blob_url,
        width: row.width,
        height: row.height,
      }
    }
  }
}

/* The LAST attempt's own detail — see the header note on why this comes from the intercepted
 * `console.warn` and not `nina_error_logs`, which the worker path never writes to. */
const rawProviderError =
  failureDetails.length > 0 ? failureDetails[failureDetails.length - 1]! : null

emit(
  {
    ok: outcome === 'ok',
    dryRun: false,
    originalJobId: job.id,
    newJobId,
    prompt: newPrompt,
    attempts,
    outcome,
    image,
    rawProviderError,
  },
  outcome === 'ok' ? 0 : 1,
)
