# Phase 1: Session data layer — schema, migration, backfill, scoped queries

**Plan set:** `NINA_CHAT_SESSIONS_PLAN.md`
**Analysis:** `20260904-223303-S3K9_code_analyzer.md`
**Satisfies:** R2 (sessions exist, can be created, listed and opened), R4 (pin to the top), R5 (sort by the most recent *user* message), R11 (remove a session, and its messages go with it)
**Depends on:** none — this is the first phase of the set
**Difficulty:** HARD
**Package:** `lib/db`, `lib/nina`, `drizzle`

---

## Goal

After this phase `nina_messages` has a partition: every row belongs to exactly one
`nina_chat_sessions` row, enforced by a `NOT NULL` foreign key that cascades on delete, and every
existing row in production has been placed in one per-user legacy session by migration `0004`.
`lib/nina/queries.ts` gains the nine session statements the rest of the set calls (create, read,
list, ensure, rename, auto-title-if-untitled, pin, count, remove) and every message read and write
gains an **optional** session parameter, so the tree still builds and every existing caller still
behaves exactly as it does today.

Nothing on screen changes. No component, route or action is touched. Phase 3 re-points the callers
and turns the optional parameters into required ones — which is how `tsc` proves that no writer of
`nina_messages` was missed.

## Interface Contract

**Creates — `lib/db/schema.ts`:**

- `schema.ninaChatSessions` — table `nina_chat_sessions`, columns `id`, `user_id`, `title`,
  `title_source`, `pinned_at`, `created_at`; index `nina_chat_sessions_user_created_idx`
- `schema.NinaSessionTitleSource` — `'auto' | 'manual' | 'backfill'`
- `schema.ninaChatSessionsRelations`
- `schema.NinaChatSession`, `schema.NewNinaChatSession` (row types)
- `ninaMessages.sessionId` → column `nina_messages.session_id`, `text NOT NULL`,
  FK → `nina_chat_sessions.id` **`ON DELETE CASCADE`**
- indexes `nina_messages_session_seq_idx` and `nina_messages_user_session_runner_idx`
- `session: one(ninaChatSessions, …)` added to the existing `ninaMessagesRelations`

**Creates — `lib/nina/sessions.ts`** (new, pure, no imports outside itself):

- `SESSION_UNTITLED_TITLE`, `NINA_SESSION_TITLE_MAX_CHARS` (`= 60`) — **the set's single title cap; phases 3, 4 and 5 import it and declare nothing**
- `NinaSessionOrderable` (interface)
- `sessionActivityAt`, `compareNinaSessionActivity`, `compareNinaSessions`,
  `orderNinaSessions`, `mostRecentNinaSession`, `sessionTitleFor`

**Creates — `lib/nina/queries.ts` §4a:**

- `NinaSessionRow`, `NinaSessionListRow` (interfaces, §1)
- `sessionColumns` (private projection, §2)
- `createNinaSession(userId)`
- `getNinaSession(userId, id)`
- `listNinaSessions(userId)` — display order (pinned first, then R5)
- `ensureNinaSession(userId)` — the id of his most recent session by **activity, pins ignored**,
  creating one if he has none
- `renameNinaSession(userId, id, title)`
- `setNinaSessionTitleIfUntitled(userId, id, title)` — **phase 4's write; written here because
  `queries.ts` is this phase's file**
- `setNinaSessionPinned(userId, id, pinned, now?)`
- `countNinaSessionMessages(userId, sessionId)` — **phase 5's confirmation dialog needs it**
- `removeNinaSession(userId, id)`
- `messageScope(userId, sessionId?)` (private predicate helper, §4b)

**Signature changes — `lib/nina/queries.ts` §4b** (every one of them backward compatible; no call
site in the repo changes in this phase):

- `listNinaMessages(userId, opts: { limit })` -> `listNinaMessages(userId, opts: { limit; sessionId?: string })`
- `getNinaMessageWindow(userId, limit)` -> `getNinaMessageWindow(userId, limit, sessionId?: string)`
- `insertNinaMessages(userId, rows)` -> `insertNinaMessages(userId, rows, sessionId?: string)`
- `countUnreadNinaMessages(userId)` -> `countUnreadNinaMessages(userId, opts?: { sessionId?: string })`
- `markNinaMessagesRead(userId, now?: Date)` -> `markNinaMessagesRead(userId, opts?: { sessionId?: string; now?: Date })`
  — **the one shape change**: `now` moves from a positional parameter into the options bag, because
  `sessionId` behind an optional `now` would force `markNinaMessagesRead(userId, undefined, id)` on
  phase 8. `app/nina/page.tsx:256` calls it as `markNinaMessagesRead(userId)` and no caller or test
  in the repo passes `now` (verified by grep), so nothing breaks.

**Deletes:** nothing. **Renames:** nothing.

**Requires (from earlier phases):** nothing.

**Leaves alone (owned by others):**

- `app/nina/page.tsx` (phases 3, 5, 8), `components/**` (phases 2, 5, 7, 8, 9)
- `lib/nina/actions.ts` (phases 3, 4), `gateway.ts`, `load.ts`, `proactive.ts`, `imagejobs.ts` (phase 3)
- `lib/nina/chatview.ts` (phase 2), `scripts/check-llm-payload-boundary.mjs` (phase 4 only)
- `tests/nina.gateway.patterns.test.ts` (phase 3 updates its `getNinaMessageWindow` mock; the
  widened signature keeps the current mock compiling, so this phase does not need to)
- `updateNinaMessage` / `deleteNinaMessage` in `queries.ts` — **phase 7 writes those two into this
  file itself**; step 9 below leaves a named seam saying exactly where.

## Files

| File | Action | What changes |
|---|---|---|
| `lib/db/schema.ts` | modify | `NinaSessionTitleSource` + `ninaChatSessions` inserted at line 688 (between `NinaMessageSource` and `ninaMessages`); `sessionId` column at line 748; two indexes at line 782; relations at line 1352; row types at line 1459 |
| `drizzle/0004_nina_chat_sessions.sql` | create | generated DDL **plus a hand-written backfill block** and the `SET NOT NULL` that follows it |
| `drizzle/meta/0004_snapshot.json` | create | written by `drizzle-kit generate` — never by hand |
| `drizzle/meta/_journal.json` | modify | one entry, `idx: 4`, tag `0004_nina_chat_sessions` |
| `lib/nina/sessions.ts` | create | the ordering rule and the title fallback, pure |
| `lib/nina/sessions.test.ts` | create | vitest suite for both rules |
| `lib/nina/queries.ts` | modify | §1 two interfaces; §2 `sessionColumns`; §4a nine session statements; §4b five widened signatures + `messageScope`; §4c the phase-7 seam |
| `tests/db.schema.nina.test.ts` | modify | `nina_messages` column list gains `session_id`; its index list goes four -> six; a new `describe('nina_chat_sessions')` block |

---

## Decisions, with their reasoning

The plan index requires each of these to be argued rather than chosen silently.

### D1 — `session_id` is `NOT NULL`, and a NULL is not a legal state after 0004

`text NOT NULL` referencing `nina_chat_sessions.id`. There is no "unfiled" bucket and no code path
anywhere in the set that has to ask whether a message has a session.

The alternative — a nullable column where NULL means "written before sessions existed" — was
rejected because it makes the type `string | null` at every one of the ~40 places
`NinaMessageRow` flows through, and every one of those places would then need a decision about what
a NULL means. Worse, it makes the failure *quiet*: a writer that forgets a session still succeeds,
and the row simply stops appearing on his screen. The plan index states the stake exactly — "a
deploy that leaves rows with no session is a runner whose entire conversation vanished from his
screen" — and `NOT NULL` is the only version of this column where that outcome is a failed INSERT
instead of a lost message.

The cost is paid once, in the migration: `ADD COLUMN` nullable -> backfill -> `SET NOT NULL`, in
that order, in one transaction (D6).

### D2 — `ON DELETE CASCADE`, and exactly what is deliberately left behind

R11 is not "hide the session"; the plan index rules out the archive flag on the grounds that an
archived session still answering `getNinaMessageWindow` defeats the point. So `removeNinaSession`
is one `DELETE` and the FK does the rest:

`nina_chat_sessions` -> `nina_messages.session_id` (cascade, new) -> `nina_message_images.message_id`
(cascade, already exists at `lib/db/schema.ts:815`). Postgres chains cascades, so one statement
removes the conversation and its photo rows.

Three things are **deliberately not** cleaned up, and each is a stated decision, not an oversight:

1. **The Blob objects.** `nina_message_images.blob_url` / `pathname` point at Vercel Blob. The rows
   go; the bytes stay. This matches assumption A5 and the set's scope section, and the
   `reap-orphaned-blobs` skill does not cover the `nina/` prefix yet. `removeNinaSession` therefore
   does **not** pre-read the image rows to return their pathnames — a return value nothing consumes
   is a promise this set does not keep, and the reaper will find them by prefix when it learns
   about `nina/`.
2. **`nina_memory_slots.source_message_id` and `nina_memory_facts.source_message_id`.** Verified in
   the schema: both are plain `text` columns with **no** foreign key
   (`lib/db/schema.ts:950` and `:998`; the column comment says "unenforced"). Nothing cascades, so
   removing a session leaves dangling provenance pointers in the memory ledger. That is assumption
   A2 plus A5 held together on purpose: the ledger is her long-term memory, a distilled fact can be
   true after the sentence that produced it is gone, and cascading facts away would make deleting a
   session quietly delete what she knows about him.
3. **`nina_turns`.** The audit trail carries no `session_id` and does not gain one. It is an audit
   trail; a removed conversation does not un-spend the tokens it cost.

One cascade side effect worth naming: a surviving message in *another* session that quoted a removed
one has its `reply_to_id` set to NULL by the existing self-FK's `ON DELETE SET NULL`, and
`resolveQuote` already degrades that to plain text. No new behaviour, and phase 7's exit criteria
covers the same path.

### D3 — R5's sort key is derived at read time. No `last_user_message_at` column

A stored watermark on `nina_chat_sessions` loses on the `nina_folders` argument, and loses harder
here than it does there. `nina_folders`'s header says a stored count "is a cache with two writers".
Count the writers a `last_user_message_at` column would have **inside this one plan set**:

- `lib/nina/actions.ts` — his turn (phase 3)
- `lib/nina/proactive.ts` — five triggers (phase 3), which write `role = 'nina'` and must therefore
  *not* touch it
- `lib/nina/imagejobs.ts` — the apology (phase 3), same
- **phase 7's `deleteNinaMessage`** — deleting the newest runner message in a session moves the
  watermark *backwards*, and phase 7 explicitly does not own `nina_chat_sessions`
- phase 7's `updateNinaMessage` — must *not* move it

That is a cache with two legitimate writers and two more that must remember not to write, spread
across four files owned by two other phases. The failure mode is a session stuck at the top of the
list forever, which is precisely the requirement it was meant to serve.

So `listNinaSessions` computes it: `max(sent_at) … where role = 'runner' group by session_id`, one
statement, in the same `db.batch` as the session rows so the two are one snapshot.

**The counter-precedent, and why it does not apply.** The repo *did* pay for a denormalisation on
the other hot conversation read — `nina_messages_user_unread_idx`, whose own comment says the count
"runs on every page render of every tabbed screen … a sequential scan of the whole conversation on
every navigation is the one performance mistake in this schema that a user would actually feel".
That argument is about a query on five screens; the session list is read on **one** screen, `/nina`,
and its row count is bounded by how many topics a human starts. What that precedent *does* buy is
the right to spend an index on the aggregate instead of a column, which is D5.

### D4 — the ordering key is an instant, and pins partition rather than sort

The comparator is two tiers, and both live in `lib/nina/sessions.ts` so they can be asserted:

1. **Pinned before unpinned** (`pinned_at IS NOT NULL`). Pinning is a statement about *which*
   sessions matter, not about their order, so it partitions the list and nothing more. Sorting the
   pinned block by pin time was rejected: an actively-used pinned session would drift downward every
   time he pinned something else, and R5 is the order he asked for. Recorded as the loser so a later
   phase does not "fix" it — `pinned_at` is a timestamp precisely so that reversing this decision
   needs no migration.
2. **Within each block, `lastUserMessageAt ?? createdAt`, descending**, tie-broken by `id`
   descending so the sort is total and the unit test is deterministic.

**Why an instant and not `seq`, given invariant 6.** Invariant 6 says `seq` is the total order of
the *conversation* and that nothing re-sorts messages by `sent_at` — that invariant is untouched
here, and `listNinaMessages` still orders by `seq`. Session *rows* cannot use `seq`, because a
session created and not yet written to has no message and therefore no `seq`, and a brand-new
session must sort to the **top** (he just made it to type in it) rather than to the bottom. A key
that mixes "the newest user message" with "when the session was made" has to be a common scale, and
the only common scale is an instant. The two orders cannot disagree in practice: `seq` is assigned
by `nextval` in insertion order and `sent_at` is `defaultNow()` at that same insertion, so they
diverge only for rows sharing a microsecond — which means the same transaction, which means the same
session.

**`ensureNinaSession` uses the activity order with pins ignored, and that distinction is
load-bearing.** "The most recent session" (A3's target for a proactive message, A4's default for
`/nina` with no `?s=`) is *not* the top of the display list: if he pins a session from March, the
display list puts March first, and a nag posted into it would land in a conversation he stopped
having. So `lib/nina/sessions.ts` exports two comparators — `compareNinaSessions` (display, pinned
first) and `compareNinaSessionActivity` (resolution, pins irrelevant) — plus
`mostRecentNinaSession`, which uses the second. Phases 3 and 8 must call
`mostRecentNinaSession`, never `listNinaSessions(...)[0]`.

### D5 — two new indexes on `nina_messages`, each with a job

- **`nina_messages_session_seq_idx (session_id, seq)`** does two jobs. It is the per-session slice
  (`WHERE user_id = $1 AND session_id = $2 ORDER BY seq DESC LIMIT n` — a backward index scan with
  `user_id` as a heap filter), and it is the index the **FK itself** needs: Postgres does not index
  the referencing side of a foreign key, and without a `session_id`-leading index every
  `removeNinaSession` would sequentially scan `nina_messages` to find the children. `session_id`
  leads rather than `user_id` because the FK's lookup has no user in it, and because a nanoid session
  is far more selective than a user. `nina_messages_user_seq_idx` still answers every user-wide read.
- **`nina_messages_user_session_runner_idx (user_id, session_id, sent_at) WHERE role = 'runner'`**
  is D3's aggregate, made index-only. Partial on the `nina_messages_user_unread_idx` precedent: it
  holds only his half of the conversation, and `sent_at` rides along as a payload column, not as a
  sort key, so `max(sent_at) GROUP BY session_id` never touches the heap. Without it, the sidebar's
  one read heap-fetches every runner message in the conversation on every `/nina` render — the exact
  cost the unread index exists to avoid.

`nina_chat_sessions` gets exactly one index, `(user_id, created_at DESC)`, which is the whole of
`readNinaSessionsWithActivity`'s query. No index on `pinned_at`: the pin is read from rows already
fetched, and a partial index over a handful of rows in a table with tens of rows would be a
declaration with no reader — the argument `nina_memory_slots` makes for having no secondary index at
all.

### D6 — the backfill, and the one thing it must never do

Three statements between the `ADD COLUMN` and the `SET NOT NULL`, all in migration `0004`:

1. **One session per user who has any message**, its `created_at` set to `min(sent_at)` of that
   user's conversation, so it sorts and displays as the old thing it is.
2. **Its id is `substr(md5(user_id), 1, 12)`** — 12 characters from the 64-symbol-compatible hex
   alphabet, so it satisfies `lib/id.ts`'s `ID_RE` (`^[0-9A-Za-z_-]{12}$`) and `isValidId` accepts
   it in a `?s=` parameter. Deterministic, so statement 3 can recompute it instead of joining back,
   and `md5()` is core Postgres — no `pgcrypto`, no extension to enable on Neon.
3. **No `ON CONFLICT DO NOTHING` on that INSERT.** This is the one place in the file where the
   convenient thing is the dangerous thing: two users whose `user_id` share an md5 prefix would make
   the second insert a silent no-op, statement 3 would file *their* messages into the *first* user's
   session, and `removeNinaSession` would then cascade-delete a stranger's conversation. A unique
   violation aborts the migration; nothing is half-applied (D7). A migration that fails is
   recoverable; a merged conversation is not.
4. **No LLM call, and no per-user title cleverness.** The title is the constant
   `'Semua chat sebelumnya'` with `title_source = 'backfill'`. Indonesian, matching the runner-facing
   copy already on this surface (`app/nina/page.tsx`'s `aria-label="Buka detail Nina"`,
   `NinaAboutScreen`'s `"Lihat foto profil Nina ukuran penuh"`).
5. **`title_source = 'backfill'` is what stops phase 4 renaming it.** A 3-4 word LLM title over
   years of mixed conversation would be a lie about what the session contains, and
   `setNinaSessionTitleIfUntitled` cannot touch it because its `WHERE` requires `title IS NULL`.
6. **No `ORDER BY` anywhere in the backfill, and none is needed.** "In `seq` order" is satisfied by
   construction: every one of a user's rows goes into the same session and `seq` is untouched, so the
   slice `WHERE session_id = X ORDER BY seq` returns exactly the sequence the screen renders today.
7. **A user with no messages gets no session.** Creating one for every account would put an empty
   "Semua chat sebelumnya" in front of a runner who has never written to her; `ensureNinaSession`
   makes his first session when he first speaks.

### D7 — `title` and `title_source` are nullable, together

NULL/NULL means "nobody has named this yet" — the ordinary first state of every new session, the
only state phase 4's titler is allowed to overwrite, and the state `sessionTitleFor` renders as
`SESSION_UNTITLED_TITLE`. The pairing is enforced by the four write functions (each sets both), not
by a CHECK constraint, on the `nina_folders` precedent for a rule whose reason is a UI invariant.

`title_source` exists even though `title IS NULL` already answers "may the titler write here?",
because the plan index tells phase 4 that "`title_source` is the field that makes that decision
cheap" and phase 4's planner is writing against that sentence right now, with no way to see this
file. Shipping the column costs one nullable `text`; omitting it costs the reconciler a cross-phase
repair. It also distinguishes `'backfill'` from `'manual'`, which the titler must treat identically
but a future "re-title this session" control would not.

**Not added, deliberately:** `updated_at` (no reader — `nina_folders` makes the same call),
`archived_at` (scope section: a hard delete, or R11 is defeated), `last_user_message_at` (D3),
and any per-session sequence (invariant 6).

### D8 — the two-step that keeps the tree green

Every widened message signature takes the session parameter as optional, and **omitted means exactly
what happens today**:

- **Reads** (`listNinaMessages`, `getNinaMessageWindow`, `countUnreadNinaMessages`,
  `markNinaMessagesRead`) omit the `session_id` predicate entirely and read across the whole
  conversation — byte-identical SQL to today's. `app/nina/page.tsx` and `NinaUnreadBadge` therefore
  render the same screen after this phase as before it.
- **Writes** (`insertNinaMessages`) cannot omit anything, because the column is `NOT NULL`. So an
  omitted `sessionId` resolves through `ensureNinaSession(userId)` — his most recent session, created
  if he has none. That costs one extra statement per write until phase 3 passes the session
  explicitly, and it means the three untouched writers (`actions.ts:406`, `:608`,
  `proactive.ts:630`, `imagejobs.ts:186`) keep working *correctly*, not merely compiling.
- **Ownership is proved in SQL, both ways** (invariant 3). A read adds `session_id = $2` to
  `user_id = $1`, so a forged or foreign session id returns zero rows rather than someone else's
  conversation. A write is the one case a predicate cannot cover — the FK proves the session exists,
  not that it is his — so `insertNinaMessages` checks ownership first and returns `[]` on failure,
  which is the convention `insertNinaMessageImages` already set for exactly this situation.
  `actions.ts:409`'s existing `throw new Error('insertNinaMessages returned no row')` turns that into
  a visible send failure.

**Which optionals phase 3 makes required:** `listNinaMessages`'s `opts.sessionId`,
`getNinaMessageWindow`'s `sessionId`, and `insertNinaMessages`'s `sessionId`. **Which stay optional
permanently:** `countUnreadNinaMessages` and `markNinaMessagesRead` — "how many of hers are unread
across every session" is the tab bar's question (R9's own decision list debates exactly this, and
phase 8 decides), so both shapes are legitimate reads and the parameter is a real option rather than
a migration step.

**Which queries deliberately gain nothing:** `getNinaMessagesByIds` (ids are already owner-scoped, a
session predicate adds no security and would break phase 7's cross-session quote resolution),
`getNinaMessageImagesForMessages` and the four image queries (addressed by message id or by user),
and `hasProactiveMessageForRun` — that one **must stay global**, because scoping R8's idempotence
marker to a session would let the same run be announced once per session.

---

## Implementation Steps

### Step 1: `NinaSessionTitleSource` and `ninaChatSessions`

**File:** `lib/db/schema.ts:688` — immediately after the `NinaMessageSource` union (which ends on
line 687) and immediately before `ninaMessages`'s header comment.

**Change:** insert the type and the table. The header argues each column and each index, matching
`nina_messages` and `nina_folders`.

**Code:**

```ts
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
```

**Impact:** a new table in the snapshot. Nothing reads it until step 6.

### Step 2: `nina_messages.session_id`

**File:** `lib/db/schema.ts:748` — the `sessionId` column goes immediately **after** `userId` (line
730-732) and before `role`, so the two partition keys read together. Column order in the TS file is
free: `drizzle-kit` diffs columns by name and has no statement for reordering, and Postgres appends
the new column physically last regardless.

**Change:** add one column to the `ninaMessages` definition.

**Code:**

```ts
    /**
     * **The session this bubble belongs to (F35 R2).** `NOT NULL`: there is no unfiled bucket and
     * no code path that has to ask whether a message has a session. The alternative — nullable,
     * with NULL meaning "written before sessions existed" — would have made the failure quiet: a
     * writer that forgot a session would still succeed and the row would simply stop appearing on
     * his screen. Migration 0004 pays for `NOT NULL` once, in the right order: add the column
     * nullable, file every existing row into one session per user, then `SET NOT NULL`.
     *
     * **Cascade, and it is a requirement rather than a detail (R11).** Removing a session must take
     * its messages, and through `nina_message_images.message_id`'s cascade their image rows —
     * Postgres chains both from one DELETE. What it deliberately does NOT take: the Blob objects
     * behind those image rows (the rows go, the bytes stay, exactly as for a deleted message), and
     * the `source_message_id` pointers in `nina_memory_slots` / `nina_memory_facts`, which carry no
     * foreign key at all and so leave dangling provenance rather than cascading a fact away. That
     * is the memory ledger staying global on purpose: a distilled fact can be true after the
     * sentence that produced it is gone.
     *
     * Sessions SLICE `seq`; they do not replace it. `seq` remains the total order of the whole
     * conversation and no per-session sequence exists.
     */
    sessionId: text('session_id')
      .notNull()
      .references(() => ninaChatSessions.id, { onDelete: 'cascade' }),
```

**Impact:** `NinaMessage`/`NewNinaMessage` gain a required field. The only writer is
`insertNinaMessages`, which step 8 updates in the same phase, so the tree stays green.

### Step 3: the two new indexes

**File:** `lib/db/schema.ts:782` — appended to `ninaMessages`'s `(t) => [...]` array, after
`index('nina_messages_user_run_idx')`.

**Code:**

```ts
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
```

**Impact:** `tests/db.schema.nina.test.ts`'s index assertion goes from four names to six — step 11.

### Step 4: relations

**File:** `lib/db/schema.ts:1338` (add one line inside `ninaMessagesRelations`) and
`lib/db/schema.ts:1352` (a new block immediately before `ninaMessageImagesRelations`).

**Code** — inside the existing `ninaMessagesRelations`, after the `run:` line:

```ts
  /** The conversation this bubble is part of (F35 R2). */
  session: one(ninaChatSessions, {
    fields: [ninaMessages.sessionId],
    references: [ninaChatSessions.id],
  }),
```

**Code** — the new block:

```ts
export const ninaChatSessionsRelations = relations(ninaChatSessions, ({ one, many }) => ({
  user: one(users, { fields: [ninaChatSessions.userId], references: [users.id] }),
  messages: many(ninaMessages),
}))
```

**Impact:** none at runtime — nothing in the app uses the relational query builder. Declared for
consistency with every other table in the file.

### Step 5: row types

**File:** `lib/db/schema.ts:1459` — after `NewNinaFolder`, keeping the block's existing grouping.

**Code:**

```ts
export type NinaChatSession = typeof ninaChatSessions.$inferSelect
export type NewNinaChatSession = typeof ninaChatSessions.$inferInsert
```

**Impact:** none until a caller imports them.

### Step 6: `lib/nina/sessions.ts` — the pure rules

**File:** `lib/nina/sessions.ts` (new)

**Change:** the ordering rule, the "most recent" rule and the title fallback, with no import of
anything. `vitest.config.ts` is `environment: 'node'`, so a rule that lived in a component or in a
SQL `ORDER BY` could not be asserted at all (invariant 7); `lib/nina/chatview.ts` is the shape.

**Code:**

```ts
/**
 * The three decisions the session list makes that are not markup, as pure functions.
 *
 * Same argument as `lib/nina/chatview.ts` and `lib/photos/gallery.ts` before it: `vitest.config.ts`
 * runs `environment: 'node'` and there is no jsdom, so a rule that lives in a component cannot be
 * tested. The same goes for a rule that lives in a SQL `ORDER BY`: `lib/nina/queries.ts` reads the
 * facts and this file decides the order, which is why `listNinaSessions` returns
 * `orderNinaSessions(rows)` rather than ordering in the statement.
 *
 * **Ordering in TypeScript is affordable here and would not be everywhere.** The sidebar lists
 * every session — R2 says "a list of all past sessions" — so there is nothing to `LIMIT` and the
 * whole set is in hand already. If a later phase ever paginates the list, the comparator has to
 * move into SQL and this test moves with it; that is the one condition under which this file's
 * approach stops being right.
 *
 * No `Date` formatting happens here and none may: rendered strings come from `lib/format.ts` on the
 * server (invariant 4). These functions compare instants and return rows.
 */

/**
 * What a session with no title is called. One string, in one place, so the list cannot show two
 * different names for the same state.
 *
 * The untitled state is transient by design — phase 4's titler names a session within one `after()`
 * of its first exchange — so at most one row shows this at a time, usually the one he just made. A
 * dated fallback ("Chat 4 Sep") was rejected: it would need a formatter and a timezone inside a
 * rule that has neither, and phase 5's row renders the activity instant beside the title anyway.
 */
export const SESSION_UNTITLED_TITLE = 'Chat baru'

/**
 * The cap on a session title, in characters. **The set's one and only title cap** — reconciled.
 *
 * 60 is generous for the 3-4 words R3 asks for and for a manual rename, and small enough that no
 * list row can be handed a paragraph. Every other phase **imports this** and declares nothing:
 * phase 3's `lib/nina/active.ts` sanitiser, phase 4's `lib/nina/title.ts` rule and phase 5's
 * `SessionRow` `maxLength` are all this number. The value the runner is allowed to TYPE and the
 * value the server STORES must be the same number, or the input silently truncates what the
 * refusal would have accepted.
 *
 * **Why here and not in phase 4's `title.ts`.** This module imports nothing at all, so it is
 * client-safe by construction and a `'use client'` row can read it with no argument about bundles.
 * Reconciliation collapsed four spellings at two values — this phase's own draft
 * `SESSION_TITLE_MAX_CHARS = 80`,
 * phase 3's `NINA_SESSION_TITLE_MAX = 60`, phase 4's `NINA_SESSION_TITLE_MAX_CHARS = 60` in
 * `title.ts`, and phase 5's import of that name from *this* path — into this single declaration.
 */
export const NINA_SESSION_TITLE_MAX_CHARS = 60

/**
 * The facts the order depends on, and nothing else. Structural rather than typed against
 * `NinaSessionListRow`, so that `lib/nina/sessions.ts` never imports the data layer and the tests
 * can build a row from four fields.
 */
export interface NinaSessionOrderable {
  id: string
  /** R4. NULL = unpinned. */
  pinnedAt: Date | null
  /** R5's key: `max(sent_at)` over `role = 'runner'` in this session. NULL = he never wrote in it. */
  lastUserMessageAt: Date | null
  createdAt: Date
}

/**
 * The instant a session is sorted by: his newest message in it, or — for a session he made and has
 * not written in yet — when he made it.
 *
 * **Why an instant and not `seq`.** `seq` is the conversation's total order (invariant 6) and
 * `listNinaMessages` still uses it, but a session with no message has no `seq`, and a brand-new
 * session has to sort to the TOP rather than the bottom: he just created it to type in it. A key
 * that mixes "his newest message" with "when this was made" must be a common scale, and the only
 * common scale is an instant. The two cannot disagree in practice — `seq` comes from `nextval` at
 * the same INSERT that stamps `sent_at` with `defaultNow()`, so they diverge only inside one
 * transaction, and one transaction's rows are all in one session.
 */
export function sessionActivityAt(session: NinaSessionOrderable): Date {
  return session.lastUserMessageAt ?? session.createdAt
}

/**
 * **R5 alone: most recent user message first, pins ignored.** This is the RESOLUTION order — "which
 * session is the current one" — and it is deliberately not the display order.
 *
 * `id` descending is the tie-break. Ids are random, so the direction carries no meaning; what it
 * carries is totality, which is what makes the sort stable and the test deterministic.
 */
export function compareNinaSessionActivity(
  a: NinaSessionOrderable,
  b: NinaSessionOrderable,
): number {
  const delta = sessionActivityAt(b).getTime() - sessionActivityAt(a).getTime()
  if (delta !== 0) return delta
  if (a.id === b.id) return 0
  return a.id < b.id ? 1 : -1
}

/**
 * **R4 then R5: the DISPLAY order.** Pinned sessions form the top block; inside each block, R5.
 *
 * Pinning partitions the list and does not sort it. Sorting the pinned block by `pinned_at` was
 * rejected: an actively-used pinned session would drift downward every time he pinned something
 * else, and R5 is the order he asked for. `pinned_at` is stored as an instant anyway, so reversing
 * this needs no migration — only a change here and a case in the test.
 */
export function compareNinaSessions(a: NinaSessionOrderable, b: NinaSessionOrderable): number {
  const aPinned = a.pinnedAt !== null
  const bPinned = b.pinnedAt !== null
  if (aPinned !== bPinned) return aPinned ? -1 : 1
  return compareNinaSessionActivity(a, b)
}

/** The display order (R4 + R5), as a new array. The input is never mutated. */
export function orderNinaSessions<T extends NinaSessionOrderable>(sessions: readonly T[]): T[] {
  return [...sessions].sort(compareNinaSessions)
}

/**
 * **"His most recent session" — and this is NOT `orderNinaSessions(...)[0]`.**
 *
 * The display list puts pinned sessions on top, so if he pins a conversation from March, the top of
 * the list is March. A proactive message posted there (assumption A3) would land in a conversation
 * he stopped having, and `/nina` with no `?s=` (assumption A4) would open it. So "most recent" means
 * most recent by activity, with pins irrelevant — one linear pass over `compareNinaSessionActivity`.
 *
 * `null` means he has no sessions at all, which is a real state: a brand-new account, and the state
 * `removeNinaSession` leaves behind when he removes his last one.
 */
export function mostRecentNinaSession<T extends NinaSessionOrderable>(
  sessions: readonly T[],
): T | null {
  let best: T | null = null
  for (const session of sessions) {
    if (best === null || compareNinaSessionActivity(session, best) < 0) best = session
  }
  return best
}

/**
 * What the list shows for a session, given the stored title.
 *
 * Trimmed, and whitespace-only counts as absent: a title made of spaces would render as a blank row
 * with no way to tell it from a rendering bug. The writers in `lib/nina/queries.ts` refuse an empty
 * title, so this is the second of two guards rather than the only one — deliberately, because the
 * titler in phase 4 is a model and a model's empty string must not be able to blank a row.
 */
export function sessionTitleFor(session: { title: string | null }): string {
  const trimmed = session.title?.trim() ?? ''
  return trimmed.length > 0 ? trimmed : SESSION_UNTITLED_TITLE
}
```

**Impact:** new module, no dependents until step 8.

### Step 7: `lib/nina/sessions.test.ts`

**File:** `lib/nina/sessions.test.ts` (new)

**Code:**

```ts
import { describe, expect, it } from 'vitest'

import {
  NINA_SESSION_TITLE_MAX_CHARS,
  SESSION_UNTITLED_TITLE,
  compareNinaSessionActivity,
  compareNinaSessions,
  mostRecentNinaSession,
  orderNinaSessions,
  sessionActivityAt,
  sessionTitleFor,
  type NinaSessionOrderable,
} from './sessions'

const at = (iso: string): Date => new Date(iso)

function session(over: Partial<NinaSessionOrderable> & { id: string }): NinaSessionOrderable {
  return {
    pinnedAt: null,
    lastUserMessageAt: null,
    createdAt: at('2026-01-01T00:00:00Z'),
    ...over,
  }
}

/* ── sessionActivityAt ─────────────────────────────────────────────────────────────────────── */

describe('sessionActivityAt', () => {
  it('is his newest message in the session when there is one', () => {
    const row = session({
      id: 'aaaaaaaaaaaa',
      createdAt: at('2026-03-01T00:00:00Z'),
      lastUserMessageAt: at('2026-03-05T10:00:00Z'),
    })
    expect(sessionActivityAt(row).toISOString()).toBe('2026-03-05T10:00:00.000Z')
  })

  it('falls back to createdAt for a session he made and has not written in', () => {
    const row = session({ id: 'bbbbbbbbbbbb', createdAt: at('2026-03-09T08:00:00Z') })
    expect(sessionActivityAt(row).toISOString()).toBe('2026-03-09T08:00:00.000Z')
  })
})

/* ── R5: the activity order ────────────────────────────────────────────────────────────────── */

describe('compareNinaSessionActivity', () => {
  it('puts the most recent user message first', () => {
    const older = session({ id: 'aaaaaaaaaaaa', lastUserMessageAt: at('2026-03-01T00:00:00Z') })
    const newer = session({ id: 'bbbbbbbbbbbb', lastUserMessageAt: at('2026-03-02T00:00:00Z') })
    expect(compareNinaSessionActivity(newer, older)).toBeLessThan(0)
    expect(compareNinaSessionActivity(older, newer)).toBeGreaterThan(0)
  })

  it('ignores the pin — this is the resolution order, not the display order', () => {
    const pinnedOld = session({
      id: 'aaaaaaaaaaaa',
      pinnedAt: at('2026-03-09T00:00:00Z'),
      lastUserMessageAt: at('2026-01-01T00:00:00Z'),
    })
    const freshUnpinned = session({
      id: 'bbbbbbbbbbbb',
      lastUserMessageAt: at('2026-03-08T00:00:00Z'),
    })
    expect(compareNinaSessionActivity(freshUnpinned, pinnedOld)).toBeLessThan(0)
  })

  it('sorts a brand-new empty session above an older conversation', () => {
    const empty = session({ id: 'aaaaaaaaaaaa', createdAt: at('2026-03-09T09:00:00Z') })
    const old = session({
      id: 'bbbbbbbbbbbb',
      createdAt: at('2026-01-01T00:00:00Z'),
      lastUserMessageAt: at('2026-02-01T00:00:00Z'),
    })
    expect(compareNinaSessionActivity(empty, old)).toBeLessThan(0)
  })

  it('is a total order: equal instants tie-break on id and never return 0 for two rows', () => {
    const same = at('2026-03-05T10:00:00Z')
    const a = session({ id: 'aaaaaaaaaaaa', lastUserMessageAt: same })
    const b = session({ id: 'bbbbbbbbbbbb', lastUserMessageAt: same })
    expect(compareNinaSessionActivity(a, b)).not.toBe(0)
    expect(compareNinaSessionActivity(a, b)).toBe(-compareNinaSessionActivity(b, a))
    expect(compareNinaSessionActivity(a, a)).toBe(0)
  })
})

/* ── R4 + R5: the display order ────────────────────────────────────────────────────────────── */

describe('compareNinaSessions', () => {
  it('puts every pinned session above every unpinned one, however stale', () => {
    const pinnedStale = session({
      id: 'aaaaaaaaaaaa',
      pinnedAt: at('2026-03-09T00:00:00Z'),
      lastUserMessageAt: at('2025-06-01T00:00:00Z'),
    })
    const activeUnpinned = session({
      id: 'bbbbbbbbbbbb',
      lastUserMessageAt: at('2026-03-09T12:00:00Z'),
    })
    expect(compareNinaSessions(pinnedStale, activeUnpinned)).toBeLessThan(0)
  })

  it('applies R5 inside the pinned block, not the pin time', () => {
    const pinnedFirstButQuiet = session({
      id: 'aaaaaaaaaaaa',
      pinnedAt: at('2026-01-01T00:00:00Z'),
      lastUserMessageAt: at('2026-02-01T00:00:00Z'),
    })
    const pinnedLaterAndBusy = session({
      id: 'bbbbbbbbbbbb',
      pinnedAt: at('2026-03-01T00:00:00Z'),
      lastUserMessageAt: at('2026-03-08T00:00:00Z'),
    })
    expect(compareNinaSessions(pinnedLaterAndBusy, pinnedFirstButQuiet)).toBeLessThan(0)
  })
})

describe('orderNinaSessions', () => {
  const march = session({ id: 'ccccccccccc1', lastUserMessageAt: at('2026-03-08T00:00:00Z') })
  const february = session({ id: 'ccccccccccc2', lastUserMessageAt: at('2026-02-08T00:00:00Z') })
  const pinnedJanuary = session({
    id: 'ccccccccccc3',
    pinnedAt: at('2026-03-01T00:00:00Z'),
    lastUserMessageAt: at('2026-01-08T00:00:00Z'),
  })
  const emptyToday = session({ id: 'ccccccccccc4', createdAt: at('2026-03-09T07:00:00Z') })

  it('is pinned first, then most-recent-user-message descending', () => {
    const ordered = orderNinaSessions([february, march, pinnedJanuary, emptyToday])
    expect(ordered.map((row) => row.id)).toEqual([
      'ccccccccccc3',
      'ccccccccccc4',
      'ccccccccccc1',
      'ccccccccccc2',
    ])
  })

  it('does not mutate its input', () => {
    const input = [february, march]
    orderNinaSessions(input)
    expect(input.map((row) => row.id)).toEqual(['ccccccccccc2', 'ccccccccccc1'])
  })

  it('handles an empty list', () => {
    expect(orderNinaSessions([])).toEqual([])
  })
})

/* ── "the most recent session" ─────────────────────────────────────────────────────────────── */

describe('mostRecentNinaSession', () => {
  it('is null when he has no sessions — a new account, or the one he just removed his last from', () => {
    expect(mostRecentNinaSession([])).toBeNull()
  })

  it('is the most active session, NOT the top of the display list', () => {
    const pinnedOld = session({
      id: 'ddddddddddd1',
      pinnedAt: at('2026-03-09T00:00:00Z'),
      lastUserMessageAt: at('2026-01-01T00:00:00Z'),
    })
    const activeToday = session({
      id: 'ddddddddddd2',
      lastUserMessageAt: at('2026-03-09T06:00:00Z'),
    })
    const rows = [pinnedOld, activeToday]

    expect(orderNinaSessions(rows)[0]?.id).toBe('ddddddddddd1')
    expect(mostRecentNinaSession(rows)?.id).toBe('ddddddddddd2')
  })

  it('picks a freshly created empty session over an older conversation', () => {
    const empty = session({ id: 'ddddddddddd3', createdAt: at('2026-03-09T09:00:00Z') })
    const old = session({ id: 'ddddddddddd4', lastUserMessageAt: at('2026-03-08T00:00:00Z') })
    expect(mostRecentNinaSession([old, empty])?.id).toBe('ddddddddddd3')
  })
})

/* ── the title fallback ────────────────────────────────────────────────────────────────────── */

describe('sessionTitleFor', () => {
  it('returns the stored title when there is one', () => {
    expect(sessionTitleFor({ title: 'Latihan half marathon' })).toBe('Latihan half marathon')
  })

  it('trims it', () => {
    expect(sessionTitleFor({ title: '  Latihan pagi  ' })).toBe('Latihan pagi')
  })

  it('falls back for NULL, for empty, and for whitespace-only', () => {
    expect(sessionTitleFor({ title: null })).toBe(SESSION_UNTITLED_TITLE)
    expect(sessionTitleFor({ title: '' })).toBe(SESSION_UNTITLED_TITLE)
    expect(sessionTitleFor({ title: '   \n\t ' })).toBe(SESSION_UNTITLED_TITLE)
  })

  it('does not truncate — the cap belongs to the writer, not the reader', () => {
    const long = 'a'.repeat(NINA_SESSION_TITLE_MAX_CHARS + 20)
    expect(sessionTitleFor({ title: long })).toBe(long)
  })
})
```

**Impact:** `npm test` gains ~18 cases.

### Step 8: `lib/nina/queries.ts` — imports, shapes and the column list

**File:** `lib/nina/queries.ts:1-30` (imports), `:100` (§1, after `NinaMessageRow`'s block),
`:392` (§2, before `messageColumns`).

**Change (a) — imports.** Add `max` to the `drizzle-orm` import, `ninaChatSessions` and
`NinaSessionTitleSource` to the schema import, and the pure module.

**Code:**

```ts
import { and, asc, desc, eq, gte, inArray, isNotNull, isNull, max, sql, type SQL } from 'drizzle-orm'
```

```ts
import {
  ninaAvatars,
  ninaChatSessions,
  ninaFolders,
  ninaMemoryFacts,
  ninaMemorySlots,
  ninaMessageImages,
  ninaMessages,
  ninaNags,
  ninaTurns,
  users,
  type NinaAvatarSource,
  type NinaFactCategory,
  type NinaImageKind,
  type NinaMemorySource,
  type NinaMessageSource,
  type NinaRole,
  type NinaSessionTitleSource,
  type NinaSlotValue,
  type NinaTurnKind,
  type NinaTurnStatus,
} from '@/lib/db/schema'
```

```ts
import {
  NINA_SESSION_TITLE_MAX_CHARS,
  mostRecentNinaSession,
  orderNinaSessions,
} from '@/lib/nina/sessions'
```

**Change (b) — §1 shapes.** Insert after `NinaMessageInsert`'s block (which ends around line 120).

**Code:**

```ts
/**
 * One session, as the sidebar and the resolver want it. `userId` is absent on purpose: it is the
 * scope, not a field — nothing downstream needs it and a row that carries it invites a caller to
 * trust it instead of `requireUserId()`.
 *
 * `title` may be NULL, and `sessionTitleFor` in `lib/nina/sessions.ts` is the only sanctioned way to
 * turn that into something a screen can show.
 */
export interface NinaSessionRow {
  id: string
  title: string | null
  titleSource: NinaSessionTitleSource | null
  pinnedAt: Date | null
  createdAt: Date
}

/**
 * A session plus R5's sort key, which is derived and therefore not on the row: `max(sent_at)` over
 * `role = 'runner'` inside it. NULL means he has never written in this session — a session he just
 * created, or one where only her proactive messages live.
 *
 * See `nina_chat_sessions`'s header for why this is not a stored column.
 */
export interface NinaSessionListRow extends NinaSessionRow {
  lastUserMessageAt: Date | null
}
```

**Change (c) — §2 column list.** Insert immediately before `messageColumns`.

**Code:**

```ts
const sessionColumns = {
  id: ninaChatSessions.id,
  title: ninaChatSessions.title,
  titleSource: ninaChatSessions.titleSource,
  pinnedAt: ninaChatSessions.pinnedAt,
  createdAt: ninaChatSessions.createdAt,
}
```

**Impact:** none on behaviour.

### Step 9: `lib/nina/queries.ts` §4a — the nine session statements

**File:** `lib/nina/queries.ts:471` — immediately after the `§4 The conversation` banner and before
`listNinaMessages`'s docstring.

**Change:** a `§4a` sub-divider (the `§9b` idiom) and nine functions. Every one takes `userId` first
and proves ownership in its `WHERE` (invariant 3).

**Code:**

```ts
/* ---------------------------------------------------------------------------
 * §4a Sessions — the conversation's partition (F35 R2, R4, R5, R11)
 *
 * Nine statements: create, read one, list with R5's derived sort key, resolve "the current one",
 * two title writes, the pin, a message count for the delete confirmation, and the delete itself.
 * Every one is `userId`-scoped in its WHERE, per this module's rule 1 — a session id arriving from
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
 * `null` means "not yours, or gone" — deliberately one outcome, per this module's header. A screen
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
 * Written here because `lib/nina/queries.ts` is phase 1's file, not because phase 1 needs it. Phase 4
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
 * How many messages a session holds — **for phase 5's delete confirmation, which is the only thing
 * standing between a mis-tap and a lost conversation.**
 *
 * There is no confirm dialog anywhere in this codebase today and no undo for R11 (the archive flag
 * was ruled out), so the confirmation has to be able to say what it destroys. A confirm that cannot
 * name the cost is not a confirm.
 *
 * Every role, not just his: the count is "what disappears", and her replies disappear too. That is
 * why it is a separate statement rather than a column on `listNinaSessions`'s aggregate, which is
 * deliberately `role = 'runner'` only.
 */
export async function countNinaSessionMessages(
  userId: string,
  sessionId: string,
): Promise<number> {
  const rows = await db
    .select({ n: sql<number>`count(*)`.mapWith(Number) })
    .from(ninaMessages)
    .where(and(eq(ninaMessages.userId, userId), eq(ninaMessages.sessionId, sessionId)))

  return rows[0]?.n ?? 0
}

/**
 * **R11. One DELETE, and the foreign keys do the rest.**
 *
 * `nina_chat_sessions` -> `nina_messages.session_id` (cascade) -> `nina_message_images.message_id`
 * (cascade, and it predates this feature). Postgres chains both, so this statement removes the
 * conversation and its photo ROWS.
 *
 * **What it deliberately leaves behind, stated rather than assumed:**
 *   - the Blob objects those image rows pointed at. The rows go, the bytes stay — the same call
 *     `deleteNinaMessage` makes, and the `reap-orphaned-blobs` skill does not cover the `nina/`
 *     prefix yet. This function does NOT pre-read the image rows to hand their pathnames back: a
 *     return value nothing consumes is a promise this set has not made.
 *   - every `source_message_id` in `nina_memory_slots` / `nina_memory_facts` that pointed into the
 *     session. Neither column has a foreign key, so nothing cascades and the ledger keeps its facts.
 *     That is the memory staying global on purpose (assumption A2): a distilled fact can be true
 *     after the sentence that produced it is gone, and deleting a conversation must not quietly
 *     delete what she knows about him.
 *   - `nina_turns`. It is the audit trail; a removed conversation does not un-spend its tokens.
 *
 * A surviving message in ANOTHER session that quoted one of these has its `reply_to_id` set to NULL
 * by the self-FK, and `resolveQuote` already degrades that to plain text. No new behaviour.
 *
 * `false` is "not yours, or already gone" — the caller turns that into one message.
 */
export async function removeNinaSession(userId: string, id: string): Promise<boolean> {
  const removed = await db
    .delete(ninaChatSessions)
    .where(and(eq(ninaChatSessions.userId, userId), eq(ninaChatSessions.id, id)))
    .returning({ id: ninaChatSessions.id })

  return removed.length > 0
}
```

**Impact:** nine new exports. Nothing calls them yet; phases 3, 4, 5 and 8 do.

### Step 10: `lib/nina/queries.ts` §4b — the five widened message statements

**File:** `lib/nina/queries.ts:482-617` — `listNinaMessages` through `markNinaMessagesRead`, replaced
in place, preceded by a `§4b` divider and `messageScope`.

**Change:** each gains an optional session parameter whose omitted behaviour is today's behaviour
exactly. **No call site in the repo changes in this phase.**

**Code** — the divider and the shared predicate, inserted before `listNinaMessages`:

```ts
/* ---------------------------------------------------------------------------
 * §4b The messages
 *
 * Every read and write below takes an OPTIONAL session, and omitting it means exactly what the code
 * did before sessions existed: the reads drop the `session_id` predicate and see the whole
 * conversation, and the one write resolves his current session because the column is NOT NULL.
 *
 * That is deliberate and temporary. F35 phase 3 re-points `app/nina/page.tsx`, `actions.ts`,
 * `gateway.ts`, `proactive.ts` and `imagejobs.ts` and then makes `listNinaMessages`,
 * `getNinaMessageWindow` and `insertNinaMessages` require the parameter — which is how `tsc` proves
 * that no writer of `nina_messages` was missed. `countUnreadNinaMessages` and
 * `markNinaMessagesRead` keep theirs optional for good: "how many of hers are unread across every
 * session" is the tab bar's question and "in this session" is the screen's, and both are real.
 * -------------------------------------------------------------------------*/

/**
 * `user_id = $1`, plus `session_id = $2` when there is one. The `folderSubtree` idiom — a predicate
 * spelled once so six statements cannot drift apart.
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
```

**Code** — `listNinaMessages`:

```ts
/**
 * The last `limit` messages, returned **OLDEST FIRST** — display order, which is what phase 4's
 * `app/nina/page.tsx` renders straight down the page.
 *
 * The query itself is `ORDER BY seq DESC LIMIT n` and the array is reversed in TypeScript,
 * because "the newest n" is an index-backed descending scan of n rows while "the oldest n of the
 * tail" is not expressible without knowing where the tail starts. Reversing `n <= 200` items is
 * free; reading the whole conversation to reverse it would not be.
 *
 * `opts.sessionId` slices that scan to one session (F35 R2), reading
 * `nina_messages_session_seq_idx`. **`seq` is still the order** — sessions slice the total order and
 * no phase introduces a per-session sequence. Omitted, this is byte-for-byte the pre-F35 query;
 * phase 3 makes it required.
 */
export async function listNinaMessages(
  userId: string,
  opts: { limit: number; sessionId?: string },
): Promise<NinaMessageRow[]> {
  const rows = await db
    .select(messageColumns)
    .from(ninaMessages)
    .where(messageScope(userId, opts.sessionId))
    .orderBy(desc(ninaMessages.seq))
    .limit(opts.limit)

  return rows.reverse()
}
```

**Code** — `getNinaMessageWindow`:

```ts
/**
 * Phase 2's `readMessageWindow`: the last `limit` messages oldest-first, plus how many exist
 * before them, so the system prompt can say "there are 312 earlier messages" instead of implying
 * the conversation began forty messages ago.
 *
 * `olderCount` is a SQL `count(*)` minus the window's length — never `allMessages.length - limit`,
 * which would mean materialising the whole conversation to compute one integer. One batch, so the
 * count and the window are the same snapshot and the number can never disagree with the rows.
 *
 * **`sessionId` is the requirement, not a refinement (F35 R2, assumption A1).** "A new session so I
 * can focus on a new topic" is a claim about what SHE READS: this window is handed to `glm-5.3` on
 * every turn, so without the predicate a new session would look new and behave exactly like the old
 * one. Both statements are scoped together, so `olderCount` counts the same session it windows —
 * "there are 312 earlier messages" must mean 312 earlier messages *in this conversation*.
 * Omitted, this is the pre-F35 query; phase 3 makes it required and updates
 * `tests/nina.gateway.patterns.test.ts`'s mock.
 */
export async function getNinaMessageWindow(
  userId: string,
  limit: number,
  sessionId?: string,
): Promise<{ messages: NinaMessageRow[]; olderCount: number }> {
  const scope = messageScope(userId, sessionId)

  const [rows, countRows] = await db.batch([
    db
      .select(messageColumns)
      .from(ninaMessages)
      .where(scope)
      .orderBy(desc(ninaMessages.seq))
      .limit(limit),

    db.select({ total: sql<number>`count(*)`.mapWith(Number) }).from(ninaMessages).where(scope),
  ])

  const total = countRows[0]?.total ?? 0
  return { messages: rows.reverse(), olderCount: Math.max(0, total - rows.length) }
}
```

**Code** — `insertNinaMessages`:

```ts
/**
 * **One multi-row INSERT, not a batch of single inserts, and that is the R for phase 4's
 * ordering.** Postgres evaluates `nextval` once per row in the order the `VALUES` list gives
 * them, so `seq` comes out ascending in emission order — bubble 1 before bubble 4, always. A
 * `db.batch` of four separate inserts would also work today but does not promise it.
 *
 * Returns the inserted rows in the same order, ids and `seq` included, because phase 3 needs the
 * ids to hand back to the client and phase 6 needs them to attach images.
 *
 * ── THE SESSION IS RESOLVED, NOT DEFAULTED (F35 R2) ─────────────────────────────────────────
 * `nina_messages.session_id` is `NOT NULL`, so unlike the reads above this one cannot simply omit a
 * predicate. An omitted `sessionId` therefore resolves through `ensureNinaSession` — his most recent
 * session by activity, created if he has none — which is what keeps the three untouched writers
 * (`actions.ts`, `proactive.ts`, `imagejobs.ts`) not merely compiling but CORRECT until phase 3
 * passes a session explicitly. It is also assumption A3's behaviour for free: a proactive message
 * written with no session in view lands in the conversation he is actually having.
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
  sessionId?: string,
): Promise<NinaMessageRow[]> {
  if (rows.length === 0) return []

  let target: string
  if (sessionId == null) {
    target = await ensureNinaSession(userId)
  } else {
    const owned = await getNinaSession(userId, sessionId)
    if (owned == null) return []
    target = owned.id
  }

  const inserted = await db
    .insert(ninaMessages)
    .values(
      rows.map((row) => ({
        id: newId(),
        userId,
        sessionId: target,
        role: row.role,
        text: row.body,
        source: row.source ?? 'chat',
        turnId: row.turnId ?? null,
        replyToId: row.replyToId ?? null,
        runId: row.runId ?? null,
      })),
    )
    .returning(messageColumns)

  return [...inserted].sort((a, b) => a.seq - b.seq)
}
```

**Code** — `countUnreadNinaMessages`:

```ts
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
```

**Code** — `markNinaMessagesRead`:

```ts
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
```

**Code** — the phase-7 seam, appended immediately after `markNinaMessagesRead` and before the
`§5 Images` banner:

```ts
/* ---------------------------------------------------------------------------
 * §4c Message mutation — F35 PHASE 7's, and deliberately not written here.
 *
 * `updateNinaMessage(userId, id, body)` and `deleteNinaMessage(userId, id)` belong in THIS section,
 * between `markNinaMessagesRead` above and the `§5 Images` banner below. Phase 7 writes them,
 * because it owns the rule about what may be edited and what an empty edit means, and a statement
 * with no rule behind it would be a statement nobody could review.
 *
 * Two facts they inherit from this phase rather than deciding for themselves: `nina_message_images`
 * cascades from `message_id` so a deleted message takes its photo ROWS (never its blobs), and
 * `reply_to_id` is `ON DELETE SET NULL` so a quote pointing at a deleted message degrades to plain
 * text — which `resolveQuote` already handles.
 * -------------------------------------------------------------------------*/
```

**Impact:** five widened signatures, zero behaviour change for every existing caller.

### Step 11: `tests/db.schema.nina.test.ts`

**File:** `tests/db.schema.nina.test.ts:88-133`

**Change (a).** In `it('spells the columns phase 2 and phase 4 were written against')`, add
`'session_id',` to the array (after `'user_id',`) — the assertion sorts the list, so position in the
literal is cosmetic.

**Change (b).** Replace the four-index assertion:

```ts
  it('has the six indexes the reads need — four F33 and two F35', () => {
    expect(indexNames(schema.ninaMessages)).toEqual([
      'nina_messages_reply_to_idx',
      'nina_messages_session_seq_idx',
      'nina_messages_user_run_idx',
      'nina_messages_user_seq_idx',
      'nina_messages_user_session_runner_idx',
      'nina_messages_user_unread_idx',
    ])
  })
```

**Change (c).** A new `describe` block, inserted after `describe('nina_folders')`'s closing `})`
(line ~287) — F34's precedent, which added `nina_folders` as its own block rather than editing
F33's "eight table names" list.

**Code:**

```ts
describe('nina_chat_sessions — F35 R2', () => {
  it('is a table with exactly the six columns the feature was planned against', () => {
    expect(cfg(schema.ninaChatSessions).name).toBe('nina_chat_sessions')
    expect(names(schema.ninaChatSessions)).toEqual(
      ['id', 'user_id', 'title', 'title_source', 'pinned_at', 'created_at'].sort(),
    )
    expect(columns(schema.ninaChatSessions).get('id')?.primary).toBe(true)
  })

  it('cascades from users, so deleting an account takes its sessions with it', () => {
    expect(fkFor(schema.ninaChatSessions, 'user_id')?.onDelete).toBe('cascade')
  })

  it('title and title_source are nullable, and NULL/NULL is "nobody has named this yet"', () => {
    // The only state phase 4's titler may write into, and the state `sessionTitleFor` renders as
    // "Chat baru". `setNinaSessionTitleIfUntitled`'s `isNull` predicate is its idempotence.
    expect(sqlType(schema.ninaChatSessions, 'title')).toBe('text')
    expect(columns(schema.ninaChatSessions).get('title')?.notNull).toBe(false)
    expect(columns(schema.ninaChatSessions).get('title_source')?.notNull).toBe(false)
  })

  it('pinned_at is a nullable timestamp, not an is_pinned boolean (R4)', () => {
    expect(sqlType(schema.ninaChatSessions, 'pinned_at')).toBe('timestamp with time zone')
    expect(columns(schema.ninaChatSessions).get('pinned_at')?.notNull).toBe(false)
  })

  it('carries no last_user_message_at — R5 derives it, because a watermark is a cache with four writers', () => {
    expect(names(schema.ninaChatSessions)).not.toContain('last_user_message_at')
    // And no archive flag: R11 is a hard delete, or an archived session still answers
    // getNinaMessageWindow and removing it means nothing.
    expect(names(schema.ninaChatSessions)).not.toContain('archived_at')
  })

  it('has one index, (user_id, created_at desc) — the whole of the only read', () => {
    expect(indexNames(schema.ninaChatSessions)).toEqual(['nina_chat_sessions_user_created_idx'])
  })
})

describe('nina_messages.session_id — F35 R2 and R11', () => {
  it('is NOT NULL, so a message with no session is unrepresentable', () => {
    expect(sqlType(schema.ninaMessages, 'session_id')).toBe('text')
    expect(columns(schema.ninaMessages).get('session_id')?.notNull).toBe(true)
  })

  it('CASCADES, which is what makes removing a session take its messages (R11)', () => {
    // …and through nina_message_images.message_id's own cascade, their image rows. The blobs and
    // the memory ledger's source_message_id pointers are deliberately left — see the schema header.
    expect(fkFor(schema.ninaMessages, 'session_id')?.onDelete).toBe('cascade')
    expect(fkFor(schema.ninaMessageImages, 'message_id')?.onDelete).toBe('cascade')
  })
})
```

**Impact:** the suite now fails if a later phase makes the FK anything other than `cascade`, or
sneaks a stored watermark onto the table.

### Step 12: the migration

**File:** `drizzle/0004_nina_chat_sessions.sql` (new), `drizzle/meta/0004_snapshot.json` (new),
`drizzle/meta/_journal.json` (one entry)

**Change:** generate, then hand-edit the one statement that cannot be generated.

**(a) Generate.** The worktree has neither `node_modules` nor `.env.local` of its own, and
`drizzle.config.ts` throws at load time without `DATABASE_URL_UNPOOLED`. `generate` only diffs
`lib/db/schema.ts` against `drizzle/meta/0003_snapshot.json`, so it needs the variable to be
*present*, not reachable:

```bash
cd /home/miftah/.worktrees/run-insights/nina-chat-sessions
npm ci
ln -s /home/miftah/run-insights/.env.local .env.local    # .gitignore covers .env.* — never commit it
npm run db:generate -- --name nina_chat_sessions
```

That writes `drizzle/0004_nina_chat_sessions.sql`, `drizzle/meta/0004_snapshot.json` and the
`_journal.json` entry. **The snapshot is 60 KB of generated JSON and must never be hand-written**;
if `generate` cannot be run, this step is blocked rather than approximated.

**(b) Hand-edit.** Drizzle will emit the new column as a single

```sql
ALTER TABLE "nina_messages" ADD COLUMN "session_id" text NOT NULL;
```

which **fails on a populated table** — there is no default and every existing row would violate it.
Replace that one statement with add-nullable / backfill / `SET NOT NULL`, and leave every other
generated statement exactly as generated. The finished file, in full:

```sql
CREATE TABLE "nina_chat_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"title" text,
	"title_source" text,
	"pinned_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "nina_messages" ADD COLUMN "session_id" text;--> statement-breakpoint
ALTER TABLE "nina_chat_sessions" ADD CONSTRAINT "nina_chat_sessions_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "nina_chat_sessions_user_created_idx" ON "nina_chat_sessions" USING btree ("user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
-- F35 phase 1 backfill, hand-written: one session per user who has any message, its created_at set
-- to the first thing he ever said, so it sorts and reads as the old thing it is. The id is
-- substr(md5(user_id), 1, 12): 12 characters that satisfy lib/id.ts's ID_RE, so isValidId accepts
-- it in a ?s= parameter, and deterministic so the UPDATE below can recompute it without a join.
-- Deliberately NO "ON CONFLICT DO NOTHING": on an md5-prefix collision between two users, DO
-- NOTHING would file the second user's messages into the FIRST user's session, where removing that
-- session would cascade away a stranger's conversation. A unique violation aborts the migration
-- instead, and a failed migration is recoverable where a merged conversation is not.
INSERT INTO "nina_chat_sessions" ("id", "user_id", "title", "title_source", "created_at")
SELECT substr(md5("nina_messages"."user_id"), 1, 12),
       "nina_messages"."user_id",
       'Semua chat sebelumnya',
       'backfill',
       min("nina_messages"."sent_at")
FROM "nina_messages"
GROUP BY "nina_messages"."user_id";--> statement-breakpoint
-- No ORDER BY, and none is needed: every one of a user's rows goes into the same session and `seq`
-- is untouched, so "WHERE session_id = X ORDER BY seq" returns exactly the sequence the screen
-- renders today. The IS NULL guard makes this statement re-runnable by hand if it ever has to be.
UPDATE "nina_messages" SET "session_id" = substr(md5("user_id"), 1, 12) WHERE "session_id" IS NULL;--> statement-breakpoint
-- Now, and only now, the column can promise what the schema says it promises.
ALTER TABLE "nina_messages" ALTER COLUMN "session_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "nina_messages" ADD CONSTRAINT "nina_messages_session_id_nina_chat_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."nina_chat_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "nina_messages_session_seq_idx" ON "nina_messages" USING btree ("session_id","seq");--> statement-breakpoint
CREATE INDEX "nina_messages_user_session_runner_idx" ON "nina_messages" USING btree ("user_id","session_id","sent_at") WHERE "nina_messages"."role" = 'runner';
```

**(c) The journal entry**, if `generate` did not write it (it normally does):

```json
    {
      "idx": 4,
      "version": "7",
      "when": 1788600000000,
      "tag": "0004_nina_chat_sessions",
      "breakpoints": true
    }
```

`when` must be greater than `0003`'s `1788514958267`; prefer whatever `drizzle-kit` stamped.

**Impact:** this is the only phase in the set that changes live data. `drizzle-kit migrate` connects
with the `pg` driver over `DATABASE_URL_UNPOOLED` and runs each migration file inside one
transaction, so either every statement above lands or none does — **verify that on a branch rather
than trusting this sentence** (Verification, below).

---

## Verification

**Setup** (the worktree carries neither dependency tree nor env file):

```bash
cd /home/miftah/.worktrees/run-insights/nina-chat-sessions
npm ci
ln -s /home/miftah/run-insights/.env.local .env.local
```

**Build / static gates:**

```bash
npm run db:generate -- --name nina_chat_sessions   # then hand-edit per step 12(b)
npm run db:check
npm run typecheck
npm run lint
npm run format:check
npm run ci:data-layer-guard        # reads lib/db/queries.ts only — must still pass untouched
npm run ci:llm-payload-guard       # phase 4 owns that file; this proves phase 1 did not touch it
```

**Tests:**

```bash
npm test
npx vitest run lib/nina/sessions.test.ts tests/db.schema.nina.test.ts
```

**The migration, against a copy of production** — this is the step that cannot be skipped:

```bash
# 1. Neon console: create a branch off production ("f35-0004-dryrun").
# 2. Point the worktree at it:
#      DATABASE_URL_UNPOOLED=<branch direct URL>   (edit a LOCAL copy of .env.local, not the symlink)
npm run db:migrate
```

Then, on that branch:

```sql
-- 0 rows, or the deploy loses a conversation. This is the exit criterion.
SELECT count(*) FROM nina_messages WHERE session_id IS NULL;

-- exactly one session per user who has messages, and no user with messages missing one
SELECT count(*) FROM nina_chat_sessions;
SELECT count(DISTINCT user_id) FROM nina_messages;

-- every message is in a session belonging to its own user (the md5-collision check, after the fact)
SELECT count(*) FROM nina_messages m
  JOIN nina_chat_sessions s ON s.id = m.session_id
 WHERE s.user_id <> m.user_id;   -- must be 0

-- R11's cascade, end to end, on a throwaway session
WITH victim AS (INSERT INTO nina_chat_sessions (id, user_id) SELECT 'zzzzzzzzzzzz', id FROM "user" LIMIT 1 RETURNING id)
SELECT id FROM victim;
-- …insert a message and an image row against it, then:
DELETE FROM nina_chat_sessions WHERE id = 'zzzzzzzzzzzz';
SELECT count(*) FROM nina_messages WHERE session_id = 'zzzzzzzzzzzz';                    -- 0
SELECT count(*) FROM nina_message_images i LEFT JOIN nina_messages m ON m.id = i.message_id
 WHERE m.id IS NULL;                                                                     -- 0

-- the index the sidebar's aggregate must not miss
EXPLAIN SELECT session_id, max(sent_at) FROM nina_messages
 WHERE user_id = '<a real id>' AND role = 'runner' GROUP BY session_id;
-- expect an Index Only Scan on nina_messages_user_session_runner_idx
```

**Manual check:** with the migration applied to the dry-run branch and the code from this phase,
`/nina` must render **exactly** as it does today — same messages, same order, same unread dot. Every
read still omits the session predicate, so any visible difference means a widened signature changed
behaviour it was not supposed to.

**Exit criteria:**

1. `npm run db:check` passes and `drizzle/meta/_journal.json` has an `idx: 4` entry.
2. `SELECT count(*) FROM nina_messages WHERE session_id IS NULL` is `0` on the dry-run branch, and
   no message sits in a session belonging to another user.
3. Deleting a session row leaves no orphaned `nina_messages` and no orphaned `nina_message_images`
   (R11).
4. `orderNinaSessions` returns pinned-first then most-recent-user-message-descending, and
   `mostRecentNinaSession` ignores the pin — both asserted by `lib/nina/sessions.test.ts`.
5. `npm run typecheck`, `lint`, `format:check`, `test` and every `ci:*-guard` pass **with no call
   site changed anywhere in the repo** (`git diff --name-only` touches only the eight files in the
   Files table).

## Handoffs

- **Phase 3 makes three parameters required** — `listNinaMessages`'s `opts.sessionId`,
  `getNinaMessageWindow`'s `sessionId`, `insertNinaMessages`'s `sessionId` — and deletes
  `ensureNinaSession`'s use as an implicit fallback inside `insertNinaMessages`. `ensureNinaSession`
  itself stays: `proactive.ts` and `imagejobs.ts` need it explicitly (assumption A3), and phase 3
  should call it there rather than passing `undefined`.
- **Phase 3 must resolve the active session with `mostRecentNinaSession`, never
  `listNinaSessions(...)[0]`.** The display list is pinned-first, so the top row can be a stale
  session he pinned. Same warning for phase 8's "the most recent chat".
- **Phase 3's R11 edge cases are answered by this layer but decided there.**
  `removeNinaSession` returns `false` for a foreign or already-gone id, and
  `ensureNinaSession` creates a session when he has none — which is what makes "he removed his last
  session" survivable for both the screen and the cron.
- **Phase 4 must call `setNinaSessionTitleIfUntitled`**, written in step 9. Its `title IS NULL`
  predicate is the idempotence phase 4's decision list asks for; a read-then-write in `title.ts`
  would reintroduce the race. Phase 4 must also import `NINA_SESSION_TITLE_MAX_CHARS` from
  `lib/nina/sessions.ts` rather than declaring a second cap — **reconciled: this is the set's one
  cap, at 60, and phase 4's `title.ts` imports it** — and must treat
  `title_source = 'backfill'` exactly as `'manual'` (both are non-NULL titles, so the query already
  refuses them).
- **Phase 5 renders `sessionTitleFor(session)`**, never `session.title` — a NULL title is the normal
  state of a session he just made. `countNinaSessionMessages` exists for its delete confirmation.
- **Phase 7 writes `updateNinaMessage` and `deleteNinaMessage` into `queries.ts` §4c**, at the seam
  the comment in step 10 marks. Phase 7 must **not** add a `last_user_message_at` maintenance write:
  that column does not exist, on purpose, and D3 above is the reason.
- **Phase 6's search needs a cross-session read of `nina_messages`, and this phase does not write
  it.** Once phase 3 makes the session parameter required there is no "search every session" read in
  `queries.ts`. Phase 6's own `lib/nina/search.ts` is where the plan index puts the predicate; if the
  reconciler would rather that statement live in `queries.ts` §4b, it is a new function
  (`searchNinaMessages(userId, …)`) and not a re-widening of `listNinaMessages`, whose session
  parameter phase 3 has by then made required for a reason.
- **Blob reaping stays out of scope.** `removeNinaSession` and `deleteNinaMessage` both orphan
  `nina/`-prefixed objects. The `reap-orphaned-blobs` skill covers `shots/` only; widening it is its
  own card.

## Rollback

**The code, alone.** `git revert <phase-1 commit>` (or `git revert -m 1 <merge>` after the set
merges). That restores the five message signatures and removes the session statements. The database
keeps `nina_chat_sessions` and `nina_messages.session_id`, which is harmless: the reverted
`insertNinaMessages` would then fail on the `NOT NULL`, so **a code-only revert of this phase must
also drop the column** — see below — or nothing can write a message.

**The database.** Only while phases 3-9 are all reverted, and never after production has written a
second session:

```sql
DROP INDEX IF EXISTS nina_messages_user_session_runner_idx;
DROP INDEX IF EXISTS nina_messages_session_seq_idx;
ALTER TABLE nina_messages DROP CONSTRAINT IF EXISTS nina_messages_session_id_nina_chat_sessions_id_fk;
ALTER TABLE nina_messages DROP COLUMN IF EXISTS session_id;
DROP TABLE IF EXISTS nina_chat_sessions;
```

Then remove `drizzle/0004_nina_chat_sessions.sql`, `drizzle/meta/0004_snapshot.json` and the `idx: 4`
entry from `_journal.json`, so the next `generate` diffs against `0003` again.

**Why the ordering matters, in the plan index's own words:** dropping `session_id` after a second
session exists merges every session back into one conversation. The messages survive; the
organisation does not, and nothing can reconstruct it. Once phase 3 has shipped to production, treat
this migration as forward-only.
