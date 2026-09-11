import { beforeEach, describe, expect, it, vi } from 'vitest'

import { dbNinaSourceGateway } from '@/lib/nina/gateway'
import { getNinaMessageImagesForMessages, getNinaMessageWindow } from '@/lib/nina/queries'

/**
 * **R3's window half, pinned at the gateway boundary.**
 *
 * `dbNinaSourceGateway.readMessageWindow` hardcoded `imageDescriptions: []` from the day it landed
 * — so a photograph attached to an earlier message reached her ONCE (the send path's own
 * `imageDescriptions`) and never again, while `lib/nina/actions.ts`'s chain comment claimed the
 * context load covered it and `tests/nina.resend.test.ts:375` documented the gap. The property
 * under test is the phase-boundary one, the same style `tests/nina.gateway.patterns.test.ts` uses
 * for the patterns stub: **a described photograph on a window row comes back through THIS read**,
 * and it cannot silently revert to `[]` without failing here.
 *
 * Every source is mocked — the real ones reach Neon, and the `server-only` import is aliased by
 * `vitest.config.ts`, so importing the gateway is safe while querying through it would not be.
 */

vi.mock('@/lib/db/queries', () => ({
  getAllTimeTotals: vi.fn(),
  getReviewedRunWindow: vi.fn(),
  getReviewedRunsWithChildren: vi.fn(),
}))
vi.mock('@/lib/metrics', () => ({
  resolveHrMax: vi.fn(),
  computeSessionMetrics: vi.fn(),
  evaluateSessionFlags: vi.fn(),
}))
vi.mock('@/lib/nina/queries', () => ({
  appendNinaMemoryFacts: vi.fn(),
  getNinaIdentity: vi.fn(),
  getNinaMemorySlot: vi.fn(),
  getNinaMemorySlots: vi.fn(),
  getNinaMessageImagesForMessages: vi.fn(),
  getNinaMessageWindow: vi.fn(),
  getNinaNags: vi.fn(),
  insertNinaTurn: vi.fn(),
  listNinaMemoryFacts: vi.fn(),
  upsertNinaMemorySlot: vi.fn(),
}))

const windowRows = vi.mocked(getNinaMessageWindow)
const imagesFor = vi.mocked(getNinaMessageImagesForMessages)

/** A window row as `getNinaMessageWindow` returns it — `messageColumns`'s shape, narrowed. */
function row(id: string, over: Partial<Record<string, unknown>> = {}) {
  return {
    id,
    seq: 40,
    sessionId: 'ses000000001',
    role: 'runner' as const,
    body: 'lihat ini',
    createdAt: new Date('2026-09-10T02:14:00.000Z'),
    source: 'chat' as const,
    turnId: null,
    replyToId: null,
    runId: null,
    readAt: null,
    photoOnly: false,
    ...over,
  }
}

/** An image row as `getNinaMessageImagesForMessages` returns it — `imageColumns`, narrowed. */
function image(id: string, messageId: string, description: string | null, sortOrder = 0) {
  return {
    id,
    messageId,
    kind: 'generated' as const,
    blobUrl: `https://blob.example/nina/u1/selfie-${id}.jpg`,
    pathname: `nina/u1/selfie-${id}.jpg`,
    width: 768,
    height: 1024,
    bytes: 150_000,
    description,
    prompt: null,
    sourceAvatarId: null,
    sourceImageId: null,
    contentHash: null,
    perceptualHash: null,
    perceptualSig: null,
    sortOrder,
    createdAt: new Date('2026-09-10T02:14:00.000Z'),
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  windowRows.mockResolvedValue({ messages: [], olderCount: 0 })
  imagesFor.mockResolvedValue([])
})

describe('readMessageWindow — the window photographs reach her (R3)', () => {
  it('carries a described photo’s prose in its own row’s imageDescriptions', async () => {
    windowRows.mockResolvedValue({
      messages: [
        row('msgA000000001'),
        row('msgB000000001', { role: 'nina', body: 'kayaknya sih' }),
      ],
      olderCount: 12,
    })
    imagesFor.mockResolvedValue([image('imgA000000001', 'msgA000000001', 'she is on the pier')])

    const { messages, olderCount } = await dbNinaSourceGateway.readMessageWindow(
      'u1',
      40,
      'ses000000001',
    )

    expect(messages).toHaveLength(2)
    expect(messages[0]!.imageDescriptions).toEqual(['she is on the pier'])
    /* The row WITHOUT a photograph stays `[]` — an empty array is what "no images" is, never null. */
    expect(messages[1]!.imageDescriptions).toEqual([])
    /* The count is a passthrough at this boundary; the query owns its user-wide semantics. */
    expect(olderCount).toBe(12)
  })

  it('keeps bubble order — sort_order, not insertion luck — when a message carries two', async () => {
    windowRows.mockResolvedValue({ messages: [row('msgA000000001')], olderCount: 0 })
    imagesFor.mockResolvedValue([
      image('imgSECOND0001', 'msgA000000001', 'the second photo', 1),
      image('imgFIRST00001', 'msgA000000001', 'the first photo', 0),
    ])

    const { messages } = await dbNinaSourceGateway.readMessageWindow('u1', 40, 'ses000000001')

    expect(messages[0]!.imageDescriptions).toEqual(['the first photo', 'the second photo'])
  })

  it('omits an UNdescribed photo instead of claiming her eyes failed on history', async () => {
    // The substitution (NINA_DESCRIPTION_UNAVAILABLE) belongs to the row being answered NOW — the
    // send and resend paths. Here the row is history, and "your eyes failed" about a photograph
    // nobody ever attempted would be a false sentence she is instructed to repeat, paid for on
    // every turn. Described prose rides; undescribed rows are silent.
    windowRows.mockResolvedValue({ messages: [row('msgA000000001')], olderCount: 0 })
    imagesFor.mockResolvedValue([
      image('imgDESCRIBED1', 'msgA000000001', 'she is on the pier', 0),
      image('imgNULLDESC01', 'msgA000000001', null, 1),
    ])

    const { messages } = await dbNinaSourceGateway.readMessageWindow('u1', 40, 'ses000000001')

    expect(messages[0]!.imageDescriptions).toEqual(['she is on the pier'])
  })

  it('tells her about a re-show too — a reference row carries its own copied description', async () => {
    // `resolveAttachment` copies `description` onto reference rows and they describe the same
    // bytes, so provenance is not this read's question. Filtering them here would silence the
    // photograph he re-sent from the collection.
    windowRows.mockResolvedValue({ messages: [row('msgA000000001')], olderCount: 0 })
    imagesFor.mockResolvedValue([
      {
        ...image('imgRESHOW001', 'msgA000000001', 'her, on a bridge at dusk'),
        sourceAvatarId: 'avaAAAAAAAAA',
      },
    ])

    const { messages } = await dbNinaSourceGateway.readMessageWindow('u1', 40, 'ses000000001')

    expect(messages[0]!.imageDescriptions).toEqual(['her, on a bridge at dusk'])
  })

  it('reads [] everywhere for a window with no photographs, and pays for nothing else', async () => {
    windowRows.mockResolvedValue({
      messages: [row('msgA000000001'), row('msgB000000001', { role: 'nina' })],
      olderCount: 3,
    })
    imagesFor.mockResolvedValue([])

    const { messages } = await dbNinaSourceGateway.readMessageWindow('u1', 40, 'ses000000001')

    expect(messages.map((message) => message.imageDescriptions)).toEqual([[], []])
    /* The image read still runs once — it is the only way to know — with exactly the window's ids. */
    expect(imagesFor).toHaveBeenCalledOnce()
    expect(imagesFor).toHaveBeenCalledWith('u1', ['msgA000000001', 'msgB000000001'])
  })
})
