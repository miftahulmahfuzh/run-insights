import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { signNinaImageTicket } from '@/lib/nina/imageTicket'

/**
 * **Write-time dedup as the send path actually behaves** (media-dedupe P2).
 *
 *   1. a claim whose hash matches a stored ORIGINAL is written as a REFERENCE row (keeper's URL,
 *      flattened provenance, keeper's kind) and its just-landed blob is released — ROW FIRST,
 *      BLOB SECOND, proven by the fact that the release only runs when the captured `after` task
 *      is invoked after `sendNinaMessage` resolved;
 *   2. two same-send claims with one hash become one original and one reference to it;
 *   3. an INVALID hash writes NULL and the send proceeds — invariant 9;
 *   4. a failed keeper LOOKUP writes fresh rather than losing the rows;
 *   5. `dedupedImageIds` — the composer's pre-check seam — writes a reference row through the
 *      same `resolveAttachment` the pinned photo uses, and a photograph-only send made entirely
 *      of references is a valid send (RULING B1's fifth disjunct);
 *   6. `findNinaDuplicateChatImage` answers in the `NinaExistingPhoto` shape or null.
 *
 * WHAT IS MOCKED, AND WHY IT IS ONLY THE EDGES: `requireUserId`, `next/server` (capturing),
 * `@/lib/nina/queries` (spread over the real module — a dozen modules in this graph name exports
 * of it), and `@/lib/nina/blobRelease`. Everything between is the shipping action.
 */

const spies = vi.hoisted(() => ({
  getNinaAvatar: vi.fn(),
  getNinaMessageImage: vi.fn(),
  getNinaSession: vi.fn(),
  insertNinaMessages: vi.fn(),
  insertNinaMessageImages: vi.fn(),
  adoptNinaMessageImage: vi.fn(),
  findNinaImageByContentHash: vi.fn(),
  findNinaSignedOriginals: vi.fn(),
  fetchAndSignImage: vi.fn(),
  releaseBlobIfUnreferenced: vi.fn(),
}))

vi.mock('@/lib/auth/requireUserId', () => ({ requireUserId: async () => 'u1' }))

const afterTasks: Array<() => unknown> = []
vi.mock('next/server', () => ({
  after: (task: () => unknown) => {
    afterTasks.push(task)
  },
}))

vi.mock('@/lib/nina/queries', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/nina/queries')>()
  return { ...actual, ...spies }
})

vi.mock('@/lib/nina/blobRelease', () => ({
  releaseBlobIfUnreferenced: spies.releaseBlobIfUnreferenced,
}))

/* The one signer is sharp over real bytes — a dependency no unit suite pays for. The default
 * answer (null) is the production failure shape: unsigned claim, byte-key behavior untouched. */
vi.mock('@/lib/nina/perceptualSign', () => ({ fetchAndSignImage: spies.fetchAndSignImage }))

vi.mock('@/lib/nina/chatturn', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/nina/chatturn')>()
  return {
    ...actual,
    sweepStaleNinaChatTurns: async () => 0,
    openNinaChatTurn: async () => null,
  }
})

/* `authEnv()` parses eagerly on first call; the same three the re-attach suite seeds. */
process.env.AUTH_SECRET ??= 'unit-secret'
process.env.AUTH_GOOGLE_ID ??= 'unit-id'
process.env.AUTH_GOOGLE_SECRET ??= 'unit-secret'

const SESSION_ID = 'sesAAAAAAAAA'
const RUNNER_MESSAGE_ID = 'msgRUNNER001'
/** sha256("test") — a known-answer vector. */
const HASH = '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08'

/* Must be the SAME value `authEnv().AUTH_SECRET` resolves to when `sendNinaMessage` verifies the
 * ticket — reading it back off `process.env` (rather than repeating the 'unit-secret' literal)
 * keeps signing and verifying in sync even when CI's job-level env already set AUTH_SECRET to
 * something else before this file's `??=` above ran (making the seed a no-op). */
const TICKET_SECRET = process.env.AUTH_SECRET!

function ticketFor(pathname: string, blobUrl: string, description: string | null): string {
  return signNinaImageTicket(
    {
      userId: 'u1',
      pathname,
      blobUrl,
      width: 768,
      height: 1024,
      bytes: 150_000,
      description,
    },
    TICKET_SECRET,
  )
}

const CLAIM_A = {
  pathname: 'nina/u1/chat/aaaaaaaaaaaa-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb.jpg',
  blobUrl: 'https://blob.example/nina/u1/chat/aaaaaaaaaaaa-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb.jpg',
}
const CLAIM_B = {
  pathname: 'nina/u1/chat/cccccccccccc-dddddddddddddddddddddddddddddd.jpg',
  blobUrl: 'https://blob.example/nina/u1/chat/cccccccccccc-dddddddddddddddddddddddddddddd.jpg',
}

function insertedCalls(): Array<Record<string, unknown>[]> {
  return spies.insertNinaMessageImages.mock.calls.map(
    (call) => call[1] as Array<Record<string, unknown>>,
  )
}

type Actions = typeof import('@/lib/nina/actions')
let actions: Actions

beforeEach(async () => {
  vi.resetModules()
  afterTasks.length = 0
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
  spies.releaseBlobIfUnreferenced.mockResolvedValue('deleted')
  spies.findNinaImageByContentHash.mockResolvedValue(null)
  spies.findNinaSignedOriginals.mockResolvedValue([])
  spies.fetchAndSignImage.mockResolvedValue(null)

  actions = await import('@/lib/nina/actions')
})

afterEach(() => {
  vi.resetModules()
})

describe('STEP 1b race-close: a claim whose bytes already exist becomes a reference + a release', () => {
  beforeEach(() => {
    spies.findNinaImageByContentHash.mockResolvedValue({
      id: 'imgKEEPER001',
      kind: 'upload',
      blobUrl:
        'https://blob.example/nina/u1/chat/zzzzzzzzzzzz-yyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyy.jpg',
      pathname: 'nina/u1/chat/zzzzzzzzzzzz-yyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyy.jpg',
      description: 'the arrival card, already described',
      sourceAvatarId: null,
      sourceImageId: null,
      messageId: 'msgOLD000001',
      prompt: null,
      width: 768,
      height: 1024,
      bytes: 150_000,
      sortOrder: 0,
      createdAt: new Date('2026-09-09T09:00:00Z'),
    })
  })

  it('writes ONE reference row, releases the just-landed blob, and ROW precedes BLOB', async () => {
    const result = await actions.sendNinaMessage({
      body: 'ini lagi',
      imageTickets: [ticketFor(CLAIM_A.pathname, CLAIM_A.blobUrl, 'an arrival card')],
      contentHashes: { [CLAIM_A.pathname]: HASH },
      sessionId: SESSION_ID,
    })

    expect(result.ok).toBe(true)
    expect(spies.findNinaImageByContentHash).toHaveBeenCalledWith('u1', HASH)

    /* ROW FIRST: exactly one insert call, holding the reference row, no fresh row beside it. */
    expect(spies.insertNinaMessageImages).toHaveBeenCalledTimes(1)
    const [referenceRow] = insertedCalls()[0]!
    expect(referenceRow).toMatchObject({
      messageId: RUNNER_MESSAGE_ID,
      kind: 'upload',
      blobUrl:
        'https://blob.example/nina/u1/chat/zzzzzzzzzzzz-yyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyy.jpg',
      pathname: 'nina/u1/chat/zzzzzzzzzzzz-yyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyy.jpg',
      description: 'the arrival card, already described',
      sourceImageId: 'imgKEEPER001',
      sourceAvatarId: null,
      sortOrder: 0,
    })
    expect(referenceRow).not.toHaveProperty('contentHash')

    /* BLOB SECOND: nothing released yet — the release is registered under `after` and runs only
     * when the response is done. Invoking it now must ask about THIS claim's blob, not the
     * keeper's. */
    expect(spies.releaseBlobIfUnreferenced).not.toHaveBeenCalled()
    expect(afterTasks).toHaveLength(1)
    await afterTasks[0]!()
    expect(spies.releaseBlobIfUnreferenced).toHaveBeenCalledTimes(1)
    expect(spies.releaseBlobIfUnreferenced).toHaveBeenCalledWith('u1', {
      blobUrl: CLAIM_A.blobUrl,
      pathname: CLAIM_A.pathname,
    })
  })
})

describe('STEP 1b same-send twins: one original, one reference to it, one release', () => {
  it("splits the two claims and releases only the twin's blob", async () => {
    spies.insertNinaMessageImages.mockImplementation(async (_userId, rows) =>
      (rows as Array<Record<string, unknown>>).map((row, index) => ({
        id: index === 0 ? 'imgFRESH00001' : `imgOTHER${String(index).padStart(3, '0')}`,
        ...row,
      })),
    )

    const result = await actions.sendNinaMessage({
      body: 'dua kali',
      imageTickets: [
        ticketFor(CLAIM_A.pathname, CLAIM_A.blobUrl, 'same bytes'),
        ticketFor(CLAIM_B.pathname, CLAIM_B.blobUrl, 'same bytes'),
      ],
      contentHashes: {
        [CLAIM_A.pathname]: HASH,
        [CLAIM_B.pathname]: HASH,
      },
      sessionId: SESSION_ID,
    })

    expect(result.ok).toBe(true)
    const calls = insertedCalls()
    expect(calls).toHaveLength(2)

    /* First statement: the ORIGINAL, with the hash. */
    expect(calls[0]).toHaveLength(1)
    expect(calls[0]![0]).toMatchObject({
      pathname: CLAIM_A.pathname,
      contentHash: HASH,
      sortOrder: 0,
    })
    /* Second statement: the TWIN, referencing the original the first statement returned. */
    expect(calls[1]).toHaveLength(1)
    expect(calls[1]![0]).toMatchObject({
      pathname: CLAIM_A.pathname,
      sourceImageId: 'imgFRESH00001',
      sortOrder: 1,
    })
    expect(calls[1]![0]).not.toHaveProperty('contentHash')

    await afterTasks[0]!()
    expect(spies.releaseBlobIfUnreferenced).toHaveBeenCalledTimes(1)
    expect(spies.releaseBlobIfUnreferenced).toHaveBeenCalledWith('u1', {
      blobUrl: CLAIM_B.blobUrl,
      pathname: CLAIM_B.pathname,
    })
  })
})

describe('invariant 9: a bad claim writes NULL and the send proceeds', () => {
  it('never looks the hash up and inserts an ordinary original', async () => {
    const result = await actions.sendNinaMessage({
      body: 'hash rusak',
      imageTickets: [ticketFor(CLAIM_A.pathname, CLAIM_A.blobUrl, 'whatever')],
      contentHashes: { [CLAIM_A.pathname]: 'not-a-hash' },
      sessionId: SESSION_ID,
    })

    expect(result.ok).toBe(true)
    expect(spies.findNinaImageByContentHash).not.toHaveBeenCalled()
    expect(spies.insertNinaMessageImages).toHaveBeenCalledTimes(1)
    expect(insertedCalls()[0]![0]).toMatchObject({
      pathname: CLAIM_A.pathname,
      contentHash: null,
    })
    expect(afterTasks).toHaveLength(0)
  })

  it('a failed keeper LOOKUP degrades to fresh, never to lost rows', async () => {
    spies.findNinaImageByContentHash.mockRejectedValue(new Error('db down'))

    const result = await actions.sendNinaMessage({
      body: 'ini lagi',
      imageTickets: [ticketFor(CLAIM_A.pathname, CLAIM_A.blobUrl, 'whatever')],
      contentHashes: { [CLAIM_A.pathname]: HASH },
      sessionId: SESSION_ID,
    })

    expect(result.ok).toBe(true)
    expect(insertedCalls()[0]![0]).toMatchObject({
      pathname: CLAIM_A.pathname,
      contentHash: HASH,
    })
    expect(afterTasks).toHaveLength(0)
  })
})

describe('dedupedImageIds: the composer pre-check seam', () => {
  const LIVE_KEEPER = {
    id: 'imgKEEPER001',
    messageId: 'msgOLD000001',
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
  }

  it('a photograph-only send made of references is a VALID send (the fifth disjunct)', async () => {
    spies.getNinaMessageImage.mockResolvedValue(LIVE_KEEPER)

    const result = await actions.sendNinaMessage({
      body: '',
      dedupedImageIds: ['imgKEEPER001'],
      sessionId: SESSION_ID,
    })

    expect(result.ok).toBe(true)
    expect(spies.insertNinaMessageImages).toHaveBeenCalledTimes(1)
    expect(insertedCalls()[0]![0]).toMatchObject({
      messageId: RUNNER_MESSAGE_ID,
      kind: 'generated',
      pathname: 'nina/u1/selfie-1.jpg',
      sourceImageId: 'imgKEEPER001',
      sortOrder: 0,
    })
  })

  it('a keeper that died mid-compose DROPS the tile instead of refusing the send', async () => {
    spies.getNinaMessageImage.mockResolvedValue(null)

    const withText = await actions.sendNinaMessage({
      body: 'ini fotonya',
      dedupedImageIds: ['imgKEEPER001'],
      sessionId: SESSION_ID,
    })
    expect(withText.ok).toBe(true)
    expect(spies.insertNinaMessageImages).not.toHaveBeenCalled()

    /* …and a photo-only send whose only tile was dropped refuses BEFORE any write. */
    spies.insertNinaMessages.mockClear()
    const photoOnly = await actions.sendNinaMessage({
      body: '',
      dedupedImageIds: ['imgKEEPER001'],
      sessionId: SESSION_ID,
    })
    expect(photoOnly.ok).toBe(false)
    expect(spies.insertNinaMessages).not.toHaveBeenCalled()
  })
})

describe('findNinaDuplicateChatImage', () => {
  it('answers the keeper in the NinaExistingPhoto shape', async () => {
    spies.findNinaImageByContentHash.mockResolvedValue({
      id: 'imgKEEPER001',
      blobUrl: 'https://blob.example/nina/u1/chat/zzzz.jpg',
    })
    const photo = await actions.findNinaDuplicateChatImage({ contentHash: HASH, sourceHash: null })
    expect(photo).toEqual({
      kind: 'image',
      id: 'imgKEEPER001',
      url: 'https://blob.example/nina/u1/chat/zzzz.jpg',
    })
    expect(spies.findNinaImageByContentHash).toHaveBeenCalledWith('u1', [HASH])
  })

  it('asks BOTH keys in one lookup — the encode’s and the picked file’s own', async () => {
    spies.findNinaImageByContentHash.mockResolvedValue(null)
    const SOURCE_HASH = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
    await actions.findNinaDuplicateChatImage({ contentHash: HASH, sourceHash: SOURCE_HASH })
    expect(spies.findNinaImageByContentHash).toHaveBeenCalledWith('u1', [HASH, SOURCE_HASH])
  })

  it('a source-only hit reaches the lookup: the encode missed, the pick itself is stored', async () => {
    spies.findNinaImageByContentHash.mockResolvedValue({
      id: 'imgKEEPER001',
      blobUrl: 'https://blob.example/nina/u1/chat/zzzz.jpg',
    })
    const SOURCE_HASH = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
    const photo = await actions.findNinaDuplicateChatImage({
      contentHash: null,
      sourceHash: SOURCE_HASH,
    })
    expect(photo?.id).toBe('imgKEEPER001')
    expect(spies.findNinaImageByContentHash).toHaveBeenCalledWith('u1', [SOURCE_HASH])
  })

  it('a malformed key drops out without poisoning the valid one', async () => {
    spies.findNinaImageByContentHash.mockResolvedValue(null)
    const SOURCE_HASH = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
    await actions.findNinaDuplicateChatImage({ contentHash: 'zz', sourceHash: SOURCE_HASH })
    expect(spies.findNinaImageByContentHash).toHaveBeenCalledWith('u1', [SOURCE_HASH])
  })

  it('an invalid hash is null with no lookup; a miss is null', async () => {
    expect(
      await actions.findNinaDuplicateChatImage({ contentHash: 'zz', sourceHash: null }),
    ).toBeNull()
    expect(spies.findNinaImageByContentHash).not.toHaveBeenCalled()

    spies.findNinaImageByContentHash.mockResolvedValue(null)
    expect(
      await actions.findNinaDuplicateChatImage({ contentHash: HASH, sourceHash: null }),
    ).toBeNull()
  })
})

/* ── STEP 1b's perceptual half (media-dedupe follow-up, 2026-09-10) ─────────────────────────────
 * The class the byte keys cannot see: a photograph downloaded out of the collection re-encodes on
 * the way back, so both hashes miss while the pixels are the original's. The race-close now holds
 * the just-landed bytes once more (`fetchAndSignImage`, mocked here — sharp signs nothing in a
 * unit suite) and asks the owner's signed originals the sweep's three gates. */

const TWIN_SIG = Buffer.from(new Uint8Array(256).fill(100)).toString('base64')

const TWIN_KEEPER_ROW = {
  id: 'imgTWIN000001',
  kind: 'generated',
  blobUrl: 'https://blob.example/nina/u1/selfie-keeper.png',
  pathname: 'nina/u1/selfie-keeper.png',
  description: 'her selfie, described at birth',
  sourceAvatarId: null,
  sourceImageId: null,
  width: 736,
  height: 981,
  perceptualHash: '484c6c62414e7e5f',
  perceptualSig: TWIN_SIG,
}

describe('STEP 1b perceptual twins: a re-encode of a stored photograph becomes a reference', () => {
  beforeEach(() => {
    spies.fetchAndSignImage.mockResolvedValue({
      dhashHex: '484c6c62414e7e5f',
      sig16Base64: TWIN_SIG,
      width: 736,
      height: 981,
    })
    spies.findNinaSignedOriginals.mockResolvedValue([TWIN_KEEPER_ROW])
  })

  it('writes ONE reference row to the twin, releases the just-landed blob, row before blob', async () => {
    const result = await actions.sendNinaMessage({
      body: 'foto yang sama, bytes yang beda',
      imageTickets: [ticketFor(CLAIM_A.pathname, CLAIM_A.blobUrl, 'a re-encoded selfie')],
      contentHashes: {}, // both byte keys missed — this is the whole point
      sessionId: SESSION_ID,
    })

    expect(result.ok).toBe(true)
    expect(spies.fetchAndSignImage).toHaveBeenCalledWith(CLAIM_A.blobUrl)
    expect(spies.findNinaSignedOriginals).toHaveBeenCalledWith('u1')

    expect(spies.insertNinaMessageImages).toHaveBeenCalledTimes(1)
    const [referenceRow] = insertedCalls()[0]!
    expect(referenceRow).toMatchObject({
      messageId: RUNNER_MESSAGE_ID,
      kind: 'generated', // the keeper's kind — the reference tells the truth about whose bytes
      blobUrl: TWIN_KEEPER_ROW.blobUrl,
      pathname: TWIN_KEEPER_ROW.pathname,
      description: TWIN_KEEPER_ROW.description,
      sourceImageId: TWIN_KEEPER_ROW.id,
    })
    expect(referenceRow).not.toHaveProperty('contentHash')
    expect(referenceRow).not.toHaveProperty('perceptualHash') // a reference owns no bytes

    expect(spies.releaseBlobIfUnreferenced).not.toHaveBeenCalled()
    expect(afterTasks).toHaveLength(1)
    await afterTasks[0]!()
    expect(spies.releaseBlobIfUnreferenced).toHaveBeenCalledWith('u1', {
      blobUrl: CLAIM_A.blobUrl,
      pathname: CLAIM_A.pathname,
    })
  })

  it('a non-twin lands FRESH and carries its measured signature, so the next re-upload matches', async () => {
    spies.findNinaSignedOriginals.mockResolvedValue([
      // 1138/640 = 0.562 against the keeper's 736/981 = 0.750 — a different SHAPE. (Dimensions
      // alone stopped refusing pairs when the cross-resolution path landed: 640x853 — the same
      // 0.750 ratio at ~87% size — is now correctly merged as a twin.)
      { ...TWIN_KEEPER_ROW, width: 640, height: 1138 },
    ])

    await actions.sendNinaMessage({
      body: 'bukan kembar',
      imageTickets: [ticketFor(CLAIM_A.pathname, CLAIM_A.blobUrl, 'something else')],
      contentHashes: {},
      sessionId: SESSION_ID,
    })

    expect(spies.insertNinaMessageImages).toHaveBeenCalledTimes(1)
    const freshRow = insertedCalls()[0]![0]!
    expect(freshRow.sourceImageId).toBeUndefined()
    expect(freshRow.blobUrl).toBe(CLAIM_A.blobUrl)
    expect(freshRow.perceptualHash).toBe('484c6c62414e7e5f')
    expect(freshRow.perceptualSig).toBe(TWIN_SIG)
    expect(afterTasks).toHaveLength(0) // nothing was released; the row owns its own object
  })

  it('a failed sign degrades to the byte answer with no twin lookup and no signature', async () => {
    spies.fetchAndSignImage.mockResolvedValue(null)

    await actions.sendNinaMessage({
      body: 'tetap terkirim',
      imageTickets: [ticketFor(CLAIM_A.pathname, CLAIM_A.blobUrl, 'unsignable bytes')],
      contentHashes: {},
      sessionId: SESSION_ID,
    })

    expect(spies.findNinaSignedOriginals).not.toHaveBeenCalled()
    const freshRow = insertedCalls()[0]![0]!
    expect(freshRow.perceptualHash).toBeNull()
    expect(freshRow.perceptualSig).toBeNull()
    expect(freshRow.blobUrl).toBe(CLAIM_A.blobUrl)
    expect(afterTasks).toHaveLength(0)
  })

  it('a claim the byte keys already settled is never signed at all', async () => {
    spies.findNinaImageByContentHash.mockResolvedValue({
      id: 'imgKEEPER001',
      kind: 'upload',
      blobUrl:
        'https://blob.example/nina/u1/chat/zzzzzzzzzzzz-yyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyy.jpg',
      pathname: 'nina/u1/chat/zzzzzzzzzzzz-yyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyy.jpg',
      description: 'already described',
      sourceAvatarId: null,
      sourceImageId: null,
      messageId: 'msgOLD000001',
      prompt: null,
      width: 768,
      height: 1024,
      bytes: 150_000,
      sortOrder: 0,
      createdAt: new Date('2026-09-09T09:00:00Z'),
    })

    await actions.sendNinaMessage({
      body: 'byte-exact, jangan di-GET dua kali',
      imageTickets: [ticketFor(CLAIM_A.pathname, CLAIM_A.blobUrl, 'the arrival card')],
      contentHashes: { [CLAIM_A.pathname]: HASH },
      sessionId: SESSION_ID,
    })

    expect(spies.fetchAndSignImage).not.toHaveBeenCalled()
    expect(spies.findNinaSignedOriginals).not.toHaveBeenCalled()
  })
})
