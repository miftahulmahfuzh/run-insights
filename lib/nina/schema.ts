import { z } from 'zod'

/**
 * The output contract for `SEND_TOOL`, and the argument contracts for all three tools.
 *
 * ── WHY A TOOL SCHEMA IS NOT ENOUGH ───────────────────────────────────────────────────────────
 * MEASURED (`research/results-narrative.json`, still committed with the defect intact): this same
 * z.ai endpoint returned HTTP 200 for a forced tool call whose array entries were **all missing a
 * `required` field**. The endpoint does not enforce a tool schema; `required` and `maxItems` in
 * `lib/nina/prompts/tools.ts` are prompt text that happens to be shaped like a schema. Everything
 * load-bearing is here.
 *
 * ── THE OBJECTS STRIP, THEY DO NOT REJECT ─────────────────────────────────────────────────────
 * `z.object` (strip) rather than `z.strictObject` throughout. An extra key the model invents is
 * harmless — nothing downstream reads it — and rejecting it would spend a ~16 s repair round trip
 * to delete a field. The caps and the required fields are what a repair is worth.
 */

/** RU-5's cap, and phase 4's `REVEAL_MAX_BUBBLES`. Five is a monologue. */
export const MAX_BUBBLES = 4

/**
 * One bubble's ceiling, in characters.
 *
 * Not arbitrary: RU-5's staggered reveal only reads as someone typing if a bubble is the length of
 * a chat message. Phase 4's reveal timing is per-character with a ceiling, so a 2000-character
 * bubble either flashes in instantly (dishonest) or stalls the whole turn behind one typing
 * indicator. 700 characters is roughly 110 words — long for a chat message, short of an essay.
 *
 * The signal that moves it is named rather than left to taste: `nina_turns.status = 'repaired'`
 * clustering on a `bubbles[i]` length complaint means raise it; bubbles that read as essays in a
 * chat window mean lower it. Either way it is this constant and one number in its test.
 */
export const MAX_BUBBLE_CHARS = 700

/** `SEND_TOOL`'s `maxItems`, enforced. Six facts from one turn is already a lot of revelation. */
const MAX_MEMORY_WRITES = 6

/**
 * The runner's own message cap, checked in `lib/nina/actions/send.ts` before anything is persisted.
 * Server Actions are capped at a 1 MB body by the framework; this is the app's own smaller,
 * earlier limit so a paste of a whole article fails at the boundary instead of inside a prompt.
 */
export const MAX_RUNNER_MESSAGE_CHARS = 4000

const NinaMemoryWriteSchema = z.object({
  kind: z.enum(['slot', 'fact']),
  /**
   * Phase 5 owns the vocabulary (ruling b). Until it lands, any non-empty key is accepted and
   * upserted verbatim — refusing unknown keys before a vocabulary exists would refuse every key.
   */
  slotKey: z.string().trim().min(1).max(60).optional(),
  text: z.string().trim().min(1).max(400),
})

export type NinaMemoryWrite = z.infer<typeof NinaMemoryWriteSchema>

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

/**
 * **The reply.** RU-5: 1–4 bubbles, each of which becomes its own `nina_messages` row so phase 7
 * can quote any one of them independently.
 *
 * The cap is `.max(MAX_BUBBLES)` and NOT a `.slice(0, 4)`, and that is the interesting choice.
 * Truncating five bubbles to four ships a reply that stops mid-thought and looks like a bug in the
 * client; failing validation spends one repair telling her the real constraint, and if she does it
 * twice the turn degrades honestly. It also means phase 4's "already clamped to <= 4" is
 * guaranteed by the TYPE rather than by a call this phase promises to remember to make.
 */
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

export type NinaSendPayload = z.infer<typeof NinaSendPayloadSchema>

/**
 * Tool arguments. Deliberately loose about the date STRINGS — `z.string()`, not a regex — because
 * `lib/nina/dates.ts` produces a better answer for a bad date than a validation error does: an
 * explicit `{ kind: 'invalid', input, reason }` she can read and retry, inside the same budgeted
 * round. A Zod regex here would turn that into a dispatch failure with nothing to say.
 */
export const LookupRunsArgsSchema = z.object({
  dates: z.array(z.string().trim().min(1).max(32)).min(1).max(8),
})

export const CompareRunsArgsSchema = z.object({
  dateA: z.string().trim().min(1).max(32),
  dateB: z.string().trim().min(1).max(32),
})

/**
 * `aggregate_runs`' vocabulary, spelled ONCE as const arrays so three things derive from it: the
 * Zod enums below, the TypeScript unions `lib/nina/tools.ts` types its gateway call with, and the
 * JSON-Schema `enum` lists in `lib/nina/prompts/tools.ts` — which are a hand-written copy, because
 * that file is a constant with no imports but `type Anthropic` and is meant to stay one.
 * `tests/nina.prompts.test.ts` asserts the copy against these arrays, so "kept in sync by hand"
 * is a checked claim rather than a hopeful comment.
 *
 * Six metrics: the three columns `runs` stores NOT NULL (`durationSec`, `distanceM`,
 * `avgPaceSec`) and the three it stores nullable but usually has (`avgHr`, `activeKcal`,
 * `elevationM`). Five aggregations: what SQL gives for free, and what a question about a training
 * block ever actually asks for.
 */
export const NINA_AGGREGATE_METRICS = [
  'durationSec',
  'distanceM',
  'avgPaceSec',
  'avgHr',
  'activeKcal',
  'elevationM',
] as const

export const NINA_AGGREGATE_FNS = ['avg', 'sum', 'min', 'max', 'count'] as const

/**
 * `runs.intent`'s domain (`lib/db/schema/runs.ts:250`). Copied rather than imported for the same
 * reason the metric list is: this module is the Zod layer and the enum has to be a VALUE array for
 * `z.enum`. Drift is a compile error, not a silent widening — `lib/nina/tools.ts` assigns the
 * parsed value to a `RunIntent | null` field, so a member this list gains and `RunIntent` does not
 * fails `tsc` at that assignment.
 */
export const NINA_AGGREGATE_INTENTS = ['easy', 'tempo', 'long', 'race', 'unspecified'] as const

export type NinaAggregateMetric = (typeof NINA_AGGREGATE_METRICS)[number]
export type NinaAggregateFn = (typeof NINA_AGGREGATE_FNS)[number]
export type NinaAggregateIntent = (typeof NINA_AGGREGATE_INTENTS)[number]

/**
 * **The enums are strict and the DATES are loose**, and the split is the same one
 * `LookupRunsArgsSchema` makes above for the same reason. A bad enum has nothing better to say
 * than Zod's own issue list, which already names the field and its options. A bad DATE does:
 * `handleAggregateRuns` answers it with the string it could not read and the shape it wanted,
 * inside the same budgeted round, and a Zod regex here would turn that into a dispatch failure
 * with nothing to say.
 */
export const AggregateRunsArgsSchema = z.object({
  metric: z.enum(NINA_AGGREGATE_METRICS),
  agg: z.enum(NINA_AGGREGATE_FNS),
  from: z.string().trim().min(1).max(32),
  to: z.string().trim().min(1).max(32),
  intent: z.enum(NINA_AGGREGATE_INTENTS).optional(),
})

export const SaveMemoryArgsSchema = NinaMemoryWriteSchema

/**
 * The issue list that goes into the repair turn. Byte-for-byte the same helper as
 * `describeInsightIssues` in `lib/llm/schema.ts`, and not imported from there: that module reaches
 * `@/lib/metrics/hrMax` for `HrMaxSource` and is F07's file. Twelve lines duplicated beats a
 * cross-feature import for a string formatter.
 *
 * MEASURED, F07: naming the failing FIELD is what makes the repair land. A generic "your JSON was
 * invalid" measured 1/4; a per-field issue list measured 5/6.
 */
export function describeNinaIssues(error: unknown): string {
  const issues = (error as { issues?: Array<{ path: unknown[]; message: string }> })?.issues
  if (!Array.isArray(issues)) return String(error)
  return issues
    .slice(0, 12)
    .map((issue) => `- ${issue.path.join('.') || '(root)'}: ${issue.message}`)
    .join('\n')
}
