ALTER TABLE "badges" ADD COLUMN "dedupe_key" text;--> statement-breakpoint

-- Backfill. Each existing row is one award whose identity is whatever it last recorded.
UPDATE "badges" SET "dedupe_key" = coalesce("run_id", "scope_key", '');--> statement-breakpoint

ALTER TABLE "badges" ALTER COLUMN "dedupe_key" SET NOT NULL;--> statement-breakpoint

ALTER TABLE "badges" DROP CONSTRAINT "badges_user_id_key_pk";--> statement-breakpoint

ALTER TABLE "badges" ADD CONSTRAINT "badges_user_id_key_dedupe_key_pk" PRIMARY KEY("user_id","key","dedupe_key");--> statement-breakpoint

CREATE INDEX "badges_user_run_idx" ON "badges" USING btree ("user_id","run_id");
