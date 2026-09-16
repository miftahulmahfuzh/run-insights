import { describe, expect, it } from 'vitest'

import type { DateISO } from '@/lib/date/ranges'
import type { NinaReminder, NinaRemindersSlot } from '@/lib/db/schema'
import {
  activeReminders,
  applyReminderWrites,
  dueReminder,
  markReminderFired,
  parseRemindersSlot,
  MAX_ACTIVE_REMINDERS,
  MAX_CANCELLED_KEPT,
} from '@/lib/nina/reminders'
import type { NinaReminderWrite } from '@/lib/nina/schema'

/**
 * The nina-natural-reminders set, R1 — the decision layer, with no database and no model.
 *
 * The one property the whole feature exists to guarantee is here as a PAIR, the way
 * `tests/nina.proactive.test.ts` states the missed-day one: `dueReminder` returns the reminder on
 * an unstamped day and returns null on otherwise identical facts once `lastFiredOn` is today. That
 * is "once a day, however many times the cron runs".
 */

const TODAY: DateISO = '2026-09-16'
const YESTERDAY: DateISO = '2026-09-15'

function reminder(overrides: Partial<NinaReminder> = {}): NinaReminder {
  return {
    id: 'rem_sleep_01',
    timeOfDay: '20:45',
    label: 'tidur',
    message: 'biar konsisten — regenerasi sel, otot, imun, liver',
    createdOn: YESTERDAY,
    status: 'active',
    lastFiredOn: null,
    cancelledOn: null,
    sourceMessageId: 'msg_1',
    ...overrides,
  }
}

function slotOf(...reminders: NinaReminder[]): NinaRemindersSlot {
  return { reminders }
}

/** A deterministic id generator, so every created id is something a case can assert. */
function ids(...values: string[]): () => string {
  let i = 0
  return () => values[i++] ?? `overflow_${String(i)}`
}

function apply(
  slot: NinaRemindersSlot,
  writes: NinaReminderWrite[],
  newId: () => string = ids('rem_new_01', 'rem_new_02', 'rem_new_03', 'rem_new_04', 'rem_new_05'),
) {
  return applyReminderWrites({
    slot,
    writes,
    todayISO: TODAY,
    sourceMessageId: 'msg_2',
    newId,
  })
}

describe('parseRemindersSlot — a bad row is an empty slot, never an exception', () => {
  it('reads the shape it wrote', () => {
    const slot = slotOf(reminder())
    expect(parseRemindersSlot(slot).reminders).toHaveLength(1)
  })

  it('yields an empty slot for anything else', () => {
    expect(parseRemindersSlot(null)).toEqual({ reminders: [] })
    expect(parseRemindersSlot(undefined)).toEqual({ reminders: [] })
    expect(parseRemindersSlot('tiap jam 8 malam')).toEqual({ reminders: [] })
    expect(parseRemindersSlot({ reminders: 'nope' })).toEqual({ reminders: [] })
    expect(parseRemindersSlot({})).toEqual({ reminders: [] })
  })

  it('drops non-object entries and keeps the rest — a hand-edited row must not kill the cron', () => {
    const parsed = parseRemindersSlot({ reminders: [reminder(), null, 'junk', 7] })
    expect(parsed.reminders).toHaveLength(1)
  })
})

describe('activeReminders', () => {
  it('drops the cancelled ones and sorts by clock time', () => {
    const slot = slotOf(
      reminder({ id: 'b', timeOfDay: '21:00' }),
      reminder({ id: 'a', timeOfDay: '06:30' }),
      reminder({ id: 'c', timeOfDay: '07:00', status: 'cancelled', cancelledOn: YESTERDAY }),
    )
    expect(activeReminders(slot).map((r) => r.id)).toEqual(['a', 'b'])
  })
})

describe('applyReminderWrites — create', () => {
  it('turns the request in the brief into a record with his own reason on it', () => {
    const result = apply(slotOf(), [
      {
        action: 'create',
        timeOfDay: '20:45',
        label: 'tidur',
        message: 'konsistensi tidur — regenerasi sel dan liver',
      },
    ])
    expect(result.changed).toBe(true)
    expect(result.created).toEqual(['rem_new_01'])
    const [made] = result.slot.reminders
    expect(made).toMatchObject({
      id: 'rem_new_01',
      timeOfDay: '20:45',
      label: 'tidur',
      status: 'active',
      lastFiredOn: null,
      createdOn: TODAY,
      sourceMessageId: 'msg_2',
    })
    expect(made?.message).toContain('liver')
  })

  it('refuses a create missing any of the three fields, and writes nothing', () => {
    // SHAPE is the Zod schema's job; these are the BUSINESS rules, and a refusal is a log line and
    // not a repair round — his reply has already landed.
    for (const write of [
      { action: 'create' } as NinaReminderWrite,
      { action: 'create', timeOfDay: '20:45' } as NinaReminderWrite,
      { action: 'create', timeOfDay: '20:45', label: 'tidur' } as NinaReminderWrite,
      { action: 'create', label: 'tidur', message: 'why' } as NinaReminderWrite,
    ]) {
      const result = apply(slotOf(), [write])
      expect(result.changed).toBe(false)
      expect(result.slot.reminders).toHaveLength(0)
      expect(result.refused).toHaveLength(1)
    }
  })

  it('refuses a duplicate of something already set up', () => {
    const result = apply(slotOf(reminder()), [
      { action: 'create', timeOfDay: '20:45', label: 'tidur', message: 'lagi' },
    ])
    expect(result.changed).toBe(false)
    expect(result.refused[0]?.reason).toContain('already exists')
  })

  it('caps the ACTIVE list, so a misread turn cannot fill her prompt', () => {
    const existing = Array.from({ length: MAX_ACTIVE_REMINDERS }, (_unused, i) =>
      reminder({ id: `rem_${String(i)}`, timeOfDay: `0${String(i)}:00`, label: `x${String(i)}` }),
    )
    const result = apply(slotOf(...existing), [
      { action: 'create', timeOfDay: '23:00', label: 'extra', message: 'why' },
    ])
    expect(result.changed).toBe(false)
    expect(result.refused[0]?.reason).toContain('already at')
  })
})

describe('applyReminderWrites — cancel', () => {
  it('cancels by id and keeps the record rather than deleting it', () => {
    const result = apply(slotOf(reminder()), [{ action: 'cancel', id: 'rem_sleep_01' }])
    expect(result.changed).toBe(true)
    expect(result.cancelled).toEqual(['rem_sleep_01'])
    expect(result.slot.reminders[0]).toMatchObject({
      status: 'cancelled',
      cancelledOn: TODAY,
    })
  })

  it('refuses an id that names nothing active, rather than silently doing nothing', () => {
    const cancelled = reminder({ status: 'cancelled', cancelledOn: YESTERDAY })
    for (const write of [
      { action: 'cancel' } as NinaReminderWrite,
      { action: 'cancel', id: 'not_a_real_id' } as NinaReminderWrite,
    ]) {
      const result = apply(slotOf(cancelled), [write])
      expect(result.changed).toBe(false)
      expect(result.refused).toHaveLength(1)
    }
  })

  it('"ganti jadi jam 9" is a cancel and a create in ONE array, applied in order', () => {
    // This is how the plan covers editing without a third verb, and array order is what makes it
    // work: the create would otherwise be refused as a duplicate of the entry being cancelled.
    const result = apply(slotOf(reminder()), [
      { action: 'cancel', id: 'rem_sleep_01' },
      { action: 'create', timeOfDay: '21:00', label: 'tidur', message: 'geser sejam' },
    ])
    expect(result.cancelled).toEqual(['rem_sleep_01'])
    expect(result.created).toEqual(['rem_new_01'])
    const live = result.slot.reminders.filter((r) => r.status === 'active')
    expect(live).toHaveLength(1)
    expect(live[0]?.timeOfDay).toBe('21:00')
  })

  it('keeps only the newest cancelled entries, so the slot cannot grow without bound', () => {
    const old = Array.from({ length: MAX_CANCELLED_KEPT + 2 }, (_unused, i) =>
      reminder({
        id: `rem_old_${String(i)}`,
        status: 'cancelled',
        cancelledOn: `2026-09-0${String(i + 1)}`,
        label: `x${String(i)}`,
      }),
    )
    const result = apply(slotOf(...old), [
      { action: 'create', timeOfDay: '06:00', label: 'lari pagi', message: 'why' },
    ])
    const kept = result.slot.reminders.filter((r) => r.status === 'cancelled')
    expect(kept).toHaveLength(MAX_CANCELLED_KEPT)
    // The ones that survive are the most recently cancelled.
    expect(kept.map((r) => r.cancelledOn)).toEqual(['2026-09-03', '2026-09-04', '2026-09-05'])
  })
})

describe('dueReminder — THE EXIT CRITERION, as a pair', () => {
  it('fires at its time and not again the same day', () => {
    const live = [reminder()]
    expect(dueReminder({ reminders: live, todayISO: TODAY, nowHHmm: '20:45' })?.id).toBe(
      'rem_sleep_01',
    )
    // Same facts, plus the stamp the first emission wrote. A second cron invocation — or a tenth —
    // must say nothing, and a serverless invocation cannot remember the first one.
    const fired = [reminder({ lastFiredOn: TODAY })]
    expect(dueReminder({ reminders: fired, todayISO: TODAY, nowHHmm: '22:00' })).toBeNull()
  })

  it('fires again the NEXT day — the stamp is a date, not a latch', () => {
    const fired = [reminder({ lastFiredOn: YESTERDAY })]
    expect(dueReminder({ reminders: fired, todayISO: TODAY, nowHHmm: '20:45' })?.id).toBe(
      'rem_sleep_01',
    )
  })

  it('does not fire before its time, and the comparison is characters and not arithmetic', () => {
    const live = [reminder()]
    expect(dueReminder({ reminders: live, todayISO: TODAY, nowHHmm: '20:44' })).toBeNull()
    expect(dueReminder({ reminders: live, todayISO: TODAY, nowHHmm: '09:05' })).toBeNull()
    expect(dueReminder({ reminders: live, todayISO: TODAY, nowHHmm: '20:45' })).not.toBeNull()
    expect(dueReminder({ reminders: live, todayISO: TODAY, nowHHmm: '23:59' })).not.toBeNull()
  })

  it('ignores cancelled entries and unreadable times', () => {
    const junk = [
      reminder({ id: 'a', status: 'cancelled', cancelledOn: YESTERDAY }),
      reminder({ id: 'b', timeOfDay: '8:45 pm' }),
      reminder({ id: 'c', timeOfDay: '25:00' }),
    ]
    expect(dueReminder({ reminders: junk, todayISO: TODAY, nowHHmm: '23:00' })).toBeNull()
  })

  it('picks the EARLIEST due one — the engine emits at most one message per tick', () => {
    const two = [
      reminder({ id: 'late', timeOfDay: '20:45', label: 'tidur' }),
      reminder({ id: 'early', timeOfDay: '06:00', label: 'lari' }),
    ]
    expect(dueReminder({ reminders: two, todayISO: TODAY, nowHHmm: '21:00' })?.id).toBe('early')
  })
})

describe('markReminderFired', () => {
  it('stamps today and reports the change', () => {
    const marked = markReminderFired(slotOf(reminder()), 'rem_sleep_01', TODAY)
    expect(marked.changed).toBe(true)
    expect(marked.slot.reminders[0]?.lastFiredOn).toBe(TODAY)
  })

  it('reports no change for an unknown id or a day already stamped, so nothing is written', () => {
    expect(markReminderFired(slotOf(reminder()), 'nope', TODAY).changed).toBe(false)
    expect(
      markReminderFired(slotOf(reminder({ lastFiredOn: TODAY })), 'rem_sleep_01', TODAY).changed,
    ).toBe(false)
  })

  it('leaves every other reminder alone', () => {
    const slot = slotOf(reminder({ id: 'a' }), reminder({ id: 'b', timeOfDay: '06:00' }))
    const marked = markReminderFired(slot, 'a', TODAY)
    expect(marked.slot.reminders.find((r) => r.id === 'b')?.lastFiredOn).toBeNull()
  })
})
