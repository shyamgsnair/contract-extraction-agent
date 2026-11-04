import { notFound } from "next/navigation";
import { Suspense } from "react";
import { getRunLog } from "@/lib/run-log";
import { RunLog } from "./run-log";

// The interaction log of one extraction run: what was sent to Claude, what came back, and our checks.
export default function RunLogPage({ params }: PageProps<"/runs/[runId]">) {
  return (
    <Suspense fallback={<p className="text-muted-foreground">Loading log…</p>}>
      <Log params={params} />
    </Suspense>
  );
}

async function Log({ params }: Pick<PageProps<"/runs/[runId]">, "params">) {
  const { runId } = await params;
  const log = await getRunLog(runId);
  if (!log) notFound();
  return <RunLog log={log} />;
}
