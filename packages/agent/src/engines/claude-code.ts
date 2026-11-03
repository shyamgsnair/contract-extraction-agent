import { spawn } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { extractionJsonSchema } from "../prompt.ts";
import type { EngineInput, EngineSession, Turn, Usage } from "./types.ts";

// Runs Claude Code headless (`claude -p`) on the developer's own Claude subscription, so development costs nothing
// extra. Claude reads the PDF with Claude Code's Read tool and searches the page text files with Grep.

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
    "--output-format", "json",
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
    const args = sessionId ? [...commonArgs, "--resume", sessionId, prompt] : [...commonArgs, prompt];
    const out = await runClaude(bin, args, dir);
    if (out.is_error || out.subtype !== "success") {
      throw new Error(`Claude Code run failed (${out.subtype ?? "error"}): ${String(out.result ?? "").slice(0, 500)}`);
    }
    sessionId = out.session_id;
    return { output: out.structured_output, usage: usageFrom(out) };
  }

  return {
    extract: () =>
      turn(`Extract the fields from the contract in contract.pdf (${input.pages.length} pages).

1. Read the whole PDF with the Read tool. It accepts at most 20 pages per call, so read it in page ranges ("1-20", "21-40" and so on).
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

/** The fields of `claude -p --output-format json` that we use. */
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

async function runClaude(bin: string, args: string[], cwd: string): Promise<ClaudeResult> {
  const stdout = await runCommand(bin, args, cwd);
  try {
    return JSON.parse(stdout) as ClaudeResult;
  } catch {
    throw new Error(`Claude Code returned output that is not JSON: ${stdout.slice(0, 500)}`);
  }
}

function runCommand(bin: string, args: string[], cwd: string): Promise<string> {
  const env = { ...process.env };
  for (const name of BILLING_ENV_VARS) delete env[name];

  return new Promise((resolve, reject) => {
    // stdin is closed so `claude -p` does not wait for piped input.
    const child = spawn(bin, args, { cwd, env, stdio: ["ignore", "pipe", "pipe"], timeout: TIMEOUT_MS });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => (stdout += chunk.toString()));
    child.stderr.on("data", (chunk: Buffer) => (stderr += chunk.toString()));
    child.on("error", (err) =>
      reject(
        (err as NodeJS.ErrnoException).code === "ENOENT"
          ? new Error(`Claude Code not found at "${bin}". Install it, or set CLAUDE_BIN to its path.`)
          : err,
      ),
    );
    child.on("close", (code) => {
      // `claude -p` can exit non-zero yet still print a JSON result describing the error, so prefer stdout.
      if (code === 0 || stdout.trim().startsWith("{")) resolve(stdout);
      else reject(new Error(`${bin} ${args[0]} exited with code ${code}: ${stderr.slice(0, 500)}`));
    });
  });
}
