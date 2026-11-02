import { extractText, getDocumentProxy } from "unpdf";

/** Returns the extracted text of each page (index 0 = page 1). Throws unpdf/PDF.js errors as-is. */
export async function readPdfPages(pdfBytes: Uint8Array): Promise<string[]> {
  // PDF.js may take ownership of the buffer it is given, so pass a copy and keep the caller's bytes usable.
  const pdf = await getDocumentProxy(pdfBytes.slice());
  const { text } = await extractText(pdf, { mergePages: false });
  return text;
}

/**
 * Normalizes text so a quote from Claude can be matched against PDF text:
 * unifies quotes, dashes and spaces, expands ligatures, drops soft hyphens and collapses whitespace.
 * Case is preserved.
 */
export function normalize(text: string): string {
  return text
    .normalize("NFKC") // ligatures (ﬁ -> fi), full-width characters
    .replace(/­/g, "") // soft hyphen
    .replace(/[‘’‚‛′`´]/g, "'")
    .replace(/[“”„‟″]/g, '"')
    .replace(/[‐‑‒–—―−]/g, "-")
    .replace(/\s+/g, " ") // includes non-breaking and other Unicode spaces
    .trim();
}
