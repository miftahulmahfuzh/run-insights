import { requireUserId } from '@/lib/auth/requireUserId'
import { pushEnv } from '@/lib/env'
import { countLivePushSubscriptions } from '@/lib/push/queries'
import { PushSetupCard } from './PushSetupCard'

/**
 * The server half of the push control, and it exists for exactly one reason: **to read
 * `VAPID_PUBLIC_KEY` on the server and hand it to a client component as a prop.**
 *
 * The Next PWA guide would have `PushSetupCard` read `process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY`
 * directly. This repo forbids the prefix outright (ROADMAP §4.1, `ci:client-secret-guard` RULE 3),
 * and `lib/env.ts` imports `server-only` so a client component cannot reach `pushEnv()` either.
 * A server wrapper is the whole resolution: one file, no exception in the guard, and the same
 * bytes end up in the browser.
 *
 * `pushEnv()` is lazy by phase 1's design and THROWS when the group is unset, which is correct
 * everywhere else and would be wrong here — a deployment with no VAPID keys must still render
 * `/me`. So it is caught, and the fallback says plainly that this is a deploy problem.
 */
export async function PushSetup() {
  const userId = await requireUserId()

  let vapidPublicKey: string
  try {
    vapidPublicKey = pushEnv().VAPID_PUBLIC_KEY
  } catch {
    return <PushSetupFallback />
  }

  const live = await countLivePushSubscriptions(userId)

  return <PushSetupCard vapidPublicKey={vapidPublicKey} initiallySubscribed={live > 0} />
}

/** Shown when the environment has no VAPID keys. Says so plainly; it is a deploy problem. */
export function PushSetupFallback() {
  return (
    <p className="text-[13px] font-medium text-ink-2">
      Push notifications are not configured on this deployment.
    </p>
  )
}
