import { relations, sql } from 'drizzle-orm'
import {
  boolean,
  index,
  integer,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core'
import { users } from '../auth'
/** 'seed' is the committed first avatar, 'generated' phase 12, 'operator' phase 14, 'admin' 15. */
export type NinaAvatarSource = 'seed' | 'generated' | 'operator' | 'admin'

/**
 * **Her album (RU-7, R19).** Per-user, blobs under `nina/<userId>/`, exactly one row current.
 *
 * ── THE PARTIAL UNIQUE INDEX IS THE POINT ─────────────────────────────────────────────────────
 * `nina_avatars_user_current_unq on (user_id) where is_current` makes two current avatars
 * IMPOSSIBLE rather than merely unlikely — the `shares_run_id_active_unq` precedent, and for the
 * same reason: the alternative is a read-then-compare that is correct until two writers race.
 * **A consequence every writer must respect: un-current the old row BEFORE inserting the new
 * one, in one `db.batch`.** Insert-first violates the index mid-transaction. Phase 14's script
 * documents this and gets the order right; `insertNinaAvatarAsCurrent` in Step 6 is the runtime
 * half and gets it right for the same reason.
 *
 * ── `announced_at` ────────────────────────────────────────────────────────────────────────────
 * Nullable, so "the current avatar she has not mentioned yet" is a query
 * (`is_current AND announced_at IS NULL`) and not a flag someone has to remember to set. That
 * query is what makes RU-17 work: a hand-uploaded avatar makes her speak, because something
 * finds the un-announced row and asks her to comment on it.
 *
 * ── THE CROP TRANSFORM (R23) ──────────────────────────────────────────────────────────────────
 * `/admin/nina` (phase 15) lets the user zoom and drag an image until her face sits centred in a
 * CIRCULAR frame, and that transform has to persist per avatar or every screen re-guesses it.
 * Three nullable columns, in a resolution-independent convention so the same numbers work for a
 * 28 px bubble avatar and a full-screen photo:
 *
 *   - `crop_scale` — a multiple of the COVER fit. `1.000` is the smallest scale that still fills
 *     the circle; `1.500` is zoomed 50% further in. `numeric(5,3)`, so 0.001 … 9.999.
 *   - `crop_x`, `crop_y` — the image centre's offset from the frame centre, in THOUSANDTHS OF
 *     THE FRAME'S WIDTH. Positive x moves the image right, positive y moves it down. Integers,
 *     because the schema's rule is integers in the smallest sensible unit and a per-mille of a
 *     frame is that unit here.
 *
 * **All three NULL together means "no transform": render the image `object-cover`, centred.**
 * That is the value every row written before phase 15 carries — the seed row, phase 12's
 * generations, phase 14's operator uploads — so none of them needs a backfill and none of them is
 * invalid. A renderer must treat a partial triple (scale set, offsets NULL) as offsets of zero
 * rather than as an error.
 *
 * ── `description` (R25) ───────────────────────────────────────────────────────────────────────
 * What the picture DEPICTS, in prose. It exists so that "lah lo ganti foto profil na, itu lagi
 * dimana?" can be answered with a story consistent with the actual image and with the chat
 * history — she cannot invent where she was in a photograph she cannot see, and RU-12 forbids
 * sending `glm-5.3` an image. Nullable, and three different phases populate it three different
 * ways: **phase 12** already has its own generation prompt and writes from that; **phase 14**
 * and **phase 15** are handed a file with no prompt at all, so both run phase 6's `glm-4.6v`
 * describe pre-pass over it. Declaring the column is this phase's whole share of R25.
 *
 * ── THE ALBUM IS A FILE MANAGER, AND A FOLDER IS A COLUMN (F34 R1) ────────────────────────────
 * The user's requirement, verbatim: *"i will put hundreds of profile pics in there, and i very
 * much prefer we can upload folders instead."* So a photo has a `folder`, and `''` is the album
 * root.
 *
 * **Folder structure is METADATA, not blob layout, and that is a decision rather than an
 * oversight.** Blob pathnames keep the flat `nina/<userId>/avatar-<id>.<ext>` shape
 * (`lib/admin/avatars.ts`), so renaming a folder holding three hundred photos is ONE `UPDATE`
 * instead of three hundred copy-and-deletes across a network. It also means `pathname` could not
 * have carried the folder even if we wanted it to: `addRandomSuffix: true` makes Blob rewrite the
 * pathname it was asked for, so the stored value is Blob's and folder identity cannot be parsed
 * back out of it.
 *
 * `folder` is `NOT NULL DEFAULT ''` and that pairing is the entire migration story. Every row
 * written before F34 — the phase 14 operator uploads, phase 12's generations, phase 15's
 * hand-uploads — appears at the album root, and it appears there because Postgres applies a
 * constant default at `ADD COLUMN` time without rewriting the table. `419167d` is the precedent
 * for telling the two apart: that fix needed a BACKFILL, because a new `records` key changed what
 * a derived table *should* hold without touching anything that would make it hold that. This
 * needs a DEFAULT, because there is nothing to derive — "no folder" and "the root" are the same
 * fact, and a script that wrote `''` into every row would be writing the value the column already
 * has.
 *
 * **An EMPTY folder is representable, but not by this column** — see `nina_folders` below. A
 * folder is otherwise exactly the set of rows carrying its path, which is what makes a folder
 * arrive by being dropped and what makes a rename one `UPDATE`; what that cannot say is "this
 * directory exists and I have not filled it yet", and the operator filing hundreds of photographs
 * makes the directory first. So `nina_folders` holds that one fact and `listNinaAvatarFolders`
 * UNIONs the two sources rather than trusting either. **Neither is authoritative**, which is the
 * whole of the consistency story: read that function's header before touching either table.
 *
 * `filename` is what the file was called on the laptop — `File.webkitRelativePath`'s last
 * segment. Nullable, because the three pre-F34 writers were handed bytes and not a filename, and
 * inventing `avatar-<id>.jpg` for them would be recording a fact nobody stated. A renderer shows
 * the id when it is NULL.
 *
 * ── `source_key` IS A CONSTRAINT, NOT A CONVENTION ────────────────────────────────────────────
 * The other half of the requirement: *"it automatically upload only the new folders and files as
 * optimization."* The browser folds `(normalised relative path, size, lastModified)` into one
 * string per file, compares it against the manifest this table hands back, and uploads only the
 * misses. That diff is a client-side optimisation and therefore advisory — a double-clicked drop,
 * a retried Server Action or two tabs will all re-submit a batch that the diff already approved.
 *
 * So `nina_avatars_user_source_key_unq` on `(user_id, source_key)` makes the second insert
 * IMPOSSIBLE rather than merely unlikely, exactly as `nina_avatars_user_current_unq` above does
 * for two current avatars, and for the same stated reason: the alternative is a read-then-compare
 * that is correct until two writers race. The batch insert writes
 * `ON CONFLICT (user_id, source_key) DO NOTHING`, so a resubmitted batch is a no-op with a
 * truthful "0 new rows" instead of a duplicate album.
 *
 * **`source_key` is NULLABLE and that is what makes the unique index safe to add to a populated
 * table.** Postgres unique indexes treat NULLs as DISTINCT by default, so every pre-F34 row —
 * all of which carry NULL — coexists with every other, and only rows that actually claim a
 * dedupe key are held to it. `NULLS NOT DISTINCT` would have made the migration fail on the
 * second existing row. It is a client-supplied value, so `lib/admin/filetree.ts` bounds its
 * length: a b-tree tuple has a hard size limit and an unbounded text column in a unique index is
 * an insert that fails at 2704 bytes rather than at validation.
 *
 * ── THE DERIVED THUMBNAIL (`thumb_url`, `thumb_pathname`) ─────────────────────────────────────
 * A grid of hundreds cannot download hundreds of originals, and the two obvious escapes are both
 * already ruled out in writing: `components/nina/NinaPhotoGrid.tsx:56-58` refuses `next/image` on
 * these blobs (*"would re-optimise finished files on a paid transform quota"*), and
 * `components/admin/UploadAvatar.tsx:26-33` refuses to downscale the ORIGINAL, because a 4× crop
 * zoom on a 768 px source shows her face at 192 px. Both hold. So a SECOND, small blob is written
 * beside the original at upload time and the original is never touched.
 *
 * Two columns and not one: `thumb_url` is what a grid renders, and `thumb_pathname` is the STORED
 * Blob pathname, which is the only thing that lets a delete remove both objects. Recording a URL
 * without its pathname is how an album accumulates orphans that only a store listing can find.
 * Both NULL means "there is no thumbnail" — the pre-F34 rows, and any row whose thumbnail
 * derivation failed — and a renderer falls back to `blob_url`, which is correct if expensive and
 * is what `/nina/about`'s grid does today anyway.
 *
 * ── THE FOLDER INDEX DOES NOT REPLACE THE CREATED INDEX ───────────────────────────────────────
 * `nina_avatars_user_folder_created_idx on (user_id, folder, created_at desc)` is what makes the
 * explorer's page an index range scan: equality on `user_id`, equality on `folder`, and the sort
 * already ordered. `nina_avatars_user_created_idx` stays, because "the whole album, newest first"
 * (`listNinaAvatars`, three callers) puts no equality on `folder` and would have to sort. Two
 * reads, two shapes, two indexes.
 *
 * The one read the folder index serves less well is the SUBTREE — the manifest's "this folder and
 * everything under it", which is an exact-prefix comparison rather than an equality. Under a
 * non-C collation a b-tree cannot range-scan that without `text_pattern_ops`, so it degrades to a
 * `user_id` scan with a filter. Accepted deliberately: the subtree read runs once per dropped
 * folder over a table sized in hundreds, and a second index for it would be a second index to
 * maintain on every insert for a query that runs when a human drags something.
 */
export const ninaAvatars = pgTable(
  'nina_avatars',
  {
    /** nanoid(12) — lib/id.ts newId(). */
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    blobUrl: text('blob_url').notNull(),
    /** `nina/<userId>/avatar-<id>.jpg` (RU-7). Phase 12 owns the exact shape. */
    pathname: text('pathname').notNull(),
    /**
     * Which album folder this photo sits in — F34 R1. `''` IS THE ROOT, not a missing value:
     * the path grammar is slash-separated segments with no leading or trailing slash, so the
     * root is the path with zero segments. `NOT NULL DEFAULT ''` is what puts every pre-F34 row
     * at the root without a backfill; see the header for why that is a default and `419167d` was
     * a script.
     */
    folder: text('folder').notNull().default(''),
    /**
     * The file's own name on the laptop, from `File.webkitRelativePath`'s last segment. NULL for
     * every row that was handed bytes rather than a file — the seed, phase 12's generations,
     * phase 14's operator uploads. See the header.
     */
    filename: text('filename'),
    /**
     * The client-computed dedupe key: `(normalised relative path, size, lastModified)` folded
     * into one string, so "have I already uploaded this?" is a string comparison and never a
     * content hash over hundreds of megabytes. NULL means this row predates the file manager, and
     * NULL is exactly what lets `nina_avatars_user_source_key_unq` be added to a populated table.
     * See the header.
     */
    sourceKey: text('source_key'),
    /** The derived grid thumbnail's Blob URL. NULL = none; a renderer falls back to `blob_url`. */
    thumbUrl: text('thumb_url'),
    /** The thumbnail's STORED Blob pathname — the only thing that lets a delete remove it too. */
    thumbPathname: text('thumb_pathname'),
    width: integer('width'),
    height: integer('height'),
    bytes: integer('bytes'),
    source: text('source').$type<NinaAvatarSource>().notNull(),
    /** Multiple of the cover fit; NULL = no transform. See the header. */
    cropScale: numeric('crop_scale', { precision: 5, scale: 3, mode: 'number' }),
    /** Per-mille of frame width, positive = right. NULL = 0. */
    cropX: integer('crop_x'),
    /** Per-mille of frame width, positive = down. NULL = 0. */
    cropY: integer('crop_y'),
    /** What the picture shows, in prose (R25). See the header for its three writers. */
    description: text('description'),
    isCurrent: boolean('is_current').notNull().default(false),
    /** NULL = she has not mentioned this one yet. See the header. */
    announcedAt: timestamp('announced_at', { withTimezone: true, mode: 'date' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t) => [
    /** Two current avatars are impossible, not unlikely. Writers: un-current first. */
    uniqueIndex('nina_avatars_user_current_unq')
      .on(t.userId)
      .where(sql`${t.isCurrent}`),
    /** The album, newest first. Kept: "every folder, newest first" puts no equality on folder. */
    index('nina_avatars_user_created_idx').on(t.userId, t.createdAt.desc()),
    /**
     * The explorer's page (F34 R1): equality on `user_id`, equality on `folder`, sort already
     * ordered — so `listNinaAvatarsInFolder` is a range scan and not a sort over the album. See
     * the header for why this does not subsume the index above.
     */
    index('nina_avatars_user_folder_created_idx').on(t.userId, t.folder, t.createdAt.desc()),
    /**
     * A double-submitted batch cannot insert twice. NULLs are DISTINCT by default, so every
     * pre-F34 row is exempt and only a row that claims a dedupe key is held to it. See the
     * header — this is the `nina_avatars_user_current_unq` argument applied to a second fact.
     */
    uniqueIndex('nina_avatars_user_source_key_unq').on(t.userId, t.sourceKey),
  ],
)

export const ninaAvatarsRelations = relations(ninaAvatars, ({ one }) => ({
  user: one(users, { fields: [ninaAvatars.userId], references: [users.id] }),
}))

/**
 * **A folder that exists on purpose.** F34 R1, and the one thing the `folder` column cannot say.
 *
 * ── WHY A SECOND SOURCE OF FOLDERS AT ALL ───────────────────────────────────────────────────
 * `nina_avatars.folder` makes a folder exist *because a photograph is in it*. That is the right
 * primary representation — it is what makes a rename one `UPDATE` instead of an O(files) copy of
 * blobs — but it cannot represent a directory you made and have not filled yet, and the operator
 * filing hundreds of photographs makes the empty folder first and drops into it second. So this
 * table holds exactly one fact: *this path is a folder, even if it is empty.*
 *
 * ── IT IS A DECLARATION, NOT AN INDEX OF THE TRUTH ──────────────────────────────────────────
 * The danger in a second source is the two disagreeing, so neither is authoritative and the read
 * that matters (`listNinaAvatarFolders`) is a UNION: a folder appears if a row is in it **or** if
 * it is declared here. That makes both directions of disagreement degrade instead of corrupt —
 * a populated folder with no declaration still appears (the photographs carry it), and a
 * declaration left behind after its photographs are gone appears as an empty folder, which is now
 * a legal state rather than a ghost. **Nothing reads this table alone**, and nothing may start:
 * a query that trusted only these rows would hide every folder created by dropping one.
 *
 * ── THE PAIR IS THE KEY, SO A DOUBLE DECLARATION IS IMPOSSIBLE ───────────────────────────────
 * `primaryKey({ columns: [userId, folder] })` — the composite-natural-key idiom `nina_nags`
 * already uses, and for the same reason: there is no second fact about a folder to hang a
 * surrogate id on, and the constraint is what lets `declareNinaFolders` be an
 * `ON CONFLICT DO NOTHING` upsert instead of a read-then-insert that is correct until two tabs
 * race. It also gives the subtree predicate an index to walk on `(user_id, folder)`.
 *
 * ── THE ROOT IS NEVER STORED ────────────────────────────────────────────────────────────────
 * `folder = ''` is the album root. It always exists, it cannot be created and it cannot be
 * deleted, so a row asserting it would be a row asserting a tautology — and the one thing worse
 * than a fact stored twice is a fact stored once *and* implied. `declareNinaFolders` drops it,
 * which is enforced there rather than by a CHECK, because the reason is a UI invariant and not a
 * data one.
 *
 * ── NO `blob_url`, NO COUNTS, NO `is_current` ───────────────────────────────────────────────
 * A folder owns no bytes and no photograph. The count the tree pane draws comes from
 * `count(*)` over `nina_avatars` at read time, never from a column here — a stored count is a
 * cache with two writers, which is the exact failure this table's header is otherwise about.
 */
export const ninaFolders = pgTable(
  'nina_folders',
  {
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** A normalised folder path, `lib/admin/filetree.ts`'s grammar. Never `''` — see the header. */
    folder: text('folder').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.folder] })],
)
export const ninaFoldersRelations = relations(ninaFolders, ({ one }) => ({
  user: one(users, { fields: [ninaFolders.userId], references: [users.id] }),
}))

/* ============================================================================
 * F35 — the character tuning. ONE ROW PER USER, and it is the only table in
 * this file whose columns are a UI's controls rather than a domain's facts.
 * ==========================================================================*/

export type NinaAvatar = typeof ninaAvatars.$inferSelect
export type NewNinaAvatar = typeof ninaAvatars.$inferInsert
export type NinaFolder = typeof ninaFolders.$inferSelect
export type NewNinaFolder = typeof ninaFolders.$inferInsert
