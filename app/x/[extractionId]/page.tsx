import Link from 'next/link'
import { notFound } from 'next/navigation'

import { ExtractionGate } from '@/components/extract/ExtractionGate'
import { requireUserId } from '@/lib/auth/requireUserId'
import { readExtractionResult } from '@/lib/extract/readExtraction'
import { isValidId } from '@/lib/id'

/**
 * `/x/[extractionId]` — **R-1's pre-commit route**, and the only URL an in-flight or unconfirmed
 * extraction has.
 *
 * It is `/x/…` and not `/r/[id]/review` because there is no run to address yet: `runs.occurred_on`
 * is NOT NULL and unknown until the vision call returns, a placeholder row would violate D1, and
 * two placeholder rows created on the same day would collide on the R-5 dedupe index — which is
 * exactly what happens after two weekend runs. `/r/[id]` only ever addresses a committed run.
 *
 * F04 owns the waiting half of this screen. **F05 owns everything after the status turns
 * terminal**, and takes it over inside `ExtractionGate` without touching this file.
 *
 * The first render is server-side and already carries the current status, so a reload lands on the
 * right screen immediately rather than flashing a skeleton while the first poll goes out.
 */
export default async function ExtractionPage({ params }: PageProps<'/x/[extractionId]'>) {
  const userId = await requireUserId()
  const { extractionId } = await params
  if (!isValidId(extractionId)) notFound()

  // Ownership is inside the read: another user's id returns null, which becomes a 404 rather than
  // a 403, so the page cannot be used to learn which extraction ids exist.
  const initial = await readExtractionResult(userId, extractionId)
  if (!initial) notFound()

  return (
    <main className="mx-auto min-h-dvh w-full max-w-[470px] p-5 pb-[calc(2rem+var(--safe-bottom))]">
      <header className="mb-5 flex items-baseline justify-between">
        <h1 className="text-[26px] font-bold tracking-[-0.02em] text-ink">New run</h1>
        <Link href="/" className="text-[13px] font-semibold text-accent">
          Runs
        </Link>
      </header>

      <ExtractionGate extractionId={extractionId} initial={initial} />
    </main>
  )
}
