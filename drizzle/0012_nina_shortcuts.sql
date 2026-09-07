CREATE TABLE "nina_shortcuts" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"trigger" text NOT NULL,
	"match_key" text NOT NULL,
	"kind" text NOT NULL,
	"label" text NOT NULL,
	"expansion" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"uses" integer DEFAULT 0 NOT NULL,
	"last_used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "nina_shortcuts" ADD CONSTRAINT "nina_shortcuts_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "nina_shortcuts_user_match_unq" ON "nina_shortcuts" USING btree ("user_id","match_key");--> statement-breakpoint
CREATE INDEX "nina_shortcuts_user_enabled_idx" ON "nina_shortcuts" USING btree ("user_id","enabled");