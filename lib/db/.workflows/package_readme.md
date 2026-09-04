# Package: db

**Location**: `lib/db`
**Last Updated**: 2026-09-05

## Overview

`lib/db` is the entire persistence layer of Run Insights: one Drizzle client (`index.ts`), the
whole Postgres schema in one file (`schema.ts`), and every read and write the run-tracking
application performs (`queries.ts`). Nothing above it opens a connection, and there is no
repository layer, DAO or second client beneath it.

It is a *declaration-plus-access* package with one deliberate asymmetry worth knowing before you
go looking for a function: `schema.ts` declares tables for the whole product, including features
whose queries live elsewhere, while `queries.ts` covers only the run / extraction / insight /
share domain. Nina's reads and writes live in `lib/nina/queries.ts` against tables declared here —
`lib/db/queries.ts` touches no `nina_*` table at all.

**Key Responsibilities:**

- Own the single `neon-http` Drizzle instance, cached on `globalThis`, plus the `Database` type.
- Declare every table, column, index, constraint and row type in one authoritative file.
- Enforce two application-wide invariants in SQL rather than in caller code: userId scoping and
  the reviewed-data gate.
- Express correctness invariants as Postgres constraints — partial and total unique indexes,
  composite natural keys, cascading FKs — so an illegal state is impossible rather than unlikely.

## Exported API

### `index.ts` — the client

```ts
export type Database = NeonHttpDatabase<typeof schema>
export const db: Database
export { schema }
export * from './schema'
```

`db` is constructed eagerly at module load. `neon()` performs no I/O at construction, so a missing
`DATABASE_URL` is a loud boot crash rather than an `undefined` that fails on the first production
query. The instance is memoised on `globalThis.__runInsightsDb`, which serves two purposes: Next's
dev-mode module reloading does not accumulate clients, and a test can install a recording fake by
seeding that key before the first import.

Two deliberate choices are documented in the file and both are load-bearing:

- **`neon-http`, therefore `db.batch` and never `db.transaction`.** `db.transaction()` *throws* on
  this driver ("No transactions support in neon-http driver"). `db.batch([...])` sends the array as
  one HTTP request that Postgres runs in one transaction — the atomicity every multi-statement
  write needs, plus one round trip instead of N.
- **`process.env.DATABASE_URL` is read directly, not through `lib/env.ts`.** `lib/env.ts` opens
  with `import 'server-only'`, which throws outside a React Server Components graph; routing the
  client through it would take every unit test down and make the module unimportable from the
  non-Next callers (`drizzle-kit`, `scripts/*.mjs`). `lib/env.ts` still validates the same
  variable at boot for the app.

The URL must be the **pooled** one (`-pooler` in the host). `DATABASE_URL_UNPOOLED` is for
`drizzle-kit` only and is read by `drizzle.config.ts`, never here.

### `schema.ts` — the whole database

`ROADMAP_v0.1.0.md` §4.3 is authoritative for every column; `RECONCILIATION_v0.1.0.md` amends it in
six places and each amendment is marked with its ruling (R-1, R-5, R-7, R-8, R-9, R-11, R-12,
R-22). Where this file and a feature plan disagree, the roadmap-plus-reconciliation pair wins.

#### Table inventory

| Variable | SQL table | Purpose | Indexes / constraints |
|---|---|---|---|
| `users` | `user` | Auth.js user row, adapter shape unmodified | `email` unique (implicit) |
| `accounts` | `account` | Auth.js OAuth/OIDC linked account | PK `(provider, providerAccountId)` |
| `sessions` | `session` | Auth.js session | PK `sessionToken` |
| `verificationTokens` | `verificationToken` | Auth.js email verification token | PK `(identifier, token)` |
| `profiles` | `profiles` | The one runner's measured/derived facts | PK `user_id` |
| `extractions` | `extractions` | Immutable audit record of one vision-model call | `extractions_user_created_idx` |
| `runs` | `runs` | One committed run — the core fact table | `runs_user_occurred_started_unq`, `runs_user_occurred_idx`, `runs_user_maxhr_idx` |
| `runSplits` | `run_splits` | Per-km split for a run | PK `(run_id, km)` |
| `runZones` | `run_zones` | Per-HR-zone duration for a run | PK `(run_id, zone)` |
| `runPhotos` | `run_photos` | Mutable photo lifecycle for a run's screenshots | `run_photos_extraction_idx`, `run_photos_run_idx` |
| `insights` | `insights` | Fact-hash-keyed cached narrative insight | `insights_user_scope_key_hash_unq`, `insights_latest_idx` |
| `records` | `records` | Current personal-best value per record key | PK `(user_id, key)` |
| `badges` | `badges` | Append-only badge award ledger | PK `(user_id, key, dedupe_key)`, `badges_user_run_idx` |
| `shares` | `shares` | Public share-page credential for a run | PK `token`, `shares_run_id_active_unq` (partial) |
| `ninaTurns` | `nina_turns` | Audit/job row for every Nina model call | `nina_turns_user_created_idx` |
| `ninaChatSessions` | `nina_chat_sessions` | The conversation's partition — one row per topic he started | `nina_chat_sessions_user_created_idx` |
| `ninaMessages` | `nina_messages` | One bubble of the runner↔Nina conversation | `nina_messages_user_seq_idx`, `nina_messages_user_unread_idx` (partial), `nina_messages_reply_to_idx`, `nina_messages_user_run_idx`, `nina_messages_session_seq_idx`, `nina_messages_user_session_runner_idx` (partial) |
| `ninaMessageImages` | `nina_message_images` | One image attached to a message | `nina_message_images_message_idx`, `nina_message_images_user_created_idx` |
| `ninaMemorySlots` | `nina_memory_slots` | Upserted "current fact" memory slot | PK `(user_id, key)` |
| `ninaMemoryFacts` | `nina_memory_facts` | Append-only "what he has told me" ledger | `nina_memory_facts_user_created_idx` |
| `ninaNags` | `nina_nags` | Escalation-ladder state per nag code | PK `(user_id, code)` |
| `ninaAvatars` | `nina_avatars` | Nina's photo album: folder, crop transform, thumbnail, dedupe key | `nina_avatars_user_current_unq` (partial), `nina_avatars_user_created_idx`, `nina_avatars_user_folder_created_idx`, `nina_avatars_user_source_key_unq` |
| `ninaFolders` | `nina_folders` | Asserts a folder exists even when empty | PK `(user_id, folder)` |
| `pushSubscriptions` | `push_subscriptions` | Web Push subscription per browser endpoint | `push_subscriptions_endpoint_unq`, `push_subscriptions_user_idx` |

#### Schema-wide conventions

**Integers in the smallest sensible unit** (roadmap D5). Distance is metres, duration and pace are
seconds, money is millionths of a dollar (`nina_turns.cost_micro_usd`), confidence is an integer
percent, crop offsets are per-mille of frame width. Floats summed over a month drift visibly;
integers do not. Two declared exceptions: `profiles.weight_kg` is `numeric(4,1)`, the single
non-integer *measured* value, and `nina_avatars.crop_scale` is `numeric(5,3)` because a zoom factor
is a display transform rather than a measurement.

**`runs.reviewed_at IS NOT NULL` gates every aggregate** (roadmap D16 / R-13). The column is
declared here; the filter is enforced in `queries.ts` and asserted by
`tests/db.queries.reviewedOnly.test.ts`.

**IDs** are `text` primary keys filled by nanoid helpers from `lib/id.ts` — nanoid(12) as the norm,
nanoid(16) for `shares.token`. `users.id` uses `crypto.randomUUID()` because that is the adapter's
convention. `nina_messages.seq` is the one ordering column that is not an id: a `bigserial`,
because `defaultNow()` inside a single batch returns the same instant for every insert in it, so a
timestamp cannot express emission order. One id in the database is not minted by `lib/id.ts` at
all: migration `0004` derives the backfilled session's id as `substr(md5(user_id),1,12)`, twelve
characters chosen to satisfy `ID_RE` so `isValidId` accepts it in a `?s=` parameter, and
deterministic so a later statement can recompute it without a join.

**Timestamps** are `timestamp(col, { withTimezone: true, mode: 'date' })`, usually
`.notNull().defaultNow()`, with `.$onUpdate(() => new Date())` where mutable. Calendar days are
`date(col, { mode: 'string' })` and are Asia/Jakarta days (roadmap D6), never a JS `Date`.
Clock-time-without-date uses `time()` and compares as a string. The Auth.js columns deliberately
omit `withTimezone`, consistent with keeping that block verbatim.

**No `pgEnum` anywhere.** Constrained columns are `text().$type<Union>()`, so adding a member is a
TypeScript change and not a migration. The unions are exported alongside the tables:
`AdapterAccountType`, `Sex`, `ExtractionStatus`, `PhotoKind`, `RunIntent`, `RunSource`,
`InsightScope`, `NinaTurnKind`, `NinaTurnStatus`, `NinaRole`, `NinaMessageSource`, `NinaImageKind`,
`NinaMemorySource`, `NinaPromiseMetric`, `NinaFactCategory`, `NinaAvatarSource`,
`NinaSessionTitleSource`. `badges.key`,
`records.key` and `nina_turns.trigger`/`error_code` are left as plain `text` pointing at an
external catalog, for the same "adding a member is not a migration" reason taken one step further.

**Cascade is the default for ownership FKs**, with two documented exceptions: `badges.run_id` is
`set null` (R-22 — "a badge is a fact about the past; deleting the run that earned it must not
delete the history that it happened"), and `nina_messages.reply_to_id` / `run_id` are `set null` so
a deleted parent degrades a quote bubble or run card instead of deleting conversation.
`nina_messages.turn_id` carries **no** FK at all, because an audit pointer must not be able to block
a delete. One cascade is not a default but a stated requirement: `nina_messages.session_id` →
`nina_chat_sessions.id`, which chains through `nina_message_images.message_id` so removing a session
takes its messages and their image rows in one `DELETE`.

**Unique indexes are how invariants are enforced.** `shares_run_id_active_unq` (partial, `where
revoked_at is null`) is the stated precedent, and later tables cite it by name: the alternative to a
constraint is a read-then-compare that is correct until two writers race.

| Index | Table | Columns | Partial |
|---|---|---|---|
| `runs_user_occurred_started_unq` | `runs` | `user_id, occurred_on, coalesce(started_at,'00:00:00')` | no — `coalesce` closes the NULL-distinctness hole |
| `insights_user_scope_key_hash_unq` | `insights` | `user_id, scope, scope_key, facts_hash` | no |
| `shares_run_id_active_unq` | `shares` | `run_id` | yes — `where revoked_at is null` |
| `nina_avatars_user_current_unq` | `nina_avatars` | `user_id` | yes — `where is_current` |
| `nina_avatars_user_source_key_unq` | `nina_avatars` | `user_id, source_key` | no — relies on NULLs being distinct |
| `push_subscriptions_endpoint_unq` | `push_subscriptions` | `endpoint` | no |

**Composite natural keys instead of a surrogate id**, where the key is also the whole access
pattern (a leading-column scan answers "all X for this user", so no secondary index earns its
place): `run_splits`, `run_zones`, `records`, `badges`, `nina_memory_slots`, `nina_nags`,
`nina_folders`, plus the two Auth.js adapter tables.

**jsonb** carries payloads whose shape is not the database's business: `extractions.blob_urls`
(`ExtractionBlobUrls`), `extractions.raw_response` (`unknown`, never mutated),
`extractions.corrections` (`ExtractionCorrections`), `insights.payload`, `nina_turns.args`
(untyped on purpose, so adding a job field is not a migration) and `nina_memory_slots.value`
(`NinaSlotValue`).

#### Row types

Every table re-exports its inferred types — `User`, `Profile`/`NewProfile`, `Run`/`NewRun`,
`NinaAvatar`/`NewNinaAvatar`, `NinaFolder`/`NewNinaFolder`, and so on. Import these rather than
re-deriving `$inferSelect` at a call site. One naming carve-out: the push row is
`PushSubscriptionRow`, not `PushSubscription`, because the latter is a DOM lib global that client
code uses by that exact name.

### `queries.ts` — every run-domain read and write

Two invariants govern the file:

**1. The userId-scoping invariant (roadmap D8).** Every exported function takes `userId` as its
first parameter and that value appears in the `WHERE` of every statement it runs. There is exactly
one exception — `getRunByShareToken`, unscoped by contract because the 96-bit token *is* the
credential. Never add a second. `userId` must come from the session (`requireUserId()`), never from
a Server Action argument, a form field or a URL segment. A row that exists but is not yours and a
row that does not exist are the same outcome (`NotFoundError` → 404); distinguishing them is an
id-enumeration oracle.

**2. The reviewed-data invariant (roadmap D16 / R-13).** Every rollup, list, chart input, record
input and badge input filters `runs.reviewed_at IS NOT NULL`. The split between draft-visible and
reviewed-only reads is a contract, and `tests/db.queries.reviewedOnly.test.ts` asserts it function
by function — because the failure mode, a missing filter on the eleventh query, is silent and
produces a plausible wrong number.

The module is organised in numbered sections:

| § | Contents |
|---|---|
| 1 | Errors — `NotFoundError`, `DuplicateRunError`, `isUniqueViolation` |
| 2 | Batch plumbing — the single `runBatch` cast |
| 3 | Ownership predicates — `runSplitOwnedBy`, `runZoneOwnedBy`, `runPhotoOwnedBy`, `assertRunOwned`, `assertExtractionOwned` |
| 4 | Runs — the review commit, the duplicate guard, reads, corrections |
| 5 | Rollups — all reviewed-only, all range-scanned |
| 5b | The three badge reads |
| 6 | Extractions — append-only (D3) |
| 7 | Photos — R-1's two-parent lifecycle |
| 8 | Profile, insights, records, badges, shares |
| 9 | The one unscoped read (`getRunByShareToken`) |

#### Errors

```ts
export class NotFoundError extends Error   // code: 'NOT_FOUND'
export class DuplicateRunError extends Error // code: 'DUPLICATE_RUN', carries existingRunId
export function isUniqueViolation(err: unknown): boolean
```

`isUniqueViolation` walks `err.code` / `.cause` / `.sourceError` looking for SQLSTATE `23505`,
because Neon surfaces it on `err.code` but some wrappers nest it. `DuplicateRunError.existingRunId`
is looked up *after* the index has already refused the insert, purely so the UI can link to the run
the user already has — never check-then-insert, since two tabs committing the same extraction would
race through the check and the index cannot race itself.

#### Ownership predicates — the security primitive

`run_splits`, `run_zones` and `run_photos` carry no `user_id`: the composite natural key is the
point of those tables, and duplicating the owner into them would be a second source of truth that
can drift. Ownership is proved by a correlated `EXISTS` back to `runs` **in the same statement**, so
there is no window between the check and the write. `runPhotoOwnedBy` is the two-parent case — a
photo may be owned through its extraction (before the review commit) or its run (after), so it is
"mine" if either parent claims it, and unreachable otherwise.

`assertRunOwned` / `assertExtractionOwned` are proof-before-write for any mutation touching a child
table. They throw; they never return `false`.

## Internal Architecture

### Data flow

**Entry** — a Server Component, Server Action or route handler calls an exported function from
`queries.ts` with a session-derived `userId`. Nina's surfaces instead call `lib/nina/queries.ts`,
which imports `db` and the `nina_*` tables from here directly.

**Processing** — the function builds one or more Drizzle statements, always with `userId` in the
`WHERE`. A single-statement read is awaited directly; anything multi-statement goes through
`runBatch`, which is the one place the non-empty-tuple cast `db.batch` requires lives, and which
treats an empty list as a no-op so callers need no `if (statements.length)`.

**Exit** — plain row objects and the exported `interface`s (`RunDetail`, `RunWithPhotoCount`,
`MonthlyTotal`, `AllTimeTotals`, `SharedRun`, `RunAttachmentRow`, …). No ORM entity, no lazy
relation and no live handle escapes the package, so a caller cannot accidentally issue a query by
touching a property.

Relations are declared for most tables but the sanctioned read path is explicit selects inside
`db.batch` (see `getRunDetail`) — one HTTP round trip and one snapshot. The `relations()` blocks
cost nothing at runtime and keep `db.query.*` available if a later feature wants a relational read.

## Dependencies

### External

- `@neondatabase/serverless` — the `neon()` HTTP driver for Neon Postgres.
- `drizzle-orm` — schema builders (`drizzle-orm/pg-core`), the query builder, `relations`, the
  `sql` template tag, and `drizzle-orm/neon-http` for the client. `drizzle-orm/batch`'s `BatchItem`
  types the statement list.

### Internal

- `@/lib/id` — `newExtractionId`, `newInsightId`, `newPhotoId`, `newRunId`, `newShareToken`.
- `@/lib/date/ranges` — `addMonths`, `isoWeekRange`, `monthRange` and the `DateISO`, `IsoWeekKey`,
  `MonthKey` key types that the rollup functions take.

Notably **not** a dependency: `@/lib/env`. See the client notes above.

## Reverse Dependencies

68 files import from this package, all through the `@/lib/db*` alias — there is not one relative
import of it anywhere. 54 are source files, 14 are tests.

### Primary consumers

- **`lib/nina/queries.ts`** — the heaviest consumer in the repo, and architecturally the most
  important: it imports `db` itself plus ten tables and ten union types, and it is the **only**
  production file that imports `ninaAvatars`, `ninaFolders` or `ninaChatSessions`. It is the choke
  point for all avatar, folder and session access — the session statements are its §4a, and the pure
  ordering rules they feed are `lib/nina/sessions.ts`, which imports nothing from this package at
  all. Every other avatar-touching file
  (`lib/admin/ninaAlbumActions.ts`, `app/admin/page.tsx`, `lib/nina/album.ts`, `avatargen.ts`,
  `avatartools.ts`, `proactive.ts`, `imagegen.ts`) calls its exported functions rather than
  reaching for a table.
- **`lib/nina/*`** (`gateway`, `load`, `distill`, `memory`, `promises`, `actions`, `context`,
  `tools`) — heavy consumers of the run-domain rollups (`getAllTimeTotals`,
  `getReviewedRunsWithChildren`, `getReviewedRunWindow`, `getBadgeAwards`, `getRecords`,
  `getRunsBetween`, `listRunAttachments`) plus memory-slot types.
- **`lib/review/*`** — the review/commit pipeline: `commitExtractedRun`, `applyRunCorrections`,
  `recordCorrections`, both error classes, and the extraction types.
- **`lib/badges/gateway.ts`**, **`lib/insights/load.ts`**, **`lib/records/gateway.ts`** — the
  derived-data layers, all on reviewed-only reads.
- **`app/api/*` and `app/*/page.tsx`** — route handlers and Server Components calling named
  functions (`listActiveUserIds` in cron, `createExtraction`/`attachExtractionPhotos` in extract,
  `getProfile`/`listRunsWithPhotoCounts`/`getAllTimeTotals`/`getRecords`/`getLatestInsight` in
  pages).
- **`app/actions/share.ts`, `app/r/[id]/page.tsx`, `lib/share/*`** — the share flow, including the
  one unscoped read.

### Secondary consumers

Roughly a dozen files import one or two symbols, almost always a row type or union for prop
typing: `components/profile/ProfileForm.tsx` (`SEX_VALUES`, `Sex`), `components/runs/IntentChips.tsx`
(`RunIntent`), `components/review/RetryExtraction.tsx` (`ExtractionBlobRefRow`),
`components/admin/MemorySlots.tsx` (`NinaPendingPromise`), `lib/derived/invalidate.ts`,
`lib/llm/*`, `lib/metrics/hrMax.ts`, `lib/profile/*`, `lib/runs/actions.ts`.

### Test consumers

Thirteen files under `tests/` plus `lib/nina/promise.test.ts`. The notable ones:
`tests/db.schema.test.ts` and `tests/db.schema.nina.test.ts` assert on the schema *objects*
themselves — table names, column names and SQL types, index names, FK on-delete behaviour — via
`getTableConfig`, with no database involved. `tests/support/fakeDb.ts` builds the recording fake
that the wider suite uses. `tests/db.client.test.ts` asserts that `@/lib/db` re-exports the schema.

### Two facts worth knowing

**Direct `db` use outside this package is the exception.** Only five files import the instance:
`auth.ts` (the NextAuth adapter tables), `lib/admin/users.ts`, `lib/push/queries.ts`,
`lib/nina/imagejobs.ts` and `lib/nina/queries.ts`. Everything else — 50-plus files — calls named
functions. The four small cases are self-contained query modules that did not warrant their own
indirection; `lib/nina/queries.ts` *is* that indirection for the Nina subsystem.

**`scripts/` imports nothing from here.** Every script that touches Postgres (`db-smoke.mjs`, the
two backfills, `nina-profpic.mjs`, `nina-image-worker.ts`, `blob-reap.mjs`, the probes and capture
helpers) instantiates `neon()` from `@neondatabase/serverless` directly, because it cannot resolve
the `@/` alias or tolerate `server-only`. `drizzle.config.ts` likewise does not import the package —
it names `'./lib/db/schema.ts'` as a config string. **A schema change is therefore not automatically
reflected in a script**, and a script writing a `nina_*` table is writing raw SQL that no type
checks.

`NinaAvatar`, `NewNinaAvatar`, `NinaFolder`, `NewNinaFolder`, `NinaChatSession` and
`NewNinaChatSession` currently have **no importers** —
callers pass around the shapes `lib/nina/queries.ts` returns instead. (The string `NinaAvatar` also
names an unrelated React component, `components/nina/NinaAvatar.tsx`; that is a coincidence, not an
import of the row type.)

## Concurrency

There is no in-process concurrency: no goroutine-equivalent, no worker, no lock, no shared mutable
state beyond the `globalThis` client cache. Every exported function is an independent `async`
function safe to call concurrently.

The concurrency that matters is **between requests**, and the package's answer is consistently to
push it into Postgres:

- Multi-statement writes are atomic because `db.batch` is one transaction. `db.transaction()` is
  unavailable on this driver, so a caller that needs atomicity must build a statement list rather
  than await sequentially.
- Races are settled by constraints, not by reads. The duplicate-run index, the partial
  `is_current` index and the `source_key` unique index all exist so that the losing writer gets a
  `23505` instead of both writers succeeding.
- The one ordering guarantee across concurrent inserts is `nina_messages.seq`, assigned by
  Postgres.

## Error Handling

Custom errors are `NotFoundError` and `DuplicateRunError`, both carrying a literal `code` so a
caller can discriminate without `instanceof` across a module boundary. Missing-or-not-yours
collapses to `NotFoundError` deliberately (see the scoping invariant). Constraint violations are
detected with `isUniqueViolation` rather than by string-matching a driver message. `index.ts`
throws a plain `Error` at module load if `DATABASE_URL` is absent. Nothing in the package panics
or calls `process.exit`, and no error is swallowed.

## Performance

- **One round trip per screen is the design goal.** Every multi-statement operation is a
  `db.batch`, because on an HTTP driver the round trip dominates. Two statements answering one
  screen's question is two chances to be inconsistent as well as twice the latency.
- **Every hot read has an index shaped for it**, and where two reads have two shapes they get two
  indexes rather than one compromise — `nina_avatars_user_created_idx` (whole album, newest first)
  and `nina_avatars_user_folder_created_idx` (one folder, newest first) coexist for exactly this
  reason.
- **Partial indexes keep the cost proportional to the hot subset**:
  `nina_messages_user_unread_idx` covers only unread Nina messages, which is a small slice of a
  table read on every page, and `nina_messages_user_session_runner_idx` holds only *his* half of the
  conversation. The latter also carries `sent_at` as a payload column purely so the session list's
  `max(sent_at)` aggregate is index-only rather than a heap fetch per runner message.
- **A derived sort key can be cheaper than a stored one.** The session list sorts by the most recent
  message from him, and that watermark is computed at read time instead of being kept in a column,
  because the column would have had four writers spread across three files. Spending an index on the
  aggregate buys the same read cost with no cache to keep honest.
- **One index, two jobs.** `nina_messages_session_seq_idx` leads with `session_id` rather than
  `user_id` because Postgres does not index the *referencing* side of a foreign key: the same index
  answers "this session's newest bubbles" and gives the cascading delete something better than a
  sequential scan of the whole conversation.
- **`insights` is a cache keyed by a fact hash**, so regenerating a narrative is skipped when the
  underlying facts have not changed.
- Records are recomputed wholesale rather than incremented (roadmap §4.5 / R-10), which trades a
  little work for immunity to drift after a correction.
- One read is knowingly *not* optimised: the avatar subtree scan (`folder` prefix match) cannot
  range-scan a b-tree under a non-C collation without `text_pattern_ops`, so it degrades to a
  `user_id` scan with a filter. Accepted deliberately — it runs once per dropped folder over a
  table sized in hundreds, and a second index would be maintained on every insert for a query that
  runs when a human drags something.

No benchmark files exist for this package. Correctness is covered by twelve suites:
`db.client.test.ts`, `db.ownership.test.ts`, `db.schema.test.ts`, `db.schema.nina.test.ts`, and
eight `db.queries.*.test.ts` files.

## Usage

### Initialization

None. Import `db` and use it; there is nothing to construct and nothing to close.

```ts
import { db, runs, type Run } from '@/lib/db'
```

### Common patterns

```ts
// A scoped read through queries.ts — the normal case.
const detail = await getRunDetail(userId, runId)   // null, never someone else's run

// Proof-before-write when touching a child table.
await assertRunOwned(userId, runId)

// A child-table write proving ownership inside the statement.
await db.delete(runSplits).where(and(eq(runSplits.runId, runId), runSplitOwnedBy(userId)))

// Distinguishing "already exists" from a real failure.
try { await commitExtractedRun(userId, input) }
catch (err) {
  if (err instanceof DuplicateRunError) return { existing: err.existingRunId }
  throw err
}
```

### Migrations

| Script | Effect |
|---|---|
| `npm run db:generate` | Diffs `schema.ts` against `drizzle/meta/` and emits a numbered `.sql` plus snapshot and journal entry |
| `npm run db:check` | Validates that the migration history and snapshots are internally consistent |
| `npm run db:migrate` | Applies pending `drizzle/*.sql` to the database |
| `npm run db:studio` | Drizzle Studio, a local DB browser |
| `npm run db:smoke` | Connectivity check against the pooled string |

Editing `schema.ts` is only half of a schema change: `npm run db:generate` must run in the same
commit, and `db:check` must be clean. `drizzle.config.ts` reads `DATABASE_URL_UNPOOLED` and
**throws if the host contains `-pooler`** — migrations run over Neon's direct connection, never the
pooled one. Its `schema` path is fixed at `./lib/db/schema.ts`; the file must not move. There is no
`db:push` script in this repo, by design: schema state is the migration history, not the current
contents of a database.

Generated is the norm but not the rule. `0004_nina_chat_sessions.sql` is the first migration here
that was generated and then **hand-edited**, because generation cannot express a backfill: drizzle
emits `ADD COLUMN … NOT NULL`, which simply fails on a populated table. The pattern, if a second one
is ever needed: add the column nullable, backfill it, then `SET NOT NULL`, and add the FK after the
rows are valid — all inside the file drizzle produced, so the snapshot it wrote still describes the
end state and `db:check` stays clean.

### Gotchas

- **`db.transaction()` throws.** Build a statement array and use `db.batch`.
- **Un-current before inserting.** `nina_avatars_user_current_unq` is violated *mid-transaction* by
  an insert-first ordering, so a writer must clear the old `is_current` row before inserting the
  new one, in one batch.
- **Never check-then-insert against a unique index.** Catch `23505` via `isUniqueViolation`; two
  tabs will race through any check.
- **Do not add a second unscoped read.** `getRunByShareToken` is the only one, and it is unscoped
  because the token is the credential.
- **Do not add an aggregate without the reviewed filter.** The failure is silent and looks like a
  plausible wrong number.
- **`folder = ''` is the album root**, not a missing value; the path grammar is slash-separated
  segments with no leading or trailing slash, so the root is the path with zero segments.
- **Neither folder source is authoritative.** `nina_avatars.folder` and `nina_folders` are UNIONed
  by `listNinaAvatarFolders`; nothing may read `nina_folders` alone, because a query trusting only
  those rows would hide every folder created by dropping one.
- **A thumbnail is two columns.** Recording `thumb_url` without `thumb_pathname` is how an album
  accumulates blob orphans that only a store listing can find.
- **`NOT NULL` cannot be added to a populated table in one statement.** A new required column is
  three statements and a backfill between them, in the migration file itself. See `0004`.
- **Removing a session is a hard delete, and the cascade stops at the database.** Messages and their
  `nina_message_images` rows go; the Vercel Blob objects behind those rows stay, and the
  `source_message_id` pointers in `nina_memory_slots` / `nina_memory_facts` are left dangling on
  purpose — her long-term memory is global, and a distilled fact outlives the sentence that produced
  it.
- **A session's `title` and `title_source` travel together.** Both NULL means nobody has named it
  yet, which is the only state an automatic titler may write into; `'backfill'` is not `'manual'`
  but must be treated as if it were.
- **Auth.js tables are verbatim.** Singular names and camelCase columns are the adapter's
  convention, which is why `drizzle()` is built *without* `casing: 'snake_case'` and every app
  table spells its snake_case names out explicitly.

## Notes

### Documentation created: 2026-09-04

Initial creation, prompted by task **P1-DB-A000** — phase 1 of 7 in
`ADMIN_ALBUM_FILE_MANAGER_PLAN.md`, the plan set that turns `/admin/nina` into a file manager
(F34 R1).

### Recent changes — P1-DB-A001 (2026-09-05)

Phase 1 of 9 in `NINA_CHAT_SESSIONS_PLAN.md`, the plan set that gives the Nina conversation
sessions. Within this package the task touched `schema.ts` and `drizzle/` only; the session
statements and the pure ordering rules it enables live in `lib/nina/queries.ts` (§4a) and
`lib/nina/sessions.ts`. Nothing on screen changed and no call site anywhere in the repo moved.

**New table `nina_chat_sessions`** — `id`, `user_id`, `title`, `title_source`, `pinned_at`,
`created_at`, cascading FK to `user`, and one index
`nina_chat_sessions_user_created_idx` on `(user_id, created_at desc)`, the
`nina_avatars_user_created_idx` shape. The point of the table is that it is *not* a UI feature: the
message window is what Nina is given to read on every turn, so without a partition column a new
session would look new and behave identically to the old one.

Three absences are decisions, and each is asserted by `tests/db.schema.nina.test.ts`:

- **No `last_user_message_at`.** Sessions sort by the most recent message *from him*, and a stored
  watermark would be `nina_folders`'s "cache with two writers" with four instead — his turn writes
  it, two proactive writers must remember not to, and a later phase's message delete would move it
  backwards from a file that does not own this table. The sort key is derived at read time and
  `nina_messages_user_session_runner_idx` pays for that.
- **No `archived_at`.** Removing a session is a hard delete, because an archived session that still
  answered the message-window read would defeat the point of removing it.
- **No `updated_at`.** Nothing reads it. `created_at` earns its place twice — the sort key of a
  session with no message yet, and the instant `0004` stamps from `min(sent_at)`.

`pinned_at` is an instant rather than an `is_pinned` boolean: NULL is unpinned so the column needs
no default, and storing *when* keeps one decision reversible without a migration — a pin currently
partitions the list rather than sorting it.

**New union `NinaSessionTitleSource`** = `'auto' | 'manual' | 'backfill'`, nullable and travelling
with `title`. NULL/NULL is the fourth and most important member: nobody has named this session yet.

**`nina_messages` gained `session_id`** — `text NOT NULL`, FK to `nina_chat_sessions.id`
**`ON DELETE CASCADE`**. `NOT NULL` rather than nullable-means-legacy so that a writer which forgets
a session fails loudly instead of writing a row that quietly stops appearing on his screen. Sessions
*slice* `seq`; they do not replace it, and there is no per-session sequence.

**Two new indexes on `nina_messages`**, taking it from four to six:

- `nina_messages_session_seq_idx` on `(session_id, seq)` — both the per-session slice and the
  foreign key's own index, `session_id` leading because Postgres does not index the referencing side
  of an FK and the cascade's lookup has no user in it. `nina_messages_user_seq_idx` still answers
  every user-wide read, so nothing is duplicated.
- `nina_messages_user_session_runner_idx` on `(user_id, session_id, sent_at)` **`where role =
  'runner'`** — the derived sort key, partial on `nina_messages_user_unread_idx`'s precedent and
  index-only because `sent_at` rides along as a payload column.

Also `ninaChatSessionsRelations`, a `session` relation on `ninaMessagesRelations`, and the row types
`NinaChatSession` / `NewNinaChatSession`.

**Migration `drizzle/0004_nina_chat_sessions.sql`** plus its meta snapshot and journal entry
(`idx: 4`). It is the first migration in this repo that is **not purely generated** — see the
Migrations note above for the pattern. It files every existing row into one session per user
(`id = substr(md5(user_id),1,12)`, `created_at = min(sent_at)`, title `'Semua chat sebelumnya'`,
`title_source = 'backfill'`) and carries **no `ON CONFLICT DO NOTHING`**, deliberately: on an
md5-prefix collision `DO NOTHING` would file the second user's messages into the first user's
session, where removing it would cascade away a stranger's conversation. A unique violation aborts
the migration instead, and a failed migration is recoverable where a merged conversation is not.

> **Verified, but NOT applied to production.** Applying `0004` is still an open deploy action
> (`npm run db:migrate`). It was run against a throwaway Postgres 16 holding a populated
> conversation, not merely generated: zero rows left with a NULL `session_id`, one session for every
> user who has messages and none for the user who has none, no message filed into another user's
> session, and deleting a session cascaded its messages and their `nina_message_images` rows with
> zero orphans. What the cascade leaves behind on purpose: the Blob objects behind the removed image
> rows, and the unenforced `source_message_id` pointers in `nina_memory_slots` /
> `nina_memory_facts`.

### Recent changes — P1-DB-A000 (2026-09-04)

Within this package the task touched `schema.ts` only; the folder-aware data layer it enables lives
in `lib/nina/queries.ts`.

**`nina_avatars` gained five columns**, taking it to twenty:

- `folder` — `NOT NULL DEFAULT ''`. Folder structure is *metadata, not blob layout*: pathnames keep
  the flat `nina/<userId>/avatar-<id>.<ext>` shape, so renaming a folder of three hundred photos is
  one `UPDATE` instead of three hundred cross-network copy-and-deletes. The `NOT NULL DEFAULT ''`
  pairing is the whole migration story — Postgres applies a constant default at `ADD COLUMN` time
  without rewriting the table, so every pre-F34 row appears at the root with no backfill. (Contrast
  `419167d`, which needed a script because a new `records` key changed what a derived table *should*
  hold; here there is nothing to derive, since "no folder" and "the root" are the same fact.)
- `filename` — the file's name on the laptop, from `File.webkitRelativePath`'s last segment.
  Nullable, because the three pre-F34 writers were handed bytes rather than a file.
- `source_key` — the client-computed dedupe key folding `(normalised relative path, size,
  lastModified)` into one string, so "have I uploaded this?" never becomes a content hash over
  hundreds of megabytes. Nullable, and that nullability is what made the new unique index safe to
  add to a populated table.
- `thumb_url`, `thumb_pathname` — a second, small blob written beside the original at upload time.
  Two columns and not one, because the pathname is the only thing that lets a delete remove both
  objects. Both NULL means no thumbnail and a renderer falls back to `blob_url`.

**Two new indexes on `nina_avatars`:**

- `nina_avatars_user_folder_created_idx` on `(user_id, folder, created_at desc)` makes the
  explorer's page an index range scan. It does *not* replace `nina_avatars_user_created_idx`, which
  stays because "the whole album, newest first" puts no equality on `folder`.
- `nina_avatars_user_source_key_unq` on `(user_id, source_key)` — UNIQUE and **non-partial**. The
  client-side upload diff is advisory (a double-clicked drop, a retried Server Action or two tabs
  all re-submit an approved batch), so the index makes the second insert impossible and the batch
  insert writes `ON CONFLICT (user_id, source_key) DO NOTHING`. It is non-partial and still safe on
  a populated table because Postgres treats NULLs as distinct by default: every pre-F34 row is
  exempt and only a row that actually claims a dedupe key is held to it. `NULLS NOT DISTINCT` would
  have failed on the second existing row.

**New table `nina_folders`** — three columns, composite primary key `(user_id, folder)`, cascading
FK to `user`. It holds exactly one fact: *this path is a folder, even if it is empty* — the one
thing the `folder` column cannot say, and the operator filing hundreds of photographs makes the
empty directory first. The composite key is what lets `declareNinaFolders` be an `ON CONFLICT DO
NOTHING` upsert rather than a racy read-then-insert, and it gives the subtree predicate an index to
walk. The root is never stored. There is no `blob_url`, no count and no `is_current`: a folder owns
no bytes, and a stored count would be a cache with two writers.

**Migration `drizzle/0003_nina_avatar_folders.sql`** plus its meta snapshot and journal entry.
Additive only — one `CREATE TABLE`, five `ADD COLUMN`, one `ADD CONSTRAINT`, one `CREATE INDEX`,
one `CREATE UNIQUE INDEX`. Nothing drops, renames, retypes or narrows anything, and there is no
data-migration statement.

> **Not yet applied to any database.** `db:check` is clean and the journal lists
> `0003_nina_avatar_folders` as idx 3, but applying it is a deploy action (`npm run db:migrate`).
> The phase's verification check 5 — the `nina_folders` UNION probe against a live database — must
> run at deploy time.

`is_current` still has exactly three writers, all in `lib/nina/queries.ts`.
