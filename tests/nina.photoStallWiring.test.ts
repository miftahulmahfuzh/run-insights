import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Task #76, where the two halves meet `runNinaBackgroundTurn`.
 *
 * `tests/nina.photostall.test.ts` owns the loop and `tests/nina.imagestall.test.ts` owns the rule;
 * what is left is the WIRING, and all three of its properties are orderings rather than values —
 * which is exactly the class a unit test on either of the other two modules cannot reach:
 *
 *   1. **the claim is held open while a camera is running, and closed after the stall.** This is
 *      the entire delivery mechanism: `pollNinaReply`'s first `awaiting` disjunct is "a fresh chat
 *      claim exists for this session", so a close one statement too early makes every filler
 *      bubble land unobserved until a page load. Nothing about the filler itself would fail.
 *   2. **an ordinary turn is untouched.** No image job means no extra read, the same single close
 *      in the same place, and no stall.
 *   3. **the photograph is re-pointed at her LAST bubble (R2)**, not the first and not the
 *      runner's message, and only while the job is open.
 *
 * The edges are mocked on `tests/nina.resend.test.ts`'s arrangement, which exists one file over
 * for the same reason: the module under test is the real one, and only what it reaches out to is
 * replaced.
 */

const openNinaImageJobForMessage = vi.fn()
const setNinaImageJobReplyTo = vi.fn()
const runNinaPhotoStall = vi.fn()
const closeNinaChatTurn = vi.fn()
const insertNinaMessages = vi.fn()
const loadNinaContext = vi.fn()
const runNinaTurn = vi.fn()
const notify = vi.fn()

vi.mock('@/lib/nina/imagejobs', () => ({
  openNinaImageJobForMessage: (...a: unknown[]) => openNinaImageJobForMessage(...a),
  setNinaImageJobReplyTo: (...a: unknown[]) => setNinaImageJobReplyTo(...a),
}))
vi.mock('@/lib/nina/photostall', () => ({
  runNinaPhotoStall: (...a: unknown[]) => runNinaPhotoStall(...a),
}))
vi.mock('@/lib/nina/chatturn', () => ({
  chatTurnWasSuperseded: vi.fn(async () => false),
  closeNinaChatTurn: (...a: unknown[]) => closeNinaChatTurn(...a),
  getPendingNinaChatTurn: vi.fn(),
  ninaChatTurnStore: () => ({ record: vi.fn() }),
  ninaSessionExists: vi.fn(async () => true),
  openNinaChatTurn: vi.fn(async () => null),
  supersedeNinaChatTurn: vi.fn(),
  sweepStaleNinaChatTurns: vi.fn(),
}))
vi.mock('@/lib/nina/queries', () => ({
  bumpNinaShortcutUses: vi.fn(),
  getNinaMessageImagesForMessages: vi.fn(async () => []),
  insertNinaMessages: (...a: unknown[]) => insertNinaMessages(...a),
  listNinaMessages: vi.fn(async () => []),
  listNinaShortcuts: vi.fn(async () => []),
  readNinaTuning: vi.fn(async () => ({ relationship: 'friend' })),
}))
vi.mock('@/lib/nina/load', () => ({ loadNinaContext: (...a: unknown[]) => loadNinaContext(...a) }))
vi.mock('@/lib/nina/gateway', () => ({
  dbNinaSourceGateway: {},
  dbNinaToolGateway: { loadRunHistory: () => Promise.resolve({ runs: [] }) },
}))
vi.mock('@/lib/nina/turn', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/nina/turn')>()
  return {
    ...actual,
    productionDeps: () => ({}),
    runNinaTurn: (...a: unknown[]) => runNinaTurn(...a),
  }
})
vi.mock('@/lib/nina/distill', () => ({ runTurnDistillation: vi.fn() }))
vi.mock('@/lib/nina/autotitle', () => ({ titleNinaSessionIfNeeded: vi.fn() }))
vi.mock('@/lib/nina/reminderstore', () => ({ applyNinaReminderWrites: vi.fn() }))
vi.mock('@/lib/nina/avatartools', () => ({ NINA_FULL_TOOL_SET: { tools: [], handlers: {} } }))

const USER = 'u1'
const SESSION = 'ses000000001'
const TURN = 'turn00000001'
const HIS = 'msgrunner001'

let runNinaBackgroundTurn: (typeof import('@/lib/nina/turnrun'))['runNinaBackgroundTurn']

const turn = () => ({
  userId: USER,
  sessionId: SESSION,
  turnId: TURN,
  runnerMessageId: HIS,
  runnerText: 'ini foto dmn',
  imageDescriptions: [],
  quotedRow: null,
  attachedRunId: null,
  depth: 0,
  startedAtMs: Date.now(),
})

beforeEach(async () => {
  vi.resetAllMocks()
  loadNinaContext.mockResolvedValue({ conversation: { window: [] } })
  runNinaTurn.mockResolvedValue({
    source: 'model',
    firedShortcutIds: [],
    payload: {
      bubbles: ['itu dp gw doang mif, santay', 'nih sebentar, gw foto kondisi sekarang deh'],
      replyToMessageId: null,
    },
  })
  insertNinaMessages.mockImplementation(async (_u: unknown, rows: Array<{ body: string }>) =>
    rows.map((row, i) => ({ id: `hers-${i}`, body: row.body, replyToId: null })),
  )
  openNinaImageJobForMessage.mockResolvedValue(null)
  runNinaPhotoStall.mockResolvedValue(1)
  ;({ runNinaBackgroundTurn } = await import('@/lib/nina/turnrun'))
})

describe('an ordinary turn — no camera', () => {
  it('closes its claim once, as it always did, and runs no stall', async () => {
    await runNinaBackgroundTurn(turn(), { notify })

    expect(runNinaPhotoStall).not.toHaveBeenCalled()
    expect(setNinaImageJobReplyTo).not.toHaveBeenCalled()
    expect(closeNinaChatTurn).toHaveBeenCalledTimes(1)
    /* The success close: three arguments, no failure reason. */
    expect(closeNinaChatTurn).toHaveBeenCalledWith(USER, TURN, 'model')
  })

  it('still asks whether a camera fired, because only the answer is cheap to be wrong about', async () => {
    await runNinaBackgroundTurn(turn(), { notify })
    expect(openNinaImageJobForMessage).toHaveBeenCalledWith(USER, HIS)
  })
})

describe('a turn that reached for the camera', () => {
  beforeEach(() => {
    openNinaImageJobForMessage.mockResolvedValue({ id: 'job1' })
  })

  /*
   * R2. Her promise is the LAST bubble — the first is whatever she was saying before she reached
   * for the camera, and `ctx.sourceMessageId` (the runner's "ini foto dmn") is what the job was
   * opened with and what production was measured quoting.
   */
  it('re-points the photograph at her promise, not at the ask and not at her first bubble', async () => {
    await runNinaBackgroundTurn(turn(), { notify })

    expect(setNinaImageJobReplyTo).toHaveBeenCalledTimes(1)
    expect(setNinaImageJobReplyTo).toHaveBeenCalledWith(USER, 'job1', 'hers-1')
  })

  /*
   * PROPERTY 1, and the whole delivery mechanism. The close must come after the stall; a close
   * before it ends the poll and every filler lands unobserved. Asserted as an ORDER, because both
   * calls happen either way.
   */
  it('holds the claim open across the stall and closes it afterwards', async () => {
    const order: string[] = []
    runNinaPhotoStall.mockImplementation(async () => {
      order.push('stall')
      return 1
    })
    closeNinaChatTurn.mockImplementation(async () => {
      order.push('close')
    })

    await runNinaBackgroundTurn(turn(), { notify })

    expect(order).toEqual(['stall', 'close'])
    expect(closeNinaChatTurn).toHaveBeenCalledTimes(1)
  })

  /*
   * The push is NOT moved with the close. Its own note argues it must not wait, and during a
   * stall the typing indicator it would wake him to is TRUE rather than a lie.
   */
  it('still pushes her reply before the stall, not after it', async () => {
    const order: string[] = []
    notify.mockImplementation(async () => {
      order.push('push')
    })
    runNinaPhotoStall.mockImplementation(async () => {
      order.push('stall')
      return 1
    })

    await runNinaBackgroundTurn(turn(), { notify })
    expect(order).toEqual(['push', 'stall'])
  })

  it('hands the stall the dispatching turn, the job and the send clock', async () => {
    const input = turn()
    await runNinaBackgroundTurn(input, { notify })

    expect(runNinaPhotoStall).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: USER,
        sessionId: SESSION,
        turnId: TURN,
        jobId: 'job1',
        startedAtMs: input.startedAtMs,
      }),
    )
  })

  /* Neither half may cost a turn whose answer is already committed and pushed. */
  it('still closes the claim when the re-point throws', async () => {
    setNinaImageJobReplyTo.mockRejectedValue(new Error('neon is down'))

    await runNinaBackgroundTurn(turn(), { notify })

    expect(runNinaPhotoStall).toHaveBeenCalledTimes(1)
    expect(closeNinaChatTurn).toHaveBeenCalledWith(USER, TURN, 'model')
  })

  it('degrades to an ordinary turn when the job read throws', async () => {
    openNinaImageJobForMessage.mockRejectedValue(new Error('neon is down'))

    await runNinaBackgroundTurn(turn(), { notify })

    expect(runNinaPhotoStall).not.toHaveBeenCalled()
    expect(closeNinaChatTurn).toHaveBeenCalledTimes(1)
  })

  /* A turn that produced no bubbles produced no promise, so the job keeps the quote it was opened
   * with — the runner's message — rather than being pointed at nothing. */
  it('leaves the quote alone when she said nothing', async () => {
    insertNinaMessages.mockResolvedValue([])

    await runNinaBackgroundTurn(turn(), { notify })
    expect(setNinaImageJobReplyTo).not.toHaveBeenCalled()
  })
})
