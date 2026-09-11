-- The 2026-09-10 image-generation controls: the editable prompt template, the image-model
-- dropdown, and the app_settings store the text-model dropdown writes. Additive only.
-- The two ADD COLUMNs carry DEFAULTs because nina_image_prefs already has a row and a bare
-- NOT NULL would refuse it; the schema files spell no default (every writer sends the whole
-- row), so these clauses exist for the existing row and stay as harmless backstops.
CREATE TABLE "app_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "nina_image_prefs" ADD COLUMN "prompt_template" text NOT NULL DEFAULT '';--> statement-breakpoint
ALTER TABLE "nina_image_prefs" ADD COLUMN "model" text NOT NULL DEFAULT 'qwen/qwen-image-3-pro';