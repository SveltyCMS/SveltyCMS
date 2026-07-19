/**
 * @file src/utils/sanitize-html.ts
 * @description Hardened HTML sanitizer.
 *
 * ### Hardening (audit 2026-07):
 * - ReDoS protection: removed while loop (single-pass regexes instead of iterative scrubbing)
 * - State-based stripHtml: O(N) character traversal, immune to malformed/missing brackets
 * - Combined event handler regex: single non-backtracking pattern for quoted and unquoted
 * - Protocol replacer function: only replaces protocol, preserves attribute structure
 *
 * Used in contexts where full DOMPurify is overkill (server-side, small widgets).
 * Strips: script, iframe, object, embed, link, style, meta, noscript, applet, form, input, button
 * and on* event handlers.
 *
 * ### Security Note:
 * Regex-based sanitization is never 100% secure for untrusted third-party content.
 * For production-grade user content, prefer DOMPurify (tree-based whitelist parser).
 */

const STRIP_TAGS = [
  "script",
  "iframe",
  "object",
  "embed",
  "link",
  "style",
  "meta",
  "noscript",
  "applet",
  "form",
  "input",
  "button",
];

const TAG_PATTERN = STRIP_TAGS.join("|");

/**
 * Strips dangerous HTML tags and event handlers from a string.
 * Single-pass regex approach — no while loop, no ReDoS surface.
 */
export function sanitizeHtml(html: string): string {
  if (!html) return "";

  // 1. Remove dangerous tags and their content via single-pass regexes
  let cleaned = html.replace(
    new RegExp(`<(${TAG_PATTERN})\\b[^>]*>([\\s\\S]*?)<\\/\\1>`, "gi"),
    "",
  );
  cleaned = cleaned.replace(new RegExp(`<(${TAG_PATTERN})\\b[^>]*\\/>`, "gi"), "");
  cleaned = cleaned.replace(new RegExp(`<(${TAG_PATTERN})\\b[^>]*>`, "gi"), "");
  // Orphan closing tags
  cleaned = cleaned.replace(new RegExp(`<\\/(${TAG_PATTERN})>`, "gi"), "");

  // 2. Strip event handlers — single combined non-backtracking pattern
  cleaned = cleaned.replace(/\s+on[a-z]+\s*=\s*(?:'[^']*'|"[^"]*"|[^\s>]+)/gi, "");

  // 3. Block malicious protocols — replacer function preserves attribute structure
  cleaned = cleaned.replace(
    /(href|src|action)\s*=\s*(['"])(javascript|data):/gi,
    (_match, attr, quote) => `${attr}=${quote}#blocked`,
  );

  return cleaned;
}

/**
 * Strips ALL HTML tags, returning plain text.
 * 🚀 Performance: State-based character traversal — O(N), immune to malformed HTML.
 */
export function stripHtml(html: string): string {
  if (!html) return "";

  let output = "";
  let inTag = false;

  for (let i = 0; i < html.length; i++) {
    if (html[i] === "<") inTag = true;
    else if (html[i] === ">") inTag = false;
    else if (!inTag) output += html[i];
  }

  return output;
}
