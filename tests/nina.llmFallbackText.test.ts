import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type Anthropic from '@anthropic-ai/sdk'

import {
  NINA_FALLBACK_MIN_BUDGET_MS,
  ninaFallbackTextClient,
  toAnthropicMessage,
  toOpenRouterChatBody,
} from '../lib/nina/llmFallbackText.ts'
/* Phase 3's shared constants module — this phase imports them, it does not declare them. */
import { NINA_FALLBACK_TEXT_MODEL, OPENROUTER_CHAT_URL } from '../lib/nina/openrouter.ts'
import type { NinaLlmClientLike } from '../lib/nina/turn.ts'

/**
 * `vi.mock`'s factory is lifted above every declaration in this file, so the spy is minted in
 * `vi.hoisted` — the arrangement `tests/nina.resend.test.ts:42-54` documents.
 *
 * Phase 1 owns `logNinaError`'s real implementation and its promise never to throw. This suite
 * asserts only what THIS phase is responsible for: that it is called, once per failed attempt,
 * with the right provider/model/input, and that its own rejection cannot break the call.
 *
 * **The generic on `vi.fn` is load-bearing**, exactly as `tests/nina.imagecall.test.ts:8-13`
 * warns: a bare `vi.fn(async () => {})` types its own parameters as the empty tuple, and
 * `mock.calls[0]?.[0]` then becomes "tuple of length 0 has no element at index 0" — a type error
 * where an assertion was meant. It is spelled `Record<string, unknown>` rather than imported from
 * Phase 1 so this suite does not fail to COMPILE if Phase 1's exported row type is spelled
 * differently; the field names are asserted structurally below, which is where a mismatch should
 * surface.
 */
const { logNinaError } = vi.hoisted(() => ({
  logNinaError: vi.fn<(row: Record<string, unknown>) => Promise<void>>(async () => {}),
}))

vi.mock('../lib/nina/errorlogs.ts', () => ({ logNinaError }))

const SEND_TOOL_STUB: Anthropic.Tool = {
  name: 'send',
  description: 'Send your reply. Always answer with this tool.',
  input_schema: {
    type: 'object',
    required: ['bubbles'],
    properties: { bubbles: { type: 'array' } },
  },
}

/** What `ninaBody` (`lib/nina/turn.ts:718-743`) actually builds, reproduced field for field. */
function ninaBodyLike(
  overrides: Partial<Anthropic.MessageCreateParamsNonStreaming> = {},
): Anthropic.MessageCreateParamsNonStreaming {
  return {
    model: 'glm-5.3',
    max_tokens: 2_400,
    system: 'You are Nina.',
    messages: [{ role: 'user', content: 'pagi' }],
    tools: [SEND_TOOL_STUB],
    tool_choice: { type: 'any' },
    thinking: { type: 'disabled' },
    ...overrides,
  }
}

function okCompletion(body: unknown) {
  return new Response(JSON.stringify(body), { status: 200 })
}

/** A z.ai client that always throws — the 2026-09-11 incident, in one object. */
function deadPrimary(error = new Error('Connection error.')): NinaLlmClientLike {
  return { messages: { create: vi.fn(async () => Promise.reject(error)) } }
}

describe('toOpenRouterChatBody', () => {
  it('translates the envelope `ninaBody` builds, and swaps in the fallback model', () => {
    const out = toOpenRouterChatBody(ninaBodyLike())

    expect(out.model).toBe(NINA_FALLBACK_TEXT_MODEL)
    expect(out.max_tokens).toBe(2_400)
    /*
     * Measured 2026-09-12 13:11 WIB: OpenRouter rejected `reasoning: { enabled: false }` for
     * `z-ai/glm-5.3-flash` with `400 "Reasoning is mandatory for this endpoint and cannot be
     * disabled."` — the safety net this incident exists for was itself down. Sending no
     * reasoning-control field at all is `vision.ts:112-117`'s already-established precedent for
     * this same provider/model: OpenRouter's reasoning controls have never been probed from this
     * codebase, so nothing here should assume a shape it can reject.
     */
    expect(out).not.toHaveProperty('reasoning')
    expect(out.messages).toEqual([
      { role: 'system', content: 'You are Nina.' },
      { role: 'user', content: 'pagi' },
    ])
    expect(out.tools).toEqual([
      {
        type: 'function',
        function: {
          name: 'send',
          description: SEND_TOOL_STUB.description,
          parameters: SEND_TOOL_STUB.input_schema,
        },
      },
    ])
    /* `{ type: 'any' }` is "call SOMETHING". */
    expect(out.tool_choice).toBe('required')
  })

  it('translates forced send — the loop’s termination property — into a function choice', () => {
    const out = toOpenRouterChatBody(
      ninaBodyLike({ tool_choice: { type: 'tool', name: 'send' }, tools: [SEND_TOOL_STUB] }),
    )
    expect(out.tool_choice).toEqual({ type: 'function', function: { name: 'send' } })
  })

  it('replays a completed tool round: assistant tool_calls, then a matching tool message', () => {
    const out = toOpenRouterChatBody(
      ninaBodyLike({
        messages: [
          { role: 'user', content: 'kemarin lari berapa?' },
          {
            role: 'assistant',
            content: [
              { type: 'text', text: 'sebentar ya' },
              {
                type: 'tool_use',
                id: 'toolu_01ABC',
                name: 'lookup_runs',
                input: { dates: ['2026-09-11'] },
              },
            ],
          },
          {
            role: 'user',
            content: [{ type: 'tool_result', tool_use_id: 'toolu_01ABC', content: '{"runs":[]}' }],
          },
        ],
      }),
    )

    expect(out.messages).toEqual([
      { role: 'system', content: 'You are Nina.' },
      { role: 'user', content: 'kemarin lari berapa?' },
      {
        role: 'assistant',
        content: 'sebentar ya',
        tool_calls: [
          {
            id: 'toolu_01ABC',
            type: 'function',
            function: { name: 'lookup_runs', arguments: '{"dates":["2026-09-11"]}' },
          },
        ],
      },
      { role: 'tool', tool_call_id: 'toolu_01ABC', content: '{"runs":[]}' },
    ])
  })

  it('carries is_error into the tool text and drops thinking blocks', () => {
    const out = toOpenRouterChatBody(
      ninaBodyLike({
        messages: [
          {
            role: 'assistant',
            content: [
              { type: 'thinking', thinking: 'hmm', signature: 'sig' },
              { type: 'tool_use', id: 'toolu_01X', name: 'lookup_runs', input: {} },
            ],
          },
          {
            role: 'user',
            content: [
              {
                type: 'tool_result',
                tool_use_id: 'toolu_01X',
                content: 'bad date',
                is_error: true,
              },
            ],
          },
        ],
      }),
    )

    /* This input carries no leading user turn, so: [0] system, [1] assistant, [2] tool. */
    const assistant = out.messages[1]
    expect(assistant).toEqual({
      role: 'assistant',
      content: null,
      tool_calls: [
        { id: 'toolu_01X', type: 'function', function: { name: 'lookup_runs', arguments: '{}' } },
      ],
    })
    expect(out.messages[2]).toEqual({
      role: 'tool',
      tool_call_id: 'toolu_01X',
      content: 'ERROR: bad date',
    })
  })
})

describe('toAnthropicMessage', () => {
  it('synthesizes what findSendBlock and usageOf read', () => {
    const message = toAnthropicMessage(
      {
        id: 'gen-1',
        model: NINA_FALLBACK_TEXT_MODEL,
        choices: [
          {
            finish_reason: 'tool_calls',
            message: {
              content: null,
              tool_calls: [
                {
                  id: 'call_abc',
                  type: 'function',
                  function: { name: 'send', arguments: '{"bubbles":["pagi juga"]}' },
                },
              ],
            },
          },
        ],
        usage: { prompt_tokens: 1_234, completion_tokens: 56 },
      },
      NINA_FALLBACK_TEXT_MODEL,
    )

    expect(message.type).toBe('message')
    expect(message.role).toBe('assistant')
    expect(message.stop_reason).toBe('tool_use')
    expect(message.usage.input_tokens).toBe(1_234)
    expect(message.usage.output_tokens).toBe(56)

    const block = message.content[0]
    expect(block?.type).toBe('tool_use')
    if (block?.type !== 'tool_use') throw new Error('expected a tool_use block')
    expect(block.name).toBe('send')
    expect(block.input).toEqual({ bubbles: ['pagi juga'] })
    /* Anthropic-shaped, so a LATER round that succeeds at z.ai can match its tool_result. */
    expect(block.id.startsWith('toolu_')).toBe(true)
  })

  it('maps a truncated completion onto the one stop_reason turn.ts actually compares', () => {
    const message = toAnthropicMessage(
      { choices: [{ finish_reason: 'length', message: { content: 'half a sen' } }] },
      NINA_FALLBACK_TEXT_MODEL,
    )
    expect(message.stop_reason).toBe('max_tokens')
  })

  it('throws on an empty completion rather than returning a message with no blocks', () => {
    expect(() =>
      toAnthropicMessage({ choices: [{ finish_reason: 'stop', message: { content: '' } }] }, 'x'),
    ).toThrow(/empty completion/)
  })

  it('a tool_use id survives a round trip back to the OpenAI side', () => {
    const message = toAnthropicMessage(
      {
        choices: [
          {
            finish_reason: 'tool_calls',
            message: {
              tool_calls: [
                {
                  id: 'call_9',
                  type: 'function',
                  function: { name: 'lookup_runs', arguments: '{}' },
                },
              ],
            },
          },
        ],
      },
      'x',
    )
    const use = message.content[0]
    if (use?.type !== 'tool_use') throw new Error('expected a tool_use block')

    /* Exactly what `turn.ts:1032-1033` then pushes back into the next request. */
    const next = toOpenRouterChatBody(
      ninaBodyLike({
        messages: [
          { role: 'assistant', content: message.content },
          { role: 'user', content: [{ type: 'tool_result', tool_use_id: use.id, content: '{}' }] },
        ],
      }),
    )

    const assistant = next.messages[1]
    const tool = next.messages[2]
    if (assistant?.role !== 'assistant' || tool?.role !== 'tool') {
      throw new Error('expected an assistant/tool pair')
    }
    expect(assistant.tool_calls?.[0]?.id).toBe(tool.tool_call_id)
  })
})

describe('ninaFallbackTextClient', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.clearAllMocks()
    delete process.env.OPENROUTER_API_KEY
  })

  /*
   * FIRST, and it must stay first: `ninaEnv()` memoises its first successful load for the whole
   * process (`lib/env.ts:222-226`), so once any case below sets the key this one can no longer
   * observe its absence. Same ordering constraint, same reason, as `tests/nina.imagecall.test.ts`.
   */
  it('logs the unconfigured fallback instead of hiding it, when the key is absent', async () => {
    const fetchMock = vi.fn<typeof fetch>()
    vi.stubGlobal('fetch', fetchMock)

    const client = ninaFallbackTextClient(deadPrimary(), { userId: 'usr_1' })

    await expect(client.messages.create(ninaBodyLike(), { timeout: 20_000 })).rejects.toThrow()

    expect(fetchMock).not.toHaveBeenCalled()
    expect(logNinaError).toHaveBeenCalledTimes(2)
    expect(logNinaError.mock.calls[1]?.[0]).toMatchObject({
      category: 'text',
      provider: 'openrouter',
      model: NINA_FALLBACK_TEXT_MODEL,
    })
    expect(String(logNinaError.mock.calls[1]?.[0]?.errorMessage)).toContain('OPENROUTER_API_KEY')
  })

  describe('with a key', () => {
    beforeEach(() => {
      process.env.OPENROUTER_API_KEY = 'sk-or-unit-test-never-sent'
    })

    it('does not touch OpenRouter, or the log, when z.ai answers', async () => {
      const fetchMock = vi.fn<typeof fetch>()
      vi.stubGlobal('fetch', fetchMock)

      const zaiMessage = { content: [], stop_reason: 'end_turn' } as unknown as Anthropic.Message
      const primary: NinaLlmClientLike = {
        messages: { create: vi.fn(async () => zaiMessage) },
      }

      const result = await ninaFallbackTextClient(primary).messages.create(ninaBodyLike(), {
        timeout: 22_000,
      })

      expect(result).toBe(zaiMessage)
      expect(fetchMock).not.toHaveBeenCalled()
      expect(logNinaError).not.toHaveBeenCalled()
    })

    it('R1: a z.ai throw is logged and rescued by OpenRouter', async () => {
      const fetchMock = vi.fn<typeof fetch>(async () =>
        okCompletion({
          id: 'gen-2',
          choices: [
            {
              finish_reason: 'tool_calls',
              message: {
                tool_calls: [
                  {
                    id: 'call_1',
                    type: 'function',
                    function: { name: 'send', arguments: '{"bubbles":["halo"]}' },
                  },
                ],
              },
            },
          ],
          usage: { prompt_tokens: 10, completion_tokens: 3 },
        }),
      )
      vi.stubGlobal('fetch', fetchMock)

      const message = await ninaFallbackTextClient(deadPrimary(), {
        userId: 'usr_1',
      }).messages.create(ninaBodyLike(), { timeout: 22_000 })

      expect(fetchMock).toHaveBeenCalledTimes(1)
      expect(String(fetchMock.mock.calls[0]?.[0])).toBe(OPENROUTER_CHAT_URL)

      const init = fetchMock.mock.calls[0]?.[1]
      const sent = JSON.parse(String(init?.body)) as { model: string; tool_choice: string }
      expect(sent.model).toBe(NINA_FALLBACK_TEXT_MODEL)
      expect(sent.tool_choice).toBe('required')
      /* The actual wire payload — not just `toOpenRouterChatBody`'s return type. */
      expect(sent).not.toHaveProperty('reasoning')

      const send = message.content[0]
      if (send?.type !== 'tool_use') throw new Error('expected a tool_use block')
      expect(send.name).toBe('send')
      expect(send.input).toEqual({ bubbles: ['halo'] })

      /* ONE row: the z.ai attempt that failed. The rescue itself is not a failure. */
      expect(logNinaError).toHaveBeenCalledTimes(1)
      expect(logNinaError.mock.calls[0]?.[0]).toMatchObject({
        category: 'text',
        provider: 'zai',
        model: 'glm-5.3',
        userId: 'usr_1',
        timeoutMs: 22_000,
        imageUrl: null,
      })
      expect(String(logNinaError.mock.calls[0]?.[0]?.fullInput)).toContain('You are Nina.')
    })

    it('R2: both providers failing writes two rows and still rejects', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn<typeof fetch>(async () => new Response('upstream is on fire', { status: 502 })),
      )

      await expect(
        ninaFallbackTextClient(deadPrimary()).messages.create(ninaBodyLike(), { timeout: 22_000 }),
      ).rejects.toThrow(/openrouter HTTP 502/)

      expect(logNinaError).toHaveBeenCalledTimes(2)
      expect(logNinaError.mock.calls[0]?.[0]).toMatchObject({ provider: 'zai' })
      expect(logNinaError.mock.calls[1]?.[0]).toMatchObject({
        provider: 'openrouter',
        model: NINA_FALLBACK_TEXT_MODEL,
      })
      /* The OpenRouter row's `fullInput` is the TRANSLATED payload, not the Anthropic one. */
      expect(String(logNinaError.mock.calls[1]?.[0]?.fullInput)).toContain(NINA_FALLBACK_TEXT_MODEL)
    })

    it('skips the fallback, and rethrows z.ai’s own error, with no budget left', async () => {
      const fetchMock = vi.fn<typeof fetch>()
      vi.stubGlobal('fetch', fetchMock)

      const zaiError = new Error('Connection error.')
      await expect(
        ninaFallbackTextClient(deadPrimary(zaiError)).messages.create(ninaBodyLike(), {
          timeout: NINA_FALLBACK_MIN_BUDGET_MS - 1,
        }),
      ).rejects.toBe(zaiError)

      expect(fetchMock).not.toHaveBeenCalled()
      expect(logNinaError).toHaveBeenCalledTimes(1)
    })

    it('a log write that rejects cannot cost a reply that succeeded', async () => {
      logNinaError.mockRejectedValueOnce(new Error('nina_error_logs is unreachable'))
      vi.stubGlobal(
        'fetch',
        vi.fn<typeof fetch>(async () =>
          okCompletion({ choices: [{ finish_reason: 'stop', message: { content: 'halo' } }] }),
        ),
      )

      const message = await ninaFallbackTextClient(deadPrimary()).messages.create(ninaBodyLike(), {
        timeout: 22_000,
      })

      const block = message.content[0]
      expect(block?.type).toBe('text')
    })

    it('serves a whole multi-round turn from one client instance', async () => {
      const fetchMock = vi.fn<typeof fetch>(async () =>
        okCompletion({
          choices: [
            {
              finish_reason: 'tool_calls',
              message: {
                tool_calls: [
                  { id: 'call_r', type: 'function', function: { name: 'send', arguments: '{}' } },
                ],
              },
            },
          ],
        }),
      )
      vi.stubGlobal('fetch', fetchMock)

      const client = ninaFallbackTextClient(deadPrimary(), { userId: 'usr_1' })

      /* `MAX_TOOL_ROUNDS + 1` calls on ONE client, as `runNinaTurnWith`'s loop makes them. */
      for (let call = 0; call < 3; call++) {
        await client.messages.create(ninaBodyLike(), { timeout: 20_000 })
      }

      expect(fetchMock).toHaveBeenCalledTimes(3)
      expect(logNinaError).toHaveBeenCalledTimes(3)
      for (const call of logNinaError.mock.calls) {
        expect(call[0]).toMatchObject({ category: 'text', provider: 'zai' })
      }
    })
  })
})
