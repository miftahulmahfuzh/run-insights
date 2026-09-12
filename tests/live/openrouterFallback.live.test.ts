// MUST be first — same ordering reason as `tests/live/nina.live.test.ts`.
import { hasRealLlmKey } from './loadEnvLocal'

import { ninaFallbackTextClient } from '@/lib/nina/llmFallbackText'
import { SEND_TOOL } from '@/lib/nina/prompts/tools'
import { NinaSendPayloadSchema } from '@/lib/nina/schema'
import type { NinaLlmClientLike } from '@/lib/nina/turn'
import { describe, expect, it } from 'vitest'

/**
 * **Regression guard for the 2026-09-12 13:11 WIB incident**, read straight off
 * `nina_error_logs`: z.ai hit a 429, `ninaFallbackTextClient` fell back to OpenRouter's
 * `z-ai/glm-5.3-flash`, and OpenRouter rejected that call with `400 "Reasoning is mandatory for
 * this endpoint and cannot be disabled."` — the request carried `reasoning: { enabled: false }`.
 * Both providers failed on the same turn; the safety net built for exactly this z.ai failure mode
 * was itself down.
 *
 * The unit suite (`tests/nina.llmFallbackText.test.ts`) proves the request no longer carries a
 * `reasoning` field at all. It cannot prove OpenRouter accepts that shape — only a live call to
 * the real endpoint can, which is what this does: force the fallback path with a primary that
 * always throws, and assert the real OpenRouter call succeeds end to end.
 */
const HAS_KEY = hasRealLlmKey(process.env.OPENROUTER_API_KEY)

/** A z.ai client that always throws, forcing every call onto the OpenRouter fallback. */
function deadPrimary(): NinaLlmClientLike {
  return { messages: { create: async () => Promise.reject(new Error('forced z.ai failure')) } }
}

describe.skipIf(!HAS_KEY)('openrouter text fallback live', () => {
  it('live: z-ai/glm-5.3-flash accepts the request with no reasoning field', async () => {
    const client = ninaFallbackTextClient(deadPrimary())

    const message = await client.messages.create(
      {
        model: 'glm-5.3',
        max_tokens: 2_400,
        system: 'You are Nina, a running coach. Always reply using the send tool.',
        messages: [{ role: 'user', content: 'pagi' }],
        tools: [SEND_TOOL],
        tool_choice: { type: 'tool', name: 'send' },
      },
      { timeout: 22_000 },
    )

    const send = message.content.find((block) => block.type === 'tool_use')
    expect(send).toBeDefined()
    if (send?.type !== 'tool_use') throw new Error('expected a tool_use block')
    expect(send.name).toBe('send')
    expect(NinaSendPayloadSchema.safeParse(send.input).success).toBe(true)
  })
})
