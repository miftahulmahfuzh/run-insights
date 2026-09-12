import { and, desc, eq, exists, inArray, isNull, max, ne, sql } from 'drizzle-orm'

import { db } from '@/lib/db'
import {
  NINA_SLOT_PENDING_PROMISES,
  ninaChatSessions,
  ninaMemoryFacts,
  ninaMemorySlots,
  ninaMessages,
  users,
} from '@/lib/db/schema'
import { newId } from '@/lib/id'
import {
  NINA_SESSION_TITLE_MAX_CHARS,
  mostRecentNinaSession,
  orderNinaSessions,
} from '@/lib/nina/sessions'
import type { NinaIdentity, NinaSessionListRow, NinaSessionRow } from './shapes'
import { sessionColumns } from './columns'

/**
 * Nina's identity read and her conversation-session statements.
 *
 * Split out of `lib/nina/queries.ts` on 2026-09-12. Origin sections, in file order:
 *   - §3 Identity — `getNinaIdentity`
 *   - §4 The conversation — the group banner over the conversation sections; its other
 *     children (§4b messages, §4c message mutation) move to `lib/nina/queries/messages.ts`
 *     later in the same split
 *   - §4a Sessions — `createNinaSession` … `removeNinaSession`, plus the private
 *     `readNinaSessionsWithActivity`
 *
 * Banner prose moved byte-identical apart from three pointer rewrites where the prose said
 * "this module": the module header those lines cite — the userId-scoping rule, the
 * never-writes-`runs` rule, `db.batch` over `db.transaction`, the `ORDER BY seq` note, the
 * deliberate lack of `server-only` — stays on `lib/nina/queries.ts`'s header. This module
 * inherits those rules; it does not restate them.
 *
 * Imports foundation-wards only (`./shapes`, `./columns`, `@/lib/nina/sessions`) — never the
 * barrel `@/lib/nina/queries`, which re-exports this module.
 */
/* ============================================================================
 * §3 Identity
 * ==========================================================================*/

/**
 * RU-8's seed. `users.name` is what Google gave us; the `nickname` slot is what he told her to
 * call him, which she asks for in the first conversation. One batch, two statements, one snapshot
 * — so she can never be handed a name from before a rename and a nickname from after it.
 */
export async function getNinaIdentity(userId: string): Promise<NinaIdentity> {
  const [nameRows, slotRows] = await db.batch([
    db.select({ name: users.name }).from(users).where(eq(users.id, userId)).limit(1),

    db
      .select({ value: ninaMemorySlots.value })
      .from(ninaMemorySlots)
      .where(and(eq(ninaMemorySlots.userId, userId), eq(ninaMemorySlots.key, 'nickname')))
      .limit(1),
  ])

  const raw = slotRows[0]?.value
  return {
    fullName: nameRows[0]?.name ?? null,
    nickname: typeof raw === 'string' && raw.length > 0 ? raw : null,
  }
}

/* ============================================================================
 * §4 The conversation
 * ==========================================================================*/

/* ---------------------------------------------------------------------------
 * §4a Sessions — the conversation's partition (F35 R2, R4, R5, R11)
 *
 * Nine statements: create, read one, list with R5's derived sort key, resolve "the current one",
 * two title writes, the pin, a message count for the delete confirmation, and the delete itself.
 * Every one is `userId`-scoped in its WHERE, per `lib/nina/queries.ts`'s rule 1 — a session id arriving from
 * a URL is a claim, and only a row that came back from an owner-scoped read is a fact.
 * -------------------------------------------------------------------------*/

/**
 * A new, empty, untitled session (R2's "focus on a new topic").
 *
 * No title argument: a new session is always untitled, and `title IS NULL` is exactly what makes
 * phase 4's titler idempotent. Migration 0004's legacy session is the only titled row anything ever
 * inserts, and the migration writes it in SQL.
 *
 * The throw is not a failure path — `INSERT … RETURNING` always yields its row — it is how the
 * `T | undefined` from array indexing becomes the `T` the caller was promised. `actions.ts` does the
 * same thing for the same reason.
 */
export async function createNinaSession(userId: string): Promise<NinaSessionRow> {
  const [row] = await db
    .insert(ninaChatSessions)
    .values({ id: newId(), userId })
    .returning(sessionColumns)

  if (row == null) throw new Error('createNinaSession inserted no row')
  return row
}

/**
 * One session of his, or `null`. This is what turns `?s=<id>` from a claim into a fact, and phase 3
 * calls it before it reads a single message.
 *
 * `null` means "not yours, or gone" — deliberately one outcome, per `lib/nina/queries.ts`'s header. A screen
 * that distinguished them would tell a stranger which session ids exist.
 */
export async function getNinaSession(userId: string, id: string): Promise<NinaSessionRow | null> {
  const rows = await db
    .select(sessionColumns)
    .from(ninaChatSessions)
    .where(and(eq(ninaChatSessions.userId, userId), eq(ninaChatSessions.id, id)))
    .limit(1)

  return rows[0] ?? null
}

/**
 * The rows behind both public readers, in the base order the index already returns.
 *
 * **One batch, two statements, one snapshot** — the `getNinaIdentity` idiom. The second statement is
 * R5's sort key, derived rather than stored (see `nina_chat_sessions`'s header): `max(sent_at)`
 * grouped by session over `role = 'runner'`, which reads
 * `nina_messages_user_session_runner_idx` index-only. Batched with the first so a session row can
 * never be paired with an activity instant from a different moment.
 *
 * `max(ninaMessages.sentAt)` and not a hand-written `sql` aggregate: drizzle's `max()` applies the
 * COLUMN's own driver mapping, so this comes back as a real `Date` rather than as whatever the wire
 * format happened to be.
 *
 * Not exported. The order is a decision, and `lib/nina/sessions.ts` owns decisions — so the two
 * exported readers below differ only in which comparator they hand these rows to, which is the whole
 * point: "the list" and "the current session" are different questions with different answers.
 */
async function readNinaSessionsWithActivity(userId: string): Promise<NinaSessionListRow[]> {
  const [sessionRows, activityRows] = await db.batch([
    db
      .select(sessionColumns)
      .from(ninaChatSessions)
      .where(eq(ninaChatSessions.userId, userId))
      .orderBy(desc(ninaChatSessions.createdAt)),

    db
      .select({
        sessionId: ninaMessages.sessionId,
        lastUserMessageAt: max(ninaMessages.sentAt),
      })
      .from(ninaMessages)
      .where(and(eq(ninaMessages.userId, userId), eq(ninaMessages.role, 'runner')))
      .groupBy(ninaMessages.sessionId),
  ])

  const lastUserAt = new Map(activityRows.map((row) => [row.sessionId, row.lastUserMessageAt]))

  return sessionRows.map((row) => ({
    ...row,
    lastUserMessageAt: lastUserAt.get(row.id) ?? null,
  }))
}

/**
 * **R2's session history, in R4-then-R5 order: pinned first, then most recent user message first.**
 *
 * The ordering is `orderNinaSessions`'s and not this statement's, because
 * `vitest.config.ts` has no jsdom and no database — a rule in an `ORDER BY` is a rule no test can
 * assert (invariant 7). That is affordable because R2 asks for "a list of all past sessions", so
 * there is no `LIMIT` to be correct about; if a later phase paginates, the comparator moves into SQL
 * and its test moves with it.
 */
export async function listNinaSessions(userId: string): Promise<NinaSessionListRow[]> {
  return orderNinaSessions(await readNinaSessionsWithActivity(userId))
}

/**
 * **The id of his current session, creating one if he has none.**
 *
 * `mostRecentNinaSession` and NOT `listNinaSessions(...)[0]`: the display list puts pinned sessions
 * on top, so a session he pinned in March would otherwise become the destination of every proactive
 * message (assumption A3) and the default screen (assumption A4). "Most recent" means most recent by
 * activity, pins irrelevant, and `lib/nina/sessions.ts` keeps the two orders as two functions so this
 * cannot be got wrong quietly.
 *
 * **It creates, so it is a write, and two tabs can race it.** There is no transaction to take —
 * `db.transaction()` throws on neon-http — and no unique constraint can express "one session per
 * user" in a feature whose whole point is many. The loser of a race therefore gets a second empty
 * session, which is visible in the list and removable (R11). That is the honest cost; a lock we
 * cannot take and a constraint we must not add are the alternatives.
 */
export async function ensureNinaSession(userId: string): Promise<string> {
  const existing = mostRecentNinaSession(await readNinaSessionsWithActivity(userId))
  if (existing != null) return existing.id
  return (await createNinaSession(userId)).id
}

/**
 * R3's second half: he renames a session himself.
 *
 * Trim, cap at `NINA_SESSION_TITLE_MAX_CHARS`, refuse empty. `false` is "not yours, gone, or the title
 * was blank" — one outcome, as everywhere else in this module. `title_source = 'manual'` is what
 * tells phase 4's titler to keep its hands off, and it is set in the same statement as the title so
 * the two can never disagree.
 *
 * The cap here and phase 4's rule are ONE number, not a wide guard around a narrow rule: both are
 * `NINA_SESSION_TITLE_MAX_CHARS`, declared once in `lib/nina/sessions.ts` and imported by
 * `lib/nina/title.ts`. Phase 4 still owns the *semantic* rule — what "3-4 words" means when a model
 * returns seven — but not a second number.
 */
export async function renameNinaSession(
  userId: string,
  id: string,
  title: string,
): Promise<boolean> {
  const cleaned = title.trim().slice(0, NINA_SESSION_TITLE_MAX_CHARS)
  if (cleaned.length === 0) return false

  const updated = await db
    .update(ninaChatSessions)
    .set({ title: cleaned, titleSource: 'manual' })
    .where(and(eq(ninaChatSessions.userId, userId), eq(ninaChatSessions.id, id)))
    .returning({ id: ninaChatSessions.id })

  return updated.length > 0
}

/**
 * **Phase 4's titler write, and its idempotence is the `isNull` in the WHERE.**
 *
 * Written in the query layer — `lib/nina/queries/sessions.ts` since the 2026-09-12 split of phase
 * 1's `lib/nina/queries.ts` — not because phase 1 needs it. Phase 4
 * owns the prompt, the parse and the `after()` hook; this is the one statement it needs and cannot
 * write for itself.
 *
 * `title IS NULL` in the predicate rather than a read-then-write is what makes the whole thing safe
 * under the two conditions phase 4 has to survive: `after()` can run more than once, and two tabs can
 * finish the same first exchange at the same time. One conditional UPDATE, one row count, no race —
 * and it is also why a manually renamed session and 0004's `'backfill'` session are untouchable
 * without a second check: both have a non-NULL title.
 *
 * `false` means "already titled, not yours, or gone", which is precisely the set of cases in which
 * phase 4 should do nothing.
 */
export async function setNinaSessionTitleIfUntitled(
  userId: string,
  id: string,
  title: string,
): Promise<boolean> {
  const cleaned = title.trim().slice(0, NINA_SESSION_TITLE_MAX_CHARS)
  if (cleaned.length === 0) return false

  const updated = await db
    .update(ninaChatSessions)
    .set({ title: cleaned, titleSource: 'auto' })
    .where(
      and(
        eq(ninaChatSessions.userId, userId),
        eq(ninaChatSessions.id, id),
        isNull(ninaChatSessions.title),
      ),
    )
    .returning({ id: ninaChatSessions.id })

  return updated.length > 0
}

/**
 * R4. `pinned_at` is stamped or cleared; `now` is a parameter so a test can pin a date instead of
 * mocking global time — the `markNinaMessagesRead` precedent.
 *
 * Re-pinning an already-pinned session moves `pinned_at` forward, which changes nothing about the
 * order (pinning partitions the list, it does not sort it — see `compareNinaSessions`). It is left
 * that way rather than made a no-op because "when did I pin this" staying true costs nothing.
 */
export async function setNinaSessionPinned(
  userId: string,
  id: string,
  pinned: boolean,
  now: Date = new Date(),
): Promise<boolean> {
  const updated = await db
    .update(ninaChatSessions)
    .set({ pinnedAt: pinned ? now : null })
    .where(and(eq(ninaChatSessions.userId, userId), eq(ninaChatSessions.id, id)))
    .returning({ id: ninaChatSessions.id })

  return updated.length > 0
}

/**
 * **R11's delete, and R8's purge, in one transaction.**
 *
 * `nina_chat_sessions` -> `nina_messages.session_id` (cascade) -> `nina_message_images.message_id`
 * (**`set null`**). Postgres chains the first hop, so the last statement below removes the
 * conversation and its messages — and then STOPS. The photograph rows survive with
 * `message_id = NULL`.
 *
 * **That last sentence is the fix for R1 and this function did not change to get it.** It used to
 * read "removes the conversation and its photo ROWS", and that was the defect the runner reported
 * twice: *"photos collection that were painstakingly generated by llm, will be deleted if user
 * delete chat session"*, and *"i have replaced some photos in Chat photos, but when i delete chat
 * sessions, these photos … got deleted as well"*. The second case is the same bug because
 * `updateNinaChatPhotoBlob` deliberately keeps the row on its original message and swaps the bytes
 * underneath it. Both are cured by the FK, in `lib/db/schema.ts`, which is where a rule about what
 * a delete may reach belongs — not by a statement here.
 *
 * ── THE THREE STATEMENTS IN FRONT OF IT, AND WHY THEY EXIST (R8) ──────────────────────────────
 * This function used to be one DELETE, and its own comment argued that the memory ledger should
 * survive it: *"a distilled fact can be true after the sentence that produced it is gone"*. That
 * argument is still correct about a SENTENCE and it is still what `deleteNinaMessage` does. It is
 * wrong about a CONVERSATION, and the runner measured it: *"the deleted sessions polluted nina
 * character and it gets worse as time goes on"*. `loadNinaContext` reads the session's message
 * window and THE WHOLE RELATIONSHIP'S memory ledger — the window is scoped, the ledger is not — so
 * the ledger was the only surviving channel by which a deleted session still reached her prompt.
 * Deleting a session is him saying the topic never happened; deleting one bubble is him tidying one
 * line. This function overrides the first and leaves the second exactly as it was.
 *
 * ── WHY A SUBQUERY AND NOT A PRE-READ ─────────────────────────────────────────────────────────
 * The purge has to name the messages the cascade is about to destroy, which means reading them
 * BEFORE the DELETE. A pre-read would do it, and would open a window in which a concurrent send
 * files a new message into the session between the read and the delete — a message whose distilled
 * facts would then survive. `db.batch` runs the whole array inside ONE transaction in array order,
 * so `sessionMessageIds` below is evaluated three times against rows that are still there, and
 * there is no window at all.
 *
 * ── WHY NOT A FOREIGN KEY WITH `ON DELETE CASCADE` ────────────────────────────────────────────
 * Three reasons, and the first is the one that decides it. (1) An FK fires from
 * `deleteNinaMessage` too, and cannot tell a deleted sentence from a deleted conversation. (2) It
 * cannot be added by a generated migration while dangling rows exist, and they do —
 * `npm run nina:memory-reap` is the one-off that clears them. (3) The membership test below can
 * never match `source_message_id IS NULL`, which is how `/admin/memory` writes and re-labels every
 * hand-asserted row (its store module lives under `lib/admin/`, and is deliberately NOT named in
 * full here — `tests/admin.memory.test.ts` asserts textually that nothing under `lib/nina/` so much
 * as mentions that specifier) — so R24's admin-row guarantee holds STRUCTURALLY here, rather than
 * through a `source <> 'admin'` predicate somebody could drop. An admin-asserted fact is the
 * runner's way to make a memory immune to this purge.
 *
 * **What it STILL deliberately leaves behind:**
 *   - **`nina_message_images` — every row of it, now (R1).** The rows are orphaned, not deleted:
 *     they keep their id, their `created_at`, their `pathname` and their Blob object, and they keep
 *     appearing in `/admin/photos` and in `/nina/about`'s gallery. What they lose is the pointer
 *     into a conversation that no longer exists. This function issues no statement against that
 *     table and must not gain one — `nina_message_images` appearing anywhere in this function's
 *     body is the regression, and `tests/nina.photoOrphans.test.ts` asserts its absence from all
 *     four statements.
 *   - the Blob objects behind those rows, which were never this function's to delete and are now
 *     not even orphaned: a live row still points at each one. `isBlobPathnameReferenced` will keep
 *     answering `true` for them, which is what stops `scripts/blob-reap.mjs` reaping a photograph
 *     whose conversation is gone.
 *   - `nina_turns`. It is the audit trail and the money ledger; a removed conversation does not
 *     un-spend its tokens (plan invariant 9). A job's `args.replyToId` may afterwards name a
 *     message that no longer exists, which is the same degradation a deleted message already
 *     produces, in bulk.
 *   - `nina_nags` and `nina_avatars`. A nag records what she has said about a TRAINING pattern and
 *     carries no message pointer; an avatar is her face. Neither is a conversation.
 *   - the `name` slot, whose `source_message_id` is null by design (`lib/nina/memory.ts`) because
 *     it is derived bookkeeping. It is recomputed on the next distillation.
 *
 * A surviving message in ANOTHER session that quoted one of these has its `reply_to_id` set to NULL
 * by the self-FK, and `resolveQuote` already degrades that to plain text. `SET NULL` never blocks a
 * delete, so it cannot deadlock the cascade. No new behaviour.
 *
 * `false` is "not yours, or already gone" — the caller turns that into one message. When it is
 * false, the three purge statements have already selected nothing: `sessionMessageIds` carries
 * `user_id` in its own WHERE beside `session_id` (rule 1), so a foreign or stale id yields an empty
 * set rather than somebody else's message ids.
 */
export async function removeNinaSession(userId: string, id: string): Promise<boolean> {
  /* The messages this session is about to lose. A subquery, not a value — see the header, and see
   * `getRunByShareToken` in `lib/db/queries.ts`, which builds a correlated subquery exactly this
   * way and for the neighbouring reason: *"so the child selects are filtered by the token itself
   * rather than by a run id the caller could have supplied. All five statements share one
   * snapshot."* Here it is a session id rather than a token, and the snapshot is what makes the
   * purge and the delete indivisible. */
  const sessionMessageIds = db
    .select({ id: ninaMessages.id })
    .from(ninaMessages)
    .where(and(eq(ninaMessages.userId, userId), eq(ninaMessages.sessionId, id)))

  /* The `pending_promises` entries that came from this conversation, as a predicate over the slot's
   * jsonb array. Spelled once and used twice: once to decide whether the row needs rewriting at
   * all, and once (inverted) to decide which entries survive the rewrite.
   *
   * **The outer parentheses are load-bearing and hand-written.** `drizzle-orm`'s `exists()` emits
   * `exists ` followed by its argument's chunks verbatim; it only LOOKS like it adds the brackets
   * because a subquery BUILDER serialises itself with them. A raw `sql` template does not, so
   * without the pair below the generated statement is `... and exists select 1 from ...`, which is
   * a syntax error Postgres rejects — measured, not theorised, and caught by
   * `tests/nina.sessionPurge.test.ts`'s `exists (` assertion. */
  const promisesFromThisSession = sql`(
    select 1
      from jsonb_array_elements(${ninaMemorySlots.value} -> 'promises') as t(entry)
     where t.entry ->> 'sourceMessageId' in (
             select ${ninaMessages.id}
               from ${ninaMessages}
              where ${ninaMessages.userId} = ${userId}
                and ${ninaMessages.sessionId} = ${id}
           )
  )`

  const [, , , removed] = await db.batch([
    /* 1. The ledger rows distilled from this conversation. `source_message_id IS NULL` can never
     *    match an `IN`, which is exactly the admin-row guarantee. */
    db
      .delete(ninaMemoryFacts)
      .where(
        and(
          eq(ninaMemoryFacts.userId, userId),
          inArray(ninaMemoryFacts.sourceMessageId, sessionMessageIds),
        ),
      ),

    /* 2. The standing slots this conversation set — his nickname, his usual running days, what he
     *    is training for. `pending_promises` is EXCLUDED and handled by statement 3: it is one row
     *    holding a LIST, so dropping the row over one entry would cancel every promise she has
     *    outstanding, including the ones she made in conversations he kept. */
    db
      .delete(ninaMemorySlots)
      .where(
        and(
          eq(ninaMemorySlots.userId, userId),
          ne(ninaMemorySlots.key, NINA_SLOT_PENDING_PROMISES),
          inArray(ninaMemorySlots.sourceMessageId, sessionMessageIds),
        ),
      ),

    /* 3. `pending_promises`, pruned entry by entry rather than row by row.
     *
     *    The ROW's own `source_message_id` is not usable for this and it is worth saying why:
     *    `lib/nina/promises.ts`'s sweep rewrites the slot through `upsertNinaMemorySlot` WITHOUT a
     *    `sourceMessageId`, which defaults the column to NULL — so after the first sweep the row
     *    points at nothing while its entries still point at real messages. The entries are the
     *    provenance; the row is not.
     *
     *    `jsonb_typeof(... ) = 'array'` is a guard and not decoration: without it, a malformed slot
     *    value would make `jsonb_array_elements` yield zero rows, `jsonb_agg` return NULL, and the
     *    coalesce rewrite the row to an empty promise list — destroying data on the way past. With
     *    it, a malformed row is left exactly as it is, for a human to look at.
     *
     *    The `exists` in the WHERE means this statement is a no-op — no write, no `updated_at`
     *    bump, nothing in `/admin/memory`'s "updated" column — unless this session actually
     *    produced one of the promises. */
    db
      .update(ninaMemorySlots)
      .set({
        value: sql`
          jsonb_build_object(
            'promises',
            coalesce(
              (
                select jsonb_agg(t.entry order by t.ord)
                  from jsonb_array_elements(${ninaMemorySlots.value} -> 'promises')
                       with ordinality as t(entry, ord)
                 where t.entry ->> 'sourceMessageId' is null
                    or t.entry ->> 'sourceMessageId' not in (
                         select ${ninaMessages.id}
                           from ${ninaMessages}
                          where ${ninaMessages.userId} = ${userId}
                            and ${ninaMessages.sessionId} = ${id}
                       )
              ),
              '[]'::jsonb
            )
          )
        `,
        /* Written explicitly for the reason `upsertNinaMemorySlot` gives: `$onUpdate` and
         * `defaultNow()` fire on different paths, and a caller comparing two slots' `updated_at`
         * should be comparing like with like. */
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(ninaMemorySlots.userId, userId),
          eq(ninaMemorySlots.key, NINA_SLOT_PENDING_PROMISES),
          sql`jsonb_typeof(${ninaMemorySlots.value} -> 'promises') = 'array'`,
          exists(promisesFromThisSession),
        ),
      ),

    /* 4. And only now the session itself, so the three statements above still had messages to join
     *    against. `RETURNING` is what makes ownership a fact rather than a claim. */
    db
      .delete(ninaChatSessions)
      .where(and(eq(ninaChatSessions.userId, userId), eq(ninaChatSessions.id, id)))
      .returning({ id: ninaChatSessions.id }),
  ])

  return removed.length > 0
}
