"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import type { RunLogEntryView, RunLogView } from "@/lib/run-log";
import { cn } from "@/lib/utils";

const POLL_MS = 2000;

/** The run's log grouped by round. Inputs to Claude and outputs from Claude stand out; tool calls are quieter. */
export function RunLog({ log }: { log: RunLogView }) {
  const router = useRouter();

  useEffect(() => {
    if (!log.live) return;
    const timer = setInterval(() => router.refresh(), POLL_MS);
    return () => clearInterval(timer);
  }, [log.live, router]);

  const rounds = Map.groupBy(log.entries, (e) => e.round);

  return (
    <div className="flex max-w-5xl flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/upload" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" /> Uploads
        </Link>
        <h1 className="text-lg font-semibold">Claude log · {log.fileName}</h1>
        <RunStatus log={log} />
        {log.contractId && log.status === "succeeded" && (
          <Link href={`/contracts/${log.contractId}`} className="text-sm text-brand-deep underline">
            Review
          </Link>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        {new Date(log.startedAt).toLocaleString()} · {log.engine} · {log.model} · prompt {log.promptVersion}
        {log.durationMs !== null && ` · ${Math.round(log.durationMs / 1000)}s`}
        {log.costUsd !== null && ` · $${log.costUsd.toFixed(4)}${log.costIsEquivalent ? " equivalent API cost (nothing billed)" : ""}`}
      </p>
      <Legend />

      {log.entries.length === 0 && (
        <p className="text-sm text-muted-foreground">
          {log.live ? "Starting…" : "No log was recorded for this run (runs before the log was added have none)."}
        </p>
      )}
      {[...rounds].map(([round, entries]) => (
        <section key={round} className="flex flex-col gap-2">
          <h2 className="border-b pb-1 text-xs font-semibold tracking-widest text-muted-foreground uppercase">
            {round === 0 ? "Extraction" : `Repair round ${round}`}
          </h2>
          {entries.map((e) => (
            <Entry key={e.id} entry={e} />
          ))}
        </section>
      ))}
      {log.live && (
        <p className="inline-flex items-center gap-2 text-sm text-muted-foreground">
          <span className="size-2 animate-pulse rounded-full bg-brand" /> Claude is working…
        </p>
      )}
    </div>
  );
}

function RunStatus({ log }: { log: RunLogView }) {
  if (log.live) return <Badge variant="secondary">Running</Badge>;
  if (log.status === "running") return <Badge variant="destructive">Stalled</Badge>;
  if (log.status === "failed") return <Badge variant="destructive">Failed</Badge>;
  return <Badge>Finished</Badge>;
}

function Legend() {
  return (
    <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
      <span className="inline-flex items-center gap-1.5">
        <span className="size-3 rounded-sm bg-sky-500" /> Input to Claude
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="size-3 rounded-sm bg-brand" /> Output from Claude
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="size-3 rounded-sm bg-muted-foreground/40" /> Tool calls
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="size-3 rounded-sm bg-emerald-600" /> Our checks
      </span>
    </div>
  );
}

function Entry({ entry: e }: { entry: RunLogEntryView }) {
  switch (e.kind) {
    case "input":
      return (
        <Block tone="border-sky-500 bg-sky-500/5" label="→ Input to Claude" labelTone="text-sky-700 dark:text-sky-400" entry={e}>
          {/* The system instructions are long and the same every run, so they start collapsed. */}
          {e.text && <Body text={e.text} collapsed={e.title.startsWith("System instructions")} />}
        </Block>
      );
    case "output":
      return (
        <Block tone="border-brand bg-brand/5" label="← Output from Claude" labelTone="text-brand-deep" entry={e}>
          {e.text && <Body text={e.text} />}
          {e.title === "Structured result" && <StructuredResult data={e.data} />}
        </Block>
      );
    case "tool_call":
      return (
        <div className="ml-6 border-l-2 border-muted-foreground/30 pl-3 text-xs">
          <span className="font-semibold text-muted-foreground">tool call</span> <code>{e.title}</code>
        </div>
      );
    case "tool_result":
      return (
        <details className="ml-6 border-l-2 border-muted-foreground/30 pl-3 text-xs">
          <summary className={cn("cursor-pointer text-muted-foreground", e.ok === false && "text-destructive")}>
            {e.title}
            {e.text && <span className="ml-2 opacity-70">{preview(e.text)}</span>}
          </summary>
          {e.text && <pre className="mt-1 max-h-64 overflow-auto rounded bg-muted p-2 whitespace-pre-wrap">{e.text}</pre>}
        </details>
      );
    case "check":
      return (
        <Block
          tone={e.ok ? "border-emerald-600 bg-emerald-600/5" : "border-destructive bg-destructive/5"}
          label="Our checks (code, not Claude)"
          labelTone={e.ok ? "text-emerald-700 dark:text-emerald-400" : "text-destructive"}
          entry={e}
        >
          {e.text && <Body text={e.text} />}
        </Block>
      );
    case "usage":
      return <p className="text-right text-xs text-muted-foreground">{e.title}</p>;
  }
}

function Block({
  tone,
  label,
  labelTone,
  entry,
  children,
}: {
  tone: string;
  label: string;
  labelTone: string;
  entry: RunLogEntryView;
  children?: ReactNode;
}) {
  return (
    <div className={cn("rounded-r-md border-l-4 p-3", tone)}>
      <div className="mb-1 flex flex-wrap items-baseline gap-2">
        <span className={cn("text-xs font-bold tracking-wide uppercase", labelTone)}>{label}</span>
        <span className="text-sm font-medium">{entry.title}</span>
        <span className="ml-auto text-xs text-muted-foreground">{new Date(entry.at).toLocaleTimeString()}</span>
      </div>
      {children}
      {entry.data !== null && entry.data !== undefined && (
        <details className="mt-2 text-xs">
          <summary className="cursor-pointer text-muted-foreground">Raw JSON</summary>
          <pre className="mt-1 max-h-96 overflow-auto rounded bg-muted p-2">{JSON.stringify(entry.data, null, 2)}</pre>
        </details>
      )}
    </div>
  );
}

function Body({ text, collapsed = false }: { text: string; collapsed?: boolean }) {
  const pre = <pre className="max-h-96 overflow-auto font-sans text-sm whitespace-pre-wrap">{text}</pre>;
  if (!collapsed) return pre;
  return (
    <details>
      <summary className="cursor-pointer text-xs text-muted-foreground">Show ({text.length.toLocaleString()} characters)</summary>
      {pre}
    </details>
  );
}

type Evidence = { value?: unknown; quote?: string | null; page?: number | null; confidence?: string; note?: string };

/** Claude's answer as a table: one row per field (and per price row) with value, page, confidence and quote. */
function StructuredResult({ data }: { data: unknown }) {
  if (!data || typeof data !== "object") return null;
  const rows: { field: string; e: Evidence }[] = [];
  for (const [field, raw] of Object.entries(data as Record<string, Evidence>)) {
    if (field === "priceList" && Array.isArray(raw?.value)) {
      (raw.value as Evidence[]).forEach((row, i) => {
        const { quote, page, confidence, ...value } = row as Evidence & Record<string, unknown>;
        rows.push({ field: `priceList[${i}]`, e: { value, quote, page, confidence } });
      });
      if (raw.value.length === 0) rows.push({ field, e: raw });
    } else rows.push({ field, e: raw ?? {} });
  }
  return (
    <div className="mt-1 overflow-x-auto">
      <table className="w-full text-xs">
        <thead className="text-left text-muted-foreground">
          <tr>
            <th className="py-1 pr-3 font-medium">Field</th>
            <th className="py-1 pr-3 font-medium">Value</th>
            <th className="py-1 pr-3 font-medium">Page</th>
            <th className="py-1 pr-3 font-medium">Confidence</th>
            <th className="py-1 font-medium">Quote</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ field, e }) => (
            <tr key={field} className="border-t align-top">
              <td className="py-1 pr-3 font-mono">{field}</td>
              <td className="py-1 pr-3">{e.value === null || e.value === undefined ? <span className="text-muted-foreground">null</span> : compact(e.value)}</td>
              <td className="py-1 pr-3">{e.page ?? ""}</td>
              <td className="py-1 pr-3">{e.confidence ?? ""}</td>
              <td className="py-1 text-muted-foreground italic">
                {e.quote ? `“${e.quote}”` : ""}
                {e.note && <span className="block not-italic">Note: {e.note}</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function compact(value: unknown): string {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") {
    return Object.entries(value)
      .map(([k, v]) => `${k}: ${String(v)}`)
      .join(", ");
  }
  return String(value);
}

function preview(text: string): string {
  const line = text.replace(/\s+/g, " ").trim();
  return line.length > 90 ? `${line.slice(0, 90)}…` : line;
}
