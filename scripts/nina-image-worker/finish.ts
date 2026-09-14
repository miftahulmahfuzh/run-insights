/**
 * Finishing: the ledger writes that make a generation visible. Success for a chat selfie (message
 * + image row + the job closed `ok`), success for an avatar (the `is_current` swap in one
 * transaction), and failure (retry while the budget lasts, apology + terminal close once it is
 * spent).
 *
 * Part of the `nina-image-worker/` split; the system-level doc — why this worker exists, why it is
 * `.ts`, what it cannot import, where it runs — lives in the barrel `../nina-image-worker.ts`. The
 * worker's import rules: `.ts`-suffixed relative imports only, no `@/` aliases, no `server-only`,
 * CJS packages through `createRequire`.
 */
import { newId } from '../../lib/id.ts'
import { planNinaImageWrite, type NinaImageDedupHit } from '../../lib/nina/imageDedupe.ts'
import { ninaImageApology, ninaImageCaption } from '../../lib/nina/imagefail.ts'
import type { NinaImageFailure } from '../../lib/nina/imagefail.ts'
import {
  NINA_IMAGE_COST_MICRO_USD,
  NINA_IMAGE_HEIGHT,
  NINA_IMAGE_MAX_ATTEMPTS,
  NINA_IMAGE_WIDTH,
} from '../../lib/nina/imagerecipe.ts'

import { releaseBlobIfUnreferenced } from './cleanup.ts'
import { findContentDuplicate } from './dedupe.ts'
import { sendWorkerPush } from './push.ts'
import { resolveWorkerSessionId } from './session.ts'
import type { ClaimedJob } from './claim.ts'
import type { WorkerNotifier } from './push.ts'
import type { WorkerStoredImage } from './store.ts'
import type { NeonSql } from './sql.ts'

/**
 * Success, for a **chat selfie**. The photograph, as an ordinary chat message.
 *
 * **Not a special kind of message** — a `nina_messages` row plus a `nina_message_images` row with
 * `kind = 'generated'`, which is the same pair phase 6 writes for an upload. That is what makes it
 * quotable (phase 7), gallery-able (phase 13) and unread-able (phase 10) for free.
 *
 * `source = 'chat'` on purpose, and NOT a sixth `NinaMessageSource`: she is answering something he
 * said in an open conversation, minutes ago. Adding a source value would force an edit to phase 1's
 * column domain and phase 10's `'chat' | ProactiveTriggerKind` test for no gain (RULING C9).
 *
 * The caption is never empty. `nina_messages.text` is `notNull` and would accept `''`, but an empty
 * bubble is not a message.
 *
 * `prompt` gets the sidecar (prompt as sent, model, seed) and `description` gets the scene prose.
 * Phase 6's `glm-4.6v` describe pre-pass is **not** run over a generated image: we wrote the
 * picture, so we already know what is in it, and paying a vision call to be told back our own prompt
 * would be absurd. Phases 14 and 15 hand-upload files with no prompt and DO run that pre-pass —
 * that is the whole difference between the two paths.
 *
 * **THE ORDER IS LOAD-BEARING.** The message and its image row go in FIRST, then the job is marked
 * `ok`. A crash between the two leaves a `pending` job whose photo is already in the chat — which a
 * sweep will eventually apologise for, so the runner sees a picture AND an apology. Odd, but
 * survivable and self-correcting. The reverse order would mark the job done with no photograph
 * anywhere and no sweep left to notice, which is R22's exact failure.
 *
 * `reply_to_id` is written through a subselect rather than trusted: a quote whose target was deleted
 * must degrade to a plain message, not violate the foreign key and lose the photograph.
 *
 * **`session_id` IS FINDING 1, AND IT IS RESOLVED RATHER THAN GUESSED.** It is `NOT NULL` and this
 * function omitted it, so the picture was generated, paid for, stored in Blob — and thrown away by
 * the INSERT that would have shown it. `resolveWorkerSessionId` is the policy, and it is the same
 * policy `postNinaApologyMessage` uses on the app side. Note that `reply_to_id` and `session_id`
 * degrade in OPPOSITE directions and that is correct: a deleted quote target degrades to a plain
 * message (`set null`), while a message with no session is not a message at all.
 *
 * **When no session resolves, this throws rather than writing anything.** The caller turns that into
 * a `transport` failure through `closeFailed`, which records what was spent and — once the retry
 * budget is gone — apologises. The state is reachable only when he has removed every session he has
 * (R11), and the honest cost is that the retry regenerates and spends a second $0.04 before giving
 * up. That is priced rather than special-cased: both spends are now recorded (see `closeFailed`), so
 * phase 4's detail page will show `attempts: 2` and a doubled cost, which is exactly what happened.
 *
 * *media-dedupe P3: the image row is written from `planNinaImageWrite` — the same pure function the
 * app side calls — so a generation whose bytes this user already stores lands as a REFERENCE with no
 * second object; the race between the pre-put lookup and this insert is closed HERE, and the loser
 * blob is released only after the row that replaced it is in.*
 *
 * ── nina-push-every-message R1: THE KNOCK ON THE DOOR, FROM THIS HOST ─────────────────────────
 * He asked for this photograph ninety seconds ago and has certainly locked his phone. Until this
 * phase the only way he learned it had arrived was opening `/nina` and looking — and this is the
 * host that finishes the jobs the app's own invocation was killed mid-flight, so it is the host
 * where the wait was longest.
 *
 * `lib/nina/imagerun.ts`'s `finishSelfie` is the in-platform twin and sends its push at the SAME
 * point in its own function: last statement, after both rows, after the dedupe re-check, after the
 * ledger is closed.
 *
 * **It stamps a DIFFERENT kind, and that is deliberate.** That host sends `'photo_delivered'`;
 * this one sends `'worker_photo_delivered'`. `NinaPushPayload.kind` is diagnostics only, and
 * "which host delivered this photograph" is exactly the diagnostic this backstop exists to
 * produce — it runs ONLY when the app's own invocation was killed, so a `worker_*` value in a log
 * line is the one signal anywhere that says the backstop fired. Collapsing the two into one value
 * would read identically on both hosts and answer nothing. DO NOT TIDY THEM TOGETHER.
 *
 * The bodies differ too — that host captions with `glm-4.6v` and this one uses `ninaImageCaption`'s
 * pool — and that is not a drift to fix either, for the reason the INSERT's own comment gives
 * below. The notification carries whatever the bubble carries, on each host, which is the property
 * that matters.
 *
 * **`notify` is a parameter with a default, and that is the test seam.** `sendWorkerPush` reaches
 * `web-push` through `createRequire`, which no `vi.mock` registry reaches, so the only way a test
 * can assert the call is to hand one in. The precedent is `releaseBlobIfUnreferenced`'s `delFn`.
 * `run.ts` passes four arguments and is unchanged.
 */
export async function finishSelfie(
  sql: NeonSql,
  job: ClaimedJob,
  image: WorkerStoredImage,
  result: { costMicroUsd: number; latencyMs: number },
  /** Test seam; see the header. Defaults to the real sender and `run.ts` never passes it. */
  notify: WorkerNotifier = sendWorkerPush,
): Promise<void> {
  const messageId = newId()
  const imageId = newId()
  const { jobId, userId, args } = job

  /* ONE value, used twice: the text of the bubble and the body of the notification. Two
   * `ninaImageCaption(jobId)` calls WOULD agree — it is a pure FNV-1a over the job id, which is
   * exactly why it is deterministic — so this is about making the agreement structural instead of
   * merely true. A notification whose body is not the message is worse than no notification. */
  const caption = ninaImageCaption(jobId)

  const sessionId = await resolveWorkerSessionId(sql, userId, args.replyToId)
  if (sessionId == null) {
    throw new Error(`no session to file the photograph in (job ${jobId})`)
  }

  /* ── media-dedupe P3: THE RACE-CLOSE, ASKED A SECOND TIME AT THE INSERT ─────────────────────
   * `store` asked before its put; two hosts can both hear "no" and both put. The same lookup runs
   * again here, and a hit turns this write into a REFERENCE through `planNinaImageWrite` — with
   * the fresh loser bytes scheduled for release after the row is in. A lookup fault degrades to
   * "original", the same rule as the pre-put lookup: the photograph must never be lost to a
   * dedup read. */
  let racedDuplicate: NinaImageDedupHit | null = null
  if (image.duplicateOf == null && image.contentHash != null) {
    try {
      racedDuplicate = await findContentDuplicate(sql, userId, image.contentHash)
    } catch (cause) {
      console.warn('[nina-worker] dedup re-check failed; writing an original', {
        jobId,
        error: String(cause),
      })
    }
  }
  const writePlan = planNinaImageWrite({
    hit: image.duplicateOf ?? racedDuplicate,
    stored: { blobUrl: image.blobUrl, pathname: image.pathname, contentHash: image.contentHash },
  })
  if (writePlan.release != null) {
    console.info('[nina-worker] lost a dedup race; the row will reference the keeper', {
      jobId,
      bytes: image.bytes,
      hash: image.contentHash?.slice(0, 12) ?? null,
    })
  }

  /* `photo_only = true` marks the bubble as existing only to carry the picture — the same fact
   * `finishSelfie` and `addChatPhotoAction` record through `NinaMessageInsert.photoOnly`. Here it is
   * a column name in SQL and nothing more, because this file may not import `@/lib/db/schema`.
   *
   * THE CANNED CAPTION IS PERMANENT ON THIS HOST, and it is not an inconsistency to fix. This
   * worker runs on a GitHub runner with no z.ai key, and `lib/nina/imagefail.ts` — the one module it
   * imports, by relative path under `--experimental-strip-types` — states in its own header that it
   * may import nothing at all. Reaching for `@/lib/nina/caption` here would stop the worker booting,
   * and a caption that fails to be produced is the exact bug `imagefail.ts` exists to kill. What
   * makes the canned line acceptable is that its pool no longer asserts a scene: every member is
   * true of any photograph of her.
   *
   * DEPLOY ORDER: this INSERT names a column migration 0008 creates. Additive, and migrations run
   * before the deploy in the normal order — but a worker deployed against an un-migrated database
   * fails this statement, so the order is a requirement here and not an incidental. The same now
   * applies to `content_hash` (migration 0018, media-dedupe P1) — except that preflight's
   * `findSchemaDrift` runs the existence check FIRST, so an un-migrated database takes the
   * workflow red before a job is claimed, rather than dropping a photograph after the money was
   * spent. */
  await sql`
    insert into nina_messages
      (id, user_id, session_id, role, text, source, turn_id, reply_to_id, photo_only)
    values (
      ${messageId}, ${userId}, ${sessionId}, 'nina', ${caption}, 'chat', ${jobId},
      (select id from nina_messages where id = ${args.replyToId} and user_id = ${userId}),
      true
    )
  `
  /* The plan's values, not `image`'s: a deduped row carries the KEEPER's object and the keeper's
   * id in `source_image_id`, so `isOriginalPhoto()` hides it from the collection while the bubble
   * still renders it. `description`/`prompt` stay THIS generation's — the same argument the app
   * side makes at its insert: the scene is a truthful description of these bytes, and the sidecar
   * is what ITS generation was told. */
  await sql`
    insert into nina_message_images
      (id, user_id, message_id, kind, blob_url, pathname, width, height, bytes, description, prompt,
       content_hash, source_image_id, sort_order)
    values (
      ${imageId}, ${userId}, ${messageId}, 'generated', ${writePlan.row.blobUrl},
      ${writePlan.row.pathname}, ${NINA_IMAGE_WIDTH}, ${NINA_IMAGE_HEIGHT}, ${image.bytes},
      ${args.scene}, ${args.sidecar}, ${writePlan.row.contentHash}, ${writePlan.row.sourceImageId}, 0
    )
  `
  await sql`
    update nina_turns
    set status = 'ok', error_code = null, latency_ms = ${result.latencyMs},
        cost_micro_usd = coalesce(cost_micro_usd, 0) + ${result.costMicroUsd}
    where id = ${jobId} and user_id = ${userId}
  `

  /* Loser bytes out, after the row that replaced them is in — ROW FIRST, BLOB SECOND. Reached
   * only on the race path: the skip path never put anything. If the INSERT above throws instead,
   * the loser blob stays behind and the reaper owns it — the same orphan class the existing
   * `finish:` failure branch already documents. */
  if (writePlan.release != null) {
    await releaseBlobIfUnreferenced(sql, userId, writePlan.release)
  }

  /*
   * R1, from this host. See the header for why it is here and not higher up, and for why the body
   * is `caption`.
   *
   * ── ITS OWN `try`, AND IT SWALLOWS (PLAN INVARIANT 2) ────────────────────────────────────────
   * `sendWorkerPush` never throws on its own account — a runner with no `VAPID_*` is reported as
   * `skipped`, not raised — so reaching this catch means a bug or an injected notifier. Neither is
   * worth a photograph: the bubble is in the chat, the image row is in, the job is closed `ok`, and
   * throwing here would send `runOneJob` into `closeFailed`, which would mark a DELIVERED
   * generation `failed` and apologise for a picture he can already see. That is the same blast
   * radius Finding 1 had, and the same wrapping closes it.
   *
   * The report is logged rather than returned: this function is `Promise<void>` and a photograph's
   * success has nothing to do with whether a phone was reachable. `jobId` only — invariant 4, this
   * line appears in a public Actions log.
   */
  try {
    const report = await notify(
      sql,
      userId,
      [{ id: messageId, body: caption }],
      'worker_photo_delivered',
    )
    console.info('[nina-worker] notified', { jobId, ...report })
  } catch (cause) {
    console.warn('[nina-worker] the notification could not be sent; the photograph is in', {
      jobId,
      error: String(cause),
    })
  }
}

/**
 * Success, for an **avatar** (phases 13 and 15).
 *
 * The two statements are one `sql.transaction`, in this order, because phase 1's partial unique
 * index `nina_avatars_user_current_unq` makes it mandatory rather than merely tidy: inserting a
 * second `is_current` row before un-currenting the first violates the index. This mirrors phase 1's
 * `insertNinaAvatarAsCurrent`, which uses `db.batch` for the same reason — and re-implementing it
 * here is the duplication the plan's Risk 1 names.
 *
 * `announced_at` is left NULL, and **that NULL IS phase 10's `avatar_changed` trigger.** This is the
 * only place a *generated* avatar becomes announceable, and it is reached only on success — which is
 * the structural half of "her announcement must not fire for a photograph that does not exist".
 *
 * No `nina_messages` row. Nobody asked in chat; phase 10's next tick is what makes her mention it.
 *
 * Exported because `runOneJob` (`run.ts`) dispatches to it across the module boundary now;
 * deliberately NOT re-exported by the barrel, so the worker's published surface is unchanged.
 */
export async function finishAvatar(
  sql: NeonSql,
  job: ClaimedJob,
  image: { blobUrl: string; pathname: string; bytes: number },
  result: { costMicroUsd: number; latencyMs: number },
): Promise<void> {
  const { jobId, userId, args } = job
  const avatarId = newId()
  const source = args.source === 'admin' ? 'admin' : 'generated'

  await sql.transaction([
    sql`update nina_avatars set is_current = false where user_id = ${userId} and is_current = true`,
    sql`
      insert into nina_avatars
        (id, user_id, blob_url, pathname, width, height, bytes, source, description, is_current, announced_at)
      values (
        ${avatarId}, ${userId}, ${image.blobUrl}, ${image.pathname}, ${NINA_IMAGE_WIDTH},
        ${NINA_IMAGE_HEIGHT}, ${image.bytes}, ${source}, ${args.scene}, true, null
      )
    `,
  ])

  await sql`
    update nina_turns
    set status = 'ok', error_code = null, latency_ms = ${result.latencyMs},
        cost_micro_usd = coalesce(cost_micro_usd, 0) + ${result.costMicroUsd}
    where id = ${jobId} and user_id = ${userId}
  `
}

/**
 * Failure. **Two outcomes, and the choice is the retry budget.**
 *
 * If attempts remain, the row goes back to `queued` and stays `pending`, so the next backstop run
 * tries again with the SAME prompt and the SAME seed — which is why both are stored rather than
 * rebuilt. Nothing is said to the runner: her bubble still says she is taking the photo, and she is.
 *
 * If the budget is spent, the job is terminal and **the apology goes in with it, in the same
 * function**, because a caller that could mark a job failed without saying anything is a caller that
 * will eventually do so. An **avatar** job posts nothing — nobody asked for it in chat — which is
 * the same rule `failNinaImageJob` and both sweeps follow.
 *
 * ── FINDING 1's BLAST RADIUS: THE APOLOGY CANNOT TAKE THE JOB DOWN WITH IT ────────────────────
 * The apology INSERT omitted `session_id`, so on the final attempt it threw, the throw propagated
 * out of `runOneJob` and out of `main`, and the process died BEFORE the terminal
 * `update nina_turns` ever ran. The job stayed `pending`, the app's 20-minute sweep later marked it
 * `stale`, and `cost_micro_usd` stayed NULL — measured on jobs `pF5c6V8YbxAR` (73 925 ms) and
 * `ChfwHZ2GJT4I` (55 600 ms), both of which reached OpenRouter successfully. **The money was spent
 * and the ledger said it was free.**
 *
 * So the apology is now best-effort and the terminal UPDATE is not. The ordering is unchanged —
 * apology first, then close — because the alternative (close first) would let a crash in between
 * leave a `failed` job with no apology and no sweep left to notice it, and the sweep only looks at
 * `pending` rows. Wrapping is strictly better than reordering here.
 *
 * ── INVARIANT 9: MONEY IS NEVER SPENT SILENTLY ───────────────────────────────────────────────
 * `costMicroUsd` is what THIS attempt is known to have spent, or null when the call never came back
 * with a figure. Both branches now accumulate onto the row rather than overwriting it, because two
 * attempts are two generations and two bills. The retry branch adds only a KNOWN spend: an unknown
 * one would otherwise be guessed twice for the same picture. The terminal branch keeps the old
 * behaviour of guessing high when nothing is known — a call that reached the provider and then timed
 * out was very probably billed, and guessing high is the honest direction for a cost log.
 */
export async function closeFailed(
  sql: NeonSql,
  job: ClaimedJob,
  outcome: {
    kind: NinaImageFailure
    latencyMs: number
    detail: string
    /** Micro-USD this attempt is KNOWN to have spent. Null when the call returned no figure. */
    costMicroUsd: number | null
  },
  /** Test seam; see `finishSelfie`'s header. Defaults to the real sender; `run.ts` never passes it. */
  notify: WorkerNotifier = sendWorkerPush,
): Promise<'retry' | 'gave-up'> {
  const { jobId, userId, args, attempts } = job
  console.warn('[nina-worker] generation failed', {
    jobId,
    kind: outcome.kind,
    attempts,
    detail: outcome.detail,
  })

  if (attempts < NINA_IMAGE_MAX_ATTEMPTS) {
    await sql`
      update nina_turns set
        error_code = 'queued',
        latency_ms = ${outcome.latencyMs},
        cost_micro_usd = coalesce(cost_micro_usd, 0) + ${outcome.costMicroUsd ?? 0}
      where id = ${jobId} and user_id = ${userId} and status = 'pending'
    `
    return 'retry'
  }

  /* Bound outside the branch so the notify after the terminal UPDATE can see it. Null means NO ROW
   * WAS WRITTEN — no session resolved, or the write threw — and a notification about a message that
   * does not exist is strictly worse than silence. Same rule phase 3 applies to
   * `postNinaApologyMessage`'s `insertNinaMessages` returning `[]`; different mechanism, because
   * this host writes raw SQL and gets no row back to test. */
  let apology: { id: string; body: string } | null = null

  if (args.purpose === 'selfie') {
    try {
      const sessionId = await resolveWorkerSessionId(sql, userId, args.replyToId)
      if (sessionId == null) {
        console.warn('[nina-worker] no session for the apology; closing the job anyway', { jobId })
      } else {
        /* ONE id and ONE sentence, used by the INSERT and by the notification. `ninaImageApology`
         * is deterministic over (kind, jobId) so two calls would agree — but `newId()` is not, and
         * `NinaPushPayload.messageId` must name the row that actually exists. */
        const messageId = newId()
        const body = ninaImageApology(outcome.kind, jobId)

        await sql`
          insert into nina_messages
            (id, user_id, session_id, role, text, source, turn_id, reply_to_id)
          values (
            ${messageId}, ${userId}, ${sessionId}, 'nina', ${body},
            'chat', ${jobId},
            (select id from nina_messages where id = ${args.replyToId} and user_id = ${userId})
          )
        `
        /* Only after the INSERT resolved. If it threw, the catch below runs and this stays null. */
        apology = { id: messageId, body }
      }
    } catch (cause) {
      /* Best-effort, and it MUST stay that way. See the header: this throw is what killed the
       * process before the money could be recorded. Nothing identifying is logged — invariant 4,
       * this repository is public and this line appears in an Actions run. */
      console.warn('[nina-worker] the apology could not be written; closing the job anyway', {
        jobId,
        error: String(cause),
      })
    }
  }

  await sql`
    update nina_turns
    set status = 'failed', error_code = ${outcome.kind}, latency_ms = ${outcome.latencyMs},
        cost_micro_usd = coalesce(cost_micro_usd, 0)
          + ${outcome.costMicroUsd ?? NINA_IMAGE_COST_MICRO_USD}
    where id = ${jobId} and user_id = ${userId} and status = 'pending'
  `

  /*
   * ── R1, THE OTHER HALF: TWENTY MINUTES IS A LONG TIME TO WAIT FOR A PHOTO THAT IS NOT COMING ─
   * The last uncovered `nina_messages` write in this plan set, on the host the runner cannot see.
   * The app apologises through `lib/nina/imagejobs.ts`'s `postNinaApologyMessage` (phase 3) and
   * pushes `'photo_apology'`; this is the same sentence, from the backstop, under its own
   * `'worker_photo_apology'` — see this file's `finishSelfie` header for why the two hosts keep
   * separate kinds.
   *
   * `apology == null` covers every path that wrote no row: a retry (which returned above), an
   * avatar job (which never enters the branch), a session that would not resolve, and an INSERT
   * that threw. None of them may buzz a phone.
   *
   * ── ITS OWN `try`, AND IT SWALLOWS (PLAN INVARIANT 2) ───────────────────────────────────────
   * Deliberately NOT the `try` around the write above: that one's catch logs "the apology could
   * not be written", and a notify failure landing there would file itself under a message that
   * did get written. The job is already closed `failed` by the statement above, so nothing here
   * can reopen it — throwing would only take `runOneJob` down after the money was recorded, which
   * is the exact failure this function's header exists to prevent. `jobId` only: invariant 4, this
   * line appears in a public Actions log.
   */
  if (apology != null) {
    try {
      const report = await notify(sql, userId, [apology], 'worker_photo_apology')
      console.info('[nina-worker] apology notified', { jobId, ...report })
    } catch (cause) {
      console.warn('[nina-worker] the apology notification could not be sent; the job is closed', {
        jobId,
        error: String(cause),
      })
    }
  }

  return 'gave-up'
}
