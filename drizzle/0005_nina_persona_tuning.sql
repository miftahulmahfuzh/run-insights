CREATE TABLE "nina_tuning" (
	"user_id" text PRIMARY KEY NOT NULL,
	"relationship" text NOT NULL,
	"anger" integer NOT NULL,
	"chill" integer NOT NULL,
	"sad" integer NOT NULL,
	"flirty" integer NOT NULL,
	"steamy" integer NOT NULL,
	"wise" integer NOT NULL,
	"annoying" integer NOT NULL,
	"funny" integer NOT NULL,
	"happy" integer NOT NULL,
	"anxious" integer NOT NULL,
	"concerned" integer NOT NULL,
	"profanity" integer NOT NULL,
	"clinginess" integer NOT NULL,
	"photo_eagerness" integer NOT NULL,
	"verbosity" integer NOT NULL,
	"wardrobe" text NOT NULL,
	"notes" text NOT NULL,
	"revision" integer NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "nina_turns" ADD COLUMN "tuning_revision" integer;--> statement-breakpoint
ALTER TABLE "nina_tuning" ADD CONSTRAINT "nina_tuning_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;