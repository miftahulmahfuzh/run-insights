import type { Metadata } from 'next'

import { AdminNav } from '@/components/admin/AdminNav'
import { requireAdmin } from '@/lib/admin/requireAdmin'
import { ADMIN_INSTALL, APPLE_WEB_APP } from '@/lib/pwa'

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
 * ── AND WHAT IT IS NOW: A PHONE SHELL BELOW `lg` ───────────────────────────────────────────
 * F33 R23 opened this file with *"this UI is for desktop"* and that framing held until
 * `admin-responsive-nina-intimacy` R1: *"revam admin UI to be responsive to my xs max safari"*.
 * The desktop layout is unchanged at `lg` and above — 1400 px cap, a 224 px rail, a 32 px gap.
 * Below `lg` it is one column, and three things follow from the device:
 *
 *   1. **`lg` is the only structural breakpoint, and 896 px is below it.** An iPhone XS Max in
 *      LANDSCAPE is 896 px wide, so it keeps the phone layout — which is right: landscape gives
 *      414 px of height, and a sidebar would spend a third of the width to save none of it.
 *   2. **Every gutter carries its own inset.** `pt`/`pl`/`pr` are `calc(<gutter> + var(--safe-*))`
 *      rather than a flat `p-6`. All four insets are 0 px on a desktop and in portrait, so this
 *      costs nothing where it is not needed and is the whole fix where it is.
 *   3. **`<main>` reserves `calc(8rem + var(--safe-bottom))` below `lg`.** `AdminNav` is `fixed`
 *      there, so it is out of flow and contributes no grid row; without this the last card of
 *      every page sits under the bar. The number moved from `5rem` to `8rem` with the sixth admin
 *      route, which turned the bar from one 56 px row into two: 128 px against the bar's 113 px
 *      border box (112 px of rows plus `border-t`) leaves 15 px of breathing room, the same shape
 *      as `AppShell`'s `BOTTOM_GAP`. **The two numbers are spelled in two files** — see
 *      `AdminNav`'s `h-28` comment — and `tests/admin.shell.test.ts` is what keeps them in step.
 *
 * `min-h-dvh` was already here and was CHECKED rather than assumed: `dvh` is the DYNAMIC viewport
 * unit, so the column grows and shrinks with Safari's retracting toolbar. `svh` would leave a
 * strip of `--paper` under the shell whenever the toolbar hid; `lvh` would overflow whenever it
 * showed. `dvh` is the correct unit for a min-height on a scrolling document and it stays.
 *
 * **Nothing here clips.** There is no `overflow-x-hidden` on the shell, deliberately: a component
 * inside `<main>` that is wider than 382 px is a bug that phase 2 has to see, and a shell that
 * hides it is a shell that hides the evidence. `min-w-0` on `<main>` keeps the GRID TRACK from
 * being blown out; making each child scroll inside itself is the child's job.
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
  /*
   * ── THE SECOND INSTALL CONTRACT ────────────────────────────────────────────────────────────
   * This is what makes Add to Home Screen from `/admin` produce a tile that opens `/admin`
   * instead of `/`. Metadata is resolved root → nested and duplicate keys are REPLACED, so this
   * line wins over `app/layout.tsx`'s `manifest: '/manifest.webmanifest'` for this segment and
   * everything under it, and for nothing else. The runner's contract does not move.
   *
   * `app/admin/manifest.webmanifest/route.ts` carries the full argument, including why a second
   * domain was not the answer.
   */
  manifest: '/admin/manifest.webmanifest',
  /*
   * ── THE SPREAD IS LOAD-BEARING, NOT TIDINESS ──────────────────────────────────────────────
   * `appleWebApp` is a NESTED metadata field, and Next replaces those WHOLE rather than merging
   * them key by key (`generate-metadata.md` §Merging). Writing `appleWebApp: { title: … }` would
   * therefore drop `capable: true` and `statusBarStyle: 'default'` for every route under `/admin`
   * — and `capable` is the single line that stops the install from being a Safari bookmark.
   *
   * Only `title` differs, and only because it is the label iOS draws under the icon: two tiles on
   * one home screen both reading "Run Insights" is the failure this whole plan set exists to
   * avoid. `statusBarStyle` stays `'default'` on the runner's terms — `lib/pwa.ts` gates
   * translucency on the RUNNER's screens padding `--safe-top`, this meta tag is emitted once from
   * the root, and flipping it here would flip it there.
   *
   * NOTE what is deliberately absent: `icons`. Next applies the file-convention icons only when
   * no explicit `metadata.icons` was set (`next/dist/lib/metadata/resolve-metadata.js`), so an
   * `icons` key here would silently delete `app/admin/apple-icon.png` — the file phase 2 ships and
   * the one Safari actually reads on install. Do not add it.
   */
  appleWebApp: { ...APPLE_WEB_APP, title: ADMIN_INSTALL.shortName },
}

export default async function AdminLayout({ children }: LayoutProps<'/admin'>) {
  await requireAdmin()

  return (
    <div className="min-h-dvh bg-paper-2">
      <div className="mx-auto grid w-full max-w-[1400px] grid-cols-1 gap-6 pt-[calc(1rem+var(--safe-top))] pr-[calc(1rem+var(--safe-right))] pb-[calc(8rem+var(--safe-bottom))] pl-[calc(1rem+var(--safe-left))] lg:grid-cols-[224px_minmax(0,1fr)] lg:gap-8 lg:pt-[calc(2rem+var(--safe-top))] lg:pr-[calc(2rem+var(--safe-right))] lg:pb-8 lg:pl-[calc(2rem+var(--safe-left))]">
        <AdminNav />
        {/* `min-w-0` is load-bearing: without it a wide album grid blows out the grid track
            instead of scrolling inside it. */}
        <main className="min-w-0">{children}</main>
      </div>
    </div>
  )
}
