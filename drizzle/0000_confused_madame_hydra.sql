CREATE TABLE "account" (
	"userId" text NOT NULL,
	"type" text NOT NULL,
	"provider" text NOT NULL,
	"providerAccountId" text NOT NULL,
	"refresh_token" text,
	"access_token" text,
	"expires_at" integer,
	"token_type" text,
	"scope" text,
	"id_token" text,
	"session_state" text,
	CONSTRAINT "account_provider_providerAccountId_pk" PRIMARY KEY("provider","providerAccountId")
);
--> statement-breakpoint
CREATE TABLE "badges" (
	"user_id" text NOT NULL,
	"key" text NOT NULL,
	"run_id" text,
	"scope_key" text,
	"earned_on" date NOT NULL,
	"count" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "badges_user_id_key_pk" PRIMARY KEY("user_id","key")
);
--> statement-breakpoint
CREATE TABLE "extractions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"blob_urls" jsonb NOT NULL,
	"model" text NOT NULL,
	"prompt_tokens" integer,
	"raw_response" jsonb,
	"status" text NOT NULL,
	"error_code" text,
	"corrections" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "insights" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"scope" text NOT NULL,
	"scope_key" text NOT NULL,
	"facts_hash" text NOT NULL,
	"payload" jsonb NOT NULL,
	"model" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"user_id" text PRIMARY KEY NOT NULL,
	"birth_year" integer,
	"height_cm" integer,
	"weight_kg" numeric(4, 1),
	"resting_hr" integer,
	"max_hr" integer,
	"onboarded_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "records" (
	"user_id" text NOT NULL,
	"key" text NOT NULL,
	"run_id" text NOT NULL,
	"value" integer NOT NULL,
	"achieved_on" date NOT NULL,
	"previous_value" integer,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "records_user_id_key_pk" PRIMARY KEY("user_id","key")
);
--> statement-breakpoint
CREATE TABLE "run_photos" (
	"id" text PRIMARY KEY NOT NULL,
	"extraction_id" text NOT NULL,
	"run_id" text,
	"blob_url" text NOT NULL,
	"pathname" text NOT NULL,
	"kind" text NOT NULL,
	"width" integer,
	"height" integer,
	"bytes" integer,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"excluded_from_share" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "run_splits" (
	"run_id" text NOT NULL,
	"km" integer NOT NULL,
	"time_sec" integer NOT NULL,
	"pace_sec" integer NOT NULL,
	"hr" integer,
	"cadence" integer,
	"partial" boolean DEFAULT false NOT NULL,
	CONSTRAINT "run_splits_run_id_km_pk" PRIMARY KEY("run_id","km")
);
--> statement-breakpoint
CREATE TABLE "run_zones" (
	"run_id" text NOT NULL,
	"zone" integer NOT NULL,
	"duration_sec" integer NOT NULL,
	"min_bpm" integer,
	"max_bpm" integer,
	CONSTRAINT "run_zones_run_id_zone_pk" PRIMARY KEY("run_id","zone")
);
--> statement-breakpoint
CREATE TABLE "runs" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"occurred_on" date NOT NULL,
	"started_at" time,
	"ended_at" time,
	"activity_type" text DEFAULT 'Outdoor Run' NOT NULL,
	"location" text,
	"duration_sec" integer NOT NULL,
	"distance_m" integer NOT NULL,
	"active_kcal" integer,
	"total_kcal" integer,
	"elevation_m" integer,
	"avg_cadence" integer,
	"avg_pace_sec" integer NOT NULL,
	"avg_hr" integer,
	"max_hr" integer,
	"resting_hr" integer,
	"intent" text,
	"end_hr_bpm" integer,
	"hr_1min_post_bpm" integer,
	"note" text,
	"source" text NOT NULL,
	"extraction_id" text,
	"reviewed_at" timestamp with time zone,
	"corrected_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"sessionToken" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"expires" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shares" (
	"token" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"run_id" text NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text,
	"email" text,
	"emailVerified" timestamp,
	"image" text,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verificationToken" (
	"identifier" text NOT NULL,
	"token" text NOT NULL,
	"expires" timestamp NOT NULL,
	CONSTRAINT "verificationToken_identifier_token_pk" PRIMARY KEY("identifier","token")
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "badges" ADD CONSTRAINT "badges_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "badges" ADD CONSTRAINT "badges_run_id_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "extractions" ADD CONSTRAINT "extractions_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "insights" ADD CONSTRAINT "insights_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "records" ADD CONSTRAINT "records_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "records" ADD CONSTRAINT "records_run_id_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "run_photos" ADD CONSTRAINT "run_photos_extraction_id_extractions_id_fk" FOREIGN KEY ("extraction_id") REFERENCES "public"."extractions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "run_photos" ADD CONSTRAINT "run_photos_run_id_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "run_splits" ADD CONSTRAINT "run_splits_run_id_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "run_zones" ADD CONSTRAINT "run_zones_run_id_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runs" ADD CONSTRAINT "runs_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runs" ADD CONSTRAINT "runs_extraction_id_extractions_id_fk" FOREIGN KEY ("extraction_id") REFERENCES "public"."extractions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shares" ADD CONSTRAINT "shares_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shares" ADD CONSTRAINT "shares_run_id_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "extractions_user_created_idx" ON "extractions" USING btree ("user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "insights_user_scope_key_hash_unq" ON "insights" USING btree ("user_id","scope","scope_key","facts_hash");--> statement-breakpoint
CREATE INDEX "insights_latest_idx" ON "insights" USING btree ("user_id","scope","scope_key","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "run_photos_extraction_idx" ON "run_photos" USING btree ("extraction_id");--> statement-breakpoint
CREATE INDEX "run_photos_run_idx" ON "run_photos" USING btree ("run_id");--> statement-breakpoint
CREATE UNIQUE INDEX "runs_user_occurred_started_unq" ON "runs" USING btree ("user_id","occurred_on",coalesce("started_at", '00:00:00'::time));--> statement-breakpoint
CREATE INDEX "runs_user_occurred_idx" ON "runs" USING btree ("user_id","occurred_on" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "runs_user_maxhr_idx" ON "runs" USING btree ("user_id","max_hr" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "shares_run_id_active_unq" ON "shares" USING btree ("run_id") WHERE "shares"."revoked_at" is null;