// Re-embed every album row that has a description, through the SAME combine-then-embed path the
// app uses.
//
//   npm run nina:backfill-embeddings                 # the whole album, writes
//   npm run nina:backfill-embeddings -- --dry-run    # read + report only, no vendor call, no write
//   npm run nina:backfill-embeddings -- --limit 20   # the oldest 20 only
//
// WRITES. Two columns' worth of truth depends on it, so unlike `scripts/album-search-probe.mjs`
// this is not a read-only instrument: it UPDATEs `nina_avatars.description_embedding`.
//
// WHY IT EXISTS: `nina-album-search-relevance-tools` R2 adds `search_keywords`, an input to the
// text that becomes the vector. Every existing row has `search_keywords = NULL`, and
// `buildNinaAvatarEmbedText` returns the description unchanged for a NULL — so every already-stored
// vector is NUMERICALLY IDENTICAL to what this run recomputes. That is the point rather than a
// disappointment: the value of this backfill is the PROOF that one combine function governs every
// vector in the table, taken once, at the moment the second input was introduced. A row whose
// keywords were written before this ran gets a genuinely new vector; a row whose keywords are NULL
// gets its own vector back, and that is what "the pipeline is uniform" means.
//
// ── WHAT IS IMPORTED AND WHAT IS DUPLICATED, AND WHY ────────────────────────────────────────
// IMPORTED: `buildNinaAvatarEmbedText` from `../lib/nina/avatarEmbedText.ts`. It is the one thing
// whose correctness this script exists to demonstrate; a local copy of the join would be testing
// its own copy. That module is deliberately zero-import so `--experimental-strip-types` can load it
// — the rule `scripts/backfill-record-keys.mjs` states and obeys.
//
// DUPLICATED (the `album-search-probe.mjs` convention): the embeddings URL, the model id, the
// vector width and the SQL. `lib/nina/embedding.ts` opens with `import 'server-only'`, reads the
// zod env group and imports `@/lib/db/schema` through a path alias; `lib/admin/ninaAlbumDeferredDescribe.ts`
// opens with `import { after } from 'next/server'`. Neither survives a plain node run. The source
// of truth for the model and the width remains `lib/nina/openrouter.ts` and
// `lib/db/schema/nina/avatars.ts` — if either migrates, this file's copy must move with it, or the
// run writes vectors into a space the album is not stored in.
//
// SEQUENTIAL, one row at a time. An album is hundreds of rows and an embedding is a sub-second
// call; a burst of parallel requests against one broker buys minutes and risks a 429 mid-run, and
// a partially-written table is exactly what this script is meant to rule out.
import { buildNinaAvatarEmbedText } from '../lib/nina/avatarEmbedText.ts'

const EMBEDDINGS_URL = 'https://openrouter.ai/api/v1/embeddings'
const EMBEDDING_MODEL = 'openai/text-embedding-3-small'
const EMBEDDING_DIMENSIONS = 1536

const argv = process.argv.slice(2)
const dryRun = argv.includes('--dry-run')
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
 * Oldest first, the sweep order `listNinaAvatarDescribeBacklog` uses and for its reason: a
 * repeated or interrupted run is monotone, and there is no cursor to carry. A NULL description is
 * not read at all — there is nothing to embed, and inventing prose is the describe sweep's job,
 * never this script's. */
const rows = await sql`
  select id, user_id, folder, filename, description, search_keywords
  from nina_avatars
  where description is not null
  order by created_at asc
  ${limit == null ? sql`` : sql`limit ${limit}`}
`

console.log(
  `${rows.length} row(s) carry a description${limit == null ? '' : ` (limit ${limit})`}` +
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
  /* The width guard `lib/nina/embedding.ts` argues for, restated here for the same reason: a
   * wrong-width vector is a refused INSERT deep inside a loop, not a worse ranking. */
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
  const where = `${row.folder === '' ? '(root)' : row.folder}/${row.filename ?? row.id}`
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
      update nina_avatars
      set description_embedding = ${JSON.stringify(vector)}::vector
      where id = ${row.id} and user_id = ${row.user_id}
    `
    embedded += 1
    console.log(`  ok     ${row.id}  ${where}  ${text.length} chars${tagged ? '  +keywords' : ''}`)
  } catch (cause) {
    failed += 1
    failures.push({ id: row.id, where, error: String(cause) })
    /* Non-fatal, the same posture the deferred worker takes: the row keeps whatever vector it had,
     * and the next run picks it up. One vendor hiccup must not abandon four hundred rows. */
    console.log(`  FAIL   ${row.id}  ${where}  ${String(cause).slice(0, 160)}`)
  }
}

/* ── 3. The counts, which are the deliverable ──────────────────────────────────────────────── */

console.log(
  `\nembedded ${embedded} · failed ${failed} · skipped ${skipped} · of ${rows.length} row(s) with a description`,
)
if (failures.length > 0) {
  console.log('failures:')
  for (const f of failures) console.log(`  ${f.id}  ${f.where}  ${f.error.slice(0, 200)}`)
}

/* A non-zero exit on failures, so a wrapper or a re-run loop can see it. A dry run is never a
 * failure. */
process.exit(failed > 0 ? 1 : 0)
