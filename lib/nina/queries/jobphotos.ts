import { and, asc, desc, eq, gte, isNotNull, or } from 'drizzle-orm'

import { db } from '@/lib/db'
import { ninaMessageImages, ninaMessages } from '@/lib/db/schema'

/**
 * Split from `lib/nina/queries.ts` on 2026-09-12: this file carries that barrel's §11
 * "The promise reward's landing test (R5, phase 4)" and §12 "The job → photograph link
 * (this set's R2/R3/R4)", both moved byte-identical; `lib/nina/queries.ts` remains the
 * public barrel and re-exports everything here. §12's mention of §11 is intra-module by
 * construction — both sections landed here together.
 */
/* ============================================================================
 * §11 The promise reward's landing test (R5, phase 4)
 * ==========================================================================*/

/**
 * **The job ids of photographs that have actually reached the conversation.**
 *
 * `scripts/nina-image-worker.ts`'s `finishSelfie` writes two rows for every chat selfie: a
 * `nina_messages` row with `turn_id` set to the image job's id, and a `nina_message_images` row
 * with `kind = 'generated'`. So the existence of a `turn_id` in this result is proof that a
 * specific dispatched job produced a specific visible photograph — which is exactly what
 * `evaluatePromise`'s `selfieLandedForJob` needs, and which nothing weaker can promise.
 *
 * ── WHY IDS AND NOT A COUNT ───────────────────────────────────────────────────────────────────
 * A count of photographs since a day would let a selfie HE asked for through `generate_image`
 * settle a promise he had not kept — `ninaImageDailyCap()` allows several a day, so that is not a
 * theoretical collision. The avatar landing test can afford a same-day tolerance because a
 * *generated avatar* only ever comes from a promise or an operator; a chat selfie cannot. Same
 * read, same index, exact answer.
 *
 * ── WHY IT IS INDEXED ─────────────────────────────────────────────────────────────────────────
 * `nina_message_images_user_created_idx on (user_id, created_at desc)` is the leading-column range
 * scan, and the join to `nina_messages` is on that table's primary key. `since` is the Jakarta
 * midnight of the earliest fired job the caller cares about; the caller computes it, because the
 * calendar rules for a promise live in `lib/nina/promises.ts` and not here.
 *
 * `kind = 'generated'` excludes HIS uploads, which share the table.
 *
 * ── AN ORPHANED PHOTOGRAPH IS NOT COUNTED, AND THAT IS THE OLD ANSWER ─────────────────────
 * `message_id` is nullable since R1 of the orphans set, and the `innerJoin` below drops a row whose
 * message is gone. That is not a behaviour change: before R1 the row itself was deleted with the
 * session, so the answer was the same. A photograph whose conversation the runner deleted is not
 * evidence that a promised selfie landed in a conversation.
 */
export async function listNinaSelfieJobIdsSince(userId: string, since: Date): Promise<string[]> {
  const rows = await db
    .selectDistinct({ jobId: ninaMessages.turnId })
    .from(ninaMessageImages)
    .innerJoin(ninaMessages, eq(ninaMessages.id, ninaMessageImages.messageId))
    .where(
      and(
        eq(ninaMessageImages.userId, userId),
        eq(ninaMessageImages.kind, 'generated'),
        gte(ninaMessageImages.createdAt, since),
        isNotNull(ninaMessages.turnId),
      ),
    )
  return rows.map((row) => row.jobId).filter((jobId): jobId is string => jobId != null)
}

/* ============================================================================
 * §12 The job → photograph link (this set's R2/R3/R4)
 * ==========================================================================*/

/**
 * The whole fact the Detail foto row needs: the id of the photograph the job produced. See
 * `getNinaJobPhoto` for why that is all it selects.
 */
export interface NinaJobPhotoRow {
  /** The `nina_message_images.id` the `/nina/about?photo=chat.<id>` link names. */
  id: string
}

/**
 * **A job's photograph, through the only job→photo key the schema has: `nina_messages.turn_id`.**
 *
 * Both writers of a finished selfie spell the chain the same way — `scripts/nina-image-worker.ts`'s
 * `finishSelfie` (raw SQL) and its in-platform twin `lib/nina/imagerun.ts` insert one
 * `nina_messages` row with `turn_id = jobId` and `photo_only`, then one `nina_message_images` row
 * with `kind = 'generated'` hanging off it. The image row itself carries NO job id, so the join
 * below is not one way to answer the question, it is the only one. `listNinaSelfieJobIdsSince`
 * (§11) walks this exact join in the other direction; this is that read with a point instead of a
 * list.
 *
 * ── WHY THE LINK SURVIVES AN ADMIN REPLACE, AND DIES ON AN ADMIN REMOVE ───────────────────────
 * `replaceChatPhotoAction` swaps bytes on the SAME row (`updateNinaChatPhotoBlob` — same id, same
 * `message_id`, same `created_at`), so the id this read returns keeps naming the photograph after
 * a Replace, and the viewer it opens shows the new bytes. That is R4, and it is why the link must
 * name the row id and nothing derived from the bytes. `removeChatPhotoAction` deletes the row
 * outright — R3's stated boundary — and this read then returns `null`, which the page renders as
 * NO control: never a link the server has not proved.
 *
 * ── THE TWO NULLS, AND WHY NEITHER IS AN ERROR ────────────────────────────────────────────────
 * "Not yours" and "does not resolve" are one outcome, this module's standing rule. The second
 * `null` here is genuinely ambiguous by design: a removed session cascades the carrier message
 * away, the `innerJoin` misses, and the photograph — orphaned, `message_id SET NULL` — stays alive
 * in Media but unreachable from Detail foto. That degradation is DECIDED (plan index, *Decisions*:
 * repairing it needs a `job_id` column, which is a migration this set forbids), so `null` is the
 * honest answer and not a case to disambiguate. `finishAvatar` writes no carrier message at all,
 * so an avatar job's `turn_id` names nothing and this read returns `null` for one by construction —
 * the page still skips calling it (see `planJobPhoto`'s avatar arm, the rule half of that
 * decision).
 *
 * ── OWNER SCOPE ON BOTH TABLES ────────────────────────────────────────────────────────────────
 * `nina_message_images.user_id` is this module's standing rule. `nina_messages.user_id` is spelled
 * too, although the page has already owner-verified `jobId` through `getNinaImageJobDetail`: a
 * join's WHERE is where this module proves ownership, and a job id is a claim wherever it arrives
 * from. The redundancy costs one predicate, not one round trip.
 *
 * ── WHY `kind = 'generated'`, THE ORDER, AND THE ONE ROW ──────────────────────────────────────
 * `generated` excludes HIS uploads, which share the table. The order is the gallery's own —
 * `(created_at desc, id desc)`, `listNinaMessageImages`' — so `LIMIT 1` is deterministic even if a
 * job ever carried two photographs; today both writers write exactly one, so the tiebreak is
 * insurance rather than a fix.
 *
 * ── WHY `isOriginalPhoto()` IS DELIBERATELY ABSENT ────────────────────────────────────────────
 * This read makes a photograph RENDER — the Detail foto icon is drawn from the row it returns —
 * which is exactly the class `isOriginalPhoto`'s docstring says must never be filtered (the reads
 * that render). The absence is asserted in `tests/nina.photoRefs.test.ts`, so a future
 * "consistency" cleanup that adds the predicate here fails loudly instead of blanking the control.
 *
 * ── WHY THE PROJECTION IS `{ id }` AND NOT `imageColumns` ─────────────────────────────────────
 * The page maps this row to an href and nothing else (plan invariant 5). Selecting only `id` makes
 * `description`'s exclusion STRUCTURAL — `glm-4.6v`'s private prose cannot cross into client props
 * if it is never selected — and keeps this read from growing a projection nobody reads. Widen it
 * only with a consumer.
 *
 * ── WHY THERE IS NO INDEX AND NO MIGRATION ────────────────────────────────────────────────────
 * `nina_messages.turn_id` is deliberately unindexed (`lib/db/schema.ts`: "nothing renders it, and
 * an audit pointer must not be able to block a delete") and this set adds no index (plan invariant
 * 4). The cost is bounded anyway: the images side enters through
 * `nina_message_images_user_created_idx (user_id, created_at desc)`, the join is on
 * `nina_messages`' primary key, and one user's photographs number in the dozens — not the
 * thousands that would make an unindexed `turn_id` scan visible. One statement, on a page opened a
 * handful of times a day — and the page now adds exactly one sequential read beside it
 * (`getNinaJobPhotoBubble`, the jump's target), which is the economics this paragraph already
 * accepted.
 */
export async function getNinaJobPhoto(
  userId: string,
  jobId: string,
): Promise<NinaJobPhotoRow | null> {
  const rows = await db
    .select({ id: ninaMessageImages.id })
    .from(ninaMessageImages)
    .innerJoin(ninaMessages, eq(ninaMessages.id, ninaMessageImages.messageId))
    .where(
      and(
        eq(ninaMessageImages.userId, userId),
        eq(ninaMessages.userId, userId),
        eq(ninaMessages.turnId, jobId),
        eq(ninaMessageImages.kind, 'generated'),
      ),
    )
    .orderBy(desc(ninaMessageImages.createdAt), desc(ninaMessageImages.id))
    .limit(1)
  return rows[0] ?? null
}

/**
 * The facts the Detail foto jump needs to build its href: which conversation to open, which bubble
 * in it to pinpoint. See `getNinaJobPhotoBubble` for why that is all it selects.
 */
export interface NinaJobPhotoBubbleRow {
  /** The `nina_messages.session_id` the deep link opens — `ninaJumpHref`'s `?s=` leg. */
  sessionId: string
  /** The `nina_messages.id` the deep link pinpoints — `ninaJumpHref`'s `?jump=` leg. */
  messageId: string
}

/**
 * **The earliest bubble, across every session, that attached the given photograph — the Detail
 * foto jump's target.**
 *
 * The photograph is `getNinaJobPhoto`'s row (the page resolves it for the icon and hands the id
 * here), and the bubbles that can be showing it are exactly two kinds of row in
 * `nina_message_images`: the ORIGINAL itself (`i.id = imageId` — Nina's carrier bubble, the
 * message whose `turn_id` names the job) and every REFERENCE copied from it
 * (`i.source_image_id = imageId` — the runner's own re-attach, written by `resolveAttachment`).
 *
 * ── WHY THE CANDIDATE SET IS EXACTLY TWO PREDICATES, AND NOT A RECURSION ─────────────────────
 * `ninaPhotoProvenance` (`lib/nina/attach.ts`) flattens `source_image_id ?? row.id`, so a copy of
 * a copy points at the ORIGINAL row — no reference names another reference, so there is no chain
 * to walk. Two predicates are the whole set; a recursive CTE would be answering a question this
 * schema cannot ask.
 *
 * ── WHY `isOriginalPhoto()` IS DELIBERATELY ABSENT, AND `kind` WITH IT ────────────────────────
 * A reference IS a valid target — "it could be nina's bubble, or user's own bubble" is the
 * requirement's own sentence, and the runner's re-attach is exactly such a reference row.
 * Filtering references here would take back the case this read exists for. No `kind` arm either:
 * the two id predicates already pin the photograph's bytes (the original arrived through
 * `getNinaJobPhoto`'s `kind = 'generated'` read, and a re-attach inherits its keeper's kind —
 * `resolveAttachment` in `lib/nina/actions.ts`), so the filter has no work to do here. Both
 * absences are asserted in `tests/nina.photoRefs.test.ts`, so a "consistency" cleanup that adds
 * either fails loudly instead of silently narrowing the target.
 *
 * ── WHY THE JOIN, AND WHY AN ORPHANED PHOTOGRAPH ANSWERS `null` ───────────────────────────────
 * A bubble is a message: `message_id` is nullable (`ON DELETE SET NULL`), and the `innerJoin`
 * skips a NULL by construction — a photograph whose conversation was removed has no bubble to
 * jump to, and `null` is the honest answer (`getNinaJobPhoto`'s second null, now answered on THIS
 * read). That join also implies `message_id IS NOT NULL`, so no such predicate is spelled.
 *
 * ── OWNER SCOPE ON BOTH TABLES ────────────────────────────────────────────────────────────────
 * `nina_message_images.user_id` is this module's standing rule; `nina_messages.user_id` is spelled
 * too, although the page has already owner-verified the job through `getNinaImageJobDetail`: a
 * join's WHERE is where this module proves ownership, and an image id is a claim wherever it
 * arrives from. The redundancy costs one predicate, not one round trip.
 *
 * ── WHY THIS ORDER ────────────────────────────────────────────────────────────────────────────
 * `nina_messages.seq` is the schema's stated total order of the whole conversation — sessions
 * slice it, `MessageList` renders in it — so "earliest across all sessions" is simply `seq ASC`,
 * and no timestamp ever compares two writers' clocks. `nina_message_images.id ASC` is the
 * tiebreak for the one shape that can produce equal seqs: two image rows on ONE carrier message.
 * `LIMIT 1` under a total order is deterministic.
 *
 * ── WHY THE PARAMETER IS THE PHOTOGRAPH'S ID AND NOT THE JOB'S ─────────────────────────────────
 * The page already resolved the photograph for the icon; a `jobId` input here would re-derive
 * `getNinaJobPhoto`'s join to name the same row. The read takes the fact and answers the question
 * it is actually asked — the same economics `getNinaJobPhoto`'s header states for its own
 * projection.
 *
 * ── WHY THERE IS NO INDEX AND NO MIGRATION ────────────────────────────────────────────────────
 * `source_image_id` is a residual predicate over a read that enters through
 * `nina_message_images_user_created_idx (user_id, created_at desc)` and joins `nina_messages` on
 * its primary key — the exact access path `getNinaJobPhoto` runs beside it on the same page load,
 * and the one that table's own header argues is enough at one user's photograph count. No
 * migration, no index (plan invariant 2); nothing has measured a need for either.
 */
export async function getNinaJobPhotoBubble(
  userId: string,
  imageId: string,
): Promise<NinaJobPhotoBubbleRow | null> {
  const rows = await db
    .select({ sessionId: ninaMessages.sessionId, messageId: ninaMessages.id })
    .from(ninaMessageImages)
    .innerJoin(ninaMessages, eq(ninaMessages.id, ninaMessageImages.messageId))
    .where(
      and(
        eq(ninaMessageImages.userId, userId),
        eq(ninaMessages.userId, userId),
        or(eq(ninaMessageImages.id, imageId), eq(ninaMessageImages.sourceImageId, imageId)),
      ),
    )
    .orderBy(asc(ninaMessages.seq), asc(ninaMessageImages.id))
    .limit(1)
  return rows[0] ?? null
}
