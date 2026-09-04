'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { after } from 'next/server'

import { requireUserId } from '@/lib/auth/requireUserId'
import { emitRunCommitted } from '@/lib/nina/proactive'
import { commitReview } from './commit'
import type { CommitReviewState } from './schema'

/**
 * D7 — a Server Action, not a Route Handler. The review screen posts the whole draft as one JSON
 * object rather than as `FormData`: the draft is a nested structure (eleven split rows, five zone
 * rows), and flattening it into form fields only to reassemble it on the server would put the
 * dot-path syntax in two places and give it two chances to drift.
 *
 * Everything real lives in `commit.ts`. This file is the boundary: identity, cache, navigation —
 * and, since F33, scheduling.
 */

/**
 * Commit a reviewed run and go to it.
 *
 * `requireUserId()` is line 1, before the payload is even looked at (INVARIANT A), and it sits
 * above every `try` in the call graph — it signals by throwing `NEXT_REDIRECT`, and so does the
 * `redirect()` at the bottom, so neither may ever be caught here.
 *
 * On success this never returns: it redirects to the run. On failure it returns the state the
 * screen renders inline, because a validation error is not an exception — it is the normal
 * outcome of a human typing into a form, and it belongs next to the field that caused it.
 *
 * ── F33 R8: A RUN BECOMING REAL IS THE EVENT ────────────────────────────────────────────────────
 * Nina reacts to a committed run, naming the records it took and the badges it earned. That is a
 * `glm-5.3` call, ~15 s, and **the runner must not wait on it** — invariant 4 forbids a model call
 * in a render path and common decency forbids one in a redirect. `after()` is the primitive: the
 * callback is registered rather than awaited, it maps onto Vercel's `waitUntil`, and Next's
 * reference is explicit that it still runs when the response ended in a `redirect()`. A bare
 * floating promise would not do — a serverless function is killed once its response is sent. The
 * `maxDuration = 60` on the two invoking page segments (`/x/[extractionId]` and `/r/[id]/edit`) is
 * what gives it room: a Server Action's timeout is the page segment's, not the action's.
 *
 * ── WHY THE CALL IS HERE AND NOT IN `commit.ts`, WHICH THE PHASE BRIEF NAMED ────────────────────
 * `after()` throws `E468` — "`after` was called outside a request scope" — unconditionally when
 * there is no work store (`node_modules/next/dist/server/after/after.js`). Every case in
 * `tests/review.commit.test.ts` calls `commitReview()` directly, with no request scope, so putting
 * the call there breaks that suite the moment it lands, and invariant 1 says the suite passes at
 * every phase boundary. Hiding it behind an injectable dep whose default is the real `after`
 * breaks the same tests; a default that swallows the throw makes a production misconfiguration
 * silent. This file is already the boundary for exactly this class of API — `revalidatePath` and
 * `redirect` live here — and scheduling is navigation-adjacent. RULING E3 accepted the move.
 *
 * Three things the block deliberately does NOT do: it does not await, it does not touch
 * `outcome.state`, and it does not run for a post-review edit (`isNewRun`). It also cannot throw
 * into the response — `emitRunCommitted` returns a result rather than raising, and the `catch` is
 * the backstop for a failure below that, because an unhandled rejection inside `after` is a logged
 * crash for a message nobody was promised.
 */
export async function commitReviewAction(
  _previous: CommitReviewState,
  payload: unknown,
): Promise<CommitReviewState> {
  const userId = await requireUserId()

  const outcome = await commitReview(userId, payload)
  if (!outcome.ok) return outcome.state

  if (outcome.isNewRun) {
    const { runId, newlyEarned, recordsMoved } = outcome
    after(async () => {
      try {
        const result = await emitRunCommitted({
          userId,
          runId,
          occurredOn: occurredOnOf(payload),
          recordKeys: recordsMoved,
          badgeKeys: newlyEarned,
        })
        console.info('[review] nina reacted', { runId, ...result })
      } catch (err) {
        console.error('[review] nina reaction failed; the run itself is saved', {
          runId,
          error: err instanceof Error ? err.message : String(err),
        })
      }
    })
  }

  // The runs list, the profile totals and the run itself all change shape on a commit. `/trends`
  // and `/me` are F08/F09's screens and do not exist yet; revalidating a route with no page is a
  // no-op, and listing them here is what stops the sweep being forgotten when they land.
  revalidatePath('/')
  revalidatePath('/trends')
  revalidatePath('/me')
  revalidatePath(`/r/${outcome.runId}`)

  redirect(`/r/${outcome.runId}`)
}

/**
 * The committed run's calendar day, read back off the payload the action was handed.
 *
 * It is not on `CommitOutcome` because nothing else needs it and widening that type a third time
 * for one string is worse than reading the one field back. The payload has already been validated
 * by `ReviewDraftSchema` inside `commitReview` by the time this runs, so the shape is known good;
 * the guard is here only so a malformed payload produces an empty string rather than a throw
 * inside `after`, and an empty string makes Nina's trigger block say nothing about the date rather
 * than lie about it.
 */
function occurredOnOf(payload: unknown): string {
  const draft = (payload as { draft?: { occurredOn?: unknown } } | null)?.draft
  return typeof draft?.occurredOn === 'string' ? draft.occurredOn : ''
}
