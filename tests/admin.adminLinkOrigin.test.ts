import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { readRepoCode } from './support/importGraph'

/**
 * **R4's gate, and in particular the throw it exists to avoid.**
 *
 * `isAdminEmail` (`lib/env.ts:261`) reaches `adminEnv()` → `load('admin', adminSchema)`, a LAZY env
 * group that `fail()`s with a thrown Error when `ADMIN_EMAILS` is missing or empty. That variable is
 * Production-scope only in Vercel and is absent from this repo's `.env.local`, so a bare
 * `getAdminIdentity()` on `/nina`, `/nina/about` or `/photo/**` would 500 those pages for every
 * SIGNED-IN user on every preview deployment and in every plain local run — taking the chat screen
 * down in order to hide a button. The first case below is the one that must never regress.
 *
 * `@/lib/env` runs for real (the allowlist wiring is the thing under test); `@/auth` and
 * `@/lib/share/origin` are the edges.
 */

const ORIGINAL_ADMIN_EMAILS = process.env.ADMIN_EMAILS

const auth = vi.fn()
const shareOrigin = vi.fn()

vi.mock('@/auth', () => ({ auth: (...args: unknown[]) => auth(...args) }))
vi.mock('@/lib/share/origin', () => ({ shareOrigin: () => shareOrigin() }))

type Mod = typeof import('@/lib/admin/adminLinkOrigin')

const sessionOf = (email: string | null, userId: string | null) =>
  ({ user: { id: userId, email } }) as never

beforeEach(() => {
  vi.resetModules()
  auth.mockReset()
  shareOrigin.mockReset().mockReturnValue('https://runins.site')
})

afterEach(() => {
  if (ORIGINAL_ADMIN_EMAILS == null) delete process.env.ADMIN_EMAILS
  else process.env.ADMIN_EMAILS = ORIGINAL_ADMIN_EMAILS
})

describe('resolveAdminLinkOrigin — the gate', () => {
  it('answers null, NOT a throw, when ADMIN_EMAILS is unset and the user is signed in', async () => {
    // Plan invariant 7. Without the precondition this line throws, and /nina 500s on every preview
    // deployment for every signed-in runner.
    delete process.env.ADMIN_EMAILS
    auth.mockResolvedValue(sessionOf('anyone@example.com', 'user123XYZ_-'))
    const mod: Mod = await import('@/lib/admin/adminLinkOrigin')

    await expect(mod.resolveAdminLinkOrigin()).resolves.toBeNull()
    // And it short-circuits BEFORE the session read, so the unconfigured case costs nothing.
    expect(auth).not.toHaveBeenCalled()
  })

  it('treats an EMPTY ADMIN_EMAILS the same way — it is exactly what the schema rejects', async () => {
    // `nonEmpty` is `z.string().min(1)` (`lib/env.ts:34`), so '' fails parsing just as absence does.
    process.env.ADMIN_EMAILS = ''
    auth.mockResolvedValue(sessionOf('anyone@example.com', 'user123XYZ_-'))
    const mod: Mod = await import('@/lib/admin/adminLinkOrigin')

    await expect(mod.resolveAdminLinkOrigin()).resolves.toBeNull()
  })

  it('hands back the share origin for the configured admin', async () => {
    process.env.ADMIN_EMAILS = 'ops@example.com'
    auth.mockResolvedValue(sessionOf('ops@example.com', 'user123XYZ_-'))
    const mod: Mod = await import('@/lib/admin/adminLinkOrigin')

    await expect(mod.resolveAdminLinkOrigin()).resolves.toBe('https://runins.site')
  })

  it('answers null for a signed-in stranger, and never reaches the origin', async () => {
    process.env.ADMIN_EMAILS = 'ops@example.com'
    auth.mockResolvedValue(sessionOf('stranger@example.com', 'user123XYZ_-'))
    const mod: Mod = await import('@/lib/admin/adminLinkOrigin')

    await expect(mod.resolveAdminLinkOrigin()).resolves.toBeNull()
    expect(shareOrigin).not.toHaveBeenCalled()
  })

  it('answers null for no session at all', async () => {
    process.env.ADMIN_EMAILS = 'ops@example.com'
    auth.mockResolvedValue(null)
    const mod: Mod = await import('@/lib/admin/adminLinkOrigin')

    await expect(mod.resolveAdminLinkOrigin()).resolves.toBeNull()
  })

  it('lets an auth failure propagate rather than reporting it as "not an admin"', async () => {
    // The reason the guard is a PRECONDITION and not a try/catch: a corrupt session cookie is not a
    // statement about admin-ness, and swallowing it here would hide a real failure behind a missing
    // button.
    process.env.ADMIN_EMAILS = 'ops@example.com'
    auth.mockRejectedValue(new Error('session decryption failed'))
    const mod: Mod = await import('@/lib/admin/adminLinkOrigin')

    await expect(mod.resolveAdminLinkOrigin()).rejects.toThrow('session decryption failed')
  })
})

describe('the three client pages go through the resolver, not through the predicate', () => {
  const PAGES = ['app/nina/page.tsx', 'app/nina/about/page.tsx', 'app/photo/[kind]/[id]/page.tsx']

  it('each resolves the origin once and threads it as one nullable prop', () => {
    for (const page of PAGES) {
      const source = readRepoCode(page)
      expect(source, `${page} must resolve the origin`).toContain('resolveAdminLinkOrigin()')
      expect(source, `${page} must thread it`).toContain('adminLinkOrigin={adminLinkOrigin}')
    }
  })

  it('none of them reaches isAdminEmail or getAdminIdentity directly (plan invariant 7)', () => {
    // A bare getAdminIdentity() here is the measured 500: `isAdminEmail` loads a lazy env group
    // that throws where ADMIN_EMAILS is unset, which is every preview deployment.
    for (const page of PAGES) {
      const source = readRepoCode(page)
      expect(source).not.toContain('isAdminEmail')
      expect(source).not.toContain('getAdminIdentity')
    }
  })

  it('the resolver is the one place the admin env group is probed, and it never parses it', () => {
    // A presence probe, never a value read: `lib/env.ts` stays the only parser of the list and
    // `isAdminEmail` the only predicate, so the admin address is nowhere in this repo's source.
    const source = readRepoCode('lib/admin/adminLinkOrigin.ts')
    expect(source).toContain("import 'server-only'")
    expect(source).toContain('process.env.ADMIN_EMAILS')
    expect(source).not.toContain('.split(')
    expect(source).not.toContain('toLowerCase')
    // No blanket catch: an auth failure must not be reported as "not an admin".
    expect(source).not.toContain('catch')
  })
})
