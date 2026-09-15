import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { installFakeDb, projectedRow, uninstallFakeDb, type FakeDb } from './support/fakeDb'

/**
 * `admin-album-semantic-search` phase 2's own suite: the deferred describe+embed pipeline, the
 * two write sites that keep the vector honest, and the one-time backfill route.
 *
 * Posture is `tests/admin.albumAvatarActions.test.ts`'s: real query functions against
 * `tests/support/fakeDb.ts` (generated SQL, not spies), with only the edges mocked —
 * `requireAdmin`/`requireAdminApi`, `next/server`'s `after`, `next/cache`'s `revalidatePath`,
 * `@/lib/nina/vision` and `@/lib/nina/embedding`.
 */

const USER = 'abc123XYZ_-9'
const ID = 'ava123XYZ_-9'
const STORE = 'https://abc123store.public.blob.vercel-storage.com'
const PATHNAME = `nina/${USER}/avatar-${ID}-Tu6HvWq2m0k3rB8nQ1zXeRfYdGjL.jpg`
const BLOB_URL = `${STORE}/${PATHNAME}`
/** A stand-in vector. Its length is irrelevant to these tests; only its identity is asserted. */
const EMBEDDING = [0.1, 0.2, 0.3]

const requireAdmin = vi.fn()
const requireAdminApi = vi.fn()
const describeNinaImages = vi.fn()
const embedNinaText = vi.fn()
const revalidatePath = vi.fn()
const afterCallbacks: Array<() => Promise<void>> = []

class AdminForbiddenError extends Error {}
class UnauthorizedError extends Error {}

vi.mock('@/lib/admin/requireAdmin', () => ({
  requireAdmin: () => requireAdmin(),
  requireAdminApi: () => requireAdminApi(),
  forbiddenJson: () => Response.json({ error: 'Not found' }, { status: 404 }),
  AdminForbiddenError,
}))
vi.mock('@/lib/auth/requireUserId', () => ({
  UnauthorizedError,
  unauthorizedJson: () => Response.json({ error: 'Unauthorized' }, { status: 401 }),
}))
vi.mock('next/server', () => ({
  after: (cb: () => Promise<void>) => {
    afterCallbacks.push(cb)
  },
}))
vi.mock('next/cache', () => ({ revalidatePath: (path: string) => revalidatePath(path) }))
vi.mock('@/lib/nina/vision', () => ({
  describeNinaImages: (...args: unknown[]) => describeNinaImages(...args),
}))
vi.mock('@/lib/nina/embedding', () => ({
  embedNinaText: (...args: unknown[]) => embedNinaText(...args),
}))

type Actions = typeof import('@/lib/admin/ninaAlbumActions')
type Deferred = typeof import('@/lib/admin/ninaAlbumDeferredDescribe')
type Route = typeof import('@/app/api/admin/nina/backfill-descriptions/route')
let actions: Actions
let deferred: Deferred
let route: Route
let fake: FakeDb

/** `avatarColumns` in projection order — 19 values, `getNinaAvatar`'s own shape. */
function avatarRow(overrides: Record<string, unknown> = {}): unknown[] {
  return projectedRow(
    'id' in overrides ? overrides.id : ID,
    'blobUrl' in overrides ? overrides.blobUrl : BLOB_URL,
    'pathname' in overrides ? overrides.pathname : PATHNAME,
    'folder' in overrides ? overrides.folder : '',
    'filename' in overrides ? overrides.filename : null,
    'thumbUrl' in overrides ? overrides.thumbUrl : null,
    'thumbPathname' in overrides ? overrides.thumbPathname : null,
    'width' in overrides ? overrides.width : 1792,
    'height' in overrides ? overrides.height : 2400,
    'bytes' in overrides ? overrides.bytes : 1_500_000,
    'source' in overrides ? overrides.source : 'admin',
    'cropScale' in overrides ? overrides.cropScale : null,
    'cropX' in overrides ? overrides.cropX : null,
    'cropY' in overrides ? overrides.cropY : null,
    'description' in overrides ? overrides.description : null,
    'searchKeywords' in overrides ? overrides.searchKeywords : null,
    'isCurrent' in overrides ? overrides.isCurrent : false,
    'announcedAt' in overrides ? overrides.announcedAt : null,
    '2026-09-01 09:00:00+00',
  )
}

/** `describeTargetColumns` in projection order — six values. */
function describeTargetRow(overrides: Record<string, unknown> = {}): unknown[] {
  return projectedRow(
    'id' in overrides ? overrides.id : ID,
    'blobUrl' in overrides ? overrides.blobUrl : BLOB_URL,
    'pathname' in overrides ? overrides.pathname : PATHNAME,
    'description' in overrides ? overrides.description : null,
    'searchKeywords' in overrides ? overrides.searchKeywords : null,
    'embedded' in overrides ? overrides.embedded : 0,
  )
}

beforeEach(async () => {
  afterCallbacks.length = 0
  vi.resetModules()
  requireAdmin.mockReset().mockResolvedValue({ userId: USER, email: 'ops@example.com' })
  requireAdminApi.mockReset().mockResolvedValue({ userId: USER, email: 'ops@example.com' })
  describeNinaImages
    .mockReset()
    .mockResolvedValue({ description: 'fresh prose', completionTokens: 60 })
  embedNinaText.mockReset().mockResolvedValue(EMBEDDING)
  revalidatePath.mockReset()
  fake = installFakeDb()
  actions = await import('@/lib/admin/ninaAlbumActions')
  deferred = await import('@/lib/admin/ninaAlbumDeferredDescribe')
  route = await import('@/app/api/admin/nina/backfill-descriptions/route')
})

afterEach(() => {
  vi.useRealTimers()
  uninstallFakeDb()
  vi.resetModules()
})

/* ── scheduleDescribeAll — the batch read and the vendor lanes ─────────────────────────────── */

describe('scheduleDescribeAll', () => {
  it('reads the whole batch in ONE statement before the first vendor call', async () => {
    const ids = Array.from({ length: 50 }, (_, i) => `id${i}`)
    let queriesBeforeFirstDescribe = -1
    describeNinaImages.mockImplementation(async () => {
      if (queriesBeforeFirstDescribe === -1) queriesBeforeFirstDescribe = fake.queries.length
      return { description: 'fresh prose', completionTokens: 60 }
    })
    fake.enqueue(ids.map((id) => describeTargetRow({ id, description: null })))

    deferred.scheduleDescribeAll(USER, ids)
    expect(afterCallbacks).toHaveLength(1)
    await afterCallbacks[0]?.()

    expect(queriesBeforeFirstDescribe).toBe(1)
    expect(fake.queries[0]?.sql).toMatch(/select/)
    expect(fake.queries[0]?.sql).toMatch(/in \(|= any/)
  })
})

/* ── fillNinaAvatarDescribeTargets — the worker's own behaviour, targets already in hand ──── */

describe('fillNinaAvatarDescribeTargets', () => {
  it('bounds concurrency at NINA_DEFERRED_DESCRIBE_CONCURRENCY simultaneous vendor calls', async () => {
    let resolveGate: () => void = () => {}
    const gate = new Promise<void>((resolve) => {
      resolveGate = resolve
    })
    let inFlight = 0
    let maxInFlight = 0
    describeNinaImages.mockImplementation(async () => {
      inFlight++
      maxInFlight = Math.max(maxInFlight, inFlight)
      await gate
      inFlight--
      return { description: 'fresh prose', completionTokens: 60 }
    })

    const targets = Array.from({ length: 10 }, (_, i) => ({
      id: `id${i}`,
      blobUrl: BLOB_URL,
      pathname: PATHNAME,
      description: null,
      searchKeywords: null,
      hasEmbedding: false,
    }))

    const run = deferred.fillNinaAvatarDescribeTargets(USER, targets, 60_000)
    await vi.waitFor(() => expect(inFlight).toBe(deferred.NINA_DEFERRED_DESCRIBE_CONCURRENCY))
    resolveGate()
    await run

    expect(maxInFlight).toBe(deferred.NINA_DEFERRED_DESCRIBE_CONCURRENCY)
  })

  it("one row's failure does not stop the batch", async () => {
    describeNinaImages
      .mockResolvedValueOnce({ description: 'first', completionTokens: 60 })
      .mockRejectedValueOnce(new Error('glm-4.6v overloaded'))
      .mockResolvedValueOnce({ description: 'third', completionTokens: 60 })

    const targets = [0, 1, 2].map((i) => ({
      id: `id${i}`,
      blobUrl: BLOB_URL,
      pathname: PATHNAME,
      description: null,
      searchKeywords: null,
      hasEmbedding: false,
    }))

    const outcome = await deferred.fillNinaAvatarDescribeTargets(USER, targets, 60_000)

    expect(outcome.described).toBe(2)
    expect(outcome.failed).toBe(1)
    expect(fake.queries.filter((q) => q.sql.startsWith('update "nina_avatars"'))).toHaveLength(2)
  })

  it('an embedding failure keeps the prose — the UPDATE writes it with a NULL vector', async () => {
    embedNinaText.mockRejectedValue(new Error('embeddings endpoint down'))
    const targets = [
      {
        id: ID,
        blobUrl: BLOB_URL,
        pathname: PATHNAME,
        description: 'already written',
        searchKeywords: null,
        hasEmbedding: false,
      },
    ]

    const outcome = await deferred.fillNinaAvatarDescribeTargets(USER, targets, 60_000)

    expect(outcome.embedded).toBe(0)
    const update = fake.only()
    expect(update.sql).toContain('update "nina_avatars"')
    expect(update.params).toEqual(['already written', null, USER, ID])
  })

  it('prose + vector is a zero-vendor-call skip', async () => {
    const targets = [
      {
        id: ID,
        blobUrl: BLOB_URL,
        pathname: PATHNAME,
        description: 'already written',
        searchKeywords: null,
        hasEmbedding: true,
      },
    ]

    const outcome = await deferred.fillNinaAvatarDescribeTargets(USER, targets, 60_000)

    expect(outcome.alreadyDone).toBe(1)
    expect(describeNinaImages).not.toHaveBeenCalled()
    expect(embedNinaText).not.toHaveBeenCalled()
    expect(fake.queries).toHaveLength(0)
  })

  it('prose without a vector embeds and does not re-describe', async () => {
    const targets = [
      {
        id: ID,
        blobUrl: BLOB_URL,
        pathname: PATHNAME,
        description: 'already written',
        searchKeywords: null,
        hasEmbedding: false,
      },
    ]

    const outcome = await deferred.fillNinaAvatarDescribeTargets(USER, targets, 60_000)

    expect(describeNinaImages).not.toHaveBeenCalled()
    expect(embedNinaText).toHaveBeenCalledWith('already written', { userId: USER })
    expect(outcome.embedded).toBe(1)
  })

  it('the deadline is a START gate: rows not yet begun are counted as skipped, not attempted', async () => {
    vi.useFakeTimers()
    const start = Date.now()
    let callCount = 0
    describeNinaImages.mockImplementation(async () => {
      callCount++
      // Mid-batch, the wall clock jumps past the budget — simulating a long-running vendor call
      // elsewhere in the batch eating the deadline. This lane's own call is already in flight and
      // is allowed to finish; the NEXT lane's own deadline check must refuse to start.
      vi.setSystemTime(start + deferred.NINA_DEFERRED_DESCRIBE_BUDGET_MS + 1000)
      return { description: 'fresh prose', completionTokens: 60 }
    })

    const targets = [0, 1, 2].map((i) => ({
      id: `id${i}`,
      blobUrl: BLOB_URL,
      pathname: PATHNAME,
      description: null,
      searchKeywords: null,
      hasEmbedding: false,
    }))

    const outcome = await deferred.fillNinaAvatarDescribeTargets(
      USER,
      targets,
      deferred.NINA_DEFERRED_DESCRIBE_BUDGET_MS,
    )

    expect(callCount).toBe(1)
    expect(outcome.described).toBe(1)
    expect(outcome.ranOutOfTime).toBe(2)
  })
})

/* ── scheduleEmbed — the hand-edit's re-earn path, never the vision model ──────────────────── */

describe('scheduleEmbed', () => {
  it('never calls the vision model, including for a NULL description (the cleared box)', async () => {
    deferred.scheduleEmbed(USER, ID)
    expect(afterCallbacks).toHaveLength(1)

    fake.enqueue([describeTargetRow({ description: null })])
    await afterCallbacks[0]?.()

    expect(describeNinaImages).not.toHaveBeenCalled()
    expect(embedNinaText).not.toHaveBeenCalled()
    expect(fake.queries).toHaveLength(1) // the re-read only; nothing to embed
  })

  it('embeds a rewritten description without describing it', async () => {
    deferred.scheduleEmbed(USER, ID)
    fake.enqueue([describeTargetRow({ description: 'the human wrote this', embedded: 0 })])
    fake.enqueue([{ id: ID }]) // setNinaAvatarDescriptionAndEmbedding RETURNING

    await afterCallbacks[0]?.()

    expect(describeNinaImages).not.toHaveBeenCalled()
    expect(embedNinaText).toHaveBeenCalledWith('the human wrote this', { userId: USER })
  })
})

/* ── editNinaAvatarDescriptionAction — prose and a NULL vector, in ONE statement ───────────── */

describe('editNinaAvatarDescriptionAction', () => {
  it('writes the new prose and a NULL vector in ONE statement, then re-earns it', async () => {
    fake.enqueue([avatarRow({ description: 'old words' })]) // getNinaAvatar
    fake.enqueue([{ id: ID }]) // setNinaAvatarDescriptionAndEmbedding RETURNING

    const result = await actions.editNinaAvatarDescriptionAction({
      id: ID,
      description: 'new words',
    })

    expect(result.ok).toBe(true)
    expect(fake.queries).toHaveLength(2)
    const update = fake.last()
    expect(update.sql).toContain('update "nina_avatars"')
    expect(update.params).toEqual(['new words', null, USER, ID])
    expect(afterCallbacks).toHaveLength(1) // scheduleEmbed re-earns it off the clock
  })

  it('clearing the box writes a NULL description and a NULL vector, and schedules nothing', async () => {
    fake.enqueue([avatarRow({ description: 'old words' })])
    fake.enqueue([{ id: ID }])

    const result = await actions.editNinaAvatarDescriptionAction({ id: ID, description: '' })

    expect(result.ok).toBe(true)
    expect(fake.last().params).toEqual([null, null, USER, ID])
    expect(afterCallbacks).toHaveLength(0) // a cleared box must not summon a vendor call
  })
})

/* ── describeNinaAvatarAction — embeds in band ─────────────────────────────────────────────── */

describe('describeNinaAvatarAction embeds in band', () => {
  it('writes description and vector in ONE UPDATE, with nothing deferred', async () => {
    fake.enqueue([avatarRow()]) // getNinaAvatar
    fake.enqueue([{ id: ID }]) // setNinaAvatarDescriptionAndEmbedding RETURNING

    const result = await actions.describeNinaAvatarAction(ID)

    expect(result).toEqual({ ok: true, description: 'fresh prose' })
    expect(afterCallbacks).toHaveLength(0)
    const update = fake.last()
    expect(update.sql).toContain('update "nina_avatars"')
    expect(update.params).toEqual(['fresh prose', JSON.stringify(EMBEDDING), USER, ID])
  })
})

/* ── the backfill route — the gate, the counts, and the re-read ───────────────────────────── */

describe('/api/admin/nina/backfill-descriptions', () => {
  it('refuses before it reads — a non-admin session gets the same 404 the pages give', async () => {
    requireAdminApi.mockRejectedValue(new AdminForbiddenError())

    const res = await route.POST()

    expect(res.status).toBe(404)
    expect(fake.queries).toHaveLength(0)
  })

  it('refuses before it reads — a signed-out caller gets a 401', async () => {
    requireAdminApi.mockRejectedValue(new UnauthorizedError())

    const res = await route.GET()

    expect(res.status).toBe(401)
    expect(fake.queries).toHaveLength(0)
  })

  it('GET spends nothing — one statement, no vendor mock called', async () => {
    fake.enqueue([projectedRow(3, 2)]) // countNinaAvatarDescribeBacklog

    const res = await route.GET()
    const body = (await res.json()) as Record<string, unknown>

    expect(body).toEqual({ ok: true, missingDescription: 3, missingEmbedding: 2, remaining: 5 })
    expect(fake.queries).toHaveLength(1)
    expect(describeNinaImages).not.toHaveBeenCalled()
    expect(embedNinaText).not.toHaveBeenCalled()
  })

  it('POST re-reads `remaining` rather than deriving it — the count runs AFTER the lanes', async () => {
    fake.enqueue([describeTargetRow({ id: ID, description: null })]) // listNinaAvatarDescribeBacklog
    fake.enqueue([{ id: ID }]) // setNinaAvatarDescriptionAndEmbedding RETURNING
    fake.enqueue([projectedRow(1, 0)]) // countNinaAvatarDescribeBacklog, taken AFTER the lanes

    const res = await route.POST()
    const body = (await res.json()) as Record<string, unknown>

    expect(body.remaining).toBe(1)
    expect(fake.queries[0]?.sql).toContain('from "nina_avatars"') // the backlog read, first
    expect(fake.queries.at(-1)?.sql).toContain('count(*)') // the re-read count, last
  })
})

/* ── R2: the combine, the preservation, and the keywords writer ────────────────────────────── */

describe('search_keywords feed the embedding', () => {
  it('embeds description + the labelled keyword line when the row is tagged', async () => {
    const targets = [
      {
        id: ID,
        blobUrl: BLOB_URL,
        pathname: PATHNAME,
        description: 'she is on a beach',
        searchKeywords: 'tete, putih',
        hasEmbedding: false,
      },
    ]

    await deferred.fillNinaAvatarDescribeTargets(USER, targets, 60_000)

    expect(embedNinaText).toHaveBeenCalledWith('she is on a beach\n\nKeywords: tete, putih', {
      userId: USER,
    })
  })

  it('embeds the description ALONE when there are no keywords — the pre-existing vector stays valid', async () => {
    const targets = [
      {
        id: ID,
        blobUrl: BLOB_URL,
        pathname: PATHNAME,
        description: 'she is on a beach',
        searchKeywords: null,
        hasEmbedding: false,
      },
    ]

    await deferred.fillNinaAvatarDescribeTargets(USER, targets, 60_000)

    expect(embedNinaText).toHaveBeenCalledWith('she is on a beach', { userId: USER })
  })

  it('a re-describe reads the keywords, embeds with them, and never writes the column', async () => {
    fake.enqueue([avatarRow({ description: 'old prose', searchKeywords: 'tete, putih' })])
    fake.enqueue([{ id: ID }])

    const result = await actions.describeNinaAvatarAction(ID)

    expect(result.ok).toBe(true)
    expect(embedNinaText).toHaveBeenCalledWith('fresh prose\n\nKeywords: tete, putih', {
      userId: USER,
    })
    const update = fake.last()
    /* Two columns and only two: the operator's tags are structurally out of reach here. */
    expect(update.sql).not.toContain('search_keywords')
    expect(update.params).toEqual(['fresh prose', JSON.stringify(EMBEDDING), USER, ID])
  })
})

describe('editNinaAvatarSearchKeywordsAction', () => {
  it('writes the keywords and a NULL vector in ONE statement, then re-earns it', async () => {
    fake.enqueue([avatarRow({ description: 'she is on a beach', searchKeywords: null })])
    fake.enqueue([{ id: ID }])

    const result = await actions.editNinaAvatarSearchKeywordsAction({
      id: ID,
      searchKeywords: 'tete, putih',
    })

    expect(result.ok).toBe(true)
    const update = fake.last()
    expect(update.sql).toContain('update "nina_avatars"')
    expect(update.sql).toContain('search_keywords')
    expect(update.sql).not.toContain('"description" =')
    expect(update.params).toEqual(['tete, putih', null, USER, ID])
    expect(afterCallbacks).toHaveLength(1)
  })

  it('clearing the box writes NULL keywords and a NULL vector', async () => {
    fake.enqueue([avatarRow({ description: 'she is on a beach', searchKeywords: 'tete' })])
    fake.enqueue([{ id: ID }])

    const result = await actions.editNinaAvatarSearchKeywordsAction({ id: ID, searchKeywords: '  ' })

    expect(result.ok).toBe(true)
    expect(fake.last().params).toEqual([null, null, USER, ID])
  })

  it('a row with no prose schedules nothing — there is no keywords-only vector', async () => {
    fake.enqueue([avatarRow({ description: null, searchKeywords: null })])
    fake.enqueue([{ id: ID }])

    await actions.editNinaAvatarSearchKeywordsAction({ id: ID, searchKeywords: 'tete' })

    expect(afterCallbacks).toHaveLength(0)
  })

  it('refuses a keyword line past the ceiling without touching the row', async () => {
    const result = await actions.editNinaAvatarSearchKeywordsAction({
      id: ID,
      searchKeywords: 'x'.repeat(501),
    })

    expect(result.ok).toBe(false)
    expect(fake.queries).toHaveLength(0)
  })
})
