import "server-only";
import { fieldNames } from "@cea/agent/fields";
import { contracts, documents, extractedFields, extractionRuns } from "@cea/db";
import { eq } from "drizzle-orm";
import { requireUser } from "./auth";
import { getDb } from "./db";
import type { ContractDetail, ReviewField } from "./review-types";
import { getStorage } from "./storage";

/** Loads one contract with its latest run's evidence and a short-lived PDF link. Null if it does not exist. */
export async function getContract(id: string): Promise<ContractDetail | null> {
  await requireUser();
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const db = getDb();

  const [row] = await db
    .select({ contract: contracts, document: documents, run: extractionRuns })
    .from(contracts)
    .innerJoin(documents, eq(documents.id, contracts.documentId))
    .leftJoin(extractionRuns, eq(extractionRuns.id, contracts.latestRunId))
    .where(eq(contracts.id, id));
  if (!row) return null;

  const fieldRows = row.run
    ? await db.select().from(extractedFields).where(eq(extractedFields.runId, row.run.id))
    : [];

  // Same order as the field list in the agent, with price rows after the single-value fields.
  const order = (field: string) => {
    const i = fieldNames.indexOf(field as (typeof fieldNames)[number]);
    return i >= 0 ? i : fieldNames.length + Number(field.match(/\d+/)?.[0] ?? 0);
  };
  const fields: ReviewField[] = fieldRows
    .sort((a, b) => order(a.field) - order(b.field))
    .map((f) => ({
      id: f.id,
      field: f.field,
      value: f.value,
      currentValue: f.reviewStatus === "corrected" ? f.correctedValue : f.value,
      quote: f.quote,
      page: f.page,
      confidence: f.confidence,
      quoteStatus: f.quoteStatus,
      issues: f.issues,
      note: f.note,
      reviewStatus: f.reviewStatus,
      reviewedByEmail: f.reviewedByEmail,
      reviewedAt: f.reviewedAt?.toISOString() ?? null,
    }));

  return {
    id: row.contract.id,
    fileName: row.document.fileName,
    pdfUrl: await getStorage().signedUrl(row.document.storagePath, 60 * 60),
    needsReview: row.contract.needsReview,
    reviewStatus: row.contract.reviewStatus,
    run: row.run && {
      engine: row.run.engine,
      model: row.run.model,
      promptVersion: row.run.promptVersion,
      repairRounds: row.run.repairRounds,
      startedAt: row.run.startedAt.toISOString(),
      issues: row.run.issues ?? [],
    },
    fields,
  };
}
