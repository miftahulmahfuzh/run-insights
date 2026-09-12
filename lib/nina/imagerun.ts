import 'server-only'

import { put } from '@vercel/blob'
import { after } from 'next/server'

import { blobEnv } from '@/lib/env'
import { newId } from '@/lib/id'
import { contentHashOf } from '@/lib/photos/contentHash'

import { releaseBlobIfUnreferenced } from './blobRelease'
import { captionNinaPhoto } from './caption'
import { logNinaError } from './errorlogs'
import { callNinaImageModel, type NinaImageCallResult } from './imagecall'
import { planNinaImageWrite, type NinaImageDedupHit } from './imageDedupe'
import { ninaImageCaption, type NinaImageFailure } from './imagefail'
import { signImageBytes, type NinaImageSignature } from './perceptualSign'
import { coerceNinaImageModel } from './imageprefs'
import {
  claimNinaImageJob,
  completeNinaImageJob,
  failNinaImageJob,
  listRevivableNinaImageJobs,
  requeueNinaImageJob,
} from './imagejobs'
import {
  NINA_IMAGE_CACHE_MAX_AGE,
  NINA_IMAGE_CONTENT_TYPE,
  NINA_IMAGE_COST_MICRO_USD,
  NINA_IMAGE_DISPATCH_GRACE_MS,
  NINA_IMAGE_FINISH_RESERVE_MS,
  NINA_IMAGE_HEIGHT,
  NINA_IMAGE_MAX_ATTEMPTS,
  NINA_IMAGE_RECLAIM_MS,
  NINA_IMAGE_REVIVE_BUDGET,
  NINA_IMAGE_RUN_BUDGET_MS,
  NINA_IMAGE_WIDTH,
  ninaImageCallTimeoutMs,
  ninaImagePathname,
  ninaImageReferenceUrl,
  type NinaImageJobArgs,
  type NinaImagePurpose,
} from './imagerecipe'
import {
  findNinaImageByContentHash,
  getNinaMessagesByIds,
  insertNinaAvatarAsCurrent,
  insertNinaMessageImages,
  insertNinaMessages,
  readNinaTuning,
} from './queries'
import { resolveNinaWriteSession } from './sessionResolve'
import { NINA_TUNING_DEFAULTS } from './tuning'

/**
 * **Nina's camera, back on the platform.** This file is what
 * `scripts/nina-image-worker.ts` was, minus the reason it had to be somewhere else.
 *
 * ── WHY IT MOVED, IN ONE PARAGRAPH ────────────────────────────────────────────────────────────
 * The off-platform design rested on a sentence repeated in five files: *"the shipping generation
 * is 78.2 s measured and the Hobby ceiling in `sin1` is 60 s, so the work cannot happen on Vercel
 * at all — not in a Server Action, not in a route handler, not in `after()`."* That number
 * expired. Vercel's `/docs/fluid-compute` and `/docs/functions/configuring-functions/duration`
 * (both `last_updated: 2026-08-24`) give Hobby + Fluid compute a default AND maximum of 300 s, and
 * fluid compute has been on by default for new projects since 2025-04-23; this project was created
 * 20 August 2026. **Phase 2 step 1 measured it on this deployment rather than trusting the docs**
 * — a `maxDuration = 300` route in `sin1` held 90.4 s and returned 200, and an `after()` callback
 * logged `SURVIVED { heldMs: 90030 }` 90 s after its response was flushed and the connection
 * closed. 78.2 s fits in 300 s with 3.8x headroom.
 *
 * ── WHAT MOVING BACK BUYS, AND IT IS NOT ONLY LATENCY ─────────────────────────────────────────
 *   1. **THIS FILE CAN IMPORT `lib/nina/queries.ts`.** The worker could not (that module uses
 *      `server-only` and `@/` aliases), so it wrote its own SQL, and its two `nina_messages`
 *      INSERTs enumerated `(id, user_id, role, text, source, turn_id, reply_to_id)` and omitted
 *      `session_id`, which migration 0004 had made `NOT NULL`. Measured on run 33986082744: the
 *      picture was generated, paid for and stored, and the INSERT that would have made it visible
 *      threw — on the success path AND on the apology path. `insertNinaMessages` takes the session
 *      as a REQUIRED third parameter, so **a writer that has not resolved one does not compile.**
 *      That whole class of bug is gone structurally, not by vigilance.
 *   2. **There is no dispatch grace window to lose a job in.** See `claimNinaImageJob`.
 *   3. **One host, one set of column names.** The worker's `information_schema` preflight exists
 *      to catch drift between two hand-written copies; there is one copy on this path.
 *
 * ── R7: "ONCE THE BACKGROUND TASK HAS STARTED, CLOSING THE APP MUST NOT MATTER" ────────────────
 * The guarantee is `after()`'s, and this is exactly what it promises, quoted from
 * `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/after.md` (Next 16.3.1):
 *
 *   · *"`after` will run for the platform's default or configured max duration of your route. If
 *     your platform supports it, you can configure the timeout limit using the `maxDuration` route
 *     segment config."* (:50)
 *   · *"`after` will be executed even if the response didn't complete successfully. Including when
 *     an error is thrown or when `notFound` or `redirect` is called."* (:54)
 *   · *"…a primitive called `waitUntil(promise)`, which extends the lifetime of a serverless
 *     invocation until all promises passed to `waitUntil` have settled."* (:250)
 *
 * So the clock that owns this work is the SERVER INVOCATION'S, extended by `waitUntil`, bounded by
 * the invoking route segment's `maxDuration`. The browser is not in that sentence. Closing the
 * tab, losing the network, killing the app — none of them is an input to it. **That is R7, and it
 * is a platform guarantee rather than a hope.**
 *
 * **What it does NOT promise, said plainly so nobody re-promises it:** survival past
 * `maxDuration`, and survival of the instance being killed. Both leave the row `pending`/`running`
 * with the money possibly spent, and both are recovered by `reviveNinaImageJobs` below on the next
 * `/nina` render — or, failing that, by the GitHub backstop, or, failing that, by
 * `sweepStaleNinaImageJobs`' 20-minute apology. Three nets, in that order.
 *
 * ── THE BUDGET IS THE SEGMENT'S, WHICH IS WHY TWO LITERALS MOVED ──────────────────────────────
 * `after()` inherits the `maxDuration` of the route segment it was registered from. The two
 * segments that can start a generation therefore both carry 300:
 *   · `app/nina/page.tsx`         — the chat, whose Server Action runs `generate_image`/`set_avatar`
 *   · `app/api/cron/nina/route.ts` — the evening pass, whose `resolveNinaPromises` calls
 *                                   `generateNinaAvatar`
 * A third caller would need the same line. `NINA_IMAGE_RUN_BUDGET_MS` is what this file may spend
 * of it; `imagerecipe.ts`'s threshold block derives it and `tests/nina.imagerecipe.test.ts`
 * asserts the arithmetic.
 *
 * ── THE GITHUB WORKER IS NOT DELETED, AND THAT IS THE POINT ───────────────────────────────────
 * `scripts/nina-image-worker.ts` and `.github/workflows/nina-image.yml` survive as the backstop
 * and as the manual drain, repaired by phase 1. If Vercel turns out to be the wrong host after
 * all, re-pointing at them is a revert, not a rewrite.
 */

interface StoredImage {
  blobUrl: string
  pathname: string
  bytes: number
  /**
   * media-dedupe P3. sha-256 hex of the exact bytes this image holds, or null when the purpose is
   * out of dedup scope (`avatar` — `nina_avatars` carries no hash and the Media collection never
   * reads it). Computed BEFORE the put; this is the one generated path where the server holds the
   * bytes, so here the hash is a fact and not a claim.
   */
  contentHash: string | null
  /**
   * Non-null: an ORIGINAL row of this user's already stores exactly these bytes and the put was
   * SKIPPED. The row that lands below references it (F37's shape) instead of storing a second
   * object — the measured defect this plan exists for (`sbTuT8NKXL24` + `ywNnXvpnnKSi`).
   */
  duplicateOf: NinaImageDedupHit | null
  /**
   * media-dedupe follow-up (2026-09-10). The perceptual signature of these same bytes, signed
   * where the hash was — the bytes are in hand, so signing is local arithmetic, not a second GET.
   * Null for an avatar (out of dedup scope, as its hash is), for a deduped put-skip (the row will
   * be a reference, and references carry no signature), and when sharp failed (the row lands
   * unsigned; the sweep's `fill-perceptual` owns it later).
   */
  signature: NinaImageSignature | null
}

/**
 * The PNG into Blob, under `nina/<userId>/<purpose>-<id>.png`. RU-7's per-user prefix.
 *
 * ── media-dedupe P3: THE HASH HAPPENS HERE, BEFORE THE PUT ────────────────────────────────────
 * This is the one generated path where the server holds the bytes, so this is where the
 * content-hash claim stops being a claim. `contentHashOf` runs BEFORE `put`, because the only way
 * to skip the put is to already know the answer. A hit means an ORIGINAL row of this user's
 * already stores exactly these bytes — and `addRandomSuffix: true` would otherwise guarantee that
 * identical bytes land as a second object — so the put is skipped entirely and the row that
 * `finishSelfie` writes becomes a REFERENCE (the keeper's `blob_url`/`pathname` copied on, the
 * keeper's id in `source_image_id`). The row is not dropped and no bytes are stored: plan
 * invariants 2 and 4. The race window this leaves (two hosts answering "no" before either
 * inserts) is closed by the re-check in `finishSelfie`, not here — one decision,
 * `planNinaImageWrite`, serves both.
 *
 * ── WHY A LOOKUP FAULT CANNOT COST THE PHOTOGRAPH ─────────────────────────────────────────────
 * The generation has already been paid for when this runs (78 s and $0.04, measured). Dedup is an
 * optimization on top of that spend, so a dead connection at the lookup degrades to today's
 * behavior — put + original row — and never to a lost photograph. The re-check in `finishSelfie`
 * degrades the same way. What is NOT degraded is the column: `contentHash` is computed locally
 * and always travels.
 *
 * ── WHY `avatar` IS OUTSIDE THE SCOPE ─────────────────────────────────────────────────────────
 * The dedup contract is Media's: `nina_message_images` owns the column and the lookup. An avatar
 * is a `nina_avatars` row — out of this plan set's scope by its own "Out of scope" line — and
 * hashing its bytes would be work with no reader. `contentHash: null` says exactly that.
 */
async function storeNinaImage(
  userId: string,
  purpose: NinaImagePurpose,
  b64: string,
): Promise<StoredImage> {
  const bytes = Buffer.from(b64, 'base64')
  if (purpose === 'avatar') {
    const blob = await putNinaImageBlob(userId, purpose, bytes)
    return {
      ...blob,
      bytes: bytes.byteLength,
      contentHash: null,
      duplicateOf: null,
      signature: null,
    }
  }

  const contentHash = await contentHashOf(bytes)

  let duplicateOf: NinaImageDedupHit | null = null
  try {
    duplicateOf = await findNinaImageByContentHash(userId, contentHash)
  } catch (cause) {
    console.warn('[nina] dedup lookup failed; storing anyway', {
      purpose,
      hash: contentHash.slice(0, 12),
      error: String(cause),
    })
  }

  if (duplicateOf != null) {
    console.info('[nina] generated image deduped; the put is skipped', {
      purpose,
      bytes: bytes.byteLength,
      hash: contentHash.slice(0, 12),
    })
    return {
      blobUrl: duplicateOf.blobUrl,
      pathname: duplicateOf.pathname,
      bytes: bytes.byteLength,
      contentHash,
      duplicateOf,
      /* The row is a REFERENCE, and references carry no signature — the keeper's row already
       * carries (or the sweep fills) the signature of the object they both render. */
      signature: null,
    }
  }

  /*
   * media-dedupe follow-up: THE SIGNATURE HAPPENS HERE TOO, for the same reason the hash does —
   * the bytes are in hand. This is the half that keeps the collection's GENERATED photographs
   * matchable: the recurring defect is one of these downloaded, re-encoded on a phone, and
   * re-uploaded through the composer, and the write-time twin check (`lib/nina/actions.ts` STEP
   * 1b) can only answer if THIS row was signed when it was born. `null` on any sharp failure —
   * the row lands unsigned and the sweep fills it, never a lost photograph.
   */
  const signature = await signImageBytes(bytes)

  const blob = await putNinaImageBlob(userId, purpose, bytes)
  return { ...blob, bytes: bytes.byteLength, contentHash, duplicateOf: null, signature }
}

/** The put itself, exactly the pre-dedup statement — extracted so the dedup branch reads. */
async function putNinaImageBlob(
  userId: string,
  purpose: NinaImagePurpose,
  bytes: Buffer,
): Promise<{ blobUrl: string; pathname: string }> {
  const blob = await put(ninaImagePathname(userId, purpose, newId()), bytes, {
    access: 'public',
    contentType: NINA_IMAGE_CONTENT_TYPE,
    addRandomSuffix: true,
    allowOverwrite: false,
    cacheControlMaxAge: NINA_IMAGE_CACHE_MAX_AGE,
    /* Through `lib/env.ts`, never `process.env` — plan invariant 3. `lib/share/rotateBlobs.ts:64`
     * is the precedent; `scripts/` is the only place that reads the raw variable. */
    token: blobEnv().BLOB_READ_WRITE_TOKEN,
  })
  return { blobUrl: blob.url, pathname: blob.pathname }
}

/**
 * Success, for a **chat selfie**. The photograph, as an ordinary chat message.
 *
 * **Not a special kind of message** — a `nina_messages` row plus a `nina_message_images` row with
 * `kind = 'generated'`, the same pair an upload writes. That is what makes it quotable,
 * gallery-able and unread-able for free. `source = 'chat'` on purpose and NOT a sixth
 * `NinaMessageSource`: she is answering something he said in an open conversation, minutes ago.
 *
 * ── ONE READ ANSWERS BOTH QUESTIONS THE WORKER GOT WRONG ──────────────────────────────────────
 * `getNinaMessagesByIds` is owner-scoped, so the single row it returns settles:
 *   · **which session** the photograph lands in — the one he asked in, which is
 *     `resolveNinaSessionForMessage`'s policy verbatim, not a second copy of it; and
 *   · **whether the quote target still exists** — a `reply_to_id` whose target was deleted would
 *     violate the foreign key and lose the photograph, so a miss degrades to a plain message. The
 *     worker spells this as a subselect inside its INSERT; this is the same rule through the same
 *     policy module.
 * A foreign or vanished id comes back empty and falls through to `resolveNinaWriteSession`, which
 * is assumption A3 and creates a session rather than giving up (R11 lets him delete his last one).
 *
 * ── THE ORDER IS LOAD-BEARING ─────────────────────────────────────────────────────────────────
 * The message and its image row go in FIRST, then the job is marked `ok`. A crash between the two
 * leaves a `pending` job whose photo is already in the chat, which a sweep will eventually
 * apologise for — odd, survivable, self-correcting. The reverse order would mark the job done with
 * no photograph anywhere and no sweep left to notice, which is precisely the failure the user
 * reported.
 *
 * `prompt` gets the sidecar (prompt as sent, model, seed) and `description` gets the scene prose.
 * No `glm-4.6v` describe pre-pass runs over a generated image: we wrote the picture, so paying a
 * vision call to be told back our own prompt would be absurd. **The bubble's own text is written
 * from that same scene prose** by `captionNinaPhoto` — so what she says under the photograph is
 * about the photograph — and `ninaImageCaption` is now the FALLBACK for that call rather than the
 * caption itself.
 */
async function finishSelfie(
  userId: string,
  jobId: string,
  args: NinaImageJobArgs,
  image: StoredImage,
  result: { latencyMs: number; costMicroUsd: number },
): Promise<void> {
  const quoted =
    args.replyToId == null
      ? null
      : ((await getNinaMessagesByIds(userId, [args.replyToId]))[0] ?? null)

  const sessionId = quoted?.sessionId ?? (await resolveNinaWriteSession(userId))

  /*
   * ── THE CAPTION, FROM THE SCENE SHE ASKED FOR ────────────────────────────────────────────
   * `args.scene` is what the `generate_image` tool was told to draw and is about to become this
   * row's `description` a few lines below. So the picture's content is already in hand, in prose,
   * with no vision call — which is exactly why `NinaCaptionSeenKind` distinguishes `'requested'`
   * from `'described'`: the caption prompt is handed a REQUEST, not a witness's observation, and
   * it is told so.
   *
   * NO `glm-4.6v` PRE-PASS, and this is not an omission: *"we wrote the picture, so paying a
   * vision call to be told back our own prompt would be absurd"* (this function's docstring). The
   * one thing a witness could add is whether the generator obeyed the prompt, and this path has no
   * budget for a second vision call inside a segment that has already spent 78 s generating.
   *
   * ── WHY THE FALLBACK IS THE OLD EXPRESSION, UNCHANGED ────────────────────────────────────
   * `ninaImageCaption(jobId)` is still deterministic in the job id, so a row read twice says the
   * same thing — and it now draws from `NINA_IMAGE_CAPTION_POOL`, which asserts nothing about the
   * picture. That is what makes a caption failure harmless here: `null` leaves a TRUE sentence
   * rather than the wrong one. It is also, permanently, what `scripts/nina-image-worker.ts` says
   * on this same path (it has no z.ai key and `imagefail.ts` may never import anything), so the
   * two hosts still agree whenever the model call does not land.
   *
   * ── AND WHY THIS AWAIT IS ALLOWED ────────────────────────────────────────────────────────
   * `runNinaImageJob` is ALREADY inside `after()` (see `fireNinaImageGeneration`) and has already
   * spent ~78 s on the generation and a Blob write. Nobody is holding a response open: the runner
   * was told "dispatched" a minute and a half ago. A 4-8 s text call at the end of that is the
   * cheapest thing in the function, and it is sequential with the insert because the insert
   * consumes it.
   *
   * ── THE TUNING READ IS THE ONE THING WRAPPED, AND ONLY IT ────────────────────────────────
   * `readNinaTuning` is a bare `db.select()` (`queries.ts`), so a connection fault throws — and it
   * is here ONLY to dress the caption. A caption problem must never cost the photograph, so it
   * degrades to `NINA_TUNING_DEFAULTS` instead of widening this function's failure surface. The
   * three reads above it are not wrapped and must not be: if the session or the quote target
   * cannot be read, there is no correct row to write and failing IS the honest outcome.
   */
  let tuning = NINA_TUNING_DEFAULTS
  try {
    tuning = await readNinaTuning(userId)
  } catch (cause) {
    console.warn('[nina] tuning read failed; captioning as default Nina', {
      jobId,
      error: String(cause),
    })
  }
  const caption =
    (await captionNinaPhoto({ seen: args.scene, seenKind: 'requested', tuning })) ??
    ninaImageCaption(jobId)

  const [message] = await insertNinaMessages(
    userId,
    [
      {
        role: 'nina',
        /* Never empty. `nina_messages.text` is notNull and would accept `''`, but an empty bubble
         * is not a message. Either half of the expression above is a non-empty string:
         * `sanitizeNinaCaption` refuses an empty answer, and the pool line is deterministic in the
         * job id, so a row read twice says the same thing. */
        body: caption,
        source: 'chat',
        turnId: jobId,
        replyToId: quoted?.id ?? null,
        /* Same fact as the admin path's: the row is the photograph. */
        photoOnly: true,
      },
    ],
    sessionId,
  )

  /* `insertNinaMessages` returns `[]` rather than throwing when the session is not his. That
   * cannot happen here — we just resolved it from his own rows — so it is a bug, not a
   * degradation, and it must not be swallowed into a "successful" job with no bubble. */
  if (message == null) throw new Error('finishSelfie: no message row was written')

  /*
   * ── media-dedupe P3: THE RACE-CLOSE — THE QUESTION IS ASKED A SECOND TIME, AT THE INSERT ────
   * `storeNinaImage` asked "does this user already store these bytes?" before its put, but two
   * hosts can both answer no and then both put: a sweep runner and an in-platform `after()` share
   * no lock, and a seeded re-generation produces identical bytes BY DESIGN (same prompt, same
   * seed). So the question is asked again here, after the put and as close to the insert as this
   * code can stand. A hit at this door writes the row as a REFERENCE to that keeper and releases
   * the bytes we just stored — ROW FIRST, BLOB SECOND (plan invariant 3): the reference row is in
   * before `releaseBlobIfUnreferenced` asks whether anything still points at the loser. A lookup
   * fault degrades to "original", never to a lost photograph — the same rule as the pre-put
   * lookup, and the same reason.
   */
  let racedDuplicate: NinaImageDedupHit | null = null
  if (image.duplicateOf == null && image.contentHash != null) {
    try {
      racedDuplicate = await findNinaImageByContentHash(userId, image.contentHash)
    } catch (cause) {
      console.warn('[nina] dedup re-check failed; writing an original', {
        jobId,
        hash: image.contentHash.slice(0, 12),
        error: String(cause),
      })
    }
  }
  const writePlan = planNinaImageWrite({
    hit: image.duplicateOf ?? racedDuplicate,
    stored: { blobUrl: image.blobUrl, pathname: image.pathname, contentHash: image.contentHash },
  })
  if (writePlan.release != null) {
    console.info('[nina] lost a dedup race; the row will reference the keeper', {
      jobId,
      bytes: image.bytes,
      hash: image.contentHash?.slice(0, 12) ?? null,
    })
  }

  await insertNinaMessageImages(userId, [
    {
      messageId: message.id,
      kind: 'generated',
      /* The plan, not `image`: a deduped row carries the KEEPER's object and the keeper's id, so
       * `isOriginalPhoto()` hides it from the Media feed while the bubble still renders it. */
      blobUrl: writePlan.row.blobUrl,
      pathname: writePlan.row.pathname,
      width: NINA_IMAGE_WIDTH,
      height: NINA_IMAGE_HEIGHT,
      bytes: image.bytes,
      /* ── THE DESCRIPTION AND PROMPT STAY THIS GENERATION'S — DELIBERATELY ───────────────────
       * `resolveAttachment` copies the source description because that row would otherwise have
       * to PAY for vision prose it can get free. This row is the opposite case: it never pays for
       * prose at all — `args.scene` IS a truthful description of these bytes (we wrote the
       * picture from it), and the caption above is derived from it. Copying the keeper's scene
       * instead would put ANOTHER generation's prose under this bubble, and a different prompt
       * with the same seed can render identical bytes; the row must say what ITS generation was
       * told, which is what `prompt` (the sidecar) is for. */
      description: args.scene,
      prompt: args.sidecar,
      sourceImageId: writePlan.row.sourceImageId,
      contentHash: writePlan.row.contentHash,
      /*
       * media-dedupe follow-up. The signature travels only when this row OWNS its bytes — an
       * original that signed before its put and did not lose the race. A reference serves the
       * KEEPER's object, so a signature measured off the loser's bytes would be the exact lie a
       * row must never tell; hence the spread on `sourceImageId == null` rather than a plain
       * `?? null`, which would bind the loser's measurement onto a pointer.
       */
      ...(writePlan.row.sourceImageId == null && image.signature != null
        ? {
            perceptualHash: image.signature.dhashHex,
            perceptualSig: image.signature.sig16Base64,
          }
        : {}),
      sortOrder: 0,
    },
  ])

  /* Loser bytes out — only after the row that pointed at them is in, and only when the plan says
   * there ARE loser bytes: the skip path referenced the keeper without ever putting, so there is
   * nothing of ours in the store at all. */
  if (writePlan.release != null) {
    const outcome = await releaseBlobIfUnreferenced(userId, writePlan.release)
    if (outcome !== 'deleted') {
      console.warn('[nina] dedup loser kept in the store', { jobId, outcome, bytes: image.bytes })
    }
  }

  await completeNinaImageJob(userId, jobId, result)
}

/**
 * Success, for an **avatar**.
 *
 * `insertNinaAvatarAsCurrent` is `lib/nina/queries.ts`'s, and using it rather than re-implementing
 * it is the second half of what moving on-platform buys. The un-current and the insert are one
 * `db.batch`, in that order, because the partial unique index `nina_avatars_user_current_unq`
 * makes the order mandatory rather than merely tidy: inserting a second `is_current` row before
 * un-currenting the first violates the index. The worker had to hand-roll that transaction; this
 * does not.
 *
 * **`announced_at` is left NULL, and that NULL IS the `avatar_changed` proactive trigger.** It is
 * reached only on success, which is the structural half of "her announcement must not fire for a
 * photograph that does not exist". No `nina_messages` row: nobody asked in chat, and the next cron
 * tick is what makes her mention it.
 */
async function finishAvatar(
  userId: string,
  jobId: string,
  args: NinaImageJobArgs,
  image: StoredImage,
  result: { latencyMs: number; costMicroUsd: number },
): Promise<void> {
  await insertNinaAvatarAsCurrent(userId, {
    blobUrl: image.blobUrl,
    pathname: image.pathname,
    width: NINA_IMAGE_WIDTH,
    height: NINA_IMAGE_HEIGHT,
    bytes: image.bytes,
    source: args.source === 'admin' ? 'admin' : 'generated',
    description: args.scene,
  })

  await completeNinaImageJob(userId, jobId, result)
}

/**
 * Failure. **Two outcomes, and the choice is the retry budget.**
 *
 * With budget left, the row goes back to `queued` and stays `pending`, so the SAME prompt and the
 * SAME seed are tried again — by `runNinaImageJob`'s own loop if the wall clock allows, otherwise
 * by the next `/nina` render's revival, otherwise by the GitHub backstop. Nothing is said to the
 * runner.
 *
 * With the budget spent, the job is terminal and **the apology goes in with it, in the same
 * call**, because a caller that could mark a job failed without saying anything is a caller that
 * will eventually do so. `failNinaImageJob` owns that pairing, skips the message for an avatar
 * job, and writes the terminal UPDATE even if the apology INSERT fails.
 */
async function closeFailed(
  userId: string,
  jobId: string,
  args: NinaImageJobArgs,
  attempts: number,
  outcome: {
    kind: NinaImageFailure
    latencyMs: number
    costMicroUsd: number | null
    detail: string
  },
): Promise<'retry' | 'gave-up'> {
  console.warn('[nina] in-platform generation failed', {
    jobId,
    kind: outcome.kind,
    attempts,
    detail: outcome.detail,
  })

  if (attempts < NINA_IMAGE_MAX_ATTEMPTS) {
    /* The spend travels with the requeue. Invariant 9: this attempt reached the provider and was
     * billed, and the retry must not erase it. `null` adds nothing rather than guessing — see
     * `requeueNinaImageJob`. */
    await requeueNinaImageJob(userId, jobId, {
      latencyMs: outcome.latencyMs,
      costMicroUsd: outcome.costMicroUsd,
    })
    return 'retry'
  }

  await failNinaImageJob({
    userId,
    jobId,
    kind: outcome.kind,
    purpose: args.purpose,
    latencyMs: outcome.latencyMs,
    /* `null` means "we do not know, guess high" and `failNinaImageJob` substitutes the constant;
     * `0` means the request never left. Passed STRAIGHT THROUGH, not `?? undefined`: `undefined`
     * is the "caller has no opinion" case that only the give-up sweep uses, and conflating the two
     * is what would let an unknown spend be recorded as nothing. Plan invariant 9 in one argument. */
    costMicroUsd: outcome.costMicroUsd,
    replyToId: args.replyToId,
    detail: outcome.detail,
  })
  return 'gave-up'
}

/**
 * What one attempt did, and whether the job it did it to carried an anchor.
 *
 * The second field exists for `runNinaImageJob`'s deadline check and for nothing else: an anchored
 * attempt needs 235 s + 20 s of wall clock and an unanchored one needs 170 s, and the loop cannot
 * ask the claim itself — `claimNinaImageJob` is what has the args, and it is one layer down.
 * Reserving the anchored figure for every job would silently delete the unanchored retry; reserving
 * the unanchored figure for every job would start an anchored retry that gets killed at 255 s with
 * the money spent.
 */
interface AttemptResult {
  outcome: 'none' | 'ok' | 'retry' | 'gave-up'
  anchored: boolean
}

/**
 * **R2's Image-generation row, and the only place the raw provider text survives.**
 *
 * ── WHAT IT RESCUES ───────────────────────────────────────────────────────────────────────────
 * `callNinaImageModel`'s `detail` is commented *"Never rendered. Log only."* and that was literally
 * true: `closeFailed` `console.warn`s it, `failNinaImageJob` `console.warn`s it again, and neither
 * `.set({...})` has ever included it. `nina_turns.error_code` keeps only the four-value
 * classification (`timeout | policy | transport | stale`), so the day OpenRouter starts answering
 * `HTTP 429 rate limit exceeded for qwen/qwen-image-3` the database says `transport` and the
 * sentence is gone with the Vercel log. This writes it down.
 *
 * ── IT IS CALLED ON EVERY FAILED CALL, NOT EVERY FAILED JOB ───────────────────────────────────
 * The user asked to log *"setiap failure call"*. `closeFailed` below either REQUEUES (budget left —
 * the attempt is billed and invisible, since the requeue UPDATE writes only latency and cost) or
 * gives up. Both are failed calls, so the call site is ABOVE that branch, in `attemptOnce`, where
 * the choice cannot be forgotten in one of the two arms. A job that burns both attempts therefore
 * writes two rows, differing in `errorMessage`, `timeoutMs` and `created_at`.
 *
 * ── AND ONLY FOR A FAILED *MODEL CALL* ────────────────────────────────────────────────────────
 * `closeFailed` is also entered with `detail: 'store: …'` and `detail: 'finish: …'` — a Blob put or
 * a Neon insert that threw AFTER a generation we were billed for. Those are our failures, not the
 * provider's, and filing them under a tab titled "log setiap failure call to LLM" would make the
 * tab answer a different question than the one an operator is asking it. They keep their existing
 * `console.warn` and their `nina_turns.error_code = 'transport'`, and nothing else.
 *
 * ── IT CANNOT COST THE JOB ────────────────────────────────────────────────────────────────────
 * Its own `try/catch`, matching the plan's invariant and this codebase's
 * `try { await deps.store.record(...) } catch { console.warn(...) }` idiom. `logNinaError` is
 * documented as best-effort by phase 1, and this catch does not rely on that: a log table is not
 * worth one photograph, and the outer `after()` has no second net for a throw from here.
 */
async function recordImageCallFailure(input: {
  userId: string
  jobId: string
  args: NinaImageJobArgs
  /** Already normalised by `ninaImageReferenceUrl` — the ANCHOR, which is the input image. */
  referenceUrl: string | null
  /** Already normalised by `coerceNinaImageModel`; the same value the call was made with. */
  model: string
  outcome: Extract<NinaImageCallResult, { ok: false }>
}): Promise<void> {
  const { userId, jobId, args, referenceUrl, model, outcome } = input
  try {
    await logNinaError({
      userId,
      category: 'image_generation',
      /* Image generation has always been OpenRouter and this plan set adds no fallback to it —
       * see the index's Decisions. A constant, not a parameter. */
      provider: 'openrouter',
      model,
      /* `args.prompt` is the fully-assembled generation prompt, stored verbatim when the job was
       * opened — "the load-bearing choice in this whole design" (`NinaImageJobArgs`). It is
       * exactly what `buildImageRequestBody` sent. */
      fullInput: args.prompt,
      /* The classification first, then the provider's own words untouched. `nina_error_logs` has
       * no `kind` column and carries no job id to join back to `nina_turns.error_code`, so this
       * prefix is where the timeout/policy/transport distinction survives to the admin screen. */
      errorMessage: `[${outcome.kind}] ${outcome.detail}`,
      /* The budget the AbortSignal actually got, reported by the call itself. `null` only when no
       * request was sent at all. */
      timeoutMs: outcome.timeoutMs,
      /* The anchor photo — an INPUT image. A failed generation produces no output image at all
       * (`finishSelfie` never runs), which is why this is never an output URL. `null` for an
       * unanchored job, and the admin row then simply has no image affordance. */
      imageUrl: referenceUrl,
    })
  } catch (cause) {
    console.warn('[nina] image failure could not be logged', {
      jobId,
      kind: outcome.kind,
      error: String(cause),
    })
  }
}

/** One attempt: claim, call, store, finish. Returns what happened, and whether it was anchored. */
async function attemptOnce(
  userId: string,
  jobId: string,
  opts: { queuedBefore?: Date | null; runningBefore?: Date | null },
): Promise<AttemptResult> {
  const claim = await claimNinaImageJob(userId, jobId, opts)
  if (claim == null) return { outcome: 'none', anchored: false }

  const { args, attempts } = claim
  /* The ONE sanctioned read of a jsonb field that may not be there. See `ninaImageReferenceUrl`. */
  const referenceUrl = ninaImageReferenceUrl(args)
  const anchored = referenceUrl != null
  console.info('[nina] image job claimed', {
    jobId,
    purpose: args.purpose,
    attempt: attempts,
    anchored,
  })

  /* The job's own camera, normalised — an old jsonb row without the key rides the default.
   * HOISTED out of the argument list so the log row below names the camera the call was ACTUALLY
   * made with, rather than re-deriving it and risking the two drifting apart. */
  const model = coerceNinaImageModel(args.model)

  const outcome: NinaImageCallResult = await callNinaImageModel(
    args.prompt,
    args.seed,
    referenceUrl,
    model,
  )
  if (!outcome.ok) {
    /*
     * R2. ABOVE `closeFailed`, deliberately: `closeFailed` either requeues (retry budget left) or
     * gives up, and BOTH are failed calls the operator asked to see. Awaited rather than floated —
     * this runs inside `after()`, where a floating promise can be cut off — and its own try/catch
     * is inside `recordImageCallFailure`, so nothing here can change what the job does next.
     */
    await recordImageCallFailure({ userId, jobId, args, referenceUrl, model, outcome })
    return { outcome: await closeFailed(userId, jobId, args, attempts, outcome), anchored }
  }

  /* The provider reported nothing, so the measured price stands in. ONE substitution point on this
   * path — `imagecall.ts` deliberately does not do it too. */
  const costMicroUsd = outcome.costMicroUsd > 0 ? outcome.costMicroUsd : NINA_IMAGE_COST_MICRO_USD
  const result = { latencyMs: outcome.latencyMs, costMicroUsd }

  let image: StoredImage
  try {
    image = await storeNinaImage(userId, args.purpose, outcome.b64)
  } catch (cause) {
    /*
     * **A store failure is a `transport` failure and not a crash.** The picture exists and we could
     * not keep it, which from the runner's side is "the photo did not come through" — and the
     * money is already spent, which is why it is still logged and still counted against the cap.
     */
    return {
      outcome: await closeFailed(userId, jobId, args, attempts, {
        kind: 'transport',
        latencyMs: outcome.latencyMs,
        costMicroUsd,
        detail: `store: ${String(cause)}`,
      }),
      anchored,
    }
  }

  try {
    if (args.purpose === 'avatar') {
      await finishAvatar(userId, jobId, args, image, result)
    } else {
      await finishSelfie(userId, jobId, args, image, result)
    }
  } catch (cause) {
    /*
     * The bytes are stored and the row could not be written. Closing it as a failure is the honest
     * outcome — no photograph is visible, so she should say so — and the blob is left behind, which
     * the `reap-orphaned-blobs` skill exists for.
     */
    return {
      outcome: await closeFailed(userId, jobId, args, attempts, {
        kind: 'transport',
        latencyMs: outcome.latencyMs,
        costMicroUsd,
        detail: `finish: ${String(cause)}`,
      }),
      anchored,
    }
  }

  console.info('[nina] image job done', {
    jobId,
    purpose: args.purpose,
    bytes: image.bytes,
    costMicroUsd,
    latencyMs: outcome.latencyMs,
    /* Requested versus SENT. `anchored: true, sentAnchored: false` is a degraded generation, and
     * the `console.warn` explaining why is immediately above it in the log. */
    anchored,
    sentAnchored: outcome.anchored,
  })
  return { outcome: 'ok', anchored }
}

/**
 * **Claim, generate, close — and retry only while the wall clock can actually hold another one.**
 *
 * The retry loop is bounded twice, and both bounds matter:
 *   · `NINA_IMAGE_MAX_ATTEMPTS`, enforced inside `claimNinaImageJob`'s WHERE, so two runners
 *     cannot spend the same budget; and
 *   · the DEADLINE below, so a second attempt is started only when a whole call timeout plus the
 *     finish writes still fit. **A retry that would be killed halfway is worse than no retry**: it
 *     spends $0.04 and leaves a `running` row for a sweep to apologise for.
 *
 * That deadline is why a FAST failure (a 500 at five seconds) retries immediately and a SLOW one (a
 * timeout at the ceiling) does not. The slow case is left `queued` and picked up by
 * `reviveNinaImageJobs` on the next `/nina` render, which starts a fresh invocation with a fresh
 * 300 s.
 *
 * **THE DEADLINE IS SIZED BY THIS JOB'S CEILING, WHICH R10 MADE TWO.** An anchored attempt needs
 * `NINA_IMAGE_ANCHORED_CALL_TIMEOUT_MS + NINA_IMAGE_FINISH_RESERVE_MS` = 255 s, which is the whole
 * of `NINA_IMAGE_RUN_BUDGET_MS`, so **an anchored job gets exactly one attempt per invocation** and
 * its second one comes from `reviveNinaImageJobs` on a fresh clock. Two 235 s attempts do not fit
 * under a 300 s host ceiling by any arithmetic, so this is the answer and not a shortfall. An
 * unanchored attempt needs 170 s and retries after any failure inside the first 70 s.
 */
export async function runNinaImageJob(
  userId: string,
  jobId: string,
  opts: { queuedBefore?: Date | null; runningBefore?: Date | null } = {},
): Promise<'none' | 'ok' | 'retry' | 'gave-up'> {
  const deadlineAt = Date.now() + NINA_IMAGE_RUN_BUDGET_MS

  for (;;) {
    const attempt = await attemptOnce(userId, jobId, opts)
    if (attempt.outcome !== 'retry') return attempt.outcome

    const nextAttemptMs = ninaImageCallTimeoutMs(attempt.anchored) + NINA_IMAGE_FINISH_RESERVE_MS
    if (Date.now() + nextAttemptMs > deadlineAt) {
      console.warn('[nina] retry left for the next host — not enough wall clock', {
        jobId,
        anchored: attempt.anchored,
        nextAttemptMs,
        remainingMs: deadlineAt - Date.now(),
      })
      return 'retry'
    }
    /* A reclaim on the SAME invocation: the row is `queued` again and this loop owns it. The
     * cutoffs stay as the caller set them, so a revival that was allowed to steal a stale row is
     * still allowed to retry it. */
  }
}

/**
 * **The entry point every caller uses, and the reason the tab does not matter.**
 *
 * `after()` and not a bare floating promise: a floating promise in a Server Action can be cut off
 * the instant the response is flushed, whereas `after` is documented to *"run for the platform's
 * default or configured max duration of your route"* and to be *"executed even if the response
 * didn't complete successfully"*. On Vercel that is `waitUntil`, which *"extends the lifetime of a
 * serverless invocation until all promises passed to `waitUntil` have settled"*. The work is the
 * server's from the moment this returns.
 *
 * **It is registered from inside another `after()` after phase 3**, when `runNinaTurn` moves into
 * the background — the Next 16 reference sanctions that in as many words: *"`after` can be nested
 * inside other `after` calls"*. The budget does not compound; both share the segment's
 * `maxDuration`, which is what `NINA_TURN_SPENT_MS` accounts for in the threshold block.
 *
 * It returns `void` and never throws. A generation nobody is waiting for that fails to start must
 * not take a chat turn down with it: the row stays `pending`, and the revival and the give-up
 * sweep are both still ahead of it.
 */
export function fireNinaImageGeneration(input: {
  userId: string
  jobId: string
  purpose: NinaImagePurpose
  replyToId: string | null
  /** Set only by `reviveNinaImageJobs`. See `claimNinaImageJob`. */
  queuedBefore?: Date | null
  runningBefore?: Date | null
}): void {
  const { userId, jobId, purpose, queuedBefore, runningBefore } = input

  after(async () => {
    try {
      const outcome = await runNinaImageJob(userId, jobId, { queuedBefore, runningBefore })
      console.info('[nina] image run finished', { jobId, purpose, outcome })
    } catch (cause) {
      /*
       * The bookkeeping itself broke — a dead connection, a bug. The row stays `pending`; the next
       * `/nina` render revives it, and if that never happens `sweepStaleNinaImageJobs` closes it at
       * 20 minutes with her apology. This is the one path here that relies on a later mechanism
       * rather than closing the job itself, and both later mechanisms exist.
       */
      console.error('[nina] image run threw', { jobId, purpose, error: String(cause) })
    }
  })
}

/**
 * **R7's second net: arriving at `/nina` restarts what an invocation dropped.**
 *
 * `sweepStaleNinaImageJobs` already turns a 20-minute-old `pending` job into an apology. That is
 * the DEADLINE. This is the RESCUE, and it runs first: a job whose invocation was killed at
 * `maxDuration`, or whose doorbell (in the old design) never rang, is re-fired on a fresh
 * invocation with a fresh 300 s — on the server, in `after()`, so the runner may close the tab the
 * instant the page paints.
 *
 * **It is deliberately not part of the give-up sweep and not part of `listOpenNinaImageJobs`.**
 * Those are phase 4's to widen and one of them writes an apology; this one writes nothing and only
 * schedules. Keeping them separate is what lets phase 4 reshape the projection without touching
 * the recovery path.
 *
 * `NINA_IMAGE_REVIVE_BUDGET` is 1: one revival per render. A burst of six queued jobs must not
 * turn one page load into six concurrent generations sharing one function's wall clock — and the
 * next render takes the next one.
 *
 * The two cutoffs are the whole content of the question: a `queued` row younger than
 * `NINA_IMAGE_DISPATCH_GRACE_MS` may be about to be started by the invocation that opened it, and
 * a `running` row younger than `NINA_IMAGE_RECLAIM_MS` may still be generating. Reviving either
 * would bill twice for one photograph.
 */
export async function reviveNinaImageJobs(userId: string, now: Date = new Date()): Promise<number> {
  const queuedBefore = new Date(now.getTime() - NINA_IMAGE_DISPATCH_GRACE_MS)
  const runningBefore = new Date(now.getTime() - NINA_IMAGE_RECLAIM_MS)

  let candidates: Awaited<ReturnType<typeof listRevivableNinaImageJobs>>
  try {
    candidates = await listRevivableNinaImageJobs(userId, { queuedBefore, runningBefore })
  } catch (cause) {
    /* A render must not fail over a recovery read. The give-up sweep is still ahead of the job. */
    console.warn('[nina] could not look for revivable image jobs', { error: String(cause) })
    return 0
  }

  let revived = 0
  for (const candidate of candidates.slice(0, NINA_IMAGE_REVIVE_BUDGET)) {
    fireNinaImageGeneration({
      userId,
      jobId: candidate.id,
      purpose: candidate.purpose,
      replyToId: candidate.replyToId,
      queuedBefore,
      runningBefore,
    })
    revived += 1
  }

  if (revived > 0) console.warn('[nina] revived image jobs in-platform', { userId, revived })
  return revived
}
