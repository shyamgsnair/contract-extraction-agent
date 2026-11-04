import "server-only";
import { contracts, documents, extractionRuns } from "@cea/db";
import { desc, inArray } from "drizzle-orm";
import { requireUser } from "./auth";
import { getDb } from "./db";

export type UploadRow = {
  documentId: string;
  fileName: string;
  uploadedAt: string;
  contractId: string | null;
  /** The latest extraction run, whose interaction log the Log link opens. */
  runId: string | null;
  /** Status of the latest run. "stalled" means it has been running far longer than any extraction should. */
  status: "running" | "stalled" | "to_review" | "flagged" | "failed" | "none";
  error: string | null;
  durationMs: number | null;
};

const STALLED_AFTER_MS = 20 * 60 * 1000; // e.g. the server was restarted mid-extraction

/** The most recent uploads with the status of their latest extraction run. */
export async function listRecentUploads(limit = 20): Promise<UploadRow[]> {
  await requireUser();
  const db = getDb();
  const docs = await db.select().from(documents).orderBy(desc(documents.uploadedAt)).limit(limit);
  if (docs.length === 0) return [];
  const ids = docs.map((d) => d.id);
  const runs = await db.select().from(extractionRuns).where(inArray(extractionRuns.documentId, ids)).orderBy(desc(extractionRuns.startedAt));
  const contractRows = await db
    .select({ id: contracts.id, documentId: contracts.documentId })
    .from(contracts)
    .where(inArray(contracts.documentId, ids));

  return docs.map((doc) => {
    const run = runs.find((r) => r.documentId === doc.id); // runs are newest first
    let status: UploadRow["status"] = "none";
    if (run?.status === "running") {
      status = Date.now() - run.startedAt.getTime() > STALLED_AFTER_MS ? "stalled" : "running";
    } else if (run?.status === "failed") status = "failed";
    else if (run?.status === "succeeded") status = run.needsReview ? "flagged" : "to_review";
    return {
      documentId: doc.id,
      fileName: doc.fileName,
      uploadedAt: doc.uploadedAt.toISOString(),
      contractId: contractRows.find((c) => c.documentId === doc.id)?.id ?? null,
      runId: run?.id ?? null,
      status,
      error: run?.error ?? null,
      durationMs: run?.durationMs ?? null,
    };
  });
}
