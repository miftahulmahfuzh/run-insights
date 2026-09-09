import Link from 'next/link'

/**
 * The admin navigation: **a fixed bottom bar below `lg`, the sticky sidebar at `lg` and above.**
 *
 * ── THE DESKTOP-ONLY ASSUMPTION IS REPEALED ─────────────────────────────────────────────────
 * This file used to say, of `sticky top-8`: *"there is no safe-area inset to pad on a desktop and
 * a sticky element needs no compensating padding on the sibling column."* Both halves were true of
 * the surface as built and neither is true any more. `admin-responsive-nina-intimacy` R1 is the
 * repo owner's own sentence — *"revam admin UI to be responsive to my xs max safari"* — and the
 * phone he operates this tool from has every inset this file said it did not have. So below `lg`
 * the nav is fixed to the bottom of the viewport and pads itself by `--safe-bottom` (the home
 * indicator) and by `--safe-left` / `--safe-right` (the notch, in landscape), and
 * `app/admin/layout.tsx` reserves `calc(5rem + var(--safe-bottom))` under `<main>` so the last
 * card is not underneath it. At `lg` and above nothing about the old behaviour changes: `lg:sticky
 * lg:top-8 lg:self-start`, in flow, in the grid's first column, compensating nobody.
 *
 * ── WHY THE BOTTOM, AND NOT THE WRAPPING ROW IT ALREADY WAS ─────────────────────────────────
 * Below `lg` this was `flex flex-wrap` above the content — a link row at the top of a 896 px-tall
 * screen, reachable only by re-gripping the phone. R1's exit criterion is one-handed reach, and
 * the bottom 56 px of an XS Max is the only band a thumb owns without moving the hand.
 *
 * ── IT IS NOT `TabBar`, AND IT MAY NOT BECOME IT ────────────────────────────────────────────
 * `app/admin/layout.tsx` refuses `AppShell` partly because that component pairs itself with the
 * runner's five-cell `<TabBar />`, and *"an admin tool that borrows it invites the runner to tap
 * into it"*. That argument is about the runner's five tabs appearing on an admin page, not about
 * the shape of a bottom bar, and it still stands: this bar carries the seven admin routes and
 * nothing else. What it does borrow, deliberately, is `components/ui/TabBar.tsx`'s MECHANICS —
 * `fixed inset-x-0 bottom-0 z-30`, `border-t border-rule`, `bg-card/95 backdrop-blur-sm`, the
 * `--safe-bottom` padding, and the 470 px centred row — because a second way of pinning a bar to
 * the bottom of an iPhone is a second way of getting it wrong.
 *
 * ── ICONS ON THE PHONE BAR — THE OWNER OVERTURNED THIS FILE'S OWN TEXT STANCE ────────────────
 * This header used to carry *"a plain-text link, never an icon button — unambiguous at a glance
 * and an icon is a guess"*, attributed to `docs/design-brief.md` (which no longer contains the
 * sentence), as a navigation stance that had survived two reshapes of this bar.
 * `admin-bottom-bar-icons` R2 is the repo owner's own sentence — *"replace semua text pada bottom
 * bar menjadi icon"* — and raw input outranks the convention it overturns, the same way
 * `admin-responsive-nina-intimacy` R1 outranked *"this UI is for desktop"*: below `lg` the bar
 * carries seven Lucide glyphs and no words. Two halves of the old stance survive on their own
 * merits rather than by that ruling. The DISTINCTION half: the Album/Images/Photos trio's labels
 * were *"the only thing carrying"* the album-vs-chat-photos difference, so the three glyphs are
 * three deliberately different silhouettes — a stack of pictures, a wand, a camera — and the `lg`
 * sidebar still renders the long labels outright, because the request names the bottom bar. The
 * DELIVERY half: the glyphs are inlined SVG path data and not a package, which is
 * `components/ui/TabBar.tsx`'s recorded stance (*"five glyphs is not worth a package"*) at seven
 * glyphs instead of five — see the icons at the bottom of this file for the collection's
 * provenance and for the accessible-name pattern that replaces the words.
 *
 * ── STILL A SERVER COMPONENT, STILL NO ACTIVE-LINK HIGHLIGHTING ─────────────────────────────
 * `components/admin/.workflows/package_readme.md` carries this as a rule and not a preference:
 * *"Do not add active-link highlighting to `AdminNav` or `UserPicker`. `usePathname()` would turn
 * a static nav into a Client Component to bold one word."* Becoming a bottom bar does not change
 * that arithmetic — every page under this nav opens with an `<h1>` naming the route, so "where am
 * I" is already answered above the fold, and a nav that works before hydration is worth more on a
 * phone than on a desktop, not less. Icons do not change it either: a glyph is static markup
 * exactly as the word it replaced was.
 */

/**
 * The seven routes, longest label first in each pair.
 *
 * **`short` stopped being rendered text and became the accessible name** (`admin-bottom-bar-icons`
 * R2): below `lg` it is the sr-only span beside each glyph — the string a screen reader announces
 * where the icon is `aria-hidden` decoration — and at `lg` it is `display: none`, leaving the
 * visible `label` as the link's name. The pair stays, because it is still what stops the two
 * renditions drifting: the sidebar's "Nina's album" and the phone's "Album" are the same route,
 * and the two strings are still edited together.
 *
 * The 8-character CELL ceiling is retired with the text it measured. It existed because
 * 414 / 7 = 59.1 px leaves a 51.1 px content box — the exact width of eight characters of Poppins
 * semibold at 11 px, with nothing to spare — which is why the text bar went 4x2 instead of seven
 * across. A 24 px glyph has no character count: that same 59.1 px cell holds it with ~17.5 px of
 * air each side, and the bar is one row again (R3).
 */
const LINKS = [
  { href: '/admin', label: 'Overview', short: 'Overview', icon: LayoutDashboardIcon },
  { href: '/admin/nina', label: "Nina's album", short: 'Album', icon: ImagesIcon },
  /*
   * The character tuning, which used to be a shut disclosure on the album route until the user
   * asked for it as its own tab: *"move it as a new tab with name: Personality"*. It sits between
   * the album and the chat photos because it is the third thing about HER, and the two photo
   * routes stay adjacent below it.
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
   * photographed — and the three routes above and below them are the things you look AT.
   *
   * `short` is "Images". Note that it is adjacent to "Photos", and that the two are not the same
   * word by accident: this page is how a photograph is MADE, and the chat-photos route is the
   * photographs that were. The full labels at `lg` carry the distinction outright, and below `lg`
   * the glyphs do — a wand for making, a camera for what was (see the trio note on the icons).
   */
  {
    href: '/admin/image-generation',
    label: 'Image Generation',
    short: 'Images',
    icon: WandSparklesIcon,
  },
  /*
   * Deliberately named for the CONVERSATION and not for the person: the album route is
   * `nina_avatars` (her profile album) and this one is `nina_message_images` (the photographs in
   * the chat). Two different tables, near each other in the nav so the distinction is legible —
   * carried by the `lg` labels in words and by the phone bar's camera-vs-wand-vs-stack
   * silhouettes in glyphs.
   */
  { href: '/admin/photos', label: 'Chat photos', short: 'Photos', icon: CameraIcon },
  { href: '/admin/memory', label: 'Memory', short: 'Memory', icon: BrainIcon },
  /*
   * `nina-emoji-shortcuts` R1's route, and it goes LAST because it is the newest surface and
   * Memory is the one it grew out of: most of the rows in the production memory ledger were
   * shortcuts written in prose, for want of anywhere else to put them, and this page is where they
   * stop being that. Adjacency to Memory is the whole of what tells the operator these two are
   * related.
   *
   * The phone name is the singular "Shortcut" — a true short form, not an invented abbreviation,
   * and it reads as a name for the thing you will be looking at rather than as a count. It is the
   * only pair here where the two strings differ by grammatical number rather than by word.
   */
  { href: '/admin/shortcuts', label: 'Shortcuts', short: 'Shortcut', icon: ZapIcon },
] as const

export function AdminNav() {
  return (
    <nav
      aria-label="Admin"
      /*
       * `fixed` first, `lg:sticky` second: both are `position` utilities, and Tailwind emits the
       * `lg:` variant after the bare one, so the media query wins at 1024 px. `lg:inset-x-auto` and
       * `lg:bottom-auto` are not decoration — a sticky element with both `top` and `bottom` set is
       * constrained at both ends and behaves nothing like `lg:top-8` alone.
       */
      className="fixed inset-x-0 bottom-0 z-30 border-t border-rule bg-card/95 pr-[var(--safe-right)] pb-[var(--safe-bottom)] pl-[var(--safe-left)] backdrop-blur-sm lg:sticky lg:inset-x-auto lg:top-8 lg:bottom-auto lg:z-auto lg:self-start lg:border-0 lg:bg-transparent lg:p-0 lg:backdrop-blur-none"
    >
      {/* The eyebrow is desktop-only: a 56 px bar is one row of cells and has no room for a line
          above it. */}
      <p className="mb-3 hidden text-[11px] font-semibold tracking-[0.08em] text-ink-3 uppercase lg:block">
        Run Insights admin
      </p>

      {/*
       * `h-14 grid-cols-7` — **one row of seven cells, 56 px tall, the bar's original height
       * restored.** This grid was 4x2 (`h-28`) for exactly one reason: seven TEXT labels do not
       * fit one row — 414 / 7 = 59.1 px, whose 51.1 px content box is the exact width of eight
       * characters of Poppins semibold at 11 px, with nothing to spare. `admin-bottom-bar-icons`
       * replaced the words with glyphs (R2) and the reason dissolved: a 24 px glyph in that same
       * 59.1 px cell has ~17.5 px of air each side. The one-row arithmetic was costed by this file
       * twice before and rejected for text each time; icons are what makes it pass.
       *
       * **The 44 pt minimum holds on both axes**: the cell is 59.1 x 56 px where the 4x2 cell was
       * 103.5 x 56 px — the height never moved through any of this, because more cells make a row
       * narrower, never shorter.
       *
       * **If this class changes, change `app/admin/layout.tsx`'s
       * `pb-[calc(5rem+var(--safe-bottom))]` with it**: Tailwind cannot read a constant, so the
       * geometry is spelled in two files by necessity and `tests/admin.shell.test.ts` is what
       * stops them drifting apart. `components/ui/AppShell.tsx` cites `TAB_BAR_HEIGHT_PX` in a
       * comment for exactly this reason. 80 px of reserve against a 57 px border box (56 px of row
       * plus `border-t`) leaves 23 px of breathing room — the pre-4x2 pairing, restored with the
       * row count.
       *
       * `max-w-[470px] mx-auto` is `TabBar`'s row, borrowed: it is a no-op at 414 px and it is
       * what stops seven cells stretching on a landscape phone or a small tablet, both of which
       * are still below `lg`. At the cap each cell is 67.1 px; at 414 px, 59.1 px.
       *
       * `grid-cols-7` is inert at `lg`, where `lg:block` takes the list out of grid layout
       * entirely — the same way `grid-cols-4` was before it.
       */}
      <ul className="mx-auto grid h-14 w-full max-w-[470px] grid-cols-7 lg:mx-0 lg:block lg:h-auto lg:max-w-none lg:space-y-1">
        {LINKS.map((link) => {
          const Icon = link.icon
          return (
            <li key={link.href}>
              <Link
                href={link.href}
                className="flex h-full items-center justify-center font-semibold text-ink-2 transition-colors lg:h-auto lg:justify-start lg:rounded-field lg:px-3 lg:py-2 lg:text-left lg:text-[14px] lg:hover:bg-card lg:hover:text-ink"
              >
                {/*
                 * Exactly one NAME is in the accessibility tree at any width. Below `lg` it is the
                 * sr-only `short` beside a glyph that is `aria-hidden` decor; at `lg` the span and
                 * the glyph are both `display: none` and the visible `label` is the name. An
                 * `aria-label` on the `<Link>` would have been the shorter spelling and the wrong
                 * one: it would override the `lg` rendition's visible label too, announcing
                 * "Album" over a sidebar that says "Nina's album".
                 *
                 * `font-semibold` and `text-ink-2` stay in the base classes on purpose: nothing
                 * overrides them at `lg` (the sidebar's 14 px labels are semibold `text-ink-2`
                 * today and must not change), and below `lg` the weight is inert while the colour
                 * is what the glyph's `currentColor` stroke paints with.
                 */}
                <span className="sr-only lg:hidden">{link.short}</span>
                <Icon className="size-6 lg:hidden" />
                <span className="hidden lg:inline">{link.label}</span>
              </Link>
            </li>
          )
        })}
      </ul>

      <p className="mt-6 hidden max-w-[20ch] text-[12px] font-medium text-ink-3 lg:block">
        The workshop behind the runner&rsquo;s five tabs. It fits a phone since R1; this column is
        what it looks like with room to spare.
      </p>
    </nav>
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
 * Album: a STACK of pictures, and the anchor of the photo-ish trio — this glyph, `WandSparklesIcon`
 * and `CameraIcon` below are the three routes a reader cannot tell apart by words alone at 11 px
 * ("Nina's album" / "Image Generation" / "Chat photos"), so they are three different silhouettes
 * rather than two picture outlines that differ by a corner.
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

/** Images: how a photograph is MADE — the wand, second silhouette of the trio. */
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

/** Photos: the photographs that were — the camera, third silhouette of the trio. */
function CameraIcon({ className }: { className: string }) {
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
      <path d="M13.997 4a2 2 0 0 1 1.76 1.05l.486.9A2 2 0 0 0 18.003 7H20a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h1.997a2 2 0 0 0 1.759-1.048l.489-.904A2 2 0 0 1 10.004 4z" />
      <circle cx="12" cy="13" r="3" />
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
