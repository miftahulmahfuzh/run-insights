import type Anthropic from '@anthropic-ai/sdk'
import { describe, expect, it } from 'vitest'

import { REPAIR_PREAMBLE } from '@/lib/llm/prompts/narrate'
import { factsHash } from '@/lib/llm/factsHash'
import {
  getOrCreateInsight,
  MIN_REPAIR_BUDGET_MS,
  SESSION_OVERALL_MS,
  narrateWith,
  type InsightStore,
  type LlmClientLike,
  type StoredInsightRow,
} from '@/lib/llm/narrate'
import type { SessionNarrateFacts } from '@/lib/llm/facts'

/**
 * Tasks 6 and 10. No network, no database, no timers — the client and the store are both
 * injected, so every branch including the deadline gate is exercised deterministically.
 *
 * The malformed response used throughout is the SHAPE of the measured one
 * (`research/results-narrative.json`): a well-formed `report` tool call with `title` missing from
 * every observation. `tests/llm.schema.test.ts` pins that against the real capture; this file
 * pins what the orchestrator does about it.
 */

const VALID = {
  headline: 'Almost entirely zone 4-5',
  verdict: 'hard',
  whatHappened: 'You ran 10.67 km at 92.5% of your estimated maximum.',
  observations: [
    { title: 'Too hard', detail: '90.6% above zone 3.', metric: '90.6% in zone 4-5' },
    { title: 'Faded', detail: 'Cadence fell 18 spm.', metric: '-18 spm' },
  ],
  doNext: ['Cap the next easy run at zone 2'],
  questionForRunner: 'Was the fast opening kilometre deliberate?',
}

/** The measured defect: titles dropped, server said 200. */
const MISSING_TITLES = {
  ...VALID,
  observations: VALID.observations.map((o) => ({ detail: o.detail, metric: o.metric })),
}

function message(input: unknown, overrides: Partial<Anthropic.Message> = {}): Anthropic.Message {
  return {
    id: 'msg_test',
    type: 'message',
    role: 'assistant',
    model: 'glm-5.3',
    content: [{ type: 'tool_use', id: 'toolu_1', name: 'report', input }],
    stop_reason: 'tool_use',
    stop_sequence: null,
    usage: { input_tokens: 1743, output_tokens: 546 },
    ...overrides,
  } as Anthropic.Message
}

interface Call {
  body: Anthropic.MessageCreateParamsNonStreaming
  timeout: number | undefined
}

/** A client that answers from a script, recording everything it was asked. */
function fakeClient(script: Array<Anthropic.Message | Error>) {
  const calls: Call[] = []
  const client: LlmClientLike = {
    messages: {
      async create(body, options) {
        calls.push({ body, timeout: options?.timeout })
        const next = script[calls.length - 1]
        if (next === undefined) throw new Error(`unexpected call ${calls.length}`)
        if (next instanceof Error) throw next
        return next
      },
    },
  }
  return { client, calls }
}

const FACTS = { session: { distanceKm: 10.67 }, promptVersion: 3 } as unknown as SessionNarrateFacts

describe('narrateWith', () => {
  it('returns the payload on a well-formed first attempt, and makes exactly one call', async () => {
    const { client, calls } = fakeClient([message(VALID)])

    const result = await narrateWith(client, 'session', FACTS, { model: 'glm-5.3' })

    expect(result.source).toBe('llm')
    expect(result.payload?.headline).toBe('Almost entirely zone 4-5')
    expect(result.usage).toEqual({ inputTokens: 1743, outputTokens: 546 })
    expect(calls).toHaveLength(1)
  })

  it('sends exactly the sanctioned request surface, and forces the report tool', async () => {
    const { client, calls } = fakeClient([message(VALID)])
    await narrateWith(client, 'session', FACTS, { model: 'glm-5.3' })

    const body = calls[0]!.body
    expect(Object.keys(body).sort()).toEqual([
      'max_tokens',
      'messages',
      'model',
      'system',
      'tool_choice',
      'tools',
    ])
    expect(body.tool_choice).toEqual({ type: 'tool', name: 'report' })
    expect(body.max_tokens).toBe(1_200)
  })

  it('never sends promptVersion — it is a cache key, not a fact about the run', async () => {
    const { client, calls } = fakeClient([message(VALID)])
    await narrateWith(client, 'session', FACTS, { model: 'glm-5.3' })

    const userTurn = calls[0]!.body.messages[0]!.content as string
    expect(userTurn).toContain('10.67')
    expect(userTurn).not.toContain('promptVersion')
  })

  it('gives week and month a larger token ceiling than a session', async () => {
    for (const [scope, maxTokens] of [
      ['week', 1_600],
      ['month', 1_600],
    ] as const) {
      const { client, calls } = fakeClient([message(VALID)])
      await narrateWith(client, scope, FACTS, { model: 'glm-5.3' })
      expect(calls[0]!.body.max_tokens).toBe(maxTokens)
    }
  })

  it('repairs a response missing every title, and says so', async () => {
    const { client, calls } = fakeClient([message(MISSING_TITLES), message(VALID)])

    const result = await narrateWith(client, 'session', FACTS, { model: 'glm-5.3' })

    expect(result.source).toBe('llm_repair')
    expect(result.payload?.observations[0]?.title).toBe('Too hard')
    expect(calls).toHaveLength(2)

    const repairTurns = calls[1]!.body.messages
    expect(repairTurns).toHaveLength(3)
    expect(repairTurns[1]?.role).toBe('assistant')
    // The model's own malformed JSON is echoed back, so "reuse exactly what you already had"
    // refers to something present in the context rather than to a memory it does not have.
    expect(repairTurns[1]?.content).toContain('90.6% above zone 3.')
    expect(repairTurns[2]?.content).toContain(REPAIR_PREAMBLE)
    expect(repairTurns[2]?.content).toContain('title')
  })

  it('gives up silently when both attempts are malformed — never a fabricated payload', async () => {
    const { client, calls } = fakeClient([message(MISSING_TITLES), message(MISSING_TITLES)])

    const result = await narrateWith(client, 'session', FACTS, { model: 'glm-5.3' })

    expect(result).toEqual({ payload: null, source: 'unavailable', usage: null })
    expect(calls).toHaveLength(2)
  })

  it('does not throw when the primary call throws, and does not repair against nothing', async () => {
    const { client, calls } = fakeClient([new Error('ECONNRESET')])

    const result = await narrateWith(client, 'session', FACTS, { model: 'glm-5.3' })

    expect(result.source).toBe('unavailable')
    expect(result.payload).toBeNull()
    expect(calls).toHaveLength(1)
  })

  it('does not throw when the REPAIR call throws either', async () => {
    const { client, calls } = fakeClient([message(MISSING_TITLES), new Error('timeout')])

    const result = await narrateWith(client, 'session', FACTS, { model: 'glm-5.3' })

    expect(result.source).toBe('unavailable')
    expect(calls).toHaveLength(2)
  })

  it('skips the repair when the primary call ate the budget', async () => {
    const { client, calls } = fakeClient([message(MISSING_TITLES), message(VALID)])

    // A clock that jumps to within MIN_REPAIR_BUDGET_MS of the deadline after the first call.
    // `SESSION_OVERALL_MS` is read from the module rather than repeated, so raising the budget
    // (as the live measurement forced once already) cannot silently turn this into a no-op test.
    let ticks = 0
    const start = 1_000_000
    const now = () => {
      // 1: deadline anchor, 2: the primary call's timeout, 3+: the repair gate and after.
      ticks += 1
      return ticks <= 2 ? start : start + SESSION_OVERALL_MS - (MIN_REPAIR_BUDGET_MS - 1)
    }

    const result = await narrateWith(client, 'session', FACTS, { model: 'glm-5.3', now })

    expect(result.source).toBe('unavailable')
    expect(calls).toHaveLength(1)
  })

  it('treats a max_tokens stop as unrepairable — the same ceiling would cut it again', async () => {
    const { client, calls } = fakeClient([
      message(MISSING_TITLES, { stop_reason: 'max_tokens' }),
      message(VALID),
    ])

    const result = await narrateWith(client, 'session', FACTS, { model: 'glm-5.3' })

    expect(result.source).toBe('unavailable')
    expect(calls).toHaveLength(1)
  })

  it('gives up when the response carries no tool_use block at all', async () => {
    const { client } = fakeClient([
      message(VALID, {
        content: [{ type: 'text', text: 'Sure! Here is your run.', citations: [] }],
      }),
    ])

    const result = await narrateWith(client, 'session', FACTS, { model: 'glm-5.3' })
    expect(result.source).toBe('unavailable')
  })
})

/* ============================================================================
 * getOrCreateInsight — the cache
 * ==========================================================================*/

function fakeStore(seed: StoredInsightRow | null = null) {
  const saved: Array<{ scopeKey: string; factsHash: string; payload: unknown }> = []
  let row = seed
  const store: InsightStore = {
    async latest() {
      return row
    },
    async save(_userId, input) {
      saved.push({ scopeKey: input.scopeKey, factsHash: input.factsHash, payload: input.payload })
      row = {
        scopeKey: input.scopeKey,
        factsHash: input.factsHash,
        payload: input.payload,
        createdAt: new Date('2026-08-21T00:00:00Z'),
      }
    },
  }
  return { store, saved }
}

const SESSION_FACTS = {
  profile: { age: 30, heightCm: 169, hrMax: { bpm: 187, source: 'estimated' } },
  session: { distanceKm: 10.67 },
  promptVersion: 1,
} as unknown as SessionNarrateFacts

describe('getOrCreateInsight', () => {
  it('makes NO model call when the stored hash matches', async () => {
    const hash = factsHash(SESSION_FACTS)
    const { store } = fakeStore({
      scopeKey: 'run_1',
      factsHash: hash,
      payload: VALID,
      createdAt: new Date(),
    })
    const { client, calls } = fakeClient([])

    const result = await getOrCreateInsight('u1', 'session', 'run_1', SESSION_FACTS, {
      client,
      store,
      model: 'glm-5.3',
    })

    expect(calls).toHaveLength(0)
    expect(result.cached).toBe(true)
    expect(result.factsHash).toBe(hash)
    expect(result.payload?.headline).toBe('Almost entirely zone 4-5')
  })

  it('calls the model and persists when the stored hash is STALE', async () => {
    const { store, saved } = fakeStore({
      scopeKey: 'run_1',
      factsHash: 'a-hash-from-before-the-correction',
      payload: VALID,
      createdAt: new Date(),
    })
    const { client, calls } = fakeClient([message(VALID)])

    const result = await getOrCreateInsight('u1', 'session', 'run_1', SESSION_FACTS, {
      client,
      store,
      model: 'glm-5.3',
    })

    expect(calls).toHaveLength(1)
    expect(result.cached).toBe(false)
    expect(saved).toHaveLength(1)
    expect(saved[0]?.factsHash).toBe(factsHash(SESSION_FACTS))
  })

  it('freezes hrMaxUsed and hrMaxSource into a SESSION payload (R-11)', async () => {
    const { store, saved } = fakeStore()
    const { client } = fakeClient([message(VALID)])

    await getOrCreateInsight('u1', 'session', 'run_1', SESSION_FACTS, {
      client,
      store,
      model: 'glm-5.3',
    })

    expect(saved[0]?.payload).toMatchObject({ hrMaxUsed: 187, hrMaxSource: 'estimated' })
  })

  it('does not add an HRmax to a WEEK payload — nothing at period scope divides by it', async () => {
    const { store, saved } = fakeStore()
    const { client } = fakeClient([message(VALID)])

    await getOrCreateInsight('u1', 'week', '2026-W34', SESSION_FACTS, {
      client,
      store,
      model: 'glm-5.3',
    })

    expect(saved[0]?.payload).not.toHaveProperty('hrMaxUsed')
  })

  it('a second call with unchanged facts hits the row the first one just wrote', async () => {
    const { store, saved } = fakeStore()
    const { client, calls } = fakeClient([message(VALID)])

    await getOrCreateInsight('u1', 'session', 'run_1', SESSION_FACTS, {
      client,
      store,
      model: 'glm-5.3',
    })
    const second = await getOrCreateInsight('u1', 'session', 'run_1', SESSION_FACTS, {
      client,
      store,
      model: 'glm-5.3',
    })

    expect(calls).toHaveLength(1)
    expect(saved).toHaveLength(1)
    expect(second.cached).toBe(true)
  })

  it('persists NOTHING when the model fails, so the next view retries for free', async () => {
    const { store, saved } = fakeStore()
    const { client } = fakeClient([new Error('502'), new Error('502')])

    const result = await getOrCreateInsight('u1', 'session', 'run_1', SESSION_FACTS, {
      client,
      store,
      model: 'glm-5.3',
    })

    expect(result).toMatchObject({ payload: null, source: 'unavailable', cached: false })
    expect(saved).toEqual([])
  })
})
