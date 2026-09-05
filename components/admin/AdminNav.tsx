import Link from 'next/link'

/**
 * The admin sidebar. **The one array phase 16 appends to** — its `/admin/memory` entry goes in
 * `LINKS` and nothing else about this file changes.
 *
 * A plain link list and not an icon rail: `docs/design-brief.md`'s "a plain-text link, never an
 * icon button — unambiguous at a glance and an icon is a guess" is a navigation stance, not a
 * mobile one, and it survives the move to desktop unchanged (`ScreenHeader` makes the same
 * argument).
 *
 * `sticky top-8` rather than `fixed`: there is no safe-area inset to pad on a desktop and a
 * sticky element needs no compensating padding on the sibling column.
 *
 * Not a client component and no active-link highlighting. `usePathname()` would make the whole
 * sidebar client-rendered to bold one word; a two-item list does not need it, and phase 16 can
 * revisit when there are five.
 */

const LINKS = [
  { href: '/admin', label: 'Overview' },
  { href: '/admin/nina', label: "Nina's album" },
  /*
   * R2's route. Deliberately named for the CONVERSATION and not for the person: the entry above it
   * is `nina_avatars` (her profile album) and this one is `nina_message_images` (the photographs in
   * the chat). Two different tables, adjacent in the nav so the distinction is legible, and the
   * labels are the only thing carrying it — which is the reason the segment can stay `/admin/photos`.
   */
  { href: '/admin/photos', label: 'Chat photos' },
  { href: '/admin/memory', label: 'Memory' },
] as const

export function AdminNav() {
  return (
    <nav className="lg:sticky lg:top-8 lg:self-start" aria-label="Admin">
      <p className="mb-3 text-[11px] font-semibold tracking-[0.08em] text-ink-3 uppercase">
        Run Insights admin
      </p>
      <ul className="flex flex-wrap gap-1 lg:block lg:space-y-1">
        {LINKS.map((link) => (
          <li key={link.href}>
            <Link
              href={link.href}
              className="block rounded-field px-3 py-2 text-[14px] font-semibold text-ink-2 transition-colors hover:bg-card hover:text-ink"
            >
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
      <p className="mt-6 hidden max-w-[20ch] text-[12px] font-medium text-ink-3 lg:block">
        Desktop only, on purpose. The runner&rsquo;s app is the five tabs; this is the workshop
        behind it.
      </p>
    </nav>
  )
}
