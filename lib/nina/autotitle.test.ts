import type Anthropic from '@anthropic-ai/sdk'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  NINA_TITLE_MAX_TOKENS,
  dbNinaTitleStore,
  titleNinaSessionIfNeeded,
  titleNinaSessionWith,
  type NinaTitleStore,
  type TitleClientLike,
} from './autotitle'
import type { NinaTitleTurn } from './title'

const TURNS: NinaTitleTurn[] = [
  { role: 'runner', body: 'lutut gw sakit abis lari 15k' },
  { role: 'nina', body: 'sakitnya di sisi luar atau dalam' },
]

function toolMessage(input: unknown, stopReason: Anthropic.Message['stop_reason'] = 'tool_use') {
  return {
    id: 'msg_1',
    type: 'message',
    role: 'assistant',
    model: 'glm-5.3',
    stop_reason: stopReason,
    stop_sequence: null,
    usage: { input_tokens: 200, output_tokens: 8 },
    content: [{ type: 'tool_use', id: 'tu_1', name: 'title', input }],
  } as unknown as Anthropic.Message
}

function clientReturning(message: Anthropic.Message): TitleClientLike {
  return { messages: { create: vi.fn(async () => message) } }
}

/** A store whose session starts untitled and is written at most once, like the real UPDATE. */
function fakeStore(overrides: Partial<NinaTitleStore> = {}): NinaTitleStore & {
  written: string[]
} {
  const state: { title: string | null } = { title: null }
  const written: string[] = []
  const store: NinaTitleStore & { written: string[] } = {
    written,
    readTitle: async () => ({
      title: state.title,
      titleSource: state.title === null ? null : 'auto',
    }),
    readTurns: async () => TURNS,
    /* The `title IS NULL` predicate, in memory. */
    writeTitleIfUntitled: async (_userId, _sessionId, title) => {
      if (state.title !== null) return false
      state.title = title
      written.push(title)
      return true
    },
    ...overrides,
  }
  return store
}

describe('titleNinaSessionWith', () => {
  it('returns the sanitised title from the tool block', async () => {
    const client = clientReturning(toolMessage({ title: '"Cedera lutut kanan."' }))
    await expect(titleNinaSessionWith(client, TURNS, { model: 'm' })).resolves.toBe(
      'Cedera lutut kanan',
    )
  })

  it('sends the forced tool, the disabled thinking flag and its own ceiling', async () => {
    /* Typed against the seam rather than left to inference: a bare `vi.fn(async () => …)` infers
     * ZERO parameters, so `mock.calls` is `[][]` and reading `calls[0][0]` is a tuple-index error
     * (TS2493) rather than the request body this assertion is about. This is the only test that
     * inspects the outgoing body, so the annotation is here and not on the other fakes. */
    const create = vi.fn<TitleClientLike['messages']['create']>(async () =>
      toolMessage({ title: 'Cedera lutut' }),
    )
    await titleNinaSessionWith({ messages: { create } }, TURNS, { model: 'glm-5.3' })
    const [body, options] = create.mock.calls[0] ?? []
    expect(body?.max_tokens).toBe(NINA_TITLE_MAX_TOKENS)
    expect(body?.tool_choice).toEqual({ type: 'tool', name: 'title' })
    expect(body?.thinking).toEqual({ type: 'disabled' })
    expect(options?.timeout).toBeGreaterThan(0)
  })

  it('makes NO call when there is nothing to name', async () => {
    const create = vi.fn(async () => toolMessage({ title: 'Cedera lutut' }))
    await expect(
      titleNinaSessionWith({ messages: { create } }, [{ role: 'runner', body: '  ' }], {
        model: 'm',
      }),
    ).resolves.toBeNull()
    expect(create).not.toHaveBeenCalled()
  })

  it('degrades to null when the call throws, and does not rethrow', async () => {
    const client: TitleClientLike = {
      messages: {
        create: vi.fn(async () => {
          throw new Error('socket hang up')
        }),
      },
    }
    await expect(titleNinaSessionWith(client, TURNS, { model: 'm' })).resolves.toBeNull()
  })

  it('degrades on a max_tokens stop rather than using a cut answer', async () => {
    const client = clientReturning(toolMessage({ title: 'Cedera' }, 'max_tokens'))
    await expect(titleNinaSessionWith(client, TURNS, { model: 'm' })).resolves.toBeNull()
  })

  it('degrades when the tool block is absent', async () => {
    const message = {
      ...toolMessage({ title: 'x' }),
      content: [{ type: 'text', text: 'Cedera lutut kanan' }],
    } as unknown as Anthropic.Message
    await expect(
      titleNinaSessionWith(clientReturning(message), TURNS, { model: 'm' }),
    ).resolves.toBeNull()
  })

  it('finds the tool block behind a thinking block', async () => {
    const message = {
      ...toolMessage({ title: 'Cedera lutut' }),
      content: [
        { type: 'thinking', thinking: 'hmm' },
        { type: 'tool_use', id: 'tu_1', name: 'title', input: { title: 'Cedera lutut' } },
      ],
    } as unknown as Anthropic.Message
    await expect(
      titleNinaSessionWith(clientReturning(message), TURNS, { model: 'm' }),
    ).resolves.toBe('Cedera lutut')
  })

  it('degrades when the answer is prose', async () => {
    const client = clientReturning(
      toolMessage({ title: 'Dia bertanya tentang cedera lutut kanannya setelah lari jauh' }),
    )
    await expect(titleNinaSessionWith(client, TURNS, { model: 'm' })).resolves.toBeNull()
  })
})

describe('titleNinaSessionIfNeeded', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('names an untitled session after the first exchange', async () => {
    const store = fakeStore()
    const client = clientReturning(toolMessage({ title: 'Cedera lutut kanan' }))
    await titleNinaSessionIfNeeded('u1', 's1', { store, client, model: 'm' })
    expect(store.written).toEqual(['Cedera lutut kanan'])
  })

  /* The headline exit criterion: after() can run twice and two tabs can race. */
  it('fires exactly once per session under a double-invoked after()', async () => {
    const store = fakeStore()
    const create = vi.fn(async () => toolMessage({ title: 'Cedera lutut kanan' }))
    const client: TitleClientLike = { messages: { create } }

    await titleNinaSessionIfNeeded('u1', 's1', { store, client, model: 'm' })
    await titleNinaSessionIfNeeded('u1', 's1', { store, client, model: 'm' })

    expect(store.written).toEqual(['Cedera lutut kanan'])
    /* The second invocation short-circuits on the cheap read: one model call, not two. */
    expect(create).toHaveBeenCalledTimes(1)
  })

  it('survives two tabs that both got past the cheap read', async () => {
    const store = fakeStore()
    const client = clientReturning(toolMessage({ title: 'Cedera lutut kanan' }))
    await Promise.all([
      titleNinaSessionIfNeeded('u1', 's1', { store, client, model: 'm' }),
      titleNinaSessionIfNeeded('u1', 's1', { store, client, model: 'm' }),
    ])
    expect(store.written).toEqual(['Cedera lutut kanan'])
  })

  it('never overwrites a title he typed himself', async () => {
    const create = vi.fn(async () => toolMessage({ title: 'Cedera lutut kanan' }))
    const store = fakeStore({
      readTitle: async () => ({ title: 'Rencana lari gw', titleSource: 'manual' }),
    })
    await titleNinaSessionIfNeeded('u1', 's1', {
      store,
      client: { messages: { create } },
      model: 'm',
    })
    expect(create).not.toHaveBeenCalled()
    expect(store.written).toEqual([])
  })

  it("never renames migration 0004's backfilled session", async () => {
    const create = vi.fn(async () => toolMessage({ title: 'Cedera lutut kanan' }))
    const store = fakeStore({
      readTitle: async () => ({ title: 'Semua chat sebelumnya', titleSource: 'backfill' }),
    })
    await titleNinaSessionIfNeeded('u1', 's1', {
      store,
      client: { messages: { create } },
      model: 'm',
    })
    expect(create).not.toHaveBeenCalled()
  })

  it('does nothing for a session that is not his, or is gone', async () => {
    const create = vi.fn(async () => toolMessage({ title: 'Cedera lutut' }))
    const store = fakeStore({ readTitle: async () => null })
    await titleNinaSessionIfNeeded('u1', 'sX', {
      store,
      client: { messages: { create } },
      model: 'm',
    })
    expect(create).not.toHaveBeenCalled()
  })

  it('does not name a session where only she has spoken (R3 says user THEN nina)', async () => {
    const create = vi.fn(async () => toolMessage({ title: 'Cedera lutut' }))
    const store = fakeStore({
      readTurns: async () => [{ role: 'nina', body: 'lo ga lari hari ini' }],
    })
    await titleNinaSessionIfNeeded('u1', 's1', {
      store,
      client: { messages: { create } },
      model: 'm',
    })
    expect(create).not.toHaveBeenCalled()
    expect(store.written).toEqual([])
  })

  it('does not name a session where only he has spoken', async () => {
    const create = vi.fn(async () => toolMessage({ title: 'Cedera lutut' }))
    const store = fakeStore({ readTurns: async () => [{ role: 'runner', body: 'lutut gw sakit' }] })
    await titleNinaSessionIfNeeded('u1', 's1', {
      store,
      client: { messages: { create } },
      model: 'm',
    })
    expect(create).not.toHaveBeenCalled()
  })

  it('writes nothing when the model gave no usable title, leaving the retry free', async () => {
    const store = fakeStore()
    await titleNinaSessionIfNeeded('u1', 's1', {
      store,
      client: clientReturning(toolMessage({ title: '' })),
      model: 'm',
    })
    expect(store.written).toEqual([])
  })

  it('never throws, whatever the store does — it runs inside after()', async () => {
    const store = fakeStore({
      readTitle: async () => {
        throw new Error('neon: connection terminated')
      },
    })
    await expect(
      titleNinaSessionIfNeeded('u1', 's1', { store, model: 'm' }),
    ).resolves.toBeUndefined()
  })

  it('ships a production store, so the seam is a test seam and not a second code path', () => {
    expect(typeof dbNinaTitleStore.readTitle).toBe('function')
    expect(typeof dbNinaTitleStore.readTurns).toBe('function')
    expect(typeof dbNinaTitleStore.writeTitleIfUntitled).toBe('function')
  })
})
