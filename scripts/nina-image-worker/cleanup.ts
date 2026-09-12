/**
 * Blob cleanup: the loser bytes of a dedup race, released only after the row that replaced them is
 * in. Row first, blob second — the one delete rule of the whole plan set.
 *
 * Part of the `nina-image-worker/` split; the system-level doc — why this worker exists, why it is
 * `.ts`, what it cannot import, where it runs — lives in the barrel `../nina-image-worker.ts`. The
 * worker's import rules: `.ts`-suffixed relative imports only, no `@/` aliases, no `server-only`,
 * CJS packages through `createRequire`.
 */
import { createRequire } from 'node:module'

import type { NeonSql } from './sql.ts'

/* `@vercel/blob` is CJS-friendly and is loaded the way every other script in `scripts/` loads such
 * packages (`scripts/blob-reap.mjs:34`), so this module needs no bundler and no transform beyond
 * stripping. */
const require = createRequire(import.meta.url)
const { del } = require('@vercel/blob') as {
  del: (url: string) => Promise<unknown>
}

/**
 * The worker's own spelling of `releaseBlobIfUnreferenced` (`lib/nina/blobRelease.ts`), which
 * cannot be imported for the same reason everything else here is restated. The rule is the ONE
 * delete rule of the whole plan set: ROW FIRST, BLOB SECOND — the caller has already written the
 * row that replaced the reference, and this asks the same SIX columns across the same TWO tables
 * the app's `isBlobPathnameReferenced` asks (images pathname+url, avatars pathname+url,
 * thumbnails pathname+url) before `del`. Any fault keeps the object: a loser blob left for the
 * reaper is recoverable, a deleted object a row still points at is not.
 */
export async function releaseBlobIfUnreferenced(
  sql: NeonSql,
  userId: string,
  ref: { blobUrl: string; pathname: string },
  /** Test seam: `del` arrives through `createRequire`, which no `vi.mock` registry reaches. */
  delFn: (url: string) => Promise<unknown> = del,
): Promise<'deleted' | 'shared' | 'failed'> {
  try {
    const rows = (await sql`
      select id from (
        (select id from nina_message_images
          where user_id = ${userId}
            and (pathname = ${ref.pathname} or blob_url = ${ref.blobUrl}))
        union all
        (select id from nina_avatars
          where user_id = ${userId}
            and (pathname = ${ref.pathname} or blob_url = ${ref.blobUrl}
              or thumb_pathname = ${ref.pathname} or thumb_url = ${ref.blobUrl}))
      ) referenced
      limit 1
    `) as Array<{ id: string }>
    if (rows.length > 0) {
      console.info('[nina-worker] blob kept: another row still points at it')
      return 'shared'
    }
    await delFn(ref.blobUrl)
    return 'deleted'
  } catch (cause) {
    console.warn('[nina-worker] the loser blob could not be released; the reaper owns it now', {
      error: String(cause),
    })
    return 'failed'
  }
}
