import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ninaPhotoshopJobs } from '@/lib/db/schema'

import { installFakeDb, tableRow, uninstallFakeDb, type FakeDb } from './support/fakeDb'

/**
 * **The photoshop job row as a CARRIER: what goes in comes back out, and nothing else moves.**
 *
 * `openNinaPhotoshopJob` and `claimNinaPhotoshopJob` are the only writer and the only reader of
 * `nina_photoshop_jobs`' argument columns, and they are separated in time by an `after()` boundary
 * — the admin's click opens the row, and a background invocation claims it arbitrarily later, maybe
 * twice on a retry. Nothing about a crop selection can live in React state, so the only thing worth
 * asserting here is the round trip: the four `crop_*` columns come back out of a claim exactly as
 * they went into the open, and an absent crop comes back as four honest NULLs rather than as zeros.
 *
 * Written against the recording driver rather than a spy, because "was the column in the INSERT"
 * and "was `1.25` bound as the numeric string Postgres wants" are questions only the generated SQL
 * can answer — and a `numeric({ mode: 'number' })` column silently round-trips through `String()`
 * on the way out and `Number()` on the way back in.
 *
 * NOT asserted here, on purpose: whether `'5:4'` is a real OpenRouter aspect-ratio label. That
 * closed-set check belongs at the untrusted boundary (`lib/admin/photoshopActions.ts`); this layer
 * stores what it is handed, and a column type that pretended to validate would only move the lie.
 */

type Jobs = typeof import('@/lib/nina/photoshopJobs')

/** 12 chars apiece, so `isValidId` would accept them and `newId()` could have produced them. */
const USER = 'userAAAAAAAA'
const JOB = 'jobAAAAAAAAA'
const SOURCE = 'srcAAAAAAAAA'

const BASE_ARGS = {
  sourceKind: 'avatar' as const,
  sourceId: SOURCE,
  sourceContentHash: 'deadbeefcafe',
  mode: 'edit' as const,
  model: 'bytedance-seed/seedream-4.5',
  presetKey: null,
  promptText: 'bigger smile',
}

/**
 * The bound parameters of `openNinaPhotoshopJob`'s INSERT, in table column order, MINUS the
 * generated id at index 0. Drizzle emits every column of the table and binds only the ones the
 * caller supplied (the rest become the literal `default` keyword and consume no parameter), so this
 * list is: the seven pre-existing args, the four crop values, then status/errorCode/attempts.
 */
function insertParamsAfterId(crop: unknown[]): unknown[] {
  return [
    USER,
    'avatar',
    SOURCE,
    'deadbeefcafe',
    'edit',
    'bytedance-seed/seedream-4.5',
    null, // preset_key
    'bigger smile',
    ...crop,
    'pending',
    'queued',
    0,
  ]
}

let fake: FakeDb
let jobs: Jobs

beforeEach(async () => {
  vi.resetModules()
  fake = installFakeDb()
  jobs = await import('@/lib/nina/photoshopJobs')
})

afterEach(() => {
  uninstallFakeDb()
  vi.resetModules()
})

describe('openNinaPhotoshopJob writes the crop columns', () => {
  it('a job with no crop binds four explicit NULLs — not four missing columns', async () => {
    fake.enqueue([])
    const id = await jobs.openNinaPhotoshopJob(USER, { ...BASE_ARGS })

    const { sql, params } = fake.only()
    expect(id).toHaveLength(12)
    expect(sql).toContain('"crop_ratio_label"')
    expect(sql).toContain('"crop_scale"')
    expect(sql).toContain('"crop_x"')
    expect(sql).toContain('"crop_y"')
    // The whole bound list, so a future column added to this INSERT cannot slip in unnoticed.
    expect(params[0]).toBe(id)
    expect(params.slice(1)).toEqual(insertParamsAfterId([null, null, null, null]))
  })

  it('a job with a crop binds all four — and the scale as the numeric STRING Postgres wants', async () => {
    fake.enqueue([])
    await jobs.openNinaPhotoshopJob(USER, {
      ...BASE_ARGS,
      cropRatioLabel: '5:4',
      cropScale: 1.25,
      cropX: 40,
      cropY: -25,
    })

    const { params } = fake.only()
    /*
     * `'1.25'`, not `1.25`. A `numeric({ mode: 'number' })` column's `mapToDriverValue` is `String`
     * — the number is a convenience on OUR side of the wire only. Asserted explicitly because a
     * future switch to `mode: 'string'` or to a plain `integer` per-mille column would change the
     * stored value's type without changing a single line of the calling code.
     */
    expect(params.slice(1)).toEqual(insertParamsAfterId(['5:4', '1.25', 40, -25]))
  })

  it('an explicit null crop and an omitted crop produce the identical statement', async () => {
    fake.enqueue([], [])
    await jobs.openNinaPhotoshopJob(USER, { ...BASE_ARGS })
    await jobs.openNinaPhotoshopJob(USER, {
      ...BASE_ARGS,
      cropRatioLabel: null,
      cropScale: null,
      cropX: null,
      cropY: null,
    })

    expect(fake.queries).toHaveLength(2)
    expect(fake.queries[0]!.sql).toBe(fake.queries[1]!.sql)
    expect(fake.queries[0]!.params.slice(1)).toEqual(fake.queries[1]!.params.slice(1))
  })
})

describe('claimNinaPhotoshopJob reads the crop back', () => {
  it('reads all four back, mapping the numeric string to a number', async () => {
    fake.enqueue([
      tableRow(ninaPhotoshopJobs, {
        id: JOB,
        userId: USER,
        sourceKind: 'avatar',
        sourceId: SOURCE,
        sourceContentHash: 'deadbeefcafe',
        mode: 'edit',
        model: 'bytedance-seed/seedream-4.5',
        presetKey: null,
        promptText: 'bigger smile',
        // The driver hands back what Postgres prints for numeric(5,3): a padded string.
        cropRatioLabel: '5:4',
        cropScale: '1.250',
        cropX: 40,
        cropY: -25,
        attempts: 1,
      }),
    ])

    const claim = await jobs.claimNinaPhotoshopJob(USER, JOB)

    expect(claim).toEqual({
      jobId: JOB,
      attempts: 1,
      args: {
        ...BASE_ARGS,
        cropRatioLabel: '5:4',
        cropScale: 1.25,
        cropX: 40,
        cropY: -25,
      },
    })
  })

  it('a row with no crop reads back four NULLs — never zeros, and never undefined', async () => {
    fake.enqueue([
      tableRow(ninaPhotoshopJobs, {
        id: JOB,
        userId: USER,
        sourceKind: 'avatar',
        sourceId: SOURCE,
        sourceContentHash: 'deadbeefcafe',
        mode: 'edit',
        model: 'bytedance-seed/seedream-4.5',
        presetKey: null,
        promptText: 'bigger smile',
        // Spelled out: `tableRow`'s own fallback for numeric is '0' and for integer is 0, and a
        // crop of scale 0 at offset 0,0 is a very different (and nonsensical) thing from no crop.
        cropRatioLabel: null,
        cropScale: null,
        cropX: null,
        cropY: null,
        attempts: 1,
      }),
    ])

    const claim = await jobs.claimNinaPhotoshopJob(USER, JOB)

    expect(claim?.args).toEqual({
      ...BASE_ARGS,
      cropRatioLabel: null,
      cropScale: null,
      cropX: null,
      cropY: null,
    })
    // `null`, not absent: a consumer's all-four-non-null check is then the only question it asks.
    expect(claim?.args).toHaveProperty('cropScale', null)
  })

  it('an unclaimable job is still null, and the claim is still one owner-scoped statement', async () => {
    fake.enqueue([])
    await expect(jobs.claimNinaPhotoshopJob(USER, JOB)).resolves.toBeNull()

    const { sql } = fake.only()
    expect(sql).toContain('"user_id" = $')
    expect(sql).toContain('"status" = $')
    expect(sql).toContain('returning')
  })
})
