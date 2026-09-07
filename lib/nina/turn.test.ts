import {
  fakeToolGateway,
  fakeTurnDeps,
  fakeTurnStore,
  ninaContextFixture,
  ninaTuningFixture,
  proseMessage,
  runHistoryFixture,
  scriptedClient,
  sendMessage,
  thinkingOnlyMessage,
  toolUseMessage,
  truncatedMessage,
  withLeadingThinking,
} from '@/tests/fixtures/ninaTurn'
import { describe, expect, it } from 'vitest'

import { LOOKUP_RUNS_TOOL, NINA_SYSTEM_PROMPT, SEND_TOOL, buildNinaSystemPrompt } from './prompts'
import { normalizeNinaTrigger, type NinaShortcutMatchable } from './shortcuts'
import {
  MAX_TOOL_ROUNDS,
  NINA_MAX_TOKENS,
  NINA_MIN_ROUND_BUDGET_MS,
  NINA_TURN_BUDGET,
  runNinaTurn,
  runNinaTurnWith,
  type NinaTurnInput,
} from './turn'
import { NINA_TUNING_DEFAULTS } from './tuning'

function input(overrides: Partial<NinaTurnInput> = {}): NinaTurnInput {
  return {
    userId: 'u1',
    context: ninaContextFixture(),
    /* Required on the input, not optional with a default inside the loop — see the field's own
     * note. A test that forgets it does not compile, which is the guarantee. */
    tuning: ninaTuningFixture(),
    history: runHistoryFixture(),
    sourceMessageId: 'm1',
    runnerText: 'lari gw kemaren gimana menurut lo?',
    ...overrides,
  }
}

/** A tuning with one trait at the top of its range. */
function tunedInput(overrides: Partial<NinaTurnInput> = {}): NinaTurnInput {
  return input({
    tuning: ninaTuningFixture({
      traits: { ...NINA_TUNING_DEFAULTS.traits, concerned: 100 },
    }),
    ...overrides,
  })
}

const GOOD = { bubbles: ['lumayan sih', 'tapi hr lo ketinggian'] }

/**
 * One of the real production expansions, lightly shortened. Long on purpose: the ledger's
 * `ADMIN_FACT_TEXT_MAX = 400` truncation is half of what R2 exists to escape, so a fixture short
 * enough to fit under it would test the wrong thing.
 */
const PEACH =
  'kalo dia remes pantat nina, nina bilang ahh sayang enak banget jangan berhenti dong, ' +
  'terus sampe nina lemes'

/**
 * A shortcut row shaped exactly as `listNinaShortcuts` returns one.
 *
 * `matchKey` is DERIVED through phase 1's own `normalizeNinaTrigger` rather than typed out by hand:
 * a hand-written key is a second implementation of the normalisation rule (NFC, drop `U+FE0F`,
 * collapse whitespace, trim, lowercase) and it would drift from the real one in silence.
 */
function shortcut(over: Partial<NinaShortcutMatchable> = {}): NinaShortcutMatchable {
  const trigger = over.trigger ?? '🍑'
  return {
    id: 'sc0000000001',
    kind: 'glyph',
    label: 'remes pantat',
    expansion: PEACH,
    enabled: true,
    ...over,
    trigger,
    matchKey: normalizeNinaTrigger(trigger),
  }
}

/** The assembled user turn for one input — the string the endpoint was actually sent. */
async function userTurnOf(turnInput: NinaTurnInput): Promise<string> {
  const client = scriptedClient([sendMessage(GOOD)])
  await runNinaTurnWith(fakeTurnDeps(client), turnInput)
  return client.calls[0]!.messages[0]!.content as string
}

describe('runNinaTurnWith — the happy path', () => {
  it('returns the bubbles from a single send call and makes no tool round', async () => {
    const client = scriptedClient([sendMessage(GOOD)])
    const result = await runNinaTurnWith(fakeTurnDeps(client), input())
    expect(result.source).toBe('llm')
    expect(result.payload?.bubbles).toEqual(GOOD.bubbles)
    expect(result.trace.rounds).toBe(0)
    expect(result.trace.toolCalls).toEqual([])
    expect(client.calls).toHaveLength(1)
  })

  it('drives the loop through a tool call and back — the exit criterion', async () => {
    const day = runHistoryFixture().runs[0]!.occurredOn
    const client = scriptedClient([
      toolUseMessage(LOOKUP_RUNS_TOOL.name, { dates: [day] }),
      sendMessage(GOOD),
    ])
    const result = await runNinaTurnWith(fakeTurnDeps(client), input())
    expect(result.source).toBe('llm')
    expect(result.trace.rounds).toBe(1)
    expect(result.trace.toolCalls).toEqual(['lookup_runs'])
    expect(client.calls).toHaveLength(2)

    // The second request carries the assistant tool_use turn and a matching tool_result.
    const second = client.calls[1]!
    expect(second.messages).toHaveLength(3)
    expect(second.messages[1]!.role).toBe('assistant')
    const results = second.messages[2]!.content as Array<{ type: string; tool_use_id: string }>
    expect(results[0]!.type).toBe('tool_result')
    expect(results[0]!.tool_use_id).toBe(`tu_${LOOKUP_RUNS_TOOL.name}`)
  })

  it('dispatches several tool_use blocks from one assistant turn as ONE round', async () => {
    const day = runHistoryFixture().runs[0]!.occurredOn
    const both = {
      ...toolUseMessage(LOOKUP_RUNS_TOOL.name, { dates: [day] }),
      content: [
        { type: 'tool_use', id: 'a', name: 'lookup_runs', input: { dates: [day] } },
        { type: 'tool_use', id: 'b', name: 'save_memory', input: { kind: 'fact', text: 'x' } },
      ],
    } as Parameters<typeof scriptedClient>[0][number]
    const gateway = fakeToolGateway()
    const client = scriptedClient([both, sendMessage(GOOD)])
    const result = await runNinaTurnWith(fakeTurnDeps(client, { gateway }), input())
    expect(result.trace.rounds).toBe(1)
    expect(result.trace.toolCalls).toEqual(['lookup_runs', 'save_memory'])
    expect(gateway.facts).toHaveLength(1)
  })

  it('records a tool she called ALONGSIDE send as dropped, and lets send win', async () => {
    const withSibling = {
      ...sendMessage(GOOD),
      content: [
        { type: 'tool_use', id: 'a', name: 'save_memory', input: { kind: 'fact', text: 'x' } },
        { type: 'tool_use', id: 'tu_send', name: SEND_TOOL.name, input: GOOD },
      ],
    } as Parameters<typeof scriptedClient>[0][number]
    const gateway = fakeToolGateway()
    const client = scriptedClient([withSibling])
    const result = await runNinaTurnWith(fakeTurnDeps(client, { gateway }), input())
    expect(result.source).toBe('llm')
    expect(result.trace.toolCalls).toEqual(['dropped:save_memory'])
    // Dropped means NOT dispatched: a tool_result nobody will read is pure latency.
    expect(gateway.facts).toHaveLength(0)
  })

  it('answers a turn with no trailing runner message — a proactive turn is not a bug', async () => {
    const client = scriptedClient([sendMessage(GOOD)])
    const result = await runNinaTurnWith(
      fakeTurnDeps(client),
      input({ runnerText: null, sourceMessageId: null, proactive: 'He committed a run. React.' }),
    )
    expect(result.source).toBe('llm')
    const userTurn = client.calls[0]!.messages[0]!.content as string
    expect(userTurn).toContain('NOBODY SAID ANYTHING')
    expect(userTurn).not.toContain('HE JUST SAID')
  })
})

describe('runNinaTurnWith — the repair', () => {
  it('repairs a malformed send EXACTLY ONCE and then succeeds', async () => {
    const client = scriptedClient([sendMessage({ bubbles: [] }), sendMessage(GOOD)])
    const result = await runNinaTurnWith(fakeTurnDeps(client), input())
    expect(result.source).toBe('llm_repair')
    expect(result.payload?.bubbles).toEqual(GOOD.bubbles)
    expect(client.calls).toHaveLength(2)

    // narrate.ts's three-turn text shape, not a tool_result: user -> assistant(text) -> user.
    const repair = client.calls[1]!
    expect(repair.messages).toHaveLength(3)
    expect(repair.messages[1]!.role).toBe('assistant')
    expect(typeof repair.messages[1]!.content).toBe('string')
    expect(repair.tool_choice).toEqual({ type: 'tool', name: SEND_TOOL.name })
  })

  it('degrades after ONE failed repair — never a second', async () => {
    const client = scriptedClient([
      sendMessage({ bubbles: [] }),
      sendMessage({ bubbles: ['a', 'b', 'c', 'd', 'e'] }),
    ])
    const result = await runNinaTurnWith(fakeTurnDeps(client), input())
    expect(result.source).toBe('unavailable')
    expect(result.payload).toBeNull()
    expect(client.calls).toHaveLength(2)
  })

  it('does not spend the repair on a malformed tool ARGUMENT — ruling (g)', async () => {
    // `lookup_runs({dates:['besok']})` gets a tool_result naming the problem, inside the round
    // it already cost. The repair budget is for a malformed `send` and nothing else.
    const client = scriptedClient([
      toolUseMessage(LOOKUP_RUNS_TOOL.name, { dates: ['besok'] }),
      sendMessage(GOOD),
    ])
    const result = await runNinaTurnWith(fakeTurnDeps(client), input())
    expect(result.source).toBe('llm')
    expect(client.calls).toHaveLength(2)
    const results = client.calls[1]!.messages[2]!.content as Array<{ is_error?: boolean }>
    expect(results[0]!.is_error).toBe(true)
  })

  it('does not repair a truncated reply — the ceiling is the bug, not the shape', async () => {
    const client = scriptedClient([truncatedMessage()])
    const result = await runNinaTurnWith(fakeTurnDeps(client), input())
    expect(result.source).toBe('unavailable')
    expect(client.calls).toHaveLength(1)
  })

  it('reports unavailable rather than throwing when the endpoint fails', async () => {
    const client = scriptedClient([new Error('502 Bad Gateway')])
    const result = await runNinaTurnWith(fakeTurnDeps(client), input())
    expect(result.source).toBe('unavailable')
    expect(result.payload).toBeNull()
  })

  it('reports unavailable when she answers in prose twice, and never a third time', async () => {
    const client = scriptedClient([proseMessage('lumayan sih'), proseMessage('lumayan sih')])
    const result = await runNinaTurnWith(fakeTurnDeps(client), input())
    expect(result.source).toBe('unavailable')
    // Two calls, not three: the second was already forced to `send` and answering it with prose
    // again means asking a third time would be asking the same question.
    expect(client.calls).toHaveLength(2)
  })
})

/**
 * MEASURED 2026-09-04: `tool_choice: { type: 'any' }` is a REQUEST, and this endpoint ignores it
 * on the call that follows a `tool_result` — `stop_reason: 'end_turn'`, `content [thinking, text]`,
 * her whole answer sitting in prose with no tool call anywhere. Intermittent: two earlier probes of
 * the same continuation did return a `tool_use`.
 *
 * Degrading there threw away a reply she had already written, so the loop asks once more with
 * `send` forced. These cases are that behaviour, and the first is the transcript.
 */
describe('runNinaTurnWith — prose instead of a tool call', () => {
  it('re-asks with send FORCED instead of degrading, and echoes her own prose back', async () => {
    const client = scriptedClient([proseMessage('lari lo tanggal 3 ga ada'), sendMessage(GOOD)])
    const result = await runNinaTurnWith(fakeTurnDeps(client), input())
    expect(result.source).toBe('llm')
    expect(result.payload?.bubbles).toEqual(GOOD.bubbles)
    expect(client.calls).toHaveLength(2)

    const retry = client.calls[1]!
    expect(retry.tool_choice).toEqual({ type: 'tool', name: SEND_TOOL.name })
    expect(retry.tools).toHaveLength(1)
    // Her prose is echoed as the assistant turn, so "say that again" refers to something present.
    expect(retry.messages).toHaveLength(3)
    expect(retry.messages[1]!.content).toBe('lari lo tanggal 3 ga ada')
    expect(String(retry.messages[2]!.content)).toContain('send')
  })

  it('does not spend the repair budget on it — that is for a malformed send', async () => {
    // Prose, then a MALFORMED send, then a good one. If the prose retry had eaten the repair,
    // the malformed send would have had nothing left and the turn would degrade.
    const client = scriptedClient([
      proseMessage('lumayan sih'),
      sendMessage({ bubbles: [] }),
      sendMessage(GOOD),
    ])
    const result = await runNinaTurnWith(fakeTurnDeps(client), input())
    expect(result.source).toBe('llm_repair')
    expect(result.payload?.bubbles).toEqual(GOOD.bubbles)
  })

  it('records prose:no_tool so the endpoint’s behaviour is measurable, and counts no round', async () => {
    const store = fakeTurnStore()
    const client = scriptedClient([proseMessage('lumayan sih'), sendMessage(GOOD)])
    const result = await runNinaTurn(input(), fakeTurnDeps(client, { store }))
    expect(result.trace.rounds).toBe(0)
    expect(result.trace.toolCalls).toEqual(['prose:no_tool'])
    expect(store.rows[0]!.toolCalls).toBe('prose:no_tool')
  })

  it('re-asks against the same messages when the turn was thinking and nothing else', async () => {
    const client = scriptedClient([thinkingOnlyMessage(), sendMessage(GOOD)])
    const result = await runNinaTurnWith(fakeTurnDeps(client), input())
    expect(result.source).toBe('llm')
    // Nothing to echo, so no turn is appended: the retry re-sends the original single message.
    expect(client.calls[1]!.messages).toHaveLength(1)
    expect(client.calls[1]!.tool_choice).toEqual({ type: 'tool', name: SEND_TOOL.name })
  })

  /**
   * **The measured shape, and the one a shared budget gets wrong.** Both tool rounds spent on real
   * tool calls, and then the FORCED `send` — `tool_choice: {type:'tool',name:'send'}` with
   * `tools: [SEND_TOOL]`, the strictest request this endpoint accepts — came back `end_turn` with
   * `[thinking, text]`. If the prose re-ask came out of `MAX_TOOL_ROUNDS`' allowance, or if the
   * `forceSend` degrade ran first, this turn would have no call left and her answer would be lost.
   */
  it('recovers when the FORCED send itself answers in prose, after both tool rounds', async () => {
    const day = runHistoryFixture().runs[0]!.occurredOn
    const tool = () => toolUseMessage(LOOKUP_RUNS_TOOL.name, { dates: [day] })
    const client = scriptedClient([
      tool(),
      tool(),
      proseMessage('tanggal 3 lo ga lari'),
      sendMessage(GOOD),
    ])
    const result = await runNinaTurnWith(fakeTurnDeps(client), input())
    expect(result.source).toBe('llm')
    expect(result.payload?.bubbles).toEqual(GOOD.bubbles)
    expect(result.trace.rounds).toBe(2)
    expect(result.trace.toolCalls).toEqual(['lookup_runs', 'lookup_runs', 'prose:no_tool'])
    expect(client.calls).toHaveLength(4)
  })

  it('re-asks exactly ONCE — a second prose answer degrades', async () => {
    const day = runHistoryFixture().runs[0]!.occurredOn
    const tool = () => toolUseMessage(LOOKUP_RUNS_TOOL.name, { dates: [day] })
    const client = scriptedClient([
      tool(),
      tool(),
      proseMessage('a'),
      proseMessage('b'),
      sendMessage(GOOD),
    ])
    const result = await runNinaTurnWith(fakeTurnDeps(client), input())
    expect(result.source).toBe('unavailable')
    expect(client.calls).toHaveLength(4)
    expect(result.trace.toolCalls).toEqual([
      'lookup_runs',
      'lookup_runs',
      'prose:no_tool',
      'prose:no_tool',
    ])
  })

  it('skips the re-ask rather than starting one it cannot finish', async () => {
    let value = 0
    const now = () => {
      const current = value
      value += NINA_TURN_BUDGET.overall - NINA_MIN_ROUND_BUDGET_MS + 1_000
      return current
    }
    const client = scriptedClient([proseMessage('lumayan sih'), sendMessage(GOOD)])
    const result = await runNinaTurnWith(fakeTurnDeps(client, { now }), input())
    expect(result.source).toBe('unavailable')
    expect(client.calls).toHaveLength(1)
  })

  it('still recovers when the prose arrives AFTER a real tool round', async () => {
    const day = runHistoryFixture().runs[0]!.occurredOn
    const client = scriptedClient([
      toolUseMessage(LOOKUP_RUNS_TOOL.name, { dates: [day] }),
      proseMessage('tanggal itu lo ga lari'),
      sendMessage(GOOD),
    ])
    const result = await runNinaTurnWith(fakeTurnDeps(client), input())
    expect(result.source).toBe('llm')
    expect(result.trace.rounds).toBe(1)
    expect(result.trace.toolCalls).toEqual(['lookup_runs', 'prose:no_tool'])
    expect(client.calls).toHaveLength(3)
  })
})

describe('runNinaTurnWith — the budget', () => {
  it('clamps the primary timeout to the primary budget', async () => {
    const client = scriptedClient([sendMessage(GOOD)])
    await runNinaTurnWith(fakeTurnDeps(client), input())
    expect(client.timeouts[0]).toBe(NINA_TURN_BUDGET.primary)
  })

  it('forces send instead of a second tool round when the budget is nearly gone', async () => {
    // Each clock read advances far enough that the round gate fails before the second call.
    let value = 0
    const now = () => {
      const current = value
      value += NINA_TURN_BUDGET.overall - NINA_MIN_ROUND_BUDGET_MS + 1_000
      return current
    }
    const day = runHistoryFixture().runs[0]!.occurredOn
    const client = scriptedClient([
      toolUseMessage(LOOKUP_RUNS_TOOL.name, { dates: [day] }),
      sendMessage(GOOD),
    ])
    await runNinaTurnWith(fakeTurnDeps(client, { now }), input())
    const last = client.calls[client.calls.length - 1]!
    expect(last.tool_choice).toEqual({ type: 'tool', name: SEND_TOOL.name })
    expect(last.tools).toHaveLength(1)
  })

  it('never makes more than MAX_TOOL_ROUNDS + 1 model calls', async () => {
    const day = runHistoryFixture().runs[0]!.occurredOn
    const tool = () => toolUseMessage(LOOKUP_RUNS_TOOL.name, { dates: [day] })
    const client = scriptedClient([tool(), tool(), tool(), tool()])
    const result = await runNinaTurnWith(fakeTurnDeps(client), input())
    expect(result.source).toBe('unavailable')
    expect(client.calls.length).toBeLessThanOrEqual(MAX_TOOL_ROUNDS + 1)
  })

  it('skips the repair rather than starting one it cannot finish', async () => {
    // One clock step burns the whole deadline, so the repair gate fails.
    let value = 0
    const now = () => {
      const current = value
      value += NINA_TURN_BUDGET.overall
      return current
    }
    const client = scriptedClient([sendMessage({ bubbles: [] }), sendMessage(GOOD)])
    const result = await runNinaTurnWith(fakeTurnDeps(client, { now }), input())
    expect(result.source).toBe('unavailable')
    expect(client.calls).toHaveLength(1)
  })
})

describe('runNinaTurnWith — the request envelope', () => {
  it('DISABLES THINKING on every body — primary, continuation and repair. Never remove.', async () => {
    const day = runHistoryFixture().runs[0]!.occurredOn
    const client = scriptedClient([
      toolUseMessage(LOOKUP_RUNS_TOOL.name, { dates: [day] }),
      sendMessage({ bubbles: [] }),
      sendMessage(GOOD),
    ])
    await runNinaTurnWith(fakeTurnDeps(client), input())
    expect(client.calls).toHaveLength(3)
    for (const body of client.calls) {
      expect(body.thinking).toEqual({ type: 'disabled' })
    }
  })

  /*
   * Asking for `thinking: disabled` and GETTING a thinking block is what this endpoint measurably
   * did on 2026-09-03, so the loop is asserted against the transcript rather than against the
   * request. These two cases are the ones a `content[0]` parser fails — and it would fail them as
   * "malformed reply", which is why the assertion is on `source` and not merely on `payload`.
   */
  it('finds the send block BEHIND an unrequested thinking block — never content[0]', async () => {
    const client = scriptedClient([withLeadingThinking(sendMessage(GOOD))])
    const result = await runNinaTurnWith(fakeTurnDeps(client), input())
    expect(result.source).toBe('llm')
    expect(result.payload?.bubbles).toEqual(GOOD.bubbles)
    /* And it did NOT spend the repair budget on a parse bug. */
    expect(client.calls).toHaveLength(1)
  })

  it('finds a tool_use BEHIND a thinking block and completes the round', async () => {
    const day = runHistoryFixture().runs[0]!.occurredOn
    const client = scriptedClient([
      withLeadingThinking(toolUseMessage(LOOKUP_RUNS_TOOL.name, { dates: [day] })),
      sendMessage(GOOD),
    ])
    const result = await runNinaTurnWith(fakeTurnDeps(client), input())
    expect(result.source).toBe('llm')
    expect(result.trace.rounds).toBe(1)
    expect(result.trace.toolCalls).toEqual(['lookup_runs'])
  })

  it('leaves NINA_MAX_TOKENS room for a thinking block', () => {
    /* Not a magic-number test: the point is that the ceiling is sized for payload PLUS an
     * unrequested thinking block, so a future "tighten this to the payload" edit fails here. */
    expect(NINA_MAX_TOKENS).toBeGreaterThanOrEqual(2_400)
  })

  it('sends nothing outside the allowed field surface', async () => {
    const client = scriptedClient([sendMessage(GOOD)])
    await runNinaTurnWith(fakeTurnDeps(client), input())
    expect(Object.keys(client.calls[0]!).sort()).toEqual([
      'max_tokens',
      'messages',
      'model',
      'system',
      'thinking',
      'tool_choice',
      'tools',
    ])
  })

  it('offers every tool with tool_choice any on a non-final call', async () => {
    const client = scriptedClient([sendMessage(GOOD)])
    await runNinaTurnWith(fakeTurnDeps(client), input())
    expect(client.calls[0]!.tool_choice).toEqual({ type: 'any' })
    expect(client.calls[0]!.tools).toHaveLength(4)
  })

  it('never sends an image block — INVARIANT 5', async () => {
    const client = scriptedClient([sendMessage(GOOD)])
    await runNinaTurnWith(
      fakeTurnDeps(client),
      input({ imageDescriptions: ['a plate of nasi goreng, half eaten'] }),
    )
    const serialised = JSON.stringify(client.calls[0]!)
    expect(serialised).not.toContain('"type":"image"')
    // The description arrives as text instead.
    expect(serialised).toContain('nasi goreng')
  })

  it('puts the attached run’s precomputed facts in the user turn and asks for no lookup', async () => {
    const history = runHistoryFixture()
    const attached = history.runs[0]
    expect(attached).toBeDefined()

    const client = scriptedClient([sendMessage(GOOD)])
    await runNinaTurnWith(
      fakeTurnDeps(client),
      input({ history, runnerText: null, attachedRunId: attached!.runId }),
    )

    const userTurn = client.calls[0]!.messages[0]!.content as string
    expect(userTurn).toContain('HE ATTACHED THIS RUN TO HIS MESSAGE')
    expect(userTurn).toContain('do not call lookup_runs')
    expect(userTurn).toContain('HE SENT IT WITH NO MESSAGE')
    // The facts are buildNinaRunFact's, not a re-spelling: the run's own id is in the block.
    expect(userTurn).toContain(attached!.runId)
    // And an empty runnerText produces no dangling heading.
    expect(userTurn).not.toContain('HE JUST SAID:')
  })

  it('leaves the turn alone when the attached id is not in the reviewed history', async () => {
    const client = scriptedClient([sendMessage(GOOD)])
    await runNinaTurnWith(fakeTurnDeps(client), input({ attachedRunId: 'not-a-run' }))
    const userTurn = client.calls[0]!.messages[0]!.content as string
    expect(userTurn).not.toContain('HE ATTACHED THIS RUN')
  })

  it('does not send promptVersion, and still logs it', async () => {
    const client = scriptedClient([sendMessage(GOOD)])
    const result = await runNinaTurnWith(fakeTurnDeps(client), input())
    const userTurn = client.calls[0]!.messages[0]!.content as string
    expect(userTurn).not.toContain('promptVersion')
    expect(result.trace.promptVersion).toBeGreaterThan(0)
  })

  /*
   * ── THE ONE LINE THE WHOLE CHARACTER TUNING PASSES THROUGH ──────────────────────────────────
   * `system` was a module-level constant until the nina-character-tuning set. If this assertion
   * ever passes with the DEFAULT prompt on a tuned input, every slider on `/admin/nina` is
   * decorative and nothing else in the suite would notice.
   */
  it('sends the ASSEMBLED prompt for this input, not the module constant', async () => {
    const client = scriptedClient([sendMessage(GOOD)])
    const turn = tunedInput()
    await runNinaTurnWith(fakeTurnDeps(client), turn)
    expect(client.calls[0]!.system).toBe(buildNinaSystemPrompt(turn.tuning))
    expect(client.calls[0]!.system).not.toBe(NINA_SYSTEM_PROMPT)
  })

  it('sends the DEFAULT prompt for a default tuning — the compatibility contract, at the call site', async () => {
    const client = scriptedClient([sendMessage(GOOD)])
    await runNinaTurnWith(fakeTurnDeps(client), input())
    expect(client.calls[0]!.system).toBe(NINA_SYSTEM_PROMPT)
  })

  /*
   * One turn is one character. Built once outside the loop precisely so a re-read cannot split a
   * turn between two Ninas — the repair call included, since a repair under a different prompt is
   * a second reply from a second person.
   */
  it('sends the SAME system prompt on all three calls of one turn, repair included', async () => {
    const day = runHistoryFixture().runs[0]!.occurredOn
    const client = scriptedClient([
      toolUseMessage(LOOKUP_RUNS_TOOL.name, { dates: [day] }),
      sendMessage({ bubbles: [] }),
      sendMessage(GOOD),
    ])
    await runNinaTurnWith(fakeTurnDeps(client), tunedInput())
    expect(client.calls).toHaveLength(3)
    const systems = new Set(client.calls.map((body) => body.system))
    expect(systems.size).toBe(1)
  })
})

describe('runNinaTurn — the log', () => {
  it('records a row for a successful turn', async () => {
    const store = fakeTurnStore()
    const client = scriptedClient([sendMessage(GOOD)])
    await runNinaTurn(input(), fakeTurnDeps(client, { store }))
    expect(store.rows).toHaveLength(1)
    expect(store.rows[0]!.source).toBe('llm')
    expect(store.rows[0]!.toolCalls).toBe('')
  })

  it('records the tuning revision beside the prompt version', async () => {
    const store = fakeTurnStore()
    const client = scriptedClient([sendMessage(GOOD)])
    await runNinaTurn(
      input({ tuning: ninaTuningFixture({ revision: 7 }) }),
      fakeTurnDeps(client, { store }),
    )
    expect(store.rows[0]!.tuningRevision).toBe(7)
    expect(store.rows[0]!.promptVersion).toBe(ninaContextFixture().promptVersion)
  })

  it('records the tool NAMES, not a count — ruling (b)’s empirical exit needs which', async () => {
    const store = fakeTurnStore()
    const day = runHistoryFixture().runs[0]!.occurredOn
    const client = scriptedClient([
      toolUseMessage(LOOKUP_RUNS_TOOL.name, { dates: [day] }),
      sendMessage(GOOD),
    ])
    await runNinaTurn(input(), fakeTurnDeps(client, { store }))
    expect(store.rows[0]!.toolCalls).toBe('lookup_runs')
  })

  it('records a row for a FAILED turn — F31 stopped growing silently and nobody knew', async () => {
    const store = fakeTurnStore()
    const client = scriptedClient([new Error('timeout')])
    await runNinaTurn(input(), fakeTurnDeps(client, { store }))
    expect(store.rows).toHaveLength(1)
    expect(store.rows[0]!.source).toBe('unavailable')
  })

  it('does not let a failed log cost a reply', async () => {
    const client = scriptedClient([sendMessage(GOOD)])
    const store = {
      async record() {
        throw new Error('nina_turns is on fire')
      },
    }
    const result = await runNinaTurn(input(), fakeTurnDeps(client, { store }))
    expect(result.payload?.bubbles).toEqual(GOOD.bubbles)
  })
})

/* ============================================================================
 * R2 — the fired shortcut. `lib/nina/shortcuts.ts` owns the MATCHER and its own suite proves it
 * against every real production trigger; this block proves the WIRING: that the hits reach the
 * user turn, in the right position, exactly once, and that a turn which fired nothing is untouched.
 * ========================================================================= */

describe('userTurnText — the fired shortcut (R2)', () => {
  it('carries ZERO shortcut bytes when nothing fired — INVARIANT 2, three ways', async () => {
    /*
     * The baseline is the turn as this file built it before the feature existed: the fields are
     * ABSENT from the object entirely, which is still what every call site in `tests/live/`,
     * `tests/integration/` and `lib/nina/proactive.ts` passes.
     *
     * ── EVERY CASE BELOW MUST MISS ON `recent` AS WELL AS ON `current` ─────────────────────────
     * "Nothing fired" is NOT the same condition as "the block is empty". Phase 1's
     * `renderNinaShortcutBlock` returns a NON-NULL block whenever `inPlay` is non-empty even if
     * `fired` is empty — that is deliberate and load-bearing (`🫦` opens a mode that runs until
     * `💦`, and the instruction has to survive the turn where he only says "terusin"). A case that
     * varied only `current` while leaving a MATCHING message in `recentRunnerTexts` would
     * correctly emit a block, and asserting byte-identity against the baseline there would be
     * asserting the opposite of that ruling. So each case below is built so that neither the
     * current message nor any recent one carries a live trigger. The positive counterpart — an
     * in-play-only hit that DOES emit a block — is the case immediately after this one.
     */
    const baseline = await userTurnOf(input())

    /* (1) An empty list — what `listNinaShortcuts` returns for a runner who has defined none. No
     * rows, so no recent message can match either. */
    expect(await userTurnOf(input({ shortcuts: [], recentRunnerTexts: [] }))).toBe(baseline)

    /* (2) Explicitly `undefined`, which is what a caller building the object conditionally
     * produces, and is not the same code path as absent. */
    expect(await userTurnOf(input({ shortcuts: undefined, recentRunnerTexts: undefined }))).toBe(
      baseline,
    )

    /* (3) The case that actually happens all day: shortcuts exist and he used none of them —
     * NOT IN THIS MESSAGE AND NOT IN THE LAST FEW EITHER. The default `runnerText` fixture
     * contains neither `🍑` nor `plak!`, and the recent message is deliberately about running so
     * that it misses both as well. */
    expect(
      await userTurnOf(
        input({
          shortcuts: [shortcut(), shortcut({ id: 'sc0000000002', trigger: 'plak!', kind: 'word' })],
          recentRunnerTexts: ['gw lari 5k tadi pagi'],
        }),
      ),
    ).toBe(baseline)
  })

  it('DOES carry the block when a code is only still in play — the 🫦 case', async () => {
    /*
     * The positive counterpart to the case above, and the reason that one has to be built the way
     * it is. Nothing fired in THIS message; `🍑` fired two messages ago and phase 1's matcher puts
     * it in `inPlay`, so `renderNinaShortcutBlock` returns a block under its STILL IN PLAY header
     * and `userTurnText` pushes it. Without this case, "nothing fired" and "no block" would be
     * indistinguishable in this suite, and a regression that dropped `inPlay` from the rendered
     * block entirely would keep every assertion above green while quietly breaking the one
     * production shortcut whose expansion says it runs "sampe miftah bilang 💦".
     */
    const userTurn = await userTurnOf(
      input({ runnerText: 'terusin', shortcuts: [shortcut()], recentRunnerTexts: ['pengen 🍑'] }),
    )
    expect(userTurn).toContain(PEACH)
    expect(userTurn).toContain('STILL IN PLAY')
    expect(userTurn).not.toContain('HE USED A SHORTCUT')
    /* And it is still byte-different from the same turn with no history — the point of the case. */
    expect(userTurn).not.toBe(await userTurnOf(input({ runnerText: 'terusin' })))
  })

  it('puts the FULL expansion in the user turn when he types the trigger', async () => {
    const userTurn = await userTurnOf(
      input({ runnerText: 'pengen 🍑 dong', shortcuts: [shortcut()] }),
    )
    /* The whole expansion, not a 400-character truncation of it — the ledger cap this feature
     * exists to escape. */
    expect(userTurn).toContain(PEACH)
    expect(userTurn).toContain('pengen 🍑 dong')
  })

  it('puts the block AFTER the attached run and IMMEDIATELY BEFORE `HE JUST SAID:`', async () => {
    const history = runHistoryFixture()
    const attached = history.runs[0]!
    const userTurn = await userTurnOf(
      input({
        history,
        attachedRunId: attached.runId,
        runnerText: 'abis ini 🍑 ya',
        shortcuts: [shortcut()],
      }),
    )
    const run = userTurn.indexOf('HE ATTACHED THIS RUN TO HIS MESSAGE')
    const block = userTurn.indexOf(PEACH)
    const said = userTurn.indexOf('HE JUST SAID:')
    expect(run).toBeGreaterThanOrEqual(0)
    expect(block).toBeGreaterThan(run)
    expect(said).toBeGreaterThan(block)
  })

  it('hands DISABLED rows to the matcher and lets it drop them', async () => {
    /* The turn path's query already asks for `{ onlyEnabled: true }`, so a disabled row does not
     * normally reach here at all — and the matcher filters on `enabled` anyway, which is what
     * makes "live" have ONE definition regardless of who calls it. This case asserts that
     * guarantee at the `NinaTurnInput` boundary, where a test, a future path, or a stale cache
     * could still hand one in. Compared against the same message with no rows at all rather than
     * against `baseline`, so the only difference under test is the row. */
    const without = await userTurnOf(input({ runnerText: 'pengen 🍑 dong' }))
    const withDisabled = await userTurnOf(
      input({ runnerText: 'pengen 🍑 dong', shortcuts: [shortcut({ enabled: false })] }),
    )
    expect(withDisabled).toBe(without)
  })

  it('reads only `recentRunnerTexts` for history — assumption A3', async () => {
    /* This file has no other route to an earlier message: `context.conversation.window` holds both
     * roles and is never scanned here. An expansion she echoed therefore cannot reach the matcher
     * at all, which is what stops a shortcut re-firing itself off her own bubble. */
    const baseline = await userTurnOf(input())
    expect(await userTurnOf(input({ shortcuts: [shortcut()], recentRunnerTexts: [] }))).toBe(
      baseline,
    )
  })

  it('never lets a shortcut problem cost a reply — INVARIANT 7', async () => {
    /* A row whose trigger is regex-metacharacter soup — an unclosed group, which is what an admin
     * typing on a phone eventually produces. Whatever phase 1's matcher makes of it, the turn
     * answers: `shortcutHits` catches and degrades to "nothing fired". */
    const hostile = shortcut({ id: 'sc0000000003', trigger: '(([', kind: 'word' })
    const result = await runNinaTurnWith(
      fakeTurnDeps(scriptedClient([sendMessage(GOOD)])),
      input({ shortcuts: [hostile] }),
    )
    expect(result.source).toBe('llm')
    expect(result.payload?.bubbles).toEqual(GOOD.bubbles)
  })
})

describe('NinaTurnResult.firedShortcutIds — what the usage bump reads', () => {
  it('is [] on a turn with no shortcuts at all', async () => {
    const result = await runNinaTurnWith(fakeTurnDeps(scriptedClient([sendMessage(GOOD)])), input())
    expect(result.firedShortcutIds).toEqual([])
  })

  it('names the shortcut he typed, and only that one', async () => {
    const result = await runNinaTurnWith(
      fakeTurnDeps(scriptedClient([sendMessage(GOOD)])),
      input({
        runnerText: 'pengen 🍑 dong',
        shortcuts: [shortcut(), shortcut({ id: 'sc0000000002', trigger: '💦' })],
      }),
    )
    expect(result.firedShortcutIds).toEqual(['sc0000000001'])
  })

  it('is [] for a shortcut that is only STILL IN PLAY — it was counted when it fired', async () => {
    const result = await runNinaTurnWith(
      fakeTurnDeps(scriptedClient([sendMessage(GOOD)])),
      input({ runnerText: 'terusin', shortcuts: [shortcut()], recentRunnerTexts: ['pengen 🍑'] }),
    )
    expect(result.firedShortcutIds).toEqual([])
  })

  it('is present even on a turn that produced no reply at all', async () => {
    /* `lib/nina/actions.ts` bumps BEFORE it checks whether the session still exists or whether she
     * answered, so an `unavailable` result still has to carry the ids. */
    const result = await runNinaTurnWith(
      fakeTurnDeps(scriptedClient([new Error('502 upstream')])),
      input({ runnerText: 'pengen 🍑 dong', shortcuts: [shortcut()] }),
    )
    expect(result.source).toBe('unavailable')
    expect(result.firedShortcutIds).toEqual(['sc0000000001'])
  })
})
