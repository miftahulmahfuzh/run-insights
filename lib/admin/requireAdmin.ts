import 'server-only'

import { notFound, redirect } from 'next/navigation'

import { auth } from '@/auth'
import { UnauthorizedError } from '@/lib/auth/requireUserId'
import { isAdminEmail } from '@/lib/env'

/**
 * The admin boundary — F33 R23/R24, and the `app/` half of what phase 1 built in `lib/env.ts`.
 *
 * This file is to `/admin/**` what `lib/auth/requireUserId.ts` is to the rest of the app: the
 * ACTUAL security boundary. `proxy.ts` does not match `/admin` (ruling D3 decided it never will —
 * its own header says it is a UX redirect list, not authorization), and it does not match `/api/*`
 * at all, so the checks in here and in the Route Handler are the only thing between a signed-in
 * stranger and Nina's album.
 *
 * ── WHY A NON-ADMIN GETS A 404 ───────────────────────────────────────────────────────────────
 * Three refusals were on the table:
 *
 *   `notFound()`   — CHOSEN. Phase 1's own `.env.example` copy already promises it ("THE GOOGLE
 *                    ACCOUNT YOU SIGN IN WITH MUST APPEAR HERE or those pages 404") and its
 *                    `lib/env.ts` header calls a 404 "the correct symptom". It also tells a
 *                    signed-in stranger nothing: `/admin/nina` and `/admin/nonsense` answer
 *                    identically, so the existence of an admin surface is not confirmed.
 *   `forbidden()`  — REJECTED. Next 16 ships it, but behind the experimental `authInterrupts`
 *                    flag. `requireUserId()`'s header already rejected `unauthorized()` for
 *                    exactly that reason under the roadmap's "no feature flags" tenet. Reversing
 *                    that here would be a flag decision taken by a side door.
 *   `redirect('/')`— REJECTED for the ADMIN-EMAIL case (it is right for the NO-SESSION case). A
 *                    mistyped admin URL silently landing on the runs list looks like a bug.
 *
 * ── SIGNED OUT IS A DIFFERENT ANSWER FROM NOT-AN-ADMIN ──────────────────────────────────────
 * No session → `redirect('/')`, identical to `requireUserId()`, because `/` IS the sign-in screen
 * (R-24) and signing in is the useful next step. A session whose email is not on the list →
 * `notFound()`, because signing in again will not help.
 */

export interface AdminIdentity {
  userId: string
  /** The session email, already verified against `ADMIN_EMAILS`. */
  email: string
}

/**
 * The identity if this session is an admin, `null` otherwise — for the caller that wants to
 * BRANCH rather than refuse. `app/api/admin/nina/upload/route.ts` is the one, because
 * `handleUpload` needs a throw it can turn into a readable 400, not a redirect.
 */
export async function getAdminIdentity(): Promise<AdminIdentity | null> {
  const session = await auth()
  const userId = session?.user?.id
  const email = session?.user?.email
  if (!userId || !isAdminEmail(email)) return null
  return { userId, email: email as string }
}

/**
 * THE function every page and every Server Action under `/admin` opens with:
 *
 *     export default async function Page() {
 *       const { userId } = await requireAdmin()      // <- always line 1
 *       const album = await listNinaAvatars(userId)  // <- always scoped
 *     }
 *
 * Both exits throw a framework control-flow error, so nothing after the call runs. The same two
 * rules as `requireUserId()` apply: call it FIRST, and never wrap it in a bare try/catch.
 */
export async function requireAdmin(): Promise<AdminIdentity> {
  const session = await auth()
  // Both read off the same optional chain: `userId` being truthy does not narrow `session` for
  // the compiler, and reading `session.user.email` after the redirect would need a `!`.
  const userId = session?.user?.id
  const email = session?.user?.email
  if (!userId) redirect('/')
  if (!isAdminEmail(email)) notFound()
  return { userId, email: email as string }
}

/** Thrown by `requireAdminApi()` when the session is real but not an admin. Answer it with a 404. */
export class AdminForbiddenError extends Error {
  readonly status = 404
  constructor(message = 'Not found') {
    super(message)
    this.name = 'AdminForbiddenError'
  }
}

/**
 * Route Handler flavour. Throws, never redirects — a 307 to an HTML page is a terrible answer to
 * `fetch()`, which is the same argument `requireUserIdApi()` makes. `UnauthorizedError` is F02's
 * class, imported rather than redefined, so a handler can keep one catch for both.
 */
export async function requireAdminApi(): Promise<AdminIdentity> {
  const identity = await getAdminIdentity()
  if (identity) return identity
  const session = await auth()
  if (!session?.user?.id) throw new UnauthorizedError()
  throw new AdminForbiddenError()
}

/** The canonical refusal body, so every admin route answers identically and says nothing. */
export function forbiddenJson(): Response {
  return Response.json({ error: 'Not found' }, { status: 404 })
}
