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
