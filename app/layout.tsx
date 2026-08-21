import type { Metadata, Viewport } from 'next'
import { Poppins } from 'next/font/google'
import { APPLE_WEB_APP, INSTALL } from '@/lib/pwa'
import './globals.css'

/*
 * One family, per the design system's Foundations page. Poppins is not a variable font, so the
 * weights it actually uses are enumerated — 500 body, 600 numbers and stats, 700 titles.
 *
 * next/font SELF-HOSTS this: the files are fetched once at build time and served from our own
 * origin, so there is no runtime request to Google and no third-party CSP entry. The tradeoff is
 * a build-time network dependency — a build on a machine that cannot reach fonts.googleapis.com
 * will fail. If that ever becomes a problem, switch to next/font/local with the woff2 committed.
 */
const poppins = Poppins({
  subsets: ['latin'],
  weight: ['500', '600', '700'],
  variable: '--font-poppins',
  display: 'swap',
})

export const metadata: Metadata = {
  title: INSTALL.name,
  description: INSTALL.description,
  applicationName: INSTALL.name,
  /*
   * ── THE INSTALL CONTRACT ─────────────────────────────────────────────────────────────────────
   * These three entries are what make "Add to Home Screen" produce an app rather than a bookmark
   * with a letter on it. The values live in `lib/pwa.ts` because `app/manifest.ts` needs the same
   * ones. See that file for why `statusBarStyle` is 'default' and not 'black-translucent' — the
   * short version is that almost nothing in this app pads `env(safe-area-inset-top)` yet.
   *
   * The home-screen ICON is not configured here: `app/icon.png` and `app/apple-icon.png` are file
   * conventions Next discovers by name and turns into `<link rel="icon">` and
   * `<link rel="apple-touch-icon">`. The apple-touch-icon is the one Safari reads on install, and
   * a manifest alone does not give iOS a home-screen icon — which is why that file, not this
   * block, is what fixed the "R".
   */
  manifest: '/manifest.webmanifest',
  appleWebApp: APPLE_WEB_APP,
  /*
   * Stop iOS auto-linking a pace like "5:42" as a phone number and "20 Aug" as a calendar event.
   * Left alone, Safari recolours and underlines them, which quietly wrecks every stat on the page.
   */
  formatDetection: { telephone: false, date: false, address: false, email: false },
  other: {
    /*
     * Next 16 renders `appleWebApp.capable` as the standardised `mobile-web-app-capable` and does
     * NOT emit the older `apple-mobile-web-app-capable`. Safari has honoured the standard name
     * since iOS 16.4, and the design target (iPhone XS Max, docs/design-brief.md) runs up to iOS
     * 18 — so on a current phone this line is redundant. It stays because standalone mode is the
     * entire point of the change, and one line of insurance is cheaper than finding out on an
     * un-updated device that Add to Home Screen still opens a browser tab.
     */
    'apple-mobile-web-app-capable': 'yes',
  },
}

// viewport-fit=cover is required for env(safe-area-inset-*) on iPhone XS Max — this app's
// design target per docs/design-brief.md. The design system's fixed chrome (the TabBar) pads
// itself by --safe-bottom, which is inert without this.
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  /*
   * The status-bar tint, and the ONLY place it can follow the colour scheme — a manifest carries a
   * single `theme_color`, so this media-matched pair is what actually makes an installed app's
   * status bar dark at night instead of sky blue. Both values are `--paper` from globals.css.
   */
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: INSTALL.paper },
    { media: '(prefers-color-scheme: dark)', color: INSTALL.paperDark },
  ],
}

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en" className={poppins.variable}>
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  )
}
