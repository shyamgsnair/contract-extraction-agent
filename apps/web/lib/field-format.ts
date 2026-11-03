// Labels and display formatting for extracted fields. Safe to use in browser code.

export const DOCUMENT_TYPES: Record<string, string> = {
  supply_agreement: "Supply agreement",
  msa: "MSA",
  sow: "SOW",
  amendment: "Amendment",
  order_form: "Order form",
};

export const NO_RESPONSE: Record<string, string> = {
  accepted: "deemed accepted",
  rejected: "deemed rejected",
  not_stated: "no default stated",
};

export type FieldKind = "text" | "longText" | "date" | "boolean" | "days" | "documentType" | "poAcceptance" | "priceRow";

export const FIELD_INFO: Record<string, { label: string; kind: FieldKind }> = {
  documentType: { label: "Document type", kind: "documentType" },
  customerName: { label: "Customer", kind: "text" },
  vendorName: { label: "Vendor", kind: "text" },
  effectiveDate: { label: "Effective date", kind: "date" },
  expirationDate: { label: "Expiration date", kind: "date" },
  autoRenews: { label: "Auto-renews", kind: "boolean" },
  priceEscalation: { label: "Price escalation", kind: "longText" },
  paymentTermsDays: { label: "Payment terms (days)", kind: "days" },
  minimumCommitment: { label: "Minimum commitment", kind: "longText" },
  poAcceptance: { label: "PO acceptance", kind: "poAcceptance" },
};

export function fieldInfo(field: string): { label: string; kind: FieldKind } {
  const price = field.match(/^priceList\[(\d+)\]$/);
  if (price) return { label: `Price ${Number(price[1]) + 1}`, kind: "priceRow" };
  return FIELD_INFO[field] ?? { label: field, kind: "text" };
}

export type PoAcceptanceValue = { days: number; dayType: "business" | "calendar"; ifNoResponse: "accepted" | "rejected" | "not_stated" };
export type PriceRowValue = { item: string; unitPrice: number; currency: string; unitOfMeasure: string };

/** One-line display of any field value. Null shows as an em dash. */
export function formatValue(field: string, value: unknown): string {
  if (value === null || value === undefined) return "—";
  const { kind } = fieldInfo(field);
  switch (kind) {
    case "documentType":
      return DOCUMENT_TYPES[String(value)] ?? String(value);
    case "boolean":
      return value ? "Yes" : "No";
    case "days":
      return `Net ${value}`;
    case "poAcceptance": {
      const po = value as PoAcceptanceValue;
      return `${po.days} ${po.dayType} days, ${NO_RESPONSE[po.ifNoResponse]}`;
    }
    case "priceRow": {
      const row = value as PriceRowValue;
      return `${row.item}: ${row.unitPrice.toLocaleString("en-US", { minimumFractionDigits: 2 })} ${row.currency} per ${row.unitOfMeasure}`;
    }
    default:
      return String(value);
  }
}
