import { AdminNavLinks } from '@/components/admin/AdminNavLinks'

/**
 * The admin navigation: **a fixed bottom bar below `lg`, the sticky sidebar at `lg` and above.**
 *
 * ── THE DESKTOP-ONLY ASSUMPTION IS REPEALED ─────────────────────────────────────────────────
 * This file used to say, of `sticky top-8`: *"there is no safe-area inset to pad on a desktop and
 * a sticky element needs no compensating padding on the sibling column."* Both halves were true of
 * the surface as built and neither is true any more. `admin-responsive-nina-intimacy` R1 is the
 * repo owner's own sentence — *"revam admin UI to be responsive to my xs max safari"* — and the
 * phone he operates this tool from has every inset this file said it did not have. So below `lg`
 * the nav is fixed to the bottom of the viewport and pads itself by `--safe-left` /
 * `--safe-right` (the notch, in landscape), and `app/admin/layout.tsx` reserves
 * `calc(5rem + var(--safe-bottom))` under `<main>` so the last card is not underneath it. At `lg`
 * and above nothing about the old behaviour changes: `lg:sticky lg:top-8 lg:self-start`, in flow,
 * in the grid's first column, compensating nobody.
 *
 * **The home-indicator pad is HALVED** (`admin-bottom-bar-active-tab`): R1 padded the row by the
 * full `--safe-bottom`, and the owner asked for the icons nearer the bottom of the XS Max screen —
 * *"kurangi jarak icons <-> xsmax bottom screen... reduce the current distance value by half"* —
 * so the pad is now `calc(var(--safe-bottom) / 2)`: ~17 px on the target device instead of ~34.
 * The bar's own bottom edge does not move (`fixed bottom-0` with a background that fills its
 * padding box, as before); only the row of glyphs sits lower inside it, and it still clears the
 * home indicator itself. The reserve under `<main>` deliberately does NOT shrink with it — the
 * pairing's job is to clear the bar, and 5rem + full inset clears a shorter bar by more, not less.
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
 * `fixed inset-x-0 bottom-0 z-30`, `border-t border-rule`, `bg-card/95 backdrop-blur-sm`, and
 * the 470 px centred row — because a second way of pinning a bar to the bottom of an iPhone is a
 * second way of getting it wrong.
 *
 * ── A SERVER SHELL OVER ONE CLIENT LEAF ─────────────────────────────────────────────────────
 * This file carries no `'use client'` and reads nothing from the router. It did not need to grow
 * one when the owner ordered the active tab highlighted — *"pastikan kita menghighlight tab yang
 * aktif dengan mewarnai icon nya dengan warna biru (gunakan warna biru yang sama dengan text
 * 'Manage the album')"* (`admin-bottom-bar-active-tab`) — because `usePathname()` is a Client
 * Component hook and the README rule this file used to quote was built on that fact. What the
 * ruling changed is WHERE the boundary sits, not that there is one: the list — the only subtree
 * that needs the pathname, glyphs and their accent included — lives in
 * `components/admin/AdminNavLinks.tsx` as a client leaf, and this shell, the eyebrow and the
 * footer paragraph stay on the server. The leaf is still server-rendered into the initial HTML,
 * so the bar works before hydration exactly as it did. See that file's header for the active-cell
 * rule (`text-accent` on the glyph below `lg`, the `bg-accent-soft` pill at `lg`, `aria-current`
 * on the link) and the row's geometry.
 */

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
      className="fixed inset-x-0 bottom-0 z-30 border-t border-rule bg-card/95 pr-[var(--safe-right)] pb-[calc(var(--safe-bottom)/2)] pl-[var(--safe-left)] backdrop-blur-sm lg:sticky lg:inset-x-auto lg:top-8 lg:bottom-auto lg:z-auto lg:self-start lg:border-0 lg:bg-transparent lg:p-0 lg:backdrop-blur-none"
    >
      {/* The eyebrow is desktop-only: a 56 px bar is one row of cells and has no room for a line
          above it. */}
      <p className="mb-3 hidden text-[11px] font-semibold tracking-[0.08em] text-ink-3 uppercase lg:block">
        Run Insights admin
      </p>

      <AdminNavLinks />

      <p className="mt-6 hidden max-w-[20ch] text-[12px] font-medium text-ink-3 lg:block">
        The workshop behind the runner&rsquo;s five tabs. It fits a phone since R1; this column is
        what it looks like with room to spare.
      </p>
    </nav>
  )
}
