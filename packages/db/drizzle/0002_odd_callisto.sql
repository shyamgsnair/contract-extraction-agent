CREATE TABLE "run_log_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"seq" integer NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"round" integer NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"text" text,
	"data" jsonb,
	"ok" boolean
);
--> statement-breakpoint
ALTER TABLE "run_log_entries" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "run_log_entries" ADD CONSTRAINT "run_log_entries_run_id_extraction_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."extraction_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "run_log_entries_run_id_seq_index" ON "run_log_entries" USING btree ("run_id","seq");