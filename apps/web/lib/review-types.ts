// Shapes passed from the server to the review screen. Plain data only (no Dates), so they cross to the browser.

export type ReviewStatus = "pending" | "approved" | "corrected";

export type ReviewField = {
  id: string;
  /** "vendorName", "poAcceptance", or "priceList[2]" for a price row. */
  field: string;
  /** What Claude extracted. Never overwritten. */
  value: unknown;
  /** The value to use: the correction if there is one, otherwise the extracted value. */
  currentValue: unknown;
  quote: string | null;
  page: number | null;
  confidence: "high" | "medium" | "low" | null;
  quoteStatus: "verified" | "not_found" | "none";
  issues: string[];
  note: string | null;
  reviewStatus: ReviewStatus;
  reviewedByEmail: string | null;
  reviewedAt: string | null;
};

export type ContractDetail = {
  id: string;
  fileName: string;
  pdfUrl: string;
  needsReview: boolean;
  reviewStatus: "pending" | "approved";
  run: {
    engine: string;
    model: string;
    promptVersion: string;
    repairRounds: number | null;
    startedAt: string;
    issues: string[];
  } | null;
  fields: ReviewField[];
};
