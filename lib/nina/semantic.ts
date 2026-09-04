import 'server-only'

import type Anthropic from '@anthropic-ai/sdk'

import { narrativeClient, narrativeModel } from '@/lib/llm/client'
import { extractJsonObject } from '@/lib/llm/extractJson'
import {
  SEARCH_RESULT_MAX,
  SEMANTIC_MAX_TOKENS,
  SEMANTIC_TIMEOUT_MS,
  parseSemanticRanking,
  semanticCandidateBlock,
  type NinaSearchCandidate,
} from './search'

/**
 * R6's "search using llm": a `glm-5.3` ranking pass over candidates the SQL already narrowed.
 *
 * ── WHY THIS IS ITS OWN MODULE AND NOT PART OF `searchActions.ts` ─────────────────────────────
 * `scripts/check-llm-payload-boundary.mjs` greps every file under `app`, `lib` and `components` for
 * a guarded symbol followed by `(` and fails unless the file is on that symbol's `sanctioned` list.
 * Its own note on `runNinaTurn` explains the consequence: "a guard that fails on the definition
 * site is a guard that forces the definition to be renamed", so `runNinaTurn` lives in
 * `lib/nina/turn.ts` and that file is sanctioned. `rankNinaSearchHits` lives here for the same
 * reason, and the guard's entry sanctions exactly `lib/nina/semantic.ts` and
 * `lib/nina/searchActions.ts`. **Phase 4 owns that guard file and wrote the entry; this phase does
 * not touch it.**
 *
 * ── WHY NOT A VECTOR SEARCH ───────────────────────────────────────────────────────────────────
 * Assumption A7 and the plan set's Scope section. There is no `pgvector`, no embedding column and
 * no embedding client anywhere in the tree, and adding one is a migration plus a backfill plus an
 * ongoing write path — a larger feature than the request. **What this honestly cannot do**, stated
 * so nobody discovers it as a bug: it ranks the candidates it is given and nothing else, so a
 * relevant message that is neither a text match nor inside the recency window is invisible to it.
 * A vector index would not have that hole. That is the trade, and it is the one the set chose.
 *
 * ── WHY `narrativeClient()` AND WHY RETRIES STAY OFF ──────────────────────────────────────────
 * `lib/llm/client.ts` is `@anthropic-ai/sdk` against `api.z.ai/api/anthropic` — Anthropic Messages,
 * the right envelope for text. Its `maxRetries: 0` is deliberate: the SDK's default two silent
 * retries under a timeout can occupy three times the budget and starve the repair that would have
 * fixed the response. Here it lands harder still, because there IS no repair and a search box's
 * retry is the runner typing again — three attempts behind an 8 s timeout is a 24 s search.
 *
 * ── NOTHING HERE THROWS, AND THE FALLBACK IS NOT SILENCE ──────────────────────────────────────
 * `lib/llm/narrate.ts`'s contract, with its conclusion inverted for this shape of answer. There,
 * "the only safe fallback for prose is the absence of prose", because no mechanical transformation
 * turns a number into a truthful sentence. Here the fallback is a real answer we can compute — the
 * text ranking — so `null` means "use it, and say the ranking degraded". An empty result list after
 * a semantic search would read as "your conversation does not contain this", which is a false claim
 * about the runner's own history.
 */

/**
 * ── THE PROMPT ────────────────────────────────────────────────────────────────────────────────
 * Deliberately NOT added to `lib/nina/prompts/`. That barrel carries `NINA_PROMPT_VERSION`, which
 * its own header says "covers the system text AND every tool schema" and must be bumped by hand so
 * that "a change in her behaviour can be traced to the commit that caused it". A search ranker is
 * not her behaviour; bumping her version for it would file a false report in `nina_turns`. It is
 * also a file phase 4 may be editing concurrently.
 *
 * The bilingual instruction is load-bearing, not decoration: the conversation is mixed Indonesian
 * and English, which is the same fact that ruled out `to_tsvector` for the text half.
 */
export const NINA_SEARCH_SYSTEM_PROMPT = `You rank search results over a private chat log between a runner ("HIM") and Nina, his running coach ("HER"). The log is a mix of Indonesian and English; treat both as the same language for the purpose of meaning.

You receive a QUERY and a numbered list of CANDIDATES, one per line, tab separated:

<index>\t<HIM|HER|TITLE>\t<session title>\t<text>

Return the indexes of the candidates whose MEANING answers the query, most relevant first.

Judge meaning, not shared words. A query about feeling wrecked after a long run should match a message about legs that would not move, even with no word in common. Do not include a candidate that is merely on the same broad subject.

Return at most ${SEARCH_RESULT_MAX} indexes. Return only indexes that appear in the list.

Reply with one JSON object and nothing else — no markdown fences, no commentary:

{"ranked": [12, 3, 40]}

If nothing is genuinely relevant, reply {"ranked": []}.`

/**
 * The seam the unit suite injects at, mirroring `lib/llm/narrate.ts`'s `LlmClientLike` and F04's
 * `ExtractDeps` for the same reason: this module opens with `import 'server-only'` and reaches
 * `@/lib/env` through the client, so the only honest way to test the parse and the failure paths is
 * to hand it a client.
 */
export interface SemanticRankerClient {
  messages: {
    create(
      body: Anthropic.MessageCreateParamsNonStreaming,
      options?: { timeout?: number },
    ): Promise<Anthropic.Message>
  }
}

function textOf(message: Anthropic.Message): string {
  let out = ''
  for (const block of message.content) {
    if (block.type === 'text') out += block.text
  }
  return out
}

/**
 * The testable core. Client and model injected; no database, no environment.
 *
 * **No `tools` and no `tool_choice`.** `narrate.ts` and `turn.ts` use a tool because their payloads
 * are rich nested objects behind Zod; this one is `{"ranked":[int]}`. `lib/llm/extractJson.ts` is
 * the codebase's already-proven answer for pulling an object out of whatever the model actually
 * said — ported verbatim from `research/score.mjs` and explicitly "not improved" — it returns
 * `null` rather than throwing on every failure mode, and it rejects a bare array, which is why the
 * payload is an object with one key rather than a naked array.
 *
 * **`thinking: { type: 'disabled' }` is not optional.** `lib/llm/narrate.ts`'s `baseBody` records
 * the 2026-08-26 incident: `glm-5.3` began emitting an extended thinking block by default, it ate
 * the whole `max_tokens` ceiling before producing any answer, and the insights table stopped
 * growing for 31 hours with nothing recording why. At `max_tokens: ${SEMANTIC_MAX_TOKENS}` that
 * failure is instant and total. Both existing callers send this field; so does this one.
 *
 * The allowed request surface on this endpoint is `model · max_tokens · system · messages · tools ·
 * tool_choice · thinking` and nothing else — no `temperature`, no `cache_control`. It is
 * Anthropic-*compatible*, not Anthropic.
 */
export async function rankNinaSearchHitsWith(
  client: SemanticRankerClient,
  model: string,
  input: { query: string; candidates: readonly NinaSearchCandidate[] },
): Promise<number[] | null> {
  if (input.candidates.length === 0) return null

  const body: Anthropic.MessageCreateParamsNonStreaming = {
    model,
    max_tokens: SEMANTIC_MAX_TOKENS,
    system: NINA_SEARCH_SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: `QUERY: ${input.query}\n\nCANDIDATES:\n${semanticCandidateBlock(input.candidates)}`,
      },
    ],
    thinking: { type: 'disabled' },
  }

  let message: Anthropic.Message
  try {
    message = await client.messages.create(body, { timeout: SEMANTIC_TIMEOUT_MS })
  } catch (cause) {
    /* `console.warn`, never `console.error`: an unavailable model is an expected state of this
       feature, not an incident — `logLlmFailure`'s rule in `lib/llm/narrate.ts`. The caller falls
       back to the text ranking and the field says so. */
    console.warn('[nina] semantic search call failed', { error: String(cause) })
    return null
  }

  /* A `max_tokens` stop is a response cut mid-object, and the same prompt at the same ceiling will
     cut it again — `narrate.ts`'s reasoning for not repairing one. There is no repair here at all,
     so this is simply a degrade. If it ever fires, SEMANTIC_MAX_TOKENS is the bug: 400 tokens is
     ~15x the 20 integers the answer can contain. */
  if (message.stop_reason === 'max_tokens') {
    console.warn('[nina] semantic search was cut at max_tokens', {
      outputTokens: message.usage?.output_tokens ?? 0,
    })
    return null
  }

  return parseSemanticRanking(extractJsonObject(textOf(message)), input.candidates.length)
}

/**
 * **The guarded entry point.** `scripts/check-llm-payload-boundary.mjs` sanctions this symbol in
 * this file and in `lib/nina/searchActions.ts` and nowhere else, so no page render can await it
 * (invariant 2). It is reached from a Server Action fired by a debounced client effect — the same
 * shape as `describeNinaImage` firing from `Composer`'s pick handler.
 */
export async function rankNinaSearchHits(input: {
  query: string
  candidates: readonly NinaSearchCandidate[]
}): Promise<number[] | null> {
  return rankNinaSearchHitsWith(narrativeClient(), narrativeModel(), input)
}
