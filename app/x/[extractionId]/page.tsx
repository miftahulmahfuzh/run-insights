import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'

import { ExtractionGate } from '@/components/extract/ExtractionGate'
import { ReviewScreen } from '@/components/review/ReviewScreen'
import { requireUserId } from '@/lib/auth/requireUserId'
import { readExtractionResult } from '@/lib/extract/readExtraction'
import { isValidId } from '@/lib/id'
import { loadExtractionReview } from '@/lib/review/loadReview'

/**
 * `/x/[extractionId]` — **R-1's pre-commit route**, and the only URL an in-flight or unconfirmed
 * extraction has.
 *
 * It is `/x/…` and not `/r/[id]/review` because there is no run to address yet: `runs.occurred_on`
 * is NOT NULL and unknown until the vision call returns, a placeholder row would violate D1, and
 * two placeholder rows created on the same day would collide on the R-5 dedupe index — which is
 * exactly what happens after two weekend runs. `/r/[id]` only ever addresses a committed run.
 *
 * Three branches, resolved server-side so a reload always lands on the right one immediately
 * rather than flashing a skeleton while the first poll goes out:
 *
 *   already committed  → redirect to the run. The extraction is spent; there is nothing to review.
 *   still pending      → F04's progress screen, which refreshes this page when it turns terminal.
 *   terminal           → F05's review screen, hydrated from a **server-resolved** baseline.
 *
 * The third branch covers `failed` as well as `ok`/`repaired`: §8's manual entry is this same
 * screen with an empty draft, not a second surface, and it stays keyed to this extraction so
 * `runs.extraction_id` records that the pipeline broke here.
 */
/**
 * A Server Action's timeout is the **page segment's**, not the action's — Next's `maxDuration`
 * reference: "If using Server Actions, set the `maxDuration` at the page level to change the
 * default timeout of all Server Actions used on that page." `app/r/[id]/page.tsx` records the same
 * finding for `ensureRunInsight`, and `app/nina/page.tsx` for `sendNinaMessage`.
 *
 * `commitReviewAction` posts from this screen and, since F33 phase 10, schedules Nina's reaction to
 * the new run in `after()`. `after` runs for the platform's configured max duration of the route,
 * so without this line her ~15 s model call is cut off by the default limit and the reaction is
 * lost silently — the redirect having already succeeded, there is nothing to surface the failure.
 *
 * A LITERAL, not an imported constant: segment config exports are statically analysed at build
 * time and an identifier is not a value the analyser can see.
 */
export const maxDuration = 60

export default async function ExtractionPage({ params }: PageProps<'/x/[extractionId]'>) {
  const userId = await requireUserId()
  const { extractionId } = await params
  if (!isValidId(extractionId)) notFound()

  // Ownership is inside the read: another user's id returns null, which becomes a 404 rather than
  // a 403, so the page cannot be used to learn which extraction ids exist.
  const initial = await readExtractionResult(userId, extractionId)
  if (!initial) notFound()

  if (initial.status === 'pending') {
    return (
      <Shell title="New run">
        <ExtractionGate extractionId={extractionId} initial={initial} />
      </Shell>
    )
  }

  const context = await loadExtractionReview(userId, extractionId)
  if (!context) notFound()

  // D1's other half: a run is confirmed exactly once. A second visit — a back button, a stale tab,
  // a shared link — must not offer to confirm it again.
  if (context.committedRunId) redirect(`/r/${context.committedRunId}`)

  return (
    <Shell title={context.extractionStatus === 'failed' ? 'Enter this run' : 'Check this run'}>
      <ReviewScreen context={context} />
    </Shell>
  )
}

function Shell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="mx-auto min-h-dvh w-full max-w-[470px] p-5 pb-[calc(2rem+var(--safe-bottom))]">
      <header className="mb-5 flex items-baseline justify-between">
        <h1 className="text-[26px] font-bold tracking-[-0.02em] text-ink">{title}</h1>
        <Link href="/" className="text-[13px] font-semibold text-accent">
          Runs
        </Link>
      </header>
      {children}
    </main>
  )
}
