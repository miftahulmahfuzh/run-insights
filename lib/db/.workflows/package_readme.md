# Package: db

**Location**: `lib/db`
**Last Updated**: 2026-09-17 (`P2-DB-A002` — `nina_message_images` gains the album's three search
columns, `nina_avatars` gains the `source_image_id` pointer at a Media original, and
`NINA_EMBEDDING_DIMENSIONS` moves to its own leaf module; migration `0026`. See Notes for the
documentation history). Amended 2026-09-19 (`P1-DB-A008` — `nina_photoshop_jobs` gains the four
nullable crop columns, all-four-null meaning "no crop"; migration `0035_first_loa`, generated and
**not applied**)

## Overview

`lib/db` is the entire persistence layer of Run Insights: one Drizzle client (`index.ts`), the
whole Postgres schema (`schema.ts` plus the domain modules behind it), and every read and write the
run-tracking application performs (`queries.ts` plus its own domain modules). Nothing above it
opens a connection, and there is no repository layer, DAO or second client beneath it.

**`schema.ts` and `queries.ts` are barrels, not monoliths — `db-schema-split` and
`db-queries-split` (both 2026-09-12) split them into one file per domain, each re-exported through
`export *`.** `schema.ts` now does nothing but `export * from './schema/auth'` /
`'./schema/runs'` / `'./schema/nina/chat'` / `'./schema/nina/memory'` / `'./schema/nina/avatars'` /
`'./schema/nina/config'` / `'./schema/admin'` / `'./schema/push'`, and `queries.ts` does the same
over thirteen `queries/*.ts` modules (`errors`, `ownership`, `runs`, `rollups`, `badgeReads`,
`extractions`, `photos`, `profile`, `insights`, `records`, `badges`, `shares`, `sharedRun` — plus
`queries/internal.ts`, deliberately **not** re-exported: `runBatch`/`Statement` are plumbing for
sibling modules, not public surface). Both barrels stay the single import path on purpose — every
consumer still imports `'@/lib/db/schema'` or `'@/lib/db/queries'` (or `'@/lib/db'`, which
re-exports both) and none may reach into a domain module directly — so nothing below this
paragraph about table shapes, invariants or call sites changed; only which physical file declares
each piece did. `drizzle.config.ts`'s `schema` path is unaffected: it still names
`'./lib/db/schema.ts'`, which still exists and still re-exports everything drizzle-kit needs to
introspect.

It is a *declaration-plus-access* package with one deliberate asymmetry worth knowing before you go
looking for a function: the schema modules declare tables for the whole product, including
features whose queries live elsewhere, while the `queries.ts` modules cover only the run /
extraction / insight / share domain. Nina's reads and writes live in `lib/nina/queries.ts` against
tables declared here — nothing under `lib/db/queries/` touches a `nina_*` table at all — and
`app_settings`' reader is `lib/llm/textModel.ts`. The asymmetry's newest instance is
`nina_error_logs`: declared here, read and written by `lib/nina/errorlogs.ts` — deliberately not in
that Nina queries file, because its reads carry no `userId` at all (an operator's diagnostic log,
not conversation).

**Key Responsibilities:**

- Own the single `neon-http` Drizzle instance, cached on `globalThis`, plus the `Database` type.
- Declare every table, column, index, constraint and row type, one domain per module, behind the
  `schema.ts` barrel that is still the one authoritative import path.
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

**A barrel over eight domain modules** (`schema/auth.ts`, `schema/runs.ts`, `schema/nina/chat.ts`,
`schema/nina/memory.ts`, `schema/nina/avatars.ts`, `schema/nina/config.ts`, `schema/admin.ts`,
`schema/push.ts`), not a single file — see the Overview. Everything below describes the schema as a
whole; where a table lives is a module lookup (the inventory below names the variable and SQL
table, and the module layout comment at the top of `schema.ts` names which file owns it), not a
line number in one file.

**Eight barrel entries, nine module files: `schema/nina/embedding.ts` is a leaf and deliberately
not a ninth `export *`.** It holds one constant, `NINA_EMBEDDING_DIMENSIONS`, imported by both
`schema/nina/avatars.ts` and `schema/nina/chat.ts` and re-exported by the former, so the barrel's
surface is byte-identical to what it was when the constant lived in `avatars.ts` and
`lib/nina/embedding.ts`'s import path is unchanged. The rule that keeps it there: **a value the
`avatars` ⇄ `chat` pair both read at module-evaluation time may not live in either of them.** Those
two modules are a cycle since `nina_avatars.source_image_id` (2026-09-17) — `chat` has imported
`ninaAvatars` since F37, `avatars` now imports `ninaMessageImages` back — and a cycle whose every
edge is lazy (`(): AnyPgColumn => …`, evaluated long after both module bodies finish) is safe in
any evaluation order. A constant is not lazy: `vector('…', { dimensions: … })` reads it while the
module body runs, so leaving it in `avatars.ts` makes `chat.ts` depend eagerly on a
mid-evaluation module and yields `ReferenceError: Cannot access 'NINA_EMBEDDING_DIMENSIONS' before
initialization` whenever the graph is entered from the `avatars` side. It would not fire today only
because `schema.ts` happens to list `./schema/nina/chat` above `./schema/nina/avatars` — correctness
resting on the order of two `export *` lines, which is why the constant was moved rather than
documented. Do not move it back, and do not add a second eagerly-read shared value to either
module; add a leaf.

The v0.1.0 contract docs (`ROADMAP_v0.1.0.md` §4.3 for every column; `RECONCILIATION_v0.1.0.md`)
are retired — the rulings survive in `.workflows/plan/nina-chatbot/RECONCILIATION_RULINGS.md`, and
each amendment is marked in the owning module with its ruling (R-1, R-5, R-7, R-8, R-9, R-11, R-12,
R-13, R-22, R-28 — ten in all). Where a module and a feature plan disagree, the rulings win.

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
| `ninaMessageImages` | `nina_message_images` | One image attached to a message, plus where its bytes came from, plus the album's three search columns (`search_keywords`, `negative_search_keywords`, `description_embedding`) | `nina_message_images_message_idx`, `nina_message_images_user_created_idx`, `nina_message_images_user_content_hash_idx` (partial), `nina_message_images_description_embedding_hnsw_idx` (HNSW, `vector_cosine_ops`) |
| `ninaMemorySlots` | `nina_memory_slots` | Upserted "current fact" memory slot | PK `(user_id, key)` |
| `ninaMemoryFacts` | `nina_memory_facts` | Append-only "what he has told me" ledger | `nina_memory_facts_user_created_idx` |
| `ninaShortcuts` | `nina_shortcuts` | The trigger registry — one emoji or short token standing for a long directive he wrote once | `nina_shortcuts_user_match_unq`, `nina_shortcuts_user_enabled_idx` |
| `ninaNags` | `nina_nags` | Escalation-ladder state per nag code | PK `(user_id, code)` |
| `ninaAvatars` | `nina_avatars` | Nina's photo album: folder, crop transform, thumbnail, dedupe key, `description` + `search_keywords` / `negative_search_keywords` + the `description_embedding` vector, and `source_image_id` — non-null makes the row a pointer at a Media original rather than a photograph of its own | `nina_avatars_user_current_unq` (partial), `nina_avatars_user_created_idx`, `nina_avatars_user_folder_created_idx`, `nina_avatars_user_source_key_unq`, `nina_avatars_user_content_hash_idx` (partial), `nina_avatars_description_embedding_hnsw_idx` (HNSW, `vector_cosine_ops`), `nina_avatars_source_image_id_idx` |
| `ninaFolders` | `nina_folders` | Asserts a folder exists even when empty | PK `(user_id, folder)` |
| `ninaPhotoshopJobs` | `nina_photoshop_jobs` | One photoshop attempt on one existing photo, held unresolved until the admin picks Replace / Add / Cancel (`schema/nina/photoshop.ts`). Carries the optional crop quad `crop_ratio_label` / `crop_scale` / `crop_x` / `crop_y` — all four nullable, all four null = no crop | `nina_photoshop_jobs_user_created_idx` |
| `ninaTuning` | `nina_tuning` | Nina's per-user character: twelve trait dials, the relationship, the four extra dials, seventeen enable flags and a notes field | PK `user_id` |
| `ninaImagePrefs` | `nina_image_prefs` | How she is photographed: six focus flags, four lines of free text, `prompt_template` + `model` (the image-gen controls), the chosen photo reference | PK `user_id` |
| `ninaErrorLogs` | `nina_error_logs` | Best-effort log of every FAILED Nina model call (written by `lib/nina/errorlogs.ts`, not `lib/nina/queries.ts`; `user_id` nullable — some failing seams hold no runner) | `nina_error_logs_category_created_idx` |
| `appSettings` | `app_settings` | Operator decisions persisted without a redeploy — first key `text_model`, read by `lib/llm/textModel.ts` | PK `key` |
| `pushSubscriptions` | `push_subscriptions` | Web Push subscription per browser endpoint | `push_subscriptions_endpoint_unq`, `push_subscriptions_user_idx` |

#### Schema-wide conventions

**Integers in the smallest sensible unit** (roadmap D5). Distance is metres, duration and pace are
seconds, money is millionths of a dollar (`nina_turns.cost_micro_usd`), confidence is an integer
percent, crop offsets are per-mille of the frame. Floats summed over a month drift visibly;
integers do not. Three declared exceptions: `profiles.weight_kg` is `numeric(4,1)`, the single
non-integer *measured* value, and `nina_avatars.crop_scale` and `nina_photoshop_jobs.crop_scale`
are both `numeric(5,3)` because a zoom factor is a display transform rather than a measurement.

**"Per-mille of the frame" is not one unit — read the owning column's comment.**
`nina_avatars.crop_x/crop_y` are *both* thousandths of the frame's **width**, which is only legal
because that frame is a square. `nina_photoshop_jobs.crop_x/crop_y` (2026-09-19) are **per-axis**:
`crop_x` is per-mille of the frame's width, `crop_y` per-mille of its **height**, because that
frame is a rectangle at one of the provider's `aspect_ratio` values. Applying the square convention
to the photoshop columns crops the wrong region on the y axis for every non-square ratio.

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
`NinaPromiseReward`, `NinaFactCategory`, `NinaAvatarSource`, `NinaSessionTitleSource` and
`NinaErrorCategory` (`AdapterAccountType`, the `account.type` union, is deliberately not exported
— nothing outside the file narrows it). `badges.key`, `records.key`,
`nina_turns.trigger`/`error_code`,
`nina_shortcuts.kind`, `nina_tuning.relationship`, `nina_image_prefs.reference_source` and
`nina_error_logs.provider` are left as plain `text` pointing at an external catalog, for the same
"adding a member is not a migration"
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

**One FK is `restrict`, and it is the only one.** `nina_avatars.source_image_id` →
`nina_message_images.id` (2026-09-17) refuses the delete rather than degrading the row, because the
dependent row has **nothing of its own**: an album row with that column set owns no bytes and no
prose — it renders the linked Media row's Blob object and reads the linked row's `description` /
`search_keywords` / `negative_search_keywords` / `description_embedding`, all four of which stay
NULL on the pointer forever. `set null` would leave a row with no picture at all (unrecoverable
without re-copying the bytes, which is the duplication the pointer exists to avoid) and `cascade`
could silently take the "current profile picture" designation with it. So deleting a Media original
an Album pointer still names is refused **by the database**, and a caller's job is to turn that
refusal into a sentence before the constraint has to — the `nina_avatars_user_current_unq`
argument again: the alternative is a read-then-compare that is correct until two writers race.
This is deliberately the opposite call from `nina_message_images.message_id`'s `set null` one table
over, and the two are not inconsistent: there the dependent row is a whole photograph that survives
losing its bubble.

**`source_image_id` is spelled twice in this schema and means two different things.**
`nina_avatars.source_image_id` is an album row pointing at a chat row whose bytes and prose it
borrows (`restrict`). `nina_message_images.source_image_id` is a chat row pointing at an earlier
chat row whose bytes it re-shows (`set null`, F37) — different table, opposite direction, different
lifecycle. A reader who conflates them writes a query that answers the wrong question. What they do
share is `isOriginalPhoto()`'s convention: a row that borrows its bytes is excluded from collection
listings and from search, so one physical photograph is one hit.

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

**Two columns are vectors, they share one space, and every rule about them is a rule about their
width.** `nina_avatars.description_embedding` (2026-09-15) and
`nina_message_images.description_embedding` (2026-09-17) are both `vector(1536)` — the schema's only
pgvector columns, each with its own HNSW `vector_cosine_ops` index. The width is declared once, as
`NINA_EMBEDDING_DIMENSIONS` in `lib/db/schema/nina/embedding.ts`, re-exported by
`schema/nina/avatars.ts` and so still reachable through the `schema.ts` barrel, so the client
(`lib/nina/embedding.ts`) imports the columns' number rather than restating it. It lives here and
not beside `NINA_EMBEDDING_MODEL` in `lib/nina/openrouter.ts` because it is a property of the
columns, and because `drizzle-kit` loads `lib/db/schema/` outside Next — a `@/lib/nina/*` edge would
be the first path alias in its resolution path. (Why it is a leaf module and not a line in
`avatars.ts`: see the barrel note above.)

**One vector space across two tables is what makes a merged ranking possible at all.** Both columns
hold vectors produced by the same model at the same width and both indexes name the same operator
class, so a single query embedding ranked against both tables yields two cosine similarities that
are comparable numbers rather than two incomparable rankings. That is a standing obligation, not a
one-time fact: a re-embed that covered one table and not the other leaves the search ranking two
different spaces against one query, with no error anywhere. Four rules follow and none of them is
optional:

- **The model and the constant change together, in one migration, with a full re-embed — of both
  columns.** Two embedding models do not share a vector space, so changing one without the other
  does not degrade the ranking — it randomises it, with no error anywhere.
- **The keyword columns are an INPUT to the vector, never a second thing to rank by, and the
  negative ones never touch the vector at all.** Both tables carry the same pair beside their
  embedding: `search_keywords` is folded into the embedded text (`buildNinaAvatarEmbedText` in
  `lib/nina/avatarEmbedText.ts` — the name says avatar, the body is generic over any
  description+keywords pair), while
  `negative_search_keywords` is read alone by the ranker against the operator's typed query.
  Nothing may SELECT `search_keywords` to compare against a query, and nothing may fold
  `negative_search_keywords` into an embedding.
- **2000 is pgvector's hard ceiling for an HNSW index** (the `vector` type itself allows 16000). A
  wider model stores fine and then fails at `CREATE INDEX`, at migration time, against production.
- **The operator class is named at both ends.** The index is `hnsw (… vector_cosine_ops)` because
  the search uses `<=>`; an HNSW index built for one operator class does not serve another — a
  mismatched query silently falls back to a seq scan, which is correct and slow and reported
  nowhere. The index is deliberately **not** partial: pgvector's HNSW does not index NULL rows
  anyway, so `WHERE … IS NOT NULL` would only be one more predicate the planner must prove.

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

**A barrel over thirteen `queries/*.ts` modules plus one un-re-exported plumbing module** — see
the Overview. The § numbers below are the original monolith's sections, kept as the modules'
own header comments name them, so an old reference to "§7" still means the photo-lifecycle
functions even though they now live in `queries/photos.ts` rather than a numbered block of one
file.

Two invariants govern every module:

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

78 files import from this package statically (grep-measured 2026-09-12) — 62 source files plus 16
test-side (fourteen suites, `tests/support/fakeDb.ts` and the `tests/fixtures/ninaTurn.ts`
fixture) — and most of the rest of the test suite loads it with a dynamic `import()` in the test
body instead (18 more files), taking the total to 96 files. All of them go
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
- **`lib/nina/errorlogs.ts`** — `nina_error_logs`' entire production access: it imports `db` and
  the table directly and no other production file touches either, deliberately outside
  `lib/nina/queries.ts` because its reads are the first Nina reads with no `userId` in them (see
  the Overview and the table's own header in `schema.ts`).
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

Sixteen test-side files import statically. The notable ones: `tests/db.schema.test.ts`,
`tests/db.schema.nina.test.ts` and `tests/db.schema.errorlogs.test.ts` assert on the schema
*objects* themselves — table names, column names and SQL types, index names, FK on-delete
behaviour — via `getTableConfig`, with no database involved. **Those assertions are WHOLE-list
`toEqual`s, not `toContain`s**: a table's column names and index names are pinned as complete,
sorted lists, so adding one column or one index means editing the existing list (and its comment)
rather than appending a new `it(...)` beside it. That is deliberate — it makes an accidental column
a failing test rather than an unnoticed one — and it is why a schema change lands in that file in
the same commit, and why a later phase of the same plan set must not re-assert what an earlier one
already added. `tests/support/fakeDb.ts` builds the
recording fake that the wider suite uses, and `tests/db.client.test.ts` asserts that `@/lib/db`
re-exports the schema — those two (like most of the suite) load the package with a dynamic
`import()` inside the test body.

### Two facts worth knowing

**Direct `db` use outside this package is the exception, but no longer a short list.** Eleven
files import the instance: `auth.ts` (the NextAuth adapter tables), `lib/admin/users.ts`,
`lib/admin/memoryStore.ts` (admin memory-ledger writes beside `lib/nina/queries.ts`'s),
`lib/push/queries.ts`, `lib/llm/textModel.ts` (the `app_settings` reader), `lib/nina/imagejobs.ts`,
`lib/nina/queries.ts`, the turn pipeline's `lib/nina/chatturn.ts`, `lib/nina/turnrevive.ts` and
`lib/nina/searchActions.ts`, and `lib/nina/errorlogs.ts` — each bypassing the queries.ts
indirection for a stated reason (the error-log module's is that its reads are deliberately not
user-scoped). The other fifty-one source files call named functions; `lib/nina/queries.ts` remains
the choke point for conversation, avatar, folder, shortcut and image-prefs access.

**`scripts/` imports nothing from here.** Every script that touches Postgres (`db-smoke.mjs`, the
two backfills, `nina-profpic.mjs`, `nina-image-worker.ts`, `blob-reap.mjs`, the probes and capture
helpers) instantiates `neon()` from `@neondatabase/serverless` directly, because it cannot resolve
the `@/` alias or tolerate `server-only`. `drizzle.config.ts` likewise does not import the package —
it names `'./lib/db/schema.ts'` as a config string. **A schema change is therefore not automatically
reflected in a script**, and a script writing a `nina_*` table is writing raw SQL that no type
checks.

`NinaAvatar`, `NewNinaAvatar`, `NinaFolder`, `NewNinaFolder`, `NinaTurn`, `NewNinaTurn`,
`NinaMessage`, `NewNinaMessage`, `NinaMessageImage`, `NewNinaMessageImage`, `NinaChatSession`,
`NewNinaChatSession`, `NinaShortcutRow` and `NewNinaShortcutRow` currently have **no importers**
(grep-verified 2026-09-13, repo-wide, `components/` included) — callers pass around the shapes
`lib/nina/queries.ts` returns instead (`lib/nina/queries.ts`'s own comment explains why it names
`NinaShortcutRecord`, not the row). `knip` does not flag any of these: it does not treat an
`$inferSelect`/`$inferInsert` type alias as unused while the table it derives from is still
imported, so a plain grep — not `npm run knip` — is what finds this particular gap. That is a
reason to keep grep-verifying this specific list, not a reason to delete the types: they are the
row-type half of `schema.ts`'s "Row types" contract ("import these instead of re-deriving
`$inferSelect` at a call site"), kept for whichever future caller needs the shape Nina's own query
layer does not currently expose. (The string `NinaAvatar` also names an unrelated React component,
`components/nina/NinaAvatar.tsx`; that is a coincidence, not an import of the row type.)

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
- **Both HNSW indexes are insurance, not a requirement.** A per-user album or media collection of
  hundreds ranks fine on a sequential scan — a few hundred 1536-float dot products is
  sub-millisecond. Each is declared now because declaring it now is free and adding it later is a
  migration, because both premises ("hundreds of profile pics", a chat archive that only grows) are
  growth premises, and because the merged search reads both tables on every query. Building each
  cost nothing at migration time either: every row was NULL and pgvector does not index NULLs, so
  the `CREATE INDEX` had nothing to build over. That is the cheapest moment either index will ever
  cost, and it is the argument for declaring the next one at its column's `ADD COLUMN` too.
- **A `restrict` FK buys a sequential scan on every parent delete unless the referencing side is
  indexed.** Postgres indexes only the referenced side, so `nina_avatars_source_image_id_idx` exists
  to answer "is any album row pointing at THIS media row?" — a question the database now asks on
  every `nina_message_images` delete. Same structural reason as
  `nina_messages_session_seq_idx`'s second job above. Plain btree, not unique (no invariant forbids
  two pointers at one original) and not partial (the FK's own lookup is generated by Postgres, so
  it cannot be relied on to carry a matching `IS NOT NULL` for a partial index to match).
- One read is knowingly *not* optimised: the avatar subtree scan (`folder` prefix match) cannot
  range-scan a b-tree under a non-C collation without `text_pattern_ops`, so it degrades to a
  `user_id` scan with a filter. Accepted deliberately — it runs once per dropped folder over a
  table sized in hundreds, and a second index would be maintained on every insert for a query that
  runs when a human drags something.

No benchmark files exist for this package. Correctness is covered by fourteen suites:
`db.client.test.ts`, `db.ownership.test.ts`, `db.schema.test.ts`, `db.schema.nina.test.ts`,
`db.schema.errorlogs.test.ts`, `db.schemaDrift.test.ts` (the drift script's own pure comparators,
no database), and eight `db.queries.*.test.ts` files.

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
| `npm run ci:schema-drift-guard` | Read-only. Asks whether the database MATCHES this folder — stranded migrations, undeclared columns, missing indexes. The only command here that compares the two; `db:check` never opens a connection |

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
copy written later would read a column an earlier migration had already dropped),
`0001_badge_award_ledger` (filling `dedupe_key` before the PK that requires it), and
`0023_dry_kabuki` (a hand-written `CREATE EXTENSION IF NOT EXISTS vector` above the
generated DDL — **drizzle-kit emits the column and the index and assumes the extension exists**, so
a generated-only file would replay on a fresh database as an error; `IF NOT EXISTS` makes a re-run,
or a database where someone already enabled it, a no-op). The second pgvector column,
`nina_message_images.description_embedding` in `0026_media_album_unified_search`, needed **no**
such line and is generated verbatim: the extension is already installed and `0023` replays above it
on a fresh database. All of them keep
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

**Do not hand-verify this again — run `npm run ci:schema-drift-guard`.** Everything in the
paragraph below was established by hand on 2026-09-12 and re-established by hand on 2026-09-13,
which is precisely the kind of dated claim that rots between readings. `scripts/check-schema-drift.mjs`
now asks the database the same questions on demand: it classifies every journal entry as applied,
pending or **stranded** (the distinction that matters, and the one no drizzle command makes), and
diffs the snapshot tip against `information_schema` — every table, column, type, nullability,
foreign key, unique constraint and index. With no reachable `DATABASE_URL` it runs the static half
only and says so, which is how it also runs in CI.

**One declared narrowing in the guard, added with the vector column.** `information_schema.columns`
structurally cannot report a vector's width — it lives in `pg_attribute.atttypmod`, which the
script's query does not read — so `normalizeSnapshotType` folds `vector(N)` to bare `vector` and
the comparator checks the TYPE while saying nothing about the width. It is a narrowing, not a
widening: `halfvec`, `sparsevec` and `bit` are distinct `udt_name`s and stay distinct, with a
negative control in `tests/db.schemaDrift.test.ts` pinning that. The width is pinned elsewhere, in
three places holding one number — `NINA_EMBEDDING_DIMENSIONS`, `tests/db.schema.nina.test.ts`
asserting `vector(NINA_EMBEDDING_DIMENSIONS)` against the schema object, and
`lib/nina/embedding.ts`'s width guard rejecting any response of the wrong length before it can
reach the column.

**Deploy state (2026-09-15: all 23 of 23 journal entries applied, zero drift — run the guard,
do not trust this line):** Production has no
`nina_tuning.revision`, no `nina_turns.tuning_revision`, no `nina_image_prefs.revision`; it does
have `content_hash`, `perceptual_hash`, `perceptual_sig`, `prompt_template`, `model`,
`app_settings` and `nina_error_logs` (with its one index). It also has
`nina_avatars.description_embedding`, its HNSW index and the `vector` extension: the embedding
migration is **already applied**, confirmed 2026-09-15 by reading `information_schema.columns`,
`pg_indexes` and `pg_extension` directly — not by `db:migrate`'s exit code, which is green over a
no-op. (That migration's file is `0023_dry_kabuki`, journal-measured 2026-09-17; `0022` is
`0022_red_thunderbolts`, the `content_hash` pair. The doc-history table below said otherwise until
today, which is this section's own "do not trust an old document's migration file name" warning
catching itself.)

**2026-09-17 (`P2-DB-A002`): the journal holds 27 entries, `0000`–`0026`, and
`0026_media_album_unified_search` has been applied to the one database this repo has.** That
migration is additive-only — four nullable `ADD COLUMN`s, one `ADD CONSTRAINT`, two `CREATE INDEX`,
no `DROP`, no `SET NOT NULL`, no backfill — so it rewrites no table and is replay-safe on a fresh
database. Its entries `0024_nina_avatar_search_keywords` and `0025_handy_santa_claus` (the album's
two keyword columns) precede it. As always: this line is a dated claim, and
`npm run ci:schema-drift-guard` is the answer to "is it true now?".

**2026-09-18: the journal's tip is `0031_greedy_jocasta`, and it is deliberately NOT applied.**
The file holds 32 entries, `0000`–`0031` (counted from `drizzle/meta/_journal.json` that day; the
applied state of `0027`–`0030` was not measured here — run the guard). `0031` is a single
statement, `ALTER TABLE "nina_image_prefs" DROP COLUMN "prompt_length"`, and it is generated and
committed but left unapplied on purpose: **a destructive migration is applied only after the code
that stopped referencing the column is deployed, never before.** The reason is mechanical, not
stylistic. `readNinaImagePrefs` in `lib/nina/queries/imageprefs.ts` issues a bare
`.select().from(ninaImagePrefs)`, and Drizzle expands a bare select into the schema object's
explicit column list at query time — so a database missing a column the *deployed* schema still
declares breaks every read of that table, not merely the reads that wanted the dropped field.
Hence the two-step: deploy, then `db:migrate`. Additive migrations may lead a deploy; `DROP COLUMN`
and `SET NOT NULL` must follow one.

Note what this state is *not*: a journal entry ahead of the database this way is **pending**, not
stranded. `0031`'s `when` is the newest in the file and therefore above the ledger watermark, so
`db:migrate` will run it the moment it is invoked — which is exactly why the gap must be closed by
running it deliberately after the deploy, and why the drift guard will report `0031` as pending
(correctly) in the window between the two steps.

**2026-09-19 (`P1-DB-A008`): the journal's tip is `0035_first_loa` — 36 entries, `0000`–`0035` —
and it is generated but NOT yet applied.** Applying it is a manual pre-deploy step
(`npm run db:migrate`); the applied state of `0027`–`0034` was not measured here, so run the guard
rather than reading a count off this line. The file is four statements, all
`ALTER TABLE "nina_photoshop_jobs" ADD COLUMN` of a nullable column
(`crop_ratio_label text`, `crop_scale numeric(5,3)`, `crop_x integer`, `crop_y integer`), with no
`DROP`, no `SET NOT NULL`, no index and no backfill — so it rewrites no table and is replay-safe on
a fresh database. Being purely additive it is one of the migrations that **may** lead its deploy,
unlike `0031`: code that predates the columns never names them, and every row written before it
reads back NULL, which is the correct value (those jobs had no crop). Nothing in the tree acts on
the four columns yet — they are written and read back by `lib/nina/photoshopJobs.ts` and otherwise
inert.

**`0011_rare_blockbuster` was the one stranded entry, and on 2026-09-13 it was repaired by hand.**
For six days it sat journalled-but-unapplied: its journal `when` (1788786634959) is older than the
ledger watermark (1789176119493), and the migrator applies an entry only beyond that watermark, so
`db:migrate` would never have run it and would never have complained. The repair was the only one
available — `db:generate` cannot see the column and will not emit it — and it was two statements in
one transaction: the migration's own `ALTER TABLE nina_memory_facts DROP COLUMN confidence`, then
an `INSERT` of its `(hash, created_at)` into `drizzle.__drizzle_migrations` so the ledger stops
lying. Backfilling that row is watermark-safe *because* its `created_at` is below the current max:
it cannot raise the watermark and so cannot cause anything to re-apply. Verified after the fact —
22/22 applied, watermark unchanged, 308 columns, guard exit 0. All four rows held the `DEFAULT 100`
and nothing read the column, so no information was lost; the values are backed up at
`~/confidence-backup-20260913.sql` anyway.

The lesson outlives the incident: **a stranded migration is not a pending one.** Nothing in drizzle
draws that distinction, which is why `npm run ci:schema-drift-guard` exists and why this paragraph
should never again be the thing you rely on.

**And it is the ONLY drift.** The 2026-09-12 pass checked the columns it had reason to suspect; the
2026-09-13 guard run compared the whole surface — 29 tables, 309 columns, 37 foreign keys, 31
indexes, 1 unique constraint (counts as measured that day) — and `nina_memory_facts.confidence` is
the single divergence. The 2026-09-15 run after the embedding migration (`0023_dry_kabuki`) reports
zero drift over 29 tables and 309 columns (measured 2026-09-15; the table count is unchanged because
that migration adds no table, and `0026` adds none either — it is four columns on two existing
tables). That is
the useful half of the result: the stranded migration did not take anything else with it, and the
snapshot chain is unbroken (every `prevId` links, despite the collision-era renumbering above). Do
not re-derive this by hand either — the counts are what the guard prints on a clean run.

### Gotchas

- **`db.transaction()` throws.** Build a statement array and use `db.batch`.
- **Un-current before inserting.** `nina_avatars_user_current_unq` is violated *mid-transaction* by
  an insert-first ordering, so a writer must clear the old `is_current` row before inserting the
  new one, in one batch.
- **Never check-then-insert against a unique index.** Catch `23505` via `isUniqueViolation`; two
  tabs will race through any check.
- **The two crop quads do not share a unit.** `nina_avatars` measures both offsets against the
  frame's width (square frame); `nina_photoshop_jobs` measures `crop_x` against width and `crop_y`
  against height (rectangular frame). Both are all-or-nothing: treat "any one of the columns is
  null" as no crop rather than filling in the missing member.
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
- **`description_embedding` must stay OUT of the shared row projection.** `avatarColumns` in
  `lib/nina/queries/columns.ts` (and the `shapes.ts` row types over it) names every avatar column
  the query layer returns — and deliberately not this one. A 1536-float vector on a shared
  projection rides every album read: roughly 1.5 MB of extra wire per page of the explorer, for a
  value no renderer, prompt or export has any use for, and it would break four suites'
  `projectedRow(...)` fixtures on the way. Search selects the column (or, better, a similarity
  expression over it) in its own statement. **The rule generalises: a column whose only consumer is
  one query does not belong in the projection every query shares.** The rule now has a second
  instance to keep honest: `imageColumns` in the same file is `nina_message_images`' shared
  projection, and it likewise names neither `description_embedding` nor the two keyword columns.
- **A `nina_avatars` row with `source_image_id` set stores no prose of its own — and that is the
  synchronisation mechanism, not an omission.** `description`, `search_keywords`,
  `negative_search_keywords` and `description_embedding` stay NULL on a pointer row forever,
  because the linked `nina_message_images` row is the only place that data lives; editing it in
  one surface is visible in the other because there is no second copy to drift. A writer that
  "helpfully" fills any of those four on a pointer row creates exactly the duplicate the design
  removed, and a reader that reads them off the pointer row instead of following the link sees a
  photograph with no description. Follow the link; never copy across it.
- **Every path that writes `description` must write `description_embedding` in the same step —
  on both tables.**
  A row with prose and a NULL embedding is invisible to search while looking perfectly healthy in
  the explorer — the one failure mode here with no symptom. NULL itself is a legal state forever
  (a photo whose describe pass failed is simply not in the search index; a cosine predicate skips
  NULL rows and HNSW does not index them, so "unsearchable" costs nothing at read time), which is
  exactly why a *stale* NULL beside a fresh description cannot be detected by the column alone.
  `search_keywords` is an input to the same vector, so writing it carries the same obligation; a
  model re-describe pass, on the other hand, must **not** touch either keyword column — those are
  the operator's correction of the model's opinion, and a pass that erased the correction would
  erase it every time it was needed.
- **`NOT NULL` cannot be added to a populated table in one statement.** A new required column is
  three statements and a backfill between them, in the migration file itself. See `0004`.
- **A re-attached photo is a reference, not a copy.** `nina_message_images` rows share a `blob_url`
  on purpose: re-attaching an album face or an earlier chat photo writes a new row pointing at the
  same Blob object, and `source_avatar_id` / `source_image_id` are how the row admits it. Never
  delete such a row to de-duplicate a collection — every bubble, photo-viewer, download control and
  prompt read reads this table by `message_id`, so a missing row is a blank bubble. Filter the three
  collection reads instead (`isOriginalPhoto()` in `lib/nina/queries.ts`), and leave the pointers
  naming the **original** rather than the immediate predecessor, so a `SET NULL` cannot resurrect a
  duplicate. Note the spelling collision: this is `nina_message_images.source_image_id` (chat → chat,
  `set null`), **not** `nina_avatars.source_image_id` (album → chat, `restrict`, and the pointer row
  owns nothing). See the FK conventions above before writing a query over either.
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
  `DEFAULT false` on the six focus flags would be a second copy of it in a second language,
  drifting silently. No row means the defaults. The two image-gen controls, `prompt_template` and `model`, are `.notNull()`
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
six times has): see **Migrations → Deploy state** above — as of 2026-09-19 the journal holds 36
entries (`0000`–`0035`), and its tip `0035_first_loa` (the four nullable `nina_photoshop_jobs` crop
columns) is generated-but-unapplied pending a manual `npm run db:migrate`; it is additive, so
unlike a drop it may lead its deploy. Earlier: as of 2026-09-18 the journal held 32
entries (`0000`–`0031`), and `0031_greedy_jocasta` (the `prompt_length` drop) is
generated-but-unapplied by design, because destructive migrations follow their deploy rather than
leading it; `0026_media_album_unified_search` was applied 2026-09-17; the embedding
migration `0023_dry_kabuki` was verified applied on 2026-09-15 against
`information_schema` / `pg_indexes` / `pg_extension` rather than against an exit code, and
`0011_rare_blockbuster` was repaired by hand back on 2026-09-13. Do not read that paragraph for a
current answer; run `npm run ci:schema-drift-guard`, which is the whole point of it existing.

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
| — | drop shortcut/ledger confidence | `nina_memory_facts` − `confidence` | `0011_rare_blockbuster` — stranded below the watermark for six days; applied by hand 2026-09-13 |
| 2026-09-09 | — | `nina_message_images.message_id` becomes nullable, FK `set null` | `0013_fixed_serpent_society` |
| 2026-09-09 | F41 R3 | `nina_tuning` − `wardrobe` | `0015_retire_nina_tuning_wardrobe` |
| 2026-09-09 | P1-RI-A040 (simplify-personality p1) | `nina_tuning` − `revision`; `nina_turns` − `tuning_revision` | `0016_retire_tuning_revision` (applied) |
| 2026-09-09 | P1-RI-A029 (admin-imagegen-simplify p2) | `nina_image_prefs` − `revision` | `0017_retire_imageprefs_revision` (applied) |
| 2026-09-10 | P1-DB-A006 (media-dedupe p1) | `nina_message_images` + `content_hash` + partial non-unique index | `0018_real_madame_web` (applied) |
| 2026-09-10 | media-dedupe p2 | `nina_message_images` + `perceptual_hash`/`perceptual_sig` | `0019_massive_dracula` (applied) |
| 2026-09-10 | image-gen controls | new `app_settings`; `nina_image_prefs` + `prompt_template`/`model` | `0020_image_gen_controls` (applied) |
| 2026-09-11 | lib-db-queries-yagni | removed dead code: `getMonthlyTotals`/`fillZeroMonths` (and `MonthlyTotal`), `getObservedMaxHr`/`getObservedMaxHrExcludingRun`, `listExtractions`, `deletePhoto` | — |
| 2026-09-12 | nina-llm-fallback-error-logs p1 | new `nina_error_logs` — one best-effort row per failed Nina model call (`user_id` nullable, one index, no backfill) | `0021_nina_error_logs` (applied) |
| 2026-09-12 | db-schema-split | `schema.ts` split into eight domain modules behind an `export *` barrel; no table, column or behavior changed | — |
| 2026-09-12 | nina-queries-split, db-queries-split | `queries.ts` split into thirteen `queries/*.ts` modules (+ `queries/internal.ts`, not re-exported) behind an `export *` barrel; `lib/nina/queries.ts` split in parallel; no query behavior changed | — |
| 2026-09-13 | schema-llm-insights (doc-drift fix) | this page's file-layout language updated to match the two splits above, which landed after that morning's compaction pass; the "no importers" row-type list extended from 2 to 8 entries (grep-verified, `components/` included) | — |
| 2026-09-15 | P2-DB-A001 (admin-album-semantic-search p1) | `nina_avatars` + nullable `description_embedding vector(1536)` and an HNSW `vector_cosine_ops` index; `NINA_EMBEDDING_DIMENSIONS` exported through the schema barrel; the drift guard taught to fold `vector(N)` (width pinned by the schema test instead); nothing writes the column in this phase | `0023_dry_kabuki` (applied; hand-written `CREATE EXTENSION IF NOT EXISTS vector` above the generated DDL — journal-measured 2026-09-17, this row previously named a tag that does not exist) |
| 2026-09-15 | nina-album-search-relevance-tools R2 | `nina_avatars` + `search_keywords`, then + `negative_search_keywords` — both nullable `text`, no index: one is an input to the embedding, the other is read alone by the ranker | `0024_nina_avatar_search_keywords`, `0025_handy_santa_claus` (both applied) |
| 2026-09-17 | P2-DB-A002 (media-album-unified-search p1 of 4) | `nina_message_images` + the album's three search columns and an HNSW `vector_cosine_ops` index; `nina_avatars` + `source_image_id` (FK → `nina_message_images.id`, the schema's first `ON DELETE RESTRICT`) and its plain btree; `NINA_EMBEDDING_DIMENSIONS` moved to the leaf module `schema/nina/embedding.ts` to break the `avatars` ⇄ `chat` cycle the new FK creates, barrel surface unchanged; nothing writes any of the four columns in this phase | `0026_media_album_unified_search` (applied; additive-only, generated, no hand-edits) |
| 2026-09-19 | P1-DB-A008 (photoshop-aspect-ratio-crop p2) | `nina_photoshop_jobs` + the four nullable crop columns (`crop_ratio_label`, `crop_scale numeric(5,3)`, `crop_x`, `crop_y`), all-four-null = no crop, no index, no backfill; `NinaPhotoshopJobArgs` in `lib/nina/photoshopJobs.ts` gained the four optional fields, `openNinaPhotoshopJob` writes them (`?? null`) and `claimNinaPhotoshopJob` reads them back; `scripts/photoshop.ts`'s raw INSERT kept column-list parity with explicit NULLs. Nothing acts on the columns yet | `0035_first_loa` (generated, **not applied** — additive, so it may lead its deploy; see Migrations → Deploy state) |
| 2026-09-18 | prompt-length removal | `nina_image_prefs` − `prompt_length` (19 → 18 columns) — the sliding-bar control the operator never used, gone from schema, admin panel and prompt assembly | `0031_greedy_jocasta` (generated, **not applied** — a `DROP COLUMN` waits for the code deploy; see Migrations → Deploy state) |
