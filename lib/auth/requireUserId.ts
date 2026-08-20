import { redirect } from 'next/navigation'

import { auth } from '@/auth'

/**
 * F02's published auth surface — docs/plans/F02-auth-profile.md §1 (INVARIANT A).
 *
 * This file, not `proxy.ts`, is the actual security boundary of the application. Every Server
 * Action and every protected Server Component starts here.
 */

/**
 * The id of the signed-in user, or `null`.
 *
 * Use this only where "signed out" is a legitimate state you intend to render differently: `/`,
 * which is the runs list *and* the sign-in screen (R-24). Everywhere else you want
 * `requireUserId()`, whose return type spares the call site a narrowing branch.
 */
export async function getUserId(): Promise<string | null> {
  const session = await auth()
  return session?.user?.id ?? null
}

/**
 * THE function every Server Action and every protected Server Component opens with:
 *
 *     export async function deleteRunAction(runId: string) {
 *       const userId = await requireUserId()             // <- always line 1
 *       await deleteRun(userId, runId)                   // <- always scoped
 *     }
 *
 * Returns a plain `string`, never `string | null`. When there is no session it calls Next's
 * `redirect('/')`, which THROWS a `NEXT_REDIRECT` control-flow error, so nothing after it runs and
 * `redirect()`'s `never` return type proves that to the compiler.
 *
 * TWO RULES FOR CALLERS:
 *
 *  1. Call it FIRST — before reading `formData`, before validating, before any DB access. It is a
 *     cookie decrypt with zero round trips (that is the whole reason F02 chose the JWT strategy),
 *     so there is no excuse to defer it.
 *
 *  2. NEVER wrap it in a bare try/catch. `redirect()` signals by throwing; a
 *     `catch { return { error: '…' } }` around it swallows the redirect and turns a sign-in bounce
 *     into a confusing error toast. If you must try/catch a block that contains it, hoist the
 *     `requireUserId()` call above the `try`.
 *
 * SERVER COMPONENTS: safe — the redirect renders the sign-in screen.
 * SERVER ACTIONS:    safe — Next serialises the redirect back to the client router.
 * ROUTE HANDLERS:    do NOT use this. A 307 to an HTML page is a terrible answer to `fetch()`.
 *                    Use `requireUserIdApi()` + `unauthorizedJson()` instead — F04's
 *                    `/api/extract` and `/api/extract/[id]` are the callers.
 *
 * Why `redirect('/')` and not something more expressive: `throw new Error()` surfaces as Next's
 * generic error boundary — a red screen for the entirely normal state of a 30-day cookie expiring.
 * `notFound()` lies about what happened. Next 16 does ship an `unauthorized()` interrupt with an
 * `app/unauthorized.tsx` boundary, which is nicer in principle, but it sits behind the experimental
 * `authInterrupts` flag and "no feature flags" is a core tenet of this roadmap. Revisit when it
 * stabilises.
 */
export async function requireUserId(): Promise<string> {
  const userId = await getUserId()
  if (!userId) redirect('/')
  return userId
}

/** Thrown by `requireUserIdApi()`. Catch it at the Route Handler boundary. */
export class UnauthorizedError extends Error {
  readonly status = 401
  constructor(message = 'Unauthorized') {
    super(message)
    this.name = 'UnauthorizedError'
  }
}

/** Route Handler flavour, for F04's `/api/extract` and `/api/extract/[id]`. Throws, never redirects. */
export async function requireUserIdApi(): Promise<string> {
  const userId = await getUserId()
  if (!userId) throw new UnauthorizedError()
  return userId
}

/** The canonical 401 body, so every API route answers identically. */
export function unauthorizedJson(): Response {
  return Response.json({ error: 'Unauthorized' }, { status: 401 })
}
