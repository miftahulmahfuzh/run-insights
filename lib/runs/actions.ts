'use server'

import { revalidatePath } from 'next/cache'

import { requireUserId } from '@/lib/auth/requireUserId'
import { RUN_INTENTS, setRunIntent } from '@/lib/db/queries'
import type { RunIntent } from '@/lib/db/schema'
import { isValidId } from '@/lib/id'

/**
 * The intent write-back, and the only mutation F08 owns.
 *
 * `runs.intent` is literally the answer to F07's `questionForRunner` — "was this meant to be an
 * easy run?" — so the *question* belongs to F07 and the *chip row that answers it* to F08. F08
 * therefore ships the write path (a run detail page with a dead chip row would be worse than no
 * chip row) and keeps it to exactly one column. Two things it deliberately does NOT do:
 *
 *   - **It does not touch `corrected_at`.** See `setRunIntent`'s comment: intent is not a
 *     correction of anything a model read, and stamping it as one would pollute the extraction
 *     error profile.
 *   - **It does not evaluate badges.** F09 owns badge evaluation, and no badge in roadmap §4.6
 *     reads `intent`. If one ever does, the hook belongs in `lib/derived/invalidate.ts` — the seam
 *     F05 already cut for exactly this — not bolted on here.
 *
 * `requireUserId()` is line one, above any use of the arguments (INVARIANT A), and the id is
 * validated before it reaches a query even though the query is scoped anyway.
 */
export async function setRunIntentAction(
  runId: string,
  intent: RunIntent | null,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const userId = await requireUserId()

  if (!isValidId(runId)) return { ok: false, error: 'Unknown run' }
  if (intent !== null && !RUN_INTENTS.includes(intent)) {
    return { ok: false, error: 'Unknown intent' }
  }

  try {
    await setRunIntent(userId, runId, intent)
  } catch {
    // A missing or foreign run and a database hiccup are the same outcome to this caller: the chip
    // did not stick. Distinguishing them here would be an ownership oracle (queries.ts §1).
    return { ok: false, error: 'Could not save that just now' }
  }

  revalidatePath(`/r/${runId}`)
  return { ok: true }
}
