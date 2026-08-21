import 'server-only'

import {
  applyRunCorrections,
  commitExtractedRun,
  DuplicateRunError,
  NotFoundError,
  recordCorrections,
} from '@/lib/db/queries'
import type { BadgeKey } from '@/lib/badges/types'
import type { CorrectionEvent } from '@/lib/db/schema'
import { onRunCommitted } from '@/lib/derived/invalidate'
import { checkIdForFieldPath, failingChecks } from './checks'
import { diffCorrections, mergeCorrections } from './draft'
import { loadExtractionReview, loadRunEdit, type ReviewContext } from './loadReview'
import {
  CommitReviewEnvelopeSchema,
  fieldErrorsOf,
  ReviewDraftSchema,
  toRunInput,
  type CommitReviewState,
} from './schema'

/**
 * **The one code path that sets `runs.reviewed_at`, and under R-1 the one that creates a `runs`
 * row at all.** Everything downstream of this function — every rollup, every record, every badge,
 * every narrative — treats what it writes as fact (D16). Nothing else in the product is allowed
 * to write here.
 *
 * Split out of `actions.ts` because a `'use server'` module may only export async functions, and
 * this one needs an injectable clock and an injectable invalidation hook to be testable without a
 * browser. The action is the thin wrapper: auth, revalidate, redirect.
 *
 * ── ORDER OF OPERATIONS, AND WHY IT IS THIS ORDER ───────────────────────────────────────────
 *
 *   1. re-read the baseline from the database          (never trust the client's `from` values)
 *   2. validate the submitted draft                    (the wall — lib/review/schema.ts)
 *   3. write the run + splits + zones in ONE batch     (one transaction, all or nothing)
 *   4. append the corrections log
 *   5. fire `onRunCommitted`
 *
 * Steps 4 and 5 are deliberately outside step 3's transaction, and deliberately after it.
 *
 * Step 4 is a second statement because F03's published surface writes `extractions.corrections`
 * on its own (`recordCorrections`) and `commitExtractedRun` takes no extra statements. The
 * failure that opens up is a saved run whose corrections log is missing this commit's events —
 * measurable signal lost, no stored number wrong. The failure the other ordering would open up is
 * a corrections log describing a run that does not exist. Losing analytics beats lying about
 * history, so the run goes first and a failure here is logged rather than raised.
 *
 * Step 5 is after by ruling (plan §7.3): invalidation failure must never roll back a human's
 * confirmed save.
 */

export interface CommitDeps {
  now?: () => Date
  /** Overridable so the contract test can assert it is called exactly once, with what. */
  invalidate?: typeof onRunCommitted
}

/**
 * `newlyEarned` is F09 §1.1 step 6: the badge keys this commit actually wrote, so a screen can say
 * "you earned Fashionably Late" without a second round trip. It is `[]` rather than absent when
 * nothing was earned, when invalidation failed, and on the already-committed short-circuit below —
 * a caller never has to distinguish "no badges" from "we did not look".
 *
 * Nothing consumes it yet: `commitReviewAction` redirects to `/r/[id]`, so the review screen has no
 * response to render it into. The value is threaded here anyway because the alternative is a screen
 * that later wants it re-plumbing the whole commit path, and because it is the only cheap moment
 * this answer exists — after the redirect it costs a query.
 */
export type CommitOutcome =
  { ok: true; runId: string; newlyEarned: BadgeKey[] } | { ok: false; state: CommitReviewState }

export async function commitReview(
  userId: string,
  input: unknown,
  deps: CommitDeps = {},
): Promise<CommitOutcome> {
  const now = deps.now ?? (() => new Date())
  const invalidate = deps.invalidate ?? onRunCommitted

  const envelope = CommitReviewEnvelopeSchema.safeParse(input)
  if (!envelope.success) {
    return {
      ok: false,
      state: { status: 'error', message: 'That submission could not be read.', fieldErrors: {} },
    }
  }

  // Parsed separately so every issue path is the draft's own dot-path (`splits.0.timeSec`), which
  // is exactly the key the field renders its error from. See the schema module for why.
  const parsedDraft = ReviewDraftSchema.safeParse(envelope.data.draft)
  if (!parsedDraft.success) {
    return {
      ok: false,
      state: {
        status: 'error',
        message: 'Some of these numbers cannot be saved as they are.',
        fieldErrors: fieldErrorsOf(parsedDraft.error),
      },
    }
  }

  const { extractionId, runId } = envelope.data
  const draft = parsedDraft.data

  /* 1 — the baseline. Ownership is inside the read: someone else's id resolves to null, which
   * becomes the same "not found" a nonexistent id gets, so the action cannot be used to probe
   * which ids exist. */
  const context = await loadBaseline(userId, { extractionId, runId }, now())
  if (!context) {
    return {
      ok: false,
      state: {
        status: 'error',
        message: 'That run could not be found.',
        fieldErrors: {},
      },
    }
  }

  /* An extraction that has already produced a run must not produce a second one. Two tabs on the
   * same /x/[id], or a double-tap on a slow connection, would otherwise commit twice — and the
   * R-5 dedupe index only catches that when the start time is identical, which it is here, so it
   * would surface as a confusing duplicate error rather than a no-op. Answer with the run they
   * already have. */
  if (context.mode === 'review' && context.committedRunId) {
    return { ok: true, runId: context.committedRunId, newlyEarned: [] }
  }

  /* 2 — attribute each edit to the check that pointed at it, if any. Computed against the
   * BASELINE's failing checks, not the corrected draft's: by the time a number is fixed, the
   * check that flagged it has stopped firing. */
  const baselineFailures = failingChecks(context.baseline)
  const phase = phaseFor(context)
  const corrections = diffCorrections(context.baseline, draft, {
    phase,
    correctedAt: now().toISOString(),
    checkIdFor: (path) => checkIdForFieldPath(baselineFailures, path),
  })
  const changedFieldPaths = Object.keys(corrections)

  /* 3 — the write. */
  const runInput = toRunInput(draft, {
    source: phase === 'manual' ? 'manual' : 'screenshot',
    extractionId: context.extractionId,
  })

  let committedRunId: string
  try {
    if (context.runId) {
      const { splits, zones, source: _source, ...patch } = runInput
      // `source` is never rewritten by an edit: a run typed by hand stays `manual` however many
      // times it is corrected afterwards, and one read from a screenshot stays `screenshot`.
      void _source
      await applyRunCorrections(userId, context.runId, patch, splits, zones)
      committedRunId = context.runId
    } else {
      const result = await commitExtractedRun(userId, runInput, { reviewedAt: now() })
      committedRunId = result.runId
    }
  } catch (err) {
    if (err instanceof DuplicateRunError) {
      return {
        ok: false,
        state: {
          status: 'duplicate',
          message: 'You have already logged a run on that date at that time.',
          existingRunId: err.existingRunId,
        },
      }
    }
    if (err instanceof NotFoundError) {
      return {
        ok: false,
        state: { status: 'error', message: 'That run could not be found.', fieldErrors: {} },
      }
    }
    throw err
  }

  /* 4 — the corrections log. R-7's append: this commit's events land on the END of whatever the
   * column already holds, so a field corrected twice keeps both stories. */
  if (context.extractionId && changedFieldPaths.length > 0) {
    try {
      await recordCorrections(
        userId,
        context.extractionId,
        mergeCorrections(context.existingCorrections, corrections),
      )
    } catch (err) {
      console.error('[review] corrections log failed; the run itself is saved', {
        runId: committedRunId,
        extractionId: context.extractionId,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  /* 5 — invalidation. Never allowed to fail the save (plan §7.3). Records, then badges, then the
   * insight sweep — the order lives inside `onRunCommitted`, which is also where the reasoning for
   * it is written down. */
  let newlyEarned: BadgeKey[] = []
  try {
    const outcome = await invalidate({
      runId: committedRunId,
      userId,
      changedFieldPaths,
      occurredOn: draft.occurredOn,
      previousOccurredOn:
        context.baseline.occurredOn !== draft.occurredOn ? context.baseline.occurredOn : null,
      phase,
    })
    newlyEarned = outcome?.newlyEarned ?? []
  } catch (err) {
    console.error('[review] onRunCommitted failed; derived data is behind', {
      runId: committedRunId,
      error: err instanceof Error ? err.message : String(err),
    })
  }

  return { ok: true, runId: committedRunId, newlyEarned }
}

/**
 * `runId` wins when both are present: an edit of a committed run diffs against the run, never
 * against the extraction that produced it three weeks ago.
 */
async function loadBaseline(
  userId: string,
  ids: { extractionId: string | null; runId: string | null },
  now: Date,
): Promise<ReviewContext | null> {
  if (ids.runId) return loadRunEdit(userId, ids.runId)
  if (ids.extractionId) return loadExtractionReview(userId, ids.extractionId, now)
  return null
}

/**
 * Which of R-7's three phases this commit is, and therefore how §6.2's analytics query should
 * read its events:
 *
 *   `review`            the human fixing what the model got wrong — the extraction error signal
 *   `post-review-edit`  a later correction — runner error or late catch, NOT extraction error
 *   `manual`            no extraction baseline at all (§8); every `from` is null
 *
 * The distinction is load-bearing for the query, which filters to `phase = 'review'` precisely so
 * that the other two do not pollute the extractor's error rate.
 */
function phaseFor(context: ReviewContext): CorrectionEvent['phase'] {
  if (context.mode === 'edit') return 'post-review-edit'
  return context.extractionStatus === 'ok' || context.extractionStatus === 'repaired'
    ? 'review'
    : 'manual'
}
