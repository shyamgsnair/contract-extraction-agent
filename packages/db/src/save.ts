import { eq } from "drizzle-orm";
import type { createDb } from "./index.ts";
import { contracts, documents, extractedFields, extractionRuns } from "./schema.ts";

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

/** Saves a run, its field evidence and the document's current values, all in one transaction. Returns the run id. */
export async function saveExtraction(db: Db, documentId: string, extraction: Extraction): Promise<string> {
  const { result, checks, needsReview, issues, run } = extraction;
  return db.transaction(async (tx) => {
    const [runRow] = await tx
      .insert(extractionRuns)
      .values({
        documentId,
        status: "succeeded",
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
      })
      .returning({ id: extractionRuns.id });
    const runId = runRow!.id;

    if (result) {
      const fieldRows = fieldEvidence(result, checks).map((row) => ({ ...row, runId }));
      if (fieldRows.length > 0) await tx.insert(extractedFields).values(fieldRows);
    }

    const values = {
      latestRunId: runId,
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
      updatedAt: new Date(),
    };
    await tx
      .insert(contracts)
      .values({ documentId, ...values })
      .onConflictDoUpdate({ target: contracts.documentId, set: values });
    return runId;
  });
}

/** Records a run that threw before producing a result, so failures are visible rather than silently missing. */
export async function saveFailedRun(db: Db, documentId: string, run: RunInfo & { durationMs: number; error: string }) {
  await db.insert(extractionRuns).values({
    documentId,
    status: "failed",
    engine: run.engine,
    model: run.model,
    effort: run.effort,
    promptVersion: run.promptVersion,
    startedAt: new Date(run.startedAt),
    durationMs: run.durationMs,
    error: run.error,
  });
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
