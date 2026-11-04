import { spawn } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { clip, type EngineLog } from "../log.ts";
import { extractionJsonSchema } from "../prompt.ts";
import type { EngineInput, EngineSession, Turn, Usage } from "./types.ts";

// Runs Claude Code headless (`claude -p`) on the developer's own Claude subscription, so development costs nothing
// extra. Claude reads the PDF with Claude Code's Read tool and searches the page text files with Grep.
// Output is streamed (one JSON event per line), so every message and tool call can go to the interaction log.

const TIMEOUT_MS = 20 * 60 * 1000;

// If any of these are set, Claude Code would bill an API account instead of the subscription.
const BILLING_ENV_VARS = ["ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN", "CLAUDE_CODE_USE_BEDROCK", "CLAUDE_CODE_USE_VERTEX", "CLAUDE_CODE_USE_FOUNDRY"];

export type ClaudeCodeOptions = { claudeBin?: string };

export async function openClaudeCodeSession(input: EngineInput, options: ClaudeCodeOptions = {}): Promise<EngineSession> {
  const bin = options.claudeBin ?? process.env.CLAUDE_BIN ?? "claude";
  await assertSubscriptionLogin(bin);

  // A private working folder per contract: Claude Code can only read files inside its working directory.
  const dir = await mkdtemp(join(tmpdir(), "cea-"));
  await writeFile(join(dir, "contract.pdf"), input.pdfBytes);
  await mkdir(join(dir, "pages"));
  await Promise.all(input.pages.map((text, i) => writeFile(join(dir, "pages", pageFile(i + 1)), text)));

  const commonArgs = [
    "--print",
    "--output-format", "stream-json",
    "--verbose", // stream-json needs it; adds every message and tool call to the stream
    "--model", input.model,
    "--effort", input.effort,
    "--system-prompt", input.instructions,
    "--json-schema", JSON.stringify(extractionJsonSchema()),
    "--tools", "Read,Grep",
    "--allowed-tools", "Read,Grep",
    "--permission-mode", "dontAsk", // anything not allowed above is denied, never prompted
    "--safe-mode", // no CLAUDE.md, skills, plugins, hooks or MCP servers: the same setup on every run
    "--setting-sources", "",
  ];
  let sessionId: string | undefined;

  async function turn(prompt: string): Promise<Turn> {
    input.log({ kind: "input", title: sessionId ? "Repair message" : "Extraction prompt", text: prompt });
    const args = sessionId ? [...commonArgs, "--resume", sessionId, prompt] : [...commonArgs, prompt];
    const out = await runClaude(bin, args, dir, eventLogger(input.log, dir));
    if (out.is_error || out.subtype !== "success") {
      throw new Error(`Claude Code run failed (${out.subtype ?? "error"}): ${String(out.result ?? "").slice(0, 500)}`);
    }
    sessionId = out.session_id;
    return { output: out.structured_output, usage: usageFrom(out) };
  }

  return {
    extract: () =>
      turn(`Extract the fields from the contract in contract.pdf (${input.pages.length} pages).

1. Read contract.pdf with one Read call on the whole file. Do not pass a pages parameter: the whole file shows you every page as an image and as text, while page ranges need a PDF rendering tool that may not be installed.
2. The extracted text of each page is in pages/page-001.txt, pages/page-002.txt and so on. Quotes are checked against these files, so use Grep on the pages folder to confirm the exact wording and page of every quote.
3. Return the complete result as structured output.`),
    repair: (feedback) => turn(feedback),
    async close() {
      // Remove the working folder and the session transcript Claude Code saved for it.
      await runCommand(bin, ["purge", dir, "--yes"], dir).catch(() => undefined);
      await rm(dir, { recursive: true, force: true });
    },
  };
}

function pageFile(page: number): string {
  return `page-${String(page).padStart(3, "0")}.txt`;
}

/** The fields of the final "result" event of `claude -p --output-format stream-json` that we use. */
type ClaudeResult = {
  subtype?: string;
  is_error?: boolean;
  result?: string;
  session_id?: string;
  structured_output?: unknown;
  total_cost_usd?: number;
  modelUsage?: Record<
    string,
    { inputTokens: number; outputTokens: number; cacheReadInputTokens: number; cacheCreationInputTokens: number }
  >;
};

function usageFrom(out: ClaudeResult): Usage {
  // modelUsage covers every model in the turn, including the small model Claude Code uses for housekeeping.
  const models = Object.values(out.modelUsage ?? {});
  const sum = (pick: (m: (typeof models)[number]) => number) => models.reduce((total, m) => total + pick(m), 0);
  return {
    inputTokens: sum((m) => m.inputTokens),
    outputTokens: sum((m) => m.outputTokens),
    cacheReadTokens: sum((m) => m.cacheReadInputTokens),
    cacheWriteTokens: sum((m) => m.cacheCreationInputTokens),
    costUsd: out.total_cost_usd ?? null,
  };
}

let loginChecked = false;

/** Refuses to run unless Claude Code is logged in with a Claude subscription (not an API key). */
async function assertSubscriptionLogin(bin: string): Promise<void> {
  if (loginChecked) return;
  const status = JSON.parse(await runCommand(bin, ["auth", "status"], process.cwd())) as { authMethod?: string };
  if (status.authMethod !== "claude.ai") {
    throw new Error(
      `The claude-code engine must use your Claude subscription, but Claude Code reports auth method "${status.authMethod}". Run "claude auth login".`,
    );
  }
  loginChecked = true;
}

/** The parts of the other stream-json events that the log uses. */
type StreamEvent = {
  type?: string;
  message?: { content?: string | ContentBlock[] };
};
type ContentBlock = {
  type: string;
  text?: string;
  thinking?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
  tool_use_id?: string;
  content?: string | ContentBlock[];
  is_error?: boolean;
};

/** Turns Claude Code's stream events into log entries. */
function eventLogger(log: EngineLog, dir: string): (event: StreamEvent) => void {
  const toolNames = new Map<string, string>(); // tool call id -> tool name
  // Paths in tool calls point into the temporary working folder; show them relative to it.
  const tidy = (text: string) => text.replace(new RegExp(`\\S*${basename(dir)}/`, "g"), "");

  return (event) => {
    const blocks = typeof event.message?.content === "string" ? [] : (event.message?.content ?? []);
    for (const block of blocks) {
      if (event.type === "assistant") {
        if (block.type === "text" && block.text?.trim()) log({ kind: "output", title: "Claude says", text: block.text });
        // On a subscription, thinking usually arrives empty (only its signature); log it only when there is text.
        if (block.type === "thinking" && block.thinking?.trim()) log({ kind: "output", title: "Claude's thinking", text: block.thinking });
        if (block.type === "tool_use") {
          toolNames.set(block.id ?? "", block.name ?? "");
          // Claude Code delivers the --json-schema answer as a call to its StructuredOutput tool.
          if (block.name === "StructuredOutput") log({ kind: "output", title: "Structured result", data: block.input });
          else log({ kind: "tool_call", title: tidy(describeTool(block.name ?? "", block.input ?? {})), data: block.input });
        }
      }
      if (event.type === "user" && block.type === "tool_result") {
        const name = toolNames.get(block.tool_use_id ?? "") ?? "Tool";
        if (name === "StructuredOutput") continue; // just "Structured output provided successfully"
        log({
          kind: "tool_result",
          title: block.is_error ? `${name} failed` : `${name} result`,
          text: clip(tidy(toolResultText(block.content))),
          ok: !block.is_error,
        });
      }
    }
  };
}

function describeTool(name: string, input: Record<string, unknown>): string {
  if (name === "Read") {
    const pages = input.pages ? ` (pages ${String(input.pages)})` : "";
    return `Read ${String(input.file_path ?? "")}${pages}`;
  }
  if (name === "Grep") return `Grep "${String(input.pattern ?? "")}" in ${String(input.path ?? ".")}`;
  return `${name} ${clip(JSON.stringify(input), 120)}`;
}

/** A tool result as text. PDF page images are named, never stored. */
function toolResultText(content: string | ContentBlock[] | undefined): string {
  if (typeof content === "string") return content;
  return (content ?? [])
    .map((part) => (part.type === "text" ? (part.text ?? "") : part.type === "image" ? "[page image]" : `[${part.type}]`))
    .join("\n");
}

async function runClaude(bin: string, args: string[], cwd: string, onEvent: (event: StreamEvent) => void): Promise<ClaudeResult> {
  let result: ClaudeResult | undefined;
  const stdout = await runCommand(bin, args, cwd, (line) => {
    let event: StreamEvent;
    try {
      event = JSON.parse(line) as StreamEvent;
    } catch {
      return; // not an event line
    }
    if (event.type === "result") result = event as ClaudeResult;
    else onEvent(event);
  });
  if (!result) throw new Error(`Claude Code finished without a result: ${stdout.slice(-500)}`);
  return result;
}

function runCommand(bin: string, args: string[], cwd: string, onLine?: (line: string) => void): Promise<string> {
  const env = { ...process.env };
  for (const name of BILLING_ENV_VARS) delete env[name];

  return new Promise((resolve, reject) => {
    // stdin is closed so `claude -p` does not wait for piped input.
    const child = spawn(bin, args, { cwd, env, stdio: ["ignore", "pipe", "pipe"], timeout: TIMEOUT_MS });
    let stdout = "";
    let stderr = "";
    let partial = ""; // an incomplete last line, completed by the next chunk
    child.stdout.on("data", (chunk: Buffer) => {
      const text = chunk.toString();
      stdout += text;
      if (!onLine) return;
      const lines = (partial + text).split("\n");
      partial = lines.pop() ?? "";
      for (const line of lines) if (line.trim()) onLine(line);
    });
    child.stderr.on("data", (chunk: Buffer) => (stderr += chunk.toString()));
    child.on("error", (err) =>
      reject(
        (err as NodeJS.ErrnoException).code === "ENOENT"
          ? new Error(`Claude Code not found at "${bin}". Install it, or set CLAUDE_BIN to its path.`)
          : err,
      ),
    );
    child.on("close", (code) => {
      if (onLine && partial.trim()) onLine(partial);
      // `claude -p` can exit non-zero yet still print a JSON result describing the error, so prefer stdout.
      if (code === 0 || stdout.trim().startsWith("{")) resolve(stdout);
      else reject(new Error(`${bin} ${args[0]} exited with code ${code}: ${stderr.slice(0, 500)}`));
    });
  });
}
