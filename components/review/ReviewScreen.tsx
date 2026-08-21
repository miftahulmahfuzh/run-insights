'use client'

import * as React from 'react'

import { commitReviewAction } from '@/lib/review/actions'
import type { ReviewContext } from '@/lib/review/loadReview'
import { IDLE_COMMIT_STATE } from '@/lib/review/schema'
import { ReviewClient } from './ReviewClient'

/**
 * The thinnest possible binding between `ReviewClient` and the Server Action.
 *
 * It exists so `ReviewClient` never imports the action: the action pulls in `server-only` modules
 * transitively, and keeping that edge in one file means the component tree that renders the
 * correction UI can be reasoned about — and tested — without dragging the database in behind it.
 *
 * `useActionState` gives the pending flag and the returned state for free, and it is what makes
 * the double-submit safe: React will not run a second action while the first is in flight, which
 * on a slow phone connection is the difference between one run and a duplicate-key error.
 *
 * The action does not return on success — it redirects to the committed run — so the only states
 * that ever land back here are validation and duplicate failures.
 */
export function ReviewScreen({ context }: { context: ReviewContext }) {
  const [state, submit, pending] = React.useActionState(commitReviewAction, IDLE_COMMIT_STATE)

  return (
    <ReviewClient
      context={context}
      onSubmit={(payload) => React.startTransition(() => submit(payload))}
      pending={pending}
      state={state}
    />
  )
}
