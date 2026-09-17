import { and, asc, desc, eq, isNotNull, isNull, notExists, sql, type SQL } from 'drizzle-orm'

import { db } from '@/lib/db'
import { ninaAvatars, ninaMessageImages } from '@/lib/db/schema'
import type { NinaPhotoSearchPage, NinaPhotoSearchRow } from './shapes'
import { avatarColumns } from './columns'
import { isOriginalPhoto } from './images'

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
 * Imports foundation-wards (`./shapes`, `./columns`) plus `db`, the two tables, and ONE sibling
 * domain module: `./images`' `isOriginalPhoto`. That one edge is deliberate — the media arm's
 * "not a re-share" rule must be the SAME predicate every other collection read uses, and a second
 * spelling of it here is how the two would one day disagree about which photographs exist. Never
 * the barrel `@/lib/nina/queries`, which re-exports this module.
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

/** Cosine DISTANCE (0 = identical, 2 = opposed) between the ALBUM column and one query vector. */
function albumDistanceTo(embedding: readonly number[]): SQL {
  return sql`(${ninaAvatars.descriptionEmbedding} <=> ${queryVector(embedding)})`
}

/** The same, against the MEDIA column. Two functions and not one parameterised by a column,
 *  because the two are used in two different statements against two different tables and a shared
 *  one would have to take the column as an argument — which is a way of spelling "get it wrong". */
function mediaDistanceTo(embedding: readonly number[]): SQL {
  return sql`(${ninaMessageImages.descriptionEmbedding} <=> ${queryVector(embedding)})`
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
 * "Yours, searchable, and not a pointer." The ALBUM arm's candidate set, shared by its ranked page
 * and its coverage count so the two can never disagree about what was compared.
 *
 * ── THE `source_image_id IS NULL` ARM IS INSURANCE, AND IT IS SAID OUT LOUD ─────────────────
 * `media-album-unified-search` R3. A pointer row's `description_embedding` is permanently NULL by
 * the plan index's Decision (its prose lives on the Media row it names), so `IS NOT NULL` above
 * already excludes it and this arm is technically redundant. It is here anyway, in the same spirit
 * as `nina_avatars`' HNSW index note about a predicate that is *"insurance rather than a
 * requirement"*: it is the one place in the ranking that STATES the dedup invariant — one physical
 * photograph, one hit — rather than relying on a NULL somewhere else to imply it. If a future
 * writer ever fills a pointer's vector by mistake, this line is what keeps the album from
 * returning the same photograph twice, and the failure shows up as a review comment instead of as
 * a duplicate tile.
 */
function albumSearchScope(userId: string) {
  return and(
    eq(ninaAvatars.userId, userId),
    isNotNull(ninaAvatars.descriptionEmbedding),
    isNull(ninaAvatars.sourceImageId),
  )
}

/**
 * The MEDIA arm's candidate set. Yours, searchable, an ORIGINAL — and not a photograph a LEGACY
 * album COPY already stands in for.
 *
 * ── `isOriginalPhoto()`, FOR THE REASON EVERY OTHER COLLECTION READ HAS IT ──────────────────
 * A row carrying `source_avatar_id`/`source_image_id` RE-SHOWS a photograph that lives elsewhere.
 * It is excluded from `/nina/about`'s feed, from the Media view and from the picker; a search that
 * returned it would be the one surface in the app that shows the same photograph twice.
 *
 * ── THE `NOT EXISTS` ARM, AND WHY IT IS QUALIFIED THE WAY IT IS ─────────────────────────────
 * `isOriginalPhoto()` catches ALBUM → CHAT only. The other direction, CHAT → ALBUM, is
 * `generatedChatPhotoScope`'s problem and this is its answer, borrowed whole: 18 `nina_avatars`
 * rows in production carry `source_key LIKE 'chat-photo:%'` from before this set — real, byte-copied
 * album rows with their own descriptions and their own vectors, whose chat originals are still
 * ordinary rows. Once phase 4 embeds those originals, each of those 18 photographs would rank
 * TWICE, which is exactly what the user ruled out (*"we need to make sure there are no duplicates
 * in the search result"*). `generatedChatPhotoScope` already decided which half survives —
 * *"the copy is the survivor and the original is the one hidden, because the copy is the row the
 * operator just made current"* — and this follows it rather than inventing a second rule.
 *
 * **`and ... source_image_id is null` inside the subquery is the whole of the correctness.** A
 * POINTER row carries `source_key = 'chat-photo:<id>'` too (step 6 keeps it, because it is what
 * makes re-adoption a constraint decision), so an unqualified `NOT EXISTS` would hide the Media
 * row of every newly linked photograph — the one half of the pair that IS ranked, since the
 * pointer's own vector is permanently NULL. Result: a photograph promoted to her profile picture
 * would silently vanish from search. The qualifier says the rule exactly: only a COPY hides its
 * original; a LINK does not, because a link is not a second photograph.
 *
 * The outer parentheses are load-bearing and hand-written for `generatedChatPhotoScope`'s measured
 * reason: `notExists()` emits its argument's chunks verbatim, and a raw `sql` template does not
 * bracket itself. It is scoped (`nina_avatars.user_id` inside the subquery) and index-backed
 * (`nina_avatars_user_source_key_unq`), so it is an equality probe per candidate row, not a scan.
 */
function mediaSearchScope(userId: string) {
  const supersededByALegacyCopy = sql`(
    select 1
      from ${ninaAvatars}
     where ${ninaAvatars.userId} = ${userId}
       and ${ninaAvatars.sourceKey} = 'chat-photo:' || ${ninaMessageImages.id}
       and ${ninaAvatars.sourceImageId} is null
  )`

  return and(
    eq(ninaMessageImages.userId, userId),
    isNotNull(ninaMessageImages.descriptionEmbedding),
    isOriginalPhoto(),
    notExists(supersededByALegacyCopy),
  )
}

/** The MEDIA arm's projection. Deliberately NOT `imageColumns`: `prompt`, the two provenance ids,
 *  the two hashes and `sortOrder` are of no use to a ranked tile, and the vector is never SELECTed
 *  anywhere (`queries/imageEmbeddings.ts`'s header). */
const mediaSearchColumns = {
  id: ninaMessageImages.id,
  blobUrl: ninaMessageImages.blobUrl,
  kind: ninaMessageImages.kind,
  width: ninaMessageImages.width,
  height: ninaMessageImages.height,
  bytes: ninaMessageImages.bytes,
  description: ninaMessageImages.description,
  searchKeywords: ninaMessageImages.searchKeywords,
  negativeSearchKeywords: ninaMessageImages.negativeSearchKeywords,
  createdAt: ninaMessageImages.createdAt,
}

/** `NINA_SEARCH_LIMIT` is the default AND the ceiling; a junk number falls back to the default. */
function clampLimit(limit: number | undefined): number {
  const wanted = Number.isFinite(limit) ? Math.trunc(limit as number) : NINA_SEARCH_LIMIT
  return Math.max(1, Math.min(wanted, NINA_SEARCH_LIMIT))
}

/**
 * The ALBUM arm: rank by a distance expression, and count the candidates that were ranked.
 *
 * Two statements rather than a `count(*) OVER ()` window, for `listNinaAvatarsInFolder`'s reason —
 * the count is about the CANDIDATE SET, not the page, so a window over the limited result would
 * report the page size and mean nothing.
 *
 * The per-arm tiebreak is `(created_at desc, id desc)`, the album's own ordering, and it stays
 * INSIDE the arm rather than being deferred to the merge. That is not redundant with the merged
 * sort below: it is what makes the arm's own `LIMIT` deterministic — which 48 of 300 equally
 * distant rows come back is decided here, and without it two renders could fetch two different
 * sets before the merge ever sees them.
 */
async function rankAlbum(
  userId: string,
  distance: SQL,
  limit: number,
): Promise<{ rows: NinaPhotoSearchRow[]; total: number }> {
  const scope = albumSearchScope(userId)

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

  const rows: NinaPhotoSearchRow[] = ranked.map((row) => ({
    origin: 'album',
    id: row.id,
    blobUrl: row.blobUrl,
    thumbUrl: row.thumbUrl,
    folder: row.folder,
    filename: row.filename,
    width: row.width,
    height: row.height,
    bytes: row.bytes,
    source: row.source,
    isCurrent: row.isCurrent,
    description: row.description,
    searchKeywords: row.searchKeywords,
    negativeSearchKeywords: row.negativeSearchKeywords,
    cropScale: row.cropScale,
    cropX: row.cropX,
    cropY: row.cropY,
    createdAt: row.createdAt,
    score: row.score,
  }))

  return { rows, total: counted[0]?.total ?? 0 }
}

/**
 * The MEDIA arm. The same two statements, the same tiebreak, the same reasons — and five constant
 * fields, each of which is `MediaExplorerPhoto`'s own existing convention rather than a new
 * opinion invented for search:
 *
 *   · `folder: ''` — a Media row is filed nowhere, and `''` is what `ExplorerPhotoBase.folder`
 *     already documents as *"the only value a media row ever carries"*.
 *   · `isCurrent: false` — *"a message image is never itself her face"*; only an album row carries
 *     `is_current`, and a pointer to this photograph would be a different hit that this arm's
 *     `NOT EXISTS`/the album arm's `IS NULL` have already resolved.
 *   · `thumbUrl: null` — the table has no thumbnail column; every consumer falls back to `url`.
 *   · the three crop fields `null` — `resolveCrop` folds all-null to centred `object-cover`.
 *   · `source: row.kind` — `ExplorerPhotoBase.source` documents exactly this: *"Media: the row's
 *     own `kind`, which on that table IS the provenance."*
 *
 * `filename: null` — the Media view DERIVES a display name from the row's date and id in
 * `app/admin/nina/page.tsx`, and the data layer does not know that format. The consumer's existing
 * `row.filename ?? row.id` fallback gives the id, which is a truthful name; a nicer one is the UI
 * phase's to build if it wants one.
 */
async function rankMedia(
  userId: string,
  distance: SQL,
  limit: number,
): Promise<{ rows: NinaPhotoSearchRow[]; total: number }> {
  const scope = mediaSearchScope(userId)

  const [ranked, counted] = await Promise.all([
    db
      .select({ ...mediaSearchColumns, score: sql<number>`1 - ${distance}`.mapWith(Number) })
      .from(ninaMessageImages)
      .where(scope)
      .orderBy(asc(distance), desc(ninaMessageImages.createdAt), desc(ninaMessageImages.id))
      .limit(limit),
    db
      .select({ total: sql<number>`count(*)`.mapWith(Number) })
      .from(ninaMessageImages)
      .where(scope),
  ])

  const rows: NinaPhotoSearchRow[] = ranked.map((row) => ({
    origin: 'media',
    id: row.id,
    blobUrl: row.blobUrl,
    thumbUrl: null,
    folder: '',
    filename: null,
    width: row.width,
    height: row.height,
    bytes: row.bytes,
    source: row.kind,
    isCurrent: false,
    description: row.description,
    searchKeywords: row.searchKeywords,
    negativeSearchKeywords: row.negativeSearchKeywords,
    cropScale: null,
    cropX: null,
    cropY: null,
    createdAt: row.createdAt,
    score: row.score,
  }))

  return { rows, total: counted[0]?.total ?? 0 }
}

/**
 * **The merge — R1's whole answer.** Both arms, concurrently, then one ranking.
 *
 * ── FOUR STATEMENTS IN ONE `Promise.all`, NOT TWO ROUND TRIPS ───────────────────────────────
 * `rankAlbum` and `rankMedia` each run their page and their count together; running the two ARMS
 * together as well makes the whole search one round trip's latency instead of two. Nothing in
 * either arm depends on the other, so serialising them would buy nothing and cost a search's worth
 * of perceived speed on a click the operator is watching.
 *
 * ── WHY NOT ONE SQL `UNION ALL` ─────────────────────────────────────────────────────────────
 * Because the two tables have different column sets, and a `UNION ALL` would need a
 * lowest-common-denominator projection with NULL padding on both sides — the merge would move into
 * SQL and the per-table `LIMIT` would move with it, at which point neither arm's HNSW index can
 * answer its own ordering cleanly. Two indexed top-N reads plus a JS merge of at most 96 rows is
 * the cheaper and the more legible shape, and it is the shape
 * `searchNinaAvatarsByTextAndCaption`'s own docstring already reasons about for the mirror case.
 *
 * ── THE ORDER OF THE FOUR JS STEPS IS THE CONTRACT ──────────────────────────────────────────
 *   1. **Concatenate**, tagged with `origin`. Nothing is deduplicated here and nothing needs to be:
 *      the two scopes are disjoint by construction (a pointer's album row is excluded by
 *      `IS NULL`, a legacy copy's media row by `NOT EXISTS`), which is what makes "every physical
 *      photograph at most once" a property of the PREDICATES rather than of a post-hoc filter.
 *   2. **The relevance floor**, `NINA_SEARCH_MIN_SCORE`, applied identically to both origins.
 *      Identically is the point: one floor over one comparison against one query vector in one
 *      space, so a Media hit at 0.21 and an album hit at 0.21 are the same statement about
 *      relevance and are treated as such.
 *   3. **The negative-keyword exclusion**, on the same pass, reading each row's OWN
 *      `negative_search_keywords` whichever table it came from. `queryText === null` (the
 *      image-only arm) exempts both origins by construction — no branch, no flag.
 *   4. **The merged sort, then the clamp.** `score desc`, then `created_at desc`, then `id desc`,
 *      over the COMBINED set — deliberately NOT a stable sort over the concatenation order, which
 *      would make the album arm silently win every exact tie for no reason a reader could name.
 *      `id desc` is the final decider, so the rule is total and two renders of the same corpus
 *      cannot disagree. An id collision across the two tables is possible in principle (both are
 *      `newId()`), and harmless: the pair is already ordered by score and date.
 *
 *      The clamp is LAST and it is `NINA_SEARCH_LIMIT` over the WHOLE result, not per table. Each
 *      arm is asked for the full limit and the merged 96 is trimmed to 48 — asking each arm for 24
 *      would silently under-serve any query one collection dominates, which is most of them.
 *
 * `total` is the SUM of the two candidate counts, keeping `searched`'s meaning exactly what it has
 * always been: *"how many rows were compared"*, not how many passed and not the page size.
 */
async function rankMerged(
  userId: string,
  albumDistance: SQL,
  mediaDistance: SQL,
  limit: number,
  queryText: string | null,
): Promise<NinaPhotoSearchPage> {
  const [album, media] = await Promise.all([
    rankAlbum(userId, albumDistance, limit),
    rankMedia(userId, mediaDistance, limit),
  ])

  const merged = [...album.rows, ...media.rows]
    .filter((row) => row.score >= NINA_SEARCH_MIN_SCORE)
    .filter(
      (row) => queryText === null || !matchesNegativeKeyword(queryText, row.negativeSearchKeywords),
    )
    .sort(
      (a, b) =>
        b.score - a.score ||
        b.createdAt.getTime() - a.createdAt.getTime() ||
        (a.id < b.id ? 1 : a.id > b.id ? -1 : 0),
    )
    .slice(0, limit)

  return { rows: merged, total: album.total + media.total }
}

/**
 * **R1/R2 — "every single picture in any directory must be able to be image searched."**
 *
 * `queryEmbedding` is `embedNinaText(<what the operator typed>)`. This function does not embed and
 * does not know what a model is: the data layer takes vectors, the Server Action owns the vendor
 * call. That is what lets the whole ranking be unit-tested against generated SQL with no network.
 *
 * Renamed from `searchNinaAvatarsByText` by `media-album-unified-search`: it stopped being about
 * avatars the moment it grew a second arm, and a name that says "avatars" over a merged ranking is
 * the kind of half-truth that survives three refactors.
 */
export async function searchNinaPhotosByText(
  userId: string,
  queryEmbedding: readonly number[],
  queryText: string | null = null,
  opts: { limit?: number } = {},
): Promise<NinaPhotoSearchPage> {
  return rankMerged(
    userId,
    albumDistanceTo(queryEmbedding),
    mediaDistanceTo(queryEmbedding),
    clampLimit(opts.limit),
    queryText,
  )
}

/**
 * **R3 — "admin can search using image only … output the most similar images."**
 *
 * `captionEmbedding` is `embedNinaText(<what glm-4.6v saw in the uploaded photo>)`. The statements
 * this builds are IDENTICAL to `searchNinaPhotosByText`'s, and that is the design rather than a
 * duplication: image search in this app IS text search, run against a caption instead of a typed
 * phrase. It exists as its own name so the Server Action's three-way branch reads as the three
 * things the user asked for, and so a future divergence has a place to land that is not an `if`.
 */
export async function searchNinaPhotosByImageCaption(
  userId: string,
  captionEmbedding: readonly number[],
  opts: { limit?: number } = {},
): Promise<NinaPhotoSearchPage> {
  /* `queryText: null` — an uploaded photo's caption is `glm-4.6v`'s prose, not a phrase the
   * operator typed, so there is nothing a hand-written negative keyword could be checked against.
   * See `rankMerged`'s step 3. */
  return rankMerged(
    userId,
    albumDistanceTo(captionEmbedding),
    mediaDistanceTo(captionEmbedding),
    clampLimit(opts.limit),
    null,
  )
}

/**
 * **R4 — "think of a way to resolve the scoring between these 2."**
 *
 * The resolution is a weighted average of the two cosine SIMILARITIES, computed as a weighted
 * average of the two DISTANCES, which is the same number because the weights sum to 1:
 *
 *     w·(1 − d_text) + (1 − w)·(1 − d_caption)  =  1 − ( w·d_text + (1 − w)·d_caption )
 *
 * So one expression is both the ranking key (ascending) and, via `1 − x`, the reported score — and
 * the weights cannot drift between the two, because there is only one of them. It is built TWICE
 * here, once per table, and that is not a second opinion: it is the same expression over each
 * table's own column, which is the only way two columns can be ranked by one identity.
 *
 * ONE statement per arm, not two ranked passes merged in JS per arm. Both signals are already
 * comparable (same model, same space), which is exactly the precondition reciprocal rank fusion
 * exists to work around; using RRF here would discard the magnitudes for no gain.
 *
 * Neither HNSW index can answer this ordering — it is a sum over two different query vectors — so
 * each arm is a scan of that user's embedded rows. At the requirement's scale (~70 album rows and
 * ~154 media rows today) that is a few hundred 1536-float dot products, single-digit milliseconds;
 * stated so nobody "fixes" it into indexed passes and a merge.
 */
export async function searchNinaPhotosByTextAndCaption(
  userId: string,
  textEmbedding: readonly number[],
  captionEmbedding: readonly number[],
  queryText: string | null = null,
  opts: { limit?: number } = {},
): Promise<NinaPhotoSearchPage> {
  const albumWeighted = sql`(${NINA_SEARCH_TEXT_WEIGHT}::float8 * ${albumDistanceTo(textEmbedding)} + ${NINA_SEARCH_CAPTION_WEIGHT}::float8 * ${albumDistanceTo(captionEmbedding)})`
  const mediaWeighted = sql`(${NINA_SEARCH_TEXT_WEIGHT}::float8 * ${mediaDistanceTo(textEmbedding)} + ${NINA_SEARCH_CAPTION_WEIGHT}::float8 * ${mediaDistanceTo(captionEmbedding)})`
  /* `queryText` here is the TYPED half only (R4's own text arm) — see the docstring's note on why
   * the caption half is exempt: nothing the operator wrote is being checked against it. */
  return rankMerged(userId, albumWeighted, mediaWeighted, clampLimit(opts.limit), queryText)
}
