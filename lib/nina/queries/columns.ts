import { ninaAvatars, ninaChatSessions, ninaMessageImages, ninaMessages } from '@/lib/db/schema'

/**
 * §2 Column lists — the four drizzle projections every SELECT in the Nina query layer
 * spells out. The section banner below (moved verbatim) carries the WHY.
 *
 * **Internal — shared with sibling query modules.** These four lists were private inside
 * `lib/nina/queries.ts`; they are exported here only so sibling modules under
 * `lib/nina/queries/` can import them from `./columns`. The barrel deliberately does NOT
 * re-export them, and `lib/nina/queries.test.ts` freezes the public surface without them.
 *
 * Provenance: `lib/nina/queries.ts` §2 (its lines 613–683) moved by the queries-split
 * (2026-09-12); the banner below is byte-identical, and the only change to the four lists
 * is `export` plus the one-line marker above each.
 */

/* ============================================================================
 * §2 Column lists
 *
 * Spelled out once each rather than `db.select()`, for the same reason
 * `lib/llm/facts.ts` builds its profile field by field: a `select()` widens
 * silently when a column is added, and two of these rows go to a model.
 * ==========================================================================*/

/** Internal — shared with sibling query modules; never re-exported by the barrel. */
export const sessionColumns = {
  id: ninaChatSessions.id,
  title: ninaChatSessions.title,
  titleSource: ninaChatSessions.titleSource,
  pinnedAt: ninaChatSessions.pinnedAt,
  createdAt: ninaChatSessions.createdAt,
}

/** Internal — shared with sibling query modules; never re-exported by the barrel. */
export const messageColumns = {
  id: ninaMessages.id,
  seq: ninaMessages.seq,
  sessionId: ninaMessages.sessionId,
  role: ninaMessages.role,
  body: ninaMessages.text,
  createdAt: ninaMessages.sentAt,
  source: ninaMessages.source,
  turnId: ninaMessages.turnId,
  replyToId: ninaMessages.replyToId,
  runId: ninaMessages.runId,
  readAt: ninaMessages.readAt,
  photoOnly: ninaMessages.photoOnly,
}

/** Internal — shared with sibling query modules; never re-exported by the barrel. */
export const imageColumns = {
  id: ninaMessageImages.id,
  messageId: ninaMessageImages.messageId,
  kind: ninaMessageImages.kind,
  blobUrl: ninaMessageImages.blobUrl,
  pathname: ninaMessageImages.pathname,
  width: ninaMessageImages.width,
  height: ninaMessageImages.height,
  bytes: ninaMessageImages.bytes,
  description: ninaMessageImages.description,
  prompt: ninaMessageImages.prompt,
  sourceAvatarId: ninaMessageImages.sourceAvatarId,
  sourceImageId: ninaMessageImages.sourceImageId,
  contentHash: ninaMessageImages.contentHash,
  perceptualHash: ninaMessageImages.perceptualHash,
  perceptualSig: ninaMessageImages.perceptualSig,
  sortOrder: ninaMessageImages.sortOrder,
  createdAt: ninaMessageImages.createdAt,
}

/** Internal — shared with sibling query modules; never re-exported by the barrel. */
export const avatarColumns = {
  id: ninaAvatars.id,
  blobUrl: ninaAvatars.blobUrl,
  pathname: ninaAvatars.pathname,
  folder: ninaAvatars.folder,
  filename: ninaAvatars.filename,
  thumbUrl: ninaAvatars.thumbUrl,
  thumbPathname: ninaAvatars.thumbPathname,
  width: ninaAvatars.width,
  height: ninaAvatars.height,
  bytes: ninaAvatars.bytes,
  source: ninaAvatars.source,
  cropScale: ninaAvatars.cropScale,
  cropX: ninaAvatars.cropX,
  cropY: ninaAvatars.cropY,
  description: ninaAvatars.description,
  /* R2, 2026-09-15. Read by the album rail (to edit) and by `describeNinaAvatarAction` (to
   * PRESERVE across a re-describe). Not by search — nothing ranks by this column; it is an input
   * to the text that becomes `description_embedding`. Placed beside `description` because the two
   * are read together everywhere they are read at all. */
  searchKeywords: ninaAvatars.searchKeywords,
  /* nina-album-search-relevance-tools R2 follow-up, 2026-09-15. Read by the album rail (to edit)
   * and by `searchNinaAvatarsByText`/`searchNinaAvatarsByTextAndCaption` (to exclude a row from a
   * query it names). Never folded into the embedded text — see the column's own header. */
  negativeSearchKeywords: ninaAvatars.negativeSearchKeywords,
  isCurrent: ninaAvatars.isCurrent,
  announcedAt: ninaAvatars.announcedAt,
  createdAt: ninaAvatars.createdAt,
}
