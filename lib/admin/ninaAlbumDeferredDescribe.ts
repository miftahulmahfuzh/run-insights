import { after } from 'next/server'

import { describeSubjectForSide } from '@/lib/nina/album'
import { embedNinaText } from '@/lib/nina/embedding'
import {
  listNinaAvatarDescribeTargets,
  setNinaAvatarDescriptionAndEmbedding,
  type NinaAvatarDescribeTarget,
} from '@/lib/nina/queries'
import { describeNinaImages } from '@/lib/nina/vision'

/**
 * The deferred describe-and-embed pre-pass: the `after()` schedulers the action modules call when
 * rows land in the album, become her face, or have their prose rewritten. A `'use server'` module
 * may export only async functions (`lib/nina/album.ts:144-148`), and these are synchronous
 * schedulers — the constraint that once kept `scheduleDescribe` unexported beside the actions is
 * what gives it a plain module of its own. Its importers are the action modules behind the
 * `lib/admin/ninaAlbumActions.ts` barrel, plus
 * `app/api/admin/nina/backfill-descriptions/route.ts`, which reuses the per-row worker without
 * the `after()`.
 */

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════
 *  THE DESCRIBE PRE-PASS IS STILL OFF THE UPLOAD PATH. HALF THE ORIGINAL ARGUMENT IS REPEALED.
 *
 *  What it used to be: `registerNinaAvatarAction` awaited `describeNinaImages` on EVERY upload.
 *  That was correct, and its own comment said why — an uploaded image has no generation prompt,
 *  so `glm-4.6v` is the only way `nina_avatars.description` ever gets filled for it, and R25's
 *  "asked where she is in her new profile photo, Nina invents a story true to the photo" has
 *  nothing to work from otherwise.
 *
 *  What changed is the scale, and the user stated it as a requirement rather than an aside:
 *  *"i will put hundreds of profile pics in there."*
 *
 *  The measurement, from `lib/nina/vision.ts`'s own constants: a describe call is ~8-11 s typical
 *  (`NINA_DESCRIBE_TIMEOUT_MS = 25_000`, derived there from ~26-33 ms per completion token over
 *  ~220 output tokens plus 2-3 s of fixed overhead). Awaited once per upload, three hundred
 *  uploads is 40 minutes to 1.4 hours of wall clock the operator sits through, three hundred
 *  serverless invocations held open, and three hundred vendor bills. And Server Actions dispatch
 *  one at a time per client, so those latencies do not overlap. They add.
 *
 *  ── WHAT admin-album-semantic-search REPEALS, AND WHAT IT LEAVES STANDING ───────────────────
 *  The LATENCY argument stands, untouched and non-negotiable: no describe and no embedding call
 *  is ever awaited on the upload request path. The clause that is repealed is the other one —
 *  *"for descriptions of photographs Nina may never be shown."* R2 makes the description the
 *  SEARCH INDEX of the album ("we use semantic search to search to every image description we
 *  have"), so every photograph is now shown, to the search, the moment the operator types. A
 *  description that used to be speculative spend is now the feature. Which is why this file went
 *  from describing ONE row per batch to describing every row in it, and why
 *  `registerNinaAvatarsAction` no longer schedules only for `rows[0]`.
 *
 *  ── THE THREE BOUNDS THAT MAKE THAT SAFE ────────────────────────────────────────────────────
 *  1. It is still `after()`. The operator's upload response is unchanged, to the millisecond.
 *  2. `NINA_DEFERRED_DESCRIBE_CONCURRENCY` lanes, not `Promise.all`. Fifty simultaneous vision
 *     calls is a rate-limit incident; four is the number `EXPLORER_UPLOAD_CONCURRENCY` already
 *     chose for the same vendor exposure on the blob side.
 *  3. A WALL-CLOCK DEADLINE, because `after()` inherits the ROUTE SEGMENT's `maxDuration` and not
 *     the action's (`app/admin/image-generation/page.tsx:76-79` states it). `/admin/nina` declares
 *     300; this file stops STARTING rows at 240, and whatever it did not reach stays NULL —
 *     visibly, in `countNinaAvatarDescribeBacklog`, for the backfill route to finish. A worker
 *     that is killed mid-flight leaves the same state as one that never started, because the row
 *     is written per-row and not per-batch.
 *
 *  Every failure here is NON-FATAL, exactly as the old register-path pre-pass was: the row
 *  exists, the album renders, and a failure leaves a visible "Describe it" button rather than a
 *  lost upload or a refused promotion. That property is inherited, not re-litigated.
 * ════════════════════════════════════════════════════════════════════════════════════════════
 */

/**
 * How many rows the pre-pass works on at once.
 *
 * Four, and it is `EXPLORER_UPLOAD_CONCURRENCY`'s number for
 * `components/admin/explorer/useFolderUpload.ts`'s reason, one layer down: the bound exists so a
 * batch of fifty does not become fifty simultaneous vendor requests. It is spelled here rather
 * than imported from that hook because the hook is a client module and this is a server one — a
 * client component's import graph must not reach `lib/nina/queries`, which `app/admin/nina/page.tsx`
 * states as a rule for `NinaAvatarRow`.
 */
export const NINA_DEFERRED_DESCRIBE_CONCURRENCY = 4

/**
 * How long a scheduled batch may keep STARTING rows, in ms.
 *
 * 240_000 against the 300 s `/admin/nina` segment declares (step 7 of this phase), leaving 60 s of
 * reserve — enough for one in-flight describe at its own `NINA_DESCRIBE_TIMEOUT_MS = 25_000` plus
 * the OpenRouter fallback's `NINA_DESCRIBE_FALLBACK_TIMEOUT_MS = 30_000` to finish and write its
 * row rather than being cut off between the vendor answering and the UPDATE landing.
 *
 * It is a START gate, not a cancellation: a row that has begun always gets to finish or time out
 * on the vision client's own clock. Cancelling mid-describe would spend the money and keep none of
 * the answer.
 */
export const NINA_DEFERRED_DESCRIBE_BUDGET_MS = 240_000

/** The backfill route's own budget. Same 300 s ceiling, same 60 s reserve. */
export const NINA_ALBUM_BACKFILL_BUDGET_MS = 240_000

/**
 * How many backlog rows one backfill POST reads. Deliberately larger than the budget can finish:
 * the read is one indexed statement and costs nothing, and over-reading is what lets the lanes
 * keep going right up to the deadline instead of idling because the slice ran dry.
 */
export const NINA_ALBUM_BACKFILL_SLICE = 200

/** What one run of the pre-pass did. Every field is a count of ROWS, not of vendor calls. */
export interface NinaDescribeFillOutcome {
  /** Rows that got prose from `glm-4.6v` (or its OpenRouter fallback) in this run. */
  described: number
  /** Rows whose `description_embedding` was written non-null in this run. */
  embedded: number
  /** Rows that threw. Their prose and vector are unchanged; they stay in the backlog. */
  failed: number
  /** Rows the deadline was reached before. Untouched, still in the backlog. */
  ranOutOfTime: number
  /** Rows that already had both and needed no vendor call at all. */
  alreadyDone: number
}

function emptyOutcome(): NinaDescribeFillOutcome {
  return { described: 0, embedded: 0, failed: 0, ranOutOfTime: 0, alreadyDone: 0 }
}

/**
 * Embed one description, or answer `null`.
 *
 * **Never throws.** An embedding failure must not cost the prose: `describeNinaAvatarAction` is
 * about to return that prose to an operator who is looking at it, and the deferred worker is about
 * to write it to a row that has waited for it. A `null` here writes a NULL vector, which is
 * exactly the state `listNinaAvatarDescribeBacklog` picks up on the next sweep — so the failure
 * degrades into "not searchable yet", which is what it actually is, and never into "the model's
 * words were thrown away".
 *
 * `embedNinaText` does its own `logNinaError` (phase 1), so this adds a console line for the local
 * operator and nothing else.
 */
export async function embedNinaAvatarDescription(
  description: string,
  /* Passed through to `embedNinaText`'s failure log. Phase 1's contract asks for it in as many
   * words ("Phase 2 and 3 both have the id and should pass it") — `nina_error_logs.user_id` is
   * nullable, and a row that cannot say whose album it came from is a row nobody can act on. */
  userId: string,
): Promise<number[] | null> {
  try {
    return await embedNinaText(description, { userId })
  } catch (cause) {
    console.error('[f34] embedding failed; the description is kept and stays unsearchable', cause)
    return null
  }
}

/**
 * One row. Decides for itself what the row still needs, and writes both columns in one statement.
 *
 * `describe: false` is the rewrite path (`editNinaAvatarDescriptionAction`): the prose is the
 * human's and a vision call would be both wasteful and wrong. A row that has no prose under
 * `describe: false` is simply left alone — an operator who CLEARED the box asked for silence, and
 * "the empty box IS the clear" (D1) does not mean "and now go invent something".
 */
async function fillOne(
  userId: string,
  target: NinaAvatarDescribeTarget,
  describe: boolean,
  outcome: NinaDescribeFillOutcome,
): Promise<void> {
  try {
    let description = target.description

    if (description == null) {
      if (!describe) return
      /* An album row is a photograph of HER — the self witness, exactly as the describe button.
       * See `describeNinaAvatarAction`'s docstring for the wrong-prompt history. */
      const result = await describeNinaImages(
        [{ blobUrl: target.blobUrl, pathname: target.pathname }],
        { subject: describeSubjectForSide('hers') },
      )
      description = result.description
      outcome.described += 1
    } else if (target.hasEmbedding) {
      // Prose and vector both present: authoritative skip, and not one vendor call.
      outcome.alreadyDone += 1
      return
    }

    const embedding = await embedNinaAvatarDescription(description, userId)
    if (embedding != null) outcome.embedded += 1
    await setNinaAvatarDescriptionAndEmbedding(userId, target.id, description, embedding)
  } catch (cause) {
    outcome.failed += 1
    // Non-fatal, exactly as the old register-path pre-pass was. The "Describe it" button on the
    // card is the recovery, and it always was the recovery. The backfill route is the bulk one.
    console.error('[f34] deferred describe failed', target.id, cause)
  }
}

/**
 * A fixed number of lanes drawing from one shared index, stopping at a deadline.
 *
 * `next++` needs no lock: JavaScript is single-threaded and each lane only advances at an `await`
 * boundary, so the read-and-increment is atomic with respect to every other lane. This is
 * `useFolderUpload.ts`'s `runLanes`, one layer down, plus the deadline — and it is four lines
 * rather than a dependency.
 *
 * Past the deadline the lanes keep DRAINING the array without working, so `ranOutOfTime` is a
 * truthful count rather than "the rest, probably".
 */
async function runFillLanes(
  userId: string,
  targets: readonly NinaAvatarDescribeTarget[],
  describe: boolean,
  deadline: number,
): Promise<NinaDescribeFillOutcome> {
  const outcome = emptyOutcome()
  let next = 0
  const lanes = Array.from(
    { length: Math.min(NINA_DEFERRED_DESCRIBE_CONCURRENCY, targets.length) },
    async () => {
      for (;;) {
        const target = targets[next++]
        if (target == null) return
        if (Date.now() >= deadline) {
          outcome.ranOutOfTime += 1
          continue
        }
        await fillOne(userId, target, describe, outcome)
      }
    },
  )
  await Promise.all(lanes)
  return outcome
}

/**
 * Work a list of already-read targets to completion or to the budget. **No `after()`** — this is
 * the entry point for a caller that is already off the request path and wants the outcome in its
 * own return value, which today is `app/api/admin/nina/backfill-descriptions/route.ts`.
 */
export async function fillNinaAvatarDescribeTargets(
  userId: string,
  targets: readonly NinaAvatarDescribeTarget[],
  budgetMs: number,
): Promise<NinaDescribeFillOutcome> {
  return runFillLanes(userId, targets, true, Date.now() + budgetMs)
}

/**
 * Schedule the pre-pass for a set of rows, AFTER the response has gone out.
 *
 * ── WHY `after()` AND NOT `await` ───────────────────────────────────────────────────────────
 * The repo's own idiom for a second model call the caller must not wait on
 * (`lib/nina/actions.ts:782` schedules distillation the same way, for the same reason). It also
 * keeps invariant 4 trivially true: this is a Server Action, never a render, and the model call is
 * not even on the action's clock.
 *
 * ── WHY IT RE-READS THE ROWS INSIDE THE CALLBACK ────────────────────────────────────────────
 * So the caller pays nothing. `setCurrentNinaAvatarAction` would otherwise need an extra
 * `getNinaAvatar` on its hot path just to discover whether a describe is needed; here the read
 * happens after the operator already has their answer, and the skip is authoritative at the moment
 * the work would actually run. ONE statement for the whole batch —
 * `listNinaAvatarDescribeTargets`, not fifty `getNinaAvatar` calls.
 *
 * ── NO `revalidatePath` IN HERE, DELIBERATELY ───────────────────────────────────────────────
 * `after()` runs once the response is finished, so there is no re-render left to attach to — an
 * action's revalidation is what makes the framework include a fresh RSC payload in the SAME
 * response (`node_modules/next/dist/docs/01-app/02-guides/server-actions.md`, "A single response
 * carries data and UI"). `/admin/nina` is `force-dynamic` and its reads are not cached, so the
 * operator's next navigation shows the description with nothing to invalidate.
 * `ensureNinaAvatarDescriptionAction` is the in-band variant for a caller that needs the prose in
 * its own return value.
 */
export function scheduleDescribeAll(userId: string, ids: readonly string[]): void {
  scheduleFill(userId, ids, true)
}

/**
 * The one-row form, unchanged in signature so its three original call sites did not have to move:
 * `setCurrentNinaAvatarAction`, `setChatPhotoAsAvatarAction`, and (before this phase) the upload
 * path's empty-album promotion.
 */
export function scheduleDescribe(userId: string, id: string): void {
  scheduleFill(userId, [id], true)
}

/**
 * Re-embed a row whose prose a HUMAN just rewrote. No vision call, ever.
 *
 * `editNinaAvatarDescriptionAction` writes the new prose with a NULL vector in one UPDATE and then
 * calls this, so the row is never searchable under words it no longer contains — a stale vector is
 * worse than a missing one, because a missing one is visible in the backlog count and a stale one
 * is invisible until a search returns the wrong photo. If this callback never runs, the row is
 * simply in the backlog.
 */
export function scheduleEmbed(userId: string, id: string): void {
  scheduleFill(userId, [id], false)
}

function scheduleFill(userId: string, ids: readonly string[], describe: boolean): void {
  if (ids.length === 0) return
  after(async () => {
    // Measured from inside the callback: `after()` starts when the response is finished, and the
    // budget is about how long THIS work may run, not how long the action took.
    const deadline = Date.now() + NINA_DEFERRED_DESCRIBE_BUDGET_MS
    try {
      const targets = await listNinaAvatarDescribeTargets(userId, ids)
      const outcome = await runFillLanes(userId, targets, describe, deadline)
      if (outcome.ranOutOfTime > 0 || outcome.failed > 0) {
        console.warn('[f34] deferred describe finished short', {
          requested: ids.length,
          ...outcome,
        })
      }
    } catch (cause) {
      console.error('[f34] deferred describe batch failed', { requested: ids.length }, cause)
    }
  })
}
