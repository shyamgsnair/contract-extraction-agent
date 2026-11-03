// Developer tool: runs extraction on test contracts and writes the results as JSON to test-data/output.
// Usage: pnpm --filter @cea/agent extract <contract.pdf ...|--all> [--engine claude-code|api] [--confirm-paid]
// Contracts are names in test-data/contracts or paths. The api engine is billed, so it also needs --confirm-paid.

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { parseArgs } from "node:util";
import { DEFAULTS, extractContract, fieldNames, type EngineName, type ExtractOutcome } from "./index.ts";

const testData = join(import.meta.dirname, "..", "test-data");
const contractsDir = join(testData, "contracts");
const outputDir = join(testData, "output");

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    all: { type: "boolean", default: false },
    engine: { type: "string", default: DEFAULTS.engine },
    "confirm-paid": { type: "boolean", default: false },
  },
});

const engine = values.engine as EngineName;
if (engine !== "claude-code" && engine !== "api") fail(`Unknown engine "${values.engine}". Use claude-code or api.`);
if (engine === "api" && !values["confirm-paid"]) {
  fail("The api engine is billed per token. Re-run with --confirm-paid once the run has been approved.");
}

const files = values.all
  ? readdirSync(contractsDir).filter((f) => f.endsWith(".pdf")).sort().map((f) => join(contractsDir, f))
  : positionals.map((p) => (existsSync(p) ? p : join(contractsDir, p)));
if (files.length === 0) fail("Name one or more contracts, or pass --all.");

mkdirSync(outputDir, { recursive: true });
let failed = false;

for (const file of files) {
  const name = basename(file, ".pdf");
  console.log(`\n=== ${name}`);
  try {
    const outcome = await extractContract(new Uint8Array(readFileSync(file)), {
      engine,
      onProgress: (message) => console.log(`  ${message}`),
    });
    const outFile = join(outputDir, `${name}.${engine}.json`);
    writeFileSync(outFile, JSON.stringify({ contract: basename(file), ...outcome }, null, 2) + "\n");
    printSummary(outcome);
    console.log(`  saved ${outFile}`);
  } catch (err) {
    failed = true;
    console.log(`  ✗ ${err instanceof Error ? err.message : String(err)}`);
  }
}

process.exitCode = failed ? 1 : 0;

function printSummary(outcome: ExtractOutcome): void {
  if (outcome.status === "rejected") {
    console.log(`  ✗ rejected at intake: ${outcome.message}`);
    return;
  }
  const { result, checks, run } = outcome;
  const quoteStatus = (field: string) => checks.find((c) => c.field === field)?.quote ?? "none";
  const mark = (field: string) => (checks.find((c) => c.field === field)?.issues.length ? "✗" : "✓");

  if (result) {
    for (const name of fieldNames) {
      const { value, page, confidence } = result[name];
      const shown = value === null ? "null" : typeof value === "object" ? JSON.stringify(value) : String(value);
      console.log(`  ${mark(name)} ${name.padEnd(18)} ${shown}  [p${page ?? "-"}, ${confidence}, quote ${quoteStatus(name)}]`);
    }
    (result.priceList.value ?? []).forEach((row, i) => {
      const field = `priceList[${i}]`;
      console.log(
        `  ${mark(field)} ${field.padEnd(18)} ${row.item}: ${row.unitPrice} ${row.currency} per ${row.unitOfMeasure}  [p${row.page}, ${row.confidence}, quote ${quoteStatus(field)}]`,
      );
    });
  }
  for (const issue of outcome.issues) console.log(`  ! ${issue}`);

  const cost = run.usage.costUsd === null ? "unknown" : `$${run.usage.costUsd.toFixed(2)}`;
  console.log(
    `  ${outcome.needsReview ? "NEEDS REVIEW" : "all checks passed"} | repair rounds ${run.repairRounds} | ` +
      `${(run.durationMs / 1000).toFixed(0)}s | ${run.usage.inputTokens + run.usage.cacheReadTokens + run.usage.cacheWriteTokens} in / ${run.usage.outputTokens} out tokens | ` +
      `${run.costIsEquivalent ? `${cost} equivalent API cost, not billed` : `${cost} billed`}`,
  );
}

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}
