import {
  and,
  asc,
  desc,
  eq,
  inArray,
  isNotNull,
  isNull,
  notExists,
  or,
  sql,
  type SQL,
} from 'drizzle-orm'

import { db } from '@/lib/db'
import { ninaAvatars, ninaMessageImages, ninaMessages, type NinaImageKind } from '@/lib/db/schema'
import { newId } from '@/lib/id'
import { NINA_CHAT_PHOTO_PAGE_SIZE } from '@/lib/nina/album'
import {
  normalizeClaimedPerceptualHash,
  normalizeClaimedPerceptualSig,
} from '@/lib/nina/perceptual'
import { isValidContentHash } from '@/lib/photos/contentHash'
import type { NinaImageInsert, NinaImageRow, NinaMediaPage } from './shapes'
import { imageColumns } from './columns'

/**
 * Nina's photographs in the conversation: the write path, every read, the dedup finders, the
 * two collection scopes, the Media view, and the admin's replace/remove/describe side.
 *
 * Split out of `lib/nina/queries.ts` on 2026-09-12. Origin sections, in file order:
 *   - §5 Images — `hasProactiveMessageForRun`, `insertNinaMessageImages`,
 *     `adoptNinaMessageImage`, `listNinaMessageImages`, `getNinaMessageImage`,
 *     `getNinaMessageImagesForMessages`, `findNinaImageByContentHash`,
 *     `findNinaSignedOriginals`, `countNinaChatPhotos`, plus the two helpers this split
 *     EXPORTS — `isOriginalPhoto` and `generatedChatPhotoScope`: internal — shared with
 *     sibling query modules (phase 7's imageprefs module needs `generatedChatPhotoScope`
 *     across the boundary; the plan index's Decisions export both helpers for it). They
 *     surface through the barrel's `export *` — accepted and documented there.
 *   - §5a-2 The Media view — `countNinaMediaPhotos`, `listNinaMediaPhotos`, plus the
 *     module-private `mediaCollectionScope`
 *   - §5b Conversation photographs — the admin write side: `NinaChatPhotoBlobPatch`,
 *     `updateNinaChatPhotoBlob`, `deleteNinaMessageImage`, `isBlobPathnameReferenced`,
 *     `setNinaMessageImageDescription`, `updateNinaChatPhotoDescription`
 *
 * Banner prose moved byte-identical apart from the two `export ` keywords added to the helpers
 * above and two §-pointer rewrites where prose named §9 (`getNinaAvatar`'s and
 * `setNinaAvatarDescription`'s doc-comments — that section becomes
 * `lib/nina/queries/avatars.ts` in phase 6). The §5↔§5a-2↔§5b mentions stay as written: all
 * three sections landed here together, so the provenance header above keeps them resolvable.
 *
 * The layer-wide rules the banners cite — userId scoping, never writing `runs`, `db.batch`
 * over `db.transaction`, the `ORDER BY seq` note, the deliberate lack of `server-only` — stay
 * on `lib/nina/queries.ts`'s header. This module inherits those rules; it does not restate
 * them.
 *
 * Imports foundation-wards only (`./shapes`, `./columns`, `@/lib/*`) — never the barrel
 * `@/lib/nina/queries`, which re-exports this module.
 */
/* ============================================================================
 * §5 Images
 * ==========================================================================*/

/**
 * **Phase 10, trigger 1's idempotence marker**, asked as a question rather than as a count: has a
 * `run_committed` message ever been written *for this run*?
 *
 * A `LIMIT 1` existence check, because the answer is boolean and the row may be one of four —
 * RU-5's multi-bubble turn writes one row per bubble and they all carry the same `source` and the
 * same `run_id`. Two tabs committing the same extraction, or a retried `after()`, must not produce
 * two reactions to one run, and this is the durable thing that says so: a serverless invocation
 * has no memory of the previous one, so the marker has to be a row.
 */
export async function hasProactiveMessageForRun(userId: string, runId: string): Promise<boolean> {
  const rows = await db
    .select({ id: ninaMessages.id })
    .from(ninaMessages)
    .where(
      and(
        eq(ninaMessages.userId, userId),
        eq(ninaMessages.runId, runId),
        eq(ninaMessages.source, 'run_committed'),
      ),
    )
    .limit(1)
  return rows.length > 0
}

/**
 * Phase 6 writes uploads, phase 12 writes generations. `messageId` is checked against the
 * caller's own messages first: the FK only proves the message EXISTS, and an attacker-supplied
 * message id that exists is exactly what invariant 7 is about. One extra statement, and it is
 * the only place in this file where a write validates a foreign key by hand.
 */
export async function insertNinaMessageImages(
  userId: string,
  rows: readonly NinaImageInsert[],
): Promise<NinaImageRow[]> {
  if (rows.length === 0) return []

  const messageIds = [...new Set(rows.map((row) => row.messageId))]
  const owned = await db
    .select({ id: ninaMessages.id })
    .from(ninaMessages)
    .where(and(eq(ninaMessages.userId, userId), inArray(ninaMessages.id, messageIds)))

  if (owned.length !== messageIds.length) return []

  const inserted = await db
    .insert(ninaMessageImages)
    .values(
      rows.map((row) => ({
        id: newId(),
        userId,
        messageId: row.messageId,
        kind: row.kind,
        blobUrl: row.blobUrl,
        pathname: row.pathname,
        width: row.width ?? null,
        height: row.height ?? null,
        bytes: row.bytes ?? null,
        description: row.description ?? null,
        prompt: row.prompt ?? null,
        /*
         * F37 R1/R3. Coalesced rather than spread, so the column appears in EVERY insert this
         * function builds — an original binds NULL, a reference binds an id, and the statement
         * has one shape. The foreign keys are what make an id here safe to trust: the only writer
         * that supplies one has already read the row it names, owner-scoped, in the same request.
         */
        sourceAvatarId: row.sourceAvatarId ?? null,
        sourceImageId: row.sourceImageId ?? null,
        /*
         * media-dedupe P1. Coalesced through the validator rather than trusted, for the same
         * one-shape reason as the two columns above — and because the value is a CLIENT CLAIM on
         * the upload path (invariant 9): a claim that is not 64 lowercase hex binds NULL, dedup
         * goes inactive for that row, and the send does not fail. Since P2 (2026-09-10),
         * `lib/nina/dedupe.ts`'s `ninaUploadInsertRow` is the one caller that sends one — on a
         * fresh upload's own row only; its reference rows deliberately carry none (see that
         * file's header for why).
         */
        contentHash: isValidContentHash(row.contentHash) ? row.contentHash : null,
        /*
         * media-dedupe follow-up. The perceptual pair coalesces through the one parsers
         * (`lib/nina/perceptual.ts`) for the same one-shape reason as the hash above: a claim that
         * fails its format binds NULL — dedup inactive for that row — and the send does not fail.
         * The two fields are coalesced as a PAIR's parts but bound independently, because a
         * half-valid pair can only ever widen what cannot match (a NULL never matches), never
         * produce a false twin: every gate reads both, and a missing half fails them.
         */
        perceptualHash: normalizeClaimedPerceptualHash(row.perceptualHash),
        perceptualSig: normalizeClaimedPerceptualSig(row.perceptualSig),
        sortOrder: row.sortOrder ?? 0,
      })),
    )
    .returning(imageColumns)

  return inserted
}

/**
 * **R4: an orphan gets a parent again.** The runner's own words — *"make sure these 'orphaned'
 * photos got 'parent' chat session again if user attach a photo to another chat session"*. One
 * UPDATE, and the row that was already there is the row that lands in the new bubble.
 *
 * Only expressible since R1: before `message_id` became nullable there were no orphans to adopt.
 *
 * ── WHY AN UPDATE AND NOT AN INSERT ─────────────────────────────────────────────────────────
 * `insertNinaMessageImages` is one function up and it is the WRONG statement here. Re-attaching an
 * orphan through it writes a SECOND row carrying `source_image_id` — a reference to a photograph
 * whose own row has no message and never gets one, so the picture the runner just put back into a
 * conversation stays parentless forever. That is precisely what R4 forbids. Adopting keeps the id
 * — so `/nina`'s deep link and `attachableIdAt` (`lib/nina/chatphotos.ts`) still resolve to it —
 * keeps the Blob object, and keeps one row per photograph rather than two.
 *
 * ── `message_id IS NULL` IS IN THE WHERE, NOT IN A BRANCH ABOVE IT ──────────────────────────
 * The caller has just read the row and already knows whether it had a message. Asking again HERE,
 * inside the statement, is what makes "adopt an orphan" and "leave a live bubble alone" one atomic
 * decision instead of a branch on a value read a moment earlier: a row that gained a message between
 * that read and this UPDATE is NOT adopted, and the `null` sends the caller to its fallback rather
 * than emptying a bubble the runner never touched (plan Decisions, row 5 — *"the same class of loss
 * this whole plan exists to stop"*). So `null` means exactly one thing to a caller — **"not his, or
 * not an orphan"** — and both of those answers want identical handling.
 *
 * ── WHAT IT DELIBERATELY DOES NOT TOUCH ─────────────────────────────────────────────────────
 *   · `created_at` — plan invariant 6. `/nina/about` and `/admin/photos` are both ordered by it, and
 *     `updateNinaChatPhotoBlob`'s header below records the same argument for replace: *"replacing a
 *     photograph is not taking a new one"*. Adopting one is not taking a new one either, and a
 *     bumped `created_at` would silently re-sort both surfaces.
 *   · `source_avatar_id` / `source_image_id` — F37's provenance, and whatever the row was, it stays.
 *     An orphaned original comes back as an original; an orphaned reference comes back as a
 *     reference. Either way `isOriginalPhoto()` counts this photograph exactly as often as it did
 *     before, which is what keeps the collection honest through a re-attach. Re-parenting is not a
 *     claim about where the bytes came from. (The plan's own text here named `is_reference`, the
 *     column coordinator ruling C7 struck; these two columns are the mechanism that survived.)
 *   · `description` — it describes this picture, and this is the same picture. Nina is handed it
 *     through `imageDescriptions` on this very turn.
 *   · `kind` — an orphaned upload of his, re-attached, is still his upload. `photoSideOf`
 *     (`lib/nina/album.ts`) has to keep telling the truth.
 *
 * ── OWNER SCOPE, AND WHY THERE IS NO SECOND OWNERSHIP READ ──────────────────────────────────
 * `user_id` is in the WHERE (plan invariant 4): a photograph id from a client is a claim, and this
 * module's standing rule makes "not yours" and "does not exist" one outcome. `into.messageId` is NOT
 * re-checked against `nina_messages` the way `insertNinaMessageImages` checks its `messageId`, and
 * the reason is that the one caller INSERTED that message itself, in the same request, under the same
 * `userId`, thirty lines above — with the foreign key behind that, so an id that is not a row fails
 * this statement loudly instead of landing quietly. The reference was re-read, owner-scoped, by
 * `getNinaMessageImage` before this ran.
 *
 * `sortOrder` is a parameter and not derived, because "where in the new bubble" is the caller's
 * question: it is the count of the photographs he picked in the same message.
 */
export async function adoptNinaMessageImage(
  userId: string,
  id: string,
  into: { messageId: string; sortOrder: number },
): Promise<NinaImageRow | null> {
  const adopted = await db
    .update(ninaMessageImages)
    .set({ messageId: into.messageId, sortOrder: into.sortOrder })
    .where(
      and(
        eq(ninaMessageImages.userId, userId),
        eq(ninaMessageImages.id, id),
        isNull(ninaMessageImages.messageId),
      ),
    )
    .returning(imageColumns)

  return adopted[0] ?? null
}

/**
 * One conversation photo by id, ownership-scoped. The mirror of `getNinaAvatar` in `lib/nina/queries/avatars.ts`, and it
 * exists for the same reason: `app/nina/page.tsx` has to turn ONE id from a URL into ONE blob URL
 * during a render, and a full list-then-find would read up to `NINA_GALLERY_LIMIT` rows to answer
 * it.
 *
 * `null` for "not yours" and for "does not exist" alike — this module's stated rule, and here it is
 * also the security property: a page that distinguishes them is a page that tells a stranger which
 * ids exist.
 *
 * The projection is `imageColumns`, so the row carries `description`. **The caller reads `blobUrl`
 * and nothing else** (invariant 5); the description is `glm-4.6v`'s private text and its only
 * consumer is Nina's prompt.
 */
export async function getNinaMessageImage(
  userId: string,
  id: string,
): Promise<NinaImageRow | null> {
  const rows = await db
    .select(imageColumns)
    .from(ninaMessageImages)
    .where(and(eq(ninaMessageImages.userId, userId), eq(ninaMessageImages.id, id)))
    .limit(1)
  return rows[0] ?? null
}

/**
 * Hydrating a rendered message list: the images belonging to these messages, in one query rather
 * than one per bubble. Ordered by `(message_id, sort_order)` so a caller can group by the first
 * column without re-sorting.
 *
 * `id` is the final tiebreak above and here because `created_at` ties for rows written in one
 * statement — the same problem `nina_messages.seq` solves properly, and one worth solving
 * cheaply rather than properly for a table nobody paginates.
 */
export async function getNinaMessageImagesForMessages(
  userId: string,
  messageIds: readonly string[],
): Promise<NinaImageRow[]> {
  if (messageIds.length === 0) return []
  return db
    .select(imageColumns)
    .from(ninaMessageImages)
    .where(
      and(
        eq(ninaMessageImages.userId, userId),
        inArray(ninaMessageImages.messageId, [...messageIds]),
      ),
    )
    .orderBy(asc(ninaMessageImages.messageId), asc(ninaMessageImages.sortOrder))
}

/**
 * **"What photograph is he pointing at?"** — the fallback half of R2's resolution, and the only new
 * read the chat-side avatar adoption needs.
 *
 * `set_avatar_from_photo` (`lib/nina/avatarAdopt.ts`) prefers whatever is attached to the runner's
 * CURRENT message. When he attached nothing — "ganti profpic lu pake foto ini", two minutes after
 * the photo itself, which is exactly the production turn this feature was written for — the
 * referent is the most recent photograph the conversation has shown. This answers that, and nothing
 * wider: one session, one row.
 *
 * ── ORIGINALS ONLY, AND THE PREDICATE IS THIS MODULE'S OWN ───────────────────────────────────
 * `isOriginalPhoto()` is in the WHERE for `listNinaMediaPhotos`' reason and one sharper one: the
 * caller's next act is to COPY these bytes into `nina_avatars`, and a reference renders bytes that
 * already live somewhere else — copying one would file a second copy of a photograph the original
 * still owns. That is `setChatPhotoAsAvatarAction`'s rule, enforced here at the read so the chat
 * path cannot reach a reference by accident.
 *
 * ── THE SESSION COMES FROM `nina_messages`, SO THIS JOINS ────────────────────────────────────
 * `nina_message_images` carries no `session_id` — a photograph is scoped by the bubble that holds
 * it. The `innerJoin` is on `nina_messages`' primary key, and it also drops an ORPHANED photograph
 * (`message_id IS NULL` after a session delete, `ON DELETE SET NULL`), which is correct: a
 * photograph whose bubble is gone is not something "this conversation just showed".
 *
 * `user_id` is spelled on BOTH tables. The image-side predicate is the indexed one
 * (`nina_message_images_user_created_idx`); the message-side one is the ownership belt-and-braces
 * this module's rule 2 asks for, and it costs nothing on a primary-key join.
 *
 * `(created_at desc, id desc)` is `listNinaMediaPhotos`' ordering with the same `id` tiebreak,
 * because rows written in one statement tie on `created_at`. The projection is `imageColumns`, so
 * the caller gets `pathname` (it needs the container), `description` (it seeds the album row's) and
 * the measurements, in the one row shape this module has.
 *
 * `null` for "no such session", "not yours" and "nothing original in it" alike — this module's
 * standing rule, and here all three want the same next step: refuse, and ask him which photo.
 */
export async function getLatestOriginalNinaSessionPhoto(
  userId: string,
  sessionId: string,
): Promise<NinaImageRow | null> {
  const rows = await db
    .select(imageColumns)
    .from(ninaMessageImages)
    .innerJoin(ninaMessages, eq(ninaMessages.id, ninaMessageImages.messageId))
    .where(
      and(
        eq(ninaMessageImages.userId, userId),
        eq(ninaMessages.userId, userId),
        eq(ninaMessages.sessionId, sessionId),
        isOriginalPhoto(),
      ),
    )
    .orderBy(desc(ninaMessageImages.createdAt), desc(ninaMessageImages.id))
    .limit(1)
  return rows[0] ?? null
}

/**
 * **"Does this user already store these bytes?"** The write-time dedup lookup (media-dedupe P1),
 * and the question every dedup arm — the upload pre-check, the generated store, the worker — asks
 * BEFORE it is allowed to create a second Blob object. Phase 1 ships the question with no
 * callers; the arms are phases 2 and 3.
 *
 * ── ORIGINALS ONLY, BY THE PREDICATE THIS MODULE ALREADY OWNS ────────────────────────────────
 * `isOriginalPhoto()` in the WHERE is not decoration. A REFERENCE row carries the same
 * `content_hash` as the keeper it points at (it renders the same bytes), so counting references
 * would answer "yes" forever after the first copy and point every later dedup arm at a reference
 * instead of the original — and `ninaPhotoProvenance` flattens precisely so pointers name the
 * original. `isOriginalPhoto` is a hoisted function declaration, so calling it from above its
 * definition is this file's normal order, not a trick.
 *
 * ── NEWEST FIRST, AND WHY THE CALLER CARES ───────────────────────────────────────────────────
 * `(created_at desc, id desc)` is `listNinaMediaPhotos`'s ordering with the same `id` tiebreak
 * (rows written in one statement tie on `created_at`). For a dedup caller any original with the
 * bytes is a correct attach target, but the newest one is the least likely to have been deleted
 * between this read and the write that follows — which is what keeps the attach arm's
 * `source_image_id` pointing at a row that still exists. The partial index
 * `nina_message_images_user_content_hash_idx` serves exactly this shape.
 *
 * ── THE CLAIM IS VALIDATED BEFORE THIS RUNS, NOT INSIDE IT ───────────────────────────────────
 * Every hash handed here is a `string`: NULL means "no dedup" everywhere else in this file's
 * vocabulary, and a caller holding NULL wants the no-match answer, not a query that can only
 * answer no. Callers validate client claims with `isValidContentHash`
 * (`lib/photos/contentHash.ts`) first and simply do not call this on failure — the same shape
 * `resolveAttachment` uses for its provenance source. `insertNinaMessageImages` re-checks the
 * format at the write anyway; the two checks agree by construction because both call the one
 * predicate.
 *
 * ── ONE CALL, TWO KINDS OF BYTE IDENTITY ─────────────────────────────────────────────────────
 * The list form exists because a pick carries TWO hashes worth asking about (2026-09-10's
 * measured defect): the encode's — the bytes a PUT would carry — and the picked file's own,
 * which for a download-then-reupload is byte-for-byte a row's stored object. `content_hash`
 * holds "sha-256 over a row's stored bytes" for every row, so ONE column answers both questions
 * and the caller asks them together: `in (encode, source)`, one indexed round trip. The two
 * matches can name different rows only when the same picture is stored twice in two encodes;
 * either is a correct attach target (a reference flattens to its original either way), so the
 * ordering stays the collection's — newest first, the least likely to have been deleted.
 *
 * `null` for "not yours", "no such bytes" and "no row carries them" — this module's standing rule,
 * which here is also the dedup answer "store it, you are the first": the outcomes want exactly the
 * same next step. The projection is `imageColumns` (one row shape in this module — the caller
 * needs `id`/`blobUrl`/`pathname`/`kind` to attach, and the rest rides along).
 */
export async function findNinaImageByContentHash(
  userId: string,
  contentHash: string | string[],
): Promise<NinaImageRow | null> {
  const hashes = Array.isArray(contentHash) ? contentHash : [contentHash]
  const rows = await db
    .select(imageColumns)
    .from(ninaMessageImages)
    .where(
      and(
        eq(ninaMessageImages.userId, userId),
        inArray(ninaMessageImages.contentHash, hashes),
        isOriginalPhoto(),
      ),
    )
    .orderBy(desc(ninaMessageImages.createdAt), desc(ninaMessageImages.id))
    .limit(1)
  return rows[0] ?? null
}

/**
 * **"What has this user already signed?"** The perceptual twin lookup's read (media-dedupe
 * follow-up, 2026-09-10): every ORIGINAL that carries both halves of a signature, newest first,
 * for the send-time race-close to compare its just-uploaded bytes against.
 *
 * ── ORIGINALS ONLY, SIGNED ONLY, AND WHY THERE IS NO LIMIT ────────────────────────────────────
 * `isOriginalPhoto()` because a reference renders the KEEPER's object — matching against one
 * would point the new row at a pointer, and `ninaPhotoProvenance` would flatten it anyway. Signed
 * only (`perceptual_hash is not null`): an unsigned row cannot participate, and the predicate is
 * the SQL half of "NULL never matches". No LIMIT, deliberately — the question is "the collection",
 * not "something in it", and this collection is tens of rows today; the comparison it feeds is
 * in-Node arithmetic over at most a few hundred 256-byte signatures, which is why the schema
 * declines to index a Hamming distance it cannot answer anyway.
 *
 * ── NEWEST FIRST, THE FINDER'S ORDER, NOT THE SWEEP'S ─────────────────────────────────────────
 * `(created_at desc, id desc)` is `findNinaImageByContentHash`'s standing rule and the same
 * reason: any twin is a correct attach target, and the newest original is the least likely to have
 * been deleted between this read and the reference write that follows. The sweep elects keepers
 * differently (`scripts/nina-dedupe-plan.mjs`'s `compareKeeperCandidates`) because it answers a
 * different question — which row OWNS bytes several rows already point at — and the two orders
 * are deliberately not unified there, exactly as the byte paths' were not.
 *
 * The projection is wider than `imageColumns` because the caller needs the signature pair and the
 * provenance source ids but not the bubble's `message_id` — a twin match never reads it.
 */
export async function findNinaSignedOriginals(userId: string): Promise<
  Array<{
    id: string
    kind: NinaImageKind
    blobUrl: string
    pathname: string
    description: string | null
    sourceAvatarId: string | null
    sourceImageId: string | null
    width: number | null
    height: number | null
    /** Non-null by the WHERE, but typed nullable because the parsers own the trust, not SQL. */
    perceptualHash: string | null
    perceptualSig: string | null
  }>
> {
  return db
    .select({
      id: ninaMessageImages.id,
      kind: ninaMessageImages.kind,
      blobUrl: ninaMessageImages.blobUrl,
      pathname: ninaMessageImages.pathname,
      description: ninaMessageImages.description,
      sourceAvatarId: ninaMessageImages.sourceAvatarId,
      sourceImageId: ninaMessageImages.sourceImageId,
      width: ninaMessageImages.width,
      height: ninaMessageImages.height,
      perceptualHash: ninaMessageImages.perceptualHash,
      perceptualSig: ninaMessageImages.perceptualSig,
    })
    .from(ninaMessageImages)
    .where(
      and(
        eq(ninaMessageImages.userId, userId),
        isOriginalPhoto(),
        isNotNull(ninaMessageImages.perceptualHash),
        isNotNull(ninaMessageImages.perceptualSig),
      ),
    )
    .orderBy(desc(ninaMessageImages.createdAt), desc(ninaMessageImages.id))
}

/**
 * **"This row's bytes are not already in the collection under another id."** F37 R1 and R3, as one
 * predicate, so that the three reads that must agree cannot drift.
 *
 * ── WHY IT IS A BARE PREDICATE AND NOT A `…Scope(userId)` ──────────────────────────────
 * `generatedChatPhotoScope` answers a whole question ("her chat photographs, his") and owns its
 * ownership check. This answers half of one, and its callers differ in the other half — one is
 * `user_id` alone, the other is `user_id AND kind`. A `userId` parameter here would mean two
 * functions that both know about ownership and a reader who has to check whether they agree.
 *
 * ── THE COLLECTION READS IT FILTERS, AND THE ONES IT MUST NEVER ───────────────────────
 * Filtered — the COLLECTION reads, which describe a set of photographs to a human:
 *   · `listNinaPhotoReferences` (`queries/imageprefs.ts`) → the reference picker's chat-side rows,
 *     via `generatedChatPhotoScope` below
 *   · `listNinaMediaPhotos` + `countNinaMediaPhotos` → /admin/nina?view=media and its tree badge,
 *                                 AND (2026-09-17) `/nina/about`'s Media tab, via
 *                                 `mediaCollectionScope` — the all-kinds superset of the
 *                                 generated pair, sharing THIS predicate so a reference cannot
 *                                 sneak into one view while another hides it.
 *
 * ONE DIRECTION ONLY, and the gap is by design rather than by omission: this reads columns on the
 * CHAT row, so it catches a chat row pointing at an album face (album → chat) and cannot catch a
 * chat photograph the album COPIED (chat → album), where the only link is `source_key` on the new
 * `nina_avatars` row. That second direction is excluded one caller up, in
 * `generatedChatPhotoScope` and nowhere else — see its docstring. Do not "complete" this predicate
 * by adding the album lookup here: `mediaCollectionScope` and `/nina/about` read it too, and an
 * adopted photograph must keep its tile in the Media view.
 *
 * NOT filtered, and a future "consistency" cleanup that adds it here is a data-loss bug —
 * these are what makes a photograph RENDER and what Nina is given to look at (invariant 2):
 *   · `getNinaMessageImagesForMessages` → every bubble, and the delete log
 *   · `getNinaMessageImage`             → the ?photo= deep link and the re-attach path
 *   · `getNinaJobPhoto`                 → the Detail foto row's photograph link (this set)
 *   · `dbNinaSourceGateway.readMessageWindow` / `.readConversation` → her context
 *   · `isBlobPathnameReferenced`        → "is anyone still pointing at these bytes", which is
 *                                         wrong by exactly the rows this predicate hides
 * `tests/nina.photoRefs.test.ts` asserts that absence, as an absence, for the same reason
 * `tests/nina.softDelete.test.ts` asserts one on `countNinaTurnsSince`.
 *
 * ── EITHER COLUMN, NOT BOTH ────────────────────────────────────────────
 * An album face re-attached twice carries both. A chat photo re-attached once carries one. The
 * definition is "either non-null", so the predicate is "both null" — and `IS NULL` is the only
 * spelling that is correct here, because `= NULL` is never true and `<>` on a NULL is never
 * false.
 *
 * No index; see the columns' own header in `lib/db/schema.ts`.
 */
export function isOriginalPhoto(): SQL | undefined {
  return and(isNull(ninaMessageImages.sourceAvatarId), isNull(ninaMessageImages.sourceImageId))
}

/**
 * The predicate that DEFINES "her chat photographs", written once so the listing and the count
 * cannot drift apart.
 *
 * ── `kind`, NEVER `message.role`. THIS IS THE PHASE'S WHOLE CORRECTNESS ──────────────────────
 * R2 says *"nina generated images"*, and `kind = 'generated'` is what that means. It is NOT the
 * same set as "images on messages where role = 'nina'": `lib/nina/actions.ts:512-531` is R26's
 * re-attach path, and when the runner re-attaches one of her selfies it writes
 * `kind: attached.kind` — resolved to `'generated'` at `:167-172` — onto a message whose `role` is
 * `'runner'`. `photoSideOf` (`lib/nina/album.ts:146`) exists for that case and
 * `lib/nina/chatphotos.ts:30-37` documents it in as many words. A `role`-filtered admin listing
 * would silently omit those rows and would then disagree with `/nina/about`'s gallery about which
 * photographs are hers, which is the one failure mode this surface cannot have.
 *
 * ── `kind` IS A RESIDUAL PREDICATE AND THAT IS CORRECT HERE ──────────────────────────────────
 * There is no `(user_id, kind, created_at)` index. Both statements below read
 * `nina_message_images_user_created_idx` — equality on `user_id`, `(created_at desc, id desc)`
 * already in index order — and filter `kind` on the rows that come back. At this table's size (one
 * user, phase 12's six generations a day, single-digit thousands of rows at the horizon) that is a
 * bounded index range scan and the correct read. **An index is not being added:** invariant 10 of
 * this plan forbids a migration, and nothing has measured a need for one.
 *
 * ── AND SINCE F37, NOT A REFERENCE ───────────────────────────────────────────
 * `isOriginalPhoto()` joins the `and(...)` here rather than at the call sites, which is the same
 * argument this docstring already makes for `kind`: every statement that reads this scope reads the
 * same set by construction. After the image-collection merge the scope's callers are the
 * image-reference picker's — `listNinaPhotoReferences` (`queries/imageprefs.ts`, both the rows and
 * their `total`, since 2026-09-17's dedup pass folded the count into the same deduped read) and
 * `resolveNinaPhotoReference` (the stored selection) — a picker grid that shows her GENERATED
 * photographs only, which is the one set this scope still names.
 *
 * ── AND NOT ONE THE ALBUM HAS ALREADY ADOPTED. THIS IS THE SAME DUPLICATE, MIRRORED ──────────
 * `isOriginalPhoto()` catches ALBUM → CHAT: a chat row that POINTS at a photograph living
 * elsewhere. It cannot catch CHAT → ALBUM, and that is not an oversight in it — it is a fact about
 * how the adoption is written. `setChatPhotoAsAvatarAction` (`lib/admin/ninaAlbumActions.ts:278`)
 * COPIES the bytes (`copyChatPhotoIntoAlbum`, `:332`) into a brand-new `nina_avatars` row and
 * writes the only link there is onto the COPY — `source_key = 'chat-photo:' + <the chat row's
 * id>`, `:301`. The chat row it copied from is never touched: both provenance columns stay NULL,
 * `isOriginalPhoto()` keeps (correctly, by its own definition) calling it original, and the picker
 * showed the photograph twice — once as the chat row, once as its album twin, adjacent at the top
 * of a newest-first list because the two were written seconds apart. Measured in production on
 * 2026-09-12: 5 `nina_avatars` rows carry a `chat-photo:` key, and all 5 of the chat rows they name
 * still have both columns NULL.
 *
 * So the exclusion has to read the link from the side that HAS it, which is what the correlated
 * `NOT EXISTS` below does. The copy is the survivor and the original is the one hidden, because
 * the copy is the row the operator just made current and the one the picker can keep offering
 * after the chat row is deleted.
 *
 * **The copy is not being un-copied, and no back-reference column is being added.** "Bytes copied,
 * not shared" is deliberate (until the ghost-photo fix an album delete called `del` with no
 * reference check at all, so a shared object would blank the chat bubble the day the album row
 * went away; the delete is reference-checked now — `lib/admin/ninaAlbumAvatarActions.ts` and
 * `reapAvatarBlobs` both ask `isBlobPathnameReferenced` first — but a copy is still what makes the
 * two sides' framing, folder and lifetime independent of each other), and a new column would be a
 * migration for a fact `nina_avatars.source_key` already states.
 *
 * **It is scoped and it is indexed.** `nina_avatars.user_id` is spelled inside the subquery — an
 * unscoped subquery would let another operator's album hide this one's photographs — and the pair
 * `(user_id, source_key)` is `nina_avatars_user_source_key_unq` (`lib/db/schema.ts:1781`), so this
 * is an index-backed equality probe per candidate row, not a scan. **No index is being added.**
 *
 * **The literal `'chat-photo:'` is spelled here and at `lib/admin/ninaAlbumActions.ts:301`, with
 * no shared constant between them** — a `'use server'` module may export only async actions, so it
 * cannot export the prefix, and the db layer must not import from an actions module. The two
 * spellings are held together by `tests/nina.photoRefs.test.ts`, which pins this exact text, and
 * by `tests/admin.chatPhotoAdoption.test.ts:132`, which pins the writer's.
 *
 * ── WHY `mediaCollectionScope` DOES NOT GET THIS ARM ─────────────────────────────────────────
 * An adopted chat row is still a real photograph in a real bubble, and the Media view — both of
 * its surfaces, `/admin/nina?view=media` and `/nina/about`'s Media tab — is where the operator or
 * the runner goes to Replace, Remove or just look at it; hiding it there would take away the only
 * handle on it. The user asked for the PICKER to deduplicate, and the picker is the only surface
 * that changes.
 */
export function generatedChatPhotoScope(userId: string) {
  /* The outer parentheses are load-bearing and hand-written, for `removeNinaSession`'s measured
   * reason (`queries/sessions.ts`): `notExists()` emits `not exists ` followed by its argument's chunks
   * verbatim — it only LOOKS like it brackets them, because a subquery BUILDER serialises itself
   * with brackets. A raw `sql` template does not, and without the pair below the generated
   * statement is `... and not exists select 1 from ...`, which Postgres rejects. */
  const alreadyAdoptedIntoAlbum = sql`(
    select 1
      from ${ninaAvatars}
     where ${ninaAvatars.userId} = ${userId}
       and ${ninaAvatars.sourceKey} = 'chat-photo:' || ${ninaMessageImages.id}
  )`

  return and(
    eq(ninaMessageImages.userId, userId),
    eq(ninaMessageImages.kind, 'generated'),
    isOriginalPhoto(),
    notExists(alreadyAdoptedIntoAlbum),
  )
}

/* ============================================================================
 * §5a-2 The Media view — every ORIGINAL photograph, both kinds (R1)
 *
 * `/admin/nina?view=media` reads these, and so (2026-09-17) does `/nina/about`'s Media tab — one
 * scope, one read, shared by both surfaces rather than two definitions that happen to agree. NOT
 * `/admin/photos`' generated-only scope: the folder the user asked for is "semua foto - foto yang
 * saat ini ada di Media", his uploads included. Kept beside the generated pair rather than merged
 * into it on purpose:
 * `generatedChatPhotoScope` outlives that surface's purge entirely — the image-reference picker
 * (`listNinaPhotoReferences`) still reads it — so the two scopes sit side by side for good, each
 * the one definition of its own surface.
 * ==========================================================================*/

/**
 * The predicate that DEFINES the Media view, written once so the page and the tree badge cannot
 * drift apart — `generatedChatPhotoScope`'s own argument, one view over.
 *
 * Deliberately NO `kind` arm, and that is the whole difference from the scope above: his composer
 * uploads (`kind = 'upload'`) are members here, because the point of the folder is that even a
 * manually-attached photograph becomes replaceable and adoptable. The reference filter STAYS —
 * a re-show is the same photograph, not a second one (`isOriginalPhoto`).
 *
 * Same index story as `generatedChatPhotoScope`, only cheaper: `isOriginalPhoto()` is residual (no
 * index carries it) and the `kind` residual is gone entirely, so the read is the index range scan
 * `nina_message_images_user_created_idx` was built for — equality on `user_id`,
 * `(created_at desc, id desc)` already in index order, nothing else filtered. **No index is being
 * added**: no migration in this plan, and nothing has measured a need.
 */
function mediaCollectionScope(userId: string) {
  return and(eq(ninaMessageImages.userId, userId), isOriginalPhoto())
}

/**
 * One page of the Media view, plus the total — the read behind `/admin/nina?view=media`.
 *
 * Modelled on `listNinaChatPhotos` above, with two deltas and one deliberate non-delta:
 *
 *   · the scope is `mediaCollectionScope` — no `kind` arm; see there.
 *   · the count is this section's own `countNinaMediaPhotos`, so the page and the tree badge share
 *     one predicate rather than two opinions about how many photographs exist.
 *
 * The non-delta is the page size: `NINA_CHAT_PHOTO_PAGE_SIZE` stays the default AND the ceiling
 * even though the rows are no longer only hers. That is not an oversight — the constant's NUMBER
 * was chosen for the cost of a page of originals (`nina_message_images` has no thumbnail column,
 * so every tile loads its full blob — `lib/nina/album.ts:80-105`), and this grid pays exactly the
 * same cost per tile. The number travels with the cost, not with the predicate.
 *
 * Two statements run concurrently and `offset` is floored at 0, for the reasons
 * `listNinaChatPhotos` and `NinaAvatarFolderPage` already record; not re-argued here.
 */
export async function listNinaMediaPhotos(
  userId: string,
  opts: { limit?: number; offset?: number } = {},
): Promise<NinaMediaPage> {
  const limit = Math.max(
    1,
    Math.min(opts.limit ?? NINA_CHAT_PHOTO_PAGE_SIZE, NINA_CHAT_PHOTO_PAGE_SIZE),
  )
  const offset = Math.max(0, Math.trunc(opts.offset ?? 0))

  const [rows, total] = await Promise.all([
    db
      .select(imageColumns)
      .from(ninaMessageImages)
      .where(mediaCollectionScope(userId))
      .orderBy(desc(ninaMessageImages.createdAt), desc(ninaMessageImages.id))
      .limit(limit)
      .offset(offset),
    countNinaMediaPhotos(userId),
  ])

  return { rows, total }
}

/**
 * How many original photographs the Media view holds, as a number rather than as a list of rows —
 * the tree pane's badge.
 *
 * The tree shows "Media <n>" on BOTH views, which is why the album arm runs this aggregate even
 * though it lists avatars: the badge is the rail's whole point (`FolderTree`'s header), and "how
 * many photographs are in there" is a question a count answers without a page of rows — the exact
 * mistake `countNinaAvatars` was written to undo. `listNinaMediaPhotos` does not call this one
 * twice — it calls it once, beside its own page — so listing and badge are one predicate by
 * construction.
 */
export async function countNinaMediaPhotos(userId: string): Promise<number> {
  const counted = await db
    .select({ total: sql<number>`count(*)`.mapWith(Number) })
    .from(ninaMessageImages)
    .where(mediaCollectionScope(userId))
  return counted[0]?.total ?? 0
}

/* ============================================================================
 * §5b Conversation photographs — the admin write side (R2, phase 3)
 *
 * The image-collection explorer's Media view (`/admin/nina?view=media`) is the only surface these
 * statements answer to. Every statement here is owner-scoped and none of them is reachable from a
 * runner-facing path, which is why they sit in their own block rather than in §5: §5 is what the
 * chat reads and what the worker writes, and this is what the operator changes.
 * ==========================================================================*/

/** The four measurements plus the two references a replaced photograph carries. */
export interface NinaChatPhotoBlobPatch {
  blobUrl: string
  pathname: string
  width: number
  height: number
  bytes: number
  /**
   * media-dedupe P3. The sha-256 claim over the NEW bytes, or NULL. Optional so existing callers
   * compile; the `.set()` below coalesces to NULL, because a Replace that left the OLD hash on
   * the NEW bytes would be the one lie the dedup lookup cannot survive: `findNinaImageByContentHash`
   * would keep answering for bytes this row no longer stores (invariant 4's one semantics —
   * identical hash ⟺ identical bytes in the store). A replaced row is un-hashed until something
   * hashes its new bytes again; NULL is the honest value, the same meaning it has everywhere.
   */
  contentHash?: string | null
}

/**
 * **REPLACE: new bytes behind an existing row.** R2, verbatim: *"replace a photo in there with a
 * new photo"*.
 *
 * ── WHAT IT DELIBERATELY DOES NOT TOUCH, AND WHY EACH ONE MATTERS ───────────────────────────
 *   · `id` — the row is the same row. `/nina` deep links to it and `attachableIdAt`
 *     (`lib/nina/chatphotos.ts:93`) hands it to the re-attach path.
 *   · `message_id` — the bubble that already exists keeps existing and now shows the new picture.
 *     This IS the requirement; a delete-and-insert would move the photograph to the bottom of the
 *     conversation.
 *   · `created_at` — the gallery is ordered by it (`nina_message_images_user_created_idx`), so
 *     bumping it would silently re-sort `/nina/about`. Replacing a photograph is not taking a new
 *     one.
 *   · `sort_order` — its place inside a multi-image bubble.
 *   · `kind` — never written by this statement. A replaced upload row stays `kind: 'upload'`,
 *     now storing selfie-shaped JPEG bytes at a `selfie-` pathname: pathname is display/admin-only
 *     and `kind` drives behavior (`photoSideOf`, the describe subject, the runner's display). The
 *     WHERE carries `isOriginalPhoto()` instead of the old `kind = 'generated'`: every original is
 *     replaceable since the merge, and a REFERENCE row is still unreachable — the action refuses
 *     it first and this clause is the second agreeing check.
 *
 * ── WHY `description` AND `prompt` GO TO NULL IN THE SAME STATEMENT ─────────────────────────
 * They described the OLD picture. `description` is not decorative: `lib/nina/gateway.ts:162` puts
 * it in `MessageInput.imageDescriptions` and `lib/nina/actions.ts:604` feeds it to Nina, so a stale
 * one is a sentence she will confidently say about a photograph that is not there — invariant 6's
 * exact failure. Nulling it HERE rather than in a second statement means there is no window in
 * which the row points at new bytes and old prose. NULL degrades honestly: the send path
 * substitutes `NINA_DESCRIPTION_UNAVAILABLE`, the instruction written for it.
 * `lib/admin/chatPhotoActions.ts` earns a fresh description in `after()`.
 *
 * `prompt` is the generation sidecar for bytes that are gone. It has no reader anywhere in the repo
 * (only this file's projection and `insertNinaMessageImages`), and it is already NULL on every
 * `kind = 'upload'` row, so NULL is honest and invisible rather than a marker.
 */
export async function updateNinaChatPhotoBlob(
  userId: string,
  id: string,
  patch: NinaChatPhotoBlobPatch,
): Promise<NinaImageRow | null> {
  const updated = await db
    .update(ninaMessageImages)
    .set({
      blobUrl: patch.blobUrl,
      pathname: patch.pathname,
      width: patch.width,
      height: patch.height,
      bytes: patch.bytes,
      description: null,
      prompt: null,
      /*
       * F37. These described where the OLD bytes came from. The new bytes came from the operator's
       * file picker, so the row is now an original and must say so — otherwise a Replace applied
       * to a reference (reachable from a stale tab: the id comes from a client and
       * `getNinaMessageImage` does not filter references) leaves a unique photograph that no
       * listing will ever show. Same statement as the two nulls above it, for the same reason:
       * there must be no window in which the row points at new bytes and old provenance.
       */
      sourceAvatarId: null,
      sourceImageId: null,
      /*
       * media-dedupe P3. Same statement as the nulls above it, for the same reason: there must be
       * no window in which the row points at new bytes and claims old ones. A valid claim from
       * the caller sticks; its absence retracts. See `NinaChatPhotoBlobPatch.contentHash`.
       */
      contentHash: patch.contentHash ?? null,
      /*
       * media-dedupe follow-up, ghost-signature fix (2026-09-15). The perceptual pair describes
       * "the bytes a row OWNS" (the column header's own doctrine) and this statement just swapped
       * them — so a pair left standing is a GHOST: the send-time twin scan would compare every
       * future re-upload against a signature of the OLD photograph. Measured on production that
       * day: 49 of 71 signed originals carried a signature 23-42/64 bits from their own live
       * bytes, and a pixel-identical re-upload of `ymKp8lDU_Br6` matched nothing — its twin gate
       * saw the ghost, not the photograph. NULL retracts to the same honest "unsigned =
       * dedup-inactive" the column header defines, and `replaceChatPhotoAction` re-signs the NEW
       * bytes in `after()` (`scheduleChatPhotoResign`), so the row is unsigned for seconds, not
       * until the next sweep run.
       */
      perceptualHash: null,
      perceptualSig: null,
    })
    .where(
      and(eq(ninaMessageImages.userId, userId), eq(ninaMessageImages.id, id), isOriginalPhoto()),
    )
    .returning(imageColumns)

  return updated[0] ?? null
}

/**
 * **The guarded re-sign write** — one row's perceptual pair, written only while the row still
 * serves the exact bytes that were signed.
 *
 * `replaceChatPhotoAction` nulls the pair at byte-swap time (`updateNinaChatPhotoBlob`, the
 * ghost-signature fix) and re-signs the NEW bytes in `after()`. The gap between "read the row"
 * and "write the signature" is a real race: the operator can replace the photograph AGAIN while
 * the first pass's GET is in flight, and writing bytes-1's signature onto a bytes-2 row would
 * mint exactly the ghost this whole fix exists to bury. So `pathname` is part of the WHERE: the
 * write lands only if the row still serves the object that was fetched and signed. A second
 * replace makes this statement a 0-row no-op, and the second replace's own pass owns the row.
 *
 * Everything else is the door rule every other writer here applies: owner-scoped (`user_id` in
 * the WHERE — an id from a client is a claim), originals only (`isOriginalPhoto()` — a reference
 * binds NULL by the column header's doctrine and can never carry a signature), and the values
 * normalize through the one parsers (`lib/nina/perceptual.ts`) so a malformed pair is a refusal,
 * not a poisoned column. `false` means "not written" — stale guard, reference, malformed pair,
 * or gone row — and every caller treats it as the quiet nothing it is.
 */
export async function updateNinaChatPhotoPerceptualSignature(
  userId: string,
  id: string,
  pathname: string,
  signature: { dhashHex: string; sig16Base64: string },
): Promise<boolean> {
  const perceptualHash = normalizeClaimedPerceptualHash(signature.dhashHex)
  const perceptualSig = normalizeClaimedPerceptualSig(signature.sig16Base64)
  if (perceptualHash == null || perceptualSig == null) return false

  const updated = await db
    .update(ninaMessageImages)
    .set({ perceptualHash, perceptualSig })
    .where(
      and(
        eq(ninaMessageImages.userId, userId),
        eq(ninaMessageImages.id, id),
        eq(ninaMessageImages.pathname, pathname),
        isOriginalPhoto(),
      ),
    )
    .returning({ id: ninaMessageImages.id })

  return updated.length > 0
}

/**
 * **REMOVE, the row-only half.** One image off a message that has others, or off a message that is
 * HIS and must survive (the R26 re-attach path). `removeChatPhotoAction` decides which half runs;
 * the other half is `deleteNinaMessage`, whose `ON DELETE CASCADE` takes the image rows with it.
 *
 * Returns the row as it was so the caller knows exactly which object it has stopped referencing —
 * `deleteNinaAvatar`'s shape.
 */
export async function deleteNinaMessageImage(
  userId: string,
  id: string,
): Promise<NinaImageRow | null> {
  const deleted = await db
    .delete(ninaMessageImages)
    .where(and(eq(ninaMessageImages.userId, userId), eq(ninaMessageImages.id, id)))
    .returning(imageColumns)

  return deleted[0] ?? null
}

/**
 * One row a parent's delete is about to orphan: a REFERENCE that carries no measurements of its
 * own, about to be reclassified as an "original" by `isOriginalPhoto()` the moment the FK fires.
 *
 * Three columns and no more. The promotion needs an id to write to and the object's two spellings
 * to fetch and to guard on; `description` is `glm-4.6v`'s private text (invariant 5) and has no
 * business in a projection whose only consumer is a `fetch`.
 */
export interface NinaImageDependent {
  id: string
  blobUrl: string
  pathname: string
}

/**
 * **"Which of this user's rows point at the parents that are about to be deleted, and have never
 * been measured?"** The read half of the promote-before-delete rule (`lib/nina/provenancePromotion.ts`).
 *
 * ── WHY IT MUST RUN BEFORE THE PARENT'S DELETE, AND CAN NEVER BE ASKED AFTER ────────────────
 * `nina_message_images.source_avatar_id` and `.source_image_id` are both `ON DELETE SET NULL`
 * (`lib/db/schema/nina/chat.ts:614-618`, deliberate: *"the collection KEEPS the picture instead of
 * losing it"*). Postgres fires that inside the parent DELETE's own statement, so the link this
 * query reads is gone before the delete returns. There is no later moment in the request at which
 * "the dependents, keyed by the parent id" can be found again — which is the whole reason the
 * promotion is ordered first.
 *
 * ── `content_hash IS NULL` IS THE QUALIFIER, AND IT IS ONE COLUMN ON PURPOSE ────────────────
 * A row that already carries a hash has already been measured — by the sweep's `fill-hash` op, by
 * an earlier promotion, or by a writer that owned its bytes — and re-fetching its object to
 * re-measure it would be a GET for a value that is already correct. One column rather than a
 * conjunction over all six: `content_hash` is the column BOTH dedup mechanisms ultimately gate on
 * (`findNinaImageByContentHash` reads it directly, and the promotion writes the perceptual pair in
 * the same statement that fills it), and the sweep's own `fill-hash` guard is spelled exactly this
 * way. A row with a hash but no signature is the sweep's `fill-perceptual` case, not this one's.
 *
 * ── EITHER COLUMN, AS AN `OR` OF TWO `IN` LISTS ─────────────────────────────────────────────
 * An avatar delete supplies `avatarIds`, a chat-photo delete supplies `imageIds`, and the shape
 * admits both at once because a future caller deleting across both tables in one gesture must not
 * have to run this twice and merge the halves itself. An arm with no ids is omitted rather than
 * emitted as `in ()`, which drizzle spells differently across versions and which
 * `moveNinaAvatarsToFolder` already declines to depend on. Both lists empty answers `[]` without a
 * statement.
 *
 * ── NO `isOriginalPhoto()`, AND THAT IS THE POINT ───────────────────────────────────────────
 * Every row this returns is, by construction, a REFERENCE — that predicate would exclude all of
 * them. The rows are about to STOP being references, which is what this whole read exists to get
 * ahead of.
 *
 * ── ORDERED BY PATHNAME, BECAUSE THE CALLER GROUPS BY IT ────────────────────────────────────
 * The promotion fetches each distinct pathname's bytes at most once, so handing it rows already
 * clustered makes the grouping a single pass and makes the GET order stable across runs — which is
 * what lets a partial failure (one dead object among twenty) be reproduced rather than guessed at.
 * `id` is the tiebreak for the usual reason: `pathname` ties for every row that shares an object.
 *
 * Owner-scoped in the WHERE (`lib/nina/queries.ts`'s rule 1). The parent ids arrive from a Server
 * Action's argument and are claims; a claim naming another user's parent simply matches none of
 * this user's rows, which is the same "not yours and does not exist are one answer" this layer
 * gives everywhere else. No index carries `source_avatar_id`/`source_image_id` (see the columns'
 * own header in the schema) — this is a bounded scan filtered by `user_id`, run once per
 * human-paced delete, and **no index is being added**.
 */
export async function listUnmeasuredNinaImageDependents(
  userId: string,
  parents: { avatarIds?: readonly string[]; imageIds?: readonly string[] },
): Promise<NinaImageDependent[]> {
  const avatarIds = [...new Set(parents.avatarIds ?? [])]
  const imageIds = [...new Set(parents.imageIds ?? [])]

  const arms: SQL[] = []
  if (avatarIds.length > 0) arms.push(inArray(ninaMessageImages.sourceAvatarId, avatarIds))
  if (imageIds.length > 0) arms.push(inArray(ninaMessageImages.sourceImageId, imageIds))
  if (arms.length === 0) return []

  return db
    .select({
      id: ninaMessageImages.id,
      blobUrl: ninaMessageImages.blobUrl,
      pathname: ninaMessageImages.pathname,
    })
    .from(ninaMessageImages)
    .where(
      and(eq(ninaMessageImages.userId, userId), or(...arms), isNull(ninaMessageImages.contentHash)),
    )
    .orderBy(asc(ninaMessageImages.pathname), asc(ninaMessageImages.id))
}

/**
 * Everything one Blob object's bytes say about themselves, measured once, in one place.
 *
 * `contentHash` and `bytes` are always present — they are arithmetic over the buffer and cannot
 * fail once the buffer exists. `signature` is `null` when `sharp` could not decode the bytes,
 * which is `signImageBytes`'s documented degradation and NOT a reason to withhold the hash: the
 * sweep's `fill-hash` and `fill-perceptual` are two ops for exactly this reason, and a row with a
 * hash and no signature participates in the byte-exact dedup arm while the perceptual arm waits
 * for the sweep.
 */
export interface NinaImageMeasurement {
  /** 64 lowercase hex over the exact bytes the object serves (`contentHashOf`). */
  contentHash: string
  /** The object's size in bytes, as fetched — never a claim. */
  bytes: number
  /** `signImageBytes`'s pair plus the dimensions it measured, or `null` if sharp could not read them. */
  signature: { dhashHex: string; sig16Base64: string; width: number; height: number } | null
}

/**
 * **PROMOTE: a reference becomes a measured original, one statement per shared object.** The write
 * half of the promote-before-delete rule, and the statement that makes the `ON DELETE SET NULL`
 * reclassification honest instead of silent.
 *
 * ── WHY THE WHERE DELIBERATELY OMITS `isOriginalPhoto()` ────────────────────────────────────
 * Every other write in this section carries it — `updateNinaChatPhotoBlob`,
 * `updateNinaChatPhotoPerceptualSignature` and `updateNinaChatPhotoDescription` all refuse a
 * reference, because a reference re-shows bytes that live elsewhere and a fact written onto it
 * would be a fact about bytes it does not own. This statement is the ONE exception in the file and
 * the exception is the requirement: its rows are references *for another few milliseconds*, and
 * the values being written are measurements of the object their own `blob_url` serves and will go
 * on serving after their parent is gone. Adding the predicate here would make the statement a
 * guaranteed no-op. **Do not "restore consistency" by adding it.**
 *
 * The window this opens is provably inert. Between this UPDATE and the parent's DELETE the row is
 * a reference that carries a hash and a signature — and both dedup reads that could act on those
 * values, `findNinaImageByContentHash` and `findNinaSignedOriginals`, carry `isOriginalPhoto()` in
 * their own WHERE. Nothing can match against it until it stops being a reference. The sweep is the
 * same answer from the other side: `scripts/nina-dedupe-plan.mjs`'s header already states that
 * *"every row is hashed"*, references included, and its perceptual merge already excludes them — so
 * a row this statement measures is a row the sweep would eventually have measured anyway. This
 * writes it at the one moment it matters instead of at the next manual run.
 *
 * ── THE TWO GUARDS, AND WHAT EACH ONE STOPS ─────────────────────────────────────────────────
 *   · `content_hash IS NULL` — idempotence against a concurrent promotion, the sweep's own
 *     `fill-hash` guard (`update ... where id = $1 and content_hash is null`) spelled in drizzle.
 *     A second promoter, a retried Server Action, or the sweep running mid-delete all resolve to
 *     "0 rows written", and the measurement that landed first is the one that stands.
 *   · `pathname = $n` — the ghost-signature lesson (2026-09-15), the same guard
 *     `updateNinaChatPhotoPerceptualSignature` carries and for the identical reason: between the
 *     dependent read and this write, the row can be repointed at other bytes (an admin Replace, a
 *     sweep repoint). Writing THESE bytes' measurements onto THOSE bytes' row is how a ghost is
 *     minted, and this clause is what makes that a no-op instead.
 *
 * ── ONE STATEMENT PER OBJECT, NOT PER ROW ───────────────────────────────────────────────────
 * `id IN (...)` because the rows that share a pathname share a measurement by definition — one
 * object, one GET, one UPDATE. Deleting a folder of two hundred avatars that a conversation
 * referenced is therefore bounded by how many distinct OBJECTS are involved, not by how many rows
 * point at them, which is `deleteNinaAvatars`' own argument against a loop.
 *
 * ── WHAT IT WRITES, AND WHAT IT LEAVES ALONE WHEN SHARP FAILED ──────────────────────────────
 * `content_hash` and `bytes` always. The perceptual pair and `width`/`height` are spread in only
 * when the signature exists AND both halves normalize through the one parsers
 * (`lib/nina/perceptual.ts`) — an absent or malformed pair leaves those four columns untouched
 * rather than writing NULL over them, because "could not measure" is not the same claim as "has no
 * value" and the sweep's `fill-perceptual` op is what fills them later. It is the one place in this
 * file where `.set()` is built conditionally, and the reason is that the alternative erases data.
 *
 * Returns how many rows were written. `0` is an ordinary outcome — someone else promoted them, the
 * pathname moved, or the rows are gone — and no caller treats it as a failure.
 */
export async function promoteNinaImageMeasurements(
  userId: string,
  pathname: string,
  ids: readonly string[],
  measurement: NinaImageMeasurement,
): Promise<number> {
  if (ids.length === 0) return 0
  /* The door rule `insertNinaMessageImages` applies to a client claim, applied to a measured one:
   * a value that is not 64 lowercase hex is not one of ours and must never reach the column. */
  if (!isValidContentHash(measurement.contentHash)) return 0

  const signature = measurement.signature
  const perceptualHash =
    signature == null ? null : normalizeClaimedPerceptualHash(signature.dhashHex)
  const perceptualSig =
    signature == null ? null : normalizeClaimedPerceptualSig(signature.sig16Base64)
  const measured =
    signature != null && perceptualHash != null && perceptualSig != null
      ? { perceptualHash, perceptualSig, width: signature.width, height: signature.height }
      : {}

  const promoted = await db
    .update(ninaMessageImages)
    .set({
      contentHash: measurement.contentHash,
      bytes: measurement.bytes,
      ...measured,
    })
    .where(
      and(
        eq(ninaMessageImages.userId, userId),
        inArray(ninaMessageImages.id, [...ids]),
        eq(ninaMessageImages.pathname, pathname),
        isNull(ninaMessageImages.contentHash),
      ),
    )
    .returning({ id: ninaMessageImages.id })

  return promoted.length
}

/**
 * **Is any row still pointing at this Blob object?** The one question that stands between
 * `/admin/photos` and deleting bytes somebody is still rendering.
 *
 * ── WHY THIS EXISTS: BLOB OBJECTS ARE SHARED ────────────────────────────────────────────────
 * `resolveAttachment` (`lib/nina/actions.ts:143-192`) implements R26's re-attach by COPYING
 * `blob_url` and `pathname` onto a NEW row. No bytes are copied. Both of its branches do it:
 *
 *   · the avatar branch (`:166-174`) copies from `nina_avatars` — so a chat photograph's object can
 *     be the object behind **her current profile picture**;
 *   · the image branch (`:185-192`) copies from another `nina_message_images` row.
 *
 * So an unconditional `del()` in `/admin/photos` is a data-loss bug: her face goes blank, or an
 * earlier bubble does, while both rows still point at a dead URL. Invariant 8 (no orphaned blobs)
 * and this pull in opposite directions and correctness wins: an orphan costs storage, and a
 * deleted-but-referenced object is visible data loss the operator cannot undo.
 *
 * ── THE REFERENCE SITES ARE `scripts/blob-reap.mjs`'s, EXACTLY ──────────────────────────────
 * The reaper (`2c1e7ba`) counts references rather than reacting to a row disappearing, and it
 * enumerates six columns for the `nina/` prefix: `nina_message_images.pathname` / `.blob_url`,
 * `nina_avatars.pathname` / `.blob_url`, and `nina_avatars.thumb_pathname` / `.thumb_url`. This
 * asks the same six, so "nothing references these bytes" has ONE definition in the repo and a
 * photograph the reaper would keep is a photograph this will not delete. The URL columns are
 * checked as well as the pathname columns because a URL is the only thing `del()` is ever handed,
 * and a row whose two spellings ever disagreed would otherwise be invisible to this question. The
 * album thumbnail is the case that makes it more than symmetry: a `thumb-<id>.<ext>` object cannot
 * collide with the `selfie-<id>.jpg` shape this phase WRITES, but `resolveAttachment` can copy any
 * avatar reference onto a chat row, and a shape argument is a weaker guarantee than an `OR`.
 *
 * ── EXISTENCE, NOT A COUNT ──────────────────────────────────────────────────────────────────
 * `LIMIT 1` each — the answer is boolean. Both scoped by `user_id` (invariant 3), which is also
 * correct rather than merely conventional: Blob objects are per-user by pathname
 * (`nina/<userId>/…`), so a row of another user's cannot reference this object and a cross-user
 * read would prove nothing extra.
 *
 * ── NO "EXCEPT THIS ROW" PARAMETER, AND THAT IS A CORRECTNESS PROPERTY ──────────────────────
 * Both callers run this AFTER the row has stopped referencing the pathname — Remove deletes the row
 * (or the message, whose cascade deletes the row) first, and Replace updates the row to the NEW
 * pathname first. That is the same "row first, blob second" ordering `deleteNinaAvatarAction`
 * already states, doing a second job here: an exclusion parameter is unnecessary, and a parameter
 * that does not exist cannot be passed wrongly.
 *
 * ── COST ────────────────────────────────────────────────────────────────────────────────────
 * There is no index on any of those columns, so these are bounded scans filtered by `user_id`. At
 * this table's size (single-digit thousands of rows at the horizon, per the analysis) that is
 * correct as-is, and it runs once per human-paced remove or replace. Invariant 10 forbids adding an
 * index anyway.
 *
 * `blobUrl` is optional so the question can still be asked about a pathname alone (a reaper-style
 * caller holding a store listing); every caller in this repo passes it.
 */
export async function isBlobPathnameReferenced(
  userId: string,
  pathname: string,
  blobUrl?: string,
): Promise<boolean> {
  const [images, avatars] = await Promise.all([
    db
      .select({ id: ninaMessageImages.id })
      .from(ninaMessageImages)
      .where(
        and(
          eq(ninaMessageImages.userId, userId),
          or(
            eq(ninaMessageImages.pathname, pathname),
            ...(blobUrl == null ? [] : [eq(ninaMessageImages.blobUrl, blobUrl)]),
          ),
        ),
      )
      .limit(1),
    db
      .select({ id: ninaAvatars.id })
      .from(ninaAvatars)
      .where(
        and(
          eq(ninaAvatars.userId, userId),
          or(
            eq(ninaAvatars.pathname, pathname),
            eq(ninaAvatars.thumbPathname, pathname),
            ...(blobUrl == null
              ? []
              : [eq(ninaAvatars.blobUrl, blobUrl), eq(ninaAvatars.thumbUrl, blobUrl)]),
          ),
        ),
      )
      .limit(1),
  ])

  return images.length > 0 || avatars.length > 0
}

/**
 * **"Is an album entry still pointing at this photograph?"** `media-album-unified-search` phase 2,
 * R3 — the row-level twin of `isBlobPathnameReferenced` directly above, which is why it lives here
 * and not in `queries/avatars.ts`: that function asks "is anything still pointing at these BYTES"
 * and this asks "is anything still pointing at this ROW", and a reader looking for either should
 * find both without leaving the file.
 *
 * ── WHY A COUNT AND NOT A BOOLEAN ───────────────────────────────────────────────────────────
 * Because the caller's sentence says a number: *"2 album entries still show this photo."* A
 * `LIMIT 1` existence probe would make the operator open the album to find out how much work the
 * refusal is asking for. The statement is an index-backed equality on
 * `nina_avatars_source_image_id_idx` (phase 1's index — that exact spelling), so the count costs
 * what the probe would.
 *
 * ── WHY THE PRE-CHECK EXISTS WHEN THE FK ALREADY REFUSES ────────────────────────────────────
 * `nina_avatars.source_image_id` is `ON DELETE RESTRICT`, so Postgres refuses the delete either
 * way — as a thrown constraint violation naming a constraint the operator has never heard of,
 * surfaced by a Server Action as the framework's error page. This turns it into the shape
 * `deleteNinaAvatarAction` already uses for "that is her current photo": `ok: false` and one
 * sentence that names the fix. The constraint stays the backstop for the race this read cannot
 * close, exactly as `nina_avatars_user_source_key_unq` is the backstop for re-adoption's.
 *
 * Owner-scoped (invariant 1) and correct rather than merely conventional: another operator's album
 * cannot point at this user's photograph, and a cross-user read would prove nothing extra.
 */
export async function countNinaAvatarsLinkedToImage(
  userId: string,
  imageId: string,
): Promise<number> {
  const counted = await db
    .select({ total: sql<number>`count(*)`.mapWith(Number) })
    .from(ninaAvatars)
    .where(and(eq(ninaAvatars.userId, userId), eq(ninaAvatars.sourceImageId, imageId)))
  return counted[0]?.total ?? 0
}

/**
 * Stamp `glm-4.6v`'s prose on a conversation photograph. The mirror of `setNinaAvatarDescription`
 * in `lib/nina/queries/avatars.ts`, and it exists for the mirror reason: a hand-uploaded photograph has no generation prompt,
 * so a vision model is the only way this column is ever filled for one (invariant 5 — the prose is
 * private and its only consumer is Nina's prompt).
 *
 * Returns whether a row was hit, so an `after()` callback whose row was deleted while it ran logs a
 * miss instead of pretending it wrote something.
 */
export async function setNinaMessageImageDescription(
  userId: string,
  id: string,
  description: string,
): Promise<boolean> {
  const updated = await db
    .update(ninaMessageImages)
    .set({ description })
    .where(and(eq(ninaMessageImages.userId, userId), eq(ninaMessageImages.id, id)))
    .returning({ id: ninaMessageImages.id })

  return updated.length > 0
}

/**
 * **EDIT: the operator rewrites what she can see in a photograph.** R2 of
 * `nina-photo-refs-and-bubble-actions`, verbatim: *"there is a 'what she can see in it' field. make
 * this field editable by user"*.
 *
 * ── WHY THIS IS NOT `setNinaMessageImageDescription` WITH A WIDER SIGNATURE ────────────────
 * Three differences, and each one is load-bearing:
 *
 *   · The WHERE carries `isOriginalPhoto()` — both provenance columns must be NULL. Since the
 *     image-collection merge, EVERY original row of this table is describable from the admin
 *     surface: hers AND his, which is why the old `kind = 'generated'` clause is gone. What the
 *     clause is replaced with is the reference backstop: a row carrying `source_avatar_id` /
 *     `source_image_id` is a re-SHOW of a photograph that lives elsewhere, the action refuses it
 *     first, and this clause is the second of the two agreeing checks — a stale client that slips
 *     the refusal updates nothing. `setNinaMessageImageDescription` has no such clause and must NOT
 *     grow one: its caller is `after()`'s describe pass, which legitimately describes both sides.
 *   · `description` is `string | null` here. NULL is the operator CLEARING the field (the phase's
 *     D1), and it is not a new state for the row — `updateNinaChatPhotoBlob` writes it in the same
 *     breath as a replace, and every `addChatPhotoAction` row starts there.
 *     `setNinaMessageImageDescription` takes a `string` because a vision pass that produced nothing
 *     writes nothing.
 *   · It returns the ROW rather than a boolean, because its caller reports on what it wrote. That is
 *     `updateNinaChatPhotoBlob`'s shape; the boolean is the `after()`-callback shape, for a caller
 *     whose only options are "log a miss" and "log a write".
 *
 * ── IT TOUCHES ONE COLUMN, AND THE ABSENCES ARE THE CONTRACT ──────────────────────────────
 *   · NOT `kind` — a hand-corrected description does not turn one of his uploads into one of hers;
 *     `kind` is the his/hers discriminator and only the bytes' origin writes it.
 *   · NOT `prompt` — the generation sidecar for bytes that have not changed.
 *   · NOT `created_at` — `nina_message_images_user_created_idx` orders the gallery and the Media
 *     view by it. Correcting a sentence about a photograph is not taking a new one.
 *   · NOT `blob_url`, `pathname`, or the four measurements — the picture is the same picture.
 *   · NOTHING on `nina_messages`. The bubble's caption is what she SAID; this column is what she
 *     SAW. Rewriting the second from `/admin` must not silently rewrite the first in the runner's
 *     conversation — see the action's docstring.
 *
 * ── NO INVALIDATION STEP, BY CONSTRUCTION ─────────────────────────────────────────────────
 * `resolveAttachment` re-reads this row with `getNinaMessageImage` on every send, and
 * `lib/nina/actions.ts:634-637` hands the value straight to
 * `NinaBackgroundTurnInput.imageDescriptions`. So the next turn that carries this photograph reads
 * what was just written, with no cache to bust. A NULL degrades exactly as a replace's NULL does:
 * `NINA_DESCRIPTION_UNAVAILABLE` is substituted and she asks him what the picture is.
 */
export async function updateNinaChatPhotoDescription(
  userId: string,
  id: string,
  description: string | null,
): Promise<NinaImageRow | null> {
  const updated = await db
    .update(ninaMessageImages)
    .set({ description })
    .where(
      and(eq(ninaMessageImages.userId, userId), eq(ninaMessageImages.id, id), isOriginalPhoto()),
    )
    .returning(imageColumns)

  return updated[0] ?? null
}
