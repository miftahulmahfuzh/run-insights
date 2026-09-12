import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { installFakeDb, projectedRow, uninstallFakeDb, type FakeDb } from './support/fakeDb'

/**
 * `lib/nina/errorlogs.ts` read as SQL rather than as a spy — the only way to assert that the
 * category predicate is in the WHERE, that the page is really `LIMIT`ed, and that the writer's
 * insert names every column phases 2/3/4 will fill.
 *
 * Two properties matter more than the rest and are asserted first:
 *   - `logNinaError` NEVER rejects. It runs inside the catch block of the call it records.
 *   - `listNinaErrorLogs` clamps `limit` to the ceiling, so a hand-edited `?limit=` in the admin
 *     URL cannot turn one page into an unpaginated read of a table nothing prunes.
 */

type ErrorLogs = typeof import('@/lib/nina/errorlogs')

const USER = 'abc123XYZ_-9'
const ROW_ID = 'aB3_dEf-hI9k'

let fake: FakeDb
let mod: ErrorLogs

beforeEach(async () => {
  vi.resetModules()
  fake = installFakeDb()
  mod = await import('@/lib/nina/errorlogs')
})

afterEach(() => {
  uninstallFakeDb()
  vi.resetModules()
  vi.restoreAllMocks()
})

describe('logNinaError', () => {
  it('inserts one row naming every column, in one statement', async () => {
    await mod.logNinaError({
      category: 'multimodal',
      userId: USER,
      provider: 'zai',
      model: 'glm-4.6v',
      fullInput: 'Describe this photo.',
      errorMessage: 'HTTP 503 upstream unavailable',
      timeoutMs: 25_000,
      imageUrl: 'https://blob.example/nina/photo.png',
    })

    const { sql, params } = fake.only()
    expect(sql).toContain('insert into "nina_error_logs"')
    for (const column of [
      '"id"',
      '"user_id"',
      '"category"',
      '"provider"',
      '"model"',
      '"full_input"',
      '"error_message"',
      '"timeout_ms"',
      '"image_url"',
    ]) {
      expect(sql, column).toContain(column)
    }
    // created_at is defaulted by the column, not sent — no writer carries a clock. This drizzle
    // spells that by naming the column and sending the literal `default`, rather than omitting it.
    expect(sql).toContain('"image_url", "created_at") values')
    expect(sql).toContain('$9, default)')
    expect(params.some((p) => p instanceof Date)).toBe(false)
    expect(params).toContain(USER)
    expect(params).toContain('multimodal')
    expect(params).toContain('glm-4.6v')
    expect(params).toContain(25_000)
    expect(params).toContain('https://blob.example/nina/photo.png')
  })

  it('sends NULL, not undefined, for an omitted timeout and image', async () => {
    await mod.logNinaError({
      category: 'text',
      userId: USER,
      provider: 'openrouter',
      model: 'z-ai/glm-5.3-flash',
      fullInput: '{"system":"…","messages":[]}',
      errorMessage: 'ETIMEDOUT',
    })

    const { params } = fake.only()
    expect(params).toContain(null)
    expect(params).not.toContain(undefined)
  })

  it('accepts a write with NO user id at all, and still names the column', async () => {
    /*
     * The contract phases 2 and 3 depend on. Phase 3's vision seam never has a runner in hand and
     * phase 2's client is constructible without one; a NOT NULL column or a required field here
     * would turn both into failed inserts that this function swallows in silence.
     */
    await mod.logNinaError({
      category: 'multimodal',
      provider: 'openrouter',
      model: 'z-ai/glm-5.3-flash',
      fullInput: '{"system":"…"}',
      errorMessage: 'openrouter HTTP 503',
      imageUrl: 'https://blob.example/nina/photo.png',
    })

    const { sql, params } = fake.only()
    expect(sql).toContain('"user_id"')
    expect(params).toContain(null)
    expect(params).not.toContain(undefined)
  })

  it('NEVER rejects when the insert fails — it warns and returns', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    fake.enqueueError(new Error('neon: connection reset'))

    await expect(
      mod.logNinaError({
        category: 'text',
        userId: USER,
        provider: 'zai',
        model: 'glm-5.3-flash',
        fullInput: 'x',
        errorMessage: 'y',
      }),
    ).resolves.toBeUndefined()

    expect(warn).toHaveBeenCalledOnce()
    expect(String(warn.mock.calls[0]?.[0])).toContain('error log write failed')
  })

  it('clamps a runaway payload instead of inserting megabytes', async () => {
    const huge = 'a'.repeat(mod.NINA_ERROR_LOG_TEXT_MAX + 500)
    await mod.logNinaError({
      category: 'image_generation',
      userId: USER,
      provider: 'openrouter',
      model: 'qwen/qwen-image-3',
      fullInput: huge,
      errorMessage: 'policy',
    })

    const stored = fake.only().params.find((p) => typeof p === 'string' && p.startsWith('aaaa'))
    expect(typeof stored).toBe('string')
    expect((stored as string).length).toBeLessThan(huge.length)
    expect(stored as string).toContain('[truncated 500 more characters]')
  })
})

describe('clampNinaErrorText', () => {
  it('leaves anything at or under the ceiling byte-identical', () => {
    const text = 'a'.repeat(mod.NINA_ERROR_LOG_TEXT_MAX)
    expect(mod.clampNinaErrorText(text)).toBe(text)
  })
})

describe('listNinaErrorLogs', () => {
  it('filters by category, orders newest first, and pages — in two statements', async () => {
    fake.enqueue(
      [
        projectedRow(
          ROW_ID,
          USER,
          'text',
          'zai',
          'glm-5.3-flash',
          '{"system":"…"}',
          'HTTP 503',
          22_000,
          null,
          '2026-09-12 00:11:22+00',
        ),
      ],
      [projectedRow(41)],
    )

    const page = await mod.listNinaErrorLogs('text', { limit: 10, offset: 20 })

    expect(fake.queries).toHaveLength(2)
    const list = fake.sqlAt(0)
    expect(list).toContain('from "nina_error_logs"')
    expect(list).toContain('"category" = $')
    expect(list).toContain('order by')
    expect(list).toContain('desc')
    expect(list).toContain('limit')
    expect(list).toContain('offset')
    // Not ownership-scoped, and that is deliberate: the admin page is not scoped to a runner.
    expect(list).not.toContain('"user_id" = $')
    expect(fake.sqlAt(1)).toContain('count(*)')

    expect(page.total).toBe(41)
    expect(page.rows).toHaveLength(1)
    expect(page.rows[0]?.id).toBe(ROW_ID)
    expect(page.rows[0]?.timeoutMs).toBe(22_000)
    expect(page.rows[0]?.imageUrl).toBeNull()
    expect(page.rows[0]?.createdAt).toBeInstanceOf(Date)
  })

  it('refuses a limit above the ceiling, so no URL can unpaginate the read', async () => {
    fake.enqueue([], [projectedRow(0)])
    await mod.listNinaErrorLogs('multimodal', { limit: 100_000 })
    expect(fake.sqlAt(0).toLowerCase()).toContain('limit')
    expect(fake.queries[0]?.params).toContain(mod.NINA_ERROR_LOG_PAGE_SIZE)
  })

  it('treats a negative offset as zero rather than as a SQL error', async () => {
    fake.enqueue([], [projectedRow(0)])
    await mod.listNinaErrorLogs('image_generation', { offset: -5 })
    expect(fake.queries[0]?.params).not.toContain(-5)
  })

  it('returns a truthful total for an over-shot page, so the empty branch can say so', async () => {
    fake.enqueue([], [projectedRow(7)])
    const page = await mod.listNinaErrorLogs('text', { offset: 1_000 })
    expect(page.rows).toEqual([])
    expect(page.total).toBe(7)
  })
})

describe('getNinaErrorLog', () => {
  it('reads one row by id and returns null on a miss', async () => {
    fake.enqueue([])
    expect(await mod.getNinaErrorLog(ROW_ID)).toBeNull()
    const { sql, params } = fake.only()
    expect(sql).toContain('from "nina_error_logs"')
    expect(sql).toContain('"id" = $')
    expect(params).toContain(ROW_ID)
  })
})
