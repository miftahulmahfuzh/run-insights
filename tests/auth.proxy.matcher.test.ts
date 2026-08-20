import { AsyncLocalStorage } from 'node:async_hooks'
import { describe, expect, it, vi } from 'vitest'

/**
 * The proxy matcher is the one line in F02 that can silently break a security-adjacent property by
 * *widening*: add `/s/:path*` to it and every public share link starts redirecting signed-out
 * visitors to a sign-in page — the whole of F11 gone (D9, INVARIANT B). Nothing else in the suite
 * would notice.
 *
 * `unstable_doesMiddlewareMatch` is Next's own matcher compiler, so this asserts against real
 * path-to-regexp semantics rather than a reimplementation of them. The Next 16.3.1 docs call it
 * `unstable_doesProxyMatch`; the shipped build has not renamed the export yet, so the old name is
 * what actually exists. It is experimental — if it disappears, replace the call, do not delete the
 * assertions.
 *
 * The dynamic imports below are load-bearing. `next/experimental/testing/server` pulls in Next's
 * AsyncLocalStorage shim, which throws at *import* time unless `globalThis.AsyncLocalStorage`
 * already exists — Next's own runtimes install it as a global, plain Node does not. A static
 * `import` would be hoisted above the assignment and the file would fail to collect.
 */
;(globalThis as { AsyncLocalStorage?: unknown }).AsyncLocalStorage ??= AsyncLocalStorage

/**
 * `proxy.ts` only needs to be importable here for its `config` export. Stubbing `next-auth` keeps
 * that import from resolving Auth.js's own `next/server` specifier, which Vitest's Node resolution
 * cannot follow the way the Next bundler can.
 */
vi.mock('next-auth', () => ({ default: () => ({ auth: (fn: unknown) => fn }) }))

const { unstable_doesMiddlewareMatch } = await import('next/experimental/testing/server')
const { config } = await import('@/proxy')

const matches = (url: string) => unstable_doesMiddlewareMatch({ config, nextConfig: {}, url })

describe('proxy matcher', () => {
  it('protects every signed-in page in roadmap §4.8', () => {
    expect(matches('/upload')).toBe(true)
    expect(matches('/trends')).toBe(true)
    expect(matches('/me')).toBe(true)
    expect(matches('/onboarding')).toBe(true)
  })

  it('protects the run routes and the review route through one prefix each', () => {
    expect(matches('/r/abc123def456')).toBe(true)
    expect(matches('/r/abc123def456/edit')).toBe(true) // R-1's post-review correction screen
    expect(matches('/x/abc123def456')).toBe(true) // R-1's pre-commit review screen
    expect(matches('/r')).toBe(true)
    expect(matches('/x')).toBe(true)
  })

  it('LEAVES /s/[token] PUBLIC — INVARIANT B, do not weaken this', () => {
    expect(matches('/s/abcdef0123456789')).toBe(false)
    expect(matches('/s')).toBe(false)
  })

  it('leaves / alone — it is the runs list AND the sign-in screen (R-24)', () => {
    // Matching it would bounce the sign-in screen to itself. The gate lives in app/page.tsx.
    expect(matches('/')).toBe(false)
  })

  it('leaves the Auth.js flow alone', () => {
    expect(matches('/api/auth/signin/google')).toBe(false)
    expect(matches('/api/auth/callback/google')).toBe(false)
    expect(matches('/api/auth/session')).toBe(false)
  })

  it('leaves the Route Handlers to their own guards', () => {
    // /api/health is the unauthenticated liveness probe (R-14) and must answer, not 307.
    expect(matches('/api/health')).toBe(false)
    // F04's endpoints authenticate with requireUserIdApi(); a 307 to HTML is a terrible answer to
    // fetch(). F07's cron is guarded by CRON_SECRET, not a session.
    expect(matches('/api/extract')).toBe(false)
    expect(matches('/api/extract/abc123def456')).toBe(false)
    expect(matches('/api/cron/rollup')).toBe(false)
  })

  it('does not match routes that merely start with a protected name', () => {
    // `/upload` and `/trends` are exact, not prefixes: a future `/uploads` must not inherit the
    // guard by accident, in either direction.
    expect(matches('/uploads')).toBe(false)
    expect(matches('/trending')).toBe(false)
    expect(matches('/meme')).toBe(false)
  })
})
