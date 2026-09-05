import type * as React from 'react'

import { ChatChrome } from '@/components/nina/ChatChrome'
import { NinaSidebarProvider } from '@/components/nina/NinaSidebar'
import { NinaUnreadBadgeSlot } from '@/components/nina/NinaUnreadBadge'
import { cn } from '@/lib/cn'
import { TabBar } from './TabBar'

/**
 * The frame every tabbed screen sits in: a 470px column, 20px gutters, and enough bottom padding to
 * clear whatever fixed chrome that screen has.
 *
 * **Which screens get the bar, and why it is a prop rather than a layout file.** Roadmap §4.8 names
 * `/`, `/upload`, `/trends` and `/me` as the four tabs, and **F33 adds `/nina` as the fifth**;
 * `/x/[id]`, `/r/[id]/edit`, `/onboarding` and `/s/[token]` are pushed screens or standalone pages
 * with no bar at all. `/r/[id]` is the one case the roadmap and F08's own wireframes read
 * differently — §4.8 calls it a pushed screen, and §2.2's wireframe draws the bar at the bottom of
 * it. **The wireframe wins**: a run detail page is where a reader lands from a share link or after
 * a commit and then wants to go somewhere, and a screen with no way out is worse than one whose
 * chrome slightly over-claims.
 *
 * Not a route-group `layout.tsx` because `/upload`, `/x/*` and `/r/[id]/edit` are F04/F05's screens
 * with their own full-bleed chrome, and wrapping them by directory would take a layout decision
 * away from the feature that owns them.
 */

/**
 * Which chrome a screen gets, and therefore how much room the frame leaves at the bottom for it.
 *
 * **One prop for both, because they cannot be allowed to disagree.** A screen whose padding clears
 * a bar it does not render ends in a strip of empty paper; a screen that renders a bar its padding
 * does not clear ends in a sliced bubble. Two props would make both states expressible.
 *
 *   - `'tabs'` — the four tabs. The bar, and nothing above it.
 *   - `'chat'` — `/nina` (R1). **No bar at all**, a fixed composer, and one floating control that
 *     pulls the bar up on request (`components/nina/ChatChrome.tsx`). The user's reason is the
 *     requirement: "make the chat full screen. so hide the bottom bar completely (because phone
 *     screen size is small)".
 *
 * Renamed from `bottomGap` / `AppShellBottomGap` in this phase, because the value now selects the
 * chrome as well as the gap and the old name described half of what it does.
 */
export type AppShellScreen = 'tabs' | 'chat'

const BOTTOM_GAP: Record<AppShellScreen, string> = {
  /*
   * 96px, then the safe-area inset on top: the 58px bar, and breathing room so the last card is
   * not flush against it.
   *
   * This was documented as "58px bar + the FAB's overhang + breathing room", when `/upload` was a
   * raised coral circle reaching 20px above the bar's top edge. That circle is a normal tab cell
   * now (`components/ui/TabBar.tsx`) and the VALUE here is deliberately unchanged: the repo owner
   * reported a gap between two bars on `/nina`, not too much padding under the content on these
   * four screens, and shrinking this would change four screens nobody complained about. The 20px
   * that used to be the overhang is simply breathing room now, which is what it always looked
   * like.
   */
  tabs: 'pb-[calc(6rem+var(--safe-bottom))]',
  /*
   * R1. NO BAR: the composer's own 68px (a 44px control in a py-3 bar), the 8px gap above it, the
   * floating control's 32px tap target, and 12px so the newest bubble is not flush against it.
   * 68 + 8 + 32 + 12 = 120, which is exactly `7.5rem` — no rounding needed, where the pre-R1
   * literal `10.5rem` (168px) rounded up from 78 + 68 + 16 = 162.
   *
   * WAS `8.5rem` (136px), from a 44px control. The repo owner asked for the two floating controls
   * to be "much smaller", `CHROME_CONTROL_PX` went 44 -> 32, and this literal has to follow or the
   * screen keeps reserving 12px of padding for a control that no longer occupies it — which reads
   * as a gap under the conversation rather than as a bug, and so would have survived review.
   *
   * Those numbers are `CHROME_CONTROL_PX`, `CHROME_CONTROL_GAP_PX` and `COMPOSER_RESTING_PX` in
   * `lib/nina/chrome.ts`, plus `Composer`'s own geometry; Tailwind cannot read a constant, so a
   * change to any of them changes this literal. `TAB_BAR_HEIGHT_PX` is deliberately NOT in this
   * sum — the bar is not below the composer on this screen.
   *
   * FIXED, not dynamic. This padding is the document's height: making it follow the reveal would
   * move the scroll position every time the bar toggles, and `MessageList`'s auto-scroll would
   * chase it. So while the bar is showing, the composer rises by the bar's clearance and the last
   * bubble sits behind it for those five seconds — which is the right trade, because a runner who
   * pulls up the bar is on his way to another tab, not re-reading the last line.
   */
  chat: 'pb-[calc(7.5rem+var(--safe-bottom))]',
}

export function AppShell({
  children,
  className,
  screen = 'tabs',
}: {
  children: React.ReactNode
  className?: string
  screen?: AppShellScreen
}) {
  /*
   * ── WHY THE SIDEBAR'S PROVIDER IS HERE AND NOT IN `app/nina/page.tsx` ──────────────────────
   * MEASURED IN PRODUCTION: it was in the page, and the `>` that opens the chat list did not
   * render at all.
   *
   * `NinaSidebarTrigger` reads `useNinaSidebar()` and returns `null` outside a provider — a
   * deliberate design, so a `ChatChrome` on a screen with no sidebar simply has no `>`. But
   * `ChatChrome` is rendered HERE, as a sibling of `<main>`, while the page's provider wrapped
   * only what is inside `{children}`. So the trigger was a context consumer mounted outside its
   * own provider on the one screen that needs it, and the panel was reachable only by typing
   * `?sidebar=1` by hand. The page's comment asserted the trigger "lives inside `ChatChrome`
   * (rendered by `ChatScreen`)"; the first half is true and the second is not, and that single
   * wrong word is the whole bug.
   *
   * It also moved the `^`: with the trigger rendering `null`, the toggle became the first DOM
   * child of `ChatChrome`'s `grid-cols-3` lane and `justify-self-center` centred it in column
   * ONE, so R1's "bottom middle" control sat a fifth of the way across the screen. One cause,
   * two symptoms.
   *
   * Wrapping here puts `{children}` (the panel) and `ChatChrome` (the trigger) under ONE
   * provider, which is what the provider was always for: `pushedRef` is the single piece of
   * state they must agree about — whether this session pushed the history entry the back gesture
   * will pop — and two providers would give them one each, which is this bug again but quieter.
   *
   * Gated on `screen === 'chat'` because no other screen has a sidebar, and this file stays a
   * Server Component: rendering a client provider from here is a boundary, not a conversion.
   */
  const shell = (
    <>
      <main
        className={cn('mx-auto min-h-dvh w-full max-w-[470px] p-5', BOTTOM_GAP[screen], className)}
      >
        {children}
      </main>
      {/* F33 phase 10. `AppShell` has no `'use client'`, so it can construct the server-rendered
          element that `TabBar` — which does — then renders as a child. That is what puts the
          unread count on the tab without a client fetch, a poll, or a prop threaded through every
          page. Its own `<Suspense fallback={null}>` lives inside the slot.

          R1 adds one hop for the conversation screen and keeps the same seam: `ChatChrome` is the
          client component that owns the reveal state, and it renders `TabBar` with the badge it
          was handed. The state cannot live here (this file must stay a Server Component — five
          pages import it, and `tests/share.bundle.test.ts` exists because this import graph leaked
          a session read once already) and it cannot live in `TabBar` either, because a hidden bar
          is translated off screen and a control inside it would be unreachable. */}
      {screen === 'chat' ? (
        <ChatChrome ninaBadge={<NinaUnreadBadgeSlot />} />
      ) : (
        <TabBar ninaBadge={<NinaUnreadBadgeSlot />} />
      )}
    </>
  )

  return screen === 'chat' ? <NinaSidebarProvider>{shell}</NinaSidebarProvider> : shell
}

/**
 * The screen title row: a name on the left, at most one plain-text link on the right.
 *
 * A plain-text link, never an icon button — "TRENDS →" is unambiguous at a glance and an icon is a
 * guess. The design brief's reading-app stance, applied to navigation.
 *
 * `/nina` deliberately does not use this: a conversation's identity is a face and a name, not a
 * title and a link, so that screen builds its own header row out of `NinaAvatar`. See
 * `app/nina/page.tsx` for the argument.
 */
export function ScreenHeader({ title, action }: { title: string; action?: React.ReactNode }) {
  return (
    <header className="mb-5 flex items-baseline justify-between gap-3">
      <h1 className="text-[26px] font-bold tracking-[-0.02em] text-ink">{title}</h1>
      {action}
    </header>
  )
}
