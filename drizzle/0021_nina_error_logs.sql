CREATE TABLE "nina_error_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text,
	"category" text NOT NULL,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"full_input" text NOT NULL,
	"error_message" text NOT NULL,
	"timeout_ms" integer,
	"image_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "nina_error_logs" ADD CONSTRAINT "nina_error_logs_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "nina_error_logs_category_created_idx" ON "nina_error_logs" USING btree ("category","created_at" DESC NULLS LAST);