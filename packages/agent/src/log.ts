// The interaction log: what was sent to Claude, what Claude did and answered, and what our checks found.
// extractContract hands each entry to an optional onLog listener (like a Java event listener); storing or
// printing the entries is the caller's job.

export type LogKind =
  /** Sent to Claude: system instructions, the extraction prompt, repair messages. */
  | "input"
  /** From Claude: its text, thinking (when shown) and the structured result. */
  | "output"
  /** A tool Claude called (Read, Grep, search_text…) and what came back. */
  | "tool_call"
  | "tool_result"
  /** Our verification in code. */
  | "check"
  /** Tokens, cost and duration of one round. */
  | "usage";

export type LogEntry = {
  /** 0 is the extraction; 1, 2, 3 are repair rounds. */
  round: number;
  kind: LogKind;
  /** One-line summary, e.g. "Grep "Net" in pages/". */
  title: string;
  /** Readable body, if any. Long tool output is shortened. */
  text?: string;
  /** Raw JSON behind the entry: the structured result, tool input, check details or usage. */
  data?: unknown;
  /** For tool results and checks: false when it failed. */
  ok?: boolean;
};

/** What engines report; extractContract adds the round. */
export type EngineLogEntry = Omit<LogEntry, "round">;
export type EngineLog = (entry: EngineLogEntry) => void;

const MAX_TEXT = 4000;

/** Shortens long tool output so the log stays readable and small. */
export function clip(text: string, max = MAX_TEXT): string {
  return text.length <= max ? text : `${text.slice(0, max)}\n… (${text.length - max} more characters)`;
}
