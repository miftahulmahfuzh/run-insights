import { beforeEach, describe, expect, it, vi } from 'vitest'

import { isNinaImageJobOpen } from '@/lib/nina/imagejobs'
import { NINA_PHOTO_STALL_INSTRUCTION, NINA_PHOTO_STALL_MAX } from '@/lib/nina/imagestall'
import { loadNinaContext } from '@/lib/nina/load'
import { runNinaPhotoStall } from '@/lib/nina/photostall'
import { insertNinaMessages } from '@/lib/nina/queries'
import { NINA_CORE_TOOL_SET } from '@/lib/nina/tools'
import { NINA_TUNING_DEFAULTS } from '@/lib/nina/tuning'

/**
 * Task #76 / R1 — the loop that keeps Nina talking while the camera is running.
 *
 * The three reads it makes are mocked, as `tests/nina.cron.test.ts` mocks the cron's: the real
 * ones reach Neon and z.ai, and a test that quietly did network I/O to prove a loop terminates
 * would be worse than no test. The TURN is injected rather than mocked, because the whole point of
 * `NinaPhotoStallDeps` is that it is injectable — and asserting on what the injected runner was
 * handed is how the two properties that actually matter get checked: she is given no camera, and
 * she is given the stall instruction.
 */

vi.mock('@/lib/nina/imagejobs', () => ({ isNinaImageJobOpen: vi.fn() }))
vi.mock('@/lib/nina/load', () => ({ loadNinaContext: vi.fn() }))
vi.mock('@/lib/nina/queries', () => ({ insertNinaMessages: vi.fn() }))
/* `productionDeps` opens an LLM client and reads the fallback-model row; neither belongs here, and
 * the deps it returns are only ever handed to the injected runner. */
vi.mock('@/lib/nina/turn', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/nina/turn')>()
  /*
   * **The REAL `NINA_CORE_TOOL_SET`, imported here and not read off `real`.** `lib/nina/turn.ts`
   * imports that value for `productionDeps`' default and does not re-export it, so
   * `real.NINA_CORE_TOOL_SET` is `undefined` — which is exactly what made "hands her no camera"
   * fail with `cannot read properties of undefined (reading 'tools')` while every other test in
   * this file passed, because nothing else looks at the deps. A dynamic import because the
   * factory is hoisted above the file's own imports.
   *
   * And it must be the real one: the whole assertion is that production hands her a set with no
   * camera in it, which a stub set would answer trivially and wrongly.
   */
  const { NINA_CORE_TOOL_SET: realCoreSet } = await import('@/lib/nina/tools')
  return {
    ...real,
    /* A plain async function, NOT a `vi.fn` with an implementation: `vi.resetAllMocks()` in
     * `beforeEach` strips implementations from every spy, and a `productionDeps` that then
     * resolved `undefined` would break every later test in the file. */
    productionDeps: async () => ({
      client: { send: () => Promise.resolve(null) },
      model: 'test-model',
      toolSet: realCoreSet,
      gateway: {},
      store: null,
    }),
  }
})

const jobOpen = vi.mocked(isNinaImageJobOpen)
const loadContext = vi.mocked(loadNinaContext)
const insertMessages = vi.mocked(insertNinaMessages)

/** The only two fields of the context this loop reads itself; the rest goes to the model. */
const contextWith = (window: Array<{ id: string; role: 'runner' | 'nina' }>) =>
  ({ conversation: { window } }) as unknown as Awaited<ReturnType<typeof loadNinaContext>>

const herPromiseOnly = contextWith([
  { id: 'm2', role: 'runner' },
  { id: 'm4', role: 'nina' },
])

const payload = (...bubbles: string[]) => ({
  source: 'model' as const,
  payload: { bubbles },
  firedShortcutIds: [] as string[],
})

const input = () => ({
  userId: 'u1',
  sessionId: 'ses1',
  turnId: 'turn1',
  jobId: 'job1',
  startedAtMs: 0,
  tuning: NINA_TUNING_DEFAULTS,
  history: { runs: [] } as never,
})

/** No real waiting, and a clock that does not move unless a test moves it. */
const deps = (runTurn: unknown, nowMs = 1_000) => ({
  now: () => nowMs,
  sleep: async () => {},
  runTurn: runTurn as never,
})

beforeEach(() => {
  vi.resetAllMocks()
  jobOpen.mockResolvedValue(true)
  loadContext.mockResolvedValue(herPromiseOnly)
  /* Only `rows.length` and the ids are read by the loop; the rest of `NinaMessageRow` is cast
   * past rather than fabricated, the way `contextWith` above casts the context. */
  insertMessages.mockImplementation(
    async (_userId, rows) => rows.map((row, i) => ({ id: `filler-${i}`, body: row.body })) as never,
  )
})

describe('the happy path', () => {
  it('fills the wait up to the cap and then stops', async () => {
    const runTurn = vi.fn().mockResolvedValue(payload('eh btw lo udah makan belom'))

    const emitted = await runNinaPhotoStall(input(), deps(runTurn))

    expect(emitted).toBe(NINA_PHOTO_STALL_MAX)
    expect(runTurn).toHaveBeenCalledTimes(NINA_PHOTO_STALL_MAX)
    expect(insertMessages).toHaveBeenCalledTimes(NINA_PHOTO_STALL_MAX)
  })

  /*
   * THE CARD'S OWN CONSTRAINT, and the reason it cannot be a prompt rule: the duplicate guard
   * keys on `ctx.sourceMessageId`, a proactive turn has none, so a camera offered here would be a
   * camera fired here — and `countNinaTurnsSince` counts those against the daily cap.
   */
  it('hands her no camera', async () => {
    const runTurn = vi.fn().mockResolvedValue(payload('gimana lutut lo'))
    await runNinaPhotoStall(input(), deps(runTurn))

    const names = (
      runTurn.mock.calls[0]![1] as { toolSet: typeof NINA_CORE_TOOL_SET }
    ).toolSet.tools.map((tool) => tool.name)
    expect(names).not.toContain('generate_image')
    expect(names).not.toContain('set_avatar')
    expect(names).not.toContain('set_avatar_from_photo')
    /* And it is still a real turn — she can look a run up while she chats. */
    expect(names).toContain('lookup_runs')
  })

  it('runs as a proactive turn with the stall instruction and nothing of his to answer', async () => {
    const runTurn = vi.fn().mockResolvedValue(payload('lo lagi di rumah?'))
    await runNinaPhotoStall(input(), deps(runTurn))

    const turnInput = runTurn.mock.calls[0]![0] as Record<string, unknown>
    expect(turnInput.proactive).toBe(NINA_PHOTO_STALL_INSTRUCTION)
    expect(turnInput.runnerText).toBeNull()
    expect(turnInput.sourceMessageId).toBeNull()
  })

  /* A filler starts a new thread; a quote header on it would point at the same promise the
   * photograph is about to quote. And it carries the DISPATCHING turn's id, so one wait reads as
   * one turn in the audit join. */
  it('writes unquoted bubbles stamped with the dispatching turn', async () => {
    const runTurn = vi.fn().mockResolvedValue(payload('a', 'b'))
    await runNinaPhotoStall(input(), deps(runTurn))

    const [, rows, sessionId] = insertMessages.mock.calls[0]!
    expect(sessionId).toBe('ses1')
    expect(rows).toEqual([
      { role: 'nina', body: 'a', turnId: 'turn1', replyToId: null },
      { role: 'nina', body: 'b', turnId: 'turn1', replyToId: null },
    ])
  })

  it('re-reads her context every iteration, so the second filler sees the first', async () => {
    const runTurn = vi.fn().mockResolvedValue(payload('satu'))
    await runNinaPhotoStall(input(), deps(runTurn))
    expect(loadContext).toHaveBeenCalledTimes(NINA_PHOTO_STALL_MAX)
  })
})

describe('the stops', () => {
  it('says nothing at all when the photograph already landed', async () => {
    jobOpen.mockResolvedValue(false)
    const runTurn = vi.fn()

    expect(await runNinaPhotoStall(input(), deps(runTurn))).toBe(0)
    expect(runTurn).not.toHaveBeenCalled()
    /* The expensive read is skipped once the cheap one has decided. */
    expect(loadContext).not.toHaveBeenCalled()
  })

  it('stops mid-wait when the photograph lands', async () => {
    jobOpen.mockResolvedValueOnce(true).mockResolvedValue(false)
    const runTurn = vi.fn().mockResolvedValue(payload('bentar'))

    expect(await runNinaPhotoStall(input(), deps(runTurn))).toBe(1)
    expect(runTurn).toHaveBeenCalledTimes(1)
  })

  /* The success case: she asked him something and he answered. The chain in
   * `runNinaBackgroundTurn` owns him from here, and talking over it would be the one real harm
   * this loop could do. */
  it('gets out of the way the moment he answers', async () => {
    loadContext.mockResolvedValue(contextWith([{ id: 'm5', role: 'runner' }]))
    const runTurn = vi.fn()

    expect(await runNinaPhotoStall(input(), deps(runTurn))).toBe(0)
    expect(runTurn).not.toHaveBeenCalled()
  })

  it('stops when the claim can no longer honestly be held open', async () => {
    const runTurn = vi.fn().mockResolvedValue(payload('halo'))
    /* Past `NINA_PHOTO_STALL_DEADLINE_MS - NINA_PHOTO_STALL_RESERVE_MS` already. */
    expect(await runNinaPhotoStall(input(), deps(runTurn, 60_000))).toBe(0)
    expect(runTurn).not.toHaveBeenCalled()
  })
})

describe('it never throws', () => {
  it('ends the stall when the job read fails rather than guessing she may keep talking', async () => {
    jobOpen.mockRejectedValue(new Error('neon is down'))
    const runTurn = vi.fn()

    await expect(runNinaPhotoStall(input(), deps(runTurn))).resolves.toBe(0)
    expect(runTurn).not.toHaveBeenCalled()
  })

  it('swallows a context read that fails', async () => {
    loadContext.mockRejectedValue(new Error('neon is down'))
    await expect(runNinaPhotoStall(input(), deps(vi.fn()))).resolves.toBe(0)
  })

  it('swallows a turn that throws, and keeps what already landed', async () => {
    const runTurn = vi
      .fn()
      .mockResolvedValueOnce(payload('satu'))
      .mockRejectedValue(new Error('z.ai is down'))

    await expect(runNinaPhotoStall(input(), deps(runTurn))).resolves.toBe(1)
  })

  /* Her silence is silence — no app-authored bubble — and a model that declined once will decline
   * again, so the stall ends rather than paying for a second refusal. */
  it('stops without writing anything when she produces no payload', async () => {
    const runTurn = vi
      .fn()
      .mockResolvedValue({ source: 'unavailable', payload: null, firedShortcutIds: [] })

    expect(await runNinaPhotoStall(input(), deps(runTurn))).toBe(0)
    expect(insertMessages).not.toHaveBeenCalled()
  })

  /* `insertNinaMessages` degrades to `[]` for a session deleted mid-wait. */
  it('stops when the conversation was deleted while she was thinking', async () => {
    insertMessages.mockResolvedValue([])
    const runTurn = vi.fn().mockResolvedValue(payload('halo'))

    expect(await runNinaPhotoStall(input(), deps(runTurn))).toBe(0)
    expect(runTurn).toHaveBeenCalledTimes(1)
  })
})
