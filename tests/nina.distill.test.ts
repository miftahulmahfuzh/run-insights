import { readFileSync } from 'node:fs'

import type {
  NinaFactCategory,
  NinaMemorySource,
  NinaPendingPromisesSlot,
  NinaSlotValue,
} from '@/lib/db/schema'
import {
  applyMemoryPlan,
  distillWith,
  DISTILL_MAX_TOKENS,
  runTurnDistillation,
  type DistillInput,
  type NinaMemoryGateway,
} from '@/lib/nina/distill'
import { planMemoryWrites, type MemoryPlan } from '@/lib/nina/memory'
import { DISTILL_REPAIR_PREAMBLE, DISTILL_TOOL } from '@/lib/nina/prompts/distill'
import { scriptedClient, toolUseMessage, withLeadingThinking } from '@/tests/fixtures/ninaTurn'
import { afterEach, describe, expect, it, vi } from 'vitest'

/**
 * Phase 5's impure half: one fake client, one fake gateway, no database and no network. The two
 * cases that matter most are the LAST two in each block — the apply order (R4's "PERMANENTLY" as
 * an executable assertion) and the structural check that an admin ledger row is unreachable.
 */

const RUNNER_TEXT = 'gw biasanya lari selasa, kamis, sabtu sama minggu'

function distillInput(overrides: Partial<DistillInput> = {}): DistillInput {
  return {
    runnerText: RUNNER_TEXT,
    ninaBubbles: ['oke gw catet'],
    slotSummary: [],
    ...overrides,
  }
}

const GOOD_PAYLOAD = {
  facts: [
    {
      text: 'Dia biasanya lari Selasa, Kamis, Sabtu dan Minggu.',
      category: 'training',
      confidence: 100,
      quote: 'gw biasanya lari selasa, kamis, sabtu sama minggu',
      slotKey: 'running_days',
    },
  ],
}

/** `confidence` as a string is the shape the schema rejects and the repair turn is asked to fix. */
const BAD_PAYLOAD = {
  facts: [{ text: 'x', category: 'training', confidence: 'high', quote: 'gw biasanya lari' }],
}

function recordMessage(input: unknown) {
  return toolUseMessage(DISTILL_TOOL.name, input, 'tu_record')
}

afterEach(() => {
  vi.restoreAllMocks()
})

/* ============================================================================
 * distillWith — primary -> Zod -> one repair -> degrade
 * ==========================================================================*/

describe('distillWith', () => {
  it('finds the record block behind a leading thinking block', async () => {
    const client = scriptedClient([withLeadingThinking(recordMessage(GOOD_PAYLOAD))])
    const result = await distillWith(client, distillInput(), { model: 'glm-5.3' })
    expect(result.source).toBe('llm')
    expect(result.payload?.facts?.[0]?.slotKey).toBe('running_days')
  })

  it('accepts a well-formed payload in one call', async () => {
    const client = scriptedClient([recordMessage(GOOD_PAYLOAD)])
    const result = await distillWith(client, distillInput(), { model: 'glm-5.3' })
    expect(result.source).toBe('llm')
    expect(client.calls).toHaveLength(1)
  })

  it('repairs once, echoing the malformed object back with the issue list', async () => {
    const client = scriptedClient([recordMessage(BAD_PAYLOAD), recordMessage(GOOD_PAYLOAD)])
    const result = await distillWith(client, distillInput(), { model: 'glm-5.3' })
    expect(result.source).toBe('llm_repair')
    expect(client.calls).toHaveLength(2)

    const messages = client.calls[1]!.messages
    expect(messages).toHaveLength(3)
    expect(messages[0]!.role).toBe('user')
    expect(messages[1]).toEqual({ role: 'assistant', content: JSON.stringify(BAD_PAYLOAD) })
    expect(messages[2]!.role).toBe('user')
    expect(String(messages[2]!.content)).toContain(DISTILL_REPAIR_PREAMBLE.trim())
    expect(String(messages[2]!.content)).toContain('facts.0.confidence')
  })

  it('degrades rather than throwing when the repair is malformed too', async () => {
    const client = scriptedClient([recordMessage(BAD_PAYLOAD), recordMessage(BAD_PAYLOAD)])
    const result = await distillWith(client, distillInput(), { model: 'glm-5.3' })
    expect(result).toEqual({ payload: null, source: 'unavailable' })
  })

  it('degrades and warns when the primary call rejects', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const client = scriptedClient([new Error('socket hang up')])
    const result = await distillWith(client, distillInput(), { model: 'glm-5.3' })
    expect(result).toEqual({ payload: null, source: 'unavailable' })
    expect(warn).toHaveBeenCalledTimes(1)
  })

  it('never repairs a max_tokens truncation — the same prompt cuts at the same place', async () => {
    const truncated = {
      ...recordMessage(BAD_PAYLOAD),
      stop_reason: 'max_tokens',
    } as ReturnType<typeof recordMessage>
    const client = scriptedClient([truncated])
    const result = await distillWith(client, distillInput(), { model: 'glm-5.3' })
    expect(result.source).toBe('unavailable')
    expect(client.calls).toHaveLength(1)
  })

  it('sends the tool forced, thinking disabled, at this phase’s own ceiling', async () => {
    const client = scriptedClient([recordMessage(GOOD_PAYLOAD)])
    await distillWith(client, distillInput(), { model: 'glm-5.3' })
    const body = client.calls[0]!
    expect(body.thinking).toEqual({ type: 'disabled' })
    expect(body.tool_choice).toEqual({ type: 'tool', name: 'record' })
    expect(body.max_tokens).toBe(DISTILL_MAX_TOKENS)
    expect(body.model).toBe('glm-5.3')
  })

  it('skips the repair when the overall deadline is already spent', async () => {
    let call = 0
    /* First read establishes the deadline; every read after it is well past it. */
    const now = (): number => (call++ === 0 ? 0 : 100_000)
    const client = scriptedClient([recordMessage(BAD_PAYLOAD)])
    const result = await distillWith(client, distillInput(), { model: 'glm-5.3', now })
    expect(result.source).toBe('unavailable')
    expect(client.calls).toHaveLength(1)
    expect(client.timeouts[0]).toBeGreaterThanOrEqual(1)
  })
})

/* ============================================================================
 * applyMemoryPlan — the order of the two writes IS the feature
 * ==========================================================================*/

type Call = { kind: 'fact' | 'slot'; key: string }

interface RecordingGateway extends NinaMemoryGateway {
  calls: Call[]
  facts: Array<{ text: string; category?: NinaFactCategory; confidence?: number }>
  slots: Array<{ key: string; value: NinaSlotValue; source?: NinaMemorySource }>
}

function recordingGateway(
  options: {
    failFactAt?: number
    failSlotAt?: number
    sources?: ReadonlyMap<string, NinaMemorySource>
    promises?: NinaPendingPromisesSlot | null
  } = {},
): RecordingGateway {
  const calls: Call[] = []
  const facts: RecordingGateway['facts'] = []
  const slots: RecordingGateway['slots'] = []
  let factIndex = 0
  let slotIndex = 0
  return {
    calls,
    facts,
    slots,
    async appendMemoryFact(_userId, row) {
      const index = factIndex++
      if (options.failFactAt === index) throw new Error('fact insert failed')
      calls.push({ kind: 'fact', key: row.text })
      facts.push({ text: row.text, category: row.category, confidence: row.confidence })
    },
    async saveMemorySlot(_userId, row) {
      const index = slotIndex++
      if (options.failSlotAt === index) throw new Error('slot upsert failed')
      calls.push({ kind: 'slot', key: row.key })
      slots.push({ key: row.key, value: row.value, source: row.source })
    },
    async readSlotSources() {
      return options.sources ?? new Map()
    },
    async readPendingPromises() {
      return options.promises ?? null
    },
  }
}

const PLAN: MemoryPlan = {
  facts: [
    { category: 'training', text: 'fact one', confidence: 100, sourceMessageId: 'm1' },
    { category: 'goal', text: 'fact two', confidence: 90, sourceMessageId: 'm1' },
  ],
  slots: [
    { key: 'running_days', value: 'Selasa', source: 'distilled', sourceMessageId: 'm1' },
    { key: 'goals', value: 'half marathon', source: 'distilled', sourceMessageId: 'm1' },
  ],
  deferred: [],
  demoted: [],
}

describe('applyMemoryPlan', () => {
  it('writes EVERY fact before it writes ANY slot — R4’s "PERMANENTLY", executable', async () => {
    const gateway = recordingGateway()
    await applyMemoryPlan('u1', PLAN, gateway)
    const lastFact = gateway.calls.findLastIndex((call) => call.kind === 'fact')
    const firstSlot = gateway.calls.findIndex((call) => call.kind === 'slot')
    expect(lastFact).toBeLessThan(firstSlot)
    expect(gateway.facts.map((fact) => fact.text)).toEqual(['fact one', 'fact two'])
    expect(gateway.facts[1]!.confidence).toBe(90)
  })

  it('a rejected fact costs one fact — the rest of the ledger and every slot still land', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const gateway = recordingGateway({ failFactAt: 0 })
    await applyMemoryPlan('u1', PLAN, gateway)
    expect(gateway.facts.map((fact) => fact.text)).toEqual(['fact two'])
    expect(gateway.slots.map((slot) => slot.key)).toEqual(['running_days', 'goals'])
    expect(warn).toHaveBeenCalled()
  })

  it('a rejected slot costs one slot — the ledger is untouched and the other slot lands', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const gateway = recordingGateway({ failSlotAt: 0 })
    await applyMemoryPlan('u1', PLAN, gateway)
    expect(gateway.facts).toHaveLength(2)
    expect(gateway.slots.map((slot) => slot.key)).toEqual(['goals'])
    expect(warn).toHaveBeenCalled()
  })

  it('logs the slots it deferred to a human’s values', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {})
    const gateway = recordingGateway()
    await applyMemoryPlan(
      'u1',
      { ...PLAN, deferred: [{ key: 'goals', reason: 'admin-owned' }] },
      gateway,
    )
    expect(info).toHaveBeenCalledWith(
      '[nina.distill] slots deferred to their admin-written values',
      { keys: ['goals'] },
    )
  })
})

/* ============================================================================
 * runTurnDistillation — the degraded floor, and the promise never to throw
 * ==========================================================================*/

describe('runTurnDistillation', () => {
  it('still applies phase 3’s memoryWrites when the model call is unavailable', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(console, 'info').mockImplementation(() => {})
    const gateway = recordingGateway()
    await runTurnDistillation({
      userId: 'u1',
      runnerText: RUNNER_TEXT,
      sourceMessageId: 'm1',
      ninaBubbles: ['oke'],
      memoryWrites: [{ kind: 'slot', slotKey: 'gear', text: 'Nike Pegasus 41' }],
      slots: [],
      identity: { fullName: null, nickname: null, messageCount: 2 },
      gateway,
      client: scriptedClient([new Error('endpoint down')]),
    })
    expect(gateway.slots.map((slot) => slot.key)).toEqual(['gear'])
    expect(gateway.facts.map((fact) => fact.text)).toEqual(['Nike Pegasus 41'])
  })

  it('resolves rather than rejecting when every gateway method fails', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const broken: NinaMemoryGateway = {
      async appendMemoryFact() {
        throw new Error('down')
      },
      async saveMemorySlot() {
        throw new Error('down')
      },
      async readSlotSources() {
        throw new Error('down')
      },
      async readPendingPromises() {
        throw new Error('down')
      },
    }
    await expect(
      runTurnDistillation({
        userId: 'u1',
        runnerText: RUNNER_TEXT,
        sourceMessageId: 'm1',
        ninaBubbles: [],
        memoryWrites: [],
        slots: [],
        identity: { fullName: null, nickname: null, messageCount: 1 },
        gateway: broken,
        client: scriptedClient([recordMessage(GOOD_PAYLOAD)]),
      }),
    ).resolves.toBeUndefined()
    expect(warn).toHaveBeenCalled()
  })

  it('plans from the distilled payload and applies it through the gateway', async () => {
    vi.spyOn(console, 'info').mockImplementation(() => {})
    const gateway = recordingGateway()
    await runTurnDistillation({
      userId: 'u1',
      runnerText: RUNNER_TEXT,
      sourceMessageId: 'm1',
      ninaBubbles: ['oke gw catet'],
      memoryWrites: [],
      slots: [],
      identity: { fullName: 'Miftahul Mahfuzh', nickname: null, messageCount: 2 },
      gateway,
      client: scriptedClient([recordMessage(GOOD_PAYLOAD)]),
      now: () => new Date('2026-09-04T01:00:00Z'),
    })
    expect(gateway.slots.map((slot) => slot.key)).toEqual(['running_days', 'name'])
    expect(gateway.slots[0]!.value).toBe('Selasa, Kamis, Sabtu, Minggu')
    expect(String(gateway.slots[1]!.value)).toContain('mif atau tah')
  })
})

/* ============================================================================
 * Ruling (c) rule 1 — the ledger is unreachable BY CONSTRUCTION
 * ==========================================================================*/

describe('the append-only ledger, checked structurally', () => {
  /*
   * The only test in this repo that asserts on source text rather than behaviour, and it is
   * deliberate: rule 1 of ruling (c) is a claim about WHICH FUNCTIONS the distiller imports, and
   * the only way to keep a structural guarantee from decaying into a comment is to check the
   * structure. Phase 16 owns `updateNinaMemoryFact` and `deleteNinaMemoryFact`; nothing here may
   * so much as name them.
   */
  it('neither memory.ts nor distill.ts names a mutating fact query', () => {
    for (const path of ['lib/nina/memory.ts', 'lib/nina/distill.ts']) {
      const source = readFileSync(path, 'utf8')
      expect(source, `${path} must not reach updateNinaMemoryFact`).not.toContain(
        'updateNinaMemoryFact',
      )
      expect(source, `${path} must not reach deleteNinaMemoryFact`).not.toContain(
        'deleteNinaMemoryFact',
      )
      expect(source, `${path} must not reach deleteNinaMemorySlot`).not.toContain(
        'deleteNinaMemorySlot',
      )
    }
  })

  it('planMemoryWrites emits appends and upserts only — there is no third kind of write', () => {
    const plan = planMemoryWrites({
      runnerText: RUNNER_TEXT,
      sourceMessageId: 'm1',
      memoryWrites: [],
      distilled: null,
      existingSlotSources: new Map(),
      currentPromises: null,
      identity: { fullName: null, nickname: null, messageCount: 1 },
      promiseCtx: { todayISO: '2026-09-04', sourceMessageId: 'm1', newId: () => 'p1' },
    })
    expect(Object.keys(plan).sort()).toEqual(['deferred', 'demoted', 'facts', 'slots'])
  })
})
