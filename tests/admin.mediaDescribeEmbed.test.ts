import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { installFakeDb, uninstallFakeDb, type FakeDb } from './support/fakeDb'

/**
 * `lib/admin/ninaMediaDeferredDescribe.ts` — the Media twin of
 * `tests/admin.albumDescribeEmbed.test.ts`'s `ninaAlbumDeferredDescribe.ts` suite.
 * `media-album-unified-search` phase 2.
 *
 * The one real difference from the album worker: the vision SUBJECT follows the photograph's own
 * `kind` (`photoSideOf` + `describeSubjectForSide`) rather than being hard-coded to `'hers'`.
 * Every other property — the concurrency bound, the deadline, the never-throws embed, the
 * structural omission of `search_keywords` from the describe write — is the album suite's
 * argument, replicated once here rather than re-argued.
 */

const USER = 'abc123XYZ_-9'
const ID = 'img123XYZ_-9'
const BLOB_URL = 'https://abc123store.public.blob.vercel-storage.com/nina/abc123XYZ_-9/x.jpg'
const PATHNAME = 'nina/abc123XYZ_-9/x.jpg'
const EMBEDDING = [0.1, 0.2, 0.3]

const describeNinaImages = vi.fn()
const embedNinaText = vi.fn()

const afterCallbacks: Array<() => Promise<void>> = []
vi.mock('next/server', () => ({
  after: (cb: () => Promise<void>) => {
    afterCallbacks.push(cb)
  },
}))
vi.mock('@/lib/nina/vision', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/nina/vision')>()
  return { ...actual, describeNinaImages: (...args: unknown[]) => describeNinaImages(...args) }
})
vi.mock('@/lib/nina/embedding', () => ({
  embedNinaText: (...args: unknown[]) => embedNinaText(...args),
}))

type Deferred = typeof import('@/lib/admin/ninaMediaDeferredDescribe')
let deferred: Deferred
let fake: FakeDb

function target(
  overrides: Partial<{
    id: string
    blobUrl: string
    pathname: string
    kind: 'generated' | 'upload'
    description: string | null
    searchKeywords: string | null
    hasEmbedding: boolean
  }> = {},
) {
  return {
    id: overrides.id ?? ID,
    blobUrl: overrides.blobUrl ?? BLOB_URL,
    pathname: overrides.pathname ?? PATHNAME,
    kind: overrides.kind ?? 'generated',
    description: 'description' in overrides ? (overrides.description ?? null) : null,
    searchKeywords: 'searchKeywords' in overrides ? (overrides.searchKeywords ?? null) : null,
    hasEmbedding: overrides.hasEmbedding ?? false,
  }
}

beforeEach(async () => {
  afterCallbacks.length = 0
  vi.resetModules()
  describeNinaImages
    .mockReset()
    .mockResolvedValue({ description: 'fresh prose', completionTokens: 60 })
  embedNinaText.mockReset().mockResolvedValue(EMBEDDING)
  fake = installFakeDb()
  deferred = await import('@/lib/admin/ninaMediaDeferredDescribe')
})

afterEach(() => {
  vi.useRealTimers()
  uninstallFakeDb()
  vi.resetModules()
})

describe('the vision subject follows the photograph, not a hard-coded side', () => {
  it("a 'generated' target gets the SELF witness", async () => {
    await deferred.fillNinaMessageImageDescribeTargets(
      USER,
      [target({ kind: 'generated' })],
      60_000,
    )

    expect(describeNinaImages).toHaveBeenCalledTimes(1)
    expect(describeNinaImages.mock.calls[0]?.[1]).toMatchObject({ subject: 'self' })
  })

  it("an 'upload' target gets the RUNNER witness", async () => {
    await deferred.fillNinaMessageImageDescribeTargets(
      USER,
      [target({ kind: 'upload', id: 'img2' })],
      60_000,
    )

    expect(describeNinaImages).toHaveBeenCalledTimes(1)
    expect(describeNinaImages.mock.calls[0]?.[1]).toMatchObject({ subject: 'runner' })
  })
})

describe('fillOne', () => {
  it('a described + embedded row makes zero vendor calls (alreadyDone)', async () => {
    const outcome = await deferred.fillNinaMessageImageDescribeTargets(
      USER,
      [target({ description: 'already written', hasEmbedding: true })],
      60_000,
    )

    expect(outcome.alreadyDone).toBe(1)
    expect(describeNinaImages).not.toHaveBeenCalled()
    expect(embedNinaText).not.toHaveBeenCalled()
    expect(fake.queries).toHaveLength(0)
  })

  it('describe:false on a NULL-description row writes nothing and calls nothing', async () => {
    // `fillNinaMessageImageDescribeTargets` always passes `describe: true`; the `describe: false`
    // path is only reachable through `scheduleMediaEmbed`'s `after()` callback — exercised here by
    // calling the scheduler directly.
    fake.enqueue([target({ description: null, hasEmbedding: false })])

    deferred.scheduleMediaEmbed(USER, ID)
    expect(afterCallbacks).toHaveLength(1)
    await afterCallbacks[0]?.()

    expect(describeNinaImages).not.toHaveBeenCalled()
    expect(embedNinaText).not.toHaveBeenCalled()
    expect(fake.queries).toHaveLength(1) // the re-read only; nothing to embed
  })

  it('a thrown embed answers null, and the prose is still written', async () => {
    embedNinaText.mockRejectedValue(new Error('embeddings endpoint down'))

    const outcome = await deferred.fillNinaMessageImageDescribeTargets(
      USER,
      [target({ description: 'already written', hasEmbedding: false })],
      60_000,
    )

    expect(outcome.embedded).toBe(0)
    expect(fake.queries).toHaveLength(1)
    const update = fake.only()
    expect(update.sql).toContain('update "nina_message_images"')
    expect(update.params).toEqual(['already written', null, USER, ID])
  })
})

describe('the deadline stops rows STARTING, and ranOutOfTime counts them truthfully', () => {
  it('a row already in flight finishes; the next lane refuses to start', async () => {
    vi.useFakeTimers()
    const start = Date.now()
    describeNinaImages.mockImplementation(async () => {
      vi.setSystemTime(start + 60_000 + 1000)
      return { description: 'fresh prose', completionTokens: 60 }
    })

    const targets = [0, 1, 2].map((i) => target({ id: `id${i}`, description: null }))

    const outcome = await deferred.fillNinaMessageImageDescribeTargets(USER, targets, 60_000)

    expect(describeNinaImages).toHaveBeenCalledTimes(1)
    expect(outcome.described).toBe(1)
    expect(outcome.ranOutOfTime).toBe(2)
  })
})

describe('embedNinaMessageImageDescription', () => {
  it('embeds buildNinaAvatarEmbedText(description, keywords) — the one text, two corpora invariant', async () => {
    await deferred.embedNinaMessageImageDescription('she is on a beach', 'tete, putih', USER)

    expect(embedNinaText).toHaveBeenCalledWith('she is on a beach\n\nKeywords: tete, putih', {
      userId: USER,
    })
  })

  it('embeds the description alone when there are no keywords', async () => {
    await deferred.embedNinaMessageImageDescription('she is on a beach', null, USER)

    expect(embedNinaText).toHaveBeenCalledWith('she is on a beach', { userId: USER })
  })

  it('never throws — a failed embed answers null', async () => {
    embedNinaText.mockRejectedValue(new Error('down'))

    await expect(
      deferred.embedNinaMessageImageDescription('she is on a beach', null, USER),
    ).resolves.toBeNull()
  })
})
