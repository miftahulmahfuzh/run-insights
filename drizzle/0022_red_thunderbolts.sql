ALTER TABLE "nina_avatars" ADD COLUMN "content_hash" text;--> statement-breakpoint
ALTER TABLE "run_photos" ADD COLUMN "content_hash" text;--> statement-breakpoint
CREATE INDEX "nina_avatars_user_content_hash_idx" ON "nina_avatars" USING btree ("user_id","content_hash") WHERE "nina_avatars"."content_hash" is not null;--> statement-breakpoint
CREATE INDEX "run_photos_content_hash_idx" ON "run_photos" USING btree ("content_hash") WHERE "run_photos"."content_hash" is not null;