/**
 * @file src/utils/sanitize-html.ts
 * @description Browser-safe HTML string helpers.
 *
 * The security sanitizer is parser-based and lives in
 * `sanitize-html.server.ts` (`sanitizeHtml`, `sanitizeSvgMarkup`) because
 * `sanitize-html` is a server-side dependency. This module stays isomorphic so
 * client-shared modules (navigation, theme CSS, widget markup) can strip tags
 * and normalize entities without pulling the parser into the browser bundle.
 *
 * Features:
 * - `stripHtml()` — O(N) state-machine tag removal (plain text only, not a
 *   security sanitizer)
 * - `decodeHtmlEntities()` — numeric + `&colon;` decoding for printable ASCII,
 *   used by the XSS triage to see through entity-encoded payloads
 * - `safeHref()` — scheme allowlist for authored links rendered as `href`
 */

/**
 * Normalize numeric HTML entities (and `&colon;`) to their ASCII characters.
 * Browsers decode these inside attribute values and tag names, so a triage
 * check that wants to see `href="&#106;avascript:…"` must decode them first.
 * Only printable ASCII (32–126) is decoded — never control chars or
 * non-ASCII, so this cannot introduce metacharacters the caller lacks.
 */
export function decodeHtmlEntities(input: string): string {
  if (!input || !/[&#]/.test(input)) return input;
  return input.replace(/&colon;/gi, ":").replace(/&#(x[0-9a-fA-F]+|\d+);/gi, (match, code) => {
    const hex = code[0] === "x" || code[0] === "X";
    const n = hex ? parseInt(code.slice(1), 16) : parseInt(code, 10);
    return Number.isFinite(n) && n >= 32 && n < 127 ? String.fromCharCode(n) : match;
  });
}

/**
 * Strips ALL HTML tags, returning plain text.
 * 🚀 Performance: State-based character traversal — O(N), immune to malformed HTML.
 */
export function stripHtml(html: string): string {
  if (!html) return "";
  if (!html.includes("<")) return html;

  let output = "";
  let inTag = false;

  for (let i = 0; i < html.length; i++) {
    if (html[i] === "<") inTag = true;
    else if (html[i] === ">") inTag = false;
    else if (!inTag) output += html[i];
  }

  return output;
}

/** Link schemes that cannot execute script when placed in an `href`. */
const ALLOWED_HREF_PROTOCOLS = new Set(["http:", "https:", "mailto:", "tel:"]);

/**
 * Decode every numeric entity (plus `&colon;`), including control characters.
 * `decodeHtmlEntities()` deliberately stops at printable ASCII because it feeds
 * human-readable triage output; this variant exists to model what the URL
 * parser sees before it resolves a scheme.
 */
function decodeAllHrefEntities(input: string): string {
  return input.replace(/&colon;/gi, ":").replace(/&#(x[0-9a-fA-F]+|\d+);/gi, (match, code) => {
    const hex = code[0] === "x" || code[0] === "X";
    const n = hex ? parseInt(code.slice(1), 16) : parseInt(code, 10);
    return Number.isFinite(n) && n >= 0 && n < 0x110000 ? String.fromCodePoint(n) : match;
  });
}

/**
 * Validates a user-authored link target before it reaches an `href` attribute.
 * Returns `undefined` for script-capable or malformed schemes (`javascript:`,
 * `data:`, `vbscript:`) and for values carrying whitespace or control
 * characters. Relative paths, fragments and query-only links are allowed
 * because they cannot introduce a scheme.
 *
 * The check runs on the fully decoded value: a browser decodes
 * `java&#115;cript:` while parsing the attribute, and the URL parser strips
 * tabs/newlines, so `java&#9;script:` would otherwise slip past a raw prefix
 * test. The decoded value is returned so caller and browser agree on exactly
 * what was validated.
 */
export function safeHref(input: string | null | undefined): string | undefined {
  if (!input) return undefined;

  const value = decodeAllHrefEntities(input).trim();
  if (!value) return undefined;

  // Control characters are dropped (or terminate parsing) inside a URL, which
  // is exactly how `java&#9;script:` hides a scheme — reject them. Character
  // codes instead of a regex range: deliberately matching control characters
  // in a pattern trips `no-control-regex`, and a plain loop allocates nothing.
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code < 0x20 || code === 0x7f) return undefined;
  }

  // Spaces cannot be part of a scheme but are legal (and percent-encoded) in a
  // path, so strip them only for the scheme probe: `/my page` stays valid while
  // `java script:` is still rejected.
  const scheme = /^([a-zA-Z][a-zA-Z0-9+.-]*):/.exec(value.replace(/\s+/g, ""));
  if (!scheme) return value;

  return ALLOWED_HREF_PROTOCOLS.has(`${scheme[1].toLowerCase()}:`) ? value : undefined;
}
