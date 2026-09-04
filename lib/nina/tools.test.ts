import { detailedRunsFixture, fakeToolGateway, runHistoryFixture } from '@/tests/fixtures/ninaTurn'
import { describe, expect, it } from 'vitest'

import { indexRunsByDate } from './dates'
import {
  COMPARE_FIELDS,
  NINA_CORE_TOOL_SET,
  compareRunFacts,
  dispatchNinaTool,
  extendToolSet,
  handleCompareRuns,
  handleLookupRuns,
  handleSaveMemory,
  type NinaToolContext,
} from './tools'

const TODAY = '2026-09-03'

function ctx(history = runHistoryFixture(), gateway = fakeToolGateway()): NinaToolContext {
  return { userId: 'u1', todayISO: TODAY, history, gateway, sourceMessageId: 'm1' }
}

describe('handleLookupRuns', () => {
  it('carries splits, fastest/slowest km and zones — ruling (d)', async () => {
    const history = runHistoryFixture()
    const day = history.runs[0]!.occurredOn
    const { answer, isError } = await handleLookupRuns({ dates: [day] }, ctx(history))
    expect(isError).toBe(false)
    const days = (answer as { days: Array<Record<string, unknown>> }).days
    expect(days[0]!.kind).toBe('runs')
    const run = (days[0] as { runs: Array<Record<string, unknown>> }).runs[0]!
    expect(Array.isArray(run.splits)).toBe(true)
    expect((run.splits as unknown[]).length).toBeGreaterThan(0)
    expect(run).toHaveProperty('fastestKm')
    expect(run).toHaveProperty('zones')
    // Invariant 3: every number is a spelled string, never a raw metre or second.
    expect(typeof run.distance).toBe('string')
  })

  it('says NO RUN out loud and does not report it as an error', async () => {
    const { answer, isError } = await handleLookupRuns(
      { dates: ['2026-09-01'] },
      ctx(runHistoryFixture([])),
    )
    expect(isError).toBe(false)
    const day = (answer as { days: Array<{ kind: string; situation: string }> }).days[0]!
    expect(day.kind).toBe('no_run')
    expect(day.situation).toContain('NO RUN')
  })

  it('answers a malformed date as a tool result, not a throw', async () => {
    const { answer, isError } = await handleLookupRuns({ dates: ['kemaren'] }, ctx())
    expect(isError).toBe(true)
    expect((answer as { days: Array<{ kind: string }> }).days[0]!.kind).toBe('invalid')
  })

  it('names a future day as not yet happened', async () => {
    const { answer } = await handleLookupRuns({ dates: ['2026-09-10'] }, ctx())
    const day = (answer as { days: Array<{ kind: string; situation: string }> }).days[0]!
    expect(day.kind).toBe('future')
    expect(day.situation).toContain('future')
  })

  it('refuses arguments that are not { dates: [...] } as a tool result', async () => {
    const { answer, isError } = await handleLookupRuns({ day: '2026-09-01' }, ctx())
    expect(isError).toBe(true)
    expect(answer).toHaveProperty('issues')
  })
})

describe('compareRunFacts', () => {
  it('precomputes every delta as a spelled string — INVARIANT 2', () => {
    const a = detailedRunsFixture()[0]!
    const deltas = compareRunFacts(a, { ...a, distanceM: a.distanceM + 1200 })
    expect(deltas).toHaveLength(COMPARE_FIELDS.length)
    const distance = deltas.find((d) => d.key === 'distance')!
    expect(distance.delta).toMatch(/^\+/)
    expect(distance.direction).toBe('up')
    // No branch of this table may hand back a raw number for the model to subtract.
    for (const delta of deltas) {
      expect(typeof delta.a === 'string' || delta.a === null).toBe(true)
      expect(typeof delta.delta === 'string' || delta.delta === null).toBe(true)
    }
  })

  it('spells a fall with the same minus sign formatPaceDelta uses', () => {
    const a = detailedRunsFixture()[0]!
    const deltas = compareRunFacts(a, { ...a, distanceM: a.distanceM - 1200 })
    const distance = deltas.find((d) => d.key === 'distance')!
    expect(distance.direction).toBe('down')
    // U+2212 MINUS SIGN, not a hyphen — one array must not spell a negative two ways.
    expect(distance.delta).toBe('−1.20 km')
  })

  it('reports "unknown" and never 0 when a reading is missing', () => {
    const a = detailedRunsFixture()[0]!
    const deltas = compareRunFacts({ ...a, avgHr: null }, a)
    const hr = deltas.find((d) => d.key === 'avgHr')!
    expect(hr.direction).toBe('unknown')
    expect(hr.delta).toBeNull()
  })

  it('reports "same" when a reading is present and unchanged', () => {
    const a = detailedRunsFixture()[0]!
    const distance = compareRunFacts(a, a).find((d) => d.key === 'distance')!
    expect(distance.direction).toBe('same')
    expect(distance.delta).not.toBeNull()
  })

  it('has no verdict field — the app says what moved, she says whether it was good', () => {
    const a = detailedRunsFixture()[0]!
    for (const delta of compareRunFacts(a, a)) {
      expect(delta).not.toHaveProperty('better')
      expect(delta.higherMeans.length).toBeGreaterThan(0)
    }
  })
})

describe('handleCompareRuns', () => {
  it('returns precomputed deltas and tells her not to subtract anything', async () => {
    const base = detailedRunsFixture()[0]!
    const runs = [
      { ...base, runId: 'aaaaaaaaaaaa', occurredOn: '2026-08-30' },
      { ...base, runId: 'bbbbbbbbbbbb', occurredOn: '2026-08-29', distanceM: base.distanceM + 900 },
    ]
    const { answer, isError } = await handleCompareRuns(
      { dateA: '2026-08-30', dateB: '2026-08-29' },
      ctx(runHistoryFixture(runs)),
    )
    expect(isError).toBe(false)
    const result = answer as { kind: string; deltas: unknown[]; situation: string }
    expect(result.kind).toBe('comparison')
    expect(result.deltas).toHaveLength(COMPARE_FIELDS.length)
    expect(result.situation).toContain('Do NOT subtract')
  })

  it('asks which run on a two-a-days date instead of picking — ruling (c)', async () => {
    const base = detailedRunsFixture()[0]!
    const day = '2026-08-30'
    const runs = [
      { ...base, runId: 'aaaaaaaaaaaa', occurredOn: day, startedAt: '06:10:00' },
      { ...base, runId: 'bbbbbbbbbbbb', occurredOn: day, startedAt: '18:40:00' },
      { ...base, runId: 'cccccccccccc', occurredOn: '2026-08-29' },
    ]
    const history = { ...runHistoryFixture(runs), index: indexRunsByDate(runs) }
    const { answer, isError } = await handleCompareRuns(
      { dateA: day, dateB: '2026-08-29' },
      ctx(history),
    )
    expect(isError).toBe(false)
    expect((answer as { kind: string }).kind).toBe('ambiguous')
    expect((answer as { runs: unknown[] }).runs).toHaveLength(2)
  })

  it('refuses to compare a day with no run, and says which day', async () => {
    const history = runHistoryFixture()
    const day = history.runs[0]!.occurredOn
    const { answer, isError } = await handleCompareRuns(
      { dateA: day, dateB: '2026-09-01' },
      ctx(history),
    )
    expect(isError).toBe(false)
    expect((answer as { kind: string }).kind).toBe('no_run')
    expect((answer as { situation: string }).situation).toContain('NO RUN')
  })

  it('refuses the same day twice', async () => {
    const { answer } = await handleCompareRuns({ dateA: TODAY, dateB: TODAY }, ctx())
    expect((answer as { kind: string }).kind).toBe('same_day')
  })

  it('refuses a future side', async () => {
    const history = runHistoryFixture()
    const { answer } = await handleCompareRuns(
      { dateA: history.runs[0]!.occurredOn, dateB: '2026-09-10' },
      ctx(history),
    )
    expect((answer as { kind: string }).kind).toBe('future')
  })
})

describe('handleSaveMemory', () => {
  it('writes a slot through the one write path', async () => {
    const gateway = fakeToolGateway()
    const { isError } = await handleSaveMemory(
      { kind: 'slot', slotKey: 'usual_running_days', text: 'Tue, Thu, Sun' },
      ctx(runHistoryFixture(), gateway),
    )
    expect(isError).toBe(false)
    expect(gateway.slots).toEqual([{ key: 'usual_running_days', value: 'Tue, Thu, Sun' }])
  })

  it('appends a fact with the runner message it was learned from', async () => {
    const gateway = fakeToolGateway()
    await handleSaveMemory(
      { kind: 'fact', text: 'he hates hills' },
      ctx(runHistoryFixture(), gateway),
    )
    expect(gateway.facts).toEqual([{ text: 'he hates hills', sourceMessageId: 'm1' }])
  })

  it('asks for a slotKey rather than inventing one', async () => {
    const { isError } = await handleSaveMemory({ kind: 'slot', text: 'x' }, ctx())
    expect(isError).toBe(true)
  })

  it('accepts a slotKey phase 5 has never heard of — the vocabulary is not phase 3’s', async () => {
    const gateway = fakeToolGateway()
    const { isError } = await handleSaveMemory(
      { kind: 'slot', slotKey: 'favourite_gel_flavour', text: 'salted caramel' },
      ctx(runHistoryFixture(), gateway),
    )
    expect(isError).toBe(false)
    expect(gateway.slots[0]!.key).toBe('favourite_gel_flavour')
  })
})

describe('the dispatch table', () => {
  it('has no handler for send, which terminates the loop', () => {
    expect(NINA_CORE_TOOL_SET.handlers.send).toBeUndefined()
    expect(NINA_CORE_TOOL_SET.tools.map((t) => t.name)).toEqual([
      'send',
      'lookup_runs',
      'compare_runs',
      'save_memory',
    ])
  })

  it('ships exactly three handlers — generate_image and set_avatar are phases 12 and 13', () => {
    expect(Object.keys(NINA_CORE_TOOL_SET.handlers).sort()).toEqual([
      'compare_runs',
      'lookup_runs',
      'save_memory',
    ])
  })

  it('extends additively without mutating the core set', () => {
    const tool = {
      name: 'generate_image',
      description: 'x',
      input_schema: { type: 'object' as const },
    }
    const extended = extendToolSet(NINA_CORE_TOOL_SET, [
      { tool, handler: async () => ({ answer: {}, isError: false }) },
    ])
    expect(Object.keys(extended.handlers)).toHaveLength(4)
    expect(Object.keys(NINA_CORE_TOOL_SET.handlers)).toHaveLength(3)
    expect(NINA_CORE_TOOL_SET.tools).toHaveLength(4)
  })

  it('throws on a duplicate name, at load time, in the phase that added it', () => {
    expect(() =>
      extendToolSet(NINA_CORE_TOOL_SET, [
        {
          tool: {
            name: 'lookup_runs',
            description: 'x',
            input_schema: { type: 'object' as const },
          },
          handler: async () => ({ answer: {}, isError: false }),
        },
      ]),
    ).toThrow(/already registered/)
  })

  it('turns an unknown tool and a throwing handler into tool results, never exceptions', async () => {
    const unknown = await dispatchNinaTool('teleport', {}, ctx(), NINA_CORE_TOOL_SET.handlers)
    expect(unknown.isError).toBe(true)
    const boom = await dispatchNinaTool('boom', {}, ctx(), {
      boom: async () => {
        throw new Error('nope')
      },
    })
    expect(boom.isError).toBe(true)
  })
})
