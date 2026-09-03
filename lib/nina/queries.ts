import { and, asc, desc, eq, gte, inArray, isNull, sql } from 'drizzle-orm'

import { db } from '@/lib/db'
import {
  ninaAvatars,
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
  type NinaSlotValue,
  type NinaTurnKind,
  type NinaTurnStatus,
} from '@/lib/db/schema'
import { newId } from '@/lib/id'

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

/* ============================================================================
 * §2 Column lists
 *
 * Spelled out once each rather than `db.select()`, for the same reason
 * `lib/llm/facts.ts` builds its profile field by field: a `select()` widens
 * silently when a column is added, and two of these rows go to a model.
 * ==========================================================================*/

const messageColumns = {
  id: ninaMessages.id,
  seq: ninaMessages.seq,
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

/**
 * The last `limit` messages, returned **OLDEST FIRST** — display order, which is what phase 4's
 * `app/nina/page.tsx` renders straight down the page.
 *
 * The query itself is `ORDER BY seq DESC LIMIT n` and the array is reversed in TypeScript,
 * because "the newest n" is an index-backed descending scan of n rows while "the oldest n of the
 * tail" is not expressible without knowing where the tail starts. Reversing `n <= 200` items is
 * free; reading the whole conversation to reverse it would not be.
 */
export async function listNinaMessages(
  userId: string,
  opts: { limit: number },
): Promise<NinaMessageRow[]> {
  const rows = await db
    .select(messageColumns)
    .from(ninaMessages)
    .where(eq(ninaMessages.userId, userId))
    .orderBy(desc(ninaMessages.seq))
    .limit(opts.limit)

  return rows.reverse()
}

/**
 * Phase 2's `readMessageWindow`: the last `limit` messages oldest-first, plus how many exist
 * before them, so the system prompt can say "there are 312 earlier messages" instead of implying
 * the conversation began forty messages ago.
 *
 * `olderCount` is a SQL `count(*)` minus the window's length — never `allMessages.length - limit`,
 * which would mean materialising the whole conversation to compute one integer. One batch, so the
 * count and the window are the same snapshot and the number can never disagree with the rows.
 */
export async function getNinaMessageWindow(
  userId: string,
  limit: number,
): Promise<{ messages: NinaMessageRow[]; olderCount: number }> {
  const [rows, countRows] = await db.batch([
    db
      .select(messageColumns)
      .from(ninaMessages)
      .where(eq(ninaMessages.userId, userId))
      .orderBy(desc(ninaMessages.seq))
      .limit(limit),

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
 */
export async function insertNinaMessages(
  userId: string,
  rows: readonly NinaMessageInsert[],
): Promise<NinaMessageRow[]> {
  if (rows.length === 0) return []

  const inserted = await db
    .insert(ninaMessages)
    .values(
      rows.map((row) => ({
        id: newId(),
        userId,
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
 */
export async function countUnreadNinaMessages(userId: string): Promise<number> {
  const rows = await db
    .select({ n: sql<number>`count(*)`.mapWith(Number) })
    .from(ninaMessages)
    .where(
      and(
        eq(ninaMessages.userId, userId),
        eq(ninaMessages.role, 'nina'),
        isNull(ninaMessages.readAt),
      ),
    )
  return rows[0]?.n ?? 0
}

/**
 * Opening the chat marks everything of hers read. `now` is a parameter so a test pins a date
 * instead of mocking global time — `lib/profile/schema.ts`'s `toProfileWrite` precedent.
 * Returns how many rows changed, so phase 10 can skip a `revalidatePath` when nothing did.
 */
export async function markNinaMessagesRead(
  userId: string,
  now: Date = new Date(),
): Promise<number> {
  const updated = await db
    .update(ninaMessages)
    .set({ readAt: now })
    .where(
      and(
        eq(ninaMessages.userId, userId),
        eq(ninaMessages.role, 'nina'),
        isNull(ninaMessages.readAt),
      ),
    )
    .returning({ id: ninaMessages.id })
  return updated.length
}

/* ============================================================================
 * §5 Images
 * ==========================================================================*/

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
