// /pull-photoshop-job — pull one photoshop job, the photo it operated on, and (for a failed job)
// the provider's own rejection text, for Run Insights.
//
//   node --experimental-strip-types --no-warnings --env-file=.env.local \
//     scripts/pull-photoshop-job.mjs 36dgjXXXXXXX 'wrong result, please check'
//
// The FIRST argument is a fragment of either id printed on the /admin/error-logs Photoshop tab
// or under a photo on /admin/photoshop/[source]/[id]: the JOB id or the SOURCE PHOTO id — this
// script matches BOTH columns, because either one is what a runner actually has in hand to paste.
// EVERY argument after it is joined into the complaint text; it may be empty.
//
// READ-ONLY: SELECTs only. No UPDATE, no DELETE, no Blob call — blobUrl fields are reported as
// plain strings so the SKILL fetches and views the photographs itself. This script gathers; a fix
// (a different model, a different instruction, a re-run via /photoshop) is a separate,
// explicitly-asked-for step.
//
// ── WHY THE PROVIDER-ERROR JOIN IS EXACT HERE, UNLIKE `pull-image-gen-job.mjs` ─────────────────
// That script joins `nina_error_logs` by `full_input = job.prompt`, a fragile match with no id in
// common between the two tables — the only option available when `logNinaError` was written for a
// pipeline `nina_error_logs` predates. Photoshop's failure path writes `job_id` directly onto every
// row it logs, so this script joins on it exactly, with no window for a false match.
//
// No import from `lib/nina/` or `lib/admin/`, on purpose — the same constraint
// `pull-image-gen-job.mjs`'s header states: everything past the schema types goes through `@/`
// aliases, which a plain `node --experimental-strip-types` run cannot resolve.

const ID_FRAGMENT_RE = /^[0-9A-Za-z_-]{1,12}$/
const MAX_LISTED_MATCHES = 25

function emit(payload, exitCode) {
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`)
  process.exit(exitCode)
}

function fail(exitCode, error, extra = {}) {
  console.error(`FAIL  ${error}`)
  emit({ ok: false, error, ...extra }, exitCode)
}

/* ── 1. The arguments ───────────────────────────────────────────────────────────────────────── */

const argv = process.argv.slice(2)
if (argv.length < 1) {
  fail(
    2,
    "usage: pull-photoshop-job.mjs <job-or-image-id-fragment> [complaint…]   e.g.  36dgj 'wrong result'",
  )
}

const fragment = argv[0].replace(/^#/, '').trim()
const complaint = argv.slice(1).join(' ').trim()

if (!ID_FRAGMENT_RE.test(fragment)) {
  fail(
    2,
    `${JSON.stringify(fragment)} is not a fragment of an id: ids are 1-12 symbols from [0-9A-Za-z_-] ` +
      "(lib/id.ts). A leading '#' is stripped for you; nothing else is.",
  )
}

/* ── 2. The environment ─────────────────────────────────────────────────────────────────────── */

const url = process.env.DATABASE_URL
if (!url) fail(2, 'needs DATABASE_URL — run with --env-file=.env.local')
const parsedUrl = new URL(url)
if (!parsedUrl.host.endsWith('neon.tech')) {
  fail(2, `DATABASE_URL does not point at Neon (host: ${parsedUrl.host})`)
}

const { neon } = await import('@neondatabase/serverless')
const sql = neon(url)

/* ── 3. The fragment → exactly one photoshop job, matched on EITHER id ────────────────────────── */

const matches = await sql`
  select id, user_id, source_kind, source_id, source_content_hash, mode, model, preset_key,
         prompt_text, status, error_code, attempts, cost_micro_usd, result_blob_url,
         result_pathname, result_content_hash, result_width, result_height, result_bytes,
         resolved_action, resolved_at, created_at
  from nina_photoshop_jobs
  where strpos(id, ${fragment}::text) > 0 or strpos(source_id, ${fragment}::text) > 0
  order by created_at desc
  limit ${MAX_LISTED_MATCHES + 1}
`

if (matches.length === 0) {
  fail(3, `no photoshop job or source photo has an id containing ${JSON.stringify(fragment)}`, {
    fragment,
  })
}
if (matches.length > 1) {
  const listed = matches.slice(0, MAX_LISTED_MATCHES).map((row) => ({
    id: row.id,
    sourceId: row.source_id,
    status: row.status,
    createdAt: row.created_at,
    promptText: row.prompt_text,
  }))
  fail(
    4,
    `${JSON.stringify(fragment)} names ${matches.length > MAX_LISTED_MATCHES ? `more than ${MAX_LISTED_MATCHES}` : matches.length} photoshop jobs — give more of the id`,
    { fragment, matches: listed },
  )
}

const job = matches[0]

/* ── 4. The source photo — whichever collection it came from ──────────────────────────────────── */

let source = null
if (job.source_kind === 'avatar') {
  const rows = await sql`
    select id, blob_url, folder, source, content_hash, width, height
    from nina_avatars where id = ${job.source_id}
  `
  source = rows[0] ? { collection: 'album', ...rows[0] } : null
} else {
  const rows = await sql`
    select id, blob_url, kind, content_hash, width, height
    from nina_message_images where id = ${job.source_id}
  `
  source = rows[0] ? { collection: 'chat', ...rows[0] } : null
}

/* ── 5. The result photo's home, when the job succeeded and was resolved ─────────────────────── */

let addedAvatar = null
if (job.resolved_action === 'added') {
  const rows = await sql`
    select id, blob_url, folder from nina_avatars where source_key = ${`photoshop:${job.id}`}
  `
  addedAvatar = rows[0] ?? null
}

/* ── 6. The provider's own words, for every failed attempt — exact join on job_id ─────────────── */

const rawProviderErrors = await sql`
  select error_message, timeout_ms, created_at
  from nina_error_logs
  where category = 'photoshop' and job_id = ${job.id}
  order by created_at asc
`

/* ── 7. The report ─────────────────────────────────────────────────────────────────────────────── */

emit(
  {
    ok: true,
    fragment,
    complaint: complaint === '' ? null : complaint,
    job: {
      id: job.id,
      sourceKind: job.source_kind,
      sourceId: job.source_id,
      mode: job.mode,
      model: job.model,
      presetKey: job.preset_key,
      promptText: job.prompt_text,
      status: job.status,
      errorCode: job.error_code,
      attempts: job.attempts,
      costMicroUsd: job.cost_micro_usd,
      resultBlobUrl: job.result_blob_url,
      resultWidth: job.result_width,
      resultHeight: job.result_height,
      resolvedAction: job.resolved_action,
      resolvedAt: job.resolved_at,
      createdAt: job.created_at,
    },
    source,
    addedAvatar,
    rawProviderErrors: rawProviderErrors.map((r) => ({
      errorMessage: r.error_message,
      timeoutMs: r.timeout_ms,
      createdAt: r.created_at,
    })),
    fetchInstructions:
      'MANDATORY: curl source.blob_url, and job.resultBlobUrl when non-null, into this session’s ' +
      'scratchpad and Read both — do not diagnose from text alone. Save with the extension already ' +
      'in the URL; never re-upload either image anywhere.',
  },
  0,
)
