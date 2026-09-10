'use server'

import { requireUserId } from '@/lib/auth/requireUserId'
import { listRunAttachments } from '@/lib/db/queries'
import { authEnv } from '@/lib/env'
import { isValidId } from '@/lib/id'
import { after } from 'next/server'

import { ninaPhotoProvenance, type NinaExistingPhoto } from './attach'
import { titleNinaSessionIfNeeded } from './autotitle'
import { releaseBlobIfUnreferenced } from './blobRelease'
import {
  closeNinaChatTurn,
  getPendingNinaChatTurn,
  ninaChatTurnStore,
  ninaSessionExists,
  openNinaChatTurn,
  sweepStaleNinaChatTurns,
} from './chatturn'
import type { NinaContext } from './context'
import {
  normalizeClaimedContentHash,
  ninaUploadInsertRow,
  partitionNinaUploadClaims,
  type NinaDedupeInsertRow,
  type NinaUploadClaim,
  type NinaUploadKeeper,
} from './dedupe'
import { runTurnDistillation } from './distill'
import { dbNinaSourceGateway, dbNinaToolGateway } from './gateway'
import { NINA_MAX_CHAT_IMAGES, isNinaChatRequestPathname } from './images'
import { NINA_FULL_TOOL_SET } from './avatartools'
import { signNinaImageTicket, verifyNinaImageTicket, type NinaImageClaims } from './imageTicket'
import { loadNinaContext } from './load'
import { NINA_DESCRIPTION_UNAVAILABLE } from './prompts/describe'
import {
  adoptNinaMessageImage,
  bumpNinaShortcutUses,
  findNinaImageByContentHash,
  getNinaAvatar,
  getNinaMessageImage,
  getNinaMessageImagesForMessages,
  getNinaMessagesByIds,
  getNinaSession,
  insertNinaMessageImages,
  insertNinaMessages,
  listNinaMessages,
  listNinaMessagesAfter,
  listNinaShortcuts,
  readNinaTuning,
} from './queries'
import type { NinaImageInsert, NinaMessageRow } from './queries'
import { resolveNinaWriteSession } from './sessionResolve'
import type { NinaImageKind } from '@/lib/db/schema'
import type { QuotedMessageInput } from './reply'
import { MAX_RUNNER_MESSAGE_CHARS, type NinaMemoryWrite } from './schema'
import { NINA_SHORTCUT_LOOKBACK } from './shortcuts'
import {
  NINA_BACKGROUND_BUDGET_MS,
  NINA_TURN_CHAIN_MAX,
  NINA_TURN_STALE_MS,
  ninaAwaitingByMessage,
} from './turnflight'
import { NINA_TURN_BUDGET, productionDeps, runNinaTurn, type NinaTurnSource } from './turn'
import type { NinaRelationship } from './tuning'
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

      const partition = partitionNinaUploadClaims(claims, keepersByHash)

      /* ROW FIRST (1/2) — the originals, in one statement, so their ids exist for the same-send
       * references below. `returning()` rows come back in VALUES order (the guarantee STEP 5's
       * seq argument rests on), so index i of the result is claim i. */
      const freshRows =
        partition.fresh.length > 0
          ? await insertNinaMessageImages(
              userId,
              partition.fresh.map((claim) =>
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
        const resolved = keeper ?? sameSend.get(claim.contentHash) ?? null
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
 * **media-dedupe P2: the composer's pre-check.** "Do my bytes already exist in my collection?"
 * asked BEFORE a picked photograph is PUT, so a duplicate pick costs no token mint, no upload and
 * no describe at all — the one part of the dedup that saves the round trip and not just the
 * storage (R2).
 *
 * ── WHY THE ANSWER IS `{ kind: 'image', id, url }` AND NOT THE ROW ─────────────────────────────
 * It is exactly `NinaExistingPhoto` (`lib/nina/attach.ts`), the type the composer already holds
 * for `?photo=`-armed photographs: an id the SEND can carry through `dedupedImageIds` into
 * `resolveAttachment`'s ownership check, plus the URL the tile's optimistic bubble renders. A URL
 * is never the payload — an id resolved against `user_id` is a fact, and this action does the
 * resolving.
 *
 * ── FAILURE IS `null`, AND `null` MEANS "UPLOAD" ───────────────────────────────────────────────
 * An invalid hash (the 64-hex check is the whole of the trust this claim gets — invariant 9), a
 * miss, and a failed lookup are all the same answer: nothing matched, so the composer uploads.
 * The race-close at STEP 1b re-asks the question at insert time regardless, so a false "no" here
 * is corrected there — pre-check and race-close are two windows on one decision, not two
 * decisions that must agree.
 */
export async function findNinaDuplicateChatImage(input: {
  contentHash: string
}): Promise<NinaExistingPhoto | null> {
  const userId = await requireUserId()

  const contentHash = normalizeClaimedContentHash(input?.contentHash)
  if (contentHash === null) return null

  try {
    const keeper = await findNinaImageByContentHash(userId, contentHash)
    if (keeper === null) return null
    return { kind: 'image', id: keeper.id, url: keeper.blobUrl }
  } catch (cause) {
    console.warn('[nina] duplicate pre-check failed; the pick will upload', {
      error: String(cause),
    })
    return null
  }
}

/**
 * **The seam phase 2 owns, isolated to three lines so consuming its convention is a three-line
 * change and not a rewrite (F36 R6).**
 *
 * `after()` is already this module's convention for work that must outlive the response — STEP 6's
 * distillation and STEP 7's auto-title both used it, and both noted that it "throws E468 outside a
 * request scope, which is exactly why the CALL is here in the `'use server'` module". The same
 * reasoning applies at four hundred times the duration, and Next 16.3.1's `after` reference is
 * explicit that it is the right primitive: *"`after` allows you to schedule work to be executed
 * after a response is finished"*, it is supported in Server Functions, and *"`after` will run for
 * the platform's default or configured max duration of your route"* — which on Vercel means the
 * invocation is held open by `waitUntil` until the callback settles. **That is the whole of "the
 * app does not care whether user close the app or not": the wall clock belongs to the server.**
 *
 * ── WHY THIS IS A FUNCTION AND NOT AN INLINE `after()` ───────────────────────────────────────
 * Phase 2 established this repo's convention for durable server-owned background work and chose
 * `after()` in as many words, so this body is the whole of the seam: if the convention ever becomes
 * a fetch to an internal route, this body changes and nothing else does — not the input type, not
 * the caller, not the chain, not the client half.
 *
 * **The budget is the INVOKING SEGMENT's `maxDuration`, not this function's.** `app/nina/page.tsx`
 * carries `export const maxDuration = 300` (phase 2), a Server Action's timeout is the page
 * segment's, and `after()` runs for that same budget. So this must never be relocated into a route
 * handler that does not carry 300 — a 240 s background budget under a 60 s segment is a silent
 * truncation, not an error. `NINA_BACKGROUND_BUDGET_MS` documents the pairing.
 *
 * ── NESTED `after()` IS SANCTIONED, WHICH MATTERS MORE THAN IT LOOKS ─────────────────────────
 * The turn below can call `generate_image` or `set_avatar`, and the generation registers its own
 * `after()`. That is now an `after()` inside an `after()`. Next's reference sanctions it in as many
 * words — *"`after` can be nested inside other `after` calls"* — so the image path keeps working
 * through the split with no change to phase 1's or phase 2's files. The arithmetic phase 2 asserts
 * is 45 s of turn plus 200 s of generation inside the segment's 300.
 */
function startNinaBackgroundTurn(input: NinaBackgroundTurnInput): void {
  after(() => runNinaBackgroundTurn(input))
}

/**
 * Everything `sendNinaMessage` used to do between STEP 2 and STEP 7, as one value.
 *
 * `quotedRow` travels whole rather than as a pre-built `QuotedMessageInput`, because the
 * `sentAtLabel` half of that object is read out of `context.conversation.window` — which does not
 * exist until the background task loads it (invariant 3: this file does not format an instant).
 *
 * `imageDescriptions` is precomputed by the caller so the verified ticket claims and the resolved
 * attachment do not have to travel; they are the only thing the turn wanted from them.
 */
export interface NinaBackgroundTurnInput {
  userId: string
  sessionId: string
  turnId: string
  runnerMessageId: string
  runnerText: string | null
  imageDescriptions: readonly string[]
  quotedRow: NinaMessageRow | null
  attachedRunId: string | null
  /** 0 for the turn a send started; 1 and 2 for chained follow-ups. */
  depth: number
  /** `Date.now()` at the send, so every link of a chain shares one wall-clock budget. */
  startedAtMs: number
}

/**
 * **The turn, after the response has gone out.**
 *
 * Steps 2 through 7 are the ones `sendNinaMessage` used to run inline, moved here verbatim in
 * content and in order. What is new is the bookkeeping around them: the claim opened before the
 * call is closed after her rows land, a `finally` guarantees the row never stays `pending` because
 * of a throw we could see, and a bounded chain answers messages that arrived while this was working.
 *
 * ── IT NEVER THROWS ─────────────────────────────────────────────────────────────────────────
 * There is nobody to throw at. The response left thirteen to forty-five seconds ago. Every failure
 * mode ends in a closed `nina_turns` row with a reason on it and a warning in the log, which is
 * what the ledger is for.
 */
async function runNinaBackgroundTurn(input: NinaBackgroundTurnInput): Promise<void> {
  const { userId, sessionId, turnId, runnerMessageId } = input
  let source: NinaTurnSource = 'unavailable'
  let failure: string | undefined = 'crashed'
  let closed = false
  let bubbles: SentBubble[] = []

  try {
    /*
     * STEP 2 — the two reads, concurrently. `loadNinaContext` reads the recent-20 window and
     * `loadRunHistory` reads the whole reviewed history; both are one `db.batch` over the same
     * bounded table, and running them together makes the duplication cost one round trip of wall
     * clock instead of two. `getReviewedRunsWithChildren` therefore runs twice per turn, which is
     * ACCEPTED at this size: ~200 rows a year, one user. The clean fix is one optional parameter on
     * `loadNinaContext` and it should move together with `lib/insights/load.ts` and
     * `recomputeRecords`, in one card, because all three re-read the same history and all three
     * stop being fine at the same moment.
     *
     * **This runs AFTER his row is committed and that has not changed** — see STEP 1c's note.
     */
    const [loadedContext, history, tuning, shortcuts] = await Promise.all([
      loadNinaContext(userId, sessionId, dbNinaSourceGateway),
      dbNinaToolGateway.loadRunHistory(userId),
      /* THE TUNING, read LIVE on every turn with no cache — which is what makes a slider on
       * `/admin/nina` immediate. Third in an existing `Promise.all` on purpose: one indexed
       * single-row read against a connection this turn is opening anyway. */
      readNinaTuning(userId),
      /* THE SHORTCUTS, read LIVE on every turn with no cache for the same reason and by the same
       * arithmetic — which is what makes a row added on `/admin/shortcuts` fire on his very next
       * message, with no invalidation step anywhere on this path. Fourth in the same `Promise.all`:
       * one `(user_id, enabled)`-indexed read of a table that holds tens of rows, against a
       * connection this turn is opening anyway, so it costs no wall clock the turn was not already
       * spending.
       *
       * **`{ onlyEnabled: true }`, which is the read `nina_shortcuts_user_enabled_idx` exists for.**
       * The bare call returns the disabled rows too, and `/admin/shortcuts` wants those — a
       * disabled code is still a row he edits and re-enables. A turn does not: a disabled row can
       * never fire, so putting it on the wire is bytes for nothing. `matchNinaShortcuts` filters on
       * `enabled` regardless, so "live" still has exactly one definition; this narrows what is
       * fetched, not what counts.
       *
       * **Its rejection is swallowed and the turn continues — INVARIANT 7.** This is the one entry
       * of the four that is garnish. A tuning that will not load is a Nina with the wrong
       * character, and a context that will not load is no turn at all; a shortcut table that will
       * not load is a turn with no shortcut in it, which is what most turns are anyway. Letting it
       * reject would let one unreadable row cost him a reply. */
      listNinaShortcuts(userId, { onlyEnabled: true }).catch((cause) => {
        console.warn('[nina] could not read shortcuts; this turn carries none', {
          turnId,
          error: String(cause),
        })
        return []
      }),
    ])

    /*
     * `sentAtLabel` comes from the context window when the quoted message is in it, and is null
     * when it is not. That is invariant 3 rather than laziness: `'Tue 2 Sep 07:14'` is spelled by
     * `conversationFacts`, and formatting a second one here would make this the app's second
     * authority on how an instant is written.
     */
    const target = input.quotedRow
    const quoted: QuotedMessageInput | null =
      target === null
        ? null
        : {
            id: target.id,
            mine: target.role === 'runner',
            text: target.body,
            sentAtLabel:
              loadedContext.conversation.window.find((turn) => turn.id === target.id)
                ?.sentAtLabel ?? null,
          }

    /*
     * R2. The last few things HE said, newest first, so a shortcut that is still IN PLAY survives
     * the turn that opened it — the `🫦` case in the production ledger, whose expansion reads
     * "…selama miftah bilang terusin … sampe miftah bilang 💦" and is therefore useless if it falls
     * out of the payload the moment he answers it.
     *
     * **No new query.** `loadNinaContext` has already loaded the window, and it is OLDEST FIRST
     * with both roles in it (`ConversationFacts.window`, `lib/nina/context.ts:286`), so this is
     * three array operations over ~40 objects already in memory.
     *
     * Filtered to `role === 'runner'` because an expansion SHE quoted back would otherwise re-fire
     * itself every turn it stayed in the window (assumption A3). `runnerMessageId` is dropped
     * because that message is `input.runnerText`: a trigger in it FIRED, and letting it also count
     * as carried-over would bump one shortcut twice for one send. `reverse()` is safe — `map` has
     * already produced a fresh array, so the window itself is not mutated.
     */
    const recentRunnerTexts = loadedContext.conversation.window
      .filter((turn) => turn.role === 'runner' && turn.id !== runnerMessageId)
      .map((turn) => turn.text)
      .reverse()
      .slice(0, NINA_SHORTCUT_LOOKBACK)

    /* STEP 3 — the turn. 13–45 s. Never throws for a model problem.
     *
     * INVARIANT 5 IS ENFORCED BY THIS ARGUMENT AND NOWHERE ELSE. `imageDescriptions` is TEXT.
     * There is no code path in this file that puts an image part into `runNinaTurn`, and there must
     * never be one: `glm-5.3` answers 200 and silently drops an image block, so sending one is not
     * an error, it is a lie.
     *
     * `toolSet` is `NINA_FULL_TOOL_SET` and `store` is the chat turn's own — the same one-word
     * override idiom, twice. `ninaChatTurnStore` UPDATEs the row opened before the call instead of
     * INSERTing a second one, so `nina_turns` still holds exactly one row per turn; see its header
     * for why it advances the phase rather than closing the row.
     */
    const result = await runNinaTurn(
      {
        userId,
        context: loadedContext,
        tuning,
        history,
        sourceMessageId: runnerMessageId,
        runnerText: input.runnerText,
        imageDescriptions: input.imageDescriptions,
        quoted,
        attachedRunId: input.attachedRunId,
        shortcuts,
        recentRunnerTexts,
      },
      { ...productionDeps(), toolSet: NINA_FULL_TOOL_SET, store: ninaChatTurnStore(turnId) },
    )
    source = result.source

    /*
     * ── R2'S TELEMETRY, AND IT LANDS ABOVE THE EARLY RETURNS ON PURPOSE ──────────────────────
     * `nina_shortcuts.uses` and `last_used_at` answer ONE question on `/admin/shortcuts`: which of
     * these codes does he actually use? A shortcut fired the moment its trigger was in his message
     * and its expansion went into the payload the model was billed for. Deleting the conversation
     * afterwards does not un-fire it, and a reply she failed to produce does not un-fire it either
     * — so counting only the turns that survived to a bubble would make the column a measure of
     * Nina's uptime rather than of his habits, and would under-count exactly the turns that are
     * most annoying to lose. Placing it here also means ONE call site covers all four exits below
     * (`session-gone`, the null payload, the happy path, and a throw) instead of three copies that
     * will drift apart the first time someone edits one of them.
     *
     * **`hits.fired` only, never `inPlay`.** A still-in-play shortcut was counted on the turn it
     * fired; counting it again on every follow-up would make `uses` measure recency, not habit.
     * `runNinaTurn` enforces that split — see `NinaTurnResult.firedShortcutIds`.
     *
     * ── FIRE AND FORGET, AND IT CANNOT REJECT INTO THE TURN. INVARIANT 7. ────────────────────
     * `void` with its own `.catch`, not an `await`. A usage counter is not worth one round trip of
     * wall clock on a path that has just spent 13-45 s, and it is certainly not worth failing a
     * turn for. `after()` was the other candidate and was declined: we are already inside one, and
     * `tests/nina.resend.test.ts` drains `after`'s queue by hand and asserts its length, so a
     * second entry would change what that suite measures.
     */
    if (result.firedShortcutIds.length > 0) {
      void bumpNinaShortcutUses(userId, result.firedShortcutIds).catch((cause) => {
        console.warn('[nina] shortcut usage bump failed', { turnId, error: String(cause) })
      })
    }

    /*
     * ── THE SESSION MAY HAVE BEEN DELETED WHILE SHE WAS THINKING (phase 6's handoff) ──────────
     * Up to `NINA_BACKGROUND_BUDGET_MS` has passed since the response went out, and
     * `removeNinaSession` is one tap away in the sidebar the whole time. Every write below is a
     * write into a conversation that may no longer exist:
     *
     *   · her bubbles — `insertNinaMessages` already degrades to `[]` here, so this is belt;
     *   · **the distillation** — `nina_memory_facts` / `nina_memory_slots` rows stamped with a
     *     `source_message_id` whose row the cascade has already destroyed. That is precisely the
     *     orphan class phase 6 purges, re-created milliseconds after the purge ran, and it is the
     *     one that actually reaches her: `loadNinaContext` reads the session's message window but
     *     the WHOLE relationship's memory ledger, so an orphaned fact is permanent pollution;
     *   · the auto-title — naming a row that is gone.
     *
     * One indexed owner-scoped read answers it. Cheap on a path that has just spent 13-45 s on a
     * model call, and it sits HERE — immediately after the model returns and before anything is
     * persisted — so it runs ONCE per turn and covers both exits below, rather than once per write.
     *
     * ABANDONING IS THE WHOLE RESPONSE. Nothing is written, nothing is retried, nothing is
     * re-homed into another conversation — a reply to a conversation he deleted does not belong in
     * the one he kept. The claim is closed with a reason (`'session-gone'`) in the `finally`, so
     * the ledger says what happened and no sweep has to guess.
     */
    if (!(await ninaSessionExists(userId, sessionId))) {
      console.warn('[nina] session was deleted mid-turn; abandoning', { turnId, sessionId })
      failure = 'session-gone'
      return
    }

    if (result.payload == null) {
      /*
       * She could not answer, but HE still spoke, and R4 is "every single thing". His message is
       * persisted with an id, so distilling it is both possible and the honest reading of the
       * requirement — a turn where she failed is not a turn where he said nothing.
       *
       * **No bubble is written.** `runNinaTurn`'s silence is silence; app-authored prose in her
       * mouth is what invariant 7 and `ChatScreen`'s header forbid. The screen says so in its own
       * voice, through the 'no-reply' notice, once the poll sees the turn close with nothing new.
       */
      failure = undefined
      await closeNinaChatTurn(userId, turnId, source)
      closed = true
      await runNinaDistillation({
        userId,
        runnerText: input.runnerText ?? '',
        sourceMessageId: runnerMessageId,
        ninaBubbles: [],
        memoryWrites: [],
        context: loadedContext,
        relationship: tuning.relationship,
      })
      return
    }

    /*
     * STEP 4 — `replyToMessageId`, re-checked against rows this user owns. The model produced this
     * id, and a well-formed id is not proof of ownership (the Server Actions guide's own warning).
     * The context window she was given is the authoritative list of what she could legitimately be
     * answering, so it is also the cheapest check — no extra query.
     */
    const ownedIds = new Set(loadedContext.conversation.window.map((turn) => turn.id))
    const replyToId =
      result.payload.replyToMessageId != null && ownedIds.has(result.payload.replyToMessageId)
        ? result.payload.replyToMessageId
        : null

    /*
     * STEP 5 — one row per bubble (RU-5), in ONE multi-row `INSERT`.
     *
     * **Emission order comes free**, because Postgres evaluates `nextval` once per row in `VALUES`
     * order — the first bubble gets the lower `seq`, always. It is one round trip instead of four
     * and it is atomic, so a half-written four-bubble reply can no longer come from a partial
     * insert. `replyToId` goes on the FIRST bubble only: a four-bubble reply is one answer to one
     * message, and quoting the same message four times would render four identical quote headers.
     *
     * ── `turnId` IS NOW STAMPED, AND IT WAS NOT BEFORE ──────────────────────────────────────────
     * `nina_messages.turn_id`'s own schema comment says "Phase 3 stamps it onto every message the
     * turn emitted", and the analysis measured **0 of 48 rows carrying one** — because the row did
     * not exist until after the messages were written. Opening the turn first is what makes the
     * documented contract satisfiable, so it is satisfied here rather than left as a second gap.
     * Nothing renders it; it is the audit join, and the column carries no foreign key precisely so
     * that it can never block a delete.
     */
    const rows = await insertNinaMessages(
      userId,
      result.payload.bubbles.map((body, index) => ({
        role: 'nina' as const,
        body,
        turnId,
        replyToId: index === 0 ? replyToId : null,
      })),
      /* The same session his message went into. She is answering in the conversation she was asked
       * in; there is no case in which a reply belongs anywhere else. */
      sessionId,
    )
    bubbles = rows.map((row) => ({ id: row.id, body: row.body, replyToId: row.replyToId }))

    /*
     * The claim drops HERE — after her rows are committed and not one statement earlier. The poll
     * asks two questions of the server ("is a turn in flight" and "is there anything after my
     * cursor"), and closing the claim before the rows exist would let a poll land in the gap and
     * read a true "no" to both, raising 'no-reply' for a reply that was mid-insert. See
     * `ninaChatTurnStore`'s header.
     */
    failure = undefined
    await closeNinaChatTurn(userId, turnId, source)
    closed = true

    /*
     * STEP 6 — the distillation (R4). AWAITED here rather than scheduled in a nested `after()`,
     * and the change is a simplification rather than a reversal. The original reason for `after()`
     * was that awaiting a 10-20 s model call would leave him "watching an idle screen after the
     * bubbles have landed" — but there is no screen waiting on this function at all any more; the
     * response went out before the turn even started. Both forms run inside the same segment budget
     * (`after` is the platform's `waitUntil`, not a new invocation), so nesting would buy nothing
     * and would make the ordering against the chain below unpredictable.
     *
     * `runTurnDistillation` never throws, so there is no `try` around it and nothing to swallow.
     */
    await runNinaDistillation({
      userId,
      runnerText: input.runnerText ?? '',
      sourceMessageId: runnerMessageId,
      ninaBubbles: bubbles.map((bubble) => bubble.body),
      memoryWrites: result.payload.memoryWrites ?? [],
      context: loadedContext,
      relationship: tuning.relationship,
    })

    /*
     * STEP 7 — the session's name (R3). **This exit and no other**: R3's trigger is "the first
     * interaction (user then nina)", and this is the only path on which both rows exist.
     * `titleNinaSessionIfNeeded` never throws and makes no call at all for a session that already
     * has a name; its idempotence is `setNinaSessionTitleIfUntitled`'s `WHERE … AND title IS NULL`,
     * not this line's, so two racing tabs are already handled.
     */
    await titleNinaSessionIfNeeded(userId, sessionId)
  } catch (cause) {
    console.warn('[nina] background turn failed', { turnId, error: String(cause) })
  } finally {
    /*
     * The row must never be left `pending` by a throw we were in a position to see. If it is, the
     * only thing that closes it is the 90-second sweep — which is correct but slow, and the screen
     * spends that whole time showing a typing indicator for a turn that is already dead.
     * `closeNinaChatTurn`'s own `WHERE status = 'pending'` makes this a no-op when the happy path
     * already closed it, so the `closed` flag is belt to that brace rather than the guard itself.
     */
    if (!closed) {
      try {
        await closeNinaChatTurn(userId, turnId, source, failure ?? 'crashed')
      } catch (cause) {
        console.warn('[nina] could not close a chat turn', { turnId, error: String(cause) })
      }
    }
  }

  /*
   * ── THE CHAIN: MESSAGES THAT ARRIVED WHILE SHE WAS TYPING ────────────────────────────────────
   * This is the other half of `openNinaChatTurn` refusing a second claim. A burst — "eh", "nina",
   * "gimana", which is exactly how this app gets used — persists three rows and starts ONE turn.
   * The second and third messages would otherwise sit unanswered until he sent a fourth.
   *
   * So when this turn is done, it asks one indexed question: is the newest row in this conversation
   * his? If it is, it opens a fresh claim and runs one more turn for it. That turn's context
   * contains every message of the burst AND her reply to the first, so she answers the remainder
   * coherently instead of four times in parallel.
   *
   * BOUNDED TWICE, because an unbounded chain is a machine for spending money: by `depth` against
   * `NINA_TURN_CHAIN_MAX`, and by wall clock against `NINA_BACKGROUND_BUDGET_MS` measured from the
   * original send. The wall-clock bound is what makes this correct under BOTH of phase 2's
   * outcomes: with a 60 s ceiling the budget is exhausted after the first link and the chain simply
   * does not start, with no code change beyond the two literals `turnflight.ts` documents.
   *
   * Hitting either bound loses nothing. The unanswered messages are still in the database, still in
   * her next context window, and his next send starts a turn that sees all of them.
   */
  if (input.depth >= NINA_TURN_CHAIN_MAX) return
  if (Date.now() - input.startedAtMs >= NINA_BACKGROUND_BUDGET_MS - NINA_TURN_BUDGET.overall) return

  try {
    /* The same guard as above, on the chain. `listNinaMessages` against a deleted session already
     * returns `[]` so this would exit anyway — but exiting BY ACCIDENT is not the same as exiting
     * on purpose, and the next reader should not have to derive the safety from a second file. */
    if (!(await ninaSessionExists(userId, sessionId))) return

    const [newest] = await listNinaMessages(userId, { limit: 1, sessionId })
    if (newest == null || newest.role !== 'runner') return

    const nextTurnId = await openNinaChatTurn(userId, {
      sessionId,
      runnerMessageId: newest.id,
      depth: input.depth + 1,
    })
    if (nextTurnId === null) return

    /*
     * A DIRECT `await`, not another `after()`. We are already inside the background task's budget,
     * and nesting would add a scheduling hop without adding a second of wall clock —
     * `NINA_BACKGROUND_BUDGET_MS` is the segment's, not the callback's.
     *
     * `imageDescriptions: []` and `quotedRow: null` are correct rather than lossy. Those two inputs
     * describe what is attached to THIS message right now; the photographs themselves reach her
     * through `loadNinaContext`, which reads `nina_messages` joined to `nina_message_images` for
     * the whole window (see STEP 1b's note in `sendNinaMessage`). So she can still see a photo sent
     * mid-burst. A quote is genuinely absent: the runner armed it against a send that has already
     * been answered, and re-quoting it on a follow-up would put the same quote header on two turns.
     */
    await runNinaBackgroundTurn({
      userId,
      sessionId,
      turnId: nextTurnId,
      runnerMessageId: newest.id,
      runnerText: newest.body.length > 0 ? newest.body : null,
      imageDescriptions: [],
      quotedRow: null,
      attachedRunId: newest.runId,
      depth: input.depth + 1,
      startedAtMs: input.startedAtMs,
    })
  } catch (cause) {
    console.warn('[nina] chained turn failed', { turnId, error: String(cause) })
  }
}

/**
 * **R5: re-run the turn for a message that is already on the server.**
 *
 * > *"sometimes, user chat message is left unanswered. add option to resend as well (just for
 * > user's bubble)"*
 *
 * A turn can die silently — the invocation is killed, the segment's ceiling cuts it off — and
 * `sweepStaleNinaChatTurns` closes the claim ninety seconds later. What is left is a persisted
 * runner row with no answer, and until this action there was no way to ask again except retyping
 * the sentence, which writes a second copy of it into the conversation Nina reads as context.
 *
 * ── IT IS `sendNinaMessage` FROM STEP 1c ONWARD, AND NOTHING BEFORE IT ────────────────────────
 * Sweep, open a claim, hand the turn to `after()`. Every step above STEP 1c on the send path exists
 * to turn an untrusted request into a persisted row — validation, ticket verification, the reply
 * target, the run, the session, the INSERT — and all of it has already happened for this message.
 * So this action re-derives the turn's INPUT from the row instead of from a request, and writes
 * nothing.
 *
 * ── INVARIANT 7 IS THE WHOLE POINT: THERE IS NO `insertNinaMessages` HERE ─────────────────────
 * Not a nearly-empty one, not a conditional one. A second copy of his sentence on screen — and in
 * the 40-row window `getNinaMessageWindow` hands her on every later turn — is a failed feature, and
 * it is the one failure the user would notice immediately. `tests/nina.resend.test.ts` asserts the
 * two insert functions are never reached by this action's own body.
 *
 * ── NO MODEL CALL IS ADDED (INVARIANT 5) ─────────────────────────────────────────────────────
 * The descriptions this hands her were paid for once, by `describeNinaImage` on the composer's
 * upload path or by `describeNinaImages` in `after()`. Nothing is re-described, nothing is
 * re-uploaded, and `scripts/check-llm-payload-boundary.mjs` gains no entry: `lib/nina/actions.ts`
 * is already the sanctioned call site for every model-calling symbol the background turn reaches.
 *
 * ── THE BUDGET PAIRING IS INHERITED, NOT RE-ARGUED ───────────────────────────────────────────
 * This calls `startNinaBackgroundTurn`, whose docstring carries it: a Server Action's timeout is
 * the invoking page segment's, `after()` runs for that same budget, and `app/nina/page.tsx` carries
 * `export const maxDuration = 300`. This action ships in the same module and is reached from the
 * same segment, so `NINA_BACKGROUND_BUDGET_MS` means here exactly what it means on the send path.
 * Do not relocate it into a route handler that does not carry 300 — that is a silent truncation.
 */
export type NinaResendRefusal =
  /** Malformed id, not his, or gone. "Not his" and "not there" are one answer, by this file's rule. */
  | 'not-found'
  /** It is one of HER bubbles. The sheet never offers it; a control is not a guard. */
  | 'not-mine'
  /** No text, no photo, no run — nothing for her to answer. See the guard below for how that happens. */
  | 'empty'
  /**
   * A turn already owns this conversation, so the message is going to be answered anyway.
   *
   * **This is where a resend and a send part company.** On the send path a null `turnId` is the
   * ordinary burst case and reporting it as a failure would mark a perfectly persisted message as
   * failed. Here there is nothing new to persist, so a null is the only thing that happened, and
   * saying so is the difference between a runner who waits and a runner who taps again.
   */
  | 'turn-live'
  /** The claim could not be opened. The row is untouched; one more tap is the whole recovery. */
  | 'failed'

export interface ResendNinaMessageResult {
  ok: boolean
  /** The `nina_turns.id` this resend opened. Null on every refusal. */
  turnId: string | null
  /**
   * **`nina_messages.seq` of the newest row in this conversation when the resend was accepted** —
   * where `pollNinaReply` must resume from. Null on every refusal.
   *
   * NOT the resent row's own `seq`, and the difference is a duplicated bubble.
   * `listNinaMessagesAfter`'s predicate is `seq > afterSeq`, and `pollNinaReply` returns HER rows
   * from that set — so a cursor pointing at the resent message would re-deliver every bubble of
   * hers that already sits between it and the client's real position, and the reveal would repaint
   * them. The newest `seq` is `>=` everything the client can be holding, and her answer to this
   * resend is inserted strictly above it, so the first poll asks for exactly the new set.
   *
   * The client applies it as `Math.max(cursorRef.current, cursor)`, which is not belt-and-braces:
   * a poll can legitimately be in flight when a resend is accepted, and the fallback below can
   * return a value behind the client's position.
   */
  cursor: number | null
  reason: NinaResendRefusal | null
}

/** One shape for every refusal, so a caller has one branch and no `undefined`. */
function resendRefused(reason: NinaResendRefusal): ResendNinaMessageResult {
  return { ok: false, turnId: null, cursor: null, reason }
}

export async function resendNinaMessage(input: {
  messageId: string
}): Promise<ResendNinaMessageResult> {
  /* FIRST, above any use of an argument. A Server Action is an untrusted POST endpoint whether or
   * not a button exists for it — `messageActions.ts`'s four-line rule, unchanged. */
  const userId = await requireUserId()

  /* A `/nina` id that cannot be one of ours should never reach the database. An optimistic
   * `local-…` id lands here too, and `canResendMessage` has already refused it on the client; this
   * is the server half of the same rule, not a substitute for it. */
  if (!isValidId(input?.messageId)) return resendRefused('not-found')

  /*
   * OWNER-SCOPED, so a foreign id comes back as `[]` and "not his" is indistinguishable from "not
   * there" — invariant 4, and the same read `editNinaMessage` opens with. It also hands over
   * everything the turn input needs: `sessionId`, `body`, `replyToId`, `runId` and `seq` are all in
   * `messageColumns`.
   */
  const [row] = await getNinaMessagesByIds(userId, [input.messageId])
  if (row === undefined) return resendRefused('not-found')
  /* R5 is "just for user's bubble". Re-running a turn for one of HER rows would ask her to answer
   * herself, and `runNinaBackgroundTurn` would stamp the reply's `reply_to_id` at a bubble of her
   * own. The sheet does not offer it; this refuses it anyway. */
  if (row.role !== 'runner') return resendRefused('not-mine')

  /*
   * HIS PHOTOS, AND WHY THEY ARE READ RATHER THAN ASSUMED ABSENT.
   *
   * `runNinaBackgroundTurn`'s own chain passes `imageDescriptions: []` and argues the photographs
   * reach her through `loadNinaContext`. They do not: `lib/nina/gateway.ts:164` hardcodes
   * `imageDescriptions: []` for every window row. That gap is real and is out of scope for this
   * set — it changes what she knows in every conversation — so this path carries the descriptions
   * itself, exactly as `sendNinaMessage` does, and the substitution is the same one: a row whose
   * description is null becomes `NINA_DESCRIPTION_UNAVAILABLE`, which tells her honestly that her
   * eyes failed on that one rather than letting her invent what was in it (invariant 5: text, never
   * an image part).
   *
   * `getNinaMessageImagesForMessages` is ordered by `sort_order`, which is the order the bubble
   * renders them in, so she is told about them in the order he sees them.
   */
  const images = await getNinaMessageImagesForMessages(userId, [row.id])

  /*
   * `sendNinaMessage`'s floor, asked of the ROW instead of of the request. `null` for an empty body
   * is what the send path passes and what `runNinaTurn` expects; the empty string would read as a
   * message he sent with no words when in fact he sent a photograph.
   *
   * The refusal below is REACHABLE, and not by any client bug: `removeChatPhotoAction` deletes only
   * the image row when `isNinaPhotoCarrierMessage` is false, and that predicate is false for every
   * runner row — so an operator removing the photo from a caption-less message of his leaves
   * exactly this state. Handing `glm-5.3` a turn with nothing in it would spend money to be told
   * nothing; refusing names the state instead.
   */
  const runnerText = row.body.trim().length > 0 ? row.body : null
  if (runnerText === null && images.length === 0 && row.runId === null) {
    return resendRefused('empty')
  }

  /*
   * The quote, re-resolved. Same shape and same degradation as STEP 0b of the send path: a target
   * that has since been deleted (`reply_to_id` is `ON DELETE SET NULL`, so this is already null in
   * that case) or that a scoped read cannot see becomes "no quote", and the resend still happens.
   * The alternative — refusing because the message he was answering is gone — would withhold the
   * answer to his message over a missing quote header.
   */
  let quotedRow: NinaMessageRow | null = null
  if (row.replyToId !== null) {
    try {
      const found = await getNinaMessagesByIds(userId, [row.replyToId])
      quotedRow = found[0] ?? null
    } catch (cause) {
      console.warn('[nina] could not resolve the reply target for a resend', {
        error: String(cause),
      })
    }
  }

  /*
   * THE SWEEP, and on this path it is closer to the point than it is on the send path. The most
   * common reason a message is sitting unanswered is a turn that died; its claim stands until
   * something closes it, and `openNinaChatTurn` below is what needs it gone. It can never cost the
   * caller: `openNinaChatTurn` applies `NINA_TURN_STALE_MS` itself, so an expired claim does not
   * block a new one even when this fails — the sweep is what makes the LEDGER honest about it.
   */
  try {
    await sweepStaleNinaChatTurns(userId)
  } catch (cause) {
    console.warn('[nina] chat turn sweep failed on a resend', { error: String(cause) })
  }

  let turnId: string | null = null
  try {
    turnId = await openNinaChatTurn(userId, {
      /* HIS row's session, read off the row. Never a client-supplied one: she answers in the
       * conversation she was asked in, and there is no case in which a reply belongs anywhere
       * else. */
      sessionId: row.sessionId,
      runnerMessageId: row.id,
      /* 0 — this is a turn a runner asked for, not a chained follow-up. The chain's own bound is
       * `NINA_TURN_CHAIN_MAX` and it is measured from here, exactly as a send's is. */
      depth: 0,
    })
  } catch (cause) {
    console.warn('[nina] could not open a chat turn for a resend', { error: String(cause) })
    return resendRefused('failed')
  }
  /* See `NinaResendRefusal['turn-live']`: on a send this is the ordinary outcome, here it is the
   * only thing that happened. */
  if (turnId === null) return resendRefused('turn-live')

  /*
   * THE CURSOR. One indexed single-row read — the same one `pollNinaReply` issues — and it is read
   * AFTER the claim is open on purpose: from here to the end of this function nothing writes to
   * `nina_messages`, because `startNinaBackgroundTurn` only REGISTERS the turn and `after()` does
   * not run until the response has gone out. So the newest row now is the newest row the client can
   * be holding, and her answer will sit strictly above it.
   *
   * A failed read degrades to the resent row's own `seq` rather than refusing: his turn is already
   * claimed and about to run, and losing that over a cursor read would be the worse outcome. The
   * client's `Math.max` is what makes the degradation harmless.
   */
  let cursor: number
  try {
    const [newest] = await listNinaMessages(userId, { limit: 1, sessionId: row.sessionId })
    cursor = newest?.seq ?? row.seq
  } catch (cause) {
    console.warn('[nina] could not read the resend cursor', { error: String(cause) })
    cursor = row.seq
  }

  /*
   * The turn, rebuilt field by field from the row. Spelled out rather than spread from anything,
   * because every field has a reason and `tsc` should be what notices if `NinaBackgroundTurnInput`
   * ever gains one this path forgot.
   */
  startNinaBackgroundTurn({
    userId,
    sessionId: row.sessionId,
    turnId,
    runnerMessageId: row.id,
    runnerText,
    imageDescriptions: images.map((image) => image.description ?? NINA_DESCRIPTION_UNAVAILABLE),
    quotedRow,
    attachedRunId: row.runId,
    depth: 0,
    /* NOW, not the message's `created_at`. This is the wall clock the chain and the background
     * budget are measured against, and the message may be a day old — dating the budget from it
     * would exhaust it before the first link ran. */
    startedAtMs: Date.now(),
  })

  return { ok: true, turnId, cursor, reason: null }
}

export interface NinaReplyPoll {
  ok: boolean
  /**
   * **"Is there a message of his that has not been answered yet?"** — the client's whole stop
   * condition, in one boolean, answered by the server so the screen never has to guess.
   *
   * TRUE while a `nina_turns` chat claim is live for this conversation, and ALSO true in the
   * hand-off gap where one chained turn has closed and the next has not yet opened — because the
   * second disjunct is "the newest row is his and it is fresh", which is exactly what is true in
   * that gap. Without the disjunct the screen would stop polling for a quarter of a second and miss
   * the whole of a chained reply.
   */
  awaiting: boolean
  /** Her new bubbles since `afterSeq`, oldest first. Empty while she is still thinking. */
  bubbles: SentBubble[]
  /** The cursor to send next time. Unchanged from the input when nothing new arrived. */
  cursor: number
}

/**
 * **How an open tab learns that Nina has answered (F36 R6).**
 *
 * ── WHY A POLL AND NOT THE PUSH SEAM THAT ALREADY EXISTS ─────────────────────────────────────
 * `lib/nina/live.ts`'s `SW_MESSAGE_TYPE = 'nina:new'` and `lib/service-worker.js`'s
 * `notifyOpenWindows` are a real, shipped wake-up channel, and this phase leaves them completely
 * untouched: a proactive push still refreshes the screen exactly as it does today. They are the
 * wrong mechanism for THIS path, for two independent reasons.
 *
 *   1. **A push must show a notification.** The service worker's own comment records the platform
 *      rule — a `push` handler that shows nothing "counts against the app's push budget" on iOS —
 *      so the worker cannot suppress the tray for a tab the runner is staring at. Pushing every
 *      chat reply would buzz his phone for every message he sends while watching the screen. That
 *      is a worse app than the one he has.
 *   2. **A push arrives as `router.refresh()`, which hands down a whole new `initial` and lands
 *      through `mergeServerMessages` — in ONE frame.** RU-5's staggered reveal is a sequence of
 *      `setState` calls separated by real time, and `ChatScreen`'s header spends a paragraph on why
 *      it must not be collapsed. Delivering four bubbles at once is precisely that collapse. The
 *      poll returns the bubbles as DATA, so `planReveal` still runs on them.
 *
 * ── AND A CLOSED TAB NEEDS NOTHING AT ALL ────────────────────────────────────────────────────
 * Say it plainly, because it is the part of R6 people build for twice: her rows are committed by
 * the background task, `app/nina/page.tsx` reads them with `listNinaMessages` on the next render,
 * and they are simply there. No queue, no replay, no reconnection. The only thing the tab being
 * closed changes is that nobody is watching, and the requirement is that this does not matter.
 *
 * ── COST ─────────────────────────────────────────────────────────────────────────────────────
 * ONE round trip: three indexed reads issued together. Against the measured 13-16 s turn the
 * backoff spends about nine of them, and it stops the instant `awaiting` goes false.
 * `lib/extract/constants.ts` is the precedent — a polled 34 s job with the same shape.
 *
 * ── IT IS AN UNTRUSTED POST ENDPOINT LIKE EVERY OTHER ACTION ─────────────────────────────────
 * `requireUserId()` first; `sessionId` is shape-checked and then proved by `messageScope`'s
 * `user_id AND session_id` predicate, so a forged id returns `[]` rather than another
 * conversation. It writes nothing except, on the rare expired-claim path, the sweep's own
 * conditional UPDATE.
 */
export async function pollNinaReply(input: {
  sessionId: string | null
  afterSeq: number
}): Promise<NinaReplyPoll> {
  const userId = await requireUserId()

  const afterSeq = Number.isFinite(input?.afterSeq) ? Math.max(0, Math.floor(input.afterSeq)) : 0
  const sessionId =
    typeof input?.sessionId === 'string' && isValidId(input.sessionId) ? input.sessionId : null
  /* No conversation, nothing to wait for. Reachable for a runner who has never messaged. */
  if (sessionId === null) return { ok: true, awaiting: false, bubbles: [], cursor: afterSeq }

  let fresh: NinaMessageRow[]
  let newestRows: NinaMessageRow[]
  let pending: Awaited<ReturnType<typeof getPendingNinaChatTurn>>
  try {
    /* Three indexed reads, one round trip. Spelled as three separate `let`s and a plain tuple
     * destructure rather than a nested pattern, so `tsc` infers each element rather than widening
     * the tuple to a union of the three row shapes. */
    ;[fresh, newestRows, pending] = await Promise.all([
      listNinaMessagesAfter(userId, { sessionId, afterSeq }),
      listNinaMessages(userId, { limit: 1, sessionId }),
      getPendingNinaChatTurn(userId, sessionId),
    ])
  } catch (cause) {
    console.warn('[nina] reply poll failed', { error: String(cause) })
    /* `ok: false` and `awaiting: true`: a poll that could not read the database has learned
     * NOTHING, and reporting "she is not answering" would be a claim it cannot make. The client
     * treats this as "try again", and its own give-up at `NINA_TURN_POLL_GIVE_UP_MS` is what stops
     * a database outage from polling for ever. */
    return { ok: false, awaiting: true, bubbles: [], cursor: afterSeq }
  }

  const newest = newestRows[0] ?? null
  const now = Date.now()
  const expired = pending !== null && now - pending.createdAt.getTime() >= NINA_TURN_STALE_MS
  if (expired) {
    /*
     * The claim outlived its deadline, so the process behind it is gone. Close it HERE rather than
     * only on his next send: this is the moment the screen is asking, and `lib/extract`'s own note
     * is the argument — "the poll that gives up is the poll that closes the row, so the runner's
     * last request is the one that makes the state honest". One conditional UPDATE, on the rare
     * path only, and never on the ~29 healthy polls of a turn that is simply still running.
     */
    try {
      await sweepStaleNinaChatTurns(userId, new Date(now))
    } catch (cause) {
      console.warn('[nina] chat turn sweep failed in poll', { error: String(cause) })
    }
  }

  const live = pending !== null && !expired
  /*
   * The two disjuncts. `live` is authoritative and covers a turn that is running. The message
   * predicate covers the hand-off gap between two chained turns, and it is the SAME pure function
   * `app/nina/page.tsx` uses for its cold-load heuristic — one definition of "unanswered", asserted
   * in `lib/nina/turnflight.test.ts`, so the screen and the server cannot come to disagree.
   */
  const awaiting = live || ninaAwaitingByMessage(newest, now)

  /*
   * HER bubbles only. His own rows come back from `listNinaMessagesAfter` too — a second tab may
   * have sent one — and appending them here would duplicate a bubble the sending tab already has
   * optimistically. The other tab gets them the way it always has, on the next server render.
   */
  const hers = fresh.filter((row) => row.role === 'nina')

  return {
    ok: true,
    awaiting,
    bubbles: hers.map((row) => ({ id: row.id, body: row.body, replyToId: row.replyToId })),
    /* The cursor advances past EVERY row read, not just hers, so a message from another tab is not
     * re-read on every subsequent poll. */
    cursor: fresh.length === 0 ? afterSeq : (fresh[fresh.length - 1]?.seq ?? afterSeq),
  }
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
   * requested one — 12 + 1 + 30 = 43, measured — which `NINA_CHAT_STORED_ID_RE` admits as its own
   * group. `NINA_CHAT_ID_RE` is the requested half only and is `{12}` exactly; a single range
   * covering both is what refused every upload this route ever saw.
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
 * One identical distillation pass for the two exit paths of the background turn.
 *
 * **The `after()` that used to be here moved to `startNinaBackgroundTurn`, which now wraps the
 * whole turn (F36 R6).** Wrapping this again would be an `after()` inside an `after()` for no
 * budget gain — both forms run inside the same segment budget, because `after` is the platform's
 * `waitUntil` rather than a new invocation — and it would make the ordering against
 * `runNinaBackgroundTurn`'s chain unpredictable. Its two call sites are both in that function, and
 * both already sit after the response has gone out.
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
async function runNinaDistillation(input: {
  userId: string
  runnerText: string
  sourceMessageId: string
  ninaBubbles: readonly string[]
  memoryWrites: readonly NinaMemoryWrite[]
  context: NinaContext
  /*
   * F33 / R6, the sweep: the librarian is told what she is SET to be, so the couple's own register
   * — "yang", "sayang", "bestie" — is recognised as the register and not filed as a standing fact
   * about him. It rides the input and never `context`: `NinaContext` is serialised into the USER
   * turn and is documented as the boundary of everything she may know (plan invariant 3).
   */
  relationship: NinaRelationship
}): Promise<void> {
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
    relationship: input.relationship,
  })
}
