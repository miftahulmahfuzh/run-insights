CREATE TABLE "nina_image_prefs" (
	"user_id" text PRIMARY KEY NOT NULL,
	"prompt_length" integer NOT NULL,
	"focus_face" boolean NOT NULL,
	"focus_skin" boolean NOT NULL,
	"focus_boobs" boolean NOT NULL,
	"focus_butt" boolean NOT NULL,
	"focus_thighs" boolean NOT NULL,
	"focus_calves" boolean NOT NULL,
	"wardrobe" text NOT NULL,
	"venue" text NOT NULL,
	"time_of_day" text NOT NULL,
	"notes" text NOT NULL,
	"reference_source" text NOT NULL,
	"reference_id" text NOT NULL,
	"revision" integer NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "nina_image_prefs" ADD CONSTRAINT "nina_image_prefs_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
-- ══════════════════════════════════════════════════════════════════════════════════════════════
--  EVERYTHING BELOW THIS LINE IS HAND-WRITTEN.
--  `npm run db:generate` does not produce it and WILL SILENTLY DROP IT if this file is
--  regenerated. Diff the old file against the new one and re-append before deleting anything.
--  Same arrangement as drizzle/0009_nina_message_photo_only.sql and
--  drizzle/0010_nina_image_provenance.sql, for the same reason.
-- ══════════════════════════════════════════════════════════════════════════════════════════════
--
-- ── PHASE 1's ONE DATA STEP, HAND-APPENDED TO THE GENERATED DDL ─────────────────────────────
-- `nina_tuning.wardrobe` moves to `nina_image_prefs.wardrobe`, and phase 7 drops the old column.
-- This copy is what makes that drop RECOVERABLE and it is why it has to happen in THIS migration
-- rather than in phase 7's: on a fresh database the migrations replay in order, so this statement
-- always runs while `nina_tuning.wardrobe` still exists, and phase 7's DROP always runs after it.
-- Moving the copy later would make it a statement that reads a column an earlier-numbered
-- migration has already removed.
--
-- ONLY THE ROWS THAT HAVE A WARDROBE. A user whose wardrobe is '' gets NO row here, because "no row
-- means the defaults" (see the table header) and inserting a row of pure defaults would claim
-- `revision = 1` — that the operator saved something — for a user who never did. The copied rows
-- DO get revision 1, truthfully: he saved a wardrobe, and this is where it lives now.
--
-- EVERY OTHER VALUE IS `NINA_IMAGE_PREFS_DEFAULTS`, TRANSCRIBED. That is a copy of a TypeScript
-- constant in SQL, which the `nina_tuning` header forbids for a COLUMN DEFAULT — and this is not
-- one. A migration is history: it runs once, its literals become a fact about what happened on that
-- day, and there is nothing left for them to drift from afterwards. The only hazard is their being
-- wrong on the day it runs, and `tests/nina.imageprefs.test.ts` reads this file and asserts every
-- literal below against `NINA_IMAGE_PREFS_DEFAULTS` — so that hazard is checked rather than trusted.
--
-- `ON CONFLICT DO NOTHING` cannot fire: the table is created three statements above. It is here so
-- the statement is re-runnable by hand if it ever has to be, which is the property
-- `0004_nina_chat_sessions.sql`'s own backfill comment says it values.
INSERT INTO "nina_image_prefs" (
	"user_id",
	"prompt_length",
	"focus_face", "focus_skin", "focus_boobs", "focus_butt", "focus_thighs", "focus_calves",
	"wardrobe", "venue", "time_of_day", "notes",
	"reference_source", "reference_id",
	"revision"
)
SELECT "nina_tuning"."user_id",
       50,
       false, false, false, false, false, false,
       "nina_tuning"."wardrobe", '', '', '',
       'none', '',
       1
FROM "nina_tuning"
WHERE "nina_tuning"."wardrobe" <> ''
ON CONFLICT ("user_id") DO NOTHING;
