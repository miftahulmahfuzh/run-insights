'use client'

import * as React from 'react'
import Link from 'next/link'

import { Button, Card } from '@/components/ui'
import { errorCopy } from '@/lib/schema/extractionResult'
import { checkDraft, flaggedPaths as collectFlagged, isFlagged } from '@/lib/review/checks'
import { diffCorrections, type ReviewDraft } from '@/lib/review/draft'
import type { ReviewContext } from '@/lib/review/loadReview'
import type { CommitReviewState } from '@/lib/review/schema'
import { ConsistencyBanner } from './ConsistencyBanner'
import { HeroFields } from './HeroFields'
import { MoreDetails } from './MoreDetails'
import { RawResponseDisclosure } from './RawResponseDisclosure'
import { RetryExtraction } from './RetryExtraction'
import { ScreenshotStrip } from './ScreenshotStrip'
import { SplitsTable } from './SplitsTable'
import { ZoneBar } from './ZoneBar'

/**
 * **The second-most-important screen in the app**, and the wall between "a model's guess" and "a
 * fact the rest of the product treats as ground truth".
 *
 * The whole design turns on one number from `IMPLEMENTATION_PLAN.md` §1.3: the extractor scored
 * 108/108 five times in a row, and its parallel-call variant scored 102/108 — misreading one
 * split's pace as 436 s off a cell that plainly reads `6'36"` while getting the other 101 fields
 * right. **A model can be locally wrong and globally convincing.** Nothing about 107 correct
 * fields signals that the 108th is broken, so review cannot be a nag the runner learns to dismiss;
 * it has to be a screen that spends attention where the evidence says to spend it.
 *
 * Which is what the four consistency checks buy. They re-run on every keystroke, and on a clean
 * extraction — the expected case, and what the canonical fixture produces — none of them fires,
 * the banner says so, and confirming the run is **one tap**. The cost of review scales with how
 * wrong the extraction is, not with how many fields exist. That is the only way "check every
 * field" and "do not make me do 108 things" can both be true.
 *
 * ── STATE, AND WHY IT IS SHAPED LIKE THIS ───────────────────────────────────────────────────
 * One `draft` object, one `baseline` that never changes, and everything else derived:
 *
 *   checks       = checkDraft(draft)        re-run on change, never cached across an edit
 *   editedPaths  = diff(baseline, draft)    which fields carry the R-46 `edited` chip
 *   flagged      = paths the failing checks can HONESTLY implicate
 *
 * The baseline is held client-side only to drive chips. It is re-read on the server at commit
 * time and the server's copy is what the corrections log records — a client that could nominate
 * its own `from` values could rewrite the extractor's error profile.
 */

export function ReviewClient({
  context,
  onSubmit,
  pending,
  state,
}: {
  context: ReviewContext
  onSubmit: (payload: unknown) => void
  pending: boolean
  state: CommitReviewState
}) {
  const [draft, setDraft] = React.useState<ReviewDraft>(context.baseline)
  const [moreOpen, setMoreOpen] = React.useState(false)

  const splitsRef = React.useRef<HTMLDivElement>(null)
  const zonesRef = React.useRef<HTMLDivElement>(null)
  const distanceRef = React.useRef<HTMLInputElement>(null)
  const errorSummaryRef = React.useRef<HTMLDivElement>(null)

  const checks = React.useMemo(() => checkDraft(draft), [draft])
  const flagged = React.useMemo(() => collectFlagged(checks), [checks])

  /**
   * The `edited` chips. This runs the same diff the server will run, with a throwaway timestamp —
   * only the key set is used here, never the events, so the clock does not matter and no
   * `correctedAt` computed in the browser is ever stored.
   */
  const editedPaths = React.useMemo(() => {
    const diff = diffCorrections(context.baseline, draft, {
      phase: 'review',
      correctedAt: '',
    })
    return new Set(Object.keys(diff))
  }, [context.baseline, draft])

  const fieldErrors = state.status === 'error' ? state.fieldErrors : {}

  // A validation failure that scrolls nowhere is a save button that appears not to work.
  React.useEffect(() => {
    if (state.status === 'error' || state.status === 'duplicate') {
      errorSummaryRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }, [state])

  const patch = React.useCallback((changes: Partial<ReviewDraft>) => {
    setDraft((current) => ({ ...current, ...changes }))
  }, [])

  /**
   * "Jump" resolves a check's field path to the block that owns it — never to a row. CHK-1 knows
   * the splits disagree with the duration; it does not know which of the eleven is wrong, and
   * scrolling to row 7 would be a claim it cannot support.
   */
  const jumpTo = React.useCallback((fieldPath: string) => {
    const target = fieldPath.startsWith('splits')
      ? splitsRef.current
      : fieldPath.startsWith('hrZones')
        ? zonesRef.current
        : distanceRef.current
    target?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    target?.focus?.({ preventScroll: true })
  }, [])

  const isManual = context.mode === 'review' && context.extractionStatus === 'failed'

  return (
    <div className="space-y-4 pb-[calc(6rem+var(--safe-bottom))]">
      <ScreenshotStrip photos={context.photos} />

      {isManual ? (
        <ManualEntryBanner errorCode={context.errorCode} hasPhotos={context.photos.length > 0} />
      ) : (
        context.mode === 'review' && <NotSavedYetBanner />
      )}

      <HeroFields
        draft={draft}
        flaggedPaths={flagged}
        editedPaths={editedPaths}
        errors={fieldErrors}
        onChange={patch}
        distanceRef={distanceRef}
      />

      {/* Only shown once there is something to check against. An all-null manual draft has no
          sums to compare, so the banner would be four passes of nothing — a false all-clear. */}
      {draft.durationSec !== null && <ConsistencyBanner checks={checks} onJump={jumpTo} />}

      <MoreDetails
        draft={draft}
        open={moreOpen}
        onOpenChange={setMoreOpen}
        editedPaths={editedPaths}
        errors={fieldErrors}
        onChange={patch}
      />

      <SplitsTable
        ref={splitsRef}
        splits={draft.splits}
        photos={context.photos}
        flagged={isFlagged(flagged, 'splits')}
        editedPaths={editedPaths}
        errors={fieldErrors}
        onChange={(splits) => patch({ splits })}
      />

      <ZoneBar
        ref={zonesRef}
        zones={draft.hrZones}
        photos={context.photos}
        flagged={isFlagged(flagged, 'hrZones')}
        editedPaths={editedPaths}
        errors={fieldErrors}
        onChange={(hrZones) => patch({ hrZones })}
      />

      <RawResponseDisclosure raw={context.rawVendorResponse} />

      {/* Last, quietest, and only before the run exists: once a run is committed, re-reading the
          screenshots would produce a second extraction with nothing to attach it to. */}
      {context.mode === 'review' && <RetryExtraction images={context.sourceImages} />}

      <div ref={errorSummaryRef}>
        {state.status === 'error' && (
          <Card className="bg-warn-soft" role="alert">
            <p className="text-[13px] font-semibold text-ink">{state.message}</p>
            {Object.keys(state.fieldErrors).length > 0 && (
              <ul className="mt-2 space-y-1">
                {Object.entries(state.fieldErrors).map(([path, message]) => (
                  <li key={path} className="text-[12px] font-medium text-ink-2">
                    {message}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        )}

        {state.status === 'duplicate' && (
          <Card className="bg-warn-soft" role="alert">
            <p className="text-[13px] font-semibold text-ink">{state.message}</p>
            <p className="mt-1 max-w-[38ch] text-[12px] font-medium text-ink-2">
              Change the date or the start time if this is a different run — or open the one you
              already have.
            </p>
            {state.existingRunId && (
              <Link
                href={`/r/${state.existingRunId}`}
                className="mt-3 inline-block text-[13px] font-semibold text-accent"
              >
                Open that run
              </Link>
            )}
          </Card>
        )}
      </div>

      {/*
       * The sticky bar. NEVER disabled for validation (plan §4): a greyed-out button with no
       * explanation is the least useful message an app can send. It always submits, and anything
       * wrong comes back attached to the field that caused it.
       */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-rule bg-paper/85 backdrop-blur-md">
        <div className="mx-auto w-full max-w-[470px] px-5 pt-3 pb-[calc(0.75rem+var(--safe-bottom))]">
          <p aria-live="polite" className="mb-2 text-center text-[11px] font-medium text-ink-3">
            <CommitStatusLine
              checks={checks}
              editedCount={editedPaths.size}
              mode={context.mode}
              hasNumbers={draft.durationSec !== null}
            />
          </p>
          <Button
            variant="primary"
            size="lg"
            fullWidth
            loading={pending}
            onClick={() =>
              onSubmit({
                extractionId: context.extractionId,
                runId: context.runId,
                draft,
              })
            }
          >
            {context.mode === 'edit' ? 'Save corrections' : 'Confirm & save'}
          </Button>
        </div>
      </div>
    </div>
  )
}

/**
 * The one line of state the reviewer needs before committing, announced politely so it reaches a
 * screen reader without interrupting typing.
 */
function CommitStatusLine({
  checks,
  editedCount,
  mode,
  hasNumbers,
}: {
  checks: ReturnType<typeof checkDraft>
  editedCount: number
  mode: 'review' | 'edit'
  hasNumbers: boolean
}) {
  const failing = checks.filter((c) => !c.ok).length
  const edits = editedCount === 1 ? '1 correction' : `${editedCount} corrections`

  if (!hasNumbers) return <>Fill in at least the distance and the duration.</>
  if (failing > 0) {
    return (
      <>
        {failing === 1 ? '1 check' : `${failing} checks`} still disagree
        {editedCount > 0 && ` · ${edits}`} — save anyway if the screenshots say otherwise.
      </>
    )
  }
  if (editedCount === 0) {
    return mode === 'edit' ? (
      <>Nothing changed yet.</>
    ) : (
      <>Everything checks out. Nothing corrected.</>
    )
  }
  return <>Everything checks out · {edits}.</>
}

/** D1, stated rather than assumed. Under R-1 there is not even a placeholder row to lose. */
function NotSavedYetBanner() {
  return (
    <Card className="bg-accent-soft p-4">
      <p className="text-[13px] font-semibold text-ink">Nothing has been saved yet.</p>
      <p className="mt-1 max-w-[40ch] text-[12px] font-medium text-ink-2">
        These are the reader&apos;s numbers, not yours. A run only exists once you have checked them
        — and everything below is editable until you do.
      </p>
    </Card>
  )
}

/**
 * §8 — "extraction failed" is not a dead end, and it is not a second UI either. This is the same
 * screen with an empty draft: the roadmap's non-goal rules out manual entry as a *primary flow*,
 * not as the answer to three screenshots the model could not read. The photos stay on screen, so
 * this is "type what you see", not "type from memory", and `runs.extraction_id` still points at
 * the failed attempt so the audit trail records where the pipeline broke.
 */
function ManualEntryBanner({
  errorCode,
  hasPhotos,
}: {
  errorCode: string | null
  hasPhotos: boolean
}) {
  return (
    <Card className="bg-warn-soft p-4" role="alert">
      <p className="text-[13px] font-semibold text-ink">
        We could not read these screenshots automatically
      </p>
      <p className="mt-1 max-w-[40ch] text-[12px] font-medium text-ink-2">
        {errorCopy(errorCode) ?? 'Nothing was saved.'} Enter the numbers by hand below
        {hasPhotos ? ' — your screenshots are still above to read them off.' : '.'}
      </p>
    </Card>
  )
}
