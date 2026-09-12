import { relations, sql } from 'drizzle-orm'
import {
  bigserial,
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core'
import { users } from '../auth'
import { runs } from '../runs'
import { ninaAvatars } from './avatars'
export type NinaTurnKind = 'chat' | 'proactive' | 'image' | 'vision'

/**
 * **`'pending'` is here under RULING C2, and it is what makes RU-20's out-of-process generation
 * auditable.** A `kind = 'image'` turn is dispatched to a GitHub Actions worker and finishes
 * minutes later in another process, so between the dispatch and the callback there is a real row
 * that is neither a success nor a failure. Phase 12's originally documented fallback — write it
 * as `failed` with `error_code: 'queued'` and correct it later — is **withdrawn**: it would put a
 * failure row in the table for every single image she ever makes, and poison every "how often
 * does she fail" reading of `nina_turns` for the life of the app. A cheap word in a union beats a
 * permanently wrong table.
 *
 * Plain `text` with `.$type<>()`, exactly like `kind`, so **adding the member is NOT a migration**
 * — the column domain lives in TypeScript and Postgres holds a string.
 */
export type NinaTurnStatus = 'pending' | 'ok' | 'repaired' | 'failed'

/**
 * **The audit trail for every model call Nina makes.** One row per call, written whether it
 * succeeded or not — this is the table that answers "why did that turn take nineteen seconds",
 * "how much has she cost this month" and "how often does the repair round-trip actually fire",
 * and it is the only place those questions can be answered after the fact.
 *
 * It is deliberately NOT `insights`-shaped: no `facts_hash`, no unique index, no cache. An
 * insight is a cacheable product keyed by its inputs; a conversation turn is an event, and two
 * identical inputs a minute apart are two events. Nothing here is ever read to avoid a call.
 *
 * `cost_micro_usd` is an INTEGER in millionths of a dollar, not a float in dollars — the schema's
 * smallest-sensible-unit rule (roadmap D5) applied to money, which is where float drift is least
 * forgivable. A $0.04 image generation is `40000`.
 *
 * ── IT IS ALSO THE JOB ROW FOR RU-20, WHICH IS WHY `args` AND `'pending'` EXIST ───────────────
 * An `image` turn does not finish in this process. It is dispatched to a GitHub Actions worker
 * and lands minutes later, so its row is written `status = 'pending'` with the job phase in
 * `error_code` and its full arguments in `args`, and is closed by the callback. That makes this
 * one row the audit record AND the queue entry, which is the right call for exactly one reason:
 * a separate `nina_image_jobs` table would hold the same nine columns, need the same daily-cap
 * count, and then have to be joined against this table to answer "what did that cost". One row
 * per model call stays one row per model call even when the call outlives the request.
 *
 * `trigger` holds phase 2's `ProactiveTriggerKind` ('run_committed' | 'missed_usual_day' |
 * 'pattern_crossed' | 'silence' | 'avatar_changed') for `kind = 'proactive'` rows and NULL
 * otherwise. It is untyped `text` here on purpose: the vocabulary belongs to phase 10, and this
 * table must not become the thing phase 10 has to migrate to add a fifth trigger.
 */
export const ninaTurns = pgTable(
  'nina_turns',
  {
    /** nanoid(12) — lib/id.ts newId(). Phase 3 stamps it onto every message the turn emitted. */
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    kind: text('kind').$type<NinaTurnKind>().notNull(),
    trigger: text('trigger'),
    model: text('model').notNull(),
    /** `NINA_PROMPT_VERSION` at call time, so a voice regression can be dated. */
    promptVersion: integer('prompt_version'),
    /**
     * The D3 token-floor canary again, one feature over: `extractions.prompt_tokens` exists for
     * exactly this reason and `lib/llm/vision.ts` reads it. A vision turn whose `input_tokens`
     * sits far below the floor is a turn where the endpoint silently dropped the image.
     */
    inputTokens: integer('input_tokens'),
    outputTokens: integer('output_tokens'),
    /**
     * **WHICH tools fired, comma-joined. `''` when none — not an integer count (RULING C8).**
     * A count would have answered a question nobody asked. Phase 3's ruling (b) keeps
     * `save_memory` as a tool with an *empirical exit condition* — drop it if it never actually
     * fires — and that is only decidable if the column records the tool NAMES. `'save_memory'`,
     * `'save_memory,attach_run'`, `''`. `NOT NULL DEFAULT ''` so "no tools" and "not recorded"
     * cannot be told apart by accident, and so `WHERE tool_calls <> ''` is the whole query.
     * Phase 12 also writes the sentinel `'dropped:save_memory'` here.
     */
    toolCalls: text('tool_calls').notNull().default(''),
    latencyMs: integer('latency_ms'),
    /** Millionths of a USD. See the header — never a float, never dollars. */
    costMicroUsd: integer('cost_micro_usd'),
    status: text('status').$type<NinaTurnStatus>().notNull(),
    /**
     * Free text, ours not the provider's. NULL on success.
     *
     * **Phase 12 also uses it as the job PHASE while `status = 'pending'`** —
     * `'queued' | 'dispatched' | 'running'` — and only writes an actual failure reason here when
     * `status = 'failed'`. Two meanings in one column, disambiguated by `status`, which is
     * cheaper than a `job_phase` column that is NULL for every one of the other three kinds.
     */
    errorCode: text('error_code'),
    /**
     * **The job's own arguments, and RU-20 makes them mandatory rather than nice to have
     * (RULING C1).** Nullable, and NULL for every `kind` except `'image'`.
     *
     * Phase 12's `NinaImageJobArgs`, verbatim as the documented shape:
     * `{ purpose, scene, mood, prompt, seed, replyToId, source, attempts, sidecar }`.
     *
     * TWO independent reasons it cannot live anywhere else:
     *
     *   1. **THE REPO IS PUBLIC.** A `workflow_dispatch` input is world-readable in the Actions
     *      run log, forever. So the prompt must travel in the DATABASE and the dispatch may carry
     *      only an opaque job id. Putting the prompt in the dispatch input would publish every
     *      word Nina ever generates an image from.
     *   2. **The `schedule:` backstop wakes with NO ARGUMENTS AT ALL.** It exists because a
     *      dispatch can be dropped, and its whole job is to find work that was left behind. A
     *      retry is therefore impossible unless the arguments are in the row — a job whose args
     *      were only ever in the dispatch payload is a job that can never be retried.
     *
     * Untyped `jsonb` on purpose: `NinaImageJobArgs` belongs to phase 12, and this table must not
     * become the thing phase 12 has to migrate to add a tenth field to its own job shape. Same
     * argument as `trigger` above.
     */
    args: jsonb('args'),
    /**
     * **The runner hid this job row from `/nina/jobs`. That is the whole feature (R2).**
     *
     * NULL means "not hidden". A timestamp means "hidden, then". Nullable, no default, and **no
     * backfill script** — every row written before this column reads NULL and is therefore
     * visible, which is the `*_enabled` columns' idiom one table over: the migration IS the
     * backfill, because the absent value already spells the right answer.
     *
     * The runner's words were *"delete job icon … (but just soft delete in neon db). so i can
     * keep the job list tidy and pristine"*, and the parenthesis is a specification. This table
     * is the money ledger AND the audit trail (see the header), so a `DELETE` here would erase a
     * billed generation from the record in order to tidy a list.
     *
     * ── FOUR THINGS IT IS NOT, EACH OF WHICH SOMEBODY WILL OTHERWISE RE-OPEN ──────────────────
     *
     *   1. **NOT A REFUND.** `countNinaTurnsSince` — the daily image cap — does NOT filter on
     *      this column, deliberately and permanently. `lib/nina/selfiegen.ts` calls that cap *"a
     *      money cap and not a feature cap"*, and $0.04 that has been spent is still spent after
     *      the row is hidden. Six generations a day is six generations a day whether or not he
     *      tidied the list afterwards. A version of this column that refunded the quota would be
     *      an unmetered image budget with one extra tap in front of it.
     *
     *   2. **NOT A CANCEL.** Hiding a `status = 'pending'` job does not stop the invocation that
     *      is already drawing it. That generation finishes, `completeNinaImageJob` closes the row
     *      it was handed, and **the photograph still lands in the chat.** That is a real,
     *      reachable, user-visible outcome and it is the right one — he asked for that
     *      photograph, and the money is already committed. What the flag DOES stop is anything
     *      NEW starting: `claimNinaImageJob`, `listRevivableNinaImageJobs` and
     *      `sweepStaleNinaImageJobs` all skip a flagged row, so a hidden job is never re-fired
     *      and never apologised for. A true cancel would have to race the claim, and losing that
     *      race means spending the money and then telling him it did not happen.
     *
     *   3. **NOT A DELETE, AND NOT AN ARCHIVE WITH A SCREEN.** No statement anywhere removes a
     *      `nina_turns` row; `tests/nina.softDelete.test.ts` asserts that against this module's
     *      source. There is also no trash view and no undo button, because nobody asked for one —
     *      what the nullable column buys is that `update nina_turns set deleted_at = null where
     *      id = '…'` restores a row exactly, in SQL, by hand. That recoverability is also why the
     *      control that writes this needs no confirmation dialog: `SessionRow`'s R11 confirmation
     *      existed because *"there is no archive flag and therefore no undo"*. Task #136 has since
     *      removed that panel too, but the asymmetry it named is still the one that matters here —
     *      this column is what makes a mis-tap on THIS control cost nothing, and R11 still has no
     *      equivalent.
     *
     *   4. **NOT A PER-KIND CONCEPT.** Only `kind = 'image'` rows are ever flagged, because
     *      `/nina/jobs` is the only screen that lists turns and it lists only image jobs. Every
     *      writer of this column carries `kind = 'image'` in its `WHERE`. A `kind = 'chat'` turn
     *      has no list to be tidied out of; `lib/nina/chatturn.ts` does not read this column and
     *      must not start.
     *
     * ── NO INDEX, AND HERE IS THE ARITHMETIC ──────────────────────────────────────────────────
     * A partial index — `(user_id, created_at desc) where kind = 'image' and deleted_at is null`
     * — was considered and declined, and the numbers are small enough to write down. The list
     * read is one `LIMIT 60` walk of `nina_turns_user_created_idx`, which ALREADY carries
     * `kind = 'image'` as a heap filter on tuples it has fetched anyway; `deleted_at IS NULL` is a
     * second predicate on those same fetched tuples and costs one null check each. The set it
     * filters is bounded by the daily cap (`ninaImageDailyCap()`, env-tunable, 30 at this
     * writing) — a few dozen image rows per user per day at the outside — so sixty
     * rows is a couple of days of flat-out use, and the worst case for a runner who hides everything is
     * that the walk passes a few extra tuples before it fills the limit. The index would cost a
     * write on every turn Nina ever takes, chat rows included, to save microseconds on a page
     * opened by hand. `nina_turns` keeps exactly one index, and
     * `tests/db.schema.nina.test.ts` pins that.
     */
    deletedAt: timestamp('deleted_at', { withTimezone: true, mode: 'date' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t) => [
    /** "her turns, newest first" and "how many image turns today" both read this. */
    index('nina_turns_user_created_idx').on(t.userId, t.createdAt.desc()),
  ],
)

export type NinaRole = 'runner' | 'nina'

/**
 * **Why the row exists. RULING C9 fixed this union, and it is `'chat'` plus every member of phase
 * 2's `ProactiveTriggerKind` — nothing more and nothing less.**
 *
 * This phase originally declared `'chat' | 'proactive' | 'operator'`. Both of the losers lost for
 * a concrete reason, and the reasons are recorded here because a column domain is the hardest
 * thing in the schema to widen later.
 *
 * ── `'proactive'` LOSES: IT WOULD HAVE COST R8 ITS INDEXED READ ───────────────────────────────
 * Phase 10 owns every writer of a non-`'chat'` source, and its durable idempotence marker for R8
 * — "did I already speak about this run?" — is
 * `source = 'run_committed' AND run_id = <this run>`: one indexed read on
 * `nina_messages_user_run_idx`, decided by the row itself. Collapsing all five triggers into
 * `'proactive'` would make that question unanswerable from this table and force a join against
 * `nina_turns.trigger` — an audit table — to decide whether to send a message. Idempotence that
 * depends on a join against the audit trail is idempotence that breaks the first time the audit
 * trail is pruned.
 *
 * ── `'operator'` LOSES: IT HAS NO WRITER AT ALL ──────────────────────────────────────────────
 * It was declared for phase 14's operator script, and phase 14 deliberately writes **no**
 * `nina_messages` row: it re-anchors her face and inserts a `nina_avatars` row, and the
 * announcement reaches the conversation through `'avatar_changed'` when she next speaks. A member
 * with no writer is a member every `switch` has to handle and no test can ever exercise.
 *
 * ── ONE VOCABULARY, TWO DECLARATIONS, AND A TEST THAT PINS THEM TOGETHER ─────────────────────
 * The union is declared HERE, in `lib/db/schema.ts`, because it is a column domain and the column
 * lives here. Phase 2 declares `ProactiveTriggerKind` for the prompt layer. **Phase 10 owns the
 * test asserting `NinaMessageSource` equals `'chat' | ProactiveTriggerKind`** — not this phase,
 * because phase 10 is the first phase in which both types exist and a test cannot import a type
 * that has not been written yet.
 */
export type NinaMessageSource =
  'chat' | 'run_committed' | 'missed_usual_day' | 'pattern_crossed' | 'silence' | 'avatar_changed'

/**
 * Who named a session. NULL is the fourth member and the important one: the column is nullable
 * and travels with `title`, and NULL/NULL means *nobody has named this yet* — the first state of
 * every session, the only state F35 phase 4's titler is allowed to write into, and the state
 * `sessionTitleFor` renders as "Chat baru".
 *
 * `'backfill'` is migration 0004's own mark on the one session per user that holds everything
 * written before sessions existed. It is not `'manual'` — nobody typed it — but the titler must
 * treat it exactly as if somebody had: a 3-4 word title over years of mixed conversation would be
 * a lie about what the session contains.
 */
export type NinaSessionTitleSource = 'auto' | 'manual' | 'backfill'

/**
 * **The conversation's partition (F35 R2).** One row per topic he decided to start.
 *
 * ── WHY A TABLE, AND WHY IT IS NOT A UI FEATURE ──────────────────────────────────────────────
 * "A new session so I can focus on a new topic" is a claim about **what she is given to read**,
 * not about what the screen shows: `getNinaMessageWindow` hands the newest 40 rows of
 * `nina_messages` straight to `glm-5.3` on every turn, so the conversation IS the prompt. Without
 * a partition column a new session would look new and behave exactly like the old one. That is why
 * this table exists in the data layer and why `nina_messages.session_id` is `NOT NULL` — see D1 in
 * the phase plan, and see `nina_messages`'s own note below.
 *
 * ── NO `last_user_message_at`, AND THE REASON IS `nina_folders`'S REASON ─────────────────────
 * R5 sorts sessions by the most recent message **from him**. A stored watermark here would be
 * "a cache with two writers" in `nina_folders`'s exact words, except that this one has four: his
 * turn writes it, her two proactive writers must remember NOT to write it, and F35 phase 7's
 * message DELETE moves it BACKWARDS from a file that does not own this table. So it is computed at
 * read time — `max(sent_at) … where role = 'runner' group by session_id`, one statement batched
 * with the session rows so the two are one snapshot.
 *
 * That is the opposite call from `nina_messages_user_unread_idx` one table down, and deliberately
 * so: the unread count is paid on every render of every tabbed screen, while this list is read on
 * `/nina` alone and its row count is bounded by how many topics a person starts. What the unread
 * index's argument does buy is the right to spend an INDEX on the aggregate rather than a column,
 * which `nina_messages_user_session_runner_idx` is.
 *
 * ── `pinned_at`, NOT `is_pinned` ────────────────────────────────────────────────────────────
 * R4 pins a session to the top. NULL is unpinned, so the column needs no default and the state is
 * unrepresentable-by-accident. A timestamp rather than a boolean costs nothing and answers "when",
 * which keeps one decision reversible without a migration: pinning currently PARTITIONS the list
 * and does not sort it (an actively-used pinned session must not drift downward every time he pins
 * something else), and if that is ever revisited the pin time is already stored.
 *
 * ── NO `archived_at` ────────────────────────────────────────────────────────────────────────
 * R11 removes a session, and `nina_messages.session_id` cascades. An archive flag was rejected in
 * the plan set's scope section for one concrete reason: an archived session that still answered
 * `getNinaMessageWindow` would defeat the point of removing it. What the delete deliberately does
 * NOT clean up is written down at the FK, not here.
 *
 * ── NO `updated_at` ─────────────────────────────────────────────────────────────────────────
 * Nothing reads it. `created_at` earns its place twice — as the sort key of a session that has no
 * message yet, and as the instant migration 0004 stamps from `min(sent_at)` so the legacy session
 * sorts as the old thing it is.
 */
export const ninaChatSessions = pgTable(
  'nina_chat_sessions',
  {
    /** nanoid(12) — lib/id.ts newId(). It appears in the URL as `/nina?s=<id>`, so it is not an integer. */
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** The 3-4 word title (R3), his manual rename, or 0004's placeholder. NULL = not named yet. */
    title: text('title'),
    /** Travels with `title`; both NULL or both set. See the type's own note. */
    titleSource: text('title_source').$type<NinaSessionTitleSource>(),
    /** R4. NULL = unpinned. See the header for why this is an instant. */
    pinnedAt: timestamp('pinned_at', { withTimezone: true, mode: 'date' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t) => [
    /**
     * The one read: "every session of his". `created_at desc` makes it the deterministic base
     * order that `orderNinaSessions` then re-sorts, so the pure rule receives a stable input and
     * its unit test is not asserting the planner's mood. The `nina_avatars_user_created_idx`
     * shape. No index on `pinned_at`: the pin is read off rows this index already returned, and a
     * second index over a table with tens of rows would be a declaration with no reader.
     */
    index('nina_chat_sessions_user_created_idx').on(t.userId, t.createdAt.desc()),
  ],
)

/**
 * **The conversation.** One row per bubble, which is RU-5 made structural: Nina returns 1–4 short
 * messages per turn and each one is a real row, so each is independently quotable (phase 7),
 * independently unread (phase 10) and independently attachable to an image (phase 6). A `jsonb`
 * array of bubbles on one row would have made every one of those a special case.
 *
 * ── `seq`, AND WHY IT IS A SEQUENCE AND NOT A TIMESTAMP ───────────────────────────────────────
 * Four bubbles written inside one `db.batch` must read back in the order Nina emitted them, and
 * `sent_at` cannot promise that: `defaultNow()` inside one transaction returns the SAME instant
 * for all four statements, so `ORDER BY sent_at` leaves their order up to the planner. A
 * per-turn integer would fix that but still ties two DIFFERENT turns landing in the same instant,
 * which is exactly what an `after()` hook and a cron running concurrently can do.
 *
 * So `seq` is a `bigserial`: a total order over the whole conversation, `ORDER BY seq` is
 * deterministic with no composite key, and rows inserted in one batch are numbered in array
 * order. It is also the natural cursor for "the messages before this one" (phase 4's
 * `olderCount`) and the natural watermark for "read up to here" (phase 10).
 *
 * The PK stays `id` (nanoid(12)) because ids appear in URLs, in `reply_to_id` and in the DOM
 * (`#nina-msg-<id>`), and a guessable integer in any of those is a change of kind.
 *
 * ── TWO `SET NULL` FKs, DELIBERATELY (see `badges.run_id`'s note) ─────────────────────────────
 * `reply_to_id` and `run_id` are BOTH dereferenced on every render — a quote bubble and a run
 * card. A dangling id would paint an empty quote or an empty card, so they are real FKs; and a
 * deleted run must not delete the conversation about it, so they are `set null` rather than
 * cascade. Phase 7 and phase 8 both degrade a NULL to plain text, which is the designed outcome.
 * `turn_id` gets neither: nothing renders it, and an audit pointer must not be able to block a
 * delete.
 */
export const ninaMessages = pgTable(
  'nina_messages',
  {
    /** nanoid(12) — lib/id.ts newId(). */
    id: text('id').primaryKey(),
    /**
     * The total order. Assigned by Postgres, never by the app, and never reused. See the header.
     */
    seq: bigserial('seq', { mode: 'number' }).notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /**
     * **The session this bubble belongs to (F35 R2).** `NOT NULL`: there is no unfiled bucket and
     * no code path that has to ask whether a message has a session. The alternative — nullable,
     * with NULL meaning "written before sessions existed" — would have made the failure quiet: a
     * writer that forgot a session would still succeed and the row would simply stop appearing on
     * his screen. Migration 0004 pays for `NOT NULL` once, in the right order: add the column
     * nullable, file every existing row into one session per user, then `SET NOT NULL`.
     *
     * **Cascade, and it is a requirement rather than a detail (R11) — but it now stops one hop
     * short.** Removing a session must take its messages, and Postgres chains that from one DELETE.
     * What it must NOT take any more is their PHOTOGRAPHS. This comment used to say the opposite:
     * *"and through `nina_message_images.message_id`'s cascade their image rows"*, stated as part of
     * what R11 asked for. The runner measured that as loss — *"photos collection that were
     * painstakingly generated by llm, will be deleted if user delete chat session … just let the
     * photos be"*, and separately for the photographs he had replaced by hand in `/admin/photos`,
     * which are the same rows with new bytes under them (`updateNinaChatPhotoBlob`). So
     * `nina_message_images.message_id` is `ON DELETE SET NULL` and nullable, and that column's own
     * comment carries the full argument. The chain is: session -> messages (cascade) -> image rows
     * ORPHANED, not deleted.
     *
     * What this delete still deliberately does NOT take: the Blob objects behind those image rows.
     * That used to be a note about bytes outliving rows; now the rows outlive the conversation too,
     * which is the point.
     *
     * **This comment used to also say that the `source_message_id` pointers in
     * `nina_memory_slots` / `nina_memory_facts` were left dangling on purpose — "the memory ledger
     * staying global on purpose: a distilled fact can be true after the sentence that produced it
     * is gone". That is no longer what happens on a SESSION delete, and the reversal is
     * deliberate.** `loadNinaContext` reads one session's message window but the whole
     * relationship's ledger, so the ledger was the only surviving channel by which a deleted
     * conversation still reached Nina's prompt, and the runner measured the result as her character
     * being polluted and worsening over time. `lib/nina/queries.ts`'s `removeNinaSession` therefore
     * purges those rows in the same transaction as the delete, and its header carries the full
     * argument including why this is NOT a foreign key.
     *
     * The old sentence still holds for a deleted MESSAGE, which is why `deleteNinaMessage` still
     * removes the memory ledger's evidence for nothing and neither memory column gained an FK: an
     * `ON DELETE CASCADE` here could not tell a deleted sentence from a deleted conversation, and
     * only one of those two was ever the problem. The photographs are the same shape of argument
     * with the same answer — a deleted BUBBLE still takes its photographs and a deleted
     * CONVERSATION does not, the FK cannot tell those apart either, so the preserving behaviour
     * lives on the FK and the deleting behaviour lives inside `deleteNinaMessage` as an explicit
     * statement.
     *
     * Sessions SLICE `seq`; they do not replace it. `seq` remains the total order of the whole
     * conversation and no per-session sequence exists.
     */
    sessionId: text('session_id')
      .notNull()
      .references(() => ninaChatSessions.id, { onDelete: 'cascade' }),
    /** 'runner' is him, 'nina' is her. Not 'user'/'assistant' — she is not an assistant. */
    role: text('role').$type<NinaRole>().notNull(),
    /** Her words or his, verbatim. Never a template, never a rendered number. */
    text: text('text').notNull(),
    /**
     * Why the row exists — see the type's own note (RULING C9). `'chat'` is him or her in a
     * conversation; the other five are phase 10's, one per `ProactiveTriggerKind`, and phase 10
     * is the only writer of any of them. `'run_committed'` plus `run_id` is R8's whole
     * idempotence check, which is why the triggers are spelled out instead of collapsed.
     */
    source: text('source').$type<NinaMessageSource>().notNull().default('chat'),
    /**
     * **This bubble exists ONLY to carry a photograph.** Set by every path that writes one; read by
     * `isNinaPhotoCarrierMessage`, which is what lets Remove delete the message along with the last
     * picture on it instead of leaving a caption with nothing under it.
     *
     * ── WHY A COLUMN AND NOT A SIXTH `NinaMessageSource` ────────────────────────────────────
     * The cheap answer was `source = 'photo'`: this is a plain `text` column with a TS union, no
     * database enum and no check constraint, and exactly one query in the repo compares it
     * (`lib/nina/queries.ts`, `= 'run_committed'`). So widening the union needs no migration at all,
     * and that is precisely what makes it the wrong answer — it would overwrite two recorded
     * rulings to save one DDL statement. `NinaMessageSource`'s own docstring calls a column domain
     * *"the hardest thing in the schema to widen later"* and rejects `'operator'` for having no
     * writer; `finishSelfie`'s says *"`source = 'chat'` on purpose and NOT a sixth
     * `NinaMessageSource`: she is answering something he said in an open conversation, minutes
     * ago."* Both are still true. A photograph she sends in reply to him IS a chat message; what is
     * new is not where the row came from but that its TEXT is disposable.
     *
     * ── AND WHY NOT A HEURISTIC ────────────────────────────────────────────────────────────
     * "role = 'nina' and every image on it is generated and the text is short" re-introduces the
     * false positive the caption-array clause was written to prevent, and it fails silently: the
     * cost is a real sentence of hers deleted, which nothing can recover.
     *
     * `NOT NULL DEFAULT false` so no reader needs a null branch, and additive so a revert of the
     * code leaves a column nothing consults. Migration 0008 backfills the pre-marker carriers.
     */
    photoOnly: boolean('photo_only').notNull().default(false),
    /** `nina_turns.id`. A plain column on purpose — see the header's last paragraph. */
    turnId: text('turn_id'),
    /** WhatsApp-style quote (R12). Self-referencing; `AnyPgColumn` is what makes that typecheck. */
    replyToId: text('reply_to_id').references((): AnyPgColumn => ninaMessages.id, {
      onDelete: 'set null',
    }),
    /** The run he shared into the chat (R13). */
    runId: text('run_id').references(() => runs.id, { onDelete: 'set null' }),
    sentAt: timestamp('sent_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    /** Phase 11 stamps it when Web Push accepted the notification. NULL = never pushed. */
    deliveredAt: timestamp('delivered_at', { withTimezone: true, mode: 'date' }),
    /** Phase 10's unread badge is `role = 'nina' AND read_at IS NULL`. */
    readAt: timestamp('read_at', { withTimezone: true, mode: 'date' }),
  },
  (t) => [
    /** The one hot read: "her last N messages, in order". Index-only for the ORDER BY. */
    index('nina_messages_user_seq_idx').on(t.userId, t.seq),
    /**
     * **The unread count, as a PARTIAL index — and RULING C9's index check resolves to "already
     * done here".** Phase 10 asked for either `(user_id, read_at) WHERE read_at IS NULL` or
     * `(user_id, role, read_at)`; this index is strictly stronger than both and no second one is
     * added. It carries the `role = 'nina'` predicate too, so his own messages — which are
     * `read_at IS NULL` forever, because nothing ever marks them read — are not even in the
     * index, let alone counted.
     *
     * Partial rather than full, on the `shares_run_id_active_unq` precedent one table over:
     * almost every row is read almost all of the time, so a full index on `read_at` would be a
     * big index answering a question about a handful of rows.
     *
     * This matters more than an index note usually does, which is why it is spelled out: the
     * count runs on **every page render of every tabbed screen** — the badge lives in the bottom
     * bar, so `/`, `/runs`, `/nina`, `/trends` and `/me` each pay for it. A sequential scan of
     * the whole conversation on every navigation is the one performance mistake in this schema
     * that a user would actually feel.
     */
    index('nina_messages_user_unread_idx')
      .on(t.userId, t.seq)
      .where(sql`${t.readAt} is null and ${t.role} = 'nina'`),
    /** Phase 7 resolves a quote's target, and phase 13 needs "what replied to this". */
    index('nina_messages_reply_to_idx').on(t.replyToId),
    /** Phase 8's "did he already share this run" and the run-detail back-link. */
    index('nina_messages_user_run_idx').on(t.userId, t.runId),
    /**
     * **The session slice AND the foreign key's own index — two jobs, one index (F35 R2).**
     *
     * The slice is `WHERE user_id = $1 AND session_id = $2 ORDER BY seq DESC LIMIT n`: a backward
     * index scan with `user_id` as a heap filter, which is what makes one session's newest 40
     * messages as cheap as the whole conversation's newest 40 used to be.
     *
     * `session_id` leads rather than `user_id` because of the second job: Postgres does not index
     * the REFERENCING side of a foreign key, and the referencing lookup has no user in it. Without
     * a `session_id`-leading index, every `removeNinaSession` would sequentially scan the entire
     * conversation to find the children it has to cascade. `nina_messages_user_seq_idx` still
     * answers every user-wide read, so nothing is duplicated here.
     */
    index('nina_messages_session_seq_idx').on(t.sessionId, t.seq),
    /**
     * **R5's sort key, computed instead of stored — and this index is what makes that affordable.**
     *
     * The session list runs `max(sent_at) … where user_id = $1 and role = 'runner' group by
     * session_id`. Partial, on `nina_messages_user_unread_idx`'s precedent: it holds only HIS half
     * of the conversation, so hers is not in the index at all. `sent_at` is a payload column and
     * not a sort key — it rides along so the aggregate is index-only, because without it every
     * runner message in the conversation is a heap fetch on a read that happens on every `/nina`
     * render, which is the exact cost the unread index exists to avoid.
     *
     * `role = 'runner'` is in the predicate because R5 asks specifically for the most recent USER
     * message. Her replies, and every proactive message she writes, must not move a session up the
     * list.
     */
    index('nina_messages_user_session_runner_idx')
      .on(t.userId, t.sessionId, t.sentAt)
      .where(sql`${t.role} = 'runner'`),
  ],
)

export type NinaImageKind = 'upload' | 'generated'

/**
 * **Its own table, not a `jsonb` column on `nina_messages`.** Three readers force that: phase 13's
 * detail page queries "every image in this conversation, newest first" without touching the
 * message rows, phase 6 writes a `description` per image, and phase 12 writes a `prompt` per
 * image. A `jsonb` array would make the gallery a full table scan plus a TypeScript flatten, and
 * `run_photos` — the table this one is modelled on — made the same call for the same reason.
 *
 * `user_id` is denormalised alongside `message_id` so the gallery read is `WHERE user_id = $1`
 * rather than a join back through `nina_messages` purely to prove ownership (invariant 7).
 *
 * `description` is `glm-4.6v`'s dense private text (RU-12): what is actually in the picture, in
 * prose, written for `glm-5.3` to react to and never shown to the runner. It is what makes R10
 * work at all, and phase 6 is the only writer.
 */
export const ninaMessageImages = pgTable(
  'nina_message_images',
  {
    /** nanoid(12) — lib/id.ts newId(). */
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /**
     * **The bubble this photograph appears in, or NULL because it has outlived one.**
     *
     * This comment used to read *"Cascade: an image with no message is nothing. Unlike a badge, it
     * is not a fact."* That is now false, and the reversal is the whole of R1. A chat photograph IS
     * a fact: `finishSelfie` spends a model call and real money to make one, the Image collection's
     * Media folder is a COLLECTION of them, and the operator replaces them by hand there. A
     * conversation is one place a photograph can be shown, not the reason it exists — so the
     * pointer is optional and `ON DELETE SET NULL` is what makes a deleted session leave the
     * collection intact. The runner's words: *"we must allow 'orphaned' photos in Chat photos
     * collection"*, and *"don't delete existing photos, if user delete a chat session, just let the
     * photos be"*.
     *
     * F37's provenance columns below curate this collection; they do not protect it. A session
     * delete still emptied it, which is what this column changes.
     *
     * `SET NULL` rather than `NO ACTION`, because a session delete must not be BLOCKED by its
     * photographs — that would turn one bug into a worse one. `SET NULL` never blocks a delete, so
     * it cannot deadlock the cascade above it either.
     *
     * A deleted single MESSAGE still takes its photographs. That is not this FK's doing any more:
     * `lib/nina/queries.ts`'s `deleteNinaMessage` deletes the rows explicitly in the same
     * transaction, and its header argues why the two delete paths get different answers from one
     * column.
     *
     * NULL is therefore a real, reachable, permanent state and every reader must degrade rather
     * than assume: `NinaImageRow`, `ImageLike`, `NinaGalleryPhoto`, `ChatPhoto` and
     * `removeChatPhotoAction`'s carrier lookup all carry `string | null`. What CANNOT produce a
     * NULL is an insert — `NinaImageInsert.messageId` is still required, because nothing in the app
     * creates a floating photograph on purpose.
     */
    messageId: text('message_id').references(() => ninaMessages.id, { onDelete: 'set null' }),
    /** 'upload' = he sent it (phase 6). 'generated' = she made it (phase 12). */
    kind: text('kind').$type<NinaImageKind>().notNull(),
    blobUrl: text('blob_url').notNull(),
    /** `nina/<userId>/…` (RU-7). The reaper's future handle on these — see Handoffs. */
    pathname: text('pathname').notNull(),
    width: integer('width'),
    height: integer('height'),
    bytes: integer('bytes'),
    /** `glm-4.6v`'s private description. See the header. Phase 6 writes it. */
    description: text('description'),
    /** The generation prompt, `kind = 'generated'` only. Phase 12 writes it. */
    prompt: text('prompt'),
    /**
     * ── PROVENANCE: WHERE THESE BYTES CAME FROM, WHEN THEY CAME FROM SOMEWHERE ────────────────
     *
     * A row is a **reference** when EITHER of these is non-null, and a reference is a row that is
     * a real photograph in a real bubble whose bytes are already in the collection under another
     * id. `lib/nina/actions.ts`'s `resolveAttachment` is the only writer: re-attaching an album
     * face or an earlier chat photo copies `blob_url` and `pathname` onto a NEW row (no bytes are
     * copied — the Blob object is shared), and before F37 nothing on the row said so. The two
     * collection listings therefore showed the same picture twice, which is the defect.
     *
     * **The row is NOT dropped and must never be.** Every bubble, every photo-viewer open, every
     * download control and Nina's own prompt read this table by `message_id`
     * (`getNinaMessageImagesForMessages`, `getNinaMessageImage`,
     * `dbNinaSourceGateway.readMessageWindow`). A message with no image row of its own is a blank
     * bubble. So the row stays, these columns mark it, and only the three COLLECTION reads
     * (`listNinaMessageImages`, `countNinaChatPhotos` — the reference picker's chat-side total,
     * `listNinaMediaPhotos` + `countNinaMediaPhotos` — the Media view and its badge) skip it — one
     * predicate, `isOriginalPhoto()` in `lib/nina/queries.ts`.
     *
     * **Two columns and not one polymorphic pointer**, because the two targets are two tables and
     * a real foreign key on each is what makes `SET NULL` possible at all. The shape is
     * `nina_messages.reply_to_id`'s (`:968`) — a nullable self-referencing FK — applied twice.
     *
     * **`ON DELETE SET NULL`, deliberately, and it is the interesting half.** When the original
     * is deleted the copy stops being a copy: the column goes NULL, the row becomes an original,
     * and the collection KEEPS the picture instead of losing it. `CASCADE` here would delete a
     * photograph out of a conversation because an unrelated row was tidied away, which is exactly
     * the data loss `isBlobPathnameReferenced` was written to prevent.
     *
     * **No index.** Both are residual predicates on reads that already range-scan
     * `nina_message_images_user_created_idx` — the same call `generatedChatPhotoScope` argues in
     * full for `kind`, at the same table size, and nothing has measured a need for one.
     */
    sourceAvatarId: text('source_avatar_id').references((): AnyPgColumn => ninaAvatars.id, {
      onDelete: 'set null',
    }),
    sourceImageId: text('source_image_id').references((): AnyPgColumn => ninaMessageImages.id, {
      onDelete: 'set null',
    }),
    /**
     * ── CONTENT HASH: WHAT MAKES "THESE BYTES ARE ALREADY STORED" AN INDEXED QUESTION ──────────
     *
     * sha-256 over the EXACT bytes this row's Blob object stores, as 64 lowercase hex characters.
     * `lib/photos/contentHash.ts` is the only intended producer. One semantics, stated once:
     * **equal hash ⟺ equal stored bytes.** Not a hash of the file he picked (the server never
     * sees it — the upload PUT goes browser → Blob directly), and not a perceptual hash (plan
     * Decisions — cross-encoding dedup is YAGNI; the measured duplicates were the same file picked
     * twice). A recompression that lands on different bytes is two objects that are honestly
     * different at the only level this table can see, which is storage.
     *
     * **User-scoped, never global.** The lookup key is `(user_id, content_hash)` and the partial
     * index below serves exactly that shape. Dedup must not link one user's bytes to another's —
     * ownership is per-user, and the Blob release path (`isBlobPathnameReferenced`) is
     * user-scoped, so a shared pointer would let one user's delete free bytes another user still
     * renders.
     *
     * **NULL is a real, permanent state, not a gap to fill on the next write.** A row predating
     * this column, and any write whose path had no bytes in hand to hash, both store NULL — and
     * NULL means "dedup is INACTIVE for this row": SQL `=` against NULL never matches, so no
     * consumer needs a special case, and none may invent one that treats NULL as "definitely
     * unique". The backfill sweep (media-dedupe phase 4) fills the historical rows once, from the
     * Blob itself; nothing writes this column after insert.
     *
     * **Why a plain index and not UNIQUE.** The duplicate row this mechanism writes is a
     * REFERENCE — copy `blob_url`/`pathname`, set `source_image_id`, the F37 shape — because the
     * plan's decision is that the latecomer row STAYS (a bubble must not be emptied to save
     * storage). A unique index would turn that race-close into a thrown INSERT, and would force
     * reference rows either to lie (NULL hash) or to collide. Uniqueness here is a decision the
     * write path makes after a lookup; the index makes the lookup cheap, nothing more.
     */
    contentHash: text('content_hash'),
    /**
     * ── PERCEPTUAL SIGNATURE: WHAT SEES THROUGH A RE-ENCODE ────────────────────────────────────
     *
     * `content_hash` answers "these exact bytes are already stored" — and 2026-09-10's recurring
     * defect is the class that question cannot see: a photograph downloaded out of the collection
     * re-encodes on its journey back (device save, then `compressForNina` on pick), so its bytes —
     * and hash — differ from the original's while the pixels are the same photograph. Two columns
     * hold the answer to "same pixels?", both written from ONE sharp pipeline (the sweep's, verbatim
     * — `scripts/nina-dedupe-media.mjs`'s `signBytes`), because two encoders must never sign for
     * one comparison:
     *
     *   · `perceptual_hash` — the 64-bit difference hash over a 9x8 grayscale thumbnail, as 16
     *     lowercase hex characters (`lib/nina/perceptual.ts` is the only parser);
     *   · `perceptual_sig` — the 16x16 grayscale thumbnail itself, base64 (256 bytes), the
     *     second gate that keeps a near-miss (two shots of the same court) out of a merge.
     *
     * A twin is BOTH: same `width` AND `height`, dHash distance ≤ 1, sig mean-abs ≤ 2 — the
     * sweep's three gates verbatim (`PERCEPTUAL_*` in `scripts/nina-dedupe-plan.mjs`, mirrored in
     * `lib/nina/perceptual.ts`), measured 2026-09-10 on the production pair (0/64, 0.1/255) and
     * pinned one step above. Conservative on purpose: a perceptual merge can destroy a near-miss.
     *
     * **NULL is "unsigned", and unsigned means dedup-inactive** — the same semantics
     * `content_hash`'s NULL carries, for the same reason: a row nobody signed cannot match, and no
     * reader may treat NULL as "definitely unique". Rows are signed where their bytes are in hand
     * (the generated store, the chat send's race-close — both on a runtime that now has `sharp`)
     * and nowhere else; `scripts/nina-image-worker.ts`'s `--omit=dev` runner has no sharp, so its
     * rows land unsigned and the sweep's `fill-perceptual` op owns filling them. Signatures live on
     * ORIGINALS only — a reference renders the KEEPER's object, and the sweep signs originals only;
     * a reference row binds NULL here.
     *
     * **No index.** The write-time lookup loads one owner's signed originals and compares in Node —
     * a Hamming distance is not a B-tree question, the collection is tens of rows today, and a
     * `pg_trgm`-style index for a scan that costs less than its planning would be the mistake.
     */
    perceptualHash: text('perceptual_hash'),
    perceptualSig: text('perceptual_sig'),
    /** Stable order for a multi-image message, the `run_photos.sort_order` precedent. */
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t) => [
    /** "the images on these messages" — phase 4's list hydration. */
    index('nina_message_images_message_idx').on(t.messageId),
    /** Phase 13's gallery, newest first, without a join. */
    index('nina_message_images_user_created_idx').on(t.userId, t.createdAt.desc()),
    /**
     * The write-time dedup lookup — "does THIS user already store these bytes?" — as one indexed
     * question instead of a per-write scan. Partial on purpose: a NULL row (everything written
     * before this column, and any write that could not hash) can never be a match, so leaving it
     * out keeps the index down to the rows the mechanism can answer about. Non-unique; the
     * column's header carries the argument for why the schema does not enforce uniqueness here.
     */
    index('nina_message_images_user_content_hash_idx')
      .on(t.userId, t.contentHash)
      .where(sql`${t.contentHash} is not null`),
  ],
)

export const ninaMessagesRelations = relations(ninaMessages, ({ one, many }) => ({
  user: one(users, { fields: [ninaMessages.userId], references: [users.id] }),
  run: one(runs, { fields: [ninaMessages.runId], references: [runs.id] }),
  /** The conversation this bubble is part of (F35 R2). */
  session: one(ninaChatSessions, {
    fields: [ninaMessages.sessionId],
    references: [ninaChatSessions.id],
  }),
  /** The quoted message (R12). Named so `replyTo` reads as the noun it is. */
  replyTo: one(ninaMessages, {
    relationName: 'ninaMessageReplyTo',
    fields: [ninaMessages.replyToId],
    references: [ninaMessages.id],
  }),
  /** The messages quoting THIS one. The other side of the self-relation. */
  replies: many(ninaMessages, { relationName: 'ninaMessageReplyTo' }),
  images: many(ninaMessageImages),
}))

export const ninaChatSessionsRelations = relations(ninaChatSessions, ({ one, many }) => ({
  user: one(users, { fields: [ninaChatSessions.userId], references: [users.id] }),
  messages: many(ninaMessages),
}))

export const ninaMessageImagesRelations = relations(ninaMessageImages, ({ one }) => ({
  message: one(ninaMessages, {
    fields: [ninaMessageImages.messageId],
    references: [ninaMessages.id],
  }),
  user: one(users, { fields: [ninaMessageImages.userId], references: [users.id] }),
}))

export type NinaTurn = typeof ninaTurns.$inferSelect
export type NewNinaTurn = typeof ninaTurns.$inferInsert
export type NinaMessage = typeof ninaMessages.$inferSelect
export type NewNinaMessage = typeof ninaMessages.$inferInsert
export type NinaMessageImage = typeof ninaMessageImages.$inferSelect
export type NewNinaMessageImage = typeof ninaMessageImages.$inferInsert
export type NinaChatSession = typeof ninaChatSessions.$inferSelect
export type NewNinaChatSession = typeof ninaChatSessions.$inferInsert
