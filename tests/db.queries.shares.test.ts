import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { installFakeDb, tableRow, uninstallFakeDb, type FakeDb } from './support/fakeDb'

/**
 * `/s/[token]` is the one place in the app that answers to somebody with no account, so its query
 * is the one place a leak has no second line of defence. These tests assert what the returned
 * object CANNOT contain — by key, not by value — because the realistic regression is a future
 * `select()` with no column list quietly widening the projection to the whole `runs` row.
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

describe('createShare', () => {
  it('proves ownership before minting a token', async () => {
    fake.enqueue([]) // assertRunOwned finds nothing
    await expect(q.createShare('u2', 'run_of_u1')).rejects.toBeInstanceOf(q.NotFoundError)
    expect(fake.queries).toHaveLength(1)
  })

  it('mints a 16-character token (roadmap D9: nanoid(16), 96 bits)', async () => {
    fake.enqueue([[1]], [], [])
    const { token } = await q.createShare('u1', 'r1')
    expect(token).toHaveLength(16)
    expect(token).toMatch(/^[0-9A-Za-z_-]{16}$/)
  })

  it('returns the existing live token when the Share button is pressed twice', async () => {
    const { shares } = await import('@/lib/db/schema')
    fake.enqueue([[1]], [tableRow(shares, { token: 'existingtoken123', runId: 'r1' })])
    const { token } = await q.createShare('u1', 'r1')
    expect(token).toBe('existingtoken123')
    // No second INSERT: the partial unique index would refuse it anyway, and a 500 is not the
    // right answer to a double tap.
    expect(fake.queries.some((x) => x.sql.startsWith('insert into "shares"'))).toBe(false)
  })
})

describe('revokeShare', () => {
  it('is a soft delete, so re-sharing can mint a fresh token (R-15)', async () => {
    fake.enqueue([['t1']])
    await q.revokeShare('u1', 't1')
    const { sql } = fake.only()
    expect(sql).toMatch(/^update "shares" set "revoked_at"/)
    expect(sql).not.toContain('delete')
    expect(sql).toContain('"user_id" = $')
    expect(sql).toContain('"revoked_at" is null') // idempotent: re-revoking is a no-op, not a lie
  })

  it('throws NotFoundError for a token that is not yours', async () => {
    fake.enqueue([])
    await expect(q.revokeShare('u2', 't1')).rejects.toBeInstanceOf(q.NotFoundError)
  })
})

describe('getActiveShareForRun', () => {
  it('filters on run, user AND revoked_at is null', async () => {
    fake.enqueue([])
    await q.getActiveShareForRun('u1', 'r1')
    const { sql } = fake.only()
    expect(sql).toContain('"run_id" = $')
    expect(sql).toContain('"user_id" = $')
    expect(sql).toContain('"revoked_at" is null')
  })
})

describe('getRunByShareToken — THE one unscoped read', () => {
  const sharedRow = [
    'r1', // id
    '2026-08-20', // occurredOn
    '05:12:00', // startedAt
    'Outdoor Run', // activityType
    'Tangerang', // location
    10670, // distanceM
    4716, // durationSec
    442, // avgPaceSec
    173, // avgHr
    189, // maxHr
    15, // elevationM
    646, // activeKcal
    144, // avgCadence
    'Miftah', // ownerName
  ]

  it('takes no userId — the 96-bit token IS the credential (roadmap D9)', () => {
    expect(q.getRunByShareToken.length).toBe(1)
  })

  it('returns null for an unknown token', async () => {
    fake.enqueue([], [], [], [], [])
    await expect(q.getRunByShareToken('nosuchtoken12345')).resolves.toBeNull()
  })

  it('returns null for a revoked token, by filtering revoked_at in the query itself', async () => {
    fake.enqueue([], [], [], [], [])
    await q.getRunByShareToken('revokedtoken1234')
    expect(fake.sqlAt(0)).toContain('"revoked_at" is null')
  })

  it('never selects note, user_id or extraction internals — asserted on the KEYS', async () => {
    fake.enqueue([sharedRow], [], [], [], [])
    const shared = await q.getRunByShareToken('livetoken1234567')
    expect(shared).not.toBeNull()
    const keys = Object.keys(shared!)
    for (const forbidden of [
      'userId',
      'note',
      'extractionId',
      'reviewedAt',
      'correctedAt',
      'restingHr',
      'intent',
      'createdAt',
      'updatedAt',
    ]) {
      expect(keys, forbidden).not.toContain(forbidden)
    }
    expect(keys.sort()).toEqual(
      [
        'id',
        'occurredOn',
        'startedAt',
        'activityType',
        'location',
        'distanceM',
        'durationSec',
        'avgPaceSec',
        'avgHr',
        'maxHr',
        'elevationM',
        'activeKcal',
        'avgCadence',
        'ownerName',
        'splits',
        'zones',
        'photos',
        'insightPayload',
      ].sort(),
    )
  })

  it('does not leak the owner’s email — only their display name', async () => {
    fake.enqueue([sharedRow], [], [], [], [])
    await q.getRunByShareToken('livetoken1234567')
    expect(fake.sqlAt(0)).toContain('"user"."name"')
    expect(fake.sqlAt(0)).not.toContain('"email"')
  })

  it('reads all five statements in one batch, correlated by the token', async () => {
    fake.enqueue([sharedRow], [], [], [], [])
    await q.getRunByShareToken('livetoken1234567')
    expect(fake.batches).toEqual([5])
    // The child selects derive the run id from the token via a subquery — the caller never gets
    // to name a run id, so a token for run A cannot be used to read run B's splits.
    expect(fake.sqlAt(1)).toContain('from "shares"')
    expect(fake.sqlAt(2)).toContain('from "shares"')
  })

  it('R-11: honours the per-photo opt-out inside the query, not in the page', async () => {
    fake.enqueue([sharedRow], [], [], [], [])
    await q.getRunByShareToken('livetoken1234567')
    expect(fake.sqlAt(3)).toContain('"excluded_from_share" = $')
  })

  it('R-11: hands back the frozen session insight payload, newest first', async () => {
    fake.enqueue([sharedRow], [], [], [], [[{ headline: 'Zone 5 for 90% of it' }, new Date()]])
    const shared = await q.getRunByShareToken('livetoken1234567')
    expect(shared?.insightPayload).toEqual({ headline: 'Zone 5 for 90% of it' })
    expect(fake.sqlAt(4)).toContain('order by "insights"."created_at" desc')
    // The payload is read, never regenerated: /s/[token] must not call resolveHrMax live.
    expect(fake.sqlAt(4)).toContain('"scope" = $')
  })

  it('returns null insightPayload when no insight was ever generated', async () => {
    fake.enqueue([sharedRow], [], [], [], [])
    const shared = await q.getRunByShareToken('livetoken1234567')
    expect(shared?.insightPayload).toBeNull()
  })

  it('is one of exactly four exported functions that do not take userId first', async () => {
    const source = (await import('node:fs')).readFileSync('lib/db/queries.ts', 'utf8')
    const exported = [...source.matchAll(/export (?:async )?function (\w+)\(([^)]*)/g)]
    const unscoped = exported
      .filter(([, , args]) => !/^\s*userId/.test(args ?? ''))
      .map(([, name]) => name)
    /*
     * Two of these touch no database at all (`fillZeroMonths` is pure, `isUniqueViolation` is a
     * predicate over an error object), so the unscoped READS are two:
     *
     *   · `getRunByShareToken` — roadmap D9, where the token IS the credential;
     *   · `listActiveUserIds`  — F07's cron, which has no session and whose whole job is to
     *     enumerate users. It returns ids and nothing else, and every read inside the cron's loop
     *     is scoped to one of them.
     *
     * A FIFTH name appearing here is the thing to argue about in review — see
     * `scripts/check-data-layer-invariants.mjs`, which fails CI on the same list.
     */
    expect(unscoped.sort()).toEqual([
      'fillZeroMonths',
      'getRunByShareToken',
      'isUniqueViolation',
      'listActiveUserIds',
    ])
  })
})
