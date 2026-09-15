# Phase 1: Schema + cross-table dedup detection + push kind

**Plan set:** `DUP_IMAGE_PUSH_NOTIFY_PLAN.md`
**Analysis:** `20260915-090023-K7Q2_code_analyzer.md`
**Satisfies:** R1 (the detection + notification machinery every upload route will call), R2 (the `/photo/<kind>/<id>` URL contract the notification carries)
**Depends on:** none
**Difficulty:** HARD
**Package:** `lib/photos` (primary), plus `lib/db/schema`, `lib/db/queries`, `lib/nina/queries`, `lib/push`

---

## Goal

After this phase, `run_photos` and `nina_avatars` each carry a nullable `content_hash` column with a
partial index, and there is one read-only function — `findGlobalDuplicatePhoto(userId, hash, opts)` —
that answers "do these bytes already exist anywhere in this user's image collection?" across all
three image tables and returns a `ResolvedPhotoPointer` (`{kind:'shot'|'avatar'|'image', id, url}`)
or `null`. There is a new `duplicate_image` push kind and one helper,
`notifyDuplicateImagePush(userId, pointer)`, that turns such a pointer into a push whose `url` is
exactly `/photo/<kind>/<id>`. Nothing calls any of it yet — phases 2, 3 and 4 do — and no existing
dedup decision, no existing push, and no existing route behaviour changes.

## Interface Contract

The reconciler reads this section to detect cross-phase conflicts. Be exact and exhaustive.

**THE URL CONTRACT — byte-for-byte, phases 2/3/4 all depend on it:**

```
/photo/<kind>/<id>          kind ∈ {'shot','avatar','image'}   id = lib/id.ts nanoid(12)
```

Built by exactly one function, `photoViewerPath(pointer)` in `lib/photos/pointer.ts`. No trailing
slash, no query string, no URL-encoding (the kind is one of three literals and `lib/id.ts`'s
alphabet is `[0-9A-Za-z_-]`, so neither segment can need escaping). **Phase 2's route directory must
therefore be `app/photo/[kind]/[id]/page.tsx`** and its `kind` segment must accept those three
literals and nothing else. Phases 3 and 4 must never hand-build this path — they call
`notifyDuplicateImagePush`, which calls `photoViewerPath`.

**Creates:**

- `lib/photos/pointer.ts` — new file. Exports:
  - `type PhotoPointerKind = 'shot' | 'avatar' | 'image'`
  - `const PHOTO_POINTER_KINDS: readonly PhotoPointerKind[]`
  - `interface PhotoPointer { kind: PhotoPointerKind; id: string }`
  - `interface ResolvedPhotoPointer extends PhotoPointer { url: string }`
  - `function isPhotoPointerKind(value: unknown): value is PhotoPointerKind`
  - `function photoViewerPath(pointer: PhotoPointer): string`
  - `function parsePhotoViewerSegments(kind: unknown, id: unknown): PhotoPointer | null`
- `lib/photos/pointer.test.ts` — new file.
- `lib/photos/globalDuplicate.ts` — new file. Exports:
  - `interface GlobalDuplicateOptions { exclude?: PhotoPointer | readonly PhotoPointer[] | null }`
  - `async function findGlobalDuplicatePhoto(userId: string, contentHash: string | readonly string[], options?: GlobalDuplicateOptions): Promise<ResolvedPhotoPointer | null>`
  - **`exclude` takes a LIST as well as a single pointer, and the list form is the load-bearing
    one** (reconciler ruling, round 1). Three of the five upload routes write MORE THAN ONE row per
    gesture — `/api/extract` writes up to three `run_photos` rows, `sendNinaMessage` writes N
    `nina_message_images` rows, and a folder drop writes up to fifty `nina_avatars` rows — and two
    files in one gesture can carry identical bytes. Excluding only "the row asking" then makes each
    of them match the other and announce a photograph created seconds ago in the same gesture,
    which is not what "already exists" means. Phases 3 and 4 pass arrays; phase 4's two chat call
    sites pass a single pointer, which is why both spellings are accepted.
- `lib/photos/globalDuplicate.test.ts` — new file.
- `lib/push/duplicateImage.ts` — new file. Exports:
  - `const DUPLICATE_IMAGE_PUSH_KIND = 'duplicate_image'` (typed `NinaPushKind`)
  - `const DUPLICATE_IMAGE_PUSH_BODY: Record<PhotoPointerKind, string>`
  - `async function notifyDuplicateImagePush(userId: string, pointer: PhotoPointer): Promise<void>`
    — `PhotoPointer`, not `ResolvedPhotoPointer`: a `ResolvedPhotoPointer` is assignable to it
    (it extends it), so both of phases 3/4's call shapes pass, and the narrower parameter is what
    stops the resolved form's BLOB `url` from ever being mistaken for the notification's tap target.
- `lib/push/duplicateImage.test.ts` — new file.
- `lib/db/queries/photos.ts` → `findRunPhotoByContentHash(userId, contentHash, excludeIds?: readonly string[])` (also reachable through the `@/lib/db/queries` barrel via its existing `export * from './queries/photos'`).
- `lib/nina/queries/avatars.ts` → `findNinaAvatarByContentHash(userId, contentHash, excludeIds?: readonly string[])` (also reachable through the `@/lib/nina/queries` barrel via its existing `export * from './queries/avatars'`).
- Schema column `run_photos.content_hash` (`text`, nullable) + index `run_photos_content_hash_idx`.
- Schema column `nina_avatars.content_hash` (`text`, nullable) + index `nina_avatars_user_content_hash_idx`.
- Migration `drizzle/0022_<drizzle-chosen-name>.sql` + `drizzle/meta/0022_snapshot.json` + a new `_journal.json` entry at `idx: 22`.

**Signature changes:**

- `buildNinaPushPayload(input)` (`lib/push/payload.ts:267`) gains an **optional** third input field
  `url?: string`, defaulting to the existing `PUSH_TARGET_URL` (`'/nina'`). Every existing caller
  (`lib/push/send.ts:156`, `scripts/nina-image-worker/push.ts`) is unaffected and must not change.
  The wire version `v` stays `1` — this is an addition, not a meaning change.
- `sendNinaPush(userId, messages, kind)` (`lib/push/send.ts:151`) gains an **optional** fourth
  positional parameter `url?: string`, forwarded to `buildNinaPushPayload` (Step 8c).
- `NinaPushNotifier` / `notifyNinaPush` (`lib/push/send.ts:219-244`) gain the same optional fourth
  parameter (Step 8c). `pushNotifier` (`:255-269`) is **not** changed — a function with fewer
  parameters than its type is assignable, so it still `satisfies ProactiveNotifier`.

**Additions to closed lists (each is a test edit as well as a source edit):**

- `NINA_PUSH_KINDS` (`lib/push/payload.ts:161-200`) gains `'duplicate_image'`.
- `BARREL_VALUE_EXPORTS` (`lib/nina/queries.test.ts:26-114`) gains `'findNinaAvatarByContentHash'`
  — **this test fails the moment the query is added and is not optional.**
- `tests/db.schema.nina.test.ts:268` `names(schema.ninaAvatars)` gains `'content_hash'` (20 → 21
  columns, and the test title says "twenty columns").
- `tests/db.schema.nina.test.ts:315` `indexNames(schema.ninaAvatars)` gains
  `'nina_avatars_user_content_hash_idx'`.
- `tests/db.schema.test.ts:303-308` `indexNames(schema.runPhotos)` gains `'run_photos_content_hash_idx'`.

**Deletes:** none.
**Renames:** none.

**Requires (from earlier phases):** none — this phase is the root of the set.

**Leaves alone (owned by others):**

- `lib/nina/attach.ts` — **not touched at all.** Its `NinaPhotoKind` stays the two-way
  `'avatar' | 'image'` union; see Step 3's rationale for why widening it in place is unsafe. Phase 2
  must not widen it either.
- `lib/nina/dedupe.ts`, `lib/nina/imageDedupe.ts`, `lib/admin/chatPhotos.ts` — the three write-decision
  modules. Read-only here; not imported, not called, not restructured (`lib/nina/dedupe.ts:36-43`).
- `lib/nina/perceptual.ts`, `lib/nina/perceptualSign.ts` — untouched.
- `lib/service-worker.js` — untouched. Its `notificationclick` handler is already generic over
  `payload.url`; phase 2 verifies, nobody changes it.
- `app/photo/**` — phase 2.
- `app/api/extract/route.ts`, `components/extract/UploadPicker.tsx`, `components/nina/useComposerPhotos.ts`, `lib/nina/actions/send.ts` — phase 3.
- `lib/admin/chatPhotoActions.ts`, `lib/admin/ninaAlbumUploadActions.ts`, `components/admin/explorer/useFolderUpload.ts` — phase 4. In particular the unconditional `admin_chat_photo` push at `lib/admin/chatPhotoActions.ts:407-416` is **not** touched here.
- `lib/nina/queries/images.ts`'s `findNinaImageByContentHash` — **called, never modified.** Its
  signature, its `isOriginalPhoto()` filter and its newest-first ordering all stay exactly as they are.

## Files

| File | Action | What changes |
|---|---|---|
| `lib/db/schema/runs.ts` | modify | `runPhotos` (`:289-319`) gains nullable `contentHash` + a partial index |
| `lib/db/schema/nina/avatars.ts` | modify | `ninaAvatars` (`:150-219`) gains nullable `contentHash` + a partial index |
| `drizzle/0022_*.sql` | create (generated) | two `ADD COLUMN`s + two `CREATE INDEX`es |
| `drizzle/meta/0022_snapshot.json`, `drizzle/meta/_journal.json` | create / modify (generated) | snapshot chain tip + journal idx 22 |
| `lib/photos/pointer.ts` | create | the 3-way pointer type and the one `/photo/<kind>/<id>` builder |
| `lib/photos/pointer.test.ts` | create | freezes the URL grammar |
| `lib/db/queries/photos.ts` | modify | new `findRunPhotoByContentHash` after `listExtractionPhotos` (`:71`) |
| `lib/nina/queries/avatars.ts` | modify | new `findNinaAvatarByContentHash` after `getNinaAvatarBySourceKey` (`:227-256`) |
| `lib/nina/queries.test.ts` | modify | frozen barrel surface `:47-48` gains the new name |
| `lib/photos/globalDuplicate.ts` | create | the three-table read-only lookup |
| `lib/photos/globalDuplicate.test.ts` | create | a hit in each table, a miss, the exclusion |
| `lib/push/payload.ts` | modify | `NINA_PUSH_KINDS` `:200` gains `duplicate_image`; `buildNinaPushPayload` `:267` gains optional `url` |
| `lib/push/payload.test.ts` | modify | url-override case + the new kind |
| `lib/push/send.ts` | modify | Step 8c — `sendNinaPush` / `NinaPushNotifier` / `notifyNinaPush` gain the optional `url` (was missing from this table in the draft; reconciler round 1) |
| `lib/push/duplicateImage.ts` | create | the notify helper |
| `lib/push/duplicateImage.test.ts` | create | asserts the exact url and kind reach `notifyNinaPush` |
| `tests/db.schema.test.ts` | modify | `run_photos` index + column assertions (`:287-314`) |
| `tests/db.schema.nina.test.ts` | modify | `nina_avatars` column + index assertions (`:266-330`) |

*(The plan index's draft estimated "~6 files". The real count is 18 because five of them are the
closed-list tests this repo uses to freeze schema shape and barrel surface —
`lib/nina/queries.test.ts`, `tests/db.schema.test.ts`, `tests/db.schema.nina.test.ts`,
`lib/push/payload.test.ts` — plus the generated migration triple. None of them is scope creep: each
fails on the first source edit. The index's Phases table now carries 18.)*

> **Two files in this table are also touched by later phases. The sequence is fixed and this phase
> is first**, so phases 2/3/4 read a tree that already contains these edits:
>
> - `lib/db/queries/photos.ts` — this phase inserts `findRunPhotoByContentHash` immediately after
>   `listExtractionPhotos`. **Phase 2** then inserts `RunPhotoPoint` + `getRunPhoto` after *that*
>   function (still before `setPhotoExcludedFromShare`), and **phase 3** edits `NewPhotoInput` and
>   `attachExtractionPhotos` near the top of the file. Three disjoint regions, one shared
>   `drizzle-orm` import line, which this phase rewrites in full (Step 5a) and neither of the others
>   touches.
> - `lib/nina/queries/avatars.ts` — this phase inserts `findNinaAvatarByContentHash` after
>   `getNinaAvatarBySourceKey` (~`:256`), which pushes everything below it down by roughly 45 lines.
>   **Phase 4** edits `insertNinaAvatars`, quoted in its plan at `:598-620` — those are pre-phase-1
>   line numbers; phase 4 must locate the function by name, not by line.

---

## Prerequisite: the worktree has no `node_modules` and no `.env.local`

Verified 2026-09-15: `/home/miftah/.worktrees/run-insights/dup-image-push-notify` has neither.
`drizzle.config.ts:8-13` throws without `DATABASE_URL_UNPOOLED`, so `npm run db:generate` cannot run
until both exist. Do this **first**, and do a real install — a `node_modules` symlink passes vitest
and tsc but Turbopack's build rejects it:

```bash
cd /home/miftah/.worktrees/run-insights/dup-image-push-notify
cp /home/miftah/run-insights/.env.local .env.local
npm install
```

**`.env.local`'s `DATABASE_URL` is production.** This repo has exactly one database. Do **not** run
`npm run db:migrate` as part of implementing this phase — generating the migration files is this
phase's job; applying them to production is a deploy-time decision. Both new columns are nullable
additive columns, so the migration is safe to apply before or after the deploy, but that call is not
this phase's to make.

---

## Implementation Steps

### Step 1: Add `content_hash` to `run_photos`

**File:** `lib/db/schema/runs.ts:289-319` (the `runPhotos` table)

**Change:** add one nullable column between `bytes` and `sortOrder`, and one partial index. The
column's semantics are `nina_message_images.content_hash`'s, stated once there
(`lib/db/schema/nina/chat.ts:~640-690`) and referred to rather than re-argued.

**Code:** replace the whole `runPhotos` declaration with:

```ts
export const runPhotos = pgTable(
  'run_photos',
  {
    id: text('id').primaryKey(),
    /**
     * R-1 — the attachment point at upload time. A photo exists before any run does: the vision
     * call has not run yet, so `occurred_on` (NOT NULL) is unknown, and a placeholder `runs` row
     * would both violate D1 and collide with the R-5 dedupe index on the second upload of a day.
     */
    extractionId: text('extraction_id')
      .notNull()
      .references(() => extractions.id, { onDelete: 'cascade' }),
    /** R-1 — backfilled by the review commit, once a real run row exists. */
    runId: text('run_id').references(() => runs.id, { onDelete: 'cascade' }),
    blobUrl: text('blob_url').notNull(),
    pathname: text('pathname').notNull(),
    kind: text('kind').$type<PhotoKind>().notNull(), // 'summary'|'splits'|'heartrate'|'other'
    width: integer('width'),
    height: integer('height'),
    bytes: integer('bytes'),
    /**
     * ── SHA-256 OVER THIS ROW'S STORED BYTES, AND NOTHING ELSE ───────────────────────────────
     *
     * 64 lowercase hex characters, `lib/photos/contentHash.ts` the only intended producer, and
     * the semantics are `nina_message_images.content_hash`'s VERBATIM — that column's header
     * (`lib/db/schema/nina/chat.ts`) carries the whole argument and this one deliberately does
     * not restate it: equal hash ⟺ equal stored bytes; NULL is a real, permanent,
     * dedup-INACTIVE state, never "definitely unique"; the hash is computed in the browser over
     * the bytes a PUT carries, because the server never sees them.
     *
     * **It exists here for notification, not for a dedup decision.** Nothing in the shots path
     * skips, references or releases a blob on a hash match — `attachExtractionPhotos` inserts
     * exactly what it was handed, before and after this column. The only reader is
     * `findRunPhotoByContentHash`, whose one consumer is the cross-table lookup behind the
     * duplicate-image push. A future shots-side dedup DECISION would be a separate decision, and
     * this column not carrying one is why it is a plain index rather than UNIQUE.
     *
     * **No backfill.** Every row that predates this column stores NULL and always will; the
     * media-dedupe rollout set that precedent (detection shipped first, `scripts/nina-dedupe-media.mjs`
     * later) and this phase follows it.
     */
    contentHash: text('content_hash'),
    sortOrder: integer('sort_order').notNull().default(0),
    /** R-11 / F11 — per-photo opt-out from the public share page. */
    excludedFromShare: boolean('excluded_from_share').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t) => [
    index('run_photos_extraction_idx').on(t.extractionId),
    index('run_photos_run_idx').on(t.runId),
    /**
     * "Does this user already store these bytes as a shot?" as one indexed question.
     *
     * **No `user_id` leading column, unlike `nina_message_images`'s equivalent, because this
     * table has no `user_id`** (`tests/db.schema.test.ts:270` asserts that on purpose: the
     * correlated EXISTS back to `extractions`/`runs` is the ownership primitive —
     * `lib/db/queries/ownership.ts:40-52`). So the index answers the hash half and
     * `runPhotoOwnedBy` answers the owner half, in the same statement.
     *
     * Partial, for `nina_message_images_user_content_hash_idx`'s stated reason: a NULL row can
     * never be a match, so it does not belong in the index.
     */
    index('run_photos_content_hash_idx')
      .on(t.contentHash)
      .where(sql`${t.contentHash} is not null`),
  ],
)
```

**Also:** make sure `sql` is imported in this file's `drizzle-orm` import. Check the top of
`lib/db/schema/runs.ts`; if `sql` is absent, add it:

```ts
import { sql } from 'drizzle-orm'
```

(placed with the file's existing `drizzle-orm` imports, not as a second import line from the same
module — prettier/eslint will otherwise flag it).

**Impact:** `NewRunPhoto`/`RunPhoto` (`lib/db/schema/runs.ts:505-506`) gain an optional/nullable
field. `attachExtractionPhotos` does not set it, so every row it writes stores NULL — which is the
correct "dedup inactive" state until phase 3 starts supplying a hash. Two assertions in
`tests/db.schema.test.ts` go red; Step 9 fixes them.

---

### Step 2: Add `content_hash` to `nina_avatars`

**File:** `lib/db/schema/nina/avatars.ts:150-219` (the `ninaAvatars` table)

**Change:** one nullable column after `sourceKey`, one partial index alongside the existing four.

**Code — insert this column immediately after the `sourceKey` declaration (`:~183`):**

```ts
    /**
     * ── THE CONTENT-ADDRESSED TWIN OF `source_key` ────────────────────────────────────────────
     *
     * sha-256 over the bytes this row's Blob object stores, 64 lowercase hex, produced only by
     * `lib/photos/contentHash.ts`. `nina_message_images.content_hash`'s header
     * (`lib/db/schema/nina/chat.ts`) states the semantics once and they are not restated here:
     * equal hash ⟺ equal stored bytes, NULL is permanently dedup-INACTIVE, never "unique".
     *
     * **It does NOT replace `source_key` and must not.** `source_key` is
     * `(relative path, size, lastModified)` — a MECHANICAL key that lets a double-submitted
     * folder drop cost a string comparison instead of a hash over hundreds of megabytes, and it
     * keeps its unique index and its `ON CONFLICT DO NOTHING`. This column answers a different
     * question — "are these BYTES already somewhere in the collection?" — for the
     * duplicate-image notification, and it is deliberately NOT unique: a second album row with
     * the same bytes is still a real row in a real folder, and turning that into a thrown INSERT
     * would change what the uploader does.
     *
     * **No backfill.** Pre-existing rows store NULL forever; see the column's twin in
     * `run_photos` for why that matches this codebase's own precedent.
     */
    contentHash: text('content_hash'),
```

**Code — add this index as the fifth entry of the `(t) => [...]` array, after `nina_avatars_user_source_key_unq`:**

```ts
    /**
     * "Does this user already store these bytes in the album?" — the same indexed shape
     * `nina_message_images_user_content_hash_idx` serves, `(user_id, content_hash)`, and partial
     * for the same reason: a NULL row can never match, so it does not belong in the index.
     *
     * Non-unique, unlike `nina_avatars_user_source_key_unq` two lines up. That one enforces a
     * mechanical fact about a batch; this one only makes a lookup cheap. See the column header.
     */
    index('nina_avatars_user_content_hash_idx')
      .on(t.userId, t.contentHash)
      .where(sql`${t.contentHash} is not null`),
```

**Impact:** `sql` and `index` are already imported in this file (both are used by the existing four
index entries). Two assertions in `tests/db.schema.nina.test.ts` go red; Step 9 fixes them.

---

### Step 3: The 3-way photo pointer — a sibling type, not a widening

**File:** `lib/photos/pointer.ts` (new)

**Change:** create the pointer vocabulary and the single `/photo/<kind>/<id>` builder.

**Why a sibling type and not widening `lib/nina/attach.ts`'s `NinaPhotoKind` — this was the phase's
open question, and the code answers it:** `app/nina/page.tsx:~255-258` resolves the `?photo=`
pointer with a **ternary, not an exhaustive switch**:

```ts
photoPointer.kind === 'avatar'
  ? getNinaAvatar(userId, photoPointer.id)
  : getNinaMessageImage(userId, photoPointer.id)
```

Widening `NinaPhotoKind` to include `'shot'` would make `parseNinaPhotoParam('shot:abc')` succeed
and silently route a shot id into `getNinaMessageImage` — a wrong-table read with **no compile
error**, which is precisely the failure that file's own header claims a widening would catch. It
would also change what `/nina?photo=` accepts, and that grammar belongs to nobody in this plan set.
So `lib/nina/attach.ts` is left byte-for-byte alone and the new union lives in its own pure module.

**Code (whole file):**

```ts
import { isValidId } from '@/lib/id'

/**
 * The pointer the duplicate-image notification carries, and the grammar of the URL it becomes.
 *
 * ── WHY THIS IS NOT `lib/nina/attach.ts`'s `NinaPhotoPointer`, WIDENED ────────────────────────
 * That type is the `/nina?photo=<kind>:<id>` grammar, which ARMS THE COMPOSER with a photograph
 * the runner is about to send. It is deliberately two-way (`'avatar' | 'image'`) because those are
 * the two tables a chat attachment can come from, and `app/nina/page.tsx` resolves it with a
 * TERNARY rather than an exhaustive switch — `kind === 'avatar' ? getNinaAvatar : getNinaMessageImage`.
 * Adding `'shot'` there would compile, would parse, and would read a `run_photos` id out of
 * `nina_message_images`. Two grammars, two unions, two consumers; they are structurally similar
 * and semantically unrelated, and the union that is missing a case is the one that must not grow.
 *
 * ── DELIBERATELY PURE, AND DELIBERATELY IN `lib/photos` ───────────────────────────────────────
 * No database, no `server-only`, one import. `lib/photos/contentHash.ts`'s header states the
 * constraint this module inherits: things in this directory are read by a browser, by the server
 * and by a `--experimental-strip-types` script alike. The URL builder in particular is needed on
 * the server (phase 1's push), by a route's segment parser (phase 2) and by this file's own test,
 * so it may not reach for anything that opens a connection.
 */

/**
 * Which of the three image tables an id addresses.
 *
 *   · `'shot'`   — `run_photos`,           a screenshot uploaded during extraction
 *   · `'avatar'` — `nina_avatars`,         a face in her album
 *   · `'image'`  — `nina_message_images`,  a photograph in the chat
 *
 * The two spellings that are NOT ours to rename: `'avatar'` and `'image'` are the strings
 * `lib/nina/attach.ts`'s grammar already uses for the same two tables, and using different words
 * here would mean two vocabularies for one set of tables. `'shot'` is new because `run_photos` has
 * never been addressable by a pointer at all.
 */
export type PhotoPointerKind = 'shot' | 'avatar' | 'image'

/** The union as a value, for a runtime membership test and for a test to iterate. */
export const PHOTO_POINTER_KINDS: readonly PhotoPointerKind[] = ['shot', 'avatar', 'image'] as const

/** What a URL carries: a kind and an id, and nothing that could be a claim. */
export interface PhotoPointer {
  kind: PhotoPointerKind
  id: string
}

/**
 * The pointer once the server has proved the row is this user's: the same two fields plus the Blob
 * URL read off that row.
 *
 * `lib/nina/attach.ts`'s `NinaExistingPhoto` makes the identical extension for the identical
 * reason, quoted rather than re-argued: a URL arriving from a client is a claim, an id resolved
 * against `user_id` is a fact. **`description` is deliberately absent and must never be added** —
 * it is `glm-4.6v`'s private text and nothing outside Nina's prompt may read it.
 */
export interface ResolvedPhotoPointer extends PhotoPointer {
  /** A public Blob URL, read off the row the server just proved is this user's. */
  url: string
}

/** Runtime membership in the union. Takes `unknown` — its callers hold route segments. */
export function isPhotoPointerKind(value: unknown): value is PhotoPointerKind {
  return (
    value === 'shot' || value === 'avatar' || value === 'image'
  )
}

/**
 * **THE URL CONTRACT OF THIS FEATURE, AND THE ONLY PLACE IT IS SPELLED.**
 *
 *     photoViewerPath({ kind: 'shot', id: 'aB3_xYz01234' })  ->  '/photo/shot/aB3_xYz01234'
 *
 * Phase 2's route is `app/photo/[kind]/[id]/page.tsx`; phases 3 and 4 never build this string
 * themselves, they hand a pointer to `notifyDuplicateImagePush`. Three call sites, one function,
 * one shape — which is what stops a notification from landing on a path the router does not have.
 *
 * **Same-origin and always a path**, never an absolute URL: `NinaPushPayload.url`'s contract
 * (`lib/push/payload.ts`) and `lib/service-worker.js:44`'s `FALLBACK_URL` both require it, and a
 * malformed value there means a tap lands on `/nina` instead of the photograph.
 *
 * **No encoding, on purpose.** `kind` is one of three literals and `lib/id.ts`'s alphabet is
 * `[0-9A-Za-z_-]` — neither segment can contain a character a path segment cares about. An
 * `encodeURIComponent` here would be dead code that hides the invariant rather than stating it.
 */
export function photoViewerPath(pointer: PhotoPointer): string {
  return `/photo/${pointer.kind}/${pointer.id}`
}

/**
 * The inverse, for phase 2's route: two raw segments in, a pointer or `null` out.
 *
 * Takes `unknown` for `parseNinaPhotoParam`'s stated reason — a Next.js route param is
 * `string | string[] | undefined` and a repeated segment is a malformed link, not an interesting
 * case. `isValidId` is the shape gate; all three tables' primary keys are `lib/id.ts` nanoid(12)
 * (`run_photos` via `newPhotoId`, both Nina tables via `newId`), so one predicate covers all three.
 *
 * `null` is NOT an error. A stale bookmark, a forged id and another user's id must all resolve the
 * same way, and the route that consumes this degrades silently rather than telling anyone which
 * ids exist.
 */
export function parsePhotoViewerSegments(kind: unknown, id: unknown): PhotoPointer | null {
  if (!isPhotoPointerKind(kind)) return null
  if (!isValidId(id)) return null
  return { kind, id }
}
```

**Impact:** nothing imports it yet. Phase 2 imports `parsePhotoViewerSegments` +
`ResolvedPhotoPointer`; phases 3/4 reach it only transitively through the notify helper.

---

### Step 4: `lib/photos/pointer.test.ts`

**File:** `lib/photos/pointer.test.ts` (new)

**Change:** freeze the URL grammar, because three other phases are written against it.

**Code (whole file):**

```ts
import { describe, expect, it } from 'vitest'

import {
  isPhotoPointerKind,
  parsePhotoViewerSegments,
  photoViewerPath,
  PHOTO_POINTER_KINDS,
} from './pointer'

/**
 * ── WHY THIS FILE EXISTS AT ALL FOR A ONE-LINE TEMPLATE STRING ────────────────────────────────
 * Because four things must agree on it and only one of them can be type-checked against the
 * others: `photoViewerPath` writes it, `lib/push/duplicateImage.ts` ships it inside an encrypted
 * payload, `lib/service-worker.js` navigates to it with no type system at all, and phase 2's
 * `app/photo/[kind]/[id]/page.tsx` is a DIRECTORY NAME. A route directory renamed to `[type]` or
 * a path built as `/photos/...` produces no compile error anywhere — it produces a notification
 * that opens a 404. This test is the pin.
 */

const ID = 'aB3_xYz01234' // 12 chars from lib/id.ts's alphabet

describe('photoViewerPath — the notification click target', () => {
  it('is /photo/<kind>/<id>, for each of the three kinds', () => {
    expect(photoViewerPath({ kind: 'shot', id: ID })).toBe(`/photo/shot/${ID}`)
    expect(photoViewerPath({ kind: 'avatar', id: ID })).toBe(`/photo/avatar/${ID}`)
    expect(photoViewerPath({ kind: 'image', id: ID })).toBe(`/photo/image/${ID}`)
  })

  it('is same-origin, absolute-path, and has no trailing slash or query', () => {
    /* `NinaPushPayload.url`'s contract and `lib/service-worker.js`'s FALLBACK_URL both require a
     * path beginning with `/`. An absolute URL here would be silently replaced by `/nina`. */
    for (const kind of PHOTO_POINTER_KINDS) {
      const path = photoViewerPath({ kind, id: ID })
      expect(path.startsWith('/')).toBe(true)
      expect(path).not.toContain('://')
      expect(path).not.toContain('?')
      expect(path.endsWith('/')).toBe(false)
      expect(path.split('/')).toHaveLength(4) // '', 'photo', kind, id
    }
  })
})

describe('PHOTO_POINTER_KINDS', () => {
  it('is exactly the three tables, in a stable order — this order IS the lookup priority', () => {
    expect([...PHOTO_POINTER_KINDS]).toEqual(['shot', 'avatar', 'image'])
  })

  it('agrees with isPhotoPointerKind in both directions', () => {
    for (const kind of PHOTO_POINTER_KINDS) expect(isPhotoPointerKind(kind)).toBe(true)
    expect(isPhotoPointerKind('run')).toBe(false)
    expect(isPhotoPointerKind('photo')).toBe(false)
    expect(isPhotoPointerKind('')).toBe(false)
    expect(isPhotoPointerKind(undefined)).toBe(false)
    expect(isPhotoPointerKind(['shot'])).toBe(false)
  })
})

describe('parsePhotoViewerSegments — phase 2 route segments in, a pointer or null out', () => {
  it('round-trips everything photoViewerPath writes', () => {
    for (const kind of PHOTO_POINTER_KINDS) {
      const [, , rawKind, rawId] = photoViewerPath({ kind, id: ID }).split('/')
      expect(parsePhotoViewerSegments(rawKind, rawId)).toEqual({ kind, id: ID })
    }
  })

  it('refuses an unknown kind, a malformed id, and the wrong shapes — ALL as null, never a throw', () => {
    /* A miss must not be distinguishable from "not yours": the route that consumes this degrades
     * silently, the way `/nina?photo=` already does (lib/nina/attach.ts's parse docstring). */
    expect(parsePhotoViewerSegments('run', ID)).toBeNull()
    expect(parsePhotoViewerSegments('shot', 'too-short')).toBeNull()
    expect(parsePhotoViewerSegments('shot', `${ID}extra`)).toBeNull()
    expect(parsePhotoViewerSegments('shot', undefined)).toBeNull()
    expect(parsePhotoViewerSegments(['shot'], ID)).toBeNull()
    expect(parsePhotoViewerSegments('shot', ['a', 'b'])).toBeNull()
  })
})
```

---

### Step 5: The two new per-table content-hash finders

The third finder already exists and is not touched: `findNinaImageByContentHash`
(`lib/nina/queries/images.ts:356-376`).

#### 5a. `run_photos`

**File:** `lib/db/queries/photos.ts` — insert after `listExtractionPhotos` (ends `:71`), before
`setPhotoExcludedFromShare`.

**Change:** add the finder, and widen the file's `drizzle-orm` import.

**Code — the import line at `lib/db/queries/photos.ts:1` becomes:**

```ts
import { and, asc, desc, eq, exists, inArray, notInArray, sql } from 'drizzle-orm'
```

**Code — the new function:**

```ts
/**
 * **"Does this user already store these bytes as a run screenshot?"** — the `run_photos` arm of
 * the cross-table duplicate lookup (`lib/photos/globalDuplicate.ts`), and this table's first
 * content-addressed read of any kind.
 *
 * ── THE OWNERSHIP HALF IS `runPhotoOwnedBy`, NOT A `user_id` ─────────────────────────────────
 * This table carries no owner column on purpose (§3's header, and `tests/db.schema.test.ts:270`
 * asserts the absence). `runPhotoOwnedBy` is the correlated double-EXISTS back to `extractions`
 * OR `runs` — either parent claiming the row is enough, because a photo has only an extraction
 * until the review commit backfills `run_id`. It runs IN THE SAME STATEMENT as the hash
 * predicate, so there is no window between the check and the read.
 *
 * ── TWO HASHES, ONE ROUND TRIP ───────────────────────────────────────────────────────────────
 * `string | readonly string[]`, exactly as `findNinaImageByContentHash` takes it and for the same
 * measured reason: an upload carries two hashes worth asking about — the encode's (the bytes a
 * PUT carries) and the picked file's own, which for a download-then-reupload IS a stored row's
 * bytes. `in (…)` asks both at once.
 *
 * ── `excludeIds` IS NOT OPTIONAL BEHAVIOUR, IT IS THE POINT ──────────────────────────────────
 * The caller runs this AFTER inserting the rows it is asking about, so without the exclusion every
 * genuinely-new upload matches itself and every upload notifies. Pushed into SQL rather than
 * post-filtered, because a post-filter over a `LIMIT 1` would answer "no duplicate" whenever a
 * row being excluded happened to sort first — which it always does, being the newest.
 *
 * **A LIST, not one id** (reconciler ruling, round 1). One `POST /api/extract` writes up to THREE
 * `run_photos` rows and two of them can carry identical bytes — the kinds must differ, the pixels
 * need not. Excluding only the asking row then makes each of the two match the other and announce
 * a photograph this very request created. "Already" has to mean "before now", which is the whole
 * batch, not one row of it. An empty array is "exclude nothing" and must not emit a
 * `not in ()` — hence the length guard below.
 *
 * ── NEWEST FIRST ─────────────────────────────────────────────────────────────────────────────
 * `(created_at desc, id desc)` — `findNinaImageByContentHash`'s standing rule, quoted: any match
 * is a correct target, and the newest is the least likely to have been deleted between this read
 * and the notification that follows.
 *
 * `null` means "not yours", "no such bytes" and "nobody stores them" alike — §3's rule, and here
 * it is also the answer the caller wants: nothing to notify about.
 */
export async function findRunPhotoByContentHash(
  userId: string,
  contentHash: string | readonly string[],
  excludeIds?: readonly string[],
): Promise<{ id: string; blobUrl: string } | null> {
  const hashes = Array.isArray(contentHash) ? [...contentHash] : [contentHash as string]
  if (hashes.length === 0) return null
  const excluded = excludeIds ?? []
  const rows = await db
    .select({ id: runPhotos.id, blobUrl: runPhotos.blobUrl })
    .from(runPhotos)
    .where(
      and(
        inArray(runPhotos.contentHash, hashes),
        excluded.length > 0 ? notInArray(runPhotos.id, [...excluded]) : undefined,
        runPhotoOwnedBy(userId),
      ),
    )
    .orderBy(desc(runPhotos.createdAt), desc(runPhotos.id))
    .limit(1)
  return rows[0] ?? null
}
```

**Impact:** `npm run ci:data-layer-guard` greps `export (async )?function (\w+)\(([^)]*)` and fails
any exported query whose first argument is not `userId` — this one's is, so the guard stays green.
The `@/lib/db/queries` barrel picks it up through its existing `export * from './queries/photos'`
(`lib/db/queries.ts:62`) with no barrel edit. There is no frozen-surface test for that barrel (only
`lib/nina/queries` has one), so nothing else changes here.

#### 5b. `nina_avatars`

**File:** `lib/nina/queries/avatars.ts` — insert after `getNinaAvatarBySourceKey` (ends `:~256`).

**Change:** add the finder, and widen the `drizzle-orm` import.

**Code — the import line at `lib/nina/queries/avatars.ts:1` becomes:**

```ts
import { and, asc, desc, eq, inArray, isNotNull, isNull, notInArray, sql, type SQL } from 'drizzle-orm'
```

**Code — the new function:**

```ts
/**
 * **"Does this user's album already store these bytes?"** — the `nina_avatars` arm of the
 * cross-table duplicate lookup (`lib/photos/globalDuplicate.ts`).
 *
 * ── IT IS NOT `getNinaAvatarBySourceKey` AND DOES NOT REPLACE IT ─────────────────────────────
 * `source_key` is `(relative path, size, lastModified)` — a MECHANICAL key that makes a
 * re-dropped folder cheap, enforced by `nina_avatars_user_source_key_unq` and consumed by the
 * batch register's `ON CONFLICT DO NOTHING`. That mechanism is untouched. This asks the other
 * question: are these BYTES already in the collection, under any name, in any folder. The two
 * disagree constantly and both answers are correct about their own question.
 *
 * `(user_id, content_hash)` with a `content_hash is not null` partial index serves this exactly —
 * `nina_avatars_user_content_hash_idx`, the shape `nina_message_images` already had.
 *
 * The list form, the `excludeIds` list, the newest-first order and the `null`-for-everything rule
 * are `findRunPhotoByContentHash`'s and `findNinaImageByContentHash`'s, argued in full at the
 * former and not restated here — including why the exclusion is a LIST: one folder drop registers
 * up to fifty album rows in a single gesture and two of them can hold identical bytes under two
 * folder paths, which is a deliberate pair of rows and not a duplicate of anything that came
 * before.
 *
 * The projection is two columns rather than `avatarColumns`: the one caller needs an id to point
 * at and a URL to render, and `description` is `glm-4.6v`'s private text whose only consumer is
 * Nina's prompt (invariant 5). A narrower select is the cheapest way to not hand it to a
 * notification.
 */
export async function findNinaAvatarByContentHash(
  userId: string,
  contentHash: string | readonly string[],
  excludeIds?: readonly string[],
): Promise<{ id: string; blobUrl: string } | null> {
  const hashes = Array.isArray(contentHash) ? [...contentHash] : [contentHash as string]
  if (hashes.length === 0) return null
  const excluded = excludeIds ?? []
  const rows = await db
    .select({ id: ninaAvatars.id, blobUrl: ninaAvatars.blobUrl })
    .from(ninaAvatars)
    .where(
      and(
        eq(ninaAvatars.userId, userId),
        inArray(ninaAvatars.contentHash, hashes),
        excluded.length > 0 ? notInArray(ninaAvatars.id, [...excluded]) : undefined,
      ),
    )
    .orderBy(desc(ninaAvatars.createdAt), desc(ninaAvatars.id))
    .limit(1)
  return rows[0] ?? null
}
```

**Impact:** `lib/nina/queries.test.ts:117` (`Object.keys(barrel).sort()` `toEqual` the frozen list)
goes red immediately. Step 5c fixes it — that test's own header demands the list be updated in the
same commit, sorted, with a pointer to the decision.

#### 5c. Unfreeze-and-refreeze the Nina barrel surface

**File:** `lib/nina/queries.test.ts:47-48`

**Change:** insert one name, keeping the list sorted (`findNinaAvatarByContentHash` sorts before
`findNinaImageByContentHash`), with the pointer the file's header asks for.

**Code — replace lines 47-48:**

```ts
  // dup-image-push-notify phase 1: the `nina_avatars` arm of the cross-table duplicate lookup
  // (plan index R1). A documented growth of the surface, 85 -> 86, added in the same commit as
  // the query — which is what this file's header asks for.
  'findNinaAvatarByContentHash',
  'findNinaImageByContentHash',
  'findNinaSignedOriginals',
```

**Impact:** the barrel's second test ("nothing at runtime except functions") still passes — the new
export is a function.

---

### Step 6: The cross-table lookup

**File:** `lib/photos/globalDuplicate.ts` (new)

**Change:** compose the three finders into one read-only question.

**The two decisions this file makes, stated where they are made:**

1. **Priority order `image` → `avatar` → `shot`, not "the oldest match".** "The oldest row holding
   these bytes" is the more romantic answer, but `findNinaImageByContentHash` returns *newest*-first
   and a cross-table `created_at` election would need a fourth chat finder with the opposite order —
   i.e. an edit to `lib/nina/queries/images.ts`, which this phase may not make for a cosmetic gain.
   A fixed priority is deterministic, needs no new query, and puts the table whose hash column is
   actually populated for historical rows first.
2. **Sequential with early return, not `Promise.all`.** "The first match" is literally the contract,
   the common case on a real duplicate is one round trip, and this never runs in a render path — it
   runs after an upload has already committed.

**Code (whole file):**

```ts
import 'server-only'

import { findRunPhotoByContentHash } from '@/lib/db/queries'
import { findNinaAvatarByContentHash, findNinaImageByContentHash } from '@/lib/nina/queries'
import { isValidContentHash } from '@/lib/photos/contentHash'
import type { PhotoPointer, ResolvedPhotoPointer } from '@/lib/photos/pointer'

/**
 * **"Do these bytes already exist anywhere in this user's image collection?"**
 *
 * The one question R1 needs and the one nothing in this codebase could ask before: there is no
 * single image table, there are three (`nina_message_images`, `nina_avatars`, `run_photos`), each
 * with its own dedup mechanism or none, and not one of them ever looked at another.
 *
 * ── IT IS READ-ONLY, AND THAT IS THE WHOLE DESIGN ────────────────────────────────────────────
 * `lib/nina/dedupe.ts:36-43` states the invariant this file is built around: the three write-time
 * DECISION modules (`dedupe.ts`, `imageDedupe.ts`, `lib/admin/chatPhotos.ts`) must not be merged
 * and a fourth must not be grown. So this is not a fourth. It decides nothing, writes nothing,
 * releases no blob and never changes which row is a keeper and which is a reference. It runs
 * AFTER whichever of those three has already decided, reads what they wrote, and answers a
 * question none of them was asked: "is there a duplicate worth telling the runner about?"
 *
 * ── EXACT BYTES ONLY. NO PERCEPTUAL MATCHING. ────────────────────────────────────────────────
 * `lib/nina/perceptual.ts:9-10,39-42,58-62` carries constants measured on one production pair and
 * paired with `scripts/nina-dedupe-plan.mjs` ("if one number moves, move BOTH"), scoped to the
 * chat-photo download-then-reupload case. Widening that gate to shots and album faces is a
 * distinct tuning effort with its own measurements, and "already exists" does not ask for it. A
 * re-encode is two objects that are honestly different at the only level storage can see — the
 * same sentence `nina_message_images.content_hash`'s header opens with.
 *
 * ── PER-USER, NEVER GLOBAL ───────────────────────────────────────────────────────────────────
 * Every arm is `user_id`-scoped (`run_photos` through `runPhotoOwnedBy`'s correlated EXISTS,
 * since that table has no owner column). Matching across users would be a new, unstated,
 * security-relevant capability, and the blob-release path is user-scoped too — a cross-user
 * pointer would let one user's delete free bytes another still renders.
 *
 * ── `server-only`, UNLIKE THE QUERY LAYER IT CALLS ───────────────────────────────────────────
 * `lib/db/queries.ts` and `lib/nina/queries.ts` both decline `server-only` deliberately, so that
 * `scripts/*.mjs` can import them. This module has no script consumer and sits in `lib/photos/`,
 * a directory whose other modules (`contentHash.ts`, `compressForNina.ts`, `pointer.ts`) are
 * imported BY THE BROWSER. `server-only` is what makes an accidental client import a build error
 * instead of a database client in a bundle. `vitest.config.ts` aliases it to a stub, so the test
 * below runs as shipped.
 */

/** Which of the three tables is consulted first. See the header of `findGlobalDuplicatePhoto`. */
const LOOKUP_ORDER = ['image', 'avatar', 'shot'] as const

export interface GlobalDuplicateOptions {
  /**
   * Rows to ignore — **normally every row the caller has just written.** Every caller runs this
   * AFTER its own insert, so without this a genuinely-new upload finds itself and notifies.
   *
   * ── ONE POINTER OR A LIST, AND THE LIST IS THE LOAD-BEARING FORM ──────────────────────────
   * Three of the five upload routes write MORE THAN ONE row per gesture: `/api/extract` writes up
   * to three `run_photos` rows, `sendNinaMessage` writes N `nina_message_images` rows, and one
   * folder drop registers up to fifty `nina_avatars` rows. Two files in one gesture can carry
   * identical bytes, so excluding only the asking row makes each of them find the other and
   * announce a photograph this very gesture created. "Already" means before now — which is the
   * whole gesture, not one row of it. The two admin chat routes write exactly one row each and
   * pass a single pointer, which is why both spellings are accepted rather than one imposed.
   *
   * For `'shot'` and `'avatar'` the exclusion is pushed into SQL, so a second, older row with the
   * same bytes is still found. For `'image'` it is applied after the read, and the case that
   * would lose — two ORIGINALS in `nina_message_images` carrying the same hash — is unreachable
   * by construction: the chat write path turns the later one into a REFERENCE
   * (`lib/nina/dedupe.ts:212-231`), and `findNinaImageByContentHash` filters references out with
   * `isOriginalPhoto()`. Stated rather than defended in code, because defending it would mean
   * changing that query's signature, which this phase may not do.
   */
  exclude?: PhotoPointer | readonly PhotoPointer[] | null
}

/**
 * `null` for "no duplicate", for "not yours" and for "no usable hash" alike — every arm's own
 * rule, and here they collapse into the one thing the caller does next: nothing.
 *
 * ── THE HASHES ARE VALIDATED HERE, ONCE ──────────────────────────────────────────────────────
 * `isValidContentHash` is the gate on a value that may have come from a browser
 * (`lib/photos/contentHash.ts`'s header). Invalid claims are DROPPED, not rejected: an upload
 * whose hash claim is malformed gets no notification, which is the honest reading of "dedup is
 * inactive for this row" — never an error on a write that already succeeded. If nothing survives
 * the gate the function returns `null` without a single round trip.
 *
 * ── PRIORITY, NOT CHRONOLOGY ─────────────────────────────────────────────────────────────────
 * `image` -> `avatar` -> `shot`, first hit wins, because (a) `nina_message_images` is the only
 * table whose `content_hash` is populated for historical rows, so it is the only one that can
 * match anything written before this feature; (b) it reuses `findNinaImageByContentHash`
 * VERBATIM, including its `isOriginalPhoto()` filter, which is the one arm that knows the
 * difference between an original and a reference; and (c) electing "the oldest row across three
 * tables" would need a fourth chat finder with the opposite sort order — an edit to a shared,
 * tested query for a cosmetic gain. Sequential with an early return rather than `Promise.all`:
 * the contract is "the first match", the hit case costs one round trip, and this never runs in a
 * render path.
 */
export async function findGlobalDuplicatePhoto(
  userId: string,
  contentHash: string | readonly string[],
  options: GlobalDuplicateOptions = {},
): Promise<ResolvedPhotoPointer | null> {
  const claimed = typeof contentHash === 'string' ? [contentHash] : [...contentHash]
  const hashes = claimed.filter((hash) => isValidContentHash(hash))
  if (hashes.length === 0) return null

  /* One pointer and a list of pointers are the same fact with different punctuation; normalised
   * once, here, so the three arms below each see a plain array of ids for their own kind. */
  const excluded =
    options.exclude == null
      ? []
      : Array.isArray(options.exclude)
        ? [...(options.exclude as readonly PhotoPointer[])]
        : [options.exclude as PhotoPointer]

  for (const kind of LOOKUP_ORDER) {
    const excludeIds = excluded.filter((pointer) => pointer.kind === kind).map((p) => p.id)

    if (kind === 'image') {
      const row = await findNinaImageByContentHash(userId, hashes)
      /* Post-filtered rather than pushed into SQL — see `GlobalDuplicateOptions.exclude` for why
       * the case this cannot see is unreachable in the chat write path. */
      if (row !== null && !excludeIds.includes(row.id)) {
        return { kind: 'image', id: row.id, url: row.blobUrl }
      }
      continue
    }

    if (kind === 'avatar') {
      const row = await findNinaAvatarByContentHash(userId, hashes, excludeIds)
      if (row !== null) return { kind: 'avatar', id: row.id, url: row.blobUrl }
      continue
    }

    const row = await findRunPhotoByContentHash(userId, hashes, excludeIds)
    if (row !== null) return { kind: 'shot', id: row.id, url: row.blobUrl }
  }

  return null
}
```

**Impact:** `findNinaImageByContentHash` returns a full `NinaImageRow` (the `imageColumns`
projection), of which only `id` and `blobUrl` are read. That is deliberate — reusing the existing
query unchanged is worth one wider projection, and `description` is read by nothing here.

---

### Step 7: `lib/photos/globalDuplicate.test.ts`

**File:** `lib/photos/globalDuplicate.test.ts` (new)

**Change:** the plan index's exit criterion — a hit in each of the three tables, a correct miss, and
the exclusion.

Mocking the three finders rather than the driver: `tests/support/fakeDb.ts` exists for asserting
generated SQL (which the *finders'* own ownership properties would want), but this module's whole
behaviour is the ORDER it asks in and what it does with the answers. Mocking at the query boundary
is what makes that visible.

**Code (whole file):**

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * ── WHAT THIS FILE IS ASSERTING, AND WHAT IT DELIBERATELY IS NOT ──────────────────────────────
 * `findGlobalDuplicatePhoto` contains no SQL. Its whole behaviour is: which hashes survive the
 * validity gate, which table is asked first, and what shape comes back. So the three finders are
 * mocked at the module boundary and this file asserts the COMPOSITION.
 *
 * The ownership properties of the three arms belong to the arms: `run_photos`' correlated EXISTS
 * is `tests/db.ownership.test.ts`'s subject (the app's core security regression guard), and the
 * two Nina arms' `user_id` equality is the barrel's standing invariant. Re-asserting them here
 * through a mock would be a test of the mock.
 */
vi.mock('@/lib/db/queries', () => ({ findRunPhotoByContentHash: vi.fn() }))
vi.mock('@/lib/nina/queries', () => ({
  findNinaAvatarByContentHash: vi.fn(),
  findNinaImageByContentHash: vi.fn(),
}))

const { findRunPhotoByContentHash } = await import('@/lib/db/queries')
const { findNinaAvatarByContentHash, findNinaImageByContentHash } = await import('@/lib/nina/queries')
const { findGlobalDuplicatePhoto } = await import('./globalDuplicate')

const USER = 'user-1'
/** 64 lowercase hex — the only spelling `contentHashOf` produces. */
const HASH = 'a'.repeat(64)
const OTHER_HASH = 'b'.repeat(64)

const shot = vi.mocked(findRunPhotoByContentHash)
const avatar = vi.mocked(findNinaAvatarByContentHash)
const image = vi.mocked(findNinaImageByContentHash)

beforeEach(() => {
  /* resetAllMocks, not clearAllMocks: a failed test's unconsumed `mockResolvedValueOnce` would
   * otherwise ghost a row into the next test. */
  vi.resetAllMocks()
  shot.mockResolvedValue(null)
  avatar.mockResolvedValue(null)
  image.mockResolvedValue(null)
})

describe('findGlobalDuplicatePhoto — a hit in each of the three tables', () => {
  it('finds a chat photo and points at it as kind "image"', async () => {
    image.mockResolvedValue({ id: 'img-1', blobUrl: 'https://blob.test/img-1.jpg' } as never)
    await expect(findGlobalDuplicatePhoto(USER, HASH)).resolves.toEqual({
      kind: 'image',
      id: 'img-1',
      url: 'https://blob.test/img-1.jpg',
    })
  })

  it('finds an album face and points at it as kind "avatar"', async () => {
    avatar.mockResolvedValue({ id: 'av-1', blobUrl: 'https://blob.test/av-1.jpg' })
    await expect(findGlobalDuplicatePhoto(USER, HASH)).resolves.toEqual({
      kind: 'avatar',
      id: 'av-1',
      url: 'https://blob.test/av-1.jpg',
    })
  })

  it('finds a run screenshot and points at it as kind "shot"', async () => {
    shot.mockResolvedValue({ id: 'ph-1', blobUrl: 'https://blob.test/ph-1.jpg' })
    await expect(findGlobalDuplicatePhoto(USER, HASH)).resolves.toEqual({
      kind: 'shot',
      id: 'ph-1',
      url: 'https://blob.test/ph-1.jpg',
    })
  })
})

describe('findGlobalDuplicatePhoto — the miss', () => {
  it('returns null when no table holds the bytes, having asked all three', async () => {
    await expect(findGlobalDuplicatePhoto(USER, HASH)).resolves.toBeNull()
    expect(image).toHaveBeenCalledTimes(1)
    expect(avatar).toHaveBeenCalledTimes(1)
    expect(shot).toHaveBeenCalledTimes(1)
  })

  it('asks NOTHING at all when no claimed hash survives the validity gate', async () => {
    /* A malformed claim means "dedup is inactive for this row" (lib/photos/contentHash.ts) — not
     * an error, and not a round trip either. */
    await expect(findGlobalDuplicatePhoto(USER, 'not-a-hash')).resolves.toBeNull()
    await expect(findGlobalDuplicatePhoto(USER, HASH.toUpperCase())).resolves.toBeNull()
    await expect(findGlobalDuplicatePhoto(USER, [])).resolves.toBeNull()
    expect(image).not.toHaveBeenCalled()
    expect(avatar).not.toHaveBeenCalled()
    expect(shot).not.toHaveBeenCalled()
  })

  it('drops the invalid claims and still asks about the valid ones', async () => {
    await findGlobalDuplicatePhoto(USER, [HASH, 'garbage', OTHER_HASH])
    expect(image).toHaveBeenCalledWith(USER, [HASH, OTHER_HASH])
  })
})

describe('findGlobalDuplicatePhoto — the order, and the early return', () => {
  it('stops at the first hit: a chat match never reaches the album or the shots', async () => {
    image.mockResolvedValue({ id: 'img-1', blobUrl: 'u' } as never)
    avatar.mockResolvedValue({ id: 'av-1', blobUrl: 'u' })
    shot.mockResolvedValue({ id: 'ph-1', blobUrl: 'u' })
    const hit = await findGlobalDuplicatePhoto(USER, HASH)
    expect(hit?.kind).toBe('image')
    expect(avatar).not.toHaveBeenCalled()
    expect(shot).not.toHaveBeenCalled()
  })

  it('prefers the album over the shots when the chat misses', async () => {
    avatar.mockResolvedValue({ id: 'av-1', blobUrl: 'u' })
    shot.mockResolvedValue({ id: 'ph-1', blobUrl: 'u' })
    const hit = await findGlobalDuplicatePhoto(USER, HASH)
    expect(hit?.kind).toBe('avatar')
    expect(shot).not.toHaveBeenCalled()
  })
})

describe('findGlobalDuplicatePhoto — excluding the rows the caller just wrote', () => {
  it('pushes the exclusion into the shots query, so an OLDER shot is still found', async () => {
    /* The row the caller just inserted is the newest, so a post-filter would answer "no
     * duplicate" and the older twin would never be found. This is why it is a SQL predicate. */
    shot.mockResolvedValue({ id: 'ph-old', blobUrl: 'https://blob.test/old.jpg' })
    const hit = await findGlobalDuplicatePhoto(USER, HASH, {
      exclude: { kind: 'shot', id: 'ph-new' },
    })
    expect(shot).toHaveBeenCalledWith(USER, [HASH], ['ph-new'])
    expect(hit).toEqual({ kind: 'shot', id: 'ph-old', url: 'https://blob.test/old.jpg' })
  })

  it('takes a LIST, so two identical files in ONE upload do not announce each other', async () => {
    /* The reconciler's round-1 ruling, and the case a single-pointer `exclude` cannot express:
     * `/api/extract` writes up to three shots in one request and two of them can be the same
     * picture. Both ids go into the same `not in (…)`, so neither can be "already". */
    await findGlobalDuplicatePhoto(USER, HASH, {
      exclude: [
        { kind: 'shot', id: 'ph-a' },
        { kind: 'shot', id: 'ph-b' },
      ],
    })
    expect(shot).toHaveBeenCalledWith(USER, [HASH], ['ph-a', 'ph-b'])
  })

  it('pushes the exclusion into the album query the same way', async () => {
    await findGlobalDuplicatePhoto(USER, HASH, { exclude: { kind: 'avatar', id: 'av-new' } })
    expect(avatar).toHaveBeenCalledWith(USER, [HASH], ['av-new'])
  })

  it('splits a mixed list by kind — no arm ever sees another table’s ids', async () => {
    await findGlobalDuplicatePhoto(USER, HASH, {
      exclude: [
        { kind: 'shot', id: 'ph-new' },
        { kind: 'avatar', id: 'av-new' },
      ],
    })
    expect(image).toHaveBeenCalledWith(USER, [HASH])
    expect(avatar).toHaveBeenCalledWith(USER, [HASH], ['av-new'])
    expect(shot).toHaveBeenCalledWith(USER, [HASH], ['ph-new'])
  })

  it('does not hand a shot exclusion to the album or chat arms', async () => {
    await findGlobalDuplicatePhoto(USER, HASH, { exclude: { kind: 'shot', id: 'ph-new' } })
    expect(image).toHaveBeenCalledWith(USER, [HASH])
    expect(avatar).toHaveBeenCalledWith(USER, [HASH], [])
  })

  it('post-filters an excluded chat row and falls through to the next table', async () => {
    image.mockResolvedValue({ id: 'img-new', blobUrl: 'u' } as never)
    avatar.mockResolvedValue({ id: 'av-1', blobUrl: 'https://blob.test/av-1.jpg' })
    const hit = await findGlobalDuplicatePhoto(USER, HASH, {
      exclude: [{ kind: 'image', id: 'img-new' }],
    })
    expect(hit).toEqual({ kind: 'avatar', id: 'av-1', url: 'https://blob.test/av-1.jpg' })
  })
})
```

---

### Step 8: The push kind, the url override, and the notify helper

#### 8a. `NINA_PUSH_KINDS` gains `duplicate_image`

**File:** `lib/push/payload.ts:199-200` (the last entry of the array)

**Change:** append one entry, with the comment style the list already uses.

**Code — replace the final two lines of the array (the `'worker_photo_apology'` entry and the
closing `] as const`) with:**

```ts
  /** R22's apology, written by the off-platform backstop worker when it gave the photograph up. */
  'worker_photo_apology',

  /* ── THE ONE KIND THAT IS NOT ABOUT A MESSAGE ─────────────────────────────────────────────
   * Every value above names a bubble somebody wrote. This one names an UPLOAD: bytes arrived on
   * one of the five upload routes and the collection already held them, so the runner is told
   * once, with a tap that opens the copy he already has. It is the only kind whose payload
   * carries a `url` other than `/nina` — `/photo/<kind>/<id>`, built by `photoViewerPath`
   * (`lib/photos/pointer.ts`) and by nothing else. */
  /** An upload whose bytes already existed somewhere in this user's image collection. */
  'duplicate_image',
] as const
```

#### 8b. `buildNinaPushPayload` accepts a `url`

**File:** `lib/push/payload.ts:267-282`

**Change:** one optional input field. `v` stays `1` — this is an addition, not a meaning change,
which is exactly the case that type's header says must not bump the version.

**Code — replace the whole function:**

```ts
export function buildNinaPushPayload(input: {
  messages: ReadonlyArray<{ id: string; body: string }>
  kind: string
  /**
   * Where a tap goes. **Omitted means `/nina`**, which is every caller that existed before the
   * duplicate-image notification and which must keep behaving identically.
   *
   * ── IT MUST BE A SAME-ORIGIN PATH ────────────────────────────────────────────────────────
   * `NinaPushPayload.url`'s contract, and `lib/service-worker.js:44`'s `FALLBACK_URL` is what
   * happens when it is not: a value the worker cannot use lands the tap on `/nina` instead of on
   * the thing the notification was about. Not validated here — the only producer is
   * `photoViewerPath` (`lib/photos/pointer.ts`), whose own test freezes the shape, and a
   * validator in this file would be a second, weaker statement of the same rule that this module
   * (no imports beyond `zod`, loadable by a strip-types script) cannot share with it.
   */
  url?: string
}): NinaPushPayload | null {
  const first = input.messages.find((message) => message.body.trim().length > 0)
  if (!first) return null
  return {
    v: 1,
    title: PUSH_TITLE,
    body: truncateForNotification(first.body),
    url: input.url ?? PUSH_TARGET_URL,
    tag: PUSH_NOTIFICATION_TAG,
    messageId: first.id,
    kind: input.kind,
  }
}
```

**Also — one doc edit, no code change, at `lib/push/payload.ts:230`** (`messageId`'s comment), so
the field does not quietly start meaning two things:

```ts
  /**
   * The `nina_messages.id` of the first bubble, or null. Diagnostics only; nothing reads it yet.
   *
   * **The `duplicate_image` kind is the one exception and it is deliberate**: that notification is
   * about an upload, not a bubble, so there is no message row to name and the field carries the
   * duplicated photograph's own row id instead. Diagnostics only remains true — a log line that
   * says which photograph was pointed at is more useful than a null.
   */
  messageId: string | null
```

**Impact:** `lib/push/send.ts:156`, `scripts/nina-image-worker/push.ts` and
`lib/push/payload.test.ts:143-153` all keep passing — the field is optional and the default is the
old constant.

#### 8c. `sendNinaPush` forwards the url

**File:** `lib/push/send.ts:151-157`

**Change:** `sendNinaPush` is the only path to `buildNinaPushPayload` inside the app, so it must be
able to carry the override. One optional parameter, appended — every existing call site (`:236`,
`:267`, and the four writers outside `lib/push`) is unaffected.

**Code — replace the signature and the first two lines of the body:**

```ts
export async function sendNinaPush(
  userId: string,
  messages: ReadonlyArray<{ id: string; body: string }>,
  kind: string,
  /**
   * Where a tap goes. Omitted means `/nina`, which is every caller that existed before the
   * duplicate-image notification. Appended rather than folded into an options object because the
   * four positional arguments read as a sentence and an options bag for one optional field would
   * churn six call sites to say nothing.
   */
  url?: string,
): Promise<PushSendReport> {
  const payload = buildNinaPushPayload({ messages, kind, url })
  if (!payload) return NOTHING('no message body to send')
```

**And `notifyNinaPush` forwards it too — replace `lib/push/send.ts:219-244`:**

```ts
export type NinaPushNotifier = (
  userId: string,
  messages: ReadonlyArray<{ id: string; body: string }>,
  kind: NinaPushKind,
  url?: string,
) => Promise<void>

/**
 * Annotated rather than `satisfies`, unlike `pushNotifier` below: the type it conforms to is
 * declared three lines up, so there is no other file for a mismatch to surface in, and the
 * annotation types the parameters contextually instead of restating them.
 *
 * **Returns `void`, not the report.** A caller that branched on `delivered` would be making a
 * message's success depend on a phone's reachability, which is exactly the coupling invariant 2
 * forbids. The numbers go to the log line, which is the only consumer they have ever had.
 *
 * **`url` is optional and its default is `/nina`** — the shape every caller before
 * `notifyDuplicateImagePush` relies on, and `pushNotifier` below never passes it at all.
 */
export const notifyNinaPush: NinaPushNotifier = async (userId, messages, kind, url) => {
  try {
    const report = await sendNinaPush(userId, messages, kind, url)
    console.info('[push] notified', { userId, kind, ...report })
  } catch (cause) {
    /* The message row is already committed and the caller has already moved on: there is nothing
     * to retry against and nobody left to tell. This line is the whole of the error handling, and
     * it is deliberate. */
    console.warn('[push] notify failed', { userId, kind, error: String(cause) })
  }
}
```

`pushNotifier` (`:255-269`) is **not** changed — it still `satisfies ProactiveNotifier`, which has
three parameters, and a function with fewer parameters than its type is assignable.

#### 8d. The helper

**File:** `lib/push/duplicateImage.ts` (new)

**Code (whole file):**

```ts
import 'server-only'

import { photoViewerPath, type PhotoPointer, type PhotoPointerKind } from '@/lib/photos/pointer'
import type { NinaPushKind } from './payload'
import { notifyNinaPush } from './send'

/**
 * **R1's notification, and the door phases 3 and 4 knock on.**
 *
 * Five upload routes will call this and none of them may build a URL, choose a kind or write a
 * sentence: they hand over the pointer their cross-table lookup found and this function does the
 * rest. That is the whole reason it exists — `lib/admin/chatPhotoActions.ts:407-416` is the
 * cautionary precedent, where one route owns its own push body and nothing else can agree with it.
 *
 * ── IT ADDS NO CATCH OF ITS OWN, AND ITS CALLERS STILL WRAP IT ───────────────────────────────
 * `notifyNinaPush` already swallows everything a PUSH can do wrong — no VAPID, no subscriptions,
 * a dead endpoint, a 500 from Apple — so in practice nothing reaches this frame. This function
 * deliberately does NOT add a second `try` on top of that: a rejection arriving here means the
 * bookkeeping itself failed, which is a different fault from an unreachable phone and must not be
 * silently absorbed in a third place. Every call site wraps it instead, the shape
 * `lib/nina/proactive.ts:702` set and all four existing writers copy — the row is already
 * committed when this runs, and an unreachable phone must never turn a successful upload into a
 * failed one. Phases 3 and 4 both state this expectation in their own `Requires` and both wrap.
 */

/** The `NINA_PUSH_KINDS` entry, as a value, so no call site spells the literal. */
export const DUPLICATE_IMAGE_PUSH_KIND: NinaPushKind = 'duplicate_image'

/**
 * What the lock screen says, per table. Indonesian, like every other user-facing string in this
 * app, and short: `PUSH_BODY_MAX_CHARS` is 180 and the OS truncates long before that anyway.
 *
 * The kind is named in the sentence because "you already have this" is only useful with "…over
 * there" attached — the runner's three collections are three different screens and a notification
 * that does not say which one is a notification that has to be tapped to be understood.
 */
export const DUPLICATE_IMAGE_PUSH_BODY: Record<PhotoPointerKind, string> = {
  shot: 'Foto ini sudah ada di galeri lari kamu. Ketuk buat lihat yang tersimpan.',
  avatar: 'Foto ini sudah ada di album Nina. Ketuk buat lihat yang tersimpan.',
  image: 'Foto ini sudah ada di chat Nina. Ketuk buat lihat yang tersimpan.',
}

/**
 * One duplicate, one notification.
 *
 * ── THE `messageId` FIELD CARRIES THE PHOTOGRAPH'S ID, NOT A BUBBLE'S ────────────────────────
 * `buildNinaPushPayload` takes `messageId` off the first bubble it is handed, and there is no
 * bubble here — this notification is about an upload. Passing the pointer's own id is the honest
 * value and `NinaPushPayload.messageId`'s comment now records the exception. Nothing reads the
 * field but a log line.
 *
 * ── THE TAG IS STILL `'nina'`, SO A SECOND DUPLICATE REPLACES THE FIRST ──────────────────────
 * Every notification this app sends shares one tag on purpose (`PUSH_NOTIFICATION_TAG`), so a
 * burst does not stack in the tray. An admin dropping a folder of forty photographs, six of them
 * duplicates, therefore sees ONE notification pointing at the last duplicate found rather than
 * six — which is the behaviour that tag was chosen for, and a second tag here would undo it for
 * exactly the noisiest case in the feature.
 *
 * Takes a `PhotoPointer` rather than a `ResolvedPhotoPointer`: the `url` field on the resolved
 * form is the photograph's BLOB url, and the notification must carry the app path instead. Widening
 * the parameter means a caller cannot pass the wrong one of the two by accident.
 */
export async function notifyDuplicateImagePush(
  userId: string,
  pointer: PhotoPointer,
): Promise<void> {
  await notifyNinaPush(
    userId,
    [{ id: pointer.id, body: DUPLICATE_IMAGE_PUSH_BODY[pointer.kind] }],
    DUPLICATE_IMAGE_PUSH_KIND,
    photoViewerPath(pointer),
  )
}
```

#### 8e. `lib/push/duplicateImage.test.ts`

**File:** `lib/push/duplicateImage.test.ts` (new)

**Code (whole file):**

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The seam this file guards is the one nothing else can see: the notification's `url` has to be a
 * path `app/photo/[kind]/[id]` actually serves, and the only thing standing between a wrong value
 * and a notification that opens a 404 is this function. `lib/service-worker.js` navigates to
 * whatever string arrives, with no type system and possibly a week-old copy of its own code.
 */
vi.mock('./send', () => ({ notifyNinaPush: vi.fn() }))

const { notifyNinaPush } = await import('./send')
const { DUPLICATE_IMAGE_PUSH_BODY, DUPLICATE_IMAGE_PUSH_KIND, notifyDuplicateImagePush } =
  await import('./duplicateImage')
const { NINA_PUSH_KINDS } = await import('./payload')

const USER = 'user-1'
const ID = 'aB3_xYz01234'
const notify = vi.mocked(notifyNinaPush)

beforeEach(() => {
  vi.resetAllMocks()
})

describe('notifyDuplicateImagePush', () => {
  it('sends /photo/<kind>/<id> as the tap target, for each of the three kinds', async () => {
    for (const kind of ['shot', 'avatar', 'image'] as const) {
      notify.mockClear()
      await notifyDuplicateImagePush(USER, { kind, id: ID })
      expect(notify).toHaveBeenCalledWith(
        USER,
        [{ id: ID, body: DUPLICATE_IMAGE_PUSH_BODY[kind] }],
        'duplicate_image',
        `/photo/${kind}/${ID}`,
      )
    }
  })

  it('NEVER sends the blob URL as the tap target', async () => {
    /* The resolved pointer carries a public Blob URL. Shipping it would take the runner out of
     * the app and onto raw bytes, which is not what R2 asked for. */
    await notifyDuplicateImagePush(USER, {
      kind: 'image',
      id: ID,
      url: 'https://store.public.blob.vercel-storage.com/nina/x.jpg',
    } as never)
    const target = notify.mock.calls[0]?.[3]
    expect(target).toBe(`/photo/image/${ID}`)
    expect(target).not.toContain('blob.vercel-storage.com')
  })

  it('uses a kind that is actually in the vocabulary', async () => {
    expect(NINA_PUSH_KINDS).toContain(DUPLICATE_IMAGE_PUSH_KIND)
    expect(DUPLICATE_IMAGE_PUSH_KIND).toBe('duplicate_image')
  })

  it('writes an Indonesian body that names WHERE the copy already lives, within the cap', async () => {
    const { PUSH_BODY_MAX_CHARS } = await import('./payload')
    expect(DUPLICATE_IMAGE_PUSH_BODY.shot).toContain('galeri lari')
    expect(DUPLICATE_IMAGE_PUSH_BODY.avatar).toContain('album')
    expect(DUPLICATE_IMAGE_PUSH_BODY.image).toContain('chat')
    for (const body of Object.values(DUPLICATE_IMAGE_PUSH_BODY)) {
      expect(body.length).toBeLessThanOrEqual(PUSH_BODY_MAX_CHARS)
    }
  })

  it('adds no catch of its own — a bookkeeping failure propagates to the call site that wraps it', async () => {
    notify.mockRejectedValue(new Error('push service down'))
    await expect(notifyDuplicateImagePush(USER, { kind: 'shot', id: ID })).rejects.toThrow()
    /* Documented deliberately: this helper does NOT add a third catch. `notifyNinaPush` already
     * swallows everything a push can do wrong, and every call site wraps it in its own `try` (the
     * `lib/nina/proactive.ts:702` shape). A rejection reaching here means the bookkeeping itself
     * failed, and phases 3/4's own try/catch is where that is absorbed — one place, not three. */
  })
})
```

#### 8f. `lib/push/payload.test.ts` additions

**File:** `lib/push/payload.test.ts`

**Change — inside `describe('buildNinaPushPayload')`, after the "fills the fixed fields" case (`:152`),
add:**

```ts
  it('defaults url to /nina and lets a caller override it with a same-origin path', () => {
    /* The override is what the duplicate-image notification needs and what nothing before it did.
     * The DEFAULT is the load-bearing half of this assertion: `sendNinaPush`, the worker's push
     * and every proactive trigger pass no url at all and must keep landing on `/nina`. */
    expect(buildNinaPushPayload({ messages: FOUR, kind: 'chat_reply' })?.url).toBe('/nina')
    expect(
      buildNinaPushPayload({ messages: FOUR, kind: 'duplicate_image', url: '/photo/shot/aB3_xYz01234' })
        ?.url,
    ).toBe('/photo/shot/aB3_xYz01234')
  })

  it('does not bump the wire version for the added field', () => {
    /* `NinaPushPayload`'s header: bump `v` when a field's MEANING changes, never when one is
     * added. A registered service worker can be a week older than the server pushing to it, and
     * it already reads `url` defensively. */
    expect(buildNinaPushPayload({ messages: FOUR, kind: 'duplicate_image', url: '/photo/image/x' })?.v).toBe(1)
  })
```

**Change — inside `describe('NINA_PUSH_KINDS')`, after the "carries one kind per message write"
case (`:226`), add:**

```ts
  it('carries the one kind that is about an upload rather than a bubble', () => {
    /* dup-image-push-notify R1. Five upload routes import this literal through
     * `DUPLICATE_IMAGE_PUSH_KIND`; a rename that missed one stops here. */
    expect(NINA_PUSH_KINDS).toContain('duplicate_image')
  })
```

---

### Step 9: Refreeze the two schema-shape tests

#### 9a. `run_photos`

**File:** `tests/db.schema.test.ts:287-314` (the `describe('run_photos — R-1 and R-11')` block)

**Change:** replace the index assertion and add one for the new column.

**Code — replace the `it('is indexed by both of its parents', ...)` case with:**

```ts
  it('is indexed by both of its parents, and by the content hash', () => {
    expect(indexNames(schema.runPhotos).sort()).toEqual([
      'run_photos_content_hash_idx',
      'run_photos_extraction_idx',
      'run_photos_run_idx',
    ])
  })

  it('content_hash is nullable with no default — NULL means dedup is inactive for the row', () => {
    /* dup-image-push-notify phase 1. The whole migration story, asserted: an additive nullable
     * column and no backfill, so every pre-existing screenshot stays NULL forever and can never
     * match. A NOT NULL or a DEFAULT here would be the bug — SQL `=` against NULL never matches,
     * which is exactly the property that makes "no consumer needs a special case" true. */
    const column = columnMap(schema.runPhotos).get('content_hash')
    expect(column?.getSQLType()).toBe('text')
    expect(column?.notNull).toBe(false)
    expect(column?.hasDefault).toBe(false)
  })
```

#### 9b. `nina_avatars`

**File:** `tests/db.schema.nina.test.ts:266-330`

**Code — replace the column-list case (`:267-293`) with:**

```ts
  it('carries exactly the twenty-one columns phases 12-15, F34 and the duplicate push were written against', () => {
    expect(names(schema.ninaAvatars)).toEqual(
      [
        'id',
        'user_id',
        'blob_url',
        'pathname',
        // F34 R1: the album is a file manager, so a photo knows its folder, its name on the
        // laptop, the dedupe key it was registered under, and where its grid thumbnail lives.
        'folder',
        'filename',
        'source_key',
        'thumb_url',
        'thumb_pathname',
        // dup-image-push-notify phase 1: `source_key`'s content-addressed TWIN, not its
        // replacement — one is (path, size, mtime) and enforces a batch's uniqueness, the other
        // is sha-256 over stored bytes and only makes a lookup cheap. See the column header.
        'content_hash',
        'width',
        'height',
        'bytes',
        'source',
        'crop_scale',
        'crop_x',
        'crop_y',
        'description',
        'is_current',
        'announced_at',
        'created_at',
      ].sort(),
    )
  })
```

**Code — in the "the other four F34 columns are nullable" case (`:307`), leave the loop alone and add
one case after it:**

```ts
  it('content_hash is nullable with no default, like its twin on run_photos', () => {
    /* NULL is a real, permanent, dedup-INACTIVE state — `nina_message_images.content_hash`'s
     * header states it once for all three tables. No backfill, so every pre-existing album row
     * stays NULL and can never match. */
    expect(sqlType(schema.ninaAvatars, 'content_hash')).toBe('text')
    expect(columns(schema.ninaAvatars).get('content_hash')?.notNull).toBe(false)
    expect(columns(schema.ninaAvatars).get('content_hash')?.hasDefault).toBe(false)
  })
```

**Code — replace the `indexNames` array in the "has the folder page index…" case (`:315-321`) with:**

```ts
    expect(indexNames(schema.ninaAvatars)).toEqual([
      'nina_avatars_user_content_hash_idx',
      'nina_avatars_user_created_idx',
      'nina_avatars_user_current_unq',
      'nina_avatars_user_folder_created_idx',
      'nina_avatars_user_source_key_unq',
    ])
```

and rename that case's title to
`'has the folder page index, the dedupe-key unique index and the content-hash index beside the two it already had'`.
The rest of the case (the `unq?.config.unique` and `unq?.config.where` assertions) is unchanged.

---

### Step 10: Generate the migration

**Files:** `drizzle/0022_*.sql`, `drizzle/meta/0022_snapshot.json`, `drizzle/meta/_journal.json`

**Change:** generated, never hand-written and never renamed.

```bash
cd /home/miftah/.worktrees/run-insights/dup-image-push-notify
npm run db:generate
```

**Three things to check before believing it:**

1. **The number.** `drizzle/` tips at `0021_nina_error_logs` in both this worktree and `origin/main`
   (verified 2026-09-15), and `_journal.json`'s last entry is `idx: 21`. So the new file must be
   `0022_*` with `idx: 22`. **If it comes out as anything else, `origin/main` moved under you** —
   fetch, rebase, and regenerate. Never rename the file to fix a collision: drizzle keys the journal
   on the tag and a renamed migration is skipped silently.
2. **The contents.** Four statements, nothing else. Anything extra means the schema drifted from the
   snapshot chain and must be understood before it is committed:

   ```sql
   ALTER TABLE "nina_avatars" ADD COLUMN "content_hash" text;--> statement-breakpoint
   ALTER TABLE "run_photos" ADD COLUMN "content_hash" text;--> statement-breakpoint
   CREATE INDEX "nina_avatars_user_content_hash_idx" ON "nina_avatars" USING btree ("user_id","content_hash") WHERE "nina_avatars"."content_hash" is not null;--> statement-breakpoint
   CREATE INDEX "run_photos_content_hash_idx" ON "run_photos" USING btree ("content_hash") WHERE "run_photos"."content_hash" is not null;
   ```

   (Statement order is drizzle's; only the set matters.)
3. **The chain.** `npm run ci:schema-drift-guard` must pass. In this worktree `.env.local` is
   present, so it runs the LIVE half too — journal/file bijection, `when` monotonicity, the
   snapshot `prevId` chain, **and** a comparison against the real database. The live half will
   report `run_photos.content_hash` and `nina_avatars.content_hash` as present in the snapshot and
   absent in the database until the migration is applied; that is expected and is not a reason to
   run `db:migrate` here. If it reports anything about a table this phase did not touch, stop —
   that is pre-existing drift and belongs in its own investigation.

Then `npm run db:check` (offline; validates the folder against itself).

**Impact:** the `run_photos` migration is additive-nullable, so it is safe to apply before or after
the deploy. Applying it is not part of this phase.

---

## Verification

**Setup (once):** `cp /home/miftah/run-insights/.env.local .env.local && npm install` — see the
Prerequisite section; a `node_modules` symlink is not enough for `npm run build`.

**Format / lint:**

```bash
npm run format:check && npm run lint
```

**Build (typecheck):**

```bash
npm run typecheck        # next typegen && tsc --noEmit — vitest does NOT typecheck
npm run build
```

**Tests:**

```bash
npm test
# and, while iterating, the six suites this phase moves:
npx vitest run lib/photos/pointer.test.ts lib/photos/globalDuplicate.test.ts \
  lib/push/duplicateImage.test.ts lib/push/payload.test.ts lib/push/send.test.ts \
  lib/nina/queries.test.ts tests/db.schema.test.ts tests/db.schema.nina.test.ts
```

**Guards (all four that can see this diff):**

```bash
npm run ci:data-layer-guard     # findRunPhotoByContentHash takes userId first
npm run ci:schema-drift-guard   # journal bijection + `when` monotonicity + snapshot prevId chain
npm run ci:client-secret-guard  # nothing new reads process.env
npm run db:check
```

**Manual check:** none — this phase ships no reachable surface. `npm run knip` will newly report the
Step 3/6/8 exports as unused; that is correct and expected until phases 2/3/4 land, and it is
triage backlog rather than a gate. Do **not** silence it and do **not** drop the `export` keyword.

**Exit criteria:**

1. `npm run db:generate` produces `drizzle/0022_*.sql` containing exactly the four statements above,
   `_journal.json` gains `idx: 22`, and `npm run db:check` + `npm run ci:schema-drift-guard` pass.
2. `findGlobalDuplicatePhoto` has passing unit tests covering a hit in each of the three tables, a
   miss that consults all three, a no-round-trip miss on an invalid hash claim, and the exclusion
   pushed into SQL for `shot`/`avatar`.
3. `photoViewerPath({kind:'shot',id})` returns exactly `/photo/shot/<id>`, frozen by
   `lib/photos/pointer.test.ts`.
4. `notifyDuplicateImagePush` is proven to call `notifyNinaPush` with kind `duplicate_image` and url
   `/photo/<kind>/<id>` — never a blob URL.
5. `npm run typecheck`, `npm test` and `npm run build` are green, and no behaviour reachable from
   the running app has changed (no route, no action, no existing push, no dedup decision).

## Handoffs

- **Phase 2 (R2) — the route must be `app/photo/[kind]/[id]/page.tsx`.** Segment names are free but
  the *path shape* is not: `parsePhotoViewerSegments(kind, id)` in `lib/photos/pointer.ts` is the
  parser to use, and `lib/photos/pointer.test.ts` freezes the grammar. **`lib/photos/pointer.ts` is
  the one codec module for this grammar and phase 2 must import it rather than declare a second
  one** — phase 2's draft created a parallel `lib/photos/deepLink.ts`
  (`PhotoDeepLinkKind` / `parsePhotoDeepLink` / `photoDeepLinkHref`) doing exactly this job; the
  reconciler deleted it in round 1, because the builder and the parser being one module is the only
  thing that stops the push payload and the route directory from drifting apart silently. Phase 2 also owns the
  `run_photos` point-read-by-id the viewer needs; `lib/db/queries/photos.ts` has no
  `getRunPhoto(userId, id)` today (verified — the file has `attachExtractionPhotos`,
  `listExtractionPhotos`, `setPhotoExcludedFromShare`, `updatePhotoBlobLocation` and nothing else),
  and `findRunPhotoByContentHash` added here is a hash lookup, not an id lookup — **it is not a
  substitute.** A new `getRunPhoto` must take `userId` first or `npm run ci:data-layer-guard` fails.
- **Phases 3 and 4 (R1) — call `notifyDuplicateImagePush(userId, pointer)`, never `notifyNinaPush`
  directly, and never build the URL.** The expected shape at each finalize site is:

  ```ts
  try {
    const duplicate = await findGlobalDuplicatePhoto(userId, hashes, {
      // one pointer for a single-row write; the WHOLE batch for a multi-row one
      exclude: rowsThisGestureWrote.map((row) => ({ kind: '<this route’s kind>', id: row.id })),
    })
    if (duplicate) await notifyDuplicateImagePush(userId, duplicate)
  } catch (cause) {
    console.warn('[push] duplicate image notify failed', { userId, error: String(cause) })
  }
  ```

  The `exclude` is not optional in practice: every caller runs after its own insert, so omitting it
  makes every genuinely-new upload notify about itself. **Pass every row the gesture wrote, not
  just the one being asked about** — `/api/extract` (up to 3 shots), `sendNinaMessage` (N chat
  images) and the avatar folder drop (up to 50 rows) can each contain two byte-identical files, and
  a per-row exclusion makes those two announce each other. The two admin chat routes write exactly
  one row per call and may pass the single-pointer form.
- **Phase 4 specifically:** the existing unconditional `admin_chat_photo` push
  (`lib/admin/chatPhotoActions.ts:407-416`) is untouched here. Suppressing it in favour of
  `duplicate_image` on a hit is phase 4's edit, and the plan index's Decision 3 is the authority.
  Note the ordering constraint that falls out of this phase: `findGlobalDuplicatePhoto` must be
  called *before* the existing `notifyNinaPush(..., 'admin_chat_photo')` line, or the generic push
  has already fired.
- **Backfilling `content_hash` for pre-existing `run_photos` / `nina_avatars` rows** is out of scope
  for the whole plan set (index Decision 6). A later sweep script would follow
  `scripts/nina-dedupe-media.mjs`'s shape. Until then both columns are NULL for every historical
  row and those rows can never match — which is correct, not a bug.
- **A `duplicate_image` push shares `PUSH_NOTIFICATION_TAG = 'nina'` with every other kind**, so a
  folder drop containing six duplicates produces six sends that collapse to one visible
  notification (the last). That is the existing tag's intended behaviour and is deliberately not
  changed here. **Phase 4 took the option this bullet offered and the reconciler ratified it**
  (round 1): the avatar folder batch scans every landed row, sends ONE push — the first hit — and
  logs the true count. The other four routes accept one image per gesture and keep one push per
  detected duplicate. See the index's Decisions table.
- **Not done, deliberately:** `replaceChatPhotoAction` round-trips a caller-supplied `contentHash`
  with no validation of what it points at (`lib/admin/chatPhotoActions.ts:174-178`). Phase 4 owns
  adding the lookup there.

## Rollback

This phase is additive in every file it touches, so it reverts cleanly on its own:

1. `git revert` the phase's commit(s), or by hand:
   - delete `lib/photos/pointer.ts`, `lib/photos/pointer.test.ts`, `lib/photos/globalDuplicate.ts`,
     `lib/photos/globalDuplicate.test.ts`, `lib/push/duplicateImage.ts`,
     `lib/push/duplicateImage.test.ts`;
   - delete `findRunPhotoByContentHash` from `lib/db/queries/photos.ts` and
     `findNinaAvatarByContentHash` from `lib/nina/queries/avatars.ts`, restoring both files'
     `drizzle-orm` import lines;
   - remove `'findNinaAvatarByContentHash'` from `lib/nina/queries.test.ts`'s frozen list;
   - remove `'duplicate_image'` from `NINA_PUSH_KINDS` and the `url` field from
     `buildNinaPushPayload` / `sendNinaPush` / `NinaPushNotifier` (all three defaults restore the
     old behaviour, so partial reverts are safe in any order);
   - restore the two schema tables and the two schema-shape tests.
2. `drizzle/0022_*.sql`, `drizzle/meta/0022_snapshot.json` and the `idx: 22` journal entry must be
   removed **together**, or `npm run db:check` fails on a broken bijection.
3. **If the migration was already applied to the database**, reverting the files is not enough — the
   columns and indexes are still there and `npm run ci:schema-drift-guard`'s live half will say so.
   Drop them explicitly:

   ```sql
   DROP INDEX IF EXISTS "run_photos_content_hash_idx";
   DROP INDEX IF EXISTS "nina_avatars_user_content_hash_idx";
   ALTER TABLE "run_photos" DROP COLUMN IF EXISTS "content_hash";
   ALTER TABLE "nina_avatars" DROP COLUMN IF EXISTS "content_hash";
   ```

   Both columns are nullable and written by nothing until phases 3/4 land, so dropping them
   destroys no data as long as this phase is rolled back before them.
