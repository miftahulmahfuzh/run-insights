import 'server-only'

import { narrativeClient, narrativeModel } from '@/lib/llm/client'
import type Anthropic from '@anthropic-ai/sdk'

import type { NinaContext } from './context'
import { dbNinaToolGateway, dbNinaTurnStore } from './gateway'
import { NINA_REPAIR_PREAMBLE, NINA_SYSTEM_PROMPT, SEND_TOOL } from './prompts'
import { quoteContextBlock, type QuotedMessageInput } from './reply'
import { NinaSendPayloadSchema, describeNinaIssues, type NinaSendPayload } from './schema'
import {
  NINA_CORE_TOOL_SET,
  dispatchNinaTool,
  type NinaRunHistory,
  type NinaToolGateway,
  type NinaToolSet,
} from './tools'

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════
 *  THE TURN. Primary call → up to two tool rounds → Zod → ONE repair → honest silence.
 *
 *  `lib/llm/narrate.ts`'s contract, with a tool loop bolted inside the same deadline: **nothing
 *  in this file throws for an LLM problem.** A turn that cannot be completed returns
 *  `source: 'unavailable'` with a null payload, `lib/nina/actions.ts` returns
 *  `{ unavailable: true }`, and phase 4's screen says she is not answering right now — with the
 *  runner's own message already persisted, so nothing he typed is lost.
 *
 *  There is deliberately NO fallback bubble. narrate.ts's third tier is absent for the same
 *  reason: a canned "sorry, I'm having trouble" in Nina's voice is the app inventing her, and R1's
 *  whole ask is that she pass for a person. A friend who did not reply is a real thing; a friend
 *  who replies with a templated apology in perfect Jakarta slang is a broken illusion.
 * ════════════════════════════════════════════════════════════════════════════════════════════
 */

/* ── budgets ──────────────────────────────────────────────────────────────────────────────────
 *
 * MEASURED, 2026-08-21, fifteen live `glm-5.3` calls on this endpoint: **10.2 – 16.4 s,
 * clustering at 13 – 16 s** (`lib/llm/narrate.ts`'s budget note). Nina's turn makes TWO of those
 * calls in the ordinary path and THREE in the repair path, inside Vercel's hard 60 s function
 * ceiling on region `sin1`.
 *
 *   auth + two `db.batch` reads + serialising the reply   ~  2 – 4 s
 *   primary call                                          ~ 13 – 16 s
 *   tool dispatch (in-memory, no I/O for lookup/compare)  ~      0 s
 *   continuation call                                     ~ 13 – 16 s
 *   ────────────────────────────────────────────────────────────────────
 *   ordinary worst case                                   ~ 36 s
 *   + one repair                                          ~ 52 s   ← over an unpadded 45 s
 *
 * So `overall` is 45 s and the repair is CLAMPED to whatever is left rather than given its full
 * 16 s. That is the "stop yourself before the platform does" rule made arithmetic: a repair that
 * starts with 9 s left gets 9 s, probably times out, and degrades — which is strictly better than
 * a 504 that loses the whole request including the bubbles it might have returned.
 *
 * The 2026-09-03 probe measured a real two-round turn on this endpoint at **6.2 s + 7.6 s =
 * 13.8 s**, less than half the 36 s worst case above. The numbers below stay unchanged because
 * they were sized on fifteen calls and not on one, and a budget is the right kind of wrong when
 * it is generous.
 *
 * **Do not raise `overall` past 50 s.** The remaining 10 s is the page segment's own overhead plus
 * the persistence of up to four rows, and a Server Action's timeout is the PAGE segment's — see
 * `app/r/[id]/page.tsx`'s note and Next's `maxDuration` reference. **`app/nina/page.tsx` carries
 * `export const maxDuration = 60`, and that line lands in PHASE 4**, which owns the file. Without
 * it the 45 s below is fiction.
 */
export const NINA_TURN_BUDGET = {
  /** The measured ceiling with real headroom, not the measured median with none. */
  primary: 22_000,
  /** The post-tool call. Same output size, a bigger input; same allowance. */
  continue: 20_000,
  /** Clamped to `remaining()` at the call site. This is a ceiling, not a promise. */
  repair: 16_000,
  overall: 45_000,
} as const

/**
 * Below this much remaining budget, another TOOL ROUND is not started — the loop forces `send`
 * instead. 14 s because the fastest call ever measured on this endpoint was 10.2 s: a round begun
 * with less than that cannot finish, and the only thing it changes is which failure he sees.
 */
export const NINA_MIN_ROUND_BUDGET_MS = 14_000

/**
 * Below this much remaining budget, the repair is skipped rather than started. Same rule and same
 * number as F04's extraction path and F07's narrative: a repair fired with two seconds left cannot
 * finish.
 */
export const NINA_MIN_REPAIR_BUDGET_MS = 3_000

/**
 * Two rounds, not more, and the reason is the budget above and not a philosophy of agents. Round 1
 * covers the ordinary case (`lookup_runs`, or `compare_runs`, or `save_memory`, or several at
 * once — Anthropic's protocol allows multiple `tool_use` blocks in one assistant turn, so "look up
 * two days AND save a fact" is ONE round). Round 2 exists for the follow-up a tool answer
 * legitimately provokes: an ambiguous two-a-days date, or an `isError` result she can fix. A third
 * round does not fit under 45 s and would not be reached anyway.
 */
export const MAX_TOOL_ROUNDS = 2

/**
 * One extra model call, reserved for re-asking a turn that answered in prose — see `ninaBody`'s
 * measurement and the prose branch in `runNinaTurnWith`.
 *
 * It is deliberately NOT a tool round and does not come out of `MAX_TOOL_ROUNDS`' allowance. The
 * measured failure is a turn that spends both its rounds on real tool calls and *then* answers the
 * forced `send` with a paragraph: with the two budgets shared there is no call left to re-ask
 * with, and a reply she had already written is thrown away. One extra call at ~7-9 s sits well
 * inside the 45 s deadline, and the deadline gate below is what actually stops it.
 *
 * Module-local on purpose: nothing outside this file needs it, and this phase's exported surface
 * is a contract four later phases build on.
 */
const MAX_PROSE_RETRIES = 1

/**
 * 1200 was sized for F07's five-field payload and measured 633 actual output tokens. Nina's
 * payload is up to four bubbles of ~700 characters plus six memory writes, so the ceiling is
 * raised proportionally — and then raised again, for a reason that is a measurement and not a
 * margin of comfort.
 *
 * **THIS CEILING MUST HAVE ROOM FOR A `thinking` BLOCK WE DID NOT ASK FOR.** The 2026-09-03 probe
 * of this endpoint sent `thinking: { type: 'disabled' }` and round 1 came back **with a `thinking`
 * block anyway** (round 2 without one). So sizing `max_tokens` to the payload alone would be
 * sizing it to a response shape z.ai does not promise: the block would eat the front of the
 * budget, the `tool_use` behind it would be cut mid-object, `stop_reason` would be `max_tokens`,
 * and the turn would degrade for a reason that looks nothing like its cause. 2400 is the payload
 * ceiling plus room for the observed block.
 *
 * **What is NOT the fix:** raising this without limit. F07 measured that 4000 tokens buys 4000
 * tokens of thinking and still no answer, and that finding stands. This is headroom for a block
 * that arrives *alongside* the answer, not a budget for one that replaces it. And the flag stays
 * on every body regardless — see `ninaBody`, including why "keep sending it" and "do not do
 * arithmetic against it" are both true at once.
 */
export const NINA_MAX_TOKENS = 2_400

/**
 * **The same client, on purpose.** `narrativeClient()` is `@anthropic-ai/sdk` against
 * `env.LLM_BASE_URL` with `maxRetries: 0`, and every word of its rationale applies here verbatim:
 * one credential for both endpoints (R-40), and retries off because THIS module does its own
 * single budgeted retry and that is the retry with a chance of changing the outcome. A second
 * `new Anthropic({…})` would be a second HTTP agent and a second place that can drift on the
 * retry setting.
 *
 * Re-exported under Nina's own names so a reader of this file is not asking why a chat turn is
 * calling something called "narrative".
 */
export const ninaClient = narrativeClient
/** The model id, read at the call site so a test can pass its own. There is no `NINA_MODEL`. */
export const ninaModel = narrativeModel

/**
 * The seam the unit suite injects at, mirroring `LlmClientLike` in `lib/llm/narrate.ts` and
 * `ExtractDeps` in F04, for the reason both give: this module opens with `import 'server-only'`
 * and reaches `@/lib/env`, so the only honest way to test the repair path is to hand it a client
 * that returns the measured malformed body.
 *
 * Declared here rather than imported from `narrate.ts` because importing that module pulls
 * `@/lib/db/queries` into every test that wants a fake chat client. Two identical twelve-line
 * interfaces beats that; hoisting them into a shared `lib/llm/clientLike.ts` is right the third
 * time, not the second.
 */
export interface NinaLlmClientLike {
  messages: {
    create(
      body: Anthropic.MessageCreateParamsNonStreaming,
      options?: { timeout?: number },
    ): Promise<Anthropic.Message>
  }
}

export type NinaTurnSource = 'llm' | 'llm_repair' | 'unavailable'

export interface NinaTurnUsage {
  inputTokens: number
  outputTokens: number
}

export interface NinaTurnTrace {
  model: string
  promptVersion: number
  /** Tool rounds actually completed. 0 for a turn she answered straight away. */
  rounds: number
  /** Every tool name dispatched, in order. A dropped sibling call is prefixed `dropped:`. */
  toolCalls: string[]
  latencyMs: number
}

export interface NinaTurnResult {
  /** null iff `source === 'unavailable'`. There is no fallback bubble; see the header. */
  payload: NinaSendPayload | null
  source: NinaTurnSource
  usage: NinaTurnUsage
  trace: NinaTurnTrace
}

/**
 * What this module hands the store. **Not a `nina_turns` row** — phase 1 owns that shape
 * (`NinaTurnInsert`) and `dbNinaTurnStore` does the translation, including `source → status` and
 * the `kind` / `trigger` this phase always sets the same way. Keeping the two shapes distinct is
 * what lets the tests assert `source: 'llm_repair'` without knowing that the column says
 * `'repaired'`.
 *
 * **No `rounds`.** Phase 1's table has no such column and this phase does not add one; the round
 * count stays on `NinaTurnTrace`, where the unit suite reads it, and the durable evidence of a
 * tool round is `toolCalls`, which names them.
 */
export interface NinaTurnRow {
  model: string
  promptVersion: number
  /** Which mechanism produced the reply. NOT the `status` column — see `dbNinaTurnStore`. */
  source: NinaTurnSource
  /**
   * Comma-joined `trace.toolCalls`. `''` when she called none — ruling (b)'s evidence, and the
   * reason phase 1's column is `text` and not an `integer` count.
   */
  toolCalls: string
  inputTokens: number
  outputTokens: number
  latencyMs: number
}

export interface NinaTurnStore {
  record(userId: string, row: NinaTurnRow): Promise<void>
}

export interface NinaTurnInput {
  userId: string
  /** Phase 2's boundary. Everything she may ever know is in here. */
  context: NinaContext
  /** Built once per turn by `NinaToolGateway.loadRunHistory`, reused by every round. */
  history: NinaRunHistory
  /** The `nina_messages` row this turn answers, for `nina_memory_facts.source_message_id`. */
  sourceMessageId: string | null
  /**
   * What he just typed. Null on a proactive turn (phase 10), where she opens the conversation.
   *
   * **Nothing in this loop may assume a trailing runner message.** A proactive turn answers a
   * conversation whose last row is Nina's own, and she is allowed to speak twice in a row — that
   * is what a proactive trigger IS. No later phase may add a "the last row is his" shortcut.
   */
  runnerText: string | null
  /**
   * **INVARIANT 5.** Phase 6's `glm-4.6v` descriptions arrive here as TEXT. `glm-5.3` is never
   * sent an image: that endpoint answers 200 and silently drops the block, so an image sent here
   * is not an error, it is a lie. This field is the entire image path into this file.
   */
  imageDescriptions?: readonly string[]
  /**
   * R12 (phase 7). The message he is replying to, resolved and ownership-checked by
   * `lib/nina/actions.ts`. Null on an ordinary turn and on every proactive turn.
   *
   * It is passed EXPLICITLY rather than left to be joined out of `context.conversation.window[]`
   * by the model, for two reasons: the window is 40 messages, so a reply to anything older is an
   * id with no text behind it; and even when the text is there, nothing in the JSON says that
   * THIS turn is a reply rather than a turn that happens to contain an id.
   */
  quoted?: QuotedMessageInput | null
  /** Phase 10's `PROACTIVE_INSTRUCTIONS[kind]`, appended to the user turn. */
  proactive?: string | null
}

export interface NinaTurnDeps {
  client: NinaLlmClientLike
  model: string
  toolSet: NinaToolSet
  gateway: NinaToolGateway
  /** Null in tests. A failure to log is caught and warned; it never fails a turn. */
  store: NinaTurnStore | null
  now?: () => number
}

/**
 * `promptVersion` is logged and never sent — phase 2's own words, and F07's `visibleFacts`
 * precedent. It is not a fact about him; putting it in the payload invites her to mention it.
 */
function visibleContext(context: NinaContext): Omit<NinaContext, 'promptVersion'> {
  const { promptVersion, ...visible } = context
  /* Destructured to drop it, not to read it. F07's `visibleFacts` spreads into a
   * `Record<string, unknown>` and `delete`s the key, which loses the type; this keeps it. */
  void promptVersion
  return visible
}

/**
 * The user turn. One JSON block of facts, then what he said — the same order and the same framing
 * `narrate.ts` uses (`Analyse this ${scope}.\n\n${json}`), because that is the shape this endpoint
 * has been measured against.
 */
function userTurnText(input: NinaTurnInput): string {
  const parts: string[] = [
    'CONTEXT — every fact you are allowed to state is in here. Nothing outside it is real.',
    JSON.stringify(visibleContext(input.context), null, 2),
  ]

  if (input.imageDescriptions != null && input.imageDescriptions.length > 0) {
    parts.push(
      'HE SENT ' +
        (input.imageDescriptions.length === 1 ? 'AN IMAGE' : 'IMAGES') +
        '. This is what is in ' +
        (input.imageDescriptions.length === 1 ? 'it' : 'them') +
        ' — react to the picture, never to this description as a description:',
      input.imageDescriptions.map((description) => `- ${description}`).join('\n'),
    )
  }

  /*
   * R12. Immediately BEFORE `'HE JUST SAID:'` and after the image descriptions: he read the quoted
   * message first, tapped reply, then typed — so she reads it in that order too. Putting it after
   * his text would ask her to re-interpret a sentence she has already answered.
   */
  if (input.quoted != null) {
    parts.push(quoteContextBlock(input.quoted))
  }

  if (input.runnerText != null && input.runnerText.length > 0) {
    parts.push('HE JUST SAID:', input.runnerText)
  }

  if (input.proactive != null && input.proactive.length > 0) {
    parts.push('NOBODY SAID ANYTHING. You are starting this. ' + input.proactive)
  }

  return parts.join('\n\n')
}

/**
 * The request envelope. **The allowed surface on this endpoint is
 * `model · max_tokens · system · messages · tools · tool_choice · thinking` and nothing else** —
 * no `strict: true`, no `cache_control`, no `temperature`. It is Anthropic-*compatible*, not
 * Anthropic, and every field beyond that set is one z.ai may accept, ignore, or 400 on depending
 * on the day.
 *
 * ── `thinking: { type: 'disabled' }`. MEASURED. NEVER REMOVE. ─────────────────────────────────
 * F31 (`docs/plans/F31-narrate-thinking-disabled.md`, commit 2255565), against real prod facts:
 *
 *     thinking on,  1200 tokens →  18-38 s, stop_reason `max_tokens`, content ["thinking"]
 *     thinking on,  4000 tokens →  65-73 s, stop_reason `max_tokens`, content ["thinking"]
 *     thinking DISABLED         →     17 s, stop_reason `tool_use`,   content ["tool_use"]
 *
 * Two thinking calls do not fit under 45 s at any ceiling, and a friend does not deliberate for
 * forty seconds before answering. So the flag goes on every body, primary, continuation and
 * repair, and `lib/nina/turn.test.ts` asserts it on all three.
 *
 * **BUT IT IS A REQUEST, NOT A GUARANTEE, AND NO CODE HERE MAY ASSUME IT WAS HONOURED.** The
 * 2026-09-03 probe of this endpoint sent the flag and round 1 returned a `thinking` block anyway
 * (round 2 did not). F31 measured a *text* completion; a tool call on this endpoint does something
 * else. Two rules follow, and neither is "delete the flag":
 *
 *   1. `NINA_MAX_TOKENS` leaves room for the block — see its own note above.
 *   2. **Every parse SCANS `content[]`. Nothing reads `content[0]`.** `findSendBlock` and
 *      `findToolUses` below iterate, and that is load-bearing: a parser reading slot 0 would
 *      have failed on round 1 of that very probe, and failed *as a malformed reply* — burning the
 *      repair budget reproducing a parse bug.
 *
 * ── `tool_choice` ─────────────────────────────────────────────────────────────────────────────
 * `{ type: 'any' }` on a non-final call: she must call SOMETHING, which is `OUTPUT_RULE`'s "never
 * write prose outside a tool call" asked for by the request rather than only by the prompt.
 * `{ type: 'tool', name: 'send' }` on the final call, with `tools` narrowed to `[SEND_TOOL]` —
 * F07 measured that removing choices raises first-attempt validity, and on the last call there is
 * no budget left to spend on a tool answer she could not act on anyway. **Note what
 * `{ type: 'tool', name: 'send' }` on EVERY call would cost:** it silently disables the tool loop
 * entirely, since `send` would be the only tool she can reach.
 *
 * ── `{ type: 'any' }` IS NOT HONOURED ON A CONTINUATION CALL. MEASURED 2026-09-04. ────────────
 * The plan's premise here was that `{ type: 'any' }` makes a prose answer impossible, and that a
 * prose answer is what `{ type: 'auto' }` would have risked. **It is not true of this endpoint on
 * the call that follows a `tool_result`.** Driving the real loop against `glm-5.3`:
 *
 *     call 1  tool_choice {any}  ->  stop_reason `tool_use`,  content [thinking, tool_use]   ✓
 *     call 2  tool_choice {any}  ->  stop_reason `end_turn`,  content [thinking, text]       ✗
 *
 * — a paragraph of her actual answer, with no tool call anywhere in it. It is intermittent: two
 * earlier probes of the same continuation did return a `tool_use`. So the flag is a request on
 * this call too, exactly as `thinking: { type: 'disabled' }` is, and the loop may not assume it
 * was granted. `runNinaTurnWith` handles it by asking once more with `send` forced rather than
 * degrading — see its prose branch. Degrading there threw away a reply she had already written.
 */
function ninaBody(
  model: string,
  messages: Anthropic.MessageParam[],
  toolSet: NinaToolSet,
  forceSend: boolean,
): Anthropic.MessageCreateParamsNonStreaming {
  return {
    model,
    max_tokens: NINA_MAX_TOKENS,
    system: NINA_SYSTEM_PROMPT,
    messages,
    tools: forceSend ? [SEND_TOOL] : [...toolSet.tools],
    tool_choice: forceSend ? { type: 'tool', name: SEND_TOOL.name } : { type: 'any' },
    thinking: { type: 'disabled' },
  }
}

function usageOf(message: Anthropic.Message): NinaTurnUsage {
  return {
    inputTokens: message.usage?.input_tokens ?? 0,
    outputTokens: message.usage?.output_tokens ?? 0,
  }
}

/**
 * **Both of these SCAN. Neither may be rewritten to read `content[0]`, however tempting.** Two
 * independent reasons, and the second is a measurement:
 *
 * - Anthropic's protocol allows several `tool_use` blocks in one assistant turn, which is what
 *   makes "look up two days AND save a fact" one round rather than two.
 * - **`content[0]` was a `thinking` block on round 1 of the 2026-09-03 probe**, despite
 *   `thinking: { type: 'disabled' }` being sent. A slot-0 parser would have seen no `tool_use`,
 *   called it malformed, and spent the repair budget re-running its own bug.
 */
function findSendBlock(message: Anthropic.Message): Anthropic.ToolUseBlock | null {
  for (const block of message.content) {
    if (block.type === 'tool_use' && block.name === SEND_TOOL.name) return block
  }
  return null
}

function findToolUses(message: Anthropic.Message): Anthropic.ToolUseBlock[] {
  const out: Anthropic.ToolUseBlock[] = []
  for (const block of message.content) {
    if (block.type === 'tool_use' && block.name !== SEND_TOOL.name) out.push(block)
  }
  return out
}

/**
 * Never `console.error`: a turn that did not generate is an expected state of this feature, not an
 * incident — the rule `logLlmFailure` states in `narrate.ts`. It gets a warn line with enough
 * detail to correlate against the `nina_turns` row written for the same turn.
 */
function logNinaFailure(stage: 'primary' | 'continue' | 'repair', cause: unknown): void {
  console.warn(`[nina] ${stage} call failed`, { error: String(cause) })
}

/**
 * What the loop says to a turn that answered in prose despite `tool_choice: { type: 'any' }` —
 * see `ninaBody`'s note, and note this is PROTOCOL text, not persona text. Phase 2 owns every word
 * Nina is given about who she is; this is the loop telling her how to hand something over, in the
 * same spirit as `NINA_REPAIR_PREAMBLE` but for a different failure: the payload was not malformed,
 * there was no payload at all.
 */
const NINA_SEND_NUDGE =
  'You answered in plain text. That is not delivered to him — only the "send" tool is. ' +
  'Say the same thing again by calling "send", splitting it into 1-4 short chat messages.'

/** Her prose, with any `thinking` block dropped. `''` when the turn was thinking and nothing else. */
function proseOf(message: Anthropic.Message): string {
  return message.content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('\n')
    .trim()
}

/* ============================================================================
 * The loop
 * ==========================================================================*/

/**
 * **The testable core.** Client, model, tool set, gateway and clock all injected; no environment
 * beyond what `deps` carries. `tests/fixtures/ninaTurn.ts` drives every branch below with a fake
 * client and no database.
 *
 * At most `MAX_TOOL_ROUNDS + 1` model calls, each clamped to what is left of the 45 s deadline,
 * and the last one is FORCED to `send`. That last detail is the whole safety property: the loop
 * cannot spin, because on its final iteration the model is given exactly one tool and told to use
 * it.
 */
export async function runNinaTurnWith(
  deps: NinaTurnDeps,
  input: NinaTurnInput,
): Promise<NinaTurnResult> {
  const now = deps.now ?? Date.now
  const startedAt = now()
  const deadline = startedAt + NINA_TURN_BUDGET.overall
  const remaining = () => deadline - now()

  const usage: NinaTurnUsage = { inputTokens: 0, outputTokens: 0 }
  const trace: NinaTurnTrace = {
    model: deps.model,
    promptVersion: input.context.promptVersion,
    rounds: 0,
    toolCalls: [],
    latencyMs: 0,
  }

  function finish(payload: NinaSendPayload | null, source: NinaTurnSource): NinaTurnResult {
    trace.latencyMs = now() - startedAt
    return { payload, source, usage, trace }
  }

  function addUsage(message: Anthropic.Message): void {
    const one = usageOf(message)
    usage.inputTokens += one.inputTokens
    usage.outputTokens += one.outputTokens
  }

  const toolCtx = {
    userId: input.userId,
    todayISO: input.context.now.todayISO,
    history: input.history,
    gateway: deps.gateway,
    sourceMessageId: input.sourceMessageId,
  }

  const messages: Anthropic.MessageParam[] = [{ role: 'user', content: userTurnText(input) }]

  /*
   * Set once a call answers in prose instead of calling anything — see `ninaBody`'s measurement.
   * It is never cleared: after she has answered in prose there are no more tool rounds, only the
   * re-ask. That is what bounds this loop, and it is also the right behaviour — she had her rounds
   * and produced an answer; what is left is getting it through the payload contract.
   */
  let proseRetryPending = false
  let proseRetries = 0

  /*
   * At most `MAX_TOOL_ROUNDS + MAX_PROSE_RETRIES + 1` model calls, and the loop cannot spin:
   * every iteration either returns, dispatches a tool (bounded by `trace.rounds`), or re-asks
   * after prose (bounded by `proseRetries`).
   */
  for (let call = 0; call <= MAX_TOOL_ROUNDS + MAX_PROSE_RETRIES; call++) {
    /*
     * Three independent reasons to force `send`: the tool rounds are spent, too little budget left
     * to act on another tool answer (the deadline gate), or a previous call answered in prose.
     * Either way she is handed one tool and told to use it. **`trace.rounds`, not `call`** — a
     * prose re-ask is not a tool round and must not consume one round's allowance.
     */
    const forceSend =
      proseRetryPending || trace.rounds >= MAX_TOOL_ROUNDS || remaining() < NINA_MIN_ROUND_BUDGET_MS
    const ceiling = call === 0 ? NINA_TURN_BUDGET.primary : NINA_TURN_BUDGET.continue

    let message: Anthropic.Message
    try {
      message = await deps.client.messages.create(
        ninaBody(deps.model, messages, deps.toolSet, forceSend),
        { timeout: Math.min(ceiling, Math.max(remaining(), 1)) },
      )
    } catch (cause) {
      logNinaFailure(call === 0 ? 'primary' : 'continue', cause)
      return finish(null, 'unavailable')
    }
    addUsage(message)

    /*
     * A `max_tokens` stop is not a validation failure to repair — it is a response cut mid-object,
     * and the same prompt with the same ceiling will cut it again. Repairing it would spend the
     * remaining budget re-proving that. If this starts firing, `NINA_MAX_TOKENS` is the bug.
     */
    const truncated = message.stop_reason === 'max_tokens'
    const send = findSendBlock(message)

    if (send != null) {
      /*
       * `send` WINS and the turn ends. Sibling `tool_use` blocks are dropped rather than
       * dispatched: she has already answered, so a `tool_result` nobody will read is pure latency.
       * Their names are still recorded — `dropped:save_memory` in `nina_turns.tool_calls` is how a
       * lost write becomes visible instead of theoretical, and `send.memoryWrites` covers that
       * case in the payload we are about to return anyway.
       */
      for (const dropped of findToolUses(message)) trace.toolCalls.push(`dropped:${dropped.name}`)

      if (truncated) return finish(null, 'unavailable')

      const parsed = NinaSendPayloadSchema.safeParse(send.input)
      if (parsed.success) return finish(parsed.data, 'llm')

      /* THE ONE REPAIR. Ruling (g): nothing else in this function is allowed to spend it — a
       * malformed tool ARGUMENT gets a `tool_result` instead, inside an already-budgeted round. */
      if (remaining() <= NINA_MIN_REPAIR_BUDGET_MS) return finish(null, 'unavailable')
      const repaired = await attemptNinaRepair(deps, messages, {
        malformed: send.input,
        issues: describeNinaIssues(parsed.error),
        timeoutMs: Math.min(NINA_TURN_BUDGET.repair, remaining()),
      })
      if (repaired == null) return finish(null, 'unavailable')
      usage.inputTokens += repaired.usage.inputTokens
      usage.outputTokens += repaired.usage.outputTokens
      return finish(repaired.payload, 'llm_repair')
    }

    const toolUses = findToolUses(message)

    /*
     * A response cut mid-object, and the same ceiling will cut it again. A turn whose ceiling was
     * ENTIRELY eaten by a `thinking` block lands here, which is why the flag stays on every body.
     * Note what does NOT land here: a turn that returned a `thinking` block *and* a `tool_use`,
     * which is what this endpoint actually did on 2026-09-03 — `findSendBlock` scans past the
     * thinking block and the turn succeeds normally.
     */
    if (truncated) return finish(null, 'unavailable')

    /*
     * ── SHE ANSWERED IN PROSE. MEASURED, AND IT IS NOT A DEAD END. ────────────────────────────
     * No `send` and nothing to dispatch, because `tool_choice` was ignored. Measured 2026-09-04 on
     * BOTH forms — `{ type: 'any' }` on a continuation call, and `{ type: 'tool', name: 'send' }`
     * with `tools` narrowed to `[SEND_TOOL]`, which is the strictest request this endpoint accepts
     * and still came back `stop_reason: 'end_turn'`, `content [thinking, text]`. So the loop cannot
     * make the endpoint comply; it can only ask again.
     *
     * And it must, because the answer is usually sitting right there in the `text` block:
     * degrading here throws away a reply she had already written and tells him she is not
     * answering about a turn she answered.
     *
     * So: echo her own prose back as the assistant turn, name the problem, and force `send`. That
     * is `narrate.ts`'s repair idiom pointed at a different failure — the payload was not
     * malformed, there was no payload — and it does NOT spend the repair budget, which is reserved
     * for a malformed `send` and nothing else.
     *
     * **This branch sits ABOVE the `forceSend` degrade on purpose.** The measured failure is a
     * turn that spends both tool rounds and *then* answers the forced `send` with a paragraph; if
     * `forceSend` degraded first, that turn — the common one — would never get its re-ask.
     * `MAX_PROSE_RETRIES` and the deadline gate are what stop it instead.
     *
     * `trace.rounds` deliberately does not increment: this is not a tool round. `prose:no_tool`
     * lands in `nina_turns.tool_calls` instead, beside the `dropped:` convention, because the only
     * way to learn how often the endpoint does this is to have recorded it.
     */
    if (toolUses.length === 0) {
      trace.toolCalls.push('prose:no_tool')
      if (proseRetries >= MAX_PROSE_RETRIES || remaining() < NINA_MIN_ROUND_BUDGET_MS) {
        return finish(null, 'unavailable')
      }
      proseRetries += 1
      proseRetryPending = true
      const prose = proseOf(message)
      /* An empty prose turn was thinking and nothing else: there is nothing to echo, so re-ask
       * against the same messages rather than appending a turn that says nothing. */
      if (prose !== '') {
        messages.push({ role: 'assistant', content: prose })
        messages.push({ role: 'user', content: NINA_SEND_NUDGE })
      }
      continue
    }

    /*
     * A non-`send` tool call on a turn that was already handed `[SEND_TOOL]` alone. Unreachable
     * while the endpoint respects `tools`, and degrading is right if it ever does not: she was
     * given one tool, and there is no budget to act on an answer to a different one.
     */
    if (forceSend) return finish(null, 'unavailable')

    const results: Anthropic.ToolResultBlockParam[] = []
    for (const use of toolUses) {
      trace.toolCalls.push(use.name)
      const answer = await dispatchNinaTool(use.name, use.input, toolCtx, deps.toolSet.handlers)
      results.push({
        type: 'tool_result',
        tool_use_id: use.id,
        content: JSON.stringify(answer.answer),
        /* Set only when true: an absent field is safer than a `false` on an endpoint that is only
         * Anthropic-compatible. See the live test. */
        ...(answer.isError ? { is_error: true } : {}),
      })
    }

    messages.push({ role: 'assistant', content: message.content })
    messages.push({ role: 'user', content: results })
    trace.rounds += 1
  }

  /* Unreachable: the last iteration always forces `send` and returns. Kept because the alternative
   * is a non-null assertion on a loop's exit. */
  return finish(null, 'unavailable')
}

/**
 * The one repair round-trip.
 *
 * **Shaped as `… → assistant(text) → user`, not as a `tool_result`.** The protocol-correct
 * Anthropic form pairs a `tool_use` with a `tool_result`, and this endpoint is only
 * Anthropic-*compatible*; F04's vision repair and F07's narrative repair both settled on the plain
 * text shape against these endpoints, and reusing it means one repair idiom in this repo instead
 * of two, with the more conservative one chosen.
 *
 * `messages` is passed by value semantics — the array is spread, never pushed to — because the
 * failing assistant turn was deliberately never appended. So the model sees the conversation as it
 * stood, then its own malformed JSON echoed back (so "reuse exactly what you already had" refers
 * to something actually present in the context), then the field-by-field complaint.
 */
async function attemptNinaRepair(
  deps: NinaTurnDeps,
  messages: readonly Anthropic.MessageParam[],
  input: { malformed: unknown; issues: string; timeoutMs: number },
): Promise<{ payload: NinaSendPayload; usage: NinaTurnUsage } | null> {
  const repairMessages: Anthropic.MessageParam[] = [
    ...messages,
    { role: 'assistant', content: JSON.stringify(input.malformed) },
    { role: 'user', content: NINA_REPAIR_PREAMBLE + input.issues },
  ]

  let second: Anthropic.Message
  try {
    second = await deps.client.messages.create(
      ninaBody(deps.model, repairMessages, deps.toolSet, true),
      { timeout: Math.max(input.timeoutMs, 1) },
    )
  } catch (cause) {
    logNinaFailure('repair', cause)
    return null
  }

  const block = findSendBlock(second)
  if (block == null || second.stop_reason === 'max_tokens') return null

  const parsed = NinaSendPayloadSchema.safeParse(block.input)
  if (!parsed.success) return null

  return { payload: parsed.data, usage: usageOf(second) }
}

/* ============================================================================
 * The production entry point
 * ==========================================================================*/

/**
 * **`export`ed, and the keyword is a ruling.** It would be private if nothing outside this file
 * needed it, and it is not: phase 12's work in `lib/nina/actions.ts` must pass its own `toolSet`
 * (the core set plus `generate_image`) while keeping every other production dep — client, model,
 * gateway, store — exactly as defined here. With the export that is
 * `{ ...productionDeps(), toolSet: withImageTool }` and phase 12 touches nothing in this file.
 * Without it, phase 12's only options are to become a second writer on `turn.ts` for one keyword,
 * or to re-spell all five deps at its own call site — a second definition of "production", which
 * is precisely the drift this function exists to prevent. So the keyword lands in THIS phase's
 * commit, at creation, rather than as a later phase reaching in.
 */
export function productionDeps(): NinaTurnDeps {
  return {
    client: ninaClient(),
    model: ninaModel(),
    toolSet: NINA_CORE_TOOL_SET,
    gateway: dbNinaToolGateway,
    store: dbNinaTurnStore,
  }
}

/**
 * **The one function `lib/nina/actions.ts`, `lib/nina/proactive.ts` (phase 10) and
 * `app/api/cron/nina/route.ts` (phase 10) call.** Never throws for an LLM problem.
 *
 * ── DO NOT AWAIT THIS FROM A PAGE'S OWN RENDER PATH (INVARIANT 4) ─────────────────────────────
 * This takes 13–45 s, every time — there is no cache and no hit path, because every turn is a new
 * conversation state. `app/nina/page.tsx` renders the stored conversation and phase 4 fires the
 * action from a client event handler afterwards, exactly as `components/insights/InsightTrigger.tsx`
 * fires `ensureRunInsight`. **`scripts/check-llm-payload-boundary.mjs`'s `GUARDED_CALLS` table
 * enforces it** — phase 1 owns that file and ships this symbol's entry whole, with
 * `lib/nina/turn.ts`, `lib/nina/actions.ts`, `lib/nina/proactive.ts` and
 * `app/api/cron/nina/route.ts` as its sanctioned callers. The guard greps for the literal string
 * `runNinaTurn`, so **this function's name is part of the contract**; rename it and the guard
 * silently stops guarding. The rule exists because the failure mode looks fine in dev and hangs in
 * production.
 *
 * ── THE TURN IS ALWAYS LOGGED, INCLUDING WHEN IT FAILED ───────────────────────────────────────
 * F07's `getOrCreateInsight` persists NOTHING on failure, and that was right there — a page view
 * retries for free. It is wrong here. A chat turn that produced no reply is the single most
 * important thing to be able to see afterwards, and F31's own post-mortem says so: "the whole
 * `insights` table stopped growing for 31 hours and nothing recorded why, because a failure here
 * persists nothing." So `nina_turns` gets a row with `source: 'unavailable'`, and a store failure
 * is warned and swallowed — a log that cannot be written must not cost a reply that can.
 */
export async function runNinaTurn(
  input: NinaTurnInput,
  deps: NinaTurnDeps = productionDeps(),
): Promise<NinaTurnResult> {
  const result = await runNinaTurnWith(deps, input)

  if (deps.store != null) {
    try {
      await deps.store.record(input.userId, {
        model: result.trace.model,
        promptVersion: result.trace.promptVersion,
        source: result.source,
        toolCalls: result.trace.toolCalls.join(','),
        inputTokens: result.usage.inputTokens,
        outputTokens: result.usage.outputTokens,
        latencyMs: result.trace.latencyMs,
      })
    } catch (cause) {
      console.warn('[nina] turn log failed', { error: String(cause) })
    }
  }

  return result
}
