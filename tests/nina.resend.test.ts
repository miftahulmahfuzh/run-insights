import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * **R5: a resend re-runs the turn for a row that is already there, and writes nothing.**
 *
 * Five properties, in the order they would hurt if they were wrong:
 *
 *   1. **INVARIANT 7.** `insertNinaMessages` and `insertNinaMessageImages` are never reached by
 *      this action's own body. A second copy of his sentence would be a second copy in the 40-row
 *      window Nina reads as context on every later turn, which is the one failure the user would
 *      see immediately.
 *   2. **The claim, not the message.** One `openNinaChatTurn` against the SAME
 *      `runner_message_id`, at `depth: 0`, in the row's own session — and a null from it is a
 *      REFUSAL here (`'turn-live'`), unlike on the send path where it is the ordinary burst case.
 *   3. **The turn input is rebuilt from the row.** `runnerText` from `text`,
 *      `imageDescriptions` from the message's own `nina_message_images` with the
 *      `NINA_DESCRIPTION_UNAVAILABLE` substitution, `quotedRow` from `reply_to_id`,
 *      `attachedRunId` from `run_id`. Passing `[]` for the descriptions would re-answer a photo
 *      message as if the photo were not there, because `lib/nina/gateway.ts:164` hardcodes
 *      `imageDescriptions: []` for window rows.
 *   4. **Ownership is proved before anything happens**, and "not his" reads identically to "not
 *      there" (invariant 4). `requireUserId` is called above the shape check.
 *   5. **The cursor is the newest `seq`, not the resent row's.** `pollNinaReply` polls
 *      `seq > afterSeq` and returns HER rows from that set, so the resent row's own `seq` would
 *      re-deliver every bubble of hers that already sits above it.
 *
 * ── WHAT IS MOCKED, AND WHY IT IS ONLY THE EDGES ──────────────────────────────────────────────
 * `next/server`, `@/lib/auth/requireUserId`, `@/lib/nina/queries`, `@/lib/nina/chatturn`, and — for
 * the LAST block only, which drains the deferred turn — `@/lib/nina/load`, `@/lib/nina/gateway`,
 * `@/lib/nina/turn`, `@/lib/nina/distill` and `@/lib/nina/autotitle`. `lib/nina/actions.ts` itself
 * is the real module, which is the point: `tests/nina.jobActions.test.ts` established this exact
 * arrangement one feature over, and its reason applies verbatim — mocking the module under test
 * would have made every property above untestable.
 */

/* ── the edges ─────────────────────────────────────────────────────────────────────────────── */

/**
 * `vi.hoisted`, because `vi.mock`'s factory is lifted above every declaration in this file.
 *
 * `deferred` collects what `startNinaBackgroundTurn` hands `after()`. On this path the collected
 * callback IS the turn, so the suite owns the ordering — `tests/nina.jobActions.test.ts`'s
 * arrangement and its stated reason.
 */
const { deferred } = vi.hoisted(() => ({ deferred: [] as Array<() => unknown> }))

vi.mock('next/server', () => ({
  after: (task: () => unknown) => {
    deferred.push(task)
  },
}))

const requireUserId = vi.fn<() => Promise<string>>()
const getNinaMessagesByIds = vi.fn()
const getNinaMessageImagesForMessages = vi.fn()
const insertNinaMessages = vi.fn()
const insertNinaMessageImages = vi.fn()
const listNinaMessages = vi.fn()
const readNinaTuning = vi.fn()

vi.mock('@/lib/auth/requireUserId', () => ({ requireUserId: () => requireUserId() }))

/* Every name `lib/nina/actions.ts` imports from `./queries`. A factory replaces the whole module,
 * so a missing one is an import error rather than an undefined at call time. */
vi.mock('@/lib/nina/queries', () => ({
  bumpNinaShortcutUses: vi.fn(),
  getNinaAvatar: vi.fn(),
  getNinaMessageImage: vi.fn(),
  getNinaMessageImagesForMessages: (...a: unknown[]) => getNinaMessageImagesForMessages(...a),
  getNinaMessagesByIds: (...a: unknown[]) => getNinaMessagesByIds(...a),
  getNinaSession: vi.fn(),
  insertNinaMessageImages: (...a: unknown[]) => insertNinaMessageImages(...a),
  insertNinaMessages: (...a: unknown[]) => insertNinaMessages(...a),
  listNinaMessages: (...a: unknown[]) => listNinaMessages(...a),
  listNinaMessagesAfter: vi.fn(),
  /* Resolves `[]` rather than `undefined`: `runNinaBackgroundTurn` awaits it in a `Promise.all`
   * and hands the answer straight to `runNinaTurn`. */
  listNinaShortcuts: vi.fn(async () => []),
  readNinaTuning: (...a: unknown[]) => readNinaTuning(...a),
}))

const openNinaChatTurn = vi.fn()
const sweepStaleNinaChatTurns = vi.fn()
const closeNinaChatTurn = vi.fn()
const ninaSessionExists = vi.fn()

vi.mock('@/lib/nina/chatturn', () => ({
  closeNinaChatTurn: (...a: unknown[]) => closeNinaChatTurn(...a),
  getPendingNinaChatTurn: vi.fn(),
  ninaChatTurnStore: () => ({ record: vi.fn() }),
  ninaSessionExists: (...a: unknown[]) => ninaSessionExists(...a),
  openNinaChatTurn: (...a: unknown[]) => openNinaChatTurn(...a),
  sweepStaleNinaChatTurns: (...a: unknown[]) => sweepStaleNinaChatTurns(...a),
}))

/* The background turn's own edges. Mocked so the deferred callback can be DRAINED — which is the
 * only way to read the `NinaBackgroundTurnInput` this phase rebuilds, since
 * `startNinaBackgroundTurn` closes over it. `runNinaTurn` answers `payload: null`, the honest
 * "she could not answer" outcome, so the drain writes no rows of hers and property 1 stays
 * assertable end to end. */
const loadNinaContext = vi.fn()
const runNinaTurn = vi.fn()

vi.mock('@/lib/nina/load', () => ({ loadNinaContext: (...a: unknown[]) => loadNinaContext(...a) }))
vi.mock('@/lib/nina/gateway', () => ({
  dbNinaSourceGateway: {},
  dbNinaToolGateway: { loadRunHistory: () => Promise.resolve([]) },
}))
vi.mock('@/lib/nina/turn', () => ({
  /* The chain's wall-clock guard reads `.overall`; the real literal, so the arithmetic is real. */
  NINA_TURN_BUDGET: { overall: 45_000 },
  productionDeps: () => ({}),
  runNinaTurn: (...a: unknown[]) => runNinaTurn(...a),
}))
vi.mock('@/lib/nina/distill', () => ({ runTurnDistillation: vi.fn() }))
vi.mock('@/lib/nina/autotitle', () => ({ titleNinaSessionIfNeeded: vi.fn() }))

/* ── the fixture ───────────────────────────────────────────────────────────────────────────── */

const USER = 'u1'
/** 12 chars, so `isValidId` passes. */
const HIS = 'msgrunner001'
const HERS = 'msgnina00001'
const QUOTED = 'msgquoted001'
const SESSION = 'ses000000001'
const TURN = 'turn00000001'
const RUN = 'run000000001'

/** The one row the owner-scoped read comes back with. `messageColumns`'s shape. */
function runnerRow(over: Partial<Record<string, unknown>> = {}) {
  return {
    id: HIS,
    seq: 40,
    sessionId: SESSION,
    role: 'runner' as const,
    body: 'lari gw kemaren gimana menurut lo?',
    createdAt: new Date('2026-09-06T00:14:00.000Z'),
    source: 'chat' as const,
    turnId: null,
    replyToId: null,
    runId: null,
    readAt: null,
    photoOnly: false,
    ...over,
  }
}

type Actions = typeof import('@/lib/nina/actions')
let actions: Actions

beforeEach(async () => {
  deferred.length = 0
  vi.clearAllMocks()

  requireUserId.mockResolvedValue(USER)
  getNinaMessagesByIds.mockResolvedValue([runnerRow()])
  getNinaMessageImagesForMessages.mockResolvedValue([])
  /* The newest row in the session — where the poll must resume from. Above his 40. */
  listNinaMessages.mockResolvedValue([runnerRow({ id: HERS, seq: 57, role: 'nina' })])
  openNinaChatTurn.mockResolvedValue(TURN)
  sweepStaleNinaChatTurns.mockResolvedValue(undefined)
  closeNinaChatTurn.mockResolvedValue(undefined)
  ninaSessionExists.mockResolvedValue(true)
  readNinaTuning.mockResolvedValue({ relationship: 'friend' })
  loadNinaContext.mockResolvedValue({ conversation: { window: [] } })
  /* `firedShortcutIds` is REQUIRED on `NinaTurnResult` and the action reads its length before it
   * checks anything else, so the fake has to carry it. `[]` is the honest value here: the fake
   * `loadNinaContext` returns an empty window and no shortcut row exists. */
  runNinaTurn.mockResolvedValue({ source: 'unavailable', payload: null, firedShortcutIds: [] })

  actions = await import('@/lib/nina/actions')
})

/* ── refusals ──────────────────────────────────────────────────────────────────────────────── */

describe('resendNinaMessage authenticates first and refuses before it claims', () => {
  it('calls requireUserId above the shape check', async () => {
    const result = await actions.resendNinaMessage({ messageId: 'not-an-id' })

    expect(requireUserId).toHaveBeenCalledOnce()
    expect(result).toEqual({ ok: false, turnId: null, cursor: null, reason: 'not-found' })
    /* A malformed id costs no query, opens no claim and defers no turn. */
    expect(getNinaMessagesByIds).not.toHaveBeenCalled()
    expect(openNinaChatTurn).not.toHaveBeenCalled()
    expect(deferred).toHaveLength(0)
  })

  it('answers a message that is not his exactly as it answers one that never existed', async () => {
    /* `getNinaMessagesByIds`'s WHERE carries `userId`, so a foreign id comes back empty — and it
     * must come back with the SAME word an unknown id gets, or the refusal tells a caller which
     * ids are real. */
    getNinaMessagesByIds.mockResolvedValue([])

    const result = await actions.resendNinaMessage({ messageId: HIS })

    expect(result.reason).toBe('not-found')
    expect(openNinaChatTurn).not.toHaveBeenCalled()
  })

  it('refuses one of HER rows, even though no button would have offered one', async () => {
    getNinaMessagesByIds.mockResolvedValue([runnerRow({ id: HERS, role: 'nina' })])

    const result = await actions.resendNinaMessage({ messageId: HERS })

    expect(result.reason).toBe('not-mine')
    expect(openNinaChatTurn).not.toHaveBeenCalled()
    expect(deferred).toHaveLength(0)
  })

  it('refuses a row an operator emptied: no text, no photo, no run', async () => {
    /* Reachable without any client bug — `removeChatPhotoAction` deletes only the image row for a
     * runner message, since `isNinaPhotoCarrierMessage` is false for every role but Nina's. */
    getNinaMessagesByIds.mockResolvedValue([runnerRow({ body: '   ' })])
    getNinaMessageImagesForMessages.mockResolvedValue([])

    const result = await actions.resendNinaMessage({ messageId: HIS })

    expect(result.reason).toBe('empty')
    expect(openNinaChatTurn).not.toHaveBeenCalled()
  })

  it('resends an image-only message, because an image alone is a valid send', async () => {
    getNinaMessagesByIds.mockResolvedValue([runnerRow({ body: '' })])
    getNinaMessageImagesForMessages.mockResolvedValue([
      { id: 'img000000001', description: 'a man in a blue singlet, mid-stride', sortOrder: 0 },
    ])

    const result = await actions.resendNinaMessage({ messageId: HIS })

    expect(result.ok).toBe(true)
    expect(deferred).toHaveLength(1)
  })

  it('reports a live turn as its own outcome instead of opening a second claim', async () => {
    /* THE ONE PLACE A RESEND AND A SEND PART COMPANY. On the send path a null is the ordinary burst
     * case; here it is the only thing that happened, and the runner has to be told. */
    openNinaChatTurn.mockResolvedValue(null)

    const result = await actions.resendNinaMessage({ messageId: HIS })

    expect(result).toEqual({ ok: false, turnId: null, cursor: null, reason: 'turn-live' })
    expect(deferred).toHaveLength(0)
    expect(insertNinaMessages).not.toHaveBeenCalled()
  })

  it('reports a claim that could not be opened as failed, and writes nothing', async () => {
    openNinaChatTurn.mockRejectedValue(new Error('neon: connection reset'))

    const result = await actions.resendNinaMessage({ messageId: HIS })

    expect(result.reason).toBe('failed')
    expect(deferred).toHaveLength(0)
    expect(insertNinaMessages).not.toHaveBeenCalled()
  })
})

/* ── the claim, the cursor, and invariant 7 ───────────────────────────────────────────────── */

describe('an accepted resend claims a turn for the row that is already there', () => {
  it('never writes a message row or an image row', async () => {
    await actions.resendNinaMessage({ messageId: HIS })

    /* Asserted BEFORE the deferred turn is drained, and deliberately: her bubbles are the
     * background turn's legitimate write, and invariant 7 is about THIS action's body. */
    expect(insertNinaMessages).not.toHaveBeenCalled()
    expect(insertNinaMessageImages).not.toHaveBeenCalled()
  })

  it('sweeps, then opens ONE claim against the same runner_message_id at depth 0', async () => {
    await actions.resendNinaMessage({ messageId: HIS })

    expect(sweepStaleNinaChatTurns).toHaveBeenCalledWith(USER)
    expect(openNinaChatTurn).toHaveBeenCalledOnce()
    expect(openNinaChatTurn).toHaveBeenCalledWith(USER, {
      sessionId: SESSION,
      runnerMessageId: HIS,
      depth: 0,
    })
  })

  it('claims the turn even when the sweep throws', async () => {
    /* A sweep that could not run must never cost him the resend: `openNinaChatTurn` applies
     * `NINA_TURN_STALE_MS` itself, so an expired claim does not block a new one. */
    sweepStaleNinaChatTurns.mockRejectedValue(new Error('neon: statement timeout'))

    const result = await actions.resendNinaMessage({ messageId: HIS })

    expect(result.ok).toBe(true)
    expect(openNinaChatTurn).toHaveBeenCalledOnce()
  })

  it('returns the NEWEST seq as the cursor, never the resent row’s own', async () => {
    /* `pollNinaReply` polls `seq > afterSeq` and returns HER rows from that set. His row is 40 and
     * the newest row is 57, so a cursor of 40 would re-deliver — and re-reveal — every bubble of
     * hers between them. */
    const result = await actions.resendNinaMessage({ messageId: HIS })

    expect(result.cursor).toBe(57)
    expect(result.cursor).not.toBe(40)
    expect(listNinaMessages).toHaveBeenCalledWith(USER, { limit: 1, sessionId: SESSION })
  })

  it('falls back to the row’s own seq when the cursor read fails, rather than refusing', async () => {
    listNinaMessages.mockRejectedValue(new Error('neon: connection reset'))

    const result = await actions.resendNinaMessage({ messageId: HIS })

    /* The turn is already claimed and about to run; losing it over a cursor read would be worse.
     * `ChatScreen` takes the value as a `Math.max`, so a stale one cannot lower its position. */
    expect(result).toEqual({ ok: true, turnId: TURN, cursor: 40, reason: null })
    expect(deferred).toHaveLength(1)
  })

  it('defers exactly one background turn', async () => {
    await actions.resendNinaMessage({ messageId: HIS })
    expect(deferred).toHaveLength(1)
  })
})

/* ── the rebuilt turn input ───────────────────────────────────────────────────────────────── */

describe('the background turn is rebuilt from the persisted row', () => {
  it('carries his own text, his photos’ descriptions, his quote and his run', async () => {
    getNinaMessagesByIds
      /* the resend target */
      .mockResolvedValueOnce([runnerRow({ replyToId: QUOTED, runId: RUN })])
      /* the quote target, resolved second */
      .mockResolvedValueOnce([runnerRow({ id: QUOTED, seq: 12, role: 'nina', body: 'gimana?' })])
    getNinaMessageImagesForMessages.mockResolvedValue([
      { id: 'img000000001', description: 'a man in a blue singlet, mid-stride', sortOrder: 0 },
      /* An undescribed row: the vision pass failed, or has not run. */
      { id: 'img000000002', description: null, sortOrder: 1 },
    ])

    const result = await actions.resendNinaMessage({ messageId: HIS })
    expect(result.ok).toBe(true)
    expect(deferred).toHaveLength(1)

    /* Draining the deferred callback is the only way to read the input
     * `startNinaBackgroundTurn` closed over. */
    await deferred[0]!()

    expect(runNinaTurn).toHaveBeenCalledOnce()
    const [turnInput] = runNinaTurn.mock.calls[0]! as [Record<string, unknown>]

    expect(turnInput.sourceMessageId).toBe(HIS)
    expect(turnInput.runnerText).toBe('lari gw kemaren gimana menurut lo?')
    expect(turnInput.attachedRunId).toBe(RUN)
    /* The quote reached her, resolved from `reply_to_id` against an owner-scoped read. */
    expect((turnInput.quoted as { id: string } | null)?.id).toBe(QUOTED)

    /*
     * THE SUBSTITUTION, and why this array is not `[]`. `runNinaBackgroundTurn`'s chain passes `[]`
     * on the argument that photographs reach her through `loadNinaContext` — but
     * `lib/nina/gateway.ts:164` hardcodes `imageDescriptions: []` for every window row, so on a
     * resend `[]` would mean she is never told the photo exists. An undescribed row becomes the
     * honest sentence rather than silence.
     */
    const descriptions = turnInput.imageDescriptions as readonly string[]
    expect(descriptions).toHaveLength(2)
    expect(descriptions[0]).toBe('a man in a blue singlet, mid-stride')
    expect(descriptions[1]).toContain('could not see it')

    /* Still nothing of HIS was written — the drain only reaches her side, and she said nothing. */
    expect(insertNinaMessages).not.toHaveBeenCalled()
  })

  it('passes runnerText as null for a photo-only message, not as an empty string', async () => {
    getNinaMessagesByIds.mockResolvedValue([runnerRow({ body: '' })])
    getNinaMessageImagesForMessages.mockResolvedValue([
      { id: 'img000000001', description: 'her, on the mat', sortOrder: 0 },
    ])

    await actions.resendNinaMessage({ messageId: HIS })
    await deferred[0]!()

    const [turnInput] = runNinaTurn.mock.calls[0]! as [Record<string, unknown>]
    /* `''` would read as a message he sent with no words; `null` is what the send path passes for
     * a message that IS a photograph. */
    expect(turnInput.runnerText).toBeNull()
  })

  it('closes the claim when she answers with nothing, so the poll stops', async () => {
    await actions.resendNinaMessage({ messageId: HIS })
    await deferred[0]!()

    expect(closeNinaChatTurn).toHaveBeenCalled()
  })
})
