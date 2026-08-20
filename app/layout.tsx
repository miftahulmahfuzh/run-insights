import type { Metadata, Viewport } from 'next'
import { Poppins } from 'next/font/google'
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
  title: 'Run Insights',
  description: 'Screenshot a run. Get a coach, not a dashboard.',
}

// viewport-fit=cover is required for env(safe-area-inset-*) on iPhone XS Max — this app's
// design target per docs/design-brief.md. The design system's fixed chrome (the TabBar) pads
// itself by --safe-bottom, which is inert without this.
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en" className={poppins.variable}>
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  )
}
