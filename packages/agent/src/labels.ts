import { z } from "zod";
import { fieldValues, PriceRowValue, type FieldName } from "./fields.ts";

// Answer-key format for hand-labeled test contracts. Labels record the correct value (and optionally the page);
// quotes are not needed because accuracy is scored on values.

function labeled<T extends z.ZodType>(value: T) {
  return z.strictObject({
    _hint: z.string().optional(),
    value: value.nullable(),
    page: z.number().int().positive().nullable().optional(),
    note: z.string().optional(),
  });
}

const labeledFields = {
  documentType: labeled(fieldValues.documentType),
  customerName: labeled(fieldValues.customerName),
  vendorName: labeled(fieldValues.vendorName),
  effectiveDate: labeled(fieldValues.effectiveDate),
  expirationDate: labeled(fieldValues.expirationDate),
  autoRenews: labeled(fieldValues.autoRenews),
  priceEscalation: labeled(fieldValues.priceEscalation),
  paymentTermsDays: labeled(fieldValues.paymentTermsDays),
  minimumCommitment: labeled(fieldValues.minimumCommitment),
  poAcceptance: labeled(fieldValues.poAcceptance),
} satisfies Record<FieldName, z.ZodType>;

export const Label = z.strictObject({
  _readme: z.string().optional(),
  contract: z.string().regex(/\.pdf$/, "must be the PDF file name, e.g. trilogy-flex.pdf"),
  // "todo" until fully labeled. Only "done" labels count toward accuracy scoring.
  status: z.enum(["todo", "done"]),
  ...labeledFields,
  priceList: z.strictObject({
    _hint: z.string().optional(),
    value: z.array(PriceRowValue).nullable(),
    note: z.string().optional(),
  }),
});

export type Label = z.infer<typeof Label>;
