import { readPdfPages } from "./pdf-text.ts";

// Intake runs before anything is sent to Claude. Rejected files never reach the model.

export const MAX_BYTES = 32 * 1024 * 1024; // Claude's request size limit
export const MAX_PAGES = 600; // Claude's PDF page limit
const MIN_AVG_CHARS_PER_PAGE = 200; // below this the document is treated as scanned
const NEAR_EMPTY_PAGE_CHARS = 50;

export type IntakeRejection =
  | "too_large"
  | "not_pdf"
  | "password_protected"
  | "unreadable"
  | "too_many_pages"
  | "scanned";

export type IntakeResult =
  | { ok: true; pages: string[] }
  | { ok: false; reason: IntakeRejection; message: string };

/** Checks that a file is a digital, readable PDF and returns its page text. */
export async function checkIntake(fileBytes: Uint8Array): Promise<IntakeResult> {
  if (fileBytes.length > MAX_BYTES) {
    return reject("too_large", `File is ${(fileBytes.length / 1024 / 1024).toFixed(1)} MB; the limit is 32 MB.`);
  }

  // Identify the file by its first bytes, not its name. PDF headers may appear anywhere in the first 1 KB.
  const head = new TextDecoder("latin1").decode(fileBytes.subarray(0, 1024));
  if (!head.includes("%PDF-")) {
    return reject("not_pdf", `This is ${describeNonPdf(fileBytes)}, not a PDF. Only digital PDF contracts are supported.`);
  }

  let pages: string[];
  try {
    pages = await readPdfPages(fileBytes);
  } catch (err) {
    if (err instanceof Error && err.name === "PasswordException") {
      return reject("password_protected", "This PDF is password-protected. Remove the password and upload it again.");
    }
    return reject("unreadable", `This PDF could not be read (${err instanceof Error ? err.message : String(err)}).`);
  }

  if (pages.length > MAX_PAGES) {
    return reject("too_many_pages", `This PDF has ${pages.length} pages; the limit is ${MAX_PAGES}.`);
  }

  // Judge the whole document: real contracts often contain a few near-blank pages (signature or cover pages).
  const charCounts = pages.map((p) => p.replace(/\s+/g, "").length);
  const avgChars = charCounts.reduce((a, b) => a + b, 0) / Math.max(pages.length, 1);
  const nearEmpty = charCounts.filter((c) => c < NEAR_EMPTY_PAGE_CHARS).length;
  if (avgChars < MIN_AVG_CHARS_PER_PAGE || nearEmpty > pages.length / 2) {
    return reject(
      "scanned",
      `This PDF has almost no extractable text (${nearEmpty} of ${pages.length} pages are nearly empty), so it looks scanned. Only digital PDFs are supported.`,
    );
  }

  return { ok: true, pages };
}

function reject(reason: IntakeRejection, message: string): IntakeResult {
  return { ok: false, reason, message };
}

function describeNonPdf(bytes: Uint8Array): string {
  const startsWith = (...sig: number[]) => sig.every((b, i) => bytes[i] === b);
  if (startsWith(0x50, 0x4b, 0x03, 0x04)) return "a Word or other Office document (or a ZIP file)";
  if (startsWith(0xd0, 0xcf, 0x11, 0xe0)) return "an older Word or Office document (.doc)";
  if (startsWith(0x89, 0x50, 0x4e, 0x47)) return "a PNG image";
  if (startsWith(0xff, 0xd8, 0xff)) return "a JPEG image";
  if (startsWith(0x47, 0x49, 0x46)) return "a GIF image";
  if (startsWith(0x49, 0x49, 0x2a, 0x00) || startsWith(0x4d, 0x4d, 0x00, 0x2a)) return "a TIFF image";
  return "an unrecognized file type";
}
