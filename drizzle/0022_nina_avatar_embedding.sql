-- The 2026-09-15 album semantic search. Additive only: one NULLABLE vector column and its
-- cosine index. Nothing is backfilled here — every existing row keeps a NULL embedding, which
-- is a legal state forever (an unembedded photo is simply not in the search index), and the
-- backfill is its own deliberately-run entry point in the next phase.
--
-- CREATE EXTENSION is hand-written: drizzle-kit emits the column and the index and assumes the
-- extension exists. Neon ships pgvector and `neondb_owner` may create it. IF NOT EXISTS so a
-- re-run, or a database where someone already enabled it, is a no-op rather than an error.
--
-- The HNSW build is instant here because every row is NULL — pgvector does not index NULLs, so
-- there is nothing to build over. This is the cheapest moment this index will ever cost.
CREATE EXTENSION IF NOT EXISTS vector;--> statement-breakpoint
ALTER TABLE "nina_avatars" ADD COLUMN "description_embedding" vector(1536);--> statement-breakpoint
CREATE INDEX "nina_avatars_description_embedding_hnsw_idx" ON "nina_avatars" USING hnsw ("description_embedding" vector_cosine_ops);
