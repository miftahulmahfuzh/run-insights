// Embed every ORIGINAL media row that has a description and no vector, through the SAME
// combine-then-embed path the app uses.
//
//   npm run nina:backfill-media-embeddings                 # every row missing a vector
//   npm run nina:backfill-media-embeddings -- --dry-run    # read + report only, no vendor call, no write
//   npm run nina:backfill-media-embeddings -- --limit 20   # the oldest 20 of them
//   npm run nina:backfill-media-embeddings -- --all        # re-embed even rows that already have one
//
// WRITES. It UPDATEs `nina_message_images.description_embedding` and nothing else — it never writes
// prose, never deletes, and never touches `search_keywords`. Re-running it is safe.
//
// WHY IT EXISTS: `media-album-unified-search` R1 makes both tables searchable, and Phase 1 adds this
// column. Every row written before that migration has a NULL vector and is invisible to the merged
// search. MEASURED 2026-09-17: 112 of the 155 rows are originals, and all 112 already carry
// `glm-4.6v` prose from `scheduleChatPhotoCaption` — so the whole backlog is embed-only and this
// script can drain it without a vision model, without a session and without a dev server.
//
// WHY IT IS NOT THE ONLY SURFACE: a row whose caption pass FAILED has no prose, and inventing prose
// is a vision call this script deliberately cannot make. Those rows are skipped here and belong to
// `app/api/admin/nina/backfill-media-descriptions/route.ts`, which can describe them. There are zero
// such rows today; there will be more, because `scheduleChatPhotoCaption` HALF ONE still writes
// prose with no vector (Phase 2's handoff says so).
//
// ── THE SCOPE IS `isOriginalPhoto()`, AND IT MUST STAY THAT WAY ──────────────────────────────
// `source_avatar_id IS NULL AND source_image_id IS NULL`, matching
// `listNinaMessageImageDescribeBacklog` exactly, so this script and the route's `remaining` count
// agree about what "done" means. A REFERENCE row re-shows a photograph that lives elsewhere; the
// merged search ranks the original and never the re-show, so a reference can never carry its own
// vector by design. There are 43 of them (measured 2026-09-17) and embedding them would spend money
// on rows no query will ever rank.
//
// ── WHAT IS IMPORTED AND WHAT IS DUPLICATED, AND WHY ────────────────────────────────────────
// The split is `scripts/backfill-avatar-embeddings.mjs`'s, for its reasons, restated only where they
// differ. IMPORTED: `buildNinaAvatarEmbedText` — the one function whose correctness this script
// exists to exercise, and the reason a media vector is comparable to an album vector at all (the
// merged ranking rests on both corpora being embedded from the same text shape). It is deliberately
// zero-import so `--experimental-strip-types` can load it. DUPLICATED: the embeddings URL, the model
// id, the vector width and the SQL, because `lib/nina/embedding.ts` opens with `import 'server-only'`
// and neither it nor the deferred worker survives a plain node run. If the model or the width
// migrates, this file's copy must move with it.
//
// SEQUENTIAL, one row at a time — a burst against one broker buys minutes and risks a 429 mid-run.
import { buildNinaAvatarEmbedText } from '../lib/nina/avatarEmbedText.ts'

const EMBEDDINGS_URL = 'https://openrouter.ai/api/v1/embeddings'
const EMBEDDING_MODEL = 'openai/text-embedding-3-small'
const EMBEDDING_DIMENSIONS = 1536

const argv = process.argv.slice(2)
const dryRun = argv.includes('--dry-run')
const all = argv.includes('--all')
const limitFlag = argv.indexOf('--limit')
const limit = limitFlag === -1 ? null : Number.parseInt(argv[limitFlag + 1] ?? '', 10)
if (limitFlag !== -1 && (!Number.isInteger(limit) || limit <= 0)) {
  console.error('--limit takes a positive integer')
  process.exit(1)
}

const url = process.env.DATABASE_URL
if (!url) {
  console.error('needs DATABASE_URL — run with --env-file=.env.local')
  process.exit(1)
}
const parsed = new URL(url)
if (!parsed.host.endsWith('neon.tech')) {
  console.error(`FAIL  DATABASE_URL does not point at Neon (host: ${parsed.host})`)
  process.exit(1)
}
const apiKey = process.env.OPENROUTER_API_KEY
if (!apiKey && !dryRun) {
  console.error('needs OPENROUTER_API_KEY — run with --env-file=.env.local (or pass --dry-run)')
  process.exit(1)
}

const { neon } = await import('@neondatabase/serverless')
const sql = neon(url)

/* ── 1. The work ────────────────────────────────────────────────────────────────────────────
 * Oldest first, the sweep order `listNinaMessageImageDescribeBacklog` uses and for its reason: a
 * repeated or interrupted run is monotone and there is no cursor to carry. A NULL description is not
 * read at all — there is nothing to embed, and inventing prose is the route's job, never this
 * script's. */
const rows = await sql`
  select id, user_id, kind, description, search_keywords
  from nina_message_images
  where source_avatar_id is null
    and source_image_id is null
    and description is not null
    ${all ? sql`` : sql`and description_embedding is null`}
  order by created_at asc
  ${limit == null ? sql`` : sql`limit ${limit}`}
`

console.log(
  `${rows.length} original row(s) with prose and ${all ? 'any' : 'no'} vector` +
    `${limit == null ? '' : ` (limit ${limit})`}` +
    `${dryRun ? ' — DRY RUN, nothing will be written' : ''}`,
)

/* ── 2. One embedding per row, sequentially ────────────────────────────────────────────────── */

async function embed(text) {
  const res = await fetch(EMBEDDINGS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model: EMBEDDING_MODEL, input: text, encoding_format: 'float' }),
  })
  const raw = await res.text()
  if (!res.ok) throw new Error(`embeddings ${res.status}: ${raw.slice(0, 200)}`)
  const vector = JSON.parse(raw)?.data?.[0]?.embedding
  if (!Array.isArray(vector)) throw new Error(`embeddings returned no vector: ${raw.slice(0, 200)}`)
  /* The width guard `lib/nina/embedding.ts` argues for, restated for the same reason: a wrong-width
   * vector is a refused UPDATE deep inside a loop, not a worse ranking. */
  if (vector.length !== EMBEDDING_DIMENSIONS) {
    throw new Error(
      `embeddings returned ${vector.length} values; the column is vector(${EMBEDDING_DIMENSIONS}). ` +
        'The model id and the column width must change together, with a full re-embed.',
    )
  }
  return vector
}

let embedded = 0
let failed = 0
let skipped = 0
const failures = []

for (const row of rows) {
  const where = `${row.kind}/${row.id}`
  const text = buildNinaAvatarEmbedText(row.description, row.search_keywords)
  const tagged = row.search_keywords != null && row.search_keywords.trim().length > 0

  if (text.trim().length === 0) {
    /* A description that is only whitespace. Nothing to embed and nothing to fix here: the row is
     * indistinguishable from an undescribed one to the model. */
    skipped += 1
    console.log(`  skip   ${row.id}  ${where}  (description is blank)`)
    continue
  }

  if (dryRun) {
    skipped += 1
    console.log(`  would  ${row.id}  ${where}  ${text.length} chars${tagged ? '  +keywords' : ''}`)
    continue
  }

  try {
    const vector = await embed(text)
    await sql`
      update nina_message_images
      set description_embedding = ${JSON.stringify(vector)}::vector
      where id = ${row.id} and user_id = ${row.user_id}
    `
    embedded += 1
    console.log(`  ok     ${row.id}  ${where}  ${text.length} chars${tagged ? '  +keywords' : ''}`)
  } catch (cause) {
    failed += 1
    failures.push({ id: row.id, where, error: String(cause) })
    /* Non-fatal, the same posture the deferred worker takes: the row keeps whatever vector it had,
     * and the next run picks it up. One vendor hiccup must not abandon a hundred rows. */
    console.log(`  FAIL   ${row.id}  ${where}  ${String(cause).slice(0, 160)}`)
  }
}

/* ── 3. The counts, which are the deliverable ──────────────────────────────────────────────── */

console.log(
  `\nembedded ${embedded} · failed ${failed} · skipped ${skipped} · of ${rows.length} candidate row(s)`,
)
if (failures.length > 0) {
  console.log('failures:')
  for (const f of failures) console.log(`  ${f.id}  ${f.where}  ${f.error.slice(0, 200)}`)
}

/* A non-zero exit on failures, so a wrapper or a re-run loop can see it. A dry run is never a
 * failure. */
process.exit(failed > 0 ? 1 : 0)
