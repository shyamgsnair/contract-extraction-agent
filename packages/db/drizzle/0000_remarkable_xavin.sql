CREATE TABLE "contracts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL,
	"latest_run_id" uuid,
	"document_type" text,
	"customer_name" text,
	"vendor_name" text,
	"effective_date" date,
	"expiration_date" date,
	"auto_renews" boolean,
	"price_escalation" text,
	"payment_terms_days" integer,
	"minimum_commitment" text,
	"po_acceptance_days" integer,
	"po_acceptance_day_type" text,
	"po_if_no_response" text,
	"needs_review" boolean NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contracts_documentId_unique" UNIQUE("document_id")
);
--> statement-breakpoint
ALTER TABLE "contracts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"file_name" text NOT NULL,
	"sha256" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"storage_path" text NOT NULL,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "documents_sha256_unique" UNIQUE("sha256")
);
--> statement-breakpoint
ALTER TABLE "documents" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "extracted_fields" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"field" text NOT NULL,
	"value" jsonb,
	"quote" text,
	"page" integer,
	"confidence" text,
	"quote_status" text NOT NULL,
	"issues" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"note" text
);
--> statement-breakpoint
ALTER TABLE "extracted_fields" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "extraction_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL,
	"status" text NOT NULL,
	"engine" text NOT NULL,
	"model" text NOT NULL,
	"effort" text,
	"prompt_version" text NOT NULL,
	"needs_review" boolean,
	"repair_rounds" integer,
	"input_tokens" integer,
	"output_tokens" integer,
	"cache_read_tokens" integer,
	"cache_write_tokens" integer,
	"cost_usd" numeric(10, 4),
	"cost_is_equivalent" boolean,
	"issues" jsonb,
	"error" text,
	"started_at" timestamp with time zone NOT NULL,
	"duration_ms" integer
);
--> statement-breakpoint
ALTER TABLE "extraction_runs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_latest_run_id_extraction_runs_id_fk" FOREIGN KEY ("latest_run_id") REFERENCES "public"."extraction_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "extracted_fields" ADD CONSTRAINT "extracted_fields_run_id_extraction_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."extraction_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "extraction_runs" ADD CONSTRAINT "extraction_runs_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "extracted_fields_run_id_index" ON "extracted_fields" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "extraction_runs_document_id_index" ON "extraction_runs" USING btree ("document_id");