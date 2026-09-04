import 'server-only'

import { ensureNinaSession, getNinaMessagesByIds } from './queries'

/**
 * **Which session does a message with no session in view go into? (Assumption A3.)**
 *
 * Three writers of `nina_messages` exist and two of them run with nobody looking:
 * `lib/nina/proactive.ts`'s cron and `after()` triggers, and `lib/nina/imagejobs.ts`'s R22 apology.
 * `lib/nina/actions.ts` is the third and it normally has a session from the URL — except in the one
 * state R11 creates, where the runner has removed every session and the screen has no id to send.
 * All three land here, and there is exactly one policy so they cannot disagree.
 *
 * ── WHY THIS IS NOT A `'use server'` MODULE ───────────────────────────────────────────────────
 * A `'use server'` file's exports are HTTP endpoints. These two functions take a `userId` the
 * caller resolved and would create a session for anyone who could POST to them. `import
 * 'server-only'` is the right boundary: reachable from the server, not addressable from a browser.
 *
 * ── WHY IT IS NOT IN `queries.ts` ─────────────────────────────────────────────────────────────
 * "Which session does THIS message belong in" is a POLICY (A3), not a read. `queries.ts` owns the
 * statements and this file owns the sentence that composes them. Same split as `lib/nina/gateway.ts`,
 * whose header states the rule: every decision about what a fact IS lives outside the file that
 * fetches it.
 */

/**
 * The runner's most recently active session, **creating one when he has none**.
 *
 * ── THIS IS PHASE 1's `ensureNinaSession`, NAMED FOR ITS CALLERS ──────────────────────────────
 * Phase 1's handoff asks phase 3 to call `ensureNinaSession` at the two headless writers rather
 * than pass `undefined`, and that is what this does. The wrapper is not a second implementation and
 * must never become one: it exists so the three writers share one import with
 * `resolveNinaSessionForMessage`, which genuinely does something `queries.ts` cannot — it reads a
 * session off a message and falls back here.
 *
 * The two properties the callers depend on are `ensureNinaSession`'s and are documented there:
 * it creates rather than giving up, because R11 lets him remove his last session and a proactive
 * message that cannot be written is silently lost forever; and it resolves by ACTIVITY with pins
 * ignored, because the display list is pinned-first and tonight's nag does not belong in a
 * conversation he pinned in March.
 */
export async function resolveNinaWriteSession(userId: string): Promise<string> {
  return ensureNinaSession(userId)
}

/**
 * The session a specific message of his lives in, falling back to `resolveNinaWriteSession`.
 *
 * **This is how R22's apology beats A3 rather than merely satisfying it.**
 * `NinaImageJobArgs.replyToId` is already *"the runner message that asked"*
 * (`lib/nina/imagerecipe.ts`), and that row carries a `session_id`. So an apology for a photo that
 * never arrived lands in the conversation where he asked for it, not in whichever chat happens to
 * be newest twenty minutes later. The fallback is A3's rule and covers the two honest misses: an
 * avatar job, which has no runner message at all, and a message deleted since the job opened
 * (phase 7 makes that reachable).
 *
 * `getNinaMessagesByIds` is owner-scoped, so a foreign or vanished id comes back empty and takes
 * the fallback rather than reaching into somebody else's conversation. A read failure is warned and
 * swallowed for the same reason the callers swallow theirs: the apology is worth more than the
 * precision of where it lands.
 */
export async function resolveNinaSessionForMessage(
  userId: string,
  messageId: string | null,
): Promise<string> {
  if (messageId !== null) {
    try {
      const [row] = await getNinaMessagesByIds(userId, [messageId])
      if (row != null) return row.sessionId
    } catch (cause) {
      console.warn('[nina] could not resolve a session from a message', {
        userId,
        error: String(cause),
      })
    }
  }
  return resolveNinaWriteSession(userId)
}
