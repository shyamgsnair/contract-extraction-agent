import "server-only";
import { contracts, documents, extractionRuns, runLogEntries } from "@cea/db";
import { asc, eq } from "drizzle-orm";
import { requireUser } from "./auth";
import { getDb } from "./db";

// Plain data only (no Dates), so it crosses to the browser.
export type RunLogEntryView = {
  id: string;
  seq: number;
  at: string;
  round: number;
  kind: "input" | "output" | "tool_call" | "tool_result" | "check" | "usage";
  title: string;
  text: string | null;
  data: unknown;
  ok: boolean | null;
};

export type RunLogView = {
  runId: string;
  fileName: string;
  contractId: string | null;
  status: "running" | "succeeded" | "failed";
  /** Still running and recent enough to be alive, so the page keeps refreshing. */
  live: boolean;
  engine: string;
  model: string;
  promptVersion: string;
  startedAt: string;
  durationMs: number | null;
  costUsd: number | null;
  costIsEquivalent: boolean | null;
  entries: RunLogEntryView[];
};

const STALLED_AFTER_MS = 20 * 60 * 1000;

/** One run with its interaction log, in order. Null if the run does not exist. */
export async function getRunLog(runId: string): Promise<RunLogView | null> {
  await requireUser();
  if (!/^[0-9a-f-]{36}$/i.test(runId)) return null;
  const db = getDb();

  const [row] = await db
    .select({ run: extractionRuns, fileName: documents.fileName, contractId: contracts.id })
    .from(extractionRuns)
    .innerJoin(documents, eq(documents.id, extractionRuns.documentId))
    .leftJoin(contracts, eq(contracts.documentId, extractionRuns.documentId))
    .where(eq(extractionRuns.id, runId));
  if (!row) return null;

  const entries = await db.select().from(runLogEntries).where(eq(runLogEntries.runId, runId)).orderBy(asc(runLogEntries.seq));
  const { run } = row;
  return {
    runId: run.id,
    fileName: row.fileName,
    contractId: row.contractId,
    status: run.status,
    live: run.status === "running" && Date.now() - run.startedAt.getTime() < STALLED_AFTER_MS,
    engine: run.engine,
    model: run.model,
    promptVersion: run.promptVersion,
    startedAt: run.startedAt.toISOString(),
    durationMs: run.durationMs,
    costUsd: run.costUsd,
    costIsEquivalent: run.costIsEquivalent,
    entries: entries.map((e) => ({
      id: e.id,
      seq: e.seq,
      at: e.at.toISOString(),
      round: e.round,
      kind: e.kind,
      title: e.title,
      text: e.text,
      data: e.data,
      ok: e.ok,
    })),
  };
}
