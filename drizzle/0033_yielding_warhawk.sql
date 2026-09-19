CREATE TABLE "nina_photoshop_jobs" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"source_kind" text NOT NULL,
	"source_id" text NOT NULL,
	"source_content_hash" text,
	"mode" text NOT NULL,
	"model" text NOT NULL,
	"preset_key" text,
	"prompt_text" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"error_code" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"cost_micro_usd" integer,
	"result_blob_url" text,
	"result_pathname" text,
	"result_content_hash" text,
	"result_width" integer,
	"result_height" integer,
	"result_bytes" integer,
	"resolved_action" text,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "nina_photoshop_jobs" ADD CONSTRAINT "nina_photoshop_jobs_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "nina_photoshop_jobs_user_created_idx" ON "nina_photoshop_jobs" USING btree ("user_id","created_at" DESC NULLS LAST);