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
  vector,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core'
import { users } from '../auth'
import { ninaMessageImages } from './chat'
import { NINA_EMBEDDING_DIMENSIONS } from './embedding'

/**
 * Re-exported, not re-declared: `@/lib/db/schema`'s `export * from './schema/nina/avatars'` has
 * been this constant's public path since 2026-09-15 and every consumer imports it from there.
 * It now LIVES in `./embedding` — see that module's header for the cycle this separation defuses.
 */
export { NINA_EMBEDDING_DIMENSIONS }

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
 *
 * ── `description_embedding` (2026-09-15, the album's semantic search) ─────────────────────────
 * The vector form of `description` above, and the ONLY thing the album's search ranks by. Text
 * queries and image queries both become a vector in the SAME space — an image query is captioned
 * by the existing `glm-4.6v` describe pass first and then embedded as text, so there is one
 * column and not two, and a combined text+image score is a weighted average of two comparable
 * cosine similarities rather than a rank fusion of two incomparable ones.
 *
 * Nullable, derived, and never authoritative: `description` remains the single source of truth
 * that Nina's prompt reads, and this column is a read-only-by-search projection of it. See the
 * column's own note for why NULL is a legal state forever, and `NINA_EMBEDDING_DIMENSIONS` in
 * `./embedding` for why the width cannot change without a re-embed.
 *
 * ── `search_keywords` (2026-09-15, nina-album-search-relevance-tools R2) ─────────────────────
 * A SECOND relevance signal, written by hand: comma-separated free-text phrases the operator adds
 * when a photograph keeps surfacing for the wrong query, or keeps not surfacing for the right one.
 * The user's own example is the whole specification — *"search_keywords (contoh value string:
 * 'tete', 'putih')"* — so it is free text of the same kind as `description`, in a form a human
 * types, and nothing here parses it into phrases. The column stores what was typed.
 *
 * **It is an INPUT to `description_embedding`, never a second thing to rank by.** There is no
 * exact-match path, no keyword boost and no second vector: `embedNinaAvatarDescription`
 * (`lib/admin/ninaAlbumDeferredDescribe.ts`) builds `description`, or
 * `description + "\n\nKeywords: " + search_keywords`, and embeds THAT. One column, one space, one
 * score — the same argument `description_embedding` above makes for captioning an image query into
 * the text space rather than keeping two incomparable rankings.
 *
 * **The two columns are independent writers of one derived column, and that is the invariant.**
 * `description` is rewritten by the vision model and by hand; `search_keywords` is only ever
 * written by hand. A re-describe must NOT touch it — it is the operator's correction of the
 * model's opinion, and a model pass that erased it would erase the correction every time it was
 * needed. What both writers share is the obligation `setNinaAvatarDescriptionAndEmbedding`'s
 * docstring already states for prose: whichever of them changes, the vector changes in the SAME
 * UPDATE, so there is no window in which the row is a lie.
 *
 * Nullable, no default, no backfill, no index — the `source_key` argument applied to a third
 * fact. Every existing row carries NULL, NULL means "no keywords" forever, and a NULL keyword
 * makes the combined text exactly the description, so every already-computed vector stays
 * numerically correct. The one-off backfill re-embeds them anyway, to prove the path is uniform
 * rather than to change a number.
 *
 * ── `source_image_id` (2026-09-17, media-album-unified-search R3) ────────────────────────────
 * **A row with this set is a POINTER at a Media original, not a photograph of its own.** NULL is
 * the value every album row written before today carries and the value every ordinary upload will
 * go on carrying — "these bytes are this row's own". Non-null names the `nina_message_images` row
 * whose Blob object this row RENDERS and whose prose this row BORROWS.
 *
 * The user's words are the specification: *"if admin set a picture from Media, we wouldn't copy
 * paste a new duplicate image into Album directory … the image in Album is just a pointer to the
 * real file in Media … editing image description, search keyword, negative keyword in one place
 * will automatically synchronize it with other location."* That last clause is why this is a
 * pointer and not a copied row with a provenance note bolted on: **a pointer row stores no
 * `description`, no `search_keywords`, no `negative_search_keywords` and no
 * `description_embedding` of its own — all four stay NULL forever.** "Synchronised" is then not a
 * mechanism that can drift; it is the absence of a second place to store the fact. The reads and
 * writes that redirect a pointer row's four fields to its linked row are the next phase's work.
 * **Nothing in THIS phase writes this column** — the same posture `description_embedding` above
 * took when it was declared.
 *
 * ── `ON DELETE RESTRICT`, AND IT IS THE ONLY ONE OF THE THREE THAT IS HONEST ─────────────────
 * The plan index's Decisions row, verbatim: *"`ON DELETE RESTRICT` — refuse the delete with an
 * actionable message, mirroring `deleteNinaAvatar`'s existing 'can't delete the current avatar'
 * refusal shape. `SET NULL` would produce a pointer row with no bytes (unrecoverable without
 * re-copying, defeating R3); `CASCADE` risks silently losing the 'current profile picture'
 * designation."* So deleting a Media original that an Album pointer still names is REFUSED — not
 * cascaded, not silently orphaned — and the refusal is a database constraint rather than a
 * check somebody has to remember to write, for `nina_avatars_user_current_unq`'s stated reason:
 * the alternative is a read-then-compare that is correct until two writers race.
 *
 * This is the first `restrict` in the schema, and it is deliberately the opposite call from
 * `nina_message_images.message_id`'s `SET NULL` one table over. The two are not inconsistent:
 * there, blocking a session delete with its photographs would turn one bug into a worse one, and
 * a chat photo that loses its bubble is still a whole photograph. Here the dependent row has
 * NOTHING of its own — no bytes, no prose — so demoting it to an original is not available and
 * losing it silently is the thing R3 was asked for.
 *
 * ── IT IS NOT `nina_message_images.source_image_id`, DESPITE THE NAME ────────────────────────
 * That column (F37, `lib/db/schema/nina/chat.ts`) is a CHAT row pointing at an earlier CHAT row
 * whose bytes it re-shows; its sibling `source_avatar_id` is a chat row pointing at an album row.
 * Different table, opposite direction, different lifecycle (`SET NULL`, because there the copy can
 * honestly become an original). The shared spelling is the schema's one provenance-FK idiom used
 * twice, and a reader who conflates them will write a query that answers the wrong question. The
 * one thing they DO share is `isOriginalPhoto()`'s convention — a row that borrows its bytes is
 * excluded from collection listings and from search, and this column extends that convention to
 * the album arm (see the plan index's dedup Decision).
 *
 * ── THE REFUSAL ABOVE IS STILL THE CONSTRAINT'S JOB, NOT THE APP'S ANYMORE (2026-09-19) ─────
 * `removeChatPhotoAction` (`lib/admin/chatPhotoActions.ts`) no longer surfaces this as a refusal:
 * it deletes the pointer rows itself first — promoting a successor current avatar when one of them
 * held that title — so the constraint above never actually fires from that path. `ON DELETE
 * RESTRICT` stays exactly as argued: it is still the backstop for any OTHER writer that deletes a
 * `nina_message_images` row without doing that cascade first, and "silently" is what the app-level
 * successor promotion now specifically avoids that a bare `CASCADE` here still would not.
 *

 * ── THE INDEX IS NOT UNIQUE, AND THAT IS A DECISION ──────────────────────────────────────────
 * `nina_avatars_source_image_id_idx` is a plain btree. No stated invariant forbids two album rows
 * naming one media original — in practice the promotion action reuses the existing pointer, so
 * only one exists at a time, but that is the action's behaviour and not a fact the schema was
 * asked to enforce. A unique index here would be inventing a constraint nobody stated, and it
 * would turn a future "the same photo, filed in two folders" into a thrown INSERT.
 * `nina_avatars_user_content_hash_idx` two entries down makes exactly this argument for exactly
 * this reason.
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
    /**
     * **Hand-written search phrases, comma-separated** — R2, 2026-09-15. `"tete, putih"`.
     *
     * NULL means the operator has not tagged this photograph, and it is the value every row
     * written before today carries. NOT a second ranking column: it is folded into the text that
     * becomes `description_embedding` (`buildNinaAvatarEmbedText`, `lib/nina/avatarEmbedText.ts`),
     * and nothing in the app SELECTs it to compare against a query. See the header.
     *
     * Bounded by `ADMIN_AVATAR_MAX_SEARCH_KEYWORDS_CHARS` at the boundary rather than by the
     * column, exactly as `description` is — a `text` column with a Zod bound in front of it is
     * this repo's shape for prose a human types.
     */
    searchKeywords: text('search_keywords'),
    /**
     * **Hand-written EXCLUSION phrases, comma-separated** — `nina-album-search-relevance-tools`
     * R2 follow-up, 2026-09-15. `"tete"`.
     *
     * The mirror image of `search_keywords` above rather than a second flavour of it: that column
     * is an INPUT to `description_embedding` (folded into the vector, ranked by cosine similarity
     * like everything else); this one is READ, alone, by the ranker itself, and never touches the
     * vector. A row whose `description` sits in the wrong semantic neighbourhood for one query
     * term — the horse-photo bodysuit description that scores 0.22 against `"tete"` with no such
     * word anywhere in its prose, the case this column was built for — has no way to be pulled
     * back out of that neighbourhood by rewriting prose the operator agrees is accurate. This
     * column names the query word the photo should never answer to, instead.
     *
     * NULL means no exclusion is configured, which is the value every row carries until an
     * operator adds one by hand — same nullable-additive shape `search_keywords` argues for
     * itself. Matched WHOLE-WORD and case-insensititive against the operator's typed query text
     * (`searchNinaAvatarsByText`'s `queryText` argument); a comma splits multiple phrases. See
     * `lib/nina/queries/avatarsearch.ts`'s `matchesNegativeKeyword` for the match itself.
     *
     * Bounded by `ADMIN_AVATAR_MAX_NEGATIVE_SEARCH_KEYWORDS_CHARS`, the same way `search_keywords`
     * is bounded at the boundary and not the column.
     */
    negativeSearchKeywords: text('negative_search_keywords'),
    /**
     * **`description`, as a vector** — the album's semantic search ranks against this and nothing
     * else (2026-09-15). Derived, read-only-by-search, and never a second source of truth: the
     * prose in `description` above stays the one thing Nina's prompt reads.
     *
     * NULLABLE, and nullable is the entire migration story — the same argument `source_key` makes
     * in the header. Every row in the album today has no embedding, most have no `description`
     * either, and an `ADD COLUMN` of a nullable vector rewrites nothing and backfills nothing.
     * NULL means "not embedded yet", it is the value every pre-search row carries, and it is a
     * legal state forever: a photo whose describe pass failed is simply not in the search index.
     * A cosine-distance predicate skips NULL rows on its own, and the HNSW index below does not
     * index them, so "unsearchable" costs nothing at read time.
     *
     * **Nothing in THIS phase writes it.** The write sites — the deferred describe pass, the three
     * other `description` writers, and the one-time backfill — are the next phase's, and the
     * invariant they must keep is that every path that writes `description` writes this in the
     * same step. A row with a description and a NULL embedding is invisible to search while
     * looking perfectly healthy in the explorer, which is the one failure mode here that has no
     * symptom.
     */
    descriptionEmbedding: vector('description_embedding', {
      dimensions: NINA_EMBEDDING_DIMENSIONS,
    }),
    /**
     * **The Media original this album row POINTS AT — media-album-unified-search R3, 2026-09-17.**
     *
     * NULL means this row owns its bytes and its prose, which is every row written before today
     * and every ordinary upload after it. Non-null means it borrows both: the Blob object is the
     * linked `nina_message_images` row's, and `description` / `search_keywords` /
     * `negative_search_keywords` / `description_embedding` on THIS row stay NULL forever because
     * the linked row is the only place that data lives.
     *
     * `ON DELETE RESTRICT`: deleting the Media original while this pointer names it is refused,
     * not cascaded and not silently orphaned. `AnyPgColumn` is what lets this compile across the
     * `./avatars` ⇄ `./chat` cycle, the same escape `nina_messages.reply_to_id` uses for its own
     * self-reference; see `./embedding`'s header for why the cycle carries no eager edge. The
     * full argument — including why this column is NOT `nina_message_images.source_image_id`
     * despite the name — is in the table header.
     */
    sourceImageId: text('source_image_id').references((): AnyPgColumn => ninaMessageImages.id, {
      onDelete: 'restrict',
    }),
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
    /**
     * **The cosine-similarity index, and it is insurance rather than a requirement.**
     *
     * An album of hundreds of rows would rank fine on a sequential scan — a few hundred
     * 1536-float dot products is sub-millisecond, and `nina_avatars` is per-user and small.
     * The index is here because it is free to declare now and costs a migration later, and
     * because the F34 header's own premise is "hundreds of profile pics" growing.
     *
     * `vector_cosine_ops`, matching the `<=>` operator the search query uses. An HNSW index built
     * for one operator class does not serve another: an `l2` index and a cosine query silently
     * fall back to a seq scan, which is correct and slow — the worst kind of wrong, because
     * nothing reports it. One operator class, named at both ends.
     *
     * NOT partial. `WHERE description_embedding IS NOT NULL` would be redundant — pgvector's HNSW
     * does not index NULL rows anyway — and a partial index is one more predicate the planner has
     * to prove a query matches before it can use it.
     */
    index('nina_avatars_description_embedding_hnsw_idx').using(
      'hnsw',
      t.descriptionEmbedding.op('vector_cosine_ops'),
    ),
    /**
     * **"Is any album row pointing at THIS media row?"** — two readers, one index.
     *
     * Postgres does not index the REFERENCING side of a foreign key, and `ON DELETE RESTRICT`
     * makes the database ask that question on EVERY `nina_message_images` delete. Without this
     * index each one sequentially scans the album. That is `nina_messages_session_seq_idx`'s
     * second job, one table over, for the same structural reason. The next phase's
     * `removeChatPhotoAction` guard asks the same question in SQL before the delete, so it can
     * refuse with a sentence instead of a constraint violation.
     *
     * Plain btree and NOT unique — see the header: nothing states that one media original may be
     * pointed at by only one album row, and a unique index would be a constraint nobody asked
     * for. Not partial either: the NULL rows are the overwhelming majority today, but a partial
     * index is one more predicate the planner has to prove a query matches, and the FK's own
     * lookup is generated by Postgres rather than written here, so it cannot be relied on to
     * carry a matching `IS NOT NULL`.
     */
    index('nina_avatars_source_image_id_idx').on(t.sourceImageId),
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
