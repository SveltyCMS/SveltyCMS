/**
 * @file src/plugins/smart-importer/csv-detect.ts
 * @description Lightweight CSV/TSV detection for the migration wizard upload step.
 *
 * The wizard only needs the header row to classify a generic spreadsheet and
 * propose a field mapping; the full parse happens later in `parsers/universal`.
 * Kept pure so the detection contract is unit-testable without a 15 MB upload.
 *
 * ### Features:
 * - delimiter sniffing (comma, semicolon, tab, pipe) and quoted-header parsing
 * - header → target-field inference (English + common German column names)
 * - identity fallback so every column survives the scaffold
 * - quote-aware record splitting shared with `parsers/universal` (multi-line cells)
 * - approximate row count without materialising the whole file as an array
 */

export interface CsvFieldMapping {
  source: string;
  target: string;
  confidence: number;
  type: string;
}

export interface CsvDetection {
  delimiter: string;
  headers: string[];
  mappings: CsvFieldMapping[];
  estimatedCount: number;
}

interface TargetRule {
  target: string;
  type: string;
  confidence: number;
  aliases: string[];
}

const TARGET_RULES: TargetRule[] = [
  {
    target: "title",
    type: "text",
    confidence: 92,
    aliases: ["title", "name", "headline", "subject", "titel", "ueberschrift"],
  },
  {
    target: "slug",
    type: "text",
    confidence: 90,
    aliases: ["slug", "url", "path", "permalink", "uri", "pfad"],
  },
  {
    target: "content",
    type: "richtext",
    confidence: 88,
    aliases: ["content", "body", "text", "description", "beschreibung", "inhalt", "html"],
  },
  {
    target: "excerpt",
    type: "text",
    confidence: 82,
    aliases: ["excerpt", "summary", "teaser", "intro", "lead", "auszug"],
  },
  {
    target: "status",
    type: "select",
    confidence: 82,
    aliases: ["status", "state", "published", "visible", "sichtbar"],
  },
  {
    target: "createdAt",
    type: "date",
    confidence: 84,
    aliases: [
      "created",
      "createdat",
      "created_at",
      "date",
      "datum",
      "publishedat",
      "published_at",
      "date_created",
    ],
  },
  {
    target: "updatedAt",
    type: "date",
    confidence: 82,
    aliases: ["updated", "updatedat", "updated_at", "modified", "changed", "geaendert"],
  },
  {
    target: "author",
    type: "text",
    confidence: 82,
    aliases: ["author", "author_name", "byline", "creator", "autor"],
  },
  {
    target: "featuredImage",
    type: "media",
    confidence: 80,
    aliases: ["image", "image_url", "thumbnail", "cover", "featured", "bild"],
  },
  {
    target: "tags",
    type: "taxonomy",
    confidence: 82,
    aliases: ["tags", "keywords", "schlagworte"],
  },
  {
    target: "categories",
    type: "taxonomy",
    confidence: 80,
    aliases: ["category", "categories", "kategorie", "kategorien", "section"],
  },
  {
    target: "language",
    type: "text",
    confidence: 80,
    aliases: ["language", "locale", "lang", "sprache"],
  },
];

/** Strip BOM, diacritics, case, and punctuation so header matching is stable. */
function normalizeHeader(header: string): string {
  return header
    .replace(/^\uFEFF/, "")
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

/** Parse one delimited row, honouring quoted fields and doubled quotes. */
export function parseDelimitedRow(line: string, delimiter: string): string[] {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (char === delimiter && !inQuotes) {
      cells.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }
  cells.push(current.trim());
  return cells;
}

/** Pick the delimiter that yields the most header columns (ties: comma first). */
export function detectDelimiter(headerLine: string): string | null {
  const candidates = [",", ";", "\t", "|"];
  let best: { delimiter: string; columns: number } | null = null;

  for (const delimiter of candidates) {
    const columns = parseDelimitedRow(headerLine, delimiter).length;
    if (columns > 1 && (!best || columns > best.columns)) {
      best = { delimiter, columns };
    }
  }

  return best?.delimiter ?? null;
}

/**
 * Split delimited text into rows, honouring quoted fields.
 *
 * Unlike `text.split(/\r?\n/)`, a newline inside a quoted cell stays part of
 * that cell — report exports routinely embed line breaks in description fields.
 * Cells are trimmed and a trailing newline does not produce an empty row.
 */
export function splitDelimitedRows(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let cells: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    if (char === '"') {
      if (inQuotes && text[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (!inQuotes && (char === "\n" || char === "\r")) {
      if (char === "\r" && text[i + 1] === "\n") i++;
      cells.push(current.trim());
      rows.push(cells);
      cells = [];
      current = "";
      continue;
    }

    if (char === delimiter && !inQuotes) {
      cells.push(current.trim());
      current = "";
      continue;
    }

    current += char;
  }

  if (current !== "" || cells.length > 0) {
    cells.push(current.trim());
    rows.push(cells);
  }

  return rows;
}

/** Approximate data-row count without splitting the file into an array. */
export function countCsvRows(text: string, hasTrailingNewline = true): number {
  let records = 0;
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text.charCodeAt(i);
    if (char === 34 /* " */) {
      // A doubled quote escapes itself inside a quoted cell.
      if (inQuotes && text.charCodeAt(i + 1) === 34) {
        i++;
        continue;
      }
      inQuotes = !inQuotes;
      continue;
    }
    if (char === 10 /* \n */ && !inQuotes) records++;
  }

  return Math.max(0, records + (hasTrailingNewline ? 0 : 1) - 1);
}

function inferMappings(headers: string[]): CsvFieldMapping[] {
  const usedTargets = new Set<string>();

  return headers.map((header) => {
    const normalized = normalizeHeader(header);

    for (const rule of TARGET_RULES) {
      if (usedTargets.has(rule.target)) continue;

      const exact = rule.aliases.includes(normalized);
      const partial = !exact && rule.aliases.some((alias) => normalized.includes(alias));
      if (!exact && !partial) continue;

      usedTargets.add(rule.target);
      return {
        source: header,
        target: rule.target,
        confidence: exact ? rule.confidence : Math.max(50, rule.confidence - 12),
        type: rule.type,
      };
    }

    // Keep unknown columns as their own field instead of dropping them.
    return { source: header, target: normalized || header, confidence: 55, type: "text" };
  });
}

/**
 * Detect a generic spreadsheet from its text. Returns `null` when no line looks
 * like a delimited header (single-column files, JSON, XML, …).
 *
 * Scans the first non-empty lines so exports with a report title / metadata
 * preamble before the real header still classify correctly.
 */
export function detectCsv(text: string, preferredDelimiter?: string): CsvDetection | null {
  const sample = text.slice(0, 65_536);
  const lines = sample.split(/\r?\n/).slice(0, 20);

  let best: { index: number; line: string; delimiter: string; columns: number } | null = null;
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    if (!line.trim()) continue;

    const delimiter = preferredDelimiter ?? detectDelimiter(line);
    if (!delimiter) continue;

    const columns = parseDelimitedRow(line, delimiter).length;
    if (columns >= 2 && (!best || columns > best.columns)) {
      best = { index, line, delimiter, columns };
    }
  }

  if (!best) return null;

  const headers = parseDelimitedRow(best.line, best.delimiter)
    .map((header) => header.replace(/^\uFEFF/, "").trim())
    .filter(Boolean);
  if (headers.length < 2) return null;

  return {
    delimiter: best.delimiter,
    headers,
    mappings: inferMappings(headers),
    estimatedCount: Math.max(0, countCsvRows(text, /\r?\n$/.test(text)) - best.index),
  };
}
