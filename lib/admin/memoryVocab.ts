import {
  ADMIN_SLOT_VALUE_MAX,
  type AdminFactCategory,
  type MemoryRow,
  type SlotEditKind,
  type SlotProtection,
} from '@/lib/admin/memoryModel'
import type { NinaMemorySource } from '@/lib/db/schema'
import { NINA_SLOT_KEYS, NINA_SLOT_SPECS, isNinaSlotKey, type NinaSlotKey } from '@/lib/nina/memory'

/**
 * The bridge between phase 5's closed vocabulary and `/admin/memory`'s single row list.
 *
 * **This is the only file in the phase that imports `lib/nina/memory.ts`**, and it does so as a
 * READER: it never coins a key, never redefines a policy, and never writes a second canonicaliser.
 * Phase 5's ruling (b) puts canonicalisation on the writer, and this page is a writer — so
 * `NINA_SLOT_SPECS[key].canonicalise` runs on every save, exactly as the distiller's does.
 *
 * No `import 'server-only'`: nothing here touches I/O and the test imports it directly. It is kept
 * out of components by convention and by the fact that the page hands down finished rows.
 */

/** A human title per key. Phase 5's `prompt` is the hint; this is the title. */
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
 *
 * None of these sentences offers a second step. "Delete the row" is a one-click control two columns
 * away, and on a vocabulary key it comes straight back blank — which is why clearing a slot is
 * `✕` and not an empty save.
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
  injuries: 'Cannot be empty. To clear it, delete the row — the key comes back as a blank one.',
  food_likes: 'Cannot be empty. To clear it, delete the row — the key comes back as a blank one.',
  gear: 'Cannot be empty. To clear it, delete the row — the key comes back as a blank one.',
  pending_promises:
    'Promises are structured rows, not text — phase 5 refuses a string here on purpose. Each one ' +
    'already has its own row in this table; delete it there.',
}

const ORPHAN_HINT =
  'Not one of the nine keys Nina understands. Nothing in the app reads it deliberately — but ' +
  'every slot row goes into her prompt on every turn, so it IS being read, by her. Delete it.'

const ORPHAN_NOTE = 'orphan — no rule reads this key, but she does'

const PROMISE_NOTE =
  'structured — she checks the metric, the target and the deadline against real runs, so a ' +
  'sentence cannot stand in for it. Delete is the only edit.'

/**
 * A `merge`-policy slot is structured by definition — its value is a record list, which is exactly
 * why it merges rather than replaces. So the edit kind falls out of phase 5's policy field and no
 * key literal is needed here (which also keeps `NINA_SLOT_PENDING_PROMISES` out of this module).
 *
 * `buildMemoryRows` uses this to decide which keys become slot ROWS: a structured key does not,
 * because its ENTRIES are the rows.
 */
export function slotEditKind(key: string): SlotEditKind {
  if (!isNinaSlotKey(key)) return 'orphaned'
  return NINA_SLOT_SPECS[key].policy === 'merge' ? 'structured' : 'text'
}

/**
 * What phase 5's ruling (c) will do for this row on the next distillation pass. Folded into the
 * row's `note`, so the admin can see that his correction is protected rather than having to trust it.
 */
export function slotProtection(key: string, origin: NinaMemorySource | null): SlotProtection {
  if (origin !== 'admin' || !isNinaSlotKey(key)) return 'none'
  return NINA_SLOT_SPECS[key].policy === 'merge' ? 'sticky' : 'deferred'
}

export function describeSlot(key: string): { label: string; hint: string } {
  if (!isNinaSlotKey(key)) return { label: key, hint: ORPHAN_HINT }
  return { label: SLOT_LABELS[key], hint: NINA_SLOT_SPECS[key].prompt }
}

export type SlotCanonicalisation = { ok: true; value: string } | { ok: false; reason: string }

/**
 * **Phase 5's ruling (b), on the admin's keystrokes.** `formatRunningDays(parseRunningDays(raw))`
 * is composed inside `NINA_SLOT_SPECS.running_days.canonicalise`, so calling that function is
 * literally the same round trip the distiller does — one implementation, two writers.
 *
 * A refusal is a refusal, not a silent conversion, and **a refusal is not a confirmation**: R1
 * deleted every second click on this page and left every validation in place, because a page that
 * stores something other than what he typed without saying so is lying. The refusal is reported
 * inline on the row that caused it.
 */
export function canonicaliseSlotValue(key: string, raw: string): SlotCanonicalisation {
  if (!isNinaSlotKey(key)) {
    return {
      ok: false,
      reason:
        `"${key}" is not one of the nine keys Nina understands, so writing to it would put a ` +
        'value in her prompt that no rule governs. Delete the row instead.',
    }
  }

  const trimmed = raw.slice(0, ADMIN_SLOT_VALUE_MAX)
  const canonical = NINA_SLOT_SPECS[key].canonicalise(trimmed)
  if (canonical === null || canonical.length === 0) {
    return { ok: false, reason: SLOT_REFUSALS[key] }
  }
  return { ok: true, value: canonical }
}

/* ── the one row list ───────────────────────────────────────────────────────────────────────── */

/** A `NinaSlotRow`, structurally. Spelled out so this module imports nothing from the query layer. */
export interface MemorySlotInputRow {
  key: string
  value: string
  source: NinaMemorySource
  sourceMessageId: string | null
  updatedAt: Date
}

/** A `NinaFactRow`, structurally. */
export interface MemoryFactInputRow {
  id: string
  category: AdminFactCategory
  text: string
  confidence: number
  source: NinaMemorySource
  sourceMessageId: string | null
  createdAt: Date
}

/** A `NinaPendingPromise`, structurally — the fields a row needs, and no more. */
export interface MemoryPromiseInputRow {
  id: string
  text: string
  condition: string
  metric: string
  target: number | null
  targetKey: string | null
  byDate: string | null
  promisedOn: string
  status: string
}

/** The origin sentence for a slot row. */
function slotNote(key: string, origin: NinaMemorySource | null, present: boolean): string {
  if (!present) return 'not set — type here and it is written as an admin slot'
  if (origin === 'admin') {
    return slotProtection(key, origin) === 'sticky'
      ? 'admin — merges keep the admin label'
      : 'admin — the distiller defers to this'
  }
  return 'distilled — the next distillation may replace this'
}

/**
 * The origin sentence for a ledger row, and **the only place the re-label rule is stated to the
 * operator.** There is no permissions predicate any more: an edit to a distilled row is allowed
 * and `adminUpdateFact` re-labels it, so what the row needs is a description, not a refusal.
 */
function factNote(source: NinaMemorySource, sourceMessageId: string | null): string {
  if (source === 'admin') return 'admin — no distillation can rewrite or remove this row'
  return sourceMessageId === null
    ? 'distilled — no message behind it'
    : 'distilled — editing it makes it yours: it is re-labelled admin and stops quoting that message'
}

/** A promise's terms, on one line, in the order phase 13 evaluates them. */
function describePromise(promise: MemoryPromiseInputRow): string {
  const parts: string[] = [promise.condition, promise.status, promise.metric]
  if (promise.target !== null) parts.push(`target ${promise.target}`)
  if (promise.targetKey !== null) parts.push(promise.targetKey)
  if (promise.byDate !== null) parts.push(`by ${promise.byDate}`)
  return parts.filter((part) => part.length > 0).join(' · ')
}

/**
 * **R1's *"all the memory … as one simple table"*, made literal.** Three shapes across two tables
 * become one ordered list of rows:
 *
 *   1. one row per closed-vocabulary slot key that is NOT structured — eight of the nine — whether
 *      or not a database row exists. An empty row is how a slot is inserted by hand, and it is
 *      also what a deleted slot key looks like a moment later (`reappears`).
 *   2. one row per ORPHANED key, after the eight, alphabetically. Never editable: every save would
 *      be refused by `canonicaliseSlotValue`, and offering a control that always fails is worse
 *      than offering none.
 *   3. one row per PENDING PROMISE. The `pending_promises` KEY is excluded from (1) structurally,
 *      by its `merge` policy rather than by its name, and its entries appear here instead.
 *   4. one row per LEDGER row, newest first — `adminReadFacts` already returns them that way.
 *
 * There is deliberately no way to create a TENTH slot key from this page: the vocabulary is closed,
 * and a free-text key field would manufacture exactly the orphans (2) exists to clean up.
 */
export function buildMemoryRows(input: {
  slots: readonly MemorySlotInputRow[]
  facts: readonly MemoryFactInputRow[]
  promises: readonly MemoryPromiseInputRow[]
}): MemoryRow[] {
  const byKey = new Map(input.slots.map((row) => [row.key, row]))

  const slotRows: MemoryRow[] = NINA_SLOT_KEYS.filter(
    (key) => slotEditKind(key) !== 'structured',
  ).map((key) => {
    const row = byKey.get(key)
    const { label, hint } = describeSlot(key)
    const origin = row?.source ?? null
    return {
      rowId: `slot:${key}`,
      kind: 'slot',
      target: key,
      label,
      code: key,
      hint,
      text: row?.value ?? '',
      editable: true,
      category: null,
      confidence: null,
      origin,
      at: row?.updatedAt.toISOString() ?? null,
      deletable: row != null,
      reappears: true,
      note: slotNote(key, origin, row != null),
    }
  })

  const orphanRows: MemoryRow[] = input.slots
    .filter((row) => !isNinaSlotKey(row.key))
    .slice()
    .sort((a, b) => a.key.localeCompare(b.key))
    .map((row) => ({
      rowId: `slot:${row.key}`,
      kind: 'slot',
      target: row.key,
      label: row.key,
      code: row.key,
      hint: ORPHAN_HINT,
      text: row.value,
      editable: false,
      category: null,
      confidence: null,
      origin: row.source,
      at: row.updatedAt.toISOString(),
      deletable: true,
      reappears: false,
      note: ORPHAN_NOTE,
    }))

  const promiseRows: MemoryRow[] = input.promises.map((promise) => ({
    rowId: `promise:${promise.id}`,
    kind: 'promise',
    target: promise.id,
    label: 'Promise',
    code: promise.metric,
    hint: describePromise(promise),
    text: promise.text,
    editable: false,
    category: null,
    confidence: null,
    origin: null,
    at: promise.promisedOn,
    deletable: true,
    reappears: false,
    note: PROMISE_NOTE,
  }))

  const factRows: MemoryRow[] = input.facts.map((fact) => ({
    rowId: `fact:${fact.id}`,
    kind: 'fact',
    target: fact.id,
    label: '',
    code: '',
    hint: '',
    text: fact.text,
    editable: true,
    category: fact.category,
    confidence: fact.confidence,
    origin: fact.source,
    at: fact.createdAt.toISOString(),
    deletable: true,
    reappears: false,
    note: factNote(fact.source, fact.sourceMessageId),
  }))

  return [...slotRows, ...orphanRows, ...promiseRows, ...factRows]
}
