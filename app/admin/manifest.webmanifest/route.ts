import type { MetadataRoute } from 'next'

import { ADMIN_INSTALL, PWA_ICONS } from '@/lib/pwa'

/**
 * The admin app's web manifest, served at `/admin/manifest.webmanifest` and linked from
 * `app/admin/layout.tsx`. **The one line that matters is `start_url: '/admin'`.**
 *
 * ── THE BUG THIS FIXES ─────────────────────────────────────────────────────────────────────────
 * *"i use /admin page so much, i want to make it into a shortcut (ios safari -> create into a
 * homepage). i could do this, but the resulting shortcut only opens to runins.site/"*. Safari
 * launches an installed tile from the `start_url` of whatever manifest the page linked, not from
 * the URL that was on screen — and every page linked the root one, which says `/`. So the tile was
 * installing the runner's app, correctly, from an admin page.
 *
 * ── AND THE ANSWER TO "SHOULD I BUY A NEW DOMAIN?": NO ─────────────────────────────────────────
 * A second domain does not fix this and is not needed for it. The launch URL comes from
 * `start_url`, not from the hostname, so `admin.example.com` serving this surface at `/` would
 * need exactly the same manifest field to be worth anything — and it would additionally cost a DNS
 * record, a certificate, a second `AUTH_URL` and a second Google OAuth redirect origin, a session
 * cookie `auth.config.ts` does not issue cross-origin (so every admin visit would start with a
 * fresh sign-in), and a `next.config.ts` `images.remotePatterns` review. This file is what a
 * domain would have been bought to achieve.
 *
 * ── WHY A ROUTE HANDLER AND NOT A SECOND `manifest.ts` ─────────────────────────────────────────
 * The `manifest` file convention is root-of-`app` only. Verified in the installed framework rather
 * than assumed: `next/dist/lib/metadata/is-metadata-route.js` anchors its matcher at the app root
 * (`^[\\/]manifest…`), so this directory is compiled as an ordinary Route Handler. The name still
 * ends in `.webmanifest` so the URL matches the shape of the one the root convention produces —
 * two manifests on one origin served at two similarly-named paths is the legible outcome.
 *
 * ── THE THREE FIELDS THAT MAKE THESE TWO APPS AND NOT ONE ──────────────────────────────────────
 *   `start_url: '/admin'`  what the tile opens. The requirement.
 *   `id: '/admin'`         what an installer uses to decide whether it already has this app. The
 *                          root manifest sets `id: '/'` explicitly, so leaving this unset (it
 *                          would default from `start_url`) would work — but stating it is what
 *                          makes the pair readable, and an install keyed on an implicit value is
 *                          one refactor away from being merged into the runner's app.
 *   `scope: '/'`           NOT `/admin`, and this is load-bearing. Anything outside scope opens in
 *                          a browser tab instead of in the installed app, and
 *                          `lib/admin/requireAdmin.ts` answers a session-less request with
 *                          `redirect('/')`. A narrower scope would eject the installed admin app
 *                          into Safari on exactly the day the cookie expired — which is the day
 *                          the redirect to the sign-in screen is the point.
 *
 * `orientation: 'any'` and not the root manifest's `'portrait'`: that value is justified there by
 * *"there is no landscape layout to rotate into"*, and `/admin` has one. `app/admin/layout.tsx`
 * says so out loud — an XS Max in landscape is 896 px, below `lg`, and therefore keeps the phone
 * layout deliberately.
 *
 * The icons are the runner's, for now. Phase 2 of this plan set swaps `PWA_ICONS` for
 * `ADMIN_PWA_ICONS` and ships `app/admin/apple-icon.png`, which is the file Safari actually draws
 * on install. Until then both tiles look the same, which is a real cost and a separate change.
 */

/*
 * The body is four constants and a fixed icon list, with no request read and no data access. A
 * hand-written Route Handler is DYNAMIC by default in Next 16, unlike the `manifest.ts` convention
 * route, which the docs describe as "cached by default". This is what makes the two behave alike.
 */
export const dynamic = 'force-static'

export function GET(): Response {
  const manifest: MetadataRoute.Manifest = {
    name: ADMIN_INSTALL.name,
    short_name: ADMIN_INSTALL.shortName,
    description: ADMIN_INSTALL.description,
    id: '/admin',
    start_url: '/admin',
    scope: '/',
    display: 'standalone',
    orientation: 'any',
    lang: 'en',
    dir: 'ltr',
    background_color: ADMIN_INSTALL.paper,
    theme_color: ADMIN_INSTALL.paper,
    // `readonly` tuple from lib/pwa.ts; the Manifest type wants a mutable array.
    icons: [...PWA_ICONS],
  }

  /*
   * `Response.json()` would send `application/json`. The registered type for a manifest is
   * `application/manifest+json` — Chrome warns on the wrong one and it costs nothing to be right.
   * The header object overrides what `Response.json` sets.
   */
  return Response.json(manifest, {
    headers: { 'content-type': 'application/manifest+json' },
  })
}
