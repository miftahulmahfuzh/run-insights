import { after } from 'next/server'

import type { NinaDescribeFillOutcome } from '@/lib/admin/ninaAlbumDeferredDescribe'
import { describeSubjectForSide, photoSideOf } from '@/lib/nina/album'
import { buildNinaAvatarEmbedText } from '@/lib/nina/avatarEmbedText'
import { embedNinaText } from '@/lib/nina/embedding'
import {
  listNinaMessageImageDescribeTargets,
  setNinaMessageImageDescriptionAndEmbedding,
  type NinaImageDescribeTarget,
} from '@/lib/nina/queries'
import { NinaVisionTokenFloorError, describeNinaImages } from '@/lib/nina/vision'

/**
 * The deferred describe-and-embed pre-pass for the MEDIA collection — the `after()` schedulers the
 * chat-photo action modules call when a photograph's prose or keywords change.
 * `media-album-unified-search` phase 2, R1/R2.
 *
 * ── WHY A SIBLING MODULE AND NOT A `kind` PARAMETER ON THE ALBUM ONE ────────────────────────
 * `lib/admin/ninaAlbumDeferredDescribe.ts` exists as its own module for a rule this one inherits
 * (a `'use server'` module may export only async functions, and these are synchronous schedulers).
 * It is not WIDENED into covering both tables for two measured reasons:
 *
 *   1. A table discriminant would have to be threaded through `fillOne`, `runFillLanes`,
 *      `scheduleFill` AND `embedNinaAvatarDescription`'s two existing callers — five signatures
 *      changed so that one of them can pick a table.
 *   2. **The fork is not a table swap, it is a behaviour.** Every `nina_avatars` row is a
 *      photograph of HER, so the album worker hard-codes `describeSubjectForSide('hers')`. This
 *      table holds both sides, and picking the wrong witness is the measured defect
 *      `describeNinaAvatarAction`'s docstring records (*"the prompt went looking for a man who is
 *      not in the frame"*). So `fillOne` below reads `photoSideOf(target.kind)`, which is a
 *      different function body, not a different table name.
 *
 * Everything else is that module's, deliberately unchanged: the same `after()` posture, the same
 * lane count, the same wall-clock budget against `/admin/nina`'s 300 s segment, the same
 * non-fatal-failure contract, and the same `NinaDescribeFillOutcome` shape — imported rather than
 * re-declared, so the two pipelines report in one vocabulary and a future dashboard reads one type.
 */

/** `NINA_DEFERRED_DESCRIBE_CONCURRENCY`'s number and reason, one table over. */
export const NINA_MEDIA_DEFERRED_DESCRIBE_CONCURRENCY = 4

/** `NINA_DEFERRED_DESCRIBE_BUDGET_MS`'s number and reason: 240 s of `/admin/nina`'s 300. */
export const NINA_MEDIA_DEFERRED_DESCRIBE_BUDGET_MS = 240_000

/** Phase 4's backfill route's own budget. Same ceiling, same 60 s reserve. */
export const NINA_MEDIA_BACKFILL_BUDGET_MS = 240_000

/** How many backlog rows one backfill POST reads — `NINA_ALBUM_BACKFILL_SLICE`'s number. */
export const NINA_MEDIA_BACKFILL_SLICE = 200

function emptyOutcome(): NinaDescribeFillOutcome {
  return { described: 0, embedded: 0, failed: 0, ranOutOfTime: 0, alreadyDone: 0 }
}

/**
 * Embed one Media description — COMBINED with its hand-written keywords — or answer `null`.
 *
 * **This is the only place in the repo that decides what a MEDIA photograph's vector is computed
 * FROM**, and it must agree with `embedNinaAvatarDescription` byte for byte, which is why both
 * call `buildNinaAvatarEmbedText` rather than either one spelling the join.
 *
 * ── THE JOIN FUNCTION IS REUSED AS-IS, NAME AND ALL ─────────────────────────────────────────
 * `buildNinaAvatarEmbedText` is generic over any `(description, searchKeywords)` pair despite the
 * word "Avatar" in it, and it is NOT renamed or forked here. `lib/nina/avatarEmbedText.ts`'s own
 * header names the failure mode a second spelling would cause — *"a second spelling of the join
 * would embed a text the app never embeds, and the corpus would end up half in one space and half
 * in another with no error anywhere"* — and both corpora are now searched by ONE ranking against
 * ONE query vector, so the two texts must be built identically or the merged ranking compares
 * apples to a different join. Renaming it would be a wide, no-behaviour diff across three runtimes
 * (`scripts/`, `research/`, the app); it stays.
 *
 * **Never throws**, for `embedNinaAvatarDescription`'s reason: an embedding outage must not cost
 * the prose. `null` writes a NULL vector, which is exactly the state
 * `listNinaMessageImageDescribeBacklog` picks up next sweep.
 */
export async function embedNinaMessageImageDescription(
  description: string,
  searchKeywords: string | null,
  userId: string,
): Promise<number[] | null> {
  try {
    return await embedNinaText(buildNinaAvatarEmbedText(description, searchKeywords), { userId })
  } catch (cause) {
    console.error(
      '[f36] media embedding failed; the description is kept and stays unsearchable',
      cause,
    )
    return null
  }
}

/**
 * One row. Decides for itself what it still needs, and writes both columns in one statement.
 *
 * `describe: false` is the rewrite path (`editChatPhotoDescriptionAction` and the two keyword
 * actions): the prose is the human's and a vision call would be both wasteful and wrong. A row
 * with no prose under `describe: false` is left alone — an operator who CLEARED the box asked for
 * silence.
 *
 * ── THE SUBJECT FOLLOWS THE PHOTOGRAPH, WHICH IS THIS WORKER'S ONE REAL DIFFERENCE ──────────
 * `photoSideOf(target.kind)` then `describeSubjectForSide` — `scheduleChatPhotoCaption`'s HALF ONE
 * already describes this table's rows that way, and this is the same mapping through the same two
 * helpers so the rule keeps one spelling and one suite.
 *
 * ── IT EMBEDS THE KEYWORDS TOO, AND IT NEVER WRITES THEM ────────────────────────────────────
 * `setNinaMessageImageDescriptionAndEmbedding` sets two columns and `search_keywords` is not one
 * of them, so the omission is structural rather than a thing to remember. That is also what makes
 * this the re-earn path for `editNinaMessageImageSearchKeywordsAction`: the keywords are already
 * written, the vector is NULL, and `describe: false` recomputes it from the pair with no vendor
 * image call.
 */
async function fillOne(
  userId: string,
  target: NinaImageDescribeTarget,
  describe: boolean,
  outcome: NinaDescribeFillOutcome,
): Promise<void> {
  try {
    let description = target.description

    if (description == null) {
      if (!describe) return
      const result = await describeNinaImages(
        [{ blobUrl: target.blobUrl, pathname: target.pathname }],
        { subject: describeSubjectForSide(photoSideOf(target.kind)) },
      )
      description = result.description
      outcome.described += 1
    } else if (target.hasEmbedding) {
      // Prose and vector both present: authoritative skip, and not one vendor call.
      outcome.alreadyDone += 1
      return
    }

    const embedding = await embedNinaMessageImageDescription(
      description,
      target.searchKeywords,
      userId,
    )
    if (embedding != null) outcome.embedded += 1
    await setNinaMessageImageDescriptionAndEmbedding(userId, target.id, description, embedding)
  } catch (cause) {
    outcome.failed += 1
    /* The floor tripping is its own class and is logged LOUDLY — `describeChatPhotoAction`'s
     * posture: it means the vendor answered 200 with an image it silently dropped, and the text of
     * such a response is exactly where an invented description would be. */
    if (cause instanceof NinaVisionTokenFloorError) {
      console.error('[f36] TOKEN FLOOR TRIPPED on a deferred media describe', {
        id: target.id,
        pathname: target.pathname,
        message: cause.message,
      })
    } else {
      console.error('[f36] deferred media describe failed', target.id, cause)
    }
  }
}

/**
 * A fixed number of lanes drawing from one shared index, stopping at a deadline —
 * `runFillLanes`'s body, one table over, and `next++` needs no lock for its stated reason.
 * Past the deadline the lanes keep DRAINING without working, so `ranOutOfTime` is truthful.
 */
async function runFillLanes(
  userId: string,
  targets: readonly NinaImageDescribeTarget[],
  describe: boolean,
  deadline: number,
): Promise<NinaDescribeFillOutcome> {
  const outcome = emptyOutcome()
  let next = 0
  const lanes = Array.from(
    { length: Math.min(NINA_MEDIA_DEFERRED_DESCRIBE_CONCURRENCY, targets.length) },
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
 * Work a list of already-read targets to completion or to the budget. **No `after()`** — the entry
 * point for a caller that is already off the request path and wants the outcome in its own return
 * value, which is phase 4's Media backfill route. `fillNinaAvatarDescribeTargets`'s twin.
 */
export async function fillNinaMessageImageDescribeTargets(
  userId: string,
  targets: readonly NinaImageDescribeTarget[],
  budgetMs: number,
): Promise<NinaDescribeFillOutcome> {
  return runFillLanes(userId, targets, true, Date.now() + budgetMs)
}

/**
 * Describe (if needed) and embed one Media row, AFTER the response has gone out.
 * `scheduleDescribe`'s twin — see that function for why it is `after()` and why it re-reads the
 * row inside the callback rather than trusting what the caller had in hand.
 */
export function scheduleMediaDescribe(userId: string, id: string): void {
  scheduleFill(userId, [id], true)
}

/**
 * Re-embed a Media row whose prose or keywords a HUMAN just rewrote. No vision call, ever.
 *
 * `scheduleEmbed`'s twin, and the same contract: the writer nulls `description_embedding` in the
 * same UPDATE as the new text, so the row is never searchable under words it no longer has, and
 * this re-earns the vector after the response. A callback that never runs costs a sweep, not a
 * correction — NULL is the state `listNinaMessageImageDescribeBacklog` already looks for.
 */
export function scheduleMediaEmbed(userId: string, id: string): void {
  scheduleFill(userId, [id], false)
}

function scheduleFill(userId: string, ids: readonly string[], describe: boolean): void {
  if (ids.length === 0) return
  after(async () => {
    // Measured from inside the callback: `after()` starts when the response is finished.
    const deadline = Date.now() + NINA_MEDIA_DEFERRED_DESCRIBE_BUDGET_MS
    try {
      const targets = await listNinaMessageImageDescribeTargets(userId, ids)
      const outcome = await runFillLanes(userId, targets, describe, deadline)
      if (outcome.ranOutOfTime > 0 || outcome.failed > 0) {
        console.warn('[f36] deferred media describe finished short', {
          requested: ids.length,
          ...outcome,
        })
      }
    } catch (cause) {
      console.error('[f36] deferred media describe batch failed', { requested: ids.length }, cause)
    }
  })
}
