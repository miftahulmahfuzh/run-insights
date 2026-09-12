import { and, asc, desc, eq, inArray, isNotNull, isNull, sql, type SQL } from 'drizzle-orm'
import type { PgColumn } from 'drizzle-orm/pg-core'

import { db } from '@/lib/db'
import { ninaAvatars, ninaFolders } from '@/lib/db/schema'
import { newId } from '@/lib/id'
import {
  NINA_ADMIN_BATCH_MAX,
  NINA_ADMIN_MANIFEST_MAX,
  NINA_ADMIN_PAGE_SIZE,
} from '@/lib/nina/album'
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
} from './shapes'
import { avatarColumns } from './columns'

/**
 * Nina's avatar album — her face, and the album as a file manager.
 *
 * Split out of `lib/nina/queries.ts` on 2026-09-12. Origin sections, in file order:
 *   - §9 Avatars — her album (RU-7, R19, R23, R25) — `getCurrentNinaAvatar` …
 *     `deleteNinaAvatar`, 11 exports
 *   - §9b The album as a file manager — F34 R1 — `listNinaAvatarsInFolder` …
 *     `deleteNinaFolderSubtree`, 12 exports, plus the private `folderSubtree` predicate
 *
 * Banner prose moved byte-identical apart from two pointer rewrites where the prose said
 * "this module's rule 1": rule 1 — the userId-scoping, return-`null`-not-throw rule those
 * lines cite — stays on `lib/nina/queries.ts`'s header. This module inherits those rules;
 * it does not restate them.
 *
 * §9b's prose speaks of six §9 functions (`deleteNinaAvatar`, `getCurrentNinaAvatar`,
 * `insertNinaAvatarAsCurrent`, `listNinaAvatars`, `setCurrentNinaAvatar`,
 * `updateNinaAvatarCrop`); both sections live in this module now, so those mentions are
 * intra-module prose and no import between the halves exists or is needed.
 *
 * `folderSubtree` stays module-private: its five callers are all in this file. It is the one
 * private top-level symbol here; everything else is exported and re-exported through the
 * barrel.
 *
 * Imports foundation-wards only (`./shapes`, `./columns`) plus `db`, the two album tables,
 * `newId` and the album constants — never the barrel `@/lib/nina/queries`, which re-exports
 * this module.
 */
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
 * statements. Every one of them is `userId`-scoped in its WHERE, per `lib/nina/queries.ts`'s rule 1.
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
 * yours or are already gone", per `lib/nina/queries.ts`'s rule 1.
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
 * Internal — shared with sibling query modules: `queries/imageprefs.ts` imports this count
 * for the photo-reference grid (the one cross-module edge into avatars, 2026-09-12 split).
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
