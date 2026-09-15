import { and, asc, desc, eq, isNotNull, sql, type SQL } from 'drizzle-orm'

import { db } from '@/lib/db'
import { ninaAvatars } from '@/lib/db/schema'
import type { NinaAvatarSearchPage } from './shapes'
import { avatarColumns } from './columns'

/**
 * §9d Semantic search over the album — R2/R3/R4 of the admin image-search set.
 *
 * Three reads, one predicate, one column. Every one of them ranks `nina_avatars` by cosine
 * similarity between a QUERY vector and each row's stored `description_embedding`, scoped to
 * `user_id` per `lib/nina/queries.ts`'s rule 1, across EVERY folder — the requirement is *"i am
 * struggling to see the image i want"*, and a search that only looked in the folder already open
 * would be answering a question the operator can already answer by looking.
 *
 * ── WHY THERE IS ONLY ONE EMBEDDING COLUMN, AND WHY IMAGE SEARCH STILL WORKS ────────────────
 * No CLIP-style image embedding exists in this repo's vendor arsenal (the analysis's Key
 * Consideration 3: both z.ai base URLs are chat/completions-shaped). So an image QUERY is turned
 * into TEXT first — `lib/admin/ninaAlbumSearchActions.ts` captions it with the same `glm-4.6v`
 * witness prompt that wrote every row's `description` — and then embedded with the same text
 * model. Both query vectors therefore live in the SAME space as the column, which is the property
 * that makes R4's weighted average legitimate rather than a coincidence: it is two comparable
 * cosine similarities against one column, not two scores from two systems that happen to be
 * numbers.
 *
 * ── WHY THE ORDER BY IS THE DISTANCE AND THE PROJECTION IS THE SIMILARITY ───────────────────
 * `ORDER BY embedding <=> $q ASC` is the one spelling a pgvector HNSW `vector_cosine_ops` index
 * can answer; `ORDER BY 1 - (...) DESC` is the same ordering and forces a sort. The human-facing
 * number is the similarity, so the projection computes `1 - distance` and the ordering does not.
 *
 * ── WHY THE `<=>` EXPRESSION IS HAND-WRITTEN AND NOT `cosineDistance()` ─────────────────────
 * drizzle-orm 0.45.2 DOES export `cosineDistance` (the set's analysis says otherwise; it is wrong,
 * `import { cosineDistance } from 'drizzle-orm'` resolves). It is not used here for two reasons:
 * it binds the vector with no `::vector` cast, and all three searches need the distance composed
 * into something else anyway (a similarity, and for the combined read a weighted sum of two).
 * `cosineDistanceTo` below is the single spelling of the operator, the cast and the encoding —
 * and its encoding is `JSON.stringify`, which is byte-for-byte what drizzle's own
 * `PgVector.mapToDriverValue` writes for the column, so query and column cannot disagree.
 *
 * Imports foundation-wards only (`./shapes`, `./columns`) plus `db` and the one table — never the
 * barrel `@/lib/nina/queries`, which re-exports this module.
 */

/**
 * How many results one search returns — both the DEFAULT and the CEILING, for the reason
 * `NINA_ADMIN_PAGE_SIZE` is both in `listNinaAvatarsInFolder`: a caller may ask for fewer and
 * cannot ask for more, so nothing can turn a ranked top-N into an unpaginated read of the album.
 *
 * 48 rather than the grid's 120 for two reasons, and the second is a hard one.
 *
 * Relevance decays: past about five rows of thumbnails the tail is noise, and a search that returns
 * the whole album ranked is a search that has not helped.
 *
 * And **`components/ui/PhotoViewer` draws one pager dot per photo** (`PhotoViewer.tsx:264-280`,
 * verified), keyed by URL. Phase 4 opens that overlay over the whole result set, so this constant
 * is also the length of that dot row — a hundred dots is not a pager. 48 is the reconciled ceiling
 * the UI phase asked for and this phase owns; it is a multiple of every column count the sheet uses,
 * so the last row is never a stub.
 *
 * Module-private on purpose — the barrel re-exports this file with `export *`, and
 * `lib/nina/queries.test.ts` pins that every runtime export of the barrel is a function.
 */
const NINA_SEARCH_LIMIT = 48

/**
 * **R4's whole answer: how the text score and the image score are resolved into one ranking.**
 *
 * 0.5 — an even split, and the ONE place the trade is written down. Both inputs are cosine
 * similarities against the same column in the same space (see the header), so a weighted average
 * is as principled as reciprocal rank fusion and is a single SQL expression rather than two ranked
 * passes and a merge. It is deliberately not operator-configurable: the plan index's Scope rules a
 * weights dropdown out, and a constant is a one-line change plus a redeploy if the split is ever
 * measured to be wrong.
 */
const NINA_SEARCH_TEXT_WEIGHT = 0.5

/**
 * **The one value that separates a relevant hit from a merely-ranked one** — a floor on the
 * projected cosine similarity, and THE answer to "every query returns 48 tiles no matter what I
 * type". Below it a hit is cut, however high it ranked; a search whose every row falls below it
 * returns nothing, which is the honest answer.
 *
 * **PROVISIONAL 0.2, set 2026-09-15 from the first measured distribution and expected to move.**
 * `scripts/album-search-probe.mjs` (same column, same `<=>` spelling, same encoding) scored ten
 * queries against the live album: relevant scores start near 0.21 (`caucasian` tops at 0.239,
 * `paha` at 0.209) while the noise tail never clears ~0.18, so 0.2 sits in the one gap the data
 * names. The final value comes from the operator's per-image relevance annotations against this
 * same probe — retuning it is THIS line and nothing else; the fixtures in
 * `tests/nina.avatarSearch.test.ts` straddle it deliberately and will break if a new value lands
 * outside 0.11–0.82, which is the test asking to be re-read.
 *
 * Applied in JS and not in a SQL `WHERE`, for three measured reasons: the ordering the HNSW index
 * answers must stay byte-identical (a `WHERE` on the distance rides AFTER an index scan and changes
 * nothing about which rows Postgres visits, so it buys nothing); the page is already capped at 48
 * rows, so filtering the fetched page costs nothing; and the count statement keeps reporting the
 * CANDIDATE set, which is what `searched` has always meant. Module-private for the same reason the
 * weights above are.
 */
const NINA_SEARCH_MIN_SCORE = 0.2

/** The other half. Derived, never typed twice — the two must sum to 1 or the identity in
 *  `searchNinaAvatarsByTextAndCaption`'s docstring stops holding. */
const NINA_SEARCH_CAPTION_WEIGHT = 1 - NINA_SEARCH_TEXT_WEIGHT

/**
 * The query vector as a bound parameter with an explicit `::vector` cast.
 *
 * `JSON.stringify` is pgvector's own text form (`[0.1,-0.2,…]`) and is exactly what drizzle's
 * `PgVector.mapToDriverValue` emits for the column, so a value written by the embed path and a
 * value searched for here are encoded identically.
 *
 * The two guards are cheap and loud for the `assertPathSegment` reason: a `NaN` would be serialized
 * by `JSON.stringify` as `null`, which Postgres rejects with a parse error naming a column this
 * function never mentioned, and an empty array would produce `[]::vector` — a dimension mismatch
 * reported as if the schema were wrong. Both are caller bugs; both are named here.
 */
function queryVector(embedding: readonly number[]): SQL {
  if (embedding.length === 0) {
    throw new Error('nina avatar search: the query embedding is empty')
  }
  for (const value of embedding) {
    if (!Number.isFinite(value)) {
      throw new Error('nina avatar search: the query embedding carries a non-finite value')
    }
  }
  return sql`${JSON.stringify([...embedding])}::vector`
}

/** Cosine DISTANCE (0 = identical, 2 = opposed) between the column and one query vector. */
function cosineDistanceTo(embedding: readonly number[]): SQL {
  return sql`(${ninaAvatars.descriptionEmbedding} <=> ${queryVector(embedding)})`
}

/**
 * **The other half of R2's exclusion feature: does the OPERATOR'S TYPED QUERY trip one of this
 * row's negative keywords?** `nina-album-search-relevance-tools` R2 follow-up, 2026-09-15.
 *
 * Whole-word, case-insensitive, comma-split — deliberately the cheapest of the two matching
 * strategies the design considered. `description_embedding`'s cosine ranking already answers
 * "what is this SEMANTICALLY near"; a second, fuzzy semantic layer here (embed the negative
 * phrase, penalize by its similarity to the query) would be a second tunable floor stacked on the
 * one `NINA_SEARCH_MIN_SCORE` already is, for a feature whose whole point is a HARD, predictable
 * exclusion the operator can reason about by reading the two boxes in the panel. A literal,
 * exact-word match is that: `"tete"` excludes `"tete gede nina"` and does not touch `"tetesan
 * air"`, and the operator can see exactly why from the two strings.
 *
 * `\b` is an ASCII word-boundary in a JS regex, which is a real limitation for scripts outside
 * Latin — accepted deliberately, because every negative keyword and every query seen so far is
 * Indonesian/English slang typed in Latin letters, the same alphabet `search_keywords` is written
 * in. Each phrase is regex-escaped before being spliced in, so a keyword containing `.`, `(`, or
 * any other metacharacter is matched LITERALLY rather than interpreted.
 */
function matchesNegativeKeyword(queryText: string, negativeSearchKeywords: string | null): boolean {
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

/**
 * "Yours, and searchable." Both statements of every search share it, so the ranked page and the
 * coverage total can never disagree about what the candidate set was — the argument
 * `generatedChatPhotoScope` makes for the picker's page and its count.
 */
function searchScope(userId: string) {
  // Return type inferred (`SQL<unknown> | undefined`, what `and()` gives) rather than annotated
  // `SQL` with a cast — `listNinaAvatarsInFolder` builds its `scope` the same way and hands it
  // straight to `.where()`, which accepts the union.
  return and(eq(ninaAvatars.userId, userId), isNotNull(ninaAvatars.descriptionEmbedding))
}

/** `NINA_SEARCH_LIMIT` is the default AND the ceiling; a junk number falls back to the default. */
function clampLimit(limit: number | undefined): number {
  const wanted = Number.isFinite(limit) ? Math.trunc(limit as number) : NINA_SEARCH_LIMIT
  return Math.max(1, Math.min(wanted, NINA_SEARCH_LIMIT))
}

/**
 * The shared core: rank by a distance expression, and count the candidates that were ranked.
 *
 * Two statements in one `Promise.all` rather than a `count(*) OVER ()` window, for
 * `listNinaAvatarsInFolder`'s reason — the count is about the CANDIDATE SET, not about the page, so
 * a window function over the limited result would report the page size and mean nothing.
 *
 * The tiebreak is `(created_at desc, id desc)`, the album's own ordering. Exact ties in a float
 * distance need two identical descriptions, which the "make a duplicate folder" workflow does
 * produce; without the tiebreak those two tiles swap places between renders for no reason. The cost
 * is that Postgres may follow the index scan with an incremental sort, which at the requirement's
 * scale (*"hundreds of profile pics"*) is not measurable.
 */
async function rankByDistance(
  userId: string,
  distance: SQL,
  limit: number,
  queryText: string | null,
): Promise<NinaAvatarSearchPage> {
  const scope = searchScope(userId)

  const [ranked, counted] = await Promise.all([
    db
      .select({ ...avatarColumns, score: sql<number>`1 - ${distance}`.mapWith(Number) })
      .from(ninaAvatars)
      .where(scope)
      .orderBy(asc(distance), desc(ninaAvatars.createdAt), desc(ninaAvatars.id))
      .limit(limit),
    db
      .select({ total: sql<number>`count(*)`.mapWith(Number) })
      .from(ninaAvatars)
      .where(scope),
  ])

  /* The relevance floor, applied to the fetched page — see `NINA_SEARCH_MIN_SCORE` for why the
   * cut lives here and not in a `WHERE`. Ordering is untouched: the rows arrive ranked and leave
   * ranked, some of them gone.
   *
   * The negative-keyword exclusion rides the SAME filter, for the SAME reason: `queryText` is
   * `null` for `searchNinaAvatarsByImageCaption` (a vision-model caption has no typed words a
   * hand-written phrase could be checked against), so that search is untouched by construction —
   * no branch, no flag, the `null` says it all. `total` is deliberately NOT reduced by either
   * filter: it answers "how many rows were compared", not "how many passed", exactly as the
   * relevance floor already does not move it. */
  const rows = ranked
    .filter((row) => row.score >= NINA_SEARCH_MIN_SCORE)
    .filter((row) => queryText === null || !matchesNegativeKeyword(queryText, row.negativeSearchKeywords))

  return { rows, total: counted[0]?.total ?? 0 }
}

/**
 * **R2 — "we use semantic search to search to every image description we have".**
 *
 * `queryEmbedding` is `embedNinaText(<what the operator typed>)`. This function does not embed and
 * does not know what a model is: the data layer takes vectors, the Server Action owns the vendor
 * call. That is what lets the whole ranking be unit-tested against generated SQL with no network.
 */
export async function searchNinaAvatarsByText(
  userId: string,
  queryEmbedding: readonly number[],
  queryText: string | null = null,
  opts: { limit?: number } = {},
): Promise<NinaAvatarSearchPage> {
  return rankByDistance(userId, cosineDistanceTo(queryEmbedding), clampLimit(opts.limit), queryText)
}

/**
 * **R3 — "admin can search using image only … output the most similar images".**
 *
 * `captionEmbedding` is `embedNinaText(<what glm-4.6v saw in the uploaded photo>)`. The statement
 * this builds is IDENTICAL to `searchNinaAvatarsByText`'s, and that is the design rather than a
 * duplication: image search in this app IS text search, run against a caption instead of a typed
 * phrase (plan index, Decision "Image-only search mechanism"). It exists as its own name so that
 * the Server Action's three-way branch reads as the three things the user asked for, and so that
 * a future divergence — a different limit for image queries, say — has a place to land that is not
 * an `if` inside the text search.
 */
export async function searchNinaAvatarsByImageCaption(
  userId: string,
  captionEmbedding: readonly number[],
  opts: { limit?: number } = {},
): Promise<NinaAvatarSearchPage> {
  /* `queryText: null` — an uploaded photo's caption is `glm-4.6v`'s prose, not a phrase the
   * operator typed, so there is nothing a hand-written negative keyword could be checked against.
   * See `rankByDistance`'s note. */
  return rankByDistance(userId, cosineDistanceTo(captionEmbedding), clampLimit(opts.limit), null)
}

/**
 * **R4 — "think of a way to resolve the scoring between these 2."**
 *
 * The resolution is a weighted average of the two cosine SIMILARITIES, and it is computed as a
 * weighted average of the two DISTANCES, which is the same number because the weights sum to 1:
 *
 *     w·(1 − d_text) + (1 − w)·(1 − d_caption)  =  1 − ( w·d_text + (1 − w)·d_caption )
 *
 * So one expression is both the ranking key (ascending) and, via `1 − x`, the reported score — and
 * the weights cannot drift between the two, because there is only one of them.
 *
 * ONE statement, not two ranked passes merged in JS. Both signals are already comparable (same
 * column, same space), which is exactly the precondition reciprocal rank fusion exists to work
 * around; using RRF here would discard the magnitudes for no gain and would need two round trips.
 *
 * The HNSW index cannot answer this ordering — it is a sum over two different query vectors — so
 * this one read is a scan of the user's embedded rows. At *"hundreds of profile pics"* that is a
 * few hundred 1536-float dot products, which Postgres does in single-digit milliseconds; this is
 * stated so nobody "fixes" it into two indexed passes and a merge.
 */
export async function searchNinaAvatarsByTextAndCaption(
  userId: string,
  textEmbedding: readonly number[],
  captionEmbedding: readonly number[],
  queryText: string | null = null,
  opts: { limit?: number } = {},
): Promise<NinaAvatarSearchPage> {
  const weighted = sql`(${NINA_SEARCH_TEXT_WEIGHT}::float8 * ${cosineDistanceTo(textEmbedding)} + ${NINA_SEARCH_CAPTION_WEIGHT}::float8 * ${cosineDistanceTo(captionEmbedding)})`
  /* `queryText` here is the TYPED half only (R4's own text arm) — see the docstring's note on
   * why the caption half is exempt: nothing the operator wrote is being checked against it. */
  return rankByDistance(userId, weighted, clampLimit(opts.limit), queryText)
}
