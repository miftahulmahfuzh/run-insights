/**
 * The worker's own content-dedup lookup. `lib/nina/queries.ts`'s `findNinaImageByContentHash`
 * cannot be imported here (`server-only`, `@/` aliases; the barrel's header), so the POLICY is
 * restated in SQL and the duplication is kept honest by naming the columns in `REQUIRED_COLUMNS`
 * (`preflight.ts`), where a drift takes the workflow red.
 *
 * Part of the `nina-image-worker/` split; the system-level doc — why this worker exists, why it is
 * `.ts`, what it cannot import, where it runs — lives in the barrel `../nina-image-worker.ts`. The
 * worker's import rules: `.ts`-suffixed relative imports only, no `@/` aliases, no `server-only`,
 * CJS packages through `createRequire`.
 */
import type { NeonSql } from './sql.ts'

/** The row `findContentDuplicate` answers with — the shape `imageDedupe.ts` states its `hit` in. */
export interface WorkerContentDuplicate {
  id: string
  blobUrl: string
  pathname: string
}

/**
 * The worker's own spelling of `findNinaImageByContentHash` (`lib/nina/queries.ts`), clause for
 * clause — it cannot be imported (`server-only`, `@/` aliases; this file's header), so the
 * POLICY is restated in SQL and the duplication is kept honest the way every duplication in this
 * file is: by naming the columns in `REQUIRED_COLUMNS`, where a drift takes the workflow red.
 *
 *   · owner-scoped — `user_id` in the WHERE, invariant 5;
 *   · ORIGINALS ONLY — both provenance columns `IS NULL`. A reference must never satisfy a dedup
 *     lookup, or two references could chain onto each other and the keeper's deletion would
 *     re-materialize BOTH as originals;
 *   · newest first — `created_at desc` with `id desc` as the tie-break, the same tie-break the
 *     collection reads use, so a re-run after a crash names the same keeper.
 *
 * Phase 1's partial index (`nina_message_images_user_content_hash_idx`) makes this a lookup, not
 * a scan.
 */
export async function findContentDuplicate(
  sql: NeonSql,
  userId: string,
  contentHash: string,
): Promise<WorkerContentDuplicate | null> {
  const rows = (await sql`
    select id, blob_url, pathname
    from nina_message_images
    where user_id = ${userId}
      and content_hash = ${contentHash}
      and source_avatar_id is null
      and source_image_id is null
    order by created_at desc, id desc
    limit 1
  `) as Array<{ id: string; blob_url: string; pathname: string }>

  const row = rows[0]
  return row == null ? null : { id: row.id, blobUrl: row.blob_url, pathname: row.pathname }
}
