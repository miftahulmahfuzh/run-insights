ALTER TABLE "nina_tuning" ADD COLUMN "horny" integer NOT NULL DEFAULT 0;--> statement-breakpoint
ALTER TABLE "nina_tuning" ALTER COLUMN "horny" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "nina_tuning" ADD COLUMN "horny_enabled" boolean;
