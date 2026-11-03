import { boolean, date, index, integer, jsonb, numeric, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

// Every table has row-level security switched on with no policies yet. Supabase exposes tables in the public
// schema through its web API; with RLS on and no policies, that API returns nothing. Our server code connects to
// Postgres directly as the owner and is not affected. Phase 4 adds policies for logged-in reviewers.

/** One row per uploaded PDF. The SHA-256 hash detects duplicate uploads. */
export const documents = pgTable("documents", {
  id: uuid().primaryKey().defaultRandom(),
  fileName: text().notNull(),
  sha256: text().notNull().unique(),
  sizeBytes: integer().notNull(),
  /** Path of the original PDF in the Supabase Storage bucket "contracts". */
  storagePath: text().notNull(),
  uploadedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
}).enableRLS();

/** One row per extraction attempt, successful or not. Records what produced the result and what it cost. */
export const extractionRuns = pgTable(
  "extraction_runs",
  {
    id: uuid().primaryKey().defaultRandom(),
    documentId: uuid()
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    status: text({ enum: ["succeeded", "failed"] }).notNull(),
    engine: text({ enum: ["claude-code", "api"] }).notNull(),
    model: text().notNull(),
    effort: text(),
    promptVersion: text().notNull(),
    needsReview: boolean(),
    repairRounds: integer(),
    inputTokens: integer(),
    outputTokens: integer(),
    cacheReadTokens: integer(),
    cacheWriteTokens: integer(),
    costUsd: numeric({ precision: 10, scale: 4, mode: "number" }),
    /** True when the cost is what the API would have charged (claude-code engine); nothing was billed. */
    costIsEquivalent: boolean(),
    /** Verification problems still open after the last repair round. */
    issues: jsonb().$type<string[]>(),
    error: text(),
    startedAt: timestamp({ withTimezone: true }).notNull(),
    durationMs: integer(),
  },
  (t) => [index().on(t.documentId)],
).enableRLS();

/** One row per document with its current values, as typed columns so the contract table can filter and sort. */
export const contracts = pgTable("contracts", {
  id: uuid().primaryKey().defaultRandom(),
  documentId: uuid()
    .notNull()
    .unique()
    .references(() => documents.id, { onDelete: "cascade" }),
  latestRunId: uuid().references(() => extractionRuns.id, { onDelete: "set null" }),
  documentType: text(),
  customerName: text(),
  vendorName: text(),
  effectiveDate: date(),
  expirationDate: date(),
  autoRenews: boolean(),
  priceEscalation: text(),
  paymentTermsDays: integer(),
  minimumCommitment: text(),
  poAcceptanceDays: integer(),
  poAcceptanceDayType: text({ enum: ["business", "calendar"] }),
  poIfNoResponse: text({ enum: ["accepted", "rejected", "not_stated"] }),
  needsReview: boolean().notNull(),
  updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
}).enableRLS();

/**
 * The evidence behind each value: one row per field per run, plus one per price-list row ("priceList[2]").
 * The source viewer uses quote and page to highlight where a value came from.
 */
export const extractedFields = pgTable(
  "extracted_fields",
  {
    id: uuid().primaryKey().defaultRandom(),
    runId: uuid()
      .notNull()
      .references(() => extractionRuns.id, { onDelete: "cascade" }),
    field: text().notNull(),
    value: jsonb(),
    quote: text(),
    page: integer(),
    confidence: text({ enum: ["high", "medium", "low"] }),
    quoteStatus: text({ enum: ["verified", "not_found", "none"] }).notNull(),
    issues: jsonb().$type<string[]>().notNull().default([]),
    note: text(),
  },
  (t) => [index().on(t.runId)],
).enableRLS();
