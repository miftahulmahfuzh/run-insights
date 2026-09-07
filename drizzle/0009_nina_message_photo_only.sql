ALTER TABLE "nina_messages" ADD COLUMN "photo_only" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
-- Backfill: every bubble that is a carrier under the pre-marker rule.
-- The rule is `role = 'nina' AND text IN (the five canned captions)`, and it is spelled out here
-- rather than imported because a migration is a historical record: this is the list as it stood on
-- 2026-09-07, and it must NOT follow later edits to lib/nina/imagefail.ts.
-- `AND EXISTS (an image row)` is a tightening the TypeScript predicate cannot afford: it takes a
-- message id from a client and answers before reading images, whereas here every row is in hand. A
-- nina message whose text happens to be `nih` and which carries no photograph is not a carrier.
UPDATE "nina_messages" m
   SET "photo_only" = true
 WHERE m."role" = 'nina'
   AND m."text" IN (
     'nih',
     'nih, puas?',
     'ini gw abis lari tadi',
     'foto gw. jangan di-zoom',
     'udah nih, jangan minta lagi'
   )
   AND EXISTS (SELECT 1 FROM "nina_message_images" i WHERE i."message_id" = m."id");
