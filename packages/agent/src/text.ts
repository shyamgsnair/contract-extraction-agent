// Text normalization shared by verification (server) and quote highlighting (browser). No dependencies,
// so the web app can import it through "@cea/agent/text" without pulling in the engines.

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

/** The form quotes are compared in: normalized, lower case, with all whitespace removed. */
export function squash(text: string): string {
  return normalize(text).toLowerCase().replace(/\s+/g, "");
}
