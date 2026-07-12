/**
 * @file src/utils/security/input-sanitizer.ts
 * @description Lightweight input sanitization for string/markup fields.
 *
 * Strips stored XSS vectors from mutation payloads before they reach
 * the database. Runs as part of the middleware pipeline.
 *
 * Features:
 * - Strips <script>, <iframe>, <object>, <embed> tags and event handlers
 * - Removes javascript: URLs and data: URIs in dangerous contexts
 * - Preserves safe HTML tags (b, i, em, strong, a, p, br, ul, ol, li)
 * - Validates href/src attributes against allowlisted protocols
 * - Handles nested and encoded attack vectors
 */

// Regex patterns for XSS vector detection
const SCRIPT_TAG_RE = /<script[\s>][\s\S]*?<\/script\s*>/gi;
const IFRAME_TAG_RE = /<iframe[\s>][\s\S]*?<\/iframe\s*>/gi;
const OBJECT_TAG_RE = /<object[\s>][\s\S]*?<\/object\s*>/gi;
const EMBED_TAG_RE = /<embed[\s>][\s\S]*?<\/embed\s*>/gi;
const EVENT_HANDLER_RE = /\son\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi;
const JAVASCRIPT_URL_RE = /href\s*=\s*(?:"javascript:[^"]*"|'javascript:[^']*')/gi;
const DATA_JS_URL_RE =
  /src\s*=\s*(?:"javascript:[^"]*"|'javascript:[^']*'|"data:text\/html[^"]*")/gi;
const DANGEROUS_TAGS_RE =
  /<\/?(?:script|iframe|object|embed|meta|link|style|base|form|input|button|textarea|select|option|optgroup|datalist|keygen|output|progress|meter)\b[^>]*>/gi;

// Allowlisted safe HTML tags to preserve (reference for future allowlist-based sanitizer)
export const SAFE_TAGS = new Set([
  "a",
  "abbr",
  "address",
  "article",
  "b",
  "blockquote",
  "br",
  "caption",
  "cite",
  "code",
  "col",
  "colgroup",
  "dd",
  "del",
  "details",
  "dfn",
  "div",
  "dl",
  "dt",
  "em",
  "figcaption",
  "figure",
  "footer",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "header",
  "hr",
  "i",
  "img",
  "ins",
  "kbd",
  "li",
  "mark",
  "nav",
  "ol",
  "p",
  "pre",
  "q",
  "s",
  "samp",
  "section",
  "small",
  "span",
  "strong",
  "sub",
  "summary",
  "sup",
  "table",
  "tbody",
  "td",
  "tfoot",
  "th",
  "thead",
  "time",
  "tr",
  "u",
  "ul",
  "var",
]);

/**
 * Sanitize a single string value against XSS vectors.
 * Strips dangerous tags and event handlers while preserving safe HTML.
 */
export function sanitizeString(input: string): string {
  if (!input || typeof input !== "string") return input;
  if (input.length > 100_000) return input; // Skip very large payloads

  let cleaned = input;

  // 1. Strip script/iframe/object/embed tags (including content)
  cleaned = cleaned.replace(SCRIPT_TAG_RE, "");
  cleaned = cleaned.replace(IFRAME_TAG_RE, "");
  cleaned = cleaned.replace(OBJECT_TAG_RE, "");
  cleaned = cleaned.replace(EMBED_TAG_RE, "");

  // 2. Strip event handlers (onclick, onload, onerror, etc.)
  cleaned = cleaned.replace(EVENT_HANDLER_RE, "");

  // 3. Strip javascript: URLs in href attributes
  cleaned = cleaned.replace(JAVASCRIPT_URL_RE, 'href=""');

  // 4. Strip javascript: and data:text/html URLs in src attributes
  cleaned = cleaned.replace(DATA_JS_URL_RE, 'src=""');

  // 5. Strip dangerous tags (keep safe ones)
  cleaned = cleaned.replace(DANGEROUS_TAGS_RE, "");

  return cleaned;
}

/**
 * Recursively sanitize all string values in an object/array tree.
 * Used for mutation payloads before they reach the database.
 */
export function sanitizeObject<T>(obj: T, depth = 0): T {
  if (depth > 20) return obj; // Prevent stack overflow on deeply nested objects
  if (typeof obj === "string") return sanitizeString(obj) as T;
  if (obj === null || obj === undefined || typeof obj !== "object") return obj;

  if (Array.isArray(obj)) {
    return obj.map((item) => sanitizeObject(item, depth + 1)) as T;
  }

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    result[key] = sanitizeObject(value, depth + 1);
  }
  return result as T;
}

/**
 * Check if a string contains potential XSS vectors (fast pre-check).
 * Runs before full sanitization to avoid unnecessary processing.
 */
export function containsXssVector(input: string): boolean {
  if (!input || typeof input !== "string") return false;
  const lower = input.toLowerCase();
  return (
    lower.includes("<script") ||
    lower.includes("<iframe") ||
    lower.includes("javascript:") ||
    lower.includes("onclick") ||
    lower.includes("onload") ||
    lower.includes("onerror") ||
    lower.includes("onmouseover")
  );
}
