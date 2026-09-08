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
 * `app/admin/layout.tsx` reserves `calc(8rem + var(--safe-bottom))` under `<main>` so the last card
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
 * the shape of a bottom bar, and it still stands: this bar carries the seven admin routes and
 * nothing else. What it does borrow, deliberately, is `components/ui/TabBar.tsx`'s MECHANICS —
 * `fixed inset-x-0 bottom-0 z-30`, `border-t border-rule`, `bg-card/95 backdrop-blur-sm`, the
 * `--safe-bottom` padding, and the 470 px centred row — because a second way of pinning a bar to
 * the bottom of an iPhone is a second way of getting it wrong.
 *
 * ── STILL PLAIN TEXT, STILL ONE WORD A CELL, NO ICONS ───────────────────────────────────────
 * `docs/design-brief.md`'s *"a plain-text link, never an icon button — unambiguous at a glance and
 * an icon is a guess"* is a navigation stance and it survived the move to desktop; it survives the
 * move back to a phone too. What a 414 px viewport forces is length. It forced a 3x2 grid at the
 * sixth route (see the `<ul>` below), which pushed a cell back out to 138 px — but the two-string
 * pair stays, because neither "Nina's album" nor "Personality" nor "Image Generation" fits a phone
 * cell at `text-[11px]` and the pair is what stops the two lists drifting. `LINKS` therefore
 * carries BOTH strings — `short` renders below `lg`, `label` at `lg`.
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
 * The seven routes, longest label first in each pair.
 *
 * `short` is the phone label and is not an abbreviation for its own sake. **The arithmetic behind
 * the ceiling changed when the bar went multi-row, and it changed in our favour**: below `lg` this
 * is a 4x2 grid, not a seven-across row, so a cell is 414 / 4 = 103.5 px rather than
 * 414 / 7 = 59.1 px. The 8-character ceiling `tests/admin.shell.test.ts` holds is kept — it was
 * tightened from 10 when the fifth cell landed, and all seven entries clear it (Overview 8,
 * Album 5, Persona 7, Images 6, Photos 6, Memory 6, Shortcut 8) with a 95.5 px content box against
 * ~51 px of label. A label that needs more than eight characters at `text-[11px]` is a label that
 * wants a shorter true form rather than a wider cell.
 *
 * Seven across was the alternative and it was rejected on measurement: 59.1 px gives a 51.1 px
 * content box, which is the width of eight characters with nothing to spare, so it would have
 * forced the ceiling down to 7 and the rewording of `Overview` and `Shortcut`. **Note the axis** —
 * `docs/design-brief.md`'s 44 pt minimum is a HEIGHT rule and `h-14` satisfied it at six across;
 * more cells make a row narrower per cell and never shorter. Width is what ran out, not height.
 */
const LINKS = [
  { href: '/admin', label: 'Overview', short: 'Overview' },
  { href: '/admin/nina', label: "Nina's album", short: 'Album' },
  /*
   * The character tuning, which used to be a shut disclosure on the album route until the user
   * asked for it as its own tab: *"move it as a new tab with name: Personality"*. It sits between
   * the album and the chat photos because it is the third thing about HER, and the two photo
   * routes stay adjacent below it.
   *
   * The phone label is "Persona" and not "Personality": eleven characters do not fit at
   * `text-[11px]`, and this pair of strings exists for exactly that. It is a true short form of
   * the word rather than an invented abbreviation — `docs/nina/persona.md` is what this page edits.
   */
  { href: '/admin/personality', label: 'Personality', short: 'Persona' },
  /*
   * *"make a new tab in admin: Image Generation."* It is placed HERE, directly after the
   * personality tab, rather than appended at the end, and the reason is a move that has to be
   * findable: the Wardrobe field leaves the personality tab and arrives on this page, so the two
   * tabs are neighbours. They are the pair of configuration surfaces — who she is, and how she is
   * photographed — and the three routes above and below them are the things you look AT.
   *
   * `short` is "Images" (6). Note that it is adjacent to "Photos", and that the two are not the
   * same word by accident: this page is how a photograph is MADE, and the chat-photos route is the
   * photographs that were. The full labels at `lg` carry the distinction outright.
   */
  { href: '/admin/image-generation', label: 'Image Generation', short: 'Images' },
  /*
   * Deliberately named for the CONVERSATION and not for the person: the album route is
   * `nina_avatars` (her profile album) and this one is `nina_message_images` (the photographs in
   * the chat). Two different tables, near each other in the nav so the distinction is legible, and
   * the labels are the only thing carrying it.
   */
  { href: '/admin/photos', label: 'Chat photos', short: 'Photos' },
  { href: '/admin/memory', label: 'Memory', short: 'Memory' },
  /*
   * `nina-emoji-shortcuts` R1's route, and it goes LAST because it is the newest surface and
   * Memory is the one it grew out of: most of the rows in the production memory ledger were
   * shortcuts written in prose, for want of anywhere else to put them, and this page is where they
   * stop being that. Adjacency to Memory is the whole of what tells the operator these two are
   * related.
   *
   * The phone label is the singular "Shortcut". Not an invented abbreviation — the plural is nine
   * characters and the ceiling is eight, and a cell reads as a label for the thing you will be
   * looking at rather than as a count. It is the only pair here where the two strings differ by
   * grammatical number rather than by word.
   */
  { href: '/admin/shortcuts', label: 'Shortcuts', short: 'Shortcut' },
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
      {/* The eyebrow is desktop-only: a 112 px bar is two rows of cells and has no room for a
          line above them. */}
      <p className="mb-3 hidden text-[11px] font-semibold tracking-[0.08em] text-ink-3 uppercase lg:block">
        Run Insights admin
      </p>

      {/*
       * `h-28 grid-cols-4 grid-rows-2` — **two rows of 56 px, not one row of seven cells.**
       * Two feature sets each added a route to this bar independently — `image-generation` and
       * `shortcuts` — so it went from five cells to seven in one merge, and a single row is where
       * that stops working: 414 px / 7 = 59.1 px, whose 51.1 px content box is the exact width of
       * eight characters of Poppins semibold at 11 px, with nothing to spare.
       *
       * **The 44 pt minimum is about HEIGHT and it was never the argument here** — `h-14` cleared
       * it at six across and would clear it at seven, because more cells make a row narrower per
       * cell and never shorter. What binds is LABEL WIDTH, and the row-of-six comment this
       * replaced said so: it costed the seventh route in advance at "59 px a cell and 51 px of
       * content box, which does not fit eight characters".
       *
       * A 4x2 grid answers that without renaming anything the operator reads. It keeps the CELL
       * exactly the 56 px tall it has always been — `h-28` is 112 px over two rows — and widens it
       * to 103.5 px at 414 px, a 95.5 px content box against ~51 px of label: **~44 px of slack,
       * where one row of seven has ~0.** The alternative was to drop the ceiling to 7 and reword
       * `Overview` and `Shortcut`; that was declined because renaming another set's shipped labels
       * is not this merge's to do, and because 4x2 leaves room for an eighth route while a 7-char
       * ceiling at 59 px is the last free step. Row two carries three cells and an empty fourth
       * column, which is what makes the eighth route free.
       *
       * `tests/admin.shell.test.ts` holds the seven-cell count, the 4-column geometry and the
       * unchanged 8-character ceiling. All seven clear it: Overview 8, Album 5, Persona 7,
       * Images 6, Photos 6, Memory 6, Shortcut 8.
       *
       * **If this class changes, change `app/admin/layout.tsx`'s
       * `pb-[calc(8rem+var(--safe-bottom))]` with it**: Tailwind cannot read a constant, so the
       * geometry is spelled in two files by necessity and `tests/admin.shell.test.ts` is what
       * stops them drifting apart. `components/ui/AppShell.tsx` cites `TAB_BAR_HEIGHT_PX` in a
       * comment for exactly this reason. 128 px of reserve against a 113 px border box (112 px of
       * rows plus `border-t`) leaves 15 px of breathing room.
       *
       * `max-w-[470px] mx-auto` is `TabBar`'s row, borrowed: it is a no-op at 414 px and it is
       * what stops four cells stretching on a landscape phone or a small tablet, both of which are
       * still below `lg`. At the cap each cell is 117.5 px; at 414 px, 103.5 px.
       *
       * `grid-rows-2` is inert at `lg`, where `lg:block` takes the list out of grid layout
       * entirely — the same way `grid-cols-5` was inert there before it.
       */}
      <ul className="mx-auto grid h-28 w-full max-w-[470px] grid-cols-4 grid-rows-2 lg:mx-0 lg:block lg:h-auto lg:max-w-none lg:space-y-1">
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
