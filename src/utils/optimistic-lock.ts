/**
 * @file src/utils/optimistic-lock.ts
 * @description Version tokens for optimistic concurrency control on content writes.
 *
 * The write path accepts three token shapes and always compares epoch milliseconds:
 * - a bare ISO timestamp (`2026-10-21T15:04:05.000Z`) — the `updatedAt` a client loaded;
 * - epoch milliseconds (`1761050000000`);
 * - the wire ETag emitted by the read lane (`"<id>-<updatedAt>"`), which is what an
 *   HTTP caller echoes back in `If-Match`.
 *
 * `If-Match: *` means "no precondition" (RFC 9110) and normalizes to `null`.
 *
 * ### Features:
 * - Fail-closed: an unparseable current value never matches a token.
 * - Dependency-free and pure — the hot write path only does one integer compare.
 */

/** Token supplied by a caller; `null` means "no precondition". */
export type VersionToken = string | number | null;

/** ISO or SQL timestamp at the end of a string (the `updatedAt` half of a wire ETag). */
const TRAILING_ISO = /(\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?)$/;

/** Epoch milliseconds at the end of a string (never matches a UUID's 12-hex tail). */
const TRAILING_EPOCH = /(\d{13,})$/;

/**
 * Normalize an `If-Match` / `expectedVersion` value.
 *
 * Quoting (`W/"…"`) and the ETag `<id>-` prefix are stripped so every shape
 * reduces to the timestamp the comparison needs. Unrecognized values are
 * returned as-is; {@link matchesVersion} then fails closed if they are not
 * parseable as a time.
 */
export function normalizeExpectedVersion(raw: unknown): VersionToken {
  if (raw === undefined || raw === null) return null;
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  if (typeof raw !== "string") return null;

  let value = raw.trim();
  if (!value || value === "*") return null;
  if (value.startsWith("W/")) value = value.slice(2).trim();
  if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) {
    value = value.slice(1, -1).trim();
  }

  const iso = TRAILING_ISO.exec(value);
  if (iso) {
    let t = iso[1].replace(" ", "T");
    if (!t.endsWith("Z") && !/[+-]\d{2}(:\d{2})?$/.test(t)) t += "Z";
    return t;
  }
  const epoch = TRAILING_EPOCH.exec(value);
  if (epoch) return epoch[1];
  return value;
}

/** Epoch milliseconds for a row/field version, or `null` when it cannot be parsed. */
export function versionKey(value: unknown): number | null {
  if (value instanceof Date) {
    const ms = value.getTime();
    return Number.isNaN(ms) ? null : ms;
  }
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    if (/^\d+$/.test(trimmed)) return Number(trimmed);
    const normalized = trimmed.replace(" ", "T");
    const withZ =
      normalized.endsWith("Z") || /[+-]\d{2}(:\d{2})?$/.test(normalized)
        ? normalized
        : `${normalized}Z`;
    const ms = Date.parse(withZ);
    if (!Number.isNaN(ms)) return ms;
    const fallback = Date.parse(trimmed);
    return Number.isNaN(fallback) ? null : fallback;
  }
  return null;
}

/**
 * True when the stored version equals the caller's token.
 * A `null` token (absent precondition) always matches; otherwise both sides must
 * parse and be equal — an unreadable row version is a conflict, never a pass.
 */
export function matchesVersion(current: unknown, expected: VersionToken): boolean {
  // Normalize here as well: callers pass a raw `If-Match` value as often as a
  // value that already went through `normalizeExpectedVersion`.
  const token = normalizeExpectedVersion(expected);
  if (token === null) return true;
  const currentKey = versionKey(current);
  const expectedKey = versionKey(token);
  if (currentKey === null || expectedKey === null) return false;
  return currentKey === expectedKey;
}

/**
 * Render a stored row version for a wire ETag (`"<id>-<version>"`).
 *
 * Drizzle adapters hand back a `Date`, and `String(date)` produces an
 * RFC-2822-style string that {@link normalizeExpectedVersion} cannot reduce to a
 * timestamp — every `If-Match` echo then failed closed as a stale conflict on
 * MariaDB/PostgreSQL while SQLite (ISO strings) passed. Always emit ISO.
 */
export function versionTokenString(value: unknown): string {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? "" : value.toISOString();
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return "";
    const ms = versionKey(trimmed);
    if (ms !== null) {
      return new Date(ms).toISOString();
    }
    return trimmed;
  }
  return value === null || value === undefined ? "" : String(value);
}
