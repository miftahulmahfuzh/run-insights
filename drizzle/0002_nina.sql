CREATE TABLE "nina_avatars" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"blob_url" text NOT NULL,
	"pathname" text NOT NULL,
	"width" integer,
	"height" integer,
	"bytes" integer,
	"source" text NOT NULL,
	"crop_scale" numeric(5, 3),
	"crop_x" integer,
	"crop_y" integer,
	"description" text,
	"is_current" boolean DEFAULT false NOT NULL,
	"announced_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "nina_memory_facts" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"category" text NOT NULL,
	"text" text NOT NULL,
	"confidence" integer DEFAULT 100 NOT NULL,
	"source" text DEFAULT 'distilled' NOT NULL,
	"source_message_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "nina_memory_slots" (
	"user_id" text NOT NULL,
	"key" text NOT NULL,
	"value" jsonb NOT NULL,
	"source" text DEFAULT 'distilled' NOT NULL,
	"source_message_id" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "nina_memory_slots_user_id_key_pk" PRIMARY KEY("user_id","key")
);
--> statement-breakpoint
CREATE TABLE "nina_message_images" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"message_id" text NOT NULL,
	"kind" text NOT NULL,
	"blob_url" text NOT NULL,
	"pathname" text NOT NULL,
	"width" integer,
	"height" integer,
	"bytes" integer,
	"description" text,
	"prompt" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "nina_messages" (
	"id" text PRIMARY KEY NOT NULL,
	"seq" bigserial NOT NULL,
	"user_id" text NOT NULL,
	"role" text NOT NULL,
	"text" text NOT NULL,
	"source" text DEFAULT 'chat' NOT NULL,
	"turn_id" text,
	"reply_to_id" text,
	"run_id" text,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	"delivered_at" timestamp with time zone,
	"read_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "nina_nags" (
	"user_id" text NOT NULL,
	"code" text NOT NULL,
	"level" integer DEFAULT 0 NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	"last_mentioned_on" date,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "nina_nags_user_id_code_pk" PRIMARY KEY("user_id","code")
);
--> statement-breakpoint
CREATE TABLE "nina_turns" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"kind" text NOT NULL,
	"trigger" text,
	"model" text NOT NULL,
	"prompt_version" integer,
	"input_tokens" integer,
	"output_tokens" integer,
	"tool_calls" text DEFAULT '' NOT NULL,
	"latency_ms" integer,
	"cost_micro_usd" integer,
	"status" text NOT NULL,
	"error_code" text,
	"args" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "push_subscriptions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"endpoint" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"user_agent" text,
	"last_success_at" timestamp with time zone,
	"last_failure_at" timestamp with time zone,
	"failure_count" integer DEFAULT 0 NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "sex" text;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "last_seen_on" date;--> statement-breakpoint
ALTER TABLE "nina_avatars" ADD CONSTRAINT "nina_avatars_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nina_memory_facts" ADD CONSTRAINT "nina_memory_facts_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nina_memory_slots" ADD CONSTRAINT "nina_memory_slots_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nina_message_images" ADD CONSTRAINT "nina_message_images_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nina_message_images" ADD CONSTRAINT "nina_message_images_message_id_nina_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."nina_messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nina_messages" ADD CONSTRAINT "nina_messages_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nina_messages" ADD CONSTRAINT "nina_messages_reply_to_id_nina_messages_id_fk" FOREIGN KEY ("reply_to_id") REFERENCES "public"."nina_messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nina_messages" ADD CONSTRAINT "nina_messages_run_id_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nina_nags" ADD CONSTRAINT "nina_nags_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nina_turns" ADD CONSTRAINT "nina_turns_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "nina_avatars_user_current_unq" ON "nina_avatars" USING btree ("user_id") WHERE "nina_avatars"."is_current";--> statement-breakpoint
CREATE INDEX "nina_avatars_user_created_idx" ON "nina_avatars" USING btree ("user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "nina_memory_facts_user_created_idx" ON "nina_memory_facts" USING btree ("user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "nina_message_images_message_idx" ON "nina_message_images" USING btree ("message_id");--> statement-breakpoint
CREATE INDEX "nina_message_images_user_created_idx" ON "nina_message_images" USING btree ("user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "nina_messages_user_seq_idx" ON "nina_messages" USING btree ("user_id","seq");--> statement-breakpoint
CREATE INDEX "nina_messages_user_unread_idx" ON "nina_messages" USING btree ("user_id","seq") WHERE "nina_messages"."read_at" is null and "nina_messages"."role" = 'nina';--> statement-breakpoint
CREATE INDEX "nina_messages_reply_to_idx" ON "nina_messages" USING btree ("reply_to_id");--> statement-breakpoint
CREATE INDEX "nina_messages_user_run_idx" ON "nina_messages" USING btree ("user_id","run_id");--> statement-breakpoint
CREATE INDEX "nina_turns_user_created_idx" ON "nina_turns" USING btree ("user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "push_subscriptions_endpoint_unq" ON "push_subscriptions" USING btree ("endpoint");--> statement-breakpoint
CREATE INDEX "push_subscriptions_user_idx" ON "push_subscriptions" USING btree ("user_id");