'use server'

import { requireUserId } from '@/lib/auth/requireUserId'
import { listRunAttachments } from '@/lib/db/queries'
import { authEnv } from '@/lib/env'
import { isValidId } from '@/lib/id'
import { after } from 'next/server'

import { ninaPhotoProvenance } from '../attach'
import { releaseBlobIfUnreferenced } from '../blobRelease'
import { openNinaChatTurn, supersedeNinaChatTurn, sweepStaleNinaChatTurns } from '../chatturn'
import {
  applyPerceptualKeepers,
  normalizeClaimedContentHash,
  ninaUploadInsertRow,
  partitionNinaUploadClaims,
  type NinaDedupeInsertRow,
  type NinaUploadClaim,
  type NinaUploadKeeper,
} from '../dedupe'
import { NINA_MAX_CHAT_IMAGES } from '../images'
import { verifyNinaImageTicket, type NinaImageClaims } from '../imageTicket'
import { isPerceptualTwin, parseDhashHex, sig16FromBase64 } from '../perceptual'
import { fetchAndSignImage, type NinaImageSignature } from '../perceptualSign'
import { NINA_DESCRIPTION_UNAVAILABLE } from '../prompts/describe'
import {
  adoptNinaMessageImage,
  findNinaImageByContentHash,
  findNinaSignedOriginals,
  getNinaAvatar,
  getNinaMessageImage,
  getNinaMessagesByIds,
  getNinaSession,
  insertNinaMessageImages,
  insertNinaMessages,
  type NinaImageInsert,
  type NinaMessageRow,
} from '../queries'
import { resolveNinaWriteSession } from '../sessionResolve'
import type { NinaImageKind } from '@/lib/db/schema'
import { MAX_RUNNER_MESSAGE_CHARS } from '../schema'
import { startNinaBackgroundTurn } from './startTurn'

/**
 * The SEND concern of Nina's chat actions — the one entry point the composer calls, with the
 * attachment resolution and the dedupe race-close beneath it. Split verbatim out of the former
 * `lib/nina/actions.ts` (2026-09-12); its siblings live in `./resend`, `./poll`,
 * `./duplicateCheck` and `./describe`, and the public address is still `@/lib/nina/actions` (the
 * barrel).
 *
 * **The one entry point phase 4 calls, from exactly one place: `ChatScreen.handleSend`.**
 *
 * ── WHY AN ACTION AND NOT A ROUTE HANDLER ─────────────────────────────────────────────────────
 * D7 fixes the route-handler list at `/api/extract`, `/api/upload`, `/api/auth/[...nextauth]` and
 * `/api/cron/*`, and says Server Actions carry every other mutation. A chat turn writes up to
 * five rows, so it is a mutation, so it is an action — the identical reasoning
 * `lib/insights/actions.ts` states in its own header.
 *
 * ── THREE THINGS FROM NEXT 16.3.1'S OWN GUIDES, EACH SHAPING THE CODE BELOW ───────────────────
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

export interface SendNinaMessageResult {
  ok: boolean
  userMessageId: string | null
  /**
   * **The conversation his message actually landed in (F36 R6).**
   *
   * New, and the client genuinely cannot do without it: `input.sessionId` may be `null` — "he has
   * no sessions at all" is a real state — and in that case this action RESOLVES OR CREATES one. The
   * screen then has to poll for her reply, and a poll needs a session id. Before the split the
   * client never needed to know, because the bubbles came back in this same return value.
   *
   * Null iff `!ok`.
   */
  sessionId: string | null
  /**
   * `nina_messages.seq` of the runner's row — where `pollNinaReply` resumes from.
   *
   * A `seq` rather than an id because `seq` is a `bigserial` Postgres assigns, so it is a total
   * order and `> cursor` is a complete, gap-tolerant description of "everything I have not seen".
   * Null iff `!ok`.
   */
  cursor: number | null
  /**
   * The `nina_turns.id` of the background turn this send started, or **null when a turn was already
   * running for this conversation** — which is a normal outcome, not a failure. His message is
   * saved either way; the turn already in flight chains onto it (see `runNinaBackgroundTurn`).
   *
   * The client does not branch on it. It is here because a null makes a log line and a test able to
   * say which of the two happened, and phase 7's integration test drives its assertions off it.
   */
  turnId: string | null
}

const REFUSED: SendNinaMessageResult = {
  ok: false,
  userMessageId: null,
  sessionId: null,
  cursor: null,
  turnId: null,
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
/**
 * What `resolveAttachment` hands back — named now that TWO callers share it (media-dedupe P2):
 * the pinned album photo, and the composer's deduplicated tiles, both of which are photographs
 * the server already owns being attached to a new message. The shape is unchanged; only the
 * anonymity is.
 */
interface ResolvedNinaAttachment {
  blobUrl: string
  pathname: string
  kind: NinaImageKind
  description: string | null
  /**
   * F37 R1/R3. Both null is unreachable from `resolveAttachment`: it is only ever called for a
   * photograph the server ALREADY owns, so the row it writes is a reference by definition.
   * `ninaPhotoProvenance` decides which column and flattens a re-attached reference to its
   * original.
   */
  sourceAvatarId: string | null
  sourceImageId: string | null
  /**
   * **R4.** The `nina_message_images.id` to RE-PARENT onto the new message, or null to write a
   * reference row — unchanged from the docstring the function carried before the name existed.
   */
  adoptableId: string | null
}

async function resolveAttachment(
  userId: string,
  attach: NinaAttachExisting,
): Promise<ResolvedNinaAttachment | null> {
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
      /*
       * F37 R3. `row.id` and not `attach.id`, though the read was by primary key and they are
       * equal: the provenance names the row this function actually proved is his, which is a
       * property the foreign key can then rely on rather than one a reader has to reconstruct.
       */
      ...ninaPhotoProvenance({ kind: 'avatar', id: row.id }),
      /* An album row is not a chat row. There is nothing to adopt, ever. */
      adoptableId: null,
    }
  }

  /*
   * The same substitution on the conversation-photo branch. `listNinaMessageImages(userId, {
   * limit: NINA_GALLERY_LIMIT }).find(...)` read up to 200 rows to answer one id;
   * `getNinaMessageImage` is phase 3's mirror of `getNinaAvatar` and is why this phase depends on
   * phase 3. Bounded before, so this is a smaller win than the avatar branch — done in the same
   * commit because leaving one of two identical mistakes in place is how it grows back.
   *
   * `getNinaMessageImage` deliberately does NOT filter references (invariant 2): a photograph
   * hidden from the two listings is still a photograph in a bubble, and re-attaching it has to
   * keep working. The row's own provenance is what makes that safe — it is passed through below
   * and flattened, so the copy of a copy points at the original.
   */
  const row = await getNinaMessageImage(userId, attach.id)
  if (row == null) return null
  /* A re-attached chat photo keeps whoever's it was. */
  return {
    blobUrl: row.blobUrl,
    pathname: row.pathname,
    kind: row.kind,
    description: row.description,
    ...ninaPhotoProvenance({
      kind: 'image',
      id: row.id,
      sourceAvatarId: row.sourceAvatarId,
      sourceImageId: row.sourceImageId,
    }),
    /* R4. A row with no message is an orphan, and an orphan is the ONLY thing adoption may move —
     * `message_id IS NULL` is re-asserted inside the UPDATE, so this is a candidate and not a
     * decision. A row that still has a message is left exactly where it is. */
    adoptableId: row.messageId === null ? row.id : null,
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
 *       dedupedImageIds?: readonly string[]                          // media-dedupe P2
 *       contentHashes?: Record<string, string>                       // media-dedupe P2
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
 *
 * **media-dedupe P2 extends the object with those two optional fields**, and the refusal rule
 * with its fifth disjunct — the same monotone extension the four phases before it made.
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
   * media-dedupe P2. The `nina_message_images` ids the COMPOSER's pre-check proved already hold
   * these bytes: a picked tile whose hash matched one of his originals skipped its upload
   * entirely and sends this pointer instead. Untrusted like every other id here —
   * `resolveAttachment` re-proves ownership per id, and an id that has since been deleted DROPS
   * that tile rather than refusing the send: the tiles are extra and his sentence is not, which
   * is the forged-ticket precedent, not the pinned-photo one. Capped at `NINA_MAX_CHAT_IMAGES`
   * exactly as the tickets are.
   *
   * **This is RULING B1's refusal rule's FIFTH disjunct** — an image-only send made entirely of
   * references is still a send. The rule is extended, never rewritten; the same monotone move
   * phases 6, 8 and 13 made.
   */
  dedupedImageIds?: readonly string[]
  /**
   * media-dedupe P2. The content hash behind each ticket, keyed by the ticket's STORED pathname
   * (keyed, not aligned by index, because STEP 0's dedupe-by-pathname filters claims and an
   * index-aligned array is one filter away from pointing hashes at the wrong rows).
   *
   * A claim, the same trust class as `width`/`height`/`bytes`: format-validated here
   * (`isValidContentHash`, 64-hex) and never signature-checked — `/api/upload`'s tokenPayload is
   * deliberately untouched. Invalid or missing means the row is written with NULL and dedup is
   * silently inactive for it — invariant 9, never a send error.
   */
  contentHashes?: Record<string, string>
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
  /* Shape only, like the tickets above: ownership is `resolveAttachment`'s, at STEP 0d-bis. */
  const dedupedPointers: NinaAttachExisting[] = Array.isArray(input?.dedupedImageIds)
    ? input.dedupedImageIds
        .filter((id): id is string => typeof id === 'string' && isValidId(id))
        .map((id) => ({ kind: 'image' as const, id }))
    : []
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
  if (
    text.length === 0 &&
    tickets.length === 0 &&
    requestedRunId === null &&
    attach === null &&
    dedupedPointers.length === 0
  ) {
    return REFUSED
  }
  if (text.length > MAX_RUNNER_MESSAGE_CHARS) return REFUSED
  if (tickets.length > NINA_MAX_CHAT_IMAGES) return REFUSED
  if (dedupedPointers.length > NINA_MAX_CHAT_IMAGES) return REFUSED

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
  if (
    text.length === 0 &&
    images.length === 0 &&
    requestedRunId === null &&
    attach === null &&
    dedupedPointers.length === 0
  ) {
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

  /*
   * STEP 0d-bis — THE DEDUPLICATED TILES (media-dedupe P2). Resolved BEFORE the runner's row, so
   * a dead keeper is discovered before anything is written — and it DEGRADES rather than refuses,
   * which is where these tiles part company with the pinned photo one block up. The pinned photo
   * is what the send is ABOUT (`resolveAttachment`'s miss refusal argues exactly that); a
   * deduplicated tile is a photograph he happens to be re-sending. If its keeper vanished between
   * the composer's pre-check and this send — a delete in another tab, mid-compose — the honest
   * outcome is the ticket path's: warn, drop the tile, send the message. Losing his sentence over
   * a photograph that was a duplicate anyway would be the worse outcome by a wide margin.
   *
   * `resolveAttachment` may also come back with `adoptableId`: a keeper that is an ORPHAN (its
   * message was deleted) is RE-PARENTED onto this message by the same R4 block that adopts
   * re-attached orphans, so the photograph comes back into a conversation as its own row rather
   * than gaining a second one.
   */
  const dedupedPhotos: ResolvedNinaAttachment[] = []
  for (const pointer of dedupedPointers) {
    try {
      const resolved = await resolveAttachment(userId, pointer)
      if (resolved === null) {
        console.warn('[nina] dropped a deduplicated tile; its keeper is gone', { id: pointer.id })
        continue
      }
      dedupedPhotos.push(resolved)
    } catch (cause) {
      console.warn('[nina] could not resolve a deduplicated tile', {
        id: pointer.id,
        error: String(cause),
      })
    }
  }

  /* The run was the whole message and it is not his: there is nothing here to send. Same shape as
   * the forged-ticket check above, and the same reason. */
  if (
    text.length === 0 &&
    images.length === 0 &&
    runId === null &&
    attached === null &&
    dedupedPhotos.length === 0
  ) {
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
  let runnerSeq: number
  try {
    const [row] = await insertNinaMessages(
      userId,
      [{ role: 'runner', body: text, replyToId: quotedRow?.id ?? null, runId }],
      sessionId,
    )
    if (row == null) throw new Error('insertNinaMessages returned no row')
    runnerMessageId = row.id
    /* F36 R6. The poll cursor, and it costs nothing: `insertNinaMessages` already `returning`s the
     * whole `messageColumns` projection, and `seq` is in it. */
    runnerSeq = row.seq
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
   * ── media-dedupe P2: THE WRITE-TIME DEDUP ────────────────────────────────────────────────────
   * The composer hashed the bytes it PUT and sent each hash keyed by the stored pathname
   * (`contentHashes`). Every claim below was a fresh upload when it left the browser; by the time
   * these statements run, one of three things can be true about its bytes:
   *
   *   · an original with the same hash is ALREADY in the collection — the composer's pre-check
   *     ran before this row existed, and its keeper was written after that read;
   *   · an EARLIER CLAIM IN THIS SAME SEND has the same hash — the same file picked twice in one
   *     batch, where both tiles passed the pre-check because neither row existed yet;
   *   · the bytes are genuinely new.
   *
   * The first two become REFERENCE rows — `ninaUploadInsertRow` copies the keeper's
   * `blob_url`/`pathname`, stamps `source_image_id` through `ninaPhotoProvenance` (flattened to
   * the ORIGINAL), and takes the keeper's `kind` and description — exactly the shape
   * `resolveAttachment`'s attach arm writes, so the collection reads and the reaper need to know
   * nothing new. Each reference's just-landed blob is then released. THE ROWS GO FIRST: both
   * INSERT statements are awaited before any release is even REGISTERED, and the releases run
   * under `after()` — invariant 3 spelled as control flow.
   *
   * A failure anywhere in here is warned and swallowed, as before, and the degradation ladder
   * always lands on "writes the photograph, maybe twice", never on "writes a row pointing at
   * nothing" and never on "loses the message": a failed keeper lookup uploads fresh, and a
   * same-send reference whose original failed to insert degrades to a fresh row of its own (its
   * bytes are still in Blob — nothing has been released yet).
   */
  if (images.length > 0) {
    try {
      const claims: NinaUploadClaim[] = images.map((image, index) => ({
        pathname: image.pathname,
        blobUrl: image.blobUrl,
        width: image.width || null,
        height: image.height || null,
        bytes: image.bytes || null,
        description: image.description,
        sortOrder: index,
        /*
         * Invariant 9. An invalid or missing hash is NULL here — dedup silently inactive for
         * this row — and never a send error. The keeper lookup below never runs for it.
         */
        contentHash: normalizeClaimedContentHash(input.contentHashes?.[image.pathname]),
      }))

      /*
       * THE RACE-CLOSE RE-CHECK. The composer pre-checked at pick time; this is the same question
       * asked at insert time, when the window it closes is "the pre-check ran, then someone else
       * wrote the same bytes". One indexed lookup per DISTINCT hash — `(user_id, content_hash)` is
       * phase 1's partial index, never a scan — and a FAILED lookup degrades to fresh rather than
       * to "no rows at all": dedup must never make a send worse.
       */
      const keepersByHash = new Map<string, NinaUploadKeeper>()
      for (const hash of new Set(
        claims.flatMap((claim) => (claim.contentHash === null ? [] : [claim.contentHash])),
      )) {
        try {
          const keeper = await findNinaImageByContentHash(userId, hash)
          if (keeper !== null) keepersByHash.set(hash, keeper)
        } catch (cause) {
          console.warn('[nina] content-hash lookup failed; this upload lands fresh', {
            hash,
            error: String(cause),
          })
        }
      }

      /*
       * THE PERCEPTUAL HALF OF THE RACE-CLOSE (media-dedupe follow-up, 2026-09-10's recurring
       * defect). The byte keys above answer "these exact bytes are stored" — and a photograph
       * downloaded out of the collection re-encodes on the way back (the device's save, then
       * `compressForNina` on pick), so its bytes are NEW while the pixels are the original's.
       * For every claim the byte keys could not settle, hold the just-landed object once more
       * (`fetchAndSignImage`) and compare its signature against the owner's signed originals at
       * the sweep's gates; a twin converts the claim into a REFERENCE — the re-encode never
       * enters the collection twice — and every claim, twin or not, carries its own signature
       * onto the row it becomes, so the NEXT re-upload of it can match. A failure anywhere in
       * here is `null`-shaped and lands fresh, never lost: the same ladder as the byte keys.
       */
      const perceptualKeepers = await perceptualTwinsForClaims(userId, claims, keepersByHash)

      const partition = applyPerceptualKeepers(
        partitionNinaUploadClaims(claims, keepersByHash),
        perceptualKeepers,
      )

      /* ROW FIRST (1/2) — the originals, in one statement, so their ids exist for the same-send
       * references below. `returning()` rows come back in VALUES order (the guarantee STEP 5's
       * seq argument rests on), so index i of the result is claim i. */
      const freshRows =
        partition.fresh.length > 0
          ? await insertNinaMessageImages(
              userId,
              partition.fresh.map(
                (claim) =>
                  ninaUploadInsertRow({ messageId: runnerMessageId, claim, keeper: null }).row,
              ),
            )
          : []

      /* The same-send originals, by hash, now that they have ids. */
      const sameSend = new Map<string, NinaUploadKeeper>()
      partition.fresh.forEach((claim, index) => {
        const row = freshRows[index]
        if (claim.contentHash !== null && row !== undefined) {
          sameSend.set(claim.contentHash, row)
        }
      })

      /* ROW FIRST (2/2) — the references, in one statement, AFTER the originals exist. */
      const referenceRows: NinaDedupeInsertRow[] = []
      /* The just-landed blobs the references orphaned. Registered below, never awaited here. */
      const releases: Array<{ blobUrl: string; pathname: string }> = []
      for (const { claim, keeper } of partition.references) {
        /* A DB or perceptual reference carries its keeper whole; a SAME-SEND reference resolves
         * the id from the fresh insert's return, which only claims WITH a hash can reach (the
         * same-send path is hash-keyed by construction). The wide claim type
         * (`NinaUploadPartition.references`) is why the null check sits in the expression. */
        const resolved =
          keeper ?? (claim.contentHash !== null ? (sameSend.get(claim.contentHash) ?? null) : null)
        if (resolved === null) {
          /* Unreachable by construction — a reference exists only when a keeper (DB or
           * same-send) existed at partition time. But the degradation ladder's floor is "write
           * the photograph fresh", because this claim's bytes are still sitting in Blob and a
           * row that names nothing is the one outcome worse than a duplicate. */
          referenceRows.push(
            ninaUploadInsertRow({ messageId: runnerMessageId, claim, keeper: null }).row,
          )
          continue
        }
        referenceRows.push(
          ninaUploadInsertRow({ messageId: runnerMessageId, claim, keeper: resolved }).row,
        )
        /* These bytes landed for THIS send and the row now points at the keeper's URL instead —
         * nobody references them. Released below, and only here. */
        releases.push({ blobUrl: claim.blobUrl, pathname: claim.pathname })
      }
      if (referenceRows.length > 0) {
        await insertNinaMessageImages(userId, referenceRows)
      }

      /* BLOB SECOND. `after()` is this module's convention for work that must outlive the
       * response; a release that fails leaves an orphan, which `reap-orphaned-blobs` exists for
       * and which `releaseBlobIfUnreferenced` prefers over any risk of deleting shared bytes. */
      if (releases.length > 0) {
        after(async () => {
          for (const ref of releases) {
            await releaseBlobIfUnreferenced(userId, ref)
          }
        })
      }
    } catch (cause) {
      console.warn('[nina] could not persist chat images', { error: String(cause) })
    }
  }

  /*
   * R26's row — now **ADOPT-OR-REFERENCE** (R4), and since media-dedupe P2 it is a LIST: the
   * composer's deduplicated tiles ride the SAME seam as the pinned album photo. Both are
   * photographs the server already owns; both are resolved through `resolveAttachment`; both are
   * adopted when they are orphans and written as reference rows when they are not. The pinned
   * photo stays LAST in the list so that, when it is the only attachment, its
   * `sortOrder: images.length` is byte-identical to what this block has always written — and so
   * the server's order matches the optimistic bubble's (fresh uploads, deduplicated tiles, pinned
   * photo — see `ChatScreen`'s `optimisticUrls`).
   *
   * Every rule the single-`attached` version carried is unchanged and applies per candidate: the
   * adopt-or-reference fork, the WHERE-clause race re-check, the warned-and-swallowed failure
   * discipline, and "the upload block above sets NO provenance, because those bytes arrived from
   * his camera" — which is still true, and is why the deduplicated tiles are handled HERE and not
   * there: their bytes arrived from nowhere, because they never uploaded.
   */
  const attachments: ResolvedNinaAttachment[] = [
    ...dedupedPhotos,
    ...(attached !== null ? [attached] : []),
  ]

  if (attachments.length > 0) {
    try {
      const referenceRows: NinaImageInsert[] = []
      for (let position = 0; position < attachments.length; position += 1) {
        /* `noUncheckedIndexedAccess` makes the indexed read nullable; the guard is the repo's
         * spelling of that (cf. `rows[0] ?? null` all over `queries.ts`), not a real branch. */
        const candidate = attachments[position]
        if (candidate === undefined) continue
        const sortOrder = images.length + position
        const adopted =
          candidate.adoptableId === null
            ? null
            : await adoptNinaMessageImage(userId, candidate.adoptableId, {
                messageId: runnerMessageId,
                sortOrder,
              })

        if (adopted === null) {
          referenceRows.push({
            messageId: runnerMessageId,
            kind: candidate.kind,
            blobUrl: candidate.blobUrl,
            pathname: candidate.pathname,
            description: candidate.description,
            sortOrder,
            sourceAvatarId: candidate.sourceAvatarId,
            sourceImageId: candidate.sourceImageId,
          })
        }
      }
      if (referenceRows.length > 0) {
        await insertNinaMessageImages(userId, referenceRows)
      }
    } catch (cause) {
      console.warn('[nina] could not persist the attached photos', { error: String(cause) })
    }
  }

  /*
   * ── STEP 1c — THE CLAIM, AND THE LINE THIS ACTION NOW RETURNS ON (F36 R6) ────────────────────
   *
   * Everything above this comment is unchanged and still synchronous, and that is the requirement
   * rather than an accident. R6 is "i send the message, it quickly shown that the message is sent";
   * what makes that honest is that his row, his photos and his attached run are all committed
   * before the word "sent" appears. Everything below — the context load, the 13-45 s model call,
   * the persist of her bubbles, the distillation, the auto-title — happens after the response is
   * out, on the server, whether or not the browser is still there.
   *
   * ── THE WRITE ORDER THIS FILE'S HEADER CALLS PART OF THE CONTRACT IS PRESERVED, AND THE SPLIT
   *    IS WHAT MAKES IT OBVIOUS ─────────────────────────────────────────────────────────────────
   * The header: *"`loadNinaContext` reads the conversation window out of `nina_messages`, so a
   * message not yet written is a message SHE CANNOT SEE. Insert first, then build the context."*
   * The cut is placed exactly between the insert and the context load, so the ordering is no longer
   * a convention two hundred lines apart — it is the boundary between the function that returns and
   * the function that thinks.
   *
   * ── THE SWEEP RUNS HERE, WHICH IS THE CHEAPEST HONEST PLACE FOR IT ──────────────────────────
   * One conditional UPDATE against an indexed predicate, on a path that is already writing rows. A
   * turn that died is closed at the exact moment its deadness starts to matter — the moment he
   * sends again — and `openNinaChatTurn` below is then free to open a new claim. See
   * `sweepStaleNinaChatTurns` for why it does not retry and does not apologise.
   */
  try {
    await sweepStaleNinaChatTurns(userId)
  } catch (cause) {
    /* A sweep that could not run must never cost him a send. The worst case is that
     * `openNinaChatTurn` refuses because a dead claim is still standing, and his message is picked
     * up by his next send — which is the same outcome the notice already promises. */
    console.warn('[nina] chat turn sweep failed', { error: String(cause) })
  }

  /*
   * ── STEP 1c-i — THE CANCEL (R1). ─────────────────────────────────────────────────────────────
   * If a turn for THIS conversation is still THINKING (`pending` + `running`, and fresh — see
   * `supersedeNinaChatTurn` for why an expired one is left alone), this send closes it
   * `failed`/`superseded`, and the `openNinaChatTurn` below then opens a FRESH one whose context
   * already contains both his messages — the one the thinking turn was answering (persisted in
   * STEP 1, before any of this) and this one. One round trip, one turn, and the burst is answered
   * together instead of queued behind a stale answer.
   *
   * It sits here — after every refusal and after his row is committed — because a cancel is a
   * write on somebody else's turn and must never be spent on a send that then refuses. It sits
   * between the sweep and the open because the open is what needs the claim gone: the moment the
   * supersede wins, there is no pending claim left for this session and the open proceeds.
   *
   * A cancel that LOSES — she reached `'persisting'`, the claim expired, or the statement raced
   * and missed — has no branch here, on purpose: `openNinaChatTurn` then refuses as it always has
   * and the turn that beat us chains onto this message exactly as before. The boolean buys one
   * log line and nothing else.
   */
  let superseded = false
  try {
    superseded = await supersedeNinaChatTurn(userId, sessionId)
  } catch (cause) {
    /* Invariant 7: a cancel that could not run must never cost him the send. The worst case is
     * exactly today's behavior — his message is saved and the running turn chains onto it. */
    console.warn('[nina] could not supersede the thinking turn', { error: String(cause) })
  }
  if (superseded) {
    console.log('[nina] superseded a thinking turn', { userId, sessionId })
  }

  let turnId: string | null = null
  try {
    turnId = await openNinaChatTurn(userId, { sessionId, runnerMessageId, depth: 0 })
  } catch (cause) {
    console.warn('[nina] could not open a chat turn', { error: String(cause) })
  }

  /*
   * `turnId === null` is the ORDINARY burst case: a turn is already running for this conversation,
   * so this message needs no second model call — the running turn chains onto it when it finishes.
   * It is also what a failed open degrades to, and the two want the same handling, because in both
   * of them the honest state is "his message is saved and something will answer it or the sweep
   * will call it dead". Returning `ok: false` here would mark a perfectly persisted message as
   * failed on screen, which is the one thing R6 exists to stop.
   */
  if (turnId !== null) {
    startNinaBackgroundTurn({
      userId,
      sessionId,
      turnId,
      runnerMessageId,
      runnerText: text.length > 0 ? text : null,
      imageDescriptions: [
        ...images.map((image) => image.description ?? NINA_DESCRIPTION_UNAVAILABLE),
        /*
         * media-dedupe P2. Every attachment's description rides along — the pinned album photo's
         * (as before) and now the deduplicated tiles', whose keeper descriptions were proved
         * owner-scoped by `resolveAttachment`. A photograph-only send made entirely of
         * references must still give her eyes: `imageDescriptions` is the ONLY thing she is told
         * about a photograph (invariant 5 — text, never an image part).
         */
        ...attachments.map((candidate) => candidate.description ?? NINA_DESCRIPTION_UNAVAILABLE),
      ],
      quotedRow,
      attachedRunId: runId,
      depth: 0,
      startedAtMs: Date.now(),
    })
  }

  return { ok: true, userMessageId: runnerMessageId, sessionId, cursor: runnerSeq, turnId }
}

/**
 * **The perceptual half of STEP 1b's race-close** (media-dedupe follow-up, 2026-09-10's recurring
 * defect). `findNinaDuplicateChatImage` and the byte re-check above it answer "these exact BYTES
 * are already stored". They cannot see the class that kept re-creating it: a photograph downloaded
 * out of the collection re-encodes on the journey back — the device's save, then `compressForNina`
 * on pick — and arrives as bytes nobody has stored while the pixels are the original's. Measured on
 * the production pair that kept coming back: 736x981 both, sha-256 worlds apart, dHash 0/64,
 * 16x16 mean-abs 0.043 — `isPerceptualTwin`'s gates answer it at a canter.
 *
 * For every claim the byte keys left OPEN, this fetches the just-landed object back (the PUT went
 * browser → Blob directly; the public URL is the only way the server holds the bytes) and signs it
 * with the ONE signer (`lib/nina/perceptualSign.ts`), then scans the owner's signed originals —
 * newest first, so the first twin is the attach target the byte finder would have picked. TWO
 * things come back to the caller's claims, both by mutation and by return value:
 *
 *   · every signed claim carries `claim.perceptual` — so whichever row it becomes, an ORIGINAL row
 *     stores its signature and the NEXT re-upload of these pixels can match. This is what makes
 *     the layer self-sustaining: signatures do not wait for a sweep run to exist.
 *   · the returned map names each claim's STORED pathname → its twin as `NinaUploadKeeper`, the
 *     shape `applyPerceptualKeepers` re-partitions on. Keyed by pathname because every claim
 *     carries one disjoint from its (possibly null) hashes, and the caller signed under it.
 *
 * ── EVERY FAILURE IS SILENT, AND SILENT MEANS FRESH ──────────────────────────────────────────
 * A failed GET, an undecodable body, a dead lookup, an empty scan — each degrades to "no twin, no
 * signature, land it as the byte keys answered", never to a failed send. A duplicate that slips
 * this net is what the sweep's perceptual pass has been merging all along; a send that fails here
 * would be a new and worse defect. The one non-silent choice: claims with a DB byte keeper are
 * not signed at all — their rows are references, references carry no signature, and the fetch
 * would be work with no reader.
 *
 * ── ONE FETCH PER DISTINCT BYTE SET ───────────────────────────────────────────────────────────
 * Claims are grouped by `contentHash ?? pathname` — identical encode hashes are identical bytes
 * (the same file picked twice, however many PUTs landed), so one signature answers for all of
 * them, and a null-hash claim stands alone under its pathname. The signatures the comparison runs
 * on were measured HERE, server-side, by the same sharp pipeline the sweep and the generated
 * store sign with — the browser computes no claim in this layer, which is exactly why it can be
 * trusted at a ≤1-bit gate while `content_hash`'s claims cannot.
 */
async function perceptualTwinsForClaims(
  userId: string,
  claims: readonly NinaUploadClaim[],
  keepersByHash: ReadonlyMap<string, NinaUploadKeeper>,
): Promise<Map<string, NinaUploadKeeper>> {
  const open = claims.filter(
    (claim) => claim.contentHash === null || !keepersByHash.has(claim.contentHash),
  )
  if (open.length === 0) return new Map()

  /* One GET-and-sign per distinct byte set; `null` values are failures and simply drop out below. */
  const signatureOf = new Map<string, NinaImageSignature | null>()
  for (const claim of open) {
    const key = claim.contentHash ?? claim.pathname
    if (signatureOf.has(key)) continue
    signatureOf.set(key, await fetchAndSignImage(claim.blobUrl))
  }

  const signed = new Map<string, NinaImageSignature>()
  for (const claim of open) {
    const sig = signatureOf.get(claim.contentHash ?? claim.pathname)
    if (sig !== null && sig !== undefined) {
      signed.set(claim.pathname, sig)
      claim.perceptual = { dhashHex: sig.dhashHex, sig16Base64: sig.sig16Base64 }
    }
  }
  if (signed.size === 0) return new Map()

  let originals: Awaited<ReturnType<typeof findNinaSignedOriginals>> = []
  try {
    originals = await findNinaSignedOriginals(userId)
  } catch (cause) {
    console.warn(
      '[nina] signed-originals lookup failed; the send lands as its byte keys answered',
      {
        error: String(cause),
      },
    )
    return new Map()
  }

  /* Parse once per original; an unreadable stored signature makes that row invisible, exactly as
   * the sweep's unsigned rows do not participate. */
  const candidates = originals.flatMap((row) => {
    const dhash = parseDhashHex(row.perceptualHash)
    const sig16 = sig16FromBase64(row.perceptualSig)
    return dhash !== null && sig16 !== null
      ? [{ row, candidate: { width: row.width, height: row.height, dhash, sig16 } }]
      : []
  })

  const keepers = new Map<string, NinaUploadKeeper>()
  for (const [pathname, sig] of signed) {
    const dhash = parseDhashHex(sig.dhashHex)
    const sig16 = sig16FromBase64(sig.sig16Base64)
    if (dhash === null || sig16 === null) continue // the signer's output, re-checked by its own format rule
    const twin = candidates.find((entry) =>
      isPerceptualTwin({ width: sig.width, height: sig.height, dhash, sig16 }, entry.candidate),
    )
    if (twin === undefined) continue
    keepers.set(pathname, {
      id: twin.row.id,
      kind: twin.row.kind,
      blobUrl: twin.row.blobUrl,
      pathname: twin.row.pathname,
      description: twin.row.description,
      sourceAvatarId: twin.row.sourceAvatarId,
      sourceImageId: twin.row.sourceImageId,
    })
  }
  return keepers
}
