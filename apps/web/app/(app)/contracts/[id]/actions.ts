"use server";

import { fieldValues, PriceRowValue, type FieldName } from "@cea/agent/fields";
import { contracts, extractedFields } from "@cea/db";
import { and, count, eq } from "drizzle-orm";
import type { z } from "zod";
import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";

// Review actions. Each one checks the signed-in user itself (never trust the browser), only touches fields of
// the contract's latest run, and keeps the extracted value: approvals and corrections are stored beside it.

export type ActionResult = { ok: true } | { ok: false; error: string };

/** Marks one field (or price row) as correct as extracted. */
export async function approveField(contractId: string, fieldId: string): Promise<ActionResult> {
  const user = await requireUser();
  const target = await findLatestRunField(contractId, fieldId);
  if (!target) return { ok: false, error: "This field is not part of the contract's latest extraction." };

  const db = getDb();
  await db.transaction(async (tx) => {
    await tx
      .update(extractedFields)
      .set(reviewedBy(user, "approved", null))
      .where(eq(extractedFields.id, fieldId));
    // Approving after a correction restores the extracted value in the contract table.
    await tx.update(contracts).set(contractColumns(target.field, target.value)).where(eq(contracts.id, contractId));
  });
  await refreshReviewStatus(contractId, target.runId);
  return { ok: true };
}

/** Stores a reviewer's correction. The value is validated with the same Zod schema the extraction uses. */
export async function correctField(contractId: string, fieldId: string, value: unknown): Promise<ActionResult> {
  const user = await requireUser();
  const target = await findLatestRunField(contractId, fieldId);
  if (!target) return { ok: false, error: "This field is not part of the contract's latest extraction." };

  const schema: z.ZodType = target.field.startsWith("priceList[")
    ? PriceRowValue
    : fieldValues[target.field as FieldName].nullable();
  if (!schema) return { ok: false, error: `Unknown field ${target.field}.` };
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues.map((i) => (i.path.length ? `${i.path.join(".")}: ` : "") + i.message).join("; ") };
  }

  const db = getDb();
  await db.transaction(async (tx) => {
    await tx
      .update(extractedFields)
      .set(reviewedBy(user, "corrected", parsed.data))
      .where(eq(extractedFields.id, fieldId));
    await tx.update(contracts).set(contractColumns(target.field, parsed.data)).where(eq(contracts.id, contractId));
  });
  await refreshReviewStatus(contractId, target.runId);
  return { ok: true };
}

/** Approves every field of the latest run that has not been reviewed yet. */
export async function approveRemaining(contractId: string): Promise<ActionResult> {
  const user = await requireUser();
  const db = getDb();
  const [contract] = await db.select({ runId: contracts.latestRunId }).from(contracts).where(eq(contracts.id, contractId));
  if (!contract?.runId) return { ok: false, error: "Contract not found." };

  await db
    .update(extractedFields)
    .set(reviewedBy(user, "approved", null))
    .where(and(eq(extractedFields.runId, contract.runId), eq(extractedFields.reviewStatus, "pending")));
  await refreshReviewStatus(contractId, contract.runId);
  return { ok: true };
}

async function findLatestRunField(contractId: string, fieldId: string) {
  const [row] = await getDb()
    .select({ field: extractedFields.field, value: extractedFields.value, runId: extractedFields.runId })
    .from(extractedFields)
    .innerJoin(contracts, eq(contracts.latestRunId, extractedFields.runId))
    .where(and(eq(contracts.id, contractId), eq(extractedFields.id, fieldId)));
  return row;
}

function reviewedBy(user: { id: string; email: string }, status: "approved" | "corrected", correctedValue: unknown) {
  return { reviewStatus: status, correctedValue, reviewedBy: user.id, reviewedByEmail: user.email, reviewedAt: new Date() };
}

/** The contract table's typed columns affected by a field. Price rows and unknown fields affect none. */
function contractColumns(field: string, value: unknown): Partial<typeof contracts.$inferInsert> {
  const v = value as never;
  switch (field) {
    case "poAcceptance": {
      const po = value as { days: number; dayType: "business" | "calendar"; ifNoResponse: "accepted" | "rejected" | "not_stated" } | null;
      return { poAcceptanceDays: po?.days ?? null, poAcceptanceDayType: po?.dayType ?? null, poIfNoResponse: po?.ifNoResponse ?? null };
    }
    case "documentType":
    case "customerName":
    case "vendorName":
    case "effectiveDate":
    case "expirationDate":
    case "autoRenews":
    case "priceEscalation":
    case "paymentTermsDays":
    case "minimumCommitment":
      return { [field]: v };
    default:
      return {};
  }
}

/** A contract is approved once no field of its latest run is still pending. */
async function refreshReviewStatus(contractId: string, runId: string) {
  const db = getDb();
  const [pending] = await db
    .select({ n: count() })
    .from(extractedFields)
    .where(and(eq(extractedFields.runId, runId), eq(extractedFields.reviewStatus, "pending")));
  await db
    .update(contracts)
    .set({ reviewStatus: pending!.n === 0 ? "approved" : "pending", updatedAt: new Date() })
    .where(eq(contracts.id, contractId));
}
