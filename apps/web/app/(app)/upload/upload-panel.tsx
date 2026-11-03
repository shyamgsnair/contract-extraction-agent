"use client";

import { FileUp } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, type DragEvent } from "react";
import { cn } from "@/lib/utils";
import { uploadContract, type UploadResult } from "./actions";

const MAX_BYTES = 32 * 1024 * 1024;

type Message = { fileName: string; tone: "ok" | "warn" | "error"; text: string; href?: string };

/** Drag-and-drop (or click to choose) upload. Files are sent one at a time; each gets its own result line. */
export function UploadPanel() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);

  async function upload(files: File[]) {
    for (const file of files) {
      if (file.size > MAX_BYTES) {
        addMessage({ fileName: file.name, tone: "error", text: "File is larger than 32 MB." });
        continue;
      }
      setBusy(file.name);
      const formData = new FormData();
      formData.set("file", file);
      try {
        addMessage(describe(await uploadContract(formData)));
      } catch {
        addMessage({ fileName: file.name, tone: "error", text: "Upload failed. Check that the server is running and try again." });
      }
      router.refresh(); // show the new upload in the list below
    }
    setBusy(null);
  }

  function addMessage(message: Message) {
    setMessages((previous) => [message, ...previous].slice(0, 10));
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragging(false);
    if (!busy) void upload(Array.from(e.dataTransfer.files));
  }

  return (
    <div className="flex flex-col gap-3">
      <button
        type="button"
        disabled={busy !== null}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={cn(
          "flex flex-col items-center gap-2 rounded-xl border-2 border-dashed bg-card px-6 py-12 text-center transition-colors",
          dragging ? "border-brand bg-accent" : "border-border hover:border-brand/60",
          busy && "opacity-60",
        )}
      >
        <FileUp className="size-8 text-brand" />
        <span className="font-medium">{busy ? `Uploading ${busy}…` : "Drop contract PDFs here, or click to choose"}</span>
        <span className="text-sm text-muted-foreground">
          Digital PDFs only, up to 32 MB. Scanned, password-protected, Word and image files are rejected.
        </span>
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,.pdf"
        multiple
        hidden
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = ""; // allow choosing the same file again
          void upload(files);
        }}
      />
      {messages.length > 0 && (
        <ul className="flex flex-col gap-1 text-sm">
          {messages.map((m, i) => (
            <li
              key={`${m.fileName}-${i}`}
              className={cn(
                m.tone === "ok" && "text-foreground",
                m.tone === "warn" && "text-amber-700",
                m.tone === "error" && "text-destructive",
              )}
            >
              <span className="font-medium">{m.fileName}:</span> {m.text}{" "}
              {m.href && (
                <Link href={m.href} className="text-brand-deep underline">
                  Open it
                </Link>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function describe(result: UploadResult): Message {
  switch (result.status) {
    case "started":
      return { fileName: result.fileName, tone: "ok", text: "Uploaded. Extraction is running; the status below updates on its own." };
    case "duplicate":
      return {
        fileName: result.fileName,
        tone: "warn",
        text: "Already uploaded (same file contents), so it was not processed again.",
        href: result.contractId ? `/contracts/${result.contractId}` : undefined,
      };
    case "rejected":
      return { fileName: result.fileName, tone: "error", text: result.message };
  }
}
