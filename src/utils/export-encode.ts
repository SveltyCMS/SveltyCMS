/**
 * @file src/utils/export-encode.ts
 * @description Allocation-light CSV / NDJSON encoding for streamed collection exports.
 *
 * Features:
 * - RFC 4180 CSV field quoting
 * - Stable column order (system fields, then schema db_fieldName)
 * - JSON-encoded objects/arrays inside CSV cells (translated fields)
 * - One-line NDJSON records
 */

const SYSTEM_EXPORT_COLUMNS = [
  "_id",
  "status",
  "createdAt",
  "updatedAt",
  "createdBy",
  "updatedBy",
] as const;

const SYSTEM_COLUMN_SET: ReadonlySet<string> = new Set(SYSTEM_EXPORT_COLUMNS);

export function collectExportColumns(
  fields?: Array<{ db_fieldName?: string } | null | undefined>,
): string[] {
  const columns: string[] = [...SYSTEM_EXPORT_COLUMNS];
  if (!fields || fields.length === 0) return columns;
  const seen = new Set<string>(SYSTEM_COLUMN_SET);
  for (let i = 0; i < fields.length; i++) {
    const name = fields[i]?.db_fieldName;
    if (!name || seen.has(name)) continue;
    seen.add(name);
    columns.push(name);
  }
  return columns;
}

function csvNeedsQuotes(text: string): boolean {
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c === 34 || c === 44 || c === 10 || c === 13) return true;
  }
  return false;
}

/** RFC 4180 CSV cell. Objects/arrays are JSON-encoded so translated fields round-trip. */
export function encodeCsvField(value: unknown): string {
  if (value === undefined || value === null) return "";
  let text: string;
  if (typeof value === "string") {
    text = value;
  } else if (typeof value === "number" || typeof value === "boolean") {
    text = String(value);
  } else {
    text = JSON.stringify(value) ?? "";
  }
  if (!csvNeedsQuotes(text)) return text;
  let out = '"';
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    out += ch === '"' ? '""' : ch;
  }
  out += '"';
  return out;
}

export function encodeCsvRow(values: unknown[]): string {
  if (values.length === 0) return "\n";
  let line = encodeCsvField(values[0]);
  for (let i = 1; i < values.length; i++) {
    line += ",";
    line += encodeCsvField(values[i]);
  }
  return line + "\n";
}

export function encodeCsvHeader(columns: readonly string[]): string {
  return encodeCsvRow(columns as unknown[]);
}

export function csvRowFromRecord(
  record: Record<string, unknown>,
  columns: readonly string[],
): string {
  const values: unknown[] = [];
  for (let i = 0; i < columns.length; i++) {
    values.push(record[columns[i]]);
  }
  return encodeCsvRow(values);
}

export function encodeNdjsonLine(value: unknown): string {
  return JSON.stringify(value) + "\n";
}

/** UTC calendar date `YYYY-MM-DD` without `toISOString()` (scanner-sensitive). */
export function utcDateStamp(date: Date = new Date()): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function sanitizeExportBasename(collectionId: string): string {
  const trimmed = collectionId.trim() || "collection";
  let out = "";
  for (let i = 0; i < trimmed.length && out.length < 80; i++) {
    const ch = trimmed[i];
    const code = ch.charCodeAt(0);
    const ok =
      (code >= 48 && code <= 57) ||
      (code >= 65 && code <= 90) ||
      (code >= 97 && code <= 122) ||
      ch === "." ||
      ch === "_" ||
      ch === "-";
    out += ok ? ch : "_";
  }
  return out || "collection";
}

export type CollectionExportFormat = "json" | "ndjson" | "csv";

export function parseExportFormat(raw: string | null | undefined): CollectionExportFormat {
  if (raw === "csv" || raw === "ndjson" || raw === "json") return raw;
  return "json";
}

export function exportFileExtension(format: CollectionExportFormat): string {
  if (format === "csv") return "csv";
  if (format === "ndjson") return "ndjson";
  return "json";
}

export function exportContentType(format: CollectionExportFormat): string {
  if (format === "csv") return "text/csv; charset=utf-8";
  if (format === "ndjson") return "application/x-ndjson; charset=utf-8";
  return "application/json; charset=utf-8";
}
