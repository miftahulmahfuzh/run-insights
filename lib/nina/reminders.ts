import type { DateISO } from '@/lib/date/ranges'
import type { NinaReminder, NinaRemindersSlot } from '@/lib/db/schema'
import type { NinaReminderWrite } from './schema'

/**
 * Standing daily reminders — the nina-natural-reminders set, R1, and the PURE half.
 *
 * ── WHY A PURE MODULE ─────────────────────────────────────────────────────────────────────────
 * The plan's invariant, and `lib/nina/promise.ts`'s argument verbatim: every question this feature
 * has to answer is a question about strings and dates — is this `HH:mm` at or past that one, has
 * this reminder already fired on this Jakarta day, does this id name an active record, is this a
 * duplicate of one he already set up. `vitest` runs `environment: 'node'`, so all of it lives here
 * and `lib/nina/reminderstore.ts` does nothing but fetch and write.
 *
 * **No `server-only`, no `@/lib/db` VALUE import, no `new Date()`.** The two `import type` lines
 * above are erased at compile time. `todayISO`, `nowHHmm` and `newId` are all parameters, which is
 * what makes every case below deterministic without a single mock.
 *
 * ── EVERY TIME IS A ZERO-PADDED JAKARTA `'HH:mm'` STRING ──────────────────────────────────────
 * And that is a decision, not a default: zero-padded 24-hour clock strings sort and compare
 * lexicographically in exactly the order the clock runs, so `'20:45' <= '21:07'` is the whole of
 * "is it time yet" with no parser, no arithmetic and no `Date` on either side of the comparison. The
 * regex below is what guarantees the padding, and it is the same characters
 * `lib/nina/schema.ts` validates the model's write with.
 *
 * ── WHAT THIS FILE NEVER DOES ─────────────────────────────────────────────────────────────────
 * It never reads the clock, never touches the database, never posts a message and never decides
 * WHICH proactive trigger wins — `lib/nina/proactive.ts`'s `decideProactive` owns that, and calls
 * `dueReminder` through `evaluateReminderDue`.
 */

/** `NINA_REMINDER_TIME_PATTERN`, compiled. Spelled there because the tool schema needs the string. */
export const REMINDER_TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/

/**
 * How many reminders may be ACTIVE at once, durably. Four standing daily check-ins is already more
 * than anyone asked for, and the cap's real job is to stop a model that misread one request as five
 * from filling a `jsonb` column — and, worse, from filling her per-turn context, since the whole
 * slot is rendered into `memory.slots` on every turn.
 *
 * Distinct from `MAX_REMINDER_WRITES` in `lib/nina/schema.ts`, which bounds ONE TURN's writes.
 */
export const MAX_ACTIVE_REMINDERS = 4

/**
 * How many cancelled reminders are kept. Not zero — "lo udah gw suruh berhenti kan" deserves an
 * answer — and not unbounded, because every kept entry is characters in her prompt on every turn.
 * The newest three by `cancelledOn` survive; older ones are dropped on the next write.
 */
export const MAX_CANCELLED_KEPT = 3

/** Why one entry of a `reminders` write was not applied. Logged, never shown to him. */
export interface NinaReminderRefusal {
  action: 'create' | 'cancel'
  reason: string
}

export interface ReminderWriteInput {
  /** The slot as it stands. Never mutated — the result carries a fresh list. */
  slot: NinaRemindersSlot
  /** `NinaSendPayloadSchema`'s output: already shape-valid, not yet business-valid. */
  writes: readonly NinaReminderWrite[]
  /** Jakarta calendar day, from `todayInJakarta()`. */
  todayISO: DateISO
  /** `nina_messages.id` he asked in, or null. Provenance only; nothing reads it back yet. */
  sourceMessageId: string | null
  /**
   * **Injected rather than imported**, so this function is deterministic. `lib/id.ts`'s `newId` has
   * no dependency and would import cleanly, but an id generator inside a pure function is a value
   * a test cannot predict — and the ids are what the model has to name to cancel one later, which
   * is exactly what the tests need to assert.
   */
  newId: () => string
}

export interface ReminderWriteResult {
  slot: NinaRemindersSlot
  /** False on the common no-op turn. The caller writes nothing when this is false. */
  changed: boolean
  created: string[]
  cancelled: string[]
  refused: NinaReminderRefusal[]
}

/**
 * A slot value that is not the shape we expect is an EMPTY slot, never an exception.
 * `lib/nina/promises.ts:182-189`'s `parseSlot`, applied to this key — and the discipline matters
 * more here than it looks: this value is read on every cron tick for every active user, and a
 * hand-edited row in `/admin/memory` must degrade to "no reminders" rather than to a 500 in a job
 * nobody is watching.
 */
export function parseRemindersSlot(value: unknown): NinaRemindersSlot {
  if (value == null || typeof value !== 'object') return { reminders: [] }
  const reminders = (value as { reminders?: unknown }).reminders
  if (!Array.isArray(reminders)) return { reminders: [] }
  return {
    reminders: reminders.filter((r): r is NinaReminder => r != null && typeof r === 'object'),
  }
}

/**
 * The live ones, in the order the clock reaches them. Sorted here rather than at the two call sites
 * so "the earliest due one wins" and "the list she is shown" agree by construction.
 */
export function activeReminders(slot: NinaRemindersSlot): NinaReminder[] {
  return slot.reminders
    .filter((reminder) => reminder.status === 'active')
    .sort((a, b) => a.timeOfDay.localeCompare(b.timeOfDay) || a.id.localeCompare(b.id))
}

/**
 * Keep every active reminder and only the newest `MAX_CANCELLED_KEPT` cancelled ones. Cancelled
 * entries are sorted by the day they were cancelled rather than by array position, because
 * cancelling an entry leaves it exactly where it was in the list.
 */
function pruneReminders(entries: readonly NinaReminder[]): NinaReminder[] {
  const active = entries.filter((entry) => entry.status === 'active')
  const cancelled = entries
    .filter((entry) => entry.status !== 'active')
    .sort((a, b) => (a.cancelledOn ?? a.createdOn).localeCompare(b.cancelledOn ?? b.createdOn))
    .slice(-MAX_CANCELLED_KEPT)
  return [...active, ...cancelled]
}

/**
 * **The business half of the validation.** `NinaReminderWriteSchema` has already checked the SHAPE:
 * `action` is one of the two verbs, `timeOfDay` is an `HH:mm`, the strings are inside their caps.
 * What it cannot check is whether a `create` carries the three fields a reminder needs, or whether a
 * `cancel`'s id names a real active reminder THIS USER owns — the same division `replyToMessageId`
 * makes between `lib/nina/schema.ts` and the action that resolves it.
 *
 * **Entries are applied in array order, and that is load-bearing.** "ganti reminder gw jadi jam 9"
 * is one `cancel` followed by one `create` in the same array, which is how the plan's Out of scope
 * covers editing without a third verb. Applying them out of order would either refuse the create
 * against a cap that the cancel was about to free, or cancel the entry that had just been made.
 *
 * A refusal is never a loss to him: his reply already landed, and the worst case is that she said
 * she would remind him and did not persist it — which the next turn can fix, because she can see
 * the slot.
 */
export function applyReminderWrites(input: ReminderWriteInput): ReminderWriteResult {
  const entries: NinaReminder[] = input.slot.reminders.map((entry) => ({ ...entry }))
  const created: string[] = []
  const cancelled: string[] = []
  const refused: NinaReminderRefusal[] = []

  for (const write of input.writes) {
    if (write.action === 'cancel') {
      const id = write.id?.trim() ?? ''
      if (id.length === 0) {
        refused.push({ action: 'cancel', reason: 'cancel needs an id' })
        continue
      }
      const target = entries.find((entry) => entry.id === id && entry.status === 'active')
      if (target == null) {
        refused.push({ action: 'cancel', reason: `no active reminder with id ${id}` })
        continue
      }
      target.status = 'cancelled'
      target.cancelledOn = input.todayISO
      cancelled.push(target.id)
      continue
    }

    const timeOfDay = write.timeOfDay?.trim() ?? ''
    const label = write.label?.trim() ?? ''
    const message = write.message?.trim() ?? ''

    if (!REMINDER_TIME_RE.test(timeOfDay) || label.length === 0 || message.length === 0) {
      refused.push({ action: 'create', reason: 'create needs timeOfDay, label and message' })
      continue
    }

    const active = entries.filter((entry) => entry.status === 'active')
    if (active.length >= MAX_ACTIVE_REMINDERS) {
      refused.push({
        action: 'create',
        reason: `already at ${String(MAX_ACTIVE_REMINDERS)} active reminders`,
      })
      continue
    }
    if (active.some((entry) => entry.timeOfDay === timeOfDay && entry.label === label)) {
      refused.push({ action: 'create', reason: `${label} at ${timeOfDay} already exists` })
      continue
    }

    const entry: NinaReminder = {
      id: input.newId(),
      timeOfDay,
      label,
      message,
      createdOn: input.todayISO,
      status: 'active',
      lastFiredOn: null,
      cancelledOn: null,
      sourceMessageId: input.sourceMessageId,
    }
    entries.push(entry)
    created.push(entry.id)
  }

  const changed = created.length > 0 || cancelled.length > 0
  return {
    slot: { reminders: changed ? pruneReminders(entries) : input.slot.reminders },
    changed,
    created,
    cancelled,
    refused,
  }
}

/**
 * **Is one due, and which one.** The whole of the sixth trigger's decision, and every guard has a
 * failure it prevents:
 *
 *   not active            -> she would check in about something he called off
 *   malformed `timeOfDay` -> a hand-edited or pre-cap row would fire at an hour nobody chose
 *   not reached yet       -> the cron can run at any hour; 20:45 is not due at 13:10
 *   already fired today   -> the one failure this whole feature exists to get right
 *
 * **The earliest `timeOfDay` wins**, which is the plan's Out of scope made mechanical: the proactive
 * engine emits at most ONE message per user per tick across all six triggers, so a second reminder
 * due on the same tick is picked up the following day rather than doubling the evening.
 *
 * **A time not yet reached is never fired early, and the cost is stated rather than hidden.** On the
 * Hobby plan the single daily cron fires within the hour of 20:00 WIB, so a reminder the runner sets
 * for 07:00 is due every morning and delivered every evening. Firing it early would be worse (a
 * reminder that arrives before the thing it is about is noise); building the check generically costs
 * nothing extra and is honest about what the schedule can reach.
 */
export function dueReminder(input: {
  reminders: readonly NinaReminder[]
  todayISO: DateISO
  /** Jakarta wall clock right now, zero-padded `'HH:mm'` — `jakartaMinuteClockOf(now)`. */
  nowHHmm: string
}): NinaReminder | null {
  const due = input.reminders
    .filter((reminder) => reminder.status === 'active')
    .filter((reminder) => REMINDER_TIME_RE.test(reminder.timeOfDay))
    .filter((reminder) => reminder.timeOfDay <= input.nowHHmm)
    .filter((reminder) => (reminder.lastFiredOn ?? null) !== input.todayISO)
    .sort((a, b) => a.timeOfDay.localeCompare(b.timeOfDay) || a.id.localeCompare(b.id))

  return due[0] ?? null
}

/**
 * Stamp the day a reminder reached him. **Called only after the message rows are committed** — see
 * `emitProactiveMessage`'s ordering, which this marker joins rather than replaces.
 *
 * `changed` is false when the id is unknown or the day is already stamped, so the caller writes
 * nothing on a repeat and an `updated_at` on the slot means something actually happened.
 */
export function markReminderFired(
  slot: NinaRemindersSlot,
  id: string,
  todayISO: DateISO,
): { slot: NinaRemindersSlot; changed: boolean } {
  let changed = false
  const reminders = slot.reminders.map((entry) => {
    if (entry.id !== id || entry.lastFiredOn === todayISO) return entry
    changed = true
    return { ...entry, lastFiredOn: todayISO }
  })
  return { slot: { reminders }, changed }
}

/**
 * In-place edit of one active reminder — the nina-natural-reminders-admin set, R2. Unlike
 * `applyReminderWrites`'s cancel+create (the CHAT path's only edit mechanism — the plan's own Out
 * of scope for what the MODEL may express in one turn), this keeps `id`, `createdOn`, `lastFiredOn`
 * and `sourceMessageId` untouched: `/admin/memory`'s precedent for every other row
 * (`saveSlotAction`, `editFactAction`) is a true in-place patch, and an admin fixing a typo in a
 * label should not reset whether it already fired today.
 *
 * The same shape checks and the same duplicate-time-and-label guard as `applyReminderWrites`'
 * create branch, run against every OTHER active entry — never against itself, or a no-op edit
 * would refuse against its own unchanged row.
 */
export interface ReminderPatchInput {
  slot: NinaRemindersSlot
  id: string
  timeOfDay: string
  label: string
  message: string
}

export interface ReminderPatchResult {
  slot: NinaRemindersSlot
  changed: boolean
  /** Non-null means nothing was written; the caller reports it and moves on. */
  refusal: string | null
}

export function patchReminder(input: ReminderPatchInput): ReminderPatchResult {
  const timeOfDay = input.timeOfDay.trim()
  const label = input.label.trim()
  const message = input.message.trim()

  if (!REMINDER_TIME_RE.test(timeOfDay) || label.length === 0 || message.length === 0) {
    return {
      slot: input.slot,
      changed: false,
      refusal: 'needs a valid time, a label and a message',
    }
  }

  const target = input.slot.reminders.find(
    (entry) => entry.id === input.id && entry.status === 'active',
  )
  if (target == null) {
    return { slot: input.slot, changed: false, refusal: `no active reminder with id ${input.id}` }
  }

  const collides = input.slot.reminders.some(
    (entry) =>
      entry.id !== input.id &&
      entry.status === 'active' &&
      entry.timeOfDay === timeOfDay &&
      entry.label === label,
  )
  if (collides) {
    return { slot: input.slot, changed: false, refusal: `${label} at ${timeOfDay} already exists` }
  }

  if (target.timeOfDay === timeOfDay && target.label === label && target.message === message) {
    return { slot: input.slot, changed: false, refusal: null }
  }

  const reminders = input.slot.reminders.map((entry) =>
    entry.id === input.id ? { ...entry, timeOfDay, label, message } : entry,
  )
  return { slot: { reminders }, changed: true, refusal: null }
}
