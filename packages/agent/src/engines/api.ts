import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { clip } from "../log.ts";
import { normalize } from "../pdf-text.ts";
import { extractionJsonSchema } from "../prompt.ts";
import { emptyUsage, addUsage, type EngineInput, type EngineSession, type Turn, type Usage } from "./types.ts";

// Calls the Anthropic API directly with the SDK. This is billed per token, so it only runs with explicit approval.
// The PDF is sent as a document block (Claude sees page images and text). Claude can search the page text and
// read single pages through two tools, and hands in its result by calling submit_extraction. A repair round answers
// that submit call with the verification problems, and Claude submits again.

const MAX_TOKENS = 32000;
const MAX_STEPS_PER_TURN = 25; // tool calls Claude may make before it must submit
const MAX_SEARCH_HITS = 20;

// USD per million tokens. Cache writes use the 5-minute TTL (1.25x input).
const PRICES: Record<string, { input: number; output: number; cacheWrite: number; cacheRead: number }> = {
  "claude-sonnet-5-5": { input: 2, output: 10, cacheWrite: 2.5, cacheRead: 0.2 },
};

const SearchInput = z.strictObject({ query: z.string().min(1) });
const PageInput = z.strictObject({ page: z.number().int().positive() });

const tools: Anthropic.Tool[] = [
  {
    name: "search_text",
    description:
      "Search the contract's extracted page text for a word or phrase (case-insensitive). Returns up to 20 matches with their page numbers and surrounding text. Use it to find the exact wording and page for a quote.",
    input_schema: {
      type: "object",
      properties: { query: { type: "string", description: "Text to search for." } },
      required: ["query"],
      additionalProperties: false,
    },
  },
  {
    name: "get_page",
    description: "Return the full extracted text of one page. Quotes are checked against this text.",
    input_schema: {
      type: "object",
      properties: { page: { type: "integer", description: "1-based page number." } },
      required: ["page"],
      additionalProperties: false,
    },
  },
  {
    name: "submit_extraction",
    description:
      "Submit the complete extraction. Call this exactly once when you are done. If verification finds problems, the result of this call lists them; fix them and call it again with the complete corrected extraction.",
    input_schema: extractionJsonSchema() as Anthropic.Tool.InputSchema,
  },
];

export type ApiOptions = { apiKey?: string };

export async function openApiSession(input: EngineInput, options: ApiOptions = {}): Promise<EngineSession> {
  const client = new Anthropic({ apiKey: options.apiKey }); // falls back to ANTHROPIC_API_KEY
  const prompt = `Extract the fields from this contract (${input.pages.length} pages). Quotes are checked against the extracted page text, so use search_text and get_page to confirm the exact wording and page of every quote. Then call submit_extraction with the complete result.`;
  const messages: Anthropic.MessageParam[] = [
    {
      role: "user",
      content: [
        {
          type: "document",
          source: { type: "base64", media_type: "application/pdf", data: Buffer.from(input.pdfBytes).toString("base64") },
        },
        { type: "text", text: prompt },
      ],
    },
  ];
  // The submit call waiting for an answer, plus results of other tools Claude called in the same step.
  let pending: { submitId: string; otherResults: Anthropic.ToolResultBlockParam[] } | undefined;

  async function runUntilSubmit(): Promise<Turn> {
    let usage = emptyUsage();
    for (let step = 0; step < MAX_STEPS_PER_TURN; step++) {
      const message = await client.messages
        .stream({
          model: input.model,
          max_tokens: MAX_TOKENS,
          system: input.instructions,
          tools,
          messages,
          thinking: { type: "adaptive" },
          output_config: { effort: input.effort },
          cache_control: { type: "ephemeral" }, // caches the PDF and conversation so each step re-reads them cheaply
        })
        .finalMessage();
      usage = addUsage(usage, usageFrom(input.model, message.usage));

      if (message.stop_reason === "refusal") throw new Error("Claude declined to process this document.");
      if (message.stop_reason === "max_tokens") throw new Error(`Claude's answer exceeded ${MAX_TOKENS} tokens.`);
      messages.push({ role: "assistant", content: message.content });
      for (const block of message.content) {
        if (block.type === "text" && block.text.trim()) input.log({ kind: "output", title: "Claude says", text: block.text });
        if (block.type === "thinking" && block.thinking.trim()) input.log({ kind: "output", title: "Claude's thinking", text: block.thinking });
        if (block.type === "tool_use") {
          if (block.name === "submit_extraction") input.log({ kind: "output", title: "Structured result", data: block.input });
          else input.log({ kind: "tool_call", title: `${block.name} ${JSON.stringify(block.input)}`, data: block.input });
        }
      }

      const toolUses = message.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
      if (toolUses.length === 0) {
        input.log({ kind: "input", title: "Reminder", text: "Call submit_extraction with the complete result." });
        messages.push({ role: "user", content: "Call submit_extraction with the complete result." });
        continue;
      }
      const results: Anthropic.ToolResultBlockParam[] = [];
      let submit: Anthropic.ToolUseBlock | undefined;
      for (const toolUse of toolUses) {
        if (toolUse.name === "submit_extraction") submit = toolUse;
        else {
          const result = runTool(toolUse, input.pages);
          input.log({ kind: "tool_result", title: `${toolUse.name} ${result.is_error ? "failed" : "result"}`, text: clip(result.content), ok: !result.is_error });
          results.push({ type: "tool_result", tool_use_id: toolUse.id, ...result });
        }
      }
      if (submit) {
        pending = { submitId: submit.id, otherResults: results };
        return { output: submit.input, usage };
      }
      messages.push({ role: "user", content: results });
    }
    throw new Error(`Claude did not submit an extraction within ${MAX_STEPS_PER_TURN} steps.`);
  }

  return {
    extract() {
      input.log({ kind: "input", title: "Extraction prompt", text: `[the PDF, ${input.pages.length} pages]\n\n${prompt}` });
      return runUntilSubmit();
    },
    async repair(feedback) {
      if (!pending) throw new Error("repair() called before extract()");
      input.log({ kind: "input", title: "Repair message", text: feedback });
      messages.push({
        role: "user",
        content: [
          ...pending.otherResults,
          { type: "tool_result", tool_use_id: pending.submitId, is_error: true, content: feedback },
        ],
      });
      return runUntilSubmit();
    },
    async close() {},
  };
}

function runTool(toolUse: Anthropic.ToolUseBlock, pages: string[]): { content: string; is_error?: boolean } {
  if (toolUse.name === "search_text") {
    const parsed = SearchInput.safeParse(toolUse.input);
    if (!parsed.success) return { content: `Invalid input: ${parsed.error.message}`, is_error: true };
    return { content: searchPages(parsed.data.query, pages) };
  }
  if (toolUse.name === "get_page") {
    const parsed = PageInput.safeParse(toolUse.input);
    if (!parsed.success) return { content: `Invalid input: ${parsed.error.message}`, is_error: true };
    const text = pages[parsed.data.page - 1];
    if (text === undefined) return { content: `There is no page ${parsed.data.page}; the PDF has ${pages.length} pages.`, is_error: true };
    return { content: `Page ${parsed.data.page}:\n${text}` };
  }
  return { content: `Unknown tool ${toolUse.name}`, is_error: true };
}

function searchPages(query: string, pages: string[]): string {
  const needle = normalize(query).toLowerCase();
  const hits: string[] = [];
  pages.forEach((text, i) => {
    const haystack = normalize(text);
    const lower = haystack.toLowerCase();
    for (let at = lower.indexOf(needle); at >= 0 && hits.length < MAX_SEARCH_HITS; at = lower.indexOf(needle, at + 1)) {
      hits.push(`Page ${i + 1}: ...${haystack.slice(Math.max(0, at - 150), at + needle.length + 150)}...`);
    }
  });
  return hits.length > 0 ? hits.join("\n\n") : `No matches for "${query}".`;
}

function usageFrom(model: string, u: Anthropic.Usage): Usage {
  const cacheRead = u.cache_read_input_tokens ?? 0;
  const cacheWrite = u.cache_creation_input_tokens ?? 0;
  const price = PRICES[model];
  return {
    inputTokens: u.input_tokens,
    outputTokens: u.output_tokens,
    cacheReadTokens: cacheRead,
    cacheWriteTokens: cacheWrite,
    costUsd: price
      ? (u.input_tokens * price.input + u.output_tokens * price.output + cacheWrite * price.cacheWrite + cacheRead * price.cacheRead) / 1e6
      : null,
  };
}
