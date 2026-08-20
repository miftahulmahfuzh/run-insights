import Link from 'next/link'
import { redirect } from 'next/navigation'

import { AccountMenu } from '@/components/auth/AccountMenu'
import { SignInCard } from '@/components/auth/SignInCard'
import { ButtonLink, Card } from '@/components/ui'
import { getUserId } from '@/lib/auth/requireUserId'
import { safeNext } from '@/lib/auth/safeNext'
import { getProfile } from '@/lib/db/queries'

/**
 * `/` — the runs list (R-24: there is no marketing page), and therefore the one route that must
 * decide THREE things before it can render anything:
 *
 *   signed out                 -> the sign-in screen, carrying `next` through
 *   signed in, not onboarded   -> redirect to /onboarding
 *   signed in and onboarded    -> the runs list
 *
 * That three-way branch is why this file belongs to F02 and not to F08. **F08 replaces the
 * placeholder body below; it must not touch the gate above it.**
 *
 * `proxy.ts` deliberately does not match `/` — matching it would bounce the sign-in screen to
 * itself. The gate here is the real one, as INVARIANT A says it always is.
 */
export default async function Page({ searchParams }: PageProps<'/'>) {
  const userId = await getUserId()
  if (!userId) {
    const { next } = await searchParams
    return <SignInCard next={safeNext(next)} />
  }

  const profile = await getProfile(userId)
  if (!profile?.onboardedAt) redirect('/onboarding')

  return (
    <main className="mx-auto min-h-dvh w-full max-w-[470px] p-5 pb-[calc(2rem+var(--safe-bottom))]">
      <header className="mb-5 flex items-baseline justify-between">
        <h1 className="text-[26px] font-bold tracking-[-0.02em] text-ink">Runs</h1>
        <Link href="/me" className="text-[13px] font-semibold text-accent">
          Me
        </Link>
      </header>

      {/* F08 replaces everything from here down with the real list, grouped by week. */}
      <Card className="text-center">
        <p className="mb-1.5 text-[17px] font-semibold text-ink">No runs yet</p>
        <p className="mx-auto mb-6 max-w-[30ch] text-[13px] font-medium text-ink-2">
          Screenshot a run in the Fitness app, then upload it here. Reading it takes about half a
          minute.
        </p>
        <ButtonLink href="/upload" variant="primary" size="lg" fullWidth>
          Upload a run
        </ButtonLink>
      </Card>

      <div className="mt-8">
        <AccountMenu />
      </div>
    </main>
  )
}
