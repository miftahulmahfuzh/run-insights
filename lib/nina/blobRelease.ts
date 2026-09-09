import { del } from '@vercel/blob'

import { isBlobPathnameReferenced } from './queries'

/**
 * **Delete a Blob object we have just stopped pointing at — but only if nothing else points at
 * it.** The ONE implementation of the reference-checked delete, so every caller shares its
 * arguments and none of them can drift.
 *
 * Formerly `releaseChatPhotoBlob`, private to `lib/admin/chatPhotoActions.ts`, whose Replace and
 * Remove were its only callers. The runner-facing photograph delete (`deleteNinaChatPhoto`,
 * `lib/nina/albumActions.ts`) needed the identical rule, and a second copy of a delete rule is
 * how the copy becomes the one that forgot the check.
 *
 * ── WHY THE CHECK EXISTS ──────────────────────────────────────────────────────────────────────
 * `resolveAttachment` (`lib/nina/actions.ts:143-192`) implements R26 by copying `blob_url` and
 * `pathname` onto a new row. No bytes are copied. So one object can be behind a chat row AND
 * another chat row AND a `nina_avatars` row — including the one that IS her current profile
 * picture. An unconditional `del` here blanks her face, or an older bubble, while the rows still
 * point at a dead URL. `isBlobPathnameReferenced` asks both tables, scoped by `user_id`, over the
 * same six columns `scripts/blob-reap.mjs` counts references in.
 *
 * ── WHY IT IS SAFE TO ASK AFTER THE ROW IS GONE ───────────────────────────────────────────────
 * Because that is the ONLY time it is safe to ask. Every caller has already removed its own
 * reference — a remove deleted the row (or the message, whose explicit image-row delete took the
 * rows with it), a replace repointed the row at the new pathname — so the row being changed is
 * out of the answer by construction, and there is no "except this one" parameter that a future
 * caller could pass wrongly. The rule is spelled "ROW FIRST, BLOB SECOND" and it is the caller's
 * job to have followed it: this function has no way to ask it FOR them, which is exactly why it
 * never has to.
 *
 * ── WHAT IT COSTS WHEN IT SAYS "SHARED" ───────────────────────────────────────────────────────
 * The object stays in the store while the row that named it is gone. That is a deliberate orphan
 * class and `reap-orphaned-blobs` is its backstop — which is what a backstop is for. The
 * alternative is unrecoverable data loss, and invariant 8 (no orphaned blobs) does not outrank
 * that.
 *
 * ── NOT A `'use server'` MODULE, DELIBERATELY ────────────────────────────────────────────────
 * A `'use server'` export is a public POST endpoint, and "delete this object if you believe
 * nothing references it" is not a decision a client gets to POST. It lives beside the actions as
 * a plain server module and is callable only from code already running on the server.
 *
 * `'failed'` is logged, not surfaced: a `del` that 500s leaves an orphan, which is recoverable,
 * and the caller asked for the photograph to leave the collection, which it has.
 */
export async function releaseBlobIfUnreferenced(
  userId: string,
  ref: { blobUrl: string; pathname: string },
): Promise<'deleted' | 'shared' | 'failed'> {
  let shared: boolean
  try {
    shared = await isBlobPathnameReferenced(userId, ref.pathname, ref.blobUrl)
  } catch (cause) {
    // Could not prove it is unreferenced, so do not delete it. Erring toward an orphan is the only
    // direction that is recoverable.
    console.error('[nina] could not check blob references; keeping the object', ref.pathname, cause)
    return 'failed'
  }

  if (shared) {
    console.info('[nina] blob kept: another row still points at it', ref.pathname)
    return 'shared'
  }

  try {
    await del(ref.blobUrl)
    return 'deleted'
  } catch (cause) {
    console.error('[nina] row gone, blob left behind', ref.pathname, cause)
    return 'failed'
  }
}
