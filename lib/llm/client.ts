import 'server-only'

import Anthropic from '@anthropic-ai/sdk'

import { env } from '@/lib/env'

/**
 * The `glm-5.3` client — **the narrative endpoint only**.
 *
 * ── WHY THERE ARE TWO CLIENTS IN THIS DIRECTORY AND THEY SHARE NOTHING ────────────────────────
 * `lib/llm/vision.ts` is a bare `fetch` against `api.z.ai/api/coding/paas/v4`, which speaks
 * OpenAI Chat Completions. This one is `@anthropic-ai/sdk` against `api.z.ai/api/anthropic`,
 * which speaks Anthropic Messages. The request envelopes genuinely differ — an image part is
 * `{ type: 'image_url', image_url: { url } }` there and `{ type: 'image', source: {…} }` here —
 * so one client cannot serve both, and the SDK buys nothing on the vision side (roadmap §3).
 *
 * **One credential, two base URLs (R-40).** `LLM_API_KEY` authenticates both; the SDK sends it as
 * `x-api-key`, the vision client as a Bearer token. There is deliberately no `LLM_VISION_API_KEY`
 * — a second variable holding a copy of the first is a rotation bug waiting to happen.
 *
 * ── WHAT THE TOKEN-FLOOR GUARD IS *NOT* DOING HERE ────────────────────────────────────────────
 * D3's floor lives in `vision.ts` and is not ported. It exists because the Anthropic-shaped
 * endpoint accepts an image block, returns 200, and silently drops the image
 * (IMPLEMENTATION_PLAN §1.1). **F07 sends no images, ever.** A guard against a condition that
 * cannot arise is dead code that reads like a live defence, which is worse than no guard at all.
 *
 * Lazy singleton, not a module-level `new`: `lib/env.ts` already crashes the build on a missing
 * key, so constructing eagerly buys no earlier failure — it only makes every module that so much
 * as imports a type from here pay for an HTTP agent.
 */

let client: Anthropic | null = null

export function narrativeClient(): Anthropic {
  client ??= new Anthropic({
    apiKey: env.LLM_API_KEY,
    baseURL: env.LLM_BASE_URL,
    /**
     * Retries are OFF, and the deadline arithmetic in `narrate.ts` is why. The SDK's default is
     * two silent retries with backoff; layered under a 15 s `timeout` that means one "15 s" call
     * can occupy 45 s of a 28 s overall budget and starve the repair round-trip that would have
     * fixed the response. This module's caller does its own single, budgeted retry — the repair —
     * and that is the retry that has a chance of changing the outcome.
     */
    maxRetries: 0,
  })
  return client
}

/** The model id, read once at the call site so a test can pass its own. */
export function narrativeModel(): string {
  return env.LLM_MODEL
}
