// The contract between extractContract and an engine. Like a Java interface: extractContract only talks to
// EngineSession, so engines can be swapped without touching verification or the repair loop.

import type { EngineLog } from "../log.ts";

export type EngineName = "claude-code" | "api";

export type Effort = "low" | "medium" | "high" | "xhigh" | "max";

export type EngineInput = {
  pdfBytes: Uint8Array;
  /** Page text from unpdf (index 0 = page 1), used by the search and page tools. */
  pages: string[];
  model: string;
  effort: Effort;
  instructions: string;
  /** Receives the interaction log: prompts sent, Claude's answers and its tool calls. */
  log: EngineLog;
};

export type Usage = {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  /** In USD. For claude-code this is the equivalent API cost (nothing is billed); null if the model's price is unknown. */
  costUsd: number | null;
};

/** One answer from Claude: its raw, unvalidated output and what that turn used. */
export type Turn = { output: unknown; usage: Usage };

/** One conversation with Claude about one contract. Repairs continue the same conversation. */
export interface EngineSession {
  extract(): Promise<Turn>;
  repair(feedback: string): Promise<Turn>;
  close(): Promise<void>;
}

export function emptyUsage(): Usage {
  return { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, costUsd: 0 };
}

export function addUsage(a: Usage, b: Usage): Usage {
  return {
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
    cacheReadTokens: a.cacheReadTokens + b.cacheReadTokens,
    cacheWriteTokens: a.cacheWriteTokens + b.cacheWriteTokens,
    costUsd: a.costUsd === null || b.costUsd === null ? null : a.costUsd + b.costUsd,
  };
}
