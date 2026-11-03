import "server-only";
import { contracts, documents, extractedFields } from "@cea/db";
import { and, asc, eq, like, sql } from "drizzle-orm";
import { requireUser } from "./auth";
import { getDb } from "./db";

// Read access for contracts. Every function checks the signed-in user first.

export type ContractRow = {
  id: string;
  fileName: string;
  documentType: string | null;
  customerName: string | null;
  vendorName: string | null;
  effectiveDate: string | null;
  expirationDate: string | null;
  autoRenews: boolean | null;
  priceEscalation: string | null;
  paymentTermsDays: number | null;
  minimumCommitment: string | null;
  poAcceptanceDays: number | null;
  poAcceptanceDayType: string | null;
  poIfNoResponse: string | null;
  priceItems: number;
  /** approved: every field reviewed; flagged: failed verification, not yet reviewed; to_review: passed, not yet reviewed. */
  status: "approved" | "flagged" | "to_review";
  updatedAt: string;
};

export async function listContracts(): Promise<ContractRow[]> {
  await requireUser();
  const db = getDb();
  const priceItems = db
    .select({ count: sql<number>`count(*)::int` })
    .from(extractedFields)
    .where(and(eq(extractedFields.runId, contracts.latestRunId), like(extractedFields.field, "priceList[%")));

  const rows = await db
    .select({
      id: contracts.id,
      fileName: documents.fileName,
      documentType: contracts.documentType,
      customerName: contracts.customerName,
      vendorName: contracts.vendorName,
      effectiveDate: contracts.effectiveDate,
      expirationDate: contracts.expirationDate,
      autoRenews: contracts.autoRenews,
      priceEscalation: contracts.priceEscalation,
      paymentTermsDays: contracts.paymentTermsDays,
      minimumCommitment: contracts.minimumCommitment,
      poAcceptanceDays: contracts.poAcceptanceDays,
      poAcceptanceDayType: contracts.poAcceptanceDayType,
      poIfNoResponse: contracts.poIfNoResponse,
      priceItems: sql<number>`coalesce((${priceItems}), 0)`,
      needsReview: contracts.needsReview,
      reviewStatus: contracts.reviewStatus,
      updatedAt: contracts.updatedAt,
    })
    .from(contracts)
    .innerJoin(documents, eq(documents.id, contracts.documentId))
    .orderBy(asc(contracts.vendorName));

  // Dates become strings so the rows can be passed to a Client Component.
  return rows.map(({ needsReview, reviewStatus, ...r }) => ({
    ...r,
    priceItems: Number(r.priceItems),
    status: reviewStatus === "approved" ? "approved" : needsReview ? "flagged" : "to_review",
    updatedAt: r.updatedAt.toISOString(),
  }));
}
