'use server'

import { requireUserId } from '@/lib/auth/requireUserId'
import { listRunAttachments } from '@/lib/db/queries'
import { authEnv } from '@/lib/env'
import { isValidId } from '@/lib/id'
import { after } from 'next/server'

import { titleNinaSessionIfNeeded } from './autotitle'
import type { NinaContext } from './context'
import { runTurnDistillation } from './distill'
import { dbNinaSourceGateway, dbNinaToolGateway } from './gateway'
import { NINA_MAX_CHAT_IMAGES, isNinaChatRequestPathname } from './images'
import { NINA_FULL_TOOL_SET } from './avatartools'
import { signNinaImageTicket, verifyNinaImageTicket, type NinaImageClaims } from './imageTicket'
import { loadNinaContext } from './load'
import { NINA_DESCRIPTION_UNAVAILABLE } from './prompts/describe'
import {
  getNinaAvatar,
  getNinaMessageImage,
  getNinaMessagesByIds,
  getNinaSession,
  insertNinaMessageImages,
  insertNinaMessages,
} from './queries'
import type { NinaMessageRow } from './queries'
import { resolveNinaWriteSession } from './sessionResolve'
import type { NinaImageKind } from '@/lib/db/schema'
import type { QuotedMessageInput } from './reply'
import { MAX_RUNNER_MESSAGE_CHARS, type NinaMemoryWrite } from './schema'
import { productionDeps, runNinaTurn } from './turn'
import { NinaVisionTokenFloorError, describeNinaImages } from './vision'

/**
 * **The one entry point phase 4 calls, from exactly one place: `ChatScreen.handleSend`.**
 *
 * ── WHY AN ACTION AND NOT A ROUTE HANDLER ─────────────────────────────────────────────────────
 * D7 fixes the route-handler list at `/api/extract`, `/api/upload`, `/api/auth/[...nextauth]` and
 * `/api/cron/*`, and says Server Actions carry every other mutation. A chat turn writes up to
 * five rows, so it is a mutation, so it is an action — the identical reasoning
 * `lib/insights/actions.ts` states in its own header.
 *
 * ── THREE THINGS FROM NEXT 16.3.1's OWN GUIDES, EACH SHAPING THE CODE BELOW ───────────────────
 * (`node_modules/next/dist/docs/01-app/02-guides/server-actions.md`.)
 *
 *  1. **Actions dispatch sequentially per client.** Next runs one at a time; a second `handleSend`
 *     waits for the first. That is exactly the ordering a conversation needs — and it means this
 *     action must never be the thing a client-side `Promise.all` tries to parallelise.
 *  2. **This action deliberately calls NO revalidation.** The guide: *"An action that does none of
 *     the above carries only its return value, and the current route is not re-rendered."* That is
 *     what we want. Phase 4 renders the returned bubbles into client state behind its staggered
 *     reveal (RU-5); a `revalidatePath('/nina')` would re-render the server component in the same
 *     response and race the reveal with a full list that already contains the un-revealed bubbles.
 *  3. **Every action is an untrusted POST endpoint.** `requireUserId()` first, input validated,
 *     return value shaped to what the UI renders. The `replyToMessageId` the *model* produced is
 *     re-checked against rows this user owns before it becomes a foreign key — a well-formed id is
 *     not proof of ownership.
 *
 * ── THE WRITE ORDER IS PART OF THE CONTRACT ───────────────────────────────────────────────────
 * The runner's message is persisted BEFORE the model is called, and there are two reasons, not
 * one. The obvious one is that a 45 s turn that fails must not lose what he typed — phase 4's
 * "your message is saved" copy is a claim about this ordering. The second is subtler and would
 * bite silently: `loadNinaContext` reads the conversation window out of `nina_messages`, so a
 * message not yet written is a message SHE CANNOT SEE. Insert first, then build the context, and
 * the turn she answers includes the thing she is answering.
 *
 * ── NOTHING HERE THROWS FOR A MODEL PROBLEM ───────────────────────────────────────────────────
 * `runNinaTurn`'s contract. `unavailable: true` with an empty `bubbles` array is the honest
 * answer, and phase 4's screen says she is not replying right now. `ok` is about THE REQUEST —
 * false means it could not be carried out at all (empty input, oversized input, a failed write) —
 * and `unavailable` is about HER. `ok: true, unavailable: true` is the normal degraded turn: his
 * message is safely stored and she did not answer.
 */
export interface SentBubble {
  /** The `nina_messages` row id. Phase 7 quotes it; phase 4 keys its list on it. */
  id: string
  /**
   * The bubble text. Named `body` because this return type is a **DTO**, and `body` is the DTO
   * spelling all the way down: phase 1's `NinaMessageRow.body`, phase 4's destructure, phase 6's
   * `row.body`. The *column* is `text` and phase 2's prompt-layer `MessageInput` is `text` too;
   * `lib/nina/gateway.ts` is the one place those meet (RULING A1). Nobody "fixes" either side to
   * match the other.
   */
  body: string
  /**
   * Phase 7 (R12). The `nina_messages.id` THIS bubble answers, or null.
   *
   * The one place this return type widened rather than an input, and RULING B1 put it in phase 7
   * because that phase already edits this file. Without it, Nina's own quote would render only on
   * the next server render of `/nina` and not on the optimistic reveal — R12's UI lagging the
   * database by a page load, for two lines. Non-null on the FIRST bubble only, because a
   * four-bubble reply is one answer to one message (see STEP 5).
   */
  replyToId: string | null
}

export interface SendNinaMessageResult {
  ok: boolean
  userMessageId: string | null
  /**
   * **At most four, guaranteed by `NinaSendPayloadSchema`'s `.max(MAX_BUBBLES)` rather than by a
   * slice here** — so phase 4's `REVEAL_MAX_BUBBLES` assumption is a property of the type, not of
   * a call this function promises to remember to make. Empty iff `unavailable`.
   */
  bubbles: SentBubble[]
  unavailable: boolean
}

const REFUSED: SendNinaMessageResult = {
  ok: false,
  userMessageId: null,
  bubbles: [],
  unavailable: false,
}

/**
 * A blob **the server already owns**, attached to a new message — F33 R26.
 *
 * Deliberately an id and a kind rather than a URL: a URL from a client is a claim, and an id
 * resolved against `user_id` is a fact. `'avatar'` reads `nina_avatars`, `'image'` reads
 * `nina_message_images`, and either miss is a refusal rather than a silently text-only send.
 *
 * ── WHY THERE IS NO TICKET HERE, AND THAT IS NOT A GAP ────────────────────────────────────────
 * Phase 6's signed ticket exists so the CLIENT cannot claim a blob it did not upload. These two
 * reads are owner-scoped, so they prove strictly more than a ticket can — and an album photo's
 * pathname (`nina/<userId>/avatar-<id>.jpg`) would fail `isNinaChatRequestPathname` anyway, which
 * is correct: it is not a chat upload.
 */
export interface NinaAttachExisting {
  kind: 'avatar' | 'image'
  id: string
}

/**
 * Resolved once, BEFORE the runner's row is written, so a bad id costs nothing.
 *
 * ── WHY NO VISION CALL ────────────────────────────────────────────────────────────────────────
 * We already know what is in the picture. `nina_avatars.description` and
 * `nina_message_images.description` are exactly what phase 6's `glm-4.6v` pass would have
 * produced, and already paid for — so the description is copied onto the new row and reaches her
 * through `imageDescriptions`, as text (invariant 5).
 */
async function resolveAttachment(
  userId: string,
  attach: NinaAttachExisting,
): Promise<{
  blobUrl: string
  pathname: string
  kind: NinaImageKind
  description: string | null
} | null> {
  if (attach.kind === 'avatar') {
    /*
     * ONE ROW, BY PRIMARY KEY, SCOPED TO `user_id` (F34). This was
     * `listNinaAvatars(userId).find((candidate) => candidate.id === attach.id)`, which was correct
     * and was cheap when the album held the handful of faces F33 R23 described. F34 R1's stated
     * requirement is *"i will put hundreds of profile pics in there"*, and this runs on every send
     * that carries a shared photo — so it read the whole album, every column and every
     * `description`, to answer a question about one id.
     *
     * `getNinaAvatar` proves strictly the same thing: `user_id` is in its WHERE, so "not his" and
     * "does not exist" come back as the same `null`, which is what the refusal below needs. The
     * ownership property is not being relaxed; the read is.
     */
    const row = await getNinaAvatar(userId, attach.id)
    if (row == null) return null
    /* Her own photograph, so `kind: 'generated'` — the gallery's his/hers discriminator has to
     * keep telling the truth about a photo that has now appeared twice. */
    return {
      blobUrl: row.blobUrl,
      pathname: row.pathname,
      kind: 'generated',
      description: row.description,
    }
  }

  /*
   * The same substitution on the conversation-photo branch. `listNinaMessageImages(userId, {
   * limit: NINA_GALLERY_LIMIT }).find(...)` read up to 200 rows to answer one id;
   * `getNinaMessageImage` is phase 3's mirror of `getNinaAvatar` and is why this phase depends on
   * phase 3. Bounded before, so this is a smaller win than the avatar branch — done in the same
   * commit because leaving one of two identical mistakes in place is how it grows back.
   */
  const row = await getNinaMessageImage(userId, attach.id)
  if (row == null) return null
  /* A re-attached chat photo keeps whoever's it was. */
  return {
    blobUrl: row.blobUrl,
    pathname: row.pathname,
    kind: row.kind,
    description: row.description,
  }
}

/**
 * ── THE ARGUMENT OBJECT IS THE SHAPE FOUR LATER PHASES CONVERGE ON ────────────────────────────
 * One object, agreed up front, each later phase adding exactly one optional field in its own
 * commit — phases 6 (`imageTickets`), 7 (`replyToMessageId`), 8 (`runId`) and 13
 * (`attachExisting`). Both 7 and 8 asked for this in their own plans, and the alternative is four
 * rewrites of this head, which is four merge conflicts and four chances to drop a field.
 *
 * The final signature and the final refusal rule (RULING B1):
 *
 *     sendNinaMessage(input: {
 *       body: string
 *       imageTickets?: readonly string[]                            // phase 6
 *       replyToMessageId?: string | null                            // phase 7
 *       runId?: string | null                                       // phase 8
 *       attachExisting?: { kind: 'avatar' | 'image'; id: string } | null   // phase 13
 *     })
 *
 *     const hasAttachment =
 *       (input.imageTickets?.length ?? 0) > 0 ||   // phase 6
 *       input.runId != null ||                      // phase 8
 *       input.attachExisting != null                // phase 13
 *     if (input.body.trim() === '' && !hasAttachment) return refuse('empty')
 *
 * **At THIS phase's landing `body`, `imageTickets`, `replyToMessageId` and `runId` exist**, so that
 * is what this signature carries and the rule carries the `imageTickets` and `runId` disjuncts.
 * `attachExisting` arrives with phase 13. Phase 7's field takes no clause: answering a message is
 * not a substitute for saying something.
 */
export async function sendNinaMessage(input: {
  body: string
  /** Phase 6. Signed by `describeNinaImage`; at most `NINA_MAX_CHAT_IMAGES` of them. */
  imageTickets?: readonly string[]
  /**
   * Phase 7 (R12). The `nina_messages.id` he swiped, from `ChatScreen`. **Untrusted**: this is a
   * POST endpoint like any other action, so the id is checked against rows THIS user owns before
   * it becomes a foreign key — the same rule STEP 4 applies to the id the model produces, by the
   * same reasoning the Server Actions guide gives.
   *
   * It adds NO clause to the refusal rule above. Replying to something without typing anything and
   * without attaching anything is a gesture, not a send, and the refusal it earns is the plain
   * empty-body one.
   */
  replyToMessageId?: string | null
  /**
   * Phase 8 (R13). The run `/r/[id]`'s icon attached to this message, or null/absent. It is
   * written to `nina_messages.run_id` and it is what makes an EMPTY `body` a legitimate send:
   * "user can ask something, or not include any text at all, then nina will respond accordingly."
   *
   * **This is the ONE field this phase adds** (RULING B1), and the ONE clause it adds to the
   * refusal rule below.
   */
  runId?: string | null
  /**
   * Phase 13 (R26). A blob the server already owns, attached to a new message — the album's
   * "Kirim ke chat". **This is the ONE field this phase adds**, and the LAST clause RULING B1's
   * refusal rule gains: the rule is now complete and nobody rewrites it again.
   *
   * Shape-checked only here; ownership is `resolveAttachment`'s, below, and it is a refusal rather
   * than a degradation — an id that is not his means the whole send was about a photo he cannot
   * see, so there is no honest message left to write.
   */
  attachExisting?: NinaAttachExisting | null
  /**
   * **F35 phase 3 (R2). Which conversation this message joins.**
   *
   * A REQUIRED field of a NULLABLE type, which is the whole design in one line. Required, because
   * `nina_messages.session_id` is `NOT NULL` and there are exactly three writers of that table:
   * making every caller decide is how `tsc` proves none of them was missed. Nullable, because "he
   * has no sessions at all" is a real state a client can legitimately be in — reachable by a runner
   * who has never messaged, and by R11's runner who just removed his last session — and in that
   * state the screen has no id to send. A render must not write, so the page cannot create one for
   * him; this action can, and does.
   *
   *   a well-formed id he owns      -> the message lands there
   *   a forged, foreign or deleted id -> REFUSED (see below)
   *   null                          -> `resolveNinaWriteSession`: his most recent session, created
   *                                    if he has none
   *
   * **The miss is a refusal, not a degradation, and it is the `resolveAttachment` split.**
   * `app/nina/page.tsx` degrades a bad `?s=` silently to his newest chat, because *"a bad LINK is
   * something anyone can type"*. Here the id is about to become a `NOT NULL` foreign key on a
   * persisted row: an unowned id would fail the INSERT and lose the sentence he typed, and writing
   * his message into a conversation he did not name would be worse than refusing. Same reasoning,
   * opposite answer, one layer apart — exactly as the header describes for `?photo=`.
   */
  sessionId: string | null
}): Promise<SendNinaMessageResult> {
  const userId = await requireUserId()

  const text = typeof input?.body === 'string' ? input.body.trim() : ''
  const tickets = Array.isArray(input?.imageTickets) ? input.imageTickets : []
  /* Shape only. `resolveAttachment` proves ownership, and it runs before the runner's row. */
  const attach =
    input?.attachExisting != null &&
    (input.attachExisting.kind === 'avatar' || input.attachExisting.kind === 'image') &&
    isValidId(input.attachExisting.id)
      ? { kind: input.attachExisting.kind, id: input.attachExisting.id }
      : null
  /* Shape only, here. Ownership and existence are STEP 0c's, below, and they have to be: the
   * column is a foreign key. */
  const requestedRunId =
    typeof input?.runId === 'string' && isValidId(input.runId) ? input.runId : null

  /*
   * ── R10: AN IMAGE ALONE IS A VALID SEND ─────────────────────────────────────────────────────
   * This was `text.length === 0` and is now the conjunction. A photo with no caption is the most
   * natural message in this whole feature — he finishes a run, takes one selfie, sends it. The
   * oversized-paste refusal is unchanged, and a ticket count over the cap is refused rather than
   * truncated: a client sending five is a client with a bug, not a runner with five photos.
   *
   * Refusals stay silent by design. An empty send is a stray Enter key and an oversized one is a
   * paste of a whole article — neither is worth a persisted row or a 45 s model call. The
   * framework's own 1 MB action-body cap sits behind this as the backstop.
   *
   * ── R13: A RUN ALONE IS A VALID SEND ────────────────────────────────────────────────────────
   * **An empty body with a run attached is NOT empty.** Handing her a run without a question is a
   * message, and R13 says so in as many words; the client's Send button is enabled on exactly this
   * condition, so the server must agree or that button is a lie.
   *
   * RULING B1's rule is MONOTONE and `runId != null` is its third clause. Phase 13 adds one more
   * disjunct (`attachExisting != null`) in its own commit; nobody rewrites this condition, they
   * extend it. The final form is printed above.
   */
  if (text.length === 0 && tickets.length === 0 && requestedRunId === null && attach === null) {
    return REFUSED
  }
  if (text.length > MAX_RUNNER_MESSAGE_CHARS) return REFUSED
  if (tickets.length > NINA_MAX_CHAT_IMAGES) return REFUSED

  /*
   * STEP 0 — verify the tickets BEFORE writing anything. A forged or expired ticket is dropped,
   * not fatal: the message he typed is still worth sending. Deduplicated by pathname, because two
   * identical tickets would otherwise insert the same photo twice into one bubble.
   */
  const secret = authEnv().AUTH_SECRET
  const seen = new Set<string>()
  const images: NinaImageClaims[] = []
  for (const ticket of tickets) {
    const verdict = verifyNinaImageTicket(ticket, { userId }, secret)
    if (!verdict.ok) {
      console.warn('[nina] refused an image ticket', { reason: verdict.reason })
      continue
    }
    if (seen.has(verdict.claims.pathname)) continue
    seen.add(verdict.claims.pathname)
    images.push(verdict.claims)
  }
  /* Every ticket was forged or stale AND he typed nothing AND no run is pinned: there is no
   * message here at all. */
  if (text.length === 0 && images.length === 0 && requestedRunId === null && attach === null) {
    return REFUSED
  }

  /*
   * STEP 1 — his message, first. See the header.
   *
   * `insertNinaMessages` is a BATCH and takes no `seq`: `nina_messages.seq` is a `bigserial`
   * assigned by Postgres (phase 1's D-2), which makes it a total order over the whole conversation
   * rather than a within-turn index this file would have to maintain. The DTO field is **`body`**,
   * not `text` — that is `queries.ts`'s spelling for every message-writing and message-reading
   * function it has, because they all go through one shared `messageColumns` projection.
   *
   * `body` may legitimately be the empty string from this phase on: an image-only message has no
   * words, the column is NOT NULL, so `''` is the honest value and phase 4's bubble renders just
   * the photo.
   */
  /*
   * STEP 0b — the reply target (R12). One scoped query, and it answers both questions at once:
   * whether the id is real and his, and what the quoted message actually SAYS. The second half is
   * the point — the context window is 40 messages, so a reply to something older is an id with no
   * text behind it in the context JSON, and the model would be told a reply exists while being
   * unable to read it.
   *
   * A malformed, foreign or vanished id degrades to "no reply" and the message still sends. There
   * is nothing to explain to the runner: the quote he tapped is gone, and losing his sentence over
   * it would be the worse outcome by a wide margin.
   */
  const requestedReplyId =
    typeof input?.replyToMessageId === 'string' && input.replyToMessageId.trim().length > 0
      ? input.replyToMessageId.trim()
      : null

  let quotedRow: NinaMessageRow | null = null
  if (requestedReplyId !== null) {
    try {
      const found = await getNinaMessagesByIds(userId, [requestedReplyId])
      quotedRow = found[0] ?? null
    } catch (cause) {
      console.warn('[nina] could not resolve the reply target', { error: String(cause) })
    }
  }

  /*
   * STEP 0c — the attached run (R13). **`nina_messages.run_id` IS A FOREIGN KEY** (phase 1:
   * `references(() => runs.id, { onDelete: 'set null' })`), which is what makes this read
   * mandatory rather than an optimisation. An id that is not a run of this user's would not
   * degrade quietly into the column — it would fail the INSERT, and the `catch` below would answer
   * `REFUSED` and lose the sentence he typed. This is an untrusted POST endpoint like any other
   * action, so the id gets the same treatment `replyToMessageId` gets one block up, for the same
   * reason and by the same shape.
   *
   * `listRunAttachments` is the phase's own query, owner-scoped and indexed, so a foreign or
   * vanished id simply comes back empty and the message sends without a card. It is NOT filtered
   * on `reviewed_at` here: `/r/[id]`'s icon and `/nina`'s pending resolution already refuse a draft
   * on the way in, and a run reviewed AFTER it was attached is one she can see by the time she is
   * asked about it. The facts half is `runNinaTurn`'s, resolved against the history it has already
   * loaded — no second query and no second facts path.
   */
  let runId: string | null = null
  if (requestedRunId !== null) {
    try {
      const found = await listRunAttachments(userId, [requestedRunId])
      runId = found[0]?.id ?? null
    } catch (cause) {
      console.warn('[nina] could not resolve the attached run', { error: String(cause) })
    }
  }
  /*
   * STEP 0d — the attached blob (R26). Resolved BEFORE the runner's row is written, so an id that
   * is not his costs one indexed read and nothing else.
   *
   * A miss REFUSES rather than degrading to a text-only send, which is the opposite of how the
   * ticket path and the run path handle a miss — and deliberately. There, the attachment was extra
   * and his sentence is still worth sending. Here he tapped "Kirim ke chat" on a specific
   * photograph: sending his question with the photo silently dropped would have her answering
   * about a picture that is not in the conversation.
   */
  const attached = attach === null ? null : await resolveAttachment(userId, attach)
  if (attach !== null && attached === null) return REFUSED

  /* The run was the whole message and it is not his: there is nothing here to send. Same shape as
   * the forged-ticket check above, and the same reason. */
  if (text.length === 0 && images.length === 0 && runId === null && attached === null) {
    return REFUSED
  }

  /*
   * STEP 0e — THE SESSION (F35 R2). Resolved AFTER every refusal above and BEFORE the runner's row,
   * and both halves of that sentence are load-bearing.
   *
   * After the refusals, because the `null` branch may CREATE a session and a stray Enter key must
   * not leave an empty conversation behind. Before the row, because `nina_messages.session_id` is a
   * `NOT NULL` foreign key — the same reason STEP 0c reads the run and STEP 0d reads the blob
   * rather than letting the INSERT discover the problem.
   *
   * `getNinaSession` is owner-scoped, so "not his" and "does not exist" come back as the same
   * `null`, which is what the refusal needs and is `queries.ts`'s standing rule.
   */
  let sessionId: string
  if (input?.sessionId == null) {
    /* He has no sessions — a runner who has never messaged, or R11's runner who removed his last
     * one. Same policy the cron uses (assumption A3), so the message lands somewhere findable and
     * the two paths cannot disagree about where. */
    try {
      sessionId = await resolveNinaWriteSession(userId)
    } catch (cause) {
      console.warn('[nina] could not resolve a session for the send', { error: String(cause) })
      return REFUSED
    }
  } else {
    const requestedSessionId = isValidId(input.sessionId) ? input.sessionId : null
    const owned =
      requestedSessionId === null ? null : await getNinaSession(userId, requestedSessionId)
    if (owned === null) return REFUSED
    sessionId = owned.id
  }

  let runnerMessageId: string
  try {
    const [row] = await insertNinaMessages(
      userId,
      [{ role: 'runner', body: text, replyToId: quotedRow?.id ?? null, runId }],
      sessionId,
    )
    if (row == null) throw new Error('insertNinaMessages returned no row')
    runnerMessageId = row.id
  } catch (cause) {
    console.warn('[nina] could not persist the runner message', { error: String(cause) })
    return REFUSED
  }

  /*
   * STEP 1b — the image rows, BEFORE the context load, and the ordering is deliberate twice over.
   * First: a turn that fails must not leave a message row whose photo was never recorded, which
   * would render as an empty bubble forever. Second, and the same reason his message is inserted
   * before the context is loaded: `loadNinaContext` reads the conversation window out of
   * `nina_messages` + `nina_message_images`, so a description not yet written is a description
   * she cannot see — on this turn or on any later one that scrolls back to it.
   *
   * A failure here is warned and swallowed. The message and the reply are worth more than the
   * gallery row, and `imageDescriptions` below is built from the verified claims rather than from
   * the INSERT's return value, so the turn is unaffected either way.
   */
  if (images.length > 0) {
    try {
      await insertNinaMessageImages(
        userId,
        images.map((image, index) => ({
          messageId: runnerMessageId,
          kind: 'upload' as const,
          blobUrl: image.blobUrl,
          pathname: image.pathname,
          width: image.width || null,
          height: image.height || null,
          bytes: image.bytes || null,
          description: image.description,
          sortOrder: index,
        })),
      )
    } catch (cause) {
      console.warn('[nina] could not persist chat images', { error: String(cause) })
    }
  }

  /*
   * R26's row. Same table, same shape, same reasons as the block above — it is an ordinary chat
   * photo that happens to point at a blob we already had, which is the whole design: no new
   * attachment kind, no new renderer, no second send path.
   *
   * `sortOrder: images.length` puts it after anything he picked in the same message. Today the
   * album sends exactly one photo and no tickets, so that is 0; spelling it as the count rather
   * than as 0 keeps the two blocks composable if a later card ever lets him do both.
   */
  if (attached !== null) {
    try {
      await insertNinaMessageImages(userId, [
        {
          messageId: runnerMessageId,
          kind: attached.kind,
          blobUrl: attached.blobUrl,
          pathname: attached.pathname,
          description: attached.description,
          sortOrder: images.length,
        },
      ])
    } catch (cause) {
      console.warn('[nina] could not persist the attached photo', { error: String(cause) })
    }
  }

  /*
   * STEP 2 — the two reads, concurrently. `loadNinaContext` reads the recent-20 window and
   * `loadRunHistory` reads the whole reviewed history; both are one `db.batch` over the same
   * bounded table, and running them together makes the duplication cost one round trip of wall
   * clock instead of two. `getReviewedRunsWithChildren` therefore runs twice per turn, which is
   * ACCEPTED at this size: ~200 rows a year, one user. The clean fix is one optional parameter on
   * `loadNinaContext` — phase 2's file — and it should move together with `lib/insights/load.ts`
   * and `recomputeRecords`, in one card, because all three re-read the same history and all three
   * stop being fine at the same moment.
   */
  const [context, history] = await Promise.all([
    /* The session is the second argument now (F35 phase 3). She reads the window of THIS
     * conversation and the memory ledger of the whole relationship — assumptions A1 and A2, in one
     * call. */
    loadNinaContext(userId, sessionId, dbNinaSourceGateway),
    dbNinaToolGateway.loadRunHistory(userId),
  ])

  /* STEP 3 — the turn. 13–45 s. Never throws for a model problem.
   *
   * INVARIANT 5 IS ENFORCED BY THIS ARGUMENT AND NOWHERE ELSE. `imageDescriptions` is TEXT.
   * There is no code path in this file that puts an image part into `runNinaTurn`, and there must
   * never be one: `glm-5.3` answers 200 and silently drops an image block, so sending one is not
   * an error, it is a lie.
   *
   * `runnerText: null` for an image-only message, so `userTurnText` omits the "HE JUST SAID"
   * block entirely rather than emitting an empty one.
   */
  /*
   * `sentAtLabel` comes from the context window when the quoted message is in it, and is null when
   * it is not. That is invariant 3 rather than laziness: `'Tue 2 Sep 07:14'` is spelled by phase
   * 2's `conversationFacts`, and formatting a second one here would make this the app's second
   * authority on how an instant is written. A quote with no timestamp reads fine —
   * `quoteContextBlock` simply omits the clause.
   */
  const target = quotedRow
  const quoted: QuotedMessageInput | null =
    target === null
      ? null
      : {
          id: target.id,
          mine: target.role === 'runner',
          text: target.body,
          sentAtLabel:
            context.conversation.window.find((turn) => turn.id === target.id)?.sentAtLabel ?? null,
        }

  /*
   * `toolSet` is overridden here, and this line is the ONLY integration point for every tool phases
   * 12 and 13 add. Phase 3 built `extendToolSet` so that adding `generate_image` needed no edit to
   * `tools.ts` or `turn.ts`; `NINA_CHAT_TOOL_SET` was that composition, and `NINA_FULL_TOOL_SET`
   * (phase 13) is `NINA_CHAT_TOOL_SET` plus `set_avatar` — layered, so this line moved one word and
   * neither `imagetools.ts` nor `tools.ts` was touched. Two independent overrides here would
   * silently drop one of the two tools, which is exactly what the layering prevents.
   *
   * `productionDeps()` is spread rather than re-spelled so client, model, gateway and store stay
   * defined in exactly one place — the reason RULING C6 had phase 3 export it at creation.
   */
  const result = await runNinaTurn(
    {
      userId,
      context,
      history,
      sourceMessageId: runnerMessageId,
      runnerText: text.length > 0 ? text : null,
      /* R26's description rides the same array, which is why the attach path needs no vision call
       * and no second prompt slot: `glm-4.6v` already described this blob once, for whoever put it
       * in the conversation first. Still TEXT, so invariant 5 is untouched. */
      imageDescriptions: [
        ...images.map((image) => image.description ?? NINA_DESCRIPTION_UNAVAILABLE),
        ...(attached === null ? [] : [attached.description ?? NINA_DESCRIPTION_UNAVAILABLE]),
      ],
      quoted,
      /*
       * The facts half of R13. `turn.ts` resolves this id against the history it has ALREADY loaded
       * and calls `buildNinaRunFact` — the same function `lookup_runs` calls, with the same
       * arguments. There is no second facts path and no extra query; an id that is not in the
       * reviewed history resolves to nothing and the turn proceeds without it (invariant 2, D16).
       */
      attachedRunId: runId,
    },
    { ...productionDeps(), toolSet: NINA_FULL_TOOL_SET },
  )

  if (result.payload == null) {
    /*
     * She could not answer, but HE still spoke, and R4 is "every single thing". His message is
     * persisted with an id, so distilling it is both possible and the honest reading of the
     * requirement — a turn where she failed is not a turn where he said nothing.
     */
    scheduleDistillation({
      userId,
      runnerText: text,
      sourceMessageId: runnerMessageId,
      ninaBubbles: [],
      memoryWrites: [],
      context,
    })
    return { ok: true, userMessageId: runnerMessageId, bubbles: [], unavailable: true }
  }

  /*
   * STEP 4 — `replyToMessageId`, re-checked against rows this user owns. The model produced this
   * id, and a well-formed id is not proof of ownership (the Server Actions guide's own warning).
   * The context window she was given is the authoritative list of what she could legitimately be
   * answering, so it is also the cheapest check — no extra query. Phase 7 owns the quote UI; this
   * is only the column being populated honestly from day one.
   */
  const ownedIds = new Set(context.conversation.window.map((turn) => turn.id))
  const replyToId =
    result.payload.replyToMessageId != null && ownedIds.has(result.payload.replyToMessageId)
      ? result.payload.replyToMessageId
      : null

  /*
   * STEP 5 — one row per bubble (RU-5), in ONE multi-row `INSERT`.
   *
   * ── WHY THIS IS A BATCH AND WHY THAT MAKES THE ORDER A DATABASE FACT ─────────────────────────
   * This file's draft wrote four sequential single inserts carrying `seq: 0..n-1`, and reasoned
   * about the ordering of concurrent writes. None of that is needed and none of it is allowed:
   * `seq` is a `bigserial` and Postgres assigns it, so nothing here supplies one. **Emission order
   * comes free**, because Postgres evaluates `nextval` once per row in `VALUES` order — the first
   * bubble gets the lower `seq`, always, and `insertNinaMessages` returns the rows in that same
   * order with their ids and `seq` already on them. So phase 4's reveal keys on an array order the
   * database itself produced, not on a convention this loop remembered to honour.
   *
   * It is also one round trip instead of four, and — the part that actually matters — it is
   * **atomic**: the half-written four-bubble reply the `catch` below exists for can no longer
   * happen from a partial insert. It can still happen from a failed statement, which is why the
   * `catch` stays.
   *
   * `replyToId` goes on the FIRST bubble only. A four-bubble reply is one answer to one message,
   * and quoting the same message four times would render four identical quote headers.
   */
  const bubbles: SentBubble[] = []
  try {
    const rows = await insertNinaMessages(
      userId,
      result.payload.bubbles.map((body, index) => ({
        role: 'nina' as const,
        body,
        replyToId: index === 0 ? replyToId : null,
      })),
      /* The same session his message went into. She is answering in the conversation she was asked
       * in; there is no case in which a reply belongs anywhere else. One session for the whole
       * batch, which is why it is a parameter and not a field. */
      sessionId,
    )
    for (const row of rows) bubbles.push({ id: row.id, body: row.body, replyToId: row.replyToId })
  } catch (cause) {
    console.warn('[nina] could not persist her reply', { error: String(cause) })
    /* His message IS stored; the batch either landed whole or not at all. `ok: false` tells phase
     * 4 to reload the conversation from the server rather than trust this return value — cheaper
     * than reasoning about which of the two states it is in. */
    return { ok: false, userMessageId: runnerMessageId, bubbles: [], unavailable: false }
  }

  /*
   * STEP 6 — the distillation (phase 5, R4). `after()` and not `await`: the turn already cost
   * 13-45 s and this is another 10-20 s model call, so awaiting it would leave him watching an
   * idle screen after the bubbles have landed. `after` runs for the route's max duration and runs
   * even when the response is already out.
   *
   * `after()` throws E468 outside a request scope, which is exactly why the CALL is here in the
   * `'use server'` module and `runTurnDistillation` itself never calls it — the same lesson phase
   * 10 learned when it moved its hook out of `lib/review/commit.ts`.
   *
   * Phase 3's own `send.memoryWrites` are no longer applied here: they are an input to the one
   * plan the distillation builds, so there is one interpretation, one plan and one apply.
   * `runTurnDistillation` never throws, so there is no `try` around this and nothing to swallow.
   */
  scheduleDistillation({
    userId,
    runnerText: text,
    sourceMessageId: runnerMessageId,
    ninaBubbles: bubbles.map((bubble) => bubble.body),
    memoryWrites: result.payload.memoryWrites ?? [],
    context,
  })

  /*
   * STEP 7 — the session's name (R3). `after()` and not `await`, for the same two reasons STEP 6
   * gives: this is another model call on top of a turn that already cost 13-45 s, and invariant 2
   * is enforced by `scripts/check-llm-payload-boundary.mjs` either way. `after()` throws E468
   * outside a request scope, which is why the CALL is here and `titleNinaSessionIfNeeded` never
   * calls it itself.
   *
   * **This exit and no other.** R3's trigger is "the first interaction (user then nina)", and this
   * is the only path on which both rows exist — the `result.payload == null` return above it is a
   * turn where she said nothing, so there is no exchange to name yet.
   *
   * `after()` can run more than once and two tabs can race, so the idempotence is the titler's and
   * not this line's: `setNinaSessionTitleIfUntitled`'s `WHERE … AND title IS NULL` is the durable
   * marker, on `hasProactiveMessageForRun`'s reasoning. `titleNinaSessionIfNeeded` never throws and
   * makes no call at all for a session that already has a name.
   */
  after(() => titleNinaSessionIfNeeded(userId, sessionId))

  return { ok: true, userMessageId: runnerMessageId, bubbles, unavailable: false }
}

export type NinaDescribeFailureReason =
  /** The floor tripped. The endpoint dropped the image and may have invented a description. */
  | 'dropped'
  /** Network, timeout, non-JSON, empty completion, or a blob that would not fetch. */
  | 'transport'
  /** The pathname did not belong to this user, or was not a chat pathname at all. */
  | 'rejected'

export interface NinaDescribeImageInput {
  /** From the browser's `upload()` result. */
  blobUrl: string
  /** The STORED pathname, after Vercel's random suffix. */
  pathname: string
  width: number
  height: number
  bytes: number
}

export interface NinaDescribeImageResult {
  ok: boolean
  /**
   * Opaque and signed. The composer holds it and hands it back to `sendNinaMessage`. On failure
   * it is **still issued** — carrying `description: null` — so that an image whose description
   * failed can still be SENT, with Nina told honestly that she could not see it.
   */
  ticket: string | null
  reason: NinaDescribeFailureReason | null
}

/**
 * **The describe pre-pass, in its own invocation. RU-12 and invariant 5.**
 *
 * ── WHY THIS IS NOT PART OF `sendNinaMessage` ────────────────────────────────────────────────
 * Arithmetic, not taste. `NINA_TURN_BUDGET.overall` is 45 s and phase 3 forbids raising it past
 * 50 s because the remaining 10 s of the 60 s segment is page overhead plus up to four inserts. A
 * describe call costs ~8-11 s for one image (F04 measured ~26-33 ms per completion token plus
 * ~2-3 s fixed). 45 + 11 = 56 s, and three images would be ~67 s. It does not fit, and no timeout
 * tuning makes it fit. So it runs here, alone, while the runner is still typing his caption — and
 * `sendNinaMessage` adds zero model calls. Do not move it.
 *
 * ── AND THE COMPOSER CANNOT PARALLELISE THESE, WHICH IS FINE ─────────────────────────────────
 * Corrected against Next 16.3.1's own guide, which the phase-6 plan predated:
 * *"Next.js dispatches Server Actions one at a time per client… do not rely on `Promise.all` to
 * parallelize Server Actions from the client."* So three picked photos compress and PUT in
 * parallel (that half goes through `/api/upload`, a Route Handler, which is not serialised) and
 * then describe **one after another** — ~24-33 s for three, not the ~11 s the plan's latency
 * section claimed.
 *
 * Nothing load-bearing moves. Each call still gets its own invocation and its own 25 s budget, so
 * serialisation cannot cause a timeout; the wait is client-side, behind a visible per-tile
 * spinner, while he types; and the send path still carries zero model calls. The single-photo
 * case — which is what R10 is actually about — is unaffected. Batching all three into one call is
 * the obvious repair and is deliberately NOT taken: it would weaken the per-image token floor at
 * exactly the count the multiplication exists to guard, and it needs a paragraph splitter with no
 * fixture behind it. `describeNinaImagesWithFetch` already accepts an array if that trade ever
 * changes.
 *
 * ── AND WHY A FAILURE STILL RETURNS A TICKET ─────────────────────────────────────────────────
 * R10 is "he sends a photo and she responds to what is in it". When the eyes fail, the honest
 * outcome is not a blocked send — it is her asking what the picture is, which is what a person
 * does when an image will not load. `NINA_DESCRIPTION_UNAVAILABLE` is that instruction, and the
 * `description: null` ticket is how it gets there. What must never happen is Nina describing a
 * photo she did not receive; that is what the token floor is for, one layer down.
 */
export async function describeNinaImage(
  input: NinaDescribeImageInput,
): Promise<NinaDescribeImageResult> {
  const userId = await requireUserId()
  const secret = authEnv().AUTH_SECRET

  const blobUrl = typeof input?.blobUrl === 'string' ? input.blobUrl : ''
  const pathname = typeof input?.pathname === 'string' ? input.pathname : ''

  /*
   * The pathname arrives from the client, so it is re-checked here even though the upload route
   * already checked it: this action's own INSERT-shaped claims (pathname, blobUrl) are about to be
   * signed, and signing something unvalidated is how a signature becomes a laundering service.
   * The stored pathname carries Vercel's random suffix, so the id segment is longer than the
   * requested one — which `NINA_CHAT_ID_RE`'s 12..24 bound already admits.
   */
  if (!isNinaChatRequestPathname(pathname, userId) || !blobUrl.startsWith('https://')) {
    return { ok: false, ticket: null, reason: 'rejected' }
  }

  const claims = {
    userId,
    pathname,
    blobUrl,
    width: Number.isFinite(input.width) ? Math.round(input.width) : 0,
    height: Number.isFinite(input.height) ? Math.round(input.height) : 0,
    bytes: Number.isFinite(input.bytes) ? Math.round(input.bytes) : 0,
  }

  try {
    const result = await describeNinaImages([{ blobUrl, pathname }])
    console.log('[nina] described an image', {
      pathname,
      promptTokens: result.promptTokens,
      completionTokens: result.completionTokens,
      floor: result.floor,
      chars: result.description.length,
    })
    return {
      ok: true,
      ticket: signNinaImageTicket({ ...claims, description: result.description }, secret),
      reason: null,
    }
  } catch (cause) {
    /*
     * The floor tripping is logged LOUDLY and separately from a transport failure. It is the one
     * class that means "the vendor lied to us", and the day it starts happening the log line has
     * to say which one it was — F04's whole §1.1 lesson in one `if`.
     */
    const dropped = cause instanceof NinaVisionTokenFloorError
    if (dropped) {
      console.error('[nina] TOKEN FLOOR TRIPPED on a chat image', {
        pathname,
        message: cause.message,
      })
    } else {
      console.warn('[nina] could not describe a chat image', { pathname, error: String(cause) })
    }
    return {
      ok: false,
      ticket: signNinaImageTicket({ ...claims, description: null }, secret),
      reason: dropped ? 'dropped' : 'transport',
    }
  }
}

/**
 * The `after()` wrapper, so the two exit paths schedule one identical pass.
 *
 * **`messageCount` is an exact count and still costs no query (F35 phase 3).** It used to be
 * `context.conversation.window.length` — the 40-message window, "exact everywhere below 40", which
 * was fine while there was one conversation. Session-scoping the window (assumption A1) broke that:
 * the length resets in every new session, so `nameSlotValue`'s `FIRST_CONVERSATION_MESSAGE_LIMIT`
 * check would latch on again and she would re-offer him a nickname every time he changed topic.
 *
 * `window.length + olderMessageCount` is the repair and it is free, because phase 3 deliberately
 * left `olderCount` user-wide (see `getNinaMessageWindow`): the sum is every message he has ever
 * exchanged with her, across every session, computed from two numbers already in hand. That is
 * strictly better than what this comment used to promise, and it makes "the first conversation" a
 * property of the relationship rather than of a session — which is what the phrase means.
 */
function scheduleDistillation(input: {
  userId: string
  runnerText: string
  sourceMessageId: string
  ninaBubbles: readonly string[]
  memoryWrites: readonly NinaMemoryWrite[]
  context: NinaContext
}): void {
  after(async () => {
    await runTurnDistillation({
      userId: input.userId,
      runnerText: input.runnerText,
      sourceMessageId: input.sourceMessageId,
      ninaBubbles: input.ninaBubbles,
      memoryWrites: input.memoryWrites,
      slots: input.context.memory.slots.map((slot) => ({ key: slot.key, value: slot.value })),
      identity: {
        fullName: input.context.runner.fullName,
        nickname: input.context.runner.nickname,
        messageCount:
          input.context.conversation.window.length + input.context.conversation.olderMessageCount,
      },
    })
  })
}
