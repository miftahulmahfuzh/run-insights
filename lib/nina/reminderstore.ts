import 'server-only'

import type { DateISO } from '@/lib/date/ranges'
import {
  NINA_SLOT_REMINDERS,
  type NinaMemorySource,
  type NinaRemindersSlot,
} from '@/lib/db/schema'
import { newId } from '@/lib/id'

import { getNinaMemorySlot, upsertNinaMemorySlot } from './queries'
import {
  applyReminderWrites,
  markReminderFired,
  parseRemindersSlot,
  type ReminderWriteResult,
} from './reminders'
import type { NinaReminderWrite } from './schema'

/**
 * The `reminders` slot's persistence — the nina-natural-reminders set, R1, and the IMPURE half.
 * `./reminders.ts` decides; this file fetches and writes, and it is the only file in the feature
 * that knows a database exists.
 *
 * ── NOTHING HERE THROWS ───────────────────────────────────────────────────────────────────────
 * Both writers are best-effort side paths of something that already succeeded: the applier runs
 * after her reply is committed and pushed (`lib/nina/turnrun.ts`), and the fire marker runs after
 * her proactive message rows exist (`lib/nina/proactive.ts`). A failure in either must cost a log
 * line and nothing else — `turnrun.ts`'s push block and `proactive.ts`'s marker block make exactly
 * this trade, in exactly these words, and this file joins them rather than inventing a third rule.
 *
 * ── THE ROW'S OWN `source` TRAVELS THROUGH ────────────────────────────────────────────────────
 * Phase 5's rule, restated by `lib/nina/promises.ts`: read it, write it back. If a human asserted
 * this row in `/admin/memory` it must not come back relabelled as distilled.
 *
 * `sourceMessageId` is deliberately NOT written on the slot row (it defaults to NULL in
 * `upsertNinaMemorySlot`): a NULL there is what makes the row structurally unreachable by
 * `removeNinaSession`'s `source_message_id IN (…)` purge, and a standing daily instruction should
 * outlive the conversation it was given in. The ENTRY still carries its own `sourceMessageId` for
 * provenance.
 */

/** Read and parse the slot. A missing row is an empty slot, not an error. */
export async function readNinaReminders(
  userId: string,
): Promise<{ slot: NinaRemindersSlot; source: NinaMemorySource }> {
  const row = await getNinaMemorySlot(userId, NINA_SLOT_REMINDERS)
  if (row == null) return { slot: { reminders: [] }, source: 'distilled' }
  return { slot: parseRemindersSlot(row.value), source: row.source }
}

/**
 * Apply one turn's `send.reminders` and persist the result. Returns `null` when there was nothing to
 * do or when something failed — the caller logs and moves on.
 *
 * **Its own call, never routed through `runNinaDistillation`/`planMemoryWrites`.** That pipeline's
 * contract is the `slot`/`fact` string vocabulary (`lib/nina/memory.ts:1114`), and a reminder is a
 * structured object; `NINA_SLOT_SPECS.pending_promises.canonicalise` returning `null` is the same
 * boundary drawn once already, for the same reason.
 */
export async function applyNinaReminderWrites(
  userId: string,
  writes: readonly NinaReminderWrite[],
  input: { todayISO: DateISO; sourceMessageId: string | null },
): Promise<ReminderWriteResult | null> {
  if (writes.length === 0) return null

  try {
    const { slot, source } = await readNinaReminders(userId)
    const result = applyReminderWrites({
      slot,
      writes,
      todayISO: input.todayISO,
      sourceMessageId: input.sourceMessageId,
      newId: () => newId(),
    })

    if (result.refused.length > 0) {
      console.warn('[nina reminders] refused', { userId, refused: result.refused })
    }
    if (!result.changed) return result

    await upsertNinaMemorySlot(userId, {
      key: NINA_SLOT_REMINDERS,
      value: result.slot,
      source,
    })
    console.log('[nina reminders] wrote', {
      userId,
      created: result.created,
      cancelled: result.cancelled,
    })
    return result
  } catch (cause) {
    console.warn('[nina reminders] could not apply', { userId, error: String(cause) })
    return null
  }
}

/**
 * Stamp `lastFiredOn` on one reminder. **Called only after the proactive message rows are
 * committed.** Re-reads the slot rather than taking it from `ProactiveFacts`, for two reasons: the
 * facts object is pure and carries no row `source` to write back, and the model call between the
 * load and this write is 13-16 s — long enough that re-reading is the honest thing to do.
 */
export async function markNinaReminderFired(
  userId: string,
  reminderId: string,
  todayISO: DateISO,
): Promise<void> {
  const { slot, source } = await readNinaReminders(userId)
  const marked = markReminderFired(slot, reminderId, todayISO)
  if (!marked.changed) return
  await upsertNinaMemorySlot(userId, {
    key: NINA_SLOT_REMINDERS,
    value: marked.slot,
    source,
  })
}
