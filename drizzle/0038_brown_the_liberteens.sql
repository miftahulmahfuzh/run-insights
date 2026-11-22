ALTER TABLE "runs" ADD COLUMN "distance_estimated" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "runs" ADD COLUMN "splits_estimated" boolean DEFAULT false NOT NULL;