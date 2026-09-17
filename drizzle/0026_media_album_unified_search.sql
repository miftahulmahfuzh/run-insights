-- media-album-unified-search phases 1-4, R1/R2/R3. Additive only: four NULLABLE columns, one
-- foreign key, two indexes. No DROP, no SET NOT NULL, no backfill, no data rewrite.
--
-- Nullable is the entire migration story, three times over. `nina_message_images` gains the album's
-- three search columns (`search_keywords`, `negative_search_keywords`, `description_embedding`):
-- all 154 existing rows read NULL, Postgres adds a nullable column without rewriting the table, and
-- NULL is a legal state forever — an unembedded photograph is simply not in the search index. The
-- HNSW build is instant for the same reason 0023's was: pgvector does not index NULLs, so there is
-- nothing to build over. Filling those embeddings is a separate, deliberately-run entry point.
--
-- `nina_avatars.source_image_id` is the pointer R3 asked for — "the image in Album is just a
-- pointer to the real file in Media". NULL on every existing row means "these bytes are this row's
-- own", which is true of all 70 of them, including the 18 `source_key LIKE 'chat-photo:%'` rows
-- that were COPIED before this change and deliberately stay ordinary copies (plan index, Scope).
--
-- ON DELETE RESTRICT and not SET NULL or CASCADE: a pointer row owns no bytes and no prose, so
-- demoting it to an original is not available and losing it silently is the thing R3 forbids.
-- Deleting a Media original an Album pointer still names is REFUSED, by the database, and phase 2's
-- action turns that refusal into a sentence before the constraint has to.
--
-- BEFORE RUNNING: check `git log origin/main -- drizzle/` for a migration numbered 0026 that landed
-- while this branch was in flight. If one has, REGENERATE from the merged schema — never renumber
-- this file by hand. `drizzle/0023_dry_kabuki.sql`'s own header records that exact repair, and
-- `scripts/check-schema-drift.mjs` explains why a renamed file strands itself below the ledger
-- watermark permanently.
ALTER TABLE "nina_message_images" ADD COLUMN "search_keywords" text;--> statement-breakpoint
ALTER TABLE "nina_message_images" ADD COLUMN "negative_search_keywords" text;--> statement-breakpoint
ALTER TABLE "nina_message_images" ADD COLUMN "description_embedding" vector(1536);--> statement-breakpoint
ALTER TABLE "nina_avatars" ADD COLUMN "source_image_id" text;--> statement-breakpoint
ALTER TABLE "nina_avatars" ADD CONSTRAINT "nina_avatars_source_image_id_nina_message_images_id_fk" FOREIGN KEY ("source_image_id") REFERENCES "public"."nina_message_images"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "nina_message_images_description_embedding_hnsw_idx" ON "nina_message_images" USING hnsw ("description_embedding" vector_cosine_ops);--> statement-breakpoint
CREATE INDEX "nina_avatars_source_image_id_idx" ON "nina_avatars" USING btree ("source_image_id");