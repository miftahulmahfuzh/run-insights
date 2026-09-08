ALTER TABLE "nina_message_images" DROP CONSTRAINT "nina_message_images_message_id_nina_messages_id_fk";
--> statement-breakpoint
ALTER TABLE "nina_message_images" ALTER COLUMN "message_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "nina_message_images" ADD CONSTRAINT "nina_message_images_message_id_nina_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."nina_messages"("id") ON DELETE set null ON UPDATE no action;