import { and, eq, inArray, isNotNull, isNull, or, sql } from 'drizzle-orm'

import { db } from '@/lib/db'
import { ninaAvatars } from '@/lib/db/schema'

/**
 * §9c Avatar description embeddings — the derived column the album's semantic search ranks by,
 * and the four statements that fill it. `admin-album-semantic-search` phase 2.
 *
 * ── WHY A MODULE OF ITS OWN, BESIDE `queries/avatars.ts` ────────────────────────────────────
 * Two reasons, and the second is the one that matters. First, these four reads exist for one
 * pipeline (`lib/admin/ninaAlbumDeferredDescribe.ts`) rather than for the album's file-manager
 * surface. Second, and load-bearing: **none of them may go through `avatarColumns`.**
 * `description_embedding` is ~1536 float4s. `listNinaAvatarsInFolder` returns
 * `NINA_ADMIN_PAGE_SIZE = 120` rows per render, and adding the vector to the shared projection
 * would put ~1.5 MB of numbers on the wire per page for a value no renderer reads and no prompt
 * is shown. So every statement below either selects `IS NOT NULL` (a boolean fact) or writes the
 * column — the vector itself is never SELECTed anywhere in this repo except by the search query,
 * where it stays inside Postgres as an operand of `<=>`.
 *
 * ── THE ONE THING A CALLER MAY CONCLUDE FROM `hasEmbedding` ─────────────────────────────────
 * `hasEmbedding === false` means "this row's prose is not searchable yet". It does NOT mean the
 * stored vector is stale: a description that is REWRITTEN has its embedding set to NULL in the
 * same UPDATE (`editNinaAvatarDescriptionAction`), precisely so that this boolean stays the whole
 * truth and nothing has to compare a hash of the prose against the vector.
 *
 * Ownership scoping (the layer's invariant 1) is unconditional here as everywhere: `user_id` is in
 * the WHERE of all four.
 */

/**
 * One row as the describe+embed worker needs it: enough to call the vision model, plus the two
 * facts that decide whether it has to.
 */
export interface NinaAvatarDescribeTarget {
  id: string
  blobUrl: string
  pathname: string
  /** NULL means the vision model has never been asked about this photograph. */
  description: string | null
  /**
   * The operator's hand-written phrases, or NULL. R2, 2026-09-15. Carried here because the worker
   * embeds `description` COMBINED with these (`buildNinaAvatarEmbedText`), and reading them in the
   * same statement is what keeps that one statement per batch. The worker never WRITES this column
   * — only `editNinaAvatarSearchKeywordsAction` does.
   */
  searchKeywords: string | null
  /** `description_embedding IS NOT NULL` — the vector itself is deliberately not selected. */
  hasEmbedding: boolean
}

/**
 * `(… IS NOT NULL)::int` and `.mapWith(Number)` rather than a bare `sql<boolean>`.
 *
 * `count(*)` in `countNinaAvatars` already spells the numeric form for the same reason: what a
 * driver hands back for a Postgres `bool` is a driver detail, and an `int` that is mapped through
 * `Number` is one this layer decides. A `sql<boolean>` that arrives as the STRING `'f'` is truthy,
 * and the bug it would cause — "already embedded, skip" for every unembedded row — is silent.
 */
const hasEmbeddingExpr =
  sql<number>`(${ninaAvatars.descriptionEmbedding} is not null)::int`.mapWith(Number)

const describeTargetColumns = {
  id: ninaAvatars.id,
  blobUrl: ninaAvatars.blobUrl,
  pathname: ninaAvatars.pathname,
  description: ninaAvatars.description,
  searchKeywords: ninaAvatars.searchKeywords,
  embedded: hasEmbeddingExpr,
}

function toTarget(row: {
  id: string
  blobUrl: string
  pathname: string
  description: string | null
  searchKeywords: string | null
  embedded: number
}): NinaAvatarDescribeTarget {
  return {
    id: row.id,
    blobUrl: row.blobUrl,
    pathname: row.pathname,
    description: row.description,
    searchKeywords: row.searchKeywords,
    hasEmbedding: row.embedded === 1,
  }
}

/**
 * The rows named by `ids`, as describe+embed targets. ONE statement for a whole upload batch —
 * `scheduleDescribeAll` reads fifty rows here rather than running fifty `getNinaAvatar` calls, and
 * the read still happens inside the `after()` callback so the caller pays nothing for it.
 *
 * An id that is not in the album, or not this user's, is simply absent from the result: "not
 * yours" and "does not exist" are the same outcome in this layer, and the worker's job is the rows
 * that came back, not the ones that did not.
 *
 * `ids` is empty-safe: `inArray(col, [])` generates a `false` predicate in drizzle 0.45, but a
 * round trip to say nothing is still a round trip, so it short-circuits.
 */
export async function listNinaAvatarDescribeTargets(
  userId: string,
  ids: readonly string[],
): Promise<NinaAvatarDescribeTarget[]> {
  if (ids.length === 0) return []
  const rows = await db
    .select(describeTargetColumns)
    .from(ninaAvatars)
    .where(and(eq(ninaAvatars.userId, userId), inArray(ninaAvatars.id, [...ids])))
  return rows.map(toTarget)
}

/**
 * The album's unfinished work, oldest first: every row that has no description, plus every row
 * that has one and no embedding. The backfill route's read.
 *
 * ── OLDEST FIRST, AND WHY THAT IS THE SWEEP ORDER ───────────────────────────────────────────
 * `created_at asc` makes a repeated slice monotone: each POST finishes the oldest unfinished rows
 * and the next POST starts where the last one stopped, with no cursor to carry and no chance of a
 * slice re-picking rows a concurrent `after()` is already working on for long. (Two workers racing
 * the same row is harmless anyway — the UPDATE is idempotent and the second describe is wasted
 * money, not a wrong row.) `nina_avatars_user_created_idx` is declared DESC; a b-tree scans either
 * direction, so this is still an index range scan on `user_id`.
 */
export async function listNinaAvatarDescribeBacklog(
  userId: string,
  limit: number,
): Promise<NinaAvatarDescribeTarget[]> {
  const capped = Math.max(1, Math.trunc(limit))
  const rows = await db
    .select(describeTargetColumns)
    .from(ninaAvatars)
    .where(
      and(
        eq(ninaAvatars.userId, userId),
        or(isNull(ninaAvatars.description), isNull(ninaAvatars.descriptionEmbedding)),
      ),
    )
    .orderBy(ninaAvatars.createdAt)
    .limit(capped)
  return rows.map(toTarget)
}

/** How much work is left, split by which half of it is left. The backfill route's `GET`. */
export interface NinaAvatarDescribeBacklogCount {
  /** No prose yet — needs a vision call AND an embedding call. */
  missingDescription: number
  /** Prose but no vector — needs an embedding call only. */
  missingEmbedding: number
}

/**
 * Both counts in ONE statement, with `FILTER`. Two `count(*)` statements would be two round trips
 * for a number the operator reads once, and a `GET` that spends nothing should also not cost two.
 */
export async function countNinaAvatarDescribeBacklog(
  userId: string,
): Promise<NinaAvatarDescribeBacklogCount> {
  const counted = await db
    .select({
      missingDescription:
        sql<number>`count(*) filter (where ${ninaAvatars.description} is null)`.mapWith(Number),
      missingEmbedding:
        sql<number>`count(*) filter (where ${ninaAvatars.description} is not null and ${ninaAvatars.descriptionEmbedding} is null)`.mapWith(
          Number,
        ),
    })
    .from(ninaAvatars)
    .where(eq(ninaAvatars.userId, userId))
  return {
    missingDescription: counted[0]?.missingDescription ?? 0,
    missingEmbedding: counted[0]?.missingEmbedding ?? 0,
  }
}

/**
 * Write the prose and its vector in ONE UPDATE. The only writer of `description_embedding` that
 * fills it.
 *
 * ── WHY NOT A SECOND CALL BESIDE `setNinaAvatarDescription` ─────────────────────────────────
 * Because two statements have an order, and every order has a window in which the row is a lie:
 * prose-then-vector leaves a row whose vector describes the PREVIOUS prose (search returns the
 * photo for words it no longer matches), and vector-then-prose leaves the mirror. One `SET` of two
 * columns has no window. `setNinaAvatarDescription` is untouched and keeps its three callers — it
 * is still the right function for a write that is deliberately NOT accompanied by a vector.
 *
 * `embedding: null` is a real, expected argument, not a degenerate case: it is what a failed
 * embedding call writes, and it leaves the row in the exact state
 * `listNinaAvatarDescribeBacklog` picks up next time. The prose is never lost to a vendor that
 * would not answer.
 */
export async function setNinaAvatarDescriptionAndEmbedding(
  userId: string,
  id: string,
  description: string | null,
  embedding: number[] | null,
): Promise<boolean> {
  const updated = await db
    .update(ninaAvatars)
    .set({ description, descriptionEmbedding: embedding })
    .where(and(eq(ninaAvatars.userId, userId), eq(ninaAvatars.id, id)))
    .returning({ id: ninaAvatars.id })
  return updated.length > 0
}

/**
 * Write the hand-written keywords and the vector in ONE UPDATE. The twin of
 * `setNinaAvatarDescriptionAndEmbedding`, for the other input to the same derived column.
 *
 * ── WHY A SECOND FUNCTION AND NOT A THIRD PARAMETER ON THE FIRST ────────────────────────────
 * Because the two callers write DIFFERENT columns and must not write each other's. A merged
 * `set({ description, searchKeywords, descriptionEmbedding })` would make the re-describe path
 * carry a `searchKeywords` argument it has no business having — and the first time someone passed
 * the wrong thing there, a vision pass would erase the operator's correction, silently, with the
 * row still looking healthy. Two functions cannot make that mistake: `describeNinaAvatarAction`
 * has no way to spell it.
 *
 * ── WHY THE VECTOR IS A PARAMETER AND NOT ALWAYS NULL ───────────────────────────────────────
 * Symmetry with its twin, and the same reason: `null` is what the hand-edit path writes (the
 * keywords changed, so the stored vector describes a text this row no longer has), and a real
 * vector is what a caller that already computed one would write. Both are legal, both are one
 * statement, and neither leaves a window in which the columns disagree.
 *
 * `searchKeywords: null` is the CLEAR, exactly as `description: null` is on the twin.
 */
export async function setNinaAvatarSearchKeywordsAndEmbedding(
  userId: string,
  id: string,
  searchKeywords: string | null,
  embedding: number[] | null,
): Promise<boolean> {
  const updated = await db
    .update(ninaAvatars)
    .set({ searchKeywords, descriptionEmbedding: embedding })
    .where(and(eq(ninaAvatars.userId, userId), eq(ninaAvatars.id, id)))
    .returning({ id: ninaAvatars.id })
  return updated.length > 0
}

/* `isNotNull` is imported for the FILTER predicates' drizzle-side twin in a future read; it is
 * referenced by `countNinaAvatarDescribeBacklog`'s raw template only. Remove the import if lint
 * flags it — nothing else in this module needs it. */
void isNotNull
