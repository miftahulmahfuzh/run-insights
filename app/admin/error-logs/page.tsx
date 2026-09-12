import Link from 'next/link'

import { ErrorLogList } from '@/components/admin/ErrorLogList'
import { TOUCH_ICON, TOUCH_TARGET } from '@/components/admin/touch'
import { ButtonLink, EmptyState } from '@/components/ui'
import {
  ADMIN_ERROR_CATEGORIES,
  ADMIN_ERROR_CATEGORY_LABEL,
  ADMIN_ERROR_LOG_PAGE_SIZE,
  buildErrorLogItems,
  errorLogHref,
  readErrorCategory,
  readErrorLogPage,
  type AdminErrorCategory,
} from '@/lib/admin/errorLogModel'
import { requireAdmin } from '@/lib/admin/requireAdmin'
import { cn } from '@/lib/cn'
import { listNinaErrorLogs } from '@/lib/nina/errorlogs'

/**
 * `/admin/error-logs` — R2: *"tolong buat satu tab baru di admin page: Error logs, bagi jadi 3:
 * Text / Multimodal / Image generation"*, each *"log setiap failure call to LLM"* with timestamp,
 * full input, full LLM error message and model name (plus an image link on the last two).
 *
 * ── THE GATE IS HERE, AGAIN ─────────────────────────────────────────────────────────────────
 * `requireAdmin()` is the first statement, before `searchParams` is awaited. `proxy.ts` matches
 * neither `/admin` nor `/api/*`, so this call and the layout's are the only gates;
 * `app/admin/layout.tsx`'s header explains why both exist rather than one. This page has no
 * Server Action of its own — it is read-only, which is the third place that argument usually
 * lands.
 *
 * ── `force-dynamic`, AND ITS REASON HERE ────────────────────────────────────────────────────
 * Not `searchParams` (reading that already opts a page into dynamic rendering). The log table is
 * written by background work — `after()` turns, the vision describe path, the GitHub Actions image
 * backstop — none of which calls `revalidatePath`, so a cached render of this page would show an
 * operator a stale "no failures" while the streak he is chasing is still being written.
 *
 * ── WHY THE TABS ARE LINKS AND NOT CLIENT STATE ─────────────────────────────────────────────
 * `?tab=` is this repo's navigation idiom (`?view=`, `?folder=`, `?page=`, `?user=`), and the tab
 * a link carries is a tab the operator can bookmark, reload into and send to himself. There is no
 * `Tabs` component in `components/ui/` to reuse and `TabBar.tsx` is not one: it is the RUNNER's
 * five-cell bottom navigation, which `app/admin/layout.tsx` already refuses for this subtree on
 * the grounds that *"an admin tool that borrows it invites the runner to tap into it"*.
 *
 * ── ROW -> PROP HAPPENS HERE ────────────────────────────────────────────────────────────────
 * `buildErrorLogItems` turns every `Date` into two strings and drops the columns a browser has no
 * use for. `app/admin/shortcuts/page.tsx:63` and `app/admin/nina/page.tsx:193` make the same call
 * for the same reason: the client component receives plain serializable props and names no
 * `server-only` module.
 */

export const dynamic = 'force-dynamic'

export default async function AdminErrorLogsPage(props: PageProps<'/admin/error-logs'>) {
  /*
   * The gate, and NOTHING is destructured off it. `requireAdmin()` returns the admin's own
   * `userId`, but this page never uses one: `listNinaErrorLogs` takes no user parameter because the
   * error log is an operator's cross-user diagnostic read, not a runner's conversation. Binding an
   * unused `userId` here would be a lint error and, worse, would read as though the list were
   * scoped when it is not. See `lib/nina/errorlogs.ts`'s module header for the whole argument.
   */
  await requireAdmin()

  const params = await props.searchParams
  const category = readErrorCategory(params.tab)
  const page = readErrorLogPage(params.page)

  /* `limit` is ALSO Phase 1's ceiling (25). Asking for more returns 25 anyway, so a page size above
   * it would advance the offset past rows that were never rendered — see the constant's docblock. */
  const listed = await listNinaErrorLogs(category, {
    limit: ADMIN_ERROR_LOG_PAGE_SIZE,
    offset: (page - 1) * ADMIN_ERROR_LOG_PAGE_SIZE,
  })

  const items = buildErrorLogItems(listed.rows)
  const first = (page - 1) * ADMIN_ERROR_LOG_PAGE_SIZE + 1
  const last = Math.min(page * ADMIN_ERROR_LOG_PAGE_SIZE, listed.total)
  const lastPage = Math.max(1, Math.ceil(listed.total / ADMIN_ERROR_LOG_PAGE_SIZE))

  return (
    <div>
      <header className="mb-5 lg:mb-6">
        <h1 className="text-[22px] font-bold tracking-[-0.02em] text-ink">Error logs</h1>
        <p className="mt-1 max-w-[70ch] text-[13px] font-medium text-ink-2">
          Every LLM call that failed, newest first — the z.ai attempt and its OpenRouter retry are
          separate rows, because either can be the one that broke. The two icons open the full
          request and the full provider error; the timeout the call was given is the error
          text&rsquo;s first line.
        </p>
      </header>

      <TabStrip current={category} />

      {items.length === 0 ? (
        <EmptyState
          title={page > 1 ? 'Nothing on this page' : 'No failures logged'}
          description={
            page > 1
              ? 'This tab is not that long any more.'
              : 'Nothing has failed in this category since the log table started recording. That is the state you want.'
          }
          action={
            page > 1 ? (
              /* `ButtonLink`, not a `Button` inside a `Link`: a <button> nested in an <a> is
                 invalid HTML and the barrel exports this exact component for this exact case. */
              <ButtonLink href={errorLogHref(category, 1)} size="md" variant="secondary">
                Go to the first page
              </ButtonLink>
            ) : undefined
          }
        />
      ) : (
        <>
          <ErrorLogList items={items} />

          {/* `PhotoGrid.tsx:177-211`'s pager, with this page's grammar. The disabled end keeps the
              same box, so the row does not resize and the live control does not move under a thumb
              when the page changes. */}
          <div className="mt-4 flex items-center justify-between gap-2 border-t border-rule pt-3">
            {page > 1 ? (
              <Link
                href={errorLogHref(category, page - 1)}
                className={cn(TOUCH_ICON, 'px-2 text-[12px] font-semibold text-accent')}
                rel="prev"
              >
                &lsaquo; Newer
              </Link>
            ) : (
              <span className={cn(TOUCH_ICON, 'px-2 text-[12px] font-semibold text-ink-3')}>
                &lsaquo; Newer
              </span>
            )}

            <span className="text-[12px] font-semibold text-ink-2 tabular-nums">
              {first}&ndash;{last} of {listed.total}
            </span>

            {page < lastPage ? (
              <Link
                href={errorLogHref(category, page + 1)}
                className={cn(TOUCH_ICON, 'px-2 text-[12px] font-semibold text-accent')}
                rel="next"
              >
                Older &rsaquo;
              </Link>
            ) : (
              <span className={cn(TOUCH_ICON, 'px-2 text-[12px] font-semibold text-ink-3')}>
                Older &rsaquo;
              </span>
            )}
          </div>
        </>
      )}
    </div>
  )
}

/**
 * The three sub-tabs. Every tab links to page 1 of its own category — a page 3 of Text has no
 * meaning in Image generation, and `errorLogHref` spells that in one place so the strip and the
 * pager cannot disagree.
 *
 * `TOUCH_TARGET` (a 44px FLOOR, not a fixed height — `components/admin/touch.ts:11-13` explains
 * why a minimum and not `h-11`) rather than `TOUCH_ICON`: these are text pills, so only the
 * vertical axis needs the rule and the width comes from the label. The active pill is
 * `bg-accent-soft text-ink`, the same treatment `AdminNavLinks.tsx` gives its active cell at `lg`,
 * with `aria-current="page"` as the accessible half.
 *
 * `overflow-x-auto` on the row and `shrink-0` on each cell: the three labels measure ~285px at
 * 375px against 343px of `<main>`, so it never scrolls on the target device — but a shell that
 * *"does not clip its own overflow"* (`app/admin/layout.tsx`, pinned by `tests/admin.shell.test.ts`)
 * makes a child that could exceed its track responsible for scrolling inside itself.
 */
function TabStrip({ current }: { current: AdminErrorCategory }) {
  return (
    <nav aria-label="Error log category" className="mb-4">
      <ul className="flex gap-1 overflow-x-auto">
        {ADMIN_ERROR_CATEGORIES.map((category) => {
          const active = category === current
          return (
            <li key={category} className="shrink-0">
              <Link
                href={errorLogHref(category, 1)}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  TOUCH_TARGET,
                  'flex items-center rounded-field px-3 text-[12px] font-semibold transition-colors',
                  active ? 'bg-accent-soft text-ink' : 'text-ink-2 hover:bg-card hover:text-ink',
                )}
              >
                {ADMIN_ERROR_CATEGORY_LABEL[category]}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
