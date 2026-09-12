import { beforeEach, describe, expect, it, vi } from 'vitest'

import { signNinaImageTicket } from '@/lib/nina/imageTicket'
import { NINA_DESCRIPTION_UNAVAILABLE } from '@/lib/nina/prompts/describe'

/**
 * **R3's send half: what is attached to THIS message reaches the turn's `imageDescriptions`.**
 *
 * `sendNinaMessage` assembles the field from two sources (`lib/nina/actions.ts:958-968`): the
 * verified ticket claims (his composer uploads, whose descriptions the composer's `glm-4.6v`
 * pre-pass earned) and the resolved attachments (a `?photo=` pointer's row, or a deduplicated
 * tile's keeper — both carrying COPIED descriptions). No test pinned either half, which is the
 * gap the analysis names; this suite pins both, through the shipping action with only the edges
 * mocked.
 *
 * ── WHAT IS MOCKED, AND WHY IT IS ONLY THE EDGES ──────────────────────────────────────────────
 * `next/server` (capturing), `@/lib/auth/requireUserId`, `@/lib/nina/queries` (a FULL factory —
 * `tests/nina.resend.test.ts`'s arrangement and its reason: a factory replaces the whole module,
 * so a missing name fails at import time rather than as an undefined at call time),
 * `@/lib/nina/chatturn`, and the background turn's own edges (`@/lib/nina/load`, `@/lib/nina/gateway`,
 * `@/lib/nina/turn` minus `NINA_BURST_MAX_MESSAGES` and the assembly itself, `@/lib/nina/distill`,
 * `@/lib/nina/autotitle`). `lib/nina/actions.ts` is the real module — that is the point.
 *
 * Draining the captured `after()` callback is the only way to read the input
 * `startNinaBackgroundTurn` closed over; `runNinaTurn` answers `payload: null`, the honest
 * "she could not answer" outcome, so the drain writes no rows of hers.
 */

const { afterTasks, runNinaTurn, loadNinaContext } = vi.hoisted(() => ({
  afterTasks: [] as Array<() => unknown>,
  runNinaTurn: vi.fn(),
  loadNinaContext: vi.fn(),
}))

vi.mock('next/server', () => ({
  after: (task: () => unknown) => {
    afterTasks.push(task)
  },
}))

const requireUserId = vi.fn<() => Promise<string>>()
const getNinaAvatar = vi.fn()
const getNinaMessageImage = vi.fn()
const getNinaMessageImagesForMessages = vi.fn()
const getNinaMessagesByIds = vi.fn()
const getNinaSession = vi.fn()
const insertNinaMessages = vi.fn()
const insertNinaMessageImages = vi.fn()
const adoptNinaMessageImage = vi.fn()
const findNinaImageByContentHash = vi.fn()
const listNinaMessages = vi.fn()
const readNinaTuning = vi.fn()

vi.mock('@/lib/auth/requireUserId', () => ({ requireUserId: () => requireUserId() }))

vi.mock('@/lib/nina/queries', () => ({
  adoptNinaMessageImage: (...a: unknown[]) => adoptNinaMessageImage(...a),
  bumpNinaShortcutUses: vi.fn(),
  findNinaImageByContentHash: (...a: unknown[]) => findNinaImageByContentHash(...a),
  getNinaAvatar: (...a: unknown[]) => getNinaAvatar(...a),
  getNinaMessageImage: (...a: unknown[]) => getNinaMessageImage(...a),
  getNinaMessageImagesForMessages: (...a: unknown[]) => getNinaMessageImagesForMessages(...a),
  getNinaMessagesByIds: (...a: unknown[]) => getNinaMessagesByIds(...a),
  getNinaSession: (...a: unknown[]) => getNinaSession(...a),
  insertNinaMessageImages: (...a: unknown[]) => insertNinaMessageImages(...a),
  insertNinaMessages: (...a: unknown[]) => insertNinaMessages(...a),
  listNinaMessages: (...a: unknown[]) => listNinaMessages(...a),
  listNinaMessagesAfter: vi.fn(),
  listNinaShortcuts: vi.fn(async () => []),
  readNinaTuning: (...a: unknown[]) => readNinaTuning(...a),
  ensureNinaSession: vi.fn(),
}))

vi.mock('@/lib/nina/chatturn', () => ({
  chatTurnWasSuperseded: vi.fn(async () => false),
  closeNinaChatTurn: vi.fn(async () => undefined),
  getPendingNinaChatTurn: vi.fn(),
  ninaChatTurnStore: () => ({ record: vi.fn() }),
  ninaSessionExists: vi.fn(async () => true),
  openNinaChatTurn: vi.fn(async () => 'turn00000001'),
  supersedeNinaChatTurn: vi.fn(async () => false),
  sweepStaleNinaChatTurns: vi.fn(async () => 0),
}))

vi.mock('@/lib/nina/load', () => ({ loadNinaContext: (...a: unknown[]) => loadNinaContext(...a) }))
vi.mock('@/lib/nina/gateway', () => ({
  dbNinaSourceGateway: {},
  dbNinaToolGateway: { loadRunHistory: () => Promise.resolve([]) },
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

/* `authEnv()` parses eagerly on first call — the ticket verifier reads AUTH_SECRET through it,
 * the same three the re-attach and dedupe suites seed. */
process.env.AUTH_SECRET ??= 'unit-secret'
process.env.AUTH_GOOGLE_ID ??= 'unit-id'
process.env.AUTH_GOOGLE_SECRET ??= 'unit-secret'

const USER = 'u1'
const SESSION_ID = 'sesAAAAAAAAA'
const RUNNER_MESSAGE_ID = 'msgRUNNER001'
const AVATAR_ID = 'avaAAAAAAAAA'
/* Must be the SAME value `authEnv().AUTH_SECRET` resolves to when `sendNinaMessage` verifies the
 * ticket — reading it back off `process.env` (rather than repeating the 'unit-secret' literal)
 * keeps signing and verifying in sync even when CI's job-level env already set AUTH_SECRET to
 * something else before this file's `??=` above ran (making the seed a no-op). */
const TICKET_SECRET = process.env.AUTH_SECRET!

/**
 * A ticket for one composer upload. The pathname shape is `isNinaChatRequestPathname`'s
 * (`nina/<user>/chat/<nanoid>-<nanoid>.jpg`); the prefix is parameterised because two tickets
 * naming the SAME pathname are one photograph to the send path — `sendNinaMessage` dedupes ticket
 * claims by pathname, by design — so a test wanting two photographs gives each its own nonce.
 */
function ticketFor(description: string | null, nonce = 'zzzzzzzzzzzz'): string {
  const pathname = `nina/u1/chat/${nonce}-yyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyy.jpg`
  return signNinaImageTicket(
    {
      userId: USER,
      pathname,
      blobUrl: `https://blob.example/${pathname}`,
      width: 768,
      height: 1024,
      bytes: 150_000,
      description,
    },
    TICKET_SECRET,
  )
}

type Actions = typeof import('@/lib/nina/actions')
let actions: Actions

beforeEach(async () => {
  afterTasks.length = 0
  vi.clearAllMocks()

  requireUserId.mockResolvedValue(USER)
  getNinaSession.mockResolvedValue({
    id: SESSION_ID,
    title: null,
    titleSource: null,
    pinnedAt: null,
    createdAt: new Date('2026-09-01T09:00:00Z'),
  })
  insertNinaMessages.mockResolvedValue([{ id: RUNNER_MESSAGE_ID, seq: 41 }])
  insertNinaMessageImages.mockResolvedValue([])
  adoptNinaMessageImage.mockResolvedValue(null)
  listNinaMessages.mockResolvedValue([])
  getNinaMessagesByIds.mockResolvedValue([])
  readNinaTuning.mockResolvedValue({ relationship: 'friend' })
  loadNinaContext.mockResolvedValue({ conversation: { window: [] } })
  /* `firedShortcutIds` is REQUIRED on `NinaTurnResult` — the resend suite's fake carries it and
   * so does this one. */
  runNinaTurn.mockResolvedValue({ source: 'unavailable', payload: null, firedShortcutIds: [] })

  actions = await import('@/lib/nina/actions')
})

/** Drain the one deferred background turn and return the input its model call received. */
async function drainedTurnInput(): Promise<Record<string, unknown>> {
  expect(afterTasks).toHaveLength(1)
  await afterTasks[0]!()
  expect(runNinaTurn).toHaveBeenCalledOnce()
  const [turnInput] = runNinaTurn.mock.calls[0]! as [Record<string, unknown>]
  return turnInput
}

describe('the send path carries attached photographs into the turn input (R3)', () => {
  it('carries an ATTACHED described photo’s own description — the album share', async () => {
    // `resolveAttachment` copies the row's `description` onto the reference row it writes; the
    // assembly then copies it into the turn input. Both halves must work or the share is blind.
    getNinaAvatar.mockResolvedValue({
      id: AVATAR_ID,
      blobUrl: 'https://blob.example/nina/u1/avatar-avaAAAAAAAAA.jpg',
      pathname: 'nina/u1/avatar-avaAAAAAAAAA.jpg',
      description: 'her, on a bridge at dusk',
    })

    const result = await actions.sendNinaMessage({
      body: 'lihat ini',
      sessionId: SESSION_ID,
      attachExisting: { kind: 'avatar', id: AVATAR_ID },
    })

    expect(result.ok).toBe(true)

    const turnInput = await drainedTurnInput()
    expect(turnInput.imageDescriptions).toEqual(['her, on a bridge at dusk'])
  })

  it('carries ticket descriptions, with the unavailable sentence for the undescribed one', async () => {
    // Two composer uploads: one the pre-pass described, one whose describe failed or has not run.
    // The substitution is the send path's honest answer for THIS message — she is told she could
    // not see it, rather than left to invent what was in it.
    const result = await actions.sendNinaMessage({
      body: 'dua foto',
      sessionId: SESSION_ID,
      imageTickets: [
        ticketFor('a plate of nasi goreng, half eaten'),
        ticketFor(null, 'aaaaaaaaaaaa'),
      ],
    })

    expect(result.ok).toBe(true)

    const turnInput = await drainedTurnInput()
    expect(turnInput.imageDescriptions).toEqual([
      'a plate of nasi goreng, half eaten',
      NINA_DESCRIPTION_UNAVAILABLE,
    ])
  })

  it('carries both sources together — tickets first, then the attached photo', async () => {
    getNinaAvatar.mockResolvedValue({
      id: AVATAR_ID,
      blobUrl: 'https://blob.example/nina/u1/avatar-avaAAAAAAAAA.jpg',
      pathname: 'nina/u1/avatar-avaAAAAAAAAA.jpg',
      description: 'her, on a bridge at dusk',
    })

    await actions.sendNinaMessage({
      body: '',
      sessionId: SESSION_ID,
      imageTickets: [ticketFor('a plate of nasi goreng, half eaten')],
      attachExisting: { kind: 'avatar', id: AVATAR_ID },
    })

    const turnInput = await drainedTurnInput()
    expect(turnInput.imageDescriptions).toEqual([
      'a plate of nasi goreng, half eaten',
      'her, on a bridge at dusk',
    ])
  })
})
