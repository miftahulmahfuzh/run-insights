CREATE TABLE "nina_folders" (
	"user_id" text NOT NULL,
	"folder" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "nina_folders_user_id_folder_pk" PRIMARY KEY("user_id","folder")
);
--> statement-breakpoint
ALTER TABLE "nina_avatars" ADD COLUMN "folder" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "nina_avatars" ADD COLUMN "filename" text;--> statement-breakpoint
ALTER TABLE "nina_avatars" ADD COLUMN "source_key" text;--> statement-breakpoint
ALTER TABLE "nina_avatars" ADD COLUMN "thumb_url" text;--> statement-breakpoint
ALTER TABLE "nina_avatars" ADD COLUMN "thumb_pathname" text;--> statement-breakpoint
ALTER TABLE "nina_folders" ADD CONSTRAINT "nina_folders_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "nina_avatars_user_folder_created_idx" ON "nina_avatars" USING btree ("user_id","folder","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "nina_avatars_user_source_key_unq" ON "nina_avatars" USING btree ("user_id","source_key");