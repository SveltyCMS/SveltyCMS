/**
 * @file src/utils/security/input-sanitizer.ts
 * @description Input triage + parser-based sanitization for string/markup fields.
 *
 * Strips stored XSS vectors from mutation payloads before they reach the
 * database. Runs as part of the middleware pipeline.
 *
 * Features:
 * - Parser-based sanitization (`sanitize-html`) with an explicit tag/attribute allowlist
 * - Entity-aware triage (`&#106;avascript:`, `javascript&colon;`, `<scr&#105;pt>`)
 * - Keeps the O(1) fast gate for strings without markup, schemes or handlers
 * - Preserves allowlisted formatting tags (b, i, em, strong, a, p, br, ul, ol, li, …)
 * - Validates href/src attributes against allowlisted protocols
 */

import { sanitizeHtml, HTML_ALLOWED_TAGS } from "@src/utils/sanitize-html.server";
import { decodeHtmlEntities } from "@src/utils/sanitize-html";

// ── Fast-path matchers (module scope = compiled once, zero per-call cost) ──
// Triage gate: without '<' (tags), ':' (scriptable URL scheme), '=' (handler /
// URL attribute) or an encoded-entity prefix (`&#…`, `&colon;`) no vector class
// can match. A failed gate returns the string untouched without a parser call.
const XSS_VECTOR_GATE_RE = /[<:=]|&#|&colon;/i;
// All scriptable URL schemes, tolerant of whitespace injection (`java\tscript:`).
const XSS_URL_SCHEME_RE =
  /j\s*a\s*v\s*a\s*s\s*c\s*r\s*i\s*p\s*t\s*:|v\s*b\s*s\s*c\s*r\s*i\s*p\s*t\s*:|d\s*a\s*t\s*a\s*:/;
// Any `on…=` handler — separator is whitespace, quote (post-quote injection
// `"onerror=…`), `/` (self-closing), `>` or string start. Case-insensitive.
const XSS_EVENT_HANDLER_RE = /(?:^|[\s"'>/])on\w+\s*=/i;

/** Allowlisted safe HTML tags to preserve (mirrors the parser allowlist). */
export const SAFE_TAGS = new Set<string>(HTML_ALLOWED_TAGS);

/**
 * Sanitize a single string value against XSS vectors.
 *
 * Triage gate first (clean prose never reaches the parser), then the
 * parser-based allowlist. Unknown tags are dropped while their text content is
 * kept; `script`/`style` content is removed entirely.
 */
export function sanitizeString(input: string): string {
  if (!input || typeof input !== "string") return input;

  // Fast triage: without '<', ':', '=' or an encoded-entity prefix no vector
  // class can match, so clean text (including >100KB payloads) returns as-is.
  if (!XSS_VECTOR_GATE_RE.test(input)) return input;

  return sanitizeHtml(input);
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
      if (key === "__proto__" || key === "constructor" || key === "prototype") continue;
      result[key] = sanitizeObject(raw[key], depth + 1);
    }
  }
  return result as T;
}

/** Shallow pre-check: does any own value (or nested string) contain an XSS vector or prototype key? */
function objectNeedsSanitize(obj: object): boolean {
  const raw = obj as Record<string, unknown>;
  for (const key in raw) {
    if (!Object.hasOwn(raw, key)) continue;
    if (key === "__proto__" || key === "constructor" || key === "prototype") return true;
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
 * Covers all three scriptable URL schemes and ANY `on…=` event handler, plus
 * entity-encoded forms (`&#106;avascript:`, `javascript&colon;`, `<scr&#105;pt>`)
 * that the parser would decode — the gate must never be narrower than the
 * parser it guards.
 */
export function containsXssVector(input: string): boolean {
  if (!input || typeof input !== "string") return false;
  // Fast triage: without '<', ':', '=' or an encoded-entity prefix no vector
  // class can match — this keeps the clean-text hot path allocation-free.
  if (!XSS_VECTOR_GATE_RE.test(input)) return false;
  // Browsers (and sanitize-html) decode numeric entities and `&colon;` inside
  // tag names and attribute values, so triage must see the decoded form.
  const decoded = input.includes("&") ? decodeHtmlEntities(input) : input;
  // ASCII-exact short-circuits on the decoded string: `<script`/`<iframe`
  // are the most common vectors and lowercase in practice; uppercase forms
  // fall through to the lowercase check below, which stays the source of
  // truth. Same for `on…=` handlers — the match region is pure ASCII and
  // ASCII case folding is total under /i, so a hit here is guaranteed to
  // hit on the lowercase copy too.
  if (decoded.includes("<script") || decoded.includes("<iframe")) return true;
  if (XSS_EVENT_HANDLER_RE.test(decoded)) return true;
  // ASCII-exact URL-scheme short-circuit: the common lowercase
  // `javascript:`/`data:` forms skip the lowercase copy entirely. Uppercase
  // and whitespace-injected variants fall through to the folded check below,
  // which stays the source of truth.
  if (decoded.includes("javascript:") || decoded.includes("data:")) return true;
  // The lowercase copy is only paid by the case/whitespace-folded URL scheme
  // class (`java\tscript:`-style injections need the fold to match).
  const lower = decoded.toLowerCase();
  return (
    lower.includes("<script") ||
    lower.includes("<iframe") ||
    XSS_URL_SCHEME_RE.test(lower) ||
    XSS_EVENT_HANDLER_RE.test(lower)
  );
}
