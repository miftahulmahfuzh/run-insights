import { and, asc, desc, eq, gte, isNotNull, or } from 'drizzle-orm'

import { db } from '@/lib/db'
import {
  ninaAvatars,
  ninaImagePrefs,
  ninaMessageImages,
  ninaMessages,
  ninaTuning,
  type NinaImagePrefsRow,
  type NinaTuningRow,
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
import { coerceNinaTuning, NINA_TUNING_DEFAULTS, type NinaTuning } from '@/lib/nina/tuning'
import { countNinaChatPhotos, generatedChatPhotoScope } from './queries/images'
import { countNinaAvatars } from './queries/avatars'

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
export * from './queries/avatars'

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
