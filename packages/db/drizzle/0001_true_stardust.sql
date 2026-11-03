ALTER TABLE "contracts" ADD COLUMN "review_status" text DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "extracted_fields" ADD COLUMN "review_status" text DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "extracted_fields" ADD COLUMN "corrected_value" jsonb;--> statement-breakpoint
ALTER TABLE "extracted_fields" ADD COLUMN "reviewed_by" uuid;--> statement-breakpoint
ALTER TABLE "extracted_fields" ADD COLUMN "reviewed_by_email" text;--> statement-breakpoint
ALTER TABLE "extracted_fields" ADD COLUMN "reviewed_at" timestamp with time zone;