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
export const MAX_MEMORY_WRITES = 6

/**
 * The runner's own message cap, checked in `lib/nina/actions.ts` before anything is persisted.
 * Server Actions are capped at a 1 MB body by the framework; this is the app's own smaller,
 * earlier limit so a paste of a whole article fails at the boundary instead of inside a prompt.
 */
export const MAX_RUNNER_MESSAGE_CHARS = 4000

export const NinaMemoryWriteSchema = z.object({
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

export const SaveMemoryArgsSchema = NinaMemoryWriteSchema

export type LookupRunsArgs = z.infer<typeof LookupRunsArgsSchema>
export type CompareRunsArgs = z.infer<typeof CompareRunsArgsSchema>
export type SaveMemoryArgs = z.infer<typeof SaveMemoryArgsSchema>

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
