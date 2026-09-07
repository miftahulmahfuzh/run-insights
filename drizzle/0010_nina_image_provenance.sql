ALTER TABLE "nina_message_images" ADD COLUMN "source_avatar_id" text;--> statement-breakpoint
ALTER TABLE "nina_message_images" ADD COLUMN "source_image_id" text;--> statement-breakpoint
ALTER TABLE "nina_message_images" ADD CONSTRAINT "nina_message_images_source_avatar_id_nina_avatars_id_fk" FOREIGN KEY ("source_avatar_id") REFERENCES "public"."nina_avatars"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nina_message_images" ADD CONSTRAINT "nina_message_images_source_image_id_nina_message_images_id_fk" FOREIGN KEY ("source_image_id") REFERENCES "public"."nina_message_images"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
-- ══════════════════════════════════════════════════════════════════════════════════════════════
--  EVERYTHING BELOW THIS LINE IS HAND-WRITTEN.
--  `npm run db:generate` does not produce it and WILL SILENTLY DROP IT if this file is
--  regenerated. Diff the old file against the new one and re-append before deleting anything.
--  Same arrangement as drizzle/0009_nina_message_photo_only.sql, for the same reason.
-- ══════════════════════════════════════════════════════════════════════════════════════════════
--
-- Backfill 1 of 2 — R1: the duplicate chat photographs production already has.
--
-- The rule is spelled out here rather than imported, on 0009's precedent: a migration is a
-- HISTORICAL RECORD. This is the rule as it stood on 2026-09-07 and it must NOT follow later
-- edits to `resolveAttachment` in lib/nina/actions.ts.
--
-- "Duplicate" is an equal `blob_url` inside one `user_id`, because that is the one thing only the
-- attach path can produce. Two separate uploads of the same photograph write two Blob objects and
-- two URLs and are two photographs as far as anything can tell — the plan's Scope rules the
-- upload path out in as many words. A re-attach is the only writer that REUSES a URL, so an equal
-- URL inside one account is a re-attach.
--
-- The EARLIEST row wins as the original: `ORDER BY created_at ASC, id ASC`. `id` is the final
-- tiebreak because `created_at` ties for rows written in one statement, which is the same reason
-- `listNinaMessageImages` carries `id` in its own ORDER BY.
--
-- Every later row points at THAT row rather than at its immediate predecessor, so the column
-- names the ORIGINAL and not a chain. `resolveAttachment` flattens the same way
-- (`source_image_id ?? row.id`), so a row backfilled here and a row written tomorrow mean the
-- same thing.
--
-- The `IS NULL` guard makes the statement idempotent. On a fresh column it is a no-op; it is here
-- so that running this by hand a second time cannot move a pointer that has since been set.
UPDATE "nina_message_images" AS i
   SET "source_image_id" = f."first_id"
  FROM (
         SELECT DISTINCT ON ("user_id", "blob_url")
                "user_id", "blob_url", "id" AS "first_id"
           FROM "nina_message_images"
          ORDER BY "user_id", "blob_url", "created_at" ASC, "id" ASC
       ) AS f
 WHERE i."user_id" = f."user_id"
   AND i."blob_url" = f."blob_url"
   AND i."id" <> f."first_id"
   AND i."source_image_id" IS NULL;
--> statement-breakpoint
-- Backfill 2 of 2 — R3: an album face that was attached into the chat.
--
-- There is NO "not the earliest" clause here, and that is the requirement rather than an
-- omission. The FIRST chat row whose bytes are an album face is ALREADY a reference, because the
-- photograph was never a chat photograph to begin with. That row is precisely what the user is
-- looking at: "existing photos in Nina profpic album being added into Media as well".
--
-- `DISTINCT ON` over `nina_avatars` as well, and that is not symmetry. Nothing stops two album
-- rows sharing one `blob_url` — `nina_avatars_user_source_key_unq` is unique on `source_key`, not
-- on the URL, and the profpic re-seed writes a fresh row for an anchor that is already stored.
-- An `UPDATE ... FROM` whose subquery matches a target row twice picks one arbitrarily; with
-- `DISTINCT ON` the earliest album row wins, every time this statement is run.
--
-- Both columns can end up non-null on one row — an album face re-attached twice. That is not a
-- conflict: a reference is "either column non-null" (the plan's Decisions table), and two true
-- facts about where the bytes came from are better than one. It is also what keeps the album face
-- out of Media even if the intermediate chat row is later deleted and `source_image_id` goes NULL.
UPDATE "nina_message_images" AS i
   SET "source_avatar_id" = a."avatar_id"
  FROM (
         SELECT DISTINCT ON ("user_id", "blob_url")
                "user_id", "blob_url", "id" AS "avatar_id"
           FROM "nina_avatars"
          ORDER BY "user_id", "blob_url", "created_at" ASC, "id" ASC
       ) AS a
 WHERE i."user_id" = a."user_id"
   AND i."blob_url" = a."blob_url"
   AND i."source_avatar_id" IS NULL;
