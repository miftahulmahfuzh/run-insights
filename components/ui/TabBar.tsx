'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

import { cn } from '@/lib/cn'

/**
 * The four-tab bottom bar (roadmap §4.8, from the v2 design's `TabBar`).
 *
 * | tab | route | note |
 * |---|---|---|
 * | Runs | `/` | the default landing once signed in |
 * | **Upload** | `/upload` | **centre, raised, coral** — a circular FAB breaking the bar's top edge |
 * | Trends | `/trends` | |
 * | Me | `/me` | profile, records, badge shelf |
 *
 * **Upload is not a peer of the other three.** It is the one flow that matters (roadmap §1), and
 * the information architecture says so out loud: a raised coral circle, larger tap target, its
 * label suppressed because a `+` in a circle needs no caption. Making it the fourth grey icon in a
 * row would be a design that disagrees with the product.
 *
 * `'use client'` for exactly one reason: `usePathname`, for `aria-current`. Nothing else here is
 * interactive — the tabs are plain `<Link>`s, so the bar works before hydration.
 *
 * The bar pads its bottom by `--safe-bottom` (the home-indicator inset), which is inert without
 * `viewport-fit=cover` in the root layout — already set, and load-bearing (see `app/layout.tsx`).
 */

const TABS = [
  { href: '/', label: 'Runs', icon: RunsIcon },
  { href: '/trends', label: 'Trends', icon: TrendsIcon },
  { href: '/me', label: 'Me', icon: MeIcon },
] as const

export function TabBar() {
  const pathname = usePathname()

  // `/` matches only itself; every other tab owns its subtree, so `/r/abc` highlights Runs — a
  // pushed run-detail screen is still "in" the Runs tab even though it is not a tab itself.
  const isActive = (href: string) =>
    href === '/' ? pathname === '/' || pathname.startsWith('/r/') : pathname.startsWith(href)

  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-rule bg-card/95 backdrop-blur-sm"
      style={{ paddingBottom: 'var(--safe-bottom)' }}
    >
      <div className="relative mx-auto grid h-[58px] w-full max-w-[470px] grid-cols-4 items-center">
        <Tab {...TABS[0]} active={isActive(TABS[0].href)} />

        {/* The FAB sits in the second grid cell and overflows upward out of the bar. */}
        <div className="flex justify-center">
          <Link
            href="/upload"
            aria-label="Upload a run"
            aria-current={pathname.startsWith('/upload') ? 'page' : undefined}
            className="absolute -top-5 grid size-14 place-items-center rounded-full bg-z5 text-white shadow-card active:scale-[0.97]"
          >
            <svg viewBox="0 0 24 24" className="size-7" fill="none" aria-hidden="true">
              <path
                d="M12 5v14M5 12h14"
                stroke="currentColor"
                strokeWidth="2.4"
                strokeLinecap="round"
              />
            </svg>
          </Link>
        </div>

        <Tab {...TABS[1]} active={isActive(TABS[1].href)} />
        <Tab {...TABS[2]} active={isActive(TABS[2].href)} />
      </div>
    </nav>
  )
}

function Tab({
  href,
  label,
  icon: Icon,
  active,
}: {
  href: string
  label: string
  icon: (props: { className: string }) => React.ReactNode
  active: boolean
}) {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex h-full flex-col items-center justify-center gap-1 text-[10px] font-semibold',
        active ? 'text-ink' : 'text-ink-3',
      )}
    >
      <Icon className="size-5" />
      {label}
    </Link>
  )
}

/* The icons are hand-written SVG rather than a dependency: three glyphs is not worth a package,
   and an icon font would be a second webfont on a page whose first is already Poppins. */

function RunsIcon({ className }: { className: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
      <path
        d="M4 7h16M4 12h16M4 17h10"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  )
}

function TrendsIcon({ className }: { className: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
      <path
        d="M4 16.5 9 11l3.5 3.5L20 7"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function MeIcon({ className }: { className: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
      <circle cx="12" cy="8.5" r="3.5" stroke="currentColor" strokeWidth="2" />
      <path
        d="M5 20c1.6-3.4 4-5 7-5s5.4 1.6 7 5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  )
}
