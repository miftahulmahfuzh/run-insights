import type { MetadataRoute } from 'next'

import { INSTALL, PWA_ICONS } from '@/lib/pwa'

/**
 * Served at `/manifest.webmanifest`, which is the path `metadata.manifest` in the root layout
 * points at. This file plus the `appleWebApp` metadata beside it is the whole of what turns "Add
 * to Home Screen" from a Safari bookmark — URL bar, tab strip and share bar eating roughly 140px
 * of an 896px screen — into something that opens full-screen carrying its own icon.
 *
 * A `manifest.ts` route rather than a static `manifest.json` so the name, the description and the
 * two colours come from `lib/pwa.ts`, which is also what `app/layout.tsx` and the install test
 * read. The alternative is the same four values written out in three files, and the copy is always
 * the one that goes stale.
 *
 * `display: 'standalone'` and not `'fullscreen'`: standalone drops the browser chrome but keeps the
 * status bar, so the clock, the battery and the signal stay visible. Fullscreen takes those too,
 * which is right for a game and wrong for an app someone opens between intervals to read a number.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: INSTALL.name,
    short_name: INSTALL.shortName,
    description: INSTALL.description,
    id: '/',
    start_url: '/',
    /*
     * Scope the whole origin. Anything outside scope opens in a browser tab instead of in the
     * installed app, and this app's own share links (`/s/<token>`) and auth callbacks are all
     * same-origin — a narrower scope would eject a runner into Safari mid-session.
     */
    scope: '/',
    display: 'standalone',
    /*
     * Every screen is a 470px column (see `AppShell`); there is no landscape layout to rotate
     * into, so asking for portrait is describing the app rather than restricting it.
     */
    orientation: 'portrait',
    lang: 'en',
    dir: 'ltr',
    background_color: INSTALL.paper,
    theme_color: INSTALL.paper,
    // `readonly` tuple from lib/pwa.ts; the Manifest type wants a mutable array.
    icons: [...PWA_ICONS],
  }
}
