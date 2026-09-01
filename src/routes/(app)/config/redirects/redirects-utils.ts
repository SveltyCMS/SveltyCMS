/**
 * @file src/routes/(app)/config/redirects/redirects-utils.ts
 * @description Pure helpers for redirect manager UI and server validation.
 *
 * ### Features:
 * - Path / URL validation for from/to fields
 * - Redirect type and payload normalization
 * - Client-side search filter for table rows
 */

export type RedirectTypeCode = 301 | 302 | 307 | 308;

export interface RedirectDraft {
  id?: string;
  from: string;
  to: string;
  type: number;
  active: boolean;
  isRegex: boolean;
}

const ABSOLUTE_URL = /^https?:\/\/.+/i;

/**
 * Conservative ReDoS guard for regex redirect sources (checked at SAVE time —
 * the resolver runs on every request with visitor-controlled input and cannot
 * be made safe against arbitrary admin patterns, so catastrophic patterns must
 * never enter the database).
 *
 * Rejects classic exponential-backtracking families:
 * - nested quantifiers: `(a+)+`, `([a-z]+)*`, `(a{2,5})+`
 * - quantified ambiguous alternations: `(a|a)+`, `(a|aa)*`
 *
 * Allows non-catastrophic structures: single quantifiers (`^/blog/[0-9]+`),
 * optional groups (`(a|b)?`, `(a+)?`), plain alternation without quantifier
 * (`(ab|cd)`). May over-reject a few mathematically-safe patterns (e.g.
 * disjoint `(a|b)+`) — acceptable for an admin-facing validator.
 */
export function isSafeRedirectRegex(pattern: string): boolean {
  if (!pattern || pattern.length > 512) return false; // empty matches everything; sanity cap on rule size
  try {
    new RegExp(pattern); // must compile
  } catch {
    return false;
  }
  // Mask escapes and character classes so only structural tokens remain.
  const masked = pattern.replace(/\\./g, "x").replace(/\[[^\]]*\]/g, "x");
  return !hasDangerousNestedQuantifier(masked);
}

/**
 * Stack scan for ReDoS structure: a quantified group (`*`, `+` or `{n,m}`)
 * that itself contains another quantifier or an alternation — the classic
 * exponential-backtracking families (`(a+)+`, `(a|a)*`, `((a)+)+`, `(a{2,5})+`).
 * A group ending in `?` (optional, once) is safe and not flagged. Conservatively
 * over-rejects a few mathematically-safe patterns (e.g. disjoint `(a|b)+`).
 */
function hasDangerousNestedQuantifier(masked: string): boolean {
  // Stack: does the currently-open group contain a quantifier or alternation?
  const groupHasRisk: boolean[] = [];
  let i = 0;
  while (i < masked.length) {
    const c = masked[i];
    if (c === "\\") {
      i += 2;
      continue;
    }
    if (c === "[") {
      while (i < masked.length && masked[i] !== "]") i++;
      i++;
      continue;
    }
    if (c === "(") {
      groupHasRisk.push(false);
      i++;
      continue;
    }
    if (c === ")") {
      const innerHasRisk = groupHasRisk.pop() ?? false;
      // Group closed: if it contains risk and is itself quantified by *, + or {,
      // that is a nested quantifier (ReDoS).
      if (innerHasRisk) {
        let j = i + 1;
        while (j < masked.length && /\s/.test(masked[j])) j++;
        const q = masked[j];
        if (q === "*" || q === "+" || q === "{") return true;
      }
      // A group containing risk marks its parent group as risky too.
      if (groupHasRisk.length > 0) {
        groupHasRisk[groupHasRisk.length - 1] =
          groupHasRisk[groupHasRisk.length - 1] || innerHasRisk;
      }
      i++;
      continue;
    }
    // Quantifiers and alternation inside a group mark it risky.
    if (c === "*" || c === "+" || c === "{" || c === "}" || c === "|" || c === "?") {
      if (groupHasRisk.length > 0) groupHasRisk[groupHasRisk.length - 1] = true;
    }
    i++;
  }
  return false;
}

/**
 * Normalize a path: trim, ensure leading slash for relative paths (unless regex).
 */
export function normalizeRedirectPath(path: string, isRegex = false): string {
  const trimmed = path.trim();
  if (!trimmed) return "";
  if (isRegex || ABSOLUTE_URL.test(trimmed) || trimmed.startsWith("/")) {
    return trimmed;
  }
  return `/${trimmed}`;
}

/**
 * Validate "from" path (must be non-empty; relative paths start with / unless regex).
 */
export function validateRedirectFrom(from: string, isRegex = false): string | null {
  const value = from.trim();
  if (!value) return "From path is required";
  if (!isRegex && !value.startsWith("/") && !ABSOLUTE_URL.test(value)) {
    return "From path must start with /";
  }
  if (value.includes(" ") && !isRegex) {
    return "From path must not contain spaces";
  }
  if (isRegex && !isSafeRedirectRegex(value)) {
    return "Regex pattern is unsafe (nested quantifiers / ambiguous alternations can cause ReDoS)";
  }
  return null;
}

/**
 * Validate "to" destination (relative path or absolute http(s) URL).
 */
export function validateRedirectTo(to: string): string | null {
  const value = to.trim();
  if (!value) return "To path is required";
  if (!value.startsWith("/") && !ABSOLUTE_URL.test(value)) {
    return "To path must start with / or be an absolute http(s) URL";
  }
  return null;
}

/**
 * Normalize and clamp redirect type to a supported HTTP code.
 */
export function normalizeRedirectType(type: unknown): RedirectTypeCode {
  const n = typeof type === "string" ? parseInt(type, 10) : Number(type);
  if (n === 302 || n === 307 || n === 308) return n;
  return 301;
}

/**
 * Validate a full draft; returns field → error map (empty if valid).
 */
export function validateRedirectDraft(draft: RedirectDraft): Record<string, string> {
  const errors: Record<string, string> = {};
  const fromErr = validateRedirectFrom(draft.from, draft.isRegex);
  if (fromErr) errors.from = fromErr;
  const toErr = validateRedirectTo(draft.to);
  if (toErr) errors.to = toErr;
  return errors;
}

/**
 * Build a server-ready payload from a draft (normalized paths + type).
 */
export function toRedirectPayload(draft: RedirectDraft): RedirectDraft {
  return {
    id: draft.id,
    from: normalizeRedirectPath(draft.from, draft.isRegex),
    to: normalizeRedirectPath(draft.to, false),
    type: normalizeRedirectType(draft.type),
    active: Boolean(draft.active),
    isRegex: Boolean(draft.isRegex),
  };
}

/**
 * Parse nested collection `data` (object or JSON string) and map source/target → from/to.
 * Used by admin list load when rows come from content collections or redirectsMV.
 */
export function normalizeRedirectRow(
  r: Record<string, unknown> | null | undefined,
): RedirectDraft & {
  _id?: string;
  id?: string;
} {
  if (!r) {
    return { from: "", to: "", type: 301, active: true, isRegex: false };
  }
  let nested: Record<string, unknown> = {};
  const rawData = r.data;
  if (rawData && typeof rawData === "object") {
    nested = rawData as Record<string, unknown>;
  } else if (typeof rawData === "string" && rawData.trim()) {
    try {
      const parsed = JSON.parse(rawData);
      if (parsed && typeof parsed === "object") nested = parsed as Record<string, unknown>;
    } catch {
      /* ignore */
    }
  }
  const from = String(r.from || r.source || nested.from || nested.source || "");
  const to = String(r.to || r.target || nested.to || nested.target || "");
  return {
    id: (r._id || r.id) as string | undefined,
    _id: (r._id || r.id) as string | undefined,
    from,
    to,
    type: normalizeRedirectType(r.type ?? nested.type ?? 301),
    active: r.active !== false && nested.active !== false && r.active !== 0,
    isRegex: Boolean(r.isRegex ?? nested.isRegex),
  };
}

/**
 * Filter redirect rows by free-text search on from/to paths.
 */
export function filterRedirectsByQuery<T extends { from: string; to: string }>(
  rows: T[],
  query: string,
): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return rows;
  return rows.filter((r) => r.from.toLowerCase().includes(q) || r.to.toLowerCase().includes(q));
}
