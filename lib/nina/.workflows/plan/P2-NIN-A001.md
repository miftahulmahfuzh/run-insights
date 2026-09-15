> Adopted from `ADMIN_ALBUM_SEMANTIC_SEARCH_PLAN.md` phase 3. Source: `.workflows/plan/admin-album-semantic-search/phase-3.md`.
> Written and reconciled by /analyze — edit the source, not this copy.

# Phase 3: Search query layer + Server Action

**Plan set:** `ADMIN_ALBUM_SEMANTIC_SEARCH_PLAN.md`
**Analysis:** `20260915-085928-9RVY_code_analyzer.md`
**Satisfies:** R2, R3, R4 — text-only, image-only and combined semantic search over the Album, as
a callable, `user_id`-scoped, admin-gated server surface.
**Depends on:** Phase 1 (schema column + `embedNinaText`)
**Difficulty:** HARD
**Package:** `lib/nina/queries`, `lib/admin`

---

## Goal

After this phase the album can be searched semantically from the server: three cosine-similarity
reads over `nina_avatars.description_embedding` (text vector, caption vector, and a weighted
combination of both against the same column), plus one `requireAdmin()`-gated Server Action,
`searchNinaAvatarsAction`, that turns `{ text?, imageDataUri? }` into a ranked, serialization-safe
result set — captioning an uploaded query image through the existing `glm-4.6v` pipeline first.
Nothing renders it yet; phase 4 calls it as a black box.

---

## Correction to the analysis, up front

The analysis (`:91`, `:209`) states that drizzle-orm 0.45.2 exports no `cosineDistance` helper. **It
does.** Verified in this worktree's `node_modules`:

```
node --input-type=module -e "import {cosineDistance} from 'drizzle-orm'; console.log(typeof cosineDistance)"
→ function
```

It reaches the top level through `drizzle-orm/index.d.ts` → `./sql/index.js` → `./functions/index.js`
→ `./vector.js`, and its body is `sql\`${column} <=> ${JSON.stringify(value)}\``.

This plan **still hand-rolls the `<=>` expression**, and the reason is not ignorance of the helper:

1. `cosineDistance` binds the vector as an untyped parameter with **no `::vector` cast**. That
   resolves today (`vector <=> unknown` has exactly one candidate operator) but it is one
   overload-resolution accident away from a runtime error, and an explicit cast is self-documenting
   in a raw statement.
2. All three searches need **`1 - distance`** (a similarity) in the projection and, for R4, a
   *weighted sum of two distances* in the `ORDER BY`. That is a composed expression either way, so
   importing a helper for one of its three terms buys nothing and splits the spelling in two.

One private helper (`cosineDistanceTo`) owns the operator, the cast and the encoding, exactly once.
The encoding it uses — `JSON.stringify(vector)` — is byte-for-byte what drizzle's own
`PgVector.mapToDriverValue` emits, so the query vector and the stored column agree by construction.

---

## Interface Contract

**Creates:**

- `lib/nina/queries/avatarsearch.ts` (new module) exporting exactly three functions:
  - `searchNinaAvatarsByText(userId: string, queryEmbedding: readonly number[], opts?: { limit?: number }): Promise<NinaAvatarSearchPage>`
  - `searchNinaAvatarsByImageCaption(userId: string, captionEmbedding: readonly number[], opts?: { limit?: number }): Promise<NinaAvatarSearchPage>`
  - `searchNinaAvatarsByTextAndCaption(userId: string, textEmbedding: readonly number[], captionEmbedding: readonly number[], opts?: { limit?: number }): Promise<NinaAvatarSearchPage>`
- `lib/nina/queries/shapes.ts`: `NinaAvatarSearchRow` (type), `NinaAvatarSearchPage` (type)
- `lib/admin/ninaAlbumSearchSchema.ts` (new, plain module) exporting
  `ninaAlbumSearchSchema`, `NINA_ALBUM_SEARCH_TEXT_MAX`, `NINA_ALBUM_SEARCH_IMAGE_MAX_CHARS`,
  `type NinaAlbumSearchInput`
- `lib/admin/ninaAlbumSearchActions.ts` (new, `'use server'`) exporting exactly
  `searchNinaAvatarsAction(input: unknown): Promise<AdminSearchResult>`
- `tests/nina.avatarSearch.test.ts` (new), `tests/admin.albumSearch.test.ts` (new)

**Modifies (additive only):**

- `lib/nina/queries.ts` — one `export *` line + one line in the header's module map. **Shared with
  phase 2** (which adds `./queries/avatarEmbeddings` to the same block); see Step 3 for the
  reconciled final order and section numbers.
- `lib/nina/queries/shapes.ts` — two new interfaces after `NinaAvatarFolderPage`
- `lib/nina/queries.test.ts` — three names added to `BARREL_VALUE_EXPORTS`. **Shared with phase 2**,
  which adds four more and owns the header's prose counts (final total 92). This phase edits no
  prose line in that file — see Step 3.
- `lib/admin/ninaAlbumActions.ts` — one re-export block + **the two public result interfaces
  `AdminSearchHit` and `AdminSearchResult`** (phase 4 imports them from here) + one header bullet
- `tests/admin.albumActionsBarrel.test.ts` — one name in `BARREL_ACTIONS`, one new per-module pin,
  two mock factories widened

**Deletes:** none.
**Renames:** none.
**Signature changes:** none. No existing exported symbol changes shape.

**Requires (from Phase 1):**

1. `lib/db/schema/nina/avatars.ts` exports `ninaAvatars` with a **nullable** column spelled
   `descriptionEmbedding` in TS and `description_embedding` in SQL, built with drizzle's
   `vector('description_embedding', { dimensions: N })`.
2. **`descriptionEmbedding` is NOT added to `avatarColumns`** (`lib/nina/queries/columns.ts`). It is
   a 1–3 KB float array on every row; putting it in the shared projection would push it through
   `listNinaAvatarsInFolder`, `app/admin/nina/page.tsx` and across the Server Action boundary. If
   phase 1 adds it there, this phase's hit mapping silently starts shipping vectors to the browser.
3. `lib/nina/embedding.ts` exports
   `embedNinaText(text: string, opts?: { userId?: string | null; timeoutMs?: number }): Promise<number[]>`
   — `server-only`, one `fetch`, **throws** on failure (after its own `logNinaError`), returns a
   plain `number[]` of the column's dimension. **This phase passes `{ userId }` at both call sites**
   (Step 5): phase 1's contract asks for it in as many words, and without it every failure row lands
   in `nina_error_logs` with `user_id = null`.
4. The migration runs `CREATE EXTENSION IF NOT EXISTS vector;` before the `ADD COLUMN`.

**Leaves alone (owned by others):**

- `lib/admin/ninaAlbumDeferredDescribe.ts`, `lib/admin/ninaAlbumUploadActions.ts`,
  `lib/admin/ninaAlbumDescribeActions.ts`, `lib/admin/ninaAlbumAvatarActions.ts` (Phase 2)
- `lib/db/schema/nina/avatars.ts`, `drizzle/**`, `lib/nina/openrouter.ts`, `lib/nina/embedding.ts`
  (Phase 1)
- everything under `components/**` and `app/**` (Phase 4)
- `lib/admin/schema.ts` — deliberately NOT touched; see Step 4's rationale.

---

## Files

| File | Action | What changes |
|---|---|---|
| `lib/nina/queries/shapes.ts` | modify | insert `NinaAvatarSearchRow` + `NinaAvatarSearchPage` after `NinaAvatarFolderPage` (`:467`) |
| `lib/nina/queries/avatarsearch.ts` | create | the three cosine searches, one shared ranking core |
| `lib/nina/queries.ts` | modify | `export * from './queries/avatarsearch'` after `:67`; header map line after `:20` |
| `lib/nina/queries.test.ts` | modify | three names inserted between `:98` and `:99`. **No prose edit** — phase 2 owns `:11` and `:21-24` |
| `lib/admin/ninaAlbumSearchSchema.ts` | create | the Zod boundary + its two ceilings |
| `lib/admin/ninaAlbumSearchActions.ts` | create | `searchNinaAvatarsAction` |
| `lib/admin/ninaAlbumActions.ts` | modify | header bullet at `:21`; the two public result interfaces beside `AdminActionResult` (`:43-49`); re-export block after `:96` |
| `tests/nina.avatarSearch.test.ts` | create | generated-SQL proof via `tests/support/fakeDb.ts` |
| `tests/admin.albumSearch.test.ts` | create | the action's refusals, wiring and mapping |
| `tests/admin.albumActionsBarrel.test.ts` | modify | `:26` mock widened, `:28-44` list, new pin after `:88` |

---

## Implementation Steps

### Step 1: The two DTOs

**File:** `lib/nina/queries/shapes.ts:467` — insert immediately after the closing `}` of
`NinaAvatarFolderPage`, before the `NinaAvatarManifestEntry` docstring at `:469`.

**Change:** add the search page shape. It is `NinaAvatarFolderPage` with one extra field per row, so
it stays **assignable to** `NinaAvatarFolderPage` and `app/admin/nina/page.tsx`'s album-arm row
mapping works on it unchanged (the plan index's "same shape … so the mapping can be reused").

**Code:**

```ts
/**
 * One ranked row of a semantic search over the album — `NinaAvatarRow` plus the score it ranked on.
 *
 * A SUPERSET of `NinaAvatarRow` rather than a parallel shape, deliberately: `app/admin/nina/page.tsx`
 * already owns the one `NinaAvatarRow -> AlbumExplorerPhoto` mapping this app has, and a search
 * result is the same photograph that the grid draws — it has just been found a different way. An
 * extra property is structurally invisible to that mapping, so a second copy of it never has to
 * exist.
 */
export interface NinaAvatarSearchRow extends NinaAvatarRow {
  /**
   * Cosine similarity against the query vector, `1 - (embedding <=> query)`.
   *
   * In `[-1, 1]` by definition, and in practice in `[0, 1]` for two embeddings of English prose
   * from one model — a negative score means the two texts are actively opposed, which a description
   * corpus does not produce. It is a RELATIVE number: read it to order results and to grey out the
   * weak tail, never as a percentage, and never compare one query's scores against another's.
   *
   * On `searchNinaAvatarsByTextAndCaption` it is the WEIGHTED similarity — see that function.
   */
  score: number
}

/**
 * A page of search results — the same `{ rows, total }` pair `NinaAvatarFolderPage` carries, and
 * assignable to it, so nothing downstream needs a second branch.
 *
 * `total` means something different here and the difference matters: it is **how many album rows
 * were actually compared**, i.e. how many carry a `description_embedding` at all. It is NOT the
 * album's size and it is NOT a pager's denominator — search returns one flat top-N list and has no
 * pager. It is the coverage number: "48 shown, out of 342 photos that have been described". Phase
 * 2's backfill is what moves it.
 */
export interface NinaAvatarSearchPage {
  rows: NinaAvatarSearchRow[]
  /** Rows with a non-NULL `description_embedding`, for this user, across EVERY folder. */
  total: number
}
```

**Impact:** type-only; no runtime export, so `lib/nina/queries.test.ts`'s second assertion
("everything the barrel exposes at runtime is a function") is unaffected.

---

### Step 2: The query module

**File:** `lib/nina/queries/avatarsearch.ts` — new file.

**Change:** three exported searches over one private ranking core. Every statement is
`userId`-scoped in its `WHERE`, per the barrel's rule 1.

Design notes that are load-bearing and must survive an edit:

- **`ORDER BY` is on the DISTANCE ascending, not on `1 - distance` descending.** Same ordering,
  but only the first spelling can be answered by a pgvector HNSW `vector_cosine_ops` index. The
  similarity is computed in the projection instead.
- **`isNotNull(descriptionEmbedding)` is in the scope of BOTH statements.** Without it the count
  reports the whole album as "searched" while only the embedded subset was ranked, and NULL
  distances would sort into the tail as if they were weak matches.
- **The combined score is a weighted average of the two SIMILARITIES, expressed as a weighted
  average of the two DISTANCES.** The identity is exact because the weights sum to 1:
  `w·(1−d₁) + (1−w)·(1−d₂) = 1 − (w·d₁ + (1−w)·d₂)`. So one expression serves both the ranking and
  the reported score, and there is no second place for the weights to drift.
- The query vector is bound **twice** per distance term (once in the projection, once in the
  `ORDER BY`) — ~18 KB of text per binding at 1536 dimensions, ~72 KB for the combined statement.
  Accepted: it is one interactive admin request, and a CTE to bind it once would trade that for a
  statement neither the fake-db test nor a reader can follow.

**Code:**

```ts
import { and, asc, desc, eq, isNotNull, sql, type SQL } from 'drizzle-orm'

import { db } from '@/lib/db'
import { ninaAvatars } from '@/lib/db/schema'
import type { NinaAvatarSearchPage } from './shapes'
import { avatarColumns } from './columns'

/**
 * §9c Semantic search over the album — R2/R3/R4 of the admin image-search set.
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
): Promise<NinaAvatarSearchPage> {
  const scope = searchScope(userId)

  const [rows, counted] = await Promise.all([
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
  opts: { limit?: number } = {},
): Promise<NinaAvatarSearchPage> {
  return rankByDistance(userId, cosineDistanceTo(queryEmbedding), clampLimit(opts.limit))
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
  return rankByDistance(userId, cosineDistanceTo(captionEmbedding), clampLimit(opts.limit))
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
  opts: { limit?: number } = {},
): Promise<NinaAvatarSearchPage> {
  const weighted = sql`(${NINA_SEARCH_TEXT_WEIGHT}::float8 * ${cosineDistanceTo(textEmbedding)} + ${NINA_SEARCH_CAPTION_WEIGHT}::float8 * ${cosineDistanceTo(captionEmbedding)})`
  return rankByDistance(userId, weighted, clampLimit(opts.limit))
}
```

**Impact:** three new barrel exports. No existing query changes. `ci:data-layer-guard` scans
`lib/db/queries*` only, so it is unaffected; the `userId`-first rule is honoured anyway.

---

### Step 3: Barrel + its two pins

> **RECONCILED, 2026-09-15 — phase 2 edits both of these files too, concurrently.** The split below
> is the reconciler's, and following it exactly is what keeps the two phases from colliding on a
> single line. Phase 2 adds `./queries/avatarEmbeddings` to the same export block and **owns both of
> `lib/nina/queries.test.ts`'s prose counts**; this phase adds its three array names and touches no
> prose. The set's final module order is `avatars`, `avatarEmbeddings`, `avatarsearch`, and the
> final barrel total is 92 (85 today + phase 2's four + this phase's three).

**File:** `lib/nina/queries.ts:20` — add a line to the header's module map, immediately after phase
2's `queries/avatarEmbeddings.ts` line (which itself sits directly under `queries/avatars.ts`).
**§9d, not §9c** — phase 2's module took §9c, and two modules under one banner is a map that stops
answering "where does this live":

```
 *   queries/avatarEmbeddings.ts §9c    the description_embedding writes (semantic search)
 *   queries/avatarsearch.ts     §9d    the album's semantic search (R2/R3/R4)
```

**File:** `lib/nina/queries.ts:67` — add one `export *` line. The block as it looks once **both**
concurrent phases have landed — quote this, and if phase 2's line is not there yet, put yours
directly after `'./queries/avatars'` and leave the gap for it:

```ts
export * from './queries/avatars'
export * from './queries/avatarEmbeddings'
export * from './queries/avatarsearch'
export * from './queries/tuning'
```

On a git conflict in this block the resolution is the union in exactly that order — never a choice
between the two new lines.

**File:** `lib/nina/queries.test.ts:11` and `:21-24` — **do not touch.** Phase 2 rewrites the prose
counts once, for the finished set (85 → 92). Two phases rewriting one line with two different
numbers is the only real collision these two files had, and this is where it was removed.

**File:** `lib/nina/queries.test.ts:98` — insert the three names between `'resolveNinaPhotoReference',`
(`:98`) and `'setCurrentNinaAvatar',` (`:99`), keeping the list sorted. This region is shared with
phase 2 (its `'setNinaAvatarDescriptionAndEmbedding'` lands three lines below yours); the reconciled
final state of the whole region is:

```ts
  'resolveNinaPhotoReference',
  // admin-album-semantic-search phase 3: the album's semantic search (R2/R3/R4), documented
  // growth under this file's "a name was ADDED" rule.
  'searchNinaAvatarsByImageCaption',
  'searchNinaAvatarsByText',
  'searchNinaAvatarsByTextAndCaption',
  'setCurrentNinaAvatar',
  'setNinaAvatarDescription',
  // admin-album-semantic-search phase 2: writes prose and vector in one UPDATE.
  'setNinaAvatarDescriptionAndEmbedding',
```

Add only your three if phase 2 has not landed: the array must match `Object.keys(barrel)` **at your
commit**, and it does either way because each phase's names arrive with the exports that back them.

**Impact:** the frozen-surface test passes with the documented growth instead of failing as a diff
of names. Nothing else reads the barrel's key list.

---

### Step 4: The Zod boundary

**File:** `lib/admin/ninaAlbumSearchSchema.ts` — new file.

**Why not `lib/admin/schema.ts`:** `lib/admin/chatPhotoSchema.ts`'s header already ruled on this
exact situation, verbatim — *"Phase 1 of this plan set rewrites … that file in the same worktree,
and two sessions appending to one file is a merge conflict manufactured on purpose."* Phases 2 and 3
run concurrently in this set and both touch `lib/admin/`; a separate module removes the collision
entirely and follows a precedent this repo already set for the same reason.

**Change:**

```ts
import { z } from 'zod'

/**
 * Everything `searchNinaAvatarsAction` accepts from a browser — the admin album's semantic search,
 * R2/R3/R4.
 *
 * ── ITS OWN FILE, AND NOT `lib/admin/schema.ts` ─────────────────────────────────────────────
 * `lib/admin/chatPhotoSchema.ts`'s header made this call first and its first reason is this
 * phase's reason verbatim: another phase of this same plan set is editing `lib/admin/` in the same
 * worktree at the same time, and two sessions appending to one file is a merge conflict
 * manufactured on purpose. Its second reason applies too — a schema module carrying a `'use server'`
 * sibling's ceilings is a plain module, and these two constants have to be importable by a test
 * without dragging an action's import graph in.
 *
 * ── WHAT A SCHEMA IS AND IS NOT ─────────────────────────────────────────────────────────────
 * Shape only. Nothing here knows a user id; ownership is the action's job, and every statement
 * below it carries `user_id` in its WHERE. What IS here is the one cross-field rule — a search
 * with neither arm is not a search — because that is a pure question about the payload.
 */

/**
 * How long a typed query may be.
 *
 * A search phrase, not an essay: the embedding model gets one sentence's worth of intent, and a
 * 4000-character paste is a mis-click or a paste of the wrong buffer. Refused rather than
 * truncated, this repo's rule for a schema (`chatPhotoDescriptionField`): silently shortening the
 * query would rank against half of what the operator asked for and report success.
 */
export const NINA_ALBUM_SEARCH_TEXT_MAX = 500

/**
 * The hard ceiling on the query image, measured in CHARACTERS of its data URI.
 *
 * ── THE REAL BOUND IS NEXT'S 1 MB SERVER ACTION BODY ────────────────────────────────────────
 * `next.config.ts` sets no `serverActions.bodySizeLimit`, so the default 1 MB applies and the data
 * URI is the whole body. 700 000 characters is ~512 KB of image bytes after base64's 4/3 expansion,
 * which leaves real headroom for the action's framing and for a typed query riding alongside it.
 *
 * ── AND IT IS A CEILING, NOT A TARGET ───────────────────────────────────────────────────────
 * The browser is expected to re-encode the picked file to a ~1024 px-long-edge JPEG before sending
 * it (`components/admin/explorer/chatPhotoUpload.ts`'s `ADMIN_CHAT_PHOTO_LONG_EDGE_PX`), which
 * lands around 150–250 KB → 200–340 KB of base64. That size is not arbitrary: it is the size the
 * chat path already pushes through this exact `glm-4.6v` describe pipeline in production, and
 * shrinking it much further risks `describeNinaImagesWithFetch`'s token-floor guard refusing the
 * response because the image contributed too few prompt tokens to be believed.
 *
 * The query image is NEVER written to Blob — it is an ephemeral comparison input, and
 * `describeNinaImagesWithFallback` takes a `NinaDescribeImage { dataUri }` directly.
 */
export const NINA_ALBUM_SEARCH_IMAGE_MAX_CHARS = 700_000

/**
 * The three types `/admin/nina` already accepts for an avatar, as a base64 data URI. No `svg`, no
 * `gif`, and no hosted `https:` URL: this string is placed straight into an `image_url` part sent
 * to a vendor whose measured failure mode is "200 OK with invented content", so what it may claim
 * to be is allow-listed rather than passed through — the same posture `toDataUri` takes in
 * `lib/nina/vision.ts`.
 *
 * One greedy character class and an optional pad; no nested quantifier, so it is linear on the
 * 700 KB string the ceiling above permits.
 */
const NINA_ALBUM_SEARCH_DATA_URI_RE = /^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/

/**
 * **"a search field, plus a button to upload image"** — either one, or both.
 *
 * `.max()` BEFORE `.transform()`, this repo's ordering rule: an over-long query is REFUSED and
 * reported, never normalised into range. The transform folds every run of whitespace to one space
 * and trims, so `"  red   dress \n"` and `"red dress"` produce the same vector and therefore the
 * same ranking — an embedding model does not need the operator's stray newline to be meaningful.
 *
 * The refine is the one rule worth stating twice: **an empty query never reaches a vendor.** An
 * all-blank box normalises to `''` and is refused here, before `describeNinaImagesWithFallback` and
 * before `embedNinaText` — a blank search that cost a model call and returned the album in
 * arbitrary order would be the worst of both.
 */
export const ninaAlbumSearchSchema = z
  .object({
    text: z
      .string()
      .max(NINA_ALBUM_SEARCH_TEXT_MAX)
      .transform((value) => value.replace(/\s+/g, ' ').trim())
      .optional(),
    imageDataUri: z
      .string()
      .max(NINA_ALBUM_SEARCH_IMAGE_MAX_CHARS)
      .regex(NINA_ALBUM_SEARCH_DATA_URI_RE, 'Not an inline JPEG, PNG or WebP')
      .optional(),
  })
  .refine((value) => (value.text ?? '').length > 0 || value.imageDataUri != null, {
    message: 'A search needs some text, a photo, or both',
    path: ['text'],
  })

export type NinaAlbumSearchInput = z.infer<typeof ninaAlbumSearchSchema>
```

**Impact:** a new plain module. Nothing imports it yet except the action and its test.

---

### Step 5: The Server Action

**File:** `lib/admin/ninaAlbumSearchActions.ts` — new file.

**Change:** one exported async function. A `'use server'` module may export only async functions
(`lib/admin/ninaAlbumUploadActions.ts:29-33`), so the result interfaces cannot live here.

> **RECONCILED, 2026-09-15.** This plan originally kept them module-private and told phase 4 to
> recover the shape with `Awaited<ReturnType<typeof searchNinaAvatarsAction>>`. Phase 4 was written
> against them being **named, exported types on the plain barrel** — it writes
> `import type { AdminSearchHit } from '@/lib/admin/ninaAlbumActions'` in three files and types two
> test fixtures with it. The barrel wins: it is where `AdminActionResult` already lives (`:43-49`),
> which is the same problem solved the same way, and it is the only module of the pair that is
> allowed to export a type at all. **So `AdminSearchHit` and `AdminSearchResult` are declared in
> `lib/admin/ninaAlbumActions.ts` (Step 6) and imported here as types.** The names are this plan's
> (`Admin*`, matching `AdminActionResult`); phase 4's plan has been edited to use them.
> **`AdminSearchMode` is exported from that same barrel** — it is a member of `AdminSearchResult`,
> so a consumer that reads the result type reaches it anyway, and phase 4's Requires block declares
> it. Phase 4 does not read `mode` at runtime; that is a reason not to render it, not a reason to
> hide the type.

**Code:**

```ts
'use server'

import type {
  AdminSearchHit,
  AdminSearchMode,
  AdminSearchResult,
} from '@/lib/admin/ninaAlbumActions'
import { ninaAlbumSearchSchema } from '@/lib/admin/ninaAlbumSearchSchema'
import { requireAdmin } from '@/lib/admin/requireAdmin'
import { describeSubjectForSide } from '@/lib/nina/album'
import { embedNinaText } from '@/lib/nina/embedding'
import {
  searchNinaAvatarsByImageCaption,
  searchNinaAvatarsByText,
  searchNinaAvatarsByTextAndCaption,
} from '@/lib/nina/queries'
import {
  describeNinaImagesWithFallback,
  NinaVisionTokenFloorError,
  NinaVisionTransportError,
} from '@/lib/nina/vision'

/**
 * **The album's semantic search, as one Server Action.** R2 (text), R3 (image), R4 (both), server
 * side.
 *
 * ── THE SHAPE OF THE ANSWER TO "SEARCH BY IMAGE" ────────────────────────────────────────────
 * There is no image-embedding model in this app's arsenal, so an uploaded query photo is CAPTIONED
 * first — `describeNinaImagesWithFallback`, the same z.ai-then-OpenRouter `glm-4.6v` path that
 * wrote every album row's `description` — and the caption is then embedded and searched exactly as
 * typed text is. Which means the whole feature is one comparison, run against one column, and R4's
 * "resolve the scoring" is a weighted average of two numbers that were always comparable
 * (`lib/nina/queries/avatarsearch.ts`).
 *
 * ── THE QUERY IMAGE IS NEVER STORED ─────────────────────────────────────────────────────────
 * No Blob PUT, no row, no cleanup. `describeNinaImagesWithFallback` takes a
 * `NinaDescribeImage { dataUri }` directly — only `describeNinaImages` needs a hosted URL, and only
 * because it is fetching bytes this action already has. A comparison input that lives for one
 * request has no business in a store that a reaper then has to learn about.
 *
 * ── `subject: 'self'`, AND IT IS NOT A DETAIL ───────────────────────────────────────────────
 * Every `nina_avatars.description` in the corpus was written by `NINA_SELF_DESCRIBE_SYSTEM_PROMPT`
 * (`describeNinaAvatarAction`, `scheduleDescribe` — both pass `describeSubjectForSide('hers')`).
 * Captioning the QUERY image with the runner prompt instead would produce a paragraph in a
 * different register, hunting for a man who is not in the frame, and cosine similarity would then
 * be measuring prompt style as much as content. The query must be described by the same witness
 * that described the corpus, so this action calls the same mapping rather than spelling `'self'`.
 *
 * ── NO `revalidatePath`, AND NO WRITE OF ANY KIND ───────────────────────────────────────────
 * This is the layer's only READ action. It stores nothing, changes nothing, and must not
 * invalidate the album route — a search that re-rendered the grid underneath its own results is a
 * search that fights the screen it is on.
 *
 * ── IT IS AWAITED, AND THAT IS CORRECT ──────────────────────────────────────────────────────
 * Two model calls on the request path, deliberately: the operator pressed Search and there is
 * nothing to show until they return. This is `rankNinaSearchHits`' situation with the opposite
 * answer, and the difference is that there is no correct result already on screen to protect —
 * F35's search box has SQL hits to show while the model thinks; this one has a blank pane. The
 * non-blocking rule (`scripts/check-llm-payload-boundary.mjs` rule 2) is about RENDER paths; a
 * Server Action fired from a click is exactly where an expensive call belongs.
 */

/* `AdminSearchHit`, `AdminSearchResult` and `AdminSearchMode` are declared on the plain barrel
 * (`lib/admin/ninaAlbumActions.ts`, Step 6) and imported above, beside the rule that forces it: a
 * `'use server'` module may export only async functions, and phase 4 imports the hit type by name
 * in three files. `AdminActionResult` already lives there for the same reason. */

/**
 * The three-way branch, as one function so the caller needs no `NinaAvatarSearchPage` annotation
 * and therefore no `import type` from the query layer (see `AdminSearchHit`'s note).
 *
 * The throw is unreachable: `ninaAlbumSearchSchema`'s refine guarantees at least one arm. It is a
 * throw rather than an empty page because a silent empty result here would look exactly like "the
 * album has nothing like that", which is the one wrong answer this function could give.
 */
async function runSearch(
  userId: string,
  textEmbedding: number[] | null,
  captionEmbedding: number[] | null,
) {
  if (textEmbedding !== null && captionEmbedding !== null) {
    return searchNinaAvatarsByTextAndCaption(userId, textEmbedding, captionEmbedding)
  }
  if (textEmbedding !== null) return searchNinaAvatarsByText(userId, textEmbedding)
  if (captionEmbedding !== null) return searchNinaAvatarsByImageCaption(userId, captionEmbedding)
  throw new Error('searchNinaAvatarsAction: no query arm — the schema should have refused this')
}

/** One ranked row, narrowed for the browser. The album arm of `app/admin/nina/page.tsx`, inlined. */
function toHit(row: {
  id: string
  blobUrl: string
  thumbUrl: string | null
  folder: string
  filename: string | null
  width: number | null
  height: number | null
  bytes: number | null
  source: string
  isCurrent: boolean
  description: string | null
  cropScale: number | null
  cropX: number | null
  cropY: number | null
  createdAt: Date
  score: number
}): AdminSearchHit {
  return {
    id: row.id,
    url: row.blobUrl,
    thumbUrl: row.thumbUrl,
    folder: row.folder,
    filename: row.filename ?? row.id,
    width: row.width,
    height: row.height,
    bytes: row.bytes,
    source: row.source,
    isCurrent: row.isCurrent,
    description: row.description,
    crop: { scale: row.cropScale, x: row.cropX, y: row.cropY },
    createdAt: row.createdAt.toISOString(),
    score: row.score,
  }
}

/**
 * **Search the album.** `{ text?, imageDataUri? }` in, a ranked top-48 out.
 *
 * `requireAdmin()` is line 1 and the `userId` it returns is the only one any statement below sees —
 * the action never reads an id from its own argument, so a hand-crafted POST cannot search someone
 * else's album (plan invariant 3).
 *
 * Failure is always the same shape: `ok: false`, an operator-readable sentence, `hits: []`,
 * `searched: 0`. The vendor layers have already written their own `nina_error_logs` rows by the
 * time an error reaches here (`recordDescribeFailure` for the caption, `embedNinaText`'s own
 * logging for the vectors), so this catch reports rather than re-logs — the posture
 * `describeNinaAvatarAction` takes.
 */
export async function searchNinaAvatarsAction(input: unknown): Promise<AdminSearchResult> {
  const { userId } = await requireAdmin()

  const parsed = ninaAlbumSearchSchema.safeParse(input)
  if (!parsed.success) {
    return {
      ok: false,
      error: 'Type something to look for, or add a photo to match against.',
      hits: [],
      searched: 0,
      mode: 'text',
    }
  }

  const typed = parsed.data.text != null && parsed.data.text.length > 0 ? parsed.data.text : null
  const imageDataUri = parsed.data.imageDataUri ?? null
  const mode: AdminSearchMode =
    typed !== null && imageDataUri !== null ? 'both' : typed !== null ? 'text' : 'image'

  try {
    /* The caption first and on its own await: the embeddings below need it, and running it beside
     * them would mean embedding a caption that does not exist yet. */
    const caption =
      imageDataUri === null
        ? null
        : (
            await describeNinaImagesWithFallback(fetch, [{ dataUri: imageDataUri }], {
              subject: describeSubjectForSide('hers'),
              userId,
            })
          ).description

    /* The two embed calls are independent, so they go together. On a combined search that is one
     * round trip's latency instead of two.
     *
     * `{ userId }` is passed because phase 1's contract asks for it in as many words — it is the
     * `user_id` on the `nina_error_logs` row `embedNinaText` writes before it throws, and a failure
     * row that cannot say whose search produced it is a row nobody can act on. */
    const [textEmbedding, captionEmbedding] = await Promise.all([
      typed === null ? null : embedNinaText(typed, { userId }),
      caption === null ? null : embedNinaText(caption, { userId }),
    ])

    const page = await runSearch(userId, textEmbedding, captionEmbedding)

    return {
      ok: true,
      mode,
      searched: page.total,
      hits: page.rows.map(toHit),
      ...(caption === null ? {} : { caption }),
    }
  } catch (cause) {
    /* The vision classes are the ONE failure worth its own sentence: it names the half of the query
     * the operator can actually change, and a token-floor refusal in particular means the photo
     * reached the model as too little to believe — a different photo fixes it, a retry does not. */
    const photoFailed =
      cause instanceof NinaVisionTokenFloorError || cause instanceof NinaVisionTransportError
    console.error('[album-search] search failed', cause)
    return {
      ok: false,
      error: photoFailed
        ? 'Could not read that photo. Try a different one, or search by text.'
        : 'The search could not run. Try again.',
      hits: [],
      searched: 0,
      mode,
    }
  }
}
```

**Impact:** a new Server Action. Nothing calls it until phase 4; `npm run knip` (not a CI step —
`.github/workflows/ci.yml` does not run it) will list it as an unused export until then.

---

### Step 6: The action barrel

**File:** `lib/admin/ninaAlbumActions.ts:21` — add a sixth bullet to the "ONE PATH, FIVE MODULES"
list, after the `ninaAlbumDeferredDescribe.ts` bullet. Change the heading on `:9` from
`ONE PATH, FIVE MODULES` to `ONE PATH, SIX MODULES` and append:

```
 *   · `ninaAlbumSearchActions.ts` — the album's semantic search: one READ action, the layer's only
 *     one, which stores nothing and revalidates nothing.
```

**File:** `lib/admin/ninaAlbumActions.ts:49` — declare the search result shapes immediately after
`AdminActionResult`, which is the precedent this follows exactly: a `'use server'` module may export
only async functions, so the shapes every client imports live on the plain barrel beside the
re-exports. Phase 4 imports `AdminSearchHit` by name in three files.

```ts
/** Which arms of the query actually ran. Echoed back so a results header can name it. */
export type AdminSearchMode = 'text' | 'image' | 'both'

/**
 * One ranked photograph, narrowed to what a browser needs — the same field set
 * `app/admin/nina/page.tsx` maps a `NinaAvatarRow` down to for the grid, plus `score`.
 *
 * `pathname`, `sourceKey`, `thumbPathname` and `announcedAt` are absent for that page's stated
 * reason: a browser has no use for them, so they never cross the serialization boundary. Spelled
 * out here rather than imported from `@/lib/nina/queries` so that a client component importing this
 * barrel never has a module that imports `db` in its graph, not even as an erased `import type` —
 * `lib/admin/ninaAlbumUploadActions.ts`'s `AdminManifestEntry` rule.
 *
 * **It is `ExplorerPhotoBase` plus `score`, and that is deliberate**: add `origin: 'album'` and this
 * IS an `AlbumExplorerPhoto` (`components/admin/explorer/model.ts:25-66`), so a result can be fed to
 * anything the browsing grid can draw. `description` rides along under that model's own standing
 * rule — carried, never rendered (`model.ts:49`, invariant 5) — which is why phase 4's results grid
 * reads only seven of these fields and prints none of the prose.
 */
export interface AdminSearchHit {
  id: string
  /** The ORIGINAL blob — what the full-screen viewer reads. */
  url: string
  /** The 256 px derived JPEG, or `null`; every consumer falls back to `url`. */
  thumbUrl: string | null
  folder: string
  /** The file's name, or the id for a row written before the column existed. */
  filename: string
  width: number | null
  height: number | null
  bytes: number | null
  source: string
  isCurrent: boolean
  /** Carried, never rendered — `components/admin/explorer/model.ts:49`, invariant 5. */
  description: string | null
  crop: NinaCropInput
  /** ISO 8601. A `Date` does not survive the RSC boundary. */
  createdAt: string
  /** Cosine similarity against the query — relative, for ordering and for greying out the tail. */
  score: number
}

/** `searchNinaAvatarsAction`'s result. Its own shape, because the client needs the ranked list. */
export interface AdminSearchResult extends AdminActionResult {
  /**
   * Ranked best-first. **ALWAYS an array** — `[]` on a refusal, on a vendor failure and on a
   * genuine no-match alike — so the results pane never branches on `undefined`. `ok` is what
   * separates "nothing matched" from "the search did not run".
   */
  hits: AdminSearchHit[]
  /**
   * How many album rows carried an embedding and were therefore actually compared. The coverage
   * number, not the album's size: while phase 2's backfill has not run, this is small and the
   * results pane should say so rather than let the operator conclude the photo is not there.
   */
  searched: number
  mode: AdminSearchMode
  /** What the vision model saw in the uploaded query image. Present only when one was sent. */
  caption?: string
}
```

`NinaCropInput` is a type-only import (`import type { NinaCropInput } from '@/lib/nina/crop'`) —
add it to this file's import block if it is not already there. `lib/nina/crop.ts` is a pure module
with no `db` edge, so it is safe in a graph a client component reaches.

**File:** `lib/admin/ninaAlbumActions.ts:96` — append a re-export block after the
`ninaAlbumFolderActions` block:

```ts
export { searchNinaAvatarsAction } from '@/lib/admin/ninaAlbumSearchActions'
```

**Impact:** the barrel's runtime surface grows by one name (the two interfaces and the mode alias are
type-only and invisible to `tests/admin.albumActionsBarrel.test.ts`'s key pin); the pin in Step 8
records the action.

---

### Step 7: Generated-SQL proof for the query layer

**File:** `tests/nina.avatarSearch.test.ts` — new file. Uses `tests/support/fakeDb.ts`, the
recording neon-http driver, so the assertions are against the REAL dialect output with no database
— the idiom `tests/nina.photoRefs.test.ts` and `tests/nina.softDelete.test.ts` already use.

**Code:**

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { installFakeDb, projectedRow, uninstallFakeDb, type FakeDb } from './support/fakeDb'

/**
 * The album's semantic search, asserted against generated SQL rather than against a spy.
 *
 * Four properties, and every one of them is a thing a `vi.fn()` could not see:
 *
 *   1. Both statements of every search are ownership-scoped AND restricted to rows that HAVE an
 *      embedding — so the ranked page and the coverage total can never describe different sets.
 *   2. The ORDER BY is on the raw distance ascending. `1 - (...) DESC` is the same ordering and is
 *      the one spelling a pgvector HNSW index cannot answer, so the direction is pinned here.
 *   3. The combined read carries BOTH query vectors and the two weights in ONE statement — R4's
 *      whole claim. A merge in JS would pass a behaviour test and fail this one.
 *   4. The cap is the cap: an oversized `limit` comes back as 48 (`NINA_SEARCH_LIMIT`).
 */

type Queries = typeof import('@/lib/nina/queries')

/** 12 chars, so `isValidId` would accept it and `newId()` could have produced it. */
const USER = 'usrAAAAAAAAA'

const TEXT_VECTOR = [0.1, 0.2, -0.3]
const CAPTION_VECTOR = [-0.4, 0.5, 0.6]

let fake: FakeDb
let queries: Queries

beforeEach(async () => {
  vi.resetModules()
  fake = installFakeDb()
  queries = await import('@/lib/nina/queries')
})

afterEach(() => {
  uninstallFakeDb()
  vi.resetModules()
})

/** The candidate predicate, in both statements of every search. */
const SCOPED = ['"nina_avatars"."user_id" = $', '"description_embedding" is not null'] as const

describe('the candidate set is ownership-scoped and embedding-only', () => {
  it('holds for the ranked page and for the coverage count alike', async () => {
    await queries.searchNinaAvatarsByText(USER, TEXT_VECTOR)

    expect(fake.queries).toHaveLength(2)
    for (const index of [0, 1]) {
      const statement = fake.sqlAt(index)
      for (const predicate of SCOPED) expect(statement, predicate).toContain(predicate)
    }
    expect(fake.sqlAt(1)).toContain('count(*)')
  })
})

describe('the ranking is index-shaped', () => {
  it('orders by the raw cosine distance ascending and projects the similarity', async () => {
    await queries.searchNinaAvatarsByText(USER, TEXT_VECTOR)

    const ranked = fake.sqlAt(0)
    expect(ranked).toContain('<=>')
    expect(ranked).toContain('::vector')
    // The similarity is in the projection…
    expect(ranked).toContain('1 - (')
    // …and the ordering is on the distance, ascending, which is what an HNSW index can answer.
    expect(ranked).toMatch(/order by \([^)]*<=>[^)]*\) asc/)
    expect(ranked).not.toMatch(/order by[\s\S]*1 - /)
    // The album's own tiebreak rides behind it, so equal descriptions do not swap between renders.
    expect(ranked).toContain('"nina_avatars"."created_at" desc')
  })

  it('binds the query vector in pgvector text form', async () => {
    await queries.searchNinaAvatarsByText(USER, TEXT_VECTOR)

    expect(fake.queries[0]?.params).toContain(JSON.stringify(TEXT_VECTOR))
  })

  it('caps the limit at 48 however much a caller asks for', async () => {
    // 48 is also the length of PhotoViewer's dot row once phase 4 opens the overlay over the
    // whole result set — see NINA_SEARCH_LIMIT's note. Raising it is a UI change, not a tuning.
    await queries.searchNinaAvatarsByText(USER, TEXT_VECTOR, { limit: 5000 })

    expect(fake.queries[0]?.params).toContain(48)
  })
})

describe('image-caption search IS text search', () => {
  it('emits the identical statement for the identical vector', async () => {
    await queries.searchNinaAvatarsByText(USER, TEXT_VECTOR)
    const byText = fake.sqlAt(0)

    fake.reset()
    await queries.searchNinaAvatarsByImageCaption(USER, TEXT_VECTOR)

    /* Not a redundant assertion: it is the plan index's Decision ("image-only = caption, then the
     * SAME text-embedding search") written as a test. A future edit that gives image search its own
     * column or its own operator has to change this line and say why. */
    expect(fake.sqlAt(0)).toBe(byText)
  })
})

describe('the combined search resolves both scores in one statement (R4)', () => {
  it('carries both vectors and both weights, and still orders ascending', async () => {
    await queries.searchNinaAvatarsByTextAndCaption(USER, TEXT_VECTOR, CAPTION_VECTOR)

    expect(fake.queries).toHaveLength(2)
    const ranked = fake.sqlAt(0)
    expect(ranked.match(/<=>/g)).toHaveLength(4) // two terms, in the projection and the ORDER BY
    expect(ranked).toContain('::float8')

    const params = fake.queries[0]?.params ?? []
    expect(params).toContain(JSON.stringify(TEXT_VECTOR))
    expect(params).toContain(JSON.stringify(CAPTION_VECTOR))
    /* Four bindings of the split: two weights, each bound once in the projection and once in the
     * ORDER BY. The literal is deliberate — `NINA_SEARCH_TEXT_WEIGHT` is module-private (the
     * barrel pins that every runtime export is a function), so changing the split is a two-line
     * change: the constant, and this line. That is the point of it being one named constant. */
    expect(params.filter((value) => value === 0.5)).toHaveLength(4)
  })
})

describe('the rows come back scored', () => {
  it('maps the projection and reports the candidate total', async () => {
    fake.enqueue(
      [
        projectedRow(
          'avtAAAAAAAAA', // id
          'https://blob/x.jpg', // blobUrl
          'nina/u/x.jpg', // pathname
          '2026/bali', // folder
          'x.jpg', // filename
          null, // thumbUrl
          null, // thumbPathname
          1024, // width
          768, // height
          200_000, // bytes
          'upload', // source
          null, // cropScale
          null, // cropX
          null, // cropY
          'she is on a beach', // description
          false, // isCurrent
          null, // announcedAt
          '2026-09-01 10:00:00+00', // createdAt
          0.82, // score
        ),
      ],
      [projectedRow(342)],
    )

    const page = await queries.searchNinaAvatarsByText(USER, TEXT_VECTOR)

    expect(page.total).toBe(342)
    expect(page.rows).toHaveLength(1)
    expect(page.rows[0]?.id).toBe('avtAAAAAAAAA')
    expect(page.rows[0]?.score).toBeCloseTo(0.82)
  })
})

describe('a malformed query vector never reaches Postgres', () => {
  it('refuses an empty embedding', async () => {
    await expect(queries.searchNinaAvatarsByText(USER, [])).rejects.toThrow(/empty/)
    expect(fake.queries).toHaveLength(0)
  })

  it('refuses a non-finite value, which JSON.stringify would have written as null', async () => {
    await expect(queries.searchNinaAvatarsByText(USER, [0.1, Number.NaN])).rejects.toThrow(
      /non-finite/,
    )
    expect(fake.queries).toHaveLength(0)
  })
})
```

**Note for the implementer:** the `projectedRow` column order above is `avatarColumns`' declaration
order in `lib/nina/queries/columns.ts` (18 keys) followed by `score`. If phase 1 has changed
`avatarColumns`, that is a contract violation — see the Interface Contract's Requires item 2 — and
this row is the thing that will notice.

---

### Step 8: The action's tests and the barrel pin

**File:** `tests/admin.albumSearch.test.ts` — new file.

**Code:**

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * `searchNinaAvatarsAction`'s three jobs: refuse an empty query BEFORE any vendor call, wire each
 * of the three modes to its own read, and narrow a row to what a browser may see.
 *
 * Every edge is doubled — this is a wiring test, and the things it is checking are precisely the
 * arguments passed across the seams (the witness subject, which vector goes to which search, what
 * survives the serialization boundary). The two vision error classes are real classes in the
 * factory so the action's `instanceof` branch is exercised rather than simulated.
 */

const USER = 'usrAAAAAAAAA'

class FakeTokenFloorError extends Error {}
class FakeTransportError extends Error {}

const requireAdmin = vi.fn(async () => ({ userId: USER, email: 'admin@example.com' }))
const describeNinaImagesWithFallback = vi.fn()
const embedNinaText = vi.fn()
const searchNinaAvatarsByText = vi.fn()
const searchNinaAvatarsByImageCaption = vi.fn()
const searchNinaAvatarsByTextAndCaption = vi.fn()

vi.mock('@/lib/admin/requireAdmin', () => ({ requireAdmin: () => requireAdmin() }))
vi.mock('@/lib/nina/vision', () => ({
  describeNinaImagesWithFallback: (...args: unknown[]) => describeNinaImagesWithFallback(...args),
  NinaVisionTokenFloorError: FakeTokenFloorError,
  NinaVisionTransportError: FakeTransportError,
}))
/* Forwards EVERY argument, not just the text: the action passes `{ userId }` as a second argument
 * (phase 1's contract) and the assertions below pin it. A `(text) => fn(text)` shim would silently
 * drop it and make those assertions unfalsifiable. */
vi.mock('@/lib/nina/embedding', () => ({
  embedNinaText: (...args: unknown[]) => embedNinaText(...args),
}))
vi.mock('@/lib/nina/queries', () => ({
  searchNinaAvatarsByText: (...args: unknown[]) => searchNinaAvatarsByText(...args),
  searchNinaAvatarsByImageCaption: (...args: unknown[]) => searchNinaAvatarsByImageCaption(...args),
  searchNinaAvatarsByTextAndCaption: (...args: unknown[]) =>
    searchNinaAvatarsByTextAndCaption(...args),
}))

const JPEG = `data:image/jpeg;base64,${'A'.repeat(64)}`

/** One row as the query layer hands it over — a `NinaAvatarSearchRow`. */
const ROW = {
  id: 'avtAAAAAAAAA',
  blobUrl: 'https://blob/x.jpg',
  pathname: 'nina/u/x.jpg',
  folder: '2026/bali',
  filename: 'x.jpg',
  thumbUrl: 'https://blob/x-thumb.jpg',
  thumbPathname: 'nina/u/x-thumb.jpg',
  width: 1024,
  height: 768,
  bytes: 200_000,
  source: 'upload',
  cropScale: null,
  cropX: null,
  cropY: null,
  description: 'she is on a beach',
  isCurrent: false,
  announcedAt: null,
  createdAt: new Date('2026-09-01T10:00:00.000Z'),
  score: 0.82,
}

async function action() {
  return (await import('@/lib/admin/ninaAlbumSearchActions')).searchNinaAvatarsAction
}

beforeEach(() => {
  vi.resetModules()
  requireAdmin.mockClear()
  describeNinaImagesWithFallback.mockReset()
  embedNinaText.mockReset()
  searchNinaAvatarsByText.mockReset()
  searchNinaAvatarsByImageCaption.mockReset()
  searchNinaAvatarsByTextAndCaption.mockReset()
  searchNinaAvatarsByText.mockResolvedValue({ rows: [ROW], total: 342 })
  searchNinaAvatarsByImageCaption.mockResolvedValue({ rows: [ROW], total: 342 })
  searchNinaAvatarsByTextAndCaption.mockResolvedValue({ rows: [ROW], total: 342 })
})

afterEach(() => {
  vi.resetModules()
})

describe('an empty query never reaches a vendor', () => {
  it.each([
    ['nothing at all', {}],
    ['an all-blank box', { text: '   \n  ' }],
    ['a hosted URL rather than inline bytes', { imageDataUri: 'https://example.com/a.jpg' }],
    ['an oversized data URI', { imageDataUri: `data:image/jpeg;base64,${'A'.repeat(800_000)}` }],
    ['not an object at all', 'red dress'],
  ])('refuses %s', async (_label, input) => {
    const result = await (await action())(input)

    expect(result.ok).toBe(false)
    expect(result.hits).toEqual([])
    expect(result.searched).toBe(0)
    expect(describeNinaImagesWithFallback).not.toHaveBeenCalled()
    expect(embedNinaText).not.toHaveBeenCalled()
  })
})

describe('text only (R2)', () => {
  it('embeds the normalised query and runs the text search, with no vision call', async () => {
    embedNinaText.mockResolvedValue([0.1, 0.2])

    const result = await (await action())({ text: '  red   dress \n' })

    expect(describeNinaImagesWithFallback).not.toHaveBeenCalled()
    // `{ userId }` is not decoration — it is the `user_id` on the `nina_error_logs` row
    // `embedNinaText` writes before it throws. Phase 1's contract asks for it; pin it.
    expect(embedNinaText).toHaveBeenCalledExactlyOnceWith('red dress', { userId: USER })
    expect(searchNinaAvatarsByText).toHaveBeenCalledExactlyOnceWith(USER, [0.1, 0.2])
    expect(result.ok).toBe(true)
    expect(result.mode).toBe('text')
    expect(result.searched).toBe(342)
    expect(result.caption).toBeUndefined()
  })

  it('narrows a row to what a browser may see', async () => {
    embedNinaText.mockResolvedValue([0.1, 0.2])

    const result = await (await action())({ text: 'red dress' })

    expect(result.hits[0]).toEqual({
      id: 'avtAAAAAAAAA',
      url: 'https://blob/x.jpg',
      thumbUrl: 'https://blob/x-thumb.jpg',
      folder: '2026/bali',
      filename: 'x.jpg',
      width: 1024,
      height: 768,
      bytes: 200_000,
      source: 'upload',
      isCurrent: false,
      description: 'she is on a beach',
      crop: { scale: null, x: null, y: null },
      createdAt: '2026-09-01T10:00:00.000Z',
      score: 0.82,
    })
    /* The three the page has always withheld. A hit that carried `pathname` would be handing a
     * browser the Blob path it uses as a bearer token everywhere else. */
    expect(result.hits[0]).not.toHaveProperty('pathname')
    expect(result.hits[0]).not.toHaveProperty('thumbPathname')
    expect(result.hits[0]).not.toHaveProperty('announcedAt')
  })
})

describe('image only (R3)', () => {
  it('captions with the SELF witness prompt, embeds the caption, and searches on it', async () => {
    describeNinaImagesWithFallback.mockResolvedValue({ description: 'she is on a beach' })
    embedNinaText.mockResolvedValue([0.3, 0.4])

    const result = await (await action())({ imageDataUri: JPEG })

    expect(describeNinaImagesWithFallback).toHaveBeenCalledExactlyOnceWith(
      fetch,
      [{ dataUri: JPEG }],
      { subject: 'self', userId: USER },
    )
    expect(embedNinaText).toHaveBeenCalledExactlyOnceWith('she is on a beach', { userId: USER })
    expect(searchNinaAvatarsByImageCaption).toHaveBeenCalledExactlyOnceWith(USER, [0.3, 0.4])
    expect(result.ok).toBe(true)
    expect(result.mode).toBe('image')
    expect(result.caption).toBe('she is on a beach')
  })
})

describe('both (R4)', () => {
  it('hands the combined search the text vector first and the caption vector second', async () => {
    describeNinaImagesWithFallback.mockResolvedValue({ description: 'she is on a beach' })
    embedNinaText.mockImplementation(async (text: string) =>
      text === 'red dress' ? [0.1, 0.2] : [0.3, 0.4],
    )

    const result = await (await action())({ text: 'red dress', imageDataUri: JPEG })

    expect(searchNinaAvatarsByTextAndCaption).toHaveBeenCalledExactlyOnceWith(
      USER,
      [0.1, 0.2],
      [0.3, 0.4],
    )
    expect(searchNinaAvatarsByText).not.toHaveBeenCalled()
    expect(searchNinaAvatarsByImageCaption).not.toHaveBeenCalled()
    expect(result.mode).toBe('both')
  })
})

describe('failure is always the same shape', () => {
  it('names the photo when the vision path is what failed', async () => {
    describeNinaImagesWithFallback.mockRejectedValue(new FakeTransportError('down'))

    const result = await (await action())({ imageDataUri: JPEG })

    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/photo/i)
    expect(result.hits).toEqual([])
    expect(result.searched).toBe(0)
    expect(result.mode).toBe('image')
  })

  it('and does not, when the embedding is what failed', async () => {
    embedNinaText.mockRejectedValue(new Error('429'))

    const result = await (await action())({ text: 'red dress' })

    expect(result.ok).toBe(false)
    expect(result.error).not.toMatch(/photo/i)
    expect(result.hits).toEqual([])
  })
})
```

**File:** `tests/admin.albumActionsBarrel.test.ts` — three edits.

1. `:26` — widen the vision mock so the new module's imports resolve. Replace

```ts
vi.mock('@/lib/nina/vision', () => ({ describeNinaImages: vi.fn() }))
```

with

```ts
vi.mock('@/lib/nina/vision', () => ({
  describeNinaImages: vi.fn(),
  describeNinaImagesWithFallback: vi.fn(),
  NinaVisionTokenFloorError: class NinaVisionTokenFloorError extends Error {},
  NinaVisionTransportError: class NinaVisionTransportError extends Error {},
}))
vi.mock('@/lib/nina/embedding', () => ({ embedNinaText: vi.fn() }))
```

2. `:28-44` — add `'searchNinaAvatarsAction',` to `BARREL_ACTIONS`, sorted between
`'renameNinaAlbumFolderAction',` and `'saveNinaAvatarCropAction',`:

```ts
  'renameNinaAlbumFolderAction',
  'saveNinaAvatarCropAction',
  'searchNinaAvatarsAction',
  'setChatPhotoAsAvatarAction',
  'setCurrentNinaAvatarAction',
]
```

(`'saveNinaAvatarCropAction'` < `'searchNinaAvatarsAction'` — `a` < `e` at index 2.)

3. after `:88` — one more per-module pin:

```ts
it('the search module exports exactly its one search action', async () => {
  const mod = await import('@/lib/admin/ninaAlbumSearchActions')
  expect(Object.keys(mod).sort()).toEqual(['searchNinaAvatarsAction'])
})
```

**Impact:** the barrel's frozen surface records the growth; a re-export that goes missing still
fails as a diff of names.

---

## Verification

**Build:** `npm run typecheck` (`next typegen && tsc --noEmit`) — vitest does not typecheck, and
this phase adds a raw-SQL surface where a wrong type is silent until runtime.

**Tests:**

```
npx vitest run tests/nina.avatarSearch.test.ts tests/admin.albumSearch.test.ts \
  tests/admin.albumActionsBarrel.test.ts lib/nina/queries.test.ts
npm test
```

**Guards and format (all four are CI steps):**

```
npm run lint
npm run format:check
npm run ci:data-layer-guard
npm run ci:llm-payload-guard
```

`ci:llm-payload-guard` matches `\bdescribeNinaImage\s*\(`, which does **not** match
`describeNinaImagesWithFallback(` — verified; no guard-table entry is needed for this phase, and one
must not be added (that file's header says no other phase edits it).

**Manual check:** none on a screen — nothing renders until phase 4. Optional, once phase 1's
migration has been applied and phase 2's backfill has filled some rows: a scratch script under
`/tmp` that calls `searchNinaAvatarsByText(userId, await embedNinaText('beach'))` against the real
database and prints `total` plus the top five `(filename, score)` pairs. Do NOT commit it; the
plan set's Scope adds no new `npm` script here.

**Exit criteria:**

- `npm run typecheck` and `npm test` are green with the four new/edited test files included.
- Both barrel pins pass with their documented growth: `lib/nina/queries` gains **this phase's three
  names** (85 → 88 alone, 89 → 92 if phase 2 landed first — the array must equal
  `Object.keys(barrel)` at your commit either way, and the prose count is phase 2's line, already
  written for 92); `ninaAlbumActions` 15 → 16 actions.
- `AdminSearchHit`, `AdminSearchResult` and `AdminSearchMode` are exported **from
  `lib/admin/ninaAlbumActions.ts`**, not from the `'use server'` module — phase 4 imports the first
  of them by name in three files and will not compile otherwise.
- `searchNinaAvatarsAction({})`, `{ text: '  ' }` and a non-data-URI `imageDataUri` each return
  `ok: false` with `hits: []` **and zero calls** to `describeNinaImagesWithFallback` and
  `embedNinaText` — asserted, not assumed.
- The generated SQL for all three searches carries `user_id = $n` and
  `description_embedding is not null` in both statements, orders by the distance ascending, and the
  combined statement carries both vectors and both weights in ONE statement.

---

## Handoffs

**To Phase 4 — the contract you call (this is the whole of it), as reconciled 2026-09-15:**

```ts
import {
  searchNinaAvatarsAction,
  type AdminSearchHit,
  type AdminSearchResult,
} from '@/lib/admin/ninaAlbumActions'

// AdminSearchResult = { ok: boolean; error?: string; hits: AdminSearchHit[]; searched: number;
//                       mode: 'text' | 'image' | 'both'; caption?: string }
// AdminSearchHit    = ExplorerPhotoBase's field set + score:
//   { id, url, thumbUrl, folder, filename, width, height, bytes, source, isCurrent,
//     description, crop, createdAt, score }

await searchNinaAvatarsAction({ text?: string; imageDataUri?: string })
```

- **The names are `AdminSearchHit` / `AdminSearchResult`**, not `NinaAvatarSearchHit` — `Admin*`
  matches `AdminActionResult`, their neighbour in the same file. Your plan has been edited to match.
- **The hit is wider than the seven fields you asked for**, and deliberately: it is exactly
  `ExplorerPhotoBase` + `score`, so `{ ...hit, origin: 'album' as const }` is an `AlbumExplorerPhoto`
  and a result can be fed to anything the browsing grid can draw. Read the seven you need and ignore
  the rest — but a hit **fixture** in your suites must carry every field or `tsc` will refuse it.
  `description` riding along is the browsing grid's existing rule (`model.ts:49`: carried, never
  rendered), not a new exposure.

- `hits` is **always an array** — `[]` on a refusal, a vendor failure and a genuine no-match alike.
  Branch on `ok`, never on `hits.length`, to tell "nothing matched" from "it did not run".
- A hit plus `origin: 'album'` **is** an `AlbumExplorerPhoto`: `{ ...hit, origin: 'album' as const }`
  type-checks against `components/admin/explorer/model.ts`, so the results grid can reuse
  `PhotoGrid`'s tile props and `PhotoViewer` gets `{ url: hit.url, kind: hit.source, label: hit.filename }`.
- `searched` is the **coverage** number (rows that have an embedding), not the album size. Until
  phase 2's backfill has run in production it will be small; say so in the results header rather
  than letting the operator conclude the photo is not there.
- **The re-encode budget is yours and it is load-bearing. RECONCILED (2026-09-15): your plan already
  fixes it at 768 px on the SHORT edge, quality 0.75, JPEG** (`searchQueryImage.ts`), which is
  `lib/nina/images.ts:28-31`'s measured envelope for this exact `glm-4.6v` reader and is ≥ a 1024 px
  long edge on any 4:3 or narrower frame. That stands; this plan's earlier "1024 long edge at 0.9"
  wording was a suggestion, not a requirement, and has been retired so neither session "corrects"
  the other. The two hard numbers both plans must keep agreeing on: the ceiling is
  `NINA_ALBUM_SEARCH_IMAGE_MAX_CHARS` = `SEARCH_QUERY_MAX_DATA_URI_CHARS` = **700 000** characters of
  data URI (the body rides Next's 1 MB Server Action cap), and the short edge must stay **well above
  ~640 px** — below that, too few image tokens trips `describeNinaImagesWithFetch`'s token-floor
  guard and the action returns "Could not read that photo" for a perfectly legible picture.
- The action takes 2 model calls (~10–25 s for an image query). Show a pending state; it is awaited
  on purpose (there is no correct result on screen to protect).
- Results are a **flat top-48** with no pager — `NINA_SEARCH_LIMIT`, module-private in
  `lib/nina/queries/avatarsearch.ts`. Do not build a pager against it. 48 is your own ≤ 48 request,
  honoured: `PhotoViewer` draws one dot per photo and the overlay is scoped to the result set.

**To Phase 2:** search only ever ranks rows with a non-NULL `description_embedding`. `searched` is
exactly your coverage metric, so a post-backfill spot check is one search away.

**To Phase 1:** the two hard requirements are in the Interface Contract's *Requires* — the column
name, and keeping `descriptionEmbedding` OUT of `avatarColumns`.

**Deliberately left undone (not scope creep, not oversight):**

- **Operator-tunable weights.** `NINA_SEARCH_TEXT_WEIGHT` is a private constant; the plan index's
  Scope rules a dropdown out explicitly.
- **A live probe of end-to-end ranking quality.** Meaningless until phase 2's backfill has filled a
  real corpus; it is an operational check after deploy, not a build gate.
- **`npm run knip` will flag `searchNinaAvatarsAction` as an unused export** until phase 4 imports
  it. knip is not a CI step (`.github/workflows/ci.yml` runs eight guards, lint, typecheck, test and
  build — not knip), so this is a report line, not a failure. Do not suppress it.
- **A second embedding column for images.** Ruled out by the plan index (Decision "Combined-score
  resolution"); there is no image-embedding vendor here to fill one.

---

## Rollback

Every change is additive; nothing existing changes shape.

1. `git rm` the four new source files and the two new test files:
   `lib/nina/queries/avatarsearch.ts`, `lib/admin/ninaAlbumSearchSchema.ts`,
   `lib/admin/ninaAlbumSearchActions.ts`, `tests/nina.avatarSearch.test.ts`,
   `tests/admin.albumSearch.test.ts`.
2. Revert the four edits: the `export *` line + header map line in `lib/nina/queries.ts`, the two
   interfaces in `lib/nina/queries/shapes.ts`, the re-export + the two result interfaces + header
   bullet in `lib/admin/ninaAlbumActions.ts`, and the two pin files
   (`lib/nina/queries.test.ts` — remove **only this phase's three names**, and
   `tests/admin.albumActionsBarrel.test.ts` back to 15 actions and the narrow vision mock).

Phase 1's column and migration are untouched and stay valid.

**Phase 2 shares two files with this phase** — `lib/nina/queries.ts` and `lib/nina/queries.test.ts`
(the reconciler's correction to this plan's original "it shares no file with this phase"). Reverting
this phase must therefore be surgical in both: drop this phase's one `export *` line and its one
header-map line, and drop its three `BARREL_VALUE_EXPORTS` names — never revert the files wholesale,
which would take phase 2's `avatarEmbeddings` export with them and leave that phase's four barrel
names pointing at nothing. Phase 2 owns the prose count in `queries.test.ts`; after a revert of this
phase alone it reads three high, which is a comment, not a failing assertion.

Reverting this phase alone otherwise leaves the tree building and green — the only consequence is
that phase 4 has nothing to call.
