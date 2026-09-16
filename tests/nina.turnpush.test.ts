import { beforeEach, describe, expect, it, vi } from 'vitest'

import { runNinaBackgroundTurn, type NinaTurnDeps, type NinaTurnNotifier } from '@/lib/nina/turnrun'

/**
 * **R1: a reply the background turn commits sends exactly one push — and a reply it never commits
 * sends none.**
 *
 * Nine properties, in the order they would hurt if they were wrong:
 *
 *   1. **A committed reply notifies once**, with the rows `insertNinaMessages` returned and the
 *      kind `'chat_reply'`.
 *   2. **The order is insert -> close -> notify -> distill.** Below the close so the poll can
 *      already see the reply; above the distillation's 10-20 s model call so the buzz is not held
 *      behind it.
 *   3. **The supersession discard notifies nothing** — her answer is a duplicate and is never
 *      written.
 *   4. **The deleted-session abandon notifies nothing** — the conversation is gone.
 *   5. **A null payload notifies nothing** — she produced no bubble; the turn still closes and
 *      still distills.
 *   6. **An insert that degrades to `[]` notifies nothing** — `insertNinaMessages` returns an empty
 *      array rather than throwing for a session that is not this user's, and a notification for a
 *      message that does not exist is the worst outcome available on this path.
 *   7. **A chained follow-up sends its own push** — the seam is threaded through the recursion.
 *   8. **A notify rejection costs nothing** — the rows, the closed claim, the distillation, the
 *      auto-title and the chain all still happen (plan invariant 2).
 *   9. **The default seam is the real push sender** — no `deps`, and `lib/push/send`'s notifier is
 *      what gets called.
 *
 * ── WHAT IS MOCKED, AND WHY IT IS ONLY THE EDGES ──────────────────────────────────────────────
 * `@/lib/nina/queries`, `@/lib/nina/chatturn`, `@/lib/nina/load`, `@/lib/nina/gateway`,
 * `@/lib/nina/turn`, `@/lib/nina/distill`, `@/lib/nina/autotitle` — the same set
 * `tests/nina.burstCancel.test.ts` mocks, for the same reason. `turnrun.ts` itself is real.
 * `@/lib/push/send` is mocked so property 9 can observe the default WITHOUT depending on the
 * absence of `VAPID_*` from the environment; every other property drives an injected notifier. No
 * test in this file can reach a push service (plan invariant 7).
 */

/* ── the edges ─────────────────────────────────────────────────────────────────────────────── */

const insertNinaMessages = vi.fn()
const listNinaMessages = vi.fn()
const readNinaTuning = vi.fn()
const bumpNinaShortcutUses = vi.fn()

vi.mock('@/lib/nina/queries', () => ({
  /* Every name `turnrun.ts` imports. A missing one is an import error, not an undefined. */
  bumpNinaShortcutUses: (...a: unknown[]) => bumpNinaShortcutUses(...a),
  insertNinaMessages: (...a: unknown[]) => insertNinaMessages(...a),
  listNinaMessages: (...a: unknown[]) => listNinaMessages(...a),
  listNinaShortcuts: vi.fn(async () => []),
  readNinaTuning: (...a: unknown[]) => readNinaTuning(...a),
}))

const chatTurnWasSuperseded = vi.fn()
const closeNinaChatTurn = vi.fn()
const ninaSessionExists = vi.fn()
const openNinaChatTurn = vi.fn()

vi.mock('@/lib/nina/chatturn', () => ({
  chatTurnWasSuperseded: (...a: unknown[]) => chatTurnWasSuperseded(...a),
  closeNinaChatTurn: (...a: unknown[]) => closeNinaChatTurn(...a),
  getPendingNinaChatTurn: vi.fn(),
  ninaChatTurnStore: () => ({ record: vi.fn() }),
  ninaSessionExists: (...a: unknown[]) => ninaSessionExists(...a),
  openNinaChatTurn: (...a: unknown[]) => openNinaChatTurn(...a),
  supersedeNinaChatTurn: vi.fn(),
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
  /* The burst walk reads this. Vitest THROWS on an export the factory omits, which would crash the
   * turn before its model call — the value is the real literal, though no test here reads it. */
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

/* Property 9 only: the DEFAULT seam. Every other property injects, so this mock is idle for them. */
const notifyNinaPush = vi.fn()
vi.mock('@/lib/push/send', () => ({
  notifyNinaPush: (...a: unknown[]) => notifyNinaPush(...a),
  pushNotifier: vi.fn(),
  sendNinaPush: vi.fn(),
}))

/* ── the fixture ───────────────────────────────────────────────────────────────────────────── */

const USER = 'u1'
const SESSION = 'ses000000001'
const HIS = 'msgrunner001'
const TURN = 'turn00000001'
const TURN2 = 'turn00000002'

/** Her answer, as `insertNinaMessages` returns it — the rows the notification is built from. */
function ninaRows() {
  return [
    { id: 'msgnina00001', seq: 42, body: 'iya, makan bareng yuk', replyToId: HIS },
    { id: 'msgnina00002', seq: 43, body: 'abis itu kita jalan', replyToId: null },
  ]
}

/** The chained link's answer, distinct so property 7 can tell the two pushes apart. */
function chainedRows() {
  return [{ id: 'msgnina00003', seq: 44, body: 'jam 12 ya', replyToId: null }]
}

/**
 * What `notify` actually receives: `turnrun.ts` maps `insertNinaMessages`' rows down to
 * `SentBubble` (`{ id, body, replyToId }`) before calling the seam, dropping `seq`. That mapping
 * predates this phase — it is not something Step 4 touches — so the assertions compare against
 * this projection rather than the raw row shape `ninaRows()`/`chainedRows()` return.
 */
function toBubbles(rows: ReturnType<typeof ninaRows>) {
  return rows.map(({ id, body, replyToId }) => ({ id, body, replyToId }))
}

/** A `runNinaTurn` answer with a real payload — every no-push exit must be a CHOICE, not silence. */
function answeredResult() {
  return {
    source: 'llm' as const,
    payload: { bubbles: ['iya, makan bareng yuk', 'abis itu kita jalan'], memoryWrites: [] },
    usage: { inputTokens: 1_234, outputTokens: 567 },
    trace: { model: 'glm-5.3', promptVersion: 7, rounds: 0, toolCalls: [], latencyMs: 13_000 },
    firedShortcutIds: [],
  }
}

/** The turn's input at depth 0, as `startNinaBackgroundTurn` builds it. */
function turnInput(overrides: { depth?: number } = {}) {
  return {
    userId: USER,
    sessionId: SESSION,
    turnId: TURN,
    runnerMessageId: HIS,
    runnerText: 'mau makan apa lunch?',
    imageDescriptions: [] as readonly string[],
    quotedRow: null,
    attachedRunId: null,
    depth: overrides.depth ?? 0,
    /* NOW, so the chain's wall-clock guard (240 s budget minus a 45 s turn) never trips. */
    startedAtMs: Date.now(),
  }
}

const notify = vi.fn<NinaTurnNotifier>()
const deps: NinaTurnDeps = { notify }

beforeEach(() => {
  /* `resetAllMocks`, not `clearAllMocks`: properties 6 and 7 queue `mockResolvedValueOnce`, and an
   * unconsumed once-value from a failed test ghosts into the next one. */
  vi.resetAllMocks()

  insertNinaMessages.mockResolvedValue(ninaRows())
  /* The newest row in the session is HERS, so the chain's guard exits and an ordinary turn stays
   * one turn deep. Property 7 overrides this. */
  listNinaMessages.mockResolvedValue([
    { id: 'msgnina00001', seq: 42, role: 'nina', body: 'iya', runId: null },
  ])
  readNinaTuning.mockResolvedValue({ relationship: 'friend' })
  bumpNinaShortcutUses.mockResolvedValue(undefined)

  chatTurnWasSuperseded.mockResolvedValue(false)
  closeNinaChatTurn.mockResolvedValue(undefined)
  ninaSessionExists.mockResolvedValue(true)
  openNinaChatTurn.mockResolvedValue(TURN2)

  /* Shaped for everything the turn reads off the context: the window (the burst walk, the
   * ownership set, `recentRunnerTexts`, the chain guard), and the memory slots, runner identity
   * and `olderMessageCount` that `runNinaDistillation` maps in. */
  loadNinaContext.mockResolvedValue({
    conversation: { window: [], olderMessageCount: 0 },
    memory: { slots: [] },
    runner: { fullName: 'Test Runner', nickname: null },
  })
  runNinaTurn.mockResolvedValue(answeredResult())
  runTurnDistillation.mockResolvedValue(undefined)
  titleNinaSessionIfNeeded.mockResolvedValue(undefined)

  notify.mockResolvedValue(undefined)
  notifyNinaPush.mockResolvedValue(undefined)
})

/* ── 1 & 2: the reply that lands ───────────────────────────────────────────────────────────── */

describe('a reply the turn commits', () => {
  it('notifies once, with the committed rows and the chat_reply kind', async () => {
    await runNinaBackgroundTurn(turnInput(), deps)

    expect(notify).toHaveBeenCalledTimes(1)
    /* The trailing `undefined, SESSION` is R2: no explicit tap target, and the session the rows
     * were committed to, from which `buildNinaPushPayload` derives `/nina?s=…&jump=…`. The chain's
     * second link (property 7) gets the same session, because it is the same conversation. */
    expect(notify).toHaveBeenCalledWith(
      USER,
      toBubbles(ninaRows()),
      'chat_reply',
      undefined,
      SESSION,
    )
  })

  it('notifies after the insert and the close, and before the distillation', async () => {
    await runNinaBackgroundTurn(turnInput(), deps)

    const insertOrder = insertNinaMessages.mock.invocationCallOrder[0]!
    const closeOrder = closeNinaChatTurn.mock.invocationCallOrder[0]!
    const notifyOrder = notify.mock.invocationCallOrder[0]!
    const distillOrder = runTurnDistillation.mock.invocationCallOrder[0]!

    /* Below the close, because the poll's two questions both flip there — a push that beats the
     * close lands him on a screen still showing a typing indicator. */
    expect(insertOrder).toBeLessThan(closeOrder)
    expect(closeOrder).toBeLessThan(notifyOrder)
    /* Above the distillation, which is a 10-20 s model call on a reply already 13-45 s old. */
    expect(notifyOrder).toBeLessThan(distillOrder)
  })
})

/* ── 3, 4, 5, 6: every path that writes no bubble ──────────────────────────────────────────── */

describe('a turn that writes no bubble', () => {
  it('sends nothing when the turn was superseded mid-flight', async () => {
    chatTurnWasSuperseded.mockResolvedValue(true)

    await runNinaBackgroundTurn(turnInput(), deps)

    expect(notify).not.toHaveBeenCalled()
    /* And it really was a DISCARD, not an absence of an answer: she had one. */
    expect(insertNinaMessages).not.toHaveBeenCalled()
  })

  it('sends nothing when the session was deleted mid-turn', async () => {
    ninaSessionExists.mockResolvedValue(false)

    await runNinaBackgroundTurn(turnInput(), deps)

    expect(notify).not.toHaveBeenCalled()
    expect(insertNinaMessages).not.toHaveBeenCalled()
  })

  it('sends nothing when she produced no payload, and still closes and distills', async () => {
    runNinaTurn.mockResolvedValue({ ...answeredResult(), payload: null })

    await runNinaBackgroundTurn(turnInput(), deps)

    expect(notify).not.toHaveBeenCalled()
    expect(insertNinaMessages).not.toHaveBeenCalled()
    expect(closeNinaChatTurn).toHaveBeenCalledWith(USER, TURN, 'llm')
    expect(runTurnDistillation).toHaveBeenCalledTimes(1)
  })

  it('sends nothing when the insert degrades to an empty array', async () => {
    /* `insertNinaMessages` returns `[]` rather than throwing for a session that is not this user's.
     * The turn reaches the notify line with nothing committed, and the `bubbles.length` guard is
     * the only thing between that and a notification for a message that does not exist. */
    insertNinaMessages.mockResolvedValue([])

    await runNinaBackgroundTurn(turnInput(), deps)

    expect(insertNinaMessages).toHaveBeenCalledTimes(1)
    expect(notify).not.toHaveBeenCalled()
    /* The turn is otherwise unchanged — this is a guard, not a new exit. */
    expect(closeNinaChatTurn).toHaveBeenCalledWith(USER, TURN, 'llm')
    expect(runTurnDistillation).toHaveBeenCalledTimes(1)
  })
})

/* ── 7: the chain ──────────────────────────────────────────────────────────────────────────── */

describe('a chained follow-up', () => {
  it('sends its own push', async () => {
    /* The newest row is HIS after the first turn, so the chain opens a second claim and recurses;
     * after the second turn it is HERS, so the chain stops one link deep. */
    listNinaMessages
      .mockResolvedValueOnce([
        { id: 'msgrunner002', seq: 44, role: 'runner', body: 'eh', runId: null },
      ])
      .mockResolvedValue([
        { id: 'msgnina00003', seq: 45, role: 'nina', body: 'jam 12 ya', runId: null },
      ])
    insertNinaMessages.mockResolvedValueOnce(ninaRows()).mockResolvedValue(chainedRows())

    await runNinaBackgroundTurn(turnInput(), deps)

    expect(openNinaChatTurn).toHaveBeenCalledTimes(1)
    expect(notify).toHaveBeenCalledTimes(2)
    expect(notify).toHaveBeenNthCalledWith(
      1,
      USER,
      toBubbles(ninaRows()),
      'chat_reply',
      undefined,
      SESSION,
    )
    /* The seam reached the recursion. Without `deps` threaded at the chain's call site this second
     * assertion fails while the first passes — which is exactly the bug it exists to catch. */
    expect(notify).toHaveBeenNthCalledWith(
      2,
      USER,
      toBubbles(chainedRows()),
      'chat_reply',
      undefined,
      SESSION,
    )
  })
})

/* ── 8: invariant 2 ────────────────────────────────────────────────────────────────────────── */

describe('a notify that fails', () => {
  it('costs the turn nothing', async () => {
    notify.mockRejectedValue(new Error('apn: 503'))
    listNinaMessages.mockResolvedValue([
      { id: 'msgrunner002', seq: 44, role: 'runner', body: 'eh', runId: null },
    ])

    await runNinaBackgroundTurn(turnInput({ depth: 1 }), deps)

    /* The rows, the closed claim, the distillation and the auto-title are all untouched … */
    /* … and the claim is never re-closed with a FAILURE reason, because the turn did not fail: both
     * links close with 'llm' and neither logs a crash. */
    expect(closeNinaChatTurn).toHaveBeenCalledWith(USER, TURN, 'llm')
    expect(titleNinaSessionIfNeeded).toHaveBeenCalledWith(USER, SESSION)
    /* … and the chain still runs: `depth: 1` is under NINA_TURN_CHAIN_MAX (= 2), so the newest row
     * being his opens one more link at depth 2 — which then hits the cap and stops. That second
     * link is a full turn of its own (its own insert, close, notify, distillation, title), so
     * `insertNinaMessages`, `closeNinaChatTurn` and `runTurnDistillation` each run twice in total,
     * not once; `openNinaChatTurn` answering TURN2 is what proves the swallow did not eat the rest
     * of the function. */
    expect(insertNinaMessages).toHaveBeenCalledTimes(2)
    expect(closeNinaChatTurn).toHaveBeenCalledTimes(2)
    expect(runTurnDistillation).toHaveBeenCalledTimes(2)
    expect(openNinaChatTurn).toHaveBeenCalled()
  })
})

/* ── 9: the default ────────────────────────────────────────────────────────────────────────── */

describe('the default seam', () => {
  it('is lib/push/send’s notifier when no deps are passed', async () => {
    await runNinaBackgroundTurn(turnInput())

    expect(notifyNinaPush).toHaveBeenCalledTimes(1)
    expect(notifyNinaPush).toHaveBeenCalledWith(
      USER,
      toBubbles(ninaRows()),
      'chat_reply',
      undefined,
      SESSION,
    )
    /* The injected double was never wired on this call — the production default really is the path. */
    expect(notify).not.toHaveBeenCalled()
  })
})
