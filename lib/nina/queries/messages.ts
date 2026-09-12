/**
 * Nina's messages — every read, write and mutation over `nina_messages`.
 *
 * Split from `lib/nina/queries.ts` on 2026-09-12 (nina-queries-split): this file is that file's
 * §4b The messages and §4c Message mutation, moved byte-identical apart from two §-pointers
 * rewritten to module names. The layer-wide invariants — userId scoping on every statement,
 * `db.batch` never `db.transaction`, no `server-only` — live on the barrel header.
 */

import { and, asc, desc, eq, gt, inArray, isNull, sql, type SQL } from 'drizzle-orm'

import { db } from '@/lib/db'
import { ninaMessageImages, ninaMessages } from '@/lib/db/schema'
import { newId } from '@/lib/id'
import { messageColumns } from './columns'
import { getNinaSession } from './sessions'
import type { NinaMessageInsert, NinaMessageRow } from './shapes'
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
 * both ways (see the messages module's header), and `getNinaMessageWindow` no longer uses this
 * helper at all because its two statements deliberately disagree about scope (F35 phase 3, D4).
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
 * ── AND IT IS THE SECOND PLACE IN THE LAYER THAT VALIDATES AN FK BY HAND ────────────────────
 * `insertNinaMessageImages` (`queries/images.ts`) was the first, for the same reason: the foreign key proves the session
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
 * between `markNinaMessagesRead` above and the images module. Phase 7 writes them,
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
