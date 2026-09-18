CREATE TABLE "nina_image_field_history" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"field" text NOT NULL,
	"value" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "nina_image_field_history" ADD CONSTRAINT "nina_image_field_history_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "nina_image_field_history_user_field_created_idx" ON "nina_image_field_history" USING btree ("user_id","field","created_at" DESC NULLS LAST);