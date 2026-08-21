'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'

import { Card } from '@/components/ui'
import { isTerminal, type ExtractionResult } from '@/lib/schema/extractionResult'
import { ExtractingSkeleton } from './ExtractingSkeleton'
import { useExtractionStatus } from './useExtractionStatus'

/**
 * `/x/[extractionId]`'s waiting half: poll until terminal, then hand the screen back to the
 * server.
 *
 * **This component used to BE the F04/F05 seam** — a `switch` on the terminal status that rendered
 * a read-only summary. F05 cut the seam somewhere better. The review screen needs three things
 * this client component cannot have: the extraction's stored `corrections` (R-7), the raw vendor
 * reply for the disclosure, and — above all — a **server-resolved baseline**, because the `from`
 * side of every correction event must come from the database and not from whatever the browser
 * believes it was shown.
 *
 * So the hand-off is a `router.refresh()`. The poll's only remaining job is to notice that the
 * status went terminal and ask the server to re-render the page, which then takes the review
 * branch and never mounts this component again. The alternative — passing a review context down
 * through the poll — would mean the pre-commit screen is assembled partly on the server and partly
 * from a JSON payload the client has been holding, which is exactly the ambiguity D1 cannot
 * tolerate.
 */
export function ExtractionGate({
  extractionId,
  initial,
}: {
  extractionId: string
  initial: ExtractionResult
}) {
  const router = useRouter()
  const { result, pollError, gaveUp, elapsedSec, refresh } = useExtractionStatus(
    extractionId,
    initial,
  )
  const current = result ?? initial
  const done = isTerminal(current.status)

  // Once, on the transition. `router.refresh()` is idempotent but not free, and the poll hook
  // stops on a terminal status anyway — the guard is for the re-render React does between the
  // refresh being requested and the new tree arriving.
  const refreshed = React.useRef(false)
  React.useEffect(() => {
    if (!done || refreshed.current) return
    refreshed.current = true
    router.refresh()
  }, [done, router])

  if (done) {
    return (
      <Card className="text-center" role="status" aria-live="polite">
        <p className="text-[15px] font-semibold text-ink">Opening the numbers…</p>
        <p className="mx-auto mt-1.5 max-w-[32ch] text-[12px] font-medium text-ink-2">
          Reading finished. Loading them so you can check them.
        </p>
      </Card>
    )
  }

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
