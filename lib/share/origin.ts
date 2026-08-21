import 'server-only'

import { authEnv } from '@/lib/env'

/**
 * Where a share link points, resolved server-side, in one place.
 *
 * ── WHY NOT `window.location.origin` ───────────────────────────────────────────────────────────
 * Because the link outlives the tab it was minted in. A runner who opens a Vercel preview
 * deployment, taps Share and sends the result over WhatsApp has just sent a URL on a hostname that
 * dies at the next push. `roadmap §4.8` is explicit: *"Share links are built from that origin —
 * never from `VERCEL_URL`, whose per-deployment hostname would produce links that die on the next
 * deploy."* This module is where that rule is mechanically true rather than remembered.
 *
 * ── THE ORDER, AND WHY EACH RUNG IS WHERE IT IS ────────────────────────────────────────────────
 *   1. `AUTH_URL` — production only, and set to `https://runins.site`, the canonical apex (§4.8).
 *      It is already the one variable in this app whose entire job is "the origin a user reaches us
 *      at", so a second variable meaning the same thing would only be a chance to disagree.
 *   2. `VERCEL_PROJECT_PRODUCTION_URL` — the project's *stable* production hostname. NOT
 *      `VERCEL_URL`, which is per-deployment. This rung exists so a production build with
 *      `AUTH_URL` unset still mints durable links instead of localhost ones.
 *   3. `http://localhost:$PORT` — development. A link that only works on this laptop is the honest
 *      answer when there is no public origin to name.
 */
export function shareOrigin(): string {
  const configured = authEnv().AUTH_URL
  if (configured) return configured.replace(/\/+$/, '')

  // Vercel injects this on every deployment of a project, always pointing at production — it is
  // stable across deploys in a way VERCEL_URL is not. Read from process.env rather than lib/env.ts
  // because it is a platform-provided value, not part of the roadmap's §4.1 contract.
  const production = process.env.VERCEL_PROJECT_PRODUCTION_URL
  if (production) return `https://${production.replace(/\/+$/, '')}`

  return `http://localhost:${process.env.PORT ?? 3000}`
}

/** The one place a token becomes a URL. `/s/<token>`, absolute, no trailing slash. */
export function shareUrl(token: string): string {
  return `${shareOrigin()}/s/${token}`
}
