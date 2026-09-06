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
 * `app/admin/layout.tsx` reserves `calc(5rem + var(--safe-bottom))` under `<main>` so the last card
 * is not underneath it. At `lg` and above nothing about the old behaviour changes: `lg:sticky
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
 * the shape of a bottom bar, and it still stands: this bar carries the four admin routes and
 * nothing else. What it does borrow, deliberately, is `components/ui/TabBar.tsx`'s MECHANICS —
 * `fixed inset-x-0 bottom-0 z-30`, `border-t border-rule`, `bg-card/95 backdrop-blur-sm`, the
 * `--safe-bottom` padding, and the 470 px centred row — because a second way of pinning a bar to
 * the bottom of an iPhone is a second way of getting it wrong.
 *
 * ── STILL PLAIN TEXT, STILL FOUR WORDS, NO ICONS ────────────────────────────────────────────
 * `docs/design-brief.md`'s *"a plain-text link, never an icon button — unambiguous at a glance and
 * an icon is a guess"* is a navigation stance and it survived the move to desktop; it survives the
 * move back to a phone too. What a 414 px viewport does force is length: four cells share 414 px,
 * so each gets ~103 px and "Nina's album" does not fit. `LINKS` therefore carries BOTH strings —
 * `short` renders below `lg`, `label` at `lg` — so the pair cannot drift the way two hard-coded
 * lists would.
 *
 * ── STILL A SERVER COMPONENT, STILL NO ACTIVE-LINK HIGHLIGHTING ─────────────────────────────
 * `components/admin/.workflows/package_readme.md` carries this as a rule and not a preference:
 * *"Do not add active-link highlighting to `AdminNav` or `UserPicker`. `usePathname()` would turn
 * a static nav into a Client Component to bold one word."* Becoming a bottom bar does not change
 * that arithmetic — every page under this nav opens with an `<h1>` naming the route, so "where am
 * I" is already answered above the fold, and a nav that works before hydration is worth more on a
 * phone than on a desktop, not less.
 */

/**
 * The four routes, longest label first in each pair.
 *
 * `short` is the phone label and is not an abbreviation for its own sake: at `text-[11px]` in a
 * 103 px cell, anything past ~10 characters wraps or clips, and a clipped nav label is worse than
 * a shorter true one. `tests/admin.shell.test.ts` holds the 10-character ceiling.
 */
const LINKS = [
  { href: '/admin', label: 'Overview', short: 'Overview' },
  { href: '/admin/nina', label: "Nina's album", short: 'Album' },
  /*
   * R2's route. Deliberately named for the CONVERSATION and not for the person: the entry above it
   * is `nina_avatars` (her profile album) and this one is `nina_message_images` (the photographs in
   * the chat). Two different tables, adjacent in the nav so the distinction is legible, and the
   * labels are the only thing carrying it — which is the reason the segment can stay `/admin/photos`.
   *
   * `short` had to keep that distinction alive on a phone, which is why it is "Album" and "Photos"
   * and not two glyphs: they are still two different words for two different sets, where an icon
   * pair would have been a guess at both.
   */
  { href: '/admin/photos', label: 'Chat photos', short: 'Photos' },
  { href: '/admin/memory', label: 'Memory', short: 'Memory' },
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
      {/* The eyebrow is desktop-only: a 56 px bar has room for four words and no room for a
          fifth line above them. */}
      <p className="mb-3 hidden text-[11px] font-semibold tracking-[0.08em] text-ink-3 uppercase lg:block">
        Run Insights admin
      </p>

      {/*
       * `h-14` — 56 px, comfortably past `docs/design-brief.md`'s 44 pt minimum once the cell is
       * the whole target. **If this class changes, change `app/admin/layout.tsx`'s
       * `pb-[calc(5rem+var(--safe-bottom))]` with it**: Tailwind cannot read a constant, so the
       * geometry is spelled in two files by necessity and `tests/admin.shell.test.ts` is what
       * stops them drifting apart. `components/ui/AppShell.tsx` cites `TAB_BAR_HEIGHT_PX` in a
       * comment for exactly this reason.
       *
       * `max-w-[470px] mx-auto` is `TabBar`'s row, borrowed: it is a no-op at 414 px and it is
       * what stops four cells stretching to 225 px each on a landscape phone or a small tablet,
       * both of which are still below `lg`.
       */}
      <ul className="mx-auto grid h-14 w-full max-w-[470px] grid-cols-4 lg:mx-0 lg:block lg:h-auto lg:max-w-none lg:space-y-1">
        {LINKS.map((link) => (
          <li key={link.href}>
            <Link
              href={link.href}
              className="flex h-full items-center justify-center px-1 text-center text-[11px] font-semibold text-ink-2 transition-colors lg:h-auto lg:justify-start lg:rounded-field lg:px-3 lg:py-2 lg:text-left lg:text-[14px] lg:hover:bg-card lg:hover:text-ink"
            >
              {/* Exactly one of these is in the DOM's layout — and therefore in the accessibility
                  tree — at any width, because `lg:hidden` and `hidden` are `display: none`. */}
              <span className="lg:hidden">{link.short}</span>
              <span className="hidden lg:inline">{link.label}</span>
            </Link>
          </li>
        ))}
      </ul>

      <p className="mt-6 hidden max-w-[20ch] text-[12px] font-medium text-ink-3 lg:block">
        The workshop behind the runner&rsquo;s five tabs. It fits a phone since R1; this column is
        what it looks like with room to spare.
      </p>
    </nav>
  )
}
