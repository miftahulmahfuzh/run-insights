# Package: db

**Location**: `lib/db`
**Last Updated**: 2026-09-12 (compacted from 1,098 lines; every claim re-verified against the tree
and against production — see Notes for the documentation history)

## Overview

`lib/db` is the entire persistence layer of Run Insights: one Drizzle client (`index.ts`), the
whole Postgres schema in one file (`schema.ts`), and every read and write the run-tracking
application performs (`queries.ts`). Nothing above it opens a connection, and there is no
repository layer, DAO or second client beneath it.

It is a *declaration-plus-access* package with one deliberate asymmetry worth knowing before you
go looking for a function: `schema.ts` declares tables for the whole product, including features
whose queries live elsewhere, while `queries.ts` covers only the run / extraction / insight /
share domain. Nina's reads and writes live in `lib/nina/queries.ts` against tables declared here —
`lib/db/queries.ts` touches no `nina_*` table at all — and `app_settings`' reader is
`lib/llm/textModel.ts`.

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
seeding that key before the first import. Set `DRIZZLE_LOG=1` to make the driver log every SQL
statement it sends.

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

The v0.1.0 contract docs (`ROADMAP_v0.1.0.md` §4.3 for every column; `RECONCILIATION_v0.1.0.md`)
are retired — the rulings survive in `.workflows/plan/nina-chatbot/RECONCILIATION_RULINGS.md`, and
each amendment is marked in `schema.ts` with its ruling (R-1, R-5, R-7, R-8, R-9, R-11, R-12,
R-13, R-22, R-28 — ten in all). Where this file and a feature plan disagree, the rulings win.

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
| `ninaTurns` | `nina_turns` | Audit/job row for every Nina model call (soft-delete column `deleted_at`) | `nina_turns_user_created_idx` |
| `ninaChatSessions` | `nina_chat_sessions` | The conversation's partition — one row per topic he started | `nina_chat_sessions_user_created_idx` |
| `ninaMessages` | `nina_messages` | One bubble of the runner↔Nina conversation | `nina_messages_user_seq_idx`, `nina_messages_user_unread_idx` (partial), `nina_messages_reply_to_idx`, `nina_messages_user_run_idx`, `nina_messages_session_seq_idx`, `nina_messages_user_session_runner_idx` (partial) |
| `ninaMessageImages` | `nina_message_images` | One image attached to a message, plus where its bytes came from | `nina_message_images_message_idx`, `nina_message_images_user_created_idx`, `nina_message_images_user_content_hash_idx` (partial) |
| `ninaMemorySlots` | `nina_memory_slots` | Upserted "current fact" memory slot | PK `(user_id, key)` |
| `ninaMemoryFacts` | `nina_memory_facts` | Append-only "what he has told me" ledger | `nina_memory_facts_user_created_idx` |
| `ninaShortcuts` | `nina_shortcuts` | The trigger registry — one emoji or short token standing for a long directive he wrote once | `nina_shortcuts_user_match_unq`, `nina_shortcuts_user_enabled_idx` |
| `ninaNags` | `nina_nags` | Escalation-ladder state per nag code | PK `(user_id, code)` |
| `ninaAvatars` | `nina_avatars` | Nina's photo album: folder, crop transform, thumbnail, dedupe key | `nina_avatars_user_current_unq` (partial), `nina_avatars_user_created_idx`, `nina_avatars_user_folder_created_idx`, `nina_avatars_user_source_key_unq` |
| `ninaFolders` | `nina_folders` | Asserts a folder exists even when empty | PK `(user_id, folder)` |
| `ninaTuning` | `nina_tuning` | Nina's per-user character: twelve trait dials, the relationship, the four extra dials, seventeen enable flags and a notes field | PK `user_id` |
| `ninaImagePrefs` | `nina_image_prefs` | How she is photographed: the prompt-length slider, six focus flags, four lines of free text, `prompt_template` + `model` (the image-gen controls), the chosen photo reference | PK `user_id` |
| `appSettings` | `app_settings` | Operator decisions persisted without a redeploy — first key `text_model`, read by `lib/llm/textModel.ts` | PK `key` |
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
TypeScript change and not a migration. The exported unions are `Sex`, `ExtractionStatus`,
`PhotoKind`, `RunIntent`, `RunSource`, `InsightScope`, `NinaTurnKind`, `NinaTurnStatus`,
`NinaRole`, `NinaMessageSource`, `NinaImageKind`, `NinaMemorySource`, `NinaPromiseMetric`,
`NinaPromiseReward`, `NinaFactCategory`, `NinaAvatarSource` and `NinaSessionTitleSource`
(`AdapterAccountType`, the `account.type` union, is deliberately not exported — nothing outside
the file narrows it). `badges.key`, `records.key`, `nina_turns.trigger`/`error_code`,
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

**Cascade is the default for ownership FKs**, with documented exceptions: `badges.run_id` is
`set null` (R-22 — "a badge is a fact about the past; deleting the run that earned it must not
delete the history that it happened"), `nina_messages.reply_to_id` / `run_id` are `set null` so
a deleted parent degrades a quote bubble or run card instead of deleting conversation, and
`nina_message_images.source_avatar_id` / `source_image_id` are `set null` so deleting the original
photograph leaves the copy holding the picture rather than losing it (F37).
`nina_message_images.message_id` is `set null` too (`0013_fixed_serpent_society`): deleting a
bubble leaves its photograph rows in place rather than destroying them — see the session-removal
gotcha for the consequence. `nina_messages.turn_id` carries **no** FK at all, because an audit
pointer must not be able to block a delete, and `nina_image_prefs.reference_source` /
`reference_id` carry none either — the chosen photograph lives in `nina_avatars` *or*
`nina_message_images`, and no single foreign key can point at one of two tables. Nor would one be
wanted: a cascade would delete a whole preferences row because one photograph was deleted.
`resolveNinaPhotoReference` in `lib/nina/queries.ts` is where a dangling id becomes `null` and the
generation degrades to unanchored. One cascade is not a default but a stated requirement:
`nina_messages.session_id` → `nina_chat_sessions.id`, so removing a session takes its messages in
one `DELETE` — and there the chain **stops**, because the images' FK is `set null`.

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

**`app_settings` is the escape hatch for values that are decisions rather than infrastructure.**
`key` is `text` and the vocabulary of keys is spelled where they are read; `value` is `text` and
every reader coerces or refuses it, so a hand-run SQL edit degrades instead of breaking a turn.

#### Row types

Every app table re-exports its inferred types — `User`, `Profile`/`NewProfile`, `Run`/`NewRun`,
`NinaAvatar`/`NewNinaAvatar`, `NinaFolder`/`NewNinaFolder`, and so on (the three Auth.js adapter
tables export none). Import these rather than re-deriving `$inferSelect` at a call site. Six
families are `…Row`-suffixed. The push row is `PushSubscriptionRow`, not `PushSubscription`,
because the latter is a DOM lib global that client code uses by that exact name. `NinaTuningRow`
and `NinaImagePrefsRow` are suffixed because `NinaTuning` and `NinaImagePrefs` are the *model*
types in `lib/nina/tuning.ts` and `lib/nina/imageprefs.ts` — nested and coerced, and what every
consumer actually holds; the flat, unvalidated storage shapes should be named only by the query
modules. `RecordRow`/`NewRecordRow` are suffixed because a bare `Record` would shadow
TypeScript's own `Record` utility type in every file that imported it, and `AppSettingRow` follows
the same suffix with no model twin today. `NinaShortcutRow` / `NewNinaShortcutRow` carry the
suffix for a further
reason — the raw row is not the shape callers want, because `kind` is bare `string` here. That
table has **three** names across three layers and no duplication: `NinaShortcutRow` (this file,
the drizzle row), `NinaShortcutRecord` (`lib/nina/queries.ts`, the same fields with `kind`
narrowed to the union), and `NinaShortcutMatchable` (`lib/nina/shortcuts.ts`, the structural
minimum the matcher needs — a subset the record satisfies with no mapping step).

### `queries.ts` — every run-domain read and write

Two invariants govern the file:

**1. The userId-scoping invariant (roadmap D8).** Every exported function that reads or writes one
user's data takes `userId` as its first parameter and that value appears in the `WHERE` of every
statement it runs. There are exactly two exceptions: `getRunByShareToken` (§9), unscoped by
contract because the 96-bit token *is* the credential, and `listActiveUserIds` (§8), a directory
read over all users with nothing to scope. Never add a third. `userId` must come from the session
(`requireUserId()`), never from a Server Action argument, a form field or a URL segment. A row
that exists but is not yours and a row that does not exist are the same outcome (`NotFoundError` →
404); distinguishing them is an id-enumeration oracle.

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
`AllTimeTotals`, `ReviewedRunWindowRow`, `SharedRun`, `RunAttachmentRow`, …). No ORM entity, no lazy
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

72 files import from this package statically — 60 source files plus 12 test-side (eleven suites
and the `tests/fixtures/ninaTurn.ts` fixture) — and most of the rest of the test suite loads it
with a dynamic `import()` in the test body instead, taking the total to 90 files. All of them go
through the `@/lib/db*` alias; there is not one relative import of it anywhere.

### Primary consumers

- **`lib/nina/queries.ts`** — the heaviest consumer in the repo, and architecturally the most
  important: it imports `db` itself plus tables and union types, and it is the **only**
  production file that imports `ninaAvatars`, `ninaFolders`, `ninaShortcuts` or `ninaImagePrefs`.
  It is the choke point for all avatar, folder, session, shortcut and image-prefs access — the
  session statements are its §4a, and the pure ordering rules they feed are `lib/nina/sessions.ts`,
  which imports nothing from this package at all. Every other avatar-touching file
  (`lib/admin/ninaAlbumActions.ts`, `app/admin/page.tsx`, `lib/nina/album.ts`, `avatargen.ts`,
  `avatartools.ts`, `proactive.ts`, `imagegen.ts`) calls its exported functions rather than
  reaching for a table. The one structural exception is the **turn pipeline** (below), which
  reaches for `ninaChatSessions` directly.
- **`lib/nina/chatturn.ts`, `turnrevive.ts`, `searchActions.ts`** — the Nina turn lifecycle's
  store half: these import `db` and write `nina_turns` / read `nina_chat_sessions` and
  `nina_messages` directly rather than going through `lib/nina/queries.ts` (`turnrun.ts` and
  `turn.ts` drive them without touching this package).
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
`app/admin/memory/page.tsx` (`NinaPendingPromise`), `lib/derived/invalidate.ts`,
`lib/llm/*`, `lib/metrics/hrMax.ts`, `lib/profile/*`, `lib/runs/actions.ts`.

### Test consumers

Twelve test-side files import statically. The notable ones: `tests/db.schema.test.ts` and
`tests/db.schema.nina.test.ts` assert on the schema *objects* themselves — table names, column
names and SQL types, index names, FK on-delete behaviour — via `getTableConfig`, with no database
involved. `tests/support/fakeDb.ts` builds the recording fake that the wider suite uses, and
`tests/db.client.test.ts` asserts that `@/lib/db` re-exports the schema — those two (like most of
the suite) load the package with a dynamic `import()` inside the test body.

### Two facts worth knowing

**Direct `db` use outside this package is the exception, but no longer a short list.** Ten files
import the instance: `auth.ts` (the NextAuth adapter tables), `lib/admin/users.ts`,
`lib/admin/memoryStore.ts` (admin memory-ledger writes beside `lib/nina/queries.ts`'s),
`lib/push/queries.ts`, `lib/llm/textModel.ts` (the `app_settings` reader), `lib/nina/imagejobs.ts`,
`lib/nina/queries.ts`, and the turn pipeline's `lib/nina/chatturn.ts`, `lib/nina/turnrevive.ts` and
`lib/nina/searchActions.ts` — the one place the queries.ts indirection is not used. The other
fifty source files call named functions; `lib/nina/queries.ts` remains the choke point for
conversation, avatar, folder, shortcut and image-prefs access.

**`scripts/` imports nothing from here.** Every script that touches Postgres (`db-smoke.mjs`, the
two backfills, `nina-profpic.mjs`, `nina-image-worker.ts`, `blob-reap.mjs`, the probes and capture
helpers) instantiates `neon()` from `@neondatabase/serverless` directly, because it cannot resolve
the `@/` alias or tolerate `server-only`. `drizzle.config.ts` likewise does not import the package —
it names `'./lib/db/schema.ts'` as a config string. **A schema change is therefore not automatically
reflected in a script**, and a script writing a `nina_*` table is writing raw SQL that no type
checks.

`NinaAvatar`, `NewNinaAvatar`, `NinaFolder`, `NewNinaFolder`, `NinaChatSession`,
`NewNinaChatSession`, `NinaShortcutRow` and `NewNinaShortcutRow` currently have **no importers** —
callers pass around the shapes `lib/nina/queries.ts` returns instead (`lib/nina/queries.ts`'s own
comment explains why it names `NinaShortcutRecord`, not the row). (The string `NinaAvatar` also
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
clean. Later migrations repeat the arrangement for the other reasons a hand-written step is needed —
`0009`/`0010` (marking production's existing rows for a retroactive nullable column),
`0011_natural_nico_minoru` (moving `nina_tuning.wardrobe` into the new `nina_image_prefs` inside the
migration that creates the destination, because on a fresh database the files replay in order and a
copy written later would read a column an earlier migration had already dropped), and
`0001_badge_award_ledger` (filling `dedupe_key` before the PK that requires it). All of them keep
the generated DDL at the top and put the hand-written statements below a
`--> statement-breakpoint` under a banner saying so, because
**`npm run db:generate` will silently drop them if the file is regenerated**: diff the old file
against the new one and re-append before deleting anything. A backfill also states its rule inline
rather than importing it — a migration is a historical record and must not follow later edits to the
TypeScript that once matched it.

**The journal and the file names diverged during the 2026-09-05 collision era** — two concurrent
plan sets each minted the same migration numbers, and the resolution kept *both* files as separate
journal entries and renumbered later ones. Concretely: the journal holds two `0011_*` migrations
(`0011_rare_blockbuster` at idx 11, `0011_natural_nico_minoru` at idx 12), `0012_nina_shortcuts`
was regenerated as `0012_messy_carlie_cooper` (the `nina_shortcuts` `CREATE TABLE` lives there
now), and there is no `0014`. **Do not trust an old document's migration file name — read the
journal (`drizzle/meta/_journal.json`) and the file it names.** A renamed-but-not-regenerated
migration is silently skipped by the migrator; regeneration restamps `when`, which is what makes it
apply.

**Deploy state (verified 2026-09-12 against production, by the migrations table and
`information_schema`):** 20 of the 21 journal entries are applied. Production has no
`nina_tuning.revision`, no `nina_turns.tuning_revision`, no `nina_image_prefs.revision`; it does
have `content_hash`, `perceptual_hash`, `perceptual_sig`, `prompt_template`, `model` and
`app_settings`. The one unapplied entry is **`0011_rare_blockbuster`**
(`ALTER TABLE nina_memory_facts DROP COLUMN confidence`) — and it is not "pending" but
**skipped**: its journal `when` is older than the newest applied row, and the migrator only applies
entries beyond that watermark, so `db:migrate` will never apply it and will never complain.
Production still holds the orphaned `nina_memory_facts.confidence` column — schema.ts declares none
(the table's own comment records the drop), and nothing reads or writes it, so it is inert. If it
is ever to go, that is a hand-run `DROP COLUMN` plus a constructed journal fix — `db:generate`
cannot see it and will not emit it.

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
  segments with no leading or trailing slash (`lib/admin/filetree.ts`'s grammar), so the root is
  the path with zero segments. `nina_folders` itself never stores `''` — the root is never stored.
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
- **`nina_message_images.content_hash` NULL means "dedup inactive", not "unknown".** It is the
  write-time dedup key (media-dedupe P1): sha-256 over the exact stored bytes, asked per user via
  `findNinaImageByContentHash`. Every pre-column row and every write that had no hash in hand
  stores NULL, and because SQL `=` never matches NULL no consumer needs a special case — and none
  may invent one that reads NULL as "definitely unique". The index is deliberately **not UNIQUE**:
  the duplicate this mechanism writes is the reference row above, which must stay, so uniqueness is
  the write path's decision after the lookup and the index only makes the lookup cheap.
- **Removing a session is a hard delete, and the cascade stops at the images.** Messages go with
  the session; their `nina_message_images` rows **stay**, `message_id` NULL (`0013` made that FK
  `set null` so a photograph outlives the bubble that carried it), and the pathname reaper is what
  eventually frees the bytes. The `source_message_id` pointers in `nina_memory_slots` /
  `nina_memory_facts` are left dangling on purpose — her long-term memory is global, and a
  distilled fact outlives the sentence that produced it.
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
- **`nina_image_prefs` has no schema-declared defaults, and that is the point.**
  `NINA_IMAGE_PREFS_DEFAULTS` in `lib/nina/imageprefs.ts` is the one definition of "unset"; a
  `DEFAULT 50` here would be a second copy of it in a second language, drifting silently. No row
  means the defaults. The two image-gen controls, `prompt_template` and `model`, are `.notNull()`
  with no schema default either — the `DEFAULT ''` / `DEFAULT 'qwen/qwen-image-3-pro'` clauses in
  `0020` are migration-time backstops for the one row that already existed, not part of the
  contract. `updated_at` is the one intentional exception, because a timestamp is not part of the
  contract.
- **Auth.js tables are verbatim.** Singular names and camelCase columns are the adapter's
  convention, which is why `drizzle()` is built *without* `casing: 'snake_case'` and every app
  table spells its snake_case names out explicitly.

## Notes

### Deploy state of the journal

Kept short because it is the fact most likely to have changed since this page was written (and
twice has): see **Migrations → Deploy state** above — verified 2026-09-12: 20 of 21 entries
applied; `0011_rare_blockbuster` unapplied and watermark-skipped; production still holds the
orphaned `nina_memory_facts.confidence`.

### Documentation history

This page was created 2026-09-04 (task **P1-DB-A000**, phase 1 of 7 of
`ADMIN_ALBUM_FILE_MANAGER_PLAN.md`). Until 2026-09-12 it also carried a full narrative entry per
landed task; those stories live in the plan documents under `docs/plans/archive/` and in git
history, and the decisions worth keeping are folded into the sections above. The compact record:

| Date | Task / set | What changed in this package | Migration (current file) |
|---|---|---|---|
| 2026-09-04 | P1-DB-A000 (album file manager) | `nina_avatars` +folder/filename/source_key/thumb_url/thumb_pathname; new `nina_folders` | `0003_nina_avatar_folders` |
| 2026-09-05 | nina-character-tuning p1 | new `nina_tuning`; `nina_turns.tuning_revision` (since dropped) | `0005_nina_persona_tuning` (minted as a second `0004`, regenerated after the collision — the restamp story lives in git history) |
| 2026-09-05 | P1-DB-A001 (chat sessions) | new `nina_chat_sessions`; `nina_messages.session_id` + two indexes; the md5-substr session-filing backfill | `0004_nina_chat_sessions` (first hand-edited migration) |
| 2026-09-07 | P1-DB-A003 (photo refs, F37) | `nina_message_images` +source_avatar_id/source_image_id, with the duplicate-marking backfill | `0010_nina_image_provenance` |
| 2026-09-07 | P1-DB-A004 (emoji shortcuts) | new `nina_shortcuts` and its matcher-side contract | `0012_messy_carlie_cooper` (minted as `0012_nina_shortcuts`) |
| 2026-09-08 | imagegen p1 (F41 R3) | new `nina_image_prefs`; the wardrobe copy out of `nina_tuning` | `0011_natural_nico_minoru` |
| — | F13 (badge ledger) | `badges.dedupe_key` backfilled, then made the third PK column | `0001_badge_award_ledger` |
| — | early Nina tables | `nina_avatars` base table; `nina_tuning` enable toggles; `horny` dial | `0002_nina`, `0006`, `0007` |
| — | turn soft delete | `nina_turns.deleted_at` | `0008_thankful_cardiac` |
| — | drop shortcut/ledger confidence | `nina_memory_facts` − `confidence` | `0011_rare_blockbuster` — **unapplied; see Deploy state** |
| 2026-09-09 | — | `nina_message_images.message_id` becomes nullable, FK `set null` | `0013_fixed_serpent_society` |
| 2026-09-09 | F41 R3 | `nina_tuning` − `wardrobe` | `0015_retire_nina_tuning_wardrobe` |
| 2026-09-09 | P1-RI-A040 (simplify-personality p1) | `nina_tuning` − `revision`; `nina_turns` − `tuning_revision` | `0016_retire_tuning_revision` (applied) |
| 2026-09-09 | P1-RI-A029 (admin-imagegen-simplify p2) | `nina_image_prefs` − `revision` | `0017_retire_imageprefs_revision` (applied) |
| 2026-09-10 | P1-DB-A006 (media-dedupe p1) | `nina_message_images` + `content_hash` + partial non-unique index | `0018_real_madame_web` (applied) |
| 2026-09-10 | media-dedupe p2 | `nina_message_images` + `perceptual_hash`/`perceptual_sig` | `0019_massive_dracula` (applied) |
| 2026-09-10 | image-gen controls | new `app_settings`; `nina_image_prefs` + `prompt_template`/`model` | `0020_image_gen_controls` (applied) |
| 2026-09-11 | lib-db-queries-yagni | removed dead code: `getMonthlyTotals`/`fillZeroMonths` (and `MonthlyTotal`), `getObservedMaxHr`/`getObservedMaxHrExcludingRun`, `listExtractions`, `deletePhoto` | — |
