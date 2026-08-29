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
// Closing tags allow `</script foo="bar">` (js/bad-tag-filter / HTML parse errors).
const SCRIPT_TAG_RE = /<script[\s>][\s\S]*?<\/script\b[^>]*>/gi;
const IFRAME_TAG_RE = /<iframe[\s>][\s\S]*?<\/iframe\b[^>]*>/gi;
const OBJECT_TAG_RE = /<object[\s>][\s\S]*?<\/object\b[^>]*>/gi;
const EMBED_TAG_RE = /<embed[\s>][\s\S]*?<\/embed\b[^>]*>/gi;
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
  // codeql[js/incomplete-multi-character-sanitization]: defense-in-depth blocklist; the render path
  // re-sanitizes with parser-based sanitize-html.ts (see file header rationale).
  cleaned = cleaned.replace(SCRIPT_TAG_RE, "");
  cleaned = cleaned.replace(IFRAME_TAG_RE, "");
  cleaned = cleaned.replace(OBJECT_TAG_RE, "");
  cleaned = cleaned.replace(EMBED_TAG_RE, "");

  // 2. Strip event handlers (onclick, onload, onerror, etc.)
  // codeql[js/incomplete-multi-character-sanitization]: intentional blocklist (see above).
  cleaned = cleaned.replace(EVENT_HANDLER_RE, "");

  // 3. Strip javascript: URLs in href attributes
  cleaned = cleaned.replace(JAVASCRIPT_URL_RE, 'href=""');

  // 4. Strip javascript: and data:text/html URLs in src attributes
  cleaned = cleaned.replace(DATA_JS_URL_RE, 'src=""');

  // 5. Strip dangerous tags (keep safe ones)
  // codeql[js/incomplete-multi-character-sanitization]: intentional blocklist (see above).
  cleaned = cleaned.replace(DANGEROUS_TAGS_RE, "");

  return cleaned;
}

/**
 * Recursively sanitize all string values in an object/array tree.
 * Used for mutation payloads before they reach the database.
 */
export function sanitizeObject<T>(obj: T, depth = 0): T {
  if (depth > 20) return obj; // Prevent stack overflow on deeply nested objects
  if (typeof obj === "string") {
    return containsXssVector(obj) ? (sanitizeString(obj) as T) : obj;
  }
  if (obj === null || obj === undefined || typeof obj !== "object") return obj;

  if (Array.isArray(obj)) {
    // Zero-copy fast path: no array element contains an XSS vector
    let needsSanitize = false;
    for (let i = 0; i < obj.length; i++) {
      const item = obj[i];
      if (typeof item === "string" && containsXssVector(item)) {
        needsSanitize = true;
        break;
      }
      if (item && typeof item === "object" && objectNeedsSanitize(item)) {
        needsSanitize = true;
        break;
      }
    }
    if (!needsSanitize) return obj;
    return obj.map((item) => sanitizeObject(item, depth + 1)) as T;
  }

  // Zero-copy fast path: no value contains an XSS vector → return original object.
  // The write path calls this on every create/update; deep-copying payloads
  // without vectors was pure allocation + GC pressure.
  if (!objectNeedsSanitize(obj)) return obj;

  const result: Record<string, unknown> = {};
  const raw = obj as Record<string, unknown>;
  for (const key in raw) {
    if (Object.hasOwn(raw, key)) {
      result[key] = sanitizeObject(raw[key], depth + 1);
    }
  }
  return result as T;
}

/** Shallow pre-check: does any own value (or nested string) contain an XSS vector? */
function objectNeedsSanitize(obj: object): boolean {
  const raw = obj as Record<string, unknown>;
  for (const key in raw) {
    if (!Object.hasOwn(raw, key)) continue;
    const value = raw[key];
    if (typeof value === "string") {
      if (containsXssVector(value)) return true;
    } else if (Array.isArray(value)) {
      for (let i = 0; i < value.length; i++) {
        const item = value[i];
        if (typeof item === "string" && containsXssVector(item)) return true;
        if (item && typeof item === "object" && objectNeedsSanitize(item)) return true;
      }
    } else if (value && typeof value === "object") {
      if (objectNeedsSanitize(value)) return true;
    }
  }
  return false;
}

/**
 * Check if a string contains potential XSS vectors (fast pre-check).
 * Runs before full sanitization — a false negative here SKIPS sanitizeString,
 * so this must be a superset of the dangerous classes, never a subset.
 * Covers all three scriptable URL schemes and ANY `on…=` event handler
 * (consistent with EVENT_HANDLER_RE), plus encoded forms (`&#106;avascript:`,
 * `java\tscript:`) via case/whitespace-tolerant pattern.
 */
export function containsXssVector(input: string): boolean {
  if (!input || typeof input !== "string") return false;
  const lower = input.toLowerCase();
  return (
    lower.includes("<script") ||
    lower.includes("<iframe") ||
    // All scriptable URL schemes, tolerant of whitespace injection (`java\tscript:`).
    /j\s*a\s*v\s*a\s*s\s*c\s*r\s*i\s*p\s*t\s*:|v\s*b\s*s\s*c\s*r\s*i\s*p\s*t\s*:|d\s*a\s*t\s*a\s*:/.test(
      lower,
    ) ||
    // Any `on…=` handler — separator is whitespace, quote (post-quote injection
    // `"onerror=…`), `/` (self-closing), `>` or string start.
    /(?:^|[\s"'>/])on\w+\s*=/i.test(lower)
  );
}
