import Link from 'next/link'
import { redirect } from 'next/navigation'

import { SignInCard } from '@/components/auth/SignInCard'
import { RunList } from '@/components/runs/RunList'
import { ButtonLink, EmptyState } from '@/components/ui'
import { AppShell, ScreenHeader } from '@/components/ui/AppShell'
import { getUserId } from '@/lib/auth/requireUserId'
import { safeNext } from '@/lib/auth/safeNext'
import { isValidDateISO, todayInJakarta } from '@/lib/date/ranges'
import { getProfile, listRunsWithPhotoCounts } from '@/lib/db/queries'
import { formatDayCompact } from '@/lib/format'

/**
 * `/` — the runs list (R-24: there is no marketing page), and therefore the one route that must
 * decide THREE things before it can render anything:
 *
 *   signed out                 -> the sign-in screen, carrying `next` through
 *   signed in, not onboarded   -> redirect to /onboarding
 *   signed in and onboarded    -> the runs list
 *
 * That three-way branch is F02's and **F08 has not touched it** — only the body below it, which was
 * a placeholder card. `proxy.ts` deliberately does not match `/` (matching it would bounce the
 * sign-in screen to itself); the gate here is the real one, as INVARIANT A says it always is.
 *
 * **One query.** `listRunsWithPhotoCounts` is reviewed-only (D16), newest first, and carries each
 * run's screenshot count in the same statement. The week dividers' totals are reduced from the rows
 * it returned — never a second query, which could disagree with the rows on screen.
 *
 * **A run mid-extraction never appears here**, by construction rather than by filter: per D1 a run
 * only exists in `runs` once a human has reviewed it, and a pending extraction lives on `/upload`'s
 * own polling UI (F04). A newly-saved run needs no special treatment on this screen — by the time
 * it is in `runs` it is exactly as real as every other row.
 */

const PAGE_SIZE = 60

export default async function Page({ searchParams }: PageProps<'/'>) {
  const userId = await getUserId()
  if (!userId) {
    const { next } = await searchParams
    return <SignInCard next={safeNext(next)} />
  }

  const profile = await getProfile(userId)
  if (!profile?.onboardedAt) redirect('/onboarding')

  const { before } = await searchParams
  // An invalid or absent cursor silently falls back to "from the top", the same clamp the trends
  // scope switcher applies — a hand-edited URL should never be an error page.
  const beforeOccurredOn = isValidDateISO(before) ? before : undefined

  const runs = await listRunsWithPhotoCounts(userId, {
    limit: PAGE_SIZE,
    beforeOccurredOn,
  })
  const todayISO = todayInJakarta()

  // A full page suggests there may be more. `occurred_on` is the cursor, so a day with several runs
  // is not split across pages: `lt(occurredOn, cursor)` starts the next page at the previous day.
  const oldest = runs[runs.length - 1]
  const nextCursor = runs.length === PAGE_SIZE && oldest ? oldest.occurredOn : null

  return (
    <AppShell>
      <ScreenHeader
        title="Runs"
        action={
          beforeOccurredOn ? (
            <Link href="/" className="text-[13px] font-semibold text-accent">
              Back to latest
            </Link>
          ) : undefined
        }
      />

      {runs.length === 0 ? (
        beforeOccurredOn ? (
          <EmptyState
            title="Nothing earlier"
            description="You have reached the beginning of your history."
            action={
              <ButtonLink href="/" variant="secondary" size="md">
                Back to latest
              </ButtonLink>
            }
          />
        ) : (
          /* The brand-new user. No chart machinery is imported on this path at all — a user with no
             runs must not download Recharts to be told they have none (§9). */
          <EmptyState
            title="No runs yet"
            description="Screenshot a run in the Fitness app, then tap the + tab. Reading it takes about half a minute."
            action={
              <ButtonLink href="/upload" variant="primary" size="lg" fullWidth>
                Upload a run
              </ButtonLink>
            }
          />
        )
      ) : (
        <>
          <RunList
            runs={runs}
            todayISO={todayISO}
            photoCounts={Object.fromEntries(runs.map((r) => [r.id, r.photoCount]))}
          />

          {nextCursor && (
            <div className="mt-7 text-center">
              <Link
                href={`/?before=${nextCursor}`}
                className="text-[13px] font-semibold text-accent"
              >
                Runs before {formatDayCompact(nextCursor)}
              </Link>
            </div>
          )}
        </>
      )}
    </AppShell>
  )
}
