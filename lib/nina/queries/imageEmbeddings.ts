import { and, eq, inArray, isNull, or, sql } from 'drizzle-orm'

import { db } from '@/lib/db'
import { ninaMessageImages, type NinaImageKind } from '@/lib/db/schema'
import { isOriginalPhoto } from './images'

/**
 * §5c Media description embeddings — the derived column the MEDIA half of the unified search ranks
 * by, and the six statements that fill it. `media-album-unified-search` phase 2, R1/R2.
 *
 * ── IT IS `queries/avatarEmbeddings.ts`, ONE TABLE OVER, AND THAT IS THE DESIGN ─────────────
 * Function for function, docstring argument for docstring argument. The user chose Option A —
 * *"Mirror Album pattern"* — over unifying the two tables, so the correct shape here is the
 * album's shape with the table swapped, not a cleverer one. Every reason that module's header
 * gives holds verbatim: these reads exist for one pipeline
 * (`lib/admin/ninaMediaDeferredDescribe.ts`) rather than for the Media view's file-manager
 * surface, and **none of them may go through `imageColumns`** — `description_embedding` is ~1536
 * float4s and `listNinaMediaPhotos` returns 48 rows a render. The vector is never SELECTed
 * anywhere; every statement below either projects `IS NOT NULL` or writes the column.
 *
 * ── THE TWO DELTAS FROM THE ALBUM TWIN ──────────────────────────────────────────────────────
 * 1. **A target carries `kind`.** An album row is always a photograph of HER, so
 *    `ninaAlbumDeferredDescribe.ts` hard-codes `describeSubjectForSide('hers')`. This table holds
 *    both sides, and `scheduleChatPhotoCaption` has always picked the witness with
 *    `describeSubjectForSide(photoSideOf(row.kind))`. Carrying `kind` in the same statement the
 *    rest of the target came from is what keeps that one statement per batch.
 * 2. **`isOriginalPhoto()` is in every WHERE.** A row carrying `source_avatar_id` /
 *    `source_image_id` RE-SHOWS a photograph that lives elsewhere; it is excluded from every
 *    collection read (`isOriginalPhoto`'s own header lists them) and from the merged search
 *    (`queries/avatarsearch.ts`), so earning it a vector would be paying a vendor for a column
 *    nothing can ever rank. It is a scope arm rather than a caller's job for
 *    `generatedChatPhotoScope`'s reason: every statement that reads this pipeline reads the same
 *    set by construction.
 *
 * ── WHAT IS DELIBERATELY NOT HERE ───────────────────────────────────────────────────────────
 * `setNinaMessageImageDescription` (`queries/images.ts`) and `updateNinaChatPhotoDescription`
 * (same) are untouched and keep their callers. They are still the right statements for a write
 * that is deliberately NOT accompanied by a vector — `scheduleChatPhotoCaption`'s HALF ONE, which
 * describes a photograph so that Nina's prompt can read the prose, at a moment when whether the
 * Media view's search can also find it is nobody's question.
 *
 * Ownership scoping (the layer's invariant 1) is unconditional: `user_id` is in all six WHEREs.
 */

/** One row as the Media describe+embed worker needs it. `NinaAvatarDescribeTarget` plus `kind`. */
export interface NinaImageDescribeTarget {
  id: string
  blobUrl: string
  pathname: string
  /**
   * `'generated'` (hers) or `'upload'` (his). The worker maps it through `photoSideOf` +
   * `describeSubjectForSide` to pick the vision witness — the album twin has no such field
   * because every album row is hers. See the header's delta 1.
   */
  kind: NinaImageKind
  /** NULL means the vision model has never been asked about this photograph. */
  description: string | null
  /**
   * The operator's hand-written phrases, or NULL. R2. Carried here because the worker embeds
   * `description` COMBINED with these (`buildNinaAvatarEmbedText`), and reading them in the same
   * statement is what keeps that one statement per batch. The worker never WRITES this column —
   * only `editNinaMessageImageSearchKeywordsAction` does.
   */
  searchKeywords: string | null
  /** `description_embedding IS NOT NULL` — the vector itself is deliberately not selected. */
  hasEmbedding: boolean
}

/**
 * `(… IS NOT NULL)::int` and `.mapWith(Number)` rather than a bare `sql<boolean>` — the album
 * twin's argument, unchanged: what a driver hands back for a Postgres `bool` is a driver detail,
 * and a `sql<boolean>` that arrives as the STRING `'f'` is truthy, which would silently skip every
 * unembedded row as "already done".
 */
const hasEmbeddingExpr =
  sql<number>`(${ninaMessageImages.descriptionEmbedding} is not null)::int`.mapWith(Number)

const imageDescribeTargetColumns = {
  id: ninaMessageImages.id,
  blobUrl: ninaMessageImages.blobUrl,
  pathname: ninaMessageImages.pathname,
  kind: ninaMessageImages.kind,
  description: ninaMessageImages.description,
  searchKeywords: ninaMessageImages.searchKeywords,
  embedded: hasEmbeddingExpr,
}

function toImageTarget(row: {
  id: string
  blobUrl: string
  pathname: string
  kind: NinaImageKind
  description: string | null
  searchKeywords: string | null
  embedded: number
}): NinaImageDescribeTarget {
  return {
    id: row.id,
    blobUrl: row.blobUrl,
    pathname: row.pathname,
    kind: row.kind,
    description: row.description,
    searchKeywords: row.searchKeywords,
    hasEmbedding: row.embedded === 1,
  }
}

/**
 * The rows named by `ids`, as describe+embed targets. ONE statement for a whole batch.
 *
 * An id that is not this user's, does not exist, or is a REFERENCE row is simply absent from the
 * result: "not yours", "gone" and "re-shows someone else's photograph" are one outcome in this
 * layer, and the worker's job is the rows that came back.
 *
 * `ids` is empty-safe for `listNinaAvatarDescribeTargets`'s reason: a round trip to say nothing is
 * still a round trip.
 */
export async function listNinaMessageImageDescribeTargets(
  userId: string,
  ids: readonly string[],
): Promise<NinaImageDescribeTarget[]> {
  if (ids.length === 0) return []
  const rows = await db
    .select(imageDescribeTargetColumns)
    .from(ninaMessageImages)
    .where(
      and(
        eq(ninaMessageImages.userId, userId),
        inArray(ninaMessageImages.id, [...ids]),
        isOriginalPhoto(),
      ),
    )
  return rows.map(toImageTarget)
}

/**
 * The Media collection's unfinished work, oldest first: every original row that has no description,
 * plus every one that has one and no embedding. Phase 4's backfill route reads this.
 *
 * `created_at asc` for `listNinaAvatarDescribeBacklog`'s stated reason: it makes a repeated slice
 * monotone, so each POST finishes the oldest unfinished rows with no cursor to carry.
 * `nina_message_images_user_created_idx` is declared DESC; a b-tree scans either direction.
 */
export async function listNinaMessageImageDescribeBacklog(
  userId: string,
  limit: number,
): Promise<NinaImageDescribeTarget[]> {
  const capped = Math.max(1, Math.trunc(limit))
  const rows = await db
    .select(imageDescribeTargetColumns)
    .from(ninaMessageImages)
    .where(
      and(
        eq(ninaMessageImages.userId, userId),
        isOriginalPhoto(),
        or(
          isNull(ninaMessageImages.description),
          isNull(ninaMessageImages.descriptionEmbedding),
        ),
      ),
    )
    .orderBy(ninaMessageImages.createdAt)
    .limit(capped)
  return rows.map(toImageTarget)
}

/** How much work is left, split by which half of it is left. Phase 4's backfill `GET`. */
export interface NinaImageDescribeBacklogCount {
  /** No prose yet — needs a vision call AND an embedding call. */
  missingDescription: number
  /** Prose but no vector — needs an embedding call only. */
  missingEmbedding: number
}

/**
 * Both counts in ONE statement, with `FILTER` — the album twin's reason: a `GET` that spends
 * nothing should also not cost two round trips.
 */
export async function countNinaMessageImageDescribeBacklog(
  userId: string,
): Promise<NinaImageDescribeBacklogCount> {
  const counted = await db
    .select({
      missingDescription:
        sql<number>`count(*) filter (where ${ninaMessageImages.description} is null)`.mapWith(
          Number,
        ),
      missingEmbedding:
        sql<number>`count(*) filter (where ${ninaMessageImages.description} is not null and ${ninaMessageImages.descriptionEmbedding} is null)`.mapWith(
          Number,
        ),
    })
    .from(ninaMessageImages)
    .where(and(eq(ninaMessageImages.userId, userId), isOriginalPhoto()))
  return {
    missingDescription: counted[0]?.missingDescription ?? 0,
    missingEmbedding: counted[0]?.missingEmbedding ?? 0,
  }
}

/**
 * Write the prose and its vector in ONE UPDATE. The only writer of
 * `nina_message_images.description_embedding` that FILLS it.
 *
 * ── WHY NOT A SECOND CALL BESIDE `setNinaMessageImageDescription` ───────────────────────────
 * `setNinaAvatarDescriptionAndEmbedding`'s argument, verbatim, because it is the same argument:
 * two statements have an order and every order has a window in which the row is a lie.
 * Prose-then-vector leaves a row whose vector describes the PREVIOUS prose (search returns the
 * photo for words it no longer matches); vector-then-prose leaves the mirror. One `SET` of two
 * columns has no window. `setNinaMessageImageDescription` is untouched and keeps its two callers.
 *
 * `embedding: null` is a real, expected argument: it is what a failed embedding call writes and
 * what the hand-edit path writes, and it leaves the row in the exact state
 * `listNinaMessageImageDescribeBacklog` picks up next sweep. The prose is never lost to a vendor
 * that would not answer.
 */
export async function setNinaMessageImageDescriptionAndEmbedding(
  userId: string,
  id: string,
  description: string | null,
  embedding: number[] | null,
): Promise<boolean> {
  const updated = await db
    .update(ninaMessageImages)
    .set({ description, descriptionEmbedding: embedding })
    .where(
      and(eq(ninaMessageImages.userId, userId), eq(ninaMessageImages.id, id), isOriginalPhoto()),
    )
    .returning({ id: ninaMessageImages.id })
  return updated.length > 0
}

/**
 * Write the hand-written keywords and the vector in ONE UPDATE. The twin of the function above,
 * for the other input to the same derived column.
 *
 * ── WHY A SECOND FUNCTION AND NOT A THIRD PARAMETER ON THE FIRST ────────────────────────────
 * `setNinaAvatarSearchKeywordsAndEmbedding`'s argument applies here word for word, and the failure
 * it prevents is the same one: a merged `set({ description, searchKeywords, descriptionEmbedding })`
 * would put a `searchKeywords` parameter within reach of `describeChatPhotoAction` — the
 * re-describe button — and the first time someone passed the wrong thing there, a vision pass
 * would erase the operator's correction, silently, with the row still looking healthy. Two
 * functions cannot make that mistake: the describe path has no way to spell it.
 *
 * `searchKeywords: null` is the CLEAR, exactly as `description: null` is on the twin.
 */
export async function setNinaMessageImageSearchKeywordsAndEmbedding(
  userId: string,
  id: string,
  searchKeywords: string | null,
  embedding: number[] | null,
): Promise<boolean> {
  const updated = await db
    .update(ninaMessageImages)
    .set({ searchKeywords, descriptionEmbedding: embedding })
    .where(
      and(eq(ninaMessageImages.userId, userId), eq(ninaMessageImages.id, id), isOriginalPhoto()),
    )
    .returning({ id: ninaMessageImages.id })
  return updated.length > 0
}

/**
 * Write the hand-written EXCLUSION phrases. A PLAIN setter, unlike its neighbour, and that is the
 * whole point: **a negative keyword never touches the vector.**
 *
 * `buildNinaAvatarEmbedText` reads only `description` and `searchKeywords`, and
 * `matchesNegativeKeyword` (`queries/avatarsearch.ts`) reads this column fresh at search time
 * against the operator's typed query. So writing it changes nothing any vector describes and there
 * is no derived value to re-earn afterwards — the exact non-involvement
 * `setNinaAvatarNegativeSearchKeywords` has on the album side, replicated here rather than
 * re-decided.
 */
export async function setNinaMessageImageNegativeSearchKeywords(
  userId: string,
  id: string,
  negativeSearchKeywords: string | null,
): Promise<boolean> {
  const updated = await db
    .update(ninaMessageImages)
    .set({ negativeSearchKeywords })
    .where(
      and(eq(ninaMessageImages.userId, userId), eq(ninaMessageImages.id, id), isOriginalPhoto()),
    )
    .returning({ id: ninaMessageImages.id })
  return updated.length > 0
}
