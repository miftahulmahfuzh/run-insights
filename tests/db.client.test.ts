import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * lib/db/index.ts is constructed eagerly at import. These tests exercise that: they reset the
 * module registry and the globalThis cache around each case, because the whole point of the
 * module is that it has exactly one instance per process.
 */

const CACHE_KEY = '__runInsightsDb'
type CacheHolder = Record<string, unknown>

function clearCache() {
  delete (globalThis as CacheHolder)[CACHE_KEY]
}

describe('lib/db/index', () => {
  const originalUrl = process.env.DATABASE_URL

  beforeEach(() => {
    vi.resetModules()
    clearCache()
  })

  afterEach(() => {
    process.env.DATABASE_URL = originalUrl
    vi.resetModules()
    clearCache()
  })

  it('throws a message naming the variable when DATABASE_URL is missing', async () => {
    delete process.env.DATABASE_URL
    await expect(import('@/lib/db/index')).rejects.toThrow(/DATABASE_URL is not set/)
  })

  it('constructs without any network I/O when DATABASE_URL is present', async () => {
    // neon() is a URL parser at construction time; the fetch only happens per query. If that
    // ever changes, this test hangs or fails instead of a production boot doing so.
    const { db } = await import('@/lib/db/index')
    expect(db).toBeDefined()
    expect(typeof db.select).toBe('function')
    expect(typeof db.batch).toBe('function')
  })

  it('returns the same instance across two imports (the globalThis cache)', async () => {
    const first = (await import('@/lib/db/index')).db
    vi.resetModules() // simulate Next's dev-mode module reload
    const second = (await import('@/lib/db/index')).db
    expect(second).toBe(first)
  })

  it('honours a pre-seeded globalThis instance, which is what lets tests install a fake', async () => {
    const sentinel = { select: () => undefined, batch: () => undefined } as unknown
    ;(globalThis as CacheHolder)[CACHE_KEY] = sentinel
    const { db } = await import('@/lib/db/index')
    expect(db).toBe(sentinel)
  })

  it('re-exports the schema, so `import { runs } from "@/lib/db"` works', async () => {
    const mod = await import('@/lib/db/index')
    expect(mod.schema).toBeDefined()
    expect(mod.runs).toBeDefined()
    expect(mod.runSplits).toBeDefined()
  })

  it('has no transaction path: neon-http throws, so queries.ts must use db.batch', async () => {
    const { db } = await import('@/lib/db/index')
    await expect(db.transaction(async () => undefined)).rejects.toThrow(/No transactions support/)
  })
})
