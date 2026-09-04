import Link from 'next/link'
import { notFound } from 'next/navigation'

import { ReviewScreen } from '@/components/review/ReviewScreen'
import { requireUserId } from '@/lib/auth/requireUserId'
import { isValidId } from '@/lib/id'
import { loadRunEdit } from '@/lib/review/loadReview'

/**
 * `/r/[id]/edit` — **R-1 / R-8's post-review correction**, and the same component tree as
 * `/x/[extractionId]` pointed at a different baseline.
 *
 * A run does not stop being editable once `reviewed_at` is set. A reviewer can confirm eleven
 * splits, see the run detail page an hour later and notice that km 4 reads wrong — and there has
 * to be somewhere for that to go other than deleting the run and re-uploading the screenshots.
 *
 * Two things differ from the pre-commit screen, both of them in the data rather than the UI:
 *
 *  1. **The diff baseline is the stored run, not the extraction.** A second correction's `from`
 *     value is the first correction's `to`. Diffing against the model's original guess would
 *     record a value that has not been true since the first commit, and would make the §6.2
 *     analytics query count one extraction error twice.
 *  2. **`reviewed_at` never moves.** It answers "has a human ever confirmed this run", which is
 *     permanently yes. `corrected_at` (R-8) answers "has it changed since", and that is what this
 *     screen writes.
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

export default async function EditRunPage({ params }: PageProps<'/r/[id]/edit'>) {
  const userId = await requireUserId()
  const { id } = await params
  if (!isValidId(id)) notFound()

  const context = await loadRunEdit(userId, id)
  if (!context) notFound()

  return (
    <main className="mx-auto min-h-dvh w-full max-w-[470px] p-5 pb-[calc(2rem+var(--safe-bottom))]">
      <header className="mb-5 flex items-baseline justify-between">
        <h1 className="text-[26px] font-bold tracking-[-0.02em] text-ink">Correct this run</h1>
        <Link href={`/r/${id}`} className="text-[13px] font-semibold text-accent">
          Cancel
        </Link>
      </header>

      <ReviewScreen context={context} />
    </main>
  )
}
