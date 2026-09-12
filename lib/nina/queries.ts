import { and, asc, desc, eq, gte, inArray, isNotNull, isNull, or, sql, type SQL } from 'drizzle-orm'
import type { PgColumn } from 'drizzle-orm/pg-core'

import { db } from '@/lib/db'
import {
  ninaAvatars,
  ninaFolders,
  ninaImagePrefs,
  ninaMessageImages,
  ninaMessages,
  ninaTuning,
  type NinaImagePrefsRow,
  type NinaTuningRow,
} from '@/lib/db/schema'
import { newId } from '@/lib/id'
import {
  NINA_ADMIN_BATCH_MAX,
  NINA_ADMIN_MANIFEST_MAX,
  NINA_ADMIN_PAGE_SIZE,
} from '@/lib/nina/album'
import {
  coerceNinaImagePrefs,
  mergeNinaPhotoRefs,
  NINA_IMAGE_PREFS_DEFAULTS,
  ninaPhotoRefBounds,
  type NinaImagePrefs,
  type NinaImagePrefsWrite,
  type NinaImageReference,
  type NinaPhotoRef,
  type NinaPhotoRefPage,
} from '@/lib/nina/imageprefs'
import { coerceNinaTuning, NINA_TUNING_DEFAULTS, type NinaTuning } from '@/lib/nina/tuning'
import type {
  NinaAvatarBatchInsert,
  NinaAvatarBlobRef,
  NinaAvatarCrop,
  NinaAvatarFolderCount,
  NinaAvatarFolderPage,
  NinaAvatarInsert,
  NinaAvatarManifestEntry,
  NinaAvatarRow,
  NinaFolderRenameResult,
} from './queries/shapes'
import { avatarColumns } from './queries/columns'
import { countNinaChatPhotos, generatedChatPhotoScope } from './queries/images'

/**
 * Every Nina read and write, in one module — `lib/db/queries.ts` for `lib/nina/`.
 *
 * ## The two invariants it inherits
 *
 * **1. userId scoping (roadmap D8, plan invariant 7).** Every exported function takes `userId`
 * as its first parameter and that value is in the `WHERE` of every statement it runs. There is
 * NO exception in this file — `lib/db/queries.ts` has exactly one (`getRunByShareToken`, where a
 * 96-bit token is the credential) and nothing here is credential-addressed. `userId` comes from
 * the session via `requireUserId()`, never from a Server Action argument or a URL segment.
 *
 * A row that exists but is not yours and a row that does not exist are the same outcome. These
 * functions return `null`, `[]` or `false` rather than throwing a `NotFoundError`, because every
 * caller is either Nina's own turn loop (which must degrade, not 500) or an admin screen (which
 * shows "gone" rather than an error page). Nothing here distinguishes absent from forbidden.
 *
 * **2. She never writes her own SQL against `runs` (plan invariant 9).** There is not one
 * reference to `runs`, `records`, `badges` or `insights` below. Nina's view of the training
 * history comes from `lib/db/queries.ts` through `lib/nina/load.ts`, so `reviewed_at IS NOT NULL`
 * keeps gating every aggregate she sees without this file having to remember to.
 *
 * ## Why `db.batch` and never `db.transaction`
 *
 * `db.transaction()` throws on the neon-http driver. `db.batch([...])` is one HTTP request that
 * Postgres runs inside one transaction. Same rule as `lib/db/queries.ts`, same reason.
 *
 * ## Ordering
 *
 * `nina_messages.seq` is a `bigserial`, so `ORDER BY seq` is the emission order of the whole
 * conversation and nothing in this file needs a composite sort or a tiebreak. See that table's
 * header for why a timestamp could not do the job.
 *
 * **No `import 'server-only'`.** `lib/db/queries.ts` does not have it either, deliberately:
 * adding it would make this module unimportable from Vitest and from `scripts/*.mjs`, and phase
 * 14's operator script is a `scripts/*.mjs`.
 */

/* ============================================================================
 * The barrel — the public surface, assembled from ./queries/
 *
 * Each domain module under `lib/nina/queries/` is re-exported here with `export *`, one
 * line per module, added by the phase that creates it. `export *` rather than an explicit
 * list, because verbatimModuleSyntax would force `export type` on every interface and no
 * two modules declare the same name. The header above is still the layer's contract and
 * governs every module listed.
 *
 * The four column lists of `./queries/columns` are imported at the top of this file, never
 * re-exported: they were private before the split and stay internal — shared between
 * sibling query modules only.
 * ==========================================================================*/

export * from './queries/shapes'
export * from './queries/sessions'
export * from './queries/messages'
export * from './queries/images'
export * from './queries/memory'
export * from './queries/shortcuts'
export * from './queries/nags'
export * from './queries/turns'

/* ============================================================================
 * §9 Avatars — her album (RU-7, R19, R23, R25)
 * ==========================================================================*/

/** Her face right now. Reads the partial unique index, so it is a single-row index lookup. */
export async function getCurrentNinaAvatar(userId: string): Promise<NinaAvatarRow | null> {
  const rows = await db
    .select(avatarColumns)
    .from(ninaAvatars)
    .where(and(eq(ninaAvatars.userId, userId), eq(ninaAvatars.isCurrent, true)))
    .limit(1)
  return rows[0] ?? null
}

/** The album, newest first. Phase 13's grid and phase 15's admin list. */
export async function listNinaAvatars(userId: string): Promise<NinaAvatarRow[]> {
  return db
    .select(avatarColumns)
    .from(ninaAvatars)
    .where(eq(ninaAvatars.userId, userId))
    .orderBy(desc(ninaAvatars.createdAt), desc(ninaAvatars.id))
}

/**
 * RU-17's whole mechanism: the current avatar she has NOT mentioned yet. Phase 13 (promise path)
 * and phase 10 (operator path) both poll this, make her comment on it in character, and then call
 * `markNinaAvatarAnnounced`. Two readers, one query, and no flag anyone has to remember to set.
 */
export async function getUnannouncedCurrentNinaAvatar(
  userId: string,
): Promise<NinaAvatarRow | null> {
  const rows = await db
    .select(avatarColumns)
    .from(ninaAvatars)
    .where(
      and(
        eq(ninaAvatars.userId, userId),
        eq(ninaAvatars.isCurrent, true),
        isNull(ninaAvatars.announcedAt),
      ),
    )
    .limit(1)
  return rows[0] ?? null
}

/**
 * **The order of these two statements is load-bearing.** `nina_avatars_user_current_unq` is a
 * partial unique index on `(user_id) where is_current`, so inserting a second current row before
 * un-currenting the first violates it mid-transaction. Un-current, then insert — the same order
 * phase 14's operator script uses, for the same reason, and one `db.batch` so the album is never
 * momentarily faceless.
 *
 * `announced_at` is left NULL: she has not said anything about this face yet, and
 * `getUnannouncedCurrentNinaAvatar` is what notices. The crop triple is left NULL too — no
 * transform, render it centred — because whoever generated or uploaded the image has not framed
 * it yet and phase 15 is where framing happens.
 */
export async function insertNinaAvatarAsCurrent(
  userId: string,
  input: NinaAvatarInsert,
): Promise<NinaAvatarRow> {
  const [, inserted] = await db.batch([
    db
      .update(ninaAvatars)
      .set({ isCurrent: false })
      .where(and(eq(ninaAvatars.userId, userId), eq(ninaAvatars.isCurrent, true))),

    db
      .insert(ninaAvatars)
      .values({
        id: newId(),
        userId,
        blobUrl: input.blobUrl,
        pathname: input.pathname,
        width: input.width ?? null,
        height: input.height ?? null,
        bytes: input.bytes ?? null,
        source: input.source,
        description: input.description ?? null,
        isCurrent: true,
      })
      .returning(avatarColumns),
  ])

  const row = inserted[0]
  if (row == null) {
    // Unreachable: an INSERT … RETURNING that ran without throwing produced a row. Thrown rather
    // than `!`-asserted so that if the driver ever changes shape, the failure names itself.
    throw new Error('insertNinaAvatarAsCurrent: INSERT returned no row')
  }
  return row
}

/** She has now said something about this face. Idempotent — a second call is a no-op. */
export async function markNinaAvatarAnnounced(
  userId: string,
  id: string,
  now: Date = new Date(),
): Promise<boolean> {
  const updated = await db
    .update(ninaAvatars)
    .set({ announcedAt: now })
    .where(
      and(eq(ninaAvatars.userId, userId), eq(ninaAvatars.id, id), isNull(ninaAvatars.announcedAt)),
    )
    .returning({ id: ninaAvatars.id })
  return updated.length > 0
}

/**
 * R23. `/admin/nina` (phase 15) saves the circular-frame transform it just let the user drag.
 * Passing `{ scale: null, x: null, y: null }` clears it back to plain centred `object-cover`,
 * which is the "reset" button — so this one function is both save and reset and there is no
 * second code path for the second one.
 *
 * No range validation here. The bounds ("scale ≥ 1, offsets inside the frame") are a property of
 * the framing UI and belong to a Zod schema phase 15 owns, next to the widget that produces the
 * numbers — the same division `lib/profile/schema.ts` keeps against `profiles`.
 */
export async function updateNinaAvatarCrop(
  userId: string,
  id: string,
  crop: NinaAvatarCrop,
): Promise<boolean> {
  const updated = await db
    .update(ninaAvatars)
    .set({ cropScale: crop.scale, cropX: crop.x, cropY: crop.y })
    .where(and(eq(ninaAvatars.userId, userId), eq(ninaAvatars.id, id)))
    .returning({ id: ninaAvatars.id })
  return updated.length > 0
}

/**
 * R25. What the picture DEPICTS, so "itu lagi dimana?" has an answer. Three writers, three
 * origins: phase 12 writes from its own generation prompt, phase 14 and phase 15 write what
 * phase 6's `glm-4.6v` describe pre-pass came back with. Separate from
 * `insertNinaAvatarAsCurrent` because two of those three only learn the description after the
 * row exists — a describe call is a second network round trip, and holding the album faceless
 * while it runs would be the wrong trade.
 */
export async function setNinaAvatarDescription(
  userId: string,
  id: string,
  description: string | null,
): Promise<boolean> {
  const updated = await db
    .update(ninaAvatars)
    .set({ description })
    .where(and(eq(ninaAvatars.userId, userId), eq(ninaAvatars.id, id)))
    .returning({ id: ninaAvatars.id })
  return updated.length > 0
}

/**
 * One album row by id, ownership-scoped. Phase 15's `/admin/nina` uses it to validate an id
 * arriving from a form before it changes anything, and to read `width`/`height` back for the crop
 * clamp. Returns `null` for "not yours" and for "does not exist" alike — the caller has no
 * legitimate use for the difference.
 */
export async function getNinaAvatar(userId: string, id: string): Promise<NinaAvatarRow | null> {
  const rows = await db
    .select(avatarColumns)
    .from(ninaAvatars)
    .where(and(eq(ninaAvatars.userId, userId), eq(ninaAvatars.id, id)))
    .limit(1)
  return rows[0] ?? null
}

/**
 * One album row by its dedupe key, ownership-scoped. `setChatPhotoAsAvatarAction`'s re-adoption
 * lookup: the row that `chat-photo:<imageId>` already produced, so a second "set as her profile
 * picture" re-currents the FIRST copy instead of storing the bytes twice. `sourceKey` is unique
 * per `(user_id, source_key)` when non-null (`nina_avatars_user_source_key_unq`), so this answers
 * with at most one row; `null` means "never adopted" and is the copy path's green light.
 */
export async function getNinaAvatarBySourceKey(
  userId: string,
  sourceKey: string,
): Promise<NinaAvatarRow | null> {
  const rows = await db
    .select(avatarColumns)
    .from(ninaAvatars)
    .where(and(eq(ninaAvatars.userId, userId), eq(ninaAvatars.sourceKey, sourceKey)))
    .limit(1)
  return rows[0] ?? null
}

/**
 * Make an existing album photo the current one. R23's "admin can also set which photo will be set
 * as her profpic".
 *
 * ── THE PRE-CHECK IS WHAT MAKES ZERO CURRENT AVATARS UNREACHABLE ─────────────────────────────
 * The statement order is forced by `nina_avatars_user_current_unq` (partial unique on `(user_id)
 * where is_current`): un-current first, then set the new one, exactly as
 * `insertNinaAvatarAsCurrent` does. But an UPDATE that matches no row does not fail — so if the id
 * were bogus, the batch would un-current the album and set nothing, leaving her with NO current
 * avatar and the page with nothing to show. Reading the row first and refusing turns that into a
 * `false` return. (One user, one writer, so the window between the read and the batch is
 * theoretical; the alternative is a `WHERE EXISTS` that this driver expresses far less legibly.)
 *
 * ── `announced_at` IS RE-ARMED ON PURPOSE ────────────────────────────────────────────────────
 * RU-17: a hand-changed avatar makes her speak. What the user perceives is "her face changed", and
 * the cause is irrelevant to that, so promoting an old album photo re-arms the announcement the
 * same way a fresh upload does. Phase 10 owns the trigger (`is_current AND announced_at IS NULL`);
 * this function writes no message and composes no line.
 */
export async function setCurrentNinaAvatar(userId: string, id: string): Promise<boolean> {
  const existing = await getNinaAvatar(userId, id)
  if (existing == null) return false
  if (existing.isCurrent) return true // idempotent: no un-currenting, no re-announcement

  await db.batch([
    db
      .update(ninaAvatars)
      .set({ isCurrent: false })
      .where(and(eq(ninaAvatars.userId, userId), eq(ninaAvatars.isCurrent, true))),

    db
      .update(ninaAvatars)
      .set({ isCurrent: true, announcedAt: null })
      .where(and(eq(ninaAvatars.userId, userId), eq(ninaAvatars.id, id))),
  ])
  return true
}

/**
 * Remove a photo from the album, and hand its blob back so the caller can delete the object.
 *
 * ── THE CURRENT PHOTO CANNOT BE DELETED, AND THAT IS THE WHOLE GUARD ────────────────────────
 * `eq(ninaAvatars.isCurrent, false)` in the WHERE clause is what makes "zero current avatars"
 * unreachable rather than repaired. Promotion-on-delete was rejected: "delete her face and
 * something else silently becomes it" is worse than a refusal that names the fix, and picking the
 * successor is precisely the choice `/admin/nina` exists to give the operator.
 *
 * `null` means "not yours, already gone, or current" — the caller turns that into one message,
 * because a page that distinguishes them is a page that tells a stranger which ids exist.
 *
 * ── TWO OBJECTS, NOT ONE (F34 R1) ───────────────────────────────────────────────────────────
 * A row can carry a derived thumbnail (`nina_avatars.thumb_url`), so this returns both refs. The
 * row is the only record that the thumbnail exists — its stored pathname carries Blob's random
 * suffix and is not derivable — so a delete that returns one ref leaks an object that nothing can
 * find again except a full store listing. Both thumbnail fields are NULL for every pre-F34 row,
 * and a caller must read NULL as "nothing to delete" rather than as a failure.
 */
export async function deleteNinaAvatar(
  userId: string,
  id: string,
): Promise<NinaAvatarBlobRef | null> {
  const removed = await db
    .delete(ninaAvatars)
    .where(
      and(eq(ninaAvatars.userId, userId), eq(ninaAvatars.id, id), eq(ninaAvatars.isCurrent, false)),
    )
    .returning({
      id: ninaAvatars.id,
      blobUrl: ninaAvatars.blobUrl,
      pathname: ninaAvatars.pathname,
      thumbUrl: ninaAvatars.thumbUrl,
      thumbPathname: ninaAvatars.thumbPathname,
    })
  return removed[0] ?? null
}

/* ---------------------------------------------------------------------------
 * §9b The album as a file manager — F34 R1
 *
 * Twelve statements: a folder-scoped page, a subtree manifest, a distinct-folder listing (which
 * unions `nina_folders` in), an album count, a plain batch insert, the bulk-move / rename /
 * recursive-delete / bulk-delete set phase 6 drives, and the three `nina_folders` declaration
 * statements. Every one of them is `userId`-scoped in its WHERE, per this module's rule 1.
 * -------------------------------------------------------------------------*/

/**
 * "This folder and everything under it", as one predicate.
 *
 * ── `left()` AND NOT `LIKE`, DELIBERATELY ───────────────────────────────────────────────────
 * The obvious spelling is `folder LIKE $1 || '/%'`, and it is the wrong tool for a statement that
 * rewrites or deletes rows: `%` and `_` are LIKE metacharacters, so a folder literally named
 * `100%` or `my_pics` would match siblings it has no business matching, and a recursive DELETE
 * would take them. `left(folder, n) = prefix` is an exact string comparison with no escaping to
 * get right, which lets `lib/admin/filetree.ts`'s grammar be a bound on SHAPE rather than the only
 * thing standing between a folder name and a wider delete than the user asked for. Defence in
 * depth is the point: either one alone would be a bug waiting for the other to be edited.
 *
 * ── THE ALBUM ROOT IS A SPECIAL CASE, NOT A ZERO-LENGTH PREFIX ──────────────────────────────
 * The root is `''`, so `'' || '/'` is `'/'`, which no canonical path starts with — the general
 * spelling would match NOTHING where it must match EVERYTHING. Hence the early return. The
 * `folder = prefix` disjunct is the folder's own rows; the `left()` disjunct is its descendants.
 *
 * ── THE COLUMN IS AN ARGUMENT, BECAUSE THERE ARE TWO FOLDER COLUMNS ─────────────────────────
 * `nina_avatars.folder` and `nina_folders.folder` both need this predicate and it must be the SAME
 * predicate for both: a rename that rewrote the photograph rows with `left()` and the declaration
 * rows with `LIKE` would be two subtly different definitions of "under this folder", and the pair
 * would drift on exactly the folder name (`100%`) that motivated `left()` in the first place. One
 * function, pointed at whichever column the statement is touching.
 *
 * Not exported: six callers in this file, and a predicate over a folder column is not a thing a
 * caller outside the data layer has any use for.
 */
function folderSubtree(column: PgColumn, folder: string): SQL {
  if (folder === '') return sql`true`
  const prefix = `${folder}/`
  const own = eq(column, folder)
  const under = sql`left(${column}, ${prefix.length}::int) = ${prefix}`
  return sql`(${own} OR ${under})`
}

/**
 * One page of one folder, newest first, plus the folder's row count — the explorer's content pane
 * (F34 R1).
 *
 * Reads `nina_avatars_user_folder_created_idx` as a range scan: equality on `user_id`, equality on
 * `folder`, and `(created_at desc, id desc)` already in index order, so nothing sorts. It is NOT
 * a filter over `listNinaAvatars` and it must not become one — the requirement is *"hundreds of
 * profile pics"*, and the whole point of this function existing beside that one is that no read on
 * this screen is unbounded.
 *
 * ── DIRECT CHILDREN ONLY ────────────────────────────────────────────────────────────────────
 * `folder = $2`, not the subtree. A file manager's content pane shows what is IN the folder you
 * opened; descendants are reached by opening them. `listNinaAvatarFolders` is what tells the tree
 * pane there is something to open.
 *
 * ── OFFSET, AND THE ARGUMENT IS ON `NinaAvatarFolderPage` ───────────────────────────────────
 * See that interface: the pager this feeds needs a total and a backward step, `OFFSET` at hundreds
 * of rows is an index range scan, and the drift a cursor would have avoided is named there and is
 * bounded to "a tile can repeat across two pages during an upload".
 *
 * ── TWO STATEMENTS, RUN CONCURRENTLY ────────────────────────────────────────────────────────
 * A `count(*) OVER ()` window would have made this one round trip, and it would report `total: 0`
 * for an over-shot `?page=` — indistinguishable from an empty folder, which is the one case phase
 * 5's pager has to tell apart ("nothing on this page, go to the first" vs "nothing in this folder
 * yet, drop a folder"). So the count is its own `SELECT`, issued in the same `Promise.all`. Both
 * statements read the same index; at the scale the requirement states this is cheaper than the
 * branch it removes.
 *
 * `NINA_ADMIN_PAGE_SIZE` is both the default and the CEILING for `limit`. A caller may ask for
 * fewer and cannot ask for more, so a hand-edited `?limit=` cannot turn one page into the
 * unpaginated read this function exists to avoid. `offset` is floored at 0 for the same reason:
 * a negative offset is a Postgres error, not a query.
 */
export async function listNinaAvatarsInFolder(
  userId: string,
  folder: string,
  opts: { limit?: number; offset?: number } = {},
): Promise<NinaAvatarFolderPage> {
  const limit = Math.max(1, Math.min(opts.limit ?? NINA_ADMIN_PAGE_SIZE, NINA_ADMIN_PAGE_SIZE))
  const offset = Math.max(0, Math.trunc(opts.offset ?? 0))
  const scope = and(eq(ninaAvatars.userId, userId), eq(ninaAvatars.folder, folder))

  const [rows, counted] = await Promise.all([
    db
      .select(avatarColumns)
      .from(ninaAvatars)
      .where(scope)
      .orderBy(desc(ninaAvatars.createdAt), desc(ninaAvatars.id))
      .limit(limit)
      .offset(offset),
    db
      .select({ total: sql<number>`count(*)`.mapWith(Number) })
      .from(ninaAvatars)
      .where(scope),
  ])

  return { rows, total: counted[0]?.total ?? 0 }
}

/**
 * Every dedupe key already stored under a folder and its descendants — the manifest side of F34
 * R1's *"it automatically upload only the new folders and files as optimization."*
 *
 * The browser walks a dropped folder, computes the same key per file that
 * `lib/admin/filetree.ts` computed at upload time, and `planFolderUpload` subtracts this set.
 * Which is why the SUBTREE and not one folder: the user drags `Nina/` and the diff has to know
 * about `Nina/2026/09/beach.jpg`.
 *
 * ── WHAT IT DOES NOT RETURN ─────────────────────────────────────────────────────────────────
 * Rows with a NULL `source_key` are excluded rather than returned with a null field. A row that
 * predates the file manager has no key, so it can never match a walked file, so including it would
 * be shipping bytes the diff must then filter out. The consequence is honest and worth stating: a
 * photo uploaded before F34 is invisible to the diff, and re-dropping the folder it came from
 * uploads it again as a second row. There is no key to match it on, and inventing one from
 * `blob_url` would be guessing at a `lastModified` nobody recorded.
 *
 * ── THE CAP IS ALLOWED TO TRUNCATE BECAUSE THE UNIQUE INDEX IS THE BACKSTOP ─────────────────
 * `NINA_ADMIN_MANIFEST_MAX` bounds the response at ~240 KB. A truncated manifest makes the diff
 * OVER-report: a file that is already stored looks new, is uploaded, and its insert is discarded
 * by `ON CONFLICT (user_id, source_key) DO NOTHING`. Slower, never wrong — and only because the
 * dedupe key is a constraint. Without `nina_avatars_user_source_key_unq` this would have to be a
 * paging protocol instead of a number.
 *
 * Ordered `(folder, id)` so the response is stable across two calls, which is what makes "the
 * manifest changed" mean something to a client that caches one.
 */
export async function listNinaAvatarManifest(
  userId: string,
  folder: string,
  limit: number = NINA_ADMIN_MANIFEST_MAX,
): Promise<NinaAvatarManifestEntry[]> {
  const rows = await db
    .select({
      id: ninaAvatars.id,
      folder: ninaAvatars.folder,
      sourceKey: ninaAvatars.sourceKey,
    })
    .from(ninaAvatars)
    .where(
      and(
        eq(ninaAvatars.userId, userId),
        isNotNull(ninaAvatars.sourceKey),
        folderSubtree(ninaAvatars.folder, folder),
      ),
    )
    .orderBy(asc(ninaAvatars.folder), asc(ninaAvatars.id))
    .limit(Math.max(1, Math.min(limit, NINA_ADMIN_MANIFEST_MAX)))

  // `isNotNull` narrows the ROWS but not the TYPE, and a `!` here would be asserting that the
  // WHERE clause and this line agree forever. `flatMap` makes the narrowing the compiler's.
  return rows.flatMap((row) =>
    row.sourceKey == null ? [] : [{ id: row.id, folder: row.folder, sourceKey: row.sourceKey }],
  )
}

/**
 * Every folder that exists, with how many photos are DIRECTLY in each — the tree pane's whole
 * read (F34 R1).
 *
 * ── A FOLDER EXISTS IF A PHOTO IS IN IT **OR** IF IT IS DECLARED ────────────────────────────
 * Two sources, unioned, neither authoritative:
 *
 *   · `nina_avatars.folder` — a folder exists because a photograph is filed in it. This is what
 *     makes a folder arrive by dropping one, and it is the only source that existed before the
 *     `nina_folders` table.
 *   · `nina_folders` — a folder exists because the operator made it. This is the only source that
 *     can represent an EMPTY folder, which is why the table exists at all (see its header).
 *
 * A UNION rather than a join in either direction, and that is the whole design: **both directions
 * of disagreement degrade instead of corrupting.** A populated folder whose declaration was never
 * written still appears, carried by its photographs. A declaration left behind after its
 * photographs are gone appears as an empty folder — which is a legal state now, not a ghost. There
 * is no repair path to write and no reconciliation job to run, because there is no state in which
 * one source is *wrong*: each one only ever adds a folder to the listing.
 *
 * **Do not "optimise" this into a read of `nina_folders` alone.** It would hide every folder
 * created by dropping one, which is the ordinary way folders arrive here.
 *
 * ── WHY TWO STATEMENTS AND A MERGE, NOT ONE `UNION ALL` OVER A DERIVED TABLE ─────────────────
 * The SQL union wants `sum(photos) group by folder` over a derived table to collapse the folder
 * that is BOTH declared and populated into one row, and that is a raw-`sql` fragment returning
 * untyped rows in a file whose every other read is a typed builder call. `db.batch` sends both in
 * one round trip — the same primitive `insertNinaAvatarAsCurrent` already uses — and the merge is
 * six lines of `Map` that a unit test can reason about. One round trip either way.
 *
 * ── THE ORDER IS CODEPOINT, AND IT IS DELIBERATELY NOT THE DATABASE'S ───────────────────────
 * Sorted here rather than by `ORDER BY` because the merge has to happen in JS anyway, and a JS
 * codepoint sort is the ordering this actually needs: a parent is a strict PREFIX of its children,
 * and a shorter string sorts before any string it prefixes, so **parents always precede their own
 * children** regardless of what else is in the list. A Postgres `ORDER BY` under a non-C collation
 * makes no such promise — `ICU` can order `a/b` before `a` depending on how it weights `/`. That
 * ordering is a convenience for `buildTree`, which materialises missing ancestors anyway
 * (invariant 6: it is unit-tested in `environment: 'node'`, and this sort is why its input is
 * deterministic).
 *
 * ── THE COUNTS ARE DIRECT, NOT RECURSIVE, AND A ZERO IS NORMAL ──────────────────────────────
 * A recursive roll-up here would be a second opinion about a tree the pure module already builds,
 * provable only against a database. `buildTree` sums its children to place them; it sums them to
 * label them too. **`photos: 0` is an ordinary result** — it is exactly what a declared empty
 * folder looks like — so nothing downstream may filter a zero out.
 *
 * Unbounded on purpose, and it is the one album read in this file that is. The result is one row
 * per DISTINCT folder — bounded by how many directories a human made, not by how many photos are
 * in them — and a tree pane that renders 40 of 200 folders is a broken tree, where a content pane
 * that renders 120 of 300 photos is a page.
 */
export async function listNinaAvatarFolders(userId: string): Promise<NinaAvatarFolderCount[]> {
  const [populated, declared] = await db.batch([
    db
      .select({
        folder: ninaAvatars.folder,
        photos: sql<number>`count(*)`.mapWith(Number),
      })
      .from(ninaAvatars)
      .where(eq(ninaAvatars.userId, userId))
      .groupBy(ninaAvatars.folder),

    db
      .select({ folder: ninaFolders.folder })
      .from(ninaFolders)
      .where(eq(ninaFolders.userId, userId)),
  ])

  /*
   * Declared first, populated second, so a folder that is both ends up with its real count rather
   * than the zero. The order of these two loops is the only thing that makes that true — swapping
   * them would zero out every declared folder that also holds photographs.
   */
  const counts = new Map<string, number>()
  for (const row of declared) counts.set(row.folder, 0)
  for (const row of populated) counts.set(row.folder, row.photos)

  return [...counts]
    .map(([folder, photos]) => ({ folder, photos }))
    .sort((a, b) => (a.folder < b.folder ? -1 : a.folder > b.folder ? 1 : 0))
}

/**
 * N photos into a folder, in one statement, **without touching `is_current`** — F34 R1's writer.
 *
 * ── WHY THIS EXISTS BESIDE `insertNinaAvatarAsCurrent` AND IS NOT A FLAG ON IT ──────────────
 * That function is correct and is the ONLY insert this module exposed before F34, and its whole
 * body is the un-current-then-insert `db.batch` that `nina_avatars_user_current_unq` forces. Which
 * makes it exactly wrong here: three hundred calls would rewrite the current row three hundred
 * times, re-arm `announced_at` three hundred times, and make her comment on a face nobody chose.
 * A dropped folder changes nothing about which photo is her face. So this insert writes
 * `is_current: false` for every row, never reads the current row, and never runs a second
 * statement — and `setCurrentNinaAvatar` stays the one and only way the crown moves, which is what
 * keeps the partial unique index's ordering rule confined to two functions instead of three.
 *
 * ── IDEMPOTENT ON THE DEDUPE KEY, WHICH IS THE POINT OF THE UNIQUE INDEX ────────────────────
 * `ON CONFLICT (user_id, source_key) DO NOTHING`. A retried Server Action, a double-clicked drop
 * and two tabs all resolve to "0 new rows" rather than to a duplicated album, and `.returning()`
 * omits the conflicting rows — so **`result.length` is how many were actually new**, which is the
 * number the caller reports to the user. A row whose `source_key` were NULL would never conflict,
 * which is precisely why `NinaAvatarBatchInsert.sourceKey` is required rather than optional.
 *
 * ── THE CAP THROWS, WHICH IS A DEPARTURE FROM THIS MODULE'S CONVENTION ──────────────────────
 * Rule 1's "return `null`, `[]` or `false` rather than throwing" is about OWNERSHIP and ABSENCE —
 * a caller's normal outcomes. A batch over `NINA_ADMIN_BATCH_MAX` is neither: it is a caller that
 * did not chunk, and the only honest report for that is loud. `lib/admin/schema.ts` (phase 4)
 * bounds it in Zod at the boundary where a browser's claim is checked, so this throw should be
 * unreachable — the same posture as `assertPathSegment` in `lib/nina/images.ts`: the cheap loud
 * defence at the one place that would otherwise do the damage.
 *
 * An empty batch returns `[]` WITHOUT running a statement, because `INSERT … VALUES` with no rows
 * is a syntax error and not an empty write.
 */
export async function insertNinaAvatars(
  userId: string,
  inputs: readonly NinaAvatarBatchInsert[],
): Promise<NinaAvatarRow[]> {
  if (inputs.length === 0) return []
  if (inputs.length > NINA_ADMIN_BATCH_MAX) {
    throw new Error(
      `insertNinaAvatars: ${inputs.length} rows exceeds NINA_ADMIN_BATCH_MAX (${NINA_ADMIN_BATCH_MAX})`,
    )
  }

  return db
    .insert(ninaAvatars)
    .values(
      inputs.map((input) => ({
        id: newId(),
        userId,
        blobUrl: input.blobUrl,
        pathname: input.pathname,
        folder: input.folder,
        filename: input.filename,
        sourceKey: input.sourceKey,
        thumbUrl: input.thumbUrl ?? null,
        thumbPathname: input.thumbPathname ?? null,
        width: input.width ?? null,
        height: input.height ?? null,
        bytes: input.bytes ?? null,
        source: input.source,
        description: input.description ?? null,
        isCurrent: false,
      })),
    )
    .onConflictDoNothing({ target: [ninaAvatars.userId, ninaAvatars.sourceKey] })
    .returning(avatarColumns)
}

/**
 * Move a SET of photos to another folder — an `UPDATE` of one column, and **no blob is copied**.
 *
 * That is the payoff of the header's "folder structure is metadata, not blob layout" decision,
 * stated at the site where the alternative would have been felt: under a folder-shaped blob
 * layout this would be a `put` of the original, a `put` of the thumbnail, two `del`s, and a row
 * update — four network calls per photo, none of them transactional with the row.
 *
 * Plural rather than singular, and it is not a convenience: phase 6's move acts on a selection,
 * and a loop over a singular statement is one HTTP round trip per photo inside one Server Action.
 * One id is a one-element array; `[]` returns `0` without running a statement, because
 * `inArray(col, [])` compiles to `false` in some drizzle versions and to a syntax error in others,
 * and neither is worth depending on.
 *
 * The destination is NOT validated here. Its grammar is `lib/admin/filetree.ts`'s
 * `validateFolderPath` and it is checked in phase 4's `folderPathSchema`, next to the widget that
 * produced it — the same division `updateNinaAvatarCrop` above states for the crop bounds, and for
 * the same reason: a bound is a property of the UI that produces the value, and duplicating it
 * here would put two opinions about a folder name in two files.
 *
 * Returns how many rows actually moved. Fewer than `ids.length` means "some of those are not
 * yours or are already gone", per this module's rule 1.
 */
export async function moveNinaAvatarsToFolder(
  userId: string,
  ids: readonly string[],
  folder: string,
): Promise<number> {
  if (ids.length === 0) return 0
  const updated = await db
    .update(ninaAvatars)
    .set({ folder })
    .where(and(eq(ninaAvatars.userId, userId), inArray(ninaAvatars.id, [...ids])))
    .returning({ id: ninaAvatars.id })
  return updated.length
}

/**
 * Rename or move a folder AND everything under it — one `UPDATE`, again with no blob copied.
 *
 * ── THE REWRITE ────────────────────────────────────────────────────────────────────────────
 * `SET folder = $to || substr(folder, length($from) + 1)`. For the folder's own rows,
 * `substr(from, len+1)` is `''`, so they become `$to`. For a descendant `from/a/b`, it is `/a/b`,
 * so it becomes `to/a/b`. One statement, whatever the depth, and the tree's shape below the moved
 * node is preserved rather than recomputed. `renameFolder` and `moveFolder` are the same
 * statement: renaming is moving to a sibling path, and giving them separate implementations would
 * be two chances to get the prefix arithmetic wrong.
 *
 * ── THE TWO REFUSALS ───────────────────────────────────────────────────────────────────────
 *   - **The album root, at either end.** It cannot be renamed, because it has no name — it is the
 *     absence of a path. It cannot be a destination either, and that one is arithmetic rather than
 *     philosophy: `'' || '/a/b'` is `/a/b`, a leading slash, which is not a canonical
 *     `nina_avatars.folder` value. A "flatten everything onto the root" operation would need its
 *     own statement, and nothing in the plan asks for one.
 *   - **A folder into itself.** `to.startsWith(from + '/')` is a destination inside the subtree
 *     being rewritten, which would produce paths nested inside their own former selves and a tree
 *     the builder cannot draw. `to === from` is not that: it is a no-op, and it succeeds with
 *     `moved: 0` rather than being refused, because an idempotent rename is a correct rename.
 *
 * Both refusals are also decided, with better messages, by phase 6's `planRelocation` before this
 * is called. They are kept here anyway — the `setCurrentNinaAvatar` posture: a guard that could
 * argue it is redundant is cheap, and this one is the difference between a bad argument and a
 * corrupted tree.
 *
 * `moved: 0` is also a legitimate outcome for a real rename, two ways: a folder can hold nothing
 * but subfolders that hold nothing, or it can be a `nina_folders` declaration with no photographs
 * in it at all. Either way the rename still has to happen, and its `nina_folders` half
 * (`renameNinaFolderSubtree`) is a separate statement phase 6 runs after this one. Phase 6 must
 * not read `0` as failure.
 */
export async function renameNinaAvatarFolder(
  userId: string,
  from: string,
  to: string,
): Promise<NinaFolderRenameResult> {
  if (from === '' || to === '') return { ok: false, reason: 'root' }
  if (to === from) return { ok: true, moved: 0 }
  if (to.startsWith(`${from}/`)) return { ok: false, reason: 'cycle' }

  const updated = await db
    .update(ninaAvatars)
    .set({
      folder: sql`${to}::text || substr(${ninaAvatars.folder}, ${from.length + 1}::int)`,
    })
    .where(and(eq(ninaAvatars.userId, userId), folderSubtree(ninaAvatars.folder, from)))
    .returning({ id: ninaAvatars.id })

  return { ok: true, moved: updated.length }
}

/**
 * Delete a folder and everything under it, handing back every blob ref so the caller can remove
 * the objects.
 *
 * ── THE CURRENT PHOTO IS SKIPPED HERE AND REFUSED ONE LAYER UP ──────────────────────────────
 * `eq(ninaAvatars.isCurrent, false)` is in the WHERE, exactly as it is in `deleteNinaAvatar`
 * above, so "zero current avatars" is unreachable from this statement no matter what a caller
 * does. What this statement deliberately does NOT do is decide whether the operation should have
 * happened at all: a subtree delete that silently leaves her photo behind reads as a delete that
 * half-worked, and the operator's next move is to try again and watch it half-work identically.
 *
 * That decision is phase 6's `deleteNinaAlbumFolderAction`, and it has to be, because phase 6
 * offers two answers to it: refuse the whole operation naming the photo (the default), or delete
 * everything else and say which photo stayed (`keepCurrent`). A statement that refused the subtree
 * — which is what this function's draft did — can express the first and not the second. So the
 * action reads `getCurrentNinaAvatar` itself, decides, and then calls this.
 *
 * (Promotion-on-delete stays rejected for the reason `deleteNinaAvatar` gives: picking the
 * successor is the choice `/admin/nina` exists to offer.)
 *
 * ── ROWS FIRST, BLOBS BEST-EFFORT ──────────────────────────────────────────────────────────
 * This function deletes rows only and returns refs; the caller `del()`s. That order is
 * `deleteNinaAvatarAction`'s argument and it holds at any batch size: an orphaned blob is
 * recoverable (a store listing finds it, and ruling D4's card is about teaching `blob-reap` to),
 * while a row pointing at an object that is already gone is a broken image on a screen with no
 * way to fix itself. A caller must expect BOTH refs per row and must tolerate a NULL thumbnail.
 */
export async function deleteNinaAvatarsInFolderTree(
  userId: string,
  folder: string,
): Promise<NinaAvatarBlobRef[]> {
  return db
    .delete(ninaAvatars)
    .where(
      and(
        eq(ninaAvatars.userId, userId),
        eq(ninaAvatars.isCurrent, false),
        folderSubtree(ninaAvatars.folder, folder),
      ),
    )
    .returning({
      id: ninaAvatars.id,
      blobUrl: ninaAvatars.blobUrl,
      pathname: ninaAvatars.pathname,
      thumbUrl: ninaAvatars.thumbUrl,
      thumbPathname: ninaAvatars.thumbPathname,
    })
}

/**
 * Delete a SET of photos by id, handing back their blob refs. The bulk form of `deleteNinaAvatar`,
 * and the same guard: `is_current = false` is in the WHERE, so her current photo survives a
 * selection that includes it and comes back absent from the result rather than deleted.
 *
 * One statement rather than a loop, for `moveNinaAvatarsToFolder`'s reason: 200 selected photos
 * would be 200 neon-http round trips inside one Server Action, which is both slow enough to reach
 * the function's duration limit and 200 chances to fail halfway with no record of where.
 *
 * `removed.length < ids.length` is normal and means some of those ids are not the caller's, are
 * already gone, or are her current photo. Deciding which of those to tell the operator about is
 * phase 6's; this reports facts.
 */
export async function deleteNinaAvatars(
  userId: string,
  ids: readonly string[],
): Promise<NinaAvatarBlobRef[]> {
  if (ids.length === 0) return []
  return db
    .delete(ninaAvatars)
    .where(
      and(
        eq(ninaAvatars.userId, userId),
        eq(ninaAvatars.isCurrent, false),
        inArray(ninaAvatars.id, [...ids]),
      ),
    )
    .returning({
      id: ninaAvatars.id,
      blobUrl: ninaAvatars.blobUrl,
      pathname: ninaAvatars.pathname,
      thumbUrl: ninaAvatars.thumbUrl,
      thumbPathname: ninaAvatars.thumbPathname,
    })
}

/**
 * How many photos the album holds, as a number rather than as a list of rows.
 *
 * ── WHY THIS EXISTS: `app/admin/page.tsx` WAS READING THE WHOLE ALBUM TO PRINT ITS SIZE ─────
 * The `/admin` hub does `listNinaAvatars(userId)` and then uses nothing but `album.length`. That
 * was a handful of rows when F33 landed it. After F34 it is *"hundreds of profile pics"* — every
 * column, every blob URL, every `description` — fetched in full on every visit to the hub, to
 * render one integer. This is the read that should always have been there, and the hub is its one
 * call site. Reported here rather than in a follow-up card because the phase that makes a read
 * grow is the phase that owns replacing it.
 *
 * Reads `nina_avatars_user_created_idx` as a count over an index range on `user_id`. No folder
 * predicate: the hub's number is the whole album, which is exactly the read
 * `listNinaAvatarsInFolder` cannot answer.
 */
export async function countNinaAvatars(userId: string): Promise<number> {
  const counted = await db
    .select({ total: sql<number>`count(*)`.mapWith(Number) })
    .from(ninaAvatars)
    .where(eq(ninaAvatars.userId, userId))
  return counted[0]?.total ?? 0
}

/**
 * Declare one or more folders. Idempotent, and the album root is silently dropped.
 *
 * `ON CONFLICT DO NOTHING` on the composite primary key is what makes this safe to call from
 * anywhere without asking first — phase 6's "New subfolder" calls it, and phase 4's batch register
 * calls it for the folder an upload lands in, so a folder that arrived by being dropped is
 * declared too and survives its photographs being removed. Two tabs creating the same folder is a
 * no-op, not a duplicate and not an error.
 *
 * ── THE ROOT IS DROPPED HERE, NOT REFUSED ───────────────────────────────────────────────────
 * `''` is the album root: it always exists and cannot be created (see `ninaFolders`'s header). A
 * caller passing it is not making a mistake worth an exception — `planFolderUpload` legitimately
 * reports root-level files — so it is filtered. An empty input after filtering returns `0` without
 * a statement, because `db.insert(...).values([])` is a syntax error and not an empty write.
 *
 * Returns how many declarations were NEW, which is `returning()`'s row count under
 * `DO NOTHING` — useful to phase 6 for telling "created" from "already existed" without a
 * second read.
 */
export async function declareNinaFolders(
  userId: string,
  folders: readonly string[],
): Promise<number> {
  const wanted = [...new Set(folders.filter((folder) => folder !== ''))]
  if (wanted.length === 0) return 0

  const inserted = await db
    .insert(ninaFolders)
    .values(wanted.map((folder) => ({ userId, folder })))
    .onConflictDoNothing()
    .returning({ folder: ninaFolders.folder })
  return inserted.length
}

/**
 * Rewrite declared paths under a renamed or moved prefix — the `nina_folders` half of
 * `renameNinaAvatarFolder`. Phase 6 calls both, in that order, for one rename.
 *
 * The same `folderSubtree` predicate as above, for the same reason: `left()` and not `LIKE`, so a
 * folder named `100%` cannot widen the match. `overlay()` replaces the prefix in place rather than
 * re-deriving the path, so a descendant four levels down moves with its ancestor and nothing has to
 * parse a path in SQL.
 *
 * Returns the number of declarations rewritten. **`0` is a success**, not a failure — it means the
 * renamed folder had no declarations under it, which is the ordinary case for a folder that arrived
 * by being dropped and was never declared. Phase 6 must not read it as "the folder did not exist";
 * `renameNinaAvatarFolder`'s row count is not proof of existence either, and
 * `listNinaAvatarFolders` is what answers that question.
 */
export async function renameNinaFolderSubtree(
  userId: string,
  from: string,
  to: string,
): Promise<number> {
  const rewritten = await db
    .update(ninaFolders)
    .set({
      folder: sql`overlay(${ninaFolders.folder} placing ${to} from 1 for ${from.length})`,
    })
    .where(and(eq(ninaFolders.userId, userId), folderSubtree(ninaFolders.folder, from)))
    .returning({ folder: ninaFolders.folder })
  return rewritten.length
}

/**
 * Undeclare a folder and everything under it. The `nina_folders` half of
 * `deleteNinaAvatarsInFolderTree`.
 *
 * **Phase 6 decides WHETHER to call this, and that decision is not obvious**: under its
 * `keepCurrent` policy the folder still holds her current photograph, so the folder must go on
 * existing and this must NOT be called. Calling it anyway would undeclare a folder that still has
 * a row in it — which `listNinaAvatarFolders` would paper over (the photograph carries the folder),
 * making the bug invisible until the last photograph left. That is precisely the class of silent
 * disagreement the UNION is designed to absorb rather than to excuse, so the ordering rule is
 * written down here as well as there: **undeclare only when the subtree is actually empty.**
 */
export async function deleteNinaFolderSubtree(userId: string, folder: string): Promise<number> {
  if (folder === '') return 0
  const removed = await db
    .delete(ninaFolders)
    .where(and(eq(ninaFolders.userId, userId), folderSubtree(ninaFolders.folder, folder)))
    .returning({ folder: ninaFolders.folder })
  return removed.length
}

/* ============================================================================
 * §10 The character tuning — F35 R1/R2/R3
 * ==========================================================================*/

/**
 * **The one place the flat row and the nested model meet.** `lib/db/schema.ts` spells
 * **thirty-seven** snake_case columns; `lib/nina/tuning.ts` spells `traits.anger` and
 * `dials.photoEagerness`. The three-layer boundary this file's own header describes for
 * `nina_messages.text` -> `body`, one table over: two spellings, ONE translation point, reviewable
 * in one diff.
 *
 * It ends in `coerceNinaTuning`, so a row hand-edited in `psql` to `anger = 900` reaches the prompt
 * as 100 rather than as a band index of 45.
 */
function tuningFromRow(row: NinaTuningRow): NinaTuning {
  return coerceNinaTuning({
    relationship: row.relationship,
    traits: {
      anger: row.anger,
      chill: row.chill,
      sad: row.sad,
      flirty: row.flirty,
      steamy: row.steamy,
      wise: row.wise,
      annoying: row.annoying,
      funny: row.funny,
      happy: row.happy,
      anxious: row.anxious,
      concerned: row.concerned,
      horny: row.horny,
    },
    dials: {
      profanity: row.profanity,
      clinginess: row.clinginess,
      photoEagerness: row.photoEagerness,
      verbosity: row.verbosity,
    },
    /* R4's toggles. Every one of these is `boolean | null`, and a NULL is a row written before the
     * columns existed — `coerceNinaEnabled` reads anything that is not literally `false` as on, so
     * an existing production row arrives here all-enabled with no data migration behind it. */
    enabled: {
      relationship: row.relationshipEnabled,
      anger: row.angerEnabled,
      chill: row.chillEnabled,
      sad: row.sadEnabled,
      flirty: row.flirtyEnabled,
      steamy: row.steamyEnabled,
      wise: row.wiseEnabled,
      annoying: row.annoyingEnabled,
      funny: row.funnyEnabled,
      happy: row.happyEnabled,
      anxious: row.anxiousEnabled,
      concerned: row.concernedEnabled,
      horny: row.hornyEnabled,
      profanity: row.profanityEnabled,
      clinginess: row.clinginessEnabled,
      photoEagerness: row.photoEagernessEnabled,
      verbosity: row.verbosityEnabled,
    },
    notes: row.notes,
  })
}

/**
 * The other direction: the nested model back into the flat columns. The SAME object is both the
 * INSERT values and the `ON CONFLICT` set, so a save writes every column whether the row is new or
 * not — there is no partial row to write and none to smuggle in.
 */
function tuningToColumns(tuning: NinaTuning) {
  return {
    relationship: tuning.relationship,
    anger: tuning.traits.anger,
    chill: tuning.traits.chill,
    sad: tuning.traits.sad,
    flirty: tuning.traits.flirty,
    steamy: tuning.traits.steamy,
    wise: tuning.traits.wise,
    annoying: tuning.traits.annoying,
    funny: tuning.traits.funny,
    happy: tuning.traits.happy,
    anxious: tuning.traits.anxious,
    concerned: tuning.traits.concerned,
    horny: tuning.traits.horny,
    profanity: tuning.dials.profanity,
    clinginess: tuning.dials.clinginess,
    photoEagerness: tuning.dials.photoEagerness,
    verbosity: tuning.dials.verbosity,
    /* R4. The RAW score above and the RAW flag here — this is the store, and switching a dial off
     * must never lose the number it was parked at. The gate that substitutes `defaultScore` lives
     * on the PROMPT side (`ninaTraitScore` / `ninaDialScore`), which is the whole point of a toggle
     * as opposed to dragging the slider back. */
    relationshipEnabled: tuning.enabled.relationship,
    angerEnabled: tuning.enabled.anger,
    chillEnabled: tuning.enabled.chill,
    sadEnabled: tuning.enabled.sad,
    flirtyEnabled: tuning.enabled.flirty,
    steamyEnabled: tuning.enabled.steamy,
    wiseEnabled: tuning.enabled.wise,
    annoyingEnabled: tuning.enabled.annoying,
    funnyEnabled: tuning.enabled.funny,
    happyEnabled: tuning.enabled.happy,
    anxiousEnabled: tuning.enabled.anxious,
    concernedEnabled: tuning.enabled.concerned,
    hornyEnabled: tuning.enabled.horny,
    profanityEnabled: tuning.enabled.profanity,
    clinginessEnabled: tuning.enabled.clinginess,
    photoEagernessEnabled: tuning.enabled.photoEagerness,
    verbosityEnabled: tuning.enabled.verbosity,
    notes: tuning.notes,
  }
}

/**
 * **Her character, right now. Never null.**
 *
 * A user with no row gets `NINA_TUNING_DEFAULTS`, and that is the whole design: it is what makes
 * every downstream caller unconditional — no `?? defaults` at four call sites, no "is she tuned
 * yet" branch in `turn.ts`, and no way for a first-run user to get a prompt with holes in it.
 * `NINA_TUNING_DEFAULTS` is frozen, so the shared object cannot be mutated by a caller that
 * receives it.
 *
 * Read live on every turn with no cache, like everything else on this path.
 * `memoryActions.ts` under `lib/admin/` records the consequence: a committed row is in her next
 * prompt with no invalidation step at all, which is what makes R1's slider immediate. (Directory
 * split off the filename deliberately — see `lib/nina/tuning.ts`'s header: `tests/admin.memory.
 * test.ts` proves the boundary by forbidding the joined path as a substring in every file here.)
 *
 * `SELECT *` rather than a column list, and this is the one place in the file where that is right:
 * the table is one row of twenty columns and every one of them is wanted, so a list would be
 * twenty lines that can only ever be wrong.
 */
export async function readNinaTuning(userId: string): Promise<NinaTuning> {
  const rows = await db.select().from(ninaTuning).where(eq(ninaTuning.userId, userId)).limit(1)
  const row = rows[0]
  return row ? tuningFromRow(row) : NINA_TUNING_DEFAULTS
}

/**
 * **One save, not seventeen** (plan invariant 11). Upsert on `user_id` and return what was stored
 * — one statement, so two tabs racing is last-write-wins on whole rows rather than a read-then-write
 * that can lose the newer one.
 *
 * ── IT COERCES BEFORE IT WRITES ───────────────────────────────────────────────────────────────
 * `coerceNinaTuning` runs here as well as in phase 5's Zod boundary, on purpose. Zod's job is a
 * good error message for a human at a form; this is the store defending its own invariants against
 * every other caller — a script, a test, a future migration. A row that cannot be read back as a
 * valid `NinaTuning` never gets written in the first place.
 *
 * ── RESETTING TO DEFAULTS IS A WRITE, NOT A DELETE ────────────────────────────────────────────
 * Phase 5's "reset" calls this with the defaults, and a row of defaults and NO row read identically
 * (`readNinaTuning` returns `NINA_TUNING_DEFAULTS` for a user with no row, and `coerceNinaTuning`
 * maps a defaults row back to those same values), so deleting would be a second code path answering
 * a question this one write already answers with the one writer this table has.
 */
export async function writeNinaTuning(userId: string, tuning: NinaTuning): Promise<NinaTuning> {
  const safe = coerceNinaTuning(tuning)
  const columns = tuningToColumns(safe)

  const rows = await db
    .insert(ninaTuning)
    .values({ userId, ...columns })
    .onConflictDoUpdate({
      target: ninaTuning.userId,
      set: { ...columns, updatedAt: new Date() },
    })
    .returning()

  const row = rows[0]
  /* `.returning()` on an upsert always yields the row, so this is unreachable in practice — but
   * this file returns a usable answer rather than throwing, everywhere, and the defaults are the
   * usable answer. See the header: "these functions return null, [] or false rather than
   * throwing". */
  return row ? tuningFromRow(row) : NINA_TUNING_DEFAULTS
}

/* ============================================================================
 * §10b The image-generation preferences, and the photographs a reference can
 * be chosen from — R4-R10, storage only
 * ==========================================================================*/

/**
 * **The one place `nina_image_prefs`'s flat row and the nested model meet.** `lib/db/schema.ts`
 * spells fifteen snake_case columns; `lib/nina/imageprefs.ts` spells `focus.boobs` and
 * `reference.source`. The same three-layer boundary `tuningFromRow` describes one table over: two
 * spellings, ONE translation point, reviewable in one diff.
 *
 * It ends in `coerceNinaImagePrefs`, so a row hand-edited in `psql` to `prompt_length = 900` reaches
 * the prompt as 100 rather than as a band index of 45.
 */
function imagePrefsFromRow(row: NinaImagePrefsRow): NinaImagePrefs {
  return coerceNinaImagePrefs({
    promptLength: row.promptLength,
    focus: {
      face: row.focusFace,
      skin: row.focusSkin,
      boobs: row.focusBoobs,
      butt: row.focusButt,
      thighs: row.focusThighs,
      calves: row.focusCalves,
    },
    wardrobe: row.wardrobe,
    venue: row.venue,
    /* The one spelling difference in this table. See `nina_image_prefs`'s header: a bare `time`
     * column is a Postgres type name, and `photo_eagerness` is the precedent. */
    time: row.timeOfDay,
    notes: row.notes,
    promptTemplate: row.promptTemplate,
    model: row.model,
    reference: { source: row.referenceSource, id: row.referenceId },
  })
}

/**
 * The other direction. The write value carries every column the table has, so this is a flat copy
 * of one nested model into the row's flat columns — nothing is held back for the database to mint.
 *
 * The six focus columns are `NOT NULL`, so drizzle's insert type makes a forgotten one a compile
 * error here — which is what `nina_tuning`'s nullable `*_enabled` columns could not do and why
 * `tests/db.schema.nina.test.ts` has to grep for those. The READ side above has no such protection
 * (a forgotten key is `undefined`, which coerces to `false` — a checkbox that silently does
 * nothing), so that direction is grepped in `tests/db.schema.nina.test.ts` instead.
 */
function imagePrefsToColumns(prefs: NinaImagePrefsWrite) {
  return {
    promptLength: prefs.promptLength,
    focusFace: prefs.focus.face,
    focusSkin: prefs.focus.skin,
    focusBoobs: prefs.focus.boobs,
    focusButt: prefs.focus.butt,
    focusThighs: prefs.focus.thighs,
    focusCalves: prefs.focus.calves,
    wardrobe: prefs.wardrobe,
    venue: prefs.venue,
    timeOfDay: prefs.time,
    notes: prefs.notes,
    promptTemplate: prefs.promptTemplate,
    model: prefs.model,
    referenceSource: prefs.reference.source,
    referenceId: prefs.reference.id,
  }
}

/**
 * **How she is photographed, right now. Never null.**
 *
 * A user with no row gets `NINA_IMAGE_PREFS_DEFAULTS`, and that is the whole design —
 * `readNinaTuning`'s argument, verbatim: it is what makes every downstream caller unconditional, so
 * `selfiegen.ts` needs no "has he opened the tab yet" branch and a first-run generation cannot get a
 * prompt with holes in it. `NINA_IMAGE_PREFS_DEFAULTS` is frozen, so the shared object cannot be
 * mutated by a caller that receives it.
 *
 * Read live at dispatch time with no cache, like everything else on this path: a wardrobe saved
 * thirty seconds ago is in the next photograph.
 *
 * `SELECT *` rather than a column list, and this is the second place in the file where that is
 * right: the table is one row of fifteen columns and every one of them is wanted, so a list would
 * be fifteen lines that can only ever be wrong.
 */
export async function readNinaImagePrefs(userId: string): Promise<NinaImagePrefs> {
  const rows = await db
    .select()
    .from(ninaImagePrefs)
    .where(eq(ninaImagePrefs.userId, userId))
    .limit(1)
  const row = rows[0]
  return row ? imagePrefsFromRow(row) : NINA_IMAGE_PREFS_DEFAULTS
}

/**
 * **One save, not fifteen** (plan invariant 7). Upsert on `user_id` and return what was stored —
 * statement for statement, `writeNinaTuning`.
 *
 * Every paragraph of `writeNinaTuning`'s docstring applies unchanged, so they are cited rather than
 * repeated: it coerces before it writes, because Zod's job is a good error message for a human at a
 * form and this is the store defending its own invariants against a script, a test and a future
 * migration; and a save replaces the whole row, because the caller always supplies one.
 */
export async function writeNinaImagePrefs(
  userId: string,
  prefs: NinaImagePrefsWrite,
): Promise<NinaImagePrefs> {
  const safe = coerceNinaImagePrefs(prefs)
  const columns = imagePrefsToColumns(safe)

  const rows = await db
    .insert(ninaImagePrefs)
    .values({ userId, ...columns })
    .onConflictDoUpdate({
      target: ninaImagePrefs.userId,
      set: { ...columns, updatedAt: new Date() },
    })
    .returning()

  const row = rows[0]
  /* `.returning()` on an upsert always yields the row, so this is unreachable in practice — but
   * this file returns a usable answer rather than throwing, everywhere, and the defaults are the
   * usable answer. */
  return row ? imagePrefsFromRow(row) : NINA_IMAGE_PREFS_DEFAULTS
}

/**
 * **Every photograph the operator may point the camera at, from both sets, newest first** — R10's
 * *"user can select all photos in Nina's album and Chat photos"*.
 *
 * ── TWO BOUNDED READS PLUS A PURE MERGE, NOT A SQL `UNION ALL` ──────────────────────────────
 * The two tables share no column list — `nina_avatars` has a derived `thumb_url` and
 * `nina_message_images` has none — so a `UNION ALL` would need a projection with literal
 * discriminators, and its ordering could then only be proved against a live database. Instead each
 * side is read on its own index and `mergeNinaPhotoRefs` orders and slices them, which `npm test`
 * proves with no database at all. It is the split `listNinaAvatarFolders` already makes and states:
 * *"SQL groups, the pure module rolls up."*
 *
 * ── IT IS BOUNDED, AND `NINA_PHOTO_REF_SCAN_MAX` IS WHERE ─────────────────────────────────────
 * `ninaPhotoRefBounds` clamps `limit` to `NINA_PHOTO_REF_PAGE_SIZE` (both default and CEILING, so a
 * hand-edited request cannot widen it) and caps the reachable depth at `NINA_PHOTO_REF_SCAN_MAX`,
 * which is also the per-side `LIMIT`. An unbounded read over *"hundreds of profile pics"* is the
 * mistake `countNinaAvatars` exists to undo, and `listNinaAvatars` (:2314) is that unbounded read —
 * it is deliberately NOT reused here.
 *
 * ── FOUR STATEMENTS, RUN CONCURRENTLY ────────────────────────────────────────────────────────
 * Two pages and two counts, in one `Promise.all`. The counts are their own statements rather than
 * `count(*) OVER ()` windows for `listNinaChatPhotos`'s reason: a window reports `total: 0` for an
 * over-shot page, which the picker has to tell apart from an empty collection. The chat count is
 * literally `countNinaChatPhotos` (:1713) rather than a second copy of its predicate.
 *
 * ── WHICH ROWS, AND WHICH INDEX ──────────────────────────────────────────────────────────────
 * The album side is EVERY folder — *"all photos in Nina's album"* — so there is no `folder`
 * predicate and it reads `nina_avatars_user_created_idx on (user_id, created_at desc)`, which is
 * exactly this shape. The chat side is `generatedChatPhotoScope` (:1649), i.e. `kind = 'generated'`
 * only: HIS uploads share that table and are not photographs of her. `kind` stays a residual
 * predicate over `nina_message_images_user_created_idx` for the reason that function's docstring
 * gives, and **no index is added** — nothing has measured a need for one.
 *
 * ── AND NOT A REFERENCE ROW. THIS IS PLAN INVARIANT 13 AND IT IS WHY THIS FUNCTION CALLS
 *    `generatedChatPhotoScope` INSTEAD OF SPELLING `eq(kind, 'generated')` ITSELF ───────────────
 * A row in `nina_message_images` is a **reference** when `source_avatar_id` OR `source_image_id` is
 * non-null (`lib/db/schema.ts:1081-1112`): it is a real photograph in a real bubble whose bytes are
 * already in the collection under another id, written by `resolveAttachment`'s re-attach path
 * (`lib/nina/actions.ts:589-615`, provenance from `ninaPhotoProvenance`,
 * `lib/nina/attach.ts:221-229`, which flattens `source_image_id ?? row.id` so a copy of a copy
 * points at the original).
 *
 * **If this union contained reference rows it would show the same photograph more than once** —
 * once as the `nina_avatars` row and again as the chat row that merely points at it — which is
 * exactly the duplication the `nina-photo-refs-and-bubble-actions` set was built to remove, and
 * which the user complained about in as many words. R10's grid would re-create the defect on a new
 * screen.
 *
 * It does not, and the reason is structural rather than lucky: `generatedChatPhotoScope`
 * (`lib/nina/queries.ts:1649-1655`) is `and(eq(userId), eq(kind, 'generated'), isOriginalPhoto())`,
 * and `isOriginalPhoto()` (`:1616-1618`) is
 * `and(isNull(sourceAvatarId), isNull(sourceImageId))`. `countNinaChatPhotos` (:1713) shares that
 * same private scope, so the page and the `total` cannot disagree — which is the argument that
 * function's own docstring makes at `:1642-1647`.
 *
 * **DO NOT INLINE THE PREDICATE.** Replacing `generatedChatPhotoScope(userId)` with a hand-written
 * `and(eq(ninaMessageImages.userId, userId), eq(ninaMessageImages.kind, 'generated'))` — the
 * "obvious" simplification, since this function needs a different projection anyway — silently
 * re-admits every reference row and re-creates the duplicate. `tests/nina.imageprefs.test.ts`
 * asserts the source of this function contains `generatedChatPhotoScope` and does **not** contain a
 * literal `kind` comparison, so the shortcut fails a test rather than shipping.
 *
 * The album side needs no such filter and gains nothing from one: `nina_avatars` is the ORIGIN side
 * and has no provenance columns at all (`lib/db/schema.ts:1497-1571`). An album row is never a
 * reference. And a chat photograph whose bytes came FROM an album face is caught on the chat side —
 * either by `resolveAttachment` at insert time going forward, or by
 * `drizzle/0010_nina_image_provenance.sql`'s second backfill retroactively, which matches on equal
 * `blob_url` within one `user_id` in either direction.
 *
 * `resolveNinaPhotoReference` below uses the same scope for the same reason, so a saved id can
 * never resolve to a reference row either. That is consistent rather than redundant: the picker
 * never offers one, and provenance is written at insert and never later, so a saved selection
 * cannot become a reference after the fact.
 *
 * ── WHAT IT DOES NOT RETURN ──────────────────────────────────────────────────────────────────
 * No `description`, no `filename`, no `folder`, no `prompt`. R10 is *"a simple photos grid without
 * any captions (just like ios album app)"*, and a field the grid must not render is a field this
 * read must not ship — the same discipline `listNinaAvatarManifest` applies to its own projection.
 */
export async function listNinaPhotoReferences(
  userId: string,
  opts: { limit?: number; offset?: number } = {},
): Promise<NinaPhotoRefPage> {
  const bounds = ninaPhotoRefBounds(opts)

  const [albumRows, chatRows, albumCount, chatCount] = await Promise.all([
    db
      .select({
        id: ninaAvatars.id,
        blobUrl: ninaAvatars.blobUrl,
        thumbUrl: ninaAvatars.thumbUrl,
        width: ninaAvatars.width,
        height: ninaAvatars.height,
        createdAt: ninaAvatars.createdAt,
      })
      .from(ninaAvatars)
      .where(eq(ninaAvatars.userId, userId))
      .orderBy(desc(ninaAvatars.createdAt), desc(ninaAvatars.id))
      .limit(bounds.scan),
    db
      .select({
        id: ninaMessageImages.id,
        blobUrl: ninaMessageImages.blobUrl,
        width: ninaMessageImages.width,
        height: ninaMessageImages.height,
        createdAt: ninaMessageImages.createdAt,
      })
      .from(ninaMessageImages)
      .where(generatedChatPhotoScope(userId))
      .orderBy(desc(ninaMessageImages.createdAt), desc(ninaMessageImages.id))
      .limit(bounds.scan),
    countNinaAvatars(userId),
    countNinaChatPhotos(userId),
  ])

  /* `as const` on the discriminator rather than relying on the annotation's contextual type: this
   * is the one place a widened `string` would turn a compile error into a row the grid cannot key. */
  const album: NinaPhotoRef[] = albumRows.map((row) => ({ source: 'album' as const, ...row }))
  /* `nina_message_images` has no `thumb_url` column, so the grid loads the original — which is what
   * `ChatPhotoGrid` already knowingly does, and the plan's Scope rules out adding the column. */
  const chat: NinaPhotoRef[] = chatRows.map((row) => ({
    source: 'chat' as const,
    thumbUrl: null,
    ...row,
  }))

  return {
    rows: mergeNinaPhotoRefs(album, chat, bounds),
    total: albumCount + chatCount,
    offset: bounds.offset,
    limit: bounds.limit,
  }
}

/**
 * **The stored reference, resolved to a photograph — or `null`.** The bridge between what the row
 * holds (a set and an id) and what a generation needs (bytes at a URL).
 *
 * `nina_image_prefs` stores an id and not a blob URL because replacing a chat photograph's bytes
 * (`updateNinaChatPhotoBlob`, :1768) changes its `blob_url` and keeps its `id` — see that table's
 * header. The cost of that choice is this function, and it is one primary-key read.
 *
 * ── `null` IS THE ANSWER, NOT AN ERROR ──────────────────────────────────────────────────────
 * There is no foreign key on the two reference columns (two possible parents, and a cascade would
 * delete a whole preferences row because one photograph was deleted), so a photograph the operator
 * later deleted leaves an id pointing at nothing. That must NOT break the preferences row and must
 * not fail a generation: phase 3 degrades to an unanchored call, which is the plan's own decision
 * about a reference that cannot be fetched. `'none'` returns `null` on the same branch and without a
 * statement, so the ordinary unanchored case costs no round trip.
 *
 * It returns the whole `NinaPhotoRef` and not just the URL, because there are two callers with
 * different needs: phase 3 wants `blobUrl`, and phase 5 wants to render the chosen tile even when it
 * has fallen off the current page.
 */
export async function resolveNinaPhotoReference(
  userId: string,
  reference: NinaImageReference,
): Promise<NinaPhotoRef | null> {
  if (reference.source === 'none' || reference.id === '') return null

  if (reference.source === 'album') {
    const rows = await db
      .select({
        id: ninaAvatars.id,
        blobUrl: ninaAvatars.blobUrl,
        thumbUrl: ninaAvatars.thumbUrl,
        width: ninaAvatars.width,
        height: ninaAvatars.height,
        createdAt: ninaAvatars.createdAt,
      })
      .from(ninaAvatars)
      .where(and(eq(ninaAvatars.userId, userId), eq(ninaAvatars.id, reference.id)))
      .limit(1)
    const row = rows[0]
    return row ? { source: 'album' as const, ...row } : null
  }

  const rows = await db
    .select({
      id: ninaMessageImages.id,
      blobUrl: ninaMessageImages.blobUrl,
      width: ninaMessageImages.width,
      height: ninaMessageImages.height,
      createdAt: ninaMessageImages.createdAt,
    })
    .from(ninaMessageImages)
    .where(and(generatedChatPhotoScope(userId), eq(ninaMessageImages.id, reference.id)))
    .limit(1)
  const row = rows[0]
  return row ? { source: 'chat' as const, thumbUrl: null, ...row } : null
}

/* ============================================================================
 * §11 The promise reward's landing test (R5, phase 4)
 * ==========================================================================*/

/**
 * **The job ids of photographs that have actually reached the conversation.**
 *
 * `scripts/nina-image-worker.ts`'s `finishSelfie` writes two rows for every chat selfie: a
 * `nina_messages` row with `turn_id` set to the image job's id, and a `nina_message_images` row
 * with `kind = 'generated'`. So the existence of a `turn_id` in this result is proof that a
 * specific dispatched job produced a specific visible photograph — which is exactly what
 * `evaluatePromise`'s `selfieLandedForJob` needs, and which nothing weaker can promise.
 *
 * ── WHY IDS AND NOT A COUNT ───────────────────────────────────────────────────────────────────
 * A count of photographs since a day would let a selfie HE asked for through `generate_image`
 * settle a promise he had not kept — `ninaImageDailyCap()` allows several a day, so that is not a
 * theoretical collision. The avatar landing test can afford a same-day tolerance because a
 * *generated avatar* only ever comes from a promise or an operator; a chat selfie cannot. Same
 * read, same index, exact answer.
 *
 * ── WHY IT IS INDEXED ─────────────────────────────────────────────────────────────────────────
 * `nina_message_images_user_created_idx on (user_id, created_at desc)` is the leading-column range
 * scan, and the join to `nina_messages` is on that table's primary key. `since` is the Jakarta
 * midnight of the earliest fired job the caller cares about; the caller computes it, because the
 * calendar rules for a promise live in `lib/nina/promises.ts` and not here.
 *
 * `kind = 'generated'` excludes HIS uploads, which share the table.
 *
 * ── AN ORPHANED PHOTOGRAPH IS NOT COUNTED, AND THAT IS THE OLD ANSWER ─────────────────────
 * `message_id` is nullable since R1 of the orphans set, and the `innerJoin` below drops a row whose
 * message is gone. That is not a behaviour change: before R1 the row itself was deleted with the
 * session, so the answer was the same. A photograph whose conversation the runner deleted is not
 * evidence that a promised selfie landed in a conversation.
 */
export async function listNinaSelfieJobIdsSince(userId: string, since: Date): Promise<string[]> {
  const rows = await db
    .selectDistinct({ jobId: ninaMessages.turnId })
    .from(ninaMessageImages)
    .innerJoin(ninaMessages, eq(ninaMessages.id, ninaMessageImages.messageId))
    .where(
      and(
        eq(ninaMessageImages.userId, userId),
        eq(ninaMessageImages.kind, 'generated'),
        gte(ninaMessageImages.createdAt, since),
        isNotNull(ninaMessages.turnId),
      ),
    )
  return rows.map((row) => row.jobId).filter((jobId): jobId is string => jobId != null)
}

/* ============================================================================
 * §12 The job → photograph link (this set's R2/R3/R4)
 * ==========================================================================*/

/**
 * The whole fact the Detail foto row needs: the id of the photograph the job produced. See
 * `getNinaJobPhoto` for why that is all it selects.
 */
export interface NinaJobPhotoRow {
  /** The `nina_message_images.id` the `/nina/about?photo=chat.<id>` link names. */
  id: string
}

/**
 * **A job's photograph, through the only job→photo key the schema has: `nina_messages.turn_id`.**
 *
 * Both writers of a finished selfie spell the chain the same way — `scripts/nina-image-worker.ts`'s
 * `finishSelfie` (raw SQL) and its in-platform twin `lib/nina/imagerun.ts` insert one
 * `nina_messages` row with `turn_id = jobId` and `photo_only`, then one `nina_message_images` row
 * with `kind = 'generated'` hanging off it. The image row itself carries NO job id, so the join
 * below is not one way to answer the question, it is the only one. `listNinaSelfieJobIdsSince`
 * (§11) walks this exact join in the other direction; this is that read with a point instead of a
 * list.
 *
 * ── WHY THE LINK SURVIVES AN ADMIN REPLACE, AND DIES ON AN ADMIN REMOVE ───────────────────────
 * `replaceChatPhotoAction` swaps bytes on the SAME row (`updateNinaChatPhotoBlob` — same id, same
 * `message_id`, same `created_at`), so the id this read returns keeps naming the photograph after
 * a Replace, and the viewer it opens shows the new bytes. That is R4, and it is why the link must
 * name the row id and nothing derived from the bytes. `removeChatPhotoAction` deletes the row
 * outright — R3's stated boundary — and this read then returns `null`, which the page renders as
 * NO control: never a link the server has not proved.
 *
 * ── THE TWO NULLS, AND WHY NEITHER IS AN ERROR ────────────────────────────────────────────────
 * "Not yours" and "does not resolve" are one outcome, this module's standing rule. The second
 * `null` here is genuinely ambiguous by design: a removed session cascades the carrier message
 * away, the `innerJoin` misses, and the photograph — orphaned, `message_id SET NULL` — stays alive
 * in Media but unreachable from Detail foto. That degradation is DECIDED (plan index, *Decisions*:
 * repairing it needs a `job_id` column, which is a migration this set forbids), so `null` is the
 * honest answer and not a case to disambiguate. `finishAvatar` writes no carrier message at all,
 * so an avatar job's `turn_id` names nothing and this read returns `null` for one by construction —
 * the page still skips calling it (see `planJobPhoto`'s avatar arm, the rule half of that
 * decision).
 *
 * ── OWNER SCOPE ON BOTH TABLES ────────────────────────────────────────────────────────────────
 * `nina_message_images.user_id` is this module's standing rule. `nina_messages.user_id` is spelled
 * too, although the page has already owner-verified `jobId` through `getNinaImageJobDetail`: a
 * join's WHERE is where this module proves ownership, and a job id is a claim wherever it arrives
 * from. The redundancy costs one predicate, not one round trip.
 *
 * ── WHY `kind = 'generated'`, THE ORDER, AND THE ONE ROW ──────────────────────────────────────
 * `generated` excludes HIS uploads, which share the table. The order is the gallery's own —
 * `(created_at desc, id desc)`, `listNinaMessageImages`' — so `LIMIT 1` is deterministic even if a
 * job ever carried two photographs; today both writers write exactly one, so the tiebreak is
 * insurance rather than a fix.
 *
 * ── WHY `isOriginalPhoto()` IS DELIBERATELY ABSENT ────────────────────────────────────────────
 * This read makes a photograph RENDER — the Detail foto icon is drawn from the row it returns —
 * which is exactly the class `isOriginalPhoto`'s docstring says must never be filtered (the reads
 * that render). The absence is asserted in `tests/nina.photoRefs.test.ts`, so a future
 * "consistency" cleanup that adds the predicate here fails loudly instead of blanking the control.
 *
 * ── WHY THE PROJECTION IS `{ id }` AND NOT `imageColumns` ─────────────────────────────────────
 * The page maps this row to an href and nothing else (plan invariant 5). Selecting only `id` makes
 * `description`'s exclusion STRUCTURAL — `glm-4.6v`'s private prose cannot cross into client props
 * if it is never selected — and keeps this read from growing a projection nobody reads. Widen it
 * only with a consumer.
 *
 * ── WHY THERE IS NO INDEX AND NO MIGRATION ────────────────────────────────────────────────────
 * `nina_messages.turn_id` is deliberately unindexed (`lib/db/schema.ts`: "nothing renders it, and
 * an audit pointer must not be able to block a delete") and this set adds no index (plan invariant
 * 4). The cost is bounded anyway: the images side enters through
 * `nina_message_images_user_created_idx (user_id, created_at desc)`, the join is on
 * `nina_messages`' primary key, and one user's photographs number in the dozens — not the
 * thousands that would make an unindexed `turn_id` scan visible. One statement, on a page opened a
 * handful of times a day — and the page now adds exactly one sequential read beside it
 * (`getNinaJobPhotoBubble`, the jump's target), which is the economics this paragraph already
 * accepted.
 */
export async function getNinaJobPhoto(
  userId: string,
  jobId: string,
): Promise<NinaJobPhotoRow | null> {
  const rows = await db
    .select({ id: ninaMessageImages.id })
    .from(ninaMessageImages)
    .innerJoin(ninaMessages, eq(ninaMessages.id, ninaMessageImages.messageId))
    .where(
      and(
        eq(ninaMessageImages.userId, userId),
        eq(ninaMessages.userId, userId),
        eq(ninaMessages.turnId, jobId),
        eq(ninaMessageImages.kind, 'generated'),
      ),
    )
    .orderBy(desc(ninaMessageImages.createdAt), desc(ninaMessageImages.id))
    .limit(1)
  return rows[0] ?? null
}

/**
 * The facts the Detail foto jump needs to build its href: which conversation to open, which bubble
 * in it to pinpoint. See `getNinaJobPhotoBubble` for why that is all it selects.
 */
export interface NinaJobPhotoBubbleRow {
  /** The `nina_messages.session_id` the deep link opens — `ninaJumpHref`'s `?s=` leg. */
  sessionId: string
  /** The `nina_messages.id` the deep link pinpoints — `ninaJumpHref`'s `?jump=` leg. */
  messageId: string
}

/**
 * **The earliest bubble, across every session, that attached the given photograph — the Detail
 * foto jump's target.**
 *
 * The photograph is `getNinaJobPhoto`'s row (the page resolves it for the icon and hands the id
 * here), and the bubbles that can be showing it are exactly two kinds of row in
 * `nina_message_images`: the ORIGINAL itself (`i.id = imageId` — Nina's carrier bubble, the
 * message whose `turn_id` names the job) and every REFERENCE copied from it
 * (`i.source_image_id = imageId` — the runner's own re-attach, written by `resolveAttachment`).
 *
 * ── WHY THE CANDIDATE SET IS EXACTLY TWO PREDICATES, AND NOT A RECURSION ─────────────────────
 * `ninaPhotoProvenance` (`lib/nina/attach.ts`) flattens `source_image_id ?? row.id`, so a copy of
 * a copy points at the ORIGINAL row — no reference names another reference, so there is no chain
 * to walk. Two predicates are the whole set; a recursive CTE would be answering a question this
 * schema cannot ask.
 *
 * ── WHY `isOriginalPhoto()` IS DELIBERATELY ABSENT, AND `kind` WITH IT ────────────────────────
 * A reference IS a valid target — "it could be nina's bubble, or user's own bubble" is the
 * requirement's own sentence, and the runner's re-attach is exactly such a reference row.
 * Filtering references here would take back the case this read exists for. No `kind` arm either:
 * the two id predicates already pin the photograph's bytes (the original arrived through
 * `getNinaJobPhoto`'s `kind = 'generated'` read, and a re-attach inherits its keeper's kind —
 * `resolveAttachment` in `lib/nina/actions.ts`), so the filter has no work to do here. Both
 * absences are asserted in `tests/nina.photoRefs.test.ts`, so a "consistency" cleanup that adds
 * either fails loudly instead of silently narrowing the target.
 *
 * ── WHY THE JOIN, AND WHY AN ORPHANED PHOTOGRAPH ANSWERS `null` ───────────────────────────────
 * A bubble is a message: `message_id` is nullable (`ON DELETE SET NULL`), and the `innerJoin`
 * skips a NULL by construction — a photograph whose conversation was removed has no bubble to
 * jump to, and `null` is the honest answer (`getNinaJobPhoto`'s second null, now answered on THIS
 * read). That join also implies `message_id IS NOT NULL`, so no such predicate is spelled.
 *
 * ── OWNER SCOPE ON BOTH TABLES ────────────────────────────────────────────────────────────────
 * `nina_message_images.user_id` is this module's standing rule; `nina_messages.user_id` is spelled
 * too, although the page has already owner-verified the job through `getNinaImageJobDetail`: a
 * join's WHERE is where this module proves ownership, and an image id is a claim wherever it
 * arrives from. The redundancy costs one predicate, not one round trip.
 *
 * ── WHY THIS ORDER ────────────────────────────────────────────────────────────────────────────
 * `nina_messages.seq` is the schema's stated total order of the whole conversation — sessions
 * slice it, `MessageList` renders in it — so "earliest across all sessions" is simply `seq ASC`,
 * and no timestamp ever compares two writers' clocks. `nina_message_images.id ASC` is the
 * tiebreak for the one shape that can produce equal seqs: two image rows on ONE carrier message.
 * `LIMIT 1` under a total order is deterministic.
 *
 * ── WHY THE PARAMETER IS THE PHOTOGRAPH'S ID AND NOT THE JOB'S ─────────────────────────────────
 * The page already resolved the photograph for the icon; a `jobId` input here would re-derive
 * `getNinaJobPhoto`'s join to name the same row. The read takes the fact and answers the question
 * it is actually asked — the same economics `getNinaJobPhoto`'s header states for its own
 * projection.
 *
 * ── WHY THERE IS NO INDEX AND NO MIGRATION ────────────────────────────────────────────────────
 * `source_image_id` is a residual predicate over a read that enters through
 * `nina_message_images_user_created_idx (user_id, created_at desc)` and joins `nina_messages` on
 * its primary key — the exact access path `getNinaJobPhoto` runs beside it on the same page load,
 * and the one that table's own header argues is enough at one user's photograph count. No
 * migration, no index (plan invariant 2); nothing has measured a need for either.
 */
export async function getNinaJobPhotoBubble(
  userId: string,
  imageId: string,
): Promise<NinaJobPhotoBubbleRow | null> {
  const rows = await db
    .select({ sessionId: ninaMessages.sessionId, messageId: ninaMessages.id })
    .from(ninaMessageImages)
    .innerJoin(ninaMessages, eq(ninaMessages.id, ninaMessageImages.messageId))
    .where(
      and(
        eq(ninaMessageImages.userId, userId),
        eq(ninaMessages.userId, userId),
        or(eq(ninaMessageImages.id, imageId), eq(ninaMessageImages.sourceImageId, imageId)),
      ),
    )
    .orderBy(asc(ninaMessages.seq), asc(ninaMessageImages.id))
    .limit(1)
  return rows[0] ?? null
}
