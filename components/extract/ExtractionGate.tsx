'use client'

import Link from 'next/link'

import { Card } from '@/components/ui'
import { errorCopy, type ExtractionResult } from '@/lib/schema/extractionResult'
import { ExtractedSummary } from './ExtractedSummary'
import { ExtractingSkeleton } from './ExtractingSkeleton'
import { useExtractionStatus } from './useExtractionStatus'

/**
 * `/x/[extractionId]`'s client half: poll until terminal, then hand off.
 *
 * **THE F04/F05 SEAM IS THIS COMPONENT'S `switch`.** F04 owns everything up to and including the
 * terminal status; F05 replaces the two hand-off branches below with the real correction form and
 * the commit action. The route, the poll, the skeleton and the status contract stay.
 *
 * Task 18's contract, rendered:
 *
 *   pending           → the R-41 progress screen
 *   ok | repaired     → the extracted values (F05: the correction form, pre-filled)
 *   failed            → the failure copy + an all-blank path (F05: the same form, empty — §8.1)
 */
export function ExtractionGate({
  extractionId,
  initial,
}: {
  extractionId: string
  initial: ExtractionResult
}) {
  const { result, pollError, gaveUp, elapsedSec, refresh } = useExtractionStatus(
    extractionId,
    initial,
  )
  const current = result ?? initial

  if (current.status === 'pending') {
    return (
      <ExtractingSkeleton
        photos={current.photos}
        elapsedSec={elapsedSec}
        gaveUp={gaveUp}
        pollError={pollError}
        onRetry={refresh}
      />
    )
  }

  if (current.status === 'failed' || current.session === null) {
    return <FailedHandoff result={current} />
  }

  return (
    <div className="space-y-4">
      <NotSavedYetBanner repaired={current.status === 'repaired'} />
      <ExtractedSummary session={current.session} kinds={current.kinds} />
      <ReviewSlot />
    </div>
  )
}

/**
 * D1, stated on screen rather than assumed. Nothing about this extraction is in `runs` yet, and
 * under R-1 there is not even a placeholder row — so the honest thing to say is that leaving now
 * loses nothing.
 */
function NotSavedYetBanner({ repaired }: { repaired: boolean }) {
  return (
    <Card className="bg-accent-soft p-4">
      <p className="text-[13px] font-semibold text-ink">Nothing has been saved yet.</p>
      <p className="mt-1 text-[12px] font-medium text-ink-2">
        These are the reader&apos;s numbers, not yours. A run only exists once you have checked
        them.
        {repaired && ' The reader needed a second attempt to get the shape right — worth a look.'}
      </p>
    </Card>
  )
}

/**
 * F05's slot. Deliberately not a fake button: an affordance that looks like it commits a run and
 * does not would be a worse lie than saying plainly what is missing.
 */
function ReviewSlot() {
  return (
    <Card className="text-center">
      <p className="text-[13px] font-semibold text-ink">Review and correct — next feature</p>
      <p className="mx-auto mt-1.5 max-w-[34ch] text-[12px] font-medium text-ink-2">
        F05 turns this read-only view into a per-field correction form and writes the confirmed run.
        Until then the extraction is kept as an audit record and no run is created.
      </p>
      <Link href="/upload" className="mt-4 inline-block text-[13px] font-semibold text-accent">
        Read another run
      </Link>
    </Card>
  )
}

/**
 * §8.1 — "fail to manual entry", which is not a second UI. F05's review screen renders in its
 * empty state, keyed to this same `extractionId`, so `runs.extraction_id` still points at the
 * failed attempt: an honest record that this run's numbers are 100% human-entered.
 */
function FailedHandoff({ result }: { result: ExtractionResult }) {
  return (
    <div className="space-y-4">
      <Card>
        <p className="text-[17px] font-semibold text-ink">The reader could not do this one</p>
        <p className="mt-1.5 max-w-[36ch] text-[13px] font-medium text-ink-2">
          {errorCopy(result.errorCode)}
        </p>
        {result.errorCode === 'token_floor' && (
          <p className="mt-3 rounded-field bg-warn-soft p-3 text-[12px] font-medium text-ink-2">
            This is the failure the app watches hardest for: the reader answered without the images,
            so its numbers were invented. They were thrown away unread rather than shown to you.
            {result.promptTokens !== null &&
              ` (${result.promptTokens} input tokens — far too few.)`}
          </p>
        )}
        <div className="mt-5 flex gap-2">
          <Link
            href="/upload"
            className="grid h-11 flex-1 place-items-center rounded-field bg-ink text-[14px] font-semibold text-card"
          >
            Try again
          </Link>
          <Link
            href="/"
            className="grid h-11 flex-1 place-items-center rounded-field bg-paper-2 text-[14px] font-semibold text-ink"
          >
            Not now
          </Link>
        </div>
      </Card>

      <Card className="text-center">
        <p className="text-[13px] font-semibold text-ink">Entering it by hand — next feature</p>
        <p className="mx-auto mt-1.5 max-w-[34ch] text-[12px] font-medium text-ink-2">
          F05&apos;s review screen doubles as the manual path: the same form, every field blank,
          still attached to this reading attempt so the record stays honest about where the numbers
          came from.
        </p>
      </Card>
    </div>
  )
}
