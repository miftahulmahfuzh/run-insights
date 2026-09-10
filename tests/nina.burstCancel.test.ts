import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * **R1: the send that arrives while she is THINKING cancels her turn and retargets the
 * conversation — and the cancelled turn's own invocation, when its model call finally returns,
 * persists NOTHING.**
 *
 * Six properties, in the order they would hurt if they were wrong:
 *
 *   1. **The cancel runs on the send path, after his row is persisted and before the open** —
 *      never on a send that is about to refuse, never after a claim has already been opened.
 *   2. **A WON cancel starts a fresh turn** — the send returns the NEW claim's `turnId` and defers
 *      exactly one background turn. The client branches on none of it.
 *   3. **A LOST cancel is exactly today** — the open refuses, `turnId` is null, nothing is
 *      deferred, the running turn chains onto the message.
 *   4. **A FAILED cancel degrades to today too (invariant 7)** — the open still runs.
 *   5. **The superseded turn's answer is discarded whole** — no bubble INSERT beyond his own row,
 *      no close, no distillation, no auto-title, not even the chain's newest-row read — while the
 *      shortcut bump, which sits above the exit on purpose, still fires.
 *   6. **An ownership read answering false persists everything, exactly as today** — the
 *      regression guard for the ordinary turn.
 */

const { deferred } = vi.hoisted(() => ({ deferred: [] as Array<() => unknown> }))

vi.mock('next/server', () => ({
  after: (task: () => unknown) => {
    deferred.push(task)
  },
}))

const requireUserId = vi.fn<() => Promise<string>>()
vi.mock('@/lib/auth/requireUserId', () => ({ requireUserId: () => requireUserId() }))

const spies = vi.hoisted(() => ({
  getNinaSession: vi.fn(),
  insertNinaMessages: vi.fn(),
  listNinaMessages: vi.fn(),
  listNinaShortcuts: vi.fn(async () => []),
  readNinaTuning: vi.fn(),
  bumpNinaShortcutUses: vi.fn(),
}))

vi.mock('@/lib/nina/queries', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/nina/queries')>()
  return { ...actual, ...spies }
})

const supersedeNinaChatTurn = vi.fn()
const openNinaChatTurn = vi.fn()
const chatTurnWasSuperseded = vi.fn()
const closeNinaChatTurn = vi.fn()
const ninaSessionExists = vi.fn()

vi.mock('@/lib/nina/chatturn', () => ({
  chatTurnWasSuperseded: (...a: unknown[]) => chatTurnWasSuperseded(...a),
  closeNinaChatTurn: (...a: unknown[]) => closeNinaChatTurn(...a),
  getPendingNinaChatTurn: vi.fn(),
  ninaChatTurnStore: () => ({ record: vi.fn() }),
  ninaSessionExists: (...a: unknown[]) => ninaSessionExists(...a),
  openNinaChatTurn: (...a: unknown[]) => openNinaChatTurn(...a),
  supersedeNinaChatTurn: (...a: unknown[]) => supersedeNinaChatTurn(...a),
  sweepStaleNinaChatTurns: vi.fn(async () => 0),
}))

const loadNinaContext = vi.fn()
const runNinaTurn = vi.fn()
const runTurnDistillation = vi.fn()
const titleNinaSessionIfNeeded = vi.fn()

vi.mock('@/lib/nina/load', () => ({ loadNinaContext: (...a: unknown[]) => loadNinaContext(...a) }))
vi.mock('@/lib/nina/gateway', () => ({
  dbNinaSourceGateway: {},
  dbNinaToolGateway: { loadRunHistory: () => Promise.resolve([]) },
}))
vi.mock('@/lib/nina/turn', () => ({
  /* The chain's wall-clock guard reads `.overall`; the real literal, so the arithmetic is real. */
  NINA_TURN_BUDGET: { overall: 45_000 },
  /* The burst walk in `runNinaBackgroundTurn` reads this (burst-cancel set R2). Vitest THROWS on
   * an export the factory omits, which would crash the turn before its model call — the value is
   * the real literal, though no test here reads it. */
  NINA_BURST_MAX_MESSAGES: 6,
  productionDeps: () => ({}),
  runNinaTurn: (...a: unknown[]) => runNinaTurn(...a),
}))
vi.mock('@/lib/nina/distill', () => ({
  runTurnDistillation: (...a: unknown[]) => runTurnDistillation(...a),
}))
vi.mock('@/lib/nina/autotitle', () => ({
  titleNinaSessionIfNeeded: (...a: unknown[]) => titleNinaSessionIfNeeded(...a),
}))

/* `authEnv()` parses eagerly on first call and `sendNinaMessage` calls it before the ticket loop. */
process.env.AUTH_SECRET ??= 'unit-secret'
process.env.AUTH_GOOGLE_ID ??= 'unit-id'
process.env.AUTH_GOOGLE_SECRET ??= 'unit-secret'

const USER = 'u1'
const SESSION = 'ses000000001'
const HIS = 'msgRUNNER001'
const TURN = 'turn00000001'
const TURN2 = 'turn00000002'

/** The row `insertNinaMessages` returns for HIS message — the send reads only `id` and `seq`. */
function runnerRow() {
  return [{ id: HIS, seq: 41, body: 'dan mau makan apa lunch?', replyToId: null }]
}

/** Her answer, for the turns that are ALLOWED to persist it. */
function ninaRows() {
  return [
    { id: 'msgNINA00001', seq: 42, body: 'iya, makan bareng yuk', replyToId: HIS },
    { id: 'msgNINA00002', seq: 43, body: 'abis itu kita jalan', replyToId: null },
  ]
}

/** A `runNinaTurn` answer with a real payload — the discard must be a CHOICE, not an absence. */
function answeredResult() {
  return {
    source: 'llm' as const,
    payload: {
      bubbles: ['iya, makan bareng yuk', 'abis itu kita jalan'],
      memoryWrites: [],
    },
    usage: { inputTokens: 1_234, outputTokens: 567 },
    trace: { model: 'glm-5.3', promptVersion: 7, rounds: 0, toolCalls: [], latencyMs: 13_000 },
    firedShortcutIds: ['scShortcut01'],
  }
}

type Actions = typeof import('@/lib/nina/actions')
let actions: Actions

beforeEach(async () => {
  deferred.length = 0
  vi.clearAllMocks()

  requireUserId.mockResolvedValue(USER)
  spies.getNinaSession.mockResolvedValue({ id: SESSION })
  spies.insertNinaMessages.mockResolvedValue(runnerRow())
  /* The newest row in the session is HERS, so the chain's guard exits and a drained turn stays one
   * turn deep — the chain is this phase's unchanged machinery and is asserted separately. */
  spies.listNinaMessages.mockResolvedValue([
    { id: 'msgNINA00001', seq: 42, role: 'nina', body: 'iya', runId: null },
  ])
  spies.readNinaTuning.mockResolvedValue({ relationship: 'friend' })
  /* The bump sits above every early return and the code `void`s its `.catch` off the returned
   * promise — the spy must return one, or the turn dies as 'crashed' on a real fired shortcut. */
  spies.bumpNinaShortcutUses.mockResolvedValue(undefined)

  supersedeNinaChatTurn.mockResolvedValue(false)
  openNinaChatTurn.mockResolvedValue(TURN)
  chatTurnWasSuperseded.mockResolvedValue(false)
  closeNinaChatTurn.mockResolvedValue(undefined)
  ninaSessionExists.mockResolvedValue(true)

  /* Shaped for everything the background turn reads off the context: the window (chain guard,
   * ownership set, recentRunnerTexts), and — on the paths that reach distillation — the memory
   * slots, the runner identity and `olderMessageCount` that `runNinaDistillation` maps in. */
  loadNinaContext.mockResolvedValue({
    conversation: { window: [], olderMessageCount: 0 },
    memory: { slots: [] },
    runner: { fullName: 'Test Runner', nickname: null },
  })
  runNinaTurn.mockResolvedValue(answeredResult())
  runTurnDistillation.mockResolvedValue(undefined)
  titleNinaSessionIfNeeded.mockResolvedValue(undefined)

  actions = await import('@/lib/nina/actions')
})

/** The burst message: a plain send into a session he already has. */
function send(): Promise<Awaited<ReturnType<typeof actions.sendNinaMessage>>> {
  return actions.sendNinaMessage({ body: 'dan mau makan apa lunch?', sessionId: SESSION })
}

describe('a send that arrives while she is thinking', () => {
  it('cancels after his row is persisted and before the claim is opened', async () => {
    supersedeNinaChatTurn.mockResolvedValue(true)
    openNinaChatTurn.mockResolvedValue(TURN2)

    await send()

    expect(supersedeNinaChatTurn).toHaveBeenCalledWith(USER, SESSION)
    /* His row first — a refusal can never waste a cancel — then the cancel, then the open that
     * needs the claim gone. */
    const rowOrder = spies.insertNinaMessages.mock.invocationCallOrder[0]!
    const cancelOrder = supersedeNinaChatTurn.mock.invocationCallOrder[0]!
    const openOrder = openNinaChatTurn.mock.invocationCallOrder[0]!
    expect(rowOrder).toBeLessThan(cancelOrder)
    expect(cancelOrder).toBeLessThan(openOrder)
  })

  it('reports the NEW turn as the send’s turnId and defers exactly one background turn', async () => {
    supersedeNinaChatTurn.mockResolvedValue(true)
    openNinaChatTurn.mockResolvedValue(TURN2)

    const result = await send()

    expect(result).toEqual({
      ok: true,
      userMessageId: HIS,
      sessionId: SESSION,
      cursor: 41,
      turnId: TURN2,
    })
    expect(openNinaChatTurn).toHaveBeenCalledWith(USER, {
      sessionId: SESSION,
      runnerMessageId: HIS,
      depth: 0,
    })
    expect(deferred).toHaveLength(1)
  })

  it('keeps the current behavior when the cancel loses the race', async () => {
    /* She reached 'persisting': the cancel answers false and the open refuses — the chain, not a
     * cancel, is what happens next. Nothing is deferred. */
    supersedeNinaChatTurn.mockResolvedValue(false)
    openNinaChatTurn.mockResolvedValue(null)

    const result = await send()

    expect(result).toEqual({
      ok: true,
      userMessageId: HIS,
      sessionId: SESSION,
      cursor: 41,
      turnId: null,
    })
    expect(deferred).toHaveLength(0)
  })

  it('degrades to the current behavior when the cancel itself fails (invariant 7)', async () => {
    supersedeNinaChatTurn.mockRejectedValue(new Error('neon: connection reset'))

    const result = await send()

    expect(result.ok).toBe(true)
    expect(result.turnId).toBe(TURN)
    expect(deferred).toHaveLength(1)
  })
})

describe('the superseded invocation, when its model call returns', () => {
  beforeEach(() => {
    /* An ORDINARY first send; a LATER send is what superseded this turn mid-flight. */
    supersedeNinaChatTurn.mockResolvedValue(false)
    chatTurnWasSuperseded.mockResolvedValue(true)
  })

  it('persists nothing and starts no chain', async () => {
    await send()
    expect(deferred).toHaveLength(1)
    await deferred[0]!()

    /* His row was written by the send; her rows never are — and she HAD an answer. */
    expect(spies.insertNinaMessages).toHaveBeenCalledTimes(1)
    const [userId, rows] = spies.insertNinaMessages.mock.calls[0]!
    expect(userId).toBe(USER)
    expect((rows as Array<{ role: string }>)[0]!.role).toBe('runner')
    /* The claim was already closed by the cancel; the discard must not touch it again. */
    expect(closeNinaChatTurn).not.toHaveBeenCalled()
    expect(runTurnDistillation).not.toHaveBeenCalled()
    expect(titleNinaSessionIfNeeded).not.toHaveBeenCalled()
    /* The exit sits above the session check AND the chain's newest-row read. */
    expect(ninaSessionExists).not.toHaveBeenCalled()
    expect(spies.listNinaMessages).not.toHaveBeenCalled()
    expect(openNinaChatTurn).toHaveBeenCalledTimes(1)
  })

  it('still counts the shortcuts the superseded turn fired', async () => {
    await send()
    await deferred[0]!()

    expect(spies.bumpNinaShortcutUses).toHaveBeenCalledWith(USER, ['scShortcut01'])
  })
})

describe('an ownership read that answers false', () => {
  it('persists the answer exactly as today', async () => {
    /* The real `chatTurnWasSuperseded` answers false whenever it cannot PROVE a supersede —
     * including when its own read throws — so `false` is both "she was not cancelled" and the
     * read-failed degradation. */
    chatTurnWasSuperseded.mockResolvedValue(false)
    spies.insertNinaMessages
      .mockReset()
      .mockResolvedValueOnce(runnerRow())
      .mockResolvedValue(ninaRows())

    await send()
    await deferred[0]!()

    expect(spies.insertNinaMessages).toHaveBeenCalledTimes(2)
    const herCall = spies.insertNinaMessages.mock.calls[1]!
    expect(herCall[1]).toHaveLength(2)
    expect(closeNinaChatTurn).toHaveBeenCalledWith(USER, TURN, 'llm')
    expect(runTurnDistillation).toHaveBeenCalledTimes(1)
    expect(titleNinaSessionIfNeeded).toHaveBeenCalledWith(USER, SESSION)
  })
})
