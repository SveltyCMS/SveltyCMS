/**
 * @file src/routes/(app)/config/collectionbuilder/schema-ingestion.ts
 * @description Pure schema-ingestion engine — reverse-engineers SQL DDL and JSON samples into SveltyCMS collections.
 *
 * The engine itself is dependency-free and side-effect-free; it is invoked
 * server-side by the Collection Builder remote (`ingestSchema`) so that relation
 * targets resolve against the live collection list. Only its types are imported
 * by the client — the parsing functions never ship to the browser.
 *
 * Features:
 * - Multi-dialect SQL `CREATE TABLE` parsing (PostgreSQL, MySQL/MariaDB, SQLite)
 * - Canonical widget resolution — emits registered widget `Name`s (e.g. "Select"), not loose keys
 * - `ENUM(...)` / `CHECK (col IN (...))` → populated `Select` options
 * - `JSON`/`JSONB` → `JsonEditor`, arrays → `Tags`/`Repeater`, ISO strings → `DateTime`
 * - `REFERENCES` / `*_id` → `Relation`, resolved against the live collection list
 * - `NOT NULL` → required, `DEFAULT <literal>` → widget defaults
 */

import { humanizeLabel, inferWidgetFromFieldName, sanitizeDbFieldName } from "./smart-inference";

export interface ParsedField {
  label: string;
  db_fieldName: string;
  /** Canonical registered widget Name (e.g. `"Input"`, `"Select"`, `"Relation"`). */
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

export type SchemaIngestionMode = "sql" | "json";

export interface SchemaIngestionInput {
  mode: SchemaIngestionMode;
  /** Raw SQL DDL or JSON payload. */
  payload: string;
  /** Collection name for JSON inference (ignored for SQL, which derives it from the table). */
  collectionName?: string;
  /** Known collection names, used to resolve relation targets to real collections. */
  existingCollections?: string[];
}

// --- Widget key → registered factory Name -------------------------------------
// `smart-inference` emits loose, language-y keys ("date", "media", "boolean").
// The widget registry only registers factory `Name`s ("DateTime", "MediaUpload",
// "Checkbox"), so every emitted key is normalized to its canonical Name.
const WIDGET_NAME_BY_KEY: Record<string, string> = {
  input: "Input",
  email: "Email",
  slug: "Slug",
  number: "Number",
  currency: "Currency",
  price: "Price",
  markdown: "Markdown",
  "rich-text": "RichText",
  tags: "Tags",
  relation: "Relation",
  boolean: "Checkbox",
  checkbox: "Checkbox",
  date: "DateTime",
  datetime: "DateTime",
  "date-time": "DateTime",
  media: "MediaUpload",
  "media-upload": "MediaUpload",
  "phone-number": "PhoneNumber",
  phone: "PhoneNumber",
  rating: "Rating",
  address: "Address",
  seo: "SEO",
  repeater: "Repeater",
  json: "JsonEditor",
  "json-editor": "JsonEditor",
  select: "Select",
};

/** Normalize a loose inference key (e.g. `"date"`, `"media"`) to a registered widget Name. */
function canonicalWidgetName(key: string): string {
  const normalized = (key ?? "").trim().toLowerCase().replace(/_/g, "-");
  if (WIDGET_NAME_BY_KEY[normalized]) return WIDGET_NAME_BY_KEY[normalized];
  // Already a canonical Name ("Select") or an unknown key → Pascal-cased passthrough.
  return key ? key.charAt(0).toUpperCase() + key.slice(1) : "Input";
}

// --- SQL type families --------------------------------------------------------
const INTEGER_TYPES = new Set([
  "INT",
  "INTEGER",
  "INT2",
  "INT4",
  "INT8",
  "BIGINT",
  "SMALLINT",
  "MEDIUMINT",
  "TINYINT",
  "SERIAL",
  "BIGSERIAL",
  "SMALLSERIAL",
]);
const NUMERIC_TYPES = new Set([
  "DECIMAL",
  "NUMERIC",
  "FLOAT",
  "FLOAT4",
  "FLOAT8",
  "DOUBLE",
  "DOUBLE PRECISION",
  "REAL",
  "MONEY",
]);
const BOOLEAN_TYPES = new Set(["BOOLEAN", "BOOL", "BIT"]);
const DATE_TYPES = new Set([
  "DATE",
  "DATETIME",
  "TIMESTAMP",
  "TIMESTAMPTZ",
  "TIMESTAMP WITH TIME ZONE",
  "TIMESTAMP WITHOUT TIME ZONE",
  "TIME",
  "TIMETZ",
  "TIME WITH TIME ZONE",
  "TIME WITHOUT TIME ZONE",
]);
const TEXT_TYPES = new Set([
  "TEXT",
  "TINYTEXT",
  "MEDIUMTEXT",
  "LONGTEXT",
  "CLOB",
  "NCLOB",
  "NTEXT",
]);
const STRING_TYPES = new Set([
  "VARCHAR",
  "CHAR",
  "CHARACTER",
  "CHARACTER VARYING",
  "NCHAR",
  "NVARCHAR",
  "NVARCHAR2",
  "VARCHAR2",
  "STRING",
  "CITEXT",
]);
const UUID_TYPES = new Set(["UUID", "UNIQUEIDENTIFIER"]);
const JSON_TYPES = new Set(["JSON", "JSONB"]);
const BINARY_TYPES = new Set([
  "BYTEA",
  "BLOB",
  "TINYBLOB",
  "MEDIUMBLOB",
  "LONGBLOB",
  "BINARY",
  "VARBINARY",
]);

const SQL_TYPE_RE =
  /^([a-zA-Z][a-zA-Z0-9_]*)((?:\s+(?:PRECISION|VARYING|WITHOUT\s+TIME\s+ZONE|WITH\s+TIME\s+ZONE|TIME\s+ZONE|UNSIGNED|ZEROFILL))*)(\s*\([^)]*\))?(\s*\[\s*\])?/i;

// --- Shared helpers -----------------------------------------------------------

/** Split on top-level commas, ignoring commas nested in parentheses or quotes. */
function splitTopLevel(input: string): string[] {
  const parts: string[] = [];
  let current = "";
  let depth = 0;
  let quote: string | null = null;

  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    if (quote) {
      current += char;
      if (char === quote) quote = null;
      continue;
    }
    if (char === "'" || char === '"' || char === "`") {
      quote = char;
      current += char;
      continue;
    }
    if (char === "(") depth++;
    else if (char === ")") depth--;

    if (char === "," && depth === 0) {
      parts.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

/** Parse a `('a', 'b', 3)` / `"a", "b"` option list into plain string values. */
function parseOptionList(body: string): string[] {
  return splitTopLevel(body)
    .map((part) => part.trim().replace(/^['"`]|['"`]$/g, ""))
    .filter(Boolean);
}

/** Turn a SQL `DEFAULT` literal into a JS value (functions/identifiers are ignored). */
function parseDefaultLiteral(raw: string): unknown {
  const value = raw.trim();
  if (!value) return undefined;
  if (/^null$/i.test(value)) return null;
  if (/^(true|false)$/i.test(value)) return value.toLowerCase() === "true";
  if (/^-?\d+(\.\d+)?$/.test(value)) return Number(value);
  const quoted = value.match(/^'(.*)'$/s);
  if (quoted) return quoted[1];
  return undefined; // now(), CURRENT_TIMESTAMP, unquoted identifiers…
}

/** Resolve a guessed relation target to a real collection name (singular/plural aware). */
function resolveCollection(target: string, existing: readonly string[]): string {
  if (!target || existing.length === 0) return target;
  const normalize = (value: string) => value.toLowerCase().replace(/[-_\s]+/g, "");
  const singular = (value: string) => value.replace(/ies$/, "y").replace(/s$/, "");
  const wanted = normalize(target);

  return (
    existing.find((candidate) => {
      const normalized = normalize(candidate);
      return (
        normalized === wanted ||
        singular(normalized) === singular(wanted) ||
        normalized === `${wanted}s` ||
        singular(normalized) === wanted
      );
    }) ?? target
  );
}

/** Run the name-based heuristic engine and normalize its widget to a canonical Name. */
function inferByName(
  name: string,
  existing: readonly string[],
): { widgetKey: string; defaults: Record<string, unknown> } {
  const inferred = inferWidgetFromFieldName(name, [...existing]);
  return {
    widgetKey: canonicalWidgetName(inferred.widgetKey),
    defaults: (inferred.defaults as Record<string, unknown>) ?? {},
  };
}

function isRelationId(name: string, isPrimaryKey: boolean): boolean {
  return name.endsWith("_id") && !isPrimaryKey && !name.startsWith("uuid");
}

// --- SQL DDL ------------------------------------------------------------------

interface SqlColumn {
  name: string;
  type: string;
  constraints: string;
  enumValues?: string[];
  checkValues?: string[];
  isArray: boolean;
}

/** Classify a single already-tokenized SQL column into a ParsedField. */
function buildSqlField(column: SqlColumn, existing: readonly string[]): ParsedField {
  const { name, type, constraints } = column;
  const db_fieldName = sanitizeDbFieldName(name);
  const label = humanizeLabel(name);
  const required = /NOT\s+NULL/i.test(constraints) && !/DEFAULT\s+NULL/i.test(constraints);

  const references = constraints.match(
    /REFERENCES\s+[`"'[]?([a-zA-Z0-9_]+)[`"'\]]?(?:\s*\(\s*[`"'[]?([a-zA-Z0-9_]+)[`"'\]]?\s*\))?/i,
  );
  const isPrimaryKey = /PRIMARY\s+KEY/i.test(constraints);
  const options = column.enumValues ?? column.checkValues;
  const defaultRaw = constraints.match(/DEFAULT\s+((?:'[^']*')|(?:[^\s,]+))/i)?.[1];

  let widgetKey: string;
  let defaults: Record<string, unknown> | undefined;

  if (column.isArray) {
    // Element scalar decides Tags (string list) vs Repeater (structured list).
    const elementIsScalarString =
      TEXT_TYPES.has(type) || STRING_TYPES.has(type) || type === "ENUM" || UUID_TYPES.has(type);
    widgetKey = elementIsScalarString ? "Tags" : "Repeater";
  } else if (options && options.length > 0) {
    widgetKey = "Select";
    defaults = { options };
  } else if (references || isRelationId(db_fieldName, isPrimaryKey)) {
    widgetKey = "Relation";
    const target = references?.[1] || db_fieldName.replace(/_id$/, "");
    const displayColumn = references?.[2];
    defaults = {
      relationCollection: resolveCollection(target, existing),
      displayField: displayColumn && !/^id$/i.test(displayColumn) ? displayColumn : "name",
    };
  } else if (BOOLEAN_TYPES.has(type) || type.startsWith("TINYINT(1)")) {
    widgetKey = "Checkbox";
  } else if (INTEGER_TYPES.has(type)) {
    widgetKey = "Number";
  } else if (NUMERIC_TYPES.has(type)) {
    const inferred = inferByName(db_fieldName, existing);
    widgetKey =
      inferred.widgetKey === "Currency" || inferred.widgetKey === "Price" ? "Currency" : "Number";
    if (widgetKey === "Currency") defaults = { currency: "USD" };
  } else if (DATE_TYPES.has(type)) {
    widgetKey = "DateTime";
    defaults = { includeTime: type !== "DATE" };
  } else if (JSON_TYPES.has(type)) {
    widgetKey = "JsonEditor";
  } else if (UUID_TYPES.has(type)) {
    widgetKey = "Input";
    defaults = { type: "uuid" };
  } else if (BINARY_TYPES.has(type)) {
    widgetKey = "MediaUpload";
  } else if (TEXT_TYPES.has(type) || STRING_TYPES.has(type)) {
    widgetKey = classifyStringColumn(db_fieldName, TEXT_TYPES.has(type), existing);
    defaults = widgetKey === "Markdown" ? {} : inferByName(db_fieldName, existing).defaults;
  } else {
    const inferred = inferByName(db_fieldName, existing);
    widgetKey = inferred.widgetKey;
    defaults = inferred.defaults;
  }

  const field: ParsedField = { label, db_fieldName, widgetKey };
  if (required) field.required = true;
  if (defaults && Object.keys(defaults).length > 0) field.defaults = defaults;

  // A boolean DEFAULT literal is safe to surface on the Checkbox widget.
  if (widgetKey === "Checkbox" && defaultRaw !== undefined) {
    const literal = parseDefaultLiteral(defaultRaw);
    if (typeof literal === "boolean") field.defaults = { ...field.defaults, defaultValue: literal };
  }

  return field;
}

function classifyStringColumn(
  db_fieldName: string,
  isText: boolean,
  existing: readonly string[],
): string {
  if (/slug/i.test(db_fieldName)) return "Slug";
  const inferred = inferByName(db_fieldName, existing);
  if (inferred.widgetKey !== "Input") return inferred.widgetKey;
  if (/url|website|link/i.test(db_fieldName)) return "Input";
  // Long-form text with no stronger signal reads best as Markdown.
  return isText ? "Markdown" : "Input";
}

/**
 * Parse a SQL `CREATE TABLE` statement into a SveltyCMS collection.
 *
 * @param ddl - SQL DDL string (PostgreSQL, MySQL/MariaDB, SQLite)
 * @param existingCollections - Known collection names, used to resolve relation targets
 */
export function parseSqlDDL(
  ddl: string,
  existingCollections: readonly string[] = [],
): ParsedSchemaResult {
  const clean = ddl.trim();

  const tableMatch = clean.match(
    /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:[`"'[]?\w+[`"'\]]?\.)?[`"'[]?([a-zA-Z0-9_]+)[`"'\]]?\s*\(([\s\S]+)\)/i,
  );
  if (!tableMatch) {
    throw new Error("Invalid SQL: Could not find a valid CREATE TABLE statement.");
  }

  const rawTableName = tableMatch[1];
  const columnBody = tableMatch[2];

  const lines = splitTopLevel(columnBody).map((line) => {
    const comment = line.indexOf("--");
    return (comment >= 0 ? line.slice(0, comment) : line).trim();
  });

  // Table-level CHECK (col IN (…)) constraints are captured up-front so the column
  // loop can turn them into Select options.
  const checkHints = new Map<string, string[]>();
  for (const line of lines) {
    if (!/^(CONSTRAINT|CHECK|PRIMARY\s+KEY|FOREIGN\s+KEY|UNIQUE|KEY|INDEX)\b/i.test(line)) continue;
    const match = line.match(/CHECK\s*\(\s*[`"'[]?(\w+)[`"'\]]?\s+(?:IN|=)\s*\(([^)]*)\)/i);
    if (match) checkHints.set(match[1].toLowerCase(), parseOptionList(match[2]));
  }

  const fields: ParsedField[] = [];

  for (const line of lines) {
    if (!line) continue;
    if (/^(?:CONSTRAINT|PRIMARY\s+KEY|FOREIGN\s+KEY|UNIQUE|KEY|INDEX|CHECK)\b/i.test(line))
      continue;

    const named = line.match(/^[`"'[]?([a-zA-Z0-9_]+)[`"'\]]?\s+([\s\S]+)$/);
    if (!named) continue;

    const colName = named[1];
    let rest = named[2].trim();

    const column: SqlColumn = {
      name: colName,
      type: "UNKNOWN",
      constraints: "",
      isArray: false,
    };

    const enumMatch = rest.match(/^ENUM\s*\(([^)]*)\)/i);
    if (enumMatch) {
      column.type = "ENUM";
      column.enumValues = parseOptionList(enumMatch[1]);
      rest = rest.slice(enumMatch[0].length).trim();
    } else {
      const typeMatch = rest.match(SQL_TYPE_RE);
      if (typeMatch) {
        column.type = `${typeMatch[1]}${typeMatch[2] ?? ""}`.replace(/\s+/g, " ").toUpperCase();
        if (typeMatch[3]) column.type += typeMatch[3].replace(/\s+/g, ""); // keep "(255)" off the family lookup
        column.isArray = Boolean(typeMatch[4]);
        rest = rest.slice(typeMatch[0].length).trim();
      }
    }

    // Normalize the type for family lookups (drop any "(N)" suffix).
    column.type = column.type.replace(/\(.*\)$/, "").trim();
    column.constraints = rest;

    // Skip the built-in primary-key `id` column — SveltyCMS persists `_id`.
    if (colName.toLowerCase() === "id" && /PRIMARY\s+KEY/i.test(rest)) continue;

    const inlineCheck = rest.match(/CHECK\s*\(\s*[`"'[]?\w+[`"'\]]?\s+(?:IN|=)\s*\(([^)]*)\)/i);
    column.checkValues = inlineCheck
      ? parseOptionList(inlineCheck[1])
      : checkHints.get(colName.toLowerCase());

    fields.push(buildSqlField(column, existingCollections));
  }

  return {
    name: humanizeLabel(rawTableName),
    slug: rawTableName.toLowerCase().replace(/[_\s]+/g, "-"),
    icon: "bi:database",
    fields,
  };
}

// --- JSON sample --------------------------------------------------------------

function buildJsonField(
  key: string,
  value: unknown,
  existing: readonly string[],
): ParsedField | null {
  if (key.toLowerCase() === "id" || key === "_id") return null;

  const db_fieldName = sanitizeDbFieldName(key);
  const label = humanizeLabel(key);
  const field: ParsedField = { label, db_fieldName, widgetKey: "Input" };

  if (value === null || value === undefined) return field;

  if (typeof value === "boolean") {
    field.widgetKey = "Checkbox";
    return field;
  }

  if (typeof value === "number") {
    const inferred = inferByName(db_fieldName, existing);
    const isMoney = inferred.widgetKey === "Currency" || inferred.widgetKey === "Price";
    field.widgetKey = isMoney ? "Currency" : "Number";
    if (isMoney) field.defaults = { currency: "USD" };
    return field;
  }

  if (Array.isArray(value)) {
    const nonEmpty = value.filter((entry) => entry !== null && entry !== undefined);
    if (nonEmpty.length > 0 && nonEmpty.every((entry) => typeof entry === "string")) {
      field.widgetKey = "Tags";
    } else if (value.some((entry) => entry && typeof entry === "object" && !Array.isArray(entry))) {
      field.widgetKey = "Repeater";
      field.defaults = {
        relationCollection: resolveCollection(db_fieldName, existing),
        displayField: "name",
      };
    } else {
      field.widgetKey = "Repeater";
    }
    return field;
  }

  if (typeof value === "object") {
    field.widgetKey = "Relation";
    field.defaults = {
      relationCollection: resolveCollection(db_fieldName, existing),
      displayField: "name",
    };
    return field;
  }

  // Strings
  const asString = String(value);
  if (/^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}:\d{2})?/.test(asString)) {
    field.widgetKey = "DateTime";
    field.defaults = { includeTime: /[T ]\d{2}:\d{2}/.test(asString) };
    return field;
  }
  if (/^https?:\/\//i.test(asString)) {
    field.widgetKey = "Input";
    field.defaults = { type: "url" };
    return field;
  }

  const inferred = inferByName(db_fieldName, existing);
  field.widgetKey = inferred.widgetKey;
  if (Object.keys(inferred.defaults).length > 0) field.defaults = inferred.defaults;
  return field;
}

/**
 * Infer a SveltyCMS collection from a sample JSON payload.
 *
 * @param jsonStr - JSON object (or array of objects) as a string
 * @param fallbackName - Collection name when it cannot be derived from the payload
 * @param existingCollections - Known collection names, used to resolve relation targets
 */
export function parseJsonSample(
  jsonStr: string,
  fallbackName = "Sample Data",
  existingCollections: readonly string[] = [],
): ParsedSchemaResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonStr);
  } catch {
    throw new Error("Invalid JSON: Please provide a valid JSON object or array.");
  }

  const sample = Array.isArray(parsed) ? parsed[0] : parsed;
  if (!sample || typeof sample !== "object" || Array.isArray(sample)) {
    throw new Error("Invalid JSON: Expected a JSON object with key-value pairs.");
  }

  const fields: ParsedField[] = [];
  for (const [key, value] of Object.entries(sample as Record<string, unknown>)) {
    const field = buildJsonField(key, value, existingCollections);
    if (field) fields.push(field);
  }

  return {
    name: humanizeLabel(fallbackName),
    slug: fallbackName.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
    icon: "bi:file-earmark-code",
    fields,
  };
}

/**
 * Dispatch a schema-ingestion request to the correct parser.
 *
 * @throws {Error} When the SQL/JSON payload is invalid.
 */
export function parseSchemaInput(input: SchemaIngestionInput): ParsedSchemaResult {
  const existing = input.existingCollections ?? [];
  if (input.mode === "sql") return parseSqlDDL(input.payload, existing);
  if (input.mode === "json") return parseJsonSample(input.payload, input.collectionName, existing);
  throw new Error(`Unsupported schema-ingestion mode: ${String(input.mode)}`);
}
