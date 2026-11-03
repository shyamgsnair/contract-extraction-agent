"use client";

import { squash } from "@cea/agent/text";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/TextLayer.css";
import { Button } from "@/components/ui/button";

// The shared PDF source viewer: shows one page and highlights a quote on it. Used by the review screen
// (and anything else that needs to show where a value came from). Load it with next/dynamic and ssr: false.

// Safari does not yet support `for await (... of readableStream)`, which PDF.js uses to read a page's text.
// This adds it, the same way newer browsers define it.
const streamProto = typeof ReadableStream === "undefined" ? undefined : (ReadableStream.prototype as unknown as Record<symbol, unknown>);
if (streamProto && !streamProto[Symbol.asyncIterator]) {
  streamProto[Symbol.asyncIterator] = async function* (this: ReadableStream) {
    const reader = this.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) return;
        yield value;
      }
    } finally {
      reader.releaseLock();
    }
  };
}

// Must be set in the same module that renders <Document> (see react-pdf's README). The legacy worker
// includes the same kind of fallbacks for the background thread that parses the PDF.
pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/legacy/build/pdf.worker.min.mjs", import.meta.url).toString();

type Props = {
  url: string;
  page: number;
  onPageChange: (page: number) => void;
  /** Text to highlight on the page, matched the same way verification matches quotes. */
  quote: string | null;
};

export default function PdfViewer({ url, page, onPageChange, quote }: Props) {
  const [numPages, setNumPages] = useState<number>();
  const [width, setWidth] = useState<number>();
  const [marked, setMarked] = useState<Set<number>>(new Set());
  const [quoteFound, setQuoteFound] = useState<boolean | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Fit the page to the panel width.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.floor(entry!.contentRect.width) - 2));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Text items arrive per page; work out which ones the quote covers.
  const textItems = useRef<string[]>([]);
  const findQuote = useCallback(
    (items: string[]) => {
      textItems.current = items;
      const result = itemsCoveringQuote(items, quote);
      setMarked(result.items);
      setQuoteFound(quote ? result.found : null);
    },
    [quote],
  );
  useEffect(() => findQuote(textItems.current), [findQuote]);

  const renderText = useCallback(
    ({ str, itemIndex }: { str: string; itemIndex: number }) =>
      marked.has(itemIndex) ? `<mark class="quote-highlight">${escapeHtml(str)}</mark>` : escapeHtml(str),
    [marked],
  );

  const scrollToHighlight = useCallback(() => {
    containerRef.current?.querySelector("mark.quote-highlight")?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, []);

  const file = useMemo(() => ({ url }), [url]);

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <div className="flex items-center gap-2 text-sm">
        <Button variant="outline" size="icon-sm" disabled={page <= 1} onClick={() => onPageChange(page - 1)} aria-label="Previous page">
          <ChevronLeft />
        </Button>
        <span className="tabular-nums">
          Page {page} of {numPages ?? "…"}
        </span>
        <Button
          variant="outline"
          size="icon-sm"
          disabled={numPages === undefined || page >= numPages}
          onClick={() => onPageChange(page + 1)}
          aria-label="Next page"
        >
          <ChevronRight />
        </Button>
        {quoteFound === false && (
          <span className="text-amber-700 dark:text-amber-400">Quote text not found on this page.</span>
        )}
      </div>
      <div ref={containerRef} className="min-h-0 flex-1 overflow-auto rounded-lg border bg-muted/30">
        <Document
          file={file}
          onLoadSuccess={({ numPages }) => setNumPages(numPages)}
          loading={<p className="p-4 text-sm text-muted-foreground">Loading PDF…</p>}
          error={<p className="p-4 text-sm text-destructive">The PDF could not be loaded. Refresh the page to get a new link.</p>}
        >
          <Page
            key={page}
            pageNumber={page}
            width={width}
            renderAnnotationLayer={false}
            onGetTextSuccess={({ items }) => findQuote(items.map((item) => ("str" in item ? item.str : "")))}
            customTextRenderer={renderText}
            onRenderTextLayerSuccess={scrollToHighlight}
          />
        </Document>
      </div>
    </div>
  );
}

/**
 * Finds the text items that make up the quote. Matching ignores case, whitespace, and quote/dash style,
 * exactly like code verification. Whole items are highlighted, so the highlight may extend a little past
 * the quote. A quote that runs onto the next page is matched by its longest leading part found here.
 */
function itemsCoveringQuote(items: string[], quote: string | null): { items: Set<number>; found: boolean } {
  const empty = { items: new Set<number>(), found: false };
  if (!quote || items.length === 0) return empty;
  let text = "";
  const owner: number[] = []; // owner[i] = index of the item that character i of `text` came from
  items.forEach((str, index) => {
    const s = squash(str);
    text += s;
    for (let i = 0; i < s.length; i++) owner.push(index);
  });

  const q = squash(quote);
  for (let length = q.length; length >= Math.min(q.length, 40); length = Math.floor(length * 0.75)) {
    const at = text.indexOf(q.slice(0, length));
    if (at >= 0) {
      const covered = new Set<number>();
      for (let i = at; i < at + length; i++) covered.add(owner[i]!);
      return { items: covered, found: true };
    }
    if (length === Math.min(q.length, 40)) break;
  }
  return empty;
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
