import type { Metadata, Viewport } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Run Insights',
  description: 'Screenshot a run. Get a coach, not a dashboard.',
}

// viewport-fit=cover is required for env(safe-area-inset-*) on iPhone XS Max — this app's
// design target per docs/design-brief.md.
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en">
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  )
}
