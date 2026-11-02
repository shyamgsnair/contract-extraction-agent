import { z } from "zod";

// The single definition of what we extract. The AI tool schema, verification, labels and UI types all derive from here.
// Descriptions are written for Claude as well as for people: Phase 2 sends them as extraction instructions.

export const Confidence = z.enum(["high", "medium", "low"]);

export const DocumentType = z.enum(["supply_agreement", "msa", "sow", "amendment", "order_form"]);

export const PoAcceptance = z.strictObject({
  days: z.number().int().positive().describe("Number of days the vendor has to accept or reject a purchase order."),
  dayType: z.enum(["business", "calendar"]).describe("Whether the days are business days or calendar days."),
  ifNoResponse: z
    .enum(["accepted", "rejected", "not_stated"])
    .describe("What happens if the vendor does not respond in time: the PO is deemed accepted, deemed rejected, or the contract does not say."),
});

export const PriceRowValue = z.strictObject({
  item: z.string().min(1).describe("Product or service name as written, including pack size or format if stated."),
  unitPrice: z.number().positive().describe("Price per unit as a number, without currency symbols or thousands separators."),
  currency: z.string().regex(/^[A-Z]{3}$/, "must be a 3-letter ISO code such as USD").describe("ISO 4217 currency code, e.g. USD."),
  unitOfMeasure: z.string().min(1).describe('What one unit is, e.g. "kilogram", "bottle", "pack of 60", "kWh".'),
});

// Single-value fields: name -> schema of the value itself (null is added by the wrappers below).
export const fieldValues = {
  documentType: DocumentType.describe("The kind of contract."),
  customerName: z.string().min(1).describe("Legal name of the buying party, as written in the contract."),
  vendorName: z
    .string()
    .min(1)
    .describe("Legal name of the selling party (supplier or manufacturer), as written in the contract."),
  effectiveDate: z.iso
    .date()
    .describe(
      'Date the contract takes effect, as YYYY-MM-DD. If it is effective "on the date of last signature", use that signature date with medium confidence.',
    ),
  expirationDate: z.iso
    .date()
    .describe(
      "End date of the initial term, as YYYY-MM-DD. Only if a date is explicitly stated; if only a duration is given, use null.",
    ),
  autoRenews: z.boolean().describe("True if the contract renews automatically without action by either party."),
  priceEscalation: z
    .string()
    .min(1)
    .describe('How and when prices can change, in a short phrase, e.g. "CPI-based, capped at 3% a year".'),
  paymentTermsDays: z
    .number()
    .int()
    .positive()
    .describe("Number of days the customer has to pay an invoice (net days), e.g. 45."),
  minimumCommitment: z
    .string()
    .min(1)
    .describe("Minimum order quantity or minimum purchase commitment, in a short phrase."),
  poAcceptance: PoAcceptance.describe("How the vendor accepts or rejects purchase orders."),
} as const;

export type FieldName = keyof typeof fieldValues;
export const fieldNames = Object.keys(fieldValues) as FieldName[];

// --- Extraction output: every value comes with its evidence ---

/** Wraps a value schema with its evidence. Think of it as a generic Extracted<T> class in Java. */
export function extracted<T extends z.ZodType>(value: T) {
  return z.strictObject({
    value: value.nullable(),
    quote: z.string().nullable().describe("Verbatim text from the contract that supports the value; null if value is null."),
    page: z.number().int().positive().nullable().describe("1-based PDF page number where the quote appears."),
    confidence: Confidence,
    note: z.string().optional().describe('Optional remark, e.g. "redacted in the filing".'),
  });
}

export const PriceRowExtracted = PriceRowValue.extend({
  quote: z.string().describe("Verbatim text from the contract showing this price."),
  page: z.number().int().positive(),
  confidence: Confidence,
});

// `satisfies` makes the compiler check that every field in fieldValues is listed here, no more and no fewer.
const extractedFields = {
  documentType: extracted(fieldValues.documentType),
  customerName: extracted(fieldValues.customerName),
  vendorName: extracted(fieldValues.vendorName),
  effectiveDate: extracted(fieldValues.effectiveDate),
  expirationDate: extracted(fieldValues.expirationDate),
  autoRenews: extracted(fieldValues.autoRenews),
  priceEscalation: extracted(fieldValues.priceEscalation),
  paymentTermsDays: extracted(fieldValues.paymentTermsDays),
  minimumCommitment: extracted(fieldValues.minimumCommitment),
  poAcceptance: extracted(fieldValues.poAcceptance),
} satisfies Record<FieldName, z.ZodType>;

export const ExtractionResult = z.strictObject({
  ...extractedFields,
  priceList: z.strictObject({
    value: z.array(PriceRowExtracted).nullable().describe("The agreed prices, one row per item; null if none are stated."),
    note: z.string().optional(),
  }),
});

export type ExtractionResult = z.infer<typeof ExtractionResult>;
