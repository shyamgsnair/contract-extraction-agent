import { eq } from "drizzle-orm";
import type { createDb } from "./index.ts";
import { contracts, documents, extractedFields, extractionRuns, runLogEntries } from "./schema.ts";

// Saving extraction results. The input types below mirror the agent's output shapes on purpose instead of
// importing them, so this package does not depend on @cea/agent (TypeScript checks the shapes match at the
// call site, much like two Java classes satisfying the same interface).

type Db = ReturnType<typeof createDb>["db"];

type Evidence<T> = { value: T | null; quote: string | null; page: number | null; confidence: string; note?: string };

export type ExtractedContract = {
  documentType: Evidence<string>;
  customerName: Evidence<string>;
  vendorName: Evidence<string>;
  effectiveDate: Evidence<string>;
  expirationDate: Evidence<string>;
  autoRenews: Evidence<boolean>;
  priceEscalation: Evidence<string>;
  paymentTermsDays: Evidence<number>;
  minimumCommitment: Evidence<string>;
  poAcceptance: Evidence<{ days: number; dayType: "business" | "calendar"; ifNoResponse: "accepted" | "rejected" | "not_stated" }>;
  priceList: {
    value:
      | { item: string; unitPrice: number; currency: string; unitOfMeasure: string; quote: string; page: number; confidence: string }[]
      | null;
    note?: string;
  };
};

export type FieldCheck = { field: string; quote: "verified" | "not_found" | "none"; issues: string[] };

export type RunInfo = {
  engine: "claude-code" | "api";
  model: string;
  effort?: string;
  promptVersion: string;
  startedAt: string;
};

export type Extraction = {
  result: ExtractedContract | null;
  checks: FieldCheck[];
  needsReview: boolean;
  issues: string[];
  run: RunInfo & {
    repairRounds: number;
    usage: { inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheWriteTokens: number; costUsd: number | null };
    costIsEquivalent: boolean;
    durationMs: number;
  };
};

export async function findDocumentByHash(db: Db, sha256: string) {
  const [doc] = await db.select().from(documents).where(eq(documents.sha256, sha256));
  return doc;
}

export async function createDocument(
  db: Db,
  doc: { fileName: string; sha256: string; sizeBytes: number; storagePath: string },
) {
  const [row] = await db.insert(documents).values(doc).returning();
  return row!;
}

/** Creates a run in status "running", for callers that show progress (the web app). Returns its id. */
export async function startRun(db: Db, documentId: string, run: RunInfo): Promise<string> {
  const [row] = await db
    .insert(extractionRuns)
    .values({
      documentId,
      status: "running",
      engine: run.engine,
      model: run.model,
      effort: run.effort,
      promptVersion: run.promptVersion,
      startedAt: new Date(run.startedAt),
    })
    .returning({ id: extractionRuns.id });
  return row!.id;
}

/**
 * Saves a run, its field evidence and the document's current values, all in one transaction. Returns the run id.
 * Pass `runId` to complete a run created with startRun; otherwise a new run row is inserted.
 */
export async function saveExtraction(db: Db, documentId: string, extraction: Extraction, runId?: string): Promise<string> {
  const { result, checks, needsReview, issues, run } = extraction;
  return db.transaction(async (tx) => {
    const runValues = {
      documentId,
      status: "succeeded" as const,
      engine: run.engine,
      model: run.model,
      effort: run.effort,
      promptVersion: run.promptVersion,
      needsReview,
      repairRounds: run.repairRounds,
      inputTokens: run.usage.inputTokens,
      outputTokens: run.usage.outputTokens,
      cacheReadTokens: run.usage.cacheReadTokens,
      cacheWriteTokens: run.usage.cacheWriteTokens,
      costUsd: run.usage.costUsd,
      costIsEquivalent: run.costIsEquivalent,
      issues,
      startedAt: new Date(run.startedAt),
      durationMs: run.durationMs,
    };
    if (runId) {
      await tx.update(extractionRuns).set(runValues).where(eq(extractionRuns.id, runId));
    } else {
      const [runRow] = await tx.insert(extractionRuns).values(runValues).returning({ id: extractionRuns.id });
      runId = runRow!.id;
    }
    const savedRunId = runId;

    if (result) {
      const fieldRows = fieldEvidence(result, checks).map((row) => ({ ...row, runId: savedRunId }));
      if (fieldRows.length > 0) await tx.insert(extractedFields).values(fieldRows);
    }

    const values = {
      latestRunId: savedRunId,
      documentType: result?.documentType.value ?? null,
      customerName: result?.customerName.value ?? null,
      vendorName: result?.vendorName.value ?? null,
      effectiveDate: result?.effectiveDate.value ?? null,
      expirationDate: result?.expirationDate.value ?? null,
      autoRenews: result?.autoRenews.value ?? null,
      priceEscalation: result?.priceEscalation.value ?? null,
      paymentTermsDays: result?.paymentTermsDays.value ?? null,
      minimumCommitment: result?.minimumCommitment.value ?? null,
      poAcceptanceDays: result?.poAcceptance.value?.days ?? null,
      poAcceptanceDayType: result?.poAcceptance.value?.dayType ?? null,
      poIfNoResponse: result?.poAcceptance.value?.ifNoResponse ?? null,
      needsReview,
      reviewStatus: "pending" as const, // a new extraction needs a fresh review
      updatedAt: new Date(),
    };
    await tx
      .insert(contracts)
      .values({ documentId, ...values })
      .onConflictDoUpdate({ target: contracts.documentId, set: values });
    return savedRunId;
  });
}

/**
 * Records a run that threw before producing a result, so failures are visible rather than silently missing.
 * Pass `runId` to mark a run created with startRun as failed.
 */
export async function saveFailedRun(
  db: Db,
  documentId: string,
  run: RunInfo & { durationMs: number; error: string },
  runId?: string,
) {
  const values = {
    documentId,
    status: "failed" as const,
    engine: run.engine,
    model: run.model,
    effort: run.effort,
    promptVersion: run.promptVersion,
    startedAt: new Date(run.startedAt),
    durationMs: run.durationMs,
    error: run.error,
  };
  if (runId) await db.update(extractionRuns).set(values).where(eq(extractionRuns.id, runId));
  else await db.insert(extractionRuns).values(values);
}

function fieldEvidence(result: ExtractedContract, checks: FieldCheck[]) {
  const check = (field: string) => checks.find((c) => c.field === field);
  const { priceList, ...fields } = result;
  const rows = Object.entries(fields).map(([field, e]) => ({
    field,
    value: e.value as unknown,
    quote: e.quote,
    page: e.page,
    confidence: e.confidence as "high" | "medium" | "low",
    quoteStatus: check(field)?.quote ?? "none",
    issues: check(field)?.issues ?? [],
    note: e.note ?? null,
  }));
  (priceList.value ?? []).forEach(({ quote, page, confidence, ...value }, i) => {
    const field = `priceList[${i}]`;
    rows.push({
      field,
      value,
      quote,
      page,
      confidence: confidence as "high" | "medium" | "low",
      quoteStatus: check(field)?.quote ?? "none",
      issues: check(field)?.issues ?? [],
      note: null,
    });
  });
  return rows;
}

export type RunLogEntry = {
  round: number;
  kind: "input" | "output" | "tool_call" | "tool_result" | "check" | "usage";
  title: string;
  text?: string;
  data?: unknown;
  ok?: boolean;
};

/**
 * Saves a run's interaction log as it happens. write() returns at once and inserts in the background, one entry
 * after another so the order is kept (like a single-threaded executor in Java); flush() waits for the queue.
 * A failed insert is reported and skipped, so logging never breaks an extraction.
 */
export function createRunLogWriter(db: Db, runId: string) {
  let seq = 0;
  let queue: Promise<void> = Promise.resolve();
  return {
    write(entry: RunLogEntry) {
      const row = { runId, seq: seq++, ...entry, data: entry.data as unknown };
      queue = queue.then(() =>
        db
          .insert(runLogEntries)
          .values(row)
          .then(() => undefined)
          .catch((err: unknown) => console.error("Could not save log entry", runId, row.seq, err)),
      );
    },
    flush: () => queue,
  };
}
