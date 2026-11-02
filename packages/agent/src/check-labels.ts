// Validates every answer-key file in test-data/labels against the Label schema.
// Usage: pnpm --filter @cea/agent check-labels

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Label } from "./labels.ts";

const testData = join(import.meta.dirname, "..", "test-data");
const labelsDir = join(testData, "labels");
const files = readdirSync(labelsDir).filter((f) => f.endsWith(".json")).sort();

let failed = false;
for (const file of files) {
  let json: unknown;
  try {
    json = JSON.parse(readFileSync(join(labelsDir, file), "utf8"));
  } catch (err) {
    console.log(`✗ ${file}: not valid JSON (${err instanceof Error ? err.message : err})`);
    failed = true;
    continue;
  }

  const result = Label.safeParse(json);
  if (!result.success) {
    failed = true;
    console.log(`✗ ${file}`);
    for (const issue of result.error.issues) {
      console.log(`    ${issue.path.join(".") || "(top level)"}: ${issue.message}`);
    }
    continue;
  }

  const label = result.data;
  if (!existsSync(join(testData, "contracts", label.contract))) {
    failed = true;
    console.log(`✗ ${file}: contract "${label.contract}" not found in test-data/contracts`);
    continue;
  }
  console.log(`✓ ${file} (${label.status})`);
}

console.log(`\n${files.length} label file(s) checked.`);
process.exitCode = failed ? 1 : 0;
