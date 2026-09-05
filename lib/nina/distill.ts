import 'server-only'

import { jakartaDayOf } from '@/lib/date/ranges'
import type {
  NinaFactCategory,
  NinaMemorySource,
  NinaPendingPromisesSlot,
  NinaSlotValue,
} from '@/lib/db/schema'
import { newId } from '@/lib/id'
import { narrativeClient, narrativeModel } from '@/lib/llm/client'
import type Anthropic from '@anthropic-ai/sdk'

import {
  describeDistillIssues,
  DistillPayloadSchema,
  planMemoryWrites,
  type DistillPayload,
  type MemoryPlan,
  type NameSlotInput,
} from './memory'
import {
  buildDistillSystemPrompt,
  DISTILL_REPAIR_PREAMBLE,
  DISTILL_TOOL,
  NINA_DISTILL_PROMPT_VERSION,
} from './prompts/distill'
import type { NinaMemoryWrite } from './schema'
import { NINA_TUNING_DEFAULTS, type NinaRelationship } from './tuning'

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════
 *  R4 — the distillation. THE IMPURE HALF.
 *
 *  Contract, byte-for-byte `lib/llm/narrate.ts`'s: **primary call -> Zod -> one repair ->
 *  degrade**, and NOTHING in this file throws for a model problem. Degrading means applying phase
 *  3's already-validated `send.memoryWrites` and nothing distilled, so the worst case of this
 *  whole phase is phase 3's behaviour.
 *
 *  ── WHY THIS IS A SECOND MODEL CALL AND NOT A FIELD ON THE FIRST ────────────────────────────
 *  `send.memoryWrites` is emitted while she is composing a reply, so it is whatever she happened
 *  to notice mid-sentence. R4 says "every single thing", which needs a pass over the FINISHED
 *  exchange with one instruction: be exhaustive. It also needs a prompt that is not her voice —
 *  see prompts/distill.ts.
 *
 *  ── AND WHY IT IS NEVER AWAITED BY THE ACTION ───────────────────────────────────────────────
 *  Invariant 4, plus 10-20 s of silence after the bubbles are already on screen. It runs in
 *  `after()` from `lib/nina/actions.ts`. `after()` throws E468 outside a request scope, which is
 *  why the CALL sits in the Server Action and this file only exports a plain async function —
 *  callable from a test, and from phase 10's cron route, with no request scope of its own.
 *
 *  ── THE ORDER OF THE TWO WRITES IS THE FEATURE ──────────────────────────────────────────────
 *  Facts first, unconditionally, each in its own try. Slots second. "PERMANENTLY" beats "current":
 *  a slot that fails to write costs one turn's view of the truth, and a fact that fails to write
 *  costs the truth.
 * ════════════════════════════════════════════════════════════════════════════════════════════
 */

/* ── budgets ──────────────────────────────────────────────────────────────────────────────────
 *
 * A one-turn extraction against `glm-5.3` is a smaller job than F07's session narrative (measured
 * 10.2-16.4 s), so the primary timeout is that measured ceiling with headroom rather than a guess
 * at a median. It runs in `after()`, so nobody is waiting on it — the deadline exists to stop a
 * hung socket occupying the function's max duration, not to protect a response.
 *
 * `DISTILL_MAX_TOKENS` is 2000 and not 1200 because **the plan index's live probe measured a
 * `thinking` block appearing even with `thinking: {type:'disabled'}` set.** The flag stays (it is
 * harmless and it is what F31 measured for the narrative path) but the ceiling does not rely on
 * it, and `findRecordBlock` SCANS the content array instead of reading `content[0]` — a reader
 * that read the first block would have failed on round 1 of that very probe.
 */
export const DISTILL_PRIMARY_MS = 20_000
export const DISTILL_REPAIR_MS = 12_000
export const DISTILL_OVERALL_MS = 34_000
export const DISTILL_MAX_TOKENS = 2_000

/** Same rule and same number as `narrate.ts`: a repair with two seconds left cannot finish. */
export const MIN_DISTILL_REPAIR_BUDGET_MS = 3_000

/**
 * The gateway this file needs. **`dbNinaToolGateway` (phase 3) satisfies it** — the two writes are
 * phase 3's own, widened, and the two reads are additive members it gains in Step 8. One
 * implementation object, two interface views, so there is still exactly one way to upsert a slot.
 *
 * Phase 3's `NinaToolGateway` deliberately does NOT gain the two reads: its tools do not need
 * them, and adding them there would force an edit to its test fixture for no behavioural reason.
 */
export interface NinaMemoryGateway {
  saveMemorySlot(
    userId: string,
    row: {
      key: string
      value: NinaSlotValue
      source?: NinaMemorySource
      sourceMessageId?: string | null
    },
  ): Promise<void>
  appendMemoryFact(
    userId: string,
    row: {
      text: string
      sourceMessageId: string | null
      category?: NinaFactCategory
      confidence?: number
    },
  ): Promise<void>
  /** `source` per existing slot key. Ruling (c) rule 2 is unimplementable without this. */
  readSlotSources(userId: string): Promise<ReadonlyMap<string, NinaMemorySource>>
  /** The parsed `pending_promises` value, so the merge folds into it instead of replacing it. */
  readPendingPromises(userId: string): Promise<NinaPendingPromisesSlot | null>
}

/**
 * The injection seam, declared here rather than imported from `lib/llm/narrate.ts`. Phase 3 made
 * the same call about `describeInsightIssues` and gave the reason: that module is F07's file and
 * reaches F07's types. Six lines duplicated beats a coupling.
 */
export interface DistillClientLike {
  messages: {
    create(
      body: Anthropic.MessageCreateParamsNonStreaming,
      options?: { timeout?: number },
    ): Promise<Anthropic.Message>
  }
}

export interface DistillInput {
  /** His message this turn, verbatim. Also the quote gate's haystack. */
  runnerText: string
  /** Her bubbles, in emission order. Needed for the promise detection. */
  ninaBubbles: readonly string[]
  /** The slots that already exist, as `key: value` lines, so it does not re-record what is known. */
  slotSummary: readonly { key: string; value: string }[]
  /**
   * What Nina is set to be to him right now, so the librarian can recognise the couple's own
   * register and leave it out of his biography (F33 / R6 — see `prompts/distill.ts`'s header).
   *
   * **Optional on purpose.** The caller inside `after()` lives in `lib/nina/actions.ts`, which a
   * different phase of this set owns, so this field lands ahead of the value that fills it: omit
   * it and the librarian is told the default relationship, which is the behaviour that shipped
   * before the dials existed. Passing `tuning.relationship` here is the one line that closes it.
   */
  relationship?: NinaRelationship
}

export type DistillSource = 'llm' | 'llm_repair' | 'unavailable'

export interface DistillResult {
  payload: DistillPayload | null
  source: DistillSource
}

function findRecordBlock(message: Anthropic.Message): Anthropic.ToolUseBlock | null {
  for (const block of message.content) {
    if (block.type === 'tool_use' && block.name === DISTILL_TOOL.name) return block
  }
  return null
}

function distillBody(
  model: string,
  messages: Anthropic.MessageParam[],
  relationship: NinaRelationship,
): Anthropic.MessageCreateParamsNonStreaming {
  return {
    model,
    max_tokens: DISTILL_MAX_TOKENS,
    system: buildDistillSystemPrompt(relationship),
    messages,
    tools: [DISTILL_TOOL],
    tool_choice: { type: 'tool', name: DISTILL_TOOL.name },
    /* Kept, not relied on. See the budget note above and the plan index's live probe. */
    thinking: { type: 'disabled' },
  }
}

function userTurn(input: DistillInput): string {
  const known =
    input.slotSummary.length === 0
      ? '(nothing known about him yet)'
      : input.slotSummary.map((slot) => `${slot.key}: ${slot.value}`).join('\n')
  const hers = input.ninaBubbles.map((bubble) => `NINA: ${bubble}`).join('\n')
  return `ALREADY KNOWN ABOUT HIM (do not re-record these unless he changed one):\n${known}\n\nHIM: ${input.runnerText}\n\n${hers}`
}

function logDistillFailure(stage: 'primary' | 'repair', cause: unknown): void {
  /* Never `console.error`. A turn that did not distil is an expected state of this feature: the
   * message is stored with an id, so the distillation is re-derivable and nothing is lost. */
  console.warn(`[nina.distill] ${stage} call failed`, { error: String(cause) })
}

/** The testable core. Client injected, no database, no environment beyond the model id. */
export async function distillWith(
  client: DistillClientLike,
  input: DistillInput,
  options: { model: string; now?: () => number },
): Promise<DistillResult> {
  const now = options.now ?? Date.now
  const deadline = now() + DISTILL_OVERALL_MS
  const remaining = (): number => deadline - now()

  const messages: Anthropic.MessageParam[] = [{ role: 'user', content: userTurn(input) }]
  /* Resolved once, so the primary call and the repair call cannot disagree about who she is. */
  const relationship = input.relationship ?? NINA_TUNING_DEFAULTS.relationship

  let first: Anthropic.Message | null = null
  try {
    first = await client.messages.create(distillBody(options.model, messages, relationship), {
      timeout: Math.min(DISTILL_PRIMARY_MS, Math.max(remaining(), 1)),
    })
  } catch (cause) {
    logDistillFailure('primary', cause)
  }

  if (first !== null) {
    const block = findRecordBlock(first)
    /* A `max_tokens` stop is a response cut mid-object; the same prompt cuts it again, so it is
     * not a validation failure to repair. `narrate.ts` makes the same call for the same reason. */
    const truncated = first.stop_reason === 'max_tokens'

    if (block !== null && !truncated) {
      const parsed = DistillPayloadSchema.safeParse(block.input)
      if (parsed.success) return { payload: parsed.data, source: 'llm' }

      if (remaining() > MIN_DISTILL_REPAIR_BUDGET_MS) {
        const repairMessages: Anthropic.MessageParam[] = [
          ...messages,
          { role: 'assistant', content: JSON.stringify(block.input) },
          { role: 'user', content: DISTILL_REPAIR_PREAMBLE + describeDistillIssues(parsed.error) },
        ]
        try {
          const second = await client.messages.create(
            distillBody(options.model, repairMessages, relationship),
            {
              timeout: Math.max(Math.min(DISTILL_REPAIR_MS, remaining()), 1),
            },
          )
          const repairedBlock = findRecordBlock(second)
          if (repairedBlock !== null && second.stop_reason !== 'max_tokens') {
            const repaired = DistillPayloadSchema.safeParse(repairedBlock.input)
            if (repaired.success) return { payload: repaired.data, source: 'llm_repair' }
          }
        } catch (cause) {
          logDistillFailure('repair', cause)
        }
      }
    }
  }

  return { payload: null, source: 'unavailable' }
}

/**
 * The wired call. **This is the symbol the payload-boundary guard names**, because it is the one
 * that costs 10-20 s and must never sit in a render path.
 */
export async function distillNinaMemory(deps: {
  input: DistillInput
  client?: DistillClientLike
  model?: string
  now?: () => number
}): Promise<DistillResult> {
  return distillWith(deps.client ?? narrativeClient(), deps.input, {
    model: deps.model ?? narrativeModel(),
    now: deps.now,
  })
}

/**
 * **Facts first, unconditionally. Slots second.** Sequential and each in its own `try`, so one
 * rejected row cannot take the other twenty-three with it, and a slot that fails to write leaves
 * the ledger intact.
 *
 * One `appendMemoryFact` per row rather than a batch insert: it keeps phase 3's single write path
 * (ruling (b)) and it means a single malformed fact costs one fact. This runs in `after()`, so the
 * extra round trips cost nobody any wall clock they can feel.
 */
export async function applyMemoryPlan(
  userId: string,
  plan: MemoryPlan,
  gateway: NinaMemoryGateway,
): Promise<void> {
  for (const fact of plan.facts) {
    try {
      await gateway.appendMemoryFact(userId, {
        text: fact.text,
        sourceMessageId: fact.sourceMessageId,
        category: fact.category,
        confidence: fact.confidence,
      })
    } catch (cause) {
      console.warn('[nina.distill] fact append failed', { error: String(cause) })
    }
  }

  for (const slot of plan.slots) {
    try {
      await gateway.saveMemorySlot(userId, {
        key: slot.key,
        value: slot.value,
        source: slot.source,
        sourceMessageId: slot.sourceMessageId,
      })
    } catch (cause) {
      console.warn('[nina.distill] slot upsert failed', { key: slot.key, error: String(cause) })
    }
  }

  if (plan.deferred.length > 0) {
    /* Ruling (c) rule 2, made visible. An admin-owned slot she tried to correct is worth a log
     * line: it is the one case where the app knowingly did not write what the model concluded. */
    console.info('[nina.distill] slots deferred to their admin-written values', {
      keys: plan.deferred.map((slot) => slot.key),
    })
  }
}

export interface TurnDistillationInput {
  userId: string
  runnerText: string
  /** `nina_messages.id` of his message. Null on a proactive turn. */
  sourceMessageId: string | null
  ninaBubbles: readonly string[]
  /** Phase 3's `send.memoryWrites`, already validated. */
  memoryWrites: readonly NinaMemoryWrite[]
  /** `context.memory.slots` mapped to `{ key, value }` — already display strings (phase 2). */
  slots: readonly { key: string; value: string }[]
  /**
   * `context.runner.fullName`, the `nickname` slot, and the window length as `messageCount` —
   * never a `COUNT(*)`, because phase 1 exports no `countNinaMessages` (RULING A2).
   */
  identity: NameSlotInput
  /**
   * What Nina is set to be to him right now, forwarded to the librarian (F33 / R6, the sweep).
   *
   * Optional for the same reason `DistillInput.relationship` is: omitted, the librarian is told
   * the default relationship, which is the behaviour that shipped before the dials existed. The
   * caller that fills it is `scheduleDistillation` in `lib/nina/actions.ts`.
   */
  relationship?: NinaRelationship
  gateway?: NinaMemoryGateway
  client?: DistillClientLike
  now?: () => Date
}

/**
 * The whole pass, and the only thing `lib/nina/actions.ts` calls. Never throws: a distillation
 * that failed is a turn whose facts are still re-derivable from a persisted message.
 */
export async function runTurnDistillation(input: TurnDistillationInput): Promise<void> {
  try {
    const gateway = input.gateway ?? (await import('./gateway')).dbNinaToolGateway
    const now = input.now?.() ?? new Date()

    const [distilled, existingSlotSources, currentPromises] = await Promise.all([
      distillNinaMemory({
        input: {
          runnerText: input.runnerText,
          ninaBubbles: input.ninaBubbles,
          slotSummary: input.slots,
          relationship: input.relationship,
        },
        client: input.client,
      }),
      gateway.readSlotSources(input.userId),
      gateway.readPendingPromises(input.userId),
    ])

    const plan = planMemoryWrites({
      runnerText: input.runnerText,
      sourceMessageId: input.sourceMessageId,
      memoryWrites: input.memoryWrites,
      distilled: distilled.payload,
      existingSlotSources,
      currentPromises,
      identity: input.identity,
      promiseCtx: {
        todayISO: jakartaDayOf(now),
        sourceMessageId: input.sourceMessageId,
        newId: () => newId(),
      },
    })

    await applyMemoryPlan(input.userId, plan, gateway)

    console.info('[nina.distill] done', {
      promptVersion: NINA_DISTILL_PROMPT_VERSION,
      source: distilled.source,
      facts: plan.facts.length,
      slots: plan.slots.length,
      deferred: plan.deferred.length,
      demoted: plan.demoted.length,
    })
  } catch (cause) {
    console.warn('[nina.distill] pass failed entirely', { error: String(cause) })
  }
}
