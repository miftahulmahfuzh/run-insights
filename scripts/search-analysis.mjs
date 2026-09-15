// /search-analysis — why did THIS photograph rank where it did for THAT query?
//
//   node --experimental-strip-types --no-warnings --env-file=.env.local \
//     scripts/search-analysis.mjs 'tete' Rm2NG
//   npm run nina:search-analysis -- 'string bra' '#Rm2NG'
//
// The LAST argument is the image id or any fragment of one (a leading '#' is stripped, because the
// viewer header renders '#<id> · <score>' and an operator copies what he sees). EVERY argument
// before it is joined with single spaces into the query text, so a multi-word query needs no quotes
// — though quoting it is clearer.
//
// READ-ONLY: two SELECTs and one /embeddings POST. No UPDATE, no DELETE, no Blob call. This script
// diagnoses; the edits are made by hand in /admin/nina, which is the whole point of the skill that
// drives it (`.claude/skills/search-analysis/SKILL.md`).
//
// WHY IT EXISTS — and why it cannot just call the app's search. `searchNinaAvatarsByText`
// (`lib/nina/queries/avatarsearch.ts`) passes every request through `clampLimit`, which caps the
// page at NINA_SEARCH_LIMIT = 48, and through `rankByDistance`, which cuts every row under
// NINA_SEARCH_MIN_SCORE = 0.2. Those are exactly the two mechanisms that HIDE the answer: an image
// the operator is asking about is usually one the app either did not show him or showed him at a
// position he wants explained. So this reproduces the scoring EXACTLY — same column, same `<=>`
// cosine distance, same `1 - distance` similarity, same JSON.stringify vector encoding, same
// (created_at desc, id desc) tiebreak, same user scope — with NO limit and NO floor, and then
// REPORTS the row's true rank against both constants instead of applying them.
//
// ── WHAT IS IMPORTED AND WHAT IS DUPLICATED, AND WHY ────────────────────────────────────────────
// IMPORTED: `buildNinaAvatarEmbedText` from `../lib/nina/avatarEmbedText.ts`. The report's
// `embeddedText` field claims to be the exact string this row's vector was computed from; a locally
// retyped join would make that field a claim about this file's copy instead, and it would keep
// looking right while being wrong about the one thing the report is consulted for. That module is
// deliberately zero-import so `--experimental-strip-types` can load it — the rule
// `scripts/backfill-record-keys.mjs` and `scripts/nina-shortcuts-import.mjs` already state and obey.
//
// DUPLICATED (the `scripts/album-search-probe.mjs` convention, with that file's warning repeated):
// the embeddings URL, the model id, and the SQL. `lib/nina/embedding.ts` opens with
// `import 'server-only'`, reads the zod env group and imports `@/lib/db/schema` through a `@/`
// alias, none of which survives a plain node run. The source of truth for the model remains
// `lib/nina/openrouter.ts` — if it ever migrates, this copy must move with it or this script scores
// a space the album is not stored in.
//
// ALSO DUPLICATED, AND ON PURPOSE: NINA_SEARCH_LIMIT and NINA_SEARCH_MIN_SCORE below. They are
// module-private in avatarsearch.ts (the barrel's test pins that every runtime export is a
// function), so they cannot be imported, and without them "rank 61, score 0.1842" is a number
// rather than a diagnosis. They are echoed into the report so a reader can check the copy against
// the source in one glance. They are NEVER applied to the query.
//
// `matchesNegativeKeyword` below is the THIRD such duplicate, added with
// `nina-album-search-relevance-tools` R2's follow-up (2026-09-15): `negative_search_keywords` is a
// third gate the app applies and this report must account for, or `wouldAppearInApp` would read
// `true` for a row the app is actually hiding. It is copied rather than imported for the same
// module-private reason and kept byte-for-byte in step with `avatarsearch.ts`'s own copy.
import { buildNinaAvatarEmbedText } from '../lib/nina/avatarEmbedText.ts'

const EMBEDDINGS_URL = 'https://openrouter.ai/api/v1/embeddings'
const EMBEDDING_MODEL = 'openai/text-embedding-3-small'

/* Mirrors of `lib/nina/queries/avatarsearch.ts:64` and `:100`. Reported, never applied. */
const NINA_SEARCH_LIMIT = 48
const NINA_SEARCH_MIN_SCORE = 0.2

/* Mirror of `matchesNegativeKeyword` in `lib/nina/queries/avatarsearch.ts` — whole-word,
 * case-insensitive, comma-split. Reported, never applied differently than the app applies it: the
 * point here is not to skip the gate, it is to know whether it fired. */
function matchesNegativeKeyword(queryText, negativeSearchKeywords) {
  if (negativeSearchKeywords == null) return false
  const query = queryText.toLowerCase()
  return negativeSearchKeywords
    .split(',')
    .map((phrase) => phrase.trim())
    .filter((phrase) => phrase.length > 0)
    .some((phrase) => {
      const escaped = phrase.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      return new RegExp(`\\b${escaped}\\b`, 'i').test(query)
    })
}

/* `lib/id.ts`'s alphabet, 1..12 symbols. A fragment outside it cannot be part of any id we mint, so
 * it is a typo and is refused before a round trip. */
const ID_FRAGMENT_RE = /^[0-9A-Za-z_-]{1,12}$/
/* How much of a competitor's prose the comparison table carries. Enough to judge semantic overlap,
 * short enough that ten of them stay readable. The TARGET's description is never truncated. */
const SNIPPET_CHARS = 240
const TOP_N = 10
/* Ranks either side of the target, so "what did it just lose to" has an answer even at rank 61. */
const NEIGHBOURS = 3
/* More than this many matches and the fragment is useless as a name; the list is for the operator
 * to pick from, not to read. */
const MAX_LISTED_MATCHES = 25

/**
 * Every exit path writes ONE JSON document to stdout and one human line to stderr. The consumer is
 * an agent reading a tool result: interleaved prose and JSON is a parse hazard, and a failure that
 * prints only English leaves it nothing structured to act on.
 */
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
if (argv.length < 2) {
  fail(
    2,
    "usage: search-analysis.mjs <query…> <id-fragment>   e.g.  'tete' Rm2NG   or  string bra '#Rm2NG'",
  )
}

const fragment = argv[argv.length - 1].replace(/^#/, '').trim()
const query = argv.slice(0, -1).join(' ').trim()

if (query.length === 0) fail(2, 'the query text is empty — it is every argument but the last')
if (!ID_FRAGMENT_RE.test(fragment)) {
  fail(
    2,
    `${JSON.stringify(fragment)} is not a fragment of an id: ids are 1–12 symbols from [0-9A-Za-z_-] ` +
      "(lib/id.ts). A leading '#' is stripped for you; nothing else is.",
  )
}

/* ── 2. The environment — the probe's guards, verbatim, for the probe's reasons ─────────────── */

const url = process.env.DATABASE_URL
if (!url) fail(2, 'needs DATABASE_URL — run with --env-file=.env.local')
const parsedUrl = new URL(url)
if (!parsedUrl.host.endsWith('neon.tech')) {
  fail(2, `DATABASE_URL does not point at Neon (host: ${parsedUrl.host})`)
}
const apiKey = process.env.OPENROUTER_API_KEY
if (!apiKey) fail(2, 'needs OPENROUTER_API_KEY — run with --env-file=.env.local')

const { neon } = await import('@neondatabase/serverless')
const sql = neon(url)

/* ── 3. The fragment → exactly one row, or a refusal ────────────────────────────────────────—
 *
 * `strpos(id, $1) > 0` and NOT `id LIKE '%' || $1`. The id alphabet includes `_`
 * (`lib/id.ts:11`), which is ALSO a LIKE single-character wildcard — so `LIKE '%a_c'` would match
 * `abc` and `axc` as well as `a_c`, and the ambiguity guard below would either refuse a fragment
 * that genuinely names one row or, worse, single out the wrong one. `strpos` has no metacharacters.
 *
 * Substring rather than suffix, because the viewer header renders the FULL id
 * (`SearchResultsGrid.tsx:70`, `#${hit.id} · ${score}`), so what an operator pastes is normally a
 * PREFIX — `#Rm2NG..` in the requirement is a human eliding the tail. Substring covers prefix,
 * suffix and interior alike, and the refusals below are what make the widening safe: a fragment
 * that names two rows is reported, never guessed at.
 *
 * NOT scoped to a user: the operator names a photograph, not an owner. The user scope is applied to
 * the RANKING below, taken from whichever row this resolves to. */
const matches = await sql`
  select id, user_id, folder, filename, description, search_keywords, negative_search_keywords,
         (description_embedding is not null) as has_embedding
  from nina_avatars
  where strpos(id, ${fragment}::text) > 0
  order by created_at desc, id desc
  limit ${MAX_LISTED_MATCHES + 1}
`

if (matches.length === 0) {
  fail(3, `no row in nina_avatars has an id containing ${JSON.stringify(fragment)}`, {
    fragment,
    query,
  })
}
if (matches.length > 1) {
  const listed = matches.slice(0, MAX_LISTED_MATCHES).map((row) => ({
    id: row.id,
    folder: row.folder === '' ? '(root)' : row.folder,
    filename: row.filename,
  }))
  fail(
    4,
    `${JSON.stringify(fragment)} names ${matches.length > MAX_LISTED_MATCHES ? `more than ${MAX_LISTED_MATCHES}` : matches.length} rows — give more of the id`,
    { fragment, query, matches: listed },
  )
}

const target = matches[0]

/* ── 4. The query vector — the app's model, the app's endpoint ──────────────────────────────—
 *
 * The QUERY is embedded ALONE. `search_keywords` is an input to the text a ROW's vector is computed
 * from (Phase 2's `buildNinaAvatarEmbedText`), never something a query is concatenated with: the
 * combining happens on the stored side, at write time. Embedding the query with anything appended
 * would score a question nobody asked. */

async function embed(text) {
  const res = await fetch(EMBEDDINGS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model: EMBEDDING_MODEL, input: text, encoding_format: 'float' }),
  })
  const raw = await res.text()
  if (!res.ok) throw new Error(`embeddings ${res.status}: ${raw.slice(0, 200)}`)
  const vector = JSON.parse(raw)?.data?.[0]?.embedding
  if (!Array.isArray(vector) || vector.length === 0) {
    throw new Error(`embeddings returned no vector for ${JSON.stringify(text)}`)
  }
  return vector
}

let queryVector
try {
  queryVector = JSON.stringify(await embed(query))
} catch (cause) {
  fail(5, `could not embed the query: ${String(cause)}`, { fragment, query })
}

/* ── 5. The ranking — the app's SQL with the limit and the floor removed ────────────────────—
 *
 * `ORDER BY embedding <=> $q ASC` is the spelling the pgvector HNSW index answers, and the
 * projection computes `1 - distance` because the human-facing number is the similarity — both
 * exactly as `rankByDistance` does it. The tiebreak `(created_at desc, id desc)` is copied too, so
 * a rank printed here is the same integer the operator saw in the grid; without it two identical
 * descriptions swap places between the app and this report for no reason.
 *
 * No LIMIT, no score predicate. That absence IS this script. */
const ranked = await sql`
  select id, folder, filename, description, search_keywords,
         1 - (description_embedding <=> ${queryVector}::vector) as score
  from nina_avatars
  where user_id = ${target.user_id}
    and description_embedding is not null
  order by description_embedding <=> ${queryVector}::vector asc,
           created_at desc,
           id desc
`

/* ── 6. Where the target landed, and whether the app would have shown it ────────────────────— */

const targetIndex = ranked.findIndex((row) => row.id === target.id)
const rank = targetIndex === -1 ? null : targetIndex + 1
const score = targetIndex === -1 ? null : Number(ranked[targetIndex].score)

const cutBy = []
if (!target.has_embedding) {
  cutBy.push(
    'no vector: description_embedding IS NULL, so this row is not a search candidate at all. ' +
      'It has never been embedded, or an edit nulled the vector and the re-embed has not landed yet.',
  )
} else if (rank === null) {
  /* Belt and braces: has_embedding was read in an earlier statement than the ranking. */
  cutBy.push(
    'the row carries a vector but did not appear in the ranking — re-run; the column changed underneath',
  )
} else {
  if (rank > NINA_SEARCH_LIMIT) {
    cutBy.push(`page limit: rank ${rank} is past NINA_SEARCH_LIMIT (${NINA_SEARCH_LIMIT})`)
  }
  if (score < NINA_SEARCH_MIN_SCORE) {
    cutBy.push(
      `relevance floor: score ${score.toFixed(4)} is under NINA_SEARCH_MIN_SCORE (${NINA_SEARCH_MIN_SCORE})`,
    )
  }
  if (matchesNegativeKeyword(query, target.negative_search_keywords)) {
    cutBy.push(
      `negative keyword: negative_search_keywords ${JSON.stringify(target.negative_search_keywords)} ` +
        `matches a whole word in the query ${JSON.stringify(query)}`,
    )
  }
}

const snippet = (text) =>
  text == null ? null : text.length <= SNIPPET_CHARS ? text : `${text.slice(0, SNIPPET_CHARS)}…`

const asRow = (row, index) => ({
  rank: index + 1,
  id: row.id,
  folder: row.folder === '' ? '(root)' : row.folder,
  filename: row.filename,
  score: Number(Number(row.score).toFixed(4)),
  descriptionSnippet: snippet(row.description),
  searchKeywords: row.search_keywords,
})

/* The ten best rows that are NOT the target — "what beat it" is the comparison the inference is
 * written from. */
const top = ranked
  .map(asRow)
  .filter((row) => row.id !== target.id)
  .slice(0, TOP_N)

/* And the handful either side of it, because at rank 61 the top ten explain the query and the
 * neighbours explain the position. */
const neighbours =
  rank === null
    ? []
    : ranked.map(asRow).slice(Math.max(0, rank - 1 - NEIGHBOURS), rank + NEIGHBOURS)

/* ── 7. The report ─────────────────────────────────────────────────────────────────────────—— */

emit(
  {
    ok: true,
    query,
    fragment,
    model: EMBEDDING_MODEL,
    generatedAt: new Date().toISOString(),
    /* Echoed so a reader can check these copies against lib/nina/queries/avatarsearch.ts:64,100 —
     * a stale copy would produce a confidently wrong verdict and nothing else would say so. */
    appThresholds: {
      limit: NINA_SEARCH_LIMIT,
      minScore: NINA_SEARCH_MIN_SCORE,
      source: 'lib/nina/queries/avatarsearch.ts (module-private; mirrored here, never applied)',
    },
    candidates: ranked.length,
    target: {
      id: target.id,
      folder: target.folder === '' ? '(root)' : target.folder,
      filename: target.filename,
      description: target.description,
      searchKeywords: target.search_keywords,
      negativeSearchKeywords: target.negative_search_keywords,
      /* The exact text this row's vector was computed from — Phase 2's one combine function, not a
       * second spelling of it. `null` when the row has no description to anchor on. */
      embeddedText:
        target.description == null
          ? null
          : buildNinaAvatarEmbedText(target.description, target.search_keywords),
      hasEmbedding: target.has_embedding,
      rank,
      score,
      wouldAppearInApp: cutBy.length === 0,
      cutBy,
    },
    top,
    neighbours,
  },
  0,
)
