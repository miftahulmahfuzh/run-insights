// /pull-image-gen-job — pull one Nina image-generation job, the chat that triggered it, and (for a
// successful job) the photograph it produced, so a runner's complaint about a photo can be
// diagnosed against the exact prompt that was sent rather than a screenshot and a guess.
//
//   node --experimental-strip-types --no-warnings --env-file=.env.local \
//     scripts/pull-image-gen-job.mjs HIiyRr5_zemf 'wrong angle, please check'
//
// The FIRST argument is the job id or any fragment of one (a leading '#' is stripped). EVERY
// argument after it is joined with single spaces into the complaint text — it may be empty (no
// complaint given, just "pull this job").
//
// READ-ONLY: SELECTs only. No UPDATE, no DELETE, no Blob call — `image.blobUrl` is reported as a
// plain string so the SKILL can fetch and view the photograph itself; this script never GETs it.
// This script gathers; the diagnosis and any prompt fix are a separate, explicitly-asked-for step
// (see `.claude/skills/pull-image-gen-job/SKILL.md`), the same division `search-analysis.mjs` draws
// between reporting and editing.
//
// ── WHY THE JOB, THE SESSION AND THE IMAGE ARE THREE SEPARATE JOINS, NOT ONE QUERY ────────────────
// A `nina_turns` row (`kind = 'image'`) knows the prompt it sent and the scene/pose/angle arguments
// that built it, but nothing about the conversation — `args.sourceMessageId` is the one thread back
// to a `nina_messages` row, and it is NULL for a promise-sweep-triggered photo (nobody asked in
// chat), so that join is optional. The photograph is a THIRD hop, not a second: `finishSelfie`
// (`lib/nina/imagerun.ts`) writes exactly one `nina_messages` row with `turn_id = <job id>` and
// `photo_only = true` — the caption bubble — and `nina_message_images.message_id` points at THAT
// row, never at the job directly. So "pull the image for job X" is `nina_turns` -> (by `turn_id`)
// `nina_messages` -> (by `message_id`) `nina_message_images`, and skipping the middle hop by
// grabbing "the user's most recently generated image" is only correct for the single most recent
// job in the whole app — wrong for anything this tool is actually for.
//
// No import from `lib/nina/`, on purpose: everything there past the schema types goes through
// `@/` aliases (`lib/nina/imagegen.ts` imports `@/lib/nina/persona`, and so on down), which a plain
// `node --experimental-strip-types` run cannot resolve — the same constraint
// `scripts/search-analysis.mjs`'s header states for `avatarEmbedText.ts`. `job.prompt` below is
// the historical record of what was actually sent; that is authoritative on its own and needs no
// re-render to be useful.

/* `lib/id.ts`'s alphabet, 1..12 symbols — the same guard `search-analysis.mjs` uses. */
const ID_FRAGMENT_RE = /^[0-9A-Za-z_-]{1,12}$/
/* More than this many matches and the fragment is useless as a name; the list is for a human to
 * pick from, not to read in full. */
const MAX_LISTED_MATCHES = 25
/* Conversational context either side of the message that triggered the job, by `seq` — generous
 * enough to catch a multi-bubble Nina reply and the runner's own follow-up, short enough to stay
 * readable. The exact reply is found separately, by `turn_id`, regardless of this window. */
const CONTEXT_BEFORE = 6
const CONTEXT_AFTER = 16

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
    "usage: pull-image-gen-job.mjs <job-id-fragment> [complaint…]   e.g.  HIiyRr5_zemf 'wrong angle'",
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

/* ── 3. The fragment → exactly one image job, or a refusal ──────────────────────────────────—
 *
 * `strpos` and not `LIKE '%…%'` — `lib/id.ts`'s alphabet includes `_`, a LIKE wildcard, so a `LIKE`
 * fragment can match a row it should not (`search-analysis.mjs`'s own argument, unchanged here).
 * `kind = 'image'` only: `nina_turns` also carries chat/proactive/vision rows, none of which this
 * tool has anything to say about. */
const matches = await sql`
  select id, user_id, status, error_code, args, created_at
  from nina_turns
  where kind = 'image' and strpos(id, ${fragment}::text) > 0
  order by created_at desc
  limit ${MAX_LISTED_MATCHES + 1}
`

if (matches.length === 0) {
  fail(3, `no image job has an id containing ${JSON.stringify(fragment)}`, { fragment })
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

const job = matches[0]
const args = job.args ?? {}

/* ── 4. The chat that triggered it, when one exists ─────────────────────────────────────────—
 *
 * `args.sourceMessageId` is NULL for a promise-sweep photo — nobody asked in chat, so there is no
 * session and no conversation to pull. That is a legitimate answer, not a failure. */
let session = null
let triggerMessage = null
let conversation = []

if (typeof args.sourceMessageId === 'string') {
  const triggerRows = await sql`
    select id, session_id, role, text, seq
    from nina_messages
    where id = ${args.sourceMessageId}
  `
  triggerMessage = triggerRows[0] ?? null

  if (triggerMessage != null) {
    const sessionRows = await sql`
      select id, created_at
      from nina_chat_sessions
      where id = ${triggerMessage.session_id}
    `
    session = sessionRows[0] ?? null

    const seq = Number(triggerMessage.seq)
    const windowRows = await sql`
      select id, role, text, source, turn_id, seq
      from nina_messages
      where session_id = ${triggerMessage.session_id}
        and seq between ${seq - CONTEXT_BEFORE} and ${seq + CONTEXT_AFTER}
      order by seq asc
    `
    conversation = windowRows.map((row) => ({
      id: row.id,
      role: row.role,
      text: row.text,
      seq: Number(row.seq),
      linkedToJob: row.turn_id === job.id,
    }))
  }
}

/* ── 5. The photograph — only ever expected for a job that actually finished ─────────────────—
 *
 * `jobStage`'s rule (`lib/nina/jobview.ts`): 'ok' or 'repaired' is done, everything else ('pending',
 * 'failed') is not. `finishSelfie` writes exactly one `nina_messages` row with `turn_id = job.id`
 * (`photo_only = true`); `nina_message_images.message_id` points at THAT row's id, never at the job.
 *
 * `purpose === 'avatar'` has NO such join at all: `finishAvatar` (`lib/nina/imagerun.ts`) writes
 * straight to `nina_avatars` — no `nina_messages` row, no `turn_id` column on `nina_avatars` either
 * — "nobody asked in chat" by that function's own header. So an avatar job's photograph cannot be
 * resolved exactly; it is reported as a known gap rather than guessed at from `created_at`/`scene`
 * proximity, on `search-analysis.mjs`'s rule: ask (or here, say so), never pick.
 */
const isDone = job.status === 'ok' || job.status === 'repaired'
let image = null
let imageNote = null

if (!isDone) {
  imageNote =
    job.status === 'failed'
      ? `job status is 'failed' (error_code=${job.error_code ?? 'null'}) — no photograph was generated`
      : `job status is '${job.status}' — not finished yet, no photograph to pull`
} else if (args.purpose === 'avatar') {
  imageNote =
    'job status is done, but this is an avatar job: finishAvatar writes straight to nina_avatars ' +
    'with no turn_id column and no nina_messages row, so there is no exact join back to it from ' +
    'the job. Check /admin/nina (the current avatar, or the folder it was filed under) by eye.'
} else {
  const replyRows = await sql`
    select id from nina_messages where turn_id = ${job.id} and photo_only = true
  `
  if (replyRows.length === 0) {
    imageNote =
      'job status is done but no linked message (turn_id = job.id, photo_only = true) was found — ' +
      'the row may predate that convention, or something is wrong'
  } else {
    const imageRows = await sql`
      select id, message_id, blob_url, prompt, width, height, created_at
      from nina_message_images
      where message_id = ${replyRows[0].id}
    `
    if (imageRows.length === 0) {
      imageNote = 'job status is done and the reply message exists, but it carries no image row'
    } else {
      const row = imageRows[0]
      image = {
        messageId: row.message_id,
        blobUrl: row.blob_url,
        width: row.width,
        height: row.height,
        createdAt: row.created_at,
        /* The image row's OWN sidecar, echoed for a byte-for-byte check against `job.prompt` below
         * — the two are written independently and should always agree; a mismatch is itself a bug. */
        sidecar: row.prompt,
      }
    }
  }
}

/* ── 6. The report ─────────────────────────────────────────────────────────────────────────—— */

emit(
  {
    ok: true,
    fragment,
    complaint: complaint.length > 0 ? complaint : null,
    job: {
      id: job.id,
      status: job.status,
      errorCode: job.error_code,
      createdAt: job.created_at,
      purpose: args.purpose ?? null,
      model: args.model ?? null,
      seed: args.seed ?? null,
      scene: args.scene ?? null,
      mood: args.mood ?? null,
      outfit: args.outfit ?? null,
      pose: args.pose ?? null,
      ootd: args.ootd ?? null,
      angle: args.angle ?? null,
      referenceUrl: args.referenceUrl ?? null,
      /* The exact prompt sent to the provider for THIS job — the historical record. */
      prompt: args.prompt ?? null,
      sidecar: args.sidecar ?? null,
    },
    session,
    triggerMessage,
    conversation,
    image,
    imageNote,
  },
  0,
)
