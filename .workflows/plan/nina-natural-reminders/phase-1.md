# Phase 1: Natural-language recurring reminders

**Plan set:** `NINA_NATURAL_REMINDERS_PLAN.md`
**Analysis:** `20260916-144113-1VCB_code_analyzer.md`
**Satisfies:** R1 — "remind me every day at 8:45 PM to sleep", recognised in chat, confirmed in her
own reply, and delivered as a chat message + push notification every day thereafter, once per
Jakarta calendar day.
**Depends on:** none (single-phase set)
**Difficulty:** HARD
**Package:** `lib/nina` (with `lib/db/schema/nina`, `lib/push`, `app/api/cron/nina`, root config)

---

## Goal

After this phase Nina has a sixth reason to open a conversation: a standing daily reminder the
runner asked her for in ordinary prose. The model expresses it through a new optional `reminders`
field on `SEND_TOOL`'s payload (create / cancel), the server persists it as a structured entry in a
new `reminders` key of the existing `nina_memory_slots` `jsonb` table (no migration), and the
existing evening cron's `decideProactive` engine fires it at the top of the priority list once per
Jakarta calendar day, marked by the reminder's own `lastFiredOn` rather than by `nina_nags`.

---

## Interface Contract

The reconciler reads this section to detect cross-phase conflicts. This is a single-phase set, so
the lists below are the complete surface this branch moves.

**Deletes:** none.

**Renames:** none.

**Creates:**
- `lib/nina/reminders.ts` (new file, PURE — no `server-only`, no db import, no clock read):
  `NinaReminderRefusal`, `ReminderWriteInput`, `ReminderWriteResult`, `REMINDER_TIME_RE`,
  `MAX_ACTIVE_REMINDERS`, `MAX_CANCELLED_KEPT`, `parseRemindersSlot`, `activeReminders`,
  `applyReminderWrites`, `dueReminder`, `markReminderFired`.
- `lib/nina/reminderstore.ts` (new file, IMPURE shell, `server-only`): `readNinaReminders`,
  `applyNinaReminderWrites`, `markNinaReminderFired`.
- `lib/db/schema/nina/memory.ts`: `NinaReminder`, `NinaRemindersSlot`, `NINA_SLOT_REMINDERS`
  (`'reminders'`).
- `lib/nina/schema.ts`: `NinaReminderWriteSchema` (not exported), `NinaReminderWrite` (exported
  type), `NINA_REMINDER_TIME_PATTERN` (exported const string).
- `lib/nina/proactive.ts`: `jakartaMinuteClockOf`, `evaluateReminderDue`, `ReminderDueDetail`.
- `tests/nina.reminders.test.ts` (new file).

**Signature changes:**
- `ProactiveTriggerKind` (`lib/nina/prompts/system.ts:561`) gains `| 'reminder_due'`.
- `NinaMessageSource` (`lib/db/schema/nina/chat.ts:232`) gains `| 'reminder_due'` — REQUIRED, because
  `emitProactiveMessage` passes `source: detail.kind` into `insertNinaMessages`, whose
  `NinaMessageInsert.source` is `NinaMessageSource` (`lib/nina/queries/shapes.ts:93`).
- `NinaSlotValue` (`lib/db/schema/nina/memory.ts:121`) gains `| NinaRemindersSlot`.
- `ProactiveFacts` (`lib/nina/proactive.ts:133`) gains two fields: `nowHHmm: string`,
  `reminders: readonly NinaReminder[]`.
- `ProactiveDetail` (`lib/nina/proactive.ts:192`) gains `| ReminderDueDetail`.
- `NinaSendPayloadSchema` / `NinaSendPayload` (`lib/nina/schema.ts:68`) gains
  `reminders?: NinaReminderWrite[]`.
- `NINA_PUSH_KINDS` (`lib/push/payload.ts:184`) gains the literal `'reminder_due'`.
- `PROACTIVE_COPY` / `PROACTIVE_INSTRUCTIONS` (`lib/nina/prompts/system.ts:699,750`) gain a
  `reminder_due` entry.
- `NINA_PROMPT_VERSION` (`lib/nina/prompts/index.ts:115`) `9` -> `10`.
- `vercel.json` `crons[1].schedule` `"0 12 * * *"` -> `"0 13 * * *"`.

**Requires (from earlier phases):** none — this set has one phase.

**Leaves alone (owned by nobody in this set, and deliberately untouched):**
- `lib/nina/prompts/system.ts`'s `buildNinaSystemPrompt` and everything it renders
  (`buildContextGuide`, `buildOutputRule`, `NINA_SECTION_TITLES`, every `persona.ts` block).
  **`tests/__snapshots__/nina.prompts.test.ts.snap` pins four complete system prompts and is never
  regenerated** (`tests/nina.prompts.test.ts:~228-250`), so NOT ONE BYTE of the system text moves in
  this phase. The only edits inside `system.ts` are `ProactiveTriggerKind` (a type) and the
  `PROACTIVE_COPY` / `PROACTIVE_INSTRUCTIONS` records, neither of which is reachable from
  `buildNinaSystemPrompt`.
- `SEND_TOOL.description` — the string `'Send your reply. Always answer with this tool.'` is
  asserted byte-for-byte by `tests/nina.prompts.test.ts`'s *"stays a constant array — no tool schema
  depends on a tuning"* case. The teaching the model needs goes on the new `reminders` PROPERTY
  descriptions instead, which is exactly where `prompts/tools.ts`' own 2026-08-21 measurement says
  the lever is. **This is a deliberate deviation from the phase brief's "SEND_TOOL's description
  text … must be updated": the property descriptions ARE the description edit, and the tool's own
  one-line `description` is pinned by a test.**
- `NINA_SLOT_KEYS` / `NINA_SLOT_SPECS` (`lib/nina/memory.ts:637,685`) and the distiller. See
  **Handoffs** — `'reminders'` is deliberately NOT added to the closed ten-key vocabulary.
- `lib/nina/context.ts` — **verified, no change needed.** See Step 9.
- `buildNinaPushPayload` (`lib/push/payload.ts:326`) — **verified, no per-`kind` branch exists.**
  See Step 11.
- `lib/nina/memory.ts`'s `planMemoryWrites` / `runNinaDistillation` pipeline — the reminders applier
  is an independent call with its own `try`/`catch`, never routed through it.
- `app/api/cron/nina/route.ts`'s handler body — only the header comment block changes.
- Everything under the plan index's **Out of scope**: no new cron job, no multi-reminder delivery in
  one tick, no reminders UI, no partial-edit action.

---

## Files

| File | Action | What changes |
|---|---|---|
| `lib/db/schema/nina/memory.ts` | modify | `:109` after `NinaPendingPromise`: add `NinaReminder`, `NinaRemindersSlot`, `NINA_SLOT_REMINDERS`; widen `NinaSlotValue` at `:121` |
| `lib/db/schema/nina/chat.ts` | modify | `:232` widen `NinaMessageSource` with `'reminder_due'` |
| `lib/nina/schema.ts` | modify | `:56` add `NinaReminderWriteSchema` + `NINA_REMINDER_TIME_PATTERN`; `:75` add `reminders` to `NinaSendPayloadSchema` |
| `lib/nina/prompts/tools.ts` | modify | `:123` add the `reminders` property to `SEND_TOOL.input_schema.properties` |
| `lib/nina/prompts/index.ts` | modify | `:115` `NINA_PROMPT_VERSION` 9 -> 10 with a changelog comment above it |
| `lib/nina/prompts/system.ts` | modify | `:562` widen `ProactiveTriggerKind`; `:726` add `PROACTIVE_COPY.reminder_due`; `:756` add `PROACTIVE_INSTRUCTIONS.reminder_due` |
| `lib/nina/reminders.ts` | **create** | the pure module: parse, apply, due, mark |
| `lib/nina/reminderstore.ts` | **create** | the impure shell: read the slot, write the slot, never throw |
| `lib/nina/proactive.ts` | modify | `:72` priority; `:147` facts; `:197` detail union; `:228` new time helper; `:369` new evaluator; `:384` evaluator map; `:424` `markerFor` case; `:470` `triggerBlock` case; `:539` fact load; `:689` marker branch |
| `lib/nina/turnrun.ts` | modify | `:30` import; `:622` apply `result.payload.reminders` in its own `try`/`catch` |
| `lib/push/payload.ts` | modify | `:192` add `'reminder_due'` to `NINA_PUSH_KINDS` |
| `vercel.json` | modify | `:17` `/api/cron/nina` schedule `"0 12 * * *"` -> `"0 13 * * *"` |
| `app/api/cron/nina/route.ts` | modify | `:15-30` header comment rewritten for the new schedule |
| `tests/nina.reminders.test.ts` | **create** | the pure module's whole surface |
| `tests/nina.proactive.test.ts` | modify | `:40` facts fixture gains two fields; new `evaluateReminderDue` block; priority + `markerFor` + `triggerBlock` cases |
| `tests/nina.prompts.test.ts` | modify | `:483` the `PROACTIVE_INSTRUCTIONS` key list; a new `SEND_TOOL.reminders` case |
| `lib/push/payload.test.ts` | modify | `:264` the `TRIGGER_KINDS` exhaustive record |
| `tests/db.schema.nina.test.ts` | modify | `:229` pin `NINA_SLOT_REMINDERS` |

---

## Implementation Steps

### Step 1: the storage types and the slot key

**File:** `lib/db/schema/nina/memory.ts:109` (immediately after `NinaPendingPromise` closes, and
before `NinaPendingPromisesSlot` at `:111`)

**Change:** add the reminder record type, its slot wrapper and the slot key, mirroring the
`NinaPendingPromise` / `NinaPendingPromisesSlot` / `NINA_SLOT_PENDING_PROMISES` trio exactly.

**Code — insert between the closing `}` of `NinaPendingPromise` (`:109`) and the
`NinaPendingPromisesSlot` docstring (`:111`):**

```ts
/**
 * **One standing daily reminder** — the nina-natural-reminders set, R1. The runner asks for one in
 * ordinary chat prose ("tolong lo remind gw tiap 8:45 pm buat tidur na"), the model expresses it on
 * `SEND_TOOL.reminders`, and `lib/nina/proactive.ts`'s sixth trigger delivers it once per Jakarta
 * calendar day.
 *
 * ── WHY THIS IS A `jsonb` SLOT AND NOT A TABLE ────────────────────────────────────────────────
 * `NinaPendingPromise` above makes the whole argument and this is the same shape: a per-user list of
 * structured, date-tracked records evaluated on every cron tick. `nina_memory_slots.value` is
 * `jsonb`, so it costs **no migration**, and a reminder has the same access pattern a promise has —
 * read the whole list for this user, decide, write the whole list back.
 *
 * ── `lastFiredOn` IS THE IDEMPOTENCE MARKER, AND IT LIVES HERE RATHER THAN IN `nina_nags` ─────
 * `nina_nags` is keyed `(user_id, code)` with `level`/`count` columns for an escalation ladder. A
 * reminder has no anger rung and no shared code — its identity IS this record — so its "already
 * said it today" marker is a field on itself. `lib/nina/proactive.ts` writes it **after** the
 * message rows are committed, exactly as `emitProactiveMessage` already orders the nag write, so a
 * mid-flight failure is retried by the next tick instead of being silently spent.
 *
 * Every date is a Jakarta `'YYYY-MM-DD'` string (roadmap D6), never a JS `Date`. `timeOfDay` is a
 * zero-padded Jakarta wall clock `'HH:mm'`, which makes "is it at or past its time yet" a plain
 * string comparison against `jakartaMinuteClockOf(now)` and needs no parser on either side.
 */
export type NinaReminder = {
  /** nanoid(12), so the model can name one across turns in order to cancel it. */
  id: string
  /** Jakarta wall clock, zero-padded `'HH:mm'`. `'20:45'`, never `'8:45 pm'` and never `'845'`. */
  timeOfDay: string
  /** What it is, in two or three words — `'tidur'`. Display-ready, his terms. */
  label: string
  /** WHY he said it matters, in his own terms. This is what she says back to him every day. */
  message: string
  /** The Jakarta day he asked for it. */
  createdOn: string
  /** `'cancelled'` is kept rather than deleted, so "you told me to stop" is answerable. */
  status: 'active' | 'cancelled'
  /**
   * The Jakarta day this reminder last reached him. **The whole of its idempotence**: equal to
   * today means she has already said it today, whatever else the cron does. Absent/null means never.
   */
  lastFiredOn?: string | null
  /** The Jakarta day he called it off. Null while active. */
  cancelledOn?: string | null
  /** `nina_messages.id` he asked in, for provenance. NULL when there is nothing to point at. */
  sourceMessageId?: string | null
}

/** The `reminders` slot's value, in full. `lib/nina/reminders.ts` parses exactly this. */
export type NinaRemindersSlot = { reminders: NinaReminder[] }

/**
 * The second slot key declared in this file, and for the same reason as the first: its value is
 * STRUCTURED, so the module that evaluates it has to be able to name the key without reaching into
 * `lib/nina/memory.ts`'s prose vocabulary.
 *
 * **It is deliberately NOT a member of `NINA_SLOT_KEYS`** (`lib/nina/memory.ts:637`). That list is
 * the closed vocabulary the DISTILLER may write and `/admin/memory` renders, and every key in it
 * owes a `SlotSpec` (`canonicalise` + a line of distiller prompt) plus an entry in two total
 * `Record<NinaSlotKey, …>` tables in `lib/admin/memoryVocab.ts`. A reminder is written by its own
 * applier, never by the distiller, so joining that vocabulary would buy nothing and cost the
 * distiller a tenth key it must be told to refuse. See the phase plan's Handoffs.
 */
export const NINA_SLOT_REMINDERS = 'reminders'
```

**Then widen `NinaSlotValue`.** It is at `:121-122` today:

```ts
export type NinaSlotValue =
  string | number | boolean | NinaPendingPromisesSlot | { [key: string]: unknown } | unknown[]
```

replace with:

```ts
export type NinaSlotValue =
  | string
  | number
  | boolean
  | NinaPendingPromisesSlot
  | NinaRemindersSlot
  | { [key: string]: unknown }
  | unknown[]
```

**Impact:** `upsertNinaMemorySlot(userId, { key: NINA_SLOT_REMINDERS, value: slot, … })` typechecks
without a cast, the same way the promise sweep's write does. `renderSlotValue`
(`lib/nina/queries/memory.ts:45`) already handles a structured value by `JSON.stringify`, so no
query changes.

---

### Step 2: widen the message-source column domain

**File:** `lib/db/schema/nina/chat.ts:232`

**Change:** `emitProactiveMessage` writes `source: detail.kind` and `NinaMessageInsert.source` is
`NinaMessageSource` (`lib/nina/queries/shapes.ts:93`). A sixth `ProactiveTriggerKind` therefore
requires a sixth member here or `npx tsc --noEmit` fails at `lib/nina/proactive.ts:667`.

**Code — replace the type, and append one paragraph to the docstring immediately above it (after
the `── ONE VOCABULARY, TWO DECLARATIONS …` paragraph that ends at `:230`, before the closing
` */`):**

```ts
 * ── THE SIXTH TRIGGER, AND WHY IT WIDENED THE DOMAIN ─────────────────────────────────────────
 * `'reminder_due'` (the nina-natural-reminders set, R1) is the sixth `ProactiveTriggerKind` and
 * therefore the sixth member here — the pairing above is not decorative: `emitProactiveMessage`
 * writes `source: detail.kind` straight through, so a trigger this column cannot hold is a trigger
 * that cannot be persisted. It earns its own value for the same reason `'run_committed'` did: a
 * reminder's message rows are the only durable evidence, outside the slot, that she kept a standing
 * promise on a given day, and collapsing it into a shared `'proactive'` would make that
 * unanswerable from this table.
 */
export type NinaMessageSource =
  | 'chat'
  | 'run_committed'
  | 'missed_usual_day'
  | 'pattern_crossed'
  | 'silence'
  | 'avatar_changed'
  | 'reminder_due'
```

**Impact:** no migration — the column is `text` with a `$type<>()` annotation only.

---

### Step 3: the Zod contract for a reminder write

**File:** `lib/nina/schema.ts:56` (immediately after `export type NinaMemoryWrite = …`) and `:75`

**Change:** add `NinaReminderWriteSchema` beside `NinaMemoryWriteSchema`, and the optional
`reminders` array on the send payload. Follow this file's stated style: `z.object` (strip, not
strict), `.trim()`, sensible `.max()` caps, no `.strict()`.

**Code — insert after `:56` (`export type NinaMemoryWrite = z.infer<typeof NinaMemoryWriteSchema>`):**

```ts
/**
 * `SEND_TOOL.reminders`' cap. Four standing daily check-ins is already more than a friend would
 * ever be asked for, and a model that emits ten of them in one turn has misunderstood the field
 * rather than discovered a use for it. `lib/nina/reminders.ts`'s `MAX_ACTIVE_REMINDERS` is the
 * SEPARATE, durable cap on how many may be live at once; this one bounds a single turn.
 */
const MAX_REMINDER_WRITES = 4

/**
 * A Jakarta wall clock, zero-padded, 24-hour. **Exported as a STRING**, not as a `RegExp`, because
 * `lib/nina/prompts/tools.ts` needs the same characters as a JSON-Schema `pattern` and that module
 * is a constant with no imports but `type Anthropic` (its own header says so). The copy there is
 * pinned to this constant by `tests/nina.prompts.test.ts`, exactly the way `aggregate_runs`' enums
 * are pinned to `NINA_AGGREGATE_METRICS`.
 *
 * A regex here rather than in the applier, unlike `LookupRunsArgsSchema`'s deliberately loose date
 * strings: there is no `lib/nina/dates.ts` for clock times and nothing downstream can say anything
 * better about `"8:45 pm"` than "that is not HH:mm". One repair round is exactly what it is worth.
 */
export const NINA_REMINDER_TIME_PATTERN = '^([01]\\d|2[0-3]):[0-5]\\d$'

const REMINDER_TIME_RE = new RegExp(NINA_REMINDER_TIME_PATTERN)

/**
 * **A standing daily reminder, created or cancelled** — the nina-natural-reminders set, R1. It rides
 * along on `send` for precisely the reason `memoryWrites` does, and the reason is measured rather
 * than stylistic: `lib/nina/turn.ts:946-954` drops every sibling `tool_use` block when a `send` is
 * present in the same model message, so a standalone `set_reminder` tool would be silently dropped
 * the moment she also answered him — which is every time.
 *
 * ── SHAPE HERE, BUSINESS RULES IN THE APPLIER ────────────────────────────────────────────────
 * This schema checks that `timeOfDay` is an `HH:mm`, that the strings are inside their caps and
 * that `action` is one of the two verbs. It does NOT check that a `create` carries all three of
 * `timeOfDay`/`label`/`message`, or that a `cancel`'s `id` names a real active reminder this user
 * owns — those are `applyReminderWrites`' (`lib/nina/reminders.ts`), for the same reason
 * `replyToMessageId` above is "validated for shape here; the ACTION checks it names a real row this
 * user owns". A shape failure is worth a repair round; a business failure is worth a log line and a
 * reply that already landed.
 */
const NinaReminderWriteSchema = z.object({
  action: z.enum(['create', 'cancel']),
  /** For `cancel`: a `NinaReminder.id`, nanoid(12). Capped generously; the applier does the lookup. */
  id: z.string().trim().min(1).max(24).optional(),
  /** For `create`: `'20:45'`. Jakarta, always — this app has one timezone. */
  timeOfDay: z.string().trim().regex(REMINDER_TIME_RE).optional(),
  /** For `create`: two or three words. 60 is a label; 600 is a message that lost its way. */
  label: z.string().trim().min(1).max(60).optional(),
  /** For `create`: his own reason. Under `MAX_BUBBLE_CHARS`, because she says it back in one. */
  message: z.string().trim().min(1).max(300).optional(),
})

export type NinaReminderWrite = z.infer<typeof NinaReminderWriteSchema>
```

**Then add the field to `NinaSendPayloadSchema`.** It is at `:68-76`; replace it whole:

```ts
export const NinaSendPayloadSchema = z.object({
  bubbles: z.array(z.string().trim().min(1).max(MAX_BUBBLE_CHARS)).min(1).max(MAX_BUBBLES),
  /**
   * Phase 7's field. Validated for shape here; the ACTION checks it names a real row this user
   * owns, because a message id is the one thing in this payload that refers to the database.
   */
  replyToMessageId: z.string().trim().min(1).max(64).optional(),
  memoryWrites: z.array(NinaMemoryWriteSchema).max(MAX_MEMORY_WRITES).optional(),
  /**
   * The nina-natural-reminders set, R1. Parallel to `memoryWrites` in every respect: optional,
   * capped, applied AFTER the bubbles are committed by its own applier
   * (`lib/nina/turnrun.ts`), and never able to fail the reply it rode in on.
   */
  reminders: z.array(NinaReminderWriteSchema).max(MAX_REMINDER_WRITES).optional(),
})
```

**Impact:** `NinaSendPayload` gains `reminders?: NinaReminderWrite[]`. `z.object` strips, so a model
that omits the field is unchanged and a model that invents an extra key inside an entry costs
nothing.

---

### Step 4: the tool schema

**File:** `lib/nina/prompts/tools.ts:123` (after the `memoryWrites` property closes, still inside
`SEND_TOOL.input_schema.properties`)

**Change:** add the `reminders` property. Keep every description TERSE — this file's header records
that one extra clause on one description took the same schema from 5/6 to 2/4 valid on the first
attempt. Five short properties, one line each. The tool's own top-level `description` does NOT
change (it is asserted byte-for-byte in `tests/nina.prompts.test.ts`).

**Code — replace the `memoryWrites` property's closing `},` at `:123` with that same `},` followed
by:**

```ts
      /**
       * R1, the nina-natural-reminders set. **Inline, not a standalone tool**, for the reason
       * `memoryWrites` is inline and one sharper one: `lib/nina/turn.ts:946-954` drops sibling
       * `tool_use` blocks when a `send` is present, so a `set_reminder` tool would be dropped
       * exactly when she also replied — and cost a whole extra round trip when she did not.
       *
       * `timeOfDay`'s `pattern` is the JSON-Schema copy of `NINA_REMINDER_TIME_PATTERN`
       * (`lib/nina/schema.ts`), which is what VALIDATES; the copy exists because this module is a
       * constant with no imports but `type Anthropic`, and `tests/nina.prompts.test.ts` asserts the
       * two are equal so it cannot drift.
       */
      reminders: {
        type: 'array',
        maxItems: 4,
        description:
          'Daily check-ins he asked you to start, or asked you to stop. Omit when he asked for ' +
          'neither.',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['action'],
          description: 'REQUIRED. One reminder to start, or one to stop.',
          properties: {
            action: {
              type: 'string',
              enum: ['create', 'cancel'],
              description: 'REQUIRED. "create" starts a daily check-in; "cancel" stops one.',
            },
            id: {
              type: 'string',
              description: 'For "cancel": the id in memory.slots "reminders". To move one, cancel it and create it again.',
            },
            timeOfDay: {
              type: 'string',
              pattern: '^([01]\\d|2[0-3]):[0-5]\\d$',
              description: 'For "create": the Jakarta time he named, as HH:mm, e.g. "20:45".',
            },
            label: {
              type: 'string',
              description: 'For "create": what it is, two or three words, e.g. "tidur".',
            },
            message: {
              type: 'string',
              description: 'For "create": why HE said it matters. You say this back to him daily.',
            },
          },
        },
      },
```

**Impact:** `tests/nina.prompts.test.ts`'s recursive "every property has a description" walk passes
(every property and the array's `items` carry one). `NINA_TOOLS` is still a constant and still seven
tools under the same names, so the two cases that assert those are unaffected.

---

### Step 5: the prompt version

**File:** `lib/nina/prompts/index.ts:115`

**Change:** a schema edit is a prompt edit — this file's own header rule. Insert the changelog
comment immediately above the constant and change the literal.

**Code — insert after the version-9 comment block (which ends `…constant. */` at `:114`), then
replace the constant line:**

```ts
/* 10 — the nina-natural-reminders set, R1. **A TOOL SCHEMA MOVED, and no system text did.**
 * `./tools.ts` gained `SEND_TOOL.input_schema.properties.reminders`, an OPTIONAL array of
 * create/cancel entries; `./system.ts` gained a sixth `ProactiveTriggerKind` (`'reminder_due'`)
 * and its `PROACTIVE_COPY` / `PROACTIVE_INSTRUCTIONS` entry, neither of which
 * `buildNinaSystemPrompt` renders — so the system prompt is byte-identical to version 9's at every
 * tuning and `tests/__snapshots__/nina.prompts.test.ts.snap` passes UNREGENERATED.
 *
 * What she can now do that she could not before: turn "tolong lo remind gw tiap 8:45 pm buat tidur"
 * into a standing record the evening cron delivers every day, and cancel one by naming its id. A
 * turn whose `send` call could carry a `reminders` array is a turn `nina_turns` has to be able to
 * tell from version 9's, which is the whole job of this constant. This is the SINGLE bump for the
 * set: it is a one-phase set and no other file touches the constant. */
export const NINA_PROMPT_VERSION = 10
```

**Impact:** `tests/nina.prompts.test.ts`'s `NINA_PROMPT_VERSION` block asserts only
`Number.isInteger`, `> 0` and `>= 3`. All hold.

---

### Step 6: the sixth trigger kind and its copy

**File:** `lib/nina/prompts/system.ts:561-562`, `:699-726`, `:750-756`

**Change (a) — the union.** Replace `:554-562` (the docstring and the type):

```ts
/**
 * The SIX reasons she speaks first. Four are RU-15's; `avatar_changed` is RU-17 — a hand-uploaded
 * avatar writes a trigger and she comments on it next time she talks. `reminder_due` is the
 * nina-natural-reminders set's R1, and it is the only one of the six she did not INFER: the runner
 * handed it to her in a chat turn, with a time he chose and a reason he gave.
 *
 * **Phase 10 owns the trigger LOGIC; the text lives here** because it is prompt text and prompt
 * text has one home. Phase 10 picks a key and appends the instruction; it does not write copy.
 *
 * **Two other lists are pinned to this union and neither can import it.** `NINA_PUSH_KINDS`
 * (`lib/push/payload.ts:184`) spells these names by hand because the off-platform image worker loads
 * that module under `node --experimental-strip-types`; `NinaMessageSource`
 * (`lib/db/schema/nina/chat.ts:232`) is a column domain. `npx tsc --noEmit` catches drift in both —
 * at `pushNotifier satisfies ProactiveNotifier` (`lib/push/send.ts:276-293`) and at
 * `insertNinaMessages`' `source: detail.kind` respectively.
 */
export type ProactiveTriggerKind =
  | 'run_committed'
  | 'missed_usual_day'
  | 'pattern_crossed'
  | 'silence'
  | 'avatar_changed'
  | 'reminder_due'
```

**Change (b) — the copy.** `PROACTIVE_COPY` (`:699`) is
`Record<ProactiveTriggerKind, (tuning: NinaTuning) => string>`, so a sixth key is REQUIRED or the
record fails to typecheck. Add it after the `avatar_changed` entry (`:723-725`), before the closing
`}` at `:726`.

It is a **plain function ignoring the tuning**, exactly like `avatar_changed`'s and
`run_committed`'s. No `rungClause`-style parameterisation is warranted: the three parameterised
clauses exist to REPEAL a prohibition that a dial contradicts, and there is no prohibition in this
text for any dial to contradict — the tuning suffix (`proactiveTuningSuffix`) already reaches it and
already adds the `concerned`, `photos`, `horny` and `instructor` lines.

The string MUST contain the literal `opening this conversation` — `tests/nina.prompts.test.ts:493`
asserts it for every entry of the record.

**Code — insert after the `avatar_changed` entry and its trailing comma:**

```ts
  /**
   * R1, the nina-natural-reminders set, and the only trigger whose content the RUNNER wrote. The
   * trigger block carries `label` (what he asked for) and `message` (**why he said it mattered, in
   * his own terms**), and the instruction spends itself on making her use the second one: the user's
   * whole point was sleep CONSISTENCY — regeneration, muscle repair, immunity, the liver — not a
   * bedtime. A generic "wah udah jam segini, tidur gih" is precisely the alarm-clock voice R1
   * exists to avoid, and it is what she writes if nobody tells her the reason is in the payload.
   *
   * Three prohibitions, and each has a failure behind it: announcing the reminder makes her a
   * notification that talks about itself; reading the time back is a number she does not need and
   * `NUMBERS_RULE` would make her copy character-for-character anyway; repeating yesterday's
   * sentence is the thing that turns a friend into a cron job — the same failure the header of
   * `lib/nina/proactive.ts` names as the one that matters most.
   *
   * No tuning clause. Nothing in this text contradicts a dial (unlike `pattern_crossed`'s rung,
   * `missed_usual_day`'s lecture and `silence`'s sulk), so the suffix mechanism is sufficient and
   * this stays a plain function of no arguments — `avatar_changed`'s shape.
   */
  reminder_due: () => `He asked you to check in with him about this every day at this time, and it is that time now. "label" is what he asked for and "message" is the reason HE gave for it. You are opening this conversation.

Say it in your own words, and say it for HIS reason rather than a general one. One bubble. Do not announce that this is a reminder, do not read the time back to him, and do not use the sentence you used yesterday.`,
```

**Change (c) — the default render.** `PROACTIVE_INSTRUCTIONS` (`:750-756`) is
`Record<ProactiveTriggerKind, string>`; add the sixth line before the closing `}`:

```ts
  reminder_due: PROACTIVE_COPY.reminder_due(NINA_TUNING_DEFAULTS),
```

Also update the record's docstring at `:746-749`: "The five trigger texts at the default tuning" ->
"The six trigger texts at the default tuning", and `:696`'s "The five trigger texts as functions of
the tuning" -> "The six trigger texts …".

**Impact:** `buildNinaSystemPrompt` is untouched, so the four-render snapshot passes unregenerated.
`buildProactiveInstruction('reminder_due', tuning)` composes the copy plus the same tuning suffix
every other trigger gets, so `tests/nina.prompts.test.ts`'s "appends the concerned suffix to ALL
FIVE" and "opens proactively as a coach, on all five triggers" cases (both of which iterate
`Object.keys(PROACTIVE_INSTRUCTIONS)`) cover the sixth automatically and keep passing.

---

### Step 7: the pure reminders module

**File:** `lib/nina/reminders.ts` — **NEW**

**Change:** the whole decision layer. No `server-only`, no database import, no `new Date()`. Every
input is a plain object and the clock, today's date and the id generator are all parameters —
`lib/nina/promise.ts`'s design, for the same reason: `vitest` runs `environment: 'node'` and this is
where every edge case lives.

**On the naming, stated so the next reader is not surprised:** the promise mechanism spells the pure
half `promise.ts` and the impure half `promises.ts`. This set uses the plural for the PURE half
(`reminders.ts`, named by the plan index and the analysis's Impact Points) and `reminderstore.ts`
for the impure shell. The split is identical; only the spelling differs.

**Code — the complete file:**

```ts
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
```

**Impact:** nothing imports it yet; Steps 8, 10 and 12 wire it.

---

### Step 8: the impure shell

**File:** `lib/nina/reminderstore.ts` — **NEW**

**Change:** the three database-touching operations, each of which never throws. `lib/nina/promises.ts`
is the precedent for the read/write pair and for carrying the row's own `source` back through.

**Code — the complete file:**

```ts
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
```

**Impact:** `markNinaReminderFired` is allowed to throw (it is called inside `emitProactiveMessage`'s
existing marker `try`, which already logs and swallows). `applyNinaReminderWrites` swallows its own,
because `turnrun.ts`'s enclosing `catch` would otherwise log a SUCCESSFUL turn as failed.

---

### Step 9: verify context visibility — NO CHANGE to `lib/nina/context.ts`

**File:** `lib/nina/context.ts` — **read and verified; no edit.**

**What was verified, with the citations, because the analysis listed this as "verify + likely
touch":**

1. `loadNinaContext` (`lib/nina/load.ts:162`) calls `gateway.readMemorySlots(userId)`, which is
   `getNinaMemorySlots` (`lib/nina/queries/memory.ts:56`) — a bare
   `SELECT … FROM nina_memory_slots WHERE user_id = $1 ORDER BY key`. **There is no vocabulary
   filter anywhere on that path.**
2. `renderSlotValue` (`lib/nina/queries/memory.ts:45`) returns a bare string as itself and
   `JSON.stringify`s anything structured — which is exactly how `pending_promises` already reaches
   the prompt, and its own docstring says so: *"a structured slot in a prompt should look like data,
   because it IS data"*.
3. `MemorySlotInput.key` and `MemorySlotFact.key` (`lib/nina/context.ts:209,225`) are bare `string`,
   and `memoryFacts` (`:667-677`) maps EVERY input slot through with no filter.
4. `buildContextGuide` (`lib/nina/prompts/system.ts:263`) already tells her what `memory.slots` is:
   *"standing facts about him that you upserted. This is what makes you proactive"*.

So the `reminders` slot appears in her per-turn context automatically, as
`memory.slots[key="reminders"].value = '{"reminders":[{"id":"…","timeOfDay":"20:45",…}]}'` — ids
included, which is what she needs to emit a `cancel`, and status included, which is what stops her
creating a duplicate for something already set up. `MAX_ACTIVE_REMINDERS` + `MAX_CANCELLED_KEPT`
bound what that string can grow to.

**And this is also why `buildContextGuide` must NOT gain a paragraph about it:**
`tests/__snapshots__/nina.prompts.test.ts.snap` pins four complete system prompts and
`tests/nina.prompts.test.ts` states in as many words that regenerating it *"is how the invariant gets
lost"*. The teaching the model needs is on `SEND_TOOL.reminders.items.properties.id`'s description
(Step 4) — *"the id in memory.slots \"reminders\""* — which is prompt text in the one place this
package's own measurement says descriptions are the lever.

**Impact:** none — this step is a verification, recorded so the next reader does not re-derive it.

---

### Step 10: the proactive engine

**File:** `lib/nina/proactive.ts`

**Change (a) — imports.** At `:12-26`, add to the existing import block:

```ts
import { NINA_SLOT_REMINDERS, type NinaReminder } from '@/lib/db/schema'
```

(placed with the other `@/` imports at the top, after `@/lib/db`-free lines — alphabetically it goes
directly after the `@/lib/date/ranges` import at `:4`), and among the relative imports:

```ts
import { activeReminders, dueReminder } from './reminders'
import { markNinaReminderFired, readNinaReminders } from './reminderstore'
```

`NINA_SLOT_REMINDERS` is imported for the docstring's sake and for `readNinaReminders`' key to be
named at the one call site; if the linter objects to an unused value import, drop
`NINA_SLOT_REMINDERS` and keep only `type NinaReminder` — `readNinaReminders` already names the key
internally.

**Change (b) — the priority list.** Replace `:72-80`:

```ts
const PROACTIVE_PRIORITY: readonly ProactiveTriggerKind[] = [
  /* FIRST, and it is the only entry in this list the runner WROTE. The other five are things she
   * infers about him; a reminder is a standing instruction he handed her ("tolong lo remind gw tiap
   * 8:45 pm buat tidur na"). Losing his own explicit ask to an inferred nag, in a mechanism that
   * emits exactly one message per tick, is the one failure of this list a user would actually
   * notice and be upset by. */
  'reminder_due',
  'avatar_changed',
  'pattern_crossed',
  'missed_usual_day',
  'silence',
  /* `run_committed` is never a cron candidate — it fires from `after()` at the moment of the
   * commit, so it is listed for completeness of the union and never reached by `decideProactive`. */
  'run_committed',
]
```

**Change (c) — the facts.** Replace `ProactiveFacts` (`:133-147`) whole:

```ts
export interface ProactiveFacts {
  /** Jakarta calendar day, from `todayInJakarta()`. Never the server's local day. */
  todayISO: DateISO
  /** 0–23, Jakarta wall clock. */
  jakartaHour: number
  /**
   * Jakarta wall clock to the MINUTE, zero-padded `'HH:mm'` — `jakartaMinuteClockOf(now)`. Only
   * `reminder_due` reads it, and it is the one fact in this object that nothing in the app could
   * compute before: `jakartaHourOf` stops at the hour and `todayInJakarta` at the day.
   */
  nowHHmm: string
  /** Parsed from phase 5's `running_days` slot. Empty disables trigger 2 rather than guessing. */
  runningDays: readonly Weekday[]
  hasRunToday: boolean
  lastRunOn: DateISO | null
  /** `null` when he has never sent a message — a fresh account is not a silent one. */
  daysSinceRunnerSpoke: number | null
  patterns: readonly ProactivePattern[]
  nags: readonly TriggerMarker[]
  unannouncedAvatarId: string | null
  /**
   * The ACTIVE entries of the `reminders` slot, earliest `timeOfDay` first (`activeReminders`).
   * `[]` for every user who has never asked for one, which is every user until he does.
   */
  reminders: readonly NinaReminder[]
}
```

**Change (d) — the detail variant.** Insert before `export type ProactiveDetail` (`:192`):

```ts
interface ReminderDueDetail {
  kind: 'reminder_due'
  /** `NinaReminder.id` — what `markNinaReminderFired` stamps once the rows are committed. */
  reminderId: string
  timeOfDay: string
  label: string
  /** HIS reason, verbatim off the record. `PROACTIVE_COPY.reminder_due` spends itself on this. */
  message: string
}
```

and replace the union (`:192-197`):

```ts
export type ProactiveDetail =
  | RunCommittedDetail
  | MissedUsualDayDetail
  | PatternCrossedDetail
  | SilenceDetail
  | AvatarChangedDetail
  | ReminderDueDetail
```

**Change (e) — the minute helper.** Insert after `jakartaHourOf` (`:216`) and before the
`jakartaWeekdayOf` docstring (`:218`):

```ts
/**
 * The Jakarta wall clock of an instant, as a zero-padded `'HH:mm'`.
 *
 * **Nothing in this app reached the minute before this.** `jakartaHourOf` above stops at the hour
 * (18 vs 23 is all the evening window ever needed) and `todayInJakarta` stops at the day. A
 * reminder needs "is it at or past 20:45 yet", and the answer has to be comparable without a
 * parser — which is what the zero padding buys: `'09:05' < '20:45'` is true as characters and as
 * clock times, for every pair of valid values.
 *
 * Plain arithmetic rather than `Intl`, for `jakartaHourOf`'s own reason: UTC+7 is fixed for all
 * time. It is sited here rather than in `lib/date/ranges.ts` because that module owns the DATE
 * decision and spends it exactly once; this is the same hour arithmetic `jakartaHourOf` already
 * does for the same one caller, carried one digit further. `lib/nina/context.ts` has a private
 * `jakartaClockOf` that renders the same string through `Intl` for `NowFacts.clock` — a rendered
 * value for a prompt, not a comparable one for a guard, and parsing it back here would be the
 * worse of the two (the note on `jakartaHourOf` makes the identical argument).
 */
export function jakartaMinuteClockOf(instant: Date): string {
  const total =
    (instant.getUTCHours() * 60 + instant.getUTCMinutes() + JAKARTA_UTC_OFFSET_HOURS * 60) % 1440
  const hours = Math.floor(total / 60)
  const minutes = total % 60
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}
```

**Change (f) — the sixth evaluator.** Insert after `evaluateSilence` closes (`:369`) and before the
`decideProactive` docstring (`:371`):

```ts
/**
 * **R1, the sixth trigger, and the only one the RUNNER wrote.** Every guard lives in
 * `dueReminder` (`./reminders.ts`) so that all of it is testable with no clock and no database;
 * this function is the adapter between `ProactiveFacts` and that pure decision.
 *
 * `facts.reminders` is already the ACTIVE set, earliest first, so a fired decision names the
 * earliest reminder whose time has arrived and which has not already gone out today. The
 * single-message-per-tick rule is not bypassed for reminders: a second one due on the same tick
 * waits for tomorrow, which is the plan's stated Out of scope rather than an oversight.
 */
export function evaluateReminderDue(facts: ProactiveFacts): ProactiveDecision {
  const due = dueReminder({
    reminders: facts.reminders,
    todayISO: facts.todayISO,
    nowHHmm: facts.nowHHmm,
  })
  if (!due) return NO('no reminder is due, or today’s has already gone out')

  return {
    fire: true,
    detail: {
      kind: 'reminder_due',
      reminderId: due.id,
      timeOfDay: due.timeOfDay,
      label: due.label,
      message: due.message,
    },
  }
}
```

**Change (g) — the evaluator map.** Replace `:377-384` (inside `decideProactive`):

```ts
  const evaluators: Partial<
    Record<ProactiveTriggerKind, (f: ProactiveFacts) => ProactiveDecision>
  > = {
    reminder_due: evaluateReminderDue,
    avatar_changed: evaluateAvatarChanged,
    pattern_crossed: evaluatePatternCrossed,
    missed_usual_day: evaluateMissedUsualDay,
    silence: evaluateSilence,
  }
```

**Change (h) — `markerFor`.** Replace its `switch` (`:414-424`):

```ts
  switch (detail.kind) {
    case 'missed_usual_day':
      return bump(MISSED_DAY_MARKER_CODE)
    case 'silence':
      return bump(SILENCE_MARKER_CODE)
    case 'pattern_crossed':
      return detail.marker
    case 'avatar_changed':
    case 'run_committed':
    /* `reminder_due`'s marker is the reminder's own `lastFiredOn`, written by
     * `markNinaReminderFired` in `emitProactiveMessage` below — NOT a `nina_nags` row. A reminder
     * has no escalation rung and no shared code, and its identity (time, label, his reason) has no
     * home in that table. */
    case 'reminder_due':
      return null
  }
```

**Change (i) — `triggerBlock`.** Insert a case in the `switch` (after `avatar_changed`'s at `:468`):

```ts
      case 'reminder_due':
        return {
          kind: detail.kind,
          timeOfDay: detail.timeOfDay,
          label: detail.label,
          message: detail.message,
        }
```

Note `reminderId` is deliberately NOT in the block: it is a database id, she has no use for it in a
sentence, and `PROACTIVE_COPY.reminder_due` refers only to `label` and `message`.

**Change (j) — `loadProactiveFacts`.** Replace `:539-566` (the reads and the return):

```ts
  const [nagRows, avatar, reminderSlot] = await Promise.all([
    getNinaNags(userId),
    getUnannouncedCurrentNinaAvatar(userId),
    /* One primary-key lookup on `(user_id, key)`, the same cost class as `getNinaNags` above. It is
     * read HERE rather than off `context.memory.slots` because that path renders every value to a
     * display STRING (`renderSlotValue`), and parsing a `JSON.stringify`'d list back out of a
     * prompt field to decide whether to send a message would be the worse of the two. */
    readNinaReminders(userId),
  ])

  const runningDaysSlot = context.memory.slots.find(
    (slot) => slot.key === RUNNING_DAYS_SLOT_KEY,
  )?.value

  return {
    todayISO,
    jakartaHour: jakartaHourOf(now),
    nowHHmm: jakartaMinuteClockOf(now),
    runningDays: parseRunningDays(runningDaysSlot),
    hasRunToday: context.recentRuns.some((run) => run.dateISO === todayISO),
    lastRunOn: context.recentRuns[0]?.dateISO ?? null,
    daysSinceRunnerSpoke: context.conversation.daysSinceRunnerSpoke,
    patterns: context.patterns.map((pattern) => ({
      code: pattern.code,
      value: pattern.value,
      nagLevel: pattern.nagLevel,
    })),
    nags: nagRows.map((row) => ({
      code: row.code,
      level: row.level,
      lastMentionedOn: row.lastMentionedOn,
    })),
    unannouncedAvatarId: avatar?.id ?? null,
    reminders: activeReminders(reminderSlot.slot),
  }
```

**Change (k) — the marker write.** Replace the marker `try` block (`:688-707`):

```ts
  /* The marker, in its own try: a written message with a missing marker repeats at worst once,
   * while throwing here would report nothing emitted when something was. */
  try {
    if (detail.kind === 'avatar_changed') {
      await markNinaAvatarAnnounced(userId, detail.avatarId, now())
    } else if (detail.kind === 'reminder_due') {
      /* R1. The marker is the reminder's own `lastFiredOn` and it is stamped HERE — after the
       * bubbles are committed at `:664` and before the notify below — which is the same ordering
       * every other trigger gets and for the same reason: marking first would spend the day's
       * reminder on a model call that failed, and she would silently skip a night. */
      await markNinaReminderFired(userId, detail.reminderId, facts.todayISO)
    } else {
      const marker = markerFor(detail, facts)
      if (marker) {
        await upsertNinaNag(userId, {
          code: marker.code,
          level: marker.level,
          lastMentionedOn: marker.lastMentionedOn,
        })
      }
    }
  } catch (cause) {
    console.warn('[nina proactive] marker write failed', {
      userId,
      kind: detail.kind,
      error: String(cause),
    })
  }
```

**Change (l) — the module header.** Update the count and add the marker row. In the banner at
`:28-65`: "Five reasons Nina opens a conversation" -> "Six reasons Nina opens a conversation (five
she infers, one he asked for)", and add to the marker table after the `avatar_changed` line:

```
 *   reminder_due      the reminder's own `lastFiredOn` in the `reminders` memory slot — NOT a nag
```

and, in the `AT MOST ONE PROACTIVE MESSAGE` paragraph, prepend to the ordering sentence: "the
reminder first, because it is the only one of the six he explicitly asked for; then the avatar…".

**Impact:** `decideProactive` now evaluates six candidates and still returns at most one. Every
existing evaluator is untouched.

---

### Step 11: the push kind

**File:** `lib/push/payload.ts:192`

**Change:** `NINA_PUSH_KINDS` is a hand-spelled mirror of `ProactiveTriggerKind` (it cannot import
`lib/nina/*` — the off-platform worker loads this module through a relative specifier under
`node --experimental-strip-types`). Without this line `npx tsc --noEmit` fails at
`pushNotifier satisfies ProactiveNotifier` (`lib/push/send.ts:276-293`).

**Code — replace the first group (`:185-192`):**

```ts
  /* `ProactiveTriggerKind` verbatim (lib/nina/prompts/system.ts:561). She opened the conversation;
   * `emitProactiveMessage` passes `detail.kind` straight through, so these ARE the trigger names
   * and renaming one here would change what a push says it is without changing what sends it. */
  'run_committed',
  'missed_usual_day',
  'pattern_crossed',
  'silence',
  'avatar_changed',
  /** The sixth trigger (nina-natural-reminders, R1) — a standing daily check-in he asked her for. */
  'reminder_due',
```

and change `:178`'s sentence *"The first five entries are that union spelled out by hand"* to *"The
first six entries are that union spelled out by hand"*.

**`buildNinaPushPayload` needs NO case, and that is verified rather than assumed.** Reading
`:326-371`: `title` is the constant `PUSH_TITLE` (`'Nina'`), `body` is
`truncateForNotification(first.body)` — the first non-blank bubble — and `url` is
`input.url ?? ninaBubbleUrl(input.sessionId, first.id)`. **There is no `switch` on `kind` anywhere in
the function**; `kind` is copied onto the payload verbatim as diagnostics (`:369`, and the field's
own docstring says it is "an opaque string"). `emitProactiveMessage` calls
`notify(userId, bubbles, detail.kind, sessionId)` with no `url`, so a `reminder_due` push gets the
same `/nina?s=…&jump=…` deep link the other five triggers get — which is correct: it is a bubble in
a conversation. The analysis's open question on this point is closed.

---

### Step 12: apply the model's reminder writes after the reply lands

**File:** `lib/nina/turnrun.ts:30` (import) and `:622` (the call site)

**Change (a) — imports.** At `:30`, replace:

```ts
import type { NinaMemoryWrite } from './schema'
```

with:

```ts
import { applyNinaReminderWrites } from './reminderstore'
import type { NinaMemoryWrite } from './schema'
```

and add to the existing `@/lib/*` group at the top (after `:4`):

```ts
import { todayInJakarta } from '@/lib/date/ranges'
```

**Change (b) — the call.** Insert immediately after the push block closes (the `}` at `:622`) and
before the `STEP 6 — the distillation` comment at `:624`:

```ts
    /*
     * ── R1: THE REMINDERS. A standing daily check-in he asked for in this turn. ──────────────────
     *
     * **Its own call with its own `try`, and deliberately NOT routed through
     * `runNinaDistillation`.** That pipeline's contract is `lib/nina/memory.ts`'s `slot`/`fact`
     * STRING vocabulary (`planMemoryWrites`, `NINA_SLOT_SPECS`), and a reminder is a structured
     * record with a time, a label and his reason — the same argument
     * `NINA_SLOT_SPECS.pending_promises.canonicalise` makes by refusing a string outright.
     *
     * **Position:** after the bubbles are committed and the push has gone out, before the
     * distillation. She has already told him she will remind him; persisting it is what makes that
     * true, and it must not sit behind a 10-20 s second model call. `applyNinaReminderWrites` is a
     * primary-key read plus at most one upsert.
     *
     * **It never throws** (the function swallows and logs its own failures), so the enclosing
     * `catch` at `:653` can never record a turn that SUCCEEDED as 'crashed' because a memory slot
     * would not write. `turnrun.ts`'s push block twenty lines up makes the same trade in the same
     * words.
     */
    await applyNinaReminderWrites(userId, result.payload.reminders ?? [], {
      todayISO: todayInJakarta(),
      sourceMessageId: runnerMessageId,
    })
```

**Impact:** an ordinary turn (no `reminders` field) short-circuits inside
`applyNinaReminderWrites` on `writes.length === 0` and costs one function call and no query.

---

### Step 13: move the cron schedule

**File:** `vercel.json:15-18`

**Change:** `/api/cron/nina` moves from `"0 12 * * *"` (19:00 WIB) to `"0 13 * * *"` (20:00 WIB), so
the Hobby plan's "within the hour" firing window becomes ~20:00–21:00 WIB and brackets the 20:45
reminder. Still exactly two `crons` entries; the rollup is untouched.

**Code — the complete file after the change:**

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "regions": ["sin1"],
  "git": {
    "deploymentEnabled": {
      "main": true,
      "*": false
    }
  },
  "crons": [
    {
      "path": "/api/cron/rollup",
      "schedule": "0 20 * * *"
    },
    {
      "path": "/api/cron/nina",
      "schedule": "0 13 * * *"
    }
  ]
}
```

**Impact on the four pre-existing evening triggers: none.** `MISSED_DAY_EVENING_HOUR = 18` and
`MISSED_DAY_LATEST_HOUR = 23` (`lib/nina/proactive.ts:95-96`) admit 20:00–21:00 exactly as they
admit 19:00–20:00; the guard is a window, not an hour. Those four simply fire an hour later.

---

### Step 14: update the cron route's header comment

**File:** `app/api/cron/nina/route.ts:15-30`

**Change:** the header documents `"0 12 * * *"` / 19:00 WIB by name, and ties
`MISSED_DAY_EVENING_HOUR = 18` to the 19:00–20:00 window. Left as-is it becomes a stale claim about a
schedule the file no longer has. Rewritten precisely — the arithmetic, the rollover argument and the
Hobby-plan paragraph all have to move together.

**Code — replace lines 15-30 (from `── WHY 19:00 ASIA/JAKARTA …` through `…time-of-day logic at
all.`) with:**

```ts
 * ── WHY 20:00 ASIA/JAKARTA, AND HOW THE SCHEDULE SPELLS IT ──────────────────────────────────────
 * Vercel cron `schedule` strings are UTC, always, regardless of `regions`. Asia/Jakarta is UTC+7
 * with no DST, ever. 20:00 WIB is therefore `"0 13 * * *"`, and because 13 + 7 = 20 < 24 the
 * Jakarta calendar day at cron time is the same date as the UTC date — no rollover, unlike
 * `/api/cron/rollup`'s `"0 20 * * *"`, which lands at 03:00 WIB the *following* day. That is why
 * copying the rollup's schedule would have been wrong here, and why the two jobs are seven hours
 * apart on the clock and never contend for the same connection pool or z.ai rate window.
 * `todayInJakarta()` is still the only thing asked what day it is; nothing here does its own
 * offset arithmetic on a date.
 *
 * **It was `"0 12 * * *"` (19:00 WIB) until the nina-natural-reminders set moved it**, and the move
 * is the whole of that feature's scheduling: the Hobby plan allows two cron jobs in the account
 * (exactly `rollup` + `nina`) and fires each one WITHIN THE HOUR of its declared time rather than
 * at the minute. The runner asked to be reminded at 20:45 WIB, which the old 19:00–20:00 window
 * could never reach on the same evening. The new real window is ~20:00–21:00 WIB, which brackets
 * it. A reminder set for a MORNING hour is still not reachable on this plan — the due check is
 * built generically and simply will not fire until the evening pass; that limitation is recorded
 * rather than papered over, because the alternative is a third cron job this plan is not
 * authorised to add.
 *
 * `MISSED_DAY_EVENING_HOUR` is 18 and `MISSED_DAY_LATEST_HOUR` is 23, and NEITHER MOVED WITH THE
 * SCHEDULE: they are an admission WINDOW, not an exact hour, and 20:00–21:00 sits inside it exactly
 * as 19:00–20:00 did. The four pre-existing evening triggers are unaffected beyond firing about an
 * hour later than they used to. Both constants live in `lib/nina/proactive.ts` precisely so this
 * route contains no time-of-day logic at all.
 *
 * ── AT MOST ONE MESSAGE PER USER PER INVOCATION ─────────────────────────────────────────────────
 * `evaluateAndEmitForUser` resolves the FIVE cron candidates by priority and emits one — the
 * reminder first (it is the only one the runner explicitly asked for), then the avatar, the
 * pattern, the missed day and the silence. Two proactive openers in one evening is not twice as
 * proactive, it is spam.
```

(the existing `── AT MOST ONE MESSAGE PER USER PER INVOCATION ──` block at `:32-34` is REPLACED by
the last paragraph above, so it is not duplicated — the remaining blocks `── IT IS ALSO THE NUDGE
ENDPOINT ──` and `── SEQUENTIAL …──` are untouched.)

Also update `:8`: *"Triggers 2–5 of RU-15/RU-17"* -> *"Triggers 2–5 of RU-15/RU-17 plus
`reminder_due` (nina-natural-reminders R1)"*.

**Impact:** comment only; `tests/nina.cron.test.ts` mocks `evaluateAndEmitForUser` and
`resolveNinaPromises` and asserts the `CRON_SECRET` guard, the failure isolation and the budget —
none of which this touches.

---

### Step 15: the new pure-module test

**File:** `tests/nina.reminders.test.ts` — **NEW**

**Change:** the whole surface of `lib/nina/reminders.ts`, as plain objects with no database and no
model — `tests/nina.nags.test.ts`'s conventions.

**Code — the complete file:**

```ts
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
```

---

### Step 16: extend the proactive test

**File:** `tests/nina.proactive.test.ts`

**Change (a) — imports.** Add to the `@/lib/nina/proactive` import block (`:3-22`), in alphabetical
position: `evaluateReminderDue`, `jakartaMinuteClockOf`. Add a new import line above it:

```ts
import type { NinaReminder } from '@/lib/db/schema'
```

**Change (b) — the fixture.** Replace `facts()` (`:40-53`) so the two new required fields have
defaults that keep every existing case's behaviour unchanged (no reminders, so the new highest-
priority trigger never fires unless a case asks for it):

```ts
function facts(overrides: Partial<ProactiveFacts> = {}): ProactiveFacts {
  return {
    todayISO: TUESDAY,
    jakartaHour: 19,
    /* The sixth trigger's clock. 19:30 agrees with `jakartaHour: 19` above, and `reminders: []`
     * means `reminder_due` never fires for a case that did not ask for it — which is what keeps
     * every pre-existing case in this file asserting exactly what it asserted before. */
    nowHHmm: '19:30',
    runningDays: [2],
    hasRunToday: false,
    lastRunOn: '2026-08-31',
    daysSinceRunnerSpoke: 0,
    patterns: [],
    nags: [],
    unannouncedAvatarId: null,
    reminders: [],
    ...overrides,
  }
}

/** One active reminder, for the sixth trigger's cases. */
function reminderFact(overrides: Partial<NinaReminder> = {}): NinaReminder {
  return {
    id: 'rem_sleep_01',
    timeOfDay: '18:45',
    label: 'tidur',
    message: 'konsistensi tidur — regenerasi sel dan liver',
    createdOn: '2026-08-31',
    status: 'active',
    lastFiredOn: null,
    cancelledOn: null,
    sourceMessageId: null,
    ...overrides,
  }
}
```

**Change (c) — the minute helper's case.** Add to the `describe('the two timezone helpers')` block
(rename it to `'the three timezone helpers'`), after the `jakartaHourOf` case at `:104`:

```ts
  it('converts an instant to the Jakarta wall clock, to the minute and zero-padded', () => {
    // The new cron's own instant: "0 13 * * *" UTC is 20:00 WIB on the SAME calendar day.
    expect(jakartaMinuteClockOf(new Date('2026-09-01T13:00:00Z'))).toBe('20:00')
    // The minute is what the hour helper could not reach, and the padding is what makes '<=' work.
    expect(jakartaMinuteClockOf(new Date('2026-09-01T13:45:00Z'))).toBe('20:45')
    expect(jakartaMinuteClockOf(new Date('2026-09-01T02:05:00Z'))).toBe('09:05')
    // And it wraps, the way the hour helper does: 20:00 UTC is 03:00 WIB the NEXT day.
    expect(jakartaMinuteClockOf(new Date('2026-09-01T20:30:00Z'))).toBe('03:30')
  })
```

**Change (d) — the evaluator's cases.** Insert a new `describe` after the `evaluatePatternCrossed`
block (`:254`) and before `describe('decideProactive …')`:

```ts
describe('evaluateReminderDue — R1, the one trigger the runner wrote', () => {
  it('fires at its time and not again the same day', () => {
    const due = facts({ reminders: [reminderFact()], nowHHmm: '18:45' })
    const decision = evaluateReminderDue(due)
    expect(decision.fire).toBe(true)
    if (!decision.fire || decision.detail.kind !== 'reminder_due') throw new Error('expected')
    expect(decision.detail.reminderId).toBe('rem_sleep_01')
    // His reason travels on the detail, because PROACTIVE_COPY.reminder_due is about using it.
    expect(decision.detail.message).toContain('liver')

    const already = facts({
      reminders: [reminderFact({ lastFiredOn: TUESDAY })],
      nowHHmm: '22:00',
    })
    expect(evaluateReminderDue(already).fire).toBe(false)
  })

  it('says nothing before the reminder’s own time', () => {
    expect(evaluateReminderDue(facts({ reminders: [reminderFact()], nowHHmm: '18:44' })).fire).toBe(
      false,
    )
  })

  it('says nothing for a user who never asked for one', () => {
    expect(evaluateReminderDue(facts()).fire).toBe(false)
  })
})
```

**Change (e) — the priority.** Replace the two `decideProactive` cases at `:257-299`:

```ts
  it('returns the reminder when everything is true at once', () => {
    const everything = facts({
      reminders: [reminderFact()],
      nowHHmm: '19:30',
      unannouncedAvatarId: 'avatar_1',
      patterns: [{ code: 'ACWR_SPIKE', value: '150%', nagLevel: 0 }],
      lastRunOn: '2026-08-01',
      daysSinceRunnerSpoke: 30,
    })
    // All five cron evaluators fire on these facts…
    expect(evaluateReminderDue(everything).fire).toBe(true)
    expect(evaluateAvatarChanged(everything).fire).toBe(true)
    expect(evaluatePatternCrossed(everything).fire).toBe(true)
    expect(evaluateMissedUsualDay(everything).fire).toBe(true)
    expect(evaluateSilence(everything).fire).toBe(true)

    // …and exactly one message comes out: the one he explicitly asked her for. Losing HIS standing
    // request to something she merely inferred is the failure this ordering exists to prevent.
    const decision = decideProactive(everything)
    if (!decision.fire) throw new Error('expected a decision')
    expect(decision.detail.kind).toBe('reminder_due')
  })

  it('falls down the priority list as each candidate is exhausted', () => {
    const base = facts({
      reminders: [reminderFact()],
      nowHHmm: '19:30',
      unannouncedAvatarId: 'avatar_1',
      patterns: [{ code: 'ACWR_SPIKE', value: '150%', nagLevel: 0 }],
      lastRunOn: '2026-08-01',
      daysSinceRunnerSpoke: 30,
    })
    const kindOf = (f: ProactiveFacts) => {
      const d = decideProactive(f)
      return d.fire ? d.detail.kind : null
    }

    expect(kindOf(base)).toBe('reminder_due')
    expect(kindOf({ ...base, reminders: [] })).toBe('avatar_changed')
    expect(kindOf({ ...base, reminders: [], unannouncedAvatarId: null })).toBe('pattern_crossed')
    expect(
      kindOf({ ...base, reminders: [], unannouncedAvatarId: null, patterns: [] }),
    ).toBe('missed_usual_day')
    expect(
      kindOf({
        ...base,
        reminders: [],
        unannouncedAvatarId: null,
        patterns: [],
        runningDays: [],
      }),
    ).toBe('silence')
    expect(
      kindOf({
        ...base,
        reminders: [],
        unannouncedAvatarId: null,
        patterns: [],
        runningDays: [],
        daysSinceRunnerSpoke: 0,
        lastRunOn: TUESDAY,
      }),
    ).toBe(null)
  })
```

and add `expect(decision.reason).toContain('reminder_due')` to the "explains itself" case at `:307`.

**Change (f) — `markerFor` and `triggerBlock`.** Add to the `markerFor` "no nag row" case (`:314`):

```ts
    expect(
      markerFor(
        {
          kind: 'reminder_due',
          reminderId: 'rem_sleep_01',
          timeOfDay: '20:45',
          label: 'tidur',
          message: 'why',
        },
        f,
      ),
    ).toBeNull()
```

and a new case in the `triggerBlock` block:

```ts
  it('hands the reminder’s label and HIS reason to the prompt, and not its database id', () => {
    const block = triggerBlock({
      kind: 'reminder_due',
      reminderId: 'rem_sleep_01',
      timeOfDay: '20:45',
      label: 'tidur',
      message: 'konsistensi tidur — regenerasi sel dan liver',
    })
    const body = JSON.parse(block.slice('TRIGGER\n'.length))
    expect(body.label).toBe('tidur')
    expect(body.message).toContain('liver')
    // A row id is not something she has any use for in a sentence.
    expect(JSON.stringify(body)).not.toContain('rem_sleep_01')
  })
```

---

### Step 17: extend the parity tests

**File (a):** `tests/nina.prompts.test.ts:483-490`

Replace the key list:

```ts
  it("covers all four RU-15 triggers, RU-17's avatar change, and R1's reminder", () => {
    expect(Object.keys(PROACTIVE_INSTRUCTIONS).sort()).toEqual([
      'avatar_changed',
      'missed_usual_day',
      'pattern_crossed',
      'reminder_due',
      'run_committed',
      'silence',
    ])
  })
```

The neighbouring cases ("tells her in every case that she is opening the conversation", "appends
nothing at the default tuning", "appends the concerned suffix") all iterate the record and need no
edit — they now cover six.

Add a new case in the `describe('the tool schemas')` block, after the bubbles-cap case:

```ts
  /*
   * `SEND_TOOL.reminders.items.properties.timeOfDay.pattern` is a hand-written copy of
   * `NINA_REMINDER_TIME_PATTERN` (`lib/nina/schema.ts`), which is what VALIDATES — `prompts/tools.ts`
   * is a constant with no imports but `type Anthropic` on purpose. Same argument, and same pin, as
   * `aggregate_runs`' enums above.
   */
  it('keeps the reminder clock pattern equal to the Zod pattern that validates it', () => {
    const items = (
      SEND_TOOL.input_schema as unknown as {
        properties: Record<string, { items?: { properties?: Record<string, { pattern?: string; enum?: readonly string[] }> } }>
      }
    ).properties.reminders!.items!
    expect(items.properties!.timeOfDay!.pattern).toBe(NINA_REMINDER_TIME_PATTERN)
    expect(items.properties!.action!.enum).toEqual(['create', 'cancel'])
  })
```

and add `NINA_REMINDER_TIME_PATTERN` to the `@/lib/nina/schema` import block at `:34-38`.

**File (b):** `lib/push/payload.test.ts:264-270`

The `TRIGGER_KINDS` map is `Record<ProactiveTriggerKind, NinaPushKind>` and is **exhaustive in both
directions at compile time** — a sixth trigger missing here is a missing property and `npx tsc
--noEmit` fails. Replace:

```ts
  const TRIGGER_KINDS: Record<ProactiveTriggerKind, NinaPushKind> = {
    run_committed: 'run_committed',
    missed_usual_day: 'missed_usual_day',
    pattern_crossed: 'pattern_crossed',
    silence: 'silence',
    avatar_changed: 'avatar_changed',
    reminder_due: 'reminder_due',
  }
```

The case below it (`Object.values(TRIGGER_KINDS)).toEqual(Object.keys(TRIGGER_KINDS)` plus the
`NINA_PUSH_KINDS` containment loop) then covers the sixth automatically.

**File (c):** `tests/db.schema.nina.test.ts:227-230`

```ts
  it('slot values are jsonb, so one column holds a phrase, pending_promises and reminders alike', () => {
    expect(sqlType(schema.ninaMemorySlots, 'value')).toBe('jsonb')
    expect(schema.NINA_SLOT_PENDING_PROMISES).toBe('pending_promises')
    /* The nina-natural-reminders set's key. Declared beside the promise key and for the same
     * reason — a STRUCTURED slot value whose evaluator has to name the key — and deliberately NOT
     * a member of `NINA_SLOT_KEYS`, which is the distiller's closed prose vocabulary. */
    expect(schema.NINA_SLOT_REMINDERS).toBe('reminders')
    expect(schema.NINA_SLOT_REMINDERS).not.toBe(schema.NINA_SLOT_PENDING_PROMISES)
  })
```

---

## Verification

**Typecheck:** `npx tsc --noEmit`

This is the load-bearing gate for this phase, because four of the changes are pinned by the type
system rather than by a test:
- `ProactiveTriggerKind` -> `NINA_PUSH_KINDS` at `pushNotifier satisfies ProactiveNotifier`
  (`lib/push/send.ts:276-293`);
- `ProactiveTriggerKind` -> `NinaMessageSource` at `insertNinaMessages`' `source: detail.kind`
  (`lib/nina/proactive.ts:667`);
- `PROACTIVE_COPY` / `PROACTIVE_INSTRUCTIONS` are total `Record<ProactiveTriggerKind, …>`;
- `TRIGGER_KINDS` in `lib/push/payload.test.ts` is exhaustive in both directions.

**Tests:** `npx vitest run`

Targeted first, then the sweep:

```
npx vitest run tests/nina.reminders.test.ts tests/nina.proactive.test.ts tests/nina.prompts.test.ts lib/push/payload.test.ts tests/db.schema.nina.test.ts tests/nina.cron.test.ts
npx vitest run
```

**Manual check:**
1. `tests/__snapshots__/nina.prompts.test.ts.snap` is **unmodified** in `git status`. If it moved,
   something edited `buildNinaSystemPrompt`'s output — revert that edit rather than regenerating the
   snapshot.
2. `git diff vercel.json` shows exactly one changed line and the `crons` array still has two entries.
3. `npx tsc --noEmit` before and after removing the `'reminder_due'` line from `NINA_PUSH_KINDS` —
   it must FAIL without it. That is the pin working, not a formality.

**Exit criteria:**
- `npx tsc --noEmit` is clean and the full `vitest` suite passes.
- `tests/nina.reminders.test.ts` exercises create, cancel, cancel-then-create, the duplicate and cap
  refusals, due/not-due, and the once-per-Jakarta-day fire pair — all as pure functions, with no
  database and no model.
- `decideProactive` returns `reminder_due` when a reminder is due and every other trigger also
  fires, and falls through the remaining five in order when it is not.
- `NINA_PROMPT_VERSION === 10`; `tests/__snapshots__/nina.prompts.test.ts.snap` passes
  UNREGENERATED.
- `vercel.json` still lists exactly two `crons` entries, and `/api/cron/nina` reads
  `"0 13 * * *"` with the route's header comment describing that schedule and no other.
- No file under `drizzle/` changed and no `db:migrate` is required.

---

## Handoffs

1. **`/admin/memory` renders the `reminders` slot as an "orphan" row.** `'reminders'` is
   deliberately NOT added to `NINA_SLOT_KEYS` (`lib/nina/memory.ts:637`), because that list is the
   DISTILLER's closed prose vocabulary: every member owes a `SlotSpec` with a `canonicalise` and a
   line of distiller prompt text (which would move `NINA_DISTILL_PROMPT_VERSION` and the distill
   prompt test), plus an entry in two total `Record<NinaSlotKey, string>` tables in
   `lib/admin/memoryVocab.ts` (`SLOT_LABELS:25-35`, `SLOT_REFUSALS:46-63`), plus edits to
   `tests/nina.memory.test.ts:52` and `tests/admin.memory.test.ts`. The consequence, stated plainly:
   `/admin/memory` shows the row with `ORPHAN_HINT` — *"Not one of the ten keys Nina understands …
   Delete it."* — which is misleading advice about live feature data. The fix, if wanted, is its own
   small card: give `reminders` the `pending_promises` treatment (structured, delete-only) across
   `memoryVocab.ts` / `memoryModel.ts` and their tests. **It is a labelling wart, not a bug** —
   nothing in the app reads or writes the slot through that page.
2. **A session delete does not reap reminders.** `removeNinaSession`
   (`lib/nina/queries/sessions.ts:379-430`) prunes `pending_promises` per entry by
   `source_message_id`; the reminders slot row is written with a NULL `source_message_id`, which
   makes it structurally unreachable by that purge. **That is the intended behaviour** — a standing
   daily instruction should outlive the conversation it was given in — and it is recorded here so a
   future reader does not read it as an omission.
3. **A morning reminder cannot be delivered on time on the Hobby plan.** `dueReminder` is built
   generically (any `HH:mm`), but the single daily cron fires within the hour of 20:00 WIB, so a
   07:00 reminder is delivered that evening. Recorded in the plan index's Out of scope and in the
   route header. The fix is a plan upgrade or a second cron slot, which is the user's decision to
   make and not this plan's.
4. **`ProactiveDecision.reason` for the sixth trigger uses a typographic apostrophe** (`today’s`) to
   match the file's existing prose. If the repo lints against non-ASCII in source strings, spell it
   `today's`; nothing reads the string but a log line.

---

## Rollback

Revert the branch, or the single commit. Nothing outside the worktree is touched:
- **no migration** — the two new types are `jsonb` shapes and the two widened unions are `$type<>()`
  annotations on `text` columns, so reverting needs no DDL;
- **no production data write** — reverting leaves any `reminders` slot rows that were written in
  place; they become inert (nothing reads the key) and appear as an orphan row in `/admin/memory`
  where they can be deleted by hand;
- **no cron job added or removed** — only the existing entry's `schedule` string changed, which
  reverts with the same commit and puts the evening triggers back on their ~19:00–20:00 WIB window;
- `NINA_PROMPT_VERSION` returns to 9. `nina_turns` rows already stamped `prompt_version = 10` stay,
  which is the point of the constant and is correct: those turns really were run with a `send`
  schema that carried `reminders`.

If only the schedule move needs undoing (say the evening triggers are wanted back at 19:00 while the
feature stays), revert the one line in `vercel.json` and the header paragraph in
`app/api/cron/nina/route.ts`. The reminder mechanism keeps working; it just stops being able to
reach 20:45 on the same evening, and `dueReminder` will deliver the previous day's unfired reminder
the next time the cron runs past its time.
