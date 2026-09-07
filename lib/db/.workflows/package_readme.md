# Package: db

**Location**: `lib/db`
**Last Updated**: 2026-09-07

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
| `ninaMessageImages` | `nina_message_images` | One image attached to a message, plus where its bytes came from | `nina_message_images_message_idx`, `nina_message_images_user_created_idx` |
| `ninaMemorySlots` | `nina_memory_slots` | Upserted "current fact" memory slot | PK `(user_id, key)` |
| `ninaMemoryFacts` | `nina_memory_facts` | Append-only "what he has told me" ledger | `nina_memory_facts_user_created_idx` |
| `ninaShortcuts` | `nina_shortcuts` | The trigger registry — one emoji or short token standing for a long directive he wrote once | `nina_shortcuts_user_match_unq`, `nina_shortcuts_user_enabled_idx` |
| `ninaNags` | `nina_nags` | Escalation-ladder state per nag code | PK `(user_id, code)` |
| `ninaAvatars` | `nina_avatars` | Nina's photo album: folder, crop transform, thumbnail, dedupe key | `nina_avatars_user_current_unq` (partial), `nina_avatars_user_created_idx`, `nina_avatars_user_folder_created_idx`, `nina_avatars_user_source_key_unq` |
| `ninaFolders` | `nina_folders` | Asserts a folder exists even when empty | PK `(user_id, folder)` |
| `ninaTuning` | `nina_tuning` | Nina's per-user character: twelve trait dials, the relationship, the four extra dials, seventeen enable flags and a notes field, plus a revision | PK `user_id` |
| `ninaImagePrefs` | `nina_image_prefs` | How she is photographed: the prompt-length slider, six focus flags, four lines of free text, the chosen photo reference, plus a revision | PK `user_id` |
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
`NinaSessionTitleSource`. `badges.key`, `records.key`, `nina_turns.trigger`/`error_code`,
`nina_shortcuts.kind`, `nina_tuning.relationship` and `nina_image_prefs.reference_source` are left
as plain `text` pointing at an external catalog, for the same "adding a member is not a migration"
reason taken one step further — `relationship`'s catalog is `NINA_RELATIONSHIPS` in
`lib/nina/tuning.ts`, and a sixth relationship is a one-line edit there rather than a migration
here. The other two are the same shape with a second, harder reason on top: their catalogs live in
modules that **must** stay importable from a `'use client'` component (and, for
`NinaShortcutKind` in `lib/nina/shortcuts.ts`, from a `.mjs` script), so neither can import this
file — and `.$type<>()` here would mean either importing upward from `lib/db` into `lib/nina` or
restating the union as a second definition. `reference_source` is `'none' | 'album' | 'chat'`,
catalogued as `NINA_IMAGE_REFERENCE_SOURCES` in `lib/nina/imageprefs.ts`. For `kind` the narrowing
happens on read in `lib/nina/queries.ts`, where an unrecognised value is re-derived rather than
rejected. Their neighbours `nina_tuning.notes` and `nina_image_prefs.wardrobe` / `.venue` /
`.time_of_day` / `.notes` are not catalog pointers at all: they are free operator text, `NOT NULL`
with `''` as the empty value, because "no override" and "not set" are the same fact.
(`nina_tuning.wardrobe` was one of them until F41 R3 moved the wardrobe to `nina_image_prefs`,
where it is free operator text on exactly the same terms.)

**Cascade is the default for ownership FKs**, with three documented exceptions: `badges.run_id` is
`set null` (R-22 — "a badge is a fact about the past; deleting the run that earned it must not
delete the history that it happened"), `nina_messages.reply_to_id` / `run_id` are `set null` so
a deleted parent degrades a quote bubble or run card instead of deleting conversation, and
`nina_message_images.source_avatar_id` / `source_image_id` are `set null` so deleting the original
photograph leaves the copy holding the picture rather than losing it (F37 — see the P1-DB-A003 note).
`nina_messages.turn_id` carries **no** FK at all, because an audit pointer must not be able to block
a delete, and `nina_image_prefs.reference_source` / `reference_id` carry none either — the chosen
photograph lives in `nina_avatars` *or* `nina_message_images`, and no single foreign key can point
at one of two tables. Nor would one be wanted: a cascade would delete a whole preferences row
because one photograph was deleted. `resolveNinaPhotoReference` in `lib/nina/queries.ts` is where a
dangling id becomes `null` and the generation degrades to unanchored. One cascade is not a default
but a stated requirement: `nina_messages.session_id` →
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
| `nina_shortcuts_user_match_unq` | `nina_shortcuts` | `user_id, match_key` | no — the key is `NOT NULL` and derived, so there is no NULL to be distinct |
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
re-deriving `$inferSelect` at a call site. Four naming carve-outs, all `…Row`-suffixed. The push
row is `PushSubscriptionRow`, not `PushSubscription`, because the latter is a DOM lib global that
client code uses by that exact name. `NinaTuningRow` and `NinaImagePrefsRow` are suffixed because
`NinaTuning` and `NinaImagePrefs` are the *model* types in `lib/nina/tuning.ts` and
`lib/nina/imageprefs.ts` — nested and coerced, and what every consumer actually holds; the flat,
unvalidated storage shapes should be named only by `lib/nina/queries.ts`. `NinaShortcutRow` /
`NewNinaShortcutRow` carry the suffix for the same reason — the raw row is not the shape callers
want, because `kind` is bare `string` here. That table has **three** names across three layers and
no duplication: `NinaShortcutRow` (this file, the drizzle row), `NinaShortcutRecord`
(`lib/nina/queries.ts`, the same fields with `kind` narrowed to the union), and
`NinaShortcutMatchable` (`lib/nina/shortcuts.ts`, the structural minimum the matcher needs — a
subset the record satisfies with no mapping step).

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
  important: it imports `db` itself plus eleven tables and ten union types, and it is the **only**
  production file that imports `ninaAvatars`, `ninaFolders`, `ninaChatSessions`, `ninaShortcuts` or
  `ninaImagePrefs`. It is the choke point for all avatar, folder, session, shortcut and
  image-prefs access — the session statements are its §4a, and the pure
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

`NinaAvatar`, `NewNinaAvatar`, `NinaFolder`, `NewNinaFolder`, `NinaChatSession`,
`NewNinaChatSession`, `NinaShortcutRow` and `NewNinaShortcutRow` currently have **no importers** —
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
emits `ADD COLUMN … NOT NULL`, which simply fails on a populated table. The pattern: add the column
nullable, backfill it, then `SET NOT NULL`, and add the FK after the rows are valid — all inside the
file drizzle produced, so the snapshot it wrote still describes the end state and `db:check` stays
clean.

`0009_nina_message_photo_only.sql` and `0010_nina_image_provenance.sql` follow the same arrangement
for the other reason a backfill is needed — a new *nullable* column whose meaning is retroactive, so
production's existing rows have to be marked. `0011_natural_nico_minoru.sql` is the third reason: a
brand-new table whose data step **moves** a column out of another table (`nina_tuning.wardrobe` →
`nina_image_prefs.wardrobe`), and the copy has to live in the migration that creates the destination
rather than in the later one that drops the source — on a fresh database the files replay in order,
so a copy written later would read a column an earlier-numbered migration had already removed. All
three keep the generated DDL at the top and put the hand-written statements below a
`--> statement-breakpoint` under a banner saying so, because
**`npm run db:generate` will silently drop them if the file is regenerated**: diff the old file
against the new one and re-append before deleting anything. A backfill also states its rule inline
rather than importing it — a migration is a historical record and must not follow later edits to the
TypeScript that once matched it.

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
- **A re-attached photo is a reference, not a copy.** `nina_message_images` rows share a `blob_url`
  on purpose: re-attaching an album face or an earlier chat photo writes a new row pointing at the
  same Blob object, and `source_avatar_id` / `source_image_id` are how the row admits it. Never
  delete such a row to de-duplicate a collection — every bubble, photo-viewer, download control and
  prompt read reads this table by `message_id`, so a missing row is a blank bubble. Filter the three
  collection reads instead (`isOriginalPhoto()` in `lib/nina/queries.ts`), and leave the pointers
  naming the **original** rather than the immediate predecessor, so a `SET NULL` cannot resurrect a
  duplicate.
- **Removing a session is a hard delete, and the cascade stops at the database.** Messages and their
  `nina_message_images` rows go; the Vercel Blob objects behind those rows stay, and the
  `source_message_id` pointers in `nina_memory_slots` / `nina_memory_facts` are left dangling on
  purpose — her long-term memory is global, and a distilled fact outlives the sentence that produced
  it.
- **A session's `title` and `title_source` travel together.** Both NULL means nobody has named it
  yet, which is the only state an automatic titler may write into; `'backfill'` is not `'manual'`
  but must be treated as if it were.
- **`nina_shortcuts.updated_at` means "the row last changed", never "the admin last edited it".**
  `$onUpdate` fires on every drizzle UPDATE of the table, and `bumpNinaShortcutUses` is an UPDATE,
  so a code that merely *fired* has a fresh `updated_at`. `last_used_at` is the telemetry column;
  NULL there means the code has never fired, which is a real answer and not a missing one.
- **Nothing may write `nina_shortcuts.match_key` or `kind` from outside the query layer.** Both are
  derived from `trigger` by one private helper in `lib/nina/queries.ts`, and the input types have no
  field for either — a caller *cannot* mislabel a row. Adding one would give the unique index a
  second, un-normalised spelling of the same trigger to consider distinct.
- **A photo reference is a `{ source, id }` pair, never a URL.** `nina_image_prefs` stores
  `reference_source` + `reference_id` because `updateNinaChatPhotoBlob` swaps a chat photo's
  `blob_url` while keeping its `id`: a stored URL would silently go stale or point at bytes that
  have since been replaced. Resolve it at read time (`resolveNinaPhotoReference`); a deleted
  photograph yields `null` rather than an error, because there is no FK that could enforce it.
- **`nina_image_prefs` has no SQL defaults, and that is the point.** `NINA_IMAGE_PREFS_DEFAULTS` in
  `lib/nina/imageprefs.ts` is the one definition of "unset"; a `DEFAULT 50` here would be a second
  copy of it in a second language, drifting silently. No row means the defaults (`revision: 0`), and
  `revision >= 1` is the proof that the operator actually saved something. `updated_at` is the one
  exception, because a timestamp is not part of the contract.
- **Auth.js tables are verbatim.** Singular names and camelCase columns are the adapter's
  convention, which is why `drizzle()` is built *without* `casing: 'snake_case'` and every app
  table spells its snake_case names out explicitly.

## Notes

### Documentation created: 2026-09-04

Initial creation, prompted by task **P1-DB-A000** — phase 1 of 7 in
`ADMIN_ALBUM_FILE_MANAGER_PLAN.md`, the plan set that turns `/admin/nina` into a file manager
(F34 R1).

### Recent changes — P1-DB-A004 (2026-09-07)

Phase 1 of 4 in `NINA_EMOJI_SHORTCUTS_PLAN.md` (F36) — *"the table and the matcher"*. **Nothing
user-visible ships in this phase**: no route, no component, no prompt change, and typing an emoji in
the chat still does exactly what it did yesterday. Phases 2, 3 and 4 (the turn-path read, the admin
registry, the ledger importer) build on the contract laid down here.

Within this package the task touched `schema.ts` and `drizzle/` only. The matcher that decides
whether a trigger fired is `lib/nina/shortcuts.ts` and every read and write is
`lib/nina/queries.ts`.

**New table `nina_shortcuts`**, placed beside `ninaMemoryFacts` — twelve columns: `id`, `user_id`
(cascading FK to `user`), `trigger`, `match_key`, `kind`, `label`, `expansion`, `enabled`, `uses`,
`last_used_at`, `created_at`, `updated_at`. Plus `ninaShortcutsRelations` and the row types
`NinaShortcutRow` / `NewNinaShortcutRow`.

The point of a **separate table** rather than more `nina_memory_facts` rows is that a shortcut is a
*directive she must act on*, and the ledger is framed to her as colour rather than structure. Four
things go wrong when the ledger holds one, and all four were live: `MEMORY_FACT_LIMIT = 60` ages the
oldest shortcut out of the prompt, every expansion travels on every turn whether or not it fired,
`ADMIN_FACT_TEXT_MAX = 400` already truncates the longest triggers' expansions, and the framing is
wrong for a directive. The part no other arrangement achieves: a separate table makes a shortcut
**structurally unreachable by `lib/nina/distill.ts`**, which writes facts. The distiller cannot
rewrite what it has no query for. `removeNinaSession`'s memory purge is out of reach for the same
structural reason — it matches on `source_message_id`, and this table deliberately has no such
column.

**`trigger` and `match_key` are two columns and the second one is the key.** `trigger` is what the
admin typed and what a table renders (`✌️`, `Plak!`, `nom nom`); `match_key` is
`normalizeNinaTrigger(trigger)` and is what matching and the unique index compare. Storing only the
raw trigger would mean normalising on every read of every turn *and* would let `✌️` and `✌` be two
rows; storing only the key would show him a peace sign stripped of its variation selector in his own
table.

**Three absences and one presence are decisions**, each asserted by the seven new cases in
`tests/db.schema.nina.test.ts`:

- **No `source_message_id`, no `source`, no `confidence`.** Every shortcut is authored by a human or
  lifted from the ledger by phase 4's importer. There is no distilled shortcut and there never will
  be, so a provenance discriminator would be a column with one value.
- **`kind` is plain `text` with no `.$type<>()`** — see the `pgEnum` note above for the two reasons.
- **`uses` and `last_used_at` are telemetry, not state.** Nothing reads them on the turn path; they
  exist so an admin screen can show a dead code as dead. `uses` is incremented in SQL, never
  read-then-written, because two turns in flight are a real pair.
- **`enabled` is a real column and not a delete.** A disabled code stays visible so it can be
  re-enabled, which is why the registry read and the turn read are two different calls.

**Two indexes:**

- `nina_shortcuts_user_match_unq` on `(user_id, match_key)` — **UNIQUE**, and it is the authority on
  "this trigger already exists". `shares_run_id_active_unq`'s argument: the alternative is a
  check-then-write that is correct until two tabs race. It is *also* the total order the registry
  read sorts by, so that read is an index scan and not a sort.
- `nina_shortcuts_user_enabled_idx` on `(user_id, enabled)` — it exists for **phase 2's every-turn
  read**, `listNinaShortcuts(userId, { onlyEnabled: true })` → `WHERE user_id = $1 AND enabled`.
  This is the one index in the table that is not paying for a constraint, and the read it serves runs
  on every single turn.

**Migration `drizzle/0012_nina_shortcuts.sql`** plus its meta snapshot and journal entry (`idx: 12`,
tag `0012_nina_shortcuts`). Purely generated, additive only — one `CREATE TABLE`, one FK constraint,
one `CREATE UNIQUE INDEX`, one `CREATE INDEX`. Nothing drops, renames, retypes or narrows anything,
and there is no data-migration statement, so it applies to a populated database without a rewrite
and reverting the code leaves an unread empty table, which is inert.

> **`npm run db:check` is clean, but NOT applied to any database.** Applying `0012` is an open
> deploy action (`npm run db:migrate`). Nothing in the app reads or writes the table yet, so an
> unapplied migration is invisible until phase 2 lands.

The half of the contract that lives outside this package, and is worth knowing from here: the
matcher `lib/nina/shortcuts.ts` is **zero-import by rule** (its own test reads its source and fails
on an `import` line), which is what keeps it safe for the browser bundle *and* is the precondition
for phase 4's `.mjs` importer to load it under `--experimental-strip-types` and compute `match_key`
with literally the same function. That is why `NinaShortcutMatchable` is declared there as a plain
interface instead of being imported from this file.
Phase 1 of 7 of the `nina-image-generation-tab` plan set — the Image Generation tab in
`/admin/personality`. Within this package the task touched `schema.ts` and `drizzle/` only, purely
additively; the vocabulary it stores lives in the new `lib/nina/imageprefs.ts` and the four queries
that read and write it in `lib/nina/queries.ts`. **`nina_tuning` was deliberately not touched** —
phase 7 owns retiring `nina_tuning.wardrobe`.

**New table `nina_image_prefs`** — one row per user, sixteen columns, `user_id` as the sole primary
key with a cascading FK to `user`, **no secondary index and no CHECK constraint**. It is
`nina_tuning`'s sibling and not its extension, and the split is the plan's: `nina_tuning` is *who
she is* and reaches the system prompt on every turn; this is *how she is photographed* and reaches
the image prompt only when a generation happens.

| Column | Meaning |
|---|---|
| `prompt_length` | `integer`, 0-100, 50 unset — the slider, read through the repo's five bands |
| `focus_face` … `focus_calves` | six `boolean NOT NULL` emphasis flags (`face`, `skin`, `boobs`, `butt`, `thighs`, `calves`), all false unset |
| `wardrobe`, `venue`, `time_of_day`, `notes` | free operator text, `NOT NULL` with `''` as the empty value |
| `reference_source` + `reference_id` | the chosen photograph, as a `{ source, id }` pair — no FK |
| `revision` | bumped **in SQL** by the upsert; `0` means no row has ever been written |
| `updated_at` | the one column that is *not* part of the contract, and the one with a `DEFAULT` |

Four shape decisions, each asserted by `tests/db.schema.nina.test.ts`:

- **Columns, not one `jsonb` blob.** `nina_tuning`'s argument applies word for word, with its first
  clause biting hardest here: a misspelt key in a blob is indistinguishable from an unset one, the
  coercer reads an unset focus key as `false`, so the failure mode would be *a checkbox that
  silently does nothing* — the one failure a control panel cannot survive. `focus_bobs` fails at
  `db:generate`.
- **The six flags are `NOT NULL`, the opposite of `nina_tuning`'s `*_enabled`.** Those are nullable
  because NULL there means "a row written before the toggles existed"; no such row can exist here,
  since the table arrives with all six columns in one migration.
- **No SQL defaults** except `updated_at` — see the gotcha above. "No row means the defaults" is
  what makes every downstream caller unconditional.
- **`reference_source` / `reference_id` have no foreign key and cannot have one.** Two possible
  parents (`nina_avatars` for `'album'`, `nina_message_images` for `'chat'`), and the pair is a
  `{ source, id }` rather than a `blob_url` because `updateNinaChatPhotoBlob` replaces a chat
  photo's bytes while keeping its id.

`NinaImagePrefsRow` / `NewNinaImagePrefsRow` are the row types; the `…Row` suffix is load-bearing,
because `NinaImagePrefs` is the nested, coerced model type in `lib/nina/imageprefs.ts`.

**Migration `drizzle/0011_natural_nico_minoru.sql`** plus its snapshot and journal entry
(`idx: 11`) — generated by `npm run db:generate`, never hand-named and never renamed. The generated
half is the `CREATE TABLE` and the FK. Below a `--> statement-breakpoint`, under the same banner
`0009` and `0010` carry, is a **hand-written one-statement data step**: it copies every non-empty
`nina_tuning.wardrobe` into a new prefs row at `revision = 1`, and every other value is
`NINA_IMAGE_PREFS_DEFAULTS` transcribed as a SQL literal. Two details are deliberate — a user whose
wardrobe is `''` gets **no** row, because a row of pure defaults would claim `revision = 1` for
someone who never saved anything; and `tests/nina.imageprefs.test.ts` reads this file and asserts
every transcribed literal against the TypeScript constant, so the copy is checked rather than
trusted. `ON CONFLICT DO NOTHING` cannot fire on replay but makes the statement re-runnable by hand.

Four functions landed in `lib/nina/queries.ts` against this table:
`readNinaImagePrefs` (returns `NINA_IMAGE_PREFS_DEFAULTS` with `revision: 0` when the user has no
row), `writeNinaImagePrefs` (a single `ON CONFLICT DO UPDATE` on `user_id` with `revision + 1`
computed SQL-side, so no caller can send a revision a stale tab could move backwards),
`listNinaPhotoReferences` (the bounded, newest-first union that feeds the picker — album rows plus
**original** `kind='generated'` chat rows) and `resolveNinaPhotoReference`.

One cross-package invariant is worth knowing from here (plan invariant 13): **the picker union
contains no reference row**, so no photograph appears in it twice. The chat half of that union must
call `generatedChatPhotoScope`, which already carries the `isOriginalPhoto()` conjunct, rather than
spelling an `eq(kind, 'generated')` comparison of its own; a source-level test in
`tests/nina.imageprefs.test.ts` enforces it, because inlining the predicate is the one edit that
would reintroduce the F37 duplicate through a different door.

> **`npm run db:check` is clean, but NOT applied to production.** Applying `0011` is an open deploy
> action (`npm run db:migrate`) — a manual step, as with `0010`, because the file carries a data
> migration over live rows.

### Recent changes — P1-DB-A003 (2026-09-07)

Phase 1 of `NINA_PHOTO_REFS_AND_BUBBLE_ACTIONS` (F37), the plan set whose one sentence is **"a
re-attached photo is a reference, not a copy."** Within this package the task touched `schema.ts` and
`drizzle/` only; the rule that decides which column a new row carries lives in `lib/nina/attach.ts`
and every read and write that honours it in `lib/nina/queries.ts`.

The defect: re-attaching an album face or an earlier chat photo copies `blob_url` and `pathname`
onto a **new** `nina_message_images` row — no bytes are copied, the Blob object is shared — and
nothing on the row said where they came from. So `/nina/about`'s Media section and the chat-photo
listing showed the same picture twice.

**`nina_message_images` gained two nullable provenance columns:**

- `source_avatar_id` → `nina_avatars.id`, `ON DELETE SET NULL`
- `source_image_id` → `nina_message_images.id` — self-referencing, `ON DELETE SET NULL`

A row is a **reference** when *either* column is non-null. Both can be non-null on one row (an album
face re-attached twice); that is two true facts, not a conflict.

Four things about the shape are decisions, and `tests/db.schema.nina.test.ts` asserts each:

- **Two columns, not one polymorphic pointer.** Two targets are two tables, and a real foreign key
  on each is the only thing that makes `SET NULL` possible at all. The shape is
  `nina_messages.reply_to_id`'s — a nullable self-referencing FK — applied twice.
- **`ON DELETE SET NULL` is the interesting half.** When the original is deleted the copy stops
  being a copy: the column goes NULL, the row becomes an original, and the collection *keeps* the
  picture instead of losing it. `CASCADE` would delete a photograph out of a conversation because an
  unrelated row was tidied away — the same data loss `isBlobPathnameReferenced` exists to prevent.
- **The row is never dropped.** Marking, not deleting, is the fix. Every bubble, photo-viewer open,
  download control and Nina's own prompt reads this table by `message_id`, so a message with no
  image row of its own is a blank bubble. Only the three **collection** reads skip a reference
  (`listNinaMessageImages`, `listNinaChatPhotos`, `countNinaChatPhotos`, via the module-private
  `isOriginalPhoto()`); every bubble, context and reaper read stays unfiltered on purpose.
- **No index.** Both are residual predicates on reads that already range-scan
  `nina_message_images_user_created_idx`, at the same table size that argument was accepted for
  `kind`. Nothing has measured a need for one.

No new union type, no new table, no new index, and no row type changed name — `NinaMessageImage` /
`NewNinaMessageImage` simply widened.

**Migration `drizzle/0010_nina_image_provenance.sql`** plus its meta snapshot and journal entry
(`idx: 10`). The generated half is two `ADD COLUMN`s and the two FKs. Below a
`--> statement-breakpoint` it carries a **hand-written two-statement backfill** that marks the
duplicates production already has — see the Migrations note above for why that half is fragile:

1. **R1, the duplicate chat photographs.** "Duplicate" is an equal `blob_url` within one `user_id`,
   because re-attach is the only writer that *reuses* a URL — two separate uploads of the same
   picture write two Blob objects and are two photographs as far as anything can tell. The earliest
   row wins (`ORDER BY created_at ASC, id ASC`; `id` breaks the tie that `created_at` cannot for
   rows written in one statement), and every later row points at *that* row rather than its
   predecessor, so the column always names the **original**. This matches
   `ninaPhotoProvenance`'s flatten (`sourceImageId ?? row.id`), so a row backfilled here and a row
   written tomorrow mean the same thing — and a `SET NULL` on an intermediate row cannot make a
   duplicate reappear.
2. **R3, an album face attached into the chat.** No "not the earliest" clause, deliberately: the
   *first* chat row whose bytes are an album face is already a reference, because the photograph was
   never a chat photograph. `DISTINCT ON` runs over `nina_avatars` too — nothing stops two album
   rows sharing a `blob_url`, since `nina_avatars_user_source_key_unq` is unique on `source_key`,
   not on the URL, and the profpic re-seed writes a fresh row for an anchor already stored. Without
   it an `UPDATE … FROM` whose subquery matches a target twice would pick arbitrarily.

Both statements are guarded `IS NULL`, so they are idempotent: no-ops on a fresh column, and running
one by hand a second time cannot move a pointer that has since been set.

> **`npm run db:check` is clean, but NOT applied to production.** Applying `0010` is an open deploy
> action (`npm run db:migrate`), deliberately a manual step because the file carries a data
> migration over live rows.

Two writes outside this package complete the invariant and are worth knowing from here:
`lib/nina/queries.ts` coalesces both fields to NULL on insert (a fresh upload and one of her
generations say "original" by saying nothing), and `updateNinaChatPhotoBlob` nulls them in the *same*
statement that swaps the bytes — a Replace applied to a reference would otherwise leave a unique
photograph that no listing ever shows.

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

### Recent changes — `nina-character-tuning` phase 1 (2026-09-05)

Within this package the phase touched `schema.ts` only; the reads and writes live in
`lib/nina/queries.ts` and the prompt assembly in `lib/nina/persona.ts` and
`lib/nina/prompts/system.ts`.

**New table `nina_tuning`** — one row per user, primary-keyed on `user_id` with a cascading FK to
`user`, holding Nina's whole character: the eleven trait dials as `0-100` integers, the relationship
as a text column over five values, the four extra dials the request's *"among other things (you can
define more comprehensively)"* asked for, a free-text notes field, a revision integer and an
`updated_at`. (It also held a one-line `wardrobe` until F41 R3, which dropped the column after
copying every value into `nina_image_prefs.wardrobe`.)

**The dials are flat columns, not a JSON blob.** Twenty named `integer NOT NULL` columns rather than
one `jsonb`, so the column list *is* the vocabulary: a dial that does not exist cannot be written,
`drizzle-kit` diffs a rename, and a hand-run `UPDATE nina_tuning SET anger = 100` is the whole of
the operator escape hatch. The domain is enforced by `clampNinaScore` and not by a `CHECK`, because
a `CHECK` would make widening the scale a migration, and a value outside `0-100` is a bug in one
writer rather than a state the reader cannot survive.

Three more things about the shape are decisions rather than defaults:

- **A row per user, not a row per dial.** The panel saves the whole tuning in one Server Action —
  actions dispatch one at a time per client — so a normalised `(user_id, key, value)` table would be
  one action writing twenty rows for no gain, and every read would be an aggregation. It is one
  object with one lifetime.
- **`readNinaTuning` returns the DEFAULTS when the row is absent**, and no phase writes a row on
  sign-up. That is what makes the feature a provable superset of what shipped: until the operator
  saves something, every user is on `NINA_TUNING_DEFAULTS`, and
  `buildNinaSystemPrompt(NINA_TUNING_DEFAULTS)` is asserted to equal the prompt that shipped before
  the dials existed. No column carries a SQL `DEFAULT` for the same reason every other table here
  does not: the one writer always supplies every value, and a default is a second opinion about it.
- **The tuning is not a memory slot.** `nina_memory_slots` is written by the distiller for anything
  not marked `source: 'admin'`, which would eventually let her rewrite her own character; and the
  nine-key slot vocabulary in `lib/nina/memory.ts` is deliberately unchanged by this set.

**`nina_turns` gained a nullable `tuning_revision` column.** `prompt_version` identifies the
*assembler*; with a per-user tuning it no longer identifies the *output*, so without the revision
beside it the audit trail cannot answer *"what was she set to when she said that"*. Nullable, and
NULL means the turn predates the dials. `revision` itself is computed as `revision + 1` inside the
upsert rather than supplied by a caller — a revision the client sends is a revision a stale tab can
move backwards.

**Migration `drizzle/0005_nina_persona_tuning.sql`** plus its meta snapshot and journal entry
(`_journal.json` idx 5). Additive only — one `CREATE TABLE`, one nullable `ADD COLUMN`, one FK.
Nothing drops, renames, retypes or narrows anything, and there is no data-migration statement, so it
applies to a populated table without a rewrite and reverting the code leaves an unread table and an
unread column, which is inert.

> **APPLIED to production**, and the count is 6. `nina_tuning` exists with its 21 columns and
> `nina_turns.tuning_revision` is present.
>
> **It was `0004` on the branch, and the renumber this section predicted is what happened.** `main`
> gained an unrelated `0004_nina_chat_sessions` while this set was in flight, so both sets minted an
> idx-4 migration. The fix kept main's journal and `0004` snapshot, dropped this set's `0004_*.sql`,
> and **regenerated** it as `0005` from the merged `schema.ts` — so the snapshot genuinely chains
> onto main's `0004` instead of merely claiming to.
>
> **Renaming the file by hand would have been silently wrong**, which is the part worth keeping.
> The migrator applies journal entries whose `when` exceeds the newest applied row. This set's
> `0004` was stamped 1788535743971 (14:49) and main's applied `0004` was 1788553112306 (20:18), so a
> renamed-but-not-regenerated entry would have been *older than the watermark* and skipped in
> silence: no error, a clean-looking deploy, and `nina_tuning` simply never created — discovered on
> the first turn that read it. Regenerating restamps `when`, which is why it applied.
