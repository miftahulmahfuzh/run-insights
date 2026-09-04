'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

import { cn } from '@/lib/cn'

/**
 * The five-tab bottom bar (roadmap §4.8, from the v2 design's `TabBar`).
 *
 * | tab | route | note |
 * |---|---|---|
 * | Runs | `/` | the default landing once signed in |
 * | Nina | `/nina` | F33's conversational surface; owns `/nina/*` |
 * | **Upload** | `/upload` | **centre, raised, coral** — a circular FAB breaking the bar's top edge |
 * | Trends | `/trends` | |
 * | Me | `/me` | profile, records, badge shelf |
 *
 * **Upload is still not a peer of the other four.** It is the one flow that matters (roadmap §1),
 * and the information architecture says so out loud: a raised coral circle, larger tap target, its
 * label suppressed because a `+` in a circle needs no caption. Making it the fifth grey icon in a
 * row would be a design that disagrees with the product. F33 adds a tab beside it and changes
 * nothing about that argument.
 *
 * ── WHY THE FIFTH CELL MAKES THE ROADMAP TRUE (F33 / R9) ──────────────────────────────────────
 * §4.8 has described the FAB as "centre, raised, coral" since it was written, and in a four-column
 * grid the FAB's cell centre was at (1 + 0.5) / 4 = 37.5 % of the bar — raised and coral, but not
 * centre. With five columns the third cell's centre is (2 + 0.5) / 5 = exactly 50 %. So the new
 * tab is what finally centres the `+`, which is the whole of the request.
 *
 * `left-1/2 -translate-x-1/2` then makes that centring explicit rather than inferred. Before F33
 * the FAB was placed horizontally by its *static position* inside a `flex justify-center` cell —
 * correct per the Flexbox spec for an absolutely-positioned flex child, and two layers of layout
 * away from being readable. Positioning it against the `relative` bar states the intent in one
 * line. Safe in Tailwind v4, which compiles `translate` and `scale` to separate CSS longhands, so
 * `active:scale-[0.97]` and the translate compose instead of overwriting each other.
 *
 * `'use client'` for exactly one reason: `usePathname`, for `aria-current`. Nothing else here is
 * interactive — the tabs are plain `<Link>`s, so the bar works before hydration.
 *
 * The bar pads its bottom by `--safe-bottom` (the home-indicator inset), which is inert without
 * `viewport-fit=cover` in the root layout — already set, and load-bearing (see `app/layout.tsx`).
 */

/**
 * The bar's own height, matching `h-[58px]` below. Exported because `/nina`'s composer is the
 * app's first fixed bar that stacks *above* the tab bar and has to compute its own `bottom` in
 * JavaScript (`lib/nina/chatview.ts`). **If the class changes, change this with it** — Tailwind
 * cannot read a TypeScript constant, so the number is spelled twice by necessity.
 */
export const TAB_BAR_HEIGHT_PX = 58

/** How far the FAB overhangs the bar's top edge, matching `-top-5` below. Same coupling. */
export const TAB_BAR_FAB_OVERHANG_PX = 20

const TABS = [
  { href: '/', label: 'Runs', icon: RunsIcon },
  { href: '/nina', label: 'Nina', icon: NinaIcon },
  { href: '/trends', label: 'Trends', icon: TrendsIcon },
  { href: '/me', label: 'Me', icon: MeIcon },
] as const

/**
 * `ninaBadge` is a **`ReactNode` prop, not a number**, and that is the load-bearing choice. This
 * component is `'use client'` and cannot await an unread count; it can, however, render a Server
 * Component it was handed as a prop. `AppShell` constructs `<NinaUnreadBadgeSlot />` on the server
 * and passes it down, so the count never crosses into the client bundle and no route handler has
 * to be invented to fetch it.
 *
 * Optional, with a `= {}` default on the parameter, so `app/trends/loading.tsx` and
 * `app/(app)/loading.tsx` keep compiling untouched — a loading fallback has no session to count
 * against anyway.
 */
export function TabBar({ ninaBadge }: { ninaBadge?: React.ReactNode } = {}) {
  const pathname = usePathname()

  // `/` matches only itself; every other tab owns its subtree, so `/r/abc` highlights Runs — a
  // pushed run-detail screen is still "in" the Runs tab even though it is not a tab itself. The
  // same rule already covers F33's second screen: `/nina/about` (phase 13) highlights Nina.
  const isActive = (href: string) =>
    href === '/' ? pathname === '/' || pathname.startsWith('/r/') : pathname.startsWith(href)

  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-rule bg-card/95 backdrop-blur-sm"
      style={{ paddingBottom: 'var(--safe-bottom)' }}
    >
      <div className="relative mx-auto grid h-[58px] w-full max-w-[470px] grid-cols-5 items-center">
        <Tab {...TABS[0]} active={isActive(TABS[0].href)} />
        {/* F33 phase 10: the unread dot, rendered on the server and handed down as a node. */}
        <Tab {...TABS[1]} active={isActive(TABS[1].href)} badge={ninaBadge} />

        {/* The FAB owns the middle cell of five and overflows upward out of the bar. */}
        <div className="flex justify-center">
          <Link
            href="/upload"
            aria-label="Upload a run"
            aria-current={pathname.startsWith('/upload') ? 'page' : undefined}
            className="absolute -top-5 left-1/2 grid size-14 -translate-x-1/2 place-items-center rounded-full bg-z5 text-white shadow-card active:scale-[0.97]"
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

        <Tab {...TABS[2]} active={isActive(TABS[2].href)} />
        <Tab {...TABS[3]} active={isActive(TABS[3].href)} />
      </div>
    </nav>
  )
}

/**
 * One tab. `badge` is an optional node pinned to the icon's top-right — currently only Nina's
 * unread dot uses it.
 *
 * The wrapper around the icon is `relative` and sized to the icon rather than to the whole link, so
 * the dot lands on the glyph and not in the corner of a 58px-tall tap target. The label stays
 * outside it, which is why the dot does not shift when a label is one character longer. The
 * `<span>` is `size-5 grid place-items-center` — exactly the box the icon already occupied — so no
 * tab moves by a pixel on a bar with no badge.
 */
function Tab({
  href,
  label,
  icon: Icon,
  active,
  badge,
}: {
  href: string
  label: string
  icon: (props: { className: string }) => React.ReactNode
  active: boolean
  badge?: React.ReactNode
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
      <span className="relative grid size-5 place-items-center">
        <Icon className="size-5" />
        {badge}
      </span>
      {label}
    </Link>
  )
}

/* The icons are hand-written SVG rather than a dependency: four glyphs is not worth a package,
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

/**
 * A speech balloon with a tail, not Nina's face.
 *
 * The other three glyphs name what the tab *is* — a list, a trend, a person — at 20 px in one
 * stroke weight. A 20 px portrait would be a smudge, and the tab already carries her name in
 * words underneath. Her face belongs at 44 px in the chat header, where it can be read.
 */
function NinaIcon({ className }: { className: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
      <path
        d="M20 12.2c0 3.5-3.6 6.3-8 6.3-.86 0-1.7-.1-2.48-.3L5.2 20.4l1.2-3.1C5.15 16.1 4 14.3 4 12.2 4 8.7 7.6 5.9 12 5.9s8 2.8 8 6.3Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
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
