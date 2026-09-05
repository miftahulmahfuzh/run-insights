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
 * | **New** | `/upload` | the centre cell of five, and the only coral one |
 * | Trends | `/trends` | |
 * | Me | `/me` | profile, records, badge shelf |
 *
 * ── UPLOAD WAS A RAISED FAB, AND THE REPO OWNER ASKED FOR IT NOT TO BE ────────────────────────
 * Until this change `/upload` was not a peer of the other four. It was a 56 px coral circle,
 * `absolute -top-5` against the `relative` grid and therefore out of flow, so 20 px of it hung
 * above the nav's top edge and painted over whatever screen was behind — on `/nina`, over the
 * newest message bubble. The argument for that shape was real and belongs on the record: upload is
 * the one flow that matters (roadmap §1), the information architecture said so out loud, and a
 * larger raised target with its caption suppressed said it louder than a fifth grey icon in a row.
 *
 * What replaced it was not a disagreement about emphasis. The request was **"replace the + button
 * to a normal 'new' text that does not take more space outside the bottom bar"** — a constraint on
 * geometry, that a bar may not occupy pixels above its own border box. So the emphasis moved to
 * somewhere that costs no space: the cell is the same `size-5` glyph over a `text-[10px]` caption
 * as its four neighbours, and it is coral at rest AND when active (`accent` on `Tab` below), which
 * is the one thing no other tab does. It keeps the `+` glyph, because the objection was to a
 * control taking space outside the bar and not to the `+`.
 *
 * F33's centring argument is **superseded, not wrong**, and it is why `/upload` is the THIRD of the
 * five entries in `TABS` rather than appended to the end. §4.8 has described this tab as "centre"
 * since it was written; in a four-column grid the cell centre was at (1 + 0.5) / 4 = 37.5 %, and
 * with five columns the third cell's centre is (2 + 0.5) / 5 = exactly 50 %. What F33 made true of
 * a raised circle is now true of a caption, and the caption needs no `left-1/2 -translate-x-1/2`
 * to say so — a grid cell is centred by the grid.
 *
 * ── WHY THE HIDE TRANSFORM IS A PLAIN `100%` ──────────────────────────────────────────────────
 * Nothing paints above the nav's border box any more, so translating the nav by its own height
 * moves all of it off screen. It used to need `calc(100% + 20px)` from a `TAB_BAR_FAB_OVERHANG_PX`
 * constant: measuring up from the viewport bottom, `100%` is 1 px of `border-t` plus the 58 px grid
 * plus the nav's own `--safe-bottom` padding, while the FAB's `size-14` box reached `safe + 78`, so
 * `100%` was 19 px short and 20 px of coral circle stayed on screen with the bar supposedly hidden.
 * That constant is deleted with the FAB. If anything is ever positioned out of this nav's flow
 * again, this transform is the second thing that breaks.
 *
 * `'use client'` for exactly one reason: `usePathname`, for `aria-current`. Nothing else here is
 * interactive — the tabs are plain `<Link>`s, so the bar works before hydration.
 *
 * The bar pads its bottom by `--safe-bottom` (the home-indicator inset), which is inert without
 * `viewport-fit=cover` in the root layout — already set, and load-bearing (see `app/layout.tsx`).
 */

/**
 * The **grid's** own height, matching `h-[58px]` below. **If the class changes, change this with
 * it** — Tailwind cannot read a TypeScript constant, so the number is spelled twice by necessity.
 *
 * This is the grid and not the bar: the nav's border box is this plus `TAB_BAR_BORDER_PX`, and the
 * bar's top *edge* is therefore `TAB_BAR_OUTER_HEIGHT_PX` up. Anything positioning itself against
 * that edge wants the outer height — which is what `/nina`'s composer, the app's first fixed bar
 * that stacks *above* the tab bar and computes its own `bottom` in JavaScript
 * (`lib/nina/chatview.ts`), reads. Still exported on its own because the outer height is derived
 * from it, and because `components/ui/AppShell.tsx` and `components/ui/PhotoViewer.tsx` cite it by
 * name when they explain their own Tailwind literals.
 */
export const TAB_BAR_HEIGHT_PX = 58

/**
 * The bar's `border-t`, in px — 1, matching the `border-t` on the `<nav>` above. Spelled as a
 * number for the same reason `TAB_BAR_HEIGHT_PX` is: the composer stacked above this bar computes
 * its own `bottom` in JavaScript and has to add this term, and Tailwind cannot read a TypeScript
 * constant. **If that class changes — a different width, or no border at all — change this with
 * it**, or every clearance built on it is wrong by exactly the difference.
 */
export const TAB_BAR_BORDER_PX = 1

/**
 * The bar's **outer** height — 59 px: the grid plus the `border-t` the grid sits under. This, and
 * not `TAB_BAR_HEIGHT_PX`, is what a fixed bar stacked above the tab bar must clear, because the
 * border is part of the nav's border box and the bar's top border IS its top edge.
 *
 * MEASURED (R2): the border was never a term in any clearance. `/nina`'s composer cleared the grid
 * plus the old Upload FAB's overhang, the bar's top edge sat a pixel above the grid, and the
 * scrolling conversation was visible through the seam between the two bars — still 1 px of it once
 * the overhang was gone. The sum lives here rather than in `ChatChrome` and `ChatScreen` because a
 * caller cannot forget a term that is inside the constant.
 */
export const TAB_BAR_OUTER_HEIGHT_PX = TAB_BAR_HEIGHT_PX + TAB_BAR_BORDER_PX

/**
 * Five entries for a five-column grid, consumed positionally below. `/upload` is the THIRD
 * deliberately: `(2 + 0.5) / 5` is exactly the middle of the bar, and appending it to the end would
 * move it to 90 % of the bar's width while every type still checked. See the header.
 *
 * `accent` rides in the data because it is a property of this tab and not of where it is rendered:
 * upload is the one flow that matters (roadmap §1), and coral is how the IA says so now that the
 * raised circle no longer can.
 */
const TABS = [
  { href: '/', label: 'Runs', icon: RunsIcon },
  { href: '/nina', label: 'Nina', icon: NinaIcon },
  { href: '/upload', label: 'New', icon: NewIcon, accent: true },
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
/**
 * `hidden` is R1's whole of this file: `/nina` is a full-screen conversation with no tab bar, and
 * one floating control in `components/nina/ChatChrome.tsx` slides this one back up.
 *
 * Optional with a `false` default, for the same reason `ninaBadge` is optional: `app/(app)/loading.tsx`
 * and `app/trends/loading.tsx` render a bare `<AppShell>`, and `/`, `/upload`, `/trends` and `/me`
 * keep their bar unconditionally. The four of them are byte-identical in behaviour after this
 * change — a `transition-[translate]` on an element whose translate never changes does nothing.
 *
 * **`inert`, not `aria-hidden` and not `hidden`.** A bar translated off screen is still in the tab
 * order and still reachable by a screen reader, which would put five navigation links behind the
 * conversation. The `hidden` attribute would remove it from layout and take the transition with it.
 * `inert` removes it from focus and from the accessibility tree while leaving it painted and
 * animatable, which is exactly the state it is in. React 19.2 takes it as a boolean.
 */
export function TabBar({
  ninaBadge,
  hidden = false,
}: { ninaBadge?: React.ReactNode; hidden?: boolean } = {}) {
  const pathname = usePathname()

  // `/` matches only itself; every other tab owns its subtree, so `/r/abc` highlights Runs — a
  // pushed run-detail screen is still "in" the Runs tab even though it is not a tab itself. The
  // same rule already covers F33's second screen: `/nina/about` (phase 13) highlights Nina.
  const isActive = (href: string) =>
    href === '/' ? pathname === '/' || pathname.startsWith('/r/') : pathname.startsWith(href)

  return (
    <nav
      /* `ChatChrome`'s toggle points `aria-controls` at this, so the control announces what it
         discloses rather than announcing an arrow. Unconditional, and inert on the four screens
         that have no toggle. */
      id="main-tab-bar"
      aria-label="Main"
      inert={hidden}
      className={cn(
        'fixed inset-x-0 bottom-0 z-30 border-t border-rule bg-card/95 backdrop-blur-sm',
        /*
         * INVARIANT 8. A `transition-*`, never a keyframe — the app has exactly one keyframe
         * (`ri-pulse`) with one global reduced-motion escape, and `tests/motion.reducedMotion.test.ts`
         * guards that. `transition-[translate]` and not `transition-transform` because Tailwind v4
         * compiles `translate` and `scale` to separate CSS longhands (see this file's header), so
         * `translate` is the property that actually changes here and naming it removes the question.
         *
         * `motion-reduce:transition-none` while `Chip`, `KindSelector` and `Button` correctly have
         * no escape: `app/globals.css` draws that line — colour is not motion, and a 1.5 % press
         * held under a finger is discrete tap feedback. A 58 px bar travelling its own height
         * across the bottom of the screen is on the other side of it. With the escape the bar is
         * simply where it is going, in one frame; the destination never changes, only the journey.
         */
        'transition-[translate] duration-200 ease-out motion-reduce:transition-none',
      )}
      style={{
        paddingBottom: 'var(--safe-bottom)',
        /* Both ends written explicitly. `translate`'s initial value is `none`, and interpolating a
           length against `none` is a spec corner this does not need to rely on. `100%` with no
           arithmetic on top is now sufficient, because the nav's border box is the whole of the
           bar — see the header. */
        translate: hidden ? '0 100%' : '0 0',
      }}
    >
      {/* No `relative`: nothing is positioned against this grid any more. `Tab`'s badge span
          carries its own `relative`, which is what pins Nina's unread dot to her glyph. */}
      <div className="mx-auto grid h-[58px] w-full max-w-[470px] grid-cols-5 items-center">
        <Tab {...TABS[0]} active={isActive(TABS[0].href)} />
        {/* F33 phase 10: the unread dot, rendered on the server and handed down as a node. */}
        <Tab {...TABS[1]} active={isActive(TABS[1].href)} badge={ninaBadge} />
        {/* `New` owns the middle cell of five and stays inside the bar. It was a raised coral
            circle here, `absolute -top-5`, overhanging the bar's top edge; it is a normal cell
            now and `accent` is all that is left of the emphasis. */}
        <Tab {...TABS[2]} active={isActive(TABS[2].href)} />
        <Tab {...TABS[3]} active={isActive(TABS[3].href)} />
        <Tab {...TABS[4]} active={isActive(TABS[4].href)} />
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
 *
 * `accent` is the whole of what survived the FAB, and it **replaces** the active/inactive pair
 * rather than adding a branch to it: `New` is coral on all five screens, including the four where
 * it is not the current route. That is deliberate and it is the point — emphasis that costs no
 * space is the only kind this bar is allowed (see the header). A `New` tab that greyed out on
 * `/`, `/nina`, `/trends` and `/me` would have kept the letter of the request and lost the reason
 * the raised circle existed. `aria-current` still marks the active route, so the accent is decor
 * and never the only signal.
 */
function Tab({
  href,
  label,
  icon: Icon,
  active,
  badge,
  accent = false,
}: {
  href: string
  label: string
  icon: (props: { className: string }) => React.ReactNode
  active: boolean
  badge?: React.ReactNode
  accent?: boolean
}) {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex h-full flex-col items-center justify-center gap-1 text-[10px] font-semibold',
        accent ? 'text-z5' : active ? 'text-ink' : 'text-ink-3',
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

/* The icons are hand-written SVG rather than a dependency: five glyphs is not worth a package,
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

/**
 * The `+`, at the four other glyphs' weight.
 *
 * This is the FAB's own path (`M12 5v14M5 12h14`) at `size-5` instead of `size-7`, and at
 * `strokeWidth="2"` instead of the FAB's `2.4`: on a raised 56 px circle the heavier stroke was
 * proportionate, and beside four 20 px siblings drawn at 2 it would simply read as off-weight.
 * Coral is what distinguishes this tab now (`accent` on `Tab`), not stroke weight.
 */
function NewIcon({ className }: { className: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
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
