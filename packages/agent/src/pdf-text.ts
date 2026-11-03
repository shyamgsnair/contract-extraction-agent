import { extractText, getDocumentProxy } from "unpdf";

export { normalize } from "./text.ts";

/** Returns the extracted text of each page (index 0 = page 1). Throws unpdf/PDF.js errors as-is. */
export async function readPdfPages(pdfBytes: Uint8Array): Promise<string[]> {
  // PDF.js may take ownership of the buffer it is given, so pass a copy and keep the caller's bytes usable.
  const pdf = await getDocumentProxy(pdfBytes.slice());
  const { text } = await extractText(pdf, { mergePages: false });
  return text;
}
