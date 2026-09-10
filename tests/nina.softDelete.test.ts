import { readFileSync } from 'node:fs'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ninaImageDailyCap } from '@/lib/nina/imagerecipe'
import { installFakeDb, uninstallFakeDb, type FakeDb } from './support/fakeDb'

/**
 * **R2's contract, asserted against generated SQL rather than against a spy.**
 *
 * A soft delete is only worth anything if EVERY reader agrees about what the flag means, and a spy
 * cannot tell "the function was called" from "the predicate was in the WHERE". So this file
 * installs the recording driver and reads the statements.
 *
 * Three properties, and the second is the one most likely to rot:
 *
 *   1. Every read that describes a job to a human, or that schedules work on one, carries
 *      `deleted_at is null`. EIGHT functions, NINE statements — the eighth is
 *      `reopenNinaImageJob`, R1's redo, which is a read that SCHEDULES.
 *   2. `countNinaTurnsSince` — the daily image cap — carries NO such predicate, deliberately. The
 *      cap is a money cap; hiding a row does not un-spend $0.04. The assertion is written as an
 *      ABSENCE on purpose: a future "consistency" cleanup that adds the filter here turns one tap
 *      into a quota refund, and this is the only thing that would notice.
 *   3. The write is an UPDATE that touches nothing but the flag. `nina_turns` is the money ledger.
 *
 * Deliberately NOT in `tests/nina.jobActions.test.ts`. That file does NOT mock
 * `@/lib/nina/imagejobs` — it runs it for real — but it does install its own
 * `vi.mock('@/lib/db', …)`, a hand-rolled thenable that returns rows and records no SQL.
 * `installFakeDb()` works the other way round: it seeds `globalThis.__runInsightsDb` BEFORE
 * `lib/db` is first imported. Two owners of `@/lib/db` in one file is not a thing, and only the
 * recorder can answer "was the predicate in the WHERE". So that file asserts the ACTION's
 * branching and this one asserts the SQL.
 */

type ImageJobs = typeof import('@/lib/nina/imagejobs')
type Queries = typeof import('@/lib/nina/queries')

/** 12 chars, so `isValidId` would accept it and `newId()` could have produced it. */
const JOB = 'jobAAAAAAAAA'

let fake: FakeDb
let jobs: ImageJobs
let queries: Queries

beforeEach(async () => {
  vi.resetModules()
  fake = installFakeDb()
  jobs = await import('@/lib/nina/imagejobs')
  queries = await import('@/lib/nina/queries')
})

afterEach(() => {
  uninstallFakeDb()
  vi.resetModules()
})

/**
 * Matches both `"deleted_at" is null` and `"nina_turns"."deleted_at" is null`, because drizzle
 * qualifies a column in a SELECT and may not in an UPDATE, and neither spelling is the point.
 */
const HIDDEN_SKIPPED = '"deleted_at" is null'

describe('every read that shows a job or schedules work on one skips a hidden row', () => {
  it('listNinaImageJobs — /nina/jobs loses the row, and so does /nina/about', async () => {
    fake.enqueue([])
    await jobs.listNinaImageJobs('u1')
    const { sql } = fake.only()
    expect(sql).toContain(HIDDEN_SKIPPED)
    // Still the same one indexed read it always was: kind is a heap filter, limit is real.
    expect(sql).toContain('"kind" = $')
    expect(sql).toContain('limit')
  })

  it('getNinaImageJobDetail — /nina/jobs/[id] 404s a hidden job', async () => {
    fake.enqueue([])
    await expect(jobs.getNinaImageJobDetail('u1', JOB)).resolves.toBeNull()
    expect(fake.only().sql).toContain(HIDDEN_SKIPPED)
  })

  it('getNinaImageJob — a poll answers "no such job"', async () => {
    fake.enqueue([])
    await expect(jobs.getNinaImageJob('u1', JOB)).resolves.toBeNull()
    expect(fake.only().sql).toContain(HIDDEN_SKIPPED)
  })

  it('listOpenNinaImageJobs — the in-flight strip AND the sweep it runs first', async () => {
    fake.enqueue([], []) // the sweep's SELECT, then the strip's
    await jobs.listOpenNinaImageJobs('u1')
    expect(fake.queries).toHaveLength(2)
    for (const query of fake.queries) expect(query.sql).toContain(HIDDEN_SKIPPED)
  })

  it('listRevivableNinaImageJobs — a hidden job is never re-fired', async () => {
    fake.enqueue([])
    await jobs.listRevivableNinaImageJobs('u1', {
      queuedBefore: new Date('2026-09-07T00:00:00Z'),
      runningBefore: new Date('2026-09-07T00:00:00Z'),
    })
    expect(fake.only().sql).toContain(HIDDEN_SKIPPED)
  })

  it('sweepStaleNinaImageJobs — she never apologises in the chat for a job he hid', async () => {
    fake.enqueue([])
    await expect(jobs.sweepStaleNinaImageJobs('u1')).resolves.toBe(0)
    expect(fake.only().sql).toContain(HIDDEN_SKIPPED)
  })

  it('claimNinaImageJob — a hidden job cannot be claimed, so nothing NEW starts for it', async () => {
    fake.enqueue([])
    await expect(jobs.claimNinaImageJob('u1', JOB)).resolves.toBeNull()
    expect(fake.only().sql).toContain(HIDDEN_SKIPPED)
  })

  it('reopenNinaImageJob — R1’s redo cannot resurrect a job he hid', async () => {
    /*
     * The EIGHTH read, and Phase 1's, added here by the reconciler. A hidden job is off
     * `/nina/jobs`, so a redo can only arrive from a stale tab — and if it landed it would open a
     * NEW row for work he had just tidied away and spend one of six generations a day on it.
     *
     * The refusal costs no new code: the owner-scoped SELECT comes back empty and
     * `reopenNinaImageJob`'s own first branch answers `'not-found'`, which is the same word a
     * foreign id gets. `NinaJobRefusal` is unchanged and so is the button's `NOTE`.
     */
    fake.enqueue([])
    await expect(jobs.reopenNinaImageJob('u1', JOB)).resolves.toEqual({
      ok: false,
      reason: 'not-found',
    })
    expect(fake.only().sql).toContain(HIDDEN_SKIPPED)
  })
})

describe('the daily cap keeps counting a hidden job — it is a money cap, not a feature cap', () => {
  it('countNinaTurnsSince carries NO deleted_at predicate, and that is the decision', async () => {
    fake.enqueue([[4]])
    await expect(queries.countNinaTurnsSince('u1', 'image', new Date(0))).resolves.toBe(4)
    // An ABSENCE assertion on purpose. A "consistency" cleanup that adds the filter here turns one
    // tap on a tidy-up icon into a quota refund; nothing else in the suite would notice.
    expect(fake.only().sql).not.toContain('deleted_at')
  })

  it('so a runner who generated up to the cap and hid them all has nothing left today', async () => {
    fake.enqueue([[ninaImageDailyCap()]])
    await expect(jobs.ninaImageQuotaLeft('u1')).resolves.toBe(0)
    expect(fake.only().sql).not.toContain('deleted_at')
  })
})

describe('softDeleteNinaImageJob — a flag, owner-scoped, idempotent, and never a DELETE', () => {
  it('is an UPDATE that stamps the DATABASE clock', async () => {
    fake.enqueue([[JOB]])
    await expect(jobs.softDeleteNinaImageJob('u1', JOB)).resolves.toBe(true)

    const { sql } = fake.only()
    expect(sql).toMatch(/^update "nina_turns" set/)
    expect(sql).toContain('"deleted_at" = now()')
    /* now() and not a JS `new Date()`: a serverless host's clock drift must not be able to put
     * `deleted_at` before the `created_at` sitting next to it. The SET therefore binds NO
     * parameter at all — every `$n` in this statement belongs to the ownership predicate. */
    expect(sql.slice(0, sql.indexOf(' where '))).not.toContain('$')
  })

  it('proves ownership in the same statement, and only ever flags an image row', async () => {
    fake.enqueue([[JOB]])
    await jobs.softDeleteNinaImageJob('u1', JOB)

    const { sql, params } = fake.only()
    expect(sql).toContain('"user_id" = $')
    expect(sql).toContain('"id" = $')
    expect(sql).toContain('"kind" = $')
    expect(params).toContain('u1')
    expect(params).toContain(JOB)
    expect(params).toContain('image')
  })

  it('only writes where the flag is still NULL, so a double-tap cannot move the timestamp', async () => {
    fake.enqueue([[JOB]])
    await jobs.softDeleteNinaImageJob('u1', JOB)
    expect(fake.only().sql).toContain(HIDDEN_SKIPPED)
  })

  it('reports false for a foreign id, a missing id and an already-hidden row alike', async () => {
    // One answer for four causes, deliberately: a return value that distinguished them would be a
    // probe for which job ids exist.
    fake.enqueue([])
    await expect(jobs.softDeleteNinaImageJob('u2', JOB)).resolves.toBe(false)
  })

  it('touches nothing but the flag — not status, not error_code, not the money', async () => {
    fake.enqueue([[JOB]])
    await jobs.softDeleteNinaImageJob('u1', JOB)

    const { sql } = fake.only()
    const setClause = sql.slice(0, sql.indexOf(' where '))
    expect(setClause).toContain('deleted_at')
    for (const column of ['cost_micro_usd', 'status', 'error_code', 'latency_ms', 'args']) {
      expect(setClause, column).not.toContain(column)
    }
  })
})

describe('"but just soft delete in neon db" — asserted against the module, not just one path', () => {
  it('lib/nina/imagejobs.ts issues no DELETE against nina_turns anywhere', () => {
    // The grep-as-a-guard shape `tests/db.schema.nina.test.ts` already uses on lib/nina/queries.ts.
    // This table is the money ledger and the audit trail; a row leaves it exactly one way, which is
    // the users cascade when an account is deleted.
    const source = readFileSync('lib/nina/imagejobs.ts', 'utf8')
    expect(source).not.toMatch(/\.delete\(\s*ninaTurns\s*\)/)
  })

  it('and neither does lib/nina/jobActions.ts', () => {
    const source = readFileSync('lib/nina/jobActions.ts', 'utf8')
    expect(source).not.toMatch(/\.delete\(/)
  })
})
