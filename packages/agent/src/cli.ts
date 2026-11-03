// Developer tool: runs extraction on test contracts and writes the results as JSON to test-data/output.
// Usage: pnpm --filter @cea/agent extract <contract.pdf ...|--all> [--engine claude-code|api] [--confirm-paid] [--save [--force]]
// Contracts are names in test-data/contracts or paths. The api engine is billed, so it also needs --confirm-paid.
// --save also stores the PDF in Supabase Storage and the results in the database; files already saved (same SHA-256)
// are skipped without calling Claude, unless --force is given.
//
// This CLI is the only part of @cea/agent that touches the database. The library entry point (index.ts) never does.

import { createDb, createStorage, createDocument, findDocumentByHash, saveExtraction, saveFailedRun } from "@cea/db";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { parseArgs } from "node:util";
import { DEFAULTS, extractContract, fieldNames, PROMPT_VERSION, type EngineName, type ExtractOutcome } from "./index.ts";

const testData = join(import.meta.dirname, "..", "test-data");
const contractsDir = join(testData, "contracts");
const outputDir = join(testData, "output");

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    all: { type: "boolean", default: false },
    engine: { type: "string", default: DEFAULTS.engine },
    "confirm-paid": { type: "boolean", default: false },
    save: { type: "boolean", default: false },
    force: { type: "boolean", default: false },
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

const store = values.save ? await openStore() : undefined;
mkdirSync(outputDir, { recursive: true });
let failed = false;

try {
  for (const file of files) {
    const name = basename(file, ".pdf");
    console.log(`\n=== ${name}`);
    const bytes = new Uint8Array(readFileSync(file));
    const sha256 = createHash("sha256").update(bytes).digest("hex");

    const existing = store ? await findDocumentByHash(store.db, sha256) : undefined;
    if (existing && !values.force) {
      console.log(`  already saved (document ${existing.id}, uploaded ${existing.uploadedAt.toISOString()}); skipped. Use --force to re-extract.`);
      continue;
    }

    const startedAt = new Date();
    let outcome: ExtractOutcome | undefined;
    let error: unknown;
    try {
      outcome = await extractContract(bytes, { engine, onProgress: (message) => console.log(`  ${message}`) });
      const outFile = join(outputDir, `${name}.${engine}.json`);
      writeFileSync(outFile, JSON.stringify({ contract: basename(file), ...outcome }, null, 2) + "\n");
      printSummary(outcome);
      console.log(`  wrote ${outFile}`);
    } catch (err) {
      error = err;
      failed = true;
      console.log(`  ✗ ${errorMessage(err)}`);
    }

    // Rejected files are never stored. Successful and failed runs both are.
    if (!store || outcome?.status === "rejected") continue;
    try {
      const doc =
        existing ??
        (await createDocument(store.db, {
          fileName: basename(file),
          sha256,
          sizeBytes: bytes.length,
          storagePath: await store.storage.uploadPdf(`${sha256}.pdf`, bytes),
        }));
      if (outcome) {
        const runId = await saveExtraction(store.db, doc.id, outcome);
        console.log(`  saved to Supabase (document ${doc.id}, run ${runId})`);
      } else {
        await saveFailedRun(store.db, doc.id, {
          engine,
          model: DEFAULTS.model,
          effort: DEFAULTS.effort,
          promptVersion: PROMPT_VERSION,
          startedAt: startedAt.toISOString(),
          durationMs: Date.now() - startedAt.getTime(),
          error: errorMessage(error),
        });
        console.log(`  failed run recorded in Supabase (document ${doc.id})`);
      }
    } catch (err) {
      failed = true;
      console.log(`  ✗ saving to Supabase failed: ${errorMessage(err)}`);
    }
  }
} finally {
  await store?.close();
}

process.exitCode = failed ? 1 : 0;

/** Connects to the database and Storage, failing fast before any time is spent on extraction. */
async function openStore() {
  const { DATABASE_URL, SUPABASE_URL, SUPABASE_SECRET_KEY } = process.env;
  if (!DATABASE_URL || !SUPABASE_URL || !SUPABASE_SECRET_KEY) {
    fail("--save needs DATABASE_URL, SUPABASE_URL and SUPABASE_SECRET_KEY in .env (see .env.example).");
  }
  const { db, close } = createDb(DATABASE_URL);
  const storage = createStorage(SUPABASE_URL, SUPABASE_SECRET_KEY);
  try {
    await findDocumentByHash(db, "connection-check");
    await storage.check();
  } catch (err) {
    await close();
    fail(`--save could not reach Supabase: ${errorMessage(err)}`);
  }
  return { db, close, storage };
}

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

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}
