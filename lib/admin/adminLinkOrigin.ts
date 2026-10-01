import 'server-only'

import { getAdminIdentity } from '@/lib/admin/requireAdmin'
import { shareOrigin } from '@/lib/share/origin'

/**
 * **R4's whole gate: the origin an admin may mint a `/admin/nina` link from, or `null`.**
 *
 * The three client entry points onto a full-view Nina photograph — `/nina`, `/nina/about` and
 * `/photo/[kind]/[id]` — call this beside the reads they already run and thread the answer down as
 * ONE nullable prop. `null` is not "render the button disabled": it is "there is no origin, so
 * there is nothing to render and nothing was sent". A non-admin's RSC payload therefore carries no
 * admin origin at all, which makes hiding the control structural rather than a render-time `if`
 * over a value that shipped anyway (plan invariant 6).
 *
 * ── ONE NULLABLE PROP, NOT AN `isAdmin` BOOLEAN BESIDE AN ALWAYS-SENT ORIGIN ──────────────────
 * The button needs both facts, and two props that must agree are two props that will one day
 * disagree. Collapsing them also removes the only way to get R4 subtly wrong: there is no state in
 * which the origin is present and the verdict says no.
 *
 * ── WHY `getAdminIdentity()` IS NOT CALLED UNCONDITIONALLY (MEASURED — PLAN INVARIANT 7) ──────
 * `getAdminIdentity` → `isAdminEmail` (`lib/env.ts:261`) → `adminEnv()` → `load('admin', …)`,
 * which `fail()`s with a THROWN Error when `ADMIN_EMAILS` is missing or empty (`lib/env.ts:183-205`,
 * and `nonEmpty` is `z.string().min(1)` at `:34`). `isAdminEmail`'s early `email == null` return
 * means a signed-OUT visitor never reaches that; a signed-IN one does. `ADMIN_EMAILS` is
 * Production-scope only in Vercel and is absent from this repo's `.env.local`, so an unguarded call
 * here would 500 the chat screen for every signed-in user on every preview deployment and in every
 * plain local run. Hiding a button is never worth taking the screen down.
 *
 * ── WHY A PRESENCE PROBE AND NOT A try/catch ─────────────────────────────────────────────────
 * A `catch` around the call would also swallow an `auth()` failure — a corrupt session cookie, a
 * decryption error — and answer "not an admin" to a question that was never about admin-ness. So
 * the guard is a PRECONDITION on exactly the condition that makes the lazy group throw, and
 * nothing else; there is no `try`/`catch` in this module, and an auth failure propagates from here
 * exactly as it does from `requireUserId()`.
 *
 * The raw read below is a PRESENCE PROBE and never a value read: the string is not split, not
 * lowercased, and never compared to an address. `lib/env.ts` remains the only parser of the list
 * and `isAdminEmail` the only predicate — the admin address is not written in this repo's source
 * and must not be (`lib/env.ts:149`: "it is a personal address"). `ADMIN_EMAILS` is deliberately
 * not on `scripts/check-client-secret-boundary.mjs`'s secret list, so this read needs no exemption.
 *
 * ── `shareOrigin()` CANNOT BE THE NEW THROW ──────────────────────────────────────────────────
 * It reads `authEnv().AUTH_URL`, and `AUTH_URL` is `.optional()` (`lib/env.ts:82-85`); the group's
 * three required keys are the ones `auth()` itself already needed to produce the identity this
 * function just received. So by the time this line runs, that group has already loaded. And it is
 * `shareOrigin()` rather than `window.location.origin` on purpose: this link is pasted into
 * WhatsApp and opened on a desktop later, and a preview deployment's hostname dies at the next
 * push (repo invariant 9; `lib/share/origin.ts`'s own header carries the argument).
 */
export async function resolveAdminLinkOrigin(): Promise<string | null> {
  const configured = process.env.ADMIN_EMAILS
  if (configured == null || configured.length === 0) return null

  const identity = await getAdminIdentity()
  if (identity === null) return null

  return shareOrigin()
}
