ALTER TABLE "nina_photoshop_jobs" ADD COLUMN "crop_ratio_label" text;--> statement-breakpoint
ALTER TABLE "nina_photoshop_jobs" ADD COLUMN "crop_scale" numeric(5, 3);--> statement-breakpoint
ALTER TABLE "nina_photoshop_jobs" ADD COLUMN "crop_x" integer;--> statement-breakpoint
ALTER TABLE "nina_photoshop_jobs" ADD COLUMN "crop_y" integer;