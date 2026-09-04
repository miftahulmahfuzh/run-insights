import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * `ADMIN_EMAILS` gates `/admin/nina` and `/admin/memory` (R23/R24). The parsing is four lines and
 * every one of them is a way to be locked out of your own admin page, which is why it has a test:
 * Google reports `Foo@Gmail.com` and `foo@gmail.com` as one account, and a person typing a
 * comma-separated list puts spaces after the commas.
 *
 * `lib/env.ts` opens with `import 'server-only'`, which Vitest resolves to
 * `tests/support/serverOnlyStub.ts` (see `vitest.config.ts`'s alias and its comment) — so this
 * module IS importable from a test, and no refactor into a separate pure file is needed.
 *
 * It also caches each lazy group in module scope, so every case re-imports the module after
 * `vi.resetModules()` rather than trying to defeat the cache with a query string (which Vitest's
 * resolver normalises away). `lib/env.ts`'s shape is a documented decision and is not restructured
 * to make this easier.
 */
const ORIGINAL = process.env.ADMIN_EMAILS

async function withAllowlist(value: string) {
  process.env.ADMIN_EMAILS = value
  const mod = await import('@/lib/env')
  return mod.isAdminEmail
}

beforeEach(() => {
  vi.resetModules()
})

afterEach(() => {
  if (ORIGINAL == null) delete process.env.ADMIN_EMAILS
  else process.env.ADMIN_EMAILS = ORIGINAL
})

describe('isAdminEmail', () => {
  it('admits the seeded address', async () => {
    const isAdminEmail = await withAllowlist('mahfuzh74@gmail.com')
    expect(isAdminEmail('mahfuzh74@gmail.com')).toBe(true)
  })

  it('is case-insensitive, because Google is', async () => {
    const isAdminEmail = await withAllowlist('mahfuzh74@gmail.com')
    expect(isAdminEmail('Mahfuzh74@Gmail.com')).toBe(true)
    expect(isAdminEmail('  mahfuzh74@gmail.com  ')).toBe(true)
  })

  it('reads a list with spaces after the commas, because that is how people type one', async () => {
    const isAdminEmail = await withAllowlist('a@b.com, mahfuzh74@gmail.com ,c@d.com')
    expect(isAdminEmail('mahfuzh74@gmail.com')).toBe(true)
    expect(isAdminEmail('c@d.com')).toBe(true)
  })

  it('fails CLOSED on a missing, empty or unknown email', async () => {
    const isAdminEmail = await withAllowlist('mahfuzh74@gmail.com')
    expect(isAdminEmail(null)).toBe(false)
    expect(isAdminEmail(undefined)).toBe(false)
    expect(isAdminEmail('')).toBe(false)
    expect(isAdminEmail('   ')).toBe(false)
    expect(isAdminEmail('someone@else.com')).toBe(false)
    // No substring matching: an allowlist that admits a suffix is not an allowlist.
    expect(isAdminEmail('evil+mahfuzh74@gmail.com')).toBe(false)
    expect(isAdminEmail('mahfuzh74@gmail.com.evil.com')).toBe(false)
  })
})
