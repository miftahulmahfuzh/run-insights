import { and, asc, desc, eq } from 'drizzle-orm'

import { db } from '@/lib/db'
import {
  ninaMemoryFacts,
  ninaMemorySlots,
  type NinaFactCategory,
  type NinaMemorySource,
  type NinaSlotValue,
} from '@/lib/db/schema'
import { newId } from '@/lib/id'
import type { NinaFactInsert, NinaFactRow, NinaSlotRow, NinaSlotUpsert } from './shapes'

/**
 * Nina's memory statements — the slots carried into every prompt and the append-only ledger of
 * distilled facts (queries.ts §6 "Memory — slots and the ledger (RU-6)"), plus the private
 * `renderSlotValue` conversion.
 *
 * Split out of `lib/nina/queries.ts` on 2026-09-12; that file remains the public barrel and
 * re-exports everything here, so no importer changes. Banner prose below moved byte-identical.
 *
 * The flat module `lib/nina/memory.ts` is a DIFFERENT file — the distiller's pure planning half
 * (zod schemas, the write-plan, no SQL). This is the persistence half that reads and writes
 * `nina_memory_slots` / `nina_memory_facts`. The mirror naming is deliberate.
 *
 * Imports foundation-wards only (`./shapes`, `@/lib/db*`) — never the barrel
 * `@/lib/nina/queries`. The layer-wide rules (userId scoping, never writing `runs`/`records`/
 * `badges`/`insights`, `db.batch` over `db.transaction`, no `server-only`) live on the barrel's
 * header; this module inherits them and does not restate them.
 */
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
        source: row.source ?? 'distilled',
        sourceMessageId: row.sourceMessageId ?? null,
      })),
    )
    .returning({
      id: ninaMemoryFacts.id,
      category: ninaMemoryFacts.category,
      text: ninaMemoryFacts.text,
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
  patch: { category?: NinaFactCategory; text?: string },
): Promise<boolean> {
  if (patch.category == null && patch.text == null) return false

  const updated = await db
    .update(ninaMemoryFacts)
    .set({
      ...(patch.category != null ? { category: patch.category } : {}),
      ...(patch.text != null ? { text: patch.text } : {}),
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
