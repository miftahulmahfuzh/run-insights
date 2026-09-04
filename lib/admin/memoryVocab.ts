import {
  ADMIN_SLOT_VALUE_MAX,
  type SlotCard,
  type SlotEditKind,
  type SlotProtection,
} from '@/lib/admin/memoryModel'
import type { NinaFactCategory, NinaMemorySource } from '@/lib/db/schema'
import { NINA_SLOT_KEYS, NINA_SLOT_SPECS, isNinaSlotKey, type NinaSlotKey } from '@/lib/nina/memory'

/**
 * The bridge between phase 5's closed vocabulary and `/admin/memory`'s cards.
 *
 * **This is the only file in the phase that imports `lib/nina/memory.ts`**, and it does so as a
 * READER: it never coins a key, never redefines a policy, and never writes a second canonicaliser.
 * Phase 5's ruling (b) puts canonicalisation on the writer, and this page is a writer — so
 * `NINA_SLOT_SPECS[key].canonicalise` runs on every save, exactly as the distiller's does.
 *
 * No `import 'server-only'`: nothing here touches I/O and the test imports it directly. It is kept
 * out of components by convention and by the fact that the page hands down finished cards.
 */

/** A human column heading per key. Phase 5's `prompt` is the hint; this is the title. */
const SLOT_LABELS: Readonly<Record<NinaSlotKey, string>> = {
  name: 'Full name',
  nickname: 'Nickname',
  running_days: 'Usual running days',
  work_hours: 'Work hours',
  goals: 'Current goal',
  injuries: 'Injuries',
  food_likes: 'Food',
  gear: 'Gear',
  pending_promises: 'Pending promises',
}

/**
 * Why a save was refused, per key, in the words the admin needs to fix it. The two parsed keys get
 * a specific sentence because a generic "invalid" would leave him guessing at a format that phase
 * 10's cron depends on.
 */
const SLOT_REFUSALS: Readonly<Record<NinaSlotKey, string>> = {
  name: 'A name cannot be empty.',
  nickname:
    'That is not a usable nickname — one short word, letters only. Nina stores it as a bare string.',
  running_days:
    'No weekday could be read out of that. Write day names: "Selasa, Kamis, Sabtu". This has to ' +
    'parse back, because the evening cron reads this slot to ask whether he skipped his usual day.',
  work_hours: 'Write two clock times, like "08:00-17:00".',
  goals: 'A goal cannot be empty.',
  injuries: 'Cannot be empty. To clear it, retire the slot instead — that keeps a record.',
  food_likes: 'Cannot be empty. To clear it, retire the slot instead.',
  gear: 'Cannot be empty. To clear it, retire the slot instead.',
  pending_promises:
    'Promises are structured rows, not text — phase 5 refuses a string here on purpose. Remove a ' +
    'single promise with the button on its entry, or let Nina record a new one from a real turn.',
}

const ORPHAN_HINT =
  'Not one of the nine keys Nina understands. Nothing in the app reads it deliberately — but ' +
  'every slot row goes into her prompt on every turn, so it IS being read, by her. Retire it.'

/**
 * A `merge`-policy slot is structured by definition — its value is a record list, which is exactly
 * why it merges rather than replaces. So the edit kind falls out of phase 5's policy field and no
 * key literal is needed here (which also keeps `NINA_SLOT_PENDING_PROMISES` out of this module).
 */
export function slotEditKind(key: string): SlotEditKind {
  if (!isNinaSlotKey(key)) return 'orphaned'
  return NINA_SLOT_SPECS[key].policy === 'merge' ? 'structured' : 'text'
}

/**
 * What phase 5's ruling (c) will do for this row on the next distillation pass. Rendered on the
 * card, so the admin can see that his correction is protected rather than having to trust it.
 */
export function slotProtection(key: string, origin: NinaMemorySource | null): SlotProtection {
  if (origin !== 'admin' || !isNinaSlotKey(key)) return 'none'
  return NINA_SLOT_SPECS[key].policy === 'merge' ? 'sticky' : 'deferred'
}

export function describeSlot(key: string): { label: string; hint: string } {
  if (!isNinaSlotKey(key)) return { label: key, hint: ORPHAN_HINT }
  return { label: SLOT_LABELS[key], hint: NINA_SLOT_SPECS[key].prompt }
}

/** The `nina_memory_facts.category` a statement about this slot becomes. Phase 5's own mapping. */
export function slotFactCategory(key: string): NinaFactCategory {
  return isNinaSlotKey(key) ? NINA_SLOT_SPECS[key].category : 'other'
}

export type SlotCanonicalisation = { ok: true; value: string } | { ok: false; reason: string }

/**
 * **Phase 5's ruling (b), on the admin's keystrokes.** `formatRunningDays(parseRunningDays(raw))`
 * is composed inside `NINA_SLOT_SPECS.running_days.canonicalise`, so calling that function is
 * literally the same round trip the distiller does — one implementation, two writers.
 *
 * A refusal is a refusal, not a silent conversion: the distiller degrades a refused slot into a
 * ledger append because no human is present, but here one is, and a page that stores something
 * other than what he typed without saying so is lying. `recordSlotAsFactAction` is the same
 * fallback, taken by an explicit second button.
 */
export function canonicaliseSlotValue(key: string, raw: string): SlotCanonicalisation {
  if (!isNinaSlotKey(key)) {
    return {
      ok: false,
      reason:
        `"${key}" is not one of the nine keys Nina understands, so writing to it would put a ` +
        'value in her prompt that no rule governs. Retire the row instead.',
    }
  }

  const trimmed = raw.slice(0, ADMIN_SLOT_VALUE_MAX)
  const canonical = NINA_SLOT_SPECS[key].canonicalise(trimmed)
  if (canonical === null || canonical.length === 0) {
    return { ok: false, reason: SLOT_REFUSALS[key] }
  }
  return { ok: true, value: canonical }
}

/**
 * Every card the page renders: one per stored row, plus an EMPTY card for each of phase 5's nine
 * keys that has no row yet, plus the orphans last.
 *
 * The empty cards are half of R24's backdoor — *"i can add some important data of myself through a
 * backdoor in admin page"*. Typing into `goals` when there is no `goals` row is how a slot gets
 * inserted by hand, and it needs no separate form. There is deliberately no way to create a TENTH
 * key from this page: the vocabulary is closed (phase 5), and a free-text key field would
 * manufacture exactly the orphans §4 exists to clean up.
 *
 * Order: `NINA_SLOT_KEYS` order — phase 5 wrote that tuple in "the order `/admin/memory` will
 * naturally show them in" — then orphans, alphabetically, in their own section.
 */
export function buildSlotCards(
  rows: readonly {
    key: string
    value: string
    source: NinaMemorySource
    sourceMessageId: string | null
    updatedAt: Date
  }[],
): SlotCard[] {
  const byKey = new Map(rows.map((row) => [row.key, row]))

  const known: SlotCard[] = NINA_SLOT_KEYS.map((key) => {
    const row = byKey.get(key)
    const { label, hint } = describeSlot(key)
    const origin = row?.source ?? null
    return {
      key,
      value: row?.value ?? '',
      present: row != null,
      origin,
      sourceMessageId: row?.sourceMessageId ?? null,
      updatedAt: row?.updatedAt.toISOString() ?? null,
      inVocabulary: true,
      editKind: slotEditKind(key),
      protection: slotProtection(key, origin),
      label,
      hint,
    }
  })

  const orphans: SlotCard[] = rows
    .filter((row) => !isNinaSlotKey(row.key))
    .sort((a, b) => a.key.localeCompare(b.key))
    .map((row) => ({
      key: row.key,
      value: row.value,
      present: true,
      origin: row.source,
      sourceMessageId: row.sourceMessageId,
      updatedAt: row.updatedAt.toISOString(),
      inVocabulary: false,
      editKind: 'orphaned' as const,
      protection: 'none' as const,
      label: row.key,
      hint: ORPHAN_HINT,
    }))

  return [...known, ...orphans]
}
