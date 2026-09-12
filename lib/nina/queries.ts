import {
  and,
  asc,
  desc,
  eq,
  gt,
  gte,
  inArray,
  isNotNull,
  isNull,
  notExists,
  or,
  sql,
  type SQL,
} from 'drizzle-orm'
import type { PgColumn } from 'drizzle-orm/pg-core'

import { db } from '@/lib/db'
import {
  ninaAvatars,
  ninaFolders,
  ninaImagePrefs,
  ninaMemoryFacts,
  ninaMemorySlots,
  ninaMessageImages,
  ninaMessages,
  ninaNags,
  ninaShortcuts,
  ninaTuning,
  ninaTurns,
  type NinaFactCategory,
  type NinaImageKind,
  type NinaImagePrefsRow,
  type NinaMemorySource,
  type NinaSlotValue,
  type NinaTuningRow,
  type NinaTurnKind,
} from '@/lib/db/schema'
import { newId } from '@/lib/id'
import {
  NINA_ADMIN_BATCH_MAX,
  NINA_ADMIN_MANIFEST_MAX,
  NINA_ADMIN_PAGE_SIZE,
  NINA_CHAT_PHOTO_PAGE_SIZE,
} from '@/lib/nina/album'
import {
  coerceNinaImagePrefs,
  mergeNinaPhotoRefs,
  NINA_IMAGE_PREFS_DEFAULTS,
  ninaPhotoRefBounds,
  type NinaImagePrefs,
  type NinaImagePrefsWrite,
  type NinaImageReference,
  type NinaPhotoRef,
  type NinaPhotoRefPage,
} from '@/lib/nina/imageprefs'
import {
  classifyNinaTrigger,
  normalizeNinaTrigger,
  type NinaShortcutKind,
} from '@/lib/nina/shortcuts'
import { coerceNinaTuning, NINA_TUNING_DEFAULTS, type NinaTuning } from '@/lib/nina/tuning'
import { isValidContentHash } from '@/lib/photos/contentHash'
import {
  normalizeClaimedPerceptualHash,
  normalizeClaimedPerceptualSig,
} from '@/lib/nina/perceptual'
import type {
  NinaAvatarBatchInsert,
  NinaAvatarBlobRef,
  NinaAvatarCrop,
  NinaAvatarFolderCount,
  NinaAvatarFolderPage,
  NinaAvatarInsert,
  NinaAvatarManifestEntry,
  NinaAvatarRow,
  NinaFactInsert,
  NinaFactRow,
  NinaFolderRenameResult,
  NinaImageInsert,
  NinaImageRow,
  NinaMediaPage,
  NinaMessageInsert,
  NinaMessageRow,
  NinaNagRow,
  NinaNagUpsert,
  NinaShortcutInsert,
  NinaShortcutPatch,
  NinaShortcutRecord,
  NinaSlotRow,
  NinaSlotUpsert,
  NinaTurnInsert,
} from './queries/shapes'
import { avatarColumns, imageColumns, messageColumns } from './queries/columns'
import { getNinaSession } from './queries/sessions'

/**
 * Every Nina read and write, in one module — `lib/db/queries.ts` for `lib/nina/`.
 *
 * ## The two invariants it inherits
 *
 * **1. userId scoping (roadmap D8, plan invariant 7).** Every exported function takes `userId`
 * as its first parameter and that value is in the `WHERE` of every statement it runs. There is
 * NO exception in this file — `lib/db/queries.ts` has exactly one (`getRunByShareToken`, where a
 * 96-bit token is the credential) and nothing here is credential-addressed. `userId` comes from
 * the session via `requireUserId()`, never from a Server Action argument or a URL segment.
 *
 * A row that exists but is not yours and a row that does not exist are the same outcome. These
 * functions return `null`, `[]` or `false` rather than throwing a `NotFoundError`, because every
 * caller is either Nina's own turn loop (which must degrade, not 500) or an admin screen (which
 * shows "gone" rather than an error page). Nothing here distinguishes absent from forbidden.
 *
 * **2. She never writes her own SQL against `runs` (plan invariant 9).** There is not one
 * reference to `runs`, `records`, `badges` or `insights` below. Nina's view of the training
 * history comes from `lib/db/queries.ts` through `lib/nina/load.ts`, so `reviewed_at IS NOT NULL`
 * keeps gating every aggregate she sees without this file having to remember to.
 *
 * ## Why `db.batch` and never `db.transaction`
 *
 * `db.transaction()` throws on the neon-http driver. `db.batch([...])` is one HTTP request that
 * Postgres runs inside one transaction. Same rule as `lib/db/queries.ts`, same reason.
 *
 * ## Ordering
 *
 * `nina_messages.seq` is a `bigserial`, so `ORDER BY seq` is the emission order of the whole
 * conversation and nothing in this file needs a composite sort or a tiebreak. See that table's
 * header for why a timestamp could not do the job.
 *
 * **No `import 'server-only'`.** `lib/db/queries.ts` does not have it either, deliberately:
 * adding it would make this module unimportable from Vitest and from `scripts/*.mjs`, and phase
 * 14's operator script is a `scripts/*.mjs`.
 */

/* ============================================================================
 * The barrel — the public surface, assembled from ./queries/
 *
 * Each domain module under `lib/nina/queries/` is re-exported here with `export *`, one
 * line per module, added by the phase that creates it. `export *` rather than an explicit
 * list, because verbatimModuleSyntax would force `export type` on every interface and no
 * two modules declare the same name. The header above is still the layer's contract and
 * governs every module listed.
 *
 * The four column lists of `./queries/columns` are imported at the top of this file, never
 * re-exported: they were private before the split and stay internal — shared between
 * sibling query modules only.
 * ==========================================================================*/

export * from './queries/shapes'
export * from './queries/sessions'

/* ---------------------------------------------------------------------------
 * §4b The messages
 *
 * **The session is REQUIRED on the three functions that carry the partition** — `listNinaMessages`,
 * `getNinaMessageWindow` and `insertNinaMessages`. Phase 1 shipped it optional so that the tree
 * compiled with no caller touched; F35 phase 3 removed the option, and that removal is not tidying,
 * it is the proof. `nina_messages.session_id` is `NOT NULL`, there are exactly three writers of
 * this table (`lib/nina/actions.ts`, `lib/nina/proactive.ts`, `lib/nina/imagejobs.ts`), and two of
 * them run with no runner present and no session in view. A defaulted parameter would let one of
 * them keep compiling while writing into the wrong conversation, which is invisible until Nina
 * answers a question from another topic. Required means `tsc` names every writer that has not
 * decided — and all three now resolve through `lib/nina/sessionResolve.ts`, where assumption A3's
 * policy lives once.
 *
 * `countUnreadNinaMessages` and `markNinaMessagesRead` keep theirs optional for good: "how many of
 * hers are unread across every session" is the tab bar's question and "in this session" is the
 * screen's, and both are real.
 * -------------------------------------------------------------------------*/

/**
 * `user_id = $1`, plus `session_id = $2` when there is one. The `folderSubtree` idiom — a predicate
 * spelled once so several statements cannot drift apart.
 *
 * The session is optional HERE and required at three of the four call sites, which is not a
 * contradiction: `countUnreadNinaMessages` and `markNinaMessagesRead` genuinely ask their question
 * both ways (see §4b's header), and `getNinaMessageWindow` no longer uses this helper at all
 * because its two statements deliberately disagree about scope (F35 phase 3, D4).
 *
 * **This is also the ownership proof for every READ that takes a session id** (invariant 3). The
 * session predicate is ANDed onto the user predicate, never substituted for it, so a forged or
 * foreign `?s=` returns zero rows instead of somebody else's conversation. The one case a predicate
 * cannot cover is an INSERT, which is why `insertNinaMessages` checks by hand.
 */
function messageScope(userId: string, sessionId?: string): SQL | undefined {
  return sessionId == null
    ? eq(ninaMessages.userId, userId)
    : and(eq(ninaMessages.userId, userId), eq(ninaMessages.sessionId, sessionId))
}

/**
 * The last `limit` messages, returned **OLDEST FIRST** — display order, which is what phase 4's
 * `app/nina/page.tsx` renders straight down the page.
 *
 * The query itself is `ORDER BY seq DESC LIMIT n` and the array is reversed in TypeScript,
 * because "the newest n" is an index-backed descending scan of n rows while "the oldest n of the
 * tail" is not expressible without knowing where the tail starts. Reversing `n <= 200` items is
 * free; reading the whole conversation to reverse it would not be.
 *
 * ── `sessionId` IS REQUIRED (F35 PHASE 3, R2) ─────────────────────────────────────────────────
 * `opts.sessionId` slices that scan to one session, reading `nina_messages_session_seq_idx`. Phase
 * 1 shipped it optional to keep the tree green; this is the parameter phase 3 made required.
 * **`seq` is still the order** (invariant 6) — the session is a WHERE clause, not a re-sort, and no
 * per-session sequence exists.
 *
 * The caller is expected to have proved the session is his (`chooseActiveSession` over
 * `listNinaSessions`), but the `user_id` predicate stays anyway: invariant 3 says every statement in
 * this file scopes on the owner, and a foreign session id here comes back as `[]` rather than as
 * somebody else's conversation.
 */
export async function listNinaMessages(
  userId: string,
  opts: { limit: number; sessionId: string },
): Promise<NinaMessageRow[]> {
  const rows = await db
    .select(messageColumns)
    .from(ninaMessages)
    .where(messageScope(userId, opts.sessionId))
    .orderBy(desc(ninaMessages.seq))
    .limit(opts.limit)

  return rows.reverse()
}

/**
 * **The poll's read (F36 R6): everything in one session newer than a `seq` the client already
 * holds, oldest first.**
 *
 * ── WHY A CURSOR AND NOT A RE-READ OF THE WHOLE WINDOW ────────────────────────────────────────
 * `ChatScreen` polls this every 1.5–4 s while a turn is in flight, and it needs exactly the rows it
 * does not have — because those rows are then handed to `planReveal`, which staggers them. Handing
 * back the whole 200-row window instead would mean the client diffing it, and `mergeServerMessages`
 * (the diff it already has) deliberately delivers everything in ONE frame. That is correct for a
 * push-driven refresh and wrong here: it would collapse RU-5's four-bubble reveal into a single
 * paint, which is the exact inversion `ChatScreen`'s header spends a paragraph forbidding.
 *
 * `seq` is a `bigserial` and therefore a total order Postgres assigns (invariant 6), so "> cursor"
 * is a strict, gap-tolerant cursor: a row inserted concurrently gets a higher `seq` and is simply
 * on the next poll.
 *
 * `limit` is a safety rail, not a page size. A turn emits at most `MAX_BUBBLES` (4) and a burst can
 * add a handful of his own rows, so 50 is far past anything a single poll can legitimately see; a
 * poll that hits it is a poll whose caller lost its cursor.
 *
 * The `user_id` predicate stays alongside the session predicate, exactly as `messageScope` requires
 * (invariant 3): a forged `sessionId` from a client comes back as `[]`, never as somebody else's
 * conversation.
 */
export async function listNinaMessagesAfter(
  userId: string,
  opts: { sessionId: string; afterSeq: number; limit?: number },
): Promise<NinaMessageRow[]> {
  return db
    .select(messageColumns)
    .from(ninaMessages)
    .where(and(messageScope(userId, opts.sessionId), gt(ninaMessages.seq, opts.afterSeq)))
    .orderBy(asc(ninaMessages.seq))
    .limit(opts.limit ?? 50)
}

/**
 * `readMessageWindow`'s query: the last `limit` messages **of one session**, oldest-first, plus how
 * many of his messages exist that this window does not show.
 *
 * ── THE WINDOW IS SESSION-SCOPED. THE COUNT IS NOT. (F35 PHASE 3, D4) ────────────────────────
 * The asymmetry is deliberate and it is the whole of assumption A1's safety margin, so it must not
 * be "fixed" into symmetry.
 *
 * The WINDOW carries the session predicate because that is what R2 means: "focus on a new topic" is
 * a claim about what Nina is GIVEN TO READ, not only about what the screen shows. This window is
 * handed to `glm-5.3` on every turn, so without the predicate a new session would look new and
 * behave exactly like the old one.
 *
 * The COUNT stays `WHERE user_id = $1` because of what the prompt does with it.
 * `lib/nina/prompts/system.ts` reads: *"An EMPTY window means you have never spoken to him —
 * introduce yourself and ask his name. `olderMessageCount` above 0 means there is more history you
 * cannot see."* Scope the count to the session as well and every new session presents to her as a
 * brand-new runner: empty window, zero older, so she introduces herself and asks his name again.
 * Left user-wide, `olderCount` reads as "how much of his history you are not being shown" — which
 * is exactly true, covers both "earlier in this chat" and "in his other chats", and keeps the
 * introduce-yourself branch for the one person it is for. No prompt string had to change.
 *
 * `olderCount` is a SQL `count(*)` minus the window's length — never `allMessages.length - limit`,
 * which would mean materialising the whole conversation to compute one integer. One batch, so the
 * count and the window are the same snapshot and the number can never disagree with the rows.
 */
export async function getNinaMessageWindow(
  userId: string,
  limit: number,
  sessionId: string,
): Promise<{ messages: NinaMessageRow[]; olderCount: number }> {
  const [rows, countRows] = await db.batch([
    db
      .select(messageColumns)
      .from(ninaMessages)
      .where(and(eq(ninaMessages.userId, userId), eq(ninaMessages.sessionId, sessionId)))
      .orderBy(desc(ninaMessages.seq))
      .limit(limit),

    /* USER-WIDE ON PURPOSE. See the header — this is not a missed predicate. */
    db
      .select({ total: sql<number>`count(*)`.mapWith(Number) })
      .from(ninaMessages)
      .where(eq(ninaMessages.userId, userId)),
  ])

  const total = countRows[0]?.total ?? 0
  return { messages: rows.reverse(), olderCount: Math.max(0, total - rows.length) }
}

/**
 * **One multi-row INSERT, not a batch of single inserts, and that is the R for phase 4's
 * ordering.** Postgres evaluates `nextval` once per row in the order the `VALUES` list gives
 * them, so `seq` comes out ascending in emission order — bubble 1 before bubble 4, always. A
 * `db.batch` of four separate inserts would also work today but does not promise it.
 *
 * Returns the inserted rows in the same order, ids and `seq` included, because phase 3 needs the
 * ids to hand back to the client and phase 6 needs them to attach images.
 *
 * ── THE SESSION IS REQUIRED, AND NOWHERE NULLABLE BELOW THIS LINE (F35 PHASE 3, R2) ─────────
 * `nina_messages.session_id` is `NOT NULL`, so unlike the reads above this one cannot simply omit a
 * predicate. Phase 1 shipped the parameter optional and resolved an omission through
 * `ensureNinaSession`; phase 3 removed both the option and the fallback, because a defaulted
 * session is exactly the bug that would be invisible — a writer keeps compiling while filing its
 * turn into the wrong conversation. All three writers now resolve through
 * `lib/nina/sessionResolve.ts` before they call this, which is where assumption A3's policy lives.
 *
 * `sendNinaMessage`'s INPUT is `string | null`, because "he has no sessions yet" is a real state a
 * client can be in; by the time a row reaches this function that has been resolved to an id.
 *
 * ── AND IT IS THE SECOND PLACE IN THIS FILE THAT VALIDATES AN FK BY HAND ────────────────────
 * `insertNinaMessageImages` was the first, for the same reason: the foreign key proves the session
 * EXISTS, and a session id that exists but is someone else's is exactly what invariant 3 is about. A
 * write that trusted it would file his message into a stranger's conversation, where a cascade could
 * later delete it. So an unowned session returns `[]`, the convention that function set — and
 * `actions.ts`'s existing `throw new Error('insertNinaMessages returned no row')` turns that into a
 * visible send failure rather than a silent one.
 */
export async function insertNinaMessages(
  userId: string,
  rows: readonly NinaMessageInsert[],
  sessionId: string,
): Promise<NinaMessageRow[]> {
  if (rows.length === 0) return []

  const owned = await getNinaSession(userId, sessionId)
  if (owned == null) return []
  const target = owned.id

  const inserted = await db
    .insert(ninaMessages)
    .values(
      rows.map((row) => ({
        id: newId(),
        userId,
        /* `target` is the required third parameter, proved owned above — so there is no `??` here,
         * no default, and no per-row session: a writer that has not resolved one does not compile. */
        sessionId: target,
        role: row.role,
        text: row.body,
        source: row.source ?? 'chat',
        turnId: row.turnId ?? null,
        replyToId: row.replyToId ?? null,
        runId: row.runId ?? null,
        photoOnly: row.photoOnly ?? false,
      })),
    )
    .returning(messageColumns)

  return [...inserted].sort((a, b) => a.seq - b.seq)
}

/**
 * Phase 7 resolves a quote target; phase 4 hydrates after an optimistic send. Scoped, so a
 * foreign id simply does not come back.
 */
export async function getNinaMessagesByIds(
  userId: string,
  ids: readonly string[],
): Promise<NinaMessageRow[]> {
  if (ids.length === 0) return []
  return db
    .select(messageColumns)
    .from(ninaMessages)
    .where(and(eq(ninaMessages.userId, userId), inArray(ninaMessages.id, [...ids])))
    .orderBy(asc(ninaMessages.seq))
}

/**
 * Phase 10's unread dot. Reads `nina_messages_user_unread_idx` exactly — the partial index exists
 * for this one query, which runs on every render of the tab bar.
 *
 * **`opts.sessionId` is permanent, not a migration step (F35 R9).** Unscoped is the tab bar's
 * question — "is there anything of hers I have not read, anywhere" — and scoped is the screen's,
 * and F35 phase 8 is the phase that decides which one clears the dot. Scoped, the partial index is
 * still the index that answers it: `session_id` is a heap filter over a set that holds only unread
 * messages of hers, which is a handful of rows by construction.
 */
export async function countUnreadNinaMessages(
  userId: string,
  opts: { sessionId?: string } = {},
): Promise<number> {
  const rows = await db
    .select({ n: sql<number>`count(*)`.mapWith(Number) })
    .from(ninaMessages)
    .where(
      and(
        messageScope(userId, opts.sessionId),
        eq(ninaMessages.role, 'nina'),
        isNull(ninaMessages.readAt),
      ),
    )
  return rows[0]?.n ?? 0
}

/**
 * Opening the chat marks everything of hers read. `opts.now` is a parameter so a test pins a date
 * instead of mocking global time — `lib/profile/schema.ts`'s `toProfileWrite` precedent.
 * Returns how many rows changed, so phase 10 can skip a `revalidatePath` when nothing did.
 *
 * **`now` moved from a positional parameter into an options bag (F35 R9), and that is the only shape
 * change in this file.** `sessionId` behind an optional `now` would have forced phase 8 to write
 * `markNinaMessagesRead(userId, undefined, sessionId)`. No caller or test in the repo ever passed
 * `now`, so nothing breaks; `app/nina/page.tsx`'s `markNinaMessagesRead(userId)` is unchanged.
 *
 * `opts.sessionId` scopes the mark to one conversation, which is what makes "has he opened the most
 * recent chat" answerable at all — phase 8 decides whether an unread message sitting in an OLDER
 * session should still raise the dot, and it needs both shapes to be able to choose.
 */
export async function markNinaMessagesRead(
  userId: string,
  opts: { sessionId?: string; now?: Date } = {},
): Promise<number> {
  const updated = await db
    .update(ninaMessages)
    .set({ readAt: opts.now ?? new Date() })
    .where(
      and(
        messageScope(userId, opts.sessionId),
        eq(ninaMessages.role, 'nina'),
        isNull(ninaMessages.readAt),
      ),
    )
    .returning({ id: ninaMessages.id })
  return updated.length
}

/* ---------------------------------------------------------------------------
 * §4c Message mutation — F35 PHASE 7's, and written here at phase 1's invitation.
 *
 * `updateNinaMessage(userId, id, body)` and `deleteNinaMessage(userId, id)` belong in THIS section,
 * between `markNinaMessagesRead` above and the `§5 Images` banner below. Phase 7 writes them,
 * because it owns the rule about what may be edited and what an empty edit means, and a statement
 * with no rule behind it would be a statement nobody could review. That rule is
 * `lib/nina/edit.ts`; these two statements are its only writers.
 *
 * Two facts they inherit rather than deciding for themselves: a deleted message still takes its
 * photo ROWS (never its blobs) — **no longer by cascade, but by an explicit statement inside
 * `deleteNinaMessage`; see its header** — and `reply_to_id` is `ON DELETE SET NULL` so a quote
 * pointing at a deleted message degrades to plain text, which `resolveQuote` already handles.
 * -------------------------------------------------------------------------*/

/**
 * R8's edit, as one statement. **`user_id` is in the WHERE, so a foreign id updates nothing and
 * comes back as `null`** — which is the refusal `lib/nina/messageActions.ts` reports, not a
 * degradation. Invariant 3's rule: a message id from a client is a claim; a row that came back
 * from an owner-scoped write is a fact.
 *
 * ── WHAT IT DELIBERATELY DOES NOT TOUCH ───────────────────────────────────────────────────────
 *   · `seq` — invariant 6. Sessions slice the total order and an edit does not move a message in
 *     it. Rewriting a bubble is not re-sending it.
 *   · `sent_at` — the message was sent when it was sent. Bumping it would reorder the day dividers
 *     `groupIntoDays` draws and would tell Nina, through `ConversationTurn.daysAgo`, that a
 *     three-week-old message is new.
 *   · `read_at` — an edit to one of her messages is not a new unread message.
 *   · `turn_id` — and this one is a decision rather than an omission. `nina_turns` holds NO
 *     message text (see the table: model, tokens, latency, cost, status, and an `args` blob that is
 *     NULL for every non-image kind), so there is nothing for the new text to contradict. What the
 *     turn row asserts is that a model call happened and what it cost, which stays true. Nulling
 *     the pointer would falsify the cost ledger, which is the one question that table exists to
 *     answer. (In practice the column is NULL on every chat and proactive row anyway — no caller
 *     of `insertNinaMessages` has ever passed a `turnId` except `lib/nina/imagejobs.ts`, which
 *     stores an image-job id there.)
 *
 * No session parameter, and that is deliberate: `id` is the primary key and `user_id` is the
 * ownership proof, so a session argument would be redundant and would create a way to pass a
 * mismatched pair. Phase 1's message READS are session-scoped because a window is a slice; a
 * mutation addressed by primary key is not.
 *
 * The DTO spelling is `body` and the column is `text` (RULING A1). The `.set({ text: body })`
 * below is the only place in this function where those two meet, exactly as `insertNinaMessages`
 * does it.
 */
export async function updateNinaMessage(
  userId: string,
  id: string,
  body: string,
): Promise<NinaMessageRow | null> {
  const updated = await db
    .update(ninaMessages)
    .set({ text: body })
    .where(and(eq(ninaMessages.userId, userId), eq(ninaMessages.id, id)))
    .returning(messageColumns)

  return updated[0] ?? null
}

/**
 * R8's delete. Owner-scoped, returning the row as it was so the caller can report exactly which id
 * is gone — and now TWO statements in one transaction rather than one.
 *
 * ── WHY THE SECOND STATEMENT EXISTS (R1 of the orphans set) ──────────────────────────────
 * `nina_message_images.message_id` used to be `ON DELETE CASCADE`, and this function relied on it:
 * item 2 below read *"`nina_message_images` rows CASCADE away ('an image with no message is
 * nothing')"*. R1 changed the column to `ON DELETE SET NULL`, because a deleted SESSION must leave
 * its photographs standing. That FK fires for both delete paths and cannot tell them apart, so
 * without the statement below a deleted BUBBLE would silently start leaving a floating photograph
 * behind — a visible change to `/admin/photos` that nobody asked for.
 *
 * So the two paths get different answers from one column, and the split is deliberate: the
 * preserving behaviour lives on the FK, where `removeNinaSession` gets it for free by not changing,
 * and the deleting behaviour lives here, in the one function that wants it. The plan set's
 * Decisions table records the ruling and its rung — the runner's raw input names the session delete
 * only, twice, and a bubble whose only content is a photograph is the operator saying "delete this
 * photograph".
 *
 * ── THE ORDER IS LOAD-BEARING ─────────────────────────────────────────────────
 * Images FIRST. If the message went first, the FK would set every one of its image rows'
 * `message_id` to NULL, and the image delete's `message_id = $2` would then match nothing and leave
 * the photographs behind — the exact regression this function exists to prevent, and it would ship
 * green because the message delete still returns the row. `db.batch` runs the array in order inside
 * ONE transaction (`db.transaction()` throws on the neon-http driver), so there is no window
 * between them and neither can land without the other.
 *
 * `user_id` is in the WHERE of both statements (invariant 4): a message id from a client is a
 * claim, and the image delete must not be reachable with somebody else's message id even though
 * the message delete beside it would refuse.
 *
 * ── THREE THINGS THE DATABASE STILL DOES ON ITS OWN ─────────────────────────────────
 *   1. **`reply_to_id` is nulled** on every message that quoted this one — the self-FK's
 *      `ON DELETE SET NULL`. `resolveQuote` already documents a null pointer as "render it as a
 *      plain message", so a quote degrades instead of throwing.
 *   2. **`nina_message_images.message_id` would be nulled** — which is exactly what the first
 *      statement below pre-empts. The Blob bytes are NOT deleted and nothing in this tree reaps
 *      them; `lib/nina/messageActions.ts` logs the orphaned pathnames on the way out so they are at
 *      least findable, and it reads them BEFORE calling this function, which is still the only
 *      order that works.
 *   3. **`nina_memory_slots.source_message_id` and `nina_memory_facts.source_message_id` are left
 *      DANGLING**, because neither is a foreign key and nothing cascades. The only readers collapse
 *      the column to a boolean, and the fact-permission rule uses it to keep in-place editing of a
 *      distilled fact barred — still the right answer once the evidence is gone. A distilled fact
 *      may be true after the sentence that produced it is gone; cascading it away would let one
 *      deleted message quietly rewrite her long-term memory. (A deleted SESSION is the opposite
 *      case and `removeNinaSession` purges the ledger itself.)
 *
 * `nina_turns` is untouched for the reason `updateNinaMessage` gives: deleting a message must not
 * retroactively make her cheaper. `turn_id` has no FK precisely so "an audit pointer must not be
 * able to block a delete", and the inverse holds too.
 *
 * The return value is unchanged — the message row, or `null` for "not yours, or already gone".
 * The image delete's count is deliberately not surfaced: a return value nothing consumes is a
 * promise this set has not made, and `messageActions` already has the pathnames it wanted.
 */
export async function deleteNinaMessage(
  userId: string,
  id: string,
): Promise<NinaMessageRow | null> {
  const [, deleted] = await db.batch([
    /* 1. The photographs on this bubble, while it still exists. See the header on the order. */
    db
      .delete(ninaMessageImages)
      .where(and(eq(ninaMessageImages.userId, userId), eq(ninaMessageImages.messageId, id))),

    /* 2. And only now the message. `RETURNING` is what makes ownership a fact rather than a
     *    claim — and if it comes back empty, statement 1 selected nothing either, because both
     *    carry the same `user_id`. */
    db
      .delete(ninaMessages)
      .where(and(eq(ninaMessages.userId, userId), eq(ninaMessages.id, id)))
      .returning(messageColumns),
  ])

  return deleted[0] ?? null
}

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
         * goes inactive for that row, and the send does not fail. No caller sends one yet.
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
 * Phase 13's gallery: every image in the conversation, newest first, his and hers together. Reads
 * `nina_message_images_user_created_idx` with no join — which is the whole reason this is a table
 * and not a `jsonb` column on `nina_messages`.
 *
 * **F37 R3: not quite every image — a REFERENCE is skipped.** `/nina/about`'s Media section is a
 * collection of the photographs in the conversation, and a row whose bytes are already in the
 * album (or already further up the feed) is the same photograph, not a second one. The row itself
 * is untouched and its bubble still renders it; see `isOriginalPhoto` for the three reads that
 * filter and the four that must not.
 *
 * `limit` still bounds the ROWS RETURNED and not the rows examined, so hiding a reference lets one
 * more original through rather than leaving a gap — which is what the caller wants from a feed.
 */
export async function listNinaMessageImages(
  userId: string,
  opts: { limit: number },
): Promise<NinaImageRow[]> {
  return db
    .select(imageColumns)
    .from(ninaMessageImages)
    .where(and(eq(ninaMessageImages.userId, userId), isOriginalPhoto()))
    .orderBy(desc(ninaMessageImages.createdAt), desc(ninaMessageImages.id))
    .limit(opts.limit)
}

/**
 * One conversation photo by id, ownership-scoped. The mirror of `getNinaAvatar` in §9, and it
 * exists for the same reason: `app/nina/page.tsx` has to turn ONE id from a URL into ONE blob URL
 * during a render, and `listNinaMessageImages(...).find(...)` reads up to `NINA_GALLERY_LIMIT`
 * rows to answer it.
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
 * `(created_at desc, id desc)` is `listNinaMessageImages`'s ordering with the same `id` tiebreak
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
 *   · `listNinaMessageImages`   → /nina/about's Media feed
 *   · `countNinaChatPhotos`     → the reference picker's chat-side total, via the same scope
 *   · `listNinaMediaPhotos` + `countNinaMediaPhotos` → /admin/nina?view=media and its tree badge,
 *                                 via `mediaCollectionScope` — the all-kinds superset of the
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
function isOriginalPhoto(): SQL | undefined {
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
 * image-reference picker's — `listNinaPhotoReferences` (page side) and `countNinaChatPhotos` (its
 * total) and `resolveNinaPhotoReference` (the stored selection) — a picker grid that shows her
 * GENERATED photographs only, which is the one set this scope still names.
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
 * not shared" is deliberate (an album delete calls `del` with no reference check, so a shared
 * object would blank the chat bubble the day the album row went away), and a new column would be a
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
 * ── WHY THE OTHER TWO SCOPES DO NOT GET THIS ARM ─────────────────────────────────────────────
 * `mediaCollectionScope` and `listNinaMessageImages` must NOT grow it. An adopted chat row is
 * still a real photograph in a real bubble, and the Media view is where the operator goes to
 * Replace or Remove it; hiding it there would take away the only handle on it. The user asked for
 * the PICKER to deduplicate, and the picker is the only surface that changes.
 */
function generatedChatPhotoScope(userId: string) {
  /* The outer parentheses are load-bearing and hand-written, for `removeNinaSession`'s measured
   * reason (:1025-1030): `notExists()` emits `not exists ` followed by its argument's chunks
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

/**
 * How many photographs the collection holds, as a number rather than as a list of rows.
 *
 * One caller needs the integer and nothing else: `listNinaPhotoReferences`, whose picker total is
 * the album count plus this one — the mistake `countNinaAvatars` (:2336) was written to undo, not
 * repeated here. (The `/admin` hub card and the `/admin/photos` page that used to read it are gone
 * with the surface merge; the Media view counts with its own all-kinds read.)
 *
 * `id` is the final tiebreak in the sibling's ORDER BY because `created_at` ties for rows written
 * in one statement; it has no bearing here, and is noted so the two are not "fixed" into agreement.
 */
export async function countNinaChatPhotos(userId: string): Promise<number> {
  const counted = await db
    .select({ total: sql<number>`count(*)`.mapWith(Number) })
    .from(ninaMessageImages)
    .where(generatedChatPhotoScope(userId))
  return counted[0]?.total ?? 0
}

/* ============================================================================
 * §5a-2 The Media view — every ORIGINAL photograph, both kinds (R1)
 *
 * `/admin/nina?view=media` reads these. The membership is the exact set `/nina/about`'s Media
 * section shows (`listNinaMessageImages` + `isOriginalPhoto`) — NOT `/admin/photos`' generated-only
 * scope: the folder the user asked for is "semua foto - foto yang saat ini ada di Media", his
 * uploads included. Kept beside the generated pair rather than merged into it on purpose:
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
    })
    .where(
      and(eq(ninaMessageImages.userId, userId), eq(ninaMessageImages.id, id), isOriginalPhoto()),
    )
    .returning(imageColumns)

  return updated[0] ?? null
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
 * Stamp `glm-4.6v`'s prose on a conversation photograph. The mirror of `setNinaAvatarDescription`
 * in §9, and it exists for the mirror reason: a hand-uploaded photograph has no generation prompt,
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

/* ============================================================================
 * §6 Memory — slots and the ledger (RU-6)
 * ==========================================================================*/

/**
 * `nina_memory_slots.value` is `jsonb`, and phase 2's context wants a display string. This is the
 * one place that conversion happens.
 *
 * A bare JSON string is returned as itself — no quotes, no escaping — which is the common case
 * and the reason the column is `jsonb` rather than two columns. Anything structured is
 * `JSON.stringify`d, which is honest rather than pretty: a structured slot in a prompt should
 * look like data, because it IS data, and `pending_promises` is read by phase 13's evaluator and
 * not by the sentence Nina is writing.
 */
function renderSlotValue(value: NinaSlotValue): string {
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return JSON.stringify(value)
}

/**
 * Phase 2's `readMemorySlots`. Every slot for this user — a leading-column PK scan, which is why
 * the table has no secondary index. Ordered by `key` so two identical states produce two
 * identical prompts, which is what makes a voice regression bisectable.
 */
export async function getNinaMemorySlots(userId: string): Promise<NinaSlotRow[]> {
  const rows = await db
    .select({
      key: ninaMemorySlots.key,
      value: ninaMemorySlots.value,
      source: ninaMemorySlots.source,
      sourceMessageId: ninaMemorySlots.sourceMessageId,
      updatedAt: ninaMemorySlots.updatedAt,
    })
    .from(ninaMemorySlots)
    .where(eq(ninaMemorySlots.userId, userId))
    .orderBy(asc(ninaMemorySlots.key))

  return rows.map((row) => ({ ...row, value: renderSlotValue(row.value) }))
}

/**
 * One slot, **parsed** — the counterpart to `getNinaMemorySlots`' rendering. Phase 13 calls it
 * with `NINA_SLOT_PENDING_PROMISES` and casts the result to `NinaPendingPromisesSlot`; the cast
 * is the caller's because the caller is the only one that knows which key it asked for.
 */
export async function getNinaMemorySlot(
  userId: string,
  key: string,
): Promise<{ value: NinaSlotValue; source: NinaMemorySource; updatedAt: Date } | null> {
  const rows = await db
    .select({
      value: ninaMemorySlots.value,
      source: ninaMemorySlots.source,
      updatedAt: ninaMemorySlots.updatedAt,
    })
    .from(ninaMemorySlots)
    .where(and(eq(ninaMemorySlots.userId, userId), eq(ninaMemorySlots.key, key)))
    .limit(1)

  return rows[0] ?? null
}

/**
 * Upsert on `(user_id, key)` — RU-6's "upserted", made literal. A contradicting later statement
 * REPLACES the slot; the ledger below is what keeps the earlier claim.
 *
 * `updated_at` is set explicitly as well as by `$onUpdate`, because `$onUpdate` fires on the
 * UPDATE path and the INSERT path takes `defaultNow()` — spelling it in `set` means both paths
 * write the same instant and a caller comparing two slots' `updated_at` is comparing like with
 * like.
 */
export async function upsertNinaMemorySlot(userId: string, input: NinaSlotUpsert): Promise<void> {
  const source = input.source ?? 'distilled'
  const sourceMessageId = input.sourceMessageId ?? null

  await db
    .insert(ninaMemorySlots)
    .values({ userId, key: input.key, value: input.value, source, sourceMessageId })
    .onConflictDoUpdate({
      target: [ninaMemorySlots.userId, ninaMemorySlots.key],
      set: { value: input.value, source, sourceMessageId, updatedAt: new Date() },
    })
}

/** Phase 16's editor only. Nothing in the runtime deletes a slot — she corrects, she forgets. */
export async function deleteNinaMemorySlot(userId: string, key: string): Promise<boolean> {
  const deleted = await db
    .delete(ninaMemorySlots)
    .where(and(eq(ninaMemorySlots.userId, userId), eq(ninaMemorySlots.key, key)))
    .returning({ key: ninaMemorySlots.key })
  return deleted.length > 0
}

/**
 * Phase 2's `readMemoryFacts`: the ledger's newest `limit` rows, **newest first**. `created_at
 * DESC, id DESC` because a distillation pass writes several facts in one statement and they share
 * an instant; `id` is a random nanoid, so it is an arbitrary but STABLE tiebreak, which is all
 * that is needed for a prompt to be reproducible.
 */
export async function listNinaMemoryFacts(
  userId: string,
  opts: { limit: number },
): Promise<NinaFactRow[]> {
  return db
    .select({
      id: ninaMemoryFacts.id,
      category: ninaMemoryFacts.category,
      text: ninaMemoryFacts.text,
      source: ninaMemoryFacts.source,
      sourceMessageId: ninaMemoryFacts.sourceMessageId,
      createdAt: ninaMemoryFacts.createdAt,
    })
    .from(ninaMemoryFacts)
    .where(eq(ninaMemoryFacts.userId, userId))
    .orderBy(desc(ninaMemoryFacts.createdAt), desc(ninaMemoryFacts.id))
    .limit(opts.limit)
}

/**
 * Append-only. One multi-row INSERT, no upsert, no dedupe — two identical statements a month
 * apart are two facts, and collapsing them would throw away the "he keeps saying this" signal.
 */
export async function appendNinaMemoryFacts(
  userId: string,
  rows: readonly NinaFactInsert[],
): Promise<NinaFactRow[]> {
  if (rows.length === 0) return []

  return db
    .insert(ninaMemoryFacts)
    .values(
      rows.map((row) => ({
        id: newId(),
        userId,
        category: row.category,
        text: row.text,
        source: row.source ?? 'distilled',
        sourceMessageId: row.sourceMessageId ?? null,
      })),
    )
    .returning({
      id: ninaMemoryFacts.id,
      category: ninaMemoryFacts.category,
      text: ninaMemoryFacts.text,
      source: ninaMemoryFacts.source,
      sourceMessageId: ninaMemoryFacts.sourceMessageId,
      createdAt: ninaMemoryFacts.createdAt,
    })
}

/**
 * **Phase 16's editor only, and the one exception to "append-only".** A ledger the app never
 * mutates but a human can correct is still an honest ledger; a ledger the DISTILLER can rewrite
 * is not, which is why phase 5 has no path to this function.
 */
export async function updateNinaMemoryFact(
  userId: string,
  id: string,
  patch: { category?: NinaFactCategory; text?: string },
): Promise<boolean> {
  if (patch.category == null && patch.text == null) return false

  const updated = await db
    .update(ninaMemoryFacts)
    .set({
      ...(patch.category != null ? { category: patch.category } : {}),
      ...(patch.text != null ? { text: patch.text } : {}),
    })
    .where(and(eq(ninaMemoryFacts.userId, userId), eq(ninaMemoryFacts.id, id)))
    .returning({ id: ninaMemoryFacts.id })
  return updated.length > 0
}

/** Phase 16's editor only. See `updateNinaMemoryFact`. */
export async function deleteNinaMemoryFact(userId: string, id: string): Promise<boolean> {
  const deleted = await db
    .delete(ninaMemoryFacts)
    .where(and(eq(ninaMemoryFacts.userId, userId), eq(ninaMemoryFacts.id, id)))
    .returning({ id: ninaMemoryFacts.id })
  return deleted.length > 0
}

/* ---------------------------------------------------------------------------
 * §6b Shortcuts — the trigger -> expansion registry (F36)
 *
 * Memory-adjacent and deliberately NOT memory: see `nina_shortcuts`' header in
 * `lib/db/schema.ts`. Every statement below is `user_id`-scoped first, and `match_key` plus
 * `kind` are derived here rather than by any caller, so the unique index
 * `(user_id, match_key)` is guarding a key exactly one function knows how to spell.
 * -------------------------------------------------------------------------*/

const shortcutColumns = {
  id: ninaShortcuts.id,
  trigger: ninaShortcuts.trigger,
  matchKey: ninaShortcuts.matchKey,
  kind: ninaShortcuts.kind,
  label: ninaShortcuts.label,
  expansion: ninaShortcuts.expansion,
  enabled: ninaShortcuts.enabled,
  uses: ninaShortcuts.uses,
  lastUsedAt: ninaShortcuts.lastUsedAt,
  createdAt: ninaShortcuts.createdAt,
  updatedAt: ninaShortcuts.updatedAt,
}

/**
 * `nina_shortcuts.kind` is untyped `text` (the `nina_tuning.relationship` argument), so this is
 * where the column becomes a union. An unrecognised value is RE-DERIVED rather than rejected:
 * plan invariant 7 says nothing on the turn path throws for a shortcut problem, and a row hand-
 * edited in `db:studio` to `'Glyph'` should behave, not explode.
 */
function toShortcutRecord(row: {
  id: string
  trigger: string
  matchKey: string
  kind: string
  label: string
  expansion: string
  enabled: boolean
  uses: number
  lastUsedAt: Date | null
  createdAt: Date
  updatedAt: Date
}): NinaShortcutRecord {
  const kind: NinaShortcutKind =
    row.kind === 'glyph' || row.kind === 'word' ? row.kind : classifyNinaTrigger(row.matchKey)
  return { ...row, kind }
}

/** `trigger` -> the derived `(match_key, kind)` pair, in the one place that derives it. */
function derivedTrigger(trigger: string): { matchKey: string; kind: NinaShortcutKind } {
  const matchKey = normalizeNinaTrigger(trigger)
  return { matchKey, kind: classifyNinaTrigger(matchKey) }
}

/**
 * The registry. **Phase 3's `/admin/shortcuts` calls it bare** and gets every row including the
 * disabled ones, because a disabled code still has to be visible to be re-enabled. **Phase 2's
 * turn path calls it with `{ onlyEnabled: true }`** and gets only what can fire, which is the
 * `nina_shortcuts_user_enabled_idx` read.
 *
 * Ordered by `match_key` and not by `created_at DESC`: a registry is scanned by trigger, and
 * `(user_id, match_key)` is UNIQUE, so that ordering is total on its own — the `id` tiebreak is
 * belt-and-braces for the same reason `listNinaMemoryFacts` carries one, namely that a prompt and
 * an admin table must both be reproducible.
 */
export async function listNinaShortcuts(
  userId: string,
  opts: { onlyEnabled?: boolean } = {},
): Promise<NinaShortcutRecord[]> {
  const where =
    opts.onlyEnabled === true
      ? and(eq(ninaShortcuts.userId, userId), eq(ninaShortcuts.enabled, true))
      : eq(ninaShortcuts.userId, userId)

  const rows = await db
    .select(shortcutColumns)
    .from(ninaShortcuts)
    .where(where)
    .orderBy(asc(ninaShortcuts.matchKey), asc(ninaShortcuts.id))

  return rows.map(toShortcutRecord)
}

/**
 * Phase 3's add row, and phase 4's importer.
 *
 * **A duplicate trigger THROWS, and that is the design.** `(user_id, match_key)` is the authority
 * on "this code already exists"; a pre-flight `SELECT` would be correct until two tabs raced, so
 * the caller catches the unique violation and turns it into a sentence instead. The
 * `shares_run_id_active_unq` ruling, applied to a registry. Phase 4's importer wants the opposite
 * behaviour on a re-run and gets it with its own `onConflictDoNothing`, which is why this function
 * does not bake one in.
 */
export async function insertNinaShortcut(
  userId: string,
  input: NinaShortcutInsert,
): Promise<NinaShortcutRecord> {
  const { matchKey, kind } = derivedTrigger(input.trigger)

  const inserted = await db
    .insert(ninaShortcuts)
    .values({
      id: newId(),
      userId,
      trigger: input.trigger,
      matchKey,
      kind,
      label: input.label,
      expansion: input.expansion,
      enabled: input.enabled ?? true,
    })
    .returning(shortcutColumns)

  const row = inserted[0]
  if (row === undefined) throw new Error('insertNinaShortcut wrote no row')
  return toShortcutRecord(row)
}

/**
 * Phase 3's blur-to-save and its on/off switch. Returns the row rather than a boolean — unlike
 * `updateNinaMemoryFact`, whose caller only needs "did it exist" — because `match_key`, `kind` and
 * `updated_at` are all derived server-side and the admin table re-renders the values it did not
 * compute.
 *
 * An empty patch is a no-op that returns the row unchanged rather than `null`, so "nothing to
 * save" and "no such shortcut" stay distinguishable at the call site.
 *
 * `updated_at` moves via `$onUpdate`. It is NOT written explicitly here: the explicit write in
 * `upsertNinaMemorySlot` exists only because that statement has an INSERT path, and this one does
 * not.
 */
export async function updateNinaShortcut(
  userId: string,
  id: string,
  patch: NinaShortcutPatch,
): Promise<NinaShortcutRecord | null> {
  const derived = patch.trigger == null ? null : derivedTrigger(patch.trigger)
  const set = {
    ...(patch.trigger != null ? { trigger: patch.trigger } : {}),
    ...(derived != null ? { matchKey: derived.matchKey, kind: derived.kind } : {}),
    ...(patch.label != null ? { label: patch.label } : {}),
    ...(patch.expansion != null ? { expansion: patch.expansion } : {}),
    ...(patch.enabled != null ? { enabled: patch.enabled } : {}),
  }

  if (Object.keys(set).length === 0) {
    const current = await db
      .select(shortcutColumns)
      .from(ninaShortcuts)
      .where(and(eq(ninaShortcuts.userId, userId), eq(ninaShortcuts.id, id)))
      .limit(1)
    const row = current[0]
    return row === undefined ? null : toShortcutRecord(row)
  }

  const updated = await db
    .update(ninaShortcuts)
    .set(set)
    .where(and(eq(ninaShortcuts.userId, userId), eq(ninaShortcuts.id, id)))
    .returning(shortcutColumns)

  const row = updated[0]
  return row === undefined ? null : toShortcutRecord(row)
}

/**
 * Phase 3's ✕. A hard delete with no tombstone: a shortcut is a directive, and a deleted directive
 * that still exists somewhere is the failure this whole table was built to end. `false` means it
 * was already gone, or was never his — absent and forbidden are the same outcome in this file.
 */
export async function deleteNinaShortcut(userId: string, id: string): Promise<boolean> {
  const deleted = await db
    .delete(ninaShortcuts)
    .where(and(eq(ninaShortcuts.userId, userId), eq(ninaShortcuts.id, id)))
    .returning({ id: ninaShortcuts.id })
  return deleted.length > 0
}

/**
 * *"so the admin can see which codes actually fire"* — one statement, `uses = uses + 1` and
 * `last_used_at = now()`, for every id in one go.
 *
 * **Phase 2 calls this FIRE-AND-FORGET after the turn has already returned, and a rejection must
 * never fail a turn.** Plan invariant 7 lives at that call site — it is the caller that must
 * `.catch()` — but it is written here so the next person to reach for this function knows it is
 * telemetry and not bookkeeping the conversation depends on. Nothing reads `uses` on the turn
 * path.
 *
 * `uses` is incremented IN SQL rather than read-then-written: two turns can be in flight at once
 * (a background turn and a proactive sweep are a real pair) and a read-then-write loses one.
 * `upsertNinaNag`'s `count` is the precedent.
 *
 * Note that this ALSO moves `updated_at`, because `$onUpdate` fires on every drizzle update of the
 * table. See the schema header: `updated_at` is "the row last changed", never "the admin last
 * edited it".
 */
export async function bumpNinaShortcutUses(userId: string, ids: readonly string[]): Promise<void> {
  if (ids.length === 0) return

  await db
    .update(ninaShortcuts)
    .set({ uses: sql`${ninaShortcuts.uses} + 1`, lastUsedAt: new Date() })
    .where(and(eq(ninaShortcuts.userId, userId), inArray(ninaShortcuts.id, [...ids])))
}

/* ============================================================================
 * §7 Nags — the escalation ledger (RU-9)
 * ==========================================================================*/

/** Phase 2's `readNags`. `[]` when she has never nagged, which is a normal first-week state. */
export async function getNinaNags(userId: string): Promise<NinaNagRow[]> {
  return db
    .select({
      code: ninaNags.code,
      level: ninaNags.level,
      count: ninaNags.count,
      lastMentionedOn: ninaNags.lastMentionedOn,
      updatedAt: ninaNags.updatedAt,
    })
    .from(ninaNags)
    .where(eq(ninaNags.userId, userId))
    .orderBy(asc(ninaNags.code))
}

/**
 * Records that she has now said something about `code`. `level` is supplied by phase 9 — this
 * function does not compute the ladder, because "what rung is he on" is a decision with a decay
 * rule and a threshold table, and neither belongs in a query.
 *
 * `count` is incremented IN SQL (`nina_nags.count + 1`) rather than read-then-written, so two
 * concurrent writers — the cron and an `after()` hook, which is a real pair — cannot lose one.
 */
export async function upsertNinaNag(userId: string, input: NinaNagUpsert): Promise<void> {
  await db
    .insert(ninaNags)
    .values({
      userId,
      code: input.code,
      level: input.level,
      count: 1,
      lastMentionedOn: input.lastMentionedOn,
    })
    .onConflictDoUpdate({
      target: [ninaNags.userId, ninaNags.code],
      set: {
        level: input.level,
        count: sql`${ninaNags.count} + 1`,
        lastMentionedOn: input.lastMentionedOn,
        updatedAt: new Date(),
      },
    })
}

/* ============================================================================
 * §8 Turns — the audit trail
 * ==========================================================================*/

/**
 * One row per model call, success or failure. Returns the id so the caller can stamp it onto the
 * messages the turn emitted — which means the turn row is written FIRST, before the messages, and
 * a turn with no messages is a turn that failed. That asymmetry is the point: a conversation that
 * silently lost a turn is unexplainable, and this is the table that explains it.
 *
 * **A third outcome exists and it is not a failure:** `status: 'pending'` with `args` populated is
 * phase 12's dispatched image job, closed by the callback minutes later in another process
 * (RULINGS C1 and C2). The id this function returns is that job's id — the opaque handle that
 * goes into the `workflow_dispatch` input *instead of the prompt*, because the repo is public.
 */
export async function insertNinaTurn(userId: string, input: NinaTurnInsert): Promise<string> {
  const id = newId()
  await db.insert(ninaTurns).values({
    id,
    userId,
    kind: input.kind,
    trigger: input.trigger ?? null,
    model: input.model,
    promptVersion: input.promptVersion ?? null,
    inputTokens: input.inputTokens ?? null,
    outputTokens: input.outputTokens ?? null,
    toolCalls: input.toolCalls ?? '',
    latencyMs: input.latencyMs ?? null,
    costMicroUsd: input.costMicroUsd ?? null,
    status: input.status,
    errorCode: input.errorCode ?? null,
    args: input.args ?? null,
  })
  return id
}

/**
 * Phase 12's daily cap, and phase 10's "have I already spoken today". Counts by `kind` since an
 * instant, and counts FAILED turns too — a cap that only counts successes is a cap an unlucky
 * afternoon can spend ten times over.
 *
 * **AND IT DOES NOT FILTER `deleted_at`, WHICH IS A DECISION AND NOT AN OVERSIGHT (R2).** Every
 * other reader of a `kind='image'` row skips a row the runner hid from `/nina/jobs`; this one
 * keeps counting it, for the same reason it counts failures. `lib/nina/selfiegen.ts` calls this
 * cap *"a money cap and not a feature cap"* — the $0.04 was spent, and hiding the row does not
 * un-spend it. A version of this count that respected the flag would turn one tap on a tidy-up
 * icon into a quota refund, which is an unmetered image budget wearing a trash can as a hat.
 * `tests/nina.softDelete.test.ts` asserts the absence of the predicate rather than trusting it.
 */
export async function countNinaTurnsSince(
  userId: string,
  kind: NinaTurnKind,
  since: Date,
): Promise<number> {
  const rows = await db
    .select({ n: sql<number>`count(*)`.mapWith(Number) })
    .from(ninaTurns)
    .where(
      and(eq(ninaTurns.userId, userId), eq(ninaTurns.kind, kind), gte(ninaTurns.createdAt, since)),
    )
  return rows[0]?.n ?? 0
}

/* ============================================================================
 * §9 Avatars — her album (RU-7, R19, R23, R25)
 * ==========================================================================*/

/** Her face right now. Reads the partial unique index, so it is a single-row index lookup. */
export async function getCurrentNinaAvatar(userId: string): Promise<NinaAvatarRow | null> {
  const rows = await db
    .select(avatarColumns)
    .from(ninaAvatars)
    .where(and(eq(ninaAvatars.userId, userId), eq(ninaAvatars.isCurrent, true)))
    .limit(1)
  return rows[0] ?? null
}

/** The album, newest first. Phase 13's grid and phase 15's admin list. */
export async function listNinaAvatars(userId: string): Promise<NinaAvatarRow[]> {
  return db
    .select(avatarColumns)
    .from(ninaAvatars)
    .where(eq(ninaAvatars.userId, userId))
    .orderBy(desc(ninaAvatars.createdAt), desc(ninaAvatars.id))
}

/**
 * RU-17's whole mechanism: the current avatar she has NOT mentioned yet. Phase 13 (promise path)
 * and phase 10 (operator path) both poll this, make her comment on it in character, and then call
 * `markNinaAvatarAnnounced`. Two readers, one query, and no flag anyone has to remember to set.
 */
export async function getUnannouncedCurrentNinaAvatar(
  userId: string,
): Promise<NinaAvatarRow | null> {
  const rows = await db
    .select(avatarColumns)
    .from(ninaAvatars)
    .where(
      and(
        eq(ninaAvatars.userId, userId),
        eq(ninaAvatars.isCurrent, true),
        isNull(ninaAvatars.announcedAt),
      ),
    )
    .limit(1)
  return rows[0] ?? null
}

/**
 * **The order of these two statements is load-bearing.** `nina_avatars_user_current_unq` is a
 * partial unique index on `(user_id) where is_current`, so inserting a second current row before
 * un-currenting the first violates it mid-transaction. Un-current, then insert — the same order
 * phase 14's operator script uses, for the same reason, and one `db.batch` so the album is never
 * momentarily faceless.
 *
 * `announced_at` is left NULL: she has not said anything about this face yet, and
 * `getUnannouncedCurrentNinaAvatar` is what notices. The crop triple is left NULL too — no
 * transform, render it centred — because whoever generated or uploaded the image has not framed
 * it yet and phase 15 is where framing happens.
 */
export async function insertNinaAvatarAsCurrent(
  userId: string,
  input: NinaAvatarInsert,
): Promise<NinaAvatarRow> {
  const [, inserted] = await db.batch([
    db
      .update(ninaAvatars)
      .set({ isCurrent: false })
      .where(and(eq(ninaAvatars.userId, userId), eq(ninaAvatars.isCurrent, true))),

    db
      .insert(ninaAvatars)
      .values({
        id: newId(),
        userId,
        blobUrl: input.blobUrl,
        pathname: input.pathname,
        width: input.width ?? null,
        height: input.height ?? null,
        bytes: input.bytes ?? null,
        source: input.source,
        description: input.description ?? null,
        isCurrent: true,
      })
      .returning(avatarColumns),
  ])

  const row = inserted[0]
  if (row == null) {
    // Unreachable: an INSERT … RETURNING that ran without throwing produced a row. Thrown rather
    // than `!`-asserted so that if the driver ever changes shape, the failure names itself.
    throw new Error('insertNinaAvatarAsCurrent: INSERT returned no row')
  }
  return row
}

/** She has now said something about this face. Idempotent — a second call is a no-op. */
export async function markNinaAvatarAnnounced(
  userId: string,
  id: string,
  now: Date = new Date(),
): Promise<boolean> {
  const updated = await db
    .update(ninaAvatars)
    .set({ announcedAt: now })
    .where(
      and(eq(ninaAvatars.userId, userId), eq(ninaAvatars.id, id), isNull(ninaAvatars.announcedAt)),
    )
    .returning({ id: ninaAvatars.id })
  return updated.length > 0
}

/**
 * R23. `/admin/nina` (phase 15) saves the circular-frame transform it just let the user drag.
 * Passing `{ scale: null, x: null, y: null }` clears it back to plain centred `object-cover`,
 * which is the "reset" button — so this one function is both save and reset and there is no
 * second code path for the second one.
 *
 * No range validation here. The bounds ("scale ≥ 1, offsets inside the frame") are a property of
 * the framing UI and belong to a Zod schema phase 15 owns, next to the widget that produces the
 * numbers — the same division `lib/profile/schema.ts` keeps against `profiles`.
 */
export async function updateNinaAvatarCrop(
  userId: string,
  id: string,
  crop: NinaAvatarCrop,
): Promise<boolean> {
  const updated = await db
    .update(ninaAvatars)
    .set({ cropScale: crop.scale, cropX: crop.x, cropY: crop.y })
    .where(and(eq(ninaAvatars.userId, userId), eq(ninaAvatars.id, id)))
    .returning({ id: ninaAvatars.id })
  return updated.length > 0
}

/**
 * R25. What the picture DEPICTS, so "itu lagi dimana?" has an answer. Three writers, three
 * origins: phase 12 writes from its own generation prompt, phase 14 and phase 15 write what
 * phase 6's `glm-4.6v` describe pre-pass came back with. Separate from
 * `insertNinaAvatarAsCurrent` because two of those three only learn the description after the
 * row exists — a describe call is a second network round trip, and holding the album faceless
 * while it runs would be the wrong trade.
 */
export async function setNinaAvatarDescription(
  userId: string,
  id: string,
  description: string | null,
): Promise<boolean> {
  const updated = await db
    .update(ninaAvatars)
    .set({ description })
    .where(and(eq(ninaAvatars.userId, userId), eq(ninaAvatars.id, id)))
    .returning({ id: ninaAvatars.id })
  return updated.length > 0
}

/**
 * One album row by id, ownership-scoped. Phase 15's `/admin/nina` uses it to validate an id
 * arriving from a form before it changes anything, and to read `width`/`height` back for the crop
 * clamp. Returns `null` for "not yours" and for "does not exist" alike — the caller has no
 * legitimate use for the difference.
 */
export async function getNinaAvatar(userId: string, id: string): Promise<NinaAvatarRow | null> {
  const rows = await db
    .select(avatarColumns)
    .from(ninaAvatars)
    .where(and(eq(ninaAvatars.userId, userId), eq(ninaAvatars.id, id)))
    .limit(1)
  return rows[0] ?? null
}

/**
 * One album row by its dedupe key, ownership-scoped. `setChatPhotoAsAvatarAction`'s re-adoption
 * lookup: the row that `chat-photo:<imageId>` already produced, so a second "set as her profile
 * picture" re-currents the FIRST copy instead of storing the bytes twice. `sourceKey` is unique
 * per `(user_id, source_key)` when non-null (`nina_avatars_user_source_key_unq`), so this answers
 * with at most one row; `null` means "never adopted" and is the copy path's green light.
 */
export async function getNinaAvatarBySourceKey(
  userId: string,
  sourceKey: string,
): Promise<NinaAvatarRow | null> {
  const rows = await db
    .select(avatarColumns)
    .from(ninaAvatars)
    .where(and(eq(ninaAvatars.userId, userId), eq(ninaAvatars.sourceKey, sourceKey)))
    .limit(1)
  return rows[0] ?? null
}

/**
 * Make an existing album photo the current one. R23's "admin can also set which photo will be set
 * as her profpic".
 *
 * ── THE PRE-CHECK IS WHAT MAKES ZERO CURRENT AVATARS UNREACHABLE ─────────────────────────────
 * The statement order is forced by `nina_avatars_user_current_unq` (partial unique on `(user_id)
 * where is_current`): un-current first, then set the new one, exactly as
 * `insertNinaAvatarAsCurrent` does. But an UPDATE that matches no row does not fail — so if the id
 * were bogus, the batch would un-current the album and set nothing, leaving her with NO current
 * avatar and the page with nothing to show. Reading the row first and refusing turns that into a
 * `false` return. (One user, one writer, so the window between the read and the batch is
 * theoretical; the alternative is a `WHERE EXISTS` that this driver expresses far less legibly.)
 *
 * ── `announced_at` IS RE-ARMED ON PURPOSE ────────────────────────────────────────────────────
 * RU-17: a hand-changed avatar makes her speak. What the user perceives is "her face changed", and
 * the cause is irrelevant to that, so promoting an old album photo re-arms the announcement the
 * same way a fresh upload does. Phase 10 owns the trigger (`is_current AND announced_at IS NULL`);
 * this function writes no message and composes no line.
 */
export async function setCurrentNinaAvatar(userId: string, id: string): Promise<boolean> {
  const existing = await getNinaAvatar(userId, id)
  if (existing == null) return false
  if (existing.isCurrent) return true // idempotent: no un-currenting, no re-announcement

  await db.batch([
    db
      .update(ninaAvatars)
      .set({ isCurrent: false })
      .where(and(eq(ninaAvatars.userId, userId), eq(ninaAvatars.isCurrent, true))),

    db
      .update(ninaAvatars)
      .set({ isCurrent: true, announcedAt: null })
      .where(and(eq(ninaAvatars.userId, userId), eq(ninaAvatars.id, id))),
  ])
  return true
}

/**
 * Remove a photo from the album, and hand its blob back so the caller can delete the object.
 *
 * ── THE CURRENT PHOTO CANNOT BE DELETED, AND THAT IS THE WHOLE GUARD ────────────────────────
 * `eq(ninaAvatars.isCurrent, false)` in the WHERE clause is what makes "zero current avatars"
 * unreachable rather than repaired. Promotion-on-delete was rejected: "delete her face and
 * something else silently becomes it" is worse than a refusal that names the fix, and picking the
 * successor is precisely the choice `/admin/nina` exists to give the operator.
 *
 * `null` means "not yours, already gone, or current" — the caller turns that into one message,
 * because a page that distinguishes them is a page that tells a stranger which ids exist.
 *
 * ── TWO OBJECTS, NOT ONE (F34 R1) ───────────────────────────────────────────────────────────
 * A row can carry a derived thumbnail (`nina_avatars.thumb_url`), so this returns both refs. The
 * row is the only record that the thumbnail exists — its stored pathname carries Blob's random
 * suffix and is not derivable — so a delete that returns one ref leaks an object that nothing can
 * find again except a full store listing. Both thumbnail fields are NULL for every pre-F34 row,
 * and a caller must read NULL as "nothing to delete" rather than as a failure.
 */
export async function deleteNinaAvatar(
  userId: string,
  id: string,
): Promise<NinaAvatarBlobRef | null> {
  const removed = await db
    .delete(ninaAvatars)
    .where(
      and(eq(ninaAvatars.userId, userId), eq(ninaAvatars.id, id), eq(ninaAvatars.isCurrent, false)),
    )
    .returning({
      id: ninaAvatars.id,
      blobUrl: ninaAvatars.blobUrl,
      pathname: ninaAvatars.pathname,
      thumbUrl: ninaAvatars.thumbUrl,
      thumbPathname: ninaAvatars.thumbPathname,
    })
  return removed[0] ?? null
}

/* ---------------------------------------------------------------------------
 * §9b The album as a file manager — F34 R1
 *
 * Twelve statements: a folder-scoped page, a subtree manifest, a distinct-folder listing (which
 * unions `nina_folders` in), an album count, a plain batch insert, the bulk-move / rename /
 * recursive-delete / bulk-delete set phase 6 drives, and the three `nina_folders` declaration
 * statements. Every one of them is `userId`-scoped in its WHERE, per this module's rule 1.
 * -------------------------------------------------------------------------*/

/**
 * "This folder and everything under it", as one predicate.
 *
 * ── `left()` AND NOT `LIKE`, DELIBERATELY ───────────────────────────────────────────────────
 * The obvious spelling is `folder LIKE $1 || '/%'`, and it is the wrong tool for a statement that
 * rewrites or deletes rows: `%` and `_` are LIKE metacharacters, so a folder literally named
 * `100%` or `my_pics` would match siblings it has no business matching, and a recursive DELETE
 * would take them. `left(folder, n) = prefix` is an exact string comparison with no escaping to
 * get right, which lets `lib/admin/filetree.ts`'s grammar be a bound on SHAPE rather than the only
 * thing standing between a folder name and a wider delete than the user asked for. Defence in
 * depth is the point: either one alone would be a bug waiting for the other to be edited.
 *
 * ── THE ALBUM ROOT IS A SPECIAL CASE, NOT A ZERO-LENGTH PREFIX ──────────────────────────────
 * The root is `''`, so `'' || '/'` is `'/'`, which no canonical path starts with — the general
 * spelling would match NOTHING where it must match EVERYTHING. Hence the early return. The
 * `folder = prefix` disjunct is the folder's own rows; the `left()` disjunct is its descendants.
 *
 * ── THE COLUMN IS AN ARGUMENT, BECAUSE THERE ARE TWO FOLDER COLUMNS ─────────────────────────
 * `nina_avatars.folder` and `nina_folders.folder` both need this predicate and it must be the SAME
 * predicate for both: a rename that rewrote the photograph rows with `left()` and the declaration
 * rows with `LIKE` would be two subtly different definitions of "under this folder", and the pair
 * would drift on exactly the folder name (`100%`) that motivated `left()` in the first place. One
 * function, pointed at whichever column the statement is touching.
 *
 * Not exported: six callers in this file, and a predicate over a folder column is not a thing a
 * caller outside the data layer has any use for.
 */
function folderSubtree(column: PgColumn, folder: string): SQL {
  if (folder === '') return sql`true`
  const prefix = `${folder}/`
  const own = eq(column, folder)
  const under = sql`left(${column}, ${prefix.length}::int) = ${prefix}`
  return sql`(${own} OR ${under})`
}

/**
 * One page of one folder, newest first, plus the folder's row count — the explorer's content pane
 * (F34 R1).
 *
 * Reads `nina_avatars_user_folder_created_idx` as a range scan: equality on `user_id`, equality on
 * `folder`, and `(created_at desc, id desc)` already in index order, so nothing sorts. It is NOT
 * a filter over `listNinaAvatars` and it must not become one — the requirement is *"hundreds of
 * profile pics"*, and the whole point of this function existing beside that one is that no read on
 * this screen is unbounded.
 *
 * ── DIRECT CHILDREN ONLY ────────────────────────────────────────────────────────────────────
 * `folder = $2`, not the subtree. A file manager's content pane shows what is IN the folder you
 * opened; descendants are reached by opening them. `listNinaAvatarFolders` is what tells the tree
 * pane there is something to open.
 *
 * ── OFFSET, AND THE ARGUMENT IS ON `NinaAvatarFolderPage` ───────────────────────────────────
 * See that interface: the pager this feeds needs a total and a backward step, `OFFSET` at hundreds
 * of rows is an index range scan, and the drift a cursor would have avoided is named there and is
 * bounded to "a tile can repeat across two pages during an upload".
 *
 * ── TWO STATEMENTS, RUN CONCURRENTLY ────────────────────────────────────────────────────────
 * A `count(*) OVER ()` window would have made this one round trip, and it would report `total: 0`
 * for an over-shot `?page=` — indistinguishable from an empty folder, which is the one case phase
 * 5's pager has to tell apart ("nothing on this page, go to the first" vs "nothing in this folder
 * yet, drop a folder"). So the count is its own `SELECT`, issued in the same `Promise.all`. Both
 * statements read the same index; at the scale the requirement states this is cheaper than the
 * branch it removes.
 *
 * `NINA_ADMIN_PAGE_SIZE` is both the default and the CEILING for `limit`. A caller may ask for
 * fewer and cannot ask for more, so a hand-edited `?limit=` cannot turn one page into the
 * unpaginated read this function exists to avoid. `offset` is floored at 0 for the same reason:
 * a negative offset is a Postgres error, not a query.
 */
export async function listNinaAvatarsInFolder(
  userId: string,
  folder: string,
  opts: { limit?: number; offset?: number } = {},
): Promise<NinaAvatarFolderPage> {
  const limit = Math.max(1, Math.min(opts.limit ?? NINA_ADMIN_PAGE_SIZE, NINA_ADMIN_PAGE_SIZE))
  const offset = Math.max(0, Math.trunc(opts.offset ?? 0))
  const scope = and(eq(ninaAvatars.userId, userId), eq(ninaAvatars.folder, folder))

  const [rows, counted] = await Promise.all([
    db
      .select(avatarColumns)
      .from(ninaAvatars)
      .where(scope)
      .orderBy(desc(ninaAvatars.createdAt), desc(ninaAvatars.id))
      .limit(limit)
      .offset(offset),
    db
      .select({ total: sql<number>`count(*)`.mapWith(Number) })
      .from(ninaAvatars)
      .where(scope),
  ])

  return { rows, total: counted[0]?.total ?? 0 }
}

/**
 * Every dedupe key already stored under a folder and its descendants — the manifest side of F34
 * R1's *"it automatically upload only the new folders and files as optimization."*
 *
 * The browser walks a dropped folder, computes the same key per file that
 * `lib/admin/filetree.ts` computed at upload time, and `planFolderUpload` subtracts this set.
 * Which is why the SUBTREE and not one folder: the user drags `Nina/` and the diff has to know
 * about `Nina/2026/09/beach.jpg`.
 *
 * ── WHAT IT DOES NOT RETURN ─────────────────────────────────────────────────────────────────
 * Rows with a NULL `source_key` are excluded rather than returned with a null field. A row that
 * predates the file manager has no key, so it can never match a walked file, so including it would
 * be shipping bytes the diff must then filter out. The consequence is honest and worth stating: a
 * photo uploaded before F34 is invisible to the diff, and re-dropping the folder it came from
 * uploads it again as a second row. There is no key to match it on, and inventing one from
 * `blob_url` would be guessing at a `lastModified` nobody recorded.
 *
 * ── THE CAP IS ALLOWED TO TRUNCATE BECAUSE THE UNIQUE INDEX IS THE BACKSTOP ─────────────────
 * `NINA_ADMIN_MANIFEST_MAX` bounds the response at ~240 KB. A truncated manifest makes the diff
 * OVER-report: a file that is already stored looks new, is uploaded, and its insert is discarded
 * by `ON CONFLICT (user_id, source_key) DO NOTHING`. Slower, never wrong — and only because the
 * dedupe key is a constraint. Without `nina_avatars_user_source_key_unq` this would have to be a
 * paging protocol instead of a number.
 *
 * Ordered `(folder, id)` so the response is stable across two calls, which is what makes "the
 * manifest changed" mean something to a client that caches one.
 */
export async function listNinaAvatarManifest(
  userId: string,
  folder: string,
  limit: number = NINA_ADMIN_MANIFEST_MAX,
): Promise<NinaAvatarManifestEntry[]> {
  const rows = await db
    .select({
      id: ninaAvatars.id,
      folder: ninaAvatars.folder,
      sourceKey: ninaAvatars.sourceKey,
    })
    .from(ninaAvatars)
    .where(
      and(
        eq(ninaAvatars.userId, userId),
        isNotNull(ninaAvatars.sourceKey),
        folderSubtree(ninaAvatars.folder, folder),
      ),
    )
    .orderBy(asc(ninaAvatars.folder), asc(ninaAvatars.id))
    .limit(Math.max(1, Math.min(limit, NINA_ADMIN_MANIFEST_MAX)))

  // `isNotNull` narrows the ROWS but not the TYPE, and a `!` here would be asserting that the
  // WHERE clause and this line agree forever. `flatMap` makes the narrowing the compiler's.
  return rows.flatMap((row) =>
    row.sourceKey == null ? [] : [{ id: row.id, folder: row.folder, sourceKey: row.sourceKey }],
  )
}

/**
 * Every folder that exists, with how many photos are DIRECTLY in each — the tree pane's whole
 * read (F34 R1).
 *
 * ── A FOLDER EXISTS IF A PHOTO IS IN IT **OR** IF IT IS DECLARED ────────────────────────────
 * Two sources, unioned, neither authoritative:
 *
 *   · `nina_avatars.folder` — a folder exists because a photograph is filed in it. This is what
 *     makes a folder arrive by dropping one, and it is the only source that existed before the
 *     `nina_folders` table.
 *   · `nina_folders` — a folder exists because the operator made it. This is the only source that
 *     can represent an EMPTY folder, which is why the table exists at all (see its header).
 *
 * A UNION rather than a join in either direction, and that is the whole design: **both directions
 * of disagreement degrade instead of corrupting.** A populated folder whose declaration was never
 * written still appears, carried by its photographs. A declaration left behind after its
 * photographs are gone appears as an empty folder — which is a legal state now, not a ghost. There
 * is no repair path to write and no reconciliation job to run, because there is no state in which
 * one source is *wrong*: each one only ever adds a folder to the listing.
 *
 * **Do not "optimise" this into a read of `nina_folders` alone.** It would hide every folder
 * created by dropping one, which is the ordinary way folders arrive here.
 *
 * ── WHY TWO STATEMENTS AND A MERGE, NOT ONE `UNION ALL` OVER A DERIVED TABLE ─────────────────
 * The SQL union wants `sum(photos) group by folder` over a derived table to collapse the folder
 * that is BOTH declared and populated into one row, and that is a raw-`sql` fragment returning
 * untyped rows in a file whose every other read is a typed builder call. `db.batch` sends both in
 * one round trip — the same primitive `insertNinaAvatarAsCurrent` already uses — and the merge is
 * six lines of `Map` that a unit test can reason about. One round trip either way.
 *
 * ── THE ORDER IS CODEPOINT, AND IT IS DELIBERATELY NOT THE DATABASE'S ───────────────────────
 * Sorted here rather than by `ORDER BY` because the merge has to happen in JS anyway, and a JS
 * codepoint sort is the ordering this actually needs: a parent is a strict PREFIX of its children,
 * and a shorter string sorts before any string it prefixes, so **parents always precede their own
 * children** regardless of what else is in the list. A Postgres `ORDER BY` under a non-C collation
 * makes no such promise — `ICU` can order `a/b` before `a` depending on how it weights `/`. That
 * ordering is a convenience for `buildTree`, which materialises missing ancestors anyway
 * (invariant 6: it is unit-tested in `environment: 'node'`, and this sort is why its input is
 * deterministic).
 *
 * ── THE COUNTS ARE DIRECT, NOT RECURSIVE, AND A ZERO IS NORMAL ──────────────────────────────
 * A recursive roll-up here would be a second opinion about a tree the pure module already builds,
 * provable only against a database. `buildTree` sums its children to place them; it sums them to
 * label them too. **`photos: 0` is an ordinary result** — it is exactly what a declared empty
 * folder looks like — so nothing downstream may filter a zero out.
 *
 * Unbounded on purpose, and it is the one album read in this file that is. The result is one row
 * per DISTINCT folder — bounded by how many directories a human made, not by how many photos are
 * in them — and a tree pane that renders 40 of 200 folders is a broken tree, where a content pane
 * that renders 120 of 300 photos is a page.
 */
export async function listNinaAvatarFolders(userId: string): Promise<NinaAvatarFolderCount[]> {
  const [populated, declared] = await db.batch([
    db
      .select({
        folder: ninaAvatars.folder,
        photos: sql<number>`count(*)`.mapWith(Number),
      })
      .from(ninaAvatars)
      .where(eq(ninaAvatars.userId, userId))
      .groupBy(ninaAvatars.folder),

    db
      .select({ folder: ninaFolders.folder })
      .from(ninaFolders)
      .where(eq(ninaFolders.userId, userId)),
  ])

  /*
   * Declared first, populated second, so a folder that is both ends up with its real count rather
   * than the zero. The order of these two loops is the only thing that makes that true — swapping
   * them would zero out every declared folder that also holds photographs.
   */
  const counts = new Map<string, number>()
  for (const row of declared) counts.set(row.folder, 0)
  for (const row of populated) counts.set(row.folder, row.photos)

  return [...counts]
    .map(([folder, photos]) => ({ folder, photos }))
    .sort((a, b) => (a.folder < b.folder ? -1 : a.folder > b.folder ? 1 : 0))
}

/**
 * N photos into a folder, in one statement, **without touching `is_current`** — F34 R1's writer.
 *
 * ── WHY THIS EXISTS BESIDE `insertNinaAvatarAsCurrent` AND IS NOT A FLAG ON IT ──────────────
 * That function is correct and is the ONLY insert this module exposed before F34, and its whole
 * body is the un-current-then-insert `db.batch` that `nina_avatars_user_current_unq` forces. Which
 * makes it exactly wrong here: three hundred calls would rewrite the current row three hundred
 * times, re-arm `announced_at` three hundred times, and make her comment on a face nobody chose.
 * A dropped folder changes nothing about which photo is her face. So this insert writes
 * `is_current: false` for every row, never reads the current row, and never runs a second
 * statement — and `setCurrentNinaAvatar` stays the one and only way the crown moves, which is what
 * keeps the partial unique index's ordering rule confined to two functions instead of three.
 *
 * ── IDEMPOTENT ON THE DEDUPE KEY, WHICH IS THE POINT OF THE UNIQUE INDEX ────────────────────
 * `ON CONFLICT (user_id, source_key) DO NOTHING`. A retried Server Action, a double-clicked drop
 * and two tabs all resolve to "0 new rows" rather than to a duplicated album, and `.returning()`
 * omits the conflicting rows — so **`result.length` is how many were actually new**, which is the
 * number the caller reports to the user. A row whose `source_key` were NULL would never conflict,
 * which is precisely why `NinaAvatarBatchInsert.sourceKey` is required rather than optional.
 *
 * ── THE CAP THROWS, WHICH IS A DEPARTURE FROM THIS MODULE'S CONVENTION ──────────────────────
 * Rule 1's "return `null`, `[]` or `false` rather than throwing" is about OWNERSHIP and ABSENCE —
 * a caller's normal outcomes. A batch over `NINA_ADMIN_BATCH_MAX` is neither: it is a caller that
 * did not chunk, and the only honest report for that is loud. `lib/admin/schema.ts` (phase 4)
 * bounds it in Zod at the boundary where a browser's claim is checked, so this throw should be
 * unreachable — the same posture as `assertPathSegment` in `lib/nina/images.ts`: the cheap loud
 * defence at the one place that would otherwise do the damage.
 *
 * An empty batch returns `[]` WITHOUT running a statement, because `INSERT … VALUES` with no rows
 * is a syntax error and not an empty write.
 */
export async function insertNinaAvatars(
  userId: string,
  inputs: readonly NinaAvatarBatchInsert[],
): Promise<NinaAvatarRow[]> {
  if (inputs.length === 0) return []
  if (inputs.length > NINA_ADMIN_BATCH_MAX) {
    throw new Error(
      `insertNinaAvatars: ${inputs.length} rows exceeds NINA_ADMIN_BATCH_MAX (${NINA_ADMIN_BATCH_MAX})`,
    )
  }

  return db
    .insert(ninaAvatars)
    .values(
      inputs.map((input) => ({
        id: newId(),
        userId,
        blobUrl: input.blobUrl,
        pathname: input.pathname,
        folder: input.folder,
        filename: input.filename,
        sourceKey: input.sourceKey,
        thumbUrl: input.thumbUrl ?? null,
        thumbPathname: input.thumbPathname ?? null,
        width: input.width ?? null,
        height: input.height ?? null,
        bytes: input.bytes ?? null,
        source: input.source,
        description: input.description ?? null,
        isCurrent: false,
      })),
    )
    .onConflictDoNothing({ target: [ninaAvatars.userId, ninaAvatars.sourceKey] })
    .returning(avatarColumns)
}

/**
 * Move a SET of photos to another folder — an `UPDATE` of one column, and **no blob is copied**.
 *
 * That is the payoff of the header's "folder structure is metadata, not blob layout" decision,
 * stated at the site where the alternative would have been felt: under a folder-shaped blob
 * layout this would be a `put` of the original, a `put` of the thumbnail, two `del`s, and a row
 * update — four network calls per photo, none of them transactional with the row.
 *
 * Plural rather than singular, and it is not a convenience: phase 6's move acts on a selection,
 * and a loop over a singular statement is one HTTP round trip per photo inside one Server Action.
 * One id is a one-element array; `[]` returns `0` without running a statement, because
 * `inArray(col, [])` compiles to `false` in some drizzle versions and to a syntax error in others,
 * and neither is worth depending on.
 *
 * The destination is NOT validated here. Its grammar is `lib/admin/filetree.ts`'s
 * `validateFolderPath` and it is checked in phase 4's `folderPathSchema`, next to the widget that
 * produced it — the same division `updateNinaAvatarCrop` above states for the crop bounds, and for
 * the same reason: a bound is a property of the UI that produces the value, and duplicating it
 * here would put two opinions about a folder name in two files.
 *
 * Returns how many rows actually moved. Fewer than `ids.length` means "some of those are not
 * yours or are already gone", per this module's rule 1.
 */
export async function moveNinaAvatarsToFolder(
  userId: string,
  ids: readonly string[],
  folder: string,
): Promise<number> {
  if (ids.length === 0) return 0
  const updated = await db
    .update(ninaAvatars)
    .set({ folder })
    .where(and(eq(ninaAvatars.userId, userId), inArray(ninaAvatars.id, [...ids])))
    .returning({ id: ninaAvatars.id })
  return updated.length
}

/**
 * Rename or move a folder AND everything under it — one `UPDATE`, again with no blob copied.
 *
 * ── THE REWRITE ────────────────────────────────────────────────────────────────────────────
 * `SET folder = $to || substr(folder, length($from) + 1)`. For the folder's own rows,
 * `substr(from, len+1)` is `''`, so they become `$to`. For a descendant `from/a/b`, it is `/a/b`,
 * so it becomes `to/a/b`. One statement, whatever the depth, and the tree's shape below the moved
 * node is preserved rather than recomputed. `renameFolder` and `moveFolder` are the same
 * statement: renaming is moving to a sibling path, and giving them separate implementations would
 * be two chances to get the prefix arithmetic wrong.
 *
 * ── THE TWO REFUSALS ───────────────────────────────────────────────────────────────────────
 *   - **The album root, at either end.** It cannot be renamed, because it has no name — it is the
 *     absence of a path. It cannot be a destination either, and that one is arithmetic rather than
 *     philosophy: `'' || '/a/b'` is `/a/b`, a leading slash, which is not a canonical
 *     `nina_avatars.folder` value. A "flatten everything onto the root" operation would need its
 *     own statement, and nothing in the plan asks for one.
 *   - **A folder into itself.** `to.startsWith(from + '/')` is a destination inside the subtree
 *     being rewritten, which would produce paths nested inside their own former selves and a tree
 *     the builder cannot draw. `to === from` is not that: it is a no-op, and it succeeds with
 *     `moved: 0` rather than being refused, because an idempotent rename is a correct rename.
 *
 * Both refusals are also decided, with better messages, by phase 6's `planRelocation` before this
 * is called. They are kept here anyway — the `setCurrentNinaAvatar` posture: a guard that could
 * argue it is redundant is cheap, and this one is the difference between a bad argument and a
 * corrupted tree.
 *
 * `moved: 0` is also a legitimate outcome for a real rename, two ways: a folder can hold nothing
 * but subfolders that hold nothing, or it can be a `nina_folders` declaration with no photographs
 * in it at all. Either way the rename still has to happen, and its `nina_folders` half
 * (`renameNinaFolderSubtree`) is a separate statement phase 6 runs after this one. Phase 6 must
 * not read `0` as failure.
 */
export async function renameNinaAvatarFolder(
  userId: string,
  from: string,
  to: string,
): Promise<NinaFolderRenameResult> {
  if (from === '' || to === '') return { ok: false, reason: 'root' }
  if (to === from) return { ok: true, moved: 0 }
  if (to.startsWith(`${from}/`)) return { ok: false, reason: 'cycle' }

  const updated = await db
    .update(ninaAvatars)
    .set({
      folder: sql`${to}::text || substr(${ninaAvatars.folder}, ${from.length + 1}::int)`,
    })
    .where(and(eq(ninaAvatars.userId, userId), folderSubtree(ninaAvatars.folder, from)))
    .returning({ id: ninaAvatars.id })

  return { ok: true, moved: updated.length }
}

/**
 * Delete a folder and everything under it, handing back every blob ref so the caller can remove
 * the objects.
 *
 * ── THE CURRENT PHOTO IS SKIPPED HERE AND REFUSED ONE LAYER UP ──────────────────────────────
 * `eq(ninaAvatars.isCurrent, false)` is in the WHERE, exactly as it is in `deleteNinaAvatar`
 * above, so "zero current avatars" is unreachable from this statement no matter what a caller
 * does. What this statement deliberately does NOT do is decide whether the operation should have
 * happened at all: a subtree delete that silently leaves her photo behind reads as a delete that
 * half-worked, and the operator's next move is to try again and watch it half-work identically.
 *
 * That decision is phase 6's `deleteNinaAlbumFolderAction`, and it has to be, because phase 6
 * offers two answers to it: refuse the whole operation naming the photo (the default), or delete
 * everything else and say which photo stayed (`keepCurrent`). A statement that refused the subtree
 * — which is what this function's draft did — can express the first and not the second. So the
 * action reads `getCurrentNinaAvatar` itself, decides, and then calls this.
 *
 * (Promotion-on-delete stays rejected for the reason `deleteNinaAvatar` gives: picking the
 * successor is the choice `/admin/nina` exists to offer.)
 *
 * ── ROWS FIRST, BLOBS BEST-EFFORT ──────────────────────────────────────────────────────────
 * This function deletes rows only and returns refs; the caller `del()`s. That order is
 * `deleteNinaAvatarAction`'s argument and it holds at any batch size: an orphaned blob is
 * recoverable (a store listing finds it, and ruling D4's card is about teaching `blob-reap` to),
 * while a row pointing at an object that is already gone is a broken image on a screen with no
 * way to fix itself. A caller must expect BOTH refs per row and must tolerate a NULL thumbnail.
 */
export async function deleteNinaAvatarsInFolderTree(
  userId: string,
  folder: string,
): Promise<NinaAvatarBlobRef[]> {
  return db
    .delete(ninaAvatars)
    .where(
      and(
        eq(ninaAvatars.userId, userId),
        eq(ninaAvatars.isCurrent, false),
        folderSubtree(ninaAvatars.folder, folder),
      ),
    )
    .returning({
      id: ninaAvatars.id,
      blobUrl: ninaAvatars.blobUrl,
      pathname: ninaAvatars.pathname,
      thumbUrl: ninaAvatars.thumbUrl,
      thumbPathname: ninaAvatars.thumbPathname,
    })
}

/**
 * Delete a SET of photos by id, handing back their blob refs. The bulk form of `deleteNinaAvatar`,
 * and the same guard: `is_current = false` is in the WHERE, so her current photo survives a
 * selection that includes it and comes back absent from the result rather than deleted.
 *
 * One statement rather than a loop, for `moveNinaAvatarsToFolder`'s reason: 200 selected photos
 * would be 200 neon-http round trips inside one Server Action, which is both slow enough to reach
 * the function's duration limit and 200 chances to fail halfway with no record of where.
 *
 * `removed.length < ids.length` is normal and means some of those ids are not the caller's, are
 * already gone, or are her current photo. Deciding which of those to tell the operator about is
 * phase 6's; this reports facts.
 */
export async function deleteNinaAvatars(
  userId: string,
  ids: readonly string[],
): Promise<NinaAvatarBlobRef[]> {
  if (ids.length === 0) return []
  return db
    .delete(ninaAvatars)
    .where(
      and(
        eq(ninaAvatars.userId, userId),
        eq(ninaAvatars.isCurrent, false),
        inArray(ninaAvatars.id, [...ids]),
      ),
    )
    .returning({
      id: ninaAvatars.id,
      blobUrl: ninaAvatars.blobUrl,
      pathname: ninaAvatars.pathname,
      thumbUrl: ninaAvatars.thumbUrl,
      thumbPathname: ninaAvatars.thumbPathname,
    })
}

/**
 * How many photos the album holds, as a number rather than as a list of rows.
 *
 * ── WHY THIS EXISTS: `app/admin/page.tsx` WAS READING THE WHOLE ALBUM TO PRINT ITS SIZE ─────
 * The `/admin` hub does `listNinaAvatars(userId)` and then uses nothing but `album.length`. That
 * was a handful of rows when F33 landed it. After F34 it is *"hundreds of profile pics"* — every
 * column, every blob URL, every `description` — fetched in full on every visit to the hub, to
 * render one integer. This is the read that should always have been there, and the hub is its one
 * call site. Reported here rather than in a follow-up card because the phase that makes a read
 * grow is the phase that owns replacing it.
 *
 * Reads `nina_avatars_user_created_idx` as a count over an index range on `user_id`. No folder
 * predicate: the hub's number is the whole album, which is exactly the read
 * `listNinaAvatarsInFolder` cannot answer.
 */
export async function countNinaAvatars(userId: string): Promise<number> {
  const counted = await db
    .select({ total: sql<number>`count(*)`.mapWith(Number) })
    .from(ninaAvatars)
    .where(eq(ninaAvatars.userId, userId))
  return counted[0]?.total ?? 0
}

/**
 * Declare one or more folders. Idempotent, and the album root is silently dropped.
 *
 * `ON CONFLICT DO NOTHING` on the composite primary key is what makes this safe to call from
 * anywhere without asking first — phase 6's "New subfolder" calls it, and phase 4's batch register
 * calls it for the folder an upload lands in, so a folder that arrived by being dropped is
 * declared too and survives its photographs being removed. Two tabs creating the same folder is a
 * no-op, not a duplicate and not an error.
 *
 * ── THE ROOT IS DROPPED HERE, NOT REFUSED ───────────────────────────────────────────────────
 * `''` is the album root: it always exists and cannot be created (see `ninaFolders`'s header). A
 * caller passing it is not making a mistake worth an exception — `planFolderUpload` legitimately
 * reports root-level files — so it is filtered. An empty input after filtering returns `0` without
 * a statement, because `db.insert(...).values([])` is a syntax error and not an empty write.
 *
 * Returns how many declarations were NEW, which is `returning()`'s row count under
 * `DO NOTHING` — useful to phase 6 for telling "created" from "already existed" without a
 * second read.
 */
export async function declareNinaFolders(
  userId: string,
  folders: readonly string[],
): Promise<number> {
  const wanted = [...new Set(folders.filter((folder) => folder !== ''))]
  if (wanted.length === 0) return 0

  const inserted = await db
    .insert(ninaFolders)
    .values(wanted.map((folder) => ({ userId, folder })))
    .onConflictDoNothing()
    .returning({ folder: ninaFolders.folder })
  return inserted.length
}

/**
 * Rewrite declared paths under a renamed or moved prefix — the `nina_folders` half of
 * `renameNinaAvatarFolder`. Phase 6 calls both, in that order, for one rename.
 *
 * The same `folderSubtree` predicate as above, for the same reason: `left()` and not `LIKE`, so a
 * folder named `100%` cannot widen the match. `overlay()` replaces the prefix in place rather than
 * re-deriving the path, so a descendant four levels down moves with its ancestor and nothing has to
 * parse a path in SQL.
 *
 * Returns the number of declarations rewritten. **`0` is a success**, not a failure — it means the
 * renamed folder had no declarations under it, which is the ordinary case for a folder that arrived
 * by being dropped and was never declared. Phase 6 must not read it as "the folder did not exist";
 * `renameNinaAvatarFolder`'s row count is not proof of existence either, and
 * `listNinaAvatarFolders` is what answers that question.
 */
export async function renameNinaFolderSubtree(
  userId: string,
  from: string,
  to: string,
): Promise<number> {
  const rewritten = await db
    .update(ninaFolders)
    .set({
      folder: sql`overlay(${ninaFolders.folder} placing ${to} from 1 for ${from.length})`,
    })
    .where(and(eq(ninaFolders.userId, userId), folderSubtree(ninaFolders.folder, from)))
    .returning({ folder: ninaFolders.folder })
  return rewritten.length
}

/**
 * Undeclare a folder and everything under it. The `nina_folders` half of
 * `deleteNinaAvatarsInFolderTree`.
 *
 * **Phase 6 decides WHETHER to call this, and that decision is not obvious**: under its
 * `keepCurrent` policy the folder still holds her current photograph, so the folder must go on
 * existing and this must NOT be called. Calling it anyway would undeclare a folder that still has
 * a row in it — which `listNinaAvatarFolders` would paper over (the photograph carries the folder),
 * making the bug invisible until the last photograph left. That is precisely the class of silent
 * disagreement the UNION is designed to absorb rather than to excuse, so the ordering rule is
 * written down here as well as there: **undeclare only when the subtree is actually empty.**
 */
export async function deleteNinaFolderSubtree(userId: string, folder: string): Promise<number> {
  if (folder === '') return 0
  const removed = await db
    .delete(ninaFolders)
    .where(and(eq(ninaFolders.userId, userId), folderSubtree(ninaFolders.folder, folder)))
    .returning({ folder: ninaFolders.folder })
  return removed.length
}

/* ============================================================================
 * §10 The character tuning — F35 R1/R2/R3
 * ==========================================================================*/

/**
 * **The one place the flat row and the nested model meet.** `lib/db/schema.ts` spells
 * **thirty-seven** snake_case columns; `lib/nina/tuning.ts` spells `traits.anger` and
 * `dials.photoEagerness`. The three-layer boundary this file's own header describes for
 * `nina_messages.text` -> `body`, one table over: two spellings, ONE translation point, reviewable
 * in one diff.
 *
 * It ends in `coerceNinaTuning`, so a row hand-edited in `psql` to `anger = 900` reaches the prompt
 * as 100 rather than as a band index of 45.
 */
function tuningFromRow(row: NinaTuningRow): NinaTuning {
  return coerceNinaTuning({
    relationship: row.relationship,
    traits: {
      anger: row.anger,
      chill: row.chill,
      sad: row.sad,
      flirty: row.flirty,
      steamy: row.steamy,
      wise: row.wise,
      annoying: row.annoying,
      funny: row.funny,
      happy: row.happy,
      anxious: row.anxious,
      concerned: row.concerned,
      horny: row.horny,
    },
    dials: {
      profanity: row.profanity,
      clinginess: row.clinginess,
      photoEagerness: row.photoEagerness,
      verbosity: row.verbosity,
    },
    /* R4's toggles. Every one of these is `boolean | null`, and a NULL is a row written before the
     * columns existed — `coerceNinaEnabled` reads anything that is not literally `false` as on, so
     * an existing production row arrives here all-enabled with no data migration behind it. */
    enabled: {
      relationship: row.relationshipEnabled,
      anger: row.angerEnabled,
      chill: row.chillEnabled,
      sad: row.sadEnabled,
      flirty: row.flirtyEnabled,
      steamy: row.steamyEnabled,
      wise: row.wiseEnabled,
      annoying: row.annoyingEnabled,
      funny: row.funnyEnabled,
      happy: row.happyEnabled,
      anxious: row.anxiousEnabled,
      concerned: row.concernedEnabled,
      horny: row.hornyEnabled,
      profanity: row.profanityEnabled,
      clinginess: row.clinginessEnabled,
      photoEagerness: row.photoEagernessEnabled,
      verbosity: row.verbosityEnabled,
    },
    notes: row.notes,
  })
}

/**
 * The other direction: the nested model back into the flat columns. The SAME object is both the
 * INSERT values and the `ON CONFLICT` set, so a save writes every column whether the row is new or
 * not — there is no partial row to write and none to smuggle in.
 */
function tuningToColumns(tuning: NinaTuning) {
  return {
    relationship: tuning.relationship,
    anger: tuning.traits.anger,
    chill: tuning.traits.chill,
    sad: tuning.traits.sad,
    flirty: tuning.traits.flirty,
    steamy: tuning.traits.steamy,
    wise: tuning.traits.wise,
    annoying: tuning.traits.annoying,
    funny: tuning.traits.funny,
    happy: tuning.traits.happy,
    anxious: tuning.traits.anxious,
    concerned: tuning.traits.concerned,
    horny: tuning.traits.horny,
    profanity: tuning.dials.profanity,
    clinginess: tuning.dials.clinginess,
    photoEagerness: tuning.dials.photoEagerness,
    verbosity: tuning.dials.verbosity,
    /* R4. The RAW score above and the RAW flag here — this is the store, and switching a dial off
     * must never lose the number it was parked at. The gate that substitutes `defaultScore` lives
     * on the PROMPT side (`ninaTraitScore` / `ninaDialScore`), which is the whole point of a toggle
     * as opposed to dragging the slider back. */
    relationshipEnabled: tuning.enabled.relationship,
    angerEnabled: tuning.enabled.anger,
    chillEnabled: tuning.enabled.chill,
    sadEnabled: tuning.enabled.sad,
    flirtyEnabled: tuning.enabled.flirty,
    steamyEnabled: tuning.enabled.steamy,
    wiseEnabled: tuning.enabled.wise,
    annoyingEnabled: tuning.enabled.annoying,
    funnyEnabled: tuning.enabled.funny,
    happyEnabled: tuning.enabled.happy,
    anxiousEnabled: tuning.enabled.anxious,
    concernedEnabled: tuning.enabled.concerned,
    hornyEnabled: tuning.enabled.horny,
    profanityEnabled: tuning.enabled.profanity,
    clinginessEnabled: tuning.enabled.clinginess,
    photoEagernessEnabled: tuning.enabled.photoEagerness,
    verbosityEnabled: tuning.enabled.verbosity,
    notes: tuning.notes,
  }
}

/**
 * **Her character, right now. Never null.**
 *
 * A user with no row gets `NINA_TUNING_DEFAULTS`, and that is the whole design: it is what makes
 * every downstream caller unconditional — no `?? defaults` at four call sites, no "is she tuned
 * yet" branch in `turn.ts`, and no way for a first-run user to get a prompt with holes in it.
 * `NINA_TUNING_DEFAULTS` is frozen, so the shared object cannot be mutated by a caller that
 * receives it.
 *
 * Read live on every turn with no cache, like everything else on this path.
 * `memoryActions.ts` under `lib/admin/` records the consequence: a committed row is in her next
 * prompt with no invalidation step at all, which is what makes R1's slider immediate. (Directory
 * split off the filename deliberately — see `lib/nina/tuning.ts`'s header: `tests/admin.memory.
 * test.ts` proves the boundary by forbidding the joined path as a substring in every file here.)
 *
 * `SELECT *` rather than a column list, and this is the one place in the file where that is right:
 * the table is one row of twenty columns and every one of them is wanted, so a list would be
 * twenty lines that can only ever be wrong.
 */
export async function readNinaTuning(userId: string): Promise<NinaTuning> {
  const rows = await db.select().from(ninaTuning).where(eq(ninaTuning.userId, userId)).limit(1)
  const row = rows[0]
  return row ? tuningFromRow(row) : NINA_TUNING_DEFAULTS
}

/**
 * **One save, not seventeen** (plan invariant 11). Upsert on `user_id` and return what was stored
 * — one statement, so two tabs racing is last-write-wins on whole rows rather than a read-then-write
 * that can lose the newer one.
 *
 * ── IT COERCES BEFORE IT WRITES ───────────────────────────────────────────────────────────────
 * `coerceNinaTuning` runs here as well as in phase 5's Zod boundary, on purpose. Zod's job is a
 * good error message for a human at a form; this is the store defending its own invariants against
 * every other caller — a script, a test, a future migration. A row that cannot be read back as a
 * valid `NinaTuning` never gets written in the first place.
 *
 * ── RESETTING TO DEFAULTS IS A WRITE, NOT A DELETE ────────────────────────────────────────────
 * Phase 5's "reset" calls this with the defaults, and a row of defaults and NO row read identically
 * (`readNinaTuning` returns `NINA_TUNING_DEFAULTS` for a user with no row, and `coerceNinaTuning`
 * maps a defaults row back to those same values), so deleting would be a second code path answering
 * a question this one write already answers with the one writer this table has.
 */
export async function writeNinaTuning(userId: string, tuning: NinaTuning): Promise<NinaTuning> {
  const safe = coerceNinaTuning(tuning)
  const columns = tuningToColumns(safe)

  const rows = await db
    .insert(ninaTuning)
    .values({ userId, ...columns })
    .onConflictDoUpdate({
      target: ninaTuning.userId,
      set: { ...columns, updatedAt: new Date() },
    })
    .returning()

  const row = rows[0]
  /* `.returning()` on an upsert always yields the row, so this is unreachable in practice — but
   * this file returns a usable answer rather than throwing, everywhere, and the defaults are the
   * usable answer. See the header: "these functions return null, [] or false rather than
   * throwing". */
  return row ? tuningFromRow(row) : NINA_TUNING_DEFAULTS
}

/* ============================================================================
 * §10b The image-generation preferences, and the photographs a reference can
 * be chosen from — R4-R10, storage only
 * ==========================================================================*/

/**
 * **The one place `nina_image_prefs`'s flat row and the nested model meet.** `lib/db/schema.ts`
 * spells fifteen snake_case columns; `lib/nina/imageprefs.ts` spells `focus.boobs` and
 * `reference.source`. The same three-layer boundary `tuningFromRow` describes one table over: two
 * spellings, ONE translation point, reviewable in one diff.
 *
 * It ends in `coerceNinaImagePrefs`, so a row hand-edited in `psql` to `prompt_length = 900` reaches
 * the prompt as 100 rather than as a band index of 45.
 */
function imagePrefsFromRow(row: NinaImagePrefsRow): NinaImagePrefs {
  return coerceNinaImagePrefs({
    promptLength: row.promptLength,
    focus: {
      face: row.focusFace,
      skin: row.focusSkin,
      boobs: row.focusBoobs,
      butt: row.focusButt,
      thighs: row.focusThighs,
      calves: row.focusCalves,
    },
    wardrobe: row.wardrobe,
    venue: row.venue,
    /* The one spelling difference in this table. See `nina_image_prefs`'s header: a bare `time`
     * column is a Postgres type name, and `photo_eagerness` is the precedent. */
    time: row.timeOfDay,
    notes: row.notes,
    promptTemplate: row.promptTemplate,
    model: row.model,
    reference: { source: row.referenceSource, id: row.referenceId },
  })
}

/**
 * The other direction. The write value carries every column the table has, so this is a flat copy
 * of one nested model into the row's flat columns — nothing is held back for the database to mint.
 *
 * The six focus columns are `NOT NULL`, so drizzle's insert type makes a forgotten one a compile
 * error here — which is what `nina_tuning`'s nullable `*_enabled` columns could not do and why
 * `tests/db.schema.nina.test.ts` has to grep for those. The READ side above has no such protection
 * (a forgotten key is `undefined`, which coerces to `false` — a checkbox that silently does
 * nothing), so that direction is grepped in `tests/db.schema.nina.test.ts` instead.
 */
function imagePrefsToColumns(prefs: NinaImagePrefsWrite) {
  return {
    promptLength: prefs.promptLength,
    focusFace: prefs.focus.face,
    focusSkin: prefs.focus.skin,
    focusBoobs: prefs.focus.boobs,
    focusButt: prefs.focus.butt,
    focusThighs: prefs.focus.thighs,
    focusCalves: prefs.focus.calves,
    wardrobe: prefs.wardrobe,
    venue: prefs.venue,
    timeOfDay: prefs.time,
    notes: prefs.notes,
    promptTemplate: prefs.promptTemplate,
    model: prefs.model,
    referenceSource: prefs.reference.source,
    referenceId: prefs.reference.id,
  }
}

/**
 * **How she is photographed, right now. Never null.**
 *
 * A user with no row gets `NINA_IMAGE_PREFS_DEFAULTS`, and that is the whole design —
 * `readNinaTuning`'s argument, verbatim: it is what makes every downstream caller unconditional, so
 * `selfiegen.ts` needs no "has he opened the tab yet" branch and a first-run generation cannot get a
 * prompt with holes in it. `NINA_IMAGE_PREFS_DEFAULTS` is frozen, so the shared object cannot be
 * mutated by a caller that receives it.
 *
 * Read live at dispatch time with no cache, like everything else on this path: a wardrobe saved
 * thirty seconds ago is in the next photograph.
 *
 * `SELECT *` rather than a column list, and this is the second place in the file where that is
 * right: the table is one row of fifteen columns and every one of them is wanted, so a list would
 * be fifteen lines that can only ever be wrong.
 */
export async function readNinaImagePrefs(userId: string): Promise<NinaImagePrefs> {
  const rows = await db
    .select()
    .from(ninaImagePrefs)
    .where(eq(ninaImagePrefs.userId, userId))
    .limit(1)
  const row = rows[0]
  return row ? imagePrefsFromRow(row) : NINA_IMAGE_PREFS_DEFAULTS
}

/**
 * **One save, not fifteen** (plan invariant 7). Upsert on `user_id` and return what was stored —
 * statement for statement, `writeNinaTuning`.
 *
 * Every paragraph of `writeNinaTuning`'s docstring applies unchanged, so they are cited rather than
 * repeated: it coerces before it writes, because Zod's job is a good error message for a human at a
 * form and this is the store defending its own invariants against a script, a test and a future
 * migration; and a save replaces the whole row, because the caller always supplies one.
 */
export async function writeNinaImagePrefs(
  userId: string,
  prefs: NinaImagePrefsWrite,
): Promise<NinaImagePrefs> {
  const safe = coerceNinaImagePrefs(prefs)
  const columns = imagePrefsToColumns(safe)

  const rows = await db
    .insert(ninaImagePrefs)
    .values({ userId, ...columns })
    .onConflictDoUpdate({
      target: ninaImagePrefs.userId,
      set: { ...columns, updatedAt: new Date() },
    })
    .returning()

  const row = rows[0]
  /* `.returning()` on an upsert always yields the row, so this is unreachable in practice — but
   * this file returns a usable answer rather than throwing, everywhere, and the defaults are the
   * usable answer. */
  return row ? imagePrefsFromRow(row) : NINA_IMAGE_PREFS_DEFAULTS
}

/**
 * **Every photograph the operator may point the camera at, from both sets, newest first** — R10's
 * *"user can select all photos in Nina's album and Chat photos"*.
 *
 * ── TWO BOUNDED READS PLUS A PURE MERGE, NOT A SQL `UNION ALL` ──────────────────────────────
 * The two tables share no column list — `nina_avatars` has a derived `thumb_url` and
 * `nina_message_images` has none — so a `UNION ALL` would need a projection with literal
 * discriminators, and its ordering could then only be proved against a live database. Instead each
 * side is read on its own index and `mergeNinaPhotoRefs` orders and slices them, which `npm test`
 * proves with no database at all. It is the split `listNinaAvatarFolders` already makes and states:
 * *"SQL groups, the pure module rolls up."*
 *
 * ── IT IS BOUNDED, AND `NINA_PHOTO_REF_SCAN_MAX` IS WHERE ─────────────────────────────────────
 * `ninaPhotoRefBounds` clamps `limit` to `NINA_PHOTO_REF_PAGE_SIZE` (both default and CEILING, so a
 * hand-edited request cannot widen it) and caps the reachable depth at `NINA_PHOTO_REF_SCAN_MAX`,
 * which is also the per-side `LIMIT`. An unbounded read over *"hundreds of profile pics"* is the
 * mistake `countNinaAvatars` exists to undo, and `listNinaAvatars` (:2314) is that unbounded read —
 * it is deliberately NOT reused here.
 *
 * ── FOUR STATEMENTS, RUN CONCURRENTLY ────────────────────────────────────────────────────────
 * Two pages and two counts, in one `Promise.all`. The counts are their own statements rather than
 * `count(*) OVER ()` windows for `listNinaChatPhotos`'s reason: a window reports `total: 0` for an
 * over-shot page, which the picker has to tell apart from an empty collection. The chat count is
 * literally `countNinaChatPhotos` (:1713) rather than a second copy of its predicate.
 *
 * ── WHICH ROWS, AND WHICH INDEX ──────────────────────────────────────────────────────────────
 * The album side is EVERY folder — *"all photos in Nina's album"* — so there is no `folder`
 * predicate and it reads `nina_avatars_user_created_idx on (user_id, created_at desc)`, which is
 * exactly this shape. The chat side is `generatedChatPhotoScope` (:1649), i.e. `kind = 'generated'`
 * only: HIS uploads share that table and are not photographs of her. `kind` stays a residual
 * predicate over `nina_message_images_user_created_idx` for the reason that function's docstring
 * gives, and **no index is added** — nothing has measured a need for one.
 *
 * ── AND NOT A REFERENCE ROW. THIS IS PLAN INVARIANT 13 AND IT IS WHY THIS FUNCTION CALLS
 *    `generatedChatPhotoScope` INSTEAD OF SPELLING `eq(kind, 'generated')` ITSELF ───────────────
 * A row in `nina_message_images` is a **reference** when `source_avatar_id` OR `source_image_id` is
 * non-null (`lib/db/schema.ts:1081-1112`): it is a real photograph in a real bubble whose bytes are
 * already in the collection under another id, written by `resolveAttachment`'s re-attach path
 * (`lib/nina/actions.ts:589-615`, provenance from `ninaPhotoProvenance`,
 * `lib/nina/attach.ts:221-229`, which flattens `source_image_id ?? row.id` so a copy of a copy
 * points at the original).
 *
 * **If this union contained reference rows it would show the same photograph more than once** —
 * once as the `nina_avatars` row and again as the chat row that merely points at it — which is
 * exactly the duplication the `nina-photo-refs-and-bubble-actions` set was built to remove, and
 * which the user complained about in as many words. R10's grid would re-create the defect on a new
 * screen.
 *
 * It does not, and the reason is structural rather than lucky: `generatedChatPhotoScope`
 * (`lib/nina/queries.ts:1649-1655`) is `and(eq(userId), eq(kind, 'generated'), isOriginalPhoto())`,
 * and `isOriginalPhoto()` (`:1616-1618`) is
 * `and(isNull(sourceAvatarId), isNull(sourceImageId))`. `countNinaChatPhotos` (:1713) shares that
 * same private scope, so the page and the `total` cannot disagree — which is the argument that
 * function's own docstring makes at `:1642-1647`.
 *
 * **DO NOT INLINE THE PREDICATE.** Replacing `generatedChatPhotoScope(userId)` with a hand-written
 * `and(eq(ninaMessageImages.userId, userId), eq(ninaMessageImages.kind, 'generated'))` — the
 * "obvious" simplification, since this function needs a different projection anyway — silently
 * re-admits every reference row and re-creates the duplicate. `tests/nina.imageprefs.test.ts`
 * asserts the source of this function contains `generatedChatPhotoScope` and does **not** contain a
 * literal `kind` comparison, so the shortcut fails a test rather than shipping.
 *
 * The album side needs no such filter and gains nothing from one: `nina_avatars` is the ORIGIN side
 * and has no provenance columns at all (`lib/db/schema.ts:1497-1571`). An album row is never a
 * reference. And a chat photograph whose bytes came FROM an album face is caught on the chat side —
 * either by `resolveAttachment` at insert time going forward, or by
 * `drizzle/0010_nina_image_provenance.sql`'s second backfill retroactively, which matches on equal
 * `blob_url` within one `user_id` in either direction.
 *
 * `resolveNinaPhotoReference` below uses the same scope for the same reason, so a saved id can
 * never resolve to a reference row either. That is consistent rather than redundant: the picker
 * never offers one, and provenance is written at insert and never later, so a saved selection
 * cannot become a reference after the fact.
 *
 * ── WHAT IT DOES NOT RETURN ──────────────────────────────────────────────────────────────────
 * No `description`, no `filename`, no `folder`, no `prompt`. R10 is *"a simple photos grid without
 * any captions (just like ios album app)"*, and a field the grid must not render is a field this
 * read must not ship — the same discipline `listNinaAvatarManifest` applies to its own projection.
 */
export async function listNinaPhotoReferences(
  userId: string,
  opts: { limit?: number; offset?: number } = {},
): Promise<NinaPhotoRefPage> {
  const bounds = ninaPhotoRefBounds(opts)

  const [albumRows, chatRows, albumCount, chatCount] = await Promise.all([
    db
      .select({
        id: ninaAvatars.id,
        blobUrl: ninaAvatars.blobUrl,
        thumbUrl: ninaAvatars.thumbUrl,
        width: ninaAvatars.width,
        height: ninaAvatars.height,
        createdAt: ninaAvatars.createdAt,
      })
      .from(ninaAvatars)
      .where(eq(ninaAvatars.userId, userId))
      .orderBy(desc(ninaAvatars.createdAt), desc(ninaAvatars.id))
      .limit(bounds.scan),
    db
      .select({
        id: ninaMessageImages.id,
        blobUrl: ninaMessageImages.blobUrl,
        width: ninaMessageImages.width,
        height: ninaMessageImages.height,
        createdAt: ninaMessageImages.createdAt,
      })
      .from(ninaMessageImages)
      .where(generatedChatPhotoScope(userId))
      .orderBy(desc(ninaMessageImages.createdAt), desc(ninaMessageImages.id))
      .limit(bounds.scan),
    countNinaAvatars(userId),
    countNinaChatPhotos(userId),
  ])

  /* `as const` on the discriminator rather than relying on the annotation's contextual type: this
   * is the one place a widened `string` would turn a compile error into a row the grid cannot key. */
  const album: NinaPhotoRef[] = albumRows.map((row) => ({ source: 'album' as const, ...row }))
  /* `nina_message_images` has no `thumb_url` column, so the grid loads the original — which is what
   * `ChatPhotoGrid` already knowingly does, and the plan's Scope rules out adding the column. */
  const chat: NinaPhotoRef[] = chatRows.map((row) => ({
    source: 'chat' as const,
    thumbUrl: null,
    ...row,
  }))

  return {
    rows: mergeNinaPhotoRefs(album, chat, bounds),
    total: albumCount + chatCount,
    offset: bounds.offset,
    limit: bounds.limit,
  }
}

/**
 * **The stored reference, resolved to a photograph — or `null`.** The bridge between what the row
 * holds (a set and an id) and what a generation needs (bytes at a URL).
 *
 * `nina_image_prefs` stores an id and not a blob URL because replacing a chat photograph's bytes
 * (`updateNinaChatPhotoBlob`, :1768) changes its `blob_url` and keeps its `id` — see that table's
 * header. The cost of that choice is this function, and it is one primary-key read.
 *
 * ── `null` IS THE ANSWER, NOT AN ERROR ──────────────────────────────────────────────────────
 * There is no foreign key on the two reference columns (two possible parents, and a cascade would
 * delete a whole preferences row because one photograph was deleted), so a photograph the operator
 * later deleted leaves an id pointing at nothing. That must NOT break the preferences row and must
 * not fail a generation: phase 3 degrades to an unanchored call, which is the plan's own decision
 * about a reference that cannot be fetched. `'none'` returns `null` on the same branch and without a
 * statement, so the ordinary unanchored case costs no round trip.
 *
 * It returns the whole `NinaPhotoRef` and not just the URL, because there are two callers with
 * different needs: phase 3 wants `blobUrl`, and phase 5 wants to render the chosen tile even when it
 * has fallen off the current page.
 */
export async function resolveNinaPhotoReference(
  userId: string,
  reference: NinaImageReference,
): Promise<NinaPhotoRef | null> {
  if (reference.source === 'none' || reference.id === '') return null

  if (reference.source === 'album') {
    const rows = await db
      .select({
        id: ninaAvatars.id,
        blobUrl: ninaAvatars.blobUrl,
        thumbUrl: ninaAvatars.thumbUrl,
        width: ninaAvatars.width,
        height: ninaAvatars.height,
        createdAt: ninaAvatars.createdAt,
      })
      .from(ninaAvatars)
      .where(and(eq(ninaAvatars.userId, userId), eq(ninaAvatars.id, reference.id)))
      .limit(1)
    const row = rows[0]
    return row ? { source: 'album' as const, ...row } : null
  }

  const rows = await db
    .select({
      id: ninaMessageImages.id,
      blobUrl: ninaMessageImages.blobUrl,
      width: ninaMessageImages.width,
      height: ninaMessageImages.height,
      createdAt: ninaMessageImages.createdAt,
    })
    .from(ninaMessageImages)
    .where(and(generatedChatPhotoScope(userId), eq(ninaMessageImages.id, reference.id)))
    .limit(1)
  const row = rows[0]
  return row ? { source: 'chat' as const, thumbUrl: null, ...row } : null
}

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
