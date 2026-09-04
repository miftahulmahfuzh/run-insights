CREATE TABLE "nina_chat_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"title" text,
	"title_source" text,
	"pinned_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "nina_messages" ADD COLUMN "session_id" text;--> statement-breakpoint
ALTER TABLE "nina_chat_sessions" ADD CONSTRAINT "nina_chat_sessions_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "nina_chat_sessions_user_created_idx" ON "nina_chat_sessions" USING btree ("user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
-- F35 phase 1 backfill, hand-written: one session per user who has any message, its created_at set
-- to the first thing he ever said, so it sorts and reads as the old thing it is. The id is
-- substr(md5(user_id), 1, 12): 12 characters that satisfy lib/id.ts's ID_RE, so isValidId accepts
-- it in a ?s= parameter, and deterministic so the UPDATE below can recompute it without a join.
-- Deliberately NO "ON CONFLICT DO NOTHING": on an md5-prefix collision between two users, DO
-- NOTHING would file the second user's messages into the FIRST user's session, where removing that
-- session would cascade away a stranger's conversation. A unique violation aborts the migration
-- instead, and a failed migration is recoverable where a merged conversation is not.
INSERT INTO "nina_chat_sessions" ("id", "user_id", "title", "title_source", "created_at")
SELECT substr(md5("nina_messages"."user_id"), 1, 12),
       "nina_messages"."user_id",
       'Semua chat sebelumnya',
       'backfill',
       min("nina_messages"."sent_at")
FROM "nina_messages"
GROUP BY "nina_messages"."user_id";--> statement-breakpoint
-- No ORDER BY, and none is needed: every one of a user's rows goes into the same session and `seq`
-- is untouched, so "WHERE session_id = X ORDER BY seq" returns exactly the sequence the screen
-- renders today. The IS NULL guard makes this statement re-runnable by hand if it ever has to be.
UPDATE "nina_messages" SET "session_id" = substr(md5("user_id"), 1, 12) WHERE "session_id" IS NULL;--> statement-breakpoint
-- Now, and only now, the column can promise what the schema says it promises.
ALTER TABLE "nina_messages" ALTER COLUMN "session_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "nina_messages" ADD CONSTRAINT "nina_messages_session_id_nina_chat_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."nina_chat_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "nina_messages_session_seq_idx" ON "nina_messages" USING btree ("session_id","seq");--> statement-breakpoint
CREATE INDEX "nina_messages_user_session_runner_idx" ON "nina_messages" USING btree ("user_id","session_id","sent_at") WHERE "nina_messages"."role" = 'runner';
