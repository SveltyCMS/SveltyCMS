/**
 * @file src/routes/(app)/config/collectionbuilder/nested-content/ddl-schema-parser.ts
 * @description Ingestion parser for reverse-engineering SQL DDL and JSON into SveltyCMS collection schemas.
 *
 * Features:
 * - Parses SQL CREATE TABLE DDL (PostgreSQL, MySQL, SQLite) into SveltyCMS collections and widgets
 * - Parses JSON sample payloads into inferred SveltyCMS collections
 * - Client-side safe with zero external runtime dependencies
 */

import { humanizeLabel, inferWidgetFromFieldName, sanitizeDbFieldName } from "../smart-inference";

export interface ParsedField {
  label: string;
  db_fieldName: string;
  widgetKey: string;
  required?: boolean;
  defaults?: Record<string, unknown>;
}

export interface ParsedSchemaResult {
  name: string;
  slug: string;
  icon: string;
  fields: ParsedField[];
}

/**
 * Parses SQL `CREATE TABLE` DDL statements into a SveltyCMS collection structure.
 *
 * @param ddl - SQL DDL string
 * @returns ParsedSchemaResult
 */
export function parseSqlDDL(ddl: string): ParsedSchemaResult {
  const clean = ddl.trim();

  // Extract table name: CREATE TABLE [IF NOT EXISTS] [schema.]tableName (...)
  const tableMatch = clean.match(
    /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:[`"'\w]+\.)?[`"']?([a-zA-Z0-9_]+)[`"']?\s*\(([\s\S]+)\)/i,
  );

  if (!tableMatch) {
    throw new Error("Invalid SQL: Could not find a valid CREATE TABLE statement.");
  }

  const rawTableName = tableMatch[1];
  const columnsBody = tableMatch[2];

  const collectionName = humanizeLabel(rawTableName);
  const collectionSlug = rawTableName.toLowerCase().replace(/_/g, "-");

  const fields: ParsedField[] = [];

  // Split lines inside parentheses by commas, ignoring commas inside nested parentheses
  const lines: string[] = [];
  let current = "";
  let depth = 0;

  for (let i = 0; i < columnsBody.length; i++) {
    const char = columnsBody[i];
    if (char === "(") depth++;
    else if (char === ")") depth--;

    if (char === "," && depth === 0) {
      lines.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  if (current.trim()) lines.push(current.trim());

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Skip table constraints (PRIMARY KEY (...), CONSTRAINT ..., FOREIGN KEY (...), UNIQUE (...), KEY ...)
    if (/^(?:CONSTRAINT|PRIMARY\s+KEY|FOREIGN\s+KEY|UNIQUE|KEY|INDEX|CHECK)\b/i.test(trimmed)) {
      continue;
    }

    // Match column definition: columnName TYPE [CONSTRAINTS]
    const colMatch = trimmed.match(
      /^[`"']?([a-zA-Z0-9_]+)[`"']?\s+([a-zA-Z0-9_]+(?:\s*\([^)]+\))?)([\s\S]*)$/i,
    );
    if (!colMatch) continue;

    const colName = colMatch[1];
    const colTypeRaw = colMatch[2].toUpperCase();
    const constraints = (colMatch[3] || "").toUpperCase();

    // Skip standard auto-id or primary key id if it's just `id` (SveltyCMS has built-in _id)
    if (colName.toLowerCase() === "id" && constraints.includes("PRIMARY KEY")) {
      continue;
    }

    const colType = colTypeRaw.split("(")[0].trim();
    const isRequired = constraints.includes("NOT NULL") && !constraints.includes("DEFAULT");
    const sanitizedName = sanitizeDbFieldName(colName);
    const label = humanizeLabel(colName);

    // Heuristic widget mapping based on SQL column type and name
    let widgetKey = "input";
    let defaults: Record<string, unknown> = {};

    // Prioritize foreign key references
    if (
      constraints.includes("REFERENCES") ||
      (sanitizedName.endsWith("_id") && !sanitizedName.startsWith("uuid"))
    ) {
      widgetKey = "relation";
      const targetTable = (
        colMatch[3]?.match(/REFERENCES\s+[`"']?([a-zA-Z0-9_]+)/i)?.[1] ||
        sanitizedName.replace(/_id$/, "")
      ).toLowerCase();
      defaults = { relationCollection: targetTable, displayField: "name" };
    } else if (colType === "BOOLEAN" || colType === "BOOL" || colTypeRaw.startsWith("TINYINT(1)")) {
      widgetKey = "boolean";
    } else if (
      colType === "INT" ||
      colType === "INTEGER" ||
      colType === "BIGINT" ||
      colType === "SMALLINT" ||
      colType === "SERIAL"
    ) {
      widgetKey = "number";
    } else if (
      colType === "DECIMAL" ||
      colType === "NUMERIC" ||
      colType === "FLOAT" ||
      colType === "DOUBLE" ||
      colType === "REAL"
    ) {
      // If column name relates to price/cost/fee, prefer Currency
      if (
        sanitizedName.includes("price") ||
        sanitizedName.includes("cost") ||
        sanitizedName.includes("amount") ||
        sanitizedName.includes("fee") ||
        sanitizedName.includes("salary")
      ) {
        widgetKey = "currency";
        defaults = { currency: "USD" };
      } else {
        widgetKey = "number";
      }
    } else if (
      colType === "DATE" ||
      colType === "DATETIME" ||
      colType === "TIMESTAMP" ||
      colType === "TIMESTAMPTZ"
    ) {
      widgetKey = "date";
      defaults = { includeTime: colType !== "DATE" };
    } else if (
      colType === "TEXT" ||
      colType === "MEDIUMTEXT" ||
      colType === "LONGTEXT" ||
      colType === "CLOB"
    ) {
      widgetKey = "markdown";
    } else {
      // Fall back to name-based smart inference
      const inferred = inferWidgetFromFieldName(sanitizedName);
      widgetKey = inferred.widgetKey;
      defaults = inferred.defaults || {};
    }

    fields.push({
      label,
      db_fieldName: sanitizedName,
      widgetKey,
      required: isRequired,
      defaults,
    });
  }

  return {
    name: collectionName,
    slug: collectionSlug,
    icon: "bi:database",
    fields,
  };
}

/**
 * Parses a sample JSON payload into a SveltyCMS collection structure.
 *
 * @param jsonStr - JSON string representing an object or array of objects
 * @param fallbackName - Fallback collection name if not derivable
 * @returns ParsedSchemaResult
 */
export function parseJsonSample(jsonStr: string, fallbackName = "Sample Data"): ParsedSchemaResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonStr);
  } catch {
    throw new Error("Invalid JSON: Please provide a valid JSON object or array.");
  }

  // If array, inspect the first item
  const sampleObj = Array.isArray(parsed) ? parsed[0] : parsed;
  if (!sampleObj || typeof sampleObj !== "object" || Array.isArray(sampleObj)) {
    throw new Error("Invalid JSON: Expected a JSON object with key-value pairs.");
  }

  const record = sampleObj as Record<string, unknown>;
  const fields: ParsedField[] = [];

  for (const [key, value] of Object.entries(record)) {
    // Skip raw id if simple primitive
    if (key.toLowerCase() === "id" || key === "_id") continue;

    const sanitizedName = sanitizeDbFieldName(key);
    const label = humanizeLabel(key);
    let widgetKey = "input";
    let defaults: Record<string, unknown> = {};

    if (typeof value === "boolean") {
      widgetKey = "boolean";
    } else if (typeof value === "number") {
      if (
        sanitizedName.includes("price") ||
        sanitizedName.includes("cost") ||
        sanitizedName.includes("amount")
      ) {
        widgetKey = "currency";
        defaults = { currency: "USD" };
      } else {
        widgetKey = "number";
      }
    } else if (Array.isArray(value)) {
      if (value.every((v) => typeof v === "string")) {
        widgetKey = "tags";
      } else {
        widgetKey = "repeater";
      }
    } else if (typeof value === "string") {
      // Check for ISO Date string
      if (/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2})?/.test(value)) {
        widgetKey = "date";
        defaults = { includeTime: value.includes("T") };
      } else {
        const inferred = inferWidgetFromFieldName(sanitizedName);
        widgetKey = inferred.widgetKey;
        defaults = inferred.defaults || {};
      }
    } else if (value && typeof value === "object") {
      widgetKey = "relation";
      defaults = { relationCollection: sanitizedName, displayField: "name" };
    }

    fields.push({
      label,
      db_fieldName: sanitizedName,
      widgetKey,
      defaults,
    });
  }

  return {
    name: humanizeLabel(fallbackName),
    slug: fallbackName.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
    icon: "bi:file-earmark-code",
    fields,
  };
}
