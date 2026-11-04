import { z } from "zod";
import { ExtractionResult, fieldNames, fieldValues, PoAcceptance, PriceRowValue } from "./fields.ts";

// Bump this whenever the instructions below change, so run records show which prompt produced a result.
// v2: minimumCommitment also covers requirements commitments ("at least X% of its requirements").
// v3 (claude-code engine): read the whole PDF in one Read call. Page ranges need the pdftoppm tool, which was
//     missing, so v2 runs silently fell back to the page text and never saw the PDF itself.
export const PROMPT_VERSION = "v3";

/** The extraction schema as JSON Schema, for Claude Code's structured output and the API's submit tool. */
export function extractionJsonSchema(): Record<string, unknown> {
  const { $schema: _, ...schema } = z.toJSONSchema(ExtractionResult);
  return schema;
}

/** System instructions shared by both engines. The field guide is generated from the descriptions in fields.ts. */
export function systemInstructions(): string {
  return `You extract key commercial terms from a vendor contract for a finance team. Accuracy matters more than completeness.

Rules
1. Use only what the contract states. Never guess or infer from industry norms. If the contract does not state a field, set value, quote and page to null.
2. "quote" is evidence: copy it verbatim from the contract, as one continuous passage, usually one sentence or table row. Do not paraphrase, shorten with "...", fix typos or change capitalization. Code checks every quote against the text of the cited page, and anything that does not match is sent back to you.
3. "page" is the 1-based page of the PDF file (page 1 is the first page of the file), not the page number printed on the page.
4. Dates are YYYY-MM-DD. Numbers are plain numbers without currency symbols or thousands separators.
5. For the text fields (priceEscalation, minimumCommitment), "value" is a short plain-English summary and "quote" is the supporting text. Use "None" only when the contract explicitly says there is none; use null when it is silent.
6. Customer is the buyer and vendor is the seller (supplier or manufacturer). Use the full legal names as written where the parties are introduced.
7. Price list: one row per item and price. For tiered or volume pricing, one row per tier, with the tier in the item name. Each row's quote must include the price as written.
8. If a term is redacted (for example "[***]"), set value to null and say so in "note".
9. An amendment fills only the fields it changes; everything else is null.
10. "confidence" is high when the text is explicit, medium when it needs interpretation (for example combining two clauses), and low when it is ambiguous. For a null value, it is how sure you are that the contract is silent.

Fields
${fieldGuide()}`;
}

/** The message sent back to Claude when code verification finds problems. */
export function repairMessage(issues: string[]): string {
  return `Code verification found these problems with your extraction:
${issues.map((issue) => `- ${issue}`).join("\n")}

Fix each one: copy the quote exactly from the page text, correct the page, or correct the value. If a value cannot be supported by a verbatim quote, set it to null and explain in "note". Return the complete extraction again, with every field, not only the ones you changed.`;
}

function fieldGuide(): string {
  const lines = fieldNames.map((name) => `- ${name}: ${fieldValues[name].description}`);
  lines.push(...subfields("poAcceptance", PoAcceptance.shape));
  lines.push("- priceList: The agreed prices, one row per item; null if none are stated.");
  lines.push(...subfields("priceList rows", PriceRowValue.shape));
  return lines.join("\n");
}

function subfields(parent: string, shape: Record<string, z.ZodType>): string[] {
  return Object.entries(shape).map(([key, schema]) => `  - ${parent}.${key}: ${schema.description}`);
}
