// Prints what is saved in Supabase: row counts, contracts, runs, sample price evidence and row-level security status.
// Usage: pnpm db:summary

import { sql, type SQL } from "drizzle-orm";
import { createDb } from "./index.ts";

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set. Add it to .env at the repo root (see .env.example).");
  process.exit(1);
}

const { db, close } = createDb(process.env.DATABASE_URL);
const show = async (title: string, query: SQL) => {
  console.log(`\n${title}`);
  console.table(await db.execute(query));
};

try {
  await show("Row counts", sql`
    select (select count(*) from documents) as documents, (select count(*) from extraction_runs) as runs,
           (select count(*) from contracts) as contracts, (select count(*) from extracted_fields) as fields`);
  await show("Contracts", sql`
    select d.file_name, c.vendor_name, c.effective_date, c.auto_renews, c.payment_terms_days as pay_days,
           c.po_acceptance_days as po_days, c.po_if_no_response as po_no_reply, c.needs_review
    from contracts c join documents d on d.id = c.document_id order by d.file_name`);
  await show("Extraction runs", sql`
    select d.file_name, r.status, r.engine, r.prompt_version, r.repair_rounds, r.cost_usd, r.cost_is_equivalent,
           round(r.duration_ms / 1000.0) as seconds
    from extraction_runs r join documents d on d.id = r.document_id order by r.started_at`);
  await show("Price rows with evidence (first 6)", sql`
    select d.file_name, f.field, f.value->>'unitPrice' as price, f.value->>'unitOfMeasure' as unit, f.page, f.quote_status
    from extracted_fields f join extraction_runs r on r.id = f.run_id join documents d on d.id = r.document_id
    where f.field like 'priceList%' order by d.file_name, f.field limit 6`);
  await show("Row-level security", sql`
    select relname as table_name, relrowsecurity as rls_on from pg_class
    where relname in ('documents', 'contracts', 'extracted_fields', 'extraction_runs') order by relname`);
} finally {
  await close();
}
