import 'server-only'

import type { NinaSessionTitleSource } from '@/lib/db/schema'
import { narrativeClient, narrativeModel } from '@/lib/llm/client'
import type Anthropic from '@anthropic-ai/sdk'

import { getNinaSession, listNinaMessages, setNinaSessionTitleIfUntitled } from './queries'
import {
  NINA_TITLE_PROMPT_VERSION,
  NINA_TITLE_SYSTEM_PROMPT,
  NINA_TITLE_TOOL,
  NINA_TITLE_TURN_LIMIT,
  buildNinaTitleRequest,
  parseNinaTitle,
  type NinaTitleTurn,
} from './title'

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════
 *  R3, THE IMPURE HALF: one small `glm-5.3` call that names a session.
 *
 *  Contract, `lib/llm/narrate.ts`'s minus its repair: **one call -> parse -> silence.** Nothing in
 *  this file throws for a model problem, and nothing is persisted when it fails — no marker, no
 *  negative cache — so the next turn tries again for free. Degrading means the session keeps phase
 *  1's `SESSION_UNTITLED_TITLE`, which is already on the row.
 *
 *  ── WHY THERE IS NO REPAIR ROUND TRIP, UNLIKE narrate.ts AND distill.ts ──────────────────────
 *  Both of those spend a second call because a five-field object can be malformed in ways worth
 *  describing back. A single short string cannot: a sentence is not repairable into a name (see
 *  `sanitizeNinaModelTitle` and narrate.ts's "the only safe fallback for prose is the absence of
 *  prose"), and an empty string is an answer the prompt explicitly asks for. A repair here would
 *  double the deadline of a label.
 *
 *  ── AND WHY THE CALL IS NEVER AWAITED (invariant 2) ─────────────────────────────────────────
 *  It runs from `lib/nina/actions.ts` inside `after()`, which is also why THIS file exports a
 *  plain async function and never calls `after()` itself: `after()` throws E468 outside a request
 *  scope — the lesson `scheduleDistillation` records. `scripts/check-llm-payload-boundary.mjs`
 *  names `titleNinaSessionIfNeeded` and sanctions exactly this file and `actions.ts`.
 * ════════════════════════════════════════════════════════════════════════════════════════════
 */

/* ── budgets, and they are this call's own ────────────────────────────────────────────────────
 *
 * `NINA_MAX_TOKENS` is 2400 because Nina's payload is four bubbles of prose. This payload is one
 * string of at most 60 characters — under 32 output tokens — so every token below the ceiling is
 * headroom for a `thinking` block nobody asked for. The 2026-09-03 probe recorded one arriving on
 * this endpoint with `thinking: { type: 'disabled' }` set, which is why the flag is sent and not
 * relied on (`distill.ts`'s phrasing).
 *
 * The ceiling is deliberately LOW rather than generous, which is the opposite of `turn.ts`'s call
 * and for a concrete reason: **output tokens are wall clock** (~26-33 ms each, F04's measurement)
 * and this call shares one 60 s invocation with `runTurnDistillation`'s 34 s budget. 600 tokens is
 * ~16-20 s worst case, which fits beside distillation; 2400 would be ~63-79 s and would starve it.
 * F07 also settled that raising a ceiling is not the fix for a thinking model — "4000 tokens buys
 * 4000 tokens of thinking and still no answer" — so a `max_tokens` stop is treated as "no title"
 * and the next turn retries for free.
 *
 * The timeout is 12 s. Fifteen measured calls on this endpoint were 10.2-16.4 s for F07's
 * five-field narrative, and the 2026-09-03 Nina probe measured a real round at 6.2 s; this request
 * carries at most six short messages and returns four words, so it sits at the bottom of that
 * range. 12 s is above every observed floor and is the largest number that leaves distillation
 * whole in the measured case.
 */
export const NINA_TITLE_MAX_TOKENS = 600
export const NINA_TITLE_TIMEOUT_MS = 12_000

/**
 * The injection seam, declared here rather than imported from `lib/llm/narrate.ts` —
 * `distill.ts` made the same call and gave the reason: "that module is F07's file and reaches F07's
 * types. Six lines duplicated beats a coupling."
 */
export interface TitleClientLike {
  messages: {
    create(
      body: Anthropic.MessageCreateParamsNonStreaming,
      options?: { timeout?: number },
    ): Promise<Anthropic.Message>
  }
}

/**
 * The three statements this pass needs, injected so the whole decision tree is unit-testable with
 * no database — `distill.ts`'s `NinaMemoryGateway` and `recomputeRecords`'s `RecordsGateway`.
 *
 * All three are phase 1's, and phase 1 wrote `writeTitleIfUntitled`'s statement specifically for
 * this caller. **No query is added by this phase**, which is what keeps `lib/nina/queries.ts`
 * exclusively phase 1's file.
 */
export interface NinaTitleStore {
  readTitle(
    userId: string,
    sessionId: string,
  ): Promise<{ title: string | null; titleSource: NinaSessionTitleSource | null } | null>
  readTurns(userId: string, sessionId: string): Promise<NinaTitleTurn[]>
  writeTitleIfUntitled(userId: string, sessionId: string, title: string): Promise<boolean>
}

export const dbNinaTitleStore: NinaTitleStore = {
  async readTitle(userId, sessionId) {
    const session = await getNinaSession(userId, sessionId)
    return session === null ? null : { title: session.title, titleSource: session.titleSource }
  },
  async readTurns(userId, sessionId) {
    const rows = await listNinaMessages(userId, { limit: NINA_TITLE_TURN_LIMIT, sessionId })
    return rows.map((row) => ({ role: row.role, body: row.body }))
  },
  async writeTitleIfUntitled(userId, sessionId, title) {
    return setNinaSessionTitleIfUntitled(userId, sessionId, title)
  },
}

/**
 * SCANS the content array rather than reading `content[0]`, because `distill.ts` recorded a
 * `thinking` block arriving in front of the answer — "a reader that read the first block would have
 * failed on round 1 of that very probe".
 */
function findTitleBlock(message: Anthropic.Message): Anthropic.ToolUseBlock | null {
  for (const block of message.content) {
    if (block.type === 'tool_use' && block.name === NINA_TITLE_TOOL.name) return block
  }
  return null
}

/** The testable core. Client injected, no database, no environment beyond the model id. */
export async function titleNinaSessionWith(
  client: TitleClientLike,
  turns: readonly NinaTitleTurn[],
  options: { model: string },
): Promise<string | null> {
  const request = buildNinaTitleRequest(turns)
  /* Nothing to name — a session of captionless photos. No call, no tokens. */
  if (request === null) return null

  let message: Anthropic.Message
  try {
    message = await client.messages.create(
      {
        model: options.model,
        max_tokens: NINA_TITLE_MAX_TOKENS,
        system: NINA_TITLE_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: request }],
        tools: [NINA_TITLE_TOOL],
        tool_choice: { type: 'tool', name: NINA_TITLE_TOOL.name },
        /* Kept, not relied on — see the budget note above. */
        thinking: { type: 'disabled' },
      },
      { timeout: NINA_TITLE_TIMEOUT_MS },
    )
  } catch (cause) {
    /* Never `console.error`: a session that did not get named is an expected state of this feature.
     * The placeholder renders and the next turn tries again. */
    console.warn('[nina.title] call failed', { error: String(cause) })
    return null
  }

  /* A `max_tokens` stop is a response cut mid-object, and the same prompt with the same ceiling
   * cuts it again — narrate.ts's and distill.ts's shared ruling. Here it almost always means the
   * ceiling went to a `thinking` block, which is why the log names the number. */
  if (message.stop_reason === 'max_tokens') {
    console.warn('[nina.title] response hit the token ceiling', {
      maxTokens: NINA_TITLE_MAX_TOKENS,
    })
    return null
  }

  const block = findTitleBlock(message)
  if (block === null) return null
  return parseNinaTitle(block.input)
}

/**
 * **The wired pass, and the symbol the payload-boundary guard names.** Called from exactly one
 * place: `after(() => titleNinaSessionIfNeeded(userId, sessionId))` on `sendNinaMessage`'s success
 * path.
 *
 * ── R3's TRIGGER, AS THREE CHECKS IN COST ORDER ─────────────────────────────────────────────
 *  1. `title IS NULL` on a session that is his — one primary-key read. This is the COST guard:
 *     without it every turn in an already-named session would spend a model call to learn the
 *     answer was on disk. It also answers "is a manual title ever overwritten" with a flat no,
 *     because `renameNinaSession` sets `title` and `titleSource = 'manual'` in one statement, and
 *     migration 0004's legacy session carries `title_source = 'backfill'`. Both are non-NULL, so
 *     both are out of reach here and again in check 3.
 *  2. **One runner row AND at least one Nina row**, which is R3's "(user then nina)" literally.
 *     Free — the rows were read for the prompt anyway. It is also what stops a session holding only
 *     a proactive message from being named: assumption A3 puts cron messages in the most recent
 *     session, and a session where she spoke and he never answered has nothing to name.
 *  3. `setNinaSessionTitleIfUntitled`'s `WHERE … AND title IS NULL` — the CORRECTNESS guard, and
 *     the durable one. `hasProactiveMessageForRun`'s docstring states the rule: "a serverless
 *     invocation has no memory of the previous one, so the marker has to be a row". `after()` can
 *     run more than once and two tabs can finish the same first exchange at the same moment; both
 *     may call the model, one `UPDATE` matches a row and the other matches nothing. One title, no
 *     error, no second write.
 *
 *  Checks 1 and 3 are not redundant. Check 1 asks "is this call worth making" and may be stale by
 *  microseconds without harming anything; check 3 asks "may this write land" and is evaluated
 *  inside the statement by Postgres, so it cannot be stale at all.
 *
 * **Never throws.** It runs in `after()`, where a rejection is a log line and nothing else, and a
 * session without a name is a cosmetic state with a free retry behind it.
 */
export async function titleNinaSessionIfNeeded(
  userId: string,
  sessionId: string,
  deps: { store?: NinaTitleStore; client?: TitleClientLike; model?: string } = {},
): Promise<void> {
  try {
    const store = deps.store ?? dbNinaTitleStore

    const session = await store.readTitle(userId, sessionId)
    /* Not his, or gone. One outcome, as everywhere in `queries.ts`. */
    if (session === null) return
    if (session.title !== null) {
      console.info('[nina.title] already named, no call made', { source: session.titleSource })
      return
    }

    const turns = await store.readTurns(userId, sessionId)
    const spoke = turns.some((turn) => turn.role === 'runner')
    const answered = turns.some((turn) => turn.role === 'nina')
    if (!spoke || !answered) return

    const title = await titleNinaSessionWith(deps.client ?? narrativeClient(), turns, {
      model: deps.model ?? narrativeModel(),
    })
    if (title === null) return

    const written = await store.writeTitleIfUntitled(userId, sessionId, title)
    console.info('[nina.title] done', {
      promptVersion: NINA_TITLE_PROMPT_VERSION,
      written,
      chars: title.length,
    })
  } catch (cause) {
    console.warn('[nina.title] pass failed entirely', { error: String(cause) })
  }
}
