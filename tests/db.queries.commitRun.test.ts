import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { installFakeDb, uninstallFakeDb, type FakeDb } from './support/fakeDb'

/**
 * R-1 and R-5 together: the review commit is the ONLY place a `runs` row is born, and the
 * duplicate-upload guard is a functional unique index that fires there.
 *
 * Why R-1 matters enough to test the shape and not just the result: F05's original design created
 * a placeholder `runs` row at upload so `run_photos.run_id NOT NULL` had somewhere to attach.
 * `occurred_on` is NOT NULL and unknown at upload, so the placeholder needs a placeholder date —
 * and the R-5 index then rejects the SECOND upload of any day. Two weekend runs, one broken app.
 */

type Queries = typeof import('@/lib/db/queries')

let fake: FakeDb
let q: Queries

const INPUT = {
  occurredOn: '2026-08-20',
  startedAt: '05:12:00',
  endedAt: '06:30:36',
  activityType: 'Outdoor Run',
  location: 'Tangerang',
  durationSec: 4716,
  distanceM: 10670,
  activeKcal: 646,
  totalKcal: 780,
  elevationM: 15,
  avgCadence: 144,
  avgPaceSec: 442,
  avgHr: 173,
  maxHr: 189,
  restingHr: 72,
  intent: 'easy' as const,
  endHrBpm: 185,
  hr1MinPostBpm: 162,
  note: null,
  source: 'screenshot' as const,
  extractionId: 'x1',
  splits: [
    { km: 1, timeSec: 401, paceSec: 401, hr: 150, cadence: 152, partial: false },
    { km: 11, timeSec: 268, paceSec: 400, hr: 180, cadence: 134, partial: true },
  ],
  zones: [{ zone: 5, durationSec: 1200, minBpm: 173, maxBpm: null }],
}

beforeEach(async () => {
  vi.resetModules()
  fake = installFakeDb()
  q = await import('@/lib/db/queries')
})

afterEach(() => {
  uninstallFakeDb()
  vi.resetModules()
})

describe('commitExtractedRun', () => {
  it('inserts the run ALREADY REVIEWED — a stored run is a confirmed run (D1)', async () => {
    fake.enqueue([[1]]) // assertExtractionOwned
    fake.enqueue([], [], [], [])

    await q.commitExtractedRun('u1', INPUT)

    const insert = fake.queries.find((x) => x.sql.startsWith('insert into "runs"'))
    expect(insert).toBeDefined()
    expect(insert!.sql).toContain('"reviewed_at"')
    // A Date, not null: the commit is the review.
    expect(insert!.params.some((p) => p instanceof Date || typeof p === 'string')).toBe(true)
  })

  it('writes run, splits, zones and the photo backfill in ONE batch', async () => {
    fake.enqueue([[1]])
    fake.enqueue([], [], [], [])

    await q.commitExtractedRun('u1', INPUT)

    // 1 ownership check outside the batch, then one batch of 4.
    expect(fake.batches).toEqual([4])
    const batched = fake.queries.filter((x) => x.batched)
    expect(batched).toHaveLength(4)
    expect(batched[0]!.sql).toMatch(/^insert into "runs"/)
    expect(batched[1]!.sql).toMatch(/^insert into "run_splits"/)
    expect(batched[2]!.sql).toMatch(/^insert into "run_zones"/)
    expect(batched[3]!.sql).toMatch(/^update "run_photos"/)
  })

  it('R-1: backfills run_photos.run_id from the extraction, only for unclaimed photos', async () => {
    fake.enqueue([[1]])
    fake.enqueue([], [], [], [])

    await q.commitExtractedRun('u1', INPUT)

    const backfill = fake.queries.find((x) => x.sql.startsWith('update "run_photos"'))!
    expect(backfill.sql).toContain('"extraction_id" = $')
    // "and run_id is null" is what stops a re-commit stealing photos from an earlier run.
    expect(backfill.sql).toContain('"run_id" is null')
  })

  it('proves ownership of the extraction BEFORE writing anything', async () => {
    fake.enqueue([]) // ownership check finds nothing
    await expect(q.commitExtractedRun('u1', INPUT)).rejects.toBeInstanceOf(q.NotFoundError)
    // Nothing was written.
    expect(fake.batches).toEqual([])
    expect(fake.queries).toHaveLength(1)
  })

  it('skips the splits and zones statements when there are none, rather than inserting empty', async () => {
    fake.enqueue([[1]])
    fake.enqueue([], [])
    await q.commitExtractedRun('u1', { ...INPUT, splits: [], zones: [] })
    expect(fake.batches).toEqual([2]) // run insert + photo backfill
  })

  it('needs no extraction at all for a manual entry', async () => {
    fake.enqueue([], [], [])
    await q.commitExtractedRun('u1', { ...INPUT, source: 'manual', extractionId: null })
    // No ownership check, no photo backfill.
    expect(fake.queries.some((x) => x.sql.includes('from "extractions"'))).toBe(false)
    expect(fake.queries.some((x) => x.sql.startsWith('update "run_photos"'))).toBe(false)
  })
})

describe('the R-5 duplicate guard', () => {
  it('turns SQLSTATE 23505 into DuplicateRunError carrying the existing run id', async () => {
    fake.enqueue([[1]]) // ownership ok
    const boom = Object.assign(new Error('duplicate key value violates unique constraint'), {
      code: '23505',
    })
    const { db } = await import('@/lib/db/index')
    vi.spyOn(db, 'batch').mockRejectedValueOnce(boom)
    fake.enqueue([['run_existing']]) // findRunByOccurredAndStarted

    const error = await q.commitExtractedRun('u1', INPUT).catch((e: unknown) => e)

    expect(error).toBeInstanceOf(q.DuplicateRunError)
    expect((error as InstanceType<Queries['DuplicateRunError']>).existingRunId).toBe('run_existing')
  })

  it('finds the colliding run with the same coalesce expression the index uses', async () => {
    fake.enqueue([[1]])
    const { db } = await import('@/lib/db/index')
    vi.spyOn(db, 'batch').mockRejectedValueOnce(Object.assign(new Error('dup'), { code: '23505' }))
    fake.enqueue([])

    const error = await q.commitExtractedRun('u1', { ...INPUT, startedAt: null }).catch((e) => e)

    expect(error).toBeInstanceOf(q.DuplicateRunError)
    const lookup = fake.last()
    expect(lookup.sql).toContain('coalesce')
    expect(lookup.sql).toContain("'00:00:00'::time")
    expect(lookup.sql).toContain('"runs"."user_id" = $') // scoped, always
  })

  it('DuplicateRunError.existingRunId is null when the collision cannot be resolved', async () => {
    fake.enqueue([[1]])
    const { db } = await import('@/lib/db/index')
    vi.spyOn(db, 'batch').mockRejectedValueOnce(Object.assign(new Error('dup'), { code: '23505' }))
    fake.enqueue([])

    const error = await q.commitExtractedRun('u1', INPUT).catch((e: unknown) => e)
    expect((error as InstanceType<Queries['DuplicateRunError']>).existingRunId).toBeNull()
  })

  it('re-throws anything that is not a unique violation', async () => {
    fake.enqueue([[1]])
    const { db } = await import('@/lib/db/index')
    vi.spyOn(db, 'batch').mockRejectedValueOnce(
      Object.assign(new Error('connection reset'), { code: '08006' }),
    )
    await expect(q.commitExtractedRun('u1', INPUT)).rejects.toThrow(/connection reset/)
  })

  it('isUniqueViolation unwraps a nested cause, because drivers wrap', () => {
    expect(q.isUniqueViolation({ code: '23505' })).toBe(true)
    expect(q.isUniqueViolation({ cause: { code: '23505' } })).toBe(true)
    expect(q.isUniqueViolation({ cause: { cause: { code: '23505' } } })).toBe(true)
    expect(q.isUniqueViolation({ code: '23502' })).toBe(false)
    expect(q.isUniqueViolation(new Error('nope'))).toBe(false)
    expect(q.isUniqueViolation(null)).toBe(false)
    const cyclic: Record<string, unknown> = {}
    cyclic.cause = cyclic
    expect(q.isUniqueViolation(cyclic)).toBe(false) // terminates
  })
})

describe('the migration SQL, not just the schema object', () => {
  const migrationSql = (() => {
    const dir = join(process.cwd(), 'drizzle')
    const file = readdirSync(dir)
      .filter((name) => name.endsWith('.sql'))
      .sort()[0]
    return readFileSync(join(dir, file!), 'utf8')
  })()

  it('ships the dedupe guard as a unique index over coalesce(started_at, ...)', () => {
    // Asserted against the APPLIED artefact: a schema object that says coalesce and a migration
    // that says otherwise would leave production unguarded.
    expect(migrationSql).toMatch(
      /CREATE UNIQUE INDEX "runs_user_occurred_started_unq" ON "runs".*coalesce\("started_at", '00:00:00'::time\)/,
    )
  })

  it('ships the share index as a PARTIAL unique index, so revoke-then-reshare works', () => {
    expect(migrationSql).toMatch(
      /CREATE UNIQUE INDEX "shares_run_id_active_unq" ON "shares".*WHERE .*"revoked_at" is null/,
    )
  })

  it('ships badges.run_id as SET NULL and every other app FK as cascade (R-22)', () => {
    expect(migrationSql).toContain(
      'ALTER TABLE "badges" ADD CONSTRAINT "badges_run_id_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."runs"("id") ON DELETE set null',
    )
    const setNulls = migrationSql.match(/ON DELETE set null/g) ?? []
    expect(setNulls).toHaveLength(1)
  })

  it('ships run_photos.run_id nullable and extraction_id NOT NULL (R-1)', () => {
    const table = migrationSql.slice(
      migrationSql.indexOf('CREATE TABLE "run_photos"'),
      migrationSql.indexOf('CREATE TABLE "run_splits"'),
    )
    expect(table).toContain('"extraction_id" text NOT NULL')
    expect(table).toMatch(/"run_id" text,/)
    expect(table).toContain('"excluded_from_share" boolean DEFAULT false NOT NULL')
  })

  it('ships every measured column as integer, and only weight_kg as numeric', () => {
    const numerics = migrationSql.match(/numeric\([^)]*\)/g) ?? []
    expect(numerics).toHaveLength(1)
    expect(migrationSql).toContain('"weight_kg" numeric(4, 1)')
    expect(migrationSql).not.toMatch(
      /"(distance_m|duration_sec|avg_pace_sec)" (real|numeric|double)/,
    )
  })
})
