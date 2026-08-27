import 'server-only'

import type Anthropic from '@anthropic-ai/sdk'

import { getLatestInsight, saveInsight } from '@/lib/db/queries'
import type { InsightScope } from '@/lib/db/schema'
import { narrativeClient, narrativeModel } from './client'
import { factsHash } from './factsHash'
import type { NarrateFacts } from './facts'
import { promptVersionFor, REPAIR_PREAMBLE, REPORT_TOOL, systemPromptFor } from './prompts/narrate'
import {
  describeInsightIssues,
  InsightPayloadSchema,
  type InsightPayload,
  type StoredSessionInsightPayload,
} from './schema'

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════
 *  primary call → Zod → one repair → **silence**.
 *
 *  THE CONTRACT: nothing in this file throws for an LLM problem. `parseExpense`'s contract, minus
 *  its third tier — and the missing tier is the whole design (R-17).
 *
 *  A regex that re-derives an expense amount is a mechanical transformation of text that is
 *  already there. There is no mechanical transformation that turns
 *  `computed.aerobicDecouplingPct: 12.3` into a truthful sentence. A "fallback narrative" would
 *  be a canned platitude in a coach's voice — the model inventing a fact, moved into our code so
 *  it looks accountable. **The only safe fallback for prose is the absence of prose:** F08 keeps
 *  rendering the metrics, charts and splits, which were complete and useful before this feature
 *  existed, and the card says so plainly.
 * ════════════════════════════════════════════════════════════════════════════════════════════
 */

/* ── budgets ──────────────────────────────────────────────────────────────────────────────────
 *
 * **F07's plan §7.1 specified 15 s / 10 s / 28 s for a session, and that is too tight to ship.**
 * Those numbers came from `research/results-narrative.json`, which measured ~10 s — against
 * `glm-5.2`. Fifteen live `glm-5.3` calls on 2026-08-21 measured **10.2 – 16.4 s**, clustering at
 * 13–16 s. A 15 s primary timeout would have aborted roughly a third of them and reported
 * `unavailable` for a model that was about to answer correctly.
 *
 * So the primary timeout is the measured ceiling with real headroom, not the measured median with
 * none. The overall deadline then has to cover primary + repair + slack, and still leave room
 * under the 60 s function ceiling for auth, the facts query and serialisation.
 *
 * Week and month carry `trendSincePrevious` and a weekly series on top of a session's payload, so
 * they get proportionally more of each. Neither has a live measurement yet — the numbers below
 * are the session's, scaled; revisit them once `/trends` has run against real history.
 */
const BUDGET: Record<
  InsightScope,
  { primary: number; repair: number; overall: number; maxTokens: number }
> = {
  session: { primary: 25_000, repair: 18_000, overall: 45_000, maxTokens: 1_200 },
  week: { primary: 28_000, repair: 20_000, overall: 50_000, maxTokens: 1_600 },
  month: { primary: 28_000, repair: 20_000, overall: 50_000, maxTokens: 1_600 },
}

/**
 * Below this much remaining budget, the repair is skipped rather than started. Same rule and same
 * number as F04's extraction path: a repair fired with two seconds left cannot finish, and the
 * only thing it changes is which error the caller sees.
 */
export const MIN_REPAIR_BUDGET_MS = 3_000

/** Exported for the deadline-gate test, which must not hardcode a number this file may change. */
export const SESSION_OVERALL_MS = BUDGET.session.overall

export type InsightSource = 'llm' | 'llm_repair' | 'unavailable'

export interface Usage {
  inputTokens: number
  outputTokens: number
}

export interface InsightResult {
  /** null only when `source === 'unavailable'`. F08 renders the metrics with no prose. */
  payload: InsightPayload | null
  source: InsightSource
  factsHash: string
  /** True for a cache hit — no model call was made on this request. */
  cached: boolean
  usage: Usage | null
}

/**
 * The seam the unit suite injects at, mirroring F04's `ExtractDeps` and the expense tracker's
 * `LlmClientLike` for the same reason: this module opens with `import 'server-only'` and reaches
 * `@/lib/env`, so the only honest way to test the repair path is to hand it a client that returns
 * the measured malformed body.
 */
export interface LlmClientLike {
  messages: {
    create(
      body: Anthropic.MessageCreateParamsNonStreaming,
      options?: { timeout?: number },
    ): Promise<Anthropic.Message>
  }
}

function findReportBlock(message: Anthropic.Message): Anthropic.ToolUseBlock | null {
  for (const block of message.content) {
    if (block.type === 'tool_use' && block.name === REPORT_TOOL.name) return block
  }
  return null
}

function usageOf(message: Anthropic.Message): Usage {
  return {
    inputTokens: message.usage?.input_tokens ?? 0,
    outputTokens: message.usage?.output_tokens ?? 0,
  }
}

/**
 * `promptVersion` is hashed but never sent (§5.2). It is not a fact about the run — it exists so
 * that editing a prompt busts a cache keyed on numbers that did not move — and putting it in the
 * user turn would invite the model to mention it.
 */
function visibleFacts(facts: unknown): unknown {
  if (facts === null || typeof facts !== 'object') return facts
  const visible: Record<string, unknown> = { ...(facts as Record<string, unknown>) }
  delete visible.promptVersion
  return visible
}

function baseBody(
  model: string,
  scope: InsightScope,
  system: string,
  messages: Anthropic.MessageParam[],
): Anthropic.MessageCreateParamsNonStreaming {
  /*
   * The allowed request surface is `model · max_tokens · system · messages · tools ·
   * tool_choice · thinking` and nothing else — no `strict: true`, no `cache_control`, no
   * `temperature`. This endpoint is Anthropic-*compatible*, not Anthropic, and every field
   * beyond that set is a field z.ai may accept, ignore, or 400 on depending on the day.
   *
   * **`thinking` used to be on the forbidden side of that line, and the omission took the
   * feature down.** On 2026-08-26 `glm-5.3` began emitting an extended `thinking` block by
   * default; it eats the entire `max_tokens` ceiling before any `tool_use` block is produced,
   * so `findReportBlock` finds nothing and every scope returns `unavailable`. The whole
   * `insights` table stopped growing for 31 hours and nothing recorded why, because a failure
   * here persists nothing.
   *
   * MEASURED against real prod facts, 2026-08-27, both a 27 Aug and a 25 Aug run:
   *
   *     thinking on,  1200 tokens →  18-38 s, stop_reason `max_tokens`, content ["thinking"]
   *     thinking on,  4000 tokens →  65-73 s, stop_reason `max_tokens`, content ["thinking"]
   *     thinking DISABLED         →     17 s, stop_reason `tool_use`,   content ["tool_use"]
   *
   * Raising the ceiling is not the fix — 4000 tokens buys 4000 tokens of thinking and still no
   * answer. The 633 output tokens the working variant returns sit right where the 1200 ceiling
   * was sized to sit, so the ceiling was never wrong either.
   *
   * `lib/llm/vision.ts` has sent this same field to the sibling z.ai endpoint since F04, marked
   * "MEASURED … Never remove". F07 never got the treatment. Now both clients agree, and
   * `tests/llm.narrate.test.ts` guards it the way `vision.test.ts` guards the other one.
   */
  return {
    model,
    max_tokens: BUDGET[scope].maxTokens,
    system,
    messages,
    tools: [REPORT_TOOL],
    tool_choice: { type: 'tool', name: REPORT_TOOL.name },
    thinking: { type: 'disabled' },
  }
}

function logLlmFailure(stage: 'primary' | 'repair', scope: InsightScope, cause: unknown): void {
  // Never `console.error`: a narrative that did not generate is an expected state of this
  // feature (§7.3), not an incident. It gets a warn line with enough detail to correlate, and the
  // page it belongs to renders fine without it.
  console.warn(`[narrate] ${stage} call failed`, { scope, error: String(cause) })
}

/**
 * The testable core. Client injected, no database, no environment beyond the model id.
 */
export async function narrateWith(
  client: LlmClientLike,
  scope: InsightScope,
  facts: unknown,
  options: { model: string; now?: () => number },
): Promise<{ payload: InsightPayload | null; source: InsightSource; usage: Usage | null }> {
  const now = options.now ?? Date.now
  const budget = BUDGET[scope]
  const deadline = now() + budget.overall
  const remaining = () => deadline - now()

  const system = systemPromptFor(scope)
  const messages: Anthropic.MessageParam[] = [
    {
      role: 'user',
      content: `Analyse this ${scope}.\n\n${JSON.stringify(visibleFacts(facts), null, 2)}`,
    },
  ]

  let first: Anthropic.Message | null = null
  try {
    first = await client.messages.create(baseBody(options.model, scope, system, messages), {
      timeout: Math.min(budget.primary, Math.max(remaining(), 1)),
    })
  } catch (cause) {
    logLlmFailure('primary', scope, cause)
  }

  if (first) {
    const block = findReportBlock(first)
    /*
     * A `max_tokens` stop is not a validation failure to repair — it is a response that was cut
     * mid-object, and the same prompt with the same ceiling will cut it again. Repairing it would
     * spend the remaining budget re-proving that. `maxTokens` is already ~2x the measured 546
     * output tokens; if this starts firing, the ceiling is the bug.
     */
    const truncated = first.stop_reason === 'max_tokens'

    if (block && !truncated) {
      const parsed = InsightPayloadSchema.safeParse(block.input)
      if (parsed.success) return { payload: parsed.data, source: 'llm', usage: usageOf(first) }

      if (remaining() > MIN_REPAIR_BUDGET_MS) {
        const repaired = await attemptRepair(client, scope, options.model, system, messages, {
          malformed: block.input,
          issues: describeInsightIssues(parsed.error),
          timeoutMs: Math.min(budget.repair, remaining()),
        })
        if (repaired)
          return { payload: repaired.payload, source: 'llm_repair', usage: repaired.usage }
      }
    }
  }

  return { payload: null, source: 'unavailable', usage: null }
}

/**
 * The one repair round-trip.
 *
 * **Shaped as user → assistant(text) → user, not as a `tool_result` block.** The protocol-correct
 * Anthropic form pairs a `tool_use` with a `tool_result`, and this endpoint is only
 * Anthropic-*compatible*; F04's vision repair already settled on the plain three-turn text shape
 * against the sibling endpoint, and reusing it means one repair idiom in this repo instead of two,
 * with the more conservative one chosen. The assistant turn echoes the model's own malformed JSON
 * so "reuse exactly what you already had" refers to something actually present in the context.
 */
async function attemptRepair(
  client: LlmClientLike,
  scope: InsightScope,
  model: string,
  system: string,
  messages: Anthropic.MessageParam[],
  input: { malformed: unknown; issues: string; timeoutMs: number },
): Promise<{ payload: InsightPayload; usage: Usage } | null> {
  const repairMessages: Anthropic.MessageParam[] = [
    ...messages,
    { role: 'assistant', content: JSON.stringify(input.malformed) },
    { role: 'user', content: REPAIR_PREAMBLE + input.issues },
  ]

  let second: Anthropic.Message
  try {
    second = await client.messages.create(baseBody(model, scope, system, repairMessages), {
      timeout: Math.max(input.timeoutMs, 1),
    })
  } catch (cause) {
    logLlmFailure('repair', scope, cause)
    return null
  }

  const block = findReportBlock(second)
  if (!block || second.stop_reason === 'max_tokens') return null

  const parsed = InsightPayloadSchema.safeParse(block.input)
  if (!parsed.success) return null

  return { payload: parsed.data, usage: usageOf(second) }
}

/* ============================================================================
 * Cache and persistence
 * ==========================================================================*/

export interface StoredInsightRow {
  scopeKey: string
  factsHash: string
  payload: unknown
  createdAt: Date
}

export interface InsightStore {
  latest(userId: string, scope: InsightScope, scopeKey: string): Promise<StoredInsightRow | null>
  save(
    userId: string,
    input: {
      scope: InsightScope
      scopeKey: string
      factsHash: string
      payload: unknown
      model: string
    },
  ): Promise<void>
}

export const dbInsightStore: InsightStore = {
  async latest(userId, scope, scopeKey) {
    const row = await getLatestInsight(userId, scope, scopeKey)
    return row == null
      ? null
      : {
          scopeKey: row.scopeKey,
          factsHash: row.factsHash,
          payload: row.payload,
          createdAt: row.createdAt,
        }
  },
  async save(userId, input) {
    await saveInsight(userId, input)
  },
}

export interface NarrateDeps {
  client: LlmClientLike
  store: InsightStore
  model: string
  now?: () => number
}

function productionDeps(): NarrateDeps {
  return { client: narrativeClient(), store: dbInsightStore, model: narrativeModel() }
}

/**
 * R-11, applied at the only moment the denominator is knowable and stable: the payload is about
 * to become a row. Week and month facts have no `session`, so nothing is added to theirs.
 */
function payloadToStore(
  scope: InsightScope,
  payload: InsightPayload,
  facts: NarrateFacts,
): InsightPayload | StoredSessionInsightPayload {
  if (scope !== 'session') return payload
  const hrMax = facts.profile.hrMax
  return { ...payload, hrMaxUsed: hrMax?.bpm ?? null, hrMaxSource: hrMax?.source ?? null }
}

/**
 * **The one function F08's trigger and the cron job call.** Never throws for an LLM problem.
 *
 * ── THE CACHE RULE ────────────────────────────────────────────────────────────────────────────
 * Read the NEWEST row for `(userId, scope, scopeKey)` — one index seek on `insights_latest_idx` —
 * and compare its `facts_hash` against a hash of the facts just built. Equal is a hit and no call
 * is made. Different means something real moved (a review correction, a newly observed HRmax, a
 * rollup that gained a run, an answered intent question) and the model runs.
 *
 * Reading the newest row rather than probing for the exact hash is deliberate: it costs the same
 * seek and it makes the *stale* case observable to this function, which is what lets a corrected
 * run regenerate instead of quietly serving the old prose forever. The old row is kept — an
 * insight is immutable once written (`saveInsight` is insert-if-new, never an upsert), so a
 * narrative a runner has already read never changes under them.
 *
 * ── ON FAILURE, NOTHING IS PERSISTED ──────────────────────────────────────────────────────────
 * No row, no marker, no negative cache. The next natural view of the page retries for free,
 * because nothing recorded that the last attempt failed. That is the correct trade for a feature
 * whose failure state is "the numbers render without prose".
 *
 * **A page view is the only retry a SESSION insight gets.** `/api/cron/rollup` iterates `week`
 * and `month` and nothing else, so tonight's cron will not backfill a run whose narrative
 * failed — this comment claimed otherwise until F31 and the claim was simply wrong. Week and
 * month do get the cron as a second chance. Giving sessions one is a feature with its own
 * budget and ordering questions inside that 60 s function, not a comment fix.
 *
 * ── DO NOT AWAIT THIS FROM A PAGE'S OWN RENDER PATH ───────────────────────────────────────────
 * On a miss this takes 10–35 s. §7.2: the run detail page ships its metrics immediately and the
 * narrative arrives afterwards. The sanctioned callers are `lib/insights/actions.ts` (a Server
 * Action fired from a client effect) and `/api/cron/rollup`.
 */
export async function getOrCreateInsight(
  userId: string,
  scope: InsightScope,
  scopeKey: string,
  facts: NarrateFacts,
  deps: NarrateDeps = productionDeps(),
): Promise<InsightResult> {
  const hash = factsHash(facts)

  const latest = await deps.store.latest(userId, scope, scopeKey)
  if (latest && latest.factsHash === hash) {
    /*
     * A hit reports `source: 'llm'` whether the stored row originally needed a repair or not —
     * `insights` has no column recording which, and inventing one to distinguish two rows that
     * are byte-identical in every way a reader can see is not worth a migration. `cached: true`
     * is the field that carries real information here.
     */
    return {
      payload: readStoredPayload(latest.payload),
      source: 'llm',
      factsHash: hash,
      cached: true,
      usage: null,
    }
  }

  const { payload, source, usage } = await narrateWith(deps.client, scope, facts, {
    model: deps.model,
    now: deps.now,
  })

  if (payload == null) {
    return { payload: null, source: 'unavailable', factsHash: hash, cached: false, usage: null }
  }

  await deps.store.save(userId, {
    scope,
    scopeKey,
    factsHash: hash,
    payload: payloadToStore(scope, payload, facts),
    model: deps.model,
  })

  return { payload, source, factsHash: hash, cached: false, usage }
}

/**
 * A stored payload back into the strict shape, tolerantly. A row written before a schema change
 * must not crash the caller that reads it — the same reasoning `InsightCard.readInsightPayload`
 * states from the render side. A row that no longer validates is treated as no row at all here,
 * and the caller's `cached: true` still tells it not to have made a call.
 */
function readStoredPayload(payload: unknown): InsightPayload | null {
  const parsed = InsightPayloadSchema.safeParse(payload)
  return parsed.success ? parsed.data : null
}

export { promptVersionFor }
