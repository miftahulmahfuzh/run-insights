// MUST be first: it loads .env.local before any import below reaches lib/env.ts, which parses
// process.env eagerly. See that file's comment — this ordering is the whole point, and the
// narrate suite failed with `401 token expired or incorrect` before it existed.
import './loadEnvLocal'

import { LOOKUP_RUNS_TOOL, SEND_TOOL } from '@/lib/nina/prompts'
import { NinaSendPayloadSchema } from '@/lib/nina/schema'
import { ninaClient, ninaModel, runNinaTurnWith } from '@/lib/nina/turn'
import { fakeTurnDeps, ninaContextFixture, runHistoryFixture } from '@/tests/fixtures/ninaTurn'
import { describe, expect, it } from 'vitest'

/**
 * **The one thing the unit suite cannot prove: that this endpoint honours a real tool round
 * trip.** An agentic loop has no text-shaped alternative to `tool_use` / `tool_result`, and
 * `api.z.ai/api/anthropic` is Anthropic-*compatible*, not Anthropic.
 *
 * **This suite is a REGRESSION guard, not an experiment.** The 2026-09-03 probe already answered
 * both questions yes, with numbers: `tool_choice: {type:'any'}` honoured, `tool_use` emitted,
 * `tool_result` accepted on the next turn, round 2 answering with another `tool_use` and quoting
 * the injected facts faithfully, 6.2 s + 7.6 s = 13.8 s for the two-round turn. So a failure here
 * is a *change* at the endpoint, and the documented escape (two plain text turns instead of tools)
 * is a phase-shaped decision to reach for then — not a live branch carried in the code now.
 *
 * Note what `{ type: 'tool', name: 'send' }` on every call would cost if anyone reaches for it as
 * a fallback: it silently disables the tool loop entirely, because `send` becomes the only tool
 * she can reach. The symptom is "she stopped looking anything up", with nothing failing. That is
 * why this had to be a live test rather than a production discovery.
 *
 * Named `live` so `npm run test:live` picks it up; excluded from every default run.
 */
const HAS_KEY =
  process.env.LLM_API_KEY != null &&
  process.env.LLM_API_KEY !== '' &&
  process.env.LLM_API_KEY !== 'unit-test-key-never-sent' &&
  process.env.LLM_API_KEY !== 'ci-dummy-key'

describe.skipIf(!HAS_KEY)('nina live', () => {
  it('live: completes a real tool round trip and returns a valid send payload', async () => {
    const result = await runNinaTurnWith(fakeTurnDeps(ninaClient(), { model: ninaModel() }), {
      userId: 'live',
      context: ninaContextFixture(),
      history: runHistoryFixture(),
      sourceMessageId: null,
      runnerText: 'na, coba compare run gw tanggal 3 vs 1 bulan ini',
    })
    expect(result.source).not.toBe('unavailable')
    expect(NinaSendPayloadSchema.safeParse(result.payload).success).toBe(true)
  })

  it('live: accepts tool_choice { type: "any" } without a 400', async () => {
    const message = await ninaClient().messages.create({
      model: ninaModel(),
      max_tokens: 256,
      system: 'Call a tool. Say nothing else.',
      messages: [{ role: 'user', content: 'What did I run on 2026-09-01?' }],
      tools: [SEND_TOOL, LOOKUP_RUNS_TOOL],
      tool_choice: { type: 'any' },
      thinking: { type: 'disabled' },
    })
    expect(message.content.some((block) => block.type === 'tool_use')).toBe(true)
  })

  /**
   * **RU-13, live.** Given only the clock in her context, she must emit an ISO date — there is no
   * server-side Indonesian date parser and there is deliberately never going to be one. Measured
   * on 2026-09-03: *"na, lari gw kemaren gimana?"* produced `lookup_runs({dates:["2026-09-02"]})`.
   * This case is what keeps that true.
   */
  it('live: emits an ISO date from an Indonesian reference, with no parser on our side', async () => {
    const message = await ninaClient().messages.create({
      model: ninaModel(),
      max_tokens: 256,
      system: 'Today is Wednesday 2026-09-03. Call a tool. Say nothing else.',
      messages: [{ role: 'user', content: 'na, lari gw kemaren gimana?' }],
      tools: [SEND_TOOL, LOOKUP_RUNS_TOOL],
      tool_choice: { type: 'tool', name: LOOKUP_RUNS_TOOL.name },
      thinking: { type: 'disabled' },
    })
    const call = message.content.find(
      (block) => block.type === 'tool_use' && block.name === LOOKUP_RUNS_TOOL.name,
    )
    expect(call).toBeDefined()
    const dates = (call as { input: { dates?: unknown } }).input.dates
    expect(Array.isArray(dates)).toBe(true)
    for (const date of dates as unknown[]) {
      expect(String(date)).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    }
  })
})
