# Phase 3: The backfill — bring the rows that already violate R2/R3 into line, deleting nothing

**Plan set:** `CHAT_PHOTO_ORPHANS_AND_UNIQUENESS_PLAN.md`
**Analysis:** `20260907-201920-P4H0_code_analyzer.md`
**Satisfies:** R2, R3 — *"there are no photos from Nina's album that got carried over to Chat
photos, and there are no duplicated photos in Chat photos as well"*, applied to the rows that are
**already** in the database. Phase 2 stops new violations; this phase is the one pass over the
backlog phase 2 cannot reach.
**Depends on:** Phase 2 (and transitively phase 1, which owns the `is_reference` column and the one
migration)
**Difficulty:** NORMAL
**Package:** `scripts` (with one line each in `package.json`, `.gitignore`, and
`lib/nina/.workflows/package_readme.md`)

---

## Goal

After this phase there is a dry-run-by-default operator script,
`npm run nina:chat-photo-dedupe`, that reports and then — only with `--apply` — stamps
`is_reference = true` on every pre-existing `nina_message_images` row that is either (a) one of
Nina's album objects carried into a conversation, or (b) a duplicate of a photograph the collection
already holds. It **deletes nothing**: not a row, not a message, not a Blob object. Its
classification is a set of pure functions over plain row objects, proved by
`tests/nina.chatPhotoDedupe.test.ts` with no database in the loop, so the phase builds and its
suite passes on its own whether or not phase 1's migration has been applied anywhere.

Two things this plan states out loud because they are easy to get wrong:

1. **`scripts/blob-reap.mjs` must NOT be run against the `nina/` prefix until this script has been
   applied.** The bytes of every photograph already destroyed by the cascade phase 1 removes are
   still sitting in the Blob store, unreferenced — `removeNinaSession` deliberately never deleted
   them, which is the only reason those photographs are recoverable at all. A
   `blob-reap --delete` under `nina/` collects exactly those objects and makes R1 retroactively
   unrecoverable. Reap after, never before, and never with `--prefix nina/` in between.
2. **This script is the one act in the whole plan set that writes production.** Phases 1 and 2 ship
   code and a migration; this ships a statement someone runs against the real database by hand.
   The dry-run default is therefore not a convenience for the operator, it is the requirement — and
   `--apply` refuses to run its first `UPDATE` until it has written the pre-change rows to disk.

## Interface Contract

The reconciler reads this section to detect cross-phase conflicts. Be exact and exhaustive.

**Deletes:** nothing. No symbol, no row, no config key, no Blob object. This phase introduces no
`DELETE`, no `del()`, and does not import `@vercel/blob` at all (invariant 2).

**Renames:** none.

**Creates:**
- `scripts/nina-chat-photo-dedupe.mjs` — new file. Exported pure surface, all from this one module:
  `SNAPSHOT_DIR`, `IMAGE_NAME_COLUMNS`, `AVATAR_NAME_COLUMNS`, `SNAPSHOT_COLUMNS`, `CHUNK_SIZE`,
  `isCollectionCandidate`, `albumNameIndex`, `matchAlbumName`, `toMillis`, `compareOldestFirst`,
  `classifyChatPhotoRows`, `csvCell`, `toSnapshotCsv`, `toUndoSql`.
- `tests/nina.chatPhotoDedupe.test.ts` — new file.
- `package.json` → `scripts["nina:chat-photo-dedupe"]` — new key.
- `.gitignore` → `/.snapshots/` — new ignore entry (the script's `--apply` rollback artefacts).
- `lib/nina/.workflows/package_readme.md` — one new `## …` section appended at the end of the file.

**Signature changes:** none. No existing function, type or predicate is touched.

**Requires (from earlier phases):**
- `nina_message_images.is_reference` exists as `boolean NOT NULL DEFAULT false` — declared in
  `lib/db/schema.ts` and applied by `drizzle/0009_*` (**Phase 1**). The script reads and writes the
  column by its SQL name and never imports the schema module.
- `generatedChatPhotoScope` is `kind = 'generated' AND is_reference = false` (**Phase 2**). The
  script **restates that predicate in exactly TWO places** rather than importing it — a `.mjs`
  script cannot import `lib/nina/queries.ts`, the same reason `scripts/blob-reap.mjs` restates
  `NINA_BLOB_PREFIX` by hand and `scripts/nina-memory-reap.mjs` restates
  `NINA_SLOT_PENDING_PROMISES`. The two places are:

  1. **`isCollectionCandidate(row)`** — `row?.kind === 'generated' && row.is_reference !== true`,
     the classifier's gate. `!== true` rather than `=== false` is a deliberate, documented
     widening in the safe direction; it is the same set for every row this database can hold.
  2. **the `--apply` `UPDATE`'s own `WHERE`** — `and kind = 'generated' and is_reference = false`,
     the write-time re-check.

  **`readImages`' `SELECT` carries NO predicate, on purpose**, and an earlier draft of this plan
  claimed three restatements and said the predicate was *"enforced TWICE — in the SQL that reads and
  in `isCollectionCandidate`"*. It is not in the SQL that reads, and it must not be added there: the
  report's `not candidates  N  his uploads and already-marked rows — never touched` line, and the
  `candidates.length === carryOvers + duplicates + keepers` arithmetic that is this classifier's
  stated invariant, both require the SELECT to return the rows the predicate REJECTS. A `WHERE` in
  `readImages` would silently zero the `skipped` count and make the arithmetic vacuous.

  **This is the phase's one duplicated fact, and it is declared here so the reconciler can see it:**
  if phase 2 lands a collection predicate other than `kind = 'generated' AND is_reference = false`,
  **both** restatements above are wrong and must follow it — and so must the two prose paragraphs in
  the script header that quote it (`── THE TWO CLASSES ──` and `── SCOPE ──`) and the readme section
  in Step 5. Phase 2's plan as reconciled lands exactly that predicate, in
  `generatedChatPhotoScope` only.
- `insertNinaMessageImages` accepts `isReference` and the album-share / re-attach paths write
  `true` (**Phase 2**). Nothing here calls them; it matters only in that the backlog this script
  clears is finite — after phase 2 no new member of either class can be written.

**Leaves alone (owned by others):**
- `lib/**` — every file, `lib/db/schema.ts` and `lib/nina/queries.ts` included (Phases 1, 2). The
  only exception is the prose file `lib/nina/.workflows/package_readme.md`, which this phase's scope
  explicitly grants it.
- `app/**`, `components/**` (Phase 1).
- `drizzle/**` and `npm run db:generate` — invariant 3. **This phase runs neither.** One migration,
  phase 1 owns it.
- `scripts/blob-reap.mjs` — unchanged by this phase, and see the Goal's warning about running it.
- `tests/nina.sessionPurge.test.ts`, `lib/nina/album.test.ts`, `tests/admin.chatPhotos.test.ts` —
  Phases 1 and 2 own their assertions.

## Files

| File | Action | What changes |
|---|---|---|
| `scripts/nina-chat-photo-dedupe.mjs` | create | the whole script: header, pure classifier, snapshot writer, `main()` behind profpic's `import.meta.url` guard |
| `tests/nina.chatPhotoDedupe.test.ts` | create | the classification as pure functions on plain rows — no database |
| `package.json` | modify | one line after `"nina:memory-reap"` (`:29`) |
| `.gitignore` | modify | append `/.snapshots/` with its reason (after `:65`) |
| `lib/nina/.workflows/package_readme.md` | modify | append one section at the end of the file (after `:1386`) |

## Implementation Steps

### Step 1: The script

**File:** `scripts/nina-chat-photo-dedupe.mjs` — **new file** (no line reference; nothing exists
there yet). It sits beside `scripts/nina-memory-reap.mjs`, whose shape it follows: dry run by
default, `--apply` to write, per-row output of what it would change, a summary, and a header that
argues for every decision instead of describing the code.

**Change:** create the file with exactly the content below.

Four departures from `nina-memory-reap.mjs` are deliberate, and each is argued in the file's own
header so a later reader does not "fix" it back:

- **`main()` behind an `import.meta.url` guard** instead of top-level `await`. `nina-memory-reap.mjs`
  can afford top-level work because nothing imports it; this module is imported by
  `tests/nina.chatPhotoDedupe.test.ts`, and a top-level `process.exit(1)` on a missing
  `DATABASE_URL` would abort the test run. The guard is `scripts/nina-profpic.mjs:580`'s, verbatim.
- **A snapshot before the first write.** `nina-memory-reap.mjs` takes none; the plan index names one
  as this phase's rollback, so it is a pre-flight and not an optional extra.
- **A "reported, never stamped" block** for a shape the classification deliberately does not act
  on — `blob-reap.mjs`'s defensive-sweep habit, applied to rows that share a `blob_url` under
  different pathnames.
- **A named refusal for a missing column.** `42703` is reported as "phase 1's migration has not been
  applied to THIS database", the way `nina-profpic.mjs` reports `42P01`.

**Code:**

```js
/**
 * Bring the rows that already violate R2 and R3 into line — by MARKING them, never by deleting.
 *
 *   npm run nina:chat-photo-dedupe               # the dry run: reports, writes nothing
 *   npm run nina:chat-photo-dedupe -- --apply
 *
 * NOT A TEST, and never part of `npm test`: it reads the real database and with `--apply` it
 * writes to it. The same line `scripts/nina-memory-reap.mjs`, `scripts/backfill-record-keys.mjs`
 * and `scripts/blob-reap.mjs` draw — and one step further: this is the ONE act of
 * `CHAT_PHOTO_ORPHANS_AND_UNIQUENESS_PLAN.md` that writes production. Everything else in that set
 * is code and a migration. So the dry-run default is not a convenience, it is the requirement.
 *
 * ── WHAT IT IS FOR, AND WHEN IT STOPS BEING NEEDED ────────────────────────────────────────────
 * Phase 2 made `kind = 'generated' AND is_reference = false` the definition of "the Chat photos
 * collection" and taught the album-share and re-attach paths to write `is_reference = true`, so
 * from phase 2 onwards no NEW violation of R2 or R3 can be written. What phase 2 cannot do is
 * change rows written before it: every album photograph `resolveAttachment`'s avatar branch copied
 * into a conversation, and every duplicate its image branch made, is still in the collection with
 * `is_reference = false`. This is the one pass over that backlog. Run it once, then never again —
 * unlike `nina-memory-reap.mjs` there is no race left for it to back-stop, because the fix is a
 * column written by the insert rather than a purge racing a writer.
 *
 * ── IT DELETES NOTHING. NOT A ROW, NOT A MESSAGE, NOT A BLOB ─────────────────────────────────
 * Invariant 2 of the plan, and the overriding value in the request that produced it: *"don't
 * delete existing photos"*. There is no DELETE in this file, no `del()`, and no `@vercel/blob`
 * import at all — checkable by reading the imports rather than by trusting this paragraph. A
 * stamped row keeps its id, its bytes, its `created_at`, its `message_id` and its place in the
 * bubble. Invariant 9: a reference row is still a real photograph in the conversation; all this
 * changes is whether `/admin/photos` counts it as a MEMBER of the collection.
 *
 * ── scripts/blob-reap.mjs MUST NOT BE RUN UNDER `nina/` BEFORE THIS HAS BEEN APPLIED ─────────
 * The bytes of every photograph already destroyed by the cascade phase 1 removes are still in the
 * Blob store, unreferenced — `removeNinaSession` deliberately never deleted them, which is the
 * only reason those photographs are recoverable at all. `blob-reap --delete` under `nina/` would
 * collect exactly those objects and make R1 retroactively unrecoverable. Reap after, never before.
 *
 * ── THE TWO CLASSES, AND WHY THEY ARE DISJOINT BY CONSTRUCTION ───────────────────────────────
 *   (a) ALBUM CARRY-OVER (R2). A candidate row whose `pathname` or `blob_url` is one of the four
 *       names a `nina_avatars` row of the SAME user holds: `pathname`, `blob_url`,
 *       `thumb_pathname`, `thumb_url`. Those six columns across the two tables are exactly
 *       `isBlobPathnameReferenced`'s set (`lib/nina/queries.ts:1791`) and exactly the set
 *       `scripts/blob-reap.mjs` reads for the `nina/` prefix, and they are the same set here on
 *       purpose: "is this the album's object" gets ONE definition in this repo or it gets three
 *       that disagree. `thumb_pathname` and `thumb_url` are nullable, and a NULL is not a name.
 *       Matching on `pathname` alone would miss a row that stored only the other spelling, which
 *       is `blob-reap.mjs`'s recorded reason for collecting both.
 *   (b) DUPLICATE (R3). Every row but the OLDEST of each same-`pathname` group, per user, ordered
 *       `(created_at asc, id asc)` — the exact mirror of `listNinaChatPhotos`'s
 *       `(created_at desc, id desc)`, so the row this keeps is the one that listing shows LAST.
 *
 * The dedupe pass runs over the rows class (a) did not take, so no row is in both classes and no
 * row is stamped twice. It also means a pathname group whose members are all album objects is
 * taken whole by (a) and never reaches (b) — which is right: R2 says no album photograph appears
 * in the collection, not "one of them may stay".
 *
 * ── SCOPE: `kind = 'generated'`, AND HIS UPLOADS ARE NOT THE COLLECTION ──────────────────────
 * The candidate predicate is `kind = 'generated' AND is_reference = false` — phase 2's
 * `generatedChatPhotoScope`, restated here the way `blob-reap.mjs` restates `NINA_BLOB_PREFIX` and
 * `nina-memory-reap.mjs` restates `NINA_SLOT_PENDING_PROMISES`, because a `.mjs` script cannot
 * import `lib/nina/queries.ts`. Keep it identical to that function. `kind = 'upload'` is outside
 * the predicate entirely: those are HIS photographs, `/admin/photos` never listed them, and
 * neither the carry-over path nor the duplication path ever produced one.
 *
 * It is enforced TWICE — in `isCollectionCandidate`, which classifies, and again in the `--apply`
 * UPDATE's own WHERE, which writes — because a script that writes production gets two locks on the
 * door, and because the first of the two is the one a unit test can see.
 *
 * The read below deliberately has NO WHERE clause and must not gain one. `skipped` — "his uploads
 * and already-marked rows, never touched" — is a REPORTED count, and
 * `candidates.length === carryOvers.length + duplicates.length + keepers.length` is this
 * classifier's stated invariant; both need the rows the predicate rejects to arrive. Filtering in
 * SQL would zero the first and make the second vacuous, and at this table's size (single-digit
 * thousands of rows at the horizon) reading all of it once from a laptop costs nothing.
 *
 * ── THE SNAPSHOT, AND WHY IT IS NOT LITERALLY A `\copy` ──────────────────────────────────────
 * `--apply` writes nothing until it has written the pre-change rows to disk: one CSV in the exact
 * shape `psql \copy … with (format csv, header true)` reads, plus the executable
 * `UPDATE … SET is_reference = false WHERE id IN (…)` that undoes the run. `\copy` is a psql
 * CLIENT command and this script speaks `@neondatabase/serverless` over HTTP, so it cannot issue
 * one; it writes the file `\copy` would have written instead. Both files are opened `wx`, so a
 * name collision is a refusal rather than an overwritten rollback. This snapshot IS the plan's
 * stated rollback for this phase, which is why failing to write it aborts the run before the first
 * UPDATE instead of after it.
 *
 * ── NO user_id IN THE UPDATE, AND THAT IS NOT AN OWNERSHIP HOLE ──────────────────────────────
 * `nina-memory-reap.mjs`'s argument, unchanged: invariant 4 governs code that answers a request on
 * behalf of a signed-in user. This script has no request and no session; it is run from a laptop
 * against `DATABASE_URL` by the person who owns the database, and every id it updates is an id it
 * read itself in the same run. `user_id` IS part of every grouping key, so no row is ever compared
 * with another account's, and it is REPORTED on every line so the output stays readable per
 * account.
 *
 * ── THE PURE HALF IS EXPORTED, AND tests/nina.chatPhotoDedupe.test.ts IS WHAT PROVES IT ──────
 * Everything above `main()` is a pure function over plain row objects, so the classification is
 * testable without a database — the shape `scripts/nina-profpic.mjs` set and
 * `tests/nina.profpic.test.ts` reads. Rows are taken in the driver's own snake_case so nothing
 * between the SELECT and the classifier renames anything. And because that suite imports this
 * module, the work sits behind profpic's `import.meta.url` guard (`nina-profpic.mjs:580`) rather
 * than at top level the way `nina-memory-reap.mjs` can afford to: a top-level `process.exit(1)` on
 * a missing `DATABASE_URL` would kill `npm test`.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { neon } from '@neondatabase/serverless'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(HERE, '..')

/** Where `--apply` puts the pre-change CSV and its undo. Gitignored — see `.gitignore`. */
export const SNAPSHOT_DIR = path.join(REPO, '.snapshots')

/** The two names a `nina_message_images` row can hold. Half of `isBlobPathnameReferenced`'s six. */
export const IMAGE_NAME_COLUMNS = ['pathname', 'blob_url']

/** The four a `nina_avatars` row can hold. The other half. Two of them are nullable. */
export const AVATAR_NAME_COLUMNS = ['pathname', 'blob_url', 'thumb_pathname', 'thumb_url']

/** The snapshot projection, in order — everything needed to see what a stamp changed. */
export const SNAPSHOT_COLUMNS = [
  'id',
  'user_id',
  'message_id',
  'kind',
  'pathname',
  'blob_url',
  'is_reference',
  'created_at',
]

/** Ids per UPDATE. An HTTP round trip is ~100 ms; a 4000-element array literal is not a parameter. */
export const CHUNK_SIZE = 200

/* ── The pure half. These are what `tests/nina.chatPhotoDedupe.test.ts` proves. ────────────── */

/**
 * Is this row a MEMBER of the Chat photos collection, i.e. a row this script may stamp?
 *
 * Phase 2's `generatedChatPhotoScope` as a predicate on one row. `is_reference !== true` rather
 * than `=== false` so a row read from a database where the column is somehow NULL is still treated
 * as a member — the honest reading of `NOT NULL DEFAULT false`, and the safe direction either way,
 * since the worst case is that this script re-stamps a row that is already marked and the UPDATE's
 * own `is_reference = false` clause then declines to touch it.
 */
export function isCollectionCandidate(row) {
  return row?.kind === 'generated' && row.is_reference !== true
}

/**
 * Every name the album holds, per user: `Map<user_id, Map<name, { avatarId, column }>>`.
 *
 * The value keeps WHICH avatar and WHICH of the four columns matched, because a report that says
 * "this row is an album object" without saying which album object is a report nobody can check
 * against `/admin/nina`. First writer wins on a collision (two avatars naming one blob is legal —
 * `blob-reap.mjs`'s "named by 2+ rows" case) and it does not matter which is named: the question
 * this answers is "is this the album's object at all".
 */
export function albumNameIndex(avatarRows) {
  const perUser = new Map()
  for (const avatar of avatarRows ?? []) {
    let names = perUser.get(avatar.user_id)
    if (!names) perUser.set(avatar.user_id, (names = new Map()))
    for (const column of AVATAR_NAME_COLUMNS) {
      const name = avatar[column]
      if (typeof name !== 'string' || name === '') continue
      if (!names.has(name)) names.set(name, { avatarId: avatar.id, column })
    }
  }
  return perUser
}

/**
 * Does this chat row name one of ITS OWN USER's album objects? The match or `null`.
 *
 * Same-user only, and that is not merely conventional: Blob objects are per-user by pathname
 * (`nina/<userId>/…`), so a name held by another account's avatar cannot be this row's object and
 * a cross-user match would be a false positive that excluded a real photograph from the
 * collection. `isBlobPathnameReferenced` scopes by `user_id` for the mirror reason.
 */
export function matchAlbumName(row, index) {
  const names = index.get(row.user_id)
  if (!names) return null
  for (const column of IMAGE_NAME_COLUMNS) {
    const name = row[column]
    if (typeof name !== 'string' || name === '') continue
    const hit = names.get(name)
    if (hit) return { on: column, name, avatarId: hit.avatarId, avatarColumn: hit.column }
  }
  return null
}

/**
 * `created_at` as epoch milliseconds, from whatever the driver handed us.
 *
 * `@neondatabase/serverless` applies pg's type parsers, so a `timestamptz` normally arrives as a
 * `Date`. It does not always: a driver option, a future version, or a hand-built row in a test can
 * hand over Postgres's own text form (`2026-09-01 10:00:00.123+00`), which V8 does not reliably
 * parse — the space instead of `T` and the two-digit offset are both non-ISO. Normalising here
 * rather than trusting the driver is the difference between "the oldest row is kept" and "an
 * arbitrary row is kept", so it is a tested function and not an inline expression.
 *
 * An unreadable value returns 0, which sorts the row FIRST and therefore makes it the row that is
 * KEPT. That is the safe direction on purpose: nothing is ever excluded from the collection on the
 * strength of a value this function could not read.
 */
export function toMillis(value) {
  if (value instanceof Date) return value.getTime()
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0
  if (typeof value !== 'string' || value === '') return 0
  const dated = value.includes('T') ? value : value.replace(' ', 'T')
  const zoned = /([Zz]|[+-]\d{2}(:?\d{2})?)$/.test(dated) ? dated : `${dated}Z`
  const ms = new Date(zoned.replace(/([+-]\d{2})$/, '$1:00')).getTime()
  return Number.isFinite(ms) ? ms : 0
}

/**
 * `(created_at asc, id asc)` — the mirror of `listNinaChatPhotos`'s `(created_at desc, id desc)`,
 * so the row this ordering puts first is the row that listing puts last.
 *
 * The `id` tiebreak matters because `created_at` ties for rows written in one statement, which is
 * the same reason that listing has one. It is compared here with JavaScript's `<` (code-point
 * order) rather than by Postgres under the database's collation, so the two can in principle
 * disagree — and it does not matter: the tiebreak only ever decides WHICH of two rows naming the
 * SAME pathname keeps its membership, and those two rows are the same photograph.
 */
export function compareOldestFirst(a, b) {
  const at = toMillis(a.created_at)
  const bt = toMillis(b.created_at)
  if (at !== bt) return at - bt
  if (a.id === b.id) return 0
  return a.id < b.id ? -1 : 1
}

/**
 * The whole classification, as one pure function over two arrays of rows.
 *
 * Returns:
 *   · `candidates`  — rows inside the collection predicate; the only rows anything below may touch
 *   · `skipped`     — his uploads and already-marked rows, reported so the arithmetic adds up
 *   · `carryOvers`  — class (a): `{ row, reason: 'album', match }`
 *   · `duplicates`  — class (b): `{ row, reason: 'duplicate', keptId }`
 *   · `keepers`     — what the collection holds AFTER a run: one row per pathname, none from the album
 *   · `stamped`     — `carryOvers` then `duplicates`, which is exactly what `--apply` writes
 *   · `blobUrlOnly` — reported, never stamped; see the block that prints it
 *
 * `candidates.length === carryOvers.length + duplicates.length + keepers.length` is an invariant of
 * this function and an assertion of its suite: every candidate lands in exactly one of the three,
 * so no row is stamped twice and none is silently dropped.
 */
export function classifyChatPhotoRows(imageRows, avatarRows) {
  const index = albumNameIndex(avatarRows)

  const candidates = []
  const skipped = []
  for (const row of imageRows ?? []) {
    if (isCollectionCandidate(row)) candidates.push(row)
    else skipped.push(row)
  }

  const carryOvers = []
  const rest = []
  for (const row of candidates) {
    const match = matchAlbumName(row, index)
    if (match) carryOvers.push({ row, reason: 'album', match })
    else rest.push(row)
  }

  /* Grouped per user and THEN per pathname — nested maps rather than one composite
   * `user + separator + pathname` key. A composite key needs a separator character proved
   * impossible in both halves, and the honest separator for that job is a NUL, which turns this
   * source file into something `grep` calls binary the moment someone transcribes the escape
   * slightly wrong. Nesting needs no such proof, and it reads as what it is: no row is ever
   * compared with another account's row. */
  const byPathname = new Map()
  for (const row of rest) {
    let perUser = byPathname.get(row.user_id)
    if (!perUser) byPathname.set(row.user_id, (perUser = new Map()))
    let group = perUser.get(row.pathname)
    if (!group) perUser.set(row.pathname, (group = []))
    group.push(row)
  }

  const keepers = []
  const duplicates = []
  for (const perUser of byPathname.values()) {
    for (const group of perUser.values()) {
      const ordered = [...group].sort(compareOldestFirst)
      const kept = ordered[0]
      keepers.push(kept)
      for (const row of ordered.slice(1)) {
        duplicates.push({ row, reason: 'duplicate', keptId: kept.id })
      }
    }
  }

  const byBlobUrl = new Map()
  for (const row of rest) {
    if (typeof row.blob_url !== 'string' || row.blob_url === '') continue
    let perUser = byBlobUrl.get(row.user_id)
    if (!perUser) byBlobUrl.set(row.user_id, (perUser = new Map()))
    let group = perUser.get(row.blob_url)
    if (!group) perUser.set(row.blob_url, (group = []))
    group.push(row)
  }
  const blobUrlOnly = []
  for (const perUser of byBlobUrl.values()) {
    for (const group of perUser.values()) {
      if (group.length < 2) continue
      if (new Set(group.map((row) => row.pathname)).size < 2) continue
      blobUrlOnly.push([...group].sort(compareOldestFirst))
    }
  }

  return {
    candidates,
    skipped,
    carryOvers,
    duplicates,
    keepers,
    stamped: [...carryOvers, ...duplicates],
    blobUrlOnly,
  }
}

/** One CSV cell, RFC 4180. A `Date` goes out as ISO-8601 so the file is readable by a human too. */
export function csvCell(value) {
  if (value == null) return ''
  const text = value instanceof Date ? value.toISOString() : String(value)
  return /["\r\n,]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

/** The snapshot, in the exact shape `\copy … with (format csv, header true)` reads. */
export function toSnapshotCsv(rows) {
  const lines = [SNAPSHOT_COLUMNS.join(',')]
  for (const row of rows) lines.push(SNAPSHOT_COLUMNS.map((column) => csvCell(row[column])).join(','))
  return `${lines.join('\n')}\n`
}

/**
 * The executable undo for one `--apply` run.
 *
 * Every row it names carried `is_reference = false` before the run — that is the candidate
 * predicate, enforced in the SELECT, in `isCollectionCandidate` and again in the UPDATE's own
 * WHERE — so restoring the previous state is one statement and needs nothing read back out of the
 * CSV. The CSV is the record of what those rows WERE; this file is the button.
 */
export function toUndoSql(rows) {
  const ids = rows.map((row) => `         '${String(row.id).replaceAll("'", "''")}'`)
  return (
    '-- Undo one `npm run nina:chat-photo-dedupe -- --apply` run.\n' +
    '-- Every row below carried is_reference = false before the run (the candidate predicate),\n' +
    '-- so this statement is the whole rollback. The .csv beside it is the record of what they were.\n' +
    'update nina_message_images\n' +
    '   set is_reference = false\n' +
    ` where id in (\n${ids.join(',\n')}\n       );\n`
  )
}

/* ── The impure half: reads, one write, and the report between them. ───────────────────────── */

function chunked(list, size) {
  const out = []
  for (let index = 0; index < list.length; index += size) out.push(list.slice(index, index + size))
  return out
}

function isoOf(value) {
  const ms = toMillis(value)
  return ms === 0 ? String(value) : new Date(ms).toISOString()
}

function reportLine(row, note) {
  return `  ~   ${row.id}  user ${row.user_id}  ${row.pathname}\n        ${note}`
}

/**
 * Every chat photograph, ordered so the report reads per account and oldest-first.
 *
 * A missing `is_reference` column means phase 1's migration has not reached THIS database, and it
 * is reported as that sentence rather than as a Postgres error code — `nina-profpic.mjs` does the
 * same for a missing `nina_avatars` (42P01), for the same reason: here that is what it always
 * means.
 */
async function readImages(sql) {
  try {
    return await sql`
      select id, user_id, message_id, kind, pathname, blob_url, is_reference, created_at
        from nina_message_images
       order by user_id, created_at, id
    `
  } catch (error) {
    const code = error?.code ?? ''
    if (code === '42703' || /is_reference/.test(String(error?.message ?? ''))) {
      console.error(
        'FAIL  nina_message_images has no is_reference column.\n' +
          "      That is what phase 1's migration (drizzle/0009_*) not having been applied to\n" +
          '      THIS database looks like. Run `npm run db:migrate`, then re-run the dry run.',
      )
      process.exit(1)
    }
    throw error
  }
}

function writeSnapshot(rows) {
  mkdirSync(SNAPSHOT_DIR, { recursive: true })
  const stamp = new Date().toISOString().replaceAll(':', '-').replace(/\.\d+Z$/, 'Z')
  const csvPath = path.join(SNAPSHOT_DIR, `nina-chat-photo-dedupe-${stamp}.csv`)
  const undoPath = path.join(SNAPSHOT_DIR, `nina-chat-photo-dedupe-${stamp}.undo.sql`)
  writeFileSync(csvPath, toSnapshotCsv(rows), { encoding: 'utf8', flag: 'wx' })
  writeFileSync(undoPath, toUndoSql(rows), { encoding: 'utf8', flag: 'wx' })
  return { csvPath, undoPath }
}

async function main() {
  const apply = process.argv.includes('--apply')
  const url = process.env.DATABASE_URL
  if (!url) {
    console.error('FAIL  DATABASE_URL is not set. Run with `node --env-file=.env.local`.')
    process.exit(1)
  }
  const sql = neon(url)

  console.log(
    `${apply ? 'APPLY' : 'DRY RUN'} — marking album carry-overs and duplicates in the Chat` +
      ' photos collection\n',
  )

  const images = await readImages(sql)
  const avatars = await sql`
    select id, user_id, pathname, blob_url, thumb_pathname, thumb_url
      from nina_avatars
  `

  const plan = classifyChatPhotoRows(images, avatars)

  console.log(
    `read                  ${images.length} nina_message_images row(s), ` +
      `${avatars.length} nina_avatars row(s)`,
  )
  console.log(
    `collection candidates ${plan.candidates.length}  ` +
      "(kind = 'generated' and is_reference = false)",
  )
  console.log(
    `not candidates        ${plan.skipped.length}  his uploads and already-marked rows —` +
      ' never touched',
  )

  console.log(`\n(a) album carry-overs — ${plan.carryOvers.length} row(s)   [R2]`)
  for (const entry of plan.carryOvers) {
    console.log(
      reportLine(
        entry.row,
        `nina_message_images.${entry.match.on} = nina_avatars.${entry.match.avatarColumn}` +
          ` of avatar ${entry.match.avatarId}`,
      ),
    )
  }

  console.log(
    `\n(b) duplicates — ${plan.duplicates.length} row(s), the oldest of each pathname kept   [R3]`,
  )
  for (const entry of plan.duplicates) {
    console.log(reportLine(entry.row, `keeping ${entry.keptId}; this one is ${isoOf(entry.row.created_at)}`))
  }

  console.log(
    `\ncollection after this run — ${plan.keepers.length} row(s): one per pathname, none from` +
      ' the album',
  )

  if (plan.blobUrlOnly.length > 0) {
    console.log(
      `\n!! ${plan.blobUrlOnly.length} group(s) share a blob_url under DIFFERENT pathnames.\n` +
        '   REPORTED, NEVER STAMPED. R3 is defined on pathname (the grouping above), and no\n' +
        '   writer in this repo can produce this shape: each one either copies both names or\n' +
        '   writes a fresh unique pathname. If you are reading this line, a writer nobody knows\n' +
        '   about exists — find it before widening the classification.',
    )
    for (const group of plan.blobUrlOnly) {
      console.log(`     ${group[0].blob_url}`)
      for (const row of group) console.log(`       ${row.id}  ${row.pathname}`)
    }
  }

  if (!apply) {
    console.log(
      `\nnothing was written. ${plan.stamped.length} change(s) pending. Re-run with --apply.` +
        (plan.stamped.length === 0
          ? '\n(Nothing to do — the collection holds each photograph once and no album row.)'
          : ''),
    )
    process.exit(0)
  }

  if (plan.stamped.length === 0) {
    console.log('\nnothing to stamp: no snapshot written and no statement run.')
    process.exit(0)
  }

  const snapshot = writeSnapshot(plan.stamped.map((entry) => entry.row))
  console.log(`\nsnapshot  ${snapshot.csvPath}`)
  console.log(`undo      ${snapshot.undoPath}`)

  const ids = plan.stamped.map((entry) => entry.row.id)
  let stamped = 0
  for (const chunk of chunked(ids, CHUNK_SIZE)) {
    const updated = await sql`
      update nina_message_images
         set is_reference = true
       where id = any(${chunk}::text[])
         and kind = 'generated'
         and is_reference = false
      returning id
    `
    stamped += updated.length
  }

  console.log(`\nSTAMPED ${stamped} of ${ids.length} row(s) with is_reference = true. 0 deleted.`)
  if (stamped !== ids.length) {
    console.error(
      `${ids.length - stamped} row(s) no longer matched the candidate predicate at write time —\n` +
        'something changed them between the read and the write. Re-run the dry run and look.',
    )
    process.exit(1)
  }
  console.log('Re-run without --apply to confirm the collection is clean.')
}

/* `scripts/nina-profpic.mjs:580`, verbatim: run only when invoked, so the suite can import the
 * pure half above without this file touching a database or reading process.argv. */
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main()
}
```

**Impact:** adds one operator command. Nothing in `app/`, `components/` or `lib/` imports this
module, and nothing in the running application can reach it. `npm test` imports only the pure
exports.

### Step 2: The `package.json` entry

**File:** `package.json:29` — insert one line immediately after the `"nina:memory-reap"` entry, so
the two dry-run-by-default Nina maintenance commands sit together.

**Change:** add `"nina:chat-photo-dedupe"`. Plain `node`, no `--experimental-strip-types`: this
script imports no TypeScript (`nina-memory-reap.mjs`'s form, not `nina-profpic.mjs`'s).

**Code:** the `scripts` block, lines 28–31, becomes:

```json
    "blob:reap": "node --env-file=.env.local scripts/blob-reap.mjs",
    "nina:memory-reap": "node --env-file=.env.local scripts/nina-memory-reap.mjs",
    "nina:chat-photo-dedupe": "node --env-file=.env.local scripts/nina-chat-photo-dedupe.mjs",
    "badges:backfill-runs": "node --env-file=.env.local scripts/backfill-badge-run-ids.mjs",
```

**Impact:** `npm run nina:chat-photo-dedupe` (dry run) and
`npm run nina:chat-photo-dedupe -- --apply` (writes). No dependency change, no lockfile change.

### Step 3: Ignore the snapshot directory

**File:** `.gitignore` — append at the end of the file (currently 65 lines; the last entry is the
F19 capture-harness block at `:62-65`).

**Change:** `--apply` writes its rollback CSV and undo SQL into `.snapshots/` at the repo root.
Those files carry production row ids and blob URLs and are operator state, not source. This is the
same rule the file already applies to `scripts/capture/.manifest.json` and the badge-art
`_candidates/` directories, and it is a one-line entry rather than a redirect to `os.tmpdir()`
because a rollback snapshot that evaporates on reboot is not a rollback.

**Code:** append these four lines:

```gitignore

# Snapshots taken by `npm run nina:chat-photo-dedupe -- --apply` before it writes: the pre-change
# rows as CSV plus the UPDATE that undoes the run. Operator state carrying production ids, and the
# stated rollback for that script — kept on disk, never committed.
/.snapshots/
```

**Impact:** `git status` stays clean after an `--apply`. Nothing else changes; the directory does
not exist until the first `--apply`, and the dry run never creates it.

### Step 4: The tests

**File:** `tests/nina.chatPhotoDedupe.test.ts` — **new file**. Named for
`tests/nina.profpic.test.ts`, the existing precedent for a suite over a `.mjs` script's pure half,
and importing through the `@/` alias exactly as that file does (`@/scripts/nina-profpic.mjs`).

**Change:** create the file with exactly the content below. It touches no database: every case is
plain objects in, classification out. `tsconfig.json` has `allowJs: true`, which is what lets a
`.ts` test import a `.mjs` module and typecheck — proved by the profpic suite already in the tree.

**Code:**

```ts
import { describe, expect, it } from 'vitest'

import {
  AVATAR_NAME_COLUMNS,
  IMAGE_NAME_COLUMNS,
  albumNameIndex,
  classifyChatPhotoRows,
  compareOldestFirst,
  csvCell,
  isCollectionCandidate,
  toMillis,
  toSnapshotCsv,
  toUndoSql,
} from '@/scripts/nina-chat-photo-dedupe.mjs'

/**
 * The classification half of `scripts/nina-chat-photo-dedupe.mjs`, as pure functions over plain
 * rows — no database, and none needed: the two classes are decided entirely by column values.
 * The read, the snapshot and the one UPDATE are not testable without writing production, and the
 * phase plan's Verification section says so rather than pretending otherwise.
 *
 * The rows are spelled in the driver's snake_case because that is what the script consumes; a
 * camelCase fixture here would be testing a mapping that does not exist.
 *
 * What these cases hold, in order: which rows are album carry-overs (R2), which are duplicates
 * (R3), which are untouched, that a row is never counted twice, and that `created_at` is read the
 * same whether the driver hands over a Date, an ISO string or Postgres's own text form.
 */

interface ImageRow {
  id: string
  user_id: string
  message_id: string | null
  kind: string
  pathname: string
  blob_url: string
  is_reference: boolean
  created_at: string | Date
}

interface AvatarRow {
  id: string
  user_id: string
  pathname: string
  blob_url: string
  thumb_pathname: string | null
  thumb_url: string | null
}

const STORE = 'https://s.public.blob.vercel-storage.com'

/**
 * `blob_url` is DERIVED from `pathname` unless a case overrides it, because that is the only shape
 * any writer in the repo produces: `put()` returns a URL whose tail is the pathname it was given.
 * A fixture that pairs pathname X with a URL naming Y is not a row this database can hold, and it
 * trips the `blobUrlOnly` reporter for a reason that has nothing to do with the case under test.
 * The one case that WANTS that shape passes both fields explicitly.
 */
const image = (over: Partial<ImageRow> & { id: string }): ImageRow => {
  const pathname = over.pathname ?? 'nina/u1/chat/aaaaaaaaaaaa.jpg'
  return {
    user_id: 'u1',
    message_id: 'm1',
    kind: 'generated',
    pathname,
    blob_url: `${STORE}/${pathname}`,
    is_reference: false,
    created_at: '2026-09-01T10:00:00.000Z',
    ...over,
  }
}

const avatar = (over: Partial<AvatarRow> & { id: string }): AvatarRow => {
  const pathname = over.pathname ?? 'nina/u1/avatar-bbbbbbbbbbbb.jpg'
  return {
    user_id: 'u1',
    pathname,
    blob_url: `${STORE}/${pathname}`,
    thumb_pathname: null,
    thumb_url: null,
    ...over,
  }
}

const idsOf = (list: readonly { row: { id: string } }[]) => list.map((entry) => entry.row.id)
const rowIdsOf = (list: readonly { id: string }[]) => list.map((row) => row.id)

describe('the six columns that define "the album\'s object"', () => {
  it('is isBlobPathnameReferenced\'s set, split across the two tables', () => {
    expect(IMAGE_NAME_COLUMNS).toEqual(['pathname', 'blob_url'])
    expect(AVATAR_NAME_COLUMNS).toEqual(['pathname', 'blob_url', 'thumb_pathname', 'thumb_url'])
    expect(IMAGE_NAME_COLUMNS.length + AVATAR_NAME_COLUMNS.length).toBe(6)
  })

  it('indexes every non-null name per user, and skips the nullable ones when they are null', () => {
    const index = albumNameIndex([
      avatar({ id: 'av1', thumb_pathname: 'nina/u1/avatar-bbbbbbbbbbbb-thumb.jpg' }),
      avatar({ id: 'av2', user_id: 'u2', pathname: 'nina/u2/avatar-cccccccccccc.jpg' }),
    ])

    expect(index.get('u1')?.get('nina/u1/avatar-bbbbbbbbbbbb.jpg')?.avatarId).toBe('av1')
    expect(index.get('u1')?.get('nina/u1/avatar-bbbbbbbbbbbb-thumb.jpg')?.column).toBe(
      'thumb_pathname',
    )
    expect(index.get('u1')?.has('nina/u2/avatar-cccccccccccc.jpg')).toBe(false)
    expect(index.get('u2')?.get('nina/u2/avatar-cccccccccccc.jpg')?.avatarId).toBe('av2')
  })
})

describe('(a) album carry-overs — R2', () => {
  it('takes a row whose pathname is the avatar\'s pathname', () => {
    const result = classifyChatPhotoRows(
      [image({ id: 'i1', pathname: 'nina/u1/avatar-bbbbbbbbbbbb.jpg' })],
      [avatar({ id: 'av1' })],
    )

    expect(idsOf(result.carryOvers)).toEqual(['i1'])
    expect(result.carryOvers[0]?.match).toMatchObject({
      on: 'pathname',
      avatarColumn: 'pathname',
      avatarId: 'av1',
    })
    expect(result.keepers).toEqual([])
    expect(result.duplicates).toEqual([])
  })

  it('takes a row that matches on blob_url against thumb_url — all four album columns count', () => {
    const result = classifyChatPhotoRows(
      [
        image({
          id: 'i1',
          pathname: 'nina/u1/chat/dddddddddddd.jpg',
          blob_url: `${STORE}/nina/u1/avatar-b-thumb.jpg`,
        }),
      ],
      [
        avatar({
          id: 'av1',
          thumb_pathname: 'nina/u1/avatar-b-thumb.jpg',
          thumb_url: `${STORE}/nina/u1/avatar-b-thumb.jpg`,
        }),
      ],
    )

    expect(idsOf(result.carryOvers)).toEqual(['i1'])
    expect(result.carryOvers[0]?.match).toMatchObject({ on: 'blob_url', avatarColumn: 'thumb_url' })
  })

  it('does NOT take a row matching ANOTHER user\'s avatar', () => {
    const result = classifyChatPhotoRows(
      [image({ id: 'i1', pathname: 'nina/u2/avatar-cccccccccccc.jpg' })],
      [avatar({ id: 'av2', user_id: 'u2', pathname: 'nina/u2/avatar-cccccccccccc.jpg' })],
    )

    expect(result.carryOvers).toEqual([])
    expect(rowIdsOf(result.keepers)).toEqual(['i1'])
  })

  it('takes the WHOLE pathname group, so no album photograph stays in the collection', () => {
    const result = classifyChatPhotoRows(
      [
        image({ id: 'i1', pathname: 'nina/u1/avatar-bbbbbbbbbbbb.jpg' }),
        image({
          id: 'i2',
          pathname: 'nina/u1/avatar-bbbbbbbbbbbb.jpg',
          created_at: '2026-09-02T10:00:00.000Z',
        }),
      ],
      [avatar({ id: 'av1' })],
    )

    expect(idsOf(result.carryOvers).sort()).toEqual(['i1', 'i2'])
    expect(result.duplicates).toEqual([])
    expect(result.keepers).toEqual([])
  })
})

describe('(b) duplicates — R3', () => {
  it('keeps the oldest of a pathname group and stamps the rest', () => {
    const result = classifyChatPhotoRows(
      [
        image({ id: 'newest', created_at: '2026-09-03T10:00:00.000Z' }),
        image({ id: 'oldest', created_at: '2026-09-01T10:00:00.000Z' }),
        image({ id: 'middle', created_at: '2026-09-02T10:00:00.000Z' }),
      ],
      [],
    )

    expect(rowIdsOf(result.keepers)).toEqual(['oldest'])
    expect(idsOf(result.duplicates)).toEqual(['middle', 'newest'])
    expect(result.duplicates.every((entry) => entry.keptId === 'oldest')).toBe(true)
  })

  it('breaks a created_at tie on id ascending — the mirror of the listing\'s id desc', () => {
    const result = classifyChatPhotoRows(
      [image({ id: 'bbb' }), image({ id: 'aaa' }), image({ id: 'ccc' })],
      [],
    )

    expect(rowIdsOf(result.keepers)).toEqual(['aaa'])
    expect(idsOf(result.duplicates)).toEqual(['bbb', 'ccc'])
  })

  it('leaves a pathname group of one alone', () => {
    const result = classifyChatPhotoRows(
      [
        image({ id: 'i1', pathname: 'nina/u1/chat/aaaaaaaaaaaa.jpg' }),
        image({ id: 'i2', pathname: 'nina/u1/chat/eeeeeeeeeeee.jpg' }),
      ],
      [],
    )

    expect(result.duplicates).toEqual([])
    expect(rowIdsOf(result.keepers).sort()).toEqual(['i1', 'i2'])
  })

  it('never groups two users together, even on an identical pathname', () => {
    const result = classifyChatPhotoRows(
      [image({ id: 'his' }), image({ id: 'hers', user_id: 'u2' })],
      [],
    )

    expect(result.duplicates).toEqual([])
    expect(rowIdsOf(result.keepers).sort()).toEqual(['hers', 'his'])
  })
})

describe('what it never touches', () => {
  it('skips kind = upload — his photographs are not the collection', () => {
    const result = classifyChatPhotoRows(
      [
        image({ id: 'up1', kind: 'upload' }),
        image({ id: 'up2', kind: 'upload', created_at: '2026-09-02T10:00:00.000Z' }),
      ],
      [avatar({ id: 'av1', pathname: 'nina/u1/chat/aaaaaaaaaaaa.jpg' })],
    )

    expect(rowIdsOf(result.skipped).sort()).toEqual(['up1', 'up2'])
    expect(result.candidates).toEqual([])
    expect(result.stamped).toEqual([])
  })

  it('skips a row that is already marked', () => {
    const result = classifyChatPhotoRows([image({ id: 'i1', is_reference: true })], [])

    expect(rowIdsOf(result.skipped)).toEqual(['i1'])
    expect(result.stamped).toEqual([])
  })

  it('is the same predicate as isCollectionCandidate, row by row', () => {
    expect(isCollectionCandidate(image({ id: 'i1' }))).toBe(true)
    expect(isCollectionCandidate(image({ id: 'i2', kind: 'upload' }))).toBe(false)
    expect(isCollectionCandidate(image({ id: 'i3', is_reference: true }))).toBe(false)
  })

  it('reports a shared blob_url under different pathnames without stamping it', () => {
    const shared = `${STORE}/nina/u1/chat/ffffffffffff.jpg`
    const result = classifyChatPhotoRows(
      [
        image({ id: 'i1', pathname: 'nina/u1/chat/one.jpg', blob_url: shared }),
        image({
          id: 'i2',
          pathname: 'nina/u1/chat/two.jpg',
          blob_url: shared,
          created_at: '2026-09-02T10:00:00.000Z',
        }),
      ],
      [],
    )

    expect(result.blobUrlOnly).toHaveLength(1)
    expect(rowIdsOf(result.blobUrlOnly[0] ?? [])).toEqual(['i1', 'i2'])
    expect(result.stamped).toEqual([])
    expect(rowIdsOf(result.keepers).sort()).toEqual(['i1', 'i2'])
  })
})

describe('no row is ever counted twice', () => {
  it('partitions the candidates into carry-overs, duplicates and keepers', () => {
    const rows = [
      image({ id: 'album1', pathname: 'nina/u1/avatar-bbbbbbbbbbbb.jpg' }),
      image({ id: 'dupNew', created_at: '2026-09-05T10:00:00.000Z' }),
      image({ id: 'dupOld', created_at: '2026-09-01T10:00:00.000Z' }),
      image({ id: 'only', pathname: 'nina/u1/chat/eeeeeeeeeeee.jpg' }),
      image({ id: 'upload', kind: 'upload', pathname: 'nina/u1/chat/gggggggggggg.jpg' }),
      image({ id: 'marked', is_reference: true, pathname: 'nina/u1/chat/hhhhhhhhhhhh.jpg' }),
    ]
    const result = classifyChatPhotoRows(rows, [avatar({ id: 'av1' })])

    expect(result.candidates).toHaveLength(4)
    expect(
      result.carryOvers.length + result.duplicates.length + result.keepers.length,
    ).toBe(result.candidates.length)

    const stamped = idsOf(result.stamped)
    expect(stamped.sort()).toEqual(['album1', 'dupNew'])
    expect(new Set(stamped).size).toBe(stamped.length)
    expect(stamped.some((id) => rowIdsOf(result.keepers).includes(id))).toBe(false)
    expect(rowIdsOf(result.keepers).sort()).toEqual(['dupOld', 'only'])
  })
})

describe('created_at, however the driver spells it', () => {
  it('reads a Date, an ISO string and Postgres\'s own text form to the same instant', () => {
    const ms = Date.UTC(2026, 8, 1, 10, 0, 0, 123)
    expect(toMillis(new Date(ms))).toBe(ms)
    expect(toMillis('2026-09-01T10:00:00.123Z')).toBe(ms)
    expect(toMillis('2026-09-01 10:00:00.123+00')).toBe(ms)
  })

  it('sorts an unreadable created_at first, so the row is KEPT and never stamped', () => {
    const result = classifyChatPhotoRows(
      [
        image({ id: 'good', created_at: '2026-09-01T10:00:00.000Z' }),
        image({ id: 'bad', created_at: 'not a timestamp' }),
      ],
      [],
    )

    expect(toMillis('not a timestamp')).toBe(0)
    expect(rowIdsOf(result.keepers)).toEqual(['bad'])
    expect(idsOf(result.duplicates)).toEqual(['good'])
  })

  it('orders oldest-first, the mirror of listNinaChatPhotos', () => {
    const a = image({ id: 'a', created_at: '2026-09-01T10:00:00.000Z' })
    const b = image({ id: 'b', created_at: '2026-09-02T10:00:00.000Z' })
    expect(compareOldestFirst(a, b)).toBeLessThan(0)
    expect(compareOldestFirst(b, a)).toBeGreaterThan(0)
    expect(compareOldestFirst(a, a)).toBe(0)
  })
})

describe('the snapshot --apply writes before it writes anything else', () => {
  it('is CSV with a header row and every column of the projection', () => {
    const csv = toSnapshotCsv([image({ id: 'i1', message_id: null })])
    const [header, first] = csv.trimEnd().split('\n')

    expect(header).toBe('id,user_id,message_id,kind,pathname,blob_url,is_reference,created_at')
    expect(first?.startsWith('i1,u1,,generated,')).toBe(true)
    expect(first).toContain('false')
    expect(csv.endsWith('\n')).toBe(true)
  })

  it('quotes a cell that carries a comma or a quote, and empties a null', () => {
    expect(csvCell('a,b')).toBe('"a,b"')
    expect(csvCell('say "hi"')).toBe('"say ""hi"""')
    expect(csvCell(null)).toBe('')
    expect(csvCell(false)).toBe('false')
  })

  it('writes an undo that only ever sets is_reference back to false', () => {
    const undo = toUndoSql([image({ id: 'i1' }), image({ id: 'i2' })])

    expect(undo).toContain('set is_reference = false')
    expect(undo).toContain("'i1'")
    expect(undo).toContain("'i2'")
    expect(undo).not.toMatch(/\bdelete\b/i)
  })
})
```

**Impact:** `npm test` gains one suite, ~28 cases, no database and no network. The last block is
the one that would catch the classifier being widened into something that deletes.

### Step 5: The package readme

**File:** `lib/nina/.workflows/package_readme.md` — append at the **very end** of the file (it is
1386 lines; the last block is the `NINA_JOB_REDO_AND_SOFT_DELETE_PLAN.md` section ending in the
`> **The one open operator step:**` blockquote).

**Change:** append the section below, as the new last section of the file.

> **RECONCILED — this phase is the ONLY writer of this file in the set.** Phases 1 and 2 do not
> touch `lib/nina/.workflows/package_readme.md`: neither names it in its Interface Contract, its
> Files table or any step, and both list `lib/nina/.workflows/**` outside their scope. So there is no
> ordering to negotiate and no conditional to evaluate — append at the very end and the file stays
> chronological. (If you find a section from this plan set already there, a phase went outside its
> contract; read it before appending rather than duplicating it.)

**Code:**

```markdown

## The backfill for the Chat photos collection (R2, R3)

`npm run nina:chat-photo-dedupe` — **dry run by default**, `-- --apply` to write. It is the one act
of `CHAT_PHOTO_ORPHANS_AND_UNIQUENESS_PLAN.md` that writes production, and the only thing in that
set that touches rows written before it. It stamps `is_reference = true` on two classes of
pre-existing `nina_message_images` row: **(a)** every one whose `pathname` or `blob_url` is one of
the four names a `nina_avatars` row of the same user holds (`pathname`, `blob_url`,
`thumb_pathname`, `thumb_url` — `isBlobPathnameReferenced`'s six columns, and `blob-reap.mjs`'s,
because "is this the album's object" gets one definition here), and **(b)** every row but the
oldest of each same-`pathname` group per user, ordered `(created_at asc, id asc)` — the mirror of
`listNinaChatPhotos`'s `(created_at desc, id desc)`, so the row it keeps is the one that listing
shows last. The dedupe pass runs over what (a) did not take, so the classes are disjoint and no row
is stamped twice. `kind = 'upload'` is outside the predicate entirely: his photographs were never
in this collection.

**It deletes nothing** — no `DELETE`, no `del()`, no `@vercel/blob` import — which is the plan's
invariant 2 and the user's overriding value in the request: *"don't delete existing photos"*. A
stamped row keeps its id, its bytes, its `created_at` and its bubble; `is_reference` only decides
membership of `/admin/photos`, never whether the photograph renders (invariant 9). `--apply` writes
the pre-change rows and an executable undo into `.snapshots/` (gitignored) before its first
statement, and refuses to run if it cannot.

**Do not run `npm run blob:reap` against `nina/` until this has been applied.** The bytes of every
photograph the old session-delete cascade destroyed are still in the Blob store, unreferenced —
`removeNinaSession` never deleted them, which is the only reason they are recoverable. A reap under
that prefix collects exactly those objects and makes the loss permanent.

The classification is a set of pure functions exported from the script and proved by
`tests/nina.chatPhotoDedupe.test.ts` with no database in the loop — `scripts/nina-profpic.mjs`'s
shape. If the script refuses with *"nina_message_images has no is_reference column"*, phase 1's
`drizzle/0009_*` has not been applied to that database; `npm run db:migrate` first.
```

**Impact:** prose only. `.md` is prettier-ignored (`.prettierignore` line 5, `*.md`), so this edit
cannot fail `format:check`.

## Verification

**The worktree is already fully provisioned** — `.env.local` is present and `node_modules` is
installed, verified at reconciliation time. The *"this worktree has `.env.local` copied in but no
`node_modules`"* line in this plan's first draft was stale and is corrected here. Confirm in one
command anyway, because a genuinely fresh worktree of this repo has neither and then `vitest`,
`tsc`, `eslint`, `prettier` and every `db:*` script die on `lib/env.ts` validating fourteen
variables at load:

```bash
cd /home/miftah/.worktrees/run-insights/chat-photo-orphans-and-uniqueness && \
  ls node_modules/.bin/vitest .env.local >/dev/null 2>&1 || npm install
```

**Format:** `npx prettier --write scripts/nina-chat-photo-dedupe.mjs tests/nina.chatPhotoDedupe.test.ts package.json`
then `npm run format:check`.
Named files, **not** `npm run format`: that command is repo-wide and would reformat files phases 1
and 2 are holding open in this same worktree. `scripts/**` and `tests/**` are not in
`.prettierignore`, so both new files are inside the CI gate; `*.md` is, so the readme edit is not.

**Build:** `npm run typecheck` (it runs `next typegen` first) and `npm run lint`.
`allowJs: true` plus the `@/` alias is what makes the `.ts` → `.mjs` import typecheck; the existing
`tests/nina.profpic.test.ts` is the proof that this combination already works in this repo.

**Tests:** `npx vitest run tests/nina.chatPhotoDedupe.test.ts` for the loop, then `npm test` for
the whole suite. **This phase's suite passes with no database and regardless of whether phase 1's
migration has been applied anywhere** — that is deliberate, and it is what lets this phase be green
on its own.

**Manual check — the dry run.** `npm run nina:chat-photo-dedupe`, and read the output. Two outcomes
are both a pass:

- The database has `0009` applied: the report prints the `read` / `collection candidates` /
  `not candidates` counts, then block **(a)** with one line per album carry-over naming which
  avatar and which column matched, then block **(b)** with one line per duplicate naming the row it
  is keeping, then `collection after this run — N row(s)`, and ends with
  `nothing was written. N change(s) pending. Re-run with --apply.` **Nothing was written** — verify
  by re-running it and getting the identical counts, and by `.snapshots/` still not existing.
- The database does not have `0009` yet: it exits 1 with
  `FAIL  nina_message_images has no is_reference column.` That is the intended refusal, not a bug in
  this phase — phases 1 and 2 own the migration and the operator applies it.

`--apply` is **not** part of this phase's verification. It is an operator step to run once, after
the whole branch has landed and `npm run db:migrate` has applied `0009`, and its own check is:
`.snapshots/` holds the CSV and the `.undo.sql`; `/admin/photos` then lists each photograph once
and no album photograph; a re-run of the dry run reports `0 change(s) pending`; and every
photograph still renders in its bubble and on `/nina/about`.

**Exit criteria:**
1. `npm run format:check`, `npm run lint`, `npm run typecheck` and `npm test` are green.
2. `npm run nina:chat-photo-dedupe` either prints the two classes and writes nothing, or refuses
   with the missing-column message — and in neither case does it create `.snapshots/`.
3. `grep -nEi 'delete|del\(|@vercel/blob' scripts/nina-chat-photo-dedupe.mjs` returns only prose
   from the header comments and the test's own `not.toMatch(/\bdelete\b/i)` — no statement, no
   call, no import. This is invariant 2, checkable in one line.

## Handoffs

- **A unique index on `(user_id, pathname)` where `is_reference = false`.** The Decisions table
  rules it out for this set: DDL that cannot be applied while violating rows exist fails on
  `db:migrate` in production, and hand-writing a pre-clean statement into a generated migration is
  what invariant 3 forbids. Once `--apply` has been run against production, that index becomes
  applicable and would move R3's guarantee from three write paths into the database. **A follow-up
  card, not a phase of this set** — and it needs `npm run db:generate`, which only phase 1 may run
  here.
- **Duplicates that share a `blob_url` under different pathnames.** Classified as *reported, never
  stamped*, because R3 is defined on `pathname` and no writer in the repo can produce that shape.
  If the `!!` block ever prints, there is an unknown writer; find it before widening the
  classification. Not this phase's work either way, since acting on it would stamp rows the scope
  does not name.
- **`kind = 'upload'` rows are never examined.** If his uploads ever need their own dedupe, that is
  a different collection, a different requirement and a different script.
- **The `--apply` run itself.** Left to the operator after the branch lands and `0009` is applied.
  The plan index already carries it in Rollback; the readme section added in Step 5 carries the
  `blob:reap` interlock beside it.
- **R1 and R4 are not this phase's.** No step here changes what a session delete does (Phase 1,
  R1) or re-parents an orphan (Phase 2, R4). If a step of this phase appeared to serve either, it
  would be in the wrong phase.
- **`generatedChatPhotoScope`'s exact final form is phase 2's.** This script restates it in **two**
  places — `isCollectionCandidate` and the `--apply` UPDATE's WHERE — plus two prose paragraphs in
  the script header and one in the readme section. `readImages`' SELECT deliberately carries no
  predicate; see the Interface Contract for why adding one would break the report's arithmetic. If
  phase 2 lands a predicate other than `kind = 'generated' AND is_reference = false`, **all five
  sites follow it.** Flagged in the Interface Contract as this phase's one duplicated fact.

## Rollback

**Before `--apply` has ever been run:** nothing to roll back in the database. Revert the commit —
`git revert <sha>`, or delete `scripts/nina-chat-photo-dedupe.mjs` and
`tests/nina.chatPhotoDedupe.test.ts` and undo the three one-line edits — and the tree is exactly
where phase 2 left it. No migration, no schema change, no runtime code path: nothing in `app/`,
`components/` or `lib/` imports this module, so removing it cannot break a build or a render.

**After `--apply`:** run the `.undo.sql` the run wrote beside its CSV in `.snapshots/` —

```sh
psql "$DATABASE_URL" -f .snapshots/nina-chat-photo-dedupe-<stamp>.undo.sql
```

— which is a single `update nina_message_images set is_reference = false where id in (…)` over
exactly the ids that run stamped. Every one of them carried `is_reference = false` beforehand (the
candidate predicate, enforced in the SELECT, in `isCollectionCandidate` and again in the UPDATE's
own WHERE), so that statement restores the previous listing exactly. The `.csv` beside it is the
record of what those rows were, in the shape
`\copy nina_message_images_snapshot from '…' with (format csv, header true)` reads, for the case
where something other than `is_reference` needs checking.

**Nothing this phase does can lose a photograph**, before or after `--apply`: no row, no message
and no Blob object is ever deleted, so a rollback is one boolean going back to `false` and never a
restore.
