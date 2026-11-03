import { ExtractionResult, fieldNames } from "./fields.ts";
import { normalize, squash } from "./text.ts";

// Verification runs in code, never by the model. Every problem found here is sent back to Claude in a repair round;
// anything still failing after the last round is flagged for human review.

export type QuoteStatus = "verified" | "not_found" | "none";

/** The verification result for one field, or one price-list row (field "priceList[2]"). */
export type FieldCheck = { field: string; quote: QuoteStatus; issues: string[] };

export type Verification = {
  passed: boolean;
  /** Parsed extraction, or null if Claude's output did not match the schema. */
  result: ExtractionResult | null;
  checks: FieldCheck[];
};

/** Validates Claude's raw output against the schema, then checks quotes and business rules. */
export function verify(output: unknown, pages: string[]): Verification {
  const parsed = ExtractionResult.safeParse(output);
  if (!parsed.success) {
    const checks = parsed.error.issues.map((issue) => ({
      field: issue.path.join(".") || "(root)",
      quote: "none" as const,
      issues: [`does not match the schema: ${issue.message}`],
    }));
    return { passed: false, result: null, checks };
  }

  const result = parsed.data;
  const checks: FieldCheck[] = fieldNames.map((name) => {
    const { value, quote, page } = result[name];
    return checkEvidence(name, value !== null, quote, page, pages);
  });

  (result.priceList.value ?? []).forEach((row, i) => {
    const check = checkEvidence(`priceList[${i}]`, true, row.quote, row.page, pages);
    if (!quoteShowsPrice(row.quote, row.unitPrice)) {
      check.issues.push(`quote does not show the unit price ${row.unitPrice}`);
    }
    checks.push(check);
  });

  // Business rules. Each issue is attached to the field Claude should look at again.
  const issuesFor = (field: string) => checks.find((c) => c.field === field)!.issues;
  const effective = result.effectiveDate.value;
  const expiration = result.expirationDate.value;
  if (effective && expiration && expiration <= effective) {
    issuesFor("expirationDate").push(`expiration date ${expiration} is not after effective date ${effective}`);
  }
  const customer = result.customerName.value;
  const vendor = result.vendorName.value;
  if (customer && vendor && comparableName(customer) === comparableName(vendor)) {
    issuesFor("vendorName").push("customer and vendor are the same party");
  }
  // Positive unit prices, ISO currencies and payment terms above 0 days are enforced by the schema in fields.ts.

  return { passed: checks.every((c) => c.issues.length === 0), result, checks };
}

/** Flattens the checks into "field: problem" lines, the format used in repair messages and reports. */
export function listIssues(verification: Verification): string[] {
  return verification.checks.flatMap((c) => c.issues.map((issue) => `${c.field}: ${issue}`));
}

function checkEvidence(
  field: string,
  hasValue: boolean,
  quote: string | null,
  page: number | null,
  pages: string[],
): FieldCheck {
  const check: FieldCheck = { field, quote: "none", issues: [] };
  if (quote === null || page === null) {
    if (hasValue) check.issues.push("has a value but no quote and page to support it");
    return check;
  }
  if (page > pages.length) {
    check.quote = "not_found";
    check.issues.push(`page ${page} does not exist; the PDF has ${pages.length} pages`);
    return check;
  }
  if (quoteOnPage(quote, pages, page)) {
    check.quote = "verified";
    return check;
  }
  check.quote = "not_found";
  const elsewhere = pages.findIndex((_, i) => quoteOnPage(quote, pages, i + 1));
  check.issues.push(
    elsewhere >= 0
      ? `quote is on page ${elsewhere + 1}, not page ${page}`
      : `quote not found on page ${page}: "${quote}"`,
  );
  return check;
}

/**
 * True if the quote appears on the page, or runs across the break into the next or previous page.
 * Spaces are ignored entirely, because PDF text extraction often drops or adds them at line breaks.
 */
export function quoteOnPage(quote: string, pages: string[], page: number): boolean {
  const q = squash(quote);
  if (q.length === 0) return false;
  const here = squash(pages[page - 1] ?? "");
  return (
    here.includes(q) ||
    (here + squash(pages[page] ?? "")).includes(q) ||
    (squash(pages[page - 2] ?? "") + here).includes(q)
  );
}

function quoteShowsPrice(quote: string, price: number): boolean {
  const digits = squash(quote).replace(/,/g, "");
  return [String(price), price.toFixed(2)].some((form) => digits.includes(form));
}

function comparableName(name: string): string {
  return normalize(name).toLowerCase().replace(/[^a-z0-9]/g, "");
}
