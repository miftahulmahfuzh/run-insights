import { readFileSync } from 'node:fs'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { installFakeDb, tableRow, uninstallFakeDb, type FakeDb } from './support/fakeDb'

/**
 * `extractions` is the audit trail and it is APPEND-ONLY (plan D3). Every field a human corrects
 * in review is a labelled extraction failure — model said X, truth was Y, for a known field
 * against a known image. `runs` keeps only the corrected value, so `raw_response` + `corrections`
 * are the only place the model's wrongness survives. Deleting a row throws away the one signal
 * that can tighten the prompt.
 */

type Queries = typeof import('@/lib/db/queries')

let fake: FakeDb
let q: Queries

beforeEach(async () => {
  vi.resetModules()
  fake = installFakeDb()
  q = await import('@/lib/db/queries')
})

afterEach(() => {
  uninstallFakeDb()
  vi.resetModules()
})

describe('append-only, enforced not just documented', () => {
  it('lib/db/queries.ts contains no delete path for extractions', () => {
    const source = readFileSync('lib/db/queries.ts', 'utf8')
    expect(source).not.toMatch(/delete\(\s*extractions\s*\)/)
    // The same grep runs in CI via scripts/check-extractions-append-only.mjs.
  })
})

describe('lifecycle', () => {
  it('createExtraction opens the row as pending, with the blob urls and model', async () => {
    fake.enqueue([])
    const { id } = await q.createExtraction(
      'u1',
      ['https://b/1.jpg', 'https://b/2.jpg'],
      'glm-4.6v',
    )
    expect(id).toHaveLength(12)
    const { sql, params } = fake.only()
    expect(sql).toMatch(/^insert into "extractions"/)
    expect(params).toContain('pending')
    expect(params).toContain('glm-4.6v')
    expect(params).toContain('u1')
  })

  it('markExtractionOk stores the D3 token canary and stamps completed_at', async () => {
    fake.enqueue([['x1']])
    await q.markExtractionOk('u1', 'x1', { distanceKm: 10.67 }, 1737)
    const { sql, params } = fake.only()
    expect(sql).toMatch(/^update "extractions"/)
    expect(sql).toContain('"prompt_tokens"')
    expect(sql).toContain('"completed_at"')
    expect(params).toContain('ok')
    expect(params).toContain(1737)
    expect(sql).toContain('"user_id" = $')
  })

  it('markExtractionRepaired is a distinct status from ok — a repair is a prompt signal', async () => {
    fake.enqueue([['x1']])
    await q.markExtractionRepaired('u1', 'x1', {}, 1737)
    expect(fake.only().params).toContain('repaired')
  })

  it('markExtractionFailed records an error code', async () => {
    fake.enqueue([['x1']])
    await q.markExtractionFailed('u1', 'x1', 'TOKEN_FLOOR')
    const { params } = fake.only()
    expect(params).toContain('failed')
    expect(params).toContain('TOKEN_FLOOR')
  })

  it('every mark throws NotFoundError for someone else’s extraction', async () => {
    fake.enqueue([])
    await expect(q.markExtractionOk('u2', 'x1', {}, 1)).rejects.toBeInstanceOf(q.NotFoundError)
  })

  it('failStalePendingExtractions closes out rows a dead background job abandoned', async () => {
    // R-20: a job killed mid-flight (deploy, cold-start eviction, the 55 s soft deadline) leaves
    // its row pending forever and the upload screen polls it until the end of time.
    fake.enqueue([['x1'], ['x2']])
    const ids = await q.failStalePendingExtractions('u1', new Date('2026-08-20T00:00:00Z'))
    expect(ids).toEqual(['x1', 'x2'])
    const { sql, params } = fake.only()
    expect(sql).toContain('"status" = $')
    expect(sql).toContain('"created_at" <')
    expect(params).toContain('pending')
    expect(params).toContain('STALE_PENDING')
  })

  it('getExtraction is user-scoped and returns null when absent', async () => {
    fake.enqueue([])
    await expect(q.getExtraction('u1', 'x1')).resolves.toBeNull()
    expect(fake.only().sql).toContain('"extractions"."user_id" = $')
  })

  it('listExtractions is newest-first and can filter by status', async () => {
    fake.enqueue([])
    await q.listExtractions('u1', { status: 'pending', limit: 5 })
    const { sql, params } = fake.only()
    expect(sql).toContain('order by "extractions"."created_at" desc')
    expect(params).toContain('pending')
    expect(params).toContain(5)
  })
})

describe('corrections (R-7)', () => {
  it('writes the whole array-per-field object — F05 merges, F03 stores', async () => {
    fake.enqueue([['x1']])
    await q.recordCorrections('u1', 'x1', {
      distanceM: [
        { from: 10600, to: 10670, phase: 'review', correctedAt: '2026-08-20T12:00:00.000Z' },
      ],
      'splits.0.timeSec': [
        {
          from: 401,
          to: 402,
          phase: 'post-review-edit',
          checkId: 'splits-sum',
          correctedAt: '2026-08-21T01:00:00.000Z',
        },
      ],
    })
    const { sql, params } = fake.only()
    expect(sql).toMatch(/^update "extractions" set "corrections"/)
    expect(sql).toContain('"user_id" = $')
    const payload = JSON.parse(String(params[0]))
    // An ARRAY per field, not an object: correcting the same field twice must not erase the
    // first edit, and R-8's post-review editing makes that a normal occurrence.
    expect(Array.isArray(payload.distanceM)).toBe(true)
    expect(payload['splits.0.timeSec'][0].phase).toBe('post-review-edit')
  })

  it('throws NotFoundError instead of silently writing nothing', async () => {
    fake.enqueue([])
    await expect(q.recordCorrections('u2', 'x1', {})).rejects.toBeInstanceOf(q.NotFoundError)
  })
})

describe('getExtractionErrorProfile', () => {
  it('expands the jsonb object with jsonb_each and scopes BOTH queries by user_id', async () => {
    fake.enqueue([])
    await q.getExtractionErrorProfile('u1')
    const { sql, params } = fake.only()
    expect(sql).toContain('jsonb_each')
    // The correlated denominator subquery is a second place the scope can be forgotten.
    expect(sql.match(/"extractions"\."user_id" = \$/g)?.length).toBeGreaterThanOrEqual(2)
    expect(params.filter((p) => p === 'u1')).toHaveLength(2)
  })

  it('counts EVENTS per field, tolerating a pre-R-7 object-shaped row', async () => {
    // jsonb_array_length raises on a non-array, which would take the whole query down for one
    // legacy row; the jsonb_typeof guard counts it as a single event instead.
    expect((await import('node:fs')).readFileSync('lib/db/queries.ts', 'utf8')).toContain(
      "jsonb_typeof(kv.value) = 'array'",
    )
    fake.enqueue([
      {
        field: 'distanceM',
        correction_count: '3',
        extraction_count: '2',
        extractions_with_corrections: '5',
      },
    ])
    const profile = await q.getExtractionErrorProfile('u1')
    expect(profile).toEqual([
      {
        field: 'distanceM',
        correctionCount: 3,
        extractionCount: 2,
        extractionsWithCorrections: 5,
      },
    ])
  })

  it('orders by frequency, because the point is which field to fix first', async () => {
    fake.enqueue([])
    await q.getExtractionErrorProfile('u1')
    expect(fake.only().sql).toContain('order by correction_count desc')
  })
})

describe('photos, R-1’s two-parent lifecycle', () => {
  it('attachExtractionPhotos proves extraction ownership first, then inserts', async () => {
    fake.enqueue([[1]], [])
    const { ids } = await q.attachExtractionPhotos('u1', 'x1', [
      { blobUrl: 'https://b/1.jpg', pathname: '1.jpg', kind: 'summary' },
      { blobUrl: 'https://b/2.jpg', pathname: '2.jpg', kind: 'splits' },
    ])
    expect(ids).toHaveLength(2)
    expect(fake.sqlAt(0)).toContain('from "extractions"')
    expect(fake.sqlAt(1)).toMatch(/^insert into "run_photos"/)
    // run_id is left at DEFAULT (null) — there is no run to point at yet (R-1); the review
    // commit backfills it.
    expect(fake.sqlAt(1)).toMatch(/values \(\$1, \$2, default,/)
  })

  it('defaults sort_order to upload order, so the strip matches what the user picked', async () => {
    fake.enqueue([[1]], [])
    await q.attachExtractionPhotos('u1', 'x1', [
      { blobUrl: 'a', pathname: 'a', kind: 'summary' },
      { blobUrl: 'b', pathname: 'b', kind: 'splits' },
      { blobUrl: 'c', pathname: 'c', kind: 'heartrate' },
    ])
    const { params } = fake.queries[1]!
    expect(params).toContain(0)
    expect(params).toContain(1)
    expect(params).toContain(2)
  })

  it('writes nothing at all for an empty photo list', async () => {
    fake.enqueue([[1]])
    const { ids } = await q.attachExtractionPhotos('u1', 'x1', [])
    expect(ids).toEqual([])
    expect(fake.queries).toHaveLength(1)
  })

  it('listExtractionPhotos scopes through the extraction and orders by sort_order', async () => {
    const { runPhotos } = await import('@/lib/db/schema')
    fake.enqueue([tableRow(runPhotos, { id: 'p1', extractionId: 'x1' })])
    const photos = await q.listExtractionPhotos('u1', 'x1')
    expect(photos).toHaveLength(1)
    const { sql } = fake.only()
    expect(sql).toContain('"extractions"."user_id" = $')
    expect(sql).toContain('order by "run_photos"."sort_order"')
  })
})
