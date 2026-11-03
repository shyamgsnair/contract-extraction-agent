import { openApiSession } from "./engines/api.ts";
import { openClaudeCodeSession } from "./engines/claude-code.ts";
import { addUsage, type Effort, type EngineInput, type EngineName, type EngineSession, type Usage } from "./engines/types.ts";
import type { ExtractionResult } from "./fields.ts";
import { checkIntake, type IntakeRejection } from "./intake.ts";
import { PROMPT_VERSION, repairMessage, systemInstructions } from "./prompt.ts";
import { listIssues, verify, type FieldCheck } from "./verify.ts";

export type ExtractOptions = {
  /** "claude-code" (default) runs on your Claude subscription; "api" is billed per token. */
  engine?: EngineName;
  model?: string;
  effort?: Effort;
  /** How many times failed checks are sent back to Claude before the result is flagged for review. */
  maxRepairRounds?: number;
  /** api engine only; defaults to the ANTHROPIC_API_KEY environment variable. */
  apiKey?: string;
  /** claude-code engine only; defaults to the CLAUDE_BIN environment variable, then "claude". */
  claudeBin?: string;
  /** Progress messages, e.g. for a CLI or a job log. */
  onProgress?: (message: string) => void;
};

export type RunRecord = {
  engine: EngineName;
  model: string;
  effort: Effort;
  promptVersion: string;
  /** Repair rounds used (0 means the first answer passed verification). */
  repairRounds: number;
  usage: Usage;
  /** True for claude-code: the cost is what the same tokens would cost on the API, and nothing was billed. */
  costIsEquivalent: boolean;
  startedAt: string;
  durationMs: number;
};

export type ExtractOutcome =
  | { status: "rejected"; reason: IntakeRejection; message: string }
  | {
      status: "extracted";
      /** Null only if Claude never produced output matching the schema. */
      result: ExtractionResult | null;
      checks: FieldCheck[];
      /** True if any check still fails after the last repair round. */
      needsReview: boolean;
      issues: string[];
      run: RunRecord;
    };

export const DEFAULTS = {
  engine: "claude-code",
  model: "claude-sonnet-5-5",
  effort: "medium",
  maxRepairRounds: 3,
} as const;

/** The agent's single entry point: PDF bytes in; extracted fields, verification results and run metadata out. */
export async function extractContract(pdfBytes: Uint8Array, options: ExtractOptions = {}): Promise<ExtractOutcome> {
  const engine = options.engine ?? DEFAULTS.engine;
  const model = options.model ?? DEFAULTS.model;
  const effort = options.effort ?? DEFAULTS.effort;
  const maxRepairRounds = options.maxRepairRounds ?? DEFAULTS.maxRepairRounds;
  const progress = options.onProgress ?? (() => {});
  const startedAt = new Date();

  const intake = await checkIntake(pdfBytes);
  if (!intake.ok) return { status: "rejected", reason: intake.reason, message: intake.message };

  const input: EngineInput = { pdfBytes, pages: intake.pages, model, effort, instructions: systemInstructions() };
  const session: EngineSession =
    engine === "api"
      ? await openApiSession(input, { apiKey: options.apiKey })
      : await openClaudeCodeSession(input, { claudeBin: options.claudeBin });

  try {
    progress(`extracting with ${engine} (${model}, ${intake.pages.length} pages)`);
    let turn = await session.extract();
    let usage = turn.usage;
    let verification = verify(turn.output, intake.pages);
    let repairRounds = 0;

    while (!verification.passed && repairRounds < maxRepairRounds) {
      repairRounds++;
      const issues = listIssues(verification);
      progress(`repair round ${repairRounds}: ${issues.length} problem(s)`);
      turn = await session.repair(repairMessage(issues));
      usage = addUsage(usage, turn.usage);
      verification = verify(turn.output, intake.pages);
    }

    return {
      status: "extracted",
      result: verification.result,
      checks: verification.checks,
      needsReview: !verification.passed,
      issues: listIssues(verification),
      run: {
        engine,
        model,
        effort,
        promptVersion: PROMPT_VERSION,
        repairRounds,
        usage,
        costIsEquivalent: engine === "claude-code",
        startedAt: startedAt.toISOString(),
        durationMs: Date.now() - startedAt.getTime(),
      },
    };
  } finally {
    await session.close();
  }
}
