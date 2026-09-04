import 'server-only'

import type { NinaFactCategory, NinaSlotValue } from '@/lib/db/schema'
import {
  appendNinaMemoryFacts,
  deleteNinaMemoryFact,
  deleteNinaMemorySlot,
  getNinaMemorySlot,
  getNinaMemorySlots,
  listNinaMemoryFacts,
  updateNinaMemoryFact,
  upsertNinaMemorySlot,
  type NinaFactRow,
  type NinaSlotRow,
} from '@/lib/nina/queries'

/**
 * **The only file in `/admin/memory` that names a phase-1 memory writer.**
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
 * ── AND WHY IT IS NOT IN `lib/nina/` ────────────────────────────────────────────────────────
 * `tests/nina.distill.test.ts` case 14 reads `lib/nina/memory.ts` and `lib/nina/distill.ts` and
 * asserts neither imports the two mutating ledger queries — phase 5's structural guarantee that
 * the distiller cannot rewrite the ledger. This file imports both. Putting it under `lib/nina/`
 * would put the mutating imports one directory away from a test whose entire point is that they
 * are not reachable from there. Under `lib/admin/` the separation is a directory boundary, not a
 * naming convention, and phase 5's test needs no edit.
 *
 * `source_message_id` is ALWAYS null here, and that is a real answer rather than missing data:
 * nothing in the chat said it. Phase 1 made the column nullable for exactly this page.
 */

/** A hand-written or composed ledger row. No source fields — see the header. */
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

export async function adminDeleteSlot(userId: string, key: string): Promise<boolean> {
  return deleteNinaMemorySlot(userId, key)
}

/**
 * One ledger row. `appendNinaMemoryFacts` takes an array and returns the inserted rows; the array
 * of one is deliberate — there is exactly one writer of this table and it should stay the
 * multi-row INSERT phase 1 wrote, not gain a singular twin.
 *
 * Returns the row so a caller can report its id, and `null` if the insert returned nothing — which
 * `retractFactAction` and `retireSlotAction` treat as "do not delete anything".
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
 * In-place edit — offered **only** for a row that the admin already wrote (§2). Phase 1's patch
 * type has no `source` field, which is exactly right: the row is already labelled and there is
 * nothing to relabel. The caller enforces the eligibility rule with `factPermissions`; this
 * function does not re-derive it, because two opinions about who may edit is one too many.
 */
export async function adminUpdateFact(
  userId: string,
  id: string,
  patch: { category: NinaFactCategory; text: string; confidence: number },
): Promise<boolean> {
  return updateNinaMemoryFact(userId, id, patch)
}

/** The one lossy call in the app. Reached only through `purgeFactAction`'s typed confirmation. */
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
