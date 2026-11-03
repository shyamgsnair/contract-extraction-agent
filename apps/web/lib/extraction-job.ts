import "server-only";
import { DEFAULTS, extractContract, PROMPT_VERSION } from "@cea/agent";
import { saveExtraction, saveFailedRun } from "@cea/db";
import { getDb } from "./db";

// Runs one extraction in the background of the local server and records the outcome on its run row.
// Phase 5 moves this into an Inngest job; the logic stays the same.
// Always the free claude-code engine: the paid api engine is never used from the web app.

export async function runExtraction(documentId: string, runId: string, pdfBytes: Uint8Array, startedAt: Date) {
  const db = getDb();
  try {
    const outcome = await extractContract(pdfBytes, { engine: "claude-code" });
    if (outcome.status === "rejected") throw new Error(outcome.message); // already checked at upload; kept as a guard
    await saveExtraction(db, documentId, outcome, runId);
  } catch (err) {
    await saveFailedRun(
      db,
      documentId,
      {
        engine: "claude-code",
        model: DEFAULTS.model,
        effort: DEFAULTS.effort,
        promptVersion: PROMPT_VERSION,
        startedAt: startedAt.toISOString(),
        durationMs: Date.now() - startedAt.getTime(),
        error: err instanceof Error ? err.message : String(err),
      },
      runId,
    ).catch((saveErr) => console.error("Could not record failed extraction run", runId, saveErr));
  }
}
