// Scores extraction output against the answer keys and prints the go/no-go report.
// Usage: pnpm --filter @cea/agent score [--engine claude-code|api]
//
// Most fields are scored automatically. The two free-text fields (priceEscalation, minimumCommitment) are scored
// automatically only for null and "None"; otherwise a person judges them in test-data/judgments.json, and
// unjudged ones are listed and left out of the accuracy figures.

import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { fieldNames, type ExtractionResult, type FieldName } from "./fields.ts";
import { Label } from "./labels.ts";
import { normalize } from "./pdf-text.ts";
import type { ExtractOutcome } from "./extract.ts";

const testData = join(import.meta.dirname, "..", "test-data");
const { values } = parseArgs({ options: { engine: { type: "string", default: "claude-code" } } });
const engine = values.engine!;

const JUDGED_FIELDS = ["priceEscalation", "minimumCommitment"] as const;
type ScoredField = FieldName | "priceList";
const scoredFields: ScoredField[] = [...fieldNames, "priceList"];

// judgments.json: { "<contract name>": { "priceEscalation": { "got": "<the judged text>", "correct": true } } }
// A judgment applies only while the extracted text is unchanged; a new answer must be judged again.
const judgmentsFile = join(testData, "judgments.json");
type Judgment = { got: string; correct: boolean };
const judgments: Record<string, Partial<Record<string, Judgment>>> = existsSync(judgmentsFile)
  ? JSON.parse(readFileSync(judgmentsFile, "utf8"))
  : {};

type Score = "correct" | "wrong" | "judge";
const rows: { contract: string; scores: Record<ScoredField, Score>; details: string[] }[] = [];
const toJudge: string[] = [];
let unflaggedQuotes = 0;
let reviewFlags = 0;
let totalCost = 0;
let totalSeconds = 0;

for (const file of readdirSync(join(testData, "labels")).filter((f) => f.endsWith(".json")).sort()) {
  const label = Label.parse(JSON.parse(readFileSync(join(testData, "labels", file), "utf8")));
  if (label.status !== "done") continue;
  const contract = label.contract.replace(/\.pdf$/, "");
  const outFile = join(testData, "output", `${contract}.${engine}.json`);
  const outcome = existsSync(outFile) ? (JSON.parse(readFileSync(outFile, "utf8")) as ExtractOutcome) : null;
  const result = outcome?.status === "extracted" ? outcome.result : null;
  const details: string[] = [];

  if (outcome?.status === "extracted") {
    totalCost += outcome.run.usage.costUsd ?? 0;
    totalSeconds += outcome.run.durationMs / 1000;
    if (outcome.needsReview) reviewFlags++;
    // Every quote must be verified, or its field must be flagged for review.
    unflaggedQuotes += outcome.checks.filter((c) => c.quote === "not_found" && c.issues.length === 0).length;
  } else {
    details.push(outcome ? `rejected at intake: ${outcome.message}` : `no output file ${outFile}`);
  }

  const scores = {} as Record<ScoredField, Score>;
  for (const field of scoredFields) {
    const expected = label[field].value;
    const actual = result ? result[field].value : undefined;
    let score = scoreField(field, expected, actual);
    if (score === "judge") {
      const judged = judgments[contract]?.[field];
      if (judged && judged.got === actual) score = judged.correct ? "correct" : "wrong";
      else toJudge.push(`${contract}.${field}\n    key: ${String(expected)}\n    got: ${String(actual)}`);
    }
    scores[field] = score;
    if (score === "wrong") details.push(`${field}: expected ${show(expected)}, got ${show(actual)}`);
  }
  rows.push({ contract, scores, details });
}

// --- Report ---

const pct = (n: number, d: number) => (d === 0 ? "-" : `${Math.round((100 * n) / d)}%`);
const lines: string[] = [];
lines.push(`# Accuracy report (${engine} engine)`, "");
lines.push(`| Field | ${rows.map((r) => r.contract).join(" | ")} | Accuracy |`);
lines.push(`| --- | ${rows.map(() => "---").join(" | ")} | --- |`);

let correct = 0;
let scored = 0;
let worstField = { field: "", accuracy: 1 };
for (const field of scoredFields) {
  const marks = rows.map((r) => ({ correct: "✓", wrong: "✗", judge: "?" })[r.scores[field]]);
  const fieldCorrect = rows.filter((r) => r.scores[field] === "correct").length;
  const fieldScored = rows.filter((r) => r.scores[field] !== "judge").length;
  correct += fieldCorrect;
  scored += fieldScored;
  if (fieldScored > 0 && fieldCorrect / fieldScored < worstField.accuracy) {
    worstField = { field, accuracy: fieldCorrect / fieldScored };
  }
  lines.push(`| ${field} | ${marks.join(" | ")} | ${pct(fieldCorrect, fieldScored)} |`);
}

const overall = scored === 0 ? 0 : correct / scored;
const go = overall >= 0.85 && worstField.accuracy >= 0.6 && unflaggedQuotes === 0;
lines.push(
  "",
  `- **Overall accuracy:** ${pct(correct, scored)} (${correct} of ${scored} scored fields; target 85%)`,
  `- **Lowest field:** ${worstField.field || "-"} at ${pct(worstField.accuracy * 100, 100)} (target: none below 60%)`,
  `- **Quotes not verified and not flagged:** ${unflaggedQuotes} (target 0)`,
  `- **Contracts flagged for review:** ${reviewFlags} of ${rows.length}`,
  `- **Run time and cost:** ${totalSeconds.toFixed(0)}s, $${totalCost.toFixed(2)}${engine === "claude-code" ? " equivalent API cost (not billed)" : " billed"}`,
  `- **Unjudged free-text fields:** ${toJudge.length}`,
  "",
  `**Verdict: ${toJudge.length > 0 ? "provisional " : ""}${go ? "GO" : "NO-GO"}**`,
);
const misses = rows.filter((r) => r.details.length > 0);
if (misses.length > 0) {
  lines.push("", "## Misses", "");
  for (const r of misses) lines.push(`- **${r.contract}**`, ...r.details.map((d) => `  - ${d}`));
}

const report = lines.join("\n") + "\n";
writeFileSync(join(testData, "output", `accuracy-${engine}.md`), report);
console.log(report);
if (toJudge.length > 0) {
  console.log(`To judge (record { "got": ..., "correct": true|false } in test-data/judgments.json):\n  ${toJudge.join("\n  ")}`);
}

// --- Matching rules ---

function scoreField(field: ScoredField, expected: unknown, actual: unknown): Score {
  if (actual === undefined) return "wrong"; // no output for this contract
  if (field === "priceList") return priceListMatches(expected as PriceRow[] | null, actual as PriceRow[] | null) ? "correct" : "wrong";
  if (expected === null || actual === null) return expected === actual ? "correct" : "wrong";
  if (field === "customerName" || field === "vendorName") {
    return comparable(String(expected)) === comparable(String(actual)) ? "correct" : "wrong";
  }
  if ((JUDGED_FIELDS as readonly string[]).includes(field)) {
    const isNone = (v: unknown) => comparable(String(v)) === "none";
    if (isNone(expected) || isNone(actual)) return isNone(expected) && isNone(actual) ? "correct" : "wrong";
    return "judge";
  }
  // Enums, dates, booleans, numbers and the PO acceptance object must match exactly.
  return JSON.stringify(expected) === JSON.stringify(actual) ? "correct" : "wrong";
}

type PriceRow = NonNullable<ExtractionResult["priceList"]["value"]>[number] | NonNullable<Label["priceList"]["value"]>[number];

/** Correct when every answer-key row is found and there are no extra rows. Rows match on price, currency and unit. */
function priceListMatches(expected: PriceRow[] | null, actual: PriceRow[] | null): boolean {
  const want = expected ?? [];
  const got = [...(actual ?? [])];
  if (want.length !== got.length) return false;
  return want.every((row) => {
    const i = got.findIndex(
      (g) => Math.abs(g.unitPrice - row.unitPrice) < 0.005 && g.currency === row.currency && sameUnit(g.unitOfMeasure, row.unitOfMeasure),
    );
    if (i < 0) return false;
    got.splice(i, 1); // each extracted row can match only one key row
    return true;
  });
}

function sameUnit(a: string, b: string): boolean {
  const x = comparable(a).replace(/s$/, "");
  const y = comparable(b).replace(/s$/, "");
  return x.includes(y) || y.includes(x);
}

function comparable(text: string): string {
  return normalize(text).toLowerCase().replace(/[^a-z0-9]/g, "");
}

function show(value: unknown): string {
  if (value === undefined) return "(no output)";
  if (Array.isArray(value)) return `${value.length} price row(s): ${value.map((r: PriceRow) => `${r.unitPrice} ${r.currency}/${r.unitOfMeasure}`).join("; ")}`;
  return JSON.stringify(value);
}
