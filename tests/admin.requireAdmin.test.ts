import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * **The admin boundary itself, executing for the first time.**
 *
 * Every module under `lib/admin/` opens with `requireAdmin()`, and until now every test that
 * touched one replaced it with a `vi.fn()` — the real guard had never run anywhere. That is the
 * one substitution a suite must not be allowed to keep forever: `proxy.ts` matches neither
 * `/admin` nor `/api/*` (ruling D3 — its own header explains why it never will), so THIS file's
 * two functions are the only thing between a signed-in stranger and the album, the memory ledger
 * and every write action in the package. Its refusals, and the DIFFERENCE between them, are the
 * security posture:
 *
 *   - signed out        → `redirect('/')` — signing in is the useful next step; `/` IS the
 *                         sign-in screen (R-24)
 *   - signed in, no why → `notFound()`   — signing in again will not help, and a 404 confirms
 *                         nothing about the existence of an admin surface
 *   - Route Handler     → throws `UnauthorizedError` (401) or `AdminForbiddenError` (404) — a 307
 *                         to an HTML page is a terrible answer to `fetch()`
 *
 * The `@/lib/env` half runs FOR REAL here: `ADMIN_EMAILS` is set per-test and the module is
 * re-imported after `vi.resetModules()` (its lazy groups cache per import — the documented
 * approach `tests/env.admin.test.ts` already takes), so a future refactor that breaks the
 * allowlist wiring inside the guard fails here and not only in `tests/env.admin.test.ts`.
 * `@/auth` and `next/navigation` are the edges; the navigation mock throws errors carrying the
 * same digests the framework throws, so control flow — nothing after the refusal runs — is
 * asserted, not simulated.
 */

const ORIGINAL_ADMIN_EMAILS = process.env.ADMIN_EMAILS

const auth = vi.fn()

class FrameworkControlError extends Error {
  constructor(
    readonly kind: 'redirect' | 'notFound',
    readonly url?: string,
  ) {
    super(`${kind}${url == null ? '' : `:${url}`}`)
    this.name = 'FrameworkControlError'
  }
}

vi.mock('@/auth', () => ({ auth: (...args: unknown[]) => auth(...args) }))
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new FrameworkControlError('redirect', url)
  },
  notFound: () => {
    throw new FrameworkControlError('notFound')
  },
}))

type Mod = typeof import('@/lib/admin/requireAdmin')
let mod: Mod

const sessionOf = (email: string | null | undefined, userId: string | null | undefined) =>
  ({ user: { id: userId, email } }) as never

beforeEach(async () => {
  vi.resetModules()
  auth.mockReset()
  process.env.ADMIN_EMAILS = 'ops@example.com'
  mod = await import('@/lib/admin/requireAdmin')
})

afterEach(() => {
  if (ORIGINAL_ADMIN_EMAILS == null) delete process.env.ADMIN_EMAILS
  else process.env.ADMIN_EMAILS = ORIGINAL_ADMIN_EMAILS
})

describe('getAdminIdentity — the branch flavour', () => {
  it('hands back the session identity when the email is on the allowlist', async () => {
    auth.mockResolvedValue(sessionOf('ops@example.com', 'user123XYZ_-'))

    const identity = await mod.getAdminIdentity()

    expect(identity).toEqual({ userId: 'user123XYZ_-', email: 'ops@example.com' })
  })

  it('returns null for no session, rather than throwing — the caller branches', async () => {
    auth.mockResolvedValue(null)

    expect(await mod.getAdminIdentity()).toBeNull()
  })

  it('returns null when the session has no user id, even with an allowed email', async () => {
    auth.mockResolvedValue(sessionOf('ops@example.com', null))

    expect(await mod.getAdminIdentity()).toBeNull()
  })

  it('fails closed on an unknown email, a wrong-case neighbour and a missing one', async () => {
    auth.mockResolvedValue(sessionOf('stranger@example.com', 'user123XYZ_-'))
    expect(await mod.getAdminIdentity()).toBeNull()

    // The allowlist match is exact — `isAdminEmail` lowercases and trims, and this asserts the
    // guard inherited that rather than re-implementing a looser comparison.
    auth.mockResolvedValue(sessionOf('OPS@EXAMPLE.COM ', 'user123XYZ_-'))
    expect(await mod.getAdminIdentity()).toEqual({ userId: 'user123XYZ_-', email: 'OPS@EXAMPLE.COM ' })

    auth.mockResolvedValue(sessionOf(null, 'user123XYZ_-'))
    expect(await mod.getAdminIdentity()).toBeNull()
  })
})

describe('requireAdmin — the boundary every action opens with', () => {
  it('returns the identity and refuses nobody, when the email is allowed', async () => {
    auth.mockResolvedValue(sessionOf('ops@example.com', 'user123XYZ_-'))

    const identity = await mod.requireAdmin()

    expect(identity).toEqual({ userId: 'user123XYZ_-', email: 'ops@example.com' })
  })

  it('sends a signed-out visitor to / — the sign-in screen — by throwing out of the action', async () => {
    auth.mockResolvedValue(null)

    await expect(mod.requireAdmin()).rejects.toThrow(FrameworkControlError)
    await expect(mod.requireAdmin()).rejects.toMatchObject({
      kind: 'redirect',
      url: '/',
    })
  })

  it('answers a signed-in stranger with notFound — not a redirect, and not a forbidden', async () => {
    auth.mockResolvedValue(sessionOf('stranger@example.com', 'user123XYZ_-'))

    await expect(mod.requireAdmin()).rejects.toMatchObject({ kind: 'notFound' })
  })

  it('checks the id FIRST: a session with an allowed email but no id still redirects', async () => {
    auth.mockResolvedValue(sessionOf('ops@example.com', null))

    // The order is the documented one — a null id is "not signed in" however good the email looks,
    // and `redirect` must win over `notFound` here or a broken session would leak the 404's
    // "this surface exists" signal to whoever holds the cookie.
    await expect(mod.requireAdmin()).rejects.toMatchObject({ kind: 'redirect', url: '/' })
  })

  it('an empty ADMIN_EMAILS crashes the guard loudly — it can never silently admit nobody', async () => {
    // `lib/env.ts` validates the admin group lazily and caches per import, and `nonEmpty`
    // refuses `''`: the FIRST `requireAdmin()` call after a bad deploy throws the INVALID
    // ADMIN ENVIRONMENT crash naming the variable — never a `notFound()` that a stranger could
    // read as "the surface exists but I am not on the list", and never a silent pass. Fail-closed
    // by crash, at first use.
    process.env.ADMIN_EMAILS = ''
    vi.resetModules()
    mod = await import('@/lib/admin/requireAdmin')
    auth.mockResolvedValue(sessionOf('ops@example.com', 'user123XYZ_-'))

    await expect(mod.requireAdmin()).rejects.toThrow('INVALID ADMIN ENVIRONMENT')
  })
})

describe('requireAdminApi — the Route Handler flavour: throws, never redirects', () => {
  it('returns the identity after ONE auth call — the happy path short-circuits the re-read', async () => {
    auth.mockResolvedValue(sessionOf('ops@example.com', 'user123XYZ_-'))

    const identity = await mod.requireAdminApi()

    expect(identity).toEqual({ userId: 'user123XYZ_-', email: 'ops@example.com' })
    expect(auth).toHaveBeenCalledTimes(1)
  })

  it('throws AdminForbiddenError — a 404, by status and by name — for a real, unlisted session', async () => {
    auth.mockResolvedValue(sessionOf('stranger@example.com', 'user123XYZ_-'))

    const error = await mod.requireAdminApi().then(
      () => {
        throw new Error('expected a refusal')
      },
      (cause: unknown) => cause,
    )

    expect(error).toBeInstanceOf(mod.AdminForbiddenError)
    expect(error).toMatchObject({ name: 'AdminForbiddenError', status: 404 })
    // Two auth reads: the branch probe, then the one that distinguishes "who to blame".
    expect(auth).toHaveBeenCalledTimes(2)
  })

  it('throws UnauthorizedError — a 401 — when there is no session to blame', async () => {
    auth.mockResolvedValue(null)

    const error = await mod.requireAdminApi().then(
      () => {
        throw new Error('expected a refusal')
      },
      (cause: unknown) => cause,
    )

    expect(error).toMatchObject({ name: 'UnauthorizedError', status: 401 })
  })

  it('throws UnauthorizedError when the second read also finds no id — not a 404', async () => {
    auth.mockResolvedValue(sessionOf('ops@example.com', null))

    const error = await mod.requireAdminApi().then(
      () => {
        throw new Error('expected a refusal')
      },
      (cause: unknown) => cause,
    )

    expect(error).toMatchObject({ name: 'UnauthorizedError', status: 401 })
  })
})

describe('AdminForbiddenError and forbiddenJson — the canonical refusal', () => {
  it('is an Error with a 404 status and a message that says nothing', async () => {
    const error = new mod.AdminForbiddenError()
    expect(error).toBeInstanceOf(Error)
    expect(error.name).toBe('AdminForbiddenError')
    expect(error.status).toBe(404)
    expect(error.message).toBe('Not found')

    expect(new mod.AdminForbiddenError('custom').message).toBe('custom')
  })

  it('forbiddenJson is a 404 JSON body with the same sentence, so every route answers identically', async () => {
    const response = mod.forbiddenJson()
    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toEqual({ error: 'Not found' })
  })
})
