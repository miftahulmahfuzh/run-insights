import {
  and,
  asc,
  desc,
  eq,
  gte,
  inArray,
  isNotNull,
  isNull,
  max,
  sql,
  type SQL,
} from 'drizzle-orm'
import type { PgColumn } from 'drizzle-orm/pg-core'

import { db } from '@/lib/db'
import {
  ninaAvatars,
  ninaChatSessions,
  ninaFolders,
  ninaMemoryFacts,
  ninaMemorySlots,
  ninaMessageImages,
  ninaMessages,
  ninaNags,
  ninaTurns,
  users,
  type NinaAvatarSource,
  type NinaFactCategory,
  type NinaImageKind,
  type NinaMemorySource,
  type NinaMessageSource,
  type NinaRole,
  type NinaSessionTitleSource,
  type NinaSlotValue,
  type NinaTurnKind,
  type NinaTurnStatus,
} from '@/lib/db/schema'
import { newId } from '@/lib/id'
import {
  NINA_ADMIN_BATCH_MAX,
  NINA_ADMIN_MANIFEST_MAX,
  NINA_ADMIN_PAGE_SIZE,
} from '@/lib/nina/album'
import {
  NINA_SESSION_TITLE_MAX_CHARS,
  mostRecentNinaSession,
  orderNinaSessions,
} from '@/lib/nina/sessions'

/**
 * Every Nina read and write, in one module — `lib/db/queries.ts` for `lib/nina/`.
 *
 * ## The two invariants it inherits
 *
 * **1. userId scoping (roadmap D8, plan invariant 7).** Every exported function takes `userId`
 * as its first parameter and that value is in the `WHERE` of every statement it runs. There is
 * NO exception in this file — `lib/db/queries.ts` has exactly one (`getRunByShareToken`, where a
 * 96-bit token is the credential) and nothing here is credential-addressed. `userId` comes from
 * the session via `requireUserId()`, never from a Server Action argument or a URL segment.
 *
 * A row that exists but is not yours and a row that does not exist are the same outcome. These
 * functions return `null`, `[]` or `false` rather than throwing a `NotFoundError`, because every
 * caller is either Nina's own turn loop (which must degrade, not 500) or an admin screen (which
 * shows "gone" rather than an error page). Nothing here distinguishes absent from forbidden.
 *
 * **2. She never writes her own SQL against `runs` (plan invariant 9).** There is not one
 * reference to `runs`, `records`, `badges` or `insights` below. Nina's view of the training
 * history comes from `lib/db/queries.ts` through `lib/nina/load.ts`, so `reviewed_at IS NOT NULL`
 * keeps gating every aggregate she sees without this file having to remember to.
 *
 * ## Why `db.batch` and never `db.transaction`
 *
 * `db.transaction()` throws on the neon-http driver. `db.batch([...])` is one HTTP request that
 * Postgres runs inside one transaction. Same rule as `lib/db/queries.ts`, same reason.
 *
 * ## Ordering
 *
 * `nina_messages.seq` is a `bigserial`, so `ORDER BY seq` is the emission order of the whole
 * conversation and nothing in this file needs a composite sort or a tiebreak. See that table's
 * header for why a timestamp could not do the job.
 *
 * **No `import 'server-only'`.** `lib/db/queries.ts` does not have it either, deliberately:
 * adding it would make this module unimportable from Vitest and from `scripts/*.mjs`, and phase
 * 14's operator script is a `scripts/*.mjs`.
 */

/* ============================================================================
 * §1 Shapes
 * ==========================================================================*/

export interface NinaIdentity {
  /** `users.name` as the OAuth provider gave it. */
  fullName: string | null
  /** The `nickname` memory slot, once phase 5 has confirmed one. */
  nickname: string | null
}

/**
 * One message, as every reader wants it.
 *
 * ── THE THREE-LAYER BOUNDARY (RULING A1). DO NOT "FIX" EITHER END TO MATCH THE OTHER ───────────
 *   1. `lib/db/schema.ts` — the COLUMNS: `text`, `sent_at` (`ninaMessages.text`,
 *      `ninaMessages.sentAt`). Phase 2's spelling, and a column name is forever.
 *   2. THIS FILE — the data-access DTO: **`body`** and **`createdAt`**, uniformly, in EVERY
 *      function, because every function selects `messageColumns` (§2) and that is where the alias
 *      is written. There is no function in this module that returns `text`/`sentAt`.
 *   3. `lib/nina/context.ts` (phase 2) — the prompt-layer input `MessageInput`: `text`, `sentAt`.
 *
 * **`lib/nina/gateway.ts`'s `dbNinaSourceGateway` (phase 3) is the SINGLE mapper** between layers
 * 2 and 3 (`text: row.body`, `sentAt: row.createdAt`). It is the only file in the feature that
 * knows both spellings, which is the whole point: one translation point, reviewable in one diff,
 * instead of nine consumers each guessing. Every other reader — phases 4, 6, 7, 8, 10, 12, 13,
 * 15, 16 — consumes `body`/`createdAt` and is correct in doing so.
 *
 * `seq` rides along because phase 10 needs a read watermark and phase 4 needs a stable React key
 * that is also a sort key.
 */
export interface NinaMessageRow {
  id: string
  seq: number
  /**
   * Which conversation this message is in (F35 R2). Added by phase 3, which needs to read a session
   * OFF a message rather than only filter by one: `lib/nina/sessionResolve.ts` resolves R22's
   * apology into the chat where he asked for the photo, and `NinaImageJobArgs.replyToId` is the only
   * handle it has. `NOT NULL` in the column, so `string` and never nullable here.
   */
  sessionId: string
  role: NinaRole
  body: string
  createdAt: Date
  source: NinaMessageSource
  turnId: string | null
  replyToId: string | null
  runId: string | null
  readAt: Date | null
}

/** What a writer supplies. `seq` is absent on purpose — Postgres assigns it. */
export interface NinaMessageInsert {
  role: NinaRole
  body: string
  source?: NinaMessageSource
  turnId?: string | null
  replyToId?: string | null
  runId?: string | null
}

/**
 * One session, as the sidebar and the resolver want it. `userId` is absent on purpose: it is the
 * scope, not a field — nothing downstream needs it and a row that carries it invites a caller to
 * trust it instead of `requireUserId()`.
 *
 * `title` may be NULL, and `sessionTitleFor` in `lib/nina/sessions.ts` is the only sanctioned way to
 * turn that into something a screen can show.
 */
export interface NinaSessionRow {
  id: string
  title: string | null
  titleSource: NinaSessionTitleSource | null
  pinnedAt: Date | null
  createdAt: Date
}

/**
 * A session plus R5's sort key, which is derived and therefore not on the row: `max(sent_at)` over
 * `role = 'runner'` inside it. NULL means he has never written in this session — a session he just
 * created, or one where only her proactive messages live.
 *
 * See `nina_chat_sessions`'s header for why this is not a stored column.
 */
export interface NinaSessionListRow extends NinaSessionRow {
  lastUserMessageAt: Date | null
}

export interface NinaImageRow {
  id: string
  messageId: string
  kind: NinaImageKind
  blobUrl: string
  pathname: string
  width: number | null
  height: number | null
  bytes: number | null
  description: string | null
  prompt: string | null
  sortOrder: number
  createdAt: Date
}

export interface NinaImageInsert {
  messageId: string
  kind: NinaImageKind
  blobUrl: string
  pathname: string
  width?: number | null
  height?: number | null
  bytes?: number | null
  description?: string | null
  prompt?: string | null
  sortOrder?: number
}

/**
 * A slot as phase 2's context wants it: `value` already RENDERED to a display string. See
 * `renderSlotValue` for what rendering means, and `getNinaMemorySlot` for the parsed form.
 */
export interface NinaSlotRow {
  key: string
  value: string
  source: NinaMemorySource
  sourceMessageId: string | null
  updatedAt: Date
}

export interface NinaSlotUpsert {
  key: string
  value: NinaSlotValue
  /** Defaults to 'distilled'. Phase 16's editor passes 'admin'. */
  source?: NinaMemorySource
  /** NULL is a real answer — nothing in the chat said it. */
  sourceMessageId?: string | null
}

export interface NinaFactRow {
  id: string
  category: NinaFactCategory
  text: string
  confidence: number
  source: NinaMemorySource
  sourceMessageId: string | null
  createdAt: Date
}

export interface NinaFactInsert {
  category: NinaFactCategory
  text: string
  /** Integer percent 0–100. Defaults to 100. */
  confidence?: number
  source?: NinaMemorySource
  sourceMessageId?: string | null
}

export interface NinaNagRow {
  code: string
  level: number
  count: number
  lastMentionedOn: string | null
  updatedAt: Date
}

export interface NinaNagUpsert {
  code: string
  level: number
  /** Jakarta 'YYYY-MM-DD'. */
  lastMentionedOn: string | null
}

export interface NinaTurnInsert {
  kind: NinaTurnKind
  model: string
  /** `'pending'` is an image job in flight (RULING C2). See the column's note. */
  status: NinaTurnStatus
  trigger?: string | null
  promptVersion?: number | null
  inputTokens?: number | null
  outputTokens?: number | null
  /**
   * Comma-joined tool NAMES, `''` when none — a string, not a count (RULING C8). Defaults to
   * `''`, so a caller that makes no tool call passes nothing.
   */
  toolCalls?: string
  latencyMs?: number | null
  /** Millionths of a USD. */
  costMicroUsd?: number | null
  /** On `status: 'pending'`, phase 12's job phase: `'queued' | 'dispatched' | 'running'`. */
  errorCode?: string | null
  /**
   * The job's arguments (RULING C1) — phase 12's `NinaImageJobArgs`, `null` for every other
   * `kind`. `unknown` rather than that type, because the type is phase 12's and this module must
   * not import from a later phase. The column's docstring carries the shape and the reason.
   */
  args?: unknown
}

export interface NinaAvatarRow {
  id: string
  blobUrl: string
  pathname: string
  /** `''` is the album root — F34 R1. See `nina_avatars`'s header. */
  folder: string
  /** The file's name on the laptop; NULL for a row that was handed bytes, not a file. */
  filename: string | null
  /** The derived grid thumbnail; NULL means render `blobUrl` instead. */
  thumbUrl: string | null
  /** The thumbnail's STORED Blob pathname, so a delete can remove both objects. */
  thumbPathname: string | null
  width: number | null
  height: number | null
  bytes: number | null
  source: NinaAvatarSource
  cropScale: number | null
  cropX: number | null
  cropY: number | null
  description: string | null
  isCurrent: boolean
  announcedAt: Date | null
  createdAt: Date
}

export interface NinaAvatarInsert {
  blobUrl: string
  pathname: string
  source: NinaAvatarSource
  width?: number | null
  height?: number | null
  bytes?: number | null
  description?: string | null
}

/**
 * The circular-frame transform (R23). `scale` is a multiple of the cover fit; `x` and `y` are the
 * image centre's offset from the frame centre in thousandths of the frame width. Passing `null`
 * for all three clears the transform back to plain centred `object-cover`.
 */
export interface NinaAvatarCrop {
  scale: number | null
  x: number | null
  y: number | null
}

/**
 * What a batch writer supplies. Separate from `NinaAvatarInsert` and NOT an extension of it,
 * because the two describe different acts: `NinaAvatarInsert` is one photo becoming her face, and
 * this is N files landing in a folder with nobody's face changing. `folder`, `filename` and
 * `sourceKey` are all REQUIRED here — a file arriving from a directory walk has all three, and
 * making them optional would let the one caller that matters (`registerNinaAvatarsAction`) write a
 * row with no dedupe key and silently opt out of the unique index that exists to protect it.
 */
export interface NinaAvatarBatchInsert {
  blobUrl: string
  pathname: string
  source: NinaAvatarSource
  folder: string
  filename: string
  sourceKey: string
  width?: number | null
  height?: number | null
  bytes?: number | null
  thumbUrl?: string | null
  thumbPathname?: string | null
  description?: string | null
}

/**
 * One page of one folder, plus how many rows the folder holds in total.
 *
 * ── AN OFFSET PAGE WITH A COUNT, AND NOT A KEYSET CURSOR ────────────────────────────────────
 * The draft of this phase returned a keyset cursor, and phase 5 — the only consumer — needed
 * `total` and a backward step, so this is the reconciled shape. The pager it feeds says
 * *"121–240 of 314"* and offers **Newer** as well as **Older**, and a cursor gives up both: it
 * carries no count and it walks one way unless the URL accumulates a stack of cursors. `?page=N`
 * is also something a human can read, type and bookmark.
 *
 * **What the cursor was right about, stated rather than dropped.** Rows are inserted at the FRONT
 * of `(created_at desc, id desc)`, so a page-2 read taken *during* an upload is shifted by however
 * many rows landed in between, and a tile can appear on two consecutive pages. That is the whole
 * of the cost, and it is bounded and self-correcting: nothing is lost (the shift is forward, so a
 * row can repeat but cannot be skipped), the operator watching an upload is watching the queue
 * rather than paging, and the next render with the same `?page=` is consistent again. Against
 * that, `OFFSET` on `nina_avatars_user_folder_created_idx` at the scale the requirement states
 * (*"hundreds"*) is an index range scan; the deep-offset cost a cursor exists to avoid begins in
 * the tens of thousands.
 *
 * `total` is a second statement rather than a `count(*) OVER ()` window, so that an over-shot
 * `?page=` returns `rows: []` with a TRUTHFUL total instead of `0` — which is what lets phase 5's
 * empty-page branch offer "go to the first page" rather than claiming the folder is empty.
 */
export interface NinaAvatarFolderPage {
  rows: NinaAvatarRow[]
  /** Rows in THIS folder, not in its subtree. The grid is not recursive; the tree is. */
  total: number
}

/**
 * One already-uploaded file, as the client-side diff needs it — F34 R1's *"only upload the new
 * folders and files"*.
 *
 * `sourceKey` is what the diff matches on. `folder` and `id` ride along so that a skipped file can
 * be reported as *where it already is* rather than as a silent omission: a drop that uploads
 * nothing has to say so, or it looks broken.
 */
export interface NinaAvatarManifestEntry {
  id: string
  folder: string
  sourceKey: string
}

/**
 * One folder and how many photos are DIRECTLY in it — not counting its descendants.
 *
 * The roll-up is deliberately not SQL's. `lib/admin/filetree.ts`'s `buildTree` already assembles
 * the nested model the tree pane renders, and it has to sum children to place them anyway; a
 * recursive `WITH` here would be a second opinion about the same tree, provable only against a
 * database while the pure function is provable in `npm test`. So: SQL groups, the pure module
 * rolls up.
 */
export interface NinaAvatarFolderCount {
  folder: string
  photos: number
}

/**
 * Everything a caller needs to remove a photo's objects from Blob after its row is gone. Both
 * thumbnail fields are nullable, and a caller must treat NULL as "there is nothing to delete"
 * rather than as an error — pre-F34 rows have no thumbnail and never will.
 */
export interface NinaAvatarBlobRef {
  id: string
  blobUrl: string
  pathname: string
  thumbUrl: string | null
  thumbPathname: string | null
}

/**
 * `renameNinaAvatarFolder`'s outcome. `moved` is a count and `0` is a legitimate success — a
 * folder can be renamed while it holds nothing but subfolders that hold nothing.
 *
 * `reason: 'root'` covers both of the album root's refusals, because they are one fact: the root
 * is not a node. It cannot be renamed (it has no name), and it cannot be a destination (the
 * rewrite is `to || substr(folder, …)`, and a zero-length `to` would produce a leading slash,
 * which is not a canonical path). `reason: 'cycle'` is a folder being moved inside itself.
 */
export type NinaFolderRenameResult =
  { ok: true; moved: number } | { ok: false; reason: 'root' | 'cycle' }

/* ============================================================================
 * §2 Column lists
 *
 * Spelled out once each rather than `db.select()`, for the same reason
 * `lib/llm/facts.ts` builds its profile field by field: a `select()` widens
 * silently when a column is added, and two of these rows go to a model.
 * ==========================================================================*/

const sessionColumns = {
  id: ninaChatSessions.id,
  title: ninaChatSessions.title,
  titleSource: ninaChatSessions.titleSource,
  pinnedAt: ninaChatSessions.pinnedAt,
  createdAt: ninaChatSessions.createdAt,
}

const messageColumns = {
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
}

const imageColumns = {
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
  sortOrder: ninaMessageImages.sortOrder,
  createdAt: ninaMessageImages.createdAt,
}

const avatarColumns = {
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
  isCurrent: ninaAvatars.isCurrent,
  announcedAt: ninaAvatars.announcedAt,
  createdAt: ninaAvatars.createdAt,
}

/* ============================================================================
 * §3 Identity
 * ==========================================================================*/

/**
 * RU-8's seed. `users.name` is what Google gave us; the `nickname` slot is what he told her to
 * call him, which she asks for in the first conversation. One batch, two statements, one snapshot
 * — so she can never be handed a name from before a rename and a nickname from after it.
 */
export async function getNinaIdentity(userId: string): Promise<NinaIdentity> {
  const [nameRows, slotRows] = await db.batch([
    db.select({ name: users.name }).from(users).where(eq(users.id, userId)).limit(1),

    db
      .select({ value: ninaMemorySlots.value })
      .from(ninaMemorySlots)
      .where(and(eq(ninaMemorySlots.userId, userId), eq(ninaMemorySlots.key, 'nickname')))
      .limit(1),
  ])

  const raw = slotRows[0]?.value
  return {
    fullName: nameRows[0]?.name ?? null,
    nickname: typeof raw === 'string' && raw.length > 0 ? raw : null,
  }
}

/* ============================================================================
 * §4 The conversation
 * ==========================================================================*/

/* ---------------------------------------------------------------------------
 * §4a Sessions — the conversation's partition (F35 R2, R4, R5, R11)
 *
 * Nine statements: create, read one, list with R5's derived sort key, resolve "the current one",
 * two title writes, the pin, a message count for the delete confirmation, and the delete itself.
 * Every one is `userId`-scoped in its WHERE, per this module's rule 1 — a session id arriving from
 * a URL is a claim, and only a row that came back from an owner-scoped read is a fact.
 * -------------------------------------------------------------------------*/

/**
 * A new, empty, untitled session (R2's "focus on a new topic").
 *
 * No title argument: a new session is always untitled, and `title IS NULL` is exactly what makes
 * phase 4's titler idempotent. Migration 0004's legacy session is the only titled row anything ever
 * inserts, and the migration writes it in SQL.
 *
 * The throw is not a failure path — `INSERT … RETURNING` always yields its row — it is how the
 * `T | undefined` from array indexing becomes the `T` the caller was promised. `actions.ts` does the
 * same thing for the same reason.
 */
export async function createNinaSession(userId: string): Promise<NinaSessionRow> {
  const [row] = await db
    .insert(ninaChatSessions)
    .values({ id: newId(), userId })
    .returning(sessionColumns)

  if (row == null) throw new Error('createNinaSession inserted no row')
  return row
}

/**
 * One session of his, or `null`. This is what turns `?s=<id>` from a claim into a fact, and phase 3
 * calls it before it reads a single message.
 *
 * `null` means "not yours, or gone" — deliberately one outcome, per this module's header. A screen
 * that distinguished them would tell a stranger which session ids exist.
 */
export async function getNinaSession(userId: string, id: string): Promise<NinaSessionRow | null> {
  const rows = await db
    .select(sessionColumns)
    .from(ninaChatSessions)
    .where(and(eq(ninaChatSessions.userId, userId), eq(ninaChatSessions.id, id)))
    .limit(1)

  return rows[0] ?? null
}

/**
 * The rows behind both public readers, in the base order the index already returns.
 *
 * **One batch, two statements, one snapshot** — the `getNinaIdentity` idiom. The second statement is
 * R5's sort key, derived rather than stored (see `nina_chat_sessions`'s header): `max(sent_at)`
 * grouped by session over `role = 'runner'`, which reads
 * `nina_messages_user_session_runner_idx` index-only. Batched with the first so a session row can
 * never be paired with an activity instant from a different moment.
 *
 * `max(ninaMessages.sentAt)` and not a hand-written `sql` aggregate: drizzle's `max()` applies the
 * COLUMN's own driver mapping, so this comes back as a real `Date` rather than as whatever the wire
 * format happened to be.
 *
 * Not exported. The order is a decision, and `lib/nina/sessions.ts` owns decisions — so the two
 * exported readers below differ only in which comparator they hand these rows to, which is the whole
 * point: "the list" and "the current session" are different questions with different answers.
 */
async function readNinaSessionsWithActivity(userId: string): Promise<NinaSessionListRow[]> {
  const [sessionRows, activityRows] = await db.batch([
    db
      .select(sessionColumns)
      .from(ninaChatSessions)
      .where(eq(ninaChatSessions.userId, userId))
      .orderBy(desc(ninaChatSessions.createdAt)),

    db
      .select({
        sessionId: ninaMessages.sessionId,
        lastUserMessageAt: max(ninaMessages.sentAt),
      })
      .from(ninaMessages)
      .where(and(eq(ninaMessages.userId, userId), eq(ninaMessages.role, 'runner')))
      .groupBy(ninaMessages.sessionId),
  ])

  const lastUserAt = new Map(activityRows.map((row) => [row.sessionId, row.lastUserMessageAt]))

  return sessionRows.map((row) => ({
    ...row,
    lastUserMessageAt: lastUserAt.get(row.id) ?? null,
  }))
}

/**
 * **R2's session history, in R4-then-R5 order: pinned first, then most recent user message first.**
 *
 * The ordering is `orderNinaSessions`'s and not this statement's, because
 * `vitest.config.ts` has no jsdom and no database — a rule in an `ORDER BY` is a rule no test can
 * assert (invariant 7). That is affordable because R2 asks for "a list of all past sessions", so
 * there is no `LIMIT` to be correct about; if a later phase paginates, the comparator moves into SQL
 * and its test moves with it.
 */
export async function listNinaSessions(userId: string): Promise<NinaSessionListRow[]> {
  return orderNinaSessions(await readNinaSessionsWithActivity(userId))
}

/**
 * **The id of his current session, creating one if he has none.**
 *
 * `mostRecentNinaSession` and NOT `listNinaSessions(...)[0]`: the display list puts pinned sessions
 * on top, so a session he pinned in March would otherwise become the destination of every proactive
 * message (assumption A3) and the default screen (assumption A4). "Most recent" means most recent by
 * activity, pins irrelevant, and `lib/nina/sessions.ts` keeps the two orders as two functions so this
 * cannot be got wrong quietly.
 *
 * **It creates, so it is a write, and two tabs can race it.** There is no transaction to take —
 * `db.transaction()` throws on neon-http — and no unique constraint can express "one session per
 * user" in a feature whose whole point is many. The loser of a race therefore gets a second empty
 * session, which is visible in the list and removable (R11). That is the honest cost; a lock we
 * cannot take and a constraint we must not add are the alternatives.
 */
export async function ensureNinaSession(userId: string): Promise<string> {
  const existing = mostRecentNinaSession(await readNinaSessionsWithActivity(userId))
  if (existing != null) return existing.id
  return (await createNinaSession(userId)).id
}

/**
 * R3's second half: he renames a session himself.
 *
 * Trim, cap at `NINA_SESSION_TITLE_MAX_CHARS`, refuse empty. `false` is "not yours, gone, or the title
 * was blank" — one outcome, as everywhere else in this module. `title_source = 'manual'` is what
 * tells phase 4's titler to keep its hands off, and it is set in the same statement as the title so
 * the two can never disagree.
 *
 * The cap here and phase 4's rule are ONE number, not a wide guard around a narrow rule: both are
 * `NINA_SESSION_TITLE_MAX_CHARS`, declared once in `lib/nina/sessions.ts` and imported by
 * `lib/nina/title.ts`. Phase 4 still owns the *semantic* rule — what "3-4 words" means when a model
 * returns seven — but not a second number.
 */
export async function renameNinaSession(
  userId: string,
  id: string,
  title: string,
): Promise<boolean> {
  const cleaned = title.trim().slice(0, NINA_SESSION_TITLE_MAX_CHARS)
  if (cleaned.length === 0) return false

  const updated = await db
    .update(ninaChatSessions)
    .set({ title: cleaned, titleSource: 'manual' })
    .where(and(eq(ninaChatSessions.userId, userId), eq(ninaChatSessions.id, id)))
    .returning({ id: ninaChatSessions.id })

  return updated.length > 0
}

/**
 * **Phase 4's titler write, and its idempotence is the `isNull` in the WHERE.**
 *
 * Written here because `lib/nina/queries.ts` is phase 1's file, not because phase 1 needs it. Phase 4
 * owns the prompt, the parse and the `after()` hook; this is the one statement it needs and cannot
 * write for itself.
 *
 * `title IS NULL` in the predicate rather than a read-then-write is what makes the whole thing safe
 * under the two conditions phase 4 has to survive: `after()` can run more than once, and two tabs can
 * finish the same first exchange at the same time. One conditional UPDATE, one row count, no race —
 * and it is also why a manually renamed session and 0004's `'backfill'` session are untouchable
 * without a second check: both have a non-NULL title.
 *
 * `false` means "already titled, not yours, or gone", which is precisely the set of cases in which
 * phase 4 should do nothing.
 */
export async function setNinaSessionTitleIfUntitled(
  userId: string,
  id: string,
  title: string,
): Promise<boolean> {
  const cleaned = title.trim().slice(0, NINA_SESSION_TITLE_MAX_CHARS)
  if (cleaned.length === 0) return false

  const updated = await db
    .update(ninaChatSessions)
    .set({ title: cleaned, titleSource: 'auto' })
    .where(
      and(
        eq(ninaChatSessions.userId, userId),
        eq(ninaChatSessions.id, id),
        isNull(ninaChatSessions.title),
      ),
    )
    .returning({ id: ninaChatSessions.id })

  return updated.length > 0
}

/**
 * R4. `pinned_at` is stamped or cleared; `now` is a parameter so a test can pin a date instead of
 * mocking global time — the `markNinaMessagesRead` precedent.
 *
 * Re-pinning an already-pinned session moves `pinned_at` forward, which changes nothing about the
 * order (pinning partitions the list, it does not sort it — see `compareNinaSessions`). It is left
 * that way rather than made a no-op because "when did I pin this" staying true costs nothing.
 */
export async function setNinaSessionPinned(
  userId: string,
  id: string,
  pinned: boolean,
  now: Date = new Date(),
): Promise<boolean> {
  const updated = await db
    .update(ninaChatSessions)
    .set({ pinnedAt: pinned ? now : null })
    .where(and(eq(ninaChatSessions.userId, userId), eq(ninaChatSessions.id, id)))
    .returning({ id: ninaChatSessions.id })

  return updated.length > 0
}

/**
 * How many messages a session holds — **for phase 5's delete confirmation, which is the only thing
 * standing between a mis-tap and a lost conversation.**
 *
 * There is no confirm dialog anywhere in this codebase today and no undo for R11 (the archive flag
 * was ruled out), so the confirmation has to be able to say what it destroys. A confirm that cannot
 * name the cost is not a confirm.
 *
 * Every role, not just his: the count is "what disappears", and her replies disappear too. That is
 * why it is a separate statement rather than a column on `listNinaSessions`'s aggregate, which is
 * deliberately `role = 'runner'` only.
 */
export async function countNinaSessionMessages(userId: string, sessionId: string): Promise<number> {
  const rows = await db
    .select({ n: sql<number>`count(*)`.mapWith(Number) })
    .from(ninaMessages)
    .where(and(eq(ninaMessages.userId, userId), eq(ninaMessages.sessionId, sessionId)))

  return rows[0]?.n ?? 0
}

/**
 * **R11. One DELETE, and the foreign keys do the rest.**
 *
 * `nina_chat_sessions` -> `nina_messages.session_id` (cascade) -> `nina_message_images.message_id`
 * (cascade, and it predates this feature). Postgres chains both, so this statement removes the
 * conversation and its photo ROWS.
 *
 * **What it deliberately leaves behind, stated rather than assumed:**
 *   - the Blob objects those image rows pointed at. The rows go, the bytes stay — the same call
 *     `deleteNinaMessage` makes, and the `reap-orphaned-blobs` skill does not cover the `nina/`
 *     prefix yet. This function does NOT pre-read the image rows to hand their pathnames back: a
 *     return value nothing consumes is a promise this set has not made.
 *   - every `source_message_id` in `nina_memory_slots` / `nina_memory_facts` that pointed into the
 *     session. Neither column has a foreign key, so nothing cascades and the ledger keeps its facts.
 *     That is the memory staying global on purpose (assumption A2): a distilled fact can be true
 *     after the sentence that produced it is gone, and deleting a conversation must not quietly
 *     delete what she knows about him.
 *   - `nina_turns`. It is the audit trail; a removed conversation does not un-spend its tokens.
 *
 * A surviving message in ANOTHER session that quoted one of these has its `reply_to_id` set to NULL
 * by the self-FK, and `resolveQuote` already degrades that to plain text. No new behaviour.
 *
 * `false` is "not yours, or already gone" — the caller turns that into one message.
 */
export async function removeNinaSession(userId: string, id: string): Promise<boolean> {
  const removed = await db
    .delete(ninaChatSessions)
    .where(and(eq(ninaChatSessions.userId, userId), eq(ninaChatSessions.id, id)))
    .returning({ id: ninaChatSessions.id })

  return removed.length > 0
}

/* ---------------------------------------------------------------------------
 * §4b The messages
 *
 * **The session is REQUIRED on the three functions that carry the partition** — `listNinaMessages`,
 * `getNinaMessageWindow` and `insertNinaMessages`. Phase 1 shipped it optional so that the tree
 * compiled with no caller touched; F35 phase 3 removed the option, and that removal is not tidying,
 * it is the proof. `nina_messages.session_id` is `NOT NULL`, there are exactly three writers of
 * this table (`lib/nina/actions.ts`, `lib/nina/proactive.ts`, `lib/nina/imagejobs.ts`), and two of
 * them run with no runner present and no session in view. A defaulted parameter would let one of
 * them keep compiling while writing into the wrong conversation, which is invisible until Nina
 * answers a question from another topic. Required means `tsc` names every writer that has not
 * decided — and all three now resolve through `lib/nina/sessionResolve.ts`, where assumption A3's
 * policy lives once.
 *
 * `countUnreadNinaMessages` and `markNinaMessagesRead` keep theirs optional for good: "how many of
 * hers are unread across every session" is the tab bar's question and "in this session" is the
 * screen's, and both are real.
 * -------------------------------------------------------------------------*/

/**
 * `user_id = $1`, plus `session_id = $2` when there is one. The `folderSubtree` idiom — a predicate
 * spelled once so several statements cannot drift apart.
 *
 * The session is optional HERE and required at three of the four call sites, which is not a
 * contradiction: `countUnreadNinaMessages` and `markNinaMessagesRead` genuinely ask their question
 * both ways (see §4b's header), and `getNinaMessageWindow` no longer uses this helper at all
 * because its two statements deliberately disagree about scope (F35 phase 3, D4).
 *
 * **This is also the ownership proof for every READ that takes a session id** (invariant 3). The
 * session predicate is ANDed onto the user predicate, never substituted for it, so a forged or
 * foreign `?s=` returns zero rows instead of somebody else's conversation. The one case a predicate
 * cannot cover is an INSERT, which is why `insertNinaMessages` checks by hand.
 */
function messageScope(userId: string, sessionId?: string): SQL | undefined {
  return sessionId == null
    ? eq(ninaMessages.userId, userId)
    : and(eq(ninaMessages.userId, userId), eq(ninaMessages.sessionId, sessionId))
}

/**
 * The last `limit` messages, returned **OLDEST FIRST** — display order, which is what phase 4's
 * `app/nina/page.tsx` renders straight down the page.
 *
 * The query itself is `ORDER BY seq DESC LIMIT n` and the array is reversed in TypeScript,
 * because "the newest n" is an index-backed descending scan of n rows while "the oldest n of the
 * tail" is not expressible without knowing where the tail starts. Reversing `n <= 200` items is
 * free; reading the whole conversation to reverse it would not be.
 *
 * ── `sessionId` IS REQUIRED (F35 PHASE 3, R2) ─────────────────────────────────────────────────
 * `opts.sessionId` slices that scan to one session, reading `nina_messages_session_seq_idx`. Phase
 * 1 shipped it optional to keep the tree green; this is the parameter phase 3 made required.
 * **`seq` is still the order** (invariant 6) — the session is a WHERE clause, not a re-sort, and no
 * per-session sequence exists.
 *
 * The caller is expected to have proved the session is his (`chooseActiveSession` over
 * `listNinaSessions`), but the `user_id` predicate stays anyway: invariant 3 says every statement in
 * this file scopes on the owner, and a foreign session id here comes back as `[]` rather than as
 * somebody else's conversation.
 */
export async function listNinaMessages(
  userId: string,
  opts: { limit: number; sessionId: string },
): Promise<NinaMessageRow[]> {
  const rows = await db
    .select(messageColumns)
    .from(ninaMessages)
    .where(messageScope(userId, opts.sessionId))
    .orderBy(desc(ninaMessages.seq))
    .limit(opts.limit)

  return rows.reverse()
}

/**
 * `readMessageWindow`'s query: the last `limit` messages **of one session**, oldest-first, plus how
 * many of his messages exist that this window does not show.
 *
 * ── THE WINDOW IS SESSION-SCOPED. THE COUNT IS NOT. (F35 PHASE 3, D4) ────────────────────────
 * The asymmetry is deliberate and it is the whole of assumption A1's safety margin, so it must not
 * be "fixed" into symmetry.
 *
 * The WINDOW carries the session predicate because that is what R2 means: "focus on a new topic" is
 * a claim about what Nina is GIVEN TO READ, not only about what the screen shows. This window is
 * handed to `glm-5.3` on every turn, so without the predicate a new session would look new and
 * behave exactly like the old one.
 *
 * The COUNT stays `WHERE user_id = $1` because of what the prompt does with it.
 * `lib/nina/prompts/system.ts` reads: *"An EMPTY window means you have never spoken to him —
 * introduce yourself and ask his name. `olderMessageCount` above 0 means there is more history you
 * cannot see."* Scope the count to the session as well and every new session presents to her as a
 * brand-new runner: empty window, zero older, so she introduces herself and asks his name again.
 * Left user-wide, `olderCount` reads as "how much of his history you are not being shown" — which
 * is exactly true, covers both "earlier in this chat" and "in his other chats", and keeps the
 * introduce-yourself branch for the one person it is for. No prompt string had to change.
 *
 * `olderCount` is a SQL `count(*)` minus the window's length — never `allMessages.length - limit`,
 * which would mean materialising the whole conversation to compute one integer. One batch, so the
 * count and the window are the same snapshot and the number can never disagree with the rows.
 */
export async function getNinaMessageWindow(
  userId: string,
  limit: number,
  sessionId: string,
): Promise<{ messages: NinaMessageRow[]; olderCount: number }> {
  const [rows, countRows] = await db.batch([
    db
      .select(messageColumns)
      .from(ninaMessages)
      .where(and(eq(ninaMessages.userId, userId), eq(ninaMessages.sessionId, sessionId)))
      .orderBy(desc(ninaMessages.seq))
      .limit(limit),

    /* USER-WIDE ON PURPOSE. See the header — this is not a missed predicate. */
    db
      .select({ total: sql<number>`count(*)`.mapWith(Number) })
      .from(ninaMessages)
      .where(eq(ninaMessages.userId, userId)),
  ])

  const total = countRows[0]?.total ?? 0
  return { messages: rows.reverse(), olderCount: Math.max(0, total - rows.length) }
}

/**
 * **One multi-row INSERT, not a batch of single inserts, and that is the R for phase 4's
 * ordering.** Postgres evaluates `nextval` once per row in the order the `VALUES` list gives
 * them, so `seq` comes out ascending in emission order — bubble 1 before bubble 4, always. A
 * `db.batch` of four separate inserts would also work today but does not promise it.
 *
 * Returns the inserted rows in the same order, ids and `seq` included, because phase 3 needs the
 * ids to hand back to the client and phase 6 needs them to attach images.
 *
 * ── THE SESSION IS REQUIRED, AND NOWHERE NULLABLE BELOW THIS LINE (F35 PHASE 3, R2) ─────────
 * `nina_messages.session_id` is `NOT NULL`, so unlike the reads above this one cannot simply omit a
 * predicate. Phase 1 shipped the parameter optional and resolved an omission through
 * `ensureNinaSession`; phase 3 removed both the option and the fallback, because a defaulted
 * session is exactly the bug that would be invisible — a writer keeps compiling while filing its
 * turn into the wrong conversation. All three writers now resolve through
 * `lib/nina/sessionResolve.ts` before they call this, which is where assumption A3's policy lives.
 *
 * `sendNinaMessage`'s INPUT is `string | null`, because "he has no sessions yet" is a real state a
 * client can be in; by the time a row reaches this function that has been resolved to an id.
 *
 * ── AND IT IS THE SECOND PLACE IN THIS FILE THAT VALIDATES AN FK BY HAND ────────────────────
 * `insertNinaMessageImages` was the first, for the same reason: the foreign key proves the session
 * EXISTS, and a session id that exists but is someone else's is exactly what invariant 3 is about. A
 * write that trusted it would file his message into a stranger's conversation, where a cascade could
 * later delete it. So an unowned session returns `[]`, the convention that function set — and
 * `actions.ts`'s existing `throw new Error('insertNinaMessages returned no row')` turns that into a
 * visible send failure rather than a silent one.
 */
export async function insertNinaMessages(
  userId: string,
  rows: readonly NinaMessageInsert[],
  sessionId: string,
): Promise<NinaMessageRow[]> {
  if (rows.length === 0) return []

  const owned = await getNinaSession(userId, sessionId)
  if (owned == null) return []
  const target = owned.id

  const inserted = await db
    .insert(ninaMessages)
    .values(
      rows.map((row) => ({
        id: newId(),
        userId,
        /* `target` is the required third parameter, proved owned above — so there is no `??` here,
         * no default, and no per-row session: a writer that has not resolved one does not compile. */
        sessionId: target,
        role: row.role,
        text: row.body,
        source: row.source ?? 'chat',
        turnId: row.turnId ?? null,
        replyToId: row.replyToId ?? null,
        runId: row.runId ?? null,
      })),
    )
    .returning(messageColumns)

  return [...inserted].sort((a, b) => a.seq - b.seq)
}

/**
 * Phase 7 resolves a quote target; phase 4 hydrates after an optimistic send. Scoped, so a
 * foreign id simply does not come back.
 */
export async function getNinaMessagesByIds(
  userId: string,
  ids: readonly string[],
): Promise<NinaMessageRow[]> {
  if (ids.length === 0) return []
  return db
    .select(messageColumns)
    .from(ninaMessages)
    .where(and(eq(ninaMessages.userId, userId), inArray(ninaMessages.id, [...ids])))
    .orderBy(asc(ninaMessages.seq))
}

/**
 * Phase 10's unread dot. Reads `nina_messages_user_unread_idx` exactly — the partial index exists
 * for this one query, which runs on every render of the tab bar.
 *
 * **`opts.sessionId` is permanent, not a migration step (F35 R9).** Unscoped is the tab bar's
 * question — "is there anything of hers I have not read, anywhere" — and scoped is the screen's,
 * and F35 phase 8 is the phase that decides which one clears the dot. Scoped, the partial index is
 * still the index that answers it: `session_id` is a heap filter over a set that holds only unread
 * messages of hers, which is a handful of rows by construction.
 */
export async function countUnreadNinaMessages(
  userId: string,
  opts: { sessionId?: string } = {},
): Promise<number> {
  const rows = await db
    .select({ n: sql<number>`count(*)`.mapWith(Number) })
    .from(ninaMessages)
    .where(
      and(
        messageScope(userId, opts.sessionId),
        eq(ninaMessages.role, 'nina'),
        isNull(ninaMessages.readAt),
      ),
    )
  return rows[0]?.n ?? 0
}

/**
 * Opening the chat marks everything of hers read. `opts.now` is a parameter so a test pins a date
 * instead of mocking global time — `lib/profile/schema.ts`'s `toProfileWrite` precedent.
 * Returns how many rows changed, so phase 10 can skip a `revalidatePath` when nothing did.
 *
 * **`now` moved from a positional parameter into an options bag (F35 R9), and that is the only shape
 * change in this file.** `sessionId` behind an optional `now` would have forced phase 8 to write
 * `markNinaMessagesRead(userId, undefined, sessionId)`. No caller or test in the repo ever passed
 * `now`, so nothing breaks; `app/nina/page.tsx`'s `markNinaMessagesRead(userId)` is unchanged.
 *
 * `opts.sessionId` scopes the mark to one conversation, which is what makes "has he opened the most
 * recent chat" answerable at all — phase 8 decides whether an unread message sitting in an OLDER
 * session should still raise the dot, and it needs both shapes to be able to choose.
 */
export async function markNinaMessagesRead(
  userId: string,
  opts: { sessionId?: string; now?: Date } = {},
): Promise<number> {
  const updated = await db
    .update(ninaMessages)
    .set({ readAt: opts.now ?? new Date() })
    .where(
      and(
        messageScope(userId, opts.sessionId),
        eq(ninaMessages.role, 'nina'),
        isNull(ninaMessages.readAt),
      ),
    )
    .returning({ id: ninaMessages.id })
  return updated.length
}

/* ---------------------------------------------------------------------------
 * §4c Message mutation — F35 PHASE 7's, and deliberately not written here.
 *
 * `updateNinaMessage(userId, id, body)` and `deleteNinaMessage(userId, id)` belong in THIS section,
 * between `markNinaMessagesRead` above and the `§5 Images` banner below. Phase 7 writes them,
 * because it owns the rule about what may be edited and what an empty edit means, and a statement
 * with no rule behind it would be a statement nobody could review.
 *
 * Two facts they inherit from this phase rather than deciding for themselves: `nina_message_images`
 * cascades from `message_id` so a deleted message takes its photo ROWS (never its blobs), and
 * `reply_to_id` is `ON DELETE SET NULL` so a quote pointing at a deleted message degrades to plain
 * text — which `resolveQuote` already handles.
 * -------------------------------------------------------------------------*/

/* ============================================================================
 * §5 Images
 * ==========================================================================*/

/**
 * **Phase 10, trigger 1's idempotence marker**, asked as a question rather than as a count: has a
 * `run_committed` message ever been written *for this run*?
 *
 * A `LIMIT 1` existence check, because the answer is boolean and the row may be one of four —
 * RU-5's multi-bubble turn writes one row per bubble and they all carry the same `source` and the
 * same `run_id`. Two tabs committing the same extraction, or a retried `after()`, must not produce
 * two reactions to one run, and this is the durable thing that says so: a serverless invocation
 * has no memory of the previous one, so the marker has to be a row.
 */
export async function hasProactiveMessageForRun(userId: string, runId: string): Promise<boolean> {
  const rows = await db
    .select({ id: ninaMessages.id })
    .from(ninaMessages)
    .where(
      and(
        eq(ninaMessages.userId, userId),
        eq(ninaMessages.runId, runId),
        eq(ninaMessages.source, 'run_committed'),
      ),
    )
    .limit(1)
  return rows.length > 0
}

/**
 * Phase 6 writes uploads, phase 12 writes generations. `messageId` is checked against the
 * caller's own messages first: the FK only proves the message EXISTS, and an attacker-supplied
 * message id that exists is exactly what invariant 7 is about. One extra statement, and it is
 * the only place in this file where a write validates a foreign key by hand.
 */
export async function insertNinaMessageImages(
  userId: string,
  rows: readonly NinaImageInsert[],
): Promise<NinaImageRow[]> {
  if (rows.length === 0) return []

  const messageIds = [...new Set(rows.map((row) => row.messageId))]
  const owned = await db
    .select({ id: ninaMessages.id })
    .from(ninaMessages)
    .where(and(eq(ninaMessages.userId, userId), inArray(ninaMessages.id, messageIds)))

  if (owned.length !== messageIds.length) return []

  const inserted = await db
    .insert(ninaMessageImages)
    .values(
      rows.map((row) => ({
        id: newId(),
        userId,
        messageId: row.messageId,
        kind: row.kind,
        blobUrl: row.blobUrl,
        pathname: row.pathname,
        width: row.width ?? null,
        height: row.height ?? null,
        bytes: row.bytes ?? null,
        description: row.description ?? null,
        prompt: row.prompt ?? null,
        sortOrder: row.sortOrder ?? 0,
      })),
    )
    .returning(imageColumns)

  return inserted
}

/**
 * Phase 13's gallery: every image in the conversation, newest first, his and hers together. Reads
 * `nina_message_images_user_created_idx` with no join — which is the whole reason this is a table
 * and not a `jsonb` column on `nina_messages`.
 */
export async function listNinaMessageImages(
  userId: string,
  opts: { limit: number },
): Promise<NinaImageRow[]> {
  return db
    .select(imageColumns)
    .from(ninaMessageImages)
    .where(eq(ninaMessageImages.userId, userId))
    .orderBy(desc(ninaMessageImages.createdAt), desc(ninaMessageImages.id))
    .limit(opts.limit)
}

/**
 * One conversation photo by id, ownership-scoped. The mirror of `getNinaAvatar` in §9, and it
 * exists for the same reason: `app/nina/page.tsx` has to turn ONE id from a URL into ONE blob URL
 * during a render, and `listNinaMessageImages(...).find(...)` reads up to `NINA_GALLERY_LIMIT`
 * rows to answer it.
 *
 * `null` for "not yours" and for "does not exist" alike — this module's stated rule, and here it is
 * also the security property: a page that distinguishes them is a page that tells a stranger which
 * ids exist.
 *
 * The projection is `imageColumns`, so the row carries `description`. **The caller reads `blobUrl`
 * and nothing else** (invariant 5); the description is `glm-4.6v`'s private text and its only
 * consumer is Nina's prompt.
 */
export async function getNinaMessageImage(
  userId: string,
  id: string,
): Promise<NinaImageRow | null> {
  const rows = await db
    .select(imageColumns)
    .from(ninaMessageImages)
    .where(and(eq(ninaMessageImages.userId, userId), eq(ninaMessageImages.id, id)))
    .limit(1)
  return rows[0] ?? null
}

/**
 * Hydrating a rendered message list: the images belonging to these messages, in one query rather
 * than one per bubble. Ordered by `(message_id, sort_order)` so a caller can group by the first
 * column without re-sorting.
 *
 * `id` is the final tiebreak above and here because `created_at` ties for rows written in one
 * statement — the same problem `nina_messages.seq` solves properly, and one worth solving
 * cheaply rather than properly for a table nobody paginates.
 */
export async function getNinaMessageImagesForMessages(
  userId: string,
  messageIds: readonly string[],
): Promise<NinaImageRow[]> {
  if (messageIds.length === 0) return []
  return db
    .select(imageColumns)
    .from(ninaMessageImages)
    .where(
      and(
        eq(ninaMessageImages.userId, userId),
        inArray(ninaMessageImages.messageId, [...messageIds]),
      ),
    )
    .orderBy(asc(ninaMessageImages.messageId), asc(ninaMessageImages.sortOrder))
}

/* ============================================================================
 * §6 Memory — slots and the ledger (RU-6)
 * ==========================================================================*/

/**
 * `nina_memory_slots.value` is `jsonb`, and phase 2's context wants a display string. This is the
 * one place that conversion happens.
 *
 * A bare JSON string is returned as itself — no quotes, no escaping — which is the common case
 * and the reason the column is `jsonb` rather than two columns. Anything structured is
 * `JSON.stringify`d, which is honest rather than pretty: a structured slot in a prompt should
 * look like data, because it IS data, and `pending_promises` is read by phase 13's evaluator and
 * not by the sentence Nina is writing.
 */
function renderSlotValue(value: NinaSlotValue): string {
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return JSON.stringify(value)
}

/**
 * Phase 2's `readMemorySlots`. Every slot for this user — a leading-column PK scan, which is why
 * the table has no secondary index. Ordered by `key` so two identical states produce two
 * identical prompts, which is what makes a voice regression bisectable.
 */
export async function getNinaMemorySlots(userId: string): Promise<NinaSlotRow[]> {
  const rows = await db
    .select({
      key: ninaMemorySlots.key,
      value: ninaMemorySlots.value,
      source: ninaMemorySlots.source,
      sourceMessageId: ninaMemorySlots.sourceMessageId,
      updatedAt: ninaMemorySlots.updatedAt,
    })
    .from(ninaMemorySlots)
    .where(eq(ninaMemorySlots.userId, userId))
    .orderBy(asc(ninaMemorySlots.key))

  return rows.map((row) => ({ ...row, value: renderSlotValue(row.value) }))
}

/**
 * One slot, **parsed** — the counterpart to `getNinaMemorySlots`' rendering. Phase 13 calls it
 * with `NINA_SLOT_PENDING_PROMISES` and casts the result to `NinaPendingPromisesSlot`; the cast
 * is the caller's because the caller is the only one that knows which key it asked for.
 */
export async function getNinaMemorySlot(
  userId: string,
  key: string,
): Promise<{ value: NinaSlotValue; source: NinaMemorySource; updatedAt: Date } | null> {
  const rows = await db
    .select({
      value: ninaMemorySlots.value,
      source: ninaMemorySlots.source,
      updatedAt: ninaMemorySlots.updatedAt,
    })
    .from(ninaMemorySlots)
    .where(and(eq(ninaMemorySlots.userId, userId), eq(ninaMemorySlots.key, key)))
    .limit(1)

  return rows[0] ?? null
}

/**
 * Upsert on `(user_id, key)` — RU-6's "upserted", made literal. A contradicting later statement
 * REPLACES the slot; the ledger below is what keeps the earlier claim.
 *
 * `updated_at` is set explicitly as well as by `$onUpdate`, because `$onUpdate` fires on the
 * UPDATE path and the INSERT path takes `defaultNow()` — spelling it in `set` means both paths
 * write the same instant and a caller comparing two slots' `updated_at` is comparing like with
 * like.
 */
export async function upsertNinaMemorySlot(userId: string, input: NinaSlotUpsert): Promise<void> {
  const source = input.source ?? 'distilled'
  const sourceMessageId = input.sourceMessageId ?? null

  await db
    .insert(ninaMemorySlots)
    .values({ userId, key: input.key, value: input.value, source, sourceMessageId })
    .onConflictDoUpdate({
      target: [ninaMemorySlots.userId, ninaMemorySlots.key],
      set: { value: input.value, source, sourceMessageId, updatedAt: new Date() },
    })
}

/** Phase 16's editor only. Nothing in the runtime deletes a slot — she corrects, she forgets. */
export async function deleteNinaMemorySlot(userId: string, key: string): Promise<boolean> {
  const deleted = await db
    .delete(ninaMemorySlots)
    .where(and(eq(ninaMemorySlots.userId, userId), eq(ninaMemorySlots.key, key)))
    .returning({ key: ninaMemorySlots.key })
  return deleted.length > 0
}

/**
 * Phase 2's `readMemoryFacts`: the ledger's newest `limit` rows, **newest first**. `created_at
 * DESC, id DESC` because a distillation pass writes several facts in one statement and they share
 * an instant; `id` is a random nanoid, so it is an arbitrary but STABLE tiebreak, which is all
 * that is needed for a prompt to be reproducible.
 */
export async function listNinaMemoryFacts(
  userId: string,
  opts: { limit: number },
): Promise<NinaFactRow[]> {
  return db
    .select({
      id: ninaMemoryFacts.id,
      category: ninaMemoryFacts.category,
      text: ninaMemoryFacts.text,
      confidence: ninaMemoryFacts.confidence,
      source: ninaMemoryFacts.source,
      sourceMessageId: ninaMemoryFacts.sourceMessageId,
      createdAt: ninaMemoryFacts.createdAt,
    })
    .from(ninaMemoryFacts)
    .where(eq(ninaMemoryFacts.userId, userId))
    .orderBy(desc(ninaMemoryFacts.createdAt), desc(ninaMemoryFacts.id))
    .limit(opts.limit)
}

/**
 * Append-only. One multi-row INSERT, no upsert, no dedupe — two identical statements a month
 * apart are two facts, and collapsing them would throw away the "he keeps saying this" signal.
 */
export async function appendNinaMemoryFacts(
  userId: string,
  rows: readonly NinaFactInsert[],
): Promise<NinaFactRow[]> {
  if (rows.length === 0) return []

  return db
    .insert(ninaMemoryFacts)
    .values(
      rows.map((row) => ({
        id: newId(),
        userId,
        category: row.category,
        text: row.text,
        confidence: row.confidence ?? 100,
        source: row.source ?? 'distilled',
        sourceMessageId: row.sourceMessageId ?? null,
      })),
    )
    .returning({
      id: ninaMemoryFacts.id,
      category: ninaMemoryFacts.category,
      text: ninaMemoryFacts.text,
      confidence: ninaMemoryFacts.confidence,
      source: ninaMemoryFacts.source,
      sourceMessageId: ninaMemoryFacts.sourceMessageId,
      createdAt: ninaMemoryFacts.createdAt,
    })
}

/**
 * **Phase 16's editor only, and the one exception to "append-only".** A ledger the app never
 * mutates but a human can correct is still an honest ledger; a ledger the DISTILLER can rewrite
 * is not, which is why phase 5 has no path to this function.
 */
export async function updateNinaMemoryFact(
  userId: string,
  id: string,
  patch: { category?: NinaFactCategory; text?: string; confidence?: number },
): Promise<boolean> {
  if (patch.category == null && patch.text == null && patch.confidence == null) return false

  const updated = await db
    .update(ninaMemoryFacts)
    .set({
      ...(patch.category != null ? { category: patch.category } : {}),
      ...(patch.text != null ? { text: patch.text } : {}),
      ...(patch.confidence != null ? { confidence: patch.confidence } : {}),
    })
    .where(and(eq(ninaMemoryFacts.userId, userId), eq(ninaMemoryFacts.id, id)))
    .returning({ id: ninaMemoryFacts.id })
  return updated.length > 0
}

/** Phase 16's editor only. See `updateNinaMemoryFact`. */
export async function deleteNinaMemoryFact(userId: string, id: string): Promise<boolean> {
  const deleted = await db
    .delete(ninaMemoryFacts)
    .where(and(eq(ninaMemoryFacts.userId, userId), eq(ninaMemoryFacts.id, id)))
    .returning({ id: ninaMemoryFacts.id })
  return deleted.length > 0
}

/* ============================================================================
 * §7 Nags — the escalation ledger (RU-9)
 * ==========================================================================*/

/** Phase 2's `readNags`. `[]` when she has never nagged, which is a normal first-week state. */
export async function getNinaNags(userId: string): Promise<NinaNagRow[]> {
  return db
    .select({
      code: ninaNags.code,
      level: ninaNags.level,
      count: ninaNags.count,
      lastMentionedOn: ninaNags.lastMentionedOn,
      updatedAt: ninaNags.updatedAt,
    })
    .from(ninaNags)
    .where(eq(ninaNags.userId, userId))
    .orderBy(asc(ninaNags.code))
}

/**
 * Records that she has now said something about `code`. `level` is supplied by phase 9 — this
 * function does not compute the ladder, because "what rung is he on" is a decision with a decay
 * rule and a threshold table, and neither belongs in a query.
 *
 * `count` is incremented IN SQL (`nina_nags.count + 1`) rather than read-then-written, so two
 * concurrent writers — the cron and an `after()` hook, which is a real pair — cannot lose one.
 */
export async function upsertNinaNag(userId: string, input: NinaNagUpsert): Promise<void> {
  await db
    .insert(ninaNags)
    .values({
      userId,
      code: input.code,
      level: input.level,
      count: 1,
      lastMentionedOn: input.lastMentionedOn,
    })
    .onConflictDoUpdate({
      target: [ninaNags.userId, ninaNags.code],
      set: {
        level: input.level,
        count: sql`${ninaNags.count} + 1`,
        lastMentionedOn: input.lastMentionedOn,
        updatedAt: new Date(),
      },
    })
}

/* ============================================================================
 * §8 Turns — the audit trail
 * ==========================================================================*/

/**
 * One row per model call, success or failure. Returns the id so the caller can stamp it onto the
 * messages the turn emitted — which means the turn row is written FIRST, before the messages, and
 * a turn with no messages is a turn that failed. That asymmetry is the point: a conversation that
 * silently lost a turn is unexplainable, and this is the table that explains it.
 *
 * **A third outcome exists and it is not a failure:** `status: 'pending'` with `args` populated is
 * phase 12's dispatched image job, closed by the callback minutes later in another process
 * (RULINGS C1 and C2). The id this function returns is that job's id — the opaque handle that
 * goes into the `workflow_dispatch` input *instead of the prompt*, because the repo is public.
 */
export async function insertNinaTurn(userId: string, input: NinaTurnInsert): Promise<string> {
  const id = newId()
  await db.insert(ninaTurns).values({
    id,
    userId,
    kind: input.kind,
    trigger: input.trigger ?? null,
    model: input.model,
    promptVersion: input.promptVersion ?? null,
    inputTokens: input.inputTokens ?? null,
    outputTokens: input.outputTokens ?? null,
    toolCalls: input.toolCalls ?? '',
    latencyMs: input.latencyMs ?? null,
    costMicroUsd: input.costMicroUsd ?? null,
    status: input.status,
    errorCode: input.errorCode ?? null,
    args: input.args ?? null,
  })
  return id
}

/**
 * Phase 12's daily cap, and phase 10's "have I already spoken today". Counts by `kind` since an
 * instant, and counts FAILED turns too — a cap that only counts successes is a cap an unlucky
 * afternoon can spend ten times over.
 */
export async function countNinaTurnsSince(
  userId: string,
  kind: NinaTurnKind,
  since: Date,
): Promise<number> {
  const rows = await db
    .select({ n: sql<number>`count(*)`.mapWith(Number) })
    .from(ninaTurns)
    .where(
      and(eq(ninaTurns.userId, userId), eq(ninaTurns.kind, kind), gte(ninaTurns.createdAt, since)),
    )
  return rows[0]?.n ?? 0
}

/* ============================================================================
 * §9 Avatars — her album (RU-7, R19, R23, R25)
 * ==========================================================================*/

/** Her face right now. Reads the partial unique index, so it is a single-row index lookup. */
export async function getCurrentNinaAvatar(userId: string): Promise<NinaAvatarRow | null> {
  const rows = await db
    .select(avatarColumns)
    .from(ninaAvatars)
    .where(and(eq(ninaAvatars.userId, userId), eq(ninaAvatars.isCurrent, true)))
    .limit(1)
  return rows[0] ?? null
}

/** The album, newest first. Phase 13's grid and phase 15's admin list. */
export async function listNinaAvatars(userId: string): Promise<NinaAvatarRow[]> {
  return db
    .select(avatarColumns)
    .from(ninaAvatars)
    .where(eq(ninaAvatars.userId, userId))
    .orderBy(desc(ninaAvatars.createdAt), desc(ninaAvatars.id))
}

/**
 * RU-17's whole mechanism: the current avatar she has NOT mentioned yet. Phase 13 (promise path)
 * and phase 10 (operator path) both poll this, make her comment on it in character, and then call
 * `markNinaAvatarAnnounced`. Two readers, one query, and no flag anyone has to remember to set.
 */
export async function getUnannouncedCurrentNinaAvatar(
  userId: string,
): Promise<NinaAvatarRow | null> {
  const rows = await db
    .select(avatarColumns)
    .from(ninaAvatars)
    .where(
      and(
        eq(ninaAvatars.userId, userId),
        eq(ninaAvatars.isCurrent, true),
        isNull(ninaAvatars.announcedAt),
      ),
    )
    .limit(1)
  return rows[0] ?? null
}

/**
 * **The order of these two statements is load-bearing.** `nina_avatars_user_current_unq` is a
 * partial unique index on `(user_id) where is_current`, so inserting a second current row before
 * un-currenting the first violates it mid-transaction. Un-current, then insert — the same order
 * phase 14's operator script uses, for the same reason, and one `db.batch` so the album is never
 * momentarily faceless.
 *
 * `announced_at` is left NULL: she has not said anything about this face yet, and
 * `getUnannouncedCurrentNinaAvatar` is what notices. The crop triple is left NULL too — no
 * transform, render it centred — because whoever generated or uploaded the image has not framed
 * it yet and phase 15 is where framing happens.
 */
export async function insertNinaAvatarAsCurrent(
  userId: string,
  input: NinaAvatarInsert,
): Promise<NinaAvatarRow> {
  const [, inserted] = await db.batch([
    db
      .update(ninaAvatars)
      .set({ isCurrent: false })
      .where(and(eq(ninaAvatars.userId, userId), eq(ninaAvatars.isCurrent, true))),

    db
      .insert(ninaAvatars)
      .values({
        id: newId(),
        userId,
        blobUrl: input.blobUrl,
        pathname: input.pathname,
        width: input.width ?? null,
        height: input.height ?? null,
        bytes: input.bytes ?? null,
        source: input.source,
        description: input.description ?? null,
        isCurrent: true,
      })
      .returning(avatarColumns),
  ])

  const row = inserted[0]
  if (row == null) {
    // Unreachable: an INSERT … RETURNING that ran without throwing produced a row. Thrown rather
    // than `!`-asserted so that if the driver ever changes shape, the failure names itself.
    throw new Error('insertNinaAvatarAsCurrent: INSERT returned no row')
  }
  return row
}

/** She has now said something about this face. Idempotent — a second call is a no-op. */
export async function markNinaAvatarAnnounced(
  userId: string,
  id: string,
  now: Date = new Date(),
): Promise<boolean> {
  const updated = await db
    .update(ninaAvatars)
    .set({ announcedAt: now })
    .where(
      and(eq(ninaAvatars.userId, userId), eq(ninaAvatars.id, id), isNull(ninaAvatars.announcedAt)),
    )
    .returning({ id: ninaAvatars.id })
  return updated.length > 0
}

/**
 * R23. `/admin/nina` (phase 15) saves the circular-frame transform it just let the user drag.
 * Passing `{ scale: null, x: null, y: null }` clears it back to plain centred `object-cover`,
 * which is the "reset" button — so this one function is both save and reset and there is no
 * second code path for the second one.
 *
 * No range validation here. The bounds ("scale ≥ 1, offsets inside the frame") are a property of
 * the framing UI and belong to a Zod schema phase 15 owns, next to the widget that produces the
 * numbers — the same division `lib/profile/schema.ts` keeps against `profiles`.
 */
export async function updateNinaAvatarCrop(
  userId: string,
  id: string,
  crop: NinaAvatarCrop,
): Promise<boolean> {
  const updated = await db
    .update(ninaAvatars)
    .set({ cropScale: crop.scale, cropX: crop.x, cropY: crop.y })
    .where(and(eq(ninaAvatars.userId, userId), eq(ninaAvatars.id, id)))
    .returning({ id: ninaAvatars.id })
  return updated.length > 0
}

/**
 * R25. What the picture DEPICTS, so "itu lagi dimana?" has an answer. Three writers, three
 * origins: phase 12 writes from its own generation prompt, phase 14 and phase 15 write what
 * phase 6's `glm-4.6v` describe pre-pass came back with. Separate from
 * `insertNinaAvatarAsCurrent` because two of those three only learn the description after the
 * row exists — a describe call is a second network round trip, and holding the album faceless
 * while it runs would be the wrong trade.
 */
export async function setNinaAvatarDescription(
  userId: string,
  id: string,
  description: string | null,
): Promise<boolean> {
  const updated = await db
    .update(ninaAvatars)
    .set({ description })
    .where(and(eq(ninaAvatars.userId, userId), eq(ninaAvatars.id, id)))
    .returning({ id: ninaAvatars.id })
  return updated.length > 0
}

/**
 * One album row by id, ownership-scoped. Phase 15's `/admin/nina` uses it to validate an id
 * arriving from a form before it changes anything, and to read `width`/`height` back for the crop
 * clamp. Returns `null` for "not yours" and for "does not exist" alike — the caller has no
 * legitimate use for the difference.
 */
export async function getNinaAvatar(userId: string, id: string): Promise<NinaAvatarRow | null> {
  const rows = await db
    .select(avatarColumns)
    .from(ninaAvatars)
    .where(and(eq(ninaAvatars.userId, userId), eq(ninaAvatars.id, id)))
    .limit(1)
  return rows[0] ?? null
}

/**
 * Make an existing album photo the current one. R23's "admin can also set which photo will be set
 * as her profpic".
 *
 * ── THE PRE-CHECK IS WHAT MAKES ZERO CURRENT AVATARS UNREACHABLE ─────────────────────────────
 * The statement order is forced by `nina_avatars_user_current_unq` (partial unique on `(user_id)
 * where is_current`): un-current first, then set the new one, exactly as
 * `insertNinaAvatarAsCurrent` does. But an UPDATE that matches no row does not fail — so if the id
 * were bogus, the batch would un-current the album and set nothing, leaving her with NO current
 * avatar and the page with nothing to show. Reading the row first and refusing turns that into a
 * `false` return. (One user, one writer, so the window between the read and the batch is
 * theoretical; the alternative is a `WHERE EXISTS` that this driver expresses far less legibly.)
 *
 * ── `announced_at` IS RE-ARMED ON PURPOSE ────────────────────────────────────────────────────
 * RU-17: a hand-changed avatar makes her speak. What the user perceives is "her face changed", and
 * the cause is irrelevant to that, so promoting an old album photo re-arms the announcement the
 * same way a fresh upload does. Phase 10 owns the trigger (`is_current AND announced_at IS NULL`);
 * this function writes no message and composes no line.
 */
export async function setCurrentNinaAvatar(userId: string, id: string): Promise<boolean> {
  const existing = await getNinaAvatar(userId, id)
  if (existing == null) return false
  if (existing.isCurrent) return true // idempotent: no un-currenting, no re-announcement

  await db.batch([
    db
      .update(ninaAvatars)
      .set({ isCurrent: false })
      .where(and(eq(ninaAvatars.userId, userId), eq(ninaAvatars.isCurrent, true))),

    db
      .update(ninaAvatars)
      .set({ isCurrent: true, announcedAt: null })
      .where(and(eq(ninaAvatars.userId, userId), eq(ninaAvatars.id, id))),
  ])
  return true
}

/**
 * Remove a photo from the album, and hand its blob back so the caller can delete the object.
 *
 * ── THE CURRENT PHOTO CANNOT BE DELETED, AND THAT IS THE WHOLE GUARD ────────────────────────
 * `eq(ninaAvatars.isCurrent, false)` in the WHERE clause is what makes "zero current avatars"
 * unreachable rather than repaired. Promotion-on-delete was rejected: "delete her face and
 * something else silently becomes it" is worse than a refusal that names the fix, and picking the
 * successor is precisely the choice `/admin/nina` exists to give the operator.
 *
 * `null` means "not yours, already gone, or current" — the caller turns that into one message,
 * because a page that distinguishes them is a page that tells a stranger which ids exist.
 *
 * ── TWO OBJECTS, NOT ONE (F34 R1) ───────────────────────────────────────────────────────────
 * A row can carry a derived thumbnail (`nina_avatars.thumb_url`), so this returns both refs. The
 * row is the only record that the thumbnail exists — its stored pathname carries Blob's random
 * suffix and is not derivable — so a delete that returns one ref leaks an object that nothing can
 * find again except a full store listing. Both thumbnail fields are NULL for every pre-F34 row,
 * and a caller must read NULL as "nothing to delete" rather than as a failure.
 */
export async function deleteNinaAvatar(
  userId: string,
  id: string,
): Promise<NinaAvatarBlobRef | null> {
  const removed = await db
    .delete(ninaAvatars)
    .where(
      and(eq(ninaAvatars.userId, userId), eq(ninaAvatars.id, id), eq(ninaAvatars.isCurrent, false)),
    )
    .returning({
      id: ninaAvatars.id,
      blobUrl: ninaAvatars.blobUrl,
      pathname: ninaAvatars.pathname,
      thumbUrl: ninaAvatars.thumbUrl,
      thumbPathname: ninaAvatars.thumbPathname,
    })
  return removed[0] ?? null
}

/* ---------------------------------------------------------------------------
 * §9b The album as a file manager — F34 R1
 *
 * Twelve statements: a folder-scoped page, a subtree manifest, a distinct-folder listing (which
 * unions `nina_folders` in), an album count, a plain batch insert, the bulk-move / rename /
 * recursive-delete / bulk-delete set phase 6 drives, and the three `nina_folders` declaration
 * statements. Every one of them is `userId`-scoped in its WHERE, per this module's rule 1.
 * -------------------------------------------------------------------------*/

/**
 * "This folder and everything under it", as one predicate.
 *
 * ── `left()` AND NOT `LIKE`, DELIBERATELY ───────────────────────────────────────────────────
 * The obvious spelling is `folder LIKE $1 || '/%'`, and it is the wrong tool for a statement that
 * rewrites or deletes rows: `%` and `_` are LIKE metacharacters, so a folder literally named
 * `100%` or `my_pics` would match siblings it has no business matching, and a recursive DELETE
 * would take them. `left(folder, n) = prefix` is an exact string comparison with no escaping to
 * get right, which lets `lib/admin/filetree.ts`'s grammar be a bound on SHAPE rather than the only
 * thing standing between a folder name and a wider delete than the user asked for. Defence in
 * depth is the point: either one alone would be a bug waiting for the other to be edited.
 *
 * ── THE ALBUM ROOT IS A SPECIAL CASE, NOT A ZERO-LENGTH PREFIX ──────────────────────────────
 * The root is `''`, so `'' || '/'` is `'/'`, which no canonical path starts with — the general
 * spelling would match NOTHING where it must match EVERYTHING. Hence the early return. The
 * `folder = prefix` disjunct is the folder's own rows; the `left()` disjunct is its descendants.
 *
 * ── THE COLUMN IS AN ARGUMENT, BECAUSE THERE ARE TWO FOLDER COLUMNS ─────────────────────────
 * `nina_avatars.folder` and `nina_folders.folder` both need this predicate and it must be the SAME
 * predicate for both: a rename that rewrote the photograph rows with `left()` and the declaration
 * rows with `LIKE` would be two subtly different definitions of "under this folder", and the pair
 * would drift on exactly the folder name (`100%`) that motivated `left()` in the first place. One
 * function, pointed at whichever column the statement is touching.
 *
 * Not exported: six callers in this file, and a predicate over a folder column is not a thing a
 * caller outside the data layer has any use for.
 */
function folderSubtree(column: PgColumn, folder: string): SQL {
  if (folder === '') return sql`true`
  const prefix = `${folder}/`
  const own = eq(column, folder)
  const under = sql`left(${column}, ${prefix.length}::int) = ${prefix}`
  return sql`(${own} OR ${under})`
}

/**
 * One page of one folder, newest first, plus the folder's row count — the explorer's content pane
 * (F34 R1).
 *
 * Reads `nina_avatars_user_folder_created_idx` as a range scan: equality on `user_id`, equality on
 * `folder`, and `(created_at desc, id desc)` already in index order, so nothing sorts. It is NOT
 * a filter over `listNinaAvatars` and it must not become one — the requirement is *"hundreds of
 * profile pics"*, and the whole point of this function existing beside that one is that no read on
 * this screen is unbounded.
 *
 * ── DIRECT CHILDREN ONLY ────────────────────────────────────────────────────────────────────
 * `folder = $2`, not the subtree. A file manager's content pane shows what is IN the folder you
 * opened; descendants are reached by opening them. `listNinaAvatarFolders` is what tells the tree
 * pane there is something to open.
 *
 * ── OFFSET, AND THE ARGUMENT IS ON `NinaAvatarFolderPage` ───────────────────────────────────
 * See that interface: the pager this feeds needs a total and a backward step, `OFFSET` at hundreds
 * of rows is an index range scan, and the drift a cursor would have avoided is named there and is
 * bounded to "a tile can repeat across two pages during an upload".
 *
 * ── TWO STATEMENTS, RUN CONCURRENTLY ────────────────────────────────────────────────────────
 * A `count(*) OVER ()` window would have made this one round trip, and it would report `total: 0`
 * for an over-shot `?page=` — indistinguishable from an empty folder, which is the one case phase
 * 5's pager has to tell apart ("nothing on this page, go to the first" vs "nothing in this folder
 * yet, drop a folder"). So the count is its own `SELECT`, issued in the same `Promise.all`. Both
 * statements read the same index; at the scale the requirement states this is cheaper than the
 * branch it removes.
 *
 * `NINA_ADMIN_PAGE_SIZE` is both the default and the CEILING for `limit`. A caller may ask for
 * fewer and cannot ask for more, so a hand-edited `?limit=` cannot turn one page into the
 * unpaginated read this function exists to avoid. `offset` is floored at 0 for the same reason:
 * a negative offset is a Postgres error, not a query.
 */
export async function listNinaAvatarsInFolder(
  userId: string,
  folder: string,
  opts: { limit?: number; offset?: number } = {},
): Promise<NinaAvatarFolderPage> {
  const limit = Math.max(1, Math.min(opts.limit ?? NINA_ADMIN_PAGE_SIZE, NINA_ADMIN_PAGE_SIZE))
  const offset = Math.max(0, Math.trunc(opts.offset ?? 0))
  const scope = and(eq(ninaAvatars.userId, userId), eq(ninaAvatars.folder, folder))

  const [rows, counted] = await Promise.all([
    db
      .select(avatarColumns)
      .from(ninaAvatars)
      .where(scope)
      .orderBy(desc(ninaAvatars.createdAt), desc(ninaAvatars.id))
      .limit(limit)
      .offset(offset),
    db
      .select({ total: sql<number>`count(*)`.mapWith(Number) })
      .from(ninaAvatars)
      .where(scope),
  ])

  return { rows, total: counted[0]?.total ?? 0 }
}

/**
 * Every dedupe key already stored under a folder and its descendants — the manifest side of F34
 * R1's *"it automatically upload only the new folders and files as optimization."*
 *
 * The browser walks a dropped folder, computes the same key per file that
 * `lib/admin/filetree.ts` computed at upload time, and `planFolderUpload` subtracts this set.
 * Which is why the SUBTREE and not one folder: the user drags `Nina/` and the diff has to know
 * about `Nina/2026/09/beach.jpg`.
 *
 * ── WHAT IT DOES NOT RETURN ─────────────────────────────────────────────────────────────────
 * Rows with a NULL `source_key` are excluded rather than returned with a null field. A row that
 * predates the file manager has no key, so it can never match a walked file, so including it would
 * be shipping bytes the diff must then filter out. The consequence is honest and worth stating: a
 * photo uploaded before F34 is invisible to the diff, and re-dropping the folder it came from
 * uploads it again as a second row. There is no key to match it on, and inventing one from
 * `blob_url` would be guessing at a `lastModified` nobody recorded.
 *
 * ── THE CAP IS ALLOWED TO TRUNCATE BECAUSE THE UNIQUE INDEX IS THE BACKSTOP ─────────────────
 * `NINA_ADMIN_MANIFEST_MAX` bounds the response at ~240 KB. A truncated manifest makes the diff
 * OVER-report: a file that is already stored looks new, is uploaded, and its insert is discarded
 * by `ON CONFLICT (user_id, source_key) DO NOTHING`. Slower, never wrong — and only because the
 * dedupe key is a constraint. Without `nina_avatars_user_source_key_unq` this would have to be a
 * paging protocol instead of a number.
 *
 * Ordered `(folder, id)` so the response is stable across two calls, which is what makes "the
 * manifest changed" mean something to a client that caches one.
 */
export async function listNinaAvatarManifest(
  userId: string,
  folder: string,
  limit: number = NINA_ADMIN_MANIFEST_MAX,
): Promise<NinaAvatarManifestEntry[]> {
  const rows = await db
    .select({
      id: ninaAvatars.id,
      folder: ninaAvatars.folder,
      sourceKey: ninaAvatars.sourceKey,
    })
    .from(ninaAvatars)
    .where(
      and(
        eq(ninaAvatars.userId, userId),
        isNotNull(ninaAvatars.sourceKey),
        folderSubtree(ninaAvatars.folder, folder),
      ),
    )
    .orderBy(asc(ninaAvatars.folder), asc(ninaAvatars.id))
    .limit(Math.max(1, Math.min(limit, NINA_ADMIN_MANIFEST_MAX)))

  // `isNotNull` narrows the ROWS but not the TYPE, and a `!` here would be asserting that the
  // WHERE clause and this line agree forever. `flatMap` makes the narrowing the compiler's.
  return rows.flatMap((row) =>
    row.sourceKey == null ? [] : [{ id: row.id, folder: row.folder, sourceKey: row.sourceKey }],
  )
}

/**
 * Every folder that exists, with how many photos are DIRECTLY in each — the tree pane's whole
 * read (F34 R1).
 *
 * ── A FOLDER EXISTS IF A PHOTO IS IN IT **OR** IF IT IS DECLARED ────────────────────────────
 * Two sources, unioned, neither authoritative:
 *
 *   · `nina_avatars.folder` — a folder exists because a photograph is filed in it. This is what
 *     makes a folder arrive by dropping one, and it is the only source that existed before the
 *     `nina_folders` table.
 *   · `nina_folders` — a folder exists because the operator made it. This is the only source that
 *     can represent an EMPTY folder, which is why the table exists at all (see its header).
 *
 * A UNION rather than a join in either direction, and that is the whole design: **both directions
 * of disagreement degrade instead of corrupting.** A populated folder whose declaration was never
 * written still appears, carried by its photographs. A declaration left behind after its
 * photographs are gone appears as an empty folder — which is a legal state now, not a ghost. There
 * is no repair path to write and no reconciliation job to run, because there is no state in which
 * one source is *wrong*: each one only ever adds a folder to the listing.
 *
 * **Do not "optimise" this into a read of `nina_folders` alone.** It would hide every folder
 * created by dropping one, which is the ordinary way folders arrive here.
 *
 * ── WHY TWO STATEMENTS AND A MERGE, NOT ONE `UNION ALL` OVER A DERIVED TABLE ─────────────────
 * The SQL union wants `sum(photos) group by folder` over a derived table to collapse the folder
 * that is BOTH declared and populated into one row, and that is a raw-`sql` fragment returning
 * untyped rows in a file whose every other read is a typed builder call. `db.batch` sends both in
 * one round trip — the same primitive `insertNinaAvatarAsCurrent` already uses — and the merge is
 * six lines of `Map` that a unit test can reason about. One round trip either way.
 *
 * ── THE ORDER IS CODEPOINT, AND IT IS DELIBERATELY NOT THE DATABASE'S ───────────────────────
 * Sorted here rather than by `ORDER BY` because the merge has to happen in JS anyway, and a JS
 * codepoint sort is the ordering this actually needs: a parent is a strict PREFIX of its children,
 * and a shorter string sorts before any string it prefixes, so **parents always precede their own
 * children** regardless of what else is in the list. A Postgres `ORDER BY` under a non-C collation
 * makes no such promise — `ICU` can order `a/b` before `a` depending on how it weights `/`. That
 * ordering is a convenience for `buildTree`, which materialises missing ancestors anyway
 * (invariant 6: it is unit-tested in `environment: 'node'`, and this sort is why its input is
 * deterministic).
 *
 * ── THE COUNTS ARE DIRECT, NOT RECURSIVE, AND A ZERO IS NORMAL ──────────────────────────────
 * A recursive roll-up here would be a second opinion about a tree the pure module already builds,
 * provable only against a database. `buildTree` sums its children to place them; it sums them to
 * label them too. **`photos: 0` is an ordinary result** — it is exactly what a declared empty
 * folder looks like — so nothing downstream may filter a zero out.
 *
 * Unbounded on purpose, and it is the one album read in this file that is. The result is one row
 * per DISTINCT folder — bounded by how many directories a human made, not by how many photos are
 * in them — and a tree pane that renders 40 of 200 folders is a broken tree, where a content pane
 * that renders 120 of 300 photos is a page.
 */
export async function listNinaAvatarFolders(userId: string): Promise<NinaAvatarFolderCount[]> {
  const [populated, declared] = await db.batch([
    db
      .select({
        folder: ninaAvatars.folder,
        photos: sql<number>`count(*)`.mapWith(Number),
      })
      .from(ninaAvatars)
      .where(eq(ninaAvatars.userId, userId))
      .groupBy(ninaAvatars.folder),

    db
      .select({ folder: ninaFolders.folder })
      .from(ninaFolders)
      .where(eq(ninaFolders.userId, userId)),
  ])

  /*
   * Declared first, populated second, so a folder that is both ends up with its real count rather
   * than the zero. The order of these two loops is the only thing that makes that true — swapping
   * them would zero out every declared folder that also holds photographs.
   */
  const counts = new Map<string, number>()
  for (const row of declared) counts.set(row.folder, 0)
  for (const row of populated) counts.set(row.folder, row.photos)

  return [...counts]
    .map(([folder, photos]) => ({ folder, photos }))
    .sort((a, b) => (a.folder < b.folder ? -1 : a.folder > b.folder ? 1 : 0))
}

/**
 * N photos into a folder, in one statement, **without touching `is_current`** — F34 R1's writer.
 *
 * ── WHY THIS EXISTS BESIDE `insertNinaAvatarAsCurrent` AND IS NOT A FLAG ON IT ──────────────
 * That function is correct and is the ONLY insert this module exposed before F34, and its whole
 * body is the un-current-then-insert `db.batch` that `nina_avatars_user_current_unq` forces. Which
 * makes it exactly wrong here: three hundred calls would rewrite the current row three hundred
 * times, re-arm `announced_at` three hundred times, and make her comment on a face nobody chose.
 * A dropped folder changes nothing about which photo is her face. So this insert writes
 * `is_current: false` for every row, never reads the current row, and never runs a second
 * statement — and `setCurrentNinaAvatar` stays the one and only way the crown moves, which is what
 * keeps the partial unique index's ordering rule confined to two functions instead of three.
 *
 * ── IDEMPOTENT ON THE DEDUPE KEY, WHICH IS THE POINT OF THE UNIQUE INDEX ────────────────────
 * `ON CONFLICT (user_id, source_key) DO NOTHING`. A retried Server Action, a double-clicked drop
 * and two tabs all resolve to "0 new rows" rather than to a duplicated album, and `.returning()`
 * omits the conflicting rows — so **`result.length` is how many were actually new**, which is the
 * number the caller reports to the user. A row whose `source_key` were NULL would never conflict,
 * which is precisely why `NinaAvatarBatchInsert.sourceKey` is required rather than optional.
 *
 * ── THE CAP THROWS, WHICH IS A DEPARTURE FROM THIS MODULE'S CONVENTION ──────────────────────
 * Rule 1's "return `null`, `[]` or `false` rather than throwing" is about OWNERSHIP and ABSENCE —
 * a caller's normal outcomes. A batch over `NINA_ADMIN_BATCH_MAX` is neither: it is a caller that
 * did not chunk, and the only honest report for that is loud. `lib/admin/schema.ts` (phase 4)
 * bounds it in Zod at the boundary where a browser's claim is checked, so this throw should be
 * unreachable — the same posture as `assertPathSegment` in `lib/nina/images.ts`: the cheap loud
 * defence at the one place that would otherwise do the damage.
 *
 * An empty batch returns `[]` WITHOUT running a statement, because `INSERT … VALUES` with no rows
 * is a syntax error and not an empty write.
 */
export async function insertNinaAvatars(
  userId: string,
  inputs: readonly NinaAvatarBatchInsert[],
): Promise<NinaAvatarRow[]> {
  if (inputs.length === 0) return []
  if (inputs.length > NINA_ADMIN_BATCH_MAX) {
    throw new Error(
      `insertNinaAvatars: ${inputs.length} rows exceeds NINA_ADMIN_BATCH_MAX (${NINA_ADMIN_BATCH_MAX})`,
    )
  }

  return db
    .insert(ninaAvatars)
    .values(
      inputs.map((input) => ({
        id: newId(),
        userId,
        blobUrl: input.blobUrl,
        pathname: input.pathname,
        folder: input.folder,
        filename: input.filename,
        sourceKey: input.sourceKey,
        thumbUrl: input.thumbUrl ?? null,
        thumbPathname: input.thumbPathname ?? null,
        width: input.width ?? null,
        height: input.height ?? null,
        bytes: input.bytes ?? null,
        source: input.source,
        description: input.description ?? null,
        isCurrent: false,
      })),
    )
    .onConflictDoNothing({ target: [ninaAvatars.userId, ninaAvatars.sourceKey] })
    .returning(avatarColumns)
}

/**
 * Move a SET of photos to another folder — an `UPDATE` of one column, and **no blob is copied**.
 *
 * That is the payoff of the header's "folder structure is metadata, not blob layout" decision,
 * stated at the site where the alternative would have been felt: under a folder-shaped blob
 * layout this would be a `put` of the original, a `put` of the thumbnail, two `del`s, and a row
 * update — four network calls per photo, none of them transactional with the row.
 *
 * Plural rather than singular, and it is not a convenience: phase 6's move acts on a selection,
 * and a loop over a singular statement is one HTTP round trip per photo inside one Server Action.
 * One id is a one-element array; `[]` returns `0` without running a statement, because
 * `inArray(col, [])` compiles to `false` in some drizzle versions and to a syntax error in others,
 * and neither is worth depending on.
 *
 * The destination is NOT validated here. Its grammar is `lib/admin/filetree.ts`'s
 * `validateFolderPath` and it is checked in phase 4's `folderPathSchema`, next to the widget that
 * produced it — the same division `updateNinaAvatarCrop` above states for the crop bounds, and for
 * the same reason: a bound is a property of the UI that produces the value, and duplicating it
 * here would put two opinions about a folder name in two files.
 *
 * Returns how many rows actually moved. Fewer than `ids.length` means "some of those are not
 * yours or are already gone", per this module's rule 1.
 */
export async function moveNinaAvatarsToFolder(
  userId: string,
  ids: readonly string[],
  folder: string,
): Promise<number> {
  if (ids.length === 0) return 0
  const updated = await db
    .update(ninaAvatars)
    .set({ folder })
    .where(and(eq(ninaAvatars.userId, userId), inArray(ninaAvatars.id, [...ids])))
    .returning({ id: ninaAvatars.id })
  return updated.length
}

/**
 * Rename or move a folder AND everything under it — one `UPDATE`, again with no blob copied.
 *
 * ── THE REWRITE ────────────────────────────────────────────────────────────────────────────
 * `SET folder = $to || substr(folder, length($from) + 1)`. For the folder's own rows,
 * `substr(from, len+1)` is `''`, so they become `$to`. For a descendant `from/a/b`, it is `/a/b`,
 * so it becomes `to/a/b`. One statement, whatever the depth, and the tree's shape below the moved
 * node is preserved rather than recomputed. `renameFolder` and `moveFolder` are the same
 * statement: renaming is moving to a sibling path, and giving them separate implementations would
 * be two chances to get the prefix arithmetic wrong.
 *
 * ── THE TWO REFUSALS ───────────────────────────────────────────────────────────────────────
 *   - **The album root, at either end.** It cannot be renamed, because it has no name — it is the
 *     absence of a path. It cannot be a destination either, and that one is arithmetic rather than
 *     philosophy: `'' || '/a/b'` is `/a/b`, a leading slash, which is not a canonical
 *     `nina_avatars.folder` value. A "flatten everything onto the root" operation would need its
 *     own statement, and nothing in the plan asks for one.
 *   - **A folder into itself.** `to.startsWith(from + '/')` is a destination inside the subtree
 *     being rewritten, which would produce paths nested inside their own former selves and a tree
 *     the builder cannot draw. `to === from` is not that: it is a no-op, and it succeeds with
 *     `moved: 0` rather than being refused, because an idempotent rename is a correct rename.
 *
 * Both refusals are also decided, with better messages, by phase 6's `planRelocation` before this
 * is called. They are kept here anyway — the `setCurrentNinaAvatar` posture: a guard that could
 * argue it is redundant is cheap, and this one is the difference between a bad argument and a
 * corrupted tree.
 *
 * `moved: 0` is also a legitimate outcome for a real rename, two ways: a folder can hold nothing
 * but subfolders that hold nothing, or it can be a `nina_folders` declaration with no photographs
 * in it at all. Either way the rename still has to happen, and its `nina_folders` half
 * (`renameNinaFolderSubtree`) is a separate statement phase 6 runs after this one. Phase 6 must
 * not read `0` as failure.
 */
export async function renameNinaAvatarFolder(
  userId: string,
  from: string,
  to: string,
): Promise<NinaFolderRenameResult> {
  if (from === '' || to === '') return { ok: false, reason: 'root' }
  if (to === from) return { ok: true, moved: 0 }
  if (to.startsWith(`${from}/`)) return { ok: false, reason: 'cycle' }

  const updated = await db
    .update(ninaAvatars)
    .set({
      folder: sql`${to}::text || substr(${ninaAvatars.folder}, ${from.length + 1}::int)`,
    })
    .where(and(eq(ninaAvatars.userId, userId), folderSubtree(ninaAvatars.folder, from)))
    .returning({ id: ninaAvatars.id })

  return { ok: true, moved: updated.length }
}

/**
 * Delete a folder and everything under it, handing back every blob ref so the caller can remove
 * the objects.
 *
 * ── THE CURRENT PHOTO IS SKIPPED HERE AND REFUSED ONE LAYER UP ──────────────────────────────
 * `eq(ninaAvatars.isCurrent, false)` is in the WHERE, exactly as it is in `deleteNinaAvatar`
 * above, so "zero current avatars" is unreachable from this statement no matter what a caller
 * does. What this statement deliberately does NOT do is decide whether the operation should have
 * happened at all: a subtree delete that silently leaves her photo behind reads as a delete that
 * half-worked, and the operator's next move is to try again and watch it half-work identically.
 *
 * That decision is phase 6's `deleteNinaAlbumFolderAction`, and it has to be, because phase 6
 * offers two answers to it: refuse the whole operation naming the photo (the default), or delete
 * everything else and say which photo stayed (`keepCurrent`). A statement that refused the subtree
 * — which is what this function's draft did — can express the first and not the second. So the
 * action reads `getCurrentNinaAvatar` itself, decides, and then calls this.
 *
 * (Promotion-on-delete stays rejected for the reason `deleteNinaAvatar` gives: picking the
 * successor is the choice `/admin/nina` exists to offer.)
 *
 * ── ROWS FIRST, BLOBS BEST-EFFORT ──────────────────────────────────────────────────────────
 * This function deletes rows only and returns refs; the caller `del()`s. That order is
 * `deleteNinaAvatarAction`'s argument and it holds at any batch size: an orphaned blob is
 * recoverable (a store listing finds it, and ruling D4's card is about teaching `blob-reap` to),
 * while a row pointing at an object that is already gone is a broken image on a screen with no
 * way to fix itself. A caller must expect BOTH refs per row and must tolerate a NULL thumbnail.
 */
export async function deleteNinaAvatarsInFolderTree(
  userId: string,
  folder: string,
): Promise<NinaAvatarBlobRef[]> {
  return db
    .delete(ninaAvatars)
    .where(
      and(
        eq(ninaAvatars.userId, userId),
        eq(ninaAvatars.isCurrent, false),
        folderSubtree(ninaAvatars.folder, folder),
      ),
    )
    .returning({
      id: ninaAvatars.id,
      blobUrl: ninaAvatars.blobUrl,
      pathname: ninaAvatars.pathname,
      thumbUrl: ninaAvatars.thumbUrl,
      thumbPathname: ninaAvatars.thumbPathname,
    })
}

/**
 * Delete a SET of photos by id, handing back their blob refs. The bulk form of `deleteNinaAvatar`,
 * and the same guard: `is_current = false` is in the WHERE, so her current photo survives a
 * selection that includes it and comes back absent from the result rather than deleted.
 *
 * One statement rather than a loop, for `moveNinaAvatarsToFolder`'s reason: 200 selected photos
 * would be 200 neon-http round trips inside one Server Action, which is both slow enough to reach
 * the function's duration limit and 200 chances to fail halfway with no record of where.
 *
 * `removed.length < ids.length` is normal and means some of those ids are not the caller's, are
 * already gone, or are her current photo. Deciding which of those to tell the operator about is
 * phase 6's; this reports facts.
 */
export async function deleteNinaAvatars(
  userId: string,
  ids: readonly string[],
): Promise<NinaAvatarBlobRef[]> {
  if (ids.length === 0) return []
  return db
    .delete(ninaAvatars)
    .where(
      and(
        eq(ninaAvatars.userId, userId),
        eq(ninaAvatars.isCurrent, false),
        inArray(ninaAvatars.id, [...ids]),
      ),
    )
    .returning({
      id: ninaAvatars.id,
      blobUrl: ninaAvatars.blobUrl,
      pathname: ninaAvatars.pathname,
      thumbUrl: ninaAvatars.thumbUrl,
      thumbPathname: ninaAvatars.thumbPathname,
    })
}

/**
 * How many photos the album holds, as a number rather than as a list of rows.
 *
 * ── WHY THIS EXISTS: `app/admin/page.tsx` WAS READING THE WHOLE ALBUM TO PRINT ITS SIZE ─────
 * The `/admin` hub does `listNinaAvatars(userId)` and then uses nothing but `album.length`. That
 * was a handful of rows when F33 landed it. After F34 it is *"hundreds of profile pics"* — every
 * column, every blob URL, every `description` — fetched in full on every visit to the hub, to
 * render one integer. This is the read that should always have been there, and the hub is its one
 * call site. Reported here rather than in a follow-up card because the phase that makes a read
 * grow is the phase that owns replacing it.
 *
 * Reads `nina_avatars_user_created_idx` as a count over an index range on `user_id`. No folder
 * predicate: the hub's number is the whole album, which is exactly the read
 * `listNinaAvatarsInFolder` cannot answer.
 */
export async function countNinaAvatars(userId: string): Promise<number> {
  const counted = await db
    .select({ total: sql<number>`count(*)`.mapWith(Number) })
    .from(ninaAvatars)
    .where(eq(ninaAvatars.userId, userId))
  return counted[0]?.total ?? 0
}

/**
 * Declare one or more folders. Idempotent, and the album root is silently dropped.
 *
 * `ON CONFLICT DO NOTHING` on the composite primary key is what makes this safe to call from
 * anywhere without asking first — phase 6's "New subfolder" calls it, and phase 4's batch register
 * calls it for the folder an upload lands in, so a folder that arrived by being dropped is
 * declared too and survives its photographs being removed. Two tabs creating the same folder is a
 * no-op, not a duplicate and not an error.
 *
 * ── THE ROOT IS DROPPED HERE, NOT REFUSED ───────────────────────────────────────────────────
 * `''` is the album root: it always exists and cannot be created (see `ninaFolders`'s header). A
 * caller passing it is not making a mistake worth an exception — `planFolderUpload` legitimately
 * reports root-level files — so it is filtered. An empty input after filtering returns `0` without
 * a statement, because `db.insert(...).values([])` is a syntax error and not an empty write.
 *
 * Returns how many declarations were NEW, which is `returning()`'s row count under
 * `DO NOTHING` — useful to phase 6 for telling "created" from "already existed" without a
 * second read.
 */
export async function declareNinaFolders(
  userId: string,
  folders: readonly string[],
): Promise<number> {
  const wanted = [...new Set(folders.filter((folder) => folder !== ''))]
  if (wanted.length === 0) return 0

  const inserted = await db
    .insert(ninaFolders)
    .values(wanted.map((folder) => ({ userId, folder })))
    .onConflictDoNothing()
    .returning({ folder: ninaFolders.folder })
  return inserted.length
}

/**
 * Rewrite declared paths under a renamed or moved prefix — the `nina_folders` half of
 * `renameNinaAvatarFolder`. Phase 6 calls both, in that order, for one rename.
 *
 * The same `folderSubtree` predicate as above, for the same reason: `left()` and not `LIKE`, so a
 * folder named `100%` cannot widen the match. `overlay()` replaces the prefix in place rather than
 * re-deriving the path, so a descendant four levels down moves with its ancestor and nothing has to
 * parse a path in SQL.
 *
 * Returns the number of declarations rewritten. **`0` is a success**, not a failure — it means the
 * renamed folder had no declarations under it, which is the ordinary case for a folder that arrived
 * by being dropped and was never declared. Phase 6 must not read it as "the folder did not exist";
 * `renameNinaAvatarFolder`'s row count is not proof of existence either, and
 * `listNinaAvatarFolders` is what answers that question.
 */
export async function renameNinaFolderSubtree(
  userId: string,
  from: string,
  to: string,
): Promise<number> {
  const rewritten = await db
    .update(ninaFolders)
    .set({
      folder: sql`overlay(${ninaFolders.folder} placing ${to} from 1 for ${from.length})`,
    })
    .where(and(eq(ninaFolders.userId, userId), folderSubtree(ninaFolders.folder, from)))
    .returning({ folder: ninaFolders.folder })
  return rewritten.length
}

/**
 * Undeclare a folder and everything under it. The `nina_folders` half of
 * `deleteNinaAvatarsInFolderTree`.
 *
 * **Phase 6 decides WHETHER to call this, and that decision is not obvious**: under its
 * `keepCurrent` policy the folder still holds her current photograph, so the folder must go on
 * existing and this must NOT be called. Calling it anyway would undeclare a folder that still has
 * a row in it — which `listNinaAvatarFolders` would paper over (the photograph carries the folder),
 * making the bug invisible until the last photograph left. That is precisely the class of silent
 * disagreement the UNION is designed to absorb rather than to excuse, so the ordering rule is
 * written down here as well as there: **undeclare only when the subtree is actually empty.**
 */
export async function deleteNinaFolderSubtree(userId: string, folder: string): Promise<number> {
  if (folder === '') return 0
  const removed = await db
    .delete(ninaFolders)
    .where(and(eq(ninaFolders.userId, userId), folderSubtree(ninaFolders.folder, folder)))
    .returning({ folder: ninaFolders.folder })
  return removed.length
}
