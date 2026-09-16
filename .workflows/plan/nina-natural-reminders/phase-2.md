# Phase 2: Admin reminder management in `/admin/memory`

**Plan set:** `NINA_NATURAL_REMINDERS_PLAN.md`
**Analysis:** `20260916-144113-1VCB_code_analyzer.md` (extended below for R2 — see **R2 Analysis**)
**Satisfies:** R2 — "add a new section in Memory so admin can manually edit this reminder. admin
can add a new reminder, edit the existing one, or remove it."
**Depends on:** phase 1 (the `reminders` slot, `NinaReminder`/`NinaRemindersSlot`/
`NINA_SLOT_REMINDERS`, and `lib/nina/reminders.ts`'s pure functions all have to exist first — landed
on `main` at `203572c`)
**Difficulty:** NORMAL
**Package:** `lib/admin`, `components/admin`, `app/admin/memory`, `lib/nina/reminders.ts`

---

## R2 Analysis (added to the session's analysis document)

**Problem:** `/admin/memory` (`app/admin/memory/page.tsx`, R1's *"one simple table"*) already gives
the admin full CRUD over slots and the ledger, and delete-only over `pending_promises`. Phase 1's
`reminders` slot is deliberately **not** a member of `NINA_SLOT_KEYS` (`lib/db/schema/nina/memory.ts`
comment on `NINA_SLOT_REMINDERS`: *"A reminder is written by its own applier, never by the
distiller, so joining that vocabulary would buy nothing... See the phase plan's Handoffs"*) — so
today it is invisible to this page, and worse, if a `reminders` row exists it would currently render
as an **orphan** (`buildMemoryRows`'s `orphanRows` filter is `!isNinaSlotKey(row.key)`, which is true
for `'reminders'`), labelled "not one of the ten keys Nina understands... delete it" and offering
only a raw-JSON delete — actively misleading for a row this feature depends on.

**Success criteria:**
1. A "Reminders" group appears on `/admin/memory`, between Slots and Promises.
2. The admin can add a reminder (time, label, message), edit any of the three fields on an existing
   one, and delete one — each in one action, no confirmation, matching every other row on this page.
3. The `reminders` slot never renders as an orphan row again.
4. The same business rules the chat path already enforces (`HH:mm` shape, non-empty label/message,
   the four-active cap, the same-time-and-label duplicate refusal) apply to an admin write too — one
   set of rules, not two.

**Key consideration:** phase 1's own Out of scope ruled out a partial-edit tool call for the *chat*
path (*"cancel + a fresh create covers 'change my reminder to 9pm' in one turn"*) — that ruling is
about what the MODEL may express in one turn, not a mandate on every future writer. This page's own
precedent for every other row (`saveSlotAction`, `editFactAction`) is a true in-place patch — the
cell you touched changes and nothing else does. An admin fixing a typo should not reset the
reminder's `id`, `createdOn` or `lastFiredOn` (which cancel+create would do, by minting a fresh
entry) — see **Decisions** below.

---

## Interface Contract

**Creates:** none (no new files — everything below extends an existing one).

**Signature changes:**
- `lib/nina/reminders.ts` gains `patchReminder` (pure, in-place edit), `ReminderPatchInput`,
  `ReminderPatchResult`.
- `MemoryRowKind` (`lib/admin/memoryModel.ts:84`) gains `| 'reminder'`.
- `lib/admin/memoryModel.ts` gains `ADMIN_REMINDER_LABEL_MAX = 60`, `ADMIN_REMINDER_MESSAGE_MAX = 300`
  (plain number consts — no new import, so the client-safety test stays green).
- `lib/admin/memoryVocab.ts`'s `buildMemoryRows` gains an **optional** `reminders` input (defaults to
  `[]`), a new `MemoryReminderInputRow` interface, and its orphan filter excludes
  `NINA_SLOT_REMINDERS` by name.
- `lib/admin/schema.ts` gains `reminderCreateSchema`, `reminderEditSchema`; `memoryDeleteSchema`'s
  discriminated union gains a `'reminder'` branch.
- `lib/admin/memoryActions.ts` gains `createReminderAction`, `editReminderAction`;
  `deleteMemoryRowAction`'s `kind` parameter widens to include `'reminder'` with a new branch.
- `app/admin/memory/page.tsx` reads the reminders slot and passes it to `buildMemoryRows`.
- `components/admin/MemoryTable.tsx` gains a `'reminder'` entry in `GROUPS`, a `Row` branch for it,
  and a new `AddReminderRow` component.

**Requires (from phase 1):** `NinaReminder`, `NinaRemindersSlot`, `NINA_SLOT_REMINDERS` (from
`@/lib/db/schema`), `activeReminders`, `parseRemindersSlot`, `applyReminderWrites`, `MAX_ACTIVE_REMINDERS`
(from `@/lib/nina/reminders`), `NINA_REMINDER_TIME_PATTERN` (from `@/lib/nina/schema`).

**Leaves alone:**
- Phase 1's chat-facing `SEND_TOOL.reminders` field, `lib/nina/reminderstore.ts`,
  `lib/nina/proactive.ts`'s `reminder_due` trigger — this phase is admin-only.
- `NINA_SLOT_KEYS` / `NINA_SLOT_SPECS` — `reminders` still does not join the distiller's vocabulary.
- `deleteMemoryRowAction`'s `slot`/`promise`/`fact` branches — untouched, only the union widens.

---

## Files

| File | Action | What changes |
|---|---|---|
| `lib/nina/reminders.ts` | modify | add `patchReminder` + its two types |
| `lib/admin/memoryModel.ts` | modify | widen `MemoryRowKind`; add two caps |
| `lib/admin/memoryVocab.ts` | modify | `MemoryReminderInputRow`; reminder rows in `buildMemoryRows`; exclude `reminders` from orphans |
| `lib/admin/schema.ts` | modify | `reminderCreateSchema`, `reminderEditSchema`; widen `memoryDeleteSchema` |
| `lib/admin/memoryActions.ts` | modify | two new actions; widen `deleteMemoryRowAction`; header comment |
| `app/admin/memory/page.tsx` | modify | read + parse the reminders slot; pass to `buildMemoryRows`; header blurb |
| `components/admin/MemoryTable.tsx` | modify | `GROUPS` entry; `Row` branch; `AddReminderRow` |
| `tests/nina.reminders.test.ts` | modify | `patchReminder` coverage |
| `tests/admin.memory.test.ts` | modify | row-builder coverage + the two pinned action counts |

---

## Implementation Steps

### Step 1: `patchReminder` — the pure in-place edit

**File:** `lib/nina/reminders.ts`, appended after `markReminderFired`.

```ts
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
    return { slot: input.slot, changed: false, refusal: 'needs a valid time, a label and a message' }
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
```

No new imports needed — `NinaRemindersSlot` is already imported at the top of the file, and
`REMINDER_TIME_RE` is already declared there.

---

### Step 2: the row model — widen the kind, add the two caps

**File:** `lib/admin/memoryModel.ts`

**Change 1 — `:84`:**
```ts
type MemoryRowKind = 'slot' | 'promise' | 'fact' | 'reminder'
```

**Change 2 — after `ADMIN_SLOT_VALUE_MAX` (`:26`):**
```ts
/** Same number as `NinaReminderWriteSchema.label`'s cap (`lib/nina/schema.ts`) — one field, one cap. */
export const ADMIN_REMINDER_LABEL_MAX = 60
/** Same number as `NinaReminderWriteSchema.message`'s cap. */
export const ADMIN_REMINDER_MESSAGE_MAX = 300
```

Both are plain number literals — no new import, so `tests/admin.memory.test.ts`'s *"keeps
memoryModel client-safe: every import in it is a type import"* stays green untouched.

---

### Step 3: the row builder — reminder rows, and fixing the orphan leak

**File:** `lib/admin/memoryVocab.ts`

**Add an import** (top of file, alongside the existing ones):
```ts
import { NINA_SLOT_REMINDERS } from '@/lib/db/schema'
```

**Add, near `MemoryPromiseInputRow`:**
```ts
/** A `NinaReminder`, structurally — the fields a row needs. */
export interface MemoryReminderInputRow {
  id: string
  timeOfDay: string
  label: string
  message: string
  createdOn: string
  lastFiredOn?: string | null
}
```

**Add, near `PROMISE_NOTE`:**
```ts
function reminderNote(lastFiredOn: string | null | undefined): string {
  return lastFiredOn == null ? 'never fired yet' : `last fired ${lastFiredOn}`
}
```

**In `buildMemoryRows`'s signature**, add the optional field (default `[]` so none of the ~8 existing
call sites in `tests/admin.memory.test.ts` need to change):
```ts
export function buildMemoryRows(input: {
  slots: readonly MemorySlotInputRow[]
  facts: readonly MemoryFactInputRow[]
  promises: readonly MemoryPromiseInputRow[]
  reminders?: readonly MemoryReminderInputRow[]
}): MemoryRow[] {
```

**Fix the orphan filter** (currently `input.slots.filter((row) => !isNinaSlotKey(row.key))`):
```ts
const orphanRows: MemoryRow[] = input.slots
    .filter((row) => !isNinaSlotKey(row.key) && row.key !== NINA_SLOT_REMINDERS)
    .slice()
```

**Add, after `orphanRows` and before `promiseRows`:**
```ts
const reminderRows: MemoryRow[] = (input.reminders ?? []).map((reminder) => ({
  rowId: `reminder:${reminder.id}`,
  kind: 'reminder',
  target: reminder.id,
  label: reminder.label,
  code: reminder.timeOfDay,
  hint: '',
  text: reminder.message,
  editable: true,
  category: null,
  origin: null,
  at: reminder.createdOn,
  deletable: true,
  reappears: false,
  note: reminderNote(reminder.lastFiredOn),
}))
```

**Update the return statement:**
```ts
return [...slotRows, ...orphanRows, ...reminderRows, ...promiseRows, ...factRows]
```

**Row-field mapping, spelled out** (the table has no dedicated reminder fields — it reuses the three
strings every other kind already carries, exactly the way `code` already means a slot's key, a
promise's metric, or nothing on a fact):
- `label` -> the reminder's `label` ("tidur") — **editable** for this kind.
- `code` -> `timeOfDay` ("20:45") — **editable** for this kind, via a native `<input type="time">`.
- `text` -> `message` — editable via the existing textarea, unchanged plumbing.

---

### Step 4: the Zod boundary

**File:** `lib/admin/schema.ts`

**Add an import** (alongside the existing `lib/nina/*` imports near the top):
```ts
import { NINA_REMINDER_TIME_PATTERN } from '@/lib/nina/schema'
```

**Add, after `memoryIdSchema` (`:221`):**
```ts
const reminderTimeSchema = z
  .string()
  .trim()
  .regex(new RegExp(NINA_REMINDER_TIME_PATTERN), 'Not a valid HH:mm time.')

/** One shape, used by both create and edit — the table sends the full row either way. */
const reminderFieldsSchema = z.object({
  timeOfDay: reminderTimeSchema,
  label: z.string().trim().min(1).max(ADMIN_REMINDER_LABEL_MAX),
  message: z.string().trim().min(1).max(ADMIN_REMINDER_MESSAGE_MAX),
})

export const reminderCreateSchema = reminderFieldsSchema.extend({ userId: userIdSchema })

export const reminderEditSchema = reminderFieldsSchema.extend({
  userId: userIdSchema,
  id: memoryIdSchema,
})
```

Add `ADMIN_REMINDER_LABEL_MAX, ADMIN_REMINDER_MESSAGE_MAX` to the existing
`from '@/lib/admin/memoryModel'` import block (`:15-19`).

**Widen `memoryDeleteSchema` (`:266-270`):**
```ts
export const memoryDeleteSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('slot'), userId: userIdSchema, target: slotKeySchema }),
  z.object({ kind: z.literal('promise'), userId: userIdSchema, target: memoryIdSchema }),
  z.object({ kind: z.literal('fact'), userId: userIdSchema, target: memoryIdSchema }),
  z.object({ kind: z.literal('reminder'), userId: userIdSchema, target: memoryIdSchema }),
])
```

---

### Step 5: the write side

**File:** `lib/admin/memoryActions.ts`

**Imports to add:**
```ts
import { NINA_SLOT_REMINDERS, type NinaRemindersSlot } from '@/lib/db/schema'
import { todayInJakarta } from '@/lib/date/ranges'
import { newId } from '@/lib/id'
import { applyReminderWrites, parseRemindersSlot, patchReminder } from '@/lib/nina/reminders'
```
Add `reminderCreateSchema, reminderEditSchema` to the existing `from '@/lib/admin/schema'` import.

**Add, after `insertFactAction`:**
```ts
/**
 * R2's add affordance for reminders. Goes through the SAME `applyReminderWrites` the chat path
 * uses (`lib/nina/reminders.ts`) — one set of business rules (the `HH:mm` shape, the four-active
 * cap, the same-time-and-label duplicate refusal) for an admin-authored reminder and a model-
 * authored one, not two.
 */
export async function createReminderAction(input: {
  userId: string
  timeOfDay: string
  label: string
  message: string
}): Promise<AdminMemoryResult> {
  await requireAdmin()

  const parsed = reminderCreateSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'Give it a valid time, a label and a message.' }
  const { userId, timeOfDay, label, message } = parsed.data

  try {
    const row = await adminReadSlot(userId, NINA_SLOT_REMINDERS)
    const slot = parseRemindersSlot(row?.value)
    const result = applyReminderWrites({
      slot,
      writes: [{ action: 'create', timeOfDay, label, message }],
      todayISO: todayInJakarta(),
      sourceMessageId: null,
      newId: () => newId(),
    })
    const refusal = result.refused[0]
    if (refusal) return { ok: false, error: refusal.reason }

    await adminUpsertSlot(userId, { key: NINA_SLOT_REMINDERS, value: result.slot })
  } catch (cause) {
    return failed('createReminder', cause)
  }

  revalidatePath('/admin/memory')
  return { ok: true, note: 'She checks in at that time, once a day, from the next evening pass.' }
}

/**
 * R2's edit — a true in-place patch (`patchReminder`, `lib/nina/reminders.ts`), not cancel+create.
 * See phase 2's Decisions for why: this page's own precedent for every other row is that the cell
 * you touched changes and nothing else does.
 */
export async function editReminderAction(input: {
  userId: string
  id: string
  timeOfDay: string
  label: string
  message: string
}): Promise<AdminMemoryResult> {
  await requireAdmin()

  const parsed = reminderEditSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'That is not a reminder edit this page can make.' }
  const { userId, id, timeOfDay, label, message } = parsed.data

  try {
    const row = await adminReadSlot(userId, NINA_SLOT_REMINDERS)
    const slot = parseRemindersSlot(row?.value)
    const result = patchReminder({ slot, id, timeOfDay, label, message })
    if (result.refusal !== null) return { ok: false, error: result.refusal }
    if (!result.changed) return { ok: true }

    await adminUpsertSlot(userId, { key: NINA_SLOT_REMINDERS, value: result.slot })
  } catch (cause) {
    return failed('editReminder', cause)
  }

  revalidatePath('/admin/memory')
  return { ok: true, note: 'Saved.' }
}
```

**Widen `deleteMemoryRowAction`'s signature and add a branch**, mirroring the `'promise'` branch
exactly — a hard removal from the array, no soft-cancel, consistent with how promise deletion
already works on this page:

```ts
export async function deleteMemoryRowAction(input: {
  userId: string
  kind: 'slot' | 'promise' | 'fact' | 'reminder'
  target: string
}): Promise<AdminMemoryResult> {
```

Insert, as a fourth branch inside the `try` (after the `'promise'` block, before the closing
`} catch`):
```ts
    if (kind === 'reminder') {
      const row = await adminReadSlot(userId, NINA_SLOT_REMINDERS)
      const slot = parseRemindersSlot(row?.value)
      const next = slot.reminders.filter((reminder) => reminder.id !== target)
      if (next.length === slot.reminders.length) {
        return { ok: false, error: 'No reminder with that id. Nothing changed.' }
      }
      await adminUpsertSlot(userId, {
        key: NINA_SLOT_REMINDERS,
        value: { reminders: next } satisfies NinaRemindersSlot,
      })
      revalidatePath('/admin/memory')
      return { ok: true }
    }

```
(The existing `const slot = await adminReadSlot(...)` / `const current = ...` promise block keeps
its own local names — no collision, since each branch `return`s before the next begins.)

**Update the file header comment** — it currently says *"Four actions, because the table has four
things a person can do to it"*; change the count and add one sentence:
```
 * **Six actions**, because the table has six things a person can do to it: change a cell, add a
 * ledger row, add a reminder, edit a reminder, delete a row, and that is all.
```
(leave the rest of the header's numbered four-line ordering rule untouched — it still applies to
every action, including the two new ones).

---

### Step 6: the page

**File:** `app/admin/memory/page.tsx`

**Imports to add:**
```ts
import { activeReminders, parseRemindersSlot } from '@/lib/nina/reminders'
```
Add `NINA_SLOT_REMINDERS` to the existing `from '@/lib/db/schema'` import block.

**In the `Promise.all` read** (`:67-71`), add a fourth read:
```ts
  const [slotRows, factRows, promisesSlot, remindersSlot] = await Promise.all([
    adminReadSlots(target.id),
    adminReadFacts(target.id, ADMIN_LEDGER_PAGE),
    adminReadSlot(target.id, NINA_SLOT_PENDING_PROMISES),
    adminReadSlot(target.id, NINA_SLOT_REMINDERS),
  ])
```

**After the `promises` IIFE**, add:
```ts
  const reminders = activeReminders(parseRemindersSlot(remindersSlot?.value))
```

**Update the `buildMemoryRows` call:**
```ts
  const rows = buildMemoryRows({ slots: slotRows, facts: factRows, promises, reminders })
```

**Update `Header()`'s blurb** — one clause added, nothing else touched:
```
        Everything Nina has kept, in one table: the <strong>slots</strong> she is handed on every
        turn, her standing <strong>reminders</strong>, her pending <strong>promises</strong>, and
        the <strong>ledger</strong> of what she has been told. A cell saves when you leave it and a
        row deletes on one click — no confirmation anywhere. Edits here write production and she
        reads them on her very next message; there is no distillation pass and no cache in between.
```

---

### Step 7: the table

**File:** `components/admin/MemoryTable.tsx`

**Add a group entry** to `GROUPS` (`:135-158`), between `'slot'` and `'promise'`:
```ts
  {
    kind: 'reminder',
    title: 'Reminders',
    blurb:
      'Standing daily check-ins — she says the message back to him once a day, at the time set ' +
      'here. Add, edit or remove them; a change lands before her next evening pass.',
  },
```

**Add the constant** near `ADD_ROW_ID` (`:72`):
```ts
const ADD_REMINDER_ROW_ID = 'add:reminder'
```

**Add the two new caps to the import** from `@/lib/admin/memoryModel` (`:14-20`):
```ts
  ADMIN_REMINDER_LABEL_MAX,
  ADMIN_REMINDER_MESSAGE_MAX,
```
And add `createReminderAction, editReminderAction` to the import from `@/lib/admin/memoryActions`
(`:7-13`).

**Fix the group-skip condition** (`:281`) — a reminder group must render even with zero rows, the
same reason the ledger group always does (it carries an add row):
```ts
          if (group.kind !== 'fact' && group.kind !== 'reminder' && groupRows.length === 0) {
            return null
          }
```

**Render the add row for the reminder group**, alongside the existing fact one (`:294-300`):
```tsx
              {group.kind === 'reminder' && (
                <AddReminderRow
                  userId={userId}
                  result={results[ADD_REMINDER_ROW_ID]}
                  onResult={(result) => report(ADD_REMINDER_ROW_ID, result)}
                />
              )}
```

**In `Row`**, add reminder-draft state alongside the existing `text`/`category` state (`:343-365`):
```tsx
  const [reminderTime, setReminderTime] = React.useState(row.code)
  const [reminderLabel, setReminderLabel] = React.useState(row.label)

  const [lastCode, setLastCode] = React.useState(row.code)
  if (row.code !== lastCode) {
    setLastCode(row.code)
    setReminderTime(row.code)
  }
  const [lastLabel, setLastLabel] = React.useState(row.label)
  if (row.label !== lastLabel) {
    setLastLabel(row.label)
    setReminderLabel(row.label)
  }
```

**Add `commitReminder`**, alongside `commitSlot`/`commitFact` (`:367-398`):
```tsx
  function commitReminder(patch: { timeOfDay?: string; label?: string; message?: string }) {
    const nextTime = patch.timeOfDay ?? reminderTime
    const nextLabel = patch.label ?? reminderLabel
    const nextMessage = patch.message ?? text

    if (nextTime === row.code && nextLabel === row.label && nextMessage === row.text) return
    if (nextLabel.trim().length === 0 || nextMessage.trim().length === 0) {
      setReminderLabel(row.label)
      setText(row.text)
      onReport(row.rowId, {
        ok: false,
        error: 'A reminder needs a label and a message. Delete it instead.',
      })
      return
    }
    onRun(row.rowId, () =>
      editReminderAction({
        userId,
        id: row.target,
        timeOfDay: nextTime,
        label: nextLabel,
        message: nextMessage,
      }),
    )
  }
```

**Widen `commit()`** (`:400-403`):
```tsx
  function commit() {
    if (row.kind === 'slot') commitSlot()
    else if (row.kind === 'fact') commitFact({})
    else if (row.kind === 'reminder') commitReminder({})
  }
```

**The "What" column** (`:407-431`) — add a branch before the final `<>` fallback:
```tsx
      <td className={CELL}>
        {row.kind === 'fact' ? (
          <select
            aria-label="Category"
            className={cn(CELL_CONTROL, 'appearance-none')}
            value={category ?? 'other'}
            onChange={(event) => {
              const next = event.target.value as AdminFactCategory
              setCategory(next)
              commitFact({ category: next })
            }}
          >
            {ADMIN_FACT_CATEGORIES.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        ) : row.kind === 'reminder' ? (
          <>
            <span className="block text-[13px] font-semibold text-ink">Reminder</span>
            <input
              type="time"
              aria-label="Time"
              className={cn(CELL_CONTROL, 'mt-0.5')}
              value={reminderTime}
              onChange={(event) => {
                setReminderTime(event.target.value)
                if (result !== undefined) onReport(row.rowId, null)
              }}
              onBlur={() => commitReminder({ timeOfDay: reminderTime })}
            />
          </>
        ) : (
          <>
            <span className="block text-[13px] font-semibold text-ink">{row.label}</span>
            <code className="mt-0.5 block text-[11px] font-medium text-ink-3">{row.code}</code>
          </>
        )}
      </td>
```

**The "Value" column** (`:433-477`) — add a reminder branch before the `row.editable` ternary:
```tsx
      <td className={CELL}>
        {row.kind === 'reminder' ? (
          <div className="space-y-1.5">
            <input
              aria-label="Label"
              className={CELL_CONTROL}
              value={reminderLabel}
              maxLength={ADMIN_REMINDER_LABEL_MAX}
              onChange={(event) => {
                setReminderLabel(event.target.value)
                if (result !== undefined) onReport(row.rowId, null)
              }}
              onBlur={() => commitReminder({ label: reminderLabel })}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  event.currentTarget.blur()
                }
              }}
            />
            <textarea
              aria-label="Message"
              className={cn(CELL_CONTROL, 'resize-y leading-snug')}
              rows={1}
              value={text}
              maxLength={ADMIN_REMINDER_MESSAGE_MAX}
              onChange={(event) => {
                setText(event.target.value)
                if (result !== undefined) onReport(row.rowId, null)
              }}
              onBlur={() => commitReminder({ message: text })}
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  event.preventDefault()
                  setText(row.text)
                  setReminderLabel(row.label)
                  setReminderTime(row.code)
                  onReport(row.rowId, null)
                  return
                }
                if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                  event.preventDefault()
                  event.currentTarget.blur()
                }
              }}
            />
          </div>
        ) : row.editable ? (
          <textarea
            aria-label={row.label === '' ? 'Ledger row text' : `${row.label} value`}
            className={cn(CELL_CONTROL, 'resize-y leading-snug')}
            rows={1}
            value={text}
            maxLength={row.kind === 'slot' ? ADMIN_SLOT_VALUE_MAX : ADMIN_FACT_TEXT_MAX}
            placeholder={row.kind === 'slot' ? 'not set' : ''}
            onChange={(event) => {
              setText(event.target.value)
              if (result !== undefined) onReport(row.rowId, null)
            }}
            onBlur={commit}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.preventDefault()
                setText(row.text)
                onReport(row.rowId, null)
                return
              }
              if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                event.preventDefault()
                event.currentTarget.blur()
              }
            }}
          />
        ) : (
          <p className="px-2 py-1.5 text-[13px] font-medium text-ink">{row.text}</p>
        )}

        {row.hint !== '' && (
          <p className="mt-1 px-2 text-[11px] font-medium text-ink-3">{row.hint}</p>
        )}
        {result?.ok === false && (
          <p role="alert" className="mt-1 px-2 text-[11px] font-semibold text-red">
            {result.error}
          </p>
        )}
        {result?.ok === true && result.note !== undefined && (
          <p role="status" className="mt-1 px-2 text-[11px] font-semibold text-accent">
            {result.note}
          </p>
        )}
      </td>
```

**The Origin badge** (`:479-489`) — widen the fallback ternary:
```tsx
          {row.origin ??
            (row.kind === 'promise' ? 'promise' : row.kind === 'reminder' ? 'reminder' : 'not set')}
```

**Add `AddReminderRow`**, after `AddRow` closes (end of file):
```tsx
/**
 * R2's add affordance for reminders — the same shape as `AddRow`, three fields instead of two.
 * `type="time"` gives a native picker and guarantees `HH:mm` with no client-side regex of its own.
 */
function AddReminderRow({
  userId,
  result,
  onResult,
}: {
  userId: string
  result: AdminMemoryResult | undefined
  onResult: (result: AdminMemoryResult | null) => void
}) {
  const [timeOfDay, setTimeOfDay] = React.useState('20:45')
  const [label, setLabel] = React.useState('')
  const [message, setMessage] = React.useState('')
  const [pending, startTransition] = React.useTransition()

  function add() {
    if (label.trim().length === 0 || message.trim().length === 0) return
    startTransition(async () => {
      const next = await createReminderAction({ userId, timeOfDay, label, message })
      onResult(next)
      if (next.ok) {
        setLabel('')
        setMessage('')
      }
    })
  }

  return (
    <tr className="bg-paper-2/40">
      <td className={CELL}>
        <span className="block text-[13px] font-semibold text-ink">Reminder</span>
        <input
          type="time"
          aria-label="Time for the new reminder"
          className={cn(CELL_CONTROL, 'mt-0.5')}
          value={timeOfDay}
          disabled={pending}
          onChange={(event) => setTimeOfDay(event.target.value)}
        />
      </td>

      <td className={CELL}>
        <div className="space-y-1.5">
          <input
            aria-label="Label for the new reminder"
            className={CELL_CONTROL}
            value={label}
            maxLength={ADMIN_REMINDER_LABEL_MAX}
            disabled={pending}
            placeholder="tidur"
            onChange={(event) => {
              setLabel(event.target.value)
              if (result !== undefined) onResult(null)
            }}
          />
          <input
            aria-label="Message for the new reminder"
            className={CELL_CONTROL}
            value={message}
            maxLength={ADMIN_REMINDER_MESSAGE_MAX}
            disabled={pending}
            placeholder="What she says back to him every day."
            onChange={(event) => {
              setMessage(event.target.value)
              if (result !== undefined) onResult(null)
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                add()
              }
            }}
          />
        </div>
        {result?.ok === false && (
          <p role="alert" className="mt-1 px-2 text-[11px] font-semibold text-red">
            {result.error}
          </p>
        )}
        {result?.ok === true && result.note !== undefined && (
          <p role="status" className="mt-1 px-2 text-[11px] font-semibold text-accent">
            {result.note}
          </p>
        )}
      </td>

      <td className={cn(CELL_WIDE_ONLY, 'text-[11px] font-medium text-ink-3')} colSpan={2}>
        Fires once a day at that time, from the evening cron.
      </td>

      <td className={cn(CELL, 'text-right')}>
        <Button
          size="md"
          className="text-[15px]"
          aria-label="Add this reminder"
          loading={pending}
          disabled={label.trim().length === 0 || message.trim().length === 0}
          onClick={add}
        >
          +
        </Button>
      </td>
    </tr>
  )
}
```

**Update the `<caption>`** (`:248-253`) — one clause added:
```
          Every memory Nina holds for this account: her eight slots, her standing reminders, her
          pending promises, and the ledger. A cell saves when you leave it. The delete control
          removes a row on the first click, with no confirmation. On a narrow screen the Origin and
          When columns are not shown; the table scrolls sideways inside its own box.
```

---

### Step 8: tests — the pure function

**File:** `tests/nina.reminders.test.ts`

Add `patchReminder` to the existing `from '@/lib/nina/reminders'` import, and append a new
`describe` block, reusing the file's own `reminder()`/`slotOf()` helpers:

```ts
describe('patchReminder — the in-place edit', () => {
  it('changes the fields and keeps id, createdOn and lastFiredOn untouched', () => {
    const original = reminder({ lastFiredOn: TODAY })
    const result = patchReminder({
      slot: slotOf(original),
      id: original.id,
      timeOfDay: '21:00',
      label: 'tidur',
      message: 'jam baru',
    })
    expect(result.refusal).toBeNull()
    expect(result.changed).toBe(true)
    const patched = result.slot.reminders[0]
    expect(patched?.id).toBe(original.id)
    expect(patched?.createdOn).toBe(original.createdOn)
    expect(patched?.lastFiredOn).toBe(TODAY)
    expect(patched?.timeOfDay).toBe('21:00')
    expect(patched?.message).toBe('jam baru')
  })

  it('is a no-op, not a refusal, when nothing actually changed', () => {
    const original = reminder()
    const result = patchReminder({
      slot: slotOf(original),
      id: original.id,
      timeOfDay: original.timeOfDay,
      label: original.label,
      message: original.message,
    })
    expect(result.changed).toBe(false)
    expect(result.refusal).toBeNull()
  })

  it('refuses an unknown or cancelled id', () => {
    const cancelled = reminder({ id: 'gone', status: 'cancelled', cancelledOn: YESTERDAY })
    const result = patchReminder({
      slot: slotOf(cancelled),
      id: 'gone',
      timeOfDay: '20:45',
      label: 'tidur',
      message: 'x',
    })
    expect(result.changed).toBe(false)
    expect(result.refusal).toMatch(/no active reminder/)
  })

  it('refuses a malformed time or an empty field, same as create does', () => {
    const original = reminder()
    expect(
      patchReminder({ slot: slotOf(original), id: original.id, timeOfDay: '8:45 pm', label: 'x', message: 'y' })
        .refusal,
    ).toMatch(/valid time/)
    expect(
      patchReminder({ slot: slotOf(original), id: original.id, timeOfDay: '20:45', label: '', message: 'y' })
        .refusal,
    ).toMatch(/valid time/)
  })

  it('refuses a time+label collision with ANOTHER active reminder, but allows keeping its own', () => {
    const a = reminder({ id: 'a', timeOfDay: '06:00', label: 'lari' })
    const b = reminder({ id: 'b', timeOfDay: '20:45', label: 'tidur' })
    const collision = patchReminder({
      slot: slotOf(a, b),
      id: 'a',
      timeOfDay: '20:45',
      label: 'tidur',
      message: 'x',
    })
    expect(collision.refusal).toMatch(/already exists/)

    const ownTime = patchReminder({
      slot: slotOf(a, b),
      id: 'b',
      timeOfDay: '20:45',
      label: 'tidur',
      message: 'jam baru',
    })
    expect(ownTime.refusal).toBeNull()
    expect(ownTime.changed).toBe(true)
  })
})
```

---

### Step 9: tests — the row builder and the pinned action counts

**File:** `tests/admin.memory.test.ts`

**Add a reminder row test**, in `describe('buildMemoryRows — R1s one table', ...)`, after the
promise test:
```ts
  it('gives a reminder its own row, editable, and sits between orphans and promises', () => {
    const rows = buildMemoryRows({
      ...empty,
      slots: [
        {
          key: 'favourite_shoe',
          value: 'Novablast 4',
          source: 'distilled',
          sourceMessageId: null,
          updatedAt: new Date('2026-09-01T00:00:00Z'),
        },
      ],
      promises: [
        {
          id: 'p1',
          text: 'a promise',
          condition: 'a condition',
          metric: 'free',
          target: null,
          targetKey: null,
          byDate: null,
          promisedOn: '2026-09-02',
          status: 'pending',
        },
      ],
      reminders: [
        {
          id: 'rem_1',
          timeOfDay: '20:45',
          label: 'tidur',
          message: 'biar konsisten',
          createdOn: '2026-09-10',
          lastFiredOn: null,
        },
      ],
    })

    const reminder = rows.find((row) => row.kind === 'reminder')
    expect(reminder?.rowId).toBe('reminder:rem_1')
    expect(reminder?.target).toBe('rem_1')
    expect(reminder?.label).toBe('tidur')
    expect(reminder?.code).toBe('20:45')
    expect(reminder?.text).toBe('biar konsisten')
    expect(reminder?.editable).toBe(true)
    expect(reminder?.deletable).toBe(true)
    expect(reminder?.reappears).toBe(false)
    expect(reminder?.note).toMatch(/never fired/)

    const kinds = rows.map((row) => row.kind)
    const firstOrphan = kinds.indexOf('slot', NON_STRUCTURED_SLOT_KEYS.length)
    expect(firstOrphan).toBe(NON_STRUCTURED_SLOT_KEYS.length)
    expect(kinds.indexOf('reminder')).toBeGreaterThan(firstOrphan)
    expect(kinds.indexOf('promise')).toBeGreaterThan(kinds.indexOf('reminder'))
  })

  it('never renders the reminders slot key as an orphan row', () => {
    const rows = buildMemoryRows({
      ...empty,
      slots: [
        {
          key: 'reminders',
          value: { reminders: [] },
          source: 'distilled',
          sourceMessageId: null,
          updatedAt: new Date('2026-09-01T00:00:00Z'),
        },
      ],
    })
    expect(rows.some((row) => row.target === 'reminders')).toBe(false)
  })
```

**Fix the two pinned counts** in the `describe('R1 — no confirmation, anywhere on this page', ...)`
block, now that there are six actions instead of four:

```ts
  it('exports exactly the six actions the table calls', () => {
    const source = readFileSync(ACTIONS, 'utf8')
    const exported = [...source.matchAll(/^export async function (\w+)/gm)].map(([, name]) => name)
    expect(exported.sort()).toEqual([
      'createReminderAction',
      'deleteMemoryRowAction',
      'editFactAction',
      'editReminderAction',
      'insertFactAction',
      'saveSlotAction',
    ])
  })

  it('keeps Zod at every one of those six boundaries — validation is not confirmation', () => {
    const source = readFileSync(ACTIONS, 'utf8')
    expect(source.match(/\.safeParse\(input\)/g)).toHaveLength(6)
    expect(source.match(/^ {2}await requireAdmin\(\)$/gm)).toHaveLength(6)
  })
```
(replacing the two existing tests of the same names/counts — the rest of that `describe` block,
and every other `describe` in the file, is untouched.)

---

## Invariants

- Everything phase 1 shipped keeps working unchanged — this phase only adds an admin surface over
  the same `reminders` slot.
- One set of business rules for a reminder write, whoever writes it: `createReminderAction` calls
  the exact same `applyReminderWrites` the chat path uses.
- No confirmation anywhere — matching R1's ruling for the rest of this page, and the user's own
  "no more human-in-the-loop" instruction for this session.
- `npx tsc --noEmit` and the full `vitest` suite pass at the end of the phase.
- The `reminders` slot never renders as an orphan row.

## Decisions

| Fork | Chosen | Rung |
|---|---|---|
| Extend `MemoryRow` with reminder-specific fields, or reuse `label`/`code`/`text` | Reuse the three existing strings (label=admin label, code=timeOfDay, text=message) | 6: convention — every other kind already repurposes these three fields differently |
| Admin edit: reuse chat's cancel+create, or a true in-place patch | New `patchReminder`, in-place — keeps `id`/`createdOn`/`lastFiredOn` stable | 4: the user's own ask ("edit the existing one") plus this page's own precedent (every other row is a true in-place patch) |
| Admin delete: hard-remove the array entry, or soft-cancel like the chat path can | Hard-remove | 6: convention — matches the existing `pending_promises` delete branch exactly |
| Which reminders the admin sees | Active only (`activeReminders`) — cancelled history stays invisible here | 6: convention — matches how a settled promise is not shown either |
| `buildMemoryRows`'s new `reminders` param: required or optional | Optional, default `[]` | 6: convention — avoids touching ~8 existing test call sites for a field most of them do not care about |

## Open Questions

None. Every fork above has a reversible-by-one-commit resolution stated above.

## Rollback

Revert this phase's commit. No migration, no new table, no cron change — every write here already
goes through `adminUpsertSlot`/`getNinaMemorySlot`, the same as every other row on this page.

## Exit Criteria

`npx tsc --noEmit` and the full `vitest` suite pass. `tests/nina.reminders.test.ts` covers
`patchReminder`'s five cases above. `tests/admin.memory.test.ts` covers the new row shape, the
orphan-exclusion fix, and the two pinned action-boundary counts (six, not four). Visiting
`/admin/memory` shows a "Reminders" group between Slots and Promises, with a working add row.
