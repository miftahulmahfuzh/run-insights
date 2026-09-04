import type { Metadata } from 'next'

import { AdminNav } from '@/components/admin/AdminNav'
import { requireAdmin } from '@/lib/admin/requireAdmin'

/**
 * **The app's first deliberately-desktop layout.** F33 R23: *"in fact, i am thinking about a whole
 * new page. but this UI is for desktop."*
 *
 * ── WHY THIS IS A NESTED LAYOUT AND NOT A `(group)` ─────────────────────────────────────────
 * A parenthesised folder exists to hide a URL segment or to declare a second ROOT layout.
 * `/admin` is a segment we want in the URL, and a second root layout would mean re-declaring
 * `<html>`, `<body>` and `next/font` and taking a full page reload on every crossing between the
 * runner's app and this one (`route-groups.md`, Caveats). The root layout keeps supplying Poppins,
 * the tokens, the viewport and the theme colour; this file supplies the chrome.
 *
 * ── WHAT IT IS NOT ──────────────────────────────────────────────────────────────────────────
 * No `AppShell`: that component hardcodes `max-w-[470px]` and pairs itself with `<TabBar />`.
 * Both are wrong here. The tab bar is the runner's five-cell navigation and an admin tool that
 * borrows it invites the runner to tap into it; the 470 px column is `docs/design-brief.md`'s
 * iPhone XS Max target, and the album manager's content is genuinely side-by-side.
 *
 * ── WHAT IT KEEPS ──────────────────────────────────────────────────────────────────────────
 * Every design token: `--paper`, `--paper-2`, `--card`, `--ink*`, `--rule`, `--accent`,
 * `--radius-card`, `--shadow-card`, and the `prefers-color-scheme: dark` block that redefines them
 * all. `Card`, `Button` and `Input` are reused unmodified. The layout is new; the palette is not,
 * which is what stops these pages from reading like a different product.
 *
 * ── THE GATE IS HERE **AND** IN EVERY PAGE AND ACTION ──────────────────────────────────────
 * A layout does not re-run on every navigation within its subtree and cannot be relied on as the
 * only check — Next's own docs are explicit that auth belongs next to the data. So `requireAdmin()`
 * is called here (so a non-admin gets a 404 for `/admin/anything`, including a segment that does
 * not exist yet), and again at the top of every page, and again at the top of every Server Action.
 * Three calls, one cookie decrypt each, zero round trips — the same argument `requireUserId()`
 * makes for being on the hot path of every interaction.
 */

export const metadata: Metadata = {
  title: 'Admin — Run Insights',
  // Belt to the 404's braces: an admin surface has no business in an index.
  robots: { index: false, follow: false },
}

export default async function AdminLayout({ children }: LayoutProps<'/admin'>) {
  await requireAdmin()

  return (
    <div className="min-h-dvh bg-paper-2">
      <div className="mx-auto grid w-full max-w-[1400px] grid-cols-1 gap-6 p-6 lg:grid-cols-[224px_minmax(0,1fr)] lg:gap-8 lg:p-8">
        <AdminNav />
        {/* `min-w-0` is load-bearing: without it a wide album grid blows out the grid track
            instead of scrolling inside it. */}
        <main className="min-w-0">{children}</main>
      </div>
    </div>
  )
}
