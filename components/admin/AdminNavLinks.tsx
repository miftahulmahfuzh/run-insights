'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

/**
 * The admin nav's LIST — the one subtree under `AdminNav`'s server shell that needs to know the
 * route, and therefore the repo's only client leaf in that shell.
 *
 * ── WHY THIS FILE EXISTS: THE OWNER OVERSAW THE NO-HIGHLIGHT RULE ────────────────────────────
 * `components/admin/.workflows/package_readme.md` carried this as a rule and not a preference:
 * *"Do not add active-link highlighting to `AdminNav` or `UserPicker`. `usePathname()` would turn
 * a static nav into a Client Component to bold one word."* It stood from R1 until the repo
 * owner's own sentence — *"pastikan kita menghighlight tab yang aktif dengan mewarnai icon nya
 * dengan warna biru (gunakan warna biru yang sama dengan text 'Manage the album')"*
 * (`admin-bottom-bar-active-tab`) — and raw input outranks the convention it overturns, the same
 * way `admin-bottom-bar-icons` R2 outranked this row's own plain-text stance.
 *
 * What the ruling did NOT overturn is the arithmetic the rule was built on: `usePathname()` still
 * cannot run in a Server Component (reading the URL there is unsupported by design, so layout
 * state can persist across navigations), so the nav did not go wholly client. The LIST — the only
 * subtree that reads the pathname — moved here, and `AdminNav.tsx` keeps the `<nav>` shell, the
 * eyebrow and the footer paragraph on the server. The leaf itself is still server-rendered into
 * the initial HTML of every route — a Client Component is not a de-optimization; it renders to
 * HTML on first load and re-renders from router state on navigation — so the bar still works
 * before hydration and the first paint of every route already shows the right cell in blue.
 *
 * ── THE ACTIVE CELL: `text-accent`, THE `lg` PILL, AND `aria-current` ────────────────────────
 * Below `lg`, the matching glyph paints `text-accent` — the same blue as the *"Manage the album"*
 * link on the admin home (`app/admin/page.tsx`), the exact token the owner named. The class sits
 * on the `<Icon>`, not the `<Link>`, so it cannot leak into the `lg` sidebar rendition: the glyph
 * is `lg:hidden`.
 *
 * At `lg` the highlight is the pill, added 2026-09-10 after the owner's *"make the active tab
 * highlighted — right now we click it, but there is no difference between an active tab and the
 * others"*: the sidebar's desktop labels had inherited only the unconditional `text-ink-2`, so
 * the mobile highlight was being painted on an element that is not rendered there. The active
 * branch fills the same rounded pill the hover treatment already drew, with `bg-accent-soft` and
 * `text-ink` — and carries explicit `lg:hover:` twins of itself, because the
 * hover variant outranks the plain class and would otherwise repaint the active cell as an
 * inactive one under the pointer. `aria-current="page"` rides on the `<Link>` and is the
 * accessible half of both changes: it is how `UserPicker` has always conveyed its selection,
 * and a cell that is coloured for the eye wants to be named for the screen reader too.
 *
 * The match itself: `/admin` is compared EXACT — a prefix match there would mark every cell
 * active — and every other href by prefix, so a route keeps its cell through whatever nested
 * paths grow under it later. All seven routes are flat today; `startsWith` is the forward-safe
 * spelling, not a current necessity.
 */

/**
 * The seven routes, longest label first in each pair.
 *
 * **`short` stopped being rendered text and became the accessible name** (`admin-bottom-bar-icons`
 * R2): below `lg` it is the sr-only span beside each glyph — the string a screen reader announces
 * where the icon is `aria-hidden` decoration — and at `lg` it is `display: none`, leaving the
 * visible `label` as the link's name. The pair stays, because it is still what stops the two
 * renditions drifting: the sidebar's "Image collection" and the phone's "Photos" are the same
 * route, and the two strings are still edited together.
 *
 * The 8-character CELL ceiling is retired with the text it measured. It existed because
 * 414 / 7 = 59.1 px leaves a 51.1 px content box — the exact width of eight characters of Poppins
 * semibold at 11 px, with nothing to spare — which is why the text bar went 4x2 instead of seven
 * across. A 24 px glyph has no character count: that same 59.1 px cell holds it with ~17.5 px of
 * air each side, and the bar is one row again (R3).
 */
const LINKS = [
  { href: '/admin', label: 'Overview', short: 'Overview', icon: LayoutDashboardIcon },
  { href: '/admin/nina', label: 'Image collection', short: 'Photos', icon: ImagesIcon },
  /*
   * The character tuning, which used to be a shut disclosure on the album route until the user
   * asked for it as its own tab: *"move it as a new tab with name: Personality"*. It sits between
   * the album and the image-generation tab: the two configuration surfaces — who she is, and how
   * she is photographed — are neighbours, and the routes above and below them are the things you
   * look AT.
   *
   * The phone name is "Persona" and not "Personality": a true short form of the word rather than
   * an invented abbreviation — `docs/nina/persona.md` is what this page edits. It was the label
   * pair's text fit; it is the accessible name now.
   */
  { href: '/admin/personality', label: 'Personality', short: 'Persona', icon: SmileIcon },
  /*
   * *"make a new tab in admin: Image Generation."* It is placed HERE, directly after the
   * personality tab, rather than appended at the end, and the reason is a move that has to be
   * findable: the Wardrobe field leaves the personality tab and arrives on this page, so the two
   * tabs are neighbours. They are the pair of configuration surfaces — who she is, and how she is
   * photographed — and the routes above and below them are the things you look AT.
   *
   * Its `short` is "Images", and the photo-ish routes left in the bar are this one and the album —
   * a wand for making, a stack for what is kept.
   */
  {
    href: '/admin/image-generation',
    label: 'Image Generation',
    short: 'Images',
    icon: WandSparklesIcon,
  },
  { href: '/admin/memory', label: 'Memory', short: 'Memory', icon: BrainIcon },
  /*
   * `nina-emoji-shortcuts` R1's route, and it sits directly after Memory because Memory is the one
   * it grew out of: most of the rows in the production memory ledger were shortcuts written in
   * prose, for want of anywhere else to put them, and this page is where they stop being that.
   * Adjacency to Memory is the whole of what tells the operator these two are related. (It was the
   * LAST cell until `nina-llm-fallback-error-logs` R2 appended the diagnostics tab below.)
   *
   * The phone name is the singular "Shortcut" — a true short form, not an invented abbreviation,
   * and it reads as a name for the thing you will be looking at rather than as a count. It is the
   * only pair here where the two strings differ by grammatical number rather than by word.
   */
  { href: '/admin/shortcuts', label: 'Shortcuts', short: 'Shortcut', icon: ZapIcon },
  /*
   * `nina-llm-fallback-error-logs` R2: *"tolong buat satu tab baru di admin page: Error logs"*.
   *
   * It goes LAST, and not beside Memory or Shortcuts, because it is the only cell in this bar that
   * is not a thing the operator EDITS. The first six are two pairs of configuration surfaces and
   * two collections he curates; this one is a read-only record of what the providers did to him
   * overnight, and it belongs at the end of the bar the way a log belongs at the end of a console.
   *
   * The phone name is "Errors" — a true short form of the label rather than an invented
   * abbreviation, and distinct from "Images" and "Photos", which is the property
   * `tests/admin.shell.test.ts` pins (two cells announcing the same name would make one of them
   * ambiguous to a screen reader).
   */
  { href: '/admin/error-logs', label: 'Error logs', short: 'Errors', icon: TriangleAlertIcon },
] as const

export function AdminNavLinks() {
  const pathname = usePathname()

  return (
    /*
     * `h-14 grid-cols-7` — **one row of seven cells, 56 px tall, the bar's original height
     * restored.** This grid was 4x2 (`h-28`) for exactly one reason: seven TEXT labels do not
     * fit one row — 414 / 7 = 59.1 px, whose 51.1 px content box is the exact width of eight
     * characters of Poppins semibold at 11 px, with nothing to spare. `admin-bottom-bar-icons`
     * replaced the words with glyphs (R2) and the reason dissolved: a 24 px glyph in that same
     * 59.1 px cell has ~17.5 px of air each side. The one-row arithmetic was costed by the nav
     * twice before and rejected for text each time; icons are what makes it pass.
     *
     * **The 44 pt minimum holds on both axes**: the cell is 57.1 x 56 px where the 4x2 cell was
     * 103.5 x 56 px — the height never moved through any of this, because more cells make a row
     * narrower, never shorter.
     *
     * **If this class changes, change `app/admin/layout.tsx`'s
     * `pb-[calc(5rem+var(--safe-bottom))]` with it**: Tailwind cannot read a constant, so the
     * geometry is spelled in two files by necessity and `tests/admin.shell.test.ts` is what
     * stops them drifting apart. `components/ui/AppShell.tsx` cites `TAB_BAR_HEIGHT_PX` in a
     * comment for exactly this reason.
     *
     * **`px-[7px]` is one pixel off every glyph's side** (`admin-bottom-bar-active-tab`): the
     * owner asked for the icons *"lebih dekat satu sama lain... rata tengah"* and prescribed the
     * step himself — *"kurangi saja padding nya by 1px"*. The cells have no padding of their own
     * to take it from (the air IS the cell's slack), so the row pads instead: 414 − 14 px of row
     * padding over seven columns is a 57.1 px cell, whose (57.1 − 24) / 2 = 16.6 px of air each
     * side is exactly the old 17.5 minus one. Symmetric padding keeps the row what it was —
     * `mx-auto`, every glyph centred in its cell, the cluster centred in the screen — and the
     * step is one number to dial again after the owner sees it in prod. `lg:px-0` because the
     * sidebar list must not inherit the phone row's tuning.
     *
     * `max-w-[470px] mx-auto` is `TabBar`'s row, borrowed: it is a no-op at 414 px and it is
     * what stops seven cells stretching on a landscape phone or a small tablet, both of which
     * are still below `lg`. At the cap each cell is 65.1 px; at 414 px, 57.1 px.
     *
     * `grid-cols-7` is inert at `lg`, where `lg:block` takes the list out of grid layout
     * entirely — the same way `grid-cols-4` was before it.
     */
    <ul className="mx-auto grid h-14 w-full max-w-[470px] grid-cols-7 px-[7px] lg:mx-0 lg:block lg:h-auto lg:max-w-none lg:space-y-1 lg:px-0">
      {LINKS.map((link) => {
        const Icon = link.icon
        /* `/admin` exact: a prefix match there would light every cell. See the file header. */
        const active =
          link.href === '/admin' ? pathname === '/admin' : pathname.startsWith(link.href)
        return (
          <li key={link.href}>
            <Link
              href={link.href}
              aria-current={active ? 'page' : undefined}
              className={
                active
                  ? 'flex h-full items-center justify-center font-semibold text-ink-2 transition-colors lg:h-auto lg:justify-start lg:rounded-field lg:bg-accent-soft lg:px-3 lg:py-2 lg:text-left lg:text-[14px] lg:text-ink lg:hover:bg-accent-soft lg:hover:text-ink'
                  : 'flex h-full items-center justify-center font-semibold text-ink-2 transition-colors lg:h-auto lg:justify-start lg:rounded-field lg:px-3 lg:py-2 lg:text-left lg:text-[14px] lg:hover:bg-card lg:hover:text-ink'
              }
            >
              {/*
               * Exactly one NAME is in the accessibility tree at any width. Below `lg` it is the
               * sr-only `short` beside a glyph that is `aria-hidden` decor; at `lg` the span and
               * the glyph are both `display: none` and the visible `label` is the name. An
               * `aria-label` on the `<Link>` would have been the shorter spelling and the wrong
               * one: it would override the `lg` rendition's visible label too, announcing
               * "Photos" over a sidebar that says "Image collection".
               *
               * `font-semibold` and `text-ink-2` stay in the base classes on purpose: below `lg`
               * the weight is inert while the colour is what the glyph's `currentColor` stroke
               * paints with — except on the active cell, whose glyph carries its own
               * `text-accent` (see the file header) and so paints blue from itself and not from
               * the link. At `lg` the inactive labels stay `text-ink-2` as they always were;
               * only the active branch's own `lg:` classes (see the file header) fill the pill
               * and lift the label to `text-ink`.
               */}
              <span className="sr-only lg:hidden">{link.short}</span>
              <Icon className={active ? 'size-6 text-accent lg:hidden' : 'size-6 lg:hidden'} />
              <span className="hidden lg:inline">{link.label}</span>
            </Link>
          </li>
        )
      })}
    </ul>
  )
}

/*
 * The seven glyphs, inlined rather than imported — R1's collection choice, recorded:
 *
 * **Lucide** (lucide-static 1.42.0, ISC), fetched 2026-09-08 from
 * `unpkg.com/lucide-static@latest/icons/<name>.svg` and copied verbatim. Chosen by comparing the
 * current sets — Lucide ~1,500 glyphs, Tabler ~5,800, Phosphor ~9,000: all three are 24-grid
 * stroke systems with 2 px round caps, and Lucide is the smallest that covers all seven semantics
 * in one weight. Decisively, it is the exact idiom this repo already draws: `TabBar`'s five
 * hand-written glyphs and `ShareButton`'s are Feather-style paths at `viewBox 0 0 24 24`,
 * `strokeWidth 2`, round caps — so these sit beside their siblings at the same weight rather
 * than importing a second visual system. The one normalisation: Lucide's own files repeat the
 * four `stroke*` presentation attributes per child; they are moved onto the root `svg` element
 * here, where they inherit to every child (the one exception is `ImagesIcon`'s dot, whose Lucide
 * source carries its own `fill="currentColor"` and keeps it). `TabBar`'s footer argument covers
 * why this is a copy and not a dependency: seven glyphs is not worth a package either.
 *
 * Every glyph takes `className` and is `aria-hidden` — the accessible name is the link's sr-only
 * `short` string, never the picture.
 */

/** Overview: the admin home's panels. */
function LayoutDashboardIcon({ className }: { className: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect width="7" height="9" x="3" y="3" rx="1" />
      <rect width="7" height="5" x="14" y="3" rx="1" />
      <rect width="7" height="9" x="14" y="12" rx="1" />
      <rect width="7" height="5" x="3" y="16" rx="1" />
    </svg>
  )
}

/**
 * Image collection: a STACK of pictures — the photograph routes are still told apart by
 * silhouette and not by words ("Image collection" / "Image Generation"), so this stays a stack
 * while `WandSparklesIcon` below is how a photograph is MADE. Two different silhouettes, never
 * two picture outlines that differ by a corner.
 */
function ImagesIcon({ className }: { className: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m22 11-1.296-1.296a2.4 2.4 0 0 0-3.408 0L11 16" />
      <path d="M4 8a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2" />
      <circle cx="13" cy="7" r="1" fill="currentColor" />
      <rect x="8" y="2" width="14" height="14" rx="2" />
    </svg>
  )
}

/** Persona: her personality, drawn as her expression rather than as a neutral person. */
function SmileIcon({ className }: { className: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M15 10V9" />
      <path d="M16.472 15a6 6 0 01-8.943 0" />
      <path d="M9 10V9" />
      <circle cx="12" cy="12" r="10" />
    </svg>
  )
}

/** Images: how a photograph is MADE — the wand, the other silhouette of the photograph pair. */
function WandSparklesIcon({ className }: { className: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m21.64 3.64-1.28-1.28a1.21 1.21 0 0 0-1.72 0L2.36 18.64a1.21 1.21 0 0 0 0 1.72l1.28 1.28a1.2 1.2 0 0 0 1.72 0L21.64 5.36a1.2 1.2 0 0 0 0-1.72" />
      <path d="m14 7 3 3" />
      <path d="M5 6v4" />
      <path d="M19 14v4" />
      <path d="M10 2v2" />
      <path d="M7 8H3" />
      <path d="M21 16h-4" />
      <path d="M11 3H9" />
    </svg>
  )
}

/** Memory: the fact ledger. */
function BrainIcon({ className }: { className: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 18V5" />
      <path d="M15 13a4.17 4.17 0 0 1-3-4 4.17 4.17 0 0 1-3 4" />
      <path d="M17.598 6.5A3 3 0 1 0 12 5a3 3 0 1 0-5.598 1.5" />
      <path d="M17.997 5.125a4 4 0 0 1 2.526 5.77" />
      <path d="M18 18a4 4 0 0 0 2-7.464" />
      <path d="M19.967 17.483A4 4 0 1 1 12 18a4 4 0 1 1-7.967-.517" />
      <path d="M6 18a4 4 0 0 1-2-7.464" />
      <path d="M6.003 5.125a4 4 0 0 0-2.526 5.77" />
    </svg>
  )
}

/** Shortcut: the quick action. */
function ZapIcon({ className }: { className: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M15.914 4a1.5 1.5 0 00-2.474-1.561l-9 9A1.5 1.5 0 005.5 14h4.002a.5.5 0 01.471.666L8.086 20a1.5 1.5 0 002.475 1.56l9-9A1.5 1.5 0 0018.5 10h-3.997a.5.5 0 01-.472-.667z" />
    </svg>
  )
}

/** Errors: the record of what the providers did overnight. */
function TriangleAlertIcon({ className }: { className: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" />
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
    </svg>
  )
}
