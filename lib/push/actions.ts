'use server'

import { revalidatePath } from 'next/cache'

import { requireUserId } from '@/lib/auth/requireUserId'
import { parsePushSubscription } from './payload'
import { deletePushSubscription, savePushSubscription } from './queries'
import { sendNinaPush } from './send'

/**
 * The three writes a runner can cause. Each opens with `requireUserId()` — invariant 7, and the
 * reason every function in `./queries` takes a userId it can trust.
 *
 * The Next PWA guide's `app/actions.ts` keeps the subscription in a module-level `let` and admits
 * *"in a production environment, you would want to store the subscription in a database"*. That is
 * what phase 1's table is for, and it is why the exit criterion is "persists across a restart": a
 * module-level variable on Vercel dies with the lambda, and the symptom is notifications that work
 * for ten minutes after you subscribe and then never again.
 *
 * ── WHY THEY RETURN A RESULT INSTEAD OF THROWING ──────────────────────────────────────────────
 * `PushSetupCard` has a real failure state to render: permission denied, an unsupported browser, a
 * malformed subscription. A thrown Server Action gives the client an opaque digest and a console
 * error, which is the wrong shape for "your browser said no". Same reasoning as phase 3's
 * `sendNinaMessage` returning a result rather than throwing.
 */
export interface PushActionResult {
  ok: boolean
  /** Copy the card renders verbatim. Never a stack trace, never a status code. */
  message: string | null
}

const OK: PushActionResult = { ok: true, message: null }

/**
 * Store what `pushManager.subscribe()` produced.
 *
 * `subscription` is `unknown` and parsed, not typed as `PushSubscriptionJSON`: a Server Action is a
 * public HTTP endpoint, its argument arrives as JSON over the wire, and a TypeScript annotation on
 * it is a comment. `parsePushSubscription` is where the `https:` scheme check lives.
 */
export async function subscribeToPushAction(input: {
  subscription: unknown
  userAgent?: string | null
}): Promise<PushActionResult> {
  const userId = await requireUserId()

  const parsed = parsePushSubscription(input.subscription)
  if (!parsed) {
    return { ok: false, message: 'That subscription did not look right. Try again.' }
  }

  await savePushSubscription(userId, { ...parsed, userAgent: input.userAgent ?? null })

  /* `/me` renders the subscribed/unsubscribed state from `countLivePushSubscriptions`, so the
   * server copy has to be re-read or the card would disagree with the database on the next
   * navigation. */
  revalidatePath('/me')
  return OK
}

/**
 * "Turn off notifications". The browser has already called `subscription.unsubscribe()` by the
 * time this runs — the client does that first, because the endpoint has to be read off the live
 * subscription before it is thrown away, and because a browser-side failure must not leave the
 * database claiming the phone is subscribed when it is not.
 */
export async function unsubscribeFromPushAction(input: {
  endpoint: string
}): Promise<PushActionResult> {
  const userId = await requireUserId()
  if (typeof input.endpoint !== 'string' || input.endpoint.length === 0) {
    return { ok: false, message: 'Nothing to turn off.' }
  }
  await deletePushSubscription(userId, input.endpoint)
  revalidatePath('/me')
  return OK
}

/**
 * The "Send me a test" button, and the only reason it exists: **the round trip cannot be verified
 * any other way.** Everything else in this phase is either a unit test or a wait for a cron job.
 * A test button turns "did the whole chain work" — VAPID signing, the push service, the worker's
 * `push` handler, the notification, the tap, the focus — into one tap and one buzz, on the actual
 * phone, in about two seconds.
 *
 * It sends through `sendNinaPush` rather than a special path, so what it proves is the real thing
 * and not a parallel implementation of it. The fake message id is `'test'` and the kind is
 * `'manual_test'`; nothing reads either, and phase 10's `ProactiveTriggerKind` is deliberately not
 * imported here because this is not a trigger.
 */
export async function sendTestPushAction(): Promise<PushActionResult> {
  const userId = await requireUserId()
  const report = await sendNinaPush(
    userId,
    [{ id: 'test', body: 'Test. If you can read this, I can reach you.' }],
    'manual_test',
  )

  if (report.skipped) return { ok: false, message: `Nothing sent — ${report.skipped}.` }
  if (report.delivered === 0) {
    return {
      ok: false,
      message: 'The push service refused it. Turn notifications off and on again.',
    }
  }
  return OK
}
