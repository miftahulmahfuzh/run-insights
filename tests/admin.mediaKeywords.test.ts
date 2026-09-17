import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { installFakeDb, projectedRow, uninstallFakeDb, type FakeDb } from './support/fakeDb'

/**
 * The two new Media keyword actions (`lib/admin/chatPhotoKeywordActions.ts`) and the two existing
 * Media describe writers' new re-embed scheduling (`lib/admin/chatPhotoActions.ts`).
 * `media-album-unified-search` phase 2, R2.
 *
 * Posture is `tests/admin.albumDescribeEmbed.test.ts`'s: real query functions against
 * `tests/support/fakeDb.ts`, only the edges mocked.
 */

const USER = 'abc123XYZ_-9'
const ID = 'img123XYZ_-9'
const BLOB_URL = 'https://abc123store.public.blob.vercel-storage.com/nina/abc123XYZ_-9/x.jpg'
const PATHNAME = 'nina/abc123XYZ_-9/x.jpg'
const EMBEDDING = [0.1, 0.2, 0.3]

const requireAdmin = vi.fn()
const describeNinaImages = vi.fn()
const embedNinaText = vi.fn()
const revalidatePath = vi.fn()
const afterCallbacks: Array<() => Promise<void>> = []

vi.mock('@/lib/admin/requireAdmin', () => ({ requireAdmin: () => requireAdmin() }))
vi.mock('next/server', () => ({
  after: (cb: () => Promise<void>) => {
    afterCallbacks.push(cb)
  },
}))
vi.mock('next/cache', () => ({ revalidatePath: (path: string) => revalidatePath(path) }))
vi.mock('@/lib/nina/vision', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/nina/vision')>()
  return { ...actual, describeNinaImages: (...args: unknown[]) => describeNinaImages(...args) }
})
vi.mock('@/lib/nina/embedding', () => ({
  embedNinaText: (...args: unknown[]) => embedNinaText(...args),
}))

type KeywordActions = typeof import('@/lib/admin/chatPhotoKeywordActions')
type ChatPhotoActions = typeof import('@/lib/admin/chatPhotoActions')
let keywordActions: KeywordActions
let chatPhotoActions: ChatPhotoActions
let fake: FakeDb

/** `imageColumns` in projection order — 19 values, `getNinaMessageImage`'s own shape. */
function imageRow(overrides: Record<string, unknown> = {}): unknown[] {
  return projectedRow(
    'id' in overrides ? overrides.id : ID,
    'messageId' in overrides ? overrides.messageId : 'msg123XYZ_-9',
    'kind' in overrides ? overrides.kind : 'upload',
    'blobUrl' in overrides ? overrides.blobUrl : BLOB_URL,
    'pathname' in overrides ? overrides.pathname : PATHNAME,
    'width' in overrides ? overrides.width : 1024,
    'height' in overrides ? overrides.height : 768,
    'bytes' in overrides ? overrides.bytes : 200_000,
    'description' in overrides ? overrides.description : null,
    'prompt' in overrides ? overrides.prompt : null,
    'sourceAvatarId' in overrides ? overrides.sourceAvatarId : null,
    'sourceImageId' in overrides ? overrides.sourceImageId : null,
    'contentHash' in overrides ? overrides.contentHash : null,
    'perceptualHash' in overrides ? overrides.perceptualHash : null,
    'perceptualSig' in overrides ? overrides.perceptualSig : null,
    'sortOrder' in overrides ? overrides.sortOrder : 0,
    '2026-09-01 09:00:00+00',
    'searchKeywords' in overrides ? overrides.searchKeywords : null,
    'negativeSearchKeywords' in overrides ? overrides.negativeSearchKeywords : null,
  )
}

beforeEach(async () => {
  afterCallbacks.length = 0
  vi.resetModules()
  requireAdmin.mockReset().mockResolvedValue({ userId: USER, email: 'ops@example.com' })
  describeNinaImages
    .mockReset()
    .mockResolvedValue({ description: 'fresh prose', completionTokens: 60 })
  embedNinaText.mockReset().mockResolvedValue(EMBEDDING)
  revalidatePath.mockReset()
  fake = installFakeDb()
  keywordActions = await import('@/lib/admin/chatPhotoKeywordActions')
  chatPhotoActions = await import('@/lib/admin/chatPhotoActions')
})

afterEach(() => {
  uninstallFakeDb()
  vi.resetModules()
})

describe('requireAdmin runs first', () => {
  it('a rejected requireAdmin runs no statement, for either action', async () => {
    requireAdmin.mockRejectedValue(new Error('not an admin'))

    await expect(
      keywordActions.editNinaMessageImageSearchKeywordsAction({ id: ID, searchKeywords: 'tete' }),
    ).rejects.toThrow()
    expect(fake.queries).toHaveLength(0)

    await expect(
      keywordActions.editNinaMessageImageNegativeSearchKeywordsAction({
        id: ID,
        negativeSearchKeywords: 'tete',
      }),
    ).rejects.toThrow()
    expect(fake.queries).toHaveLength(0)
  })
})

describe('editNinaMessageImageSearchKeywordsAction', () => {
  it('refuses an over-long paste with the 500-character sentence, writing nothing', async () => {
    const result = await keywordActions.editNinaMessageImageSearchKeywordsAction({
      id: ID,
      searchKeywords: 'x'.repeat(501),
    })

    expect(result).toEqual({ ok: false, error: expect.stringContaining('500 characters at most') })
    expect(fake.queries).toHaveLength(0)
  })

  it('nulls description_embedding in the same statement and schedules scheduleMediaEmbed', async () => {
    fake.enqueue([imageRow({ description: 'she is on a beach', searchKeywords: null })])
    fake.enqueue([{ id: ID }])

    const result = await keywordActions.editNinaMessageImageSearchKeywordsAction({
      id: ID,
      searchKeywords: 'tete, putih',
    })

    expect(result.ok).toBe(true)
    const update = fake.last()
    expect(update.sql).toContain('update "nina_message_images"')
    expect(update.sql).toContain('search_keywords')
    expect(update.sql).toContain('description_embedding')
    expect(update.params).toEqual(['tete, putih', null, USER, ID])
    expect(afterCallbacks).toHaveLength(1)
  })

  it('an empty box clears to NULL and returns the note', async () => {
    fake.enqueue([imageRow({ description: 'she is on a beach', searchKeywords: 'tete' })])
    fake.enqueue([{ id: ID }])

    const result = await keywordActions.editNinaMessageImageSearchKeywordsAction({
      id: ID,
      searchKeywords: '  ',
    })

    expect(result).toEqual({
      ok: true,
      id: ID,
      note: 'Cleared. The photo is findable by its description alone.',
    })
    expect(fake.last().params).toEqual([null, null, USER, ID])
  })

  it('a row with a NULL description schedules nothing', async () => {
    fake.enqueue([imageRow({ description: null, searchKeywords: null })])
    fake.enqueue([{ id: ID }])

    await keywordActions.editNinaMessageImageSearchKeywordsAction({
      id: ID,
      searchKeywords: 'tete',
    })

    expect(afterCallbacks).toHaveLength(0)
  })

  it('a reference row is refused before any write', async () => {
    fake.enqueue([imageRow({ sourceAvatarId: 'ava123XYZ_-9' })])

    const result = await keywordActions.editNinaMessageImageSearchKeywordsAction({
      id: ID,
      searchKeywords: 'tete',
    })

    expect(result).toEqual({
      ok: false,
      error: 'That one re-shows a photo that lives elsewhere. Tag the original instead.',
    })
    expect(fake.queries).toHaveLength(1) // the read only
  })
})

describe('editNinaMessageImageNegativeSearchKeywordsAction', () => {
  it('refuses an over-long paste with the 500-character sentence, writing nothing', async () => {
    const result = await keywordActions.editNinaMessageImageNegativeSearchKeywordsAction({
      id: ID,
      negativeSearchKeywords: 'x'.repeat(501),
    })

    expect(result).toEqual({ ok: false, error: expect.stringContaining('500 characters at most') })
    expect(fake.queries).toHaveLength(0)
  })

  it('writes the column alone — no vector touched, no schedule', async () => {
    fake.enqueue([imageRow({ description: 'she is on a beach' })])
    fake.enqueue([{ id: ID }])

    const result = await keywordActions.editNinaMessageImageNegativeSearchKeywordsAction({
      id: ID,
      negativeSearchKeywords: 'tete',
    })

    expect(result.ok).toBe(true)
    const update = fake.last()
    expect(update.sql).toContain('update "nina_message_images"')
    expect(update.sql).toContain('negative_search_keywords')
    expect(update.sql).not.toContain('description_embedding')
    expect(afterCallbacks).toHaveLength(0)
  })

  it('an empty box clears to NULL and returns the note', async () => {
    fake.enqueue([imageRow({ negativeSearchKeywords: 'tete' })])
    fake.enqueue([{ id: ID }])

    const result = await keywordActions.editNinaMessageImageNegativeSearchKeywordsAction({
      id: ID,
      negativeSearchKeywords: '  ',
    })

    expect(result).toEqual({
      ok: true,
      id: ID,
      note: 'Cleared. No query is excluded for this photo any more.',
    })
  })

  it('a reference row is refused before any write', async () => {
    fake.enqueue([imageRow({ sourceImageId: 'img999XYZ_-9' })])

    const result = await keywordActions.editNinaMessageImageNegativeSearchKeywordsAction({
      id: ID,
      negativeSearchKeywords: 'tete',
    })

    expect(result).toEqual({
      ok: false,
      error: 'That one re-shows a photo that lives elsewhere. Tag the original instead.',
    })
    expect(fake.queries).toHaveLength(1)
  })
})

describe('editChatPhotoDescriptionAction now nulls the vector and re-earns it', () => {
  it('writes new prose and a NULL vector in one statement, then schedules scheduleMediaEmbed', async () => {
    fake.enqueue([imageRow({ description: 'old words' })]) // getNinaMessageImage
    fake.enqueue([{ id: ID }]) // updateNinaChatPhotoDescription RETURNING
    fake.enqueue([{ id: ID }]) // setNinaMessageImageDescriptionAndEmbedding RETURNING

    const result = await chatPhotoActions.editChatPhotoDescriptionAction({
      id: ID,
      description: 'new words',
    })

    expect(result.ok).toBe(true)
    const update = fake.last()
    expect(update.sql).toContain('update "nina_message_images"')
    expect(update.sql).toContain('description_embedding')
    expect(update.params).toEqual(['new words', null, USER, ID])
    expect(afterCallbacks).toHaveLength(1)
  })

  it('clearing the box schedules nothing', async () => {
    fake.enqueue([imageRow({ description: 'old words' })])
    fake.enqueue([{ id: ID }])
    fake.enqueue([{ id: ID }])

    const result = await chatPhotoActions.editChatPhotoDescriptionAction({
      id: ID,
      description: '',
    })

    expect(result.ok).toBe(true)
    expect(fake.last().params).toEqual([null, null, USER, ID])
    expect(afterCallbacks).toHaveLength(0)
  })
})

describe('describeChatPhotoAction writes prose and vector in one statement, never touching search_keywords', () => {
  it('embeds description + the row’s existing keywords, and never writes them', async () => {
    fake.enqueue([imageRow({ description: 'old prose', searchKeywords: 'tete, putih' })]) // getNinaMessageImage
    fake.enqueue([{ id: ID }]) // setNinaMessageImageDescriptionAndEmbedding RETURNING

    const result = await chatPhotoActions.describeChatPhotoAction({ id: ID })

    expect(result).toEqual({ ok: true, id: ID, description: 'fresh prose' })
    expect(embedNinaText).toHaveBeenCalledWith('fresh prose\n\nKeywords: tete, putih', {
      userId: USER,
    })
    const update = fake.last()
    expect(update.sql).toContain('update "nina_message_images"')
    expect(update.sql).not.toContain('search_keywords')
    expect(update.params).toEqual(['fresh prose', JSON.stringify(EMBEDDING), USER, ID])
    expect(afterCallbacks).toHaveLength(0) // in band, nothing deferred
  })
})
