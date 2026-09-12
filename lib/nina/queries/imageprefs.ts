import { and, desc, eq } from 'drizzle-orm'

import { db } from '@/lib/db'
import {
  ninaAvatars,
  ninaImagePrefs,
  ninaMessageImages,
  type NinaImagePrefsRow,
} from '@/lib/db/schema'
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
import { countNinaAvatars } from './avatars'
import { countNinaChatPhotos, generatedChatPhotoScope } from './images'

/**
 * Split from `lib/nina/queries.ts` on 2026-09-12: this file carries that barrel's §10b
 * "The image-generation preferences, and the photographs a reference can be chosen from —
 * R4-R10, storage only", moved byte-identical; `lib/nina/queries.ts` remains the public
 * barrel and re-exports everything here.
 *
 * The flat name `lib/nina/imageprefs.ts` is the MODEL layer — zero imports, client-safe.
 * This is its persistence module; the mirror naming is deliberate. Its only cross-module
 * imports are `countNinaChatPhotos` + `generatedChatPhotoScope` from `./images` and
 * `countNinaAvatars` from `./avatars`.
 */
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
