import "server-only";
import { DEFAULTS, extractContract, PROMPT_VERSION } from "@cea/agent";
import { createRunLogWriter, saveExtraction, saveFailedRun } from "@cea/db";
import { getDb } from "./db";

// Runs one extraction in the background of the local server and records the outcome on its run row.
// Phase 5 moves this into an Inngest job; the logic stays the same.
// Always the free claude-code engine: the paid api engine is never used from the web app.
// The interaction log is saved entry by entry while the run goes, so the log page can show it live.

export async function runExtraction(documentId: string, runId: string, pdfBytes: Uint8Array, startedAt: Date) {
  const db = getDb();
  const log = createRunLogWriter(db, runId);
  try {
    const outcome = await extractContract(pdfBytes, { engine: "claude-code", onLog: log.write });
    await log.flush();
    if (outcome.status === "rejected") throw new Error(outcome.message); // already checked at upload; kept as a guard
    await saveExtraction(db, documentId, outcome, runId);
  } catch (err) {
    log.write({ round: 0, kind: "check", title: "Run failed", text: err instanceof Error ? err.message : String(err), ok: false });
    await log.flush();
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
