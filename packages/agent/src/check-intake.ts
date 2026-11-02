// Runs intake on every test contract (expected: accepted) and every intake fixture (expected: rejected).
// Usage: pnpm --filter @cea/agent check-intake

import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { checkIntake, type IntakeRejection } from "./intake.ts";
import { normalize } from "./pdf-text.ts";

const testData = join(import.meta.dirname, "..", "test-data");

// normalize() spot checks
assert.equal(normalize("“Purchase  Order”\n–  deemed accepted"), '"Purchase Order" - deemed accepted');
assert.equal(normalize("Supplier’s of­fice ﬁle"), "Supplier's office file");

const expectedRejections: Record<string, IntakeRejection> = {
  "scanned.pdf": "scanned",
  "password-protected.pdf": "password_protected",
  "word-document.docx": "not_pdf",
  "image-not-pdf.png": "not_pdf",
};

let failed = false;

for (const file of readdirSync(join(testData, "contracts")).filter((f) => f.endsWith(".pdf")).sort()) {
  const result = await checkIntake(new Uint8Array(readFileSync(join(testData, "contracts", file))));
  if (result.ok) {
    console.log(`✓ accepted  ${file} (${result.pages.length} pages)`);
  } else {
    failed = true;
    console.log(`✗ REJECTED  ${file}: ${result.message}`);
  }
}

for (const [file, expected] of Object.entries(expectedRejections)) {
  const result = await checkIntake(new Uint8Array(readFileSync(join(testData, "intake-fixtures", file))));
  if (!result.ok && result.reason === expected) {
    console.log(`✓ rejected  ${file}: ${result.message}`);
  } else {
    failed = true;
    console.log(`✗ expected ${expected} for ${file}, got ${result.ok ? "accepted" : result.reason}`);
  }
}

process.exitCode = failed ? 1 : 0;
