import 'server-only'

import { and, eq } from 'drizzle-orm'

import { db } from '@/lib/db'
import { ninaMemoryFacts, type NinaFactCategory, type NinaSlotValue } from '@/lib/db/schema'
import {
  appendNinaMemoryFacts,
  deleteNinaMemoryFact,
  deleteNinaMemorySlot,
  getNinaMemorySlot,
  getNinaMemorySlots,
  listNinaMemoryFacts,
  upsertNinaMemorySlot,
  type NinaFactRow,
  type NinaSlotRow,
} from '@/lib/nina/queries'

/**
 * **The only file in `/admin/memory` that writes a memory row.**
 *
 * ── WHY THIS FILE EXISTS AT ALL ─────────────────────────────────────────────────────────────
 * `upsertNinaMemorySlot` and `appendNinaMemoryFacts` both default the `source` column to the
 * distiller's own value when the field is omitted (`lib/nina/queries.ts`). Phase 5's whole
 * admin-preservation ruling keys off that column: a `replace` slot whose row says admin is
 * DEFERRED rather than overwritten, and an admin ledger row is the row the distiller cannot
 * reach. So an admin write that omits the field does not fail — it silently disables its own
 * protection, and the next thing the runner says in chat quietly re-breaks the memory he just
 * came here to fix. That is the one failure mode of this whole page, and it is invisible.
 *
 * The fix is to make the field impossible to omit by removing it from the vocabulary: every draft
 * type below is `Omit<…, 'source' | 'sourceMessageId'>` in spirit — the two fields simply are not
 * parameters — so a caller cannot mislabel a row because there is nowhere to put the label.
 * `lib/admin/memoryActions.ts` imports only this module, and `tests/admin.memory.test.ts` asserts
 * both halves structurally.
 *
 * ── WHY `adminUpdateFact` WRITES ITS OWN STATEMENT ──────────────────────────────────────────
 * R1 allows an edit to a DISTILLED ledger row. Such a row points at a real chat message, so
 * rewriting its text and leaving the pointer would make the row misquote that message — the one
 * genuine data-integrity objection in this page, and the reason the old permissions predicate
 * refused the edit at all. The resolution is not to keep refusing: it is to stop claiming the
 * sentence is a quotation. So the edit re-labels the row `source = 'admin'` with
 * `source_message_id = NULL`, in ONE statement, and the pointer stops being a lie.
 *
 * The query layer's own fact patch type has no `source` field on purpose, and `lib/nina/queries.ts`
 * is edited by another phase of this plan set in this same worktree — so the statement is written
 * here instead of growing that one. `lib/admin/users.ts` is the precedent for an admin module
 * reaching `db` directly, behind `requireAdmin()`, with the reason written down. The `WHERE`
 * carries `user_id` first (invariant 7) exactly as the query it replaces did.
 *
 * ── AND WHY IT IS NOT IN `lib/nina/` ────────────────────────────────────────────────────────
 * `tests/nina.distill.test.ts` case 14 reads `lib/nina/memory.ts` and `lib/nina/distill.ts` and
 * asserts neither imports the two mutating ledger queries — phase 5's structural guarantee that
 * the distiller cannot rewrite the ledger. This file imports one of them and writes the other by
 * hand. Putting it under `lib/nina/` would put the mutating writes one directory away from a test
 * whose entire point is that they are not reachable from there. Under `lib/admin/` the separation
 * is a directory boundary, not a naming convention, and phase 5's test needs no edit.
 *
 * `source_message_id` is ALWAYS null here, and that is a real answer rather than missing data:
 * nothing in the chat said it. Phase 1 made the column nullable for exactly this page.
 */

/** A hand-written ledger row. No source fields — see the header. */
export interface AdminFactDraft {
  category: NinaFactCategory
  text: string
  /** Integer percent 0–100. Phase 1 defaults it to 100; every caller here passes it explicitly. */
  confidence: number
}

/** A slot write. `value` is already canonicalised by `canonicaliseSlotValue`. */
export interface AdminSlotDraft {
  key: string
  value: NinaSlotValue
}

export async function adminUpsertSlot(userId: string, draft: AdminSlotDraft): Promise<void> {
  await upsertNinaMemorySlot(userId, {
    key: draft.key,
    value: draft.value,
    source: 'admin',
    sourceMessageId: null,
  })
}

/**
 * Remove one slot row. On one of phase 5's closed vocabulary keys this removes the VALUE and not
 * the key — `/admin/memory` renders every key whether or not a row exists, so the key is back as a
 * blank row on the very next render. That is `MemoryRow.reappears`, and the table says so.
 */
export async function adminDeleteSlot(userId: string, key: string): Promise<boolean> {
  return deleteNinaMemorySlot(userId, key)
}

/**
 * One ledger row. `appendNinaMemoryFacts` takes an array and returns the inserted rows; the array
 * of one is deliberate — there is exactly one writer of this table and it should stay the
 * multi-row INSERT phase 1 wrote, not gain a singular twin.
 *
 * Returns the row so a caller can confirm the insert landed, and `null` if the insert returned
 * nothing at all.
 */
export async function adminAppendFact(
  userId: string,
  draft: AdminFactDraft,
): Promise<NinaFactRow | null> {
  const rows = await appendNinaMemoryFacts(userId, [
    {
      category: draft.category,
      text: draft.text,
      confidence: draft.confidence,
      source: 'admin',
      sourceMessageId: null,
    },
  ])
  return rows[0] ?? null
}

/**
 * In-place edit, offered on **every** ledger row, and the row becomes the admin's in the process.
 * See the header: a sentence the admin wrote is no longer a quotation of a message, so the label
 * and the pointer are corrected in the same statement as the text. Idempotent on a row that was
 * already admin.
 */
export async function adminUpdateFact(
  userId: string,
  id: string,
  patch: { category: NinaFactCategory; text: string; confidence: number },
): Promise<boolean> {
  const updated = await db
    .update(ninaMemoryFacts)
    .set({
      category: patch.category,
      text: patch.text,
      confidence: patch.confidence,
      source: 'admin',
      sourceMessageId: null,
    })
    .where(and(eq(ninaMemoryFacts.userId, userId), eq(ninaMemoryFacts.id, id)))
    .returning({ id: ninaMemoryFacts.id })
  return updated.length > 0
}

/** Delete one ledger row. One click on the table's `✕`, and nothing survives it. */
export async function adminDeleteFact(userId: string, id: string): Promise<boolean> {
  return deleteNinaMemoryFact(userId, id)
}

/* ── reads ──────────────────────────────────────────────────────────────────────────────────── */

/** Every slot, `value` rendered to the display string phase 2's prompt also gets. */
export async function adminReadSlots(userId: string): Promise<NinaSlotRow[]> {
  return getNinaMemorySlots(userId)
}

/** One slot, **parsed** — the shape `pending_promises` needs. The cast is the caller's. */
export async function adminReadSlot(userId: string, key: string) {
  return getNinaMemorySlot(userId, key)
}

/** The newest `limit` ledger rows, newest first — the same read phase 2's context makes. */
export async function adminReadFacts(userId: string, limit: number): Promise<NinaFactRow[]> {
  return listNinaMemoryFacts(userId, { limit })
}
