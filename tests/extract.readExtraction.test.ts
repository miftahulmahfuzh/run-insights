import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { STALE_PENDING_MS } from '@/lib/extract/constants'
import { isStalePending } from '@/lib/extract/readExtraction'
import * as schema from '@/lib/db/schema'
import { installFakeDb, tableRow, uninstallFakeDb, type FakeDb } from './support/fakeDb'

/**
 * The stale-pending self-heal (plan §4.5, R-20) and the shape `GET /api/extract/[id]` returns.
 *
 * Acceptance criteria 9 and 10 live here. `readExtraction.ts` opens with `import 'server-only'`
 * (aliased under Vitest) and reaches the database through `lib/db/queries`, so the fake driver is
 * what makes this testable — and because that driver records the REAL generated SQL, the
 * assertions about the healing UPDATE are assertions about what Postgres would actually receive.
 */

type Reader = typeof import('@/lib/extract/readExtraction')

let fake: FakeDb
let reader: Reader

beforeEach(async () => {
  vi.resetModules()
  fake = installFakeDb()
  reader = await import('@/lib/extract/readExtraction')
})

afterEach(() => {
  uninstallFakeDb()
  vi.resetModules()
})

const BLOB_URLS = [
  {
    url: 'https://x.public.blob.vercel-storage.com/shots/a-b.jpg',
    pathname: 'shots/a-b.jpg',
    kind: 'summary',
  },
  {
    url: 'https://x.public.blob.vercel-storage.com/shots/c-d.jpg',
    pathname: 'shots/c-d.jpg',
    kind: 'splits',
  },
]

/**
 * One `extractions` row in the column order the driver hands back. `tableRow` reads that order
 * from the schema itself, so a future column addition cannot silently shift every field by one.
 */
function row(over: Record<string, unknown> = {}) {
  return tableRow(schema.extractions, {
    id: 'extract01234',
    userId: 'u1',
    blobUrls: BLOB_URLS,
    model: 'glm-4.6v',
    status: 'pending',
    createdAt: new Date().toISOString(),
    ...over,
  })
}

const PHOTO = tableRow(schema.runPhotos, {
  id: 'photo0123456',
  extractionId: 'extract01234',
  runId: null,
  blobUrl: BLOB_URLS[0]!.url,
  pathname: BLOB_URLS[0]!.pathname,
  kind: 'summary',
  width: 560,
  height: 1212,
  bytes: 58_000,
  sortOrder: 0,
})

describe('isStalePending', () => {
  it('is false for a fresh pending row', () => {
    expect(isStalePending('pending', new Date(), Date.now())).toBe(false)
  })

  it('is false right up to the threshold and true just past it', () => {
    const now = 1_000_000_000
    const created = new Date(now - STALE_PENDING_MS)
    expect(isStalePending('pending', created, now)).toBe(false)
    expect(isStalePending('pending', new Date(now - STALE_PENDING_MS - 1), now)).toBe(true)
  })

  it('never touches a row that already reached a terminal state', () => {
    // Healing a completed row would rewrite a real result as a timeout. The status check comes
    // first for exactly that reason.
    const ancient = new Date(Date.now() - STALE_PENDING_MS * 10)
    for (const status of ['ok', 'repaired', 'failed'] as const) {
      expect(isStalePending(status, ancient, Date.now())).toBe(false)
    }
  })
})

describe('readExtractionResult', () => {
  it('returns null for a row that is not this user’s', async () => {
    fake.enqueue([]) // getExtraction finds nothing — the WHERE includes user_id
    expect(await reader.readExtractionResult('u1', 'extract01234')).toBeNull()
    // 404, not 403: the response cannot be used to learn which extraction ids exist.
    expect(fake.only().params).toContain('u1')
  })

  it('reports a pending row as pending, with no session', async () => {
    fake.enqueue([row()], [PHOTO])
    const result = await reader.readExtractionResult('u1', 'extract01234')

    expect(result).toMatchObject({ status: 'pending', session: null, errorCode: null })
    expect(result?.kinds).toEqual(['summary', 'splits'])
    expect(result?.photos).toHaveLength(1)
    // No healing UPDATE for a fresh row: two SELECTs and nothing else.
    expect(fake.queries.every((q) => q.sql.startsWith('select'))).toBe(true)
  })

  it('flips a 90-second-old pending row to failed / stale_timeout on the next read', async () => {
    // Acceptance criterion 10, and the whole reason this heal is inside the poll: no cron exists,
    // and `after()` has no notion of retry. The client is already polling, so this runs for free.
    const stale = new Date(Date.now() - STALE_PENDING_MS - 5_000)
    fake.enqueue(
      [row({ createdAt: stale.toISOString() })], // getExtraction
      [['extract01234']], // failStalePendingExtractions ... returning id
      [PHOTO], // listExtractionPhotos
    )

    const result = await reader.readExtractionResult('u1', 'extract01234')

    expect(result).toMatchObject({ status: 'failed', errorCode: 'stale_timeout', session: null })
    expect(result?.completedAt).not.toBeNull()

    const update = fake.queries.find((q) => q.sql.startsWith('update'))
    expect(update).toBeDefined()
    expect(update!.sql).toContain('"extractions"')
    expect(update!.params).toContain('stale_timeout')
    // Scoped, like every other write in this codebase.
    expect(update!.params).toContain('u1')
  })

  it('leaves the row alone when the healing UPDATE claimed a different id', async () => {
    // `failStalePendingExtractions` closes every stale row for the user, so its return value is
    // the authority on whether THIS row was one of them. Trusting the local age check instead
    // would report `failed` for a row a concurrent request had just completed.
    const stale = new Date(Date.now() - STALE_PENDING_MS - 5_000)
    fake.enqueue([row({ createdAt: stale.toISOString() })], [['someOtherId1']], [PHOTO])

    const result = await reader.readExtractionResult('u1', 'extract01234')
    expect(result?.status).toBe('pending')
  })

  it('returns the pre-validated session for an ok row, without re-parsing anything', async () => {
    // The job stored `parsedSession` at completion time. A pure read cannot disagree with what
    // was written; re-running Zod on every poll could, and "the numbers changed while I was
    // looking at them" is the one thing D1 cannot tolerate.
    const session = { distanceKm: 10.67, splits: [], hrZones: [], postWorkoutHr: [] }
    fake.enqueue(
      [
        row({
          status: 'ok',
          promptTokens: 3277,
          completedAt: new Date().toISOString(),
          rawResponse: { vendor: { anything: true }, parsedSession: session, attempts: 1 },
        }),
      ],
      [PHOTO],
    )

    const result = await reader.readExtractionResult('u1', 'extract01234')
    expect(result?.status).toBe('ok')
    expect(result?.session).toEqual(session)
    expect(result?.promptTokens).toBe(3277)
  })

  it('never exposes a session on a failed row, even if one somehow got written', async () => {
    // Defence in depth around §8.1: `failed` means "F05 renders the blank form". A half-written
    // session leaking through would pre-fill that form with values nothing validated.
    fake.enqueue(
      [
        row({
          status: 'failed',
          errorCode: 'token_floor',
          promptTokens: 141,
          completedAt: new Date().toISOString(),
          rawResponse: { vendor: null, parsedSession: { distanceKm: 5 }, attempts: 1 },
        }),
      ],
      [PHOTO],
    )

    const result = await reader.readExtractionResult('u1', 'extract01234')
    expect(result?.session).toBeNull()
    expect(result?.errorCode).toBe('token_floor')
    // The canary survives onto the DTO, so the UI can say why in concrete terms.
    expect(result?.promptTokens).toBe(141)
  })

  it('returns photos ordered by sort_order — R-45 (amended) depends on it', async () => {
    // The amended R-45 falls back to "whichever photos exist, in sort_order" when the field's own
    // section was never uploaded — which /upload makes the common case, since it accepts 1-3. So
    // the ordering is a contract, not an incidental, and it is enforced in SQL rather than by the
    // caller sorting a list it was handed.
    fake.enqueue([row()], [PHOTO])
    await reader.readExtractionResult('u1', 'extract01234')
    const select = fake.queries.find((q) => q.sql.includes('"run_photos"'))
    expect(select?.sql).toMatch(/order by .*"sort_order"/)
  })

  it('serialises timestamps as ISO strings — a JSON body has no Date', async () => {
    fake.enqueue(
      [row({ status: 'ok', completedAt: new Date().toISOString(), rawResponse: null })],
      [PHOTO],
    )
    const result = await reader.readExtractionResult('u1', 'extract01234')
    expect(typeof result?.createdAt).toBe('string')
    expect(typeof result?.completedAt).toBe('string')
    expect(() => new Date(result!.createdAt).toISOString()).not.toThrow()
  })
})
