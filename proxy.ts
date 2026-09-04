import NextAuth from 'next-auth'
import { NextResponse } from 'next/server'

import { authConfig } from './auth.config'

/**
 * `proxy.ts`, not `middleware.ts` — R-21. Next 16 deprecated and renamed the file convention; the
 * exported function is `proxy`, and the `runtime` config option is not available here at all
 * (setting it throws). Proxy runs on the Node.js runtime.
 *
 * WHAT THIS IS: a UX redirect. Signed-out humans who type a protected URL land on the sign-in
 * screen instead of a flash of empty chrome, and they land back where they were headed.
 *
 * WHAT THIS IS NOT: the security boundary — INVARIANT A point 4. Server Actions POST to the page
 * they are used on, so the matcher below governs them only incidentally, and a refactor that moves
 * an action to a different route silently removes that coverage. Authorization lives in
 * `requireUserId()` plus the `userId` filter inside every query in `lib/db/queries.ts`. Full stop.
 */

// A second, adapter-free Auth.js instance. It exists only to decrypt and verify the session
// cookie; importing `@/auth` here instead would pull the Drizzle adapter, the schema module and
// the Neon client into a file that runs on every matched request.
const { auth: withAuth } = NextAuth(authConfig)

export const proxy = withAuth((req) => {
  if (req.auth?.user?.id) return // signed in — carry on

  const signInUrl = new URL('/', req.nextUrl.origin)
  const intended = req.nextUrl.pathname + req.nextUrl.search
  if (intended && intended !== '/') signInUrl.searchParams.set('next', intended)
  return NextResponse.redirect(signInUrl)
})

/**
 * POSITIVE matcher, from roadmap §4.8 plus R-14's two route additions. We enumerate what is
 * protected rather than using a negative lookahead, which makes the exclusions structural rather
 * than incidental:
 *
 *   NOT matched: /               the runs list AND the signed-out sign-in screen (R-24). It
 *                                branches on the session itself; matching it would bounce the
 *                                sign-in page to itself.
 *   NOT matched: /s/:token*      public share pages (D9, F11) — INVARIANT B. NEVER add this.
 *   NOT matched: /api/auth/*     the sign-in flow itself; matching it would loop.
 *   NOT matched: /api/health     the unauthenticated liveness probe (R-14) must answer, not 307.
 *   NOT matched: /api/extract*   Route Handlers (F04). They authenticate with
 *                                `requireUserIdApi()`, because a 307 to an HTML page is a
 *                                terrible answer to `fetch()`.
 *   NOT matched: /api/cron/*     guarded by CRON_SECRET, not by a session (F07).
 *   NOT matched: /_next/*, icons, manifest — free, no exclusion needed.
 *
 * `/r/:path*` covers `/r/[id]` and `/r/[id]/edit` in one line. `/x/:path*` covers the pre-commit
 * review screen (R-1). Adding a protected page means adding a line here; adding a public one means
 * doing nothing, which is the safer default because every page also enforces auth itself.
 *
 * DELIBERATELY OMITTED, and not an oversight: `/nina` (F33) and `/admin/**`. Both are protected —
 * `/nina` by `requireUserId()`, `/admin/**` by `requireAdmin()`, which redirects a signed-out
 * visitor and `notFound()`s a signed-in non-admin — so neither needs this file to be safe, and the
 * only thing a line here would buy is a slightly nicer bounce. It would cost more than that:
 * `?next=` is read by nothing on `/`, and listing `/admin/:path*` in a UX-redirect matcher implies
 * this file is the admin boundary, which is the exact misreading the header above exists to
 * prevent.
 *
 * Matcher values are statically analysed at build time: no variables, no imported constants, no
 * template literals. `tests/auth.proxy.matcher.test.ts` asserts every line of the list above
 * against Next's own matcher compiler.
 */
export const config = {
  matcher: ['/upload', '/r/:path*', '/x/:path*', '/trends', '/me', '/onboarding'],
}
