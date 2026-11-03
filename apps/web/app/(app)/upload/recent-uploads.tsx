"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { UploadRow } from "@/lib/uploads";

const POLL_MS = 3000;

/** Recent uploads with live status. While anything is running, the list refreshes itself every few seconds. */
export function RecentUploads({ rows }: { rows: UploadRow[] }) {
  const router = useRouter();
  const anyRunning = rows.some((r) => r.status === "running");

  useEffect(() => {
    if (!anyRunning) return;
    const timer = setInterval(() => router.refresh(), POLL_MS);
    return () => clearInterval(timer);
  }, [anyRunning, router]);

  if (rows.length === 0) return <p className="text-sm text-muted-foreground">No uploads yet.</p>;

  return (
    <div className="rounded-lg border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>File</TableHead>
            <TableHead>Uploaded</TableHead>
            <TableHead>Status</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.documentId}>
              <TableCell className="font-medium">{r.fileName}</TableCell>
              <TableCell className="text-muted-foreground">{new Date(r.uploadedAt).toLocaleString()}</TableCell>
              <TableCell>
                <StatusBadge row={r} />
              </TableCell>
              <TableCell className="text-right">
                {r.contractId && (r.status === "to_review" || r.status === "flagged") && (
                  <Link href={`/contracts/${r.contractId}`} className="text-sm text-brand-deep underline">
                    Review
                  </Link>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function StatusBadge({ row }: { row: UploadRow }) {
  const seconds = row.durationMs ? ` in ${Math.round(row.durationMs / 1000)}s` : "";
  switch (row.status) {
    case "running":
      return (
        <span className="inline-flex items-center gap-2 text-sm">
          <span className="size-2 animate-pulse rounded-full bg-brand" /> Extracting…
        </span>
      );
    case "stalled":
      return <Badge variant="destructive" title="Running for over 20 minutes; the server may have restarted. Upload again with a new copy, or re-run from the CLI.">Stalled</Badge>;
    case "failed":
      return (
        <Badge variant="destructive" title={row.error ?? undefined}>
          Failed{row.error ? `: ${row.error.slice(0, 60)}` : ""}
        </Badge>
      );
    case "flagged":
      return <Badge variant="destructive">Done{seconds}, failed verification</Badge>;
    case "to_review":
      return <Badge variant="secondary">Done{seconds}, ready to review</Badge>;
    default:
      return <Badge variant="outline">Not extracted</Badge>;
  }
}
