import type * as React from 'react'

import { cn } from '@/lib/cn'
import { TabBar } from './TabBar'

/**
 * The frame every tabbed screen sits in: a 470px column, 20px gutters, and enough bottom padding to
 * clear the fixed tab bar plus the home-indicator inset.
 *
 * **Which screens get the bar, and why it is a prop rather than a layout file.** Roadmap §4.8 names
 * `/`, `/upload`, `/trends` and `/me` as the four tabs; `/x/[id]`, `/r/[id]/edit`, `/onboarding`
 * and `/s/[token]` are pushed screens or standalone pages with no bar at all. `/r/[id]` is the one
 * case the roadmap and F08's own wireframes read differently — §4.8 calls it a pushed screen, and
 * §2.2's wireframe draws the bar at the bottom of it. **The wireframe wins**: a run detail page is
 * where a reader lands from a share link or after a commit and then wants to go somewhere, and a
 * screen with no way out is worse than one whose chrome slightly over-claims.
 *
 * Not a route-group `layout.tsx` because `/upload`, `/x/*` and `/r/[id]/edit` are F04/F05's screens
 * with their own full-bleed chrome, and wrapping them by directory would take a layout decision
 * away from the feature that owns them.
 */
export function AppShell({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <>
      <main
        className={cn(
          'mx-auto min-h-dvh w-full max-w-[470px] p-5',
          // 58px bar + the FAB's overhang + breathing room, then the safe-area inset on top.
          'pb-[calc(6rem+var(--safe-bottom))]',
          className,
        )}
      >
        {children}
      </main>
      <TabBar />
    </>
  )
}

/**
 * The screen title row: a name on the left, at most one plain-text link on the right.
 *
 * A plain-text link, never an icon button — "TRENDS →" is unambiguous at a glance and an icon is a
 * guess. The design brief's reading-app stance, applied to navigation.
 */
export function ScreenHeader({ title, action }: { title: string; action?: React.ReactNode }) {
  return (
    <header className="mb-5 flex items-baseline justify-between gap-3">
      <h1 className="text-[26px] font-bold tracking-[-0.02em] text-ink">{title}</h1>
      {action}
    </header>
  )
}
