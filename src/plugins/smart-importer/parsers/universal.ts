/**
 * @file src/plugins/smart-importer/parsers/universal.ts
 * @description Universal data ingestion parsers for non-CMS data sources.
 *
 * Extends the SNC pipeline beyond CMS-to-CMS migration to handle:
 * - Spreadsheets: CSV, TSV, Excel (.xlsx), Google Sheets exports
 * - Static sites: Markdown + YAML frontmatter, JSON data files
 * - Databases: SQL dumps (MySQL, PostgreSQL, SQLite), MongoDB exports
 * - APIs: REST JSON responses, GraphQL query results, webhook payloads
 * - Documents: Notion exports, Airtable bases, Confluence spaces
 * - E-commerce: CSV product catalogs, order exports, inventory sheets
 * - Forms: Typeform, Google Forms, SurveyMonkey responses
 * - Analytics: Event logs, metrics CSVs, tracking data
 *
 * All parsers produce SNCEnvelope for unified ingestion through the UCP.
 */

import { nowISODateString } from "@utils/date";
import type { SNCEnvelope, SNCEntry } from "../types";

// ============================================================================
// 1. CSV / TSV / Spreadsheet Parser
// ============================================================================

/**
 * Universal CSV/TSV parser with automatic delimiter detection,
 * header inference, and type guessing per column.
 *
 * Handles:
 * - Standard CSV (comma-delimited)
 * - TSV (tab-delimited)
 * - Custom delimiters (semicolon, pipe)
 * - Quoted fields with embedded delimiters
 * - Google Sheets exports
 * - Excel CSV exports (BOM-aware)
 */
export function parseSpreadsheet(
  text: string,
  transactionToken: string,
  options?: {
    delimiter?: string; // Auto-detect if not specified
    hasHeader?: boolean; // Default: true
    sheetName?: string; // For multi-sheet awareness
    skipRows?: number; // Skip leading rows
  },
): SNCEnvelope | null {
  try {
    const opts = { hasHeader: true, skipRows: 0, ...options };

    // Remove BOM if present (Excel CSV exports)
    const clean = text.replace(/^\uFEFF/, "");
    const lines = clean.split(/\r?\n/).filter((l) => l.trim());

    if (lines.length < 1) return null;

    // Auto-detect delimiter
    const delimiter = opts.delimiter || detectDelimiter(lines[0]);

    // Parse headers
    let headers: string[];
    let dataStart = opts.skipRows;

    if (opts.hasHeader) {
      headers = parseCSVLine(lines[dataStart], delimiter);
      dataStart++;
    } else {
      // Generate column names
      const firstRow = parseCSVLine(lines[dataStart], delimiter);
      headers = firstRow.map((_, i) => `column_${i + 1}`);
    }

    // Infer types from first 100 rows
    const typeSamples: Record<string, string[]> = {};
    const sampleRows = lines.slice(dataStart, dataStart + 100);
    for (const row of sampleRows) {
      const values = parseCSVLine(row, delimiter);
      for (let i = 0; i < Math.min(headers.length, values.length); i++) {
        if (!typeSamples[headers[i]]) typeSamples[headers[i]] = [];
        typeSamples[headers[i]].push(values[i]);
      }
    }

    const columnTypes: Record<string, string> = {};
    for (const [col, samples] of Object.entries(typeSamples)) {
      columnTypes[col] = inferColumnType(samples);
    }

    const _sheetLabel = opts.sheetName;
    const entries: SNCEntry[] = [];

    for (let i = dataStart; i < lines.length; i++) {
      const values = parseCSVLine(lines[i], delimiter);
      if (values.every((v) => !v)) continue;

      const raw: Record<string, unknown> = {};
      for (let j = 0; j < headers.length; j++) {
        raw[headers[j]] = values[j] || "";
      }

      // Auto-detect title field
      const title = findTitleField(raw, headers, columnTypes);
      // Auto-detect slug from title or URL field
      const slug = findSlugField(raw, headers);

      entries.push({
        externalId: `csv_${i}_${transactionToken.slice(0, 8)}`,
        title,
        slug,
        status: "draft",
        content: buildContentFromRow(raw, headers, columnTypes),
        createdAt: nowISODateString(),
        taxonomies: { vocabularies: [], terms: {} },
        rawCustomFields: {
          ...raw,
          _sourceFormat: "csv",
          _columnTypes: columnTypes,
        },
        assetsToMirror: findAssetUrls(raw),
      });
    }

    return {
      sourcePlatform: "csv",
      version: "1.0",
      transactionToken,
      entries,
    };
  } catch {
    return null;
  }
}

function detectDelimiter(headerLine: string): string {
  const candidates = [
    { char: "\t", name: "tab" },
    { char: ",", name: "comma" },
    { char: ";", name: "semicolon" },
    { char: "|", name: "pipe" },
  ];

  for (const { char } of candidates) {
    if (headerLine.includes(char)) return char;
  }
  return ",";
}

function parseCSVLine(line: string, delimiter: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (const ch of line) {
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === delimiter && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

function inferColumnType(samples: string[]): string {
  const nonEmpty = samples.filter((s) => s.trim());
  if (nonEmpty.length === 0) return "text";

  // Check for URLs
  if (nonEmpty.every((s) => s.startsWith("http://") || s.startsWith("https://"))) return "url";

  // Check for numbers
  if (nonEmpty.every((s) => !isNaN(Number(s)) && s.trim() !== "")) return "number";

  // Check for dates (ISO format)
  if (nonEmpty.every((s) => /^\d{4}-\d{2}-\d{2}/.test(s))) return "date";

  // Check for booleans
  if (nonEmpty.every((s) => ["true", "false", "yes", "no", "0", "1"].includes(s.toLowerCase())))
    return "boolean";

  // Check for emails
  if (nonEmpty.every((s) => s.includes("@") && s.includes("."))) return "email";

  // Check for JSON
  if (
    nonEmpty.some((s) => {
      try {
        JSON.parse(s);
        return true;
      } catch {
        return false;
      }
    })
  )
    return "json";

  return "text";
}

function findTitleField(
  raw: Record<string, unknown>,
  headers: string[],
  types: Record<string, string>,
): string {
  const titleKeys = [
    "title",
    "name",
    "label",
    "heading",
    "subject",
    "product_name",
    "item",
    "description",
  ];
  for (const key of titleKeys) {
    const match = headers.find((h) => h.toLowerCase().includes(key));
    if (match && raw[match]) return String(raw[match]);
  }
  // Fallback: first non-empty text field
  for (const h of headers) {
    if (types[h] === "text" && raw[h]) return String(raw[h]);
  }
  return "Untitled Row";
}

function findSlugField(raw: Record<string, unknown>, headers: string[]): string {
  const slugKeys = ["slug", "handle", "url", "path", "permalink", "link", "id", "key"];
  for (const key of slugKeys) {
    const match = headers.find((h) => h.toLowerCase().includes(key));
    if (match && raw[match]) return slugify(String(raw[match]));
  }
  return "";
}

function buildContentFromRow(
  raw: Record<string, unknown>,
  headers: string[],
  types: Record<string, string>,
): string {
  const contentKeys = [
    "content",
    "body",
    "description",
    "text",
    "summary",
    "notes",
    "details",
    "message",
    "comment",
  ];
  for (const key of contentKeys) {
    const match = headers.find((h) => h.toLowerCase().includes(key));
    if (match && raw[match] && types[match] === "text") return String(raw[match]);
  }
  // Fallback: concatenate all text fields
  const texts = headers
    .filter(
      (h) => types[h] === "text" && raw[h] && !["title", "name", "slug"].includes(h.toLowerCase()),
    )
    .map((h) => `**${h}**: ${raw[h]}`);
  return texts.join("\n\n") || "";
}

function findAssetUrls(raw: Record<string, unknown>): SNCEntry["assetsToMirror"] {
  const assets: SNCEntry["assetsToMirror"] = [];
  const imageKeys = [
    "image",
    "photo",
    "picture",
    "thumbnail",
    "avatar",
    "logo",
    "banner",
    "cover",
    "attachment",
    "file",
    "url",
    "link",
    "src",
  ];
  for (const [key, value] of Object.entries(raw)) {
    const val = String(value);
    if (
      (val.startsWith("http://") || val.startsWith("https://")) &&
      (imageKeys.some((ik) => key.toLowerCase().includes(ik)) ||
        /\.(jpg|jpeg|png|gif|webp|svg|pdf|mp4|mov|avi)(\?|$)/i.test(val))
    ) {
      assets.push({ externalUrl: val, originalId: key, fieldTarget: key });
    }
  }
  return assets;
}

// ============================================================================
// 2. Markdown + YAML Frontmatter Parser
// ============================================================================

/**
 * Parses Markdown files with optional YAML frontmatter (Jekyll/Hugo/Gatsby/Next.js style).
 * Supports directory trees: each .md file becomes an SNCEntry.
 */
export function parseMarkdownFiles(
  files: Array<{ path: string; content: string }>,
  transactionToken: string,
): SNCEnvelope | null {
  try {
    const entries: SNCEntry[] = [];

    for (const file of files) {
      const { frontmatter, body } = extractFrontmatter(file.content);

      const title =
        frontmatter?.title ||
        frontmatter?.name ||
        file.path
          .split("/")
          .pop()
          ?.replace(/\.(md|mdx|markdown)$/, "") ||
        "Untitled";

      const slug = frontmatter?.slug || frontmatter?.permalink || slugify(title);

      entries.push({
        externalId: file.path,
        title: String(title),
        slug,
        status:
          frontmatter?.draft === true
            ? "draft"
            : frontmatter?.published === false
              ? "draft"
              : "published",
        content: body,
        excerpt: frontmatter?.excerpt || frontmatter?.description || body.slice(0, 200),
        createdAt:
          frontmatter?.date || frontmatter?.createdAt || frontmatter?.created || nowISODateString(),
        updatedAt:
          frontmatter?.updatedAt ||
          frontmatter?.updated ||
          frontmatter?.lastmod ||
          nowISODateString(),
        authorName: frontmatter?.author || "",
        taxonomies: {
          vocabularies: ["tags", "categories"],
          terms: {
            tags: Array.isArray(frontmatter?.tags)
              ? frontmatter.tags.map(String)
              : frontmatter?.tags
                ? String(frontmatter.tags)
                    .split(",")
                    .map((s: string) => s.trim())
                : [],
            categories: Array.isArray(frontmatter?.categories)
              ? frontmatter.categories.map(String)
              : frontmatter?.category
                ? [String(frontmatter.category)]
                : [],
          },
        },
        rawCustomFields: {
          ...frontmatter,
          _sourceFormat: "markdown",
          _sourcePath: file.path,
        },
        assetsToMirror: frontmatter?.image
          ? [
              {
                externalUrl: String(frontmatter.image),
                originalId: file.path,
                fieldTarget: "featuredImage",
                altText: frontmatter?.image_alt || "",
              },
            ]
          : [],
      });
    }

    return {
      sourcePlatform: "markdown",
      version: "1.0",
      transactionToken,
      entries,
    };
  } catch {
    return null;
  }
}

function extractFrontmatter(content: string): {
  frontmatter: Record<string, any> | null;
  body: string;
} {
  // YAML frontmatter between --- markers
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (match) {
    try {
      const frontmatter = parseSimpleYAML(match[1]);
      return { frontmatter, body: match[2].trim() };
    } catch {
      return { frontmatter: null, body: content };
    }
  }

  // TOML frontmatter (Hugo): +++
  const tomlMatch = content.match(/^\+\+\+\r?\n([\s\S]*?)\r?\n\+\+\+\r?\n([\s\S]*)$/);
  if (tomlMatch) {
    return { frontmatter: { _toml: tomlMatch[1] }, body: tomlMatch[2].trim() };
  }

  // JSON frontmatter: { ... }
  const jsonMatch = content.match(/^\{[\s\S]*?\}\r?\n([\s\S]*)$/);
  if (jsonMatch) {
    try {
      return {
        frontmatter: JSON.parse(jsonMatch[0]),
        body: jsonMatch[1].trim(),
      };
    } catch {
      return { frontmatter: null, body: content };
    }
  }

  return { frontmatter: null, body: content };
}

function parseSimpleYAML(yaml: string): Record<string, any> {
  const result: Record<string, any> = {};
  const lines = yaml.split("\n");

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const colonIdx = trimmed.indexOf(":");
    if (colonIdx === -1) continue;

    const key = trimmed.slice(0, colonIdx).trim();
    let value = trimmed.slice(colonIdx + 1).trim();
    value = value.replace(/^['"]|['"]$/g, "");

    // Handle arrays (lines starting with - )
    if (value === "") {
      result[key] = [];
    } else if (value === "true") {
      result[key] = true;
    } else if (value === "false") {
      result[key] = false;
    } else if (/^\d+$/.test(value)) {
      result[key] = parseInt(value);
    } else if (/^\d+\.\d+$/.test(value)) {
      result[key] = parseFloat(value);
    } else {
      result[key] = value;
    }
  }

  // Handle array items
  let inArray: string | null = null;
  for (const line of lines) {
    const arrayMatch = line.match(/^\s+-\s+(.+)$/);
    if (arrayMatch) {
      if (inArray && result[inArray]) {
        (result[inArray] as string[]).push(arrayMatch[1]);
      }
    } else {
      inArray = null;
    }
    const keyMatch = line.match(/^(\w[\w\s]*):\s*$/);
    if (keyMatch) {
      inArray = keyMatch[1];
      if (!result[inArray]) result[inArray] = [];
    }
  }

  return result;
}

// ============================================================================
// 3. SQL Dump Parser
// ============================================================================

/**
 * Parses SQL INSERT statements from database dumps.
 * Handles MySQL, PostgreSQL, and SQLite dump formats.
 */
export function parseSQLDump(
  sqlText: string,
  transactionToken: string,
  options?: { tableName?: string },
): SNCEnvelope | null {
  try {
    const entries: SNCEntry[] = [];
    let platform: SNCEnvelope["sourcePlatform"] = "sql";

    // Detect dialect
    if (sqlText.includes("CREATE TABLE") && sqlText.includes("AUTO_INCREMENT")) platform = "mysql";
    else if (sqlText.includes("CREATE TABLE") && sqlText.includes("SERIAL"))
      platform = "postgresql";
    else if (sqlText.includes("CREATE TABLE") && sqlText.includes("INTEGER PRIMARY KEY"))
      platform = "sqlite";

    // Find INSERT statements
    const insertRegex = /INSERT\s+INTO\s+`?(\w+)`?\s*\(([\s\S]*?)\)\s*VALUES\s*([\s\S]*?);/gi;
    let match: RegExpExecArray | null;

    while ((match = insertRegex.exec(sqlText)) !== null) {
      const tableName = match[1];
      if (options?.tableName && tableName !== options.tableName) continue;

      const columns = match[2].split(",").map((c) => c.replace(/[`"\s]/g, "").trim());
      const valuesBlock = match[3];
      const columnTypes = detectSQLColumnTypes(sqlText, tableName, columns);

      // Parse value tuples: (val1, val2), (val3, val4)
      const tupleRegex = /\(([^)]+)\)/g;
      let tupleMatch: RegExpExecArray | null;
      let idx = 0;

      while ((tupleMatch = tupleRegex.exec(valuesBlock)) !== null) {
        const rawValues = tupleMatch[1].split(",").map((v) =>
          v
            .trim()
            .replace(/^['"]|['"]$/g, "")
            .replace(/\\'/g, "'")
            .replace(/\\"/g, '"'),
        );

        const raw: Record<string, unknown> = {};
        for (let i = 0; i < columns.length; i++) {
          raw[columns[i]] = rawValues[i] || null;
        }

        const titleKey =
          columns.find((c) => ["title", "name", "label", "subject"].includes(c.toLowerCase())) ||
          columns[1];
        const idKey =
          columns.find((c) => ["id", "_id", "uuid", "guid"].includes(c.toLowerCase())) ||
          columns[0];

        entries.push({
          externalId: `sql_${tableName}_${raw[idKey] || idx}`,
          title: String(raw[titleKey] || `Row ${idx + 1}`),
          slug: slugify(String(raw[titleKey] || `row-${idx + 1}`)),
          status: "draft",
          content: columns.find((c) =>
            ["content", "body", "description", "text"].includes(c.toLowerCase()),
          )
            ? String(
                raw[
                  columns.find((c) =>
                    ["content", "body", "description", "text"].includes(c.toLowerCase()),
                  )!
                ] || "",
              )
            : "",
          createdAt: raw["created_at"]
            ? String(raw["created_at"])
            : raw["createdAt"]
              ? String(raw["createdAt"])
              : nowISODateString(),
          updatedAt: raw["updated_at"]
            ? String(raw["updated_at"])
            : raw["updatedAt"]
              ? String(raw["updatedAt"])
              : nowISODateString(),
          taxonomies: { vocabularies: [], terms: {} },
          rawCustomFields: {
            ...raw,
            _sourceFormat: "sql",
            _sourceTable: tableName,
            _columnTypes: columnTypes,
          },
          assetsToMirror: [],
        });
        idx++;
      }
    }

    return {
      sourcePlatform: platform,
      version: "1.0",
      transactionToken,
      entries,
    };
  } catch {
    return null;
  }
}

function detectSQLColumnTypes(
  sqlText: string,
  tableName: string,
  columns: string[],
): Record<string, string> {
  const types: Record<string, string> = {};
  const createRegex = new RegExp(
    `CREATE\\s+TABLE\\s+\`?${tableName}\`?\\s*\\(([\\s\\S]*?)\\);`,
    "i",
  );
  const match = createRegex.exec(sqlText);

  if (match) {
    const colDefs = match[1].split(",");
    for (const def of colDefs) {
      for (const col of columns) {
        const colRegex = new RegExp(`\`?${col}\`?\\s+(\\w+)`, "i");
        const colMatch = colRegex.exec(def.trim());
        if (colMatch) {
          const sqlType = colMatch[1].toLowerCase();
          if (
            sqlType.includes("int") ||
            sqlType.includes("float") ||
            sqlType.includes("double") ||
            sqlType.includes("decimal") ||
            sqlType.includes("numeric")
          )
            types[col] = "number";
          else if (
            sqlType.includes("date") ||
            sqlType.includes("time") ||
            sqlType.includes("timestamp")
          )
            types[col] = "date";
          else if (sqlType.includes("bool")) types[col] = "boolean";
          else if (sqlType.includes("json") || sqlType.includes("jsonb")) types[col] = "json";
          else types[col] = "text";
        }
      }
    }
  }

  // Fill in missing types
  for (const col of columns) {
    if (!types[col]) types[col] = "text";
  }

  return types;
}

// ============================================================================
// 4. REST/GraphQL API Fetcher
// ============================================================================

/**
 * Fetches data from a REST API or GraphQL endpoint and converts to SNC.
 * Supports pagination, authentication, and response transformation.
 */
export async function fetchFromAPI(
  config: {
    url: string;
    method?: string;
    headers?: Record<string, string>;
    body?: any;
    pagination?: {
      type: "offset" | "cursor" | "page";
      param: string;
      limit?: number;
    };
    dataPath?: string; // JSONPath to data array (e.g., 'data', 'results', 'items')
    fieldMapping?: Record<string, string>; // source → target field names
    isGraphQL?: boolean;
    query?: string; // GraphQL query
  },
  transactionToken: string,
): Promise<SNCEnvelope | null> {
  try {
    const allItems: any[] = [];
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...config.headers,
    };

    // GraphQL mode
    if (config.isGraphQL && config.query) {
      const response = await fetch(config.url, {
        method: "POST",
        headers,
        body: JSON.stringify({ query: config.query }),
      });
      const result = await response.json();
      const items = extractDataArray(result, config.dataPath || "data");
      allItems.push(...items);
    }
    // REST mode with optional pagination
    else {
      let page = 1;
      let hasMore = true;

      while (hasMore && allItems.length < (config.pagination?.limit || 10000)) {
        let url = config.url;

        if (config.pagination) {
          const separator = url.includes("?") ? "&" : "?";
          if (config.pagination.type === "offset") {
            url += `${separator}${config.pagination.param}=${allItems.length}`;
          } else if (config.pagination.type === "page") {
            url += `${separator}${config.pagination.param}=${page}`;
          }
        }

        const response = await fetch(url, {
          method: config.method || "GET",
          headers,
          body: config.method === "POST" ? JSON.stringify(config.body) : undefined,
        });

        if (!response.ok) break;

        const result = await response.json();
        const items = extractDataArray(result, config.dataPath || "data");

        if (items.length === 0) {
          hasMore = false;
        } else {
          allItems.push(...items);
          page++;
        }
      }
    }

    const fieldMap = config.fieldMapping || {};
    const entries: SNCEntry[] = allItems.map((item: any, idx: number) => ({
      externalId: String(item.id || item._id || item.uuid || `api_${idx}`),
      title: String(
        item[fieldMap.title || "title"] ||
          item.title ||
          item.name ||
          item.label ||
          `Item ${idx + 1}`,
      ),
      slug: slugify(String(item[fieldMap.slug || "slug"] || item.slug || item.handle || "")),
      status: "draft",
      content: String(
        item[fieldMap.content || "content"] || item.content || item.body || item.description || "",
      ),
      excerpt: String(item[fieldMap.excerpt || "excerpt"] || item.excerpt || item.summary || ""),
      createdAt: item.createdAt || item.created_at || item.date_created || nowISODateString(),
      updatedAt: item.updatedAt || item.updated_at || item.date_updated || nowISODateString(),
      taxonomies: { vocabularies: [], terms: {} },
      rawCustomFields: {
        ...item,
        _sourceFormat: "api",
        _sourceUrl: config.url,
      },
      assetsToMirror: findAssetUrls(item),
    }));

    return {
      sourcePlatform: "api",
      version: "1.0",
      transactionToken,
      entries,
    };
  } catch {
    return null;
  }
}

function extractDataArray(response: any, path: string): any[] {
  const parts = path.split(".");
  let current = response;
  for (const part of parts) {
    if (current == null) return [];
    current = current[part];
  }
  return Array.isArray(current) ? current : current ? [current] : [];
}

// ============================================================================
// 5. JSON Data File Parser (Airtable, Notion, Firebase, etc.)
// ============================================================================

/**
 * Handles JSON exports from various SaaS tools:
 * - Airtable: { records: [{ id, fields: {...}, createdTime }] }
 * - Notion: { results: [{ id, properties: {...} }] }
 * - Firebase: { "-Nx123": { ... }, "-Nx456": { ... } }
 * - MongoDB: [{ _id: ObjectId("..."), ... }]
 */
export function parseJSONDatabase(
  jsonText: string,
  transactionToken: string,
  sourceName: string = "json",
): SNCEnvelope | null {
  try {
    const data = JSON.parse(jsonText);
    let items: any[] = [];

    // Detect format
    if (data.records && Array.isArray(data.records)) {
      // Airtable
      items = data.records.map((r: any) => ({
        id: r.id,
        ...r.fields,
        _createdTime: r.createdTime,
      }));
    } else if (data.results && Array.isArray(data.results)) {
      // Notion
      items = data.results.map((r: any) => extractNotionProperties(r));
    } else if (typeof data === "object" && !Array.isArray(data)) {
      // Firebase Realtime DB (key-value object)
      items = Object.entries(data).map(([key, value]) => ({
        id: key,
        ...(value as any),
      }));
    } else if (Array.isArray(data)) {
      // Plain array / MongoDB export
      items = data;
    } else if (data.data && Array.isArray(data.data)) {
      items = data.data;
    }

    const entries: SNCEntry[] = items.map((item: any, idx: number) => {
      const cleanItem = cleanMongoDBItem(item);
      return {
        externalId: String(
          cleanItem.id || cleanItem._id || cleanItem.key || `${sourceName}_${idx}`,
        ),
        title: String(cleanItem.title || cleanItem.name || cleanItem.label || `Item ${idx + 1}`),
        slug: slugify(String(cleanItem.title || cleanItem.name || `item-${idx + 1}`)),
        status: "draft",
        content: String(
          cleanItem.content || cleanItem.body || cleanItem.description || cleanItem.text || "",
        ),
        createdAt:
          cleanItem.createdAt ||
          cleanItem.created_at ||
          cleanItem._createdTime ||
          nowISODateString(),
        updatedAt: cleanItem.updatedAt || cleanItem.updated_at || nowISODateString(),
        taxonomies: { vocabularies: [], terms: {} },
        rawCustomFields: { ...cleanItem, _sourceFormat: sourceName },
        assetsToMirror: findAssetUrls(cleanItem),
      };
    });

    return {
      sourcePlatform: sourceName as any,
      version: "1.0",
      transactionToken,
      entries,
    };
  } catch {
    return null;
  }
}

function extractNotionProperties(page: any): Record<string, any> {
  const result: Record<string, any> = {
    id: page.id,
    _createdTime: page.created_time,
    _lastEditedTime: page.last_edited_time,
  };

  if (page.properties) {
    for (const [key, prop] of Object.entries(page.properties)) {
      const p = prop as any;
      if (p.type === "title") result[key] = p.title?.map((t: any) => t.plain_text).join("") || "";
      else if (p.type === "rich_text")
        result[key] = p.rich_text?.map((t: any) => t.plain_text).join("") || "";
      else if (p.type === "number") result[key] = p.number;
      else if (p.type === "select") result[key] = p.select?.name;
      else if (p.type === "multi_select")
        result[key] = p.multi_select?.map((s: any) => s.name) || [];
      else if (p.type === "date") result[key] = p.date?.start;
      else if (p.type === "checkbox") result[key] = p.checkbox;
      else if (p.type === "url") result[key] = p.url;
      else if (p.type === "email") result[key] = p.email;
      else if (p.type === "phone_number") result[key] = p.phone_number;
      else if (p.type === "files")
        result[key] = p.files?.map((f: any) => f.file?.url || f.external?.url).filter(Boolean);
      else result[key] = JSON.stringify(p);
    }
  }

  return result;
}

function cleanMongoDBItem(item: any): any {
  // Handle MongoDB ObjectId and ISODate
  const cleaned: any = {};
  for (const [key, value] of Object.entries(item)) {
    if (value && typeof value === "object") {
      if ((value as any).$oid) cleaned[key] = (value as any).$oid;
      else if ((value as any).$date) cleaned[key] = (value as any).$date;
      else if ((value as any).$numberLong) cleaned[key] = Number((value as any).$numberLong);
      else cleaned[key] = value;
    } else {
      cleaned[key] = value;
    }
  }
  return cleaned;
}

// ============================================================================
// Helpers
// ============================================================================

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100);
}
