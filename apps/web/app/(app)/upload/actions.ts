"use server";

import { checkIntake, DEFAULTS, PROMPT_VERSION } from "@cea/agent";
import { contracts, createDocument, findDocumentByHash, startRun } from "@cea/db";
import { eq } from "drizzle-orm";
import { after } from "next/server";
import { createHash } from "node:crypto";
import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { runExtraction } from "@/lib/extraction-job";
import { getStorage } from "@/lib/storage";

export type UploadResult =
  | { status: "started"; fileName: string; documentId: string }
  | { status: "duplicate"; fileName: string; contractId: string | null }
  | { status: "rejected"; fileName: string; message: string };

/**
 * Accepts one PDF: runs intake checks, detects duplicates by SHA-256, stores the file, and starts extraction
 * in the background. Returns straight away; the upload page polls the run's status.
 */
export async function uploadContract(formData: FormData): Promise<UploadResult> {
  await requireUser();
  const file = formData.get("file");
  if (!(file instanceof File)) return { status: "rejected", fileName: "(none)", message: "No file was received." };
  const fileName = file.name;
  const bytes = new Uint8Array(await file.arrayBuffer());

  // Rejected files are never stored and never sent to Claude.
  const intake = await checkIntake(bytes);
  if (!intake.ok) return { status: "rejected", fileName, message: intake.message };

  const db = getDb();
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const existing = await findDocumentByHash(db, sha256);
  if (existing) {
    const [contract] = await db.select({ id: contracts.id }).from(contracts).where(eq(contracts.documentId, existing.id));
    return { status: "duplicate", fileName, contractId: contract?.id ?? null };
  }

  const storagePath = await getStorage().uploadPdf(`${sha256}.pdf`, bytes);
  const document = await createDocument(db, { fileName, sha256, sizeBytes: bytes.length, storagePath });
  const startedAt = new Date();
  const runId = await startRun(db, document.id, {
    engine: "claude-code",
    model: DEFAULTS.model,
    effort: DEFAULTS.effort,
    promptVersion: PROMPT_VERSION,
    startedAt: startedAt.toISOString(),
  });

  // Runs after the response is sent, so the page does not wait the minute or so extraction takes.
  after(() => runExtraction(document.id, runId, bytes, startedAt));
  return { status: "started", fileName, documentId: document.id };
}
