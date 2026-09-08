import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * **R4 as the send path actually behaves.**
 *
 * Four outcomes, and the pointer is the only thing that differs between them:
 *
 *   1. an `avatar` pointer — the album's "Kirim ke chat" — adds a REFERENCE row carrying
 *      `sourceAvatarId`, so F34 R2 keeps working and her album photograph does not become a Chat
 *      photos member (F37's R3);
 *   2. an `image` pointer at an ORPHANED row of his ADOPTS that row and inserts nothing, so the
 *      photograph comes back into a conversation as the same row (R4) rather than as a second row
 *      pointing at a parent that will never have a bubble;
 *   3. an `image` pointer at a row that STILL HAS a message leaves that bubble alone and adds a
 *      reference row (plan Decisions, row 5);
 *   4. the race — the row was an orphan at the read and had a message by the UPDATE — falls back to
 *      the reference row, because `message_id IS NULL` is in the statement's own WHERE.
 *
 * ── WHAT IS MOCKED, AND WHY IT IS ONLY THE EDGES ──────────────────────────────────────────────
 * `@/lib/auth/requireUserId`, `next/server`, and — SPREAD OVER THE REAL MODULE —
 * `@/lib/nina/queries` and `@/lib/nina/chatturn`. Everything in between is the shipping
 * `sendNinaMessage`: the refusal rule, the write order, `resolveAttachment`, and the adopt-or-
 * reference block. The spread matters: a dozen modules in this import graph name exports of
 * `./queries`, and a factory that returned only the six functions this suite drives would fail at
 * import time on the first one it left out.
 *
 * `openNinaChatTurn` is stubbed to `null` — the ORDINARY burst outcome — so the background turn
 * never starts and this suite never reaches a model, a context load or an `after()` callback.
 */

const spies = vi.hoisted(() => ({
  getNinaAvatar: vi.fn(),
  getNinaMessageImage: vi.fn(),
  getNinaSession: vi.fn(),
  insertNinaMessages: vi.fn(),
  insertNinaMessageImages: vi.fn(),
  adoptNinaMessageImage: vi.fn(),
}))

vi.mock('@/lib/auth/requireUserId', () => ({ requireUserId: async () => 'u1' }))

vi.mock('next/server', () => ({ after: (task: () => unknown) => void task }))

vi.mock('@/lib/nina/queries', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/nina/queries')>()
  return { ...actual, ...spies }
})

vi.mock('@/lib/nina/chatturn', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/nina/chatturn')>()
  return {
    ...actual,
    sweepStaleNinaChatTurns: async () => 0,
    /* The burst case: a turn is already running for this conversation. His message is saved and
     * nothing else happens, which is exactly the surface this suite wants. */
    openNinaChatTurn: async () => null,
  }
})

/* `authEnv()` parses eagerly on first call and `sendNinaMessage` calls it before the ticket loop. */
process.env.AUTH_SECRET ??= 'unit-secret'
process.env.AUTH_GOOGLE_ID ??= 'unit-id'
process.env.AUTH_GOOGLE_SECRET ??= 'unit-secret'

const SESSION_ID = 'sesAAAAAAAAA'
const RUNNER_MESSAGE_ID = 'msgRUNNER001'

type Actions = typeof import('@/lib/nina/actions')

let actions: Actions

beforeEach(async () => {
  vi.resetModules()
  for (const spy of Object.values(spies)) spy.mockReset()

  spies.getNinaSession.mockResolvedValue({
    id: SESSION_ID,
    title: null,
    titleSource: null,
    pinnedAt: null,
    createdAt: new Date('2026-09-01T09:00:00Z'),
  })
  spies.insertNinaMessages.mockResolvedValue([{ id: RUNNER_MESSAGE_ID, seq: 41 }])
  spies.insertNinaMessageImages.mockResolvedValue([])
  spies.adoptNinaMessageImage.mockResolvedValue(null)

  actions = await import('@/lib/nina/actions')
})

afterEach(() => {
  vi.resetModules()
})

/** The single row handed to `insertNinaMessageImages`, asserting there was exactly one call. */
function insertedRow(): Record<string, unknown> {
  expect(spies.insertNinaMessageImages).toHaveBeenCalledTimes(1)
  const call = spies.insertNinaMessageImages.mock.calls[0]!
  expect(call[0]).toBe('u1')
  const rows = call[1] as Record<string, unknown>[]
  expect(rows).toHaveLength(1)
  return rows[0]!
}

/**
 * A `nina_message_images` row as `getNinaMessageImage` returns it. The ids are all exactly 12
 * symbols of `[0-9A-Za-z_-]`, because `sendNinaMessage` runs `isValidId` on `attachExisting.id` and
 * on `sessionId` before anything else — a 13-character fixture would refuse and every assertion
 * would pass for the wrong reason.
 */
function chatPhoto(overrides: Record<string, unknown>): Record<string, unknown> {
  return {
    id: 'imgORPHAN001',
    messageId: null,
    kind: 'generated',
    blobUrl: 'https://blob.example/nina/u1/selfie-1.jpg',
    pathname: 'nina/u1/selfie-1.jpg',
    description: 'she is holding a coffee',
    sourceAvatarId: null,
    sourceImageId: null,
    sortOrder: 0,
    width: 1024,
    height: 1536,
    bytes: 240_000,
    prompt: null,
    createdAt: new Date('2026-08-01T09:00:00Z'),
    ...overrides,
  }
}

async function send(attachExisting: { kind: 'avatar' | 'image'; id: string }) {
  return actions.sendNinaMessage({ body: 'lihat ini', sessionId: SESSION_ID, attachExisting })
}

describe('an album share adds no collection member', () => {
  beforeEach(() => {
    spies.getNinaAvatar.mockResolvedValue({
      id: 'avaAAAAAAAAA',
      blobUrl: 'https://blob.example/nina/u1/avatar-avaAAAAAAAAA.jpg',
      pathname: 'nina/u1/avatar-avaAAAAAAAAA.jpg',
      description: 'her, on a bridge at dusk',
    })
  })

  it('writes one reference row and adopts nothing', async () => {
    const result = await send({ kind: 'avatar', id: 'avaAAAAAAAAA' })

    expect(result.ok).toBe(true)
    expect(result.userMessageId).toBe(RUNNER_MESSAGE_ID)
    expect(spies.adoptNinaMessageImage).not.toHaveBeenCalled()
    expect(insertedRow()).toMatchObject({
      messageId: RUNNER_MESSAGE_ID,
      kind: 'generated',
      pathname: 'nina/u1/avatar-avaAAAAAAAAA.jpg',
      sourceAvatarId: 'avaAAAAAAAAA',
      sourceImageId: null,
      sortOrder: 0,
    })
  })

  it('keeps the bubble identical — same kind, same description (invariants 8 and 9)', async () => {
    await send({ kind: 'avatar', id: 'avaAAAAAAAAA' })
    expect(insertedRow()).toMatchObject({
      kind: 'generated',
      description: 'her, on a bridge at dusk',
    })
  })
})

describe('a re-attached ORPHAN is adopted, not copied (R4)', () => {
  beforeEach(() => {
    spies.getNinaMessageImage.mockResolvedValue(chatPhoto({ messageId: null }))
    spies.adoptNinaMessageImage.mockResolvedValue(
      chatPhoto({ messageId: RUNNER_MESSAGE_ID, sortOrder: 0 }),
    )
  })

  it('re-parents the row it already has and inserts nothing', async () => {
    const result = await send({ kind: 'image', id: 'imgORPHAN001' })

    expect(result.ok).toBe(true)
    expect(spies.adoptNinaMessageImage).toHaveBeenCalledTimes(1)
    expect(spies.adoptNinaMessageImage).toHaveBeenCalledWith('u1', 'imgORPHAN001', {
      messageId: RUNNER_MESSAGE_ID,
      sortOrder: 0,
    })
    expect(spies.insertNinaMessageImages).not.toHaveBeenCalled()
  })
})

describe('a re-attached LIVE photograph leaves its bubble alone (Decisions, row 5)', () => {
  beforeEach(() => {
    spies.getNinaMessageImage.mockResolvedValue(
      chatPhoto({
        id: 'imgLIVE00001',
        messageId: 'msgOLD000001',
        pathname: 'nina/u1/selfie-2.jpg',
        description: 'she is on the pier',
      }),
    )
  })

  it('never calls the adoption, and adds a reference row instead', async () => {
    const result = await send({ kind: 'image', id: 'imgLIVE00001' })

    expect(result.ok).toBe(true)
    expect(spies.adoptNinaMessageImage).not.toHaveBeenCalled()
    expect(insertedRow()).toMatchObject({
      messageId: RUNNER_MESSAGE_ID,
      pathname: 'nina/u1/selfie-2.jpg',
      sourceAvatarId: null,
      sourceImageId: 'imgLIVE00001',
    })
  })
})

describe('the race is not a special case', () => {
  beforeEach(() => {
    spies.getNinaMessageImage.mockResolvedValue(chatPhoto({ messageId: null, description: null }))
    /* The row gained a message between the read and the UPDATE, so `message_id IS NULL` matched
     * nothing. */
    spies.adoptNinaMessageImage.mockResolvedValue(null)
  })

  it('falls back to a reference row rather than losing the photograph', async () => {
    const result = await send({ kind: 'image', id: 'imgORPHAN001' })

    expect(result.ok).toBe(true)
    expect(spies.adoptNinaMessageImage).toHaveBeenCalledTimes(1)
    expect(insertedRow()).toMatchObject({
      messageId: RUNNER_MESSAGE_ID,
      sourceImageId: 'imgORPHAN001',
    })
  })
})

describe('a pointer that is not his is still a refusal, not a text-only send', () => {
  it('refuses the whole send when the image id resolves to nothing', async () => {
    spies.getNinaMessageImage.mockResolvedValue(null)
    const result = await send({ kind: 'image', id: 'imgNOTHIS001' })

    expect(result.ok).toBe(false)
    expect(spies.insertNinaMessages).not.toHaveBeenCalled()
    expect(spies.adoptNinaMessageImage).not.toHaveBeenCalled()
    expect(spies.insertNinaMessageImages).not.toHaveBeenCalled()
  })
})
