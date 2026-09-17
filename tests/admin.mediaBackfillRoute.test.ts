import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { installFakeDb, projectedRow, uninstallFakeDb, type FakeDb } from './support/fakeDb'

/**
 * `media-album-unified-search` phase 4's route: `/api/admin/nina/backfill-media-descriptions`.
 *
 * Posture is `tests/admin.albumDescribeEmbed.test.ts`'s route block, one table over: the real
 * `listNinaMessageImageDescribeBacklog` / `countNinaMessageImageDescribeBacklog` /
 * `fillNinaMessageImageDescribeTargets` run against the recording driver, so the assertions are
 * about GENERATED SQL and execution order rather than about spies. Only the edges are mocked —
 * `requireAdminApi`, `next/server`'s `after`, `@/lib/nina/vision` and `@/lib/nina/embedding`.
 *
 * The album route has its own suite and is not re-tested here.
 */

const USER = 'usr123XYZ_-9'
const ID = 'img123XYZ_-9'
const STORE = 'https://abc123store.public.blob.vercel-storage.com'
const PATHNAME = `nina/${USER}/selfie-${ID}-Tu6HvWq2m0k3rB8nQ1zXeRfYdGjL.jpg`
const BLOB_URL = `${STORE}/${PATHNAME}`
/** A stand-in vector. Its length is irrelevant here; only its identity is asserted. */
const EMBEDDING = [0.1, 0.2, 0.3]

const requireAdminApi = vi.fn()
const describeNinaImages = vi.fn()
const embedNinaText = vi.fn()

class AdminForbiddenError extends Error {}
class UnauthorizedError extends Error {}

vi.mock('@/lib/admin/requireAdmin', () => ({
  requireAdmin: vi.fn(),
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
    void cb
  },
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/nina/vision', () => ({
  describeNinaImages: (...args: unknown[]) => describeNinaImages(...args),
}))
vi.mock('@/lib/nina/embedding', () => ({
  embedNinaText: (...args: unknown[]) => embedNinaText(...args),
}))

type Route = typeof import('@/app/api/admin/nina/backfill-media-descriptions/route')
let route: Route
let fake: FakeDb

/**
 * Phase 2's `imageDescribeTargetColumns` in projection order — SEVEN values. The album twin has six;
 * the extra one is `kind`, which is what lets the media worker pick the vision witness per row.
 */
function describeTargetRow(overrides: Record<string, unknown> = {}): unknown[] {
  return projectedRow(
    'id' in overrides ? overrides.id : ID,
    'blobUrl' in overrides ? overrides.blobUrl : BLOB_URL,
    'pathname' in overrides ? overrides.pathname : PATHNAME,
    'kind' in overrides ? overrides.kind : 'generated',
    'description' in overrides ? overrides.description : null,
    'searchKeywords' in overrides ? overrides.searchKeywords : null,
    'embedded' in overrides ? overrides.embedded : 0,
  )
}

beforeEach(async () => {
  vi.resetModules()
  requireAdminApi.mockReset().mockResolvedValue({ userId: USER, email: 'ops@example.com' })
  describeNinaImages
    .mockReset()
    .mockResolvedValue({ description: 'fresh prose', completionTokens: 60 })
  embedNinaText.mockReset().mockResolvedValue(EMBEDDING)
  fake = installFakeDb()
  route = await import('@/app/api/admin/nina/backfill-media-descriptions/route')
})

afterEach(() => {
  vi.useRealTimers()
  uninstallFakeDb()
  vi.resetModules()
})

/* ── the gate, and it runs before anything is read ─────────────────────────────────────────── */

describe('/api/admin/nina/backfill-media-descriptions — the gate', () => {
  it('refuses before it reads — a signed-in non-admin gets the same 404 the pages give', async () => {
    requireAdminApi.mockRejectedValue(new AdminForbiddenError())

    const res = await route.POST()

    expect(res.status).toBe(404)
    expect(fake.queries).toHaveLength(0)
    expect(embedNinaText).not.toHaveBeenCalled()
  })

  it('refuses before it reads — a signed-out caller gets a 401, not a redirect to HTML', async () => {
    requireAdminApi.mockRejectedValue(new UnauthorizedError())

    const res = await route.GET()

    expect(res.status).toBe(401)
    expect(fake.queries).toHaveLength(0)
  })

  it('declares the 300 s ceiling as a literal, so segment config can be statically analysed', () => {
    expect(route.maxDuration).toBe(300)
  })
})

/* ── GET: two counts, one statement, no vendor call ───────────────────────────────────────── */

describe('GET', () => {
  it('spends nothing — one statement, neither vendor mock called', async () => {
    fake.enqueue([projectedRow(3, 2)]) // countNinaMessageImageDescribeBacklog

    const res = await route.GET()
    const body = (await res.json()) as Record<string, unknown>

    expect(body).toEqual({ ok: true, missingDescription: 3, missingEmbedding: 2, remaining: 5 })
    expect(fake.queries).toHaveLength(1)
    expect(describeNinaImages).not.toHaveBeenCalled()
    expect(embedNinaText).not.toHaveBeenCalled()
  })

  it('counts the MEDIA table, and excludes a reference row from the backlog', async () => {
    fake.enqueue([projectedRow(0, 0)])

    await route.GET()

    const count = fake.only()
    expect(count.sql).toContain('from "nina_message_images"')
    expect(count.sql).not.toContain('"nina_avatars"')
    /*
     * The `isOriginalPhoto()` arm, asserted as a PRESENCE. Without it the 43 reference rows this
     * table holds (measured 2026-09-17) would be permanent, unfixable backlog: the merged search
     * ranks the original a reference re-shows, never the re-show, so a reference can never earn a
     * vector of its own. This assertion is the whole reason the count can reach zero.
     */
    expect(count.sql).toContain('"source_avatar_id" is null')
    expect(count.sql).toContain('"source_image_id" is null')
  })
})

/* ── POST: the slice, the lanes, and the re-read ──────────────────────────────────────────── */

describe('POST', () => {
  it('re-reads `remaining` rather than deriving it — the count runs AFTER the lanes', async () => {
    fake.enqueue([describeTargetRow({ description: 'already written', embedded: 0 })]) // backlog
    fake.enqueue([{ id: ID }]) // setNinaMessageImageDescriptionAndEmbedding RETURNING
    fake.enqueue([projectedRow(1, 0)]) // the count, taken AFTER the lanes

    const res = await route.POST()
    const body = (await res.json()) as Record<string, unknown>

    expect(body.remaining).toBe(1)
    expect(fake.queries[0]?.sql).toContain('from "nina_message_images"') // the backlog read, first
    expect(fake.queries.at(-1)?.sql).toContain('count(*)') // the re-read count, last
  })

  it('embeds a row that already has prose, and never asks the vision model', async () => {
    /*
     * This is the shape of the ENTIRE backlog as it exists today: measured 2026-09-17, all 112
     * original media rows carry `glm-4.6v` prose from `scheduleChatPhotoCaption` and none lacks it.
     * A full drain is therefore embeddings only — no vision spend, no token-floor exposure.
     */
    fake.enqueue([describeTargetRow({ description: 'she is underwater in fins', embedded: 0 })])
    fake.enqueue([{ id: ID }])
    fake.enqueue([projectedRow(0, 0)])

    const res = await route.POST()
    const body = (await res.json()) as Record<string, unknown>

    expect(describeNinaImages).not.toHaveBeenCalled()
    expect(embedNinaText).toHaveBeenCalledWith('she is underwater in fins', { userId: USER })
    expect(body.remaining).toBe(0)
    expect(body.described).toBe(0)
    expect(body.embedded).toBe(1)
  })

  it('reports a drained backlog as exactly zero, which is the operator loop condition', async () => {
    fake.enqueue([]) // nothing left to do
    fake.enqueue([projectedRow(0, 0)])

    const res = await route.POST()
    const body = (await res.json()) as Record<string, unknown>

    expect(body).toMatchObject({
      ok: true,
      remaining: 0,
      missingDescription: 0,
      missingEmbedding: 0,
    })
    expect(describeNinaImages).not.toHaveBeenCalled()
    expect(embedNinaText).not.toHaveBeenCalled()
  })

  it('the backlog read is the MEDIA table, capped by the media slice constant', async () => {
    fake.enqueue([])
    fake.enqueue([projectedRow(0, 0)])

    await route.POST()

    const read = fake.queries[0]
    expect(read?.sql).toContain('from "nina_message_images"')
    expect(read?.sql).toContain('"source_avatar_id" is null')
    expect(read?.sql).toContain('"source_image_id" is null')
    /* oldest-first, so a repeated slice is monotone and carries no cursor */
    expect(read?.sql).toContain('order by')
    expect(read?.params).toContain(200)
  })
})
