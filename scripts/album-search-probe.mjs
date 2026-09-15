// Album semantic-search probe — the tuning instrument for the similarity threshold.
//
//   node --env-file=.env.local scripts/album-search-probe.mjs 'putih' 'mini dress'
//   node --env-file=.env.local scripts/album-search-probe.mjs            (default battery)
//
// READ-ONLY: two SELECTs, no writes, no Blob calls. The only vendor traffic is one
// /embeddings request per query, same model the search action uses.
//
// WHY THIS EXISTS: the search returns a ranked top-48 for every query with no relevance
// cutoff (`lib/nina/queries/avatarsearch.ts`), and picking the ONE similarity value that
// separates relevant from irrelevant needs the full score distribution, not the UI's 48
// tiles. This script reproduces the search's scoring exactly — same column, same `<=>`
// cosine distance, same `1 - distance` similarity, same JSON.stringify vector encoding —
// but returns EVERY embedded row ranked, per query, plus the largest consecutive score
// gaps where a threshold could sit.
//
// The constants below are spelled twice on purpose: scripts/ is outside the
// check-openrouter-boundary grep, and a probe that imports `lib/nina/embedding.ts` would
// drag `server-only` and the zod env group into a plain node run. The source of truth for
// both values remains `lib/nina/openrouter.ts` — if the model ever migrates, this file's
// copy must move with it or the probe scores a space the album is not stored in.

const EMBEDDINGS_URL = 'https://openrouter.ai/api/v1/embeddings'
const EMBEDDING_MODEL = 'openai/text-embedding-3-small'

const DEFAULT_QUERIES = [
  'putih',
  'string bra',
  'mini dress',
  'horse',
  'tete',
  'pantat',
  'caucasian',
  'paha',
  'kolor pink',
  'pool',
]

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
if (!apiKey) {
  console.error('needs OPENROUTER_API_KEY — run with --env-file=.env.local')
  process.exit(1)
}

const { neon } = await import('@neondatabase/serverless')
const sql = neon(url)

const queries = process.argv.slice(2).length > 0 ? process.argv.slice(2) : DEFAULT_QUERIES

/* ── 1. The corpus ──────────────────────────────────────────────────────────────────────── */

const users = await sql`
  select user_id, count(*)::int as n
  from nina_avatars
  where description_embedding is not null
  group by user_id
  order by n desc
`
if (users.length === 0) {
  console.error('FAIL  no row in nina_avatars carries a description_embedding — nothing to score.')
  process.exit(1)
}
console.log(
  `embedded rows: ${users.map((u) => `${u.user_id} (${u.n})`).join(', ')} — queries: ${queries.length}`,
)

/* ── 2. One query vector per query, sequentially — 10 small calls, no burst to trip ─────── */

async function embed(text) {
  const res = await fetch(EMBEDDINGS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model: EMBEDDING_MODEL, input: text, encoding_format: 'float' }),
  })
  const raw = await res.text()
  if (!res.ok) {
    throw new Error(`embeddings ${res.status}: ${raw.slice(0, 200)}`)
  }
  const vector = JSON.parse(raw)?.data?.[0]?.embedding
  if (!Array.isArray(vector) || vector.length === 0) {
    throw new Error(`embeddings returned no vector for ${JSON.stringify(text)}`)
  }
  return vector
}

const vectors = new Map()
for (const query of queries) {
  vectors.set(query, await embed(query))
}

/* ── 3. The full ranked distribution, per query — the SQL the search itself runs ────────── */

const report = []
for (const query of queries) {
  const vector = vectors.get(query)
  const rows = await sql`
    select id, user_id, filename, folder, source,
           1 - (description_embedding <=> ${JSON.stringify(vector)}::vector) as score
    from nina_avatars
    where description_embedding is not null
    order by description_embedding <=> ${JSON.stringify(vector)}::vector asc
  `
  const scores = rows.map((r) => Number(r.score))
  /* The five largest drops between consecutive ranks — each is a place a threshold could sit,
   * with `kept` rows above it and `cut` rows below. */
  const gaps = scores
    .map((score, i) => ({
      after_rank: i + 1,
      above: score,
      below: scores[i + 1],
      drop: score - scores[i + 1],
    }))
    .sort((a, b) => b.drop - a.drop)
    .slice(0, 5)

  report.push({ query, rows: rows.map((r) => ({ ...r, score: Number(r.score) })), gaps })

  console.log(`\n═══ "${query}" — ${rows.length} embedded rows ═══`)
  const head = rows.slice(0, 12)
  for (let i = 0; i < head.length; i++) {
    const r = rows[i]
    const where = r.folder === '' ? '(root)' : r.folder
    console.log(
      `  ${String(i + 1).padStart(2)}  ${Number(r.score).toFixed(4)}  ${r.id}  ${where}/${r.filename ?? ''}`,
    )
  }
  if (rows.length > 15)
    console.log(`  …   ${rows.length - 15} more, worst ${Number(scores.at(-1)).toFixed(4)}`)
  if (rows.length > 12) {
    for (let i = Math.max(12, rows.length - 3); i < rows.length; i++) {
      const r = rows[i]
      console.log(
        `  ${String(i + 1).padStart(2)}  ${Number(r.score).toFixed(4)}  ${r.id}  ${r.folder}/${r.filename ?? ''}`,
      )
    }
  }
  console.log('  gaps (largest consecutive drops):')
  for (const g of gaps) {
    console.log(
      `    cut after rank ${String(g.after_rank).padStart(2)}  ${g.above.toFixed(4)} → ${g.below.toFixed(4)}  (drop ${g.drop.toFixed(4)}, keeps ${g.after_rank})`,
    )
  }
}

const outFile = '/tmp/album-search-probe-latest.json'
const { writeFileSync } = await import('node:fs')
writeFileSync(
  outFile,
  JSON.stringify(
    { model: EMBEDDING_MODEL, generatedAt: new Date().toISOString(), report },
    null,
    2,
  ),
)
console.log(`\nfull distribution → ${outFile}`)
