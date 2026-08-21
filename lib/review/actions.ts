'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { requireUserId } from '@/lib/auth/requireUserId'
import { commitReview } from './commit'
import type { CommitReviewState } from './schema'

/**
 * D7 — a Server Action, not a Route Handler. The review screen posts the whole draft as one JSON
 * object rather than as `FormData`: the draft is a nested structure (eleven split rows, five zone
 * rows), and flattening it into form fields only to reassemble it on the server would put the
 * dot-path syntax in two places and give it two chances to drift.
 *
 * Everything real lives in `commit.ts`. This file is the boundary: identity, cache, navigation.
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
 */
export async function commitReviewAction(
  _previous: CommitReviewState,
  payload: unknown,
): Promise<CommitReviewState> {
  const userId = await requireUserId()

  const outcome = await commitReview(userId, payload)
  if (!outcome.ok) return outcome.state

  // The runs list, the profile totals and the run itself all change shape on a commit. `/trends`
  // and `/me` are F08/F09's screens and do not exist yet; revalidating a route with no page is a
  // no-op, and listing them here is what stops the sweep being forgotten when they land.
  revalidatePath('/')
  revalidatePath('/trends')
  revalidatePath('/me')
  revalidatePath(`/r/${outcome.runId}`)

  redirect(`/r/${outcome.runId}`)
}
