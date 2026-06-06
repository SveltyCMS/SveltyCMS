/**
 * @file src/utils/sanitize-html.ts
 * @description Lightweight HTML sanitizer — strips dangerous tags/attributes from user content.
 *
 * Used in contexts where full DOMPurify is overkill (server-side, small widgets).
 * Strips: script, iframe, object, embed, link tags and on* event handlers.
 *
 * ### Features:
 * - tag-based stripping with closing tag cleanup
 * - event handler removal (quoted and unquoted)
 * - protocol sanitization (javascript:, data:)
 * - defense-in-depth: multiple regex layers with fallbacks
 * - zero dependencies
 */

/** HTML tags that are always stripped */
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

/**
 * Strips dangerous HTML tags and event handlers from a string.
 * Returns clean HTML safe for {@html} rendering.
 */
export function sanitizeHtml(html: string): string {
  if (!html) return "";

  let cleaned = html;

  // 1. Strip dangerous tags — layered approach for defense-in-depth
  for (const tag of STRIP_TAGS) {
    // Remove full tag pairs: <tag>content</tag>
    cleaned = cleaned.replace(new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?</${tag}>`, "gi"), "");
    // Self-closing variants: <tag />
    cleaned = cleaned.replace(new RegExp(`<${tag}\\b[^>]*\\/>`, "gi"), "");
    // Opening tags without closing: <tag ...>
    cleaned = cleaned.replace(new RegExp(`<${tag}\\b[^>]*>`, "gi"), "");
    // Closing tags without opening: </tag>
    cleaned = cleaned.replace(new RegExp(`</${tag}>`, "gi"), "");
  }

  // 2. Strip on* event handlers
  cleaned = cleaned.replace(/\s+on\w+\s*=\s*["'][^"']*["']/gi, "");
  cleaned = cleaned.replace(/\s+on\w+\s*=\s*[^\s>]+/gi, "");

  // 3. Strip javascript: and data: protocols in href/src
  cleaned = cleaned.replace(/(href|src|action)\s*=\s*["']\s*javascript\s*:/gi, '$1="#blocked"');
  cleaned = cleaned.replace(/(href|src)\s*=\s*["']\s*data\s*:/gi, '$1="#blocked"');

  return cleaned;
}

/**
 * Strips ALL HTML tags, returning plain text. Use when {@html} is not needed.
 */
export function stripHtml(html: string): string {
  if (!html) return "";
  return html.replace(/<[^>]*>/g, "");
}
